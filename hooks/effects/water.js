// Water moves

import {
  WHITE, back, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, glow, keys, lean, lerp, light,
  luma, mix, phase, plus, puff, ring, rnd, spark, sparkles, stamp, tremble,
} from './draw.js'

const WATER_BLUE = 0x3f8fff

// Water from foam to the deep: foam, spray, the color, shade, depths
const tide = (c) => [light(c, 0.85), light(c, 0.45), c, dark(c, 0.3), dark(c, 0.55)]

// Droplets thrown up from x, y in a fan that fall back under gravity, landing on the floor
function spray(out, t, seed, x, y, floor, ramp, { count, start = 0, gap = 0, life = 10, up = 1, wide = 1, lean = 0, salt = 0 }) {
  emit(t, { count, start, gap, life }, (i, age, f) => {
    const angle = -Math.PI / 2 + lean + (rnd(seed, i, salt) - 0.5) * 2.2 * wide
    const speed = (0.7 + rnd(seed, i, salt + 1) * 0.8) * up
    const px = x + Math.cos(angle) * speed * age
    const py = Math.min(floor, y + Math.sin(angle) * speed * age + 0.14 * age * age)
    dot(out, px, py, f < 0.35 ? ramp[0] : f < 0.7 ? ramp[1] : ramp[2])
    if (age > 1 && py < floor && f < 0.6) dot(out, px, py - 1, ramp[1])
  })
}

// A shallow puddle on the floor, w wide, drying up as f goes to 1
function puddle(out, x, floor, w, ramp, f) {
  const half = Math.round((w / 2) * (1 - f))
  for (let k = -half; k <= half; k++) dot(out, x + k, floor, Math.abs(k) === half ? ramp[3] : (k + half) % 3 ? ramp[2] : ramp[1])
}

// Water bursting off the spot a jet hits, in flickering petals thrown up and around it
function crown(out, x, y, t, side, ramp) {
  const petals = [[-0.55, -0.9], [0, -1], [0.55, -0.9], [-0.6, 0.75], [0.6, 0.75]]
  petals.forEach(([px, py], k) => {
    const len = 2 + ((t + k) % 3)
    for (let j = 1; j <= len; j++) dot(out, x + side * px * j, y + py * j, j < 2 ? WHITE : j < len ? ramp[0] : ramp[1])
  })
  plus(out, x, y, ramp[0], WHITE)
}

const GUN_FIRE = 6
const GUN_STOP = 25

// The water gun's stream, from tail to front pixels ahead of the mouth
function gunSpan(t, dist) {
  const front = Math.min(dist, (dist * (t - GUN_FIRE + 1)) / 3)
  const tail = t < GUN_STOP ? 0 : Math.min(dist, (dist * (t - GUN_STOP + 1)) / 4)
  return [tail, front]
}

