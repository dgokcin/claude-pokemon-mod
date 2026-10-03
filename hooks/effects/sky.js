// Flying and speed moves

import {
  WHITE, back, burst, clamp, disc, dot, easeIn, easeInOut, easeOut, emit, lerp, light, mix, phase, plus, ring, rnd,
  spark, sparkles, tremble,
} from './draw.js'
import { dust } from './earth.js'

// Air from the move's color: white, the color tinged blue, and two deeper blues that
// hold up on a light terminal
const air = (c) => [WHITE, mix(c, 0x8cc8f0, 0.3), mix(c, 0x4f8fd0, 0.6), mix(c, 0x2a5a96, 0.8)]

// Sky Attack's fire from its color: white hot, pale gold, gold, orange, deep red
const blaze = (c) => [WHITE, light(c, 0.5), c, mix(c, 0xff8a1a, 0.75), mix(c, 0xd02a10, 0.85)]

const LEAF = [0xa6e06e, 0x4fae4a, 0x2d6e2e]
const DUST = [0xe6d2a2, 0xc0a070, 0x86683e]
const SHADOW = [0x5a5a6a, 0x464654]

// A streak of air from its tail to its head, white at the head and thinning out behind
function streak(out, x0, y0, x1, y1, tones) {
  const steps = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
  for (let k = 0; k <= steps; k++) {
    const f = k / steps
    if (f < 0.2 && k % 2) continue
    dot(out, lerp(x0, x1, f), lerp(y0, y1, f), f > 0.8 ? tones[0] : f > 0.45 ? tones[1] : f > 0.2 ? tones[2] : tones[3])
  }
}

// A see-through afterimage: it keeps every other pixel in a checker that swaps each
// tick, recolored toward a color
const mirage = (t, dx, dy, color, f, flip = false) => ({
  dx, dy, flip, shade: (c, x, y) => ((x + y + t) % 2 ? null : mix(c, color, f)),
})

// Slides the sprite's rows sideways more the higher they are, leaning its top by up to
// `by` pixels
const lean = (g, dy, by) => (y) => by * clamp((g.bottom + dy - y) / (g.bottom - g.top + 1), 0, 1)

// The pixels just outside the sprite's outline, shifted to where it stands now, each
// flagged when it sits on top of the body
function rim(g, dx, dy) {
  const pts = []
  for (let y = g.top - 1; y <= g.bottom + 1; y++) {
    for (let x = g.left - 1; x <= g.right + 1; x++) {
      if (g.solid(x, y)) continue
      if (g.solid(x - 1, y) || g.solid(x + 1, y) || g.solid(x, y - 1) || g.solid(x, y + 1)) pts.push([x + dx, y + dy, !g.solid(x, y - 1) && g.solid(x, y + 1)])
    }
  }
  return pts
}

const GUST_FORM = 3
const GUST_GO = 13
const GUST_ARRIVE = 23
const GUST_FADE = 33
const GUST_LEAVES = 8

// The whirlwind's half width at height h (0 at the ground, 1 at the top), and how
// far its middle sways there
const funnelWidth = (h) => 0.7 + 5 * h ** 1.4
const funnelSway = (t, h) => Math.sin(t * 0.45 + h * 3) * h * 1.8

// Where the whirlwind stands at tick t, kept far enough from the edge to fit
const gustX = (t, g) => clamp(lerp(g.ahead(3), g.target.x, easeInOut(phase(t, GUST_GO, GUST_ARRIVE))), 6, g.columns - 7)
const gustHeight = (g) => clamp(g.ground - g.top - 1, 9, 17)

const SWIRL_ARC = (Math.PI * 2) / 3
const SWIRL_LEN = 1.15

// How far into one of the three streaks circling a row an angle falls, 0 to 1, or -1
function swirlAt(angle, spin) {
  const m = (((angle - spin) % SWIRL_ARC) + SWIRL_ARC) % SWIRL_ARC
  return m < SWIRL_LEN ? m / SWIRL_LEN : -1
}

// Rows of spinning air stacked into a funnel. Each row is a ring seen edge on, bright
// streaks in front and dim ones behind, twisted row to row into a spiral. grow builds
// it up from the ground and fray tears it apart.
function whirlwind(out, t, a, x, ground, height, grow, fray, tones) {
  const rows = Math.round(height * grow)
  for (let k = 0; k < rows; k++) {
    const h = k / height
    const r = funnelWidth(h) * (0.5 + 0.5 * grow) * (1 + fray * 0.6)
    const ax = x + funnelSway(t, h)
    const spin = t * 0.85 - k * 0.5
    for (let px = Math.ceil(ax - r); px <= Math.floor(ax + r); px++) {
      if (fray > 0 && rnd(a.seed, px * 64 + k, t >> 1) < fray) continue
      const u = clamp((px - ax) / Math.max(r, 0.5), -1, 1)
      const near = swirlAt(Math.acos(u), spin)
      const far = swirlAt(Math.PI * 2 - Math.acos(u), spin)
      if (near >= 0) dot(out, px, ground - k, near > 0.7 ? WHITE : tones[1])
      else if (far >= 0) dot(out, px, ground - k, tones[2])
      else if (Math.abs(u) > 0.8) dot(out, px, ground - k, tones[3])
    }
  }
}

