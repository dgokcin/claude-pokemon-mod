// Normal moves: odd sounds, stored power, and moves that call on other moves

import {
  WHITE, back, ball, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, glow, hsl, lean, lerp,
  light, line, mix, phase, plus, puff, ramp, rimGlow, ring, rnd, spark, sparkles, stamp, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const widthOf = (g) => g.right - g.left + 1
const heightOf = (g) => g.bottom - g.top + 1

// The angle from the mouth toward the target, flattened so things travel mostly level
function aimOf(g) {
  const tilt = clamp(Math.atan2(g.target.y - g.mouth.y, Math.abs(g.target.x - g.mouth.x)) * 0.5, -0.4, 0.4)
  return g.side > 0 ? tilt : Math.PI - tilt
}

// An arc of radius r within `spread` radians of `angle`, sampled about once per pixel
function arc(out, x, y, r, angle, spread, c, paint = dot) {
  const steps = Math.max(4, Math.ceil(r * spread * 2.4))
  for (let k = 0; k <= steps; k++) {
    const ang = angle - spread + (2 * spread * k) / steps
    paint(out, x + r * Math.cos(ang), y + r * Math.sin(ang), c)
  }
}

// Pixel art in one color with a dark outline, so it reads over anything
function outlined(out, x, y, art, col, edge) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stamp(out, x + dx, y + dy, art, { x: edge })
  stamp(out, x, y, art, { x: col })
}

// A point f of the way along a throw from x0, y0 to x1, y1 that peaks `height` up
const lob = (x0, y0, x1, y1, height, f) => [lerp(x0, x1, f), lerp(y0, y1, f) - Math.sin(f * Math.PI) * height]

// Every other pixel, for things breaking up as they fade
const dotted = (out, x, y, c) => (Math.round(x) + Math.round(y)) % 2 && dot(out, x, y, c)

// The pixels just outside the sprite's outline, in order around it from the top
function rimOf(g) {
  const pts = []
  for (let y = g.top - 1; y <= g.bottom; y++) {
    for (let x = g.left - 1; x <= g.right + 1; x++) {
      if (g.solid(x, y)) continue
      if (g.solid(x - 1, y) || g.solid(x + 1, y) || g.solid(x, y - 1) || g.solid(x, y + 1)) pts.push([x, y])
    }
  }
  const turn = ([x, y]) => (Math.atan2(y - g.cy, (x - g.cx) * g.side) + Math.PI / 2 + TAU) % TAU
  return pts.sort((p, q) => turn(p) - turn(q))
}

const BIDE_THROBS = [8, 17, 26]
const BIDE_LET = 35
const BIDE_HIT = 40

// Hunker down and soak up the hits: three throbs squeeze rings into the body and tick
// up a counter, then it lets the stored power loose as a slab of light
function bide(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const w = widthOf(g)
  const h = heightOf(g)
  const stored = BIDE_THROBS.filter((s) => s <= t).length
  if (t < BIDE_LET) {
    const held = easeOut(phase(t, 0, 6))
    out.sy = 1 - 0.08 * held
    out.sx = 1 + 0.05 * held
    if (stored >= 2) out.dx = tremble(t)
    if (stored >= 3) out.shake = [tremble(t, 2), 0]
    let flare = 0
    BIDE_THROBS.forEach((s, k) => {
      const age = t - s
      if (age < 0 || age >= 7) return
      if (age < 3) flare = 0.25 + 0.15 * k
      ring(out, g.cx, g.cy, lerp(w * 0.55 + 2, 2, easeIn(age / 7)), age < 3 ? lit : c)
    })
    if (stored) out.shade = rimGlow(g, out, c, 0.03 * stored + flare * 0.25, t % 4 < 2 ? hi : c, Math.min(0.9, 0.45 + flare))
    // One pip over the head per hit soaked up
    for (let i = 0; i < stored; i++) {
      const px = g.cx + (i - 1) * 3
      const py = Math.max(1, g.top - 3)
      plus(out, px, py, deep, i === stored - 1 && t % 4 < 2 ? WHITE : hi)
    }
  } else {
    const home = 1 - easeInOut(phase(t, BIDE_LET + 3, 48))
    out.dx = Math.round(g.side * 2 * home)
    if (t < BIDE_LET + 2) {
      out.shade = tint(WHITE, 0.6)
      out.shake = [g.side * 2, 1]
    }
  }

  if (t >= BIDE_LET && t < BIDE_HIT + 1) {
    const f = easeIn(phase(t, BIDE_LET, BIDE_HIT))
    const x = lerp(g.ahead(2), g.target.x, f)
    const y = lerp(g.mouth.y, g.target.y, f)
    const half = Math.max(4, h * 0.45) * (0.6 + 0.4 * f)
    const tones = [WHITE, WHITE, hi, c, deep]
    for (let d = 0; d < 5; d++) {
      const top = Math.round(y - half + d * 0.5 + rnd(a.seed, t, d) * 1.5)
      const bot = Math.round(y + half - d * 0.5 - rnd(a.seed, t, d + 9) * 1.5)
      line(out, x - g.side * d, top, x - g.side * d, bot, tones[d])
    }
    for (let k = 0; k < 4; k++) {
      const ry = y + (k - 1.5) * half * 0.6
      line(out, x - g.side * 4, ry, x - g.side * (6 + k), ry, k % 2 ? c : lit, dotted)
    }
  }
  const age = t - BIDE_HIT
  if (age >= 0 && age < 10) {
    const { x: tx, y: ty } = g.target
    if (age < 5) burst(out, tx, ty, [4, 8, 7, 5, 3][age], age < 2 ? WHITE : c)
    if (age < 3) out.shake = [age % 2 ? -2 : 2, age % 2 ? 0 : 1]
    ring(out, tx, ty, 2 + age * 1.3, age < 4 ? hi : c, 0, Math.PI, age < 6 ? dot : dotted)
    if (age >= 2) ring(out, tx, ty, age * 0.9, age < 5 ? lit : deep, 0, Math.PI, age < 6 ? dot : dotted)
  }
}

const UPROAR_START = 3
const UPROAR_BEAT = 6
const UPROAR_HOPS = 6
const UPROAR_LIFE = 12
const EXCLAIM = ['xx', 'xx', 'xx', '..', 'xx']

// A zigzag noise bolt pointing along dir, with a dark underside
function bolt(out, x, y, dir, c, edge) {
  const pts = [[0, 0], [1.5, -1.5], [3, 1], [4.5, -1]].map(([u, v]) => [x + dir * u, y + v])
  for (let k = 1; k < pts.length; k++) {
    line(out, pts[k - 1][0], pts[k - 1][1] + 1, pts[k][0], pts[k][1] + 1, edge)
    line(out, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], c)
  }
}

// Stomp up and down in a tantrum, every landing hurling a fistful of bangs and noise
// bolts that rattle all over the target
function uproar(out, t, a, g, c) {
  const h = heightOf(g)
  const edge = dark(c, 0.6)
  const hot = mix(c, 0xff5a3a, 0.5)
  const beat = t - UPROAR_START
  if (beat >= 0 && beat < UPROAR_HOPS * UPROAR_BEAT) {
    const p = (beat % UPROAR_BEAT) / UPROAR_BEAT
    const hop = Math.sin(p * Math.PI)
    const way = Math.floor(beat / UPROAR_BEAT) % 2 ? 1 : -1
    out.dy = -Math.round(hop * Math.min(3, 1 + h * 0.12))
    out.skew = lean(g, way * 2 * hop)
    if (beat % UPROAR_BEAT === 0) {
      out.sy = 0.9
      out.sx = 1.07
      out.shake = [0, 1]
    }
    // A shouting mouth: two short lines flaring open
    const mx = g.mouth.x + out.dx
    const my = g.mouth.y + out.dy
    for (const d of [-1, 1]) line(out, mx, my + d, mx + g.side * 2, my + d * 2, t % 2 ? WHITE : c)
  }
  const { x: tx, y: ty } = g.target
  for (let k = 0; k < UPROAR_HOPS; k++) {
    const born = UPROAR_START + k * UPROAR_BEAT
    for (let j = 0; j < 4; j++) {
      const age = t - born - j * 0.5
      if (age < 0 || age >= UPROAR_LIFE) continue
      const i = k * 4 + j
      const f = age / UPROAR_LIFE
      const ex = tx + (rnd(a.seed, i, 1) - 0.5) * 10
      const ey = clamp(ty + (rnd(a.seed, i, 2) - 0.5) * Math.max(8, h * 0.8), 3, g.ground - 4)
      const fly = easeOut(Math.min(1, f * 1.4))
      const x = lerp(g.mouth.x, ex, fly)
      const y = lerp(g.mouth.y - 1, ey, fly) - Math.sin(fly * Math.PI) * (2 + rnd(a.seed, i, 3) * 3)
      const col = i % 3 === 0 ? hot : c
      if (fly >= 1) {
        if (f < 0.9) spark(out, ex, ey, f < 0.8 ? 2 : 1, col)
      } else if (j % 2) outlined(out, x - 1, y - 2, EXCLAIM, col, edge)
      else bolt(out, x - g.side * 2, y, g.side, col, edge)
    }
  }
}

const WHIRL_SPIN = 9
const WHIRL_BLOW = 8
const WHIRL_END = 36
const WHIRL_LANES = 3

