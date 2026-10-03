// Ground, rock, and snowstorm moves

import {
  WHITE, back, burst, clamp, dark, dot, easeIn, easeInOut, easeOut, emit, lerp, light, mix, phase, plus, rnd, spark,
  stamp, tremble,
} from './draw.js'

// Five steps of a color for rock and dirt: highlight, lit face, base, shadow, outline
const stone = (c) => [light(c, 0.6), light(c, 0.28), c, dark(c, 0.35), dark(c, 0.62)]

// Five steps of ice from its color: white, frost, the color, and two blues for depth
const frost = (c) => [WHITE, light(c, 0.5), c, mix(c, 0x3f7fd0, 0.55), mix(c, 0x1f4f99, 0.8)]

const DUST = [0xeadbb4, 0xcdb388, 0xa08260]
const GRAY = 0x8a8a8a
const CRACK = 0x22160c
const GRAVITY = 0.35

// Small rocks drawn by hand, each in two turns: h highlight, l lit, b base, s shadow
const PEBBLES = [
  [['hl', 'bs']],
  [['.hl', 'hlb', 'lbs'], ['hl.', 'lbs', '.bs']],
  [['.hl.', 'hllb', 'lbbs', '.bs.'], ['.hh.', 'hlbs', 'lbbs', '.ss.']],
]

// A chunky rock of radius r lit from the top left, with a dark rim on its shadow
// side. spin turns it, so it tumbles while the light stays put.
function rock(out, x, y, r, tones, seed, spin = 0, paint = dot) {
  const cx = Math.round(x)
  const cy = Math.round(y)
  if (r < 2.8) {
    const sizes = PEBBLES[r < 1.5 ? 0 : r < 2.2 ? 1 : 2]
    const art = sizes[Math.floor(Math.abs(spin) / 1.2) % sizes.length]
    const half = Math.floor(art.length / 2)
    stamp(out, cx - half, cy - half, art, { h: tones[0], l: tones[1], b: tones[2], s: tones[3] }, false, paint)
    return
  }
  const reach = Math.ceil(r * 1.1)
  for (let py = -reach; py <= reach; py++) {
    for (let px = -reach; px <= reach; px++) {
      const turn = (((Math.atan2(py, px) - spin) / (Math.PI * 2)) * 7 + 70) % 7
      const k = Math.floor(turn)
      const lump = lerp(rnd(seed, k), rnd(seed, (k + 1) % 7), turn - k)
      const edge = r * (0.8 + 0.3 * lump)
      const d = Math.hypot(px, py)
      if (d > edge) continue
      const lean = (px + py) / r
      const rim = d > edge - 1
      const tone = rim && lean > -0.2 ? 4 : lean < -0.75 ? 0 : lean < -0.1 ? 1 : lean < 0.6 ? 2 : 3
      paint(out, cx + px, cy + py, tones[tone])
    }
  }
}

// A cloud of a few lumps that billows up and out, airy at its rim, then thins away
// (f from 0 to 1)
export function dust(out, x, y, r, f, seed, tones = DUST, paint = dot) {
  if (f >= 1) return
  const grow = 0.55 + 0.45 * easeOut(Math.min(1, f * 2))
  const fade = 1 - f ** 1.4
  for (let k = 0; k < 3; k++) {
    const cx = x + (rnd(seed, k, 1) - 0.5) * r * (0.9 + f)
    const cy = y - rnd(seed, k, 2) * r * 0.4 - f * r * 0.7
    const rr = r * grow * (0.5 + 0.3 * rnd(seed, k, 3))
    for (let py = Math.floor(cy - rr); py <= Math.ceil(cy + rr); py++) {
      for (let px = Math.floor(cx - rr); px <= Math.ceil(cx + rr); px++) {
        const d = Math.hypot(px - cx, py - cy) / rr
        if (d > 1 || rnd(seed, px * 53 + py * 7, k) > fade * (1 - 0.6 * d * d)) continue
        const up = py < cy - rr * 0.25
        paint(out, px, py, d < 0.45 ? tones[up ? 0 : 1] : tones[up ? 1 : 2])
      }
    }
  }
}

// Height above its resting spot of something tossed up at speed v, `age` ticks on,
// bouncing a little lower each time
function bounce(age, v, hops = 2, keep = 0.4) {
  let time = age
  let speed = v
  for (let n = 0; n <= hops; n++) {
    const flight = (2 * speed) / GRAVITY
    if (time < flight) return speed * time - 0.5 * GRAVITY * time * time
    time -= flight
    speed *= keep
  }
  return 0
}

// When something dropped from `from` above its resting spot with speed v lands
const landing = (from, v) => (-v + Math.sqrt(v * v + 2 * GRAVITY * from)) / GRAVITY

