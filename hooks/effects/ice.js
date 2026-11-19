// Ice moves

import {
  WHITE, back, ball, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, keys, lean, lerp, light, line,
  mix, phase, plus, puff, rimGlow, rnd, spark, sparkles, stamp, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const GRAVITY = 0.3

// Ice tones: white, frost, the color, and a deep blue edge that holds on a light terminal
const iceTones = (c) => [WHITE, light(c, 0.5), c, mix(c, 0x2a5cb8, 0.6)]

// A paint that drops pixels outside the strip
const clipTo = (g) => (o, x, y, col) => {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px >= 0 && px < g.columns && py >= 0 && py <= g.ground) dot(o, px, py, col)
}

// Every other pixel, for ice breaking up as it fades
const dotted = (o, x, y, col) => (Math.round(x) + Math.round(y)) % 2 && dot(o, x, y, col)

// A spike of ice from its root at x, y along (ux, uy), `wide` pixels to either side at
// the root. Its up and left flank catches the light, the other falls into deep blue.
function spike(out, x, y, ux, uy, len, wide, pal, paint = dot) {
  if (len < 0.5) return
  const d = Math.hypot(ux, uy) || 1
  const [vx, vy] = [ux / d, uy / d]
  const [nx, ny] = [-vy, vx]
  for (let s = 0; s <= len; s += 0.5) {
    const w = wide * (1 - s / (len + 0.5))
    for (let o = -w; o <= w + 0.01; o += 0.5) {
      const facing = (nx + ny) * Math.sign(o)
      const col = s > len - 1 ? WHITE : Math.abs(o) < 0.3 ? pal[1] : facing < 0 ? (Math.abs(o) > w - 0.5 ? WHITE : pal[1]) : Math.abs(o) > w - 0.5 ? pal[3] : pal[2]
      paint(out, x + vx * s + nx * o, y + vy * s + ny * o, col)
    }
  }
}

// Chips of ice thrown up and out from x, y, `age` ticks after, falling to the ground
function chips(out, a, g, x, y, age, count, salt, pal, speed = 1) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, salt) - 0.5) * 3.4
    const v = (0.6 + rnd(a.seed, i, salt + 1) * 0.9) * speed
    const px = x + Math.cos(angle) * v * age
    const py = Math.min(g.ground, y + Math.sin(angle) * v * age + 0.5 * GRAVITY * age * age)
    const col = age < 3 ? WHITE : i % 3 ? pal[1] : pal[3]
    dot(out, px, py, col)
    if (i % 3 === 0 && age < 6) dot(out, px + 1, py, pal[2])
  }
}

// A flake: a dot, a plus, or a plus with tips on the diagonals
function flake(out, x, y, size, pal, paint = dot) {
  if (size < 1) return paint(out, x, y, WHITE)
  plus(out, x, y, pal[1], WHITE, paint)
  if (size >= 2) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) paint(out, x + dx * 2, y + dy * 2, pal[2])
}

// A drift of snow on the ground at x, `w` to either side and h tall in the middle,
// lumpy along its top
function drift(out, a, g, x, w, h, pal, paint = dot) {
  for (let u = -w; u <= w; u++) {
    const lump = 0.6 * Math.sin(u * 1.3 + rnd(a.seed, 1, 9) * 6)
    const top = Math.round(h * (1 - (u / (w + 1)) ** 2) + (h > 1 ? lump : 0))
    for (let k = 0; k < top; k++) {
      const col = k === top - 1 ? WHITE : k === 0 ? pal[3] : u < 0 ? pal[1] : mix(pal[1], pal[2], 0.5)
      paint(out, x + u, g.ground - k, col)
    }
  }
}

const HAZE_IN = 14
const HAZE_RESET = 22
const HAZE_OUT = 32
const BANDS = 5
const ARROW_UP = ['..a..', '.aaa.', 'aaaaa', '.aaa.', '.aaa.']
const ARROW_DOWN = [...ARROW_UP].reverse()

// Facing out, ribbons of dark haze slide in from both sides, front and behind the mon,
// wiping its raised and lowered stats away as arrows that pop off and dissolve, then
// the ribbons drift on out
function haze(out, t, a, g, c) {
  const tones = [light(c, 0.35), c, dark(c, 0.3)]
  const thick = phase(t, 0, HAZE_IN) * (1 - phase(t, HAZE_OUT + 8, a.ticks - 2))
  if (t < a.ticks - 1) out.shade = tint(dark(c, 0.2), 0.35 * thick)
  if (t >= HAZE_RESET && t < HAZE_RESET + 4) out.dx = tremble(t)
  if (t >= HAZE_RESET && t < HAZE_RESET + 2) out.shade = tint(WHITE, 0.4)
  const span = g.columns + 12
  for (let b = 0; b < BANDS; b++) {
    const dir = b % 2 ? 1 : -1
    const yc = lerp(3, g.ground - 2, (b + 0.5) / BANDS)
    const head = easeOut(phase(t, b * 1.3, HAZE_IN + b)) * span
    const tail = easeIn(phase(t, HAZE_OUT + b, a.ticks - 2)) * span
    const paint = b % 2 ? dot : back
    for (let s = Math.floor(tail); s <= head; s++) {
      const x = dir > 0 ? s - 6 : g.columns + 5 - s
      if (x < 0 || x >= g.columns) continue
      const wave = Math.sin(x * 0.22 - t * 0.3 * dir + b * 1.7) * 1.6
      const th = 0.7 + 0.8 * Math.sin(x * 0.31 + t * 0.2 + b * 2.3) + rnd(a.seed, x, b) * 0.3
      const fray = Math.min(s - tail, head - s) < 4
      const thin = b % 2 === 1
      for (let dy = -Math.ceil(th); dy <= Math.ceil(th); dy++) {
        const y = Math.round(yc + wave + dy)
        if (y < 0 || y > g.ground) continue
        const edge = Math.abs(dy) >= th - 0.2
        if ((fray || (thin && edge)) && (x + y + (t >> 1)) % 2) continue
        paint(out, x, y, dy < 0 && edge ? tones[0] : dy > 0 && edge ? tones[2] : tones[1])
      }
    }
  }
  const arrows = [[-0.3, ARROW_UP, 0xff6a5a, 0], [0.3, ARROW_DOWN, 0x5a8aff, 2], [0, ARROW_UP, 0xff6a5a, 4]]
  for (const [off, art, col, delay] of arrows) {
    const age = t - HAZE_RESET - delay
    if (age < 0 || age >= 10) continue
    const x = Math.round(g.cx + off * (g.right - g.left) - 2)
    const y = Math.round(g.top + 2 - age * 0.8)
    if (y < 0) continue
    const fade = age >= 5
    stamp(out, x, y, art, { a: fade ? tones[0] : col }, false, fade ? dotted : dot)
  }
}

