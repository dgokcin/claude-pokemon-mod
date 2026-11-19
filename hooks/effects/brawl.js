// Normal brawling: reckless charges, grabs, feints and dirty tricks

import {
  WHITE, back, ball, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, keys, lerp, light, line,
  linear, mix, phase, plus, puff, ramp, rimGlow, rnd, baseAt, shownAt, spark, sparkles, stamp, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const DUST = 0xcbb48c
const STONE = 0x9a8468
const HURT = 0xff3a2a
const GLOOM = 0x5a5a6a
const SWEAT = ['.s.', 'sss', 'sws', '.s.']
const SWEAT_PAL = { s: 0x5fb4ff, w: WHITE }

// How far a dash carries the mon, at most `most` pixels and short of the target
const travel = (g, most, margin = 4) => clamp(g.reach - margin, 2, most)
const fitX = (g, x, half = 3) => clamp(Math.round(x), half, g.columns - 1 - half)
const fitY = (g, y, half = 3) => clamp(Math.round(y), half, g.ground - half)
// The x of a blow struck once the body has carried `far` pixels forward
const hitX = (g, far) => fitX(g, g.ahead(far + 1), 4)
// Half the height a shape around the target can take inside the strip
const span = (g) => clamp(Math.round((g.ground - 3) * 0.4), 4, 6)
const hop = (t, from, to, high) => (t >= from && t < to ? -Math.round(Math.sin(phase(t, from, to) * Math.PI) * high) : 0)
const width = (g) => g.right - g.left + 1
const height = (g) => g.bottom - g.top + 1

// A paint that drops pixels outside the strip
const keep = (g, paint = dot) => (out, x, y, c) => {
  if (x >= 0 && x <= g.columns - 1 && y >= 0 && y <= g.ground) paint(out, x, y, c)
}

// A paint that keeps every other pixel, for things breaking up as they fade
const dotted = (paint = dot) => (out, x, y, c) => {
  if ((Math.round(x) + Math.round(y)) % 2) paint(out, x, y, c)
}

function squash(out, s) {
  out.sy = s
  out.sx = 1 + (1 - s) * 0.6
}

function press(out, s) {
  out.sx = s
  out.sy = 1 + (1 - s) * 0.5
}

// Lean the top of the body px pixels toward the target, feet planted. Call after dy.
function lean(out, g, px) {
  if (Math.abs(px) < 0.5) return
  const tall = Math.max(1, g.bottom - g.top)
  const feet = g.bottom + out.dy
  out.skew = (y) => g.side * px * clamp((feet - y) / tall, 0, 1)
}

// The body's foremost pixel between rows y0 and y1
function frontIn(g, y0, y1) {
  for (let x = g.side > 0 ? g.right : g.left; x !== g.cx; x -= g.side) {
    for (let y = y0; y <= y1; y++) if (g.solid(x, y)) return { x, y }
  }
  return { x: g.side > 0 ? g.right : g.left, y: Math.round((y0 + y1) / 2) }
}

const headOf = (g) => frontIn(g, g.top, g.top + Math.round((g.bottom - g.top) * 0.55))
const heelOf = (g) => (g.side > 0 ? g.left : g.right)

// Where the middle of the body shows this frame
const middle = (g, out) => shownAt(g, out, g.cx, g.cy)

// Whether the body covers a strip pixel this frame
function covers(g, out) {
  const at = baseAt(g, out)
  return (x, y) => {
    const [bx, by] = at(x, y)
    return g.solid(bx, by)
  }
}

// An outline hugging the body's silhouette d pixels out, behind the sprite
function halo(out, g, d, c, paint = back) {
  const on = covers(g, out)
  const a = shownAt(g, out, g.left, g.top)
  const b = shownAt(g, out, g.right, g.bottom)
  const p = keep(g, paint)
  const near = (x, y, r) => {
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (Math.abs(ox) + Math.abs(oy) <= r && on(x + ox, y + oy)) return true
    return false
  }
  for (let y = Math.min(a.y, b.y) - d - 1; y <= Math.max(a.y, b.y) + d + 1; y++) {
    for (let x = Math.min(a.x, b.x) - d - 2; x <= Math.max(a.x, b.x) + d + 2; x++) {
      if (near(x, y, d - 1) || !near(x, y, d)) continue
      p(out, x, y, c)
    }
  }
}

// Afterimages on the spots the body held over the last n ticks
function trail(t, n, at, c) {
  const [x0, y0] = at(t)
  const list = []
  for (let k = 1; k <= n; k++) {
    const [dx, dy] = at(t - k)
    if (Math.abs(dx - x0) + Math.abs(dy - y0) >= 2) list.push(ghost(dx, dy, c, 0.35 + (0.45 * k) / n))
  }
  return list
}

// Speed lines behind a body that moved from dx `from` to dx `to`
function rush(out, t, g, from, to, hi, lo, paint = back) {
  const dir = Math.sign(to - from) || g.side
  const lead = (dir > 0 ? g.right : g.left) + to
  const tail = (dir > 0 ? g.left : g.right) + from - dir * 3
  const rows = clamp(Math.round(height(g) / 4), 2, 5)
  const p = keep(g, paint)
  for (let k = 0; k < rows; k++) {
    const y = g.top + 1 + Math.round(((g.bottom - g.top - 2) * (k + 0.5)) / rows)
    const head = lead - dir * ((k * 3 + t) % 3)
    const len = Math.abs(head - tail)
    for (let d = 0; d <= len; d++) {
      const f = d / Math.max(1, len)
      if (f > 0.5 && (d + k + t) % 3 === 0) continue
      p(out, head - dir * d, y, f < 0.15 ? WHITE : f < 0.55 ? hi : lo)
    }
  }
}

// A spiky comic impact with a white heart and a dark rim; flat squashes it
function bang(out, g, x, y, r, c, { points = 8, spin = 0, flat = 1 } = {}) {
  const lit = light(c, 0.55)
  const rim = dark(c, 0.5)
  const p = keep(g)
  for (let py = Math.floor(y - (r + 1) * flat); py <= Math.ceil(y + (r + 1) * flat); py++) {
    for (let px = Math.floor(x - r - 1); px <= Math.ceil(x + r + 1); px++) {
      const ux = px - x
      const uy = (py - y) / flat
      const d = Math.hypot(ux, uy)
      const s = ((((Math.atan2(uy, ux) - spin) / TAU) * points) % 1 + 1) % 1
      const edge = r * lerp(0.45, 1, Math.abs(s - 0.5) * 2)
      if (d > edge + 0.7) continue
      p(out, px, py, d > edge ? rim : d < edge * 0.4 ? WHITE : d < edge * 0.7 ? lit : c)
    }
  }
}

// An ellipse outline, its far half behind the sprite when `behind` is set
function oval(out, g, x, y, rx, ry, c, behind = false, paint = dot) {
  const steps = Math.max(12, Math.ceil(Math.max(rx, ry) * 7))
  const front = keep(g, paint)
  const rear = keep(g, back)
  for (let k = 0; k < steps; k++) {
    const angle = (TAU * k) / steps
    ;(behind && Math.sin(angle) < 0 ? rear : front)(out, x + rx * Math.cos(angle), y + ry * Math.sin(angle), c)
  }
}

// Dust kicked up off the ground at x, rolling `dir` (both ways when 0)
function dust(out, t, a, g, x, { start, count = 3, life = 10, dir = 0, size = 1.8, salt = 0, paint = back }) {
  emit(t, { count, start, gap: 0, life }, (i, age, f) => {
    if (f > 0.7 && (t + i) % 2) return
    const way = dir || (i % 2 ? 1 : -1)
    const r = size * (0.7 + 0.5 * rnd(a.seed, i, salt)) * (1 - 0.45 * f)
    const px = x + way * (1 + (i >> (dir ? 0 : 1)) * size + age * (0.35 + 0.5 * rnd(a.seed, i, salt + 1)))
    const py = g.ground - r - f * 3 * rnd(a.seed, i, salt + 2)
    puff(out, px, py, r, DUST, a.seed + i + salt, keep(g, paint))
  })
}

// Chips flung up from x, y that fall under gravity and rest on the ground
function chips(out, t, a, g, x, y, { start, count = 6, life = 14, speed = 1, dir = 0, c = STONE, salt = 0 }) {
  const [hi, , base, rim] = ramp(c)
  const p = keep(g)
  emit(t, { count, start, gap: 0, life }, (i, age, f) => {
    const way = dir || (rnd(a.seed, i, salt) < 0.5 ? -1 : 1)
    const vx = way * (0.3 + rnd(a.seed, i, salt + 1) * 0.9) * speed
    const vy = -(0.6 + rnd(a.seed, i, salt + 2) * 0.9) * speed
    const px = x + vx * age
    const py = Math.min(g.ground, y + vy * age + 0.12 * age * age)
    p(out, px, py, f < 0.3 ? hi : base)
    if (i % 2 === 0) p(out, px + 1, py, rim)
  })
}

// Pixel art with a dark outline around it, so it reads over anything
function badge(out, g, x, y, art, pal, edge, flip = false) {
  const solid = Object.fromEntries(Object.keys(pal).map((k) => [k, edge]))
  const p = keep(g)
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stamp(out, x + ox, y + oy, art, solid, flip, p)
  stamp(out, x, y, art, pal, flip, p)
}

// A thick rounded stroke along a list of points, its radius going r0 to r1: dark rim,
// the color, then a light core
function tube(out, g, pts, r0, r1, c, paint = dot) {
  const p = keep(g, paint)
  const layers = [[0, dark(c, 0.55)], [0.7, c], [1.3, light(c, 0.5)]]
  for (const [inset, col] of layers) {
    pts.forEach(([x, y], k) => {
      const r = lerp(r0, r1, k / Math.max(1, pts.length - 1)) - inset
      if (r > 0.2) disc(out, x, y, r, col, p)
      else if (inset === 0) p(out, x, y, col)
    })
  }
}

// A crescent swept around (x, y) from angle a0 to a1 (screen angles), white at the lead
function swipe(out, g, x, y, r, a0, a1, c, thick = 2) {
  const p = keep(g)
  const steps = Math.ceil(Math.abs(a1 - a0) * r * 1.6) + 2
  for (let k = 0; k <= steps; k++) {
    const f = k / steps
    const angle = lerp(a0, a1, f)
    const col = f > 0.85 ? WHITE : f > 0.55 ? light(c, 0.45) : f > 0.25 ? c : dark(c, 0.35)
    for (let w = 0; w <= Math.round(thick * f); w++) p(out, x + Math.cos(angle) * (r + w), y + Math.sin(angle) * (r + w), col)
  }
}

// A screen angle drawn facing right, turned to face the attack side
const turn = (g, angle) => (g.side > 0 ? angle : Math.PI - angle)

// A heart of size s centered on x, y; only its rim when `hollow`
function heart(out, g, x, y, s, c, hollow = false) {
  const [hi, lit, , deep] = ramp(c)
  const p = keep(g)
  const inside = (px, py) => {
    const u = (px - x) / s
    const v = -(py - y) / s + 0.1
    return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0
  }
  for (let py = Math.floor(y - s * 1.4); py <= Math.ceil(y + s * 1.4); py++) {
    for (let px = Math.floor(x - s * 1.3); px <= Math.ceil(x + s * 1.3); px++) {
      if (!inside(px, py)) continue
      const rim = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1)
      if (hollow) {
        if (rim) p(out, px, py, lit)
        continue
      }
      const u = (px - x) / s
      const v = -(py - y) / s
      p(out, px, py, rim ? deep : u < -0.3 && v > 0.3 ? hi : u < 0.15 && v > -0.1 ? lit : c)
    }
  }
}

// A crackling zigzag from (x0, y0) to (x1, y1)
function zig(out, g, x0, y0, x1, y1, n, amp, c, seed) {
  let prev = [x0, y0]
  const nx = -(y1 - y0)
  const ny = x1 - x0
  const len = Math.hypot(nx, ny) || 1
  for (let k = 1; k <= n; k++) {
    const f = k / n
    const off = k === n ? 0 : (rnd(seed, k) - 0.5) * 2 * amp
    const p = [lerp(x0, x1, f) + (nx / len) * off, lerp(y0, y1, f) + (ny / len) * off]
    line(out, prev[0], prev[1], p[0], p[1], c, keep(g))
    prev = p
  }
}

const EDGE_GO = 12
const EDGE_HIT = 17
const EDGE_FLUNG = 24
const EDGE_HOME = 46

const edgePos = (t, far) => keys(t, [
  [0, 0], [8, -2, easeOut], [EDGE_GO, -2], [EDGE_HIT, far, easeIn], [EDGE_FLUNG, -2, easeOut], [36, -2], [EDGE_HOME, 0, easeInOut],
], linear)