// A leaf riding the whirlwind, climbing as it circles, flung out to flutter down
// once the wind breaks up. Only the leaves on the near or far side are drawn.
function gustLeaf(out, t, a, g, i, height, near) {
  const born = GUST_FORM + 4 + i * 2
  if (t < born) return
  const at = (s) => {
    const h = Math.min(0.92, 0.08 + (s - born) * 0.035 + rnd(a.seed, i, 20) * 0.3)
    const turn = (s - born) * 0.55 + i * 2.1
    return [gustX(s, g) + funnelSway(s, h) + (funnelWidth(h) + 1) * Math.cos(turn), g.ground - h * height, Math.sin(turn)]
  }
  let [x, y, depth] = at(Math.min(t, GUST_FADE))
  if (t > GUST_FADE) {
    const age = t - GUST_FADE
    // Flung out both ways, but carried on with the wind so none blow back at the mon
    const away = Math.sign(x - gustX(GUST_FADE, g)) || 1
    x += (away * (0.4 + rnd(a.seed, i, 21) * 0.5) + g.side * 0.5) * age + Math.sin(age * 0.7 + i) * 1.2
    y = Math.min(g.ground, y - age * 0.9 + age * age * 0.07)
    depth = 1
  }
  if (depth > 0 !== near) return
  const flat = (t + i) % 4 < 2
  const [lit, mid] = near ? [LEAF[0], LEAF[1]] : [LEAF[1], LEAF[2]]
  dot(out, x, y, lit)
  dot(out, x + 1, flat ? y : y - 1, mid)
  if (i % 2 === 0) dot(out, x + (flat ? 2 : 1), flat ? y : y - 2, LEAF[2])
}

// Flap hard and whip up a whirlwind that spins over to the target, sweeping up
// leaves and dust, then tears apart and lets the leaves flutter down
function gust(out, t, a, g, c) {
  const tones = air(c)
  const beat = Math.sin(t * 0.95)
  const lift = easeOut(phase(t, 0, 4)) * (1 - easeInOut(phase(t, 28, 38)))
  out.dy = -Math.round(lift * (2 + 1.6 * beat))
  out.sy = 1 + 0.06 * beat * lift

  // Gusts thrown off each wingbeat, curling forward to feed the whirlwind
  emit(t, { count: 9, gap: 3, start: 1, life: 7 }, (i, age) => {
    const y0 = g.cy - 5 + (i % 3) * 4 + out.dy
    const at = (s) => [g.ahead(s * 2.3 - 2), y0 + Math.sin(s * 0.55 + i) * 2]
    for (let s = 0; s <= 2; s += 0.25) {
      if (age - s < 0) break
      const [px, py] = at(age - s)
      dot(out, px, py, tones[s < 0.5 ? 0 : s < 1.25 ? 1 : 2])
    }
  })

  const height = gustHeight(g)
  const x = gustX(t, g)
  const grow = easeOut(phase(t, GUST_FORM, GUST_GO))
  const fray = easeIn(phase(t, GUST_FADE, a.ticks - 2))
  for (let i = 0; i < GUST_LEAVES; i++) gustLeaf(out, t, a, g, i, height, false)
  if (t >= GUST_FORM && fray < 1) whirlwind(out, t, a, x, g.ground, height, grow, fray, tones)

  // A skirt of dust whipped around the foot of the funnel, thickest once it arrives
  if (t >= GUST_FORM && t < GUST_FADE + 4) {
    const grit = t >= GUST_ARRIVE ? 10 : 6
    for (let j = 0; j < grit; j++) {
      const turn = t * 0.7 + j * (Math.PI * 2 / grit)
      const r = 2 + (j % 3) * 1.4
      const y = g.ground - (j % 2) - Math.abs(Math.sin(t * 0.3 + j)) * (1 + (j % 3))
      dot(out, x + r * Math.cos(turn), y, Math.sin(turn) > 0 ? DUST[0] : DUST[(j % 2) + 1])
    }
  }
  const landed = t - GUST_ARRIVE
  if (landed === 0 || landed === 1) out.shake = [landed ? -g.side : g.side, 0]
  for (let i = 0; i < GUST_LEAVES; i++) gustLeaf(out, t, a, g, i, height, true)
}

const WING_RISE = 5
const WING_HIT = 11
const WING_HOLD = 15
const WING_HOME = 27

// How far forward and up (negative) the swoop has carried the mon at tick t
function wingPath(t, far) {
  if (t < WING_RISE) {
    const e = easeOut(phase(t, 0, WING_RISE))
    return [-1.5 * e, -4 * e]
  }
  if (t <= WING_HIT) {
    const p = phase(t, WING_RISE, WING_HIT)
    return [lerp(-1.5, far, easeIn(p)), lerp(-4, -2, p) + 3 * Math.sin(p * Math.PI)]
  }
  if (t < WING_HOLD) return [far, -2]
  const p = easeInOut(phase(t, WING_HOLD, WING_HOME))
  return [far * (1 - p), -2 * (1 - p) - Math.sin(p * Math.PI) * 2]
}

