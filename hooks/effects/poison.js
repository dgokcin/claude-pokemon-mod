// Poison moves

import {
  WHITE, back, ball, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, lerp, light, line, mix, phase,
  plus, puff, ramp, ring, rnd, spark, sparkles, stamp, tint, tremble,
} from './draw.js'

const pt = (x, y) => ({ x, y })

// A lean of `px` pixels at the top of the body, fading to nothing at its feet, for out.skew
function lean(g, px, dy = 0) {
  if (!px) return null
  const height = Math.max(1, g.bottom - g.top)
  return (y) => px * Math.min(1, Math.max(0, (g.bottom + dy - y) / height))
}

// How far row y of the sprite is moved sideways this frame
const shiftAt = (out, y) => out.dx + (out.skew ? Math.round(out.skew(y)) : 0)

// A point along the curve from p to q that bows toward k
function bend(p, k, q, u) {
  const v = 1 - u
  return pt(v * v * p.x + 2 * v * u * k.x + u * u * q.x, v * v * p.y + 2 * v * u * k.y + u * u * q.y)
}

const BUBBLES = [
  ['.o.', 'owo', '.o.'],
  ['.oo.', 'ow.o', 'o..o', '.oo.'],
  ['.ooo.', 'ow..o', 'o...o', 'o...o', '.ooo.'],
]

// Poison bubbles that wobble up off a spot, swelling as they rise, then pop
function bubbles(out, t, start, x, y, c, seed, count = 5, spread = 7) {
  const palette = { o: c, w: light(c, 0.8) }
  emit(t, { count, gap: 2.8, start, life: (i) => 11 + Math.floor(rnd(seed, i, 1) * 4) }, (i, age, f) => {
    const side = i % 2 ? 1 : -1
    const bx = x + side * (1 + rnd(seed, i) * spread * 0.5) + Math.sin(age * 0.5 + i * 2) * 0.8
    const by = y - age * (0.55 + rnd(seed, i, 2) * 0.25)
    if (by < 1) return
    if (f > 0.86) {
      for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) dot(out, bx + ox * 2, by + oy * 2, light(c, 0.4))
      return
    }
    const art = BUBBLES[f < 0.25 ? 0 : f < 0.55 || i % 3 === 0 ? 1 : 2]
    stamp(out, bx - (art[0].length - 1) / 2, by - (art.length - 1) / 2, art, palette)
  })
}

// A poison stain on the target, purple flecks that pulse and seep down, then fade
function stain(out, t, start, x, y, c, seed) {
  const age = t - start
  if (age < 0 || age >= 14) return
  for (let k = 0; k < 4; k++) {
    if ((age + k) % 4 === 3 || rnd(seed, k, 9) < age / 16) continue
    const sx = x + Math.round((rnd(seed, k, 7) - 0.5) * 5)
    const sy = y + Math.round((rnd(seed, k, 8) - 0.5) * 4) + Math.floor(age / 5)
    dot(out, sx, sy, (age + k) % 2 ? c : dark(c, 0.25))
  }
}

// A needle from its base to its tip, with a white point, a lit shaft over a dark
// underside, and a thicker base
function needle(out, baseX, tipX, y, c, side) {
  const len = Math.round(Math.abs(tipX - baseX))
  for (let d = 0; d <= len; d++) {
    const x = tipX - side * d
    if (d < 2) {
      dot(out, x, y, WHITE)
      continue
    }
    dot(out, x, y, d < 4 ? light(c, 0.55) : light(c, 0.15))
    dot(out, x, y + 1, dark(c, 0.3))
    if (d >= len - 2) dot(out, x, y - 1, c)
  }
}

// Streaks trailing behind something flying fast
function streaks(out, x, y, side, len, c) {
  for (const [oy, k] of [[0, 1], [-1, 0.6], [1, 0.6]]) {
    const n = Math.round(len * k)
    for (let d = 1; d <= n; d++) dot(out, x - side * d, y + oy, d < n * 0.4 ? light(c, 0.3) : dark(c, 0.25))
  }
}

const STING_FIRE = 6
const STING_HIT = 10

// The mon draws back while a glint gathers, then fires a stinger that zips into the
// target trailing streaks, sticks there quivering, and leaves poison bubbling up
function poisonsting(out, t, a, g, c) {
  const side = g.side
  if (t >= 1 && t < STING_FIRE) {
    out.dx = -side
    out.skew = lean(g, -side)
  } else if (t >= STING_FIRE && t < STING_FIRE + 2) {
    out.dx = side
    out.skew = lean(g, side * 2)
  }
  const from = pt(g.mouth.x + shiftAt(out, g.mouth.y) + side * 2, g.mouth.y)
  const hit = pt(g.target.x, g.target.y - 1)
  if (t >= 2 && t < STING_FIRE) spark(out, from.x - side, from.y, t < 4 ? 1 : 2, light(c, 0.4))
  if (t >= STING_FIRE && t < STING_HIT) {
    const f = (t - STING_FIRE + 1) / (STING_HIT - STING_FIRE + 1)
    const tip = lerp(from.x, hit.x, f)
    const ty = lerp(from.y, hit.y, f)
    const len = Math.min(6, Math.abs(tip - from.x) + 2)
    streaks(out, tip - side * len, ty, side, 2 + (t - STING_FIRE) * 2, c)
    needle(out, tip - side * len, tip, ty, c, side)
  }
  const age = t - STING_HIT
  if (age >= 0 && age < 5) {
    // Stuck in the target, quivering, then gone
    if (age < 4) needle(out, hit.x - side * (6 - (age % 2)), hit.x + side * (age % 2), hit.y, c, side)
    if (age < 2) {
      disc(out, hit.x, hit.y, 1.5, WHITE)
      burst(out, hit.x, hit.y, 3 + age, light(c, 0.4))
    }
    if (age === 0) out.shake = [side, 0]
  }
  stain(out, t, STING_HIT + 2, hit.x, hit.y, c, a.seed)
  bubbles(out, t, STING_HIT + 1, hit.x, hit.y - 1, c, a.seed, 5, 7)
}

const JABS = [{ at: 8, dy: -2 }, { at: 15, dy: 3 }]
const JAB_OUT = 2
const JAB_BACK = 3

// Beedrill winds back and jabs twice with its stingers, high and then low, each thrust
// lunging forward to a hit spark, and poison bubbles up where both struck
function twineedle(out, t, a, g, c) {
  const side = g.side
  const lunging = JABS.find(({ at }) => t >= at - JAB_OUT && t <= at + 1)
  if (t >= 2 && t < JABS[0].at - JAB_OUT) {
    out.dx = -side
    out.sy = 0.95
    out.skew = lean(g, -side)
  } else if (lunging) {
    out.dx = side * 2
    out.skew = lean(g, side * 2)
  } else if (JABS.some(({ at }) => t > at + 1 && t <= at + JAB_BACK)) out.dx = side
  const hitX = g.target.x
  const baseY = Math.round(lerp(g.mouth.y, g.target.y, 0.4))

  for (const jab of JABS) {
    const k = t - (jab.at - JAB_OUT)
    if (k < 0 || k > JAB_OUT + JAB_BACK) continue
    const reach = k <= JAB_OUT ? easeOut(k / JAB_OUT) : 1 - (k - JAB_OUT) / JAB_BACK
    const y = baseY + jab.dy
    const baseX = g.mouth.x + shiftAt(out, y) - side * 2
    const tipX = lerp(baseX + side * 3, hitX, reach)
    if (k > 0 && k <= JAB_OUT) streaks(out, baseX, y, side, 4, c)
    needle(out, baseX, tipX, y, c, side)
  }
  for (const jab of JABS) {
    const age = t - jab.at
    const y = baseY + jab.dy
    if (age >= 0 && age < 5) {
      if (age === 0) disc(out, hitX, y, 2, WHITE)
      if (age < 3) burst(out, hitX, y, 3 + age, age < 1 ? light(c, 0.6) : c)
      else spark(out, hitX, y, 4 - age, light(c, 0.4))
    }
    if (age === 0) out.shake = [side, jab.dy > 0 ? 1 : 0]
    bubbles(out, t, jab.at + 3, hitX, y - 1, c, a.seed + jab.at, 3, 5)
  }
}

const ACID_SPITS = [7, 11, 15]
const ACID_FLIGHT = 6
const ACID_FIZZ = 0xf2ffd0

// How wide the puddle under the target has spread at tick t
function acidPool(t) {
  let w = 0
  for (const spit of ACID_SPITS) w += 4.5 * easeOut(phase(t, spit + ACID_FLIGHT + 2, spit + ACID_FLIGHT + 8))
  return w
}

// A glob of acid, a lit lime ball in a dark rim with a fizzing glint
function glob(out, x, y, r, c) {
  disc(out, x, y, r + 0.7, dark(c, 0.45))
  ball(out, x, y, r, c)
  dot(out, x - 1, y - 1, ACID_FIZZ)
}

// A puddle on the ground, a lit and shimmering surface over a dark rim
function pool(out, x, y, w, c, t) {
  const half = Math.round(w / 2)
  for (let d = -half; d <= half; d++) {
    const inner = Math.abs(d) < half - 1
    dot(out, x + d, y, inner ? dark(c, 0.15) : dark(c, 0.45))
    if (inner) dot(out, x + d, y - 1, (d * 3 + t) % 7 === 0 ? ACID_FIZZ : (d + t) % 4 === 0 ? light(c, 0.35) : c)
    if (Math.abs(d) < half - 3) dot(out, x + d, y - 2, dark(c, 0.3))
  }
}

