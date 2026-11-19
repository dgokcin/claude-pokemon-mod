// Electric moves

import {
  WHITE, back, burst, clamp, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, keys, lean, lerp, light, line, mix,
  phase, puff, rimGlow, ring, rnd, shownAt, spark, tint, tremble,
} from './draw.js'

// Bolt tones: white core, pale yellow, yellow, amber rim
const voltTones = (c) => [WHITE, light(c, 0.6), c, mix(c, 0xd0700a, 0.6)]

// The glow along a bolt's white core, golden so it still shows on a light terminal
const glowOf = (pal) => mix(pal[2], pal[3], 0.5)

// The sprite's edge pixels at its base spot, where sparks can sit
function edgeOf(g) {
  const pts = []
  for (let y = g.top; y <= g.bottom; y++) {
    for (let x = g.left; x <= g.right; x++) {
      if (!g.solid(x, y)) continue
      if (!g.solid(x - 1, y) || !g.solid(x + 1, y) || !g.solid(x, y - 1) || !g.solid(x, y + 1)) pts.push([x, y])
    }
  }
  return pts
}

// The joints of a jagged bolt from one point to another, knocked from side to side
function boltPath(seed, salt, x0, y0, x1, y1, step, jag) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1
  const n = Math.max(2, Math.round(len / step))
  const nx = -(y1 - y0) / len
  const ny = (x1 - x0) / len
  const pts = [[x0, y0]]
  for (let k = 1; k < n; k++) {
    const off = (k % 2 ? 1 : -1) * jag * (0.3 + rnd(seed, k, salt) * 0.9)
    pts.push([lerp(x0, x1, k / n) + nx * off, lerp(y0, y1, k / n) + ny * off])
  }
  pts.push([x1, y1])
  return pts
}

// A fork off joint k of a bolt, bent by `angle` from the bolt's own heading
function forkOf(seed, salt, pts, k, angle, len) {
  const [x0, y0] = pts[k]
  const [x1, y1] = pts[Math.min(pts.length - 1, k + 1)]
  const heading = Math.atan2(y1 - y0, x1 - x0) + angle
  return boltPath(seed, salt, x0, y0, x0 + Math.cos(heading) * len, y0 + Math.sin(heading) * len, 2.5, 1)
}

// Paint a bolt along its joints in layers of [brush radius, color], widest first.
// `upto` draws only the first part of it, for a bolt still lancing out. A layer's
// pixels are gathered first so the round brush paints each one only once.
function zap(out, pts, layers, upto = 1, paint = dot) {
  const last = Math.max(1, Math.round((pts.length - 1) * upto))
  for (const [r, col] of layers) {
    const seen = new Set()
    const mark = (o, x, y) => seen.add((Math.round(y) + 64) * 4096 + Math.round(x) + 2048)
    const brush = (o, x, y) => (r < 0.5 ? mark(o, x, y) : disc(o, Math.round(x), Math.round(y), r, col, mark))
    for (let k = 1; k <= last; k++) line(out, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], col, brush)
    for (const key of seen) paint(out, (key % 4096) - 2048, Math.floor(key / 4096) - 64, col)
  }
}

// Small sparks leaping off the body's edge, fresh ones each tick
function crackle(out, t, a, g, pal, count, salt = 0) {
  const edge = edgeOf(g)
  if (edge.length === 0) return
  for (let k = 0; k < count; k++) {
    const [x, y] = edge[Math.floor(rnd(a.seed, t * 11 + k, 70 + salt) * edge.length)]
    const angle = Math.atan2(y - g.cy, x - g.cx) + (rnd(a.seed, t * 11 + k, 71 + salt) - 0.5)
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)]
    const pts = [[x, y]]
    for (let j = 1; j <= 3; j++) {
      const kink = j % 2 ? 0.9 : -0.9
      pts.push([x + ux * j * 1.3 - uy * kink, y + uy * j * 1.3 + ux * kink])
    }
    zap(out, pts, [[0, pal[2]]])
    dot(out, pts[1][0], pts[1][1], WHITE)
    dot(out, pts[3][0], pts[3][1], pal[3])
  }
}

// Arcs that crawl over the body between pairs of nearby edge points
function bodyArcs(out, t, a, g, pal, count) {
  const edge = edgeOf(g)
  if (edge.length < 2) return
  for (let k = 0; k < count; k++) {
    const n = t * 5 + k
    const p = edge[Math.floor(rnd(a.seed, n, 72) * edge.length)]
    let q = null
    for (let j = 0; j < 8 && !q; j++) {
      const c = edge[Math.floor(rnd(a.seed, n, 73 + j) * edge.length)]
      const d = Math.hypot(c[0] - p[0], c[1] - p[1])
      if (d >= 4 && d <= 10) q = c
    }
    if (q) zap(out, boltPath(a.seed, n + 90, p[0], p[1], q[0], q[1], 2, 1.3), [[1, pal[3]], [0, WHITE]])
  }
}

// Sparks thrown out from a point, each trailing a short streak, `age` ticks after
function sparkBurst(out, a, x, y, age, count, salt, pal, reach = 1) {
  for (let i = 0; i < count; i++) {
    const angle = rnd(a.seed, i, salt) * Math.PI * 2
    const speed = (0.9 + rnd(a.seed, i, salt + 1) * 0.9) * reach
    const d = speed * age
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)]
    dot(out, x + ux * (d - 1.5), y + uy * (d - 1.5) + 0.05 * age * age, pal[3])
    dot(out, x + ux * d, y + uy * d + 0.05 * age * age, age < 3 ? WHITE : pal[1])
  }
}

const SHOCK_FIRE = 13
const SHOCK_HITS = [13, 16, 19]

// Sparks hop over the body as it flickers yellow, then a forked bolt leaps to the
// target three times, each strike popping a small burst of sparks
function thundershock(out, t, a, g, c) {
  const pal = voltTones(c)
  shockBody(out, t, a, g, pal)
  const m = shownAt(g, out, g.mouth.x, g.mouth.y)
  if (t < SHOCK_FIRE) crackle(out, t, a, g, pal, t < 4 ? 1 : t < 9 ? 2 : 3)
  if (t >= 3 && t < SHOCK_FIRE && t % 3 === 0) bodyArcs(out, t, a, g, pal, 1)
  const { x: tx, y: ty } = g.target
  SHOCK_HITS.forEach((hit, n) => {
    const k = t - hit
    if (k < 0 || k >= 8) return
    if (k < 2) {
      const pts = boltPath(a.seed, n * 10 + (k ? 1 : 0), m.x, m.y, tx, ty, 4, 2.6)
      const fork = forkOf(a.seed, n * 10 + 5, pts, Math.floor(pts.length / 2), n % 2 ? 0.8 : -0.8, 5)
      zap(out, fork, [[0, k ? pal[3] : pal[2]]])
      zap(out, pts, k ? [[1, pal[3]], [0, pal[2]]] : [[1, glowOf(pal)], [0, WHITE]])
    }
    if (k < 3) burst(out, tx, ty, 3 - k, pal[2])
    sparkBurst(out, a, tx, ty, k + 1, 4, 80 + n * 3, pal, 0.8)
  })
  if (t >= SHOCK_HITS[2] + 3 && t < a.ticks - 3) {
    const sx = tx + (rnd(a.seed, t, 84) - 0.5) * 7
    const sy = ty + (rnd(a.seed, t, 85) - 0.5) * 6
    if (t % 2) spark(out, sx, sy, t < a.ticks - 8 ? 2 : 1, pal[2])
    else if (t < a.ticks - 6) zap(out, boltPath(a.seed, t + 600, sx, sy, sx + 3, sy - 2, 1.5, 0.8), [[0, pal[2]]])
  }
  emit(t, { count: 3, start: SHOCK_HITS[2] + 2, gap: 2, life: 9 }, (i, age, f) => {
    const py = ty - 1 - age * 0.7
    if (py >= 1) puff(out, tx + Math.sin(age * 0.6 + i), py, 0.8 + f, mix(0x6a6a70, 0x9a9aa0, f), i)
  })
}

function shockBody(out, t, a, g, pal) {
  if (t >= a.ticks - 1) return
  if (t < SHOCK_FIRE) {
    const f = phase(t, 0, SHOCK_FIRE)
    out.shade = t % 2 ? rimGlow(g, out, pal[2], 0.15 + 0.3 * f, pal[1], 0.5 + 0.5 * f) : rimGlow(g, out, pal[2], 0.05, pal[2], 0.3 * f)
    out.sy = t % 4 < 2 ? 1 : 1.03
  } else if (SHOCK_HITS.some((hit) => t - hit >= 0 && t - hit < 2)) {
    out.dx = g.side
    out.shade = tint(pal[1], t % 3 === 0 ? 0.65 : 0.4)
  } else {
    const f = 1 - phase(t, SHOCK_HITS[2] + 2, a.ticks - 2)
    out.shade = t % 2 ? rimGlow(g, out, pal[2], 0.1 * f, pal[1], 0.5 * f) : null
  }
}

const BOLT_FIRE = 18
const BOLT_STOP = 34

// Arcs crawl over the body while it flickers and trembles, then it flashes and
// branching bolts lance into the target, which erupts in a crackling burst
function thunderbolt(out, t, a, g, c) {
  const pal = voltTones(c)
  boltBody(out, t, a, g, pal)
  const m = shownAt(g, out, g.mouth.x, g.mouth.y)
  if (t < BOLT_FIRE) {
    bodyArcs(out, t, a, g, pal, 1 + Math.floor(t / 7))
    crackle(out, t, a, g, pal, 1 + Math.floor(t / 6))
  } else if (t === BOLT_FIRE) {
    crackle(out, t, a, g, pal, 12, 5)
  } else if (t >= BOLT_STOP && t < a.ticks - 4 && t % 3 === 0) {
    bodyArcs(out, t, a, g, pal, 1)
  }
  if (t >= BOLT_FIRE && t < BOLT_STOP) boltBolts(out, t, a, g, pal, m)
  boltBlast(out, t, a, g, pal)
}

function boltBody(out, t, a, g, pal) {
  if (t >= a.ticks - 1) return
  if (t < BOLT_FIRE) {
    const f = phase(t, 0, BOLT_FIRE)
    out.shade = t % 2 ? rimGlow(g, out, pal[2], 0.2 + 0.3 * f, WHITE, 0.4 + 0.5 * f) : rimGlow(g, out, pal[2], 0.1 * f, pal[1], 0.5 * f)
    if (t >= BOLT_FIRE - 6) out.dx = t % 2 ? -g.side : 0
    out.sy = 1 - 0.04 * f
  } else if (t < BOLT_FIRE + 2) {
    out.shade = tint(WHITE, t === BOLT_FIRE ? 0.85 : 0.5)
    out.dx = g.side
    out.sy = 1.04
  } else if (t < BOLT_STOP) {
    out.shade = t % 2 ? tint(pal[1], 0.35) : rimGlow(g, out, pal[2], 0.15, WHITE, 0.6)
    out.dx = t % 4 === 0 ? 0 : g.side
  } else {
    const f = 1 - phase(t, BOLT_STOP, a.ticks - 2)
    out.shade = t % 2 ? rimGlow(g, out, pal[2], 0.1 * f, pal[1], 0.6 * f) : null
  }
  if (t >= BOLT_FIRE && t < BOLT_FIRE + 4) out.shake = [t % 2 ? g.side : -g.side, t % 2 ? 0 : 1]
  else if (t >= BOLT_FIRE && t < BOLT_STOP && t % 2) out.shake = [g.side, 0]
}

