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
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  const drawn = (await ui.find({ key: 'pokemon' })).props.cells
  await clock.advance(50 * 30)
  expect(new Set(blits).size).toBeGreaterThan(5)
  // A tick that repeats the frame on screen sends nothing
  const frames = [drawn, ...blits]
  expect(frames.some((cells, i) => i > 0 && cells === frames[i - 1])).toBe(false)
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
  expect(mon.text).toBe('Now showing default Bulbasaur.')
  const shiny = await $.command.run({ command: 'pokemon', args: 'shiny' })
  expect(shiny.text).toBe('Now showing shiny Bulbasaur.')
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
  expect(answer.text).toBe('Now showing default Charmander.')
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

// The bubble outline on a dark theme and on a light one
const DARK_THEME_BUBBLE = 0xf0f0f0
const LIGHT_THEME_BUBBLE = 0x4a4a58
const ENGINE = { plugin: 'engine', tier: 'core' } as const

test('a light theme draws a dark bubble, and switching to a dark theme draws it light again', async ($, on) => {
  const { clock, blits } = await started($, on)
  on('config.list', () => ({
    value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: 'light', provider: ENGINE, isLocked: false }],
  }))
  on('config.set', ($, e) => ({ value: e.value }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  const light = (await ui.find({ key: 'pokemon' })).props.cells
  expect(paints(light, LIGHT_THEME_BUBBLE)).toBe(true)
  expect(paints(light, DARK_THEME_BUBBLE)).toBe(false)

  const set = await $.config.set({ key: 'theme', value: 'dark', previous: 'light', provider: ENGINE, origin: { kind: 'composer' } })
  expect(set.value).toBe('dark')
  const seen = blits.length
  await clock.advance(1000)
  const dark = blits.slice(seen)
  expect(dark.length).toBeGreaterThan(0)
  expect(dark.every((cells) => paints(cells, DARK_THEME_BUBBLE) && !paints(cells, LIGHT_THEME_BUBBLE))).toBe(true)
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
  expect(answer.text).toBe('Abra is heading home.')
  await clock.advance(10 * 1000)
  expect(rightEdge(blits[blits.length - 1])).toBe(home)
})

test('/pokemon pet sends hearts up, then they fade', async ($, on) => {
  const { clock, blits } = await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...BAND, surface: 'terminal' })

  const answer = await $.command.run({ command: 'pokemon', args: 'pet' })
  expect(answer.text).toMatch(/^Abra .+ ❤ \(pets: 1\)$/)
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
  expect(answer.text).toMatch(/^You toss Abra (an oran|a pecha|a razz|a sitrus) berry \S+ \(feeds: 1\)$/u)
  const busy = await $.command.run({ command: 'pokemon', args: 'feed' })
  expect(busy.text).toBe('Abra is still busy with the last one.')

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

// The frame on screen: the last blit, or the drawn frame while every tick has repeated it
async function shown(ui, blits: string[]): Promise<string> {
  return blits[blits.length - 1] ?? (await ui.find({ key: 'pokemon' })).props.cells
}

test('a hungry idle mon shows a berry bubble until it is fed', async ($, on) => {
  const low = { value: 10, at: 0 }
  const fine = { value: 90, at: 0 }
  const { clock, blits } = await startedWith($, on, { stats: { abra: { food: low, happiness: fine } } }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(100)
  const hungry = await shown(ui, blits)
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
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(100)
  expect(paints(await shown(ui, blits), 0xff6fa8)).toBe(true)
})

const ANSWERED = { turnId: 't', answer: 'ok', durationMs: 30000, isAborted: false, reason: 'answer' } as const

// Mons start at Lv. 5, and Lv. n takes n ** 3 XP
const START_XP = 125

// Collect every toast
function toastsOf(on): string[] {
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return toasts
}

test('a turn that ends with an answer earns XP and saves it, and other turns earn none', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  const saved: Record<string, any> = {}
  await startedWith($, on, saved, 0)
  await $.turn.complete({ ...ANSWERED, reason: 'aborted', isAborted: true })
  await $.turn.complete({ ...ANSWERED, reason: 'error' })
  await $.turn.complete({ ...ANSWERED, agentId: 'sub1' })
  expect(saved.stats).toBeUndefined()
  await $.turn.complete(ANSWERED)
  expect(saved.stats.abra.xp).toBeGreaterThan(START_XP)
})