// A puff of fume rising off the puddle, pale lime steam that swells, sways and fades
function fume(out, x, y, age, c, seed) {
  const f = age / 12
  const px = x + Math.sin(age * 0.45 + seed) * 1.5
  const py = y - age * 0.75
  const col = mix(light(c, 0.4), 0x8e928a, f)
  if (f < 0.35) {
    dot(out, px, py, col)
    dot(out, px, py - 1, light(col, 0.3))
  } else if (f < 0.8) plus(out, px, py, col, light(col, 0.25))
  else {
    dot(out, px - 1, py, col)
    dot(out, px + 1, py - 1, col)
  }
}

// The mon rears back gurgling, then spits three globs of fizzing acid that arc onto
// the target and splash, dripping into a puddle that hisses and fumes
function acid(out, t, a, g, c) {
  const side = g.side
  const spitting = ACID_SPITS.find((s) => t >= s - 1 && t <= s + 1)
  if (t >= 1 && t < ACID_SPITS[0] - 1) {
    out.dx = -side
    out.dy = t >= 3 ? -1 : 0
    out.sx = 1.05
    out.skew = lean(g, -side * 2, out.dy)
  } else if (spitting !== undefined) {
    out.dx = t === spitting - 1 ? -side : side
    out.skew = lean(g, t === spitting - 1 ? -side : side * 2)
  }
  const from = pt(g.mouth.x + shiftAt(out, g.mouth.y + out.dy) + side, g.mouth.y + out.dy)
  const floor = g.ground

  // Gurgling bubbles at the mouth while it winds up
  if (t >= 2 && t < ACID_SPITS[0]) {
    for (let k = 0; k < 2; k++) {
      const x = from.x + side * ((t + k * 2) % 3)
      const y = from.y - ((t + k * 3) % 4) * 0.7
      dot(out, x, y, k ? ACID_FIZZ : c)
    }
  }

  ACID_SPITS.forEach((spit, k) => {
    const age = t - spit
    const land = pt(g.target.x + (k - 1) * 2 * side, g.target.y - 1 + (k % 2) * 2)
    if (age >= 0 && age < ACID_FLIGHT) {
      const f = age / ACID_FLIGHT
      const top = pt((from.x + land.x) / 2, Math.min(from.y, land.y) - 5)
      const p = bend(from, top, land, f)
      const q = bend(from, top, land, Math.max(0, f - 0.2))
      dot(out, q.x, q.y, c)
      glob(out, p.x, p.y, 1.2, c)
      if (age === 0) plus(out, from.x, from.y, c, ACID_FIZZ)
    }
    // Each glob splashes in a ring of drops, throws droplets up, and drips away
    const hit = age - ACID_FLIGHT
    if (hit >= 0 && hit < 3) {
      disc(out, land.x, land.y, 2 - hit * 0.5, hit ? c : ACID_FIZZ)
      if (hit === 0) dot(out, land.x, land.y, WHITE)
      for (let j = 0; j < 6; j++) {
        const angle = (j / 6) * Math.PI * 2 + 0.5
        const r = 2.5 + hit * 1.2
        dot(out, land.x + Math.cos(angle) * r, land.y + Math.sin(angle) * r * 0.8, hit < 2 ? light(c, 0.35) : c)
      }
      if (hit === 0) out.shake = [k === ACID_SPITS.length - 1 ? side : 0, 0]
    }
    emit(hit, { count: 5, gap: 0, life: 9 }, (i, life) => {
      const angle = -Math.PI / 2 + (i - 2) * 0.6 + (rnd(a.seed + k, i) - 0.5) * 0.4
      const speed = 0.8 + rnd(a.seed + k, i, 1) * 0.5
      const x = land.x + Math.cos(angle) * speed * life
      const y = land.y + Math.sin(angle) * speed * life + 0.14 * life * life
      if (y < floor - 1) dot(out, x, y, i % 2 ? light(c, 0.3) : c)
    })
    emit(hit, { count: 3, gap: 2, start: 1, life: 8 }, (i, life) => {
      const x = land.x + (i - 1) * 2
      const y = land.y + 1 + life * life * 0.25
      if (y >= floor - 1) return
      dot(out, x, y, c)
      dot(out, x, y - 1, dark(c, 0.2))
    })
  })

  // The puddle spreads, sizzles and sends up fumes, then dries away
  const w = acidPool(t) * (1 - phase(t, a.ticks - 6, a.ticks))
  if (w >= 2) {
    pool(out, g.target.x, floor, w, c, t)
    const firstIn = ACID_SPITS[0] + ACID_FLIGHT + 3
    emit(t, { count: 10, gap: 2, start: firstIn, life: 12 }, (i, age) => {
      const x = g.target.x + (rnd(a.seed, i, 4) - 0.5) * (w - 2)
      fume(out, x, floor - 2, age, c, i)
    })
    // Sizzles pop on the surface
    for (let k = 0; k < 2; k++) {
      const beat = Math.floor((t + k * 3) / 3)
      const x = g.target.x + Math.round((rnd(a.seed, k + 20, beat) - 0.5) * (w - 3))
      if ((t + k * 3) % 3 === 0) spark(out, x, floor - 2, 1, light(c, 0.5))
      else if ((t + k * 3) % 3 === 1) dot(out, x, floor - 2, ACID_FIZZ)
    }
  }
}

const SLUDGE_THROW = 9
const SLUDGE_SPLAT = 18
const SLUDGE_POOL = 22
const DOMES = [
  ['.m.', 'mhm'],
  ['.mm.', 'mhlm', 'mmmm'],
  ['.mmm.', 'mhllm', 'mlllm'],
  ['m...m', '.....', 'm...m'],
]

// A wobbling blob of sludge, lit on top inside a dark rim, squashing as it flies
function blob(out, x, y, r, squash, c) {
  const [hi, lit, base, shadow] = ramp(c)
  const rx = r * (1 + squash)
  const ry = r * (1 - squash)
  for (let py = Math.floor(y - ry - 1); py <= Math.ceil(y + ry + 1); py++) {
    for (let px = Math.floor(x - rx - 1); px <= Math.ceil(x + rx + 1); px++) {
      const d = ((px - x) / (rx + 0.5)) ** 2 + ((py - y) / (ry + 0.5)) ** 2
      if (d > 1) continue
      const lean = (px - x) / (rx + 0.5) + (py - y) / (ry + 0.5)
      dot(out, px, py, d > 0.62 ? dark(c, 0.5) : lean < -0.7 ? hi : lean < -0.1 ? lit : lean < 0.6 ? base : shadow)
    }
  }
}

// The mon heaves and a big glob of sludge swells at its mouth, gets lobbed high and
// splats on the target, oozing down into a thick puddle where bubbles swell and pop
function sludge(out, t, a, g, c) {
  const side = g.side
  if (t >= 2 && t < SLUDGE_THROW - 2) {
    out.sy = 0.9
    out.sx = 1.08
    out.dx = -side
    out.skew = lean(g, -side * 2)
  } else if (t >= SLUDGE_THROW - 2 && t < SLUDGE_THROW + 1) {
    out.sy = 1.07
    out.sx = 0.95
    out.dy = -1
    out.dx = side
    out.skew = lean(g, side * 2, -1)
  }
  const from = pt(g.mouth.x + shiftAt(out, g.mouth.y + out.dy) + side * 2, g.mouth.y + out.dy)
  const hit = pt(g.target.x, g.target.y - 1)
  const floor = g.ground
  const top = pt((from.x + hit.x) / 2, Math.max(2, Math.min(from.y, hit.y) - 9))

  if (t >= 2 && t < SLUDGE_THROW) blob(out, from.x, from.y, 0.8 + phase(t, 2, SLUDGE_THROW) * 2, Math.sin(t * 1.3) * 0.2, c)
  if (t >= SLUDGE_THROW && t < SLUDGE_SPLAT) {
    const f = phase(t, SLUDGE_THROW, SLUDGE_SPLAT)
    const p = bend(from, top, hit, f)
    blob(out, p.x, p.y, 2.7, Math.sin(t * 1.4) * 0.14, c)
    // Drips fall off the glob as it flies
    for (let k = 1; k <= 2; k++) {
      const lag = (t - SLUDGE_THROW + k * 2) % 4
      const q = bend(from, top, hit, Math.max(0, f - 0.08 * lag))
      if (t > SLUDGE_THROW + 1) dot(out, q.x + k - 1.5, q.y + 3 + lag * lag * 0.5, dark(c, 0.2))
    }
  }

  // The splat flashes, flattens on the target and flings gobs out
  const splat = t - SLUDGE_SPLAT
  if (splat >= 0 && splat < 6) {
    if (splat === 0) disc(out, hit.x, hit.y, 3, light(c, 0.5))
    blob(out, hit.x, hit.y + Math.min(2, splat * 0.5), 2.6, Math.min(0.6, 0.35 + splat * 0.08), c)
    if (splat < 2) {
      for (let k = 0; k < 10; k++) {
        const angle = (k / 10) * Math.PI * 2 + 0.3
        const len = 4 + splat * 2 + (k % 3)
        const x = hit.x + Math.cos(angle) * len
        const y = hit.y + Math.sin(angle) * len * 0.55
        dot(out, x, y, k % 2 ? light(c, 0.3) : c)
        if (splat === 1) dot(out, hit.x + Math.cos(angle) * (len - 1), hit.y + Math.sin(angle) * (len - 1) * 0.55, dark(c, 0.2))
      }
    }
    if (splat === 0) out.shake = [side, 1]
    if (splat === 1) out.shake = [-side, 0]
  }
  emit(splat, { count: 7, gap: 0, life: 12 }, (i, life) => {
    const angle = -Math.PI / 2 + (rnd(a.seed, i) - 0.5) * 3
    const speed = 0.8 + rnd(a.seed, i, 1) * 0.6
    const x = hit.x + Math.cos(angle) * speed * life
    const y = hit.y + Math.sin(angle) * speed * life + 0.12 * life * life
    if (y >= floor - 1) return
    dot(out, x, y, light(c, 0.15))
    dot(out, x + 1, y, c)
    dot(out, x, y + 1, dark(c, 0.3))
  })

  // Gobs ooze down from the splat to the ground
  emit(splat, { count: 4, gap: 1.5, start: 2, life: 9 }, (i, life) => {
    const x = hit.x + [-2, 1, -1, 2][i]
    const y = hit.y + 2 + life * life * 0.12
    if (y >= floor - 1) return
    dot(out, x, y, c)
    dot(out, x, y + 1, dark(c, 0.25))
    dot(out, x, y - 1, dark(c, 0.1))
  })

  // A thick, glossy puddle where domes swell up and pop
  if (t >= SLUDGE_POOL) {
    const grow = easeOut(phase(t, SLUDGE_POOL, SLUDGE_POOL + 6))
    const fade = phase(t, a.ticks - 6, a.ticks)
    const half = Math.round(6.5 * grow * (1 - fade))
    for (let d = -half; d <= half; d++) {
      const rim = Math.abs(d) >= half - 1
      dot(out, hit.x + d, floor, dark(c, 0.45))
      if (!rim) dot(out, hit.x + d, floor - 1, (d + (t >> 1)) % 6 === 0 ? light(c, 0.45) : c)
      if (Math.abs(d) < half - 2) dot(out, hit.x + d, floor - 2, (d + (t >> 1)) % 6 === 3 ? light(c, 0.25) : dark(c, 0.1))
    }
    if (half >= 4) {
      const palette = { m: c, h: WHITE, l: light(c, 0.3) }
      for (let k = 0; k < 2; k++) {
        const clock = t - SLUDGE_POOL - 3 + k * 4
        if (clock < 0) continue
        const stage = Math.floor(clock / 2) % 5
        if (stage > 3) continue
        const bx = hit.x + Math.round((rnd(a.seed, k, Math.floor(clock / 10)) - 0.5) * (half * 2 - 6))
        const art = DOMES[stage]
        stamp(out, bx - Math.floor(art[0].length / 2), floor - 2 - art.length + (stage === 3 ? -1 : 1), art, palette)
      }
    }
  }
}

