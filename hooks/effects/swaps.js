// Psychic moves that swap, split, seal, or bend the rules

import {
  WHITE, back, ball, burst, clamp, dark, dot, easeIn, easeInOut, easeOut, emit, glow, keys, lean, lerp, light, line, luma,
  mix, phase, plus, puff, ramp, ring, rnd, spark, sparkles, stamp, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const UP = -Math.PI / 2
const HILT = 0xe0b040
const GRIP = 0x6a4428
const HEAL = 0x3cb86a
const HEAL_LIT = 0xd8ffe4

const tallOf = (g) => g.bottom - g.top + 1
// How tall a shield or long a sword hovering over a mon is, from the mon's height
const propOf = (g) => clamp(Math.round(tallOf(g) * 0.42), 5, 9)
const dotted = (out, x, y, c) => (Math.round(x) + Math.round(y)) % 2 && dot(out, x, y, c)
const mod = (n, m) => ((n % m) + m) % m

// Where a traded thing sits on the mon (its chest, toward the front) and on the target
const mineOf = (g) => ({ x: Math.round(lerp(g.cx, g.mouth.x, 0.5)), y: g.cy })
const theirsOf = (g) => ({ x: g.target.x, y: g.target.y })

// A point f of the way from p to q on an arc bowed up by h pixels, or down when h < 0
const arcAt = (p, q, f, h) => ({ x: lerp(p.x, q.x, f), y: lerp(p.y, q.y, f) - Math.sin(Math.PI * f) * h })

// A paint that drops pixels outside the strip
const within = (g, paint = dot) => (out, x, y, c) => {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px >= 0 && px < g.columns && py >= 0 && py <= g.ground) paint(out, px, py, c)
}

// Pixel art with a one pixel outline of `edge`, so it reads over anything
function outlined(out, x, y, art, palette, edge, paint = dot) {
  const rim = Object.fromEntries(Object.keys(palette).map((k) => [k, edge]))
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stamp(out, x + dx, y + dy, art, rim, false, paint)
  stamp(out, x, y, art, palette, false, paint)
}

// A plus of arms `arm` long and 2 * thick + 1 wide, filled and ringed with an edge
function cross(out, x, y, arm, thick, fill, edge, paint = dot) {
  const cx = Math.round(x)
  const cy = Math.round(y)
  const inside = (u, v) =>
    (Math.abs(u) <= arm && Math.abs(v) <= thick) || (Math.abs(v) <= arm && Math.abs(u) <= thick)
  for (let v = -arm - 1; v <= arm + 1; v++) {
    for (let u = -arm - 1; u <= arm + 1; u++) {
      if (inside(u, v)) paint(out, cx + u, cy + v, fill)
      else if (inside(u - 1, v) || inside(u + 1, v) || inside(u, v - 1) || inside(u, v + 1)) paint(out, cx + u, cy + v, edge)
    }
  }
}

// A heater shield h rows tall centered on x, y with a cross emblem. squeeze narrows it
// like a spinning coin, its back face showing darker when negative. keep(u, row) can
// leave columns or rows out, to draw a piece of it.
function shield(out, x, y, h, c, { squeeze = 1, keep = null, paint = dot } = {}) {
  const [hi, lit, , deep] = ramp(c)
  const rows = Math.max(2, Math.round(h))
  const face = squeeze < 0 ? dark(c, 0.3) : c
  const hw = Math.max(2, rows * 0.42) * Math.abs(squeeze)
  const top = Math.round(y - rows / 2)
  const cx = Math.round(x)
  const half = (row) => {
    if (row < 0 || row >= rows) return -1
    const v = row / (rows - 1)
    return Math.round(v < 0.5 ? hw : hw * Math.sqrt(Math.max(0, 1 - ((v - 0.5) / 0.5) ** 2)))
  }
  const band = Math.round(rows * 0.3)
  for (let row = 0; row < rows; row++) {
    const w = half(row)
    for (let u = -w; u <= w; u++) {
      if (keep && !keep(u, row)) continue
      const rim = Math.abs(u) === w || row === 0 || Math.abs(u) > half(row + 1)
      const emblem = squeeze > 0 && w > 1 && (u === 0 || row === band)
      paint(out, cx + u, top + row, rim ? deep : emblem ? hi : u < 0 ? lit : face)
    }
  }
}

// A sword from its hilt at x, y pointing along ang. Only the blade between from and to
// is drawn, so a cut sword can be drawn as two pieces.
function sword(out, x, y, ang, len, c, { from = 0, to = len, hilt = true, paint = dot } = {}) {
  const [hi, , , deep] = ramp(c)
  const ux = Math.cos(ang)
  const uy = Math.sin(ang)
  const start = Math.max(1, from)
  for (let d = start; d <= to; d += 0.5) {
    if (d >= len - 1.5) continue
    paint(out, x + ux * d - uy, y + uy * d + ux, c)
    paint(out, x + ux * d + uy, y + uy * d - ux, deep)
  }
  for (let d = start; d <= to; d += 0.5) paint(out, x + ux * d, y + uy * d, hi)
  if (!hilt) return
  for (let k = -2; k <= 2; k++) paint(out, x - uy * k, y + ux * k, Math.abs(k) === 2 ? dark(HILT, 0.35) : HILT)
  for (let d = 1; d <= 2; d++) paint(out, x - ux * d, y - uy * d, GRIP)
  paint(out, x - ux * 3, y - uy * 3, HILT)
}

// A pixel heart of size s centered on x, y with a dark rim and a glint
function heart(out, x, y, s, c, paint = dot) {
  const [hi, lit, , deep] = ramp(c)
  const inside = (px, py) => {
    const u = (px - x) / s
    const v = -(py - y) / s + 0.15
    return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0
  }
  for (let py = Math.floor(y - s * 1.4); py <= Math.ceil(y + s * 1.4); py++) {
    for (let px = Math.floor(x - s * 1.3); px <= Math.ceil(x + s * 1.3); px++) {
      if (!inside(px, py)) continue
      const rim = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1)
      const u = (px - x) / s
      const v = -(py - y) / s
      paint(out, px, py, rim ? deep : u < -0.3 && v > 0.25 ? hi : u < 0.15 && v > -0.1 ? lit : c)
    }
  }
}

// A random spot on the sprite's body at its base spot, for things that sit on it
function bodySpot(g, seed, i) {
  for (let k = 0; k < 16; k++) {
    const x = Math.round(lerp(g.left, g.right, rnd(seed, i, k * 2)))
    const y = Math.round(lerp(g.top + 1, g.bottom - 1, rnd(seed, i, k * 2 + 1)))
    if (g.solid(x, y)) return { x, y }
  }
  return { x: g.cx, y: g.cy }
}

const IMP_CAST = 8
const IMP_DROP = 16
const IMP_SLAM = 24
const IMP_LOCK = 29
const IMP_FADE = 40
const LOCK = ['bbbbb', 'bhkbb', 'bbkbb', 'ddddd']
const SHACKLE = ['.sss.', 's...s', 's...s']

// Glow and fling a sealing spark over the target, where a cage of bars lowers and
// slams to the ground and a padlock clicks shut on its front
function imprison(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const box = g.foe ?? { left: tx - 4, right: tx + 4, top: ty - 5 }
  const left = clamp(box.left - 2, 1, g.columns - 2)
  const right = clamp(box.right + 2, 1, g.columns - 2)
  const top = clamp(box.top - 3, 1, g.ground - 8)
  const floor = g.ground
  const mid = Math.round((left + right) / 2)

  const tilt = keys(t, [[0, 0], [IMP_CAST, -2], [IMP_CAST + 3, 2], [IMP_SLAM + 4, 2], [IMP_SLAM + 12, 0]])
  out.skew = lean(g, g.side * tilt)
  out.dx = Math.trunc(tilt / 2) * g.side
  const charge = phase(t, 2, IMP_CAST) * (1 - phase(t, IMP_CAST, IMP_CAST + 5))
  if (charge > 0) out.shade = glow(c, 0.4 * charge)
  if (t >= 2 && t < IMP_CAST) plus(out, g.mouth.x - g.side, g.top + 2, t % 2 ? c : hi, WHITE)

  // The sealing spark arcs from the brow to the top of the cage
  if (t >= IMP_CAST && t < IMP_DROP) {
    const from = { x: g.mouth.x, y: g.mouth.y - 1 }
    const to = { x: mid, y: top }
    const h = Math.max(0, Math.min(6, Math.min(from.y, to.y) - 1))
    const f = easeInOut(phase(t, IMP_CAST, IMP_DROP))
    for (let k = 5; k >= 1; k--) {
      const p = arcAt(from, to, Math.max(0, f - k * 0.05), h)
      dot(out, p.x, p.y, k < 3 ? hi : c)
    }
    const p = arcAt(from, to, f, h)
    plus(out, p.x, p.y, c, WHITE)
  }

  if (t < IMP_DROP || t >= IMP_FADE + 7) return
  const drop = easeIn(phase(t, IMP_DROP, IMP_SLAM))
  const bottom = Math.round(lerp(top + 2, floor, drop))
  const flash = t >= IMP_SLAM && t < IMP_SLAM + 2
  const fade = phase(t, IMP_FADE, IMP_FADE + 7)
  const step = right - left > 14 ? 3 : 2
  // After the lock clicks, a glow runs down the bars
  const glowRow = t >= IMP_LOCK ? top + ((t - IMP_LOCK) * 2) % (floor - top + 6) : -1
  for (let x = left; x <= right; x += step) {
    if (fade > 0 && rnd(a.seed, x, 7) < fade) continue
    for (let y = top + 2; y <= bottom; y++) {
      const near = Math.abs(y - glowRow) < 2
      dot(out, x, y, flash || y === glowRow ? WHITE : near ? hi : (x - left) % (step * 2) ? c : lit)
    }
  }
  const rail = fade > 0 ? dotted : dot
  for (let x = left - 1; x <= right + 1; x++) {
    rail(out, x, top, flash ? WHITE : hi)
    rail(out, x, top + 1, deep)
    if (t >= IMP_SLAM) rail(out, x, floor, deep)
  }
  if (t >= IMP_SLAM && t < IMP_SLAM + 2) out.shake = [0, t === IMP_SLAM ? 1 : -1]
  emit(t, { count: 8, gap: 0, start: IMP_SLAM, life: 6 }, (i, age) => {
    const x = left + (right - left) * rnd(a.seed, i) + (i % 2 ? 1 : -1) * age * 0.7
    dot(out, x, floor - 1 - age * 0.4, mix(lit, 0xc8b28e, 0.5))
  })

  // The padlock: shackle up, then clicked down into the body
  if (t >= IMP_SLAM && t < IMP_FADE + 4) {
    const lx = mid - 2
    const ly = clamp(Math.round((top + floor) / 2), top + 5, floor - 4)
    const shut = t >= IMP_LOCK
    const paint = t >= IMP_FADE ? dotted : dot
    const edge = dark(c, 0.6)
    outlined(out, lx, ly - (shut ? 3 : 5), SHACKLE, { s: shut && t < IMP_LOCK + 2 ? WHITE : hi }, edge, paint)
    outlined(out, lx, ly, LOCK, { b: c, h: hi, k: dark(c, 0.7), d: deep }, edge, paint)
    if (t >= IMP_LOCK && t < IMP_LOCK + 3) burst(out, mid, ly - 2, [3, 5, 2][t - IMP_LOCK], hi)
  }
}

