import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'pokemon',
  component: 'AbovePrompt',
  requestId: 'band',
  viewport: { columns: 120, rows: 40 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const THEIRS = { type: 'Text', props: {}, children: ['drawn by Claude Code'] }

// The strip is 40 columns, and the meters are text to its right
const STRIP = 40
const RASTER = 40

function codePoints(cells: string): number[] {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  return Array.from(words).filter((_, i) => i % 3 === 0)
}

// Whether any cell paints a given color, as a foreground or a background
function paints(cells: string, color: number): boolean {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  return Array.from(words).some((w, i) => i % 3 !== 0 && w === color)
}

test('draws Abra by default as a half-block raster in the terminal band', async ($, on) => {
  on('ui.render', () => THEIRS)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const raster = await ui.find({ key: 'pokemon' })
  expect(raster).toBeDefined()
  expect(raster.props.columns).toBe(RASTER)
  expect(raster.props.rows).toBe(11)
  expect(codePoints(raster.props.cells)).toContain(0x2580)
})

test('leaves the band alone on desktop and during a survey', async ($, on) => {
  on('ui.render', () => THEIRS)
  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ key: 'pokemon' })).toBeUndefined()
  await desktop.unmount()
  const survey = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, hasSurvey: true } })
  expect(await survey.find({ key: 'pokemon' })).toBeUndefined()
})

test('paces while Claude works', async ($, on) => {
  const clock = mock.clock(on)
  const blits: string[] = []
  on('ui.render', () => THEIRS)
  on('ui.blit', ($, e) => {
    blits.push(e.cells)
    return { value: {} }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  await clock.advance(50 * 30)
  expect(blits.length).toBe(30)
  expect(new Set(blits).size).toBeGreaterThan(5)
})

test('/pokemon switches the mon and the variant, and saves both', async ($, on) => {
  mock.clock(on)
  const saved = new Map<string, unknown>()
  on('ui.render', () => THEIRS)
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })

  const mon = await $.command.run({ command: 'pokemon', args: 'bulbasaur' })
  expect(mon.text).toBe('Now showing default bulbasaur.')
  const shiny = await $.command.run({ command: 'pokemon', args: 'shiny' })
  expect(shiny.text).toBe('Now showing shiny bulbasaur.')
  expect(saved.get('mon')).toBe('bulbasaur')
  expect(saved.get('variant')).toBe('shiny')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'pokemon' })).props.rows).toBe(10)
})

test('/pokemon rejects an unknown name', async ($, on) => {
  mock.clock(on)
  const answer = await $.command.run({ command: 'pokemon', args: 'togepi' })
  expect(answer.text).toMatch(/^Unknown option "togepi"/)
  expect(answer.text).not.toContain('bulbasaur')
})

test('/pokemon charmander draws Charmander', async ($, on) => {
  mock.clock(on)
  on('ui.render', () => THEIRS)
  on('store.set', () => ({ value: undefined }))
  const answer = await $.command.run({ command: 'pokemon', args: 'charmander' })
  expect(answer.text).toBe('Now showing default charmander.')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'pokemon' })).props.rows).toBe(10)
})

// The rightmost strip column that holds part of the sprite, ignoring the meters
function rightEdge(cells: string): number {
  const points = codePoints(cells)
  let edge = -1
  points.forEach((cp, i) => {
    if (cp !== 0x20 && i % RASTER < STRIP) edge = Math.max(edge, i % RASTER)
  })
  return edge
}