// Three bolts from the front of the body, each with a fork, reshaped every other tick
// and flickering out in turn, lancing out over their first two ticks
function boltBolts(out, t, a, g, pal, m) {
  const { x: tx, y: ty } = g.target
  const rows = [clamp(m.y - 6, g.top + 2, g.bottom), m.y, clamp(m.y + 6, g.top, g.bottom - 2)]
  const upto = t === BOLT_FIRE ? 0.5 : 1
  const shape = Math.floor(t / 2)
  const bolts = rows.map((row, b) => {
    const x0 = b === 1 ? m.x : g.frontAt(row) + out.dx
    const pts = boltPath(a.seed, shape * 3 + b, x0, row + out.dy, tx, ty + (b - 1), 4, 2.4)
    const fork = forkOf(a.seed, shape * 3 + b + 50, pts, 1, b === 0 ? -0.8 : 0.8, 4 + rnd(a.seed, shape, b) * 3)
    return { pts, fork, lit: (t + b) % 5 !== 4 }
  })
  for (const { pts, fork, lit } of bolts) {
    if (!lit) continue
    zap(out, pts, [[1, glowOf(pal)]], upto)
    if (upto === 1) zap(out, fork, [[0, pal[3]]])
  }
  for (const { pts, lit } of bolts) if (lit) zap(out, pts, [[0, WHITE]], upto)
}

// The target erupts as the bolts land, a throbbing white heart with rays and flying
// sparks, then smoke and stray sparks
function boltBlast(out, t, a, g, pal) {
  const { x, y } = g.target
  const k = t - BOLT_FIRE - 1
  if (k < 0) return
  if (t < BOLT_STOP) {
    if (t % 2) burst(out, x, y, 6 + (t % 4 === 1 ? 1 : 0), pal[2])
    disc(out, x, y, k < 2 ? 3.5 : 2.5 + (t % 2 ? 0.5 : 0), pal[1])
    disc(out, x, y, k < 2 ? 2.5 : 1.5, WHITE)
  }
  emit(t, { count: 16, start: BOLT_FIRE + 1, gap: 1, life: 6 }, (i, age) => {
    const angle = rnd(a.seed, i, 86) * Math.PI * 2
    const d = 3 + age * 1.3
    const pts = boltPath(a.seed, i + 200, x, y, x + Math.cos(angle) * d, y + Math.sin(angle) * d, 2, 0.9)
    zap(out, pts.slice(-3), [[0, age < 3 ? pal[1] : pal[3]]])
  })
  emit(t, { count: 5, start: BOLT_STOP - 2, gap: 2, life: 10 }, (i, age, f) => {
    const px = x + (rnd(a.seed, i, 87) - 0.5) * 4 + Math.sin(age * 0.6 + i)
    const py = y - 1 - age * 0.7
    if (py >= 1) puff(out, px, py, 1 + f * 1.4, mix(0x6a6a70, 0x9a9aa0, f), i)
  })
  if (t >= BOLT_STOP && t < a.ticks - 3 && t % 2 === 0) {
    spark(out, x + (rnd(a.seed, t, 88) - 0.5) * 7, y + (rnd(a.seed, t, 89) - 0.5) * 6, 1, pal[2])
  }
}

const THUNDER_HITS = [24, 32, 40]
const THUNDER_GATHER = 20
const CLOUD = [0x34374e, 0x4b4f6e, 0x666b90, 0x8a90b4]
const FLASH = 0x4a4630
const FLASH_DIM = 0x3a3729

// The storm cloud hangs over the target, pulled in from the strip's ends
const cloudX = (g) => clamp(g.target.x, 8, g.columns - 9)

// A dark cloud gathers over the target while the mon glows and sends sparks up to
// call it, then a massive bolt slams down three times with a flash
function thunder(out, t, a, g, c) {
  const pal = voltTones(c)
  thunderBody(out, t, a, g, pal)
  const strike = THUNDER_HITS.map((hit) => t - hit).find((k) => k >= 0 && k < 4)
  const first = t === THUNDER_HITS[0]
  if (strike === 0) thunderFlash(out, g, first ? g.columns : 7, first ? FLASH : FLASH_DIM)
  thunderCloud(out, t, a, g, pal, strike)
  thunderCall(out, t, a, g, pal)
  THUNDER_HITS.forEach((hit, n) => thunderStrike(out, t - hit, n, a, g, pal))
  thunderAfter(out, t, a, g, pal)
}

function thunderBody(out, t, a, g, pal) {
  if (t >= a.ticks - 1) return
  const struck = THUNDER_HITS.some((hit) => t - hit >= 0 && t - hit < 2)
  if (struck) {
    out.shade = tint(WHITE, t % 2 ? 0.5 : 0.7)
    return
  }
  const f = t < THUNDER_HITS[0] ? phase(t, 4, THUNDER_GATHER) : 1 - phase(t, THUNDER_HITS[2] + 2, a.ticks - 2)
  out.shade = rimGlow(g, out, pal[2], 0.15 * f, t % 2 ? WHITE : pal[1], (0.4 + (t % 2 ? 0.3 : 0)) * f)
  if (t >= 6 && t < THUNDER_HITS[2] + 4) out.sy = 1.04
}

// A dim flash behind everything, `span` columns either side of the bolt, for the
// instant it lands
function thunderFlash(out, g, span, color) {
  const x0 = Math.max(0, g.target.x - span)
  const x1 = Math.min(g.columns - 1, g.target.x + span)
  for (let y = 0; y <= g.ground; y++) for (let x = x0; x <= x1; x++) back(out, x, y, color)
}

// Puffs drift in from both sides and swell into a dark cloud at the top of the strip.
// It flickers inside as it charges and lights up whole when a bolt leaves it.
function thunderCloud(out, t, a, g, pal, strike) {
  const end = THUNDER_HITS[2] + 12
  if (t >= end) return
  const cx = cloudX(g)
  const gather = easeOut(phase(t, 0, THUNDER_GATHER))
  const fade = phase(t, THUNDER_HITS[2] + 4, end)
  const lit = strike === 0 || strike === 1
  for (let k = 0; k < 5; k++) {
    const off = (k - 2) * 4 * (1 + 0.8 * (1 - gather) + fade * 0.6)
    const r = (2 + 2.4 * gather - Math.abs(k - 2) * 0.4) * (1 - fade * 0.6)
    const y = 3 - (k % 2) - fade * 2.5
    cloudPuff(out, cx + off, y, r, a.seed + k, lit ? 0.6 : fade * 0.5, lit ? pal[1] : 0x8a8ea8)
  }
  if (t >= 10 && t < THUNDER_HITS[2] && t % 3 === 0 && strike === undefined) {
    const fx = cx + (rnd(a.seed, t, 90) - 0.5) * 12
    zap(out, boltPath(a.seed, t, fx, 3, fx + (rnd(a.seed, t, 91) - 0.5) * 6, 6, 2, 1), [[0, pal[1]]])
  }
}

// One puff of storm cloud, lit on top, dark below and ragged at the rim. `glow` blends
// it toward a light color.
function cloudPuff(out, x, y, r, seed, glow, toward) {
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const d = Math.hypot(px - x, py - y) / Math.max(0.5, r)
      if (d > 1.05 || (d > 0.8 && rnd(seed, px * 31 + py) < 0.35)) continue
      const v = (py - y) / Math.max(1, r)
      const tone = v > 0.45 ? CLOUD[0] : v > -0.1 ? CLOUD[1] : v > -0.6 ? CLOUD[2] : CLOUD[3]
      dot(out, px, py, mix(tone, toward, glow))
    }
  }
}

// Sparks shoot up off the top of the glowing mon, calling the storm down
function thunderCall(out, t, a, g, pal) {
  if (t < 10 || t >= THUNDER_HITS[0]) return
  const top = Math.round(g.bottom + 1 - (g.bottom + 1 - g.top) * out.sy)
  for (let k = 0; k < 2; k++) {
    if ((t + k) % 2) continue
    const x0 = lerp(g.left + 2, g.right - 2, rnd(a.seed, t * 2 + k, 92))
    const x1 = x0 + (rnd(a.seed, t * 2 + k, 93) - 0.5) * 4
    zap(out, boltPath(a.seed, t * 2 + k + 300, x0, top, x1, top - 7, 2, 1.2), [[1, pal[3]], [0, WHITE]])
  }
}

// The strike's brush layers on each of its first four ticks, thinning out
const strikeLayers = (pal) => [
  [[2.5, pal[3]], [2, pal[2]], [1, WHITE]],
  [[2, pal[3]], [1.5, pal[2]], [1, WHITE]],
  [[1, pal[2]], [0, WHITE]],
  [[0, pal[3]]],
]

// One strike, k ticks after it lands. A thick jagged bolt with forks runs from the cloud
// to the ground through the target and thins out, with a burst and ground sparks.
function thunderStrike(out, k, n, a, g, pal) {
  if (k < 0 || k >= 9) return
  const { x: tx, y: ty } = g.target
  if (k < 4) {
    const top = lerp(cloudX(g), tx, 0.3)
    const pts = boltPath(a.seed, n * 7 + (k > 1 ? 1 : 0), top, 4, tx, g.ground, 3, 2.4)
    const layers = strikeLayers(pal)[k]
    if (k < 2) {
      zap(out, forkOf(a.seed, n * 7 + 3, pts, 1, n % 2 ? 0.8 : -0.8, 6), [[1, pal[3]], [0, pal[1]]])
      zap(out, forkOf(a.seed, n * 7 + 4, pts, 3, n % 2 ? -0.7 : 0.7, 5), [[1, pal[3]], [0, pal[1]]])
    }
    zap(out, pts, layers)
  }
  if (k < 3) {
    burst(out, tx, ty, 6 - k, pal[2])
    for (let d = -6 + k; d <= 6 - k; d++) {
      dot(out, tx + d, g.ground, Math.abs(d) < 2 ? WHITE : Math.abs(d) < 4 ? pal[1] : pal[3])
      if (Math.abs(d) < 3) dot(out, tx + d, g.ground - 1, pal[2])
    }
  }
  for (let i = 0; i < 9; i++) {
    const angle = -Math.PI / 2 + (rnd(a.seed, n * 20 + i, 93) - 0.5) * 2.6
    const speed = 0.8 + rnd(a.seed, n * 20 + i, 94) * 1
    const px = tx + Math.cos(angle) * speed * k * 1.4
    const py = g.ground + Math.sin(angle) * speed * k * 1.4 + 0.18 * k * k
    if (py <= g.ground) dot(out, px, py, k < 3 ? WHITE : k < 6 ? pal[1] : pal[3])
  }
}

