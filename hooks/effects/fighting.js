// Fighting moves: stances, blows, and throws

import {
  WHITE, back, ball, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, keys, lerp, light, line, linear,
  mix, phase, puff, ramp, rimGlow, rnd, spark, stamp, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const DUST = 0xd8c8a6
const HURT = 0xff3a2a
const GRAY = 0x7a7680
const DROP = 0x5a7aff

// Pixel art drawn facing right: k outline, h white, l light, o base, w cuff
const FIST = ['.kkkk..', 'khhllkk', 'klllllk', 'kklllok', 'kwkoook', '.kkkkk.']
const BIG_FIST = [
  '.kkkkkkk.',
  'khhlllllk',
  'khlklklok',
  'kllklkook',
  'klllllook',
  'kwwwwwwwk',
  '.kkkkkkk.',
]
const tones = (c) => ({ k: dark(c, 0.7), h: WHITE, l: light(c, 0.5), o: c, w: dark(c, 0.3) })
const solid = (c) => ({ k: c, h: c, l: c, o: c, w: c })

// The sprite's leading column on row y at its base spot
const edgeAt = (g, y) => g.frontAt(clamp(Math.round(y), g.top, g.bottom)) - g.side

// How far a dash carries the mon so its front stops `gap` short of the target
const dashFar = (g, y, gap, most) => clamp(Math.abs(g.target.x - edgeAt(g, y)) - gap, 0, most)

const width = (g) => g.right - g.left + 1
const height = (g) => g.bottom - g.top + 1

// A lean that slides the top of the body px pixels toward the target, feet planted
function tilt(g, dy, px) {
  if (Math.abs(px) < 0.25) return null
  const feet = g.bottom + dy
  return (y) => (g.side * px * (feet - y)) / Math.max(1, g.bottom - g.top)
}

// Pixel art facing the target, its front edge at column fx and its middle on row y
function art(out, rows, pal, fx, y, side, paint = dot) {
  const w = rows[0].length
  stamp(out, side > 0 ? fx - w + 1 : fx, Math.round(y - (rows.length - 1) / 2), rows, pal, side < 0, paint)
}

// An ellipse outline; `skip` thins it into dashes
function oval(out, x, y, rx, ry, c, paint = dot, skip = 0) {
  const steps = Math.max(8, Math.ceil(Math.max(rx, ry) * 7))
  for (let k = 0; k < steps; k++) {
    if (skip && k % skip === 0) continue
    const ang = (k / steps) * TAU
    paint(out, x + rx * Math.cos(ang), y + ry * Math.sin(ang), c)
  }
}

// A two pixel shock ring, white inside while fresh, flattened by `flat`
function shock(out, x, y, r, flat, c, f, paint = dot) {
  oval(out, x, y, r, r * flat, f < 0.5 ? c : dark(c, 0.35), paint)
  if (r > 1.5) oval(out, x, y, r - 1, (r - 1) * flat, f < 0.4 ? WHITE : light(c, 0.4), paint)
}

// A spiky impact star with a white heart and a dark rim
function star(out, x, y, r, c, { points = 8, inner = 0.45, flat = 1, turn = 0, paint = dot } = {}) {
  const lit = light(c, 0.5)
  const rim = dark(c, 0.5)
  for (let py = Math.floor(y - (r + 1) * flat); py <= Math.ceil(y + (r + 1) * flat); py++) {
    for (let px = Math.floor(x - r - 1); px <= Math.ceil(x + r + 1); px++) {
      const ux = px - x
      const uy = (py - y) / flat
      const d = Math.hypot(ux, uy)
      const s = ((((Math.atan2(uy, ux) / TAU) * points + turn) % 1) + 1) % 1
      const edge = r * lerp(inner, 1, Math.abs(s - 0.5) * 2)
      if (d > edge + 0.75) continue
      paint(out, px, py, d > edge ? rim : d < edge * 0.4 ? WHITE : d < edge * 0.7 ? lit : c)
    }
  }
}

// Straight rays out of a point, from r0 to r1, `n` of them spread around `angle`
function rays(out, x, y, r0, r1, n, angle, spread, c, core = WHITE) {
  for (let k = 0; k < n; k++) {
    const ang = angle + (n > 1 ? (k / (n - 1) - 0.5) * 2 * spread : 0)
    const cx = Math.cos(ang)
    const sy = Math.sin(ang)
    for (let d = r0; d <= r1; d++) dot(out, x + cx * d, y + sy * d, d < r0 + (r1 - r0) * 0.4 ? core : c)
  }
}

// Bits knocked loose at t0 that fly out and fall to the ground
function debris(out, t, a, g, t0, x, y, count, c, power = 1, salt = 0) {
  emit(t, { count, start: t0, life: 14 }, (i, age, f) => {
    const vx = ((rnd(a.seed, i, salt) - 0.5) * 2 + g.side * 0.6) * power
    const vy = -(0.6 + rnd(a.seed, i, salt + 1) * 1.2) * power
    const px = x + vx * age
    const py = Math.min(g.ground, y + vy * age + 0.16 * age * age)
    const col = f > 0.7 ? dark(c, 0.45) : i % 3 ? c : light(c, 0.45)
    dot(out, px, py, col)
    if (i % 2) dot(out, px + 1, py, dark(col, 0.3))
  })
}

// Dust rolling out along the ground from x, to one side or both when dir is 0
function dust(out, t, a, t0, x, y, count, dir, salt = 0) {
  emit(t, { count, start: t0, gap: 0.6, life: 10 }, (i, age, f) => {
    const s = dir || (i % 2 ? 1 : -1)
    const px = x + s * (1 + age * (0.4 + rnd(a.seed, i, salt) * 0.5))
    const py = y - age * 0.15 - rnd(a.seed, i, salt + 1) * 1.5
    puff(out, px, py, 0.6 + 1.5 * Math.sin(Math.PI * f), mix(DUST, 0x8a7c66, f), a.seed + i + salt)
  })
}

// A thick motion trail along path(f) from f0 to f1, dark rimmed and white at its head
function trail(out, path, f0, f1, c, thick, paint = dot) {
  const n = 28
  for (let k = 0; k <= n; k++) {
    const u = k / n
    const [x, y] = path(lerp(f0, f1, u))
    const r = thick * (0.25 + 0.75 * u) * 0.5
    disc(out, x, y, r + 0.6, dark(c, 0.45), paint)
  }
  for (let k = 0; k <= n; k++) {
    const u = k / n
    const [x, y] = path(lerp(f0, f1, u))
    const r = thick * (0.25 + 0.75 * u) * 0.5
    disc(out, x, y, r, u > 0.8 ? WHITE : u > 0.45 ? light(c, 0.5) : c, paint)
  }
}

// A downward chevron, for a stat falling
function chevron(out, x, y, s, c) {
  for (let d = 0; d <= s; d++) {
    dot(out, x - s + d, y + d, c)
    dot(out, x + s - d, y + d, c)
    dot(out, x - s + d, y + d - 1, dark(c, 0.4))
    dot(out, x + s - d, y + d - 1, dark(c, 0.4))
  }
}

// A drop of sweat flicked off at t0 from x, y toward dir, arcing down
function sweat(out, t, t0, x, y, dir) {
  const age = t - t0
  if (age < 0 || age >= 8) return
  const px = x + dir * age * 0.8
  const py = y - age * 0.9 + age * age * 0.14
  dot(out, px, py, WHITE)
  dot(out, px, py + 1, 0x7ac8ff)
  dot(out, px - dir, py + 1, 0x3a7ac8)
}

const DETECT_SEE = 9

// Crouch and go still while a ring of sense closes in on the head, flash a glint of
// foresight, then sidestep one way and the other, afterimages lingering behind
function detect(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const hx = g.cx
  const hy = g.top + Math.round(height(g) * 0.3)
  const w = width(g)
  const tense = easeOut(phase(t, 0, DETECT_SEE)) * (1 - phase(t, 27, 33))
  out.sy = 1 - 0.06 * tense
  out.sx = 1 + 0.03 * tense
  if (t < DETECT_SEE) out.shade = tint(deep, 0.3 * tense)

  if (t >= 1 && t < DETECT_SEE) {
    const f = phase(t, 1, DETECT_SEE)
    const r = lerp(w * 0.8 + 8, 2, easeIn(f))
    oval(out, hx, hy, r, r * 0.55, f > 0.6 ? hi : c, f < 0.5 ? back : dot, 3)
    if (r > 4) oval(out, hx, hy, r + 1.5, (r + 1.5) * 0.55, deep, back, 2)
  }
  const see = t - DETECT_SEE
  if (see === 0) out.shade = tint(WHITE, 0.65)
  if (see === 1) out.shade = tint(hi, 0.3)
  if (see >= 0 && see < 6) {
    spark(out, hx, hy, [2, 5, 4, 3, 2, 1][see], c)
    if (see < 3) {
      dot(out, hx - 2, hy - 2, WHITE)
      dot(out, hx + 2, hy + 2, WHITE)
    }
  }

  const step = clamp(Math.round(w * 0.35), 2, 5)
  const pos = (k) => Math.round(keys(k, [[DETECT_SEE + 2, 0], [13, -step, easeOut], [16, -step], [19, step], [22, step], [26, 0]]))
  out.dx = pos(t)
  if (t >= 12 && t < 26) {
    out.ghosts = [2, 4]
      .map((k) => pos(t - k))
      .filter((x) => x !== out.dx)
      .map((x, i) => ghost(x, 0, i ? lit : hi, 0.5 + i * 0.2))
  }
  // A dashed outline of the body keeps watch while it dodges
  if (t >= DETECT_SEE + 1 && t < 30 && (t < 26 || t % 2)) {
    const rx = w / 2 + 2
    const ry = height(g) / 2 + 1
    oval(out, g.cx + out.dx, g.cy, rx, ry, (t >> 1) % 2 ? c : lit, back, 2 + ((t >> 1) % 2))
  }
}

const REV_RISE = 14
const REV_HIT = 19

// Kneel, flickering red like a last stand while power wells up out of the ground, then
// spring up in a flash, dash in, and land a blow that erupts upward in a fountain
function reversal(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const hy = Math.round(lerp(g.cy, g.target.y, 0.5))
  const far = dashFar(g, hy, 2, 12)
  const hx = edgeAt(g, hy) + g.side * (far + 1)
  const pos = (k) => Math.round(keys(k, [[0, 0], [REV_RISE, 0], [REV_HIT, far, easeIn], [REV_HIT + 4, far], [REV_HIT + 16, 0]]))
  out.dx = g.side * pos(t)
  if (t < REV_RISE) {
    const f = easeOut(phase(t, 0, 5))
    out.sy = 1 - 0.14 * f
    out.sx = 1 + 0.07 * f
    if (t >= 4) out.dx += tremble(t, 2)
    const beat = t >= 3 && t % (t < 9 ? 4 : 2) === 0
    out.shade = tint(HURT, beat ? 0.45 : 0.12 * f)
  } else if (t < REV_HIT) {
    out.sy = 1.1
    out.sx = 0.94
    if (t > REV_RISE) out.ghosts = [ghost(g.side * pos(t - 2), 0, c, 0.5)]
  } else if (t < REV_HIT + 3) {
    out.sx = [0.86, 0.92, 0.97][t - REV_HIT]
    out.sy = [1.08, 1.04, 1.02][t - REV_HIT]
  }
  if (t === REV_RISE) out.shade = tint(WHITE, 0.6)
  out.skew = tilt(g, 0, keys(t, [[0, 0], [REV_RISE, -1], [REV_HIT, 3, easeIn], [REV_HIT + 4, 2], [REV_HIT + 12, 0]]))

  // Power wells up out of the ground into the kneeling body
  emit(t, { count: 14, gap: 0.8, start: 1, life: 6 }, (i, age, f) => {
    const x = lerp(g.left - 2, g.right + 2, rnd(a.seed, i, 1))
    const y = g.ground - easeIn(f) * (g.ground - g.cy)
    dot(out, x, y, f < 0.5 ? c : WHITE)
    dot(out, x, y + 1, f < 0.5 ? deep : hi)
    dot(out, x, y + 2, deep)
  })
  const rise = t - REV_RISE
  if (rise >= 0 && rise < 5) {
    const h = [height(g) + 2, height(g) + 4, height(g), height(g) * 0.6, 3][rise]
    for (const s of [-1, 1]) {
      const px = (s < 0 ? g.left : g.right) + s * 2
      line(out, px, g.ground, px, g.ground - h, rise < 2 ? WHITE : lit)
      line(out, px + s, g.ground, px + s, g.ground - h * 0.7, c)
    }
  }

  const age = t - REV_HIT
  if (age === 0) {
    disc(out, hx, hy, 4, WHITE)
    out.shake = [g.side, -1]
  }
  if (age === 1) out.shake = [0, 1]
  if (age >= 1 && age < 5) star(out, hx, hy, [6, 7, 5, 3][age - 1], c, { points: 6, turn: age * 0.25 })
  if (age >= 1 && age < 10) {
    // Jets of power shoot up out of the hit, fanning out, and spray off at their tips
    const top = Math.max(1, hy - 4 - age * 2.2)
    const fade = age > 6
    for (let k = -2; k <= 2; k++) {
      const x = hx + k * 2 + Math.round(k * age * 0.35)
      const tip = top + Math.abs(k) * 2
      const low = Math.max(tip, hy - 2 - age)
      line(out, x, low, x, tip, fade ? deep : k === 0 ? WHITE : lit)
      line(out, x + 1, low, x + 1, tip + 1, fade ? dark(deep, 0.3) : c)
      if (!fade) {
        dot(out, x - 1, tip - 1, hi)
        dot(out, x + 2, tip - 1, hi)
      }
    }
  }
  debris(out, t, a, g, REV_HIT, hx, hy, 10, c, 1.1)
}

const SUPER_GO = 18
const SUPER_HIT = 21

// Swell up huge and shaking while the ground cracks and stones lift around the feet,
// lunge into a crushing blow, then shrink back drained and gray as the power ebbs
function superpower(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const hy = Math.round(lerp(g.cy, g.target.y, 0.4))
  const far = dashFar(g, hy, 1, 12)
  const hx = edgeAt(g, hy) + g.side * (far + 2)
  const swell = easeInOut(phase(t, 1, SUPER_GO - 2))
  const pos = (k) => Math.round(keys(k, [[0, 0], [SUPER_GO - 2, -1, easeOut], [SUPER_GO, -1], [SUPER_HIT, far, easeIn], [SUPER_HIT + 5, far], [SUPER_HIT + 16, 0]]))
  out.dx = g.side * pos(t)
  const drain = phase(t, SUPER_HIT + 3, SUPER_HIT + 7) * (1 - phase(t, SUPER_HIT + 16, 46))
  if (t < SUPER_HIT) {
    out.sx = 1 + 0.22 * swell
    out.sy = 1 + 0.16 * swell
    if (t >= 5 && t < SUPER_GO) out.dx += tremble(t)
    if (t >= 3) out.shade = tint(c, swell * (t % 3 === 0 ? 0.45 : 0.18))
  } else if (t < SUPER_HIT + 3) {
    out.sx = [1.04, 1.1, 1.08][t - SUPER_HIT]
    out.sy = [1.18, 1.12, 1.06][t - SUPER_HIT]
  } else {
    out.sx = 1 - 0.05 * drain
    out.sy = 1 - 0.1 * drain
    out.shade = (x, y, col) => mix(col, GRAY, 0.5 * drain)
  }
  if (t === SUPER_HIT) out.shade = tint(WHITE, 0.55)
  if (t >= SUPER_HIT && t < SUPER_HIT + 6) out.shake = [[3, 1], [-3, -1], [2, 1], [-2, 0], [1, 1], [0, 0]][t - SUPER_HIT].map((v, k) => (k ? v : v * g.side))
  out.skew = tilt(g, 0, keys(t, [[0, 0], [SUPER_GO, -2], [SUPER_HIT, 3, easeIn], [SUPER_HIT + 5, 2], [SUPER_HIT + 14, 0]]))

  // Cracks run out from the feet as the body swells
  if (t >= 4 && t < SUPER_HIT + 10) {
    const len = (width(g) / 2 + 6) * easeOut(phase(t, 4, SUPER_GO))
    const fade = phase(t, SUPER_HIT, SUPER_HIT + 10)
    for (const s of [-1, 1]) {
      let y = g.ground
      for (let d = 0; d < len; d++) {
        if (rnd(a.seed, d, s + 5) < 0.3) y = clamp(y + (rnd(a.seed, d, s + 9) < 0.5 ? -1 : 1), g.ground - 1, g.ground)
        dot(out, g.cx + s * d, y, fade > 0.5 ? dark(DUST, 0.35) : dark(deep, 0.4))
      }
    }
  }
  // Stones float up around the feet, then drop when the blow lands
  emit(t, { count: 6, gap: 1.5, start: 6, life: SUPER_HIT + 4 }, (i, age) => {
    if (t > SUPER_HIT + 3) return
    const x = Math.round(lerp(g.left - 3, g.right + 3, (i + 0.5) / 6))
    const lift = Math.min(age * 0.5, 2 + rnd(a.seed, i, 3) * 3)
    const drop = Math.max(0, t - SUPER_HIT)
    const y = Math.min(g.ground, g.ground - 1 - lift + Math.sin(t * 0.7 + i) * 0.5 + drop * drop * 0.3)
    dot(out, x, y, light(DUST, 0.2))
    dot(out, x + 1, y, dark(DUST, 0.3))
    dot(out, x, y + 1, dark(DUST, 0.45))
  })

  const age = t - SUPER_HIT
  if (age === 0) disc(out, hx, hy, 7, WHITE)
  if (age >= 1 && age < 6) star(out, hx, hy, [10, 12, 10, 7, 4][age - 1], c, { turn: age % 2 ? 0.5 : 0, inner: 0.4 })
  if (age >= 1 && age < 10) shock(out, hx, hy, 6 + age * 1.6, 0.8, c, age / 10, back)
  if (age >= 4 && age < 12) shock(out, hx, hy, 4 + (age - 4) * 1.6, 0.8, lit, (age - 4) / 8, back)
  debris(out, t, a, g, SUPER_HIT, hx, hy, 14, c, 1.5)
  // Two falling chevrons over the drained body
  if (drain > 0.5 && t < SUPER_HIT + 19) {
    const k = (t - SUPER_HIT) % 6
    const col = mix(hi, DROP, 0.7)
    chevron(out, g.cx + out.dx - 3, g.top - 4 + k * 0.5, 2, col)
    chevron(out, g.cx + out.dx + 3, g.top - 3 + ((k + 3) % 6) * 0.5, 2, col)
  }
}

const COUNTER_IN = 5
const COUNTER_TAKE = 11
const COUNTER_FIRE = 18
const COUNTER_HIT = 21

// Brace behind a guarding arc, catch the foe's blow on it, soak the force into the
// body, then hurl it back twice as big as stacked chevrons that slam into the target
function counter(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const my = g.cy
  const edge = edgeAt(g, my)
  const { x: tx, y: ty } = g.target
  const toward = g.side > 0 ? 0 : Math.PI
  const pos = (k) => Math.round(keys(k, [[0, 0], [COUNTER_IN, -1], [COUNTER_TAKE, -1], [COUNTER_TAKE + 2, -3, easeOut], [COUNTER_FIRE, -2], [COUNTER_FIRE + 2, 2, easeOut], [COUNTER_HIT + 4, 2], [COUNTER_HIT + 12, 0]]))
  out.dx = g.side * pos(t)
  const soak = phase(t, COUNTER_TAKE, COUNTER_FIRE)
  if (t < COUNTER_TAKE) {
    out.sy = 1 - 0.06 * easeOut(phase(t, 0, COUNTER_IN))
    out.sx = 1 + 0.04 * easeOut(phase(t, 0, COUNTER_IN))
  } else if (t < COUNTER_FIRE) {
    out.shade = tint(c, t % 2 ? 0.2 + 0.3 * soak : 0.1 + 0.2 * soak)
    out.dx += t >= COUNTER_TAKE + 3 ? tremble(t) : 0
  }
  if (t === COUNTER_TAKE) {
    out.shade = tint(HURT, 0.5)
    out.shake = [-g.side, 0]
  }
  if (t === COUNTER_FIRE) out.shade = tint(WHITE, 0.5)
  out.skew = tilt(g, 0, keys(t, [[0, 0], [COUNTER_TAKE, 0], [COUNTER_TAKE + 2, -3], [COUNTER_FIRE, -2], [COUNTER_FIRE + 2, 3], [COUNTER_HIT + 4, 1], [COUNTER_HIT + 10, 0]]))

  // The guard arc in front of the body
  const gx = g.cx + out.dx
  const gr = Math.max(width(g), height(g)) * 0.5 + 2
  if (t >= 2 && t < COUNTER_FIRE) {
    const flash = t >= COUNTER_TAKE && t < COUNTER_TAKE + 2
    const pull = easeIn(soak)
    const r = lerp(gr, gr * 0.4, pull)
    for (let k = 0; k < 2; k++) {
      const col = flash ? WHITE : k ? dark(c, 0.3) : t % 4 < 2 ? hi : lit
      for (let s = -1; s <= 1; s += 0.08) {
        const ang = toward + s * 0.9 * (1 - 0.4 * pull)
        dot(out, gx + Math.cos(ang) * (r + k), my + Math.sin(ang) * (r + k) * 0.9, col)
      }
    }
  }
  // The foe's blow streaks in and breaks on the arc
  if (t >= COUNTER_IN && t <= COUNTER_TAKE) {
    const f = easeIn(phase(t, COUNTER_IN, COUNTER_TAKE))
    const sx = lerp(tx, edge + g.side * gr, f)
    const sy = lerp(ty, my, f)
    for (let d = 0; d < 6; d++) {
      dot(out, sx + g.side * d, sy - 1, dark(c, 0.2 + d * 0.08))
      dot(out, sx + g.side * d, sy + 1, dark(c, 0.2 + d * 0.08))
    }
    disc(out, sx, sy, 1.6, dark(c, 0.4))
    disc(out, sx, sy, 1, t % 2 ? WHITE : lit)
  }
  const take = t - COUNTER_TAKE
  if (take >= 0 && take < 4) star(out, edge + g.side * (gr - 1), my, [3, 4, 3, 2][take], deep, { points: 6 })

  // The force goes back out as three chevrons growing as they fly
  if (t >= COUNTER_FIRE && t < COUNTER_HIT + 1) {
    const f = phase(t, COUNTER_FIRE - 1, COUNTER_HIT)
    for (let k = 2; k >= 0; k--) {
      const x = lerp(edge + g.side * 3, tx, Math.max(0, f - k * 0.2))
      const s = 2 + Math.round(f * 3) - k
      for (let d = 0; d <= s; d++) {
        for (const o of [-1, 1]) {
          const col = k === 0 ? WHITE : k === 1 ? hi : c
          dot(out, x - g.side * d, ty + o * d, col)
          dot(out, x - g.side * (d + 1), ty + o * d, dark(c, 0.4))
        }
      }
    }
  }
  const age = t - COUNTER_HIT
  if (age === 0) {
    disc(out, tx, ty, 5, WHITE)
    out.shake = [2 * g.side, 1]
  }
  if (age === 1) out.shake = [-2 * g.side, 0]
  if (age >= 1 && age < 6) {
    star(out, tx, ty, [9, 10, 8, 6, 3][age - 1], c, { turn: 0.25 })
    star(out, tx, ty, [4, 5, 4, 3, 2][age - 1], deep, { points: 4 })
  }
  if (age >= 2 && age < 8) shock(out, tx, ty, 5 + age * 1.1, 0.8, c, age / 8, back)
}

const REVENGE_STRUCK = 3
const REVENGE_GO = 17
const REVENGE_HIT = 21

// Take a hit first and stagger back, fume with steam and stamp the ground, then charge
// in seething red and ram the target with a blow that lands twice as hard
function revenge(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const hy = Math.round(lerp(g.cy, g.target.y, 0.5))
  const far = dashFar(g, hy, 1, 13)
  const hx = edgeAt(g, hy) + g.side * (far + 1)
  const struck = edgeAt(g, g.mouth.y)
  const pos = (k) => Math.round(keys(k, [[0, 0], [REVENGE_STRUCK, 0], [REVENGE_STRUCK + 2, -3, easeOut], [REVENGE_GO, -2], [REVENGE_HIT, far, easeIn], [REVENGE_HIT + 4, far], [REVENGE_HIT + 15, 0]]))
  out.dx = g.side * pos(t)
  const stamps = [9, 13]
  if (t >= REVENGE_STRUCK && t < REVENGE_STRUCK + 4) {
    out.shade = t % 2 ? tint(HURT, 0.55) : tint(WHITE, 0.4)
    out.dy = t === REVENGE_STRUCK + 1 ? -1 : 0
  } else if (t >= REVENGE_STRUCK + 4 && t < REVENGE_GO) {
    out.shade = tint(HURT, t % 4 < 2 ? 0.35 : 0.15)
    for (const s of stamps) if (t === s - 1) out.dy = -2
  } else if (t >= REVENGE_GO && t < REVENGE_HIT) {
    out.shade = tint(HURT, 0.25)
    out.sx = 1.06
    out.ghosts = [ghost(g.side * pos(t - 2), 0, deep, 0.55)]
  } else if (t >= REVENGE_HIT && t < REVENGE_HIT + 3) {
    out.sx = [0.84, 0.92, 0.97][t - REVENGE_HIT]
    out.sy = [1.1, 1.05, 1.02][t - REVENGE_HIT]
  }
  if (t === REVENGE_STRUCK) out.shake = [-g.side, 0]
  for (const s of stamps) if (t === s) out.shake = [0, 1]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [REVENGE_STRUCK, 0], [REVENGE_STRUCK + 2, -3], [REVENGE_GO - 2, -1], [REVENGE_GO, 2], [REVENGE_HIT, 3, easeIn], [REVENGE_HIT + 4, 1], [REVENGE_HIT + 12, 0]]))

  // The foe's blow lands on the face first
  const s0 = t - REVENGE_STRUCK
  if (s0 >= 0 && s0 < 3) star(out, struck + g.side * 1, g.mouth.y, [3, 4, 2][s0], GRAY, { points: 5 })
  // Steam blows off the head in angry puffs
  emit(t, { count: 8, gap: 1.5, start: REVENGE_STRUCK + 4, life: 7 }, (i, age, f) => {
    if (t >= REVENGE_GO + 1) return
    const s = i % 2 ? 1 : -1
    const x = g.cx + out.dx + s * (width(g) * 0.3 + age * 0.7)
    const y = Math.max(2, g.top + 2) - age * 0.6
    if (y > 0) puff(out, x, y, 0.6 + 1.2 * Math.sin(Math.PI * f), mix(0xf4f0f0, 0x9a9098, f), a.seed + i)
  })
  for (const s of stamps) dust(out, t, a, s, g.cx + out.dx, g.ground - 1, 4, 0, s)

  const age = t - REVENGE_HIT
  if (age === 0) {
    disc(out, hx, hy, 5, WHITE)
    out.shake = [2 * g.side, 1]
  }
  if (age === 1) out.shake = [-2 * g.side, -1]
  if (age === 2) out.shake = [g.side, 0]
  if (age >= 1 && age < 6) {
    const r = [8, 10, 9, 6, 3][age - 1]
    star(out, hx, hy, r + 3, dark(c, 0.2), { points: 10, inner: 0.7, turn: age * 0.2, paint: back })
    star(out, hx, hy, r, age < 3 ? hi : c, { points: 5, inner: 0.35, turn: 0.1 })
  }
  debris(out, t, a, g, REVENGE_HIT, hx, hy, 10, lit, 1.2)
}

