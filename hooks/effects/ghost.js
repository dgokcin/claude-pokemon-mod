// Ghost moves

import {
  WHITE, back, baseAt, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, keys, lean, lerp, light, line, luma,
  mix, phase, plus, ramp, ring, rnd, spark, stamp, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const SHADOW = 0x1a1026
const EYE = 0xff3a5a
const METAL = { k: 0x2e2e3c, h: 0xf4f4fa, l: 0xbcbccc, o: 0x80808f }

const NAIL = ['kkkkkkk', 'khhllok', 'kkkokkk', '..klk..', '..kok..', '..klk..', '..kok..', '..klk..', '...k...']
const ALARM = ['.kk.', 'khhk', 'khhk', 'khhk', '.kk.', '....', '.kk.', 'khhk', '.kk.']
// A clenched shadow fist facing right, with claw tips
const FIST = ['.kkkkk..', 'khhllkk.', 'kllllolk', 'kkkkllok', 'kdddddok', '.kkkkkk.']

// Pixel art facing the target, its front edge at column fx and its middle on row y
function art(out, rows, pal, fx, y, side, paint = dot) {
  const w = rows[0].length
  stamp(out, side > 0 ? fx - w + 1 : fx, Math.round(y - (rows.length - 1) / 2), rows, pal, side < 0, paint)
}

const touches = (g, x, y) => g.solid(x - 1, y) || g.solid(x + 1, y) || g.solid(x, y - 1) || g.solid(x, y + 1)
const onRim = (g, x, y) => !g.solid(x - 1, y) || !g.solid(x + 1, y) || !g.solid(x, y - 1) || !g.solid(x, y + 1)

// A shade that sinks the body into shadow by f with a glowing rim and burning eyes.
// It follows the frame's offset, scale, and skew, so set those first.
function haunt(g, out, f, rim, body = SHADOW, eye = EYE) {
  const at = baseAt(g, out)
  return (x, y, col) => {
    if (luma(col) > 232) return mix(col, eye, f)
    const [bx, by] = at(x, y)
    return mix(col, onRim(g, bx, by) ? rim : body, f * 0.88)
  }
}

// A glow just outside the sprite's outline, behind it at offset ox, oy
function halo(out, g, t, col, ox = 0, oy = 0) {
  for (let y = g.top - 1; y <= g.bottom + 1; y++) {
    for (let x = g.left - 1; x <= g.right + 1; x++) {
      if (!g.solid(x, y) && touches(g, x, y) && (x * 3 + y * 5 + t) % 5) back(out, x + ox, y + oy, col)
    }
  }
}

// The top of the sprite above column x, or null when the column is empty
function topAt(g, x) {
  for (let y = g.top; y <= g.bottom; y++) if (g.solid(x, y)) return y
  return null
}

// A little teardrop spirit, its tail curling up behind it
function wisp(out, x, y, c, t, i = 0) {
  const [hi, , , deep] = ramp(c)
  const sway = Math.sin(t * 0.7 + i * 1.7)
  dot(out, x - 1, y, deep)
  dot(out, x + 1, y, deep)
  dot(out, x, y + 1, deep)
  dot(out, x, y, WHITE)
  dot(out, x + sway * 0.6, y - 1, hi)
  dot(out, x + sway * 1.2, y - 2, c)
  dot(out, x + sway * 1.6, y - 3, deep)
}

// A ghostly flame licking up h pixels from x, y, swaying, pale at its tip
function flame(out, x, y, h, t, k, c, paint = dot) {
  const [hi, lit, , deep] = ramp(c)
  for (let d = 0; d <= h; d++) {
    const u = d / Math.max(1, h)
    const px = x + Math.sin(d * 0.8 - t * 0.9 + k) * u * 1.3
    const w = (1 - u) * 1.4
    const col = u < 0.3 ? c : u < 0.65 ? lit : u < 0.9 ? hi : WHITE
    if (w > 0.6) {
      paint(out, px - w, y - d, deep)
      paint(out, px + w, y - d, deep)
    }
    paint(out, px, y - d, col)
  }
}

// A dark smoky puff with a lit rim, for shadow stuff
function murk(out, x, y, r, c, seed, paint = dot) {
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const d = Math.hypot(px - x, py - y) / Math.max(0.5, r)
      if (d > 1.05 || (d > 0.7 && rnd(seed, px * 31 + py) < 0.3)) continue
      paint(out, px, py, d > 0.7 ? light(c, 0.25) : d > 0.4 ? dark(c, 0.35) : mix(c, SHADOW, 0.7))
    }
  }
}

// An upright oval outline
function oval(out, x, y, rx, ry, c, paint = dot) {
  const steps = Math.ceil((rx + ry) * 4)
  for (let k = 0; k < steps; k++) {
    const ang = (k / steps) * TAU
    paint(out, x + Math.cos(ang) * rx, y + Math.sin(ang) * ry, c)
  }
}

const AST_GONE = 4
const AST_POP = 10
const AST_BACK = 17

// Flicker out of sight, drift across as a wisp, and burst up right before the target
// swollen and dark with burning eyes, startling it, then fade and slip home
function astonish(out, t, a, g, c) {
  const front = g.side > 0 ? g.right : g.left
  const far = clamp(Math.abs(g.target.x - front) - 4, 0, 14)
  const out1 = t >= AST_GONE && t < AST_POP
  const back1 = t >= AST_BACK && t < AST_BACK + 6
  if ((t >= 1 && t < AST_GONE && t % 2) || out1 || (back1 && (t < AST_BACK + 3 || t % 2 === 0))) out.hidden = true
  if (t >= AST_POP && t < AST_BACK) {
    out.dx = g.side * far
    const f = easeOut(phase(t, AST_POP, AST_POP + 2)) * (1 - easeIn(phase(t, AST_BACK - 3, AST_BACK)))
    out.sx = 1 + 0.28 * f
    out.sy = 1 + 0.28 * f
    out.dy = t === AST_POP ? -2 : 0
    out.shade = haunt(g, out, 0.8 * f + 0.1, light(c, 0.4))
  } else if (t < AST_GONE) {
    out.shade = tint(SHADOW, 0.2 * t)
  } else if (t >= AST_BACK + 3 && t < AST_BACK + 9) {
    out.shade = tint(SHADOW, 0.5 * (1 - phase(t, AST_BACK + 3, AST_BACK + 9)))
  }
  if (t === AST_POP || t === AST_POP + 1) out.shake = [g.side * (t === AST_POP ? 2 : -1), t === AST_POP ? -1 : 1]

  // A wisp slips across while the body is gone
  if (out1) {
    const f = phase(t, AST_GONE, AST_POP)
    const x = lerp(g.cx, g.cx + g.side * far, easeInOut(f))
    const y = g.cy + Math.sin(f * TAU) * 2
    wisp(out, x, y, c, t)
    dot(out, x - g.side * 2, y, dark(c, 0.3))
  }

  // Shock spikes all around the target, flickering long and short, with an alarm mark
  const age = t - AST_POP
  const { x: tx, y: ty } = g.target
  if (age >= 0 && age < 10) {
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * TAU + 0.2
      const r0 = 6 + age * 0.3
      const len = (k + age) % 2 ? 2 : 3
      line(out, tx + Math.cos(ang) * r0, ty + Math.sin(ang) * r0 * 0.8, tx + Math.cos(ang) * (r0 + len), ty + Math.sin(ang) * (r0 + len) * 0.8, age < 3 ? WHITE : light(c, 0.4))
    }
    if (age < 8) stamp(out, tx - 2 - g.side * 3, Math.max(0, ty - 14 + (age < 2 ? 2 - age : 0)), ALARM, { k: dark(EYE, 0.5), h: age % 4 < 2 ? EYE : WHITE })
  }
}

