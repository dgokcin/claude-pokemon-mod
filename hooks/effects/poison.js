// Poison moves

import {
  WHITE, back, ball, burst, dark, disc, dot, easeOut, emit, lerp, light, mix, phase, plus, puff,
  ramp, rnd, spark, stamp, tint, tremble,
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

export const POISON = {
  poisonsting: { ticks: 32, color: 0xb45ad8, draw: poisonsting },
  twineedle: { ticks: 36, color: 0xb45ad8, draw: twineedle },
  acid: { ticks: 44, color: 0xa8e04a, draw: acid },
  sludge: { ticks: 44, color: 0xa040c0, draw: sludge },
  gas: { ticks: 50, color: 0x9a6ac8, draw: gas },
  pinmissile: { ticks: 40, color: 0xc8e05a, draw: pinmissile },
  spikecannon: { ticks: 40, color: 0xc8c8d8, draw: spikecannon },
}