// A crescent cut along a curve from p0 to p2 bowing toward p1, shown from tail to
// head (0 to 1), thickest in the middle. dim steps it down the tones as it fades.
function crescent(out, p0, p1, p2, tail, head, width, tones, dim) {
  const mid = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2]
  for (let k = 0; k <= 32; k++) {
    const s = k / 32
    if (s < tail || s > head) continue
    const u = 1 - s
    const x = u * u * p0[0] + 2 * u * s * p1[0] + s * s * p2[0]
    const y = u * u * p0[1] + 2 * u * s * p1[1] + s * s * p2[1]
    const tx = u * (p1[0] - p0[0]) + s * (p2[0] - p1[0])
    const ty = u * (p1[1] - p0[1]) + s * (p2[1] - p1[1])
    const len = Math.hypot(tx, ty) || 1
    // The normal pointing in toward the chord, so the bright edge is the outside
    let nx = -ty / len
    let ny = tx / len
    if (nx * (mid[0] - x) + ny * (mid[1] - y) < 0) [nx, ny] = [-nx, -ny]
    const w = width * Math.sin(Math.PI * s) ** 0.7
    for (let j = 0; j <= Math.ceil(w) + 1; j++) {
      const tone = j === 0 ? 0 : j <= w * 0.5 ? 1 : j <= w ? 2 : 3
      if (tone + dim > 3) continue
      dot(out, x + nx * j, y + ny * j, tones[tone + dim])
    }
  }
}

// The wing tips of a side-on flier, taken as its highest edge pixel and the rearmost
// edge pixel on its upper half
function wingTips(edge, g) {
  const high = edge.reduce((best, p) => (p[1] < best[1] ? p : best))
  const upper = edge.filter(([, y]) => y <= g.cy)
  const rear = upper.reduce((best, p) => (p[0] * g.side < best[0] * g.side ? p : best), high)
  return rear === high ? [high] : [high, rear]
}

// Rise with lit wings, swoop in trailing streaks of light, and carve two crescents
// that cross over the target, then glide home as feathers drift down
function wingattack(out, t, a, g, c) {
  const tones = air(c)
  const s = g.side
  const far = clamp(Math.abs(g.target.x - g.mouth.x) - 4, 1, 8)
  const pos = (u) => wingPath(u, far)
  const [fx, fy] = pos(t)
  out.dx = s * Math.round(fx)
  out.dy = Math.round(fy)

  const lit = t >= 2 && t <= WING_HIT + 1
  const edge = lit ? rim(g, 0, 0).filter(([, , top]) => top) : []
  if (lit) {
    edge.forEach(([x, y], i) => dot(out, x + out.dx, y + out.dy, (i + t) % 3 === 0 ? WHITE : tones[1]))
    if (t > WING_RISE + 1) out.ghosts = [mirage(t, s * Math.round(pos(t - 2)[0]), Math.round(pos(t - 2)[1]), tones[2], 0.4)]
    if (t > WING_RISE && t <= WING_HIT) out.skew = lean(g, out.dy, s * 2)
  }
  if (t === WING_HIT) out.shade = (x, y, col) => mix(col, WHITE, 0.3)

  // Streaks trail from the wing tips back along the swoop
  const tips = edge.length ? wingTips(edge, g) : []
  if (t > WING_RISE && lit) {
    for (const [x, y] of tips) {
      for (let u = Math.max(0, t - WING_HIT) * 2; u <= 6; u += 0.25) {
        const [px, py] = pos(t - u)
        const tone = u < 1 ? 0 : u < 2.5 ? 1 : u < 4 ? 2 : 3
        if (tone === 3 && (u * 4) % 2) continue
        dot(out, x + s * Math.round(px), y + Math.round(py), tones[tone])
        if (tone < 2) dot(out, x + s * Math.round(px), y + Math.round(py) + 1, tones[tone + 1])
      }
    }
  }

  // Two crescents cross in an X, the first bowing forward and the second back
  const size = clamp(Math.abs(g.target.x - g.mouth.x) + 1, 4, 7)
  const tx = clamp(g.target.x, size, g.columns - 1 - size)
  const ty = clamp(g.target.y - 1, size + 1, g.ground - size)
  const bow = size * 0.9
  const cuts = [
    { at: WING_HIT, p0: [tx - s * size, ty - size], p1: [tx + s * bow, ty - bow], p2: [tx + s * size, ty + size] },
    { at: WING_HIT + 3, p0: [tx + s * size, ty - size], p1: [tx - s * bow, ty - bow], p2: [tx - s * size, ty + size] },
  ]
  for (const cut of cuts) {
    const age = t - cut.at
    if (age < 0 || age >= 9) continue
    crescent(out, cut.p0, cut.p1, cut.p2, phase(age, 2, 7), phase(age, -1, 1), 2.8, tones, age < 4 ? 0 : 1)
  }
  const cross = t - (WING_HIT + 4)
  if (cross >= 0 && cross < 5) burst(out, tx, ty, cross < 2 ? 3 + cross : 5 - cross, cross < 2 ? WHITE : tones[1])
  if (t === WING_HIT || t === WING_HIT + 4) out.shake = [s, t === WING_HIT ? 0 : 1]
  if (t === WING_HIT + 1 || t === WING_HIT + 5) out.shake = [-s, 0]

  // Feathers knocked loose, rocking as they drift down
  emit(t, { count: 5, gap: 0.6, start: WING_HIT + 4, life: 18 }, (i, age, f) => {
    const sway = Math.sin(age * 0.45 + i * 1.3)
    const x = tx + (rnd(a.seed, i) - 0.5) * 12 + sway * 2
    const y = ty - 4 + (rnd(a.seed, i, 1) - 0.5) * 6 + age * 0.45
    if (y > g.ground - 1) return
    const tilt = sway * 0.7
    for (let k = 0; k < 4; k++) {
      const px = x + Math.cos(tilt) * (k - 1.5)
      const py = y + Math.sin(tilt) * (k - 1.5)
      dot(out, px, py, k === 0 ? tones[2] : f < 0.6 ? WHITE : tones[1])
      if (k === 1 || k === 2) dot(out, px, py + 1, tones[k === 1 ? 2 : 1])
    }
  })
}