test('care scales XP, so the same turn earns more at full meters than at empty ones', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  const full = { value: 100, at: 0 }
  const empty = { value: 0, at: 0 }
  const saved: Record<string, any> = { stats: { abra: { food: full, happiness: full }, bulbasaur: { food: empty, happiness: empty } } }
  await startedWith($, on, saved, 0)
  await $.turn.complete(ANSWERED)
  await $.command.run({ command: 'pokemon', args: 'bulbasaur' })
  await $.turn.complete(ANSWERED)
  expect(saved.stats.abra.xp - START_XP).toBeGreaterThan(saved.stats.bulbasaur.xp - START_XP)
})

test('a level-up evolves Charmander into Charmeleon, and its record moves along', { timeoutMs: 30000 }, async ($, on) => {
  const toasts = toastsOf(on)
  on('turn.complete', () => ({ text: '' }))
  // One XP short of Lv. 16, where Charmander evolves
  const saved: Record<string, any> = { mon: 'charmander', wander: false, stats: { charmander: { xp: 16 ** 3 - 1 } } }
  const { clock, blits } = await startedWith($, on, saved, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'pokemon' })).props.rows).toBe(10)

  await $.turn.complete(ANSWERED)
  expect(toasts).toEqual(['Charmander grew to Lv. 16!'])
  await clock.advance(50)
  expect(toasts[1]).toBe('What? Charmander is evolving!')
  // The band grows to fit Charmeleon, the taller of the two
  const band = (await ui.find({ key: 'pokemon' })).props
  expect(band.rows).toBe(12)

  const seen = blits.length
  await clock.advance(7100)
  const frames = blits.slice(seen)
  expect(frames.length).toBeGreaterThan(50)
  expect(frames.every((cells) => cells.length === band.cells.length)).toBe(true)
  expect(toasts[2]).toBe('Congratulations! Your Charmander evolved into Charmeleon!')
  expect(saved.mon).toBe('charmeleon')
  expect(saved.stats.charmander).toBeUndefined()
  expect(saved.stats.charmeleon.xp).toBeGreaterThanOrEqual(16 ** 3)
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toMatch(/^Showing default Charmeleon Lv\. 16 \(food 80%, happiness 80%\)/)
})

test('/pokemon stop during the evolution keeps Charmander', { timeoutMs: 30000 }, async ($, on) => {
  const toasts = toastsOf(on)
  on('turn.complete', () => ({ text: '' }))
  const saved: Record<string, any> = { mon: 'charmander', stats: { charmander: { xp: 16 ** 3 - 1 } } }
  const { clock } = await startedWith($, on, saved, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const stop = () => $.command.run({ command: 'pokemon', args: 'stop' })
  expect((await stop()).text).toBe('Charmander isn\'t evolving.')

  await $.turn.complete(ANSWERED)
  await clock.advance(2000)
  const pet = await $.command.run({ command: 'pokemon', args: 'pet' })
  expect(pet.text).toBe('Charmander is evolving! /pokemon stop cancels it.')
  expect((await stop()).text).toBe('Huh? Charmander stopped evolving!')
  expect((await ui.find({ key: 'pokemon' })).props.rows).toBe(10)

  await clock.advance(8000)
  expect(toasts).toEqual(['Charmander grew to Lv. 16!', 'What? Charmander is evolving!'])
  expect(saved.mon).toBe('charmander')
  expect(saved.stats.charmander.xp).toBeGreaterThanOrEqual(16 ** 3)
})

test('/pokemon evolve uses a stone or a trade, lists Eevee\'s choices, and says when a level evolution comes', { timeoutMs: 30000 }, async ($, on) => {
  const toasts = toastsOf(on)
  // Charmander at Lv. 9
  const saved: Record<string, any> = { mon: 'pikachu', stats: { charmander: { xp: 9 ** 3 } } }
  const { clock } = await startedWith($, on, saved, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text

  expect(await run('evolve')).toBe('You use a Thunder Stone on Pikachu.')
  expect(await run('evolve')).toBe('Pikachu is busy right now.')
  await clock.advance(7100)
  expect(saved.mon).toBe('raichu')
  expect(toasts).toEqual(['What? Pikachu is evolving!', 'Congratulations! Your Pikachu evolved into Raichu!'])

  await run('eevee')
  const choices = 'Eevee can become Vaporeon with a Water Stone, Jolteon with a Thunder Stone, or Flareon with a Fire Stone.'
  expect(await run('evolve')).toMatch(new RegExp('^' + choices.replace(/\./g, '\\.') + ' Try /pokemon evolve (vaporeon|jolteon|flareon)\\.$'))
  expect(await run('evolve jolteon')).toBe('You use a Thunder Stone on Eevee.')
  await clock.advance(7100)
  expect(saved.mon).toBe('jolteon')

  await run('kadabra')
  expect(await run('evolve')).toBe('You trade Kadabra to a friend, and they trade it right back.')
  await clock.advance(7100)
  expect(saved.mon).toBe('alakazam')

  await run('charizard')
  expect(await run('evolve')).toBe('Charizard doesn\'t evolve.')
  await run('charmander')
  expect(await run('evolve')).toBe('Charmander evolves into Charmeleon at Lv. 16. It\'s Lv. 9.')
})

test('/pokemon shows the level in its status and above the meters', async ($, on) => {
  // Lv. 12
  await startedWith($, on, { mon: 'charmander', stats: { charmander: { xp: 12 ** 3 } } }, 0)
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toMatch(/^Showing default Charmander Lv\. 12, wandering \(food 80%, happiness 80%\)\. Options: /)
  const wide = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await wide.find({ type: 'Text', text: 'Lv 12' })).toBeDefined()
  await wide.unmount()
  // Too narrow for the meters, the level line hides with them
  const narrow = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 44 } })
  expect(await narrow.find({ type: 'Text', text: /^Lv/ })).toBeUndefined()
})

