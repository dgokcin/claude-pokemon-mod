// Beams: a charge, a thick layered beam, and a fade

import {
  WHITE, back, burst, dark, dot, easeIn, easeOut, emit, hsl, lerp, light, line, mix, phase, plus, puff, rimGlow, rnd,
  shownAt, spark, stamp, tint,
} from './draw.js'

// Rows lean away from the target, the top by `top` pixels and the feet not at all
const leanBack = (g, top) => (y) => -g.side * top * Math.min(1, Math.max(0, (g.bottom - y) / (g.bottom - g.top)))

// Pixels from column x to the strip edge ahead, and to the target
const roomAhead = (g, x) => (g.side > 0 ? g.columns - 1 - x : x)
const toTarget = (g, x) => Math.max(5, Math.abs(g.target.x - x))

// How deep a beam pixel sits, from 3 on the rim to 0 at the core
function depthOf(h, dy) {
  if (dy === 0 && h >= 1.5) return 0
  const e = h - Math.abs(dy)
  return e < 1 ? 3 : e < 2 ? 2 : e < 3 ? 1 : 0
}

// A level beam along row y from column x0 to `len` pixels ahead. halfAt(d) is its
// half thickness d pixels out, toneOf(depth, d, dy) its color.
function beam(out, g, x0, y, len, halfAt, toneOf) {
  for (let d = 0; d <= len; d++) {
    const h = halfAt(d)
    const r = Math.floor(h)
    for (let dy = -r; dy <= r; dy++) dot(out, x0 + g.side * d, y + dy, toneOf(depthOf(h, dy), d, dy))
  }
}

const fromPalette = (pal) => (depth) => pal[depth]

// A glowing ball, its tones ringing in from the rim to a white heart, each pixel
// painted once with the tone of the innermost ring that holds it
function orb(out, x, y, r, pal, paint = dot) {
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const d2 = (px - x) ** 2 + (py - y) ** 2
      if (d2 > r * r + 0.5) continue
      let k = 3
      for (let j = 1; j <= 3; j++) if (r - j >= 0.5 && d2 <= (r - j) ** 2 + 0.5) k = 3 - j
      paint(out, px, py, px === Math.round(x) && py === Math.round(y) ? WHITE : pal[k])
    }
  }
}

const HYPER_FIRE = 24
const HYPER_FULL = 27
const HYPER_STOP = 46
const HYPER_GONE = 52
const HYPER_HALO = 0x9a2408

// Hyper Beam tones: white core, cream, orange gold, red orange rim
const hyperTones = (c) => [WHITE, light(c, 0.5), mix(c, 0xffb030, 0.65), mix(c, 0xe0400a, 0.85)]

// A long charge as energy streams into a ball at the mouth, then a huge throbbing
// beam that blasts against the strip edge, then the spent mon slumps to recharge
function hyperbeam(out, t, a, g, c) {
  const pal = hyperTones(c)
  hyperBody(out, t, a, g, pal)
  const m = shownAt(g, out, g.mouth.x, g.mouth.y)
  hyperCharge(out, t, a, g, pal, m)
  hyperRay(out, t, a, g, pal, m)
  hyperBlast(out, t, a, g, pal, m)
  hyperSteam(out, t, a, g)
}

function hyperBody(out, t, a, g, pal) {
  const glow = mix(pal[2], pal[1], 0.5)
  if (t < HYPER_FIRE) {
    const f = phase(t, 0, HYPER_FIRE)
    out.dx = t < 2 ? 0 : -g.side * (t >= 14 && t % 2 ? 2 : 1)
    out.sy = 1 - 0.06 * easeOut(f)
    out.sx = 1 + 0.03 * easeOut(f)
    out.shade = rimGlow(g, out, glow, 0.25 * f, pal[1], Math.min(1, 0.2 + 0.8 * f) * (t % 2 ? 1 : 0.75))
  } else if (t < HYPER_STOP) {
    const age = t - HYPER_FIRE
    out.dx = -g.side * (age < 3 ? 2 : t % 2 ? 2 : 1)
    out.skew = leanBack(g, age < 3 ? 3.4 : 2.4)
    out.shade = age < 2 ? tint(WHITE, age ? 0.45 : 0.8) : tint(glow, t % 2 ? 0.3 : 0.18)
    if (age < 8) out.shake = [age % 2 ? g.side : -g.side, age % 3 === 1 ? 1 : 0]
    else if (t % 3 === 0) out.shake = [g.side, 0]
  } else if (t < HYPER_GONE) {
    const f = phase(t, HYPER_STOP, HYPER_GONE)
    out.dx = -g.side * Math.round(2 * (1 - f))
    out.skew = leanBack(g, 2.4 * (1 - f))
    out.shade = tint(glow, 0.2 * (1 - f))
  } else if (t < a.ticks - 1) {
    // Recharging, it dims, slumps and pants
    const f = phase(t, HYPER_GONE, HYPER_GONE + 3)
    const pant = Math.floor(t / 3) % 2 ? 0.02 : 0
    out.sy = 1 - (0.08 - pant) * f
    out.sx = 1 + 0.03 * f
    out.shade = tint(0x23232e, 0.5 * f)
  }
}