// After the storm, smoke rises off the target and sparks skitter along the ground
function thunderAfter(out, t, a, g, pal) {
  const { x, y } = g.target
  emit(t, { count: 6, start: THUNDER_HITS[2] + 2, gap: 1.6, life: 11 }, (i, age, f) => {
    const px = x + (rnd(a.seed, i, 95) - 0.5) * 5 + Math.sin(age * 0.6 + i)
    const py = y - age * 0.8
    if (py >= 1) puff(out, px, py, 1 + f * 1.5, mix(0x5e5e66, 0x9a9aa2, f), i)
  })
  if (t > THUNDER_HITS[0] + 3 && t < a.ticks - 3 && t % 3 === 1) {
    const sx = x + (rnd(a.seed, t, 96) - 0.5) * 10
    zap(out, boltPath(a.seed, t + 400, sx, g.ground, sx + (rnd(a.seed, t, 97) < 0.5 ? -4 : 4), g.ground - 1, 2, 1), [[0, pal[2]]])
  }
}

const WAVE_LAUNCH = [8, 13, 18]
const WAVE_SPEED = 1.6
const WAVE_WRAP = 5

// Static builds over the body, then three crackling zigzag waves pulse out to the
// target and clamp around it in shrinking rings, leaving static clinging there
function thunderwave(out, t, a, g, c) {
  const pal = voltTones(c)
  waveBody(out, t, a, g, pal)
  const m = shownAt(g, out, g.mouth.x, g.mouth.y)
  if (t < WAVE_LAUNCH[2]) crackle(out, t, a, g, pal, t < 4 ? 1 : 2)
  const { x: tx, y: ty } = g.target
  const reach = Math.hypot(tx - m.x, ty - m.y)
  const heading = Math.atan2(ty - m.y, tx - m.x)
  WAVE_LAUNCH.forEach((launch, n) => {
    const age = t - launch
    if (age < 0) return
    const r = 2 + age * WAVE_SPEED
    const k = age - (reach - 3) / WAVE_SPEED
    if (r < reach - 1) waveArc(out, t, m.x, m.y, r, heading, pal)
    else if (k < WAVE_WRAP) zigRing(out, t + n, tx, ty, lerp(6, 2.5, k / WAVE_WRAP), pal[3], (t >> 1) % 2 ? WHITE : pal[1])
  })
  waveStatic(out, t, a, g, pal, (reach - 3) / WAVE_SPEED + WAVE_LAUNCH[0])
}

function waveBody(out, t, a, g, pal) {
  if (t >= a.ticks - 1) return
  const pushed = WAVE_LAUNCH.some((launch) => t - launch >= 0 && t - launch < 2)
  out.dx = pushed ? g.side : 0
  const f = t < WAVE_LAUNCH[0] ? phase(t, 0, WAVE_LAUNCH[0]) : 1 - phase(t, WAVE_LAUNCH[2] + 4, a.ticks - 2)
  out.shade = pushed ? tint(pal[1], 0.45) : t % 2 ? rimGlow(g, out, pal[2], 0.15 * f, pal[1], 0.6 * f) : null
}

// A crackling arc of a ring centered on (x, y) and facing `heading`. Its radius jumps
// in and out at every joint, and the zigzag flips each tick.
function waveArc(out, t, x, y, r, heading, pal) {
  const spread = 0.9
  const steps = Math.max(4, Math.round((r * spread * 2) / 1.6))
  const pts = []
  for (let k = 0; k <= steps; k++) {
    const angle = heading - spread + (2 * spread * k) / steps
    const rr = r + ((k + t) % 2 ? 0.9 : -0.9)
    pts.push([x + Math.cos(angle) * rr, y + Math.sin(angle) * rr])
  }
  zap(out, pts, [[1, pal[3]], [0, t % 2 ? WHITE : pal[1]]])
}

// A whole crackling ring, its zigzag turning
function zigRing(out, t, x, y, r, rim, core) {
  const steps = Math.max(8, Math.round(r * 3))
  const pts = []
  for (let k = 0; k <= steps; k++) {
    const angle = (k / steps) * Math.PI * 2 + t * 0.3
    const rr = r + (k % 2 ? 0.8 : -0.8)
    pts.push([x + Math.cos(angle) * rr, y + Math.sin(angle) * rr])
  }
  zap(out, pts, [[1, rim], [0, core]])
}

// Static clings to the target once the first wave lands, as twinkles, tiny arcs, and
// now and then a faint ring flaring up
function waveStatic(out, t, a, g, pal, from) {
  if (t < from || t >= a.ticks - 1) return
  const { x, y } = g.target
  const left = a.ticks - 1 - t
  for (let k = 0; k < (left < 6 ? 1 : 3); k++) {
    const sx = x + (rnd(a.seed, t * 3 + k, 98) - 0.5) * 10
    const sy = y + (rnd(a.seed, t * 3 + k, 99) - 0.5) * 9
    spark(out, sx, sy, (t + k) % 3 ? 1 : 2, pal[2])
  }
  if (t % 2 === 0 && left >= 4) {
    const sx = x + (rnd(a.seed, t, 100) - 0.5) * 6
    const sy = y + (rnd(a.seed, t, 101) - 0.5) * 6
    const ex = sx + (rnd(a.seed, t, 102) - 0.5) * 9
    const ey = sy + (rnd(a.seed, t, 103) - 0.5) * 7
    zap(out, boltPath(a.seed, t + 500, sx, sy, ex, ey, 2, 1.1), [[0, pal[1]]])
  }
  if (t > WAVE_LAUNCH[2] + 10 && t % 5 === 0 && left >= 4) zigRing(out, t, x, y, 4, pal[3], pal[3])
}

const TAU = Math.PI * 2

// A paint that drops pixels outside the strip
const clipTo = (g) => (o, x, y, col) => {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px >= 0 && px < g.columns && py >= 0 && py <= g.ground) dot(o, px, py, col)
}

// Paint fn into a scratch frame, then onto out moved by dx, dy, so the body's sparks
// ride along when it lunges
function moved(out, dx, dy, fn) {
  const buf = { dots: [] }
  fn(buf)
  for (let k = 0; k < buf.dots.length; k += 3) out.dots.push(buf.dots[k] + dx, buf.dots[k + 1] + dy, buf.dots[k + 2])
}

// A crackling oval, its zigzag turning
function zigOval(out, t, x, y, rx, ry, layers, paint = dot) {
  const steps = 2 * Math.max(6, Math.round(Math.max(rx, ry) * 1.3))
  const pts = []
  for (let k = 0; k <= steps; k++) {
    const angle = (k / steps) * TAU + t * 0.25
    const j = k % 2 ? 0.8 : -0.8
    pts.push([x + Math.cos(angle) * (rx + j), y + Math.sin(angle) * (ry + j)])
  }
  zap(out, pts, layers, 1, paint)
}

// Half the body's width and height, a little outside its edge
const bodyRadii = (g) => [(g.right - g.left) / 2 + 1, (g.bottom - g.top) / 2 + 1]

const DISCHARGE_POPS = [12, 22]
const DISCHARGE_SPEED = 2.4

// Crouch as charge crawls over the body, then blow electricity out on every side twice,
// each pulse a starburst of bolts and a crackling ring that sweeps over the target
function discharge(out, t, a, g, c) {
  const pal = voltTones(c)
  const clip = clipTo(g)
  dischargeBody(out, t, a, g, pal)
  const mid = shownAt(g, out, g.cx, g.cy)
  const [rx, ry] = bodyRadii(g)
  const { x: tx, y: ty } = g.target
  if (t < DISCHARGE_POPS[0]) {
    crackle(out, t, a, g, pal, 1 + Math.floor(t / 4))
    if (t % 2) bodyArcs(out, t, a, g, pal, 1 + Math.floor(t / 6))
  } else if (t < DISCHARGE_POPS[1] - 1 && t % 2) {
    crackle(out, t, a, g, pal, 2, 3)
  }
  DISCHARGE_POPS.forEach((pop, n) => {
    const age = t - pop
    if (age < 0) return
    if (age < 5) {
      for (let i = 0; i < 12; i++) {
        const angle = ((i + n * 0.5) / 12) * TAU + (rnd(a.seed, i, 110 + n) - 0.5) * 0.4
        const [ux, uy] = [Math.cos(angle), Math.sin(angle)]
        const x0 = mid.x + ux * rx
        const y0 = mid.y + uy * ry
        const len = 3 + age * 2.6
        const pts = boltPath(a.seed, i + n * 40 + (age >> 1) * 13, x0, y0, x0 + ux * len, y0 + uy * len * 0.8, 2.5, 1.2)
        zap(out, pts, age < 2 ? [[1, glowOf(pal)], [0, WHITE]] : [[0, age < 4 ? pal[2] : pal[3]]], 1, clip)
      }
    }
    const span = Math.abs(tx - mid.x)
    const R = rx + 1 + age * DISCHARGE_SPEED
    if (R < span + 6 && age < 14) {
      const layers = age < 3 ? [[1, glowOf(pal)], [0, WHITE]] : [[1, pal[3]], [0, pal[1]]]
      zigOval(out, t, mid.x, mid.y, R, ry + age * DISCHARGE_SPEED * 0.55, layers, clip)
    }
    const k = age - Math.max(0, (span - rx - 1) / DISCHARGE_SPEED)
    if (k >= 0 && k < 3) burst(out, tx, ty, 4 - k, pal[2])
    if (k >= 0 && k < 8) sparkBurst(out, a, tx, ty, k + 1, 5, 120 + n * 4, pal, 0.8)
  })
  if (t >= DISCHARGE_POPS[1] + 8 && t < a.ticks - 4 && t % 2 === 0) crackle(out, t, a, g, pal, 1, 9)
}