// Spin on the spot, then lean in and blow long rolling ribbons of wind that wrap the
// target in a coil and fling it up and away
function whirlwind(out, t, a, g, c) {
  const tones = [WHITE, light(c, 0.3), mix(c, 0x4a7ca8, 0.5), mix(c, 0x2c4c70, 0.7)]
  const { x: tx, y: ty } = g.target
  if (t >= 1 && t < WHIRL_SPIN) {
    out.flipX = Math.floor(t / 2) % 2 === 1
    out.sx = t % 2 ? 0.7 : 1
  }
  const live = phase(t, WHIRL_SPIN, WHIRL_SPIN + 3) * (1 - phase(t, WHIRL_END, WHIRL_END + 5))
  if (live > 0) out.skew = lean(g, g.side * 2 * live)

  const from = g.ahead(1)
  const span = Math.max(4, Math.abs(tx - from) - 3)
  const reached = (t - WHIRL_BLOW) * 1.6
  if (t >= WHIRL_BLOW && t < WHIRL_END + 4) {
    for (let l = 0; l < WHIRL_LANES; l++) {
      const y0 = lerp(g.top + 2, g.bottom - 2, (l + 0.5) / WHIRL_LANES)
      const y1 = ty + (l - (WHIRL_LANES - 1) / 2) * 3
      const at = (d) => {
        const u = d / span
        return [from + g.side * d, lerp(y0, y1, Math.min(u, 1)) + Math.sin(u * TAU + l * 2.1 - t * 0.5) * 1.5]
      }
      for (let s = 0; s < 2; s++) {
        const head = ((t - WHIRL_BLOW) * 1.4 + s * span * 0.55 + l * 3) % (span + 6)
        if (head > reached || (t >= WHIRL_END && (t + l) % 2)) continue
        for (let d = 0; d < 7; d++) {
          if (head - d < 0) break
          const [x, y] = at(head - d)
          if (x >= 0 && x < g.columns) dot(out, x, y, tones[d < 1 ? 0 : d < 3 ? 1 : d < 5 ? 2 : 3])
        }
      }
    }
  }

  // The coil spins up around the target and climbs, then streaks fling away
  if (t >= 16 && t < 40) {
    const f = phase(t, 16, 40)
    const climb = (t - 16) * 0.2
    const r = 2.5 + f * 1.5
    for (let k = 0; k < 30; k++) {
      const ang = -t * 0.7 + k * 0.45
      const y = ty + 4 - k * 0.3 - climb
      if (y < 1 || (f > 0.75 && (k + t) % 2)) continue
      const x = tx + Math.cos(ang) * r * (0.6 + k / 45)
      if (Math.sin(ang) > 0) dot(out, x, y, k % 10 < 2 ? tones[0] : tones[1])
      else back(out, x, y, tones[2])
    }
  }
  emit(t, { count: 8, gap: 2, start: 24, life: 7 }, (i, age) => {
    const x0 = tx + g.side * (1 + rnd(a.seed, i) * 3)
    const y0 = ty - 3 + rnd(a.seed, i, 1) * 5
    const x = x0 + g.side * age * 1.6
    const y = y0 - age * age * 0.25
    if (y < 1 || x < 0 || x >= g.columns) return
    line(out, x, y, x - g.side * 3, y + 1 + age * 0.4, age < 3 ? tones[0] : tones[1])
    dot(out, x - g.side * 3, y + 2 + age * 0.4, tones[3])
  })
}

const HYPER_INHALE = 8
const HYPER_WALLS = [10, 16, 22]
const HYPER_LIFE = 12
const HYPER_END = 32

// Gulp in a lungful, then bellow three tall walls of pressure down a megaphone cone,
// each one hammering the target with a ring
function hypervoice(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const h = heightOf(g)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  if (t < HYPER_INHALE) {
    const f = easeOut(phase(t, 0, HYPER_INHALE))
    out.sx = 1 + 0.07 * f
    out.sy = 1 + 0.05 * f
    out.dy = -Math.round(f)
    emit(t, { count: 10, gap: 0.7, start: 0, life: 5 }, (i, age) => {
      const y = my + (rnd(a.seed, i) - 0.5) * h * 0.8
      const d = 9 - age * 2
      const x = g.ahead(d)
      line(out, x, lerp(my, y, d / 9), x + g.side, lerp(my, y, (d + 1) / 9), lit)
    })
  } else if (t < HYPER_END) {
    out.dx = -g.side * (t % 2 ? 1 : 2)
    out.sx = 1.04
    out.shake = [0, t % 2 ? 1 : -1]
    // The cone flaring from the mouth, its dashes scrolling outward
    for (const d of [-1, 1]) {
      for (let k = 0; k < 10; k++) {
        if ((k + t) % 3 === 0) continue
        const u = k / 10
        const x = lerp(mx, tx, u * 0.8)
        const y = clamp(my + d * (1 + u * h * 0.45), 1, g.ground)
        dot(out, x, y, k < 3 ? hi : c)
      }
    }
  } else {
    out.dx = -g.side * Math.round(1 - phase(t, HYPER_END, HYPER_END + 4))
  }
  const ratio = (g.reach - 2) / (g.reach + 2)
  for (const s of HYPER_WALLS) {
    const age = t - s
    if (age < 0 || age >= HYPER_LIFE) continue
    const f = age / HYPER_LIFE
    const x = lerp(g.ahead(2), tx + g.side * 4, f)
    const y = lerp(my, ty, f)
    const half = lerp(3, Math.max(6, h * 0.7), f)
    const top = Math.max(1, Math.round(y - half))
    const bot = Math.min(g.ground, Math.round(y + half))
    const tones = f < 0.5 ? [WHITE, hi, c, deep] : [hi, c, c, deep]
    tones.forEach((col, d) => line(out, x - g.side * d, top + d, x - g.side * d, bot - d, col, f > 0.8 ? dotted : dot))
    line(out, x, top, x - g.side * 3, top, deep)
    line(out, x, bot, x - g.side * 3, bot, deep)
  }
  for (const s of HYPER_WALLS) {
    const age = t - s - Math.round(HYPER_LIFE * ratio)
    if (age < 0 || age >= 5) continue
    ring(out, tx, ty, 1.5 + age * 1.4, age < 2 ? WHITE : age < 4 ? hi : deep)
    if (age === 0) out.shake = [g.side * 2, 1]
  }
}

const HP_ORBS = 6
const HP_FORM = 2
const HP_FIRE = 18
const HP_GAP = 3
const HP_FLIGHT = 7

// Six orbs in the mon's hidden type pop in and circle it, front ones over and back
// ones behind, then peel off one by one to hit the target, which rings at the end
function hiddenpower(out, t, a, g, c) {
  const tone = mix(hsl(rnd(a.seed, 0, 91), 0.85, 0.55), c, 0.25)
  const [hi, lit, , deep] = ramp(tone)
  const w = widthOf(g)
  const h = heightOf(g)
  const rx = w / 2 + 3
  const ry = Math.max(2, h * 0.3)
  const { x: tx, y: ty } = g.target
  const last = HP_FIRE + (HP_ORBS - 1) * HP_GAP + HP_FLIGHT
  if (t >= 4 && t < last) {
    out.dy = -1
    out.shade = glow(tone, 0.12 + 0.06 * Math.sin(t * 0.8))
  }
  const orbitAt = (i, at) => {
    const ang = at * 0.3 + (i * TAU) / HP_ORBS
    return [g.cx + Math.cos(ang) * rx, g.cy + Math.sin(ang) * ry, Math.sin(ang)]
  }
  for (let i = 0; i < HP_ORBS; i++) {
    const born = HP_FORM + i * 2
    const launch = HP_FIRE + i * HP_GAP
    if (t < born) continue
    if (t < launch) {
      const [x, y, depth] = orbitAt(i, t)
      ball(out, x, y, t - born < 2 ? 1 : 1.8, depth > 0 ? tone : dark(tone, 0.25), depth > 0 ? dot : back)
      continue
    }
    const f = phase(t, launch, launch + HP_FLIGHT)
    const [x0, y0] = orbitAt(i, launch)
    if (f < 1) {
      const x = lerp(x0, tx, easeIn(f))
      const y = lerp(y0, ty, easeIn(f))
      for (let d = 1; d <= 3; d++) {
        const was = Math.max(0, f - d * 0.07)
        dot(out, lerp(x0, tx, easeIn(was)), lerp(y0, ty, easeIn(was)), d === 1 ? lit : deep)
      }
      ball(out, x, y, 1.8, tone)
    } else {
      const age = t - launch - HP_FLIGHT
      if (age < 3) burst(out, tx + (i % 3) - 1, ty + ((i * 2) % 3) - 1, [3, 4, 2][age], age ? tone : hi)
      if (age === 0) out.shake = [g.side, 0]
    }
  }
  const age = t - last
  if (age >= 0 && age < 8) {
    ring(out, tx, ty, 2 + age * 1.2, age < 3 ? WHITE : age < 5 ? hi : tone, 0, Math.PI, age < 5 ? dot : dotted)
    if (age < 3) burst(out, tx, ty, 4 - age, tone)
    if (age === 0) out.shake = [g.side, 1]
  }
}

const SPIT_HEAVE = 14
const SPIT_HIT = 24

// Swell up with gulps of stored energy, cheeks bulging, then heave forward and spit a
// wobbling glob that splats on the target and drips
function spitup(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const { x: mx, y: my } = g.mouth
  if (t < SPIT_HEAVE) {
    const gulp = easeOut(phase(t, 0, SPIT_HEAVE)) * (1 + 0.3 * Math.sin(t * 1.1))
    out.sx = 1 + 0.09 * gulp
    out.sy = 1 + 0.05 * gulp
    if (t >= SPIT_HEAVE - 4) out.skew = lean(g, -g.side * 2)
    if (t >= 3) {
      const r = 1 + phase(t, 3, SPIT_HEAVE) * 1.5
      disc(out, mx - g.side, my + 1, r + 0.8, deep)
      ball(out, mx - g.side, my + 1, r, c)
    }
  } else {
    const ease = 1 - easeInOut(phase(t, SPIT_HEAVE + 3, 34))
    out.skew = lean(g, g.side * 3 * ease)
    out.dx = Math.round(g.side * ease)
    if (t < SPIT_HEAVE + 2) {
      out.sy = 0.92
      out.sx = 1.06
    }
  }
  if (t >= SPIT_HEAVE && t < SPIT_HIT) {
    const f = phase(t, SPIT_HEAVE, SPIT_HIT)
    const [x, y] = lob(g.ahead(2), my, tx, ty, 3, f)
    const r = 2.8 + Math.sin(t * 1.3) * 0.5
    for (let d = 1; d <= 3; d++) {
      const [px, py] = lob(g.ahead(2), my, tx, ty, 3, Math.max(0, f - d * 0.06))
      disc(out, px, py + d * 0.3, Math.max(0.5, r - d * 0.7), d === 1 ? c : deep)
    }
    disc(out, x, y, r + 0.9, deep)
    ball(out, x, y, r, c)
    dot(out, x - g.side, y - 1, WHITE)
  }
  const age = t - SPIT_HIT
  if (age >= 0 && age < 14) {
    // A flattened splat that spreads, then shrinks as it drips away
    const spread = age < 3 ? 3 + age * 1.8 : Math.max(2, 8 - (age - 3) * 0.5)
    for (let px = -Math.ceil(spread); px <= spread; px++) {
      const tall = Math.max(0, 2.4 - ((px * px) / (spread * spread)) * 2.4)
      dot(out, tx + px, ty - tall - 1, deep)
      dot(out, tx + px, ty + tall + 1, deep)
      line(out, tx + px, ty - tall, tx + px, ty + tall, Math.abs(px) < spread * 0.4 ? hi : Math.abs(px) < spread * 0.7 ? lit : c)
    }
    if (age < 2) burst(out, tx, ty, 4, hi)
    if (age === 0) out.shake = [g.side, 1]
    emit(age, { count: 8, gap: 0, start: 0, life: 9 }, (i, life) => {
      const ang = Math.PI + (i / 7) * Math.PI
      const v = 0.8 + rnd(a.seed, i) * 0.6
      const x = tx + Math.cos(ang) * v * life * 1.2
      const y = ty + Math.sin(ang) * v * life + life * life * 0.12
      if (y < g.ground) dot(out, x, y, i % 2 ? c : deep)
    })
    for (let k = 0; k < 3; k++) {
      const drip = Math.max(0, age - 4 - k * 2) * 0.5
      if (drip > 0) dot(out, tx - 2 + k * 2, Math.min(g.ground, ty + 2 + drip), deep)
    }
  }
}