const FLY_CROUCH = 5
const FLY_UP = 10
const FLY_DIVE = 24
const FLY_HIT = 29
const FLY_BACK = 33
const FLY_HOME = 45

// How far forward and up the mon is at tick t, or null while it is out of sight
function flyPath(t, rise, far) {
  if (t < FLY_CROUCH) return [0, 0]
  if (t < FLY_UP) return [0, -easeIn(phase(t, FLY_CROUCH, FLY_UP - 1)) * rise]
  if (t < FLY_DIVE) return null
  if (t <= FLY_HIT) {
    const p = easeIn(phase(t, FLY_DIVE, FLY_HIT))
    return [lerp(far - 6, far, p), -(1 - p) * rise]
  }
  if (t < FLY_BACK) return [far, 0]
  const p = phase(t, FLY_BACK, FLY_HOME)
  return [far * (1 - easeInOut(p)), -Math.sin(p * Math.PI) * 5]
}

// A flat ring around a spot on the ground, like a shock wave seen from the side
function oval(out, x, y, rx, ry, c) {
  const steps = Math.ceil(rx * 5)
  for (let k = 0; k < steps; k++) {
    const angle = (Math.PI * 2 * k) / steps
    dot(out, x + Math.cos(angle) * rx, y + Math.sin(angle) * ry, c)
  }
}