const CC_IN = 6
const CC_FIRST = 8
const CC_GAP = 3
const CC_HITS = 8
const CC_LAST = CC_FIRST + CC_HITS * CC_GAP + 1

// Rush right up close and let loose a flurry of blows all over the target in a growing
// cloud of dust, finish with one big hit, then hop home sweating with the guard down
function closecombat(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const hy = Math.round(lerp(g.cy, g.target.y, 0.5))
  const far = dashFar(g, hy, 4, 14)
  const { x: tx, y: ty } = g.target
  const pos = (k) => Math.round(keys(k, [[0, 0], [2, -1], [CC_IN, far, easeIn], [CC_LAST + 3, far], [CC_LAST + 15, 0]]))
  out.dx = g.side * pos(t)
  let lean = 0
  for (let k = 0; k < CC_HITS; k++) {
    const h = CC_FIRST + k * CC_GAP
    const age = t - h
    if (age < 0 || age >= 3) continue
    if (age === 0) {
      out.dx += g.side
      out.shake = [k % 2 ? g.side : -g.side, k % 3 === 0 ? 1 : 0]
    }
    lean = k % 2 ? 2 : -1
    out.flipX = k % 4 === 3 && age < 2
    out.dy = k % 3 === 1 && age < 2 ? -1 : 0
    const x = tx + Math.round((rnd(a.seed, k, 3) - 0.5) * 8)
    const y = ty + Math.round((rnd(a.seed, k, 4) - 0.5) * 8)
    if (age === 0) disc(out, x, y, 2.5, WHITE)
    else star(out, x, y, age === 1 ? 5 : 3, k % 2 ? c : hi, { points: 4 + (k % 3), turn: rnd(a.seed, k, 5) })
    rays(out, x, y, 3, 5, 3, g.side > 0 ? Math.PI : 0, 0.7, lit)
  }
  if (t >= CC_LAST - 2 && t < CC_LAST) lean = -2
  if (t >= CC_LAST && t < CC_LAST + 3) lean = 3
  out.skew = tilt(g, out.dy, lean)
  // A dust cloud swells around the target as the blows rain in
  if (t >= CC_FIRST && t < CC_LAST + 10) {
    const grow = phase(t, CC_FIRST, CC_LAST) * (1 - phase(t, CC_LAST + 3, CC_LAST + 10))
    for (let k = 0; k < 6; k++) {
      const x = tx + (k - 2.5) * 2.2 + Math.sin(t * 0.5 + k) * 1.2
      const y = g.ground - 2 - (k % 2) * 2
      puff(out, x, y, 1 + 2 * grow, mix(DUST, 0x8a7c66, k / 6), a.seed + k + (t >> 2), back)
    }
  }
  const age = t - CC_LAST
  if (age === 0) {
    disc(out, tx, ty, 5, WHITE)
    out.shake = [2 * g.side, 1]
  }
  if (age === 1) out.shake = [-g.side, -1]
  if (age >= 1 && age < 6) star(out, tx, ty, [9, 10, 8, 5, 3][age - 1], c, { turn: age * 0.3 })
  if (age >= 2 && age < 9) shock(out, tx, ty, 5 + age * 1.3, 0.75, c, age / 9, back)
  // Sweating, guard down, on the way home
  if (t >= CC_LAST + 4 && t < CC_LAST + 18) {
    out.dy = -Math.round(Math.abs(Math.sin(Math.PI * phase(t, CC_LAST + 4, CC_LAST + 15) * 2)) * 2)
    if (t % 4 < 2) out.shade = tint(DROP, 0.2)
  }
  for (const [k, s] of [[0, -1], [1, 1], [2, -1]]) sweat(out, t, CC_LAST + 5 + k * 3, g.cx + out.dx + s * width(g) * 0.3, g.top + 1, s)
}

