// Attack animations for /pokemon attack. Each effect is a pure function of the
// attack, its age in ticks, and where the mon stands. It returns pixels to paint
// over the strip, one-cell characters, and changes to the sprite itself.
//
// Coordinates are strip pixels: x is a column, y a half row from the top.
// `side` is 1 when the mon faces right and -1 when it faces left.

const WHITE = 0xffffff
const BLACK = 0x000000
const NOTE_CODES = [0x266a, 0x266b]
const NOTE_COLORS = [0xffffff, 0x9fd8ff, 0xffb3e6]

const EFFECTS = {
  beam: { ticks: 40, color: 0xffe9a6, draw: beam },
  flame: { ticks: 40, color: 0xff7a1a, draw: flame },
  spray: { ticks: 40, color: 0x3f8fff, draw: spray },
  bubbles: { ticks: 50, color: 0x8fd8ff, draw: bubbles },
  bolt: { ticks: 40, color: 0xffe23f, draw: bolt },
  leaves: { ticks: 40, color: 0x5cc05c, draw: leaves },
  vines: { ticks: 40, color: 0x3fa34d, draw: vines },
  powder: { ticks: 50, color: 0xe8d26a, draw: powder },
  rings: { ticks: 40, color: 0xff6fd8, draw: rings },
  teleport: { ticks: 36, color: 0xff9cf0, draw: teleport },
  slash: { ticks: 30, color: 0xb8c8e8, draw: slash },
  tackle: { ticks: 26, color: 0xffe36e, draw: tackle },
  impact: { ticks: 24, color: 0xffe36e, draw: impact },
  quake: { ticks: 40, color: 0x8b5a2b, draw: quake },
  rocks: { ticks: 44, color: 0x8a8a8a, draw: rocks },
  sludge: { ticks: 40, color: 0xa040c0, draw: sludge },
  wind: { ticks: 40, color: 0xdff3ff, draw: wind },
  string: { ticks: 36, color: 0xf8f8f8, draw: string },
  shadow: { ticks: 40, color: 0x6a3a9a, draw: shadow },
  notes: { ticks: 50, color: null, draw: notes },
  splash: { ticks: 40, color: 0x6fb8ff, draw: splash },
  transform: { ticks: 80, color: WHITE, draw: transform },
  explode: { ticks: 50, color: 0xff8a2a, draw: explode },
  shield: { ticks: 50, color: 0x7fe0ff, draw: shield },
  sleep: { ticks: 80, color: null, draw: () => {} },
  drain: { ticks: 45, color: 0x7cff7c, draw: drain },
  stars: { ticks: 36, color: 0xffe36e, draw: stars },
  ice: { ticks: 40, color: 0xaee8ff, draw: ice },
  dragon: { ticks: 44, color: 0x7a4dff, draw: dragon },
  heal: { ticks: 44, color: 0x9cffb0, draw: heal },
}

const TRANSFORM_FLICKER = 6
const SLEEP_WAKE = 6

export const effectOf = (id) => (EFFECTS[id] ? id : 'impact')
export const attackTicks = (effect) => EFFECTS[effectOf(effect)].ticks

// What the sprite does this tick, needed before it is drawn: swapped for another mon, or asleep
export function attackPose(attack, t) {
  const swap = attack.effect === 'transform' && t >= TRANSFORM_FLICKER && t < attack.ticks - TRANSFORM_FLICKER
  const asleep = attack.effect === 'sleep' && t < attack.ticks - SLEEP_WAKE
  return { swap, asleep }
}

// The attack's drawing this tick. dots is a flat [x, y, color, ...] list, chars a flat
// [column, row, codePoint, color, ...] list. dx and lift move the sprite, jitter the whole strip.
export function attackFrame(attack, t, g) {
  const out = { dots: [], chars: [], hidden: false, dx: 0, lift: 0, jitter: 0 }
  const effect = EFFECTS[attack.effect]
  const color = attack.color ?? effect.color
  const front = g.side > 0 ? g.right + 1 : g.left - 1
  const geo = {
    ...g,
    front,
    mouth: g.top + Math.round((g.bottom - g.top) * 0.35),
    ground: g.pixels - 1,
    cx: Math.round((g.left + g.right) / 2),
    cy: Math.round((g.top + g.bottom) / 2),
    reach: g.side > 0 ? g.columns - 1 - front : front,
    ahead: (d) => front + g.side * d,
  }
  if (attack.from === 'top') geo.crown = crownOf(geo)
  effect.draw(out, t, attack, geo, color)
  return out
}