// Blaze up in a doubled outline, charge flat out and smash through with twin shock
// rings, then the recoil flings the mon back past its spot, crackling with hurt
function doubleedge(out, t, a, g, c) {
  const far = travel(g, 12, 5)
  const at = (k) => [Math.round(g.side * edgePos(k, far)), hop(k, EDGE_HIT + 1, EDGE_FLUNG + 2, 4)]
  ;[out.dx, out.dy] = at(t)
  if (t < EDGE_GO) squash(out, 1 - 0.12 * easeOut(phase(t, 0, 8)))
  else if (t < EDGE_HIT) press(out, 1.14)
  else if (t < EDGE_HIT + 2) press(out, t === EDGE_HIT ? 0.74 : 0.88)
  else if (t >= EDGE_FLUNG + 2 && t < EDGE_FLUNG + 5) squash(out, [0.8, 0.9, 1.04][t - EDGE_FLUNG - 2])
  else if (t >= 30 && t < 40) squash(out, 0.94 + 0.06 * phase(t, 30, 40))
  if (t < EDGE_GO) lean(out, g, 2)
  else if (t < EDGE_HIT) lean(out, g, 3)
  else if (t < EDGE_FLUNG) lean(out, g, -3)
  else if (t >= 30 && t < 38) lean(out, g, tremble(t))

  const lit = light(c, 0.5)
  if (t >= 3 && t <= EDGE_HIT) {
    if (t >= EDGE_GO) {
      out.ghosts = trail(t, 3, at, lit)
      rush(out, t, g, at(EDGE_GO)[0], out.dx, lit, c)
    }
    out.shade = rimGlow(g, out, c, 0.12 + 0.2 * phase(t, 3, EDGE_GO), WHITE, t % 2 ? 0.85 : 0.5)
    // The doubled blazing outline, two flickering rims hugging the body
    if (t >= 5) {
      halo(out, g, 1, t % 3 ? WHITE : light(c, 0.5))
      halo(out, g, 3, t % 2 ? c : dark(c, 0.2), t >= 8 ? back : dotted(back))
    }
  } else if (t > EDGE_HIT && t <= 34 && (t < EDGE_FLUNG || t % 4 < 2)) out.shade = tint(HURT, t < EDGE_FLUNG ? 0.45 : 0.3)

  const x = hitX(g, far)
  const y = g.mouth.y + 1
  const age = t - EDGE_HIT
  if (age === 0) out.shake = [g.side * 2, 1]
  else if (age > 0 && age < 6) out.shake = [[-2, 0], [1, -1], [-1, 1], [1, 0], [0, -1]][age - 1].map((v, k) => (k ? v : v * g.side))
  if (age >= 0 && age < 5) bang(out, g, x, y, [6, 9, 9, 7, 4][age], c, { spin: age * 0.15 })
  for (let k = 0; k < 2; k++) {
    const ringAge = age - k * 2
    if (ringAge >= 0 && ringAge < 7) {
      oval(out, g, x, y, 3 + ringAge * 1.8, 2 + ringAge * 1.3, ringAge < 3 ? WHITE : lit)
      oval(out, g, x, y, 2 + ringAge * 1.8, 1 + ringAge * 1.3, dark(c, 0.3))
    }
  }
  chips(out, t, a, g, x, y, { start: EDGE_HIT, count: 8, speed: 1.2, c: light(c, 0.2) })

  // Recoil crackles over the mon's own body
  if (t > EDGE_HIT + 1 && t < 33 && t % 4 < 2) {
    const top = shownAt(g, out, g.cx, g.top)
    for (let k = 0; k < 2; k++) {
      const x0 = top.x + (rnd(a.seed, t, k) - 0.5) * width(g)
      zig(out, g, x0, top.y - 3, x0 + (k ? 3 : -3), top.y + 3, 3, 1.2, k ? HURT : WHITE, a.seed + t * 7 + k)
    }
  }
  dust(out, t, a, g, heelOf(g) + out.dx, { start: EDGE_FLUNG + 2, count: 4, life: 10, size: 2, salt: 4 })
}

const FLAIL_HITS = [12, 17, 22, 27]
const FLAIL_END = 32

// Thrash about in a panic, flipping and flopping all over while sweat flies and
// wild blows land all over the target
function flail(out, t, a, g, c) {
  const far = travel(g, 8, 6)
  const live = t >= 4 && t < FLAIL_END
  const jitter = live ? Math.round((rnd(a.seed, t, 1) - 0.5) * 3) : 0
  out.dx = Math.round(g.side * keys(t, [[0, 0], [3, -1], [10, far, easeOut], [30, far], [40, 0]])) + jitter
  out.dy = live ? -Math.round(Math.abs(Math.sin(t * 1.3)) * 2 + rnd(a.seed, t, 2)) : hop(t, FLAIL_END, 40, 1)
  if (live) {
    out.flipX = Math.floor(t / 3) % 3 === 1
    squash(out, t % 3 ? 0.92 : 1.08)
    lean(out, g, (t % 4 < 2 ? 1 : -1) * (2 + Math.round(rnd(a.seed, t, 3) * 2)))
  } else if (t < 4) squash(out, 1 - 0.04 * t)

  // Panicky swipe arcs whirling around the body
  if (live) {
    const m = middle(g, out)
    const r = Math.max(width(g), height(g)) / 2 + 1
    for (let k = 0; k < 2; k++) {
      const a0 = rnd(a.seed, t, 10 + k) * TAU
      const dir = rnd(a.seed, t, 20 + k) < 0.5 ? -1 : 1
      swipe(out, g, m.x, m.y, r + k * 2, a0, a0 + dir * 1.3, c, 1)
    }
  }
  const tx = fitX(g, g.target.x, 5)
  const ty = fitY(g, g.target.y, 5)
  FLAIL_HITS.forEach((h, k) => {
    const age = t - h
    if (age < 0 || age >= 4) return
    const x = tx + (rnd(a.seed, k, 30) - 0.5) * 7
    const y = ty + (rnd(a.seed, k, 31) - 0.5) * 7
    bang(out, g, x, y, [3, 5, 4, 2][age], c, { points: 6, spin: k })
    if (age === 0) out.shake = [g.side * (k % 2 ? -1 : 1), k % 2]
  })
  emit(t, { count: 7, gap: 4, start: 5, life: 8 }, (i, age) => {
    const top = shownAt(g, out, g.cx, g.top)
    const way = i % 2 ? 1 : -1
    const px = top.x + way * (2 + age * (0.8 + rnd(a.seed, i, 40) * 0.5))
    const py = top.y - age * 0.9 + 0.15 * age * age
    stamp(out, px - 1, py - 1, SWEAT, SWEAT_PAL, false, keep(g))
  })
  dust(out, t, a, g, g.cx + out.dx, { start: 6, count: 6, life: 9, size: 1.6, salt: 2 })
  dust(out, t, a, g, g.cx + out.dx, { start: 18, count: 4, life: 9, size: 1.6, salt: 6 })
}

const ENDURE_GO = 16
const ENDURE_HIT = 21
const ENDURE_DRAIN = 12
const BAR = 11
const BAR_FULL = 0x58d858
const BAR_LOW = 0xff4a3a

// A health bar BAR pixels long with its left end at x, filled `fill` pixels
function healthBar(out, g, x, y, fill, glint) {
  const p = keep(g)
  const rim = 0x2a2a34
  const col = mix(BAR_LOW, BAR_FULL, clamp((fill - 2) / (BAR - 2), 0, 1))
  for (let k = -1; k <= BAR; k++) {
    p(out, x + k, y - 1, rim)
    p(out, x + k, y + 1, rim)
  }
  for (let k = 0; k < BAR; k++) p(out, x + k, y, k < fill ? (k === fill - 1 && glint ? WHITE : col) : 0x50505a)
}

// Grit the teeth with a sliver of health left, lunge in, and the blow drains the
// target's health bar down to match the mon's own
function endeavor(out, t, a, g, c) {
  const far = travel(g, 9, 6)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [ENDURE_GO - 2, -2, easeOut], [ENDURE_GO, -2], [ENDURE_HIT, far, easeIn], [ENDURE_HIT + 3, far - 1], [36, 0]]))
  if (t >= 4 && t < ENDURE_GO) out.dx += tremble(t)
  if (t < ENDURE_GO) squash(out, 1 - 0.07 * easeOut(phase(t, 0, 6)))
  else if (t < ENDURE_HIT) press(out, 1.12)
  else if (t < ENDURE_HIT + 2) press(out, t === ENDURE_HIT ? 0.8 : 0.92)
  out.dy = hop(t, 28, 36, 1)
  if (t < ENDURE_GO) lean(out, g, 1.5)
  else if (t < ENDURE_HIT) lean(out, g, 3)
  if (t < ENDURE_HIT + 4) out.shade = rimGlow(g, out, HURT, 0.2, t % 4 < 2 ? HURT : c, 0.65)

  // Grit rising off the body while it strains
  emit(t, { count: 10, gap: 1.4, start: 2, life: 7 }, (i, age, f) => {
    const x = g.left + out.dx + rnd(a.seed, i, 3) * width(g)
    const y = g.bottom - rnd(a.seed, i, 4) * height(g) * 0.6 - age * 1.2
    dot(out, x, y, f < 0.4 ? light(c, 0.4) : dark(c, 0.3))
  })
  if (t >= ENDURE_GO && t < ENDURE_HIT) rush(out, t, g, -2 * g.side, out.dx, light(c, 0.4), c)

  const x = hitX(g, far)
  const y = g.mouth.y + 1
  const age = t - ENDURE_HIT
  if (age === 0) out.shake = [g.side * 2, 0]
  if (age === 1) out.shake = [-g.side, 1]
  if (age >= 0 && age < 5) bang(out, g, x, y, [5, 8, 7, 5, 3][age], c)

  // The two health bars, the target's draining to match
  if (t < 2 || t >= 46 || (t >= 42 && t % 2)) return
  const own = Math.max(0, (g.side > 0 ? g.left : g.right) - Math.round(BAR / 2) + out.dx + g.side * Math.round(width(g) / 2))
  const ownX = clamp(own, 1, g.columns - BAR - 1)
  const ownY = Math.max(1, g.top - 3)
  healthBar(out, g, ownX, ownY, 3, t % 8 < 2)
  const drain = easeOut(phase(t, ENDURE_HIT + 1, ENDURE_HIT + ENDURE_DRAIN))
  const fill = Math.round(lerp(BAR, 3, drain))
  const foeTop = g.foe ? g.foe.top : g.target.y - span(g)
  const barX = clamp(Math.round(g.target.x - BAR / 2), 1, g.columns - BAR - 1)
  const barY = Math.max(1, foeTop - 3)
  healthBar(out, g, barX, barY, fill, drain > 0 && drain < 1)
  // The drained chunk spills off the bar as falling bits
  if (drain > 0 && drain < 1) {
    const end = barX + fill
    dot(out, end + g.side, barY + 2 + (t % 3), BAR_LOW)
  }
  if (t >= ENDURE_HIT + ENDURE_DRAIN && t < ENDURE_HIT + ENDURE_DRAIN + 6) {
    spark(out, ownX + 3, ownY, 1, c)
    spark(out, barX + 3, barY, 1, c)
  }
}

const CINCH = [7, 9, 11]
const SQUEEZES = [17, 24]
const CONSTRICT_FREE = 30

// How hard the bands bite at tick t: 1 right as a squeeze lands, easing off after
const squeezeAt = (t) => SQUEEZES.reduce((m, s) => Math.max(m, t >= s && t < s + 5 ? [1, 1, 0.7, 0.4, 0.15][t - s] : 0), 0)

// Three thin bands snap shut around the target one after another, then bite tighter
// twice, pressure spurting out the sides, before springing loose
function constrict(out, t, a, g, c) {
  const pulse = squeezeAt(t)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [5, 1, easeOut], [CONSTRICT_FREE, 1], [CONSTRICT_FREE + 5, 0]]))
  if (pulse > 0.5) out.dx += tremble(t)
  press(out, 1 - 0.07 * pulse)
  lean(out, g, t < CONSTRICT_FREE ? 1.5 + pulse : 0)
  if (pulse === 1) out.shake = [0, 1]

  const tx = fitX(g, g.target.x, 9)
  const ty = fitY(g, g.target.y, 6)
  const hh = span(g)
  const loose = phase(t, CONSTRICT_FREE, CONSTRICT_FREE + 6)
  if (loose >= 1) return
  const [hi, lit, , deep] = ramp(c)
  CINCH.forEach((snap, k) => {
    const born = snap - 3
    if (t < born) return
    const shut = easeIn(phase(t, born, snap))
    const rx = lerp(8, 4.5, shut) - pulse * 1.3 + loose * 4
    const by = clamp(Math.round(ty + (k - 1) * (hh - 1)), 2, g.ground - 1)
    const paint = loose > 0.5 ? dotted() : dot
    // The band's far half passes behind, the near half in front, rope-striped
    const steps = Math.ceil(rx * 7)
    for (let s = 0; s < steps; s++) {
      const ang = (TAU * s) / steps
      const px = tx + rx * Math.cos(ang)
      const py = by + 1.3 * Math.sin(ang) - 0.3 * rx * Math.cos(ang) * g.side
      if (Math.sin(ang) < 0) keep(g, back)(out, px, py, deep)
      else {
        keep(g, paint)(out, px, py, s % 3 ? c : lit)
        keep(g, paint)(out, px, py + 1, deep)
      }
    }
    if (t === snap) for (const s of [-1, 1]) spark(out, tx + s * rx, by, 1, hi)
  })
  // Pressure spurting out of both sides at each squeeze
  for (const s of SQUEEZES) {
    const age = t - s
    if (age < 0 || age >= 4) continue
    for (const way of [-1, 1]) {
      for (const dy of [-hh, 0, hh]) {
        const x0 = tx + way * (4 + age)
        line(out, x0, ty + dy * 0.6, x0 + way * 2, ty + dy * 0.6 + Math.sign(dy) * 1, age < 2 ? WHITE : lit, keep(g))
      }
    }
  }
}

const SWIPE_HIT = 10
const SWIPE_HOLD = 17