// Rocket up out of sight while its shadow slides over the ground, then dive onto the
// target in a streak, land with a shock wave, and hop back home
function fly(out, t, a, g, c) {
  const tones = air(c)
  const rise = g.bottom + 6
  const far = clamp(Math.abs(g.target.x - g.mouth.x) - 2, 2, 10)
  const pos = (s) => flyPath(s, rise, far)
  const here = pos(t)
  out.hidden = here === null
  if (here) {
    out.dx = g.side * Math.round(here[0])
    out.dy = Math.round(here[1])
  }

  if (t < FLY_CROUCH) {
    const e = easeOut(phase(t, 0, FLY_CROUCH))
    out.sy = 1 - 0.14 * e
    out.sx = 1 + 0.08 * e
    if (t >= 2) out.dx = tremble(t)
  } else if (t < FLY_UP || (t >= FLY_DIVE && t < FLY_HIT)) {
    out.sy = 1.16
    out.sx = 0.9
    const last = pos(t - 1)
    if (last) out.ghosts = [mirage(t, g.side * Math.round(last[0]), Math.round(last[1]), tones[1], 0.4)]
  } else if (t === FLY_HIT || t === FLY_HIT + 1) {
    out.sy = t === FLY_HIT ? 0.8 : 0.9
    out.sx = t === FLY_HIT ? 1.14 : 1.06
  }

  // Speed lines streaming off it as it rockets up and dives down
  if ((t >= FLY_CROUCH + 1 && t < FLY_UP + 2) || (t >= FLY_DIVE + 2 && t <= FLY_HIT)) {
    const [px, py] = pos(t) ?? pos(FLY_UP - 1)
    const [qx, qy] = pos(t - 2) ?? [px, py - rise]
    const diving = t >= FLY_DIVE
    for (let k = 0; k < 3; k++) {
      const x = g.left + 3 + Math.round(((g.right - g.left - 6) * k) / 2) + ((k + t) % 2)
      const y = diving ? g.top - 1 : g.bottom + 1
      const tail = (diving ? -1 : 1) * (2 + ((k * 2 + t) % 3) * 2)
      streak(out, x + g.side * Math.round(qx), y + Math.round(qy) + tail, x + g.side * Math.round(px), y + Math.round(py), tones)
    }
  }

  // A ring of wind blasts out along the ground at takeoff, with dust both ways
  const launch = t - FLY_CROUCH
  if (launch >= 1 && launch < 6) oval(out, g.cx, g.ground, 4 + launch * 2.5, 1 + launch * 0.2, tones[launch < 3 ? 1 : 2])
  if (launch >= 0 && launch < 12) {
    dust(out, g.cx - 3 - launch * 0.6, g.ground - 1, 3, launch / 12, a.seed)
    dust(out, g.cx + 3 + launch * 0.6, g.ground - 1, 3, launch / 12, a.seed + 1)
  }

  // A glint high in the sky and a few loose feathers drifting down, then the
  // shadow sliding over and growing as it falls
  const glint = t - FLY_UP - 1
  if (glint >= 0 && glint < 6) spark(out, g.cx + g.side * 3, 2, glint < 3 ? glint + 1 : 6 - glint, tones[2])
  emit(t, { count: 3, gap: 2, start: FLY_UP, life: 16 }, (i, age) => {
    const sway = Math.sin(age * 0.5 + i * 2)
    const x = g.cx + (i - 1) * 5 + sway * 2
    const y = g.top - 4 + age * 0.9
    if (y > g.ground - 1) return
    dot(out, x, y, WHITE)
    dot(out, x + (sway > 0 ? 1 : -1), y - (age % 4 < 2 ? 1 : 0), tones[1])
    dot(out, x - (sway > 0 ? 1 : -1), y, tones[2])
  })
  if (t >= FLY_UP && t <= FLY_HIT) {
    const near = easeIn(phase(t, FLY_UP + 6, FLY_HIT))
    const x = g.cx + g.side * lerp(0, far, easeInOut(phase(t, FLY_UP, FLY_DIVE)))
    const w = lerp(3, (g.right - g.left) * 0.45, near)
    for (let px = Math.ceil(x - w); px <= Math.floor(x + w); px++) {
      out.under.push(px, g.ground, SHADOW[Math.abs(px - x) < w - 1 ? 0 : 1])
      if (Math.abs(px - x) < w - 2) out.under.push(px, g.ground - 1, SHADOW[1])
    }
  }

  // The landing flashes and sends a shock wave, dust, and grit racing out both ways
  const hit = t - FLY_HIT
  const hx = g.ahead(far) - g.side * 2
  if (hit === 0) disc(out, hx, g.ground - 3, 3, WHITE)
  if (hit >= 0 && hit < 6) burst(out, hx, g.ground - 3, hit < 2 ? 6 + hit : 8 - hit, hit < 2 ? WHITE : tones[1])
  if (hit >= 1 && hit < 7) oval(out, hx, g.ground - 1, 2 + hit * 3, 1 + hit * 0.25, tones[hit < 3 ? 0 : hit < 5 ? 1 : 2])
  const shakes = [[1, 2], [-1, -1], [1, 1], [0, -1]]
  if (hit >= 0 && hit < shakes.length) out.shake = [shakes[hit][0] * g.side, shakes[hit][1]]
  if (hit >= 0 && hit < 14) {
    for (const way of [-1, 1]) dust(out, hx + way * (3 + hit * 0.9), g.ground - 1, 3.5, hit / 14, a.seed + way)
  }
  emit(t, { count: 10, start: FLY_HIT, gap: 0, life: 12 }, (i, age, f) => {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, 3) - 0.5) * 2.6
    const speed = 0.9 + rnd(a.seed, i, 4) * 1
    const y = g.ground - 2 + Math.sin(angle) * speed * age + 0.12 * age * age
    if (y > g.ground) return
    const x = hx + Math.cos(angle) * speed * age
    dot(out, x, y, f < 0.5 ? DUST[0] : DUST[2])
    if (i % 2) dot(out, x + 1, y, DUST[1])
  })
}

const SKY_FULL = 20
const SKY_RISE = 22
const SKY_GO = 26
const SKY_HIT = 30
const SKY_BACK = 33
const SKY_HOME = 44

// How far forward and up (negative) Sky Attack carries the mon at tick t
function skyPath(t, far) {
  if (t < SKY_RISE) return [0, 0]
  if (t < SKY_GO) {
    const e = easeOut(phase(t, SKY_RISE, SKY_GO))
    return [-1 * e, -4 * e]
  }
  if (t <= SKY_HIT) {
    const p = easeIn(phase(t, SKY_GO, SKY_HIT))
    return [lerp(-1, far, p), lerp(-4, 0, p)]
  }
  if (t < SKY_BACK) return [far, 0]
  const p = easeInOut(phase(t, SKY_BACK, SKY_HOME))
  return [far * (1 - p), -Math.sin(p * Math.PI) * 2]
}

// How far each spot around the sprite is from its nearest pixel, over its box grown
// by pad. Two chamfer passes keep it cheap enough to run every tick.
function distanceField(g, pad) {
  const x0 = g.left - pad
  const y0 = g.top - pad
  const w = g.right - g.left + 1 + pad * 2
  const h = g.bottom - g.top + 1 + pad * 2
  const d = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = g.solid(x0 + x, y0 + y) ? 0 : 99
  const pass = (from, to, step) => {
    for (let y = from; y !== to; y += step) {
      for (let x = from === 0 ? 0 : w - 1; x >= 0 && x < w; x += step) {
        const py = y - step
        const px = x - step
        let v = d[y * w + x]
        if (px >= 0 && px < w) v = Math.min(v, d[y * w + px] + 1)
        if (py >= 0 && py < h) {
          v = Math.min(v, d[py * w + x] + 1)
          if (px >= 0 && px < w) v = Math.min(v, d[py * w + px] + 1.4)
          if (x + step >= 0 && x + step < w) v = Math.min(v, d[py * w + x + step] + 1.4)
        }
        d[y * w + x] = v
      }
    }
  }
  pass(0, h, 1)
  pass(h - 1, -1, -1)
  return (x, y) => {
    const px = x - x0
    const py = y - y0
    return px < 0 || py < 0 || px >= w || py >= h ? 99 : d[py * w + px]
  }
}

