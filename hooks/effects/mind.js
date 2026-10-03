// Psychic and ghost moves

import {
  WHITE, back, ball, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, lean, lerp, light, line, luma,
  mix, phase, plus, puff, ramp, ring, rnd, spark, sparkles, stamp, tint,
} from './draw.js'

const TAU = Math.PI * 2
const VIOLET = 0x9d5cff
const SHADOW = 0x1c1029
const SILVER = [0xffffff, 0xdfe3ee, 0xa9b1c6, 0x666d84]
const PASTELS = [0xffb3e6, 0xa8dcff, 0xd9bcff, 0xaef0d2, 0xfff0a8]
const BOLT = ['..yw', '.yw.', 'ywwy', '.wy.', 'wy..', 'y...']
const ZAP_INK = { w: 0xfffbd0, y: 0xffcc1a }
const SLOBBER = [0xffffff, 0xcdeeff, 0x9fd4f0]
const OUTER = [[-1, -1], [1, -1], [-1, 1], [1, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]
const SNOOZE = ['zzzz', '..z.', '.z..', 'zzzz']
const SNOOZE_BIG = ['zzzzzz', 'zzzzzz', '..zz..', '.zz...', 'zzzzzz', 'zzzzzz']

// Whether a pixel outside the sprite touches it (1), sits a step out (2), or neither (0)
function nearness(g, x, y) {
  if (g.solid(x - 1, y) || g.solid(x + 1, y) || g.solid(x, y - 1) || g.solid(x, y + 1)) return 1
  return OUTER.some(([dx, dy]) => g.solid(x + dx, y + dy)) ? 2 : 0
}

// A glow hugging the sprite's outline, behind it at offset ox, oy and following
// out.skew. The outer layer breaks up and crawls, so the glow shimmers.
function aura(out, g, t, inner, outer, ox = 0, oy = 0) {
  for (let y = g.top - 2; y <= g.bottom + 2; y++) {
    const sx = ox + (out.skew ? Math.round(out.skew(y + oy)) : 0)
    for (let x = g.left - 2; x <= g.right + 2; x++) {
      if (g.solid(x, y)) continue
      const near = nearness(g, x, y)
      if (near === 1 && inner !== null) back(out, x + sx, y + oy, inner)
      else if (near === 2 && outer !== null && (x * 3 + y * 5 + t) % 7 > 1) back(out, x + sx, y + oy, outer)
    }
  }
}

// Every other pixel, for things breaking up as they fade
const dotted = (out, x, y, c) => (Math.round(x) + Math.round(y)) % 2 && dot(out, x, y, c)

// Whether the sprite pixel at x, y sits on the sprite's outline
const onEdge = (g, x, y) => !g.solid(x - 1, y) || !g.solid(x + 1, y) || !g.solid(x, y - 1) || !g.solid(x, y + 1)

// An arc around x, y within `spread` of `angle` whose radius ripples like a wave on water
function ripple(out, x, y, r, angle, spread, c, t, paint = dot) {
  const steps = Math.ceil(r * spread * 5)
  for (let k = 0; k <= steps; k++) {
    const ang = angle - spread + (2 * spread * k) / steps
    const rr = r + Math.sin(ang * 6 + t * 1.1) * 0.45
    paint(out, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, c)
  }
}

// Three arms twisting around x, y, white at the eye and darker toward the rim
function vortex(out, x, y, r, spin, twist, colors) {
  for (let arm = 0; arm < 3; arm++) {
    for (let j = 0; j <= 14; j++) {
      const f = j / 14
      const ang = spin + (arm * TAU) / 3 + f * twist
      const rr = r * (0.15 + 0.85 * f)
      const col = colors[Math.min(colors.length - 1, Math.floor(f * colors.length))]
      dot(out, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.75, col)
      if (f > 0.25 && f < 0.9) dot(out, x + Math.cos(ang) * (rr + 1), y + Math.sin(ang) * (rr + 1) * 0.75, dark(col, 0.25))
    }
  }
  dot(out, x, y, WHITE)
}

// A star outline with `points` tips, for psychic blasts
function starRing(out, x, y, r, points, turn, c) {
  let prev = null
  for (let k = 0; k <= points * 2; k++) {
    const ang = turn + (k * Math.PI) / points
    const rr = k % 2 ? r * 0.55 : r
    const p = [x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.8]
    if (prev) line(out, prev[0], prev[1], p[0], p[1], c)
    prev = p
  }
}

// A tall band of warped air at x, bowed toward the target and bent by a sine wave,
// with a bright leading edge, a dark trailing edge and tapered ends
function band(out, x, cy, h, t, side, [front, mid, rear]) {
  const half = h / 2
  for (let y = Math.round(cy - half); y <= Math.round(cy + half); y++) {
    const v = (y - cy) / half
    const bx = x + side * (1 - v * v) * 2 + Math.sin(y * 0.6 + t * 0.8) * 1.1
    const end = Math.abs(v) > 0.8
    dot(out, bx + side, y, end ? mid : front)
    if (end) continue
    dot(out, bx, y, mid)
    dot(out, bx - side, y, rear)
  }
}

// An upright oval outline
function oval(out, x, y, rx, ry, c, paint = dot) {
  const steps = Math.ceil((rx + ry) * 4)
  for (let k = 0; k < steps; k++) {
    const ang = (k / steps) * TAU
    paint(out, x + Math.cos(ang) * rx, y + Math.sin(ang) * ry, c)
  }
}

const CONFUSE_FOCUS = 10
const CONFUSE_POP = 35

// Strain in a glow while sparks gather at the brow, then ripple psychic waves out
// that wring the air at the target into a twisting vortex, which pops
function confusion(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const brow = { x: Math.round(lerp(g.cx, g.mouth.x, 0.6)), y: g.top + 2 }
  const tx = clamp(g.target.x, 7, g.columns - 8)
  const ty = g.target.y
  const glow = phase(t, 0, 5) * (1 - phase(t, 30, 37))
  if (t >= 3 && t < CONFUSE_FOCUS) out.dx = t % 2 ? -g.side : 0
  else if (t >= CONFUSE_FOCUS && t < CONFUSE_FOCUS + 3) out.dx = g.side
  if (t === CONFUSE_FOCUS) out.shade = tint(WHITE, 0.65)
  else if (glow > 0) out.shade = tint(c, (t % 4 < 2 ? 0.2 : 0.12) * glow)
  if (glow > 0.5 || (glow > 0 && t % 2)) aura(out, g, t, t % 4 < 2 ? hi : lit, glow > 0.4 ? c : null, out.dx, 0)

  emit(t, { count: 8, gap: 1, life: 6 }, (i, age, f) => {
    const ang = rnd(a.seed, i) * TAU + f * 1.6
    const r = 2 + 9 * (1 - easeIn(f))
    const x = brow.x + Math.cos(ang) * r
    const y = brow.y + Math.sin(ang) * r * 0.7
    dot(out, x + Math.cos(ang) * 2, y + Math.sin(ang) * 1.4, deep)
    if (f < 0.6) plus(out, x, y, c, WHITE)
    else dot(out, x, y, hi)
  })
  if (t >= 6 && t < CONFUSE_FOCUS + 2) spark(out, brow.x + out.dx, brow.y, t < CONFUSE_FOCUS ? 1 : 3, c)

  // Rippling arcs roll from the brow to the target, breaking up as they go
  const span = Math.max(2, Math.hypot(tx - brow.x, ty - brow.y) - 6)
  const aim = Math.atan2(ty - brow.y, tx - brow.x)
  emit(t, { count: 3, gap: 4, start: CONFUSE_FOCUS + 1, life: 9 }, (i, age, f) => {
    const r = 3 + easeOut(f) * span
    const spread = 0.75 + f * 0.25
    const paint = f < 0.7 ? dot : dotted
    ripple(out, brow.x, brow.y, r, aim, spread, f < 0.3 ? WHITE : hi, t, paint)
    ripple(out, brow.x, brow.y, r - 1, aim, spread, f < 0.6 ? c : deep, t, paint)
    if (f < 0.5) ripple(out, brow.x, brow.y, r - 2, aim, spread * 0.9, deep, t, paint)
  })

  const grow = easeOut(phase(t, 14, 21)) * (1 - easeIn(phase(t, 31, CONFUSE_POP)))
  if (grow > 0) {
    const spin = t * 0.6 + easeIn(phase(t, 27, CONFUSE_POP)) * 5
    ring(out, tx, ty, 2 + grow * 5.5, (t + Math.floor(t / 2)) % 3 ? deep : c, -t * 0.4, 1.2)
    vortex(out, tx, ty, 1.5 + grow * 5, spin, 2.2 + grow * 1.4, [WHITE, hi, lit, c, deep])
  }
  const pop = t - CONFUSE_POP
  if (pop >= 0 && pop < 4) burst(out, tx, ty, [2, 4, 3, 2][pop], pop < 2 ? WHITE : lit)
  if (t >= 33 && t < 39) sparkles(out, t, a.seed, tx, ty, 12, 9, lit, 5)
}

const PSYCHIC_WAVE = 12
const PSYCHIC_BLAST = 34

// Rise in a pulsing aura and roll bands of warped air at the target, where they
// break in a blast that wobbles the strip, then float back down
function psychic(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const up = easeOut(phase(t, 0, 10)) * (1 - easeInOut(phase(t, 41, 51)))
  out.dy = -Math.round(up * (2.5 + Math.sin(t * 0.45) * 0.9))
  const flick = Math.floor(t / 2) % 2
  const warp = up * (t < PSYCHIC_WAVE ? 0.6 : t < PSYCHIC_BLAST ? 1.2 : 1.8 * (1 - phase(t, PSYCHIC_BLAST, PSYCHIC_BLAST + 9)))
  if (warp > 0.1) out.skew = (y) => Math.sin(y * 0.8 - t * 1.1) * warp
  if (t === PSYCHIC_WAVE) out.shade = tint(WHITE, 0.6)
  else if (up > 0) out.shade = tint(c, (flick ? 0.18 : 0.1) * up)
  if (up > 0.1) {
    aura(out, g, t, flick ? lit : c, up > 0.5 ? (flick ? VIOLET : deep) : null, 0, out.dy)
    const w = Math.round(((g.right - g.left) / 2) * (1 - up * 0.35))
    for (let x = g.cx - w; x <= g.cx + w; x++) back(out, x, g.bottom, dark(VIOLET, 0.6))
  }

  // Motes rise from the ground under the floating mon
  emit(t, { count: 12, gap: 3, start: 2, life: 7 }, (i, life, f) => {
    if (up < 0.3) return
    const x = g.left + 1 + rnd(a.seed, i, 7) * (g.right - g.left - 2)
    dot(out, x, g.bottom - life * 0.8, f < 0.5 ? lit : c)
  })

  const dist = Math.max(4, Math.abs(tx - g.mouth.x))
  const tall = clamp(g.bottom - g.top, 8, 18)
  emit(t, { count: 5, gap: 4, start: PSYCHIC_WAVE, life: 10 }, (i, age, f) => {
    const col = i % 2 ? VIOLET : c
    const y = lerp(g.cy + out.dy, ty - 1, f)
    band(out, g.ahead(1 + (dist - 1) * f), y, tall * (0.55 + 0.45 * f), t, g.side, [light(col, 0.6), col, dark(col, 0.35)])
  })

  const age = t - PSYCHIC_BLAST
  if (age >= 0 && age < 9) {
    if (age < 2) disc(out, tx, ty, 4 - age, WHITE)
    const r = 2.5 + easeOut(age / 8) * 8
    starRing(out, tx, ty, r, 7, age * 0.15, age < 3 ? WHITE : age < 6 ? c : VIOLET)
    starRing(out, tx, ty, r - 1, 7, age * 0.15, age < 3 ? hi : age < 6 ? VIOLET : deep)
    if (age < 6) starRing(out, tx, ty, r * 0.55, 5, -age * 0.25, age < 3 ? WHITE : lit)
    out.shake = [Math.round(Math.cos(age * 1.9) * (2 - age / 5)), Math.round(Math.sin(age * 1.9) * (1 - age / 9))]
  }
  emit(t, { count: 10, gap: 0, start: PSYCHIC_BLAST + 2, life: 14 }, (i, life, f) => {
    const ang = rnd(a.seed, i) * TAU
    const r = 3 + life * (0.5 + rnd(a.seed, i, 1) * 0.4)
    const x = tx + Math.cos(ang) * r
    const y = ty + Math.sin(ang) * r * 0.7 - life * 0.15
    if (f < 0.4) plus(out, x, y, i % 2 ? VIOLET : c, WHITE)
    else dot(out, x, y, i % 2 ? VIOLET : lit)
  })
}

const SPOON_NECK = 6
const SPOON_BOWL = 7.5
const SPOON_LONG = 13
const SPOON_MID = (SPOON_BOWL + SPOON_LONG) / 2

// The point `s` px along a spoon standing at x, y, straight up to the neck, then bent
function spoonAt(x, y, bend, side, s) {
  const past = Math.max(0, s - SPOON_NECK)
  return { x: x + side * Math.sin(bend) * past, y: y - Math.min(s, SPOON_NECK) - Math.cos(bend) * past }
}

// A spoon standing on its handle at x, y with the top bent forward by `bend` radians
// at the neck, silver blended toward c by glow, with a glowing outline
function spoon(out, x, y, bend, side, glow, c, t) {
  const pix = new Map()
  const metal = SILVER.map((s) => mix(s, light(c, 0.2), 0.2 * glow))
  for (let s = 0; s <= SPOON_LONG; s += 0.25) {
    const ang = s > SPOON_NECK ? bend : 0
    const { x: cx, y: cy } = spoonAt(x, y, bend, side, s)
    const w = s < SPOON_BOWL ? 0 : 2.2 * Math.sqrt(Math.max(0, 1 - ((s - SPOON_MID) / (SPOON_LONG - SPOON_MID)) ** 2))
    const ux = side * Math.sin(ang)
    const uy = -Math.cos(ang)
    for (let k = -w; k <= w + 0.01; k += 0.5) {
      const px = Math.round(cx - uy * k)
      const py = Math.round(cy + ux * k)
      // Lit from the upper left of the screen, whichever way the spoon points
      const slope = (-uy * k + ux * k * 0.5) / Math.max(1, w)
      const tone = w < 1 ? metal[1] : slope < -0.45 ? metal[0] : slope < 0.2 ? metal[1] : slope < 0.7 ? metal[2] : metal[3]
      pix.set(px + ',' + py, [px, py, tone])
    }
  }
  // A dark edge for a crisp silhouette, then a flickering glow beyond it
  const edge = new Map()
  for (const [px, py] of pix.values()) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = px + dx + ',' + (py + dy)
      if (!pix.has(key)) edge.set(key, [px + dx, py + dy])
    }
  }
  if (glow > 0) {
    for (const [px, py] of edge.values()) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const key = px + dx + ',' + (py + dy)
        if (!pix.has(key) && !edge.has(key) && (px + py + t) % 2) dot(out, px + dx, py + dy, glow > 0.5 && t % 4 < 2 ? c : light(c, 0.3))
      }
    }
  }
  for (const [px, py] of edge.values()) dot(out, px, py, mix(SILVER[3], dark(c, 0.3), glow))
  for (const [px, py, col] of pix.values()) dot(out, px, py, col)
}