function dischargeBody(out, t, a, g, pal) {
  if (t >= a.ticks - 1) return
  const [p0, p1] = DISCHARGE_POPS
  const popped = DISCHARGE_POPS.find((p) => t - p >= 0 && t - p < 2)
  if (popped !== undefined) {
    out.sy = 1.08
    out.sx = 0.96
    out.shade = tint(WHITE, t === popped ? 0.8 : 0.45)
    out.shake = [t === popped ? g.side : -g.side, t === popped ? 1 : 0]
    return
  }
  const crouch = t < p0 ? easeOut(phase(t, 0, p0)) : t < p1 ? 0.6 * phase(t, p0 + 2, p1) : 0
  out.sy = 1 - 0.1 * crouch
  out.sx = 1 + 0.05 * crouch
  if ((t >= p0 - 4 && t < p0) || (t >= p1 - 3 && t < p1)) out.dx = tremble(t)
  const f = t < p0 ? crouch : t < p1 ? 0.6 + 0.4 * phase(t, p0 + 2, p1) : 1 - phase(t, p1 + 2, a.ticks - 2)
  out.shade = t % 2 ? rimGlow(g, out, pal[2], 0.25 * f, WHITE, 0.7 * f) : rimGlow(g, out, pal[2], 0.1 * f, pal[1], 0.5 * f)
}

const SPARK_LUNGE = 7
const SPARK_HIT = 11
const SPARK_HOLD = 17

// Crackling all over, hop body first into the target and discharge on contact in a
// spray of sparks, then bounce home still fizzing
function sparkHit(out, t, a, g, c) {
  const pal = voltTones(c)
  const far = clamp(g.reach - 6, 2, 10)
  const body = Math.round(keys(t, [[0, 0], [SPARK_LUNGE, -2, easeOut], [SPARK_HIT, far, easeIn], [SPARK_HOLD, far], [SPARK_HOLD + 9, 0]]))
  out.dx = g.side * body
  out.dy = t >= SPARK_LUNGE && t < SPARK_HIT ? -Math.round(Math.sin(Math.PI * phase(t, SPARK_LUNGE, SPARK_HIT)) * 2) : 0
  out.skew = lean(g, g.side * keys(t, [[0, 0], [SPARK_LUNGE, -2], [SPARK_HIT, 2.5, easeIn], [SPARK_HOLD, 1], [SPARK_HOLD + 6, 0]]))
  if (t < a.ticks - 1) {
    const f = t < SPARK_HIT ? phase(t, 0, SPARK_LUNGE) : 1 - phase(t, SPARK_HOLD, a.ticks - 2)
    out.shade = t === SPARK_HIT ? tint(WHITE, 0.75) : t % 2 ? rimGlow(g, out, pal[2], 0.3 * f, WHITE, 0.8 * f) : rimGlow(g, out, pal[2], 0.1 * f, pal[1], 0.6 * f)
  }
  if (t === SPARK_HIT) out.shake = [g.side * 2, 1]
  if (t === SPARK_HIT + 1) out.shake = [-g.side, 0]
  if (t < SPARK_HOLD + 4) {
    moved(out, out.dx, out.dy, (buf) => {
      crackle(buf, t, a, g, pal, t < SPARK_LUNGE ? 1 + (t >> 1) : 3, 1)
      if (t % 2 === 0) bodyArcs(buf, t, a, g, pal, 1)
    })
  }
  if (t >= SPARK_LUNGE && t < SPARK_HIT) {
    for (let k = 0; k < 4; k++) {
      const y = lerp(g.top + 2, g.bottom - 1, (k + 0.5) / 4) + out.dy
      const x0 = g.frontAt(Math.round(y - out.dy)) + out.dx - g.side * ((g.right - g.left) * 0.7)
      line(out, x0, y, x0 - g.side * (2 + ((t + k) % 3)), y, k % 2 ? pal[1] : pal[3])
    }
  }
  const hx = g.mouth.x + g.side * (far + 1)
  const hy = g.mouth.y + 1
  const k = t - SPARK_HIT
  if (k < 0) return
  if (k < 2) disc(out, hx, hy, 2.5 - k * 0.5, WHITE)
  if (k < 4) burst(out, hx, hy, 7 - k, pal[2])
  if (k < 10) sparkBurst(out, a, hx, hy, k + 1, 14, 130, pal, 1.2)
  if (k >= 1 && k < 6 && k % 2) {
    for (let i = 0; i < 3; i++) {
      const angle = rnd(a.seed, i + k * 3, 131) * TAU
      zap(out, boltPath(a.seed, i + k * 3 + 700, hx, hy, hx + Math.cos(angle) * 6, hy + Math.sin(angle) * 5, 2, 1), [[0, pal[2]]])
    }
  }
}

const CHARGE_FULL = 30

// Facing out, bolts are drawn in from all around and soak into the body as it glows
// and swells, then a flash, a ring of sparks, and a fading hum
function charge(out, t, a, g, c) {
  const pal = voltTones(c)
  const clip = clipTo(g)
  const [rx, ry] = bodyRadii(g)
  const k = t - CHARGE_FULL
  if (t < a.ticks - 1) {
    if (k >= 0 && k < 3) {
      out.shade = tint(WHITE, k === 0 ? 0.85 : 0.5)
      out.sy = 1.06
      out.sx = 1.03
    } else {
      const f = k < 0 ? phase(t, 0, CHARGE_FULL) : 1 - phase(t, CHARGE_FULL + 3, a.ticks - 2)
      const beat = t % 4 < 2
      out.shade = rimGlow(g, out, pal[2], (beat ? 0.3 : 0.12) * f, beat ? WHITE : pal[1], 0.8 * f)
      if (k < 0) out.sy = 1 + (beat ? 0.03 : 0) * f
      if (t >= CHARGE_FULL - 7 && k < 0) out.dx = tremble(t)
    }
  }
  const mid = shownAt(g, out, g.cx, g.cy)
  emit(t, { count: 28, start: 1, gap: 1, life: 6 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 140) * TAU
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)]
    const d = lerp(14, 0, easeIn(f))
    const x0 = mid.x + ux * (rx + d + 6)
    const y0 = mid.y + uy * (ry + d + 6) * 0.8
    const x1 = mid.x + ux * (rx + d)
    const y1 = mid.y + uy * (ry + d) * 0.8
    zap(out, boltPath(a.seed, i * 7 + age, x0, y0, x1, y1, 1.8, 1), [[0, f < 0.4 ? pal[3] : f < 0.8 ? pal[2] : pal[1]]], 1, clip)
    clip(out, x1, y1, WHITE)
  })
  for (const start of [8, 16, 23]) {
    const age = t - start
    if (age >= 0 && age < 5) zigOval(out, t, mid.x, mid.y, rx + 10 - age * 2, ry + 7 - age * 1.4, [[0, age < 3 ? pal[3] : pal[1]]], clip)
  }
  if (t >= 6 && k < 0 && t % 3 === 0) bodyArcs(out, t, a, g, pal, 1 + (t > 18 ? 1 : 0))
  if (k >= 0 && k < 4) zigOval(out, t, mid.x, mid.y, rx + 2 + k * 2, ry + 1 + k * 1.5, k < 2 ? [[1, glowOf(pal)], [0, WHITE]] : [[0, pal[3]]], clip)
  if (k >= 0 && k < 10) sparkBurst(out, a, mid.x, mid.y, k + 3, 12, 141, pal, 1.3)
  if (k >= 4 && t < a.ticks - 3 && t % 3 === 0) crackle(out, t, a, g, pal, 1, 2)
}

const CANNON_FIRE = 22
const CANNON_HIT = 36

// A fat electric orb, crackling and lit up through its layers, with arcs leaping off
function orb(out, t, a, x, y, r, pal, paint) {
  disc(out, x, y, r, pal[3], paint)
  disc(out, x, y, r - 0.8, pal[2], paint)
  disc(out, x, y, r * 0.6, pal[1], paint)
  disc(out, x, y, Math.max(0.6, r * 0.32), WHITE, paint)
  zigOval(out, t, x, y, r + 1.2, r + 1.2, [[0, t % 2 ? WHITE : pal[1]]], paint)
  for (let i = 0; i < 2; i++) {
    const angle = rnd(a.seed, t * 2 + i, 150) * TAU
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)]
    const pts = boltPath(a.seed, t * 2 + i + 800, x + ux * r, y + uy * r, x + ux * (r + 4), y + uy * (r + 4), 1.5, 0.9)
    zap(out, pts, [[0, pal[2]]], 1, paint)
  }
}

// Brace and pump a growing orb of electricity at the mouth, heave it out with a recoil,
// and let it plow slowly into the target, which blows apart and is left locked in static
function zapcannon(out, t, a, g, c) {
  const pal = voltTones(c)
  const clip = clipTo(g)
  const m = g.mouth
  const recoil = Math.round(keys(t, [[0, 0], [5, -1], [CANNON_FIRE, -1], [CANNON_FIRE + 1, -3, easeOut], [CANNON_FIRE + 8, 0]]))
  out.dx = g.side * recoil + (t >= 14 && t < CANNON_FIRE ? tremble(t) : 0)
  if (t < CANNON_FIRE) {
    const f = phase(t, 0, CANNON_FIRE)
    out.sy = 1 - 0.05 * f
    out.shade = t % 2 ? rimGlow(g, out, pal[2], 0.2 * f, WHITE, 0.6 * f) : rimGlow(g, out, pal[2], 0.05, pal[1], 0.4 * f)
  } else if (t < CANNON_FIRE + 2) {
    out.shade = tint(WHITE, t === CANNON_FIRE ? 0.7 : 0.4)
    out.shake = [-g.side * 2, 0]
  } else if (t < a.ticks - 1) {
    const f = 1 - phase(t, CANNON_FIRE + 2, CANNON_HIT)
    out.shade = rimGlow(g, out, pal[2], 0.1 * f, pal[1], 0.6 * f)
  }
  const ox = m.x + g.side * 4 + out.dx
  const { x: tx, y: ty } = g.target
  const r = 1 + 2.8 * easeOut(phase(t, 2, CANNON_FIRE - 3))
  if (t >= 2 && t < CANNON_FIRE) {
    emit(t, { count: 14, start: 2, gap: 1.2, life: 5 }, (i, age, f) => {
      const angle = rnd(a.seed, i, 151) * TAU
      const d = (r + 6) * (1 - easeIn(f))
      dot(out, ox + Math.cos(angle) * d, m.y + Math.sin(angle) * d * 0.8, f < 0.5 ? pal[2] : WHITE)
    })
    if (t % 2) zap(out, boltPath(a.seed, t + 900, m.x + out.dx, m.y + (t % 4) - 1, ox, m.y, 1.5, 1), [[0, pal[1]]])
    orb(out, t, a, ox, m.y, r, pal, clip)
  } else if (t < CANNON_HIT) {
    const f = easeIn(phase(t, CANNON_FIRE, CANNON_HIT))
    const x = lerp(ox, tx, f)
    const y = lerp(m.y, ty, f)
    for (let i = 0; i < 2; i++) {
      const tail = boltPath(a.seed, t * 3 + i + 950, x, y + (i ? 1 : -1), x - g.side * (5 + f * 4), y + (i ? 2 : -2), 2, 1)
      zap(out, tail, [[0, i ? pal[3] : pal[2]]], 1, clip)
    }
    orb(out, t, a, x, y, r + (t % 2 ? 0.4 : 0), pal, clip)
  }
  const k = t - CANNON_HIT
  if (k < 0) return
  if (k < 3) disc(out, tx, ty, 5 - k, k ? pal[1] : WHITE, clip)
  if (k < 4) burst(out, tx, ty, 9 - k, pal[2])
  if (k < 6) zigOval(out, t, tx, ty, 4 + k * 1.8, 3 + k * 1.4, k < 3 ? [[1, glowOf(pal)], [0, WHITE]] : [[0, pal[3]]], clip)
  if (k < 12) sparkBurst(out, a, tx, ty, k + 1, 14, 152, pal, 1.2)
  if (k >= 5 && t < a.ticks - 3 && t % 3 !== 2) {
    zigOval(out, t, tx, ty, 3.5 - (t % 3) * 0.5, 3 - (t % 3) * 0.5, [[0, (t >> 1) % 2 ? pal[1] : pal[3]]], clip)
    spark(out, tx + (rnd(a.seed, t, 153) - 0.5) * 8, ty + (rnd(a.seed, t, 154) - 0.5) * 7, 1, pal[2])
  }
  emit(t, { count: 4, start: CANNON_HIT + 3, gap: 2, life: 9 }, (i, age, f) => {
    const py = ty - 2 - age * 0.7
    if (py >= 1) puff(out, tx + (rnd(a.seed, i, 155) - 0.5) * 5, py, 1 + f, mix(0x6a6a70, 0x9a9aa0, f), i)
  })
}

