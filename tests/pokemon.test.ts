import { expect, mock, test } from 'claude-code/testing'
import { closedEyes, eyesOf, keptEyesOf, pupilsOf } from '../hooks/eyes.js'
import { SPRITES } from '../hooks/frames.js'
import { encodePng } from '../hooks/png.js'
import { zoomedPixel } from '../hooks/zoom.js'

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

// The strip is 40 columns. The raster adds 12 empty ones on its left, room for a bubble,
// and 6 under the level and text meters on its right, or 11 under emoji meters.
const MARGIN = 12
const STRIP = 40
const PANEL = 6
const EMOJI_PANEL = 11
const RASTER = MARGIN + STRIP + PANEL

function codePoints(cells: string): number[] {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  return Array.from(words).filter((_, i) => i % 3 === 0)
}

// Whether each cell paints anything: a glyph, or a space on a color of its own
function paintedCells(cells: string): boolean[] {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  const out: boolean[] = []
  for (let i = 0; i < words.length; i += 3) out.push(words[i] !== 0x20 || words[i + 2] !== 0x01000000)
  return out
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

test('cells one color top and bottom are spaces on that color, so no font can leave seams', async ($, on) => {
  on('ui.render', () => THEIRS)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const words = new Uint32Array(Uint8Array.fromBase64((await ui.find({ key: 'pokemon' })).props.cells).buffer)
  let solid = 0
  for (let i = 0; i < words.length; i += 3) {
    if (words[i] === 0x20 && words[i + 2] !== 0x01000000) solid += 1
    // A half block never has the same color on both halves
    if (words[i] === 0x2580) expect(words[i + 1]).not.toBe(words[i + 2])
  }
  expect(solid).toBeGreaterThan(20)
})

test('leaves the band alone during a survey, on either surface', async ($, on) => {
  on('ui.render', () => THEIRS)
  for (const surface of ['terminal', 'desktop'] as const) {
    const survey = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props, hasSurvey: true } })
    expect(await survey.find({ key: 'pokemon' })).toBeUndefined()
    expect(await survey.find({ type: 'Svg' })).toBeUndefined()
    await survey.unmount()
  }
})

// The desktop's Svg draws each pixel as a 4 px square, two pixel rows per band row
const PIXEL_PX = 4

function svgOf(element): string {
  return element.props.source
}

test('draws Abra as pixels in an Svg on desktop, with the level and meters beside it as text', async ($, on) => {
  await startedWith($, on, {}, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  expect(await ui.find({ key: 'pokemon' })).toBeUndefined()
  // No panel on desktop: the scene is the margin and the strip, the meters beside it
  expect(svg.props.width).toBe((MARGIN + STRIP) * PIXEL_PX)
  expect(svg.props.height).toBe(11 * 2 * PIXEL_PX)
  expect(svg.props.alt).toBe('Abra')
  const source = svgOf(svg)
  expect(source).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 52 22"/)
  const abra = SPRITES.abra.variants.default.palette
  expect(abra.some((hex) => source.includes(`fill="${hex.toLowerCase()}"`))).toBe(true)
  expect(await ui.find({ type: 'Text', text: '●●●●○' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Lv ?\d+$/ })).toBeDefined()
})

test('the desktop draws the band again as the mon paces', async ($, on) => {
  const { clock } = await started($, on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, isWorking: true } })
  // The frame's key, pokemon-<n>, counting up from the last one found
  let n = 0
  const keyNow = async () => {
    for (let k = n; k < n + 100; k++) {
      if (await ui.find({ key: 'pokemon-' + k })) {
        n = k
        return k
      }
    }
    return undefined
  }
  const frames = [svgOf(await ui.find({ type: 'Svg' }))]
  const keys = [await keyNow()]
  for (let i = 0; i < 10; i++) {
    await clock.advance(150)
    frames.push(svgOf(await ui.find({ type: 'Svg' })))
    keys.push(await keyNow())
  }
  expect(keys.every((k) => k !== undefined)).toBe(true)
  expect(new Set(frames).size).toBeGreaterThan(3)
  // The desktop shows an Svg's first frame until its place in the tree changes, so each
  // new frame goes under a new key
  frames.forEach((frame, i) => {
    if (i > 0 && frame !== frames[i - 1]) expect(keys[i]).not.toBe(keys[i - 1])
  })
})

test('every mon fits the desktop Svg in its size limit', { timeoutMs: 60000 }, async ($, on) => {
  await startedWith($, on, {}, 0)
  for (const name of Object.keys(SPRITES)) {
    await $.command.run({ command: 'pokemon', args: name })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(svgOf(await ui.find({ type: 'Svg' })).length).toBeLessThan(131072)
    await ui.unmount()
  }
})

test('leaves the band alone on surfaces without one of its own', async ($, on) => {
  on('ui.render', () => THEIRS)
  for (const surface of ['vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  }
})

test('paces while Claude works', async ($, on) => {
  const clock = mock.clock(on)
  const blits: string[] = []
  on('ui.render', () => THEIRS)
  on('ui.blit', ($, e) => {
    blits.push(e.cells ?? e.source.png)
    return { value: {} }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('env.get', () => ({ value: undefined }))
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
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
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
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  const answer = await $.command.run({ command: 'pokemon', args: 'charmander' })
  expect(answer.text).toBe('Now showing default Charmander.')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'pokemon' })).props.rows).toBe(10)
})

// The rightmost strip column that holds part of the sprite, ignoring the meters
function rightEdge(cells: string): number {
  let edge = -1
  paintedCells(cells).forEach((painted, i) => {
    const column = (i % RASTER) - MARGIN
    if (painted && column >= 0 && column < STRIP) edge = Math.max(edge, column)
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
  on('env.get', () => ({ value: undefined }))
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

test('every mon at home leaves a gap of at least three columns before the level and meters', { timeoutMs: 60000 }, async ($, on) => {
  await startedWith($, on, { wander: false }, 0)
  for (const name of Object.keys(SPRITES)) {
    await $.command.run({ command: 'pokemon', args: name })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const edge = rightEdge((await ui.find({ key: 'pokemon' })).props.cells)
    expect({ name, ok: STRIP - 1 - edge >= 3 }).toEqual({ name, ok: true })
    await ui.unmount()
  }
})

// Fire session.start with the stubs it needs, and collect every blit
async function started($, on) {
  const clock = mock.clock(on)
  const blits: string[] = []
  on('ui.render', () => THEIRS)
  on('ui.blit', ($, e) => {
    blits.push(e.cells ?? e.source.png)
    return { value: {} }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('env.get', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('store.keys', () => ({ value: [] }))
  on('store.delete', () => ({ value: undefined }))
  return { clock, blits }
}

const SPINNER = {
  plugin: 'pokemon',
  component: 'Spinner',
  requestId: 'main',
  viewport: BAND.viewport,
  props: { word: 'Thinking', message: 'Thinking', suffix: '…', mode: 'thinking' },
} as const

// The mean strip column of the cells painting a color, or null when none does
function meanColumn(cells: string, color: number): number | null {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  const columns: number[] = []
  for (let i = 0; i < words.length; i += 3) {
    if (words[i + 1] === color || words[i + 2] === color) columns.push(((i / 3) % RASTER) - MARGIN)
  }
  return columns.length > 0 ? columns.reduce((a, b) => a + b, 0) / columns.length : null
}

test('the thought bubble leads on the side the pacing mon walks toward', { timeoutMs: 30000 }, async ($, on) => {
  // Bulbasaur's wide head leaves the bubble room on both sides for only a short stretch of
  // the strip, so this needs the margin on the left and the early turn on the right
  const BODY = 0x68d078
  const { clock, blits } = await startedWith($, on, { mon: 'bulbasaur', needs: false }, 0)
  await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  await clock.advance(30000)
  let left = 0
  let right = 0
  for (let k = 1; k < blits.length; k++) {
    const was = meanColumn(blits[k - 1], BODY)
    const now = meanColumn(blits[k], BODY)
    const bubble = meanColumn(blits[k], BUBBLE_OUTLINE)
    if (was === null || now === null || bubble === null || Math.abs(now - was) < 0.5) continue
    // Only a real step counts: the body's mean moves by about a column
    if (Math.abs(now - was) > 2) continue
    if (now < was) {
      left += 1
      expect(bubble).toBeLessThan(now)
    } else {
      right += 1
      expect(bubble).toBeGreaterThan(now)
    }
  }
  expect(left).toBeGreaterThan(3)
  expect(right).toBeGreaterThan(3)
})

test('shows a thought bubble while Claude thinks', async ($, on) => {
  await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  const cells = (await ui.find({ key: 'pokemon' })).props.cells
  expect(paints(cells, BUBBLE_OUTLINE)).toBe(true)
  expect(paints(cells, DOTS)).toBe(true)
})

// The bubble outline on a dark theme and on a light one
const DARK_THEME_BUBBLE = 0xf0f0f0
const LIGHT_THEME_BUBBLE = 0x4a4a58
const BUBBLE_OUTLINE = DARK_THEME_BUBBLE
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

// The Zs on the dark theme
const Z_COLOR = 0xe8e8ff

test('falls asleep after five idle minutes', { timeoutMs: 30000 }, async ($, on) => {
  const { clock, blits } = await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(4 * 60 * 1000)
  expect(paints(blits[blits.length - 1], Z_COLOR)).toBe(false)
  // Out wandering, it walks home first, a column every 150 ms
  await clock.advance(66 * 1000)
  expect(paints(blits[blits.length - 1], Z_COLOR)).toBe(true)
})

test('a pet leaves a sleeping mon asleep, napping or tucked in, and still fills its happiness', { timeoutMs: 30000 }, async ($, on) => {
  const saved: Record<string, any> = { wander: false, stats: { abra: { food: { value: 50, at: 0 }, happiness: { value: 50, at: 0 } } } }
  const { clock, blits } = await startedWith($, on, saved, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text

  // Napping after five idle minutes
  await clock.advance(5 * 60 * 1000 + 1000)
  expect(paints(blits[blits.length - 1], Z_COLOR)).toBe(true)
  expect(await run('pet')).toMatch(/^Abra smiles in its sleep ♥/)
  await clock.advance(4000)
  expect(paints(blits[blits.length - 1], Z_COLOR)).toBe(true)
  // 50, less five minutes' drain, plus the pet's 25
  expect(Math.round(saved.stats.abra.happiness.value)).toBe(74)

  // Tucked in with /pokemon sleep
  await run('sleep')
  expect(await run('pet')).toMatch(/^Abra smiles in its sleep ♥/)
  await clock.advance(4000)
  expect(paints(blits[blits.length - 1], Z_COLOR)).toBe(true)
  expect(saved.stats.abra.asleep).toBe(true)
})

test('after five idle minutes, a mon out wandering walks home before it falls asleep', { timeoutMs: 30000 }, async ($, on) => {
  const { clock, blits } = await started($, on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const home = rightEdge((await ui.find({ key: 'pokemon' })).props.cells)
  await clock.advance(5 * 60 * 1000 + 6000)
  // Every frame with Zs shows it at home
  const zs = blits.filter((cells) => paints(cells, Z_COLOR))
  expect(zs.length).toBeGreaterThan(0)
  expect(zs.every((cells) => rightEdge(cells) === home)).toBe(true)
  expect(blits.some((cells) => rightEdge(cells) < home)).toBe(true)
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
  expect(answer.text).toMatch(/^Abra .+ ♥$/)
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
  expect(answer.text).toMatch(/^You toss Abra (an oran|a pecha|a razz|a sitrus) berry \S+$/u)
  const busy = await $.command.run({ command: 'pokemon', args: 'feed' })
  expect(busy.text).toBe('Abra is busy eating. Try again in a moment.')

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
async function startedWith($, on, saved: Record<string, unknown>, now: number, env: Record<string, string> = {}, answer: (e: any) => object = () => ({})) {
  const clock = mock.clock(on, { now })
  const blits: string[] = []
  // Each blit's width in columns, and the blit itself, alongside blits
  const widths: number[] = []
  const sent: any[] = []
  on('ui.render', () => THEIRS)
  on('ui.blit', ($, e) => {
    const value = answer(e)
    if ('deny' in value) return { value }
    blits.push(e.cells ?? e.source.png)
    widths.push(e.columns)
    sent.push(e)
    return { value }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('env.get', ($, e) => ({ value: env[e.name] }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', ($, e) => ({ value: saved[e.key] }))
  on('store.set', ($, e) => {
    saved[e.key] = e.value
    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(saved) }))
  on('store.delete', ($, e) => {
    delete saved[e.key]
    return { value: undefined }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  return { clock, blits, widths, sent }
}

// The lowest pixel row a frame paints, two pixel rows per cell
function lowestPixel(cells: string): number {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  let lowest = -1
  for (let i = 0; i < words.length; i += 3) {
    const cy = Math.floor(i / 3 / RASTER)
    const solid = words[i] === 0x20 && words[i + 2] !== 0x01000000
    if (solid || words[i] === 0x2584 || (words[i] === 0x2580 && words[i + 2] !== 0x01000000)) lowest = Math.max(lowest, cy * 2 + 1)
    else if (words[i] === 0x2580) lowest = Math.max(lowest, cy * 2)
  }
  return lowest
}

test('a walking mon stands on the same ground as an idle one', async ($, on) => {
  // Bulbasaur's walk frames leave one more empty row under its feet than its idle frames
  const { clock, blits } = await startedWith($, on, { mon: 'bulbasaur', wander: false, needs: false }, 0)
  const idle = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(3000)
  const idleFrames = [(await idle.find({ key: 'pokemon' })).props.cells, ...blits]
  await idle.unmount()
  blits.length = 0
  const busy = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  await clock.advance(3000)
  expect(blits.length).toBeGreaterThan(5)
  const ground = Math.max(...idleFrames.map(lowestPixel))
  expect(Math.max(...blits.map(lowestPixel))).toBe(ground)
  await busy.unmount()
})

test('a sleeping mon lies on the same ground as an idle one', async ($, on) => {
  // Bulbasaur sleeps in its first idle frame, which leaves an empty row under its feet
  const { clock, blits } = await startedWith($, on, { mon: 'bulbasaur', wander: false, needs: false }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(3000)
  const ground = Math.max(...[(await ui.find({ key: 'pokemon' })).props.cells, ...blits].map(lowestPixel))
  await $.command.run({ command: 'pokemon', args: 'sleep' })
  blits.length = 0
  await clock.advance(3000)
  expect(blits.length).toBeGreaterThan(0)
  expect(blits.every((cells) => lowestPixel(cells) === ground)).toBe(true)
})

test('draws food circles and happiness hearts at the right edge as text', async ($, on) => {
  await startedWith($, on, {}, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // A new mon starts at 80%: four filled icons and one empty in each meter
  expect(await ui.find({ type: 'Text', text: '●●●●○' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '♥♥♥♥♡' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /🍓|💗/ })).toBeUndefined()
})

test('/pokemon emoji swaps the meters for emoji in a wider panel, saves it, and swaps them back', async ($, on) => {
  const saved: Record<string, any> = {}
  const { clock } = await startedWith($, on, saved, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'pokemon' })).props.columns).toBe(RASTER)

  const emoji = await $.command.run({ command: 'pokemon', args: 'emoji' })
  expect(emoji.text).toBe('The meters show emoji: 🍓🍓🍓🍓○ 💗💗💗💗♡')
  expect(saved.emoji).toBe(true)
  await clock.advance(100)
  expect(await ui.find({ type: 'Text', text: '🍓🍓🍓🍓○ ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '💗💗💗💗♡ ' })).toBeDefined()
  expect((await ui.find({ key: 'pokemon' })).props.columns).toBe(MARGIN + STRIP + EMOJI_PANEL)

  const text = await $.command.run({ command: 'pokemon', args: 'emoji' })
  expect(text.text).toBe('The meters show text icons: ●●●●○ ♥♥♥♥♡')
  expect(saved.emoji).toBe(false)
  await clock.advance(100)
  expect(await ui.find({ type: 'Text', text: '●●●●○' })).toBeDefined()
  expect((await ui.find({ key: 'pokemon' })).props.columns).toBe(RASTER)
})

test('a saved emoji choice draws emoji meters from the start', async ($, on) => {
  await startedWith($, on, { emoji: true }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '🍓🍓🍓🍓○ ' })).toBeDefined()
  expect((await ui.find({ key: 'pokemon' })).props.columns).toBe(MARGIN + STRIP + EMOJI_PANEL)
})

test('narrows the strip to keep the meters, and hides them when even the mon barely fits', async ($, on) => {
  await startedWith($, on, {}, 0)
  const narrow = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 44 } })
  expect((await narrow.find({ key: 'pokemon' })).props.columns).toBe(44)
  expect(await narrow.find({ type: 'Text', text: /●/ })).toBeDefined()
  await narrow.unmount()
  const tight = SPRITES.abra.width + 5
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: tight } })
  expect((await ui.find({ key: 'pokemon' })).props.columns).toBe(tight)
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeUndefined()
})

test('emoji meters need their wider panel to show beside a narrow strip', async ($, on) => {
  await startedWith($, on, { emoji: true }, 0)
  const fits = SPRITES.abra.width + EMOJI_PANEL
  const wide = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: fits } })
  expect(await wide.find({ type: 'Text', text: /🍓/ })).toBeDefined()
  await wide.unmount()
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: fits - 1 } })
  expect(await ui.find({ type: 'Text', text: /🍓/ })).toBeUndefined()
})

test('a bubble beside the head floats over the meters column instead of being cut off', async ($, on) => {
  const low = { value: 10, at: 0 }
  const { clock, blits } = await startedWith($, on, { wander: false, stats: { abra: { food: low, happiness: low } } }, 0)
  // A strip barely wider than Abra, so the bubble has no room on the left and goes right
  const strip = SPRITES.abra.width + 2
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: strip + PANEL } })
  const raster = await ui.find({ key: 'pokemon' })
  expect(raster.props.columns).toBe(strip + PANEL)
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeDefined()
  await clock.advance(100)
  const painted = paintedCells(await shown(ui, blits))
  const width = strip + PANEL
  const meterTop = raster.props.rows - 3
  const past = painted.filter((p, i) => p && i % width >= strip)
  const underMeters = painted.filter((p, i) => p && i % width >= strip && Math.floor(i / width) >= meterTop)
  expect(past.length).toBeGreaterThan(0)
  expect(underMeters.length).toBe(0)
})