const KINESIS_BEND = [8, 27]
const KINESIS_SNAP = 27

// Conjure a spoon and stare it down until it glows and bends over in shimmering air,
// then folds with a flash that ripples out
function kinesis(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const fx = g.ahead(4)
  const fy = Math.min(g.ground - 1, g.mouth.y + 5)
  const glow = phase(t, 5, 9) * (1 - phase(t, 32, 39))
  const strain = t >= KINESIS_BEND[0] && t < KINESIS_SNAP
  if (strain) out.dx = t % 3 === 0 ? -g.side : 0
  if (t === KINESIS_SNAP) out.shade = tint(WHITE, 0.55)
  else if (glow > 0) out.shade = tint(c, (t % 4 < 2 ? 0.18 : 0.1) * glow)
  if (glow > 0.3) aura(out, g, t, t % 4 < 2 ? lit : c, null, out.dx, 0)

  // Short wavy streaks of heat haze rise around the spoon
  emit(t, { count: 18, gap: 1.2, start: 6, life: 8 }, (i, age, f) => {
    if (t >= KINESIS_SNAP + 6) return
    const x0 = fx + (rnd(a.seed, i, 3) - 0.5) * 14
    const y0 = fy - 2 - rnd(a.seed, i, 4) * 10 - age * 0.5
    const col = f < 0.3 ? hi : f < 0.7 ? lit : c
    for (let k = 0; k < 3; k++) dot(out, x0 + Math.round(Math.sin((y0 + k) * 1.3 + t * 0.8) * 0.7), y0 + k, col)
  })

  // The spoon fades in and out by flickering
  const shown = t >= 3 && t < 41 && !(t < 6 && t % 2) && !(t >= 36 && t % 2)
  const bend = 1.8 * easeInOut(phase(t, KINESIS_BEND[0], KINESIS_BEND[1])) + (strain && t % 4 === 1 ? 0.08 : 0)
  const jitter = strain && t % 3 === 1 ? g.side : 0
  if (shown) spoon(out, fx + jitter, fy, bend, g.side, glow, c, t)
  if (t >= 1 && t < 6) spark(out, fx, fy - 6, t < 4 ? t : 6 - t, lit)

  const bowl = spoonAt(fx, fy, bend, g.side, SPOON_MID)
  const age = t - KINESIS_SNAP
  if (age >= 0 && age < 4) burst(out, bowl.x, bowl.y, [3, 5, 4, 2][age], age < 2 ? WHITE : c)
  emit(t, { count: 2, gap: 3, start: KINESIS_SNAP + 1, life: 8 }, (i, life, f) => {
    const r = 2 + easeOut(f) * 6
    const paint = f < 0.6 ? dot : dotted
    ring(out, bowl.x, bowl.y, r, f < 0.3 ? WHITE : f < 0.6 ? hi : c, 0, Math.PI, paint)
    ring(out, bowl.x, bowl.y, r - 1, f < 0.5 ? c : deep, 0, Math.PI, paint)
  })
  if (t >= KINESIS_SNAP + 4 && t < 40) sparkles(out, t, a.seed, g.target.x, g.target.y - 2, 10, 8, lit, 4)
}