const CURSE_NAIL = 6
const CURSE_DRIVE = 20

// Facing out, sink into a dark aura while a long nail hovers over the head, then drive
// it down into the crown with a red flash and bleed shadow wisps until it fades
function curse(out, t, a, g, c) {
  const [hi] = ramp(c)
  const D = CURSE_DRIVE
  const dim = phase(t, 0, 8) * (1 - phase(t, 38, 47))
  let crown = topAt(g, g.cx)
  if (crown === null) crown = g.top
  if (t >= D && t < D + 3) {
    out.sy = [0.86, 0.92, 0.97][t - D]
    out.sx = [1.08, 1.04, 1.01][t - D]
  }
  if (t >= D && t < D + 12) out.dx = tremble(t, 2)
  if (t === D) out.shake = [0, 2]
  if (t === D + 1) out.shake = [1, -1]
  const hurt = t >= D && t < D + 14 && t % 4 < 2
  if (hurt) out.shade = tint(EYE, 0.55 * (1 - phase(t, D, D + 14)))
  else if (dim > 0) out.shade = haunt(g, out, 0.5 * dim, hi, SHADOW, EYE)
  if (dim > 0.4) halo(out, g, t, t % 4 < 2 ? c : dark(c, 0.3), out.dx, 0)

  // The nail sinks slowly into place over the head, then is struck home in one tick,
  // its tip buried well into the body so even a mon at the top of the strip shows it
  const tip = Math.min(g.cy, crown + 5)
  const hover = tip - 5
  const at = t < D ? Math.round(lerp(hover - 6, hover, easeOut(phase(t, CURSE_NAIL, CURSE_NAIL + 8)))) + (t % 6 < 3 ? 0 : 1) : tip
  const shown = t >= CURSE_NAIL && t < 40 && !(t >= 34 && t % 2)
  if (shown) {
    const nx = g.cx + out.dx - 3
    const ny = at - NAIL.length + 1
    if (t < D) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1]]) stamp(out, nx + ox, ny + oy, NAIL, { k: t % 4 < 2 ? c : hi })
    stamp(out, nx, ny, NAIL, t === D ? { k: WHITE, h: WHITE, l: WHITE, o: WHITE } : METAL)
  }
  if (t === D - 1) line(out, g.cx + out.dx, hover - 8, g.cx + out.dx, tip, WHITE)
  const age = t - D
  if (age >= 0 && age < 4) {
    for (let k = 0; k < 6; k++) {
      const ang = -Math.PI + (k / 5) * Math.PI
      const r = 2 + age * 1.5
      dot(out, g.cx + Math.cos(ang) * r, crown - 1 + Math.sin(ang) * r * 0.6, age < 2 ? WHITE : EYE)
    }
  }

  // Shadow wisps bleed off the body after the blow
  emit(t, { count: 10, gap: 1.6, start: D + 2, life: 10 }, (i, k, f) => {
    const x = g.left + 1 + rnd(a.seed, i, 3) * (g.right - g.left - 2)
    const y0 = topAt(g, Math.round(x)) ?? g.top
    if (f > 0.8 && t % 2) return
    wisp(out, x + Math.sin(k * 0.4 + i) * 1.5, y0 - 1 - k * 0.9, c, t, i)
  })
}

const OMEN_GUSTS = 7
const OMEN_GAP = 3
const OMEN_LIFE = 12

// Sway and moan out eerie gusts that curl at their heads and carry little spirits,
// winding into a slow whirl around the target
function ominouswind(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const live = phase(t, 0, 5) * (1 - phase(t, 36, 43))
  const sway = Math.sin(t * 0.3) * live
  if (live > 0) {
    out.skew = lean(g, g.side * sway * 2.5)
    out.shade = tint(c, 0.15 * live)
  }
  const dist = Math.max(6, Math.abs(tx - mx))
  emit(t, { count: OMEN_GUSTS, gap: OMEN_GAP, start: 4, life: OMEN_LIFE }, (i, age, f) => {
    const lane = ((i % 3) - 1) * 4
    const head = 2 + easeOut(f) * (dist + 2)
    const yAt = (s) => lerp(my, ty, s / (dist + 4)) + lane + Math.sin(s * 0.38 - age * 0.35 + i) * 1.3
    const len = Math.min(head, 10)
    for (let s = head - len; s <= head; s += 0.5) {
      const u = (head - s) / Math.max(1, len)
      if (f > 0.7 && Math.round(s) % 2) continue
      if (u < 0.5) dot(out, mx + g.side * s, yAt(s) + 1, deep)
      dot(out, mx + g.side * s, yAt(s), u < 0.15 ? WHITE : u < 0.45 ? hi : u < 0.75 ? lit : c)
    }
    if (i % 3 === 1 && f < 0.8) wisp(out, mx + g.side * (head - len * 0.6), yAt(head - len * 0.6) - 3, c, t, i)
  })

  // A slow whirl of wind wraps the target
  const whirl = phase(t, 14, 20) * (1 - phase(t, 34, 41))
  if (whirl > 0) {
    for (let arm = 0; arm < 2; arm++) {
      for (let k = 0; k < 10; k++) {
        const ang = t * 0.35 + arm * Math.PI - k * 0.14
        const rx = 8 * whirl
        const ry = 3 * whirl
        const paint = Math.sin(ang) < 0 ? back : dot
        paint(out, tx + Math.cos(ang) * rx, ty + Math.sin(ang) * ry, k < 2 ? WHITE : k < 6 ? hi : c)
      }
    }
    if (t % 6 < 2) out.shake = [g.side * (t % 12 < 6 ? 1 : 0), 0]
  }
}

