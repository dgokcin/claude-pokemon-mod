// Body charges: the mon throws itself at the target

import {
  WHITE, back, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, keys, lerp, light, line,
  linear, mix, phase, puff, ramp, rnd, spark, sparkles, stamp, tint, tremble,
} from './draw.js'

const DUST = 0xcbb48c
const STONE = 0x9a8468
const RED = 0xff2a2a
const DIAGONALS = [[1, 1], [-1, 1], [1, -1], [-1, -1]]

// A cool blue edge for pale moves, so they read on light terminals too
const coolEdge = (c) => mix(c, 0x3f78f0, 0.6)

// How far a charge carries the mon, at most `most` pixels and short of the strip edge
const travel = (g, most, margin = 3) => clamp(g.reach - margin, 2, most)

// The x of a hit d pixels ahead of the mouth, kept inside the strip
const aimX = (g, d) => clamp(g.ahead(d), 3, g.columns - 4)

// n quick hops over [from, to), each peaking `high` pixels up, as a dy
const hops = (t, from, to, n, high) =>
  t >= from && t < to ? -Math.round(Math.abs(Math.sin(phase(t, from, to) * Math.PI * n)) * high) : 0

const hop = (t, from, to, high) => hops(t, from, to, 1, high)

// Squash the body flat (s < 1) or stretch it tall (s > 1), keeping its bulk
function squash(out, s) {
  out.sy = s
  out.sx = 1 + (1 - s) * 0.6
}

// Squeeze the body against the target (s < 1) or stretch it toward it (s > 1)
function press(out, s) {
  out.sx = s
  out.sy = 1 + (1 - s) * 0.5
}

// Lean the body so its top sits `px` pixels toward the target (away when negative)
// while the feet stay planted
function lean(out, g, px) {
  if (Math.abs(px) < 0.5) return
  const tall = Math.max(1, g.bottom - g.top)
  out.skew = (y) => g.side * px * clamp((g.bottom + out.dy - y) / tall, 0, 1)
}

// A rubbery sway `age` ticks after a hit, rocking `amp` pixels and dying out
const sway = (age, amp, life = 8) => (age >= 0 && age < life ? amp * Math.cos(age * 1.7) * (1 - age / life) : 0)

// Jolt the strip `age` ticks after a hit, one [x, y] step per tick
function jolt(out, age, steps) {
  if (age >= 0 && age < steps.length) out.shake = steps[age]
}

// The outermost body pixel between rows y0 and y1, at the front (dir 1) or the back (-1)
function edgeAt(g, y0, y1, dir = 1) {
  const way = g.side * dir
  for (let x = way > 0 ? g.right : g.left; x !== g.cx; x -= way) {
    for (let y = y0; y <= y1; y++) if (g.solid(x, y)) return { x, y }
  }
  return { x: way > 0 ? g.right : g.left, y: Math.round((y0 + y1) / 2) }
}

// The foremost point of the head: a horn tip, a snout or a brow
const headOf = (g) => edgeAt(g, g.top, g.top + Math.round((g.bottom - g.top) * 0.55))

// The feet at the front (dir 1) or the back (-1)
const footOf = (g, dir) => edgeAt(g, g.bottom - 2, g.bottom, dir).x

// The middle of the body's top row, where a head pokes up
function crownAt(g) {
  let left = g.right
  let right = g.left
  for (let x = g.left; x <= g.right; x++) {
    if (!g.solid(x, g.top)) continue
    left = Math.min(left, x)
    right = Math.max(right, x)
  }
  return { x: Math.round((left + right) / 2), y: g.top }
}

// How far the frame's skew slides strip row y
const slide = (out, y) => (out.skew ? Math.round(out.skew(y)) : 0)

// Where a point of the body shows once the frame moves, scales and leans it
function shown(g, out, p) {
  const ax = (g.left + g.right + 1) / 2
  const ay = g.bottom + 1
  const y = Math.round(ay + (p.y + 0.5 - ay) * out.sy - 0.5 + out.dy)
  return { x: Math.round(ax + (p.x + 0.5 - ax) * out.sx - 0.5 + out.dx) + slide(out, y), y }
}

// Whether the body covers a strip pixel once the frame moves, scales and leans it
function covers(g, out) {
  const ax = (g.left + g.right + 1) / 2
  const ay = g.bottom + 1
  return (x, y) => g.solid(Math.floor(ax + (x - out.dx - slide(out, y) + 0.5 - ax) / out.sx), Math.floor(ay + (y - out.dy + 0.5 - ay) / out.sy))
}

// Afterimages on the spots the body held over the last n ticks, paler with age.
// `at(t)` gives the body's [dx, dy]. Copies too close to the body are left out.
function afterimages(t, n, at, c) {
  const [x0, y0] = at(t)
  const list = []
  for (let k = 1; k <= n; k++) {
    const [dx, dy] = at(t - k)
    if (Math.abs(dx - x0) + Math.abs(dy - y0) >= 3) list.push(ghost(dx, dy, c, 0.35 + (0.45 * k) / n))
  }
  return list
}

// Speed lines over the stretch the body swept from dx `from` to `to`, bright at the
// leading edge and breaking up toward the tail
function sweep(out, t, g, from, to, hi, lo, paint = dot) {
  const dir = Math.sign(to - from) || g.side
  const lead = (dir > 0 ? g.right : g.left) + to
  const tail = (dir > 0 ? g.left : g.right) + from - dir * 2
  const rows = clamp(Math.round((g.bottom - g.top) / 4), 3, 6)
  for (let k = 0; k < rows; k++) {
    const y = g.top + 1 + Math.round(((g.bottom - g.top - 2) * (k + 0.5)) / rows)
    const head = lead - dir * ((k * 3 + t) % 4)
    const len = Math.abs(head - tail)
    for (let d = 0; d <= len; d++) {
      const f = d / Math.max(1, len)
      if (f > 0.45 && (d + k + t) % 3 === 0) continue
      paint(out, head - dir * d, y, f < 0.15 ? WHITE : f < 0.55 ? hi : lo)
    }
  }
}

// A paint that keeps about `keep` of the pixels, so clouds thin out as they fade
const thin = (keep, seed, salt, paint = dot) => (out, x, y, c) => {
  if (rnd(seed, Math.round(x) * 131 + Math.round(y) * 7, salt) < keep) paint(out, x, y, c)
}

// Dust clouds kicked up at x on the ground, rolling `dir` (both ways when 0) as they
// rise and thin out. They sit behind the body unless `paint` says otherwise.
function kick(out, t, a, g, x, { start, count = 3, life = 12, dir = 0, size = 2, rise = 3, roll = 5, c = DUST, salt = 0, paint = back }) {
  emit(t, { count, start, gap: 0, life }, (i, age, f) => {
    const way = dir || (i % 2 ? 1 : -1)
    const k = dir ? i : i >> 1
    const grow = 0.5 + 0.5 * easeOut(Math.min(1, f * 2.5))
    const r = size * (0.75 + 0.5 * rnd(a.seed, i, salt)) * grow * (1 - 0.45 * phase(f, 0.55, 1))
    const px = x + way * (k * size * 0.9 + roll * (0.4 + 0.6 * rnd(a.seed, i, salt + 1)) * easeOut(f))
    const py = g.ground + 1 - r - rise * easeOut(f) * (0.5 + 0.5 * rnd(a.seed, i, salt + 2))
    puff(out, px, py, r, c, a.seed + i, thin(1.6 - f * 1.6, a.seed, i + salt, paint))
  })
}

// Chips flung up from x, y, falling under gravity onto the ground
function debris(out, t, a, g, x, y, { start, count = 6, life = 14, speed = 1, dir = 0, c = STONE, salt = 3 }) {
  const [hi, , base, rim] = ramp(c)
  emit(t, { count, start, gap: 0, life }, (i, age, f) => {
    const way = dir || (rnd(a.seed, i, salt) < 0.5 ? -1 : 1)
    const vx = way * (0.3 + rnd(a.seed, i, salt + 1) * 0.9) * speed
    const vy = -(0.7 + rnd(a.seed, i, salt + 2) * 0.9) * speed
    const px = x + vx * age
    const py = Math.min(g.ground, y + vy * age + 0.1 * age * age)
    dot(out, px, py, f < 0.3 ? hi : base)
    if (i % 2 === 0 && py < g.ground) dot(out, px, py + 1, rim)
  })
}