test('food and happiness drain over real time while a session runs', async ($, on) => {
  const full = { value: 100, at: 0 }
  // Another session marked the store seen moments ago, so the whole time counts
  await startedWith($, on, { stats: { abra: { food: full, happiness: full } }, seenAt: 4 * HOUR - 5000 }, 4 * HOUR)
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toContain('food 50%, happiness 67%')
})

test('time with Claude Code closed or the laptop off drains at a quarter speed', async ($, on) => {
  const full = { value: 100, at: 0 }
  const saved: Record<string, any> = { stats: { abra: { food: full, happiness: full }, pikachu: { food: { value: 40, at: 0 } } }, seenAt: 0 }
  await startedWith($, on, saved, 4 * HOUR)
  // 4 hours closed count as 1, plus the 10 s beat before the gap at full speed
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toContain('food 87%, happiness 92%')
  // Every mon's meters moved on and were saved, and the store is marked seen now
  expect(saved.stats.pikachu.food.at).toBe(0.75 * (4 * HOUR - 10 * 1000))
  expect(saved.stats.pikachu.food.value).toBe(40)
  expect(saved.seenAt).toBe(4 * HOUR)
})

test('switching away parks a mon, and its meters pick up where they stopped when it comes back', async ($, on) => {
  const full = { value: 100, at: 0 }
  const saved: Record<string, any> = { stats: { abra: { food: full, happiness: full } }, seenAt: 0 }
  await startedWith($, on, saved, 0)
  await $.command.run({ command: 'pokemon', args: 'bulbasaur' })
  expect(saved.stats.abra.parked).toBe(true)
  expect(saved.stats.abra.food.value).toBe(100)
})

test('a parked mon loses nothing while another one is shown, even across sessions', async ($, on) => {
  // Abra was parked at 60% food 8 hours ago, and another session has run since
  const saved: Record<string, any> = {
    mon: 'bulbasaur',
    stats: { abra: { food: { value: 60, at: 0 }, happiness: { value: 70, at: 0 }, parked: true } },
    seenAt: 8 * HOUR - 5000,
  }
  await startedWith($, on, saved, 8 * HOUR)
  await $.command.run({ command: 'pokemon', args: 'abra' })
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toContain('food 60%, happiness 70%')
  expect(saved.stats.abra.parked).toBeUndefined()
  expect(saved.stats.abra.food.at).toBe(8 * HOUR)
})

test('an open session keeps the store marked seen', async ($, on) => {
  const saved: Record<string, any> = {}
  const { clock } = await startedWith($, on, saved, 0)
  await clock.advance(30 * 1000)
  expect(saved.seenAt).toBeGreaterThanOrEqual(20 * 1000)
})

test('feeding fills food, petting fills happiness, and both are saved once the mon has eaten and enjoyed it', async ($, on) => {
  const saved: Record<string, any> = { stats: { abra: { food: { value: 10, at: 0 }, happiness: { value: 10, at: 0 } } } }
  const { clock } = await startedWith($, on, saved, 0)
  await $.command.run({ command: 'pokemon', args: 'feed' })
  // Nothing fills while the berry falls
  const before = await $.command.run({ command: 'pokemon', args: '' })
  expect(before.text).toContain('food 10%, happiness 10%')
  // Long enough to land, walk the whole strip, and eat
  await clock.advance(150 * 40 + 2000)
  const fed = await $.command.run({ command: 'pokemon', args: '' })
  expect(fed.text).toContain('food 30%, happiness 15%')
  expect(Math.round(saved.stats.abra.food.value)).toBe(30)
  await $.command.run({ command: 'pokemon', args: 'pet' })
  // Nothing fills while the hearts float
  const petting = await $.command.run({ command: 'pokemon', args: '' })
  expect(petting.text).toContain('food 30%, happiness 15%')
  await clock.advance(4000)
  const after = await $.command.run({ command: 'pokemon', args: '' })
  expect(after.text).toContain('food 30%, happiness 40%')
  expect(Math.round(saved.stats.abra.happiness.value)).toBe(40)
})

test('while it eats or enjoys a pet, commands that change it wait, and the ones that only show something run', async ($, on) => {
  const saved: Record<string, any> = { mon: 'abra', stats: { abra: { xp: 900 } } }
  const { clock } = await startedWith($, on, saved, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text
  await run('feed')
  for (const args of ['pet', 'feed', 'release abra', 'pikachu', 'sleep', 'nickname Spoon', 'attack', 'shiny']) {
    expect(await run(args)).toBe('Abra is busy eating. Try again in a moment.')
  }
  expect(await run('stats')).toMatch(/^Abra, Lv\. 9,/)
  expect(await run('box')).toMatch(/^1 mon in your box:/)
  expect(await run('moves')).toMatch(/^Abra knows /)
  await clock.advance(150 * 40 + 2000)
  await run('pet')
  expect(await run('release abra')).toBe('Abra is enjoying the pets. Try again in a moment.')
  await clock.advance(4000)
  expect(await run('release abra')).toMatch(/^You release Abra\./)
  expect(saved.stats.abra).toBeUndefined()
})

test('a mon as happy as can be still enjoys a pet, but it fills no meter and doesn\'t count as one', async ($, on) => {
  const saved: Record<string, any> = { pets: 5, stats: { abra: { food: { value: 50, at: 0 }, happiness: { value: 90, at: 0 } } } }
  await startedWith($, on, saved, 0)
  const answer = await $.command.run({ command: 'pokemon', args: 'pet' })
  expect(answer.text).toMatch(/♥ Abra is already as happy as can be\.$/)
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toContain('food 50%, happiness 90%')
  expect(saved.pets).toBe(5)
})

test('a full mon still eats the berry, but it fills no meter and doesn\'t count as a feed', async ($, on) => {
  const saved: Record<string, any> = { feeds: 4, stats: { abra: { food: { value: 90, at: 0 }, happiness: { value: 50, at: 0 } } } }
  await startedWith($, on, saved, 0)
  const answer = await $.command.run({ command: 'pokemon', args: 'feed' })
  expect(answer.text).toMatch(/Abra is already full, so it just nibbles it\.$/)
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toContain('food 90%, happiness 50%')
  expect(saved.feeds).toBe(4)
})

test('/pokemon sleep slows both meters, even between sessions, and shows in the status', async ($, on) => {
  const full = { value: 100, at: 0 }
  await startedWith($, on, { stats: { abra: { food: full, happiness: full, asleep: true } } }, 8 * HOUR)
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toContain('food 50%, happiness 83%')
  expect(status.text).toContain('Abra Lv. 5, asleep')
})

test('/pokemon sleep tucks the mon in until Claude starts working, and saves the meters at each switch', async ($, on) => {
  const saved: Record<string, any> = { stats: { abra: { food: { value: 100, at: 0 }, happiness: { value: 100, at: 0 } } } }
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const { clock } = await startedWith($, on, saved, 4 * HOUR)
  const tucked = await $.command.run({ command: 'pokemon', args: 'sleep' })
  expect(tucked.text).toContain('falls asleep')
  expect(saved.stats.abra.asleep).toBe(true)
  expect(saved.stats.abra.food).toEqual({ value: 50, at: 4 * HOUR })

  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(60 * 1000)
  expect(saved.stats.abra.asleep).toBe(true)

  await $.turn.start({ text: 'hi', turnId: 't' })
  await clock.advance(100)
  expect(saved.stats.abra.asleep).toBe(false)
  expect(saved.stats.abra.food.at).toBeGreaterThan(4 * HOUR)

  const busy = await $.command.run({ command: 'pokemon', args: 'sleep' })
  expect(busy.text).toContain("can't sleep while Claude is working")
})

test('/pokemon sleep goes by the turn events, not the band\'s isWorking', async ($, on) => {
  const saved: Record<string, any> = {}
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await startedWith($, on, saved, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  const tucked = await $.command.run({ command: 'pokemon', args: 'sleep' })
  expect(tucked.text).toContain('falls asleep')
  await $.command.run({ command: 'pokemon', args: 'sleep' })

  await $.turn.start({ text: 'hi', turnId: 't' })
  const busy = await $.command.run({ command: 'pokemon', args: 'sleep' })
  expect(busy.text).toContain("can't sleep while Claude is working")
  await $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 1000, isAborted: false, usage: null })
  const after = await $.command.run({ command: 'pokemon', args: 'sleep' })
  expect(after.text).toContain('falls asleep')
})

test('a sleeping mon shuts its eyes', async ($, on) => {
  const EYE_WHITE = 0xe8e8f8
  const saved: Record<string, any> = { mon: 'pikachu' }
  await startedWith($, on, saved, 0)
  const awake = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(paints((await awake.find({ key: 'pokemon' })).props.cells, EYE_WHITE)).toBe(true)
  await awake.unmount()
  await $.command.run({ command: 'pokemon', args: 'sleep' })
  const asleep = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(paints((await asleep.find({ key: 'pokemon' })).props.cells, EYE_WHITE)).toBe(false)
})