// Orbs with tails stream into a ball at the mouth, then streaks rush in while the
// ball swells and crackles, ready to burst
function hyperCharge(out, t, a, g, pal, m) {
  if (t >= HYPER_FIRE) return
  const bx = m.x + g.side * 2
  const by = m.y
  const forward = g.side > 0 ? 0 : Math.PI
  emit(t, { count: 10, start: 1, gap: 1.3, life: 7 }, (i, age, f) => {
    const angle = forward + (rnd(a.seed, i) - 0.5) * 4.4
    const d = (9 + rnd(a.seed, i, 1) * 5) * (1 - easeIn(f))
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)]
    for (let k = 4; k >= 1; k--) dot(out, bx + ux * (d + k), by + uy * (d + k), k > 2 ? pal[3] : pal[2])
    orb(out, bx + ux * d, by + uy * d, 1.2, pal)
  })
  emit(t, { count: 12, start: 10, gap: 1, life: 4 }, (i, age) => {
    const angle = rnd(a.seed, i, 2) * Math.PI * 2
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)]
    const d = 14 - age * 3.2
    line(out, bx + ux * d, by + uy * d, bx + ux * (d + 3), by + uy * (d + 3), pal[1])
    dot(out, bx + ux * d, by + uy * d, WHITE)
  })
  if (t < 3) return
  const r = lerp(1, 4, phase(t, 3, HYPER_FIRE - 2)) + (t % 2 ? 0.5 : 0)
  orb(out, bx, by, r, pal)
  if (t < 15) return
  for (let k = 0; k < 3; k++) {
    const angle = rnd(a.seed, t * 3 + k, 3) * Math.PI * 2
    dot(out, bx + Math.cos(angle) * (r + 1.5), by + Math.sin(angle) * (r + 1.5), k ? pal[1] : WHITE)
  }
}

// Knots of light race along the beam, lifting its outer rows a tone
function hyperTone(pal, age) {
  return (depth, d) => pal[depth >= 2 && Math.sin((d - age * 3) * 0.55) > 0.6 ? depth - 1 : depth]
}

// The beam blows wide on release, then throbs with knots of light racing along it and
// a ragged glowing rim, sheds sparks, and finally thins away
function hyperRay(out, t, a, g, pal, m) {
  if (t < HYPER_FIRE || t >= HYPER_GONE) return
  const age = t - HYPER_FIRE
  const room = roomAhead(g, m.x)
  const len = Math.round(room * easeOut(phase(t, HYPER_FIRE - 1, HYPER_FULL)))
  const thin = 1 - phase(t, HYPER_STOP, HYPER_GONE)
  const swell = (age < 3 ? 3.5 : t % 3 === 0 ? 3.5 : 3) * thin
  if (thin === 1) {
    for (let d = 1; d <= len; d++) {
      const s = rnd(a.seed, d, t) < 0.5 ? -1 : 1
      if (rnd(a.seed, d, t + 99) < 0.45) dot(out, m.x + g.side * d, m.y + s * (Math.floor(swell) + 1), HYPER_HALO)
    }
  }
  beam(out, g, m.x, m.y, len, () => swell, hyperTone(pal, age))
  emit(t, { count: 40, start: HYPER_FIRE + 1, gap: 0.5, life: 5 }, (i, k) => {
    const d = 2 + rnd(a.seed, i, 3) * Math.max(1, len - 4)
    const s = rnd(a.seed, i, 4) < 0.5 ? -1 : 1
    const x = m.x + g.side * (d - k * 0.8)
    const y = m.y + s * (swell + 1.5 + k * 0.8)
    dot(out, x, y, k < 2 ? WHITE : pal[k < 3 ? 1 : 3])
    dot(out, x + g.side, y - s, pal[3])
  })
  if (thin > 0.4) orb(out, m.x, m.y, swell + (t % 2 ? 1 : 0.5), pal)
  if (len < room) orb(out, m.x + g.side * len, m.y, swell + 1, pal)
}

// A flickering fireball where the beam meets the strip edge throws debris back toward
// the mon, then smoke rises
function hyperBlast(out, t, a, g, pal, m) {
  const age = t - HYPER_FULL
  if (age < 0) return
  const x = g.side > 0 ? g.columns - 3 : 2
  const y = m.y
  const room = roomAhead(g, m.x)
  if (t < HYPER_STOP + 3) {
    const big = Math.min(6, 1.5 + room * 0.22)
    const shrink = phase(t, HYPER_STOP, HYPER_STOP + 3)
    const r = (age < 3 ? lerp(2, big, age / 2) : big - 1) * (1 - shrink * 0.6) + (t % 2 ? 1 : 0)
    if (t % 2 && shrink === 0) burst(out, x, y, r + 3, pal[3])
    puff(out, x, y, r + 1.5, HYPER_HALO, t)
    orb(out, x, y, r, pal)
  }
  emit(t, { count: 24, start: HYPER_FULL, gap: 0.8, life: 9 }, (i, k, f) => {
    const angle = (g.side > 0 ? Math.PI : 0) + (rnd(a.seed, i, 5) - 0.5) * 3
    const speed = 1 + rnd(a.seed, i, 6) * 1.2
    const px = x + Math.cos(angle) * speed * k
    const py = y + Math.sin(angle) * speed * k + 0.08 * k * k
    const col = f < 0.25 ? WHITE : f < 0.5 ? pal[1] : f < 0.75 ? pal[2] : pal[3]
    dot(out, px, py, col)
    if (f < 0.6) dot(out, px - Math.cos(angle), py - Math.sin(angle), pal[3])
  })
  emit(t, { count: 7, start: HYPER_STOP - 2, gap: 1.6, life: 12 }, (i, k, f) => {
    const px = x - g.side * rnd(a.seed, i, 7) * 4 + Math.sin(k * 0.5 + i) * 1.2
    const py = y - k * 0.7
    if (py >= 1) puff(out, px, py, 1.2 + f * 1.6, mix(0x7a6a62, 0x9a9898, f), i)
  })
}

