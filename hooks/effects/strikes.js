// Punches, kicks, and chops

import {
  WHITE, back, ball, clamp, dark, disc, dot, easeIn, easeOut, emit, ghost, keys, lerp, light, line, linear, mix,
  phase, puff, ring, rnd, spark, stamp, tint, tremble,
} from './draw.js'

const DUST = 0xd8c8a6
const ROCK = 0xa08868
const SHADOW = 0x55515f
const HURT = 0xff4a4a

// Pixel art drawn facing right: k outline, d shadow, o base, l light, h white, w cuff
const FIST_S = ['..kkk.', '.khhlk', 'kkllok', 'kwkook', '.kkkk.']
const FIST_M = [
  '...kkkkk..',
  '..khhhllk.',
  'kkkhlllllk',
  'kwkllllllk',
  'kwklllkkok',
  'kwkllkoook',
  'kkkdoooddk',
  '..kkkkkkk.',
]
const FIST_L = [
  '....kkkkk...',
  '...khhhhlkk.',
  '..khhhllllok',
  'kkkhhllllllk',
  'kwkhlllllllk',
  'kwkllllllkkk',
  'kwklllllkook',
  'kkkllllkoook',
  '..kdooooodk.',
  '...kkkkkkk..',
]
const BOOT = ['.kkk....', '.khk....', '.kllkkk.', 'kklllllk', 'kwkdddok', '.kkkkkk.']
const PALM = [
  '.k.k.k..',
  'khkhklk.',
  'khkhklk.',
  'khlhllkk',
  'klllllok',
  '.klllok.',
  '..kkkk..',
]
const BLADE = ['.k.', 'khk', 'khk', 'klk', 'kok', 'kok', '.k.']

// The art's tones for a color, and one color for every tone
const tones = (c) => ({ k: dark(c, 0.72), d: dark(c, 0.3), o: c, l: light(c, 0.55), h: WHITE, w: dark(c, 0.15) })
const solid = (c) => ({ k: c, d: c, o: c, l: c, h: c, w: c })

// The sprite's leading column on row y at its base spot
const frontAt = (g, y) => g.frontAt(clamp(Math.round(y), g.top, g.bottom)) - g.side

// An angle measured with 0 toward the target and pi / 2 straight down, on screen
const toward = (g, angle) => (g.side > 0 ? angle : Math.PI - angle)

// A lean that slides the top of the body px pixels toward the target, or away when
// negative, with the feet planted
function tilt(g, dy, px) {
  if (Math.abs(px) < 0.25) return null
  const feet = g.bottom + dy
  const height = Math.max(1, g.bottom - g.top)
  return (y) => (g.side * px * (feet - y)) / height
}

// Pixel art facing the target, its front edge at column fx and its middle on row y
function art(out, rows, pal, fx, y, side, paint = dot) {
  const w = rows[0].length
  stamp(out, side > 0 ? fx - w + 1 : fx, Math.round(y - (rows.length - 1) / 2), rows, pal, side < 0, paint)
}

// A comic impact star with a white heart, spikes in c, and a dark rim. flat squashes
// it and turn spins the spikes.
function pow(out, x, y, r, c, { points = 8, inner = 0.5, flat = 1, turn = 0, paint = dot } = {}) {
  const lit = light(c, 0.5)
  const rim = dark(c, 0.5)
  for (let py = Math.floor(y - (r + 1) * flat); py <= Math.ceil(y + (r + 1) * flat); py++) {
    for (let px = Math.floor(x - r - 1); px <= Math.ceil(x + r + 1); px++) {
      const ux = px - x
      const uy = (py - y) / flat
      const d = Math.hypot(ux, uy)
      const s = ((((Math.atan2(uy, ux) / (2 * Math.PI)) * points + turn) % 1) + 1) % 1
      const edge = r * lerp(inner, 1, Math.abs(s - 0.5) * 2)
      if (d > edge + 0.75) continue
      paint(out, px, py, d > edge ? rim : d < edge * 0.45 ? WHITE : d < edge * 0.75 ? lit : c)
    }
  }
}

// A crescent swept around (x, y) from angle `from` to `to`, thick and white hot at
// the leading end and thin at the tail. rx and ry stretch it into an ellipse.
function swoosh(out, x, y, rx, ry, from, to, thick, c, paint = dot) {
  const span = to - from
  const half = thick / 2
  const steps = Math.ceil(Math.abs(span) * (Math.max(rx, ry) + half) * 1.6) + 2
  const lit = light(c, 0.55)
  const rim = dark(c, 0.35)
  for (let s = half; s >= 0; s -= 0.5) {
    for (const o of s > 0 ? [s, -s] : [0]) {
      for (let k = 0; k <= steps; k++) {
        const u = k / steps
        if (s > half * (0.15 + 0.85 * u)) continue
        const f = s / half
        const angle = from + span * u
        const col = f > 0.75 ? rim : f > 0.4 ? c : u > 0.55 ? WHITE : lit
        paint(out, x + (rx + o) * Math.cos(angle), y + (ry + o) * Math.sin(angle), col)
      }
    }
  }
}

// A thick straight streak with a white core, fading out to `c` at its rim
function streak(out, x0, y0, x1, y1, thick, c, paint = dot) {
  const n = Math.hypot(x1 - x0, y1 - y0) || 1
  const nx = -(y1 - y0) / n
  const ny = (x1 - x0) / n
  const half = thick / 2
  for (let s = half; s >= 0; s -= 0.5) {
    const col = s > half * 0.7 ? dark(c, 0.3) : s > half * 0.35 ? c : WHITE
    for (const o of s > 0 ? [s, -s] : [0]) line(out, x0 + nx * o, y0 + ny * o, x1 + nx * o, y1 + ny * o, col, paint)
  }
}

// A two pixel ring, white inside while fresh
function shockRing(out, x, y, r, c, f, paint = dot) {
  ring(out, x, y, r, f < 0.5 ? c : dark(c, 0.3), 0, Math.PI, paint)
  ring(out, x, y, r - 1, f < 0.4 ? WHITE : light(c, 0.35), 0, Math.PI, paint)
}

// A ring rolling out along the ground from x, its far half behind the sprite
function quake(out, x, y, r, c, f) {
  const ry = Math.max(1, r * 0.22)
  const steps = Math.ceil(r * 8)
  const outer = f < 0.5 ? c : dark(c, 0.35)
  const inner = f < 0.5 ? WHITE : light(c, 0.3)
  for (let k = 0; k < steps; k++) {
    const angle = (k / steps) * 2 * Math.PI
    const paint = Math.sin(angle) < 0 ? back : dot
    paint(out, x + r * Math.cos(angle), y + ry * Math.sin(angle), outer)
    paint(out, x + (r - 1) * Math.cos(angle), y + (ry - 0.5) * Math.sin(angle), inner)
  }
}

// Chunks knocked loose at t0 fly up and out, fall, and rest on the ground
function chips(out, t, a, g, t0, x, y, count, c, { power = 1, life = 14, salt = 0 } = {}) {
  const fall = 0.16
  emit(t, { count, start: t0, gap: 0, life }, (i, age, f) => {
    const vx = ((rnd(a.seed, i, salt) - 0.5) * 2.2 + g.side * 0.5) * power
    const vy = -(0.5 + rnd(a.seed, i, salt + 1) * 1.3) * power
    const land = (-vy + Math.sqrt(vy * vy + 4 * fall * Math.max(0, g.ground - y))) / (2 * fall)
    const k = Math.min(age, land)
    const px = x + vx * k
    const py = Math.min(g.ground, y + vy * k + fall * k * k)
    const col = f > 0.7 ? dark(c, 0.45) : i % 3 ? c : light(c, 0.45)
    dot(out, px, py, col)
    if (i % 2 === 0) dot(out, px + 1, py, dark(col, 0.25))
    if (i % 4 === 0 && py < g.ground) dot(out, px, py - 1, light(col, 0.3))
  })
}

// Dust kicked up at (x, y), rolling out to one side, or both when dir is 0
function dust(out, t, a, t0, x, y, count, dir, { life = 10, salt = 0, size = 1.6, gap = 0.6 } = {}) {
  emit(t, { count, start: t0, gap, life }, (i, age, f) => {
    const s = dir || (i % 2 ? 1 : -1)
    const px = x + s * (1 + age * (0.35 + rnd(a.seed, i, salt) * 0.45))
    const py = y - age * 0.12 - rnd(a.seed, i, salt + 1) * 1.5
    puff(out, px, py, 0.6 + size * Math.sin(Math.PI * f), mix(DUST, 0x8a7c66, f), a.seed + i)
  })
}