const FANG_SNAP = 12
const FANG_JOLTS = [14, 18, 22]

// One fang of light, five wide at the root and tapering to a white tip, amber on its
// shaded side so it reads on a light terminal
function voltFang(out, x, root, tip, pal) {
  const dir = Math.sign(tip - root) || 1
  const len = Math.abs(tip - root)
  for (let s = 0; s <= len; s++) {
    const half = Math.round(2 * (1 - s / (len + 1)) - 0.1)
    for (let u = -half; u <= half; u++) {
      const col = s === len ? WHITE : u === -half ? WHITE : u === half ? pal[3] : u < 0 ? pal[1] : pal[2]
      dot(out, x + u, root + dir * s, col)
    }
  }
}

// Rear back as fangs of light open wide over the target, lunge and snap them shut,
// then hold on as the current pulses through three times
function thunderfang(out, t, a, g, c) {
  const pal = voltTones(c)
  const far = clamp(g.reach - 10, 0, 5)
  const jolt = FANG_JOLTS.some((j) => t - j >= 0 && t - j < 2)
  const body = keys(t, [[0, 0], [8, -2, easeOut], [FANG_SNAP - 3, -2], [FANG_SNAP, far, easeIn], [24, far], [32, 0]])
  out.dx = g.side * Math.round(body + (jolt ? 1 : 0))
  out.skew = lean(g, g.side * keys(t, [[0, 0], [8, -2], [FANG_SNAP - 3, -2], [FANG_SNAP, 3, easeIn], [24, 2], [32, 0]]))
  if (t === FANG_SNAP) out.shake = [g.side * 2, 1]
  else if (jolt) out.shake = [t % 2 ? g.side : -g.side, 0]
  if (t < a.ticks - 1) {
    if (t === FANG_SNAP) out.shade = tint(WHITE, 0.6)
    else if (jolt) out.shade = tint(pal[1], 0.5)
    else if (t > 2 && t < 26) out.shade = rimGlow(g, out, pal[2], 0.12, pal[1], t % 2 ? 0.7 : 0.4)
  }
  if (t < 2 || t >= 30 || (t >= 26 && t % 2)) return
  const bx = clamp(g.target.x + g.side, 6, g.columns - 7)
  const by = clamp(g.target.y, 10, g.ground - 8)
  const open = Math.round(keys(t, [[2, 8], [7, 5, easeOut], [FANG_SNAP - 3, 5], [FANG_SNAP, 0, easeIn], [25, 0], [29, 3]]))
  const up = by - 1 - open
  const down = by + 1 + open
  for (const u of [-3, 3]) voltFang(out, bx + u, up - 5, up, pal)
  for (const u of [-3, 3]) voltFang(out, bx + u, down + 4, down, pal)
  if (t < FANG_SNAP) {
    for (const [x, y] of [[bx - 3, up], [bx + 3, up], [bx - 3, down], [bx + 3, down]]) {
      if ((t + x + y) % 3) dot(out, x + ((t + y) % 3) - 1, y + (y < by ? 1 : -1), pal[1])
    }
  }
  const k = t - FANG_SNAP
  if (k >= 0 && k < 3) burst(out, bx, by, 6 - k, pal[2])
  for (const j of FANG_JOLTS) {
    const age = t - j
    if (age < 0 || age >= 3) continue
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * TAU + rnd(a.seed, i, j) * 0.8
      const pts = boltPath(a.seed, i + j * 7, bx, by, bx + Math.cos(angle) * (5 + age), by + Math.sin(angle) * (4 + age), 2, 1)
      zap(out, pts, age < 2 ? [[1, glowOf(pal)], [0, WHITE]] : [[0, pal[3]]])
    }
  }
  if (k >= 1 && k < 14) sparkBurst(out, a, bx, by, ((k - 1) % 4) + 1, 4, 160 + Math.floor((k - 1) / 4), pal, 0.9)
}

const SHOCKWAVE_LAUNCH = [6, 11, 16]
const SHOCKWAVE_SPEED = 2.6
const SHOCKWAVE_LEN = 12

// A rippling ring, its edge rolling in and out like a wave
function rippleRing(out, t, x, y, r, layers) {
  const steps = Math.max(12, Math.round(r * 5))
  const pts = []
  for (let k = 0; k <= steps; k++) {
    const angle = (k / steps) * TAU
    const rr = r + Math.sin(angle * 5 + t) * 0.9
    pts.push([x + Math.cos(angle) * rr, y + Math.sin(angle) * rr * 0.85])
  }
  zap(out, pts, layers)
}

// Rise and drop to send three quick packets of rolling electric waveform gliding
// straight to the target, each one rippling around it on arrival
function shockwave(out, t, a, g, c) {
  const pal = voltTones(c)
  const m = g.mouth
  const { x: tx, y: ty } = g.target
  const span = Math.max(1, Math.abs(tx - m.x))
  const launched = SHOCKWAVE_LAUNCH.some((l) => t - l >= 0 && t - l < 2)
  if (t < SHOCKWAVE_LAUNCH[0]) {
    out.dy = t >= 2 ? -1 : 0
    out.sy = 1 + 0.04 * phase(t, 0, SHOCKWAVE_LAUNCH[0])
  } else if (launched) {
    out.dx = g.side
  }
  if (t < a.ticks - 1) {
    const f = t < SHOCKWAVE_LAUNCH[0] ? phase(t, 0, SHOCKWAVE_LAUNCH[0]) : 1 - phase(t, SHOCKWAVE_LAUNCH[2] + 4, a.ticks - 2)
    out.shade = launched ? tint(pal[1], 0.4) : rimGlow(g, out, pal[2], 0.1 * f, pal[1], (t % 2 ? 0.7 : 0.4) * f)
  }
  if (t < SHOCKWAVE_LAUNCH[0]) {
    for (const d of [-1, 1]) dot(out, m.x + g.side, m.y + d * (2 + (t % 2)), t % 2 ? WHITE : pal[2])
  }
  SHOCKWAVE_LAUNCH.forEach((launch, n) => {
    const age = t - launch
    if (age < 0) return
    const front = age * SHOCKWAVE_SPEED
    const pts = []
    for (let d = Math.max(0, front - SHOCKWAVE_LEN); d <= Math.min(span, front); d += 0.5) {
      const u = (d - (front - SHOCKWAVE_LEN)) / SHOCKWAVE_LEN
      const amp = 3.4 * Math.sin(Math.PI * clamp(u, 0, 1))
      pts.push([m.x + g.side * d, lerp(m.y, ty, d / span) + amp * Math.sin(d * 0.75 - age * 1.3 + n)])
    }
    if (pts.length > 1) zap(out, pts, [[1, n === 1 ? pal[3] : glowOf(pal)], [0, WHITE]])
    const k = age - span / SHOCKWAVE_SPEED
    if (k >= 0 && k < 5) rippleRing(out, t, tx, ty, 2 + k * 1.2, k < 2 ? [[1, glowOf(pal)], [0, WHITE]] : [[0, pal[2]]])
    if (k >= 0 && k < 2) disc(out, tx, ty, 1.5, WHITE)
  })
  const last = SHOCKWAVE_LAUNCH[2] + span / SHOCKWAVE_SPEED + 5
  if (t >= last && t < a.ticks - 3 && t % 2) spark(out, tx + (rnd(a.seed, t, 170) - 0.5) * 8, ty + (rnd(a.seed, t, 171) - 0.5) * 7, 1, pal[2])
}

const CBEAM_FIRE = 10
const CBEAM_STOP = 26
const CBEAM_BACK = 34
const CBEAM_SPEED = 6