const GIFT_EAT = 12
const GIFT_STOMP = 18
const GIFT_ROOT = 20
const GIFT_BLOOM = 32
const GIFT_POP = 38
const BERRY = ['..l..', '.bbl.', 'bhbbb', 'bbbbd', '.bdd.']
const LEAF = 0x5cbf4a

// A berry drops onto the head and is gobbled up, then a stomp sends its power creeping
// along the ground as a glowing root that blooms into a giant berry under the target
function naturalgift(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const fruit = { b: c, h: WHITE, d: deep, l: LEAF }
  if (t < GIFT_EAT) {
    const f = phase(t, 2, 9)
    const rest = Math.max(1, g.top - 5)
    const bounce = t >= 9 ? Math.abs(Math.sin((t - 9) * 1.2)) * 1.5 : 0
    if (t >= 2) stamp(out, g.cx - 2, lerp(-4, rest, easeIn(f)) - bounce, BERRY, fruit)
    if (t >= 6) out.skew = lean(g, -g.side)
  } else if (t < GIFT_STOMP) {
    const f = phase(t, GIFT_EAT, GIFT_STOMP - 2)
    const y = lerp(Math.max(1, g.top - 5), g.top + 2, easeIn(f))
    if (f < 1) stamp(out, g.cx - 2, y, f < 0.5 ? BERRY : BERRY.slice(1, 4), fruit)
    if (t >= GIFT_STOMP - 3) out.shade = rimGlow(g, out, c, 0.1, c, 0.8)
    sparkles(out, t, a.seed, g.cx, g.top + 1, 8, 5, lit, 3)
  } else if (t < GIFT_ROOT + 2) {
    out.sy = 0.9
    out.sx = 1.06
    out.shake = [0, 1]
    out.shade = rimGlow(g, out, c, 0.08, hi, 0.7)
  }

  // The root runs from the front foot to under the target, glowing as it goes
  const foot = g.frontAt(g.bottom) + g.side
  const gy = g.ground
  if (t >= GIFT_ROOT && t < GIFT_POP + 4) {
    const f = easeOut(phase(t, GIFT_ROOT, GIFT_BLOOM))
    const end = lerp(foot, tx, f)
    const fade = t >= GIFT_POP
    for (let x = foot; g.side > 0 ? x <= end : x >= end; x += g.side) {
      const k = Math.abs(x - foot)
      const y = gy - (Math.sin(k * 0.9) > 0.6 ? 1 : 0)
      if (fade && (x + t) % 2) continue
      dot(out, x, y, (k + t) % 5 === 0 ? hi : c)
      if (k % 4 === 2 && k < Math.abs(end - foot) - 1) dot(out, x, y - 1, LEAF)
    }
    if (!fade) spark(out, end, gy - 1, 1, hi)
  }

  if (t >= GIFT_BLOOM && t < GIFT_POP) {
    const f = easeOut(phase(t, GIFT_BLOOM, GIFT_POP - 1))
    const r = lerp(1, 4, f)
    const y = lerp(gy, ty, f)
    ball(out, tx, y, r, c)
    line(out, tx, y - r - 1, tx + g.side * 2, y - r - 2, LEAF)
    dot(out, tx - 1, y - r * 0.4, WHITE)
  }
  const age = t - GIFT_POP
  if (age >= 0 && age < 10) {
    if (age < 4) burst(out, tx, ty, [4, 6, 5, 3][age], age < 2 ? WHITE : c)
    if (age < 2) out.shake = [age ? -1 : 1, 1]
    emit(age, { count: 12, gap: 0, start: 0, life: 10 }, (i, life, f) => {
      const ang = (i / 12) * TAU + rnd(a.seed, i) * 0.4
      const v = 0.7 + rnd(a.seed, i, 1) * 0.6
      const x = tx + Math.cos(ang) * v * life * 1.3
      const y = ty + Math.sin(ang) * v * life + life * life * 0.08
      if (y >= g.ground || (f > 0.7 && (t + i) % 2)) return
      dot(out, x, y, i % 3 === 0 ? LEAF : i % 3 === 1 ? lit : deep)
    })
  }
}

const SNORE_WAKE = 44
const SNORES = [{ draw: 2, blast: 14, size: 1 }, { draw: 22, blast: 31, size: 0.7 }]
const Z_BIG = ['xxxxx', '...x.', '..x..', '.x...', 'xxxxx']
const Z_SMALL = ['xxx', '.x.', 'xxx']

// Asleep, blow a bubble out of the nose until it pops in a huge snore that fires Zs
// at the target, twice, then wake with a start
function snore(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const edge = dark(c, 0.6)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  for (const s of SNORES) {
    if (t >= s.draw && t < s.blast) {
      const f = easeOut(phase(t, s.draw, s.blast))
      const r = lerp(0.5, 3.5 * s.size, f)
      out.sy = 1 + 0.05 * f
      ring(out, mx + g.side * (r + 0.5), my, r, lit)
      dot(out, mx + g.side * (r * 0.5 + 0.5), my - r * 0.5, WHITE)
    }
    const age = t - s.blast
    if (age >= 0 && age < 3) {
      out.shake = [age % 2 ? -g.side : g.side, 1]
      out.dx = -g.side
      if (age === 0) spark(out, mx + g.side * 3, my, 3, hi)
    }
    // Three Zs blasted one after another, rumbling as they fly
    for (let k = 0; k < 3; k++) {
      const z = age - k * 2
      if (z < 0 || z >= 8) continue
      const f = z / 7
      const art = s.size < 1 ? Z_SMALL : Z_BIG
      const half = (art.length - 1) / 2
      const x = lerp(g.ahead(half + 2), tx, easeIn(f))
      const y = lerp(my, ty, f) + (z % 2 ? 1 : -1) * (1 - f)
      if (f < 1) {
        outlined(out, x - half, y - half, art, k === 0 ? WHITE : k === 1 ? hi : c, edge)
        line(out, x - g.side * (half + 1), y, x - g.side * (half + 4), y, deep, dotted)
      } else {
        burst(out, tx, ty, Math.round(4 * s.size + 1), k === 0 ? WHITE : c)
        if (k === 0) out.shake = [g.side, 1]
      }
    }
  }
  if (t >= SNORE_WAKE && t < SNORE_WAKE + 2) out.dy = -1
}

const BOOM_CRACK = 8
const BOOM_HIT = 13
const BOOM_ARM = 5

// Draw back while the air squeezes into a ring, then crack the sound barrier: a vapor
// cone flashes at the mouth and a sharp chevron of shock rips into the target
function sonicboom(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const edge = dark(c, 0.55)
  const h = heightOf(g)
  const { y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  if (t < BOOM_CRACK) {
    const f = easeOut(phase(t, 0, BOOM_CRACK))
    out.dx = -Math.round(f) * g.side
    out.skew = lean(g, -g.side * 2 * f)
    ring(out, g.ahead(2), my, lerp(5, 1, easeIn(phase(t, 1, BOOM_CRACK))), t % 2 ? lit : edge)
  } else {
    const ease = 1 - easeOut(phase(t, BOOM_CRACK, BOOM_CRACK + 3))
    out.skew = lean(g, g.side * 2 * ease)
    out.dx = Math.round(g.side * ease)
  }
  if (t === BOOM_CRACK) {
    out.shade = tint(WHITE, 0.5)
    out.shake = [g.side * 2, 1]
  }
  // The vapor cone: a tall thin ellipse that widens and breaks up
  const vage = t - BOOM_CRACK
  if (vage >= 0 && vage < 6) {
    const rx = 1 + vage * 0.7
    const ry = Math.max(3, h * 0.45) + vage * 0.5
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * TAU
      const x = g.ahead(2) + Math.cos(ang) * rx
      const y = my + Math.sin(ang) * ry
      if (y < 1 || y > g.ground) continue
      ;(vage < 3 ? dot : dotted)(out, x, y, vage < 2 ? WHITE : lit)
    }
  }
  if (t >= BOOM_CRACK && t < BOOM_HIT) {
    const f = phase(t, BOOM_CRACK, BOOM_HIT)
    const x = lerp(g.ahead(3), tx, f)
    const y = lerp(my, ty, f)
    const arm = BOOM_ARM + Math.round(f * 2)
    for (let d = 0; d <= arm; d++) {
      for (const s of [-1, 1]) {
        dot(out, x - g.side * (d + 2), y + s * d, edge)
        dot(out, x - g.side * (d + 1), y + s * d, d < 3 ? lit : hi)
        dot(out, x - g.side * d, y + s * d, d < 2 ? WHITE : hi)
      }
    }
    for (let k = -1; k <= 1; k++) line(out, x - g.side * 3, y + k * 2, x - g.side * (7 + Math.abs(k) * 2), y + k * 2, lit, dotted)
  }
  const age = t - BOOM_HIT
  if (age >= 0 && age < 7) {
    const r = 1 + age * 1.1
    arc(out, tx, ty, r, g.side > 0 ? 0 : Math.PI, 1.2, age < 3 ? WHITE : hi, age < 4 ? dot : dotted)
    arc(out, tx, ty, r + 1, g.side > 0 ? 0 : Math.PI, 1.2, edge, age < 4 ? dot : dotted)
    if (age < 3) {
      out.shake = [age % 2 ? -1 : 1, age % 2 ? 0 : 1]
      plus(out, tx, ty, hi, WHITE)
    }
  }
}