test('/pokemon needs hides the meters and the need bubbles, and turning it back on shows them', async ($, on) => {
  const saved: Record<string, any> = { stats: { abra: { food: { value: 10, at: 0 }, happiness: { value: 90, at: 0 } } } }
  const { clock, blits } = await startedWith($, on, saved, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(100)
  expect(paints(await shown(ui, blits), 0xd84040)).toBe(true)

  const off = await $.command.run({ command: 'pokemon', args: 'needs' })
  expect(off.text).toBe('Needs are off. Abra won\'t get hungry or lonely.')
  expect(saved.needs).toBe(false)
  await clock.advance(100)
  expect(paints(await shown(ui, blits), 0xd84040)).toBe(false)
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Lv 5' })).toBeDefined()

  const on2 = await $.command.run({ command: 'pokemon', args: 'needs' })
  expect(on2.text).toBe('Needs are on. Keep Abra fed and happy.')
  expect(saved.needs).toBe(true)
  await clock.advance(100)
  expect(paints(await shown(ui, blits), 0xd84040)).toBe(true)
  expect(await ui.find({ type: 'Text', text: '●○○○○' })).toBeDefined()
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
  // Past the sparkles and before it walks home, the mon stands somewhere new
  await clock.advance(50 * 34)
  const landed = blits[blits.length - 1]
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

test('every move of every mon plays to the end without breaking a frame', { timeoutMs: 120000 }, async ($, on) => {
  const { clock, blits } = await started($, on)
  // A frame that throws is logged, so each line names the move that broke
  const broken: string[] = []
  let playing = ''
  on('ui.log', ($, e) => {
    broken.push(playing + ': ' + e.text)
    return { value: undefined }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const list = await $.command.run({ command: 'pokemon', args: 'list' })
  const mons = list.text.replace(/^\d+ mons: /, '').split(', ')
  for (const mon of mons) {
    await $.command.run({ command: 'pokemon', args: mon })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const size = (await ui.find({ key: 'pokemon' })).props.cells.length
    const help = await $.command.run({ command: 'pokemon', args: 'attack ?' })
    const moves = help.text.replace(/^.* Its moves: /, '').replace(/\.$/, '').split(', ')
    for (const move of moves) {
      playing = mon + ' ' + move
      const answer = await $.command.run({ command: 'pokemon', args: 'attack ' + move })
      expect(answer.text).toContain(' used ' + move + '!')
      const seen = blits.length
      await clock.advance(50 * 80)
      expect(broken).toEqual([])
      const frames = blits.slice(seen)
      expect(frames.length).toBeGreaterThan(0)
      expect(frames.every((cells) => cells.length === size)).toBe(true)
    }
    await ui.unmount()
  }
})

test('display names read like the games', async ($, on) => {
  await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const switched = await $.command.run({ command: 'pokemon', args: 'nidoran_female' })
  expect(switched.text).toBe('Now showing default Nidoran♀.')
  expect((await $.command.run({ command: 'pokemon', args: 'wander' })).text).toBe('Nidoran♀ is heading home.')
  expect((await $.command.run({ command: 'pokemon', args: 'attack' })).text).toMatch(/^Nidoran♀ used /)
})

test('/pokemon moves lists the moves of the mon shown or the one named, and so does attack list', async ($, on) => {
  await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'pokemon', args: 'pikachu' })
  const own = await $.command.run({ command: 'pokemon', args: 'moves' })
  expect(own.text).toBe('Pikachu knows Thunderbolt, Quick Attack, Thunder, Agility.')
  expect((await $.command.run({ command: 'pokemon', args: 'attack list' })).text).toBe(own.text)
  const other = await $.command.run({ command: 'pokemon', args: 'moves mrmime' })
  expect(other.text).toBe('Mr. Mime knows Barrier, Confusion, Double Slap.')
  expect((await $.command.run({ command: 'pokemon', args: 'moves togepi' })).text).toMatch(/^Unknown mon "togepi"/)
  // Listing moves doesn't play one
  expect((await $.command.run({ command: 'pokemon', args: 'attack' })).text).toMatch(/^Pikachu used /)
})

test('/pokemon stats shows the level, the XP to the next one, the evolution, the meters, and the counts', async ($, on) => {
  await startedWith($, on, { mon: 'charmander', pets: 3, feeds: 2 }, 0)
  const stats = await $.command.run({ command: 'pokemon', args: 'stats' })
  expect(stats.text).toBe(
    'Charmander, Lv. 5, 125 XP (91 to Lv. 6). Can become Charmeleon at Lv. 16. Food 80%, happiness 80%. 3 pets, 2 feeds.',
  )
})

test('/pokemon box lists every raised mon by level, then name, with meters drained to now and the active one marked', async ($, on) => {
  const full = { value: 100, at: 0 }
  const low = { value: 10, at: 0 }
  const stats = {
    pikachu: { xp: 12 ** 3, food: full, happiness: full },
    charizard: { xp: 40 ** 3, food: low, happiness: { value: 50, at: 0 } },
    bulbasaur: { xp: 12 ** 3 },
    nidoran_female: { xp: 5 ** 3 },
  }
  await startedWith($, on, { mon: 'pikachu', stats }, 4 * HOUR)
  const box = await $.command.run({ command: 'pokemon', args: 'box' })
  expect(box.text).toBe(
    [
      '4 mons in your box:',
      'Charizard, Lv. 40 ○○○○○ ❤♡♡♡♡',
      'Bulbasaur, Lv. 12 ●●●●○ ❤❤❤❤♡',
      'Pikachu, Lv. 12 ●●●○○ ❤❤❤❤♡ (active)',
      'Nidoran♀, Lv. 5 ●●●●○ ❤❤❤❤♡',
    ].join('\n'),
  )
})

test('/pokemon box leaves out the meters with needs off', async ($, on) => {
  await startedWith($, on, { mon: 'pikachu', needs: false, stats: { pikachu: { xp: 12 ** 3 }, charizard: { xp: 40 ** 3 } } }, 0)
  const box = await $.command.run({ command: 'pokemon', args: 'box' })
  expect(box.text).toBe('2 mons in your box:\nCharizard, Lv. 40\nPikachu, Lv. 12 (active)')
})

test('/pokemon box says when the box is empty, or holds only the active mon', async ($, on) => {
  const saved: Record<string, any> = {}
  await startedWith($, on, saved, 0)
  const run = async () => (await $.command.run({ command: 'pokemon', args: 'box' })).text
  expect(await run()).toBe('Your box is empty. Pet or feed Abra, or finish a turn, to start raising it.')
  await $.command.run({ command: 'pokemon', args: 'pet' })
  expect(await run()).toBe('1 mon in your box:\nAbra, Lv. 5 ●●●●○ ❤❤❤❤❤ (active)\nOnly Abra so far. /pokemon <mon> picks another.')
})

test('/pokemon release drops a mon from the box, so it starts over at its first level with fresh meters', async ($, on) => {
  const low = { value: 10, at: 0 }
  const saved: Record<string, any> = { mon: 'pikachu', stats: { pikachu: { xp: 12 ** 3, food: low, happiness: low }, charizard: { xp: 40 ** 3 } } }
  await startedWith($, on, saved, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text

  expect(await run('release')).toBe('Name the mon to release, like /pokemon release pikachu. /pokemon box lists yours.')
  expect(await run('release agumon')).toBe('Unknown mon "agumon". /pokemon box lists yours.')
  expect(await run('release bulbasaur')).toBe('Bulbasaur isn\'t in your box.')

  expect(await run('release charizard')).toBe('You release Charizard. Bye-bye, Charizard!')
  expect(Object.keys(saved.stats)).toEqual(['pikachu'])

  expect(await run('release pikachu')).toBe('You release Pikachu. Bye-bye, Pikachu! A fresh Pikachu takes its place.')
  expect(saved.stats).toEqual({})
  expect(saved.mon).toBe('pikachu')
  expect(await run('box')).toBe('Your box is empty. Pet or feed Pikachu, or finish a turn, to start raising it.')
  expect(await run('')).toContain('Pikachu Lv. 5, wandering (food 80%, happiness 80%)')
})

test('/pokemon release waits while the mon evolves', async ($, on) => {
  await startedWith($, on, { mon: 'pikachu', stats: { pikachu: { xp: 12 ** 3 } } }, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text
  expect(await run('evolve')).toBe('You use a Thunder Stone on Pikachu.')
  expect(await run('release pikachu')).toBe('Pikachu is evolving! /pokemon stop cancels it.')
})

test('a refused frame, as when a resize remounts the band, asks for a redraw at most once a second', async ($, on) => {
  const clock = mock.clock(on)
  let renders = 0
  let refuse = false
  on('ui.render', () => {
    renders += 1
    return THEIRS
  })
  on('ui.blit', () => ({ value: refuse ? { deny: 'not mounted' } : {} }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  await clock.advance(500)
  const before = renders

  refuse = true
  await clock.advance(500)
  expect(renders).toBe(before + 1)
  await clock.advance(1000)
  expect(renders).toBe(before + 2)
})

test('a short pane shrinks the band to fit, and a very short one shows a one-line badge', async ($, on) => {
  const { clock, blits } = await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  // Abra needs 11 rows, so 6 rows shrink the 40 column strip to 22
  const short = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 6 } })
  const raster = (await short.find({ key: 'pokemon' })).props
  expect(raster.rows).toBe(6)
  expect(raster.columns).toBe(22)
  expect(colorsOf(raster.cells).size).toBeGreaterThan(3)
  await clock.advance(2000)
  expect(blits.length).toBeGreaterThan(0)
  expect(blits.every((cells) => cells.length === raster.cells.length)).toBe(true)
  await short.unmount()

  const tiny = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 3 } })
  expect(await tiny.find({ key: 'pokemon' })).toBeUndefined()
  expect(await tiny.find({ type: 'Text', text: /^Abra Lv 5$/ })).toBeDefined()
  expect(await tiny.find({ type: 'Text', text: ' ●●●●○' })).toBeDefined()
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
  expect(hint).toBe('[<mon>|default|shiny|wander|needs|pet|feed|attack|moves|evolve|stop|stats|box|release|list]')

  const list = await $.command.run({ command: 'pokemon', args: 'list' })
  expect(list.text).toMatch(/^\d+ mons: abra, /)
  expect(list.text).toContain('charmander')
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).not.toContain('charmander')
})

