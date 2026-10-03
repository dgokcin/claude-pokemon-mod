// Moves that toughen or shield the mon

import {
  WHITE, back, clamp, dark, dot, easeIn, easeOut, emit, hsl, keys, lerp, light, line, mix, phase, puff, ramp, rnd,
  spark, sparkles, tremble,
} from './draw.js'

const FAR = 99
const ROOT3 = Math.sqrt(3)

// Whether the sprite covers (x, y) once this frame's offset and scale apply
function bodyNow(out, g) {
  const ax = (g.left + g.right + 1) / 2
  const ay = g.bottom + 1
  return (x, y) => g.solid(Math.floor(ax + (x - out.dx + 0.5 - ax) / out.sx), Math.floor(ay + (y - out.dy + 0.5 - ay) / out.sy))
}

// The box the sprite fills once this frame's offset and scale apply
function boxNow(out, g) {
  const ax = (g.left + g.right + 1) / 2
  const ay = g.bottom + 1
  return {
    left: Math.floor(ax + (g.left - ax) * out.sx) + out.dx,
    right: Math.ceil(ax + (g.right + 1 - ax) * out.sx) - 1 + out.dx,
    top: Math.floor(ay + (g.top - ay) * out.sy) + out.dy,
    bottom: g.bottom + out.dy,
  }
}

// One chamfer pass of a distance field, forward or backward
function sweep(d, w, h, dir) {
  for (let n = 0; n < w * h; n++) {
    const k = dir > 0 ? n : w * h - 1 - n
    const i = k % w
    const j = Math.floor(k / w)
    let v = d[k]
    if (i - dir >= 0 && i - dir < w) v = Math.min(v, d[k - dir] + 1)
    if (j - dir >= 0 && j - dir < h) {
      const row = k - dir * w
      v = Math.min(v, d[row] + 1)
      if (i > 0) v = Math.min(v, d[row - 1] + Math.SQRT2)
      if (i < w - 1) v = Math.min(v, d[row + 1] + Math.SQRT2)
    }
    d[k] = v
  }
}

// Pixels from each spot within `pad` of the box to the nearest solid one, 0 inside
function distanceField(solid, box, pad, g) {
  const x0 = Math.max(0, box.left - pad)
  const y0 = Math.max(0, box.top - pad)
  const w = Math.min(g.columns - 1, box.right + pad) - x0 + 1
  const h = Math.min(g.pixels - 1, box.bottom + pad) - y0 + 1
  if (w <= 0 || h <= 0) return () => FAR
  const d = new Float32Array(w * h)
  for (let k = 0; k < w * h; k++) d[k] = solid(x0 + (k % w), y0 + Math.floor(k / w)) ? 0 : FAR
  sweep(d, w, h, 1)
  sweep(d, w, h, -1)
  return (x, y) => (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h ? FAR : d[(y - y0) * w + x - x0])
}

// Calls fn(x, y, d) for each pixel between r0 and r1 from (cx, cy), d its distance.
// squash < 1 flattens the circle into an ellipse.
function annulus(cx, cy, r0, r1, fn, squash = 1) {
  for (let y = Math.floor(cy - r1 * squash) - 1; y <= Math.ceil(cy + r1 * squash); y++) {
    for (let x = Math.floor(cx - r1) - 1; x <= Math.ceil(cx + r1); x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / squash)
      if (d > r0 && d <= r1) fn(x, y, d)
    }
  }
}

// The columns a wall `width` wide takes in front of the mon after a `gap`,
// squeezed against the mon when the strip runs out
function frontWall(g, width, gap) {
  const front = g.side > 0 ? g.right : g.left
  const room = g.side > 0 ? g.columns - 1 - front : front
  const w = Math.min(width, Math.max(5, room))
  const off = clamp(room - w, -1, gap) + 1
  const near = front + g.side * off
  const far = front + g.side * (off + w - 1)
  return { near, x0: Math.min(near, far), x1: Math.max(near, far), cx: (near + far) / 2, w }
}

// The columns of the top few rows of the sprite, where its head is
function headOf(g) {
  let left = g.right
  let right = g.left
  for (let y = g.top; y < g.top + 4; y++) {
    for (let x = g.left; x <= g.right; x++) {
      if (!g.solid(x, y)) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
    }
  }
  return { left, right, x: (left + right + 1) / 2 }
}

const HARDEN_SWEEPS = [[5, 15], [16, 26]]

// Brace and turn to steel while a glint sweeps across the body twice, each pass
// ending in a twinkle, then soften back
function harden(out, t, a, g, c) {
  const steel = phase(t, 0, 6) * (1 - phase(t, a.ticks - 8, a.ticks - 1))
  out.sy = 1 - 0.06 * steel
  const sweeping = HARDEN_SWEEPS.some(([from, to]) => t >= from && t < to)
  if (steel > 0 || sweeping) out.shade = (x, y, col) => {
    let k = mix(col, c, 0.5 * steel)
    for (const [from, to] of HARDEN_SWEEPS) {
      if (t < from || t >= to) continue
      const d = Math.abs(x - lerp(g.left - 8, g.right + 4, phase(t, from, to)) + (y - g.top) * 0.6)
      if (d < 1) k = WHITE
      else if (d < 2.5) k = light(k, 0.55)
    }
    return k
  }
  for (const [, to] of HARDEN_SWEEPS) {
    const age = t - to
    if (age >= 0 && age < 6) spark(out, g.right - 1, g.top + 2, age < 3 ? age + 1 : 5 - age, light(c, 0.3))
  }
  emit(t, { count: 6, gap: 1.2, start: HARDEN_SWEEPS[1][1], life: 6 }, (i, age) => {
    const x = g.left + rnd(a.seed, i) * (g.right - g.left)
    const y = g.top + rnd(a.seed, i, 1) * (g.bottom - g.top)
    if (g.solid(Math.round(x), Math.round(y))) spark(out, x, y, age < 3 ? 1 : 0, c)
  })
}

const SHELL_IN = 7
const SHELL_OUT = 29
const SHELL_GLINTS = [[12, 19], [20, 27]]
const SHELL_SEAM = 0.62
const SHELL_SHARDS = 12