// Pale smoke rolling up off a hit
function smoke(out, t, a, t0, x, y, count, salt = 0) {
  emit(t, { count, start: t0, gap: 1.5, life: 10 }, (i, age, f) => {
    const px = x + (rnd(a.seed, i, salt) - 0.5) * 7 + Math.sin(age * 0.4 + i) * 1.2
    const py = y + (rnd(a.seed, i, salt + 1) - 0.5) * 4 - age * 0.5
    if (py > 0) puff(out, px, py, 0.8 + 1.2 * Math.sin(Math.PI * f), mix(0xd0ccd8, 0x77737f, f), a.seed + i + salt)
  })
}

// Speed lines trailing off the back of the body
function speedLines(out, t, g, dx, dy, c, rows = 4) {
  const tail = (g.side > 0 ? g.left : g.right) + dx
  for (let k = 0; k < rows; k++) {
    const y = g.top + dy + 2 + Math.round(((g.bottom - g.top - 4) * k) / (rows - 1))
    const x0 = tail - g.side * (2 + ((k * 2 + t) % 3))
    for (let d = 0; d < 4; d++) dot(out, x0 - g.side * d, y, d === 0 ? WHITE : d < 2 ? light(c, 0.5) : c)
  }
}

// Little stars that pop off a hit, arc out and fall, twinkling
function stars(out, t, a, t0, x, y, count, c, life = 10) {
  emit(t, { count, start: t0, life }, (i, age, f) => {
    const angle = -Math.PI / 2 + (i - (count - 1) / 2) * 0.9 + (rnd(a.seed, i, 9) - 0.5) * 0.4
    const px = x + Math.cos(angle) * age * 1.1
    const py = y + Math.sin(angle) * age * 0.9 + 0.08 * age * age
    const lit = (t + i) % 4 < 2
    if (f > 0.7 && !lit) return
    if (lit) spark(out, px, py, 1, c)
    else {
      dot(out, px, py, WHITE)
      for (const [ox, oy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) dot(out, px + ox, py + oy, c)
    }
  })
}

// A flat comic smack, a white flash that pops wide and flies apart in short dashes
function smack(out, age, x, y, c, size = 1) {
  if (age < 0 || age > 6) return
  if (age < 4) pow(out, x, y, [4, 6, 5, 3][age] * size, age === 0 ? WHITE : c, { flat: 0.6, turn: age * 0.5, inner: 0.45 })
  if (age < 2) return
  for (let k = 0; k < 6; k++) {
    const angle = (k / 6) * 2 * Math.PI + Math.PI / 6
    const r0 = (4 + age * 1.2) * size
    const col = age < 4 ? light(c, 0.5) : c
    line(out, x + Math.cos(angle) * r0, y + Math.sin(angle) * r0 * 0.6, x + Math.cos(angle) * (r0 + 2), y + Math.sin(angle) * (r0 + 2) * 0.6, col)
  }
}

// A heavy blow, a white flash and then a big spiky burst that shrinks inside a ring
function slam(out, age, x, y, r, c) {
  if (age < 0 || age > 8) return
  if (age === 0) disc(out, x, y, r * 0.7, WHITE)
  if (age < 6) pow(out, x, y, r * [0.9, 1.1, 1, 0.8, 0.6, 0.4][age], age < 1 ? WHITE : c, { turn: age % 2 ? 0.5 : 0, inner: 0.42 })
  if (age >= 2) shockRing(out, x, y, r * 0.7 + (age - 2) * 1.3, c, phase(age, 2, 8), back)
}

// Sparks streaming in to a point, for a charge building up
function gather(out, t, a, t0, t1, x, y, c, r = 9) {
  emit(t, { count: t1 - t0, start: t0, life: 4 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 31) * 2 * Math.PI
    const d = r * (1 - easeIn(f))
    const px = x + Math.cos(angle) * d
    const py = y + Math.sin(angle) * d * 0.8
    if (f < 0.5) dot(out, px, py, light(c, 0.4))
    else spark(out, px, py, 1, c)
  })
}

const POUND_HIT = 7

// Rock back, hop in, and squash flat against the target behind a comic smack flash,
// then bounce home while little stars pop off the hit
function pound(out, t, a, g, c) {
  const H = POUND_HIT
  const hy = Math.round(lerp(g.mouth.y, g.target.y, 0.4))
  const edge = frontAt(g, hy)
  const far = clamp(Math.abs(g.target.x - edge) - 2, 0, 9)
  const hx = edge + g.side * (far + 2)
  const at = (k) => Math.round(keys(k, [[0, 0], [3, -2, easeOut], [4, -2], [H, far, linear], [H + 2, far], [H + 9, 0]]))
  out.dx = g.side * at(t)
  if (t < 4) {
    const f = easeOut(phase(t, 0, 3))
    out.sy = 1 - 0.1 * f
    out.sx = 1 + 0.06 * f
  } else if (t < H) {
    out.dy = -Math.round(Math.sin(Math.PI * phase(t, 3, H + 0.5)) * 3)
    out.sx = 1.1
    out.sy = 0.94
    if (t > 4) out.ghosts = [ghost(g.side * at(t - 2), 0, light(c, 0.4), 0.55)]
  } else if (t < H + 2) {
    // Squashed against the target, the front edge held where it hit
    out.sx = 0.82
    out.sy = 1.1
    out.dx += g.side * Math.round(((g.right - g.left + 1) / 2) * 0.18)
  } else if (t < H + 9) {
    out.dy = -Math.round(Math.sin(Math.PI * phase(t, H + 2, H + 9)) * 3)
  } else if (t === H + 9) {
    out.sy = 0.9
    out.sx = 1.06
  } else if (t < H + 13) {
    out.dy = -Math.round(Math.sin(Math.PI * phase(t, H + 10, H + 13)))
  }
  if (t === H) out.shade = tint(WHITE, 0.6)
  if (t === H + 1) out.shade = tint(WHITE, 0.25)
  if (t === H) out.shake = [g.side, 0]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [3, -2, easeOut], [4, -2], [H, 2, linear], [H + 2, 0], [H + 5, -1], [H + 9, 0]]))
  smack(out, t - H, hx, hy, c)
  stars(out, t, a, H + 1, hx, hy - 1, 3, c)
}

const SLAPS = [9, 16, 23]
const LAST_SLAP = SLAPS[SLAPS.length - 1]
const SLAP_SWING = 3
const SLAP_RADIUS = 8

// Scurry up close and slap the target back and forth, forehand then backhand, each
// swing leaving a swoosh and a flat flash, then trot home
function doubleslap(out, t, a, g, c) {
  const pal = tones(c)
  const hy = Math.round(lerp(g.mouth.y, g.target.y, 0.5))
  const edge = frontAt(g, hy)
  const far = clamp(Math.abs(g.target.x - edge) - 6, 0, 8)
  const hx = edge + g.side * (far + 4)
  const pivotY = hy - SLAP_RADIUS
  let dx = keys(t, [[0, 0], [5, far, easeOut], [LAST_SLAP + 4, far], [LAST_SLAP + 11, 0]])
  let lean = 0
  SLAPS.forEach((s, k) => {
    const backhand = k % 2 === 1
    const dir = backhand ? -1 : 1
    if (t >= s - SLAP_SWING && t <= s + 1) {
      if (backhand) out.flipX = t >= s - 2 && t <= s
      dx += t >= s - 1 ? 1 : -1
      lean = t >= s ? 2 : -1
      if (t === s - 1) out.dy = -1
      // The palm swings like a pendulum hung above the hit, crossing the bottom on the hit
      const from = -1.4 * dir
      const swing = from + 0.47 * dir * (t - s + SLAP_SWING)
      swoosh(out, hx, pivotY, SLAP_RADIUS, SLAP_RADIUS, toward(g, Math.PI / 2 - from), toward(g, Math.PI / 2 - swing), 3.5, c)
      const px = hx + g.side * SLAP_RADIUS * Math.sin(swing)
      const py = pivotY + SLAP_RADIUS * Math.cos(swing)
      stamp(out, Math.round(px - 3.5), Math.round(py - 3), PALM, t === s ? solid(WHITE) : pal, (g.side > 0) === backhand)
    }
    const age = t - s
    if (age === 0) out.shake = [g.side * dir, 0]
    smack(out, age, hx + g.side * dir, hy + (backhand ? 1 : -1), c, k === SLAPS.length - 1 ? 1.2 : 0.9)
  })
  out.dx = g.side * Math.round(dx)
  out.skew = tilt(g, out.dy, lean)
  stars(out, t, a, LAST_SLAP + 1, hx, hy - 2, 3, c)
}

