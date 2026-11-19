// Dark moves: shadows, dirty tricks, and blows from the blind side

import {
  BLACK, WHITE, back, ball, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, keys, lean, lerp,
  light, line, luma, mix, phase, plus, puff, ramp, rimGlow, ring, rnd, spark, sparkles, stamp, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const pixelKey = (x, y) => (x + 512) * 2048 + y + 512
const shape = () => ({ dots: [] })

// Paints a shape's pixels [x, y, color, ...] inside a one pixel rim
function rimmed(out, px, rim, paint = dot) {
  const fill = new Map()
  for (let k = 0; k < px.length; k += 3) fill.set(pixelKey(px[k], px[k + 1]), k)
  const edge = new Set()
  for (const k of fill.values()) {
    for (const [nx, ny] of [[px[k] - 1, px[k + 1]], [px[k] + 1, px[k + 1]], [px[k], px[k + 1] - 1], [px[k], px[k + 1] + 1]]) {
      const n = pixelKey(nx, ny)
      if (fill.has(n) || edge.has(n)) continue
      edge.add(n)
      paint(out, nx, ny, rim)
    }
  }
  for (const k of fill.values()) paint(out, px[k], px[k + 1], px[k + 2])
}

const fit = (g, x, half) => clamp(x, half, g.columns - 1 - half)
const halfSpan = (g) => clamp(Math.round((g.ground - 3) * 0.4), 4, 6)

// Leans the sprite px pixels toward the target at its top while its feet stay put
function leanAhead(g, px) {
  if (Math.abs(px) < 0.5) return null
  const span = Math.max(1, g.bottom - g.top)
  return (y) => g.side * px * clamp((g.bottom - y) / span, 0, 1)
}

// A paint that drops a share f of the pixels, the same ones every tick, for fading out
const sparse = (seed, f, paint = dot) => (o, x, y, col) => {
  if (rnd(seed, Math.round(x) * 53 + Math.round(y), 5) >= f) paint(o, x, y, col)
}

// A paint that skips anything outside the strip
const inStrip = (g, paint = dot) => (o, x, y, col) => {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px >= 0 && px < g.columns && py >= 0 && py <= g.ground) paint(o, px, py, col)
}

// The body sinks into shadow while its outline catches a bright rim
const shroud = (g, out, c, f) => rimGlow(g, out, dark(c, 0.65), 0.6 * f, light(c, 0.55), 0.75 * f)

// A shade that drops sprite pixels at random as f goes from 0 to 1
const dissolve = (seed, f, shade = null) => (x, y, col) =>
  rnd(seed, x * 41 + y * 7, 13) < f ? null : shade ? shade(x, y, col) : col

// Debris thrown from (x, y) in a fan around angle, falling as it flies
function debris(out, t, a, x, y, { start, count = 6, life = 10, angle = -Math.PI / 2, spread = 2.4, speed = 1, fall = 0.08, salt = 0 }, colors, paint = dot) {
  emit(t, { count, start, gap: 0, life }, (i, age, f) => {
    const dir = angle + (rnd(a.seed, i, salt) - 0.5) * spread
    const v = speed * (0.7 + rnd(a.seed, i, salt + 1) * 0.8)
    paint(out, x + Math.cos(dir) * v * age, y + Math.sin(dir) * v * age + fall * age * age, colors[Math.min(colors.length - 1, Math.floor(f * colors.length))])
  })
}

// A hit: a white flash, then rays in c over a dark copy of them a size larger
function smack(out, x, y, age, size, c) {
  if (age < 0 || age > 3) return
  if (age === 0) {
    disc(out, x, y, Math.max(1, size * 0.45), WHITE)
    return
  }
  const r = size * [1, 1, 0.8, 0.55][age]
  burst(out, x, y, r + 1, dark(c, 0.55))
  burst(out, x, y, r, age < 2 ? light(c, 0.55) : c)
}

// A > pointing along dir, its arms s long
function chevron(out, x, y, s, dir, c, paint = dot) {
  line(out, x - dir * s, y - s, x, y, c, paint)
  line(out, x, y, x - dir * s, y + s, c, paint)
}

// A ^ for a stat going up, bright on top of a dark underside
function rising(out, x, y, s, c) {
  for (const [dy, col] of [[1, dark(c, 0.5)], [0, light(c, 0.45)]]) {
    line(out, x - s, y + s + dy, x, y + dy, col)
    line(out, x, y + dy, x + s, y + s + dy, col)
  }
}

// Jagged cracks splitting out of (x, y), grown to `grow` (0 to 1) of their length
function cracks(out, seed, x, y, n, len, grow, col, paint = dot) {
  for (let k = 0; k < n; k++) {
    let ang = (k / n) * TAU + rnd(seed, k, 21) * 0.8
    let px = x
    let py = y
    for (let s = 0; s < 3; s++) {
      const f = clamp(grow * 3 - s, 0, 1)
      if (f <= 0) break
      ang += (rnd(seed, k * 7 + s, 22) - 0.5) * 1.3
      const l = (len / 3) * (0.7 + rnd(seed, k * 7 + s, 23) * 0.6) * f
      const nx = px + Math.cos(ang) * l
      const ny = py + Math.sin(ang) * l * 0.8
      line(out, px, py, nx, ny, col, paint)
      px = nx
      py = ny
    }
  }
}

const CRUNCH_SNAPS = [11, 18]

// One jaw of a shadow maw: a solid half oval of shadow, its lip `open` pixels off the
// bite line cy, two great fangs and small teeth between pointing across it. dir -1 is
// the upper jaw, 1 the lower.
function maw(buf, cx, cy, rx, ry, dir, open, tones) {
  const lip = Math.round(cy + dir * (open + 1))
  for (let k = 0; k <= ry; k++) {
    const half = rx * Math.sqrt(1 - (k / (ry + 0.5)) ** 2)
    for (let px = Math.round(cx - half); px <= Math.round(cx + half); px++) {
      const col = k === 0 ? tones.lip : k === 1 && Math.abs(px - cx) < half - 1 ? tones.gleam : tones.bone
      dot(buf, px, lip + dir * k, col)
    }
  }
  const fang = Math.round(rx * 0.5)
  const long = ry + 2
  for (let u = -fang + 2; u <= fang - 2; u += 2) dot(buf, cx + u, lip - dir, tones.tooth)
  for (const u of [-fang, fang]) {
    for (let w = 1; w <= long; w++) {
      const x = cx + u
      dot(buf, x, lip - dir * w, w === long ? tones.tip : tones.tooth)
      if (w <= long - 2) {
        dot(buf, x - 1, lip - dir * w, tones.tooth)
        dot(buf, x + 1, lip - dir * w, tones.shade)
      }
    }
  }
}