// The dome that closes over the tucked in mon, its base on the feet
function shellOf(g) {
  return {
    x: (g.left + g.right + 1) / 2,
    y: g.bottom + 1,
    rx: (g.right - g.left + 1) * 0.56 + 2,
    ry: (g.bottom - g.top + 1) * 0.6 + 2.5,
  }
}

// Where (x, y) sits in the dome, or null outside. e is 1 on the rim, depth counts
// pixels in from the rim, and angle runs from 0 at one foot to PI at the other.
function inShell(d, x, y) {
  const u = x + 0.5 - d.x
  const v = d.y - y - 0.5
  const e = Math.hypot(u / d.rx, v / d.ry)
  if (v < 0 || e > 1) return null
  const rho = Math.hypot(u, v)
  return { u, v, e, rho, depth: rho / e - rho, angle: Math.atan2(v, u) }
}

// Whether p lies on a seam of the shell, which has a band of rim plates around three big ones
function onSeam(p, d) {
  if (Math.abs(p.e - SHELL_SEAM) * Math.min(d.rx, d.ry) < 0.5) return true
  const n = p.e > SHELL_SEAM ? 6 : 3
  const k = (p.angle * n) / Math.PI
  return p.rho > 2 && Math.round(k) % n !== 0 && Math.abs(k - Math.round(k)) * (Math.PI / n) * p.rho < 0.5
}

// The middle of the plate that (x, y) lies on, as an angle across the dome
function plateAngle(p) {
  const n = p.e > SHELL_SEAM ? 6 : 3
  return ((Math.floor((p.angle * n) / Math.PI) + 0.5) * Math.PI) / n
}

// Duck hard into the shell while a glowing dome closes over it, its plates shimmer
// in turn under sweeping glints, then spring back out as it shatters
function withdraw(out, t, a, g, c) {
  out.sy = keys(t, [[0, 1], [3, 1.08], [SHELL_IN, 0.5], [SHELL_IN + 2, 0.6], [SHELL_OUT, 0.6], [SHELL_OUT + 3, 1.14], [SHELL_OUT + 6, 0.96], [SHELL_OUT + 9, 1]])
  out.sx = keys(t, [[0, 1], [3, 0.95], [SHELL_IN, 1.12], [SHELL_IN + 2, 1.04], [SHELL_OUT, 1.04], [SHELL_OUT + 3, 0.92], [SHELL_OUT + 6, 1.02], [SHELL_OUT + 9, 1]])
  const hop = t - SHELL_OUT - 1
  if (hop >= 0 && hop < 4) out.dy = -[1, 2, 2, 1][hop]
  if (t === SHELL_IN) out.shake = [0, 1]
  const d = shellOf(g)
  if (t >= SHELL_IN - 1 && t <= SHELL_OUT) shell(out, t, g, c, d)
  if (t > SHELL_OUT) shards(out, t - SHELL_OUT, a, g, c, d)
}

// The glowing dome. Its rim closes up from both feet, its plates light up in a
// wave that rocks from foot to foot, and glints sweep across.
function shell(out, t, g, c, d) {
  const [hi, lit, , deep] = ramp(c)
  const close = phase(t, SHELL_IN - 1, SHELL_IN + 3)
  const seams = phase(t, SHELL_IN + 2, SHELL_IN + 5)
  const flash = t === SHELL_OUT
  const wave = Math.PI * (0.5 - 0.5 * Math.cos((t - SHELL_IN - 2) * 0.3))
  const shine = (p) => seams * Math.max(0, 1 - Math.abs(plateAngle(p) - wave) / 0.8)
  const glint = (p) => SHELL_GLINTS.some(([from, to]) => t >= from && t < to && Math.abs(p.u + p.v * 0.6 - lerp(-d.rx - 6, d.rx + 6, phase(t, from, to))) < 1.2)
  const solid = bodyNow(out, g)
  out.shade = (x, y, col) => {
    const p = inShell(d, x, y)
    if (!p || p.depth < 2) return col
    if (flash) return mix(col, WHITE, 0.7)
    if (onSeam(p, d)) return mix(col, glint(p) ? WHITE : hi, 0.55 * seams)
    return mix(col, glint(p) ? WHITE : c, 0.12 + 0.3 * shine(p))
  }
  for (let y = Math.floor(d.y - d.ry); y < d.y; y++) {
    for (let x = Math.floor(d.x - d.rx); x <= Math.ceil(d.x + d.rx); x++) {
      const p = inShell(d, x, y)
      if (!p) continue
      if (p.depth < 2) {
        if (Math.min(p.angle, Math.PI - p.angle) > (close * Math.PI) / 2 + 0.05) continue
        const run = Math.abs(p.angle - wave) < 0.5
        dot(out, x, y, flash || glint(p) ? WHITE : p.depth < 1 ? c : run ? hi : lit)
      } else if (!solid(x, y) && seams > 0) {
        const s = shine(p)
        if (flash) back(out, x, y, hi)
        else if (onSeam(p, d)) back(out, x, y, glint(p) ? WHITE : seams < 1 ? deep : s > 0.3 ? hi : c)
        else if ((x + y) % 2 === 0 && s > 0.4) back(out, x, y, s > 0.75 ? lit : deep)
      }
    }
  }
}

// Shell fragments flung off the rim, falling and flickering out
function shards(out, age, a, g, c, d) {
  if (age < 4) {
    const grow = 1 + age * 0.12
    const ring = { ...d, rx: d.rx * grow, ry: d.ry * grow }
    for (let y = Math.floor(d.y - ring.ry); y < d.y; y++) {
      for (let x = Math.floor(d.x - ring.rx); x <= Math.ceil(d.x + ring.rx); x++) {
        const p = inShell(ring, x, y)
        if (p && p.depth < 1 && (age < 2 || (x + y) % 2)) dot(out, x, y, age < 2 ? WHITE : light(c, 0.4))
      }
    }
  }
  emit(age, { count: SHELL_SHARDS, gap: 0, life: 10 }, (i, life, f) => {
    const angle = (Math.PI * (i + 0.5)) / SHELL_SHARDS
    const speed = 0.8 + rnd(a.seed, i, 3) * 0.8
    const x = d.x + Math.cos(angle) * (d.rx + speed * life)
    const y = d.y - Math.sin(angle) * (d.ry + speed * life) + 0.12 * life * life
    if (y > g.ground || (f > 0.6 && life % 2)) return
    const col = f < 0.3 ? WHITE : f < 0.6 ? light(c, 0.4) : c
    dot(out, x, y, col)
    dot(out, x + 1, y, dark(col, 0.2))
    if (f < 0.5) dot(out, x, y + 1, dark(col, 0.35))
  })
}

