// Dragon moves

import {
  WHITE, back, ball, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, keys, lerp, light, line, mix,
  phase, puff, ramp, rnd, spark, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const VOID = 0x14081e
const ZAP = 0xffe14a
const DUST = 0xd8c8a6

// A dragon's second hue beside c: a hot red for flame, a cool cyan for wind
const hot = (c) => mix(c, 0xff4a2a, 0.55)
const cool = (c) => mix(c, 0x3ad8ff, 0.55)

// The sprite's leading column on row y at its base spot
const edgeAt = (g, y) => g.frontAt(clamp(Math.round(y), g.top, g.bottom)) - g.side

// How far a dash carries the mon so its front stops `gap` short of the target
const dashFar = (g, y, gap, most) => clamp(Math.abs(g.target.x - edgeAt(g, y)) - gap, 0, most)

const width = (g) => g.right - g.left + 1
const height = (g) => g.bottom - g.top + 1

// A lean that slides the top of the body px pixels toward the target, feet planted
function tilt(g, dy, px) {
  if (Math.abs(px) < 0.25) return null
  const feet = g.bottom + dy
  return (y) => (g.side * px * (feet - y)) / Math.max(1, g.bottom - g.top)
}

// An ellipse outline, or only the part within `spread` of `angle`; `skip` thins it into dashes
function oval(out, x, y, rx, ry, c, { paint = dot, skip = 0, angle = 0, spread = Math.PI } = {}) {
  const steps = Math.max(8, Math.ceil(Math.max(rx, ry) * spread * 2.4))
  for (let k = 0; k <= steps; k++) {
    if (skip && k % skip === 0) continue
    const ang = angle - spread + (2 * spread * k) / steps
    paint(out, x + rx * Math.cos(ang), y + ry * Math.sin(ang), c)
  }
}

// A two pixel ring, white inside while fresh
function shock(out, x, y, r, flat, c, f, paint = dot) {
  oval(out, x, y, r, r * flat, f < 0.5 ? c : dark(c, 0.35), { paint })
  if (r > 1.5) oval(out, x, y, r - 1, (r - 1) * flat, f < 0.4 ? WHITE : light(c, 0.4), { paint })
}

// A spiky impact star with a white heart and a dark rim
function star(out, x, y, r, c, { points = 8, inner = 0.45, flat = 1, turn = 0, paint = dot } = {}) {
  const lit = light(c, 0.5)
  const rim = dark(c, 0.5)
  for (let py = Math.floor(y - (r + 1) * flat); py <= Math.ceil(y + (r + 1) * flat); py++) {
    for (let px = Math.floor(x - r - 1); px <= Math.ceil(x + r + 1); px++) {
      const ux = px - x
      const uy = (py - y) / flat
      const d = Math.hypot(ux, uy)
      const s = ((((Math.atan2(uy, ux) / TAU) * points + turn) % 1) + 1) % 1
      const edge = r * lerp(inner, 1, Math.abs(s - 0.5) * 2)
      if (d > edge + 0.75) continue
      paint(out, px, py, d > edge ? rim : d < edge * 0.4 ? WHITE : d < edge * 0.7 ? lit : c)
    }
  }
}

// A tiny diamond scale, lit on top, shed by dragon blows
function scale(out, x, y, c) {
  dot(out, x, y - 1, light(c, 0.5))
  dot(out, x - 1, y, c)
  dot(out, x + 1, y, c)
  dot(out, x, y, light(c, 0.2))
  dot(out, x, y + 1, dark(c, 0.45))
}

// Scales knocked loose at t0 that tumble out and fall
function shed(out, t, a, g, t0, x, y, count, c, salt = 0) {
  emit(t, { count, start: t0, life: 12 }, (i, age, f) => {
    if (f > 0.75 && (t + i) % 2) return
    const vx = (rnd(a.seed, i, salt) - 0.5) * 2.2 + g.side * 0.5
    const vy = -(0.5 + rnd(a.seed, i, salt + 1) * 1.1)
    const py = Math.min(g.ground - 1, y + vy * age + 0.14 * age * age)
    scale(out, x + vx * age, py, i % 2 ? c : hot(c))
  })
}

// A short zigzag crackle of static from x, y
function crackle(out, a, x, y, len, salt, c) {
  let px = x
  let py = y
  for (let k = 0; k < len; k++) {
    const nx = px + (rnd(a.seed, k, salt) < 0.5 ? -1 : 1)
    const ny = py + (rnd(a.seed, k, salt + 1) < 0.5 ? -1 : 1)
    dot(out, nx, ny, k === 0 ? WHITE : c)
    px = nx
    py = ny
  }
}

const BREATH_START = 8
const BREATH_END = 26

// Rear back and draw in a breath, then roll out a widening cone of green dragon gas
// that crackles with static, billows over the target and drifts away
function dragonbreath(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  if (t < BREATH_START) {
    const f = easeOut(phase(t, 0, BREATH_START))
    out.dy = t >= 3 ? -1 : 0
    out.skew = tilt(g, out.dy, -2 * f)
    out.sy = 1 + 0.05 * f
  } else if (t < BREATH_END) {
    out.skew = tilt(g, 0, 2)
    out.dx = g.side * (t % 3 === 0 ? 2 : 1)
    if (t % 4 < 2) out.shade = tint(c, 0.15)
  } else if (t < BREATH_END + 4) out.dx = g.side
  const head = mx + g.side * 2

  // The breath drawn in, motes swept into the mouth
  emit(t, { count: 10, gap: 0.7, start: 0, life: 5 }, (i, age, f) => {
    if (t >= BREATH_START) return
    const ang = (rnd(a.seed, i, 1) - 0.5) * 2.2
    const d = 10 * (1 - easeIn(f))
    dot(out, mx + g.side * Math.cos(ang) * d, my + Math.sin(ang) * d * 0.8, f < 0.5 ? c : hi)
  })
  // Clouds of gas roll out, swelling as they go; older ones drawn first so new ones sit on top
  const dist = Math.max(4, Math.abs(tx - head))
  emit(t, { count: BREATH_END - BREATH_START, gap: 1, start: BREATH_START, life: 11 }, (i, age, f) => {
    const travel = Math.min(1, age / 9)
    const x = head + g.side * (travel * dist + Math.max(0, age - 9) * 0.8)
    const wob = (rnd(a.seed, i, 2) - 0.5) * travel * 9
    const y = lerp(my, ty, travel) + wob - Math.max(0, age - 9) * 0.8
    const r = 0.8 + travel * 2.6 * (1 - Math.max(0, f - 0.8) * 3)
    const col = f < 0.25 ? light(c, 0.3) : f < 0.6 ? c : mix(c, 0x5a7a70, 0.6)
    puff(out, x, y, r, col, a.seed + i)
  })
  // Static crackles through the cloud
  if (t >= BREATH_START + 3 && t < BREATH_END + 8) {
    for (let k = 0; k < 2; k++) {
      const f = 0.3 + 0.7 * rnd(a.seed, t, k + 3)
      const x = head + g.side * f * dist
      crackle(out, a, x, lerp(my, ty, f) + (rnd(a.seed, t, k + 7) - 0.5) * 6 * f, 5, t * 7 + k, ZAP)
    }
  }
  // The cloud lingers on the target, sparking, before it thins out
  if (t >= BREATH_END - 2 && t < BREATH_END + 12) {
    const f = phase(t, BREATH_END - 2, BREATH_END + 12)
    for (let k = 0; k < 4; k++) {
      const ang = k * 1.6 + t * 0.15
      const x = tx + Math.cos(ang) * 3 * (1 + f)
      const y = ty + Math.sin(ang) * 2 - f * 3
      if (f < 0.8 || (t + k) % 2) puff(out, x, y, 2.5 - f * 1.5, f < 0.4 ? c : mix(deep, 0x5a7a70, 0.5), a.seed + k + 40)
    }
    if (t % 3 === 0) spark(out, tx + (rnd(a.seed, t, 9) - 0.5) * 8, ty + (rnd(a.seed, t, 10) - 0.5) * 6, 1, ZAP)
  }
  if (t === BREATH_START) disc(out, head, my, 2, lit)
}

const CLAW_LEAP = 6
const RAKES = [11, 16]

// Bare glowing talons, leap in, and rake the target twice in crossing sets of three
// curved claw marks that flare red at the tips and shed scales
function dragonclaw(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const hy = Math.round(lerp(g.cy, ty, 0.5))
  const far = dashFar(g, hy, 9, 12)
  const [r1, r2] = RAKES
  const pos = (k) => Math.round(keys(k, [[0, 0], [CLAW_LEAP, -1], [r1, far, easeOut], [r2 + 4, far], [r2 + 14, 0]]))
  out.dx = g.side * pos(t)
  if (t < CLAW_LEAP) {
    const f = easeOut(phase(t, 0, CLAW_LEAP))
    out.sy = 1 - 0.1 * f
    out.sx = 1 + 0.05 * f
  } else if (t < r1) {
    out.dy = -Math.round(Math.sin(Math.PI * phase(t, CLAW_LEAP, r1)) * 4)
    out.ghosts = [ghost(g.side * pos(t - 2), -Math.round(Math.sin(Math.PI * phase(t - 2, CLAW_LEAP, r1)) * 4), deep, 0.55)]
  }
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [CLAW_LEAP, -2], [r1, 3], [r1 + 2, -1], [r2, 3], [r2 + 3, 0]]))

  // Three talons glint at the front while crouching
  if (t >= 1 && t < CLAW_LEAP + 2) {
    const fx = edgeAt(g, g.cy) + out.dx + g.side
    for (let k = 0; k < 3; k++) {
      const y = g.cy - 2 + k * 2
      dot(out, fx, y, lit)
      dot(out, fx + g.side, y + 1, t % 3 === k ? WHITE : hi)
    }
  }
  RAKES.forEach((h, n) => {
    const age = t - h + 2
    if (age < 0 || age >= 12) return
    // Each mark is a curve from a high corner down across the target, the second set mirrored
    const dir = n ? -1 : 1
    const grow = Math.min(1, (age + 1) / 3)
    const fade = phase(age, 6, 12)
    for (let k = 0; k < 3; k++) {
      // Marks run corner to corner, side by side across the slash
      const off = (k - 1) * 3.5
      const steps = 16
      for (let s = 0; s <= steps * grow; s++) {
        const u = s / steps
        const along = lerp(-6, 6, u)
        const bow = Math.sin(Math.PI * u) * 2
        const x = tx + g.side * dir * (along * 0.8 + off * 0.7 - bow * 0.7)
        const y = ty + along * 0.8 - off * 0.7 - bow * 0.7
        if (fade > 0.5 && (s + t) % 2) continue
        const tip = u > grow - 0.15 && age < 3
        const col = fade > 0.6 ? deep : tip ? WHITE : u > 0.85 ? hot(c) : Math.abs(u - 0.5) < 0.25 ? light(c, 0.6) : hi
        dot(out, x, y, col)
        if (fade < 0.4) dot(out, x + g.side * dir, y, dark(c, 0.4))
      }
    }
    if (age === 2) out.shake = [g.side * dir, 1]
    if (age >= 2 && age < 5) star(out, tx, ty, [5, 4, 2][age - 2], c, { points: 4, turn: n * 0.125 })
  })
  shed(out, t, a, g, r1, tx, ty, 6, c)
  shed(out, t, a, g, r2, tx, ty, 6, c, 20)
}

