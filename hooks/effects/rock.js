// Rock moves

import {
  WHITE, back, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, keys, lean, lerp, light, line,
  linear, mix, phase, plus, rimGlow, rnd, spark, sparkles, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const GRAVITY = 0.35
const ROCK_TAN = 0xb8a070
const DUST = [0xeadbb4, 0xcdb388, 0xa08260]

// Five steps of stone: highlight, lit face, base, shadow, outline
const stone = (c) => [light(c, 0.6), light(c, 0.28), c, dark(c, 0.35), dark(c, 0.62)]

// An angular rock of radius r with flat faces, each face shaded by which way it
// points, lit from the top left. spin turns it, so it tumbles while the light stays.
function chunk(out, x, y, r, tones, seed, spin = 0, paint = dot) {
  const cx = Math.round(x)
  const cy = Math.round(y)
  if (r < 1.6) {
    paint(out, cx, cy, tones[1])
    paint(out, cx + 1, cy, tones[2])
    paint(out, cx, cy + 1, tones[3])
    if (r >= 1.1) paint(out, cx + 1, cy + 1, tones[4])
    return
  }
  const n = 5 + (rnd(seed, 0, 7) < 0.5 ? 0 : 1)
  const at = (k) => (k / n) * TAU + rnd(seed, k % n, 8) * 0.5
  const corner = (k) => {
    const a = at(k) + spin
    const rr = r * (0.8 + 0.3 * rnd(seed, k % n, 9))
    return [Math.cos(a) * rr, Math.sin(a) * rr]
  }
  const corners = Array.from({ length: n + 1 }, (_, k) => corner(k))
  // The face a direction falls in, and how far the outline is along it
  const face = (px, py) => {
    const rel = (((Math.atan2(py, px) - spin) % TAU) + TAU) % TAU
    let k = n - 1
    for (let j = 0; j < n; j++) if (rel >= at(j) && rel < at(j + 1)) k = j
    if (rel < at(0)) k = n - 1
    const [ax, ay] = corners[k]
    const [bx, by] = corners[k + 1]
    const d = Math.hypot(px, py) || 1
    const ux = px / d
    const uy = py / d
    const edge = (ax * by - ay * bx) / (ux * (by - ay) - uy * (bx - ax))
    return [k, edge, d]
  }
  const reach = Math.ceil(r * 1.15)
  for (let py = -reach; py <= reach; py++) {
    for (let px = -reach; px <= reach; px++) {
      const [k, edge, d] = face(px, py)
      if (d > edge) continue
      const [ax, ay] = corners[k]
      const [bx, by] = corners[k + 1]
      // The face's outward direction against light from the top left
      const lit = -((ax + bx) + (ay + by)) / (Math.hypot(ax + bx, ay + by) * Math.SQRT2 || 1)
      const rim = d > edge - 1
      let tone = d < r * 0.35 ? 1 : lit > 0.55 ? 0 : lit > 0 ? 1 : lit > -0.55 ? 2 : 3
      if (rim && lit < 0.2) tone = 4
      paint(out, cx + px, cy + py, tones[tone])
    }
  }
}

// A soft dust cloud billowing up and thinning as f goes from 0 to 1
function dust(out, x, y, r, f, seed, tones = DUST, paint = back) {
  if (f >= 1 || f < 0) return
  const rr = r * (0.5 + 0.5 * easeOut(Math.min(1, f * 2)))
  const cy = y - f * r * 0.6
  for (let py = Math.floor(cy - rr); py <= Math.ceil(cy + rr * 0.6); py++) {
    for (let px = Math.floor(x - rr * 1.3); px <= Math.ceil(x + rr * 1.3); px++) {
      const d = Math.hypot((px - x) / 1.3, py - cy) / rr
      if (d > 1 || rnd(seed, px * 31 + py * 7) > (1 - f) * (1.1 - d * 0.7)) continue
      paint(out, px, py, tones[py < cy - rr * 0.3 ? 0 : d < 0.5 ? 1 : 2])
    }
  }
}

// Where something flung from x, y at vx, vy is `age` ticks on, resting once it lands
function fling(x, y, vx, vy, age, ground) {
  const fall = y + vy * age + 0.5 * GRAVITY * age * age
  if (fall < ground) return [x + vx * age, fall]
  const land = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, ground - y))) / GRAVITY
  return [x + vx * land, ground]
}

// Chips of stone thrown out of a hit at x, y, tumbling down onto the ground
function chips(out, t, a, g, x, y, tones, { start, count = 8, life = 14, speed = 1.2, salt = 0 }) {
  emit(t, { count, gap: 0, start, life }, (i, age) => {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, salt) - 0.5) * 3
    const v = speed * (0.6 + rnd(a.seed, i, salt + 1) * 0.8)
    const [px, py] = fling(x, y, Math.cos(angle) * v, Math.sin(angle) * v * 1.3, age, g.ground)
    chunk(out, px, py, i % 3 ? 1 : 1.4, tones, a.seed + i + salt, age * 0.5)
  })
}

// Jolt the strip `age` ticks after a hit, one [x, y] step per tick
function jolt(out, age, steps) {
  if (age >= 0 && age < steps.length) out.shake = steps[age]
}

const ANCIENT_RISE = 3
const ANCIENT_ORBIT = 14
const ANCIENT_FIRE = 26
const ANCIENT_GAP = 3
const ANCIENT_STONES = 5
const ANCIENT_FLIGHT = 5

