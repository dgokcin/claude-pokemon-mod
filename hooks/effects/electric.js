// Electric moves

import {
  WHITE, back, burst, clamp, disc, dot, easeOut, emit, lerp, light, line, mix, phase, puff, rimGlow, rnd, shownAt,
  spark, tint,
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

export const ELECTRIC = {
  thundershock: { ticks: 36, color: 0xffe23f, draw: thundershock },
  thunderbolt: { ticks: 48, color: 0xffe23f, draw: thunderbolt },
  thunder: { ticks: 56, color: 0xffe23f, draw: thunder },
  thunderwave: { ticks: 40, color: 0xffe23f, draw: thunderwave },
}
