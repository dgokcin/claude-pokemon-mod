// Odd projectiles: stars, coins, triangles, and eggs

import {
  WHITE, ball, clamp, dark, disc, dot, easeIn, easeOut, emit, lerp, light, mix, phase, plus, puff, rnd, spark,
  stamp,
} from './draw.js'

// A point f of the way along a curve from p0 to p2, pulled toward p1
function bezier(p0, p1, p2, f) {
  const u = 1 - f
  return [u * u * p0[0] + 2 * u * f * p1[0] + f * f * p2[0], u * u * p0[1] + 2 * u * f * p1[1] + f * f * p2[1]]
}

const STAR_DIP = Math.PI / 5
const STAR_INNER = 0.42

// How far the edge of a five point star of radius 1 is from its middle, at angle psi
// from the nearest point. The edges run straight from each point to the dips beside it.
function starEdge(psi) {
  const dy = STAR_INNER * Math.sin(STAR_DIP)
  const dx = STAR_INNER * Math.cos(STAR_DIP) - 1
  return dy / (dy * Math.cos(psi) - dx * Math.sin(psi))
}

// A five point star of radius r turned by angle, with a white heart and a darker rim
// on its lower right
function star(out, x, y, r, angle, tones, paint = dot) {
  const inside = (px, py) => {
    const dx = px - x
    const dy = py - y
    const rho = Math.hypot(dx, dy)
    if (rho < 0.6) return true
    const sector = (2 * Math.PI) / 5
    let psi = (Math.atan2(dy, dx) - angle + Math.PI / 2) % sector
    if (psi < 0) psi += sector
    return rho <= r * starEdge(Math.abs(psi > sector / 2 ? sector - psi : psi)) + 0.35
  }
  const span = Math.ceil(r) + 1
  for (let py = Math.floor(y - span); py <= Math.ceil(y + span); py++) {
    for (let px = Math.floor(x - span); px <= Math.ceil(x + span); px++) {
      if (!inside(px, py)) continue
      const rho = Math.hypot(px - x, py - y)
      const rim = !inside(px + 1, py) || !inside(px, py + 1)
      paint(out, px, py, rho < 1.1 ? tones[0] : rim && px - x + (py - y) > 0 ? tones[3] : rho < 1.8 ? tones[1] : tones[2])
    }
  }
}

const SWIFT_LAUNCH = 6
const SWIFT_GAP = 3
const SWIFT_FLIGHT = 11
const SWIFT_BENDS = [-7, 6, -9, 8, -4]
const SWIFT_SPREAD = [[0, 0], [1, -3], [-1, 2], [2, -1], [0, 3]]

// Where star i is f of the way through its flight, swooping up or down onto the target
function starAt(g, i, f) {
  const p0 = [g.mouth.x, g.mouth.y]
  const p2 = [g.target.x + g.side * SWIFT_SPREAD[i][0], g.target.y - 2 + SWIFT_SPREAD[i][1]]
  const p1 = [(p0[0] + p2[0]) / 2, p0[1] + SWIFT_BENDS[i] * 2]
  const [x, y] = bezier(p0, p1, p2, f)
  return [x, clamp(y, 3, g.ground - 3)]
}