// A spiky impact star with a white heart, its spikes alternately long and short
function star(out, x, y, r, c, points = 8, spin = 0) {
  const [hi, lit, base, rim] = ramp(c)
  const inner = r * 0.42
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const turn = ((Math.atan2(py - y, px - x) - spin) / (2 * Math.PI)) * points
      const k = Math.round(turn)
      const near = Math.max(0, 1 - Math.abs(turn - k) * 2)
      const edge = inner + ((k % 2 ? r * 0.62 : r) - inner) * near * near
      const f = Math.hypot(px - x, py - y) / Math.max(0.8, edge)
      if (f > 1.05) continue
      dot(out, px, py, f < 0.3 ? WHITE : f < 0.55 ? hi : f < 0.8 ? lit : f < 0.95 ? base : rim)
    }
  }
}

// An ellipse outline, for shock rings
function oval(out, x, y, rx, ry, c) {
  const steps = Math.max(12, Math.ceil(Math.max(rx, ry) * 7))
  for (let k = 0; k < steps; k++) {
    const angle = (2 * Math.PI * k) / steps
    dot(out, x + rx * Math.cos(angle), y + ry * Math.sin(angle), c)
  }
}

// A shock ring spreading from a hit, a bright rim with a darker band inside
function shockRing(out, x, y, r, c) {
  oval(out, x, y, r - 1, r - 1, dark(c, 0.2))
  oval(out, x, y, r, r, light(c, 0.5))
}

// A shock wave rolling along the ground away from the body's two edges, its crest
// lowering as it spreads
function groundWave(out, g, left, right, f, span, c) {
  const [hi, lit, base, rim] = ramp(c)
  const d = span * easeOut(f)
  const tall = Math.max(1, Math.round(5 * (1 - f)))
  for (const [x0, s] of [[left, -1], [right, 1]]) {
    for (let k = 0; k < 7; k++) {
      const h = Math.max(1, tall - Math.floor(k * 0.7))
      const col = k === 0 ? hi : k < 2 ? lit : k < 4 ? base : rim
      for (let y = 0; y < h; y++) dot(out, x0 + s * (d - k), g.ground - y, y === h - 1 && k < 2 ? WHITE : col)
    }
  }
}

// Streaks trailing up off the body's sides while it drops
function fallLines(out, t, g, dx, dy, c) {
  for (const [x, s] of [[g.left + dx, -1], [g.right + dx, 1]]) {
    for (let k = 0; k < 2; k++) {
      const y = g.top + dy + 4 + k * 3 + ((t + k * 2) % 3)
      for (let d = 0; d < 6 - k * 2; d++) dot(out, x + s * (2 + k * 2), y - d, d === 0 ? WHITE : d < 3 ? light(c, 0.4) : c)
    }
  }
}

// Impact lines flying out of a hit like a comic panel
function crack(out, x, y, r0, r1, c, count = 8, spin = 0.3) {
  for (let k = 0; k < count; k++) {
    const angle = spin + (k * 2 * Math.PI) / count
    const far = k % 2 ? r1 * 0.75 : r1
    line(out, x + Math.cos(angle) * r0, y + Math.sin(angle) * r0, x + Math.cos(angle) * far, y + Math.sin(angle) * far, c)
  }
}

// A crescent swept around a center from angle `from` to `to`, where 0 is straight up and
// angles grow toward the target. It is thick and white at the lead, thin and dark behind.
function swoosh(out, g, x, y, r, from, to, c) {
  const [hi, lit, base, rim] = ramp(c)
  const span = to - from
  if (span <= 0.05) return
  const steps = Math.ceil(span * r * 1.6)
  for (let k = 0; k <= steps; k++) {
    const f = k / steps
    const angle = from + span * f
    const col = f > 0.85 ? WHITE : f > 0.6 ? hi : f > 0.35 ? lit : f > 0.15 ? base : rim
    for (let w = 0; w <= Math.round(3 * f); w++) {
      const rr = r - 1 + w
      dot(out, x + g.side * Math.sin(angle) * rr, y - Math.cos(angle) * rr, col)
    }
  }
}

const QUICK_GO = 6
const QUICK_HIT = 9
const QUICK_LEAVE = 15
const QUICK_HOME = 18

// How far toward the target the quick attack has carried the mon at tick t
const quickPos = (t, far) => keys(t, [
  [0, 0], [3, -1, easeOut], [QUICK_GO - 1, -1], [QUICK_HIT - 1, far], [QUICK_HIT + 3, far - 2, easeOut],
  [QUICK_LEAVE - 1, far - 2], [QUICK_HOME - 1, 0],
], linear)

const quickBlur = (t) => (t >= QUICK_GO && t < QUICK_HIT) || (t >= QUICK_LEAVE && t < QUICK_HOME)

// The feet scrabble, the mon vanishes into a white streak, flashes into view at the
// target with a sharp crack, then streaks home and skids to a stop
function quickattack(out, t, a, g, c) {
  const far = travel(g, 14, 4)
  const rim = coolEdge(c)
  const at = (k) => [Math.round(g.side * quickPos(k, far)), hop(k, QUICK_HIT + 1, QUICK_HIT + 5, 2)]
  ;[out.dx, out.dy] = at(t)
  if (t < QUICK_GO) {
    squash(out, 1 - 0.14 * easeOut(phase(t, 0, 3)))
    lean(out, g, 2 * easeOut(phase(t, 0, 3)))
  }
  lean(out, g, sway(t - QUICK_HIT, -2.5, 7))
  if (quickBlur(t)) {
    out.hidden = true
    out.ghosts = [0, 1, 2].map((k) => ghost(...at(t - k), [WHITE, light(rim, 0.5), light(rim, 0.2)][k], [0.6, 0.75, 0.85][k]))
    sweep(out, t, g, at(t < QUICK_LEAVE ? QUICK_GO - 1 : QUICK_LEAVE - 1)[0], out.dx, light(rim, 0.55), rim)
  }
  if (t === QUICK_HOME) out.shade = tint(WHITE, 0.6)
  if (t >= QUICK_HOME && t < QUICK_HOME + 3) squash(out, [0.84, 0.94, 1.04][t - QUICK_HOME])
  const heel = footOf(g, -1)
  kick(out, t, a, g, heel, { start: 2, count: 2, life: 6, dir: -g.side, size: 1.4, rise: 2 })
  kick(out, t, a, g, heel, { start: QUICK_GO, count: 3, life: 9, dir: -g.side, size: 2, roll: 7, salt: 3 })
  kick(out, t, a, g, footOf(g, 1), { start: QUICK_HOME, count: 2, life: 8, dir: g.side, size: 1.8, salt: 6 })
  kick(out, t, a, g, heel, { start: QUICK_HOME, count: 2, life: 8, dir: -g.side, size: 1.8, salt: 9 })

  const x = aimX(g, far + 1)
  const y = g.mouth.y
  const age = t - QUICK_HIT
  if (age === 0) out.shade = tint(WHITE, 0.8)
  if (age === 1) out.shade = tint(WHITE, 0.35)
  jolt(out, age, [[g.side, 0], [-g.side, 0]])
  if (age >= 0 && age < 4) {
    spark(out, x, y, [7, 5, 3, 1][age], rim)
    if (age < 3) for (const [ox, oy] of DIAGONALS) line(out, x + ox, y + oy, x + ox * (3 - age), y + oy * (3 - age), light(rim, 0.25))
    if (age === 0) disc(out, x, y, 1.5, WHITE)
  }
  emit(t, { count: 8, start: QUICK_HIT, gap: 0, life: 10 }, (i, life, f) => {
    const angle = (rnd(a.seed, i) - 0.5) * 2.4 + (g.side > 0 ? 0 : Math.PI)
    const speed = 0.9 + rnd(a.seed, i, 1) * 0.8
    dot(out, x + Math.cos(angle) * speed * life, y + Math.sin(angle) * speed * life + 0.05 * life * life, f < 0.4 ? WHITE : rim)
  })
}

const BODY_LEAP = 8
const BODY_LAND = 17
const BODY_BACK = 25
const BODY_HOME = 33
const BODY_SQUASH = [
  [0, 1], [BODY_LEAP - 1, 0.78, easeOut], [BODY_LEAP, 1.16], [BODY_LEAP + 4, 1.04], [BODY_LAND - 1, 1.12],
  [BODY_LAND, 0.6], [BODY_LAND + 2, 0.78, easeOut], [BODY_LAND + 4, 1.06, easeOut], [BODY_LAND + 6, 1],
  [BODY_BACK - 1, 1], [BODY_BACK, 0.9], [BODY_BACK + 2, 1.05], [BODY_HOME - 1, 1], [BODY_HOME, 0.86], [BODY_HOME + 2, 1.03],
  [BODY_HOME + 4, 1],
]