const MEGA_LAUNCH = 10
const MEGA_HIT = 13

// Lean back and charge a huge glowing fist, rocket it out at the target, and land a
// heavy blow with a white flash, a big burst and ring, debris, and a hard shake
function megapunch(out, t, a, g, c) {
  const H = MEGA_HIT
  const pal = tones(c)
  const fy = Math.round(lerp(g.cy, g.target.y, 0.5))
  const edge = frontAt(g, fy)
  const hx = g.target.x
  const lean = Math.round(keys(t, [[0, 0], [5, -2, easeOut], [MEGA_LAUNCH, -2], [H, 2, easeIn], [H + 5, 2], [H + 14, 0]]))
  out.dx = g.side * lean + (t >= 5 && t < MEGA_LAUNCH ? tremble(t) : 0)
  if (t < MEGA_LAUNCH) {
    const f = easeOut(phase(t, 0, 5))
    out.sy = 1 - 0.07 * f
    out.sx = 1 + 0.04 * f
    if (t >= 6) out.shade = tint(c, t % 2 ? 0.25 : 0.1)
  } else if (t < H) {
    out.sx = 1.08
  }
  if (t === H) out.shade = tint(WHITE, 0.45)
  if (t >= H && t < H + 5) out.shake = [[2 * g.side, 0], [-2 * g.side, 1], [g.side, -1], [-g.side, 0], [0, 0]][t - H]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [5, -2, easeOut], [MEGA_LAUNCH, -2], [H, 3, easeIn], [H + 4, 2], [H + 12, 0]]))

  // The fist grows in ahead of the body, rockets out, then sinks back and fades
  const hold = edge + g.side * (lean + 8)
  let fx = hold
  if (t >= MEGA_LAUNCH) fx = Math.round(lerp(hold, hx, easeIn(phase(t, MEGA_LAUNCH, H))))
  if (t >= H + 3) fx = hx - g.side * Math.round(2 * phase(t, H + 3, H + 6))
  const rows = t < 2 ? null : t < 4 ? FIST_S : t < 6 ? FIST_M : FIST_L
  const mid = fx - g.side * ((rows ?? FIST_S)[0].length >> 1)
  if (t < MEGA_LAUNCH) {
    gather(out, t, a, 1, 9, mid, fy, c)
    if (t >= 4) disc(out, mid, fy, 6 + (t % 2), light(c, 0.15), back)
  }
  if (t > MEGA_LAUNCH && t <= H) {
    const prev = Math.round(lerp(hold, hx, easeIn(phase(t - 1, MEGA_LAUNCH, H))))
    art(out, FIST_L, solid(light(c, 0.3)), prev, fy, g.side)
    const tailX = fx - g.side * 11
    const len = Math.abs(fx - hold) + 3
    for (const oy of [-3, 0, 3]) {
      for (let d = 0; d < len; d++) dot(out, tailX - g.side * d, fy + oy, d < 2 ? WHITE : d < len / 2 ? light(c, 0.4) : c)
    }
  }
  // The burst sits behind the fist so its spikes flare out all around it
  const age = t - H
  if (age === 0) disc(out, mid, fy, 7, WHITE)
  if (age >= 1 && age < 6) pow(out, mid, fy, [11, 12, 10, 8, 5][age - 1], c, { turn: age % 2 ? 0.5 : 0, inner: 0.45 })
  if (age >= 2 && age < 9) shockRing(out, mid, fy, 8 + (age - 2) * 1.4, c, phase(age, 2, 9), back)
  // While charging, the fist sits behind the body so it never covers the face
  const paint = t < MEGA_LAUNCH ? back : dot
  if (rows && t < H + 8 && !(t >= H + 6 && t % 2)) art(out, rows, t === H ? solid(WHITE) : pal, fx, fy, g.side, paint)
  chips(out, t, a, g, H, hx, fy, 12, c, { power: 1.3 })
  stars(out, t, a, H + 3, hx, fy - 2, 3, c)
}

const COMETS = 6
const COMET_FIRST = 4
const COMET_GAP = 4
const COMET_FLIGHT = 2

// A comet's tail streaming back from (x, y) against its heading (vx, vy), wide and
// bright near the head, thin and dim at the end
function cometTail(out, x, y, vx, vy, len, c) {
  const n = Math.hypot(vx, vy) || 1
  const ux = vx / n
  const uy = vy / n
  for (let d = len; d >= 0; d--) {
    const f = d / len
    const col = f < 0.25 ? light(c, 0.7) : f < 0.5 ? light(c, 0.3) : f < 0.8 ? c : dark(c, 0.35)
    const w = f < 0.4 ? 1.5 : f < 0.75 ? 1 : 0
    for (let s = -w; s <= w; s += 0.5) dot(out, x - ux * d - uy * s, y - uy * d + ux * s, col)
  }
}

// A flurry of fists, each a comet with a blazing tail, hammering the target at
// slightly different spots while the body jabs along
function cometpunch(out, t, a, g, c) {
  const pal = tones(c)
  const lastHit = COMET_FIRST + (COMETS - 1) * COMET_GAP + COMET_FLIGHT
  let jab = Math.round(keys(t, [[0, 0], [3, -1, easeOut], [lastHit + 2, -1], [lastHit + 7, 0]]))
  for (let k = 0; k < COMETS; k++) {
    const t0 = COMET_FIRST + k * COMET_GAP
    const age = t - t0
    if (age < 0) continue
    const final = k === COMETS - 1
    // Left and right fists take turns, from a little higher and a little lower
    const y0 = Math.round(g.cy + (k % 2 ? 1 : -2))
    const sx = frontAt(g, y0) + g.side * 2
    const lx = g.target.x + Math.round((rnd(a.seed, k, 4) - 0.5) * 4)
    const ly = g.target.y - 2 + (k % 2 ? 1 : -1) * Math.round(1 + rnd(a.seed, k, 3) * 3)
    const vx = g.side * Math.abs(lx - sx)
    const vy = ly - y0
    if (age < 2) jab = 2 - age
    if (age < COMET_FLIGHT) {
      const f = (age + 1) / (COMET_FLIGHT + 1)
      const hx = Math.round(lerp(sx, lx, f))
      const hy = Math.round(lerp(y0, ly, f))
      cometTail(out, hx - g.side * 5, hy, vx, vy, 4 + age * 4, c)
      art(out, FIST_S, pal, hx, hy, g.side)
    } else if (age < COMET_FLIGHT + 2) {
      cometTail(out, lx - g.side * 3, ly, vx, vy, age === COMET_FLIGHT ? 7 : 3, c)
    }
    const hit = age - COMET_FLIGHT
    if (hit >= 0 && hit < 4) {
      if (hit === 0) disc(out, lx, ly, final ? 4 : 3, WHITE)
      else pow(out, lx, ly, (final ? [7, 6, 4] : [4, 3, 2])[hit - 1], c, { turn: (k + hit) * 0.25 })
      if (hit === 0) out.shake = [g.side * (final ? 2 : 1), 0]
      if (final && hit === 1) out.shake = [-g.side, 1]
    }
    if (hit >= 1 && hit < 4) ring(out, lx, ly, 2 + hit * 1.5 + (final ? 2 : 0), hit < 2 ? light(c, 0.5) : c)
    chips(out, t, a, g, t0 + COMET_FLIGHT, lx, ly, final ? 7 : 2, c, { power: final ? 1 : 0.6, life: 10, salt: k * 7 })
  }
  out.dx = g.side * jab
  if (t >= COMET_FIRST && t < COMET_FIRST + COMETS * COMET_GAP) out.dy = -(Math.floor((t - COMET_FIRST) / COMET_GAP) % 2)
  out.skew = tilt(g, out.dy, jab)
  stars(out, t, a, lastHit + 1, g.target.x, g.target.y - 3, 3, c)
}

const PUNCH_LUNGE = 10
const PUNCH_HIT = 13