// A two tone spiral disc of radius r turned by spin, with a dark rim and white eye
function hypnoDisc(out, x, y, r, spin, [hi, lo, rim]) {
  for (let py = Math.floor(y - r - 1); py <= Math.ceil(y + r + 1); py++) {
    for (let px = Math.floor(x - r - 1); px <= Math.ceil(x + r + 1); px++) {
      const d = Math.hypot(px - x, py - y)
      if (d > r + 0.5) continue
      if (d > r - 0.6) {
        dot(out, px, py, rim)
        continue
      }
      const v = Math.atan2(py - y, px - x) / TAU + d / 3.4 - spin
      dot(out, px, py, ((v % 1) + 1) % 1 < 0.5 ? hi : lo)
    }
  }
  dot(out, x, y, WHITE)
}

const HYPNO_WAVES = 12

// Spin up a two tone spiral before the mon that throbs and sends drowsy waves to the
// target, where sleepy Zs drift up
function hypnosis(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const dist = Math.abs(g.target.x - g.mouth.x)
  const big = clamp(Math.floor(dist / 2.5), 4, 6)
  const sx = g.ahead(big - 1)
  const sy = clamp(g.mouth.y, big + 1, g.ground - big - 1)
  const size = easeOut(phase(t, 2, 12)) * (1 - easeIn(phase(t, 40, 47)))
  const throb = Math.sin(t * 0.7)
  const r = size * (big + throb * 0.5)
  const pulse = throb > 0
  if (size > 0) {
    out.skew = lean(g, Math.sin(t * 0.35) * 1.6 * size)
    out.shade = tint(c, (pulse ? 0.22 : 0.1) * size)
    if (pulse) aura(out, g, t, c, null)
  }
  if (r >= 1) hypnoDisc(out, sx, sy, r, t * 0.08, [pulse ? WHITE : hi, pulse ? deep : dark(c, 0.25), dark(c, 0.6)])

  // Drowsy sine waves drift past the target
  const from = sx + g.side * big
  const to = g.target.x + g.side * 2
  emit(t, { count: 6, gap: 4, start: HYPNO_WAVES, life: 13 }, (i, age, f) => {
    const x0 = lerp(from, to, f)
    const y0 = lerp(sy, g.target.y - 1, f) + ((i % 3) - 1) * 2
    const col = f < 0.5 ? hi : f < 0.8 ? lit : c
    for (let k = 0; k < 6; k++) {
      const x = x0 - g.side * k
      const y = y0 + Math.round(Math.sin(k * 0.9 - t * 0.45) * 1.4)
      dot(out, x, y, col)
      dot(out, x, y + 1, f < 0.8 ? c : deep)
    }
  })
  emit(t, { count: 4, gap: 5, start: 27, life: 17 }, (i, age, f) => {
    const x = g.target.x + (i % 2 ? 1 : -3) + Math.sin(age * 0.35 + i) * 1.5
    const y = g.target.y - 5 - age * 0.6
    if (y < -3 || (f > 0.8 && t % 2)) return
    stamp(out, x - 1, y - 1, SNOOZE_BIG, { z: deep })
    stamp(out, x, y, SNOOZE, { z: f < 0.5 ? WHITE : hi })
  })
}