// Body slam's [dx, dy] at tick t, from the straining crouch to the heavy hop home
function bodyPos(t, g, far) {
  const dx = keys(t, [[0, 0], [BODY_LEAP, -1, easeOut], [BODY_LAND, far], [BODY_BACK, far], [BODY_HOME, 0, easeInOut]], linear)
  const f = phase(t, BODY_LEAP, BODY_LAND)
  const dy = t >= BODY_LEAP && t < BODY_LAND ? -Math.round(28 * f * (1 - f)) : hop(t, BODY_BACK, BODY_HOME, 3)
  const strain = t >= 5 && t < BODY_LEAP ? tremble(t) : 0
  return [Math.round(g.side * dx) + strain, dy]
}

// Crouch low, leap high and forward, and crash down on the target in a huge squash.
// Shock waves roll along the ground, dust billows and the strip quakes.
function bodyslam(out, t, a, g, c) {
  const far = travel(g, 10, 5)
  const at = (k) => bodyPos(k, g, far)
  ;[out.dx, out.dy] = at(t)
  squash(out, keys(t, BODY_SQUASH, linear))
  if (t >= BODY_LEAP && t < BODY_LAND) lean(out, g, t < BODY_LEAP + 4 ? -1.5 : 1.5)
  lean(out, g, sway(t - BODY_LAND, 2.5, 10))
  if (t > BODY_LEAP + 4 && t < BODY_LAND) fallLines(out, t, g, out.dx, out.dy, c)
  kick(out, t, a, g, g.cx, { start: BODY_LEAP, count: 2, life: 8, size: 1.8, rise: 2 })

  const landed = g.side * far
  const left = g.left + landed - 3
  const right = g.right + landed + 3
  const front = clamp(edgeAt(g, g.bottom - 7, g.bottom - 3).x + landed + g.side * 2, 4, g.columns - 5)
  const age = t - BODY_LAND
  jolt(out, age, [[0, 2], [g.side, -2], [0, 1], [-g.side, -1], [0, 1], [0, -1]])
  if (age >= 0 && age < 5) star(out, front, g.ground - 5, [7, 9, 8, 5, 3][age], c, 8, age * 0.2)
  if (age >= 0 && age < 12) groundWave(out, g, left, right, age / 12, 15, c)
  kick(out, t, a, g, left, { start: BODY_LAND, count: 3, life: 18, dir: -1, size: 3, rise: 5, roll: 8 })
  kick(out, t, a, g, right, { start: BODY_LAND, count: 3, life: 18, dir: 1, size: 3, rise: 5, roll: 8, salt: 5 })
  debris(out, t, a, g, front, g.ground - 2, { start: BODY_LAND, count: 8, speed: 1.3 })
  kick(out, t, a, g, g.cx, { start: BODY_HOME, count: 2, life: 6, size: 1.8, rise: 1, salt: 9 })
}

const HEAD_REAR = 8
const HEAD_HIT = 11
const HEAD_BACK = 15
const HEAD_HOME = 25
const DIZZY = ['..a..', '..a..', 'aabaa', '.aba.', '.a.a.']

// How far toward the target the headbutt has carried the mon at tick t
const headPos = (t, far) => keys(t, [
  [0, 0], [HEAD_REAR, -3, easeOut], [HEAD_REAR + 1, -3], [HEAD_HIT, far, easeIn], [HEAD_HIT + 2, far - 1, easeOut],
  [HEAD_BACK, far - 1], [HEAD_HOME, 0, easeInOut],
], linear)

// Lower the head and rear back, ram in, and land a big star at head height that
// leaves dizzy stars circling where the target's head was
function headbutt(out, t, a, g, c) {
  const far = travel(g, 9, 5)
  const at = (k) => [Math.round(g.side * headPos(k, far)), hops(k, HEAD_BACK, HEAD_HOME, 2, 2)]
  ;[out.dx, out.dy] = at(t)
  if (t <= HEAD_REAR) squash(out, 1 - 0.14 * easeOut(phase(t, 0, HEAD_REAR - 2)))
  else if (t < HEAD_HIT) press(out, 1.12)
  else if (t < HEAD_HIT + 3) press(out, [0.8, 0.9, 0.97][t - HEAD_HIT])
  if (t <= HEAD_REAR) lean(out, g, 2.5 * easeOut(phase(t, 0, HEAD_REAR - 2)))
  else if (t < HEAD_HIT) lean(out, g, 3)
  lean(out, g, sway(t - HEAD_HIT, -2.5))
  if (t > HEAD_REAR && t < HEAD_HIT) {
    out.ghosts = afterimages(t, 2, at, light(c, 0.3))
    sweep(out, t, g, at(HEAD_REAR)[0], out.dx, light(c, 0.4), c, back)
  }
  kick(out, t, a, g, footOf(g, -1), { start: HEAD_REAR - 3, count: 2, life: 8, dir: -g.side, size: 1.6 })

  const x = aimX(g, far + 2)
  const y = headOf(g).y
  const age = t - HEAD_HIT
  if (age === 0) out.shade = tint(WHITE, 0.6)
  jolt(out, age, [[g.side * 2, 0], [-g.side, 1], [g.side, 0]])
  if (age >= 0 && age < 6) star(out, x, y, [5, 8, 8, 6, 4, 2][age], c, 10, age * 0.15)
  if (age >= 1 && age < 4) crack(out, x, y, 8, 10 + age, light(c, 0.3), 6, 0.5)
  if (age >= 3 && age < 20) dizzy(out, age - 3, x, y - 3, c)
}

// Three little stars circling a spot, dim when they pass behind it
function dizzy(out, age, x, y, c) {
  const fade = age > 13
  for (let k = 0; k < 3; k++) {
    const angle = age * 0.45 + (k * 2 * Math.PI) / 3
    const px = x + Math.cos(angle) * 5
    const py = y + Math.sin(angle) * 1.6
    if (Math.sin(angle) > 0 && !fade) stamp(out, px - 2, py - 2, DIZZY, { a: c, b: WHITE })
    else disc(out, px, py, fade ? 0 : 1, dark(c, 0.25))
  }
}

const SKULL_TUCK = 6
const SKULL_FULL = 23
const SKULL_GO = 27
const SKULL_HIT = 30
const SKULL_BACK = 34
const SKULL_HOME = 44

// How far toward the target the skull bash has carried the mon at tick t
const skullPos = (t, far) => keys(t, [
  [0, 0], [SKULL_TUCK, -1, easeOut], [SKULL_FULL, -1], [SKULL_GO, -3, easeOut], [SKULL_HIT, far, easeIn],
  [SKULL_HIT + 2, far - 1, easeOut], [SKULL_BACK, far - 1], [SKULL_HOME, 0, easeInOut],
], linear)