const PULSE_FIRE = 10
const PULSE_HIT = 17
const PULSE_END = 28

// Gather a churning orb in the jaws behind two counter-turning rings, then fire a
// beam of two twisting strands that throbs with traveling rings and floods the
// target in ripples
function dragonpulse(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const second = cool(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const charge = phase(t, 0, PULSE_FIRE)
  if (t < PULSE_FIRE) {
    out.dx = -g.side * Math.round(easeOut(charge))
    out.skew = tilt(g, 0, -1.5 * easeOut(charge))
    if (t >= 4) out.shade = tint(c, t % 2 ? 0.25 : 0.1)
  } else if (t < PULSE_END) {
    out.dx = -g.side * (t % 2 ? 2 : 1)
    out.skew = tilt(g, 0, 1)
    out.shake = t >= PULSE_HIT && t % 2 ? [g.side, 0] : [0, 0]
  } else if (t < PULSE_END + 4) out.dx = -g.side

  const ox = mx + g.side * 2
  if (t >= 1 && t < PULSE_FIRE + 1) {
    const r = 1 + 2.5 * charge
    for (const [dir, col] of [[1, c], [-1, second]]) {
      oval(out, ox, my, r + 3, (r + 3) * 0.6, col, { angle: dir * t * 0.6, spread: 1.2 })
    }
    ball(out, ox, my, r, c)
    disc(out, ox, my, r * 0.4, WHITE)
  }
  // The beam: two strands twisting round each other, growing out to the target
  if (t >= PULSE_FIRE && t < PULSE_END) {
    const reach = Math.abs(tx - ox)
    const grow = easeOut(phase(t, PULSE_FIRE, PULSE_HIT))
    const fade = phase(t, PULSE_END - 4, PULSE_END)
    const len = reach * grow
    const amp = 2.2 * (1 - fade * 0.6)
    const from = mx + out.dx + g.side
    for (let d = Math.round(fade * reach); d <= len; d++) {
      const u = d / Math.max(1, reach)
      const y = lerp(my, ty, u)
      const x = from + g.side * d
      const w = Math.sin(d * 0.8 - t * 1.4)
      const front = Math.cos(d * 0.8 - t * 1.4) > 0
      const node = (d + t * 2) % 6 < 1
      // A straight bright core, with the two strands wound round it
      dot(out, x, y - 1, c)
      dot(out, x, y, node ? WHITE : light(c, 0.6))
      dot(out, x, y + 1, deep)
      for (const [k, col] of [[1, light(c, 0.2)], [-1, light(second, 0.2)]]) {
        const paint = front === k > 0 ? dot : back
        const sy = y + k * w * amp * 1.3
        paint(out, x, sy, col)
        paint(out, x, sy + 1, dark(col, 0.4))
      }
    }
    // Rings ride the beam out, one every few ticks
    emit(t, { count: 6, gap: 3, start: PULSE_FIRE, life: 6 }, (i, age, f) => {
      const x = mx + g.side * (1 + f * reach)
      oval(out, x, lerp(my, ty, f), 1.5 + f, 3 + f * 2, f < 0.5 ? hi : lit, { paint: i % 2 ? back : dot })
    })
  }
  for (let k = 0; k < 4; k++) {
    const age = t - PULSE_HIT - k * 3
    if (age >= 0 && age < 8) shock(out, tx, ty, 2 + age * 1.3, 0.9, k % 2 ? second : c, age / 8, k % 2 ? back : dot)
  }
  if (t >= PULSE_HIT && t < PULSE_END) {
    ball(out, tx, ty, 2.5 + (t % 2), light(c, 0.25))
    disc(out, tx, ty, 1, WHITE)
  }
}

const DANCE_FLARE = 34

// Sway and hop in a mystic dance while a red strand and a blue strand wind up around
// the body in a double helix, then flare into a crown of flame over the head
function dragondance(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const red = hot(c)
  const blue = cool(c)
  const w = width(g)
  const h = height(g)
  const live = phase(t, 0, 4) * (1 - phase(t, DANCE_FLARE + 6, DANCE_FLARE + 12))
  const sway = Math.sin((t * TAU) / 12) * live
  out.skew = tilt(g, 0, sway * 3)
  const hop = (s, e) => (t >= s && t < e ? Math.round(Math.sin(Math.PI * phase(t, s, e)) * 3) : 0)
  out.dy = -(hop(10, 16) + hop(22, 28))
  if (t >= DANCE_FLARE && t < DANCE_FLARE + 3) {
    out.sy = 1.08
    out.shade = tint(WHITE, [0.6, 0.35, 0.15][t - DANCE_FLARE])
  } else if (live > 0) out.shade = tint(t % 6 < 3 ? red : blue, 0.12 * live)

  // Two strands climb the body, a half turn apart, front half over the sprite
  const rx = w / 2 + 3
  const rise = phase(t, 2, DANCE_FLARE)
  if (t >= 2 && t < DANCE_FLARE + 2) {
    for (const [k, col] of [[0, red], [1, blue]]) {
      const climb = (h + 2) * Math.min(1, rise * 1.6)
      const at = (u) => {
        const ang = u * TAU * 1.3 - t * 0.5 + k * Math.PI
        return [g.cx + Math.cos(ang) * rx * (1 - u * 0.35), g.bottom + out.dy - u * climb, Math.sin(ang) > 0]
      }
      for (let s = 0; s < 30; s++) {
        const [x0, y0, front] = at(s / 30)
        const [x1, y1] = at((s + 1) / 30)
        const u = s / 30
        const paint = front ? dot : back
        const tip = u > 0.88
        line(out, x0, y0 + 1, x1, y1 + 1, dark(col, 0.4), paint)
        line(out, x0, y0, x1, y1, tip ? WHITE : u > 0.6 ? light(col, 0.4) : col, paint)
      }
    }
  }
  // The flare: tongues of red and blue fire bloom over the crown and fall away as embers
  const age = t - DANCE_FLARE
  if (age >= 0 && age < 10) {
    const top = g.top + out.dy - 1
    for (let k = -3; k <= 3; k++) {
      const col = k % 2 ? red : blue
      const tall = (5 - Math.abs(k)) * (age < 4 ? (age + 1) / 4 : 1 - (age - 4) / 7)
      const x = g.cx + k * Math.max(1.5, w * 0.12)
      for (let d = 0; d < tall; d++) dot(out, x + Math.sin(d + t) * 0.4, top - d, d > tall - 2 ? hi : d < 1 ? lit : col)
    }
  }
  emit(t, { count: 12, start: DANCE_FLARE + 2, gap: 0.5, life: 8 }, (i, life, f) => {
    const x = g.cx + (rnd(a.seed, i, 3) - 0.5) * (w + 6)
    const y = g.top - 2 - life * 0.6 + life * life * 0.04
    if (y > 0) dot(out, x, y, f < 0.5 ? (i % 2 ? red : blue) : dark(c, 0.3))
  })
}

const RUSH_GO = 11
const RUSH_HIT = 17

// Wrap in a menacing dragon shroud with horns and gaping jaws, rush in behind them,
// and snap them shut on the target with a crushing chomp
function dragonrush(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const hy = Math.round(lerp(g.cy, g.target.y, 0.4))
  const far = dashFar(g, hy, 6, 14)
  const { x: tx, y: ty } = g.target
  const pos = (k) => Math.round(keys(k, [[0, 0], [RUSH_GO, -2, easeOut], [RUSH_HIT, far, easeIn], [RUSH_HIT + 5, far], [RUSH_HIT + 18, 0]]))
  out.dx = g.side * pos(t)
  const menace = easeOut(phase(t, 1, 8)) * (1 - phase(t, RUSH_HIT + 2, RUSH_HIT + 7))
  if (t < RUSH_GO) {
    out.sy = 1 + 0.06 * menace
    if (t >= 6) out.dx += tremble(t)
  } else if (t < RUSH_HIT) {
    out.sx = 1.1
    out.sy = 0.95
    out.ghosts = [2, 4].map((k, i) => ghost(g.side * pos(t - k), 0, i ? deep : c, 0.5 + i * 0.2))
  } else if (t < RUSH_HIT + 3) {
    out.sx = [0.84, 0.9, 0.96][t - RUSH_HIT]
    out.sy = [1.1, 1.06, 1.02][t - RUSH_HIT]
  }
  if (menace > 0) out.shade = (x, y, col) => mix(col, dark(c, 0.3), 0.35 * menace)
  if (t === RUSH_HIT) out.shade = tint(WHITE, 0.55)
  const age = t - RUSH_HIT
  if (age >= 0 && age < 5) out.shake = [[3, 1], [-3, 0], [2, -1], [-1, 1], [0, 0]][age].map((v, k) => (k ? v : v * g.side))
  out.skew = tilt(g, 0, keys(t, [[0, 0], [RUSH_GO, -2], [RUSH_HIT, 3, easeIn], [RUSH_HIT + 5, 2], [RUSH_HIT + 14, 0]]))

  // The shroud: a glow hugging the body behind it, with two swept back horns
  if (menace > 0.1) {
    const cx = g.cx + out.dx
    // Tongues of shadowy flame flicker up off the rim, behind the body
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * TAU
      const x = cx + Math.cos(ang) * (width(g) / 2 + 1)
      const y = g.cy + Math.sin(ang) * (height(g) / 2 + 1)
      const tall = (1 + rnd(a.seed, k, t >> 1) * 3) * menace
      for (let d = 0; d < tall; d++) back(out, x, y - d, d > tall - 1.5 ? lit : d ? c : deep)
    }
    for (const k of [0, 1]) {
      const bx = cx + g.side * (k ? 1 : -3)
      for (let d = 0; d < 4 * menace; d++) dot(out, bx - g.side * d * 0.7, g.top - 1 - d, d > 2 ? WHITE : lit)
    }
  }
  // Jaws open ahead of the body, gaping wider as it rushes, then slam shut
  const len = 6 + Math.round(menace * 2)
  const jx = age >= 0 ? tx + g.side * 3 : edgeAt(g, hy) + out.dx + g.side * (len + 1)
  const gape = age >= 0 ? Math.max(0, 5 - age * 3) : 5 * menace
  if (menace > 0.2 && age < 4) {
    for (const s of [-1, 1]) {
      for (let d = 0; d <= len; d++) {
        const x = jx - g.side * (len - d)
        const y = ty - (age >= 0 ? 0 : ty - hy) + s * (gape * (1 - d / len) + 1)
        dot(out, x, y, d === len ? WHITE : lit)
        dot(out, x, y - s, deep)
        // Teeth point inward every other pixel
        if (d % 2 === 0 && d > 1 && d < len) dot(out, x, y - s * -1, hi)
      }
    }
  }
  if (age >= 1 && age < 6) star(out, tx, ty, [9, 11, 9, 6, 3][age - 1], c, { flat: 0.7, turn: age * 0.3 })
  if (age >= 2 && age < 10) shock(out, tx, ty, 4 + age * 1.3, 0.8, c, age / 10, back)
  shed(out, t, a, g, RUSH_HIT, tx, ty, 10, c)
}