// Which way a toward-the-target angle points on screen
function toward(g, angle) {
  return g.side > 0 ? angle : Math.PI - angle
}

const BALL_FIRE = 14
const BALL_HIT = 23

// A sphere of shadow: a void core, a swirling inside, and a rim of flickering dark flame
function shadowOrb(out, x, y, r, t, c, seed) {
  const [hi, lit, , deep] = ramp(c)
  disc(out, x, y, r, deep)
  for (let k = 0; k < 3; k++) {
    const ang = t * 0.5 + (k * TAU) / 3
    for (let d = 0.3; d < r - 0.5; d += 0.5) dot(out, x + Math.cos(ang + d * 0.9) * d, y + Math.sin(ang + d * 0.9) * d, SHADOW)
  }
  const steps = Math.ceil(r * 7)
  for (let k = 0; k < steps; k++) {
    const ang = (k / steps) * TAU
    const flick = rnd(seed, k, t) > 0.55 ? 1 : 0
    dot(out, x + Math.cos(ang) * r, y + Math.sin(ang) * r, (k + t) % 3 ? c : lit)
    if (flick) dot(out, x + Math.cos(ang) * (r + 1), y + Math.sin(ang) * (r + 1), (k + t) % 2 ? deep : c)
  }
  if (r >= 2) dot(out, x - r * 0.45, y - r * 0.45, hi)
}

// Draw wisps of shadow spiraling in to a sphere before the mouth, hurl it at the
// target trailing smoke, and burst it into splattering darkness
function shadowball(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const R = clamp(Math.round((g.bottom - g.top) * 0.2), 3, 4)
  const sx = g.ahead(R + 1)
  const sy = clamp(g.mouth.y, R + 1, g.ground - R - 1)
  const { x: tx, y: ty } = g.target
  if (t >= 2 && t < BALL_FIRE) {
    out.dx = -g.side
    out.skew = lean(g, -g.side * 1.5)
    out.shade = tint(c, t % 4 < 2 ? 0.2 : 0.1)
  } else if (t >= BALL_FIRE && t < BALL_FIRE + 3) {
    out.dx = g.side
    out.skew = lean(g, g.side * 2)
  }
  const at = (k) => {
    const f = phase(k, BALL_FIRE, BALL_HIT)
    return { x: lerp(sx, tx, easeIn(f) * 0.4 + f * 0.6), y: lerp(sy, ty, f) + Math.sin(f * TAU) * 1.2 }
  }
  if (t < BALL_FIRE) {
    emit(t, { count: 12, gap: 0.8, start: 1, life: 5 }, (i, age, f) => {
      const ang = rnd(a.seed, i) * TAU + f * 2.5
      const d = (R + 7) * (1 - easeIn(f))
      const x = sx + Math.cos(ang) * d
      const y = sy + Math.sin(ang) * d * 0.8
      dot(out, x, y, f < 0.5 ? lit : c)
      dot(out, x - Math.cos(ang), y - Math.sin(ang), deep)
    })
    const r = 0.8 + (R - 0.8) * easeOut(phase(t, 2, BALL_FIRE - 2))
    if (t >= 2) shadowOrb(out, sx, sy, r, t, c, a.seed)
  } else if (t < BALL_HIT) {
    for (let k = 1; k <= 5; k++) {
      const p = at(t - k * 0.6)
      murk(out, p.x - g.side, p.y, Math.max(0.6, R - k * 0.6), c, a.seed + k, back)
    }
    const p = at(t)
    shadowOrb(out, p.x, p.y, R, t, c, a.seed)
  }
  const age = t - BALL_HIT
  if (age >= 0 && age < 3) disc(out, tx, ty, [R + 1, R + 2, R][age], age === 0 ? lit : deep)
  if (age >= 0 && age < 2) out.shake = [age ? -g.side : g.side * 2, age]
  if (age >= 1 && age < 8) {
    const r = R + 1 + age * 1.4
    ring(out, tx, ty, r, age < 4 ? lit : c)
    ring(out, tx, ty, r - 1, deep)
  }
  emit(t, { count: 12, gap: 0, start: BALL_HIT, life: 11 }, (i, k, f) => {
    const ang = (i / 12) * TAU + rnd(a.seed, i, 5) * 0.4
    const speed = 0.9 + rnd(a.seed, i, 6) * 0.7
    const x = tx + Math.cos(ang) * speed * k
    const y = ty + Math.sin(ang) * speed * k * 0.8 + 0.06 * k * k
    if (y > g.ground) return
    const r = 1.3 * (1 - f)
    if (r > 0.6) disc(out, x, y, r, SHADOW)
    dot(out, x, y - 1, f < 0.5 ? lit : c)
  })
  emit(t, { count: 6, gap: 1.5, start: BALL_HIT + 3, life: 10 }, (i, k, f) => {
    const x = tx + (rnd(a.seed, i, 8) - 0.5) * 8 + Math.sin(k * 0.5 + i)
    const y = ty - 1 - k * 0.7
    if (y > 0) murk(out, x, y, 0.8 + 1.1 * Math.sin(Math.PI * f), c, a.seed + i + 40)
  })
}

const HEX_DRAW = [4, 14]
const HEX_FLARE = 23