// Shadow jaws gape over the target and chomp twice, the second time grinding until
// the air around it cracks like glass
function crunch(out, t, a, g, c) {
  const [s1, s2] = CRUNCH_SNAPS
  out.dx = Math.round(g.side * keys(t, [[0, 0], [7, -2], [s1 - 1, -2], [s1, 1, easeIn], [s1 + 3, 0], [s2 - 1, -1], [s2, 2, easeIn], [s2 + 6, 2], [34, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [7, -2], [s1 - 1, -2], [s1, 2, easeIn], [s2 - 1, 0], [s2, 3, easeIn], [s2 + 6, 2], [34, 0]]))
  if (t === s1) out.shake = [g.side, 0]
  if (t >= s2 && t < s2 + 4) out.shake = [[g.side * 2, 1], [-g.side * 2, 0], [g.side, 1], [-g.side, 0]][t - s2]
  if (t < 2 || t >= 34) return
  const ry = clamp(Math.round((g.ground - 3) * 0.13), 2, 3)
  const most = ry + 2
  const reachY = ry + most + 3
  const cx = fit(g, g.target.x + g.side * 2, 8)
  const cy = clamp(g.target.y - 1, reachY, g.ground - reachY)
  const rx = clamp(Math.min(halfSpan(g) + 3, Math.abs(cx - g.mouth.x) - 3), 5, 8)
  const open = keys(t, [[2, 0], [8, most, easeOut], [s1 - 1, most], [s1, 0, easeIn], [s1 + 2, 0], [s2 - 2, most * 0.6, easeOut], [s2 - 1, most * 0.6], [s2, 0, easeIn], [s2 + 7, 0], [31, most, easeOut]])
  const grind = t >= s2 && t < s2 + 6 ? tremble(t) : 0
  const snap = t === s1 || t === s2
  const tones = snap
    ? { bone: light(c, 0.4), gleam: WHITE, lip: WHITE, tooth: WHITE, shade: WHITE, tip: WHITE }
    : { bone: dark(c, 0.6), gleam: dark(c, 0.3), lip: c, tooth: light(c, 0.8), shade: light(c, 0.35), tip: WHITE }
  const paint = sparse(a.seed, phase(t, 26, 33))
  const up = shape()
  const down = shape()
  maw(down, cx - grind, cy, rx - 1, ry - 1, 1, Math.round(open * 0.6), tones)
  maw(up, cx + grind, cy, rx, ry, -1, Math.round(open), tones)
  rimmed(out, down.dots, light(c, 0.55), paint)
  rimmed(out, up.dots, light(c, 0.55), paint)
  if (t >= s1 && t < s1 + 3) burst(out, cx, cy, 4 - (t - s1), light(c, 0.6))
  const age = t - s2
  if (age >= 0 && age < 14) {
    const grow = easeOut(phase(age, 0, 3))
    const fade = sparse(a.seed + 1, phase(age, 7, 14))
    const reach = rx + 4
    cracks(out, a.seed, cx, cy + 1, 6, reach, grow, dark(c, 0.6), fade)
    cracks(out, a.seed, cx, cy, 6, reach, grow, age < 3 ? WHITE : age < 7 ? light(c, 0.6) : c, fade)
  }
  debris(out, t, a, cx, cy, { start: s2, count: 10, life: 11, spread: 3.6, speed: 1.1, fall: 0.12 }, [WHITE, light(c, 0.6), c, dark(c, 0.3)])
}

const FEINT_GONE = 11
const FEINT_SHOW = 16
const FEINT_HIT = 20
const FEINT_AWAY = 25
const FEINT_HOME = 31

// Sway, melt away while a shadow decoy lunges and pops like smoke, then drop on the
// target from above out of nowhere and vanish back home
function feintattack(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const reach = clamp(Math.abs(g.target.x - g.mouth.x) - 2, 0, 20)
  const fake = (k) => Math.round(g.side * Math.max(4, reach * 0.8) * easeOut(phase(k, 5, 12)))
  if (t < 6) out.skew = lean(g, Math.sin(t * 1.3) * 2.5 * phase(t, 0, 2))
  if (t >= 4 && t < FEINT_GONE) out.shade = dissolve(a.seed, phase(t, 5, FEINT_GONE), tint(deep, 0.4))
  if (t >= FEINT_GONE && t < FEINT_SHOW) out.hidden = true
  if (t >= 5 && t < 13) out.ghosts = [{ dx: fake(t), dy: 0, shade: (col) => (luma(col) < 60 ? hi : mix(col, deep, 0.7)) }]
  if (t >= 12 && t < 20) {
    const age = t - 12
    const px = g.cx + fake(12)
    const r = Math.min(2 + age * 1.1, (g.bottom - g.top) / 2 + 1)
    puff(out, px, g.cy, r, mix(c, 0x9090a8, 0.4), a.seed, sparse(a.seed, phase(age, 3, 8)))
  }
  if (t >= FEINT_SHOW && t < FEINT_HOME) {
    out.dx = g.side * reach
    out.dy = Math.round(keys(t, [[FEINT_SHOW, -5], [FEINT_HIT - 1, -5], [FEINT_HIT, 0, easeIn]]))
    if (t < FEINT_HIT - 1) out.shade = dissolve(a.seed, 1 - phase(t, FEINT_SHOW - 1, FEINT_HIT - 1))
    else if (t >= FEINT_AWAY) out.shade = dissolve(a.seed, phase(t, FEINT_AWAY, FEINT_HOME - 1))
    if (t === FEINT_HIT) out.sy = 0.88
    if (t >= FEINT_HOME - 1) out.hidden = true
  }
  if (t >= FEINT_HOME && t < FEINT_HOME + 5) out.shade = dissolve(a.seed, 1 - phase(t, FEINT_HOME - 1, FEINT_HOME + 4))
  if (t === FEINT_HIT) out.shake = [0, 2]
  if (t === FEINT_HIT + 1) out.shake = [g.side, -1]
  const tx = fit(g, g.target.x, 4)
  const ty = g.target.y
  // Streaks rushing down onto the target as the mon drops
  if (t >= FEINT_HIT - 2 && t <= FEINT_HIT) {
    for (const k of [-3, 0, 3]) line(out, tx + k, Math.max(0, ty - 9), tx + k, ty - 4 + (t - FEINT_HIT) * 2, k ? hi : WHITE)
  }
  smack(out, tx, ty, t - FEINT_HIT, 5, c)
  debris(out, t, a, tx, ty, { start: FEINT_HIT, count: 6, life: 8, spread: 3, speed: 0.9 }, [WHITE, hi, c])
}

const PURSUIT_HIT = 11

const pursuitDash = (t, far) => keys(t, [[0, 0], [3, -1], [4, -1], [PURSUIT_HIT, far, easeIn], [15, far], [26, 0]])

// Bolt after the target low to the ground in a smear of shadow afterimages and land a
// quick blow with arrows of force driving on past it
function pursuit(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const far = clamp(Math.abs(g.target.x - g.mouth.x) - 3, 0, 14)
  out.dx = Math.round(g.side * pursuitDash(t, far))
  out.sy = keys(t, [[0, 1], [3, 0.88], [PURSUIT_HIT, 0.92], [PURSUIT_HIT + 1, 1.06], [PURSUIT_HIT + 3, 1]])
  out.sx = 2 - out.sy
  out.skew = leanAhead(g, keys(t, [[0, 0], [3, -1], [5, 2], [PURSUIT_HIT, 3], [PURSUIT_HIT + 2, -1], [18, 0]]))
  if (t >= 5 && t <= PURSUIT_HIT + 1) {
    out.ghosts = [1, 2, 3].map((k) => ghost(Math.round(g.side * pursuitDash(t - k * 1.5, far)), 0, deep, 0.5 + k * 0.12))
  }
  if (t === PURSUIT_HIT) out.shake = [g.side * 2, 0]
  if (t === PURSUIT_HIT + 1) out.shake = [-g.side, 0]
  // Shadow streaks hugging the ground behind the runner
  if (t >= 5 && t < PURSUIT_HIT + 3) {
    const front = g.mouth.x + out.dx
    for (let k = 0; k < 4; k++) {
      const y = g.ground - 1 - k * 2 - Math.round(rnd(a.seed, k, t >> 1) * 2)
      if (y < g.top) continue
      const len = 4 + Math.round(rnd(a.seed, k, 3) * 5)
      const x0 = front - g.side * (g.right - g.left + 2 + k)
      line(out, x0, y, x0 - g.side * len, y, deep)
      dot(out, x0, y, lit)
    }
  }
  const tx = fit(g, g.target.x, 5)
  const ty = g.target.y
  const age = t - PURSUIT_HIT
  smack(out, tx, ty, age, 5, c)
  if (age >= 1 && age < 9) {
    for (let k = 0; k < 3; k++) {
      const x = tx + g.side * (age * 1.5 + k * 4 - 3)
      if (age > 5 && (age + k) % 2) continue
      chevron(out, x - g.side, ty, 3, g.side, deep)
      chevron(out, x, ty, 3, g.side, k ? lit : WHITE)
      chevron(out, x + g.side, ty, 3, g.side, k ? c : hi)
    }
  }
}

const TAUNT_TURN = [3, 15]
const TAUNT_TONGUE = [16, 24]
const STEAM = 0xff4a3a

// Turn tail and wiggle at the target, spin back and blow a raspberry, and the target
// fumes, red jags flaring and steam boiling off its head
function taunt(out, t, a, g, c) {
  const [t0, t1] = TAUNT_TURN
  const wiggling = t >= t0 && t < t1
  if (wiggling) {
    out.flipX = true
    out.skew = lean(g, (t % 4 < 2 ? 2 : -2) * g.side)
    out.dy = t % 4 < 2 ? -1 : 0
  }
  if (t >= t1 && t < t1 + 2) out.sx = 0.9
  const [g0, g1] = TAUNT_TONGUE
  if (t >= g0 && t < g1) {
    out.dx = g.side
    out.skew = leanAhead(g, 1.5)
    const len = t < g0 + 2 ? t - g0 + 1 : 3
    const mx = g.mouth.x + g.side * 2
    const my = g.mouth.y + 1
    for (let k = 0; k < len; k++) {
      const y = my + (k === len - 1 && t % 2 ? 1 : 0)
      dot(out, mx + g.side * k, y + 1, 0x8a1838)
      dot(out, mx + g.side * k, y, k === len - 1 ? 0xffa0b8 : 0xff5a80)
    }
    // Spit flecks
    if (t % 3 === 0) for (const d of [-1, 1]) dot(out, mx + g.side * (len + 1), my + d * 2, WHITE)
  }
  const tx = fit(g, g.target.x, 5)
  const head = clamp(g.target.y - 5, 3, g.ground - 4)
  if (t >= 17 && t < 38) {
    const f = phase(t, 17, 20) * (1 - phase(t, 33, 38))
    const r = (3 + (t % 4 < 2 ? 1.5 : 0)) * f
    if (r >= 1) {
      burst(out, tx + 3, head - 2, r + 1, dark(c, 0.5))
      burst(out, tx + 3, head - 2, r, t % 4 < 2 ? STEAM : c)
    }
    if (t % 6 < 3) for (const d of [-1, 1]) line(out, tx + d * 6, head + 1, tx + d * 8, head - 1, STEAM)
  }
  emit(t, { count: 6, gap: 3, start: 18, life: 10 }, (i, age, f) => {
    const x = tx + (i % 2 ? 2 : -3) + Math.sin(age * 0.8 + i) * 0.8
    const y = head - 1 - age * 0.9
    if (y < 1) return
    puff(out, x, y, 1.6 + f * 1.8, mix(STEAM, 0xffd0c8, f * 0.7), a.seed + i, sparse(a.seed, Math.max(0, f - 0.6) * 2.5))
  })
}

const ASSURE_LOCK = 12
const ASSURE_HITS = [17, 23]

// Corner brackets close in and lock onto the target, then two blows land, the second
// twice as hard, blowing the brackets apart
function assurance(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const [h1, h2] = ASSURE_HITS
  out.dx = Math.round(g.side * keys(t, [[0, 0], [ASSURE_LOCK, 0], [h1 - 2, -1], [h1, 2, easeIn], [h1 + 2, 1], [h2 - 2, -1], [h2, 4, easeIn], [h2 + 5, 4], [36, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [ASSURE_LOCK, 0], [h1 - 2, -2], [h1, 2, easeIn], [h2 - 2, -2], [h2, 3, easeIn], [h2 + 5, 2], [36, 0]]))
  if (t === h1) out.shake = [g.side, 0]
  if (t >= h2 && t < h2 + 4) out.shake = [[g.side * 2, 1], [-g.side * 2, -1], [g.side, 1], [-g.side, 0]][t - h2]
  const tx = fit(g, g.target.x, 7)
  const ty = clamp(g.target.y, 6, g.ground - 5)
  if (t >= 2 && t < h2 + 7) {
    const blown = phase(t, h2, h2 + 7)
    const s = lerp(10, 4.5, easeOut(phase(t, 2, ASSURE_LOCK))) + blown * 6
    const locked = t >= ASSURE_LOCK && t < ASSURE_LOCK + 2
    const col = locked ? WHITE : t >= ASSURE_LOCK ? (t % 4 < 2 ? hi : lit) : c
    const paint = sparse(a.seed, blown)
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = tx + sx * s
        const y = ty + sy * s * 0.75
        for (const [d, k] of [[1, deep], [0, col]]) {
          line(out, x, y + d, x - sx * 2, y + d, k, paint)
          line(out, x + d, y, x + d, y - sy * 2, k, paint)
        }
      }
    }
    if (t >= ASSURE_LOCK && t < h2) plus(out, tx, ty, t % 4 < 2 ? lit : c, WHITE)
  }
  smack(out, tx, ty, t - h1, 4, c)
  debris(out, t, a, tx, ty, { start: h1, count: 4, life: 6, spread: 3, speed: 0.9, salt: 9 }, [WHITE, hi, c])
  const age = t - h2
  smack(out, tx, ty, age, 7, c)
  if (age >= 1 && age < 8) {
    ring(out, tx, ty, 3 + age * 1.6, age < 4 ? hi : c)
    ring(out, tx, ty, 2 + age * 1.6, deep)
  }
  debris(out, t, a, tx, ty, { start: h2, count: 8, life: 10, spread: 3.6, speed: 1.2 }, [WHITE, hi, c, deep])
}

