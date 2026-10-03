// Drawing helpers shared by every effect.
//
// Coordinates are strip pixels: x is a column, y a half row from the top. An effect
// paints into `out`, the description of one frame:
//   dots      [x, y, color, ...] painted over the sprite
//   under     [x, y, color, ...] painted behind the sprite
//   chars     [column, row, codePoint, color, ...] glyphs, one per cell
//   hidden    the sprite isn't drawn
//   dx, dy    sprite offset in pixels, dy < 0 is up
//   sx, sy    sprite scale around the middle of its feet
//   flipX     the sprite turns its back to the attack side
//   flipY     the sprite is upside down
//   skew      (y) => pixels, slides each row of the sprite sideways, to lean or wobble it
//   shade     (x, y, color) => color or null, recolors each sprite pixel; null hides it
//   ghosts    [{ dx, dy, shade, flip }] copies of the sprite dx, dy from its base spot,
//             drawn behind it and recolored by shade(color, x, y), which can return
//             null to hide a pixel. flip mirrors one within the sprite's box. Ghosts
//             copy the plain sprite: the effect's scale, skew, and flips don't apply.
//   shake     [x, y] moves the whole strip

export const WHITE = 0xffffff
export const BLACK = 0x000000

export function mix(a, b, f) {
  const ch = (shift) => Math.round(((a >> shift) & 255) * (1 - f) + ((b >> shift) & 255) * f)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

export const light = (c, f = 0.5) => mix(c, WHITE, f)
export const dark = (c, f = 0.35) => mix(c, BLACK, f)
export const luma = (c) => 0.3 * (c >> 16) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255)

// Four shades of a color, brightest first: highlight, light, the color, shadow
export const ramp = (c) => [light(c, 0.7), light(c, 0.35), c, dark(c, 0.4)]

// A color from hue in turns (0 to 1), saturation and lightness (0 to 1)
export function hsl(h, s, l) {
  const k = (n) => (n + h * 12) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
  return (f(0) << 16) | (f(8) << 8) | f(4)
}

// A stable random number in [0, 1) for particle i of an attack
export function rnd(seed, i, salt = 0) {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const lerp = (a, b, f) => a + (b - a) * f
export const linear = (f) => f
export const easeIn = (f) => f * f
export const easeOut = (f) => 1 - (1 - f) * (1 - f)
export const easeInOut = (f) => (f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f))

// How far t is through [from, to), from 0 to 1
export const phase = (t, from, to) => clamp((t - from) / (to - from), 0, 1)

// A value along keyframes [[tick, value, ease], ...], each key eased into by its own
// ease or by the default
export function keys(t, frames, ease = easeInOut) {
  if (t <= frames[0][0]) return frames[0][1]
  for (let k = 1; k < frames.length; k++) {
    const [to, v, own = ease] = frames[k]
    if (t < to) {
      const [from, u] = frames[k - 1]
      return lerp(u, v, own((t - from) / (to - from)))
    }
  }
  return frames[frames.length - 1][1]
}

// Particles born `gap` ticks apart from `start`, each living `life` ticks (a number,
// or a function of the particle). Calls fn(i, age, f) for each live one, f its age from 0 to 1.
export function emit(t, { count, gap = 1, start = 0, life }, fn) {
  for (let i = 0; i < count; i++) {
    const age = t - start - i * gap
    const span = typeof life === 'function' ? life(i) : life
    if (age >= 0 && age < span) fn(i, age, age / span)
  }
}

export function dot(out, x, y, c) {
  out.dots.push(Math.round(x), Math.round(y), c)
}

export function back(out, x, y, c) {
  out.under.push(Math.round(x), Math.round(y), c)
}

export function line(out, x0, y0, x1, y1, c, paint = dot) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let k = 0; k <= steps; k++) paint(out, x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps, c)
}

export function plus(out, x, y, c, center = c, paint = dot) {
  paint(out, x, y, center)
  paint(out, x - 1, y, c)
  paint(out, x + 1, y, c)
  paint(out, x, y - 1, c)
  paint(out, x, y + 1, c)
}

// A circle outline, or only the arc within `spread` radians of `angle`
export function ring(out, x, y, r, c, angle = 0, spread = Math.PI, paint = dot) {
  const steps = Math.max(4, Math.ceil(r * spread * 2.4))
  for (let k = 0; k < steps; k++) {
    const a = angle - spread + (2 * spread * k) / steps
    paint(out, x + r * Math.cos(a), y + r * Math.sin(a), c)
  }
}

export function disc(out, x, y, r, c, paint = dot) {
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      if ((px - x) ** 2 + (py - y) ** 2 <= r * r + 0.5) paint(out, px, py, c)
    }
  }
}

// A lit sphere: highlight up and to the left, shadow down and to the right
export function ball(out, x, y, r, c, paint = dot) {
  const [hi, lit, base, shadow] = ramp(c)
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const d2 = (px - x) ** 2 + (py - y) ** 2
      if (d2 > r * r + 0.5) continue
      const lean = (px - x + (py - y)) / Math.max(1, r)
      const tone = d2 <= 0.6 && r >= 1.5 ? hi : lean < -0.7 ? hi : lean < -0.1 ? lit : lean < 0.8 ? base : shadow
      paint(out, px, py, r < 1 ? lit : tone)
    }
  }
}