// Height above its resting spot of something dropped from `from` with speed v, then
// bouncing
function drop(age, from, v, hops = 1) {
  const land = landing(from, v)
  if (age < land) return from - v * age - 0.5 * GRAVITY * age * age
  return bounce(age - land, (v + GRAVITY * land) * 0.35, hops)
}

// A clod or chip flung from x, y at speed vx, vy that comes to rest on the ground
function fling(x, y, vx, vy, age, ground) {
  const fall = y + vy * age + 0.5 * GRAVITY * age * age
  if (fall < ground) return [x + vx * age, fall]
  const land = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * (ground - y))) / GRAVITY
  return [x + vx * land, ground]
}

const QUAKE_STOMP = 8
const QUAKE_AFTERSHOCK = 21
const QUAKE_SETTLE = 38
const QUAKE_SPEED = 3

// How hard the ground shakes at tick t, a jolt at the stomp and then rolling aftershocks
function quakeAmp(t) {
  if (t < QUAKE_STOMP) return 0
  if (t < QUAKE_STOMP + 6 || (t >= QUAKE_AFTERSHOCK && t < QUAKE_AFTERSHOCK + 3)) return 2
  if (t < QUAKE_SETTLE - 6) return 1
  return t < QUAKE_SETTLE ? t % 2 : 0
}

// The crack's height at step k from where it starts, in short jagged runs
const crackY = (a, g, k, way) => g.ground - 1 - (rnd(a.seed, Math.floor(k / 3), way + 40) < 0.5 ? 0 : 1)

// Rise and stomp. The strip shakes both ways as cracks race along the ground with rocks
// and dust hopping up along them, then the ground settles shut.
function earthquake(out, t, a, g, c) {
  const dirt = stone(c)
  const rocks = stone(mix(c, GRAY, 0.7))
  if (t < QUAKE_STOMP - 1) {
    const e = easeOut(phase(t, 0, QUAKE_STOMP - 2))
    out.dy = -Math.round(4 * e)
    out.sy = 1 + 0.08 * e
    out.sx = 1 - 0.04 * e
  } else if (t === QUAKE_STOMP - 1) {
    out.dy = -2
    out.sy = 1.1
  } else if (t < QUAKE_STOMP + 4) {
    const k = t - QUAKE_STOMP
    out.sy = [0.8, 0.87, 0.94, 1][k]
    out.sx = [1.16, 1.1, 1.04, 1][k]
  }
  const amp = quakeAmp(t)
  if (amp) out.shake = [amp * (t % 2 ? 1 : -1), amp * ((t >> 1) % 2 ? 1 : -1)]

  // Two cracks run out from under the mon, the long one toward the target
  const since = t - QUAKE_STOMP
  const close = phase(t, QUAKE_SETTLE, a.ticks - 1)
  for (const way of [g.side, -g.side]) {
    const len = Math.min(since * QUAKE_SPEED, 40)
    for (let k = 0; k <= len; k++) {
      const x = g.cx + way * k
      if (x < 0 || x >= g.columns || rnd(a.seed, k, way + 9) < close) continue
      const y = crackY(a, g, k, way)
      back(out, x, y - 1, dirt[1])
      back(out, x, y, CRACK)
      back(out, x, y + 1, dirt[3])
      if (y + 1 < g.ground) back(out, x, g.ground, dirt[2])
      // A short branch splitting off upward now and then
      if (rnd(a.seed, k, way + 20) < 0.14 && k > 2) {
        for (let b = 1; b <= 2; b++) back(out, x + way * b, y - b, b === 2 ? dirt[1] : CRACK)
      }
      // A slab of ground heaved up beside the crack, popping as the crack passes
      if (k % 6 === 3) {
        const lift = since - k / QUAKE_SPEED < 2 ? 1 : 0
        for (let s = 0; s < 3; s++) back(out, x + way * s, y - 2 - lift - (s === 1 ? 1 : 0), s === 0 ? dirt[0] : dirt[1])
      }
    }
  }

  // Rocks thrown up as the crack front passes, hopping again in the aftershock
  for (const way of [g.side, -g.side]) {
    for (let i = 0; i < 7; i++) {
      const k = Math.round((g.right - g.left) / 2) + 2 + i * 5 + Math.floor(rnd(a.seed, i, way + 1) * 3)
      const x = g.cx + way * k
      if (x < 1 || x > g.columns - 2) continue
      const born = QUAKE_STOMP + k / QUAKE_SPEED
      const age = t - born
      if (age < 0 || close > rnd(a.seed, i, way + 2)) continue
      const v = 1.3 + rnd(a.seed, i, way + 3) * 1.1
      const h = bounce(age, v) + (t >= QUAKE_AFTERSHOCK ? bounce(t - QUAKE_AFTERSHOCK, v * 0.7, 1) : 0)
      const r = 1.6 + rnd(a.seed, i, way + 4) * 0.9
      rock(out, x, g.ground - Math.round(r) - h, r, rocks, a.seed + i, h * 0.5)
      if (age < 8) dust(out, x, g.ground - 1, 2.5, age / 8, a.seed + i * 3 + way)
    }
  }

  // Dust bursting out from under the stomp
  if (since >= 0 && since < 14) {
    dust(out, g.left - 1, g.ground - 1, 4, since / 14, a.seed + 50)
    dust(out, g.right + 1, g.ground - 1, 4, since / 14, a.seed + 51)
  }
}

