// Ground moves

import {
  WHITE, back, ball, burst, clamp, dark, dot, easeIn, easeInOut, easeOut, emit, keys, lean, lerp, light, line, mix,
  phase, plus, rnd, spark, stamp, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const GRAVITY = 0.3
const PIT = 0x1a0f08
const SAND = [0xeadbb4, 0xcdb388, 0xa08260]

// Five steps of earth from its color: highlight, lit, base, shadow, outline
const earth = (c) => [light(c, 0.55), light(c, 0.25), c, dark(c, 0.35), dark(c, 0.62)]

// Wet mud: a glossy white glint, then the earth steps
const mud = (c) => [WHITE, light(c, 0.3), c, dark(c, 0.3), dark(c, 0.6)]

// How far a dash can go toward the target, stopping `margin` pixels short of it
const travel = (g, most, margin = 3) => clamp(Math.abs(g.target.x - g.mouth.x) - margin, 2, most)

// Keeps a shape reaching `half` pixels either side of x inside the strip
const fit = (g, x, half) => clamp(x, half, g.columns - 1 - half)

// Every other pixel, for things breaking up as they fade
const dotted = (out, x, y, c) => (Math.round(x) + Math.round(y)) % 2 && dot(out, x, y, c)

// Something flung from x, y at speed vx, vy that comes to rest on the ground
function fling(x, y, vx, vy, age, ground) {
  const fall = y + vy * age + 0.5 * GRAVITY * age * age
  if (fall < ground) return [x + vx * age, fall]
  const land = (-vy + Math.sqrt(Math.max(0, vy * vy + 2 * GRAVITY * (ground - y)))) / GRAVITY
  return [x + vx * land, ground]
}

// A puff of dust that swells and thins away as f goes from 0 to 1
function cloud(out, x, y, r, f, seed, tones = SAND, paint = dot) {
  if (f >= 1) return
  const rr = r * (0.5 + 0.6 * easeOut(f))
  const keep = 1 - f * f
  for (let py = Math.floor(y - rr); py <= Math.ceil(y + rr * 0.6); py++) {
    for (let px = Math.floor(x - rr); px <= Math.ceil(x + rr); px++) {
      const d = Math.hypot(px - x, (py - y) * 1.3) / rr
      if (d > 1 || rnd(seed, px * 37 + py * 11) > keep * (1.1 - d)) continue
      paint(out, px, py - f * r * 0.5, tones[d < 0.4 ? 0 : d < 0.75 ? 1 : 2])
    }
  }
}

// A glob of mud: a lit ball with a wet glint and a dark rim underneath
function glob(out, x, y, r, tones, paint = dot) {
  if (r < 1.2) {
    paint(out, x, y, tones[2])
    paint(out, x + 1, y, tones[3])
    paint(out, x, y - 1, tones[1])
    return
  }
  for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) paint(out, px, y + r, tones[4])
  ball(out, x, y, r, tones[2], paint)
  paint(out, x - r * 0.4, y - r * 0.45, WHITE)
}

// A splash of mud stuck to whatever it hit: blobby spokes ending in droplets
function splat(out, x, y, r, tones, seed, grow = 1, paint = dot) {
  for (let k = 0; k < 7; k++) {
    const ang = (k / 7) * TAU + rnd(seed, k) * 0.6
    const len = r * (0.5 + rnd(seed, k, 1) * 0.7) * grow
    const ex = x + Math.cos(ang) * len
    const ey = y + Math.sin(ang) * len * 0.8
    line(out, x, y, ex, ey, tones[2], paint)
    paint(out, ex, ey, tones[1])
    if (k % 2) paint(out, ex + Math.cos(ang), ey + Math.sin(ang), tones[3])
  }
  for (let py = -1; py <= 1; py++) for (let px = -1; px <= 1; px++) paint(out, x + px, y + py, tones[px + py < 0 ? 1 : 2])
  paint(out, x - 1, y - 1, WHITE)
}

const SLAP_SCOOP = 6
const SLAP_HIT = 13

// Dip and scoop up a fistful of mud, then fling it in a low arc that splats on the
// target's face and runs down in drips
function mudslap(out, t, a, g, c) {
  const tones = mud(c)
  out.skew = lean(g, g.side * keys(t, [[0, 0], [SLAP_SCOOP, -2], [SLAP_SCOOP + 3, 3, easeIn], [SLAP_HIT + 3, 0]]))
  out.dy = t >= 2 && t < SLAP_SCOOP + 1 ? 1 : 0
  out.dx = Math.round(g.side * keys(t, [[0, 0], [SLAP_SCOOP, -1], [SLAP_SCOOP + 3, 1, easeIn], [SLAP_HIT + 4, 0]]))
  const fx = g.frontAt(g.bottom - 1) + g.side
  const { x: tx } = g.target
  const ty = g.target.y - 1

  // The scooped glob swelling in front of the feet, wet clods lifted with it
  if (t >= 2 && t < SLAP_SCOOP + 2) {
    const r = 0.8 + phase(t, 2, SLAP_SCOOP) * 1.4
    glob(out, fx, g.ground - r, r, tones)
    if (t % 2) dot(out, fx + g.side * 2, g.ground - 1, tones[3])
  }
  // The throw, wobbling and shedding drops
  if (t >= SLAP_SCOOP + 2 && t < SLAP_HIT) {
    const f = phase(t, SLAP_SCOOP + 2, SLAP_HIT)
    const x = lerp(fx, tx, f)
    const y = lerp(g.ground - 2, ty, f) - Math.sin(Math.PI * f) * 4
    glob(out, x, y, 2 + (t % 2) * 0.4, tones)
    for (let k = 1; k <= 3; k++) dot(out, x - g.side * k * 2, y + k * 0.8 + 1, tones[k === 1 ? 2 : 3])
  }
  const hit = t - SLAP_HIT
  if (hit < 0) return
  if (hit === 0) out.shake = [g.side, 1]
  if (hit < 2) burst(out, tx, ty, 3, tones[1])
  if (hit < 16) splat(out, tx, ty, 4, tones, a.seed, Math.min(1, 0.5 + hit * 0.25), hit > 11 ? dotted : dot)
  // Drips running down from the splat and dropping off
  for (let k = 0; k < 3; k++) {
    const x = tx + (k - 1) * 2
    const run = Math.min(4, hit * 0.4 * (0.7 + rnd(a.seed, k, 3) * 0.6))
    if (hit > 12) continue
    line(out, x, ty + 1, x, ty + 1 + run, tones[3])
    const drop = hit - 6 - k * 2
    if (drop >= 0) {
      const y = ty + 2 + run + drop * 0.5 + drop * drop * 0.15
      if (y < g.ground) dot(out, x, y, tones[2])
    }
  }
}