// Dash in and draw one flat backhand stroke that halts dead at the target's middle with
// a sharp glint, holding back the final blow, then the cut line fades from both ends
function falseswipe(out, t, a, g, c) {
  const far = travel(g, 6, 7)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [5, -2, easeOut], [7, -2], [SWIPE_HIT, far, easeIn], [SWIPE_HOLD, far], [26, 0]]))
  out.dy = hop(t, SWIPE_HOLD + 1, 26, 1)
  lean(out, g, keys(t, [[0, 0], [5, -2], [7, -2], [SWIPE_HIT, 3, easeIn], [SWIPE_HOLD, 1], [24, 0]]))
  if (t >= 5 && t < 8) spark(out, g.mouth.x + out.dx, g.mouth.y + 1, 1, c)

  const tx = fitX(g, g.target.x, 4)
  const ty = fitY(g, g.target.y, 4)
  const hh = span(g)
  const p = keep(g)
  const head = easeOut(phase(t, 7, SWIPE_HIT + 1))
  const fade = phase(t, SWIPE_HOLD, 25)
  // A quarter arc dropping from above the target and stopping dead at its middle
  const along = (f) => [tx - g.side * 8 * Math.cos((f * Math.PI) / 2), ty - (hh + 2) * (1 - Math.sin((f * Math.PI) / 2))]
  if (t >= 7 && fade < 1) {
    const n = 24
    for (let k = 0; k <= n; k++) {
      const f = k / n
      // Gone from both ends inward as it fades
      if (f > head || Math.abs(f - 0.6) > 0.62 * (1 - fade)) continue
      const [x, y] = along(f)
      const fresh = t < SWIPE_HIT + 3
      const w = fade < 0.4 ? Math.round(f * 2) : 0
      for (let d = 0; d <= w; d++) p(out, x, y + d, fresh && f > 0.75 ? WHITE : d ? c : light(c, 0.4))
      p(out, x, y + w + 1, dark(c, 0.5))
    }
  }
  const age = t - SWIPE_HIT
  if (age === 0) out.shake = [g.side, 0]
  if (age >= 0 && age < 7) {
    // The blade stops short: a bright halt bar across the tip
    const bar = [3, 3, 2, 2, 2, 1, 1][age]
    line(out, tx + g.side, ty - bar, tx + g.side, ty + bar + 1, age < 3 ? WHITE : light(c, 0.4), p)
    line(out, tx + g.side * 2, ty - bar + 1, tx + g.side * 2, ty + bar, dark(c, 0.5), p)
    if (age < 3) spark(out, tx, ty, [2, 3, 2][age], c)
  }
  if (t >= SWIPE_HIT + 2 && t < 26) sparkles(out, t, a.seed, tx, ty, 8, 6, c, 3, p)
}

const LAST_ABSORB = [9, 13, 17, 21]
const LAST_GO = 28
const LAST_HIT = 32
const LAST_HOME = 50
const LAST_HUES = [0xff5a4a, 0x4aa8ff, 0x5ad45a, 0xffd03a]

const lastPos = (t, far) => keys(t, [
  [0, 0], [LAST_GO - 3, 0], [LAST_GO, -3, easeOut], [LAST_HIT, far, easeIn], [LAST_HIT + 3, far - 1], [LAST_HOME, 0, easeInOut],
], linear)

// Every other move it knows swirls around the mon as an orb and sinks in, then it
// pours them all into one enormous charge that blasts the orbs back out of the target
function lastresort(out, t, a, g, c) {
  const far = travel(g, 12, 5)
  const at = (k) => [Math.round(g.side * lastPos(k, far)), hop(k, LAST_HIT + 4, LAST_HOME, 3)]
  ;[out.dx, out.dy] = at(t)
  if (t >= LAST_GO - 4 && t < LAST_GO) out.dx += tremble(t)
  if (t < LAST_GO) squash(out, 1 - 0.1 * phase(t, LAST_GO - 6, LAST_GO))
  else if (t < LAST_HIT) press(out, 1.15)
  else if (t < LAST_HIT + 2) press(out, t === LAST_HIT ? 0.74 : 0.88)
  else if (t >= LAST_HOME && t < LAST_HOME + 3) squash(out, [0.86, 0.95, 1.03][t - LAST_HOME])
  if (t >= LAST_GO - 6 && t < LAST_GO) lean(out, g, -1.5)
  else if (t >= LAST_GO && t < LAST_HIT) lean(out, g, 3)
  else lean(out, g, t >= LAST_HIT && t < LAST_HIT + 8 ? -2 * (1 - phase(t, LAST_HIT, LAST_HIT + 8)) : 0)

  const orbs = LAST_HUES.map((h) => mix(c, h, 0.55))
  const absorbed = LAST_ABSORB.filter((s) => t >= s).length
  if (t < LAST_HIT) {
    const flash = LAST_ABSORB.indexOf(t)
    if (flash >= 0) out.shade = tint(light(orbs[flash], 0.4), 0.6)
    else if (absorbed > 0) out.shade = rimGlow(g, out, c, 0.05 * absorbed, WHITE, t % 2 ? 0.3 + 0.12 * absorbed : 0.2)
  }
  if (t >= LAST_GO && t < LAST_HIT) {
    out.ghosts = trail(t, 4, at, light(c, 0.3))
    rush(out, t, g, at(LAST_GO)[0], out.dx, light(c, 0.4), c)
  }

  // The orbs circle the body, spiraling in until each sinks into it
  const m = middle(g, out)
  orbs.forEach((col, k) => {
    if (t >= LAST_ABSORB[k] || t < 1) return
    const sink = easeIn(phase(t, LAST_ABSORB[k] - 6, LAST_ABSORB[k]))
    const ang = t * 0.4 + (k * TAU) / 4
    const x = m.x + Math.cos(ang) * (width(g) / 2 + 4) * (1 - sink * 0.85)
    const y = m.y + Math.sin(ang) * (height(g) / 2 + 1) * (1 - sink * 0.85)
    const paint = keep(g, Math.sin(ang) < 0 ? back : dot)
    disc(out, x, y, 2.6 - sink, dark(col, 0.55), paint)
    ball(out, x, y, 2 - sink, col, paint)
  })

  const x = hitX(g, far)
  const y = g.mouth.y + 1
  const age = t - LAST_HIT
  if (age >= 0 && age < 7) out.shake = [[2, 1], [-2, -1], [2, 0], [-1, 1], [1, -1], [-1, 0], [1, 0]][age].map((v, k) => (k ? v : v * g.side))
  if (age >= 0 && age < 6) bang(out, g, x, y, [7, 10, 11, 9, 6, 3][age], c, { points: 10, spin: age * 0.12 })
  // The orbs burst back out of the target in four directions
  orbs.forEach((col, k) => {
    if (age < 1 || age >= 12) return
    const ang = Math.PI / 4 + (k * Math.PI) / 2
    const d = 3 + easeOut(age / 12) * 9
    const px = x + Math.cos(ang) * d
    const py = y + Math.sin(ang) * d * 0.7
    if (age < 8) bang(out, g, px, py, [3, 4, 4, 3, 3, 2, 2][age - 1], col, { points: 6 })
    else dot(out, px, py, col)
  })
  chips(out, t, a, g, x, y, { start: LAST_HIT, count: 10, speed: 1.3, c: light(c, 0.2) })
}

const FAKE_CLAP = 8
const HAND = ['.kkk.', 'kllok', 'klook', 'klook', 'klook', 'koodk', 'koodk', '.kkk.']

// Pop forward out of nowhere and clap two hands right in the target's face, making
// it flinch, then hop straight back
function fakeout(out, t, a, g, c) {
  out.dx = Math.round(g.side * keys(t, [[0, 0], [1, -1], [4, 1, easeOut], [11, 1], [18, 0, easeInOut]]))
  out.dy = hop(t, 1, 6, 3) + hop(t, 11, 18, 2)
  if (t >= 1 && t < 4) press(out, 1.12)
  else if (t === FAKE_CLAP) squash(out, 0.9)
  lean(out, g, t >= 2 && t < 10 ? 2 : 0)

  // Clap at least a hand's width clear of the mon's own face
  const tx = fitX(g, Math.abs(g.target.x - g.mouth.x) < 9 ? g.ahead(9) : g.target.x, 8)
  const ty = fitY(g, g.target.y, 5)
  const pal = { k: dark(c, 0.6), o: c, l: light(c, 0.55), d: dark(c, 0.25) }
  if (t >= 3 && t < FAKE_CLAP + 3) {
    const gap = t < FAKE_CLAP ? lerp(10, 3, easeIn(phase(t, 3, FAKE_CLAP))) : 3
    for (const s of [-1, 1]) badge(out, g, tx + s * gap - 2, ty - 4, HAND, pal, dark(c, 0.75), s < 0)
  }
  const age = t - FAKE_CLAP
  if (age === 0) out.shake = [0, 1]
  if (age === 1) out.shake = [0, -1]
  if (age >= 0 && age < 4) {
    disc(out, tx, ty, [2, 1.5, 1, 0][age], WHITE, keep(g))
    for (let k = 0; k < 8; k++) {
      const ang = (k * TAU) / 8 + 0.4
      const r0 = 4 + age * 1.5
      line(out, tx + Math.cos(ang) * r0, ty + Math.sin(ang) * r0, tx + Math.cos(ang) * (r0 + 2), ty + Math.sin(ang) * (r0 + 2), age < 2 ? WHITE : light(c, 0.4), keep(g))
    }
  }
  // The target flinches: a shaking alarm mark over it
  if (age >= 1 && age < 16 && !(age > 12 && t % 2)) {
    const top = Math.max(1, (g.foe ? g.foe.top : ty - span(g)) - 8)
    badge(out, g, tx - 1 + (age < 6 ? tremble(t) : 0), top, ['w', 'w', 'w', '.', 'w'], { w: WHITE }, HURT)
  }
}

const RET_RISE = 12
const RET_GO = 17
const RET_HIT = 21

// Bow in grief, then rise burning with resolve, dash in and drive up through the
// target in a rising column of force, embers streaming off it
function retaliate(out, t, a, g, c) {
  const far = travel(g, 9, 6)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [RET_GO, -1], [RET_HIT, far, easeIn], [RET_HIT + 4, far], [36, 0, easeInOut]]))
  out.dy = Math.round(keys(t, [[0, 0], [RET_HIT - 1, 0], [RET_HIT + 1, -3, easeOut], [RET_HIT + 5, -3], [RET_HIT + 8, 0, easeIn]])) + hop(t, 30, 36, 1)
  if (t < RET_RISE) squash(out, 1 - 0.06 * easeOut(phase(t, 0, 5)))
  else if (t < RET_GO) squash(out, 1.06)
  else if (t < RET_HIT) press(out, 1.1)
  else if (t < RET_HIT + 3) squash(out, [1.12, 1.08, 1.03][t - RET_HIT])
  if (t < RET_RISE) lean(out, g, -1.5 * easeOut(phase(t, 0, 5)))
  else if (t < RET_HIT) lean(out, g, 2.5)
  if (t < RET_RISE) out.shade = tint(GLOOM, 0.45 * easeOut(phase(t, 0, 4)))
  else if (t < RET_HIT + 2) out.shade = rimGlow(g, out, c, 0.15, light(c, 0.3), t % 2 ? 0.8 : 0.5)

  // A spark flares in the eye as it rises
  const eye = shownAt(g, out, headOf(g).x - g.side * 2, headOf(g).y)
  if (t >= 9 && t < RET_GO) spark(out, eye.x, eye.y, t < 11 ? 1 : 2, c)
  // Embers stream up off the body while it burns
  emit(t, { count: 12, gap: 1, start: RET_RISE, life: 7 }, (i, age, f) => {
    const x = g.left + out.dx + rnd(a.seed, i, 5) * width(g) + Math.sin(age + i) * 0.6
    const y = g.bottom + out.dy - rnd(a.seed, i, 6) * height(g) * 0.5 - age * 1.4
    dot(out, x, y, f < 0.3 ? WHITE : f < 0.6 ? light(c, 0.3) : c)
  })
  if (t >= RET_GO && t < RET_HIT) rush(out, t, g, -g.side, out.dx, light(c, 0.4), c)

  const x = hitX(g, far)
  const age = t - RET_HIT
  const top = Math.max(1, g.target.y - span(g) - 4)
  if (age === 0) out.shake = [g.side, 2]
  if (age === 1) out.shake = [0, -1]
  if (age >= 0 && age < 7) {
    // The rising column, shooting up and thinning out
    const head = lerp(g.ground, top, easeOut(Math.min(1, age / 2)))
    const w = [2, 2, 1.5, 1.5, 1, 1, 0.5][age]
    for (let y = g.ground; y >= head; y--) {
      for (let d = -Math.ceil(w); d <= Math.ceil(w); d++) {
        if (Math.abs(d) > w) continue
        keep(g)(out, x + d, y, Math.abs(d) < w * 0.5 ? WHITE : y < head + 3 ? light(c, 0.4) : c)
      }
    }
  }
  if (age >= 0 && age < 5) bang(out, g, x, g.target.y - 2, [4, 7, 7, 5, 3][age], c, { flat: 0.8 })
  emit(t, { count: 10, gap: 0.6, start: RET_HIT + 1, life: 10 }, (i, life, f) => {
    const px = x + (rnd(a.seed, i, 7) - 0.5) * 7 + Math.sin(life * 0.8 + i) * 0.7
    const py = g.target.y - life * (0.8 + rnd(a.seed, i, 8) * 0.6)
    if (py < 0) return
    dot(out, px, py, f < 0.3 ? WHITE : f < 0.7 ? light(c, 0.3) : dark(c, 0.2))
  })
}

const GIGA_REAR = 20
const GIGA_GO = 24
const GIGA_HIT = 28
const GIGA_BACK = 40
const GIGA_REST = 58