const CURL_IN = 8
const CURL_OUT = 30
const CURL_BEAT = 7

// Tuck into a tight, shaded ball that rocks in place while a soft pink outline
// pulses rings outward, then unfurl with a bounce
function defensecurl(out, t, a, g, c) {
  const curl = keys(t, [[0, 0], [2, -0.1], [CURL_IN, 1], [CURL_OUT, 1], [CURL_OUT + 4, -0.14], [CURL_OUT + 8, 0]])
  const w = g.right - g.left + 1
  const h = g.bottom - g.top + 1
  // The ball keeps the body's area, so wide mons squeeze in and tall ones squash down
  const r = Math.sqrt(w * h) * 0.36
  out.sx = lerp(1, (2 * r) / w, curl)
  out.sy = lerp(1, (2 * r) / h, curl) * (t === CURL_IN ? 0.88 : 1)
  const hop = t - 3
  if (hop >= 0 && hop < 4) out.dy = -[1, 2, 2, 1][hop]
  if (t >= CURL_IN + 2 && t < CURL_OUT - 1) out.dx = Math.round(Math.sin((t - CURL_IN - 2) * 0.55) * 1.4)
  if (curl <= 0) return
  const bx = (g.left + g.right + 1) / 2 + out.dx
  const by = g.bottom + 1 - r + out.dy
  const clip = lerp(Math.max(w, h), r, curl)
  out.shade = (x, y, col) => {
    const ox = x + 0.5 - bx
    const oy = y + 0.5 - by
    const d = Math.hypot(ox, oy)
    if (d > clip) return null
    const k = mix(col, c, 0.22 * curl)
    if (Math.hypot(ox + r * 0.42, oy + r * 0.42) < r * 0.2 + 0.6) return mix(k, WHITE, 0.6 * curl)
    return (ox + oy) / r > 0.7 && d > r * 0.55 ? mix(k, dark(c, 0.65), 0.4 * curl) : k
  }
  if (curl < 0.6) return
  annulus(bx, by, 0, Math.min(clip, r) - 0.4, (x, y) => back(out, x, y, dark(g.body, 0.25)))
  const glow = Math.sin(t * 0.9) > 0
  annulus(bx, by, clip, clip + 1, (x, y) => dot(out, x, y, glow ? light(c, 0.6) : light(c, 0.3)))
  annulus(bx, by, clip + 1, clip + 2, (x, y) => ((x + y) % 2 ? null : dot(out, x, y, c)))
  emit(t, { count: 3, gap: CURL_BEAT, start: CURL_IN + 1, life: 7 }, (i, age, f) => {
    const rr = clip + 2.5 + age * 1.1
    const col = f < 0.3 ? light(c, 0.6) : f < 0.65 ? c : dark(c, 0.3)
    annulus(bx, by, rr - 1, rr, (x, y) => (f < 0.65 || (x + y) % 2 ? dot(out, x, y, col) : null))
  })
  sparkles(out, t, a.seed, bx, by, clip * 2 + 6, clip * 2 + 6, light(c, 0.3), 3)
}

const MINI = 0.36
const MINI_IN = 7
const MINI_OUT = 34
const MINI_HOPS = [0, 4, 7, 3, 0]
const MINI_HOP = 6
const MINI_HOPS_AT = 10
const SMOKE = 0x8890b0
const TWINKLE = 0x8898ff

// Shrink to a speck in a puff of smoke, hop about in tiny bounces, then pop back
// to full size in a ring of sparkles
function minimize(out, t, a, g, c) {
  const smoke = mix(c, SMOKE, 0.3)
  const twinkle = mix(c, TWINKLE, 0.55)
  out.sx = keys(t, [[0, 1], [3, 1.1], [MINI_IN, MINI], [MINI_OUT, MINI], [MINI_OUT + 3, 1.12], [MINI_OUT + 6, 0.95], [MINI_OUT + 9, 1]])
  out.sy = keys(t, [[0, 1], [3, 0.86], [MINI_IN, MINI], [MINI_OUT, MINI], [MINI_OUT + 3, 1.2], [MINI_OUT + 6, 0.94], [MINI_OUT + 9, 1]])
  const k = Math.floor((t - MINI_HOPS_AT) / MINI_HOP)
  if (t >= MINI_HOPS_AT && k < MINI_HOPS.length - 1) {
    const f = (t - MINI_HOPS_AT - k * MINI_HOP) / MINI_HOP
    out.dx = Math.round(g.side * lerp(MINI_HOPS[k], MINI_HOPS[k + 1], f))
    out.dy = -Math.round(Math.sin(f * Math.PI) * 4)
    if (f === 0) {
      out.sx *= 1.3
      out.sy *= 0.7
    }
    if (f === 0.5) spark(out, g.cx + out.dx, g.bottom + out.dy - (g.bottom - g.top) * MINI - 3, 1, twinkle)
  }
  const landed = t - MINI_HOPS_AT - MINI_HOP
  if (landed >= 0 && landed < MINI_HOP * (MINI_HOPS.length - 1) && landed % MINI_HOP < 3) {
    const step = Math.floor(landed / MINI_HOP) + 1
    const kick = (landed % MINI_HOP) + 1
    const x = g.cx + 0.5 + g.side * MINI_HOPS[step]
    for (const s of [-1, 1]) dot(out, x + s * (1 + kick), g.bottom - (kick > 1 ? 1 : 0), kick < 3 ? smoke : dark(smoke, 0.4))
  }
  emit(t, { count: 9, gap: 0.25, start: 4, life: 9 }, (i, age, f) => {
    const angle = (i / 9) * Math.PI * 2 + rnd(a.seed, i) * 0.6
    const spread = lerp(0.15, 0.5, easeOut(f))
    const x = g.cx + Math.cos(angle) * (g.right - g.left) * spread
    const y = g.cy + 2 + Math.sin(angle) * (g.bottom - g.top) * spread * 0.7 - age * 0.3
    puff(out, x, y, 3.2 * Math.sin(Math.PI * Math.min(1, f * 1.15 + 0.1)), smoke, a.seed + i)
  })
  const pop = t - MINI_OUT - 2
  if (pop === 0 || pop === 1) out.shade = (x, y, col) => mix(col, WHITE, 0.6)
  if (pop >= 0 && pop < 6) {
    const rr = 3 + pop * 2
    annulus(g.cx + 0.5, g.cy + 0.5, rr - 1.6, rr, (x, y, d) => {
      if (pop < 4 || (x + y) % 2) dot(out, x, y, d < rr - 0.8 && pop < 4 ? WHITE : twinkle)
    }, 0.8)
  }
  emit(t, { count: 6, gap: 0, start: MINI_OUT + 2, life: 7 }, (i, age, f) => {
    const angle = (i / 6) * Math.PI * 2 + 0.4
    const x = g.cx + Math.cos(angle) * (4 + age * 1.6)
    const y = g.cy + Math.sin(angle) * (3 + age * 1.2)
    spark(out, x, y, f < 0.5 ? 1 : 0, f < 0.5 ? twinkle : dark(twinkle, 0.3))
  })
}

