// Fire moves

import {
  WHITE, back, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, glow, hsl, keys, lean, lerp, light, linear, mix,
  phase, plus, ring, rnd, spark, stamp, tint,
} from './draw.js'

// A flame's colors from white hot to smoke, made from its base color
function heat(c) {
  const red = mix(c, 0xc8201a, 0.6)
  return [light(c, 0.85), mix(c, 0xffe066, 0.7), c, red, dark(red, 0.45), 0x5f5656]
}

// Dragon fire burns cold: white hot, icy blue, violet, indigo, then purple smoke
function dragonFire(c) {
  return [light(c, 0.85), mix(light(c, 0.4), 0x8ff0ff, 0.4), c, mix(c, 0x2a0c78, 0.5), dark(c, 0.7), 0x3c3652]
}

const heatAt = (ramp, f) => ramp[f < 0.12 ? 0 : f < 0.3 ? 1 : f < 0.55 ? 2 : f < 0.75 ? 3 : f < 0.9 ? 4 : 5]

// One tongue of flame standing on x, y, h pixels tall, three wide low down and one
// wide up top, its tip leaning by `lean`. `cool` shifts it toward the dying colors.
function tongue(out, x, y, h, ramp, lean = 0, cool = 0) {
  for (let k = 0; k < h; k++) {
    const f = k / h
    const px = x + Math.round(lean * f * f)
    const core = k === 0 ? 1 : f < 0.4 ? 0 : f < 0.65 ? 1 : f < 0.85 ? 2 : 3
    dot(out, px, y - k, ramp[Math.min(5, core + cool)])
    if (f < 0.6 && h > 2) {
      const rim = ramp[Math.min(5, (k === 0 ? 3 : 2) + cool)]
      dot(out, px - 1, y - k, rim)
      dot(out, px + 1, y - k, rim)
    }
  }
}

// A rising puff of smoke, f through its life: it thins out and pales as it climbs
function wisp(out, x, y, f) {
  const col = mix(0x5f5656, 0x8c8686, f)
  dot(out, x, y, col)
  if (f < 0.7) dot(out, x + 1, y, dark(col, 0.2))
  if (f < 0.35) {
    dot(out, x, y + 1, dark(col, 0.3))
    dot(out, x + 1, y + 1, dark(col, 0.45))
  }
}

// A ragged ball of fire: white core, yellow, then a flickering orange rim
function fireBlob(out, x, y, r, ramp, seed, t) {
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const d = Math.hypot(px - x, py - y) / Math.max(0.5, r)
      if (d > 1.05 || (d > 0.7 && rnd(seed, px * 37 + py, t) < 0.3)) continue
      dot(out, px, py, d < 0.35 ? ramp[0] : d < 0.7 ? ramp[1] : py < y ? ramp[2] : ramp[3])
    }
  }
}

const FLAME_START = 7
const FLAME_END = 36

// Rock back and draw breath, then pour a widening, flickering stream that piles up
// against the target and billows upward, leaving embers and smoke behind
function flamethrower(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: mx, y: my } = g.mouth
  const wall = Math.abs(g.target.x - mx) + 3
  if (t < FLAME_START) out.dx = t < 2 ? 0 : -g.side
  else if (t < FLAME_START + 2) out.dx = g.side
  const pouring = t >= FLAME_START && t < FLAME_END
  if (pouring) out.shade = tint(0xffa040, t % 2 ? 0.18 : 0.08)

  // Breath gathering at the mouth
  if (t >= 2 && t < FLAME_START) {
    const r = t - 2
    dot(out, mx, my, ramp[1])
    if (r >= 2) plus(out, mx, my, ramp[2], ramp[0])
  }
  if (t === FLAME_START || t === FLAME_START + 1) plus(out, mx, my, ramp[1], WHITE)

  emit(t, { count: (FLAME_END - FLAME_START) * 3, gap: 1 / 3, start: FLAME_START, life: (i) => 10 + Math.floor(rnd(a.seed, i) * 5) }, (i, age, f) => {
    const speed = 1.7 + rnd(a.seed, i, 1) * 0.6
    let d = speed * age * (1 - f * 0.25)
    let rise = age * age * 0.012
    if (d > wall) {
      rise += (d - wall) * 0.55
      d = wall - rnd(a.seed, i, 4) * 3
    }
    const spread = (rnd(a.seed, i, 2) - 0.5) * (0.8 + age * 0.75)
    const x = g.ahead(d)
    const y = my + spread + Math.sin(age * 0.8 + i * 1.7) * 0.7 * f - rise
    if (y < 0 || y > g.ground) return
    const col = heatAt(ramp, f)
    dot(out, x, y, col)
    if (f > 0.1 && f < 0.7) {
      // A fat tongue of flame: brighter on top, licking back toward the mouth
      dot(out, x, y - 1, heatAt(ramp, f * 0.55))
      dot(out, x - g.side, y, col)
      dot(out, x - g.side, y - 1, heatAt(ramp, f * 0.8))
    }
  })

  // The jet's white-hot root, flickering
  if (pouring) {
    for (let d = 0; d <= 3; d++) dot(out, g.ahead(d), my, (d + t) % 3 ? ramp[0] : ramp[1])
    if (t % 3 === 0) dot(out, g.ahead(1), my - 1, ramp[1])
  }

  // Embers drift up off the target, then smoke rolls away
  emit(t, { count: 10, gap: 2.2, start: FLAME_START + 8, life: 16 }, (i, age, f) => {
    const x = g.target.x + (rnd(a.seed, i, 5) - 0.5) * 8 + Math.sin(age * 0.5 + i) * 1.2
    const y = my - 1 + (rnd(a.seed, i, 6) - 0.3) * 4 - age * 0.6
    if (y >= 0) dot(out, x, y, f < 0.5 ? ramp[1] : ramp[3])
  })
  emit(t, { count: 6, gap: 2, start: FLAME_END - 4, life: 14 }, (i, age, f) => {
    const x = g.target.x + g.side * (rnd(a.seed, i, 7) - 0.3) * 5 + Math.sin(age * 0.45 + i) * 1.3
    const y = my - rnd(a.seed, i, 8) * 3 - age * 0.5
    const col = mix(ramp[5], 0x9a9292, f)
    if (y < 1) return
    dot(out, x, y, col)
    if (f < 0.7) dot(out, x + (i % 2 ? 1 : -1), y + 1, dark(col, 0.2))
  })
}

const EMBER_SHOTS = [5, 10, 15]
const EMBER_FLIGHT = 6
const EMBER_BURN = 14
const EMBER_SPREAD = [-3, 2, 0]

// Where the ith ember lands, around the target and inside the strip
const emberX = (g, i) => g.ahead(clamp(Math.abs(g.target.x - g.mouth.x) + EMBER_SPREAD[i], 3, g.reach - 2))

// A lobbed ember, f of the way from the mouth to the ground by the target
function lob(g, i, f) {
  const x0 = g.ahead(1)
  const x1 = emberX(g, i)
  const arc = 2 + Math.abs(x1 - x0) / 6
  return [lerp(x0, x1, f), lerp(g.mouth.y, g.ground - 1, f) - arc * 4 * f * (1 - f)]
}

// A small fireball with a white-hot heart in a yellow cross, orange above and red below
function fireball(out, x, y, ramp, t) {
  dot(out, x - 1, y - 1, ramp[2])
  dot(out, x + 1, y - 1, ramp[2])
  dot(out, x - 1, y + 1, ramp[3])
  dot(out, x + 1, y + 1, ramp[3])
  plus(out, x, y, ramp[1], t % 2 ? WHITE : ramp[0])
}

// Spit three fireballs in a row, twitching back with each. They arc down by the
// target and catch as little flames on the ground, which gutter out into smoke.
function ember(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: mx, y: my } = g.mouth
  const spit = EMBER_SHOTS.find((at) => t >= at && t < at + 2)
  if (spit !== undefined) {
    out.dx = -g.side
    out.skew = lean(g, -g.side * (t === spit ? 2 : 1))
    if (t === spit) {
      out.shade = glow(ramp[1], 0.3)
      plus(out, mx, my, ramp[1], WHITE)
    }
  }
  // A spark glows in the mouth before each spit
  if (EMBER_SHOTS.some((at) => t >= at - 2 && t < at)) dot(out, mx, my, ramp[t % 2])

  EMBER_SHOTS.forEach((at, i) => {
    const age = t - at
    const x = emberX(g, i)
    const burn = age - EMBER_FLIGHT + 1
    if (burn >= 1 && burn < EMBER_BURN) {
      const dying = phase(burn, EMBER_BURN - 6, EMBER_BURN)
      const cool = dying > 0.5 ? 2 : dying > 0 ? 1 : 0
      const size = Math.min(1, burn / 3) * (1 - dying * 0.75)
      const lick = Math.sin(t * 0.8 + i * 2.1)
      const beside = i % 2 ? 2 : -2
      tongue(out, x + beside, g.ground, Math.round((3 + (rnd(a.seed, i, t + 40) < 0.5 ? 1 : 0)) * size), ramp, -lick, cool)
      tongue(out, x, g.ground, Math.max(1, Math.round((5 + (rnd(a.seed, i, t) < 0.4 ? 1 : 0)) * size)), ramp, lick * 1.3, cool)
    }
    if (age >= 0 && burn < 0) {
      const f = (age + 1) / EMBER_FLIGHT
      for (let k = 3; k >= 1; k--) {
        const [tx, ty] = lob(g, i, Math.max(0, f - k * 0.06))
        dot(out, tx, ty, ramp[Math.min(4, k + 1)])
        if (k === 1) dot(out, tx, ty - 1, ramp[2])
      }
      const [bx, by] = lob(g, i, f)
      fireball(out, bx, by, ramp, t)
    }
    if (burn === 0) {
      plus(out, x, g.ground - 1, ramp[1], WHITE)
      dot(out, x - 2, g.ground, ramp[2])
      dot(out, x + 2, g.ground, ramp[2])
    }
    // Sparks thrown up where it lands
    emit(burn, { count: 5, gap: 0, life: 6 }, (k, life, f) => {
      const angle = -Math.PI / 2 + (rnd(a.seed, i * 7 + k, 3) - 0.5) * 2.6
      const speed = 0.7 + rnd(a.seed, i * 7 + k, 4) * 0.7
      dot(out, x + Math.cos(angle) * speed * life, g.ground - 1 + Math.sin(angle) * speed * life + 0.15 * life * life, f < 0.5 ? ramp[1] : ramp[3])
    })
    // Sparks float up off the flames, then smoke as they gutter out
    emit(burn, { count: 4, gap: 2.5, start: 2, life: 6 }, (k, life, f) => {
      const sx = x + (rnd(a.seed, i * 11 + k, 8) - 0.5) * 4 + Math.sin(life * 0.9 + k) * 0.6
      dot(out, sx, g.ground - 4 - life * 0.8, f < 0.4 ? ramp[0] : f < 0.7 ? ramp[1] : ramp[3])
    })
    emit(burn, { count: 3, gap: 2, start: EMBER_BURN - 4, life: 10 }, (k, life, f) => {
      wisp(out, x + (rnd(a.seed, i * 5 + k, 6) - 0.5) * 3 + Math.sin(life * 0.5 + k) * 0.8, g.ground - 3 - life * 0.55, f)
    })
  })
}

const SPIN_SPIT = 6
const SPIN_LIT = 10
const SPIN_BREAK = 42
const SPIN_TURN = 0.5
const SPIN_STRANDS = 3

// Strands of fire wound around a vertical axis at x, turning. In front a strand
// is bright and drawn over everything; behind it is dark and drawn behind.
function vortex(out, t, a, x, floor, height, radius, spread, ramp) {
  for (let s = 0; s < SPIN_STRANDS; s++) {
    for (let k = 0; k <= height; k += 0.5) {
      if (spread > 0 && rnd(a.seed, s * 131 + k * 2, t) < spread * 1.3) continue
      const u = k / Math.max(1, height)
      const angle = t * SPIN_TURN + (s * 2 * Math.PI) / SPIN_STRANDS - k * 0.4
      const near = Math.sin(angle)
      const px = x + radius * (1 - 0.3 * u) * Math.cos(angle)
      const py = floor - 1 - k + near - spread * 5
      const f = Math.min(0.85, u * 0.5 + spread * 0.4)
      if (near > -0.2) {
        // Little flames along the strand, licking upward
        const h = Number.isInteger(k) ? 2 + ((k + t + s) % 3 === 0 ? 1 : 0) : 1
        for (let j = 0; j < h; j++) dot(out, px, py - j, heatAt(ramp, f - j * 0.12))
        dot(out, px + 1, py, heatAt(ramp, f + 0.15))
        if (k + 0.5 > height) tongue(out, px, py - 1, 3, ramp, Math.cos(angle) * 1.5, 1)
      } else back(out, px, py, heatAt(ramp, 0.6 + u * 0.25))
    }
  }
}