const GAS_START = 6
const GAS_STOP = 30

// A cloud puff in four tones, light on top and ragged at the rim, with holes opening
// up as `density` drops
function cloud(out, x, y, r, tones, density, seed, paint = dot) {
  const [hi, lit, base, shadow] = tones
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const d = Math.hypot(px - x, py - y) / Math.max(0.5, r)
      if (d > 1.05 || (d > 0.72 && rnd(seed, px * 31 + py) < 0.4)) continue
      if (density < 1 && rnd(seed, px * 17 + py * 7, 3) > density) continue
      const up = py - y < -r * 0.3
      paint(out, px, py, d < 0.4 ? (up ? hi : lit) : d < 0.75 ? (up ? lit : base) : shadow)
    }
  }
}

// Where puff i starts, at the mouth or, for a mon made of gas, round its body
function gasSource(i, g, a) {
  if (a.from !== 'body') return pt(g.mouth.x, g.mouth.y + (rnd(a.seed, i, 1) - 0.5) * 2)
  const angle = rnd(a.seed, i, 1) * Math.PI * 2
  return pt(g.cx + Math.cos(angle) * (g.right - g.left) * 0.4, g.cy + Math.sin(angle) * (g.bottom - g.top) * 0.4)
}

// Where puff i settles, in a band toward the target or, for a smokescreen, anywhere in
// the space in front of the mon
function gasSpot(i, g, a, thick) {
  const u = rnd(a.seed, i, 2)
  const v = rnd(a.seed, i, 3)
  if (thick) return pt(g.ahead(1 + u * Math.max(3, g.reach - 1)), lerp(1, g.ground - 2, v))
  const far = Math.max(4, Math.min(g.reach - 2, 15))
  return pt(g.ahead(2 + u * far), lerp(g.mouth.y - 3, g.target.y + 2, v))
}

// The mon swells, then billows out clouds that roll toward the target and thin away.
// Smokescreen walls off the space in front of the mon with thick dark smoke.
function gas(out, t, a, g, c) {
  const side = g.side
  const thick = a.power >= 2
  if (t >= 1 && t < GAS_START) {
    const f = easeOut(phase(t, 1, GAS_START))
    out.sx = 1 + 0.07 * f
    out.sy = 1 + 0.05 * f
    out.dx = -side
    out.skew = lean(g, -side)
  } else if (t >= GAS_START && t < GAS_STOP) {
    out.sx = 0.97
    out.dx = t % 4 < 2 ? 0 : side
  }
  const tones = thick ? [light(c, 0.4), light(c, 0.2), c, dark(c, 0.35)] : ramp(c)
  const count = thick ? 26 : 15
  const gap = (GAS_STOP - GAS_START) / count
  const fadeOut = phase(t, a.ticks - 16, a.ticks - 1)
  // Newer puffs are drawn first and hide what is behind them, so each pixel is painted once
  const front = new Set()
  const behind = new Set()
  const once = (paint, shown) => (o, x, y, col) => {
    const key = Math.round(x) * 4096 + Math.round(y)
    if (shown.has(key)) return
    shown.add(key)
    paint(o, x, y, col)
  }
  const puffs = []
  emit(t, { count, gap, start: GAS_START, life: a.ticks - GAS_START }, (i, age) => puffs.push([i, age]))
  for (const [i, age] of puffs.reverse()) {
    const src = gasSource(i, g, a)
    const spot = gasSpot(i, g, a, thick)
    const travel = easeOut(Math.min(1, age / (thick ? 10 : 14)))
    const x = lerp(src.x, spot.x, travel) + Math.sin(age * 0.25 + i) * 1.2
    const y = lerp(src.y, spot.y, travel) + Math.cos(age * 0.2 + i * 2) * 0.8 - (thick ? 0 : age * 0.05)
    const rmax = thick ? 4.5 + rnd(a.seed, i, 4) * 2 : 3 + rnd(a.seed, i, 4) * 1.5
    const r = lerp(1.2, rmax, easeOut(Math.min(1, age / 10))) + Math.sin(age * 0.4 + i) * 0.3
    const density = 1 - fadeOut * (0.7 + rnd(a.seed, i, 5) * 0.5)
    // Gas leaking from the whole body billows out from behind it before rolling forward
    const paint = a.from === 'body' && age < 8 ? once(back, behind) : once(dot, front)
    if (density > 0.05) cloud(out, x, Math.min(g.ground - r * 0.4, y), r * (1 - fadeOut * 0.3), tones, density, a.seed + i, paint)
  }
}

const PIN_FIRST = 6
const PIN_COUNT = 10
const PIN_GAP = 2
const PIN_FLIGHT = 3
const PIN_STUCK = 2

// A glowing pin flying along (dx, dy) per pixel, a white hot head in a bright halo over
// a thick shaft that cools off behind it
function pin(out, x, y, dx, dy, c) {
  const glow = mix(c, 0x60ff60, 0.25)
  for (let d = 5; d >= 1; d--) {
    const px = x - dx * d
    const py = y - dy * d
    dot(out, px, py + 1, dark(glow, 0.45))
    dot(out, px, py, d < 2 ? WHITE : d < 4 ? light(glow, 0.3) : glow)
  }
  plus(out, x, y, light(glow, 0.2), WHITE)
}

// The column just in front of the body on row y, or the mouth's when the row is empty
function frontAt(g, y) {
  const from = g.side > 0 ? g.right : g.left
  for (let k = 0; k <= g.right - g.left; k++) {
    if (g.solid(from - g.side * k, y)) return from - g.side * (k - 1)
  }
  return g.mouth.x
}

// The mon bristles and crackles, then fires a rapid volley of glowing needles off its
// front that stick in the target like pins and pop one after another in tiny bursts
function pinmissile(out, t, a, g, c) {
  const side = g.side
  const last = PIN_FIRST + (PIN_COUNT - 1) * PIN_GAP
  const firing = t >= PIN_FIRST && t <= last
  if (t >= 1 && t < PIN_FIRST) {
    out.dx = tremble(t) < 0 ? -side : 0
    out.sy = 0.96
    // Alternate rows jitter apart, like fur standing on end with static
    out.skew = (y) => ((y + t) % 2 ? 1 : 0)
  } else if (firing) out.dx = (t - PIN_FIRST) % PIN_GAP === 0 ? -side : 0
  if (t >= 2 && t <= last + 1) out.shade = tint(light(c, 0.5), (t - PIN_FIRST) % PIN_GAP === 0 && firing ? 0.3 : 0.1)

  // Glints crackle over the bristling body
  if (t >= 1 && t < last) {
    for (let k = 0; k < 2; k++) {
      const x = Math.round(lerp(g.left, g.right, rnd(a.seed, k, t)))
      const y = Math.round(lerp(g.top, g.bottom, rnd(a.seed, k + 4, t)))
      if (g.solid(x, y)) spark(out, x + out.dx, y, (t + k) % 2, light(c, 0.4))
    }
  }

  emit(t, { count: PIN_COUNT, gap: PIN_GAP, start: PIN_FIRST, life: PIN_FLIGHT + PIN_STUCK + 4 }, (i, age) => {
    const y = Math.round(lerp(g.top + 2, g.bottom - 3, rnd(a.seed, i)))
    const from = pt(frontAt(g, y) + out.dx, y)
    const to = pt(g.target.x + side * (rnd(a.seed, i, 1) - 0.3) * 4, g.target.y - 1 + (rnd(a.seed, i, 2) - 0.5) * 9)
    const len = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y))
    const dx = (to.x - from.x) / len
    const dy = (to.y - from.y) / len
    if (age < PIN_FLIGHT) {
      const f = (age + 1) / PIN_FLIGHT
      pin(out, lerp(from.x, to.x, f), lerp(from.y, to.y, f), dx, dy, c)
      if (age === 0) plus(out, from.x, from.y, light(c, 0.4), WHITE)
      return
    }
    const stuck = age - PIN_FLIGHT
    if (stuck < PIN_STUCK) {
      // Stuck in the target, still glowing
      for (let d = 0; d < 4; d++) dot(out, to.x - dx * d, to.y - dy * d, d ? (d < 2 ? light(c, 0.4) : c) : WHITE)
      return
    }
    const pop = stuck - PIN_STUCK
    if (pop === 0) {
      burst(out, to.x, to.y, 3, light(c, 0.3))
      if (i % 3 === 2) out.shake = [side, 0]
    } else {
      for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) dot(out, to.x + ox * (pop + 1), to.y + oy * (pop + 1), pop < 3 ? light(c, 0.3) : dark(c, 0.2))
    }
  })
}