const NP_SIGIL = 2
const NP_SPROUT = 10
const NP_RISE = 18
const NP_SEND = 26
const NP_HIT = 36
const PEBBLE = 0x9a8a78

// A ring of nature draws itself on the ground, sprouts poke up, then leaves and pebbles
// spiral up the mon and stream at the target to burst in green
function naturepower(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const w = widthOf(g)
  const h = heightOf(g)
  const { x: tx, y: ty } = g.target
  const rx = w / 2 + 3
  const gy = g.ground
  const live = phase(t, NP_SPROUT, NP_RISE) * (1 - phase(t, NP_SEND + 4, NP_HIT + 2))
  if (live > 0) out.shade = glow(c, 0.18 * live)
  if (t >= NP_RISE && t < NP_SEND + 2) out.dy = -1

  // The sigil, the half in front painted over the feet and the far half behind
  if (t >= NP_SIGIL && t < NP_HIT + 4) {
    const drawn = easeOut(phase(t, NP_SIGIL, NP_SPROUT)) * Math.PI
    const gone = t >= NP_SEND + 4
    for (let k = 0; k < 40; k++) {
      const ang = Math.PI / 2 + ((k - 20) / 20) * Math.PI
      if (Math.abs(ang - Math.PI / 2) > drawn || (gone && (k + t) % 2)) continue
      const x = g.cx + Math.cos(ang) * rx
      const y = gy - 1 + Math.sin(ang) * 1.5
      ;(Math.sin(ang) > 0 ? dot : back)(out, x, Math.min(gy, y), (k + (t >> 1)) % 6 === 0 ? hi : c)
    }
    for (let k = 0; k < 5; k++) {
      const ang = Math.PI / 2 + ((k - 2) / 2.5) * Math.PI
      const x = Math.round(g.cx + Math.cos(ang) * rx)
      const tall = Math.round(3 * easeOut(phase(t, NP_SPROUT + k, NP_SPROUT + k + 4)))
      for (let d = 1; d <= tall; d++) dot(out, x, gy - 1 - d, d === tall ? lit : deep)
      if (tall >= 2) dot(out, x + (k % 2 ? 1 : -1), gy - tall, c)
    }
  }

  // Leaves and pebbles climb the mon in a helix, then pour off its top to the target
  emit(t, { count: 14, gap: 1, start: NP_RISE - 4, life: 16 }, (i, age) => {
    const pebble = i % 4 === 0
    const col = pebble ? PEBBLE : i % 2 ? c : lit
    const send = NP_SEND + i * 0.5
    if (t < send) {
      const ang = age * 0.9 + i
      const x = g.cx + Math.cos(ang) * (rx - 1)
      const y = gy - 2 - Math.min(age, 8) / 8 * (h - 1)
      ;(Math.sin(ang) > 0 ? dot : back)(out, x, y, col)
      if (!pebble) (Math.sin(ang) > 0 ? dot : back)(out, x + 1, y, deep)
      return
    }
    const f = phase(t, send, send + 8)
    if (f >= 1) return
    const [x, y] = lob(g.cx, g.top - 1, tx + (rnd(a.seed, i) - 0.5) * 4, ty + (rnd(a.seed, i, 1) - 0.5) * 4, 3, easeIn(f))
    dot(out, x, y, col)
    dot(out, x - g.side, y, pebble ? dark(PEBBLE, 0.3) : deep)
  })
  const age = t - NP_HIT
  if (age >= 0 && age < 9) {
    if (age < 4) burst(out, tx, ty, [3, 5, 6, 4][age], c)
    ring(out, tx, ty, 2 + age, age < 4 ? hi : deep, 0, Math.PI, age < 5 ? dot : dotted)
    if (age < 2) out.shake = [g.side, 1]
    emit(age, { count: 6, gap: 0, start: 0, life: 9 }, (i, life) => {
      const x = tx + (i - 2.5) * 1.8 + Math.sin(life * 0.7 + i) * 1.5
      const y = ty - 4 + rnd(a.seed, i, 7) * 5 + life * 0.6
      if (y < gy) dot(out, x, y, i % 2 ? c : lit)
    })
  }
}

const WRING_GRAB = 8
const WRING_COIL = 14
const WRING_SNAP = 32

// Twist the body like wringing a cloth while two strands snake out, coil the target,
// and wind ever tighter until drops squeeze out and they snap
function wringout(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const live = phase(t, 0, 4) * (1 - phase(t, WRING_SNAP, WRING_SNAP + 6))
  if (live > 0) out.skew = (y) => Math.sin(y * 0.45 + t * (0.5 + t * 0.02)) * 1.4 * live
  if (t >= WRING_SNAP && t < WRING_SNAP + 2) out.dx = -g.side

  if (t >= WRING_GRAB && t < WRING_COIL + 2) {
    const f = easeOut(phase(t, WRING_GRAB, WRING_COIL))
    for (const s of [0, 1]) {
      for (let k = 0; k <= 16; k++) {
        const u = (k / 16) * f
        const x = lerp(g.ahead(1), tx, u)
        const y = lerp(g.mouth.y, ty, u) + Math.sin(u * 9 + t * 0.9 + s * Math.PI) * 1.5
        dot(out, x, y, s ? deep : k === 16 ? WHITE : c)
      }
    }
  }
  if (t >= WRING_COIL && t < WRING_SNAP) {
    const f = phase(t, WRING_COIL, WRING_SNAP)
    const r = lerp(6, 2, easeIn(f))
    const spin = t * (0.4 + f * 0.9)
    const tall = 5
    const steps = 14
    for (const s of [0, 1]) {
      let prev = null
      for (let k = 0; k <= steps; k++) {
        const y = ty - tall + (k / steps) * tall * 2
        const ang = spin + k * 0.7 + s * Math.PI
        const p = [tx + Math.cos(ang) * r, y, Math.sin(ang) > 0]
        if (prev) {
          const front = p[2] && prev[2]
          const col = front ? (s ? WHITE : lit) : deep
          line(out, prev[0], prev[1], p[0], p[1], col, front ? dot : back)
        }
        prev = p
      }
    }
    if (f > 0.5 && t % 4 < 2) out.shake = [tremble(t), 0]
  }
  emit(t, { count: 10, gap: 1.2, start: 20, life: 9 }, (i, age) => {
    const way = i % 2 ? 1 : -1
    const x = tx + way * (2 + age * (0.8 + rnd(a.seed, i) * 0.6))
    const y = ty - 2 + (rnd(a.seed, i, 1) - 0.5) * 6 - age * 0.6 + age * age * 0.1
    if (y < g.ground) {
      dot(out, x, y, hi)
      dot(out, x, y + 1, deep)
    }
  })
  const age = t - WRING_SNAP
  if (age >= 0 && age < 8) {
    if (age < 4) burst(out, tx, ty, [5, 4, 3, 2][age], age < 2 ? WHITE : c)
    if (age < 2) out.shake = [g.side * 2, 1]
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * TAU + 0.3
      dotted(out, tx + Math.cos(ang) * (2.5 + age * 1.2), ty + Math.sin(ang) * (2.5 + age), k % 2 ? c : deep)
    }
  }
}

const RAZOR_CHARGE = 18
const RAZOR_GAP = 3
const RAZOR_BLADES = 4
const RAZOR_FLIGHT = 7

// Whip up a whirl of air that circles the body faster and faster, then loose four
// spinning crescent blades that each carve a slash across the target
function razorwind(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const edge = mix(c, 0x2c4c70, 0.7)
  const w = widthOf(g)
  const h = heightOf(g)
  const { x: tx, y: ty } = g.target
  if (t < RAZOR_CHARGE) {
    const f = phase(t, 0, RAZOR_CHARGE)
    const spin = t * 0.2 + t * t * 0.02
    for (let k = 0; k < 4; k++) {
      const yy = lerp(g.bottom - 1, g.top + 1, (k + 0.5) / 4)
      for (let d = 0; d < 7; d++) {
        const ang = spin * (k % 2 ? 1 : 1.2) + k * 1.7 - d * 0.2
        const x = g.cx + Math.cos(ang) * (w / 2 + 2)
        const y = yy + Math.sin(ang) * 1.5
        ;(Math.sin(ang) > 0 ? dot : back)(out, x, y, d === 0 ? WHITE : d < 3 ? lit : d < 5 ? c : edge)
      }
    }
    if (f > 0.5 && t % 4 === 0) out.shade = tint(WHITE, 0.25)
    if (t >= RAZOR_CHARGE - 4) out.dx = -g.side
  } else {
    const k = Math.floor((t - RAZOR_CHARGE) / RAZOR_GAP)
    const kick = k < RAZOR_BLADES && (t - RAZOR_CHARGE) % RAZOR_GAP === 0
    out.dx = kick ? g.side : 0
    out.skew = kick ? lean(g, g.side * 2) : null
  }
  for (let i = 0; i < RAZOR_BLADES; i++) {
    const launch = RAZOR_CHARGE + i * RAZOR_GAP
    const age = t - launch
    if (age < 0) continue
    const off = (i % 2 ? -1 : 1) * Math.min(3, h * 0.2)
    if (age < RAZOR_FLIGHT) {
      const f = age / RAZOR_FLIGHT
      const x = lerp(g.ahead(2), tx, f)
      const y = lerp(g.mouth.y + off, ty, f)
      const ang = age * 1.4 * g.side
      arc(out, x, y, 3.6, ang, 1.2, edge)
      arc(out, x, y, 3, ang, 1.1, hi)
      arc(out, x, y, 2.3, ang, 0.9, WHITE)
      dotted(out, x - g.side * 4, y, lit)
    } else if (age < RAZOR_FLIGHT + 5) {
      const s = age - RAZOR_FLIGHT
      const dir = i % 2 ? 1 : -1
      const len = Math.min(4, 2 + s * 1.5)
      line(out, tx - len, ty - dir * len + 1, tx + len, ty + dir * len + 1, edge, s > 2 ? dotted : dot)
      line(out, tx - len, ty - dir * len, tx + len, ty + dir * len, s < 2 ? WHITE : hi, s > 2 ? dotted : dot)
      if (s === 0) out.shake = [g.side, 0]
    }
  }
}

const MET_START = 3
const MET_STOP = 28
const MET_DING = 30
const MET_HIT = 38
const SKIN = 0xf2d2b0