// Puff up and fire a thin pressurised jet that wobbles, sheds droplets and splashes
// on the target, then cuts off and leaves a drip and a little puddle
function watergun(out, t, a, g, c) {
  const ramp = tide(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const dist = Math.max(1, Math.abs(tx - mx))
  const yAt = (d) => my + (ty - my) * (d / dist) ** 2
  if (t >= 1 && t < GUN_FIRE) out.sy = 1 + 0.06 * phase(t, 1, GUN_FIRE)
  else if (t >= GUN_FIRE && t < GUN_STOP) out.dx = t < GUN_FIRE + 2 || (t >> 1) % 2 ? -g.side : 0
  if (t >= 2 && t < GUN_FIRE) disc(out, mx, my, (t - 2) * 0.4, t % 2 ? ramp[0] : ramp[1])

  const [tail, front] = gunSpan(t, dist)
  if (t >= GUN_FIRE && tail < dist) {
    for (let d = Math.ceil(tail); d <= front; d++) {
      const x = g.ahead(d)
      const y = yAt(d) + Math.round(Math.sin(d * 0.8 - t * 1.5) * 0.7 * (d / dist))
      const pulse = (d - t * 2) % 5 === 0
      dot(out, x, y, pulse ? WHITE : ramp[1])
      dot(out, x, y + 1, ramp[2])
      if ((d + t) % 4 === 0) dot(out, x, y + 2, ramp[3])
    }
    if (front < dist) plus(out, g.ahead(front), yAt(front), ramp[1], WHITE)
  }

  // Droplets peel off the stream and fall away
  emit(t, { count: 18, gap: 1, start: GUN_FIRE + 2, life: 7 }, (i, age, f) => {
    const d = rnd(a.seed, i, 1) * dist * 0.9
    if (t - age >= GUN_STOP) return
    const x = g.ahead(d + age * 0.6)
    const y = yAt(d) + 1 + age * 0.4 + 0.1 * age * age
    if (y < g.ground) dot(out, x, y, f < 0.5 ? ramp[1] : ramp[2])
  })

  // Splash where it hits, and a drip and puddle once it stops
  if (t >= GUN_FIRE + 3 && t < GUN_STOP + 4) crown(out, tx, ty, t, g.side, ramp)
  spray(out, t, a.seed, tx, ty, g.ground, ramp, { count: 30, start: GUN_FIRE + 3, gap: 0.6, life: 9, up: 0.9, lean: -g.side * 0.5 })
  emit(t, { count: 4, gap: 2, start: GUN_STOP + 2, life: 6 }, (i, age) => {
    dot(out, tx + (rnd(a.seed, i, 7) - 0.5) * 4, ty + 1 + age * age * 0.25, ramp[1])
  })
  if (t >= GUN_STOP) puddle(out, tx, g.ground, 7, ramp, phase(t, a.ticks - 8, a.ticks))
}

const PUMP_BLAST = 11
const PUMP_EASE = 36
const PUMP_END = 42

// Brace and gather a ball of water, then blast a huge foaming torrent that shoves
// the mon back and bursts over the target, raining spray down after
function hydropump(out, t, a, g, c) {
  const ramp = tide(c)
  const { x: mx, y: my } = g.mouth
  // Aim nearly level: a torrent this strong barely dips
  const tx = g.target.x
  const ty = Math.min(g.target.y, my + 3)
  const dist = Math.max(2, Math.abs(tx - mx))
  if (t < PUMP_BLAST) {
    const f = easeOut(phase(t, 1, PUMP_BLAST))
    out.dx = -g.side * Math.round(f)
    out.sy = 1 - 0.06 * f
    out.sx = 1 + 0.04 * f
  } else if (t < PUMP_END) {
    out.dx = -g.side * (t < PUMP_BLAST + 3 ? 3 : 2 + (t % 2))
    out.skew = lean(g, -g.side * (t < PUMP_BLAST + 3 ? 2.5 : 1.5))
    if (t < PUMP_BLAST + 4) out.shake = [t % 2 ? g.side : -g.side, 0]
  } else out.dx = -g.side * Math.round(2 * (1 - easeOut(phase(t, PUMP_END, a.ticks - 2))))
  const ox = mx + out.dx
  const yAt = (d) => lerp(my, ty, clamp(d / dist, 0, 1))

  // Water swirls into a ball at the mouth
  if (t < PUMP_BLAST) {
    emit(t, { count: 14, gap: 0.6, start: 1, life: 5 }, (i, age, f) => {
      const angle = rnd(a.seed, i) * Math.PI * 2 + f * 2
      const r = 7 * (1 - easeIn(f))
      dot(out, ox + Math.cos(angle) * r, my + Math.sin(angle) * r, f < 0.5 ? ramp[2] : ramp[1])
    })
    const r = 3 * phase(t, 2, PUMP_BLAST)
    if (r > 0.5) {
      disc(out, ox + g.side, my, r, ramp[2])
      disc(out, ox + g.side, my, r * 0.6, ramp[1])
      dot(out, ox + g.side - 1, my - Math.round(r * 0.5), WHITE)
    }
  }

  // The torrent is thick and foaming, with ragged edges
  if (t >= PUMP_BLAST && t < PUMP_END) {
    const front = Math.min(dist + 1, ((dist + 1) * (t - PUMP_BLAST + 1)) / 3)
    const tail = t < PUMP_EASE ? 0 : ((dist + 1) * (t - PUMP_EASE)) / (PUMP_END - PUMP_EASE)
    const thick = t < PUMP_EASE ? 2.5 : 2.5 * (1 - phase(t, PUMP_EASE, PUMP_END))
    for (let d = Math.ceil(tail); d <= front; d++) {
      const x = ox + g.side * d
      const y = yAt(d) + Math.sin(d * 0.5 - t * 1.2) * 0.6
      const h = thick + (d / dist) * 0.8 + (rnd(a.seed, d, t) - 0.5) * 1.2
      for (let o = -Math.ceil(h); o <= Math.ceil(h); o++) {
        if (Math.abs(o) > h + 0.3) continue
        const e = Math.abs(o) / Math.max(0.5, h)
        const streak = (d - t * 3 + o * 5) % 7 === 0
        dot(out, x, y + o, streak && e < 0.7 ? WHITE : e < 0.3 ? ramp[0] : e < 0.6 ? ramp[1] : e < 0.85 ? ramp[2] : o > 0 ? ramp[4] : ramp[3])
      }
    }
  }
  if (t === PUMP_BLAST) disc(out, ox, my, 3, WHITE)

  // Foam spray flies off the torrent's edges
  emit(t, { count: 18, gap: 1.2, start: PUMP_BLAST + 2, life: 5 }, (i, age, f) => {
    if (t - age >= PUMP_EASE) return
    const d = (0.3 + rnd(a.seed, i, 3) * 0.6) * dist
    const up = i % 2 ? -1 : 1
    const x = ox + g.side * (d + age * 1.2)
    const y = yAt(d) + up * (3.5 + age * 0.7) + 0.12 * age * age
    if (y < g.ground) dot(out, x, y, f < 0.5 ? ramp[0] : ramp[1])
  })

  // Foam piles up on the target and water is thrown high
  if (t >= PUMP_BLAST + 3 && t < PUMP_END + 2) {
    const r = t < PUMP_EASE ? 3 + (t % 3 === 0 ? 1 : 0) : 3 * (1 - phase(t, PUMP_EASE, PUMP_END + 2))
    for (let py = Math.floor(ty - r - 1); py <= ty + r; py++) {
      for (let px = Math.floor(tx - r); px <= tx + r; px++) {
        const dd = Math.hypot(px - tx, (py - ty) * 1.2) / Math.max(0.5, r)
        if (dd > 1 || (dd > 0.7 && rnd(a.seed, px * 13 + py, t) < 0.4)) continue
        dot(out, px, py, dd < 0.4 ? WHITE : dd < 0.75 ? ramp[0] : ramp[1])
      }
    }
  }
  if (t >= PUMP_BLAST + 3 && t < PUMP_BLAST + 5) out.shake = [g.side, t % 2]
  spray(out, t, a.seed, tx, ty - 3, g.ground, ramp, { count: 40, start: PUMP_BLAST + 3, gap: 0.6, life: 14, up: 1.7, wide: 0.7, lean: -g.side * 0.25, salt: 10 })
  if (t >= PUMP_END - 4) puddle(out, tx, g.ground, 11, ramp, phase(t, a.ticks - 6, a.ticks))
}

const SURF_RISE = 12
const SURF_RIDE = 32
const SURF_CRASH = 40
const SURF_FACE = 6

// The wave's height above the floor s pixels ahead of its crest, or behind it when
// negative. It has a hollow face in front and a long back sloping down to the sea.
function swell(s, height, sea) {
  if (s > 0) return s >= SURF_FACE ? 0 : height * (1 - s / SURF_FACE) ** 2
  return Math.max(sea, height * (1 + s / 14))
}

// Water darkens the deeper it lies below the foam on its surface
function waterAt(ramp, depth, x, t) {
  if (depth === 0) return (x + t) % 4 ? ramp[0] : WHITE
  return ramp[depth === 1 ? 1 : depth === 2 ? 2 : depth < 6 ? 3 : 4]
}

// The lip of the wave curling forward and down off its crest, thick with foam
function curl(out, x, top, side, ramp) {
  for (let j = 0; j < 7; j++) {
    const px = x + side * j * 0.75
    const py = top + j * j * 0.2
    dot(out, px, py - 1, j < 5 ? WHITE : ramp[0])
    dot(out, px, py, j < 3 ? WHITE : ramp[0])
    dot(out, px, py + 1, ramp[1])
  }
}

// A wave swells up behind the mon and lifts it onto its crest, rolls across the
// strip with the mon riding it, crashes into spray at the far side, and drains away
function surf(out, t, a, g, c) {
  const ramp = tide(c)
  const lift = clamp(g.top + 1, 2, 4)
  const carry = clamp(g.reach - 5, 0, 10)
  const rideF = easeInOut(phase(t, SURF_RISE, SURF_RIDE))
  const backF = easeInOut(phase(t, SURF_CRASH, a.ticks - 3))
  out.dx = g.side * Math.round(carry * rideF * (1 - backF))
  const up = easeOut(phase(t, 3, SURF_RISE)) * (1 - easeIn(phase(t, SURF_RIDE, SURF_CRASH)))
  const bob = up > 0.9 && (t >> 2) % 2 ? 1 : 0
  out.dy = -Math.round(lift * up + bob)
  // Lean into the ride, rocking with the swell, and sit back as the wave drops away
  const leanBy = t < SURF_RIDE ? (1.5 + bob * 0.8) * up : -1.5 * Math.sin(phase(t, SURF_RIDE, SURF_CRASH + 2) * Math.PI)
  if (Math.abs(leanBy) > 0.2) out.skew = lean(g, g.side * leanBy)

  const front = g.mouth.x
  const rear = g.side > 0 ? g.left : g.right
  const height = clamp(Math.round((g.bottom - g.top) * 0.5), 7, 13) * easeOut(phase(t, 1, SURF_RISE))
  const crash = phase(t, SURF_RIDE, SURF_CRASH)
  const crest = lerp(rear, front, easeInOut(phase(t, 2, SURF_RISE))) + g.side * (carry * rideF + crash * 4)
  const tall = height * (1 - easeIn(crash))
  const sea = 2.5 * (1 - phase(t, SURF_CRASH, a.ticks - 4))
  const cover = lift * up + 2

  // The water, column by column, over the mon up to its waterline and behind it above
  for (let x = 0; x < g.columns && (sea > 0 || tall > 0); x++) {
    const s = (x - crest) * g.side
    const h = Math.round(swell(s, tall, sea) + (s < 0 ? Math.sin(x * 0.7 + t * 0.8) * 0.5 : 0))
    for (let k = 0; k < h; k++) {
      const depth = h - 1 - k
      const streak = depth > 2 && (x * g.side + t * 2 + k * 3) % 9 === 0
      let col = streak ? ramp[2] : waterAt(ramp, depth, x, t)
      if (s > 0) col = depth === 0 ? ramp[2] : dark(col, 0.2)
      if (k < cover) dot(out, x, g.ground - k, col)
      else back(out, x, g.ground - k, col)
    }
  }
  if (tall > 3) curl(out, crest, g.ground - Math.round(tall) + 1, g.side, ramp)

  // Spray blown off the crest while riding
  emit(t, { count: 14, gap: 1.4, start: SURF_RISE - 4, life: 6 }, (i, age, f) => {
    if (t - age >= SURF_RIDE) return
    const x = crest + g.side * (rnd(a.seed, i, 2) * 3) - g.side * age * 0.8
    const y = g.ground - tall - 1 - age * 0.7 + 0.1 * age * age
    dot(out, x, y, f < 0.5 ? WHITE : ramp[1])
  })

  // At the crash, foam boils up at the far side and spray is thrown high
  const far = g.ahead(clamp(g.reach - 3, 2, g.reach))
  const boil = t - SURF_RIDE - 1
  if (boil >= 0 && boil < 10) {
    const r = [2, 3, 4, 4.5, 4.5, 4, 3.5, 3, 2, 1.5][boil]
    puff(out, far + g.side, g.ground - r + 1, r, ramp[1], a.seed + boil)
    if (boil > 1) puff(out, far - g.side * 3, g.ground - r * 0.6 + 1, r * 0.7, ramp[1], a.seed + boil + 7)
  }
  spray(out, t, a.seed, far, g.ground - 5, g.ground, ramp, { count: 30, start: SURF_RIDE + 1, gap: 0.3, life: 13, up: 1.6, wide: 1, lean: -g.side * 0.3, salt: 20 })
  if (boil === 1 || boil === 2) out.shake = [boil === 1 ? g.side : -g.side, 1]
}

const FALL_WIND = 8
const FALL_HIT = 14
const FALL_BACK = 31

// How far forward the charge has carried the mon at tick t
function fallDash(t, far) {
  if (t < FALL_WIND) return -Math.round(2 * easeOut(phase(t, 1, FALL_WIND)))
  if (t < FALL_HIT) return Math.round(lerp(-2, far, (t - FALL_WIND + 1) / (FALL_HIT - FALL_WIND)))
  if (t < FALL_HIT + 4) return far
  return Math.round(far * (1 - easeInOut(phase(t, FALL_HIT + 4, FALL_BACK))))
}

// A skin of rushing water around the mon's outline, shifted by dx and risen to `level`
// rows above its feet, with bright bands flowing up it
function sheath(out, t, g, dx, level, ramp) {
  for (let y = Math.max(g.top - 1, Math.round(g.bottom + 1 - level)); y <= g.bottom + 1; y++) {
    for (let x = g.left - 1; x <= g.right + 1; x++) {
      if (g.solid(x, y)) continue
      if (!g.solid(x + 1, y) && !g.solid(x - 1, y) && !g.solid(x, y + 1) && !g.solid(x, y - 1)) continue
      const band = (y + t) % 6
      dot(out, x + dx, y, band === 0 ? WHITE : band === 1 ? ramp[0] : band < 4 ? ramp[1] : ramp[2])
    }
  }
}

// A column of water h pixels high bursting up from the floor at x, with a white crown
// over foaming light water and darker sides
function geyser(out, x, floor, h, ramp, t) {
  for (let k = 0; k < h; k++) {
    const below = h - 1 - k
    const half = below < 1 ? 1 : 2
    for (let o = -half; o <= half; o++) {
      const col = below < 2 ? WHITE : Math.abs(o) === half ? ramp[2] : (k + t + o) % 3 ? ramp[1] : ramp[0]
      dot(out, x + o, floor - k, col)
    }
  }
}

// Wrap up in a skin of rushing water, charge with a wake streaming behind, and hit
// with a great geyser that lifts the mon, then swim back as the water rains down
function waterfall(out, t, a, g, c) {
  const ramp = tide(c)
  const far = clamp(g.reach - 6, 2, 9)
  const dash = fallDash(t, far)
  out.dx = g.side * dash
  const hitX = g.ahead(far + 3)
  const hit = t - FALL_HIT
  if (t < FALL_WIND) out.sy = 1 - 0.06 * easeOut(phase(t, 1, FALL_WIND))
  if (t >= FALL_WIND && t < FALL_HIT) out.skew = lean(g, g.side * 2)
  else if (hit >= 0 && hit < 3) out.skew = lean(g, -g.side * 1.5)
  if (t >= 2 && t < FALL_HIT + 4) out.shade = glow(ramp[1], 0.25 + (t % 2) * 0.1)
  if (hit >= 0 && hit < 9) out.dy = -Math.round(3 * Math.sin(phase(hit, 0, 9) * Math.PI))
  if (hit === 0 || hit === 1) out.shake = [hit ? -g.side : g.side, 1]

  // Water climbs over the body, then rides along with the charge
  if (t >= 1 && t < FALL_HIT + 1) sheath(out, t, g, out.dx, (g.bottom - g.top + 3) * easeOut(phase(t, 1, FALL_WIND - 1)), ramp)
  if (t >= FALL_WIND && t < FALL_HIT + 2) {
    const rear = (g.side > 0 ? g.left : g.right) + out.dx
    for (let k = 0; k <= 3; k++) {
      const y = g.top + 2 + Math.round(((g.bottom - g.top - 3) * k) / 3)
      const tail = rear - g.side * (2 + ((k * 3 + t) % 3))
      for (let d = 0; d < 5; d++) dot(out, tail - g.side * d, y, d === 0 ? WHITE : d < 3 ? ramp[1] : ramp[2])
    }
  }
  // A wake of water on the floor behind the charge
  emit(t, { count: 14, gap: 0.5, start: FALL_WIND, life: 7 }, (i, age, f) => {
    const x = (g.side > 0 ? g.left : g.right) + g.side * fallDash(t - age, far) - g.side * (1 + age * 0.6)
    const y = g.bottom - rnd(a.seed, i, 1) * (g.bottom - g.top) * 0.6 + 0.15 * age * age
    dot(out, x, Math.min(g.ground, y), f < 0.5 ? ramp[1] : ramp[2])
  })

  // The geyser shoots up, then falls back as rain
  if (hit >= 0 && hit < 10) {
    const h = Math.min(g.ground - 1, 15) * (hit < 6 ? easeOut(phase(hit, 0, 3)) : 1 - phase(hit, 6, 10))
    geyser(out, hitX, g.ground, Math.round(h), ramp, t)
  }
  spray(out, t, a.seed, hitX, g.ground - Math.min(g.ground - 1, 15), g.ground, ramp, { count: 24, start: FALL_HIT + 3, gap: 0.25, life: 14, up: 0.7, wide: 1.4, salt: 30 })
  spray(out, t, a.seed, hitX, g.ground - 2, g.ground, ramp, { count: 12, start: FALL_HIT, gap: 0, life: 12, up: 1.3, wide: 1, salt: 40 })
  if (t >= FALL_HIT + 8) puddle(out, hitX, g.ground, 9, ramp, phase(t, a.ticks - 8, a.ticks))
}

const BUBBLE_COUNT = 6
const BUBBLE_START = 4
const BUBBLE_GAP = 4
const BUBBLE_SIZES = [2, 1, 3, 2, 1, 2]
const BUBBLE_LANES = [0.9, 0.45, 0.75, 0.35, 1, 0.6]

// Bubbles of three sizes: a light rim, a darker one below, and a white shine
const BUBBLE_ART = {
  1: ['.a.', 'a.b', '.b.'],
  2: ['.aaa.', 'ah..b', 'a...b', 'a..cb', '.bbb.'],
  3: ['..aaa..', '.ah..b.', 'ah....b', 'a.....b', 'a....cb', '.b..cb.', '..bbb..'],
}

// Where bubble i is at its age. It drifts out to its own spot and wobbles as it rises.
function bubbleAt(g, a, i, age) {
  const dist = Math.abs(g.target.x - g.mouth.x) + 2
  const reach = clamp(dist * BUBBLE_LANES[i], 3, g.reach - 3)
  const x = g.ahead(reach * easeOut(Math.min(1, age / 12))) + Math.sin(age * 0.45 + i * 2) * 0.8
  const rise = age * (0.22 + rnd(a.seed, i, 3) * 0.12)
  const y = g.mouth.y + 1 - (i % 2) * 2 - rise + Math.sin(age * 0.35 + i) * 0.7
  return [x, Math.max(BUBBLE_SIZES[i] + 1, y)]
}

// Blow a stream of glossy bubbles of mixed sizes that float out slowly, wobbling and
// rising, then pop one by one into falling droplets
function bubble(out, t, a, g, c) {
  const ramp = [WHITE, light(c, 0.35), c, dark(c, 0.3)]
  const palette = { a: ramp[1], b: ramp[3], c: ramp[1], h: WHITE }
  const blowing = t >= BUBBLE_START - 2 && t < BUBBLE_START + BUBBLE_COUNT * BUBBLE_GAP
  if (blowing) {
    out.sy = Math.floor((t - BUBBLE_START) / 1.75) % 2 ? 1.04 : 1
    dot(out, g.mouth.x, g.mouth.y, t % 2 ? ramp[1] : WHITE)
  }

  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const born = BUBBLE_START + Math.round(i * BUBBLE_GAP)
    const pops = born + 12 + Math.round(rnd(a.seed, i, 4) * 4)
    const age = t - born
    if (age < 0) continue
    const [x, y] = bubbleAt(g, a, i, Math.min(age, pops - born))
    if (t < pops) {
      const art = BUBBLE_ART[age < 2 ? 1 : age < 4 ? Math.min(2, BUBBLE_SIZES[i]) : BUBBLE_SIZES[i]]
      stamp(out, x - (art.length - 1) / 2, y - (art.length - 1) / 2, art, palette, g.side < 0)
      continue
    }
    // It pops in a ring of spray, then drips
    const pop = t - pops
    const r = BUBBLE_SIZES[i] + 1
    if (pop < 2) {
      for (let k = 0; k < 8; k++) {
        const angle = (k * Math.PI) / 4 + pop * 0.4
        dot(out, x + Math.cos(angle) * (r + pop), y + Math.sin(angle) * (r + pop), pop ? ramp[1] : WHITE)
      }
    }
    emit(pop, { count: 3 + BUBBLE_SIZES[i], gap: 0, life: 9 }, (k, life, f) => {
      const angle = rnd(a.seed, i * 9 + k, 5) * Math.PI * 2
      const px = x + Math.cos(angle) * (r * 0.6 + life * 0.4)
      const py = y + Math.sin(angle) * r * 0.6 + 0.12 * life * life
      if (py < g.ground) dot(out, px, py, f < 0.5 ? ramp[1] : ramp[2])
    })
  }
}