const HAMMER_UP = 10
const HAMMER_HIT = 16

// Rear up with a huge fist held high, bring it down in a great arc onto the target,
// shaking the ground, then trudge home slowly, dragging gray afterimages
function hammerarm(out, t, a, g, c) {
  const pal = tones(c)
  const { x: tx, y: ty } = g.target
  const far = clamp(dashFar(g, g.cy, 6, 8), 0, 8)
  const pos = (k) => Math.round(keys(k, [[0, 0], [HAMMER_UP, -1, easeOut], [HAMMER_HIT, far, easeIn], [HAMMER_HIT + 6, far], [44, 0, linear]]))
  out.dx = g.side * pos(t)
  if (t < HAMMER_UP) {
    const f = easeOut(phase(t, 0, HAMMER_UP))
    out.sy = 1 + 0.1 * f
    out.sx = 1 - 0.04 * f
    out.dy = t >= 3 ? -1 : 0
  } else if (t >= HAMMER_HIT && t < HAMMER_HIT + 4) {
    out.sy = [0.84, 0.88, 0.93, 0.97][t - HAMMER_HIT]
    out.sx = [1.1, 1.07, 1.04, 1.02][t - HAMMER_HIT]
  } else if (t >= HAMMER_HIT + 6 && t < 42) {
    // Slowed down: a heavy plod with gray drag behind it
    out.dy = Math.floor(t / 4) % 2 ? 0 : -1
    out.ghosts = [3, 6].map((k, i) => ghost(g.side * pos(t - k), 0, dark(c, 0.3 + 0.2 * i), 0.6))
    if (t < 36) out.shade = (x, y, col) => mix(col, GRAY, 0.25)
  }
  if (t === HAMMER_HIT) out.shade = tint(WHITE, 0.5)
  const age = t - HAMMER_HIT
  if (age >= 0 && age < 5) out.shake = [[0, 2], [0, -2], [1, 1], [-1, 0], [0, 0]][age]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [HAMMER_UP, -3, easeOut], [HAMMER_HIT, 4, easeIn], [HAMMER_HIT + 4, 2], [HAMMER_HIT + 12, 0]]))

  // The fist rides a curve from over the head, up, and down onto the target
  const sx = g.cx + g.side * (width(g) * 0.3)
  const sy = Math.max(4, g.top + 1)
  const cx = lerp(sx, tx, 0.7)
  const cy = Math.max(1, Math.min(sy, ty) - 8)
  const ex = tx
  const ey = Math.min(g.ground - 4, ty - 1)
  const path = (f) => {
    const u = 1 - f
    return [u * u * sx + 2 * u * f * cx + f * f * ex, u * u * sy + 2 * u * f * cy + f * f * ey]
  }
  if (t >= 3 && t < HAMMER_UP) {
    const [x, y] = path(0)
    const big = t >= 6
    art(out, big ? BIG_FIST : FIST, t % 3 === 0 ? solid(light(c, 0.6)) : pal, x + out.dx + g.side * 4, y + out.dy, g.side)
    if (big && t % 2) spark(out, x + out.dx, y - 4, 1, c)
  }
  if (t >= HAMMER_UP && t < HAMMER_HIT + 6) {
    const f = easeIn(phase(t, HAMMER_UP, HAMMER_HIT))
    if (t <= HAMMER_HIT) trail(out, path, Math.max(0, f - 0.6), f, c, 5)
    const [x, y] = path(f)
    const fade = t > HAMMER_HIT + 3 && t % 2
    if (!fade) art(out, BIG_FIST, t === HAMMER_HIT ? solid(WHITE) : pal, x + g.side * 4, y, g.side)
  }
  if (age >= 0 && age < 4) star(out, ex, ey + 3, [7, 9, 8, 5][age], c, { flat: 0.5, turn: age * 0.5 })
  if (age >= 1 && age < 12) {
    shock(out, ex, g.ground - 1, 3 + age * 1.8, 0.22, c, age / 12)
    if (age >= 3) shock(out, ex, g.ground - 1, 2 + (age - 3) * 1.8, 0.22, light(c, 0.3), (age - 3) / 9)
  }
  dust(out, t, a, HAMMER_HIT, ex, g.ground - 1, 8, 0)
  debris(out, t, a, g, HAMMER_HIT, ex, g.ground - 2, 8, DUST, 1.2)
}