// Lean back and spit a fireball that sets the target alight. A vortex of fire spirals
// up around it, tightening as it climbs, then flies apart into embers.
function firespin(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: mx, y: my } = g.mouth
  const r0 = clamp((g.reach - 2) / 2, 3, 5.5)
  const dist = clamp(Math.abs(g.target.x - mx), r0 + 1, g.reach - r0 - 1)
  const cx = g.ahead(dist)
  if (t >= 1 && t < SPIN_SPIT) out.dx = -g.side
  else if (t >= SPIN_SPIT && t < SPIN_SPIT + 2) out.dx = g.side
  if (t >= SPIN_SPIT && t < SPIN_BREAK + 4) out.shade = glow(ramp[1], t % 4 < 2 ? 0.25 : 0.1)
  if (t >= 2 && t < SPIN_SPIT) plus(out, mx, my, ramp[2], ramp[t % 2])

  // The igniting fireball, shedding flame as it flies
  const fly = t - SPIN_SPIT
  const at = (f) => [lerp(g.ahead(1), cx, f), lerp(my, g.target.y, f)]
  if (fly >= 0 && fly < SPIN_LIT - SPIN_SPIT) {
    const f = easeIn((fly + 1) / (SPIN_LIT - SPIN_SPIT))
    for (let k = 4; k >= 1; k--) {
      const [x, y] = at(Math.max(0, f - k * 0.1))
      dot(out, x, y, ramp[Math.min(4, k)])
      dot(out, x, y - 1, ramp[Math.min(4, k + 1)])
    }
    const [x, y] = at(f)
    fireBlob(out, x, y, 1.8, ramp, a.seed, t)
  }
  const lit = t - SPIN_LIT
  if (lit >= 0 && lit < 6) fireBlob(out, cx, g.target.y, [3, 3.5, 3.5, 3, 2.5, 1.5][lit], ramp, a.seed, t)

  if (lit >= 0) {
    const height = clamp(Math.round(g.pixels * 0.55), 9, 18)
    const grow = easeOut(phase(t, SPIN_LIT, SPIN_LIT + 8))
    const spread = easeOut(phase(t, SPIN_BREAK, a.ticks - 1))
    const radius = lerp(r0, r0 * 0.6, phase(t, SPIN_LIT, SPIN_BREAK)) * (1 + spread * 1.8)
    if (spread < 1) vortex(out, t, a, cx, g.ground, Math.round(height * grow), radius, spread, ramp)
    // A bed of flames at its foot
    if (t < SPIN_BREAK + 2) {
      for (let px = Math.round(cx - radius - 1); px <= cx + radius + 1; px++) {
        dot(out, px, g.ground, ramp[(px + t) % 3 ? 3 : 2])
        if (Math.abs(px - cx) < radius) dot(out, px, g.ground - 1, ramp[(px + t) % 2 + 1])
      }
      for (let k = -1; k <= 1; k++) {
        const h = Math.round((2 + rnd(a.seed, k + 9, t >> 1) * 3) * grow)
        if (h > 1) tongue(out, cx + k * 3, g.ground - 1, h, ramp, Math.sin(t * 0.7 + k) * 0.8)
      }
    }
  }

  // Embers flung off the spin, then a shower of them when it breaks
  emit(t, { count: 16, gap: 1.8, start: SPIN_LIT + 4, life: 8 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 11) * Math.PI * 2
    const r = r0 + age * 0.8
    const y = g.ground - 2 - rnd(a.seed, i, 12) * 10 - age * 0.5
    dot(out, cx + Math.cos(angle) * r, y, f < 0.5 ? ramp[1] : ramp[3])
  })
  emit(t, { count: 18, gap: 0.3, start: SPIN_BREAK, life: 10 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 13) * Math.PI * 2
    const speed = 0.6 + rnd(a.seed, i, 14) * 0.7
    const x = cx + Math.cos(angle) * (3 + speed * age)
    const y = g.ground - 2 - rnd(a.seed, i, 15) * 12 + Math.sin(angle) * speed * age * 0.5 - age * 0.3
    if (y < g.ground) dot(out, x, y, heatAt(ramp, 0.2 + f * 0.7))
  })
  emit(t, { count: 5, gap: 1.5, start: SPIN_BREAK + 2, life: 9 }, (i, age, f) => {
    wisp(out, cx + (rnd(a.seed, i, 16) - 0.5) * 7 + Math.sin(age * 0.5 + i), g.ground - 4 - rnd(a.seed, i, 17) * 6 - age * 0.5, f)
  })
}

const RAGE_ROAR = 2
const RAGE_FIRE = 12
const RAGE_HIT = 22

// A dragon's head of fire facing right, jaws open: o rim, b body, l light, w eye,
// f a flame flickering in its throat
const DRAGON_HEAD = [
  '.oo.....',
  'ollooo..',
  'obwbllo.',
  'obbbbbbo',
  'obf.....',
  'obbbbo..',
  '.oooo...',
]
const HEAD_W = DRAGON_HEAD[0].length

// A blaze w pixels wide standing on x, y. It is tallest in the middle, sways and
// flickers, and cools from a white-hot heart toward its edges and tips.
function blaze(out, x, y, w, h, ramp, t, seed, cool = 0) {
  const half = (w - 1) / 2
  for (let i = 0; i < w; i++) {
    const e = Math.abs(i - half) / (half + 1)
    const top = h * (1 - e * e) * (0.8 + 0.2 * Math.sin(t * 0.9 + i * 1.3) + 0.15 * rnd(seed, i, t >> 1))
    for (let k = 0; k < top; k++) {
      const hot = Math.max(e, k / top)
      dot(out, x - half + i, y - k, ramp[Math.min(5, (hot < 0.35 ? 0 : hot < 0.6 ? 1 : hot < 0.85 ? 2 : 3) + cool)])
    }
  }
}

// The corkscrewing body of dragon fire from d0 to d1 ahead of the mouth. Two strands
// twist around a glowing core, the far one dark and the near one bright. Its middle
// runs from the mouth at y0 down to y1 at d1.
function corkscrew(out, t, g, d0, d1, y0, y1, ramp) {
  const mid = (d) => lerp(y0, y1, clamp(d / Math.max(1, d1), 0, 1))
  for (let d = d0; d <= d1; d += 1) dot(out, g.ahead(d), mid(d), ramp[2])
  for (const near of [false, true]) {
    for (let d = d0; d <= d1; d += 0.5) {
      const amp = 1 + 1.8 * clamp(d / Math.max(1, d1), 0, 1)
      for (let s = 0; s < 2; s++) {
        const p = d * 0.9 - t * 1.1 + s * Math.PI
        if (Math.cos(p) > 0 !== near) continue
        const x = g.ahead(d)
        const y = mid(d) + Math.sin(p) * amp
        if (near) {
          dot(out, x, y - 1, (Math.round(d) + t) % 3 ? ramp[1] : ramp[0])
          dot(out, x, y, ramp[1])
          dot(out, x, y + 1, ramp[2])
        } else {
          dot(out, x, y - 1, ramp[3])
          dot(out, x, y, ramp[3])
          dot(out, x, y + 1, ramp[4])
        }
      }
    }
  }
}

// Rear up and roar while blue fire gathers in the jaws, then let it loose. Dragon fire
// corkscrews out behind a fiery dragon's head and crashes into the target in a violet blast.
function dragonrage(out, t, a, g, c) {
  const ramp = dragonFire(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const dist = Math.abs(tx - mx)
  if (t >= RAGE_ROAR && t < RAGE_FIRE) {
    out.dy = -1
    out.dx = t % 2 ? -g.side : 0
    out.skew = lean(g, -g.side * 2 * easeOut(phase(t, RAGE_ROAR, RAGE_ROAR + 4)))
    out.shade = glow(c, t % 2 ? 0.35 : 0.15)
  } else if (t === RAGE_FIRE || t === RAGE_FIRE + 1) {
    // The head snaps forward as the fire leaves, and the body is thrown back
    out.dx = -2 * g.side
    out.skew = lean(g, g.side * 2)
    out.shade = glow(WHITE, t === RAGE_FIRE ? 0.6 : 0.25)
  } else if (t > RAGE_FIRE && t < RAGE_HIT) out.dx = -g.side

  // The roar rolls out in arcs while sparks of fire swirl into the jaws
  for (let j = 0; j < 3; j++) {
    const age = t - RAGE_ROAR - 1 - j * 3
    if (age >= 0 && age < 6) ring(out, mx, my, 2 + age * 1.4, age < 2 ? ramp[0] : age < 4 ? ramp[1] : ramp[3], g.side > 0 ? 0 : Math.PI, 0.7)
  }
  emit(t, { count: 8, gap: 0.8, start: RAGE_ROAR, life: 5 }, (i, age, f) => {
    const angle = rnd(a.seed, i) * Math.PI * 2
    const r = 8 * (1 - easeIn(f))
    dot(out, mx + Math.cos(angle) * r, my + Math.sin(angle) * r * 0.7, f < 0.5 ? ramp[2] : ramp[1])
  })
  if (t >= RAGE_ROAR + 3 && t < RAGE_FIRE) disc(out, mx, my, 0.5 + 1.5 * phase(t, RAGE_ROAR + 3, RAGE_FIRE), t % 2 ? ramp[1] : ramp[0])

  // The head leads the fire out to the target, then the tail is pulled in after it
  if (t >= RAGE_FIRE && t < RAGE_HIT + 6) {
    const f = phase(t, RAGE_FIRE - 1, RAGE_HIT)
    const snout = lerp(3, dist + 3, f)
    const hy = lerp(my, ty, f) + Math.sin(t * 0.9) * (1 - f)
    const nape = snout - HEAD_W + 2
    const tail = lerp(1, nape, easeIn(phase(t, RAGE_HIT - 2, RAGE_HIT + 6)))
    if (nape - tail >= 2) corkscrew(out, t, g, tail, nape, my, hy, ramp)
    if (t < RAGE_HIT) {
      // A mane of flame streams back off the head
      for (let k = 0; k < 6; k++) {
        const d = snout - HEAD_W + 1 - k * 0.8 - rnd(a.seed, k, t) * 1.5
        dot(out, g.ahead(d), hy - 3 - k * 0.4 + rnd(a.seed, k, t + 99) * 2, k < 2 ? ramp[1] : k < 4 ? ramp[2] : ramp[3])
      }
      const palette = { o: ramp[3], b: ramp[2], l: ramp[1], w: WHITE, f: t % 2 ? ramp[0] : WHITE }
      const left = g.side > 0 ? g.ahead(snout) - (HEAD_W - 1) : g.ahead(snout)
      stamp(out, left, Math.round(hy) - 4, DRAGON_HEAD, palette, g.side < 0)
    }
  }
  if (t === RAGE_FIRE) disc(out, mx, my, 2.5, WHITE)

  // The crash flashes white, bursts into violet fire inside a shock ring, and jolts the strip
  const hit = t - RAGE_HIT
  if (hit === 0) disc(out, tx, ty, 4, WHITE)
  if (hit >= 0 && hit < 3) out.shake = [hit === 1 ? -g.side : g.side, hit === 2 ? 1 : 0]
  if (hit >= 1 && hit < 6) {
    ring(out, tx, ty, 3 + hit * 1.2, hit < 3 ? ramp[1] : ramp[3])
    fireBlob(out, tx, ty, [4.5, 5, 4.5, 3.5, 2.5][hit - 1], ramp, a.seed, t)
  }
  emit(t, { count: 14, gap: 0, start: RAGE_HIT, life: 9 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 5) * Math.PI * 2
    const speed = 1 + rnd(a.seed, i, 6) * 0.8
    dot(out, tx + Math.cos(angle) * speed * age, ty + Math.sin(angle) * speed * age + 0.08 * age * age, f < 0.4 ? ramp[0] : f < 0.7 ? ramp[1] : ramp[3])
  })

  // Violet flames burn on the target, with sparks spiralling up, then smoke
  if (hit >= 2 && hit < 22) {
    const dying = phase(hit, 12, 22)
    blaze(out, tx, ty + 3, 7, 9 * (1 - dying * 0.7), ramp, t, a.seed, dying > 0.6 ? 2 : dying > 0.2 ? 1 : 0)
  }
  emit(t, { count: 10, gap: 1.5, start: RAGE_HIT + 3, life: 10 }, (i, age, f) => {
    const x = tx + Math.sin(age * 0.6 + i * 1.3) * 3 * (1 - f * 0.5)
    dot(out, x, ty - 2 - age * 0.8, f < 0.4 ? ramp[0] : f < 0.7 ? ramp[1] : ramp[3])
  })
  emit(t, { count: 5, gap: 2, start: RAGE_HIT + 14, life: 10 }, (i, age, f) => {
    wisp(out, tx + (rnd(a.seed, i, 9) - 0.5) * 5 + Math.sin(age * 0.5 + i), ty - 2 - age * 0.5, f)
  })
}

// Ghostly fire, for wisps and blue flames: white heart, pale, the color, deep, then smoke
function coldFire(c) {
  return [light(c, 0.85), light(c, 0.45), c, mix(c, 0x241060, 0.45), dark(c, 0.65), 0x3c3a52]
}

// The topmost body pixel in column x, or -1 for an empty column
function topAt(g, x) {
  for (let y = g.top; y <= g.bottom; y++) if (g.solid(x, y)) return y
  return -1
}

// Flames standing on the top edge of the body, shifted by the frame's offset. `size`
// scales them from nothing to full, `lean` bends their tips.
function engulf(out, t, a, g, ramp, size, tilt = 0, cool = 0) {
  if (size <= 0) return
  for (let x = g.left; x <= g.right; x += 2) {
    const top = topAt(g, x)
    if (top < 0) continue
    const h = Math.round((2 + rnd(a.seed, x, t >> 1) * 3) * size)
    if (h > 0) tongue(out, x + out.dx, top + out.dy, h, ramp, tilt + Math.sin(t * 0.9 + x) * 0.7, cool)
  }
}

const SUN_RISE = 4
const SUN_UP = 20
const SUN_SET = 38

