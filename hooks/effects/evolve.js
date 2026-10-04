// Evolution, as in the games: the mon faces out and glows into a flat silhouette that
// flickers between its own shape and the evolved one, faster and faster, until a flash
// leaves the evolved shape and its colors come back out of the light

import {
  BLACK, WHITE, back, baseAt, disc, dot, easeIn, easeInOut, easeOut, emit, luma, mix, phase, plus, rimGlow, rnd,
} from './draw.js'

const EVOLVE_TICKS = 140
const GLOW = [0, 30]
const FIRST_SWAP = 38
const FIRST_HOLD = 12
const SPEEDUP = 0.85
const FLASH = 118
const REVEAL = [122, 136]
const MOTES = 10
// The golden angle, which spreads motes evenly around a circle
const GOLDEN = 2.39996
// The squash a slow swap pops in with, tick by tick
const POP = [[1.08, 0.9], [0.97, 1.04]]
const BURST = 10
const TWINKLE = [0, 1, 2, 2, 1, 0]

// The ticks the silhouette changes shape at, each hold a little shorter than the last,
// down to a change every tick before the flash
const SWAPS = []
for (let t = FIRST_SWAP, hold = FIRST_HOLD; t < FLASH; hold = Math.max(1, hold * SPEEDUP)) {
  SWAPS.push(t)
  t += Math.round(hold)
}

const swapsBy = (t) => SWAPS.filter((s) => s <= t).length

// Whether the evolved shape shows at t
const evolvedAt = (t) => t >= FLASH || swapsBy(t) % 2 === 1

// How long ago the shape last changed, and how long it holds, or null before the first swap
function holdAt(t) {
  const k = swapsBy(t) - 1
  if (k < 0) return null
  return { since: t - SWAPS[k], hold: (SWAPS[k + 1] ?? FLASH) - SWAPS[k] }
}

// The silhouette color and two softer glows fading from it toward the background,
// which is dark behind a light silhouette and light behind a dark one
function tonesOf(c) {
  const away = luma(c) >= 128 ? BLACK : WHITE
  return [c, mix(c, away, 0.35), mix(c, away, 0.65)]
}

// Half the mon's larger side, for sizing light around it
const sizeOf = (g) => Math.max(g.right - g.left, g.bottom - g.top) / 2

// A one pixel glow just outside the shape as the frame shows it, behind it
function halo(out, g, c) {
  const at = baseAt(g, out)
  const solid = (x, y) => g.solid(...at(x, y))
  for (let y = g.top - 4; y <= g.bottom + 1; y++) {
    for (let x = g.left - 3; x <= g.right + 3; x++) {
      if (solid(x, y)) continue
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) back(out, x, y, c)
    }
  }
}

// Motes of light fly in from all around, trailing a tail, and sink into the body
function gather(out, t, seed, g, tones) {
  const reach = sizeOf(g) + 6
  emit(t, { count: MOTES, gap: 2.2, life: 12 }, (i, age, f) => {
    const angle = i * GOLDEN + rnd(seed, 0) * Math.PI * 2
    const r = reach * (1 - easeIn(f))
    const cos = Math.cos(angle)
    const sin = Math.sin(angle) * 0.75
    dot(out, g.cx + cos * (r + 2.5), g.cy + sin * (r + 2.5), tones[2])
    if (f < 0.7) plus(out, g.cx + cos * r, g.cy + sin * r, tones[1], tones[0])
    else dot(out, g.cx + cos * r, g.cy + sin * r, tones[0])
  })
}

// A disc of light behind the mon whose rim thins out over `soft` pixels
function bloom(out, seed, g, r, soft, c) {
  disc(out, g.cx, g.cy, r, c, back)
  for (let y = Math.floor(g.cy - r - soft); y <= g.cy + r + soft; y++) {
    for (let x = Math.floor(g.cx - r - soft); x <= g.cx + r + soft; x++) {
      const d = Math.hypot(x - g.cx, y - g.cy) - r
      if (d > 0 && rnd(seed, x * 131 + y) < 1 - d / soft) back(out, x, y, c)
    }
  }
}

// The flash: light floods out around the mon and dims, while motes of it burst out
// from behind the mon and slow down as they fade
function flash(out, t, seed, g, tones) {
  const age = t - FLASH
  const r = sizeOf(g)
  if (age >= 0 && age < 3) bloom(out, seed, g, r + 1 - age * 2, 4 - age, tones[age])
  emit(t, { count: BURST, gap: 0, start: FLASH + 1, life: 12 }, (i, life, f) => {
    const angle = (i / BURST) * Math.PI * 2 + rnd(seed, 1)
    const d = r * 0.8 + (r * 0.5 + 6) * easeOut(f)
    const x = g.cx + Math.cos(angle) * d
    const y = g.cy + Math.sin(angle) * d * 0.8
    if (f < 0.5) plus(out, x, y, tones[1], tones[0], back)
    else if (f < 0.8 || life % 2 === 0) back(out, x, y, f < 0.8 ? tones[0] : tones[1])
  })
}

// A four point twinkle in the silhouette's tones, its arms `size` pixels long
function twinkle(out, x, y, size, tones, paint) {
  if (size < 1) return paint(out, x, y, tones[1])
  plus(out, x, y, tones[1], tones[0], paint)
  for (let d = 2; d <= size; d++) {
    paint(out, x + d, y, tones[2])
    paint(out, x - d, y, tones[2])
    paint(out, x, y + d, tones[2])
    paint(out, x, y - d, tones[2])
  }
}

// Glow into a silhouette as motes gather, flicker between the two shapes, each slow swap
// popping in with a brighter glow, then flash and bring the evolved mon's colors back
function evolve(out, t, a, g, c) {
  const tones = tonesOf(c)
  if (t < GLOW[1]) {
    const body = easeIn(phase(t, GLOW[0] + 2, GLOW[1]))
    const edge = easeOut(phase(t, GLOW[0], GLOW[1] - 6))
    out.shade = rimGlow(g, out, c, body, c, edge)
    if (body > 0.5) halo(out, g, tones[2])
    gather(out, t, a.seed, g, tones)
    return
  }
  const swap = t < FLASH ? holdAt(t) : null
  if (swap && swap.hold >= 4 && swap.since < POP.length) [out.sx, out.sy] = POP[swap.since]
  const fade = 1 - easeInOut(phase(t, ...REVEAL))
  if (fade > 0) {
    const outline = 1 - easeOut(phase(t, REVEAL[0], REVEAL[1] - 5))
    const settled = swap && swap.since >= 2
    out.shade = t < REVEAL[0] ? () => c : rimGlow(g, out, c, fade, c, outline)
    halo(out, g, fade > 0.5 && !settled ? tones[1] : tones[2])
  }
  flash(out, t, a.seed, g, tones)

  // Twinkles pop up around the evolved mon, and over it once its colors are back
  emit(t, { count: 10, gap: 1.3, start: FLASH + 2, life: TWINKLE.length }, (i, life) => {
    const x = g.left - 2 + rnd(a.seed, i, 3) * (g.right - g.left + 4)
    const y = g.top - 1 + rnd(a.seed, i, 4) * (g.bottom - g.top)
    twinkle(out, x, y, TWINKLE[life], tones, fade > 0.5 ? back : dot)
  })
}

export const EVOLVE = {
  evolve: { ticks: EVOLVE_TICKS, color: WHITE, pose: (t) => ({ view: 'front', swap: evolvedAt(t) }), draw: evolve },
}