// Glow with an old amber light while stones lift from the ground and circle the body
// trailing sparks, then hurl them one after another at the target
function ancientpower(out, t, a, g, c) {
  const tones = stone(c)
  const gold = mix(c, 0xffd060, 0.6)
  const half = (g.right - g.left) / 2
  const glowF = phase(t, 1, ANCIENT_ORBIT) * (1 - phase(t, ANCIENT_FIRE + ANCIENT_STONES * ANCIENT_GAP, a.ticks - 2))
  if (glowF > 0) out.shade = rimGlow(g, out, gold, 0.12 * glowF, light(gold, 0.4), 0.6 * glowF * (t % 4 < 2 ? 1 : 0.7))
  if (t >= ANCIENT_RISE && t < ANCIENT_FIRE) out.dy = -Math.round(phase(t, ANCIENT_RISE, ANCIENT_ORBIT))
  else if (t >= ANCIENT_FIRE && t < ANCIENT_FIRE + 3) out.dy = -1

  const rx = half + 5
  const ry = 4
  const cy = Math.round((g.top + g.bottom) / 2) - 1
  for (let i = 0; i < ANCIENT_STONES; i++) {
    const r = 2.4 + rnd(a.seed, i, 1) * 1
    const fire = ANCIENT_FIRE + i * ANCIENT_GAP
    const angle = (i / ANCIENT_STONES) * TAU + t * 0.25
    const orbitX = g.cx + Math.cos(angle) * rx
    const orbitY = cy + Math.sin(angle) * ry
    if (t < fire) {
      // Lifting out of the ground to the orbit, then circling, behind the body on the far side
      const lift = easeOut(phase(t, ANCIENT_RISE + i, ANCIENT_ORBIT + i))
      const x = lerp(g.cx + (i - 2) * (half / 2 + 2), orbitX, lift)
      const y = lerp(g.ground - 1, orbitY, lift) + Math.sin(t * 0.5 + i) * 0.5
      if (lift <= 0) continue
      const far = Math.sin(angle) < 0 && lift > 0.5
      chunk(out, x, y, r, tones, a.seed + i, t * 0.1, far ? back : dot)
      if (lift > 0.5 && !far) dot(out, x - Math.cos(angle + 0.5) * 2, y - Math.sin(angle + 0.5), gold)
      continue
    }
    // Hurled from where it was at the target, a trail of gold behind
    const age = t - fire
    const f = Math.min(1, age / ANCIENT_FLIGHT)
    const sx = g.cx + Math.cos((i / ANCIENT_STONES) * TAU + fire * 0.25) * rx
    const sy = cy + Math.sin((i / ANCIENT_STONES) * TAU + fire * 0.25) * ry
    const tx = g.target.x + (rnd(a.seed, i, 2) - 0.5) * 4
    const ty = g.target.y + (rnd(a.seed, i, 3) - 0.5) * 4
    if (age < ANCIENT_FLIGHT) {
      const x = lerp(sx, tx, easeIn(f))
      const y = lerp(sy, ty, easeIn(f))
      for (let k = 1; k <= 3; k++) dot(out, lerp(sx, tx, easeIn(Math.max(0, f - k * 0.08))), lerp(sy, ty, easeIn(Math.max(0, f - k * 0.08))), k === 1 ? WHITE : gold)
      chunk(out, x, y, r, tones, a.seed + i, age * 0.8)
    } else {
      const hit = age - ANCIENT_FLIGHT
      if (hit < 3) burst(out, tx, ty, [4, 3, 2][hit], hit ? gold : WHITE)
      jolt(out, hit, [[g.side, 0], [-g.side, 0]])
      chips(out, t, a, g, tx, ty, tones, { start: fire + ANCIENT_FLIGHT, count: 4, life: 10, salt: i * 10 })
    }
  }
  if (t >= ANCIENT_ORBIT && t < ANCIENT_FIRE) sparkles(out, t, a.seed, g.cx, cy, rx * 2, 8, gold, 4)
}

const ROLL_CURL = 6
const ROLL_HIT = 16
const ROLL_BACK = 32
const ROLL_OPEN = 38

// How far the roll has carried the mon at tick t: in hard, a bounce off, and home
const rollPos = (t, far) => keys(t, [[0, 0], [ROLL_CURL, -1], [ROLL_HIT, far, easeIn], [ROLL_HIT + 4, far - 3, easeOut], [ROLL_BACK, 0, easeInOut]], linear)

// Curl into a ball and roll at the target, spinning faster and kicking up dust, bonk
// it with a star, bounce off and roll home, then uncurl
function rollout(out, t, a, g, c) {
  const tones = stone(c)
  const far = clamp(g.reach - 6, 2, 14)
  const pos = rollPos(t, far)
  out.dx = Math.round(g.side * pos)
  const curl = easeOut(phase(t, 1, ROLL_CURL)) * (1 - easeOut(phase(t, ROLL_BACK, ROLL_OPEN)))
  out.sx = 1 - 0.18 * curl
  out.sy = 1 - 0.25 * curl
  // Flip the curled body end over end to fake a spin, faster at full speed
  const spinning = t >= ROLL_CURL && t < ROLL_BACK
  if (spinning) {
    const rate = t < ROLL_HIT ? (t < ROLL_HIT - 5 ? 2 : 1) : 2
    const turn = Math.floor(t / rate) % 2
    out.flipX = turn === 1
    out.flipY = turn === 1
  }
  if (t >= ROLL_HIT && t < ROLL_HIT + 6) out.dy = -Math.round(3 * Math.sin(phase(t, ROLL_HIT, ROLL_HIT + 6) * Math.PI))

  // A speed ring around the ball and streaks behind it
  const half = ((g.right - g.left) / 2) * out.sx
  const ballY = g.bottom - (g.bottom - g.top) * out.sy * 0.5 + out.dy
  const ballX = g.cx + out.dx
  if (spinning && t < ROLL_HIT) {
    const r = Math.max(half, (g.bottom - g.top) * out.sy * 0.5) + 1
    for (let k = 0; k < 3; k++) {
      const angle = t * 1.3 * -g.side + (k * TAU) / 3
      for (let s = 0; s < 4; s++) dot(out, ballX + Math.cos(angle - s * 0.18 * g.side) * r, ballY + Math.sin(angle - s * 0.18 * g.side) * r, s ? light(c, 0.3) : WHITE)
    }
    for (let k = 0; k < 3; k++) {
      const y = ballY - r * 0.6 + k * r * 0.6
      const len = 3 + ((t + k) % 3)
      for (let d = 0; d < len; d++) back(out, ballX - g.side * (r + 2 + d), y, d ? c : light(c, 0.4))
    }
  }
  // Dust kicked up off the ground behind the rolling ball
  emit(t, { count: 20, gap: 1, start: ROLL_CURL, life: 8 }, (i, age) => {
    const born = t - age
    if (born >= ROLL_BACK) return
    const x = g.cx + g.side * rollPos(born, far) - g.side * (half + age * 0.6) * (born < ROLL_HIT ? 1 : -1)
    dust(out, x, g.ground - 1, 1.6, age / 8, a.seed + i)
  })

  // The bonk
  const hit = t - ROLL_HIT
  const hx = clamp(g.ahead(far + 2), 2, g.columns - 3)
  const hy = Math.round(ballY)
  jolt(out, hit, [[g.side * 2, 1], [-g.side, -1], [g.side, 0]])
  if (hit >= 0 && hit < 5) burst(out, hx, hy, [5, 6, 5, 3, 2][hit], hit < 2 ? WHITE : light(c, 0.4))
  chips(out, t, a, g, hx, hy, tones, { start: ROLL_HIT, count: 6, life: 12, salt: 30 })
}

const SAND_RISE = 10
const SAND_EASE = 40