// Hold up a finger and wag it like a metronome, ticking faster in shifting colors,
// until it stops with a ding and a rainbow bolt zaps the target
function metronome(out, t, a, g, c) {
  const h = heightOf(g)
  const { x: tx, y: ty } = g.target
  const len = clamp(Math.round(h * 0.35), 4, 7)
  const px = g.ahead(3)
  const py = Math.min(g.ground - 1, g.mouth.y + 2)
  const run = t - MET_START
  const swing = run < 0 ? 0 : run * 0.28 + run * run * 0.012
  const amp = 0.75 * phase(t, MET_START, MET_START + 3) * (1 - easeOut(phase(t, MET_STOP, MET_DING)))
  const theta = Math.sin(swing) * amp
  const tipX = px + Math.sin(theta) * len
  const tipY = py - Math.cos(theta) * len
  if (t < MET_HIT + 4) {
    out.skew = lean(g, theta * 2)
    const edge = dark(SKIN, 0.55)
    line(out, px + 1, py, tipX + 1, tipY, edge)
    line(out, px - 1, py, tipX - 1, tipY, edge)
    line(out, px, py, tipX, tipY, SKIN)
    dot(out, tipX, tipY - 1, edge)
    dot(out, tipX, tipY, 0xffc0c8)
    disc(out, px, py + 2, 2.6, edge)
    disc(out, px, py + 2, 1.8, SKIN)
    dot(out, px - g.side, py + 1, light(SKIN, 0.5))
  }
  // A tick of color at each end of the swing, hue sliding faster as it speeds up
  if (run > 0 && t < MET_STOP && Math.abs(Math.sin(swing)) > 0.9) {
    const col = mix(c, hsl((t * 0.07) % 1, 0.9, 0.6), 0.6)
    spark(out, tipX + Math.sign(theta) * 2, tipY, 2, col)
  }
  if (t >= MET_DING - 2 && t < MET_DING + 2) {
    spark(out, tipX, tipY - 1, 3, c)
    if (t === MET_DING) out.shade = tint(WHITE, 0.4)
  }
  if (t >= MET_DING && t < MET_HIT) {
    const f = phase(t, MET_DING, MET_HIT)
    const steps = 12
    let prev = [tipX, tipY]
    for (let k = 1; k <= steps; k++) {
      const u = (k / steps) * easeIn(Math.min(1, f * 1.3))
      const jag = k < steps ? (rnd(a.seed, k, t) - 0.5) * 3 : 0
      const p = [lerp(tipX, tx, u), lerp(tipY, ty, u) + jag]
      line(out, prev[0], prev[1], p[0], p[1], hsl((k / steps + t * 0.05) % 1, 0.9, 0.6))
      prev = p
    }
  }
  const age = t - MET_HIT
  if (age >= 0 && age < 9) {
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * TAU + age * 0.15
      const r0 = Math.max(0, age - 2)
      const r1 = Math.min(age + 2, 6)
      if (r1 > r0) line(out, tx + Math.cos(ang) * r0, ty + Math.sin(ang) * r0, tx + Math.cos(ang) * r1, ty + Math.sin(ang) * r1, hsl(k / 8, 0.9, 0.6))
    }
    if (age < 2) {
      dot(out, tx, ty, WHITE)
      out.shake = [g.side, 1]
    }
  }
}

const ASSIST_TOSS = [12, 16]
const ASSIST_LAUNCH = 26
const ASSIST_HIT = 33

// Two partners step in behind the mon as see-through copies, each tossing it a glowing
// orb over its head; the orbs merge and it hurls the lot at the target
function assist(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const w = widthOf(g)
  const h = heightOf(g)
  const { x: tx, y: ty } = g.target
  const hues = [0, 1].map((k) => mix(hsl((rnd(a.seed, 0, 33) + k * 0.35) % 1, 0.8, 0.6), c, 0.2))
  const fade = phase(t, ASSIST_LAUNCH + 2, ASSIST_LAUNCH + 8)
  const allies = [
    { dx: -g.side * Math.round(lerp(w, w * 0.55, easeOut(phase(t, 0, 8)))), dy: 0, born: 0 },
    { dx: -g.side * Math.round(lerp(w * 0.8, w * 0.3, easeOut(phase(t, 3, 11)))), dy: -Math.round(Math.min(4, h * 0.3)), born: 3 },
  ]
  if (fade < 1) {
    out.ghosts = allies.filter((p) => t >= p.born).map((p, k) => {
      const solid = phase(t, p.born, p.born + 5) * (1 - fade)
      return {
        dx: p.dx,
        dy: p.dy,
        shade: (col, x, y) => ((x + y) % 2 === 0 && rnd(a.seed, x, y) < solid + 0.2 ? mix(col, hues[k], 0.7) : null),
      }
    })
  }
  const catchAt = [g.ahead(2), Math.max(2, g.top)]
  ASSIST_TOSS.forEach((s, k) => {
    const f = phase(t, s, s + 7)
    if (t < s || f >= 1) return
    const from = [g.cx + allies[k].dx, g.cy + allies[k].dy - 2]
    const [x, y] = lob(from[0], from[1], catchAt[0], catchAt[1], 4, f)
    ball(out, x, y, 1.6, hues[k])
    dot(out, x - g.side * 2, y + 1, lit)
  })
  if (t >= ASSIST_TOSS[0] + 7 && t < ASSIST_LAUNCH) {
    const r = t >= ASSIST_TOSS[1] + 7 ? 1.6 + 0.4 * (t % 2) : 1.2
    ball(out, catchAt[0], catchAt[1], r, c)
    if (t >= ASSIST_TOSS[1] + 7) sparkles(out, t, a.seed, catchAt[0], catchAt[1], 7, 5, hi, 3)
    if (t === ASSIST_TOSS[0] + 7 || t === ASSIST_TOSS[1] + 7) out.dy = 1
  }
  if (t >= ASSIST_LAUNCH - 2 && t < ASSIST_LAUNCH + 3) out.skew = lean(g, g.side * (t < ASSIST_LAUNCH ? -2 : 2))
  if (t >= ASSIST_LAUNCH && t < ASSIST_HIT) {
    const f = easeIn(phase(t, ASSIST_LAUNCH, ASSIST_HIT))
    const x = lerp(catchAt[0], tx, f)
    const y = lerp(catchAt[1], ty, f)
    for (let d = 1; d <= 3; d++) dot(out, x - g.side * d * 1.5, y - d * 0.4 * Math.sign(ty - catchAt[1]), d === 1 ? hues[0] : hues[1])
    ball(out, x, y, 2, c)
  }
  const age = t - ASSIST_HIT
  if (age >= 0 && age < 8) {
    if (age < 4) burst(out, tx, ty, [4, 6, 5, 3][age], age < 2 ? WHITE : c)
    ring(out, tx, ty, 2 + age * 1.2, age % 2 ? hues[0] : hues[1], 0, Math.PI, age < 5 ? dot : dotted)
    if (age < 2) out.shake = [g.side, 1]
    if (age >= 2) sparkles(out, t, a.seed, tx, ty, 10, 8, deep, 4)
  }
}

const COPY_IN = 8
const COPY_DANCE = [10, 14, 18]
const COPY_TURN = 22
const COPY_HIT = 30

// A mirror copy of the mon blinks in facing it and apes its every hop, then turns and
// dashes into the target, where it bursts into sparkles
function copycat(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const w = widthOf(g)
  const { x: tx, y: ty } = g.target
  const hopAt = (s) => (t >= s && t < s + 3 ? -[1, 2, 1][t - s] : 0)
  const hop = COPY_DANCE.reduce((sum, s) => sum + hopAt(s), 0)
  out.dy = hop
  if (hop) out.skew = lean(g, (t % 8 < 4 ? 1 : -1) * 1.5)

  const gap = Math.round(Math.min(w + 1, Math.max(3, Math.abs(g.target.x - g.cx) - 2)))
  const run = easeIn(phase(t, COPY_TURN, COPY_HIT))
  const dx = g.side * Math.round(gap + run * Math.max(0, Math.abs(tx - g.cx) - gap))
  const solid = phase(t, 2, COPY_IN)
  if (t >= 2 && t < COPY_HIT) {
    out.ghosts = [{
      dx,
      dy: t < COPY_TURN ? hop : 0,
      flip: t < COPY_TURN,
      shade: (col, x, y) => {
        if (solid < 1 && (x + y + t) % 3 >= solid * 3) return null
        return (y + (t >> 1)) % 3 === 0 ? mix(col, light(c, 0.6), 0.75) : mix(col, c, 0.5)
      },
    }]
  }
  if (t >= COPY_TURN && t < COPY_HIT) {
    for (let k = 0; k < 3; k++) {
      const y = g.top + 2 + k * ((g.bottom - g.top) / 3)
      const x = g.cx + dx - g.side * (w / 2 + 1)
      line(out, x, y, x - g.side * (2 + run * 4), y, k % 2 ? lit : c, dotted)
    }
  }
  if (t >= COPY_IN - 2 && t < COPY_IN) sparkles(out, t, a.seed, g.cx + dx, g.cy, w, heightOf(g), hi, 4)
  const age = t - COPY_HIT
  if (age >= 0 && age < 10) {
    if (age < 4) burst(out, tx, ty, [3, 6, 5, 3][age], age < 2 ? WHITE : c)
    if (age < 2) out.shake = [g.side, 1]
    sparkles(out, t, a.seed, tx, ty, 10 + age, 8 + age, c, 6)
  }
}

const ECHO_SHOUTS = [4, 15, 26]
const ECHO_FLIGHT = 7

// Call out three times, each louder: a packet of sound flies to the target, which rings
// with echoes and bounces a fainter copy back
function echoedvoice(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const { y: my } = g.mouth
  const toward = aimOf(g)
  ECHO_SHOUTS.forEach((s, k) => {
    const age = t - s
    if (age >= 0 && age < 2) {
      out.dx = g.side
      out.sy = 1 - 0.04 * (k + 1)
      out.sx = 1 + 0.03 * (k + 1)
    }
    const size = 1.5 + k * 0.8
    if (age >= 0 && age < ECHO_FLIGHT) {
      const f = age / ECHO_FLIGHT
      const x = lerp(g.ahead(1), tx - g.side * size, f)
      const y = lerp(my, ty, f)
      for (let j = 0; j < 3; j++) arc(out, x - g.side * j * 2, y, size + 0.5, toward, 0.8, j === 0 ? WHITE : j === 1 ? hi : c)
    }
    const echo = age - ECHO_FLIGHT
    if (echo >= 0 && echo < 10) {
      for (let r = 0; r < k + 2; r++) {
        const rr = 1 + (echo - r * 2) * 1.2
        if (rr < 1) continue
        ring(out, tx, ty, rr, r === 0 ? (echo < 3 ? WHITE : hi) : r % 2 ? c : deep, 0, Math.PI, echo - r * 2 < 4 ? dot : dotted)
      }
      if (echo === 0) out.shake = [g.side * Math.min(2, k + 1), k === 2 ? 1 : 0]
      if (echo < 7) {
        const f = echo / 10
        const x = lerp(tx - g.side * 2, g.ahead(2), f)
        for (let j = 0; j < 2; j++) arc(out, x + g.side * j * 2, lerp(ty, my, f), size, toward + Math.PI, 0.7, j ? deep : lit, dotted)
      }
    }
  })
}