// A shadow tendril from x0, y0 reaching `len` px toward the target. It thins from root
// to tip, has a dark core between glowing edges, and writhes. Returns its tip.
function tendril(out, g, x0, y0, y1, len, dist, t, k, [top, core, low]) {
  const at = (s) => ({ x: x0 + g.side * s, y: lerp(y0, y1, s / dist) + Math.sin(s * 0.7 - t * 0.8 + k * 2.1) * (0.4 + (s / dist) * 1.6) })
  for (let s = 0; s <= len; s += 0.5) {
    const { x, y } = at(s)
    const half = s > len - 1.5 ? 0 : lerp(1.4, 0.5, s / dist)
    dot(out, x, y - half - 0.5, top)
    if (half > 0.6) dot(out, x, y, core)
    dot(out, x, y + half + 0.5, low)
  }
  return at(len)
}

const SHADE_RINGS = 4
const SHADE_REACH = [10, 20]
const SHADE_HIT = 21

// Turn into a black shape with a burning rim and eyes, send shadow rings and writhing
// tendrils at the target, and break there in a dark burst
function nightshade(out, t, a, g, c) {
  const rim = Math.floor(t / 2) % 2 ? light(c, 0.45) : light(c, 0.65)
  const glowing = light(c, 0.3)
  const core = dark(c, 0.45)
  const dim = phase(t, 0, 6) * (1 - phase(t, 35, 42))
  if (t >= SHADE_RINGS && t < SHADE_HIT + 3) out.dx = g.side
  else if (t >= 1 && t < SHADE_RINGS) out.dx = -g.side
  const ox = out.dx
  if (dim > 0) {
    out.shade = (x, y, col) => {
      if (luma(col) > 190) return mix(col, t % 4 < 2 ? 0xff4a5e : 0xffd0d8, dim)
      return mix(col, onEdge(g, x - ox, y) ? rim : SHADOW, dim * 0.92)
    }
    aura(out, g, t, dim > 0.5 ? c : null, dim > 0.5 ? core : null, ox, 0)
  }

  const dist = Math.max(4, Math.abs(g.target.x - g.mouth.x))
  const grab = easeOut(phase(t, SHADE_REACH[0], SHADE_REACH[1])) * (1 - easeIn(phase(t, SHADE_HIT + 3, SHADE_HIT + 11)))
  const ys = [g.mouth.y - 2, Math.min(g.ground - 2, g.mouth.y + 5)]
  ys.forEach((y0, k) => {
    const len = dist * grab * (k ? 1.05 : 0.95)
    const y1 = g.target.y + (k ? 1 : -2)
    if (len < 1) return
    const tip = tendril(out, g, g.mouth.x - g.side + ox, y0, y1, len, dist, t, k, [glowing, core, c])
    if (grab > 0.8) {
      for (const d of [-1.5, 0, 1.5]) line(out, tip.x, tip.y, tip.x + g.side * 2, tip.y + d, rim)
    }
  })

  emit(t, { count: 3, gap: 3, start: SHADE_RINGS, life: 9 }, (i, age, f) => {
    const x = g.ahead(1 + (dist - 1) * f) + ox
    const y = lerp(g.mouth.y, g.target.y, f)
    const rx = 1.5 + f * 1.5
    const ry = 3 + f * 3
    if (f > 0.75 && (age + i) % 2) return
    oval(out, x, y, rx + 1, ry + 1, f < 0.5 ? rim : c)
    oval(out, x, y, rx, ry, f < 0.5 ? c : core)
  })

  const age = t - SHADE_HIT
  const { x: tx, y: ty } = g.target
  if (age >= 0 && age < 10) {
    const r = [2.5, 4, 5, 5.5, 5.5, 5, 4.5, 3.5, 2.5, 1.5][age]
    if (age < 6) burst(out, tx, ty, r + 3, age < 2 ? rim : c)
    disc(out, tx, ty, r, core)
    disc(out, tx, ty, r * 0.6, SHADOW)
    ring(out, tx, ty, r, age < 2 ? WHITE : age < 6 ? rim : c)
    if (age < 2) out.shake = [age ? -g.side : g.side, 1 - age]
  }
  emit(t, { count: 10, gap: 1, start: SHADE_HIT + 3, life: 12 }, (i, life, f) => {
    const x = tx + (rnd(a.seed, i) - 0.5) * 10 + Math.sin(life * 0.5 + i) * 1.2
    const y = ty + 2 - rnd(a.seed, i, 1) * 3 - life * 0.6
    dot(out, x, y, f < 0.4 ? rim : f < 0.75 ? c : core)
    if (f < 0.6) dot(out, x, y + 1, core)
  })
}