const CLAMP_SHOW = 4
const CLAMP_SNAP = 12
const CLAMP_SHUT = 14
const CLAMP_FADE = 27
const CLAMP_JAWS = [0.65, 0.3]
const CLAMP_RIBS = 7

// How open the jaws are at tick t, from 1 wide open to 0 shut. They sway, snap, hold,
// then gape once more before they vanish.
function clampOpen(t) {
  if (t < CLAMP_SNAP) return 1 + Math.sin(t * 0.9) * 0.1
  if (t < CLAMP_SHUT) return 1 - easeIn(phase(t, CLAMP_SNAP - 1, CLAMP_SHUT))
  if (t < CLAMP_FADE) return 0
  return 0.4 * easeOut(phase(t, CLAMP_FADE, CLAMP_FADE + 4))
}

// One shell half hinged at hx, hy and pointing ahead, turned open by `open` radians.
// It is a dome with ribs fanning out from the middle of its lip, an outline and a shine.
function shell(out, g, hx, hy, len, tall, open, top, pal) {
  const turn = top ? open : -open
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  // A pixel in the dome's own frame, with u along the lip from the hinge and v out of it
  const local = (lx, ly) => {
    const w = lx * sin + ly * cos
    return [lx * cos - ly * sin, top ? -w : w]
  }
  const inside = (lx, ly) => {
    const [u, v] = local(lx, ly)
    return u >= 0 && v >= -0.5 && ((u - len) / len) ** 2 + (Math.max(0, v) / tall) ** 2 <= 1
  }
  const span = Math.ceil(len * 2 + 1)
  for (let ly = -span; ly <= span; ly++) {
    for (let lx = -1; lx <= span; lx++) {
      if (!inside(lx, ly)) continue
      const [u, v] = local(lx, ly)
      const edge = !inside(lx + 1, ly) || !inside(lx - 1, ly) || !inside(lx, ly + 1) || !inside(lx, ly - 1)
      const rib = Math.floor((Math.atan2(Math.max(0, v) / tall, (u - len) / len) / Math.PI) * CLAMP_RIBS)
      let col = rib % 2 ? pal[2] : pal[1]
      if (edge || v < 0.5) col = pal[4]
      else if (top && v > tall * 0.5 && Math.abs(u - len * 0.75) < 1.2) col = pal[0]
      dot(out, hx + g.side * lx, hy + ly, col)
    }
  }
}

// Two great ribbed shell halves appear around the target, sway open, and snap shut on
// it like jaws with a clang and a squirt of water, grind, then vanish in a twinkle
function clampJaws(out, t, a, g, c) {
  const ramp = tide(WATER_BLUE)
  const pal = [WHITE, light(c, 0.4), dark(c, 0.08), dark(c, 0.25), dark(c, 0.6)]
  const len = clamp(Math.floor((g.reach - 3) / 2), 3, 6)
  const tall = Math.max(2.5, len * 0.9)
  const hx = g.target.x - g.side * len
  const hy = g.target.y
  if (t >= 1 && t < CLAMP_SNAP - 1) out.sy = 1 + 0.05 * Math.sin(phase(t, 1, CLAMP_SNAP - 1) * Math.PI)
  if (t >= CLAMP_SNAP && t < CLAMP_SHUT + 2) out.sy = 0.92
  if (t >= CLAMP_SHUT && t < CLAMP_SHUT + 2) out.shake = [t === CLAMP_SHUT ? g.side : -g.side, 1]

  if (t >= 1 && t < CLAMP_SHOW + 2) sparkles(out, t, a.seed, g.target.x, hy, len * 2, tall * 2, pal[1], 4)
  const shown = t >= CLAMP_SHOW && t < CLAMP_FADE + 4
  if (shown) {
    const grow = easeOut(phase(t, CLAMP_SHOW, CLAMP_SHOW + 3))
    const grind = t > CLAMP_SHUT + 1 && t < CLAMP_FADE ? ((t >> 1) % 2 ? 1 : 0) : 0
    const open = clampOpen(t)
    shell(out, g, hx + g.side * grind, hy, len * grow, tall * grow, CLAMP_JAWS[0] * open, true, pal)
    shell(out, g, hx, hy, len * grow, tall * grow, CLAMP_JAWS[1] * open, false, pal)
  }
  if (t >= CLAMP_FADE + 4) sparkles(out, t, a.seed, g.target.x, hy, len * 2, tall * 2, pal[1], 5)

  // The clang flashes white along the seam and twinkles off the tip
  const clang = t - CLAMP_SHUT
  if (clang >= 0 && clang < 2) {
    for (let d = 0; d <= len * 2; d++) dot(out, hx + g.side * d, hy, WHITE)
    spark(out, hx + g.side * (len * 2 + 1), hy, 3 - clang, pal[1])
  }
  // Water squeezed out of the seam bursts from the tip and sprays over the top
  const tip = hx + g.side * (len * 2 + 1)
  if (clang >= 1 && clang < 5) crown(out, tip, hy, t, g.side, ramp)
  spray(out, t, a.seed, tip, hy, g.ground, ramp, { count: 20, start: CLAMP_SHUT, gap: 0.25, life: 11, up: 1.2, wide: 1.1, lean: g.side * 0.7, salt: 50 })
  spray(out, t, a.seed, hx + g.side * len, hy - tall, g.ground, ramp, { count: 10, start: CLAMP_SHUT, gap: 0, life: 11, up: 1.1, wide: 0.7, salt: 60 })
}

const TAU = Math.PI * 2

// The middle of the body's top row, where water spouts from the head
function topOf(g) {
  let left = g.right
  let right = g.left
  for (let x = g.left; x <= g.right; x++) {
    if (!g.solid(x, g.top)) continue
    left = Math.min(left, x)
    right = Math.max(right, x)
  }
  return { x: Math.round((left + right) / 2), y: g.top }
}

// Walk an ellipse turned by `spin`, calling fn(x, y, near, k, angle) for each point.
// `near` is true on its lower half, the side facing the viewer, so a ring can wrap
// around something.
function loop(x, y, rx, ry, spin, fn) {
  const steps = Math.max(12, Math.ceil(rx * 6))
  for (let k = 0; k < steps; k++) {
    const angle = (k / steps) * TAU + spin
    fn(x + rx * Math.cos(angle), y + ry * Math.sin(angle), Math.sin(angle) > 0, k, angle)
  }
}

// A big water drop falling, round below and pointed on top
function drop(out, x, y, ramp) {
  dot(out, x, y - 1, ramp[1])
  dot(out, x, y, WHITE)
  dot(out, x + 1, y, ramp[2])
  dot(out, x, y + 1, ramp[2])
  dot(out, x + 1, y + 1, ramp[3])
}

const RAIN_POUR = 8
const RAIN_EASE = 38

// Face out and look up as a gray cloud gathers over the strip, then a slanting
// downpour drums the ground into splashes and puddles while the mon bobs in it
function raindance(out, t, a, g, c) {
  const ramp = tide(c)
  const cloud = [mix(c, 0xb8c0cc, 0.7), mix(c, 0x8890a0, 0.7), mix(c, 0x5a6070, 0.75), mix(c, 0x303644, 0.8)]
  const grow = easeOut(phase(t, 0, RAIN_POUR + 2)) * (1 - easeIn(phase(t, RAIN_EASE + 2, a.ticks - 1)))
  const pour = phase(t, RAIN_POUR - 2, RAIN_POUR + 4) * (1 - phase(t, RAIN_EASE - 4, RAIN_EASE + 2))

  // A happy little bob on the beat of the rain, drenched and glinting
  if (t >= RAIN_POUR && t < RAIN_EASE + 4) {
    const beat = (t - RAIN_POUR) % 8
    out.dy = beat < 3 ? -[1, 2, 1][beat] : 0
    out.sy = beat === 3 ? 0.95 : 1
  }
  if (pour > 0) out.shade = (x, y, col) => ((x * 3 + y + t) % 11 === 0 ? mix(col, WHITE, 0.6 * pour) : mix(col, ramp[2], 0.15 * pour))

  // Lumps of cloud spreading out from over the mon, behind it
  const span = (g.columns / 2 + 4) * grow
  for (let k = 0; k < 9; k++) {
    const off = (k - 4) / 4
    const x = g.cx + off * span + Math.sin(t * 0.15 + k) * 1.5
    if (x < -3 || x > g.columns + 2 || grow <= 0) continue
    const r = (2.2 + rnd(a.seed, k, 1) * 1.6) * (0.5 + grow * 0.5)
    for (let py = Math.floor(-r); py <= Math.ceil(r); py++) {
      for (let px = Math.floor(-r * 1.4); px <= Math.ceil(r * 1.4); px++) {
        const d = Math.hypot(px / 1.4, py) / r
        if (d > 1 || (d > 0.8 && rnd(a.seed, px + k * 17, py + 3) < 0.4)) continue
        back(out, x + px, 2 + py, cloud[py < -r * 0.3 ? 0 : d < 0.6 ? 1 : py > r * 0.4 ? 3 : 2])
      }
    }
  }

  // Slanted streaks of rain, each ending in a little splash
  const slant = 0.5
  emit(t, { count: 140, gap: 0.22, start: RAIN_POUR - 2, life: 14 }, (i, age) => {
    const born = RAIN_POUR - 2 + i * 0.22
    if (rnd(a.seed, i, 3) > phase(born, RAIN_POUR - 2, RAIN_POUR + 4) * (1 - phase(born, RAIN_EASE - 4, RAIN_EASE + 2))) return
    const speed = 2.2 + rnd(a.seed, i, 4) * 0.8
    const fall = 3 + age * speed
    const x = rnd(a.seed, i, 5) * (g.columns + 10) - 6 + fall * slant
    if (fall < g.ground) {
      dot(out, x, fall, ramp[1])
      dot(out, x - slant, fall - 1, ramp[2])
      if (i % 3 === 0) dot(out, x - slant * 2, fall - 2, ramp[3])
      return
    }
    const land = (fall - g.ground) / speed
    if (land < 2) {
      const sx = x - (fall - g.ground) * slant
      dot(out, sx - 1, g.ground - 1 - Math.round(land), ramp[0])
      dot(out, sx + 1, g.ground - 1 - Math.round(land), ramp[0])
      dot(out, sx, g.ground, WHITE)
    }
  })

  // Water pooling along the ground, rippling where drops land
  const wet = phase(t, RAIN_POUR + 2, RAIN_POUR + 14) * (1 - phase(t, RAIN_EASE + 2, a.ticks - 1))
  if (wet > 0) {
    for (let x = 0; x < g.columns; x++) {
      if (rnd(a.seed, x, 9) > wet) continue
      back(out, x, g.ground, (x + (t >> 1)) % 6 === 0 ? ramp[0] : x % 3 ? ramp[2] : ramp[3])
    }
  }
  if (t >= RAIN_EASE + 4) sparkles(out, t, a.seed, g.cx, g.top - 1, g.right - g.left + 6, 4, ramp[1], 3)
}