// Eyes glinting, trace a ring of runes around the target's feet that turns and glows,
// then flares and throws up a fence of ghostly flames
function hex(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const tx = g.target.x
  const ry = 2
  const rx = 7
  const cy = Math.min(g.ground - ry, g.target.y + 4)
  const glare = phase(t, 0, 4) * (1 - phase(t, 34, 40))
  if (glare > 0) {
    out.shade = (x, y, col) => (luma(col) > 150 || luma(col) < 40 ? mix(col, t % 4 < 2 ? c : WHITE, glare * 0.7) : mix(col, deep, 0.15 * glare))
  }
  if (t >= HEX_FLARE - 2 && t < HEX_FLARE + 2) out.dx = g.side
  if (t >= HEX_FLARE && t < HEX_FLARE + 4) out.shake = [(t % 2 ? 1 : -1) * g.side, 0]

  // The ring draws itself around, its far half behind the target
  const drawn = easeInOut(phase(t, HEX_DRAW[0], HEX_DRAW[1]))
  const spin = t * 0.12
  const fade = 1 - phase(t, HEX_FLARE + 10, HEX_FLARE + 16)
  if (drawn > 0 && fade > 0) {
    const steps = 40
    for (let k = 0; k < steps * drawn; k++) {
      const ang = (k / steps) * TAU + Math.PI / 2
      const paint = Math.sin(ang) < 0 ? back : dot
      if (fade < 0.5 && k % 2) continue
      const col = t >= HEX_FLARE && t < HEX_FLARE + 2 ? WHITE : (k + t) % 8 < 2 ? hi : c
      paint(out, tx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry, col)
      paint(out, tx + Math.cos(ang) * (rx + 1), cy + Math.sin(ang) * ry, deep)
    }
    // Runes stand on the ring as little upright marks
    for (let k = 0; k < 6; k++) {
      const ang = spin + (k * TAU) / 6
      if (((ang - Math.PI / 2) % TAU + TAU) % TAU > TAU * drawn) continue
      const x = tx + Math.cos(ang) * rx
      const y = cy + Math.sin(ang) * ry
      const paint = Math.sin(ang) < 0 ? back : dot
      const col = t < HEX_FLARE ? (t + k) % 4 < 2 ? lit : WHITE : c
      paint(out, x, y - 1, col)
      paint(out, x, y - 2, col)
      if (k % 2) paint(out, x + 1, y - 2, col)
      else paint(out, x - 1, y - 1, col)
    }
  }
  emit(t, { count: 10, gap: 1, start: HEX_DRAW[1] - 2, life: 7 }, (i, k) => {
    if (t >= HEX_FLARE) return
    const ang = rnd(a.seed, i) * TAU
    dot(out, tx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry - 1 - k, k < 3 ? WHITE : lit)
  })

  // A fence of flames bursts up from the ring
  const age = t - HEX_FLARE
  if (age >= 0 && age < 14) {
    const h = Math.round((age < 4 ? (age + 1) * 2.5 : 10 - Math.max(0, age - 8) * 1.6) * (0.7 + 0.3 * rnd(a.seed, 3)))
    for (let k = 0; k < 8; k++) {
      const ang = spin + (k * TAU) / 8
      const x = tx + Math.cos(ang) * rx
      const y = cy + Math.sin(ang) * ry
      const paint = Math.sin(ang) < 0 ? back : dot
      if (h > 0) flame(out, x, y - 1, Math.round(h * (0.75 + 0.25 * Math.sin(k * 2.1 + t))), t, k, c, paint)
    }
    if (age < 2) disc(out, tx, g.target.y, 3 - age, WHITE)
  }
}

const SPITE_THREAD = [5, 10]
const SPITE_PIPS = [16, 20, 24, 28]

// Glare with burning eyes, lash a dark thread onto the target, and tug at it while
// the glowing pips over the target crack and crumble one by one
function spite(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const glare = phase(t, 0, 4) * (1 - phase(t, 32, 38))
  if (glare > 0) out.shade = haunt(g, out, 0.45 * glare, lit)
  if (t >= 2 && t < SPITE_THREAD[0]) out.dx = tremble(t)
  for (const p of SPITE_PIPS) if (t >= p - 1 && t < p + 1) out.dx = -g.side
  out.skew = glare > 0 ? lean(g, -g.side * (out.dx === -g.side ? 1.5 : 0.5)) : null

  // The thread lashes out, then jerks tight with each tug
  const reach = easeOut(phase(t, SPITE_THREAD[0], SPITE_THREAD[1]))
  const gone = phase(t, 30, 36)
  if (reach > 0 && gone < 1) {
    const end = { x: lerp(mx, tx, reach), y: lerp(my, ty - 2, reach) }
    const taut = SPITE_PIPS.some((p) => t >= p - 1 && t < p + 1)
    const n = Math.ceil(Math.abs(end.x - mx)) * 2 + 2
    for (let k = 0; k <= n; k++) {
      const f = k / n
      if (f < gone) continue
      const wave = taut ? 0 : Math.sin(f * 9 - t * 0.9) * 1.2 * Math.sin(f * Math.PI)
      dot(out, lerp(mx, end.x, f), lerp(my, end.y, f) + wave, (k + t) % 5 ? deep : hi)
    }
    if (reach >= 1) plus(out, tx, ty - 2, deep, lit)
  }

  // A row of pips over the target, each flashing and crumbling as it is wrung out
  const shown = phase(t, SPITE_THREAD[1], SPITE_THREAD[1] + 3)
  SPITE_PIPS.forEach((p, k) => {
    const x = tx + Math.round((k - 1.5) * 5)
    const y = Math.max(3, ty - 10)
    const age = t - p
    if (shown > 0 && age < 0 && shown * 4 > k) {
      for (const [ox, oy] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2]]) dot(out, x + ox, y + oy, deep)
      for (const [ox, oy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) dot(out, x + ox, y + oy, (t + k) % 6 < 3 ? c : lit)
      dot(out, x, y, WHITE)
    }
    if (age >= 0 && age < 2) spark(out, x, y, 2 - age, hi)
    emit(t, { count: 4, gap: 0, start: p + 1, life: 9 }, (i, life, f) => {
      const px = x + (i - 1.5) * 0.8 + (rnd(a.seed, i, k) - 0.5) * life * 0.3
      const py = y + 0.12 * life * life
      if (py < g.ground) dot(out, px, py, f < 0.4 ? lit : dark(c, 0.4))
    })
  })
}

const BOND_RISE = [6, 22]
const BOND_SINK = 33