// Eight rays out of a white center, the diagonals shorter
export function burst(out, x, y, r, c, paint = dot) {
  paint(out, x, y, WHITE)
  for (let k = 0; k < 8; k++) {
    const angle = (k * Math.PI) / 4
    const len = k % 2 ? r * 0.65 : r
    for (let d = 1; d <= len; d++) paint(out, x + Math.cos(angle) * d, y + Math.sin(angle) * d, d < 2 ? light(c, 0.6) : c)
  }
}

// A four point twinkle: white heart, arms of `size` pixels fading into c
export function spark(out, x, y, size, c, paint = dot) {
  paint(out, x, y, WHITE)
  for (let d = 1; d <= size; d++) {
    const col = d === 1 ? light(c, 0.5) : c
    paint(out, x + d, y, col)
    paint(out, x - d, y, col)
    paint(out, x, y + d, col)
    paint(out, x, y - d, col)
  }
}

// Pixel art: rows of letters, each a key of `palette`, '.' or a missing key see-through.
// flip mirrors it left to right, for art drawn facing right.
export function stamp(out, x, y, art, palette, flip = false, paint = dot) {
  const w = art[0].length
  for (let ry = 0; ry < art.length; ry++) {
    for (let rx = 0; rx < w; rx++) {
      const c = palette[art[ry][flip ? w - 1 - rx : rx]]
      if (c !== undefined) paint(out, Math.round(x) + rx, Math.round(y) + ry, c)
    }
  }
}

// Sparkles that twinkle around a spot, moving every few ticks
export function sparkles(out, t, seed, cx, cy, spanX, spanY, c, count = 6, paint = dot) {
  for (let i = 0; i < count; i++) {
    if ((t + i) % 3 === 0) continue
    const x = cx + (rnd(seed, i, t >> 2) - 0.5) * spanX
    const y = cy + (rnd(seed, i, (t >> 2) + 50) - 0.5) * spanY
    if ((t + i) % 3 === 1) plus(out, x, y, c, WHITE, paint)
    else paint(out, x, y, WHITE)
  }
}

// A soft round cloud: a light core and a darker, ragged rim
export function puff(out, x, y, r, c, seed = 0, paint = dot) {
  const [hi, lit, base, shadow] = ramp(c)
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const d = Math.hypot(px - x, py - y) / Math.max(0.5, r)
      if (d > 1.05 || (d > 0.75 && rnd(seed, px * 31 + py) < 0.35)) continue
      const up = py - y < -r * 0.3
      paint(out, px, py, d < 0.35 ? (up ? hi : lit) : d < 0.75 ? (up ? lit : base) : shadow)
    }
  }
}

// Recolor the sprite: blend every pixel toward a color
export const tint = (color, f) => (x, y, c) => mix(c, color, f)

// Like tint, but the dark outline stays crisp
export const glow = (color, f) => (x, y, c) => (luma(c) < 70 ? c : mix(c, color, f))

// A skew that slides the top row px pixels and keeps the feet planted
export const lean = (g, px) => (y) => (px * (g.bottom - y)) / Math.max(1, g.bottom - g.top)

// How far the renderer slides row y for the frame's skew
export const skewAt = (out, y) => (out.skew ? Math.round(out.skew(y)) : 0)

// Where the sprite pixel at x, y of its base spot shows once the frame's offset,
// scale, and skew apply. baseAt is the reverse: the base pixel a strip pixel shows.
export function shownAt(g, out, x, y) {
  const ax = (g.left + g.right + 1) / 2
  const ay = g.bottom + 1
  const sy = Math.round(ay + (y + 0.5 - ay) * out.sy - 0.5) + out.dy
  return { x: Math.round(ax + (x + 0.5 - ax) * out.sx - 0.5) + out.dx + skewAt(out, sy), y: sy }
}

export function baseAt(g, out) {
  const ax = (g.left + g.right + 1) / 2
  const ay = g.bottom + 1
  return (x, y) => [
    Math.floor(ax + (x - out.dx - skewAt(out, y) + 0.5 - ax) / out.sx),
    Math.floor(ay + (y - out.dy + 0.5 - ay) / out.sy),
  ]
}

// A shade that tints the body toward color by f, and its rim, where it meets the air,
// toward rim by rimF. It follows the frame's offset, scale, and skew.
export function rimGlow(g, out, color, f, rim, rimF) {
  const at = baseAt(g, out)
  return (x, y, col) => {
    const [bx, by] = at(x, y)
    const edge = !g.solid(bx - 1, by) || !g.solid(bx + 1, by) || !g.solid(bx, by - 1) || !g.solid(bx, by + 1)
    return edge ? mix(col, rim, rimF) : mix(col, color, f)
  }
}

// An afterimage: the sprite shifted by dx, dy and blended toward a color
export const ghost = (dx, dy, color, f = 0.6) => ({ dx, dy, shade: (c) => mix(c, color, f) })

// Back and forth by one pixel every other tick, for trembling and strain
export const tremble = (t, every = 1) => (Math.floor(t / every) % 2 ? 1 : -1)