// Gather a spark at the mouth, then fire a steady beam of light wound in a crackling
// double helix, and drink the leftover charge back in to glow stronger
function chargebeam(out, t, a, g, c) {
  const pal = voltTones(c)
  const m = g.mouth
  const { x: tx, y: ty } = g.target
  const span = Math.max(1, Math.abs(tx - m.x))
  const yAt = (d) => lerp(m.y, ty, d / span)
  if (t < a.ticks - 1) {
    if (t < CBEAM_FIRE) {
      const f = phase(t, 0, CBEAM_FIRE)
      out.dx = t >= 3 ? -g.side : 0
      out.shade = rimGlow(g, out, pal[2], 0.1 * f, pal[1], 0.6 * f)
    } else if (t < CBEAM_STOP) {
      out.dx = t % 3 === 0 ? 0 : g.side
      out.shade = t % 2 ? tint(pal[1], 0.3) : rimGlow(g, out, pal[2], 0.15, WHITE, 0.6)
    } else {
      const k = t - CBEAM_BACK
      const f = k < 0 ? phase(t, CBEAM_STOP, CBEAM_BACK) : 1 - phase(t, CBEAM_BACK + 2, a.ticks - 2)
      out.shade = k >= 0 && k < 2 ? tint(WHITE, 0.6) : rimGlow(g, out, pal[2], 0.25 * f, WHITE, 0.8 * f)
      if (k >= 0 && k < 3) out.sy = 1.05
    }
  }
  if (t < CBEAM_FIRE) {
    emit(t, { count: 12, gap: 0.7, life: 5 }, (i, age, f) => {
      const angle = rnd(a.seed, i, 180) * TAU
      const d = 7 * (1 - easeIn(f))
      dot(out, m.x + g.side + Math.cos(angle) * d, m.y + Math.sin(angle) * d * 0.8, f < 0.5 ? pal[2] : WHITE)
    })
    disc(out, m.x + g.side, m.y, 0.5 + 1.5 * phase(t, 2, CBEAM_FIRE), t % 2 ? WHITE : pal[1])
  } else if (t < CBEAM_STOP) {
    const reach = Math.min(span, (t - CBEAM_FIRE + 1) * CBEAM_SPEED)
    const fading = t >= CBEAM_STOP - 3
    for (let d = 0; d <= reach; d++) {
      const x = m.x + g.side * d
      const y = yAt(d)
      if (!fading) {
        dot(out, x, y - 1, pal[1])
        dot(out, x, y + 1, pal[1])
      }
      dot(out, x, y, WHITE)
      const twist = d * 0.55 - t * 1.4
      for (const [off, col] of [[0, pal[2]], [Math.PI, pal[3]]]) {
        const s = Math.sin(twist + off)
        if (!fading || (d + t) % 2) dot(out, x, y + s * 2.4, Math.cos(twist + off) > 0 ? col : glowOf(pal))
      }
    }
    if (reach >= span) {
      disc(out, tx, ty, t % 2 ? 3 : 2.5, pal[1])
      disc(out, tx, ty, 1.5, WHITE)
      if (t % 2) burst(out, tx, ty, 5, pal[2])
      sparkBurst(out, a, tx, ty, ((t - CBEAM_FIRE) % 5) + 1, 4, 181 + Math.floor(t / 5), pal, 0.9)
    }
    disc(out, m.x + g.side, m.y, 2, t % 2 ? WHITE : pal[1])
  }
  emit(t, { count: 10, start: CBEAM_STOP, gap: 0.5, life: 7 }, (i, age, f) => {
    const d = span * (1 - easeIn(f))
    const x = m.x + g.side * d
    const y = yAt(d) + (i % 3) - 1
    dot(out, x, y, WHITE)
    dot(out, x + g.side, y, pal[2])
    dot(out, x + g.side * 2, y, pal[3])
  })
  if (t >= CBEAM_BACK && t < CBEAM_BACK + 6) {
    crackle(out, t, a, g, pal, 3, 4)
    sparkBurst(out, a, g.cx, g.top, t - CBEAM_BACK + 1, 6, 182, pal, 0.8)
  }
}

const MAG_UP = 12
const MAG_DOWN = 38

// Facing out, field lines loop under the feet and rings pulse along the ground as the
// mon floats up and bobs on the magnetism, then sinks gently back down
function magnetrise(out, t, a, g, c) {
  const pal = voltTones(c)
  const lift = keys(t, [[0, 0], [3, 0], [MAG_UP, 3, easeOut], [MAG_DOWN, 3], [a.ticks - 3, 0]])
  const bob = t >= MAG_UP && t < MAG_DOWN ? Math.sin((t - MAG_UP) * 0.45) * 0.9 : 0
  out.dy = -Math.round(lift + bob)
  const on = phase(t, 2, 8) * (1 - phase(t, MAG_DOWN + 2, a.ticks - 2))
  if (t < a.ticks - 1) out.shade = rimGlow(g, out, pal[2], 0.08 * on, t % 4 < 2 ? WHITE : pal[1], 0.55 * on)
  if (on <= 0) return
  const feet = g.bottom + out.dy + 1
  const half = (g.right - g.left) / 2
  // Rings of force rise from the ground to the feet, the far half of each behind the mon
  emit(t, { count: 12, start: 3, gap: 3, life: 6 }, (i, age, f) => {
    if (3 + i * 3 > MAG_DOWN + 2) return
    const y = lerp(g.ground, Math.min(g.ground, feet), easeOut(f))
    const rx = half * (0.8 - 0.35 * f) + 1.5
    const steps = Math.max(12, Math.round(rx * 4))
    for (let s = 0; s < steps; s++) {
      const angle = (s / steps) * TAU
      const near = Math.sin(angle) > 0
      const col = near ? (f < 0.5 ? WHITE : pal[2]) : pal[3]
      ;(near ? dot : back)(out, g.cx + Math.cos(angle) * rx, Math.min(g.ground, y + Math.sin(angle) * 1.2), col)
    }
  })
  if (lift > 0.5 && t % 2 === 0) zigOval(out, t, g.cx, g.ground, half * 0.7 + 1, 0.4, [[0, pal[3]]])
  if (lift > 1 && t % 2) {
    const x = lerp(g.left + 1, g.right - 1, rnd(a.seed, t, 190))
    spark(out, x, feet + rnd(a.seed, t, 191) * Math.max(0, g.ground - feet), 1, pal[2])
  }
}

const EBALL_THROW = 11
const EBALL_HIT = 23

// A ball of lightning, its two arcs whirling around it
function voltBall(out, t, x, y, r, pal) {
  disc(out, x, y, r + 0.6, pal[3])
  disc(out, x, y, r, pal[2])
  disc(out, x, y, r * 0.5, WHITE)
  ring(out, x, y, r + 1.4, WHITE, t * 0.9, 0.8)
  ring(out, x, y, r + 1.4, pal[1], t * 0.9 + Math.PI, 0.8)
}

// Raise a crackling ball overhead, then lob it in a quick arc that pops on the target
// in a ring of sparks
function electroball(out, t, a, g, c) {
  const pal = voltTones(c)
  const hx = g.mouth.x
  const hy = Math.max(4, g.top - 1)
  const { x: tx, y: ty } = g.target
  if (t < EBALL_THROW) {
    out.dy = t >= 3 ? -1 : 0
    out.sy = 1 + 0.04 * phase(t, 0, 6)
  } else if (t < EBALL_THROW + 3) {
    out.dx = g.side
    out.skew = lean(g, g.side * 2)
  }
  if (t < a.ticks - 1) {
    const f = t < EBALL_THROW ? phase(t, 0, 6) : 1 - phase(t, EBALL_THROW, EBALL_HIT)
    out.shade = rimGlow(g, out, pal[2], 0.1 * f, pal[1], 0.6 * f)
  }
  if (t >= 1 && t < EBALL_THROW) {
    const r = 0.8 + 1.6 * easeOut(phase(t, 1, 8))
    const y = hy - Math.round(phase(t, 1, 8))
    voltBall(out, t, hx, y, r, pal)
    if (t % 2) zap(out, boltPath(a.seed, t + 990, hx, g.top + 1, hx + (t % 4) - 1, y + r, 1.5, 1), [[0, pal[1]]])
  } else if (t < EBALL_HIT) {
    const at = (tick) => {
      const f = phase(tick, EBALL_THROW, EBALL_HIT)
      return [lerp(hx, tx, f), Math.max(3, lerp(hy - 1, ty, f) - 16 * f * (1 - f))]
    }
    for (let k = 1; k <= 4; k++) {
      const [px, py] = at(t - k * 0.6)
      dot(out, px, py, k < 3 ? pal[1] : pal[3])
    }
    const [x, y] = at(t)
    voltBall(out, t, x, y, 2.4, pal)
  }
  const k = t - EBALL_HIT
  if (k < 0) return
  if (k < 2) disc(out, tx, ty, 3 - k, WHITE)
  if (k < 3) burst(out, tx, ty, 5 - k, pal[2])
  if (k < 6) zigOval(out, t, tx, ty, 2.5 + k * 1.5, 2 + k * 1.2, k < 3 ? [[0, WHITE]] : [[0, pal[3]]])
  if (k < 10) sparkBurst(out, a, tx, ty, k + 1, 10, 200, pal, 1)
  if (k >= 4 && t < a.ticks - 3 && t % 3 === 0) zap(out, boltPath(a.seed, t + 1000, tx - 3, ty + (t % 5) - 2, tx + 3, ty - (t % 5) + 2, 1.5, 1), [[0, pal[2]]])
}

const WILD_DASH = 11
const WILD_HIT = 16
const WILD_RECOIL = 24

// Wreathed in a cage of lightning, crouch and tear into the target leaving afterimages,
// crash in a huge burst, then get thrown back as the recoil jolts the mon itself
function wildcharge(out, t, a, g, c) {
  const pal = voltTones(c)
  const far = clamp(g.reach - 6, 2, 12)
  const path = [[0, 0], [WILD_DASH, -2, easeOut], [WILD_HIT, far, easeIn], [WILD_HIT + 3, far - 1], [WILD_RECOIL, far - 1], [WILD_RECOIL + 4, -2, easeOut], [WILD_RECOIL + 12, 0]]
  const at = (tick) => Math.round(keys(tick, path))
  out.dx = g.side * at(t) + (t >= 6 && t < WILD_DASH ? tremble(t) : 0)
  const recoil = t - WILD_RECOIL
  if (t >= WILD_DASH && t < WILD_HIT) {
    out.sx = 1.06
    out.sy = 0.96
    for (const k of [4, 2]) out.ghosts.push(ghost(g.side * at(t - k), 0, k > 2 ? pal[2] : pal[1], 0.3 + k * 0.08))
  } else if (t < WILD_DASH) {
    out.sy = 1 - 0.06 * easeOut(phase(t, 0, WILD_DASH))
  }
  if (t === WILD_HIT) out.shake = [g.side * 2, 1]
  if (t === WILD_HIT + 1) out.shake = [-g.side * 2, 0]
  if (recoil >= 0 && recoil < 4) out.shake = [recoil % 2 ? g.side : -g.side, recoil % 2]
  if (t < a.ticks - 1) {
    const f = t < WILD_HIT ? phase(t, 0, 6) : 1 - phase(t, WILD_RECOIL + 6, a.ticks - 2)
    if (t === WILD_HIT) out.shade = tint(WHITE, 0.8)
    else if (recoil >= 0 && recoil < 6) out.shade = tint(recoil % 2 ? WHITE : pal[1], 0.6)
    else out.shade = t % 2 ? rimGlow(g, out, pal[2], 0.3 * f, WHITE, 0.8 * f) : rimGlow(g, out, pal[2], 0.15 * f, pal[1], 0.6 * f)
  }
  const [rx, ry] = bodyRadii(g)
  if (t >= 3 && t < WILD_RECOIL + 6) {
    moved(out, out.dx, out.dy, (buf) => {
      crackle(buf, t, a, g, pal, 3, 6)
      bodyArcs(buf, t, a, g, pal, t < WILD_HIT ? 2 : 1)
    })
    if (t < WILD_RECOIL) zigOval(out, t, g.cx + out.dx, g.cy, rx + 1, ry + 0.5, [[0, t % 2 ? pal[3] : pal[2]]], back)
  }
  if (t >= WILD_DASH && t < WILD_HIT) {
    for (let k = 0; k < 3; k++) {
      const y = g.ground - k * 2
      const x0 = g.cx + out.dx - g.side * rx
      zap(out, boltPath(a.seed, t * 3 + k + 1100, x0, y, x0 - g.side * (6 + k * 2), y - 1, 2, 0.8), [[0, k ? pal[3] : pal[2]]])
    }
  }
  const hx = g.mouth.x + g.side * (far + 1)
  const hy = g.mouth.y + 1
  const k = t - WILD_HIT
  if (k >= 0 && k < 3) disc(out, hx, hy, 3.5 - k, k ? pal[1] : WHITE)
  if (k >= 0 && k < 5) burst(out, hx, hy, 8 - k, pal[2])
  if (k >= 0 && k < 12) sparkBurst(out, a, hx, hy, k + 1, 14, 210, pal, 1.3)
  if (k >= 0 && k < 4) {
    for (let i = 0; i < 5; i++) {
      const angle = rnd(a.seed, i, 211 + k) * TAU
      zap(out, boltPath(a.seed, i + k * 5 + 1200, hx, hy, hx + Math.cos(angle) * 8, hy + Math.sin(angle) * 6, 2.5, 1.2), [[0, k < 2 ? WHITE : pal[2]]])
    }
  }
  if (recoil >= 0 && recoil < 4) {
    const mid = shownAt(g, out, g.cx, g.cy)
    for (let i = 0; i < 2; i++) {
      const pts = boltPath(a.seed, recoil * 2 + i + 1300, hx, hy - 2 + i * 4, mid.x, mid.y - 2 + i * 4, 3, 1.6)
      zap(out, pts, recoil < 2 ? [[1, glowOf(pal)], [0, WHITE]] : [[0, pal[3]]])
    }
  }
}