const CANNON_SHOTS = [6, 13, 20, 27]
const CANNON_FLIGHT = 3
const SPIKE = ['ll......', 'mmmll...', 'mmmmmmlw', 'dddmm...', 'dd......']

// How far the recoil throws the mon back at tick t
function recoil(t) {
  for (const shot of CANNON_SHOTS) {
    const k = t - shot
    if (k >= 0 && k < 4) return [2, 2, 1, 0][k]
  }
  return 0
}

// A two by two chunk of debris, lit on top
function chunk(out, x, y, c) {
  dot(out, x, y, light(c, 0.3))
  dot(out, x + 1, y, c)
  dot(out, x, y + 1, c)
  dot(out, x + 1, y + 1, dark(c, 0.4))
}

// The mon braces, then fires big spikes like cannon shots, kicked back by each blast
// with a muzzle flash and smoke, and every spike lands in a chunky burst of debris
function spikecannon(out, t, a, g, c) {
  const side = g.side
  if (t >= 1 && t < CANNON_SHOTS[0]) {
    out.sy = 0.93
    out.sx = 1.04
  }
  out.dx = -side * recoil(t)
  const kick = CANNON_SHOTS.includes(t) ? 2 : CANNON_SHOTS.includes(t - 1) ? 1 : 0
  if (kick) out.skew = lean(g, -side * kick)
  if (CANNON_SHOTS.includes(t)) {
    out.sx = 1.06
    out.sy = 0.94
  }
  const muzzle = pt(g.mouth.x + shiftAt(out, g.mouth.y), g.mouth.y)
  const palette = { l: light(c, 0.5), m: c, d: dark(c, 0.45), w: WHITE }
  const w = SPIKE[0].length

  CANNON_SHOTS.forEach((shot, k) => {
    const age = t - shot
    const y = Math.round(lerp(g.mouth.y, g.target.y, 0.5)) + [-1, 2, 0, 1][k]
    const hitX = g.target.x
    if (age >= 0 && age < CANNON_FLIGHT) {
      const f = (age + 1) / CANNON_FLIGHT
      const tip = lerp(muzzle.x + side * 3, hitX, f)
      const ty = lerp(g.mouth.y, y, f)
      streaks(out, tip - side * w, ty, side, 3 + age * 2, c)
      stamp(out, side > 0 ? tip - w + 1 : tip, ty - 2, SPIKE, palette, side < 0)
    }
    // Muzzle flash over the spike leaving, then a puff of smoke drifting up
    if (age === 0) {
      disc(out, muzzle.x + side, muzzle.y, 2, WHITE)
      burst(out, muzzle.x + side, muzzle.y, 3, light(c, 0.3))
    }
    if (age >= 1 && age < 8) puff(out, muzzle.x + side * (1 + age * 0.3), muzzle.y - 1 - age * 0.6, 1 + age * 0.3, mix(c, 0x8a8a90, 0.4 + age * 0.05), a.seed + k)
    // A chunky impact, with a flash, a burst, and blocks of debris thrown up and out
    const hit = age - CANNON_FLIGHT
    if (hit >= 0 && hit < 4) {
      if (hit === 0) disc(out, hitX, y, 2.5, WHITE)
      else burst(out, hitX, y, 6 - hit, hit < 2 ? light(c, 0.4) : c)
      if (hit === 0) out.shake = [side, k === CANNON_SHOTS.length - 1 ? 1 : 0]
    }
    emit(hit, { count: 5, gap: 0, life: 12 }, (i, life) => {
      const angle = -Math.PI / 2 - side * (0.2 + rnd(a.seed + k, i) * 1.3)
      const speed = 0.9 + rnd(a.seed + k, i, 1) * 0.7
      const x = hitX + Math.cos(angle) * speed * life
      const dy = Math.sin(angle) * speed * life + 0.14 * life * life
      if (y + dy < g.ground) chunk(out, x, y + dy, c)
    })
  })
}

const TAU = Math.PI * 2

// A falling drop of venom, a dark rimmed teardrop with a glint
function drop(out, x, y, c) {
  dot(out, x, y - 2, dark(c, 0.4))
  for (let d = -1; d <= 1; d++) dot(out, x + d, y, d ? dark(c, 0.4) : c)
  dot(out, x - 1, y - 1, dark(c, 0.4))
  dot(out, x + 1, y - 1, dark(c, 0.4))
  dot(out, x, y + 1, dark(c, 0.45))
  dot(out, x, y - 1, light(c, 0.6))
}

const TOXIC_SHOTS = [8, 14, 20]
const TOXIC_FLIGHT = 7
const TOXIC_SKULL = 30
const SKULL = ['.kkkkk.', 'kwwwwwk', 'kweweek', 'kwwwwwk', '.kwkwk.', '..kkk..']

// Venom wells up in the mon, then it spits three drops high into the air that rain onto
// the target, each splash bigger than the last, until a skull rises off the target
function toxic(out, t, a, g, c) {
  const side = g.side
  const shot = TOXIC_SHOTS.find((s) => t >= s - 1 && t < s + 2)
  if (t >= 1 && t < TOXIC_SHOTS[0] - 1) {
    out.sy = 1 - 0.06 * phase(t, 1, 6)
    out.dx = tremble(t) < 0 ? -side : 0
    out.shade = tint(c, 0.15 + 0.15 * Math.sin(t * 1.2))
  } else if (shot !== undefined) {
    out.dy = t === shot - 1 ? 0 : -1
    out.skew = lean(g, t === shot - 1 ? -side : side * 2, out.dy)
  }
  const from = pt(g.mouth.x + shiftAt(out, g.mouth.y) + side, g.mouth.y + out.dy)
  TOXIC_SHOTS.forEach((s, k) => {
    const age = t - s
    const land = pt(g.target.x + (k - 1) * side * 2, g.target.y - 1)
    if (age >= 0 && age < TOXIC_FLIGHT) {
      const f = (age + 1) / TOXIC_FLIGHT
      const p = bend(from, pt((from.x + land.x) / 2, 0), land, f)
      drop(out, p.x, p.y, c)
      if (age === 0) plus(out, from.x, from.y, c, light(c, 0.6))
    }
    // Each splash throws a ring of droplets, wider than the one before
    const hit = age - TOXIC_FLIGHT
    if (hit >= 0 && hit < 5) {
      const r = (2 + k) * (0.6 + hit * 0.4)
      for (let j = 0; j < 8 + k * 2; j++) {
        const ang = (j / (8 + k * 2)) * TAU
        dot(out, land.x + Math.cos(ang) * r, land.y + Math.sin(ang) * r * 0.7, hit < 2 ? light(c, 0.4) : dark(c, 0.2))
      }
      if (hit === 0) {
        disc(out, land.x, land.y, 1.5 + k * 0.5, light(c, 0.5))
        out.shake = [side, k === 2 ? 1 : 0]
      }
    }
    if (hit >= 0) bubbles(out, t, s + TOXIC_FLIGHT + 1, land.x, land.y, c, a.seed + k, 2 + k, 5 + k * 2)
  })
  const skull = t - TOXIC_SKULL
  if (skull >= 0 && skull < 14 && !(skull > 10 && t % 2)) {
    const y = g.target.y - 8 - skull * 0.5
    stamp(out, g.target.x - 3, y - 3, SKULL, { k: dark(c, 0.5), w: light(c, 0.55), e: dark(c, 0.7) })
  }
  stain(out, t, TOXIC_SHOTS[2] + TOXIC_FLIGHT, g.target.x, g.target.y, c, a.seed)
}

const GASTRO_POUR = 10
const GASTRO_STOP = 24
const GASTRO_DONE = 28