// Look up as a sun climbs from behind the mon to the top of the strip, its rays
// turning and shafts of light falling, warming the body until it sets again
function sunnyday(out, t, a, g, c) {
  const ramp = heat(c)
  const r = clamp(Math.round(g.pixels * 0.13), 3, 5)
  const rise = easeOut(phase(t, SUN_RISE, SUN_UP))
  const fade = phase(t, SUN_SET, a.ticks - 1)
  const room = g.left - r - 4 >= 0
  const endX = room ? g.left - r - 3 : g.right + r + 3
  const sx = lerp(g.cx, clamp(endX, r + 1, g.columns - r - 2), rise)
  const sy = lerp(g.ground + r, r + 1, rise) + fade * 3
  const warm = rise * (1 - fade)
  out.sy = 1 + 0.05 * easeOut(phase(t, 0, 6)) * (1 - fade)
  if (warm > 0.05) out.shade = glow(ramp[1], 0.28 * warm + (t % 6 < 3 ? 0.06 : 0))

  if (t >= SUN_RISE && fade < 1) {
    // Rays turn slowly around the disc and shrink as it sets
    const reach = (1 - fade) * rise
    for (let k = 0; k < 12; k++) {
      const angle = t * 0.08 + (k * Math.PI) / 6
      const len = (k % 2 ? 1.5 : 3) * reach + (k % 2 ? 0 : (t + k) % 4 < 2 ? 0.8 : 0)
      for (let d = 1; d <= len; d++) back(out, sx + Math.cos(angle) * (r + d), sy + Math.sin(angle) * (r + d), d < 2 ? ramp[1] : ramp[2])
    }
    for (let py = Math.floor(sy - r); py <= sy + r; py++) {
      for (let px = Math.floor(sx - r); px <= sx + r; px++) {
        const d = Math.hypot(px - sx, py - sy) / r
        if (d > 1.05 || py > g.ground) continue
        back(out, px, py, d < 0.4 ? ramp[0] : d < 0.75 ? ramp[1] : d < 0.95 ? ramp[2] : ramp[3])
      }
    }
  }

  // Shafts of light slanting down from the sun, dashes sliding along them
  if (t >= SUN_UP - 2 && t < SUN_SET + 4) {
    for (let k = -1; k <= 1; k++) {
      const tx = g.cx + k * Math.max(3, (g.right - g.left) / 3)
      const steps = Math.ceil(Math.hypot(tx - sx, g.ground - sy))
      for (let s = r + 2; s < steps; s++) {
        if ((s + t + k * 2) % 5 > 1) continue
        const f = s / steps
        back(out, lerp(sx, tx, f), lerp(sy, g.ground, f), f < 0.5 ? ramp[1] : ramp[2])
      }
    }
  }

  // Heat shimmers up off the warmed body
  emit(t, { count: 12, gap: 1.6, start: SUN_UP - 4, life: 7 }, (i, age, f) => {
    const x = lerp(g.left, g.right, rnd(a.seed, i, 3)) + Math.sin(age * 1.2 + i) * 0.8
    const y = g.top + (g.bottom - g.top) * 0.4 * rnd(a.seed, i, 4) - age * 0.8
    if (y >= 0) dot(out, x, y, f < 0.5 ? ramp[1] : ramp[2])
  })
}

const FANG_OPEN = 6
const FANG_BITE = 15

// One jaw of fangs on gum row y, teeth pointing down (dir 1) or up (-1), the long
// canines at either end
function jaw(out, x, y, half, dir, ramp, t) {
  for (let px = x - half; px <= x + half; px++) {
    dot(out, px, y, ramp[3])
    dot(out, px, y - dir, ramp[4])
  }
  for (let px = x - half + 1; px <= x + half - 1; px += 2) {
    const canine = px <= x - half + 1 || px >= x + half - 1
    dot(out, px, y + dir, WHITE)
    if (canine) dot(out, px, y + 2 * dir, (t >> 1) % 2 ? WHITE : ramp[0])
  }
}

// Draw back as fire licks from the mouth, then a flaming jaw opens around the target
// and snaps shut on it: a white flash, and fire bursts out of the bite
function firefang(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: mx, y: my } = g.mouth
  const half = clamp(Math.round((g.bottom - g.top) * 0.3), 4, 5)
  const tx = g.target.x
  // The jaws open wide around the bite, so keep them inside the strip
  const ty = clamp(g.target.y, half + 6, g.ground - half - 4)
  const H = FANG_BITE
  out.dx = g.side * Math.round(keys(t, [[0, 0], [5, -2, easeOut], [H - 2, -2], [H, 2, easeIn], [H + 3, 2], [H + 10, 0]]))
  if (t >= 2 && t < H) {
    out.shade = glow(ramp[2], t % 2 ? 0.25 : 0.1)
    tongue(out, mx + out.dx, my, 3 + (t % 3 === 0 ? 1 : 0), ramp, -g.side * 1.5)
  }
  if (t === H) out.shade = tint(WHITE, 0.5)
  if (t === H || t === H + 1) out.shake = [t === H ? g.side : -g.side, t === H ? 1 : 0]

  const gap = keys(t, [[FANG_OPEN, 0], [FANG_OPEN + 4, half, easeOut], [H - 2, half + 1], [H, 0, easeIn], [H + 4, 0], [H + 9, 2, easeOut]])
  if (t >= FANG_OPEN && t < H + 9 && !(t > H + 5 && t % 2)) {
    const upper = Math.round(ty - 1 - gap)
    const lower = Math.round(ty + 1 + gap)
    jaw(out, tx, upper, half, 1, ramp, t)
    jaw(out, tx, lower, half, -1, ramp, t)
    // Flames run along the top of the upper jaw
    for (let k = -half; k <= half; k += 2) {
      const h = 2 + Math.round(rnd(a.seed, k + 20, t >> 1) * 2)
      tongue(out, tx + k, upper - 2, h, ramp, Math.sin(t * 0.8 + k) * 0.8, t < H ? 1 : 0)
    }
  }

  const bite = t - H
  if (bite >= 0 && bite < 5) fireBlob(out, tx, ty, [2, 3.5, 4, 3.5, 2.5][bite], ramp, a.seed, t)
  if (bite >= 2 && bite < 16) {
    const dying = phase(bite, 9, 16)
    for (const k of [-2, 0, 2]) tongue(out, tx + k, ty + 1, Math.round((k ? 4 : 6) * (1 - dying * 0.7)), ramp, Math.sin(t * 0.7 + k) * 1.2, dying > 0.5 ? 1 : 0)
  }
  emit(t, { count: 10, gap: 0, start: H, life: 8 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 7) * Math.PI * 2
    const speed = 0.9 + rnd(a.seed, i, 8) * 0.6
    dot(out, tx + Math.cos(angle) * speed * age, ty + Math.sin(angle) * speed * age * 0.7 + 0.1 * age * age, f < 0.5 ? ramp[1] : ramp[3])
  })
  emit(t, { count: 4, gap: 2, start: H + 10, life: 10 }, (i, age, f) => {
    wisp(out, tx + (rnd(a.seed, i, 9) - 0.5) * 6 + Math.sin(age * 0.5 + i), ty - 3 - age * 0.5, f)
  })
}

const BLITZ_LIT = 10
const BLITZ_GO = 14
const BLITZ_HIT = 22
const BLITZ_RECOIL = 30

// Burst into flame from head to toe, charge as a fireball trailing fire, explode on the
// target, then get thrown back by the recoil, sooty and smoking, and limp home
function flareblitz(out, t, a, g, c) {
  const ramp = heat(c)
  const far = clamp(g.reach - 3, 2, 12)
  const H = BLITZ_HIT
  const at = (u) => keys(u, [[0, 0], [BLITZ_GO, -2, easeOut], [H, far, easeIn], [H + 1, far], [BLITZ_RECOIL, -3, easeOut], [BLITZ_RECOIL + 4, -3], [a.ticks - 2, 0]])
  const pos = Math.round(at(t))
  out.dx = g.side * pos
  if (t > H && t < BLITZ_RECOIL) out.dy = -Math.round(Math.sin(phase(t, H, BLITZ_RECOIL) * Math.PI) * 3)
  const burning = phase(t, 2, BLITZ_LIT) * (1 - phase(t, H, H + 3))
  if (t < BLITZ_GO) out.dx += t >= BLITZ_LIT ? g.side * (t % 2) : 0
  if (burning > 0) out.shade = glow(t % 2 ? ramp[2] : ramp[3], 0.3 + 0.3 * burning)
  if (t >= BLITZ_GO && t < H) {
    out.sx = 1.08
    out.ghosts = [2, 4].map((k) => ghost(g.side * Math.round(at(t - k)), 0, ramp[3], 0.5 + k * 0.08))
    // A comet's tail of fire streaming off the back of the body
    const tail = (g.side > 0 ? g.left : g.right) + out.dx
    for (let y = g.top + 1; y <= g.bottom; y += 2) {
      const len = 4 + ((y + t) % 3)
      for (let d = 0; d < len; d++) dot(out, tail - g.side * d, y + (d > 2 ? -1 : 0), heatAt(ramp, 0.2 + d / (len + 2)))
    }
  }
  engulf(out, t, a, g, ramp, burning * (t >= BLITZ_GO && t < H ? 1.3 : 1), t >= BLITZ_GO ? -g.side * 2 : 0)
  if (t === H) out.shade = tint(WHITE, 0.6)

  // The explosion at the front of the body
  const hx = g.ahead(far + 1)
  const hy = g.mouth.y + 1
  const hit = t - H
  if (hit >= 0 && hit < 3) out.shake = [hit === 1 ? -2 * g.side : 2 * g.side, hit === 0 ? 1 : 0]
  if (hit >= 0 && hit < 8) {
    if (hit > 0) ring(out, hx, hy, 2 + hit * 1.5, hit < 3 ? ramp[1] : ramp[3])
    fireBlob(out, hx, hy, [3, 5, 5.5, 5, 4, 3, 2, 1.2][hit], ramp, a.seed, t)
  }
  emit(t, { count: 16, gap: 0, start: H, life: 10 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 3) * Math.PI * 2
    const speed = 1 + rnd(a.seed, i, 4) * 0.9
    const y = hy + Math.sin(angle) * speed * age + 0.08 * age * age
    if (y <= g.ground) dot(out, hx + Math.cos(angle) * speed * age, y, heatAt(ramp, 0.1 + f * 0.8))
  })

  // Recoil: the body flickers hurt, then cools from soot black as smoke rises off it
  const soot = 1 - phase(t, BLITZ_RECOIL, a.ticks - 2)
  if (t > H + 1) {
    if (t < H + 6 && t % 2) out.shade = tint(0xff3020, 0.5)
    else if (soot > 0) out.shade = tint(0x302626, 0.45 * soot)
  }
  emit(t, { count: 8, gap: 2, start: H + 3, life: 10 }, (i, age, f) => {
    const x = lerp(g.left, g.right, rnd(a.seed, i, 5)) + out.dx
    const top = topAt(g, Math.round(x - out.dx))
    if (top >= 0) wisp(out, x + Math.sin(age * 0.5 + i), top + out.dy - 1 - age * 0.6, f)
  })
}

const WISP_DRIFT = 16
const WISP_ORBIT = 27
const WISP_STRIKE = 38

// Where the ith will-o-wisp floats at tick u: bobbing by the mon, then weaving over
// to the target, circling it, and diving in
function wispAt(g, i, u) {
  const homeX = lerp(g.left, g.right, [0.15, 0.5, 0.85][i])
  const homeY = Math.max(3, g.top - 2 + [1, -1, 2][i])
  const sx = homeX + Math.sin(u * 0.3 + i * 2) * 1.5
  const sy = homeY + Math.sin(u * 0.45 + i) * 1.2
  const start = WISP_DRIFT + i * 2
  const { x: tx, y: ty } = g.target
  const spin = u * 0.45 + (i * 2 * Math.PI) / 3
  const ox = tx + Math.cos(spin) * 5
  const oy = ty + Math.sin(spin) * 2.5
  if (u < start) return [sx, sy]
  if (u < WISP_ORBIT) {
    const f = easeInOut(phase(u, start, WISP_ORBIT))
    return [lerp(sx, ox, f), lerp(sy, oy, f) + Math.sin(f * Math.PI * 2 + i) * 3 * (1 - f)]
  }
  const f = easeIn(phase(u, WISP_STRIKE - 2 + i, WISP_STRIKE + 2 + i))
  return [lerp(ox, tx, f), lerp(oy, ty, f)]
}

// Sway as three ghostly flames flicker to life around the body. They bob, weave over
// to the target, circle it, then dive in one by one and leave it burning cold blue.
function willowisp(out, t, a, g, c) {
  const ramp = coldFire(c)
  const conjure = phase(t, 1, 6) * (1 - phase(t, WISP_DRIFT, WISP_DRIFT + 6))
  if (conjure > 0) {
    out.shade = glow(c, (t % 4 < 2 ? 0.3 : 0.15) * conjure)
    out.skew = lean(g, Math.round(Math.sin(t * 0.4) * 1.5 * conjure))
  }
  const { x: tx, y: ty } = g.target
  for (let i = 0; i < 3; i++) {
    const born = 3 + i * 3
    const end = WISP_STRIKE + 2 + i
    if (t < born || t >= end) continue
    const size = Math.min(1, (t - born + 1) / 3)
    for (let k = 3; k >= 1; k--) {
      if (t - k < born) continue
      const [px, py] = wispAt(g, i, t - k)
      dot(out, px, py, k === 1 ? ramp[2] : ramp[3])
    }
    const [x, y] = wispAt(g, i, t)
    tongue(out, x, y - 1, Math.max(1, Math.round((3 + ((t + i) % 3 === 0 ? 1 : 0)) * size)), ramp, Math.sin(t * 0.6 + i) * 1.5, 1)
    fireBlob(out, x, y + 1, 1.7 * size, ramp, a.seed + i, t)
  }

  // Each wisp's dive flashes, then cold flames burn on the target
  for (let i = 0; i < 3; i++) {
    const hit = t - (WISP_STRIKE + 2 + i)
    if (hit >= 0 && hit < 3) plus(out, tx, ty, ramp[1], WHITE)
    if (hit === 0) ring(out, tx, ty, 3, ramp[2])
  }
  const burn = t - WISP_STRIKE - 2
  if (burn >= 1 && burn < 14) {
    const dying = phase(burn, 8, 14)
    for (const k of [-2, 1]) tongue(out, tx + k, ty + 2, Math.round((k < 0 ? 3 : 4) * (1 - dying * 0.6)), ramp, Math.sin(t * 0.7 + k), dying > 0.5 ? 2 : 0)
  }
  emit(t, { count: 4, gap: 2, start: WISP_STRIKE + 8, life: 8 }, (i, age, f) => {
    const col = mix(ramp[5], 0x8a86a0, f)
    dot(out, tx + (rnd(a.seed, i, 6) - 0.5) * 5 + Math.sin(age * 0.5 + i), ty - 2 - age * 0.6, col)
  })
}

const CHARGE_GO = 12
const CHARGE_HIT = 19

