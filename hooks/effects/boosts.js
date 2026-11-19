// Normal moves the mon uses on itself or its side

import {
  WHITE, back, ball, burst, clamp, dark, dot, easeIn, easeInOut, easeOut, emit, keys, lean, lerp, light, line,
  mix, phase, plus, puff, ramp, rnd, spark, sparkles, stamp, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const FAR = 99

// Overshoots a little before settling, for springy pops
const easeBack = (f) => 1 + 2.7 * (f - 1) ** 3 + 1.7 * (f - 1) ** 2

// The height of a hop f of the way through it, peaking at h pixels
const hop = (f, h) => h * 4 * f * (1 - f)

const lumaOf = (c) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255)

// Lighten a color as if lit by `glow`, sparing the dark outline so the sprite stays crisp
function screen(col, glow, f) {
  const k = f * Math.min(1, lumaOf(col) / 70)
  const ch = (s) => {
    const v = (col >> s) & 255
    return Math.round(v + (255 - v) * (((glow >> s) & 255) / 255) * k)
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

const inStrip = (g, x, y) => x >= 0 && x < g.columns && y >= 0 && y <= g.ground

// Calls fn(x, y) for each pixel just outside the sprite at its base spot
function around(g, fn) {
  for (let y = g.top - 1; y <= g.bottom; y++) {
    for (let x = g.left - 1; x <= g.right + 1; x++) {
      if (g.solid(x, y)) continue
      if (g.solid(x - 1, y) || g.solid(x + 1, y) || g.solid(x, y - 1) || g.solid(x, y + 1)) fn(x, y)
    }
  }
}

// Pixel art with a dark edge all round, so it reads on any background
function outlined(out, x, y, art, palette, edge, flip = false, paint = dot) {
  const shadow = Object.fromEntries(Object.keys(palette).map((k) => [k, edge]))
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stamp(out, x + ox, y + oy, art, shadow, flip, paint)
  stamp(out, x, y, art, palette, flip, paint)
}

// A flat ellipse lying on the ground, for rings around the feet
function flatRing(out, cx, y, r, c, paint = dot) {
  const steps = Math.max(12, Math.ceil(r * 7))
  for (let k = 0; k < steps; k++) {
    const angle = (k / steps) * TAU
    paint(out, cx + r * Math.cos(angle), y + r * 0.25 * Math.sin(angle), c)
  }
}

// A random pixel on the body, kept a little in from its edges where it can
function solidPoint(g, seed, i) {
  for (let k = 0; k < 40; k++) {
    const x = g.left + Math.floor(rnd(seed, i, 300 + k * 2) * (g.right - g.left + 1))
    const y = g.top + Math.floor(rnd(seed, i, 301 + k * 2) * (g.bottom - g.top + 1))
    if (g.solid(x, y) && (k > 25 || (g.solid(x - 1, y) && g.solid(x + 1, y) && g.solid(x, y - 1)))) return { x, y }
  }
  return { x: g.cx, y: g.cy }
}

const width = (g) => g.right - g.left + 1
const height = (g) => g.bottom - g.top + 1

// Two up chevrons stacked, the stat up sign
function chevrons(out, x, y, c, edge) {
  for (const [dy, col] of [[0, c], [2, edge]]) {
    line(out, x - 2, y + dy + 2, x, y + dy, col)
    line(out, x, y + dy, x + 2, y + dy + 2, col)
  }
  dot(out, x, y, WHITE)
}

const PROTECT_UP = 5
const PROTECT_HITS = [14, 23]
const PROTECT_POP = 32

// Brace and snap a round bubble shield over the whole body. A glint circles its rim,
// two blows ping off the front and ripple across it, then it pops into flecks.
function protect(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const brace = keys(t, [[0, 0], [PROTECT_UP, 1], [PROTECT_POP, 1], [PROTECT_POP + 5, 0]])
  out.sx = 1 - 0.05 * brace
  out.sy = 1 - 0.04 * brace
  const ping = PROTECT_HITS.map((h) => t - h).find((age) => age >= 0 && age < 6)
  if (ping === 0 || ping === 1) {
    out.dx = -g.side
    out.shake = [ping ? 0 : -g.side, 0]
  }
  const open = easeBack(phase(t, PROTECT_UP, PROTECT_UP + 5))
  if (open <= 0 || t >= PROTECT_POP + 5) {
    shatter(out, t - PROTECT_POP - 3, a, g, c)
    return
  }
  const cx = (g.left + g.right + 1) / 2
  const cy = (g.top + g.bottom + 1) / 2
  const flex = ping !== undefined && ping < 2 ? 0.92 : 1
  const popping = t >= PROTECT_POP
  const grow = popping ? 1 + 0.06 * (t - PROTECT_POP) : 1
  const rx = (width(g) / 2 + 3) * open * flex * grow
  const ry = (height(g) / 2 + 3) * open * grow
  const th = 1.6 / Math.max(1, Math.min(rx, ry))
  const px = cx + g.side * rx
  const py = cy - ry * 0.2
  const glint = t * 0.35
  out.shade = (x, y, col) => mix(col, lit, popping ? 0.3 : 0.12)
  for (let y = Math.floor(cy - ry) - 1; y <= Math.min(g.ground, cy + ry); y++) {
    for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx); x++) {
      if (!inStrip(g, x, y)) continue
      const u = x + 0.5 - cx
      const v = y + 0.5 - cy
      const e = Math.hypot(u / rx, v / ry)
      if (e > 1) continue
      if (e > 1 - th) {
        if (popping && (x + y + t) % 2) continue
        const ang = Math.atan2(v, u)
        const off = Math.abs((((ang - glint) % TAU) + TAU) % TAU - Math.PI)
        const wave = ping === undefined ? FAR : Math.abs(Math.hypot(x - px, y - py) - ping * 2.5)
        let col = e > 1 - th / 2 ? (u + v < -rx * 0.4 ? hi : c) : lit
        if (off > Math.PI - 0.4 || wave < 1.2) col = WHITE
        else if (wave < 2.4) col = hi
        dot(out, x, y, col)
      } else if (e > 0.6 && ((x + y) % 6 === 0 || (x - y + 600) % 6 === 0)) {
        back(out, x, y, e > 0.85 ? c : deep)
      }
    }
  }
  if (ping !== undefined && ping < 4) {
    burst(out, px + g.side, py, [4, 3, 2, 1][ping], c)
    for (let k = 0; k < 3; k++) dot(out, px + g.side * (2 + ping * 1.5), py + (k - 1) * (1 + ping), ping < 2 ? WHITE : lit)
  }
}


// Bubble flecks flung out when the shield pops
function shatter(out, age, a, g, c) {
  if (age < 0) return
  const cx = g.cx + 0.5
  const cy = (g.top + g.bottom + 1) / 2
  emit(age, { count: 14, gap: 0, life: 8 }, (i, life, f) => {
    const ang = (i / 14) * TAU + rnd(a.seed, i, 40) * 0.4
    const r = width(g) / 2 + 3 + life * (0.9 + rnd(a.seed, i, 41) * 0.6)
    const x = cx + Math.cos(ang) * r
    const y = cy + Math.sin(ang) * r * 0.9 + life * life * 0.06
    if (y > g.ground || (f > 0.6 && life % 2)) return
    dot(out, x, y, f < 0.4 ? WHITE : light(c, 0.3))
    if (f < 0.5) dot(out, x + 1, y, dark(c, 0.3))
  })
}

const GROW_SPURTS = [6, 15, 24]
const GROW_HOLD = 34

// Grow taller in three springy spurts, each with a green glow, sprouts shooting up
// from the ground at its feet and sap motes rising, then ease back down
function growth(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  let size = 0
  let glow = 0
  GROW_SPURTS.forEach((s, k) => {
    if (t >= s) {
      size = k + easeBack(phase(t, s, s + 5))
      glow = Math.max(glow, 1 - phase(t, s, s + 6))
    }
    if (t >= s - 2 && t < s) out.sy = 0.95
  })
  size *= 1 - easeInOut(phase(t, GROW_HOLD, GROW_HOLD + 7))
  out.sy *= 1 + 0.06 * size
  out.sx = 1 + 0.025 * size
  const warm = 0.1 * size + 0.5 * glow
  if (warm > 0) out.shade = (x, y, col) => screen(col, light(c, 0.4), warm)
  const wither = 1 - phase(t, GROW_HOLD + 2, GROW_HOLD + 8)
  GROW_SPURTS.forEach((s, k) => {
    const tall = Math.round((3 + k * 1.5) * easeOut(phase(t, s, s + 6)) * wither)
    if (tall <= 0) return
    for (const dir of [-1, 1]) {
      const x = dir < 0 ? g.left - 2 - k * 2 : g.right + 2 + k * 2
      if (x < 1 || x > g.columns - 2) continue
      for (let h = 0; h < tall; h++) dot(out, x, g.ground - h, h === tall - 1 ? lit : deep)
      const tip = g.ground - tall + 1
      dot(out, x - 1, tip, c)
      dot(out, x + 1, tip - 1, c)
      if (tall > 3) {
        dot(out, x + 1, tip + 2, deep)
        dot(out, x - 1, tip + 1, lit)
      }
      if (t - s < 2) dot(out, x, tip - 1, WHITE)
    }
  })
  for (const s of GROW_SPURTS) {
    const age = t - s
    if (age >= 0 && age < 6) flatRing(out, g.cx + 0.5, g.ground, width(g) / 2 + 1 + age * 1.5, age < 3 ? hi : c)
  }
  emit(t, { count: 16, gap: 1.6, start: 4, life: 10 }, (i, age, f) => {
    if (t >= GROW_HOLD + 4) return
    const x = g.left + rnd(a.seed, i) * width(g) + Math.sin(age * 0.6 + i) * 0.7
    const y = g.bottom - age * 1.6
    dot(out, x, y, f < 0.3 ? WHITE : f < 0.7 ? hi : lit)
  })
}

// A small sword: white tip, blade with a shadow edge, gold guard, dark grip
const SWORD = ['.h.', '.bs', '.bs', '.bs', '.bs', 'ggg', '.d.']
const GOLD = 0xe0b040
const GRIP = 0x5a3820
const SWORDS = 6
const DANCE_SPIN = [8, 28]
const DANCE_RISE = 28
const DANCE_CROSS = 33