// Tuck in and glow while energy pours into the head, then rocket forward head first
// into a huge impact with a shock ring and a heavy quake
function skullbash(out, t, a, g, c) {
  const far = travel(g, 10, 6)
  const at = (k) => [Math.round(g.side * skullPos(k, far)), 0]
  out.dx = at(t)[0]
  if (t >= 14 && t < SKULL_GO) out.dx += (t >> (t < 20 ? 1 : 0)) % 2 ? g.side : 0
  if (t < SKULL_GO) squash(out, keys(t, [[0, 1], [SKULL_TUCK, 0.86, easeOut], [SKULL_FULL, 0.84], [SKULL_GO - 1, 0.8, easeOut]], linear))
  else if (t < SKULL_HIT) press(out, 1.12)
  else if (t < SKULL_HIT + 3) press(out, [0.8, 0.9, 0.97][t - SKULL_HIT])
  if (t >= SKULL_FULL && t < SKULL_GO) lean(out, g, -1.5)
  else if (t >= SKULL_GO && t < SKULL_HIT) lean(out, g, 3)
  lean(out, g, sway(t - SKULL_HIT, -3, 9))

  const build = phase(t, 2, SKULL_FULL) * (1 - phase(t, SKULL_HIT + 2, SKULL_HOME))
  const head = shown(g, out, headOf(g))
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.9)
  const age = t - SKULL_HIT
  if (age === 0) out.shade = tint(WHITE, 0.9)
  else if (age === 1) out.shade = tint(WHITE, 0.5)
  else if (build > 0) {
    out.shade = (x, y, col) => {
      const near = clamp(1 - Math.hypot(x - head.x, y - head.y) / 7, 0, 1)
      return mix(col, near > 0.55 ? WHITE : c, clamp(build * (0.2 + 0.15 * pulse + near * 0.7), 0, 0.85))
    }
  }

  // Motes spiral in to the head while the charge builds
  emit(t, { count: 26, gap: 0.8, start: 2, life: 7 }, (i, life, f) => {
    const angle = rnd(a.seed, i) * 2 * Math.PI + f * 1.2
    const r = (7 + rnd(a.seed, i, 1) * 5) * (1 - easeIn(f))
    const px = head.x + Math.cos(angle) * r
    const py = head.y + Math.sin(angle) * r * 0.8
    dot(out, px, py, f > 0.6 ? WHITE : light(c, 0.4))
    if (f > 0.2) dot(out, px + Math.cos(angle) * 1.2, py + Math.sin(angle), c)
  })
  for (const born of [7, 12, 16, 19, 22]) {
    const ring = 10 - (t - born) * 2
    if (t >= born && ring >= 2) oval(out, head.x, head.y, ring, ring * 0.8, ring < 5 ? WHITE : light(c, 0.3))
  }
  if (t >= 4 && t < SKULL_HIT) {
    const r = 1 + 2 * build + (t < SKULL_GO ? pulse * 0.6 : 0.5)
    disc(out, head.x + g.side, head.y, r + 1, dark(c, 0.15), back)
    disc(out, head.x + g.side, head.y, r, light(c, 0.35))
    disc(out, head.x + g.side, head.y, r * 0.5, WHITE)
  }
  if (t >= SKULL_GO && t < SKULL_HIT) {
    out.ghosts = afterimages(t, 3, at, light(c, 0.3))
    sweep(out, t, g, at(SKULL_GO - 1)[0], out.dx, light(c, 0.4), c, back)
  }

  const x = aimX(g, far + 2)
  const y = head.y
  jolt(out, age, [[g.side * 2, 1], [-g.side * 2, -1], [g.side, 1], [-g.side, 0], [g.side, 0]])
  if (age >= 0 && age < 6) star(out, x, y, [6, 9, 9, 7, 5, 3][age], c, 12, age * 0.12)
  if (age >= 1 && age < 8) shockRing(out, x, y, 4 + age * 1.8, c)
  debris(out, t, a, g, x, y, { start: SKULL_HIT, count: 8, life: 14, speed: 1.3, c: light(c, 0.2) })
}

const DOWN_GO = 11
const DOWN_HIT = 17
const DOWN_LAND = 26
const DOWN_REST = 30
const DROP = ['.a.', 'aba', '.a.']

// Take down's [dx, dy] at tick t, from pawing the ground to landing back home
function downPos(t, g, far) {
  const dx = keys(t, [[0, 0], [3, -1, easeOut], [6, -1], [8, -2, easeOut], [DOWN_GO, -2], [DOWN_HIT, far, easeIn], [DOWN_LAND, 0, easeOut]], linear)
  return [Math.round(g.side * dx), hop(t, DOWN_HIT + 1, DOWN_LAND, 5) + hop(t, DOWN_LAND, DOWN_REST, 2)]
}

const pawing = (t) => (t >= 2 && t < 4) || (t >= 6 && t < 8)

// Paw the ground twice, charge flat out and crash headlong, then the recoil throws
// the mon back home, flashing red with the hurt, and it shakes off the sweat
function takedown(out, t, a, g, c) {
  const far = travel(g, 12, 7)
  const at = (k) => downPos(k, g, far)
  ;[out.dx, out.dy] = at(t)
  if (t < DOWN_GO) squash(out, pawing(t) ? 0.88 : 0.95)
  else if (t < DOWN_HIT) press(out, 1.12)
  else if (t < DOWN_HIT + 2) press(out, t === DOWN_HIT ? 0.76 : 0.9)
  else if (t >= DOWN_LAND && t < DOWN_LAND + 3) squash(out, [0.84, 0.95, 1.04][t - DOWN_LAND])
  if (t < DOWN_GO) lean(out, g, 1.5)
  else if (t < DOWN_HIT) lean(out, g, 3)
  else if (t < DOWN_LAND) lean(out, g, -2.5)
  else if (t >= DOWN_REST - 2 && t < DOWN_REST + 4) lean(out, g, 2 * tremble(t))
  if (t >= DOWN_GO && t < DOWN_HIT) {
    out.ghosts = afterimages(t, 3, at, light(c, 0.35))
    sweep(out, t, g, at(DOWN_GO)[0], out.dx, light(c, 0.4), c, back)
  }
  if (t === DOWN_HIT) out.shade = tint(WHITE, 0.8)
  else if (t > DOWN_HIT && t <= DOWN_REST && t % 2 === 0) out.shade = tint(RED, t < DOWN_LAND ? 0.6 : 0.35)

  const heel = footOf(g, -1)
  kick(out, t, a, g, heel - g.side, { start: 3, count: 2, life: 9, dir: -g.side, size: 2.2, rise: 4, roll: 6 })
  kick(out, t, a, g, heel - g.side * 3, { start: 7, count: 2, life: 9, dir: -g.side, size: 2.2, rise: 4, roll: 6, salt: 2 })
  emit(t, { count: 3, gap: 2, start: DOWN_GO + 1, life: 9 }, (i, age, f) => {
    const px = heel + at(DOWN_GO + 1 + i * 2)[0] - g.side * age * 0.4
    puff(out, px, g.ground - 1 - f * 2, 2 * (1 - f * 0.4), DUST, a.seed + i, thin(1.4 - f, a.seed, i, back))
  })

  const x = aimX(g, far + 1)
  const y = g.mouth.y + 1
  const age = t - DOWN_HIT
  jolt(out, age, [[g.side * 2, 0], [-g.side * 2, 1], [g.side, -1], [-g.side, 0], [g.side, 0]])
  if (age >= 0 && age < 5) star(out, x, y, [6, 9, 8, 6, 3][age], c, 8, 0.4)
  if (age >= 0 && age < 3) crack(out, x, y, 7 + age, 10 + age * 2, light(c, 0.3), 8, 0.2)
  debris(out, t, a, g, x, y, { start: DOWN_HIT, count: 8, speed: 1.2, dir: -g.side })
  if (age >= 1 && age < 6) {
    const front = shown(g, out, headOf(g))
    for (let k = 0; k < 2; k++) spark(out, front.x + g.side * (1 + k * 2), front.y - 2 - age - k * 3, age < 3 ? 2 : 1, k ? c : WHITE)
  }
  kick(out, t, a, g, g.cx, { start: DOWN_LAND, count: 4, life: 12, size: 2.2, rise: 2, salt: 7 })

  // Sweat drops fly off the head as it shakes off the blow
  const brow = headOf(g).x - g.side * 3
  emit(t, { count: 4, start: DOWN_REST - 2, gap: 1.2, life: 7 }, (i, life) => {
    const way = i % 2 ? g.side : -g.side
    const px = brow + out.dx + way * (3 + life * (0.9 + 0.2 * i))
    const py = g.top + 2 - life * 0.6 + 0.14 * life * life
    stamp(out, px - 1, py - 1, DROP, { a: 0x5fb4ff, b: WHITE })
  })
}

const RAGE_REAR = 21
const RAGE_GO = 24
const RAGE_HIT = 27
const RAGE_BACK = 31
const RAGE_HOME = 40
const ANGER_SPOTS = [[3, 1], [-4, 4]]
const ANGER = [
  ['r.r', '...', 'r.r'],
  ['..r.r..', '..r.r..', 'rrr.rrr', '.......', 'rrr.rrr', '..r.r..', '..r.r..'],
  ['.r.r.', 'rr.rr', '.....', 'rr.rr', '.r.r.'],
]

// How far toward the target rage has carried the mon at tick t
const ragePos = (t, far) => keys(t, [
  [0, 0], [RAGE_REAR - 3, 0], [RAGE_REAR, -2, easeOut], [RAGE_GO, -2], [RAGE_HIT, far, easeIn],
  [RAGE_HIT + 2, far - 1, easeOut], [RAGE_BACK, far - 1], [RAGE_HOME, 0, easeInOut],
], linear)

// An anger mark with a dark outline so it reads over any body
function angerMark(out, x, y, art, c) {
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stamp(out, x + ox, y + oy, art, { r: dark(RED, 0.6) })
  stamp(out, x, y, art, { r: c })
}