const FOCUS_SET = 7
const FOCUS_FLASH = 34
const FOCUS_BEAT = 6
const FLAME_RED = 0xd02818
const FLAME_GOLD = 0xffee88

// Fire tones from a white-hot core through gold out to a smoky red tip
function flameTones(c) {
  const red = mix(c, FLAME_RED, 0.55)
  return [WHITE, mix(c, FLAME_GOLD, 0.6), c, red, dark(red, 0.4)]
}

// Crouch and strain while a flame-like aura flickers up around the body, flaring
// with each pulse of light, then release it all in a white flash
function focusenergy(out, t, a, g, c) {
  const crouch = keys(t, [[0, 0], [FOCUS_SET, 1], [FOCUS_FLASH, 1], [FOCUS_FLASH + 2, -0.5], [FOCUS_FLASH + 7, 0]])
  const beat = t >= FOCUS_SET + 3 && t < FOCUS_FLASH ? Math.max(0, 1 - ((t - FOCUS_SET - 3) % FOCUS_BEAT) / 3) : 0
  out.sy = 1 - 0.08 * crouch + 0.03 * beat
  out.sx = 1 + 0.05 * crouch
  if (t >= 2 && t < FOCUS_SET) out.dx = tremble(t)
  const flash = t >= FOCUS_FLASH && t < FOCUS_FLASH + 2
  const glow = flash ? 0.85 : 0.1 * crouch + 0.28 * beat
  if (glow > 0) out.shade = (x, y, col) => mix(col, flash ? WHITE : light(c, 0.55), glow)
  if (flash) out.shake = [t === FOCUS_FLASH ? 1 : -1, 0]
  const tones = flameTones(c)
  emit(t, { count: 10, gap: 0.5, start: 0, life: 6 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 8) * Math.PI * 2
    const r = lerp(13, 2, easeIn(f))
    dot(out, g.cx + Math.cos(angle) * r, g.cy + Math.sin(angle) * r * 0.7, f > 0.6 ? tones[1] : tones[2])
  })
  const power = phase(t, FOCUS_SET - 3, FOCUS_SET + 3) * (1 - phase(t, FOCUS_FLASH, FOCUS_FLASH + 5))
  if (power > 0) aura(out, t, a, g, tones, power + 0.35 * beat)
  if (t < FOCUS_FLASH) streaks(out, t, a, g, tones)
  if (t >= FOCUS_FLASH && t < FOCUS_FLASH + 6) shockwave(out, t - FOCUS_FLASH, g, tones)
  emit(t, { count: 8, gap: 0.4, start: FOCUS_FLASH + 1, life: 5 }, (i, life, f) => {
    const x = lerp(g.left, g.right, rnd(a.seed, i, 9)) + Math.sin(life * 0.6 + i) * 1.2
    const y = lerp(g.top, g.bottom, rnd(a.seed, i, 10)) - life * 1.3
    dot(out, x, y, f < 0.4 ? tones[1] : f < 0.7 ? tones[2] : tones[3])
  })
}

// Flames licking up off the body, behind it. A glow hugs every edge and tongues
// of fire of flickering height rise above it.
function aura(out, t, a, g, tones, power) {
  const solid = bodyNow(out, g)
  const box = boxNow(out, g)
  const dist = distanceField(solid, box, 4, g)
  for (let x = box.left - 3; x <= box.right + 3; x++) {
    const n = rnd(a.seed, x, t >> 1)
    const tongue = (1.5 + 4.5 * n) * power
    let since = FAR
    for (let y = box.bottom; y >= box.top - 8; y--) {
      const d = dist(x, y)
      since = d <= 1.5 ? 0 : since + 1
      if (d === 0 || y < 0) continue
      const heat = d <= 1.5 ? 0.85 + 0.15 * n : since <= tongue ? 0.8 * (1 - since / (tongue + 1)) : d <= 2.5 ? 0.25 : 0
      if (heat * power < 0.15) continue
      back(out, x, y, tones[heat > 0.8 ? 1 : heat > 0.55 ? 2 : heat > 0.3 ? 3 : 4])
    }
  }
}

