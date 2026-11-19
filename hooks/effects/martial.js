// Fighting punches, palms, and kicks

import {
  WHITE, back, ball, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, keys, lerp, light, line, linear,
  mix, phase, plus, puff, ring, rnd, spark, sparkles, stamp, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const DUST = 0xd6c4a0
const ROCK = 0x9a8a74
const BRICK = 0xb85a3a
const MORTAR = 0xe8d8c0
const SLOW = 0x5aa0ff
const ZAP = 0xffe040

// Pixel art drawn facing right: k outline, d shadow, o base, l light, h white, w cuff
const FIST = ['.kkkkk.', 'khhllok', 'klllllk', 'kkkklok', 'kdddddk', '.kkkkk.']
const FIST_UP = ['.kkkkk.', 'khlhlok', 'khlhlok', 'kllllok', 'kddddok', '.kwwwk.', '.kwwwk.']
const PALM = ['.k.k.', 'khkhk', 'klklk', 'kllok', 'kllok', 'kdook', '.kkk.']
const BOOT = ['kkk....', 'klk....', 'klkkkk.', 'kllllok', '.kkkkkk']
const BANG = ['.kk.', 'khhk', 'khhk', 'khhk', '.kk.', '....', '.kk.', 'khhk', '.kk.']
const SNORE = ['zzzz', '..z.', '.z..', 'zzzz']

const tones = (c) => ({ k: dark(c, 0.7), d: dark(c, 0.3), o: c, l: light(c, 0.5), h: WHITE, w: dark(c, 0.15) })
const flat = (c) => ({ k: c, d: c, o: c, l: c, h: c, w: c })

// The sprite's leading column on row y at its base spot
const frontOf = (g, y) => g.frontAt(clamp(Math.round(y), g.top, g.bottom)) - g.side

// An angle with 0 toward the target and pi / 2 straight down, on screen
const toward = (g, angle) => (g.side > 0 ? angle : Math.PI - angle)

// Lean the top of the body px pixels toward the target with the feet planted
function tilt(g, dy, px) {
  if (Math.abs(px) < 0.25) return null
  const feet = g.bottom + dy
  const height = Math.max(1, g.bottom - g.top)
  return (y) => (g.side * px * (feet - y)) / height
}

// Pixel art facing the target, its front edge at column fx and its middle on row y
function art(out, rows, pal, fx, y, side, paint = dot) {
  const w = rows[0].length
  stamp(out, side > 0 ? fx - w + 1 : fx, Math.round(y - (rows.length - 1) / 2), rows, pal, side < 0, paint)
}

// Pixel art centered on x, y
const centered = (out, rows, pal, x, y, paint = dot) =>
  stamp(out, Math.round(x - (rows[0].length - 1) / 2), Math.round(y - (rows.length - 1) / 2), rows, pal, false, paint)

// A spiky impact star: white heart, spikes in c, a dark rim. flat squashes it.
function bang(out, x, y, r, c, { spikes = 8, flat: fy = 1, turn = 0, paint = dot } = {}) {
  const rim = dark(c, 0.5)
  const lit = light(c, 0.55)
  for (let py = Math.floor(y - (r + 1) * fy); py <= Math.ceil(y + (r + 1) * fy); py++) {
    for (let px = Math.floor(x - r - 1); px <= Math.ceil(x + r + 1); px++) {
      const ux = px - x
      const uy = (py - y) / fy
      const s = ((Math.atan2(uy, ux) / TAU) * spikes + turn + 10) % 1
      const edge = r * (0.42 + 0.58 * Math.abs(s - 0.5) * 2)
      const d = Math.hypot(ux, uy)
      if (d > edge + 0.7) continue
      paint(out, px, py, d > edge ? rim : d < edge * 0.4 ? WHITE : d < edge * 0.7 ? lit : c)
    }
  }
}

// A thick straight streak, white along its core and darker at its rim
function shoot(out, x0, y0, x1, y1, thick, c, paint = dot) {
  const n = Math.hypot(x1 - x0, y1 - y0) || 1
  const nx = -(y1 - y0) / n
  const ny = (x1 - x0) / n
  const half = thick / 2
  for (let s = half; s >= 0; s -= 0.5) {
    const col = s > half * 0.7 ? dark(c, 0.3) : s > half * 0.35 ? c : WHITE
    for (const o of s > 0 ? [s, -s] : [0]) line(out, x0 + nx * o, y0 + ny * o, x1 + nx * o, y1 + ny * o, col, paint)
  }
}

// A crescent swept around x, y from angle `from` to `to`, thick and bright at its head
function sweep(out, x, y, rx, ry, from, to, thick, c, paint = dot) {
  const span = to - from
  const half = thick / 2
  const steps = Math.ceil(Math.abs(span) * (Math.max(rx, ry) + half) * 1.6) + 2
  const lit = light(c, 0.55)
  const rim = dark(c, 0.35)
  for (let s = half; s >= 0; s -= 0.5) {
    for (const o of s > 0 ? [s, -s] : [0]) {
      for (let k = 0; k <= steps; k++) {
        const u = k / steps
        if (s > half * (0.15 + 0.85 * u)) continue
        const f = s / half
        const ang = from + span * u
        paint(out, x + (rx + o) * Math.cos(ang), y + (ry + o) * Math.sin(ang), f > 0.75 ? rim : f > 0.4 ? c : u > 0.6 ? WHITE : lit)
      }
    }
  }
}

// Bits knocked loose at t0 fly out, fall, and come to rest on the ground
function rubble(out, t, a, g, t0, x, y, count, c, { power = 1, life = 14, salt = 0, up = 0 } = {}) {
  const fall = 0.17
  emit(t, { count, start: t0, gap: 0, life }, (i, age, f) => {
    const vx = ((rnd(a.seed, i, salt) - 0.5) * 2.2 + g.side * 0.4) * power
    const vy = -(0.5 + up + rnd(a.seed, i, salt + 1) * 1.2) * power
    const land = (-vy + Math.sqrt(vy * vy + 4 * fall * Math.max(0, g.ground - y))) / (2 * fall)
    const k = Math.min(age, land)
    const px = x + vx * k
    const py = Math.min(g.ground, y + vy * k + fall * k * k)
    const col = f > 0.7 ? dark(c, 0.45) : i % 3 ? c : light(c, 0.4)
    dot(out, px, py, col)
    if (i % 2 === 0) dot(out, px + 1, py, dark(col, 0.25))
  })
}

// Dust puffs rolling out from x, y to one side, or both when dir is 0
function dust(out, t, a, t0, x, y, count, dir, { life = 10, size = 1.6, salt = 0 } = {}) {
  emit(t, { count, start: t0, gap: 0.6, life }, (i, age, f) => {
    const s = dir || (i % 2 ? 1 : -1)
    const px = x + s * (1 + age * (0.35 + rnd(a.seed, i, salt) * 0.45))
    const py = y - age * 0.12 - rnd(a.seed, i, salt + 1) * 1.5
    puff(out, px, py, 0.6 + size * Math.sin(Math.PI * f), mix(DUST, 0x8a7c66, f), a.seed + i + salt)
  })
}

const JK_CROUCH = 6
const JK_HIT = 15
const JK_LAND = 25

// Crouch and spring forward in a long low arc, the foot leading, crack the target
// with a flying side kick, rebound in a backflip, land, and walk home
function jumpkick(out, t, a, g, c) {
  const H = JK_HIT
  const pal = tones(c)
  const hipY = Math.round(lerp(g.cy, g.bottom, 0.3))
  const edge = frontOf(g, hipY)
  const far = clamp(Math.abs(g.target.x - edge) - 9, 0, 12)
  const lift = clamp(hipY - g.target.y, 0, 6)
  const peak = Math.min(Math.max(clamp(Math.round((g.bottom - g.top) * 0.3), 2, 5), lift + 2), g.top + 2)
  const front = g.side > 0 ? g.right : g.left
  const back = Math.round(far * 0.4)
  const dxAt = (k) => Math.round(keys(k, [[0, 0], [JK_CROUCH, -1, easeOut], [H, far, linear], [H + 2, far], [H + 7, back, easeOut], [JK_LAND, back], [JK_LAND + 10, 0, linear]]))
  const dyAt = (k) => Math.round(keys(k, [[JK_CROUCH, 0], [JK_CROUCH + 4, -peak, easeOut], [H, -lift, easeIn], [H + 2, -lift], [H + 5, -lift - 4, easeOut], [JK_LAND, 0, easeIn]]))
  out.dx = g.side * dxAt(t)
  out.dy = dyAt(t)
  if (t < JK_CROUCH) {
    const f = easeOut(phase(t, 0, JK_CROUCH - 1))
    out.sy = 1 - 0.16 * f
    out.sx = 1 + 0.08 * f
  } else if (t < H) {
    out.sx = 1.06
  } else if (t >= H + 3 && t < H + 6) {
    out.flipX = true
    out.flipY = t < H + 5
  } else if (t >= JK_LAND && t < JK_LAND + 2) {
    out.sy = 0.86
    out.sx = 1.07
  }
  if (t === H) out.shade = tint(WHITE, 0.5)
  if (t >= H && t < H + 3) out.shake = [[2 * g.side, 0], [-g.side, 1], [g.side, 0]][t - H]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [JK_CROUCH, -1], [JK_CROUCH + 3, 2], [H, 2], [H + 2, 0]]))

  // The foot leads the leap, with a dotted trail of where it has been
  const footAt = (k) => ({ x: front + g.side * (dxAt(k) + 6), y: hipY + dyAt(k) })
  if (t >= JK_CROUCH + 2 && t <= H + 1) {
    for (let k = 1; k <= 6; k++) {
      if (t - k < JK_CROUCH + 1) break
      const p = footAt(t - k)
      if ((k + t) % 2 || k < 3) dot(out, p.x - g.side * 3, p.y + 1, k < 3 ? light(c, 0.5) : c)
    }
    const p = footAt(Math.min(t, H))
    for (const oy of [-1, 1]) line(out, p.x - g.side * 9, p.y + oy, p.x - g.side * 13, p.y + oy, light(c, 0.4))
    art(out, BOOT, t === H ? flat(WHITE) : pal, p.x, p.y, g.side)
  }
  dust(out, t, a, JK_CROUCH, edge + g.side * 2, g.ground - 1, 4, -g.side, { size: 1.3 })
  dust(out, t, a, JK_LAND, g.cx + g.side * (back - 2), g.ground - 1, 4, 0, { size: 1.2, salt: 5 })

  // A flat crack splits sideways off the kick
  const hit = footAt(H)
  const age = t - H
  if (age >= 0 && age < 5) {
    bang(out, hit.x, hit.y, [4, 6, 5, 4, 2][age], age === 0 ? WHITE : c, { flat: 0.6, turn: age * 0.25 })
    const len = [4, 8, 10, 9, 6][age]
    for (const oy of [-2, 0, 2]) line(out, hit.x + g.side * 3, hit.y + oy, hit.x + g.side * (3 + len - Math.abs(oy)), hit.y + oy * 1.5, age < 2 ? WHITE : light(c, 0.4))
  }
  rubble(out, t, a, g, H, hit.x, hit.y, 6, c, { power: 0.8 })
}