// Twirl round and round in place while a ring of swords orbits the waist, then the
// swords fly up and cross above the head with a ringing flash
function swordsdance(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const palette = { h: WHITE, b: lit, s: deep, g: GOLD, d: GRIP }
  const turn = keys(t, [[DANCE_SPIN[0], 0], [DANCE_SPIN[1], 3 * TAU]], easeInOut)
  if (t >= DANCE_SPIN[0] && t < DANCE_SPIN[1]) {
    out.sx = Math.max(0.2, Math.abs(Math.cos(turn)))
    out.flipX = Math.cos(turn) < 0
    out.dy = -1
  }
  const pose = keys(t, [[DANCE_CROSS - 1, 0], [DANCE_CROSS + 1, 1], [DANCE_CROSS + 6, 1], [DANCE_CROSS + 10, 0]])
  if (pose > 0) out.sy = 1 + 0.08 * pose
  if (t >= DANCE_CROSS && t < DANCE_CROSS + 2) out.shade = (x, y, col) => screen(col, WHITE, 0.6)

  const cx = g.cx + 0.5
  const cy = g.cy + 1
  const rx = width(g) / 2 + 4
  const top = Math.max(4, g.top - 4)
  const spin = 0.3 * t + turn * 0.4
  const rise = easeIn(phase(t, DANCE_RISE, DANCE_CROSS))
  if (t < DANCE_CROSS) {
    for (let i = 0; i < SWORDS; i++) {
      const born = 2 + i * 1.2
      if (t < born) continue
      const ang = (i / SWORDS) * TAU + spin
      const x = lerp(cx + Math.cos(ang) * rx, cx, rise)
      const y = lerp(cy + Math.sin(ang) * 2.5, top, rise)
      const paint = Math.sin(ang) > 0 || rise > 0.3 ? dot : back
      if (t - born < 1) spark(out, x, y - 1, 1, hi, paint)
      else stamp(out, x - 1, y - 4, SWORD, palette, false, paint)
    }
    return
  }
  const age = t - DANCE_CROSS
  if (age > 9 && age % 2) return
  for (const dir of [-1, 1]) {
    // Each sword lies on a diagonal, its tip up and out, its grip down and in
    const tip = { x: cx + dir * 4, y: top - 4 }
    const grip = { x: cx - dir * 3, y: top + 3 }
    line(out, grip.x, grip.y, tip.x, tip.y, lit)
    line(out, grip.x + 1, grip.y, tip.x + 1, tip.y, deep)
    dot(out, tip.x, tip.y, WHITE)
    line(out, grip.x + dir * 1 - 1, grip.y - 2, grip.x + dir * 1 + 1, grip.y, GOLD)
    dot(out, grip.x - dir, grip.y + 1, GRIP)
  }
  if (age < 4) burst(out, cx, top, [3, 5, 4, 2][age], hi)
  else if (age < 10 && age % 3 === 0) spark(out, cx + (age % 2 ? 4 : -4), top - 4, 1, hi)
}

const VEIL_DROP = [3, 14]
const VEIL_LIFT = [32, 41]

// A gauzy veil of light drops over the mon from above, folds rippling and its lace hem
// swaying, glitters running down it, then it lifts away leaving a soft glow outline
function safeguard(out, t, a, g, c) {
  const [hi, lit, base, deep] = ramp(c)
  const drop = easeOut(phase(t, ...VEIL_DROP))
  const lift = easeIn(phase(t, ...VEIL_LIFT))
  const x0 = Math.max(0, g.left - 3)
  const x1 = Math.min(g.columns - 1, g.right + 3)
  const top = Math.max(0, g.top - 3)
  const hem0 = lerp(top - 2, g.ground, drop)
  const lifted = (g.ground - top + 3) * lift
  const veil = drop * (1 - lift)
  out.sy = 1 + 0.03 * veil
  if (veil > 0) out.shade = (x, y, col) => mix(col, lit, 0.2 * veil)
  if (drop > 0 && lift < 1) {
    for (let x = x0; x <= x1; x++) {
      const hem = hem0 - lifted + Math.sin(x * 0.8 + t * 0.45) * (drop < 1 ? 1.4 : 0.8)
      const fold = Math.sin((x - x0) * 1.05 + Math.sin(t * 0.15) * 1.5)
      for (let y = top; y <= Math.min(g.ground, hem); y++) {
        const edge = x === x0 || x === x1
        if (y > hem - 1) dot(out, x, y, (x + t) % 3 ? hi : WHITE)
        else if (edge) dot(out, x, y, (y + t) % 4 ? base : hi)
        else if (fold > 0.6) {
          if ((x + y) % 2 === 0) dot(out, x, y, lit)
        } else if ((x + 2 * y) % 4 === 0 || (fold < -0.3 && (x + y) % 2 === 0)) back(out, x, y, fold > -0.3 ? base : deep)
      }
    }
    emit(t, { count: 10, gap: 2, start: VEIL_DROP[1] - 2, life: 8 }, (i, age) => {
      if (t >= VEIL_LIFT[0]) return
      const x = x0 + 1 + Math.floor(rnd(a.seed, i, 3) * (x1 - x0 - 1))
      dot(out, x, top + age * 2.5, WHITE)
      dot(out, x, top + age * 2.5 - 1, hi)
    })
  }
  const glow = phase(t, VEIL_LIFT[0] + 2, VEIL_LIFT[1]) * (1 - phase(t, VEIL_LIFT[1] + 2, a.ticks - 1))
  if (glow > 0.2) around(g, (x, y) => back(out, x, y, glow > 0.7 ? hi : base))
  if (t >= VEIL_LIFT[0] && t < a.ticks - 3) sparkles(out, t, a.seed, g.cx, top + 2, x1 - x0, 6, lit, 4)
}

// An open hand, palm out, its thumb on the right
const HAND = [
  '.f.f.f..',
  '.f.f.f..',
  '.f.f.f.f',
  '.fffff.f',
  '.ffffff.',
  '.hffff..',
  '..fff...',
  '..fff...',
]
const HAND_UP = [1, 7]
const HAND_PATS = [10, 15]
const HAND_CHEER = 20

// A friendly hand rises behind the mon and pats its head twice, then the mon springs
// up in a cheer with a burst of sparkles while the hand waves off
function helpinghand(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const edge = dark(c, 0.6)
  const palette = { f: c, h: lit }
  const hx = Math.round(g.cx - 3)
  const rest = Math.max(1, g.top - 10)
  let hy = lerp(g.ground + 2, rest, easeOut(phase(t, ...HAND_UP)))
  for (const p of HAND_PATS) {
    const f = phase(t, p, p + 5)
    if (f > 0 && f < 1) hy = rest + Math.round(hop(f, 3)) + 1
    if (t >= p + 2 && t < p + 4) {
      out.sy = 0.92
      out.sx = 1.04
    }
  }
  const cheer = phase(t, HAND_CHEER, HAND_CHEER + 8)
  if (cheer > 0 && cheer < 1) {
    out.dy = -Math.round(hop(cheer, 4))
    out.sy = cheer < 0.2 ? 1.08 : 1
  }
  if (t >= HAND_CHEER + 8 && t < HAND_CHEER + 10) out.sy = 0.94
  if (t >= HAND_CHEER && t < HAND_CHEER + 3) out.shade = (x, y, col) => screen(col, hi, 0.55)
  if (t < HAND_CHEER + 10) {
    const wave = t >= HAND_CHEER ? Math.round(Math.sin((t - HAND_CHEER) * 0.9) * 2) : 0
    const away = t >= HAND_CHEER + 4 ? -(t - HAND_CHEER - 4) * 1.5 : 0
    const y = Math.round(hy + away)
    if (t < HAND_CHEER + 7 || t % 2) outlined(out, hx + wave, y, HAND, palette, edge, g.side < 0, t < HAND_PATS[0] ? back : dot)
  }
  for (const p of HAND_PATS) {
    const age = t - p - 2
    if (age >= 0 && age < 4) {
      spark(out, g.cx - 4, g.top - 1, age < 2 ? 1 : 0, hi)
      spark(out, g.cx + 5, g.top, age < 2 ? 1 : 0, hi)
    }
  }
  emit(t, { count: 10, gap: 0, start: HAND_CHEER + 1, life: 12 }, (i, age, f) => {
    const ang = -Math.PI / 2 + (i / 9 - 0.5) * 2.6
    const r = 3 + age * (0.9 + rnd(a.seed, i, 5) * 0.5)
    const x = g.cx + 0.5 + Math.cos(ang) * (width(g) / 2 + r)
    const y = g.top + height(g) * 0.4 + Math.sin(ang) * (height(g) / 2 + r) + age * age * 0.03
    if (f > 0.7 && age % 2) return
    if (f < 0.5) plus(out, x, y, i % 2 ? c : lit, WHITE)
    else dot(out, x, y, deep)
  })
}

const ENDURE_SET = 6
const ENDURE_HITS = [10, 17, 24]
const ENDURE_RISE = 29

// Plant the feet and brace while three blows slam in from the front, each one shoving
// it back and flaring red, then stand tall with a defiant red flare
function endure(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const brace = keys(t, [[0, 0], [ENDURE_SET, 1], [ENDURE_RISE, 1], [ENDURE_RISE + 3, -0.7, easeOut], [ENDURE_RISE + 9, 0]])
  out.sy = 1 - 0.1 * brace
  out.sx = 1 + 0.06 * Math.max(0, brace)
  const strain = phase(t, ENDURE_SET, ENDURE_RISE)
  if (t >= ENDURE_SET && t < ENDURE_RISE) out.dx = t % 3 ? 0 : tremble(t)
  const front = g.side > 0 ? g.right + 1 : g.left - 1
  let hit
  ENDURE_HITS.forEach((h, k) => {
    const age = t - h
    const y = g.cy - 2 + k * 2
    if (age >= -3 && age < 0) {
      const x = front + g.side * (2 - age * 3)
      line(out, x, y, x + g.side * 3, y, lit)
      dot(out, x, y, WHITE)
    }
    if (age >= 0 && age < 4) {
      hit = age
      burst(out, front + g.side, y, [4, 3, 2, 1][age], c)
    }
    // Sweat flies off the back of the head after each blow
    emit(t, { count: 2, gap: 1, start: h + 1, life: 7 }, (i, life) => {
      const x = g.cx - g.side * (2 + life * (0.8 + i * 0.5))
      const sy = g.top + 1 - life * 1.2 + life * life * 0.12
      dot(out, x, sy, 0xc8f0ff)
      dot(out, x, sy + 1, 0x4a90d8)
    })
  })
  if (hit !== undefined && hit < 2) {
    out.dx = -g.side * (2 - hit)
    out.shake = [hit ? 0 : -g.side, hit ? 0 : 1]
  }
  const rise = t - ENDURE_RISE
  if (hit === 0) out.shade = (x, y, col) => screen(col, WHITE, 0.7)
  else if (strain > 0 && rise < 6) {
    const f = 0.1 + 0.25 * strain * (t % 4 < 2 ? 1 : 0.6) + (rise >= 0 ? 0.3 * (1 - rise / 6) : 0)
    out.shade = (x, y, col) => (lumaOf(col) < 60 ? col : mix(col, c, f))
  }
  if (t === ENDURE_SET) {
    for (const s of [-1, 1]) puff(out, g.cx + s * (width(g) / 2 + 1), g.ground - 1, 1.5, 0xc8b8a0, a.seed + s)
  }
  if (rise >= 0 && rise < 8) {
    around(g, (x, y) => (rise < 5 || (x + y) % 2) && dot(out, x, y + out.dy, rise < 2 ? hi : rise < 5 ? c : deep))
    for (let k = -1; k <= 1; k++) {
      const x = g.cx + 0.5 + k * 3
      const y0 = g.top - 2 - rise
      line(out, x, y0, x + k, y0 - 2, rise < 3 ? WHITE : lit)
    }
  }
}

const BATON_TOSS = 8
const BATON_CATCH = 30
const BATON_TWIRL = [15, 23]