test('with wandering off, walks back to the right edge after a turn and idles there', async ($, on) => {
  const clock = mock.clock(on)
  const blits: string[] = []
  on('ui.render', () => THEIRS)
  on('ui.blit', ($, e) => {
    blits.push(e.cells)
    return { value: {} }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', ($, e) => ({ value: e.key === 'wander' ? false : undefined }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const idle = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const home = rightEdge((await idle.find({ key: 'pokemon' })).props.cells)
  await idle.unmount()

  const busy = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  await clock.advance(150 * 10)
  expect(rightEdge(blits[blits.length - 1])).toBeLessThan(home)
  await busy.unmount()

  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(150 * 40)
  expect(rightEdge(blits[blits.length - 1])).toBe(home)
})

// Fire session.start with the stubs it needs, and collect every blit
async function started($, on) {
  const clock = mock.clock(on)
  const blits: string[] = []
  on('ui.render', () => THEIRS)
  on('ui.blit', ($, e) => {
    blits.push(e.cells)
    return { value: {} }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  return { clock, blits }
}

const SPINNER = {
  plugin: 'pokemon',
  component: 'Spinner',
  requestId: 'main',
  viewport: BAND.viewport,
  props: { word: 'Thinking', message: 'Thinking', suffix: '…', mode: 'thinking' },
} as const

test('shows a thought bubble while Claude thinks', async ($, on) => {
  await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  const cells = (await ui.find({ key: 'pokemon' })).props.cells
  expect(paints(cells, 0xf0f0f0)).toBe(true)
  expect(paints(cells, 0x9a9ab0)).toBe(true)
})

test('hops when a turn ends', async ($, on) => {
  await started($, on)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const before = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const still = (await before.find({ key: 'pokemon' })).props.cells
  await before.unmount()

  await $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 1000, isAborted: false, usage: null })
  const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await after.find({ key: 'pokemon' })).props.cells).not.toBe(still)
})

test('falls asleep after five idle minutes', { timeoutMs: 30000 }, async ($, on) => {
  const { clock, blits } = await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(4 * 60 * 1000)
  expect(paints(blits[blits.length - 1], 0xe8e8ff)).toBe(false)
  await clock.advance(61 * 1000)
  expect(paints(blits[blits.length - 1], 0xe8e8ff)).toBe(true)
})

test('wanders while idle by default, and /pokemon wander sends it home', async ($, on) => {
  const { clock, blits } = await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const home = rightEdge((await ui.find({ key: 'pokemon' })).props.cells)

  await clock.advance(30 * 1000)
  expect(blits.some((cells) => rightEdge(cells) < home)).toBe(true)

  const answer = await $.command.run({ command: 'pokemon', args: 'wander' })
  expect(answer.text).toBe('abra is heading home.')
  await clock.advance(10 * 1000)
  expect(rightEdge(blits[blits.length - 1])).toBe(home)
})

test('/pokemon pet sends hearts up, then they fade', async ($, on) => {
  const { clock, blits } = await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...BAND, surface: 'terminal' })

  const answer = await $.command.run({ command: 'pokemon', args: 'pet' })
  expect(answer.text).toMatch(/^abra .+ ❤ \(pets: 1\)$/)
  const hearty = (cells: string) => paints(cells, 0xff4f8b)
  await clock.advance(400)
  expect(hearty(blits[blits.length - 1])).toBe(true)
  await clock.advance(8000)
  expect(hearty(blits[blits.length - 1])).toBe(false)
})

// Whether any cell paints a berry's body color, as a foreground or a background
const BERRY_BODIES = [0x4a63d8, 0xf48fb1, 0xd81b60, 0xfdd835]
function hasBerry(cells: string): boolean {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  return Array.from(words).some((w, i) => i % 3 !== 0 && BERRY_BODIES.includes(w))
}

test('/pokemon feed drops a random berry, the mon walks over and eats it, then says yum', async ($, on) => {
  const { clock, blits } = await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...BAND, surface: 'terminal' })

  const answer = await $.command.run({ command: 'pokemon', args: 'feed' })
  expect(answer.text).toMatch(/^You toss abra (an oran|a pecha|a razz|a sitrus) berry \S+ \(feeds: 1\)$/u)
  const busy = await $.command.run({ command: 'pokemon', args: 'feed' })
  expect(busy.text).toBe('abra is still busy with the last one.')

  await clock.advance(1000)
  expect(hasBerry(blits[blits.length - 1])).toBe(true)

  // Long enough to land, walk the whole strip, eat, and say "yum!"
  const seen = blits.length
  await clock.advance(150 * 40 + 2000)
  const later = blits.slice(seen)
  expect(later.some((cells) => paints(cells, 0xffd54f))).toBe(true)
  expect(hasBerry(blits[blits.length - 1])).toBe(false)
})