// Facing out, the spirit lifts free of the darkened body, bound to it by two writhing
// threads while chain links circle, then plunges back in with a flash
function destinybond(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const dim = phase(t, 0, 6) * (1 - phase(t, 40, 47))
  const free = easeOut(phase(t, BOND_RISE[0], BOND_RISE[1])) * (1 - easeIn(phase(t, BOND_SINK - 3, BOND_SINK)))
  const rise = Math.round(free * 3 + Math.sin(t * 0.3) * free)
  const drift = Math.round(free * clamp((g.right - g.left) * 0.5, 4, 8))
  if (t === BOND_SINK) out.shade = tint(WHITE, 0.6)
  else if (dim > 0) out.shade = haunt(g, out, 0.65 * dim, lit, SHADOW, c)
  if (t >= BOND_SINK && t < BOND_SINK + 3) {
    out.sy = [0.9, 0.95, 0.98][t - BOND_SINK]
    out.shake = [0, t === BOND_SINK ? 1 : 0]
  }
  if (drift > 0) {
    // A see-through copy of the body floats out to the side, tethered at the middle
    out.ghosts = [{ dx: g.side * drift, dy: -rise, shade: (col, x, y) => ((x + y + t) % 2 ? null : mix(col, light(c, 0.55), 0.75)) }]
    const x0 = g.side > 0 ? g.right : g.left
    for (const oy of [-2, 2]) {
      for (let k = 0; k <= drift + 2; k++) {
        const f = k / (drift + 2)
        const y = g.cy + oy - rise * f + Math.sin(f * Math.PI * 2 + t * 0.6 + oy) * 1.2
        dot(out, x0 + g.side * (k - 1), y, (k + t) % 4 < 2 ? hi : c)
      }
    }
  }
  // Links of a chain circle the body, the far side behind it
  const links = phase(t, 4, 10) * (1 - phase(t, BOND_SINK, BOND_SINK + 6))
  if (links > 0) {
    const rx = (g.right - g.left) / 2 + 3
    const ry = 2
    const cy = Math.round(lerp(g.cy, g.bottom, 0.4))
    for (let k = 0; k < 7; k++) {
      const ang = t * 0.25 + (k * TAU) / 7
      const paint = Math.sin(ang) < 0 ? back : dot
      const x = g.cx + Math.cos(ang) * rx * links
      const y = cy + Math.sin(ang) * ry
      paint(out, x - 1, y, deep)
      paint(out, x + 1, y, deep)
      paint(out, x, y - 1, k % 2 ? lit : c)
      paint(out, x, y + 1, k % 2 ? c : lit)
    }
  }
  const age = t - BOND_SINK
  if (age >= 0 && age < 8) {
    const r = (g.right - g.left) / 2 + 2 + age * 1.5
    ring(out, g.cx, g.cy, r, age < 3 ? WHITE : age < 6 ? lit : c, 0, Math.PI, age < 4 ? dot : back)
  }
}

const GRUDGE_BURN = [6, 34]

// Facing out, tremble with rage as ghostly flames climb up the whole outline, burning
// higher and higher while the eyes flash red, then gutter out
function grudge(out, t, a, g, c) {
  const [, lit] = ramp(c)
  const dim = phase(t, 0, 6) * (1 - phase(t, 36, 43))
  const burn = easeOut(phase(t, GRUDGE_BURN[0], GRUDGE_BURN[1] - 10)) * (1 - easeIn(phase(t, GRUDGE_BURN[1], GRUDGE_BURN[1] + 8)))
  if (t >= GRUDGE_BURN[0] && t < GRUDGE_BURN[1]) out.dx = t % 3 === 0 ? tremble(t, 3) : 0
  const flash = (t >= 14 && t < 17) || (t >= 25 && t < 28)
  if (dim > 0) out.shade = haunt(g, out, 0.5 * dim + (flash ? 0.3 : 0), lit, SHADOW, flash ? 0xff1a2a : c)
  if (flash) out.shake = [t % 2 ? 1 : -1, 0]

  // Flames rise from every other column along the top of the outline
  if (burn > 0) {
    halo(out, g, t, t % 4 < 2 ? c : dark(c, 0.3), out.dx, 0)
    for (let x = g.left; x <= g.right; x += 2) {
      const top = topAt(g, x)
      if (top === null) continue
      const k = x - g.left
      const h = Math.round(burn * (2 + rnd(a.seed, k, Math.floor(t / 3)) * 4 + (x === g.cx || x === g.cx + 1 ? 2 : 0)))
      if (h >= 1) flame(out, x + out.dx, top - 1, h, t, k, c)
    }
    for (const s of [-1, 1]) {
      const x = s < 0 ? g.left - 1 : g.right + 1
      for (let y = g.bottom - 1; y > g.cy; y -= 3) {
        if (!touches(g, x, y)) continue
        flame(out, x + out.dx, y, Math.round(burn * 3), t, y, c, back)
      }
    }
  }
  emit(t, { count: 8, gap: 2, start: 14, life: 8 }, (i, k, f) => {
    if (burn < 0.3) return
    const x = g.left + rnd(a.seed, i, 2) * (g.right - g.left)
    const y = g.top - 4 - k * 0.8
    if (y > 0 && f < 0.8) dot(out, x, y, f < 0.4 ? lit : c)
  })
}

const PUNCH_INTO = 5
const PUNCH_OUT = 8
const PUNCH_HIT = 11

// A swirling dark rift, an upright oval opening by f
function portal(out, x, y, f, t, c) {
  if (f <= 0) return
  const [, lit, , deep] = ramp(c)
  const rx = 2 * f
  const ry = 5 * f
  for (let py = Math.floor(y - ry); py <= Math.ceil(y + ry); py++) {
    for (let px = Math.floor(x - rx); px <= Math.ceil(x + rx); px++) {
      const d = ((px - x) / Math.max(0.5, rx)) ** 2 + ((py - y) / Math.max(0.5, ry)) ** 2
      if (d <= 1) dot(out, px, py, (px + py + t) % 3 ? SHADOW : deep)
    }
  }
  oval(out, x, y, rx + 1, ry + 1, t % 4 < 2 ? lit : c)
}