const SPORT_WALLOW = 8
const SPORT_SHAKE = 30

// Spread a puddle, wallow in it until the body is spotted with mud, then shake the
// mud off in a shower of flecks
function mudsport(out, t, a, g, c) {
  const tones = mud(c)
  const w = (g.right - g.left) / 2
  const spread = easeOut(phase(t, 0, SPORT_WALLOW)) * (1 - phase(t, SPORT_SHAKE + 6, a.ticks - 1))
  if (spread > 0) {
    const rx = (w + 4) * spread
    for (let x = Math.floor(g.cx - rx); x <= Math.ceil(g.cx + rx); x++) {
      const edge = Math.abs(x - g.cx) > rx - 1.5
      back(out, x, g.ground, edge ? tones[3] : tones[2])
      if (!edge && Math.abs(x - g.cx) < rx - 3) back(out, x, g.ground - 1, (x + (t >> 2)) % 5 ? tones[3] : tones[1])
    }
  }
  const wallow = t >= SPORT_WALLOW && t < SPORT_SHAKE
  if (wallow) {
    out.skew = lean(g, Math.sin((t - SPORT_WALLOW) * 0.55) * 2.5)
    out.dy = (t >> 1) % 3 === 0 ? 1 : 0
    out.sx = 1 + 0.04 * Math.abs(Math.sin(t * 0.55))
  } else if (t >= SPORT_SHAKE && t < SPORT_SHAKE + 8) {
    out.dx = tremble(t) * 2 * (t < SPORT_SHAKE + 6 ? 1 : 0)
  }
  // Mud spots growing over the body, then shaken off
  const coat = phase(t, SPORT_WALLOW + 2, SPORT_SHAKE) * (1 - phase(t, SPORT_SHAKE, SPORT_SHAKE + 7))
  if (coat > 0) {
    out.shade = (x, y, col) => {
      const n = rnd(a.seed, Math.floor(x / 2) * 31 + Math.floor((y - out.dy) / 2) * 7, 5)
      const low = (y - g.top) / Math.max(1, g.bottom - g.top)
      return n < coat * (0.25 + low * 0.6) ? mix(col, (x + y) % 3 ? tones[3] : tones[2], 0.75) : col
    }
  }
  // Splashes kicked up from the puddle while wallowing
  if (wallow) {
    emit(t, { count: 12, gap: 1.6, start: SPORT_WALLOW, life: 8 }, (i, age) => {
      const way = i % 2 ? 1 : -1
      const [x, y] = fling(g.cx + way * (w + 1), g.ground - 1, way * (0.4 + rnd(a.seed, i) * 0.6), -1.6 - rnd(a.seed, i, 1), age, g.ground)
      dot(out, x, y, i % 3 ? tones[2] : tones[1])
    })
  }
  // Flecks flung off by the shake
  emit(t, { count: 22, gap: 0.3, start: SPORT_SHAKE, life: 11 }, (i, age) => {
    const ang = rnd(a.seed, i, 7) * TAU
    const v = 0.9 + rnd(a.seed, i, 8) * 0.9
    const [x, y] = fling(g.cx + Math.cos(ang) * w * 0.6, g.cy + Math.sin(ang) * 3, Math.cos(ang) * v, Math.sin(ang) * v - 0.8, age, g.ground)
    dot(out, x, y, i % 3 ? tones[3] : tones[2])
    if (i % 4 === 0) dot(out, x + 1, y, tones[1])
  })
}

const TOMB_RISE = 8
const TOMB_FULL = 20
const TOMB_FALL = 34