// The middle of the sprite's topmost row of pixels, like the tip of a bulb
function crownOf(g) {
  let left = g.right
  let right = g.left
  for (let x = g.left; x <= g.right; x++) {
    if (!g.solid(x, g.top)) continue
    left = Math.min(left, x)
    right = Math.max(right, x)
  }
  return { x: Math.round((left + right) / 2), y: g.top }
}

function dot(out, x, y, c) {
  out.dots.push(Math.round(x), Math.round(y), c)
}

function mix(a, b, f) {
  const ch = (shift) => Math.round(((a >> shift) & 255) * (1 - f) + ((b >> shift) & 255) * f)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

const light = (c, f = 0.5) => mix(c, WHITE, f)
const dark = (c, f = 0.35) => mix(c, BLACK, f)

// A stable random number in [0, 1) for particle i of an attack
function rnd(seed, i, salt = 0) {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

function line(out, x0, y0, x1, y1, c) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let k = 0; k <= steps; k++) dot(out, x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps, c)
}

function plus(out, x, y, c, center = c) {
  dot(out, x, y, center)
  dot(out, x - 1, y, c)
  dot(out, x + 1, y, c)
  dot(out, x, y - 1, c)
  dot(out, x, y + 1, c)
}

// A circle outline, or only the arc within `spread` radians of `angle`
function ring(out, x, y, r, c, angle = 0, spread = Math.PI) {
  const steps = Math.max(8, Math.ceil(r * 7))
  for (let k = 0; k < steps; k++) {
    const a = angle - spread + (2 * spread * k) / steps
    dot(out, x + r * Math.cos(a), y + r * Math.sin(a), c)
  }
}

const facingAngle = (g) => (g.side > 0 ? 0 : Math.PI)

function beam(out, t, a, g, c) {
  if (t < 4) return plus(out, g.front, g.mouth, c, light(c, 0.7))
  const len = Math.min((t - 3) * 3, g.reach)
  const edge = t % 4 < 2 ? c : light(c, 0.4)
  const fading = t > a.ticks - 6
  for (let d = 0; d <= len; d++) {
    if (fading && (d + t) % 2) continue
    dot(out, g.ahead(d), g.mouth, light(c, 0.75))
    dot(out, g.ahead(d), g.mouth - 1, edge)
    dot(out, g.ahead(d), g.mouth + 1, edge)
  }
  if (len === g.reach && !fading) plus(out, g.ahead(len), g.mouth, edge, WHITE)
}

// A stream of particles from the mouth that age from a light core to a dark tail
function flame(out, t, a, g, c) {
  const core = mix(c, 0xffff99, 0.6)
  for (let i = 0; i < a.ticks - 12; i++) {
    const age = t - i
    const life = 10 + Math.floor(rnd(a.seed, i) * 5)
    if (age < 0 || age >= life) continue
    const x = g.ahead(age * 1.5)
    const y = g.mouth + (rnd(a.seed, i, 1) - 0.5) * age * 0.8 - Math.floor(age / 4)
    const f = age / life
    const col = f < 0.3 ? core : f < 0.65 ? c : dark(c)
    dot(out, x, y, col)
    if (f < 0.6) dot(out, x, y + 1, col)
  }
}

function spray(out, t, a, g, c) {
  for (let i = 0; i < a.ticks - 10; i++) {
    const age = t - i
    if (age < 0 || age >= 12) continue
    const x = g.ahead(age * 2)
    const y = g.mouth + age * age * 0.06 + Math.sin(i + age) * 0.6
    if (Math.round(y) > g.ground) continue
    dot(out, x, y, i % 3 ? c : light(c, 0.6))
    dot(out, x, y + 1, c)
  }
}