const PLOT_ARROWS = [30, 35]
const EYE_RED = 0xff3050

// Face out and sink into shadow, eyes glinting red while a dark scheme swirls over the
// head and the mon snickers, then two arrows climb for a sharp rise
function nastyplot(out, t, a, g, c) {
  const [, lit] = ramp(c)
  const dim = phase(t, 0, 6) * (1 - phase(t, 40, 46))
  if (t >= 14 && t < 30) out.dy = t % 4 < 2 ? -1 : 0
  if (t >= 14 && t < 30) out.sx = t % 4 < 2 ? 1.03 : 1
  if (dim > 0) {
    const body = shroud(g, out, c, dim)
    out.shade = (x, y, col) => (luma(col) > 200 ? mix(col, EYE_RED, dim) : body(x, y, col))
  }
  // A thought swirl over the head, or beside it when there is no room above, fed by
  // little dark puffs rising into it
  const above = g.top >= 9
  const toRight = g.columns - 1 - g.right >= g.left
  const sx = above ? g.cx : toRight ? g.right + 6 : g.left - 6
  const sy = above ? g.top - 5 : g.top + 4
  const grow = phase(t, 6, 12) * (1 - phase(t, 28, 33))
  if (grow > 0) {
    for (let k = 0; k < 24; k++) {
      const f = k / 24
      const ang = f * TAU * 1.8 - t * 0.45
      const r = (0.6 + f * 3.6) * grow
      const x = sx + Math.cos(ang) * r * 1.3
      const y = sy + Math.sin(ang) * r * 0.85
      dot(out, x, y + 1, BLACK)
      dot(out, x, y, k > 19 ? WHITE : k > 10 ? lit : c)
    }
  }
  emit(t, { count: 3, gap: 2, start: 4, life: 6 }, (i, age) => {
    const from = { x: above ? g.cx : toRight ? g.right - 2 : g.left + 2, y: g.top + 2 }
    const f = age / 6
    disc(out, lerp(from.x, sx, f), lerp(from.y, sy + (above ? 3 : 0), f), i === 2 ? 1 : 0.5, i % 2 ? lit : c)
  })
  if (t >= 8 && t < 30 && t % 5 < 2) spark(out, sx + 4, sy - 2, 1, lit)
  for (const start of PLOT_ARROWS) {
    const age = t - start
    if (age < 0 || age >= 10) continue
    for (const x of [g.left - 2, g.right + 2]) {
      const y = g.bottom - 2 - age * 1.4
      if (y > g.top - 4 && (age < 7 || age % 2)) rising(out, x, y, 2, c)
    }
  }
}

const EMBARGO_LOCK = 16
const LOCK = ['..sss..', '.s...s.', '.s...s.', 'ooooooo', 'ohhhhho', 'ohcdcco', 'occdcco', 'ooooooo']

// A chain link at x, y: a tiny ring, upright or flat by k
function link(out, x, y, k, c, edge) {
  if (k % 2) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) dot(out, x + dx, y + dy, c)
    dot(out, x, y, edge)
  } else {
    dot(out, x - 1, y, c)
    dot(out, x + 1, y, c)
    dot(out, x, y, light(c, 0.4))
  }
}

// Push a palm out. Two chains whip in and cross over the target, and a padlock drops
// onto the crossing and snaps shut with a clank
function embargo(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [4, -1], [6, 1, easeIn], [EMBARGO_LOCK + 2, 1], [30, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [4, -1], [6, 2, easeIn], [EMBARGO_LOCK + 2, 1], [30, 0]]))
  if (t === EMBARGO_LOCK + 2) out.shake = [0, 1]
  if (t === EMBARGO_LOCK + 3) out.shake = [g.side, 0]
  const tx = fit(g, g.target.x, 8)
  const ty = clamp(g.target.y, 6, g.ground - 5)
  const span = clamp(halfSpan(g) + 3, 6, 9)
  const fade = sparse(a.seed, phase(t, 32, 40))
  if (t < 6 || t >= 40) return
  // Two chains reach in from the upper corners, crossing at the target
  const grow = easeOut(phase(t, 6, 13))
  for (const d of [-1, 1]) {
    const x0 = tx + d * span * 1.3
    const y0 = ty - span
    const x1 = tx - d * span * 1.3
    const y1 = ty + span * 0.8
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 2)
    for (let k = 0; k <= n * grow; k++) {
      const f = k / n
      const rattle = t >= EMBARGO_LOCK + 2 && t < EMBARGO_LOCK + 6 ? tremble(t + k) * 0.5 : 0
      const col = t >= EMBARGO_LOCK + 2 && t < EMBARGO_LOCK + 4 ? WHITE : (k + (d > 0 ? 1 : 0)) % 4 < 2 ? lit : c
      const p = [lerp(x0, x1, f), lerp(y0, y1, f) + rattle]
      if (rnd(a.seed, k * 3 + d, 5) >= phase(t, 32, 40)) link(out, p[0], p[1], k, col, deep)
    }
  }
  // The lock drops onto the crossing, its shackle still open, and clicks shut
  if (t >= 11) {
    const y = keys(t, [[11, ty - 10], [EMBARGO_LOCK, ty - 3, easeIn], [EMBARGO_LOCK + 1, ty - 4], [EMBARGO_LOCK + 2, ty - 3, easeIn]])
    const shut = t >= EMBARGO_LOCK + 2 ? 0 : 1
    const flash = t >= EMBARGO_LOCK + 2 && t < EMBARGO_LOCK + 4
    const pal = { o: dark(c, 0.6), h: flash ? WHITE : hi, c: flash ? light(c, 0.5) : c, d: BLACK }
    const buf = shape()
    stamp(buf, tx - 3, Math.round(y) + 3, LOCK.slice(3), pal)
    stamp(buf, tx - 3, Math.round(y) - shut, LOCK.slice(0, 3), { s: flash ? WHITE : lit })
    rimmed(out, buf.dots, light(c, 0.5), fade)
  }
  const age = t - EMBARGO_LOCK - 2
  if (age >= 0 && age < 3) burst(out, tx, ty - 4, 3 + age, WHITE)
  if (age >= 2 && age < 16 && age % 5 < 3) {
    spark(out, tx + 4, ty - 3, 1, lit)
  }
}

const KNOCK_HIT = 10
const BERRY = ['..g..', '.rgr.', 'rhrrr', 'rrrrd', '.rdd.']
const BERRY_COLORS = { g: 0x4ac060, r: 0xe8403a, h: WHITE, d: 0x8a1a20 }

// Where a knocked off item is after age ticks: thrown up and away, bouncing on the
// ground and off the strip's ends
function tumble(g, x0, y0, age) {
  let x = x0
  let y = y0
  let vx = g.side * 1.1
  let vy = -1.7
  for (let k = 0; k < age; k++) {
    x += vx
    y += vy
    vy += 0.24
    if (y > g.ground - 2) {
      y = g.ground - 2
      vy = -vy * 0.5
      vx *= 0.75
    }
    if (x < 2 || x > g.columns - 3) {
      x = clamp(x, 2, g.columns - 3)
      vx = -vx * 0.6
    }
  }
  return { x, y }
}

// Wind up and swat low and hard. The blow sweeps up through the target and knocks
// its held berry flying, tumbling and bouncing away across the ground
function knockoff(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [6, -2], [KNOCK_HIT - 1, -2], [KNOCK_HIT, 3, easeIn], [KNOCK_HIT + 4, 3], [26, 0]]))
  out.sy = keys(t, [[0, 1], [6, 0.9], [KNOCK_HIT - 1, 0.9], [KNOCK_HIT, 1.06], [KNOCK_HIT + 3, 1]])
  out.skew = leanAhead(g, keys(t, [[0, 0], [6, -3], [KNOCK_HIT - 1, -3], [KNOCK_HIT, 3, easeIn], [KNOCK_HIT + 4, 2], [24, 0]]))
  if (t === KNOCK_HIT) out.shake = [g.side * 2, -1]
  if (t === KNOCK_HIT + 1) out.shake = [-g.side, 0]
  const tx = fit(g, g.target.x, 6)
  const ty = g.target.y
  // The swat: an upswing arc through the target, toward the far side
  const age = t - KNOCK_HIT + 1
  if (age >= 0 && age < 6) {
    const up = g.side > 0 ? -Math.PI / 4 : (-3 * Math.PI) / 4
    const spread = 0.5 + Math.min(age, 2) * 0.4
    const fadeArc = sparse(a.seed, phase(age, 2, 6))
    const ax = tx - g.side * 4
    const ay = ty + 5
    ring(out, ax, ay, 9, deep, up, spread, fadeArc)
    ring(out, ax, ay, 8, age < 2 ? WHITE : hi, up, spread, fadeArc)
    ring(out, ax, ay, 7, age < 2 ? WHITE : lit, up, spread, fadeArc)
    ring(out, ax, ay, 6, lit, up, spread * 0.9, fadeArc)
    ring(out, ax, ay, 5, c, up, spread * 0.8, fadeArc)
  }
  smack(out, tx, ty, t - KNOCK_HIT, 4, c)
  const fly = t - KNOCK_HIT
  if (fly >= 0 && fly < 28) {
    const p = tumble(g, tx, ty - 3, fly)
    if (fly > 22 && t % 2) return
    const flip = Math.floor(fly / 2) % 2 === 1
    const rows = Math.floor(fly / 4) % 2 ? [...BERRY].reverse() : BERRY
    const buf = shape()
    stamp(buf, p.x - 2, p.y - 2, rows, BERRY_COLORS, flip)
    rimmed(out, buf.dots, 0x3a1014)
    if (fly < 8) for (let k = 1; k <= 3; k++) dot(out, p.x - g.side * (k + 2), p.y + (k % 2), k === 1 ? WHITE : lit)
  } else if (fly < 0 && t >= 2) {
    const buf = shape()
    stamp(buf, tx - 2, ty - 5, BERRY, BERRY_COLORS)
    rimmed(out, buf.dots, 0x3a1014)
  }
}

const NIGHT_GONE = 9
const NIGHT_CUT = 11
const MOON = ['.www.', 'ww...', 'w....', 'ww...', '.www.']