// Face out as a howling wind whips sand across the whole strip in swirling bands,
// grit pelting the mon, then it dies down and the dust settles
function sandstorm(out, t, a, g, c) {
  const sand = [light(c, 0.5), light(c, 0.2), c, dark(c, 0.25), dark(c, 0.5)]
  const storm = easeOut(phase(t, 0, SAND_RISE)) * (1 - easeIn(phase(t, SAND_EASE, a.ticks - 1)))
  if (storm <= 0) return
  out.shade = (x, y, col) => mix(col, (x + y * 3 + t) % 9 === 0 ? sand[0] : sand[2], 0.28 * storm)
  if (storm > 0.6) out.skew = (y) => Math.sin(y * 0.4 + t * 0.8) * 0.6 * storm
  out.shake = [t % 4 === 0 && storm > 0.7 ? (t % 8 ? 1 : -1) : 0, 0]
  const wind = g.side

  // Wide dithered bands of dust sweeping past, swirling up and down
  for (let band = 0; band < 3; band++) {
    const yc = 4 + band * ((g.ground - 6) / 2) + Math.sin(t * 0.25 + band * 2) * 3
    for (let x = 0; x < g.columns; x++) {
      const wave = Math.sin((x * wind) * 0.3 - t * 0.9 + band) * 2
      for (let o = -2; o <= 2; o++) {
        const y = Math.round(yc + wave + o)
        const keep = (1 - Math.abs(o) / 3) * storm * 0.3
        if (rnd(a.seed, x * 13 + y * 7, t + band) > keep) continue
        back(out, x, y, sand[o === 0 ? 2 : 3])
      }
    }
  }

  // Grains racing across in streaks, some over the body
  emit(t, { count: 130, gap: 0.33, start: 0, life: 10 }, (i, age) => {
    const born = i * 0.33
    if (rnd(a.seed, i, 3) > easeOut(phase(born, 0, SAND_RISE)) * (1 - phase(born, SAND_EASE, a.ticks - 4))) return
    const speed = 3 + rnd(a.seed, i, 4) * 2.5
    const x0 = wind > 0 ? -4 : g.columns + 3
    const x = x0 + wind * (age * speed + rnd(a.seed, i, 5) * g.columns * 0.5)
    const y = rnd(a.seed, i, 6) * g.ground + Math.sin(age * 0.8 + i) * 1.5
    if (x < 0 || x >= g.columns) return
    const col = i % 4 === 0 ? sand[0] : i % 4 === 1 ? sand[3] : sand[1]
    dot(out, x, y, col)
    dot(out, x - wind, y, sand[2])
    if (i % 3 === 0) dot(out, x - wind * 2, y, sand[3])
  })

  // Pebbles bouncing along the ground with the wind
  emit(t, { count: 10, gap: 4, start: 4, life: 14 }, (i, age) => {
    const x = (wind > 0 ? 0 : g.columns - 1) + wind * age * (2 + rnd(a.seed, i, 7))
    const y = g.ground - 1 - Math.abs(Math.sin(age * 0.7 + i)) * 3
    chunk(out, x, y, 1.2, stone(c), a.seed + i, age)
  })
  // Sand drifting up against the feet
  const drift = storm * phase(t, 6, 24)
  for (let x = 0; x < g.columns; x++) {
    if (rnd(a.seed, x, 11) < drift * 0.8) back(out, x, g.ground, sand[(x + (t >> 2)) % 3 ? 2 : 1])
  }
}

const EDGE_STAMP = 5
const EDGE_FORM = 8
const EDGE_STAB = 24
const EDGE_SHARDS = 6

// A sharp stone blade from its base at bx, by to its tip at tx, ty, its lit edge on
// one side and its shadow on the other
function blade(out, bx, by, tx, ty, w, tones) {
  const len = Math.hypot(tx - bx, ty - by)
  const ux = (tx - bx) / len
  const uy = (ty - by) / len
  const steps = Math.ceil(len * 1.5)
  for (let k = 0; k <= steps; k++) {
    const f = k / steps
    const half = w * (1 - f)
    const x = bx + ux * len * f
    const y = by + uy * len * f
    for (let o = -Math.ceil(half); o <= half; o++) {
      const col = f > 0.85 ? WHITE : o < 0 ? tones[0] : o === 0 ? tones[1] : o >= half - 0.5 ? tones[4] : tones[3]
      dot(out, x - uy * o, y + ux * o, col)
    }
  }
}

// Stamp the ground, and a ring of jagged stone blades rises around the target, turning
// with their points inward, then all stab in at once and shatter
function stoneedge(out, t, a, g, c) {
  const tones = stone(c)
  const { x: tx, y: ty } = g.target
  if (t < EDGE_STAMP) {
    const f = phase(t, 0, EDGE_STAMP)
    out.dy = -Math.round(3 * Math.sin(f * Math.PI))
    out.sy = 1 + 0.05 * Math.sin(f * Math.PI)
  } else if (t < EDGE_STAMP + 3) {
    out.sy = [0.88, 0.94, 1][t - EDGE_STAMP]
    out.sx = [1.08, 1.04, 1][t - EDGE_STAMP]
  }
  jolt(out, t - EDGE_STAMP, [[0, 1], [0, -1]])

  const rx = clamp(g.reach * 0.7, 8, 12)
  const ry = clamp(Math.min(ty - 1, g.ground - ty), 6, 9)
  const turn = t * 0.08
  const stab = easeIn(phase(t, EDGE_STAB - 3, EDGE_STAB))
  const hit = t - EDGE_STAB
  for (let i = 0; i < EDGE_SHARDS; i++) {
    const grow = easeOut(phase(t, EDGE_FORM + i, EDGE_FORM + i + 5))
    if (grow <= 0 || hit >= 0) continue
    const angle = (i / EDGE_SHARDS) * TAU + turn
    const dist = lerp(1, 0.25, stab)
    const ox = tx + Math.cos(angle) * rx * dist
    const oy = ty + Math.sin(angle) * ry * dist
    const len = 8 * grow
    const ux = (tx - ox) / Math.max(1, Math.hypot(tx - ox, ty - oy))
    const uy = (ty - oy) / Math.max(1, Math.hypot(tx - ox, ty - oy))
    blade(out, ox - ux * len * 0.4, oy - uy * len * 0.4, ox + ux * len * 0.6, oy + uy * len * 0.6, 2.2 * grow, tones)
    if (grow < 1) spark(out, ox, oy, 1, tones[1])
  }
  // The stab: a white flash, a starburst of cracks, and the blades in pieces
  jolt(out, hit, [[g.side * 2, 2], [-g.side * 2, -1], [g.side, 1], [-g.side, 0]])
  if (hit >= 0 && hit < 2) disc(out, tx, ty, 4 - hit, WHITE)
  if (hit >= 0 && hit < 6) {
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * TAU + 0.2
      const r0 = 2 + hit
      const r1 = r0 + (k % 2 ? 3 : 5) - hit * 0.5
      line(out, tx + Math.cos(angle) * r0, ty + Math.sin(angle) * r0, tx + Math.cos(angle) * r1, ty + Math.sin(angle) * r1, hit < 2 ? tones[0] : tones[3])
    }
  }
  chips(out, t, a, g, tx, ty, tones, { start: EDGE_STAB, count: 12, life: 16, speed: 1.6, salt: 40 })
  if (hit >= 0) dust(out, tx, g.ground - 1, 5, hit / 14, a.seed + 3)
}