const WEB_SHOOT = 8
const WEB_LAND = 18
const WEB_FADE = 34

// An electric web: eight crackling spokes and rings of sagging strands, the inner ring
// only once it is big enough to show the gaps
function web(out, a, x, y, r, spin, salt, layers, rings = true) {
  const spoke = (k, rr) => {
    const angle = (k / 8) * TAU + spin
    return [x + Math.cos(angle) * rr, y + Math.sin(angle) * rr * 0.85]
  }
  for (let k = 0; k < 8; k++) {
    const [ex, ey] = spoke(k, r)
    zap(out, boltPath(a.seed, salt + k, x, y, ex, ey, 2, 0.5), layers)
  }
  if (!rings) return
  for (const f of r >= 5 ? [0.5, 0.95] : [0.95]) {
    const pts = []
    for (let k = 0; k <= 8; k++) {
      pts.push(spoke(k, r * f))
      if (k < 8) pts.push(spoke(k + 0.5, r * f * 0.8))
    }
    zap(out, pts, layers)
  }
}

// Pull back and fling a net of electricity that spreads as it flies, wraps over the
// target and crackles there, then frays away strand by strand
function electroweb(out, t, a, g, c) {
  const pal = voltTones(c)
  const m = g.mouth
  const { x: tx, y: ty } = g.target
  if (t < WEB_SHOOT) {
    out.dx = t >= 2 ? -g.side : 0
    out.sy = 1 - 0.04 * phase(t, 0, WEB_SHOOT)
  } else if (t < WEB_SHOOT + 3) {
    out.dx = g.side
  }
  if (t < a.ticks - 1) {
    const f = t < WEB_SHOOT ? phase(t, 0, WEB_SHOOT) : 1 - phase(t, WEB_SHOOT, WEB_LAND)
    out.shade = t === WEB_SHOOT ? tint(pal[1], 0.5) : rimGlow(g, out, pal[2], 0.1 * f, pal[1], 0.6 * f)
  }
  if (t >= 2 && t < WEB_SHOOT) {
    if (t < WEB_SHOOT - 3) crackle(out, t, a, g, pal, 2, 11)
    else spark(out, m.x + g.side, m.y, t % 2 ? 2 : 1, pal[2])
  } else if (t >= WEB_SHOOT && t < WEB_LAND) {
    const f = easeOut(phase(t, WEB_SHOOT, WEB_LAND))
    const x = lerp(m.x + g.side * 2, tx, f)
    const y = lerp(m.y, ty, f) - Math.sin(f * Math.PI) * 2
    web(out, a, x, y + 1, 2.5 + 5 * f, t * 0.3, t * 9, [[0, pal[3]]])
    web(out, a, x, y, 2.5 + 5 * f, t * 0.3, t * 9, [[0, (t >> 1) % 2 ? WHITE : pal[1]]])
  } else if (t >= WEB_LAND && t < a.ticks - 2) {
    const k = t - WEB_LAND
    const r = 8 + (k < 3 ? 1 - k * 0.5 : t % 4 < 2 ? 0.4 : 0)
    const flare = k % 4 === 0
    const fraying = t >= WEB_FADE
    const layers = flare && !fraying ? [[0, WHITE]] : [[0, fraying ? pal[3] : (t >> 1) % 2 ? pal[2] : pal[1]]]
    const rr = r - (fraying ? (t - WEB_FADE) * 0.6 : 0)
    if (!fraying) web(out, a, tx, ty + 1, rr, WEB_LAND * 0.3, (t >> 1) * 9, [[0, pal[3]]])
    web(out, a, tx, ty, rr, WEB_LAND * 0.3, (t >> 1) * 9, layers, !fraying)
    if (k < 3) burst(out, tx, ty, 4 - k, pal[2])
    if (flare && !fraying) sparkBurst(out, a, tx, ty, 2, 6, 220 + k, pal, 1)
    if (t % 2 && t < WEB_FADE + 2) spark(out, tx + (rnd(a.seed, t, 221) - 0.5) * 12, ty + (rnd(a.seed, t, 222) - 0.5) * 10, 1, pal[2])
  }
}

const STRIKE_CALL = 8
const STRIKE_DASH = 22
const STRIKE_HIT = 28

// A bolt from the sky strikes the mon and cloaks it in blazing lightning, it rockets
// into the target, and the impact erupts in bolts shooting up to the sky
function boltstrike(out, t, a, g, c) {
  const pal = voltTones(c)
  const far = clamp(g.reach - 6, 2, 14)
  const path = [[0, 0], [STRIKE_CALL + 2, 0], [STRIKE_DASH, -3, easeOut], [STRIKE_HIT, far, easeIn], [STRIKE_HIT + 5, far], [STRIKE_HIT + 16, 0]]
  const at = (tick) => Math.round(keys(tick, path))
  out.dx = g.side * at(t) + (t >= STRIKE_CALL + 4 && t < STRIKE_DASH ? tremble(t) : 0)
  const call = t - STRIKE_CALL
  const k = t - STRIKE_HIT
  if (t < STRIKE_CALL) out.sy = 1 - 0.06 * easeOut(phase(t, 0, STRIKE_CALL))
  else if (call < 2) out.sy = 0.9
  else if (t < STRIKE_DASH) out.sy = 1.04
  else if (t < STRIKE_HIT) {
    out.sx = 1.08
    out.sy = 0.95
    for (const j of [4, 2]) out.ghosts.push(ghost(g.side * at(t - j), 0, j > 2 ? pal[1] : WHITE, 0.35 + j * 0.08))
  }
  if (call >= 0 && call < 3) out.shake = [0, call % 2 ? -1 : 1]
  if (k >= 0 && k < 5) out.shake = [[2 * g.side, 1], [-2 * g.side, -1], [g.side, 1], [-g.side, 0], [g.side, 0]][k]
  if (t < a.ticks - 1) {
    if (call >= 0 && call < 2) out.shade = tint(WHITE, 0.9)
    else if (call >= 0 && k < 4) out.shade = t % 2 ? tint(WHITE, 0.55) : tint(pal[1], 0.5)
    else {
      const f = call < 0 ? phase(t, 0, STRIKE_CALL) * 0.5 : 1 - phase(t, STRIKE_HIT + 4, a.ticks - 2)
      out.shade = rimGlow(g, out, pal[2], 0.2 * f, WHITE, 0.7 * f)
    }
  }
  if (call >= 0 && call < 4) {
    const x = g.cx + (rnd(a.seed, 1, 230) - 0.5) * 6
    const pts = boltPath(a.seed, 230 + (call > 1 ? 1 : 0), x, 0, g.cx, g.top, 3, 2)
    zap(out, forkOf(a.seed, 231, pts, 1, 0.8, 5), [[0, pal[1]]])
    zap(out, pts, [[[2, pal[3]], [1.5, pal[2]], [1, WHITE]], [[1.5, pal[3]], [1, WHITE]], [[1, pal[2]], [0, WHITE]], [[0, pal[3]]]][call])
  }
  const [rx, ry] = bodyRadii(g)
  if (call >= 0 && k < 6) {
    zigOval(out, t, g.cx + out.dx, g.cy, rx + 1.5, ry + 1, [[1, pal[3]], [0, t % 2 ? pal[1] : pal[2]]], back)
    moved(out, out.dx, out.dy, (buf) => {
      crackle(buf, t, a, g, pal, 4, 7)
      bodyArcs(buf, t, a, g, pal, 2)
    })
  }
  const { x: tx, y: ty } = g.target
  if (k < 0) return
  if (k === 0) thunderFlash(out, g, 10, FLASH)
  if (k === 1) thunderFlash(out, g, 5, FLASH_DIM)
  if (k < 3) disc(out, tx, ty, 4 - k, WHITE)
  if (k < 5) burst(out, tx, ty, 9 - k, pal[2])
  if (k < 6) {
    for (let i = -1; i <= 1; i++) {
      const pts = boltPath(a.seed, i + 240 + (k >> 1) * 3, tx + i * 2, ty, tx + i * 5, 0, 3, 1.8)
      zap(out, pts, k < 2 ? [[1.5, pal[3]], [1, pal[2]], [0, WHITE]] : k < 4 ? [[1, pal[2]], [0, WHITE]] : [[0, pal[3]]])
    }
  }
  if (k < 14) sparkBurst(out, a, tx, ty, k + 1, 16, 241, pal, 1.4)
  emit(t, { count: 5, start: STRIKE_HIT + 4, gap: 2, life: 10 }, (i, age, f) => {
    const py = ty - 1 - age * 0.8
    if (py >= 1) puff(out, tx + (rnd(a.seed, i, 242) - 0.5) * 6 + Math.sin(age * 0.6 + i), py, 1 + f * 1.4, mix(0x6a6a70, 0x9a9aa0, f), i)
  })
}

const FUSION_BALL = 10
const FUSION_HIT = 20
const FUSION_HOME = 30
const FUSION_FORM = 36

// A comet of lightning: a white hot core in a crackling shell
function comet(out, t, x, y, r, pal, paint) {
  disc(out, x, y, r + 0.5, pal[3], paint)
  disc(out, x, y, r - 0.3, pal[1], paint)
  disc(out, x, y, r * 0.55, WHITE, paint)
  zigOval(out, t, x, y, r + 1.5, r + 1.2, [[0, t % 2 ? WHITE : pal[2]]], paint)
}