const gigaPos = (t, far) => keys(t, [
  [0, 0], [GIGA_REAR, 0], [GIGA_GO, -3, easeOut], [GIGA_HIT, far, easeIn], [GIGA_HIT + 3, far - 1], [GIGA_BACK, 0, easeInOut],
], linear)

// Draw in a storm of power until the body blazes, rocket into the target with
// everything, flatten it under a quake of shock rings, then sag spent and grey
function gigaimpact(out, t, a, g, c) {
  const far = travel(g, 13, 5)
  const at = (k) => [Math.round(g.side * gigaPos(k, far)), hop(k, GIGA_HIT + 4, GIGA_BACK, 5)]
  ;[out.dx, out.dy] = at(t)
  if (t >= 10 && t < GIGA_GO) out.dx += tremble(t)
  const tired = phase(t, GIGA_BACK, GIGA_BACK + 3) * (1 - phase(t, GIGA_REST - 6, GIGA_REST))
  if (t < GIGA_REAR) squash(out, 1 + 0.06 * phase(t, 2, GIGA_REAR))
  else if (t < GIGA_GO) squash(out, 0.86)
  else if (t < GIGA_HIT) press(out, 1.16)
  else if (t < GIGA_HIT + 3) press(out, [0.7, 0.82, 0.94][t - GIGA_HIT])
  else if (t >= GIGA_BACK && t < GIGA_BACK + 3) squash(out, [0.8, 0.9, 0.96][t - GIGA_BACK])
  else if (tired > 0) squash(out, 1 - tired * (0.05 + 0.02 * Math.sin(t * 0.9)))
  if (t >= GIGA_REAR && t < GIGA_GO) lean(out, g, -2)
  else if (t >= GIGA_GO && t < GIGA_HIT) lean(out, g, 3)
  else if (tired > 0) lean(out, g, -1.5 * tired)

  const [hi, lit, , deep] = ramp(c)
  if (t < GIGA_HIT + 1) out.shade = rimGlow(g, out, c, 0.35 * phase(t, 0, GIGA_REAR), t % 2 ? WHITE : hi, 0.3 + 0.5 * phase(t, 0, GIGA_REAR))
  else if (tired > 0) out.shade = tint(GLOOM, 0.45 * tired)

  // Power streaks converging on the body
  const m = middle(g, out)
  emit(t, { count: 28, gap: 0.65, start: 1, life: 6 }, (i, age, f) => {
    const ang = rnd(a.seed, i, 9) * TAU
    const r = lerp(Math.max(width(g), height(g)) / 2 + 9, 3, easeIn(f))
    for (let d = 0; d < 4; d++) {
      const rr = r + d * (1 + f)
      keep(g)(out, m.x + Math.cos(ang) * rr, m.y + Math.sin(ang) * rr * 0.75, d === 0 ? WHITE : d === 1 ? hi : c)
    }
  })
  if (t >= GIGA_GO && t <= GIGA_HIT) {
    out.ghosts = trail(t, 4, at, lit)
    rush(out, t, g, at(GIGA_GO)[0], out.dx, hi, c)
    // A pointed energy shell around the hurtling body
    const rx = (width(g) / 2) * out.sx + 2
    const ry = (height(g) / 2) * out.sy + 1
    oval(out, g, m.x, m.y, rx, ry, t % 2 ? WHITE : lit, true)
    const tip = m.x + g.side * (rx + 3)
    for (const s of [-1, 1]) line(out, m.x + g.side * rx * 0.7, m.y + s * ry * 0.7, tip, m.y, hi, keep(g))
  }

  const x = hitX(g, far)
  const y = g.mouth.y + 1
  const age = t - GIGA_HIT
  const jolts = [[3, 2], [-3, -1], [2, 1], [-2, -1], [2, 0], [-1, 1], [1, -1], [-1, 0]]
  if (age >= 0 && age < jolts.length) out.shake = [jolts[age][0] * g.side, jolts[age][1]]
  if (age >= 0 && age < 7) bang(out, g, x, y, [8, 12, 12, 11, 8, 5, 3][age], c, { points: 12, spin: age * 0.1 })
  for (let k = 0; k < 3; k++) {
    const r = age - k * 2
    if (r < 0 || r >= 9) continue
    oval(out, g, x, y, 4 + r * 2.6, 3 + r * 1.8, r < 3 ? WHITE : r < 6 ? lit : deep, false, r < 6 ? dot : dotted())
  }
  dust(out, t, a, g, x, { start: GIGA_HIT, count: 6, life: 16, size: 2.6, salt: 3 })
  chips(out, t, a, g, x, y, { start: GIGA_HIT, count: 14, speed: 1.6, c: light(c, 0.3) })
  chips(out, t, a, g, x, g.ground - 1, { start: GIGA_HIT + 1, count: 8, speed: 1.2, salt: 9 })
  if (tired > 0.5 && t % 6 < 3) {
    const top = shownAt(g, out, g.cx, g.top)
    stamp(out, top.x + g.side * 3, top.y - 2 - (t % 6), SWEAT, SWEAT_PAL, false, keep(g))
  }
}

const SPIN_HIT = 14
const SPIN_BACK = 20
const SPIN_HOME = 30
const SPIN_STOP = 34
const SPIN_LITTER = [0x6aa04a, STONE, 0x8a6a4a]

// Whirl like a top, grind into the target in a shower of sparks, then spin back
// home flinging stuck bits off the body, and wobble to a stop
function rapidspin(out, t, a, g, c) {
  const far = travel(g, 10, 5)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [4, 0], [SPIN_HIT, far, easeIn], [SPIN_BACK, far - 1], [SPIN_HOME, 0, easeInOut]]))
  const spinning = t >= 2 && t < SPIN_STOP
  const ang = t * 0.95
  if (spinning) {
    const cos = Math.cos(ang)
    out.flipX = cos < 0
    out.sx = Math.max(0.3, Math.abs(cos))
    out.sy = 0.92
    if (t >= SPIN_HIT && t < SPIN_BACK) out.dx += tremble(t)
  } else if (t >= SPIN_STOP) {
    const w = 1 - phase(t, SPIN_STOP, SPIN_STOP + 6)
    if (w > 0) lean(out, g, 2 * w * Math.cos((t - SPIN_STOP) * 1.8))
  }

  // Whirling bands around the spinning body
  if (spinning) {
    const m = middle(g, out)
    const rx = width(g) / 2 + 4
    const [hi, lit, , deep] = ramp(c)
    for (const fy of [-0.3, 0.25]) {
      const by = m.y + height(g) * fy
      for (let k = 0; k < 32; k++) {
        const u = (k * TAU) / 32
        const run = (k + Math.round(ang * 5)) % 8
        if (run > 4) continue
        const behind = Math.sin(u) < 0
        const col = run === 4 ? WHITE : run === 3 ? hi : behind ? deep : run < 1 ? c : lit
        const paint = keep(g, behind ? back : dot)
        paint(out, m.x + Math.cos(u) * rx, by + Math.sin(u) * 1.6, col)
        if (!behind) paint(out, m.x + Math.cos(u) * rx, by + Math.sin(u) * 1.6 + 1, deep)
      }
    }
  }
  const x = hitX(g, far)
  const y = g.mouth.y + 2
  const age = t - SPIN_HIT
  if (age >= 0 && age < 6) out.shake = [t % 2 ? g.side : -g.side, 0]
  if (age >= 0 && age < 3) bang(out, g, x, y, [4, 6, 4][age], c, { points: 6, spin: age })
  emit(t, { count: 14, gap: 0.4, start: SPIN_HIT, life: 6 }, (i, life, f) => {
    const dir = -Math.PI / 2 + (rnd(a.seed, i, 11) - 0.5) * 2.2
    const px = x - g.side + Math.cos(dir) * life * 1.2
    const py = y + Math.sin(dir) * life * 1.1 + 0.15 * life * life
    keep(g)(out, px, py, f < 0.4 ? WHITE : light(c, 0.4))
  })
  // Stuck bits flung off the body as it spins home
  emit(t, { count: 8, gap: 1.2, start: SPIN_BACK, life: 9 }, (i, life, f) => {
    const m = middle(g, out)
    const u = rnd(a.seed, i, 12) * TAU
    const r = width(g) / 2 + life * 1.3
    const px = m.x + Math.cos(u) * r
    const py = Math.min(g.ground, m.y + Math.sin(u) * r * 0.5 + 0.12 * life * life)
    const col = SPIN_LITTER[i % SPIN_LITTER.length]
    keep(g)(out, px, py, f < 0.6 ? col : dark(col, 0.3))
    keep(g)(out, px + 1, py, dark(col, 0.35))
  })
  dust(out, t, a, g, g.cx + out.dx, { start: SPIN_STOP - 2, count: 4, life: 9, size: 1.8, salt: 5 })
}

const FACADE_SHRUG = 10
const FACADE_GO = 17
const FACADE_HIT = 21
const STATUS = 0x7a4a9a

// Slump under a gloomy cloud of status, shrug it off and turn it into fuel, then
// slam the target with a blow so strong it lands twice over
function facade(out, t, a, g, c) {
  const far = travel(g, 9, 6)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [FACADE_GO, -2], [FACADE_HIT, far, easeIn], [FACADE_HIT + 4, far], [36, 0, easeInOut]]))
  if (t >= FACADE_SHRUG && t < FACADE_SHRUG + 4) out.dx += 2 * tremble(t)
  out.dy = hop(t, FACADE_SHRUG + 4, FACADE_GO, 2) + hop(t, 30, 36, 1)
  if (t < FACADE_SHRUG) squash(out, 1 - 0.07 * easeOut(phase(t, 0, 4)))
  else if (t < FACADE_GO) squash(out, 1.05)
  else if (t < FACADE_HIT) press(out, 1.12)
  else if (t < FACADE_HIT + 2) press(out, t === FACADE_HIT ? 0.78 : 0.9)
  if (t < FACADE_SHRUG) lean(out, g, -1)
  else if (t >= FACADE_GO && t < FACADE_HIT) lean(out, g, 3)
  if (t < FACADE_SHRUG) out.shade = tint(STATUS, 0.25 * phase(t, 0, 4))
  else if (t >= FACADE_SHRUG + 4 && t < FACADE_HIT + 1) out.shade = rimGlow(g, out, c, 0.15, WHITE, t % 2 ? 0.7 : 0.4)

  // The gloom cloud: puffs hang over the head, then scatter and flare into sparks
  const top = shownAt(g, out, g.cx, g.top)
  for (let k = 0; k < 3; k++) {
    const hx = top.x + (k - 1) * 4 + Math.sin(t * 0.5 + k) * 0.8
    const hy = Math.max(3, top.y - 2 - (k % 2) + Math.cos(t * 0.4 + k) * 0.6)
    if (t >= 1 && t < FACADE_SHRUG + 1) puff(out, hx, hy, 2.4, STATUS, a.seed + k, keep(g))
    const fly = t - FACADE_SHRUG - 1
    if (fly >= 0 && fly < 6) {
      const px = hx + (k - 1) * fly * 1.2
      const py = hy - fly * 0.6
      if (fly < 3) puff(out, px, py, 1.6 - fly * 0.4, mix(STATUS, c, fly / 3), a.seed + k, dotted(keep(g)))
      else spark(out, px, py, 1, c)
    }
  }
  if (t >= 2 && t < FACADE_SHRUG && t % 4 < 2) dot(out, top.x + g.side * 2, top.y - 4 - (t % 4), light(STATUS, 0.4))

  const x = hitX(g, far)
  const y = g.mouth.y + 1
  for (let k = 0; k < 2; k++) {
    const age = t - FACADE_HIT - k * 3
    if (age === 0) out.shake = [g.side * (k + 1), k]
    if (age === 1) out.shake = [-g.side * (k + 1), 0]
    if (age >= 0 && age < 5) bang(out, g, x + g.side * k * 2, y - k, [k ? 6 : 4, k ? 10 : 7, k ? 9 : 6, k ? 6 : 4, 3][age], c, { spin: k * 0.4 })
  }
  chips(out, t, a, g, x, y, { start: FACADE_HIT + 3, count: 8, speed: 1.3, c: light(c, 0.2) })
}

const CHIP_JABS = [11, 18, 25]
const CHIP_SEGS = 12
const CHIP_SHELL = 0xa8c0e0
const CHIP_TAKEN = [3, 6, 12]