const BLAST_FIRST = 6
const BLAST_GAP = 6
const BLAST_FLIGHT = 5

// Brace and fire rocks from the mouth like a cannon, two to five in a row, each kick
// jolting the mon back and each rock bursting to chips on the target
function rockblast(out, t, a, g, c) {
  const tones = stone(c)
  const shots = 2 + Math.floor(rnd(a.seed, 1) * 4)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  if (t < BLAST_FIRST) out.sy = 1 - 0.05 * phase(t, 1, BLAST_FIRST)
  for (let k = 0; k < shots; k++) {
    const fire = BLAST_FIRST + k * BLAST_GAP
    const u = t - fire
    if (u >= 0 && u < 3) {
      out.dx = -g.side * [3, 2, 1][u]
      out.sx = [0.92, 0.96, 1][u]
    }
    if (u === -1) out.sy = 1.04
    const r = 2.6 + rnd(a.seed, k, 2) * 0.8
    const aimY = ty + Math.round((rnd(a.seed, k, 3) - 0.5) * 5)
    const ox = mx + g.side * 2
    if (u >= 0 && u < 2) dust(out, ox, my, 2.5, u / 3, a.seed + k, DUST, dot)
    if (u >= 0 && u < BLAST_FLIGHT) {
      const f = (u + 1) / BLAST_FLIGHT
      const x = lerp(ox, tx, f)
      const y = lerp(my, aimY, f)
      for (let d = 2; d <= 6; d += 2) dot(out, x - g.side * d, y, d < 4 ? tones[0] : tones[2])
      chunk(out, x, y, r, tones, a.seed + k, u * 1.3)
    }
    const hit = u - BLAST_FLIGHT
    // It splits in two on the hit, the halves knocked apart, with a ring of grit
    if (hit >= 0 && hit < 5) {
      for (const way of [-1, 1]) chunk(out, tx - g.side * (1 + hit * 0.6), aimY + way * (1 + hit * 0.8) + hit * hit * 0.1, r * 0.7, tones, a.seed + k + way, way * hit * 0.4)
    }
    if (hit >= 0 && hit < 3) {
      for (let j = 0; j < 8; j++) {
        const angle = (j / 8) * TAU + k
        dot(out, tx + Math.cos(angle) * (r + 1 + hit * 1.5), aimY + Math.sin(angle) * (r + 1 + hit * 1.5), hit ? tones[1] : WHITE)
      }
    }
    jolt(out, hit, [[g.side, 1], [-g.side, 0]])
    chips(out, t, a, g, tx, aimY, tones, { start: fire + BLAST_FLIGHT, count: 6, life: 12, salt: k * 7 })
    if (hit >= 0) dust(out, tx, g.ground - 1, 3, hit / 12, a.seed + k * 3)
  }
}

const SMACK_THROW = 7
const SMACK_DROP = 20
const SMACK_HIT = 24

// Heave a rock straight up out of sight while a shadow marks the target, then bring
// it smashing straight down onto it, cracking the ground in a cloud of dust
function smackdown(out, t, a, g, c) {
  const tones = stone(c)
  const { x: tx } = g.target
  const r = 3.5
  const ox = g.ahead(4)
  if (t < SMACK_THROW) {
    const f = easeOut(phase(t, 1, SMACK_THROW))
    out.sy = 1 - 0.08 * f
    out.sx = 1 + 0.05 * f
  } else if (t < SMACK_THROW + 3) {
    out.sy = [1.1, 1.05, 1][t - SMACK_THROW]
    out.dy = -[2, 1, 0][t - SMACK_THROW]
  } else if (t >= SMACK_DROP - 2 && t < SMACK_HIT + 2) {
    out.skew = lean(g, g.side * 2)
    out.dy = t < SMACK_DROP ? -1 : 0
  }

  // Torn up out of the ground in front, then thrown up and out of the top of the strip
  if (t >= 1 && t < SMACK_THROW + 8) {
    const hold = Math.max(r + 1, g.mouth.y - 3)
    const y = t < SMACK_THROW ? lerp(g.ground + r, hold, easeOut(phase(t, 1, SMACK_THROW - 1))) : hold - (t - SMACK_THROW) * 2.5
    if (y > -r) {
      chunk(out, ox + (t < SMACK_THROW ? tremble(t) : 0), y, r, tones, a.seed, t < SMACK_THROW ? 0 : t * 0.6)
      for (let k = 1; k < 3 && t >= SMACK_THROW; k++) dot(out, ox, y + r + k * 2, tones[1])
    }
    if (t < SMACK_THROW) dust(out, ox, g.ground - 1, r + 1, (t - 1) / 8, a.seed + 4)
  }
  // A shadow gathering on the ground under the target
  const mark = phase(t, SMACK_THROW + 4, SMACK_HIT)
  if (mark > 0 && t < SMACK_HIT) {
    const w = 1 + mark * 4
    for (let x = -Math.round(w); x <= w; x++) back(out, tx + x, g.ground, Math.abs(x) > w - 1 ? tones[3] : tones[4])
  }
  // Straight down, fast, with speed lines
  if (t >= SMACK_DROP && t < SMACK_HIT) {
    const f = phase(t, SMACK_DROP, SMACK_HIT)
    const y = lerp(-r - 2, g.target.y, easeIn(f))
    for (const o of [-r, 0, r]) line(out, tx + o, Math.max(0, y - 7 - (o ? 0 : 2)), tx + o, y - r - 1, o ? tones[2] : tones[0])
    chunk(out, tx, y, r + 0.5, tones, a.seed, 0)
  }
  // The smash: the rock slams onto the ground and splits, its halves falling apart
  const hit = t - SMACK_HIT
  jolt(out, hit, [[0, 2], [0, -2], [g.side, 1], [0, -1], [0, 1]])
  const rest = g.ground - Math.round(r) + 1
  if (hit >= 0 && hit < 2) {
    chunk(out, tx, rest, r + 0.5, tones, a.seed, 0)
    for (const way of [-1, 1]) line(out, tx + way * (r + 1), rest - 3, tx + way * (r + 5), rest - 5, WHITE)
  } else if (hit >= 2 && hit < 14) {
    const apart = Math.min(3, (hit - 2) * 0.6)
    for (const way of [-1, 1]) chunk(out, tx + way * (1 + apart), rest + Math.min(1, hit * 0.1), r * 0.7, tones, a.seed + way, way * apart * 0.3)
  }
  if (hit >= 0 && hit < 16) {
    for (let k = -6; k <= 6; k++) {
      if (Math.abs(k) > hit * 2 || rnd(a.seed, k, 5) < phase(hit, 10, 16)) continue
      back(out, tx + k, g.ground - (Math.abs(k) % 3 === 1 ? 1 : 0), tones[4])
    }
    for (const way of [-1, 1]) dust(out, tx + way * 4, g.ground - 1, 4, hit / 16, a.seed + way)
  }
  chips(out, t, a, g, tx, g.ground - 2, tones, { start: SMACK_HIT + 4, count: 8, life: 12, speed: 1.4, salt: 60 })
}

