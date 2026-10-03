// Water moves

import {
  WHITE, back, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, glow, lean, lerp, light, phase, plus, puff,
  rnd, spark, sparkles, stamp,
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

export const WATER = {
  watergun: { ticks: 40, color: WATER_BLUE, draw: watergun },
  hydropump: { ticks: 52, color: WATER_BLUE, draw: hydropump },
  surf: { ticks: 56, color: WATER_BLUE, draw: surf },
  waterfall: { ticks: 40, color: WATER_BLUE, pose: (t) => ({ stride: t >= FALL_WIND && t < FALL_HIT }), draw: waterfall },
  bubble: { ticks: 50, color: 0x8fd8ff, draw: bubble },
  clamp: { ticks: 36, color: 0xb8a8d8, draw: clampJaws },
}