// A ring of light bursting off the body in its own shape, fading as it spreads
function shockwave(out, age, g, tones) {
  const r = 2 + age * 2.2
  const pad = Math.ceil(r) + 1
  const dist = distanceField(bodyNow(out, g), boxNow(out, g), pad, g)
  for (let y = g.top - pad; y <= g.bottom + 1; y++) {
    for (let x = g.left - pad; x <= g.right + pad; x++) {
      const d = dist(x, y)
      if (d <= r - 1.6 || d > r || (age > 3 && (x + y) % 2)) continue
      dot(out, x, y, tones[age < 2 ? (d > r - 0.8 ? 1 : 0) : age < 4 ? 2 : 3])
    }
  }
}

// Sparks streaking up off the top edge of the body
function streaks(out, t, a, g, tones) {
  emit(t, { count: 40, gap: 0.7, start: FOCUS_SET, life: 7 }, (i, age) => {
    const x = Math.round(lerp(g.left, g.right, rnd(a.seed, i, 7)))
    let y0 = g.top
    while (y0 <= g.bottom && !g.solid(x, y0)) y0++
    if (y0 > g.bottom) return
    const y = y0 + out.dy - 1 - age * 1.4
    for (let k = 0; k < 3; k++) dot(out, x + out.dx, y + k, tones[k + 1])
  })
}

const RISE = [3, 12]
const SETTLE = [33, 42]
const AURA_EVERY = 7

// Float up into a calm hover while rings of aura pulse out from the body, with soft
// sparkles and a glowing pool of light below, then settle gently back down
function meditate(out, t, a, g, c) {
  const lift = keys(t, [[0, 0], [RISE[0], -0.6], [RISE[1], 2.6], [SETTLE[0], 2.6], [SETTLE[1], 0]])
  const hover = phase(t, RISE[1] - 2, RISE[1] + 2) * (1 - phase(t, SETTLE[0] - 2, SETTLE[0] + 1))
  out.dy = -Math.round(lift + Math.sin((t - RISE[1]) * 0.45) * 0.8 * hover)
  const calm = phase(t, RISE[0], RISE[1]) * (1 - phase(t, SETTLE[0], SETTLE[1]))
  const pulse = calm * (0.5 + 0.5 * Math.cos(((t - RISE[1]) * 2 * Math.PI) / AURA_EVERY))
  if (calm > 0) out.shade = (x, y, col) => mix(col, light(c, 0.5), 0.12 * calm + 0.12 * pulse)
  const [hi, lit, base, deep] = ramp(c)
  const cx = g.cx + 0.5
  const cy = g.cy + 0.5 + out.dy
  const r0 = (g.right - g.left) / 2 + 2
  emit(t, { count: 4, gap: AURA_EVERY, start: RISE[0] + 4, life: 11 }, (i, age, f) => {
    const r = lerp(r0, r0 + 10, easeOut(f))
    annulus(cx, cy, r - 1.6, r, (x, y, d) => {
      if (f > 0.55 && (x + y) % 2) return
      back(out, x, y, d < r - 0.8 ? (f < 0.4 ? lit : base) : f < 0.4 ? base : deep)
    }, 0.75)
  })
  const pool = calm * (g.right - g.left) * 0.32 + pulse
  if (pool > 1) {
    annulus(g.cx + 0.5, g.ground + 0.5, 0, pool, (x, y, d) => back(out, x, y, d < pool * 0.4 ? hi : d < pool * 0.75 ? lit : base), 0.25)
  }
  if (calm > 0.3) {
    const solid = bodyNow(out, g)
    const box = boxNow(out, g)
    const dist = distanceField(solid, box, 1, g)
    for (let y = box.top - 1; y <= box.bottom + 1; y++) {
      for (let x = box.left - 1; x <= box.right + 1; x++) {
        const d = dist(x, y)
        if (d > 0 && d <= 1) back(out, x, y, pulse > 0.6 ? lit : base)
      }
    }
  }
  emit(t, { count: 9, gap: 3, start: RISE[0] + 2, life: 12 }, (i, age, f) => {
    if (t >= SETTLE[0] + 4) return
    const x = lerp(g.left - 3, g.right + 3, rnd(a.seed, i, 18)) + Math.sin(age * 0.4 + i) * 0.8
    const y = g.bottom - rnd(a.seed, i, 19) * 4 - age * 0.9
    dot(out, x, y, f < 0.3 ? hi : f < 0.7 ? lit : base)
  })
  if (calm > 0.5) sparkles(out, t, a.seed, g.cx, cy, g.right - g.left + 10, g.bottom - g.top + 2, base, 3)
}

const QUESTION = ['.####.', '##..##', '....##', '...##.', '..##..', '..##..', '......', '..##..', '..##..']
const AMNESIA_POP = 5
const AMNESIA_GONE = 37

// The head leans toward the question mark, holds, leans the other way, holds, and settles
const AMNESIA_TILT = [[8, 0], [12, 1], [17, 1], [22, -1], [27, -1], [31, 0.4], [35, 0]]

// A chunky question mark, lit on its top left edges, with a drop shadow below right
function question(out, x, y, c) {
  const on = (i, j) => QUESTION[j]?.[i] === '#'
  for (let j = 0; j < QUESTION.length; j++) {
    for (let i = 0; i < QUESTION[j].length; i++) if (on(i, j) && !on(i + 1, j + 1)) dot(out, x + i + 1, y + j + 1, dark(c, 0.6))
  }
  for (let j = 0; j < QUESTION.length; j++) {
    for (let i = 0; i < QUESTION[j].length; i++) if (on(i, j)) dot(out, x + i, y + j, !on(i, j - 1) || !on(i - 1, j) ? light(c, 0.6) : c)
  }
}

// A color drained toward gray, keeping its brightness
function drain(col, f) {
  const luma = Math.round(0.3 * (col >> 16) + 0.59 * ((col >> 8) & 255) + 0.11 * (col & 255))
  return mix(col, luma * 0x10101, f)
}

// A spiral curling out from its middle, turned by `spin`, fading toward its tail
function swirl(out, x, y, spin, c) {
  let px = x
  let py = y
  for (let k = 1; k <= 12; k++) {
    const angle = spin + k * 0.55
    const nx = x + Math.cos(angle) * k * 0.3
    const ny = y + Math.sin(angle) * k * 0.26
    line(out, px, py, nx, ny, k < 5 ? light(c, 0.5) : k < 9 ? c : dark(c, 0.3))
    px = nx
    py = ny
  }
}