// A baton: a striped rod with bright knobs at both ends, turned to `angle`
function baton(out, x, y, angle, c) {
  const [hi, , , deep] = ramp(c)
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  for (let d = -4; d <= 4; d++) {
    const px = x + ux * d
    const py = y + uy * d
    if (py < 0) continue
    if (Math.abs(d) === 4) {
      dot(out, px, py, WHITE)
      dot(out, px + 1, py, hi)
      dot(out, px, py + 1, hi)
      dot(out, px + 1, py + 1, deep)
    } else {
      dot(out, px, py, d % 2 ? c : WHITE)
      dot(out, px + Math.abs(uy) * 0.9, py + Math.abs(ux) * 0.9, deep)
    }
  }
}

// Twirl a baton, fling it spinning in a high loop out in front, twirl round while it
// sails, then catch it as it comes back
function batonpass(out, t, a, g, c) {
  const fx = g.cx + 0.5 + g.side * (width(g) / 2 + 2)
  const fy = g.cy
  const room = g.side > 0 ? g.columns - 4 - fx : fx - 3
  const far = clamp(room, 4, 14)
  const high = Math.max(2, fy - 3)
  // The loop goes out low, peaks high and far, and swings back in
  const path = (f) => ({ x: fx + g.side * far * Math.sin(Math.PI * f), y: fy - high * Math.sin(Math.PI * Math.min(1, f * 1.3)) })
  if (t < BATON_TOSS) {
    out.skew = lean(g, -g.side * 2 * phase(t, 2, BATON_TOSS))
    baton(out, fx, fy, t * 0.6, c)
    if (t > 3) sparkles(out, t, a.seed, fx, fy, 6, 6, c, 2)
    return
  }
  if (t < BATON_CATCH) {
    if (t < BATON_TOSS + 3) out.skew = lean(g, g.side * 2)
    const f = phase(t, BATON_TOSS, BATON_CATCH)
    const p = path(f)
    baton(out, p.x, p.y, t * 1.1, c)
    emit(t, { count: 22, gap: 1, start: BATON_TOSS, life: 4 }, (i, age) => {
      const q = path(phase(t - age, BATON_TOSS, BATON_CATCH))
      dot(out, q.x, q.y, age < 2 ? light(c, 0.5) : c)
    })
    const twirl = phase(t, ...BATON_TWIRL)
    if (twirl > 0 && twirl < 1) {
      out.dy = -Math.round(hop(twirl, 3))
      out.sx = Math.max(0.25, Math.abs(Math.cos(twirl * TAU)))
      out.flipX = Math.cos(twirl * TAU) < 0
    }
    return
  }
  const age = t - BATON_CATCH
  if (age < 2) {
    out.sy = 0.9
    out.sx = 1.05
    out.shade = (x, y, col) => screen(col, light(c, 0.5), 0.4)
  }
  if (age < 4) burst(out, fx, fy, [3, 4, 2, 1][age], c)
  if (age < 6 || (age < 8 && age % 2)) baton(out, fx, fy, age < 4 ? 0 : (age - 4) * 0.8, c)
  if (age >= 6 && age < 9) sparkles(out, t, a.seed, fx, fy, 8, 6, c, 4)
}

// An ellipse outline, or only the arc within `spread` radians of `angle`
function oval(out, cx, cy, rx, ry, c, paint = dot, angle = 0, spread = Math.PI) {
  const steps = Math.max(8, Math.ceil(Math.max(rx, ry) * spread * 2.4))
  for (let k = 0; k <= steps; k++) {
    const ang = angle - spread + (2 * spread * k) / steps
    paint(out, cx + rx * Math.cos(ang), cy + ry * Math.sin(ang), c)
  }
}

// Every other pixel, for things breaking up as they fade
const dotted = (out, x, y, c) => (Math.round(x) + Math.round(y)) % 2 && dot(out, x, y, c)

// Where the top of the sprite shows once the frame's vertical scale and offset apply
const topNow = (g, out) => Math.round(g.bottom + 1 - height(g) * out.sy) + out.dy

const STOCK_GULPS = [8, 19, 30]
const STOCK_FREE = [39, 46]

// Where stored pip k sits: in a row above the head, or stacked beside it when the
// strip has no room above
function pipAt(g, top, k) {
  if (top - 3 >= 2) return { x: g.cx + 0.5 + (k - 1) * 4, y: top - 3 }
  return { x: clamp(g.cx + 0.5 + g.side * (width(g) / 2 + 3), 2, g.columns - 3), y: g.top + 11 - k * 4 }
}

// The three pips, the first `lit` of them glowing
function pips(out, g, top, lit, c, deep, fresh) {
  for (let k = 0; k < 3; k++) {
    const { x, y } = pipAt(g, top, k)
    if (k < lit) {
      ball(out, x, y, 1.3, c)
      if (k === lit - 1 && fresh) plus(out, x, y, light(c, 0.5), WHITE)
    } else oval(out, x, y, 1.3, 1.3, deep)
  }
}

// Gulp down three helpings of energy, orbs flying into the mouth each time and the body
// puffing up a size bigger, while pips above the head count them, then let it settle
function stockpile(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  let size = 0
  let lit = 0
  STOCK_GULPS.forEach((s, k) => {
    if (t >= s) {
      size = k + easeBack(phase(t, s, s + 4))
      lit = k + 1
    }
  })
  size *= 1 - easeInOut(phase(t, ...STOCK_FREE))
  out.sx = 1 + 0.05 * size
  out.sy = 1 + 0.035 * size
  const mx = g.cx + 0.5
  const my = g.top + height(g) * 0.4
  let fresh = false
  for (const s of STOCK_GULPS) {
    for (let i = 0; i < 3; i++) {
      const f = phase(t, s - 6 + i * 0.7, s)
      if (f <= 0 || f >= 1) continue
      const ang = -Math.PI / 2 + (i - 1) * 1.2 + rnd(a.seed, s + i, 7) * 0.3
      const r = (width(g) / 2 + 6) * (1 - easeIn(f))
      ball(out, mx + Math.cos(ang) * r, my + Math.sin(ang) * r * 0.8, f < 0.7 ? 1.6 : 1, c)
    }
    const age = t - s
    if (age === 0) out.shake = [0, 1]
    if (age >= 0 && age < 3) {
      fresh = true
      out.shade = (x, y, col) => screen(col, hi, 0.5 - age * 0.15)
    }
    if (age >= 0 && age < 5) oval(out, mx, my, 2 + age * 1.5, 1.5 + age * 1.1, age < 2 ? WHITE : c, age < 3 ? dot : dotted)
  }
  if (t >= 3 && t < STOCK_FREE[1] && (t < STOCK_FREE[0] || t % 2)) pips(out, g, topNow(g, out), lit, c, deep, fresh)
}

const SWALLOW_DROP = [3, 8]
const SWALLOW_DOWN = [9, 19]
const SWALLOW_BURST = 20
const SWALLOW_HOPS = [[30, 35], [36, 41]]

// Start puffed up with the stored pips overhead, gulp them down so a bright lump slides
// down the throat, then a warm burst spills healing drops and it bounces happily
function swallow(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const puffed = keys(t, [[0, 0], [3, 1], [SWALLOW_DOWN[0], 1], [SWALLOW_DOWN[1], 0]])
  out.sx = 1 + 0.12 * puffed
  out.sy = 1 + 0.08 * puffed
  if (t >= SWALLOW_DOWN[0] && t < SWALLOW_DOWN[0] + 3) {
    out.dy = 1
    out.sy *= 0.94
  }
  for (const [from, to] of SWALLOW_HOPS) {
    const f = phase(t, from, to)
    if (f > 0 && f < 1) out.dy = -Math.round(hop(f, 2))
  }
  const mx = g.cx + 0.5
  const top = topNow(g, out)
  if (t < SWALLOW_DOWN[0]) {
    const f = easeIn(phase(t, ...SWALLOW_DROP))
    for (let k = 0; k < 3; k++) {
      const p = pipAt(g, top, k)
      ball(out, lerp(p.x, mx, f), lerp(p.y, top + 3, f), 1.3 - 0.4 * f, c)
    }
  }
  const belly = g.top + height(g) * 0.6
  const down = phase(t, ...SWALLOW_DOWN)
  if (down > 0 && down < 1) {
    const by = lerp(top + height(g) * 0.2, g.bottom - 2, easeIn(down))
    out.shade = (x, y, col) => {
      const d = Math.abs(y - by)
      return d < 1.5 ? screen(col, WHITE, 0.7) : d < 3.5 ? screen(col, hi, 0.35) : col
    }
  }
  const age = t - SWALLOW_BURST
  if (age >= 0 && age < 3) out.shade = (x, y, col) => screen(col, hi, 0.6 - age * 0.15)
  if (age >= 0 && age < 6) oval(out, mx, belly, 3 + age * 2, 2 + age * 1.4, age < 2 ? WHITE : age < 4 ? hi : c, age < 4 ? dot : dotted)
  emit(t, { count: 12, gap: 0.3, start: SWALLOW_BURST, life: 14 }, (i, life, f) => {
    const ang = -Math.PI / 2 + (rnd(a.seed, i, 30) - 0.5) * 2.6
    const speed = 0.9 + rnd(a.seed, i, 31) * 0.6
    const x = mx + Math.cos(ang) * speed * life
    const y = belly + Math.sin(ang) * speed * life + 0.1 * life * life
    if (y > g.ground || (f > 0.7 && life % 2)) return
    dot(out, x, y, f < 0.3 ? WHITE : lit)
    dot(out, x, y + 1, f < 0.6 ? c : deep)
  })
  if (age >= 2 && age < 16) sparkles(out, t, a.seed, mx, g.cy, width(g) + 8, height(g), c, 3)
}

const PUMP_START = 4
const PUMP = 6
const PUMPS = 4
const PUMP_FLEX = PUMP_START + PUMP * PUMPS

// Pump up with four bouncing fist pumps, a pair of up chevrons rising on each and steam
// coming off the head, then a big flex that flares red
function workup(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const k = Math.floor((t - PUMP_START) / PUMP)
  if (t >= PUMP_START && k < PUMPS) {
    const f = ((t - PUMP_START) % PUMP) / PUMP
    if (f < 0.34) {
      out.sy = 0.92
      out.sx = 1.04
    } else {
      out.dy = -Math.round(hop((f - 0.34) / 0.66, 3))
      out.sy = 1.05
      out.skew = lean(g, (k % 2 ? 1 : -1) * 2)
    }
    const heat = 0.07 * (k + 1)
    out.shade = (x, y, col) => (lumaOf(col) < 60 ? col : mix(col, c, heat))
  }
  for (let p = 0; p < PUMPS; p++) {
    const age = t - (PUMP_START + p * PUMP + 2)
    if (age < 0 || age >= 9 || (age >= 6 && age % 2)) continue
    for (const dir of [-1, 1]) {
      const x = clamp(dir < 0 ? g.left - 3 : g.right + 3, 2, g.columns - 3)
      chevrons(out, x, g.cy + 2 - age * 1.4 + (dir === (p % 2 ? 1 : -1) ? 0 : 3), age < 2 ? hi : c, deep)
    }
  }
  emit(t, { count: 6, gap: 4, start: 8, life: 8 }, (i, age, f) => {
    const x = g.cx + 0.5 + (i % 2 ? 3 : -3) + Math.sin(age * 0.7 + i) * 1.2
    puff(out, x, g.top - 1 - age * 0.9, 1 + f * 0.9, mix(c, 0xeeeeee, 0.75), a.seed + i)
  })
  const flex = t - PUMP_FLEX
  if (flex >= 0) {
    const f = keys(flex, [[0, 0], [2, 1], [7, 1], [12, 0]])
    out.sx = 1 + 0.08 * f
    out.sy = 1 - 0.04 * f
    if (flex < 4) {
      out.shade = (x, y, col) => (lumaOf(col) < 60 ? col : mix(col, flex < 1 ? WHITE : c, 0.45))
      out.shake = [flex % 2 ? 1 : -1, 0]
    }
    if (flex < 6) {
      for (let r = 0; r < 8; r++) {
        const ang = (r / 8) * TAU + 0.2
        const d = width(g) / 2 + 2 + flex * 2
        const x = g.cx + 0.5 + Math.cos(ang) * d
        const y = g.cy + Math.sin(ang) * d * 0.8
        line(out, x, y, x + Math.cos(ang) * 2, y + Math.sin(ang) * 2, flex < 2 ? WHITE : flex < 4 ? hi : c)
      }
    }
  }
}