const CHOPS = [10, 18]

// Hop in and chop twice, a flat sweep across then a straight drop down, leaving a
// glowing cross that cracks apart
function dualchop(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const hy = Math.round(lerp(g.cy, ty, 0.5))
  const far = dashFar(g, hy, 6, 10)
  const [c1, c2] = CHOPS
  const pos = (k) => Math.round(keys(k, [[0, 0], [3, -1], [c1 - 2, far, easeOut], [c2 + 5, far], [c2 + 16, 0]]))
  out.dx = g.side * pos(t)
  if (t >= 3 && t < c1 - 2) out.dy = -Math.round(Math.sin(Math.PI * phase(t, 3, c1 - 2)) * 3)
  if (t >= c1 + 2 && t < c2 - 2) {
    out.dy = -Math.round(Math.sin(Math.PI * phase(t, c1 + 2, c2 - 2)) * 3)
    out.flipX = t >= c1 + 3 && t < c2 - 3
  }
  if (t === c1 || t === c2) {
    out.sy = 0.9
    out.sx = 1.06
  }
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [c1 - 2, -2], [c1, 3], [c1 + 3, 0], [c2 - 2, -2], [c2, 3], [c2 + 6, 0]]))

  // The two chops: a blade of light sweeping across, then one dropping straight down
  const sweep = (h, horizontal) => {
    const age = t - h
    if (age < -2 || age >= 2) return
    const f = (age + 3) / 4
    for (let d = -8; d <= 8; d++) {
      if (d / 8 > f * 2 - 1) continue
      const lead = d / 8 > f * 2 - 1.3
      // A thick edge of light, white along its leading end
      for (let w = -2; w <= 2; w++) {
        const x = horizontal ? tx - g.side * d : tx + w
        const y = horizontal ? ty + w : ty + d
        const col = w === 0 ? (lead ? WHITE : hi) : Math.abs(w) === 1 ? (lead ? hi : c) : deep
        if (Math.abs(w) < 2 || !lead) dot(out, x, y, col)
      }
    }
  }
  sweep(c1, true)
  sweep(c2, false)
  // The marks they leave glow, the cross pulsing, then crack into flecks
  const mark = (h, horizontal, until) => {
    const age = t - h - 2
    if (age < 0 || t >= until) return
    const pulse = t >= c2 && t < c2 + 6 && t % 2 === 0
    for (let d = -6; d <= 6; d++) {
      if (age > 6 && (d + t) % 3 === 0) continue
      const x = horizontal ? tx + d : tx
      const y = horizontal ? ty : ty + d
      dot(out, x, y, pulse ? WHITE : Math.abs(d) < 3 ? lit : c)
    }
  }
  mark(c1, true, c2 + 10)
  mark(c2, false, c2 + 10)
  for (const [h, n] of [[c1, 0], [c2, 1]]) {
    const age = t - h
    if (age === 0) out.shake = n ? [0, 2] : [g.side * 2, 0]
    if (age === 1) out.shake = n ? [0, -1] : [-g.side, 0]
  }
  if (t >= c2 && t < c2 + 4) star(out, tx, ty, [4, 6, 5, 3][t - c2], c, { points: 4, inner: 0.3 })
  emit(t, { count: 10, start: c2 + 10, life: 8 }, (i, age, f) => {
    const horizontal = i % 2 === 0
    const d = (rnd(a.seed, i, 4) - 0.5) * 12
    const x = horizontal ? tx + d : tx
    const y = horizontal ? ty : ty + d
    const ang = rnd(a.seed, i, 5) * TAU
    dot(out, x + Math.cos(ang) * age * 0.7, y + Math.sin(ang) * age * 0.7 + age * age * 0.05, f < 0.5 ? lit : deep)
  })
}