// Go blank: the color drains out of the mon, a question mark pops up beside its head,
// and it tilts its head one way then the other while swirls drift off it
function amnesia(out, t, a, g, c) {
  const blank = phase(t, AMNESIA_POP - 1, AMNESIA_POP + 3) * (1 - phase(t, AMNESIA_GONE, AMNESIA_GONE + 5))
  const tilt = keys(t, AMNESIA_TILT)
  const neck = g.top + (g.bottom - g.top) * 0.45
  // Each row leans further the higher it is, and the head above the neck leans most
  const lean = (y) => g.side * tilt * (0.06 * (g.bottom + 1 - y) + 0.2 * Math.max(0, neck - y))
  if (tilt !== 0) out.skew = lean
  if (blank > 0) out.shade = (x, y, col) => drain(col, 0.65 * blank + (t === AMNESIA_POP ? 0.35 : 0))
  const head = headOf(g)
  const ride = Math.round(lean(g.top + 2))
  const qx = (g.side > 0 ? head.right + 2 : head.left - 8) + ride
  const qy = Math.max(0, g.top - 3)
  const age = t - AMNESIA_POP
  if (age >= 0 && t < AMNESIA_GONE) {
    const bounce = [3, 2, -1, 0][age] ?? 0
    const wobble = age > 6 && Math.floor(age / 5) % 2 ? 1 : 0
    if (age === 0) spark(out, qx + 3, qy + 6, 1, c)
    else question(out, qx + wobble, qy + bounce, c)
  }
  const gone = t - AMNESIA_GONE
  if (gone >= 0 && gone < 5) spark(out, qx + 3, qy + 4, gone < 2 ? 2 : 4 - gone, c)
  const away = -g.side
  emit(t, { count: 4, gap: 7, start: AMNESIA_POP + 3, life: 12 }, (i, life, f) => {
    const x = head.x + ride + away * (i % 2 ? 2 : -1) + away * life * 0.55
    const y = g.top + 2 - life * 0.35 + Math.sin(life * 0.5) * 0.8
    if (f < 0.85 || life % 2) swirl(out, x, y, -life * 0.6 * away, f < 0.6 ? c : dark(c, 0.25))
  })
}

const HEX = 3.5
const WALL_BUILD = 3
const WALL_RING = 2.5
const WALL_FADE = [33, 42]
const WALL_GLINTS = [[16, 24], [25, 33]]

// The hex cell holding (px, py) on a flat topped honeycomb of radius s. It has axial
// coordinates q and r, a center x and y, and n, the spot's hex distance from it (1 on the rim).
function hexCell(px, py, s) {
  const q = ((2 / 3) * px) / s
  const r = (-px / 3 + (ROOT3 / 3) * py) / s
  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(-q - r)
  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs + q + r)
  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr >= ds) rr = -rq - rs
  const x = s * 1.5 * rq
  const y = s * ROOT3 * (rr + rq / 2)
  const ox = Math.abs(px - x)
  const oy = Math.abs(py - y)
  return { q: rq, r: rr, x, y, n: Math.max(oy / ((s * ROOT3) / 2), (ox + oy / ROOT3) / s) }
}

// Raise a framed wall of glowing hexagonal cells in front, ring by ring from the
// middle cell out, sweep glints across it, then let the cells wink out one by one
function barrier(out, t, a, g, c) {
  const wall = frontWall(g, 12, 2)
  const top = Math.max(0, g.top - 1)
  const cy = (top + g.ground + 1) / 2
  const [hi, lit, base] = ramp(c)
  const push = phase(t, 1, 4) * (1 - phase(t, WALL_FADE[0], WALL_FADE[1]))
  out.dx = Math.round(g.side * push)
  out.sx = 1 - 0.04 * push
  const winks = []
  for (let y = top; y <= g.ground; y++) {
    for (let x = wall.x0; x <= wall.x1; x++) {
      // Swapping x and y stands the cells on their points
      const cell = hexCell(y + 0.5 - cy, x - wall.cx, HEX)
      const ring = (Math.abs(cell.q) + Math.abs(cell.r) + Math.abs(cell.q + cell.r)) / 2
      const age = t - WALL_BUILD - ring * WALL_RING
      const dies = Math.round(lerp(WALL_FADE[0], WALL_FADE[1] - 3, rnd(a.seed, cell.q * 31 + cell.r, 11)))
      if (t === dies + 2 && cell.n < 0.3) winks.push(x, y)
      if (age < 0 || t >= dies + 2 || (t >= dies && t % 2)) continue
      const frame = x === wall.x0 || x === wall.x1 || y === top || y === g.ground
      const glint = WALL_GLINTS.some(([from, to]) => t >= from && t < to && Math.abs(x - wall.cx + (y - cy) * 0.7 - lerp(-16, 16, phase(t, from, to))) < 1.2)
      const glow = Math.sin(t * 0.5 + rnd(a.seed, cell.q * 31 + cell.r, 12) * 6) > 0.3
      let col
      if (age < 1) col = WHITE
      else if (age < 2) col = hi
      else if (frame) col = glint ? WHITE : y === top ? hi : base
      else if (cell.n > 0.8) col = glint ? WHITE : lit
      else col = glint ? lit : dark(c, glow ? 0.42 : 0.6)
      dot(out, x, y, col)
    }
  }
  for (let k = 0; k < winks.length; k += 2) spark(out, winks[k], winks[k + 1], 1, lit)
}

const PANE_OPEN = [3, 8]
const PANE_CLOSE = [36, 41]
const PANE_SWEEPS = [[11, 19], [22, 30]]
const PANE_TILT = 3