// Colors on a dark theme: the shell prompt and the pencil in the bubble, the
// thinking dots, the "!", a Poké Ball's red top and white bottom, and the +n label
const SHELL_ICON = 0x5fe08a
const PENCIL_ICON = 0xffc83d
const DOTS = 0x9a9ab0
const ALERT = 0xff3d3d
const BALL_TOP = 0xe03030
const BALL_BOTTOM = 0xf0f0f4
const PARTY_LABEL = 0xb4b4c8

// Answer every tool call two seconds later on the mocked clock, so a call stays in flight
function slowTools(on, clock) {
  on('tool.call', async () => {
    await clock.sleep(2000)
    return { result: { stdout: 'ok', stderr: '', interrupted: false } }
  })
}

// Every color the bottom row of cells paints, where a ball rests on the ground
function groundColors(cells: string): Set<number> {
  const words = Array.from(new Uint32Array(Uint8Array.fromBase64(cells).buffer)).slice(-RASTER * 3)
  return new Set(words.filter((_, i) => i % 3 !== 0))
}

test('the bubble shows the main loop\'s running tool while Claude works', async ($, on) => {
  const { clock, blits } = await started($, on)
  slowTools(on, clock)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })

  const bash = $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(100)
  const running = await shown(ui, blits)
  expect(paints(running, SHELL_ICON)).toBe(true)
  expect(paints(running, DOTS)).toBe(false)
  await clock.advance(2000)
  await bash
  await clock.advance(100)
  const done = await shown(ui, blits)
  expect(paints(done, SHELL_ICON)).toBe(false)
  expect(paints(done, DOTS)).toBe(true)

  // A subagent's call shows as its Poké Ball, not in the bubble
  const sub = $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'sub1' })
  await clock.advance(100)
  expect(paints(await shown(ui, blits), SHELL_ICON)).toBe(false)
  await clock.advance(2000)
  await sub

  const edit = $.tool.call({ tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(100)
  expect(paints(await shown(ui, blits), PENCIL_ICON)).toBe(true)
  await clock.advance(2000)
  await edit
})