// Go dark as a crescent moon glints overhead, then blink out and cut across the
// target with one flat black blade. Shadow bleeds and drips from the cut.
function nightslash(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const dim = phase(t, 0, 5) * (1 - phase(t, 20, 28))
  out.dy = t >= 3 && t < NIGHT_GONE ? -1 : 0
  out.sy = t >= 3 && t < NIGHT_GONE ? 0.94 : 1
  if (t >= NIGHT_GONE && t < NIGHT_CUT + 1) out.hidden = true
  if (t >= NIGHT_CUT + 1 && t < NIGHT_CUT + 4) out.shade = dissolve(a.seed, 1 - phase(t, NIGHT_CUT, NIGHT_CUT + 4), shroud(g, out, c, 1))
  else if (dim > 0 && !out.hidden) out.shade = shroud(g, out, c, dim)
  if (t >= NIGHT_CUT && t < NIGHT_CUT + 3) out.shake = [[g.side * 2, 0], [-g.side, 1], [g.side, 0]][t - NIGHT_CUT]
  if (t >= 3 && t < NIGHT_GONE) {
    const mx = g.cx - g.side * 2
    const my = Math.max(1, g.top - 5)
    stamp(out, mx - 2, my + 1, MOON, { w: dark(c, 0.5) }, g.side < 0)
    stamp(out, mx - 2, my, MOON, { w: t % 3 ? lit : WHITE }, g.side < 0)
    if (t >= 6) spark(out, mx + g.side * 4, my + 1, 1, hi)
  }
  // A dark smear from where the mon stood to the target as it blinks across
  const tx = fit(g, g.target.x, 3)
  const ty = g.target.y
  if (t >= NIGHT_GONE && t < NIGHT_CUT + 1) {
    const f = phase(t, NIGHT_GONE - 1, NIGHT_CUT)
    for (const d of [-1, 0, 1]) line(out, g.mouth.x, g.cy + d, lerp(g.mouth.x, tx, f), ty + d, d ? deep : c)
  }
  const age = t - NIGHT_CUT
  if (age < 0 || age >= 20) return
  const half = clamp(halfSpan(g) + 6, 9, 12)
  const x0 = fit(g, tx - g.side * half, 0)
  const x1 = fit(g, tx + g.side * half, 0)
  const head = easeOut(phase(age, -1, 2))
  const gone = easeIn(phase(age, 6, 16))
  const fade = sparse(a.seed, Math.max(0, gone - 0.2) * 1.25)
  const span = Math.abs(x1 - x0)
  // A flat blade of black, its edge catching moonlight, thickest just past its middle
  // and rising a little toward its tip
  for (let k = 0; k <= span; k++) {
    const f = k / Math.max(1, span)
    if (f > head || f < gone) continue
    const x = x0 + Math.sign(x1 - x0) * k
    const y = ty - Math.round(f * 2)
    const thick = Math.round(Math.sin(f ** 0.8 * Math.PI) * 1.6 * (1 - gone * 0.6))
    fade(out, x, y - thick - 1, age < 2 ? WHITE : hi)
    for (let w = -thick; w <= thick; w++) fade(out, x, y + w, age < 2 ? lit : w > 0 ? deep : BLACK)
    fade(out, x, y + thick + 1, c)
  }
  if (age < 3) spark(out, x1, ty, 3 - age, lit)
  // Shadow bleeding off the cut and dripping down
  emit(t, { count: 9, gap: 0.6, start: NIGHT_CUT + 2, life: 10 }, (i, life, f) => {
    const x = lerp(x0, x1, 0.15 + rnd(a.seed, i, 31) * 0.7)
    const y = ty + 2 + life * 0.5 + life * life * 0.04
    if (y > g.ground) return
    dot(out, x, y, f < 0.5 ? c : deep)
    dot(out, x, y - 1, f < 0.3 ? lit : c)
  })
}

const TORMENT_JABS = [14, 21, 28]

// Cackle while a tangled red scribble of spite whirls over the target and thorns of
// shadow jab at it from both sides, again and again
function torment(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  if (t >= 4 && t < 36) {
    out.dy = t % 3 === 0 ? -1 : 0
    out.skew = leanAhead(g, t % 3 === 0 ? -1 : 0.5)
  }
  const tx = fit(g, g.target.x, 7)
  const ty = clamp(g.target.y, 6, g.ground - 4)
  const hy = Math.max(3, ty - 6)
  const grow = easeOut(phase(t, 3, 10)) * (1 - easeIn(phase(t, 34, 40)))
  // The scribble: a jittery loop that redraws itself every other tick
  if (grow > 0) {
    const n = 30
    let prev = null
    for (let k = 0; k <= n; k++) {
      const ang = (k / n) * TAU * 3 + t * 0.35
      const jit = rnd(a.seed, k, t >> 1) * 2.4
      const p = [tx + Math.cos(ang) * (4.5 + jit) * grow, hy + Math.sin(ang * 1.35) * (2.2 + jit * 0.6) * grow]
      if (prev) {
        line(out, prev[0], prev[1] + 1, p[0], p[1] + 1, dark(c, 0.55))
        line(out, prev[0], prev[1], p[0], p[1], k % 5 === 0 ? WHITE : k % 2 ? hi : c)
      }
      prev = p
    }
  }
  TORMENT_JABS.forEach((s, k) => {
    const age = t - s
    if (age < -3 || age >= 5) return
    const d = k % 2 ? 1 : -1
    const reach = keys(age, [[-3, 11], [0, 2, easeIn], [2, 2], [5, 11, easeOut]])
    const y = ty + (k - 1) * 2
    // A thorn, wide at its root and pointed at the target
    for (let w = 0; w < 8; w++) {
      const x = tx + d * (reach + w)
      const thick = w > 4 ? 2 : w > 1 ? 1 : 0
      for (let s = -thick; s <= thick; s++) dot(out, x, y + s, Math.abs(s) === thick && thick ? deep : w === 0 ? WHITE : s < 0 ? lit : c)
      if (thick) {
        dot(out, x, y - thick - 1, dark(c, 0.6))
        dot(out, x, y + thick + 1, dark(c, 0.6))
      }
    }
    if (age >= 0 && age < 2) {
      burst(out, tx + d * 2, y, 3 - age, hi)
      out.shake = [d * (age ? -1 : 1), 0]
    }
  })
}

const SUCKER_HIT = 5
const FIST = ['..ooooo.', '.ohhhhco', 'ohhcccco', 'ohccccco', 'ocdcdcdo', '.ooooooo']

// Hold dead still, a glint of warning, then strike first: the mon is simply at the
// target, a shadow fist landing, its afterimage left behind at home
function suckerpunch(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const reach = clamp(Math.abs(g.target.x - g.mouth.x) - 7, 0, 18)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [SUCKER_HIT - 1, 0], [SUCKER_HIT, reach], [12, reach], [20, 0, easeInOut]]))
  out.dy = Math.round(keys(t, [[0, 0], [12, 0], [16, -3, easeOut], [20, 0, easeIn]]))
  if (t >= SUCKER_HIT && t < SUCKER_HIT + 3) {
    out.ghosts = [ghost(0, 0, deep, 0.55 + (t - SUCKER_HIT) * 0.15)]
    out.skew = leanAhead(g, 3)
  }
  if (t >= SUCKER_HIT && t < SUCKER_HIT + 2) out.shake = [g.side * 2, t === SUCKER_HIT ? 1 : 0]
  // A warning glint on the mon's eye
  if (t >= 1 && t < SUCKER_HIT) spark(out, g.mouth.x - g.side * 2, g.mouth.y - 2, t === 3 ? 2 : 1, lit)
  const tx = fit(g, g.target.x, 5)
  const ty = g.target.y
  // The streak it left crossing the gap in one tick
  if (t === SUCKER_HIT || t === SUCKER_HIT + 1) {
    for (const d of [-2, 0, 2]) line(out, g.mouth.x, g.mouth.y + d + 1, tx - g.side * 3, ty + d, t === SUCKER_HIT ? lit : deep)
  }
  const age = t - SUCKER_HIT
  if (age >= 0 && age < 6) {
    const pal = { o: dark(c, 0.65), h: age < 2 ? WHITE : hi, c: age < 2 ? light(c, 0.5) : c, d: deep }
    const buf = shape()
    stamp(buf, tx - 4 - g.side * (age < 2 ? 0 : 1), ty - 3, FIST, pal, g.side < 0)
    rimmed(out, buf.dots, light(c, 0.55), sparse(a.seed, phase(age, 3, 6)))
  }
  smack(out, tx + g.side * 3, ty, age - 1, 5, c)
  debris(out, t, a, tx + g.side * 3, ty, { start: SUCKER_HIT + 1, count: 7, life: 8, angle: g.side > 0 ? 0 : Math.PI, spread: 2.2, speed: 1.2, fall: 0.06 }, [WHITE, hi, c])
}

const PULSE_START = 9
const PULSES = 6
const PULSE_GAP = 4

// Gather shadow, then throb out rippling rings of darkness from the whole body, each
// one sweeping across the strip and jolting the target as it passes
function darkpulse(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const dim = phase(t, 0, 6) * (1 - phase(t, 36, 42))
  if (dim > 0) out.shade = shroud(g, out, c, dim)
  const live = t >= PULSE_START && t < PULSE_START + PULSES * PULSE_GAP
  const beat = live && (t - PULSE_START) % PULSE_GAP === 0
  if (beat) {
    out.sx = 1.06
    out.sy = 1.04
  }
  if (t < PULSE_START) out.sy = 1 - 0.05 * phase(t, 2, PULSE_START)
  // Motes of shadow drawn in before the first ring
  emit(t, { count: 10, gap: 0.6, start: 0, life: 7 }, (i, age, f) => {
    const ang = (i / 10) * TAU + rnd(a.seed, i, 3)
    const r = ((g.right - g.left) / 2 + 7) * (1 - easeIn(f))
    plus(out, g.cx + Math.cos(ang) * r, g.cy + Math.sin(ang) * r * 0.7, deep, f < 0.5 ? lit : c)
  })
  const paint = inStrip(g)
  const far = Math.max(g.reach + 6, 14)
  const r0 = (g.right - g.left) / 2 + 1
  const dist = Math.hypot(g.target.x - g.cx, g.target.y - g.cy)
  emit(t, { count: PULSES, gap: PULSE_GAP, start: PULSE_START, life: 12 }, (i, age, f) => {
    const r = r0 + easeOut(f) * far
    const steps = Math.ceil(r * 7)
    const fading = f > 0.7
    for (let k = 0; k < steps; k++) {
      if (fading && (k + t) % 2) continue
      const ang = (k / steps) * TAU
      const rr = r + Math.sin(ang * 6 + t * 0.9 + i) * 0.9
      const x = g.cx + Math.cos(ang) * rr
      const y = g.cy + Math.sin(ang) * rr * 0.75
      paint(out, x, y, f < 0.4 ? hi : lit)
      paint(out, x - Math.cos(ang), y - Math.sin(ang) * 0.75, deep)
    }
    if (Math.abs(r - dist) < 2.5) {
      burst(out, g.target.x, g.target.y, 3, hi)
      out.shake = [i % 2 ? g.side : -g.side, 0]
    }
  })
}