// The belly swells and gurgles, then the mon retches up a thick rope of acid that arcs
// onto the target and coats it, oozing down in long strands
function gastroacid(out, t, a, g, c) {
  const side = g.side
  const [hi, lit, , deep] = ramp(c)
  const pouring = t >= GASTRO_POUR && t < GASTRO_DONE
  if (t >= 1 && t < GASTRO_POUR) {
    const f = easeOut(phase(t, 1, GASTRO_POUR - 2))
    out.sx = 1 + 0.08 * f + (t % 3 === 0 ? 0.02 : 0)
    out.sy = 1 - 0.05 * f
    out.dx = -side
  } else if (pouring) {
    out.dx = side
    out.dy = 1
    out.skew = lean(g, side * 2, 1)
    out.sy = t % 2 ? 0.97 : 1
  }
  const from = pt(g.mouth.x + shiftAt(out, g.mouth.y) + side, g.mouth.y + out.dy)
  const to = pt(g.target.x, g.target.y - 2)
  const top = pt((from.x + to.x) / 2, Math.min(from.y, to.y) - 4)
  if (t >= 3 && t < GASTRO_POUR) {
    for (let k = 0; k < 2; k++) dot(out, from.x + side * ((t + k) % 2), from.y - ((t + k * 2) % 3), k ? hi : c)
  }
  // The rope runs from its tail to its head along the arc, its surface rippling
  if (pouring) {
    const head = phase(t, GASTRO_POUR, GASTRO_POUR + 3)
    const tail = phase(t, GASTRO_STOP, GASTRO_DONE)
    for (let u = tail; u <= head; u += 0.02) {
      const p = bend(from, top, to, u)
      const swell = Math.sin(u * 14 - t * 1.3) > 0.4 ? 1 : 0
      dot(out, p.x, p.y - 1, deep)
      dot(out, p.x, p.y, (Math.round(u * 50) + t) % 5 === 0 ? hi : lit)
      dot(out, p.x, p.y + 1, c)
      if (swell) dot(out, p.x, p.y + 2, deep)
    }
  }
  // The coat on the target, a lumpy blob that swells as acid keeps landing
  const coat = phase(t, GASTRO_POUR + 3, GASTRO_STOP) * (1 - phase(t, a.ticks - 6, a.ticks))
  if (coat > 0) {
    const r = 1.5 + coat * 2.5
    blob(out, to.x, to.y + 1, r, 0.25 + Math.sin(t * 0.7) * 0.08, c)
    if (t < GASTRO_STOP && t % 3 === 0) out.shake = [side, 0]
  }
  emit(t, { count: 7, gap: 2.5, start: GASTRO_POUR + 4, life: 14 }, (i, age, f) => {
    const x = to.x + Math.round((rnd(a.seed, i) - 0.5) * 7)
    const len = Math.min(g.ground - 2 - to.y, age * 0.9)
    for (let d = 1; d <= len; d++) dot(out, x, to.y + 2 + d, d > len - 1 ? lit : c)
    if (f < 0.85) {
      dot(out, x, to.y + 3 + len, deep)
      dot(out, x + 1, to.y + 2 + len, c)
    }
  })
}

const BOMB_LOB = 11
const BOMB_HIT = 20

// A ball of sludge spotted with dark muck, the spots rolling as it turns
function bomb(out, x, y, r, turn, c) {
  ball(out, x, y, r, c)
  ring(out, x, y, r + 0.6, dark(c, 0.55))
  for (let k = 0; k < 3; k++) {
    const ang = turn + (k * TAU) / 3
    const px = x + Math.cos(ang) * r * 0.55
    if (Math.sin(ang) > -0.2) dot(out, px, y + Math.sin(ang * 2) * r * 0.4, dark(c, 0.45))
  }
}

// A lumpy bomb of sludge builds at the mouth and is hurled spinning at the target,
// where it blows up in a flash, a shock ring and gobs of muck flung everywhere under smoke
function sludgebomb(out, t, a, g, c) {
  const side = g.side
  if (t >= 2 && t < BOMB_LOB - 1) {
    out.dx = -side
    out.sy = 1.05
    out.skew = lean(g, -side * 2)
  } else if (t >= BOMB_LOB - 1 && t < BOMB_LOB + 2) {
    out.dx = side * 2
    out.sy = 0.94
    out.skew = lean(g, side * 3)
  }
  const from = pt(g.mouth.x + shiftAt(out, g.mouth.y) + side * 3, g.mouth.y)
  const hit = pt(g.target.x, g.target.y - 1)
  const r = clamp((g.bottom - g.top) * 0.15, 2, 3.2)
  if (t >= 2 && t < BOMB_LOB) bomb(out, from.x, from.y, r * phase(t, 1, BOMB_LOB - 2) + 0.5, t * 0.6, c)
  if (t >= BOMB_LOB && t < BOMB_HIT) {
    const f = phase(t, BOMB_LOB, BOMB_HIT)
    const p = bend(from, pt((from.x + hit.x) / 2, Math.min(from.y, hit.y) - 5), hit, f)
    bomb(out, p.x, p.y, r, t * 0.9 * side, c)
    for (let k = 1; k <= 3; k++) {
      const q = bend(from, pt((from.x + hit.x) / 2, Math.min(from.y, hit.y) - 5), hit, Math.max(0, f - k * 0.07))
      dot(out, q.x, q.y + (k % 2), k < 2 ? c : dark(c, 0.35))
    }
  }
  const boom = t - BOMB_HIT
  if (boom === 0) disc(out, hit.x, hit.y, 5, WHITE)
  if (boom === 1) disc(out, hit.x, hit.y, 4, light(c, 0.5))
  if (boom >= 1 && boom < 7) {
    ring(out, hit.x, hit.y, 2 + boom * 1.8, boom < 3 ? light(c, 0.4) : c)
    ring(out, hit.x, hit.y, 1 + boom * 1.8, dark(c, 0.4))
  }
  const shakes = [[2, 1], [-2, -1], [1, 1], [-1, 0]]
  if (boom >= 0 && boom < shakes.length) out.shake = [shakes[boom][0] * side, shakes[boom][1]]
  emit(boom, { count: 10, gap: 0, life: 14 }, (i, life) => {
    const ang = -Math.PI / 2 + (rnd(a.seed, i) - 0.5) * 4
    const speed = 1 + rnd(a.seed, i, 1) * 0.9
    const x = hit.x + Math.cos(ang) * speed * life
    const y = hit.y + Math.sin(ang) * speed * life + 0.13 * life * life
    if (y >= g.ground) return
    blob(out, x, y, 0.8, 0.2, c)
  })
  // Smoke rolls up off the blast
  emit(boom, { count: 5, gap: 1.5, start: 1, life: 14 }, (i, life, f) => {
    if (f > 0.8 && t % 2) return
    const x = hit.x + (rnd(a.seed, i, 8) - 0.5) * 9 + Math.sin(life * 0.4 + i)
    const y = hit.y - 1 - life * (0.6 + rnd(a.seed, i, 9) * 0.5)
    if (y > 1) puff(out, x, y, 1.5 + f * 2, mix(c, 0x6a6470, 0.55 + f * 0.2), a.seed + i)
  })
  // Gobs that landed lie on the ground and seep away
  if (boom >= 8) {
    for (let k = 0; k < 4; k++) {
      if (rnd(a.seed, k, 6) < phase(t, a.ticks - 8, a.ticks)) continue
      const x = hit.x + Math.round((rnd(a.seed, k, 5) - 0.5) * 14)
      dot(out, x, g.ground, dark(c, 0.4))
      dot(out, x + 1, g.ground, c)
      dot(out, x, g.ground - 1, light(c, 0.2))
    }
  }
}

const SPRAY_START = 7
const SPRAY_STOP = 18

// The cheeks puff up, then a fine mist of acid sprays out in a cone and soaks the
// target, which hisses with steam as the acid eats in and drips down it
function acidspray(out, t, a, g, c) {
  const side = g.side
  const spraying = t >= SPRAY_START && t < SPRAY_STOP
  if (t >= 1 && t < SPRAY_START) {
    out.sx = 1 + 0.07 * phase(t, 1, SPRAY_START)
    out.dx = -side
  } else if (spraying) {
    out.dx = t % 2 ? 0 : side
    out.skew = lean(g, side * 1.5)
  }
  const from = pt(g.mouth.x + shiftAt(out, g.mouth.y) + side, g.mouth.y)
  const to = g.target
  // A cone of fine droplets, each flying fast and spreading
  emit(t, { count: 44, gap: 0.25, start: SPRAY_START, life: 5 }, (i, age, f) => {
    const spread = (rnd(a.seed, i) - 0.5) * 9
    const x = lerp(from.x, to.x + side * rnd(a.seed, i, 1) * 3, f)
    const y = lerp(from.y, to.y + spread, f)
    dot(out, x, y, i % 3 ? c : light(c, 0.55))
    if (f < 0.6 && i % 2) dot(out, x - side, y, dark(c, 0.2))
  })
  if (spraying) plus(out, from.x + side, from.y, c, light(c, 0.6))

  // The soaked target fizzes and steams, and acid runs down it in streaks
  if (t >= SPRAY_START + 4 && t < a.ticks - 3) {
    for (let k = 0; k < 4; k++) {
      const x = to.x + Math.round((rnd(a.seed, k + 10, t >> 1) - 0.5) * 8)
      const y = to.y + Math.round((rnd(a.seed, k + 20, t >> 1) - 0.5) * 8)
      dot(out, x, y, (t + k) % 2 ? WHITE : light(c, 0.5))
    }
  }
  emit(t, { count: 6, gap: 2, start: SPRAY_START + 5, life: 12 }, (i, age) => {
    const x = to.x + (i - 2.5) * 2
    const y0 = to.y - 3 + (i % 3)
    const len = Math.min(6, age * 0.7)
    for (let d = 0; d <= len; d++) dot(out, x, y0 + d, d >= len - 1 ? light(c, 0.3) : dark(c, 0.15))
  })
  emit(t, { count: 8, gap: 2, start: SPRAY_START + 4, life: 10 }, (i, age) => fume(out, to.x + (rnd(a.seed, i, 3) - 0.5) * 8, to.y - 3, age, c, i))
  if (t >= SPRAY_START + 3 && t < SPRAY_STOP && t % 3 === 0) out.shake = [side, 0]
}

const SMOG_FIRE = 8
const SMOG_HIT = 17
const SMOG_LIFT = 24

// A tight ball of churning smog, a cloud with a swirl turning inside it
function smogBall(out, x, y, r, spin, tones, seed) {
  cloud(out, x, y, r, tones, 1, seed)
  for (let k = 0; k < 6; k++) {
    const ang = spin + k * 0.7
    const d = r * (0.25 + k * 0.1)
    dot(out, x + Math.cos(ang) * d, y + Math.sin(ang) * d, k < 3 ? tones[3] : tones[0])
  }
}

