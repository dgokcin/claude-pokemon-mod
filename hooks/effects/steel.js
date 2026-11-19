// Steel moves

import {
  WHITE, back, ball, baseAt, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, keys, lean, lerp,
  light, line, linear, mix, phase, plus, rimGlow, rnd, skewAt, spark, sparkles, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const HOT = 0xffc65a
const EMBER = 0xc2581a
const DUST = 0xb8ab94
const POLE_N = 0xe0483e
const POLE_S = 0x3e6ee0

// Steel from a white glint down to a dark edge, so pale grey still reads on light backgrounds
const metal = (c) => [WHITE, light(c, 0.45), c, dark(c, 0.35), dark(c, 0.62)]

// How far a dash can carry the mon toward the target
const travel = (g, most, margin = 4) => clamp(g.reach - margin, 1, most)

// Keeps x inside the strip with `pad` pixels to spare
const within = (g, x, pad = 2) => clamp(x, pad, g.columns - 1 - pad)

// Every other pixel, for things breaking up as they fade
const dither = (out, x, y, c) => (Math.round(x) + Math.round(y)) % 2 && dot(out, x, y, c)

// A paint that drops pixels outside the strip
const clipped = (g, paint = dot) => (out, x, y, c) => {
  if (x >= 0 && x < g.columns && y >= 0 && y <= g.ground) paint(out, x, y, c)
}

// The leftmost and rightmost body pixels on row y, or null when the row is empty
function rowSpan(g, y) {
  let l = null
  let r = null
  for (let x = g.left; x <= g.right; x++) {
    if (!g.solid(x, y)) continue
    if (l === null) l = x
    r = x
  }
  return l === null ? null : { l, r }
}

// Whether a sprite pixel at base spot (bx, by) touches the air
const onRim = (g, bx, by) => !g.solid(bx - 1, by) || !g.solid(bx + 1, by) || !g.solid(bx, by - 1) || !g.solid(bx, by + 1)

// Hot sparks thrown from (x, y) in a fan around `angle`, short streaks that fall and cool
function sparks(out, t, a, g, x, y, { start, count = 8, gap = 0, life = 9, angle = -Math.PI / 2, spread = 2, speed = 1.2, fall = 0.08, salt = 0 }) {
  emit(t, { count, start, gap, life }, (i, age, f) => {
    const dir = angle + (rnd(a.seed, i, salt) - 0.5) * spread
    const v = speed * (0.6 + rnd(a.seed, i, salt + 1) * 0.9)
    const vx = Math.cos(dir) * v
    const vy = Math.sin(dir) * v + 2 * fall * age
    const px = x + Math.cos(dir) * v * age
    const py = y + Math.sin(dir) * v * age + fall * age * age
    if (py > g.ground || px < 0 || px >= g.columns) return
    dot(out, px, py, f < 0.3 ? WHITE : f < 0.65 ? HOT : EMBER)
    if (f < 0.6) dot(out, px - vx * 0.8, py - vy * 0.8, f < 0.3 ? HOT : EMBER)
  })
}

// A tapered stroke along a quadratic curve from p0 through control p1 to p2, toned in
// layers from the dark rim in to the core. Only the stretch from `from` to `to` shows.
function blade(out, p0, p1, p2, width, tones, from = 0, to = 1, paint = dot) {
  if (to <= from) return
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const steps = Math.ceil(len * 2) + 1
  for (let layer = tones.length - 1; layer >= 0; layer--) {
    for (let k = 0; k <= steps; k++) {
      const s = k / steps
      if (s < from || s > to) continue
      const u = 1 - s
      const x = u * u * p0.x + 2 * u * s * p1.x + s * s * p2.x
      const y = u * u * p0.y + 2 * u * s * p1.y + s * s * p2.y
      const dx = 2 * u * (p1.x - p0.x) + 2 * s * (p2.x - p1.x)
      const dy = 2 * u * (p1.y - p0.y) + 2 * s * (p2.y - p1.y)
      const n = Math.hypot(dx, dy) || 1
      const w = ((width / 2) * Math.sqrt(Math.sin(Math.PI * s)) + 0.3) * ((layer + 1) / tones.length)
      for (let d = -w; d <= w + 1e-6; d += 0.5) paint(out, x - (dy / n) * d, y + (dx / n) * d, tones[layer])
    }
  }
}

const straight = (p0, p2) => ({ x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 })

// A gear of radius r turned by angle: teeth round a lit rim, a groove and a hollow hub
function gear(out, x, y, r, angle, c, teeth = 8, paint = dot) {
  const [hi, lit, base, deep, edge] = metal(c)
  const tip = r + 1.3
  const hole = Math.max(0.6, r * 0.28)
  for (let py = Math.floor(y - tip); py <= Math.ceil(y + tip); py++) {
    for (let px = Math.floor(x - tip); px <= Math.ceil(x + tip); px++) {
      const dx = px - x
      const dy = py - y
      const d = Math.hypot(dx, dy)
      const tooth = Math.cos((Math.atan2(dy, dx) - angle) * teeth) > 0.05
      const outer = tooth ? tip : r
      if (d > outer + 0.3 || d < hole) continue
      const shine = (dx + dy) / Math.max(1, r)
      let col
      if (d > outer - 0.7 || d < hole + 0.9) col = edge
      else if (r >= 3 && Math.abs(d - r * 0.62) < 0.45) col = deep
      else col = shine < -0.8 ? hi : shine < -0.1 ? lit : shine < 0.7 ? base : deep
      paint(out, px, py, col)
    }
  }
}

// An ellipse outline, or the part of it within `spread` radians of `angle`
function ellipse(out, x, y, rx, ry, c, paint = dot, angle = 0, spread = Math.PI) {
  const steps = Math.max(8, Math.ceil(Math.max(rx, ry) * spread * 2.4))
  for (let k = 0; k <= steps; k++) {
    const ang = angle - spread + (2 * spread * k) / steps
    paint(out, x + rx * Math.cos(ang), y + ry * Math.sin(ang), c)
  }
}

const PLATE = 4
const PLATE_ON = [4, 20]
const DEF_SWEEP = [24, 33]
const DEF_SHINE = 33
const DEF_OFF = [37, 44]

// Bolt on armor: riveted steel plates clank onto the body row by row from the feet
// up, each with a jolt and sparks, then a bright band rolls down the plating
function irondefense(out, t, a, g, c) {
  const [hi, lit, , deep, edge] = metal(c)
  const rows = Math.max(1, Math.ceil((g.bottom - g.top + 1) / PLATE))
  const placed = (k) => Math.round(lerp(PLATE_ON[0], PLATE_ON[1], k / Math.max(1, rows - 1)))
  const fade = 1 - phase(t, ...DEF_OFF)
  let thud = 0
  for (let k = 0; k < rows; k++) {
    const age = t - placed(k)
    if (age === 0) thud = 1
    else if (age === 1) thud = Math.max(thud, 0.4)
  }
  const armored = phase(t, PLATE_ON[0], PLATE_ON[1] + 2) * fade
  out.sy = 1 - 0.05 * thud - 0.03 * armored
  out.sx = 1 + 0.04 * thud + 0.03 * armored
  if (thud === 1) out.shake = [0, 1]
  const sweep = t >= DEF_SWEEP[0] && t < DEF_SWEEP[1] ? lerp(g.top - 3, g.bottom + 3, easeInOut(phase(t, ...DEF_SWEEP))) : null
  const at = baseAt(g, out)
  if (fade > 0) {
    out.shade = (x, y, col) => {
      const [bx, by] = at(x, y)
      const up = g.bottom - by
      const k = Math.floor(up / PLATE)
      const age = t - placed(k)
      if (age < 0) return col
      const ry = up % PLATE
      // Seams run every eight columns, staggered row to row
      const rx = (((bx - g.left + (k % 2 ? 4 : 0)) % 8) + 8) % 8
      let k2
      if (age === 0) k2 = mix(col, WHITE, 0.75)
      else if (ry === PLATE - 1 || rx === 0) k2 = mix(col, edge, 0.75 * fade)
      else if (ry === PLATE - 2 && (rx === 1 || rx === 7)) k2 = mix(col, hi, 0.9 * fade)
      else k2 = mix(col, ry === PLATE - 2 ? lit : ry === 0 ? deep : c, 0.68 * fade)
      if (sweep === null) return k2
      const d = Math.abs(by - sweep)
      return d < 1 ? mix(k2, WHITE, 0.8) : d < 2.5 ? mix(k2, WHITE, 0.35) : k2
    }
  }
  for (let k = 0; k < rows; k++) {
    const y = clamp(g.bottom - k * PLATE - (PLATE - 2), g.top, g.bottom)
    const span = rowSpan(g, y)
    if (!span) continue
    const opts = { start: placed(k), count: 3, life: 7, spread: 1.2, speed: 0.9 }
    sparks(out, t, a, g, span.l - 1, y, { ...opts, angle: -Math.PI * 0.75, salt: k * 4 })
    sparks(out, t, a, g, span.r + 1, y, { ...opts, angle: -Math.PI * 0.25, salt: k * 4 + 2 })
  }
  const shine = t - DEF_SHINE
  const head = rowSpan(g, g.top + 2) ?? { l: g.left, r: g.right }
  if (shine >= 0 && shine < 7) spark(out, head.r - 1, g.top + 2, [1, 2, 3, 3, 2, 1, 0][shine], lit)
}

const CLAW_GO = 8
const CLAW_HIT = 11
const CLAW_HOME = 26
const hotTones = [WHITE, 0xfff0c8, HOT, EMBER]

// Steel claws slide out and glint, then lunge and rip three hooked gouges upward
// through the target that glow hot, spit sparks, and cool to grey
function metalclaw(out, t, a, g, c) {
  const tones = metal(c)
  const far = travel(g, 6, 6)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [5, -2, easeOut], [CLAW_GO, -2], [CLAW_HIT, far, easeIn], [CLAW_HIT + 4, far - 1], [CLAW_HOME, 0]]))
  out.dy = Math.round(keys(t, [[0, 0], [5, 1], [CLAW_GO, 1], [CLAW_HIT, -1], [CLAW_HIT + 4, 0]]))
  out.skew = lean(g, g.side * keys(t, [[0, 0], [5, -2], [CLAW_GO, -2], [CLAW_HIT, 3, easeIn], [CLAW_HIT + 5, 1], [CLAW_HOME, 0]]))
  if (t === CLAW_HIT) out.shake = [g.side * 2, 0]
  if (t === CLAW_HIT + 1) out.shake = [0, -1]

  // Three blades jut from the front low on the body until the swipe
  const ly = clamp(g.mouth.y + Math.round((g.bottom - g.mouth.y) * 0.45), g.top, g.bottom - 1)
  const grow = easeOut(phase(t, 2, 6)) * (1 - phase(t, CLAW_HIT, CLAW_HIT + 2))
  if (grow > 0) {
    const fx = g.frontAt(ly) + out.dx + skewAt(out, ly + out.dy)
    const len = Math.round(1 + grow * 3)
    for (let j = -1; j <= 1; j++) {
      const y0 = ly + out.dy + j * 2
      for (let k = 0; k <= len; k++) {
        const x = fx + g.side * k
        const y = y0 - Math.floor(k / 2)
        dot(out, x, y + 1, tones[4])
        dot(out, x, y, k === len ? lightTip(t, j) : k === len - 1 ? tones[1] : tones[2])
      }
    }
  }

  const tx = within(g, g.target.x, 5)
  const ty = g.target.y
  const hh = clamp(Math.round((g.ground - 3) * 0.3), 4, 6)
  const head = phase(t, CLAW_HIT - 1, CLAW_HIT + 2)
  const tail = easeIn(phase(t, CLAW_HIT + 6, CLAW_HIT + 15))
  if (head > 0 && tail < 1) {
    const age = t - CLAW_HIT
    const look = age < 3 ? hotTones : age < 6 ? [light(c, 0.6), HOT, c, tones[4]] : [tones[1], c, tones[3], tones[4]]
    for (let j = -1; j <= 1; j++) {
      const p0 = { x: tx + g.side * (j * 4 - 3), y: ty + hh + j }
      const p1 = { x: tx + g.side * (j * 4 + 3), y: ty + hh * 0.4 + j }
      const p2 = { x: tx + g.side * (j * 4 + 2), y: ty - hh + j }
      blade(out, p0, p1, p2, 2.4 - tail, look, tail, head)
      sparks(out, t, a, g, p2.x, p2.y, { start: CLAW_HIT + 1, count: 6, life: 10, angle: -Math.PI / 2 + g.side * 0.6, spread: 1.4, speed: 1.1, salt: j * 3 + 3 })
    }
  }
}