// Stamp twice to kindle flames at the feet, dash in low with fire running along the
// ground behind, slam the target, then trot home as streaks of speed rise off the body
function flamecharge(out, t, a, g, c) {
  const ramp = heat(c)
  const far = clamp(g.reach - 3, 2, 10)
  const H = CHARGE_HIT
  const at = (u) => keys(u, [[0, 0], [CHARGE_GO, -1], [H, far, easeIn], [H + 2, far], [H + 10, 0, easeOut]])
  const pos = Math.round(at(t))
  out.dx = g.side * pos
  if (t < CHARGE_GO) {
    const s = t % 6
    if (s < 2) out.dy = -1
    if (s === 3) {
      out.sy = 0.92
      out.sx = 1.05
      out.shake = [0, 1]
    }
  } else if (t < H) {
    out.sy = 0.92
    out.sx = 1.06
    out.ghosts = [2, 4].map((k) => ghost(g.side * Math.round(at(t - k)), 0, ramp[2], 0.5 + k * 0.08))
  }
  if (t >= 3 && t < H) out.shade = glow(ramp[2], t % 2 ? 0.3 : 0.15)
  if (t === H) out.shade = tint(WHITE, 0.5)

  // Flames at the feet, swept back while dashing
  const kindle = phase(t, 3, CHARGE_GO) * (1 - phase(t, H, H + 4))
  if (kindle > 0) {
    for (let x = g.left; x <= g.right; x += 2) {
      const h = Math.round((1 + kindle * 2 + rnd(a.seed, x, t >> 1) * 2) * kindle)
      if (h > 0) tongue(out, x + out.dx, g.ground, h, ramp, t >= CHARGE_GO ? -g.side * 2.5 : Math.sin(t + x) * 0.8)
    }
  }
  // The trail of fire left on the ground, dying down from the far end first
  if (t >= CHARGE_GO && t < H + 12) {
    const back = g.side > 0 ? g.left : g.right
    for (let d = 0; d <= Math.max(0, pos); d += 2) {
      const fade = phase(t, H + d * 0.5 - 4, H + d * 0.5 + 6)
      const h = Math.round((2 + rnd(a.seed, d, t >> 1) * 2) * (1 - fade))
      if (h > 0) tongue(out, back + g.side * d, g.ground, h, ramp, Math.sin(t * 0.8 + d) * 0.7, fade > 0.5 ? 2 : 0)
    }
  }

  const hx = g.ahead(far + 1)
  const hy = g.mouth.y + 2
  const hit = t - H
  if (hit >= 0 && hit < 2) out.shake = [hit ? -g.side : g.side, 0]
  if (hit >= 0 && hit < 4) fireBlob(out, hx, hy, [2, 3.5, 3, 2][hit], ramp, a.seed, t)
  emit(t, { count: 8, gap: 0, start: H, life: 7 }, (i, age, f) => {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, 2) - 0.5) * 3
    dot(out, hx + Math.cos(angle) * age * 1.2, hy + Math.sin(angle) * age + 0.1 * age * age, f < 0.5 ? ramp[1] : ramp[3])
  })

  // Speed up: streaks shoot up past both flanks
  emit(t, { count: 8, gap: 1.5, start: H + 8, life: 6 }, (i, age) => {
    const x = (i % 2 ? g.left - 2 : g.right + 2) + (i % 4 < 2 ? 0 : g.side)
    const y = g.bottom - age * 2.5
    for (let k = 0; k < 3; k++) if (y + k >= 0) dot(out, x, y + k, k === 0 ? ramp[0] : k === 1 ? ramp[1] : ramp[3])
  })
}

const BLAST_SPIT = 9
const BLAST_HIT = 18
const BLAST_BREAK = 38
// The arms of the blast: up, back, ahead, and two legs spread below
const BLAST_ARMS = [-Math.PI / 2, Math.PI, 0, Math.PI * 0.72, Math.PI * 0.28]

// Rear back over a swelling fireball and hurl it. On the target it bursts into a huge
// five armed star of fire that burns, then crumbles into embers and smoke.
function fireblast(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: mx, y: my } = g.mouth
  const tx = g.target.x
  const ty = clamp(g.target.y, 5, g.ground - 5)
  if (t >= 1 && t < BLAST_SPIT) {
    out.dx = -g.side
    out.skew = lean(g, -g.side * 2 * phase(t, 1, BLAST_SPIT))
    out.shade = glow(ramp[1], t % 2 ? 0.3 : 0.15)
    fireBlob(out, mx, my, 0.5 + 1.8 * phase(t, 1, BLAST_SPIT), ramp, a.seed, t)
  } else if (t >= BLAST_SPIT && t < BLAST_SPIT + 3) out.dx = g.side

  const fly = phase(t, BLAST_SPIT, BLAST_HIT)
  if (t >= BLAST_SPIT && t < BLAST_HIT) {
    for (let k = 5; k >= 1; k--) {
      const f = Math.max(0, fly - k * 0.06)
      dot(out, lerp(g.ahead(1), tx, f), lerp(my, ty, f) - (k % 2), ramp[Math.min(4, k)])
    }
    fireBlob(out, lerp(g.ahead(1), tx, fly), lerp(my, ty, fly), 2.4, ramp, a.seed, t)
  }

  const hit = t - BLAST_HIT
  if (hit === 0) disc(out, tx, ty, 3.5, WHITE)
  if (hit >= 0 && hit < 3) out.shake = [hit === 1 ? -2 * g.side : 2 * g.side, hit === 0 ? 1 : 0]
  if (hit > 0 && t < BLAST_BREAK + 8) {
    const len = clamp(Math.round(g.pixels * 0.36), 6, 10) * easeOut(phase(t, BLAST_HIT, BLAST_HIT + 5))
    const crumble = phase(t, BLAST_BREAK, BLAST_BREAK + 8)
    BLAST_ARMS.forEach((angle, k) => {
      const ca = Math.cos(angle) * g.side
      const sa = Math.sin(angle)
      const reach = len + (rnd(a.seed, k, t >> 1) < 0.5 ? 1 : 0)
      for (let d = 0; d <= reach; d += 0.5) {
        if (crumble > 0 && rnd(a.seed, k * 50 + d * 2, t) < crumble) continue
        const x = tx + ca * d
        const y = ty + sa * d * 0.85
        if (y < 0 || y > g.ground) continue
        const f = d / Math.max(1, reach)
        dot(out, x, y, heatAt(ramp, f * 0.7 + crumble * 0.3))
        if (f < 0.75) {
          // Thicken the arm across its width
          dot(out, x - sa, y + ca * 0.85, heatAt(ramp, 0.4 + f * 0.4 + crumble * 0.3))
          dot(out, x + sa, y - ca * 0.85, heatAt(ramp, 0.4 + f * 0.4 + crumble * 0.3))
        }
      }
      if (crumble === 0 && hit > 4) tongue(out, tx + ca * reach, ty + sa * reach * 0.85, 2 + ((t + k) % 2), ramp, Math.sin(t + k), 1)
    })
    if (crumble < 0.5) fireBlob(out, tx, ty, 2.5, ramp, a.seed, t)
  }
  emit(t, { count: 18, gap: 0.3, start: BLAST_BREAK, life: 10 }, (i, age, f) => {
    const angle = BLAST_ARMS[i % 5]
    const d = rnd(a.seed, i, 5) * 8
    const x = tx + Math.cos(angle) * g.side * d + (rnd(a.seed, i, 6) - 0.5) * 2
    const y = ty + Math.sin(angle) * d * 0.85 - age * 0.6
    if (y >= 0 && y <= g.ground) dot(out, x, y, heatAt(ramp, 0.3 + f * 0.6))
  })
  emit(t, { count: 5, gap: 1.5, start: BLAST_BREAK + 4, life: 9 }, (i, age, f) => {
    wisp(out, tx + (rnd(a.seed, i, 7) - 0.5) * 8 + Math.sin(age * 0.5 + i), ty - 2 - age * 0.5, f)
  })
}

const BURST_SPIT = 6
const BURST_POP = 21

// Where a flame burst shard is `age` ticks after the pop, and the age it hits the ground
function shard(a, i, tx, ty, ground, age) {
  const angle = (i % 2 ? 0 : Math.PI) + (rnd(a.seed, i, 3) - 0.5) * 1.3 - 0.4 * (i % 2 ? 1 : -1)
  const speed = 0.9 + rnd(a.seed, i, 4) * 0.8
  const vx = Math.cos(angle) * speed
  const vy = Math.sin(angle) * speed - 0.8
  const y = (u) => ty + vy * u + 0.13 * u * u
  let land = 0
  while (y(land) < ground && land < 30) land++
  const u = Math.min(age, land)
  return { x: tx + vx * u, y: Math.min(ground, y(u)), land }
}

// Puff up and lob a wobbling bubble of fire. It swells on the target, pops in a white
// ring, and splashes burning shards out to either side that catch where they land.
function flameburst(out, t, a, g, c) {
  const ramp = heat(c)
  const my = g.mouth.y
  const { x: tx } = g.target
  const ty = clamp(g.target.y, 4, g.ground - 4)
  if (t >= 1 && t < BURST_SPIT) {
    out.sx = 1 + 0.05 * phase(t, 1, BURST_SPIT)
    out.sy = out.sx
  } else if (t >= BURST_SPIT && t < BURST_SPIT + 2) out.dx = -g.side

  // The bubble: a dark rim around a molten heart with a white glint
  const bubble = (x, y, r) => {
    disc(out, x, y, r, ramp[2])
    disc(out, x, y + 0.4, r - 0.8, ramp[1])
    ring(out, x, y, r, ramp[3])
    dot(out, x - g.side, y - Math.max(1, r - 1.5), WHITE)
  }
  const arrive = BURST_POP - 5
  if (t >= BURST_SPIT && t < arrive) {
    const f = phase(t, BURST_SPIT, arrive)
    bubble(lerp(g.ahead(2), tx, f), lerp(my, ty, f) - Math.sin(f * Math.PI) * 3 + Math.sin(t * 1.3) * 0.6, 2)
  } else if (t >= arrive && t < BURST_POP) {
    const f = phase(t, arrive, BURST_POP - 1)
    bubble(tx + (t % 2 ? 1 : 0), ty, 2 + f * 1.8)
  }

  const pop = t - BURST_POP
  if (pop >= 0 && pop < 4) {
    ring(out, tx, ty, 3 + pop * 1.6, pop < 2 ? WHITE : ramp[1])
    if (pop < 2) disc(out, tx, ty, 2.5 - pop, WHITE)
  }
  if (pop === 0) out.shake = [g.side, 1]
  for (let i = 0; i < 12; i++) {
    if (pop < 0) break
    const s = shard(a, i, tx, ty, g.ground, pop)
    if (pop < s.land) {
      const prev = shard(a, i, tx, ty, g.ground, pop - 1)
      dot(out, prev.x, prev.y, ramp[3])
      plus(out, s.x, s.y, ramp[2], ramp[0])
    } else {
      const burn = pop - s.land
      const dying = phase(burn, 6, 12)
      if (burn < 12) tongue(out, s.x, g.ground, Math.max(1, Math.round((3 + (i % 3)) * (1 - dying))), ramp, Math.sin(t * 0.9 + i), dying > 0.4 ? 1 : 0)
      else if (burn < 18) wisp(out, s.x, g.ground - 2 - (burn - 12) * 0.6, (burn - 12) / 6)
    }
  }
}

const WHEEL_FORM = 9
const WHEEL_HIT = 22
const WHEEL_SPARKS = 18

// A ring of fire unfurls around the body, then the mon rolls in inside the spinning
// wheel, crashes into the target and the wheel bursts apart into spiralling embers
function flamewheel(out, t, a, g, c) {
  const ramp = heat(c)
  const far = clamp(g.reach - 3, 2, 12)
  const H = WHEEL_HIT
  const pos = keys(t, [[0, 0], [WHEEL_FORM, -1], [H, far, easeIn], [H + 2, far - 1], [H + 12, 0, easeOut]])
  out.dx = g.side * Math.round(pos)
  if (t >= WHEEL_FORM && t < H) out.dy = (t >> 1) % 2 ? -1 : 0
  if (t >= 2 && t < H) out.shade = glow(ramp[2], t % 2 ? 0.3 : 0.15)
  if (t === H) out.shade = tint(WHITE, 0.5)

  const cx = (g.left + g.right) / 2 + out.dx
  const cy = (g.top + g.bottom) / 2
  const rx = (g.right - g.left) / 2 + 2.5
  const ry = Math.min((g.bottom - g.top) / 2 + 2, cy, g.ground - cy)
  const spin = g.side * (t * 0.35 + pos * 0.45)
  const grow = phase(t, 1, WHEEL_FORM)
  const burst = phase(t, H, H + 6)
  if (t >= 1 && t < H + 6) {
    const r = 1 + burst * 0.8
    for (let k = 0; k < WHEEL_SPARKS; k++) {
      const base = (k * 2 * Math.PI) / WHEEL_SPARKS
      if (base > grow * 2 * Math.PI + 0.01) continue
      if (burst > 0 && rnd(a.seed, k, t) < burst) continue
      // Each flame drags a tail behind it, against the spin
      for (let j = 0; j < 3; j++) {
        const angle = base + spin - g.side * j * 0.14
        dot(out, cx + Math.cos(angle) * rx * r, cy + Math.sin(angle) * ry * r, heatAt(ramp, (k % 3 ? 0.2 : 0.05) + j * 0.25 + burst * 0.3))
      }
    }
  }

  const hx = g.ahead(far + 1)
  const hy = g.mouth.y + 1
  const hit = t - H
  if (hit >= 0 && hit < 2) out.shake = [hit ? -g.side : 2 * g.side, hit ? 0 : 1]
  if (hit >= 0 && hit < 5) fireBlob(out, hx, hy, [2.5, 4, 3.5, 2.5, 1.5][hit], ramp, a.seed, t)
  emit(t, { count: 14, gap: 0.2, start: H, life: 10 }, (i, age, f) => {
    const angle = (i * 2 * Math.PI) / 14 + g.side * age * 0.25
    const r = rx + age * 0.9
    const y = cy + Math.sin(angle) * r * 0.7
    if (y <= g.ground) dot(out, (g.left + g.right) / 2 + g.side * far + Math.cos(angle) * r, y, heatAt(ramp, 0.2 + f * 0.7))
  })
}