// Flush red and shake with fury while anger marks pop over the head and steam
// puffs off it, then ram the target in a red blur
function rage(out, t, a, g, c) {
  const far = travel(g, 10, 5)
  const at = (k) => [Math.round(g.side * ragePos(k, far)), hops(k, RAGE_BACK, RAGE_HOME, 2, 2)]
  ;[out.dx, out.dy] = at(t)
  if (t >= 3 && t < RAGE_REAR) out.dx += tremble(t)
  const beat = t % 6 < 2 && t < RAGE_GO ? 1 : 0
  if (t < RAGE_REAR) squash(out, 1 + 0.05 * beat)
  else if (t < RAGE_GO) squash(out, 0.86)
  else if (t < RAGE_HIT) press(out, 1.12)
  else if (t < RAGE_HIT + 3) press(out, [0.8, 0.9, 0.97][t - RAGE_HIT])
  if (t >= RAGE_REAR && t < RAGE_GO) lean(out, g, -2)
  else if (t >= RAGE_GO && t < RAGE_HIT) lean(out, g, 3)
  lean(out, g, sway(t - RAGE_HIT, -2.5))
  const heat = phase(t, 0, 14) * (1 - phase(t, RAGE_HIT + 3, RAGE_HOME + 2))
  if (t === RAGE_HIT) out.shade = tint(WHITE, 0.7)
  else if (heat > 0) out.shade = tint(RED, heat * (0.42 + 0.18 * beat))
  if (t >= RAGE_GO && t < RAGE_HIT) {
    out.ghosts = afterimages(t, 3, at, RED)
    sweep(out, t, g, at(RAGE_GO - 1)[0], out.dx, light(c, 0.3), c, back)
  }

  const crown = crownAt(g)
  ANGER_SPOTS.forEach(([ox, oy], k) => {
    const age = t - (4 + k * 6)
    if (age < 0 || t >= RAGE_HIT) return
    const art = age < 1 ? ANGER[0] : age < 2 || (t % 6 < 2) ? ANGER[1] : ANGER[2]
    const x = crown.x + g.side * ox + out.dx - (art[0].length >> 1)
    const y = Math.max(1, g.top - 2 + oy - (art.length >> 1))
    angerMark(out, x, y, art, k ? light(c, 0.15) : c)
  })
  emit(t, { count: 6, gap: 2.5, start: 7, life: 10 }, (i, age, f) => {
    const px = crown.x + out.dx - g.side * (1 + (i % 2) * 3 + age * 0.5)
    const py = g.top + 2 - age * 0.7
    if (py >= 1) puff(out, px, py, 1.4 + f * 1.2, 0xe8e0e0, a.seed + i, thin(1.5 - f * 1.5, a.seed, i))
  })

  const x = aimX(g, far + 1)
  const y = g.mouth.y + 1
  const age = t - RAGE_HIT
  jolt(out, age, [[g.side * 2, 0], [-g.side, 1], [g.side, -1], [-g.side, 0]])
  if (age >= 0 && age < 5) star(out, x, y, [6, 8, 7, 5, 3][age], c, 8, 0.35)
  if (age >= 0 && age < 3) crack(out, x, y, 6 + age, 9 + age * 2, light(c, 0.4), 8)
  debris(out, t, a, g, x, y, { start: RAGE_HIT, count: 7, speed: 1.1, c: mix(c, 0xffb040, 0.4) })
}

const THRASH_HITS = [
  { at: 5, reach: 0.7, lift: -2, r: 6 },
  { at: 13, reach: 1, lift: 2, r: 6 },
  { at: 22, reach: 0.85, lift: -1, r: 6 },
  { at: 34, reach: 1, lift: 1, r: 9 },
]

// How far toward the target thrash has carried the mon at tick t, over four wild lunges
const thrashPos = (t, far) => keys(t, [
  [0, 0], [2, -1, easeOut], [5, far * 0.7, easeIn], [8, 0, easeOut], [10, -1], [13, far, easeIn], [16, -1, easeOut],
  [19, -2], [22, far * 0.85, easeIn], [25, 0, easeOut], [28, -1], [30, -3, easeOut], [34, far, easeIn],
  [36, far - 1, easeOut], [38, far - 1], [45, 0, easeInOut],
], linear)

const thrashHop = (t) => hop(t, 8, 10, 2) + hop(t, 16, 19, 3) + hop(t, 25, 28, 2) + hops(t, 38, 45, 2, 2)

// A frenzy of lunges back and forth, spinning around between them, each landing a
// blow at a different height, the last one hardest
function thrash(out, t, a, g, c) {
  const far = travel(g, 9, 5)
  const at = (k) => [Math.round(g.side * thrashPos(k, far)), thrashHop(k)]
  ;[out.dx, out.dy] = at(t)
  out.flipX = (t >= 16 && t < 18) || (t >= 25 && t < 27)
  THRASH_HITS.forEach((h, k) => {
    const age = t - h.at
    const big = k === THRASH_HITS.length - 1
    if (age >= -2 && age < 0) {
      press(out, 1.1)
      lean(out, g, 2.5)
      out.ghosts = afterimages(t, 2, at, light(c, 0.35))
    }
    lean(out, g, sway(age, -2, 6))
    if (age < 0 || age > 16) return
    const x = aimX(g, far * h.reach + 1)
    const y = g.mouth.y + h.lift
    if (age === 0) {
      press(out, 0.82)
      out.shade = tint(WHITE, big ? 0.6 : 0.3)
    }
    jolt(out, age, big ? [[g.side * 2, 1], [-g.side * 2, -1], [g.side, 1], [-g.side, 0]] : [[g.side, 1], [-g.side, 0]])
    if (age < 5) star(out, x, y, h.r * [0.7, 1, 0.85, 0.6, 0.35][age], c, big ? 10 : 6, k)
    if (age < 3) crack(out, x, y, h.r + 1 + age, h.r + 3 + age * 2, light(c, 0.3), big ? 8 : 6, k)
    debris(out, t, a, g, x, y, { start: h.at, count: big ? 8 : 4, life: 12, salt: k * 4 })
    kick(out, t, a, g, g.cx + at(h.at + 3)[0], { start: h.at + 3, count: 2, life: 9, size: 2, salt: k * 3 })
  })
}

const OUT_HITS = [
  { at: 12, reach: 0.75, lift: -1, r: 6 },
  { at: 20, reach: 1, lift: 2, r: 6 },
  { at: 33, reach: 1, lift: 0, r: 9 },
]
const OUT_END = 44

// How far toward the target outrage has carried the mon at tick t, over three raging lunges
const outragePos = (t, far) => keys(t, [
  [0, 0], [9, -1, easeOut], [12, far * 0.75, easeIn], [15, -1, easeOut], [17, -1], [20, far, easeIn], [23, -1, easeOut],
  [26, -1], [29, -3, easeOut], [33, far, easeIn], [35, far - 1, easeOut], [37, far - 1], [46, 0, easeInOut],
], linear)

const outrageHop = (t) => (t >= 4 && t < 9 ? -1 : 0) + hop(t, 15, 17, 2) + hop(t, 23, 26, 3) + hops(t, 37, 46, 2, 2)

// Like thrash, but wreathed in a crackling red-violet dragon aura, every lunge
// bursting into violet fire
function outrage(out, t, a, g, c) {
  const far = travel(g, 9, 5)
  const hot = mix(c, 0xff2a5a, 0.55)
  const flame = [0xffe6f6, light(hot, 0.35), hot, c, dark(c, 0.45)]
  const at = (k) => [Math.round(g.side * outragePos(k, far)), outrageHop(k)]
  ;[out.dx, out.dy] = at(t)
  if (t >= 3 && t < 9) out.dx += tremble(t)
  const power = phase(t, 0, 8) * (1 - phase(t, OUT_END, 51))
  if (power > 0) out.shade = tint(hot, (0.16 + (t % 3 === 0 ? 0.1 : 0)) * power)
  OUT_HITS.forEach((h, k) => {
    const age = t - h.at
    if (age >= -2 && age < 0) {
      press(out, 1.1)
      lean(out, g, 2.5)
      out.ghosts = afterimages(t, 2, at, hot)
    }
    lean(out, g, sway(age, -2, 6))
    if (age < 0 || age > 18) return
    const big = k === OUT_HITS.length - 1
    const x = aimX(g, far * h.reach + 1)
    const y = g.mouth.y + h.lift
    if (age === 0) {
      press(out, 0.84)
      out.shade = tint(flame[0], 0.6)
    }
    jolt(out, age, big ? [[g.side * 2, 1], [-g.side * 2, -1], [g.side, 1], [-g.side, -1], [g.side, 0]] : [[g.side, 1], [-g.side, 0]])
    if (age < 7) fireBurst(out, a, age, x, y, h.r, flame, k)
    emit(t, { count: big ? 10 : 5, start: h.at + 2, gap: 0.5, life: 10 }, (i, life, f) => {
      const px = x + (rnd(a.seed, i, k + 20) - 0.5) * 10 + Math.sin(life * 0.6 + i) * 1.2
      const py = y + (rnd(a.seed, i, k + 30) - 0.5) * 6 - life * 0.6
      if (py >= 0) dot(out, px, py, f < 0.5 ? flame[1] : flame[3])
    })
  })
  if (power > 0) aura(out, t, a, g, power, flame)
}