const SHOWER = [2, 14]
const SHAKE = [15, 29]
const SHINE = 30

// A shower of clean water rains down and splashes off the head, the mon shakes itself
// dry like a wet dog flinging droplets, then gleams fresh as bubbles drift up
function refresh(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const surface = (x) => {
    for (let y = g.top; y <= g.bottom; y++) if (g.solid(x, y)) return y
    return g.ground + 1
  }
  emit(t, { count: 26, gap: 0.45, start: SHOWER[0], life: 10 }, (i, age) => {
    const x = Math.round(g.left - 1 + rnd(a.seed, i, 20) * (width(g) + 2))
    const y = age * 3 - 1
    const s = surface(x)
    if (y < s) {
      dot(out, x, y, hi)
      if (y >= 1) dot(out, x, y - 1, c)
      if (y >= 2) dot(out, x, y - 2, deep)
      return
    }
    const k = Math.floor((y - s) / 3)
    if (k < 2) {
      dot(out, x - 1 - k, s - 1 - k, lit)
      dot(out, x + 1 + k, s - 1 - k, lit)
    }
  })
  const wet = phase(t, 4, 10) * (1 - phase(t, SHAKE[1] - 4, SHAKE[1]))
  if (wet > 0) out.shade = (x, y, col) => (lumaOf(col) < 60 ? col : mix(col, (x + y + (t >> 1)) % 7 ? c : WHITE, 0.28 * wet))
  if (t >= SHAKE[0] && t < SHAKE[1]) {
    const amp = 1 + 2 * (1 - phase(t, SHAKE[0] + 6, SHAKE[1]))
    out.skew = lean(g, (t % 2 ? 1 : -1) * amp)
    out.dx = t % 4 < 2 ? 0 : t % 2 ? 1 : -1
  }
  emit(t, { count: 20, gap: 0.6, start: SHAKE[0], life: 7 }, (i, age) => {
    const dir = i % 2 ? 1 : -1
    const x = (dir > 0 ? g.right : g.left) + dir * (1 + age * (1 + rnd(a.seed, i, 21)))
    const y = g.top + rnd(a.seed, i, 22) * height(g) * 0.8 - age * 0.8 + age * age * 0.15
    if (y > g.ground) return
    dot(out, x, y, hi)
    dot(out, x - dir, y, deep)
  })
  const age = t - SHINE
  if (age >= 0 && age < 3) out.shade = (x, y, col) => screen(col, WHITE, 0.45 - age * 0.15)
  emit(t, { count: 8, gap: 1.2, start: SHINE, life: 10 }, (i, life, f) => {
    const x = g.left - 2 + rnd(a.seed, i, 23) * (width(g) + 4) + Math.sin(life * 0.6 + i)
    const y = g.bottom - 2 - life * 1.1
    const r = f < 0.8 ? 1.5 : 1
    oval(out, x, y, r, r, f < 0.5 ? lit : c)
    dot(out, x - 0.5, y - 0.5, WHITE)
  })
  emit(t, { count: 4, gap: 2, start: SHINE + 1, life: 5 }, (i, life) => {
    const p = solidPoint(g, a.seed, i + 50)
    spark(out, p.x, p.y, life < 3 ? life : 4 - life, lit)
  })
}

const CLOVER = ['hl.ll', 'lllll', '.lel.', 'lllll', 'll.ll']
const CHANT_BEATS = [8, 18, 28]
const CHANT_RISE = 36

// Bow in three slow beats of a chant while four lucky clovers circle the waist,
// flashing on every beat with a ring at the feet, then they float off and gold dust falls
function luckychant(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const edge = dark(c, 0.62)
  const cx = g.cx + 0.5
  const rx = width(g) / 2 + 4
  let flash = false
  for (const b of CHANT_BEATS) {
    const age = t - b
    if (age >= 0 && age < 3) {
      out.dy = 1
      out.sy = 0.95
    }
    if (age >= 0 && age < 4) out.shade = (x, y, col) => screen(col, hi, 0.4 * (1 - age / 4))
    if (age >= 0 && age < 2) flash = true
    if (age >= 0 && age < 7) flatRing(out, cx, g.ground, width(g) / 2 + 1 + age * 1.8, age < 2 ? WHITE : age < 4 ? hi : c, age < 5 ? dot : dotted)
  }
  const palette = flash ? { h: WHITE, l: hi, e: c } : { h: WHITE, l: c, e: deep }
  for (let i = 0; i < 4; i++) {
    const born = 3 + i * 1.5
    if (t < born) continue
    const ang = (i / 4) * TAU + t * 0.13
    const rise = t >= CHANT_RISE ? (t - CHANT_RISE) ** 2 * 0.2 + (t - CHANT_RISE) : 0
    const x = cx + Math.cos(ang) * rx
    const y = g.cy + Math.sin(ang) * 2 + Math.sin(t * 0.3 + i) - rise
    if (t - born < 1) {
      spark(out, x, y, 1, c)
      continue
    }
    if (y < 1 || t >= CHANT_RISE + 7) continue
    outlined(out, x - 2, y - 2, CLOVER, palette, edge, false, Math.sin(ang) > 0 || rise > 0 ? dot : back)
  }
  emit(t, { count: 16, gap: 0.5, start: CHANT_RISE + 4, life: 10 }, (i, age) => {
    const x = g.left - 2 + rnd(a.seed, i, 24) * (width(g) + 4)
    const y = g.top - 3 + age * 1.3
    dot(out, x, y, (age + i) % 3 ? c : WHITE)
  })
}

const BERRY_RED = 0xe04060
const LEAF = 0x40a040
const LOOP_IN = [2, 8]
const BERRY_IN = [12, 22]
const BERRY_DROP = [24, 30]

// One arrow of the recycle loop: a thick arc ending in an arrowhead
function loopArrow(out, cx, cy, r, from, span, c, deep) {
  const steps = Math.max(6, Math.ceil(r * span * 1.6))
  for (let k = 0; k <= steps; k++) {
    const ang = from + (span * k) / steps
    dot(out, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, c)
    dot(out, cx + Math.cos(ang) * (r - 1), cy + Math.sin(ang) * (r - 1), deep)
  }
  const end = from + span
  const px = cx + Math.cos(end) * (r - 0.5)
  const py = cy + Math.sin(end) * (r - 0.5)
  const tx = px - Math.sin(end) * 2
  const ty = py + Math.cos(end) * 2
  line(out, px + Math.cos(end) * 1.6, py + Math.sin(end) * 1.6, tx, ty, WHITE)
  line(out, px - Math.cos(end) * 1.6, py - Math.sin(end) * 1.6, tx, ty, WHITE)
}

// A loop of three arrows whirls above the head faster and faster while a berry takes
// shape in its middle, then the berry drops into the mon with a green flash and a hop
function recycle(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const r = clamp(width(g) * 0.3, 3.5, 5)
  let lx = g.cx + 0.5
  let ly = g.top - r - 2
  if (ly < r + 1) {
    const room = g.side > 0 ? g.columns - 1 - g.right : g.left
    const dir = room >= 2 * r + 4 ? g.side : -g.side
    lx = (dir > 0 ? g.right : g.left) + dir * (r + 3)
    ly = g.top + r + 2
  }
  const grow = easeBack(phase(t, ...LOOP_IN)) * (1 - easeIn(phase(t, ...BERRY_DROP)))
  const spin = 0.12 * t + 0.012 * Math.min(t, BERRY_DROP[1]) ** 2
  if (grow > 0.1) for (let i = 0; i < 3; i++) loopArrow(out, lx, ly, r * grow, spin + (i * TAU) / 3, TAU / 3 - 0.8, c, deep)
  const reveal = phase(t, ...BERRY_IN)
  if (reveal > 0 && t < BERRY_DROP[1]) {
    const drop = easeIn(phase(t, ...BERRY_DROP))
    const bx = lerp(lx, g.cx + 0.5, drop)
    const by = lerp(ly, g.cy, drop)
    for (let y = -2; y <= 2; y++) {
      for (let x = -2; x <= 2; x++) {
        if (x * x + y * y > 4.5 || rnd(a.seed, x * 7 + y, 25) > reveal) continue
        dot(out, bx + x, by + y, x + y < -1 ? 0xffb0c0 : x + y > 1 ? dark(BERRY_RED, 0.4) : BERRY_RED)
      }
    }
    if (reveal > 0.6) {
      dot(out, bx, by - 3, LEAF)
      dot(out, bx + 1, by - 3, light(LEAF, 0.3))
    }
    if (reveal < 1) sparkles(out, t, a.seed, lx, ly, 8, 8, lit, 3)
  }
  const age = t - BERRY_DROP[1]
  if (age >= 0 && age < 3) out.shade = (x, y, col) => screen(col, lit, 0.6 - age * 0.18)
  if (age >= 0 && age < 8) {
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * TAU
      const d = 3 + age * 1.8
      spark(out, g.cx + 0.5 + Math.cos(ang) * d * 1.3, g.cy + Math.sin(ang) * d, age < 4 ? 1 : 0, age < 3 ? hi : c)
    }
  }
  const f = phase(t, BERRY_DROP[1] + 2, BERRY_DROP[1] + 8)
  if (f > 0 && f < 1) out.dy = -Math.round(hop(f, 3))
}

const HOWL_SET = 7
const HOWL_END = 28

// A thick arc of radius r and r - 1, the inner in the darker color
function arcPair(out, x, y, r, angle, spread, outer, inner, paint = dot) {
  oval(out, x, y, r, r, outer, paint, angle, spread)
  if (r > 1.5) oval(out, x, y, r - 1, r - 1, inner, paint, angle, spread)
}