// A fire ramp from white hot to smoke
function heat(c) {
  const red = mix(c, 0xd02010, 0.6)
  return [WHITE, mix(c, 0xffe060, 0.7), c, red, dark(red, 0.45), 0x5a5252]
}

const heatAt = (r, f) => r[f < 0.12 ? 0 : f < 0.3 ? 1 : f < 0.55 ? 2 : f < 0.75 ? 3 : f < 0.9 ? 4 : 5]

// A tongue of flame, two pixels wide and three tall, hotter at its root
function flame(out, x, y, f, r) {
  dot(out, x, y, heatAt(r, f))
  dot(out, x + 1, y, heatAt(r, Math.min(1, f + 0.12)))
  dot(out, x, y - 1, heatAt(r, Math.min(1, f + 0.2)))
  if (f < 0.6) dot(out, x + 1, y - 1, heatAt(r, f + 0.3))
  if (f < 0.45) dot(out, x, y - 2, heatAt(r, f + 0.4))
}

// Flames lick up around the fist, more of them as the charge builds
function fireAura(out, t, a, x, y, c, f) {
  const r = heat(c)
  for (let i = 0; i < 3 + Math.round(f * 6); i++) {
    const age = (t + i * 2) % 5
    const cycle = Math.floor((t + i * 2) / 5)
    const px = x - 1 + (rnd(a.seed, i, cycle) - 0.5) * 10
    const py = y + 2 - rnd(a.seed, i, cycle + 30) * 5
    flame(out, px, py - age * 0.8, age / 5, r)
  }
}

// A fireball blooms, then two arms of flame spiral up off the hit while embers drift
function fireBurst(out, age, t, a, g, x, y, c) {
  const r = heat(c)
  if (age < 0) return
  if (age < 5) ball(out, x, y, [3, 5, 6, 5, 3][age], age < 2 ? r[1] : c)
  if (age === 0) disc(out, x, y, 2, WHITE)
  emit(age, { count: 24, start: 1, gap: 0.45, life: 10 }, (i, k, f) => {
    const angle = (i % 2) * Math.PI + k * 0.7
    const spin = 2.5 + k * 0.45
    // Flames on the far side of the spiral burn darker, which sells the twist
    const far = Math.sin(angle) < 0
    flame(out, x - 1 + Math.cos(angle) * spin * 1.3, y + 1 - k * 1.1 + Math.sin(angle) * spin * 0.35, far ? Math.min(1, f + 0.3) : f, r)
  })
  emit(age, { count: 8, start: 5, gap: 1.2, life: 12 }, (i, k, f) => {
    const px = x + (rnd(a.seed, i, 21) - 0.5) * 10 + Math.sin(k * 0.5 + i) * 1.2
    const py = y - 4 - k * 0.6
    if (py > 0 && (t + i) % 5) dot(out, px, py, f < 0.5 ? r[1] : r[3])
  })
  smoke(out, age, a, 10, x, y - 6, 3, 5)
}

// Frost glitters around the fist and cold mist sinks off it
function iceAura(out, t, a, x, y, c, f) {
  const n = 2 + Math.round(f * 4)
  for (let i = 0; i < n; i++) {
    const k = Math.floor((t + i * 3) / 4)
    const px = x + (rnd(a.seed, i, k) - 0.5) * 12
    const py = y + (rnd(a.seed, i, k + 40) - 0.5) * 9
    if ((t + i) % 4 < 2) spark(out, px, py, 1, c)
    else dot(out, px, py, WHITE)
  }
  for (let i = 0; i < n; i++) {
    const age = (t + i * 3) % 6
    dot(out, x + (rnd(a.seed, i, 60) - 0.5) * 8, y + 3 + age * 0.6, light(c, 0.5))
  }
}

// A long ice shard from (x, y) toward `angle`, white along its spine and dark rimmed
function shard(out, x, y, angle, len, wide, c) {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  for (let d = 0; d <= len; d += 0.5) {
    const u = d / len
    const half = wide * (u < 0.3 ? 0.5 + u / 0.6 : (1 - u) / 0.7)
    for (let s = half; s >= 0; s -= 0.5) {
      const col = s > half - 0.6 && half > 0.8 ? dark(c, 0.45) : s > half * 0.4 ? c : u < 0.85 ? WHITE : light(c, 0.5)
      for (const o of s > 0 ? [s, -s] : [0]) dot(out, x + ux * d - uy * o, y + uy * d + ux * o, col)
    }
  }
}

// Ice crystals spike out of the hit in a star, hang glinting, then shatter into glitter
function iceBurst(out, age, t, a, g, x, y, c) {
  if (age < 0) return
  if (age < 2) disc(out, x, y, 3 + age, WHITE)
  if (age >= 1 && age < 7) shockRing(out, x, y, 3 + age * 1.4, light(c, 0.2), phase(age, 1, 7))
  const count = 7
  for (let i = 0; i < count; i++) {
    const angle = toward(g, -Math.PI / 2 + ((i - (count - 1) / 2) / count) * 2 * Math.PI * 0.85 + (rnd(a.seed, i, 50) - 0.5) * 0.3)
    const len = 6 + rnd(a.seed, i, 51) * 4
    if (age < 10) shard(out, x, y, angle, len * easeOut(Math.min(1, (age + 1) / 3)), 2.2, c)
    emit(age, { count: 3, start: 10, life: 9 }, (j, k, f) => {
      const d = len * (0.3 + j * 0.3) + k * 0.5
      const px = x + Math.cos(angle) * d
      const py = y + Math.sin(angle) * d + 0.12 * k * k
      if (py > g.ground) return
      dot(out, px, py, f < 0.5 ? WHITE : light(c, 0.3))
      if (f < 0.6) dot(out, px + 1, py, c)
    })
  }
  if (age >= 3 && age < 10 && age % 3 === 0) spark(out, x + g.side * 3, y - 4, 2, c)
  if (age < 10) disc(out, x, y, 1.5, WHITE)
}

// Arcs crackle off the fist, longer and thicker as the charge builds
function thunderAura(out, t, a, x, y, c, f) {
  const n = 1 + Math.round(f * 3)
  for (let i = 0; i < n; i++) {
    if ((t + i) % 3 === 2) continue
    const angle = rnd(a.seed, i, t) * 2 * Math.PI
    bolt(out, a, x + Math.cos(angle) * 3, y + Math.sin(angle) * 2, angle, 3 + f * 4, t * 7 + i, c, f > 0.5 ? 2 : 1)
  }
  if (t % 2) spark(out, x + (rnd(a.seed, t, 3) - 0.5) * 8, y + (rnd(a.seed, t, 4) - 0.5) * 6, 1, c)
}

// A zigzag bolt from (x, y) toward `angle`, jagged anew for each salt
function bolt(out, a, x, y, angle, len, salt, c, thick = 2) {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const pts = [[x, y]]
  for (let k = 1; k <= 3; k++) {
    const jit = k < 3 ? (rnd(a.seed, k, salt) - 0.5) * 3.5 : 0
    pts.push([x + ux * len * (k / 3) - uy * jit, y + uy * len * (k / 3) + ux * jit])
  }
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1]
    const [x1, y1] = pts[k]
    if (thick > 1) {
      line(out, x0 + 1, y0, x1 + 1, y1, c)
      line(out, x0, y0 + 1, x1, y1 + 1, dark(c, 0.3))
    }
    line(out, x0, y0, x1, y1, WHITE)
  }
}

// Bolts crackle out of the hit while the core strobes, then sparks keep hopping about
function thunderBurst(out, age, t, a, g, x, y, c) {
  if (age < 0) return
  if (age < 9) {
    disc(out, x, y, age % 2 ? 2 : 3, age % 2 ? c : WHITE)
    for (let i = 0; i < 6; i++) {
      if ((age + i) % 4 === 3) continue
      const angle = (i / 6) * 2 * Math.PI + rnd(a.seed, i, age) * 0.6
      bolt(out, a, x, y, angle, 6 + rnd(a.seed, i, age + 30) * 5 * (age < 6 ? 1 : 0.5), age * 13 + i, c)
    }
  }
  if (age >= 8 && age < 20) {
    for (let i = 0; i < 3; i++) {
      const k = Math.floor((age + i) / 2)
      if ((age + i) % 3 === 0) continue
      const px = x + (rnd(a.seed, i, k + 90) - 0.5) * 12
      const py = y + (rnd(a.seed, i, k + 91) - 0.5) * 8
      if (age < 14 && (age + i) % 2) bolt(out, a, px, py, rnd(a.seed, i, k + 92) * 2 * Math.PI, 3, k * 5 + i, c, 1)
      else spark(out, px, py, 1, c)
    }
  }
}