// Wisps of steam curl off the tired mon as it recharges
function hyperSteam(out, t, a, g) {
  emit(t, { count: 5, start: HYPER_GONE + 1, gap: 2, life: 7 }, (i, k, f) => {
    const x = lerp(g.left + 3, g.right - 3, rnd(a.seed, i, 8)) + Math.sin(k * 0.8 + i)
    const y = g.top + 3 - k * 0.8
    dot(out, x, y, mix(0xd0d0d8, 0x70707a, f))
    if (f < 0.7) dot(out, x - Math.sin(k * 0.8 + i), y + 1, mix(0xa0a0aa, 0x60606a, f))
  })
}

const SOLAR_FIRE = 30
const SOLAR_FULL = 34
const SOLAR_STOP = 50
const SOLAR_GONE = 55

// Solar Beam tones: white core, cream, sunny yellow, gold rim
const solarTones = (c) => [WHITE, light(c, 0.6), c, mix(c, 0xd8960a, 0.6)]

// Soak up sunlight that falls in shafts and motes into the glowing body, then pour
// it out as a wide warm beam scattered with sparkles
function solarbeam(out, t, a, g, c) {
  const pal = solarTones(c)
  solarBody(out, t, a, g, pal)
  const m = shownAt(g, out, g.mouth.x, g.mouth.y)
  solarLight(out, t, a, g, pal)
  solarSun(out, t, a, g, pal, m)
  solarRay(out, t, a, g, pal, m)
  solarBloom(out, t, a, g, pal, m)
}

function solarBody(out, t, a, g, pal) {
  const sun = light(pal[2], 0.3)
  if (t < SOLAR_FIRE) {
    const f = easeIn(phase(t, 2, SOLAR_FIRE))
    const glow = rimGlow(g, out, sun, 0.25 * f, pal[1], Math.min(1, 0.15 + f) * (t % 4 < 2 ? 1 : 0.8))
    const lit = solarShafts(a, g).filter((s) => t >= s.born + 2 && t < s.born + SHAFT_LIFE)
    out.shade = (x, y, col) => {
      const k = glow(x, y, col)
      return lit.some((s) => Math.abs(x - (s.x0 - g.side * SHAFT_SLANT * y)) <= 1 && y >= s.land) ? mix(k, WHITE, 0.35) : k
    }
    if (t >= 4) out.skew = leanBack(g, 1.3 * Math.sin((t - 4) * 0.35))
    return
  }
  const age = t - SOLAR_FIRE
  const after = 1 - phase(t, SOLAR_STOP, a.ticks - 2)
  out.dx = -g.side * (age < 3 ? 2 : t < SOLAR_STOP ? 1 : 0)
  if (t < SOLAR_STOP + 3) out.skew = leanBack(g, age < 3 ? 2.4 : 1.4)
  if (age < 2) out.shade = tint(WHITE, age ? 0.45 : 0.8)
  else if (t < a.ticks - 1) out.shade = rimGlow(g, out, sun, 0.15 * after, pal[1], 0.6 * after)
  if (age < 2) out.shake = [-g.side, 0]
}

const SHAFT_LIFE = 10
const SHAFT_SLANT = 0.5

// Slanted shafts of sunlight from the open side, each with the column it leaves the
// top of the strip from, the row it lands on, and the tick it falls
function solarShafts(a, g) {
  const list = []
  for (let i = 0; i < 6; i++) {
    const f = (i * 0.37 + rnd(a.seed, i, 20) * 0.3) % 1
    const x0 = Math.round(lerp(g.left, g.right, f) + g.side * 6)
    let [x, y] = [x0, 0]
    while (y < g.ground && !g.solid(Math.round(x), y)) [x, y] = [x - g.side * SHAFT_SLANT, y + 1]
    if (y < g.ground) list.push({ x0, land: y, born: 1 + i * 4 })
  }
  return list
}

// Shafts of sunlight slant down from the top of the strip onto the body, while motes
// drift in from the sky and vanish behind the mon
function solarLight(out, t, a, g, pal) {
  if (t >= SOLAR_FIRE) return
  for (const s of solarShafts(a, g)) {
    const age = t - s.born
    if (age < 0 || age >= SHAFT_LIFE) continue
    const bottom = Math.min(s.land - 1, Math.round(lerp(0, s.land, easeOut(phase(age, 0, 3)))))
    const fading = age >= SHAFT_LIFE - 3
    for (let y = 0; y <= bottom; y++) {
      const x = Math.round(s.x0 - g.side * SHAFT_SLANT * y)
      dot(out, x - 1, y, fading ? pal[3] : pal[2])
      dot(out, x, y, fading ? pal[2] : (y + t) % 4 ? pal[1] : WHITE)
      if (!fading) dot(out, x + 1, y, pal[2])
    }
    const lx = s.x0 - g.side * SHAFT_SLANT * (s.land - 1)
    if (age >= 2 && !fading) spark(out, lx, s.land - 1, age % 2 ? 1 : 2, pal[2])
  }
  emit(t, { count: 30, start: 0, gap: 0.8, life: 9 }, (i, age, f) => {
    const x0 = g.cx + (rnd(a.seed, i, 21) - 0.5) * 30
    const x = lerp(x0, g.cx + (rnd(a.seed, i, 22) - 0.5) * 6, easeIn(f))
    const y = lerp(-1, g.cy, f)
    if ((i + t) % 3) back(out, x, y, f < 0.5 ? pal[1] : WHITE)
    else plus(out, x, y, pal[2], WHITE, back)
  })
}