const HB_GROW = 4
const HB_DROP = 12
const HB_HIT = 19
const HB_FADE = 34

// Bloom a soft healing cross over the target, then slam a no-sign down on it that
// shatters the cross into gray pieces
function healblock(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const tx = g.target.x
  const arm = clamp(Math.round(propOf(g) * 0.5), 3, 4)
  const size = arm + 3
  const ty = clamp(g.target.y, size + 2, g.ground - size - 1)

  const push = keys(t, [[0, 0], [5, -1], [HB_DROP, -1], [HB_HIT - 1, 2, easeIn], [HB_HIT + 6, 2], [HB_HIT + 14, 0]])
  out.dx = Math.round(push) * g.side
  if (t >= HB_DROP && t < HB_HIT + 4) out.skew = lean(g, g.side * 2)

  if (t >= HB_GROW && t <= HB_HIT) {
    const grow = easeOut(phase(t, HB_GROW, HB_GROW + 6))
    const glint = t >= HB_GROW + 6 && t % 4 < 2
    cross(out, tx, ty, Math.max(1, Math.round(arm * grow)), 1, glint ? WHITE : HEAL_LIT, HEAL)
  }
  // The four arms of the cross break off, grayed, and tumble away
  const age = t - HB_HIT - 1
  if (age >= 0 && age < 12) {
    const gray = mix(HEAL_LIT, 0x8a8a8a, Math.min(1, age / 4))
    for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = tx + ux * (arm / 2 + 1 + age * 0.6)
      const y = ty + uy * (arm / 2 + 1 + age * 0.6) + age * age * 0.07
      const p = age > 8 ? dotted : dot
      line(out, x - uy * 1, y - ux * 1, x + uy * 1, y + ux * 1, gray, within(g, p))
      within(g, p)(out, x + ux, y + uy, dark(gray, 0.3))
    }
  }

  // The no-sign drops in large and shrinks onto the cross
  if (t >= HB_DROP && t < HB_FADE + 8) {
    const r = size * lerp(2.2, 1, easeIn(phase(t, HB_DROP, HB_HIT)))
    const hit = t >= HB_HIT && t < HB_HIT + 2
    const pulse = t >= HB_HIT + 2 && (t >> 1) % 2 ? light(c, 0.3) : c
    const col = hit ? WHITE : pulse
    const p = within(g, t >= HB_FADE ? dotted : dot)
    if (t >= HB_FADE + 4 && t % 2) return
    ring(out, tx, ty, r + 1, deep, 0, Math.PI, p)
    ring(out, tx, ty, r, col, 0, Math.PI, p)
    ring(out, tx, ty, r - 1, col, 0, Math.PI, p)
    const k = (r - 1) * 0.7
    line(out, tx - k, ty - k, tx + k, ty + k, col, p)
    line(out, tx - k + 1, ty - k, tx + k, ty + k - 1, col, p)
    line(out, tx - k, ty - k + 1, tx + k - 1, ty + k, deep, p)
  }
  if (t >= HB_HIT && t < HB_HIT + 3) {
    burst(out, tx, ty, [4, 6, 3][t - HB_HIT], hi)
    out.shake = [t === HB_HIT ? g.side : 0, t === HB_HIT + 1 ? 1 : 0]
  }
}

const WR_RISE = 6
const WR_SPIN = 22
const WR_SPUN = 36
const WR_FADE = 42

// A diamond outline of half widths rx, ry around x, y
function diamond(out, x, y, rx, ry, c, paint) {
  line(out, x - rx, y, x, y - ry, c, paint)
  line(out, x, y - ry, x + rx, y, c, paint)
  line(out, x + rx, y, x, y + ry, c, paint)
  line(out, x, y + ry, x - rx, y, c, paint)
}

// Hop up as three nested diamond frames open out behind the mon, then the whole room
// turns over once like a revolving door, the mon turning with it, and the frames fade
function wonderroom(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { cx, cy } = g
  const ryMax = tallOf(g) / 2 + 5
  const rxMax = (g.right - g.left) / 2 + 12
  const turn = Math.cos(TAU * easeInOut(phase(t, WR_SPIN, WR_SPUN)))
  out.dy = Math.round(keys(t, [[0, 0], [5, 0], [9, -2, easeOut], [WR_SPUN + 2, -2], [WR_SPUN + 8, 0]]))
  out.sy = keys(t, [[0, 1], [5, 0.92], [8, 1.05], [11, 1]])
  out.sx = Math.max(0.12, Math.abs(turn)) * keys(t, [[0, 1], [5, 1.05], [8, 0.97], [11, 1]])
  out.flipX = turn < 0
  if (turn < 0.2 && t > WR_SPIN) out.shade = tint(c, 0.3)

  const colors = [hi, lit, c]
  for (let k = 2; k >= 0; k--) {
    const born = WR_RISE + k * 3
    const grow = easeOut(phase(t, born, born + 8))
    const gone = WR_FADE + (2 - k) * 2
    if (grow <= 0 || t >= gone + 6) continue
    const rx = rxMax * (0.5 + 0.25 * k) * grow * turn
    const ry = ryMax * (0.55 + 0.225 * k) * grow
    const paint = within(g, t >= gone ? (o, x, y, col) => (x + y + t) % 3 === 0 && back(o, x, y, col) : back)
    const col = turn < 0 ? dark(colors[k], 0.3) : colors[k]
    diamond(out, cx, cy + 1, rx, ry, deep, paint)
    diamond(out, cx, cy, rx, ry, col, paint)
    if (grow === 1 && t < gone) {
      for (const [vx, vy] of [[rx, 0], [-rx, 0], [0, ry], [0, -ry]]) {
        if ((t + k) % 4 < 2) within(g)(out, cx + vx, cy + vy, WHITE)
      }
    }
  }
  // Streaks off the frame tips while the room turns
  if (t >= WR_SPIN && t < WR_SPUN) {
    const w = rxMax * turn
    for (const d of [-1, 1]) {
      const y = cy + d * 2
      line(out, cx + w, y, cx + w - Math.sign(turn || 1) * 3, y, lit, within(g, back))
      line(out, cx - w, y, cx - w + Math.sign(turn || 1) * 3, y, lit, within(g, back))
    }
  }
}

const MR_RISE = 4
const MR_KEY = 20
const MR_POPS = [27, 31, 35]
const MR_FADE = 42