// The glint that runs up and down the jutting claws
const lightTip = (t, j) => ((t + j) % 3 === 0 ? WHITE : 0xe8eef4)

const SOUND_ON = 6
const SOUND_OFF = 30

// Raise a steel sheet and bow it back and forth so it rings, sending hard square
// brackets of sound at the target, which rattles while the mon shivers
function metalsound(out, t, a, g, c) {
  const [hi, lit, base, deep, edge] = metal(c)
  const live = t >= SOUND_ON && t < SOUND_OFF
  if (t >= 1 && t < SOUND_ON) {
    out.dx = -g.side
    out.sy = 1 + 0.05 * phase(t, 1, SOUND_ON)
  } else if (live) {
    out.dx = t % 2 ? 0 : -g.side
    if (t % 4 === 0) out.shake = [0, 1]
  }
  const grow = easeOut(phase(t, 1, SOUND_ON)) * (1 - phase(t, SOUND_OFF, SOUND_OFF + 5))
  if (grow <= 0) return
  const sx = within(g, g.ahead(3), 2)
  const sy = clamp(g.mouth.y + 1, 4, g.ground - 4)
  const hh = clamp(Math.round((g.bottom - g.top) * 0.35), 3, 6)
  const reach = Math.round(hh * grow)
  const flex = live ? (t % 2 ? 1 : -1) : 0
  const glint = sy - reach + ((t * 2) % (2 * reach + 1))
  for (let k = -reach; k <= reach; k++) {
    const y = sy + k
    const bow = Math.round(Math.cos((k / Math.max(1, hh)) * (Math.PI / 2)) * flex)
    const x = sx + g.side * bow
    const cap = Math.abs(k) === reach
    dot(out, x - g.side, y, edge)
    dot(out, x, y, cap ? edge : y === glint ? WHITE : k < 0 ? hi : lit)
    dot(out, x + g.side, y, cap ? edge : deep)
  }

  const room = Math.max(4, Math.abs(g.target.x - sx) + 3)
  emit(t, { count: 8, gap: 3, start: SOUND_ON, life: 9 }, (i, age, f) => {
    const r = 2 + f * room
    const x = sx + g.side * r
    const half = Math.min(hh * 0.7 + age * 1.1, g.ground - 1)
    const y0 = clamp(sy - half, 0, g.ground)
    const y1 = clamp(sy + half, 0, g.ground)
    const col = f < 0.3 ? WHITE : f < 0.6 ? hi : base
    const paint = f < 0.7 ? dot : dither
    const arm = 3
    // A dark backing line behind each bracket so it reads on a light background
    line(out, x - g.side * 2, y0 + 1, x - g.side * 2, y1 - 1, edge, paint)
    line(out, x - g.side, y0 + 1, x - g.side, y1 - 1, i % 2 ? deep : lit, paint)
    line(out, x, y0, x, y1, col, paint)
    line(out, x - g.side * arm, y0, x, y0, edge, paint)
    line(out, x - g.side * arm, y1, x, y1, edge, paint)
    if (f < 0.6) {
      dot(out, x, y0, WHITE)
      dot(out, x, y1, WHITE)
    }
  })
  if (live && t >= SOUND_ON + 6) {
    const tx = within(g, g.target.x, 4)
    const ty = g.target.y
    const jig = t % 2 ? 1 : -1
    for (const s of [-1, 1]) {
      line(out, tx + s * (4 + (jig > 0 ? 1 : 0)), ty - 2, tx + s * (4 + (jig > 0 ? 1 : 0)), ty + 2, s * jig > 0 ? hi : deep)
      dot(out, tx + s * 6, ty + jig, lit)
    }
  }
}

const HEAD_STEEL = [1, 9]
const HEAD_GO = 11
const HEAD_HIT = 14
const HEAD_RING = 9
const HEAD_HOME = 32

const headPos = (t, far) => keys(t, [
  [0, 0], [HEAD_STEEL[1], -2, easeOut], [HEAD_GO, -2], [HEAD_HIT, far, easeIn], [HEAD_HIT + 2, far - 1, easeOut],
  [HEAD_HIT + HEAD_RING, far - 1], [HEAD_HOME, 0],
], easeInOut)

// The head alone turns to polished steel, a glint crossing it, then the mon rams in
// head first. The clang rings out in bell arcs and the mon shudders with it.
function ironhead(out, t, a, g, c) {
  const [hi, lit, , deep, edge] = metal(c)
  const far = travel(g, 8, 5)
  const ring = t - HEAD_HIT
  const ringing = ring >= 1 && ring < HEAD_RING
  out.dx = Math.round(g.side * headPos(t, far)) + (ringing && ring % 2 ? -g.side : 0)
  out.skew = lean(g, g.side * keys(t, [[0, 0], [HEAD_STEEL[1], 2.5], [HEAD_HIT, 3], [HEAD_HIT + 3, -1], [HEAD_HIT + HEAD_RING, 0]]))
  if (ring >= 0 && ring < 3) {
    out.sx = [0.84, 0.92, 0.98][ring]
    out.sy = 1 + (1 - out.sx) * 0.5
  }
  if (t > HEAD_GO && t < HEAD_HIT) {
    out.ghosts = [1, 2].map((k) => ghost(Math.round(g.side * headPos(t - k, far)), 0, lit, 0.4 + 0.2 * k))
  }
  const steel = phase(t, ...HEAD_STEEL) * (1 - phase(t, HEAD_HOME - 6, HEAD_HOME))
  const neck = g.top + (g.bottom - g.top) * 0.48
  const w = g.right - g.left + 6
  const glintAt = t < HEAD_GO
    ? lerp(-w / 2 - 3, w / 2 + 3, phase(t, 3, HEAD_STEEL[1] + 1))
    : lerp(-w / 2 - 3, w / 2 + 3, phase(t, HEAD_HIT + 1, HEAD_HIT + 6))
  const at = baseAt(g, out)
  if (ring === 0) out.shade = tint(WHITE, 0.6)
  else if (steel > 0) {
    out.shade = (x, y, col) => {
      const [bx, by] = at(x, y)
      if (by > neck + 1) return col
      const f = (by > neck ? 0.5 : 1) * steel
      const u = (bx - g.cx) * g.side - (by - g.top) * 0.5
      if (Math.abs(u - glintAt) < 1) return mix(col, WHITE, 0.85 * f)
      return onRim(g, bx, by) ? mix(col, edge, 0.8 * f) : mix(col, Math.abs(u - glintAt) < 2.5 ? hi : c, 0.72 * f)
    }
  }
  const hy = clamp(Math.round((g.top + neck) / 2), 2, g.ground - 2)
  const hx = within(g, g.frontAt(hy) + g.side * (far + 1), 3)
  const shakes = [[g.side * 2, 0], [-g.side * 2, 0], [g.side, 0], [-g.side, 0], [g.side, 0], [-g.side, 0]]
  if (ring >= 0 && ring < shakes.length) out.shake = shakes[ring]
  if (ring >= 0 && ring < 3) {
    disc(out, hx, hy, [4, 3.5, 2][ring], edge, clipped(g))
    disc(out, hx, hy, [3, 2.5, 1][ring], ring ? hi : WHITE, clipped(g))
  }
  emit(t, { count: 4, gap: 2, start: HEAD_HIT, life: 7 }, (i, age, f) => {
    const rx = 2 + age * 1.8
    const ry = 3 + age * 2
    const paint = f > 0.6 ? dither : dot
    for (const s of [0, Math.PI]) {
      ellipse(out, hx, hy, rx + 1, ry + 1, edge, clipped(g, paint), s, 1.2)
      ellipse(out, hx, hy, rx, ry, f < 0.3 ? WHITE : f < 0.6 ? hi : deep, clipped(g, paint), s, 1.2)
    }
  })
  sparks(out, t, a, g, hx, hy - 1, { start: HEAD_HIT, count: 6, life: 10, angle: -Math.PI / 2 - g.side * 0.7, spread: 1.2, speed: 1.2, salt: 1 })
  sparks(out, t, a, g, hx, hy - 1, { start: HEAD_HIT, count: 6, life: 10, angle: -Math.PI / 2 + g.side * 0.6, spread: 1.2, speed: 1.3, salt: 5 })
}