test('a sleeping Gengar shuts its eyes, which have no white highlight', async ($, on) => {
  const EYE_PINK = 0xf8a8a0
  await startedWith($, on, { mon: 'gengar' }, 0)
  const awake = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(paints((await awake.find({ key: 'pokemon' })).props.cells, EYE_PINK)).toBe(true)
  await awake.unmount()
  await $.command.run({ command: 'pokemon', args: 'sleep' })
  const asleep = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(paints((await asleep.find({ key: 'pokemon' })).props.cells, EYE_PINK)).toBe(false)
})

// Every frame of every mon with its eyes shut
function shutFrames() {
  const frames: any[] = []
  for (const [mon, sprite] of Object.entries(SPRITES)) {
    for (const [variant, sheet] of Object.entries(sprite.variants)) {
      for (const view of ['idle', 'walk']) {
        for (const [i, { rows }] of sheet[view].entries()) {
          const boxes = eyesOf(mon, variant, view, i)
          const where = `${mon} ${variant} ${view} ${i}`
          frames.push({ mon, where, rows, palette: sheet.palette, boxes, shut: closedEyes(rows, sheet.palette, boxes) })
        }
      }
    }
  }
  return frames
}

test('shutting the eyes keeps every frame\'s size and palette', async () => {
  for (const { rows, palette, shut } of shutFrames()) {
    expect(shut.length).toBe(rows.length)
    for (const [y, row] of shut.entries()) {
      expect(row.length).toBe(rows[y].length)
      for (const letter of row) if (letter !== '.') expect(letter.charCodeAt(0) - 97).toBeLessThan(palette.length)
    }
  }
})

test('every frame of every mon has its eyes marked', async () => {
  expect(shutFrames().filter(({ boxes }) => !Array.isArray(boxes)).map(({ where }) => where)).toEqual([])
})

test('shutting the eyes paints skin over each eye and a lid on its bottom row, and nothing else', async () => {
  const wrong: string[] = []
  for (const { where, rows, boxes: marked, shut } of shutFrames()) {
    const boxes = marked ?? []
    const inBox = (x, y) => boxes.some(([bx, by, w, h]) => x >= bx && x < bx + w && y >= by && y < by + h)
    for (const [y, row] of rows.entries()) {
      for (const [x, letter] of [...row].entries()) if (!inBox(x, y) && shut[y][x] !== letter) wrong.push(`${where} changed (${x}, ${y}) outside the eyes`)
    }
    for (const [bx, by, w, h] of boxes) {
      const skin = new Set()
      const lid = new Set()
      for (let y = by; y < by + h; y++) {
        for (let x = bx; x < bx + w; x++) if (shut[y][x] !== '.') (y === by + h - 1 ? lid : skin).add(shut[y][x])
      }
      if (skin.size > 1) wrong.push(`${where} left more than skin in the eye at (${bx}, ${by})`)
      if (lid.size !== 1 || skin.has([...lid][0])) wrong.push(`${where} has no lid on the eye at (${bx}, ${by})`)
    }
    if (boxes.length > 0 && shut.every((row, y) => row === rows[y])) wrong.push(`${where} didn't change`)
  }
  expect(wrong).toEqual([])
})

test('ghosts, dark and rocky bodies, and dot-eyed mons shut their eyes on every frame', async () => {
  const mons = ['gengar', 'gastly', 'haunter', 'charizard', 'golem', 'magnemite', 'voltorb', 'tangela', 'ditto']
  const open = shutFrames().filter(({ mon, rows, shut }) => mons.includes(mon) && shut.every((row, y) => row === rows[y]))
  expect(open.map(({ where }) => where)).toEqual([])
})

test('/pokemon sleep walks the mon home before it shuts its eyes', async ($, on) => {
  const EYE_WHITE = 0xe8e8f8
  const { clock, blits } = await startedWith($, on, { mon: 'pikachu', wander: false }, 0)
  const idle = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const home = rightEdge((await idle.find({ key: 'pokemon' })).props.cells)
  await idle.unmount()

  const busy = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  await clock.advance(150 * 8)
  await busy.unmount()
  await $.command.run({ command: 'pokemon', args: 'sleep' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(150)
  const walking = await shown(ui, blits)
  expect(rightEdge(walking)).toBeLessThan(home)
  expect(paints(walking, EYE_WHITE)).toBe(true)

  await clock.advance(150 * 40)
  const asleep = await shown(ui, blits)
  expect(rightEdge(asleep)).toBe(home)
  expect(paints(asleep, EYE_WHITE)).toBe(false)
})

test('/pokemon sleep again wakes the mon up', async ($, on) => {
  const saved: Record<string, any> = {}
  await startedWith($, on, saved, 0)
  await $.command.run({ command: 'pokemon', args: 'sleep' })
  const woken = await $.command.run({ command: 'pokemon', args: 'sleep' })
  expect(woken.text).toBe('Abra wakes up.')
  expect(saved.stats.abra.asleep).toBe(false)
})

test('/pokemon sleep works in an idle session while Claude works in another', async ($, on) => {
  // A fresh busy mark, as an earlier version left while its session was mid-turn
  const saved: Record<string, any> = { 'busy:other': 0 }
  await startedWith($, on, saved, 0)
  const slept = await $.command.run({ command: 'pokemon', args: 'sleep' })
  expect(slept.text).toMatch(/falls asleep/)
  expect(saved.stats.abra.asleep).toBe(true)
})

test('a save here lands on the XP and meters another session saved since the last sync', async ($, on) => {
  const saved: Record<string, any> = { mon: 'abra', stats: { abra: { xp: 100, food: { value: 50, at: 0 }, happiness: { value: 10, at: 0 } } } }
  const { clock } = await startedWith($, on, saved, 0)
  await $.command.run({ command: 'pokemon', args: 'pet' })
  // Before this session syncs, another one earns XP and feeds the same mon
  saved.stats = { abra: { xp: 900, food: { value: 70, at: 0 }, happiness: { value: 10, at: 0 } } }
  // The pet pays out once its hearts have floated away
  await clock.advance(4000)
  expect(saved.stats.abra.xp).toBe(900)
  expect(Math.round(saved.stats.abra.food.value)).toBe(70)
  expect(Math.round(saved.stats.abra.happiness.value)).toBe(35)
})

test('put to bed in another session, the mon wakes as soon as Claude works here', async ($, on) => {
  const saved: Record<string, any> = {}
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const { clock } = await startedWith($, on, saved, 0)
  await $.turn.start({ text: 'hi', turnId: 't' })
  // Another session tucks it in, as its /pokemon sleep would
  saved.stats = { abra: { asleep: true, food: { value: 80, at: 0 }, happiness: { value: 80, at: 0 } } }
  await clock.advance(3000)
  expect(saved.stats.abra.asleep).toBe(false)
})

test('feeding or petting in another session shows here within a second', async ($, on) => {
  const saved: Record<string, any> = { mon: 'abra', stats: { abra: { food: { value: 30, at: 0 }, happiness: { value: 30, at: 0 } } } }
  const { clock } = await startedWith($, on, saved, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '●●○○○' })).toBeDefined()
  // Another session feeds it, as its /pokemon feed would
  saved.stats = { abra: { food: { value: 50, at: 0 }, happiness: { value: 35, at: 0 } } }
  await clock.advance(1100)
  expect(await ui.find({ type: 'Text', text: '●●●○○' })).toBeDefined()
})

test('a release keeps the records other sessions saved, and one in another session shows here', async ($, on) => {
  const saved: Record<string, any> = { mon: 'abra', stats: { abra: { xp: 900, nickname: 'Spoon' }, pikachu: { xp: 1728 } } }
  const { clock } = await startedWith($, on, saved, 0)
  // Another session raises Bulbasaur after this one started
  saved.stats = { ...saved.stats, bulbasaur: { xp: 125 } }
  expect((await $.command.run({ command: 'pokemon', args: 'release pikachu' })).text).toBe('You release Pikachu. Bye-bye, Pikachu!')
  expect(Object.keys(saved.stats).sort()).toEqual(['abra', 'bulbasaur'])
  // Another session releases the shown mon
  saved.stats = { bulbasaur: { xp: 125 } }
  await clock.advance(1100)
  expect((await $.command.run({ command: 'pokemon', args: 'stats' })).text).toMatch(/^Abra, Lv\. 5,/)
})

test('each feed adds exactly one food icon', async ($, on) => {
  const saved: Record<string, any> = { stats: { abra: { food: { value: 39, at: 0 }, happiness: { value: 50, at: 0 } } } }
  const { clock } = await startedWith($, on, saved, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '●●○○○' })).toBeDefined()
  await $.command.run({ command: 'pokemon', args: 'feed' })
  // The meter fills once the berry is eaten
  await clock.advance(15 * 1000)
  expect(await ui.find({ type: 'Text', text: '●●●○○' })).toBeDefined()
})

test('a mon picked in another session doesn\'t switch this one', async ($, on) => {
  const saved: Record<string, any> = { mon: 'abra', stats: { abra: { xp: 900 } } }
  const { clock } = await startedWith($, on, saved, 0)
  // Another session picks Seel, as its /pokemon seel would
  saved.mon = 'seel'
  saved.stats = { ...saved.stats, seel: { xp: 1728 } }
  await clock.advance(3000)
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toMatch(/^Showing default Abra Lv\. 9/)
})

test('a mon evolved in another session evolves here too, and picking the old one shows it again', async ($, on) => {
  const saved: Record<string, any> = { mon: 'charmander', stats: { charmander: { xp: 3000, nickname: 'Embers' } } }
  const { clock } = await startedWith($, on, saved, 0)
  // Another session evolves it, as its moveRecord would
  saved.stats = { charmeleon: { xp: 4096, nickname: 'Embers' } }
  saved.evolved = { charmander: 'charmeleon' }
  await clock.advance(1100)
  expect((await $.command.run({ command: 'pokemon', args: 'stats' })).text).toMatch(/^Embers \(Charmeleon\), Lv\./)
  expect(saved.stats.charmander).toBeUndefined()

  await $.command.run({ command: 'pokemon', args: 'charmander' })
  expect(saved.evolved).toEqual({})
  await clock.advance(1100)
  expect((await $.command.run({ command: 'pokemon', args: 'stats' })).text).toMatch(/^Charmander, Lv\. 5,/)
})

test('a new session starts with the mon last picked in any session, and old per-session keys are cleared', async ($, on) => {
  const saved: Record<string, any> = { mon: 'abra', 'mon:old-session': { name: 'ditto', at: 0 }, 'busy:old-session': 0 }
  await startedWith($, on, saved, 0)
  await $.command.run({ command: 'pokemon', args: 'ditto' })
  expect(saved.mon).toBe('ditto')
  saved.mon = 'bulbasaur'
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toMatch(/^Showing default Bulbasaur /)
  expect(Object.keys(saved).some((key) => key.startsWith('mon:') || key.startsWith('busy:'))).toBe(false)
})

test('put to bed in another session showing the same mon, it sleeps here too', async ($, on) => {
  const saved: Record<string, any> = { mon: 'abra', stats: { abra: { food: { value: 80, at: 0 }, happiness: { value: 80, at: 0 } } } }
  const { clock } = await startedWith($, on, saved, 0)
  // Another session tucks it in, as its /pokemon sleep would
  saved.stats = { abra: { asleep: true, food: { value: 80, at: 0 }, happiness: { value: 80, at: 0 } } }
  await clock.advance(1100)
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toContain('Abra Lv. 5, asleep')
})

test('a mon parked by a session that switched away keeps draining while this one shows it', async ($, on) => {
  const full = { value: 100, at: 0 }
  const saved: Record<string, any> = { mon: 'abra', stats: { abra: { food: full, happiness: full } } }
  const { clock } = await startedWith($, on, saved, 4 * HOUR)
  // Another session showing Abra switches away, parking it at its meters as of now
  saved.stats = { abra: { food: { value: 50, at: 4 * HOUR }, happiness: { value: 200 / 3, at: 4 * HOUR }, parked: true } }
  await clock.advance(1100)
  expect(saved.stats.abra.parked).toBeUndefined()
  expect(saved.stats.abra.food).toEqual({ value: 50, at: 4 * HOUR })
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toContain('food 50%, happiness 67%')
})

test('saving this mon\'s meters keeps the records other sessions saved', async ($, on) => {
  const saved: Record<string, any> = { mon: 'abra' }
  const { clock } = await startedWith($, on, saved, 0)
  // Another session feeds its Seel after this one started
  saved.stats = { seel: { food: { value: 100, at: 0 }, happiness: { value: 90, at: 0 } } }
  await $.command.run({ command: 'pokemon', args: 'pet' })
  // The happiness is paid once the hearts have floated away
  await clock.advance(10 * 1000)
  expect(saved.stats.seel.food.value).toBe(100)
  expect(saved.stats.abra.happiness).toBeDefined()
})

// The frame on screen: the last blit, or the drawn frame while every tick has repeated it
async function shown(ui, blits: string[]): Promise<string> {
  return blits[blits.length - 1] ?? (await ui.find({ key: 'pokemon' })).props.cells
}