// Slap the ground and send sand streaming to the target, where it rises in a
// spinning funnel that swallows it, then slumps into a heap
function sandtomb(out, t, a, g, c) {
  const tones = earth(c)
  if (t < 4) {
    out.sy = 1 - 0.08 * phase(t, 0, 3)
    out.sx = 1 + 0.05 * phase(t, 0, 3)
  }
  if (t === 3) out.shake = [0, 1]
  const tx = fit(g, g.target.x, 7)
  const fx = g.frontAt(g.bottom - 1)

  // A stream of sand running along the ground to the target
  emit(t, { count: 14, gap: 0.5, start: 3, life: 6 }, (i, age, f) => {
    const x = lerp(fx, tx, f)
    dot(out, x, g.ground - (i % 2), tones[i % 3])
  })

  const rise = easeOut(phase(t, TOMB_RISE, TOMB_FULL))
  const fall = easeIn(phase(t, TOMB_FALL, a.ticks - 4))
  const tall = clamp(g.ground - 2, 6, 16) * rise * (1 - fall * 0.85)
  if (rise > 0 && fall < 1) {
    // Grains orbiting the funnel, wider toward its mouth
    for (let i = 0; i < 70; i++) {
      const h = rnd(a.seed, i, 1) * tall
      const r = 1.5 + h * 0.45 + (1 - fall) * 0.5
      const ang = rnd(a.seed, i, 2) * TAU + t * (0.6 - h * 0.02)
      const x = tx + Math.cos(ang) * r
      const y = g.ground - h + Math.sin(ang) * 0.6
      const front = Math.sin(ang) > 0
      dot(out, x, y, front ? tones[i % 4 === 0 ? 0 : 1] : tones[3])
    }
    // The funnel's outline, two leaning walls
    for (let h = 0; h < tall; h += 1) {
      const r = 1.5 + h * 0.45
      const wob = Math.sin(h * 0.8 + t * 0.9) * 0.6
      dot(out, tx - r + wob, g.ground - h, tones[2])
      dot(out, tx + r + wob, g.ground - h, tones[3])
    }
    if (rise >= 1 && t < TOMB_FALL && t % 3 === 0) out.shake = [t % 2 ? 1 : -1, 0]
  }
  // Grains thrown off the rim
  emit(t, { count: 16, gap: 1, start: TOMB_FULL - 4, life: 9 }, (i, age) => {
    const way = i % 2 ? 1 : -1
    const r = 1.5 + tall * 0.45
    const [x, y] = fling(tx + way * r, g.ground - tall, way * (0.5 + rnd(a.seed, i, 4) * 0.6), -0.5, age, g.ground)
    dot(out, x, y, tones[1 + (i % 3)])
  })
  // The heap left behind, sinking away
  const heap = phase(t, TOMB_FALL, TOMB_FALL + 6) * (1 - phase(t, a.ticks - 6, a.ticks - 1))
  if (heap > 0) {
    const rx = 6
    for (let x = -rx; x <= rx; x++) {
      const top = Math.round(heap * 3.5 * Math.sqrt(1 - (x / (rx + 0.5)) ** 2))
      for (let k = 0; k <= top; k++) dot(out, tx + x, g.ground - k, k === top ? tones[x < 0 ? 0 : 1] : tones[k === top - 1 ? 2 : 3])
    }
  }
}

const FISSURE_SLAM = 8
const FISSURE_RUN = 16
const FISSURE_OPEN = 26
const FISSURE_SHUT = 40

// Rear up and slam: a crack races out to the target and the ground there rips wide
// open into a dark chasm with tilted slabs and dust jets, then grinds shut
function fissure(out, t, a, g, c) {
  const tones = earth(c)
  if (t < FISSURE_SLAM) {
    const e = easeOut(phase(t, 0, FISSURE_SLAM - 1))
    out.dy = -Math.round(3 * e)
    out.sy = 1 + 0.08 * e
    out.skew = lean(g, -g.side * 2 * e)
  } else if (t < FISSURE_SLAM + 3) {
    out.sy = [0.82, 0.9, 1][t - FISSURE_SLAM]
    out.sx = [1.14, 1.07, 1][t - FISSURE_SLAM]
  }
  if (t === FISSURE_SLAM) out.shake = [0, 2]

  const tx = fit(g, g.target.x, 9)
  const fx = g.frontAt(g.bottom - 1)
  const open = easeOut(phase(t, FISSURE_RUN, FISSURE_OPEN)) * (1 - easeIn(phase(t, FISSURE_SHUT, FISSURE_SHUT + 3)))
  const w = 1 + open * 7

  // The running crack, zigzagging just above the ground line
  const run = phase(t, FISSURE_SLAM, FISSURE_RUN)
  const span = tx + g.side * 9 - fx
  const len = Math.round(Math.abs(span) * run)
  const healed = phase(t, FISSURE_SHUT + 2, a.ticks - 1)
  for (let k = 0; k <= len; k++) {
    if (healed > 0 && rnd(a.seed, k, 2) < healed) continue
    const x = fx + Math.sign(span) * k
    const y = g.ground - 1 - (rnd(a.seed, k >> 1, 1) < 0.5 ? 0 : 1)
    back(out, x, y, PIT)
    back(out, x, y - 1, tones[1])
  }
  if (t >= FISSURE_SLAM && t < FISSURE_OPEN + 2 && t % 2) out.shake = [g.side, 0]

  // A slab of ground around the target that the rift tears in two, its halves
  // tilting up at the lips
  const band = phase(t, FISSURE_RUN - 3, FISSURE_RUN + 1) * (1 - healed)
  const glowing = dark(mix(c, 0xff4010, 0.7), 0.15)
  if (band > 0) {
    for (let x = tx - 14; x <= tx + 14; x++) {
      const u = Math.abs(x - tx)
      if (u > 14 * band || (u > 9 && rnd(a.seed, x, 8) < (u - 9) / 5)) continue
      const lift = Math.round(open * 3 * (u > w ? Math.max(0, 1 - (u - w) / 6) : 1))
      const top = g.ground - 2 - lift
      for (let y = top; y <= g.ground; y++) {
        const rowW = w * (0.45 + 0.55 * (g.ground - y) / (2 + open * 3)) + (rnd(a.seed, y, x > tx ? 9 : 10) < 0.5 ? 0 : 1)
        if (open > 0 && u <= rowW) {
          back(out, x, y, y === g.ground && u < 2 && t % 4 < 2 ? glowing : PIT)
          continue
        }
        const k = y - top
        back(out, x, y, k === 0 ? tones[0] : k === 1 ? tones[1] : rnd(a.seed, x * 7 + y, 11) < 0.3 ? tones[3] : tones[2])
      }
    }
  }
  if (open > 0) {
    const deep = 2 + open * 3
    // Dust and grit jetting up out of the rift
    emit(t, { count: 20, gap: 0.6, start: FISSURE_RUN + 2, life: 10 }, (i, age, f) => {
      if (t >= FISSURE_SHUT) return
      const x = tx + (rnd(a.seed, i, 4) - 0.5) * w * 1.6 + Math.sin(age + i) * 0.6
      const y = g.ground - deep - age * 1.3
      if (y < 0) return
      dot(out, x, y, f < 0.4 ? SAND[0] : f < 0.7 ? SAND[1] : SAND[2])
    })
    // Clods tumbling into the gap
    emit(t, { count: 8, gap: 1.5, start: FISSURE_OPEN - 4, life: 8 }, (i, age) => {
      const way = i % 2 ? 1 : -1
      const x = tx + way * (w + 2 - age * 0.6)
      const y = g.ground - 4 + age * age * 0.12
      if (y < g.ground) {
        dot(out, x, y, tones[2])
        dot(out, x + 1, y, tones[3])
      }
    })
  }
  const shut = t - (FISSURE_SHUT + 3)
  if (shut === 0) out.shake = [0, 2]
  if (shut === 1) out.shake = [g.side, -1]
  if (shut >= 0 && shut < 12) {
    cloud(out, tx - 4, g.ground - 1, 5, shut / 12, a.seed + 3)
    cloud(out, tx + 4, g.ground - 1, 5, shut / 12, a.seed + 4)
  }
}

