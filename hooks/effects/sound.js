// Sound moves

import {
  WHITE, burst, clamp, dark, dot, easeIn, easeOut, emit, lean, lerp, light, line, mix, phase, plus, ramp, ring, rnd,
  sparkles, stamp, tint,
} from './draw.js'

const TAU = Math.PI * 2
const DUST = [0xeadcc0, 0xc8b28e, 0x9a8668]
const ANGER = ['.r.r.', 'rr.rr', '.....', 'rr.rr', '.r.r.']
const ANGER_BIG = ['..r.r..', '.rr.rr.', 'rr...rr', '.......', 'rr...rr', '.rr.rr.', '..r.r..']
const NOTE_EIGHTH = ['..n..', '..nn.', '..n.n', '..n..', 'hnn..', 'nnd..']
const NOTE_BEAMED = ['..nnnnn', '..nnnnn', '..n...n', '..n...n', 'hnn.hnn', 'nnd.nnd']
const NOTE_COLORS = [0xff8ad8, 0xffd94a, 0x8af0a8, 0xc49aff]
const SMALL_HEART = ['hp.pp', 'ppppp', '.ppp.', '..p..']

// The angle from the mouth toward the target, flattened so waves travel mostly level
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

// A thick arc of sound around x, y, one arc per color, outermost first
function wave(out, x, y, r, angle, spread, colors, paint = dot) {
  colors.forEach((col, k) => {
    if (r - k >= 1) arc(out, x, y, r - k, angle, spread, col, paint)
  })
}

// A jagged arc whose zigzag teeth alternate in and out of radius r
function jagged(out, x, y, r, angle, spread, amp, c) {
  const teeth = Math.max(3, Math.round((r * spread * 2) / 2))
  let prev = null
  for (let k = 0; k <= teeth; k++) {
    const ang = angle - spread + (2 * spread * k) / teeth
    const rr = r + (k % 2 ? amp : -amp)
    const p = [x + Math.cos(ang) * rr, y + Math.sin(ang) * rr]
    if (prev) line(out, prev[0], prev[1], p[0], p[1], c)
    prev = p
  }
}

// Every other pixel, for things breaking up as they fade
const dotted = (out, x, y, c) => (Math.round(x) + Math.round(y)) % 2 && dot(out, x, y, c)

const SCREECH_START = 5
const SCREECH_END = 27

// Rear back and shriek, ripping out fast jagged sound waves while the mon quivers and
// the whole strip rattles
function screech(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const edge = dark(c, 0.55)
  const { x: mx, y: my } = g.mouth
  const aim = aimOf(g)
  const loud = t >= SCREECH_START && t < SCREECH_END
  if (t >= 1 && t < SCREECH_START) {
    out.dx = -g.side
    out.sy = 1 + 0.06 * phase(t, 1, SCREECH_START)
  } else if (loud) {
    out.dx = t % 2 ? g.side : 0
    out.shake = [t % 2 ? 1 : -1, t % 6 < 3 ? 0 : 1]
    if (t % 4 < 2) out.shade = tint(WHITE, 0.25)
  }
  emit(t, { count: 8, gap: 3, start: SCREECH_START, life: 8 }, (i, age, f) => {
    const r = 2.5 + age * 2.3
    const spread = 0.55 + f * 0.45
    const amp = 0.7 + f * 0.4
    if (f > 0.75 && (t + i) % 2) return
    jagged(out, mx, my, r - 1, aim, spread, amp, f < 0.5 ? edge : deep)
    jagged(out, mx, my, r, aim, spread, amp, f < 0.3 ? WHITE : f < 0.7 ? hi : c)
  })
  if (loud) {
    const p = (t - SCREECH_START) % 2
    for (const d of [-1, 1]) line(out, mx, my + d * 2, mx + g.side * (2 + p), my + d * (3 + p), p ? WHITE : edge)
  }
}

const SONIC_START = 4
const SONIC_PULSES = 8
const SONIC_GAP = 3
const SONIC_LIFE = 10