const QG_OPEN = 3
const QG_CLOSE = 27
const QG_BARS = 9

// Snap the arms up and flick open a fan of bright guard bars over the body, knock
// away three quick strikes off it, then fold it shut
function quickguard(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const w = width(g)
  const h = height(g)
  const cx = g.cx
  const cy = g.cy + Math.round(h * 0.15)
  const r = Math.max(w, h) * 0.55 + 2
  out.sy = t < QG_OPEN ? 1 - 0.08 * phase(t, 0, QG_OPEN) : t < QG_CLOSE + 4 ? 1.04 : 1
  out.sx = t < QG_OPEN ? 1.05 : 1
  if (t === QG_OPEN) out.shade = tint(hi, 0.4)

  // Each bar flicks open from the top, outward to both sides, and folds back the same way
  for (let k = 0; k < QG_BARS; k++) {
    const order = Math.abs(k - (QG_BARS - 1) / 2)
    const open = t - QG_OPEN - order * 0.7
    const shut = t - QG_CLOSE - (4 - order) * 0.7
    if (open < 0 || shut >= 1) continue
    const ang = Math.PI + (k / (QG_BARS - 1)) * Math.PI
    const len = open < 1 ? 1.5 : shut >= 0 ? 1.5 : 3.5
    const glint = Math.floor((t - QG_OPEN) / 1.5) % (QG_BARS + 4) === k
    const r0 = r - 1
    for (let d = 0; d <= len; d += 0.5) {
      const x = cx + Math.cos(ang) * (r0 + d)
      const y = cy + Math.sin(ang) * (r0 + d) * 0.85
      dot(out, x, y, glint ? WHITE : d < 1 ? hi : d < 2.5 ? c : deep)
    }
    // The rim joins each open bar to the next, like the ribs of a fan
    const step = Math.PI / (QG_BARS - 1)
    for (let u = 0; u < 1; u += 0.12) {
      const b = ang + (k < QG_BARS / 2 ? step : -step) * u
      if (k === (QG_BARS - 1) / 2) break
      dot(out, cx + Math.cos(b) * r0, cy + Math.sin(b) * r0 * 0.85, glint ? WHITE : lit)
      back(out, cx + Math.cos(b) * (r0 - 1), cy + Math.sin(b) * (r0 - 1) * 0.85, deep)
    }
  }
  // Quick strikes zip in from the sides and glance off
  for (const [k, hit] of [[0, 12], [1, 17], [2, 22]]) {
    const s = k % 2 ? 1 : -1
    const ang = Math.PI + (k === 2 ? 0.5 : k ? 0.85 : 0.2) * Math.PI
    const ix = cx + Math.cos(ang) * (r + 2.5)
    const iy = cy + Math.sin(ang) * (r + 2.5) * 0.85
    const age = t - hit
    if (age >= -3 && age < 0) {
      const f = (age + 4) / 4
      const fx = lerp(ix + s * 9, ix, f)
      const fy = lerp(iy - 4, iy, f)
      line(out, fx, fy, fx + s * 2, fy - 1, dark(c, 0.5))
      dot(out, fx, fy, WHITE)
    }
    if (age === 0) out.shake = [-s, 0]
    if (age >= 0 && age < 4) {
      spark(out, ix, iy, [2, 3, 2, 1][age], c)
      dot(out, ix + s * (age + 2), iy - age * 1.5 - 1, lit)
      dot(out, ix + s * (age + 3), iy - age * 1.5 - 2, deep)
    }
  }
}