// Punch into a rift opened before the body; the shadow fist comes out of a second
// rift behind the target and strikes it from the side it isn't watching
function shadowpunch(out, t, a, g, c) {
  const H = PUNCH_HIT
  const [hi, lit, , deep] = ramp(c)
  const pal = { k: SHADOW, h: hi, l: lit, o: c, d: deep }
  const { x: tx } = g.target
  const fy = Math.round(lerp(g.cy, g.target.y, 0.5))
  const front = g.frontAt(clamp(fy, g.top, g.bottom)) - g.side
  const ax = front + g.side * 4
  const bx = clamp(tx + g.side * 7, 2, g.columns - 3)
  out.dx = g.side * Math.round(keys(t, [[0, 0], [2, -1], [PUNCH_INTO, 2, easeIn], [H + 6, 2], [H + 12, 0]]))
  out.skew = lean(g, g.side * keys(t, [[0, 0], [2, -1.5], [PUNCH_INTO, 2.5], [H + 6, 2], [H + 12, 0]]))
  if (t >= 1 && t < H + 10) out.shade = tint(deep, 0.25)
  if (t === H) out.shake = [g.side * 2, 0]
  if (t === H + 1) out.shake = [-g.side, 1]

  const openA = phase(t, 0, 3) * (1 - phase(t, H + 6, H + 10))
  const openB = phase(t, PUNCH_INTO, PUNCH_OUT) * (1 - phase(t, H + 6, H + 10))
  portal(out, ax, fy, openA, t, c)
  portal(out, bx, fy, openB, t, c)

  // The fist sinks into the first rift, then drives out of the second
  if (t >= 2 && t < PUNCH_INTO + 1) {
    const fx = Math.round(lerp(front + g.side * 3, ax + g.side * 3, phase(t, 2, PUNCH_INTO)))
    // Whatever has passed into the rift is gone
    const clip = (o, x, y, col) => (Math.round(x) - ax) * g.side <= 0 && dot(o, x, y, col)
    art(out, FIST, pal, fx, fy, g.side, clip)
  }
  if (t >= PUNCH_OUT && t < H + 5) {
    const fx = Math.round(keys(t, [[PUNCH_OUT, bx], [H, tx - g.side, easeIn], [H + 2, tx - g.side], [H + 5, bx]]))
    for (let d = 1; d < Math.abs(fx - bx) - 6; d++) dot(out, bx - g.side * d, fy + (d % 2 ? -1 : 1), deep)
    art(out, FIST, t === H ? { k: WHITE, h: WHITE, l: WHITE, o: WHITE, d: WHITE } : pal, fx, fy, -g.side)
  }
  const age = t - H
  if (age >= 0 && age < 6) {
    const r = [3, 5, 6, 5, 4, 2][age]
    disc(out, tx, fy, r * 0.6, age < 2 ? WHITE : SHADOW)
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * TAU + age * 0.2
      const len = k % 2 ? r : r * 1.5
      line(out, tx + Math.cos(ang) * r * 0.6, fy + Math.sin(ang) * r * 0.6, tx + Math.cos(ang) * len, fy + Math.sin(ang) * len, age < 3 ? lit : c)
    }
  }
}

const DREAD_CLOUD = [4, 12]
const DREAD_END = 40

// Eyes burning, conjure a black cloud over the target that leers with red eyes and
// a jagged grin and drips darkness onto it, then dissolves
function nightmare(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const dim = phase(t, 0, 6) * (1 - phase(t, DREAD_END, DREAD_END + 7))
  if (dim > 0) out.shade = haunt(g, out, 0.55 * dim, lit)
  if (t >= 3 && t < DREAD_CLOUD[1]) out.dx = tremble(t, 2) > 0 ? g.side : 0

  const cx = tx
  const cy = Math.max(4, ty - 9)
  const grow = easeOut(phase(t, DREAD_CLOUD[0], DREAD_CLOUD[1])) * (1 - phase(t, DREAD_END, DREAD_END + 6))
  if (grow > 0) {
    const fading = t >= DREAD_END
    const paint = fading ? (o, x, y, col) => (Math.round(x) + Math.round(y) + t) % 2 && dot(o, x, y, col) : dot
    const pulse = Math.sin(t * 0.5) * 0.3
    murk(out, cx - 4, cy + 1, (2.6 + pulse) * grow, c, a.seed, paint)
    murk(out, cx + 4, cy + 1, (2.6 - pulse) * grow, c, a.seed + 1, paint)
    murk(out, cx, cy - 1, (3.6 + pulse) * grow, c, a.seed + 2, paint)
    // Red eyes and a jagged grin glare out of the cloud
    if (grow > 0.8 && !fading) {
      const blink = t % 14 === 0
      for (const s of [-1, 1]) {
        if (blink) dot(out, cx + s * 2, cy - 1, EYE)
        else {
          dot(out, cx + s * 2, cy - 1, t % 4 < 2 ? WHITE : EYE)
          dot(out, cx + s * 2 + s, cy - 2, EYE)
          dot(out, cx + s * 2 - s, cy - 1, dark(EYE, 0.3))
        }
      }
      for (let k = -3; k <= 3; k++) dot(out, cx + k, cy + 2 - (k % 2 ? 1 : 0), (k + t) % 3 ? lit : WHITE)
    }
  }
  // Darkness drips down onto the target
  emit(t, { count: 14, gap: 1.8, start: DREAD_CLOUD[1], life: 7 }, (i, k, f) => {
    if (t >= DREAD_END + 2) return
    const x = cx + (rnd(a.seed, i, 4) - 0.5) * 9
    const y = cy + 3 + k * (1 + k * 0.15)
    if (y > Math.min(g.ground, ty + 5)) return
    dot(out, x, y, f < 0.4 ? lit : c)
    dot(out, x, y - 1, deep)
  })
  if (t >= DREAD_CLOUD[1] + 4 && t < DREAD_END && t % 8 < 2) {
    out.shake = [t % 16 < 8 ? g.side : -g.side, 0]
    ring(out, tx, ty + 2, 5, deep, -Math.PI / 2, 0.9)
  }
}

const SNEAK_SINK = 6
const SNEAK_STRIKE = 13
const SNEAK_RETURN = 18
const SNEAK_RISE = 23

// A pool of shadow on the ground, its rim catching a faint light
function pool(out, x, y, rx, c, t) {
  if (rx < 0.8) return
  for (let px = Math.floor(x - rx); px <= Math.ceil(x + rx); px++) {
    const u = Math.abs(px - x) / rx
    if (u > 1) continue
    back(out, px, y, u > 0.85 ? dark(c, 0.2) : SHADOW)
    if (u < 0.75) back(out, px, y - 1, (px + t) % 5 ? SHADOW : dark(c, 0.3))
  }
}