// A little sun swells at the mouth, its long and short rays trading places
function solarSun(out, t, a, g, pal, m) {
  if (t < 10 || t >= SOLAR_FIRE) return
  const r = lerp(0.8, 3, easeIn(phase(t, 10, SOLAR_FIRE - 1)))
  const x = m.x + g.side * 2
  for (let k = 0; k < 8; k++) {
    const angle = (k * Math.PI) / 4
    const long = (k + (t >> 1)) % 2 === 0
    for (let d = r + 1; d <= r + (long ? 3.5 : 2); d++) {
      dot(out, x + Math.cos(angle) * d, m.y + Math.sin(angle) * d, d < r + 2 ? pal[1] : pal[long ? 2 : 3])
    }
  }
  orb(out, x, m.y, r + (t % 2 ? 0.4 : 0), pal)
}

// The wide beam, its edges rolling in slow waves, with sparkles drifting along its
// flanks; it narrows to nothing at the end
function solarRay(out, t, a, g, pal, m) {
  if (t < SOLAR_FIRE || t >= SOLAR_GONE) return
  const age = t - SOLAR_FIRE
  const room = roomAhead(g, m.x)
  const len = Math.round(room * easeOut(phase(t, SOLAR_FIRE - 1, SOLAR_FULL)))
  const thin = 1 - phase(t, SOLAR_STOP, SOLAR_GONE)
  const wide = age < 3 ? 4.5 : 3.7 + 0.5 * Math.sin(age * 0.8)
  beam(out, g, m.x, m.y, len, (d) => (wide + 0.6 * Math.sin(d * 0.5 - age * 1.3)) * thin, fromPalette(pal))
  if (thin > 0.4) orb(out, m.x, m.y, wide * thin + 0.5, pal)
  emit(t, { count: 40, start: SOLAR_FIRE + 1, gap: 0.45, life: 6 }, (i, k) => {
    const d = rnd(a.seed, i, 30) * len + k * 1.5
    const s = rnd(a.seed, i, 31) < 0.5 ? -1 : 1
    const y = m.y + s * (wide * thin + 1.5 + rnd(a.seed, i, 32) * 2.5)
    spark(out, m.x + g.side * d, y, k < 2 || k > 4 ? 1 : 2, pal[2])
  })
}

// A radiant glow where the beam lands, then motes of light rising along its path
function solarBloom(out, t, a, g, pal, m) {
  const x = g.side > 0 ? g.columns - 3 : 2
  if (t >= SOLAR_FULL && t < SOLAR_STOP + 3) {
    const r = (t < SOLAR_FULL + 2 ? 5 : 4) * (1 - 0.5 * phase(t, SOLAR_STOP, SOLAR_STOP + 3)) + (t % 2 ? 0.6 : 0)
    for (let k = 0; k < 8; k++) {
      const angle = (k * Math.PI) / 4 + (t % 2 ? Math.PI / 8 : 0)
      for (let d = r + 1; d <= r + 4; d++) {
        dot(out, x + Math.cos(angle) * d, m.y + Math.sin(angle) * d, d < r + 2.5 ? pal[1] : pal[3])
      }
    }
    orb(out, x, m.y, r, pal)
  }
  const room = roomAhead(g, m.x)
  emit(t, { count: 20, start: SOLAR_STOP, gap: 0.4, life: 8 }, (i, k, f) => {
    const x0 = m.x + g.side * rnd(a.seed, i, 33) * room
    const y = m.y + (rnd(a.seed, i, 34) - 0.5) * 6 - k * 0.8
    const px = x0 + Math.sin(k * 0.7 + i) * 0.8
    if (f < 0.5 && (i + t) % 2) plus(out, px, y, pal[2], WHITE)
    else dot(out, px, y, f < 0.7 ? pal[1] : pal[3])
  })
}

const PSY_FIRE = 10
const PSY_STOP = 34

// Pink, purple and cyan in a loop, blended smoothly; k counts in thirds of the loop
function psyHue(c, k) {
  const hues = [c, 0xa66bff, 0x5fe3ff]
  const n = ((k % 3) + 3) % 3
  const i = Math.floor(n)
  return mix(hues[i], hues[(i + 1) % 3], n - i)
}

// Rise into a hovering hum while rings fold into the mouth, then send a wavering
// stream of pink, purple and cyan rings that swell as they fly and ripple where they land
function psybeam(out, t, a, g, c) {
  psyBody(out, t, a, g, c)
  const m = shownAt(g, out, g.mouth.x, g.mouth.y)
  psyFocus(out, t, a, g, c, m)
  psyStream(out, t, a, g, c, m)
  psyHit(out, t, a, g, c, m)
}

function psyBody(out, t, a, g, c) {
  if (t < 2 || t >= a.ticks - 1) return
  out.dy = t >= a.ticks - 3 ? -1 : -1 - (Math.floor(t / 5) % 2)
  const f = t < PSY_FIRE ? phase(t, 2, PSY_FIRE) : 1 - phase(t, PSY_STOP, a.ticks - 2)
  if (t < PSY_FIRE) out.skew = (y) => 1.3 * f * Math.sin(y * 0.8 + t * 1.4)
  out.shade = rimGlow(g, out, c, 0.12 * f, psyHue(c, t * 0.15), (0.45 + (t % 2 ? 0.3 : 0.15)) * f)
}

// Rings fold down into the mouth as the mind gathers
function psyFocus(out, t, a, g, c, m) {
  if (t >= PSY_FIRE) return
  emit(t, { count: 4, start: 1, gap: 2.2, life: 6 }, (i, age, f) => {
    oval(out, g, m.x + g.side * 2, m.y, lerp(3, 0.5, f), lerp(7, 1, easeIn(f)), psyHue(c, i))
  })
}

// An upright oval outline, its forward half lit and its back half shaded
function oval(out, g, x, y, rx, ry, c) {
  const steps = Math.ceil((rx + ry) * 4)
  for (let k = 0; k < steps; k++) {
    const angle = (k / steps) * Math.PI * 2
    dot(out, x + rx * Math.cos(angle), y + ry * Math.sin(angle), Math.cos(angle) * g.side > 0 ? light(c, 0.45) : dark(c, 0.15))
  }
}