const MIMIC_DRAW = 3
const MIMIC_TAKE = 18
const MIMIC_FIRE = 26
const MIMIC_HIT = 33

// Reach toward the target while a scan sweeps it and a wavy stream of its essence flows
// into the mouth, flash with the copy, then fire it straight back
function mimic(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const { y: my } = g.mouth
  const wave = (u, i) => [lerp(g.ahead(1), tx, u), lerp(my, ty, u) + Math.sin(u * 8 + i * 1.3) * 2]
  if (t >= MIMIC_DRAW && t < MIMIC_TAKE) {
    out.skew = lean(g, g.side * 2 * easeOut(phase(t, MIMIC_DRAW, MIMIC_DRAW + 4)))
    const sweep = (t - MIMIC_DRAW) % 8
    const sx = tx - 4 + sweep
    line(out, sx, ty - 5, sx, ty + 5, sweep % 2 ? lit : hi)
    dot(out, sx - 1, ty - 5, deep)
    dot(out, sx - 1, ty + 5, deep)
  }
  emit(t, { count: 24, gap: 0.5, start: MIMIC_DRAW + 1, life: 8 }, (i, age, f) => {
    const [x, y] = wave(1 - easeIn(f), i % 3)
    dot(out, x, y, f > 0.7 ? WHITE : i % 2 ? c : lit)
    dot(out, x + g.side, y, deep)
  })
  if (t >= MIMIC_TAKE && t < MIMIC_FIRE) {
    const flash = t % 4 < 2 ? WHITE : c
    out.shade = rimGlow(g, out, c, 0.25, flash, 0.8)
    if (t < MIMIC_TAKE + 6) spark(out, g.cx, Math.max(1, g.top - 3), 1 + ((t - MIMIC_TAKE) % 3), c)
  }
  if (t >= MIMIC_FIRE && t < MIMIC_FIRE + 3) {
    out.dx = g.side
    out.skew = lean(g, g.side * 2)
  }
  // The copy fired back as a wavy beam whose tail chases its head
  if (t >= MIMIC_FIRE && t < MIMIC_HIT + 2) {
    const head = easeIn(phase(t, MIMIC_FIRE, MIMIC_HIT))
    const tail = easeIn(phase(t, MIMIC_FIRE + 3, MIMIC_HIT + 2))
    for (let k = 0; k <= 16; k++) {
      const u = lerp(tail, head, k / 16)
      for (let s = 0; s < 2; s++) {
        const [x, y] = wave(u, s * 1.5)
        dot(out, x, y + 1, deep)
        dot(out, x, y, k > 13 ? WHITE : s ? hi : c)
      }
    }
  }
  const age = t - MIMIC_HIT
  if (age >= 0 && age < 9) {
    if (age < 4) burst(out, tx, ty, [3, 5, 6, 4][age], age < 2 ? WHITE : c)
    if (age < 2) out.shake = [g.side, 1]
    for (const d of [-1, 1]) {
      const x = tx + d * (2 + age)
      if (age < 7) line(out, x, ty - 3, x, ty + 3, age < 3 ? hi : deep, age < 4 ? dot : dotted)
    }
  }
}

const ROUND_BEAT = 6
const ROUND_ROLL = 8
const ROUND_ARRIVE = 34
const ROUND_NOTES = 5
const QUARTER = ['..ss', '..s.', '..s.', 'nns.', 'nd..']

// Bob to a beat while a ring of notes joins in one by one and rolls like a wheel to
// the target, then the round breaks and the notes scatter
function round(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const h = heightOf(g)
  const { x: tx, y: ty } = g.target
  const r = clamp(h * 0.3, 3, 5)
  const beat = t % ROUND_BEAT
  if (t >= 2 && t < ROUND_ARRIVE + 4 && beat < 2) {
    out.dy = -1
    out.sy = 1.03
  }
  const roll = easeInOut(phase(t, ROUND_ROLL, ROUND_ARRIVE))
  const start = g.ahead(r + 1)
  const cx = lerp(start, tx, roll)
  const cy = lerp(g.mouth.y, ty, roll) - Math.abs(Math.sin(roll * Math.PI * 3)) * 1.5
  const spin = ((cx - start) / r) * g.side
  if (t < ROUND_ARRIVE) {
    ring(out, cx, cy, r, deep, 0, Math.PI, (o, x, y, col) => (Math.round(x * 3 + y + t) % 4 === 0 ? dot(o, x, y, col) : null))
    for (let i = 0; i < ROUND_NOTES; i++) {
      if (t < 2 + i * 2) continue
      const ang = spin + (i * TAU) / ROUND_NOTES
      const x = cx + Math.cos(ang) * r
      const y = cy + Math.sin(ang) * r
      const col = i % 2 ? c : lit
      stamp(out, x - 1, y - 3, QUARTER, { n: col, s: hi, d: deep }, g.side < 0)
    }
  }
  const age = t - ROUND_ARRIVE
  if (age >= 0 && age < 8) {
    if (age < 3) burst(out, tx, ty, 3 + age, age < 2 ? WHITE : c)
    if (age === 0) out.shake = [0, 1]
    for (let i = 0; i < ROUND_NOTES; i++) {
      const ang = spin + (i * TAU) / ROUND_NOTES
      const d = r + age * 1.2
      const x = tx + Math.cos(ang) * d
      const y = ty + Math.sin(ang) * d - age * 0.3
      if (age > 4 && (t + i) % 2) continue
      stamp(out, x - 1, y - 3, QUARTER, { n: i % 2 ? c : lit, s: hi, d: deep }, g.side < 0)
    }
  }
}

const WB_FORM = 8
const WB_DROP = 16
const WB_THROW = 20
const WB_HIT = 31
const SUN = 0xffcf3a
const RAIN = 0x4f9cff

// Glance up at a cloud that gathers overhead and drops a swirling ball of weather,
// catch it and hurl it, and it breaks over the target in sun rays and rain
function weatherball(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const cloudX = g.cx
  const cloudY = Math.max(3, g.top - 3)
  const sky = mix(c, 0x8a96a8, 0.6)
  if (t >= 2 && t < WB_THROW + 6) {
    const r = 3 * easeOut(phase(t, 2, 7))
    const going = t >= WB_THROW
    if (r > 0.5) {
      puff(out, cloudX - r * 0.8, cloudY + 1, r * 0.75, sky, a.seed + 1, going ? dotted : dot)
      puff(out, cloudX + r * 0.8, cloudY + 1, r * 0.75, sky, a.seed + 2, going ? dotted : dot)
      puff(out, cloudX, cloudY, r, sky, a.seed, going ? dotted : dot)
    }
    if (t >= 5 && t < WB_DROP) out.skew = lean(g, -g.side)
  }
  const spot = [g.ahead(2), g.mouth.y]
  const at = (f) => lob(spot[0], spot[1], tx, ty, 5, f)
  let ball0 = null
  if (t >= WB_FORM && t < WB_DROP) ball0 = [cloudX, cloudY + 3, lerp(0.8, 2.5, phase(t, WB_FORM, WB_DROP - 2))]
  else if (t >= WB_DROP && t < WB_THROW) {
    const f = easeIn(phase(t, WB_DROP, WB_THROW))
    ball0 = [lerp(cloudX, spot[0], f), lerp(cloudY + 3, spot[1], f), 2.5]
  } else if (t >= WB_THROW && t < WB_HIT) ball0 = [...at(phase(t, WB_THROW, WB_HIT)), 2.5]
  if (ball0) {
    const [x, y, r] = ball0
    ball(out, x, y, r, c)
    const spin = t * 0.7
    for (let k = 0; k < 4; k++) {
      const ang = spin + k * (TAU / 4)
      dot(out, x + Math.cos(ang) * (r - 0.6), y + Math.sin(ang) * (r - 0.6), k % 2 ? SUN : RAIN)
    }
  }
  if (t >= WB_THROW - 2 && t < WB_THROW + 3) out.skew = lean(g, g.side * (t < WB_THROW ? -2 : 3))
  const age = t - WB_HIT
  if (age >= 0 && age < 12) {
    if (age < 3) burst(out, tx, ty, 3 + age, age < 2 ? WHITE : hi)
    if (age < 2) out.shake = [g.side, 1]
    ring(out, tx, ty, 2 + age * 0.9, age < 4 ? hi : deep, 0, Math.PI, age < 5 ? dot : dotted)
    // Sun rays fan up out of the top half while rain falls from the bottom
    for (let k = 0; k < 5; k++) {
      const ang = Math.PI + (k + 0.5) * (Math.PI / 5)
      const r0 = 2 + age * 0.6
      if (age < 8) line(out, tx + Math.cos(ang) * r0, ty + Math.sin(ang) * r0, tx + Math.cos(ang) * (r0 + 2), ty + Math.sin(ang) * (r0 + 2), SUN)
    }
    for (let k = 0; k < 6; k++) {
      const x = tx + (k - 2.5) * 2
      const y = ty + 1 + ((age * 1.5 + k * 2.3) % 7)
      if (y < g.ground) line(out, x, y, x, y + 1, RAIN)
    }
  }
}

const TALK_BUBBLE = 6
const TALK_POP = 26
const TALK_HIT = 34
const TALK_WAKE = 44