const ICYWIND_GUSTS = [5, 10, 15]
const ICYWIND_SPEED = 1.7
const ICYWIND_TAIL = 10

// Draw breath and blow three icy gusts that curl at their tips, ice crystals riding
// along, which swirl flakes around the target and leave it rimed in frost
function icywind(out, t, a, g, c) {
  const pal = iceTones(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const span = Math.max(4, Math.abs(tx - mx))
  const blowing = ICYWIND_GUSTS.some((s) => t - s >= 0 && t - s < 2)
  if (t < ICYWIND_GUSTS[0]) {
    const f = easeOut(phase(t, 0, ICYWIND_GUSTS[0]))
    out.dx = -g.side * Math.round(f)
    out.sy = 1 + 0.05 * f
  } else if (blowing) {
    out.dx = g.side
    out.skew = lean(g, g.side * 2)
    out.shade = tint(pal[1], 0.25)
  }
  ICYWIND_GUSTS.forEach((start, n) => {
    const age = t - start
    if (age < 0) return
    const d = 2 + age * ICYWIND_SPEED
    if (d > span + ICYWIND_TAIL + 4) return
    const rowAt = (dd) => lerp(my, ty, clamp(dd / span, 0, 1)) + [-3, 1, -1][n] * (1 - clamp(dd / span, 0, 1)) + Math.sin(dd * 0.45 + n) * 1.2
    for (let s = 0; s <= ICYWIND_TAIL; s++) {
      const dd = d - s
      if (dd < 1 || dd > span + 4) continue
      const col = s < 2 ? WHITE : s < 5 ? pal[1] : pal[2]
      ;(s > 7 ? dotted : dot)(out, mx + g.side * dd, rowAt(dd), col)
      if (s >= 2 && s < 7) dot(out, mx + g.side * dd, rowAt(dd) + 1, pal[3])
      if (s >= 3 && s < 9 && (s + t) % 2) dot(out, mx + g.side * (dd - 1), rowAt(dd) - 2, pal[1])
    }
    if (d <= span + 4) {
      const hx = mx + g.side * d
      const hy = rowAt(d)
      for (let k = 0; k <= 12; k++) {
        const th = (k / 12) * Math.PI * 1.6
        const r = 2.8 * (1 - th / (TAU * 2))
        dot(out, hx + g.side * r * Math.sin(th), hy - 2.8 + r * Math.cos(th), k < 3 ? WHITE : k < 7 ? pal[1] : pal[3])
      }
      for (let i = 0; i < 3; i++) {
        if ((t + i) % 3 === 0) continue
        const px = hx - g.side * (2 + i * 2.5)
        const py = rowAt(d - 2 - i * 2.5) + (i - 1) * 2
        if ((t + i) % 3 === 1) plus(out, px, py, pal[2], WHITE)
        else dot(out, px, py, WHITE)
      }
    }
    const k = age - (span - 2) / ICYWIND_SPEED
    if (k >= 0 && k < 8) {
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * TAU + t * 0.5 + n
        const r = 3 + k * 0.5
        flake(out, tx + Math.cos(angle) * r, ty + Math.sin(angle) * r * 0.8, k < 4 && i % 2 === 0 ? 1 : 0, pal)
      }
    }
  })
  const frosted = phase(t, ICYWIND_GUSTS[0] + span / ICYWIND_SPEED, ICYWIND_GUSTS[2] + span / ICYWIND_SPEED) * (1 - phase(t, a.ticks - 6, a.ticks - 1))
  if (frosted > 0) {
    const w = Math.round(2 + 4 * frosted)
    for (let x = tx - w; x <= tx + w; x++) dot(out, x, g.ground, (x + t) % 4 ? pal[1] : WHITE)
    if (t < a.ticks - 2) sparkles(out, t, a.seed, tx, ty, 9, 8, pal[2], 3)
  }
}

const POWDER_START = 5
const POWDER_STOP = 20