const SLAP_RAISE = 6
const SLAP_HIT = 13

// Tiptoe up to the dozing target, raise an open hand high, and swing one big slap
// that leaves a red handprint, scatters its Zs, and pops an alarmed mark over it
function wakeupslap(out, t, a, g, c) {
  const H = SLAP_HIT
  const pal = tones(c)
  const tx = g.target.x
  const ty = g.target.y
  const edge = frontOf(g, g.mouth.y)
  const far = clamp(Math.abs(tx - edge) - 9, 0, 10)
  out.dx = g.side * Math.round(keys(t, [[0, 0], [SLAP_RAISE, far, easeInOut], [H + 6, far], [H + 16, 0, easeInOut]]))
  if (t >= SLAP_RAISE && t < H - 1) {
    out.sy = 1 + 0.06 * easeOut(phase(t, SLAP_RAISE, H - 2))
    out.dy = -1
  } else if (t >= H - 1 && t < H + 3) {
    out.sx = [1.08, 1.1, 0.94, 0.97][t - H + 1]
  }
  out.skew = tilt(g, out.dy, keys(t, [[SLAP_RAISE, 0], [H - 2, -2, easeOut], [H, 3, easeIn], [H + 3, 1], [H + 8, 0]]))
  if (t === H) out.shake = [g.side * 2, 0]
  if (t === H + 1) out.shake = [-g.side, 0]

  // Zs drift off the sleeping target until the slap scatters them
  emit(t, { count: 4, gap: 3, start: 0, life: H + 1 }, (i, age) => {
    const x = tx + g.side * (i % 2 ? 2 : -1) + Math.sin(age * 0.5 + i) * 1.2
    const y = ty - 5 - age * 0.35 - i
    if (t < H && y > 0) stamp(out, x - 2, y - 2, SNORE, { z: i % 2 ? light(c, 0.6) : WHITE })
  })
  emit(t, { count: 4, gap: 0, start: H, life: 8 }, (i, age, f) => {
    const ang = -Math.PI / 2 + (i - 1.5) * 0.7
    const x = tx + Math.cos(ang) * age * 1.5
    const y = ty - 6 + Math.sin(ang) * age * 1.2 + 0.1 * age * age
    if (f < 0.7 || t % 2) dot(out, x, y, f < 0.4 ? WHITE : light(c, 0.5))
  })

  // The hand climbs high behind the head, then swings over in one wide arc
  const hx = tx - g.side
  const pivotX = hx - g.side * 2
  const pivotY = ty - 5
  const r = 6
  const from = toward(g, -Math.PI / 2 - 0.4)
  const to = toward(g, 0.9)
  const raisedX = edge + g.side * (far - 2)
  if (t >= SLAP_RAISE - 2 && t < H - 2) {
    const y = Math.max(4, g.top + 1) + Math.round(3 * (1 - easeOut(phase(t, SLAP_RAISE - 2, SLAP_RAISE + 2))))
    art(out, PALM, pal, raisedX, y, -g.side)
    if (t >= SLAP_RAISE + 1) spark(out, raisedX - g.side * 2, Math.max(1, y - 5), t % 2 ? 2 : 1, c)
  }
  if (t >= H - 2 && t < H + 4) {
    const u = t < H ? (t - H + 3) / 3 : 1
    const tail = t <= H ? from : lerp(from, to, phase(t, H, H + 4))
    const head = lerp(from, to, u)
    sweep(out, pivotX, pivotY, r, r, tail, head, 4, c)
    if (t <= H) art(out, PALM, t === H ? flat(WHITE) : pal, Math.round(pivotX + r * Math.cos(head)) + g.side * 2, pivotY + r * Math.sin(head), g.side)
  }

  // A red handprint on the target, an alarmed mark, and startled lines
  const age = t - H
  if (age >= 0 && age < 4) bang(out, hx, ty, [5, 7, 6, 4][age], age === 0 ? WHITE : c, { flat: 0.7, spikes: 10 })
  if (age >= 2 && age < 16 && !(age > 12 && t % 2)) {
    const red = 0xff4a4a
    stamp(out, hx - 2, ty - 3, PALM, { k: dark(red, 0.5), h: red, l: red, o: red, d: dark(red, 0.2) }, g.side < 0)
  }
  if (age >= 1 && age < 18) {
    const hop = age < 4 ? [3, 1, 0][age - 1] ?? 0 : 0
    stamp(out, tx - 1 + g.side * 3, Math.max(0, ty - 14 + hop), BANG, { k: dark(0xff3a2e, 0.5), h: age % 4 < 2 ? 0xff3a2e : 0xff8a6a })
  }
  if (age >= 1 && age < 12 && age % 3 !== 2) {
    for (const s of [-1, 1]) {
      for (const oy of [-3, 0, 3]) {
        const x0 = tx + s * (6 + (age % 2))
        line(out, x0, ty + oy - 4, x0 + s * 2, ty + oy - 4 - Math.abs(oy) * 0.3, WHITE)
      }
    }
  }
}