const TWIST_SPIN = 9
const TWIST_ARRIVE = 20
const TWIST_FADE = 36

// Spin on the spot to whip up a little whirlwind, send it snaking along the ground to
// the target, where it towers into a twister of banded wind with flecks caught in it
function twister(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx } = g.target
  if (t < TWIST_SPIN + 2) {
    out.flipX = t >= 3 && Math.floor(t / 2) % 2 === 1
    out.sx = t >= 3 && t % 2 ? 0.88 : 1
    out.dy = t >= 3 && t < TWIST_SPIN ? -1 : 0
  }
  const startX = g.ahead(2)
  const travel = easeInOut(phase(t, TWIST_SPIN, TWIST_ARRIVE))
  const bx = lerp(startX, tx, travel) + Math.sin(t * 0.8) * (1 - travel) * 1.5
  const tall = t < TWIST_SPIN ? 4 * phase(t, 2, TWIST_SPIN) : lerp(5, Math.min(g.ground - 2, 22), easeOut(phase(t, TWIST_ARRIVE - 4, TWIST_ARRIVE + 4)))
  const fade = phase(t, TWIST_FADE, TWIST_FADE + 8)
  if (t >= 2 && t < TWIST_FADE + 8) {
    // Each row of the funnel is wider the higher it is, its middle swaying
    const h = Math.round(tall * (1 - fade))
    for (let k = 0; k <= h; k++) {
      const y = g.ground - k
      const u = k / Math.max(1, tall)
      const r = 1 + u * u * 6 + u * 2
      const sway = Math.sin(t * 0.5 + u * 3) * u * 2
      const cx = bx + sway
      // Bands of wind wrap around the funnel and climb as it turns
      const band = (k + Math.floor(t * 1.5)) % 4
      for (let s = -1; s <= 1; s += 2) {
        dot(out, cx + s * r, y, band < 2 ? lit : c)
        back(out, cx + s * (r - 1), y, deep)
      }
      if (band === 0) line(out, cx - r + 1, y, cx + r - 1, y - 1, hi)
      else if (band === 2) line(out, cx - r + 1, y - 1, cx + r - 1, y, dark(c, 0.15), back)
    }
    // Flecks whirl around inside
    for (let i = 0; i < 6; i++) {
      const u = rnd(a.seed, i, 4)
      const y = g.ground - u * h
      const r = 1 + u * u * 6 + u * 2
      const ang = t * 0.7 + i * 1.7
      const paint = Math.sin(ang) > 0 ? dot : back
      paint(out, bx + Math.sin(t * 0.5 + u * 3) * u * 2 + Math.cos(ang) * (r - 0.5), y, i % 2 ? WHITE : hot(c))
    }
  }
  if (t >= TWIST_ARRIVE && t < TWIST_FADE && t % 4 === 0) out.shake = [t % 8 ? 1 : -1, 0]
  // Dust kicked along the ground under the twister
  emit(t, { count: 16, gap: 1.5, start: TWIST_SPIN, life: 6 }, (i, age, f) => {
    const s = i % 2 ? 1 : -1
    const x = bx + s * (3 + age * 0.8)
    if (t < TWIST_FADE + 4) puff(out, x, g.ground - 1 - age * 0.3, 0.6 + Math.sin(Math.PI * f), mix(DUST, 0x8a7c66, f), a.seed + i)
  })
}