// How far the stream's axis sways off the mouth row, d pixels out
const psySway = (d, t) => 1.2 * Math.sin(d * 0.4 - t * 0.6)

// A ring seen side on, two pixels thick, dark outside and lit on its forward half
function hoop(out, g, x, y, rx, ry, c) {
  for (const [k, inner] of [[0, false], [0.9, true]]) {
    const steps = Math.ceil((rx + ry) * 5)
    for (let n = 0; n < steps; n++) {
      const angle = (n / steps) * Math.PI * 2
      const front = Math.cos(angle) * g.side > 0
      const col = inner ? (front ? light(c, 0.55) : c) : dark(c, front ? 0.15 : 0.4)
      dot(out, x + (rx - k) * Math.cos(angle), y + (ry - k) * Math.sin(angle), col)
    }
  }
}

// A stream of rings, each a step further round the color loop, swelling as they fly
// along a softly swaying path threaded on a bright core, then rippling out where they land
function psyStream(out, t, a, g, c, m) {
  if (t < PSY_FIRE) return
  const len = toTarget(g, m.x)
  const head = Math.round(len * easeOut(phase(t, PSY_FIRE, PSY_FIRE + 4)))
  const tail = Math.round(len * easeIn(phase(t, PSY_STOP, PSY_STOP + 5)))
  for (let d = tail; d <= head && t < PSY_STOP + 5; d++) {
    const col = psyHue(c, d * 0.13 - t * 0.3)
    const y = Math.round(m.y + psySway(d, t))
    dot(out, m.x + g.side * d, y, light(col, 0.6))
    dot(out, m.x + g.side * d, y + 1, col)
  }
  const flight = Math.ceil(len / 2)
  const rings = []
  emit(t, { count: 12, start: PSY_FIRE, gap: 2, life: flight + 3 }, (i, age) => rings.push([i, age]))
  for (const [i, age] of rings.reverse()) {
    const col = psyHue(c, i)
    if (age >= flight) {
      const k = age - flight + 1
      oval(out, g, m.x + g.side * len, m.y, 2.8 + k * 1.2, 5.5 + k * 1.4, k < 2 ? col : dark(col, 0.35))
      continue
    }
    const f = age / flight
    const d = age * 2 + 1
    hoop(out, g, m.x + g.side * d, m.y + psySway(d, t) + 0.5, 1.8 + f, 3 + f * 2.5, col)
  }
}

// The spot the rings strike throbs with light
function psyHit(out, t, a, g, c, m) {
  if (t < PSY_FIRE + 5 || t >= PSY_STOP + 6) return
  const col = psyHue(c, t * 0.3)
  orb(out, m.x + g.side * toTarget(g, m.x), m.y, 1.5 + (t % 2 ? 0.6 : 0), [WHITE, light(col, 0.5), col, dark(col, 0.3)])
}

const AURORA_FIRE = 10
const AURORA_FULL = 13
const AURORA_STOP = 34
const AURORA_GONE = 39
const AURORA_LIGHT = [0.9, 0.76, 0.6, 0.42]

// A rainbow color for hue h in turns, at a beam depth from core (0) to rim (3)
const aurora = (h, depth) => hsl(((h % 1) + 1) % 1, 0.92, AURORA_LIGHT[depth])

// A wheel of rainbow motes spins into the mouth, then a beam of sliding rainbow
// bands with shimmering sparkles lands as a spinning prism, leaving glitter to fall
function aurorabeam(out, t, a, g, c) {
  auroraBody(out, t, a, g, c)
  const m = shownAt(g, out, g.mouth.x, g.mouth.y)
  auroraGather(out, t, a, g, m)
  auroraRay(out, t, a, g, m)
  auroraHit(out, t, a, g, m)
}

function auroraBody(out, t, a, g, c) {
  if (t >= a.ticks - 1) return
  const rim = aurora(t * 0.06, 1)
  if (t < AURORA_FIRE) {
    const f = phase(t, 0, AURORA_FIRE)
    out.dx = t < 3 ? 0 : -g.side
    out.shade = rimGlow(g, out, c, 0.15 * f, rim, 0.3 + 0.5 * f)
  } else if (t < AURORA_FIRE + 2) {
    out.dx = -g.side * 2
    out.shade = tint(WHITE, t === AURORA_FIRE ? 0.7 : 0.4)
  } else {
    const f = 1 - phase(t, AURORA_STOP, a.ticks - 2)
    out.dx = t < AURORA_STOP ? -g.side : 0
    out.shade = rimGlow(g, out, c, 0.12 * f, rim, 0.7 * f)
  }
}

// Eight motes of every color wheel round the mouth, trailing light as they close in
function auroraGather(out, t, a, g, m) {
  if (t >= AURORA_FIRE) return
  const x = m.x + g.side * 2
  const r = lerp(9, 2, easeIn(phase(t, 0, AURORA_FIRE)))
  for (let k = 0; k < 8; k++) {
    const angle = (k * Math.PI) / 4 + t * 0.45
    const h = k / 8 + t * 0.02
    for (let j = 2; j >= 1; j--) {
      dot(out, x + Math.cos(angle - j * 0.3) * r, m.y + Math.sin(angle - j * 0.3) * r, aurora(h, j + 1))
    }
    plus(out, x + Math.cos(angle) * r, m.y + Math.sin(angle) * r, aurora(h, 1), aurora(h, 0))
  }
  if (t >= 4) orb(out, x, m.y, 1 + phase(t, 4, AURORA_FIRE) * 1.5, [0, 1, 2, 3].map((k) => aurora(t * 0.08, k)))
}