const PUMPS = [6, 16, 26]

// Flex three times, each pump swelling the body wide with a bright sheen sweeping
// across it and sweat flying, then arrows climb off the shoulders
function bulkup(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const w = width(g)
  let pump = 0
  let sheen = -1
  for (const p of PUMPS) {
    const age = t - p
    if (age >= -2 && age < 0) pump = Math.min(pump, -0.4)
    if (age >= 0 && age < 5) {
      pump = [1, 1, 0.8, 0.5, 0.2][age]
      sheen = age
    }
  }
  out.sx = 1 + 0.14 * Math.max(0, pump) - 0.03 * Math.min(0, pump)
  out.sy = 1 - 0.05 * Math.max(0, pump) + 0.03 * Math.min(0, pump)
  if (sheen >= 0) {
    // A bright band sweeps down the body with each pump
    const band = g.top + (height(g) * sheen) / 4
    out.shade = (x, y, col) => (Math.abs(y - band) < 2 ? mix(col, WHITE, 0.45) : mix(col, c, 0.15))
  }
  for (const p of PUMPS) {
    const age = t - p
    if (age === 0) out.shake = [0, 1]
    if (age >= 0 && age < 4) {
      // Bulges pop out on both flanks
      const off = w * out.sx * 0.5 + 1 + age
      for (const s of [-1, 1]) {
        for (let dy = -2; dy <= 2; dy++) {
          const x = g.cx + s * (off - Math.abs(dy) * 0.5)
          dot(out, x, g.cy + dy, age < 2 ? WHITE : age < 3 ? hi : c)
          dot(out, x + s, g.cy + dy, deep)
        }
      }
    }
    sweat(out, t, p + 1, g.cx - w * 0.35, g.top + 2, -1)
    sweat(out, t, p + 2, g.cx + w * 0.35, g.top + 2, 1)
  }
  // Arrows climb off the shoulders after the last pump
  emit(t, { count: 6, gap: 2, start: PUMPS[2] + 3, life: 9 }, (i, age, f) => {
    const s = i % 2 ? 1 : -1
    const x = g.cx + s * w * 0.35
    const y = g.top + 3 - age * 1.2
    if (y < 1 || (f > 0.7 && t % 2)) return
    for (let d = 0; d <= 2; d++) {
      const col = d === 0 ? WHITE : f < 0.5 ? hi : lit
      dot(out, x - d, y + d, col)
      dot(out, x + d, y + d, col)
      dot(out, x - d, y + d + 1, deep)
      dot(out, x + d, y + d + 1, deep)
    }
  })
}

const FOCUS_GO = 26
const FOCUS_HIT = 29