// A flame aura `size` pixels deep behind the sprite, licking upward in tongues.
// strength from 0 to 1 dims it toward a faint rim.
function aura(out, t, a, g, dx, dy, size, fire, strength = 1) {
  const pad = Math.ceil(size) + 1
  const dist = distanceField(g, pad)
  for (let y = g.top - pad - 4; y <= g.bottom + pad; y++) {
    for (let x = g.left - pad; x <= g.right + pad; x++) {
      if (g.solid(x, y)) continue
      const lift = Math.floor(rnd(a.seed, x >> 1, (t >> 1) + 300) * (1 + size))
      const d = dist(x, y + lift)
      if (d > size + 0.5) continue
      const heat = (1 - d / (size + 1)) * (0.35 + 0.65 * strength) + (rnd(a.seed, x * 41 + y, t) - 0.5) * 0.4
      if (heat < 0.12) continue
      back(out, x + dx, y + dy, heat > 0.78 ? fire[0] : heat > 0.6 ? fire[1] : heat > 0.42 ? fire[2] : heat > 0.26 ? fire[3] : fire[4])
    }
  }
}

// Gather a blazing aura while motes of light stream in, flash fully charged, rise,
// then dive through the target as a comet for a huge blast
function skyattack(out, t, a, g, c) {
  const fire = blaze(c)
  const s = g.side
  const far = clamp(Math.abs(g.target.x - g.mouth.x) + 3, 4, 14)
  const pos = (u) => skyPath(u, far)
  const [fx, fy] = pos(t)
  out.dx = s * Math.round(fx)
  out.dy = Math.round(fy)
  const glow = easeIn(phase(t, 0, SKY_FULL)) * (1 - phase(t, SKY_BACK, SKY_HOME + 4))

  if (t < SKY_RISE) {
    out.sy = 1 - 0.07 * glow
    out.sx = 1 + 0.03 * glow
    if (t >= 14) out.dx = t % 2 ? 0 : -s
  }
  if (t >= SKY_RISE && t < SKY_HIT) out.skew = lean(g, out.dy, t < SKY_GO ? -s * 1.5 : s * 3)
  if (t < SKY_GO) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.3)
    const flash = t === SKY_FULL || t === SKY_FULL + 1 ? 0.55 : 0
    out.shade = (x, y, col) => mix(mix(col, fire[1], glow * (0.2 + 0.25 * pulse)), WHITE, flash)
    aura(out, t, a, g, out.dx, out.dy, 0.8 + 2.4 * glow, fire, glow)

    // Motes of light streaming in from all around
    emit(t, { count: 16, gap: 1.1, start: 1, life: 7 }, (i, age, f) => {
      const angle = rnd(a.seed, i, 5) * Math.PI * 2
      const d = (1 - easeIn(f)) * 16 + 3
      const x = g.cx + Math.cos(angle) * d
      const y = g.cy + Math.sin(angle) * d * 0.75
      dot(out, x, y, WHITE)
      for (let k = 1; k <= 3; k++) dot(out, x + Math.cos(angle) * k, y + Math.sin(angle) * k * 0.75, fire[k])
    })
    const charged = t - SKY_FULL
    if (charged >= 0 && charged < 5) {
      ring(out, g.cx + out.dx, g.cy + out.dy, 5 + charged * 4, fire[Math.min(4, 1 + charged)])
      ring(out, g.cx + out.dx, g.cy + out.dy, 4 + charged * 4, fire[Math.min(4, charged)])
    }
  } else if (t < SKY_HIT) {
    // A comet, white hot in front and gold behind, with fire streaming off its back
    const backX = s > 0 ? g.left : g.right
    const span = g.right - g.left + 1
    out.shade = (x, y, col) => {
      const u = ((x - out.dx - backX) * s) / span
      return u > 0.6 ? mix(col, WHITE, 0.55) : mix(col, u > 0.3 ? fire[1] : fire[3], 0.45)
    }
    aura(out, t, a, g, out.dx, out.dy, 3, fire)
    const [qx, qy] = pos(t - 3)
    const run = Math.max(3, Math.abs(fx - qx))
    const rise = (qy - fy) / run
    for (let y = g.top; y <= g.bottom; y++) {
      if ((y + t) % 2) continue
      let x = backX
      while (!g.solid(x, y) && x !== g.cx) x += s
      if (!g.solid(x, y)) continue
      const len = run + 4 + ((y * 7 + t) % 5) - Math.abs(y - g.cy) * 0.35
      for (let d = 1; d <= len; d++) {
        const f = d / len
        if (f > 0.7 && (d + t) % 2) continue
        dot(out, x + out.dx - s * d, y + out.dy + Math.round(d * rise), fire[Math.min(4, 1 + Math.floor(f * 3.9))])
      }
    }
  } else if (glow > 0.05) {
    out.shade = (x, y, col) => mix(col, fire[1], 0.45 * glow)
    if (glow > 0.3) aura(out, t, a, g, out.dx, out.dy, 2.2 * glow, fire)
  }

  // The blast flashes white and throws up a pillar of fire, then rings, sparks, and
  // embers fly out
  const tx = g.target.x
  const ty = g.target.y
  const hit = t - SKY_HIT
  if (hit === 0) {
    out.shade = (x, y, col) => mix(col, WHITE, 0.7)
    disc(out, tx, ty, 7, WHITE)
  }
  if (hit === 1) disc(out, tx, ty, 5, fire[1])
  if (hit >= 0 && hit < 9) {
    const top = hit < 3 ? 0 : (hit - 3) * 3
    for (let y = g.ground; y >= top; y--) {
      const w = (hit < 5 ? 3 : 2) - (y < ty - 6 ? 1 : 0)
      for (let x = -w; x <= w; x++) {
        const heat = Math.abs(x) / (w + 1) + (rnd(a.seed, x * 37 + y, t) - 0.5) * 0.5 + hit * 0.06
        dot(out, tx + x, y, fire[clamp(Math.floor(heat * 4), 0, 4)])
      }
    }
  }
  if (hit >= 0 && hit < 8) burst(out, tx, ty, hit < 3 ? 7 + hit * 2 : 13 - hit, hit < 2 ? WHITE : fire[hit < 5 ? 2 : 3])
  if (hit >= 1 && hit < 8) ring(out, tx, ty, hit * 2.6, fire[Math.min(4, 1 + (hit >> 1))])
  if (hit >= 3 && hit < 9) ring(out, tx, ty, (hit - 2) * 2.2, fire[Math.min(4, (hit - 2) >> 1)])
  const shakes = [[2, 2], [-2, -1], [2, 1], [-1, -1], [1, 0], [-1, 0]]
  if (hit >= 0 && hit < shakes.length) out.shake = [shakes[hit][0] * s, shakes[hit][1]]
  emit(t, { count: 16, start: SKY_HIT, gap: 0, life: 14 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 6) * Math.PI * 2
    const speed = 1.1 + rnd(a.seed, i, 7) * 1.3
    const x = tx + Math.cos(angle) * speed * age
    const y = ty + Math.sin(angle) * speed * age + 0.07 * age * age
    if (y <= g.ground) plus(out, x, y, fire[f < 0.4 ? 2 : 3], f < 0.3 ? WHITE : fire[1])
  })
  emit(t, { count: 12, start: SKY_HIT + 4, gap: 1.2, life: 12 }, (i, age, f) => {
    const x = tx + (rnd(a.seed, i, 8) - 0.5) * 12 + Math.sin(age * 0.5 + i)
    const y = ty + 2 - rnd(a.seed, i, 9) * 4 - age * 0.6
    if (y >= 0) dot(out, x, y, fire[f < 0.4 ? 1 : f < 0.75 ? 3 : 4])
  })
}