const DIG_SINK = 4
const DIG_UNDER = 15
const DIG_SURGE = 28
const DIG_BURST = 32
const DIG_LAND = 37

// A mound of dirt on the ground at x, h pixels tall and rx pixels to either side
function mound(out, x, g, rx, h, dirt) {
  for (let px = Math.floor(x - rx); px <= Math.ceil(x + rx); px++) {
    const u = (px - x) / rx
    if (Math.abs(u) > 1) continue
    const top = Math.round(h * Math.sqrt(1 - u * u))
    for (let k = 0; k <= top; k++) dot(out, px, g.ground - k, k === top ? dirt[u < 0.2 ? 0 : 1] : k === top - 1 ? dirt[2] : dirt[3])
  }
}

// Burrow down in a spray of dirt, tunnel along as a mound under the ground, and
// burst up at the new spot with rocks flying
function dig(out, t, a, g, c) {
  const dirt = stone(c)
  const rocks = stone(mix(c, GRAY, 0.7))
  const shift = (a.toX ?? g.x) - g.x
  const depth = g.ground - g.top + 2
  const half = (g.right - g.left) / 2
  const from = g.cx
  const to = g.cx + shift

  if (t < DIG_SINK) {
    out.dx = tremble(t)
    out.sy = 1 - 0.06 * phase(t, 0, DIG_SINK)
    out.sx = 1 + 0.04 * phase(t, 0, DIG_SINK)
  } else if (t < DIG_UNDER) {
    out.dy = Math.round(easeIn(phase(t, DIG_SINK, DIG_UNDER - 1)) * depth)
    out.dx = tremble(t)
  } else if (t < DIG_BURST) {
    out.hidden = true
  } else {
    out.dx = shift
    if (t < DIG_LAND) {
      out.dy = Math.round(lerp(depth * 0.55, -3, easeOut(phase(t, DIG_BURST, DIG_LAND - 1))))
      out.sy = 1.12
      out.sx = 0.92
    } else if (t < DIG_LAND + 3) {
      out.sy = [0.86, 0.93, 1][t - DIG_LAND]
      out.sx = [1.1, 1.05, 1][t - DIG_LAND]
    }
  }

  // Dirt heaps up on both sides of the hole, with a lip in front of the sinking body
  const heap = easeOut(phase(t, DIG_SINK, DIG_UNDER)) * (1 - phase(t, DIG_UNDER + 4, DIG_SURGE))
  if (heap > 0) {
    mound(out, g.left - 1, g, 3, 1 + heap * 2.5, dirt)
    mound(out, g.right + 1, g, 3, 1 + heap * 2.5, dirt)
    for (let x = g.left; x <= g.right; x++) {
      dot(out, x, g.ground, t < DIG_UNDER ? dirt[2] : CRACK)
      if (t < DIG_UNDER && rnd(a.seed, x, 3) < 0.6) dot(out, x, g.ground - 1, dirt[x % 2 ? 1 : 3])
    }
  }
  emit(t, { count: 24, gap: 0.5, start: DIG_SINK, life: 10 }, (i, age, f) => {
    const way = i % 2 ? 1 : -1
    const [x, y] = fling(g.cx + way * half * 0.6, g.ground - 1, way * (0.5 + rnd(a.seed, i, 4) * 1.1), -1.4 - rnd(a.seed, i, 5) * 1.2, age, g.ground)
    dot(out, x, y, dirt[f < 0.5 ? 1 : 2])
    if (i % 3 === 0) dot(out, x + 1, y, dirt[3])
  })

  // The mound tunneling along, with a furrow of loose dirt behind it
  if (t >= DIG_UNDER && t < DIG_BURST) {
    const x = lerp(from, to, easeInOut(phase(t, DIG_UNDER, DIG_SURGE)))
    const swell = phase(t, DIG_SURGE - 1, DIG_BURST)
    const quiver = t >= DIG_SURGE ? tremble(t) : 0
    mound(out, x + quiver, g, 3.5 + swell * 1.5, 2 + Math.sin(t * 1.3) * 0.6 + swell * 1.5, dirt)
    if (swell > 0.3) for (let k = -1; k <= 1; k++) dot(out, x + quiver + k * 2, g.ground - 2 - (k === 0 ? 1 : 0), CRACK)
    const way = Math.sign(to - from)
    for (let k = 4; k < Math.abs(x - from); k++) {
      const age = t - DIG_UNDER - (k - 4) / Math.max(1, Math.abs(to - from) / (DIG_SURGE - DIG_UNDER))
      if (rnd(a.seed, k, 11) < 0.25 + age * 0.06) continue
      dot(out, x - way * k, g.ground, dirt[k % 3 === 0 ? 1 : 3])
    }
    if (t % 2 === 0) dot(out, x + (rnd(a.seed, t, 12) - 0.5) * 6, g.ground - 4 - (t % 4 ? 0 : 1), dirt[1])
    if (t >= DIG_SURGE) out.shake = [t % 2 ? 1 : -1, 0]
  }

  // The burst jolts the strip, throws rocks and clods, and rolls dust out both ways
  const burst = t - DIG_BURST
  if (burst === 0 || burst === 1) out.shake = [burst ? -g.side : g.side, burst ? -1 : 2]
  emit(t, { count: 7, start: DIG_BURST, gap: 0, life: (i) => 12 + (i % 4) }, (i, age) => {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, 13) - 0.5) * 2.4
    const speed = 1.3 + rnd(a.seed, i, 14) * 1
    const [x, y] = fling(to, g.ground - 3, Math.cos(angle) * speed, Math.sin(angle) * speed * 1.4, age, g.ground - 1)
    rock(out, x, y, i % 3 ? 1 : 1.6, rocks, a.seed + i, age * 0.6)
  })
  emit(t, { count: 12, start: DIG_BURST, gap: 0, life: 12 }, (i, age, f) => {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, 15) - 0.5) * 2.8
    const speed = 1 + rnd(a.seed, i, 16) * 1.2
    const [x, y] = fling(to, g.ground - 2, Math.cos(angle) * speed, Math.sin(angle) * speed * 1.3, age, g.ground)
    dot(out, x, y, dirt[f < 0.5 ? 1 : 3])
  })
  if (burst >= 0 && burst < 14) {
    dust(out, to - half - 2, g.ground - 1, 4, burst / 14, a.seed + 60, DUST, back)
    dust(out, to + half + 2, g.ground - 1, 4, burst / 14, a.seed + 61, DUST, back)
    const lip = 1 - phase(burst, 8, 14)
    mound(out, to - half, g, 2.5, lip * 2, dirt)
    mound(out, to + half, g, 2.5, lip * 2, dirt)
  }
}