// Swing a glass pane open in front like a door, its thick rim glinting through the
// rainbow and the mon's mirror image inside, with reflections sliding across it
function reflect(out, t, a, g, c) {
  const open = easeOut(phase(t, ...PANE_OPEN)) * (1 - easeIn(phase(t, ...PANE_CLOSE)))
  if (open <= 0) return
  const wall = frontWall(g, 12, 2)
  const width = Math.max(1, Math.round(wall.w * open))
  const top = Math.max(0, g.top - 1)
  const bottom = g.ground - 1
  const flash = t === PANE_OPEN[1]
  const sweep = PANE_SWEEPS.find(([from, to]) => t >= from && t < to)
  const tiltAt = (k) => Math.round((PANE_TILT * k) / Math.max(1, wall.w - 1))
  // The mirror stands at the pane's hinge, so the reflection stands as far behind the
  // glass as the mon stands in front of it
  const hinge = wall.near + (g.side > 0 ? 0 : 1)
  const inside = (x, y) => {
    const k = (x - wall.near) * g.side
    return k > 1 && k < width - 2 && y > top + tiltAt(k) && y < bottom - tiltAt(k)
  }
  const glass = light(c, 0.25)
  if (!flash) {
    out.ghosts = [{
      dx: 2 * hinge - 1 - g.left - g.right,
      dy: 0,
      flip: true,
      shade: (col, x, y) => (inside(x, y) ? mix(col, glass, 0.3) : null),
    }]
  }
  for (let k = 0; k < width; k++) {
    const x = wall.near + g.side * k
    const y0 = top + tiltAt(k)
    const y1 = bottom - tiltAt(k)
    for (let y = y0; y <= y1; y++) {
      const edge = k === 0 || k === width - 1 || y === y0 || y === y1
      const bevel = k === 1 || k === width - 2
      const s = sweep ? k - (y1 - y) * 0.5 - lerp(-8, wall.w + 2, phase(t, ...sweep)) : FAR
      const sheen = k + (y - y0) * 0.6
      const image = g.solid(2 * hinge - 1 - x, y)
      let col
      if (flash) col = WHITE
      else if (edge || bevel) col = hsl((k * 0.05 + (y - top) * 0.03 + t * 0.04) % 1, 0.9, edge ? 0.62 : 0.8)
      else if (Math.abs(s) < 0.8) col = WHITE
      else if (Math.abs(s + 3) < 0.6) col = light(c, 0.6)
      else if (y - y0 < (y1 - y0) * 0.45 && (Math.abs(sheen - 4) < 0.5 || Math.abs(sheen - 6.5) < 0.5)) col = light(c, 0.5)
      else if (image) col = undefined
      else if (rnd(a.seed, k * 64 + y, t >> 2) < 0.04) col = light(c, 0.7)
      else if ((k + y) % 5 === 0) col = dark(c, 0.5)
      if (col !== undefined) dot(out, x, y, col)
    }
  }
  if (open < 1 || flash) return
  const lap = (t * 1.3) % (2 * width)
  const k = Math.round(lap < width ? lap : 2 * width - lap)
  spark(out, wall.near + g.side * k, top + tiltAt(k), 1, WHITE)
  spark(out, wall.near + g.side * (width - 1 - k), bottom - tiltAt(width - 1 - k), 1, WHITE)
}

const SCREEN_RISE = [2, 11]
const SCREEN_SINK = [35, 42]

// A see-through screen of warm light bars rises from the ground in front, scanlines
// rolling up through it and its glow warming the mon's face, then it sinks away
function lightscreen(out, t, a, g, c) {
  const wall = frontWall(g, 9, 2)
  const rise = easeOut(phase(t, ...SCREEN_RISE)) - easeIn(phase(t, ...SCREEN_SINK))
  if (rise <= 0) return
  const top = Math.max(0, g.top - 2)
  const edge = Math.round(g.ground + 1 - (g.ground + 1 - top) * rise)
  const moving = t < SCREEN_RISE[1] || t >= SCREEN_SINK[0]
  const [hi, lit, base, deep] = ramp(c)
  const span = g.ground - top + 6
  const scans = [g.ground - ((t * 1.3) % span), g.ground - ((t * 1.3 + span / 2) % span)]
  for (let y = edge; y <= g.ground; y++) {
    // Every other row is a bar of light with bright ends, so the strip behind shows through
    const fade = (g.ground - y) / Math.max(1, g.ground - top)
    const stripe = (g.ground - y) % 2 === 0
    const scan = scans.some((s) => Math.abs(y - s) < 0.6)
    for (let x = wall.x0 - 1; x <= wall.x1 + 1; x++) {
      const end = x === wall.x0 || x === wall.x1
      let col = null
      if (x < wall.x0 || x > wall.x1) col = stripe && y > edge && fade < 0.8 ? deep : null
      else if (y === edge) col = moving ? WHITE : hi
      else if (y === edge + 1 && moving) col = hi
      else if (scan) col = end || (x + t) % 3 === 0 ? WHITE : hi
      else if (stripe) col = end ? hi : fade < 0.3 ? lit : base
      if (col !== null) dot(out, x, y, col)
    }
  }
  emit(t, { count: 10, gap: 2.5, start: SCREEN_RISE[1], life: 8 }, (i, age) => {
    const y = g.ground - 1 - age * 2
    if (y > edge + 1 && t < SCREEN_SINK[0]) dot(out, lerp(wall.x0 + 1, wall.x1 - 1, rnd(a.seed, i, 15)), y, WHITE)
  })
  const front = g.side > 0 ? g.right : g.left
  out.shade = (x, y, col) => {
    const near = 6 - (front - x) * g.side
    return near > 0 && y >= edge ? mix(col, lit, (near / 6) * 0.5 * rise) : col
  }
  for (let x = wall.x0 - 4; x <= wall.x1 + 4; x++) {
    const off = x < wall.x0 ? wall.x0 - x : x - wall.x1
    if (off > 1) back(out, x, g.ground, off === 2 ? base : off === 3 ? deep : dark(c, 0.6))
  }
}

const MELT = [5, 16]
const REFORM = [33, 43]