// Lean back while a star forms at the mouth, then loose five spinning stars that swoop
// along curves, shedding sparkles, and burst one after another on the target
function swift(out, t, a, g, c) {
  const tones = [WHITE, light(c, 0.45), mix(c, 0xf0a020, 0.3), mix(c, 0xb04a08, 0.65)]
  // A star is crisp only upright or upside down, so it spins by flipping between the two
  const turn = (k) => (Math.floor(k / 2) % 2) * STAR_DIP
  if (t < SWIFT_LAUNCH - 1) out.dx = -g.side
  else if (t < SWIFT_LAUNCH + 1) out.dx = g.side
  if (t >= 2 && t < SWIFT_LAUNCH) star(out, g.mouth.x, g.mouth.y, 1.5 + (t - 2) * 0.6, turn(t), tones)
  const launching = t > SWIFT_LAUNCH && t < SWIFT_LAUNCH + SWIFT_BENDS.length * SWIFT_GAP
  if (launching && (t - SWIFT_LAUNCH) % SWIFT_GAP === 0) out.dx = -g.side
  for (let i = 0; i < SWIFT_BENDS.length; i++) {
    const born = SWIFT_LAUNCH + i * SWIFT_GAP
    // Sparkles shed every other tick of the flight, twinkling out where they dropped
    emit(t, { count: Math.ceil(SWIFT_FLIGHT / 2), gap: 2, start: born + 1, life: 5 }, (k, age) => {
      const [x, y] = starAt(g, i, (2 * k + 1) / SWIFT_FLIGHT)
      const jx = x + (rnd(a.seed, k, i) - 0.5) * 3
      const jy = y + (rnd(a.seed, k, i + 9) - 0.5) * 3 + age * 0.3
      if (age < 2) plus(out, jx, jy, tones[2], WHITE)
      else dot(out, jx, jy, age < 4 ? tones[1] : tones[3])
    })
    const age = t - born
    if (age < 0) continue
    if (age < SWIFT_FLIGHT) {
      const [x, y] = starAt(g, i, age / SWIFT_FLIGHT)
      star(out, x, y, 3.8, turn(t + i), tones)
      continue
    }
    const hit = age - SWIFT_FLIGHT
    if (hit >= 6) continue
    const [x, y] = starAt(g, i, 1)
    if (hit === 0) {
      out.shake = [g.side, 0]
      disc(out, x, y, 3, WHITE)
      continue
    }
    // A burst along the five points of a star, opening outward as it fades
    const from = [0, 1, 2, 4, 5, 5][hit]
    const len = [0, 4, 6, 7, 7, 6][hit]
    for (let k = 0; k < 5; k++) {
      const angle = -Math.PI / 2 + (k * 2 * Math.PI) / 5
      const across = Math.abs(Math.cos(angle)) < 0.5 ? [1, 0] : [0, 1]
      for (let d = from; d <= len; d++) {
        const hot = hit < 3 && d <= from + 1
        const col = hit === 5 || d >= len - 1 ? tones[3] : hot ? tones[0] : tones[2]
        dot(out, x + Math.cos(angle) * d, y + Math.sin(angle) * d, col)
        dot(out, x + Math.cos(angle) * d + across[0], y + Math.sin(angle) * d + across[1], hot ? tones[1] : tones[2])
      }
    }
  }
}

const COIN_START = 6
const COIN_GAP = 1.4
const COIN_COUNT = 9
const COIN_FALL = 0.22
// A tossed gold coin flipping end over end, from face on to edge on and back to its
// darker back: o rim, y gold, h shine
const COIN_FLIP = [['.yy.', 'yhyo', 'yyyo', '.oo.'], ['.hy.', 'yyyo', '.oo.'], ['hyyo'], ['.yo.', 'oyyo', '.oo.']]
const COIN_FLAT = ['.hy.', 'oyyo']

// Where coin i is after `age` ticks. It flies from the head in an arc aimed at a spot
// on the ground ahead, then bounces along to a stop.
function coinAt(a, g, i, age) {
  const floor = g.ground
  let x = g.mouth.x - g.side
  let y = g.mouth.y - 3
  let vy = -(0.8 + rnd(a.seed, i, 1) * 0.8)
  const flight = (-vy + Math.sqrt(vy * vy + 2 * COIN_FALL * (floor - y))) / COIN_FALL
  const land = 2 + rnd(a.seed, i) * Math.max(1, g.reach - 6)
  let vx = (g.side * land) / flight
  let bounced = -1
  let rest = false
  for (let k = 0; k < age; k++) {
    x += vx
    if (x < 2 || x > g.columns - 3) vx = -vx * 0.5
    if (rest) {
      vx *= 0.5
      continue
    }
    vy += COIN_FALL
    y += vy
    if (y >= floor) {
      y = floor
      bounced = k
      vy = -vy * 0.45
      vx *= 0.6
      if (Math.abs(vy) < 0.6) rest = true
    }
  }
  return { x, y, rest, clink: bounced === age - 1 }
}