const THROW_FIRST = 7
const THROW_GAP = 5
const THROW_LIFT = 4
const THROW_FLIGHT = 8

// Tear one to three rocks up out of the ground and heave them in arcs that crash
// down around the target, splitting into chips in a burst of dust
function rockthrow(out, t, a, g, c) {
  const tones = stone(c)
  const count = 1 + Math.floor(rnd(a.seed, 7) * 3)
  const r = [4, 3.2, 2.6][count - 1]
  const x0 = g.ahead(Math.ceil(r) + 1)
  const hold = clamp(g.mouth.y - r - 2, r + 1, g.ground - r - 2)
  const land = g.ground - Math.round(r)
  const arc = clamp(hold - r - 1, 3, 9)

  for (let k = 0; k < count; k++) {
    const at = THROW_FIRST + k * THROW_GAP
    const u = t - at
    if (u >= -3 && u < 0) {
      out.dx = -g.side
      out.dy = -1
      out.sy = 1.04
    } else if (u >= 0 && u < 2) {
      out.dx = g.side * 2
      out.sx = 1.07
      out.sy = 0.94
    }

    const xt = clamp(g.target.x + g.side * Math.round((k - (count - 1) / 2) * 5), 3, g.columns - 4)
    const path = (p) => [lerp(x0, xt, p), lerp(hold, land, p) - arc * 4 * p * (1 - p)]
    if (u >= -THROW_LIFT && u < 0) {
      // Torn up out of the ground, wobbling, dirt spraying off it
      const p = easeOut(phase(t, at - THROW_LIFT, at - 1))
      rock(out, x0 + tremble(t), lerp(g.ground + r, hold, p), r, tones, a.seed + k)
      dust(out, x0, g.ground - 1, r + 1, (u + THROW_LIFT) / 7, a.seed + k)
    } else if (u >= 0 && u < THROW_FLIGHT) {
      const p = u / THROW_FLIGHT
      for (let lag = 3; lag >= 1; lag--) {
        const [px, py] = path(Math.max(0, p - lag * 0.06))
        dot(out, px, py + 1, lag === 1 ? tones[1] : tones[3])
      }
      const [x, y] = path(p)
      rock(out, x, y, r, tones, a.seed + k, p * 6)
    }

    // The crash flashes and jolts, splits the rock in two, and throws chips and dust
    const hit = u - THROW_FLIGHT
    if (hit < 0) continue
    if (hit < 3) burst(out, xt, land, [6, 5, 3][hit], hit === 0 ? WHITE : tones[0])
    if (hit === 0) out.shake = [g.side * (r > 3 ? 2 : 1), 1]
    if (hit === 1) out.shake = [-g.side, 0]
    if (hit < 16) dust(out, xt, g.ground - 1, r + 2, hit / 16, a.seed + k * 5)
    for (const way of [-1, 1]) {
      const [x, y] = fling(xt + way, land, way * 0.5, -1.2, hit, g.ground - Math.round(r * 0.6))
      if (hit < 18) rock(out, x, y, r * 0.6, tones, a.seed + k + way, hit * 0.4 * way)
    }
    for (let i = 0; i < 7; i++) {
      const angle = -Math.PI / 2 + (rnd(a.seed, i, k + 20) - 0.5) * 2.8
      const speed = 0.9 + rnd(a.seed, i, k + 30) * 1
      const [x, y] = fling(xt, land, Math.cos(angle) * speed, Math.sin(angle) * speed * 1.4, hit, g.ground - 1)
      if (hit < 12 + i) rock(out, x, y, i % 3 ? 1 : 1.6, tones, a.seed + i + k, hit)
    }
  }
}