const LICK_OUT = [4, 9]
const LICK_BACK = [22, 27]

// Rear back and shoot out a long fat tongue that wiggles, slurps the target in a
// splash of slobber that leaves it twitching with sparks, then snaps back
function lick(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const rootY = Math.min(g.ground - 3, g.mouth.y + 2)
  const rootX = g.frontAt(rootY) - g.side
  const dist = clamp(Math.abs(g.target.x - rootX), 5, 14)
  const reachOut = easeOut(phase(t, LICK_OUT[0], LICK_OUT[1])) * (1 - easeIn(phase(t, LICK_BACK[0], LICK_BACK[1])))
  const len = dist * reachOut
  if (t >= 1 && t < LICK_OUT[0]) out.dx = -g.side
  else if (t >= LICK_OUT[0] && t < LICK_BACK[1]) out.dx = g.side
  if (t >= 1 && t < LICK_BACK[1]) out.skew = lean(g, g.side * (t < LICK_OUT[0] ? -1.5 : 2 * reachOut))
  const ox = out.dx + (out.skew ? Math.round(out.skew(rootY)) : 0)
  const lickAt = phase(t, LICK_OUT[1], LICK_BACK[0])
  const curl = Math.sin(lickAt * Math.PI * 3) * 3 * Math.sin(lickAt * Math.PI)
  const tongueY = (s) => {
    const f = s / Math.max(1, len)
    return rootY + Math.sin(s * 0.8 - t * 1.3) * 1.2 * f - curl * f ** 3
  }
  if (len > 0.5) {
    for (let s = 0; s <= len; s += 0.5) {
      const x = rootX + g.side * s + ox
      const y = tongueY(s)
      dot(out, x, y - 1, lit)
      dot(out, x, y, c)
      dot(out, x, y + 1, s % 3 < 1.5 ? c : dark(c, 0.15))
      dot(out, x, y + 2, deep)
    }
    const tipX = rootX + g.side * len + ox
    const tipY = tongueY(len) + 0.5
    disc(out, tipX, tipY, 2, c)
    dot(out, tipX - g.side, tipY - 1, hi)
    dot(out, tipX, tipY - 1, lit)
    for (const d of [-1, 0, 1]) dot(out, tipX + d, tipY + 2, deep)
    dot(out, tipX + g.side * 2, tipY + 1, deep)
  }

  const hitX = rootX + g.side * dist + ox
  const hitY = rootY
  if (t === LICK_OUT[1] || t === LICK_OUT[1] + 1) out.shake = [t === LICK_OUT[1] ? g.side : 0, 0]
  emit(t, { count: 10, gap: 0.4, start: LICK_OUT[1], life: 12 }, (i, life, f) => {
    const ang = -Math.PI / 2 + g.side * (0.3 + rnd(a.seed, i) * 1.4)
    const speed = 0.7 + rnd(a.seed, i, 1) * 0.8
    const x = hitX + Math.cos(ang) * speed * life
    const y = hitY + Math.sin(ang) * speed * life + 0.09 * life * life
    if (y > g.ground) return
    dot(out, x, y, f < 0.5 ? SLOBBER[0] : SLOBBER[1])
    if (i % 2 && f < 0.6) {
      dot(out, x + 1, y, SLOBBER[1])
      dot(out, x, y + 1, SLOBBER[2])
      dot(out, x + 1, y + 1, SLOBBER[2])
    }
  })
  emit(t, { count: 4, gap: 3, start: LICK_OUT[1] + 2, life: 9 }, (i, life) => {
    const s = len * (0.3 + rnd(a.seed, i, 2) * 0.6)
    const x = rootX + g.side * s + ox
    const y = rootY + 3 + 0.12 * life * life
    if (y > g.ground) return
    dot(out, x, y, SLOBBER[0])
    dot(out, x, y + 1, SLOBBER[2])
  })

  // Little paralysis bolts flicker around the licked spot
  if (t >= 13 && t < 33 && t % 3 !== 2) {
    for (let k = 0; k < 3; k++) {
      const bx = hitX + [-3, 2, 0][k] * g.side + (Math.floor(t / 3) % 2 ? 1 : 0)
      const by = hitY + [-8, -6, 5][k]
      stamp(out, bx - 2, by - 3, BOLT, ZAP_INK, (k + Math.floor(t / 3)) % 2 === 1)
    }
  }
}