// Raise three arches from the ground over the mon, shimmering bands running along them
// and a star lighting each keystone, while held items circle the mon and blink out one
// by one in puffs
function magicroom(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { cx } = g
  const base = g.ground + 1
  const r0 = clamp(Math.max((g.right - g.left) / 2 + 3, tallOf(g) * 0.75), 6, g.ground - 7)
  const live = phase(t, 2, 8) * (1 - phase(t, 40, 48))
  out.skew = lean(g, Math.sin((t * TAU) / 14) * 2 * live)
  out.dy = -Math.round(live)

  const shimmer = (col) => (o, x, y) => {
    if (x < 0 || x >= g.columns || y < 0 || y > g.ground) return
    back(o, x, y, mod(Math.round(x) + Math.round(y) - t, 6) < 2 ? hi : col)
  }
  const tones = [lit, c, dark(c, 0.15)]
  for (let k = 0; k < 3; k++) {
    const r = Math.min(r0 + k * 4, g.ground - 1)
    const born = MR_RISE + k * 4
    const fade = phase(t, MR_FADE + k * 2, MR_FADE + 6 + k * 2)
    const f = easeOut(phase(t, born, born + 10)) * (1 - fade)
    if (f <= 0) continue
    const q = (f * Math.PI) / 4
    // Two quarter arcs climb from the feet of the arch toward its top
    for (const [ang, col] of [
      [Math.PI + q, deep],
      [-q, deep],
    ]) {
      ring(out, cx, base, r + 1, col, ang, q, within(g, back))
    }
    ring(out, cx, base, r, tones[k], Math.PI + q, q, shimmer(tones[k]))
    ring(out, cx, base, r, tones[k], -q, q, shimmer(tones[k]))
    if (f === 1 && t >= MR_KEY + k && t < MR_FADE) spark(out, cx, base - r, (t + k) % 4 < 2 ? 2 : 1, hi, within(g, back))
  }

  // Held items orbit the mon, behind it on the far side of the loop, until each pops
  const rx = (g.right - g.left) / 2 + 3
  MR_POPS.forEach((pop, i) => {
    if (t < 12 || t >= pop + 6) return
    const ang = t * 0.28 + (i * TAU) / 3
    const x = cx + Math.cos(ang) * rx
    const y = g.cy + Math.sin(ang) * 3
    if (t < pop) {
      const tone = [hi, lit, c][i]
      ball(out, x, y, 1.3, tone, Math.sin(ang) < 0 ? back : dot)
      if (t >= pop - 3 && t % 2) dot(out, x, y - 2, WHITE)
    } else {
      const age = t - pop
      puff(out, x, y, [1.5, 2.5, 3, 2.5, 1.8, 1][age], light(c, 0.55), a.seed + i, within(g))
      if (age < 2) spark(out, x, y - 1, 2, hi, within(g))
    }
  })
}

const TR_OPEN = 4
const TR_WARP = 16
const TR_FLIP = 28
const TR_BACK = 36
const TR_CLOSE = 44
const TILE = 4

// Flip a checkered floor of tiles out across the strip from the mon, warp it and the
// mon in rolling waves, turn the mon upside down while the checks invert, then right
// everything and fold the tiles back in
function trickroom(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const open = easeOut(phase(t, TR_OPEN, TR_WARP)) * (1 - easeIn(phase(t, TR_CLOSE, 56)))
  const far = Math.hypot(g.columns, g.ground) * 0.9
  const radius = open * far
  const amp = 2 * phase(t, TR_WARP, TR_WARP + 4) * (1 - phase(t, TR_CLOSE - 4, TR_CLOSE + 2))
  const wave = (y) => amp * Math.sin(y * 0.45 + t * 0.7)
  const flipped = t > TR_FLIP && t < TR_BACK
  out.flipY = flipped
  if (amp > 0) out.skew = wave
  out.dy = -Math.round(amp / 2)
  out.sy = keys(t, [[0, 1], [3, 0.92], [6, 1]])
  if (t === TR_FLIP || t === TR_BACK) {
    out.shade = tint(WHITE, 0.5)
    out.shake = [g.side, 1]
  } else if (t === TR_FLIP + 1 || t === TR_BACK + 1) out.shake = [-g.side, 0]

  if (radius <= 0) return
  const fill = dark(c, 0.55)
  const top = Math.max(0, g.top - 4)
  for (let y = top; y <= g.ground; y++) {
    const shift = Math.round(wave(y))
    const ry = y - g.ground - 1
    for (let x = 0; x < g.columns; x++) {
      const gx = x - shift - g.cx
      const col = Math.floor(gx / TILE)
      const row = Math.floor(ry / TILE)
      const mx = g.cx + col * TILE + TILE / 2
      const my = g.ground + 1 + row * TILE + TILE / 2
      const d = Math.hypot(mx - g.cx, (my - g.cy) * 1.4)
      if (d > radius) continue
      const fresh = d > radius - 3 && open < 1
      const grout = mod(gx, TILE) === 0 || mod(ry, TILE) === 0
      const checked = ((col + row) & 1) === (flipped ? 1 : 0)
      if (grout) back(out, x, y, fresh ? WHITE : flipped ? hi : c)
      else if (checked) back(out, x, y, fresh ? lit : fill)
    }
  }
}

const GS_GROW = 7
const GS_MEET = 17
const GS_CUT = 22
const GS_PART = 25
const GS_HOME = 35
const GS_SEAL = 40
const GS_SINK = 45

// Shields bloom on the mon and the target, fly together and fuse into one, a slash cuts
// it down the middle, and each half flies home and grows back into a whole shield
function guardsplit(out, t, a, g, c) {
  const [hi] = ramp(c)
  const h = propOf(g)
  const big = h + 2
  const me = mineOf(g)
  const them = theirsOf(g)
  const mid = {
    x: Math.round((me.x + them.x) / 2),
    y: clamp(Math.min(me.y, them.y) - 2, Math.ceil(big / 2) + 2, g.ground - big),
  }
  const near = (u) => u * g.side <= 0
  const jolt = keys(t, [[0, 0], [GS_MEET, 0], [GS_MEET + 1, 1], [GS_MEET + 4, 0], [GS_HOME, 0], [GS_HOME + 1, -1], [GS_HOME + 5, 0]])
  out.dx = Math.round(jolt) * g.side
  if (t >= GS_HOME && t < GS_SEAL + 2) out.shade = glow(c, 0.25)

  if (t < GS_GROW) {
    const s = Math.max(2, Math.round(h * easeOut(phase(t, 0, GS_GROW))))
    shield(out, me.x, me.y, s, light(c, 0.35))
    shield(out, them.x, them.y, s, dark(c, 0.3))
  } else if (t < GS_MEET) {
    const f = easeInOut(phase(t, GS_GROW, GS_MEET))
    const p = arcAt(me, mid, f, 2)
    const q = arcAt(them, mid, f, 2)
    shield(out, p.x, p.y, h, light(c, 0.35))
    shield(out, q.x, q.y, h, dark(c, 0.3))
  } else if (t < GS_PART) {
    const fused = t < GS_MEET + 2 ? light(c, 0.7) : c
    if (t < GS_CUT) shield(out, mid.x, mid.y, big, fused)
    else {
      // The two halves start to part along the cut
      const gap = t - GS_CUT + 1
      shield(out, mid.x - g.side * gap, mid.y, big, c, { keep: near })
      shield(out, mid.x + g.side * gap, mid.y, big, c, { keep: (u) => !near(u) })
    }
    if (t < GS_MEET + 3) {
      burst(out, mid.x, mid.y - big / 2, [3, 5, 3][t - GS_MEET], hi)
      out.shake = [t === GS_MEET ? 1 : 0, 0]
    }
    if (t >= GS_CUT - 3 && t < GS_CUT + 1) {
      const top = mid.y - big / 2 - 2
      const tip = lerp(top, mid.y + big / 2 + 1, phase(t, GS_CUT - 3, GS_CUT))
      line(out, mid.x, top, mid.x, tip, WHITE)
      spark(out, mid.x, tip, 1, hi)
    }
  } else if (t < GS_HOME) {
    const f = easeInOut(phase(t, GS_PART, GS_HOME))
    const s = Math.round(lerp(big, h, f))
    const gap = GS_PART - GS_CUT + 1
    const p = arcAt({ x: mid.x - g.side * gap, y: mid.y }, me, f, 2)
    const q = arcAt({ x: mid.x + g.side * gap, y: mid.y }, them, f, 2)
    shield(out, p.x, p.y, s, c, { keep: near })
    shield(out, q.x, q.y, s, c, { keep: (u) => !near(u) })
  } else if (t < GS_SINK) {
    // The missing half fills back in row by row
    const rows = phase(t, GS_HOME, GS_SEAL) * h
    const col = t >= GS_SEAL && t < GS_SEAL + 2 ? light(c, 0.6) : c
    shield(out, me.x, me.y, h, col, { keep: (u, row) => near(u) || row < rows })
    shield(out, them.x, them.y, h, col, { keep: (u, row) => !near(u) || row < rows })
    if (t >= GS_SEAL && t < GS_SEAL + 3) {
      spark(out, me.x, me.y - h / 2, 2, hi)
      spark(out, them.x, them.y - h / 2, 2, hi)
    }
  } else {
    const f = phase(t, GS_SINK, 51)
    const s = Math.round(h * (1 - f * 0.5))
    shield(out, me.x, me.y + f * 2, s, c, { paint: dotted })
    shield(out, them.x, them.y + f * 2, s, c, { paint: dotted })
  }
}

const MC_DRAPE = 4
const MC_COVER = 15
const MC_SHOT = 20
const MC_HIT = 25
const MC_LIFT = 32
const MC_GONE = 41