// Flick a stream of gold coins from the charm on the head. They tumble in arcs, clink
// and bounce on the ground, scatter to a stop, glint for a while, then blink out.
function payday(out, t, a, g, c) {
  const palette = { y: c, h: WHITE, o: dark(c, 0.4) }
  const throwing = t >= COIN_START && t < COIN_START + COIN_COUNT * COIN_GAP
  if (t < COIN_START - 1) {
    out.dx = -g.side
    out.sy = 1.04
  } else if (throwing) {
    out.dx = g.side
    out.dy = Math.floor((t - COIN_START) / 2) % 2 ? -1 : 0
  }
  if (t >= 1 && t < COIN_START + 1) spark(out, g.mouth.x - g.side * 3, g.top + 2, [1, 2, 3, 2, 1, 0][t - 1], c)
  const fading = t >= a.ticks - 6
  for (let i = 0; i < COIN_COUNT; i++) {
    const age = t - COIN_START - Math.floor(i * COIN_GAP)
    if (age < 0) continue
    if (fading && (t + i) % 2) continue
    const coin = coinAt(a, g, i, age)
    if (coin.rest) stamp(out, coin.x - 2, coin.y - 1, COIN_FLAT, palette)
    else {
      const face = COIN_FLIP[Math.floor((age + i) / 2) % COIN_FLIP.length]
      stamp(out, coin.x - 2, coin.y - 2 - Math.floor(face.length / 2), face, palette)
    }
    if (coin.clink) spark(out, coin.x, coin.y - 1, 2, light(c, 0.5))
    else if ((age + i * 5) % 11 === 0) spark(out, coin.x, coin.y - 2, 1, WHITE)
  }
}

const TRI_COLORS = [0xff4a2a, 0xffd93a, 0x5cc8ff]
const TRI_FORM = [2, 5, 8]
const TRI_FLY = [12, 24]

// Where the triangle strikes, kept far enough from the strip's edge to fit the burst
const strikeOf = (g) => ({ x: clamp(g.target.x, 7, g.columns - 8), y: g.target.y })

// Where the triangle's middle is, how big it is, and how far it has turned at tick t
function triangleAt(t, g) {
  const f = easeIn(phase(t, ...TRI_FLY))
  const spin = 0.18 * t + 0.014 * t * t
  const strike = strikeOf(g)
  const r = clamp(g.reach * 0.4, 3.5, 5.5)
  return [lerp(g.ahead(r + 1), strike.x, f), lerp(g.mouth.y - 1, strike.y, f), lerp(r, 4, f), spin]
}

// The three corners of the triangle at tick t
function cornersAt(t, g) {
  const [cx, cy, r, spin] = triangleAt(t, g)
  return TRI_COLORS.map((col, k) => {
    const angle = spin + (k * Math.PI * 2) / 3
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]
  })
}

// A snowflake: w white heart, b ice
const FROST = ['b.b.b', '.bwb.', 'bwwwb', '.bwb.', 'b.b.b']

// A little flame of three flickering tongues, its tip yellow and its root red
function flame(out, seed, t, x, y, size) {
  for (let dx = -1; dx <= 1; dx++) {
    const h = Math.round(size * (dx ? 0.6 : 1) * (0.7 + 0.3 * rnd(seed, dx + 2, t)))
    for (let k = 0; k < h; k++) {
      const f = k / Math.max(1, h - 1)
      dot(out, x + dx, y - k, f > 0.7 ? 0xffe066 : f > 0.35 ? 0xff9a2a : TRI_COLORS[0])
    }
  }
}