const SMASH_HARDEN = 10
const SMASH_GO = 14
const SMASH_HIT = 18
const SMASH_RECOIL = 26
const SMASH_HOME = 44

// How far toward the target the head smash has carried the mon at tick t, and the
// recoil that hurls it back past its spot
const smashPos = (t, far) => keys(t, [
  [0, 0], [SMASH_HARDEN, -2, easeOut], [SMASH_GO, -2], [SMASH_HIT, far, easeIn],
  [SMASH_RECOIL, -3, easeOut], [SMASH_RECOIL + 4, -3], [SMASH_HOME, 0, easeInOut],
], linear)

// The foremost point of the head, where the stone skin centers
function headOf(g) {
  const y1 = g.top + Math.round((g.bottom - g.top) * 0.5)
  for (let x = g.side > 0 ? g.right : g.left; x !== g.cx; x -= g.side) {
    for (let y = g.top; y <= y1; y++) if (g.solid(x, y)) return { x, y }
  }
  return { x: g.side > 0 ? g.right : g.left, y: g.top + 2 }
}

// The head turns to cracked stone, the mon scrapes and charges, and slams in so hard
// the rock bursts into rubble, then the recoil throws it back, flashing hurt red
function headsmash(out, t, a, g, c) {
  const tones = stone(c)
  const far = clamp(g.reach - 6, 2, 12)
  const at = (k) => Math.round(g.side * smashPos(k, far))
  out.dx = at(t)
  if (t >= 4 && t < SMASH_GO) out.dx += tremble(t)
  if (t >= SMASH_HARDEN - 4 && t < SMASH_GO) out.skew = lean(g, -g.side * 1.5)
  else if (t >= SMASH_GO && t < SMASH_HIT) {
    out.skew = lean(g, g.side * 3)
    out.ghosts = [1, 2].map((k) => ghost(at(t - k), 0, tones[2], 0.4 + 0.2 * k))
  } else if (t >= SMASH_HIT && t < SMASH_HIT + 3) {
    out.sx = [0.8, 0.88, 0.95][t - SMASH_HIT]
    out.sy = [1.1, 1.06, 1.02][t - SMASH_HIT]
  }

  // Stone creeping over the head with dark cracks, and a hurt red flush after the hit
  const head = headOf(g)
  const harden = phase(t, 2, SMASH_HARDEN) * (1 - phase(t, SMASH_HIT, SMASH_HIT + 4))
  const hurt = t >= SMASH_HIT + 2 && t < SMASH_RECOIL + 6 && t % 4 < 2
  if (hurt) out.shade = tint(0xff3a2a, 0.45)
  else if (harden > 0) {
    out.shade = (x, y, col) => {
      const d = Math.hypot(x - head.x - out.dx, y - head.y)
      if (d > 7 * harden) return col
      const crack = (x * 3 + y * 5) % 11 === 0
      return crack ? tones[4] : mix(col, (x + y) % 3 ? tones[2] : tones[3], 0.7)
    }
  }
  if (t >= SMASH_HARDEN && t < SMASH_GO && t % 2 === 0) spark(out, head.x + out.dx, head.y, 1, tones[0])
  if (t >= 4 && t < SMASH_GO) dust(out, (g.side > 0 ? g.left : g.right) + out.dx, g.ground - 1, 2, ((t - 4) % 5) / 5, a.seed + (t >> 2) * 3)

  // The impact: a white flash, a ring of cracks and a storm of rubble
  const hit = t - SMASH_HIT
  const hx = clamp(g.ahead(far + 2), 2, g.columns - 3)
  const hy = head.y
  jolt(out, hit, [[g.side * 3, 2], [-g.side * 3, -2], [g.side * 2, 1], [-g.side, -1], [g.side, 0]])
  if (hit >= 0 && hit < 2) disc(out, hx, hy, 4 - hit, WHITE)
  if (hit >= 0 && hit < 5) burst(out, hx, hy, [6, 8, 8, 6, 4][hit], hit < 2 ? WHITE : tones[1])
  emit(t, { count: 10, gap: 0, start: SMASH_HIT, life: 16 }, (i, age) => {
    const angle = (i / 10) * TAU + rnd(a.seed, i, 70)
    const v = 1.2 + rnd(a.seed, i, 71) * 1.2
    const [px, py] = fling(hx, hy, Math.cos(angle) * v, Math.sin(angle) * v - 0.8, age, g.ground - 1)
    chunk(out, px, py, i % 3 ? 1.8 : 2.4, tones, a.seed + i, age * 0.7)
  })
  if (hit >= 0) dust(out, hx, g.ground - 1, 5, hit / 16, a.seed + 9)
  // Stars of hurt circling the head after the recoil
  if (t >= SMASH_RECOIL - 2 && t < SMASH_HOME - 4) {
    for (let k = 0; k < 3; k++) {
      const angle = t * 0.5 + (k * TAU) / 3
      const x = g.cx + out.dx + Math.cos(angle) * ((g.right - g.left) / 2 + 1)
      const y = g.top - 1 + Math.sin(angle) * 1.5
      if (Math.sin(angle) > -0.3) plus(out, x, y, 0xffd040, WHITE)
      else back(out, x, y, 0xc09020)
    }
  }
}

const TOMB_RAISE = 5
const TOMB_SLABS = [8, 12, 18]
const TOMB_CRUMBLE = 36

// A slab of stone w wide and h tall standing on bottom at x, in blocks with cracks
function slab(out, x, bottom, w, h, tones, seed) {
  const left = Math.round(x - w / 2)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const y = bottom - py
      const edge = px === 0 || px === w - 1 || py === h - 1 || py === 0
      const seam = py % 4 === 3 && rnd(seed, Math.floor(py / 4), 1) < 0.7
      const crack = rnd(seed, px * 7 + py * 13, 2) < 0.06
      let col = (px + py) % 5 === 0 ? tones[1] : tones[2]
      if (seam || crack) col = tones[3]
      if (px === w - 2) col = tones[3]
      if (edge) col = py === h - 1 ? tones[0] : px === 0 ? tones[1] : tones[4]
      dot(out, left + px, y, col)
    }
  }
}