// Breathe in and fire a churning ball of white smog that wraps the target, whirls round
// it, then lifts away all at once, leaving it clean and twinkling
function clearsmog(out, t, a, g, c) {
  const side = g.side
  const tones = [light(c, 0.6), c, mix(c, 0x8a80a0, 0.5), mix(c, 0x4a4060, 0.7)]
  if (t >= 1 && t < SMOG_FIRE) {
    const f = easeOut(phase(t, 1, SMOG_FIRE - 1))
    out.sy = 1 + 0.06 * f
    out.sx = 1 + 0.04 * f
    out.dx = -side
  } else if (t >= SMOG_FIRE && t < SMOG_FIRE + 3) {
    out.dx = side
    out.sx = 0.95
    out.skew = lean(g, side * 2)
  }
  const from = pt(g.mouth.x + side * 3, g.mouth.y)
  const to = pt(g.target.x, g.target.y - 1)
  // Wisps sucked in toward the mouth as it breathes in
  emit(t, { count: 6, gap: 1, start: 1, life: 5 }, (i, age, f) => {
    const ang = (i / 6) * TAU
    const d = (1 - f) * 7 + 1
    dot(out, from.x + Math.cos(ang) * d, from.y + Math.sin(ang) * d * 0.7, tones[2])
  })
  if (t >= SMOG_FIRE && t < SMOG_HIT) {
    const f = phase(t, SMOG_FIRE, SMOG_HIT)
    const x = lerp(from.x, to.x, easeOut(f))
    const y = lerp(from.y, to.y, f) + Math.sin(f * TAU) * 1.5
    smogBall(out, x, y, 2.5 + f, t * 0.8 * side, tones, a.seed)
    for (let k = 1; k <= 3; k++) dot(out, x - side * (3 + k * 1.5), y + ((k + t) % 3) - 1, tones[k < 2 ? 1 : 2])
  }
  // The smog splits into puffs that whirl round the target, then shoot up and vanish
  const wrap = t - SMOG_HIT
  if (wrap >= 0) {
    const lift = easeIn(phase(t, SMOG_LIFT, SMOG_LIFT + 6))
    for (let k = 0; k < 5; k++) {
      const ang = wrap * 0.7 + (k * TAU) / 5
      const r = lerp(1, 5, easeOut(phase(wrap, 0, 3)))
      const x = to.x + Math.cos(ang) * r * (1 - lift * 0.5)
      const y = to.y + Math.sin(ang) * r * 0.6 - lift * 14
      if (y < -2 || lift >= 1) continue
      const density = 1 - lift * 0.7
      cloud(out, x, y, 2.4 - lift, tones, density, a.seed + k, Math.sin(ang) < 0 && lift === 0 ? back : dot)
    }
    if (wrap === 0) out.shake = [side, 0]
    if (lift > 0 && lift < 1) for (let k = -1; k <= 1; k++) line(out, to.x + k * 3, to.y + 2 - lift * 6, to.x + k * 3, to.y - 2 - lift * 10, tones[k ? 2 : 1])
  }
  if (t >= SMOG_LIFT + 4 && t < a.ticks - 1) sparkles(out, t, a.seed, to.x, to.y, 10, 8, tones[2], 5)
}

const COIL_WRAP = 16
const COIL_SQUEEZE = 24
const COIL_ARROWS = 27

// An arrow pointing up: w lit edge, a color, d dark edge
const ARROW = ['...w...', '..waa..', '.waaad.', 'waaaaad', '..wad..', '..wad..', '..wad..']

// Coils of light spiral up the body, cinch in tight as the mon squeezes, flash, and
// three arrows rise beside it as the coils unwind
function coil(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const wind = phase(t, 1, COIL_WRAP)
  const squeeze = easeInOut(phase(t, COIL_WRAP, COIL_SQUEEZE)) * (1 - easeIn(phase(t, COIL_ARROWS + 6, COIL_ARROWS + 12)))
  if (t >= 2 && t < COIL_SQUEEZE) out.skew = (y) => Math.sin(y * 0.45 + t * 0.7) * (1.2 - squeeze)
  out.sx = 1 - 0.08 * squeeze
  out.sy = 1 + 0.04 * squeeze
  const fade = phase(t, COIL_ARROWS + 2, COIL_ARROWS + 10)
  if (fade < 1) {
    const height = g.bottom - g.top + 2
    const turns = 3
    const rx0 = (g.right - g.left) / 2 + 3
    const rx = lerp(rx0, rx0 - 2, squeeze) * (1 + fade * 0.4)
    const steps = Math.ceil(height * 6)
    for (let k = 0; k <= steps * wind; k++) {
      const u = k / steps
      if (fade > 0 && rnd(a.seed, k, t >> 1) < fade) continue
      const ang = u * turns * TAU + t * 0.3
      const x = g.cx + Math.cos(ang) * rx
      const y = g.bottom - u * height + Math.sin(ang) * 1.2
      if (Math.sin(ang) > 0) {
        dot(out, x, y, Math.cos(ang) > 0.6 ? hi : lit)
        dot(out, x, y + 1, deep)
      } else back(out, x, y, deep)
    }
  }
  if (t === COIL_SQUEEZE || t === COIL_SQUEEZE + 1) out.shade = tint(WHITE, t === COIL_SQUEEZE ? 0.5 : 0.25)
  else if (squeeze > 0) out.shade = tint(c, 0.15 * squeeze)
  for (let k = 0; k < 3; k++) {
    const age = t - COIL_ARROWS - k * 2
    if (age < 0 || age >= 12 || (age > 8 && t % 2)) continue
    const x = [g.left - 6, g.right + 2, g.cx - 3][k]
    const y = [g.cy, g.cy + 2, g.top - 4][k] - age * 0.8
    stamp(out, x, y, ARROW, { w: WHITE, a: c, d: deep })
  }
}

const JAB_WIND = 6
const JAB_HIT = 9
const JAB_PULL = 15

// Draw back with a fist of glowing venom, then thrust a long poison spike straight
// through the target in a splash, and pull back as venom drips off the tip
function poisonjab(out, t, a, g, c) {
  const side = g.side
  const [hi, lit, , deep] = ramp(c)
  if (t >= 1 && t < JAB_WIND) {
    out.dx = -side * Math.round(1 + phase(t, 1, JAB_WIND))
    out.skew = lean(g, -side * 2)
  } else if (t >= JAB_WIND && t < JAB_PULL) {
    out.dx = side * (t < JAB_HIT ? 2 : 3)
    out.skew = lean(g, side * 2)
    out.sx = 1.05
  } else if (t >= JAB_PULL && t < JAB_PULL + 4) out.dx = side
  const y = Math.round(lerp(g.mouth.y, g.bottom, 0.4))
  const fist = (side > 0 ? g.right : g.left) + shiftAt(out, y)
  if (t >= 1 && t < JAB_PULL + 2) {
    disc(out, fist, y, t < JAB_WIND ? 1 + phase(t, 1, JAB_WIND) : 2, t % 2 ? lit : c)
    dot(out, fist, y, WHITE)
  }
  // The spike: a cone from the fist to a white point, out in two ticks
  const thrust = t >= JAB_WIND && t < JAB_PULL ? phase(t, JAB_WIND, JAB_HIT) * (1 - phase(t, JAB_PULL - 3, JAB_PULL)) : 0
  if (thrust > 0) {
    const tip = lerp(fist, g.target.x + side * 2, thrust)
    const len = Math.abs(tip - fist)
    for (let d = 0; d <= len; d++) {
      const x = fist + side * d
      const w = Math.round(2 * (1 - d / Math.max(1, len)))
      for (let k = -w; k <= w; k++) dot(out, x, y + k, Math.abs(k) === w && w > 0 ? deep : d > len - 2 ? WHITE : k < 0 ? hi : lit)
    }
  }
  const hit = t - JAB_HIT
  if (hit >= 0 && hit < 5) {
    burst(out, g.target.x, y, hit < 2 ? 4 + hit : 6 - hit, hit < 1 ? WHITE : c)
    if (hit === 0) out.shake = [side * 2, 0]
    if (hit === 1) out.shake = [-side, 0]
  }
  emit(hit, { count: 6, gap: 0, life: 10 }, (i, life) => {
    const ang = (side > 0 ? 0 : Math.PI) + (rnd(a.seed, i) - 0.5) * 2.2
    const speed = 0.9 + rnd(a.seed, i, 1) * 0.6
    const x = g.target.x + Math.cos(ang) * speed * life
    const yy = y + Math.sin(ang) * speed * life + 0.12 * life * life
    if (yy < g.ground) drop(out, x, yy, c)
  })
  stain(out, t, JAB_HIT + 2, g.target.x, y, c, a.seed)
}

const TAIL_TURN = 4
const TAIL_SWING = 11
const TAIL_HIT = 14
const TAIL_BACK = 22