// A glossy cape drapes down over the mon from the head, a glint sweeping across it.
// A stray spell flies in, glances off the cape and is flung back, then the cape lifts away.
function magiccoat(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const down = easeInOut(phase(t, MC_DRAPE, MC_COVER))
  const up = easeInOut(phase(t, MC_LIFT, MC_GONE))
  const hem = t < MC_LIFT ? lerp(g.top - 1, g.bottom + 1, down) : lerp(g.bottom + 1, g.top - 1, up)
  const on = t >= MC_DRAPE && t < MC_GONE
  const hit = t >= MC_HIT && t < MC_HIT + 2
  const wavy = (x) => hem + Math.sin(x * 0.9 + t * 0.6)
  out.sy = keys(t, [[0, 1], [3, 0.94], [MC_COVER, 0.97], [MC_COVER + 3, 1]])
  out.dx = hit ? -g.side : 0
  if (on) {
    const bands = [hi, lit, c, lit]
    out.shade = (x, y, col) => {
      if (y > wavy(x)) return col
      if (luma(col) < 60) return mix(col, deep, 0.4)
      if (hit) return mix(col, WHITE, 0.7)
      return mix(col, bands[mod(Math.floor((x - y * 0.5 + t * 0.6) / 2), 4)], 0.65)
    }
  }
  // The hem glints where it crosses the body
  if (on && ((t > MC_DRAPE && t < MC_COVER + 1) || t >= MC_LIFT)) {
    for (let x = g.left; x <= g.right; x++) {
      const y = Math.round(wavy(x))
      if (g.solid(x, y)) dot(out, x, y + out.dy, (x + t) % 3 ? hi : WHITE)
    }
  }
  if (t >= MC_COVER && t < MC_SHOT) {
    const s = lerp(g.left - 4, g.right + 4, phase(t, MC_COVER, MC_SHOT))
    for (let y = g.top; y <= g.bottom; y++) {
      const x = Math.round(s - (y - g.top) * 0.5 * g.side)
      if (g.solid(x, y)) dot(out, x, y, WHITE)
    }
  }

  // The stray spell: a dark mote that flies in, hits the cape and is flung back out
  const fx = g.frontAt(g.cy)
  const away = clamp(g.ahead(14), 1, g.columns - 2)
  const mote = dark(c, 0.6)
  if (t >= MC_SHOT && t < MC_HIT) {
    const f = easeIn(phase(t, MC_SHOT, MC_HIT))
    const x = lerp(away, fx + g.side, f)
    for (let k = 1; k <= 3; k++) dot(out, x + g.side * k, g.cy, k === 1 ? mote : mix(mote, lit, 0.5))
    ball(out, x, g.cy, 1.2, mote)
  }
  if (t >= MC_HIT && t < MC_HIT + 3) {
    const r = [2, 3, 4][t - MC_HIT]
    ring(out, fx, g.cy, r, WHITE, g.side > 0 ? 0 : Math.PI, 1.1, within(g))
  }
  if (t >= MC_HIT && t < MC_HIT + 6) {
    const f = easeOut(phase(t, MC_HIT, MC_HIT + 6))
    const x = lerp(fx + g.side * 2, away, f)
    const y = g.cy - f * 4
    spark(out, x, y, 2, lit, within(g))
    for (let k = 1; k <= 3; k++) dot(out, x - g.side * k, y + k * 0.6, k === 1 ? hi : lit)
  }
  if (t >= MC_LIFT && t < MC_GONE + 3) sparkles(out, t, a.seed, g.cx, hem - 2, g.right - g.left + 2, 4, lit, 5)
}

const PS_RISE = 7
const PS_MEET = 17
const PS_CUT = 23
const PS_HOME = 36
const PS_JOIN = 38
const PS_SINK = 44
const PS_TILT = 0.65

// Swords rise from the mon and the target, fly in and clash crossed, a slash breaks both
// at the cross, and the broken tips spin across to land on the other's hilt
function powersplit(out, t, a, g, c) {
  const [hi] = ramp(c)
  const len = clamp(propOf(g) + 2, 7, 10)
  const off = 3
  const cutD = off / Math.sin(PS_TILT)
  const me = mineOf(g)
  const them = theirsOf(g)
  // The clash sits nearer the target so the crossed swords clear the mon's face
  const mid = {
    x: Math.round(lerp(me.x, them.x, 0.62)),
    y: clamp(Math.min(me.y, them.y) - 2, Math.ceil(len * 0.8) - 1, g.ground - 6),
  }
  const lift = Math.round(cutD * Math.cos(PS_TILT))
  const homes = [
    { x: me.x, y: clamp(me.y + Math.round(len / 2), len + 2, g.ground - 1) },
    { x: them.x, y: clamp(them.y + Math.round(len / 2), len + 2, g.ground - 1) },
  ]
  const clash = [
    { x: mid.x - g.side * off, y: mid.y + lift, ang: UP + g.side * PS_TILT },
    { x: mid.x + g.side * off, y: mid.y + lift, ang: UP - g.side * PS_TILT },
  ]
  const tones = [light(c, 0.25), dark(c, 0.25)]
  const push = keys(t, [[0, 0], [PS_MEET - 2, 0], [PS_MEET, 1], [PS_CUT, 1], [PS_CUT + 1, -1], [PS_CUT + 6, 0], [PS_HOME, 0], [PS_HOME + 1, -1], [PS_HOME + 5, 0]])
  out.dx = Math.round(push) * g.side
  if (t >= PS_JOIN && t < PS_SINK) out.shade = glow(c, 0.2)

  for (let k = 0; k < 2; k++) {
    const home = homes[k]
    const at = clash[k]
    const col = tones[k]
    if (t < PS_RISE) {
      const f = easeOut(phase(t, 0, PS_RISE))
      sword(out, home.x, home.y + Math.round(2 * (1 - f)), UP, len, col, { to: Math.max(1, len * f) })
    } else if (t < PS_CUT) {
      const f = easeInOut(phase(t, PS_RISE, PS_MEET))
      const shake = t >= PS_MEET ? tremble(t) * (k ? -1 : 1) * 0.6 : 0
      sword(out, lerp(home.x, at.x, f) + shake, lerp(home.y, at.y, f), lerp(UP, at.ang, f), len, col)
    } else if (t < PS_SINK) {
      // The hilt half eases home upright
      const f = easeInOut(phase(t, PS_CUT, PS_HOME))
      const hx = lerp(at.x, home.x, f)
      const hy = lerp(at.y, home.y, f)
      sword(out, hx, hy, lerp(at.ang, UP, f), len, col, { to: cutD })
      // The other sword's tip spins across and lands on this hilt
      const other = clash[1 - k]
      const spin = (k ? -1 : 1) * g.side * TAU
      const ang = lerp(other.ang, UP + spin, f)
      const goal = { x: home.x, y: home.y - cutD }
      const p = arcAt(mid, goal, f, Math.min(5, mid.y - 2))
      const flash = t >= PS_HOME && t < PS_JOIN + 1
      sword(out, p.x - Math.cos(ang) * cutD, p.y - Math.sin(ang) * cutD, ang, len, flash ? light(c, 0.7) : tones[1 - k], {
        from: cutD,
        hilt: false,
      })
      if (t === PS_JOIN) spark(out, home.x, goal.y, 2, hi)
    } else {
      const f = phase(t, PS_SINK, 51)
      sword(out, home.x, home.y + f * 3, UP, len, col, { to: len - f * 3, paint: dotted })
    }
  }
  if (t >= PS_MEET && t < PS_MEET + 3) {
    burst(out, mid.x, mid.y, [3, 5, 3][t - PS_MEET], hi)
    out.shake = [t === PS_MEET ? g.side : 0, 0]
  }
  emit(t, { count: 6, gap: 0.5, start: PS_MEET, life: 6 }, (i, age) => {
    const ang = UP + (rnd(a.seed, i) - 0.5) * 2.4
    dot(out, mid.x + Math.cos(ang) * age * 1.2, mid.y + Math.sin(ang) * age * 1.2 + age * age * 0.1, age < 3 ? WHITE : hi)
  })
  if (t >= PS_CUT - 3 && t < PS_CUT + 1) {
    const f = phase(t, PS_CUT - 3, PS_CUT)
    const from = mid.x - g.side * 7
    line(out, from, mid.y, lerp(from, mid.x + g.side * 7, f), mid.y, WHITE, within(g))
  }
}

const ME_OPEN = 4
const ME_LOOK = 12
const ME_FIX = 20
const ME_SEE = 22
const ME_LOCK = 32
const ME_SHUT = 37

// An almond eye `open` wide, its iris at ix, iy from the middle
function eye(out, x, y, open, ix, iy, c, paint) {
  const [, , , deep] = ramp(c)
  const w = 4.6
  if (open < 0.2) {
    for (let u = -4; u <= 4; u++) paint(out, x + u, y, deep)
    return
  }
  const hh = 2.6 * open
  const inside = (u, v) => Math.abs(u) < w && Math.abs(v) <= hh * (1 - (u / w) ** 2) + 0.3
  for (let v = -4; v <= 4; v++) {
    for (let u = -5; u <= 5; u++) {
      if (inside(u, v)) {
        const d = Math.hypot(u - ix, v - iy)
        const glint = u === Math.round(ix) - 1 && v === Math.round(iy) - 1
        paint(out, x + u, y + v, glint ? WHITE : d < 0.7 ? dark(c, 0.75) : d < 1.8 ? c : WHITE)
      } else if (inside(u - 1, v) || inside(u + 1, v) || inside(u, v - 1) || inside(u, v + 1)) {
        paint(out, x + u, y + v, deep)
      }
    }
  }
}