const PANE_UP = [2, 8]
const PANE_GLEAM = [9, 16]
const SHOT = 17
const SHOT_END = 26
const PANE_DOWN = [28, 34]

// A tilted steel mirror swings up in front, catches motes of light until it blazes,
// then fires a fan of reflected rays that meet in a blinding glare on the target
function mirrorshot(out, t, a, g, c) {
  const [hi, lit, base, deep, edge] = metal(c)
  const open = easeOut(phase(t, ...PANE_UP)) * (1 - phase(t, ...PANE_DOWN))
  const px = within(g, g.ahead(2), 3)
  const py = clamp(g.mouth.y, 5, g.ground - 5)
  const hh = Math.round(clamp(Math.round((g.bottom - g.top) * 0.3), 3, 6) * open)
  const { x: tx, y: ty } = g.target
  if (t >= 1 && t < SHOT) out.skew = lean(g, -g.side * phase(t, 1, 5))
  if (t >= SHOT && t < SHOT + 3) out.dx = -g.side
  const blaze = t >= SHOT - 2 && t < SHOT + 1
  const band = t >= PANE_GLEAM[0] && t < PANE_GLEAM[1] ? lerp(-hh - 2, hh + 2, phase(t, ...PANE_GLEAM)) : null
  const paneAt = (k) => px + g.side * Math.round(-k * 0.35)
  if (hh > 0) {
    for (let k = -hh; k <= hh; k++) {
      const x = paneAt(k)
      const cap = Math.abs(k) === hh
      const glass = blaze ? WHITE : band !== null && Math.abs(k - band) < 1.2 ? WHITE : k < -hh / 3 ? hi : k < hh / 3 ? lit : base
      dot(out, x - g.side, py + k, edge)
      dot(out, x, py + k, cap ? deep : glass)
      dot(out, x + g.side, py + k, cap ? edge : deep)
    }
  }
  emit(t, { count: 12, gap: 1, start: 3, life: 6 }, (i, age, f) => {
    if (t >= SHOT) return
    const ang = -Math.PI / 2 + (rnd(a.seed, i, 2) - 0.5) * 2.6
    const r = lerp(10, 1, easeIn(f))
    const x = px + Math.cos(ang) * r
    const y = py + Math.sin(ang) * r * 0.8
    dot(out, x, y, f < 0.5 ? lit : WHITE)
  })
  if (t >= SHOT && t < SHOT_END) {
    const head = phase(t, SHOT, SHOT + 2)
    const from = easeIn(phase(t, SHOT + 4, SHOT_END))
    const sources = [-hh + 1, 0, hh - 1]
    sources.forEach((k, j) => {
      const x0 = paneAt(k) + g.side * 2
      const y0 = py + k
      const xa = lerp(x0, tx, from)
      const ya = lerp(y0, ty, from)
      const xb = lerp(x0, tx, head)
      const yb = lerp(y0, ty, head)
      if (j === 1) line(out, xa, ya + 1, xb, yb + 1, deep)
      line(out, xa, ya, xb, yb, j === 1 ? WHITE : hi)
    })
  }
  const glare = t - SHOT - 2
  if (glare >= 0 && glare < 9) {
    const arm = [7, 9, 8, 6, 5, 4, 3, 2, 1][glare]
    const col = glare < 3 ? WHITE : hi
    line(out, tx - arm, ty, tx + arm, ty, glare < 4 ? lit : base, clipped(g))
    line(out, tx, ty - Math.ceil(arm * 0.6), tx, ty + Math.ceil(arm * 0.6), glare < 4 ? lit : base, clipped(g))
    plus(out, tx, ty, col, WHITE)
    if (glare < 5) ellipse(out, tx, ty, 2 + glare, 1.5 + glare * 0.7, glare < 2 ? hi : deep, clipped(g, dither))
  }
  if (glare === 0) out.shake = [g.side, 0]
  if (glare >= 3 && glare < 16) sparkles(out, t, a.seed, tx, ty, 12, 8, lit, 4)
}

const GYRO_SPIN = 2
const GYRO_GO = 14
const GYRO_HIT = 18
const GYRO_GRIND = 27
const GYRO_HOME = 40

const gyroSpeed = (t) => keys(t, [[0, 0], [GYRO_SPIN, 0], [GYRO_GO, 1], [GYRO_GRIND, 1], [GYRO_HOME - 2, 0]])

// Spin up like a top inside two whirling gyroscope rings, roll into the target and
// grind against it in a fountain of sparks, then roll back as the spin winds down
function gyroball(out, t, a, g, c) {
  const [hi, lit, base, deep, edge] = metal(c)
  const far = travel(g, 7, 6)
  const spin = gyroSpeed(t)
  let turn = 0
  for (let k = 0; k < t; k++) turn += 0.9 * gyroSpeed(k)
  const grinding = t >= GYRO_HIT && t < GYRO_GRIND
  out.dx = Math.round(g.side * keys(t, [[0, 0], [GYRO_GO, -1], [GYRO_HIT, far, easeIn], [GYRO_GRIND, far], [GYRO_HOME, 0]])) + (grinding && t % 2 ? -g.side : 0)
  if (spin > 0.05 && t < GYRO_HOME - 2) {
    out.flipX = Math.cos(turn) < 0
    out.sx = 1 - 0.3 * spin * (1 - Math.abs(Math.cos(turn)))
  }
  const w = g.right - g.left + 1
  const h = g.bottom - g.top + 1
  const stripe = g.cx + Math.sin(turn) * w * 0.35
  if (spin > 0.05) {
    const at = baseAt(g, out)
    out.shade = (x, y, col) => {
      const [bx] = at(x, y)
      const k = mix(col, c, 0.35 * spin)
      return Math.abs(bx - stripe) < 1 ? mix(k, WHITE, 0.6 * spin) : k
    }
  }
  if (spin > 0.3) {
    const cx = (g.left + g.right + 1) / 2 + out.dx
    const cy = g.cy + 0.5
    const rx = w / 2 + 2.5
    const ry = h / 2 + 2
    const rings = [
      { rx, ry: 1 + ry * 0.35 * Math.abs(Math.sin(turn * 0.5)), tones: [lit, deep] },
      { rx: 1 + rx * Math.abs(Math.cos(turn * 0.7)), ry, tones: [base, edge] },
    ]
    for (const r of rings) {
      const steps = Math.ceil(Math.max(r.rx, r.ry) * 6)
      for (let k = 0; k < steps; k++) {
        const ang = (k / steps) * TAU
        const x = cx + r.rx * Math.cos(ang)
        const y = cy + r.ry * Math.sin(ang)
        if (y < 0 || y > g.ground) continue
        const front = Math.sin(ang) > 0
        const col = (k + t) % 7 === 0 ? hi : front ? r.tones[0] : r.tones[1]
        if (front) dot(out, x, y, col)
        else if ((k + t) % 2) back(out, x, y, col)
      }
    }
  }
  const front = (g.side > 0 ? g.right : g.left) + out.dx + g.side
  if (t === GYRO_HIT) {
    disc(out, front, g.cy, 2, WHITE)
    out.shake = [g.side * 2, 0]
  } else if (grinding) out.shake = [t % 2 ? 1 : -1, 0]
  sparks(out, t, a, g, front, g.cy, { start: GYRO_HIT, count: 26, gap: 0.33, life: 8, angle: -Math.PI / 2 + g.side * 0.7, spread: 1.2, speed: 1.4, fall: 0.12, salt: 3 })
}

const BURST_HOLD = [2, 16]
const BURST = 18
const SHARDS = 7