const PAYBACK_HURT = 3
const PAYBACK_HIT = 21
const RAGE = 0xff3a3a

// Take a hit first, reeling back with a flash, then seethe red in the dark and lunge
// back twice as hard, the blow doubling with a second shockwave
function payback(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [PAYBACK_HURT, 0], [PAYBACK_HURT + 1, -3, easeOut], [10, -2], [PAYBACK_HIT - 3, -3], [PAYBACK_HIT, 4, easeIn], [PAYBACK_HIT + 6, 4], [38, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [PAYBACK_HURT, 0], [PAYBACK_HURT + 1, -3], [10, -1], [PAYBACK_HIT - 3, -2], [PAYBACK_HIT, 3, easeIn], [PAYBACK_HIT + 6, 2], [38, 0]]))
  if (t >= PAYBACK_HURT && t < PAYBACK_HURT + 3) {
    out.shade = tint(WHITE, [0.7, 0.4, 0.2][t - PAYBACK_HURT])
    out.shake = [-g.side * (t === PAYBACK_HURT ? 2 : 1), 0]
    burst(out, g.mouth.x, g.mouth.y + 1, 3 - (t - PAYBACK_HURT), WHITE)
  }
  const seethe = phase(t, 7, 13) * (1 - phase(t, PAYBACK_HIT + 4, PAYBACK_HIT + 12))
  if (seethe > 0) {
    out.shade = rimGlow(g, out, mix(deep, RAGE, 0.25), 0.5 * seethe, t % 4 < 2 ? RAGE : light(RAGE, 0.4), 0.85 * seethe)
    if (t >= 10 && t < PAYBACK_HIT - 2) out.dx += tremble(t)
  }
  // Red sparks of anger flicking off the body as it seethes
  emit(t, { count: 8, gap: 1.2, start: 9, life: 5 }, (i, age) => {
    const x = g.left + rnd(a.seed, i, 4) * (g.right - g.left) + out.dx
    const y = g.top + 1 + rnd(a.seed, i, 5) * (g.bottom - g.top) * 0.6 - age
    dot(out, x, y, age < 2 ? WHITE : RAGE)
  })
  if (t >= PAYBACK_HIT - 1 && t <= PAYBACK_HIT) out.ghosts = [ghost(-g.side * 3, 0, RAGE, 0.6)]
  if (t >= PAYBACK_HIT && t < PAYBACK_HIT + 5) out.shake = [[g.side * 2, 1], [-g.side * 2, -1], [g.side * 2, 0], [-g.side, 1], [g.side, 0]][t - PAYBACK_HIT]
  const tx = fit(g, g.target.x, 6)
  const ty = g.target.y
  const age = t - PAYBACK_HIT
  smack(out, tx, ty, age, 6, RAGE)
  for (const [delay, col] of [[0, RAGE], [3, hi]]) {
    const k = age - delay
    if (k < 1 || k >= 8) continue
    ring(out, tx, ty, 2 + k * 1.5, k < 4 ? col : c, 0, Math.PI, sparse(a.seed, phase(k, 4, 8)))
  }
  debris(out, t, a, tx, ty, { start: PAYBACK_HIT, count: 10, life: 10, spread: 3.6, speed: 1.3 }, [WHITE, light(RAGE, 0.4), RAGE, deep])
}

const SNATCH_GRAB = 12
const SNATCH_HOME = 24
const GOLD = 0xffd84a