// Each element's aura and burst, the glow it casts on the body, and whether the hit
// keeps jolting the mon afterward
const ELEMENTS = {
  fire: { aura: fireAura, burst: fireBurst, glow: 0xff9a40 },
  ice: { aura: iceAura, burst: iceBurst, glow: 0xb8f0ff },
  thunder: { aura: thunderAura, burst: thunderBurst, glow: 0xfff070, jolt: true },
}

// Charge a fist wrapped in an element, lunge, and drive it into the target, where the
// element bursts. The element paints the aura, the burst, and what lingers after.
function elementalPunch(kind) {
  const el = ELEMENTS[kind]
  return (out, t, a, g, c) => {
    const H = PUNCH_HIT
    const pal = tones(c)
    const fy = Math.round(lerp(g.cy, g.target.y, 0.45))
    const edge = frontAt(g, fy)
    const gap = Math.abs(g.target.x - edge)
    const far = clamp(gap - 8, 0, 7)
    const body = Math.round(keys(t, [[0, 0], [5, -2, easeOut], [PUNCH_LUNGE, -2], [H, far, easeIn], [H + 3, far], [H + 11, 0]]))
    out.dx = g.side * body + (t >= 6 && t < PUNCH_LUNGE ? tremble(t) : 0)
    if (t < PUNCH_LUNGE) {
      const f = easeOut(phase(t, 0, 5))
      out.sy = 1 - 0.06 * f
      out.sx = 1 + 0.04 * f
      if (t >= 3) out.shade = tint(el.glow, t % 2 ? 0.3 : 0.12)
    } else if (t < H) {
      out.sx = 1.08
      speedLines(out, t, g, g.side * body, 0, el.glow)
    }
    if (t === H) out.shade = tint(WHITE, 0.5)
    if (el.jolt && t > H && t < H + 8) out.shade = tint(el.glow, t % 2 ? 0.5 : 0.15)
    if (t === H) out.shake = [g.side * 2, 0]
    if (t === H + 1) out.shake = [-g.side, el.jolt ? 1 : 0]
    if (el.jolt && t > H + 1 && t < H + 6) out.shake = [t % 2 ? g.side : 0, 0]
    out.skew = tilt(g, out.dy, keys(t, [[0, 0], [5, -2, easeOut], [PUNCH_LUNGE, -2], [H, 3, easeIn], [H + 3, 2], [H + 10, 0]]))

    // A small fist held at the body while charging, then the full fist reaches the target
    const ext = Math.round(keys(t, [[PUNCH_LUNGE, 5], [H, gap - far, easeIn], [H + 2, gap - far], [H + 5, 5, easeIn]]))
    const fx = edge + g.side * (body + ext)
    const rows = t < PUNCH_LUNGE ? FIST_S : FIST_M
    const mid = fx - g.side * (rows[0].length >> 1)
    if (t >= 1 && t < H) el.aura(out, t, a, mid, fy, c, phase(t, 1, PUNCH_LUNGE))
    if (t >= 2 && t < H + 5 && !(t >= H + 3 && t % 2)) art(out, rows, t === H ? solid(WHITE) : pal, fx, fy, g.side)
    el.burst(out, t - H, t, a, g, g.target.x, fy, c)
  }
}

const KICK_SWING = 12
const KICK_HIT = 16

// Lean far back and gather power in the leg, then whip a huge kick over the top in a
// sweeping arc into a heavy hit with a flash, a burst, debris, and a hard shake
function megakick(out, t, a, g, c) {
  const H = KICK_HIT
  const pal = tones(c)
  const hx = g.target.x
  const hy = g.target.y - 1
  const hipY = Math.round(lerp(g.cy, g.bottom, 0.35))
  const edge = frontAt(g, hipY)
  const far = clamp(Math.abs(hx - edge) - 7, 0, 7)
  const lean = Math.round(keys(t, [[0, 0], [7, -3, easeOut], [KICK_SWING, -3], [H, far, easeIn], [H + 4, far], [H + 12, -1], [H + 16, 0]]))
  out.dx = g.side * lean + (t >= 8 && t < KICK_SWING ? tremble(t) : 0)
  if (t < KICK_SWING) {
    const f = easeOut(phase(t, 0, 7))
    out.sy = 1 - 0.1 * f
    out.sx = 1 + 0.06 * f
    if (t >= 8) out.shade = tint(c, t % 2 ? 0.3 : 0.1)
  } else if (t < H) {
    out.sx = 1.1
    out.sy = 0.96
    out.dy = -1
    speedLines(out, t, g, g.side * lean, -1, c)
  } else if (t < H + 2) {
    out.sx = 0.92
    out.sy = 1.04
  } else if (t >= H + 8 && t < H + 14) {
    out.dy = -Math.round(Math.sin(Math.PI * phase(t, H + 8, H + 14)) * 2)
  }
  if (t === H) out.shade = tint(WHITE, 0.5)
  if (t >= H && t < H + 4) out.shake = [[2 * g.side, 0], [-2 * g.side, 1], [g.side, 0], [0, -1]][t - H]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [7, -3, easeOut], [KICK_SWING, -3], [H, 2, easeIn], [H + 3, 2], [H + 10, 0]]))

  // Power pools at the foot, then the foot comes over the top in a huge arc onto the target
  const foot = frontAt(g, g.bottom - 1) + g.side * (lean + 1)
  if (t < KICK_SWING) {
    gather(out, t, a, 2, 11, foot, g.bottom - 2, c, 8)
    if (t >= 5) ball(out, foot, g.bottom - 2, 1 + (t % 2) + (t >= 9 ? 1 : 0), light(c, 0.3))
  }
  const pivot = edge + g.side * far
  const rx = Math.max(4, Math.abs(hx - pivot))
  const ry = Math.max(3, Math.min(rx * 1.1, hipY - 1))
  const end = Math.atan2((hy - hipY) / ry, 1)
  const from = -Math.PI / 2 - 0.5
  if (t >= KICK_SWING && t < H + 5) {
    const tip = t < H ? lerp(from, end, (t - KICK_SWING + 1) / (H - KICK_SWING + 1)) : end
    const tail = t < H ? from : lerp(from, end, phase(t, H, H + 5))
    swoosh(out, pivot, hipY, rx, ry, toward(g, tail), toward(g, tip), 4, c)
    if (t <= H + 1) {
      const bx = pivot + rx * Math.cos(toward(g, tip))
      const by = hipY + ry * Math.sin(toward(g, tip))
      art(out, BOOT, t === H ? solid(WHITE) : pal, Math.round(bx + g.side * 2), by, g.side)
    }
  }
  slam(out, t - H, hx + g.side, hy, 9, c)
  chips(out, t, a, g, H, hx, hy, 12, c, { power: 1.3 })
  smoke(out, t, a, H + 5, hx, hy, 4)
}

const SWEEP_FROM = 5
const SWEEP_HIT = 10

