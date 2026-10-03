// Fire moves

import {
  WHITE, back, clamp, dark, disc, dot, easeIn, easeOut, emit, glow, lean, lerp, light, mix, phase, plus, ring, rnd,
  stamp, tint,
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

export const FIRE = {
  ember: { ticks: 40, color: 0xff7a1a, draw: ember },
  flamethrower: { ticks: 48, color: 0xff7a1a, draw: flamethrower },
  firespin: { ticks: 52, color: 0xff7a1a, draw: firespin },
  dragonrage: { ticks: 48, color: 0x7a4dff, draw: dragonrage },
}