const HOUR = 3600 * 1000

// Fire session.start with a saved store and a clock set to a given time
async function startedWith($, on, saved: Record<string, unknown>, now: number) {
  const clock = mock.clock(on, { now })
  const blits: string[] = []
  on('ui.render', () => THEIRS)
  on('ui.blit', ($, e) => {
    blits.push(e.cells)
    return { value: {} }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', ($, e) => ({ value: saved[e.key] }))
  on('store.set', ($, e) => {
    saved[e.key] = e.value
    return { value: undefined }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  return { clock, blits }
}

test('draws food circles and happiness hearts at the right edge', async ($, on) => {
  await startedWith($, on, {}, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // A new mon starts at 80%: four filled icons and one empty in each meter
  expect(await ui.find({ type: 'Text', text: '●●●●○' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '❤❤❤❤♡' })).toBeDefined()
})

test('hides the meters when the band is too narrow', async ($, on) => {
  await startedWith($, on, {}, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 44 } })
  expect((await ui.find({ key: 'pokemon' })).props.columns).toBe(STRIP)
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeUndefined()
})

test('food and happiness drain over real time, even between sessions', async ($, on) => {
  const full = { value: 100, at: 0 }
  await startedWith($, on, { stats: { abra: { food: full, happiness: full } } }, 4 * HOUR)
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toContain('food 50%, happiness 67%')
})

test('feeding fills food, petting fills happiness, and both are saved', async ($, on) => {
  const saved: Record<string, any> = { stats: { abra: { food: { value: 10, at: 0 }, happiness: { value: 10, at: 0 } } } }
  await startedWith($, on, saved, 0)
  await $.command.run({ command: 'pokemon', args: 'feed' })
  await $.command.run({ command: 'pokemon', args: 'pet' })
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toContain('food 45%, happiness 40%')
  expect(Math.round(saved.stats.abra.food.value)).toBe(45)
})

test('a hungry idle mon shows a berry bubble until it is fed', async ($, on) => {
  const low = { value: 10, at: 0 }
  const fine = { value: 90, at: 0 }
  const { clock, blits } = await startedWith($, on, { stats: { abra: { food: low, happiness: fine } } }, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(100)
  const hungry = blits[blits.length - 1]
  expect(paints(hungry, 0xf0f0f0)).toBe(true)
  expect(paints(hungry, 0xd84040)).toBe(true)
  expect(paints(hungry, 0xff6fa8)).toBe(false)

  await $.command.run({ command: 'pokemon', args: 'feed' })
  await $.command.run({ command: 'pokemon', args: 'feed' })
  await clock.advance(10 * 1000)
  expect(paints(blits[blits.length - 1], 0xd84040)).toBe(false)
})

test('a lonely idle mon shows a heart bubble', async ($, on) => {
  const low = { value: 10, at: 0 }
  const fine = { value: 90, at: 0 }
  const { clock, blits } = await startedWith($, on, { stats: { abra: { food: fine, happiness: low } } }, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(100)
  expect(paints(blits[blits.length - 1], 0xff6fa8)).toBe(true)
})

// Every color a blit paints, as a foreground or a background
function colorsOf(cells: string): Set<number> {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  return new Set(Array.from(words).filter((_, i) => i % 3 !== 0))
}

test('/pokemon attack plays a random move, then ends', async ($, on) => {
  const { clock, blits } = await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(100)
  const still = blits[blits.length - 1]

  const answer = await $.command.run({ command: 'pokemon', args: 'attack' })
  expect(answer.text).toMatch(/^Abra used (Teleport|Confusion)!$/)
  const seen = blits.length
  await clock.advance(1000)
  expect(blits.slice(seen).some((cells) => cells !== still)).toBe(true)

  await clock.advance(2000)
  const again = await $.command.run({ command: 'pokemon', args: 'attack' })
  expect(again.text).toMatch(/^Abra used /)
})

test('/pokemon attack while attacking says the mon is busy', async ($, on) => {
  await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'pokemon', args: 'attack' })
  const busy = await $.command.run({ command: 'pokemon', args: 'attack' })
  expect(busy.text).toBe('Abra is still attacking.')
})

test('/pokemon attack <move> picks that move and draws it in its color', async ($, on) => {
  const { clock, blits } = await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...BAND, surface: 'terminal' })

  const answer = await $.command.run({ command: 'pokemon', args: 'attack CON-fusion' })
  expect(answer.text).toBe('Abra used Confusion!')
  const seen = blits.length
  await clock.advance(1000)
  expect(blits.slice(seen).some((cells) => paints(cells, 0xd88aff))).toBe(true)
  await clock.advance(2000)
  expect(paints(blits[blits.length - 1], 0xd88aff)).toBe(false)

  const unknown = await $.command.run({ command: 'pokemon', args: 'attack flamethrower' })
  expect(unknown.text).toBe('Abra doesn\'t know "flamethrower". Its moves: Teleport, Confusion.')
})

test('Teleport blinks the mon to another spot in the strip', async ($, on) => {
  const { clock, blits } = await startedWith($, on, { wander: false }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const home = rightEdge((await ui.find({ key: 'pokemon' })).props.cells)

  const answer = await $.command.run({ command: 'pokemon', args: 'attack teleport' })
  expect(answer.text).toBe('Abra used Teleport!')
  const seen = blits.length
  await clock.advance(50 * 40)
  // Past the sparkles and before it walks home, the mon stands somewhere new
  const landed = blits[seen + 33]
  expect(rightEdge(landed)).toBeGreaterThan(-1)
  expect(rightEdge(landed)).not.toBe(home)
})

test('Transform shows another mon for a while, then turns back', async ($, on) => {
  const { clock, blits } = await startedWith($, on, { wander: false, mon: 'ditto' }, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(1000)
  const own = new Set(blits.flatMap((cells) => [...colorsOf(cells)]))

  const answer = await $.command.run({ command: 'pokemon', args: 'attack transform' })
  expect(answer.text).toBe('Ditto used Transform!')
  const seen = blits.length
  await clock.advance(3000)
  const during = blits.slice(seen, seen + 70)
  expect(during.some((cells) => [...colorsOf(cells)].some((c) => !own.has(c)))).toBe(true)
  // The band keeps its size while another sprite stands in
  expect(new Set(blits.map((cells) => cells.length)).size).toBe(1)

  await clock.advance(1000)
  expect([...colorsOf(blits[blits.length - 1])].every((c) => own.has(c))).toBe(true)
})

test('Splash just hops, and nothing happens', async ($, on) => {
  await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'pokemon', args: 'magikarp' })
  const answer = await $.command.run({ command: 'pokemon', args: 'attack splash' })
  expect(answer.text).toBe('Magikarp used Splash!\nBut nothing happened!')
})

test('display names read like the games', async ($, on) => {
  await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'pokemon', args: 'nidoran_female' })
  expect((await $.command.run({ command: 'pokemon', args: 'attack' })).text).toMatch(/^Nidoran♀ used /)
})

test('/pokemon list names every mon, and the hint and status stay short', async ($, on) => {
  mock.clock(on)
  let hint = ''
  on('command.register', ($, e) => {
    hint = e.argumentHint
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('store.get', () => ({ value: undefined }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(hint).toBe('[<mon>|default|shiny|wander|pet|feed|attack|list]')

  const list = await $.command.run({ command: 'pokemon', args: 'list' })
  expect(list.text).toMatch(/^\d+ mons: abra, /)
  expect(list.text).toContain('charmander')
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).not.toContain('charmander')
})