function auroraRay(out, t, a, g, m) {
  if (t < AURORA_FIRE || t >= AURORA_GONE) return
  const len = toTarget(g, m.x)
  const reach = Math.round(len * easeOut(phase(t, AURORA_FIRE - 1, AURORA_FULL)))
  const thin = 1 - phase(t, AURORA_STOP, AURORA_GONE)
  const h = (t < AURORA_FIRE + 2 ? 3.5 : 3 + (t % 4 < 2 ? 0.3 : 0)) * thin
  beam(out, g, m.x, m.y, reach, () => h, (depth, d, dy) => aurora(d * 0.05 - t * 0.09 + dy * 0.05, depth))
  emit(t, { count: 40, start: AURORA_FIRE + 1, gap: 0.5, life: 3 }, (i, k) => {
    const d = 1 + rnd(a.seed, i, 40) * (reach - 1) + k
    const y = m.y + Math.round((rnd(a.seed, i, 41) - 0.5) * 2 * h)
    if (k === 1) plus(out, m.x + g.side * d, y, aurora(i * 0.1, 0), WHITE)
    else dot(out, m.x + g.side * d, y, WHITE)
  })
}

// A spinning prism where the beam lands, every color round its rim, with icy glints;
// then glitter drifts down along the beam's path
function auroraHit(out, t, a, g, m) {
  const len = toTarget(g, m.x)
  const x = m.x + g.side * len
  if (t >= AURORA_FULL && t < AURORA_GONE) {
    const r = (t < AURORA_FULL + 2 ? 4.5 : 3.5) * (1 - 0.5 * phase(t, AURORA_STOP, AURORA_GONE)) + (t % 2 ? 0.5 : 0)
    prism(out, x, m.y, r, t * 0.07)
  }
  emit(t, { count: 10, start: AURORA_FULL + 1, gap: 2, life: 4 }, (i, k) => {
    const sx = x + (rnd(a.seed, i, 42) - 0.5) * 12
    const sy = m.y + (rnd(a.seed, i, 43) - 0.5) * 10
    spark(out, sx, sy, k === 1 || k === 2 ? 2 : 1, aurora(0.55, 1))
  })
  emit(t, { count: 22, start: AURORA_STOP - 2, gap: 0.4, life: 9 }, (i, k, f) => {
    const px = m.x + g.side * rnd(a.seed, i, 44) * len + Math.sin(k * 0.6 + i) * 0.8
    const py = m.y + (rnd(a.seed, i, 45) - 0.5) * 6 + k * 0.6
    const col = aurora(i * 0.11, f < 0.6 ? 1 : 3)
    if ((t + i) % 4 === 0) plus(out, px, py, col, WHITE)
    else dot(out, px, py, col)
  })
}

// A disc whose hue turns with the angle round it, white at the heart, deep at the rim
function prism(out, x, y, r, spin) {
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const d = Math.hypot(px - x, py - y)
      if (d > r + 0.3) continue
      const depth = d < r - 2.5 ? 0 : d < r - 1.5 ? 1 : d < r - 0.6 ? 2 : 3
      dot(out, px, py, d < 0.8 ? WHITE : aurora(Math.atan2(py - y, px - x) / (Math.PI * 2) + spin, depth))
    }
  }
}

const ICE_FIRE = 10
const ICE_STOP = 30
const ICE_BREAK = 36
const ICE_SPEED = 5

// Ice Beam tones: white core, frost, pale blue, deep blue rim
const iceTones = (c) => [WHITE, light(c, 0.55), c, mix(c, 0x2a64c8, 0.65)]

// Snowflakes by size, from a dot to a full flake
const FLAKES = [
  ['w'],
  ['.l.', 'lwl', '.l.'],
  ['l.l.l', '.lwl.', 'lwwwl', '.lwl.', 'l.l.l'],
  ['...l...', '.l.l.l.', '..lwl..', 'llwwwll', '..lwl..', '.l.l.l.', '...l...'],
]

// Frost gathers into a snowflake at the mouth, then a crisp pale beam sprouts ice
// crystals along its length and a cluster where it lands, freezes solid, and shatters
function icebeam(out, t, a, g, c) {
  const pal = iceTones(c)
  iceBody(out, t, a, g, c)
  const m = shownAt(g, out, g.mouth.x, g.mouth.y)
  iceGather(out, t, a, g, pal, m)
  iceCrystals(out, t, a, g, pal)
  iceRay(out, t, a, g, pal)
}

function iceBody(out, t, a, g, c) {
  if (t >= a.ticks - 1) return
  const pal = iceTones(c)
  if (t < ICE_FIRE) {
    const f = phase(t, 0, ICE_FIRE)
    out.dx = t < 3 ? 0 : -g.side
    out.shade = rimGlow(g, out, c, 0.15 * f, pal[1], 0.3 + 0.6 * f)
  } else if (t < ICE_FIRE + 2) {
    out.shade = tint(WHITE, t === ICE_FIRE ? 0.7 : 0.4)
  } else {
    const f = 1 - phase(t, ICE_STOP, ICE_BREAK + 4)
    out.shade = rimGlow(g, out, c, 0.15 * f, pal[1], 0.8 * f)
    if (t === ICE_BREAK || t === ICE_BREAK + 1) out.shake = [t === ICE_BREAK ? g.side : -g.side, 0]
  }
}