// A third eye opens over the mon's head, glances about, locks on the target and casts a
// cone of sight across it while a reticle closes in, then blinks shut
function miracleeye(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const ex = g.cx + g.side
  const ey = Math.max(4, g.top - 3)
  const { x: tx, y: ty } = g.target
  const open = easeOut(phase(t, ME_OPEN, ME_LOOK - 3)) * (1 - easeIn(phase(t, ME_SHUT, ME_SHUT + 5)))
  const look = keys(t, [[ME_LOOK, 0], [ME_LOOK + 2, -1.6], [ME_LOOK + 5, -1.6], [ME_LOOK + 7, 1.2], [ME_FIX - 1, 1.2], [ME_FIX, -0.4], [ME_FIX + 1, 1.8]])
  const tilt = keys(t, [[0, 0], [ME_OPEN, -1], [ME_FIX, -1], [ME_FIX + 2, 1.5], [ME_SHUT, 1.5], [ME_SHUT + 6, 0]])
  out.skew = lean(g, g.side * tilt)
  out.dy = t >= ME_FIX && t < ME_FIX + 2 ? -1 : 0
  const paint = within(g)
  if (t >= ME_FIX && t < ME_LOCK) {
    for (let k = -2; k <= 2; k++) {
      const ang = UP + k * 0.5
      const r = 5.5 + (t % 2)
      line(out, ex + Math.cos(ang) * r, ey + Math.sin(ang) * r, ex + Math.cos(ang) * (r + 1.5), ey + Math.sin(ang) * (r + 1.5), hi, paint)
    }
  }
  if (open > 0 || t < ME_SHUT + 6) eye(out, ex, ey, open, look * g.side, 0, c, paint)

  // The cone of sight: two marching dashed edges and a bright scan line between them
  const spread = g.foe ? clamp(Math.round((g.foe.bottom - g.foe.top) / 2), 3, 6) : 4
  const from = { x: ex + g.side * 5, y: ey }
  if (t >= ME_SEE && t < ME_LOCK + 3) {
    for (const d of [-1, 1]) {
      const to = { x: tx, y: ty + d * spread }
      const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1)
      for (let k = 0; k <= steps; k++) {
        if (mod(k - t, 4) >= 2) continue
        paint(out, lerp(from.x, to.x, k / steps), lerp(from.y, to.y, k / steps), lit)
      }
    }
    const f = phase(t, ME_SEE, ME_SEE + 7)
    if (f < 1) {
      const x = lerp(from.x, tx, f)
      line(out, x, lerp(from.y, ty - spread, f), x, lerp(from.y, ty + spread, f), WHITE, paint)
    }
  }
  // A reticle closes in on the target and clicks
  if (t >= ME_SEE + 3 && t < ME_SHUT + 4) {
    const r = lerp(8, 3, easeOut(phase(t, ME_SEE + 3, ME_LOCK)))
    const locked = t >= ME_LOCK && t < ME_LOCK + 2
    ring(out, tx, ty, r + 1, deep, 0, Math.PI, paint)
    ring(out, tx, ty, r, locked ? WHITE : c, 0, Math.PI, paint)
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 2
      line(out, tx + Math.cos(ang) * (r + 1), ty + Math.sin(ang) * (r + 1), tx + Math.cos(ang) * (r + 3), ty + Math.sin(ang) * (r + 3), locked ? WHITE : hi, paint)
    }
  }
  if (t >= ME_LOCK && t < ME_LOCK + 3) burst(out, tx, ty, [2, 4, 2][t - ME_LOCK], hi, paint)
  if (t >= ME_LOCK + 1 && t < ME_SHUT + 6) sparkles(out, t, a.seed, tx, ty, 12, spread * 2 + 4, lit, 5, paint)
}

const SK_PULL = 9
const SK_CROSS = 13
const SK_LAND = 30
const SK_DAZE = 35
const SK_R = 2.6

// An orb is drawn out of the mon's head and another out of the target's, they swap on
// crossing arcs, one high and one low, and sink in, leaving the mon shaking its head
function skillswap(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const heads = [
    { x: g.cx, y: g.top + 2 },
    { x: g.target.x, y: g.foe ? g.foe.top + 2 : g.target.y - 2 },
  ]
  const lifted = heads.map((p) => ({ x: p.x, y: Math.max(3, p.y - 5) }))
  const tones = [c, light(c, 0.45)]
  const high = Math.max(0, Math.min(5, Math.min(lifted[0].y, lifted[1].y) - 3))
  const low = -Math.max(0, Math.min(3, g.ground - 3 - Math.max(lifted[0].y, lifted[1].y)))
  const where = (k, tt) => {
    if (tt < SK_PULL) return { ...arcAt(heads[k], lifted[k], easeOut(phase(tt, 0, SK_PULL)), 0), r: lerp(0.6, SK_R, phase(tt, 0, SK_PULL)) }
    if (tt < SK_CROSS) return { x: lifted[k].x, y: lifted[k].y + (tt % 4 < 2 ? 0 : -1), r: SK_R }
    if (tt < SK_LAND) {
      const p = arcAt(lifted[k], lifted[1 - k], easeInOut(phase(tt, SK_CROSS, SK_LAND)), k ? low : high)
      return { ...p, r: SK_R }
    }
    const f = easeIn(phase(tt, SK_LAND, SK_LAND + 5))
    return { ...arcAt(lifted[1 - k], heads[1 - k], f, 0), r: lerp(SK_R, 0.6, f) }
  }

  out.dy = -Math.round(keys(t, [[0, 0], [SK_PULL, 1], [SK_CROSS + 2, 1], [SK_CROSS + 5, 0]]))
  out.sy = keys(t, [[0, 1], [SK_PULL, 1.05], [SK_CROSS + 3, 1], [SK_LAND + 4, 1], [SK_LAND + 5, 0.93], [SK_LAND + 8, 1]])
  if (t >= SK_DAZE && t < 46) out.skew = lean(g, tremble(t, 2) * 1.5 * (1 - phase(t, 40, 46)))
  if (t >= SK_LAND + 4 && t < SK_LAND + 7) out.shade = glow(tones[1], 0.4)

  if (t < SK_LAND + 5) {
    for (let k = 0; k < 2; k++) {
      if (t >= SK_CROSS && t < SK_LAND) {
        for (let j = 4; j >= 1; j--) {
          const p = where(k, t - j)
          dot(out, p.x, p.y, j < 3 ? lit : tones[k])
        }
      }
      const p = where(k, t)
      ball(out, p.x, p.y, p.r, tones[k])
      if (p.r >= 1.5) {
        const ang = t * 0.9 + k * Math.PI
        dot(out, p.x + Math.cos(ang) * (p.r + 1.5), p.y + Math.sin(ang) * (p.r + 1), WHITE)
      }
    }
  }
  const midT = Math.round((SK_CROSS + SK_LAND) / 2)
  if (t >= midT && t < midT + 2) {
    const p = where(0, midT)
    spark(out, p.x, (p.y + where(1, midT).y) / 2, t === midT ? 3 : 2, hi)
  }
  // Rings ripple off each head as an orb sinks in
  if (t >= SK_LAND + 3 && t < SK_LAND + 9) {
    const age = t - SK_LAND - 3
    for (const p of heads) ring(out, p.x, p.y, 1 + age * 0.8, age < 3 ? WHITE : lit, 0, Math.PI, within(g, age > 3 ? dotted : dot))
  }
}

const HP_GATHER = 9
const HP_PULSES = 4
const HP_GAP = 4
const HP_TRAVEL = 9
const HP_ARRIVE = HP_GATHER + HP_TRAVEL
const HP_BIG = 30

// Cup a glowing orb at the mouth and send four pulses of light ringed with little
// crosses at the target, which glows as crosses float up off it and a big cross blooms
function healpulse(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const from = { x: g.ahead(2), y: g.mouth.y }
  const { x: tx, y: ty } = g.target
  const emitting = t >= HP_GATHER && t < HP_GATHER + (HP_PULSES - 1) * HP_GAP + 1
  const beat = emitting && (t - HP_GATHER) % HP_GAP === 0
  out.dx = beat ? g.side : 0
  out.sy = keys(t, [[0, 1], [HP_GATHER, 0.96], [HP_GATHER + 2, 1]])
  if (t >= 2 && t < HP_GATHER + 14) out.shade = glow(c, 0.18)
  const paint = within(g)

  if (t < HP_GATHER + (HP_PULSES - 1) * HP_GAP + 2) {
    const r = lerp(0.6, 2.2, phase(t, 0, HP_GATHER)) + (beat ? 0.6 : 0)
    ball(out, from.x, from.y, r, lit)
  }
  emit(t, { count: 6, gap: 1, start: 0, life: 6 }, (i, age, f) => {
    const ang = (i / 6) * TAU + 0.4
    const r = 6 * (1 - f)
    dot(out, from.x + Math.cos(ang) * r, from.y + Math.sin(ang) * r, age < 2 ? lit : WHITE)
  })
  emit(t, { count: HP_PULSES, gap: HP_GAP, start: HP_GATHER, life: HP_TRAVEL }, (i, age, f) => {
    const x = lerp(from.x, tx, easeOut(f))
    const y = lerp(from.y, ty, easeOut(f))
    const r = 1.5 + f * 2.5
    const paint = within(g, f > 0.7 ? dotted : dot)
    ring(out, x, y, r + 1, deep, 0, Math.PI, paint)
    ring(out, x, y, r, f < 0.4 ? WHITE : hi, 0, Math.PI, paint)
    cross(out, x, y, 1, 0, WHITE, c, within(g))
  })

  // The target soaks it up: a soft ring, crosses floating up, then one big cross
  if (t >= HP_ARRIVE && t < 42) {
    const r = 5 + (t % 4 < 2 ? 0 : 1)
    ring(out, tx, ty, r, lit, 0, Math.PI, within(g, dotted))
  }
  emit(t, { count: 9, gap: 2, start: HP_ARRIVE, life: 10 }, (i, age, f) => {
    const x = tx + (rnd(a.seed, i) - 0.5) * 10
    const y = ty + 3 - age * 0.8
    if (f > 0.7 && t % 2) return
    cross(out, x, y, 1, 0, f < 0.5 ? WHITE : lit, deep, paint)
  })
  if (t >= HP_BIG && t < HP_BIG + 8) {
    const age = t - HP_BIG
    const arm = [2, 4, 5, 4, 4, 4, 4, 3][age]
    cross(out, tx, ty, arm, 0, age % 3 === 1 ? WHITE : hi, deep, within(g, age > 5 ? dotted : dot))
  }
  if (t >= HP_BIG + 3 && t < 43) sparkles(out, t, a.seed, tx, ty, 12, 10, lit, 4, paint)
}