// A soft breath of powdery snow drifts out in a cloud, sprinkles down over the target,
// and piles into a little drift at its feet before melting away
function powdersnow(out, t, a, g, c) {
  const pal = iceTones(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const span = Math.max(4, Math.abs(tx - mx))
  if (t < POWDER_START) {
    out.sy = 1 + 0.04 * phase(t, 0, POWDER_START)
    out.dy = t >= 2 ? -1 : 0
  } else if (t < POWDER_STOP) {
    out.dx = t < POWDER_START + 3 ? g.side : 0
    out.sx = 1 + (t % 4 < 2 ? 0.03 : 0)
  }
  emit(t, { count: 44, start: POWDER_START, gap: 0.33, life: 18 }, (i, age) => {
    const trip = 8 + rnd(a.seed, i, 400) * 4
    const f = Math.min(1, age / trip)
    const fall = Math.max(0, age - trip)
    const spread = (rnd(a.seed, i, 401) - 0.5) * (1 + 9 * easeOut(f))
    const land = span + (rnd(a.seed, i, 402) - 0.5) * 12
    const x = mx + g.side * (1 + land * easeOut(f)) + Math.sin(age * 0.5 + i) * (0.6 + fall * 0.15)
    const y = Math.min(g.ground - 1, lerp(my, ty - 4, f) + spread + fall * 0.5)
    const r = 0.5 + rnd(a.seed, i, 403) * 1.1
    if (fall > 6 && (t + i) % 2) return
    if (r > 1.25 && fall < 2) puff(out, x, y, r, light(c, 0.3), i)
    else {
      dot(out, x, y + 1, pal[3])
      dot(out, x, y, WHITE)
    }
  })
  const pile = easeOut(phase(t, 14, 28)) * (1 - phase(t, a.ticks - 7, a.ticks - 1))
  if (pile > 0) drift(out, a, g, clamp(tx, 6, g.columns - 7), Math.round(3 + 3 * pile), 3 * pile, pal, t >= a.ticks - 5 ? dotted : dot)
  if (t >= 16 && t < a.ticks - 4 && t % 3 === 0) spark(out, tx + (rnd(a.seed, t, 404) - 0.5) * 8, g.ground - 2 - rnd(a.seed, t, 405) * 2, 1, pal[1])
}

const HAIL_START = 4
const HAIL_COUNT = 54
const HAIL_GAP = 0.65
const HAIL_MELT = 42

// Facing up, a pale overcast gathers over the strip and hailstones pelt down at a slant,
// bouncing off the ground and the mon, littering the ground with pellets that melt
function hail(out, t, a, g, c) {
  const pal = iceTones(c)
  const sky = phase(t, 0, 8) * (1 - phase(t, HAIL_MELT - 2, a.ticks - 2))
  for (let x = 0; x < g.columns; x++) {
    for (let y = 0; y <= 2; y++) {
      if (rnd(a.seed, x * 7 + y * 131 + (t >> 2) * 3, 500) > sky * (0.85 - y * 0.25)) continue
      dot(out, x, y, y === 2 ? 0x8494aa : (x + y) % 3 ? 0x6a7a92 : 0x9aaac0)
    }
  }
  const wind = rnd(a.seed, 0, 501) < 0.5 ? -1 : 1
  let bonked = false
  for (let i = 0; i < HAIL_COUNT; i++) {
    const age = t - HAIL_START - i * HAIL_GAP
    if (age < 0) continue
    const vy = 1.4 + rnd(a.seed, i, 502) * 0.6
    const vx = wind * (0.3 + rnd(a.seed, i, 503) * 0.2)
    const x0 = rnd(a.seed, i, 504) * (g.columns + 6) - 3
    const small = i % 3 === 0
    // Where it stops: the top of the mon if it falls onto it, or the ground
    let stop = g.ground - 1
    let onMon = false
    for (let y = 3; y < g.ground - 1; y++) {
      const fx = Math.round(x0 + (vx * (y - 3)) / vy)
      if (g.solid(fx, y + 1)) {
        stop = y
        onMon = true
        break
      }
    }
    const land = (stop - 3) / vy
    if (age < land) {
      const x = x0 + vx * age
      const y = 3 + vy * age
      dot(out, x - vx, y - 1.5, pal[1])
      if (!small) dot(out, x - vx * 2, y - 3, pal[3])
      stone(out, x, y, small, pal)
      continue
    }
    const k = age - land
    const lx = x0 + vx * land
    if (onMon && k < 1) bonked = true
    if (onMon) {
      if (k < 2) spark(out, lx, stop, 1, pal[1])
      if (k < 7) dot(out, lx - wind * k * 0.8 + (i % 2 ? 1 : -1) * k * 0.5, stop - 1.2 * k + 0.25 * k * k, k < 4 ? WHITE : pal[2])
      continue
    }
    const hop = Math.max(0, 1.3 * k - 0.35 * k * k)
    const rest = lx + vx * Math.min(k, 4) * 0.6
    if (t >= HAIL_MELT + (i % 4) && (t + i) % 2) continue
    if (t >= a.ticks - 2) continue
    if (hop > 0) stone(out, rest, stop - hop, small, pal)
    else dot(out, rest, g.ground, (i + (t >> 2)) % 3 ? pal[1] : WHITE)
    if (k < 1) {
      dot(out, lx - 1, g.ground, WHITE)
      dot(out, lx + 1, g.ground, WHITE)
    }
  }
  if (t < a.ticks - 1) {
    out.shade = tint(pal[1], 0.15 * sky)
    if (bonked) out.sy = 0.97
  }
}

// One hailstone: a 2 by 2 pellet lit from the top left, or a single small one
function stone(out, x, y, small, pal) {
  if (small) {
    dot(out, x, y + 1, pal[3])
    dot(out, x, y, WHITE)
    return
  }
  dot(out, x, y, WHITE)
  dot(out, x + 1, y, pal[1])
  dot(out, x, y + 1, pal[2])
  dot(out, x + 1, y + 1, pal[3])
}

const COLD_CREEP = 8
const COLD_ENCASE = 20
const COLD_SET = 30
const COLD_BREAK = 42

// Go deathly still as cold vapor rolls off the body, frost creeps along the ground to the
// target and a block of ice grows up around it, glints, cracks, and bursts apart
function sheercold(out, t, a, g, c) {
  const pal = iceTones(c)
  const clip = clipTo(g)
  const { x: tx0, y: ty } = g.target
  const tx = clamp(tx0, 8, g.columns - 9)
  const chill = phase(t, 0, COLD_CREEP) * (1 - phase(t, COLD_BREAK, a.ticks - 2))
  if (t < a.ticks - 1) out.shade = rimGlow(g, out, pal[1], 0.2 * chill, WHITE, 0.7 * chill)
  if (t < COLD_CREEP) out.sy = 1 - 0.04 * phase(t, 0, COLD_CREEP)
  else if (t < COLD_BREAK) out.sy = 0.96
  if (t >= 5 && t < COLD_CREEP) out.dx = tremble(t)
  emit(t, { count: 14, start: 1, gap: 2.4, life: 9 }, (i, age, f) => {
    const x = lerp(g.left, g.right, rnd(a.seed, i, 600)) + Math.sin(age * 0.6 + i) * 0.8
    const y = lerp(g.top + 2, g.bottom, rnd(a.seed, i, 601)) - age * 0.8
    if (y >= 1) puff(out, x, y, 0.6 + f * 0.8, light(c, 0.55), i, f > 0.6 ? dotted : dot)
  })

  // The frost runs along the ground from the feet to the target
  const foot = g.frontAt(g.bottom)
  const run = Math.abs(tx - foot)
  const reach = run * easeInOut(phase(t, COLD_CREEP, COLD_ENCASE)) + (t >= COLD_ENCASE ? 6 : 0)
  if (t >= COLD_CREEP && t < COLD_BREAK + 4) {
    for (let d = 0; d <= reach; d++) {
      const x = foot + g.side * d
      if (t >= COLD_BREAK && (x + t) % 2) continue
      clip(out, x, g.ground, (x + t) % 5 ? pal[1] : WHITE)
      if (d % 3 === 1) clip(out, x, g.ground - 1, pal[2])
      if (d % 6 === 4 && d < run - 3) clip(out, x, g.ground - 2, WHITE)
    }
  }

  // The block of ice over the target, growing up from the ground
  const half = g.foe ? Math.round((g.foe.right - g.foe.left) / 2) + 2 : 6
  const top = clamp(ty - 8, 2, g.ground - 6)
  const rise = easeOut(phase(t, COLD_ENCASE, COLD_SET))
  const lid = Math.round(lerp(g.ground, top, rise))
  if (t >= COLD_ENCASE && t < COLD_BREAK) {
    const glint = (t - COLD_SET) * 2.5 - 6
    for (let y = lid; y <= g.ground; y++) {
      for (let u = -half; u <= half; u++) {
        const x = tx + u
        const rim = Math.abs(u) === half || y === lid
        const shine = t >= COLD_SET && Math.abs(u + (y - lid) * 0.6 - glint) < 1
        if (rim) clip(out, x, y, y === lid ? WHITE : u < 0 ? pal[1] : pal[3])
        else if (shine) clip(out, x, y, WHITE)
        else if ((x + y * 2) % 3 === 0) clip(out, x, y, (u + y) % 7 === 0 ? WHITE : mix(pal[1], pal[2], 0.4))
      }
    }
    if (t >= COLD_BREAK - 5) {
      const cracks = Math.min(3, t - (COLD_BREAK - 5) + 1)
      for (let k = 0; k < cracks; k++) {
        let x = tx + (rnd(a.seed, k, 602) - 0.5) * half
        let y = lid + 1
        for (let s = 0; s < (g.ground - lid) / 2; s++) {
          const nx = x + (rnd(a.seed, k * 20 + s, 603) - 0.5) * 3
          line(out, x, y, nx, y + 2, pal[3], clip)
          x = nx
          y += 2
        }
      }
    }
  }
  const k = t - COLD_BREAK
  if (k < 0) return
  if (k < 4) out.shake = [[g.side * 2, 1], [-g.side * 2, -1], [g.side, 0], [-g.side, 0]][k]
  if (k < 2) disc(out, tx, (lid + g.ground) / 2, 4 - k, WHITE, clip)
  if (k < 4) burst(out, tx, (lid + g.ground) / 2, 8 - k, pal[2])
  for (let i = 0; i < 12; i++) {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, 604) - 0.5) * 3.6
    const v = 0.8 + rnd(a.seed, i, 605) * 1.1
    const x = tx + (rnd(a.seed, i, 606) - 0.5) * half * 2 + Math.cos(angle) * v * k
    const y = lerp(lid, g.ground, rnd(a.seed, i, 607)) + Math.sin(angle) * v * k + 0.5 * GRAVITY * k * k
    if (y > g.ground + 1 || k > 12) continue
    spike(out, x, Math.min(g.ground, y), Math.cos(angle + k * 0.5), Math.sin(angle + k * 0.5), 2 + (i % 3), 1, pal, clip)
  }
  if (k < 12) chips(out, a, g, tx, (lid + g.ground) / 2, k, 10, 608, pal, 1.3)
  emit(t, { count: 5, start: COLD_BREAK + 2, gap: 1.5, life: 10 }, (i, age, f) => {
    const y = g.ground - 2 - age * 0.6
    puff(out, tx + (rnd(a.seed, i, 609) - 0.5) * half * 2, y, 1 + f * 1.2, light(c, 0.5), i, f > 0.5 ? dotted : dot)
  })
}