const RAY_OUT = 8
const RAY_ORBIT = 26
const RAY_POP = 44

// Where the confuse ray's orb is at tick t. It swells at the mouth, wobbles out, then
// circles the target.
function orbAt(t, g) {
  const { y: my } = g.mouth
  const rx = clamp(g.reach / 2 - 1, 3, 5)
  const ry = rx * 0.7
  const cx = clamp(g.target.x, rx + 4, g.columns - rx - 5)
  const cy = Math.max(ry + 2, g.target.y - 3)
  if (t < RAY_OUT) return { x: g.ahead(2), y: my }
  const start = cx + g.side * rx
  if (t < RAY_ORBIT) {
    const f = phase(t, RAY_OUT, RAY_ORBIT)
    return { x: lerp(g.ahead(2), start, easeInOut(f)), y: lerp(my, cy, f) + Math.sin(f * TAU * 1.5) * 2.5 }
  }
  const ang = (t - RAY_ORBIT) * 0.4
  return { x: cx + g.side * Math.cos(ang) * rx, y: cy - Math.sin(ang) * ry }
}

// Breathe a flickering orb with a halo that wobbles out to the target and circles it,
// trailing sparkles, until it pops
function confuseray(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const swell = easeOut(phase(t, 0, RAY_OUT))
  if (t < RAY_OUT) {
    out.shade = tint(light(c, 0.5), 0.12 * swell)
    aura(out, g, t, t % 2 ? lit : c, null)
  }
  if (t >= RAY_OUT - 2 && t < RAY_OUT) out.dx = -g.side
  if (t < RAY_POP) {
    for (let k = 10; k >= 1; k--) {
      if (t - k < RAY_OUT) continue
      const p = orbAt(t - k, g)
      const col = k < 4 ? lit : k < 7 ? c : deep
      if ((t + k) % 4 === 0) plus(out, p.x, p.y, col, WHITE)
      else if ((t + k) % 2) dot(out, p.x, p.y, col)
    }
    const p = orbAt(t, g)
    const r = 0.8 + swell * 1.7
    const bright = t % 4 < 2
    const shimmer = (o, x, y, col) => (Math.round(x) + Math.round(y) + t) % 2 && dot(o, x, y, col)
    if (r > 1.5) ring(out, p.x, p.y, r + 2, bright ? c : deep, 0, Math.PI, shimmer)
    ball(out, p.x, p.y, r, bright ? lit : c)
    dot(out, p.x, p.y, WHITE)
    if (r > 1.5) {
      for (let k = 0; k < 4; k++) {
        const ang = t * 0.3 + (k * TAU) / 4
        dot(out, p.x + Math.cos(ang) * (r + 2), p.y + Math.sin(ang) * (r + 2), bright ? WHITE : hi)
      }
    }
  }
  const age = t - RAY_POP
  const end = orbAt(RAY_POP, g)
  if (age >= 0 && age < 4) burst(out, end.x, end.y, [3, 5, 4, 2][age], age < 2 ? WHITE : c)
  if (t >= RAY_POP) sparkles(out, t, a.seed, end.x, end.y, 12, 9, c, 6)
}