// Brace and soak up the blow, the body darkening under a flickering rim while steel
// filings rush in, then burst it all back as a fan of shards that converge on the target
function metalburst(out, t, a, g, c) {
  const [hi, lit, base, deep, edge] = metal(c)
  const hold = phase(t, ...BURST_HOLD)
  const age = t - BURST
  if (age < 0) {
    out.sy = 1 - 0.08 * easeOut(hold)
    out.sx = 1 + 0.05 * easeOut(hold)
    if (t >= 8) out.dx = tremble(t)
    if (hold > 0) out.shade = rimGlow(g, out, dark(c, 0.2), 0.45 * hold, t % 4 < 2 ? WHITE : edge, 0.75 * hold)
  } else {
    out.dx = -g.side * ([2, 2, 1, 1][age] ?? 0)
    out.sx = [1.12, 1.06][age] ?? 1
    out.sy = 2 - out.sx
    if (age < 2) out.shade = tint(WHITE, 0.7)
    if (age < 2) out.shake = [-g.side * 2, age ? -1 : 1]
  }
  emit(t, { count: 14, gap: 1, start: 1, life: 6 }, (i, life, f) => {
    if (t >= BURST) return
    const ang = rnd(a.seed, i, 4) * TAU
    const r = lerp(13, (g.right - g.left) / 2, easeIn(f))
    const x = g.cx + Math.cos(ang) * r
    const y = g.cy + Math.sin(ang) * r * 0.7
    if (y > g.ground || y < 0) return
    dot(out, x, y, f < 0.5 ? deep : base)
    dot(out, x + Math.cos(ang), y + Math.sin(ang) * 0.7, edge)
  })
  if (age >= 0 && age < 6) {
    const rr = 3 + age * 2
    ellipse(out, g.cx + 0.5, g.cy + 0.5, (g.right - g.left) / 2 + rr, (g.bottom - g.top) / 2 + rr * 0.6, age < 2 ? WHITE : age < 4 ? lit : deep, clipped(g, age < 3 ? dot : dither))
  }
  const fx = g.mouth.x
  const fy = g.cy
  const { x: tx, y: ty } = g.target
  const dist = Math.max(4, Math.hypot(tx - fx, ty - fy))
  emit(t, { count: SHARDS, gap: 0.3, start: BURST, life: 10 }, (i, life, f) => {
    const fan = (i / (SHARDS - 1) - 0.5) * 2.6
    const dir = Math.atan2(ty - fy, (tx - fx) * g.side)
    const ang = g.side > 0 ? dir + fan : Math.PI - dir - fan
    const p1 = { x: fx + Math.cos(ang) * dist, y: clamp(fy + Math.sin(ang) * dist, -2, g.ground + 2) }
    const at = (v) => ({
      x: (1 - v) ** 2 * fx + 2 * (1 - v) * v * p1.x + v * v * tx,
      y: (1 - v) ** 2 * fy + 2 * (1 - v) * v * p1.y + v * v * ty,
    })
    const p = at(f)
    const q = at(Math.max(0, f - 0.1))
    const d = Math.hypot(p.x - q.x, p.y - q.y) || 1
    const ux = (p.x - q.x) / d
    const uy = (p.y - q.y) / d
    const paint = clipped(g)
    for (let k = 0; k < 4; k++) paint(out, p.x - ux * k - uy, p.y - uy * k + ux, edge)
    for (let k = 0; k < 4; k++) paint(out, p.x - ux * k, p.y - uy * k, [WHITE, hi, base, deep][k])
  })
  emit(t, { count: SHARDS, gap: 0.3, start: BURST + 10, life: 4 }, (i, life) => {
    const x = tx + (rnd(a.seed, i, 6) - 0.5) * 6
    const y = ty + (rnd(a.seed, i, 7) - 0.5) * 6
    spark(out, x, y, [2, 1, 1, 0][life], lit)
  })
  const hit = t - BURST - 10
  if (hit >= 0 && hit < 4) out.shake = [[g.side, 0], [0, 1], [-g.side, 0], [0, -1]][hit]
}

const SHED = [6, 18]
const SLIM = [17, 25]
const ZIP = [26, 38]
const CHUNKS = 9

// Where the dash of autotomize has the mon at tick t
const zipAt = (t) => keys(t, [[ZIP[0], 0], [ZIP[0] + 3, -4], [ZIP[0] + 6, 4], [ZIP[0] + 9, -2], [ZIP[1], 0]], easeOut)

// Shiver and shed heavy steel chunks that clatter to the ground, slim down as a glint
// runs up the body, then zip side to side to show off the new speed
function autotomize(out, t, a, g, c) {
  const [, lit, , deep, edge] = metal(c)
  if (t >= 1 && t < SHED[1]) out.dx = tremble(t)
  const slim = easeOut(phase(t, ...SLIM)) * (1 - phase(t, ZIP[1], ZIP[1] + 5))
  out.sx = 1 - 0.12 * slim
  out.sy = 1 + 0.06 * slim
  if (t >= ZIP[0] && t < ZIP[1]) {
    out.dx = Math.round(g.side * zipAt(t))
    out.ghosts = [1, 2]
      .map((k) => Math.round(g.side * zipAt(t - k)))
      .filter((x) => Math.abs(x - out.dx) >= 2)
      .map((x, k) => ghost(x, 0, lit, 0.45 + 0.2 * k))
  }
  const steel = phase(t, 0, 6) * (1 - phase(t, ZIP[1], ZIP[1] + 5))
  const glint = t >= SLIM[0] && t < SLIM[1] + 2 ? lerp(g.bottom + 2, g.top - 2, phase(t, SLIM[0], SLIM[1] + 2)) : null
  if (steel > 0) {
    const at = baseAt(g, out)
    out.shade = (x, y, col) => {
      const k = mix(col, c, 0.3 * steel)
      if (glint === null) return k
      const d = Math.abs(at(x, y)[1] - glint)
      return d < 1 ? mix(k, WHITE, 0.8) : d < 2 ? mix(k, WHITE, 0.35) : k
    }
  }
  const cx = (g.left + g.right + 1) / 2
  const cy = g.cy + 0.5
  for (let i = 0; i < CHUNKS; i++) {
    const born = SHED[0] + i * 1.5
    const age = t - born
    if (age < 0 || age >= 18) continue
    const ang = -Math.PI * (0.1 + 0.8 * ((i * 5) % CHUNKS) / (CHUNKS - 1)) + (rnd(a.seed, i, 8) - 0.5) * 0.4
    let ox = cx
    let oy = cy
    while (g.solid(Math.round(ox + Math.cos(ang)), Math.round(oy + Math.sin(ang)))) {
      ox += Math.cos(ang)
      oy += Math.sin(ang)
    }
    // Step the fall tick by tick so a chunk bounces once off the ground
    let x = ox
    let y = oy
    let vx = Math.cos(ang) * (0.7 + rnd(a.seed, i, 9) * 0.5)
    let vy = -1 - rnd(a.seed, i, 10)
    for (let k = 0; k < Math.floor(age); k++) {
      x += vx
      y += vy
      vy += 0.22
      if (y > g.ground - 1) {
        y = g.ground - 1
        vy = -vy * 0.35
        vx *= 0.6
      }
    }
    if (age >= 13 && t % 2) continue
    if (age < 1) spark(out, ox, oy, 1, lit)
    const paint = clipped(g)
    const size = g.right - g.left > 13 ? 3 : 2
    for (let j = 0; j < size; j++) {
      for (let k = 0; k < size; k++) {
        const rim = j === size - 1 || k === size - 1
        paint(out, x + k, y + j, j + k === 0 ? WHITE : rim ? (j === k ? edge : deep) : j + k === 1 ? lit : c)
      }
    }
  }
  if (t >= ZIP[0] && t < ZIP[1]) {
    const dir = Math.sign(zipAt(t) - zipAt(t - 1)) * g.side
    if (dir !== 0) {
      const tail = dir > 0 ? g.left + out.dx - 2 : g.right + out.dx + 2
      for (let k = 0; k < 3; k++) {
        const y = g.top + Math.round(((g.bottom - g.top) * (k + 1)) / 4)
        line(out, tail, y, tail - dir * (3 + ((k + t) % 3)), y, k === 1 ? lit : deep)
      }
    }
  }
}

const CANNON_CHARGE = [1, 13]
const FIRE = 14
const FIRE_END = 30

// Gather a polished steel orb at the mouth from motes of light, then fire it as a
// thick beam with a white core, rings riding down it, and a flare at the target
function flashcannon(out, t, a, g, c) {
  const [hi, lit, base, deep, edge] = metal(c)
  const charge = easeOut(phase(t, ...CANNON_CHARGE))
  const firing = t >= FIRE && t < FIRE_END
  if (t < FIRE) out.skew = lean(g, -g.side * 1.5 * charge)
  else if (firing) {
    out.dx = -g.side * (t < FIRE + 2 ? 2 : 1)
    out.shake = [t % 2 ? g.side : 0, 0]
  }
  const ox = g.mouth.x + g.side * 2 + out.dx
  const oy = g.mouth.y
  const { x: tx, y: ty } = g.target
  const r = t < FIRE ? 0.5 + 2.5 * charge : firing ? 2.5 + (t % 2) * 0.5 : 2.5 * (1 - phase(t, FIRE_END, FIRE_END + 4))
  if (r > 0.3) {
    disc(out, ox, oy, r + 0.8, edge)
    ball(out, ox, oy, r, light(c, 0.15))
    dot(out, ox - 1, oy - 1, WHITE)
  }
  emit(t, { count: 12, gap: 1, start: 0, life: 6 }, (i, age, f) => {
    if (t >= FIRE) return
    const ang = rnd(a.seed, i, 11) * TAU
    const rr = lerp(10, r + 1, easeIn(f))
    const x = ox + Math.cos(ang) * rr
    const y = oy + Math.sin(ang) * rr * 0.8
    dot(out, x, y, f < 0.5 ? lit : WHITE)
    dot(out, x + Math.cos(ang), y + Math.sin(ang) * 0.8, deep)
  })
  if (!firing) return
  const head = phase(t, FIRE, FIRE + 3)
  const end = within(g, tx + g.side * 3, 0)
  const ex = lerp(ox, end, head)
  const half = keys(t, [[FIRE, 0.5], [FIRE + 2, 2.4], [FIRE_END - 6, 2.4], [FIRE_END, 0]])
  const steps = Math.abs(ex - ox)
  const span = Math.max(1, Math.abs(end - ox))
  for (let k = 0; k <= steps; k++) {
    const x = ox + g.side * k
    const y = Math.round(lerp(oy, ty, k / span))
    // Bands of lower light ride down the beam so it reads as flowing
    const band = (k - (t - FIRE) * 2) % 6 < 2
    const swell = band ? 0.6 : 0
    for (let d = -Math.ceil(half + swell) - 1; d <= Math.ceil(half + swell) + 1; d++) {
      const m = Math.abs(d)
      let col
      if (m <= half * 0.35) col = band ? hi : WHITE
      else if (m <= half * 0.7) col = band ? lit : hi
      else if (m <= half + swell) col = base
      else if (m <= half + swell + 1) col = edge
      else continue
      clipped(g)(out, x, y + d, col)
    }
  }
  if (head >= 1) {
    burst(out, tx, ty, t % 2 ? 4 : 5, lit, clipped(g))
    sparkles(out, t, a.seed, tx, ty, 10, 8, lit, 4)
  }
}