// Pulse clean sonic arcs from the mouth in a quick, even beat, each one widening as it
// travels to the target
function supersonic(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const aim = aimOf(g)
  const dist = Math.hypot(tx - mx, ty - my)
  const singing = t >= SONIC_START && t < SONIC_START + (SONIC_PULSES - 1) * SONIC_GAP + 1
  const beat = singing && (t - SONIC_START) % SONIC_GAP === 0
  if (t >= 1 && t < SONIC_START) out.dx = -g.side
  else if (beat) out.dx = g.side
  if (beat) {
    out.shade = tint(light(c, 0.5), 0.2)
    ring(out, mx, my, 1.5, hi)
  }
  emit(t, { count: SONIC_PULSES, gap: SONIC_GAP, start: SONIC_START, life: SONIC_LIFE }, (i, age, f) => {
    const r = 2 + f * (dist + 3)
    const spread = 0.5 + f * 0.45
    const colors = f < 0.35 ? [WHITE, c] : f < 0.7 ? [hi, c] : [c, deep]
    wave(out, mx, my, r, aim, spread, colors, f < 0.8 ? dot : dotted)
  })
}

const GROWL_BURSTS = [6, 13, 20]

// Hunch down and growl while short rough waves rumble out, anger veins throb on the
// head, and the body trembles
function growl(out, t, a, g, c) {
  const [hi] = ramp(c)
  const hunch = easeOut(phase(t, 0, 5)) * (1 - easeIn(phase(t, 26, 31)))
  out.sy = 1 - 0.08 * hunch
  out.sx = 1 + 0.05 * hunch
  if (t >= 5 && t < 27) out.dx = t % 2 ? g.side : 0
  const my = g.mouth.y + Math.round(0.08 * hunch * (g.bottom - g.mouth.y)) + 1
  const mx = g.mouth.x + out.dx
  const aim = aimOf(g)
  const angry = mix(c, 0xff2a1a, 0.45)
  for (const start of GROWL_BURSTS) {
    emit(t, { count: 2, gap: 3, start, life: 8 }, (i, age, f) => {
      if (f > 0.7 && t % 2) return
      const r = 3 + age * 1.4
      jagged(out, mx, my, r - 1, aim, 0.6, 0.8, dark(angry, 0.35))
      jagged(out, mx, my, r, aim, 0.6, 0.8, f < 0.35 ? hi : f < 0.7 ? c : angry)
    })
    if (t >= start && t < start + 2) out.shake = [g.side * (t === start ? 1 : -1), 0]
  }

  // Anger veins throb on the head, a second one joining later
  const veins = [
    { born: 4, x: g.mouth.x - g.side * 3, y: g.top + 3 },
    { born: 14, x: g.cx, y: g.top + 2 },
  ]
  for (const v of veins) {
    const age = t - v.born
    if (age < 0 || t >= 29 || (t >= 26 && t % 2)) continue
    const throb = Math.floor(age / 3) % 2 ? 0xff3a2e : 0xff7a5a
    if (age < 1) outlined(out, v.x - 2, v.y - 2, ANGER, WHITE, 0x4a0806)
    else outlined(out, v.x - 3, v.y - 3, ANGER_BIG, throb, 0x4a0806)
  }
}

// Pixel art in one color with a dark outline, so it reads over anything
function outlined(out, x, y, art, col, edge) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stamp(out, x + dx, y + dy, art, { r: edge })
  stamp(out, x, y, art, { r: col })
}

const ROAR_START = 8
const ROAR_END = 30