const INC_GO = 8
const INC_REACH = 17

// Suck in a breath, then loose a wall of fire that sweeps across the ground to the
// target, scorching the earth behind it, and leaves the target smouldering in falling ash
function incinerate(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx } = g.target
  const ty = clamp(g.target.y, 3, g.ground - 2)
  const dist = Math.abs(tx - mx) + 2
  if (t >= 1 && t < INC_GO) {
    out.sx = 1 - 0.06 * phase(t, 1, INC_GO)
    out.dx = -g.side
    dot(out, mx, my, ramp[t % 2])
  } else if (t >= INC_GO && t < INC_GO + 3) {
    out.dx = g.side
    out.shade = glow(ramp[1], 0.3)
  }

  // The wall of flame, rising as it rolls out, with cooler echoes behind it
  if (t >= INC_GO && t < INC_REACH + 4) {
    const front = dist * phase(t, INC_GO, INC_REACH)
    const fall = phase(t, INC_REACH, INC_REACH + 4)
    for (let e = 0; e < 6; e++) {
      const d = front - e
      if (d < 1) continue
      const hgt = clamp(4 + d * 0.7, 4, g.pixels * 0.65) * (1 - fall * 0.7) * (1 - e * 0.1)
      const x = g.ahead(d)
      for (let y = g.ground; y >= g.ground - hgt; y--) {
        const f = (g.ground - y) / hgt
        dot(out, x + g.side * Math.round(f * f * 1.5), y, heatAt(ramp, e * 0.12 + f * 0.6 + (rnd(a.seed, y, t) < 0.2 ? 0.15 : 0)))
      }
      if (e === 0) tongue(out, x + g.side * 2, g.ground - Math.round(hgt), 3, ramp, g.side * 1.5, 1)
    }
  }
  // Scorched ground behind the wall, glowing then going dark
  if (t >= INC_GO + 1) {
    const front = dist * phase(t, INC_GO, INC_REACH)
    const cool = phase(t, INC_REACH, a.ticks - 1)
    for (let d = 1; d < front - 2; d++) {
      if (cool >= 1 || rnd(a.seed, d, 9) < cool) continue
      dot(out, g.ahead(d), g.ground, (d + (t >> 1)) % 4 === 0 && cool < 0.5 ? ramp[3] : 0x3a2c28)
    }
  }
  if (t === INC_REACH) out.shake = [g.side, 0]
  // The target chars: a dark cloud with glowing specks, then ash drifting down
  const burnt = t - INC_REACH
  if (burnt >= 0 && burnt < 10) {
    const r = [3, 4, 4.5, 4.5, 4, 4, 3.5, 3, 2.5, 2][burnt]
    for (let k = 0; k < 14; k++) {
      const angle = rnd(a.seed, k, 12) * Math.PI * 2
      const d = rnd(a.seed, k, 13) * r
      disc(out, tx + Math.cos(angle) * d, ty - 1 + Math.sin(angle) * d, 0.8, k % 2 ? 0x463a36 : 0x2e2624)
    }
    fireBlob(out, tx, ty, r * 0.6, ramp, a.seed, t)
  }
  emit(t, { count: 14, gap: 1, start: INC_REACH + 2, life: 12 }, (i, age, f) => {
    const x = tx + (rnd(a.seed, i, 14) - 0.5) * 8 + Math.sin(age * 0.5 + i) * 1.5
    const y = ty - 4 + rnd(a.seed, i, 15) * 3 + age * 0.6
    if (y > g.ground) return
    dot(out, x, y, f < 0.3 ? ramp[3] : 0x6e6462)
    if (i % 3 === 0) dot(out, x + 1, y, 0x4a4240)
  })
}

const HOT_RELEASE = 20
const HOT_END = 32

// Heat up from orange to white hot, trembling with steam rising, then unload everything
// in one colossal blast. Afterwards the mon is spent: dull, sagging, and smoking.
function overheat(out, t, a, g, c) {
  const ramp = heat(c)
  const my = g.mouth.y
  const hot = easeIn(phase(t, 0, HOT_RELEASE))
  if (t < HOT_RELEASE) {
    out.shade = glow(mix(ramp[2], WHITE, hot), 0.2 + 0.6 * hot)
    out.sx = 1 + 0.06 * hot
    out.sy = out.sx
    if (hot > 0.3) out.dx = t % 2 ? 1 : -1
    if (hot > 0.6) out.shake = [t % 2, 0]
  }
  emit(t, { count: 14, gap: 1.2, start: 3, life: 6 }, (i, age, f) => {
    const x = lerp(g.left, g.right, rnd(a.seed, i, 2)) + Math.sin(age + i)
    const top = topAt(g, Math.round(x))
    if (top >= 0) dot(out, x + out.dx, top - 1 - age, f < 0.4 ? ramp[0] : f < 0.7 ? ramp[1] : 0x9a9292)
  })

  // The blast: a thick column of fire rushing ahead, white hot at its heart
  const rel = t - HOT_RELEASE
  if (rel >= 0 && t < HOT_END + 2) {
    const len = Math.max(g.reach, Math.abs(g.target.x - g.mouth.x)) + 2
    const front = len * easeOut(phase(t, HOT_RELEASE, HOT_RELEASE + 4))
    const thin = phase(t, HOT_END - 4, HOT_END + 2)
    const half = clamp((g.bottom - g.top) * 0.4, 3, 7) * (1 - thin * 0.85)
    for (let d = 0; d <= front; d++) {
      const hh = half * Math.min(1, 0.5 + d / 6) + Math.sin(d * 0.7 - t * 1.4) * 0.8
      for (let y = Math.round(my - hh); y <= my + hh; y++) {
        if (y < 0 || y > g.ground) continue
        const f = Math.abs(y - my) / Math.max(1, hh)
        dot(out, g.ahead(d), y, heatAt(ramp, f * 0.85 + thin * 0.2 + (rnd(a.seed, d * 31 + y, t) < 0.15 ? 0.12 : 0)))
      }
    }
    out.dx = -g.side * Math.round(2 * (1 - thin))
    out.shade = rel < 2 ? tint(WHITE, 0.7) : glow(ramp[1], 0.4 * (1 - thin))
    if (rel < 8) out.shake = [rel % 2 ? -g.side : g.side, rel % 3 === 0 ? 1 : 0]
  }

  // Spent: grey and slumped, cooling slowly back to normal
  const spent = phase(t, HOT_END, HOT_END + 3) * (1 - phase(t, HOT_END + 8, a.ticks - 1))
  if (spent > 0) {
    out.shade = tint(0x3a3434, 0.5 * spent)
    out.sy = 1 - 0.06 * spent
    out.sx = 1 + 0.03 * spent
  }
  emit(t, { count: 7, gap: 2.5, start: HOT_END, life: 10 }, (i, age, f) => {
    const x = lerp(g.left, g.right, rnd(a.seed, i, 4))
    const top = topAt(g, Math.round(x))
    if (top >= 0) wisp(out, x + Math.sin(age * 0.5 + i), top - 1 - age * 0.5, f)
  })
}

const INFERNO_SHOT = 8
const INFERNO_LAND = 16
const INFERNO_MERGE = 30
const INFERNO_FADE = 42
const INFERNO_PILLARS = 5

// Hunch in a crimson glow and send a low fireball skimming to the target. Pillars of
// fire spring up in a ring around it, circle in closer and closer, then fuse into one
// towering blaze that swallows it before burning down to heavy smoke.
function inferno(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: mx, y: my } = g.mouth
  const tx = g.target.x
  const base = Math.min(g.ground, g.target.y + 4)
  if (t >= 1 && t < INFERNO_SHOT) {
    out.sy = 1 - 0.06 * phase(t, 1, INFERNO_SHOT)
    out.shade = glow(ramp[3], t % 2 ? 0.35 : 0.2)
    ring(out, mx, my, 4 - 3 * phase(t, 1, INFERNO_SHOT), ramp[(t % 2) + 2])
  } else if (t >= INFERNO_SHOT && t < INFERNO_SHOT + 2) out.dx = -g.side

  if (t >= INFERNO_SHOT && t < INFERNO_LAND) {
    const f = phase(t, INFERNO_SHOT, INFERNO_LAND)
    const x = lerp(g.ahead(1), tx, f)
    const y = lerp(my, base - 1, Math.sqrt(f))
    for (let k = 1; k <= 4; k++) dot(out, x - g.side * k, y - (k > 2 ? 1 : 0), ramp[Math.min(4, k + 1)])
    fireBlob(out, x, y, 1.6, ramp, a.seed, t)
  }

  const lit = t - INFERNO_LAND
  if (lit === 0) out.shake = [g.side, 1]
  if (lit >= 0 && t < INFERNO_MERGE + 2) {
    const close = easeIn(phase(t, INFERNO_LAND + 3, INFERNO_MERGE + 2))
    const rx = lerp(7, 0.5, close)
    const grow = easeOut(phase(t, INFERNO_LAND, INFERNO_LAND + 5))
    for (let k = 0; k < INFERNO_PILLARS; k++) {
      const angle = t * 0.25 + (k * 2 * Math.PI) / INFERNO_PILLARS
      const near = Math.sin(angle)
      const h = (5 + near * 1.5 + close * 3) * grow
      blaze(out, tx + Math.cos(angle) * rx, base + Math.round(near * 1.5 * (1 - close)), 3, h, ramp, t + k, a.seed + k, near < 0 ? 1 : 0)
    }
  }
  // The fused blaze: tall and wide, its rim smouldering crimson
  if (t >= INFERNO_MERGE && t < a.ticks - 6) {
    const rise = easeOut(phase(t, INFERNO_MERGE, INFERNO_MERGE + 4))
    const fade = phase(t, INFERNO_FADE, a.ticks - 6)
    const h = clamp(g.pixels * 0.75, 10, 20) * rise * (1 - fade * 0.8)
    blaze(out, tx, base, 11, h, ramp, t, a.seed, fade > 0.5 ? 2 : fade > 0 ? 1 : 0)
    if (t < INFERNO_FADE) out.shake = [t % 2 ? 1 : 0, 0]
  }
  emit(t, { count: 16, gap: 0.8, start: INFERNO_MERGE, life: 8 }, (i, age, f) => {
    const x = tx + (rnd(a.seed, i, 3) - 0.5) * 10 + Math.sin(age * 0.7 + i)
    const y = base - 4 - rnd(a.seed, i, 4) * 8 - age
    if (y >= 0) dot(out, x, y, heatAt(ramp, 0.15 + f * 0.7))
  })
  emit(t, { count: 9, gap: 1.2, start: INFERNO_FADE - 2, life: 11 }, (i, age, f) => {
    wisp(out, tx + (rnd(a.seed, i, 5) - 0.5) * 9 + Math.sin(age * 0.5 + i), base - 6 - rnd(a.seed, i, 6) * 6 - age * 0.6, f)
  })
}

const CRASH_JUMP = 8
const CRASH_TOP = 14
const CRASH_HIT = 18

// Crouch and glow red hot, leap high and come down like a falling meteor onto the
// target. Fire splashes out along the ground both ways as the ground cracks.
function heatcrash(out, t, a, g, c) {
  const ramp = heat(c)
  const H = CRASH_HIT
  const far = clamp(g.reach - 2, 2, 14)
  const high = clamp(g.top, 2, 9)
  out.dx = g.side * Math.round(keys(t, [[CRASH_JUMP, 0], [H, far, linear], [H + 6, far], [a.ticks - 4, 0, easeInOut]]))
  out.dy = Math.round(keys(t, [[CRASH_JUMP, 0], [CRASH_TOP, -high, easeOut], [H, 0, easeIn], [H + 8, 0], [H + 12, -2, easeOut], [H + 16, 0, easeIn]]))
  if (t < CRASH_JUMP) {
    const f = easeOut(phase(t, 0, CRASH_JUMP))
    out.sy = 1 - 0.12 * f
    out.sx = 1 + 0.08 * f
    out.shade = glow(ramp[3], 0.2 + 0.25 * f)
  } else if (t < H) {
    out.sy = t < CRASH_TOP ? 1.06 : 1.12
    out.sx = t < CRASH_TOP ? 0.96 : 0.92
    out.shade = glow(t < CRASH_TOP ? ramp[2] : ramp[1], 0.5)
    if (t >= CRASH_TOP) {
      // Flames stream up off the body as it plummets
      for (let x = g.left; x <= g.right; x += 2) {
        const top = topAt(g, x)
        if (top < 0) continue
        for (let k = 1; k <= 3 + ((x + t) % 2); k++) dot(out, x + out.dx, top + out.dy - k * 1.2, heatAt(ramp, 0.15 + k * 0.18))
      }
    }
  } else if (t < H + 6) {
    const f = 1 - phase(t, H, H + 6)
    out.sy = 1 - 0.22 * f
    out.sx = 1 + 0.18 * f
    if (t === H) out.shade = tint(WHITE, 0.5)
  }
  const hit = t - H
  if (hit >= 0 && hit < 4) out.shake = [[0, 2], [g.side, 1], [-g.side, 1], [0, 1]][hit]

  // Fire splashing out both ways along the ground, and the cracks it leaves
  const cx = (g.left + g.right) / 2 + g.side * far
  const half = (g.right - g.left) / 2
  if (hit >= 0 && hit < 14) {
    const dying = phase(hit, 6, 14)
    for (const dir of [-1, 1]) {
      const run = half + 1 + hit * 1.4
      for (let k = 0; k < 3; k++) {
        const x = cx + dir * (run - k * 2.5)
        if (x < 0 || x >= g.columns) continue
        tongue(out, x, g.ground, Math.max(1, Math.round((4 - k) * (1 - dying))), ramp, dir * 1.5, dying > 0.5 ? 2 : k)
      }
    }
  }
  if (hit >= 0) {
    const fade = phase(t, a.ticks - 10, a.ticks - 1)
    for (let d = -half - 4; d <= half + 4; d++) {
      if (rnd(a.seed, d + 40, 7) < 0.45 + fade * 0.55) continue
      const col = hit < 8 && (d + hit) % 3 === 0 ? ramp[2] : 0x3a2a26
      dot(out, cx + d, g.ground, col)
      if (Math.abs(d) % 4 === 1) dot(out, cx + d, g.ground - 1, col)
    }
  }
  emit(t, { count: 10, gap: 0, start: H, life: 9 }, (i, age, f) => {
    const dir = i % 2 ? 1 : -1
    const x = cx + dir * (half + rnd(a.seed, i, 2) * 2 + age * (0.6 + rnd(a.seed, i, 3) * 0.6))
    const y = g.ground - 1 - age * 1.3 + 0.16 * age * age
    if (y <= g.ground) dot(out, x, y, f < 0.5 ? ramp[1] : 0x8a7060)
  })
}