const SHOT_FIRST = 6
const SHOT_GAP = 3
const SHOT_COUNT = 5
const SHOT_FLIGHT = 6

// Brace and spit a rapid volley of mud balls that slap into the target one after
// another, caking it in blobs that ooze down slowly
function mudshot(out, t, a, g, c) {
  const tones = mud(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  if (t < SHOT_FIRST) out.sy = 1 - 0.05 * phase(t, 0, SHOT_FIRST)
  for (let k = 0; k < SHOT_COUNT; k++) {
    const at = SHOT_FIRST + k * SHOT_GAP
    const u = t - at
    if (u === 0) {
      out.dx = -g.side
      out.sx = 1.04
    }
    const hx = tx + Math.round((rnd(a.seed, k, 1) - 0.5) * 6)
    const hy = ty + Math.round((rnd(a.seed, k, 2) - 0.5) * 6)
    if (u >= 0 && u < SHOT_FLIGHT) {
      const f = u / SHOT_FLIGHT
      const x = lerp(mx + g.side, hx, f)
      const y = lerp(my, hy, f) + f * f * 1.5
      glob(out, x, y, 1.5, tones)
      for (let s = 1; s <= 2; s++) dot(out, x - g.side * (s + 1), y + s * 0.5, tones[s + 1])
    }
    // Each ball sticks where it lands and slowly oozes
    const stuck = u - SHOT_FLIGHT
    if (stuck === 0) out.shake = [g.side, 0]
    if (stuck === 0) burst(out, hx, hy, 2, tones[1])
    if (stuck >= 0) {
      const fade = phase(t, a.ticks - 8, a.ticks - 1)
      if (fade < 1) {
        const paint = fade > 0.4 ? dotted : dot
        const ooze = Math.min(3, stuck * 0.2)
        glob(out, hx, hy + ooze * 0.3, 1.3, tones, paint)
        line(out, hx, hy + 1, hx, hy + 1 + ooze, tones[3], paint)
      }
    }
  }
}

const EP_FOCUS = 10
const EP_ERUPT = 20
const EP_COOL = 32

// Press down and focus while glowing cracks spread through the ground under the
// target, then the earth erupts there in a column of molten light and flying rock
function earthpower(out, t, a, g, c) {
  const tones = earth(c)
  const [hot, warm] = [light(c, 0.6), light(c, 0.3)]
  const crust = dark(mix(c, 0x5a3a20, 0.6), 0.3)
  const focus = easeOut(phase(t, 0, EP_FOCUS)) * (1 - phase(t, EP_ERUPT, EP_ERUPT + 4))
  out.sy = 1 - 0.07 * focus
  out.sx = 1 + 0.04 * focus
  if (focus > 0.3) out.shade = tint(c, 0.25 * focus * (t % 4 < 2 ? 1 : 0.6))
  const tx = fit(g, g.target.x, 6)

  // Cracks branching out along the ground under the target, glowing hotter
  const spread = easeOut(phase(t, 4, EP_ERUPT))
  const cool = phase(t, EP_COOL, a.ticks - 1)
  if (spread > 0 && cool < 1) {
    for (const way of [-1, 1]) {
      const len = Math.round(spread * 9)
      for (let k = 0; k <= len; k++) {
        if (cool > 0 && rnd(a.seed, k, way + 5) < cool) continue
        const y = g.ground - (rnd(a.seed, k >> 1, way + 6) < 0.5 ? 0 : 1)
        const heat = t < EP_ERUPT ? ((k + t) % 4 < 2 ? hot : c) : cool > 0.3 ? crust : warm
        back(out, tx + way * k, y, heat)
        if (k % 4 === 2) back(out, tx + way * (k + 1), y - 1, heat)
      }
    }
    if (t < EP_ERUPT && t % 2) out.shake = [0, t % 4 < 2 ? 1 : 0]
  }

  // The eruption column, widest at the burst and narrowing as it dies
  const erupt = t - EP_ERUPT
  if (erupt >= 0 && erupt < 12) {
    const top = Math.round(lerp(g.ground, 0, easeOut(Math.min(1, erupt / 3))))
    const half = erupt < 4 ? 3 : Math.max(0.5, 3 - (erupt - 4) * 0.35)
    for (let y = top; y <= g.ground; y++) {
      const wob = Math.sin(y * 0.7 + t * 1.3) * 0.6
      for (let x = Math.floor(-half); x <= Math.ceil(half); x++) {
        const u = Math.abs(x - wob) / (half + 0.5)
        if (u > 1) continue
        dot(out, tx + x, y, u < 0.35 ? WHITE : u < 0.7 ? hot : c)
      }
    }
    if (erupt < 3) burst(out, tx, g.ground - 2, [6, 7, 5][erupt], WHITE)
  }
  if (erupt === 0) out.shake = [g.side, 2]
  if (erupt === 1) out.shake = [-g.side, -2]
  if (erupt === 2) out.shake = [0, 1]
  // Rocks hurled up and embers drifting down
  emit(t, { count: 8, gap: 0, start: EP_ERUPT, life: 16 }, (i, age) => {
    const way = i % 2 ? 1 : -1
    const [x, y] = fling(tx, g.ground - 3, way * (0.3 + rnd(a.seed, i, 7) * 0.8), -2.4 - rnd(a.seed, i, 8) * 1.2, age, g.ground)
    dot(out, x, y, tones[2])
    dot(out, x + 1, y, tones[4])
    dot(out, x, y - 1, tones[0])
  })
  emit(t, { count: 12, gap: 0.6, start: EP_ERUPT + 4, life: 12 }, (i, age, f) => {
    const x = tx + (rnd(a.seed, i, 9) - 0.5) * 12 + Math.sin(age * 0.5 + i) * 0.8
    const y = 2 + rnd(a.seed, i, 10) * 6 + age * 0.9
    if (y < g.ground) dot(out, x, y, f < 0.5 ? hot : c)
  })
}

// Pixel digits three wide and five tall, for the magnitude
const DIGITS = {
  0: ['nnn', 'n.n', 'n.n', 'n.n', 'nnn'],
  1: ['.n.', 'nn.', '.n.', '.n.', 'nnn'],
  4: ['n.n', 'n.n', 'nnn', '..n', '..n'],
  5: ['nnn', 'n..', 'nnn', '..n', 'nnn'],
  6: ['nnn', 'n..', 'nnn', 'n.n', 'nnn'],
  7: ['nnn', '..n', '.n.', '.n.', '.n.'],
  8: ['nnn', 'n.n', 'nnn', 'n.n', 'nnn'],
  9: ['nnn', 'n.n', 'nnn', '..n', 'nnn'],
}

// A number in pixel digits with a dark outline, centered on x
function number(out, x, y, n, col, edge) {
  const text = String(n)
  const left = Math.round(x - (text.length * 4 - 1) / 2)
  for (let k = 0; k < text.length; k++) {
    const art = DIGITS[text[k]]
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stamp(out, left + k * 4 + dx, y + dy, art, { n: edge })
    stamp(out, left + k * 4, y, art, { n: col })
  }
}

const MAG_GO = 10
const MAG_STOP = 38
const MAG_SPEED = 0.9

// Rolls a magnitude from 4 to 10 that flashes overhead, then the ground swells in
// rolling waves out both ways, as high and as shaky as the number says
function magnitude(out, t, a, g, c) {
  const tones = earth(c)
  const level = 4 + Math.floor(rnd(a.seed, 77) * 7)
  const power = (level - 3) / 7
  // The number pops up above the mon, flickering through values before it settles
  if (t >= 1 && t < MAG_GO + 6) {
    const shown = t < 6 ? 4 + ((t * 3) % 7) : level
    const y = Math.max(1, g.top - 7 - (t < 3 ? 0 : 1))
    if (t < MAG_GO + 2 || t % 2) number(out, g.cx, y, shown, t < 6 ? light(c, 0.5) : WHITE, dark(c, 0.6))
  }
  if (t < MAG_GO) {
    out.sy = 1 - 0.06 * phase(t, 4, MAG_GO)
    out.sx = 1 + 0.04 * phase(t, 4, MAG_GO)
  }

  const fade = 1 - phase(t, MAG_STOP - 6, MAG_STOP)
  const amp = (1 + power * 3) * fade * phase(t, MAG_GO, MAG_GO + 3)
  const since = t - MAG_GO
  // Height of the ground wave at column x, ridges travelling out from the mon
  const swell = (x) => {
    const d = Math.abs(x - g.cx)
    const front = since * MAG_SPEED * 3
    if (d > front) return 0
    return Math.max(0, Math.sin((d - since * MAG_SPEED * 3) * 0.45)) * amp
  }
  if (since >= 0 && amp > 0) {
    for (let x = 0; x < g.columns; x++) {
      const h = Math.round(swell(x))
      for (let k = 0; k <= h; k++) back(out, x, g.ground - k, k === h ? tones[x % 3 ? 1 : 0] : k === h - 1 ? tones[2] : tones[3])
    }
    out.dy = -Math.round(swell(g.cx) * 0.6)
    const shake = Math.round(power * 2 * fade)
    if (shake > 0) out.shake = [t % 2 ? shake : -shake, (t >> 1) % 2 ? Math.min(1, shake) : 0]
    out.skew = lean(g, Math.sin(t * 0.8) * power * 1.5 * fade)
  }
  // Pebbles bouncing on the crests
  for (let i = 0; i < 4 + level; i++) {
    const x = Math.round(rnd(a.seed, i, 3) * (g.columns - 1))
    if (since < 0 || Math.abs(x - g.cx) < (g.right - g.left) / 2 + 1) continue
    const h = swell(x)
    if (h < 0.5) continue
    dot(out, x, g.ground - Math.round(h) - 1 - Math.round(h * 0.5), tones[i % 2 ? 2 : 3])
  }
}

const BOMB_LOB = 9
const BOMB_LAND = 22

// Puff up and lob a big wobbling ball of mud high over to the target, where it bursts
// in a great splatter and mud rains down into a puddle
function mudbomb(out, t, a, g, c) {
  const tones = mud(c)
  const puffUp = easeOut(phase(t, 0, BOMB_LOB - 1))
  if (t < BOMB_LOB) {
    out.sx = 1 + 0.06 * puffUp
    out.sy = 1 + 0.04 * puffUp
    out.dx = -Math.round(puffUp) * g.side
  } else if (t < BOMB_LOB + 3) {
    out.dx = g.side
    out.dy = -1
  }
  const { x: mx, y: my } = g.mouth
  const tx = fit(g, g.target.x, 5)
  const ty = g.target.y
  if (t >= 3 && t < BOMB_LOB) glob(out, mx + g.side * 2, my, 1 + puffUp * 1.5, tones)
  if (t >= BOMB_LOB && t < BOMB_LAND) {
    const f = phase(t, BOMB_LOB, BOMB_LAND)
    const x = lerp(mx + g.side * 2, tx, f)
    const peak = clamp(my - 2, 4, 10)
    const y = lerp(my, ty, f) - Math.sin(Math.PI * f) * peak
    const r = 2.6 + (t % 3 === 0 ? 0.4 : 0)
    glob(out, x, Math.max(r + 1, y), r, tones)
    if (t % 2) dot(out, x - g.side * 3, y + 2, tones[3])
  }
  const hit = t - BOMB_LAND
  if (hit < 0) return
  if (hit === 0) out.shake = [g.side * 2, 2]
  if (hit === 1) out.shake = [-g.side, -1]
  if (hit < 3) burst(out, tx, ty, [5, 7, 5][hit], hit ? tones[1] : WHITE)
  if (hit < 6) splat(out, tx, ty, 6, tones, a.seed, 0.6 + hit * 0.12)
  // Mud thrown out in all directions, raining down to the ground
  emit(t, { count: 16, gap: 0, start: BOMB_LAND, life: 16 }, (i, age) => {
    const ang = (i / 16) * TAU + rnd(a.seed, i) * 0.3
    const v = 1 + rnd(a.seed, i, 1) * 0.9
    const [x, y] = fling(tx, ty, Math.cos(ang) * v, Math.sin(ang) * v - 0.8, age, g.ground)
    if (i % 3 === 0 && y < g.ground) glob(out, x, y, 1, tones)
    else dot(out, x, y, tones[y < g.ground ? 2 : 3])
  })
  // The puddle it leaves on the ground
  const pool = easeOut(phase(hit, 3, 10)) * (1 - phase(hit, 14, a.ticks - BOMB_LAND))
  if (pool > 0) {
    const rx = 7 * pool
    for (let x = Math.floor(tx - rx); x <= Math.ceil(tx + rx); x++) dot(out, x, g.ground, Math.abs(x - tx) > rx - 1 ? tones[4] : tones[3])
  }
}

const SPIKE_THROWS = [6, 10, 14]
const SPIKE_FLIGHT = 9

// A caltrop: four points out of a dark core, turned on alternate ticks as it tumbles
function caltrop(out, x, y, tones, turn) {
  dot(out, x, y, tones[3])
  const arms = turn ? [[1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 0], [-1, 0], [0, -1], [0, 1]]
  for (const [dx, dy] of arms) {
    dot(out, x + dx, y + dy, tones[1])
    dot(out, x + dx * 2, y + dy * 2, dy < 0 ? WHITE : tones[2])
  }
}

// Flick three caltrops one by one in high arcs; they tumble, bounce, and bite into
// the ground near the target, glinting as they wait
function spikes(out, t, a, g, c) {
  const tones = [WHITE, light(c, 0.3), c, dark(c, 0.5)]
  const { x: mx, y: my } = g.mouth
  const fade = phase(t, a.ticks - 6, a.ticks - 1)
  SPIKE_THROWS.forEach((at, k) => {
    const u = t - at
    if (u >= -2 && u < 0) out.dx = -g.side
    if (u >= 0 && u < 2) {
      out.dx = g.side
      out.dy = -1
    }
    const lx = fit(g, g.target.x + g.side * (k - 1) * 5, 3)
    const ly = g.ground - 2
    if (u >= 0 && u < SPIKE_FLIGHT) {
      const f = u / SPIKE_FLIGHT
      const x = lerp(mx, lx, f)
      const y = lerp(my - 1, ly, f) - Math.sin(Math.PI * f) * 6
      caltrop(out, x, y, tones, (t + k) % 2)
    } else if (u >= SPIKE_FLIGHT && fade < 1) {
      const land = u - SPIKE_FLIGHT
      const hop = land < 3 ? [1, 1, 0][land] : 0
      if (land === 0) out.shake = [0, 1]
      if (fade > 0.5 && (t + k) % 2) return
      caltrop(out, lx, ly - hop, tones, 0)
      if (land < 6) cloud(out, lx, g.ground - 1, 2.5, land / 6, a.seed + k)
      if ((t + k * 5) % 12 === 0) spark(out, lx, ly - 2, 1, tones[1])
    }
  })
}

const BONE_TWIRL = 10
const BONE_RUSH = 13
const BONE_JABS = 4
const BONE_JAB_GAP = 4

// A bone of len pixels from its middle at x, y toward angle, knobbed at both ends
function staff(out, x, y, angle, len, c, paint = dot) {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const rim = dark(c, 0.55)
  const half = len / 2
  for (let d = -half; d <= half; d += 0.5) paint(out, x + ux * d, y + uy * d + 1, rim)
  for (let d = -half; d <= half; d += 0.5) paint(out, x + ux * d, y + uy * d, d < 0 ? WHITE : c)
  for (const end of [-half, half]) {
    for (const s of [-1, 1]) {
      paint(out, x + ux * end - uy * s, y + uy * end + ux * s, s < 0 ? WHITE : c)
      paint(out, x + ux * (end + Math.sign(end) * 0.8) - uy * s, y + uy * (end + Math.sign(end) * 0.8) + ux * s, rim)
    }
  }
}

// Twirl a bone like a baton overhead, rush in, and jab it into the target several
// times at different heights, then twirl it once more on the way home
function bonerush(out, t, a, g, c) {
  const hits = 2 + Math.floor(rnd(a.seed, 3) * (BONE_JABS - 1))
  const last = BONE_RUSH + 2 + hits * BONE_JAB_GAP
  const far = travel(g, 10, 6)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [BONE_TWIRL, -1], [BONE_RUSH + 2, far, easeIn], [last, far], [last + 8, 0, easeOut]]))
  const len = clamp(Math.round((g.bottom - g.top) * 0.6), 6, 9)
  const hx = g.mouth.x + out.dx
  const hy = g.mouth.y + 1

  // Twirling in front of the body, before the rush and on the way back
  const twirling = (t >= 1 && t < BONE_RUSH + 2) || (t >= last && t < last + 8)
  if (twirling) {
    const spin = t * 1.1 * g.side
    staff(out, hx + g.side, hy - 1, spin, len, c)
    if (t < BONE_RUSH) {
      const prev = spin - 0.6 * g.side
      for (let s = 0; s < 3; s++) {
        const ang = prev + s * 0.2 * g.side
        dot(out, hx + g.side + Math.cos(ang) * len * 0.55, hy - 1 + Math.sin(ang) * len * 0.55, light(c, 0.2))
      }
    }
  }
  // The jabs: thrust level and out, each landing a little higher or lower
  for (let k = 0; k < hits; k++) {
    const at = BONE_RUSH + 2 + k * BONE_JAB_GAP
    const u = t - at
    if (u < 0 || u >= BONE_JAB_GAP) continue
    const reach = [2, 4, 3, 1][u]
    const y = hy + [-2, 2, 0, 1][k % 4]
    const angle = g.side > 0 ? 0 : Math.PI
    staff(out, hx + g.side * (len / 2 + reach - 1), y, angle, len, c)
    if (u === 1) {
      out.dx += g.side
      out.shake = [g.side * (k === hits - 1 ? 2 : 1), 0]
      const tip = hx + g.side * (len + reach)
      burst(out, tip, y, k === hits - 1 ? 5 : 3, WHITE)
    }
    if (u === 2) plus(out, hx + g.side * (len + reach + 1), y - 2, light(c, 0.2), WHITE)
  }
}

