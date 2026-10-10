import { rnd } from './effects/draw.js'

// Nurse Joy, who comes to a fainted mon while it heals at the Pokémon Center. She steps
// in from the left, stands just left of the mon while pink sparkles rise off it, hops
// twice when it's done, then steps back out. Every function is pure: the same heal and
// tick give the same stamps.
// The sprite faces front: K outline, W white, R red cross, B blue, P pink hair, S skin,
// s skin shade.
export const JOY = [
  '.....KKKKKK.....',
  '....KWWRRWWK....',
  '....KWRRRRWK....',
  '...KKBWRRWBKK...',
  '..KKPPBBBBPPKK..',
  '..KPKPPPPPPKPK..',
  '..KPKPKPPKPKPK..',
  '.KSKSKSKKSKSKSK.',
  '.KSKSSKSSKSSKSK.',
  'KPKssSKSSKSssKPK',
  'KPPKssSSSSssKPPK',
  'KPPPKKssssKKPPPK',
  '.KPPKKKKKKKKPPK.',
  '..KKBBKBBKBBKK..',
  '...KBSSssSSBK...',
  '..KBKKSSsSKKBK..',
  '..KBBWKssKWBBK..',
  '...KBWWKKWWBK...',
  '...KKBBBBBBKK...',
  '....KKKKKKKK....',
  '.....KK..KK.....',
]
// The walk swaps her feet: one plants while the other lifts behind the hem
const feet = (row) => [...JOY.slice(0, -1), row]
export const WALK = [JOY, feet('.....KK.........'), JOY, feet('..........KK....')]
// The band rows she needs, two pixels to a row, with a pixel for the step's lift
export const JOY_ROWS = Math.ceil((JOY.length + 1) / 2)

export const JOY_COLORS = { K: 0x2a2a2a, W: 0xfdfbfc, R: 0xa3302a, B: 0x6d93e5, P: 0xd88d91, S: 0xf8dcb5, s: 0xcdac8f }

// A sparkle is a plus, s pink with a w white heart, shrinking to a dot as it fades
export const SPARKLES = [['.s.', 'sws', '.s.'], ['w']]
export const SPARKLE_COLORS = { s: 0xff9ec4, w: 0xffffff }
export const SPARKLE_LIGHT_COLORS = { s: 0xf060a0, w: 0xffc0dc }
export const HEAL_PINK = 0xff9ec4

const TICKS_PER_SECOND = 20
const IN_TICKS = 3 * TICKS_PER_SECOND
const HOP_TICKS = 24
const OUT_TICKS = 3 * TICKS_PER_SECOND - HOP_TICKS
// Each walk frame shows for STEP_TICKS, and she moves on only when it changes. She's a
// pixel up as her feet pass, on the frames with one foot down.
const STEP_TICKS = 4
const HOP_BEAT = 6
const GAP = 2
const SPARKLE_EVERY = 8
const SPARKLE_RISE = 30
const SPARKLE_FADE = 8
// The healing machine's jingle as glow steps of 4 ticks: four short chimes, a long
// one, then a rest. Each step is how far to tint the mon toward HEAL_PINK.
const JINGLE = [0.45, 0, 0.45, 0, 0.45, 0, 0.45, 0.45, 0.35, 0.25, 0.15, 0, 0, 0, 0, 0]
const JINGLE_STEP = 4

const stamp = (x, y, rows, colors) => ({ x, y, rows, colors })
const WIDTH = JOY[0].length

// The columns Joy takes left of the mon, the gap included
export const joySpan = () => GAP + WIDTH

// Where the heal is at: 'in', 'heal', 'hop', 'out', or null before or after it, with
// the ticks since that phase began. A heal too short for the walk in skips to the exit.
export function joyPhase(heal, tick) {
  if (!heal || tick < heal.startTick || tick >= heal.endTick) return null
  const age = tick - heal.startTick
  const exit = heal.endTick - HOP_TICKS - OUT_TICKS
  if (tick >= exit) {
    const t = tick - Math.max(exit, heal.startTick)
    return t < HOP_TICKS ? { phase: 'hop', t } : { phase: 'out', t: t - HOP_TICKS }
  }
  return age < IN_TICKS ? { phase: 'in', t: age } : { phase: 'heal', t: age - IN_TICKS }
}

// Joy this tick, feet on the ground pixel row, her right edge GAP pixels left of
// monLeft, the mon's leftmost drawn strip column
// joyStamps({ startTick, endTick }, tick, { ground, monLeft, columns }) -> [{ x, y, rows, colors }]
export function joyStamps(heal, tick, { ground, monLeft, columns }) {
  const at = joyPhase(heal, tick)
  if (!at) return []
  const home = monLeft - GAP - WIDTH
  const offscreen = -WIDTH
  const step = Math.floor(at.t / STEP_TICKS)
  const walked = (from, to, ticks) => Math.round(from + ((to - from) * step) / Math.max(1, Math.floor(ticks / STEP_TICKS)))
  let x = home
  let rows = JOY
  let lift = 0
  if (at.phase === 'in' || at.phase === 'out') {
    x = at.phase === 'in' ? walked(offscreen, home, IN_TICKS) : walked(home, offscreen, OUT_TICKS)
    rows = WALK[step % WALK.length]
    lift = step % 2
  } else if (at.phase === 'hop') {
    lift = Math.floor(at.t / HOP_BEAT) % 2 ? 0 : 2
  }
  if (x >= columns) return []
  return [stamp(x, ground - rows.length + 1 - lift, rows, JOY_COLORS)]
}

// How far to tint the mon toward HEAL_PINK this tick, 0 outside the heal pose
export function healGlow(heal, tick) {
  if (joyPhase(heal, tick)?.phase !== 'heal') return 0
  return JINGLE[Math.floor(tick / JINGLE_STEP) % JINGLE.length]
}

// Sparkles rising off the mon's drawn box { left, right, top, bottom } in pixels,
// one every SPARKLE_EVERY ticks at a spot across it, while Joy stands by it
export function sparkleStamps(heal, tick, body, { light = false } = {}) {
  const at = joyPhase(heal, tick)
  if (at?.phase !== 'heal') return []
  const colors = light ? SPARKLE_LIGHT_COLORS : SPARKLE_COLORS
  const width = Math.max(1, body.right - body.left + 1)
  const newest = Math.floor(at.t / SPARKLE_EVERY)
  const out = []
  for (let i = newest; i >= 0 && at.t - i * SPARKLE_EVERY < SPARKLE_RISE; i--) {
    const age = at.t - i * SPARKLE_EVERY
    const art = SPARKLES[age >= SPARKLE_RISE - SPARKLE_FADE ? 1 : 0]
    const half = (art[0].length - 1) / 2
    const cx = body.left + Math.floor(rnd(heal.startTick, i) * width)
    const from = Math.floor((body.top + body.bottom) / 2)
    const to = body.top - 4
    const cy = Math.round(from + ((to - from) * age) / SPARKLE_RISE)
    out.push(stamp(cx - half, Math.max(0, cy - half), art, colors))
  }
  return out
}