const GEAR_FORM = [1, 6]
const GEAR_FLY = [6, 13]
const GRIND_END = 30
const GEAR_HITS = [14, 22]
const GEAR_OFF = 38

// Two gears spin up beside the mon, fly in and mesh around the target, grinding
// it twice in showers of sparks, then break away and tumble off
function geargrind(out, t, a, g, c) {
  const r = 3
  let turn = 0
  for (let k = 0; k < t; k++) turn += k < GEAR_FLY[1] ? 0.35 : 0.7
  const { x: tx0, y: ty } = g.target
  const tx = within(g, tx0, 5)
  const up = { x: g.mouth.x + g.side * 3, y: clamp(g.mouth.y - 4, r + 1, g.ground - r - 1) }
  const down = { x: g.mouth.x + g.side * 3, y: clamp(g.mouth.y + 4, r + 1, g.ground - r - 1) }
  const meshUp = { x: tx, y: clamp(ty - r - 0.5, r + 1, g.ground - 2 * r - 2) }
  const meshDown = { x: tx, y: meshUp.y + 2 * r + 1 }
  if (t >= GEAR_FLY[0] && t < GEAR_FLY[0] + 3) out.dx = g.side
  const hitAge = GEAR_HITS.map((h) => t - h).find((d) => d >= 0 && d < 3)
  if (hitAge !== undefined) out.shake = [[g.side * 2, 0], [-g.side, 1], [0, 0]][hitAge]
  const jig = t >= GEAR_FLY[1] && t < GRIND_END ? (t % 2 ? 1 : 0) : 0
  const off = phase(t, GRIND_END, GEAR_OFF)
  const paint = clipped(g, off > 0.5 ? dither : dot)
  const flash = hitAge === 0 || hitAge === 1
  const tone = flash ? light(c, 0.6) : c
  const pairs = [[up, meshUp, 1, -1], [down, meshDown, -1, 1]]
  for (const [from, to, dir, away] of pairs) {
    let x
    let y
    let rr = r
    if (t < GEAR_FLY[0]) {
      rr = Math.max(1, r * easeOut(phase(t, ...GEAR_FORM)))
      x = from.x
      y = from.y
    } else if (t < GEAR_FLY[1]) {
      const f = easeIn(phase(t, ...GEAR_FLY))
      x = lerp(from.x, to.x, f)
      y = lerp(from.y, to.y, f) - dir * Math.sin(f * Math.PI) * 3
    } else {
      x = to.x + g.side * jig * dir
      y = to.y
      if (off > 0) {
        x += g.side * off * 6
        y += away < 0 ? -off * 5 : off * off * 8
      }
    }
    if (t >= GEAR_OFF) continue
    gear(out, x, y, rr, dir * turn + (dir < 0 ? Math.PI / 8 : 0), tone, 8, paint)
  }
  const mx = tx - g.side * 2
  const my = meshUp.y + r + 0.5
  sparks(out, t, a, g, mx, my, { start: GEAR_FLY[1], count: 24, gap: 0.65, life: 8, angle: Math.PI / 2 + g.side * (Math.PI / 2 + 0.4), spread: 1.2, speed: 1.3, fall: 0.1, salt: 2 })
  sparks(out, t, a, g, tx + g.side * 2, my, { start: GEAR_FLY[1] + 1, count: 12, gap: 1.3, life: 7, angle: -Math.PI / 2 + g.side * 0.9, spread: 1, speed: 1.1, salt: 9 })
  if (t < GEAR_FORM[1]) for (const p of [up, down]) if ((t + p.y) % 3 === 0) spark(out, p.x + r, p.y - r, 1, light(c, 0.4))
}

const TAIL_TURN = 4
const TAIL_SWING = [9, 15]
const TAIL_HIT = 15
const TAIL_BACK = 28

// Spin round to bring the tail to bear, the tail end glinting steel, then whip it
// overhead in a heavy arc and slam it down on the target with a clang
function irontail(out, t, a, g, c) {
  const [hi, lit, base, deep, edge] = metal(c)
  const far = travel(g, 4, 8)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [TAIL_SWING[0], -1], [TAIL_HIT, far, easeIn], [TAIL_HIT + 5, far], [TAIL_BACK + 6, 0]]))
  out.dy = Math.round(keys(t, [[0, 0], [TAIL_TURN - 1, -2, easeOut], [TAIL_TURN + 2, 0, easeIn], [TAIL_SWING[0], -2, easeOut], [TAIL_HIT, 0, easeIn]]))
  out.flipX = t >= TAIL_TURN && t < TAIL_BACK
  if (t >= TAIL_SWING[0] && t < TAIL_HIT + 4) out.skew = lean(g, -g.side * (t < TAIL_HIT ? 2 : 1))
  const hit = t - TAIL_HIT
  if (hit >= 0 && hit < 3) {
    out.sy = [0.86, 0.94, 0.98][hit]
    out.sx = 2 - out.sy
  }
  const steel = phase(t, TAIL_TURN, TAIL_TURN + 4) * (1 - phase(t, TAIL_HIT + 6, TAIL_BACK))
  const w = g.right - g.left + 1
  if (steel > 0) {
    const mid = (g.left + g.right) / 2 + out.dx
    const glint = lerp(-w / 2, w / 2, phase(t, 6, TAIL_SWING[0]))
    out.shade = (x, y, col) => {
      const u = (x - mid) * g.side
      if (u < w * 0.1) return col
      const v = u - (y - g.top) * 0.4
      return Math.abs(v - glint) < 1 ? mix(col, WHITE, 0.8 * steel) : mix(col, c, 0.55 * steel)
    }
  }
  const { x: tx, y: ty } = g.target
  const R = clamp(Math.min(ty, g.ground * 0.45), 5, 10)
  const head = phase(t, TAIL_SWING[0] - 1, TAIL_HIT)
  const fade = phase(t, TAIL_HIT, TAIL_HIT + 6)
  if (head > 0 && fade < 1) {
    // The chop is laid out facing right around a pivot short of the target, from
    // up and back over the top to forward and down onto it
    const px = tx - g.side * R * 0.7
    const py = ty + 1
    const a0 = -Math.PI / 2 - 0.6
    const lead = lerp(a0, 0.3, easeInOut(head))
    const tail = Math.max(a0, lead - 2 + phase(fade, 0.3, 1) * 2)
    const paint = clipped(g)
    for (let y = Math.floor(py - R - 2); y <= Math.ceil(py + R + 2); y++) {
      for (let x = Math.floor(px - R - 2); x <= Math.ceil(px + R + 2); x++) {
        const u = (x - px) * g.side
        const v = y - py
        const ang = Math.atan2(v, u)
        if (ang < tail || ang > lead) continue
        const d = R - Math.hypot(u, v)
        if (d < -1 || d > 4) continue
        const behind = (lead - ang) / 2
        if (behind > 0.6 && (x + y) % 2) continue
        let col
        if (d < 0) col = edge
        else if (d < 1) col = behind < 0.12 ? WHITE : hi
        else if (d < 2) col = behind < 0.3 ? lit : base
        else if (d < 3) col = deep
        else col = edge
        paint(out, x, y, col)
      }
    }
  }
  if (hit >= 0 && hit < 4) out.shake = [[0, 3], [g.side, -2], [0, 1], [0, -1]][hit]
  if (hit >= 0 && hit < 3) {
    const rx = [6, 8, 7][hit]
    ellipse(out, tx, ty, rx + 1, 2.5, edge, clipped(g))
    ellipse(out, tx, ty, rx, 1.5, hit ? hi : WHITE, clipped(g))
    line(out, tx - rx + 2, ty, tx + rx - 2, ty, WHITE, clipped(g))
  }
  if (hit >= 1 && hit < 6) {
    for (let k = 0; k < 6; k++) {
      const ang = -Math.PI / 2 + (k - 2.5) * 0.45
      const r0 = 3 + hit
      const x0 = tx + Math.cos(ang) * r0
      const y0 = ty + Math.sin(ang) * r0 * 0.8
      const x1 = tx + Math.cos(ang) * (r0 + 3)
      const y1 = ty + Math.sin(ang) * (r0 + 3) * 0.8
      line(out, x0, y0, x1, y1, hit < 3 ? hi : deep, clipped(g, hit < 4 ? dot : dither))
    }
  }
  sparks(out, t, a, g, tx - 2, ty + 1, { start: TAIL_HIT, count: 6, life: 10, angle: -Math.PI * 0.8, spread: 0.9, speed: 1.2, salt: 4 })
  sparks(out, t, a, g, tx + 2, ty + 1, { start: TAIL_HIT, count: 6, life: 10, angle: -Math.PI * 0.2, spread: 0.9, speed: 1.2, salt: 8 })
}