// Melt down into a pool of shadow, slide it across the ground, stab dark spikes up
// out of it beneath the target, slide back, and rise out of the pool
function shadowsneak(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const width = (g.right - g.left + 1) / 2
  const melt = keys(t, [[0, 0], [SNEAK_SINK, 1, easeIn], [SNEAK_RISE, 1], [SNEAK_RISE + 7, 0, easeOut]])
  out.sy = Math.max(0.12, 1 - 0.88 * melt)
  out.sx = 1 + 0.15 * melt
  if (t >= SNEAK_SINK && t < SNEAK_RISE) out.hidden = true
  if (melt > 0) out.shade = haunt(g, out, Math.min(1, melt * 1.3), lit, SHADOW, deep)

  // The pool slides out to the target and back home
  const px = keys(t, [[SNEAK_SINK, g.cx], [SNEAK_STRIKE - 1, tx, easeInOut], [SNEAK_RETURN, tx], [SNEAK_RISE, g.cx, easeInOut]])
  const pr = keys(t, [[0, 0], [SNEAK_SINK, width + 1], [SNEAK_SINK + 3, width * 0.7], [SNEAK_STRIKE - 1, width * 0.8], [SNEAK_RISE, width + 1], [SNEAK_RISE + 7, 0]])
  pool(out, px, g.ground, pr, c, t)
  if (t >= SNEAK_SINK + 1 && t < SNEAK_STRIKE - 1) {
    for (let k = 1; k <= 3; k++) dot(out, px - g.side * (pr + k * 2), g.ground - 1, k === 1 ? deep : dark(c, 0.5))
  }

  // Spikes of shadow stab up from the pool under the target
  const age = t - SNEAK_STRIKE
  if (age >= 0 && age < 6) {
    const reach = Math.max(3, g.ground - ty + 3)
    const h = Math.round(reach * [0.6, 1, 0.9, 0.6, 0.35, 0.15][age])
    for (const [ox, k] of [[-3, 0.6], [0, 1], [3, 0.75]]) {
      const top = g.ground - Math.round(h * k)
      for (let y = g.ground - 1; y >= top; y--) {
        const w = Math.round(((y - top) / Math.max(1, h * k)) * 1.2)
        for (let d = -w; d <= w; d++) dot(out, tx + ox + d, y, Math.abs(d) === w && w > 0 ? lit : SHADOW)
      }
      dot(out, tx + ox, top - 1, age < 2 ? WHITE : lit)
    }
    if (age === 0) out.shake = [0, -2]
    if (age === 1) out.shake = [g.side, 1]
  }
  emit(t, { count: 8, gap: 0, start: SNEAK_STRIKE, life: 9 }, (i, k, f) => {
    const x = tx + (rnd(a.seed, i, 2) - 0.5) * 8
    const y = ty + 2 - k * (0.6 + rnd(a.seed, i, 3) * 0.6)
    if (f < 0.8 || t % 2) dot(out, x, y, f < 0.4 ? lit : c)
  })
}

const CLAW_RAISE = 6
const CLAW_HIT = 10

// Raise a huge shadow claw over the head, lunge, and rake it down through the target,
// leaving three glowing gashes that smoke and fade
function shadowclaw(out, t, a, g, c) {
  const H = CLAW_HIT
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const edge = g.frontAt(clamp(g.mouth.y, g.top, g.bottom)) - g.side
  const far = clamp(Math.abs(tx - edge) - 9, 0, 10)
  const body = Math.round(keys(t, [[0, 0], [CLAW_RAISE, -1, easeOut], [H, far, easeIn], [H + 4, far], [H + 14, 0, easeInOut]]))
  out.dx = g.side * body
  out.skew = lean(g, g.side * keys(t, [[0, 0], [CLAW_RAISE, -2, easeOut], [H, 3, easeIn], [H + 4, 2], [H + 10, 0]]))
  if (t >= 1 && t < H + 6) out.shade = haunt(g, out, 0.35, lit)
  if (t === H) out.shake = [g.side * 2, 1]
  if (t === H + 1) out.shake = [-g.side, 0]

  // Three curved blades sweep from high behind to low ahead around a pivot over the hit
  const pivot = { x: tx - g.side * 5, y: ty - 4 }
  const r = 8
  const from = toward(g, -Math.PI / 2 - 0.5)
  const to = toward(g, 0.9)
  const swingAt = t < CLAW_RAISE ? 0 : easeIn(phase(t, CLAW_RAISE, H))
  if (t >= 2 && t < H + 3) {
    const head = lerp(from, to, swingAt)
    const tail = t < CLAW_RAISE ? lerp(from, to, -0.35 * phase(t, 2, CLAW_RAISE)) : t < H ? lerp(from, to, Math.max(0, swingAt - 0.45)) : lerp(from, to, phase(t, H - 1, H + 3))
    for (let k = 0; k < 3; k++) {
      const rr = r - 2 + k * 2
      const steps = Math.ceil(Math.abs(head - tail) * rr * 1.8) + 1
      for (let s = 0; s <= steps; s++) {
        const u = s / steps
        const ang = lerp(tail, head, u)
        const x = pivot.x + Math.cos(ang) * rr
        const y = pivot.y + Math.sin(ang) * rr
        dot(out, x, y + 1, SHADOW)
        dot(out, x, y, u > 0.8 ? WHITE : u > 0.4 ? hi : c)
      }
      // Each blade ends in a hooked tip
      const tx2 = pivot.x + Math.cos(head) * rr
      const ty2 = pivot.y + Math.sin(head) * rr
      if (t < H + 1) {
        dot(out, tx2 + Math.cos(head + g.side * 1.6), ty2 + Math.sin(head + g.side * 1.6), lit)
        dot(out, tx2 + Math.cos(head + g.side * 1.6) * 2, ty2 + Math.sin(head + g.side * 1.6) * 2, deep)
      }
    }
  }
  // Three gashes glow on the target, then smoke away
  const age = t - H
  if (age >= 0 && age < 16) {
    const fade = phase(age, 8, 16)
    for (let k = 0; k < 3; k++) {
      const x0 = tx - g.side * 5 + g.side * k * 3
      const y0 = ty - 5 - k
      const x1 = x0 + g.side * 5
      const y1 = y0 + 8
      if (fade > 0.4 && (k + t) % 2) continue
      line(out, x0 + g.side, y0, x1 + g.side, y1, SHADOW)
      line(out, x0, y0, x1, y1, age < 2 ? WHITE : fade < 0.3 ? hi : c)
    }
  }
  emit(t, { count: 8, gap: 1, start: H + 4, life: 9 }, (i, k, f) => {
    const x = tx + (rnd(a.seed, i, 1) - 0.5) * 8 + Math.sin(k * 0.6 + i)
    const y = ty - 2 + (rnd(a.seed, i, 2) - 0.5) * 6 - k * 0.6
    if (y > 0) murk(out, x, y, 0.6 + 0.8 * Math.sin(Math.PI * f), c, a.seed + i)
  })
}

const FORCE_VANISH = 12
const FORCE_RIFT = 24
const FORCE_OUT = 32
const FORCE_HIT = 34
const FORCE_FADE = 42
const FORCE_HOME = 48

// A jagged vertical tear in the air, open by f, dark inside with a burning edge
function rift(out, x, y0, y1, f, t, c, a) {
  const [hi, lit] = ramp(c)
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    const u = (y - y0) / Math.max(1, y1 - y0)
    const w = f * 2.5 * Math.sin(Math.PI * u)
    const jag = Math.round((rnd(a.seed, y, 77) - 0.5) * 2)
    const cx = x + jag
    for (let d = -Math.ceil(w); d <= Math.ceil(w); d++) dot(out, cx + d, y, SHADOW)
    dot(out, cx - Math.ceil(w) - 1, y, (y + t) % 3 ? lit : hi)
    dot(out, cx + Math.ceil(w) + 1, y, (y + t) % 3 ? lit : hi)
  }
}