const TAIL_TURN = 6
const TAIL_HIT = 14

// Turn around, swing the tail up from the ground in a huge swat, and send the foe
// skidding off along the ground and out of the strip in a trail of dust
function dragontail(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const hy = Math.round(lerp(g.cy, ty, 0.5))
  const far = dashFar(g, hy, 6, 10)
  const pos = (k) => Math.round(keys(k, [[0, 0], [TAIL_TURN, 1], [TAIL_HIT - 2, far, easeOut], [TAIL_HIT + 6, far], [TAIL_HIT + 20, 0]]))
  out.dx = g.side * pos(t)
  out.flipX = t >= TAIL_TURN && t < TAIL_HIT + 8
  if (t >= TAIL_HIT - 2 && t < TAIL_HIT + 2) {
    out.skew = tilt(g, 0, -3)
    out.sx = 1.06
  } else out.skew = tilt(g, 0, keys(t, [[0, 0], [TAIL_TURN, 1], [TAIL_HIT - 2, 0], [TAIL_HIT + 6, 0]]))
  if (t === TAIL_HIT) out.shade = tint(WHITE, 0.4)

  // The swat sweeps up from the ground behind the target to over it
  const px = tx - g.side * 4
  const py = g.ground + 2
  const R = Math.max(6, g.ground - ty + 4)
  if (t >= TAIL_HIT - 3 && t < TAIL_HIT + 5) {
    const head = phase(t, TAIL_HIT - 3, TAIL_HIT + 1)
    const tail = phase(t, TAIL_HIT - 1, TAIL_HIT + 5)
    for (let u = tail; u <= head; u += 0.02) {
      const ang = Math.PI - u * Math.PI * 0.75
      const x = px - g.side * Math.cos(ang) * R
      const y = py - Math.sin(ang) * R
      const near = head - u
      const thick = near < 0.3 ? 4 : 2
      for (let w = 0; w < thick; w++) {
        dot(out, x, y + w, w === 0 ? (near < 0.1 ? WHITE : hi) : w < thick - 1 ? c : deep)
      }
    }
  }
  const age = t - TAIL_HIT
  if (age >= 0 && age < 4) {
    star(out, tx, ty, [6, 8, 6, 3][age], c, { flat: 0.7 })
    out.shake = [[2, 0], [-2, 1], [1, 0], [0, 0]][age].map((v, k) => (k ? v : v * g.side))
  }
  // The foe is knocked skidding along the ground and away out of the strip
  const exit = g.side > 0 ? g.columns + 3 : -4
  if (age >= 1 && age < 9) {
    const f = easeIn(phase(age, 1, 9))
    const x = lerp(tx, exit, f)
    const y = g.ground - 3
    for (let d = 0; d < 12; d++) {
      dot(out, x - g.side * d, y, d < 3 ? WHITE : d < 7 ? lit : c)
      dot(out, x - g.side * d, y + 1, d < 6 ? c : deep)
    }
    disc(out, x, y, 2.5, deep)
    disc(out, x, y, 1.6, hi)
    dot(out, x, y, WHITE)
  }
  emit(t, { count: 12, gap: 0.6, start: TAIL_HIT + 1, life: 7 }, (i, life, f) => {
    const was = easeIn(phase(i * 0.6 + 1, 1, 9))
    const x = lerp(tx, exit, was)
    puff(out, x - g.side * life * 0.3, g.ground - 1 - life * 0.3, 0.5 + 1.3 * Math.sin(Math.PI * f), mix(DUST, 0x8a7c66, f), a.seed + i)
  })
  shed(out, t, a, g, TAIL_HIT, tx, ty, 6, c)
}