// Spin around to show the tail as it glows with venom, then whip it over in a big
// glowing arc that smacks down on the target, and turn back
function poisontail(out, t, a, g, c) {
  const side = g.side
  const [hi, lit, , deep] = ramp(c)
  out.flipX = t >= TAIL_TURN && t < TAIL_BACK
  if (t >= TAIL_TURN && t < TAIL_SWING) {
    out.dx = -side
    out.skew = lean(g, -side * 2)
  } else if (t >= TAIL_SWING && t < TAIL_HIT + 3) {
    out.dx = side * 2
    out.skew = lean(g, side * 3)
  }
  if (out.flipX) {
    const glow = 0.3 + 0.15 * Math.sin(t * 1.4)
    const mid = g.cx + out.dx
    out.shade = (x, y, col) => ((x - mid) * side > 0 ? mix(col, lit, glow) : col)
  }
  // The arc the tail sweeps, drawn from up high over the top and down onto the target
  const sweep = t - TAIL_SWING
  if (sweep >= 0 && sweep < 9) {
    const p0 = pt(g.cx + side * 2, g.top - 3)
    const p2 = pt(g.target.x, g.target.y + 1)
    const k = pt(lerp(p0.x, p2.x, 0.7), Math.min(p0.y, p2.y) - 3)
    const head = phase(sweep, -1, 3)
    const tail = phase(sweep, 3, 9)
    for (let u = tail; u <= head; u += 0.03) {
      const p = bend(p0, k, p2, u)
      const fresh = head - u < 0.25
      dot(out, p.x, p.y, fresh ? WHITE : hi)
      dot(out, p.x, p.y + 1, fresh ? lit : c)
      dot(out, p.x, p.y + 2, deep)
    }
  }
  const hit = t - TAIL_HIT
  if (hit >= 0 && hit < 4) {
    burst(out, g.target.x, g.target.y, hit < 2 ? 5 + hit : 7 - hit, hit < 1 ? WHITE : c)
    if (hit === 0) out.shake = [side, 1]
  }
  bubbles(out, t, TAIL_HIT + 2, g.target.x, g.target.y - 1, c, a.seed, 4, 6)
  stain(out, t, TAIL_HIT + 1, g.target.x, g.target.y, c, a.seed)
}

const SPIKES_TOSS = 7
const SPIKES_FLIGHT = 7
const SPIKES = 5
const DUSTY = 0xb8a888
const CALTROP = ['..w..', '..p..', '.pdp.', 'pd.dp']

// Hunch and fling a handful of spiky caltrops that tumble out and stick in the ground
// around the target, where they glint and seep a sickly glow
function toxicspikes(out, t, a, g, c) {
  const side = g.side
  if (t >= 1 && t < SPIKES_TOSS) {
    out.sy = 1 - 0.08 * phase(t, 1, SPIKES_TOSS)
    out.dx = -side
  } else if (t >= SPIKES_TOSS && t < SPIKES_TOSS + 3) {
    out.dy = -2
    out.dx = side
    out.skew = lean(g, side * 2, -2)
  }
  const from = pt(g.mouth.x + side * 2, g.mouth.y - 2)
  const palette = { w: WHITE, p: c, d: dark(c, 0.5) }
  const fade = phase(t, a.ticks - 6, a.ticks)
  for (let i = 0; i < SPIKES; i++) {
    const age = t - SPIKES_TOSS - i * 0.7
    if (age < 0) continue
    const land = pt(g.target.x + (i - 2) * 3.5 + (rnd(a.seed, i) - 0.5) * 2, g.ground - 3)
    if (age < SPIKES_FLIGHT) {
      const f = age / SPIKES_FLIGHT
      const p = bend(from, pt((from.x + land.x) / 2, Math.min(from.y, land.y) - 7 - i), land, f)
      // Tumbling: the caltrop flips upside down every other tick
      const art = Math.floor(age) % 2 ? [...CALTROP].reverse() : CALTROP
      stamp(out, p.x - 2, p.y - 1, art, palette)
      continue
    }
    if (rnd(a.seed, i, 5) < fade) continue
    const stuck = age - SPIKES_FLIGHT
    if (stuck < 2) for (const s of [-1, 1]) dot(out, land.x + s * (2 + stuck), g.ground - 1, DUSTY)
    back(out, land.x - 1, g.ground, dark(c, 0.3))
    back(out, land.x + 1, g.ground, dark(c, 0.3))
    if ((Math.floor(t / 2) + i) % 4 === 0) back(out, land.x, g.ground - 4, light(c, 0.4))
    stamp(out, land.x - 2, land.y, CALTROP, { ...palette, w: (Math.floor(t / 3) + i) % 5 === 0 ? WHITE : light(c, 0.4) })
    if (stuck === 0 && i === SPIKES - 1) out.shake = [0, 1]
  }
  if (t >= SPIKES_TOSS + SPIKES_FLIGHT + 4) bubbles(out, t, SPIKES_TOSS + SPIKES_FLIGHT + 4, g.target.x, g.ground - 4, c, a.seed, 4, 12)
}


const FANG_SNAP = 9
const FANG_GONE = 22
const FANGS = ['kkkkkkkkk', 'kwwwkwwwk', '.kwk.kwk.', '.kwk.kwk.', '.kwk.kwk.', '..k...k..']

// Lunge with the jaws open as two big fangs bite down on the target from above and
// below, venom pulsing in through them and dripping off the tips
function poisonfang(out, t, a, g, c) {
  const side = g.side
  if (t >= 1 && t < FANG_SNAP - 3) {
    out.dx = -side
    out.sy = 1.04
  } else if (t >= FANG_SNAP - 3 && t < FANG_SNAP + 4) {
    out.dx = side * 2
    out.skew = lean(g, side * 2)
  } else if (t >= FANG_SNAP + 4 && t < FANG_SNAP + 8) out.dx = side
  const { x: tx, y: ty } = g.target
  const close = easeIn(phase(t, FANG_SNAP - 4, FANG_SNAP))
  const gap = Math.round(lerp(9, 1, close))
  const palette = { k: dark(c, 0.55), w: WHITE }
  if (t >= FANG_SNAP - 4 && t < FANG_GONE && !(t > FANG_GONE - 3 && t % 2)) {
    if (t >= FANG_SNAP && Math.floor((t - FANG_SNAP) / 2) % 2 === 0) palette.k = c
    stamp(out, tx - 4, ty - gap - FANGS.length, FANGS, palette)
    stamp(out, tx - 4, ty + gap, [...FANGS].reverse(), palette)
  }
  const snap = t - FANG_SNAP
  if (snap === 0) {
    disc(out, tx, ty, 2, WHITE)
    out.shake = [0, 1]
  }
  if (snap === 1) out.shake = [0, -1]
  // Venom pulses inward through the fangs in rings
  for (const at of [3, 7, 11]) {
    const age = snap - at
    if (age >= 0 && age < 3) ring(out, tx, ty, 8 - age * 2, age < 1 ? light(c, 0.3) : c)
  }
  emit(t, { count: 6, gap: 2, start: FANG_SNAP + 2, life: 8 }, (i, age) => {
    const x = tx + [-2, 2, -2, 2, -2, 2][i]
    const y = ty + gap + FANGS.length + 1 + age * age * 0.12
    if (y < g.ground) drop(out, x, y, c)
  })
  stain(out, t, FANG_SNAP + 3, tx, ty, c, a.seed)
}

const VENO_SPIT = 6
const VENO_SPLASH = 14
const VENO_SHOCKS = [20, 26]

// A jagged bolt from x, y out along an angle, kinking as it goes
function bolt(out, x, y, ang, len, seed, i, c, core) {
  let px = x
  let py = y
  for (let k = 0; k < len; k++) {
    const kink = (rnd(seed, i * 16 + k, 3) - 0.5) * 1.6
    const nx = px + Math.cos(ang + kink) * 1.4
    const ny = py + Math.sin(ang + kink) * 1.4
    line(out, px, py, nx, ny, k < 2 ? core : c)
    px = nx
    py = ny
  }
}

// Spit a rippling ribbon of venom that drenches the target, then the poison in it
// jolts with violet shocks that crackle out twice
function venoshock(out, t, a, g, c) {
  const side = g.side
  const [hi, lit, , deep] = ramp(c)
  if (t >= 1 && t < VENO_SPIT) {
    out.dx = -side
    out.skew = lean(g, -side)
  } else if (t >= VENO_SPIT && t < VENO_SPLASH) {
    out.dx = side
    out.dy = t % 2 ? 0 : -1
  }
  const from = pt(g.mouth.x + shiftAt(out, g.mouth.y) + side, g.mouth.y)
  const to = pt(g.target.x, g.target.y - 1)
  if (t >= VENO_SPIT && t < VENO_SPLASH + 2) {
    const head = phase(t, VENO_SPIT, VENO_SPLASH)
    const tail = phase(t, VENO_SPLASH - 2, VENO_SPLASH + 2)
    const len = Math.abs(to.x - from.x)
    for (let d = Math.round(len * tail); d <= len * head; d++) {
      const f = d / Math.max(1, len)
      const x = from.x + side * d
      const y = lerp(from.y, to.y, f) + Math.sin(d * 0.7 - t * 1.5) * 1.5 * Math.sin(Math.PI * f)
      dot(out, x, y - 1, hi)
      dot(out, x, y, lit)
      dot(out, x, y + 1, deep)
    }
  }
  const splash = t - VENO_SPLASH
  if (splash >= 0 && splash < 4) {
    disc(out, to.x, to.y, 2.5 - splash * 0.5, splash ? c : light(c, 0.5))
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * TAU
      dot(out, to.x + Math.cos(ang) * (3 + splash), to.y + Math.sin(ang) * (2 + splash), lit)
    }
    if (splash === 0) out.shake = [side, 0]
  }
  // The drenched target drips and its coat throbs until the shocks hit
  if (splash >= 1 && t < VENO_SHOCKS[1] + 6) {
    for (let k = 0; k < 5; k++) {
      const x = to.x + (k - 2) * 2
      const y = to.y + 1 + ((t + k * 3) % 6)
      dot(out, x, y, (t + k) % 3 ? c : deep)
    }
  }
  const bright = light(c, 0.6)
  VENO_SHOCKS.forEach((at, k) => {
    const age = t - at
    if (age < 0 || age >= 5) return
    if (age < 4) {
      for (let i = 0; i < 6; i++) bolt(out, to.x, to.y, (i / 6) * TAU + k + age * 0.5, [4, 6, 5, 3][age], a.seed + t, i, age < 2 ? c : dark(c, 0.2), age ? bright : WHITE)
    }
    if (age === 0) {
      disc(out, to.x, to.y, 2, WHITE)
      out.shake = [side * (k + 1), k]
    }
    if (age >= 3) ring(out, to.x, to.y, 4 + age, c)
    if (age === 1) out.shake = [-side, 0]
  })
}