// Rear up toward a pale crescent moon and howl at it, waves rolling out past the moon
// while the body quivers and flushes with each cry, then come back down
function howl(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const rear = keys(t, [[0, 0], [HOWL_SET, 1], [HOWL_END, 1], [HOWL_END + 5, 0]])
  out.sy = 1 + 0.1 * rear
  out.sx = 1 - 0.04 * rear
  if (rear > 0) out.skew = lean(g, g.side * 3 * rear)
  if (t >= HOWL_SET + 1 && t < HOWL_END) out.dx = t % 4 < 2 ? 0 : g.side
  const hx = g.cx + 0.5 + (out.skew ? out.skew(g.top) : 0) + out.dx
  const hy = topNow(g, out) + Math.round(height(g) * 0.25)
  // The cry leaves the muzzle nearly level, since the head has no room above it
  const tilt = g.side > 0 ? -0.35 : Math.PI + 0.35
  emit(t, { count: 8, gap: 2.5, start: HOWL_SET + 1, life: 11 }, (i, age, f) => {
    const r = 3 + age * 2.2
    arcPair(out, hx + g.side * 2, hy, r, tilt, 0.5 + f * 0.3, f < 0.3 ? WHITE : f < 0.6 ? hi : c, f < 0.6 ? c : deep, f < 0.7 ? dot : dotted)
  })
  if (t > HOWL_SET && t < HOWL_END && (t - HOWL_SET) % 5 < 2) out.shade = tint(hi, 0.3)
  const show = phase(t, 3, 9) * (1 - phase(t, HOWL_END + 2, HOWL_END + 8))
  if (show <= 0) return
  const mx = clamp(g.cx + g.side * (width(g) / 2 + 12), 4, g.columns - 5)
  const my = 5
  for (let y = -4; y <= 4; y++) {
    for (let x = -4; x <= 4; x++) {
      if (x * x + y * y > 17) continue
      const cut = (x - g.side * 2.2) ** 2 + (y + 1) ** 2 <= 12
      if (cut || rnd(a.seed, x * 9 + y, 26) > show) continue
      const rim = x * x + y * y > 11
      dot(out, mx + x, my + y, rim ? c : x + y < 0 ? WHITE : hi)
    }
  }
  if (show >= 1) sparkles(out, t, a.seed, mx - g.side * 4, my + 1, 10, 6, lit, 3)
}

const DRUM_BEATS = [9, 14, 19, 23, 27, 30, 33, 36]
const DRUM_PAY = 39
const BLOOD = 0xff2020

// Swell the belly and drum on it in quickening beats, each a thump with a burst and
// sound arcs, then pay the price in a hard red flash and stand pumped up and glowing hot
function bellydrum(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const bx = g.cx + 0.5
  const by = g.top + height(g) * 0.62
  const pumped = keys(t, [[DRUM_PAY, 0], [DRUM_PAY + 2, 1, easeOut], [DRUM_PAY + 6, 1], [a.ticks - 1, 0]])
  out.sx = 1 + 0.06 * phase(t, 2, 8) * (1 - phase(t, DRUM_PAY, DRUM_PAY + 3)) + 0.04 * pumped
  out.sy = 1 + 0.08 * pumped
  DRUM_BEATS.forEach((b, k) => {
    const age = t - b
    if (age === 0) {
      out.sx += 0.05
      out.sy -= 0.05
      out.shake = [0, 1]
      out.skew = lean(g, k % 2 ? 1 : -1)
    }
    if (age >= 0 && age < 3) {
      burst(out, bx, by, [4, 3, 2][age], age ? c : hi)
      oval(out, bx, by, 2 + age * 1.5, 1.5 + age, age ? lit : WHITE, age < 2 ? dot : dotted)
    }
    if (age >= 1 && age < 5) {
      for (const dir of [-1, 1]) {
        const x = bx + dir * (width(g) / 2 + age * 1.5)
        oval(out, x, by, 2, 2.5, age < 3 ? lit : deep, dot, dir > 0 ? 0 : Math.PI, 0.9)
        oval(out, x + dir, by, 3, 3.5, age < 3 ? c : deep, dotted, dir > 0 ? 0 : Math.PI, 0.8)
      }
    }
  })
  const beats = DRUM_BEATS.filter((b) => t >= b).length
  const pay = t - DRUM_PAY
  if (pay >= 0 && pay < 3) {
    out.shade = tint(BLOOD, 0.55 - pay * 0.12)
    out.shake = [pay % 2 ? -2 : 2, pay === 0 ? 1 : 0]
  } else if (pumped > 0.2) {
    out.shade = (x, y, col) => (lumaOf(col) < 60 ? col : mix(col, c, 0.25 * pumped))
    if (pumped > 0.5) around(g, (x, y) => back(out, x, y, (x + y + t) % 3 ? c : hi))
  } else if (beats > 0) out.shade = (x, y, col) => mix(col, c, 0.04 * beats)
  if (pay >= 0 && pay < 6) {
    const r = 3 + pay * 2.5
    oval(out, bx, g.cy, r * 1.2, r, pay < 2 ? WHITE : pay < 4 ? BLOOD : dark(BLOOD, 0.3), pay < 4 ? dot : dotted)
  }
}

const CAMO_SPREAD = [5, 15]
const CAMO_FADE = [15, 24]
const CAMO_SHOW = [29, 35]
const CAMO_WASH = [34, 42]
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16

// Crouch low while a blotchy camouflage pattern creeps up the body from the feet, fade
// half away into the scenery among falling leaves, then pop back and wash clean
function camouflage(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const blotch = [dark(c, 0.45), c, light(c, 0.3)]
  const low = keys(t, [[0, 0], [4, 1], [CAMO_SHOW[0], 1], [CAMO_SHOW[0] + 3, -0.4], [CAMO_SHOW[0] + 7, 0]])
  out.sy = 1 - 0.06 * low
  out.sx = 1 + 0.03 * Math.max(0, low)
  if (t < 5) out.dx = t % 2 ? g.side : 0
  const creep = lerp(g.bottom + 1, g.top - 1, easeInOut(phase(t, ...CAMO_SPREAD)))
  const wash = lerp(g.top - 1, g.bottom + 2, phase(t, ...CAMO_WASH))
  const vanish = 0.6 * phase(t, ...CAMO_FADE) * (1 - phase(t, ...CAMO_SHOW))
  if (t >= CAMO_SPREAD[0] && t < CAMO_WASH[1]) {
    out.shade = (x, y, col) => {
      if (vanish > 0 && bayer(x, y) < vanish) return null
      if (y < creep || y < wash) return col
      if (lumaOf(col) < 60) return dark(c, 0.7)
      const n = rnd(a.seed, (x >> 1) * 53 + (y >> 1) * 7, 27)
      return blotch[n < 0.33 ? 0 : n < 0.66 ? 1 : 2]
    }
  }
  if (t >= CAMO_SPREAD[0] && t < CAMO_SPREAD[1]) {
    for (let x = g.left - 1; x <= g.right + 1; x++) if ((x + t) % 3 === 0) dot(out, x, creep, lit)
  }
  emit(t, { count: 8, gap: 2.5, start: CAMO_FADE[0] - 4, life: 14 }, (i, life) => {
    const x = g.left - 3 + rnd(a.seed, i, 28) * (width(g) + 6) + Math.sin(life * 0.5 + i) * 2
    const y = g.top - 2 + life * 1.3
    if (y > g.ground) return
    const tip = Math.sin(life * 0.5 + i) > 0 ? 1 : -1
    dot(out, x, y, i % 2 ? c : lit)
    dot(out, x + tip, y - 1, deep)
  })
  const pop = t - CAMO_SHOW[0]
  if (pop >= 0 && pop < 4) for (const dir of [-1, 1]) spark(out, g.cx + dir * (width(g) / 2 + 2), g.cy - 2, pop < 2 ? 2 : 1, lit)
}

// A bell: k dark rim, b the color, h shine, s shade on its right
const BELL = [
  '...kk...',
  '..kbbk..',
  '.kbhbsk.',
  '.kbhbsk.',
  '.kbhbsk.',
  'kbhbbbsk',
  'kkkkkkkk',
]
const BELL_IN = [0, 6]
const BELL_OUT = [38, 45]
const BELL_SWING = 10
const BELL_DINGS = [9, 14, 19, 24, 29, 34]

// A golden bell drops in above the mon and swings, every ring sending out a chime ring
// and sparkles that rain down on the mon, warming it, then it lifts away
function healbell(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const palette = { k: dark(c, 0.6), b: c, h: WHITE, s: deep }
  const room = g.top - 9 >= 1
  const bx = room ? g.cx + 0.5 : clamp(g.cx + 0.5 + g.side * (width(g) / 2 + 6), 5, g.columns - 5)
  const rest = room ? g.top - 9 : 2
  const by = lerp(-8, rest, easeBack(phase(t, ...BELL_IN))) - 12 * easeIn(phase(t, ...BELL_OUT))
  const swing = Math.cos(((t - BELL_DINGS[0]) * TAU) / BELL_SWING) * phase(t, 4, BELL_DINGS[0]) * (1 - phase(t, BELL_OUT[0] - 4, BELL_OUT[0]))
  for (let r = 0; r < BELL.length; r++) {
    const y = Math.round(by) + r
    if (y < 0) continue
    stamp(out, Math.round(bx - 4 + swing * r * 0.4), y, [BELL[r]], palette)
  }
  const ly = Math.round(by) + BELL.length
  if (ly >= 0) {
    dot(out, bx - 0.5 + swing * 2 - swing * 1.2, ly, deep)
    dot(out, bx + 0.5 + swing * 2 - swing * 1.2, ly, deep)
  }
  const cx = bx + swing * 1.4
  const cy = by + 3
  let warm = 0
  for (const d of BELL_DINGS) {
    const age = t - d
    if (age >= 0 && age < 7) oval(out, cx, cy, 4 + age * 1.8, 3 + age * 1.3, age < 2 ? WHITE : age < 4 ? hi : c, age < 4 ? dot : dotted)
    if (age >= 2 && age < 6) warm = Math.max(warm, 0.4 * (1 - (age - 2) / 4))
  }
  if (warm > 0) out.shade = (x, y, col) => screen(col, hi, warm)
  emit(t, { count: 18, gap: 1.4, start: BELL_DINGS[0], life: 10 }, (i, life, f) => {
    if (t >= BELL_OUT[0] + 2) return
    const x = lerp(cx, g.left + rnd(a.seed, i, 29) * width(g), f) + Math.sin(life * 0.8 + i)
    const y = lerp(cy + 3, g.top + rnd(a.seed, i, 31) * height(g), easeIn(f))
    if (f < 0.6) plus(out, x, y, lit, WHITE)
    else dot(out, x, y, f < 0.85 ? hi : c)
  })
}

const SMASH_CRACKS = 5
const SMASH_CRACK_AT = 8
const SMASH_CRACK_GAP = 4
const SMASH_BURST = 30

// The set of body pixels the cracks have reached at t, as x * 1000 + y keys
function cracks(g, seed, t) {
  const hit = new Set()
  for (let k = 0; k < SMASH_CRACKS; k++) {
    const len = Math.min(14, (t - SMASH_CRACK_AT - k * SMASH_CRACK_GAP) * 3)
    if (len <= 0) continue
    let { x, y } = solidPoint(g, seed, k + 70)
    let dir = rnd(seed, k, 32) * TAU
    for (let s = 0; s < len; s++) {
      if (g.solid(Math.round(x), Math.round(y))) hit.add(Math.round(x) * 1000 + Math.round(y))
      dir += (rnd(seed, k * 31 + s, 33) - 0.5) * 1.6
      x += Math.cos(dir)
      y += Math.sin(dir)
    }
  }
  return hit
}

