import { rnd } from './effects/draw.js'
import { BALL, BALL_COLORS, FLASH } from './party.js'

// The Pokémon Center a fainted mon heals at. The mon turns red and goes into its ball,
// then the band shows Nurse Joy behind her counter with the ball in the healing
// machine's tray, flashing to the machine's jingle while pink sparkles rise off it. At
// the end she bows, and the band goes back to the mon. Every function is pure: the same
// heal and tick give the same stamps.
// Joy is the FireRed and LeafGreen overworld Nurse Joy from the waist up: K navy
// outline, W white, b light blue, B blue, h dark hair, P hair, p light hair, k skin
// outline, s skin shade, S skin, L skin light, E eye.
const JOY = [
  '.....KKKKKK.....',
  '....KWWPPWWK....',
  '....KWPPPPWK....',
  '...hKbWPPWbKh...',
  '..hhPPbbbbPPhh..',
  '..hPhpPppPphPh..',
  '..hPhPhPPhPhPh..',
  '.kLhLhLhhLhLhLk.',
  '.kShSLELLELShSk.',
  'hPkssSESSESsskPh',
  'hpPkssSSSSsskPph',
  'hppPkksssskkPpph',
  '.hPPKKkkkkKKPPh.',
  '..hKbBKBBKBbKh..',
  '...KBSSksSSBK...',
  '..KBKkSSkSkKBK..',
  '..KBbWksskWbBK..',
]
// Blinking, the top of each eye goes skin
const BLINK = JOY.map((row, y) => (y === 8 ? row.replaceAll('E', 'L') : row))
// Bowing, her head dips a pixel and her eyes close
const BOW = [
  '................',
  '.....KKKKKK.....',
  '....KWWPPWWK....',
  '....KWPPPPWK....',
  '...hKbWPPWbKh...',
  '..hPPhbbbbhPPh..',
  '..hPhpPppPphPh..',
  '.hhPhPhPPhPhPhh.',
  'hhLhLhLhhLhLhLhh',
  'hPShSSLLLLSShSPh',
  'hpkssEESSEEsskph',
  '.hpkssSSSSsskph.',
  '..hhkksssskkhh..',
  '...KbBkkkkBbK...',
  '...KbbBBBBbbK...',
  '..KBKBSksSSKBK..',
  '..KBbkSSkSkbBK..',
]
export const JOY_COLORS = {
  K: 0x103050,
  W: 0xf8f8f8,
  b: 0x90c0f0,
  B: 0x5888b8,
  h: 0x884050,
  P: 0xd06878,
  p: 0xf8a0b0,
  k: 0x784040,
  s: 0xd89070,
  S: 0xf8c090,
  L: 0xf8d0b0,
  E: 0x000000,
}

// The healing machine behind the counter, a screen over the tray the ball sits in: o
// outline, a white, j light gray, g gray, m screen, M screen shine, G tray
const MACHINE = [
  '..oooooooooooo..',
  '.oaaaaaaaaaaaago',
  'oajjjjjjjjjjjjgo',
  'oajooooooooojjgo',
  'oajommmmmmmojjgo',
  'oajomMmmmmmojjgo',
  'oajommmmmmmojjgo',
  'oajooooooooojjgo',
  'oajjjjjjjjjjjjgo',
  'oggggggggggggggo',
  'oooooooooooooooo',
  'ojjjjjjjjjjjjjjo',
  'ojgoooooooooogjo',
  'ojgoGGGGGGGGogjo',
  'ojgoGGGGGGGGogjo',
  'ojgoGGGGGGGGogjo',
  'ojgoGGGGGGGGogjo',
]
const MACHINE_COLORS = { o: 0x505068, a: 0xf8f8f8, j: 0xc8c8c0, g: 0x909090, m: 0x9098b8, M: 0xc8d0f0, G: 0x707088 }
// The screen lights up with each chime
const LIT_MACHINE_COLORS = { ...MACHINE_COLORS, m: 0xf8b8d0, M: 0xffffff }
// The counter's d cream top, c cream edge, t tan lip, and f purple front with n ends
const COUNTER_COLORS = { o: 0x505068, d: 0xf8f8c0, c: 0xe0e0b0, t: 0xd89860, f: 0xb0a8d8, n: 0x9080a0 }
const counter = (width) => [
  'o'.repeat(width),
  'o' + 'd'.repeat(width - 2) + 'o',
  'o' + 'c'.repeat(width - 2) + 'o',
  'o' + 't'.repeat(width - 2) + 'o',
  'o'.repeat(width),
  'on' + 'f'.repeat(width - 4) + 'no',
  'o'.repeat(width),
]
const LIT_BALL_COLORS = { ...BALL_COLORS, R: 0xff9090, h: 0xffd0d0, W: 0xffffff, g: 0xf0d0e0 }

// The scene's size, and where its parts sit from its top left: the counter along the
// bottom, Joy standing behind it on the right, the machine on the left
const WIDTH = 38
const COUNTER_ROWS = 7
const HEIGHT = JOY.length + COUNTER_ROWS
const COUNTER_TOP = HEIGHT - COUNTER_ROWS
const MACHINE_X = 2
const JOY_X = WIDTH - JOY[0].length - 2
const BALL_X = MACHINE_X + 5
const BALL_Y = COUNTER_TOP - BALL.length
const COUNTER = counter(WIDTH)

// The band rows the Pokémon Center needs, two pixels to a row
export const CENTER_ROWS = Math.ceil(HEIGHT / 2)

// The strip columns it takes
export const centerSpan = () => WIDTH