// Stand dead still, calm rings closing in on a clenched fist as the focus builds, then
// blink across to the target in one straight punch that freezes the moment white and
// blasts a long flat shockwave through it
function focuspunch(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const pal = tones(c)
  const fy = Math.round(lerp(g.cy, g.target.y, 0.4))
  const edge = edgeAt(g, fy)
  const far = dashFar(g, fy, 6, 14)
  const { x: tx } = g.target
  const hx = edge + g.side * (far + 6)
  const pos = (k) => Math.round(keys(k, [[0, 0], [20, 0], [FOCUS_GO, -1, easeOut], [FOCUS_HIT, far, easeIn], [FOCUS_HIT + 8, far], [FOCUS_HIT + 20, 0]]))
  out.dx = g.side * pos(t)
  if (t < FOCUS_GO) {
    const f = easeOut(phase(t, 0, 6))
    out.sy = 1 - 0.05 * f
    out.sx = 1 + 0.03 * f
  } else if (t < FOCUS_HIT) {
    out.sx = 1.08
    out.ghosts = [1, 2].map((k) => ghost(g.side * pos(t - k), 0, lit, 0.4 + 0.2 * k))
  } else if (t < FOCUS_HIT + 3) {
    out.sx = [0.86, 0.92, 0.97][t - FOCUS_HIT]
  }
  if (t >= FOCUS_HIT && t < FOCUS_HIT + 2) out.shade = tint(WHITE, 0.7)
  if (t >= FOCUS_HIT + 2 && t < FOCUS_HIT + 7) out.shake = [[3, 0], [-3, 1], [2, -1], [-1, 0], [1, 0]][t - FOCUS_HIT - 2].map((v, k) => (k ? v : v * g.side))
  out.skew = tilt(g, 0, keys(t, [[0, 0], [20, 0], [FOCUS_GO, -2], [FOCUS_HIT, 3, easeIn], [FOCUS_HIT + 8, 2], [FOCUS_HIT + 16, 0]]))

  // The clenched fist held at the front, steady, then white hot
  const fx = edge + out.dx + g.side * 6
  if (t >= 3 && t < FOCUS_HIT + 6) {
    const hot = t >= 20 && t < FOCUS_HIT && t % 2
    art(out, FIST, t === FOCUS_HIT ? solid(WHITE) : hot ? solid(light(c, 0.7)) : pal, fx, fy, g.side)
  }
  // Calm rings close in on the fist, one after another
  emit(t, { count: 4, gap: 5, start: 1, life: 7 }, (i, age, f) => {
    const r = lerp(14, 2, easeIn(f))
    oval(out, fx - g.side * 3, fy, r, r * 0.7, f < 0.5 ? deep : f < 0.8 ? c : hi, f < 0.6 ? back : dot, 2)
  })
  if (t >= 20 && t < FOCUS_GO) spark(out, fx - g.side * 2, fy - 3, t % 2 ? 2 : 1, c)
  // Streaks behind the blink across
  if (t >= FOCUS_GO && t < FOCUS_HIT + 1) {
    for (const oy of [-4, -1, 2, 5]) {
      const len = 6 + (oy & 3)
      const bx = (g.side > 0 ? g.left : g.right) + out.dx - g.side * 2
      for (let d = 0; d < len; d++) dot(out, bx - g.side * d, g.cy + oy, d < 2 ? WHITE : d < 4 ? lit : c)
    }
  }
  // The time freeze: a long flat shockwave and kiai lines straight through the hit
  const age = t - FOCUS_HIT
  const hy = fy
  if (age >= 0 && age < 2) disc(out, hx, hy, 6, WHITE)
  if (age >= 2 && age < 6) star(out, hx, hy, [10, 9, 7, 4][age - 2], c, { flat: 0.6, points: 6, turn: 0.25 })
  if (age >= 1 && age < 12) {
    shock(out, hx + g.side * age, hy, 4 + age * 2.2, 0.35, c, age / 12)
    if (age >= 3) shock(out, hx + g.side * (age - 1), hy, 3 + (age - 3) * 2.2, 0.35, hi, (age - 3) / 9)
  }
  if (age >= 0 && age < 6) {
    const len = 6 + age * 4
    for (const oy of [-1, 0, 1]) line(out, hx, hy + oy * 3, hx + g.side * len, hy + oy * 4, oy ? lit : WHITE)
    line(out, hx, hy, hx - g.side * (len / 2), hy, lit)
  }
  debris(out, t, a, g, FOCUS_HIT + 1, tx, hy, 10, c, 1.4)
}

const AURA_FIRE = 14
const AURA_HIT = 28

// Lean back with a glowing outline while a sphere of aura condenses in front, motes
// spiralling into it, then loose it on a rising curve that leaves rippling rings and
// bursts in a cascade of rings
function aurasphere(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const ox = g.ahead(3)
  const oy = g.mouth.y + 1
  const charge = phase(t, 1, AURA_FIRE)
  if (t < AURA_FIRE) {
    out.dx = -g.side * Math.round(easeOut(charge))
    out.skew = tilt(g, 0, -1.5 * easeOut(charge))
  } else if (t < AURA_FIRE + 2) {
    out.dx = g.side
    out.skew = tilt(g, 0, 2)
  }
  const glowing = t >= 2 && t < AURA_FIRE + 4
  if (glowing) out.shade = rimGlow(g, out, c, 0.08, t % 4 < 2 ? light(c, 0.25) : c, 0.75)

  const path = (f) => [lerp(ox, tx, f), lerp(oy, ty, f) - Math.sin(Math.PI * f) * Math.min(5, g.reach * 0.25)]
  const pulse = t % 4 < 2 ? 0.5 : 0
  if (t >= 2 && t < AURA_FIRE) {
    const r = lerp(0.8, 3, easeOut(charge))
    oval(out, ox, oy, r + 2 + pulse * 2, r + 2 + pulse * 2, deep, dot, 2)
    ball(out, ox, oy, r, c)
    disc(out, ox - 0.5, oy - 0.5, r * 0.35, WHITE)
  }
  emit(t, { count: 12, gap: 1, start: 0, life: 5 }, (i, age, f) => {
    if (t >= AURA_FIRE) return
    const ang = rnd(a.seed, i, 2) * TAU + f * 2.5
    const d = 9 * (1 - easeIn(f))
    dot(out, ox + Math.cos(ang) * d, oy + Math.sin(ang) * d * 0.8, f < 0.5 ? c : hi)
  })
  if (t >= AURA_FIRE && t < AURA_HIT) {
    const f = easeInOut(phase(t, AURA_FIRE, AURA_HIT))
    const [x, y] = path(f)
    // Rings left behind on the way, swelling and fading
    for (let k = AURA_FIRE + 1; k < t; k += 2) {
      const age = t - k
      if (age > 6) continue
      const [px, py] = path(easeInOut(phase(k, AURA_FIRE, AURA_HIT)))
      oval(out, px, py, 2 + age * 0.7, 3 + age * 0.9, age < 3 ? lit : deep, back, age > 3 ? 2 : 0)
    }
    oval(out, x, y, 4.5, 4.5, t % 2 ? c : deep, dot, 2)
    ball(out, x, y, 3.2, c)
    disc(out, x - 0.5, y - 0.5, 1, WHITE)
  }
  const age = t - AURA_HIT
  if (age === 0) {
    disc(out, tx, ty, 5, WHITE)
    out.shake = [g.side, 1]
  }
  if (age === 1) out.shake = [-g.side, 0]
  if (age >= 1 && age < 4) ball(out, tx, ty, [5, 4, 2.5][age - 1], light(c, 0.3))
  for (let k = 0; k < 3; k++) {
    const ra = age - k * 2
    if (ra >= 0 && ra < 8) shock(out, tx, ty, 3 + ra * 1.2, 0.9, k ? lit : c, ra / 8, k === 1 ? back : dot)
  }
  emit(t, { count: 10, start: AURA_HIT, life: 9 }, (i, life, f) => {
    const ang = (i / 10) * TAU + rnd(a.seed, i, 6) * 0.4
    const d = 3 + life * 1.1
    spark(out, tx + Math.cos(ang) * d, ty + Math.sin(ang) * d * 0.8, f < 0.4 ? 1 : 0, c)
  })
}

const GAMBIT_LAUNCH = 18
const GAMBIT_HIT = 25