// Agility darts between these spots, as fractions of the room ahead
const AGILITY_SPOTS = [0, 0.6, 0.15, 1, 0.35, 0.85, -0.12, 0.5, 0]
const AGILITY_START = 4
const AGILITY_STEP = 3
const AGILITY_END = AGILITY_START + (AGILITY_SPOTS.length - 1) * AGILITY_STEP

// The spot the mon has darted to by tick t
const agilityLeg = (t) => clamp(Math.floor((t - AGILITY_START) / AGILITY_STEP) + 1, 0, AGILITY_SPOTS.length - 1)

// Crouch, then zip back and forth faster than the eye, leaving afterimages and speed
// lines, and land home with a glint
function agility(out, t, a, g, c) {
  const tones = air(c)
  const room = clamp(g.reach - 4, 3, 12)
  const spot = (k) => Math.round(AGILITY_SPOTS[k] * room)
  const leg = agilityLeg(t)
  const age = t - (AGILITY_START + (leg - 1) * AGILITY_STEP)
  out.dx = g.side * spot(leg)

  if (t < AGILITY_START) {
    const e = easeOut(phase(t, 0, AGILITY_START))
    out.sy = 1 - 0.1 * e
    out.sx = 1 + 0.05 * e
  } else if (t < AGILITY_END) {
    const from = spot(leg - 1)
    const to = spot(leg)
    out.flipX = to < from
    if (age < 2) {
      // A blur of see-through copies across the gap, facing the way it ran, and a lean
      // into the dash
      const blur = age === 0 ? [0.7, 0.35, 0] : [0]
      out.ghosts = blur.map((f) => mirage(t, g.side * Math.round(lerp(from, to, f)), 0, tones[age ? 2 : 1], 0.5, out.flipX))
      if (age === 0) out.skew = lean(g, 0, g.side * (to > from ? 2 : -2))
      // Speed lines from where it was to where it is, brightest at the body
      const ahead = to > from ? 1 : -1
      const trail = (g.side * ahead > 0 ? g.left : g.right) - ahead * g.side
      for (let k = 0; k < 4; k++) {
        const y = g.top + 2 + Math.round(((g.bottom - g.top - 4) * k) / 3) + ((k + leg) % 2)
        const head = trail + g.side * to
        const tail = trail + g.side * from - ahead * g.side * (3 + ((k * 3 + leg) % 4))
        if (age === 0) streak(out, tail, y, head, y, tones)
        else streak(out, lerp(tail, head, 0.5), y, head, y, tones)
      }
    }
  } else {
    const settle = t - AGILITY_END
    if (settle < 3) {
      out.sy = [0.88, 0.95, 1.02][settle]
      out.sx = [1.08, 1.03, 1][settle]
      dust(out, g.cx - g.side * 5, g.ground - 1, 2.5, settle / 4, a.seed)
    }
    // A glint off the brow, with a smaller twinkle beside it
    const glint = t - AGILITY_END - 1
    const glintX = (g.side > 0 ? g.right : g.left) - g.side * 3
    if (glint >= 0 && glint < 7) {
      const size = [1, 2, 4, 3, 2, 1, 1][glint]
      spark(out, glintX, g.top + 2, size, tones[2])
      if (size >= 2) for (const d of [-1, 1]) for (const e of [-1, 1]) dot(out, glintX + d, g.top + 2 + e, tones[1])
    }
    if (glint >= 2 && glint < 6) spark(out, glintX - g.side * 5, g.top + 6, glint === 3 ? 2 : 1, tones[2])
  }
}