// Drop into a crouch, whirl, and sweep a kick low along the ground, raking up dust
// into a flat hit at the target's feet, then rise and step back
function lowkick(out, t, a, g, c) {
  const H = SWEEP_HIT
  const hy = g.ground - 2
  const edge = frontAt(g, g.bottom - 2)
  const hx = g.target.x
  const far = clamp(Math.abs(hx - edge) - 6, 0, 8)
  const body = Math.round(keys(t, [[0, 0], [SWEEP_FROM, -1, easeOut], [H, far, easeIn], [H + 4, far], [H + 12, 0]]))
  out.dx = g.side * body
  const crouch = keys(t, [[0, 0], [SWEEP_FROM, 1, easeOut], [H + 4, 1], [H + 10, 0]])
  out.sy = 1 - 0.16 * crouch
  out.sx = 1 + 0.08 * crouch
  if (t === SWEEP_FROM + 1 || t === SWEEP_FROM + 2) out.flipX = true
  if (t >= H + 8 && t < H + 13) out.dy = -Math.round(Math.sin(Math.PI * phase(t, H + 8, H + 13)) * 2)
  if (t >= SWEEP_FROM + 1 && t < H) speedLines(out, t, g, g.side * body, 2, c, 3)
  if (t === H) out.shake = [g.side, 0]
  if (t === H + 1) out.shake = [0, 1]
  out.skew = tilt(g, out.dy, 2 * crouch)

  // A flat crescent along the ground, swept from under the body out to the hit
  const radius = Math.max(4, Math.abs(hx - (edge + g.side * far)) + 3)
  const pivot = hx - g.side * radius
  const from = 2.9
  const end = 0.1
  emit(t, { count: 8, start: SWEEP_FROM + 1, gap: 0.5, life: 9 }, (i, age, f) => {
    const born = SWEEP_FROM + 1 + i * 0.5
    const angle = lerp(from, end, easeIn((born - SWEEP_FROM + 1) / (H - SWEEP_FROM + 1)))
    const x = pivot + radius * Math.cos(toward(g, angle))
    puff(out, x + g.side * age * 0.4, g.ground - 1 - age * 0.25, 0.6 + 1.3 * Math.sin(Math.PI * f), mix(DUST, 0x8a7c66, f), a.seed + i)
  })
  dust(out, t, a, H, hx, g.ground - 1, 6, 0, { size: 1.8 })
  if (t >= SWEEP_FROM && t < H + 5) {
    const tip = t < H ? lerp(from, end, easeIn((t - SWEEP_FROM + 1) / (H - SWEEP_FROM + 1))) : end
    const tail = t < H ? from : lerp(from, end, phase(t, H, H + 5))
    swoosh(out, pivot, hy - 1, radius, 2.5, toward(g, tail), toward(g, tip), 3.5, c)
  }
  if (t - H >= 0 && t - H < 4) pow(out, hx, hy, [5, 7, 6, 4][t - H], t === H ? WHITE : c, { flat: 0.5, turn: (t - H) * 0.5 })
  chips(out, t, a, g, H, hx, hy, 6, ROCK, { power: 0.7, life: 12 })
}

const KICKS = [8, 16]

// Hop in with a high kick, whirl around, and snap a low kick, two quick hits that
// each land with their own burst and jolt
function doublekick(out, t, a, g, c) {
  const pal = tones(c)
  const legY = Math.round(lerp(g.cy, g.bottom, 0.5))
  const edge = frontAt(g, legY)
  const gap = Math.abs(g.target.x - edge)
  const far = clamp(gap - 7, 0, 7)
  const [k1, k2] = KICKS
  const hits = [{ x: g.target.x, y: g.target.y - 3 }, { x: g.target.x - g.side, y: g.target.y + 1 }]
  const body = Math.round(keys(t, [[0, 0], [3, -1, easeOut], [k1, far, easeOut], [k1 + 2, far], [k1 + 5, far - 2], [k2, far + 1, easeIn], [k2 + 3, far + 1], [k2 + 11, 0]]))
  out.dx = g.side * body
  if (t < 3) out.sy = 1 - 0.08 * phase(t, 0, 3)
  else if (t < k1) out.dy = -Math.round(Math.sin(Math.PI * phase(t, 3, k1 + 1)) * 2)
  else if (t >= k1 + 3 && t < k1 + 6) out.flipX = true
  else if (t >= k2 + 4 && t < k2 + 11) out.dy = -Math.round(Math.sin(Math.PI * phase(t, k2 + 4, k2 + 11)) * 3)
  if (t === k2 - 1 || t === k2) out.sx = 1.08
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [3, 1], [k1 - 1, -2], [k1 + 2, -2], [k1 + 4, 0], [k2 - 1, -2], [k2 + 2, -2], [k2 + 6, 0]]))

  KICKS.forEach((k, n) => {
    const hit = hits[n]
    const from = edge + g.side * (body + 1)
    if (t >= k - 3 && t < k + 3) {
      const fx = Math.round(lerp(from, hit.x, easeOut(phase(t, k - 3, k))))
      const fy = Math.round(lerp(legY, hit.y, phase(t, k - 3, k)))
      if (t <= k) streak(out, from, legY, fx - g.side * 5, fy, 2, c)
      if (t < k + 2 || t % 2) art(out, BOOT, t === k ? solid(WHITE) : pal, fx + g.side, fy, g.side)
    }
    const age = t - k
    if (age === 0) out.shake = [g.side * (n + 1), 0]
    if (age >= 0 && age < 5) pow(out, hit.x, hit.y, [4, 5, 4, 3, 2][age] + n, age === 0 ? WHITE : c, { turn: n * 0.5 + age * 0.25 })
    if (age >= 1 && age < 5) shockRing(out, hit.x, hit.y, 4 + age + n, c, phase(age, 1, 5))
    chips(out, t, a, g, k, hit.x, hit.y, 4 + n * 3, c, { power: 0.8 + n * 0.3, salt: n * 11 })
  })
}

const HJK_LEAP = 7
const HJK_DIVE = 15
const HJK_HIT = 20

// Crouch, spring clean off the top of the strip, and come screaming back down in a
// diving kick along a bright streak that ends in a crash, then hop home
function hijumpkick(out, t, a, g, c) {
  const H = HJK_HIT
  const pal = tones(c)
  const footY = g.bottom - 1
  const edge = frontAt(g, footY - 2)
  const far = clamp(Math.abs(g.target.x - edge) - 2, 0, 12)
  const high = g.bottom + 6
  const apex = Math.round(far * 0.25)
  const dxAt = (k) => Math.round(keys(k, [[0, 0], [5, -1, easeOut], [HJK_LEAP, -1], [HJK_LEAP + 5, apex, easeOut], [HJK_DIVE, apex], [H, far, easeIn], [H + 5, far], [H + 15, 0]]))
  const dyAt = (k) => Math.round(keys(k, [[HJK_LEAP, 0], [HJK_LEAP + 5, -high, easeOut], [HJK_DIVE, -high], [H, 0, easeIn]]))
  out.dx = g.side * dxAt(t)
  out.dy = dyAt(t)
  const trail = () => [1, 2].map((k) => ghost(g.side * dxAt(t - k), dyAt(t - k), light(c, 0.2 * k), 0.4 + 0.2 * k))
  if (t < HJK_LEAP) {
    const f = easeOut(phase(t, 0, 5))
    out.sy = 1 - 0.18 * f
    out.sx = 1 + 0.1 * f
    if (t >= 4) out.shade = tint(c, t % 2 ? 0.3 : 0.1)
  } else if (t < HJK_LEAP + 3) {
    out.sy = 1.15
    out.sx = 0.9
    out.ghosts = trail()
  } else if (t >= HJK_DIVE && t < H) {
    out.sy = 1.08
    out.sx = 0.94
    out.ghosts = trail()
  } else if (t >= H && t < H + 3) {
    out.sy = [0.8, 0.86, 0.94][t - H]
    out.sx = [1.14, 1.08, 1.03][t - H]
  } else if (t >= H + 5 && t < H + 15) {
    out.dy = -Math.round(Math.sin(Math.PI * phase(t, H + 5, H + 15)) * 4)
  } else if (t === H + 15) {
    out.sy = 0.9
    out.sx = 1.05
  }
  if (t === H) out.shade = tint(WHITE, 0.5)
  if (t >= H && t < H + 4) out.shake = [[2 * g.side, 1], [-2 * g.side, -1], [g.side, 1], [0, 0]][t - H]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [5, 1], [HJK_LEAP, 1], [HJK_LEAP + 1, 0], [HJK_DIVE, 0], [HJK_DIVE + 1, 3], [H, 3], [H + 3, 0]]))

  const footX = (k) => edge + g.side * (dxAt(k) + 1)
  if (t >= 3 && t < HJK_LEAP) ball(out, footX(t), footY, 1 + (t % 2), light(c, 0.3))
  dust(out, t, a, HJK_LEAP, footX(HJK_LEAP), g.ground - 1, 4, 0, { size: 1.4 })
  // A glint at the top of the strip while the mon is out of sight
  if (t >= HJK_LEAP + 4 && t < HJK_DIVE) spark(out, footX(t), 1, t % 2 ? 1 : 2, c)
  if (t >= HJK_DIVE && t <= H + 3) {
    const k = Math.min(t, H)
    const x0 = footX(HJK_DIVE) - g.side * 2
    const y0 = footY - high
    const x1 = footX(k)
    const y1 = footY + dyAt(k)
    const fade = phase(t, H, H + 3)
    if (fade < 1) streak(out, lerp(x0, x1, fade), lerp(y0, y1, fade), x1, y1, 3, c, back)
    if (t < H) art(out, BOOT, pal, x1 + g.side * 3, y1, g.side)
  }
  const hx = footX(H) + g.side * 2
  slam(out, t - H, hx, g.ground - 2, 9, c)
  if (t >= H && t < H + 10) quake(out, hx, g.ground - 1, 3 + (t - H) * 1.6, c, phase(t, H, H + 10))
  chips(out, t, a, g, H, hx, g.ground - 2, 10, ROCK, { power: 1.3 })
  dust(out, t, a, H, hx, g.ground - 1, 8, 0, { size: 2 })
}