const SLIDE_SLAM = 6
const SLIDE_START = 6
const SLIDE_ROCKS = 11
const SLIDE_GAP = 1.6
const SLIDE_CRUMBLE = 38

// The middle and half width of the stretch of ground ahead that the slide buries
function slideZone(g) {
  const spread = clamp((g.reach - 2) / 2, 2.5, 7)
  return [g.ahead(Math.round(spread + 1)), spread]
}

// Where each rock of the slide starts, how it drifts as it tumbles, and when it lands
function slideRocks(a, g) {
  const [zone, spread] = slideZone(g)
  return Array.from({ length: SLIDE_ROCKS }, (_, i) => {
    const from = g.ground + 2 + rnd(a.seed, i, 3) * 6
    const born = SLIDE_START + i * SLIDE_GAP
    return {
      r: 2 + rnd(a.seed, i, 1) * 2.2,
      x: zone + Math.round((rnd(a.seed, i, 2) - 0.5) * 2 * spread) - g.side * 2,
      drift: g.side * (0.2 + rnd(a.seed, i, 4) * 0.35),
      from,
      born,
      lands: born + landing(from, 1.2),
    }
  })
}

// Rear up and slam the ground, bringing an avalanche of rocks down onto the target
// that bounce into a heap in rolling dust, then crumble away
function rockslide(out, t, a, g, c) {
  const tones = stone(c)
  if (t < SLIDE_SLAM) {
    const e = easeOut(phase(t, 0, SLIDE_SLAM - 1))
    out.dy = -Math.round(3 * e)
    out.sy = 1 + 0.06 * e
  } else if (t < SLIDE_SLAM + 3) {
    out.sy = [0.86, 0.93, 1][t - SLIDE_SLAM]
    out.sx = [1.1, 1.05, 1][t - SLIDE_SLAM]
  }
  if (t >= SLIDE_SLAM && t < SLIDE_CRUMBLE) out.shake = [0, t % 2 ? 1 : 0]

  // Grit and pebbles raining down ahead of and among the rocks
  const [zone, spread] = slideZone(g)
  emit(t, { count: 26, gap: 1, start: 2, life: 12 }, (i, age) => {
    const x = zone + (rnd(a.seed, i, 40) - 0.5) * 2.4 * spread + g.side * age * 0.3
    const y = -2 + age * 1.2 + 0.5 * GRAVITY * age * age
    if (y < g.ground) dot(out, x, y, tones[i % 3 === 0 ? 1 : 3])
    if (i % 4 === 0 && y < g.ground - 1) dot(out, x, y + 1, tones[2])
  })

  const crumble = phase(t, SLIDE_CRUMBLE, a.ticks - 2)
  slideRocks(a, g).forEach((o, i) => {
    const age = t - o.born
    if (age < 0) return
    const h = drop(age, o.from, 1.2, 2)
    const x = o.x + o.drift * Math.min(age, o.lands - o.born + 6)
    const r = o.r * (1 - crumble * (0.5 + rnd(a.seed, i, 5) * 0.5))
    if (r > 0.9) rock(out, x, g.ground - Math.round(o.r) - h, r, tones, a.seed + i, age * 0.35 * g.side)
    const hit = t - Math.ceil(o.lands)
    if (hit === 0) out.shake = [g.side * (o.r > 3 ? 2 : 1), o.r > 3 ? 2 : 1]
    if (hit >= 0 && hit < 10) dust(out, x, g.ground - 1, 1.5 + o.r * 0.6, hit / 10, a.seed + i * 7)
    if (hit >= 0 && hit < 9) {
      for (let k = 0; k < 3; k++) {
        const [px, py] = fling(x, g.ground - o.r, (k - 1) * 0.9 + g.side * 0.3, -1.3 - k * 0.3, hit, g.ground)
        dot(out, px, py, tones[k === 1 ? 1 : 3])
      }
    }
  })

  // Dust rolling out along the ground from the heap, behind the mon
  const roll = t - (SLIDE_START + 12)
  if (roll >= 0) {
    for (const way of [-1, 1]) {
      dust(out, zone + way * (spread + roll * 0.4), g.ground - 1, 4, roll / (a.ticks - SLIDE_START - 12), a.seed + 90 + way, DUST, back)
    }
  }
  if (crumble > 0) dust(out, zone, g.ground - 2, 6, crumble, a.seed + 95)
}