// A dragon aura hugging the body's outline, with a shimmering rim, a violet halo and
// flames licking up off every upward edge. `power` from 0 to 1 sets its size.
function aura(out, t, a, g, power, flame) {
  const body = covers(g, out)
  const x0 = g.left + out.dx - 3
  const y0 = Math.max(0, g.top + out.dy - 7)
  const w = g.right - g.left + 7
  const h = g.bottom + out.dy - y0 + 2
  const mask = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask.push(body(x0 + x, y0 + y))
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x]
  for (let x = 0; x < w; x++) {
    const tall = Math.round(power * (2.5 + 1.5 * Math.sin(x * 1.1 - t * 0.7) + 2 * rnd(a.seed, x, t >> 1)))
    for (let y = 0; y < h; y++) {
      if (solid(x, y)) continue
      let near = 3
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 2; ox++) if (solid(x + ox, y + oy)) near = Math.min(near, Math.max(Math.abs(ox), Math.abs(oy)))
      }
      // Flames rise off any edge of the body that faces up
      let up = 0
      for (let k = 1; k <= tall && !up; k++) if (solid(x, y + k)) up = k
      const px = x0 + x
      const py = y0 + y
      if (up > 0) back(out, px, py, flame[Math.min(4, 1 + Math.floor((up / (tall + 1)) * 4))])
      else if (near === 1) back(out, px, py, (x + y + t) % 5 ? flame[2] : flame[1])
      else if (near === 2 && (x * 3 + y * 5 + t) % 4 && power > 0.4) back(out, px, py, flame[3])
    }
  }
  // Short jagged sparks crackle up off the top of the aura
  for (let k = 0; k < 2; k++) {
    if ((t + k) % 3 === 0) continue
    const x = Math.floor(rnd(a.seed, k, t) * w)
    let top = -1
    for (let y = 0; y < h && top < 0; y++) if (solid(x, y)) top = y
    if (top < 0) continue
    const way = rnd(a.seed, k + 5, t) < 0.5 ? -1 : 1
    for (let s = 0; s < 4; s++) dot(out, x0 + x + way * (s % 2), y0 + top - 3 - s, s < 2 ? WHITE : flame[1])
  }
}

// A ring of fire tongues bursting out of a hit and curling up, white hot at the heart
function fireBurst(out, a, age, x, y, r, flame, salt) {
  if (age < 2) disc(out, x, y, 2.5 - age, flame[0])
  const count = 8
  for (let k = 0; k < count; k++) {
    const angle = (k * 2 * Math.PI) / count + rnd(a.seed, k, salt) * 0.5
    const len = r * (0.6 + 0.5 * rnd(a.seed, k, salt + 7)) * Math.min(1, (age + 1) / 3)
    const from = age * 0.9
    for (let d = from; d <= from + len; d += 0.8) {
      const f = (d - from) / Math.max(1, len)
      const col = flame[Math.min(4, Math.floor(f * 2.5 + age * 0.45))]
      const px = x + Math.cos(angle) * d
      const py = y + Math.sin(angle) * d - age * 0.5 * f * 2
      dot(out, px, py, col)
      if (f < 0.6) dot(out, px + Math.round(-Math.sin(angle)), py + Math.round(Math.cos(angle)), col)
    }
  }
}

const HORN_REAR = 9
const HORN_HIT = 13
const HORN_BACK = 17
const HORN_HOME = 27

// How far toward the target the horn attack has carried the mon at tick t
const hornPos = (t, far) => keys(t, [
  [0, 0], [HORN_REAR, -2, easeOut], [HORN_REAR + 1, -2], [HORN_HIT, far, easeIn], [HORN_HIT + 2, far - 1, easeOut],
  [HORN_BACK, far - 1], [HORN_HOME, 0, easeInOut],
], linear)

// Lower the head while a gleam runs out to the horn tip, then lunge behind a spear of
// light that pierces the target in a long flare
function hornattack(out, t, a, g, c) {
  const far = travel(g, 9, 5)
  const rim = coolEdge(c)
  const at = (k) => [Math.round(g.side * hornPos(k, far)), hop(k, HORN_BACK, HORN_HOME, 2)]
  ;[out.dx, out.dy] = at(t)
  if (t <= HORN_REAR) squash(out, 1 - 0.1 * easeOut(phase(t, 0, HORN_REAR - 2)))
  else if (t < HORN_HIT) press(out, 1.1)
  else if (t < HORN_HIT + 2) press(out, t === HORN_HIT ? 0.86 : 0.94)
  if (t <= HORN_REAR) lean(out, g, 2 * easeOut(phase(t, 0, HORN_REAR - 2)))
  else if (t < HORN_HIT) lean(out, g, 3)
  lean(out, g, sway(t - HORN_HIT, -2, 7))
  if (t > HORN_REAR && t < HORN_HIT) out.ghosts = afterimages(t, 2, at, light(rim, 0.4))
  const tip = shown(g, out, headOf(g))

  // The gleam slides out along the horn, lighting it up, then flares at the tip
  if (t >= 3 && t < 6) dot(out, tip.x - g.side * (6 - t), tip.y, WHITE)
  if (t >= 4 && t <= HORN_REAR) {
    const f = t < 8 ? 0.7 : 0.4
    out.shade = (x, y, col) => (Math.abs(x - tip.x) + Math.abs(y - tip.y) < 4 ? mix(col, WHITE, f) : col)
  }
  const glint = t - 6
  if (glint >= 0 && glint < 5) {
    const size = [2, 4, 5, 3, 1][glint]
    spark(out, tip.x, tip.y, size, rim)
    if (size > 3) for (const [ox, oy] of DIAGONALS) line(out, tip.x + ox, tip.y + oy, tip.x + ox * 2, tip.y + oy * 2, light(rim, 0.5))
  }
  if (t > HORN_REAR && t <= HORN_HIT + 1) {
    const len = [3, 7, 11, 13, 8][t - HORN_REAR - 1]
    for (let d = 1; d <= len; d++) {
      const f = d / len
      dot(out, tip.x + g.side * d, tip.y, f < 0.8 ? WHITE : light(rim, 0.4))
      if (f < 0.55) {
        dot(out, tip.x + g.side * d, tip.y - 1, light(rim, 0.3))
        dot(out, tip.x + g.side * d, tip.y + 1, rim)
      }
    }
  }

  const x = aimX(g, far + 3)
  const y = tip.y
  const age = t - HORN_HIT
  if (age === 0) out.shade = tint(WHITE, 0.6)
  jolt(out, age, [[g.side, 0], [-g.side, 0]])
  if (age >= 0 && age < 5) {
    const long = [9, 12, 9, 6, 3][age]
    for (let d = -long; d <= long; d++) {
      const f = Math.abs(d) / long
      dot(out, x + d, y, f < 0.35 ? WHITE : f < 0.65 ? light(rim, 0.4) : rim)
      if (f < 0.4 && age < 3) {
        dot(out, x + d, y - 1, light(rim, 0.3))
        dot(out, x + d, y + 1, rim)
      }
    }
    const tall = Math.round(long * 0.4)
    for (let d = 1; d <= tall; d++) {
      dot(out, x, y - d, d < tall ? WHITE : rim)
      dot(out, x, y + d, d < tall ? WHITE : rim)
    }
  }
  if (age >= 2 && age < 10) sparkles(out, t, a.seed, x, y, 10, 7, rim, 4)
  emit(t, { count: 7, start: HORN_HIT, gap: 0, life: 11 }, (i, life, f) => {
    const angle = (rnd(a.seed, i) - 0.5) * 1.8 + (g.side > 0 ? 0 : Math.PI)
    const speed = 0.9 + rnd(a.seed, i, 1) * 0.9
    dot(out, x + Math.cos(angle) * speed * life, y + Math.sin(angle) * speed * life + 0.05 * life * life, f < 0.4 ? WHITE : rim)
  })
}

const DRILL_FORM = 10
const DRILL_PUSH = 14
const DRILL_END = 34
const DRILL_HOME = 44