const ICEFANG_SNAP = 12
const ICEFANG_CRACK = 25

// Frost motes swirl together into crystal fangs over the target, the mon lunges and
// they crunch shut, a star of ice bursts out from the bite, then cracks to pieces
function icefang(out, t, a, g, c) {
  const pal = iceTones(c)
  const far = clamp(g.reach - 10, 0, 5)
  const body = keys(t, [[0, 0], [7, -2, easeOut], [ICEFANG_SNAP - 3, -2], [ICEFANG_SNAP, far, easeIn], [ICEFANG_SNAP + 2, far - 1], [ICEFANG_SNAP + 4, far + 1, easeIn], [ICEFANG_CRACK, far], [33, 0]])
  out.dx = g.side * Math.round(body)
  out.dy = t >= ICEFANG_SNAP - 3 && t < ICEFANG_SNAP ? -1 : 0
  out.skew = lean(g, g.side * keys(t, [[0, 0], [7, -2], [ICEFANG_SNAP - 3, -2], [ICEFANG_SNAP, 3, easeIn], [ICEFANG_CRACK, 1.5], [33, 0]]))
  if (t === ICEFANG_SNAP) out.shake = [g.side * 2, 1]
  if (t === ICEFANG_SNAP + 4) out.shake = [g.side, 0]
  if (t < a.ticks - 1) {
    const f = phase(t, 2, 9) * (1 - phase(t, ICEFANG_CRACK, a.ticks - 2))
    out.shade = t === ICEFANG_SNAP ? tint(WHITE, 0.55) : rimGlow(g, out, pal[1], 0.15 * f, WHITE, 0.6 * f)
  }
  const bx = clamp(g.target.x + g.side, 7, g.columns - 8)
  const by = clamp(g.target.y, 10, g.ground - 8)
  const open = Math.round(keys(t, [[2, 7], [9, 5, easeOut], [ICEFANG_SNAP - 3, 5], [ICEFANG_SNAP, 0, easeIn]]))
  const grow = easeOut(phase(t, 3, 9))
  if (t >= 2 && t < 9) {
    emit(t, { count: 16, start: 1, gap: 0.4, life: 5 }, (i, age, f) => {
      const angle = rnd(a.seed, i, 700) * TAU
      const d = 9 * (1 - easeIn(f))
      dot(out, bx + Math.cos(angle) * d, by + Math.sin(angle) * d * 0.8, f < 0.5 ? pal[2] : WHITE)
    })
  }
  if (t >= 3 && t < ICEFANG_CRACK) {
    const up = by - 1 - open
    const down = by + 1 + open
    for (const u of [-3, 3]) spike(out, bx + u, up - 5, 0, 1, 5 * grow, 1.6, pal)
    for (const u of [-3, 3]) spike(out, bx + u, down + 4, 0, -1, 4 * grow, 1.4, pal)
    if (t >= 7 && t < ICEFANG_SNAP && t % 3 === 0) spark(out, bx - 3, up, 1, pal[1])
  }
  const k = t - ICEFANG_SNAP
  if (k < 0) return
  if (k < 2) disc(out, bx, by, 2.5 - k, WHITE)
  if (k < 3) burst(out, bx, by, 6 - k, pal[2])
  if (t < ICEFANG_CRACK) {
    const len = 6 * easeOut(phase(t, ICEFANG_SNAP + 1, ICEFANG_SNAP + 6))
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU + 0.3 + rnd(a.seed, i, 701) * 0.3
      spike(out, bx + Math.cos(angle) * 2, by + Math.sin(angle) * 2, Math.cos(angle), Math.sin(angle) * 0.85, len * (i % 2 ? 0.75 : 1), 1.2, pal)
    }
    if (t > ICEFANG_SNAP + 6 && t % 3 === 0) spark(out, bx + (rnd(a.seed, t, 702) - 0.5) * 10, by + (rnd(a.seed, t, 703) - 0.5) * 8, 1, pal[2])
  }
  const crack = t - ICEFANG_CRACK
  if (crack >= 0 && crack < 2) burst(out, bx, by, 6 - crack * 2, pal[1])
  if (crack >= 0 && crack < 12) chips(out, a, g, bx, by, crack, 14, 704, pal, 1.2)
}