const RP_PEEL = 6
const RP_FLY = 14
const RP_WEAR = 26
const RP_ACT = 32
const MASK = ['.mmmmm.', 'mhmmmmm', 'mkkmkkm', 'mmmmmmm', 'mkmmmkm', '.mkkkm.', '..mmm..']

// A grinning mask peels off the target, floats over and settles on the mon's face, and
// the mon takes on its glow and acts the part, turning about and striking poses
function roleplay(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const pal = { m: c, h: hi, k: dark(c, 0.65) }
  const edge = dark(c, 0.55)
  const from = { x: g.target.x - 3, y: (g.foe ? g.foe.top + 2 : g.target.y - 4) }
  const face = { x: g.mouth.x - g.side * 3 - 3, y: g.mouth.y - 3 }
  const lifted = { x: from.x, y: Math.max(1, from.y - 3) }

  if (t < RP_PEEL) out.skew = lean(g, g.side * 2 * easeOut(phase(t, 0, RP_PEEL)))
  else if (t < RP_WEAR) out.skew = lean(g, g.side * 2 * (1 - phase(t, RP_WEAR - 4, RP_WEAR)))
  else if (t >= RP_ACT) {
    out.flipX = t >= RP_ACT && t < RP_ACT + 4
    const pose = keys(t, [[RP_ACT + 4, 0], [RP_ACT + 6, 3], [RP_ACT + 8, 3], [RP_ACT + 10, -2], [RP_ACT + 12, -2], [RP_ACT + 15, 0]])
    out.skew = lean(g, g.side * pose)
    out.dy = t >= RP_ACT && t < RP_ACT + 4 ? -Math.round(Math.sin(Math.PI * phase(t, RP_ACT, RP_ACT + 4)) * 2) : 0
  }
  const wear = 1 - phase(t, RP_WEAR + 8, 46)
  if (t === RP_WEAR) out.shade = tint(WHITE, 0.5)
  else if (t > RP_WEAR && wear > 0) out.shade = glow(c, 0.4 * wear)

  if (t >= RP_PEEL && t < RP_FLY) {
    const f = easeOut(phase(t, RP_PEEL, RP_FLY))
    outlined(out, from.x, lerp(from.y, lifted.y, f), MASK, pal, edge, t < RP_PEEL + 2 ? dotted : dot)
    if (t < RP_PEEL + 4) spark(out, from.x + 3, from.y - 1, 2, hi)
  } else if (t >= RP_FLY && t < RP_WEAR) {
    const f = easeInOut(phase(t, RP_FLY, RP_WEAR))
    const p = arcAt(lifted, face, f, 3)
    outlined(out, p.x, p.y + Math.sin(f * TAU * 1.5), MASK, pal, edge)
    for (let k = 1; k <= 3; k++) {
      const q = arcAt(lifted, face, Math.max(0, f - k * 0.06), 3)
      dot(out, q.x + 3, q.y + 3, k === 1 ? hi : lit)
    }
  } else if (t >= RP_WEAR && t < RP_WEAR + 8) {
    outlined(out, face.x, face.y, MASK, pal, edge, t >= RP_WEAR + 4 ? dotted : dot)
    if (t < RP_WEAR + 4) {
      const r = 3 + (t - RP_WEAR) * 1.5
      ring(out, face.x + 3, face.y + 3, r, t - RP_WEAR < 2 ? WHITE : lit, 0, Math.PI, within(g, dotted))
    }
  }
  if (t >= RP_ACT + 4 && t < 46) sparkles(out, t, a.seed, g.cx, g.top + 2, g.right - g.left + 6, 6, lit, 4, within(g))
}

const TK_POP = 2
const TK_FLICK = 14
const TK_SWAP = 20
const TK_DROP = 34
const TK_GONE = 42
const GIFT = ['r...r', '.r.r.', 'bbrbb', 'hbrbb', 'bbrbb', 'ddrdd']

// A gift pops up before the mon and another over the target, the mon flicks a hand and
// both vanish in puffs of smoke, reappear swapped, and drop into their new owners
function trick(out, t, a, g, c) {
  const [hi] = ramp(c)
  const gifts = [
    { b: c, h: light(c, 0.5), d: dark(c, 0.35), r: dark(c, 0.6) },
    { b: light(c, 0.8), h: WHITE, d: light(c, 0.45), r: c },
  ]
  const edge = dark(c, 0.65)
  const spots = [
    { x: g.ahead(3), y: clamp(g.mouth.y - 4, 4, g.ground - 4) },
    { x: g.target.x, y: clamp(g.foe ? g.foe.top - 4 : g.target.y - 6, 4, g.ground - 4) },
  ]
  const homes = [
    { x: g.cx, y: g.cy },
    { x: g.target.x, y: g.target.y },
  ]
  const reach = keys(t, [[0, 0], [4, -1], [TK_FLICK - 1, -1], [TK_FLICK + 1, 2, easeIn], [TK_FLICK + 4, 2], [TK_FLICK + 8, 0]])
  out.dx = Math.round(reach) * g.side
  out.skew = lean(g, g.side * reach)
  // Two cheeky hops once the swap lands
  const hop = (from) => Math.sin(Math.PI * phase(t, from, from + 4))
  if (t >= TK_SWAP + 3 && t < TK_SWAP + 13) out.dy = -Math.round(2 * (hop(TK_SWAP + 3) + hop(TK_SWAP + 8)))

  for (let k = 0; k < 2; k++) {
    const swapped = t >= TK_SWAP
    const art = gifts[swapped ? 1 - k : k]
    const spot = spots[k]
    if (t < TK_POP || (t > TK_FLICK && t < TK_SWAP) || t >= TK_GONE) continue
    let x = spot.x
    let y = spot.y
    let paint = dot
    if (t < TK_FLICK) {
      y += Math.round(keys(t, [[TK_POP, 4], [TK_POP + 3, -1, easeOut], [TK_POP + 5, 0]]))
      if (t >= 8) x += tremble(t)
    } else if (t >= TK_DROP) {
      const f = easeIn(phase(t, TK_DROP, TK_GONE))
      x = lerp(spot.x, homes[k].x, f)
      y = lerp(spot.y, homes[k].y, f)
      if (f > 0.4) paint = dotted
    }
    outlined(out, x - 2, y - 3, GIFT, art, edge, paint)
  }
  if (t >= TK_FLICK && t < TK_SWAP + 2) {
    const r = keys(t, [[TK_FLICK, 1.5], [TK_FLICK + 3, 4, easeOut], [TK_SWAP + 1, 1]])
    spots.forEach((p, k) => {
      puff(out, p.x, p.y, r, light(c, 0.6), a.seed + k * 7 + t, within(g))
    })
  }
  if (t >= TK_SWAP && t < TK_SWAP + 3) {
    for (const p of spots) spark(out, p.x + 3, p.y - 4, t === TK_SWAP ? 2 : 1, hi, within(g))
  }
}

const GW_GROW = 7
const GW_LIFT = 11
const GW_CROSS = 29
const GW_LAND = 33
const GW_FADE = 40