// Rear back, then roar out huge sound waves that shake the strip hard and blow dust
// off the ground
function roar(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: mx, y: my } = g.mouth
  const aim = aimOf(g)
  const rear = easeOut(phase(t, 0, ROAR_START))
  if (t < ROAR_START) {
    out.dx = -Math.round(rear) * g.side
    out.dy = -Math.round(rear)
    out.sy = 1 + 0.07 * rear
    out.sx = 1 - 0.03 * rear
    out.skew = lean(g, -g.side * 3 * rear)
  } else if (t < ROAR_END) {
    const fade = 1 - phase(t, ROAR_END - 6, ROAR_END)
    out.dx = g.side * (t % 2 ? 1 : 2)
    out.sx = 1 + 0.06 * fade
    out.sy = 1 - 0.04 * fade
    out.skew = lean(g, g.side * (t % 2 ? 2 : 3) * fade)
    out.shake = [Math.round((t % 2 ? 2 : -2) * fade), t % 4 < 2 ? 1 : 0]
  } else {
    out.dx = t < ROAR_END + 4 ? g.side : 0
  }
  if (t === ROAR_START) out.shade = tint(WHITE, 0.5)

  // Where the mouth sits once the lunge and lean throw the head forward
  const head = mx + g.side * 5
  emit(t, { count: 6, gap: 4, start: ROAR_START, life: 12 }, (i, age, f) => {
    const r = 3 + age * 2.5
    const colors = f < 0.35 ? [WHITE, hi, c] : f < 0.7 ? [hi, c, deep] : [c, deep]
    wave(out, head, my, r, aim, 0.8 + f * 0.25, colors, f < 0.75 ? dot : dotted)
  })

  // Dust ripped off the ground and flung away, with streaks of rushing air
  emit(t, { count: 26, gap: 0.8, start: ROAR_START + 2, life: 12 }, (i, age, f) => {
    const x0 = g.ahead(1 + rnd(a.seed, i) * Math.max(2, g.reach - 2))
    const speed = 1.2 + rnd(a.seed, i, 1) * 1.6
    const x = x0 + g.side * age * speed
    const y = g.ground - 1 - rnd(a.seed, i, 2) * 2 - age * age * 0.03 * (1 + rnd(a.seed, i, 3) * 3)
    const col = DUST[Math.min(2, Math.floor(f * 3))]
    dot(out, x, y, col)
    dot(out, x - g.side, y, col)
    dot(out, x, y + 1, dark(col, 0.2))
    dot(out, x - g.side, y + 1, dark(col, 0.2))
    if (f < 0.5) dot(out, x - g.side * 2, y + 1, dark(col, 0.35))
  })
  emit(t, { count: 9, gap: 2, start: ROAR_START + 1, life: 5 }, (i, age) => {
    const y = 2 + rnd(a.seed, i, 4) * (g.ground - 4)
    const x = g.ahead(3 + age * 4 + rnd(a.seed, i, 5) * 6)
    for (let d = 0; d < 4; d++) dot(out, x - g.side * d, y, d === 0 ? lit : c)
  })
}

const SING_NOTES = 7
const SING_GAP = 5
const SING_LIFE = 16

// Sway to the tune while colorful notes bob out on a gentle wave to the target
function sing(out, t, a, g, c) {
  const live = phase(t, 0, 4) * (1 - phase(t, 46, 51))
  const sway = Math.sin((t * TAU) / 16) * live
  if (live > 0) out.skew = lean(g, sway * 3)
  out.dy = -Math.round(Math.abs(sway) * 0.8)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const from = mx + (out.skew ? Math.round(out.skew(my)) : 0)
  emit(t, { count: SING_NOTES, gap: SING_GAP, start: 3, life: SING_LIFE }, (i, age, f) => {
    if (f > 0.85 && t % 2) return
    const x = lerp(from, tx + g.side * 2, f)
    const y = clamp(lerp(my - 1, ty - 4, f) + Math.sin(f * TAU * 1.2 + i * 1.3) * 2.5, 3, g.ground - 3)
    const col = i % 2 ? c : NOTE_COLORS[(i >> 1) % NOTE_COLORS.length]
    const art = i % 3 === 1 ? NOTE_BEAMED : NOTE_EIGHTH
    stamp(out, x - 3, y - 3, art, { n: col, h: light(col, 0.6), d: dark(col, 0.35) })
  })
  emit(t, { count: SING_NOTES, gap: SING_GAP, start: 3 + SING_LIFE - 3, life: 6 }, (i, age, f) => {
    const col = i % 2 ? c : NOTE_COLORS[(i >> 1) % NOTE_COLORS.length]
    const y = Math.max(1, ty - 4 - age)
    if (f < 0.5) plus(out, tx + g.side * 2 + (i % 2 ? 2 : -2), y, col, WHITE)
    else dot(out, tx + g.side * 2 + (i % 2 ? 2 : -2), y, col)
  })
}