// A dreamy bubble, a pastel ring shaded on its lower right, with a white glint
function bubble(out, x, y, r, c) {
  if (r < 1.2) {
    dot(out, x, y, c)
    dot(out, x - 1, y - 1, WHITE)
    return
  }
  ring(out, x, y, r, c)
  ring(out, x, y, r, dark(c, 0.3), Math.PI / 4, 0.8)
  dot(out, x - r * 0.45, y - r * 0.45, WHITE)
}

const DREAM_RISE = 6
const DREAM_BUBBLES = 8
const DREAM_GAP = 3
const DREAM_FLOAT = 7
const DREAM_SUCK = 8

// Where dream bubble k is `age` ticks after it appears, and how big
function dreamAt(k, age, a, g) {
  const x0 = g.target.x + (rnd(a.seed, k) - 0.5) * 8
  const rise = Math.min(age, DREAM_FLOAT)
  const fx = x0 + Math.sin(rise * 0.6 + k) * 1.2
  const fy = g.target.y + 1 - rise * 0.7
  const size = 1.6 + (k % 2) * 0.7
  if (age < DREAM_FLOAT) return { x: fx, y: fy, r: size }
  // A curve up and over into the mouth, quicker and smaller as it goes
  const f = easeIn(phase(age, DREAM_FLOAT, DREAM_FLOAT + DREAM_SUCK))
  const bend = { x: lerp(fx, g.mouth.x, 0.5), y: Math.min(fy, g.mouth.y) - 4 }
  return {
    x: lerp(lerp(fx, bend.x, f), lerp(bend.x, g.mouth.x, f), f),
    y: lerp(lerp(fy, bend.y, f), lerp(bend.y, g.mouth.y, f), f),
    r: size * (1 - f * 0.6),
  }
}