// A shadow hand on a long arm reaches out, closes around a glowing boost at the
// target and hauls it back, and the mon shines with what it stole
function snatch(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const sx = g.mouth.x
  const sy = g.mouth.y + 1
  const tx = fit(g, g.target.x, 4)
  const ty = g.target.y
  const ext = keys(t, [[2, 0], [SNATCH_GRAB, 1, easeOut], [SNATCH_GRAB + 2, 1], [SNATCH_HOME, 0, easeIn]])
  out.dx = Math.round(g.side * keys(t, [[0, 0], [SNATCH_GRAB, 1], [SNATCH_GRAB + 2, 1], [SNATCH_HOME, -1, easeIn], [SNATCH_HOME + 4, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [SNATCH_GRAB, 2], [SNATCH_GRAB + 2, 2], [SNATCH_HOME, -1, easeIn], [SNATCH_HOME + 5, 0]]))
  const shine = phase(t, SNATCH_HOME, SNATCH_HOME + 2) * (1 - phase(t, 32, 38))
  if (shine > 0) out.shade = rimGlow(g, out, GOLD, 0.3 * shine, light(GOLD, 0.5), 0.8 * shine)
  else if (t >= 2 && t < SNATCH_HOME) out.shade = shroud(g, out, c, 0.6 * phase(t, 2, 6))
  const dist = Math.hypot(tx - sx, ty - sy) || 1
  const ux = (tx - sx) / dist
  const uy = (ty - sy) / dist
  const len = dist * ext
  const hand = { x: sx + ux * len, y: sy + uy * len }
  if (len >= 1) {
    const buf = shape()
    for (let s = 0; s <= len; s += 0.7) {
      const wave = Math.sin(s * 0.55 - t * 0.6) * 0.8 * (s / Math.max(1, len))
      const x = sx + ux * s - uy * wave
      const y = sy + uy * s + ux * wave
      dot(buf, x, y, deep)
      dot(buf, x, y + 1, c)
    }
    // An open hand of three fingers that closes into a fist on the grab
    const open = t < SNATCH_GRAB ? 1 : 0
    for (const d of [-1, 0, 1]) {
      const spread = d * (0.35 + open * 0.45)
      const fl = open ? 3 : 1.5
      const fx = hand.x + g.side * Math.cos(spread) * fl
      const fy = hand.y + Math.sin(spread) * fl * 1.5
      line(buf, hand.x, hand.y, fx, fy, d === 0 ? lit : c)
    }
    disc(buf, hand.x, hand.y, 1.2, c)
    rimmed(out, buf.dots, light(c, 0.55))
  }
  // The prize: a glowing orb over the target, then clutched in the hand
  if (t >= 4 && t < SNATCH_HOME) {
    const held = t >= SNATCH_GRAB
    const ox = held ? hand.x + g.side : tx
    const oy = held ? hand.y : ty - 1
    disc(out, ox, oy, held ? 1.6 : 2.6, dark(GOLD, 0.55))
    ball(out, ox, oy, held ? 1 : 1.8, GOLD)
    if (!held && t % 3 < 2) spark(out, ox, oy - 4, 1, GOLD)
  }
  if (t >= SNATCH_HOME && t < SNATCH_HOME + 3) burst(out, sx, sy, 4 - (t - SNATCH_HOME), GOLD)
  if (shine > 0) sparkles(out, t, a.seed, g.cx, g.cy, g.right - g.left + 4, g.bottom - g.top + 2, GOLD, 5)
}

const CONFETTI = [0xff5a8a, 0xffd84a, 0x5ad0ff, 0x8aff7a, 0xc08aff]
const FLATTER_DAZE = 22

// Clap and fawn while a shower of confetti rains on the target, then little stars
// circle its head as it reels, dizzy from all the praise
function flatter(out, t, a, g, c) {
  const [, lit] = ramp(c)
  if (t >= 2 && t < 34) {
    const beat = Math.floor((t - 2) / 3) % 2
    out.skew = leanAhead(g, beat ? 1.5 : -0.5)
    out.dy = beat ? 0 : -1
    // Clap lines bursting from the paws at each clap
    if (beat && (t - 2) % 3 === 0) {
      const x = g.mouth.x + g.side * 2
      const y = g.mouth.y + 3
      for (const [dx, dy] of [[1, -1], [2, 0], [1, 1]]) line(out, x + g.side * dx, y + dy * 1.5, x + g.side * dx * 2, y + dy * 3, lit)
    }
  }
  const tx = fit(g, g.target.x, 6)
  const ty = g.target.y
  emit(t, { count: 22, gap: 0.9, start: 4, life: 14 }, (i, age, f) => {
    const x = tx + (rnd(a.seed, i, 7) - 0.5) * 16 + Math.sin(age * 0.7 + i) * 1.2
    const y = 1 + rnd(a.seed, i, 8) * 3 + age * 0.9
    if (y > g.ground || (f > 0.8 && t % 2)) return
    const col = CONFETTI[i % CONFETTI.length]
    dot(out, x, y, col)
    if ((age + i) % 3) dot(out, x + 1, y, dark(col, 0.25))
  })
  if (t < FLATTER_DAZE || t >= 44) return
  const hy = Math.max(3, ty - 6)
  const f = phase(t, FLATTER_DAZE, FLATTER_DAZE + 3) * (1 - phase(t, 39, 44))
  for (let k = 0; k < 3; k++) {
    const ang = t * 0.4 + (k * TAU) / 3
    const x = tx + Math.cos(ang) * 5 * f
    const y = hy + Math.sin(ang) * 1.6 * f
    if (Math.sin(ang) < 0) dot(out, x, y, dark(GOLD, 0.3))
    else plus(out, x, y, GOLD, WHITE)
  }
}

const HONE_SCRAPES = [8, 14, 20, 26]
const HONE_GLEAM = 31

// Three claw marks slanting one way, side by side, centered on x, y
function clawSet(out, x, y, len, tilt, tones) {
  for (let k = -1; k <= 1; k++) {
    const ox = x + k * 2.5
    line(out, ox - tilt * len * 0.5, y - len * 0.5 + 1, ox + tilt * len * 0.5, y + len * 0.5 + 1, tones[2])
    line(out, ox - tilt * len * 0.5, y - len * 0.5, ox + tilt * len * 0.5, y + len * 0.5, k ? tones[1] : tones[0])
  }
}

// Face out and whet two sets of claws against each other in front of the body, sparks
// spitting at every scrape, until they gleam and power climbs
function honeclaws(out, t, a, g, c) {
  const tones = [WHITE, light(c, 0.3), dark(c, 0.55)]
  const len = clamp(Math.round((g.bottom - g.top) * 0.4), 4, 7)
  const y = Math.round(g.cy)
  const live = phase(t, 2, 6) * (1 - phase(t, 40, 44))
  if (live > 0) {
    let slide = 0
    for (const s of HONE_SCRAPES) if (t >= s - 3 && t < s + 3) slide = Math.sin(((t - s) / 3) * (Math.PI / 2))
    if (t >= HONE_GLEAM - 2) slide = -1
    const gap = 3 + Math.abs(slide) * 2 + (t >= HONE_GLEAM - 2 ? 3 : 0)
    const paint = sparse(a.seed, 1 - live)
    const buf = shape()
    clawSet(buf, g.cx - gap, y + slide * 3, len, 1, tones)
    clawSet(buf, g.cx + gap, y - slide * 3, len, -1, tones)
    for (let k = 0; k < buf.dots.length; k += 3) paint(out, buf.dots[k], buf.dots[k + 1], buf.dots[k + 2])
  }
  for (const s of HONE_SCRAPES) {
    if (t === s) out.sy = 0.96
    debris(out, t, a, g.cx, y, { start: s, count: 5, life: 6, spread: 3.2, speed: 1.3, fall: 0.1, salt: s }, [WHITE, 0xffe36e, 0xff9a3a])
    if (t >= s && t < s + 2) spark(out, g.cx, y, 2 - (t - s), 0xffe36e)
  }
  const age = t - HONE_GLEAM
  if (age >= 0 && age < 6) {
    for (const d of [-1, 1]) spark(out, g.cx + d * (6 + len * 0.5), y - len * 0.5, [1, 2, 3, 2, 1, 1][age], light(c, 0.3))
  }
  emit(t, { count: 2, gap: 4, start: HONE_GLEAM + 2, life: 9 }, (i, age2) => {
    for (const x of [g.left - 2, g.right + 2]) rising(out, x, g.bottom - 2 - age2 * 1.4, 2, 0xff6a4a)
  })
}

const TEAR = 0x6ac0ff
const TEAR_EDGE = 0x1f5fc0
const TEAR_LIFE = 12

// Sob with heaving shoulders, tears spurting from both eyes and splashing over the
// target, then a sly wink to show it was all an act
function faketears(out, t, a, g, c) {
  const sob = t >= 3 && t < 34
  if (sob) {
    out.dy = Math.floor(t / 3) % 2 ? -1 : 0
    out.sy = Math.floor(t / 3) % 2 ? 1.02 : 0.95
    out.skew = leanAhead(g, Math.floor(t / 3) % 2 ? 0.5 : -0.5)
  }
  const ey = clamp(g.mouth.y - 2, g.top + 1, g.bottom)
  const ex = g.frontAt(ey) - g.side
  const tx = fit(g, g.target.x, 3)
  const ty = g.target.y
  emit(t, { count: 16, gap: 1.6, start: 4, life: TEAR_LIFE }, (i, age, f) => {
    const toward = i % 3 !== 2
    const spurt = toward ? (tx - ex) / TEAR_LIFE : -g.side * (0.5 + rnd(a.seed, i, 2) * 0.5)
    const vy = -1.1 - rnd(a.seed, i, 3) * 0.6
    const fall = toward ? (2 * (ty - ey - vy * TEAR_LIFE)) / (TEAR_LIFE * TEAR_LIFE) : 0.2
    const x = ex + out.dx + spurt * age + (toward ? (rnd(a.seed, i, 4) - 0.5) * 3 * f : 0)
    const y = ey + out.dy + vy * age + 0.5 * fall * age * age
    if (y > g.ground) return
    dot(out, x, y, f < 0.3 ? WHITE : TEAR)
    dot(out, x, y + 1, TEAR_EDGE)
    if (toward && age === TEAR_LIFE - 1) {
      for (const d of [-2, 2]) dot(out, x + d, y - 1, TEAR)
      dot(out, x, y - 2, WHITE)
    }
  })
  // A trickle down the cheek
  if (sob) for (let k = 0; k < 3; k++) dot(out, ex - g.side, ey + 1 + k + out.dy, k === (t >> 1) % 3 ? WHITE : TEAR)
  const age = t - 37
  if (age >= 0 && age < 6) spark(out, ex - g.side, ey, [1, 2, 2, 1, 1, 0][age], c)
}

const MEMENTO_GONE = 14
const MEMENTO_WRAP = 28
const MEMENTO_BACK = 40

// Collapse into shadow and fade away. The mon's spirit drifts over to the target and
// coils around it, wringing its strength down, then the mon fades back in.
function memento(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  if (t < MEMENTO_GONE) {
    const f = easeIn(phase(t, 2, MEMENTO_GONE))
    out.sy = 1 - 0.4 * f
    out.sx = 1 + 0.15 * f
    out.shade = dissolve(a.seed, phase(t, 6, MEMENTO_GONE), shroud(g, out, c, phase(t, 0, 5)))
  } else if (t < MEMENTO_BACK) out.hidden = true
  else if (t < MEMENTO_BACK + 8) out.shade = dissolve(a.seed, 1 - phase(t, MEMENTO_BACK - 1, MEMENTO_BACK + 7), tint(deep, 0.5 * (1 - phase(t, MEMENTO_BACK, MEMENTO_BACK + 8))))
  const tx = fit(g, g.target.x, 6)
  const ty = clamp(g.target.y, 5, g.ground - 3)
  // The spirit: a wisp with a tail, rising from the body and drifting to the target
  if (t >= 8 && t < MEMENTO_WRAP) {
    const f = easeInOut(phase(t, 10, MEMENTO_WRAP))
    const x = lerp(g.cx, tx, f)
    const y = lerp(g.bottom - 3, ty - 3, f) - Math.sin(f * Math.PI) * 5
    for (let k = 1; k <= 4; k++) {
      const tail = phase(t - k, 10, MEMENTO_WRAP)
      const px = lerp(g.cx, tx, easeInOut(tail))
      const py = lerp(g.bottom - 3, ty - 3, easeInOut(tail)) - Math.sin(easeInOut(tail) * Math.PI) * 5 + Math.sin(t + k) * 0.6
      dot(out, px, py + k * 0.3, k < 3 ? lit : c)
    }
    disc(out, x, y, 2.2, light(c, 0.5))
    disc(out, x, y, 1.4, c)
    dot(out, x - 1, y - 1, WHITE)
  }
  // The wisp coils tight around the target, and two arrows sink down through it
  const age = t - MEMENTO_WRAP
  if (age >= 0 && age < 20) {
    const r = keys(age, [[0, 9], [5, 5, easeOut], [14, 5], [20, 1, easeIn]])
    const paint = sparse(a.seed, phase(age, 14, 20))
    // Two turns of a coil, the near half over the target and the far half behind it
    for (let k = 0; k < 40; k++) {
      const ang = (k / 20) * TAU + age * 0.5
      const x = tx + Math.cos(ang) * r * 1.3
      const y = ty + Math.sin(ang) * r * 0.5 + (k - 20) * 0.3
      const near = Math.sin(ang) > 0
      paint(out, x, y + 1, deep)
      if (near) paint(out, x, y, k % 7 === 0 ? WHITE : hi)
      else back(out, x, y, c)
    }
    for (const [d, delay] of [[-4, 4], [4, 7]]) {
      const k = age - delay
      if (k < 0 || k >= 9) continue
      const y = ty - 6 + k * 1.3
      for (const [dy, col] of [[-1, dark(c, 0.5)], [0, light(c, 0.45)]]) {
        line(out, tx + d - 3, y - 3 + dy, tx + d, y + dy, col)
        line(out, tx + d, y + dy, tx + d + 3, y - 3 + dy, col)
      }
    }
  }
}

const LASHES = [12, 22, 32]

// Crack a whip of shadow three times, each lash rearing higher over the head and
// snapping onto the target harder than the last
function punishment(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const hx = g.mouth.x
  const hy = g.mouth.y + 2
  const tx = fit(g, g.target.x, 4)
  const ty = g.target.y
  const back = { x: hx - g.side * 5, y: Math.max(1, g.top - 3) }
  const slack = { x: g.ahead(Math.max(3, Math.round(g.reach * 0.5))), y: g.ground - 1 }
  const xs = [[0, hx + g.side]]
  const ys = [[0, hy]]
  const bends = [[0, 0]]
  const leans = [[0, 0]]
  LASHES.forEach((l, k) => {
    xs.push([l - 4, back.x], [l, tx, easeIn], [l + 2, tx], [l + 5, slack.x])
    ys.push([l - 4, back.y], [l, ty, easeIn], [l + 2, ty], [l + 5, slack.y])
    bends.push([l - 4, -4 - k * 2], [l, 4 + k, easeIn], [l + 3, 2])
    leans.push([l - 4, -2 - k * 0.5], [l, 2 + k * 0.5, easeIn], [l + 3, 1])
  })
  xs.push([42, hx + g.side])
  ys.push([42, hy])
  bends.push([42, 0])
  leans.push([40, 0])
  out.skew = leanAhead(g, keys(t, leans))
  const tip = { x: keys(t, xs), y: clamp(keys(t, ys), 0, g.ground) }
  const bend = keys(t, bends)
  const mx = (hx + tip.x) / 2
  const my = Math.min(g.ground, (hy + tip.y) / 2 + bend)
  const n = 30
  for (let k = 0; k <= n; k++) {
    const s = k / n
    const x = (1 - s) ** 2 * hx + 2 * (1 - s) * s * mx + s * s * tip.x
    const y = (1 - s) ** 2 * hy + 2 * (1 - s) * s * my + s * s * tip.y
    dot(out, x, y + 1, deep)
    dot(out, x, y, s > 0.85 ? lit : c)
  }
  LASHES.forEach((l, k) => {
    const age = t - l
    if (age < 0 || age >= 8) return
    if (age < 3) {
      burst(out, tip.x, tip.y, 3 + k - age, dark(c, 0.5))
      burst(out, tip.x, tip.y, 2 + k - age, age ? hi : WHITE)
    }
    if (age < 2 + k) out.shake = [age % 2 ? -g.side : g.side, k === 2 && age === 0 ? 1 : 0]
    debris(out, t, a, tip.x, tip.y, { start: l, count: 3 + k * 2, life: 8, spread: 3.4, speed: 1, fall: 0.06, salt: k * 5 }, [WHITE, hi, c])
  })
}

const FLING_THROW = 10
const FLING_LAND = 22

// Rear back and hurl a spinning bundle high in an arc. It comes down on the target
// with a thud and a spray of dust and splinters.
function fling(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [7, -2], [FLING_THROW - 1, -2], [FLING_THROW, 2, easeIn], [FLING_THROW + 4, 1], [20, 0]]))
  out.sy = keys(t, [[0, 1], [7, 0.9], [FLING_THROW - 1, 0.9], [FLING_THROW, 1.08], [FLING_THROW + 3, 1]])
  out.skew = leanAhead(g, keys(t, [[0, 0], [7, -3], [FLING_THROW - 1, -3], [FLING_THROW, 3, easeIn], [FLING_THROW + 4, 1], [20, 0]]))
  const tx = fit(g, g.target.x, 4)
  const ty = Math.min(g.target.y, g.ground - 3)
  const sx = g.mouth.x - g.side
  const sy = g.top + 1
  let p = { x: sx - g.side * 2, y: sy + 1 }
  let spin = 0
  if (t >= FLING_THROW && t < FLING_LAND) {
    const f = phase(t, FLING_THROW, FLING_LAND)
    const peak = -4
    p = { x: lerp(sx, tx, f), y: (1 - f) ** 2 * sy + 2 * (1 - f) * f * peak + f * f * ty }
    spin = t
    for (let k = 1; k <= 3; k++) {
      const q = phase(t - k, FLING_THROW, FLING_LAND)
      dot(out, lerp(sx, tx, q) - g.side * 2, Math.max(3, (1 - q) ** 2 * sy + 2 * (1 - q) * q * peak + q * q * ty), k === 1 ? lit : c)
    }
  }
  if (t >= 3 && t < FLING_LAND) {
    // A tied bundle, turning a quarter every other tick
    const r = 2.5
    p.y = Math.max(3, p.y)
    const ang = Math.floor(spin / 2) * (Math.PI / 4)
    const buf = shape()
    disc(buf, p.x, p.y, r, c)
    dot(buf, p.x - 1, p.y - 1, hi)
    const kx = Math.round(Math.cos(ang) * 2)
    const ky = Math.round(Math.sin(ang) * 2)
    dot(buf, p.x + kx, p.y + ky, WHITE)
    dot(buf, p.x - kx, p.y - ky, deep)
    rimmed(out, buf.dots, dark(c, 0.6))
  }
  const age = t - FLING_LAND
  if (age >= 0 && age < 3) out.shake = [[0, 2], [g.side, -1], [0, 1]][age]
  smack(out, tx, ty, age, 5, c)
  debris(out, t, a, tx, ty, { start: FLING_LAND, count: 12, life: 12, spread: 2.8, speed: 1.3, fall: 0.14 }, [WHITE, hi, c, deep])
  debris(out, t, a, tx, g.ground - 1, { start: FLING_LAND, count: 8, life: 9, angle: -Math.PI / 2, spread: 3, speed: 0.8, fall: 0.05, salt: 40 }, [0xeadcc0, 0xc8b28e, 0x9a8668])
}