test('a permission request stops the mon with a "!" until its call resolves or you answer', async ($, on) => {
  const { clock, blits } = await started($, on)
  slowTools(on, clock)
  on('classic.PermissionRequest', () => ({}))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  await clock.advance(1000)

  const bash = $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  await clock.advance(100)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } })
  await clock.advance(100)
  const alerted = await shown(ui, blits)
  expect(paints(alerted, ALERT)).toBe(true)
  // Pacing moves a column every 150 ms, so an edge that holds means the mon stands still
  const seen = blits.length
  await clock.advance(1500)
  const still = [alerted, ...blits.slice(seen)].map(rightEdge)
  expect(Math.max(...still) - Math.min(...still)).toBeLessThan(2)

  // The call waiting on the dialog resolves once you answer it, and the pacing resumes
  await clock.advance(1000)
  await bash
  await clock.advance(100)
  expect(paints(await shown(ui, blits), ALERT)).toBe(false)
  const resumed = blits.length
  await clock.advance(1500)
  const pacing = blits.slice(resumed).map(rightEdge)
  expect(Math.max(...pacing) - Math.min(...pacing)).toBeGreaterThan(2)

  await $.classic.PermissionRequest({ tool_name: 'Write', tool_input: { file_path: '/work/a.ts', content: '' } })
  await clock.advance(100)
  expect(paints(await shown(ui, blits), ALERT)).toBe(true)
  await $.command.run({ command: 'pokemon', args: '' })
  await clock.advance(100)
  expect(paints(await shown(ui, blits), ALERT)).toBe(false)
})