const SAND_TURN = 2
const SAND_KICK = 4
const SAND_STOP = 21
const SAND_BACK = 24

// Turn tail and kick a spray of sand back at the target in rhythmic scoops, where it
// gathers into a gritty, swirling cloud that slowly settles
function sandattack(out, t, a, g, c) {
  const sand = [light(c, 0.55), light(c, 0.25), c, dark(c, 0.25), dark(c, 0.5)]
  out.flipX = t >= SAND_TURN && t < SAND_BACK
  if (t >= SAND_KICK && t < SAND_STOP) {
    const beat = (t - SAND_KICK) % 3
    out.dy = beat === 0 ? -1 : 0
    out.sy = beat === 1 ? 0.93 : 1
    out.sx = beat === 1 ? 1.04 : 1
  }

  // Each kick flings a fan of grains from the hind feet in arcs
  const feet = g.side > 0 ? g.right : g.left
  const reach = Math.abs(g.target.x - feet) + 5
  for (let kick = SAND_KICK; kick < SAND_STOP; kick += 3) {
    const age = t - kick
    if (age < 0 || age > 16) continue
    if (age < 4) dust(out, feet, g.ground - 1, 2.5, age / 4, a.seed + kick, [sand[1], sand[2], sand[3]])
    for (let i = 0; i < 10; i++) {
      const vx = g.side * (1.2 + rnd(a.seed, i, kick) * 1.9)
      const vy = -(0.4 + rnd(a.seed, i, kick + 50) * 2)
      const x = feet + vx * age
      if (Math.abs(x - feet) > reach || age > 10 + (i % 5)) continue
      const y = Math.min(g.ground, g.ground - 1 - (i % 3) + vy * age + 0.08 * age * age)
      dot(out, x, y, sand[[0, 2, 3, 1][i % 4]])
      if (i % 3 === 0 && age < 8) dot(out, x - g.side, y - vy * 0.4, sand[i % 2 ? 1 : 2])
    }
  }

  // A cloud of lumps swirling around the target, speckled with grit
  const thick = phase(t, 9, 20) * (1 - phase(t, 25, a.ticks - 1))
  if (thick <= 0) return
  const { x: tx, y: ty } = g.target
  for (let k = 0; k < 4; k++) {
    const cx = tx + Math.cos(t * 0.25 + k * 1.6) * 3 + (k - 1.5) * 1.5
    const cy = ty + 1 + Math.sin(t * 0.3 + k * 2.1) * 1.5
    const rr = (2.5 + rnd(a.seed, k, 6) * 2) * (0.5 + 0.5 * thick)
    for (let py = Math.floor(cy - rr); py <= Math.ceil(cy + rr); py++) {
      for (let px = Math.floor(cx - rr); px <= Math.ceil(cx + rr); px++) {
        const d = Math.hypot(px - cx, py - cy) / rr
        if (d > 1 || py > g.ground || rnd(a.seed, px * 31 + py * 17, (t >> 1) + k) > thick * (1.15 - d * 0.6)) continue
        const grit = rnd(a.seed, px * 7 + py, t + k)
        dot(out, px, py, grit < 0.12 ? sand[4] : grit < 0.3 ? sand[0] : d < 0.5 ? sand[1] : sand[2])
      }
    }
  }
}

const BLIZZARD_GO = 8
const BLIZZARD_PEAK = 20
const BLIZZARD_EASE = 34
const BLIZZARD_STOP = 42

// Ice shards at the target: offset, height, lean, and the tick each starts to grow
const BLIZZARD_SHARDS = [[0, 7, 0, 16], [-3, 5, -1, 19], [3, 6, 1, 22], [-6, 3, -1, 25], [6, 4, 1, 27]]

// How thick the storm is for snow born at tick t
const blizzardDensity = (t) => 0.25 + 0.75 * phase(t, BLIZZARD_GO, BLIZZARD_PEAK) - phase(t, BLIZZARD_EASE, BLIZZARD_STOP)