const FOUL_RISE = [8, 18]
const FOUL_HIT = 20
const FOUL_SINK = [28, 38]

// The mon's shadow slips off along the ground to the target, rises there as a dark
// double, and turns the blow back on it before sinking away
function foulplay(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const dim = phase(t, 0, 5) * (1 - phase(t, 34, 42))
  if (dim > 0) out.shade = shroud(g, out, c, dim)
  if (t >= FOUL_RISE[0] && t < FOUL_SINK[0]) out.dy = t >= FOUL_HIT - 2 && t < FOUL_HIT + 3 ? -1 : 0
  const tx = fit(g, g.target.x, 6)
  const ty = g.target.y
  const half = Math.max(3, Math.round((g.right - g.left) / 2))
  // A pool of shadow runs from the feet to under the target
  const run = easeOut(phase(t, 2, FOUL_RISE[0]))
  const fade = phase(t, 36, 44)
  if (run > 0 && fade < 1) {
    const paint = sparse(a.seed, fade)
    const fx = lerp(g.cx, tx, run)
    for (let x = Math.min(g.cx, fx); x <= Math.max(g.cx, fx); x++) {
      if (Math.abs(x - fx) > half + 1 && t >= FOUL_RISE[0] + 2) continue
      paint(out, x, g.ground, deep)
    }
    for (let x = -half - 1; x <= half + 1; x++) {
      paint(out, fx + x, g.ground, Math.abs(x) > half ? lit : deep)
      if (Math.abs(x) < half) paint(out, fx + x, g.ground - 1, Math.abs(x) === half - 1 ? lit : BLACK)
    }
  }
  // The double: a ghost of the sprite rising out of the pool over the target
  const up = keys(t, [[FOUL_RISE[0], 1], [FOUL_RISE[1], 0, easeOut], [FOUL_HIT - 1, 0], [FOUL_HIT, -0.25, easeIn], [FOUL_HIT + 3, 0], [FOUL_SINK[0], 0], [FOUL_SINK[1], 1, easeIn]])
  if (t >= FOUL_RISE[0] && t < FOUL_SINK[1]) {
    const height = g.bottom - g.top + 1
    const dy = Math.round(up * height)
    const red = t % 4 < 2 ? 0xff3050 : 0xff8090
    out.ghosts = [{
      dx: Math.round(tx - g.cx),
      dy,
      flip: true,
      shade: (col, x, y) => (y > g.ground - 1 ? null : luma(col) > 190 ? red : luma(col) < 60 ? lit : mix(col, deep, 0.85)),
    }]
  }
  if (t >= FOUL_HIT && t < FOUL_HIT + 4) out.shake = [[0, 2], [g.side * 2, -1], [-g.side, 1], [g.side, 0]][t - FOUL_HIT]
  const age = t - FOUL_HIT
  smack(out, tx, ty - 1, age, 6, c)
  if (age >= 1 && age < 6) {
    for (const d of [-1, 1]) line(out, tx + d * 2, ty + 3, tx + d * (3 + age), ty - 3 - age, age < 3 ? WHITE : hi)
  }
  debris(out, t, a, tx, ty, { start: FOUL_HIT, count: 10, life: 10, spread: 2.4, speed: 1.3, fall: 0.1 }, [WHITE, hi, c, deep])
}

const THIEF_GRAB = 10
const THIEF_HOME = 22
const COIN = 0xffcc33

// Pull on a bandit's mask and dart in. A quick swipe pops a gold coin off the target,
// and the mon scampers home with it bouncing overhead before pocketing it.
function thief(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const far = clamp(Math.abs(g.target.x - g.mouth.x) - 3, 0, 14)
  const dash = keys(t, [[0, 0], [3, -1], [THIEF_GRAB - 2, -1], [THIEF_GRAB, far, easeIn], [THIEF_GRAB + 2, far], [THIEF_HOME, 0, easeInOut]])
  out.dx = Math.round(g.side * dash)
  out.sy = t >= 3 && t < THIEF_HOME ? 0.9 : 1
  out.sx = t >= 3 && t < THIEF_HOME ? 1.06 : 1
  out.skew = leanAhead(g, keys(t, [[0, 0], [3, -1], [THIEF_GRAB, 2], [THIEF_GRAB + 2, -1], [THIEF_HOME, -1], [THIEF_HOME + 4, 0]]))
  if (t >= THIEF_GRAB - 1 && t < THIEF_GRAB + 1) out.ghosts = [ghost(Math.round(g.side * far * 0.5), 0, deep, 0.6)]
  // The mask: a dark band across the eyes, laced with a bright edge
  const mask = phase(t, 1, 3) * (1 - phase(t, 32, 35))
  if (mask > 0) {
    const my = g.mouth.y - 2
    const at = (y) => y - out.dy
    out.shade = (x, y, col) => {
      const by = at(y)
      if (by === my || by === my + 1) return mix(col, 0x1a1428, 0.85 * mask)
      if (by === my - 1) return mix(col, lit, 0.5 * mask)
      return col
    }
  }
  if (t === THIEF_GRAB) out.shake = [g.side, 0]
  const tx = fit(g, g.target.x, 3)
  const ty = g.target.y
  if (t >= THIEF_GRAB && t < THIEF_GRAB + 4) {
    const k = t - THIEF_GRAB
    for (const d of [-2, 0, 2]) line(out, tx - g.side * 2 + d, ty - 3, tx + g.side * 2 + d, ty + 3, k < 2 ? WHITE : lit, sparse(a.seed, k / 4))
  }
  // The coin: popped up off the target, then riding bouncing over the mon's head
  if (t >= THIEF_GRAB && t < 36) {
    let x
    let y
    if (t < THIEF_GRAB + 3) {
      const f = phase(t, THIEF_GRAB, THIEF_GRAB + 3)
      x = tx
      y = ty - 2 - f * 5
    } else {
      x = g.cx + out.dx
      y = Math.max(3, g.top - 3) - (Math.floor(t / 2) % 2)
    }
    if (t >= 30) {
      sparkles(out, t, a.seed, x, y, 6, 4, COIN, 3)
      if (t < 33) spark(out, x, y, 33 - t, COIN)
    } else {
      // The coin flips, showing its face, then its edge
      const edge = Math.floor(t / 2) % 3 === 0
      if (edge) {
        line(out, x - 1, y - 2, x - 1, y + 2, dark(COIN, 0.5))
        line(out, x, y - 2, x, y + 2, COIN)
        line(out, x + 1, y - 2, x + 1, y + 2, dark(COIN, 0.5))
      } else {
        disc(out, x, y, 2.2, dark(COIN, 0.5))
        disc(out, x, y, 1.5, COIN)
        dot(out, x - 1, y - 1, WHITE)
      }
    }
  }
}

const DAZE_BLAST = 12