// A shadow sweeps over the mon while pastel dream bubbles rise from the target and
// get slurped in one by one, each feeding its purple glow
function dreameater(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const eaten = (k) => DREAM_RISE + k * DREAM_GAP + DREAM_FLOAT + DREAM_SUCK
  let full = 0
  for (let k = 0; k < DREAM_BUBBLES; k++) if (t >= eaten(k)) full += 1
  const glow = (full / DREAM_BUBBLES) * (1 - phase(t, 46, 52))
  const gulp = [...Array(DREAM_BUBBLES).keys()].some((k) => t === eaten(k))

  if (t >= 12 && t < eaten(DREAM_BUBBLES - 1)) out.dx = g.side
  if (t >= 44 && t < 47) out.dy = -1
  // The shadow's band sweeps from the front of the mon to its back
  const sweep = lerp(g.side > 0 ? g.right + 4 : g.left - 4, g.side > 0 ? g.left - 4 : g.right + 4, phase(t, 0, 12))
  const hue = (0.05 + 0.12 * glow) * (1 - phase(t, 46, 51))
  if (hue > 0) {
    out.shade = (x, y, col) => {
      let k = mix(col, c, hue)
      if (gulp) k = mix(k, WHITE, 0.3)
      if (t < 12 && Math.abs(x - sweep + (y - g.top) * 0.4) < 3) k = mix(k, SHADOW, 0.6)
      return k
    }
  }
  if (glow > 0) aura(out, g, t, t % 4 < 2 ? c : lit, glow > 0.4 ? (t % 4 < 2 ? deep : VIOLET) : null, out.dx, out.dy)

  // The dream is a pastel cloud over the target that wanes as it is eaten
  const cloud = phase(t, 0, 4) * (1 - phase(t, 30, 42))
  if (cloud > 0) {
    puff(out, tx, ty + 1, 1 + cloud * 3, 0xe9d6ff, a.seed, back)
    puff(out, tx + 3, ty + 2, cloud * 2.2, 0xffd6ef, a.seed + 1, back)
    if (t % 3) sparkles(out, t, a.seed, tx, ty, 9, 5, 0xffe9a8, 3)
  }

  for (let k = 0; k < DREAM_BUBBLES; k++) {
    const age = t - DREAM_RISE - k * DREAM_GAP
    if (age < 0 || age >= DREAM_FLOAT + DREAM_SUCK) continue
    const col = PASTELS[k % PASTELS.length]
    if (age > DREAM_FLOAT) {
      for (let lag = 1; lag <= 3; lag++) {
        const p = dreamAt(k, age - lag * 0.7, a, g)
        dot(out, p.x, p.y, lag === 1 ? light(col, 0.4) : col)
      }
    }
    const p = dreamAt(k, age, a, g)
    bubble(out, p.x + out.dx * phase(age, DREAM_FLOAT, DREAM_FLOAT + DREAM_SUCK), p.y, p.r, col)
  }
  if (gulp) plus(out, g.mouth.x + out.dx, g.mouth.y, hi, WHITE)
  if (t >= 40 && t < 50) sparkles(out, t, a.seed, g.cx, g.top + 3, g.right - g.left + 4, 8, lit, 5)
}

export const MIND = {
  confusion: { ticks: 40, color: 0xd88aff, draw: confusion },
  psychic: { ticks: 52, color: 0xff6ad5, draw: psychic },
  kinesis: { ticks: 44, color: 0xffb0f0, draw: kinesis },
  hypnosis: { ticks: 48, color: 0xb07aff, draw: hypnosis },
  nightshade: { ticks: 44, color: 0x6a3a9a, draw: nightshade },
  lick: { ticks: 36, color: 0xff8fb0, draw: lick },
  confuseray: { ticks: 48, color: 0xffe066, draw: confuseray },
  dreameater: { ticks: 52, color: 0xb07aff, draw: dreameater },
}