const TIME_ROAR = 14
const TIME_STOP = 36
const TIME_RESUME = 42

// Rear up as a clock face rings the body, then let out a roar that blasts the target
// in waves while a second clock spins its hand backward over it. Time freezes in a
// white flash, then the mon slumps gray to recharge.
function roaroftime(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const steel = 0xc8d4e0
  const rear = easeOut(phase(t, 0, TIME_ROAR))
  const slump = phase(t, TIME_RESUME, TIME_RESUME + 4) * (1 - phase(t, 54, 62))
  if (t < TIME_ROAR) {
    out.dy = -Math.round(rear * 2)
    out.dx = -g.side * Math.round(rear)
    out.skew = tilt(g, out.dy, -3 * rear)
    out.sy = 1 + 0.06 * rear
  } else if (t < TIME_STOP) {
    out.dx = g.side * (t % 2 ? 1 : 2)
    out.skew = tilt(g, 0, t % 2 ? 2 : 3)
    out.shake = [t % 2 ? 2 : -2, t % 4 < 2 ? 1 : 0]
    if (t % 3 === 0) out.shade = tint(cool(c), 0.25)
  } else if (t < TIME_RESUME) {
    out.shade = tint(WHITE, t < TIME_STOP + 2 ? 0.7 : 0.3)
  } else {
    out.sy = 1 - 0.08 * slump
    out.sx = 1 + 0.03 * slump
    out.shade = (x, y, col) => mix(col, 0x6a6a7a, 0.5 * slump)
  }

  // A clock face of ticks around a center, its hand at `hand` radians
  const clock = (cx, cy, r, hand, f, paint) => {
    for (let k = 0; k < 12; k++) {
      if (k / 12 > f) break
      const ang = (k / 12) * TAU - Math.PI / 2
      const big = k % 3 === 0
      for (let d = big ? -1.5 : -0.5; d <= 0.5; d += 1) paint(out, cx + Math.cos(ang) * (r + d), cy + Math.sin(ang) * (r + d) * 0.8, big ? hi : lit)
    }
    oval(out, cx, cy, r + 1.5, (r + 1.5) * 0.8, deep, { paint, skip: 3 })
    if (f >= 1) line(out, cx, cy, cx + Math.cos(hand) * (r - 2), cy + Math.sin(hand) * (r - 2) * 0.8, steel, paint)
  }
  if (t >= 1 && t < TIME_ROAR + 4) {
    const r = Math.max(width(g), height(g)) / 2 + 2
    clock(g.cx + out.dx, g.cy, r, -Math.PI / 2 + t * 0.4, phase(t, 1, TIME_ROAR - 3), back)
  }
  // The roar: wide waves and streaks of blue power pound the target
  if (t >= TIME_ROAR && t < TIME_STOP) {
    const head = mx + g.side * 4
    const dist = Math.abs(tx - head)
    emit(t, { count: 8, gap: 2.5, start: TIME_ROAR, life: 8 }, (i, age, f) => {
      const x = head + g.side * f * dist
      const r = 3 + f * 7
      const y = lerp(my, ty, f)
      const arc = { angle: g.side > 0 ? 0 : Math.PI, spread: 1.1 }
      oval(out, x - g.side, y, r * 0.6, r, deep, arc)
      oval(out, x, y, r * 0.6, r, f < 0.4 ? WHITE : f < 0.7 ? hi : c, arc)
    })
    for (let k = 0; k < 5; k++) {
      const y = lerp(my, ty, 0.5) + (k - 2) * 2.5 + Math.sin(t + k) * 0.5
      const off = ((t * 3 + k * 5) % 10) / 10
      const x0 = head + g.side * off * dist
      for (let d = 0; d < 5; d++) dot(out, x0 + g.side * d, y + (ty - my) * (off * 0.5), d === 4 ? WHITE : k % 2 ? c : lit)
    }
    // Over the target a clock spins its hand backward ever faster
    const spin = phase(t, TIME_ROAR, TIME_STOP)
    clock(tx, ty, 5, -Math.PI / 2 - spin * spin * 18, 1, dot)
    if (t % 3 === 0) shock(out, tx, ty, 4 + (t % 9), 0.8, cool(c), (t % 9) / 9, back)
  }
  // Time stops: frozen rings hang still around the target, then shatter
  if (t >= TIME_STOP && t < TIME_RESUME + 8) {
    const age = t - TIME_STOP
    if (t < TIME_RESUME) {
      for (const r of [4, 7, 10]) {
        oval(out, tx, ty, r + 1, (r + 1) * 0.8, deep, { skip: 4 })
        oval(out, tx, ty, r, r * 0.8, age < 2 ? WHITE : steel, { skip: 4 })
      }
      disc(out, tx, ty, 2.5, deep)
      disc(out, tx, ty, 1.5, WHITE)
    } else {
      emit(t, { count: 18, start: TIME_RESUME, life: 8 }, (i, life, f) => {
        const ang = (i / 18) * TAU
        const r = [4, 7, 10][i % 3] + life * 1.2
        dot(out, tx + Math.cos(ang) * r, ty + Math.sin(ang) * r * 0.8 + life * life * 0.05, f < 0.5 ? steel : deep)
      })
    }
  }
  if (t === TIME_RESUME) out.shake = [g.side * 2, 1]
  if (t === TIME_RESUME + 1) out.shake = [-g.side * 2, -1]
}