// An ice shard growing up out of the ground, white on its lit edge and blue in shadow
function shard(out, x, base, h, lean, ice) {
  for (let k = 0; k < h; k++) {
    const y = base - k
    const w = Math.max(0, Math.round((1 - k / h) * 1.5))
    const cx = Math.round(x + (lean * k) / h)
    for (let px = -w; px <= w; px++) dot(out, cx + px, y, px === -w ? ice[0] : px === w ? ice[3] : ice[1])
    if (k === h - 1) dot(out, cx, y - 1, WHITE)
  }
}

// Rear back and blast a thickening storm of wind and snow while ice builds on the
// target and the mon shivers, then the ice shatters into glitter
function blizzard(out, t, a, g, c) {
  const ice = frost(c)
  const { x: mx, y: my } = g.mouth
  const reach = g.reach + 2
  const storm = clamp(blizzardDensity(t), 0, 1) * phase(t, BLIZZARD_GO - 1, BLIZZARD_GO + 1)
  const chill = phase(t, BLIZZARD_GO, BLIZZARD_PEAK + 6) * (1 - phase(t, BLIZZARD_STOP, a.ticks - 1))
  if (t < BLIZZARD_GO) {
    const e = easeOut(phase(t, 0, BLIZZARD_GO))
    out.dx = -g.side * Math.round(1.5 * e)
    out.sy = 1 + 0.04 * e
  } else if (t < BLIZZARD_STOP && storm > 0.3) {
    // Shivering, a ripple running through its rows
    out.skew = (y) => Math.sin(y * 1.7 + t * 2.4) * 0.9
  }
  if (chill > 0) out.shade = (x, y, col) => mix(col, (x + y + t) % 5 ? ice[1] : WHITE, 0.24 * chill)

  // Cold gathering at the mouth before the storm breaks
  if (t >= 2 && t < BLIZZARD_GO + 2) {
    for (let k = 0; k < 4; k++) {
      const angle = t * 0.9 + (k * Math.PI) / 2
      const d = 5 * (1 - phase(t, 2, BLIZZARD_GO))
      plus(out, mx + Math.cos(angle) * d, my + Math.sin(angle) * d * 0.7, ice[2], WHITE)
    }
  }

  // Wind streaks racing out in a widening cone
  emit(t, { count: 90, gap: 0.33, start: BLIZZARD_GO, life: 9 }, (i, age) => {
    const born = BLIZZARD_GO + i * 0.33
    if (rnd(a.seed, i, 30) > blizzardDensity(born) * 0.6) return
    const d = (3 + rnd(a.seed, i, 31) * 1.5) * age
    if (d > reach) return
    const lane = rnd(a.seed, i, 32) - 0.5
    const y = clamp(my + lane * (3 + d * 1.1) + Math.sin(age * 0.7 + i) * 0.8, 0, g.ground)
    const len = 3 + Math.floor(rnd(a.seed, i, 33) * 3 + blizzardDensity(born) * 3)
    for (let k = 0; k < len; k++) dot(out, g.ahead(d - k), y, k === 0 ? WHITE : k < len / 2 ? ice[1] : ice[3])
  })

  // Snowflakes swirling along with it, big ones twinkling
  emit(t, { count: 150, gap: 0.22, start: BLIZZARD_GO, life: 15 }, (i, age) => {
    const born = BLIZZARD_GO + i * 0.22
    if (rnd(a.seed, i, 34) > blizzardDensity(born)) return
    const d = (1.6 + rnd(a.seed, i, 35) * 1.4) * age
    if (d > reach) return
    const lane = rnd(a.seed, i, 36) - 0.5
    const x = g.ahead(d) + Math.sin(age * 0.5 + i * 0.7) * 1.2
    const y = my + lane * (2 + d * 1.3) + Math.sin(age * 0.6 + i * 1.3) * 1.5 + age * 0.15
    if (y < 0 || y > g.ground) return
    if (i % 5 === 0) plus(out, x, y, (i + t) % 4 ? ice[2] : ice[1], WHITE)
    else dot(out, x, y, i % 3 ? WHITE : ice[1])
  })

  // Snow blown slantwise through the whole space ahead while the storm rages
  const ahead = (d) => clamp(g.ahead(d), 0, g.columns - 1)
  emit(t, { count: 60, gap: 0.5, start: BLIZZARD_GO + 4, life: 12 }, (i, age) => {
    const born = BLIZZARD_GO + 4 + i * 0.5
    if (rnd(a.seed, i, 37) > blizzardDensity(born) - 0.2) return
    const d = rnd(a.seed, i, 38) * reach + age * 1.6
    const y = rnd(a.seed, i, 39) * g.ground * 0.6 + age * 1.1
    if (d < reach && y <= g.ground) dot(out, ahead(d), y, i % 4 ? WHITE : ice[2])
  })

  // Frost spreading over the ground at the target and shards of ice building up
  const tx = clamp(g.target.x, 8, g.columns - 9)
  const crust = phase(t, 14, 30) * (1 - phase(t, BLIZZARD_STOP, a.ticks - 2))
  if (crust > 0) {
    const w = Math.round(2 + crust * 6)
    for (let x = tx - w; x <= tx + w; x++) {
      if (rnd(a.seed, x, 41) > crust * 1.3 - Math.abs(x - tx) / (w + 2) * 0.5) continue
      dot(out, x, g.ground, (x + t) % 4 ? ice[1] : WHITE)
      if (rnd(a.seed, x, 42) < crust * 0.6) dot(out, x, g.ground - 1, ice[2])
    }
  }
  const shatter = t - BLIZZARD_STOP
  for (const [dx, tall, lean, start] of BLIZZARD_SHARDS) {
    const x = tx + g.side * dx
    const h = Math.round(tall * easeOut(phase(t, start, start + 8)))
    if (shatter < 0 && h > 0) shard(out, x, g.ground - 1, h, lean * g.side, ice)
    if (shatter >= 0 && shatter < 10) {
      for (let k = 0; k < 4; k++) {
        const angle = -Math.PI / 2 + (k - 1.5) * 0.7 + dx * 0.1
        const [px, py] = fling(x, g.ground - tall / 2, Math.cos(angle) * 1.1, Math.sin(angle) * 1.4, shatter, g.ground)
        dot(out, px, py, shatter < 5 ? (k % 2 ? WHITE : ice[1]) : ice[3])
      }
      if (shatter < 6) spark(out, x, g.ground - tall / 2, shatter < 3 ? 2 : 1, ice[2])
    }
  }
}