const SPORT_HOPS = [5, 13, 21]
const SPORT_SHAKE = 30
const SPORT_DRY = 40

// Face out and stomp in a puddle three times, kicking water up both sides until the
// body is soaked and dripping, then shake it all off in a spray
function watersport(out, t, a, g, c) {
  const ramp = tide(c)
  for (const h of SPORT_HOPS) {
    const f = phase(t, h, h + 6)
    if (f > 0 && f < 1) {
      out.dy = -Math.round(3 * Math.sin(f * Math.PI))
      if (t === h + 5) {
        out.sy = 0.9
        out.sx = 1.06
      }
    }
    // Each landing throws a fan of water up both sides
    for (const way of [-1, 1]) {
      spray(out, t, a.seed, g.cx + way * ((g.right - g.left) / 2 + 1), g.ground - 1, g.ground, ramp, {
        count: 9, start: h + 5, gap: 0.2, life: 10, up: 1.4, wide: 0.5, lean: way * 0.6, salt: h * 3 + way,
      })
    }
  }
  const wet = phase(t, SPORT_HOPS[0] + 5, SPORT_HOPS[2] + 6) * (1 - phase(t, SPORT_SHAKE, SPORT_DRY))
  if (wet > 0) {
    out.shade = (x, y, col) => {
      if (luma(col) < 60) return col
      const drip = (x * 7 + Math.floor(y + t * 0.5)) % 13 === 0
      return drip ? mix(col, WHITE, 0.7 * wet) : mix(col, ramp[0], 0.15 * wet)
    }
  }

  // Shaking off: a fast wobble that flings droplets out level both ways
  if (t >= SPORT_SHAKE && t < SPORT_DRY) {
    const amp = 2 * (1 - phase(t, SPORT_SHAKE, SPORT_DRY))
    out.skew = (y) => Math.sin(y * 0.9 + t * 2.5) * amp
  }
  emit(t, { count: 22, gap: 0.4, start: SPORT_SHAKE, life: 9 }, (i, age, f) => {
    const way = i % 2 ? 1 : -1
    const y0 = g.top + 1 + rnd(a.seed, i, 21) * (g.bottom - g.top - 2)
    const x0 = way > 0 ? g.right + 1 : g.left - 1
    const x = x0 + way * age * (1 + rnd(a.seed, i, 22))
    const y = y0 - age * 0.3 + 0.12 * age * age
    if (y < g.ground) dot(out, x, y, f < 0.4 ? WHITE : ramp[1])
  })

  // The puddle under the feet, splashing wider on each stomp
  const pool = phase(t, 2, SPORT_HOPS[0] + 5)
  if (pool > 0) {
    const w = (g.right - g.left + 6) * pool + (t >= SPORT_HOPS[0] + 5 ? 4 : 0)
    puddle(out, g.cx, g.ground, w, ramp, phase(t, SPORT_DRY, a.ticks))
  }
}

const PULSE_FIRE = 10
const PULSE_HIT = 22