// Short bolts crackling out of x, y, in fresh directions every tick
function crackle(out, seed, x, y, col) {
  for (let b = 0; b < 3; b++) {
    const angle = rnd(seed, b) * Math.PI * 2
    let px = x
    let py = y
    for (let k = 0; k < 4; k++) {
      dot(out, px, py, k < 2 ? WHITE : col)
      px += Math.cos(angle) * 1.3 + (rnd(seed, b, k) - 0.5)
      py += Math.sin(angle) * 1.3 + (rnd(seed, b, k + 9) - 0.5)
    }
  }
  plus(out, x, y, col, WHITE)
}

// What each orb leaves where it lands: a flame, a crackle of sparks, a snowflake that shatters
function marks(out, a, age, spots) {
  const [fire, bolt, ice] = spots
  if (age >= 2 && age < 15) flame(out, a.seed, age, fire[0], fire[1] + 2, 5 * (1 - phase(age, 7, 15)) + 1)
  if (age >= 2 && age < 13 && age % 3 !== 0) crackle(out, a.seed + age, bolt[0], bolt[1], TRI_COLORS[1])
  if (age >= 2 && age < 10) stamp(out, ice[0] - 2, ice[1] - 2, FROST, { w: WHITE, b: TRI_COLORS[2] })
  emit(age, { count: 4, gap: 0, start: 10, life: 7 }, (i, life) => {
    const dx = i % 2 ? 1 : -1
    const dy = i < 2 ? -1 : 1
    dot(out, ice[0] + dx * life * 0.8, ice[1] + dy * life * 0.5 + 0.1 * life * life, life < 3 ? WHITE : TRI_COLORS[2])
  })
}

// Fire, electric and ice orbs pop in one by one in front of the mon, link into a
// spinning triangle that flies at the target, and burst there in all three colors
function triattack(out, t, a, g, c) {
  if (t < TRI_FLY[0]) out.dx = -g.side
  else if (t < TRI_FLY[0] + 3) out.dx = g.side
  if (t >= TRI_FLY[1] + 1 && t < TRI_FLY[1] + 3) out.dx = -g.side
  if (t < TRI_FLY[1]) {
    const corners = cornersAt(t, g)
    if (t > TRI_FLY[0]) {
      cornersAt(t - 1, g).forEach(([x, y], k) => dot(out, x, y, dark(TRI_COLORS[k], 0.2)))
      cornersAt(t - 2, g).forEach(([x, y], k) => dot(out, x, y, dark(TRI_COLORS[k], 0.45)))
    }
    for (let k = 0; k < 3; k++) {
      const n = (k + 1) % 3
      if (t <= TRI_FORM[k] || t <= TRI_FORM[n]) continue
      const [x0, y0] = corners[k]
      const [x1, y1] = corners[n]
      const steps = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
      for (let s = 0; s <= steps; s++) {
        const col = mix(TRI_COLORS[k], TRI_COLORS[n], s / steps)
        dot(out, lerp(x0, x1, s / steps), lerp(y0, y1, s / steps), (s + t) % 4 === 0 ? c : light(col, 0.2))
      }
    }
    corners.forEach(([x, y], k) => {
      if (t < TRI_FORM[k]) return
      if (t === TRI_FORM[k]) spark(out, x, y, 2, light(TRI_COLORS[k], 0.4))
      else ball(out, x, y, 2.2, TRI_COLORS[k])
    })
    return
  }
  const age = t - TRI_FLY[1]
  const { x, y } = strikeOf(g)
  if (age < 2) out.shake = [g.side * (age ? -1 : 1), age ? 0 : 1]
  if (age < 2) disc(out, x, y, 4 + age, c)
  if (age >= 1 && age < 9) {
    const len = age < 4 ? 3 + age * 2 : 11 - age
    for (let k = 0; k < 12; k++) {
      const angle = (k * Math.PI) / 6 + 0.26
      const col = TRI_COLORS[k % 3]
      for (let d = Math.max(2, age - 2); d <= len; d++) {
        dot(out, x + Math.cos(angle) * d, y + Math.sin(angle) * d * 0.85, d < len * 0.5 ? light(col, 0.4) : col)
      }
    }
  }
  const spots = cornersAt(TRI_FLY[1] - 1, g).map(([cx, cy]) => [x + (cx - x) * 1.5, clamp(y + (cy - y) * 1.5, 4, g.ground - 3)])
  marks(out, a, age, spots)
}