const WAVE_INHALE = 8
const WAVE_END = 34

// Swell up drawing a deep breath, then blow out a rolling haze of hot air. Rippling
// bands of shimmer sweep across the whole strip and the target wavers in the heat.
function heatwave(out, t, a, g, c) {
  const ramp = heat(c)
  const my = g.mouth.y
  const { x: tx } = g.target
  const ty = clamp(g.target.y, 3, g.ground - 3)
  if (t >= 1 && t < WAVE_INHALE) {
    const f = easeOut(phase(t, 1, WAVE_INHALE))
    out.sx = 1 + 0.06 * f
    out.sy = 1 + 0.05 * f
    out.dx = -g.side
  } else if (t >= WAVE_INHALE && t < WAVE_END) {
    out.skew = lean(g, g.side * 1.5)
    out.shade = glow(ramp[1], t % 4 < 2 ? 0.25 : 0.12)
    out.sx = 0.97
  }

  if (t >= WAVE_INHALE && t < WAVE_END + 6) {
    const front = (g.reach + 6) * easeOut(phase(t, WAVE_INHALE, WAVE_INHALE + 12))
    const thin = phase(t, WAVE_END - 4, WAVE_END + 6)
    const top = Math.max(1, my - 8)
    for (let row = top; row <= g.ground - 1; row += 4) {
      // Bands fan out from the mouth's height as they travel
      for (let d = 1; d <= front; d++) {
        const f = d / Math.max(1, front)
        if (rnd(a.seed, d * 7 + row, t >> 1) < thin + f * 0.25) continue
        const y = lerp(my, row, Math.min(1, d / 8)) + Math.sin(d * 0.55 - t * 0.9 + row) * 1.2
        const x = g.ahead(d)
        if (x < 0 || x >= g.columns || y > g.ground) continue
        dot(out, x, y, (d - t * 2 + row) % 8 < 4 ? ramp[1] : f < 0.5 ? ramp[2] : ramp[3])
      }
    }
  }
  emit(t, { count: 10, gap: 1.5, start: WAVE_INHALE + 8, life: 8 }, (i, age, f) => {
    dot(out, tx + (rnd(a.seed, i, 3) - 0.5) * 8, ty + 2 - age * 0.9, f < 0.5 ? ramp[1] : ramp[3])
  })
}

const ERUPT_BOOM = 13
const ERUPT_GLOBS = 12

// Crouch as the ground rumbles and glowing cracks run out to the target. Then lava
// blasts up from the ground in a fountain, raining molten globs down on the target
// that pool, splash, and crust over.
function eruption(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: tx } = g.target
  const vent = g.ahead(clamp(Math.round(g.reach * 0.25), 3, 6))
  const B = ERUPT_BOOM
  if (t < B) {
    const f = phase(t, 0, B)
    out.sy = 1 - 0.08 * easeOut(f)
    out.sx = 1 + 0.05 * easeOut(f)
    out.shade = glow(ramp[3], 0.3 * f)
    if (t > 3) out.shake = [t % 2 ? 1 : -1, 0]
  } else if (t < B + 3) {
    out.dy = -1
    out.shake = [0, t === B ? 2 : 1]
    out.shade = tint(WHITE, t === B ? 0.5 : 0.2)
  }

  // Cracks along the ground from the feet to the target, brightening as they fill
  const crack = Math.abs(tx - vent) + 3
  const run = crack * easeOut(phase(t, 2, B))
  const crust = phase(t, a.ticks - 14, a.ticks - 1)
  for (let d = -2; d <= run; d++) {
    if (crust >= 1 || rnd(a.seed, d + 9, 20) < crust) continue
    const hot = t < B ? (t + d) % 4 === 0 : t < a.ticks - 14
    const x = g.ahead(d + 2)
    dot(out, x, g.ground - ((d * 7) % 3 === 0 ? 1 : 0), hot ? ramp[1] : ramp[3])
  }

  // The fountain: a pillar of lava with a boiling cap
  const spout = t - B
  if (spout >= 0 && spout < 16) {
    const h = clamp(g.pixels * 0.7, 10, 18) * (spout < 3 ? easeOut(spout / 3) : 1 - phase(spout, 10, 16))
    for (let k = 0; k <= h; k++) {
      const f = k / Math.max(1, h)
      for (const off of [-2, -1, 0, 1, 2]) dot(out, vent + off + Math.round(Math.sin(k * 0.5 + t) * 0.6), g.ground - k, Math.abs(off) < 2 ? heatAt(ramp, f * 0.4 + Math.abs(off) * 0.15) : heatAt(ramp, 0.5 + f * 0.3))
    }
    if (h > 2) fireBlob(out, vent, g.ground - h, 3, ramp, a.seed, t)
  }

  // Globs of lava arcing over onto the target, each splashing where it lands
  for (let i = 0; i < ERUPT_GLOBS; i++) {
    const start = B + 2 + i * 1.5
    const flight = 7 + rnd(a.seed, i, 2) * 3
    const age = t - start
    if (age < 0) continue
    const lx = tx + (rnd(a.seed, i, 3) - 0.5) * 9
    const f = age / flight
    if (f < 1) {
      const peak = clamp(g.pixels * 0.85, 12, 22)
      const x = lerp(vent, lx, f)
      const y = lerp(g.ground - 6, g.ground - 1, f) - peak * 4 * f * (1 - f) * 0.6
      if (y < 0) continue
      fireBlob(out, x, y, 1.3, ramp, a.seed + i, t)
      dot(out, x - g.side, y - 2, ramp[4])
    } else {
      const burn = age - flight
      if (burn < 3) {
        dot(out, lx - 1 - burn, g.ground - 1 - (burn === 1 ? 1 : 0), ramp[1])
        dot(out, lx + 1 + burn, g.ground - 1 - (burn === 1 ? 1 : 0), ramp[1])
      }
      if (i === 0 && burn < 2) out.shake = [g.side, 0]
      if (burn < 12) tongue(out, lx, g.ground, Math.max(1, Math.round(3 * (1 - burn / 12))), ramp, Math.sin(t + i), burn > 7 ? 1 : 0)
    }
  }
  // The lava pool by the target, cooling to a dark crust with glowing seams
  if (t >= B + 10) {
    const w = Math.min(6, (t - B - 10) * 0.6)
    for (let d = -w; d <= w; d++) {
      const x = tx + d
      const seam = (d + (t >> 2)) % 3 === 0
      dot(out, x, g.ground, crust > 0 ? (seam && crust < 0.8 ? ramp[3] : 0x3e2a24) : seam ? ramp[1] : ramp[2])
      if (Math.abs(d) < w - 1) dot(out, x, g.ground - 1, crust > 0.5 ? 0x4a3630 : ramp[3])
    }
  }
  emit(t, { count: 7, gap: 2, start: B + 12, life: 12 }, (i, age, f) => {
    wisp(out, vent + (rnd(a.seed, i, 5) - 0.5) * 4 + Math.sin(age * 0.5 + i), g.ground - 6 - age * 0.7, f)
  })
}

const PLUME_START = 8
const PLUME_GAP = 4
const PLUME_LIFE = 12

// One plume of lava at x, `age` ticks into its LIFE: it shoots up, throws droplets
// both ways, and slumps back into the ground
function plume(out, a, x, ground, age, high, ramp, salt) {
  if (age < 0 || age >= PLUME_LIFE) return
  const f = age / PLUME_LIFE
  const h = high * Math.sin(Math.min(1, f * 1.6) * Math.PI * 0.5) * (1 - phase(age, 7, PLUME_LIFE))
  for (let k = 0; k <= h; k++) {
    const u = k / Math.max(1, h)
    dot(out, x, ground - k, heatAt(ramp, u * 0.35))
    if (u < 0.7) {
      dot(out, x - 1, ground - k, ramp[2])
      dot(out, x + 1, ground - k, ramp[3])
    }
  }
  for (let i = 0; i < 4; i++) {
    const dir = i % 2 ? 1 : -1
    const v = 0.5 + rnd(a.seed, salt * 9 + i, 4) * 0.6
    const u = age - 2
    if (u < 0) continue
    const y = ground - high + u * -0.8 + 0.18 * u * u
    if (y <= ground) dot(out, x + dir * v * u, y, u < 5 ? ramp[1] : ramp[3])
  }
}

// Lava seeps out under the body, then plumes burst from the ground in rings rolling
// outward both ways, the last ones gushing up right under the target
function lavaplume(out, t, a, g, c) {
  const ramp = heat(c)
  const pool = phase(t, 1, PLUME_START)
  if (t < PLUME_START + 3 * PLUME_GAP + 2) {
    out.shade = glow(ramp[3], 0.3 * pool)
    if (t >= PLUME_START) out.dy = (t - PLUME_START) % PLUME_GAP === 0 ? -1 : 0
    if (t >= PLUME_START && (t - PLUME_START) % PLUME_GAP === 0) out.shake = [0, 1]
  }
  // The molten pool under the feet, bubbling
  const drain = phase(t, a.ticks - 12, a.ticks - 2)
  const half = ((g.right - g.left) / 2 + 2) * pool * (1 - drain)
  const mid = (g.left + g.right) / 2
  for (let d = -half; d <= half; d++) {
    back(out, mid + d, g.ground, (Math.round(d) + (t >> 1)) % 3 ? ramp[3] : ramp[2])
    if ((Math.round(d) * 5 + t) % 7 === 0) dot(out, mid + d, g.ground - 1, ramp[1])
  }

  // Front plumes march out to the target, the back ones as far as the strip allows
  const backX = g.side > 0 ? g.left : g.right
  const span = Math.max(3, g.reach)
  const high = clamp(g.pixels * 0.55, 7, 13)
  for (let k = 0; k < 4; k++) {
    const age = t - PLUME_START - k * PLUME_GAP
    const fx = g.ahead(Math.round((span * (k + 1)) / 4))
    plume(out, a, fx, g.ground, age, high * (k === 3 ? 1.3 : 1), ramp, k)
    const bx = backX - g.side * (2 + k * 3)
    if (bx >= 1 && bx < g.columns - 1) plume(out, a, bx, g.ground, age - 1, high * 0.8, ramp, k + 10)
  }
  const tx = g.ahead(span)
  const hit = t - PLUME_START - 3 * PLUME_GAP - 3
  if (hit === 0) out.shake = [g.side, 1]
  if (hit >= 0 && hit < 4) fireBlob(out, tx, g.target.y, [2, 3, 2.5, 1.5][hit], ramp, a.seed, t)
  emit(t, { count: 8, gap: 2, start: PLUME_START + 6, life: 12 }, (i, age, f) => {
    const x = g.ahead(Math.round(span * ((i % 4) + 1) / 4)) + Math.sin(age * 0.5 + i)
    const col = mix(0x6a3a36, 0x9a8a88, f)
    dot(out, x, g.ground - 8 - age * 0.6, col)
    if (f < 0.6) dot(out, x + 1, g.ground - 7 - age * 0.6, dark(col, 0.2))
  })
}

const KICK_WIND = 8
const KICK_STRIKE = 14

