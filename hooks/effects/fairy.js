// Fairy moves: cute charms, kisses and moonlight

import {
  WHITE, back, clamp, dark, disc, dot, easeInOut, easeOut, emit, glow, lean, lerp, light, line, mix, phase,
  plus, ramp, rnd, spark, sparkles, stamp,
} from './draw.js'

const TAU = Math.PI * 2
const HEART = ['.pp.pp.', 'phppppp', 'ppppppp', '.ppppp.', '..ppp..', '...p...']
const LIPS = ['.uu.uu.', 'uhuuuuu', '.ddddd.', '.lllll.', '..lll..']

const sizeOf = (g) => ({ w: g.right - g.left + 1, h: g.bottom - g.top + 1 })
const dotted = (out, x, y, c) => (Math.round(x) + Math.round(y)) % 2 && dot(out, x, y, c)

// Pixel art in its palette with a dark outline around it, so it reads on any background
function outlined(out, x, y, art, palette, edge) {
  const rim = Object.fromEntries(Object.keys(palette).map((k) => [k, edge]))
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stamp(out, x + dx, y + dy, art, rim)
  stamp(out, x, y, art, palette)
}

const CHARM_WINK = 14
const CHARM_SHINE = 30

// Tilt the head one way and the other with little hops, wink with a twinkle, blush,
// and float hearts off toward the target before a pink shimmer runs round the body
function charm(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { w, h } = sizeOf(g)
  const live = phase(t, 0, 4) * (1 - phase(t, 36, 42))
  if (live > 0) out.skew = lean(g, 2.5 * Math.sin((t * TAU) / 16) * live)
  for (const at of [8, 24]) {
    const f = phase(t, at, at + 6)
    if (f > 0 && f < 1) out.dy = -Math.round(2 * 4 * f * (1 - f))
  }
  if (t >= 10 && t < 36) out.shade = glow(c, 0.12)

  const eyeY = g.top + Math.round(h * 0.3)
  const eyeX = g.cx + g.side * Math.max(1, Math.round(w * 0.2))
  const skewed = (x, y) => x + (out.skew ? Math.round(out.skew(y)) : 0)
  if (t >= CHARM_WINK && t < CHARM_WINK + 6) spark(out, skewed(eyeX, eyeY) + g.side, eyeY + out.dy, t < CHARM_WINK + 2 ? 1 : t < CHARM_WINK + 4 ? 3 : 2, c)
  if (t >= 10 && t < 36) {
    const by = g.top + Math.round(h * 0.45) + out.dy
    for (const s of [-1, 1]) {
      const bx = skewed(g.cx + s * Math.max(2, Math.round(w * 0.28)), by)
      dot(out, bx, by, deep)
      dot(out, bx + 1, by, deep)
    }
  }
  emit(t, { count: 7, gap: 3, start: 6, life: 14 }, (i, age, f) => {
    if (f > 0.75 && t % 2) return
    const x = g.cx + g.side * (w / 2 + 1 + age * 0.7) + Math.sin(age * 0.5 + i) * 1.2
    const y = Math.max(3, g.top + h * (0.25 + rnd(a.seed, i) * 0.3) - age * 0.6)
    const col = i % 2 ? c : lit
    if (age < 2) plus(out, x, y, col, WHITE)
    else outlined(out, x - 3, y - 2, HEART, { p: col, h: WHITE }, dark(c, 0.55))
  })
  if (t >= CHARM_SHINE && t < CHARM_SHINE + 8) {
    const f = phase(t, CHARM_SHINE, CHARM_SHINE + 8)
    const run = Math.floor(f * 4 * (w + h))
    for (let y = g.top - 1; y <= g.bottom + 1; y++) {
      for (let x = g.left - 1; x <= g.right + 1; x++) {
        if (g.solid(x, y)) continue
        if (!(g.solid(x - 1, y) || g.solid(x + 1, y) || g.solid(x, y - 1) || g.solid(x, y + 1))) continue
        const near = Math.abs(((x - g.left + (y - g.top) * 2) % 12) - (run % 12)) < 2
        back(out, x + Math.round(out.skew ? out.skew(y) : 0), y + out.dy, near ? WHITE : hi)
      }
    }
  }
}