// Mumble in its sleep: a speech bubble fills with garbled chatter, then pops and the
// dream move inside zips out and bursts on the target
function sleeptalk(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const dream = mix(c, hsl(rnd(a.seed, 0, 17), 0.85, 0.6), 0.55)
  out.sy = 1 + 0.03 * Math.sin(t * 0.45) * (1 - phase(t, TALK_WAKE - 4, TALK_WAKE))
  const bw = 5
  const bh = 3
  const bx = g.ahead(bw + 1)
  const by = Math.max(bh + 1, g.mouth.y - 6)
  if (t >= TALK_BUBBLE && t < TALK_POP) {
    const grow = easeOut(phase(t, TALK_BUBBLE, TALK_BUBBLE + 3))
    const rx = Math.max(1, bw * grow)
    const ry = Math.max(1, bh * grow)
    for (let py = -ry; py <= ry; py++) {
      for (let px = -rx; px <= rx; px++) {
        const d = (px / (rx + 0.5)) ** 2 + (py / (ry + 0.5)) ** 2
        if (d <= 1) dot(out, bx + px, by + py, d > 0.55 ? deep : WHITE)
      }
    }
    dot(out, g.ahead(2), g.mouth.y - 2, WHITE)
    dot(out, g.ahead(1), g.mouth.y - 1, WHITE)
    // Garbled chatter that shuffles every couple of ticks
    if (grow >= 1) {
      for (let k = 0; k < 14; k++) {
        if (rnd(a.seed, k, t >> 1) < 0.35) continue
        dot(out, bx - 3 + (k % 7), by - 1 + Math.floor(k / 7) * 2, k % 2 ? dream : dark(dream, 0.35))
      }
    }
  }
  if (t >= TALK_POP && t < TALK_POP + 3) spark(out, bx, by, 3 - (t - TALK_POP), dream)
  if (t >= TALK_POP && t < TALK_HIT) {
    const f = easeIn(phase(t, TALK_POP, TALK_HIT))
    const x = lerp(bx, tx, f)
    const y = lerp(by, ty, f) + Math.sin(f * TAU) * 1.5
    for (let d = 1; d <= 3; d++) dot(out, x - g.side * d, y + (d % 2 ? 0.5 : -0.5), d === 1 ? hi : dream)
    ball(out, x, y, 1.6, dream)
  }
  const age = t - TALK_HIT
  if (age >= 0 && age < 8) {
    if (age < 4) burst(out, tx, ty, [3, 5, 4, 2][age], age < 2 ? WHITE : dream)
    if (age < 2) out.shake = [g.side, 0]
    sparkles(out, t, a.seed, tx, ty, 10, 8, dream, 4)
  }
  if (t >= TALK_WAKE && t < TALK_WAKE + 2) out.dy = -1
}

const JUDGE_RISE = 10
const JUDGE_PILLARS = 7
const JUDGE_RAIN = 16
const JUDGE_FLASH = 32
const JUDGE_LAND = 44
const JUDGE_SPOTS = [-5, 4, -2, 6, -6, 2, 0]

// Rise under a spinning halo with a holy rim, then pillars of light in every type's
// color slam down around the target, ending in a blinding flash
function judgment(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const w = widthOf(g)
  const { x: tx, y: ty } = g.target
  const up = easeOut(phase(t, 0, JUDGE_RISE)) * (1 - easeInOut(phase(t, JUDGE_LAND, JUDGE_LAND + 10)))
  out.dy = -Math.round(2 * up)
  if (t >= 4 && t < JUDGE_LAND + 4) out.shade = rimGlow(g, out, c, 0.12, t % 4 < 2 ? WHITE : hi, 0.7)
  if (t >= 3 && t < JUDGE_LAND + 6) {
    const hx = g.cx
    const hy = Math.max(1, g.top + out.dy - 2)
    const rx = Math.max(2, w * 0.3)
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * TAU + t * 0.3
      const front = Math.sin(ang) > 0
      ;(front ? dot : back)(out, hx + Math.cos(ang) * rx, hy + Math.sin(ang) * 0.8, k % 4 === 0 ? WHITE : front ? hi : c)
    }
  }
  // Each pillar drops from the sky in two ticks, holds, then thins out
  for (let i = 0; i < JUDGE_PILLARS; i++) {
    const age = t - JUDGE_RAIN - i * 2
    if (age < 0 || age >= 8) continue
    const x = clamp(tx + JUDGE_SPOTS[i] + Math.round((rnd(a.seed, i) - 0.5) * 2), 1, g.columns - 2)
    const col = mix(c, hsl(i / JUDGE_PILLARS, 0.85, 0.6), 0.65)
    const foot = g.ground
    const head = age < 2 ? foot * (age + 1) / 2 : foot
    const thick = age < 4 ? 1 : 0
    for (let y = 0; y <= head; y++) {
      dot(out, x, y, age < 3 ? WHITE : col)
      if (thick) {
        dot(out, x - 1, y, col)
        dot(out, x + 1, y, col)
      }
    }
    if (age >= 1 && age < 5) {
      for (const d of [-1, 1]) line(out, x + d * 2, foot, x + d * (2 + age), foot - 1, col)
    }
  }
  if (t >= JUDGE_RAIN && t < JUDGE_FLASH) out.shake = [0, t % 2]
  const age = t - JUDGE_FLASH
  if (age >= 0 && age < 10) {
    if (age < 5) burst(out, tx, ty, [5, 8, 7, 5, 3][age], age < 2 ? WHITE : c)
    ring(out, tx, ty, 2 + age * 1.5, age < 3 ? WHITE : age < 6 ? lit : deep, 0, Math.PI, age < 6 ? dot : dotted)
    if (age < 3) out.shake = [age % 2 ? -2 : 2, 1]
  }
}

const SKETCH_TRACE = 4
const SKETCH_DONE = 24
const SKETCH_LIFT = 27
const SKETCH_HIT = 37
const PENCIL = ['...e', '..y.', '.y..', 'k...']
const PENCIL_COLORS = { e: 0xff8aa8, y: 0xffcf3a, k: 0x3a3a48 }

// A pencil traces the mon's outline in ink, then the drawing peels off, flies to the
// target shrinking as it goes, and bursts in scribbles
function sketch(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const rim = rimOf(g)
  const n = rim.length
  if (n === 0) return
  if (t >= SKETCH_TRACE && t < SKETCH_LIFT) out.shade = tint(0xa0a0a8, 0.25)
  if (t >= SKETCH_TRACE && t < SKETCH_LIFT + 4) {
    const drawn = Math.round(n * easeInOut(phase(t, SKETCH_TRACE, SKETCH_DONE)))
    const lifting = t >= SKETCH_LIFT
    for (let k = 0; k < drawn; k++) {
      if (lifting && (k + t) % 2) continue
      dot(out, rim[k][0], rim[k][1], k % 7 === 0 ? hi : c)
    }
    if (drawn > 0 && drawn < n) {
      const [px, py] = rim[drawn - 1]
      stamp(out, px, py - 3, PENCIL, PENCIL_COLORS, g.side < 0)
    }
  }
  if (t >= SKETCH_LIFT && t < SKETCH_HIT) {
    const f = easeIn(phase(t, SKETCH_LIFT, SKETCH_HIT))
    const s = lerp(1, 0.35, f)
    const ox = lerp(g.cx, tx, f)
    const oy = lerp(g.cy, ty, f) - Math.sin(f * Math.PI) * 3
    for (let k = 0; k < n; k += 1) {
      const [x, y] = rim[k]
      dot(out, ox + (x - g.cx) * s, oy + (y - g.cy) * s, k % 5 === 0 ? WHITE : c)
    }
  }
  const age = t - SKETCH_HIT
  if (age >= 0 && age < 9) {
    if (age < 3) burst(out, tx, ty, 3 + age, c)
    if (age < 2) out.shake = [g.side, 1]
    for (let k = 0; k < 6; k++) {
      if (age > 5 && (k + t) % 2) continue
      const ang = rnd(a.seed, k, 3) * TAU
      const d = 2 + age * 0.9
      const x = tx + Math.cos(ang) * d
      const y = ty + Math.sin(ang) * d
      line(out, x, y, x + (rnd(a.seed, k, 4) - 0.5) * 4, y + (rnd(a.seed, k, 5) - 0.5) * 3, k % 2 ? c : deep)
    }
  }
}

const TB_LOAD = 8
const TB_LOCK = 22
const TB_FIRE = 24
const TB_REACH = 27
const TB_STOP = 38
const DRIVE = ['xxxxx', 'xlhlx', 'xxxxx']

// Slot a drive into the back, lock a closing reticle on the target while scanlines run
// down the body, then fire a thick striped data beam that ends in square shock waves
function technoblast(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const { x: mx, y: my } = g.mouth
  if (t < TB_LOAD + 2) {
    const f = easeIn(phase(t, 1, TB_LOAD))
    const x = g.cx - g.side * 3 - 2
    const y = lerp(Math.max(0, g.top - 6), g.top + 1, f)
    if (t < TB_LOAD) stamp(out, x, y, DRIVE, { x: deep, l: c, h: WHITE })
    else out.shade = tint(c, 0.5)
  }
  if (t >= TB_LOAD + 2 && t < TB_STOP) {
    out.shade = (x, y, col) => ((y + t) % 3 === 0 ? mix(col, c, 0.5) : col)
  }
  if (t >= TB_LOAD && t < TB_FIRE + 4) {
    const s = Math.round(lerp(9, 3, easeOut(phase(t, TB_LOAD, TB_LOCK - 2))))
    const locked = t >= TB_LOCK - 2
    const col = locked ? (t % 2 ? WHITE : 0xff5a5a) : hi
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx = tx + sx * s
        const cy = ty + sy * s
        line(out, cx, cy, cx - sx * 2, cy, col)
        line(out, cx, cy, cx, cy - sy * 2, col)
      }
    }
    if (locked) plus(out, tx, ty, col, WHITE)
  }
  if (t >= TB_LOCK - 6 && t < TB_FIRE) {
    const r = Math.round(phase(t, TB_LOCK - 6, TB_FIRE))
    for (let dy = -r; dy <= r; dy++) line(out, g.ahead(1), my + dy, g.ahead(1 + 2 * r), my + dy, dy === 0 ? WHITE : hi)
  }
  if (t >= TB_FIRE && t < TB_STOP) {
    out.dx = -g.side
    out.shake = [0, t % 2]
    const reach = easeOut(phase(t, TB_FIRE, TB_REACH))
    const end = lerp(g.ahead(1), tx, reach)
    const thick = t < TB_STOP - 4 ? 2 : 1
    for (let x = g.ahead(1); g.side > 0 ? x <= end : x >= end; x += g.side) {
      const k = Math.floor((Math.abs(x - mx) - t * 2) / 2)
      const col = [WHITE, hi, c][((k % 3) + 3) % 3]
      const y = Math.round(lerp(my, ty, Math.abs(x - mx) / Math.max(1, Math.abs(tx - mx))))
      dot(out, x, y, col)
      for (let d = 1; d <= thick; d++) {
        dot(out, x, y - d, d === thick ? deep : lit)
        dot(out, x, y + d, d === thick ? deep : lit)
      }
    }
  } else if (t >= TB_STOP && t < TB_STOP + 4) out.dx = -g.side
  for (const s of [TB_REACH, TB_REACH + 5]) {
    const age = t - s
    if (age < 0 || age >= 7) continue
    const r = 1 + age
    const col = age < 2 ? WHITE : age < 4 ? hi : deep
    const paint = age < 4 ? dot : dotted
    line(out, tx - r, ty - r, tx + r, ty - r, col, paint)
    line(out, tx - r, ty + r, tx + r, ty + r, col, paint)
    line(out, tx - r, ty - r, tx - r, ty + r, col, paint)
    line(out, tx + r, ty - r, tx + r, ty + r, col, paint)
    if (age === 0) out.shake = [g.side * 2, 1]
  }
  emit(t, { count: 8, gap: 1, start: TB_REACH, life: 9 }, (i, age) => {
    const ang = rnd(a.seed, i) * TAU
    const x = Math.round(tx + Math.cos(ang) * age * 1.1)
    const y = Math.round(ty + Math.sin(ang) * age * 0.9)
    if (y >= g.ground) return
    dot(out, x, y, i % 2 ? c : lit)
    dot(out, x + 1, y, deep)
  })
}