const SHARD_FORM = 5
const SHARD_THROW = 6
const SHARD_HIT = 11
const SHARD_LEN = 6

// Snap a shard of ice into being at the mouth with a glint and whip it out at once in a
// straight streak, breaking on the target in a spray of splinters
function iceshard(out, t, a, g, c) {
  const pal = iceTones(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  out.dx = g.side * Math.round(keys(t, [[0, 0], [3, -1], [SHARD_THROW - 1, -1], [SHARD_THROW, 2, easeIn], [SHARD_THROW + 3, 1], [SHARD_HIT + 6, 0]]))
  if (t >= SHARD_THROW && t < SHARD_THROW + 3) out.skew = lean(g, g.side * 2)
  if (t === SHARD_THROW) out.shade = tint(pal[1], 0.4)
  const sx = mx + g.side * 3
  const dist = Math.hypot(tx - sx, ty - my) || 1
  const [ux, uy] = [(tx - sx) / dist, (ty - my) / dist]
  if (t >= 1 && t < SHARD_THROW) {
    const len = SHARD_LEN * easeOut(phase(t, 1, 4))
    spike(out, sx - ux * len * 0.5, my - uy * len * 0.5, ux, uy, len, 1.4, pal)
    if (t === 4 || t === SHARD_FORM) spark(out, sx + ux * len * 0.5, my + uy * len * 0.5, t === 4 ? 3 : 2, pal[2])
  } else if (t < SHARD_HIT) {
    const f = phase(t, SHARD_THROW, SHARD_HIT)
    const hx = lerp(sx, tx, f)
    const hy = lerp(my, ty, f)
    for (let s = 1; s <= 7; s++) dot(out, hx - ux * (SHARD_LEN + s), hy - uy * (SHARD_LEN + s), s < 3 ? WHITE : s < 5 ? pal[1] : pal[3])
    spike(out, hx - ux * SHARD_LEN, hy - uy * SHARD_LEN, ux, uy, SHARD_LEN, 1.4, pal)
  }
  emit(t, { count: 8, start: SHARD_THROW, gap: 0.6, life: 7 }, (i, age) => {
    const f = phase(SHARD_THROW + i * 0.6, SHARD_THROW, SHARD_HIT)
    dot(out, lerp(sx, tx, f), lerp(my, ty, f) + age * 0.6, age < 3 ? WHITE : pal[2])
  })
  const k = t - SHARD_HIT
  if (k < 0) return
  if (k === 0) out.shake = [g.side, 0]
  if (k < 3) spark(out, tx, ty, 3 - k, pal[2])
  if (k < 14) chips(out, a, g, tx, ty, k, 10, 710, pal, 1.1)
  if (k >= 3 && t < a.ticks - 3 && t % 2) dot(out, tx + (rnd(a.seed, t, 711) - 0.5) * 8, ty + (rnd(a.seed, t, 712) - 0.5) * 6, WHITE)
}

const AVAL_TAKE = 2
const AVAL_REAR = 10
const AVAL_SLAM = 16
const AVAL_CHUNKS = 14
const AVAL_SETTLE = 36

// A ball of packed snow with a deep blue rim
function snowball(out, x, y, r, c, pal) {
  disc(out, x, y, r + 0.6, pal[3])
  ball(out, x, y, r, c)
}

// Take a hit and stagger, glare as the cold builds, rear up and slam down, bringing a
// cascade of snow boulders down onto the target that piles into a drift in a burst of
// powder, then melts away
function avalanche(out, t, a, g, c) {
  const pal = iceTones(c)
  const { x: tx0 } = g.target
  const tx = clamp(tx0, 8, g.columns - 9)
  const take = t - AVAL_TAKE
  out.dx = g.side * Math.round(keys(t, [[0, 0], [AVAL_TAKE, 0], [AVAL_TAKE + 1, -2, easeOut], [AVAL_REAR, -1], [AVAL_SLAM, 0]]))
  out.dy = -Math.round(keys(t, [[AVAL_REAR, 0], [AVAL_SLAM - 1, 2, easeOut], [AVAL_SLAM, 0, easeIn]]))
  out.sy = keys(t, [[AVAL_REAR, 1], [AVAL_SLAM - 1, 1.06], [AVAL_SLAM, 0.9, easeIn], [AVAL_SLAM + 4, 1]])
  out.sx = keys(t, [[AVAL_SLAM - 1, 1], [AVAL_SLAM, 1.06, easeIn], [AVAL_SLAM + 4, 1]])
  if (t >= AVAL_REAR && t < AVAL_SLAM) out.skew = lean(g, -g.side * 2 * phase(t, AVAL_REAR, AVAL_SLAM - 1))
  if (take >= 0 && take < 3) out.shake = [-g.side * (take === 0 ? 2 : 1), 0]
  if (t === AVAL_SLAM) out.shake = [0, 2]
  if (t === AVAL_SLAM + 1) out.shake = [0, -1]
  if (t < a.ticks - 1) {
    if (take >= 0 && take < 2) out.shade = tint(WHITE, 0.6)
    else {
      const f = phase(t, AVAL_TAKE + 3, AVAL_SLAM) * (1 - phase(t, AVAL_SLAM + 4, AVAL_SETTLE))
      out.shade = rimGlow(g, out, pal[1], 0.2 * f, WHITE, 0.8 * f)
    }
  }
  if (take >= 0 && take < 3) burst(out, g.mouth.x, g.mouth.y, 4 - take, WHITE)
  if (t > AVAL_TAKE + 4 && t < AVAL_SLAM && t % 2) sparkles(out, t, a.seed, g.cx, g.cy, g.right - g.left + 4, g.bottom - g.top + 2, pal[2], 3)

  // Snow boulders tumble down from up behind the target onto the growing drift
  const pile = easeOut(phase(t, AVAL_SLAM + 4, AVAL_SETTLE)) * (1 - phase(t, a.ticks - 9, a.ticks - 1))
  for (let i = 0; i < AVAL_CHUNKS; i++) {
    const age = t - AVAL_SLAM - 1 - i * 1.1
    if (age < 0) continue
    const r = 1.2 + rnd(a.seed, i, 800) * 1.4
    const x0 = tx + g.side * (3 + rnd(a.seed, i, 801) * 8)
    const vx = -g.side * (0.4 + rnd(a.seed, i, 802) * 0.5)
    const y0 = -2 - rnd(a.seed, i, 803) * 3
    const floor = g.ground - r - 1 - 2 * Math.min(1, age / 20)
    const land = (-1 + Math.sqrt(1 + 2 * GRAVITY * (floor - y0))) / GRAVITY
    if (age < land) {
      snowball(out, x0 + vx * age, y0 + age + 0.5 * GRAVITY * age * age, r, c, pal)
      continue
    }
    const k = age - land
    const x = x0 + vx * land
    if (k < 3) snowball(out, x + vx * k, floor - Math.max(0, 1.2 * k - 0.5 * k * k), r, c, pal)
    if (k < 7) puff(out, x, g.ground - 2 - k * 0.5, 1 + k * 0.35, light(c, 0.3), i, k > 4 ? dotted : dot)
    if (k === 0) out.shake = [i % 2 ? 1 : -1, 1]
  }
  if (pile > 0) drift(out, a, g, tx, Math.round(4 + 4 * pile), 5 * pile, pal, t >= a.ticks - 6 ? dotted : dot)
}

const ICEBALL_FORM = 10
const ICEBALL_PUSH = 12
const ICEBALL_HIT = 22

// A ball of ice turned by `spin`: rim, facets that roll with it, and a fixed shine
function iceBall(out, x, y, r, spin, pal) {
  disc(out, x, y, r, pal[3])
  disc(out, x, y, r - 0.7, pal[2])
  for (const off of [0, Math.PI / 2]) {
    const [cx, cy] = [Math.cos(spin + off) * (r - 0.8), Math.sin(spin + off) * (r - 0.8)]
    line(out, x - cx, y - cy, x + cx, y + cy, pal[1])
  }
  disc(out, x - r * 0.35, y - r * 0.35, Math.max(0.5, r * 0.3), WHITE)
}

// Pack an ice ball together on the ground, shove it off, and send it rolling into the
// target, where it breaks into chunks in a puff of snow
function iceball(out, t, a, g, c) {
  const pal = iceTones(c)
  const r = clamp((g.bottom - g.top) / 5, 2.5, 4)
  const x0 = g.frontAt(g.cy) + g.side * (r + 1)
  const y = g.ground - r
  const { x: tx } = g.target
  const stop = tx - g.side * Math.round(r)
  out.dx = g.side * Math.round(keys(t, [[0, 0], [ICEBALL_FORM, 0], [ICEBALL_PUSH, 2, easeIn], [ICEBALL_PUSH + 3, 2], [ICEBALL_PUSH + 9, 0]]))
  if (t < ICEBALL_FORM) {
    out.sy = 1 - (t % 4 < 2 ? 0.05 : 0) * phase(t, 0, 3)
    out.skew = lean(g, g.side * (t % 4 < 2 ? 1 : 0))
  } else if (t < ICEBALL_PUSH + 3) {
    out.skew = lean(g, g.side * 2.5)
  }
  if (t < a.ticks - 1) out.shade = rimGlow(g, out, pal[1], 0.1, WHITE, 0.5 * phase(t, 0, 6) * (1 - phase(t, ICEBALL_HIT, ICEBALL_HIT + 8)))
  if (t >= 1 && t < ICEBALL_PUSH) {
    const rr = r * easeOut(phase(t, 1, ICEBALL_FORM))
    emit(t, { count: 12, start: 1, gap: 0.6, life: 4 }, (i, age, f) => {
      const angle = -rnd(a.seed, i, 900) * Math.PI
      const d = (r + 5) * (1 - easeIn(f))
      dot(out, x0 + Math.cos(angle) * d, y + Math.sin(angle) * d, f < 0.5 ? pal[2] : WHITE)
    })
    if (rr >= 0.8) iceBall(out, x0, y, rr, 0, pal)
  } else if (t < ICEBALL_HIT) {
    const f = phase(t, ICEBALL_PUSH, ICEBALL_HIT)
    const x = lerp(x0, stop, f)
    const spin = (g.side * (x - x0)) / r
    for (let d = x0; g.side * (x - g.side * r - d) > 0; d += g.side) {
      if (Math.round(d) % 2) dot(out, d, g.ground, (Math.round(d) + t) % 3 ? pal[1] : WHITE)
    }
    iceBall(out, x, y, r, spin, pal)
    if (t % 2) dot(out, x - g.side * (r + 1), g.ground - 1, WHITE)
  }
  const k = t - ICEBALL_HIT
  if (k < 0) return
  if (k === 0) out.shake = [g.side * 2, 1]
  if (k === 1) out.shake = [-g.side, 0]
  if (k < 2) disc(out, stop, y, r + 1 - k, WHITE)
  if (k < 3) burst(out, stop, y, 6 - k, pal[2])
  for (let i = 0; i < 7; i++) {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, 901) - 0.5) * 3
    const v = 0.7 + rnd(a.seed, i, 902) * 0.8
    const px = stop + Math.cos(angle) * v * k
    const py = y + Math.sin(angle) * v * k + 0.5 * GRAVITY * k * k
    if (py > g.ground + 2 || k > 14) continue
    const size = i % 3 ? 0.8 : 1.3
    disc(out, px, Math.min(g.ground - size, py), size, k < 3 ? pal[1] : pal[2])
    dot(out, px, Math.min(g.ground - size, py) - size, WHITE)
  }
  if (k < 6) puff(out, stop, y - k * 0.5, 1.5 + k * 0.3, light(c, 0.4), 3 + k)
}