// Rings of water shrink into a throbbing orb at the mouth, which flies out shedding
// ripples behind it and bursts on the target in rings that roll outward
function waterpulse(out, t, a, g, c) {
  const ramp = tide(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  if (t >= 2 && t < PULSE_FIRE) out.sy = 1 + 0.05 * phase(t, 2, PULSE_FIRE)
  else if (t >= PULSE_FIRE && t < PULSE_FIRE + 3) out.dx = -g.side * [2, 1, 1][t - PULSE_FIRE]

  // Rings closing in on the mouth
  for (const born of [1, 4, 7]) {
    const r = 7 - (t - born) * 1.6
    if (t >= born && r > 1) ring(out, mx + g.side, my, r, r < 3 ? WHITE : ramp[1])
  }
  const at = (k) => {
    const f = easeIn(phase(k, PULSE_FIRE, PULSE_HIT))
    return [lerp(mx + g.side * 2, tx, f), lerp(my, ty, f)]
  }
  if (t >= 4 && t < PULSE_HIT) {
    const [x, y] = t < PULSE_FIRE ? [mx + g.side * 2, my] : at(t)
    const r = t < PULSE_FIRE ? 1 + 1.5 * phase(t, 4, PULSE_FIRE) : 2.4 + (t % 3 === 0 ? 0.8 : 0)
    disc(out, x, y, r + 1, ramp[3])
    disc(out, x, y, r, ramp[1])
    disc(out, x - 0.5, y - 0.5, r * 0.45, WHITE)
  }
  // Ripples left behind the orb as it travels, widening and fading
  emit(t, { count: 4, gap: 3, start: PULSE_FIRE + 1, life: 7 }, (i, age, f) => {
    const [x, y] = at(PULSE_FIRE + 1 + i * 3)
    ring(out, x, y, 2 + age * 0.8, f < 0.5 ? ramp[1] : ramp[3], g.side > 0 ? Math.PI : 0, 1.1)
  })

  // The burst: rings rolling out from the hit, the inner ones bright
  const hit = t - PULSE_HIT
  if (hit === 0 || hit === 1) out.shake = [hit ? -g.side : g.side, 0]
  if (hit >= 0 && hit < 3) disc(out, tx, ty, 3 - hit, WHITE)
  // Wobbling rings of water rolling out, bright while young and breaking up as they go
  for (const delay of [0, 4]) {
    const age = hit - delay
    if (age < 0 || age >= 9) continue
    const r = 3 + age * 1.2
    const col = age < 3 ? WHITE : age < 6 ? ramp[1] : ramp[2]
    const steps = Math.ceil(r * 7)
    for (let k = 0; k < steps; k++) {
      const angle = (k / steps) * TAU
      if (age >= 6 && k % 2) continue
      const rr = r + Math.sin(angle * 5 + age) * 0.7 * phase(age, 2, 5)
      dot(out, tx + Math.cos(angle) * rr, ty + Math.sin(angle) * rr * 0.8, col)
      if (age < 6) dot(out, tx + Math.cos(angle) * (rr - 1), ty + Math.sin(angle) * (rr - 1) * 0.8, ramp[3])
    }
  }
  spray(out, t, a.seed, tx, ty, g.ground, ramp, { count: 14, start: PULSE_HIT, gap: 0, life: 10, up: 1, wide: 1.2, salt: 70 })
}

const POOL_FORM = 6
const POOL_FULL = 16
const POOL_FALL = 38

// Circle the arms to stir up a vortex at the target, a funnel of water spinning up
// around it ever faster, then let it collapse in a burst
function whirlpool(out, t, a, g, c) {
  const ramp = tide(c)
  const { x: tx } = g.target
  const stir = phase(t, 1, 4) * (1 - phase(t, POOL_FALL - 2, POOL_FALL + 2))
  if (stir > 0) {
    out.skew = lean(g, Math.cos(t * 0.6) * 1.5 * stir)
    out.dy = -Math.round((Math.sin(t * 0.6) * 0.5 + 0.5) * stir)
  }
  const grow = easeOut(phase(t, POOL_FORM, POOL_FULL))
  const fall = easeIn(phase(t, POOL_FALL, POOL_FALL + 6))
  const tall = Math.min(g.ground - 2, 14) * grow * (1 - fall)
  const spin = t * (0.35 + 0.35 * phase(t, POOL_FORM, POOL_FALL))
  const wide = clamp(g.reach / 3, 4, 7)

  // Water spiraling in from the mouth to feed the vortex
  emit(t, { count: 14, gap: 1, start: 2, life: 8 }, (i, age, f) => {
    if (t - age >= POOL_FALL) return
    const x = lerp(g.mouth.x, tx, f)
    const y = g.mouth.y + Math.sin(f * TAU + i) * 2 + f * 3
    dot(out, x, y, f < 0.5 ? ramp[1] : ramp[2])
  })

  // The funnel: wide at the top and tight at the bottom, with spiral bands of foam
  // racing round it so it reads as spinning. Gaps between bands let the target show.
  const base = g.ground
  for (let k = 0; k <= tall; k++) {
    const y = base - k
    const r = 1 + wide * (k / Math.max(1, tall)) ** 0.8
    for (let px = -Math.ceil(r); px <= Math.ceil(r); px++) {
      const u = clamp(px / r, -1, 1)
      if (Math.abs(px) > r + 0.3) continue
      const around = Math.acos(u) * g.side + spin * (1.6 - k / 25) + k * 0.45
      const band = (Math.sin(around * 3) + 1) / 2
      const rim = Math.abs(u) > 0.8
      if (!rim && band < 0.45) continue
      const col = rim ? (u * g.side > 0 ? ramp[3] : ramp[2]) : band > 0.85 ? ramp[0] : band > 0.6 ? ramp[1] : ramp[2]
      dot(out, tx + px, y, col)
    }
  }
  // The swirling mouth of the funnel and the eddy on the water around its base
  if (grow > 0 && fall < 1) {
    if (tall > 2) {
      loop(tx, base - tall - 1, wide + 1, 1.5, -spin * g.side, (x, y, near, k) => {
        dot(out, x, y, near ? (k % 4 ? ramp[0] : WHITE) : ramp[1])
      })
    }
    loop(tx, base - 1, wide + 3, 1.5, spin, (x, y, near, k) => {
      if (k % 3 === 0) return
      dot(out, x, y, near ? (k % 4 ? ramp[1] : WHITE) : ramp[3])
    })
  }
  // Foam flung off the rim of the funnel
  emit(t, { count: 18, gap: 1.2, start: POOL_FULL - 4, life: 5 }, (i, age, f) => {
    if (t - age >= POOL_FALL) return
    const angle = rnd(a.seed, i, 2) * TAU + age * 0.5
    const r = wide + 1 + age * 0.8
    dot(out, tx + Math.cos(angle) * r, base - tall - 1 + age * 0.5, f < 0.5 ? WHITE : ramp[1])
  })
  const crash = t - POOL_FALL - 5
  if (crash === 0 || crash === 1) out.shake = [0, crash ? -1 : 1]
  spray(out, t, a.seed, tx, base - 2, g.ground, ramp, { count: 26, start: POOL_FALL + 5, gap: 0.2, life: 11, up: 1.3, wide: 1, salt: 80 })
  if (t >= POOL_FALL + 5) puddle(out, tx, g.ground, wide * 2 + 4, ramp, phase(t, a.ticks - 6, a.ticks))
}

const JET_GO = 5
const JET_HIT = 9
const JET_HOME = 24

// How far forward the jet has carried the mon at tick t
function jetDash(t, far) {
  if (t < JET_GO) return -Math.round(easeOut(phase(t, 1, JET_GO)))
  if (t < JET_HIT) return Math.round(lerp(-1, far, easeIn((t - JET_GO + 1) / (JET_HIT - JET_GO))))
  if (t < JET_HIT + 2) return far
  return Math.round(far * (1 - easeInOut(phase(t, JET_HIT + 2, JET_HOME))))
}

// Crouch as water blasts out behind, then rocket forward on a twisting jet trail,
// smash into the target in a ring of spray and glide home
function aquajet(out, t, a, g, c) {
  const ramp = tide(c)
  const far = clamp(g.reach - 5, 2, 12)
  out.dx = g.side * jetDash(t, far)
  if (t < JET_GO) out.sy = 1 - 0.08 * phase(t, 1, JET_GO)
  else if (t < JET_HIT) {
    out.sx = 1.1
    out.sy = 0.94
    out.ghosts = [1, 2].map((k) => ghost(g.side * jetDash(t - k, far), 0, light(c, 0.3 * k), 0.5 + 0.15 * k))
  } else if (t < JET_HIT + 2) {
    out.sx = 0.88
    out.sy = 1.05
  }
  const rear = (g.side > 0 ? g.left : g.right) + out.dx - g.side
  const y0 = Math.round((g.mouth.y + g.bottom) / 2)

  // Water thrusting out of the rear, then a twisting trail back along the path
  if (t >= 1 && t < JET_HIT + 6) {
    const fade = phase(t, JET_HIT, JET_HIT + 6)
    const len = t < JET_GO ? 2 + t : Math.abs(out.dx) + 6
    for (let d = 0; d < len * (1 - fade); d++) {
      const x = rear - g.side * d
      for (const s of [0, Math.PI]) {
        const y = y0 + Math.sin(d * 0.6 - t * 1.4 + s) * Math.min(2.5, 0.8 + d * 0.25)
        const near = Math.cos(d * 0.6 - t * 1.4 + s) > 0
        dot(out, x, y, d < 2 ? WHITE : near ? ramp[0] : ramp[2])
      }
      if (d % 2 === 0) dot(out, x, y0, ramp[1])
    }
  }
  // Drops shed from the trail
  emit(t, { count: 12, gap: 0.6, start: JET_GO, life: 7 }, (i, age, f) => {
    const x = rear - g.side * (rnd(a.seed, i, 5) * 8)
    dot(out, x, y0 + 1 + age * 0.5 + 0.1 * age * age, f < 0.5 ? ramp[1] : ramp[2])
  })
  const hit = t - JET_HIT
  const hx = g.mouth.x + g.side * (far + 1)
  if (hit === 0 || hit === 1) out.shake = [hit ? -g.side : g.side * 2, 0]
  if (hit >= 0 && hit < 6) {
    const r = 1.5 + hit * 1.2
    loop(hx, y0 - 1, r * 0.5, r, 0, (x, y, near, k) => k % (hit < 3 ? 1 : 2) === 0 && dot(out, x, y, hit < 2 ? WHITE : ramp[1]))
  }
  spray(out, t, a.seed, hx, y0 - 1, g.ground, ramp, { count: 16, start: JET_HIT, gap: 0, life: 10, up: 1.2, wide: 0.9, lean: g.side * 0.5, salt: 90 })
}

const RING_FORM = 10
const RING_LIFT = 36

// Face out while a ring of water spirals in and wraps round the waist, beads of light
// streaming round it and healing bubbles rising, then it lifts and melts into glitter
function aquaring(out, t, a, g, c) {
  const ramp = tide(c)
  const half = (g.right - g.left) / 2
  const form = easeOut(phase(t, 1, RING_FORM))
  const lift = easeIn(phase(t, RING_LIFT, a.ticks - 3))
  const glowF = phase(t, RING_FORM - 2, RING_FORM + 4) * (1 - phase(t, RING_LIFT, a.ticks - 2))
  if (glowF > 0) out.shade = glow(ramp[1], 0.12 + 0.1 * glowF * (0.5 + 0.5 * Math.sin(t * 0.5)))
  if (t >= RING_FORM && t < RING_LIFT) out.dy = -Math.round(0.5 + 0.5 * Math.sin(t * 0.4))

  const rx = (half + 3) + (1 - form) * 8
  const ry = 2 + (1 - form) * 2
  const cy = lerp(g.bottom - (g.bottom - g.top) * 0.35, g.top - 2, lift)
  const tilt = Math.sin(t * 0.25) * 0.8
  if (lift < 1 && t >= 1) {
    loop(g.cx, cy, rx * (1 - lift * 0.4), ry, t * 0.3, (x, y, near, k, angle) => {
      if (lift > 0.3 && rnd(a.seed, k, t) < lift) return
      const yy = y + tilt * Math.cos(angle)
      const bead = Math.cos(angle - t * 0.45) > 0.85
      if (near) {
        dot(out, x, yy, bead ? WHITE : ramp[1])
        dot(out, x, yy + 1, ramp[3])
      } else back(out, x, yy, ramp[2])
    })
  }
  // Bubbles rising off the ring, wobbling
  emit(t, { count: 12, gap: 2, start: RING_FORM, life: 10 }, (i, age, f) => {
    if (t - age >= RING_LIFT) return
    const angle = rnd(a.seed, i, 6) * Math.PI
    const x = g.cx + Math.cos(angle) * rx + Math.sin(age * 0.8 + i) * 0.7
    const y = cy + Math.sin(angle) * ry - age * 0.9
    if (f < 0.75) ring(out, x, y, 1, i % 2 ? ramp[1] : ramp[0])
    else dot(out, x, y, WHITE)
  })
  if (t >= RING_LIFT) sparkles(out, t, a.seed, g.cx, cy, rx * 2, 5, ramp[1], 5)
}

const BRINE_FORM = 10
const BRINE_BURST = 14
const BRINE_STING = 20

// A salt crystal: a white glint with a pale face and a shadowed corner
function crystal(out, x, y, deep) {
  dot(out, x, y, WHITE)
  dot(out, x + 1, y, 0xd8e4ec)
  dot(out, x + 1, y + 1, deep)
}

// Hunch and churn up a ball of seawater thick with salt, then burst it in a cone of
// briny spray at the target, where salt crystals crust over and sting in flashes
function brine(out, t, a, g, c) {
  const ramp = tide(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const ox = mx + g.side * 2
  if (t >= 1 && t < BRINE_BURST) {
    const f = phase(t, 1, BRINE_FORM)
    out.sy = 1 - 0.06 * f
    out.dx = t >= BRINE_FORM ? tremble(t) : 0
  } else if (t >= BRINE_BURST && t < BRINE_BURST + 3) {
    out.dx = -g.side * [2, 2, 1][t - BRINE_BURST]
    out.skew = lean(g, -g.side * 2)
  }

  // The churning ball, salt grains swirling inside it
  if (t >= 2 && t < BRINE_BURST) {
    const r = 1 + 2.2 * easeOut(phase(t, 2, BRINE_FORM))
    disc(out, ox, my, r + 1, ramp[4])
    disc(out, ox, my, r, ramp[2])
    disc(out, ox, my, r * 0.55, ramp[1])
    for (let k = 0; k < 3; k++) {
      const angle = t * 0.9 + (k * TAU) / 3
      dot(out, ox + Math.cos(angle) * r * 0.7, my + Math.sin(angle) * r * 0.7, WHITE)
    }
  }
  // The cone of spray: droplets fanning out toward the target, salt mixed in. Each
  // one is soaked up as it reaches the target.
  const dist = Math.max(3, Math.abs(tx - ox))
  emit(t, { count: 70, gap: 0.09, start: BRINE_BURST, life: 7 }, (i, age, f) => {
    const lane = (rnd(a.seed, i, 31) - 0.5) * 2
    const d = age * (2.2 + rnd(a.seed, i, 32) * 1.4)
    if (d > dist + 2) return
    const x = ox + g.side * d
    const y = lerp(my, ty, d / dist) + lane * (1.5 + d * 0.55)
    if (y > g.ground) return
    if (i % 6 === 0) crystal(out, x, y, ramp[3])
    else {
      dot(out, x, y, f < 0.3 ? WHITE : i % 2 ? ramp[1] : ramp[0])
      dot(out, x - g.side, y, ramp[2])
    }
  })
  if (t === BRINE_BURST) disc(out, ox, my, 3, WHITE)
  if (t >= BRINE_BURST + 3 && t < BRINE_BURST + 8) crown(out, tx, ty, t, g.side, ramp)

  // Salt crusting on the target, each crystal stinging in a white flash
  const crust = t - BRINE_STING
  if (crust >= 0 && crust < 3) out.shake = [crust % 2 ? -g.side : g.side, 0]
  for (let i = 0; i < 12; i++) {
    const born = BRINE_STING + i
    const age = t - born
    if (age < 0 || t >= a.ticks - 4 + (i % 4)) continue
    const x = tx + (rnd(a.seed, i, 33) - 0.5) * 11
    const y = ty + (rnd(a.seed, i, 34) - 0.5) * 9
    const twinkle = (t + i * 3) % 7
    if (age < 2 || twinkle === 0) plus(out, x, y, ramp[0], WHITE)
    else crystal(out, x, y, ramp[3])
  }
  emit(t, { count: 8, gap: 1.5, start: BRINE_STING, life: 6 }, (i, age) => {
    dot(out, tx + (rnd(a.seed, i, 35) - 0.5) * 8, ty + 3 + age * 0.8, ramp[1])
  })
}

const TAIL_TURN = 3
const TAIL_SWING = 9
const TAIL_LOOSE = 13
const TAIL_HIT = 19
const TAIL_HOME = 30

// How far forward the tail swing has carried the mon at tick t
const tailPos = (t, far) => keys(t, [[0, 0], [TAIL_SWING, -1], [TAIL_LOOSE, far, easeOut], [TAIL_LOOSE + 3, far], [TAIL_HOME, 0]])

// A crescent of water centered on x, y, opening away from the target, its points
// trailing. Thick and white along the lead edge.
function sickle(out, x, y, r, from, to, side, ramp) {
  const steps = Math.ceil(r * (to - from) * 1.5)
  for (let k = 0; k <= steps; k++) {
    const angle = lerp(from, to, k / steps)
    const thick = Math.max(0.5, 2.4 * Math.sin((k / steps) * Math.PI))
    for (let w = 0; w <= thick; w++) {
      const col = w === 0 ? WHITE : w < 1.5 ? ramp[0] : w < 2.5 ? ramp[1] : ramp[2]
      dot(out, x + side * Math.cos(angle) * (r - w), y + Math.sin(angle) * (r - w), col)
    }
  }
}

// Turn tail as water spirals up around it, then whip round so the tail cuts a great
// crescent of water that flies off as a blade and breaks over the target
function aquatail(out, t, a, g, c) {
  const ramp = tide(c)
  const far = clamp(g.reach - 9, 1, 5)
  out.dx = Math.round(g.side * tailPos(t, far))
  out.flipX = t >= TAIL_TURN && t < TAIL_LOOSE + 4
  if (t >= TAIL_SWING - 2 && t < TAIL_SWING) out.skew = lean(g, g.side * 2)
  else if (t >= TAIL_SWING && t < TAIL_LOOSE) out.skew = lean(g, -g.side * 2.5)

  // With its back turned, the tail is the edge facing the target
  const tail = (g.side > 0 ? g.right : g.left) + out.dx
  const ty = Math.round((g.mouth.y + g.bottom) / 2) + 1
  if (t >= TAIL_TURN && t < TAIL_SWING) {
    for (let k = 0; k < 3; k++) {
      const angle = t * 0.8 + (k * TAU) / 3
      const r = 3 - phase(t, TAIL_TURN, TAIL_SWING)
      plus(out, tail + Math.cos(angle) * r, ty + Math.sin(angle) * r, ramp[1], WHITE)
    }
  }
  // The swing sweeps the crescent open from above to below in front of the tail
  const r = clamp(Math.round((g.bottom - g.top) * 0.55), 5, 8)
  if (t >= TAIL_SWING && t < TAIL_LOOSE) {
    const sweep = easeOut(phase(t, TAIL_SWING, TAIL_LOOSE))
    sickle(out, tail - g.side * 2, ty, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * sweep, g.side, ramp)
  }
  // Then it flies off on its own, shedding drops, and breaks on the target
  const fly = phase(t, TAIL_LOOSE, TAIL_HIT)
  const cx = lerp(tail - g.side * 2, g.target.x - g.side * r, easeIn(fly))
  if (t >= TAIL_LOOSE && t < TAIL_HIT) {
    sickle(out, cx, ty, r, -Math.PI / 2, Math.PI / 2, g.side, ramp)
    for (let k = 1; k <= 3; k++) dot(out, cx - g.side * k * 2, ty + (k % 2 ? -r + 1 : r - 1), ramp[1])
  }
  const hit = t - TAIL_HIT
  const hx = g.target.x
  if (hit === 0 || hit === 1) out.shake = [hit ? -g.side : g.side * 2, 1]
  if (hit >= 0 && hit < 3) {
    for (let k = -r; k <= r; k++) dot(out, hx, ty + k, hit ? ramp[0] : WHITE)
  }
  if (hit >= 1 && hit < 5) crown(out, hx, ty, t, g.side, ramp)
  spray(out, t, a.seed, hx, ty - 2, g.ground, ramp, { count: 24, start: TAIL_HIT, gap: 0.2, life: 12, up: 1.4, wide: 0.9, lean: g.side * 0.4, salt: 100 })
  if (hit >= 4) puddle(out, hx, g.ground, 7, ramp, phase(t, a.ticks - 6, a.ticks))
}

const MUD_WELL = 6
const MUD_SURGE = 24
const MUD_DRAIN = 36

// Brown mud with a wet sheen: shine, light, the color, dark, and the depths
const mudOf = (c) => [mix(light(c, 0.5), 0xb8d8ff, 0.35), light(c, 0.2), c, dark(c, 0.35), dark(c, 0.6)]

// Stamp and churn up a thick, lumpy flood of mud that rolls along the ground, rears
// into a wall over the target and slaps down in splats, then drains away
function muddywater(out, t, a, g, c) {
  const mud = mudOf(c)
  if (t < MUD_WELL) {
    out.dy = -Math.round(2 * Math.sin(phase(t, 0, MUD_WELL) * Math.PI))
  } else if (t < MUD_WELL + 3) {
    out.sy = [0.88, 0.94, 1][t - MUD_WELL]
    out.sx = [1.08, 1.04, 1][t - MUD_WELL]
  }
  if (t >= MUD_WELL && t < MUD_DRAIN) out.shake = [0, t % 3 === 0 ? 1 : 0]

  const start = g.cx
  const tx = g.target.x
  const front = lerp(start, tx, easeInOut(phase(t, MUD_WELL, MUD_SURGE)))
  const drain = easeIn(phase(t, MUD_DRAIN, a.ticks - 2))
  const surge = Math.sin(phase(t, MUD_SURGE - 3, MUD_DRAIN) * Math.PI)
  const roll = 1 - phase(t, MUD_SURGE - 2, MUD_SURGE + 2)
  const wall = clamp(g.ground - g.target.y + 4, 7, 12)
  const behind = (g.right - g.left) / 2 + 3
  if (t >= MUD_WELL) {
    for (let x = 0; x < g.columns; x++) {
      const s = (x - start) * g.side
      const lead = (front - x) * g.side
      if (s < -behind || lead < -3) continue
      // A low churning flood, a rolling head at its front, and the surge at the target
      const churn = 2 + Math.sin(x * 0.9 + t * 0.7) * 0.7 + rnd(a.seed, x, t >> 1) * 0.8
      const head = (4 + Math.sin(t * 0.9)) * roll * Math.exp(-(((x - front) / 3.5) ** 2))
      // The surge has a long back and a steep face, like a breaking wave
      const off = (x - tx) * g.side
      const rise = wall * surge * Math.exp(-((off / (off < 0 ? 6 : 2.5)) ** 2))
      const h = Math.round((clamp(lead + 3, 0, churn) + head + rise) * (1 - drain))
      const nearT = Math.abs(x - tx) < 6
      for (let k = 0; k < h; k++) {
        const depth = h - 1 - k
        const shine = (depth === 0 && (x * g.side - t * 2) % 3 === 0) || (depth === 2 && (x * g.side - t) % 7 === 0)
        const col = shine ? mud[0] : depth === 0 ? mud[1] : depth === 1 ? mud[2] : rnd(a.seed, x * 7 + k, t >> 2) < 0.25 ? mud[2] : mud[3]
        const paint = (s < behind && k < 3) || nearT ? dot : back
        paint(out, x, g.ground - k, depth > 4 && k < 1 ? mud[4] : col)
      }
      // Gobs tossed off the tumbling head, and a lip curling off the crest of the surge
      if (head > 2 && rnd(a.seed, x, t) < 0.3) dot(out, x - g.side, g.ground - h - 1, mud[1])
      if (rise > 4 && off >= 0 && off < 3) {
        for (let j = 0; j < 3 - off; j++) dot(out, x + g.side * (j + 1), g.ground - h + 1 + j, j ? mud[1] : mud[0])
      }
    }
  }
  // Muddy spray flung forward off the rolling head
  emit(t, { count: 30, gap: 0.5, start: MUD_WELL + 2, life: 7 }, (i, age, f) => {
    const born = t - age
    if (born >= MUD_SURGE) return
    const x0 = lerp(start, tx, easeInOut(phase(born, MUD_WELL, MUD_SURGE)))
    const x = x0 + g.side * age * (0.6 + rnd(a.seed, i, 45) * 0.6)
    const y = g.ground - 5 - age * (0.8 + rnd(a.seed, i, 46)) + 0.2 * age * age
    if (y < g.ground) dot(out, x, y, f < 0.5 ? mud[1] : mud[2])
  })
  // Splats of mud slapping down on the target as the wall breaks
  emit(t, { count: 14, gap: 0.5, start: MUD_SURGE + 2, life: 10 }, (i, age) => {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, 41) - 0.5) * 2.6
    const speed = 1 + rnd(a.seed, i, 42)
    const x = tx + Math.cos(angle) * speed * age
    const y = Math.min(g.ground, g.ground - wall + Math.sin(angle) * speed * age + 0.2 * age * age)
    disc(out, x, y, i % 3 ? 0.8 : 1.3, i % 2 ? mud[2] : mud[3])
  })
  if (t >= MUD_DRAIN) {
    for (let i = 0; i < 6; i++) {
      if (rnd(a.seed, i, 43) < drain * 1.2 - 0.2) continue
      const x = tx + (rnd(a.seed, i, 44) - 0.5) * 12
      dot(out, x, g.ground, mud[3])
      dot(out, x + 1, g.ground, mud[2])
    }
  }
}