// Rock back as the foot catches fire, then whip it up in a blazing crescent that
// cracks into the target with a critical white star and a burst of flame
function blazekick(out, t, a, g, c) {
  const ramp = heat(c)
  const S = KICK_STRIKE
  const { x: tx } = g.target
  const ty = clamp(g.target.y, 4, g.ground - 3)
  const far = clamp(g.reach - 8, 0, 6)
  out.dx = g.side * Math.round(keys(t, [[0, 0], [KICK_WIND, -2, easeOut], [S, far, easeIn], [S + 4, far], [S + 14, 0, easeInOut]]))
  out.skew = lean(g, g.side * keys(t, [[0, 0], [KICK_WIND, -2, easeOut], [S, 2, easeIn], [S + 4, 2], [S + 12, 0]]))
  if (t >= 2 && t < S) out.shade = glow(ramp[2], t % 2 ? 0.25 : 0.1)
  if (t === S) out.shade = tint(WHITE, 0.4)

  const footY = g.bottom - 1
  const foot = g.frontAt(footY) + out.dx
  if (t >= 2 && t < KICK_WIND + 1) {
    const f = phase(t, 2, KICK_WIND)
    tongue(out, foot, footY + 1, Math.round(2 + f * 3), ramp, -g.side * 1.5)
    if (t % 2) dot(out, foot - g.side, footY, ramp[0])
  }

  // The crescent: an arc swept from under the target up and through it, around a
  // pivot just behind it, squashed to stay above the ground
  const R = clamp(Math.abs(tx - foot) * 0.5, 5, 8)
  const Ry = Math.min(R, g.ground - ty)
  const px = tx - g.side * R
  const swing = keys(t, [[KICK_WIND, 0], [S, 1, easeIn], [S + 3, 1.15, easeOut]])
  const fade = phase(t, S + 1, S + 9)
  const from = 1.6
  if (t >= KICK_WIND && t < S + 9) {
    const head = from - swing * 1.6
    for (let s = from; s >= head; s -= 0.05) {
      const age = (s - head) / 1.6
      if (age > 1 - fade) continue
      for (let w = 0; w < 4; w++) {
        const k = 1 - (w * (1 - age * 0.7)) / R
        const y = ty + Math.sin(s) * Ry * k
        if (y > g.ground || y < 0) continue
        dot(out, px + g.side * Math.cos(s) * R * k, y, heatAt(ramp, age * 0.75 + w * 0.1 + fade * 0.3))
      }
    }
    if (t < S + 2) fireBlob(out, px + g.side * Math.cos(head) * R, ty + Math.sin(head) * Ry, 1.8, ramp, a.seed, t)
  }

  const hit = t - S
  if (hit >= 0 && hit < 2) out.shake = [hit ? -g.side : 2 * g.side, hit ? 0 : 1]
  if (hit >= 0 && hit < 4) {
    const r = [5, 6, 4, 2][hit]
    for (let d = 1; d <= r; d++) {
      const col = d < 2 ? WHITE : d < 4 ? ramp[0] : ramp[1]
      dot(out, tx + d, ty, col)
      dot(out, tx - d, ty, col)
      dot(out, tx, ty + d * 0.7, col)
      dot(out, tx, ty - d * 0.7, col)
    }
    dot(out, tx, ty, WHITE)
  }
  if (hit >= 1 && hit < 6) fireBlob(out, tx, ty, [3.5, 3.5, 3, 2, 1.2][hit - 1], ramp, a.seed, t)
  if (hit >= 3 && hit < 16) {
    const dying = phase(hit, 10, 16)
    tongue(out, tx, ty + 2, Math.round(5 * (1 - dying * 0.7)), ramp, Math.sin(t * 0.8), dying > 0.5 ? 1 : 0)
    tongue(out, tx + 2, ty + 2, Math.round(3 * (1 - dying * 0.7)), ramp, Math.sin(t * 0.7 + 2), 1)
  }
  emit(t, { count: 4, gap: 2, start: S + 10, life: 10 }, (i, age, f) => {
    wisp(out, tx + (rnd(a.seed, i, 9) - 0.5) * 5 + Math.sin(age * 0.5 + i), ty - 2 - age * 0.5, f)
  })
}

const BLUE_LIT = 12
const BLUE_BURST = 16
const BLUE_FADE = 36

// Cold blue flames wrap the body and frost the air, then with a thrust the target
// blows up in a blue fireball and a towering blue blaze, white hot at its tips
function blueflare(out, t, a, g, c) {
  const ramp = coldFire(c)
  const { x: tx } = g.target
  const ty = clamp(g.target.y, 6, g.ground - 4)
  const base = Math.min(g.ground, ty + 5)
  const lit = phase(t, 1, BLUE_LIT) * (1 - phase(t, BLUE_BURST, BLUE_BURST + 6))
  if (t < BLUE_BURST + 6) {
    if (lit > 0) out.shade = glow(t % 2 ? c : ramp[1], 0.25 + 0.3 * lit)
    if (t >= BLUE_LIT && t < BLUE_BURST) out.dx = -g.side
    else if (t >= BLUE_BURST && t < BLUE_BURST + 3) out.dx = g.side
  }
  engulf(out, t, a, g, ramp, lit)
  // Frost-bright motes swirling in toward the body
  emit(t, { count: 12, gap: 0.8, start: 1, life: 6 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 2) * Math.PI * 2
    const r = (g.right - g.left) * 0.7 * (1 - f) + 2
    dot(out, g.cx + Math.cos(angle) * r, g.cy + Math.sin(angle) * r * 0.8, f < 0.5 ? ramp[1] : WHITE)
  })

  const b = t - BLUE_BURST
  if (b === 0) disc(out, tx, ty, 3, WHITE)
  if (b >= 0 && b < 3) out.shake = [[2 * g.side, 1], [-g.side, 1], [g.side, 0]][b]
  if (b >= 1 && b < 7) {
    ring(out, tx, ty, 3 + b * 1.6, b < 3 ? WHITE : ramp[1])
    fireBlob(out, tx, ty, [5, 6, 5.5, 4.5, 3.5, 2.5][b - 1], ramp, a.seed, t)
  }
  if (b >= 3 && t < a.ticks - 4) {
    const fade = phase(t, BLUE_FADE, a.ticks - 4)
    const h = clamp(g.pixels * 0.7, 10, 18) * easeOut(phase(b, 3, 7)) * (1 - fade * 0.85)
    blaze(out, tx, base, 9, h, ramp, t, a.seed, fade > 0.5 ? 2 : fade > 0 ? 1 : 0)
    // White hot sparks leap off the top of the blaze
    if (fade < 0.5 && t % 2) spark(out, tx + Math.round(Math.sin(t * 1.3) * 3), base - h - 1, 1, ramp[1])
  }
  emit(t, { count: 14, gap: 1, start: BLUE_BURST + 4, life: 9 }, (i, age, f) => {
    const x = tx + Math.sin(age * 0.6 + i * 1.7) * (2 + f * 3)
    const y = base - 4 - age * 1.1 - rnd(a.seed, i, 3) * 4
    if (y >= 0) dot(out, x, y, f < 0.4 ? WHITE : f < 0.7 ? ramp[1] : ramp[2])
  })
  emit(t, { count: 6, gap: 1.5, start: BLUE_FADE, life: 10 }, (i, age, f) => {
    const col = mix(ramp[5], 0x9a9ab0, f)
    dot(out, tx + (rnd(a.seed, i, 4) - 0.5) * 7 + Math.sin(age * 0.5 + i), base - 8 - age * 0.6, col)
  })
}

const DANCE_TURN = 4
const DANCE_FLING = 28
const DANCE_HIT = 37

// Face out and dance, hopping and swaying while two ribbons of fire twirl around the
// body. Turn and fling the ribbons at the target, then glow as the dance lifts its power.
function fierydance(out, t, a, g, c) {
  const ramp = heat(c)
  const dancing = t >= DANCE_TURN && t < DANCE_FLING
  if (dancing) {
    const beat = t - DANCE_TURN
    out.dx = Math.round(Math.sin(beat * 0.5) * 2)
    out.dy = beat % 6 < 2 ? -1 : 0
    out.skew = lean(g, Math.round(Math.sin(beat * 0.5) * 2))
    out.shade = glow(ramp[1], beat % 4 < 2 ? 0.2 : 0.08)
  }

  // Two ribbons spiral down around the body, the far half tucked behind it
  const cx = (g.left + g.right) / 2 + out.dx
  const rx = (g.right - g.left) / 2 + 2
  if (t >= 2 && t < DANCE_FLING) {
    const grow = phase(t, 2, DANCE_TURN + 4)
    const n = 80
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < n * grow; k++) {
        const u = k / n
        const angle = t * 0.45 + r * Math.PI + u * Math.PI * 2
        const x = cx + Math.cos(angle) * rx
        const y = g.top + 1 + (g.bottom - g.top - 1) * u + out.dy
        const col = heatAt(ramp, ((u * 3 - t * 0.1) % 1 + 1) % 1 * 0.6 + 0.05)
        const paint = Math.sin(angle) > 0 ? dot : back
        paint(out, x, y, col)
        paint(out, x, y - 1, col)
      }
    }
  }

  // Flung ribbons: two streamers waving out to the target
  const { x: mx, y: my } = g.mouth
  const { x: tx } = g.target
  const ty = clamp(g.target.y, 3, g.ground - 3)
  if (t >= DANCE_FLING && t < DANCE_HIT + 2) {
    const head = easeIn(phase(t, DANCE_FLING, DANCE_HIT))
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < 10; k++) {
        const f = head - k * 0.05
        if (f < 0) continue
        const wave = Math.sin(f * 9 + r * Math.PI) * 3 * (1 - f)
        dot(out, lerp(mx, tx, f), lerp(my, ty, f) + wave, heatAt(ramp, 0.05 + k * 0.08))
      }
    }
  }
  const hit = t - DANCE_HIT
  if (hit === 0) out.shake = [g.side, 0]
  if (hit >= 0 && hit < 5) fireBlob(out, tx, ty, [2.5, 3.5, 3, 2, 1][hit], ramp, a.seed, t)
  emit(t, { count: 8, gap: 0, start: DANCE_HIT, life: 9 }, (i, age, f) => {
    const angle = (i / 8) * Math.PI * 2 + age * 0.3
    dot(out, tx + Math.cos(angle) * (2 + age), ty + Math.sin(angle) * (1 + age * 0.6), f < 0.5 ? ramp[1] : ramp[3])
  })

  // The dance lifts its power: a warm pulse and sparks rising off the body
  const pump = phase(t, DANCE_HIT, DANCE_HIT + 3) * (1 - phase(t, a.ticks - 6, a.ticks - 1))
  if (pump > 0) out.shade = glow(ramp[1], (t % 4 < 2 ? 0.3 : 0.12) * pump)
  emit(t, { count: 10, gap: 1, start: DANCE_HIT, life: 7 }, (i, age, f) => {
    const x = lerp(g.left, g.right, rnd(a.seed, i, 5))
    dot(out, x, g.bottom - age * 2 - rnd(a.seed, i, 6) * 4, f < 0.4 ? ramp[0] : ramp[2])
  })
}

const FUSION_THROW = 20
const FUSION_HIT = 30

// Look up and pour fire into a sun-like orb overhead until it is white hot, then hurl
// it down on the target in a huge blast with a shock ring and a rain of embers
function fusionflare(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: tx } = g.target
  const ty = clamp(g.target.y, 6, g.ground - 4)
  const big = clamp(g.pixels * 0.17, 3.5, 5)
  const ox = g.ahead(Math.min(3, g.reach))
  const oy = big + 1
  if (t >= 1 && t < FUSION_THROW) {
    out.skew = lean(g, -g.side * 2 * phase(t, 1, 6))
    out.dy = -1
    out.shade = glow(ramp[1], t % 2 ? 0.35 : 0.2)
  } else if (t >= FUSION_THROW && t < FUSION_THROW + 3) {
    out.skew = lean(g, g.side * 2)
    out.dx = g.side
  }
  // Streams of fire spiral up from the body into the orb
  emit(t, { count: 24, gap: 0.7, start: 1, life: 6 }, (i, age, f) => {
    const sx = lerp(g.left, g.right, rnd(a.seed, i, 2))
    const angle = f * 4 + i
    const x = lerp(sx, ox, f) + Math.cos(angle) * 2 * (1 - f)
    const y = lerp(g.cy, oy, easeIn(f))
    dot(out, x, y, f < 0.5 ? ramp[2] : ramp[1])
  })

  const fly = phase(t, FUSION_THROW, FUSION_HIT)
  if (t < FUSION_HIT) {
    const r = t < FUSION_THROW ? lerp(1, big, easeOut(phase(t, 2, FUSION_THROW - 2))) : big
    const x = lerp(ox, tx, easeIn(fly))
    const y = lerp(oy, ty, easeIn(fly))
    if (t >= FUSION_THROW) {
      for (let k = 5; k >= 1; k--) {
        const f = easeIn(Math.max(0, fly - k * 0.05))
        dot(out, lerp(ox, tx, f), lerp(oy, ty, f) - (k % 2), ramp[Math.min(4, k)])
      }
    }
    if (t >= 2) {
      fireBlob(out, x, y, r, ramp, a.seed, t)
      // Flares crawling round its rim
      for (let k = 0; k < 4; k++) {
        const angle = t * 0.4 + (k * Math.PI) / 2
        dot(out, x + Math.cos(angle) * (r + 1), y + Math.sin(angle) * (r + 1), ramp[2])
      }
      if (t > FUSION_THROW - 6) disc(out, x, y, r * 0.4, WHITE)
    }
  }

  const hit = t - FUSION_HIT
  if (hit >= 0 && hit < 2) disc(out, tx, ty, 5 - hit, WHITE)
  if (hit >= 0 && hit < 5) out.shake = [[0, 2], [2 * g.side, 1], [-2 * g.side, 1], [g.side, 0], [0, 1]][hit]
  if (hit >= 1 && hit < 9) {
    ring(out, tx, ty, 3 + hit * 1.8, hit < 4 ? WHITE : ramp[2])
    if (hit > 2) ring(out, tx, ty, 1 + hit * 1.3, ramp[1])
    fireBlob(out, tx, ty - hit * 0.3, [6, 6.5, 6, 5.5, 4.5, 3.5, 2.5, 1.5][hit - 1], ramp, a.seed, t)
  }
  emit(t, { count: 20, gap: 0, start: FUSION_HIT, life: 14 }, (i, age, f) => {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, 3) - 0.5) * 3
    const speed = 0.8 + rnd(a.seed, i, 4) * 1.1
    const y = ty + Math.sin(angle) * speed * age + 0.1 * age * age
    if (y <= g.ground && y >= 0) dot(out, tx + Math.cos(angle) * speed * age, y, heatAt(ramp, 0.1 + f * 0.8))
  })
  emit(t, { count: 8, gap: 1.2, start: FUSION_HIT + 6, life: 12 }, (i, age, f) => {
    wisp(out, tx + (rnd(a.seed, i, 5) - 0.5) * 10 + Math.sin(age * 0.5 + i), ty - 3 - age * 0.5, f)
  })
}

const MAGMA_LOB = 10
const MAGMA_LAND = 18
const MAGMA_BREAK = 46
const MAGMA_CRUST = 0x4a2a20
const MAGMA_ROCK = 0x6a4436

// A chunk of molten rock: glowing on the side facing us, dark crust behind
function chunk(out, x, y, ramp, near) {
  if (near) {
    dot(out, x, y, ramp[1])
    dot(out, x + 1, y, ramp[2])
    dot(out, x, y + 1, ramp[3])
    dot(out, x + 1, y + 1, MAGMA_CRUST)
  } else {
    back(out, x, y, MAGMA_ROCK)
    back(out, x + 1, y, MAGMA_CRUST)
    back(out, x, y + 1, MAGMA_CRUST)
  }
}