const DYN_SPIN = 14
const DYN_HIT = 18

// Windmill the fist around the shoulder, rocket it in, and detonate on the target in
// a big fireball, then leave dizzy spirals reeling over it
function dynamicpunch(out, t, a, g, c) {
  const H = DYN_HIT
  const pal = tones(c)
  const fy = Math.round(lerp(g.cy, g.target.y, 0.5))
  const edge = frontOf(g, fy)
  const tx = g.target.x
  const lean = Math.round(keys(t, [[0, 0], [4, -2, easeOut], [DYN_SPIN, -2], [H, 2, easeIn], [H + 6, 2], [H + 16, 0]]))
  out.dx = g.side * lean + (t >= 8 && t < DYN_SPIN ? tremble(t) : 0)
  if (t < DYN_SPIN) {
    out.sy = 1 - 0.06 * easeOut(phase(t, 0, 4))
    if (t >= 6) out.shade = tint(c, t % 2 ? 0.3 : 0.12)
  }
  if (t === H) out.shade = tint(WHITE, 0.5)
  if (t >= H && t < H + 6) out.shake = [[3, 1], [-3, -1], [2, 1], [-2, 0], [1, -1], [-1, 0]][t - H].map((v, k) => (k ? v : v * g.side))
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [4, -2, easeOut], [DYN_SPIN, -2], [H, 3, easeIn], [H + 6, 2], [H + 14, 0]]))

  // Two whole turns around the shoulder, speeding up, with a trailing arc
  const sx = edge + g.side * (lean - 2)
  const sy = Math.round(lerp(g.top, g.cy, 0.5))
  const rr = clamp((g.bottom - g.top) * 0.35, 4, 7)
  const spin = (k) => -Math.PI / 2 + TAU * 2 * easeIn(phase(k, 2, DYN_SPIN))
  if (t >= 2 && t < DYN_SPIN) {
    const ang = spin(t)
    sweep(out, sx, sy, rr, rr, toward(g, ang - 1.8), toward(g, ang), 3, c)
    art(out, FIST, pal, Math.round(sx + rr * Math.cos(toward(g, ang))) + g.side * 3, sy + rr * Math.sin(toward(g, ang)), g.side)
  }
  // Then it rockets out along a blazing streak
  const launch = sx + g.side * 6
  if (t >= DYN_SPIN && t <= H + 1) {
    const fx = Math.round(lerp(launch, tx, easeIn(phase(t, DYN_SPIN, H))))
    shoot(out, launch - g.side * 2, lerp(sy, fy, 0.5), fx - g.side * 5, fy, 3, c)
    if (t < H + 1) art(out, FIST, t === H ? flat(WHITE) : pal, fx, fy, g.side)
  }

  // The fireball blooms, rings out, and rolls up into smoke
  const age = t - H
  const fire = mix(c, 0xffe060, 0.5)
  // The blast stays clear of the body when the target stands close
  const big = clamp(Math.abs(tx - edge) - 1, 4, 9) / 9
  if (age === 0) disc(out, tx, fy, 6 * big, WHITE)
  if (age >= 1 && age < 9) {
    const r = [6, 8, 9, 9, 8, 7, 5, 3][age - 1] * big
    ball(out, tx, fy, r, age < 3 ? fire : age < 6 ? c : dark(c, 0.3))
    if (age < 5) disc(out, tx - 1, fy - 1, r * 0.4, age < 3 ? WHITE : light(fire, 0.5))
  }
  if (age >= 2 && age < 10) ring(out, tx, fy, (9 + (age - 2) * 1.5) * big, age < 6 ? light(c, 0.4) : dark(c, 0.3), 0, Math.PI, back)
  emit(t, { count: 6, start: H + 7, gap: 1.2, life: 10 }, (i, k, f) => {
    const px = tx + (rnd(a.seed, i, 3) - 0.5) * 10 + Math.sin(k * 0.4 + i) * 1.2
    const py = fy - 3 - k * 0.8 - rnd(a.seed, i, 4) * 3
    if (py > 0) puff(out, px, py, 0.8 + 1.2 * Math.sin(Math.PI * f), mix(0xb0a8a4, 0x5a5256, f), a.seed + i)
  })
  rubble(out, t, a, g, H, tx, fy, 12, c, { power: 1.4 })

  // Dizzy spirals reel around over the target
  if (age >= 8 && age < 26) {
    for (let k = 0; k < 3; k++) {
      const ang = age * 0.45 + (k * TAU) / 3
      const px = tx + Math.cos(ang) * 6
      const py = Math.max(2, g.target.y - 8) + Math.sin(ang) * 1.6
      if (age > 22 && (t + k) % 2) continue
      if (Math.sin(ang) < 0) dot(out, px, py, 0xc8a83a)
      else spark(out, px, py, 1, 0xffe040)
    }
  }
}

const THRUSTS = [7, 11, 15, 19, 23]
const LAST_THRUST = THRUSTS[THRUSTS.length - 1]

// Plant a wide stance and piston open palms into the target, high, low, high, each
// shove inching the body forward and pushing a pressure wave, the last one hardest
function armthrust(out, t, a, g, c) {
  const pal = tones(c)
  const tx = g.target.x
  const edge = frontOf(g, g.cy)
  const far = clamp(Math.abs(tx - edge) - 10, 0, 8)
  let body = keys(t, [[0, 0], [5, far, easeOut], [LAST_THRUST + 3, far], [LAST_THRUST + 13, 0, easeInOut]])
  const stance = easeOut(phase(t, 2, 6)) * (1 - phase(t, LAST_THRUST + 4, LAST_THRUST + 10))
  out.sy = 1 - 0.08 * stance
  out.sx = 1 + 0.06 * stance
  let lean = 0
  THRUSTS.forEach((h, n) => {
    const last = n === THRUSTS.length - 1
    const y = Math.round(g.target.y + (n % 2 ? 2 : -2) + (last ? -1 : 0))
    const age = t - h
    if (t >= h - 2 && t < h + 2) {
      body += Math.min(n, 3) * 0.4
      lean = age < 0 ? -1 : 2
      // The arm drives out in two ticks and draws back in two
      const reach = [0.35, 0.75, 1, 0.6][age + 2]
      const root = frontOf(g, y) + g.side * Math.round(body)
      const px = Math.round(lerp(root, tx - g.side * 2, reach))
      for (const oy of [-1, 0, 1]) line(out, root, y + oy, px - g.side * 3, y + oy, oy ? dark(c, 0.35) : c)
      art(out, PALM, age === 0 ? flat(WHITE) : pal, px, y, g.side)
    }
    if (age >= 0 && age < 5) {
      const x = tx - g.side * 3 + g.side * age * 1.5
      const r = (last ? 5 : 4) + age * 0.5
      ring(out, x, y, r, age < 2 ? WHITE : light(c, 0.4), toward(g, 0), 0.75)
      if (age >= 1) ring(out, x - g.side * 2, y, r - 1, c, toward(g, 0), 0.7)
    }
    if (age === 0) out.shake = [g.side * (last ? 2 : 1), 0]
    if (age === 0 && last) disc(out, tx, y, 3, WHITE)
    if (last) rubble(out, t, a, g, h, tx, y, 7, c, { power: 1 })
  })
  out.dx = g.side * Math.round(body)
  out.skew = tilt(g, 0, lean * stance)
  dust(out, t, a, 5, g.cx + g.side * Math.round(body) - g.side * 4, g.ground - 1, 3, -g.side, { size: 1.1 })
}