const SPEAR_LAUNCH = [13, 17, 21, 25]
const SPEAR_FLIGHT = 4
const SPEAR_LEN = 7
const SPEAR_ROWS = [-4, 3, -1, 5]

// Four icicles freeze into being in a hovering rank before the mon, aimed at the target,
// then it thrusts and fires them one after another, each cracking on the target
function iciclespear(out, t, a, g, c) {
  const pal = iceTones(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const thrust = SPEAR_LAUNCH.some((l) => t - l >= 0 && t - l < 2)
  out.dx = thrust ? g.side : t >= 4 && t < SPEAR_LAUNCH[0] ? -g.side : 0
  if (thrust) out.skew = lean(g, g.side * 1.5)
  if (t < a.ticks - 1) {
    const f = phase(t, 0, 8) * (1 - phase(t, SPEAR_LAUNCH[3], a.ticks - 2))
    out.shade = rimGlow(g, out, pal[1], 0.12 * f, WHITE, 0.6 * f)
  }
  SPEAR_LAUNCH.forEach((launch, n) => {
    const px = mx + g.side * (5 + (n % 2) * 3)
    const py = clamp(my + SPEAR_ROWS[n], 2, g.ground - 3)
    const dist = Math.hypot(tx - px, ty - py) || 1
    const [ux, uy] = [(tx - px) / dist, (ty - py) / dist]
    const born = 2 + n * 2.5
    const age = t - launch
    if (t >= born && age < 0) {
      const len = SPEAR_LEN * easeOut(phase(t, born, born + 3))
      const bob = Math.round(Math.sin(t * 0.6 + n) * 0.6)
      spike(out, px - ux * len * 0.5, py - uy * len * 0.5 + bob, ux, uy, len, 1.2, pal)
      if (t - born >= 2 && t - born < 4) spark(out, px + ux * len * 0.5, py + uy * len * 0.5 + bob, 2, pal[2])
    } else if (age >= 0 && age < SPEAR_FLIGHT) {
      const f = easeIn(phase(t, launch, launch + SPEAR_FLIGHT))
      const hx = lerp(px + ux * SPEAR_LEN * 0.5, tx, f)
      const hy = lerp(py + uy * SPEAR_LEN * 0.5, ty, f)
      for (let s = 1; s <= 4; s++) dot(out, hx - ux * (SPEAR_LEN + s * 1.5), hy - uy * (SPEAR_LEN + s * 1.5), s < 2 ? WHITE : s < 3 ? pal[1] : pal[3])
      spike(out, hx - ux * SPEAR_LEN, hy - uy * SPEAR_LEN, ux, uy, SPEAR_LEN, 1.2, pal)
    }
    const k = age - SPEAR_FLIGHT
    if (k >= 0 && k < 3) {
      spark(out, tx, ty + (n % 2 ? 1 : -1), 3 - k, pal[2])
      if (k === 0) out.shake = [g.side, n === 3 ? 1 : 0]
    }
    if (k >= 0 && k < 10) chips(out, a, g, tx, ty, k, 5, 1000 + n * 3, pal, 0.9)
  })
}

const GLACIATE_GO = 8
const GLACIATE_SPEED = 2
const GLACIATE_CRUMBLE = 36

// Breathe in and stamp, and a racing line of ice spikes erupts from the ground out to
// the target, where a glacier of tall spikes heaves up, then the ice crumbles away
function glaciate(out, t, a, g, c) {
  const pal = iceTones(c)
  const clip = clipTo(g)
  const foot = g.frontAt(g.bottom)
  const { x: tx0 } = g.target
  const tx = clamp(tx0, 6, g.columns - 7)
  const run = Math.abs(tx - foot)
  out.dy = t >= 3 && t < GLACIATE_GO ? -1 : 0
  out.sy = keys(t, [[0, 1], [GLACIATE_GO - 1, 1.05], [GLACIATE_GO, 0.92, easeIn], [GLACIATE_GO + 4, 1]])
  out.sx = keys(t, [[GLACIATE_GO - 1, 1], [GLACIATE_GO, 1.05, easeIn], [GLACIATE_GO + 4, 1]])
  if (t === GLACIATE_GO) out.shake = [0, 1]
  if (t < a.ticks - 1) {
    const f = phase(t, 0, GLACIATE_GO) * (1 - phase(t, GLACIATE_GO + 6, GLACIATE_CRUMBLE))
    out.shade = rimGlow(g, out, pal[1], 0.15 * f, WHITE, 0.7 * f)
  }
  if (t >= 2 && t < GLACIATE_GO) {
    const { x: mx, y: my } = g.mouth
    for (let k = 0; k < 3; k++) dot(out, mx + g.side * (1 + ((t + k) % 3)), my - 1 + k, k === 1 ? WHITE : pal[1])
  }
  const front = (t - GLACIATE_GO) * GLACIATE_SPEED
  // Spikes along the way, then the glacier at the target: distance, height, lean
  const spikes = []
  for (let k = 0, d = 2; d < run - 3; k++, d += 2.2 + rnd(a.seed, k, 1100) * 1.4) {
    spikes.push([d, 2 + 3 * (d / run) + rnd(a.seed, k, 1101) * 1.5, (rnd(a.seed, k, 1102) - 0.3) * 0.5])
  }
  spikes.push([run - 2, 7, -0.25], [run + 2, 6, 0.35], [run, 10, 0.05])
  spikes.forEach(([d, h, tilt], k) => {
    const age = t - GLACIATE_GO - d / GLACIATE_SPEED
    if (age < 0) return
    const x = foot + g.side * d
    const pop = age < 2 ? easeOut(age / 2) * 1.15 : age < 3 ? 1.15 - 0.15 * (age - 2) : 1
    const crumble = easeIn(phase(t, GLACIATE_CRUMBLE + k * 0.4, GLACIATE_CRUMBLE + 8 + k * 0.4))
    const len = h * pop * (1 - crumble)
    if (len >= 0.5 && t < a.ticks - 1) spike(out, x, g.ground, g.side * tilt, -1, len, h > 6 ? 2 : 1.3, pal, clip)
    if (age < 3) chips(out, a, g, x, g.ground - 1, age + 1, 3, 1103 + k, pal, 0.7)
    if (crumble > 0 && crumble < 1) chips(out, a, g, x, g.ground - h * 0.6, (t - GLACIATE_CRUMBLE - k * 0.4) * 1.5, 2, 1150 + k, pal, 0.6)
  })
  if (t >= GLACIATE_GO && t < a.ticks - 2) {
    const reach = Math.min(run + 4, front)
    const thaw = phase(t, GLACIATE_CRUMBLE, a.ticks - 2)
    for (let d = 0; d <= reach; d++) {
      if (rnd(a.seed, d, 1104) < thaw) continue
      clip(out, foot + g.side * d, g.ground, (d + (t >> 1)) % 4 ? pal[1] : WHITE)
    }
  }
  const hit = t - GLACIATE_GO - run / GLACIATE_SPEED
  if (hit >= 0 && hit < 3) {
    burst(out, tx, g.ground - 5, 6 - hit, pal[1])
    out.shake = [hit % 2 ? -g.side : g.side, 1]
  }
}

const CRASH_DROPS = [16, 21, 27]

// Icicles freeze down from the top of the strip over the target and quiver, then crash
// down one after another, the great middle one last, shattering on the target
function iciclecrash(out, t, a, g, c) {
  const pal = iceTones(c)
  const clip = clipTo(g)
  const { x: tx0, y: ty } = g.target
  const tx = clamp(tx0, 7, g.columns - 8)
  const icicles = [[-4, 5, 1.3], [4, 6, 1.3], [0, 9, 2.2]]
  const nod = CRASH_DROPS.some((d) => t - d >= 0 && t - d < 2)
  out.dy = t >= 2 && t < CRASH_DROPS[0] ? -1 : 0
  out.dx = nod ? g.side : 0
  if (t < CRASH_DROPS[0]) out.sy = 1 + 0.04 * phase(t, 0, 6)
  if (t < a.ticks - 1) {
    const f = phase(t, 0, 6) * (1 - phase(t, CRASH_DROPS[2], a.ticks - 2))
    out.shade = nod ? tint(pal[1], 0.35) : rimGlow(g, out, pal[1], 0.12 * f, WHITE, 0.6 * f)
  }
  const crust = phase(t, 1, 6) * (1 - phase(t, CRASH_DROPS[2] + 4, CRASH_DROPS[2] + 12))
  if (crust > 0) {
    for (let u = -7; u <= 7; u++) {
      if (Math.abs(u) > 7 * crust) continue
      clip(out, tx + u, 0, (u + t) % 4 ? pal[1] : WHITE)
      if (Math.abs(u) < 6 * crust && u % 2) clip(out, tx + u, 1, pal[3])
    }
  }
  const floor = Math.min(g.ground, ty + 3)
  icicles.forEach(([u, h, w], n) => {
    const drop = CRASH_DROPS[n]
    const len = h * easeOut(phase(t, 2 + n * 2, 10 + n * 2))
    const age = t - drop
    const x = tx + u + (t >= 11 && age < 0 ? tremble(t + n) : 0)
    if (age < 0) {
      if (len >= 0.5) spike(out, x, 0, 0, 1, len, w, pal, clip)
      if (t % 5 === n && len > 3) dot(out, x, len + 1 + ((t >> 1) % 2), pal[1])
      return
    }
    const fall = age + 0.55 * age * age
    const impact = (-1 + Math.sqrt(1 + 2.2 * Math.max(0, floor - len))) / 1.1
    if (age < impact) {
      spike(out, x, fall, 0, 1, len, w, pal, clip)
      for (let s = 1; s < 4; s++) clip(out, x, fall - s * 1.5, s < 2 ? pal[1] : pal[3])
      return
    }
    const k = age - impact
    const big = n === 2
    if (k < 1) out.shake = big ? [g.side * 2, 2] : [g.side, 1]
    else if (big && k < 3) out.shake = [-g.side, k < 2 ? -1 : 0]
    if (k < 2) disc(out, x, floor, (big ? 3.5 : 2) - k, WHITE, clip)
    if (k < 3) burst(out, x, floor, (big ? 8 : 5) - k, pal[2])
    if (k < 14) chips(out, a, g, x, floor, k, big ? 16 : 8, 1200 + n * 3, pal, big ? 1.4 : 1)
    if (big && k < 7) puff(out, x, floor - k * 0.6, 1.5 + k * 0.3, light(c, 0.4), 5 + k)
  })
}

export const ICE = {
  haze: { ticks: 48, color: 0x7e8aa2, pose: { view: 'front' }, draw: haze },
  icywind: { ticks: 40, color: 0xaee4ff, draw: icywind },
  powdersnow: { ticks: 38, color: 0xdff2ff, draw: powdersnow },
  hail: { ticks: 50, color: 0xbfe6ff, pose: { view: 'front' }, draw: hail },
  sheercold: { ticks: 56, color: 0x9fd8ff, draw: sheercold },
  icefang: { ticks: 36, color: 0x9ae6ff, draw: icefang },
  iceshard: { ticks: 28, color: 0xaee8ff, draw: iceshard },
  avalanche: { ticks: 54, color: 0xe4f4ff, draw: avalanche },
  iceball: { ticks: 40, color: 0xb8e8ff, draw: iceball },
  iciclespear: { ticks: 44, color: 0xb0e8ff, draw: iciclespear },
  glaciate: { ticks: 50, color: 0x8fd8ff, draw: glaciate },
  iciclecrash: { ticks: 50, color: 0xa8e4ff, draw: iciclecrash },
}