// Gather darkness and vanish, leaving shadows drifting across the strip, tear a rift
// open by the target, burst out of it in a crushing blow, then fade and return home
function shadowforce(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const front = g.side > 0 ? g.right : g.left
  const far = clamp(Math.abs(tx - front) - 3, 0, 16)
  const sink = phase(t, 0, FORCE_VANISH)
  if (t < FORCE_VANISH) {
    out.shade = haunt(g, out, sink, lit, SHADOW, EYE)
    if (t >= 6) out.dx = tremble(t)
    halo(out, g, t, t % 4 < 2 ? c : deep, out.dx)
  } else if (t < FORCE_OUT) {
    out.hidden = true
  } else if (t < FORCE_FADE + 4) {
    out.dx = g.side * far
    out.dy = t === FORCE_OUT ? -2 : t === FORCE_OUT + 1 ? -1 : 0
    if (t >= FORCE_OUT && t < FORCE_HIT) {
      out.sx = 1.12
      out.sy = 1.12
    }
    out.shade = haunt(g, out, 0.9, hi, SHADOW, EYE)
    if (t >= FORCE_FADE && t % 2 === 0) out.hidden = true
  } else if (t < FORCE_HOME) {
    out.hidden = true
  } else {
    const back2 = phase(t, FORCE_HOME, FORCE_HOME + 10)
    if (t < FORCE_HOME + 4 && t % 2 === 0) out.hidden = true
    out.shade = haunt(g, out, 0.9 * (1 - back2), lit, SHADOW, EYE)
  }

  // Shadows spiral in, then burst away as the body vanishes
  emit(t, { count: 14, gap: 0.7, start: 0, life: 5 }, (i, age, f) => {
    if (t >= FORCE_VANISH) return
    const ang = rnd(a.seed, i) * TAU + f * 2
    const d = (g.right - g.left) * 0.8 * (1 - easeIn(f)) + 2
    dot(out, g.cx + Math.cos(ang) * d, g.cy + Math.sin(ang) * d * 0.8, f < 0.5 ? deep : lit)
  })
  emit(t, { count: 8, gap: 0, start: FORCE_VANISH, life: 8 }, (i, k, f) => {
    const ang = (i / 8) * TAU
    murk(out, g.cx + Math.cos(ang) * k * 1.2, g.cy + Math.sin(ang) * k * 0.9, 2 * (1 - f) + 0.6, c, a.seed + i)
  })
  // While gone, wisps cross the strip and a shadow creeps over the ground
  if (t >= FORCE_VANISH + 2 && t < FORCE_OUT) {
    for (let i = 0; i < 4; i++) {
      const f = ((t - FORCE_VANISH) * 0.05 + rnd(a.seed, i, 9)) % 1
      const x = lerp(g.cx, tx, f) + Math.sin(t * 0.3 + i) * 2
      const y = 3 + rnd(a.seed, i, 10) * (g.ground - 8) + Math.sin(t * 0.4 + i * 2) * 1.5
      if ((t + i) % 5) wisp(out, x, y, c, t, i)
    }
    const sx = lerp(g.cx, tx, easeInOut(phase(t, FORCE_VANISH + 2, FORCE_RIFT + 4)))
    const w = (g.right - g.left) * 0.35
    for (let d = -w; d <= w; d++) back(out, sx + d, g.ground, SHADOW)
  }
  const open = easeOut(phase(t, FORCE_RIFT, FORCE_OUT)) * (1 - phase(t, FORCE_HIT + 2, FORCE_HIT + 8))
  if (open > 0) rift(out, tx - g.side * 3, Math.max(0, ty - 12), Math.min(g.ground, ty + 6), open, t, c, a)

  // The crushing blow out of the rift
  const age = t - FORCE_HIT
  if (age >= 0 && age < 10) {
    const r = [4, 7, 9, 10, 10, 9, 8, 6, 4, 2][age]
    disc(out, tx, ty, r * 0.7, age < 2 ? WHITE : SHADOW)
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * TAU + age * 0.1
      const len = r * (k % 2 ? 0.9 : 1.3)
      dot(out, tx + Math.cos(ang) * len, ty + Math.sin(ang) * len * 0.8, age < 3 ? WHITE : k % 2 ? lit : hi)
    }
    if (age >= 2) ring(out, tx, ty, r + age, age < 5 ? lit : deep, 0, Math.PI, back)
    if (age < 5) out.shake = [[3, 1], [-3, -1], [2, 1], [-2, 0], [1, 0]][age].map((v, k) => (k ? v : v * g.side))
  }
  emit(t, { count: 10, gap: 0, start: FORCE_HIT, life: 12 }, (i, k, f) => {
    const ang = rnd(a.seed, i, 20) * TAU
    const x = tx + Math.cos(ang) * (4 + k)
    const y = ty + Math.sin(ang) * (3 + k * 0.6) - k * 0.3
    if (f < 0.8 || t % 2) murk(out, x, y, 1.2 * (1 - f) + 0.5, c, a.seed + i + 9)
  })
}

export const GHOST = {
  astonish: { ticks: 28, color: 0x9a6ad8, draw: astonish },
  curse: { ticks: 48, color: 0x9a5ad0, pose: { view: 'front' }, draw: curse },
  ominouswind: { ticks: 44, color: 0xb89ae8, draw: ominouswind },
  shadowball: { ticks: 40, color: 0x7a4ab8, draw: shadowball },
  hex: { ticks: 40, color: 0xc060e0, draw: hex },
  spite: { ticks: 40, color: 0x9a7ab8, draw: spite },
  destinybond: { ticks: 48, color: 0xb05ad8, pose: { view: 'front' }, draw: destinybond },
  grudge: { ticks: 44, color: 0x8a5ad0, pose: { view: 'front' }, draw: grudge },
  shadowpunch: { ticks: 32, color: 0x7a4ab8, draw: shadowpunch },
  nightmare: { ticks: 48, color: 0x6a4a9a, draw: nightmare },
  shadowsneak: { ticks: 32, color: 0x6a4a9a, draw: shadowsneak },
  shadowclaw: { ticks: 32, color: 0x8a5ad0, draw: shadowclaw },
  shadowforce: { ticks: 60, color: 0x6a3aa8, draw: shadowforce },
}