const MIST_FULL = 18
const MIST_THIN = 30
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

// Smooth noise from 0 to 1, blending random values at the corners of a grid
function haze(seed, x, y) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const at = (u, v) => rnd(seed, (ix + u) * 131 + (iy + v) * 977)
  return lerp(lerp(at(0, 0), at(1, 0), sx), lerp(at(0, 1), at(1, 1), sx), sy)
}

// Roll a soft, dithered fog out along the ground and up around the mon until it is
// shrouded, then let it thin away
function mist(out, t, a, g, c) {
  const fog = [WHITE, c, mix(c, 0x8fa8c0, 0.5), mix(c, 0x5a7690, 0.75)]
  const roll = easeOut(phase(t, 0, MIST_FULL))
  const thin = easeIn(phase(t, MIST_THIN, a.ticks - 2))
  if (roll <= 0 || thin >= 1) return
  const spanX = (g.right - g.left) / 2 + 9
  const spanY = g.ground - g.top + 5
  out.shade = (x, y, col) => mix(col, fog[1], 0.35 * roll * (1 - thin))
  for (let y = Math.max(0, g.ground - spanY); y <= g.ground; y++) {
    const up = (g.ground - y) / spanY
    for (let x = Math.floor(g.cx - spanX); x <= Math.ceil(g.cx + spanX); x++) {
      const swirl = haze(a.seed, x / 5 + t * 0.12, y / 4 - t * 0.05) * 0.65 + haze(a.seed + 7, x / 3 - t * 0.2, y / 3) * 0.35
      // It rolls out along the ground first, its top edge billowing
      const r = Math.hypot((x - g.cx) / spanX, up * 1.25) - (swirl - 0.5) * 0.3
      const edge = clamp((roll * 1.15 - r) * 4, 0, 1)
      if (edge <= 0) continue
      const density = edge * (1 - thin) * clamp(1.05 - up * 0.8, 0.2, 1) * (0.25 + swirl * 0.85)
      if (density * 16 <= BAYER[(y & 3) * 4 + (x & 3)] + 0.5) continue
      dot(out, x, y, density > 0.72 ? fog[0] : density > 0.45 ? fog[1] : density > 0.25 ? fog[2] : fog[3])
    }
  }
  if (thin > 0.4 && thin < 0.95) spark(out, g.cx + (rnd(a.seed, t >> 2) - 0.5) * spanX, g.top + rnd(a.seed, t >> 2, 1) * (g.bottom - g.top), 1, fog[1])
}

export const EARTH = {
  earthquake: { ticks: 48, color: 0x8b5a2b, draw: earthquake },
  dig: {
    ticks: 48,
    color: 0x8b5a2b,
    draw: dig,
    lands: (a, x, home) => x + (a.side === 'left' ? -1 : 1) * (8 + Math.floor(rnd(a.seed, 99) * 8)),
  },
  rockthrow: { ticks: 40, color: 0x8a8a8a, draw: rockthrow },
  rockslide: { ticks: 48, color: 0x8a8a8a, draw: rockslide },
  sandattack: { ticks: 36, color: 0xd8b878, pose: (t) => ({ stride: t >= SAND_KICK && t < SAND_STOP }), draw: sandattack },
  blizzard: { ticks: 52, color: 0xaee8ff, draw: blizzard },
  mist: { ticks: 48, color: 0xdff3ff, pose: { view: 'front' }, draw: mist },
}