// Shrink into a white hot ball of lightning, streak into the target trailing bolts,
// ricochet home off the blast, and burst back out into the mon
function fusionbolt(out, t, a, g, c) {
  const pal = voltTones(c)
  const clip = clipTo(g)
  const hx = g.cx
  const hy = Math.round(g.bottom - (g.bottom - g.top) * 0.25)
  const r = clamp((g.right - g.left) / 4, 2.5, 4.5)
  const { x: tx, y: ty } = g.target
  if (t < FUSION_BALL) {
    const f = easeIn(phase(t, 2, FUSION_BALL))
    out.sx = 1 - 0.55 * f
    out.sy = 1 - 0.55 * f
    out.shade = tint(t % 2 ? WHITE : pal[1], 0.15 + 0.7 * f)
    crackle(out, t, a, g, pal, 1 + (t >> 2), 8)
    const [rx, ry] = bodyRadii(g)
    for (let i = 0; i < 2; i++) ring(out, g.cx, g.cy, (Math.max(rx, ry) + 3) * (1 - f * 0.6), i ? pal[3] : pal[1], t * 0.8 + i * Math.PI, 0.6)
  } else if (t < FUSION_FORM) {
    out.hidden = true
  } else if (t < a.ticks - 1) {
    const f = easeOut(phase(t, FUSION_FORM, FUSION_FORM + 5))
    out.sx = 0.5 + 0.5 * f
    out.sy = 0.5 + 0.5 * f
    out.shade = tint(WHITE, 0.8 * (1 - phase(t, FUSION_FORM, a.ticks - 2)))
  }
  const k = t - FUSION_HIT
  if (t >= FUSION_BALL && t < FUSION_HIT) {
    const f = easeIn(phase(t, FUSION_BALL, FUSION_HIT))
    const x = lerp(hx, tx, f)
    const y = lerp(hy, ty, f)
    const len = 6 + f * 8
    for (let i = -1; i <= 1; i++) {
      const pts = boltPath(a.seed, t * 3 + i + 1400, x, y + i * r * 0.6, x - g.side * len * (1 - Math.abs(i) * 0.3), y + i * (r + 1), 2.5, 1.1)
      zap(out, pts, i ? [[0, pal[3]]] : [[1, glowOf(pal)], [0, WHITE]], 1, clip)
    }
    comet(out, t, x, y, r, pal, clip)
  } else if (k >= 0 && t < FUSION_HOME) {
    const f = easeInOut(phase(t, FUSION_HIT + 1, FUSION_HOME))
    const x = lerp(tx, hx, f)
    const y = lerp(ty, hy, f) - Math.sin(f * Math.PI) * 6
    for (let j = 1; j <= 3; j++) {
      const p = easeInOut(phase(t - j * 0.7, FUSION_HIT + 1, FUSION_HOME))
      clip(out, lerp(tx, hx, p), lerp(ty, hy, p) - Math.sin(p * Math.PI) * 6, j < 2 ? pal[1] : pal[3])
    }
    comet(out, t, x, y, r * 0.7, pal, clip)
  } else if (t >= FUSION_HOME && t < FUSION_FORM) {
    comet(out, t, hx, hy, r * (0.7 + 0.5 * phase(t, FUSION_HOME, FUSION_FORM)), pal, clip)
    crackle(out, t, a, g, pal, 2, 9)
  }
  if (k >= 0 && k < 3) disc(out, tx, ty, 5 - k, k ? pal[1] : WHITE, clip)
  if (k >= 0 && k < 4) burst(out, tx, ty, 8 - k, pal[2])
  if (k >= 0 && k < 6) zigOval(out, t, tx, ty, 4 + k * 1.6, 3 + k * 1.3, k < 3 ? [[1, glowOf(pal)], [0, WHITE]] : [[0, pal[3]]], clip)
  if (k >= 0 && k < 12) sparkBurst(out, a, tx, ty, k + 1, 12, 250, pal, 1.2)
  if (k >= 0 && k < 3) out.shake = [k % 2 ? -g.side : g.side * 2, k === 0 ? 1 : 0]
  const form = t - FUSION_FORM
  if (form >= 0 && form < 3) burst(out, hx, hy, 6 - form, pal[2])
  if (form >= 0 && form < 8) sparkBurst(out, a, g.cx, g.cy, form + 2, 10, 251, pal, 1)
}

const VS_FIRE = 8
const VS_HIT = 13
const VS_BACK = 22
const VS_GONE = 27
const VS_RETURN = 33

// The joints of a jagged bolt that bows along a curve, lifted `lift` pixels at its middle
function curvePath(seed, salt, x0, y0, x1, y1, lift, n, jag) {
  const pts = []
  for (let k = 0; k <= n; k++) {
    const f = k / n
    const off = k === 0 || k === n ? 0 : (k % 2 ? 1 : -1) * jag * (0.4 + rnd(seed, k, salt) * 0.8)
    pts.push([lerp(x0, x1, f) + off * 0.5, lerp(y0, y1, f) - lift * 4 * f * (1 - f) + off])
  }
  return pts
}

// Loose a bolt that loops over to the target, and as it lands the current races back
// along a low arc into the mon, which shrinks away into a spark and pops back out
function voltswitch(out, t, a, g, c) {
  const pal = voltTones(c)
  const clip = clipTo(g)
  const m = g.mouth
  const { x: tx, y: ty } = g.target
  const top = Math.min(8, m.y - 2, ty - 2)
  const low = Math.min(5, g.ground - Math.max(m.y, ty) - 1)
  if (t < VS_FIRE) {
    out.dy = t >= 2 ? -1 : 0
    out.dx = t >= 2 ? -g.side : 0
  } else if (t < VS_FIRE + 2) {
    out.dx = g.side
  }
  const gone = t - VS_BACK
  if (gone >= 0 && t < VS_GONE) {
    const f = easeIn(phase(t, VS_BACK, VS_GONE))
    out.sx = 1 - 0.75 * f
    out.sy = 1 - 0.75 * f
    out.shade = tint(WHITE, 0.6 + 0.4 * f)
    if (gone < 2) out.shake = [-g.side, gone ? 0 : 1]
  } else if (t >= VS_GONE && t < VS_RETURN) {
    out.hidden = true
  } else if (t >= VS_RETURN && t < a.ticks - 1) {
    const f = phase(t, VS_RETURN, VS_RETURN + 5)
    const s = f < 1 ? 0.3 + 0.85 * easeOut(f) : 1
    out.sx = Math.min(s, 1.08)
    out.sy = Math.min(s, 1.08)
    out.shade = tint(WHITE, 0.7 * (1 - phase(t, VS_RETURN, a.ticks - 3)))
  } else if (t < VS_BACK && t < a.ticks - 1) {
    const f = t < VS_FIRE ? phase(t, 0, VS_FIRE) : 1 - phase(t, VS_FIRE, VS_BACK)
    out.shade = rimGlow(g, out, pal[2], 0.15 * f, pal[1], (t % 2 ? 0.8 : 0.5) * f)
  }
  if (t < VS_FIRE) crackle(out, t, a, g, pal, 1 + (t >> 2), 10)
  if (t >= VS_FIRE && t < VS_HIT + 3) {
    const pts = curvePath(a.seed, t >> 1, m.x, m.y, tx, ty, top, 10, 1.4)
    const upto = t < VS_HIT ? phase(t + 1, VS_FIRE, VS_HIT) : 1
    zap(out, pts, t < VS_HIT + 1 ? [[1, glowOf(pal)], [0, WHITE]] : [[0, pal[3]]], upto, clip)
  }
  const k = t - VS_HIT
  if (k >= 0 && k < 3) burst(out, tx, ty, 5 - k, pal[2])
  if (k >= 0 && k < 8) sparkBurst(out, a, tx, ty, k + 1, 8, 260, pal, 0.9)
  const mid = { x: g.cx, y: g.cy }
  if (t >= VS_HIT + 1 && t < VS_BACK) {
    const f = phase(t, VS_HIT + 1, VS_BACK)
    const pts = curvePath(a.seed, 270 + (t >> 1), tx, ty, mid.x, mid.y, -low, 12, 1)
    const head = Math.round(f * (pts.length - 1))
    const tail = pts.slice(Math.max(0, head - 4), head + 1)
    if (tail.length > 1) zap(out, tail, [[1, glowOf(pal)], [0, WHITE]], 1, clip)
    disc(out, pts[head][0], pts[head][1], 1.2, WHITE, clip)
  }
  if (gone >= 0 && gone < 3) burst(out, mid.x, mid.y, 5 - gone, pal[2])
  if (t >= VS_GONE && t < VS_RETURN) {
    const y = g.bottom - 1
    spark(out, g.cx, y, t % 2 ? 2 : 1, pal[2])
    if (t % 2 === 0) dot(out, g.cx + (rnd(a.seed, t, 261) - 0.5) * 6, y - rnd(a.seed, t, 262) * 4, pal[1])
  }
  const pop = t - VS_RETURN
  if (pop >= 0 && pop < 8) sparkBurst(out, a, g.cx, g.cy, pop + 2, 10, 263, pal, 1)
}

export const ELECTRIC = {
  thundershock: { ticks: 36, color: 0xffe23f, draw: thundershock },
  thunderbolt: { ticks: 48, color: 0xffe23f, draw: thunderbolt },
  thunder: { ticks: 56, color: 0xffe23f, draw: thunder },
  thunderwave: { ticks: 40, color: 0xffe23f, draw: thunderwave },
  discharge: { ticks: 44, color: 0xffe23f, draw: discharge },
  spark: { ticks: 32, color: 0xffe23f, draw: sparkHit },
  charge: { ticks: 44, color: 0xffe23f, pose: { view: 'front' }, draw: charge },
  zapcannon: { ticks: 54, color: 0xffe23f, draw: zapcannon },
  thunderfang: { ticks: 36, color: 0xffe23f, draw: thunderfang },
  shockwave: { ticks: 38, color: 0xffe23f, draw: shockwave },
  chargebeam: { ticks: 44, color: 0xffe23f, draw: chargebeam },
  magnetrise: { ticks: 48, color: 0xffe23f, pose: { view: 'front' }, draw: magnetrise },
  electroball: { ticks: 38, color: 0xffe23f, draw: electroball },
  wildcharge: { ticks: 44, color: 0xffe23f, draw: wildcharge },
  electroweb: { ticks: 42, color: 0xffe23f, draw: electroweb },
  boltstrike: { ticks: 56, color: 0xffe23f, draw: boltstrike },
  fusionbolt: { ticks: 46, color: 0xffe23f, draw: fusionbolt },
  voltswitch: { ticks: 42, color: 0xffe23f, draw: voltswitch },
}