const PRESENT_POP = 2
const PRESENT_TOSS = 10
const PRESENT_LAND = 24
const PRESENT_OPEN = 31
const BOX_LID = ['.r.r.', 'bbrbb', 'bbrbb']
const BOX_BODY = ['BBrBB', 'BBrBB', 'BBrBB']
const RIBBON = 0xffd84a

// Pull a wrapped gift out, hop and toss it to the target, where it lands, rattles,
// and pops its lid in a shower of confetti
function present(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const { x: tx } = g.target
  const colors = { b: lit, B: c, r: RIBBON }
  const head = [g.cx, Math.max(0, g.top - 7)]
  const land = [tx, g.ground - 5]
  let box = null
  if (t >= PRESENT_POP && t < PRESENT_TOSS) {
    box = [head[0], head[1] + (t < PRESENT_POP + 2 ? 1 : 0)]
    if (t < PRESENT_POP + 2) spark(out, head[0] + 2, head[1] + 2, 3, RIBBON)
  } else if (t >= PRESENT_TOSS && t < PRESENT_LAND) {
    box = lob(head[0], head[1], land[0], land[1], 4, phase(t, PRESENT_TOSS, PRESENT_LAND))
  } else if (t >= PRESENT_LAND && t < PRESENT_OPEN + 2) {
    box = [land[0] + (t >= PRESENT_LAND + 3 && t < PRESENT_OPEN ? tremble(t) : 0), land[1]]
  }
  if (t >= PRESENT_TOSS - 2 && t < PRESENT_TOSS + 4) {
    out.dy = t < PRESENT_TOSS ? 0 : -Math.round(2 * Math.sin(phase(t, PRESENT_TOSS, PRESENT_TOSS + 4) * Math.PI))
    if (t < PRESENT_TOSS) {
      out.sy = 0.92
      out.sx = 1.05
    }
  }
  if (box) {
    const [x, y] = box
    const opened = t >= PRESENT_OPEN
    // A dark backing one pixel wider, so the box reads on any background
    for (let py = opened ? 3 : 0; py < 6; py++) line(out, x - 1 - 2, y + py, x + 3, y + py, deep)
    if (!opened) stamp(out, x - 2, y, BOX_LID, colors, false)
    stamp(out, x - 2, y + 3, BOX_BODY, colors, false)
    if (t === PRESENT_LAND) out.shake = [0, 1]
  }
  const age = t - PRESENT_OPEN
  if (age >= 0 && age < 14) {
    const lidY = land[1] - age * 1.5 + age * age * 0.12
    if (age < 8) stamp(out, land[0] - 2 + g.side * age * 0.5, lidY, BOX_LID, colors, false)
    if (age < 3) burst(out, land[0], land[1] + 2, 3 + age, RIBBON)
    if (age < 2) out.shake = [g.side, 1]
    emit(age, { count: 16, gap: 0, start: 0, life: 14 }, (i, life, f) => {
      const ang = -Math.PI / 2 + (rnd(a.seed, i) - 0.5) * 2.2
      const v = 1 + rnd(a.seed, i, 1) * 0.8
      const x = land[0] + Math.cos(ang) * v * life + Math.sin(life * 0.8 + i) * 0.6
      const y = land[1] + 2 + Math.sin(ang) * v * life + life * life * 0.09
      if (y >= g.ground || y < 0 || (f > 0.75 && (t + i) % 2)) return
      const col = i % 4 === 0 ? c : hsl(rnd(a.seed, i, 2), 0.9, 0.62)
      dot(out, x, y, col)
      if (life % 2) dot(out, x + 1, y, col)
    })
  }
}

const SECRET_CROUCH = 6
const SECRET_STRIKE = 12
const SECRET_HOME = 30
const KEYHOLE = ['.xxx.', 'xxxxx', 'xxxxx', '.xxx.', '..x..', '.xxx.', '.xxx.']
const TERRAIN = [0x6cc24a, 0x9a8a78, 0x4f9cff, 0xe0c080]

// Crouch, then streak in low leaving afterimages and strike, uncovering a keyhole sigil
// ringed with runes that lets loose a fountain of grass, stone, water and sand
function secretpower(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const dist = Math.max(0, Math.abs(tx - g.mouth.x) - 1)
  if (t < SECRET_CROUCH) {
    const f = easeOut(phase(t, 0, SECRET_CROUCH))
    out.sy = 1 - 0.1 * f
    out.sx = 1 + 0.05 * f
  } else if (t < SECRET_STRIKE) {
    const f = easeIn(phase(t, SECRET_CROUCH, SECRET_STRIKE))
    out.dx = Math.round(g.side * dist * f)
    out.sy = 0.92
    const prev = Math.round(g.side * dist * easeIn(phase(t - 1, SECRET_CROUCH, SECRET_STRIKE)))
    const prev2 = Math.round(g.side * dist * easeIn(phase(t - 2, SECRET_CROUCH, SECRET_STRIKE)))
    out.ghosts = [ghost(prev2, 1, deep, 0.75), ghost(prev, 1, c, 0.6)]
  } else {
    const f = easeInOut(phase(t, SECRET_STRIKE + 3, SECRET_HOME))
    out.dx = Math.round(g.side * dist * (1 - f))
    out.dy = -Math.round(Math.sin(f * Math.PI) * 2)
    if (t < SECRET_STRIKE + 2) {
      out.shake = [g.side * 2, 1]
      out.sx = 0.9
    }
  }
  const age = t - SECRET_STRIKE
  if (age >= 0 && age < 4) burst(out, tx, ty, [4, 6, 5, 3][age], age < 2 ? WHITE : c)
  if (age >= 1 && age < 20) {
    const fading = age > 14
    const r = 6
    for (let k = 0; k < 8; k++) {
      if (fading && (k + t) % 2) continue
      const ang = (k / 8) * TAU + age * 0.2
      plus(out, tx + Math.cos(ang) * r, ty + Math.sin(ang) * r * 0.7, k % 2 ? c : deep, WHITE)
    }
    if (age >= 3 && !(fading && t % 2)) outlined(out, tx - 2, ty - 4, KEYHOLE, dark(c, 0.7), age % 4 < 2 ? WHITE : hi)
  }
  emit(t, { count: 18, gap: 0.5, start: SECRET_STRIKE + 4, life: 10 }, (i, life) => {
    const ang = -Math.PI / 2 + (rnd(a.seed, i) - 0.5) * 1.6
    const v = 1.1 + rnd(a.seed, i, 1) * 0.6
    const x = tx + Math.cos(ang) * v * life
    const y = ty - 3 + Math.sin(ang) * v * life + life * life * 0.12
    if (y < 0 || y >= g.ground) return
    const col = TERRAIN[i % TERRAIN.length]
    dot(out, x, y, col)
    dot(out, x, y + 1, dark(col, 0.35))
  })
}

export const TRICKS = {
  bide: { ticks: 52, color: 0xff9a3c, draw: bide },
  uproar: { ticks: 46, color: 0xffd84a, draw: uproar },
  whirlwind: { ticks: 44, color: 0xcfe8f5, draw: whirlwind },
  hypervoice: { ticks: 40, color: 0xc9a6ff, draw: hypervoice },
  hiddenpower: { ticks: 48, color: 0xb0e0d0, draw: hiddenpower },
  spitup: { ticks: 40, color: 0xffc860, draw: spitup },
  naturalgift: { ticks: 50, color: 0xe04a6a, draw: naturalgift },
  snore: { ticks: 48, color: 0xa8b8ff, pose: (t) => ({ asleep: t < SNORE_WAKE }), draw: snore },
  sonicboom: { ticks: 30, color: 0xd6e4f0, draw: sonicboom },
  naturepower: { ticks: 48, color: 0x6fcf5a, draw: naturepower },
  wringout: { ticks: 44, color: 0x8fc8ff, draw: wringout },
  razorwind: { ticks: 44, color: 0xe0f2ff, draw: razorwind },
  metronome: { ticks: 50, color: 0xffb0d0, draw: metronome },
  assist: { ticks: 44, color: 0xffc070, draw: assist },
  copycat: { ticks: 42, color: 0xffd060, draw: copycat },
  echoedvoice: { ticks: 44, color: 0x8ae6c8, draw: echoedvoice },
  mimic: { ticks: 44, color: 0xe0a0ff, draw: mimic },
  round: { ticks: 46, color: 0x8ab4ff, draw: round },
  weatherball: { ticks: 44, color: 0xa8d8ff, draw: weatherball },
  sleeptalk: { ticks: 48, color: 0xc0a8ff, pose: (t) => ({ asleep: t < TALK_WAKE }), draw: sleeptalk },
  judgment: { ticks: 58, color: 0xffe9a0, draw: judgment },
  sketch: { ticks: 46, color: 0x6a8aff, draw: sketch },
  technoblast: { ticks: 48, color: 0x6ad8ff, draw: technoblast },
  present: { ticks: 46, color: 0xff4a5a, draw: present },
  secretpower: { ticks: 38, color: 0xd09a5a, draw: secretpower },
}