const TOSS_LEAP = 7
const TOSS_FALL = 22
const TOSS_SLAM = 26

// Grab hold and blast up out of view in a spin while a shadow marks the landing spot,
// then slam down with an earth-shaking crash, shockwaves, and flying rocks, and walk home
function seismictoss(out, t, a, g, c) {
  const S = TOSS_SLAM
  const edge = g.side > 0 ? g.right : g.left
  const room = g.side > 0 ? g.columns - 1 - edge : edge
  const land = clamp(Math.abs(g.target.x - edge) + 3, 0, room)
  const high = g.bottom + 6
  const width = g.right - g.left + 1
  const landX = g.cx + g.side * land
  const dxAt = (k) => Math.round(keys(k, [[0, 0], [4, 1, easeOut], [TOSS_LEAP, 1], [TOSS_LEAP + 5, land * 0.3], [TOSS_FALL, land], [S + 10, land], [S + 22, 0]]))
  const dyAt = (k) => Math.round(keys(k, [[TOSS_LEAP, 0], [TOSS_LEAP + 5, -high, easeIn], [TOSS_FALL, -high], [S, 0, easeIn]]))
  const spunAt = (k) => k >= TOSS_LEAP && k < TOSS_LEAP + 5 && k % 2 === 1
  out.dx = g.side * dxAt(t)
  out.dy = dyAt(t)
  if (t < TOSS_LEAP) {
    const f = easeOut(phase(t, 0, 4))
    out.sy = 1 - 0.14 * f
    out.sx = 1 + 0.08 * f
    if (t >= 4) out.dx += tremble(t)
  } else if (t < TOSS_LEAP + 5) {
    // Spinning afterimages trail the launch, each facing the way the body did then
    out.sy = 1.12
    out.sx = 0.92
    out.flipX = spunAt(t)
    if (t >= TOSS_LEAP + 2) out.ghosts = [1, 2].map((k) => ({ ...ghost(g.side * dxAt(t - k), dyAt(t - k), light(c, 0.2 * k), 0.4 + 0.2 * k), flip: spunAt(t - k) }))
  } else if (t >= TOSS_FALL && t < S) {
    out.sy = 1.1
    out.sx = 0.92
  } else if (t >= S && t < S + 3) {
    out.sy = [0.7, 0.8, 0.92][t - S]
    out.sx = [1.24, 1.14, 1.05][t - S]
  } else if (t >= S + 3 && t < S + 7) {
    out.dy = -Math.round(Math.sin(Math.PI * phase(t, S + 3, S + 7)) * 2)
  }
  if (t === S) out.shade = tint(WHITE, 0.6)
  if (t >= S && t < S + 6) out.shake = [[2, 1], [-2, -1], [2, 0], [-1, 1], [1, 0], [0, 0]][t - S]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [4, 2, easeOut], [TOSS_LEAP, 2], [TOSS_LEAP + 1, 0]]))

  dust(out, t, a, TOSS_LEAP, g.cx, g.ground - 1, 6, 0, { size: 1.8, gap: 0.4, life: 8 })
  // High above, the mon arcs over as a spinning twinkle
  if (t >= TOSS_LEAP + 4 && t < TOSS_FALL + 1) {
    const f = phase(t, TOSS_LEAP + 4, TOSS_FALL)
    const sx = lerp(g.cx + g.side, landX, f)
    spark(out, sx, 1, t % 2 ? 1 : 2, t % 4 < 2 ? c : WHITE)
    dot(out, sx - g.side * 2, 1, light(c, 0.3))
  }
  if (t >= TOSS_LEAP + 4 && t < S) landingMark(out, t, g, landX, width, phase(t, TOSS_LEAP + 4, S), c)
  if (t >= TOSS_FALL - 2 && t < S) fallWind(out, t, landX, g.top + out.dy, width, c)
  const age = t - S
  if (age >= 0 && age < 4) pow(out, landX, g.ground - 2, [8, 11, 10, 7][age], age === 0 ? WHITE : c, { flat: 0.55, inner: 0.4, turn: age * 0.5 })
  if (age >= 0 && age < 12) quake(out, landX, g.ground - 1, 4 + age * 2.2, c, age / 12)
  if (age >= 3 && age < 14) quake(out, landX, g.ground - 1, 3 + (age - 3) * 2.2, light(c, 0.3), (age - 3) / 11)
  dust(out, t, a, S, landX, g.ground - 1, 8, 0, { size: 2, life: 14, gap: 0.5 })
  rockSpikes(out, age, g, landX, width)
  chips(out, t, a, g, S, landX, g.ground - 2, 14, ROCK, { power: 1.6, life: 18 })
}

// A shadow on the ground that grows as the mon drops toward it, under blinking chevrons
function landingMark(out, t, g, x, width, f, c) {
  const half = lerp(2, width * 0.45, easeIn(f))
  for (let px = -Math.ceil(half); px <= Math.ceil(half); px++) {
    if (Math.abs(px) > half - 1 && (px + t) % 2) continue
    back(out, x + px, g.ground, SHADOW)
    if (Math.abs(px) < half * 0.7) back(out, x + px, g.ground - 1, SHADOW)
  }
  if (f > 0.3 && t % 4 < 2) {
    const cy = g.ground - 4 - (t % 2)
    for (const [ox, oy] of [[-1, -1], [0, 0], [1, -1], [-2, -2], [2, -2]]) dot(out, x + ox, cy + oy, oy === 0 ? WHITE : c)
  }
}

// Wind streaking up past a body falling onto x, its top at row top
function fallWind(out, t, x, top, width, c) {
  for (let k = 0; k < 4; k++) {
    const px = x + Math.round((k - 1.5) * width * 0.25)
    const py = top - 2 - ((k * 3 + t) % 4)
    for (let d = 0; d < 4; d++) dot(out, px, py - d, d === 0 ? WHITE : d < 2 ? light(c, 0.5) : c)
  }
}

// Rocks jut out of the ground on both sides of x as a shockwave rolls past them
function rockSpikes(out, age, g, x, width) {
  for (let k = 0; k < 4; k++) {
    for (const s of [-1, 1]) {
      const d = width * 0.3 + 3 + k * 4
      const up = age - d / 2.2
      if (up < 0 || up >= 7) continue
      const h = Math.round([3, 5, 5, 4, 3, 2, 1][Math.floor(up)] * (1 - k * 0.15))
      const rx = Math.round(x + s * d)
      for (let y = 0; y < h; y++) {
        const top = y === h - 1
        dot(out, rx - 1, g.ground - y, top ? ROCK : dark(ROCK, 0.2))
        dot(out, rx, g.ground - y, top ? light(ROCK, 0.5) : ROCK)
        if (y < h - 1) dot(out, rx + 1, g.ground - y, dark(ROCK, 0.45))
      }
    }
  }
}

const ROLL_FROM = 6
const ROLL_HITS = [14, 20]
const RECOIL = 21