const BOMB_FORM = [2, 9]
const BOMB_FLY = [9, 26]
const BOMB_BLAST = 26

// A spiked steel mine with red and blue poles, wrapped in magnetic field loops
function mine(out, x, y, spin, c, field) {
  const [, lit, base, , edge] = metal(c)
  for (let k = 0; k < 4; k++) {
    const ang = spin + (k * Math.PI) / 2
    const pole = k % 2 ? POLE_S : POLE_N
    line(out, x + Math.cos(ang) * 2.5, y + Math.sin(ang) * 2.5, x + Math.cos(ang) * 3.6, y + Math.sin(ang) * 3.6, edge)
    dot(out, x + Math.cos(ang) * 4, y + Math.sin(ang) * 4, pole)
  }
  disc(out, x, y, 2.6, edge)
  ball(out, x, y, 2, base)
  dot(out, x - 1, y - 1, WHITE)
  if (field <= 0) return
  for (const s of [-1, 1]) {
    const r = 3.5 + field
    ellipse(out, x + s * (r * 0.6), y, r * 0.6, r * 0.9, mix(lit, s < 0 ? POLE_N : POLE_S, 0.45), dither, s < 0 ? Math.PI : 0, 1.9)
  }
}

// Form a spiked magnetic mine that homes in on the target on a weaving path, burst
// it, and snap the flung fragments back together in a final spark
function magnetbomb(out, t, a, g, c) {
  const [hi, lit, , deep] = metal(c)
  const form = easeOut(phase(t, ...BOMB_FORM))
  const sx = g.mouth.x + g.side * 4
  const sy = g.mouth.y
  const { x: tx, y: ty } = g.target
  if (t >= BOMB_FLY[0] && t < BOMB_FLY[0] + 3) out.dx = g.side
  if (t >= 1 && t < BOMB_FLY[0]) out.shade = tint(lit, 0.15 * form)
  const pulse = (t % 6) / 6 * 1.5
  if (t < BOMB_FLY[0]) {
    if (form < 0.6) {
      ellipse(out, sx, sy, 4 - form * 3, 4 - form * 3, lit, dither)
      spark(out, sx, sy, 1, lit)
    } else mine(out, sx, sy, t * 0.3, c, pulse)
  } else if (t < BOMB_BLAST) {
    const f = phase(t, ...BOMB_FLY)
    const at = (v) => ({
      x: lerp(sx, tx, easeInOut(v)),
      y: lerp(sy, ty, v) - Math.sin(v * Math.PI) * 3 + Math.sin(v * TAU * 1.5) * 2 * (1 - v),
    })
    for (let k = 1; k <= 4; k++) {
      const p = at(Math.max(0, f - k * 0.05))
      dot(out, p.x, p.y, k < 2 ? lit : deep)
    }
    const p = at(f)
    mine(out, p.x, p.y, t * 0.5, c, pulse)
  }
  const age = t - BOMB_BLAST
  if (age < 0) return
  if (age < 3) out.shake = [[g.side * 2, 1], [-g.side, -1], [g.side, 0]][age]
  if (age < 5) burst(out, tx, ty, [4, 7, 8, 6, 4][age], age < 2 ? hi : lit, clipped(g))
  if (age >= 1 && age < 6) ellipse(out, tx, ty, 3 + age * 2, 2 + age * 1.4, age < 3 ? lit : deep, clipped(g, age < 3 ? dot : dither))
  // The fragments fly out, then the magnet pulls them back to the middle
  const life = 13
  if (age >= 1 && age < life) {
    const f = (age - 1) / (life - 1)
    const out1 = Math.sin(Math.min(1, f * 1.25) * Math.PI) * 8
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * TAU + 0.2 + f * 2
      const x = tx + Math.cos(ang) * out1
      const y = ty + Math.sin(ang) * out1 * 0.7
      const col = k % 2 ? POLE_S : POLE_N
      clipped(g)(out, x, y, f > 0.7 ? WHITE : col)
      clipped(g)(out, x + Math.cos(ang + 1.6), y + Math.sin(ang + 1.6), deep)
    }
  }
  if (age >= life && age < life + 4) spark(out, tx, ty, [3, 2, 1, 0][age - life], lit)
}

const SHIFT = 24
const GEARS_IN = [2, 8]
const GEARS_OUT = [40, 46]

const shiftSpeed = (t) => keys(t, [[0, 0.1], [GEARS_IN[1], 0.15], [SHIFT, 0.3], [SHIFT + 1, 0], [SHIFT + 3, 0.65], [GEARS_OUT[0], 0.65], [GEARS_OUT[1], 0.2]])

// A big and a small gear mesh behind the body and turn faster and faster, click into
// a higher gear with a jolt and a glint, then spin flat out until they fade
function shiftgear(out, t, a, g, c) {
  const h = g.bottom - g.top + 1
  const big = clamp(Math.round(h * 0.22), 3, 5)
  const small = Math.max(2, big - 1.5)
  let turn = 0
  for (let k = 0; k < t; k++) turn += shiftSpeed(k)
  const show = easeOut(phase(t, ...GEARS_IN)) * (1 - phase(t, ...GEARS_OUT))
  const after = t >= SHIFT
  const beat = after ? 4 : 8
  const bob = phase(t, GEARS_IN[0], GEARS_IN[1]) * (1 - phase(t, GEARS_OUT[0] - 2, GEARS_OUT[0] + 2))
  out.dy = -Math.round(Math.max(0, Math.sin((t * TAU) / beat)) * bob)
  const click = t - SHIFT
  if (click === 0) {
    out.dy = -2
    out.sy = 1.06
    out.shake = [0, 1]
  }
  const glint = click >= 1 && click < 9 ? lerp(g.left - 3, g.right + 3, phase(click, 1, 9)) : null
  const steel = 0.25 * show
  if (steel > 0) {
    const at = baseAt(g, out)
    out.shade = (x, y, col) => {
      const k = mix(col, c, steel)
      if (glint === null) return k
      const d = Math.abs(at(x, y)[0] - glint)
      return d < 1 ? mix(k, WHITE, 0.75) : d < 2 ? mix(k, WHITE, 0.3) : k
    }
  }
  if (show <= 0) return
  // The gears turn on the mon's back shoulder, or the roomier one, the small one meshed above
  const roomAt = (s) => (s > 0 ? g.columns - 1 - g.right : g.left)
  const rear = roomAt(-g.side) >= big + 2 ? -g.side : g.side
  const bigC = {
    x: clamp((rear < 0 ? g.left : g.right) + rear * (big - 1), big + 2, g.columns - big - 3),
    y: clamp(g.top + h * 0.45, big + 2, g.ground - big - 2),
  }
  // The small gear sits a tooth's depth past touching so the teeth interlock
  const gap = big + small + 1.3
  const smallC = {
    x: clamp(bigC.x + rear * gap * Math.cos(1.2), small + 2, g.columns - small - 3),
    y: Math.max(small + 2, bigC.y - gap * Math.sin(1.2)),
  }
  const tone = after ? mix(c, HOT, 0.3) : c
  const flash = click === 0 || click === 1
  const paint = show < 1 && t > GEARS_IN[1] ? dither : back
  gear(out, bigC.x, bigC.y, big * show, turn, flash ? WHITE : tone, 10, paint)
  gear(out, smallC.x, smallC.y, small * show, -turn * (big / small) + Math.PI / 7, flash ? WHITE : tone, 7, paint)
  if (click >= 0 && click < 5) spark(out, (bigC.x + smallC.x) / 2, (bigC.y + smallC.y) / 2, [3, 2, 2, 1, 0][click], HOT)
  if (after && show >= 1) {
    for (const p of [bigC, smallC]) {
      const ang = turn * 1.3 + (p === smallC ? 1 : 0)
      const rr = (p === bigC ? big : small) + 2.5
      dot(out, p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr, light(c, 0.5))
    }
  }
}

const MASH_GLOW = [1, 10]
const MASH_JUMP = [10, 17]
const MASH_HIT = 20
const MASH_HOME = 38
const STAR_GOLD = 0xffe680

// Where the meteor mash has the mon at tick t, as [dx toward the target, dy]
const mashAt = (t, far) => [
  keys(t, [[0, 0], [MASH_GLOW[1], -1], [MASH_JUMP[1], far * 0.5], [MASH_HIT, far, easeIn], [MASH_HIT + 4, far], [MASH_HOME, 0]]),
  keys(t, [[0, 0], [MASH_GLOW[1], 1], [MASH_JUMP[1], -7, easeOut], [MASH_HIT, 0, easeIn], [MASH_HOME, 0]]),
]