// Encased in a stony shell, cracks spread across the body one after another with a jolt
// each, light starts leaking through them, then the shell bursts apart in chunks and
// the mon springs out with red hot streaks rising
function shellsmash(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const hot = mix(c, 0xff4a20, 0.7)
  const shell = phase(t, 0, 6)
  if (t < SMASH_BURST) {
    const hit = cracks(g, a.seed, t)
    const leak = phase(t, SMASH_BURST - 6, SMASH_BURST)
    const jolt = (t - SMASH_CRACK_AT) % SMASH_CRACK_GAP === 0 && t >= SMASH_CRACK_AT && t < SMASH_CRACK_AT + SMASH_CRACKS * SMASH_CRACK_GAP
    out.sy = 1 - 0.06 * shell
    out.dx = jolt ? g.side : t > SMASH_BURST - 6 ? tremble(t) : 0
    if (jolt) out.shake = [0, 1]
    out.shade = (x, y, col) => {
      if (hit.has((x - out.dx) * 1000 + y)) return leak > 0 ? (t % 2 ? WHITE : hot) : 0x2a2018
      if (hit.has((x - out.dx - 1) * 1000 + y)) return leak > 0 ? hot : WHITE
      return lumaOf(col) < 60 ? dark(c, 0.6) : mix(col, c, 0.55 * shell)
    }
    if (leak > 0) sparkles(out, t, a.seed, g.cx, g.cy, width(g), height(g), hot, 3)
    return
  }
  const age = t - SMASH_BURST
  out.sx = keys(age, [[0, 1.14], [4, 0.96], [8, 1]])
  out.sy = keys(age, [[0, 1.14], [4, 0.96], [8, 1]])
  if (age < 2) out.shade = (x, y, col) => screen(col, WHITE, 0.8)
  else if (age < 8) out.shade = (x, y, col) => (lumaOf(col) < 60 ? col : mix(col, hot, 0.3 * (1 - age / 8)))
  if (age < 6) out.shake = [age % 2 ? -2 : 2, age < 2 ? 1 : 0]
  emit(age, { count: 18, gap: 0, life: 14 }, (i, life, f) => {
    const p = solidPoint(g, a.seed, i + 90)
    const ang = Math.atan2(p.y - g.cy - 2, p.x - g.cx) + (rnd(a.seed, i, 34) - 0.5) * 0.6
    const speed = 1 + rnd(a.seed, i, 35) * 1.2
    const x = p.x + Math.cos(ang) * speed * life
    const y = Math.min(g.ground, p.y + Math.sin(ang) * speed * life - 1.2 * life + 0.2 * life * life)
    if (f > 0.75 && life % 2) return
    dot(out, x, y, f < 0.3 ? lit : c)
    dot(out, x + 1, y, deep)
    dot(out, x, y - 1, hi)
    if (i % 3 === 0) dot(out, x + 1, y - 1, c)
  })
  emit(age, { count: 12, gap: 0.8, start: 1, life: 6 }, (i, life) => {
    const x = g.left - 2 + rnd(a.seed, i, 36) * (width(g) + 4)
    const y = g.bottom - rnd(a.seed, i, 37) * height(g) * 0.5 - life * 2
    line(out, x, y, x, y + 2, life < 3 ? hot : dark(hot, 0.3))
    dot(out, x, y - 1, WHITE)
  })
}

const SLUMP = [0, 10]
const SLACK_GETUP = [34, 42]
const SLACK_SIGHS = [12, 25]

// Flop down in a lazy slump, leaning over, sighing out soft puffs while slow healing
// bubbles drift up, then lazily stretch back up
function slackoff(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const slump = easeInOut(phase(t, ...SLUMP)) * (1 - easeInOut(phase(t, ...SLACK_GETUP)))
  const stretch = Math.sin(Math.PI * phase(t, SLACK_GETUP[1] - 3, SLACK_GETUP[1] + 4))
  const breath = Math.sin(t * 0.35) * phase(t, SLUMP[1] - 2, SLUMP[1] + 2) * (1 - phase(t, ...SLACK_GETUP))
  out.sy = 1 - 0.16 * slump + 0.025 * breath + 0.06 * stretch
  out.sx = 1 + 0.1 * slump - 0.03 * stretch
  if (slump > 0) out.skew = lean(g, -g.side * 3 * slump)
  const calm = slump * 0.18
  if (calm > 0) out.shade = (x, y, col) => screen(col, lit, calm + 0.08 * Math.max(0, breath))
  for (const s of SLACK_SIGHS) {
    emit(t, { count: 3, gap: 1.2, start: s, life: 10 }, (i, life, f) => {
      const x = g.cx + 0.5 - g.side * (width(g) * 0.25 + 3 + life * 0.6)
      const y = g.top + height(g) * 0.35 - life * 0.7 + i
      puff(out, x, y, 1.2 + f * 1.2, mix(c, 0xf0f0f0, 0.6), a.seed + s + i)
    })
  }
  emit(t, { count: 9, gap: 2.6, start: 8, life: 14 }, (i, life, f) => {
    if (t >= SLACK_GETUP[1]) return
    const x = g.left + rnd(a.seed, i, 38) * width(g) + Math.sin(life * 0.3 + i) * 1.2
    const y = g.bottom - 2 - life * 0.55
    if (f < 0.85) {
      oval(out, x, y, 1.5, 1.5, f < 0.5 ? c : deep)
      dot(out, x - 0.5, y - 0.5, f < 0.5 ? WHITE : hi)
    } else plus(out, x, y, lit, WHITE)
  })
}

const STITCH = 0x4a3428
const SUB_POOF = 5
const SUB_HOPS = [[13, 20], [23, 30]]
const SUB_BACK = 36

// A smoky poof cloud around the body
function poof(out, age, a, g, c) {
  emit(age, { count: 9, gap: 0.2, life: 8 }, (i, life, f) => {
    const ang = (i / 9) * TAU + rnd(a.seed, i, 39)
    const d = (width(g) / 2) * (0.4 + 0.7 * easeOut(f))
    const x = g.cx + 0.5 + Math.cos(ang) * d
    const y = g.cy + 2 + Math.sin(ang) * d * 0.7 - life * 0.3
    puff(out, x, y, 3.2 * Math.sin(Math.PI * Math.min(1, f * 1.1 + 0.1)), c, a.seed + i)
  })
}

// Vanish in a poof and leave a stitched plush doll of itself, which hops stiffly about
// on the spot, then another poof brings the real mon back
function substitute(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const smoke = mix(c, 0xb8b0a8, 0.5)
  const doll = t >= SUB_POOF + 2 && t < SUB_BACK + 2
  if (t < SUB_POOF) {
    out.sy = 1 - 0.06 * phase(t, 0, SUB_POOF)
    out.sx = 1 + 0.03 * phase(t, 0, SUB_POOF)
  }
  if (doll) {
    const seam = Math.round(g.cx)
    out.shade = (x, y, col) => {
      const l = lumaOf(col)
      if (l < 60) return STITCH
      if (x - out.dx === seam && y % 2 === 0) return deep
      return mix(dark(c, 0.25), light(c, 0.45), l / 255)
    }
    let hopping = false
    SUB_HOPS.forEach(([from, to], k) => {
      const f = phase(t, from, to)
      if (f > 0 && f < 1) {
        hopping = true
        out.dy = -Math.round(hop(f, 3))
        out.skew = lean(g, (k ? 1 : -1) * 1.5)
      }
    })
    if (!hopping) out.skew = lean(g, Math.sin(t * 0.5) * 0.8)
    for (const [dx, dy] of [[-0.25, 0.3], [0.2, 0.6]]) {
      const x = Math.round(g.cx + dx * width(g)) + out.dx
      const y = Math.round(g.top + dy * height(g)) + out.dy
      dot(out, x - 1, y - 1, STITCH)
      dot(out, x + 1, y + 1, STITCH)
      dot(out, x + 1, y - 1, STITCH)
      dot(out, x - 1, y + 1, STITCH)
    }
  }
  if (t >= SUB_BACK + 2 && t < SUB_BACK + 4) out.shade = (x, y, col) => screen(col, lit, 0.5)
  if (t >= SUB_POOF) poof(out, t - SUB_POOF, a, g, smoke)
  if (t >= SUB_BACK) poof(out, t - SUB_BACK, a, g, smoke)
}

const STAR = ['..w..', '..y..', 'wyyyw', '.yyy.', '.y.y.']
const WISH_UP = [5, 13]
const WISH_FALL = [27, 37]

// A five point star with a white heart and shaded points
function star(out, x, y, c) {
  const [hi, , , deep] = ramp(c)
  for (const [ox, oy] of [[1, 0], [0, 1]]) stamp(out, x - 2 + ox, y - 2 + oy, STAR, { w: deep, y: deep })
  stamp(out, x - 2, y - 2, STAR, { w: hi, y: c })
  dot(out, x, y, WHITE)
}

// Clasp and look up as a twinkling star rises off the head and winks out in the sky,
// wait while the sky twinkles, then the star falls back on a long trail and bursts over the mon
function wish(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const hope = keys(t, [[0, 0], [4, 1], [WISH_FALL[1], 1], [WISH_FALL[1] + 4, 0]])
  out.sy = 1 + 0.04 * hope
  out.dy = -Math.round(hope)
  const sx = g.cx + 0.5
  const crown = Math.max(3, topNow(g, out) + 1)
  const sky = { x: clamp(sx + g.side * 9, 3, g.columns - 4), y: 2 }
  const up = easeOut(phase(t, ...WISH_UP))
  if (t >= WISH_UP[0] && t < WISH_UP[1]) {
    trail(out, (f) => ({ x: lerp(sx, sky.x, f), y: lerp(crown, sky.y, f) }), up, 0.06, c)
    star(out, lerp(sx, sky.x, up), lerp(crown, sky.y, up), c)
  }
  const gone = t - WISH_UP[1]
  if (gone >= 0 && gone < 4) spark(out, sky.x, sky.y, [3, 2, 1, 1][gone], c)
  if (t >= WISH_UP[1] + 3 && t < WISH_FALL[0]) sparkles(out, t, a.seed, g.columns / 2, 3, g.columns - 6, 4, lit, 4)
  const from = { x: clamp(sx + g.side * 16, 3, g.columns - 4), y: 1 }
  const fall = easeIn(phase(t, ...WISH_FALL))
  if (t >= WISH_FALL[0] && t < WISH_FALL[1]) {
    // The fall bows upward a little so it reads as a shooting star, not a dropped stone
    const path = (f) => ({ x: lerp(from.x, sx, f), y: lerp(from.y, crown, f) - Math.sin(Math.PI * f) * 2 })
    trail(out, path, fall, 0.05, c)
    const p = path(fall)
    star(out, p.x, p.y, c)
  }
  const age = t - WISH_FALL[1]
  if (age >= 0 && age < 4) {
    burst(out, sx, crown, [3, 5, 4, 2][age], c)
    out.shade = (x, y, col) => screen(col, hi, 0.6 - age * 0.12)
  }
  emit(t, { count: 6, gap: 0, start: WISH_FALL[1], life: 10 }, (i, life, f) => {
    const ang = -Math.PI / 2 + (i / 5 - 0.5) * 3
    const x = sx + Math.cos(ang) * life * 1.2
    const y = crown + Math.sin(ang) * life * 1.1 + life * life * 0.06
    if (f < 0.6) spark(out, x, y, 1, c)
    else if (life % 2) dot(out, x, y, deep)
  })
}