const SPOUT_DRAW = 10
const SPOUT_BLOW = 13
const SPOUT_LAND = 19
const SPOUT_STOP = 38

// Draw in a huge breath, then blow a thick fountain up out of the head that arches
// high over the strip and comes down on the target in a pounding cascade and a
// rain of heavy drops
function waterspout(out, t, a, g, c) {
  const ramp = tide(c)
  const head = topOf(g)
  const tx = g.target.x
  const land = Math.min(g.ground - 1, g.target.y + 2)
  if (t < SPOUT_DRAW) {
    const f = easeOut(phase(t, 1, SPOUT_DRAW))
    out.sx = 1 + 0.08 * f
    out.sy = 1 + 0.06 * f
  } else if (t < SPOUT_BLOW) {
    out.sx = 1.08
    out.sy = 1.06
    out.dx = tremble(t)
  } else if (t < SPOUT_STOP) {
    const k = t - SPOUT_BLOW
    out.sy = k < 3 ? [0.86, 0.9, 0.95][k] : 0.97 + (t % 2) * 0.02
    out.sx = k < 3 ? [1.1, 1.06, 1.03][k] : 1
    out.dx = k < 4 ? 0 : t % 2 ? -g.side : 0
    if (k < 3) out.shake = [0, k % 2 ? -1 : 1]
  }

  // Swirls of water drawn in toward the head on the breath
  emit(t, { count: 12, gap: 0.6, start: 1, life: 6 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 51) * TAU
    const r = 9 * (1 - easeIn(f))
    dot(out, head.x + Math.cos(angle) * r, head.y + 3 + Math.sin(angle) * r * 0.6, f < 0.5 ? ramp[2] : ramp[1])
  })

  // The arch, from the head up to the top of the strip and down onto the target.
  // Its front runs out along the path, and its tail follows once it stops.
  // It shoots up to the top of the strip, rides along it, and plunges onto the target
  const peak = 1
  const path = (p) => {
    const x = lerp(head.x, tx, p)
    if (p < 0.15) return [x, lerp(head.y, peak, easeOut(p / 0.15))]
    return [x, lerp(peak, land, ((p - 0.15) / 0.85) ** 2.2)]
  }
  const front = easeOut(phase(t, SPOUT_BLOW, SPOUT_LAND))
  const tailF = easeIn(phase(t, SPOUT_STOP - 6, SPOUT_STOP + 2))
  if (t >= SPOUT_BLOW && tailF < 1) {
    const steps = Math.ceil(Math.abs(tx - head.x) * 2.5 + 20)
    for (let k = Math.ceil(tailF * steps); k <= front * steps; k++) {
      const p = k / steps
      const [x, y] = path(p)
      const flow = (k - t * 3) % 9
      const w = 1 + p * 1.2 + rnd(a.seed, k, t) * 0.6
      dot(out, x, y - w, flow === 0 ? WHITE : ramp[0])
      dot(out, x, y, flow < 3 ? ramp[0] : ramp[1])
      dot(out, x, y + 1, ramp[2])
      dot(out, x, y + w, ramp[3])
      if (rnd(a.seed, k, t) < 0.08) dot(out, x - g.side, y + w + 1 + (t % 3), ramp[1])
    }
    if (front < 1) disc(out, ...path(front), 1.5, WHITE)
  }
  if (t >= SPOUT_BLOW && t < SPOUT_STOP) puff(out, head.x, head.y - 1, 2, ramp[1], a.seed + (t >> 1))

  // Pounding down on the target, it throws up foam and splashes drops all round
  const pound = t - SPOUT_LAND
  if (pound >= 0 && t < SPOUT_STOP) {
    puff(out, tx, land - 1, 2.5 + (t % 3 === 0 ? 1 : 0), ramp[0], a.seed + t)
    if (pound % 4 === 0) out.shake = [g.side, 1]
  }
  spray(out, t, a.seed, tx, land - 2, g.ground, ramp, { count: 50, start: SPOUT_LAND, gap: 0.38, life: 12, up: 1.4, wide: 1.1, salt: 54 })
  emit(t, { count: 30, gap: 0.6, start: SPOUT_LAND, life: 10 }, (i, age) => {
    if (SPOUT_LAND + i * 0.6 > SPOUT_STOP) return
    const x = tx + (rnd(a.seed, i, 52) - 0.5) * 16
    const y = -1 + age * 2.6
    if (y < g.ground - 1) drop(out, x, y, ramp)
    else if (y < g.ground + 3) {
      dot(out, x - 1, g.ground - 1, ramp[0])
      dot(out, x + 2, g.ground - 1, ramp[0])
    }
  })
  if (pound >= 4) puddle(out, tx, g.ground, 15, ramp, phase(t, a.ticks - 8, a.ticks))
}