function iceGather(out, t, a, g, pal, m) {
  if (t >= ICE_FIRE) return
  const x = m.x + g.side * 2
  emit(t, { count: 14, start: 0, gap: 0.6, life: 6 }, (i, age, f) => {
    const angle = rnd(a.seed, i, 50) * Math.PI * 2
    const r = (6 + rnd(a.seed, i, 51) * 5) * (1 - easeIn(f))
    dot(out, x + Math.cos(angle) * r, m.y + Math.sin(angle) * r, f < 0.5 ? pal[1] : WHITE)
  })
  const art = FLAKES[Math.min(3, Math.floor(phase(t, 1, ICE_FIRE - 1) * 4))]
  const size = art.length
  stamp(out, x - (size >> 1), m.y - (size >> 1), art, { w: WHITE, l: t % 2 ? pal[1] : pal[2] })
}

// The beam is fixed in place once fired, from the mouth where the mon stands
function iceLine(g) {
  return { x: g.mouth.x, y: g.mouth.y, len: toTarget(g, g.mouth.x) }
}

// The beam glitters on its way out, then freezes into a rod of ice that a glint runs
// along until it cracks
function iceRay(out, t, a, g, pal) {
  if (t < ICE_FIRE || t >= ICE_BREAK + 1) return
  const { x, y, len } = iceLine(g)
  if (t < ICE_STOP) {
    const reach = Math.min(len, Math.round((t - ICE_FIRE + 1) * ICE_SPEED))
    const h = t < ICE_FIRE + 2 ? 2.5 : 2
    beam(out, g, x, y, reach, () => h, (depth, d, dy) => (depth === 2 && rnd(a.seed, d * 7 + dy, t) < 0.2 ? WHITE : pal[depth]))
    orb(out, x, y, h + 0.5, pal)
    return
  }
  const glint = (t - ICE_STOP - 1) * 3
  for (let d = 0; d <= len; d++) {
    const flash = t < ICE_STOP + 2 || t === ICE_BREAK || Math.abs(d - glint) < 1.5
    dot(out, x + g.side * d, y - 1, flash ? WHITE : pal[1])
    dot(out, x + g.side * d, y, flash || (d + t) % 5 === 0 ? WHITE : pal[2])
    dot(out, x + g.side * d, y + 1, pal[3])
  }
}

// Spikes along the beam and a cluster where it lands. Each grows from a point along a
// direction to a length and width, starting at a tick.
function iceSpikes(a, g) {
  const { x, y, len } = iceLine(g)
  const list = []
  for (let k = 0, d = 3; d < len - 3; k++, d += 3 + rnd(a.seed, k, 52)) {
    const up = k % 2 ? 1 : -1
    const lean = 0.3 + rnd(a.seed, k, 53) * 0.3
    list.push({
      x: x + g.side * Math.round(d), y: y + up * 2, ux: g.side * Math.sin(lean), uy: up * Math.cos(lean),
      len: 4.5 + rnd(a.seed, k, 54) * 2, wide: 1.5, born: ICE_FIRE + d / ICE_SPEED,
    })
  }
  const ex = x + g.side * len
  ICE_FAN.forEach((angle, k) => {
    const turn = angle + (rnd(a.seed, k, 55) - 0.5) * 0.25
    list.push({
      x: ex, y, ux: g.side * Math.cos(turn), uy: Math.sin(turn),
      len: ICE_FAN_LEN[k] + rnd(a.seed, k, 56) * 1.5, wide: 1.7, born: ICE_FIRE + len / ICE_SPEED + k * 0.4,
    })
  })
  return list
}

// The cluster's crystals, as angles off the beam's line (down is positive), and lengths
const ICE_FAN = [-2.3, -1.4, -0.5, 0.45, 1.35, 2.3]
const ICE_FAN_LEN = [5, 7, 5.5, 4.5, 6, 4.5]

function iceCrystals(out, t, a, g, pal) {
  const spikes = iceSpikes(a, g)
  if (t < ICE_BREAK) {
    spikes.forEach((s, i) => {
      const grow = easeOut(phase(t, s.born, s.born + 3))
      if (grow > 0) crystal(out, s.x, s.y, s.ux, s.uy, s.len * grow, s.wide, pal, t >= ICE_STOP && (t + i) % 6 === 0)
    })
    const { x, y, len } = iceLine(g)
    const born = ICE_FIRE + len / ICE_SPEED
    if (t >= born) orb(out, x + g.side * len, y, 1.5 + phase(t, born, born + 3), pal)
    return
  }
  const k = t - ICE_BREAK
  if (k === 0) spikes.forEach((s) => crystal(out, s.x, s.y, s.ux, s.uy, s.len, s.wide, [WHITE, WHITE, WHITE, pal[1]], true))
  const { x, y, len } = iceLine(g)
  if (k < 3) burst(out, x + g.side * len, y, 3 + k * 2, pal[1])
  for (let d = 1; d <= len && k >= 1; d += 2) {
    const vx = (rnd(a.seed, d, 59) - 0.5) * 1.2
    const vy = -0.4 - rnd(a.seed, d, 60) * 0.7
    const py = y + vy * k + 0.12 * k * k
    if (py <= g.ground) dot(out, x + g.side * d + vx * k, py, k > 8 ? pal[3] : (d + t) % 3 ? pal[1] : WHITE)
  }
  spikes.forEach((s, i) => {
    for (let j = 0; j < 4; j++) {
      const n = i * 4 + j
      const along = ((j + 0.5) / 4) * s.len
      const spread = (rnd(a.seed, n, 57) - 0.5) * 1.6
      const speed = 0.6 + rnd(a.seed, n, 58) * 0.8
      const vx = s.ux * speed - s.uy * spread
      const vy = s.uy * speed + s.ux * spread - 0.5
      const px = s.x + s.ux * along + vx * k
      const py = s.y + s.uy * along + vy * k + 0.11 * k * k
      if (k < 1 || py > g.ground) continue
      const glint = (t + n) % 3
      const col = k > 8 ? pal[3] : glint === 0 ? WHITE : pal[glint]
      dot(out, px, py, col)
      if (k < 7 && j % 2 === 0) dot(out, px + Math.sign(vx || 1), py, pal[2])
      if (k < 5 && j === 1) dot(out, px, py + 1, pal[3])
    }
  })
}