const DRILL_SPIN = 10
const DRILL_HIT = 18
const DRILL_GRIND = 28
const DRILL_HOME = 38

// Spin up into a whirling drill with a spiral cone at the front, tear along the
// ground to the target leaving a furrow, grind into it in a spray of grit, and spin
// back down at home
function drillrun(out, t, a, g, c) {
  const tones = earth(c)
  const steel = [WHITE, light(c, 0.45), c, dark(c, 0.45)]
  const far = travel(g, 12, 5)
  const speed = phase(t, 0, DRILL_SPIN) * (1 - phase(t, DRILL_HOME - 4, a.ticks - 2))
  // The sprite turns: squeezed thin and mirrored through each half turn
  const angle = keys(t, [[0, 0], [DRILL_SPIN, 4], [DRILL_HOME - 4, 22], [a.ticks - 2, 24]], easeInOut) * Math.PI
  const turn = Math.cos(angle)
  if (speed > 0) {
    out.sx = Math.max(0.35, Math.abs(turn))
    out.flipX = turn < 0
  }
  out.dx = Math.round(g.side * keys(t, [[0, 0], [DRILL_SPIN, -1], [DRILL_HIT, far, easeIn], [DRILL_GRIND, far], [DRILL_HOME, 0]]))
  const grinding = t >= DRILL_HIT && t < DRILL_GRIND
  if (grinding) out.dx += tremble(t)

  // The cone on the front, its grooves sliding back as it turns
  const cone = easeOut(phase(t, 3, DRILL_SPIN)) * (1 - easeIn(phase(t, DRILL_GRIND + 2, DRILL_HOME)))
  if (cone > 0.05) {
    const len = Math.round(2 + cone * 6)
    const half = Math.max(1.5, (g.bottom - g.top) * 0.25)
    const bx = g.mouth.x + out.dx
    const by = g.mouth.y + 1
    for (let k = 0; k <= len; k++) {
      const w = Math.round(half * (1 - k / (len + 1)))
      for (let d = -w; d <= w; d++) {
        const groove = (k + d + Math.floor(t * 1.5)) % 3 === 0
        dot(out, bx + g.side * k, by + d, k === len ? WHITE : groove ? steel[3] : d < 0 ? steel[1] : steel[2])
      }
    }
  }
  // Dirt thrown back behind the charge, and a furrow left in the ground
  if (t >= DRILL_SPIN && t < DRILL_GRIND) {
    emit(t, { count: 18, gap: 1, start: DRILL_SPIN, life: 7 }, (i, age) => {
      const x0 = g.cx + out.dx - g.side * ((g.right - g.left) / 2)
      const [x, y] = fling(x0, g.ground - 1, -g.side * (0.6 + rnd(a.seed, i) * 0.8), -1.2 - rnd(a.seed, i, 1), age, g.ground)
      dot(out, x, y, tones[1 + (i % 3)])
    })
  }
  const furrow = phase(t, DRILL_SPIN, DRILL_HIT) * (1 - phase(t, DRILL_GRIND, a.ticks - 1))
  if (furrow > 0) {
    const from = g.cx
    const to = g.cx + out.dx
    for (let x = Math.min(from, to); x <= Math.max(from, to); x++) {
      if (rnd(a.seed, x, 4) > furrow + 0.2) continue
      back(out, x, g.ground, x % 2 ? tones[3] : tones[4])
    }
  }
  // Grit and sparks sprayed while grinding into the target
  if (grinding) {
    const tip = g.mouth.x + out.dx + g.side * 8
    if (t % 2) out.shake = [g.side, t % 4 < 2 ? 1 : 0]
    emit(t, { count: 20, gap: 0.5, start: DRILL_HIT, life: 6 }, (i, age) => {
      const ang = -Math.PI / 2 + (rnd(a.seed, i, 5) - 0.5) * 2.2
      const v = 1 + rnd(a.seed, i, 6)
      const x = tip + Math.cos(ang) * v * age - g.side * age * 0.4
      const y = g.mouth.y + 1 + Math.sin(ang) * v * age + 0.15 * age * age
      dot(out, x, y, i % 3 ? tones[i % 2 ? 1 : 2] : WHITE)
    })
    if (t === DRILL_HIT) burst(out, tip, g.mouth.y + 1, 5, WHITE)
  }
}