const SHELL_FORM = 7
const SHELL_CUTS = [11, 17]
const SHELL_HOME = 32

// A scallop shell blade hinged at x, y: a fan of ribs opening toward `angle` (0 is
// straight at the target, positive is down), with a dark outline and a glinting rim
function scallop(out, x, y, r, angle, side, pal, gleam) {
  const inside = (px, py) => {
    const d = Math.hypot(px, py)
    return d <= r && Math.abs(Math.atan2(py, side * px) - angle) <= 1.2
  }
  for (let py = -Math.ceil(r); py <= r; py++) {
    for (let px = -Math.ceil(r); px <= r; px++) {
      if (!inside(px, py)) continue
      const edge = !inside(px + 1, py) || !inside(px - 1, py) || !inside(px, py + 1) || !inside(px, py - 1)
      const rib = Math.floor(((Math.atan2(py, side * px) - angle + 1.2) / 2.4) * 7) % 2
      const rim = Math.hypot(px, py) > r - 1.2
      dot(out, x + px, y + py, edge ? (rim ? gleam : pal[3]) : rib ? pal[1] : pal[2])
    }
  }
  dot(out, x, y, pal[3])
}

// How far forward the slashes have carried the mon at tick t
const shellPos = (t, far) => keys(t, [[0, 0], [SHELL_FORM, -1], [SHELL_CUTS[0], far, easeOut], [SHELL_CUTS[1] + 3, far], [SHELL_HOME, 0]])

// Raise a gleaming shell blade, dash in, and slash twice in an X, each cut leaving a
// line of white edged water, then step home as the X splashes apart
function razorshell(out, t, a, g, c) {
  const ramp = tide(c)
  const far = clamp(g.reach - 8, 1, 9)
  out.dx = Math.round(g.side * shellPos(t, far))
  const hx = g.ahead(far + 3)
  const hy = Math.round((g.mouth.y + g.target.y) / 2)

  // The blade, held up in front, flashing along its edge
  if (t >= 2 && t < SHELL_CUTS[1] + 2) {
    // Raised high, swung down through the first cut, up through the second
    const swing = keys(t, [[2, -1.1], [SHELL_CUTS[0] - 1, -1.1], [SHELL_CUTS[0] + 1, 0.9], [SHELL_CUTS[1] - 1, 0.9], [SHELL_CUTS[1] + 1, -0.9]])
    const gleam = (t >> 1) % 3 === 0 ? WHITE : light(c, 0.6)
    const size = clamp(Math.round((g.bottom - g.top) * 0.3), 3, 5) * easeOut(phase(t, 2, SHELL_FORM))
    scallop(out, g.mouth.x + out.dx, g.mouth.y + 1, size, swing, g.side, [WHITE, light(c, 0.3), c, dark(c, 0.55)], gleam)
  }
  if (t >= 2 && t < 5) spark(out, g.mouth.x + g.side * 4, g.mouth.y - 3, 2, ramp[1])

  // Each cut: a diagonal slash drawn in fast, then splitting into droplets
  SHELL_CUTS.forEach((at, k) => {
    const age = t - at
    if (age < 0 || age > 12) return
    const dir = k ? 1 : -1
    const len = 6
    const grow = Math.min(1, (age + 1) / 2)
    for (let d = -len; d <= len * (2 * grow - 1); d++) {
      if (age > 4 && (d + age) % 2) continue
      const x = hx + g.side * d * 0.8
      const y = hy + dir * d * 0.8
      const col = age < 3 ? WHITE : age < 6 ? ramp[0] : ramp[1]
      dot(out, x, y, col)
      if (age < 5) dot(out, x, y + 1, ramp[2])
    }
    if (age === 0) out.shake = [g.side * (k ? 2 : 1), 0]
    spray(out, t, a.seed, hx, hy, g.ground, ramp, { count: 8, start: at + 1, gap: 0, life: 9, up: 1, wide: 1.4, salt: 110 + k })
  })
}

const DIVE_JUMP = 5
const DIVE_SPLASH = 12
const DIVE_RISE = 30
const DIVE_HIT = 33
const DIVE_HOME = 46

// Leap up and plunge into a pool that opens under the feet, swim unseen beneath the
// ground in a line of bubbles, burst up under the target in a column of water, then
// arc back home
function dive(out, t, a, g, c) {
  const ramp = tide(c)
  const depth = g.ground - g.top + 2
  const half = (g.right - g.left) / 2
  const shift = g.side * clamp(g.reach - Math.round(half) - 1, 2, 16)
  const to = g.cx + shift

  if (t < DIVE_JUMP) {
    out.sy = 1 - 0.1 * phase(t, 1, DIVE_JUMP)
  } else if (t < DIVE_SPLASH) {
    const f = phase(t, DIVE_JUMP, DIVE_SPLASH)
    out.dy = Math.round(-5 * Math.sin(f * Math.PI * 0.75) + (f > 0.6 ? easeIn((f - 0.6) / 0.4) * depth : 0))
    out.flipY = f > 0.55
    out.sy = f > 0.55 ? 1.1 : 1
  } else if (t < DIVE_RISE) {
    out.hidden = true
  } else if (t < DIVE_HOME) {
    const rise = easeOut(phase(t, DIVE_RISE, DIVE_HIT + 1))
    const home = easeInOut(phase(t, DIVE_HIT + 3, DIVE_HOME))
    out.dx = Math.round(shift * (1 - home))
    out.dy = Math.round(lerp(depth, -4, rise) * (1 - home) - 4 * Math.sin(home * Math.PI))
    if (t < DIVE_HIT + 2) {
      out.sy = 1.12
      out.sx = 0.92
    }
  } else if (t < DIVE_HOME + 3) {
    out.sy = [0.88, 0.94, 1][t - DIVE_HOME]
    out.sx = [1.08, 1.04, 1][t - DIVE_HOME]
  }

  // The pool, opening under the mon and closing after it, then one under the target
  const pool = phase(t, 1, DIVE_JUMP) * (1 - phase(t, DIVE_SPLASH + 4, DIVE_SPLASH + 10))
  if (pool > 0) {
    for (let k = -Math.round((half + 3) * pool); k <= (half + 3) * pool; k++) {
      dot(out, g.cx + k, g.ground, (k + t) % 5 ? ramp[3] : ramp[1])
      dot(out, g.cx + k, g.ground - 1, Math.abs(k) > (half + 2) * pool ? ramp[1] : ramp[4])
    }
  }
  const splash = t - DIVE_SPLASH
  if (splash >= 0 && splash < 4) crown(out, g.cx, g.ground - 2, t, g.side, ramp)
  spray(out, t, a.seed, g.cx, g.ground - 2, g.ground, ramp, { count: 16, start: DIVE_SPLASH, gap: 0, life: 10, up: 1.3, wide: 0.8, salt: 120 })

  // Bubbles and a ripple marking the path under the ground
  if (t >= DIVE_SPLASH + 2 && t < DIVE_RISE) {
    const x = lerp(g.cx, to, easeInOut(phase(t, DIVE_SPLASH + 2, DIVE_RISE - 2)))
    for (let k = -3; k <= 3; k++) {
      dot(out, x + k, g.ground, Math.abs(k) === 3 ? ramp[3] : ramp[1])
      if (Math.abs(k) < 2) dot(out, x + k + tremble(t), g.ground - 1, k ? ramp[0] : WHITE)
    }
    emit(t, { count: 20, gap: 0.8, start: DIVE_SPLASH + 2, life: 6 }, (i, age) => {
      const bx = lerp(g.cx, to, easeInOut(phase(t - age, DIVE_SPLASH + 2, DIVE_RISE - 2))) + (rnd(a.seed, i, 61) - 0.5) * 4
      const by = g.ground - 2 - age * 1.2
      dot(out, bx + Math.sin(age + i), by, age < 3 ? ramp[0] : WHITE)
    })
    if (t >= DIVE_RISE - 4) out.shake = [t % 2 ? 1 : -1, 0]
  }

  // Bursting up: a column of water and a heavy spray
  const burst = t - DIVE_RISE
  if (burst >= 0 && burst < 9) {
    const h = Math.min(g.ground - 1, depth + 4) * (burst < 5 ? easeOut(phase(burst, 0, 3)) : 1 - phase(burst, 5, 9))
    const w = Math.max(2, half * 0.7)
    for (let k = 0; k < h; k++) {
      const ww = w + Math.sin(k * 0.9 + t) * 0.6
      for (let o = -Math.ceil(ww); o <= ww; o++) {
        const e = Math.abs(o) / ww
        const col = k > h - 2 ? WHITE : e > 0.8 ? ramp[3] : (k + t * 2) % 4 === 0 ? ramp[0] : e > 0.5 ? ramp[2] : ramp[1]
        back(out, to + o, g.ground - k, col)
      }
    }
    if (h > 3) puff(out, to, g.ground - h, 2.5, ramp[0], a.seed + t)
  }
  if (burst === 3 || burst === 4) out.shake = [burst === 3 ? g.side * 2 : -g.side, 1]
  spray(out, t, a.seed, to, g.ground - depth, g.ground, ramp, { count: 26, start: DIVE_HIT, gap: 0.2, life: 13, up: 1.2, wide: 1.3, salt: 130 })
  if (t >= DIVE_HIT + 2) puddle(out, to, g.ground, 11, ramp, phase(t, a.ticks - 6, a.ticks))
}

const SCALD_FIRE = 8
const SCALD_STOP = 24
const STEAM = [0xffffff, 0xe4e4e8, 0xb8b8c0]

// Boiling water: pale foam, a glowing orange heat, a deeper red heat, and the water's shadow
const boilOf = (c) => [light(c, 0.6), mix(c, 0xffa040, 0.75), mix(c, 0xff4a20, 0.7), dark(c, 0.4)]

// A wisp of steam curling up as it rises, thinning to nothing
function wisp(out, x, y, age, life, seed) {
  for (let k = 0; k < 3; k++) {
    const yy = y - age * 0.7 - k
    const xx = x + Math.sin(yy * 0.6 + seed) * 1.2
    if (age / life > 0.6 && (k + age) % 2) continue
    dot(out, xx, yy, STEAM[Math.min(2, k + Math.floor((age / life) * 2))])
  }
}