// Raise a fist of power and drop stone slabs from above on either side of the target,
// then a capstone on top, sealing it in a tomb that later crumbles away
function rocktomb(out, t, a, g, c) {
  const tones = stone(c)
  const gap = 5
  const tx = clamp(g.target.x, gap + 3, g.columns - gap - 4)
  const tall = clamp(g.ground - g.target.y + 5, 8, 13)
  if (t < TOMB_RAISE) {
    out.dy = -Math.round(2 * easeOut(phase(t, 0, TOMB_RAISE)))
    out.sy = 1 + 0.05 * phase(t, 0, TOMB_RAISE)
  } else if (t < TOMB_RAISE + 3) {
    out.sy = [0.9, 0.95, 1][t - TOMB_RAISE]
  }
  const crumble = phase(t, TOMB_CRUMBLE, a.ticks - 2)
  const pieces = [
    { x: tx - g.side * gap, w: 5, h: tall, rest: g.ground },
    { x: tx + g.side * gap, w: 5, h: tall, rest: g.ground },
    { x: tx, w: gap * 2 + 6, h: 3, rest: g.ground - tall },
  ]
  pieces.forEach((p, i) => {
    const drop = TOMB_SLABS[i]
    const age = t - drop
    if (age < -3) return
    // A shadow on the ground before each slab arrives
    if (age < 0) {
      for (let k = -1; k <= 1; k++) back(out, p.x + k, g.ground, tones[4])
      return
    }
    const fall = Math.min(1, (age + 1) / 3)
    const bottom = lerp(p.rest - g.ground - 2, p.rest, easeIn(fall))
    const sink = Math.round(crumble * (p.h + 2) * (0.6 + i * 0.2))
    if (crumble < 1) slab(out, p.x, Math.round(bottom) + sink, p.w, Math.max(1, p.h - sink), tones, a.seed + i)
    jolt(out, age - 2, i === 2 ? [[0, 2], [0, -1], [g.side, 1]] : [[0, 1], [0, -1]])
    if (age >= 2 && age < 14) dust(out, p.x, g.ground - 1, i === 2 ? 4 : 3, (age - 2) / 12, a.seed + i * 5)
  })
  // Rubble tumbling off as it crumbles
  emit(t, { count: 12, gap: 0.6, start: TOMB_CRUMBLE, life: 10 }, (i, age) => {
    const x = tx + (rnd(a.seed, i, 80) - 0.5) * (gap * 2 + 4)
    const [px, py] = fling(x, g.ground - tall * (1 - crumble), (rnd(a.seed, i, 81) - 0.5) * 1.2, -0.5, age, g.ground - 1)
    chunk(out, px, py, 1.4, tones, a.seed + i, age)
  })
}

const STEALTH_TOSS = 6
const STEALTH_LAND = 16
const STEALTH_HIDE = 34
const STEALTH_STONES = 5

// Flick a handful of sharp stones out over the target's side, where they float
// scattered and bobbing, glinting one by one, then fade from sight, lying in wait
function stealthrock(out, t, a, g, c) {
  const tones = stone(c)
  const { x: tx, y: ty } = g.target
  if (t < STEALTH_TOSS) out.skew = lean(g, -g.side * 1.5 * phase(t, 1, STEALTH_TOSS))
  else if (t < STEALTH_TOSS + 3) {
    out.dx = g.side * [2, 1, 1][t - STEALTH_TOSS]
    out.skew = lean(g, g.side * 2)
  }
  const hide = phase(t, STEALTH_HIDE, a.ticks - 2)
  for (let i = 0; i < STEALTH_STONES; i++) {
    const born = STEALTH_TOSS + i * 0.7
    const age = t - born
    if (age < 0) continue
    const spot = {
      x: tx + Math.round((i / (STEALTH_STONES - 1) - 0.5) * 16 + (rnd(a.seed, i, 1) - 0.5) * 3),
      y: clamp(ty - 6 + Math.round(rnd(a.seed, i, 2) * 11), 4, g.ground - 3),
    }
    const f = Math.min(1, age / (STEALTH_LAND - STEALTH_TOSS))
    const sx = g.mouth.x + g.side
    const x = lerp(sx, spot.x, easeOut(f))
    const y = lerp(g.mouth.y, spot.y, f) - 6 * f * (1 - f) * 2 + (f >= 1 ? Math.round(Math.sin(t * 0.3 + i * 1.7)) : 0)
    // As they hide they break up into fewer and fewer pixels
    const fading = (o, px, py, col) => (rnd(a.seed, px * 7 + py * 3, i) >= hide ? dot(o, px, py, col) : null)
    chunk(out, x, y, 2.7, tones, a.seed + i * 11, f < 1 ? age * 0.9 : 0.3 * Math.sin(t * 0.2 + i), fading)
    if (f < 1 && age > 0) dot(out, x - g.side * 3, y + 1, tones[1])
    // Each glints in turn while it hovers
    if (f >= 1 && hide < 0.7 && (t + i * 5) % 18 === 0) spark(out, x, y - 1, 2, tones[0])
  }
  if (t >= STEALTH_HIDE - 4 && t < STEALTH_HIDE + 6) sparkles(out, t, a.seed, tx, ty, 18, 10, tones[1], 3)
}

const WIDE_RISE = 3
const WIDE_HOLD = 30