const CROSS_LUNGE = 7
const CROSS_CUTS = [9, 11]
const CROSS_GLOW = 13

// One slash of the X: a thick straight stroke with a white core, poison edges and a
// dark rim, drawn out to `head`
function slash(out, x0, y0, x1, y1, head, c, dim) {
  const [hi, , , deep] = ramp(c)
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)))
  for (let k = 0; k <= n * head; k++) {
    const f = k / n
    const x = lerp(x0, x1, f)
    const y = lerp(y0, y1, f)
    const mid = Math.sin(Math.PI * f) > 0.3
    dot(out, x, y, dim ? c : mid ? WHITE : hi)
    dot(out, x + 1, y, dim ? deep : c)
    if (mid) dot(out, x - 1, y, dim ? deep : hi)
    dot(out, x, y + 1, deep)
  }
}

// Cross the arms and crouch, then lunge in and carve an X of two poison slashes that
// glows, flashes a critical sparkle, and bleeds venom from its four points
function crosspoison(out, t, a, g, c) {
  const side = g.side
  if (t >= 1 && t < CROSS_LUNGE) {
    out.sx = 1 - 0.08 * phase(t, 1, CROSS_LUNGE)
    out.sy = 0.95
    out.dx = -side
  } else if (t >= CROSS_LUNGE && t < CROSS_GLOW) {
    out.dx = side * 3
    out.skew = lean(g, side * 2)
  } else if (t >= CROSS_GLOW && t < CROSS_GLOW + 4) out.dx = side
  const { x: tx, y: ty } = g.target
  const r = clamp(Math.round((g.bottom - g.top) * 0.35), 4, 6)
  if (t >= 2 && t < CROSS_LUNGE) {
    const y = g.cy
    const x = (side > 0 ? g.right : g.left) + out.dx
    line(out, x - 2, y - 2, x + 2, y + 2, light(c, 0.3))
    line(out, x - 2, y + 2, x + 2, y - 2, light(c, 0.3))
  }
  const ends = [
    [tx - side * r, ty - r, tx + side * r, ty + r],
    [tx + side * r, ty - r, tx - side * r, ty + r],
  ]
  CROSS_CUTS.forEach((at, k) => {
    const age = t - at
    if (age < 0 || t >= a.ticks - 6) return
    const glow = t >= CROSS_GLOW && Math.floor(t / 2) % 2 === 0
    const [x0, y0, x1, y1] = ends[k]
    slash(out, x0, y0, x1, y1, phase(age, -1, 1), c, t >= CROSS_GLOW + 8 || (t >= CROSS_GLOW && !glow))
    if (age === 0) out.shake = [k ? -side : side, 1]
  })
  const glint = t - CROSS_GLOW
  if (glint >= 0 && glint < 7) spark(out, tx, ty, [2, 4, 3, 4, 2, 1, 1][glint], c)
  emit(t, { count: 8, gap: 1.5, start: CROSS_GLOW + 2, life: 9 }, (i, age) => {
    const [x0, y0, x1, y1] = ends[i % 2]
    const lower = i % 4 < 2
    const x = lower ? x1 : x0
    const y = (lower ? y1 : y0) + 1 + age * age * 0.12
    if (y < g.ground) drop(out, x, y, c)
  })
}

const GUNK_FIRE = 13
const GUNK_STOP = 27
const JUNK = [0x8a8a7a, 0x6a5a40, 0xb0a070]

// The mon squats and swells with a gut full of gunk, then blasts a fat torrent of
// sludge and junk at the target, kicked back hard, and the gunk rains down in gobs
function gunkshot(out, t, a, g, c) {
  const side = g.side
  const [hi, lit, , deep] = ramp(c)
  const firing = t >= GUNK_FIRE && t < GUNK_STOP
  if (t >= 1 && t < GUNK_FIRE) {
    const f = easeOut(phase(t, 1, GUNK_FIRE - 1))
    out.sy = 1 - 0.1 * f
    out.sx = 1 + 0.1 * f
    out.dx = t > 8 ? tremble(t) : 0
    out.shade = tint(dark(c, 0.3), 0.25 * f)
  } else if (firing) {
    out.dx = -side * (t % 2 ? 2 : 3)
    out.skew = lean(g, -side * 2)
    out.sy = 1.04
    out.shake = [t % 2 ? side : -side, t % 4 < 2 ? 0 : 1]
  } else if (t >= GUNK_STOP && t < GUNK_STOP + 4) out.dx = -side
  const from = pt(g.mouth.x + shiftAt(out, g.mouth.y) + side, g.mouth.y)
  const to = pt(g.target.x, g.target.y - 1)
  if (t >= 4 && t < GUNK_FIRE) bubbles(out, t, 4, from.x, from.y, c, a.seed, 3, 3)

  // The torrent: a thick, lumpy stream that reaches out fast and tapers off at the end
  if (firing) {
    const head = phase(t, GUNK_FIRE, GUNK_FIRE + 3)
    const thin = phase(t, GUNK_STOP - 4, GUNK_STOP)
    const len = Math.abs(to.x - from.x)
    for (let d = 0; d <= len * head; d++) {
      const f = d / Math.max(1, len)
      const x = from.x + side * d
      const y = lerp(from.y, to.y, f)
      const w = (1.5 + f * 1.5 + Math.sin(d * 0.9 - t * 2) * 0.7) * (1 - thin * 0.7)
      for (let k = -Math.ceil(w); k <= Math.ceil(w); k++) {
        const edge = Math.abs(k) >= w - 0.5
        dot(out, x, y + k, edge ? deep : k < 0 ? hi : (d + k + t) % 7 === 0 ? lit : c)
      }
    }
    // Chunks of junk carried along in the stream
    for (let k = 0; k < 4; k++) {
      const f = ((t - GUNK_FIRE) * 0.18 + k * 0.27) % 1
      if (f > head) continue
      const x = lerp(from.x, to.x, f)
      const y = lerp(from.y, to.y, f) + ((k % 3) - 1)
      dot(out, x, y, JUNK[k % 3])
      dot(out, x + 1, y, dark(JUNK[k % 3], 0.3))
    }
    const hitAge = t - GUNK_FIRE - 3
    if (hitAge >= 0 && hitAge % 3 === 0) burst(out, to.x, to.y, 4 + (hitAge % 2), light(c, 0.4))
  }
  // Gobs splatter out from the target and rain down
  emit(t, { count: 18, gap: 0.8, start: GUNK_FIRE + 3, life: 14 }, (i, life) => {
    const ang = -Math.PI / 2 + (rnd(a.seed, i) - 0.5) * 3.4
    const speed = 0.9 + rnd(a.seed, i, 1) * 0.9
    const x = to.x + Math.cos(ang) * speed * life
    const y = to.y + Math.sin(ang) * speed * life + 0.14 * life * life
    if (y >= g.ground - 1) return
    if (i % 4 === 3) chunk(out, x, y, JUNK[i % 3])
    else blob(out, x, y, 0.7, 0.2, c)
  })
  // A lumpy heap of gunk builds up under the target
  const heap = easeOut(phase(t, GUNK_FIRE + 5, GUNK_STOP + 4)) * (1 - phase(t, a.ticks - 6, a.ticks))
  if (heap > 0) {
    const half = Math.round(7 * heap)
    for (let d = -half; d <= half; d++) {
      const h = Math.round((1 - (d / Math.max(1, half)) ** 2) * 3 * heap + rnd(a.seed, d + 30, 2) * 1.2)
      for (let k = 0; k <= h; k++) dot(out, to.x + d, g.ground - k, k === h ? lit : k === 0 ? deep : c)
      if ((d + 30) % 5 === 0 && h > 1) dot(out, to.x + d, g.ground - h + 1, JUNK[(d + 30) % 3])
    }
  }
}

export const POISON = {
  poisonsting: { ticks: 32, color: 0xb45ad8, draw: poisonsting },
  twineedle: { ticks: 36, color: 0xb45ad8, draw: twineedle },
  acid: { ticks: 44, color: 0xa8e04a, draw: acid },
  sludge: { ticks: 44, color: 0xa040c0, draw: sludge },
  gas: { ticks: 50, color: 0x9a6ac8, draw: gas },
  pinmissile: { ticks: 40, color: 0xc8e05a, draw: pinmissile },
  spikecannon: { ticks: 40, color: 0xc8c8d8, draw: spikecannon },
  toxic: { ticks: 48, color: 0x9a3ac8, draw: toxic },
  gastroacid: { ticks: 44, color: 0xc0d040, draw: gastroacid },
  sludgebomb: { ticks: 46, color: 0xa040c0, draw: sludgebomb },
  acidspray: { ticks: 36, color: 0xd8e840, draw: acidspray },
  clearsmog: { ticks: 42, color: 0xe0d8f0, draw: clearsmog },
  coil: { ticks: 44, color: 0xc890ff, pose: { view: 'front' }, draw: coil },
  poisonjab: { ticks: 32, color: 0xb04ad8, draw: poisonjab },
  poisontail: { ticks: 36, color: 0xb45ad8, draw: poisontail },
  toxicspikes: { ticks: 42, color: 0xa040c0, draw: toxicspikes },
  poisonfang: { ticks: 32, color: 0xb04ad8, draw: poisonfang },
  venoshock: { ticks: 40, color: 0x9a50d8, draw: venoshock },
  crosspoison: { ticks: 38, color: 0xb45ad8, draw: crosspoison },
  gunkshot: { ticks: 52, color: 0x8a5aa0, draw: gunkshot },
}