// A cone of light on the horn tip, its spiral bands scrolling as it spins
function drill(out, x, y, len, half, spin, side, tones) {
  const [hi, shine, steel, rim] = tones
  for (let u = 0; u < len; u++) {
    const h = half * (1 - u / len)
    for (let v = -Math.ceil(h); v <= Math.ceil(h); v++) {
      if (Math.abs(v) > h + 0.4) continue
      const thread = Math.floor((u + v - spin) / 2) % 2 === 0
      const col = Math.abs(v) > h - 0.6 ? rim : v < -h + 1.6 ? shine : thread ? hi : steel
      dot(out, x + side * u, y + v, col)
    }
  }
  dot(out, x + side * len, y, WHITE)
}

// How far toward the target the horn drill has carried the mon at tick t
const drillPos = (t, far) => keys(t, [
  [0, 0], [DRILL_FORM - 2, -1, easeOut], [DRILL_FORM, -1], [DRILL_PUSH, far, easeIn], [DRILL_END, far + 2],
  [DRILL_END + 2, far + 2], [DRILL_HOME, 0, easeInOut],
], linear)

// A spinning drill of light grows on the horn, then the mon drives it into the
// target and grinds, spraying sparks and shaking the strip, until it bursts
function horndrill(out, t, a, g, c) {
  const horn = headOf(g)
  const room = g.side > 0 ? g.columns - 1 - horn.x : horn.x
  const len = clamp(room - 6, 5, 9)
  const far = clamp(room - len - 6, 0, 6)
  const tones = [WHITE, mix(c, 0xd8e8ff, 0.6), mix(c, 0x9ab4dc, 0.7), mix(c, 0x50648e, 0.8)]
  out.dx = Math.round(g.side * drillPos(t, far))
  const grinding = t >= DRILL_PUSH && t < DRILL_END
  if (grinding) {
    out.dx += t % 2 ? g.side : 0
    out.shake = [(t >> 1) % 2 ? g.side : 0, t % 4 === 0 ? 1 : 0]
  }
  if (t >= DRILL_PUSH - 3 && t < DRILL_PUSH) press(out, 1.08)
  if (t >= DRILL_PUSH - 3 && t < DRILL_END) lean(out, g, 2)
  const tip = shown(g, out, horn)
  const size = keys(t, [[0, 0], [DRILL_FORM, len, easeOut], [DRILL_END + 2, len], [DRILL_HOME - 2, 0, easeIn]], linear)
  const spin = t * (grinding ? 1.6 : 0.8)
  if (size >= 1) drill(out, tip.x + g.side, tip.y, Math.round(size), Math.min(3.5, 1 + size * 0.35), spin, g.side, tones)
  const point = tip.x + g.side * (Math.round(size) + 1)

  emit(t, { count: 10, gap: 0.8, start: 0, life: 6 }, (i, age, f) => {
    const angle = rnd(a.seed, i) * 2 * Math.PI
    const r = (6 + rnd(a.seed, i, 1) * 4) * (1 - f)
    dot(out, tip.x + g.side * 3 + Math.cos(angle) * r, tip.y + Math.sin(angle) * r * 0.7, f > 0.5 ? WHITE : tones[2])
  })
  emit(t, { count: 40, gap: 0.5, start: DRILL_PUSH, life: 9 }, (i, age, f) => {
    if (DRILL_PUSH + i * 0.5 >= DRILL_END) return
    const vx = -g.side * (0.4 + rnd(a.seed, i, 2) * 0.9)
    const vy = -(0.6 + rnd(a.seed, i, 3) * 1.1)
    const px = point + vx * age
    const py = tip.y + vy * age + 0.14 * age * age
    if (py > g.ground) return
    dot(out, px, py, f < 0.25 ? WHITE : f < 0.6 ? 0xffe36e : 0xff9a2a)
  })
  if (grinding && t % 2 === 0) spark(out, point, tip.y, 2, tones[1])
  for (const start of [DRILL_PUSH + 2, DRILL_PUSH + 8, DRILL_PUSH + 14]) {
    kick(out, t, a, g, footOf(g, -1) + Math.round(g.side * drillPos(start, far)), { start, count: 2, life: 8, dir: -g.side, size: 1.8, salt: start })
  }

  const age = t - DRILL_END
  if (age === 0) out.shade = tint(WHITE, 0.6)
  jolt(out, age, [[g.side * 2, 1], [-g.side, -1], [g.side, 0]])
  if (age >= 0 && age < 4) spark(out, point, tip.y, [5, 6, 4, 2][age], tones[2])
  if (age >= 1 && age < 5) shockRing(out, point, tip.y, 2 + age * 1.6, tones[2])
}

const STOMP_JUMP = 5
const STOMP_LAND = 12
const STOMP_BACK = 19
const STOMP_HOME = 27
const STOMP_SQUASH = [
  [0, 1], [STOMP_JUMP - 1, 0.84, easeOut], [STOMP_JUMP + 1, 1.12, easeOut], [STOMP_LAND - 2, 1], [STOMP_LAND - 1, 1.12],
  [STOMP_LAND, 0.68], [STOMP_LAND + 2, 0.86, easeOut], [STOMP_LAND + 4, 1.04, easeOut], [STOMP_LAND + 6, 1],
  [STOMP_BACK, 0.92], [STOMP_BACK + 2, 1.03], [STOMP_HOME - 1, 1], [STOMP_HOME, 0.9], [STOMP_HOME + 2, 1],
]

// Stomp's [dx, dy] at tick t, a hop that hangs and then drops hard onto the target
function stompPos(t, g, far) {
  const dx = keys(t, [[0, 0], [STOMP_JUMP, -1, easeOut], [STOMP_LAND, far], [STOMP_BACK, far], [STOMP_HOME, 0, easeInOut]], linear)
  const f = phase(t, STOMP_JUMP, STOMP_LAND)
  const arc = f < 0.7 ? Math.sin((Math.PI / 2) * (f / 0.7)) : Math.cos((Math.PI / 2) * ((f - 0.7) / 0.3))
  const dy = t >= STOMP_JUMP && t < STOMP_LAND ? -Math.round(6 * arc) : hop(t, STOMP_BACK, STOMP_HOME, 2)
  return [Math.round(g.side * dx), dy]
}

// Hop up and forward, hang, then stomp down. Dust billows up, the ground cracks
// open ahead of the foot and the strip quakes.
function stomp(out, t, a, g, c) {
  const far = travel(g, 7, 5)
  ;[out.dx, out.dy] = stompPos(t, g, far)
  squash(out, keys(t, STOMP_SQUASH, linear))
  if (t >= STOMP_JUMP && t < STOMP_LAND) lean(out, g, -1.5)
  const age = t - STOMP_LAND
  lean(out, g, sway(age, 2, 8))
  jolt(out, age, [[0, 2], [0, -1], [0, 1], [0, -1]])
  const toe = footOf(g, 1) + g.side * far
  const heel = footOf(g, -1) + g.side * far
  const plume = mix(c, 0xd8d4cc, 0.6)
  kick(out, t, a, g, toe, { start: STOMP_LAND, count: 3, life: 16, dir: g.side, size: 3, rise: 8, roll: 2, c: plume })
  kick(out, t, a, g, heel, { start: STOMP_LAND, count: 3, life: 16, dir: -g.side, size: 3, rise: 8, roll: 4, c: plume, salt: 4 })
  if (age >= 0) fissure(out, a, g, toe + g.side * 2, age, c)
  debris(out, t, a, g, toe + g.side * 3, g.ground - 1, { start: STOMP_LAND, count: 8, speed: 1.1, c: dark(c, 0.2) })
  kick(out, t, a, g, g.cx, { start: STOMP_HOME, count: 2, life: 4, size: 1.6, rise: 1, c: plume, salt: 9 })
}

// The ground splitting ahead of x, jagged shards jutting up between dark cracks
// before they sink back and crumble
function fissure(out, a, g, x, age, c) {
  if (age > 16) return
  const deep = dark(c, 0.75)
  const lip = light(c, 0.55)
  const base = c
  const shadow = dark(c, 0.35)
  const len = Math.min(11, 3 + age * 4)
  const sink = phase(age, 8, 16)
  for (let d = 0; d <= len; d++) {
    const px = x + g.side * d
    const r = rnd(a.seed, d, 77)
    if (r < 0.3) {
      dot(out, px, g.ground, deep)
      if (r < 0.15 && sink < 0.5) dot(out, px, g.ground - 1, deep)
      continue
    }
    const tall = Math.round((2 + 3 * rnd(a.seed, d, 70)) * (1 - d / (len + 5)) * (1 - sink))
    for (let y = 0; y < tall; y++) dot(out, px, g.ground - y, y === tall - 1 ? lip : y === 0 ? shadow : base)
  }
}