// Jab three times at a guard shell around the target, each jab knocking chunks off
// it, until the last one breaks through
function chipaway(out, t, a, g, c) {
  const tx = fitX(g, g.target.x, 8)
  const ty = fitY(g, g.target.y, 6)
  const rx = 6
  // Stop just short of the shell so the jabs land on its face
  const far = clamp(Math.abs(tx - g.mouth.x) - rx - 3, 0, 8)
  let dx = keys(t, [[0, 0], [3, -1], [8, far, easeIn], [29, far], [37, 0, easeInOut]])
  for (const j of CHIP_JABS) dx += t === j - 1 ? -1 : t === j || t === j + 1 ? 2 : 0
  out.dx = Math.round(g.side * dx)
  out.dy = hop(t, 30, 37, 1)
  const jab = CHIP_JABS.some((j) => t === j || t === j + 1)
  if (jab) press(out, 1.1)
  lean(out, g, jab ? 2.5 : t >= 8 && t < 29 ? 1 : 0)

  const ry = span(g) + 1
  const taken = CHIP_JABS.reduce((n, j, k) => (t >= j ? CHIP_TAKEN[k] : n), 0)
  const facing = g.side > 0 ? Math.PI : 0
  const gone = t >= CHIP_JABS[2] + 6
  // Shell segments ranked by how squarely they face the mon; the nearest go first
  for (let k = 0; k < CHIP_SEGS; k++) {
    const mid = ((k + 0.5) * TAU) / CHIP_SEGS
    const off = Math.abs(((mid - facing + 3 * Math.PI) % TAU) - Math.PI)
    const rank = Math.floor((off / Math.PI) * (CHIP_SEGS / 2)) * 2 + (Math.sin(mid) < 0 ? 0 : 1)
    const pop = t >= 2 ? easeOut(phase(t, 2, 6)) : 0
    if (pop <= 0 || gone) continue
    if (rank < taken) {
      const j = CHIP_TAKEN.findIndex((n) => rank < n)
      chips(out, t, a, g, tx + Math.cos(mid) * rx, ty + Math.sin(mid) * ry, { start: CHIP_JABS[j], count: 3, life: 10, speed: 0.8, c: CHIP_SHELL, salt: k * 3 })
      continue
    }
    const paint = keep(g, t >= CHIP_JABS[2] + 2 ? dotted() : dot)
    for (let s = 0; s < 4; s++) {
      const u = ((k + 0.15 + s * 0.23) * TAU) / CHIP_SEGS
      const px = tx + Math.cos(u) * rx * pop
      const py = ty + Math.sin(u) * ry * pop
      paint(out, px, py, s === 1 ? WHITE : CHIP_SHELL)
      paint(out, px - Math.cos(u), py - Math.sin(u), dark(CHIP_SHELL, 0.45))
    }
  }
  CHIP_JABS.forEach((j, k) => {
    const age = t - j
    if (age < 0 || age >= 4) return
    const hx = tx - g.side * (k === 2 ? 0 : rx)
    if (age === 0) out.shake = [g.side, 0]
    if (k < 2) spark(out, hx, ty + (k ? 2 : -2), [3, 2, 1, 1][age], c)
    else bang(out, g, tx, ty, [4, 6, 5, 3][age], c)
  })
}

const CLIMB_STEPS = [5, 11, 17]
const CLIMB_LEAP = 22
const CLIMB_HIT = 29
const CLIMB_HOME = 44
const PEBBLE = 0x8a7458

// Scramble up a growing pillar of rock in three bounds, leap off the top and crash
// down on the target in a burst of rubble that leaves pebbles circling its head
function rockclimb(out, t, a, g, c) {
  const far = travel(g, 10, 5)
  const step = clamp(Math.floor((g.top - 1) / 3), 1, 3)
  const peak = step * 3
  const stepsDone = CLIMB_STEPS.filter((s) => t >= s).length
  let dy = 0
  let dx = 0
  if (t < CLIMB_LEAP) {
    dy = -step * stepsDone
    const next = CLIMB_STEPS[stepsDone]
    if (next !== undefined && t >= next - 3) {
      const f = phase(t, next - 3, next)
      dy = lerp(-step * stepsDone, -step * (stepsDone + 1), easeOut(f)) - Math.sin(f * Math.PI) * 2
    }
    dx = g.side * 0.5 * stepsDone
  } else if (t < CLIMB_HIT) {
    const f = phase(t, CLIMB_LEAP, CLIMB_HIT)
    dx = g.side * lerp(1.5, far, f)
    dy = lerp(-peak, 0, easeIn(f)) - Math.sin(f * Math.PI) * 3
  } else {
    dx = g.side * keys(t, [[CLIMB_HIT, far], [CLIMB_HIT + 3, far], [CLIMB_HOME, 0, easeInOut]])
    dy = hop(t, CLIMB_HIT + 3, CLIMB_HOME, 3)
  }
  out.dx = Math.round(dx)
  out.dy = Math.min(0, Math.round(dy))
  const land = CLIMB_STEPS.find((s) => t >= s && t < s + 2)
  if (land) squash(out, t === land ? 0.86 : 0.95)
  else if (t >= CLIMB_LEAP - 2 && t < CLIMB_LEAP) squash(out, 0.85)
  else if (t >= CLIMB_HIT && t < CLIMB_HIT + 3) squash(out, [0.72, 0.85, 0.96][t - CLIMB_HIT])
  if (t >= CLIMB_LEAP && t < CLIMB_HIT) lean(out, g, t < CLIMB_LEAP + 3 ? -1.5 : 2)

  // The rock pillar under the feet, crumbling once the mon leaps off
  const [hi, lit, base, rim] = ramp(PEBBLE)
  const rise = Math.min(peak, step * stepsDone)
  const crumble = phase(t, CLIMB_LEAP, CLIMB_LEAP + 8)
  if (rise > 0 && crumble < 1) {
    const half = clamp(Math.round(width(g) * 0.35), 2, 6)
    const cx = g.cx + Math.round(g.side * 0.5 * stepsDone)
    const top = g.bottom + 1 - rise + Math.round(crumble * rise)
    for (let y = top; y <= g.ground; y++) {
      for (let x = cx - half; x <= cx + half; x++) {
        if (crumble > 0 && rnd(a.seed, x * 17 + y, 3) < crumble) continue
        const edge = x === cx - half || x === cx + half || y === top
        const r = rnd(a.seed, x * 31 + y * 7, 4)
        keep(g, back)(out, x, y, edge ? (y === top ? hi : rim) : r < 0.2 ? lit : r < 0.75 ? base : rim)
      }
    }
    if (t >= CLIMB_LEAP) chips(out, t, a, g, cx, g.ground - rise, { start: CLIMB_LEAP, count: 6, life: 10, speed: 0.6, c: PEBBLE, salt: 5 })
  }
  CLIMB_STEPS.forEach((s, k) => dust(out, t, a, g, g.cx + out.dx, { start: s, count: 2, life: 6, size: 1.2, salt: k * 4 }))

  const x = hitX(g, far)
  const y = fitY(g, g.target.y, 4)
  const age = t - CLIMB_HIT
  if (age >= 0 && age < 4) out.shake = [[0, 2], [g.side, -1], [-g.side, 1], [0, -1]][age]
  if (age >= 0 && age < 5) bang(out, g, x, y, [5, 8, 8, 6, 3][age], c, { points: 7 })
  chips(out, t, a, g, x, y, { start: CLIMB_HIT, count: 10, speed: 1.3, c: PEBBLE, salt: 11 })
  dust(out, t, a, g, x, { start: CLIMB_HIT, count: 4, life: 12, size: 2.2, salt: 13 })
  // Pebbles circle the target's head, dizzying it
  if (age >= 3 && age < 20) {
    const head = Math.max(2, (g.foe ? g.foe.top : y - span(g)) - 1)
    for (let k = 0; k < 3; k++) {
      const u = age * 0.5 + (k * TAU) / 3
      const px = x + Math.cos(u) * 4
      const py = head + Math.sin(u) * 1.4
      if (age > 15 && (t + k) % 2) continue
      keep(g, Math.sin(u) < 0 ? back : dot)(out, px, py, Math.sin(u) < 0 ? base : hi)
      keep(g, Math.sin(u) < 0 ? back : dot)(out, px + 1, py, rim)
    }
  }
}

const FANG_SNAP = 12
const FANG_SPLIT = 17

// Lunge with jaws gaping, snap a trap of teeth shut on the target, and the bite
// cleaves a disc of its strength in half, one half dropping away
function superfang(out, t, a, g, c) {
  const far = travel(g, 4, 10)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [6, -2, easeOut], [8, -2], [FANG_SNAP, far, easeIn], [FANG_SNAP + 4, far], [28, 0, easeInOut]]))
  out.dy = Math.round(keys(t, [[0, 0], [6, -1], [8, -1], [FANG_SNAP, 0, easeIn]]))
  if (t < 8) squash(out, 1 - 0.1 * easeOut(phase(t, 0, 6)))
  else if (t < FANG_SNAP) press(out, 1.12)
  else if (t < FANG_SNAP + 2) press(out, t === FANG_SNAP ? 0.8 : 0.92)
  lean(out, g, keys(t, [[0, 0], [6, -2], [8, -2], [FANG_SNAP, 3, easeIn], [FANG_SNAP + 4, 2], [24, 0]]))

  const tx = fitX(g, g.target.x, 7)
  const ty = fitY(g, g.target.y, 6)
  const hh = span(g)
  const enamel = [WHITE, 0xe8e4d8, 0x8a8478]
  const gum = dark(c, 0.15)
  // Two rows of teeth, top and bottom, closing like a trap
  if (t >= 5 && t < FANG_SNAP + 4) {
    const gap = t < FANG_SNAP ? lerp(hh + 4, 0, easeIn(phase(t, 5, FANG_SNAP))) : 0
    const shake = t >= FANG_SNAP ? tremble(t) : 0
    const p = keep(g)
    for (const s of [-1, 1]) {
      const root = ty + s * (gap + 3)
      for (let x = tx - 6; x <= tx + 6; x++) {
        p(out, x + shake, root, gum)
        p(out, x + shake, root + s, gum)
        p(out, x + shake, root + 2 * s, dark(gum, 0.5))
        const len = 3 - (Math.abs(x - tx + (s > 0 ? 1 : 0)) % 3)
        for (let d = 1; d < len; d++) p(out, x + shake, root - s * d, d === len - 1 ? enamel[2] : d === 1 ? enamel[1] : enamel[0])
        if (len === 3) p(out, x + shake, root - s * 1, WHITE)
      }
    }
  }
  if (t === FANG_SNAP) out.shake = [0, 2]
  if (t === FANG_SNAP + 1) out.shake = [g.side, -1]
  if (t >= FANG_SNAP && t < FANG_SNAP + 3) bang(out, g, tx, ty, [3, 5, 3][t - FANG_SNAP], c, { flat: 0.6 })

  // The halved disc: whole, cut by a line, then the far half falls away
  const age = t - FANG_SPLIT
  if (age < 0 || age >= 18) return
  const r = Math.min(hh, 5)
  const fade = age > 12 && t % 2
  if (fade) return
  const fall = Math.max(0, age - 3)
  const p = keep(g)
  for (let py = -r; py <= r; py++) {
    for (let px = -r; px <= r; px++) {
      const d = Math.hypot(px, py)
      if (d > r + 0.4) continue
      const away = px * g.side > 0
      if (age >= 3 && px === 0) continue
      const ox = away ? g.side * fall * 0.4 : 0
      const oy = away ? 0.12 * fall * fall + fall * 0.3 : 0
      const col = d > r - 0.6 ? dark(c, 0.5) : away && age >= 3 ? dark(c, 0.2) : py < -r * 0.3 ? light(c, 0.4) : c
      p(out, tx + px + ox, ty + py + oy, col)
    }
  }
  if (age < 3) line(out, tx, ty - r - 2, tx, ty + r + 2, WHITE, p)
}

const COVET_BUMP = 15
const COVET_CATCH = 30
const BERRY = ['...g.', '..g..', '.ccc.', 'cwccd', 'cccdd', '.cdd.']
const LOVE_HEART = ['h.c.c', 'ccccc', '.ccc.', '..c..']

// Hop up sweetly with a little heart, bump the target, and its held item pops loose
// and arcs back into the mon's grasp, carried off above its head
function covet(out, t, a, g, c) {
  const far = travel(g, 7, 6)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [2, 0], [13, far], [COVET_BUMP, far + 1, easeIn], [COVET_BUMP + 3, far], [COVET_CATCH + 2, far], [42, 0, easeInOut]]))
  out.dy = t < 14 && t >= 2 ? -Math.round(Math.abs(Math.sin(((t - 2) / 12) * Math.PI * 3)) * 2) : hop(t, COVET_CATCH - 1, COVET_CATCH + 2, 2)
  lean(out, g, t < 14 ? (t % 4 < 2 ? 1 : -1) : t === COVET_BUMP ? 2 : 0)
  if (t === COVET_BUMP) press(out, 0.86)

  const top = shownAt(g, out, g.cx, g.top)
  if (t >= 3 && t < 14) {
    const bob = Math.round(Math.sin(t * 0.8))
    stamp(out, top.x - 2 + g.side * 2, Math.max(0, top.y - 6 + bob), LOVE_HEART, { c, h: WHITE }, g.side < 0, keep(g))
  }
  const tx = fitX(g, g.target.x, 5)
  const ty = fitY(g, g.target.y, 5)
  const age = t - COVET_BUMP
  if (age === 0) out.shake = [g.side, 0]
  if (age >= 0 && age < 3) bang(out, g, tx, ty, [3, 4, 2][age], c, { points: 6 })

  // The stolen berry: pops off the target, arcs over, then rides above the head
  const pal = { c: light(c, 0.1), w: WHITE, d: dark(c, 0.45), g: 0x3a9a3a }
  if (t > COVET_BUMP && t < COVET_CATCH) {
    const f = phase(t, COVET_BUMP + 1, COVET_CATCH)
    const hx = lerp(tx, top.x, easeInOut(f))
    const hy = lerp(ty - 3, top.y - 5, f) - Math.sin(f * Math.PI) * 6
    badge(out, g, hx - 2, Math.max(1, hy - 3), BERRY, pal, dark(c, 0.7))
    if (t % 2) dot(out, hx - g.side * 3, hy, light(c, 0.5))
  } else if (t >= COVET_CATCH && t < 44 && !(t >= 40 && t % 2)) {
    badge(out, g, top.x - 2, Math.max(1, top.y - 8), BERRY, pal, dark(c, 0.7))
    if (t < COVET_CATCH + 6) sparkles(out, t, a.seed, top.x, top.y - 5, 10, 6, c, 4, keep(g))
  }
}