// Pour every last bit of life out of the body into a throbbing orb as the mon fades
// and sags, hurl it, and let it go off in a huge blast, then slowly color back in
function finalgambit(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const ox = g.ahead(3)
  const oy = clamp(g.top - 2, 5, g.mouth.y)
  const drain = easeIn(phase(t, 1, GAMBIT_LAUNCH)) * (1 - phase(t, 34, 50))
  out.sy = 1 - 0.1 * drain
  out.sx = 1 + 0.03 * drain
  if (drain > 0) out.shade = (x, y, col) => mix(col, GRAY, 0.6 * drain)
  if (t >= GAMBIT_LAUNCH && t < GAMBIT_LAUNCH + 2) {
    out.dx = g.side
    out.skew = tilt(g, 0, 2)
  }
  if (t >= 36 && t < 50) out.dy = -Math.round(Math.sin(Math.PI * phase(t, 36, 44)) * 1)

  // Life streams out of the body into the orb
  emit(t, { count: 22, gap: 0.7, start: 1, life: 6 }, (i, age, f) => {
    if (t >= GAMBIT_LAUNCH) return
    const sx = lerp(g.left, g.right, rnd(a.seed, i, 1))
    const sy = lerp(g.top, g.bottom, rnd(a.seed, i, 2))
    const e = easeIn(f)
    const x = lerp(sx, ox, e)
    const y = lerp(sy, oy, e) - Math.sin(Math.PI * f) * 2
    dot(out, x, y, f < 0.4 ? lit : hi)
  })
  const beat = t % 6 < 2 ? 1 : 0
  if (t >= 2 && t < GAMBIT_LAUNCH) {
    const r = 0.8 + 3.2 * easeOut(phase(t, 2, GAMBIT_LAUNCH)) + beat
    disc(out, ox, oy, r + 1, deep)
    ball(out, ox, oy, r, c)
    if (beat) oval(out, ox, oy, r + 3, r + 3, lit, dot, 2)
  }
  if (t >= GAMBIT_LAUNCH && t < GAMBIT_HIT) {
    const f = easeIn(phase(t, GAMBIT_LAUNCH, GAMBIT_HIT))
    const x = lerp(ox, tx, f)
    const y = lerp(oy, ty, f)
    trail(out, (u) => [lerp(ox, tx, u), lerp(oy, ty, u)], Math.max(0, f - 0.4), f, c, 5)
    disc(out, x, y, 5, deep)
    ball(out, x, y, 4, c)
  }
  const age = t - GAMBIT_HIT
  if (age >= 0 && age < 2) disc(out, tx, ty, [9, 11][age], WHITE)
  if (age >= 2 && age < 7) star(out, tx, ty, [13, 14, 12, 9, 5][age - 2], c, { points: 12, inner: 0.55, turn: age * 0.2 })
  if (age >= 0 && age < 7) out.shake = [[3, 2], [-3, -1], [3, 1], [-2, -1], [2, 1], [-1, 0], [1, 0]][age]
  if (age >= 2 && age < 12) shock(out, tx, ty, 8 + (age - 2) * 1.2, 0.8, c, (age - 2) / 10, back)
  if (age >= 5 && age < 13) shock(out, tx, ty, 6 + (age - 5) * 1.2, 0.8, lit, (age - 5) / 8, back)
  emit(t, { count: 20, start: GAMBIT_HIT + 1, life: 12 }, (i, life, f) => {
    const ang = rnd(a.seed, i, 7) * TAU
    const d = 4 + life * (1 + rnd(a.seed, i, 8))
    const x = tx + Math.cos(ang) * d
    const y = ty + Math.sin(ang) * d * 0.7 + life * life * 0.03
    dot(out, x, y, f < 0.3 ? WHITE : f < 0.6 ? hi : c)
  })
}

const VITAL_GO = 9
const VITAL_GRAB = 13
const VITAL_LAND = 25

// Hold back and wait for an opening, then dash in, grab, and heave the foe over the
// shoulder in a tall arc that crashes down behind the mon
function vitalthrow(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const hy = Math.round(lerp(g.cy, g.target.y, 0.5))
  const far = dashFar(g, hy, 1, 12)
  const { x: tx, y: ty } = g.target
  const pos = (k) => Math.round(keys(k, [[0, 0], [VITAL_GO, -1], [VITAL_GRAB, far, easeIn], [VITAL_LAND + 3, far], [VITAL_LAND + 18, 0]]))
  out.dx = g.side * pos(t)
  if (t < VITAL_GO) {
    const f = easeOut(phase(t, 0, 5))
    out.sy = 1 - 0.07 * f
    out.sx = 1 + 0.04 * f
  } else if (t < VITAL_GRAB) {
    out.ghosts = [ghost(g.side * pos(t - 2), 0, lit, 0.55)]
  } else if (t < VITAL_LAND) {
    // Turn under the foe and heave it over the back
    out.flipX = t >= VITAL_GRAB + 3 && t < VITAL_LAND - 2
    out.sy = t < VITAL_GRAB + 3 ? 0.88 : 1.06
    out.sx = t < VITAL_GRAB + 3 ? 1.06 : 0.97
  } else if (t < VITAL_LAND + 3) {
    out.sy = 0.9
    out.sx = 1.05
  }
  out.skew = tilt(g, 0, keys(t, [[0, 0], [VITAL_GRAB, 2], [VITAL_GRAB + 3, 3], [VITAL_LAND - 3, -3], [VITAL_LAND, 2], [VITAL_LAND + 8, 0]]))
  if (t >= 3 && t < VITAL_GO && t % 3 === 0) spark(out, edgeAt(g, g.mouth.y) + g.side * 2, g.mouth.y - 2, 1, c)

  // The grip closes in brackets around the foe
  const grip = t - VITAL_GRAB
  if (grip >= 0 && grip < 4) {
    const gap = [6, 4, 3, 3][grip]
    for (const s of [-1, 1]) {
      line(out, tx + s * gap, ty - 3, tx + s * gap, ty + 3, grip < 2 ? WHITE : c)
      line(out, tx + s * gap, ty - 3, tx + s * (gap - 2), ty - 3, c)
      line(out, tx + s * gap, ty + 3, tx + s * (gap - 2), ty + 3, c)
    }
  }
  // Over the shoulder: from the foe, high over the mon, and down behind it
  const behind = clamp(g.cx + g.side * far - g.side * (width(g) / 2 + 4), 2, g.columns - 3)
  const apexX = g.cx + g.side * (far + 2)
  const top = 2
  const path = (f) => {
    const u = 1 - f
    return [u * u * tx + 2 * u * f * apexX + f * f * behind, u * u * ty + 2 * u * f * (top - 6) + f * f * (g.ground - 2)]
  }
  if (t >= VITAL_GRAB + 2 && t <= VITAL_LAND) {
    const f = easeInOut(phase(t, VITAL_GRAB + 2, VITAL_LAND))
    trail(out, (u) => { const [x, y] = path(u); return [x, Math.max(1, y)] }, Math.max(0, f - 0.45), f, c, 5)
  }
  const age = t - VITAL_LAND
  if (age >= 0 && age < 4) out.shake = [[0, 2], [0, -2], [1, 1], [0, 0]][age]
  if (age >= 0 && age < 5) star(out, behind, g.ground - 2, [8, 10, 8, 6, 3][age], age ? c : WHITE, { flat: 0.45, turn: age * 0.5 })
  if (age >= 1 && age < 9) shock(out, behind, g.ground - 1, 3 + age * 1.7, 0.25, deep, age / 9)
  dust(out, t, a, VITAL_LAND, behind, g.ground - 1, 8, 0)
  if (age >= 2 && age < 10 && age % 2) spark(out, behind + (age % 4 ? 2 : -2), g.ground - 6 - age * 0.5, 1, hi)
}

const CIRCLE_IN = 7
const CIRCLE_FLING = 24