// Steam curls off the mouth as the water comes to the boil, then a hissing stream of
// scalding water lashes the target, which flushes red under clouds of steam
function scald(out, t, a, g, c) {
  const hot = boilOf(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const dist = Math.max(1, Math.abs(tx - mx))
  if (t >= 1 && t < SCALD_FIRE) {
    out.sy = 1 + 0.05 * phase(t, 1, SCALD_FIRE)
    out.shade = glow(hot[2], 0.15 * phase(t, 1, SCALD_FIRE))
  } else if (t >= SCALD_FIRE && t < SCALD_STOP) out.dx = (t >> 1) % 2 ? -g.side : 0

  emit(t, { count: 8, gap: 1, start: 1, life: 8 }, (i, age, f) => {
    if (t - age >= SCALD_FIRE) return
    wisp(out, mx + (rnd(a.seed, i, 71) - 0.5) * 3, my - 1, age, 8, i)
    if (f < 0.3) dot(out, mx, my, hot[2])
  })

  // The stream wavers and hisses, steam peeling off its top
  const front = Math.min(dist, (dist * (t - SCALD_FIRE + 1)) / 3)
  const tail = t < SCALD_STOP ? 0 : Math.min(dist, (dist * (t - SCALD_STOP + 1)) / 3)
  if (t >= SCALD_FIRE && tail < dist) {
    for (let d = Math.ceil(tail); d <= front; d++) {
      const x = g.ahead(d)
      const y = lerp(my, ty, d / dist) + Math.sin(d * 0.5 - t * 1.8) * 1.1
      dot(out, x, y - 1, (d + t) % 3 ? hot[0] : WHITE)
      dot(out, x, y, (d - t * 2) % 4 ? hot[1] : hot[2])
      dot(out, x, y + 1, hot[3])
    }
  }
  emit(t, { count: 20, gap: 0.8, start: SCALD_FIRE + 1, life: 9 }, (i, age) => {
    if (t - age >= SCALD_STOP) return
    const d = rnd(a.seed, i, 72) * dist
    wisp(out, g.ahead(d), lerp(my, ty, d / dist) - 2, age, 9, i)
  })

  // The target flushes and boils off in billows of steam
  const burn = t - SCALD_FIRE - 3
  if (burn >= 0 && t < SCALD_STOP + 2) {
    disc(out, tx, ty, 2.5 + (t % 3 === 0 ? 1 : 0), hot[2])
    disc(out, tx, ty, 1.5, hot[1])
    plus(out, tx, ty, hot[1], WHITE)
    if (burn % 4 === 0) out.shake = [g.side, 0]
  }
  emit(t, { count: 9, gap: 2.2, start: SCALD_FIRE + 4, life: 13 }, (i, age, f) => {
    const x = tx + (rnd(a.seed, i, 73) - 0.5) * 8 + Math.sin(age * 0.3 + i) * 1
    const y = ty - 1 - age * 0.8
    if (f < 0.85) puff(out, x, y, 1.2 + f * 2, f < 0.4 ? STEAM[1] : STEAM[2], a.seed + i)
  })
}

const SOAK_HOLD = 12
const SOAK_LAND = 22
const SOAK_POUR = 34

// Heave up a wobbling ball of water over the head, lob it high, and burst it over the
// target in a pouring curtain that leaves it dripping
function soak(out, t, a, g, c) {
  const ramp = tide(c)
  const head = topOf(g)
  const { x: tx, y: ty } = g.target
  const top = Math.max(3, head.y - 4)
  if (t < SOAK_HOLD) {
    const f = easeOut(phase(t, 1, SOAK_HOLD - 2))
    out.sy = 1 + 0.06 * f
    out.dy = -Math.round(f)
  } else if (t < SOAK_HOLD + 3) {
    out.sy = [0.9, 0.95, 1][t - SOAK_HOLD]
    out.skew = lean(g, g.side * 2)
  }

  // The ball over the head, then in flight, wobbling as it goes
  const r = 1.5 + 2 * easeOut(phase(t, 1, SOAK_HOLD - 2))
  const wob = Math.sin(t * 1.1) * 0.5
  const fly = phase(t, SOAK_HOLD, SOAK_LAND)
  if (t >= 1 && t < SOAK_LAND) {
    const x = lerp(head.x, tx, fly)
    const peak = Math.min(top - 3, ty - 10)
    const y = t < SOAK_HOLD ? top : lerp(top, ty - r - 2, fly) - 4 * fly * (1 - fly) * (top - Math.max(3, peak))
    for (let py = Math.floor(y - r - 1); py <= y + r + 1; py++) {
      for (let px = Math.floor(x - r - 1); px <= x + r + 1; px++) {
        const d = Math.hypot((px - x) / (r + wob), (py - y) / (r - wob))
        if (d > 1) continue
        const col = d > 0.75 ? ramp[3] : px < x && py < y ? (d < 0.4 ? WHITE : ramp[0]) : ramp[1]
        dot(out, px, py, col)
      }
    }
  }

  // A curtain pouring over the target, then drips and a puddle
  const pour = t - SOAK_LAND
  if (pour === 0) out.shake = [g.side, 1]
  if (pour >= 0 && t < SOAK_POUR) {
    const top2 = ty - 7
    const thin = phase(t, SOAK_POUR - 5, SOAK_POUR)
    // Streams of different lengths, a bright band running down each one
    for (let x = tx - 5; x <= tx + 5; x++) {
      if (rnd(a.seed, x, 82) < 0.25) continue
      const speed = 2.5 + rnd(a.seed, x, 83)
      const tail = top2 + thin * (g.ground - top2)
      const bottom = Math.min(g.ground, top2 + (pour - Math.abs(x - tx) * 0.4) * speed)
      for (let y = Math.ceil(tail); y <= bottom; y++) {
        const band = (y - t * 3 + x * 5) % 6
        dot(out, x, y, band === 0 ? WHITE : band === 1 ? ramp[0] : Math.abs(x - tx) > 3 ? ramp[2] : ramp[1])
      }
      if (bottom >= g.ground && tail < g.ground) dot(out, x + (x < tx ? -1 : 1), g.ground - 1 - (t + x) % 2, ramp[0])
    }
    if (pour < 3) burst(out, tx, top2, 4 - pour, ramp[1])
  }
  emit(t, { count: 8, gap: 1.2, start: SOAK_POUR - 2, life: 7 }, (i, age) => {
    dot(out, tx + (rnd(a.seed, i, 81) - 0.5) * 10, ty - 2 + age * age * 0.25, ramp[1])
  })
  if (pour >= 2) puddle(out, tx, g.ground, 13, ramp, phase(t, a.ticks - 6, a.ticks))
}

const OCTA_PUFF = 8
const OCTA_HIT = 13
const OCTA_FADE = 30

// Ink from the color: a sheen, a dark blue gleam, and the inky dark
const inkOf = (c) => [light(c, 0.55), light(c, 0.2), c, dark(c, 0.5), dark(c, 0.75)]

// Puff the cheeks up full, then fire a ball of ink that splatters over the target in
// a black cloud and runny streaks that drip and fade away
function octazooka(out, t, a, g, c) {
  const ink = inkOf(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  if (t < OCTA_PUFF) {
    const f = easeOut(phase(t, 1, OCTA_PUFF))
    out.sx = 1 + 0.1 * f
    out.sy = 1 + 0.08 * f
  } else if (t < OCTA_PUFF + 4) {
    const k = t - OCTA_PUFF
    out.dx = -g.side * [3, 2, 1, 1][k]
    out.sx = [0.9, 0.95, 1, 1][k]
    if (k === 0) out.shake = [-g.side, 0]
  }
  if (t >= 3 && t < OCTA_PUFF) disc(out, mx + g.side, my, 1 + (t - 3) * 0.3, ink[3])

  // The ink ball streaks out with a trail of spatter
  const fly = phase(t, OCTA_PUFF, OCTA_HIT)
  if (t >= OCTA_PUFF && t < OCTA_HIT) {
    const x = lerp(mx + g.side * 2, tx, fly)
    const y = lerp(my, ty, fly)
    disc(out, x, y, 3, ink[1])
    disc(out, x, y, 2.2, ink[3])
    dot(out, x - 1, y - 1, ink[0])
    dot(out, x, y - 1, ink[1])
    for (let k = 1; k < 4; k++) dot(out, x - g.side * (k * 2 + 1), y + (k % 2), ink[k > 2 ? 2 : 3])
  }

  // The splat: an irregular blot that bursts out, then streaks run down from it
  const hit = t - OCTA_HIT
  if (hit === 0 || hit === 1) out.shake = [hit ? -g.side : g.side * 2, 1]
  if (hit >= 0 && t < OCTA_FADE + 8) {
    const grow = easeOut(phase(hit, 0, 3))
    const fade = phase(t, OCTA_FADE, OCTA_FADE + 8)
    for (let k = 0; k < 7; k++) {
      const angle = (k / 7) * TAU + rnd(a.seed, k, 91)
      const d = k === 0 ? 0 : (2 + rnd(a.seed, k, 92) * 3) * grow
      const bx = tx + Math.cos(angle) * d
      const by = ty + Math.sin(angle) * d * 0.8
      const r = (k === 0 ? 3.5 : 1.2 + rnd(a.seed, k, 93) * 1.4) * grow
      for (let py = Math.floor(by - r); py <= by + r; py++) {
        for (let px = Math.floor(bx - r); px <= bx + r; px++) {
          if (Math.hypot(px - bx, py - by) > r || rnd(a.seed, px * 17 + py, 94) < fade) continue
          const rim = Math.hypot(px - bx, py - by) > r - 1
          const gloss = k === 0 && px - bx < -0.5 && py - by < -0.5 && px - bx > -2.5 && py - by > -2.5
          dot(out, px, py, gloss ? ink[0] : rim ? ink[1] : (px + py * 3) % 7 === 0 ? ink[4] : ink[3])
        }
      }
    }
    // Runs of ink dripping down from the blot
    for (let k = 0; k < 4; k++) {
      const x = tx + Math.round((rnd(a.seed, k, 95) - 0.5) * 7)
      const len = Math.min(g.ground - ty - 2, phase(hit, 3, 20) * (4 + k * 2))
      for (let d = 0; d < len; d++) {
        if (rnd(a.seed, x * 9 + d, 96) < fade) continue
        dot(out, x, ty + 3 + d, d === Math.floor(len) - 1 ? ink[1] : ink[3])
      }
    }
  }
  if (hit >= 0 && hit < 4) {
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * TAU + 0.3
      dot(out, tx + Math.cos(angle) * (4 + hit * 1.5), ty + Math.sin(angle) * (3 + hit), ink[k % 2 ? 1 : 3])
    }
  }
}

export const WATER = {
  watergun: { ticks: 40, color: WATER_BLUE, draw: watergun },
  hydropump: { ticks: 52, color: WATER_BLUE, draw: hydropump },
  surf: { ticks: 56, color: WATER_BLUE, draw: surf },
  waterfall: { ticks: 40, color: WATER_BLUE, pose: (t) => ({ stride: t >= FALL_WIND && t < FALL_HIT }), draw: waterfall },
  bubble: { ticks: 50, color: 0x8fd8ff, draw: bubble },
  clamp: { ticks: 36, color: 0xb8a8d8, draw: clampJaws },
  raindance: { ticks: 50, color: WATER_BLUE, pose: { view: 'front' }, draw: raindance },
  watersport: { ticks: 46, color: 0x5ab0ff, pose: { view: 'front' }, draw: watersport },
  waterpulse: { ticks: 36, color: 0x4a9cff, draw: waterpulse },
  whirlpool: { ticks: 54, color: 0x2f7fe8, draw: whirlpool },
  aquajet: { ticks: 28, color: 0x4aa8ff, draw: aquajet },
  aquaring: { ticks: 48, color: 0x6ac8ff, pose: { view: 'front' }, draw: aquaring },
  brine: { ticks: 40, color: 0x2f88d8, draw: brine },
  aquatail: { ticks: 34, color: WATER_BLUE, draw: aquatail },
  muddywater: { ticks: 48, color: 0x8a6438, draw: muddywater },
  waterspout: { ticks: 54, color: WATER_BLUE, draw: waterspout },
  razorshell: { ticks: 36, color: 0x8ab8e8, draw: razorshell },
  dive: { ticks: 52, color: 0x2f7fe8, draw: dive },
  scald: { ticks: 40, color: WATER_BLUE, draw: scald },
  soak: { ticks: 42, color: 0x4a9cff, draw: soak },
  octazooka: { ticks: 40, color: 0x3a4a78, draw: octazooka },
}