const DIZZY_THROW = 10
const DIZZY_HIT = 14
const FIST = ['.kkkk.', 'khlhlk', 'kloook', 'kooodk', 'kdddk.', '.kkk..']

// Wind a fist in tight circles, throw it on a corkscrew path, and the punch leaves
// a whirling spiral over the target
function dizzypunch(out, t, a, g, c) {
  const far = travel(g, 4, 8)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [4, -1], [DIZZY_THROW, -1], [DIZZY_HIT, far, easeIn], [DIZZY_HIT + 5, far], [28, 0, easeInOut]]))
  lean(out, g, keys(t, [[0, 0], [4, -1.5], [DIZZY_THROW, -1.5], [DIZZY_HIT, 3, easeIn], [DIZZY_HIT + 4, 1], [26, 0]]))
  if (t === DIZZY_HIT) press(out, 0.88)

  const pal = { k: dark(c, 0.65), o: c, l: light(c, 0.5), d: dark(c, 0.25), h: WHITE }
  const mouth = shownAt(g, out, g.mouth.x - g.side, g.mouth.y + 2)
  const tx = fitX(g, g.target.x, 6)
  const ty = fitY(g, g.target.y, 5)
  let fx = mouth.x + g.side * 2
  let fy = mouth.y
  if (t >= 2 && t < DIZZY_THROW) {
    const u = (t - 2) * 1.1
    fx += Math.cos(u) * 2
    fy += Math.sin(u) * 2
    for (let k = 1; k <= 3; k++) dot(out, mouth.x + g.side * 2 + Math.cos(u - k * 0.6) * 3, mouth.y + Math.sin(u - k * 0.6) * 3, k === 1 ? light(c, 0.4) : c)
  } else if (t >= DIZZY_THROW && t < DIZZY_HIT + 4) {
    const f = easeIn(phase(t, DIZZY_THROW, DIZZY_HIT))
    fx = lerp(mouth.x + g.side * 2, tx - g.side * 2, f)
    fy = lerp(mouth.y, ty, f)
    // The corkscrew trail behind the fist
    for (let k = 0; k < 14; k++) {
      const s = f - k * 0.05
      if (s <= 0) break
      const px = lerp(mouth.x + g.side * 2, tx - g.side * 2, s)
      const py = lerp(mouth.y, ty, s) + Math.sin(s * TAU * 2.5) * 2
      keep(g)(out, px, py, k < 3 ? WHITE : k < 7 ? light(c, 0.4) : c)
      if (k < 9) keep(g)(out, px, py + 1, dark(c, 0.4))
    }
  }
  if (t >= 2 && t < DIZZY_HIT + 4) stamp(out, Math.round(fx) - 3, Math.round(fy) - 3, FIST, pal, g.side < 0, keep(g))

  const age = t - DIZZY_HIT
  if (age === 0) out.shake = [g.side * 2, 0]
  if (age === 1) out.shake = [-g.side, 1]
  if (age >= 0 && age < 4) bang(out, g, tx, ty, [5, 7, 6, 3][age], c, { spin: age * 0.4 })
  // A two armed spiral whirling over the target
  if (age >= 3 && age < 22) {
    const r = span(g) + 1
    const grow = easeOut(phase(age, 3, 7))
    for (let arm = 0; arm < 2; arm++) {
      for (let k = 0; k < 18; k++) {
        const s = k / 18
        if (age > 17 && (k + t) % 2) continue
        const u = s * TAU * 1.3 - age * 0.55 + arm * Math.PI
        const rr = s * r * grow
        keep(g)(out, tx + Math.cos(u) * rr, ty + Math.sin(u) * rr * 0.8, s > 0.75 ? dark(c, 0.3) : arm ? light(c, 0.45) : c)
      }
    }
  }
}

const FEINT_DECOY = 6
const FEINT_BLOCK = 11
const FEINT_HIT = 17
const SHIELD = 0x9ad0ff

// Send a pale decoy lunging in while the mon hangs back; the target's guard snaps
// up and the decoy shatters on it, then the real mon slips in low and breaks the guard
function feint(out, t, a, g, c) {
  const far = travel(g, 8, 8)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [FEINT_DECOY, -2, easeOut], [FEINT_BLOCK + 1, -2], [FEINT_HIT, far, easeIn], [FEINT_HIT + 4, far], [30, 0, easeInOut]]))
  if (t < FEINT_DECOY) squash(out, 1 - 0.06 * phase(t, 0, FEINT_DECOY))
  else if (t >= FEINT_BLOCK + 1 && t < FEINT_HIT) squash(out, 0.84)
  else if (t >= FEINT_HIT && t < FEINT_HIT + 2) press(out, t === FEINT_HIT ? 0.82 : 0.92)
  lean(out, g, t >= FEINT_BLOCK + 1 && t < FEINT_HIT ? 3 : 0)

  // The decoy: a pale copy lunging ahead of the mon
  if (t >= FEINT_DECOY && t < FEINT_BLOCK) {
    const f = easeIn(phase(t, FEINT_DECOY, FEINT_BLOCK - 1))
    const dx = Math.round(g.side * lerp(-2, far, f))
    out.ghosts = [ghost(dx, 0, light(c, 0.5), t % 2 ? 0.55 : 0.7)]
    if (dx !== out.dx) out.ghosts.push(ghost(Math.round(g.side * lerp(-2, far, Math.max(0, f - 0.25))), 0, c, 0.85))
  }
  const tx = fitX(g, g.target.x, 7)
  const ty = fitY(g, g.target.y, 6)
  const hh = span(g)
  const facing = g.side > 0 ? Math.PI : 0
  const raised = t >= FEINT_BLOCK - 2 && t < FEINT_HIT
  if (raised) {
    const pop = easeOut(phase(t, FEINT_BLOCK - 2, FEINT_BLOCK))
    for (let w = 0; w < 2; w++) {
      const r = (hh + w) * pop
      const steps = Math.ceil(r * 5)
      for (let k = 0; k <= steps; k++) {
        const u = facing - 0.9 + (1.8 * k) / steps
        keep(g)(out, tx + Math.cos(u) * r, ty + Math.sin(u) * r, w ? dark(SHIELD, 0.4) : t === FEINT_BLOCK ? WHITE : SHIELD)
      }
    }
  }
  // The decoy shatters on the guard
  const face = tx + Math.cos(facing) * hh
  emit(t, { count: 10, gap: 0, start: FEINT_BLOCK, life: 8 }, (i, life, f) => {
    const u = facing + (rnd(a.seed, i, 14) - 0.5) * 2.6
    const v = 0.6 + rnd(a.seed, i, 15) * 0.8
    keep(g)(out, face + Math.cos(u) * life * v, ty + Math.sin(u) * life * v + 0.1 * life * life, f < 0.4 ? WHITE : light(c, 0.4))
  })
  if (t === FEINT_BLOCK) out.shake = [-g.side, 0]
  const age = t - FEINT_HIT
  if (age === 0) out.shake = [g.side * 2, 1]
  if (age >= 0 && age < 4) bang(out, g, tx, ty + 2, [4, 6, 5, 3][age], c, { points: 6 })
  chips(out, t, a, g, face, ty, { start: FEINT_HIT, count: 10, life: 12, speed: 0.9, c: SHIELD, salt: 3 })
}

const CRUSH_HIT = 14
const ARMOR = 0x8aa0c0

// Rear up, then bring a huge three-taloned claw straight down on the target, crushing
// it into the ground: cracks split the earth and plates of armor drop away
function crushclaw(out, t, a, g, c) {
  const far = travel(g, 6, 7)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [8, -1], [CRUSH_HIT, far, easeIn], [CRUSH_HIT + 5, far], [30, 0, easeInOut]]))
  out.dy = Math.round(keys(t, [[0, 0], [8, -2, easeOut], [10, -2], [CRUSH_HIT, 0, easeIn]]))
  if (t < 10) squash(out, 1 + 0.07 * easeOut(phase(t, 0, 8)))
  else if (t >= CRUSH_HIT && t < CRUSH_HIT + 3) squash(out, [0.82, 0.9, 0.97][t - CRUSH_HIT])
  lean(out, g, keys(t, [[0, 0], [8, -2.5], [10, -2.5], [CRUSH_HIT, 3, easeIn], [CRUSH_HIT + 5, 1], [28, 0]]))
  if (t >= 4 && t < 10) {
    const crown = shownAt(g, out, headOf(g).x, g.top)
    spark(out, crown.x, crown.y + 1, t < 7 ? 1 : 2, c)
  }

  const tx = fitX(g, g.target.x, 6)
  const ty = fitY(g, g.target.y, 5)
  const hh = span(g)
  const len = hh * 2
  // Talons descend from above, then sit flattened into the target as gouges
  if (t >= 8 && t < CRUSH_HIT + 14) {
    const drop = easeIn(phase(t, 8, CRUSH_HIT))
    const tipY = lerp(ty - hh - 4, ty + hh, drop)
    const squish = t >= CRUSH_HIT ? Math.min(1, (t - CRUSH_HIT) / 2) : 0
    const fade = phase(t, CRUSH_HIT + 6, CRUSH_HIT + 14)
    const col = mix(c, dark(c, 0.4), fade)
    for (let k = 0; k < 3; k++) {
      const x0 = tx + (k - 1) * 3.5
      const l = len * (1 - 0.3 * squish)
      const pts = []
      for (let s = 0; s <= 8; s++) {
        const f = s / 8
        pts.push([x0 - g.side * f * f * 3, tipY - l + f * l])
      }
      tube(out, g, pts, fade > 0.5 ? 1 : 2, 0.5, col, fade > 0.5 ? dotted() : dot)
    }
  }
  const age = t - CRUSH_HIT
  if (age >= 0 && age < 4) out.shake = [[0, 2], [0, -2], [g.side, 1], [0, -1]][age]
  if (age >= 0 && age < 3) bang(out, g, tx, ty + hh - 1, [5, 7, 4][age], c, { flat: 0.5 })
  // Cracks running out along the ground under the target
  if (age >= 0 && age < 18) {
    const reach = easeOut(Math.min(1, age / 5)) * 9
    const col = age < 10 ? dark(STONE, 0.4) : STONE
    for (const s of [-1, 1]) zig(out, g, tx, g.ground, tx + s * reach, g.ground - 1, 4, 0.8, col, a.seed + (s > 0 ? 3 : 7))
  }
  // Armor plates knocked loose, tumbling down
  emit(t, { count: 5, gap: 1.5, start: CRUSH_HIT + 1, life: 12 }, (i, life, f) => {
    const px = tx + (i - 2) * 2.5 + Math.sin(life * 0.6 + i) * 1.2
    const py = Math.min(g.ground, ty - hh + 2 + life * 0.9)
    const col = f < 0.5 ? ARMOR : dark(ARMOR, 0.3)
    keep(g)(out, px, py, light(col, 0.4))
    keep(g)(out, px + 1, py, col)
    keep(g)(out, px + 1, py + 1, dark(col, 0.4))
  })
}

const XS_VANISH = 4
const XS_STRIKES = [7, 10, 13, 16]
const XS_BACK = 21

// Vanish in a flash, strike the target from four angles at once as a blur, each
// hit a white slash with the mon flickering into view, then reappear home in a skid
function extremespeed(out, t, a, g, c) {
  const far = travel(g, 12, 2)
  const hidden = t >= XS_VANISH && t < XS_BACK + 2
  if (t < XS_VANISH) {
    squash(out, 1 - 0.12 * easeOut(phase(t, 0, 3)))
    lean(out, g, 3 * phase(t, 0, 3))
    if (t === XS_VANISH - 1) out.shade = tint(WHITE, 0.7)
  }
  out.hidden = hidden
  if (t >= XS_BACK + 2) {
    const age = t - XS_BACK - 2
    if (age === 0) out.shade = tint(WHITE, 0.6)
    if (age < 3) squash(out, [0.84, 0.94, 1.03][age])
    const w = 1 - phase(age, 0, 8)
    if (w > 0) lean(out, g, -3 * w * Math.cos(age * 1.2))
  }
  const rim = mix(c, 0x3f78f0, 0.55)
  const tx = fitX(g, g.target.x, 6)
  const ty = fitY(g, g.target.y, 5)
  const hh = span(g)
  // The streak out and the streak back home
  for (const [from, to, back0] of [[XS_VANISH, XS_VANISH + 2, false], [XS_BACK, XS_BACK + 2, true]]) {
    if (t < from || t > to) continue
    const f = phase(t, from, to + 1)
    const x0 = g.mouth.x
    const x1 = tx
    for (let k = -1; k <= 1; k++) {
      const y = g.mouth.y + k * 2
      const a0 = back0 ? lerp(x1, x0, f) : x0
      const a1 = back0 ? x1 : lerp(x0, x1, f)
      line(out, a0, y, a1, y, k ? rim : WHITE, keep(g, back))
    }
  }
  XS_STRIKES.forEach((h, k) => {
    const age = t - h
    if (age < 0 || age >= 4) return
    const ang = (k % 2 ? 0.6 : -0.7) + (rnd(a.seed, k, 16) - 0.5) * 0.6 + (k > 1 ? Math.PI / 2 : 0)
    const r = hh + 3
    const cx = Math.cos(ang) * r
    const cy = Math.sin(ang) * r * 0.8
    const paint = age < 2 ? keep(g) : dotted(keep(g))
    if (age < 2) for (const o of [-1, 1]) line(out, tx - cx, ty - cy + o, tx + cx, ty + cy + o, rim, paint)
    line(out, tx - cx, ty - cy, tx + cx, ty + cy, age < 2 ? WHITE : light(rim, 0.4), paint)
    if (age < 2) spark(out, tx, ty, age ? 2 : 4, rim)
    if (age === 0) {
      out.shake = [k % 2 ? g.side : -g.side, k % 2]
      // The mon flickers into view beside the target for a single tick
      const where = Math.round(g.side * (k % 2 ? far + width(g) * 0.7 : far - 2))
      out.ghosts = [ghost(where, -((k * 3) % 4), WHITE, 0.55)]
    }
  })
  // Wind streaks raking the whole strip while it is a blur
  if (hidden) {
    for (let k = 0; k < 4; k++) {
      const y = 2 + Math.floor(rnd(a.seed, k, t) * (g.ground - 4))
      const x = Math.floor(rnd(a.seed, k + 9, t) * g.columns)
      line(out, x, y, x - g.side * 4, y, k % 2 ? light(rim, 0.5) : rim, keep(g, back))
    }
  }
  dust(out, t, a, g, heelOf(g), { start: 2, count: 2, life: 6, dir: -g.side, size: 1.4 })
  dust(out, t, a, g, g.cx + g.side * Math.round(width(g) / 2), { start: XS_BACK + 2, count: 4, life: 10, dir: g.side, size: 2, salt: 7 })
}