const FORCE_DASH = 9
const FORCE_HIT = 12

// Draw back a palm that pulls in a glow, dash in and press it flat to the target,
// sending a shock through and out the far side that leaves it crackling
function forcepalm(out, t, a, g, c) {
  const H = FORCE_HIT
  const pal = tones(c)
  const tx = g.target.x
  const py = Math.round(lerp(g.cy, g.target.y, 0.5))
  const edge = frontOf(g, py)
  const far = clamp(Math.abs(tx - edge) - 6, 0, 12)
  const body = Math.round(keys(t, [[0, 0], [5, -1, easeOut], [FORCE_DASH, -1], [H, far, easeIn], [H + 6, far], [H + 16, 0, easeInOut]]))
  out.dx = g.side * body
  if (t < FORCE_DASH) {
    out.sy = 1 - 0.05 * easeOut(phase(t, 0, 5))
    if (t >= 4) out.shade = tint(light(c, 0.3), t % 2 ? 0.25 : 0.1)
  } else if (t < H) out.sx = 1.08
  if (t === H) out.shade = tint(WHITE, 0.5)
  if (t >= H && t < H + 3) out.shake = [[g.side * 2, 0], [0, 1], [g.side, 0]][t - H]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [5, -2, easeOut], [FORCE_DASH, -2], [H, 2, easeIn], [H + 4, 1], [H + 10, 0]]))

  // The palm held at the body draws in a swirl of light, then shoves out
  const hold = edge + g.side * (body + 3)
  const fx = t < FORCE_DASH ? hold : Math.round(keys(t, [[FORCE_DASH, hold], [H, tx - g.side * 2, easeIn], [H + 4, tx - g.side * 2], [H + 6, edge + g.side * (far + 3)]]))
  if (t >= 2 && t < FORCE_DASH) {
    const mx = hold - g.side * 2
    emit(t, { count: 10, gap: 0.6, start: 1, life: 4 }, (i, age, f) => {
      const ang = rnd(a.seed, i, 7) * TAU + f * 2
      const d = 7 * (1 - easeIn(f))
      dot(out, mx + Math.cos(ang) * d, py + Math.sin(ang) * d * 0.8, f < 0.5 ? light(c, 0.5) : WHITE)
    })
    disc(out, mx, py, 2 + (t % 2), light(c, 0.2), back)
  }
  if (t >= 2 && t < H + 6) art(out, PALM, t === H ? flat(WHITE) : pal, fx, py, g.side)

  // Upright rings pass through the target and out the far side
  emit(t, { count: 3, gap: 2, start: H, life: 9 }, (i, age, f) => {
    const x = tx + g.side * (age * 1.4 - 1)
    const ry = 3 + age * 0.9
    const rx = 1 + age * 0.25
    const col = f < 0.3 ? WHITE : f < 0.6 ? light(c, 0.4) : c
    const steps = Math.ceil(ry * 6)
    for (let k = 0; k < steps; k++) {
      const ang = (k / steps) * TAU
      const paint = Math.cos(ang) * g.side < 0 ? back : dot
      if (f < 0.75 || k % 2) paint(out, x + Math.cos(ang) * rx, py + Math.sin(ang) * ry, col)
    }
  })
  if (t === H) disc(out, tx - g.side, py, 3, WHITE)

  // Paralysis crackles on the target afterward
  if (t >= H + 4 && t < H + 20 && t % 3 !== 2) {
    for (let k = 0; k < 3; k++) {
      const x = tx + (rnd(a.seed, k, Math.floor(t / 3)) - 0.5) * 10
      const y = g.target.y + (rnd(a.seed, k, Math.floor(t / 3) + 40) - 0.5) * 8
      line(out, x, y, x + 1, y + 1, ZAP)
      line(out, x + 1, y + 1, x, y + 2, ZAP)
      dot(out, x + 1, y + 3, WHITE)
    }
  }
}

const SWORD_FORM = 10
const SWORD_SWING = 14
const SWORD_HIT = 17

// A shining blade at angle `ang` from its hilt at x, y, with a crossguard
function blade(out, x, y, ang, len, c, f = 1) {
  const ux = Math.cos(ang)
  const uy = Math.sin(ang)
  const edge = dark(c, 0.45)
  for (let d = 2; d <= len * f; d += 0.5) {
    const tip = d > len - 2
    dot(out, x + ux * d + uy, y + uy * d - ux, edge)
    dot(out, x + ux * d - uy, y + uy * d + ux, tip ? edge : light(c, 0.4))
    dot(out, x + ux * d, y + uy * d, WHITE)
  }
  for (const s of [-2, -1, 0, 1, 2]) dot(out, x + ux * 1.5 - uy * s, y + uy * 1.5 + ux * s, s ? 0xc89a3a : 0xffe08a)
  dot(out, x, y, 0x8a5a2a)
  dot(out, x - ux, y - uy, 0x6a4020)
}

// Summon a glowing sword that grows blade first out of the light, leap and sweep it
// across the target in a wide arc, and leave a gleaming cut that throws up pillars of light
function sacredsword(out, t, a, g, c) {
  const H = SWORD_HIT
  const tx = g.target.x
  const ty = g.target.y
  const edge = frontOf(g, g.cy)
  const far = clamp(Math.abs(tx - edge) - 10, 0, 10)
  const body = Math.round(keys(t, [[0, 0], [SWORD_FORM, -1, easeOut], [SWORD_SWING, -1], [H, far, easeIn], [H + 6, far], [H + 18, 0, easeInOut]]))
  out.dx = g.side * body
  if (t >= SWORD_SWING && t < H + 4) out.dy = -Math.round(Math.sin(Math.PI * phase(t, SWORD_SWING, H + 4)) * 2)
  if (t >= 4 && t < SWORD_SWING) out.shade = tint(light(c, 0.4), t % 4 < 2 ? 0.12 : 0.05)
  if (t === H) out.shake = [g.side * 2, 1]
  if (t === H + 1) out.shake = [-g.side, 0]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [SWORD_FORM, -2, easeOut], [SWORD_SWING, -2], [H, 3, easeIn], [H + 5, 1], [H + 12, 0]]))

  // The hilt rides at the front of the body. The blade stands up while it forms,
  // then sweeps from overhead through the target.
  const len = clamp(Math.abs(tx - (edge + g.side * (far + 1))) + 2, 9, 13)
  const hx = edge + g.side * (body + 2)
  const hy = Math.round(lerp(g.top, g.cy, 0.6)) + out.dy
  const up = toward(g, -Math.PI / 2 - 0.25)
  const down = toward(g, 0.75)
  const ang = t < SWORD_SWING ? up : lerp(up, down, easeIn(phase(t, SWORD_SWING, H)))
  if (t >= 2 && t < SWORD_FORM) sparkles(out, t, a.seed, hx, hy - 5, 8, 10, light(c, 0.3), 4)
  if (t >= SWORD_SWING && t < H + 4) {
    const tail = t <= H ? up : lerp(up, down, phase(t, H, H + 4))
    sweep(out, hx, hy, len, len, tail, ang, 4, c, back)
  }
  const shown = t >= 2 && t < H + 12 && !(t >= H + 8 && t % 2)
  if (shown) blade(out, hx, hy, ang, len, c, easeOut(phase(t, 2, SWORD_FORM)))
  if (t >= SWORD_FORM - 2 && t < SWORD_SWING) spark(out, hx + Math.cos(up) * len, hy + Math.sin(up) * len, t % 2 ? 2 : 3, c)

  // The cut gleams across the target, then splits with light
  const age = t - H
  if (age >= 0 && age < 16) {
    const ca = Math.atan2(Math.sin(down), Math.cos(down))
    const half = age < 2 ? 7 : 6
    const x0 = tx - Math.cos(ca) * half
    const y0 = ty - Math.sin(ca) * half
    const x1 = tx + Math.cos(ca) * half
    const y1 = ty + Math.sin(ca) * half
    const fade = phase(age, 8, 16)
    if (!(fade > 0.5 && t % 2)) {
      line(out, x0, y0 + 1, x1, y1 + 1, dark(c, 0.35))
      line(out, x0, y0, x1, y1, fade < 0.3 ? WHITE : light(c, 0.4))
    }
    if (age >= 2 && age < 12) {
      for (let k = -2; k <= 2; k++) {
        const px = lerp(x0, x1, (k + 2) / 4)
        const py = lerp(y0, y1, (k + 2) / 4)
        const h = Math.round((age - 1) * 1.8 * (1 - Math.abs(k) * 0.2))
        for (let d = 1; d <= h; d++) {
          if (py - d < 0 || (d > h - 2 && age > 8)) continue
          dot(out, px, py - d, d < 3 ? WHITE : (d + t) % 3 ? light(c, 0.5) : c)
        }
      }
    }
  }
  if (age >= 4 && age < 18) sparkles(out, t, a.seed, tx, ty - 4, 12, 10, c, 5)
}