// A crystal is a long diamond from its base along (ux, uy), its upper flank lit and the
// other in shadow, with a spine that turns white toward the tip
function crystal(out, x, y, ux, uy, len, wide, pal, glint) {
  const [px, py] = [-uy, ux]
  const upper = px + py < 0 ? -1 : 1
  const r = Math.ceil(len + wide + 1)
  for (let yy = Math.floor(y - r); yy <= y + r; yy++) {
    for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
      const s = (xx - x) * ux + (yy - y) * uy
      const q = (xx - x) * px + (yy - y) * py
      if (s < -0.5 || s > len) continue
      const w = wide * (s < len * 0.3 ? 0.6 + (s / (len * 0.3)) * 0.4 : (len - s) / (len * 0.7))
      if (Math.abs(q) > w + 0.4) continue
      const spine = Math.abs(q) < 0.5
      dot(out, xx, yy, spine ? (glint || s > len * 0.5 ? WHITE : pal[2]) : q * upper > 0 ? pal[1] : pal[3])
    }
  }
}

const BUBBLE_START = 6
const BUBBLE_STOP = 30
const BUBBLE_GAP = 0.9

// Bubbles from small to big: h shine, l lit rim, b shaded rim
const BUBBLES = [
  ['.l.', 'l.b', '.b.'],
  ['.ll.', 'lh.b', 'l..b', '.bb.'],
  ['.lll.', 'lh..b', 'l...b', 'l...b', '.bbb.'],
  ['..lll..', '.lh..b.', 'lh....b', 'l.....b', 'l.....b', '.b...b.', '..bbb..'],
]
const POP = ['h.h', '...', 'h.h']

// Puff up and fire a fast jet of glossy bubbles of every size, zigzagging round the
// mouth's row, that pop where they land and burst into a spray of droplets
function bubblebeam(out, t, a, g, c) {
  bubbleBody(out, t, a, g)
  const m = shownAt(g, out, g.mouth.x, g.mouth.y)
  const art = { h: WHITE, l: light(c, 0.5), b: c }
  const dist = toTarget(g, g.mouth.x)
  emit(t, { count: 30, start: BUBBLE_START, gap: 0.8, life: 6 }, (i, k) => {
    const y = g.mouth.y + (rnd(a.seed, i, 66) - 0.5) * 8
    const d = k * 3.4 + 1
    if (d < dist) dot(out, m.x + g.side * d, y, k % 2 ? art.l : WHITE)
  })
  const count = Math.floor((BUBBLE_STOP - BUBBLE_START) / BUBBLE_GAP)
  for (let i = 0; i < count; i++) {
    const age = t - BUBBLE_START - i * BUBBLE_GAP
    if (age < 0) continue
    const speed = 2.8 + rnd(a.seed, i, 60) * 0.4
    const far = dist + (rnd(a.seed, i, 61) - 0.5) * 3
    const pop = far / speed
    const lane = (i % 2 ? 1 : -1) * (1.5 + rnd(a.seed, i, 62) * 2)
    const y = g.mouth.y + lane * Math.min(1, age / 2) + Math.sin(age * 0.9 + i) * 0.5
    const size = Math.floor(rnd(a.seed, i, 63) * BUBBLES.length)
    if (age < pop) {
      const sprite = BUBBLES[size]
      const n = sprite.length
      stamp(out, m.x + g.side * (age * speed) - (n >> 1), Math.round(y) - (n >> 1), sprite, art)
    } else {
      bubbleSpray(out, a, g, i, age - pop, g.mouth.x + g.side * far, y, art, size)
    }
  }
}

function bubbleBody(out, t, a, g) {
  if (t >= a.ticks - 1) return
  if (t < BUBBLE_START) {
    const f = easeOut(phase(t, 0, BUBBLE_START))
    out.dx = -g.side * Math.round(f)
    out.sx = 1 + 0.05 * f
    out.sy = 1 + 0.05 * f
  } else if (t < BUBBLE_STOP) {
    out.dx = -g.side * (t % 3 === 0 ? 2 : 1)
    out.sx = t % 3 === 0 ? 0.97 : 1
  }
}

// A burst bubble leaves a ring of glints, then droplets thrown up that fall away, more
// of them from bigger bubbles
function bubbleSpray(out, a, g, i, k, x, y, art, size) {
  if (k < 1) stamp(out, x - 1, Math.round(y) - 1, POP, art)
  if (k > 9) return
  for (let j = 0; j < (size > 1 ? 2 : 1); j++) {
    const vx = (rnd(a.seed, i * 2 + j, 64) - 0.5) * 1.8 - g.side * 0.2
    const vy = -0.6 - rnd(a.seed, i * 2 + j, 65) * 1.1
    const py = y + vy * k + 0.17 * k * k
    if (py <= g.ground) dot(out, x + vx * k, py, k < 2 ? WHITE : k < 5 ? art.l : art.b)
  }
}

export const BEAMS = {
  hyperbeam: { ticks: 64, color: 0xffe9a6, draw: hyperbeam },
  solarbeam: { ticks: 60, color: 0xfff27a, draw: solarbeam },
  psybeam: { ticks: 44, color: 0xff8ad8, draw: psybeam },
  aurorabeam: { ticks: 44, color: 0xa0ffd8, draw: aurorabeam },
  icebeam: { ticks: 48, color: 0x9ae6ff, draw: icebeam },
  bubblebeam: { ticks: 44, color: 0x6ab8ff, draw: bubblebeam },
}