const DOUBLE_SPLIT = 5
const DOUBLE_HOLD = 13
const DOUBLE_MERGE = 31
const DOUBLE_JOIN = 38

// The slot the real mon holds as it trades places with its copies, counted toward
// the roomy side
const DOUBLE_SWAPS = [[0, 0], [17, 1], [21, 0], [25, 1], [29, 0]]
const doubleSlot = (t) => DOUBLE_SWAPS.reduce((slot, [tick, k]) => (t >= tick ? k : slot), 0)

// Shimmer, then split into flickering copies that fan out to both sides, trade
// places with the real one so the eye loses track, and fold back with a flash
function doubleteam(out, t, a, g, c) {
  const tones = air(c)
  const width = g.right - g.left + 1
  const gap = clamp(Math.round(width * 0.55), 5, 12)
  const spread = easeOut(phase(t, DOUBLE_SPLIT, DOUBLE_HOLD)) * (1 - easeIn(phase(t, DOUBLE_MERGE, DOUBLE_JOIN)))
  const at = (slot, n) => Math.round(g.side * slot * gap * spread + Math.sin(t * 0.5 + n * 1.9) * spread)
  const real = t < DOUBLE_MERGE ? doubleSlot(t) : 0
  out.dx = at(real, 0)
  if (t < DOUBLE_SPLIT) {
    out.dx = tremble(t)
    out.shade = (x, y, col) => mix(col, t % 2 ? WHITE : tones[1], 0.25 * phase(t, 0, 3))
  }

  // The copies are see-through and shimmer, the outer ones flickering in and out
  if (spread > 0) {
    out.ghosts = []
    for (const slot of [-2, -1, 0, 1, 2]) {
      if (slot === real) continue
      const n = slot + 2
      const outer = Math.abs(slot) === 2
      if (outer && (t + n) % 3 === 0) continue
      const dx = at(slot, n)
      out.ghosts.push(mirage(t, dx, 0, (t >> 1) % 2 ? WHITE : tones[1], outer ? 0.55 : 0.3))
      // A bright scan line sliding down the copy
      const y = g.top + ((t * 2 + n * 5) % (g.bottom - g.top + 1))
      for (let x = g.left; x <= g.right; x++) {
        if (g.solid(x, y) && !g.solid(x + dx - out.dx, y)) dot(out, x + dx, y, (x + t) % 2 ? WHITE : tones[1])
      }
    }
  }
  if (t > 0 && DOUBLE_SWAPS.some(([tick]) => tick === t)) out.shade = (x, y, col) => mix(col, WHITE, 0.3)
  const split = t - DOUBLE_SPLIT
  if (split >= 0 && split < 6) sparkles(out, t, a.seed, g.cx, g.cy, width + gap * 3 * spread, g.bottom - g.top, tones[1], 6)
  const join = t - DOUBLE_JOIN
  if (join === 0) out.shade = (x, y, col) => mix(col, WHITE, 0.6)
  if (join >= 0 && join < 5) spark(out, g.cx, g.cy, [2, 4, 3, 2, 1][join], tones[2])
}

export const SKY = {
  gust: { ticks: 44, color: 0xdff3ff, draw: gust },
  wingattack: { ticks: 36, color: 0xdff3ff, draw: wingattack },
  fly: { ticks: 52, color: 0xdff3ff, draw: fly },
  skyattack: { ticks: 56, color: 0xffe9a6, draw: skyattack },
  agility: { ticks: 36, color: 0xbfe6ff, pose: (t) => ({ stride: t >= AGILITY_START && t < AGILITY_END }), draw: agility },
  doubleteam: { ticks: 44, color: 0xbfe6ff, pose: { view: 'front' }, draw: doubleteam },
}