const DOZE_STOMPS = [5, 11, 17]
const DOZE_HIT = 27

// Stomp three times while shuffling forward, each stomp heaving up a bigger ridge of
// earth that rolls ahead and finally crashes into the target in a spray of clods
function bulldoze(out, t, a, g, c) {
  const tones = earth(c)
  let step = 0
  DOZE_STOMPS.forEach((s, k) => {
    const u = t - s
    if (u >= -3 && u < 0) {
      out.dy = -1 - (u === -2 ? 1 : 0)
      out.sy = 1.05
    }
    if (u >= 0 && u < 2) {
      out.sy = u ? 0.94 : 0.86
      out.sx = u ? 1.04 : 1.1
    }
    if (u === 0) out.shake = [0, k === 2 ? 2 : 1]
    if (u >= 0) step = k + 1
    if (u >= 0 && u < 8) {
      cloud(out, g.left - 1, g.ground - 1, 3, u / 8, a.seed + k * 2)
      cloud(out, g.right + 1, g.ground - 1, 3, u / 8, a.seed + k * 2 + 1)
    }
  })
  out.dx = Math.round(g.side * Math.min(step, 3) * (1 - phase(t, DOZE_HIT + 2, a.ticks - 2)))

  // The ridge rolls from the front feet to the target, growing with each stomp
  const fx = g.frontAt(g.bottom - 1) + out.dx
  const tx = g.target.x
  const roll = easeIn(phase(t, DOZE_STOMPS[0], DOZE_HIT))
  if (t >= DOZE_STOMPS[0] && t < DOZE_HIT) {
    const x = lerp(fx, tx, roll)
    const h = 1.5 + step * 1.2
    const rx = 2 + step
    for (let px = Math.floor(x - rx * 1.6); px <= Math.ceil(x + rx); px++) {
      const u = (px - x) * g.side
      // Steep in front, a long slope behind
      const shape = u > 0 ? 1 - (u / rx) ** 2 : 1 - (u / (rx * 1.6)) ** 2
      if (shape <= 0) continue
      const top = Math.round(h * Math.sqrt(shape))
      for (let k = 0; k <= top; k++) dot(out, px, g.ground - k, k === top ? tones[u < 0 ? 0 : 1] : k === top - 1 ? tones[2] : tones[3])
    }
    // Clods tumbling down its front
    for (let k = 0; k < step + 1; k++) {
      const ang = t * 0.8 + k * 2
      const px = x + g.side * (rx * 0.6 + Math.cos(ang))
      const py = g.ground - h * 0.6 + Math.sin(ang) * 1.2
      dot(out, px, py, tones[4])
      dot(out, px, py - 1, tones[1])
    }
    if (t % 3 === 0) out.shake = [out.shake[0], 1]
  }
  const hit = t - DOZE_HIT
  if (hit === 0) out.shake = [g.side * 2, 2]
  if (hit === 1) out.shake = [-g.side, -1]
  if (hit >= 0 && hit < 3) burst(out, tx, g.ground - 4, [6, 5, 3][hit], hit ? tones[0] : WHITE)
  emit(t, { count: 12, gap: 0, start: DOZE_HIT, life: 14 }, (i, age) => {
    const ang = -Math.PI / 2 + (rnd(a.seed, i, 2) - 0.5) * 2.6
    const v = 1 + rnd(a.seed, i, 3) * 1.2
    const [x, y] = fling(tx, g.ground - 3, Math.cos(ang) * v + g.side * 0.4, Math.sin(ang) * v * 1.3, age, g.ground)
    dot(out, x, y, tones[i % 4])
    if (i % 3 === 0) dot(out, x + 1, y, tones[4])
  })
  if (hit >= 0 && hit < 12) cloud(out, tx, g.ground - 2, 5, hit / 12, a.seed + 30)
}

export const GROUND = {
  mudslap: { ticks: 32, color: 0x8f6638, draw: mudslap },
  mudsport: { ticks: 44, color: 0x8a6438, pose: { view: 'front' }, draw: mudsport },
  sandtomb: { ticks: 46, color: 0xd8b070, draw: sandtomb },
  fissure: { ticks: 54, color: 0x6a4a2a, draw: fissure },
  mudshot: { ticks: 36, color: 0x7a5028, draw: mudshot },
  earthpower: { ticks: 46, color: 0xe07030, draw: earthpower },
  magnitude: { ticks: 46, color: 0x9a7040, draw: magnitude },
  mudbomb: { ticks: 44, color: 0x6a4626, draw: mudbomb },
  spikes: { ticks: 40, color: 0x9a9aa8, draw: spikes },
  bonerush: { ticks: 44, color: 0xf0ead8, draw: bonerush },
  drillrun: { ticks: 46, color: 0x9a8a70, draw: drillrun },
  bulldoze: { ticks: 44, color: 0x8a6640, draw: bulldoze },
}