const BRICK_RISE = 6
const BRICK_HIT = 13

// Raise a brick wall before the target, lift a hand like a blade, and chop straight
// down through it so the halves fall apart and bricks tumble
function brickbreak(out, t, a, g, c) {
  const H = BRICK_HIT
  const tx = g.target.x
  const top = clamp(g.target.y - 7, 1, g.ground - 6)
  const wx = tx - g.side * 2
  const edge = frontOf(g, g.mouth.y)
  const far = clamp(Math.abs(wx - edge) - 9, 0, 10)
  out.dx = g.side * Math.round(keys(t, [[0, 0], [BRICK_RISE + 2, far, easeInOut], [H + 6, far], [H + 16, 0, easeInOut]]))
  if (t >= BRICK_RISE + 2 && t < H - 1) {
    out.sy = 1.07
    out.dy = -1
  } else if (t >= H - 1 && t < H + 3) {
    out.sy = [0.94, 0.86, 0.9, 0.96][t - H + 1]
    out.sx = [1.04, 1.08, 1.05, 1.02][t - H + 1]
  }
  if (t === H) out.shake = [0, 2]
  if (t === H + 1) out.shake = [g.side, -1]
  out.skew = tilt(g, out.dy, keys(t, [[BRICK_RISE, 0], [H - 2, -1], [H, 3, easeIn], [H + 4, 1], [H + 10, 0]]))

  // The wall rises out of the ground, row by row
  const rows = g.ground - top + 1
  const shown = Math.round(rows * easeOut(phase(t, 0, BRICK_RISE)))
  const f = t < H ? 0 : phase(t, H + 1, H + 9)
  for (const s of [-1, 1]) {
    if (f >= 1) continue
    for (let r = 0; r < shown; r++) {
      const y = g.ground - r
      const h = g.ground - y
      for (let k = 0; k < 3; k++) {
        const bx = s < 0 ? -3 + k : 1 + k
        // The halves tip outward from their feet as they fall
        const x = wx + bx + s * Math.round(h * easeIn(f) * 0.8)
        const yy = y + Math.round(easeIn(f) * h * 0.4)
        const joint = r % 3 === 0 || (bx + (Math.floor(r / 3) % 2 ? 1 : 0) + 10) % 3 === 0
        dot(out, x, yy, joint ? MORTAR : (r + k) % 4 ? BRICK : dark(BRICK, 0.25))
      }
    }
  }
  if (t >= H && t < H + 3) line(out, wx, top - 1, wx, g.ground, WHITE)

  // The hand rises as a blade and chops straight down the middle of the wall
  const handY = clamp(top - 4, 2, g.ground)
  if (t >= BRICK_RISE && t < H - 1) {
    const pal = { k: dark(c, 0.6), h: WHITE, l: light(c, 0.5), o: c, d: dark(c, 0.2) }
    centered(out, PALM, pal, wx - g.side * 4, handY)
    if (t >= BRICK_RISE + 3) spark(out, wx - g.side * 4, handY - 5, t % 2 ? 1 : 2, c)
  }
  if (t >= H - 2 && t < H + 3) {
    const y1 = t < H ? lerp(top, g.ground, (t - H + 3) / 3) : g.ground
    shoot(out, wx, Math.max(0, top - 6), wx, y1, 3, c)
  }
  const age = t - H
  if (age >= 0 && age < 4) bang(out, wx, top + 2, [4, 6, 5, 3][age], age === 0 ? WHITE : c, { spikes: 6 })
  rubble(out, t, a, g, H + 1, wx, top + 3, 10, BRICK, { power: 1, life: 16 })
  dust(out, t, a, H + 6, wx, g.ground - 1, 6, 0, { size: 1.8 })
}

const DRAIN_PUNCH = 10
const DRAIN_ORBS = 7

// Punch in with a fist glowing green, then draw bright orbs of life out of the target
// along a looping path back into the body, which glows as it heals
function drainpunch(out, t, a, g, c) {
  const H = DRAIN_PUNCH
  const pal = tones(c)
  const tx = g.target.x
  const fy = Math.round(lerp(g.cy, g.target.y, 0.5))
  const edge = frontOf(g, fy)
  const far = clamp(Math.abs(tx - edge) - 8, 0, 10)
  const body = Math.round(keys(t, [[0, 0], [5, -2, easeOut], [7, -2], [H, far, easeIn], [H + 3, far], [H + 11, 0, easeInOut]]))
  out.dx = g.side * body
  if (t < 7) out.sy = 1 - 0.06 * easeOut(phase(t, 0, 5))
  if (t === H) out.shake = [g.side * 2, 0]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [5, -2, easeOut], [7, -2], [H, 3, easeIn], [H + 3, 2], [H + 9, 0]]))
  const fx = Math.round(keys(t, [[3, edge + g.side * 3], [7, edge + g.side], [H, tx - g.side, easeIn], [H + 3, tx - g.side], [H + 7, edge + g.side * 3]]))
  if (t >= 3 && t < H + 7) {
    art(out, FIST, t === H ? flat(WHITE) : pal, fx, fy, g.side)
    if (t < H) ring(out, fx - g.side * 3, fy, 4 + (t % 2), light(c, 0.3), 0, Math.PI, back)
  }
  const age = t - H
  if (age >= 0 && age < 4) bang(out, tx, fy, [4, 6, 5, 3][age], age === 0 ? WHITE : c, { turn: 0.25 })

  // Orbs leave the target one by one and arc back into the body
  const home = { x: g.cx, y: g.cy }
  const orbAt = (i, f) => {
    const lift = 6 + (i % 3) * 2
    const x = lerp(tx, home.x, easeInOut(f))
    const y = lerp(fy, home.y, f) - Math.sin(Math.PI * f) * lift
    return { x, y }
  }
  let fed = 0
  emit(t, { count: DRAIN_ORBS, gap: 2, start: H + 2, life: 10 }, (i, k, f) => {
    for (let lag = 3; lag >= 1; lag--) {
      const p = orbAt(i, Math.max(0, f - lag * 0.06))
      dot(out, p.x, p.y, lag === 1 ? light(c, 0.3) : dark(c, 0.15))
    }
    const p = orbAt(i, f)
    ball(out, p.x, p.y, 1.4, c)
    dot(out, p.x, p.y, WHITE)
    if (f > 0.85) fed += 1
  })
  const glow = phase(t, H + 6, H + 12) * (1 - phase(t, 34, 39))
  if (glow > 0) out.shade = tint(light(c, 0.4), (fed ? 0.28 : 0.12) * glow)
  if (t >= H + 12 && t < 38) {
    emit(t, { count: 9, gap: 2, start: H + 12, life: 8 }, (i, k, f) => {
      const x = g.left + 1 + rnd(a.seed, i, 9) * (g.right - g.left - 2)
      const y = g.bottom - 2 - rnd(a.seed, i, 10) * (g.bottom - g.top) * 0.6 - k * 0.8
      if (f < 0.6) plus(out, x, y, c, WHITE)
      else dot(out, x, y, light(c, 0.4))
    })
  }
}