const DH_HITS = [10, 19]

// Barge in with a shoulder high, then whirl round for a second, harder blow low;
// each swing leaves an arc and a tally star pops up over the target per hit
function doublehit(out, t, a, g, c) {
  const far = travel(g, 5, 9)
  const [h1, h2] = DH_HITS
  out.dx = Math.round(g.side * keys(t, [[0, 0], [3, -1], [h1, far, easeIn], [h1 + 3, far - 3, easeOut], [h2 - 3, far - 3], [h2, far + 1, easeIn], [h2 + 3, far], [32, 0, easeInOut]]))
  out.dy = hop(t, h1 + 1, h1 + 5, 2) + hop(t, 25, 32, 1)
  if (t >= h2 - 3 && t < h2) {
    out.flipX = t !== h2 - 1
    out.sx = 0.65
  } else if (t === h1 || t === h2) press(out, 0.82)
  lean(out, g, t >= h1 - 3 && t < h1 + 1 ? 3 : t >= h2 && t < h2 + 2 ? -2 : 0)

  const tx = fitX(g, g.target.x, 7)
  const ty = fitY(g, g.target.y, 6)
  // Swing arcs curling onto the target: over the top first, then up from below
  const sx = tx - g.side * 4
  if (t >= h1 - 3 && t < h1 + 2) {
    const f = phase(t, h1 - 3, h1)
    swipe(out, g, sx, ty - 1, 5, turn(g, -1.8), turn(g, lerp(-1.8, 0.2, f)), c, 2)
  }
  if (t >= h2 - 3 && t < h2 + 2) {
    const f = phase(t, h2 - 3, h2)
    swipe(out, g, sx, ty + 1, 5, turn(g, 1.8), turn(g, lerp(1.8, -0.2, f)), c, 3)
  }
  DH_HITS.forEach((h, k) => {
    const age = t - h
    if (age === 0) out.shake = [g.side * (k + 1), k]
    if (age >= 0 && age < 5) bang(out, g, tx, ty + (k ? 2 : -3), k ? [5, 8, 7, 5, 3][age] : [4, 6, 5, 3, 2][age], c, { spin: k * 0.5 })
  })
  // One tally star per landed hit
  const tallies = DH_HITS.filter((h) => t >= h + 2).length
  const top = Math.max(2, (g.foe ? g.foe.top : ty - span(g)) - 3)
  if (t < 34) {
    for (let k = 0; k < tallies; k++) {
      if (t > 29 && t % 2) break
      spark(out, tx + (k - (tallies - 1) / 2) * 5, top - Math.round(phase(t, DH_HITS[k] + 2, DH_HITS[k] + 5) * 2), 2, c)
    }
  }
}

const SALT_SPRAY = 8
const SALT_WAKE = 17
const SALT_HIT = 25
const VIAL = ['.bb.', '.kk.', 'kwck', 'kcck', 'kcck', '.kk.']

// Uncork a vial and shake glittering salts over the target, which jolts awake with
// a start, then slap it while the crystals scatter
function smellingsalts(out, t, a, g, c) {
  const far = travel(g, 7, 7)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [4, 1], [SALT_HIT - 4, 1], [SALT_HIT, far, easeIn], [SALT_HIT + 3, far], [38, 0, easeInOut]]))
  out.dy = hop(t, 32, 38, 1)
  if (t >= SALT_SPRAY && t < SALT_WAKE) out.dx += t % 2
  if (t === SALT_HIT) press(out, 0.84)
  lean(out, g, t >= 2 && t < SALT_HIT - 4 ? 1.5 : t >= SALT_HIT - 4 && t < SALT_HIT + 1 ? 3 : 0)

  const edge = dark(c, 0.55)
  const mouth = shownAt(g, out, g.mouth.x, g.mouth.y + 1)
  const vx = mouth.x + g.side * 2
  const vy = mouth.y - 3
  if (t >= 2 && t < SALT_HIT - 4) {
    const tip = t >= SALT_SPRAY && t < SALT_WAKE ? tremble(t) : 0
    stamp(out, vx - 1 + tip, vy, VIAL, { b: 0x9a6a3a, k: edge, w: WHITE, c }, false, keep(g))
  }
  const tx = fitX(g, g.target.x, 6)
  const ty = fitY(g, g.target.y, 5)
  // Salt crystals arcing over and settling on the target
  emit(t, { count: 18, gap: 0.5, start: SALT_SPRAY, life: 10 }, (i, age, f) => {
    const sx = tx + (rnd(a.seed, i, 17) - 0.5) * 9
    const sy = ty + (rnd(a.seed, i, 18) - 0.5) * 8
    const px = lerp(vx, sx, easeOut(f))
    const py = lerp(vy, sy, f) - Math.sin(f * Math.PI) * 4
    const p = keep(g)
    if (f > 0.6 && (t + i) % 3 === 0) plus(out, px, py, c, WHITE, p)
    else p(out, px, py, i % 3 ? WHITE : c)
    p(out, px + 1, py + 1, edge)
  })
  // The target jolts awake: start lines burst off its top
  const wake = t - SALT_WAKE
  if (wake >= 0 && wake < 7) {
    const top = Math.max(2, (g.foe ? g.foe.top : ty - span(g)) - 1)
    for (let k = -1; k <= 1; k++) {
      const x0 = tx + k * 3
      const r0 = 1 + wake * 0.5
      line(out, x0 + k * r0, top - r0, x0 + k * (r0 + 1.5), top - r0 - 2, wake < 3 ? WHITE : c, keep(g))
      if (wake < 4) dot(out, x0 + k * (r0 + 1.5) + 1, top - r0 - 1, edge)
    }
    if (wake < 2) out.shake = [0, wake ? -1 : 1]
  }
  if (t >= SALT_SPRAY + 6 && t < SALT_HIT) sparkles(out, t, a.seed, tx, ty, 10, 8, c, 4, keep(g))
  const age = t - SALT_HIT
  if (age === 0) out.shake = [g.side * 2, 0]
  if (age >= 0 && age < 4) bang(out, g, tx, ty, [4, 7, 6, 3][age], c, { points: 10 })
  emit(t, { count: 12, gap: 0, start: SALT_HIT, life: 10 }, (i, life, f) => {
    const u = (i / 12) * TAU + rnd(a.seed, i, 19) * 0.4
    const v = 0.8 + rnd(a.seed, i, 20) * 0.6
    const px = tx + Math.cos(u) * v * life
    const py = ty + Math.sin(u) * v * life * 0.8 + 0.06 * life * life
    keep(g)(out, px, py, f < 0.5 ? WHITE : c)
    if (f < 0.6) keep(g)(out, px + 1, py + 1, edge)
  })
}

const TAIL_TURN = 4
const TAIL_SLAPS = [12, 19, 26]
const TAIL_BACK = 34

// Turn tail, back up to the target and smack it with a fluffy tail, three swishes
// back and forth with tufts of fur drifting off
function tailslap(out, t, a, g, c) {
  const far = travel(g, 6, 8)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [TAIL_TURN, 0], [10, far, easeOut], [30, far], [40, 0, easeInOut]]))
  const turned = t >= TAIL_TURN && t < TAIL_BACK
  out.flipX = turned
  if (t === TAIL_TURN - 1 || t === TAIL_BACK) out.sx = 0.6
  const slap = TAIL_SLAPS.find((s) => t >= s && t < s + 2)
  if (slap) {
    out.dy = t === slap ? -1 : 0
    lean(out, g, -1.5)
  }
  out.dy += hop(t, 35, 40, 1)

  const x0 = (g.side > 0 ? g.right : g.left) + out.dx
  const y0 = g.cy + 1
  const tx = fitX(g, g.target.x, 5)
  const ty = fitY(g, g.target.y, 5)
  const len = clamp(Math.abs(tx - x0) + 1, 4, 12)
  if (turned && t >= 8 && t < 31) {
    // The tail swings between high and low, landing each slap at the middle
    const k = TAIL_SLAPS.findIndex((s) => t < s + 3)
    const s = TAIL_SLAPS[k < 0 ? 2 : k]
    const from = (k < 0 ? 2 : k) % 2 ? 0.9 : -0.9
    const f = easeIn(phase(t, s - 4, s))
    const after = phase(t, s, s + 3)
    const ang = lerp(from, 0, f) - from * 0.4 * after
    const pts = []
    for (let n = 0; n <= 8; n++) {
      const u = n / 8
      const bend = ang * (0.5 + u * 0.7)
      pts.push([x0 + g.side * Math.cos(bend) * len * u, y0 + Math.sin(bend) * len * u])
    }
    tube(out, g, pts, 1.2, 2.2, c)
    const [ex, ey] = pts[8]
    puff(out, ex, ey, 2.6, c, a.seed, keep(g))
  }
  TAIL_SLAPS.forEach((s, k) => {
    const age = t - s
    if (age === 0) out.shake = [g.side, 0]
    if (age >= 0 && age < 3) bang(out, g, tx, ty, [3, 5, 3][age], c, { flat: 0.7, spin: k })
    emit(t, { count: 4, gap: 0, start: s, life: 12 }, (i, life, f) => {
      const px = tx + (rnd(a.seed, i + k * 5, 21) - 0.5) * 8 + Math.sin(life * 0.5 + i) * 1.2
      const py = ty - 2 + life * 0.35 - (i % 2) * 2
      keep(g)(out, px, py, f < 0.5 ? light(c, 0.5) : c)
      keep(g)(out, px + 1, py + 1, dark(c, 0.45))
    })
  })
}

const GRIP_SHUT = 16
const GRIP_SQUEEZES = [22, 28, 34]
const GRIP_OPEN = 40

// A giant hand forms over the target, its fingers closing down around it, squeezes
// three times with cracking pressure, then lets go and fades
function crushgrip(out, t, a, g, c) {
  const pulse = GRIP_SQUEEZES.reduce((m, s) => Math.max(m, t >= s && t < s + 4 ? [1, 0.8, 0.4, 0.1][t - s] : 0), 0)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [6, 1, easeOut], [GRIP_OPEN, 1], [GRIP_OPEN + 6, 0]]))
  if (pulse > 0.5) out.dx += tremble(t)
  press(out, 1 - 0.08 * pulse)
  lean(out, g, t >= 4 && t < GRIP_OPEN ? 2 + pulse : 0)
  if (pulse === 1) out.shake = [0, 1]

  const tx = fitX(g, g.target.x, 8)
  const ty = fitY(g, g.target.y, 5)
  const hh = span(g)
  const form = easeOut(phase(t, 3, 10))
  const close = easeInOut(phase(t, 9, GRIP_SHUT))
  const open = phase(t, GRIP_OPEN, GRIP_OPEN + 6)
  if (form <= 0 || open >= 1) return
  const lift = Math.round((1 - form) * 3 + open * 4)
  const palmY = Math.max(3, ty - hh - 2) - lift
  const squeeze = 1 - 0.15 * pulse
  const paint = open > 0.3 || form < 0.6 ? dotted() : dot
  // The palm sits behind the target, the fingers curl down in front of it
  const [hi, lit, base, deep] = ramp(c)
  for (let py = -2; py <= 2; py++) {
    for (let px = -5; px <= 5; px++) {
      if ((px / 5.5) ** 2 + (py / 2.6) ** 2 > 1) continue
      keep(g, back)(out, tx + px, palmY + py, py < -1 ? lit : Math.abs(px) > 4 ? deep : base)
    }
  }
  const reach = lerp(2, hh * 2 + 1, close) * (1 - open * 0.6)
  for (let k = 0; k < 4; k++) {
    const fx = tx + (k - 1.5) * 3.2 * squeeze
    const pts = []
    for (let s = 0; s <= 6; s++) {
      const f = s / 6
      // Fingertips hook back under the target as the grip closes
      const hook = f > 0.75 ? (f - 0.75) * 4 * close : 0
      pts.push([fx + (tx - fx) * f * f * 0.25 * close, palmY + 1 + f * reach - hook])
    }
    tube(out, g, pts, 1.1, 1, c, paint)
    const [kx, ky] = pts[3]
    keep(g, paint)(out, kx, ky, dark(c, 0.45))
  }
  // The thumb wraps in from the mon's side
  const thumbX = tx - g.side * 6 * squeeze
  const thumb = []
  for (let s = 0; s <= 5; s++) {
    const f = s / 5
    thumb.push([thumbX + g.side * f * 3 * close, palmY + 2 + f * reach * 0.6])
  }
  tube(out, g, thumb, 1.4, 1.1, c, paint)
  if (t >= GRIP_SHUT - 1 && t < GRIP_SHUT + 2) spark(out, tx, palmY + reach, 2, hi)
  for (const s of GRIP_SQUEEZES) {
    const age = t - s
    if (age < 0 || age >= 4) continue
    for (const way of [-1, 1]) {
      zig(out, g, tx + way * 6, ty, tx + way * (9 + age), ty - 2 + age, 2, 1, age < 2 ? WHITE : lit, a.seed + s + way)
    }
  }
}