// A lit egg of half width rx and half height ry turned by angle, wider at the bottom,
// with a dark rim
function egg(out, x, y, rx, ry, angle, tones, paint = dot) {
  const [hi, lit, base, rim] = tones
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const inside = (px, py) => {
    const dx = px - x
    const dy = py - y
    const u = dx * cos + dy * sin
    const v = -dx * sin + dy * cos
    const w = rx * (1 + (0.2 * v) / ry)
    return (u / w) ** 2 + (v / ry) ** 2 <= 1.05
  }
  const span = Math.ceil(Math.max(rx, ry) + 1)
  for (let py = Math.floor(y - span); py <= Math.ceil(y + span); py++) {
    for (let px = Math.floor(x - span); px <= Math.ceil(x + span); px++) {
      if (!inside(px, py)) continue
      const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1)
      const lean = (px - x + (py - y)) / Math.max(rx, ry)
      paint(out, px, py, edge ? rim : lean < -0.8 ? hi : lean < 0.15 ? lit : base)
    }
  }
}

const BLAST = [WHITE, 0xfff4a0, 0xffc040, 0xff7a1a, 0xc83a1a, 0x6a2a20]

// A ball of fire from a burst egg, cooling over `life` ticks, its noise in 2x2 blocks
function blast(out, seed, age, x, y, r, life) {
  const cool = phase(age, 1, life)
  const size = r * (0.55 + 0.45 * easeOut(phase(age, 0, 4))) * (1 - cool * 0.3)
  for (let py = Math.floor(y - size - 1); py <= Math.ceil(y + size + 1); py++) {
    for (let px = Math.floor(x - size - 1); px <= Math.ceil(x + size + 1); px++) {
      const n = rnd(seed, (px >> 1) * 31 + (py >> 1), age >> 1)
      const d = Math.hypot(px - x, py - y) / size + (n - 0.5) * 0.4
      if (d > 1 || (cool > 0.3 && n < (cool - 0.3) * 1.3)) continue
      dot(out, px, py, BLAST[clamp(Math.floor((d * 0.7 + cool * 0.8) * BLAST.length), 0, BLAST.length - 1)])
    }
  }
}

// An egg bursting: a white flash, a ball of fire, dust kicked along the ground, shell
// flying, and smoke rising after
function eggBurst(out, a, age, x, y, r, g, shell, k = 0) {
  if (age < 0) return
  const seed = a.seed + k * 101
  const big = r > 5
  if (age === 0) {
    disc(out, x, y, r * 0.7, WHITE)
    return
  }
  emit(age, { count: big ? 4 : 2, gap: 2, start: 3, life: 12 }, (i, life, f) => {
    const px = x + (rnd(seed, i, 3) - 0.5) * r + Math.sin(life * 0.4 + i)
    const py = y - 1 - life * (0.35 + rnd(seed, i, 4) * 0.3)
    puff(out, px, py, (big ? 2 : 1.4) + life * 0.1, mix(0x6a6262, 0xa09898, f), seed + i)
  })
  if (age < 10) blast(out, seed, age, x, y, r, 10)
  if (age < 8) {
    for (const dir of [-1, 1]) {
      const dust = mix(0xc8b090, 0x8a7a6a, age / 8)
      puff(out, x + dir * (r * 0.6 + age * (big ? 1.2 : 0.8)), g.ground - 1, big ? 1.8 : 1.2, dust, seed + dir + age)
    }
  }
  emit(age, { count: big ? 9 : 5, gap: 0, life: 14 }, (i, life) => {
    const angle = -Math.PI / 2 + (rnd(seed, i, 9) - 0.5) * 2.6
    const speed = (big ? 1 : 0.7) + rnd(seed, i, 10) * 0.9
    const sx = x + Math.cos(angle) * speed * life
    const sy = y + Math.sin(angle) * speed * life + 0.12 * life * life
    if (sy > g.ground) return
    dot(out, sx, sy, shell[i % 2])
    if (i % 2 === 0) dot(out, sx + 1, sy, shell[2])
  })
}