const MACH_GO = 4
const MACH_HIT = 6
const MACH_BACK = 13

// Blink across the gap faster than the eye, a streak of afterimages, land one sharp
// jab with a snap of speed lines, and zip straight back
function machpunch(out, t, a, g, c) {
  const H = MACH_HIT
  const pal = tones(c)
  const fy = Math.round(lerp(g.cy, g.target.y, 0.5))
  const edge = frontOf(g, fy)
  const tx = g.target.x
  const far = clamp(Math.abs(tx - edge) - 6, 0, 16)
  const at = (k) => (k < MACH_GO ? (k >= 2 ? -1 : 0) : k < MACH_BACK ? far : k < MACH_BACK + 2 ? Math.round(far * 0.15) : 0)
  out.dx = g.side * at(t)
  if (t >= 1 && t < MACH_GO) {
    out.sx = 0.92
    out.sy = 1.05
  }
  if (t === MACH_GO || t === MACH_BACK) {
    // See-through afterimages strung along the dash
    out.ghosts = [0.25, 0.5, 0.75].map((f) => ({
      dx: g.side * Math.round(lerp(t === MACH_GO ? 0 : far, t === MACH_GO ? far : 0, f)),
      dy: 0,
      shade: (col, x, y) => ((x + y) % 2 ? null : mix(col, c, 0.4 + f * 0.3)),
    }))
  }
  if (t >= MACH_GO && t < H + 2) out.sx = 1.08
  if (t === H) out.shake = [g.side * 2, 0]
  out.skew = tilt(g, out.dy, t >= MACH_GO && t < H + 3 ? 2 : t >= 2 && t < MACH_GO ? -1 : 0)

  // Long speed lines span the gap for an instant each way
  for (const s of [MACH_GO, MACH_BACK]) {
    const age = t - s
    if (age < 0 || age > 2) continue
    for (let k = 0; k < 4; k++) {
      const y = Math.round(lerp(g.top + 2, g.bottom - 2, k / 3))
      const x0 = (g.side > 0 ? g.left : g.right) + (s === MACH_GO ? 0 : g.side * far)
      const x1 = edge + g.side * (s === MACH_GO ? far : 0)
      const cut = age * 0.33
      line(out, lerp(x0, x1, cut), y, x1, y, age === 0 ? WHITE : light(c, 0.4))
    }
  }
  if (t >= MACH_GO && t < H + 3) art(out, FIST, t === H ? flat(WHITE) : pal, tx - g.side, fy, g.side)
  const age = t - H
  if (age >= 0 && age < 4) {
    bang(out, tx + g.side * 2, fy, [3, 5, 4, 2][age], age === 0 ? WHITE : c, { spikes: 4, turn: 0.125 })
    for (const oy of [-3, 3]) line(out, tx + g.side * 2, fy + oy, tx + g.side * (6 + age * 2), fy + oy * 1.4, age < 2 ? WHITE : c)
  }
}

const UPPER_DASH = 9
const UPPER_RISE = 12
const UPPER_HIT = 14
const UPPER_FALL = 22

// Sink into a deep crouch with the fist low, dash in, and spring straight up in a
// rising uppercut that leaves a towering streak and a swirl of wind, then drop home
function skyuppercut(out, t, a, g, c) {
  const H = UPPER_HIT
  const pal = tones(c)
  const tx = g.target.x
  const edge = frontOf(g, g.bottom - 2)
  const far = clamp(Math.abs(tx - edge) - 4, 0, 12)
  const high = clamp(Math.round((g.bottom - g.top) * 0.6), 4, 9)
  const dxAt = (k) => Math.round(keys(k, [[0, 0], [6, -1, easeOut], [UPPER_DASH, -1], [UPPER_RISE, far, easeIn], [UPPER_FALL + 4, far], [UPPER_FALL + 14, 0, easeInOut]]))
  const dyAt = (k) => Math.round(keys(k, [[UPPER_RISE, 0], [H + 2, -high, easeOut], [UPPER_FALL, -high + 1], [UPPER_FALL + 4, 0, easeIn]]))
  out.dx = g.side * dxAt(t)
  out.dy = dyAt(t)
  if (t < UPPER_RISE) {
    const f = easeOut(phase(t, 0, 6))
    out.sy = 1 - 0.2 * f
    out.sx = 1 + 0.1 * f
    if (t >= 4) out.shade = tint(c, t % 2 ? 0.16 : 0.06)
  } else if (t < H + 3) {
    out.sy = 1.12
    out.sx = 0.92
    out.ghosts = [ghost(g.side * dxAt(t - 1), dyAt(t - 1), light(c, 0.3), 0.6)]
  } else if (t >= UPPER_FALL + 4 && t < UPPER_FALL + 6) {
    out.sy = 0.86
    out.sx = 1.08
  }
  if (t === H) out.shade = tint(WHITE, 0.5)
  if (t >= H && t < H + 3) out.shake = [[0, -2], [g.side, 1], [0, -1]][t - H]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [6, 2, easeOut], [UPPER_RISE, 2], [H, -1], [UPPER_FALL, 0]]))

  // The fist rides low by the feet, then leads the climb straight up
  const fx = edge + g.side * (dxAt(t) + 2)
  if (t >= 3 && t < UPPER_RISE) {
    art(out, FIST, pal, fx + g.side * 2, g.bottom - 2, g.side)
    if (t >= 5) ring(out, fx, g.bottom - 2, 3 + (t % 2), light(c, 0.4), 0, Math.PI, back)
  }
  const crown = g.top + out.dy
  if (t >= UPPER_RISE && t < H + 6) {
    const fade = phase(t, H + 1, H + 6)
    const x = edge + g.side * (far + 2)
    const yTop = Math.max(1, crown - 4)
    shoot(out, x, lerp(g.ground, yTop, fade), x, yTop + 2, 3, c, back)
    if (t <= H + 2) centered(out, FIST_UP, t === H ? flat(WHITE) : pal, x, yTop)
  }
  // Wind spirals up around the column after the hit
  if (t >= H + 1 && t < UPPER_FALL + 2) {
    const x = edge + g.side * (far + 2)
    for (let k = 0; k < 10; k++) {
      const y = g.ground - k * 2 - ((t * 2) % 2)
      const ang = k * 0.9 + t * 0.7
      if (y < 0) continue
      dot(out, x + Math.cos(ang) * 4, y, Math.sin(ang) > 0 ? light(c, 0.5) : dark(c, 0.2))
    }
  }
  const hx = edge + g.side * (far + 2)
  const hy = Math.max(2, Math.min(g.target.y - 3, crown + high))
  const age = t - H
  if (age >= 0 && age < 4) bang(out, hx, hy, [4, 6, 5, 3][age], age === 0 ? WHITE : c, { flat: 1.3, turn: 0.25 })
  rubble(out, t, a, g, H, hx, hy, 8, c, { power: 1, up: 1 })
  dust(out, t, a, UPPER_RISE, hx, g.ground - 1, 5, 0, { size: 1.4 })
  dust(out, t, a, UPPER_FALL + 4, g.cx + g.side * far, g.ground - 1, 4, 0, { size: 1.2, salt: 9 })
}

const ROLL_SPIN = 5
const ROLL_HIT = 14