function bubbles(out, t, a, g, c) {
  for (let i = 0; i < 10; i++) {
    const age = t - i * 3
    if (age < 0 || age >= 30) continue
    const x = g.ahead(2 + age * 0.6 + rnd(a.seed, i) * 3)
    const y = g.mouth + 2 - age * 0.25 + Math.sin(age * 0.5 + i) * 1.2
    if (age >= 28) {
      for (const [ox, oy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) dot(out, x + ox, y + oy, light(c, 0.5))
      continue
    }
    ring(out, x, y, rnd(a.seed, i, 1) < 0.4 ? 2 : 1.4, c)
    dot(out, x - 1, y - 1, WHITE)
  }
}

// Zigzag bolts from the top of the strip, the first one on the mon itself
function bolt(out, t, a, g, c) {
  for (let k = 0; k < 6; k++) {
    const age = t - (2 + k * 6)
    if (age < 0 || age >= 4) continue
    let x = k === 0 ? g.cx : g.left - 5 + Math.floor(rnd(a.seed, k) * (g.right - g.left + 10))
    const core = age % 2 ? c : WHITE
    for (let y = 0; y <= g.ground; y++) {
      if (y % 3 === 0) x += rnd(a.seed, k, y) < 0.5 ? -1 : 1
      dot(out, x, y, core)
      dot(out, x + 1, y, c)
    }
    plus(out, x, g.ground - 1, c, WHITE)
  }
}

function leaves(out, t, a, g, c) {
  for (let i = 0; i < 14; i++) {
    const age = t - i * 2
    if (age < 0 || age >= 20) continue
    const x = g.ahead(age * 1.6)
    const y = g.mouth + Math.sin(age * 0.6 + rnd(a.seed, i) * 6) * 3 + (rnd(a.seed, i, 1) - 0.5) * 6
    dot(out, x, y, c)
    if (age % 4 < 2) dot(out, x + g.side, y, dark(c))
    else dot(out, x + g.side, y - 1, dark(c))
  }
}

// Two wavy whips that lash out and back twice
function vines(out, t, a, g, c) {
  const phase = t % 20
  const len = phase < 8 ? phase * 2.5 : phase < 12 ? 20 : (20 - phase) * 2.5
  if (g.crown) return crownVines(out, t, g, c, len)
  for (let v = 0; v < 2; v++) {
    const base = Math.min(g.ground - 1, g.mouth + 2 + v * 3)
    for (let d = 0; d <= len; d++) {
      const y = base + Math.sin(d * 0.5 - t * 0.8 + v * 2) * (1 + d / 10)
      dot(out, g.ahead(d), y, d >= len - 1 ? light(c, 0.4) : c)
    }
  }
}

// Whips that rise out of the crown, arc over, and lash down in front
function crownVines(out, t, g, c, len) {
  const { x, y } = g.crown
  for (let v = 0; v < 2; v++) {
    const rise = Math.min(8 + v * 3, y * 2)
    const tipX = x + g.side * (len + 4 + v * 3)
    const tipY = y + 2 + v * 4
    const steps = Math.ceil(len * 1.5) + 4
    for (let k = 0; k <= steps; k++) {
      const s = k / steps
      const wave = Math.sin(s * 6 - t * 0.8 + v * 2) * s * 1.2
      const px = (1 - s) ** 2 * x + 2 * s * (1 - s) * (x + g.side * (len / 2 + 2)) + s * s * tipX
      const py = (1 - s) ** 2 * y + 2 * s * (1 - s) * (y - rise) + s * s * tipY + wave
      dot(out, px, py, k >= steps - 1 ? light(c, 0.4) : v ? dark(c, 0.2) : c)
    }
  }
}

function powder(out, t, a, g, c) {
  const fadeFrom = a.ticks - 10
  if (g.crown) return crownPowder(out, t, a, g, c, fadeFrom)
  for (let i = 0; i < 40; i++) {
    const age = t - Math.floor(rnd(a.seed, i, 2) * 15)
    if (age < 0 || (i + age) % 5 === 0) continue
    if (t > fadeFrom && rnd(a.seed, i, 3) < (t - fadeFrom) / 10) continue
    const x = g.ahead(3 + rnd(a.seed, i) * 14 + age * 0.15)
    const y = g.top + rnd(a.seed, i, 1) * (g.ground - g.top) + age * 0.1 + Math.sin(age * 0.4 + i)
    if (Math.round(y) <= g.ground) dot(out, x, y, i % 3 ? c : light(c, 0.5))
  }
}

// Puffs that burst up out of the crown, then drift forward and settle into a cloud
function crownPowder(out, t, a, g, c, fadeFrom) {
  for (let i = 0; i < 40; i++) {
    const age = t - Math.floor(rnd(a.seed, i, 2) * 20)
    if (age < 0 || (i + age) % 5 === 0) continue
    if (t > fadeFrom && rnd(a.seed, i, 3) < (t - fadeFrom) / 10) continue
    const up = 0.8 + rnd(a.seed, i) * 0.9
    const x = g.crown.x + g.side * age * (0.25 + rnd(a.seed, i, 1) * 0.5) + (rnd(a.seed, i, 4) - 0.5) * age * 0.3
    const y = g.crown.y - up * age + 0.045 * age * age + Math.sin(age * 0.4 + i) * 0.5
    if (y >= 0 && Math.round(y) <= g.ground) dot(out, x, y, i % 3 ? c : light(c, 0.5))
  }
}

function rings(out, t, a, g, c) {
  for (let k = 0; k < 5; k++) {
    const r = (t - k * 6) * 0.8
    if (r < 1 || r > 14) continue
    ring(out, g.ahead(2), g.mouth, r, k % 2 ? light(c, 0.5) : c, facingAngle(g), 1.2)
  }
}

// Sparkles that twinkle around a spot
function sparkles(out, t, a, cx, cy, spanX, spanY, c, count = 6) {
  for (let i = 0; i < count; i++) {
    if ((t + i) % 3 === 0) continue
    const x = cx + (rnd(a.seed, i, t >> 2) - 0.5) * spanX
    const y = cy + (rnd(a.seed, i, (t >> 2) + 50) - 0.5) * spanY
    if ((t + i) % 3 === 1) plus(out, x, y, c, WHITE)
    else dot(out, x, y, WHITE)
  }
}

// Flicker out, vanish, then flicker back in at a.toX
function teleport(out, t, a, g, c) {
  const shift = a.toX - g.x
  const span = g.right - g.left + 6
  const spanY = g.bottom - g.top + 4
  if (t < 10) out.hidden = t % 2 === 1
  else if (t < 20) out.hidden = true
  else {
    out.dx = shift
    out.hidden = t < 28 && t % 2 === 1
  }
  if (t < 18) sparkles(out, t, a, g.cx, g.cy, span, spanY, c)
  if (t >= 16 && t < 32) sparkles(out, t, a, g.cx + shift, g.cy, span, spanY, c)
}

// Three claw streaks in front, each a steep two-pixel diagonal with a light core,
// wiped in from the top and blinking out. The second swipe leans the other way.
const CLAW_ROWS = 10

function slash(out, t, a, g, c) {
  const core = light(c, 0.7)
  const rows = Math.min(CLAW_ROWS, g.ground - g.top)
  const y0 = Math.max(0, g.mouth - Math.floor(rows / 2))
  for (let set = 0; set < 2; set++) {
    const age = t - set * 14
    if (age < 0 || age >= 12 || (age >= 8 && age % 2)) continue
    const shown = Math.min(rows, (age + 1) * 3)
    for (let k = 0; k < 3; k++) {
      for (let r = 0; r < shown; r++) {
        const lean = set ? r : rows - 1 - r
        const x = g.ahead(2 + set + k * 5 + Math.floor(lean / 2))
        const y = y0 + r
        const tip = r === 0 || r === rows - 1
        dot(out, x, y, age < 2 ? WHITE : tip ? c : core)
        if (!tip) dot(out, x + g.side, y, c)
      }
    }
  }
}

function burst(out, x, y, r, c) {
  dot(out, x, y, WHITE)
  for (let k = 0; k < 8; k++) {
    const angle = (k * Math.PI) / 4
    const len = k % 2 ? r * 0.7 : r
    for (let d = 1; d <= len; d++) dot(out, x + Math.cos(angle) * d, y + Math.sin(angle) * d, d < 2 ? light(c, 0.6) : c)
  }
}

// Dash forward a few columns, hit, and step back
function tackle(out, t, a, g, c) {
  const far = Math.max(0, Math.min(4, g.reach - 1))
  const dash = t < 4 ? Math.round((far * t) / 4) : t < 8 ? far : t < 20 ? Math.round((far * (20 - t)) / 12) : 0
  out.dx = g.side * dash
  if (t >= 4 && t < 10) burst(out, g.ahead(dash + 1), g.mouth + 2, t < 7 ? t - 2 : 10 - t, c)
}

function impact(out, t, a, g, c) {
  const r = t < 8 ? t * 0.8 : t < 14 ? 6 : Math.max(0, (a.ticks - t) * 0.6)
  if (r >= 1) burst(out, g.ahead(4), g.mouth + 2, r, c)
}

// The strip shakes and rubble pops up from the ground
function quake(out, t, a, g, c) {
  out.jitter = t < a.ticks - 4 ? (t % 2 ? 1 : -1) : 0
  for (let i = 0; i < 18; i++) {
    const age = t - Math.floor(rnd(a.seed, i, 1) * (a.ticks - 10))
    if (age < 0 || age >= 10) continue
    const x = rnd(a.seed, i) * g.columns
    const y = g.ground - age * (10 - age) * 0.3
    dot(out, x, y, i % 2 ? c : light(c, 0.3))
    if (i % 3 === 0) dot(out, x + 1, y, dark(c))
  }
}

const ROCK = ['.ab.', 'abbc', 'bbcc', '.cc.']

function rocks(out, t, a, g, c) {
  const shades = { a: light(c, 0.35), b: c, c: dark(c) }
  for (let i = 0; i < 6; i++) {
    const age = t - i * 5
    if (age < 0) continue
    const x0 = g.ahead(2 + rnd(a.seed, i) * 12) - 1
    const y0 = Math.min(g.ground - 3, -4 + age * 1.5)
    for (let ry = 0; ry < 4; ry++) {
      for (let rx = 0; rx < 4; rx++) {
        const ch = ROCK[ry][rx]
        if (ch !== '.') dot(out, x0 + rx, y0 + ry, shades[ch])
      }
    }
  }
}

// Blobs that arc forward and splat on the ground
function sludge(out, t, a, g, c) {
  for (let i = 0; i < 6; i++) {
    const age = t - i * 5
    if (age < 0 || age >= 16) continue
    const x = g.ahead(age * 1.3)
    const y = g.mouth - age * 1.2 + age * age * 0.12
    if (Math.round(y) >= g.ground - 1) {
      for (let s = -2; s <= 2; s++) dot(out, x + s, g.ground, s % 2 ? dark(c) : c)
      continue
    }
    dot(out, x, y, light(c, 0.4))
    dot(out, x + 1, y, c)
    dot(out, x, y + 1, c)
    dot(out, x + 1, y + 1, dark(c))
  }
}

function wind(out, t, a, g, c) {
  for (let i = 0; i < 16; i++) {
    const age = t - i * 2
    if (age < 0 || age >= 10) continue
    const y = g.top + rnd(a.seed, i) * (g.ground - g.top)
    const x = g.ahead(rnd(a.seed, i, 1) * 4 + age * 3)
    for (let d = 0; d < 4; d++) dot(out, x + g.side * d, y, d === 3 ? WHITE : c)
  }
  for (let k = 0; k < 6; k++) {
    const angle = t * 0.6 + k * 0.5
    const r = 1.5 + k * 0.4
    dot(out, g.ahead(9) + Math.cos(angle) * r, g.mouth + Math.sin(angle) * r, light(c, 0.3))
  }
}

// A sagging thread that shoots out, wraps in a zigzag at its tip, then pulls back
function string(out, t, a, g, c) {
  const full = Math.min(18, g.reach)
  const len = t > a.ticks - 8 ? Math.round((full * (a.ticks - t)) / 8) : Math.min((t + 1) * 3, full)
  for (let d = 0; d <= len; d++) dot(out, g.ahead(d), g.mouth + 2 * (d / Math.max(1, full)) ** 2, c)
  if (len < full || t > a.ticks - 8) return
  const tip = g.mouth + 2
  for (let k = 0; k < 6; k++) {
    dot(out, g.ahead(full - 2 + (k % 2) * 2), tip - 3 + k, k % 2 ? c : light(c, 0.3))
  }
}

function shadow(out, t, a, g, c) {
  if (t < a.ticks - 6) out.hidden = t % 4 === 1
  const deep = dark(c, 0.55)
  for (let k = 0; k < 6; k++) {
    const r = (t - k * 5) * 0.9
    if (r < 1 || r > 16) continue
    const steps = Math.ceil(r * 6)
    const angle = facingAngle(g)
    for (let s = 0; s < steps; s++) {
      const th = angle - 1.1 + (2.2 * s) / steps
      const rr = r + Math.sin(th * 4 + t * 0.7) * 0.8
      dot(out, g.ahead(1) + rr * Math.cos(th), g.mouth + 2 + rr * Math.sin(th), s % 2 ? deep : c)
    }
  }
}

// ♪ and ♫ drifting up and forward, like the pet hearts
function notes(out, t, a, g, c) {
  const width = g.right - g.left + 4
  for (let i = 0; i < 8; i++) {
    const age = t - i * 5
    if (age < 0) continue
    const row = Math.floor(g.mouth / 2) - Math.floor(age / 5)
    if (row < 0) continue
    const col = Math.round(g.left - 2 + rnd(a.seed, i) * width + (g.side * age) / 5)
    if (col < 0 || col >= g.columns) continue
    out.chars.push(col, row, NOTE_CODES[i % 2], c ?? NOTE_COLORS[i % NOTE_COLORS.length])
  }
}

// Hop in place, with droplets at the feet each landing
function splash(out, t, a, g, c) {
  if (t >= a.ticks - 4) return
  out.lift = Math.floor(t / 3) % 2
  if (out.lift) return
  dot(out, g.left - 1, g.ground - 1, c)
  dot(out, g.right + 1, g.ground - 1, c)
  dot(out, g.left - 2, g.ground - 2, light(c, 0.5))
  dot(out, g.right + 2, g.ground - 2, light(c, 0.5))
}

function transform(out, t, a, g, c) {
  const flicker = t < TRANSFORM_FLICKER || t >= a.ticks - TRANSFORM_FLICKER
  if (!flicker) return
  out.hidden = t % 2 === 1
  sparkles(out, t, a, g.cx, g.cy, g.right - g.left + 4, g.bottom - g.top + 4, c, 8)
}

// A blast that swells from the mon's middle while it vanishes, then it blinks back in
function explode(out, t, a, g, c) {
  const end = a.ticks - 8
  out.hidden = t < 4 ? t % 2 === 1 : t < end ? true : t % 2 === 1
  out.jitter = t < 20 ? (t % 2 ? 1 : -1) : 0
  if (t < 2 || t >= end) return
  const r = Math.min(16, (t - 2) * 1.2)
  const thin = t > end - 12 ? (end - t) / 12 : 1
  const ringColors = [WHITE, 0xffe066, c, dark(c, 0.3)]
  const y0 = Math.max(0, Math.floor(g.cy - r))
  const y1 = Math.min(g.ground, Math.ceil(g.cy + r))
  for (let y = y0; y <= y1; y++) {
    for (let x = Math.floor(g.cx - r); x <= g.cx + r; x++) {
      const d = Math.hypot(x - g.cx, y - g.cy)
      if (d > r) continue
      const band = Math.floor(r - d)
      const keep = rnd(a.seed, x * 64 + y, t)
      if (keep > thin) continue
      if (band < ringColors.length) dot(out, x, y, ringColors[ringColors.length - 1 - band])
      else if (keep < 0.15 * thin) dot(out, x, y, 0x6a5a5a)
    }
  }
}

// A pulsing outline one pixel outside the sprite's silhouette
function shield(out, t, a, g, c) {
  if (t >= a.ticks - 4) return
  const col = t % 6 < 3 ? c : light(c, 0.5)
  for (let y = g.top - 1; y <= g.bottom + 1; y++) {
    for (let x = g.left - 1; x <= g.right + 1; x++) {
      if (g.solid(x, y)) continue
      if (g.solid(x - 1, y) || g.solid(x + 1, y) || g.solid(x, y - 1) || g.solid(x, y + 1)) dot(out, x, y, col)
    }
  }
}

// Orbs that fly from in front back into the mon
function drain(out, t, a, g, c) {
  for (let i = 0; i < 10; i++) {
    const age = t - i * 3
    if (age < 0 || age >= 16) continue
    const sx = g.ahead(6 + rnd(a.seed, i) * 10)
    const sy = g.top + rnd(a.seed, i, 1) * (g.ground - g.top)
    const f = (age / 16) ** 2
    plus(out, sx + (g.cx - sx) * f, sy + (g.cy - sy) * f, c, light(c, 0.6))
  }
}

function stars(out, t, a, g, c) {
  for (let i = 0; i < 12; i++) {
    const age = t - i * 2
    if (age < 0 || age >= 14 || i * 2 > a.ticks - 10) continue
    const x = g.ahead(1 + age * 2.5)
    const y = g.mouth + (rnd(a.seed, i) - 0.5) * 8 + (rnd(a.seed, i, 1) - 0.5) * age * 0.4
    if (age % 4 < 2) plus(out, x, y, c, WHITE)
    else for (const [ox, oy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) dot(out, x + ox, y + oy, ox ? c : WHITE)
  }
}

// Shards fly forward while frost twinkles in front
function ice(out, t, a, g, c) {
  for (let i = 0; i < 14; i++) {
    const age = t - i * 2
    if (age < 0 || age >= 12) continue
    const x = g.ahead(age * 2)
    const y = g.mouth + (rnd(a.seed, i) - 0.5) * age * 0.6
    dot(out, x, y, c)
    dot(out, x + g.side, y - 1, c)
    dot(out, x + 2 * g.side, y - 2, WHITE)
  }
  if (t < 6) return
  for (let i = 0; i < 14; i++) {
    if (rnd(a.seed, i, t >> 1) > 0.45) continue
    const x = g.ahead(3 + rnd(a.seed, i, 7) * 16)
    const y = g.top + rnd(a.seed, i, 8) * (g.ground - g.top)
    if ((t + i) % 4 === 0) plus(out, x, y, c, WHITE)
    else dot(out, x, y, WHITE)
  }
}

// Flame particles that corkscrew forward in two alternating hues
function dragon(out, t, a, g, c) {
  const hues = [c, mix(c, 0x4d7aff, 0.6), light(c, 0.5)]
  for (let i = 0; i < a.ticks - 12; i++) {
    const age = t - i
    if (age < 0 || age >= 14) continue
    const x = g.ahead(age * 1.4)
    const y = g.mouth + Math.sin(age * 0.7 + i) * (1 + age * 0.35)
    dot(out, x, y, hues[i % 3])
    if (age < 8) dot(out, x, y + 1, hues[(i + 1) % 3])
  }
}

function heal(out, t, a, g, c) {
  for (let i = 0; i < 16; i++) {
    const age = t - Math.floor(i * 2.5)
    if (age < 0 || age >= 16) continue
    const x = g.left - 2 + rnd(a.seed, i) * (g.right - g.left + 4)
    const y = g.ground - rnd(a.seed, i, 1) * 4 - age * 0.8
    if (age % 4 < 2) plus(out, x, y, c, WHITE)
    else dot(out, x, y, light(c, 0.5))
  }
}