// Roar and heave a great glob of magma onto the target. It boils up into a storm of
// molten rocks whirling round it in tiers over a lava pool, then they fly out and cool.
function magmastorm(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx } = g.target
  const base = Math.min(g.ground, g.target.y + 5)
  if (t >= 1 && t < MAGMA_LOB) {
    out.dx = -g.side
    out.skew = lean(g, -g.side * 2)
    out.shade = glow(ramp[3], 0.3)
    fireBlob(out, mx, my, 0.5 + 1.5 * phase(t, 1, MAGMA_LOB), ramp, a.seed, t)
    ring(out, mx, my, 0.5 + 1.5 * phase(t, 1, MAGMA_LOB) + 0.6, MAGMA_CRUST)
  } else if (t >= MAGMA_LOB && t < MAGMA_LOB + 3) out.dx = g.side

  if (t >= MAGMA_LOB && t < MAGMA_LAND) {
    const f = phase(t, MAGMA_LOB, MAGMA_LAND)
    const x = lerp(g.ahead(1), tx, f)
    const y = lerp(my, base - 2, f) - 6 * 4 * f * (1 - f)
    fireBlob(out, x, y, 2, ramp, a.seed, t)
    ring(out, x, y, 2.4, MAGMA_CRUST, Math.PI / 2, 1.2)
    dot(out, x - g.side * 2, y - 1, ramp[3])
  }
  const land = t - MAGMA_LAND
  if (land >= 0 && land < 3) out.shake = [[0, 2], [g.side, 1], [-g.side, 0]][land]

  // The pool, then the whirling tiers of rock, tighter and higher up the storm
  const ebb = phase(t, MAGMA_BREAK, a.ticks - 2)
  if (land >= 0 && ebb < 1) {
    const w = Math.min(7, 2 + land) * (1 - ebb)
    for (let d = -w; d <= w; d++) dot(out, tx + d, base, (Math.round(d) + (t >> 1)) % 3 ? ramp[3] : ramp[2])
  }
  if (land >= 2 && t < MAGMA_BREAK) {
    const grow = easeOut(phase(land, 2, 10))
    for (let tier = 0; tier < 3; tier++) {
      const y0 = base - 2 - tier * 5 * grow
      const rx = (7 - tier * 1.5) * grow
      const n = 6 - tier
      for (let k = 0; k < n; k++) {
        const angle = t * (0.35 + tier * 0.1) + (k * 2 * Math.PI) / n + tier
        const near = Math.sin(angle) > 0
        chunk(out, tx + Math.cos(angle) * rx, y0 + Math.sin(angle) * 2, ramp, near)
      }
      // A molten ribbon binding the tier together
      for (let s = 0; s < 16; s++) {
        const angle = t * 0.5 + (s * Math.PI) / 8
        if (Math.sin(angle) > 0 && (s + t) % 3) dot(out, tx + Math.cos(angle) * (rx + 0.6), y0 + Math.sin(angle) * 2 + 0.8, ramp[2])
      }
    }
    if (land % 4 === 0) out.shake = [0, 1]
  }
  // Rocks thrown out of the breaking storm fall and go dark
  emit(t, { count: 14, gap: 0.3, start: MAGMA_BREAK, life: 12 }, (i, age, f) => {
    const dir = i % 2 ? 1 : -1
    const vx = dir * (0.6 + rnd(a.seed, i, 2) * 0.8)
    const y = base - 2 - rnd(a.seed, i, 3) * 8 - age * 0.9 + 0.14 * age * age
    const x = tx + vx * (age + 4)
    if (y > g.ground) return
    dot(out, x, y, f < 0.4 ? ramp[2] : f < 0.7 ? MAGMA_ROCK : MAGMA_CRUST)
    dot(out, x + 1, y, MAGMA_CRUST)
  })
  emit(t, { count: 6, gap: 1.5, start: MAGMA_BREAK + 2, life: 10 }, (i, age, f) => {
    wisp(out, tx + (rnd(a.seed, i, 4) - 0.5) * 8 + Math.sin(age * 0.5 + i), base - 5 - age * 0.6, f)
  })
}

const SACRED_CALL = 10
const SACRED_STRIKE = 16
const SACRED_FADE = 40

// A rainbow color for sacred fire, cycling with i and the tick
const rainbow = (i, t) => hsl(((i * 0.13 + t * 0.04) % 1 + 1) % 1, 0.9, 0.6)

// Rise in a golden glow as rainbow motes gather, then call down a column of sacred
// fire from the sky. It engulfs the target in gold flame with rainbow tips, and a
// rainbow ring rolls out over the ground.
function sacredfire(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: tx } = g.target
  const base = Math.min(g.ground, g.target.y + 5)
  if (t >= 1 && t < SACRED_STRIKE + 2) {
    out.dy = -Math.round(easeOut(phase(t, 1, SACRED_CALL)))
    out.shade = glow(0xffe080, t % 4 < 2 ? 0.4 : 0.25)
  }
  emit(t, { count: 12, gap: 0.8, start: 1, life: 7 }, (i, age, f) => {
    const angle = (i / 12) * Math.PI * 2 + age * 0.3
    const r = (g.right - g.left) * 0.6 * (1 - f) + 2
    dot(out, g.cx + Math.cos(angle) * r, g.cy + Math.sin(angle) * r * 0.7, rainbow(i, t))
  })

  // The column comes down from the top of the strip, gold and white with rainbow edges
  if (t >= SACRED_CALL && t < SACRED_STRIKE + 6) {
    const reach = base * easeIn(phase(t, SACRED_CALL, SACRED_STRIKE))
    const thin = phase(t, SACRED_STRIKE + 1, SACRED_STRIKE + 6)
    const half = 2 * (1 - thin)
    for (let y = 0; y <= reach; y++) {
      for (let d = -Math.ceil(half) - 1; d <= Math.ceil(half) + 1; d++) {
        const edge = Math.abs(d) > half
        if (edge && thin > 0.5) continue
        dot(out, tx + d, y, edge ? rainbow(y, t) : Math.abs(d) < 1 ? WHITE : ramp[1])
      }
    }
  }
  const hit = t - SACRED_STRIKE
  if (hit >= 0 && hit < 3) out.shake = [[0, 2], [g.side, 1], [-g.side, 0]][hit]
  if (hit >= 0 && hit < 4) fireBlob(out, tx, base - 3, [3, 4.5, 4, 3][hit], ramp, a.seed, t)
  if (hit >= 0 && hit < 12) {
    // The rainbow ring, flattened onto the ground
    const r = 2 + hit * 1.2
    for (let k = 0; k < 24; k++) {
      const angle = (k * Math.PI) / 12
      const y = base + Math.sin(angle) * r * 0.25
      if (y <= g.ground) dot(out, tx + Math.cos(angle) * r, y, rainbow(k, t))
    }
  }
  if (hit >= 2 && t < a.ticks - 4) {
    const fade = phase(t, SACRED_FADE, a.ticks - 4)
    const h = clamp(g.pixels * 0.55, 8, 14) * easeOut(phase(hit, 2, 6)) * (1 - fade * 0.85)
    blaze(out, tx, base, 7, h, ramp, t, a.seed, fade > 0.5 ? 2 : fade > 0 ? 1 : 0)
    // Rainbow tips dance on top of the gold flame
    for (let k = -2; k <= 2; k += 2) dot(out, tx + k, base - h * (1 - Math.abs(k) * 0.15) - 1, rainbow(k + 3, t))
  }
  emit(t, { count: 16, gap: 1.2, start: SACRED_STRIKE + 3, life: 10 }, (i, age, f) => {
    const x = tx + (rnd(a.seed, i, 3) - 0.5) * 8 + Math.sin(age * 0.6 + i)
    const y = base - 3 - rnd(a.seed, i, 4) * 6 - age * 0.9
    if (y >= 0 && f < 0.85) dot(out, x, y, rainbow(i, t))
  })
}

const SEAR_FIRE = [11, 19]
const SEAR_SHOTS = 10
const SEAR_SPEED = 1.7

// Curl up glowing hotter and hotter, then burst open and fire volleys of fireballs in
// every direction, the boldest one straight at the target
function searingshot(out, t, a, g, c) {
  const ramp = heat(c)
  const { x: tx } = g.target
  const ty = clamp(g.target.y, 3, g.ground - 2)
  const cx = g.cx
  const cy = g.cy
  if (t < SEAR_FIRE[0]) {
    const f = easeIn(phase(t, 0, SEAR_FIRE[0]))
    out.sx = 1 - 0.1 * f
    out.sy = 1 - 0.1 * f
    out.shade = glow(mix(ramp[2], WHITE, f * 0.6), 0.2 + 0.5 * f)
    ring(out, cx, cy, Math.min(cy - 1, (g.right - g.left) * 0.8 * (1 - f) + 3), ramp[(t % 2) + 1])
  }
  const toward = Math.atan2(ty - cy, tx - cx)
  SEAR_FIRE.forEach((at, v) => {
    const age = t - at
    if (age >= 0 && age < 2) {
      out.sx = 1.08
      out.sy = 1.08
      out.shade = tint(WHITE, age ? 0.3 : 0.6)
      out.shake = [age ? -g.side : g.side, 0]
      ring(out, cx, cy, (g.right - g.left) / 2 + 2 + age * 2, age ? ramp[1] : WHITE)
    }
    if (age < 0) return
    for (let k = 0; k < SEAR_SHOTS; k++) {
      // Shot 0 flies at the target, the rest spread evenly with a little jitter
      const angle = toward + (k * 2 * Math.PI) / SEAR_SHOTS + v * 0.3 + (k ? (rnd(a.seed, k + v * 20, 2) - 0.5) * 0.3 : 0)
      const dist = (g.right - g.left) / 2 + age * SEAR_SPEED
      const x = cx + Math.cos(angle) * dist
      const y = cy + Math.sin(angle) * dist * 0.8
      if (x < 0 || x >= g.columns || y < 0) continue
      if (k === 0 && Math.hypot(x - tx, y - ty) < SEAR_SPEED) {
        disc(out, tx, ty, 2, WHITE)
        continue
      }
      if (k === 0 && Math.abs(x - cx) > Math.abs(tx - cx)) {
        const burst = age - Math.ceil((Math.abs(tx - cx) - (g.right - g.left) / 2) / SEAR_SPEED)
        if (burst < 5) fireBlob(out, tx, ty, [3, 3.5, 3, 2, 1.2][Math.max(0, burst)], ramp, a.seed, t)
        continue
      }
      if (y > g.ground) {
        if (y < g.ground + 3) dot(out, x, g.ground, ramp[1])
        continue
      }
      dot(out, x - Math.cos(angle) * 1.5, y - Math.sin(angle) * 1.2, ramp[3])
      if (k === 0) fireball(out, x, y, ramp, t)
      else plus(out, x, y, ramp[2], ramp[t % 2])
    }
  })
  const cool = phase(t, SEAR_FIRE[1] + 2, a.ticks - 1)
  if (t > SEAR_FIRE[1] + 1 && cool < 1) out.shade = glow(ramp[1], 0.3 * (1 - cool))
  emit(t, { count: 5, gap: 2, start: SEAR_FIRE[1] + 8, life: 10 }, (i, age, f) => {
    wisp(out, tx + (rnd(a.seed, i, 3) - 0.5) * 6 + Math.sin(age * 0.5 + i), ty - 2 - age * 0.5, f)
  })
}

export const FIRE = {
  ember: { ticks: 40, color: 0xff7a1a, draw: ember },
  flamethrower: { ticks: 48, color: 0xff7a1a, draw: flamethrower },
  firespin: { ticks: 52, color: 0xff7a1a, draw: firespin },
  dragonrage: { ticks: 48, color: 0x7a4dff, draw: dragonrage },
  sunnyday: { ticks: 48, color: 0xffb020, pose: { view: 'front' }, draw: sunnyday },
  firefang: { ticks: 34, color: 0xff7a1a, draw: firefang },
  flareblitz: { ticks: 52, color: 0xff6a1a, pose: (t) => ({ stride: t >= BLITZ_GO && t < BLITZ_HIT }), draw: flareblitz },
  willowisp: { ticks: 54, color: 0x6a7cff, draw: willowisp },
  flamecharge: { ticks: 40, color: 0xff7a1a, pose: (t) => ({ stride: t >= CHARGE_GO && t < CHARGE_HIT + 10 }), draw: flamecharge },
  fireblast: { ticks: 54, color: 0xff6a1a, draw: fireblast },
  flameburst: { ticks: 44, color: 0xff8a1a, draw: flameburst },
  flamewheel: { ticks: 40, color: 0xff7a1a, pose: (t) => ({ stride: t >= WHEEL_FORM && t < WHEEL_HIT + 12 }), draw: flamewheel },
  incinerate: { ticks: 42, color: 0xff5a1a, draw: incinerate },
  overheat: { ticks: 58, color: 0xff6a1a, draw: overheat },
  inferno: { ticks: 56, color: 0xff3a1a, draw: inferno },
  heatcrash: { ticks: 44, color: 0xff5a1a, draw: heatcrash },
  heatwave: { ticks: 44, color: 0xff9a2a, draw: heatwave },
  eruption: { ticks: 58, color: 0xff4a10, draw: eruption },
  lavaplume: { ticks: 50, color: 0xff4a10, draw: lavaplume },
  blazekick: { ticks: 36, color: 0xff6a1a, draw: blazekick },
  blueflare: { ticks: 54, color: 0x3a8cff, draw: blueflare },
  fierydance: { ticks: 54, color: 0xff6a3a, pose: (t) => ({ view: t >= DANCE_TURN && t < DANCE_FLING ? 'front' : 'side' }), draw: fierydance },
  fusionflare: { ticks: 58, color: 0xffa060, draw: fusionflare },
  magmastorm: { ticks: 58, color: 0xff4010, draw: magmastorm },
  sacredfire: { ticks: 54, color: 0xffb030, draw: sacredfire },
  searingshot: { ticks: 46, color: 0xff8a1a, draw: searingshot },
}