// Face out and stamp as a broad wall of stone blocks rises out of the ground from the
// middle outward across the strip, a glow running along its top, then it sinks back
function wideguard(out, t, a, g, c) {
  const tones = stone(c)
  const glowC = light(c, 0.6)
  if (t < WIDE_RISE) out.dy = -Math.round(2 * Math.sin(phase(t, 0, WIDE_RISE) * Math.PI))
  else if (t < WIDE_RISE + 3) {
    out.sy = [0.9, 0.95, 1][t - WIDE_RISE]
    out.sx = [1.06, 1.03, 1][t - WIDE_RISE]
  }
  jolt(out, t - WIDE_RISE, [[0, 1], [1, 0], [-1, 0]])
  const sink = easeIn(phase(t, WIDE_HOLD, a.ticks - 2))
  const blockW = 4
  const h = clamp(Math.round((g.bottom - g.top) * 0.4), 4, 7)
  const reach = Math.ceil(g.columns / 2 / blockW) + 1
  for (let k = -reach; k <= reach; k++) {
    const x0 = g.cx + k * blockW - blockW / 2
    const rise = easeOut(phase(t, WIDE_RISE + Math.abs(k), WIDE_RISE + Math.abs(k) + 4))
    const bh = Math.round(h * rise * (1 - sink) + (k % 2 ? 0 : rise * (1 - sink)))
    for (let py = 0; py < bh; py++) {
      for (let px = 0; px < blockW; px++) {
        const x = Math.round(x0) + px
        const y = g.ground - py
        const edge = px === 0 || py === bh - 1
        dot(out, x, y, py === bh - 1 ? tones[0] : edge ? tones[3] : (px + py) % 4 === 0 ? tones[1] : tones[2])
      }
    }
    if (bh > 1 && rise >= 1 && sink < 0.5) {
      const glint = (t - WIDE_RISE * 2 - k * g.side + 40) % 12
      if (glint < 4) for (let px = 0; px < blockW; px++) dot(out, Math.round(x0) + px, g.ground - bh, glint < 2 ? WHITE : glowC)
    }
  }
  if (t >= WIDE_RISE + 6 && t < WIDE_HOLD) sparkles(out, t, a.seed, g.cx, g.ground - h - 2, g.columns, 3, glowC, 4)
  dust(out, g.cx - 8, g.ground - 1, 3, (t - WIDE_RISE) / 10, a.seed + 1)
  dust(out, g.cx + 8, g.ground - 1, 3, (t - WIDE_RISE) / 10, a.seed + 2)
}

const GEM_FORM = 10
const GEM_FIRE = 13
const GEM_STOP = 28

// A cut gem: a pointed top crown over a long tapering base, with a white table
function jewel(out, x, y, s, pal) {
  const rows = Math.max(2, Math.round(s * 1.6))
  for (let k = -rows; k <= rows; k++) {
    const top = k < 0
    const w = top ? Math.round(s * (1 + k / rows) + 0.4) : Math.round(s * (1 - k / rows) * 1.0)
    for (let o = -w; o <= w; o++) {
      const edge = Math.abs(o) === w
      const col = top && Math.abs(o) < w * 0.4 && k < -rows / 3 ? WHITE : edge ? pal[3] : (o < 0) === top ? pal[0] : o === 0 ? pal[1] : pal[2]
      dot(out, x + o, y + k * 0.6, col)
    }
  }
}

// A gem grows in front of the mouth, glittering, then flares and fires a stream of
// sparkling gem shards and light at the target, where they burst in glitter
function powergem(out, t, a, g, c) {
  const pal = [light(c, 0.55), light(c, 0.2), c, dark(c, 0.5)]
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const gx = mx + g.side * 3
  const grow = easeOut(phase(t, 1, GEM_FORM))
  if (t >= 1 && t < GEM_FIRE) out.shade = rimGlow(g, out, c, 0.08 * grow, pal[0], 0.5 * grow)
  if (t >= GEM_FIRE && t < GEM_FIRE + 3) out.dx = -g.side * [2, 1, 1][t - GEM_FIRE]

  const live = t >= 1 && t < GEM_STOP + 2
  if (live) {
    const fade = phase(t, GEM_STOP - 2, GEM_STOP + 2)
    if (fade < 1) jewel(out, gx, my, 2.5 * grow * (1 - fade) + 0.5, pal)
    if (t % 4 === 0 && t < GEM_FIRE) spark(out, gx + (t % 8 ? 2 : -2), my - 3, 2, pal[0])
  }
  if (t === GEM_FIRE || t === GEM_FIRE + 1) burst(out, gx, my, 6 - (t - GEM_FIRE) * 2, pal[0])

  // A shimmering ray from gem to target, flickering between the gem's colors
  if (t >= GEM_FIRE && t < GEM_STOP) {
    const rays = [-1, 0, 1]
    for (const o of rays) {
      const col = (t + o + 3) % 3 === 0 ? WHITE : o === 0 ? pal[0] : pal[1]
      if (o !== 0 && (t + o) % 2) continue
      line(out, gx + g.side * 2, my + o * 0.5, tx, ty + o * 1.5, col)
    }
  }
  // Shards riding the ray, tumbling
  emit(t, { count: 12, gap: 1.2, start: GEM_FIRE, life: 5 }, (i, age, f) => {
    const x = lerp(gx, tx, f)
    const y = lerp(my, ty, f) + (rnd(a.seed, i, 1) - 0.5) * 4
    const tip = age % 2 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]
    dot(out, x, y, WHITE)
    for (const [ox, oy] of tip) dot(out, x + ox, y + oy, i % 2 ? pal[0] : pal[1])
  })
  // Glitter bursting off the target
  const hit = t - GEM_FIRE - 3
  if (hit >= 0 && t < GEM_STOP && hit % 5 === 0) out.shake = [g.side, 0]
  if (hit >= 0 && t < GEM_STOP + 6) sparkles(out, t, a.seed, tx, ty, 12, 10, pal[1], 7)
  emit(t, { count: 10, gap: 0, start: GEM_STOP - 2, life: 10 }, (i, age, f) => {
    const angle = (i / 10) * TAU
    const x = tx + Math.cos(angle) * age * 0.9
    const y = ty + Math.sin(angle) * age * 0.7 + 0.05 * age * age
    if (f < 0.5) plus(out, x, y, i % 2 ? pal[0] : pal[1], WHITE)
    else dot(out, x, y, pal[1])
  })
}

const WRECK_GATHER = 16
const WRECK_HEAVE = 20
const WRECK_HIT = 30
const WRECK_SLUMP = 44