const SLAM_TURN = 3
const SLAM_BACKED = 6
const SLAM_WHIP = 11
const SLAM_HIT = 13
const SLAM_BACK = 18
const SLAM_HOME = 30

// How far toward the target the slam has carried the mon at tick t
const slamPos = (t, far) => keys(t, [
  [0, 0], [SLAM_BACKED, -2, easeOut], [SLAM_WHIP - 1, -3, easeOut], [SLAM_HIT, far, easeIn], [SLAM_HIT + 3, far - 1, easeOut],
  [SLAM_BACK, far - 1], [SLAM_HOME, 0, easeInOut],
], linear)

// Spin around to turn its back, then whip the body over and down into the target
// in a big swoosh, landing with a crash
function slam(out, t, a, g, c) {
  const far = travel(g, 8, 5)
  out.dx = Math.round(g.side * slamPos(t, far))
  out.flipX = t >= SLAM_TURN && t < SLAM_WHIP
  if (t < SLAM_TURN) out.sx = lerp(1, 0.2, easeIn(phase(t, 0, SLAM_TURN)))
  else if (t < SLAM_BACKED) out.sx = lerp(0.2, 1, easeOut(phase(t, SLAM_TURN, SLAM_BACKED)))
  else if (t < SLAM_WHIP - 1) squash(out, 0.92)
  else if (t < SLAM_WHIP) out.sx = 0.4
  else if (t < SLAM_HIT) out.sx = t === SLAM_WHIP ? 0.7 : 1.14
  else if (t < SLAM_HIT + 4) press(out, [0.84, 1.08, 1.04, 1.01][t - SLAM_HIT])
  if (t >= SLAM_BACKED && t < SLAM_WHIP - 1) lean(out, g, -2)
  else if (t >= SLAM_WHIP - 1 && t < SLAM_HIT) lean(out, g, -3)
  lean(out, g, sway(t - SLAM_HIT, 3.5, 10))
  if (t >= SLAM_WHIP && t < SLAM_HIT) out.ghosts = afterimages(t, 2, (k) => [Math.round(g.side * slamPos(k, far)), 0], light(c, 0.4))

  const cx = g.cx + out.dx
  const room = g.side > 0 ? g.columns - 1 - cx : cx
  const r = clamp((g.bottom - g.top) / 2 + 3, 7, Math.min(12, room - 1))
  const lead = keys(t, [[SLAM_WHIP - 1, -0.9], [SLAM_HIT, 2.4, easeOut]], linear)
  const tail = keys(t, [[SLAM_WHIP - 1, -0.9], [SLAM_HIT, 0.5], [SLAM_HIT + 4, 2.4, easeIn]], linear)
  if (t >= SLAM_WHIP - 1 && t < SLAM_HIT + 4) swoosh(out, g, cx, g.cy, r, tail, lead, c)

  const x = aimX(g, far + 1)
  const y = Math.round((g.mouth.y + g.ground) / 2)
  const age = t - SLAM_HIT
  if (age === 0) out.shade = tint(WHITE, 0.6)
  jolt(out, age, [[g.side * 2, 1], [-g.side, -1], [g.side, 1], [0, -1]])
  if (age >= 0 && age < 5) star(out, x, y, [6, 8, 7, 5, 3][age], c, 8, 0.2)
  if (age >= 0 && age < 3) crack(out, x, y, 7 + age, 10 + age * 2, light(c, 0.4), 8)
  debris(out, t, a, g, x, y, { start: SLAM_HIT, count: 6, speed: 1.1 })
  kick(out, t, a, g, x, { start: SLAM_HIT + 1, count: 2, life: 10, dir: g.side, size: 2, paint: dot })
}

const TACKLE_WIND = 6
const TACKLE_HIT = 10
const TACKLE_BACK = 20

// How far forward the tackle has carried the mon at tick t
function tackleDash(t, far) {
  if (t < TACKLE_WIND) return -Math.round(2 * easeOut(phase(t, 0, TACKLE_WIND)))
  if (t < TACKLE_HIT) return Math.round(lerp(-2, far, (t - TACKLE_WIND + 1) / (TACKLE_HIT - TACKLE_WIND)))
  if (t < TACKLE_HIT + 2) return far
  return Math.round(far * (1 - easeOut(phase(t, TACKLE_HIT + 2, TACKLE_BACK))))
}

// Rock back onto the haunches, sprint in a blur, crunch into the target with a
// starburst and a jolt, hold the hit for a beat, then bounce home with a little hop
function tackle(out, t, a, g, c) {
  const far = clamp(g.reach - 3, 2, 8)
  const hitX = g.ahead(far)
  const hitY = g.mouth.y + 1
  const dash = tackleDash(t, far)
  out.dx = g.side * dash
  if (t < TACKLE_WIND) {
    const f = easeOut(phase(t, 0, TACKLE_WIND))
    out.sy = 1 - 0.1 * f
    out.sx = 1 + 0.06 * f
  } else if (t < TACKLE_HIT) {
    // Afterimages where the mon just was, and streaks trailing off its back
    out.ghosts = [1, 2].map((k) => ghost(g.side * tackleDash(t - k, far), 0, light(c, 0.3 + 0.2 * k), 0.45 + 0.2 * k))
    const back = (g.side > 0 ? g.left : g.right) + g.side * dash
    for (let k = 0; k < 4; k++) {
      const y = g.top + 2 + Math.round(((g.bottom - g.top - 3) * k) / 3)
      const tail = back - g.side * (2 + ((k * 2 + t) % 3))
      for (let d = 0; d < 4; d++) dot(out, tail - g.side * d, y, d === 0 ? WHITE : light(c, 0.5))
    }
  } else if (t < TACKLE_HIT + 2) {
    out.sx = 0.86
    out.sy = 1.06
  } else if (t < TACKLE_BACK) {
    out.dy = -Math.round(Math.sin(phase(t, TACKLE_HIT + 2, TACKLE_BACK) * Math.PI) * 2)
  }
  if (t === TACKLE_HIT) out.shade = (x, y, col) => mix(col, WHITE, 0.7)
  if (t === TACKLE_HIT || t === TACKLE_HIT + 1) out.shake = [t === TACKLE_HIT ? g.side : -g.side, 0]

  const age = t - TACKLE_HIT
  if (age >= 0 && age < 7) burst(out, hitX, hitY, age < 3 ? 3 + age : 5 - (age - 3), age < 2 ? WHITE : c)
  emit(t, { count: 7, start: TACKLE_HIT, gap: 0, life: 12 }, (i, life, f) => {
    const angle = -Math.PI / 2 + (rnd(a.seed, i) - 0.5) * 2.6
    const speed = 1 + rnd(a.seed, i, 1) * 0.9
    const x = hitX + Math.cos(angle) * speed * life
    const y = hitY + Math.sin(angle) * speed * life + 0.06 * life * life
    if (y <= g.ground) dot(out, x, y, f < 0.4 ? WHITE : c)
  })
}

// A pose that runs (cycles the walk frames) over [from, to)
const running = (from, to) => (t) => ({ stride: t >= from && t < to })

export const CHARGES = {
  tackle: { ticks: 30, color: 0xffe36e, pose: running(TACKLE_WIND, TACKLE_HIT), draw: tackle },
  quickattack: { ticks: 28, color: 0xffffff, pose: running(2, QUICK_GO), draw: quickattack },
  bodyslam: { ticks: 40, color: 0xffe36e, draw: bodyslam },
  headbutt: { ticks: 32, color: 0xffe36e, pose: running(HEAD_REAR, HEAD_HIT), draw: headbutt },
  skullbash: { ticks: 48, color: 0xffe36e, pose: running(SKULL_GO, SKULL_HIT), draw: skullbash },
  takedown: { ticks: 40, color: 0xffe36e, pose: (t) => ({ stride: pawing(t) || (t >= DOWN_GO && t < DOWN_HIT) }), draw: takedown },
  rage: { ticks: 44, color: 0xff4a3a, pose: running(RAGE_GO, RAGE_HIT), draw: rage },
  thrash: { ticks: 48, color: 0xffe36e, pose: running(2, 36), draw: thrash },
  outrage: { ticks: 52, color: 0x7a4dff, pose: running(9, 35), draw: outrage },
  hornattack: { ticks: 32, color: 0xffffff, pose: running(HORN_REAR, HORN_HIT), draw: hornattack },
  horndrill: { ticks: 48, color: 0xffffff, pose: running(DRILL_FORM, DRILL_END), draw: horndrill },
  stomp: { ticks: 32, color: 0xc8a070, draw: stomp },
  slam: { ticks: 36, color: 0xffe36e, draw: slam },
}