// Curl up and tumble forward into the target, slamming it twice, then reel back from
// the recoil, flashing hurt, and stagger home
function submission(out, t, a, g, c) {
  const edge = frontAt(g, g.cy)
  const far = clamp(Math.abs(g.target.x - edge) - 2, 0, 10)
  const [h1, h2] = ROLL_HITS
  const at = (k) => Math.round(keys(k, [[0, 0], [5, -1, easeOut], [ROLL_FROM, -1], [h1, far, easeIn], [h1 + 3, far - 3, easeOut], [h2, far, easeIn], [RECOIL + 1, far], [RECOIL + 7, far - 6, easeOut], [RECOIL + 18, 0]]))
  out.dx = g.side * at(t)
  if (t < ROLL_FROM) {
    const f = easeOut(phase(t, 0, 5))
    out.sy = 1 - 0.12 * f
    out.sx = 1 + 0.06 * f
  } else if (t < RECOIL) {
    // A roll in quarter turns: upright, on its side, upside down, on its other side
    const quarter = Math.floor((t - ROLL_FROM) / 2) % 4
    out.flipX = quarter >= 2
    out.flipY = quarter >= 2
    if (quarter % 2) {
      out.sy = 0.7
      out.sx = 1.18
    }
    out.dy = quarter % 2 ? 0 : -1
    speedLines(out, t, g, out.dx, 0, c, 3)
  } else if (t < RECOIL + 7) {
    out.dy = -Math.round(Math.sin(Math.PI * phase(t, RECOIL, RECOIL + 7)) * 3)
    out.shade = t % 2 ? tint(HURT, 0.5) : null
    if (t < RECOIL + 4) out.hidden = t % 2 === 0
  } else if (t < RECOIL + 18) {
    out.dx += Math.floor(t / 3) % 2 ? g.side : 0
    if (t < RECOIL + 12) out.shade = tint(HURT, 0.3 * (1 - phase(t, RECOIL + 7, RECOIL + 12)))
  }
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [5, 2, easeOut], [ROLL_FROM, 0], [RECOIL, 0], [RECOIL + 1, -3], [RECOIL + 7, -2], [RECOIL + 14, 0]]))
  // Dust kicks up wherever the tumbling body hits the ground
  emit(t, { count: 7, start: ROLL_FROM + 1, gap: 2, life: 6 }, (i, age, f) => {
    const x = g.cx + g.side * at(ROLL_FROM + 1 + i * 2)
    puff(out, x - g.side * age * 0.6, g.ground - 1 - age * 0.3, 0.6 + 1.2 * Math.sin(Math.PI * f), mix(DUST, 0x8a7c66, f), a.seed + i)
  })
  ROLL_HITS.forEach((h, n) => {
    const hx = edge + g.side * (far + 2)
    const age = t - h
    if (age === 0) out.shake = [g.side * (n + 1), n]
    if (age === 1) out.shake = [-g.side, 0]
    smack(out, age, hx, g.cy - 1 + n * 2, c, 1 + n * 0.2)
    chips(out, t, a, g, h, hx, g.cy, 5, c, { power: 0.9, salt: n * 13, life: 10 })
  })
  // Pain stars circle the head while it reels
  if (t >= RECOIL + 2 && t < RECOIL + 18) {
    const cx = g.cx + out.dx
    for (let k = 0; k < 3; k++) {
      const angle = t * 0.6 + (k * 2 * Math.PI) / 3
      const px = cx + Math.cos(angle) * 5
      const py = g.top + out.dy - 1 + Math.sin(angle) * 1.5
      if ((t + k) % 3) spark(out, px, py, 1, HURT)
      else dot(out, px, py, WHITE)
    }
  }
}

const CHOP_RAISE = 7
const CHOP_HIT = 9

// Rise up with the hand held high and glinting, then chop down in a sharp diagonal
// streak of light that ends in a crisp cut across the target
function karatechop(out, t, a, g, c) {
  const H = CHOP_HIT
  const mid = mix(c, 0x6aa8ff, 0.6)
  const rim = mix(c, 0x2a50b8, 0.8)
  const hx = g.target.x
  const hy = g.target.y - 1
  const edge = frontAt(g, g.mouth.y)
  const far = clamp(Math.abs(hx - edge) - 6, 0, 7)
  const lean = Math.round(keys(t, [[0, 0], [CHOP_RAISE, -1, easeOut], [H, far, easeIn], [H + 6, far], [H + 14, 0]]))
  out.dx = g.side * lean
  if (t < CHOP_RAISE) {
    const f = easeOut(phase(t, 0, CHOP_RAISE))
    out.sy = 1 + 0.06 * f
    out.sx = 1 - 0.03 * f
    if (t >= 3) out.dy = -1
  } else if (t < H) {
    out.sx = 1.06
  } else if (t < H + 6) {
    out.sy = [0.86, 0.9, 0.92, 0.93, 0.95, 0.97][t - H]
    out.sx = [1.08, 1.05, 1.04, 1.03, 1.02, 1.01][t - H]
  }
  if (t === H) out.shake = [g.side, 1]
  if (t === H + 1) out.shake = [0, -1]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [CHOP_RAISE, -1, easeOut], [H, 3, easeIn], [H + 6, 2], [H + 12, 0]]))

  // The raised hand is a blade of light over the front of the head
  const handX = edge + g.side * (lean + 1)
  const handY = g.top + 2
  if (t >= 2 && t < CHOP_RAISE + 1) {
    const pal = { k: rim, o: mid, l: light(mid, 0.5), h: WHITE }
    art(out, BLADE, pal, handX + g.side, handY, g.side)
    if (t >= 4) spark(out, handX + g.side, handY - 3, t % 2 ? 2 : 1, mid)
  }
  // The chop streaks from above and behind the hit, through it, and on past it
  const x0 = hx - g.side * 7
  const y0 = Math.max(0, hy - 10)
  const x1 = hx + g.side * 3
  const y1 = Math.min(g.ground, hy + 4)
  if (t >= CHOP_RAISE && t < H + 10) {
    const grow = t < H ? (t - CHOP_RAISE + 1) / (H - CHOP_RAISE + 1) : 1
    const fade = phase(t, H + 2, H + 10)
    const thick = t <= H + 1 ? 3 : 3 - fade * 2
    const col = fade < 0.3 ? mid : fade < 0.7 ? rim : dark(rim, 0.3)
    streak(out, lerp(x0, x1, fade * 0.7), lerp(y0, y1, fade * 0.7), lerp(x0, x1, grow), lerp(y0, y1, grow), thick, col)
  }
  const age = t - H
  if (age >= 0 && age < 4) {
    // A crisp cut, a bright bar across the streak with a white pinpoint
    const n = Math.hypot(x1 - x0, y1 - y0)
    const nx = -(y1 - y0) / n
    const ny = (x1 - x0) / n
    const len = [5, 7, 6, 3][age]
    line(out, hx - nx * len + 0.6, hy - ny * len + 0.6, hx + nx * len + 0.6, hy + ny * len + 0.6, rim)
    line(out, hx - nx * len, hy - ny * len, hx + nx * len, hy + ny * len, age < 2 ? WHITE : mid)
    disc(out, hx, hy, age < 2 ? 2 : 1, WHITE)
  }
  // Splinters of light fly off the cut
  emit(t, { count: 6, start: H, life: 8 }, (i, k, f) => {
    const angle = Math.atan2(y1 - y0, x1 - x0) + (i % 2 ? 1 : -1) * (Math.PI / 2) + (rnd(a.seed, i, 80) - 0.5) * 1.2
    const d = 2 + k * (1 + rnd(a.seed, i, 81) * 0.6)
    const px = hx + Math.cos(angle) * d
    const py = hy + Math.sin(angle) * d
    line(out, px, py, px + Math.cos(angle), py + Math.sin(angle), f < 0.5 ? WHITE : mid)
  })
}

export const STRIKES = {
  pound: { ticks: 28, color: 0xffe36e, draw: pound },
  doubleslap: {
    ticks: 36,
    color: 0xffe36e,
    pose: (t) => ({ stride: t < 5 || (t >= LAST_SLAP + 4 && t < LAST_SLAP + 11) }),
    draw: doubleslap,
  },
  megapunch: { ticks: 32, color: 0xffe36e, draw: megapunch },
  cometpunch: { ticks: 40, color: 0xffe36e, draw: cometpunch },
  firepunch: { ticks: 36, color: 0xff7a2e, draw: elementalPunch('fire') },
  icepunch: { ticks: 36, color: 0x9ae6ff, draw: elementalPunch('ice') },
  thunderpunch: { ticks: 36, color: 0xffe14a, draw: elementalPunch('thunder') },
  megakick: { ticks: 40, color: 0xffe36e, draw: megakick },
  lowkick: { ticks: 30, color: 0xffe36e, draw: lowkick },
  doublekick: { ticks: 34, color: 0xffe36e, draw: doublekick },
  hijumpkick: { ticks: 40, color: 0xffe36e, draw: hijumpkick },
  seismictoss: {
    ticks: 52,
    color: 0xffe36e,
    pose: (t) => ({ stride: t >= TOSS_SLAM + 10 && t < TOSS_SLAM + 22 }),
    draw: seismictoss,
  },
  submission: { ticks: 44, color: 0xffe36e, draw: submission },
  karatechop: { ticks: 30, color: 0xffffff, draw: karatechop },
}