// Glitter left behind along path, back from f in steps of `step`
function trail(out, path, f, step, c) {
  const [hi, , , deep] = ramp(c)
  for (let k = 1; k <= 8; k++) {
    if (f - k * step < 0) break
    const p = path(f - k * step)
    dot(out, p.x, p.y, k < 3 ? WHITE : k < 6 ? hi : c)
    if (k % 2) dot(out, p.x, p.y + 1, deep)
  }
}

const ACU_POINTS = 4
const ACU_FIRST = 6
const ACU_GAP = 6
const ACU_LINK = 30
const ACU_BURST = 35

// Needles of light jab four pressure points on the body one by one, each twitching the
// mon and leaving a glowing point, then the points link up and burst together
function acupressure(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const pts = Array.from({ length: ACU_POINTS }, (_, i) => solidPoint(g, a.seed, i + 110))
  pts.forEach((p, i) => {
    const age = t - ACU_FIRST - i * ACU_GAP
    const ang = rnd(a.seed, i, 41) * TAU
    if (age >= -3 && age < 0) {
      const d = 2 - age * 2.5
      const x = p.x + Math.cos(ang) * d
      const y = p.y + Math.sin(ang) * d * 0.8
      line(out, x, y, x + Math.cos(ang) * 4, y + Math.sin(ang) * 3.2, lit)
      dot(out, x, y, WHITE)
    }
    if (age === 0) {
      out.dx = Math.cos(ang) > 0 ? -1 : 1
      out.sy = 0.96
      out.shade = (x, y, col) => screen(col, lit, 0.35)
    }
    if (age >= 0 && age < 5) oval(out, p.x, p.y, 1 + age, 1 + age * 0.8, age < 2 ? WHITE : c, age < 3 ? dot : dotted)
    if (age >= 0 && t < ACU_BURST + 3) {
      const on = (t + i * 2) % 6 < 3
      plus(out, p.x, p.y, on ? c : deep, on ? WHITE : hi)
    }
  })
  if (t >= ACU_LINK && t < ACU_BURST) {
    const f = phase(t, ACU_LINK, ACU_BURST - 1)
    for (let i = 0; i < ACU_POINTS - 1; i++) {
      const p = pts[i]
      const q = pts[i + 1]
      const x = lerp(p.x, q.x, f)
      const y = lerp(p.y, q.y, f)
      line(out, p.x, p.y, x, y, hi)
      dot(out, x, y, WHITE)
    }
  }
  const age = t - ACU_BURST
  if (age >= 0 && age < 3) {
    out.shade = (x, y, col) => screen(col, hi, 0.6 - age * 0.15)
    for (const p of pts) burst(out, p.x, p.y, [3, 4, 2][age], c)
  }
  if (age >= 2 && age < 10 && (age < 7 || age % 2)) {
    for (const dir of [-1, 1]) chevrons(out, clamp(g.cx + 0.5 + dir * (width(g) / 2 + 3), 2, g.columns - 3), g.cy - age, age < 4 ? hi : c, deep)
  }
}

const CONV_FLICKER = 4
const CONV_DOWN = [4, 14]
const CONV_UP = [31, 38]

// A scanline sweeps down the body rewriting its colors into the new type's hue, with
// data bits spitting off its ends, glitch blocks flicker while it holds, then it
// scans back up to restore the mon
function conversion(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const lo = dark(c, 0.6)
  const up = light(c, 0.4)
  const restoring = t >= CONV_UP[0]
  const scan = restoring ? lerp(g.bottom + 1, g.top - 1, phase(t, ...CONV_UP)) : lerp(g.top - 1, g.bottom + 1, phase(t, ...CONV_DOWN))
  const holding = t >= CONV_DOWN[1] && t < CONV_UP[0]
  out.shade = (x, y, col) => {
    if (t < CONV_FLICKER) return t % 2 ? screen(col, WHITE, 0.35) : col
    if (y >= scan || t >= CONV_UP[1]) return col
    const l = lumaOf(col) / 255
    if (holding && rnd(a.seed, (x >> 1) * 31 + (y >> 1), t >> 1) < 0.05) return t % 2 ? WHITE : hi
    return l < 0.25 ? lo : mix(lo, up, l)
  }
  if (t >= CONV_UP[1]) out.shade = null
  const moving = (t >= CONV_DOWN[0] && t < CONV_DOWN[1]) || (t >= CONV_UP[0] && t < CONV_UP[1])
  if (!moving) return
  const y = Math.round(scan)
  for (let x = g.left - 2; x <= g.right + 2; x++) dot(out, x, y, (x + t) % 3 ? hi : WHITE)
  dot(out, g.left - 3, y, c)
  dot(out, g.right + 3, y, c)
  emit(t, { count: 12, gap: 0.8, start: restoring ? CONV_UP[0] : CONV_DOWN[0], life: 5 }, (i, life) => {
    const dir = i % 2 ? 1 : -1
    const x = (dir > 0 ? g.right + 3 : g.left - 3) + dir * life * (1 + rnd(a.seed, i, 42))
    const by = y + Math.round((rnd(a.seed, i, 43) - 0.5) * 4)
    dot(out, x, by, life < 2 ? WHITE : i % 3 ? lit : deep)
    if (i % 2) dot(out, x + 1, by, deep)
  })
}

const GLITCH_IN = [2, 10]
const GLITCH_OUT = [24, 29]
const GLITCH_SPIKES = [12, 19]
const SNAP = 29

// The mon glitches: rows tear sideways in bands, red and cyan copies split off it and
// pixels drop out and spray loose, peaking in two spikes, then it snaps back together
// with the stray pixels pulled home
function conversion2(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const spike = GLITCH_SPIKES.some((s) => t >= s && t < s + 2)
  const glitch = spike ? 1.4 : phase(t, ...GLITCH_IN) * (1 - phase(t, ...GLITCH_OUT))
  if (glitch > 0) {
    out.skew = (y) => {
      const band = y >> 2
      if (rnd(a.seed, band, t >> 1) > 0.35 * glitch) return 0
      return Math.round((rnd(a.seed, band, t + 77) - 0.5) * 6 * glitch)
    }
    const split = Math.max(1, Math.round(2 * glitch))
    out.ghosts = [
      { dx: -split, dy: 0, shade: (col) => (lumaOf(col) < 50 ? null : mix(col, 0xff3070, 0.7)) },
      { dx: split, dy: 0, shade: (col) => (lumaOf(col) < 50 ? null : mix(col, 0x30e8ff, 0.7)) },
    ]
    out.shade = (x, y, col) => {
      const n = rnd(a.seed, y * 3 + (x >> 2), t)
      if (n < 0.04 * glitch) return null
      if (rnd(a.seed, y, t + 9) < 0.15 * glitch) return mix(col, c, 0.8)
      return col
    }
    if (spike) out.shake = [t % 2 ? 1 : -1, 0]
  }
  emit(t, { count: 16, gap: 1.2, start: GLITCH_IN[0] + 2, life: 6 }, (i, life) => {
    if (t >= SNAP) return
    const p = solidPoint(g, a.seed, i + 130)
    const ang = rnd(a.seed, i, 44) * TAU
    const x = p.x + Math.cos(ang) * life * 1.6
    const y = p.y + Math.sin(ang) * life * 1.2
    const col = i % 2 ? c : 0x30e8ff
    dot(out, x, y, col)
    dot(out, x + 1, y, col)
    dot(out, x, y + 1, dark(col, 0.4))
    dot(out, x + 1, y + 1, dark(col, 0.4))
  })
  const age = t - SNAP
  if (age < 0) return
  out.sx = keys(age, [[0, 0.88], [3, 1.06], [6, 1]])
  if (age < 2) out.shade = (x, y, col) => screen(col, WHITE, 0.7)
  if (age < 7) {
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * TAU + rnd(a.seed, k, 45)
      const d = (1 - age / 7) * (width(g) / 2 + 8)
      const x = g.cx + 0.5 + Math.cos(ang) * d
      const y = g.cy + Math.sin(ang) * d * 0.7
      dot(out, x, y, age < 4 ? hi : lit)
      dot(out, x + 1, y, deep)
    }
  }
}

const SUN_RISE = [2, 14]
const SUN_SET = [36, 46]
const DAWN = [8, 18]
const STRETCH = [14, 28]

// The sun rises up behind the mon with slowly turning rays, dawn light washes down over
// it from the top, the mon takes a long morning stretch while sunbeam motes drift down,
// then the sun sinks away
function morningsun(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const r = clamp(width(g) * 0.3, 3, 5)
  const sx = g.cx + 0.5
  const peak = Math.max(r + 1, g.top + 1)
  const sy = lerp(g.ground + r + 2, peak, easeOut(phase(t, ...SUN_RISE))) + (g.ground + r + 2 - peak) * easeIn(phase(t, ...SUN_SET))
  const stretch = Math.sin(Math.PI * phase(t, ...STRETCH))
  out.sy = 1 + 0.1 * stretch
  out.sx = 1 - 0.04 * stretch
  if (stretch > 0.3) out.skew = (y) => Math.sin(t * 0.4) * 0.8 * stretch * ((g.bottom - y) / height(g))
  const up = t >= SUN_RISE[0] && t < SUN_SET[1]
  if (up) {
    for (let y = Math.floor(sy - r); y <= Math.ceil(sy + r); y++) {
      for (let x = Math.floor(sx - r); x <= Math.ceil(sx + r); x++) {
        const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy) / r
        if (d > 1 || y > g.ground || y < 0) continue
        back(out, x, y, d < 0.45 ? WHITE : d < 0.75 ? hi : d < 0.92 ? c : deep)
      }
    }
    const rays = phase(t, SUN_RISE[1] - 4, SUN_RISE[1]) * (1 - phase(t, SUN_SET[0], SUN_SET[0] + 4))
    if (rays > 0) {
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * TAU + t * 0.06
        const len = (k % 2 ? 3 : 6) * rays
        for (let d = r + 1.5; d <= r + 1.5 + len; d++) {
          const x = sx + Math.cos(ang) * d
          const y = sy + Math.sin(ang) * d
          if (y >= 0 && y <= g.ground && x >= 0 && x < g.columns) back(out, x, y, d < r + 3 ? hi : c)
        }
      }
    }
    for (let x = -width(g) / 2 - 5; x <= width(g) / 2 + 5; x++) {
      const f = 1 - Math.abs(x) / (width(g) / 2 + 6)
      if (rnd(a.seed, x, t >> 2) < f) back(out, sx + x, g.ground, f > 0.6 ? hi : f > 0.3 ? c : deep)
    }
  }
  const dawn = lerp(g.top - 1, g.bottom + 1, easeInOut(phase(t, ...DAWN)))
  const warm = 0.35 * phase(t, DAWN[0], DAWN[0] + 2) * (1 - phase(t, SUN_SET[0], SUN_SET[1]))
  if (warm > 0) {
    out.shade = (x, y, col) => {
      if (y > dawn) return col
      return screen(col, hi, Math.abs(y - dawn) < 1.5 && t < DAWN[1] ? 0.7 : warm)
    }
  }
  emit(t, { count: 14, gap: 1.4, start: DAWN[1], life: 12 }, (i, life, f) => {
    if (t >= SUN_SET[0]) return
    const x = g.left - 3 + rnd(a.seed, i, 46) * (width(g) + 6) - g.side * life * 0.4
    const y = g.top - 2 + life * 1.1
    if (y > g.ground) return
    dot(out, x, y, f < 0.3 ? WHITE : f < 0.7 ? hi : lit)
  })
}