const SK_BLOW = 8
const SK_KISSES = 3
const SK_GAP = 4
const SK_FLY = 10
const SK_DIZZY = 24

// Lean in and pucker, blow three kisses that flutter across and land as lip prints
// on the target, which then reels as little stars circle overhead
function sweetkiss(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const edge = dark(c, 0.55)
  const palette = { u: c, h: WHITE, l: dark(c, 0.15), d: dark(c, 0.65) }
  if (t < SK_BLOW) {
    const f = easeOut(phase(t, 0, SK_BLOW))
    out.skew = lean(g, g.side * 3 * f)
    out.shade = glow(c, 0.15 * f)
  } else if (t < SK_BLOW + SK_KISSES * SK_GAP) {
    const beat = (t - SK_BLOW) % SK_GAP
    out.skew = lean(g, g.side * (beat < 1 ? 3 : 2))
    out.dx = beat < 1 ? g.side : 0
    out.shade = glow(c, 0.12)
  } else if (t < SK_BLOW + SK_KISSES * SK_GAP + 4) out.skew = lean(g, g.side * 2 * (1 - phase(t, 20, 24)))

  const lips = mx + (out.skew ? Math.round(out.skew(my)) : 0) + out.dx
  if (t >= 3 && t < SK_BLOW + SK_KISSES * SK_GAP && (t - SK_BLOW) % SK_GAP !== 0) {
    plus(out, lips, my + 1, c, WHITE)
  }
  const spots = [[-3, -3], [2, -1], [-1, 2]]
  for (let k = 0; k < SK_KISSES; k++) {
    const born = SK_BLOW + k * SK_GAP
    const land = born + SK_FLY
    const [ox, oy] = spots[k]
    const ex = tx + ox * g.side
    const ey = ty + oy
    if (t >= born && t < land) {
      const f = phase(t, born, land)
      const x = lerp(lips + g.side, ex, easeInOut(f))
      const y = lerp(my, ey, f) + Math.sin(f * TAU * 2 + k) * 2
      if (f < 0.15) plus(out, x, y, c, WHITE)
      else {
        outlined(out, x - 3, y - 2, LIPS, palette, edge)
        dot(out, x - g.side * 4, y + (t % 2 ? -1 : 1), lit)
      }
    } else if (t >= land && t < 38 && (t < 32 || t % 2)) {
      if (t < land + 2) outlined(out, ex - 4, ey - 2, ['.uu.uu..', 'uuuuuuuu', '.dddddd.', '.llllll.', '..llll..'], palette, edge)
      else outlined(out, ex - 3, ey - 2, LIPS, palette, edge)
      if (t < land + 3) for (const s of [-1, 1]) dot(out, ex + s * 5, ey - 2 + (t - land), WHITE)
    }
  }
  if (t >= SK_DIZZY && t < a.ticks - 2) {
    const top = g.foe ? g.foe.top : ty - 5
    for (let k = 0; k < 3; k++) {
      const ang = t * 0.45 + (k * TAU) / 3
      const x = tx + Math.cos(ang) * 4
      const y = Math.max(1, top - 2) + Math.sin(ang) * 1.3
      if (Math.sin(ang) > -0.3) plus(out, x, y, k % 2 ? hi : c, WHITE)
      else dot(out, x, y, lit)
    }
  }
}

const ML_RISE = 10
const ML_BEAM = 12
const ML_DIM = 38
const ML_GONE = 46