// A sparkle is a plus, s pink with a w white heart, shrinking to a dot as it fades
export const SPARKLES = [['.s.', 'sws', '.s.'], ['w']]
export const SPARKLE_COLORS = { s: 0xff9ec4, w: 0xffffff }
export const SPARKLE_LIGHT_COLORS = { s: 0xf060a0, w: 0xffc0dc }
export const RECALL_RED = 0xff3030

// The mon turns red over RED_TICKS and goes into its ball in a flash, FLASH_BEAT ticks
// a frame, and Joy bows for BOW_TICKS, facing front a beat either side
const RED_TICKS = 12
const FLASH_BEAT = 3
const RECALL_TICKS = RED_TICKS + FLASH_BEAT * FLASH.length
const BOW_TICKS = 30
const BOW_BEAT = 6
// She blinks for BLINK_TICKS every BLINK_EVERY
const BLINK_EVERY = 80
const BLINK_TICKS = 3
const SPARKLE_EVERY = 10
const SPARKLE_RISE = 30
const SPARKLE_FADE = 8
// The healing machine's jingle as steps of 4 ticks: four short chimes, a long one,
// then a rest. Each step is how bright the ball and screen light up.
const JINGLE = [1, 0, 1, 0, 1, 0, 1, 1, 0.6, 0.3, 0, 0, 0, 0, 0, 0]
const JINGLE_STEP = 4

const stamp = (x, y, rows, colors) => ({ x, y, rows, colors })

// Where the heal is at: 'recall', 'heal', 'bow', or null before or after it, with the
// ticks since that phase began. A heal too short for all three gives the bow its time
// first, then the recall.
export function centerPhase(heal, tick) {
  if (!heal || tick < heal.startTick || tick >= heal.endTick) return null
  const age = tick - heal.startTick
  const bow = heal.endTick - BOW_TICKS
  if (tick >= bow) return { phase: 'bow', t: tick - Math.max(bow, heal.startTick) }
  return age < RECALL_TICKS ? { phase: 'recall', t: age } : { phase: 'heal', t: age - RECALL_TICKS }
}

// The mon is in its ball at the Pokémon Center, so the band shows the counter instead
export const atCenter = (heal, tick) => ['heal', 'bow'].includes(centerPhase(heal, tick)?.phase)

// How far to tint the mon toward RECALL_RED this tick as it goes into its ball, 1 once
// it's gone in
export function recallTint(heal, tick) {
  const at = centerPhase(heal, tick)
  return at?.phase === 'recall' ? Math.min(1, (at.t + 1) / RED_TICKS) : 0
}

// The flash the mon goes into its ball in, big and then small, as FLASH frames, or null
export function recallFlash(heal, tick) {
  const at = centerPhase(heal, tick)
  if (at?.phase !== 'recall' || at.t < RED_TICKS) return null
  return FLASH[Math.min(FLASH.length - 1, Math.floor((at.t - RED_TICKS) / FLASH_BEAT))]
}

// How bright the machine lights up this tick, 0 outside the heal
export function healGlow(heal, tick) {
  if (centerPhase(heal, tick)?.phase !== 'heal') return 0
  return JINGLE[Math.floor(tick / JINGLE_STEP) % JINGLE.length]
}

// The Pokémon Center this tick, its bottom row on the ground pixel row and its right
// edge on the right strip column, front to back. Empty outside it.
// centerStamps({ startTick, endTick }, tick, { ground, right }) -> [{ x, y, rows, colors }]
export function centerStamps(heal, tick, { ground, right }) {
  if (!atCenter(heal, tick)) return []
  const at = centerPhase(heal, tick)
  const left = right - WIDTH + 1
  const top = ground - HEIGHT + 1
  const lit = healGlow(heal, tick) >= 0.5
  let joy = tick % BLINK_EVERY < BLINK_TICKS ? BLINK : JOY
  if (at.phase === 'bow') joy = at.t >= BOW_BEAT && at.t < BOW_TICKS - BOW_BEAT ? BOW : JOY
  return [
    stamp(left + BALL_X, top + BALL_Y, BALL, lit ? LIT_BALL_COLORS : BALL_COLORS),
    stamp(left + JOY_X, top + COUNTER_TOP - joy.length, joy, JOY_COLORS),
    stamp(left, top + COUNTER_TOP, COUNTER, COUNTER_COLORS),
    stamp(left + MACHINE_X, top + COUNTER_TOP - MACHINE.length, MACHINE, lit ? LIT_MACHINE_COLORS : MACHINE_COLORS),
  ]
}

// Sparkles rising off the ball in the tray, one every SPARKLE_EVERY ticks, while it heals
export function sparkleStamps(heal, tick, { ground, right }, { light = false } = {}) {
  const at = centerPhase(heal, tick)
  if (at?.phase !== 'heal') return []
  const colors = light ? SPARKLE_LIGHT_COLORS : SPARKLE_COLORS
  const left = right - WIDTH + 1 + BALL_X
  const from = ground - HEIGHT + 1 + BALL_Y
  const newest = Math.floor(at.t / SPARKLE_EVERY)
  const out = []
  for (let i = newest; i >= 0 && at.t - i * SPARKLE_EVERY < SPARKLE_RISE; i--) {
    const age = at.t - i * SPARKLE_EVERY
    const art = SPARKLES[age >= SPARKLE_RISE - SPARKLE_FADE ? 1 : 0]
    const half = (art[0].length - 1) / 2
    const cx = left + Math.floor(rnd(heal.startTick, i) * BALL[0].length)
    const cy = Math.round(from - (from - 1) * (age / SPARKLE_RISE))
    out.push(stamp(cx - half, Math.max(0, cy - half), art, colors))
  }
  return out
}