// Brood in a crimson shadow, then burst out a dome of pitch dark that swallows the
// ground ahead, its red edge rolling over the target and leaving it reeling
function nightdaze(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const brood = phase(t, 0, 8) * (1 - phase(t, DAZE_BLAST + 18, DAZE_BLAST + 26))
  if (brood > 0) out.shade = rimGlow(g, out, deep, 0.55 * brood, t % 4 < 2 ? hi : lit, 0.8 * brood)
  if (t < DAZE_BLAST) {
    out.sy = 1 - 0.07 * easeIn(phase(t, 3, DAZE_BLAST))
    if (t >= 6) out.dx = tremble(t)
  } else if (t < DAZE_BLAST + 3) {
    out.sy = 1.08
    out.shade = tint(WHITE, 0.5)
  }
  emit(t, { count: 10, gap: 0.8, start: 1, life: 7 }, (i, age, f) => {
    const ang = (i / 10) * TAU + rnd(a.seed, i, 6)
    const r = ((g.right - g.left) / 2 + 6) * (1 - easeIn(f))
    dot(out, g.cx + Math.cos(ang) * r, g.cy + Math.sin(ang) * r * 0.7, f < 0.5 ? lit : c)
  })
  const age = t - DAZE_BLAST
  if (age >= 0 && age < 9) out.shake = [Math.round((age % 2 ? 2 : -2) * (1 - age / 9)), age % 3 === 0 ? 1 : 0]
  const cx = g.mouth.x
  const cy = g.ground
  const far = Math.max(g.reach + 4, 12)
  // Only the half of the dome ahead of the mon, so it never buries the body
  const ahead = (x) => (x - cx) * g.side >= -1
  const paint = inStrip(g, (o, x, y, col) => ahead(x) && dot(o, x, y, col))
  if (age >= 0 && age < 24) {
    const r = far * easeOut(phase(age, 0, 10)) + 2
    const gone = phase(age, 14, 24)
    const fill = inStrip(g, (o, x, y, col) => ahead(x) && back(o, x, y, col))
    // The dome's body, dithered so the sprites show through it, behind the sprites
    for (let y = Math.max(0, Math.floor(cy - r * 0.8)); y <= cy; y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, (y - cy) / 0.8)
        if (d > r - 1 || (x + y + age) % 2) continue
        if (rnd(a.seed, x * 17 + y, 3) < gone + d / (r * 3)) continue
        fill(out, x, y, (x * 3 + y) % 5 ? deep : BLACK)
      }
    }
    // Its rim, a crackling red edge rolling outward
    const steps = Math.ceil(r * 4)
    for (let k = 0; k <= steps; k++) {
      const ang = Math.PI + (k / steps) * Math.PI
      const jag = rnd(a.seed, k, age) * 1.2
      const x = cx + Math.cos(ang) * (r + jag)
      const y = cy + Math.sin(ang) * (r + jag) * 0.8
      if (rnd(a.seed, k, 40) < gone) continue
      paint(out, x, y, age < 3 ? WHITE : k % 3 ? hi : c)
      paint(out, x, y + 1, dark(c, 0.4))
    }
  }
  // Dazed: small crimson spirals turning over the target
  const tx = fit(g, g.target.x, 5)
  const hy = Math.max(3, g.target.y - 6)
  if (age >= 8 && age < 34) {
    const f = phase(age, 8, 11) * (1 - phase(age, 28, 34))
    for (const d of [-3, 3]) {
      for (let k = 0; k < 7; k++) {
        const ang = k * 0.9 + t * 0.5 * Math.sign(d)
        const r = (k / 7) * 2.2 * f
        dot(out, tx + d + Math.cos(ang) * r * 1.2, hy + Math.sin(ang) * r, k > 4 ? WHITE : hi)
      }
    }
  }
}

const BEAT_HITS = [13, 20, 27, 34]
const MATES = [0xd09a5a, 0x7ab0e0, 0xe08ac0, 0x8ac87a]
const BEAT_LEAP = 7

// Rally the team: shadowy allies leap in from behind one after another, each landing
// a blow on the target, while the mon cheers them on
function beatup(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const tx = fit(g, g.target.x, 5)
  const ty = g.target.y
  const half = (g.right - g.left) / 2
  // Where an ally stands to hit: its front at the target
  const strike = Math.round(tx - g.cx - g.side * (half + 1))
  const cheer = BEAT_HITS.some((h) => t >= h && t < h + 2)
  out.dy = cheer ? -1 : 0
  out.skew = leanAhead(g, cheer ? 1.5 : 0)
  const ghosts = []
  BEAT_HITS.forEach((h, k) => {
    const age = t - (h - BEAT_LEAP)
    if (age < 0 || age >= BEAT_LEAP + 4) return
    const f = phase(age, 0, BEAT_LEAP)
    const from = -g.side * (half + 3)
    const dx = Math.round(lerp(from, strike, easeIn(f)))
    const dy = Math.round(-Math.sin(f * Math.PI) * 7)
    const mate = MATES[k]
    const gone = phase(age, BEAT_LEAP + 1, BEAT_LEAP + 4)
    ghosts.push({
      dx: age >= BEAT_LEAP ? strike + g.side : dx,
      dy: age >= BEAT_LEAP ? 0 : dy,
      shade: (col, x, y) => (rnd(a.seed, x * 31 + y, k) < gone ? null : luma(col) < 60 ? dark(mate, 0.6) : mix(col, mix(mate, deep, 0.3), 0.7)),
    })
    smack(out, tx, ty - 1, age - BEAT_LEAP, 4 + (k === 3 ? 2 : 0), mate)
    if (age === BEAT_LEAP) out.shake = [g.side * (k === 3 ? 2 : 1), k === 3 ? 1 : 0]
  })
  out.ghosts = ghosts
  const last = t - BEAT_HITS[3]
  if (last >= 1 && last < 8) ring(out, tx, ty - 1, 2 + last * 1.5, last < 4 ? hi : c, 0, Math.PI, sparse(a.seed, phase(last, 4, 8)))
}

const VOID_OPEN = 14
const VOID_SHUT = 36
const SLEEP_Z = ['zzzz', '..z.', '.z..', 'zzzz']
const SLEEP_BIG_Z = ['zzzzz', '...z.', '..z..', '.z...', 'zzzzz']

// Raise a hand and tear open a spinning black hole over the target. Its arms swirl
// in faster and faster, then it snaps shut and the target nods off.
function darkvoid(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const dim = phase(t, 0, 5) * (1 - phase(t, VOID_SHUT + 4, VOID_SHUT + 10))
  if (dim > 0) out.shade = shroud(g, out, c, dim)
  out.dy = t >= 3 && t < VOID_SHUT ? -1 : 0
  out.skew = leanAhead(g, keys(t, [[0, 0], [4, 2], [VOID_SHUT, 2], [VOID_SHUT + 4, 0]]))
  const tx = fit(g, g.target.x, 8)
  const ty = clamp(g.target.y, 7, g.ground - 5)
  const most = clamp(halfSpan(g) + 4, 8, 10)
  const r = keys(t, [[4, 0], [VOID_OPEN, most, easeOut], [VOID_SHUT - 2, most], [VOID_SHUT, 0, easeIn]])
  if (r > 0.5) {
    const speed = 0.15 + phase(t, 4, VOID_SHUT) * 0.45
    const spin = (t * (t * speed)) / 10
    // Three thick arms curling in toward the core, drawn as a dark mass behind a
    // bright leading edge
    for (let arm = 0; arm < 3; arm++) {
      for (let k = 0; k < 22; k++) {
        const f = k / 22
        const ang = spin + (arm * TAU) / 3 + f * 2.8
        const rr = r * (0.3 + f * 0.7)
        const x = tx + Math.cos(ang) * rr
        const y = ty + Math.sin(ang) * rr * 0.6
        const w = 1 + (1 - f) * 0.8
        disc(out, x, y, w, f < 0.5 ? deep : dark(c, 0.6))
        dot(out, x, y - 1, f < 0.35 ? WHITE : f < 0.7 ? lit : c)
      }
    }
    disc(out, tx, ty, Math.max(0.5, r * 0.3), BLACK)
    ring(out, tx, ty, r * 0.3 + 0.8, hi)
    // Specks pulled in by the hole
    emit(t, { count: 14, gap: 1.4, start: 6, life: 6 }, (i, age, f) => {
      if (t >= VOID_SHUT) return
      const ang = rnd(a.seed, i, 8) * TAU - f * 2
      const rr = (most + 4) * (1 - f)
      dot(out, tx + Math.cos(ang) * rr, ty + Math.sin(ang) * rr * 0.65, f < 0.5 ? WHITE : lit)
    })
  }
  const age = t - VOID_SHUT
  if (age >= 0 && age < 3) burst(out, tx, ty, 4 - age, lit)
  if (age === 0) out.shake = [0, 1]
  emit(t, { count: 3, gap: 4, start: VOID_SHUT + 2, life: 10 }, (i, life, f) => {
    if (f > 0.8 && t % 2) return
    const x = tx + 2 + i * 2 + Math.sin(life * 0.6) * 1
    const y = ty - 4 - life * 0.8
    if (y < 1) return
    const buf = shape()
    stamp(buf, x, y, i === 1 ? SLEEP_BIG_Z : SLEEP_Z, { z: light(c, 0.6) })
    rimmed(out, buf.dots, dark(c, 0.55))
  })
}

export const DARK = {
  crunch: { ticks: 38, color: 0x7a5aa0, draw: crunch },
  feintattack: { ticks: 40, color: 0x8a6ab8, draw: feintattack },
  pursuit: { ticks: 30, color: 0x6a5a8a, pose: (t) => ({ stride: t >= 4 && t < PURSUIT_HIT }), draw: pursuit },
  taunt: { ticks: 40, color: 0x9a3a5a, draw: taunt },
  assurance: { ticks: 38, color: 0x7a6ab0, draw: assurance },
  nastyplot: { ticks: 48, color: 0x8a4ac0, pose: { view: 'front' }, draw: nastyplot },
  embargo: { ticks: 42, color: 0x8a8ab8, draw: embargo },
  knockoff: { ticks: 40, color: 0x8a6a9a, draw: knockoff },
  nightslash: { ticks: 34, color: 0x6a4a9a, draw: nightslash },
  torment: { ticks: 42, color: 0xb03a6a, draw: torment },
  suckerpunch: { ticks: 26, color: 0x7a5aa8, draw: suckerpunch },
  darkpulse: { ticks: 44, color: 0x7a3ac0, draw: darkpulse },
  payback: { ticks: 40, color: 0x7a3a5a, draw: payback },
  snatch: { ticks: 40, color: 0x6a5a9a, draw: snatch },
  flatter: { ticks: 46, color: 0xff9ad0, draw: flatter },
  honeclaws: { ticks: 46, color: 0xb8b0d8, pose: { view: 'front' }, draw: honeclaws },
  faketears: { ticks: 44, color: 0x8a4ab0, draw: faketears },
  memento: { ticks: 50, color: 0x6a5a8a, draw: memento },
  punishment: { ticks: 44, color: 0x9a4a8a, draw: punishment },
  fling: { ticks: 36, color: 0x9a7a5a, draw: fling },
  foulplay: { ticks: 46, color: 0x6a4a9a, draw: foulplay },
  thief: { ticks: 38, color: 0x6a6a8a, draw: thief },
  nightdaze: { ticks: 50, color: 0xa02a4a, draw: nightdaze },
  beatup: { ticks: 44, color: 0x7a5a9a, draw: beatup },
  darkvoid: { ticks: 50, color: 0x5a3a8a, draw: darkvoid },
}