// Wind up a glowing steel fist with stars circling it, leap, and dive in like a
// meteor trailing stardust, smashing into a shower of shooting stars
function meteormash(out, t, a, g, c) {
  const [, lit, , deep, edge] = metal(c)
  const far = travel(g, 6, 6)
  const [px, py] = mashAt(t, far)
  out.dx = Math.round(g.side * px)
  out.dy = Math.round(py)
  if (t < MASH_GLOW[1]) out.sy = 1 - 0.1 * phase(t, 2, MASH_GLOW[1])
  else if (t < MASH_HIT) out.sy = 1.08
  const hit = t - MASH_HIT
  if (hit >= 0 && hit < 3) out.sy = [0.85, 0.93, 0.98][hit]
  out.sx = 2 - out.sy
  const fist = (k) => {
    const [x, y] = mashAt(k, far)
    return { x: g.mouth.x + g.side * (2 + Math.round(x)), y: g.mouth.y + 1 + Math.round(y) }
  }
  const f = fist(t)
  const glow = easeOut(phase(t, ...MASH_GLOW))
  if (t < MASH_HIT + 1 && glow > 0) {
    const r = t < MASH_GLOW[1] ? 0.6 + 1.4 * glow : 2.2
    disc(out, f.x, f.y, r + 0.8, edge)
    ball(out, f.x, f.y, r, light(c, 0.2))
    dot(out, f.x - g.side, f.y - 1, WHITE)
    if (t < MASH_JUMP[0]) {
      for (let k = 0; k < 2; k++) {
        const ang = t * 0.7 + k * Math.PI
        const sx = f.x + Math.cos(ang) * 4
        const sy = f.y + Math.sin(ang) * 2
        if (Math.sin(ang) > 0) plus(out, sx, sy, mix(lit, STAR_GOLD, 0.6), WHITE)
        else dot(out, sx, sy, deep)
      }
    }
    if (t >= MASH_JUMP[0]) {
      for (let k = 7; k >= 1; k--) {
        const p = fist(t - k)
        const q = fist(t - k + 1)
        const gold = mix(lit, STAR_GOLD, 0.7)
        line(out, p.x, p.y + 1, q.x, q.y + 1, k < 4 ? deep : edge)
        line(out, p.x, p.y, q.x, q.y, k < 3 ? WHITE : k < 5 ? gold : lit)
        if (k % 3 === 2) plus(out, p.x - g.side, p.y - 2, gold, WHITE)
      }
    }
  }
  const { x: tx0, y: ty } = g.target
  const tx = within(g, tx0, 4)
  if (hit === 0) {
    out.shade = tint(WHITE, 0.5)
    disc(out, tx, ty, 3, WHITE)
  }
  if (hit >= 0 && hit < 4) out.shake = [[g.side * 2, 1], [-g.side, -1], [g.side, 1], [0, -1]][hit]
  if (hit >= 1 && hit < 5) ellipse(out, tx, ty, 2 + hit * 2, 1.5 + hit * 1.3, hit < 3 ? lit : deep, clipped(g, hit < 3 ? dot : dither))
  emit(t, { count: 7, gap: 0, start: MASH_HIT, life: 14 }, (i, age, fl) => {
    const ang = -Math.PI / 2 + (i / 6 - 0.5) * 2.6
    const v = 1 + rnd(a.seed, i, 12) * 0.6
    const x = tx + Math.cos(ang) * v * age
    const y = ty + Math.sin(ang) * v * age + 0.09 * age * age
    if (y > g.ground || x < 1 || x > g.columns - 2 || (fl > 0.7 && t % 2)) return
    const col = i % 2 ? mix(lit, STAR_GOLD, 0.7) : lit
    if (fl < 0.6) plus(out, x, y, col, WHITE)
    else dot(out, x, y, col)
    dot(out, x - Math.cos(ang) * 2, y - Math.sin(ang) * 2, deep)
  })
}

const DOOM_GATHER = [1, 12]
const DOOM_RISE = [12, 20]
const DOOM_MARK = [22, 40]
const DOOM_FALL = 42
const DOOM_END = 58

// Gather light and launch it up out of sight. A rune circles the ground under the
// target while a star blinks overhead, then a pillar of steel light comes crashing down.
function doomdesire(out, t, a, g, c) {
  const [hi, lit, base, deep, edge] = metal(c)
  const gather = phase(t, ...DOOM_GATHER) * (1 - phase(t, DOOM_RISE[0], DOOM_RISE[0] + 3))
  const crown = rowSpan(g, g.top) ?? { l: g.cx, r: g.cx }
  const cx = Math.round((crown.l + crown.r) / 2)
  if (t >= 1 && t < DOOM_RISE[1]) {
    out.sy = 1 + 0.06 * gather
    out.dy = t >= DOOM_RISE[0] && t < DOOM_RISE[0] + 3 ? -1 : 0
  }
  if (gather > 0) out.shade = rimGlow(g, out, lit, 0.2 * gather, t % 4 < 2 ? WHITE : edge, 0.6 * gather)
  emit(t, { count: 12, gap: 0.8, start: 1, life: 6 }, (i, age, f) => {
    if (t >= DOOM_RISE[0]) return
    const ang = -Math.PI / 2 + (rnd(a.seed, i, 13) - 0.5) * 3
    const r = lerp(11, 1, easeIn(f))
    const y = g.top - 2 + Math.sin(ang) * r * 0.6
    if (y < 0) return
    dot(out, cx + Math.cos(ang) * r, y, f < 0.5 ? lit : WHITE)
  })
  if (t >= DOOM_GATHER[0] + 4 && t < DOOM_RISE[0]) {
    const r = 0.5 + phase(t, DOOM_GATHER[0] + 4, DOOM_RISE[0]) * 1.5
    disc(out, cx, Math.max(r + 1, g.top - 3), r + 0.7, edge)
    disc(out, cx, Math.max(r + 1, g.top - 3), r, WHITE)
  }
  if (t >= DOOM_RISE[0] && t < DOOM_RISE[1]) {
    const y = lerp(Math.max(3, g.top - 3), -4, easeIn(phase(t, ...DOOM_RISE)))
    for (let k = 0; k < 6; k++) clipped(g)(out, cx, y + k, k < 2 ? WHITE : k < 4 ? hi : base)
    clipped(g)(out, cx - 1, y + 1, edge)
    clipped(g)(out, cx + 1, y + 1, edge)
  }
  const tx = within(g, g.target.x, 6)
  const gy = g.ground
  const mark = phase(t, ...DOOM_MARK) * (1 - phase(t, DOOM_FALL + 2, DOOM_FALL + 6))
  if (mark > 0) {
    const rx = 1 + 5 * easeOut(mark)
    const steps = Math.ceil(rx * 7)
    for (let k = 0; k < steps; k++) {
      const ang = (k / steps) * TAU + t * 0.15
      if (k % 4 === 3) continue
      clipped(g)(out, tx + Math.cos(ang) * rx, gy - 1 + Math.sin(ang) * rx * 0.3, Math.sin(ang) > 0 ? hi : deep)
    }
    if (t % 6 < 4) spark(out, tx, 1 + (t % 2), t % 6 < 2 ? 1 : 0, lit)
  }
  if (t >= DOOM_MARK[1] - 4 && t < DOOM_FALL) {
    for (let y = 0; y < gy; y += 2) if ((y + t) % 4 < 2) dot(out, tx, y, lit)
  }
  const fall = t - DOOM_FALL
  if (fall < 0) return
  if (fall < 2) out.shade = tint(WHITE, 0.35)
  const shakes = [[0, 2], [1, -2], [-1, 2], [1, -1], [-1, 1], [0, -1], [1, 0], [-1, 0], [0, 1]]
  if (fall < shakes.length) out.shake = shakes[fall]
  else if (t < DOOM_END && t % 2) out.shake = [0, 1]
  const half = keys(t, [[DOOM_FALL, 1], [DOOM_FALL + 2, 4], [DOOM_END - 6, 3.5], [DOOM_END, 0]])
  const head = clamp(lerp(0, gy, phase(t, DOOM_FALL - 1, DOOM_FALL + 1)), 0, gy)
  if (half > 0.2) {
    for (let y = 0; y <= head; y++) {
      for (let x = Math.floor(tx - half - 1); x <= Math.ceil(tx + half + 1); x++) {
        const m = Math.abs(x - tx)
        const shimmer = (y + t * 2) % 5 === 0
        let col
        if (m <= half * 0.3) col = WHITE
        else if (m <= half * 0.65) col = shimmer ? WHITE : hi
        else if (m <= half) col = shimmer ? hi : base
        else if (m <= half + 1) col = edge
        else continue
        clipped(g)(out, x, y, col)
      }
    }
  }
  emit(t, { count: 3, gap: 3, start: DOOM_FALL + 1, life: 10 }, (i, age, f) => {
    const rx = 4 + age * 1.8
    ellipse(out, tx, gy - 1, rx + 1, 1.5 + age * 0.3, edge, clipped(g, dither))
    ellipse(out, tx, gy - 1, rx, 1 + age * 0.3, f < 0.4 ? WHITE : f < 0.7 ? lit : deep, clipped(g, f < 0.6 ? dot : dither))
  })
  sparks(out, t, a, g, tx - 3, gy - 1, { start: DOOM_FALL + 1, count: 10, gap: 0.6, life: 10, angle: -Math.PI * 0.75, spread: 0.8, speed: 1.3, salt: 6 })
  sparks(out, t, a, g, tx + 3, gy - 1, { start: DOOM_FALL + 1, count: 10, gap: 0.6, life: 10, angle: -Math.PI * 0.25, spread: 0.8, speed: 1.3, salt: 12 })
  emit(t, { count: 10, gap: 1, start: DOOM_END - 6, life: 10 }, (i, age, f) => {
    const x = tx + (rnd(a.seed, i, 14) - 0.5) * 8
    const y = gy - 2 - age * 1.2
    if (f < 0.8 || age % 2) dot(out, x, y, f < 0.5 ? WHITE : lit)
  })
}

const SLAM_SET = [1, 8]
const SLAM_UP = [8, 15]
const SLAM_LAND = 19
const SLAM_HOME = 40

const slamAt = (t, far, lift) => [
  keys(t, [[0, 0], [SLAM_SET[1], -1], [SLAM_UP[1], far * 0.8], [SLAM_LAND, far, easeIn], [SLAM_LAND + 6, far], [SLAM_HOME, 0]]),
  keys(t, [[0, 0], [SLAM_SET[1], 0], [SLAM_UP[1], -lift, easeOut], [SLAM_UP[1] + 1, -lift], [SLAM_LAND, 0, easeIn]], linear),
]