// Hop forward spinning like a top, a ring of wind wrapping the body at head height,
// and catch the target with the heel at the front of the turn
function rollingkick(out, t, a, g, c) {
  const H = ROLL_HIT
  const pal = tones(c)
  const tx = g.target.x
  const ky = Math.round(lerp(g.top, g.cy, 0.7))
  const edge = frontOf(g, ky)
  const far = clamp(Math.abs(tx - edge) - 6, 0, 10)
  const body = Math.round(keys(t, [[0, 0], [ROLL_SPIN, -1, easeOut], [H, far, easeInOut], [H + 4, far], [H + 14, 0, easeInOut]]))
  out.dx = g.side * body
  const spinning = t >= ROLL_SPIN && t < H + 4
  if (t < ROLL_SPIN) out.sy = 1 - 0.08 * easeOut(phase(t, 0, ROLL_SPIN))
  if (spinning) {
    const q = Math.floor((t - ROLL_SPIN) / 2) % 2
    out.flipX = q === 1
    out.sx = q ? 0.8 : 1
    out.dy = -Math.round(Math.sin(Math.PI * phase(t, ROLL_SPIN, H + 4)) * 2)
  }
  if (t === H) out.shake = [g.side * 2, 0]
  if (t === H + 1) out.shake = [-g.side, 1]

  // The heel races around an ellipse around the body, the back half behind it
  const cx = g.cx + g.side * body
  const rx = (g.right - g.left) / 2 + 3
  const ry = 2.5
  const front = toward(g, 0)
  const angAt = (k) => front - g.side * TAU * 1.5 * (1 - phase(k, ROLL_SPIN, H))
  if (spinning) {
    const head = angAt(Math.min(t, H))
    const steps = 22
    for (let k = 0; k < steps; k++) {
      const ang = head + g.side * (k / steps) * 3.6
      const x = cx + Math.cos(ang) * rx
      const y = ky + out.dy + Math.sin(ang) * ry
      const paint = Math.sin(ang) < 0 ? back : dot
      if (t >= H && k > steps * (1 - phase(t, H, H + 4))) continue
      paint(out, x, y, k < 3 ? WHITE : k < 9 ? light(c, 0.4) : k < 15 ? c : dark(c, 0.3))
      if (k < 12) paint(out, x, y + 1, dark(c, 0.3))
    }
    if (t <= H && Math.sin(head) >= -0.2) art(out, BOOT, t === H ? flat(WHITE) : pal, Math.round(cx + Math.cos(head) * rx) + g.side * 3, ky + out.dy + Math.sin(head) * ry, Math.cos(head) * g.side >= 0 ? g.side : -g.side)
  }
  const hx = edge + g.side * (far + rx - (g.right - g.left) / 2 + 3)
  const age = t - H
  if (age >= 0 && age < 5) {
    bang(out, hx, ky, [4, 6, 6, 4, 2][age], age === 0 ? WHITE : c, { turn: age * 0.3, spikes: 6 })
    if (age >= 1) ring(out, hx, ky, 4 + age * 1.5, light(c, 0.3), toward(g, 0), 1.2)
  }
  rubble(out, t, a, g, H, hx, ky, 6, c, { power: 0.9 })
  dust(out, t, a, H + 2, cx, g.ground - 1, 4, 0, { size: 1.2 })
}

const LOW_DUCK = 5
const LOW_HIT = 10

// Duck and slide in feet first along the ground, dust spraying behind, take the
// target's legs out, and drop slowing chevrons over it before springing up
function lowsweep(out, t, a, g, c) {
  const H = LOW_HIT
  const pal = tones(c)
  const tx = g.target.x
  const fy = g.ground - 1
  const edge = frontOf(g, g.bottom - 1)
  const far = clamp(Math.abs(tx - edge) - 7, 0, 12)
  const body = Math.round(keys(t, [[0, 0], [LOW_DUCK, -1, easeOut], [H, far, easeOut], [H + 6, far], [H + 16, 0, easeInOut]]))
  out.dx = g.side * body
  const duck = keys(t, [[0, 0], [LOW_DUCK, 1, easeOut], [H + 4, 1], [H + 8, 0]])
  out.sy = 1 - 0.22 * duck
  out.sx = 1 + 0.06 * duck
  // Leaning back into the slide, the top trails behind the feet
  out.skew = tilt(g, 0, keys(t, [[0, 0], [LOW_DUCK, 1], [LOW_DUCK + 1, -3], [H + 4, -3], [H + 8, 0]]))
  if (t >= H + 8 && t < H + 12) out.dy = -Math.round(Math.sin(Math.PI * phase(t, H + 8, H + 12)) * 2)
  if (t === H) out.shake = [g.side, 1]

  // Foot out front at ground level, a long rake of dust behind it
  if (t >= LOW_DUCK && t < H + 3) {
    const bx = edge + g.side * (body + 6)
    art(out, BOOT, t === H ? flat(WHITE) : pal, bx, fy - 1, g.side)
    for (let d = 2; d < 3 + (t - LOW_DUCK) * 2 && t < H + 1; d++) {
      const x = bx - g.side * (6 + d)
      dot(out, x, g.ground, d < 4 ? WHITE : (d + t) % 3 ? light(c, 0.4) : DUST)
    }
  }
  emit(t, { count: 10, start: LOW_DUCK, gap: 0.5, life: 8 }, (i, age, f) => {
    const x0 = edge + g.side * (Math.round(keys(LOW_DUCK + i * 0.5, [[LOW_DUCK, -1], [H, far, easeOut]])) + 1)
    puff(out, x0 - g.side * age * 0.5, g.ground - 1 - age * 0.3, 0.5 + 1.2 * Math.sin(Math.PI * f), mix(DUST, 0x8a7c66, f), a.seed + i)
  })
  const age = t - H
  if (age >= 0 && age < 4) bang(out, tx, fy - 1, [4, 6, 5, 3][age], age === 0 ? WHITE : c, { flat: 0.45, turn: 0.5 })

  // Three chevrons fall over the target, pointing down
  emit(t, { count: 3, gap: 3, start: H + 2, life: 12 }, (i, k, f) => {
    const x = tx + (i - 1) * 6
    const y = Math.max(2, g.target.y - 10) + k * 0.6 + (i % 2) * 2
    if (f > 0.75 && t % 2) return
    for (let s = 0; s < 2; s++) {
      for (let d = -2; d <= 2; d++) dot(out, x + d, y + s - Math.abs(d) * 0.8 + 2, s ? dark(SLOW, 0.4) : f < 0.4 ? WHITE : SLOW)
    }
  })
}

const SMASH_PULL = 7
const SMASH_HIT = 10

// A lumpy boulder of rock with a lit top left and darker lower right
function boulder(out, x, y, r, c, a) {
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r - 1); px <= Math.ceil(x + r + 1); px++) {
      const ang = Math.atan2(py - y, px - x)
      const rr = r * (1 + 0.15 * Math.sin(ang * 3 + a.seed % 7))
      const d = Math.hypot((px - x) * 0.85, py - y)
      if (d > rr) continue
      const lean = (px - x + py - y) / r
      dot(out, px, py, d > rr - 0.8 ? dark(c, 0.5) : lean < -0.6 ? light(c, 0.4) : lean < 0.5 ? c : dark(c, 0.25))
    }
  }
}