// A crescent moon rises in a soft halo and pours slanting moonbeams down onto the
// mon, bathing it in silver while motes of light drift down like snow
function moonlight(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { w, h } = sizeOf(g)
  const high = g.top >= 10
  const moonX = high ? g.cx : clamp(g.cx + g.side * (w / 2 + 5), 4, g.columns - 5)
  const restY = high ? g.top - 6 : 4
  const moonY = lerp(-4, restY, easeOut(phase(t, 0, ML_RISE)))
  const show = 1 - phase(t, ML_DIM, ML_GONE)
  const r = 3.5

  const bathe = phase(t, ML_BEAM, ML_BEAM + 8) * (1 - phase(t, ML_DIM, ML_GONE))
  if (bathe > 0) out.shade = glow(light(c, 0.3), 0.35 * bathe)
  if (t >= ML_BEAM + 4 && t < ML_DIM) out.dy = -1

  // Moonbeams: dithered bands from the moon down to the body, drawn behind it
  if (t >= ML_BEAM && t < ML_GONE) {
    const f = easeOut(phase(t, ML_BEAM, ML_BEAM + 6))
    const fade = phase(t, ML_DIM, ML_GONE)
    const top = Math.round(moonY + r + 1)
    const bottom = Math.round(lerp(top, g.bottom, f))
    for (let y = top; y <= bottom; y++) {
      const u = (y - top) / Math.max(1, g.bottom - top)
      const mid = lerp(moonX, g.cx, u)
      const half = lerp(2, w / 2 + 1, u)
      for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) {
        const rim = Math.abs(x - mid) > half - 1
        if (fade > 0 && rnd(a.seed, x * 31 + y, t >> 1) < fade) continue
        if (rim) {
          if ((y + (t >> 1)) % 2) back(out, x, y, deep)
        } else if ((x + y * 2 + (t >> 1)) % 4 === 0) back(out, x, y, lit)
      }
    }
  }

  if (show > 0 && moonY > -r) {
    if (t >= ML_RISE) {
      const halo = r + 2 + (t % 8 < 4 ? 0 : 1)
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * TAU + t * 0.05
        if ((k + (t >> 1)) % 3 === 0) continue
        const paint = show < 1 ? dotted : dot
        paint(out, moonX + Math.cos(ang) * halo, moonY + Math.sin(ang) * halo, lit)
      }
    }
    // A crescent is the moon's disc with a second disc bitten out of it
    const bite = (x, y) => Math.hypot(x - (moonX - g.side * 1.8), y - (moonY - 1.2)) <= r - 0.4
    disc(out, moonX, moonY, r + 1, deep, (o, x, y, col) => !bite(x, y) && (show === 1 || (x + y) % 2) && dot(o, x, y, col))
    disc(out, moonX, moonY, r, hi, (o, x, y) => {
      if (bite(x, y) || (show < 1 && (x + y) % 2 === 0)) return
      const lightSide = (x - moonX) * g.side > 1
      dot(o, x, y, lightSide ? WHITE : mix(hi, c, 0.3))
    })
  }

  emit(t, { count: 16, gap: 1.6, start: ML_BEAM, life: 10 }, (i, age, f) => {
    const u = rnd(a.seed, i, 2)
    const x = g.cx + (u - 0.5) * (w + 6) + Math.sin(age * 0.4 + i) * 1.2
    const y = lerp(Math.max(1, restY + r), g.bottom - 1, (age + rnd(a.seed, i, 3) * 4) / 14)
    if (f > 0.7 && t % 2) return
    if (i % 3 === 0 && f < 0.5) plus(out, x, y, lit, WHITE)
    else dot(out, x, y, f < 0.5 ? WHITE : hi)
  })
  if (t >= ML_DIM - 4 && t < ML_GONE + 4) {
    const f = phase(t, ML_DIM - 4, ML_GONE + 4)
    const rx = w / 2 + 1 + f * 4
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * TAU
      const paint = Math.sin(ang) >= 0 ? (f > 0.5 ? dotted : dot) : back
      paint(out, g.cx + Math.cos(ang) * rx, g.bottom + 1 + Math.sin(ang) * Math.max(1, rx * 0.2), f < 0.5 ? WHITE : hi)
    }
  }
  if (t >= ML_DIM && t < ML_GONE) sparkles(out, t, a.seed, g.cx, g.cy, w + 4, h, lit, 3)
  if (t >= ML_BEAM && t < ML_BEAM + 2) line(out, moonX, moonY + r + 1, g.cx, g.top, WHITE, dotted)
}

export const FAIRY = {
  charm: { ticks: 44, color: 0xff8ac8, pose: { view: 'front' }, draw: charm },
  sweetkiss: { ticks: 40, color: 0xff6aa8, draw: sweetkiss },
  moonlight: { ticks: 52, color: 0xb8c8ff, pose: { view: 'front' }, draw: moonlight },
}