// Turn to dark, heavy steel, haul up into a high leap and drop like an anvil onto the
// target, the ground cracking and a shock rolling out both ways
function heavyslam(out, t, a, g, c) {
  const [, lit, base, deep, edge] = metal(c)
  const far = travel(g, 9, 3)
  // Leap only as high as the strip has room for above the head
  const [px, py] = slamAt(t, far, clamp(g.top + 1, 2, 7))
  out.dx = Math.round(g.side * px)
  const land = t - SLAM_LAND
  const hopping = land >= 8 && t < SLAM_HOME
  out.dy = Math.round(py) - (hopping ? Math.round(Math.abs(Math.sin(phase(t, SLAM_LAND + 8, SLAM_HOME) * Math.PI * 2)) * 2) : 0)
  if (t < SLAM_SET[1]) out.sy = 1 - 0.14 * easeOut(phase(t, ...SLAM_SET))
  else if (t < SLAM_LAND) out.sy = 1 + (g.top >= 6 ? (t < SLAM_UP[1] ? 0.1 : 0.15) : 0)
  else if (land < 5) out.sy = [0.7, 0.82, 0.95, 1.04, 1][land]
  out.sx = 1 + (1 - out.sy) * 0.8
  const heavy = phase(t, 0, 7) * (1 - phase(t, SLAM_LAND + 8, SLAM_HOME - 4))
  if (heavy > 0) out.shade = rimGlow(g, out, dark(c, 0.3), 0.5 * heavy, lit, 0.6 * heavy)
  if (t > SLAM_UP[1] && t < SLAM_LAND) out.ghosts = [ghost(out.dx, out.dy - 3, deep, 0.6), ghost(out.dx, out.dy - 6, base, 0.75)]
  if (land < 0) return
  const shakes = [[0, 3], [0, -2], [g.side, 2], [0, -1], [-g.side, 1], [0, -1]]
  if (land < shakes.length) out.shake = shakes[land]
  const mid = (g.left + g.right) / 2 + Math.round(g.side * far)
  const halfW = (g.right - g.left) / 2 + 1
  const gy = g.ground
  if (land < 3) {
    ellipse(out, mid, gy, halfW + 2 + land * 2, 1.5, edge, clipped(g))
    ellipse(out, mid, gy, halfW + 1 + land * 2, 1, land ? lit : WHITE, clipped(g))
  }
  emit(t, { count: 2, gap: 3, start: SLAM_LAND, life: 10 }, (i, age, f) => {
    for (const s of [-1, 1]) {
      const x = mid + s * (halfW + age * 2.2)
      const hh = Math.max(1, 4 - age * 0.3 - i)
      const paint = clipped(g, f < 0.6 ? dot : dither)
      line(out, x, gy - hh, x + s, gy, f < 0.3 ? WHITE : lit, paint)
      line(out, x - s, gy - hh + 1, x, gy, edge, paint)
    }
  })
  if (land < 16 && (land < 10 || t % 2)) {
    for (const s of [-1, 1]) {
      let y = gy
      for (let k = 0; k <= 6; k++) {
        const x = mid + s * (halfW - 1 + k * 1.3)
        y = gy - (rnd(a.seed, k, s > 0 ? 15 : 16) < 0.5 ? 0 : 1)
        clipped(g)(out, x, y, k < 3 ? edge : deep)
      }
    }
  }
  for (const s of [-1, 1]) {
    sparks(out, t, a, g, mid + s * halfW, gy - 1, { start: SLAM_LAND, count: 5, life: 9, angle: -Math.PI / 2 + s * 0.8, spread: 0.8, speed: 1.2, salt: s > 0 ? 3 : 7 })
    emit(t, { count: 3, gap: 0, start: SLAM_LAND, life: 12 }, (i, age, f) => {
      const x = mid + s * (halfW + 1 + age * (0.6 + i * 0.3))
      const y = gy - 1 - age * 0.25 - i
      disc(out, x, y, f < 0.5 ? 1.5 : 0.8, f < 0.5 ? DUST : dark(DUST, 0.25), clipped(g, f < 0.6 ? back : dither))
    })
  }
}

const WING_OPEN = [1, 8]
const WING_GO = 10
const WING_HIT = 13
const WING_HOME = 30

const wingAt = (t, far) => keys(t, [[0, 0], [WING_OPEN[1], -2], [WING_GO, -2], [WING_HIT, far, easeIn], [WING_HIT + 3, far], [WING_HOME, 0]])

// Spread wings of sharp steel feathers that catch a glint, dive through the target in
// a flat cutting dash, and leave steel feathers fluttering down along the cut
function steelwing(out, t, a, g, c) {
  const [hi, lit, base, , edge] = metal(c)
  const far = travel(g, 9, 3)
  out.dx = Math.round(g.side * wingAt(t, far))
  out.dy = Math.round(keys(t, [[0, 0], [WING_OPEN[1], -2], [WING_GO, -2], [WING_HIT, 0, easeIn], [WING_HOME, 0]]))
  if (t > WING_GO && t <= WING_HIT + 1) {
    out.ghosts = [1, 2].map((k) => ghost(Math.round(g.side * wingAt(t - k, far)), 0, lit, 0.4 + 0.2 * k))
  }
  const open = easeOut(phase(t, ...WING_OPEN)) * (1 - phase(t, WING_HIT + 6, WING_HOME - 2))
  const swept = phase(t, WING_GO - 1, WING_HIT) * (1 - phase(t, WING_HIT + 2, WING_HIT + 8))
  const h = g.bottom - g.top + 1
  if (open > 0) {
    const ax = g.cx - g.side * (g.right - g.left) * 0.15 + out.dx
    const ay = g.top + h * 0.35 + out.dy
    for (let k = 3; k >= 0; k--) {
      const ang = -Math.PI / 2 - g.side * (0.2 + k * 0.32 + swept * 0.55)
      const len = (clamp(h * 0.6, 6, 11) - k * 0.9) * open
      const tip = { x: ax + Math.cos(ang) * len, y: Math.max(0, ay + Math.sin(ang) * len) }
      const glint = t >= WING_OPEN[1] - 1 && t < WING_OPEN[1] + 3 && k === 0
      blade(out, { x: ax, y: ay }, straight({ x: ax, y: ay }, tip), tip, 2.4, glint ? [WHITE, hi, edge] : k % 2 ? [lit, base, edge] : [hi, base, edge])
    }
  }
  const { x: tx0, y: ty } = g.target
  const tx = within(g, tx0, 3)
  const cut = t - WING_HIT
  if (cut >= 0 && cut < 8) {
    const len = [6, 9, 10, 10, 9, 8, 7, 6][cut]
    const split = cut < 3 ? 0 : Math.min(2, cut - 2)
    const paint = clipped(g, cut < 5 ? dot : dither)
    line(out, tx - len, ty - split, tx + len, ty - split, cut < 2 ? WHITE : hi, paint)
    line(out, tx - len, ty - split - 1, tx + len, ty - split - 1, edge, paint)
    if (split > 0) {
      line(out, tx - len + 1, ty + split, tx + len - 1, ty + split, lit, paint)
      line(out, tx - len + 1, ty + split + 1, tx + len - 1, ty + split + 1, edge, paint)
    }
  }
  if (cut === 0) out.shake = [g.side * 2, 0]
  if (cut === 1) out.shake = [-g.side, 0]
  emit(t, { count: 6, gap: 0.5, start: WING_HIT, life: 18 }, (i, age, f) => {
    const x = tx + (rnd(a.seed, i, 17) - 0.5) * 14 + Math.sin(age * 0.5 + i) * 1.5
    const y = ty - 3 + age * 0.55 + rnd(a.seed, i, 18) * 2
    if (y > g.ground - 1 || (f > 0.75 && t % 2)) return
    const tilt = Math.sin(age * 0.5 + i) > 0 ? 1 : -1
    const paint = clipped(g)
    paint(out, x - 1, y - tilt, edge)
    paint(out, x, y, f < 0.4 ? WHITE : lit)
    paint(out, x + 1, y + tilt, base)
  })
}

export const STEEL = {
  irondefense: { ticks: 46, color: 0xb4c2d0, pose: { view: 'front' }, draw: irondefense },
  metalclaw: { ticks: 32, color: 0xb8c4d2, draw: metalclaw },
  metalsound: { ticks: 38, color: 0xc4ccd6, draw: metalsound },
  ironhead: { ticks: 36, color: 0xa8b8cc, draw: ironhead, pose: (t) => ({ stride: t >= HEAD_GO && t < HEAD_HIT }) },
  mirrorshot: { ticks: 40, color: 0xc8d4e2, draw: mirrorshot },
  gyroball: { ticks: 44, color: 0xb0bccb, draw: gyroball },
  metalburst: { ticks: 40, color: 0xb6c0cc, draw: metalburst },
  autotomize: { ticks: 44, color: 0xb8c6d4, pose: { view: 'front' }, draw: autotomize },
  flashcannon: { ticks: 40, color: 0xc0d0e4, draw: flashcannon },
  geargrind: { ticks: 40, color: 0xb0b8c4, draw: geargrind },
  irontail: { ticks: 40, color: 0xaebccc, draw: irontail },
  magnetbomb: { ticks: 44, color: 0xb4bfcc, draw: magnetbomb },
  shiftgear: { ticks: 48, color: 0xb8c2ce, pose: { view: 'front' }, draw: shiftgear },
  meteormash: { ticks: 42, color: 0xb0c4e0, draw: meteormash },
  doomdesire: { ticks: 66, color: 0xc4d2e4, draw: doomdesire },
  heavyslam: { ticks: 46, color: 0x9eacbc, draw: heavyslam },
  steelwing: { ticks: 36, color: 0xb8c4d4, draw: steelwing },
}