const BOMB_THROW = 8
const BOMB_LAND = 22
const BARRAGE = [[3, 12], [8, 17], [13, 22]]

// Height of a lob f of the way from y0 to y1, bulging up toward `peak`
const lob = (y0, y1, f, peak) => lerp(y0, y1, f) - Math.max(2, (y0 + y1) / 2 - peak) * 4 * f * (1 - f)

// Egg Bomb lobs one big tumbling egg in a high arc that blows up on landing.
// Barrage throws three small round eggs in a quick volley, each bursting in turn.
function eggbomb(out, t, a, g, c) {
  const tones = [WHITE, light(c, 0.5), c, mix(c, 0x5a3a1a, 0.75)]
  const shell = [WHITE, c, tones[3]]
  if (a.power >= 2) {
    const land = [clamp(g.target.x, 9, g.columns - 10), g.ground - 4]
    const hold = [g.mouth.x - g.side, g.mouth.y - 4]
    if (t < BOMB_THROW) {
      const wind = easeOut(phase(t, 0, BOMB_THROW))
      out.dx = -g.side * Math.round(2 * wind)
      out.sy = 1 - 0.06 * wind
      egg(out, hold[0] - g.side * Math.round(2 * wind), hold[1] + (t % 4 < 2 ? 0 : -1), 3.5, 4.5, 0, tones)
      return
    }
    if (t < BOMB_THROW + 3) out.dx = g.side
    if (t < BOMB_LAND) {
      const f = phase(t, BOMB_THROW, BOMB_LAND)
      for (let k = 2; k >= 1; k--) {
        const pf = Math.max(0, f - k * 0.06)
        dot(out, lerp(hold[0], land[0], pf), lob(hold[1], land[1], pf, 4), k === 1 ? tones[1] : tones[3])
      }
      egg(out, lerp(hold[0], land[0], f), lob(hold[1], land[1], f, 4), 3.5, 4.5, f * Math.PI * 2 * g.side, tones)
      return
    }
    const age = t - BOMB_LAND
    if (age < 3) out.shake = [age % 2 ? -g.side : g.side, age === 0 ? 1 : 0]
    eggBurst(out, a, age, land[0], g.ground - 5, 8, g, shell)
    return
  }
  BARRAGE.forEach(([from, to], k) => {
    const tx = clamp(g.target.x + g.side * (k - 1) * 4, 6, g.columns - 7)
    const ty = g.ground - 3
    if (t >= from && t < to) {
      const f = phase(t, from, to)
      egg(out, lerp(g.mouth.x, tx, f), lob(g.mouth.y, ty, f, g.mouth.y - 5), 2.4, 2.6, f * Math.PI * g.side, tones)
    }
    if (t >= from && t < from + 2) out.dy = -1
    if (t === to) out.shake = [g.side, 0]
    eggBurst(out, a, t - to, tx, ty - 1, 5, g, shell, k)
  })
}

export const SPECIAL = {
  swift: { ticks: 40, color: 0xffe36e, draw: swift },
  payday: { ticks: 44, color: 0xffd23a, draw: payday },
  triattack: { ticks: 44, color: 0xffffff, draw: triattack },
  eggbomb: { ticks: 44, color: 0xfff6e0, draw: eggbomb },
}