// Heave up a boulder before the target, pull back, and punch it so cracks race
// across it before it bursts into tumbling chunks
function rocksmash(out, t, a, g, c) {
  const H = SMASH_HIT
  const pal = tones(c)
  const r = clamp(Math.round((g.bottom - g.top) * 0.28), 3, 5)
  const bx = g.target.x
  const by = Math.min(g.target.y, g.ground - r)
  const edge = frontOf(g, by)
  const far = clamp(Math.abs(bx - edge) - r - 7, 0, 10)
  const body = Math.round(keys(t, [[0, 0], [SMASH_PULL - 2, -2, easeOut], [SMASH_PULL, -2], [H, far, easeIn], [H + 4, far], [H + 14, 0, easeInOut]]))
  out.dx = g.side * body + (t >= 3 && t < SMASH_PULL ? tremble(t) : 0)
  if (t < SMASH_PULL) out.sy = 1 - 0.07 * easeOut(phase(t, 0, 4))
  if (t === H) out.shake = [g.side * 2, 0]
  if (t === H + 3) out.shake = [-g.side, 1]
  out.skew = tilt(g, out.dy, keys(t, [[0, 0], [SMASH_PULL - 2, -2, easeOut], [SMASH_PULL, -2], [H, 3, easeIn], [H + 4, 1], [H + 10, 0]]))

  // The boulder pops up out of the ground, trembles under the blow, then bursts
  const rise = easeOut(phase(t, 0, 4))
  if (t < H + 3) {
    const jit = t >= H && t % 2 ? g.side : 0
    boulder(out, bx + jit, lerp(g.ground + r, by, rise), r, ROCK, a)
    if (t >= H) {
      const reach = r * (t - H + 1) * 0.5
      for (let k = 0; k < 4; k++) {
        const ang = toward(g, Math.PI + (k - 1.5) * 0.7)
        let px = bx - g.side * r * 0.6
        let py = by
        for (let s = 0; s < reach * 2; s++) {
          px += Math.cos(ang) * 0.6 + (rnd(a.seed, k, s) - 0.5) * 0.8
          py += Math.sin(ang) * 0.6
          dot(out, px + jit + g.side * s * 0.6, py, t === H + 2 ? WHITE : dark(ROCK, 0.6))
        }
      }
    }
  }
  dust(out, t, a, 0, bx, g.ground - 1, 3, 0, { size: 1.1, salt: 4 })

  // The fist pulls back, then drives into the boulder's face
  const face = bx - g.side * (r + 1)
  const fy = by
  const fx = Math.round(keys(t, [[2, edge + g.side * 2], [SMASH_PULL, edge], [H, face, easeIn], [H + 3, face], [H + 6, edge + g.side * (far + 2)]]))
  if (t >= 2 && t < H + 6) art(out, FIST, t === H ? flat(WHITE) : pal, fx, fy, g.side)
  if (t === H) bang(out, face, fy, 4, WHITE, { spikes: 6 })
  if (t > H && t < H + 3) bang(out, face, fy, 3, c, { spikes: 6 })
  const age = t - H - 3
  if (age >= 0 && age < 3) disc(out, bx, by, r * [1, 0.7, 0.4][age], age === 0 ? WHITE : light(ROCK, 0.4))
  rubble(out, t, a, g, H + 3, bx, by, 16, ROCK, { power: 1.4, life: 18 })
  rubble(out, t, a, g, H + 3, bx, by, 6, c, { power: 1, life: 10, salt: 20 })
  dust(out, t, a, H + 4, bx, g.ground - 1, 6, 0, { size: 1.8, salt: 8 })
}

const TRIPLE = [9, 17, 25]

// Bounce in close and fire three kicks, low, middle, then high, each one harder,
// with a pip lighting over the target for every hit landed
function triplekick(out, t, a, g, c) {
  const pal = tones(c)
  const tx = g.target.x
  const hipY = Math.round(lerp(g.cy, g.bottom, 0.4))
  const edge = frontOf(g, hipY)
  const far = clamp(Math.abs(tx - edge) - 8, 0, 10)
  const last = TRIPLE[2]
  out.dx = g.side * Math.round(keys(t, [[0, 0], [5, far, easeInOut], [last + 3, far], [last + 13, 0, easeInOut]]))
  let lean = 0
  if (t < 5) out.dy = -Math.round(Math.sin(Math.PI * phase(t, 0, 5)) * 2)
  TRIPLE.forEach((k, n) => {
    const power = n + 1
    const hy = Math.round(g.target.y + 3 - n * 4)
    const age = t - k
    // A little hop before each kick, higher for the later ones
    if (t >= k - 4 && t < k) out.dy = -Math.round(Math.sin(Math.PI * phase(t, k - 4, k)) * power)
    if (t >= k - 2 && t < k + 2) {
      lean = age < 0 ? -1 : power
      const from = edge + g.side * (Math.abs(out.dx) + 1)
      const fx = Math.round(lerp(from, tx + g.side, easeOut(phase(t, k - 2, k))))
      const fy = Math.round(lerp(hipY, hy, phase(t, k - 2, k)))
      if (t <= k) shoot(out, from, hipY, fx - g.side * 6, fy, 1 + n * 0.5, c)
      art(out, BOOT, age === 0 ? flat(WHITE) : pal, fx + g.side, fy, g.side)
    }
    if (age === 0) out.shake = [g.side * Math.min(2, power), n === 2 ? 1 : 0]
    if (age >= 0 && age < 4) bang(out, tx, hy, ([3, 4, 3, 2][age]) + n * 1.5, age === 0 ? WHITE : c, { turn: n * 0.3 + age * 0.2, spikes: 6 + n })
    if (n === 2 && age >= 1 && age < 6) ring(out, tx, hy, 5 + age * 1.3, age < 3 ? light(c, 0.4) : c, 0, Math.PI, back)
    rubble(out, t, a, g, k, tx, hy, 3 + n * 3, c, { power: 0.7 + n * 0.25, salt: n * 9 })
  })
  out.skew = tilt(g, out.dy, lean)

  // One pip lights over the target for each kick that has landed
  const landed = TRIPLE.filter((k) => t >= k).length
  if (landed && t < last + 12) {
    for (let n = 0; n < 3; n++) {
      const x = tx + (n - 1) * 3
      const y = Math.max(1, g.target.y - 11)
      if (n < landed) plus(out, x, y, t - TRIPLE[n] < 3 ? WHITE : c, WHITE)
      else dot(out, x, y, dark(c, 0.4))
    }
  }
}

export const MARTIAL = {
  jumpkick: { ticks: 40, color: 0xffa040, draw: jumpkick, pose: (t) => ({ stride: t > JK_LAND + 1 && t < JK_LAND + 10 }) },
  wakeupslap: { ticks: 36, color: 0xffd27a, draw: wakeupslap, pose: (t) => ({ stride: t < SLAP_RAISE || (t >= SLAP_HIT + 6 && t < SLAP_HIT + 16) }) },
  dynamicpunch: { ticks: 46, color: 0xff7a3a, draw: dynamicpunch },
  armthrust: { ticks: 40, color: 0xffb070, draw: armthrust },
  forcepalm: { ticks: 36, color: 0x8ad0ff, draw: forcepalm },
  sacredsword: { ticks: 44, color: 0xa8d8ff, draw: sacredsword },
  brickbreak: { ticks: 36, color: 0xffc070, draw: brickbreak, pose: (t) => ({ stride: t < BRICK_RISE + 2 || (t >= BRICK_HIT + 6 && t < BRICK_HIT + 16) }) },
  drainpunch: { ticks: 40, color: 0x7ee070, draw: drainpunch },
  machpunch: { ticks: 24, color: 0xbfe6ff, draw: machpunch },
  skyuppercut: { ticks: 40, color: 0x7ac8ff, draw: skyuppercut },
  rollingkick: { ticks: 32, color: 0xffb04a, draw: rollingkick },
  lowsweep: { ticks: 32, color: 0xe0a050, draw: lowsweep },
  rocksmash: { ticks: 32, color: 0xffd08a, draw: rocksmash },
  triplekick: { ticks: 40, color: 0xffd060, draw: triplekick, pose: (t) => ({ stride: t >= TRIPLE[2] + 3 && t < TRIPLE[2] + 13 }) },
}