// Shields bloom on the mon and the target, rise, and spin like flipped coins as they
// pass through each other on the same level, then drop onto their new owners
function guardswap(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const h = propOf(g)
  const spots = [mineOf(g), theirsOf(g)]
  const lane = clamp(Math.min(spots[0].y, spots[1].y) - 3, Math.ceil(h / 2) + 1, g.ground - h)
  const tones = [light(c, 0.3), dark(c, 0.3)]
  const jolt = keys(t, [[0, 0], [GW_LAND - 1, 0], [GW_LAND, -1], [GW_LAND + 4, 0]])
  out.dx = Math.round(jolt) * g.side
  if (t >= GW_LAND && t < GW_LAND + 4) out.shade = glow(tones[1], 0.35)

  const midT = Math.round((GW_LIFT + GW_CROSS) / 2)
  // During the pass the shield moving toward the target is drawn on top half the time
  const order = t >= midT - 1 && t <= midT + 1 && t % 2 ? [0, 1] : [1, 0]
  for (const k of order) {
    const p = spots[k]
    const q = spots[1 - k]
    if (t < GW_GROW) {
      shield(out, p.x, p.y, Math.max(2, Math.round(h * easeOut(phase(t, 0, GW_GROW)))), tones[k])
    } else if (t < GW_LIFT) {
      shield(out, p.x, lerp(p.y, lane, easeOut(phase(t, GW_GROW, GW_LIFT))), h, tones[k])
    } else if (t < GW_CROSS) {
      const f = easeInOut(phase(t, GW_LIFT, GW_CROSS))
      const x = lerp(p.x, q.x, f)
      const dir = Math.sign(q.x - p.x) || 1
      const squeeze = Math.cos(f * TAU * 2)
      for (let s = 1; s <= 3; s++) dot(out, x - dir * (h * 0.4 + s * 1.5), lane + (k ? 2 : -2), s === 1 ? lit : tones[k])
      shield(out, x, lane, h, tones[k], { squeeze: Math.abs(squeeze) < 0.15 ? 0.15 : squeeze })
    } else if (t < GW_FADE) {
      const y = lerp(lane, q.y, easeIn(phase(t, GW_CROSS, GW_LAND)))
      shield(out, q.x, y, h, t >= GW_LAND && t < GW_LAND + 2 ? light(c, 0.7) : tones[k])
      if (t >= GW_LAND && t < GW_LAND + 4) ring(out, q.x, q.y, h / 2 + 1 + (t - GW_LAND), hi, 0, Math.PI, within(g, dotted))
    } else {
      const f = phase(t, GW_FADE, 47)
      shield(out, q.x, q.y + f * 2, Math.round(h * (1 - f * 0.5)), tones[k], { paint: dotted })
    }
  }
  if (t >= midT && t < midT + 2) {
    spark(out, (spots[0].x + spots[1].x) / 2, lane - h / 2 - 1, t === midT ? 3 : 2, hi, within(g))
    out.shake = [t === midT ? 1 : 0, 0]
  }
}

const HS_SWELL = 8
const HS_RISE = 14
const HS_ORBIT = 32
const HS_SINK = 40
const BEATS = [40, 45]
const HS_SIZE = 3
const TINY_HEART = ['h.p.', 'pppp', '.pp.']

// Hearts swell out of the mon and the target, rise and waltz around each other in a
// tightening, widening loop until they've traded sides, then sink into their new
// owners, which beat twice
function heartswap(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const bodies = [
    { x: g.cx, y: g.cy },
    { x: g.target.x, y: g.target.y },
  ]
  const tones = [c, light(c, 0.4)]
  const orbitY = clamp(Math.min(bodies[0].y, bodies[1].y) - 4, 5, g.ground - 5)
  const midX = (bodies[0].x + bodies[1].x) / 2
  const r0 = Math.abs(bodies[1].x - bodies[0].x) / 2
  const dir = bodies[0].x < midX ? 1 : -1
  const where = (k, tt) => {
    const p = bodies[k]
    const q = bodies[1 - k]
    if (tt < HS_SWELL) return { x: p.x, y: p.y, s: lerp(0.8, HS_SIZE, easeOut(phase(tt, 0, HS_SWELL))) }
    if (tt < HS_RISE) return { x: p.x, y: lerp(p.y, orbitY, easeInOut(phase(tt, HS_SWELL, HS_RISE))), s: HS_SIZE }
    if (tt < HS_ORBIT) {
      const f = easeInOut(phase(tt, HS_RISE, HS_ORBIT))
      // Start angle on each heart's own side; three half turns leave it on the other side
      const ang = (p.x < midX ? Math.PI : 0) + dir * f * 3 * Math.PI
      const r = r0 * (1 - 0.65 * Math.sin(Math.PI * f))
      const ry = Math.min(r * 0.45, orbitY - 3)
      return { x: midX + Math.cos(ang) * r, y: orbitY + Math.sin(ang) * ry, s: HS_SIZE }
    }
    const f = easeIn(phase(tt, HS_ORBIT, HS_SINK))
    return { x: q.x, y: lerp(orbitY, q.y, f), s: lerp(HS_SIZE, 0.8, f) }
  }

  const beat = BEATS.some((b) => t >= b && t < b + 2)
  if (beat) {
    out.sx = 1.06
    out.sy = 1.06
    out.shade = tint(c, 0.3)
  }
  if (t < HS_SINK) {
    for (let k = 0; k < 2; k++) {
      if (t >= HS_RISE && t < HS_ORBIT) {
        for (let j = 3; j >= 1; j--) {
          const p = where(k, t - j)
          dot(out, p.x, p.y, j === 1 ? lit : tones[k])
        }
      }
      const p = where(k, t)
      heart(out, p.x, p.y, p.s * (t % 6 < 2 ? 1.15 : 1), tones[k], within(g))
    }
  }
  if (t >= HS_SINK && t < HS_SINK + 3) {
    for (const p of bodies) ring(out, p.x, p.y, 2 + (t - HS_SINK) * 1.5, hi, 0, Math.PI, within(g, dotted))
  }
  emit(t, { count: 6, gap: 2, start: BEATS[0], life: 8 }, (i, age, f) => {
    const p = bodies[i % 2]
    const x = p.x + (rnd(a.seed, i) - 0.5) * 8
    const y = p.y - 3 - age * 0.7
    if (f > 0.7 && t % 2) return
    stamp(out, x - 2, y - 1, TINY_HEART, { p: tones[i % 2], h: WHITE }, false, within(g))
  })
}

const LD_RISE = 12
const LD_DANCE = 14
const LD_HOP = 6
const LD_FADE = 40
const LD_BURST = 50
const LD_SET = 54

// A crescent moon (or its bite) of radius r: in on the disc, out of the offset disc
function crescent(out, x, y, r, c, side, paint) {
  const [hi, , , deep] = ramp(c)
  const bx = x + side * r * 0.55
  const by = y - r * 0.3
  const lit = (px, py) => Math.hypot(px - x, py - y) <= r + 0.3 && Math.hypot(px - bx, py - by) > r * 0.85
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      if (!lit(px, py)) continue
      const rim = !lit(px - 1, py) || !lit(px + 1, py) || !lit(px, py - 1) || !lit(px, py + 1)
      const outer = Math.hypot(px - x, py - y) > r - 1.2
      paint(out, px, py, rim ? (outer ? deep : c) : outer ? c : hi)
    }
  }
}

// A crescent moon rises behind the mon as it dances, hopping and turning under falling
// moon dust, then pours itself out: it pales and sinks, a ring of moonlight bursts, and
// its color comes back as the moon sets
function lunardance(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const half = (g.right - g.left) / 2
  const mr = clamp(Math.round(tallOf(g) * 0.2), 3, 5)
  // The moon rises on whichever side of the mon has more room
  const roomy = g.cx > g.columns / 2 ? -1 : 1
  const mx = clamp(Math.round(g.cx + roomy * (half + mr + 2)), mr + 1, g.columns - mr - 2)
  const restY = clamp(g.top + mr - 2, mr + 1, g.ground - mr - 2)
  const rise = easeOut(phase(t, 0, LD_RISE))
  const set = easeIn(phase(t, LD_SET, 63))
  const my = lerp(g.ground + mr + 2, restY, rise) + set * (g.ground - restY + mr + 2)
  if (rise > 0 && set < 1) crescent(out, mx, my, mr, c, roomy, within(g, back))

  if (t >= LD_DANCE && t < LD_FADE) {
    const k = Math.floor((t - LD_DANCE) / LD_HOP)
    const f = ((t - LD_DANCE) % LD_HOP) / LD_HOP
    out.dy = -Math.round(Math.sin(Math.PI * f) * 2)
    out.flipX = k % 2 === 1
    out.skew = lean(g, (k % 2 ? -1 : 1) * g.side * 1.5 * Math.sin(Math.PI * f))
  }
  emit(t, { count: 14, gap: 2, start: 10, life: 12 }, (i, age, f) => {
    const x = lerp(mx + (rnd(a.seed, i) - 0.5) * 4, g.left + rnd(a.seed, i, 1) * (g.right - g.left), f)
    const y = lerp(my + mr, g.top + rnd(a.seed, i, 2) * (g.bottom - g.top), f)
    if ((t + i) % 3 === 0) plus(out, x, y, lit, WHITE, within(g))
    else within(g)(out, x, y, f < 0.5 ? WHITE : hi)
  })

  // Pour out: pale and sink, burst, then recover
  const pale = easeIn(phase(t, LD_FADE, LD_BURST)) * (1 - easeOut(phase(t, LD_BURST, 59)))
  if (pale > 0) {
    out.shade = tint(light(c, 0.6), 0.75 * pale)
    out.sy = 1 - 0.12 * pale
    out.sx = 1 + 0.04 * pale
  }
  if (t >= LD_BURST && t < LD_BURST + 7) {
    const age = t - LD_BURST
    const paint = within(g, age > 4 ? dotted : dot)
    ring(out, g.cx, g.cy, 2 + age * 2, age < 2 ? WHITE : hi, 0, Math.PI, paint)
    if (age >= 1) ring(out, g.cx, g.cy, age * 2, lit, 0, Math.PI, paint)
  }
  if (t >= LD_BURST + 2 && t < 60) sparkles(out, t, a.seed, g.cx, g.cy, g.right - g.left + 8, g.bottom - g.top + 4, lit, 6, within(g))
}

const PW_DRAW = 7
const PW_LAUNCH = 13
const PW_TURN = 20
const PW_STAB = 25
const PW_SINK = 34