// Rocks fly in and pack into a huge boulder before the mon, which strains and heaves
// it at the target in a crushing blast of rubble, then sags, spent, and recovers
function rockwrecker(out, t, a, g, c) {
  const tones = stone(c)
  const { y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const big = clamp(Math.round((g.bottom - g.top) * 0.35), 4, 6)
  const ox = g.ahead(big + 1)
  const oy = Math.min(g.ground - big, my)
  if (t < WRECK_GATHER) {
    const f = phase(t, 2, WRECK_GATHER)
    out.skew = lean(g, -g.side * 2 * f)
    out.sy = 1 - 0.06 * f
    if (t > 8) out.dx = tremble(t)
  } else if (t < WRECK_HEAVE) {
    out.dx = -g.side
    out.skew = lean(g, -g.side * 2.5)
  } else if (t < WRECK_HEAVE + 4) {
    const k = t - WRECK_HEAVE
    out.dx = g.side * [2, 3, 2, 1][k]
    out.skew = lean(g, g.side * [3, 3, 2, 1][k])
  } else if (t >= WRECK_SLUMP && t < a.ticks - 4) {
    const f = Math.sin(phase(t, WRECK_SLUMP, a.ticks - 4) * Math.PI)
    out.sy = 1 - 0.08 * f
    out.sx = 1 + 0.04 * f
    out.shade = tint(0x404040, 0.2 * f)
  }

  // Rocks flying in and packing into the boulder
  emit(t, { count: 10, gap: 1.2, start: 1, life: 5 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 1) * TAU
    const d = 12 * (1 - easeIn(f))
    chunk(out, ox + Math.cos(angle) * d, oy + Math.sin(angle) * d * 0.6, 1.5, tones, a.seed + i, age)
  })
  const size = big * easeOut(phase(t, 3, WRECK_GATHER))
  const fly = phase(t, WRECK_HEAVE + 1, WRECK_HIT)
  if (t >= 4 && t < WRECK_HIT) {
    const x = lerp(ox, tx, fly)
    const y = lerp(oy, ty, fly) - 3 * Math.sin(fly * Math.PI)
    if (fly > 0) {
      for (let k = 1; k <= 3; k++) {
        const lx = lerp(ox, tx, Math.max(0, fly - k * 0.08))
        dust(out, lx, y + 1, 2 + k * 0.5, 0.3 + k * 0.15, a.seed + k)
      }
    }
    chunk(out, x, y, Math.max(1.6, size), tones, a.seed + 77, fly * 5)
  }
  // The blast: flash, shock ring, rubble and a wall of dust
  const hit = t - WRECK_HIT
  jolt(out, hit, [[g.side * 3, 2], [-g.side * 3, -2], [g.side * 2, 2], [-g.side * 2, -1], [g.side, 1], [-g.side, 0], [0, 1]])
  if (hit >= 0 && hit < 3) disc(out, tx, ty, big + 2 - hit, WHITE)
  if (hit >= 1 && hit < 9) {
    const r = 3 + hit * 1.6
    for (let k = 0; k < 24; k++) {
      const angle = (k / 24) * TAU
      if (hit > 5 && k % 2) continue
      dot(out, tx + Math.cos(angle) * r, ty + Math.sin(angle) * r * 0.75, hit < 4 ? tones[0] : tones[2])
    }
  }
  emit(t, { count: 14, gap: 0, start: WRECK_HIT, life: 18 }, (i, age) => {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, 90) - 0.5) * 3.4
    const v = 1.3 + rnd(a.seed, i, 91) * 1.5
    const [px, py] = fling(tx, ty, Math.cos(angle) * v, Math.sin(angle) * v * 1.2, age, g.ground - 1)
    chunk(out, px, py, i % 4 ? 1.8 : 2.8, tones, a.seed + i * 3, age * 0.6)
  })
  if (hit >= 0) {
    dust(out, tx - 5, g.ground - 1, 5, hit / 20, a.seed + 1)
    dust(out, tx + 5, g.ground - 1, 5, hit / 20, a.seed + 2)
    dust(out, tx, g.ground - 3, 6, hit / 16, a.seed + 3, DUST, dot)
  }
  // Sweat drops off the spent mon
  emit(t, { count: 4, gap: 3, start: WRECK_SLUMP, life: 6 }, (i, age) => {
    const way = i % 2 ? 1 : -1
    const x = g.cx + way * (g.right - g.left) * 0.3 + way * age * 0.4
    dot(out, x, g.top + 1 + age * 0.9, WHITE)
    dot(out, x, g.top + 2 + age * 0.9, 0x5aa8e8)
  })
}

const POLISH_SWEEPS = [4, 13, 22]
const POLISH_FAST = 30

// Face out while bands of shine sweep across the body like a polishing cloth, sparkles
// popping off its edges, until it gleams and streaks of speed rise off it
function rockpolish(out, t, a, g, c) {
  const pal = [WHITE, light(c, 0.5), c, dark(c, 0.4)]
  const gleam = phase(t, 2, POLISH_FAST) * (1 - phase(t, a.ticks - 6, a.ticks - 1))
  const span = g.right - g.left + g.bottom - g.top
  let band = null
  for (const s of POLISH_SWEEPS) if (t >= s && t < s + 8) band = g.left + g.top - 4 + ((t - s) / 8) * (span + 8)
  out.shade = (x, y, col) => {
    if (band !== null) {
      const d = Math.abs(x - out.dx + y - band)
      if (d < 1.5) return mix(col, WHITE, 0.85)
      if (d < 3) return mix(col, pal[1], 0.5)
    }
    return mix(col, pal[1], 0.15 * gleam)
  }
  if (band !== null && (t - 4) % 9 < 1) out.dx = tremble(t)
  for (const s of POLISH_SWEEPS) {
    if (t === s + 7) spark(out, g.right + 1, g.bottom - 2, 2, pal[1])
    if (t === s + 3) spark(out, g.left - 1, g.top + 2, 2, pal[1])
  }
  if (t >= POLISH_FAST) {
    out.dy = -Math.round(Math.sin(phase(t, POLISH_FAST, a.ticks - 2) * Math.PI))
    emit(t, { count: 10, gap: 0.6, start: POLISH_FAST, life: 5 }, (i, age) => {
      const x = g.left - 2 + rnd(a.seed, i, 1) * (g.right - g.left + 4)
      const y = g.bottom - age * 3 - rnd(a.seed, i, 2) * 4
      for (let k = 0; k < 3; k++) dot(out, x, y + k, k ? pal[2] : WHITE)
    })
  }
  if (gleam > 0.5) sparkles(out, t, a.seed, g.cx, g.cy, g.right - g.left + 4, g.bottom - g.top + 2, pal[1], 3)
}

export const ROCK = {
  ancientpower: { ticks: 48, color: 0xc8a060, draw: ancientpower },
  rollout: { ticks: 42, color: ROCK_TAN, draw: rollout },
  sandstorm: { ticks: 52, color: 0xd8b878, pose: { view: 'front' }, draw: sandstorm },
  stoneedge: { ticks: 44, color: 0x8a7a68, draw: stoneedge },
  rockblast: { ticks: 44, color: 0x9a8a6a, draw: rockblast },
  smackdown: { ticks: 42, color: 0x9a8a6a, draw: smackdown },
  headsmash: { ticks: 48, color: 0xa89880, pose: (t) => ({ stride: t >= SMASH_GO && t < SMASH_HIT }), draw: headsmash },
  rocktomb: { ticks: 46, color: 0x847458, draw: rocktomb },
  stealthrock: { ticks: 44, color: 0xa89880, draw: stealthrock },
  wideguard: { ticks: 40, color: ROCK_TAN, pose: { view: 'front' }, draw: wideguard },
  powergem: { ticks: 40, color: 0xff3a6a, draw: powergem },
  rockwrecker: { ticks: 60, color: 0x8a7a5a, draw: rockwrecker },
  rockpolish: { ticks: 40, color: 0xd0c8b8, pose: { view: 'front' }, draw: rockpolish },
}