// Goo running down the melting body from its top edge, gathering speed
function drips(out, t, a, g, solid, box, tones) {
  emit(t, { count: 7, gap: 1.4, start: MELT[0] + 1, life: 9 }, (i, age) => {
    const x = Math.round(lerp(box.left, box.right, rnd(a.seed, i, 12)))
    let y = box.top
    while (y <= box.bottom && !solid(x, y)) y++
    y += 0.3 * age + 0.1 * age * age
    if (y >= g.bottom) return
    dot(out, x, y - 2, tones[3])
    dot(out, x, y - 1, tones[2])
    dot(out, x, y, tones[1])
  })
}

// Bubbles swelling on the puddle until they pop into a ring of droplets
function bubbles(out, t, a, cx, rx, top, tones) {
  emit(t, { count: 4, gap: 4, start: MELT[1] + 1, life: 8 }, (i, age, f) => {
    const x = cx + (rnd(a.seed, i, 14) - 0.5) * rx * 1.3
    if (f < 0.75) {
      const r = lerp(0.7, 2.1, f / 0.75)
      const y = top + 1 - r
      annulus(x, y, r - 0.9, r, (px, py) => dot(out, px, py, tones[1]))
      dot(out, x - r * 0.45, y - r * 0.45, WHITE)
    } else {
      for (const [ox, oy] of [[-2, 0], [2, 0], [-1, -2], [1, -2], [-3, 1], [3, 1]]) dot(out, x + ox, top - 1 + oy, tones[1])
    }
  })
}

// Shiver, then melt into a glossy purple puddle, goo running down the body and
// splashing out, the puddle bubbling and wobbling until it pulls itself back up
function acidarmor(out, t, a, g, c) {
  const melt = keys(t, [[0, 0], [MELT[0], 0], [MELT[1], 1], [REFORM[0], 1], [REFORM[0] + 6, -0.1], [REFORM[1], 0]])
  const goo = clamp(melt, 0, 1)
  const wobble = Math.sin(t * 0.8) * phase(t, MELT[1] - 2, MELT[1] + 2) * (1 - phase(t, REFORM[0] - 2, REFORM[0] + 1))
  out.sy = 1 - 0.78 * melt + 0.035 * wobble
  out.sx = 1 + 0.38 * melt - 0.05 * wobble
  if (t >= 1 && t < MELT[0] + 2) out.dx = tremble(t)
  const tones = ramp(c)
  const tinted = 0.2 * phase(t, 0, MELT[0]) * (1 - phase(t, REFORM[0], REFORM[1])) + 0.62 * goo
  const box = boxNow(out, g)
  const gloss = t >= REFORM[0] + 2 && t < REFORM[1] ? lerp(box.bottom, box.top - 2, phase(t, REFORM[0] + 2, REFORM[1])) : FAR
  if (tinted > 0) {
    out.shade = (x, y, col) => {
      if (Math.abs(y - gloss) < 1) return mix(col, tones[0], 0.6)
      const k = mix(col, c, tinted)
      return y <= box.top && goo > 0.5 ? mix(k, tones[0], 0.5) : k
    }
  }
  const cx = (g.left + g.right + 1) / 2
  const rx = ((g.right - g.left + 1) * out.sx) / 2 + 2.5 * goo
  if (goo > 0.2) {
    annulus(cx, g.bottom + 0.5, 0, rx, (x, y, d) => {
      if (y <= g.bottom) back(out, x, y, y < g.bottom - 1 ? tones[1] : d > rx - 1.2 ? tones[3] : tones[2])
    }, (1 + 1.5 * goo) / rx)
  }
  const solid = bodyNow(out, g)
  drips(out, t, a, g, solid, box, tones)
  if (goo >= 1 && t < REFORM[0]) {
    const gx = Math.round(cx + Math.sin(t * 0.25) * rx * 0.55)
    let gy = box.top
    while (gy < g.bottom && !solid(gx, gy)) gy++
    dot(out, gx, gy, WHITE)
    dot(out, gx + 1, gy, tones[0])
    dot(out, gx - 1, gy, tones[1])
  }
  emit(t, { count: 8, gap: 0, start: MELT[1] - 1, life: 8 }, (i, age, f) => {
    const dir = i % 2 ? 1 : -1
    const x = cx + dir * (rx * 0.6 + (0.5 + rnd(a.seed, i, 16) * 0.7) * age)
    const y = g.bottom - 1 - (1 + rnd(a.seed, i, 17) * 0.8) * age + 0.25 * age * age
    if (y <= g.bottom) dot(out, x, y, f < 0.5 ? tones[1] : tones[2])
  })
  bubbles(out, t, a, cx, rx, box.top, tones)
  emit(t, { count: 6, gap: 0.5, start: REFORM[0], life: 6 }, (i, age, f) => {
    const from = i % 2 ? -1 : 1
    const x = lerp(cx + from * (rx + 1), cx, easeIn(f))
    const y = lerp(g.bottom - 1, g.cy, easeIn(f)) - Math.sin(f * Math.PI) * 4
    dot(out, x, y, f < 0.5 ? tones[2] : tones[1])
    dot(out, x, y + 1, tones[3])
  })
}

export const GUARD = {
  harden: { ticks: 40, color: 0xa8c0e0, pose: { view: 'front' }, draw: harden },
  withdraw: { ticks: 40, color: 0x7fe0ff, pose: { view: 'front' }, draw: withdraw },
  defensecurl: { ticks: 40, color: 0xffb3e6, pose: { view: 'front' }, draw: defensecurl },
  minimize: { ticks: 44, color: 0xffffff, pose: { view: 'front' }, draw: minimize },
  focusenergy: { ticks: 44, color: 0xffb04a, pose: { view: 'front' }, draw: focusenergy },
  meditate: { ticks: 44, color: 0xffb0f0, pose: { view: 'front' }, draw: meditate },
  amnesia: { ticks: 44, color: 0x9fd8ff, pose: { view: 'front' }, draw: amnesia },
  barrier: { ticks: 44, color: 0x7fe0ff, draw: barrier },
  reflect: { ticks: 44, color: 0x9fe8ff, draw: reflect },
  lightscreen: { ticks: 44, color: 0xffe866, draw: lightscreen },
  acidarmor: { ticks: 48, color: 0x9a6ac8, pose: { view: 'front' }, draw: acidarmor },
}