// Swords are drawn up out of the mon and the target, rocket to the top of the strip,
// flip point down as they streak past each other, and stab into the other's body
function powerswap(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const len = clamp(propOf(g) + 2, 7, 10)
  const spots = [mineOf(g), theirsOf(g)]
  const topY = len + 2
  const tones = [light(c, 0.2), dark(c, 0.25)]
  const strain = t >= 2 && t < PW_DRAW ? tremble(t) : 0
  const jolt = keys(t, [[0, 1], [PW_STAB - 1, 1], [PW_STAB, 0.92], [PW_STAB + 4, 1]])
  out.dx = strain
  out.sy = jolt
  out.sx = 2 - jolt
  if (t >= PW_STAB && t < PW_STAB + 3) out.shade = glow(tones[1], 0.4)

  for (let k = 0; k < 2; k++) {
    const p = spots[k]
    const q = spots[1 - k]
    const col = tones[k]
    const paint = within(g)
    const base = p.y + 2
    const stabHilt = Math.max(3, q.y + 2 - len)
    if (t < PW_DRAW) {
      sword(out, p.x, base, UP, len, col, { to: Math.max(1, len * easeOut(phase(t, 0, PW_DRAW))), paint })
    } else if (t < PW_LAUNCH) {
      const f = easeIn(phase(t, PW_DRAW, PW_LAUNCH))
      const y = lerp(base, topY, f)
      sword(out, p.x, y, UP, len, col, { paint })
      for (let s = 1; s <= 3; s++) paint(out, p.x, y + 3 + s, s === 1 ? lit : col)
    } else if (t < PW_TURN) {
      const f = easeInOut(phase(t, PW_LAUNCH, PW_TURN))
      const spin = k ? -1 : 1
      const x = lerp(p.x, q.x, f)
      // Pivot on the middle of the blade so the flip stays inside the strip
      const ang = UP + spin * Math.PI * f
      const cy = topY - len / 2
      sword(out, x - Math.cos(ang) * (len / 2), cy - Math.sin(ang) * (len / 2), ang, len, col, { paint })
      const dir = Math.sign(q.x - p.x) || 1
      for (let s = 2; s <= 5; s++) paint(out, x - dir * s, cy + (k ? 1 : -1), s < 4 ? lit : col)
    } else if (t < PW_STAB) {
      const f = easeIn(phase(t, PW_TURN, PW_STAB))
      const from = topY - len
      const y = lerp(from, stabHilt, f)
      sword(out, q.x, y, -UP, len, col, { paint })
      for (let s = 1; s <= 3; s++) paint(out, q.x, y - 3 - s, s === 1 ? lit : col)
    } else if (t < PW_SINK + 8) {
      const quiver = t < PW_SINK ? Math.round(tremble(t) * (1 - phase(t, PW_STAB, PW_SINK))) : 0
      const sink = phase(t, PW_SINK, PW_SINK + 8) * 3
      const flash = t >= PW_STAB + 2 && t % 4 < 2 && t < PW_SINK
      sword(out, q.x + quiver, stabHilt + sink, -UP, len - sink, flash ? hi : col, {
        paint: t >= PW_SINK ? within(g, dotted) : paint,
      })
    }
  }
  if (t >= Math.round((PW_LAUNCH + PW_TURN) / 2) && t < Math.round((PW_LAUNCH + PW_TURN) / 2) + 2) {
    spark(out, (spots[0].x + spots[1].x) / 2, topY - len / 2, 2, hi, within(g))
  }
  if (t >= PW_STAB && t < PW_STAB + 3) {
    out.shake = [0, t === PW_STAB ? 1 : 0]
    for (const p of spots) burst(out, p.x, p.y + 2, [3, 4, 2][t - PW_STAB], hi, within(g))
  }
}

const PY_BUBBLE = 10
const PY_GATHER = 18
const PY_THROW = 20
const PY_SPLAT = 30

// Murky bubbles break out over the sickened mon, get pulled together into a lumpy orb at
// its mouth, and the mon, clean again, hurls it wobbling at the target, where it splats
function psychoshift(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const murk = dark(c, 0.5)
  const orb = { x: g.ahead(2), y: g.mouth.y }
  const { x: tx, y: ty } = g.target
  const sick = phase(t, 0, 6) * (1 - phase(t, PY_GATHER, PY_THROW))
  if (sick > 0) out.shade = glow(murk, 0.35 * sick)
  if (t >= 2 && t < PY_GATHER) out.dx = t % 4 < 2 ? 0 : -g.side
  if (t >= PY_GATHER && t < PY_THROW + 2) out.shade = tint(WHITE, 0.4)
  const fling = keys(t, [[0, 0], [PY_GATHER, -1], [PY_THROW, 2, easeIn], [PY_THROW + 4, 2], [PY_THROW + 10, 0]])
  if (t >= PY_GATHER) out.dx = Math.round(fling) * g.side
  out.skew = lean(g, g.side * Math.max(0, fling))

  for (let i = 0; i < 8; i++) {
    const born = i
    if (t < born || t >= PY_GATHER) continue
    const s = bodySpot(g, a.seed, i)
    const f = easeIn(phase(t, PY_BUBBLE + (i % 3), PY_GATHER))
    const x = lerp(s.x, orb.x, f)
    const y = lerp(s.y, orb.y, f) + (t - born < 2 ? 0 : Math.sin(t * 0.8 + i) * 0.6 * (1 - f))
    plus(out, x, y, murk, t - born < 2 ? WHITE : lit)
  }
  const grown = phase(t, PY_BUBBLE + 2, PY_GATHER)
  if (t >= PY_BUBBLE + 2 && t < PY_THROW) ball(out, orb.x, orb.y, 0.8 + grown * 1.4, murk)
  if (t >= PY_THROW && t < PY_SPLAT) {
    const f = easeIn(phase(t, PY_THROW, PY_SPLAT))
    const x = lerp(orb.x, tx, f)
    const y = lerp(orb.y, ty, f) + Math.sin(f * TAU * 2) * 1.5
    ball(out, x, y, 2.2 + (t % 2) * 0.4, murk)
    dot(out, x - g.side, y - 1, lit)
  }
  emit(t, { count: 8, gap: 1.2, start: PY_THROW, life: 6 }, (i, age) => {
    const f = easeIn(phase(PY_THROW + i * 1.2, PY_THROW, PY_SPLAT))
    const x = lerp(orb.x, tx, f)
    const y = lerp(orb.y, ty, f) + Math.sin(f * TAU * 2) * 1.5 + 2 + age * 0.7
    within(g)(out, x, y, age < 3 ? murk : dark(murk, 0.3))
  })
  if (t >= PY_SPLAT && t < PY_SPLAT + 3) {
    burst(out, tx, ty, [3, 5, 3][t - PY_SPLAT], murk, within(g))
    out.shake = [t === PY_SPLAT ? g.side : 0, 0]
  }
  emit(t, { count: 10, gap: 0, start: PY_SPLAT, life: 9 }, (i, age, f) => {
    const ang = (i / 10) * TAU + rnd(a.seed, i) * 0.5
    const v = 0.9 + rnd(a.seed, i, 1) * 0.5
    const x = tx + Math.cos(ang) * age * v
    const y = ty + Math.sin(ang) * age * v * 0.7 + age * age * 0.06
    if (f > 0.7 && t % 2) return
    within(g)(out, x, y, f < 0.4 ? lit : murk)
  })
  // Murk bubbles keep rising off the target
  emit(t, { count: 7, gap: 2, start: PY_SPLAT + 2, life: 8 }, (i, age, f) => {
    const x = tx + (rnd(a.seed, i, 3) - 0.5) * 8
    const y = ty + 2 - age * 0.8
    if (f > 0.85) plus(out, x, y, hi, WHITE, within(g))
    else ball(out, x, y, 1.2, f < 0.5 ? c : murk, within(g))
  })
}

export const SWAPS = {
  imprison: { ticks: 48, color: 0x9a6ae0, draw: imprison },
  healblock: { ticks: 44, color: 0xff3a5a, draw: healblock },
  wonderroom: { ticks: 52, color: 0x3cd0c0, pose: { view: 'front' }, draw: wonderroom },
  guardsplit: { ticks: 52, color: 0x6aa8ff, draw: guardsplit },
  magiccoat: { ticks: 44, color: 0xffc83a, pose: { view: 'front' }, draw: magiccoat },
  powersplit: { ticks: 52, color: 0xff7a3a, draw: powersplit },
  magicroom: { ticks: 52, color: 0xe060ff, pose: { view: 'front' }, draw: magicroom },
  miracleeye: { ticks: 44, color: 0xf0a020, draw: miracleeye },
  skillswap: { ticks: 48, color: 0xb57aff, draw: skillswap },
  healpulse: { ticks: 44, color: 0xff7ac0, draw: healpulse },
  roleplay: { ticks: 48, color: 0xff9ad8, draw: roleplay },
  trick: { ticks: 48, color: 0xffb030, draw: trick },
  guardswap: { ticks: 48, color: 0x4ab8ff, draw: guardswap },
  heartswap: { ticks: 52, color: 0xff5a9a, draw: heartswap },
  lunardance: { ticks: 64, color: 0xb8c4ff, pose: { view: 'front' }, draw: lunardance },
  powerswap: { ticks: 48, color: 0xff4a3a, draw: powerswap },
  psychoshift: { ticks: 48, color: 0xa05aff, draw: psychoshift },
  trickroom: { ticks: 60, color: 0xff5ac8, pose: { view: 'front' }, draw: trickroom },
}