const SHARP_RUN = [5, 25]
const SHARP_SHING = 27

// The pixels just outside the sprite, in order around its middle
function rimLoop(g) {
  const pts = []
  around(g, (x, y) => pts.push({ x, y, ang: Math.atan2(y - g.cy, x - g.cx) }))
  return pts.sort((p, q) => p.ang - q.ang)
}

// Rise onto its toes while two grinding sparks race around the edge of the body,
// throwing off a spray of filings and honing the outline bright, then a blade gleam
// flashes across with a ringing shing
function sharpen(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const loop = rimLoop(g)
  const n = loop.length
  const hone = phase(t, SHARP_RUN[0], SHARP_RUN[1]) * (1 - phase(t, SHARP_SHING + 4, a.ticks - 2))
  if (t >= SHARP_RUN[0] - 2 && t < SHARP_SHING + 4) out.dy = -1
  if (hone > 0) {
    out.shade = (x, y, col) => {
      const by = y - out.dy
      const rim = !g.solid(x - 1, by) || !g.solid(x + 1, by) || !g.solid(x, by - 1)
      return rim && lumaOf(col) >= 60 ? mix(col, WHITE, 0.55 * hone) : rim ? mix(col, deep, 0.5 * hone) : col
    }
  }
  const run = phase(t, ...SHARP_RUN)
  if (n > 0 && run > 0 && run < 1) {
    const tones = [WHITE, hi, lit, c, deep]
    for (const start of [0, n / 2]) {
      const head = start + easeInOut(run) * n * 1.5
      for (let k = 0; k < tones.length; k++) {
        const p = loop[Math.floor(head - k * 1.5 + n * 4) % n]
        dot(out, p.x, p.y + out.dy, tones[k])
      }
    }
  }
  emit(t, { count: 24, gap: 0.8, start: SHARP_RUN[0], life: 5 }, (i, life) => {
    if (n === 0 || t >= SHARP_RUN[1] + 4) return
    const born = phase(SHARP_RUN[0] + i * 0.8, ...SHARP_RUN)
    const p = loop[Math.floor((i % 2 ? n / 2 : 0) + easeInOut(born) * n * 1.5 + n * 4) % n]
    const ang = p.ang + (rnd(a.seed, i, 47) - 0.5) * 1.2
    const x = p.x + Math.cos(ang) * life * 1.3
    const y = p.y - 1 + Math.sin(ang) * life * 1.3 + life * life * 0.15
    dot(out, x, y, life < 2 ? WHITE : life < 4 ? hi : c)
  })
  const age = t - SHARP_SHING
  if (age >= 0 && age < 6) {
    if (age < 2) out.shade = (x, y, col) => screen(col, WHITE, 0.6)
    const half = (width(g) / 2 + 3) * Math.sin((Math.PI * Math.min(age + 1, 5)) / 6)
    const cx = g.cx + 0.5
    const cy = g.cy - 1
    line(out, cx - half, cy + half * 0.7, cx + half, cy - half * 0.7, age < 3 ? WHITE : hi)
    line(out, cx - half + 1, cy + half * 0.7, cx + half + 1, cy - half * 0.7, age < 3 ? lit : c)
    spark(out, cx + half, cy - half * 0.7, [1, 2, 3, 2, 1, 1][age], hi)
  }
}

// A milk bottle: r cap, o glass, w milk, h shine, l label
const BOTTLE = ['.rrr.', '.ooo.', '.owo.', 'owwwo', 'ohwwo', 'olllo', 'olllo', 'ohwwo', 'owwwo', '.ooo.']
const BOTTLE_COLORS = { r: 0xd04040, o: 0x8890a8, l: 0x5a8ae8, h: WHITE }
const MILK_POP = [1, 7]
const MILK_TIP = [7, 10]
const MILK_GULPS = [11, 16, 21]
const MILK_TOSS = 26
const MILK_GLOW = 30
const MILK_HOP = [36, 42]

// A milk bottle pops up, tips to the mouth and drains in three gulps as the head tilts
// back, gets tossed aside, then a creamy glow washes over the mon and it hops happily
function milkdrink(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const pink = mix(c, 0xe06890, 0.6)
  const near = g.cx + 0.5 + g.side * width(g) * 0.2
  const bx = clamp(Math.round(near - 2.5), 0, g.columns - 5)
  const rest = Math.max(0, Math.round(g.top + height(g) * 0.3 - 5))
  const tip = easeInOut(phase(t, ...MILK_TIP)) * (1 - phase(t, MILK_TOSS - 2, MILK_TOSS))
  if (tip > 0) out.skew = lean(g, -g.side * 2 * tip)
  const drained = Math.floor(phase(t, MILK_GULPS[0], MILK_GULPS[2] + 3) * 7)
  for (const s of MILK_GULPS) {
    if (t >= s && t < s + 2) {
      out.sy = 0.96
      out.dy = 1
    }
  }
  if (t < MILK_TOSS) {
    const y = rest + Math.round(4 * (1 - easeBack(phase(t, ...MILK_POP))))
    if (t >= MILK_POP[0]) {
      for (let r = 0; r < BOTTLE.length; r++) {
        const empty = r >= 2 && r < 2 + drained
        const palette = { ...BOTTLE_COLORS, w: empty ? dark(BOTTLE_COLORS.o, 0.5) : c, h: empty ? BOTTLE_COLORS.o : WHITE }
        const shift = -g.side * Math.round(tip * (BOTTLE.length - 1 - r) * 0.3)
        if (y + r >= 0) stamp(out, bx + shift, y + r, [BOTTLE[r]], palette)
      }
    }
    if (tip > 0.8 && drained < 7) {
      const mx = bx + 2 - g.side * 3
      if (t % 3 === 0) dot(out, mx, y + 2, WHITE)
      if (t % 3 === 1) dot(out, mx - g.side, y + 4, lit)
    }
  } else {
    const age = t - MILK_TOSS
    if (age < 8 && (age < 5 || age % 2)) {
      const x = bx - g.side * age * 1.6
      const y = rest - age * 1.6 + age * age * 0.25
      const flip = Math.floor(age / 2) % 2 === 1
      for (let r = 0; r < BOTTLE.length; r++) {
        const row = flip ? BOTTLE.length - 1 - r : r
        const palette = { ...BOTTLE_COLORS, w: dark(BOTTLE_COLORS.o, 0.5), h: BOTTLE_COLORS.o }
        if (y + r >= 0 && y + r <= g.ground) stamp(out, x, y + r, [BOTTLE[row]], palette)
      }
    }
  }
  const glow = t - MILK_GLOW
  if (glow >= 0 && glow < 8) out.shade = (x, y, col) => screen(col, c, 0.6 * (1 - glow / 8))
  if (glow >= 0 && glow < 6) oval(out, g.cx + 0.5, g.cy, width(g) / 2 + 1 + glow * 1.5, height(g) / 2 + glow, glow < 3 ? c : deep, glow < 3 ? dot : dotted)
  emit(t, { count: 8, gap: 1.5, start: MILK_GLOW + 1, life: 10 }, (i, life, f) => {
    const x = g.left + rnd(a.seed, i, 48) * width(g) + Math.sin(life * 0.5 + i)
    const y = g.bottom - 2 - life * 0.9
    plus(out, x, y, f < 0.6 ? pink : dark(pink, 0.3), f < 0.5 ? WHITE : c)
  })
  const f = phase(t, ...MILK_HOP)
  if (f > 0 && f < 1) out.dy = -Math.round(hop(f, 3))
}

export const BOOSTS = {
  protect: { ticks: 40, color: 0x6ff0b0, pose: { view: 'front' }, draw: protect },
  growth: { ticks: 44, color: 0x5cc840, pose: { view: 'front' }, draw: growth },
  swordsdance: { ticks: 44, color: 0xc8d4ec, pose: { view: 'front' }, draw: swordsdance },
  safeguard: { ticks: 46, color: 0xc0a8ff, pose: { view: 'front' }, draw: safeguard },
  helpinghand: { ticks: 36, color: 0xffb860, pose: { view: 'front' }, draw: helpinghand },
  endure: { ticks: 40, color: 0xff5a3c, pose: { view: 'front' }, draw: endure },
  batonpass: { ticks: 40, color: 0xff7ab8, pose: { view: 'front' }, draw: batonpass },
  stockpile: { ticks: 48, color: 0xff9c40, pose: { view: 'front' }, draw: stockpile },
  swallow: { ticks: 44, color: 0xffc850, pose: { view: 'front' }, draw: swallow },
  workup: { ticks: 40, color: 0xff6a3a, pose: { view: 'front' }, draw: workup },
  refresh: { ticks: 44, color: 0x6fd8ff, pose: { view: 'front' }, draw: refresh },
  luckychant: { ticks: 50, color: 0xffd040, pose: { view: 'front' }, draw: luckychant },
  recycle: { ticks: 44, color: 0x58c870, pose: { view: 'front' }, draw: recycle },
  howl: { ticks: 40, color: 0xa8b8ff, pose: { view: 'front' }, draw: howl },
  bellydrum: { ticks: 50, color: 0xff8a50, pose: { view: 'front' }, draw: bellydrum },
  camouflage: { ticks: 44, color: 0x7a9a50, pose: { view: 'front' }, draw: camouflage },
  healbell: { ticks: 48, color: 0xffd050, pose: { view: 'front' }, draw: healbell },
  shellsmash: { ticks: 46, color: 0xc8b088, pose: { view: 'front' }, draw: shellsmash },
  slackoff: { ticks: 48, color: 0xffb890, pose: { view: 'front' }, draw: slackoff },
  substitute: { ticks: 44, color: 0xe0c8a0, pose: { view: 'front' }, draw: substitute },
  wish: { ticks: 48, color: 0xffe860, pose: { view: 'front' }, draw: wish },
  acupressure: { ticks: 46, color: 0xff6a8a, pose: { view: 'front' }, draw: acupressure },
  conversion: { ticks: 42, color: 0x7ad0ff, pose: { view: 'front' }, draw: conversion },
  conversion2: { ticks: 40, color: 0xff7ad8, pose: { view: 'front' }, draw: conversion2 },
  morningsun: { ticks: 50, color: 0xffb830, pose: { view: 'front' }, draw: morningsun },
  sharpen: { ticks: 38, color: 0xc8d4ec, pose: { view: 'front' }, draw: sharpen },
  milkdrink: { ticks: 46, color: 0xfff4e4, pose: { view: 'front' }, draw: milkdrink },
}