// Dash in, swing the foe round and round in a wide orbit while spinning on the spot,
// then let go and fling it flat out of the strip, gone with a twinkle
function circlethrow(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const hy = Math.round(lerp(g.cy, g.target.y, 0.5))
  const far = dashFar(g, hy, 2, 12)
  const pos = (k) => Math.round(keys(k, [[0, 0], [2, -1], [CIRCLE_IN, far, easeIn], [CIRCLE_FLING + 4, far], [CIRCLE_FLING + 20, 0]]))
  out.dx = g.side * pos(t)
  const spinning = t >= CIRCLE_IN + 1 && t < CIRCLE_FLING
  if (spinning) {
    out.flipX = Math.floor((t - CIRCLE_IN) / 2) % 2 === 1
    out.sx = Math.floor((t - CIRCLE_IN) / 2) % 2 ? 0.86 : 1
    if (t > CIRCLE_IN + 2) out.ghosts = [ghost(out.dx + (out.flipX ? g.side : -g.side), 0, lit, 0.6)]
  }
  if (t >= CIRCLE_FLING && t < CIRCLE_FLING + 3) out.sx = 1.06
  out.skew = tilt(g, 0, keys(t, [[0, 0], [CIRCLE_IN, 2], [CIRCLE_IN + 2, 0], [CIRCLE_FLING - 1, -2], [CIRCLE_FLING + 1, 3], [CIRCLE_FLING + 8, 0]]))

  // The foe swings round on a flat orbit, behind the body on the far side
  const cx = g.cx + out.dx
  const cy = g.cy
  const rx = width(g) / 2 + 5
  const ry = Math.max(2, height(g) * 0.2)
  const angAt = (k) => -Math.PI / 2 - g.side * Math.PI / 2 + (k - CIRCLE_IN - 1) * 0.75 * g.side
  if (spinning) {
    for (let k = 4; k >= 0; k--) {
      const ang = angAt(t - k * 0.5)
      const x = cx + Math.cos(ang) * rx
      const y = cy + Math.sin(ang) * ry
      const paint = Math.sin(ang) < 0 ? back : dot
      if (k === 0) {
        disc(out, x, y, 3, deep, paint)
        disc(out, x, y, 2.2, c, paint)
        disc(out, x - 0.5, y - 0.5, 1, WHITE, paint)
      } else disc(out, x, y, 2 - k * 0.3, k < 3 ? lit : deep, paint)
    }
    dust(out, t, a, CIRCLE_IN + 1, cx, g.ground - 1, 6, 0)
  }
  // Released, it is flung up and away clean out of the top of the strip
  const start = clamp(cx + g.side * rx, 3, g.columns - 4)
  const away = clamp(start + g.side * 12, 3, g.columns - 4)
  const path = (f) => [lerp(start, away, f), lerp(cy, -4, easeOut(f)) + f * f * 2]
  if (t >= CIRCLE_FLING && t < CIRCLE_FLING + 6) {
    const f = phase(t, CIRCLE_FLING, CIRCLE_FLING + 5)
    trail(out, path, Math.max(0, f - 0.5), f, c, 4)
  }
  if (t === CIRCLE_FLING) out.shake = [g.side, 0]
  const gone = t - CIRCLE_FLING - 5
  if (gone >= 0 && gone < 8) spark(out, path(0.9)[0], 1, [3, 2, 3, 2, 1, 2, 1, 1][gone], gone % 2 ? c : hi)
}

const STORM_IN = 5
const STORM_TOP = 15
const STORM_HIT = 19

// Dart in and hip toss the foe up through a whirling gust that corkscrews skyward,
// then spike it straight down for a sure critical hit, crosshairs flashing
function stormthrow(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const hy = Math.round(lerp(g.cy, g.target.y, 0.5))
  const far = dashFar(g, hy, 7, 13)
  const { x: tx, y: ty } = g.target
  const pos = (k) => Math.round(keys(k, [[0, 0], [STORM_IN, far, easeIn], [STORM_HIT + 4, far], [STORM_HIT + 17, 0]]))
  out.dx = g.side * pos(t)
  if (t >= STORM_IN && t < STORM_TOP) {
    out.flipX = t >= STORM_IN + 2 && t < STORM_IN + 5
    out.sy = 0.9
    out.sx = 1.05
  } else if (t >= STORM_TOP && t < STORM_HIT) {
    out.dy = -[1, 2, 2, 1][t - STORM_TOP]
    out.sy = 1.08
  } else if (t >= STORM_HIT && t < STORM_HIT + 3) {
    out.sy = [0.84, 0.9, 0.96][t - STORM_HIT]
    out.sx = [1.1, 1.06, 1.02][t - STORM_HIT]
  }
  if (t < STORM_IN && t > 1) out.ghosts = [ghost(g.side * pos(t - 2), 0, lit, 0.55)]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [STORM_IN, 3], [STORM_IN + 2, -2], [STORM_IN + 5, 2], [STORM_TOP, 0], [STORM_HIT, 3], [STORM_HIT + 8, 0]]))

  // A whirling gust: flat rings of wind stacked over the foe, the foe a spark spiralling up
  const top = 2
  if (t >= STORM_IN + 1 && t < STORM_HIT + 2) {
    const f = phase(t, STORM_IN + 1, STORM_TOP)
    const fade = phase(t, STORM_TOP, STORM_HIT + 2)
    for (let k = 0; k < 5; k++) {
      const y = lerp(g.ground - 1, top + 2, k / 4)
      if (y < lerp(g.ground, top, f) - 1) continue
      const r = 3 + k * 1.4
      const ang0 = t * 0.9 + k * 1.7
      if (fade > (k + 1) / 6) continue
      for (let s = 0; s < 14; s++) {
        const ang = ang0 - s * 0.3
        const paint = Math.sin(ang) < 0 ? back : dot
        const x = tx + Math.cos(ang) * r
        const py = y + Math.sin(ang) * r * 0.3
        paint(out, x, py, s < 2 ? WHITE : s < 6 ? lit : s < 10 ? c : deep)
        if (s < 8) paint(out, x, py + 1, dark(c, 0.4))
      }
    }
    if (t < STORM_TOP) {
      const ang = t * 1.2
      const r = 4 * (1 - f) + 1
      const y = lerp(ty, top + 1, easeIn(f))
      disc(out, tx + Math.cos(ang) * r, y, 1.6, hi)
      dot(out, tx + Math.cos(ang) * r, y, WHITE)
    }
  }
  // Spiked straight down
  if (t >= STORM_TOP && t <= STORM_HIT) {
    const f = easeIn(phase(t, STORM_TOP, STORM_HIT))
    const y = lerp(top + 1, g.ground - 2, f)
    for (let d = 0; d < 9; d++) {
      const py = y - d
      if (py < top) break
      dot(out, tx, py, d < 2 ? WHITE : lit)
      dot(out, tx - 1, py, d < 5 ? c : deep)
      dot(out, tx + 1, py, d < 5 ? c : deep)
    }
    disc(out, tx, y, 2, WHITE)
  }
  const age = t - STORM_HIT
  const gy = g.ground - 2
  if (age >= 0 && age < 4) out.shake = [[0, 2], [g.side, -2], [-g.side, 1], [0, 0]][age]
  if (age >= 0 && age < 6) {
    // Crosshairs lock on for the critical
    const len = [4, 9, 12, 12, 10, 7][age]
    const col = age < 2 ? WHITE : age < 4 ? hi : c
    line(out, tx - len, gy, tx + len, gy, col)
    line(out, tx, Math.max(0, gy - len), tx, g.ground, col)
    if (age >= 1) {
      const r = 3 + age
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        dot(out, tx + sx * r, gy + sy * r * 0.6, deep)
        dot(out, tx + sx * (r - 1), gy + sy * r * 0.6, deep)
      }
    }
  }
  if (age >= 1 && age < 5) star(out, tx, gy, [7, 8, 6, 4][age - 1], c, { flat: 0.6, points: 4, inner: 0.3, turn: 0.125 })
  if (age >= 2 && age < 10) shock(out, tx, g.ground - 1, 3 + age * 1.6, 0.25, c, age / 10)
  dust(out, t, a, STORM_HIT, tx, g.ground - 1, 6, 0)
}

export const FIGHTING = {
  detect: { ticks: 36, color: 0xffd860, pose: { view: 'front' }, draw: detect },
  reversal: { ticks: 40, color: 0xff6a3a, draw: reversal },
  superpower: { ticks: 48, color: 0xff8a3a, draw: superpower },
  counter: { ticks: 38, color: 0xff5a3a, draw: counter },
  revenge: { ticks: 40, color: 0xd8403a, pose: (t) => ({ stride: t >= REVENGE_GO && t < REVENGE_HIT }), draw: revenge },
  closecombat: { ticks: 52, color: 0xff7a4a, draw: closecombat },
  hammerarm: { ticks: 46, color: 0xe8904a, draw: hammerarm },
  quickguard: { ticks: 36, color: 0xffa848, pose: { view: 'front' }, draw: quickguard },
  bulkup: { ticks: 44, color: 0xff9050, pose: { view: 'front' }, draw: bulkup },
  focuspunch: { ticks: 52, color: 0xffb040, draw: focuspunch },
  aurasphere: { ticks: 40, color: 0x4a9cff, draw: aurasphere },
  finalgambit: { ticks: 52, color: 0xff4a6a, draw: finalgambit },
  vitalthrow: { ticks: 46, color: 0xffa040, draw: vitalthrow },
  circlethrow: { ticks: 46, color: 0xffa040, draw: circlethrow },
  stormthrow: { ticks: 38, color: 0xffa040, draw: stormthrow },
}