// A pixel heart of size s centered on x, y, with a dark rim and a glint
function heart(out, x, y, s, c) {
  const [hi, lit, , deep] = ramp(c)
  const inside = (px, py) => {
    const u = (px - x) / s
    const v = -(py - y) / s + 0.1
    return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0
  }
  for (let py = Math.floor(y - s * 1.4); py <= Math.ceil(y + s * 1.4); py++) {
    for (let px = Math.floor(x - s * 1.3); px <= Math.ceil(x + s * 1.3); px++) {
      if (!inside(px, py)) continue
      const rim = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1)
      const u = (px - x) / s
      const v = -(py - y) / s
      dot(out, px, py, rim ? deep : u < -0.3 && v > 0.3 ? hi : u < 0.15 && v > -0.1 ? lit : c)
    }
  }
}

const KISS_BLOW = 9
const KISS_POP = 30

// Lean in and blow a kiss, a big heart that beats its way to the target and bursts
// into little hearts
function lovelykiss(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const { x: tx, y: ty } = g.target
  const pucker = easeOut(phase(t, 0, KISS_BLOW))
  if (t >= 1 && t < KISS_BLOW) {
    out.dx = Math.round(pucker) * g.side
    out.skew = lean(g, g.side * 3 * pucker)
  } else if (t >= KISS_BLOW && t < KISS_BLOW + 2) out.skew = lean(g, -g.side * 1.5)
  else if (t >= KISS_POP + 2 && t < KISS_POP + 6) out.dy = -1
  if (t >= 3 && t < KISS_BLOW + 3) out.shade = tint(c, 0.12 * (1 - phase(t, KISS_BLOW, KISS_BLOW + 3)))

  // Puckered lips, then the kiss leaves them as a heart
  const lips = g.mouth.x + out.dx + (out.skew ? Math.round(out.skew(g.mouth.y)) : 0)
  if (t >= 4 && t < KISS_BLOW) plus(out, lips, g.mouth.y + 1, c, WHITE)
  if (t >= KISS_BLOW && t < KISS_POP) {
    const f = phase(t, KISS_BLOW, KISS_POP)
    const x = lerp(g.ahead(2), tx, easeOut(f))
    const y = lerp(g.mouth.y, ty - 2, f) + Math.sin(f * TAU * 1.5) * 1.5
    const beat = t - KISS_BLOW < 3 ? 1.4 + (t - KISS_BLOW) : t % 6 < 2 ? 4.3 : 3.7
    heart(out, x, y, beat, c)
    emit(t, { count: 12, gap: 2, start: KISS_BLOW + 2, life: 6 }, (i, age) => {
      const was = phase(t - age, KISS_BLOW, KISS_POP)
      const px = lerp(g.ahead(2), tx, easeOut(was)) - g.side * 3
      const py = lerp(g.mouth.y, ty - 2, was) + Math.sin(was * TAU * 1.5) * 1.5 + (i % 2 ? -2 : 2)
      dot(out, px, py - age * 0.3, age < 3 ? WHITE : lit)
    })
  }
  const age = t - KISS_POP
  if (age >= 0 && age < 4) burst(out, tx, ty - 2, [3, 5, 4, 2][age], age < 2 ? WHITE : c)
  emit(t, { count: 8, gap: 0, start: KISS_POP, life: 14 }, (i, life, f) => {
    const ang = (i / 8) * TAU + 0.3
    const speed = 0.8 + rnd(a.seed, i) * 0.4
    const x = tx + Math.cos(ang) * speed * life
    const y = ty - 2 + Math.sin(ang) * speed * life * 0.8 - life * 0.25
    if (f > 0.75 && t % 2) return
    const col = i % 2 ? c : light(c, 0.3)
    stamp(out, x - 2, y - 2, SMALL_HEART, { p: col, h: f < 0.5 ? WHITE : hi })
  })
  if (t >= KISS_POP + 3 && t < 43) sparkles(out, t, a.seed, tx, ty - 2, 14, 10, lit, 5)
}

export const SOUND = {
  screech: { ticks: 36, color: 0xe8e8e8, draw: screech },
  supersonic: { ticks: 36, color: 0x9ad0ff, draw: supersonic },
  growl: { ticks: 32, color: 0xff8a5a, draw: growl },
  roar: { ticks: 40, color: 0xffb04a, draw: roar },
  sing: { ticks: 52, color: 0x9fd8ff, draw: sing },
  lovelykiss: { ticks: 44, color: 0xff6fa8, draw: lovelykiss },
}