const FRUST_STOMPS = [6, 12]
const FRUST_GO = 16
const FRUST_HIT = 20
const STEAM = 0xb8b8c4
const VEIN = ['.r.r.', 'rr.rr', '.....', 'rr.rr', '.r.r.']

// Fume and stomp twice with steam hissing off the head, then lash out and leave an
// angry scribble scrawled across the target
function frustration(out, t, a, g, c) {
  const far = travel(g, 8, 6)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [FRUST_GO, -1], [FRUST_HIT, far, easeIn], [FRUST_HIT + 4, far], [36, 0, easeInOut]]))
  out.dy = FRUST_STOMPS.reduce((d, s) => d + hop(t, s - 3, s, 2), 0) + hop(t, 30, 36, 1)
  const stomp = FRUST_STOMPS.find((s) => t >= s && t < s + 2)
  if (stomp) {
    squash(out, t === stomp ? 0.84 : 0.94)
    if (t === stomp) out.shake = [0, 1]
  } else if (t >= FRUST_GO && t < FRUST_HIT) press(out, 1.1)
  else if (t === FRUST_HIT) press(out, 0.84)
  lean(out, g, t >= FRUST_GO && t < FRUST_HIT + 1 ? 3 : 0)
  if (t >= 2 && t < FRUST_HIT && t % 4 < 2) out.shade = tint(HURT, 0.15)

  const top = shownAt(g, out, g.cx, g.top)
  emit(t, { count: 7, gap: 2.5, start: 2, life: 9 }, (i, age, f) => {
    const way = i % 2 ? 1 : -1
    const px = top.x + way * (3 + age * 0.9)
    const py = Math.max(2, top.y + 2 - age * 0.6)
    puff(out, px, py, 0.8 + f * 1.2, STEAM, a.seed + i, keep(g, f > 0.6 ? dotted() : dot))
  })
  if (t >= 3 && t < 30 && !(t > 26 && t % 2)) {
    const throb = Math.floor(t / 3) % 2
    badge(out, g, top.x + g.side * 3 - 2, Math.max(1, top.y + 1), VEIN, { r: throb ? 0xff3a2e : 0xff7a5a }, 0x4a0806)
  }
  FRUST_STOMPS.forEach((s, k) => dust(out, t, a, g, g.cx + out.dx, { start: s, count: 4, life: 9, size: 1.8, salt: k * 5 }))

  const tx = fitX(g, g.target.x, 6)
  const ty = fitY(g, g.target.y, 5)
  const hh = span(g)
  const age = t - FRUST_HIT
  if (age === 0) out.shake = [g.side * 2, 0]
  if (age === 1) out.shake = [-g.side, 1]
  if (age >= 0 && age < 3) bang(out, g, tx, ty, [4, 6, 3][age], c)
  // The scribble scrawls itself out, then jitters and fades
  if (age >= 0 && age < 18) {
    const n = 12
    const shown = Math.min(n, Math.round((age + 1) * 3))
    const jit = age > 6 ? tremble(t) * 0.5 : 0
    const paint = age > 13 ? dotted(keep(g)) : keep(g)
    let prev = null
    for (let k = 0; k <= shown; k++) {
      const p = [tx + (rnd(a.seed, k, 22) - 0.5) * 11 + jit, ty + (rnd(a.seed, k, 23) - 0.5) * hh * 2]
      if (prev) {
        line(out, prev[0], prev[1] + 1, p[0], p[1] + 1, dark(c, 0.5), paint)
        line(out, prev[0], prev[1], p[0], p[1], k === shown ? WHITE : c, paint)
      }
      prev = p
    }
  }
}

const HC_GO = 12
const HC_HIT = 18
const HC_HOME = 36

const headPos = (t, far) => keys(t, [
  [0, 0], [6, -1, easeOut], [HC_GO, -2], [HC_HIT, far, easeIn], [HC_HIT + 4, far - 3, easeOut], [HC_HIT + 7, far - 3], [HC_HOME, 0, easeInOut],
], linear)

// Lower the head as a wedge of force sharpens in front of it, ram in head first, and
// the wedge spears a cone of shock out the far side; the mon bounces off smarting
function headcharge(out, t, a, g, c) {
  const far = travel(g, 11, 5)
  const at = (k) => [Math.round(g.side * headPos(k, far)), hop(k, HC_HIT + 1, HC_HIT + 5, 2)]
  ;[out.dx, out.dy] = at(t)
  if (t < HC_GO) squash(out, 1 - 0.1 * easeOut(phase(t, 0, 6)))
  else if (t < HC_HIT) press(out, 1.12)
  else if (t < HC_HIT + 2) press(out, t === HC_HIT ? 0.78 : 0.9)
  if (t < HC_HIT) lean(out, g, 3 * easeOut(phase(t, 0, 6)))
  else if (t < HC_HIT + 5) lean(out, g, -2)
  if (t === HC_HIT + 1 || t === HC_HIT + 3) out.shade = tint(HURT, 0.45)
  if (t >= HC_GO && t < HC_HIT) {
    out.ghosts = trail(t, 3, at, light(c, 0.35))
    rush(out, t, g, at(HC_GO)[0], out.dx, light(c, 0.4), c)
  }

  // The wedge, sharpening in front of the brow and riding with it
  const head = headOf(g)
  const brow = shownAt(g, out, head.x, head.y)
  const grow = easeOut(phase(t, 3, HC_GO))
  if (grow > 0 && t <= HC_HIT) {
    const len = Math.round(2 + 4 * grow)
    const half = clamp(Math.round(height(g) * 0.18), 2, 4) * grow
    const p = keep(g)
    for (let d = 0; d <= len; d++) {
      const w = half * (1 - d / (len + 1))
      for (let y = -Math.ceil(w); y <= Math.ceil(w); y++) {
        if (Math.abs(y) > w + 0.3) continue
        const edge = Math.abs(y) > w - 0.8
        p(out, brow.x + g.side * (1 + d), brow.y + y, t === HC_HIT ? WHITE : edge ? dark(c, 0.45) : d > len - 2 ? WHITE : light(c, 0.3))
      }
    }
  }
  const x = hitX(g, far)
  const y = brow.y
  const age = t - HC_HIT
  if (age >= 0 && age < 4) out.shake = [[g.side * 2, 0], [-g.side * 2, 1], [g.side, -1], [0, 0]][age]
  if (age >= 0 && age < 5) bang(out, g, x, y, [5, 8, 8, 5, 3][age], c, { points: 6 })
  // A cone of shock spearing out past the target
  if (age >= 0 && age < 6) {
    for (let k = -2; k <= 2; k++) {
      const u = k * 0.22
      const r0 = 4 + age * 2
      const r1 = r0 + 4 - Math.abs(k)
      line(out, x + g.side * Math.cos(u) * r0, y + Math.sin(u) * r0, x + g.side * Math.cos(u) * r1, y + Math.sin(u) * r1, age < 2 ? WHITE : light(c, 0.3), keep(g))
    }
  }
  dust(out, t, a, g, heelOf(g) + out.dx, { start: HC_GO, count: 4, life: 8, dir: -g.side, size: 1.8 })
  chips(out, t, a, g, x, y, { start: HC_HIT, count: 6, speed: 1.1, dir: g.side, c: light(c, 0.2) })
}

const LOVE_GO = 18
const LOVE_HIT = 22

// Bounce happily as hearts drift up, gather them in until the mon glows with
// affection, then charge and burst a big heart over the target
function returnHit(out, t, a, g, c) {
  const far = travel(g, 9, 6)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [LOVE_GO, -1], [LOVE_HIT, far, easeIn], [LOVE_HIT + 4, far], [38, 0, easeInOut]]))
  out.dy = t < 14 ? -Math.round(Math.abs(Math.sin((t / 14) * Math.PI * 2)) * 2) : hop(t, 31, 38, 1)
  if (t >= LOVE_GO && t < LOVE_HIT) press(out, 1.1)
  else if (t === LOVE_HIT) press(out, 0.84)
  lean(out, g, t < 14 ? (t % 6 < 3 ? 1 : -1) : t >= LOVE_GO && t <= LOVE_HIT ? 3 : 0)
  const glow = phase(t, 14, LOVE_GO)
  if (glow > 0 && t <= LOVE_HIT + 1) out.shade = rimGlow(g, out, c, 0.15 * glow, WHITE, t % 2 ? 0.7 : 0.45)
  if (t >= LOVE_GO && t < LOVE_HIT) rush(out, t, g, -g.side, out.dx, light(c, 0.4), c)

  // Hearts drift up around the body, then zip into it
  const m = middle(g, out)
  for (let k = 0; k < 3; k++) {
    const born = 2 + k * 3
    if (t < born || t >= 18) continue
    const sx = m.x + (k - 1) * (width(g) / 2 + 2)
    const sy = m.y - (t - born) * 0.6 - k
    const zip = easeIn(phase(t, 14, 18))
    const x = lerp(sx, m.x, zip)
    const y = Math.max(2, lerp(sy, m.y, zip))
    heart(out, g, x, y, 2.2 - zip, c)
  }
  const x = hitX(g, far)
  const y = g.mouth.y + 1
  const age = t - LOVE_HIT
  if (age === 0) out.shake = [g.side * 2, 0]
  if (age === 1) out.shake = [-g.side, 1]
  if (age >= 0 && age < 3) bang(out, g, x, y, [4, 6, 3][age], c)
  if (age >= 1 && age < 10) {
    heart(out, g, x, y, 2.5 + age * 0.8, dark(c, 0.5), true)
    heart(out, g, x, y, 2 + age * 0.8, c, true)
  }
  if (age >= 1 && age < 4) heart(out, g, x, y, 2.5, c)
  emit(t, { count: 6, gap: 0, start: LOVE_HIT + 1, life: 12 }, (i, life, f) => {
    if (f > 0.75 && t % 2) return
    const u = (i / 6) * TAU + 0.5
    const px = x + Math.cos(u) * life * 0.9
    const py = y + Math.sin(u) * life * 0.7 - life * 0.3
    heart(out, g, px, py, 1.2, i % 2 ? c : light(c, 0.3))
  })
}

const dash = (from, to) => (t) => ({ stride: t >= from && t < to })

export const BRAWL = {
  doubleedge: { ticks: 50, color: 0xffd23a, pose: dash(EDGE_GO, EDGE_HIT), draw: doubleedge },
  flail: { ticks: 44, color: 0xff9a5a, draw: flail },
  endeavor: { ticks: 50, color: 0xffb84a, pose: dash(ENDURE_GO, ENDURE_HIT), draw: endeavor },
  constrict: { ticks: 38, color: 0xc89a6a, draw: constrict },
  falseswipe: { ticks: 34, color: 0xc8d8ff, draw: falseswipe },
  lastresort: { ticks: 58, color: 0xffe36e, pose: dash(LAST_GO, LAST_HIT), draw: lastresort },
  fakeout: { ticks: 30, color: 0xffd0a0, draw: fakeout },
  retaliate: { ticks: 44, color: 0xffa040, pose: dash(RET_GO, RET_HIT), draw: retaliate },
  gigaimpact: { ticks: 64, color: 0x9a6aff, pose: dash(GIGA_GO, GIGA_HIT), draw: gigaimpact },
  rapidspin: { ticks: 40, color: 0x8ab4ff, draw: rapidspin },
  facade: { ticks: 44, color: 0xffd24a, pose: dash(FACADE_GO, FACADE_HIT), draw: facade },
  chipaway: { ticks: 42, color: 0xffe36e, pose: dash(3, 8), draw: chipaway },
  rockclimb: { ticks: 52, color: 0xd8b880, draw: rockclimb },
  superfang: { ticks: 40, color: 0xff7a6a, draw: superfang },
  covet: { ticks: 46, color: 0xff8ac0, draw: covet },
  dizzypunch: { ticks: 40, color: 0xffb0e0, draw: dizzypunch },
  feint: { ticks: 36, color: 0xd0d8ff, pose: dash(FEINT_BLOCK + 1, FEINT_HIT), draw: feint },
  crushclaw: { ticks: 42, color: 0xe8e0d0, draw: crushclaw },
  extremespeed: { ticks: 36, color: 0xffffff, draw: extremespeed },
  doublehit: { ticks: 38, color: 0xffe36e, draw: doublehit },
  smellingsalts: { ticks: 42, color: 0xa0e8ff, draw: smellingsalts },
  tailslap: { ticks: 46, color: 0xf0e0c0, draw: tailslap },
  crushgrip: { ticks: 50, color: 0xe8b878, draw: crushgrip },
  frustration: { ticks: 46, color: 0xa070d0, pose: dash(FRUST_GO, FRUST_HIT), draw: frustration },
  headcharge: { ticks: 46, color: 0xffd060, pose: dash(HC_GO, HC_HIT), draw: headcharge },
  return: { ticks: 46, color: 0xff8ab0, pose: dash(LOVE_GO, LOVE_HIT), draw: returnHit },
}