const SWEAT = 0x6ec8ff
const REFUSAL = 'The user doesn\'t want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file).'

// Answer each Bash call as core does: `false` errors, `refused` is turned down at the
// dialog, `blocked` is denied by the permission check, `hooked` by a hook, and the rest run
function bashTools($, on) {
  on('tool.check', (_, e) => ((e.input as any)?.command === 'blocked' ? { decision: 'deny', reason: 'Bash(blocked) is denied' } : { decision: 'allow' }))
  on('tool.call', { tool: 'Bash' }, async (_, e) => {
    const failed = (text: string) => ({ isError: true as const, result: text, text })
    if (e.command === 'false') return failed('Exit code 1')
    if (e.command === 'refused') return failed(REFUSAL)
    if (e.command === 'hooked') return { deny: 'Not here.' }
    if (e.command === 'blocked') {
      await $.tool.check({ tool: 'Bash', input: { command: e.command }, tool_use_id: e.tool_use_id })
      return failed('Permission to use Bash has been denied.')
    }
    return { result: { stdout: 'ok', stderr: '', interrupted: false } }
  })
}

test('a failed tool call shakes the mon in place with a sweat drop for about a second', async ($, on) => {
  bashTools($, on)
  const { clock, blits } = await startedWith($, on, { wander: false }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(100)
  const home = rightEdge(await shown(ui, blits))
  expect(paints(await shown(ui, blits), SWEAT)).toBe(false)

  const failed = await $.tool.call({ tool: 'Bash', command: 'false' })
  expect(failed.isError).toBe(true)
  const seen = blits.length
  await clock.advance(500)
  const shaking = blits.slice(seen)
  expect(shaking.length).toBeGreaterThan(0)
  expect(shaking.every((cells) => paints(cells, SWEAT))).toBe(true)
  expect(shaking.some((cells) => rightEdge(cells) !== home)).toBe(true)
  await clock.advance(1000)
  expect(paints(await shown(ui, blits), SWEAT)).toBe(false)
  expect(rightEdge(await shown(ui, blits))).toBe(home)

  // A second failure mid-flinch starts it over, so the drop outlasts the first one
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.advance(600)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.advance(900)
  expect(paints(await shown(ui, blits), SWEAT)).toBe(true)
  await clock.advance(500)
  expect(paints(await shown(ui, blits), SWEAT)).toBe(false)
})

test('a call turned down, denied, or run by a subagent leaves the mon calm', async ($, on) => {
  bashTools($, on)
  const { clock, blits } = await startedWith($, on, { wander: false }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const calm = async (call: Promise<unknown>) => {
    await call
    const seen = blits.length
    await clock.advance(500)
    return [await shown(ui, blits), ...blits.slice(seen)].every((cells) => !paints(cells, SWEAT))
  }
  expect(await calm($.tool.call({ tool: 'Bash', command: 'ls' }))).toBe(true)
  expect(await calm($.tool.call({ tool: 'Bash', command: 'refused' }))).toBe(true)
  expect(await calm($.tool.call({ tool: 'Bash', command: 'blocked', tool_use_id: 'blocked-1' }))).toBe(true)
  expect(await calm($.tool.call({ tool: 'Bash', command: 'hooked' }))).toBe(true)
  expect(await calm($.tool.call({ tool: 'Bash', command: 'false', agentId: 'sub1' }))).toBe(true)
  expect(await calm($.tool.call({ tool: 'Bash', command: 'false' }))).toBe(false)
})

test('a move under way or a "!" wins over the flinch', async ($, on) => {
  bashTools($, on)
  on('classic.Notification', () => ({}))
  const { clock, blits } = await startedWith($, on, { wander: false }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await $.command.run({ command: 'pokemon', args: 'attack confusion' })
  await clock.advance(100)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  const seen = blits.length
  await clock.advance(1000)
  expect(blits.slice(seen).some((cells) => paints(cells, CONFUSION))).toBe(true)
  expect(blits.slice(seen).every((cells) => !paints(cells, SWEAT))).toBe(true)
  await clock.advance(3000)

  await $.classic.Notification({ message: 'Claude needs your input', notification_type: 'elicitation_dialog' })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.advance(300)
  const alerted = await shown(ui, blits)
  expect(paints(alerted, ALERT)).toBe(true)
  expect(paints(alerted, SWEAT)).toBe(false)
})

test('a minute after a turn with no word from you, a "!" shows for two minutes', { timeoutMs: 30000 }, async ($, on) => {
  const { clock, blits } = await started($, on)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 1000, isAborted: false, reason: 'answer' })
  await clock.advance(55 * 1000)
  expect(paints(await shown(ui, blits), ALERT)).toBe(false)
  await clock.advance(10 * 1000)
  expect(paints(await shown(ui, blits), ALERT)).toBe(true)
  await clock.advance(2 * 60 * 1000)
  expect(paints(await shown(ui, blits), ALERT)).toBe(false)

  // A /pokemon command within the minute shows you're here, so no "!" comes
  await $.turn.complete({ turnId: 't2', answer: 'ok', durationMs: 1000, isAborted: false, reason: 'answer' })
  await $.command.run({ command: 'pokemon', args: '' })
  await clock.advance(70 * 1000)
  expect(paints(await shown(ui, blits), ALERT)).toBe(false)
})

// The Agent tool starting a subagent, as the engine raises it
const spawnOf = (id: string) => ({
  tool_use_id: id,
  prompt: 'Count the files',
  description: 'Count files',
  subagentType: 'Explore',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: false,
})

test('a subagent drops a Poké Ball onto the ground, and it pops when its turn ends', async ($, on) => {
  on('agent.spawn', ($, e) => ({ model: 'claude-haiku-4-5', agentId: 'agent-' + e.tool_use_id }))
  on('turn.complete', () => ({ text: '' }))
  const { clock, blits } = await startedWith($, on, { wander: false }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await $.agent.spawn(spawnOf('t1'))
  await clock.advance(1000)
  const falling = await shown(ui, blits)
  expect(paints(falling, BALL_TOP)).toBe(true)
  expect(groundColors(falling).has(BALL_BOTTOM)).toBe(false)
  await clock.advance(2000)
  expect(groundColors(await shown(ui, blits)).has(BALL_BOTTOM)).toBe(true)

  await $.turn.complete({ turnId: 's1', answer: 'done', durationMs: 3000, isAborted: false, reason: 'answer', agentId: 'agent-t1' })
  await clock.advance(1000)
  const popped = await shown(ui, blits)
  expect(paints(popped, BALL_TOP)).toBe(false)
  expect(paints(popped, BALL_BOTTOM)).toBe(false)
})

test('past five subagents, the last slot counts the rest as +n', async ($, on) => {
  on('agent.spawn', ($, e) => ({ model: 'claude-haiku-4-5', agentId: 'agent-' + e.tool_use_id }))
  const { clock, blits } = await startedWith($, on, { wander: false }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  for (let k = 0; k < 5; k++) await $.agent.spawn(spawnOf('t' + k))
  await clock.advance(3000)
  expect(paints(await shown(ui, blits), PARTY_LABEL)).toBe(false)
  for (let k = 5; k < 8; k++) await $.agent.spawn(spawnOf('t' + k))
  await clock.advance(3000)
  expect(paints(await shown(ui, blits), PARTY_LABEL)).toBe(true)
})

// The strip columns where a color shows, as a foreground or a background
function columnsPainting(cells: string, color: number): number[] {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  const columns: number[] = []
  for (let i = 0; i < words.length; i += 3) {
    if (words[i + 1] === color || words[i + 2] === color) columns.push((i / 3) % RASTER)
  }
  return columns
}

const CONFUSION = 0xd88aff

test('a mon walking right near the right edge aims its move left, across the open strip', async ($, on) => {
  const { clock, blits } = await startedWith($, on, { wander: false }, 0)
  const idle = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const home = rightEdge((await idle.find({ key: 'pokemon' })).props.cells)
  await idle.unmount()

  // Pace eight columns left while Claude works, then walk five of them back toward home
  const busy = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  await clock.advance(150 * 8)
  await busy.unmount()
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(150 * 5)
  expect(rightEdge(await shown(ui, blits))).toBeLessThan(home)

  const answer = await $.command.run({ command: 'pokemon', args: 'attack confusion' })
  expect(answer.text).toBe('Abra used Confusion!')
  const seen = blits.length
  await clock.advance(50 * 50)
  // The vortex spins far out on the left, not squeezed against the right edge
  const purple = blits.slice(seen).flatMap((cells) => columnsPainting(cells, CONFUSION))
  expect(Math.min(...purple)).toBeLessThan(STRIP / 4)
})

test('a mon mid-strip backs up to the edge before its move shows, and stays busy meanwhile', async ($, on) => {
  const { clock, blits } = await startedWith($, on, { wander: false }, 0)
  const idle = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const home = rightEdge((await idle.find({ key: 'pokemon' })).props.cells)
  await idle.unmount()

  // Pace eight columns left while Claude works, so the left side has more room
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  await clock.advance(150 * 8)
  expect(rightEdge(await shown(ui, blits))).toBeLessThan(home - 5)

  await $.command.run({ command: 'pokemon', args: 'attack confusion' })
  await clock.advance(50)
  const frames = [await shown(ui, blits)]
  const again = await $.command.run({ command: 'pokemon', args: 'attack' })
  expect(again.text).toBe('Abra is still attacking.')
  for (let k = 1; k < 20; k++) {
    await clock.advance(50)
    frames.push(await shown(ui, blits))
  }
  // Nothing is drawn while it steps back, and the move shows once it is home
  const first = frames.findIndex((cells) => paints(cells, CONFUSION))
  expect(first).toBeGreaterThan(4)
  expect(rightEdge(frames[first - 1])).toBeGreaterThan(home - 3)
})