const REND_SLASH = 10
const REND_OPEN = 14
const REND_SNAP = 32

// Rise up shimmering pink, slash the air, and tear a jagged rift in space over the
// target. The void inside glitters with stars and drinks in specks around it, then
// the rift snaps shut and bursts into shards.
function spacialrend(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const pearl = mix(c, WHITE, 0.6)
  if (t < REND_SLASH) {
    const f = easeOut(phase(t, 0, REND_SLASH))
    out.sy = 1 + 0.08 * f
    out.dy = t >= 4 ? -1 : 0
    out.skew = tilt(g, out.dy, -2 * f)
    out.shade = (x, y, col) => ((x + y + t) % 5 === 0 ? mix(col, pearl, 0.6) : mix(col, c, 0.12 * f))
  } else if (t < REND_SLASH + 3) {
    out.dx = g.side * 2
    out.skew = tilt(g, 0, 3)
  } else if (t < REND_SLASH + 6) out.dx = g.side

  // The slash through the air in front
  const sx = g.ahead(3)
  if (t >= REND_SLASH && t < REND_SLASH + 4) {
    const age = t - REND_SLASH
    for (let u = 0; u <= 1; u += 0.05) {
      if (u > (age + 1) / 2) break
      const ang = -1.1 + u * 2.2
      const x = sx + g.side * Math.cos(ang) * 5
      const y = g.mouth.y + Math.sin(ang) * 6
      dot(out, x, y, age > 2 ? deep : u > (age + 1) / 2 - 0.2 ? WHITE : lit)
      dot(out, x - g.side, y, c)
    }
  }
  // The rift: a tall jagged lens, open by `gap` columns at its middle
  const tall = clamp(Math.round(g.ground * 0.4), 6, 10)
  const open = easeOut(phase(t, REND_OPEN, REND_OPEN + 6)) * (1 - easeIn(phase(t, REND_SNAP - 3, REND_SNAP)))
  const jag = (k) => Math.round((rnd(a.seed, k + 20, 3) - 0.5) * 2)
  if (t >= REND_OPEN - 2 && t < REND_SNAP) {
    for (let k = -tall; k <= tall; k++) {
      const y = ty + k
      if (y < 0 || y > g.ground) continue
      const lens = Math.sqrt(1 - (k / (tall + 1)) ** 2)
      const half = (t < REND_OPEN ? 0 : open * 4 * lens)
      const mid = tx + jag(k)
      for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) {
        const twinkle = rnd(a.seed, x * 37 + y, t >> 1) < 0.08
        dot(out, x, y, twinkle ? WHITE : VOID)
      }
      const rim = t < REND_OPEN ? (t % 2 ? WHITE : hi) : (k + t) % 4 === 0 ? WHITE : hi
      dot(out, mid - half - 1, y, rim)
      dot(out, mid + half + 1, y, rim)
      if (half > 1) {
        dot(out, mid - half - 2, y, deep)
        dot(out, mid + half + 2, y, deep)
      }
    }
  }
  // Specks around the rift are drawn into it
  emit(t, { count: 18, gap: 0.8, start: REND_OPEN + 2, life: 7 }, (i, age, f) => {
    if (t >= REND_SNAP) return
    const ang = rnd(a.seed, i, 6) * TAU
    const d = lerp(12, 1, easeIn(f))
    dot(out, tx + Math.cos(ang) * d, ty + Math.sin(ang) * d * 0.8, f < 0.5 ? lit : pearl)
  })
  if (t >= REND_OPEN + 4 && t < REND_SNAP && t % 4 === 0) out.shake = [1, 0]
  // Snap shut: a bright seam, then pink shards burst outward
  const age = t - REND_SNAP
  if (age >= 0 && age < 3) {
    line(out, tx, ty - tall, tx, ty + tall, WHITE)
    line(out, tx - 1, ty - tall + 2, tx - 1, ty + tall - 2, hi)
    line(out, tx + 1, ty - tall + 2, tx + 1, ty + tall - 2, hi)
    out.shake = [[2, 1], [-2, -1], [1, 0]][age]
  }
  if (age >= 1 && age < 5) star(out, tx, ty, [7, 9, 7, 4][age - 1], c, { flat: 1.3, points: 6, inner: 0.35 })
  if (age >= 2 && age < 9) shock(out, tx, ty, 4 + age * 1.1, 1, c, age / 9, back)
  emit(t, { count: 14, start: REND_SNAP + 1, life: 10 }, (i, life, f) => {
    const ang = rnd(a.seed, i, 8) * TAU
    const v = 1 + rnd(a.seed, i, 9)
    const x = tx + Math.cos(ang) * life * v
    const y = ty + Math.sin(ang) * life * v * 0.8
    const ex = Math.cos(ang) * 1.5
    const ey = Math.sin(ang) * 1.5
    line(out, x, y, x + ex, y + ey, f < 0.4 ? WHITE : f < 0.7 ? pearl : c)
  })
}

export const DRAGON = {
  dragonbreath: { ticks: 40, color: 0x48d8a0, draw: dragonbreath },
  dragonclaw: { ticks: 32, color: 0x7a6aff, draw: dragonclaw },
  dragonpulse: { ticks: 38, color: 0x6a5aff, draw: dragonpulse },
  dragondance: { ticks: 48, color: 0x9a6aff, pose: { view: 'front' }, draw: dragondance },
  dragonrush: { ticks: 40, color: 0x6a4aff, draw: dragonrush },
  dualchop: { ticks: 38, color: 0x8a9aff, draw: dualchop },
  twister: { ticks: 46, color: 0x9a8aff, draw: twister },
  dragontail: { ticks: 38, color: 0x6a5aff, draw: dragontail },
  roaroftime: { ticks: 64, color: 0x3a9aff, draw: roaroftime },
  spacialrend: { ticks: 46, color: 0xe070ff, draw: spacialrend },
}