test('a hungry idle mon shows a berry bubble until it is fed', async ($, on) => {
  const low = { value: 15, at: 0 }
  const fine = { value: 90, at: 0 }
  const { clock, blits } = await startedWith($, on, { stats: { abra: { food: low, happiness: fine } } }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(100)
  const hungry = await shown(ui, blits)
  expect(paints(hungry, BUBBLE_OUTLINE)).toBe(true)
  expect(paints(hungry, 0xd84040)).toBe(true)
  expect(paints(hungry, 0xf0609a)).toBe(false)

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
  expect(paints(await shown(ui, blits), 0xf0609a)).toBe(true)
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

test('with autoevolve off, a level-up waits for /pokemon evolve, and turning it back on evolves once idle', { timeoutMs: 30000 }, async ($, on) => {
  const toasts = toastsOf(on)
  on('turn.complete', () => ({ text: '' }))
  const saved: Record<string, any> = { mon: 'charmander', wander: false, stats: { charmander: { xp: 16 ** 3 - 1 } } }
  const { clock } = await startedWith($, on, saved, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text
  expect(await run('autoevolve')).toBe('Charmander waits for /pokemon evolve when it reaches its evolution level.')
  expect(saved.autoEvolve).toBe(false)

  await $.turn.complete(ANSWERED)
  expect(toasts).toEqual(['Charmander grew to Lv. 16!', 'Charmander is ready to evolve into Charmeleon! /pokemon evolve lets it.'])
  await clock.advance(1000)
  expect(toasts).toHaveLength(2)
  expect(await run('stats')).toMatch(/^Charmander, Lv\. 16, .* Ready to evolve into Charmeleon\. \/pokemon evolve lets it\./)

  expect(await run('autoevolve')).toBe('Charmander evolves on its own once idle at its evolution level.')
  await clock.advance(50)
  expect(toasts[2]).toBe('What? Charmander is evolving!')
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
  const tight = SPRITES.charmander.width + 5
  const narrow = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: tight } })
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

// An Image's PNG source by chunk type, read without inflating it
function pngChunks(png: string): Map<string, Uint8Array> {
  const bytes = Uint8Array.fromBase64(png)
  const view = new DataView(bytes.buffer)
  const chunks = new Map<string, Uint8Array>()
  for (let at = 8; at < bytes.length; ) {
    const length = view.getUint32(at)
    chunks.set(String.fromCharCode(...bytes.subarray(at + 4, at + 8)), bytes.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  return chunks
}

function pngSize(png: string): { width: number; height: number } {
  const header = new DataView(pngChunks(png).get('IHDR').slice().buffer)
  return { width: header.getUint32(0), height: header.getUint32(4) }
}

// The opaque colors in an Image's PNG palette
function imageColors(png: string): Set<number> {
  const chunks = pngChunks(png)
  const palette = chunks.get('PLTE')
  const alpha = chunks.get('tRNS')
  const colors = new Set<number>()
  for (let k = 0; k < palette.length / 3; k++) if (alpha[k] > 0) colors.add((palette[k * 3] << 16) | (palette[k * 3 + 1] << 8) | palette[k * 3 + 2])
  return colors
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

function adler32(bytes: number[]): number {
  let [a, b] = [1, 0]
  for (const byte of bytes) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

// Each chunk of a PNG, in order, with whether its CRC matches
function pngParts(png: string): { type: string; data: Uint8Array; crcOk: boolean }[] {
  const bytes = Uint8Array.fromBase64(png)
  const view = new DataView(bytes.buffer)
  const parts = []
  for (let at = 8; at < bytes.length; ) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const crcOk = crc32(bytes.subarray(at + 4, at + 8 + length)) === view.getUint32(at + 8 + length)
    parts.push({ type, data: bytes.subarray(at + 8, at + 8 + length), crcOk })
    at += 12 + length
  }
  return parts
}

test('png.js writes a valid paletted PNG, with every chunk checksummed', async () => {
  // Red, see-through, blue, red
  const rgba = new Uint8Array([255, 0, 0, 255, 9, 9, 9, 0, 0, 0, 255, 255, 255, 0, 0, 255])
  const png = encodePng(2, 2, rgba)
  expect(Array.from(Uint8Array.fromBase64(png).subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const parts = pngParts(png)
  expect(parts.map((part) => part.type)).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'])
  expect(parts.every((part) => part.crcOk)).toBe(true)
  expect(pngSize(png)).toEqual({ width: 2, height: 2 })
  // 8 bits per index, a palette of colors in order of first use, the see-through one black
  expect(Array.from(parts[0].data.subarray(8))).toEqual([8, 3, 0, 0, 0])
  expect(Array.from(parts[1].data)).toEqual([255, 0, 0, 0, 0, 0, 0, 0, 255])
  expect(Array.from(parts[2].data)).toEqual([255, 0, 255])
  // A zlib stream of one final fixed Huffman block, ending in the Adler-32 of the rows,
  // each filtered against the one above
  const idat = parts[3].data
  expect([idat[0], idat[1], idat[2] & 7]).toEqual([0x78, 0x01, 3])
  const sum = new DataView(idat.slice(-4).buffer).getUint32(0)
  expect(sum).toBe(adler32([2, 0, 1, 2, 2, 255]))
  expect(parts[4].data.length).toBe(0)

  // Past 256 colors, the pixels go out as RGBA
  const many = new Uint8Array(32 * 32 * 4).map((_, i) => [(i >> 2) & 255, i >> 10, 0, 255][i % 4])
  const rgbaParts = pngParts(encodePng(32, 32, many))
  expect(rgbaParts.map((part) => part.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
  expect(rgbaParts[0].data[9]).toBe(6)
  expect(rgbaParts.every((part) => part.crcOk)).toBe(true)
})

test('png.js encodes a sprite frame the same way every time, in a small part of its RGBA', async () => {
  const { palette, idle } = SPRITES.gyarados.variants.default
  const [width, height, up] = [64, SPRITES.gyarados.height + 4, 4]
  const rgba = new Uint8Array(width * up * height * up * 4)
  idle[0].rows.forEach((row, y) =>
    [...row].forEach((letter, x) => {
      if (letter === '.') return
      const hex = parseInt(palette[letter.charCodeAt(0) - 97].slice(1), 16)
      for (let dy = 0; dy < up; dy++) {
        for (let dx = 0; dx < up; dx++) rgba.set([hex >> 16, (hex >> 8) & 255, hex & 255, 255], (((y + 2) * up + dy) * width * up + (x + 10) * up + dx) * 4)
      }
    }),
  )
  const png = encodePng(width * up, height * up, rgba)
  expect(encodePng(width * up, height * up, rgba)).toBe(png)
  expect(pngSize(png)).toEqual({ width: width * up, height: height * up })
  expect(pngParts(png).every((part) => part.crcOk)).toBe(true)
  expect(Uint8Array.fromBase64(png).length).toBeLessThan(rgba.length / 20)
})

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

  await clock.advance(1000)
  expect([...colorsOf(blits[blits.length - 1])].every((c) => own.has(c))).toBe(true)
  // The band is back to its own size
  expect(blits[blits.length - 1].length).toBe(blits[0].length)
})

test('Transform can pick a mon taller than the caster, and the band grows to fit it', async ($, on) => {
  const { clock, blits } = await startedWith($, on, { wander: false, mon: 'ditto' }, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(1000)
  const own = blits[blits.length - 1].length

  // Almost every other mon is taller than Ditto, so a few tries all but surely land one
  let grew = false
  for (let i = 0; i < 5 && !grew; i++) {
    const seen = blits.length
    await $.command.run({ command: 'pokemon', args: 'attack transform' })
    await clock.advance(4000)
    grew = blits.slice(seen).some((cells) => cells.length > own)
  }
  expect(grew).toBe(true)
  expect(blits[blits.length - 1].length).toBe(own)
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
      // Transform grows the band to fit a taller mon, then shrinks it back
      if (move === 'Transform') expect(frames[frames.length - 1].length).toBe(size)
      else expect(frames.every((cells) => cells.length === size)).toBe(true)
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
      'Charizard, Lv. 40 ○○○○○ ♥♡♡♡♡',
      'Bulbasaur, Lv. 12 ●●●●○ ♥♥♥♥♡',
      'Pikachu, Lv. 12 ●●●○○ ♥♥♥♥♡ (active)',
      'Nidoran♀, Lv. 5 ●●●●○ ♥♥♥♥♡',
    ].join('\n'),
  )
})

test('/pokemon box lists emoji meters once /pokemon emoji turns them on', async ($, on) => {
  const stats = { pikachu: { xp: 12 ** 3, food: { value: 50, at: 0 }, happiness: { value: 10, at: 0 } } }
  await startedWith($, on, { mon: 'pikachu', stats }, 0)
  await $.command.run({ command: 'pokemon', args: 'emoji' })
  const box = await $.command.run({ command: 'pokemon', args: 'box' })
  expect(box.text).toBe('1 mon in your box:\nPikachu, Lv. 12 🍓🍓🍓○ ○ 💗♡ ♡ ♡ ♡ (active)\nOnly Pikachu so far. /pokemon <mon> picks another.')
})

test('/pokemon box leaves out the meters with needs off', async ($, on) => {
  await startedWith($, on, { mon: 'pikachu', needs: false, stats: { pikachu: { xp: 12 ** 3 }, charizard: { xp: 40 ** 3 } } }, 0)
  const box = await $.command.run({ command: 'pokemon', args: 'box' })
  expect(box.text).toBe('2 mons in your box:\nCharizard, Lv. 40\nPikachu, Lv. 12 (active)')
})

test('/pokemon box says when the box is empty, or holds only the active mon', async ($, on) => {
  const saved: Record<string, any> = {}
  const { clock } = await startedWith($, on, saved, 0)
  const run = async () => (await $.command.run({ command: 'pokemon', args: 'box' })).text
  expect(await run()).toBe('Your box is empty. Pet or feed Abra, or finish a turn, to start raising it.')
  await $.command.run({ command: 'pokemon', args: 'pet' })
  // The pet pays out once its hearts have floated away
  await clock.advance(4000)
  expect(await run()).toBe('1 mon in your box:\nAbra, Lv. 5 ●●●●○ ♥♥♥♥♥ (active)\nOnly Abra so far. /pokemon <mon> picks another.')
})

test('/pokemon dex counts nothing before any wild mon turns up', async ($, on) => {
  await startedWith($, on, {}, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text
  expect(await run('dex')).toBe('Pokédex: seen 0, caught 0 of 151. No wild mons met yet.')
  expect(await run('dex pidgey')).toBe('#016 Pidgey, common. Not seen yet.')
  expect(await run('dex agumon')).toBe('Unknown mon "agumon". See /pokemon list for every mon.')
})

test('/pokemon dex lists caught mons in dex order, then the ones only seen', async ($, on) => {
  // Only a caught entry's shiny flag counts
  const dex = {
    snorlax: { seen: 3, caught: 4 },
    pidgey: { seen: 1, caught: 2, shiny: true },
    rattata: { seen: 5, shiny: true },
    venusaur: { seen: 6 },
    agumon: { seen: 7, caught: 7 },
  }
  await startedWith($, on, { dex }, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text
  expect(await run('dex')).toBe(
    ['Pokédex: seen 4, caught 2 of 151 (1 shiny).', '#016 Pidgey ◓ ✦', '#143 Snorlax ◓', 'Seen: Venusaur, Rattata'].join('\n'),
  )
  expect(await run('dex pidgey')).toBe('#016 Pidgey, common. Caught ◓ ✦.')
  expect(await run('dex snorlax')).toBe('#143 Snorlax, rare. Caught ◓.')
  // A female sprite shares its base form's entry
  expect(await run('dex venusaur_female')).toBe('#003 Venusaur, rare. Seen, not caught yet.')
  expect(await run('dex mew')).toBe('#151 Mew, legendary. Not seen yet.')
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

test('/pokemon nickname names the active mon, keeps its case, and its species name takes it away', async ($, on) => {
  const saved: Record<string, any> = { mon: 'pikachu', stats: { pikachu: { xp: 12 ** 3 } } }
  const { clock } = await startedWith($, on, saved, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text

  expect(await run('nickname')).toBe('Name it with /pokemon nickname <name>, up to 12 characters.')
  expect(await run('nickname Sir Sparks A Lot')).toBe('That\'s too long. A nickname fits 12 characters.')
  expect(await run('nickname  Sparky ')).toBe('Pikachu is now Sparky!')
  expect(saved.stats.pikachu).toEqual({ xp: 12 ** 3, nickname: 'Sparky' })
  expect(await run('nickname')).toBe('Pikachu goes by Sparky. Name it with /pokemon nickname <name>, up to 12 characters.')
  expect(await run('nickname Zappy')).toBe('Sparky is now Zappy!')

  expect(await run('pet')).toMatch(/^Zappy /)
  // The pet pays out once its hearts have floated away
  await clock.advance(4000)
  expect(await run('stats')).toMatch(/^Zappy \(Pikachu\), Lv\. 12,/)
  expect(await run('box')).toBe('1 mon in your box:\nZappy (Pikachu), Lv. 12 ●●●●○ ♥♥♥♥♥ (active)\nOnly Zappy so far. /pokemon <mon> picks another.')
  expect(await run('')).toContain('Zappy Lv. 12')

  expect(await run('nickname PIKACHU')).toBe('Zappy is just Pikachu again.')
  expect(saved.stats.pikachu.nickname).toBeUndefined()
  expect(await run('nickname pikachu')).toBe('Pikachu has no nickname.')
})

test('a nickname with no other record leaves no record behind when taken away, and release drops it', async ($, on) => {
  const saved: Record<string, any> = { mon: 'abra' }
  await startedWith($, on, saved, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text

  await run('nickname Spoony')
  await run('nickname abra')
  expect(saved.stats).toEqual({})

  await run('nickname Spoony')
  expect(await run('release abra')).toBe('You release Spoony. Bye-bye, Spoony! A fresh Abra takes its place.')
  expect(saved.stats).toEqual({})
})

test('a nickname carries through evolution', { timeoutMs: 30000 }, async ($, on) => {
  const toasts = toastsOf(on)
  const saved: Record<string, any> = { mon: 'pikachu', stats: { pikachu: { xp: 12 ** 3 } } }
  const { clock } = await startedWith($, on, saved, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text

  await run('nickname Sparky')
  expect(await run('evolve')).toBe('You use a Thunder Stone on Sparky.')
  await clock.advance(7100)
  expect(toasts).toEqual(['What? Sparky is evolving!', 'Congratulations! Your Sparky evolved into Raichu!'])
  expect(saved.stats).toEqual({ raichu: { xp: 12 ** 3, nickname: 'Sparky' } })
  expect(await run('nickname')).toBe('Raichu goes by Sparky. Name it with /pokemon nickname <name>, up to 12 characters.')
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
  on('env.get', () => ({ value: undefined }))
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

// A small band lays out like a full-size one, its margin and panel included, at half
// the columns. Abra's 11 rows halve to 6, the full-size scene padded to 12 on top.
const SMALL = (MARGIN + STRIP + 2 * PANEL) / 2

// The env.get stub for a terminal, by the names TERM_PROGRAM and TERM_PROGRAM_VERSION
function terminalEnv(on, env: Record<string, string>) {
  on('env.get', ($, e) => ({ value: env[e.name] }))
}

test('/pokemon size small halves the band, saves it, and medium brings it back', async ($, on) => {
  const saved: Record<string, any> = {}
  const { clock, sent } = await startedWith($, on, saved, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const full = (await ui.find({ key: 'pokemon' })).props
  expect(full.columns).toBe(RASTER)

  const small = await $.command.run({ command: 'pokemon', args: 'size small' })
  expect(small.text).toBe('The band is small.')
  expect(saved.size).toBe('small')
  await clock.advance(100)
  // The terminal scales the Image, so it holds every full-size pixel, 4 wide and tall
  const image = await ui.find({ type: 'Image' })
  expect(image.key).toBe('pokemon')
  expect(image.props.rows).toBe(Math.ceil(full.rows / 2))
  expect(image.props.columns).toBe(SMALL)
  expect(pngSize(image.props.source.png)).toEqual({ width: SMALL * 2 * 4, height: 12 * 2 * 4 })
  expect(imageColors(image.props.source.png).size).toBeGreaterThan(3)
  expect(await ui.find({ type: 'Text', text: '●●●●○' })).toBeDefined()

  // Later frames swap the one Image's source, as new frames do a Raster's cells
  const from = sent.length
  await clock.advance(2000)
  const swaps = sent.slice(from)
  expect(swaps.length).toBeGreaterThan(0)
  expect(swaps.every((e) => e.key === 'pokemon' && e.source && e.columns === SMALL && e.rows === image.props.rows)).toBe(true)
  expect(swaps.some((e, i) => i > 0 && e.source.png === swaps[i - 1].source.png)).toBe(false)
  expect(await ui.findAll({ type: 'Image' })).toHaveLength(1)

  const status = await $.command.run({ command: 'pokemon', args: 'size' })
  expect(status.text).toBe('The band is small. Sizes: small, medium.')
  const unknown = await $.command.run({ command: 'pokemon', args: 'size huge' })
  expect(unknown.text).toBe('Unknown size "huge". Try one of: small, medium.')
  expect(saved.size).toBe('small')

  await $.command.run({ command: 'pokemon', args: 'size medium' })
  expect(saved.size).toBe('medium')
  await clock.advance(100)
  expect((await ui.find({ key: 'pokemon' })).props.columns).toBe(RASTER)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
})

// Start a session with the small size saved, each blit answered by answer
async function startedSmall($, on, answer: (e: any) => object) {
  const clock = mock.clock(on)
  on('ui.render', () => THEIRS)
  on('ui.blit', ($, e) => ({ value: answer(e) }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('env.get', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', ($, e) => ({ value: e.key === 'size' ? 'small' : undefined }))
  on('store.set', () => ({ value: undefined }))
  on('store.keys', () => ({ value: [] }))
  on('store.delete', () => ({ value: undefined }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  return clock
}

test('a terminal that draws an Image as its alt gets the small band in half blocks, asking again less and less often', async ($, on) => {
  const kinds: string[] = []
  const clock = await startedSmall($, on, (e) => {
    kinds.push(e.cells ? 'cells' : 'image')
    return e.cells ? {} : { deny: 'the Image draws its alt here: the terminal draws no placeholder images' }
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Image' })).toBeDefined()

  await clock.advance(200)
  const raster = await ui.find({ key: 'pokemon' })
  expect(raster.type).toBe('Raster')
  expect(raster.props.columns).toBe(SMALL)
  expect(colorsOf(raster.props.cells).size).toBeGreaterThan(3)
  const asked = kinds.filter((kind) => kind === 'image').length
  expect(asked).toBeGreaterThan(0)
  await clock.advance(1000)
  expect(kinds.filter((kind) => kind === 'image')).toHaveLength(asked)
  expect(kinds).toContain('cells')

  // The waits go 2, 4, 8, 16, and 32 seconds, so a minute holds only a few asks
  await clock.advance(60 * 1000)
  const retries = kinds.filter((kind) => kind === 'image').length - asked
  expect(retries).toBeGreaterThanOrEqual(3)
  expect(retries).toBeLessThanOrEqual(8)
  expect((await ui.find({ key: 'pokemon' })).type).toBe('Raster')
})

test('a terminal whose graphics are not ready yet gets the small band back as an Image', async ($, on) => {
  let ready = false
  const answers: boolean[] = []
  const clock = await startedSmall($, on, (e) => {
    if (e.cells) return {}
    answers.push(ready)
    return ready ? {} : { deny: 'the Image draws its alt here: kitty graphics not asked yet' }
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(200)
  expect((await ui.find({ key: 'pokemon' })).type).toBe('Raster')

  ready = true
  await clock.advance(3000)
  const image = await ui.find({ key: 'pokemon' })
  expect(image.type).toBe('Image')
  expect(image.props.columns).toBe(SMALL)
  const from = answers.length
  await clock.advance(2000)
  expect(answers.length).toBeGreaterThan(from)
  expect(answers.slice(from).every(Boolean)).toBe(true)

  // Once it has drawn Images, a deny is brief, so the Image comes back after the first wait
  // The deny comes with the next changed frame, well inside the 2 s wait
  ready = false
  await clock.advance(1000)
  expect((await ui.find({ key: 'pokemon' })).type).toBe('Raster')
  ready = true
  await clock.advance(3000)
  expect((await ui.find({ key: 'pokemon' })).type).toBe('Image')
})

test('VS Code, macOS Terminal and iTerm2 builds whose Image swaps freeze draw the small band in half blocks, no shorter than Diglett', async ($, on) => {
  const clock = mock.clock(on)
  const blits: any[] = []
  const env: Record<string, string> = {}
  on('ui.render', () => THEIRS)
  on('ui.blit', ($, e) => {
    blits.push(e)
    return { value: {} }
  })
  on('session.start', () => ({ cwd: '/work' }))
  terminalEnv(on, env)
  on('command.register', () => ({ value: undefined }))
  on('store.get', ($, e) => ({ value: e.key === 'size' ? 'small' : undefined }))
  on('store.set', () => ({ value: undefined }))
  on('store.keys', () => ({ value: [] }))
  on('store.delete', () => ({ value: undefined }))
  const cases: [string, string | undefined, boolean][] = [
    ['iTerm.app', '3.7.3', false],
    ['iTerm.app', '3.7.20260901-nightly', false],
    ['iTerm.app', undefined, false],
    ['iTerm.app', '3.7.20261008-nightly', true],
    ['iTerm.app', '3.8.0', true],
    ['ghostty', '1.2.0', true],
    ['vscode', '1.105.0', false],
    ['Apple_Terminal', '466', false],
  ]
  for (const [program, version, image] of cases) {
    env.TERM_PROGRAM = program
    if (version === undefined) delete env.TERM_PROGRAM_VERSION
    else env.TERM_PROGRAM_VERSION = version
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    blits.length = 0
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await clock.advance(1000)
    const where = program + ' ' + version
    const band = await ui.find({ key: 'pokemon' })
    expect({ where, type: band.type }).toEqual({ where, type: image ? 'Image' : 'Raster' })
    expect({ where, swaps: blits.length > 0 && blits.every((e) => (image ? e.source : e.cells)) }).toEqual({ where, swaps: true })
    // Abra's 11 rows halve to 6 in an Image, and stop at a full-size Diglett's 7 in half blocks
    expect({ where, rows: band.props.rows }).toEqual({ where, rows: image ? 6 : 7 })
    await ui.unmount()
  }
})

test('a half block small band shrinks no shorter than a full-size Diglett', async ($, on) => {
  const { clock } = await startedWith($, on, { size: 'small' }, 0, { TERM_PROGRAM: 'Apple_Terminal' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // Diglett stays at its full 7 rows, Bulbasaur's 10 stop at 7, and Gyarados's 17 halve to 9
  for (const [mon, rows] of [['diglett', 7], ['bulbasaur', 7], ['gyarados', 9]] as const) {
    await $.command.run({ command: 'pokemon', args: mon })
    await clock.advance(100)
    const band = await ui.find({ key: 'pokemon' })
    expect({ mon, type: band.type, rows: band.props.rows }).toEqual({ mon, type: 'Raster', rows })
  }
  const result = await $.command.run({ command: 'pokemon', args: 'size small' })
  expect(result.text).toBe('The band is small.')
})

// How many pixels paint a color, two per cell with half blocks
function pixelCount(cells: string, color: number): number {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  let count = 0
  for (let i = 0; i < words.length; i += 3) {
    const [cp, fg, bg] = [words[i], words[i + 1], words[i + 2]]
    const pair = cp === 0x2580 ? [fg, bg] : cp === 0x2584 ? [bg, fg] : cp === 0x20 ? [bg, bg] : []
    count += pair.filter((c) => c === color).length
  }
  return count
}

// The blit answer of a terminal that draws an Image as its alt, which then gets the small
// band in half blocks
const DENY_IMAGES = { deny: 'the Image draws its alt here: the terminal draws no placeholder images' }

test('a half block small band draws a smaller thought bubble around small icon art', async ($, on) => {
  const { clock } = await startedWith($, on, { mon: 'gyarados', size: 'small' }, 0, {}, (e) => (e.source ? DENY_IMAGES : {}))
  await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  await clock.advance(200)
  const raster = (await ui.find({ key: 'pokemon' })).props
  // The small 7 by 7 outline is 20 pixels, and the tail one more
  expect(pixelCount(raster.cells, BUBBLE_OUTLINE)).toBe(21)
  expect(paints(raster.cells, DOTS)).toBe(true)
})

test('a half block small band draws whole Zs and a small whole berry instead of specks', async ($, on) => {
  const { clock, blits } = await startedWith($, on, { mon: 'gyarados', size: 'small', wander: false }, 0, {}, (e) => (e.source ? DENY_IMAGES : {}))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await $.command.run({ command: 'pokemon', args: 'feed' })
  await clock.advance(1000)
  const falling = await shown(ui, blits)
  // The small berry's body is two pixels either side of its highlight
  expect(BERRY_BODIES.filter((c) => pixelCount(falling, c) === 2)).toHaveLength(1)

  await clock.advance(60 * 1000)
  await $.command.run({ command: 'pokemon', args: 'sleep' })
  await clock.advance(2000)
  // Each small Z is seven pixels, and two or three are in the air at once
  const zs = pixelCount(await shown(ui, blits), Z_COLOR)
  expect(zs).toBeGreaterThan(0)
  expect(zs).toBeLessThanOrEqual(3 * 7)
})

test('a shrunk mon keeps a pixel of every eye, facing you or walking, line eyes included', () => {
  const cases = [['charizard', 'idle', 2], ['dragonite', 'idle', 2], ['arcanine', 'idle', 2], ['mewtwo', 'idle', 2], ['snorlax', 'idle', 2], ['snorlax', 'walk', 1], ['abra', 'walk', 1]] as const
  for (const [mon, view, eyes] of cases) {
    const sprite = SPRITES[mon]
    const { palette } = sprite.variants.default
    const rows = sprite.variants.default[view][0].rows
    const colorOf = (x: number, y: number) => ((rows[y]?.[x] ?? '.') === '.' ? null : parseInt(palette[rows[y].charCodeAt(x) - 97].slice(1), 16))
    const pupils = pupilsOf(rows, palette, keptEyesOf(mon, 'default', view, 0))
    expect(pupils.length).toBe(eyes)
    const scale = 16 / sprite.height
    // Wherever the blocks fall as the mon walks, each eye's own zoomed pixel shows its pupil
    for (let dx = 0; dx < 3; dx++) {
      const columns = sprite.width + dx
      const pixelAt = (x: number, y: number) => (x < dx || x >= columns ? null : colorOf(x - dx, y))
      const shifted = pupils.map(([x, y]) => [x + dx, y, colorOf(x, y)] as const)
      const at = zoomedPixel(pixelAt, { columns, pixels: sprite.height, scale, pupils: shifted })
      // The zoomed pixel whose block holds full-size pixel v, cut as the zoom cuts them
      const cellOf = (v: number, size: number) => {
        const count = Math.round(size * scale)
        let t = 0
        while (t + 1 < count && Math.ceil(((t + 1) * size) / count) <= v) t++
        return t
      }
      for (const [x, y, color] of shifted) expect(at(cellOf(x, columns), cellOf(y, sprite.height))).toBe(color)
    }
  }
})

test("a shrunk Bulbasaur's eyes both show its dark pupil, not one glint and one gray", () => {
  const sprite = SPRITES.bulbasaur
  const { palette, idle } = sprite.variants.default
  const pupils = pupilsOf(idle[0].rows, palette, keptEyesOf('bulbasaur', 'default', 'idle', 0))
  expect(pupils.map(([x, y]) => idle[0].rows[y][x])).toEqual(['i', 'i'])
  // At the half block scale, wherever the blocks fall, each eye is one pupil pixel and
  // none of its glint or red is left beside it
  const colorOf = (l: string) => parseInt(palette[l.charCodeAt(0) - 97].slice(1), 16)
  const rows = idle[0].rows
  const scale = 0.7
  for (let dx = 0; dx < 4; dx++) {
    const columns = sprite.width + dx
    const pixelAt = (x: number, y: number) => {
      const l = x < dx || x >= columns ? '.' : (rows[y]?.[x - dx] ?? '.')
      return l === '.' ? null : colorOf(l)
    }
    const shifted = pupils.map(([x, y, box, skin, inked]) => [x + dx, y, colorOf('i'), [box[0] + dx, box[1], box[2], box[3], colorOf(skin), [...inked].map(colorOf)]])
    const at = zoomedPixel(pixelAt, { columns, pixels: sprite.height, scale, pupils: shifted })
    const shown = { i: 0, other: 0 }
    for (let ty = 0; ty < Math.round(sprite.height * scale); ty++) {
      for (let tx = 0; tx < Math.round(columns * scale); tx++) {
        const c = at(tx, ty)
        if (c === colorOf('i')) shown.i++
        else if (['h', 'j', 'k'].some((l) => colorOf(l) === c)) shown.other++
      }
    }
    expect(shown).toEqual({ i: 2, other: 0 })
  }
})

test('a small band keeps animating through an attack, a pet, and a feed', async ($, on) => {
  const { clock, sent } = await startedWith($, on, { size: 'small', wander: false }, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  // The Image swaps over two seconds, and the colors they paint
  const swapsOver = async () => {
    const from = sent.length
    await clock.advance(2000)
    const swaps = sent.slice(from)
    expect(swaps.every((e) => e.source && e.key === 'pokemon')).toBe(true)
    return { pngs: new Set<string>(swaps.map((e) => e.source.png)), colors: new Set(swaps.flatMap((e) => [...imageColors(e.source.png)])) }
  }
  await clock.advance(5000)
  const idle = await swapsOver()

  await $.command.run({ command: 'pokemon', args: 'attack' })
  const attack = await swapsOver()
  expect([...attack.pngs].filter((png) => !idle.pngs.has(png)).length).toBeGreaterThan(3)

  await clock.advance(5000)
  await $.command.run({ command: 'pokemon', args: 'pet' })
  const pet = await swapsOver()
  expect(idle.colors.has(0xff4f8b)).toBe(false)
  expect(pet.colors.has(0xff4f8b)).toBe(true)

  await clock.advance(5000)
  await $.command.run({ command: 'pokemon', args: 'feed' })
  const feed = await swapsOver()
  expect(BERRY_BODIES.some((color) => idle.colors.has(color))).toBe(false)
  expect(BERRY_BODIES.some((color) => feed.colors.has(color))).toBe(true)
})

test('a short pane that shrinks a small band further lays it out no wider than medium', async ($, on) => {
  await startedWith($, on, {}, 0)
  const columns: Record<string, number> = {}
  for (const size of ['medium', 'small']) {
    await $.command.run({ command: 'pokemon', args: 'size ' + size })
    // Abra's 11 rows would halve to 6, so a 5 row pane shrinks either size to the same scale
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 5 } })
    const band = (await ui.find({ key: 'pokemon' })).props
    expect(band.rows).toBe(5)
    columns[size] = band.columns
    expect(await ui.find({ type: 'Text', text: '●●●●○' })).toBeDefined()
    await ui.unmount()
  }
  expect(columns.small).toBeLessThanOrEqual(columns.medium)
})

test('a battle that fits a medium band fits a small one in the same pane', async ($, on) => {
  const { clock } = await startedWith($, on, { mon: 'charizard', emoji: true, wander: false, debug: true }, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text
  for (const size of ['medium', 'small']) {
    await run('size ' + size)
    // The narrowest band a medium Charizard battles a Gyarados in, with emoji meters
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 82 } })
    expect({ size, reply: await run('wild gyarados') }).toEqual({ size, reply: 'A wild Gyarados is on its way.' })
    await clock.advance(10000)
    expect((await ui.find({ key: 'pokemon' })).props.columns).toBeLessThanOrEqual(82)
    await run('run')
    await clock.advance(10000)
    await ui.unmount()
  }
})

// The pixel rows a half-block raster columns wide paints in any of colors
function rowsPainted(cells: string, columns: number, colors: number[]): number {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  const rows = new Set<number>()
  for (let i = 0; i < words.length; i += 3) {
    const [cp, fg, bg] = [words[i], words[i + 1], words[i + 2]]
    const pair = cp === 0x2580 ? [fg, bg] : cp === 0x2584 ? [bg, fg] : cp === 0x20 ? [bg, bg] : []
    const row = Math.floor(i / 3 / columns) * 2
    pair.forEach((c, k) => colors.includes(c) && rows.add(row + k))
  }
  return rows.size
}

test('a small band draws a short foe no shorter than a medium Diglett', async ($, on) => {
  const { clock, blits, widths } = await startedWith($, on, { mon: 'snorlax', wander: false, debug: true }, 0, {}, (e) => (e.source ? DENY_IMAGES : {}))
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text
  // Diglett's colors from its head to its mound, all but the black and gray Snorlax paints
  const DIGLETT = [0x403010, 0x987838, 0x704820, 0xc8c8c8, 0x707070, 0x680828, 0xd04068, 0xe87098, 0x982048, 0xa8a8a8]
  const tall: Record<string, number> = {}
  for (const size of ['medium', 'small']) {
    await run('size ' + size)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 120 } })
    expect(await run('wild diglett')).toBe('A wild Diglett is on its way.')
    await clock.advance(10000)
    const columns = widths[widths.length - 1] ?? (await ui.find({ key: 'pokemon' })).props.columns
    tall[size] = rowsPainted(await shown(ui, blits), columns, DIGLETT)
    await run('run')
    await clock.advance(10000)
    await ui.unmount()
  }
  // At half scale beside Snorlax, a 12 px Diglett would paint 6 rows. It's grown so it
  // paints as many as at medium, give or take a row the shrink rounds off.
  expect(tall.small).toBeGreaterThanOrEqual(tall.medium - 1)
  expect(tall.medium).toBe(12)
})

test('a small band shrinks a foe taller than the home mon to its height, so the band does not grow', async ($, on) => {
  const { clock } = await startedWith($, on, { mon: 'pikachu', size: 'small', wander: false, debug: true }, 0, {}, (e) => (e.source ? DENY_IMAGES : {}))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 120 } })
  await clock.advance(200)
  const alone = (await ui.find({ key: 'pokemon' })).props.rows
  expect((await $.command.run({ command: 'pokemon', args: 'wild gyarados' })).text).toBe('A wild Gyarados is on its way.')
  await clock.advance(10000)
  expect((await ui.find({ key: 'pokemon' })).props.rows).toBe(alone)
})

test('a saved small size draws the band small from the start, and a short pane still shrinks it', async ($, on) => {
  await startedWith($, on, { size: 'small' }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Image' })).props.columns).toBe(SMALL)
  await ui.unmount()

  // Abra's 11 rows would halve to 6, so a 5 row pane shrinks it further
  const short = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 5 } })
  expect((await short.find({ type: 'Image' })).props.rows).toBe(5)
})

test('a small band on desktop draws every full-size pixel into a half-size Svg', async ($, on) => {
  await startedWith($, on, { size: 'small' }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  // No panel on desktop: the margin and the strip, at half the columns, the meters beside
  expect(svg.props.width).toBe(((MARGIN + STRIP) / 2) * PIXEL_PX)
  expect(svg.props.height).toBe(6 * 2 * PIXEL_PX)
  expect(svgOf(svg)).toMatch(/viewBox="0 0 52 24"/)
  expect(await ui.find({ type: 'Text', text: '●●●●○' })).toBeDefined()
})

test('/pokemon list names every mon, and the hint and status stay short', async ($, on) => {
  mock.clock(on)
  let hint = ''
  on('command.register', ($, e) => {
    hint = e.argumentHint
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('env.get', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(hint).toBe('[<mon>|default|shiny|wander|needs|emoji|size|sync|autoevolve|pet|feed|sleep|attack|catch|run|moves|evolve|stop|stats|box|dex|nickname|release|new|list]')

  const list = await $.command.run({ command: 'pokemon', args: 'list' })
  expect(list.text).toMatch(/^\d+ mons: abra, /)
  expect(list.text).toContain('charmander')
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).not.toContain('charmander')
})

// The shell prompt and the pencil in the bubble, the thinking dots, the "!", a Poké Ball's
// red top and white bottom, and the +n label, on the dark theme
const SHELL_ICON = 0x5fe08a
const PENCIL_ICON = 0xffc83d
const DISC_ICON = 0xd4d4e0
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

test('a skill shows a TM disc in the bubble, from the main loop or a subagent', async ($, on) => {
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('command.run', (_, e) => ({ text: 'ran /' + e.command }))
  on('command.list', () => ({
    value: [
      { name: 'commit', description: 'Commit the work', source: 'user' },
      { name: 'compact', description: 'Compact the context', source: 'builtin' },
    ],
  }))
  const { clock, blits } = await started($, on)
  slowTools(on, clock)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })

  const skill = $.tool.call({ tool: 'Skill', skill: 'commit' })
  await clock.advance(100)
  const running = await shown(ui, blits)
  expect(paints(running, DISC_ICON)).toBe(true)
  expect(paints(running, SHELL_ICON)).toBe(false)
  await clock.advance(2000)
  await skill
  await clock.advance(100)
  expect(paints(await shown(ui, blits), DISC_ICON)).toBe(false)

  // A subagent's skill shows the disc too, over the Agent call's Poké Ball
  const agent = $.tool.call({ tool: 'Agent', prompt: 'commit it' })
  await clock.advance(100)
  expect(paints(await shown(ui, blits), DISC_ICON)).toBe(false)
  const sub = $.tool.call({ tool: 'Skill', skill: 'commit', agentId: 'sub1' })
  await clock.advance(100)
  expect(paints(await shown(ui, blits), DISC_ICON)).toBe(true)
  await clock.advance(2000)
  await sub
  await agent
  await clock.advance(100)
  expect(paints(await shown(ui, blits), DISC_ICON)).toBe(false)

  // A skill typed as /name runs as a command with no Skill call, and shows the disc
  // for three seconds even while Claude isn't working. A built-in command doesn't.
  await ui.unmount()
  const idle = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await $.command.run({ command: 'commit', args: '' })
  await clock.advance(100)
  expect(paints(await shown(idle, blits), DISC_ICON)).toBe(true)
  await clock.advance(2500)
  expect(paints(await shown(idle, blits), DISC_ICON)).toBe(true)
  await clock.advance(600)
  expect(paints(await shown(idle, blits), DISC_ICON)).toBe(false)
  await $.command.run({ command: 'compact', args: '' })
  await clock.advance(100)
  expect(paints(await shown(idle, blits), DISC_ICON)).toBe(false)

  // The event the typings promise for a skill's prompt holds the disc too
  await $.skill.prompt({ skill: 'commit', text: 'Commit the work.' })
  await clock.advance(100)
  expect(paints(await shown(idle, blits), DISC_ICON)).toBe(true)
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

test('the sweat drop goes on the other side of the head from a bubble in the left margin', { timeoutMs: 30000 }, async ($, on) => {
  const BODY = 0x68d078
  bashTools($, on)
  const { clock, blits } = await startedWith($, on, { mon: 'bulbasaur', needs: false }, 0)
  await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  // Pace left until the mon turns at the strip's left edge, where the bubble only fits in
  // the margin
  let lowest = Infinity
  for (let k = 0; k < 200; k++) {
    await clock.advance(150)
    const now = meanColumn(blits[blits.length - 1], BODY) ?? Infinity
    if (now > lowest) break
    lowest = now
  }
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.advance(300)
  const cells = blits[blits.length - 1]
  const body = meanColumn(cells, BODY) as number
  expect(meanColumn(cells, BUBBLE_OUTLINE)).toBeLessThan(body)
  expect(meanColumn(cells, SWEAT)).toBeGreaterThan(body)
})

test('a mon released in another session stays released when this one switches to it', async ($, on) => {
  const saved: Record<string, any> = { mon: 'abra', stats: { abra: { xp: 900 }, pikachu: { xp: 1728, nickname: 'Zappy' } } }
  await startedWith($, on, saved, 0)
  // Another session releases Pikachu after this one loaded it
  saved.stats = { abra: { xp: 900 } }
  await $.command.run({ command: 'pokemon', args: 'pikachu' })
  expect(saved.stats.pikachu).toBeUndefined()
  expect((await $.command.run({ command: 'pokemon', args: 'stats' })).text).toMatch(/^Pikachu, Lv\. 5,/)
  await $.command.run({ command: 'pokemon', args: 'abra' })
  expect((await $.command.run({ command: 'pokemon', args: 'box' })).text).not.toContain('Pikachu')
})

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

// The engine's agent list, with every spawned agent still running
function runningAgents(on) {
  const ids: string[] = []
  on('agent.spawn', ($, e) => {
    ids.push('agent-' + e.tool_use_id)
    return { model: 'claude-haiku-4-5', agentId: 'agent-' + e.tool_use_id }
  })
  on('agent.list', () => ({ value: ids.map((id) => ({ id, description: 'Count files', type: 'Explore', status: 'running' })) }))
}

test('a subagent drops a Poké Ball onto the ground, and it pops when its turn ends', async ($, on) => {
  runningAgents(on)
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

test('a teammate in its own pane pops its ball once the agent list shows it idle', async ($, on) => {
  // A pane teammate's id is its address, and its turn never completes in this process
  let status = 'running'
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'designer@team' }))
  on('agent.list', () => ({ value: [{ id: 'designer@team', teammateId: 'designer@team', description: 'Design', type: 'teammate', status }] }))
  const { clock, blits } = await startedWith($, on, { wander: false }, 0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await $.agent.spawn(spawnOf('t1'))
  await clock.advance(6000)
  expect(groundColors(await shown(ui, blits)).has(BALL_BOTTOM)).toBe(true)

  status = 'idle'
  await clock.advance(4000)
  const popped = await shown(ui, blits)
  expect(paints(popped, BALL_TOP)).toBe(false)
  expect(paints(popped, BALL_BOTTOM)).toBe(false)
})

test('past five subagents, the last slot counts the rest as +n', async ($, on) => {
  runningAgents(on)
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
    if (words[i + 1] === color || words[i + 2] === color) columns.push(((i / 3) % RASTER) - MARGIN)
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

// Diglett's idle GIF, served for every file of a fetched mon
const GIF = 'R0lGODlhIAAgAIMAAAAAAJh4OHBwcEBAQAAAAEAwEHBIIKioqJggSGgIKMjIyNBAaOhwmAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJHgAAACwAAAAAIAAgAAAIiQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJcmKBkyc1FgjAkmUBjCtbtnxpMabMADQrEjCgoKUCAwQsDti50wBQoAMoDhCwM8ECBgsSABWQNOJSAVQJINi6U8CBA1UfLj2AdSgBAljLCph41SvZAWDDKl06IOlShgEBACH5BAkeAAAALAAAAAAgACAAgwAAAHBwcJh4OEBAQEAwEAAAAHBIIKioqJggSGgIKMjIyNBAaOhwmAAAAAAAAAAAAAiLAAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWLGDNq3Mixo8ePIEOKHHmRgEmTGgkIWLmSAEaVLFm6tAgzpoCZFQkYUMBSgQGcFAsYEGpg6FCLA4QmWMBgQYKhAygOCCC0AIKrVQNEjTg1QACdBcL+PHBAa0StAch29Xqg69azXcsOcHtR61yBUxkGBAA7'

// Answers GitHub and PokéAPI the way /pokemon new reads them. gens maps each generation
// to the mons in it, and status, when given, answers every GitHub request.
function serveMons(on, gens: Record<number, string[]>, { status = 200, types = ['water'] } = {}) {
  const asked: string[] = []
  on('http.fetch', ($, e) => {
    asked.push(e.url)
    const reply = (code: number, body: unknown) => ({ value: { status: code, ok: code < 300, headers: {}, text: JSON.stringify(body) } })
    if (e.url.startsWith('https://pokeapi.co/')) return reply(200, { types: types.map((name) => ({ type: { name } })) })
    if (status !== 200) return reply(status, {})
    const [, gen, name] = e.url.match(/media\/gen(\d)(?:\/([^/]+))?/) ?? []
    if (!name) return reply(200, (gens[Number(gen)] ?? []).map((n) => ({ name: n, type: 'dir' })))
    return gens[Number(gen)]?.includes(name) ? reply(200, { content: GIF, encoding: 'base64' }) : reply(404, {})
  })
  return asked
}

// A store in memory the test can read back, answering $.store as the engine does
function memoryStore(on, entries: Record<string, unknown> = {}) {
  const held = new Map<string, unknown>(Object.entries(entries))
  on('store.get', ($, e) => ({ value: held.get(e.key) }))
  on('store.set', ($, e) => {
    held.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...held.keys()] }))
  on('store.delete', ($, e) => {
    held.delete(e.key)
    return { value: undefined }
  })
  return held
}

test('/pokemon new fetches a mon from the generation that has it, saves it, and shows it', async ($, on) => {
  mock.clock(on)
  const store = memoryStore(on)
  on('ui.render', () => THEIRS)
  const asked = serveMons(on, { 3: ['mudkip'] })
  const answer = await $.command.run({ command: 'pokemon', args: 'new mudkip' })
  expect(answer.text).toBe('Fetched gen 3 Mudkip. It knows Water Gun, Bubble Beam, Tackle. Now showing default Mudkip.')
  expect(asked.some((url) => url.includes('/gen1/mudkip/'))).toBe(true)
  expect(store.get('mon')).toBe('mudkip')
  const saved = store.get('custom:mudkip') as { gen: number; sprite: typeof SPRITES.diglett }
  expect(saved.gen).toBe(3)
  // Decoded the way the build decodes Diglett's own idle GIF, on every sheet
  const { idle, palette } = SPRITES.diglett.variants.default
  expect(saved.sprite.variants.default.palette).toEqual(palette)
  expect(saved.sprite.variants.shiny.walk.map((f) => f.ms)).toEqual(idle.map((f) => f.ms))
  expect(saved.sprite.variants.default.idle.map((f) => f.rows.join('').replace(/\./g, ''))).toEqual(idle.map((f) => f.rows.join('').replace(/\./g, '')))
  expect((await $.command.run({ command: 'pokemon', args: 'attack list' })).text).toBe('Mudkip knows Water Gun, Bubble Beam, Tackle.')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'pokemon' })).props.rows).toBe(7)
})

test('a mon fetched in another session loads at session start', async ($, on) => {
  mock.clock(on)
  const sprite = SPRITES.diglett
  mock.store(on, { mon: 'torchic', 'custom:torchic': { gen: 3, sprite, moves: ['Ember', 'Tackle'] } })
  on('ui.render', () => THEIRS)
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('env.get', () => ({ value: undefined }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await $.command.run({ command: 'pokemon', args: '' })).text).toMatch(/^Showing default Torchic Lv\. /)
  expect((await $.command.run({ command: 'pokemon', args: 'list' })).text).toMatch(/, torchic$/)
  expect((await $.command.run({ command: 'pokemon', args: 'moves' })).text).toBe('Torchic knows Ember, Tackle.')
  expect((await $.command.run({ command: 'pokemon', args: 'dex torchic' })).text).toBe("Torchic isn't in the Pokédex. Only gen 1 mons appear in the wild.")
})

test('/pokemon new gen3 picks a gen 3 mon you do not have yet', async ($, on) => {
  mock.clock(on)
  mock.store(on, { 'custom:mudkip': { gen: 3, sprite: SPRITES.diglett, moves: ['Tackle'] } })
  on('ui.render', () => THEIRS)
  serveMons(on, { 3: ['mudkip', 'treecko'] }, { types: ['grass'] })
  const answer = await $.command.run({ command: 'pokemon', args: 'new gen3' })
  expect(answer.text).toMatch(/^Fetched gen 3 Treecko\. It knows Vine Whip, Razor Leaf, Tackle\./)
  expect((await $.command.run({ command: 'pokemon', args: 'new random gen3' })).text).toBe('You already have every gen 3 mon.')
})

test('/pokemon new explains a mon it cannot fetch', async ($, on) => {
  mock.clock(on)
  const store = memoryStore(on)
  serveMons(on, { 3: ['mudkip'] })
  expect((await $.command.run({ command: 'pokemon', args: 'new togepi' })).text).toBe(
    "Couldn't fetch togepi: No mon named \"togepi\" in generations 1, 2, 3, 4, 5.",
  )
  expect((await $.command.run({ command: 'pokemon', args: 'new pikachu' })).text).toBe('Pikachu is already here. /pokemon pikachu shows it.')
  expect(store.has('mon')).toBe(false)
})

test('/pokemon new says when GitHub refuses for the hourly limit', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  serveMons(on, {}, { status: 403 })
  expect((await $.command.run({ command: 'pokemon', args: 'new mudkip' })).text).toBe(
    "Couldn't fetch mudkip: GitHub's hourly limit for anonymous requests is used up. Try again in a while.",
  )
})

// Starts a session over the store, so its tick loop runs the cross-session sync
async function startSession($, on) {
  on('ui.render', () => THEIRS)
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('env.get', () => ({ value: undefined }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
}

test('with sync on, a session follows the mon picked in another, fetched mons included', async ($, on) => {
  const clock = mock.clock(on)
  const store = memoryStore(on, { mon: 'abra' })
  await startSession($, on)
  expect((await $.command.run({ command: 'pokemon', args: 'sync' })).text).toBe(
    'Sync is on. Every open session shows Abra, and follows the next mon you pick.',
  )
  expect(store.get('sync')).toBe(true)
  // Another session picks Vulpix, then fetches Torchic
  store.set('mon', 'vulpix')
  await clock.advance(50 * 25)
  expect((await $.command.run({ command: 'pokemon', args: '' })).text).toMatch(/^Showing default Vulpix /)
  store.set('custom:torchic', { gen: 3, sprite: SPRITES.diglett, moves: ['Ember'] })
  store.set('mon', 'torchic')
  await clock.advance(50 * 25)
  expect((await $.command.run({ command: 'pokemon', args: '' })).text).toMatch(/^Showing default Torchic /)
})

test('with sync off, each session keeps its own mon', async ($, on) => {
  const clock = mock.clock(on)
  const store = memoryStore(on, { mon: 'abra' })
  await startSession($, on)
  store.set('mon', 'vulpix')
  await clock.advance(50 * 25)
  expect((await $.command.run({ command: 'pokemon', args: '' })).text).toMatch(/^Showing default Abra /)
  expect((await $.command.run({ command: 'pokemon', args: 'sync' })).text).toMatch(/^Sync is on/)
  expect((await $.command.run({ command: 'pokemon', args: 'sync' })).text).toBe('Sync is off. Each session keeps the mon picked in it.')
})

// The raster columns painting a color, in a raster width columns wide
function columnsIn(cells: string, width: number, color: number): number[] {
  const words = new Uint32Array(Uint8Array.fromBase64(cells).buffer)
  const columns: number[] = []
  for (let i = 0; i < words.length; i += 3) {
    if (words[i + 1] === color || words[i + 2] === color) columns.push((i / 3) % width)
  }
  return columns
}

// A color of the foe's palette that the home mon's lacks
function foeColor(home: string, foe: string, variant = 'default'): number {
  const own = new Set(SPRITES[home].variants.default.palette.map((hex) => hex.toLowerCase()))
  const hex = SPRITES[foe].variants[variant].palette.find((c) => !own.has(c.toLowerCase()))
  return parseInt(hex.slice(1), 16)
}

test('/pokemon wild spawns a mon only with debug on and a band it fits in', async ($, on) => {
  const saved: Record<string, any> = { wander: false }
  await startedWith($, on, saved, 0)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text
  expect(await run('wild pidgey')).toMatch(/^Unknown option "wild pidgey"\. /)
  saved.debug = true
  // No band drawn yet, so no battle fits
  expect(await run('wild pidgey')).toBe('The band is too narrow for a wild Pidgey. Widen the pane and try again.')
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await run('wild agumon')).toBe('Unknown mon "agumon". See /pokemon list for every mon.')
  expect(await run('wild pidgey')).toBe('A wild Pidgey is on its way.')
  expect(await run('wild rattata')).toBe('A wild Pidgey is already here.')
})

test('a wild mon walks in from the left, the strip widens to fit it, and the dex marks it seen', async ($, on) => {
  const toasts = toastsOf(on)
  const saved: Record<string, any> = { wander: false, debug: true }
  const { clock, blits, widths } = await startedWith($, on, saved, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(100)
  const seen = blits.length
  await $.command.run({ command: 'pokemon', args: 'wild pidgeot' })
  await clock.advance(10000)

  const color = foeColor('abra', 'pidgeot')
  const frames = blits.map((cells, i) => ({ cells, width: widths[i] })).slice(seen)
  const showing = frames.filter((f) => columnsIn(f.cells, f.width, color).length > 0)
  expect(showing.length).toBeGreaterThan(0)
  // Pidgeot is too wide to share 40 columns with Abra
  expect(showing.every((f) => f.width > RASTER)).toBe(true)
  // It first shows at the scene's left edge, and stands further right once it arrives
  const first = columnsIn(showing[0].cells, showing[0].width, color)
  const last = columnsIn(showing[showing.length - 1].cells, showing[showing.length - 1].width, color)
  expect(Math.min(...first)).toBe(0)
  expect(Math.max(...first)).toBeLessThan(4)
  expect(Math.min(...last)).toBeGreaterThan(0)

  expect(toasts).toEqual(['A wild Pidgeot (Lv. 36) appeared!'])
  expect(saved.dex).toEqual({ pidgeot: { seen: expect.any(Number) } })
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).toContain(', a wild Pidgeot is here (')
})

test('a wild mon flees after four minutes without a fight, and the strip shrinks back', { timeoutMs: 30000 }, async ($, on) => {
  const toasts = toastsOf(on)
  const { clock, widths } = await startedWith($, on, { wander: false, debug: true }, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await $.command.run({ command: 'pokemon', args: 'wild pidgeot' })
  await clock.advance(10000)
  expect(widths[widths.length - 1]).toBeGreaterThan(RASTER)
  // Keep Abra awake meanwhile, since a sleeping mon sends the foe off too
  for (let k = 0; k < 4; k++) {
    await $.command.run({ command: 'pokemon', args: 'stats' })
    await clock.advance(60 * 1000)
  }
  await clock.advance(10000)
  expect(toasts).toEqual(['A wild Pidgeot (Lv. 36) appeared!', 'Wild Pidgeot fled!'])
  expect(widths[widths.length - 1]).toBe(RASTER)
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).not.toContain('wild')
})

test('/pokemon run sends the wild mon off, and the strip shrinks back', async ($, on) => {
  const toasts = toastsOf(on)
  const { clock, widths } = await startedWith($, on, { wander: false, debug: true }, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text
  expect(await run('run')).toBe('There\'s no wild Pokémon here.')
  await run('wild pidgeot')
  await clock.advance(10000)
  expect(await run('run')).toBe('Got away safely!')
  expect(await run('run')).toBe('There\'s no wild Pokémon here.')
  await clock.advance(10000)
  expect(toasts).toEqual(['A wild Pidgeot (Lv. 36) appeared!'])
  expect(widths[widths.length - 1]).toBe(RASTER)
})

test('a wild mon leaves when the shown mon goes to sleep', async ($, on) => {
  const toasts = toastsOf(on)
  const { clock } = await startedWith($, on, { wander: false, debug: true }, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await $.command.run({ command: 'pokemon', args: 'wild pidgey' })
  await clock.advance(10000)
  await $.command.run({ command: 'pokemon', args: 'sleep' })
  await clock.advance(100)
  expect(toasts).toEqual(['A wild Pidgey (Lv. 5) appeared!', 'Wild Pidgey fled!'])
})

test('the widest battles fit the desktop Svg in its size limit', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = await startedWith($, on, { wander: false, debug: true }, 0)
  const widest = ['gyarados', 'pidgeot', 'fearow', 'dragonair']
  for (const home of widest) {
    for (const foe of widest) {
      await $.command.run({ command: 'pokemon', args: home })
      const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
      expect((await $.command.run({ command: 'pokemon', args: 'wild ' + foe + ' shiny' })).text).toBe('A wild ' + foe.charAt(0).toUpperCase() + foe.slice(1) + ' is on its way.')
      await clock.advance(10000)
      const svg = await ui.find({ type: 'Svg' })
      expect(svg.props.alt).toBe(home.charAt(0).toUpperCase() + home.slice(1) + ' vs. wild ' + foe.charAt(0).toUpperCase() + foe.slice(1))
      expect(svgOf(svg).length).toBeLessThan(131072)
      await $.command.run({ command: 'pokemon', args: 'run' })
      await clock.advance(10000)
      await ui.unmount()
    }
  }
})

const HP_GREEN = 0x48c858

// Answer every tool call at once
function quickTools(on) {
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))
}

// Start a session with a wild foe standing in battle. saved is the store itself, so the
// test reads what the session writes.
async function inBattle($, on, saved: Record<string, any>, foe = 'pidgey') {
  const toasts = toastsOf(on)
  quickTools(on)
  Object.assign(saved, { wander: false, debug: true, ...saved })
  const started = await startedWith($, on, saved, 0)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await $.command.run({ command: 'pokemon', args: 'wild ' + foe })
  await started.clock.advance(10000)
  return { ...started, toasts }
}

const movesIn = (toasts: string[]) => toasts.filter((text) => / used .+!$/.test(text))

test('work during a battle fires a move at the foe, and the hit shrinks its HP bar', async ($, on) => {
  const { clock, blits, widths, toasts } = await inBattle($, on, {})
  const green = () => columnsIn(blits[blits.length - 1], widths[widths.length - 1], HP_GREEN).length
  expect(green()).toBe(12)
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  await clock.advance(100)
  // Teleport would leave the foe behind, so Confusion is the move that reaches it
  expect(movesIn(toasts)).toEqual(['Abra used Confusion!'])
  await clock.advance(5000)
  expect(green()).toBeLessThan(12)
})

test('banked work fires one move at a time, at most one every six seconds', async ($, on) => {
  const { clock, toasts } = await inBattle($, on, {})
  for (let k = 0; k < 3; k++) await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  await clock.advance(100)
  expect(movesIn(toasts).length).toBe(1)
  await clock.advance(5800)
  expect(movesIn(toasts).length).toBe(1)
  await clock.advance(2200)
  expect(movesIn(toasts).length).toBe(2)
  // Work banks two moves at most
  await clock.advance(20000)
  expect(movesIn(toasts).length).toBe(2)
})

test('a sleeping mon makes no moves, and the foe leaves', async ($, on) => {
  const { clock, toasts } = await inBattle($, on, {})
  await $.command.run({ command: 'pokemon', args: 'sleep' })
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  await clock.advance(10000)
  expect(movesIn(toasts)).toEqual([])
  expect(toasts).toContain('Wild Pidgey fled!')
})

test('an evolving mon makes no moves until it has evolved', async ($, on) => {
  const stats = { charmander: { xp: 16 ** 3 } }
  const { clock, toasts } = await inBattle($, on, { mon: 'charmander', autoEvolve: false, stats })
  await $.command.run({ command: 'pokemon', args: 'evolve' })
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  await clock.advance(6000)
  expect(movesIn(toasts)).toEqual([])
  await clock.advance(3000)
  expect(movesIn(toasts)).toEqual([expect.stringMatching(/^Charmeleon used /)])
})

test('/pokemon feed waits until the foe is gone', async ($, on) => {
  await inBattle($, on, {})
  const feed = await $.command.run({ command: 'pokemon', args: 'feed' })
  expect(feed.text).toBe('Not now, a wild Pidgey is right there!')
})

test('a foe at 0 HP is worn out, and leaves if no ball comes in time', async ($, on) => {
  const { clock, toasts } = await inBattle($, on, {})
  const worn = 'Wild Pidgey is worn out! Throw a ball with /pokemon catch.'
  // A common foe takes three hits, give or take one
  for (let k = 0; k < 6 && !toasts.includes(worn); k++) {
    await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
    await clock.advance(9000)
  }
  expect(toasts).toContain(worn)
  const moves = movesIn(toasts).length
  expect(moves).toBeGreaterThanOrEqual(2)
  expect(moves).toBeLessThanOrEqual(5)
  // Nothing left to hit, so work banks no more moves
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  await clock.advance(9000)
  expect(movesIn(toasts).length).toBe(moves)
  expect(toasts).not.toContain('Wild Pidgey fled!')
  await clock.advance(90 * 1000)
  expect(toasts).toContain('Wild Pidgey fled!')
})

test('a foe left uncaught for four main turns moves on', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  const { toasts } = await inBattle($, on, {})
  const aborted = { ...ANSWERED, reason: 'aborted', isAborted: true }
  for (let k = 0; k < 3; k++) await $.turn.complete(aborted)
  await $.turn.complete({ ...aborted, agentId: 'sub1' })
  expect(toasts).not.toContain('Wild Pidgey fled!')
  await $.turn.complete(aborted)
  expect(toasts).toContain('Wild Pidgey fled!')
})

const WORN = 'Wild Pidgey is worn out! Throw a ball with /pokemon catch.'

// Bank work until the foe in battle is worn out
async function wearOut($, clock, toasts: string[]) {
  for (let k = 0; k < 6 && !toasts.includes(WORN); k++) {
    await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
    await clock.advance(9000)
  }
  expect(toasts).toContain(WORN)
}

test('a ball thrown at full HP always breaks free, and the foe fights on', async ($, on) => {
  const { clock, blits, widths, toasts } = await inBattle($, on, {})
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text
  expect(await run('catch')).toBe('You threw a Poké Ball!')
  expect(await run('catch')).toBe('Wait for the move to end.')
  await clock.advance(4000)
  expect(toasts).toContain('Oh no! It broke free!')
  expect(columnsIn(blits[blits.length - 1], widths[widths.length - 1], foeColor('abra', 'pidgey')).length).toBeGreaterThan(0)
  expect(await run('')).toContain(', a wild Pidgey is here (')
})

test('/pokemon catch needs a foe in battle', async ($, on) => {
  await startedWith($, on, {}, 0)
  const answer = await $.command.run({ command: 'pokemon', args: 'catch' })
  expect(answer.text).toBe('There\'s no wild Pokémon here.')
})

test('a worn out foe is caught, joins the box parked at its first level, and the strip shrinks back', async ($, on) => {
  const saved: Record<string, any> = {}
  const { clock, widths, toasts } = await inBattle($, on, saved)
  await wearOut($, clock, toasts)
  await $.command.run({ command: 'pokemon', args: 'catch' })
  await clock.advance(6000)
  expect(toasts).toContain('Gotcha! Pidgey was caught! It joined your box.')
  expect(saved.dex.pidgey).toEqual({ seen: expect.any(Number), caught: expect.any(Number) })
  expect(saved.stats.pidgey).toEqual({ xp: 5 ** 3, parked: true })
  expect(widths[widths.length - 1]).toBe(RASTER)
  const status = await $.command.run({ command: 'pokemon', args: '' })
  expect(status.text).not.toContain('wild')
})

test('catching a species already in the box leaves its record as it was', async ($, on) => {
  const pidgey = { xp: 20 ** 3, nickname: 'Pidge', parked: true, food: { value: 40, at: 0 } }
  const saved: Record<string, any> = { stats: { pidgey: structuredClone(pidgey) } }
  const { clock, toasts } = await inBattle($, on, saved)
  await wearOut($, clock, toasts)
  await $.command.run({ command: 'pokemon', args: 'catch' })
  await clock.advance(6000)
  expect(toasts).toContain('Gotcha! Pidgey was caught! Pidgey is already in your box, so it\'s marked in your Pokédex.')
  expect(saved.stats.pidgey).toEqual(pidgey)
  expect(saved.dex.pidgey.caught).toEqual(expect.any(Number))
})

test('release keeps a caught species in the Pokédex, and the box marks it when raised again', async ($, on) => {
  const saved: Record<string, any> = {}
  const { clock, toasts } = await inBattle($, on, saved)
  await wearOut($, clock, toasts)
  await $.command.run({ command: 'pokemon', args: 'catch' })
  await clock.advance(6000)
  const run = async (args: string) => (await $.command.run({ command: 'pokemon', args })).text
  expect(await run('box')).toContain('\nPidgey ◓, Lv. 5')

  expect(await run('release pidgey')).toBe('You release Pidgey. Bye-bye, Pidgey!')
  expect(saved.stats.pidgey).toBeUndefined()
  expect(saved.dex.pidgey.caught).toEqual(expect.any(Number))

  await run('pidgey')
  await run('pet')
  await clock.advance(4000)
  expect(await run('box')).toContain('\nPidgey ◓, Lv. 5 ●●●●○ ♥♥♥♥♥ (active)')
})

test('a shiny foe paints the shiny palette, and catching it marks the Pokédex shiny', async ($, on) => {
  const saved: Record<string, any> = {}
  const { clock, blits, widths, toasts } = await inBattle($, on, saved, 'pidgey shiny')
  expect(toasts[0]).toBe('A shiny wild Pidgey (Lv. 5) appeared!')
  const shiny = foeColor('abra', 'pidgey', 'shiny')
  expect(SPRITES.pidgey.variants.default.palette.map((hex) => parseInt(hex.slice(1), 16))).not.toContain(shiny)
  expect(columnsIn(blits[blits.length - 1], widths[widths.length - 1], shiny).length).toBeGreaterThan(0)
  await wearOut($, clock, toasts)
  await $.command.run({ command: 'pokemon', args: 'catch' })
  await clock.advance(6000)
  expect(saved.dex.pidgey.shiny).toBe(true)
  const dex = await $.command.run({ command: 'pokemon', args: 'dex' })
  expect(dex.text).toBe('Pokédex: seen 1, caught 1 of 151 (1 shiny).\n#016 Pidgey ◓ ✦')
})

const MINUTE = 60 * 1000
const APPEARED = /^A (shiny )?wild .+ \(Lv\. \d+\) appeared!$/

// Start a session at an hour in with the band drawn and a turn running, so work can
// bring a wild mon
async function working($, on, saved: Record<string, any>) {
  const toasts = toastsOf(on)
  quickTools(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  Object.assign(saved, { wander: false, ...saved })
  const started = await startedWith($, on, saved, HOUR)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await $.turn.start({ text: 'hi', turnId: 't' })
  const read = async (agentId?: string) => {
    await $.tool.call({ tool: 'Read', file_path: '/work/a.ts', ...(agentId ? { agentId } : {}) })
    await started.clock.advance(100)
  }
  return { ...started, toasts, read }
}

test('a due encounter gate is claimed on a tool call, and the wild mon comes on the next check', async ($, on) => {
  const saved: Record<string, any> = { wildAt: { at: HOUR - MINUTE, by: 'other' } }
  const { clock, toasts, read } = await working($, on, saved)
  await read()
  const claim = saved.wildAt
  expect(claim.by).not.toBe('other')
  expect(claim.at).toBeGreaterThanOrEqual(HOUR + 20 * MINUTE)
  expect(claim.at).toBeLessThanOrEqual(HOUR + 40 * MINUTE)
  expect(toasts.filter((text) => APPEARED.test(text))).toEqual([])

  // Checks come at most every 30 seconds
  await read()
  await clock.advance(10000)
  expect(toasts.filter((text) => APPEARED.test(text))).toEqual([])
  await clock.advance(20000)
  await read()
  await clock.advance(10000)
  expect(toasts.filter((text) => APPEARED.test(text)).length).toBe(1)
  expect(saved.wildAt).toEqual(claim)
})

test('a claim another session took over brings no wild mon here', async ($, on) => {
  const saved: Record<string, any> = { wildAt: { at: HOUR - MINUTE, by: 'other' } }
  const { clock, toasts, read } = await working($, on, saved)
  await read()
  saved.wildAt = { at: HOUR + 30 * MINUTE, by: 'other' }
  await clock.advance(30000)
  await read()
  await clock.advance(10000)
  expect(toasts.filter((text) => APPEARED.test(text))).toEqual([])
  expect(saved.wildAt).toEqual({ at: HOUR + 30 * MINUTE, by: 'other' })
})

test('with no encounter gate yet, the first one is set five minutes out', async ($, on) => {
  const saved: Record<string, any> = {}
  const { clock, toasts, read } = await working($, on, saved)
  await read()
  expect(saved.wildAt).toEqual({ at: HOUR + 5 * MINUTE, by: expect.any(String) })
  await clock.advance(30000)
  await read()
  await clock.advance(10000)
  expect(toasts.filter((text) => APPEARED.test(text))).toEqual([])
})

test('a subagent\'s tool calls don\'t check the encounter gate', async ($, on) => {
  const saved: Record<string, any> = { wildAt: { at: HOUR - MINUTE, by: 'other' } }
  const { read } = await working($, on, saved)
  await read('sub1')
  expect(saved.wildAt).toEqual({ at: HOUR - MINUTE, by: 'other' })
})
