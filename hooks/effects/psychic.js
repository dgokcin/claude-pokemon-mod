// Psychic moves: foresight, mind waves, and raw psychic power

import {
  WHITE, back, ball, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, glow, hsl, lean, lerp,
  light, line, mix, phase, plus, puff, ramp, ring, rnd, spark, sparkles, stamp, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const BOOSTS = [0xff5a5a, 0x5aa0ff, 0x5ae08a, 0xffd84a, 0xd07aff]

const hop = (f, h) => h * 4 * f * (1 - f)
const sizeOf = (g) => ({ w: g.right - g.left + 1, h: g.bottom - g.top + 1 })
const foeHalf = (g) => (g.foe ? (g.foe.right - g.foe.left) / 2 : 4)

// Every other pixel, for things breaking up as they fade
const dotted = (out, x, y, c) => (Math.round(x) + Math.round(y)) % 2 && dot(out, x, y, c)

// An ellipse outline. Its lower half paints with near and its upper half with far, so
// a ring around the body can pass behind it.
function oval(out, x, y, rx, ry, c, near = dot, far = near) {
  const steps = Math.max(12, Math.ceil((rx + ry) * 3))
  for (let k = 0; k < steps; k++) {
    const ang = (k / steps) * TAU
    const paint = Math.sin(ang) >= 0 ? near : far
    paint(out, x + rx * Math.cos(ang), y + ry * Math.sin(ang), c)
  }
}

// A one pixel line hugging the sprite's silhouette at its base spot shifted by ox
function outline(out, g, c, ox = 0, paint = back) {
  for (let y = g.top - 1; y <= g.bottom + 1; y++) {
    for (let x = g.left - 1; x <= g.right + 1; x++) {
      if (g.solid(x, y)) continue
      if (g.solid(x - 1, y) || g.solid(x + 1, y) || g.solid(x, y - 1) || g.solid(x, y + 1)) paint(out, x + ox, y, c)
    }
  }
}

// A small glowing bead with a dark rim, so it reads on light backgrounds too
function bead(out, x, y, c) {
  disc(out, x, y, 1.6, dark(c, 0.5))
  plus(out, x, y, c, WHITE)
}

const FS_RISE = 8
const FS_GONE = 18
const FS_CLOCK = 20
const FS_FALL = 32
const FS_HIT = 35

// Gather a glowing orb on the crown and send it up out of sight, then a clock face
// ticks round over the target until a pillar of light crashes down on it
function futuresight(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const edge = dark(c, 0.55)
  const { x: tx, y: ty } = g.target
  const focus = phase(t, 0, FS_RISE) * (1 - phase(t, FS_GONE, FS_GONE + 6))
  if (focus > 0) out.shade = glow(c, 0.35 * focus)
  if (t < FS_RISE) out.sy = 1 - 0.05 * easeOut(focus)
  else if (t < FS_GONE) {
    out.sy = 1 + 0.05 * (1 - phase(t, FS_RISE, FS_GONE))
    out.dy = t < FS_RISE + 5 ? -1 : 0
  }

  const ox = g.top >= 6 ? g.cx : g.ahead(2)
  const oy = Math.max(3, g.top - 3)
  if (t >= 2 && t < FS_RISE) {
    emit(t, { count: 6, gap: 0.8, start: 1, life: 5 }, (i, age, f) => {
      const ang = (i / 6) * TAU + rnd(a.seed, i)
      const r = 7 * (1 - easeIn(f))
      dot(out, ox + Math.cos(ang) * r, oy + Math.sin(ang) * r * 0.6, f < 0.5 ? lit : WHITE)
    })
    disc(out, ox, oy, 0.6 + 1.6 * focus, edge)
    ball(out, ox, oy, 0.4 + 1.2 * focus, c)
  } else if (t >= FS_RISE && t < FS_GONE) {
    const y = lerp(oy, -4, easeIn(phase(t, FS_RISE, FS_GONE)))
    for (let k = 1; k <= 4; k++) dot(out, ox + (k % 2 ? 0 : tremble(t)), y + k * 2, k < 2 ? hi : k < 3 ? c : deep)
    disc(out, ox, y, 2.4, edge)
    ball(out, ox, y, 1.8, c)
  }

  const R = g.foe ? clamp(foeHalf(g) + 3, 5, 9) : 6
  if (t >= FS_CLOCK && t < FS_HIT + 2) {
    const f = phase(t, FS_CLOCK + 2, FS_FALL)
    const shown = phase(t, FS_CLOCK, FS_CLOCK + 3)
    for (let k = 0; k < 12; k++) {
      if (k / 12 > shown * 1.01) continue
      const ang = -Math.PI / 2 + g.side * (k / 12) * TAU
      const x = tx + Math.cos(ang) * R
      const y = ty + Math.sin(ang) * R
      const on = k / 12 <= f
      if (on && k === Math.floor(f * 12)) plus(out, x, y, c, WHITE)
      else dot(out, x, y, on ? hi : edge)
    }
    const hand = -Math.PI / 2 + g.side * f * TAU
    line(out, tx, ty, tx + Math.cos(hand) * R * 0.65, ty + Math.sin(hand) * R * 0.65, t % 2 ? lit : c)
    dot(out, tx, ty, WHITE)
  }

  // The pillar drops from the top of the strip, then narrows and breaks up
  if (t >= FS_FALL && t < FS_HIT + 10) {
    const reachY = lerp(0, g.ground, easeIn(phase(t, FS_FALL, FS_HIT)))
    const half = t < FS_HIT + 2 ? 2 : Math.round(2 * (1 - phase(t, FS_HIT + 2, FS_HIT + 9)))
    const paint = t > FS_HIT + 5 ? dotted : dot
    for (let y = 0; y <= reachY; y++) {
      for (let d = -half; d <= half; d++) {
        const col = d === 0 ? WHITE : Math.abs(d) === half && half > 1 ? edge : Math.abs(d) === 1 ? hi : c
        paint(out, tx + d, y, col)
      }
    }
    if (t < FS_HIT) disc(out, tx, reachY, 2, WHITE)
  }
  emit(t, { count: 3, gap: 2, start: FS_HIT, life: 9 }, (i, age, f) => {
    const r = 2 + age * 1.2
    ring(out, tx, ty, r, f < 0.4 ? WHITE : f < 0.7 ? hi : c, 0, Math.PI, f > 0.6 ? dotted : dot)
  })
  if (t >= FS_HIT && t < FS_HIT + 6) {
    const s = phase(t, FS_HIT, FS_HIT + 6) * 8
    line(out, tx - s, g.ground, tx + s, g.ground, t % 2 ? lit : c)
  }
  if (t >= FS_HIT && t < FS_HIT + 3) out.shake = [t % 2 ? 1 : -1, 1]
  if (t >= FS_HIT + 4 && t < 50) sparkles(out, t, a.seed, tx, ty, 12, 10, lit, 4)
}

const PW_OUT = 6
const PW_ARRIVE = 16
const PW_TAIL = 26
const PW_GONE = 34

// Sway and let loose one long wobbling ribbon of shifting colors, its swell rising and
// dipping at random along the way, that rattles the target as it washes through
function psywave(out, t, a, g, c) {
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const live = phase(t, 2, PW_OUT) * (1 - phase(t, PW_GONE, PW_GONE + 6))
  if (live > 0) {
    out.skew = lean(g, Math.sin(t * 0.6) * 1.8 * live)
    out.shade = glow(c, 0.25 * live)
  }
  const len = Math.abs(tx - mx) + 3
  const head = len * easeOut(phase(t, PW_OUT, PW_ARRIVE))
  const tail = len * easeIn(phase(t, PW_TAIL, PW_GONE))
  const span = (k) => 1 + rnd(a.seed, k, 3) * 4
  let prev = null
  for (let d = Math.ceil(tail); d <= head; d++) {
    const k = Math.floor(d / 5)
    const amp = lerp(span(k), span(k + 1), easeInOut((d % 5) / 5)) * Math.min(1, d / 3)
    const s = Math.sin(d * 0.85 - t * 1.2)
    const x = mx + g.side * d
    const y = clamp(lerp(my, ty, d / len) + s * amp, 1, g.ground - 1)
    const col = hsl(0.84 + 0.09 * Math.sin(d * 0.3 - t * 0.5), 0.9, 0.62)
    if (prev) {
      line(out, prev[0], prev[1] + 1, x, y + 1, dark(col, 0.5))
      line(out, prev[0], prev[1], x, y, Math.abs(s) > 0.93 ? WHITE : col)
    }
    prev = [x, y]
  }
  if (t >= PW_ARRIVE && t < PW_TAIL + 6) {
    const f = phase(t, PW_ARRIVE, PW_TAIL + 6)
    for (let k = -2; k <= 2; k++) {
      const half = (2.5 + 2 * Math.sin(t * 1.3 + k * 1.7)) * (1 - f * 0.6)
      const off = Math.round(Math.sin(t * 0.9 + k) * 1.5)
      line(out, tx - half + off, ty + k * 2, tx + half + off, ty + k * 2, k % 2 ? light(c, 0.4) : c, f > 0.6 ? dotted : dot)
    }
    if (t < PW_ARRIVE + 8) out.shake = [t % 2 ? 1 : 0, 0]
  }
}

// Breathe slowly with eyes shut while a halo turns above the head and two motes
// circle the body, until a third eye glints on the brow and calm ripples spread
function calmmind(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { w, h } = sizeOf(g)
  const live = easeInOut(phase(t, 0, 8)) * (1 - easeInOut(phase(t, 40, 47)))
  const breath = Math.sin((t * TAU) / 20)
  out.sy = 1 + 0.035 * breath * live
  out.sx = 1 - 0.02 * breath * live
  if (live > 0) out.shade = glow(c, (0.18 + 0.08 * breath) * live)

  if (live > 0.3) {
    const rx = clamp(w * 0.3, 2, 6)
    const steps = Math.ceil(rx * 7)
    for (let k = 0; k < steps; k++) {
      const ang = (k / steps) * TAU
      const x = g.cx + Math.cos(ang) * rx
      const y = Math.max(2, g.top - 2) + Math.sin(ang) * 1.1
      const shine = Math.cos(ang - t * 0.4) > 0.85
      dot(out, x, y + 1, deep)
      dot(out, x, y, shine ? WHITE : Math.sin(ang) > 0 ? hi : c)
    }
  }
  if (t >= 6 && t < 42) {
    for (let i = 0; i < 2; i++) {
      for (let k = 3; k >= 0; k--) {
        const ang = (t - k) * 0.22 + i * Math.PI
        const x = g.cx + Math.cos(ang) * (w / 2 + 3)
        const y = g.cy + h * 0.1 + Math.sin(ang) * 2
        const col = k === 0 ? WHITE : k === 1 ? hi : k === 2 ? c : deep
        const paint = Math.sin(ang) >= 0 ? dot : back
        if (k === 0) plus(out, x, y, c, WHITE, paint)
        else paint(out, x, y, col)
      }
    }
  }
  const brow = g.top + Math.max(2, Math.round(h * 0.22))
  if (t >= 28 && t < 31) spark(out, g.cx, brow, t - 27, c)
  else if (t >= 31 && t < 41 && (t < 38 || t % 2)) plus(out, g.cx, brow, t % 4 < 2 ? c : lit, WHITE)
  for (const start of [30, 36]) {
    emit(t, { count: 1, start, life: 10 }, (i, age, f) => {
      const rx = w / 2 + age * 1.6
      oval(out, g.cx, g.bottom + 1, rx, Math.max(1, rx * 0.2), f < 0.4 ? hi : c, f > 0.5 ? dotted : dot, back)
    })
  }
}

const MC_COAT = 10
const MC_HIT = 18
const MC_FIRE = 20
const MC_LAND = 27

// Glaze the body in a glossy coat with a glint sweeping over it, take a dark blast on
// it, and fling it straight back as a doubled prism beam that shatters on the target
function mirrorcoat(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { w, h } = sizeOf(g)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const coat = phase(t, 0, MC_COAT) * (1 - phase(t, 34, 40))
  if (t >= MC_HIT && t < MC_FIRE) out.dx = -g.side
  else if (t >= MC_FIRE && t < MC_FIRE + 3) out.dx = g.side
  if (coat > 0) {
    const sweep = ((t * 2) % (w + h + 12)) - 6
    const silver = light(c, 0.45)
    out.shade = (x, y, col) => {
      if (t >= MC_HIT && t < MC_FIRE) return mix(col, WHITE, 0.6)
      const u = (g.side > 0 ? x - g.left : g.right - x) + (y - g.top) - out.dx * g.side
      if (Math.abs(u - sweep) < 1.5) return mix(col, WHITE, 0.8 * coat)
      return mix(col, silver, 0.3 * coat)
    }
    if (coat > 0.4) outline(out, g, (t >> 1) % 2 ? lit : c, out.dx)
  }

  if (t >= MC_COAT && t < MC_HIT) {
    const f = easeIn(phase(t, MC_COAT, MC_HIT))
    const x = lerp(tx, mx + g.side * 2, f)
    const y = lerp(ty, my, f)
    for (let k = 1; k <= 3; k++) dot(out, x + g.side * k * 1.5, y, k < 2 ? 0x7a3aa0 : 0x4a1a60)
    disc(out, x, y, 2, deep)
    disc(out, x, y, 1.2, 0x3a1050)
  }
  if (t >= MC_HIT && t < MC_FIRE + 2) ring(out, mx, my, 2 + (t - MC_HIT), t % 2 ? WHITE : hi)

  // The thrown back beam: a white core between two rainbow bands that roll along
  if (t >= MC_FIRE && t < 34) {
    const reach = easeOut(phase(t, MC_FIRE, MC_LAND))
    const thin = t >= 30 ? phase(t, 30, 34) : 0
    const len = Math.abs(tx - mx)
    for (let d = 1; d <= len * reach; d++) {
      const x = mx + g.side * d
      const y = lerp(my, ty, d / Math.max(1, len))
      const hue = (d * 0.06 - t * 0.05 + 10) % 1
      if (thin < 0.7) {
        dot(out, x, y - 2, hsl(hue, 0.9, 0.6))
        dot(out, x, y + 2, hsl((hue + 0.5) % 1, 0.9, 0.6))
      }
      if (thin < 0.4) {
        dot(out, x, y - 1, hi)
        dot(out, x, y + 1, hi)
      }
      dot(out, x, y, thin > 0.8 ? lit : WHITE)
    }
  }
  if (t >= MC_LAND && t < MC_LAND + 4) burst(out, tx, ty, [3, 6, 5, 3][t - MC_LAND], c)
  if (t >= MC_LAND && t < MC_LAND + 2) out.shake = [g.side, t % 2]
  emit(t, { count: 9, gap: 0, start: MC_LAND, life: 12 }, (i, age, f) => {
    const ang = (i / 9) * TAU + rnd(a.seed, i)
    const sp = 0.7 + rnd(a.seed, i, 1) * 0.6
    const x = tx + Math.cos(ang) * sp * age
    const y = ty + Math.sin(ang) * sp * age + age * age * 0.04
    if (f > 0.7 && t % 2) return
    const col = hsl(i / 9, 0.85, 0.65)
    dot(out, x, y, f < 0.4 ? WHITE : col)
    dot(out, x + 1, y + 1, dark(col, 0.4))
  })
}

// An eye at x, y w pixels wide, its lids `open` (0 to 1), its iris shifted `look`
// pixels and its pupil `pupil` pixels wide
function eye(out, x, y, w, open, look, pupil, c, iris) {
  const hw = w / 2
  const hh = w * 0.3
  const rim = dark(c, 0.55)
  for (let px = -Math.ceil(hw); px <= Math.ceil(hw); px++) {
    const lid = Math.abs(px) > hw ? -1 : open * hh * (1 - (px / hw) ** 2)
    if (lid < 0) continue
    for (let py = -Math.ceil(lid) - 1; py <= Math.ceil(lid) + 1; py++) {
      const d = Math.abs(py)
      if (d <= lid - 0.5) {
        const r = Math.hypot(px - look, py)
        const col = Math.abs(px - look) < pupil && d < 1.6 ? 0x200820 : r < 2.3 ? (px - look < 0 && py < 0 ? light(iris, 0.4) : iris) : WHITE
        dot(out, x + px, y + py, col)
      } else if (d <= lid + 0.6 || (lid < 0.5 && py === 0)) dot(out, x + px, y + py, rim)
    }
  }
}

const XS_OPEN = 6
const XS_WIDE = 13
const XS_FLASH = 26
const XS_SHUT = 34
const XS_GONE = 40

// A huge eye opens over the target and stares back at the mon down a thin thread of
// thought, then its pupil snaps shut to a slit and it fires a glare of rays
function extrasensory(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const { x: tx, y: ty } = g.target
  const w = clamp(g.foe ? foeHalf(g) * 2 + 3 : 11, 9, 15)
  const live = phase(t, 2, XS_OPEN) * (1 - phase(t, XS_FLASH + 4, XS_SHUT))
  if (live > 0) {
    out.shade = glow(c, 0.2 + 0.15 * Math.sin(t * 0.8))
    if (t >= 10 && t < XS_FLASH) out.dx = t % 3 === 0 ? g.side : 0
  }
  if (t >= XS_FLASH && t < XS_FLASH + 2) out.skew = lean(g, g.side * 2)

  const open = easeOut(phase(t, XS_OPEN, XS_WIDE)) * (1 - easeIn(phase(t, XS_SHUT, XS_GONE)))
  const look = t < XS_WIDE ? 0 : -g.side * 1.5 * phase(t, XS_WIDE, XS_WIDE + 4) * (1 - phase(t, XS_FLASH, XS_FLASH + 2))
  const pupil = t < XS_FLASH ? 1.2 : 0.5
  if (t >= XS_OPEN - 2 && t < XS_GONE) eye(out, tx, ty - 1, w, open, Math.round(look), pupil, c, t === XS_FLASH ? WHITE : c)

  if (t >= 10 && t < XS_FLASH) {
    const fx = g.frontAt(g.top + 2)
    const fy = g.top + 2
    const ex = tx - g.side * (w / 2 + 1)
    const steps = Math.max(2, Math.abs(ex - fx))
    for (let k = 0; k <= steps; k++) {
      if ((k + t) % 3 === 0) continue
      const f = k / steps
      dot(out, lerp(fx, ex, f), lerp(fy, ty - 1, f) + Math.sin(f * TAU * 2 - t * 0.7), (k + t) % 3 === 1 ? lit : c)
    }
  }
  if (t >= XS_FLASH && t < XS_FLASH + 5) {
    const len = [4, 8, 11, 12, 12][t - XS_FLASH]
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4
      const from = w / 2 - 1
      line(out, tx + Math.cos(ang) * from, ty - 1 + Math.sin(ang) * from * 0.7, tx + Math.cos(ang) * len, ty - 1 + Math.sin(ang) * len * 0.7, k % 2 ? hi : WHITE, t > XS_FLASH + 2 ? dotted : dot)
    }
    out.shake = [t % 2 ? 2 : -2, t % 2]
  }
  emit(t, { count: 2, gap: 3, start: XS_FLASH, life: 9 }, (i, age, f) => {
    const r = w / 2 + 1 + age * 1.4
    for (let k = 0; k < r * 4; k++) {
      const u = k / (r * 4)
      const side = Math.floor(u * 4)
      const s = (u * 4) % 1
      const corners = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, -1]]
      const [x0, y0] = corners[side]
      const [x1, y1] = corners[side + 1]
      const paint = f > 0.5 ? dotted : dot
      paint(out, tx + lerp(x0, x1, s) * r, ty - 1 + lerp(y0, y1, s) * r * 0.75, f < 0.4 ? hi : c)
    }
  })
}

const ZH_BACK = 8
const ZH_HIT = 14
const ZH_HOME = 30

// Wreathe the head in psychic light, rear back, then charge head first with
// afterimages streaming behind and ram the target in a ringing flash
function zenheadbutt(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { h } = sizeOf(g)
  const lunge = clamp(Math.round(g.reach - foeHalf(g)), 2, 12)
  let dx = 0
  if (t < ZH_BACK) {
    const f = easeOut(phase(t, 0, ZH_BACK))
    dx = -2 * f
    out.skew = lean(g, -g.side * 2 * f)
    out.sy = 1 - 0.05 * f
  } else if (t < ZH_HIT) {
    const f = easeIn(phase(t, ZH_BACK, ZH_HIT))
    dx = lerp(-2, lunge, f)
    out.skew = lean(g, g.side * 3 * f)
    out.ghosts = [ghost(Math.round(dx) * g.side - g.side * 3, 0, c, 0.65), ghost(Math.round(dx) * g.side - g.side * 6, 0, lit, 0.8)]
  } else if (t < ZH_HIT + 3) {
    dx = lunge
    out.sx = 0.92
    out.sy = 1.04
    out.skew = lean(g, g.side * 2)
  } else {
    dx = lerp(lunge, 0, easeInOut(phase(t, ZH_HIT + 3, ZH_HOME)))
    out.dy = -Math.round(hop(phase(t, ZH_HIT + 3, ZH_HOME), 2))
  }
  out.dx = Math.round(dx) * g.side
  const charge = phase(t, 0, ZH_BACK) * (1 - phase(t, ZH_HIT + 2, ZH_HOME + 2))
  if (charge > 0) out.shade = glow(c, 0.35 * charge)

  const hy = g.top + Math.round(h * 0.2)
  const hx = g.mouth.x + out.dx + (out.skew ? Math.round(out.skew(hy)) : 0)
  if (t >= 2 && t < ZH_HIT + 2) {
    const r = clamp(h * 0.22, 2, 4) + (t % 4 < 2 ? 0.5 : 0)
    ring(out, hx - g.side * 2, hy, r + 1, deep, 0, Math.PI, back)
    ring(out, hx - g.side * 2, hy, r, t % 2 ? hi : c, 0, Math.PI, back)
    if (t < ZH_BACK) emit(t, { count: 5, gap: 1, start: 2, life: 4 }, (i, age, f) => {
      const ang = rnd(a.seed, i) * TAU
      const d = 6 * (1 - f)
      dot(out, hx + Math.cos(ang) * d, hy + Math.sin(ang) * d, f < 0.5 ? lit : WHITE)
    })
  }
  const ix = g.mouth.x + g.side * (lunge + 1)
  if (t >= ZH_HIT && t < ZH_HIT + 4) burst(out, ix, hy, [3, 6, 5, 3][t - ZH_HIT], c)
  emit(t, { count: 3, gap: 2, start: ZH_HIT, life: 8 }, (i, age, f) => {
    const ang = g.side > 0 ? 0 : Math.PI
    ring(out, ix, hy, 2 + age * 1.3, f < 0.4 ? WHITE : f < 0.7 ? hi : c, ang, 0.9, f > 0.6 ? dotted : dot)
  })
  if (t >= ZH_HIT && t < ZH_HIT + 3) out.shake = [g.side * (t === ZH_HIT + 1 ? -2 : 2), 1]
}

// A night sky with a dark heart for stars to show on, wrapped around the body
function nightSky(out, g, x, y, rx, ry, f, t, c) {
  for (let py = Math.floor(y - ry); py <= Math.ceil(y + ry); py++) {
    for (let px = Math.floor(x - rx); px <= Math.ceil(x + rx); px++) {
      const d = Math.hypot((px - x) / rx, (py - y) / ry)
      if (d > f || px < 0 || px >= g.columns || py < 0 || py > g.ground) continue
      if (d > f * 0.8 && (px + py + (t >> 1)) % 2) continue
      back(out, px, py, mix(0x101438, c, 0.25 * (1 - d)))
    }
  }
}

const CP_STARS = 9
const CP_LINK = 14
const CP_FALL = 30

// Wrap the mon in a patch of night sky where stars wink on one by one and join up
// into a constellation, then each falls into the body with a flash
function cosmicpower(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { w, h } = sizeOf(g)
  const sky = easeOut(phase(t, 2, 10)) * (1 - easeIn(phase(t, 42, 50)))
  if (sky > 0) nightSky(out, g, g.cx, g.cy, w / 2 + 6, h / 2 + 3, sky, t, c)
  if (t >= 20 && t < 44) out.dy = -1

  const stars = []
  for (let i = 0; i < CP_STARS; i++) {
    const x = clamp(g.cx + (rnd(a.seed, i, 1) - 0.5) * (w + 10), 1, g.columns - 2)
    const y = clamp(g.top - 2 + rnd(a.seed, i, 2) * (h + 1), 1, g.ground - 2)
    stars.push([x, y])
  }
  const leave = (i) => CP_FALL + i * 1.2
  for (let i = 0; i < CP_STARS - 1; i++) {
    if (t < CP_LINK + i * 1.5 || t >= leave(i)) continue
    const f = phase(t, CP_LINK + i * 1.5, CP_LINK + i * 1.5 + 2)
    const [x0, y0] = stars[i]
    const [x1, y1] = stars[i + 1]
    line(out, x0, y0, lerp(x0, x1, f), lerp(y0, y1, f), lit, dotted)
  }
  let landed = false
  stars.forEach(([x, y], i) => {
    const born = 3 + i * 2
    if (t < born) return
    if (t < leave(i)) {
      if (t - born < 2) spark(out, x, y, 2, c)
      else if ((t + i) % 4 === 0) plus(out, x, y, c, WHITE)
      else dot(out, x, y, (t + i) % 4 === 1 ? hi : WHITE)
      return
    }
    const f = phase(t, leave(i), leave(i) + 4)
    if (f >= 1) {
      if (t < leave(i) + 5) landed = true
      return
    }
    const sx = lerp(x, g.cx, easeIn(f))
    const sy = lerp(y, g.cy, easeIn(f))
    line(out, lerp(x, g.cx, easeIn(Math.max(0, f - 0.3))), lerp(y, g.cy, easeIn(Math.max(0, f - 0.3))), sx, sy, deep)
    plus(out, sx, sy, hi, WHITE)
  })
  if (landed) out.shade = tint(WHITE, 0.45)
  else if (t >= 44 && t < 50) {
    out.shade = (x, y, col) => (rnd(a.seed, x * 97 + y, t >> 1) < 0.07 ? WHITE : mix(col, c, 0.15))
  }
}

const PS_SUMMON = 4
const PS_HOVER = 14
const PS_SLAM = 22
const PS_HIT = 26
const PS_TILES = 6

// Conjure a ring of glowing blocks around the target that turn slowly in the air,
// then slam them all into it at once and scatter the fragments
function psyshock(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  if (t >= 1 && t < PS_SUMMON) out.skew = lean(g, -g.side)
  else if (t >= PS_SUMMON && t < PS_SLAM) out.dy = -1
  else if (t >= PS_SLAM && t < PS_HIT + 2) out.skew = lean(g, g.side * 2)
  const live = phase(t, 0, PS_SUMMON) * (1 - phase(t, PS_HIT, PS_HIT + 6))
  if (live > 0) out.shade = glow(c, 0.3 * live)

  const R = g.foe ? clamp(foeHalf(g) + 4, 6, 10) : 7
  const spin = t < PS_HOVER ? 0 : (t - PS_HOVER) * 0.15
  const r = R * (1 - easeIn(phase(t, PS_SLAM, PS_HIT)))
  const palette = { h: WHITE, l: hi, c, e: deep }
  if (t >= PS_SUMMON && t < PS_HIT) {
    for (let i = 0; i < PS_TILES; i++) {
      const born = PS_SUMMON + i * 1.5
      if (t < born) continue
      const ang = (i / PS_TILES) * TAU + spin * g.side
      const x = tx + Math.cos(ang) * r
      const y = clamp(ty + Math.sin(ang) * r * 0.75, 2, g.ground - 2)
      const bob = t < PS_SLAM ? Math.round(Math.sin(t * 0.5 + i)) : 0
      if (t - born < 1.5) plus(out, x, y, c, WHITE)
      else stamp(out, x - 2, y - 2 + bob, ['hhle', 'hcce', 'lcce', 'eeee'], palette)
    }
  }
  if (t >= PS_HIT && t < PS_HIT + 4) {
    burst(out, tx, ty, [4, 7, 6, 3][t - PS_HIT], c)
    out.shake = [t % 2 ? 2 : -2, t % 2]
  }
  emit(t, { count: 12, gap: 0, start: PS_HIT, life: 12 }, (i, age, f) => {
    const ang = (i / 12) * TAU + rnd(a.seed, i) * 0.4
    const sp = 0.8 + rnd(a.seed, i, 1) * 0.7
    const x = tx + Math.cos(ang) * sp * age
    const y = ty + Math.sin(ang) * sp * age * 0.8 + age * age * 0.05
    if (f > 0.7 && t % 2) return
    dot(out, x, y, i % 2 ? hi : c)
    dot(out, x + 1, y, deep)
  })
}

const SN_BEATS = [6, 13, 20, 27]
const SN_FINAL = 34

// The mon and the target throb in step, each beat sending matching rings out of
// both, with a standing wave shivering in the air between them, and a last big pulse
function synchronoise(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { w, h } = sizeOf(g)
  const { x: tx, y: ty } = g.target
  const beats = [...SN_BEATS, SN_FINAL]
  const onBeat = beats.find((b) => t >= b && t < b + 2)
  if (onBeat !== undefined) {
    const big = onBeat === SN_FINAL ? 1.6 : 1
    out.sx = 1 + 0.05 * big
    out.sy = 1 + 0.05 * big
    if (t === onBeat) out.shade = tint(WHITE, 0.4)
    plus(out, tx, ty, hi, WHITE)
  } else if (t >= 4 && t < SN_FINAL + 6) out.shade = glow(c, 0.15)
  const clip = (o, x, y, col) => x >= 0 && x < g.columns && y >= 0 && y <= g.ground && dot(o, x, y, col)
  for (const b of beats) {
    const big = b === SN_FINAL
    emit(t, { count: 1, start: b, life: big ? 14 : 9 }, (i, age, f) => {
      const r = 2 + age * (big ? 2 : 1.6)
      const col = f < 0.3 ? WHITE : (b / 7) % 2 < 1 ? hi : c
      const paint = f > 0.6 ? (o, x, y, cc) => (Math.round(x) + Math.round(y)) % 2 && clip(o, x, y, cc) : clip
      const grow = r - 2
      const behind = (o, x, y, cc) => paint({ dots: o.under }, x, y, cc)
      oval(out, g.cx, g.cy, w / 2 + grow, h / 2 + grow * 0.75, col, behind)
      oval(out, tx, ty, r, r * 0.75, col, paint)
      if (big) oval(out, tx, ty, r - 1, (r - 1) * 0.75, deep, paint)
    })
  }
  if (t >= SN_FINAL && t < SN_FINAL + 4) out.shake = [t % 2 ? 2 : -2, t % 2]

  if (t >= 8 && t < SN_FINAL + 4) {
    const mid = Math.round((g.mouth.x + tx) / 2)
    const amp = 2 * Math.sin(t * 1.4) * (t >= SN_FINAL ? 1.6 : 1)
    for (let dy = -6; dy <= 6; dy++) {
      const x = mid + Math.sin(dy * 0.7) * amp
      dot(out, x, ty + dy, (dy + t) % 3 === 0 ? WHITE : Math.abs(dy) % 2 ? lit : deep)
    }
  }
}

const TK_GRAB = 8
const TK_LIFT = 18
const TK_DROP = 34

// Stare hard down a rippling thread that grips the target in four glowing brackets,
// and a ring of force under it hoists it up and holds it bobbing in the air
function telekinesis(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const live = phase(t, 0, 4) * (1 - phase(t, TK_DROP, TK_DROP + 6))
  if (live > 0) out.shade = glow(c, 0.3 * live)
  if (t >= 4 && t < TK_DROP + 2) out.dy = -1

  const fx = g.frontAt(g.top + 2)
  const fy = g.top + 2
  if (t >= 3 && t < 8) spark(out, fx, fy, t < 5 ? 1 : 2, c)
  if (t >= TK_GRAB - 2 && t < TK_DROP) {
    const ex = tx - g.side * 2
    const steps = Math.max(2, Math.abs(ex - fx))
    const shown = easeOut(phase(t, TK_GRAB - 2, TK_GRAB + 2))
    for (let k = 0; k <= steps * shown; k++) {
      const f = k / steps
      const col = (k + t) % 4 === 0 ? WHITE : (k + t) % 2 ? c : deep
      if ((k + t) % 4 === 3) continue
      dot(out, lerp(fx, ex, f), lerp(fy, ty - 3, f) + Math.sin(f * TAU * 1.5 - t * 0.8) * 1.2, col)
    }
  }

  const box = g.foe ?? { left: tx - 4, right: tx + 4, top: ty - 4, bottom: ty + 4 }
  const lift = 3 * easeOut(phase(t, TK_GRAB + 2, TK_LIFT)) * (1 - easeIn(phase(t, TK_DROP, TK_DROP + 4)))
  const bob = t >= TK_LIFT && t < TK_DROP ? Math.round(Math.sin(t * 0.5)) : 0
  if (t >= TK_GRAB && t < TK_DROP + 2 && (t < TK_DROP || t % 2)) {
    const pad = 1
    const up = Math.round(lift) + bob
    const corners = [
      [box.left - pad, box.top - pad - up, 1, 1], [box.right + pad, box.top - pad - up, -1, 1],
      [box.left - pad, box.bottom + pad - up, 1, -1], [box.right + pad, box.bottom + pad - up, -1, -1],
    ]
    for (const [x, y, sx, sy] of corners) {
      line(out, x, y, x + sx * 2, y, t % 4 < 2 ? hi : lit)
      line(out, x, y, x, y + sy * 2, t % 4 < 2 ? hi : lit)
      dot(out, x, y, WHITE)
    }
    const rx = (box.right - box.left) / 2 + 2
    const ry = Math.max(1, rx * 0.22)
    const ringY = Math.min(g.ground, box.bottom + 1) - up
    oval(out, (box.left + box.right) / 2, ringY, rx, ry, (t >> 1) % 2 ? hi : c, dot, (o, x, y) => back(o, x, y, deep))
  }
  emit(t, { count: 12, gap: 1.5, start: TK_GRAB + 2, life: 7 }, (i, age, f) => {
    const x = box.left - 1 + rnd(a.seed, i, 4) * (box.right - box.left + 2)
    const y = Math.min(g.ground, box.bottom + 1) - age * 1.3
    dot(out, x, y, f < 0.5 ? lit : c)
  })
  if (t >= TK_DROP + 3 && t < TK_DROP + 6) {
    const s = (t - TK_DROP - 2) * 2
    line(out, tx - s - 2, g.ground, tx - 2, g.ground, lit, dotted)
    line(out, tx + 2, g.ground, tx + s + 2, g.ground, lit, dotted)
  }
}

const GV_PRESS = 14
const GV_EASE = 34

// Heavy rings of force drop out of the sky one after another while everything rains
// downward, squashing the mon flat and rattling the strip as each ring hits the ground
function gravity(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { w } = sizeOf(g)
  const press = easeOut(phase(t, 6, GV_PRESS)) * (1 - easeInOut(phase(t, GV_EASE, 42)))
  out.sy = 1 - 0.1 * press
  out.sx = 1 + 0.06 * press
  if (t >= GV_PRESS && t < GV_EASE) out.dx = t % 4 < 2 ? 0 : 1
  if (press > 0) {
    const heavy = dark(c, 0.6)
    out.shade = (x, y, col) => mix(col, heavy, 0.3 * press)
  }
  const clip = (o, x, y, col) => x >= 0 && x < g.columns && y >= 0 && y <= g.ground && dot(o, x, y, col)
  emit(t, { count: 4, gap: 7, start: 3, life: 9 }, (i, age, f) => {
    const y = lerp(0, g.ground, easeIn(f))
    const rx = lerp(w / 2 + 10, w / 2 + 3, f)
    oval(out, g.cx, y + 1, rx, 1.5, deep, clip, back)
    oval(out, g.cx, y, rx, 1.5, f < 0.3 ? hi : c, clip, back)
    if (age === 8) out.shake = [0, 1]
  })
  emit(t, { count: 32, gap: 0.8, start: 5, life: 6 }, (i, age) => {
    const x = g.cx + (rnd(a.seed, i, 1) - 0.5) * (w + 20)
    const y = rnd(a.seed, i, 2) * g.ground * 0.5 + age * 3.2
    for (let k = 0; k < 3; k++) clip(out, x, y - k, k === 0 ? lit : k === 1 ? c : deep)
  })
  if (press > 0.5) {
    for (const [fx, dir] of [[g.left - 1, -1], [g.right + 1, 1]]) {
      const s = (t >> 1) % 3
      dot(out, fx + dir * s, g.ground - (s === 1 ? 1 : 0), 0xc8b28e)
      dot(out, fx + dir * (s + 1), g.ground, 0x9a8668)
    }
  }
}

const HW_FADE = 10
const HW_GONE = 22
const HW_FALL = 30
const HW_BACK = 36
const HW_WHOLE = 46

// Glow and rise as the body crumbles into motes that stream up into a wishing star,
// which twinkles, then falls back down and the mon forms again out of its light
function healingwish(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { w, h } = sizeOf(g)
  const top = Math.max(2, g.top - 6)
  const rise = easeOut(phase(t, 0, HW_FADE)) * (1 - easeInOut(phase(t, HW_BACK, 50)))
  out.dy = -Math.round(2 * rise)
  const fade = t < HW_BACK ? phase(t, HW_FADE, HW_GONE) : 1 - phase(t, HW_BACK, HW_WHOLE)
  const white = t < HW_BACK ? 0.15 + 0.6 * phase(t, 0, HW_GONE) : 0.75 * (1 - phase(t, HW_BACK, 52))
  if (t >= HW_GONE && t < HW_BACK) out.hidden = true
  else if (white > 0) {
    out.shade = (x, y, col) => (rnd(a.seed, x * 131 + y * 7, 9) < fade ? null : mix(col, WHITE, white))
  }

  emit(t, { count: 20, gap: 0.6, start: HW_FADE, life: 10 }, (i, age, f) => {
    const x0 = g.left + rnd(a.seed, i, 1) * w
    const y0 = g.top + rnd(a.seed, i, 2) * h - 2
    const x = lerp(x0, g.cx, easeIn(f)) + Math.sin(f * TAU + i) * 1.5
    const y = lerp(y0, top, easeIn(f))
    dot(out, x, y, f < 0.5 ? lit : WHITE)
    if (f < 0.6) dot(out, x, y + 1, c)
  })
  if (t >= 18 && t < HW_FALL) {
    const s = t < HW_GONE ? 1 : 2 + ((t >> 1) % 2)
    spark(out, g.cx, top, s, c)
    if (t >= HW_GONE) sparkles(out, t, a.seed, g.cx, top, 10, 5, lit, 3)
  } else if (t >= HW_FALL && t < HW_BACK) {
    const y = lerp(top, g.cy, easeIn(phase(t, HW_FALL, HW_BACK)))
    for (let k = 1; k <= 5; k++) dot(out, g.cx, y - k, k < 2 ? WHITE : k < 4 ? hi : deep)
    spark(out, g.cx, y, 2, c)
  }
  if (t >= HW_BACK && t < HW_BACK + 3) burst(out, g.cx, g.cy, [4, 6, 4][t - HW_BACK], c)
  emit(t, { count: 10, gap: 0, start: HW_BACK, life: 12 }, (i, age, f) => {
    const ang = (i / 10) * TAU
    const r = w / 2 + 1 + age * 0.6
    if (f > 0.6 && t % 2) return
    dot(out, g.cx + Math.cos(ang) * r, g.cy + Math.sin(ang) * r * 0.6 - age * 0.3, f < 0.5 ? WHITE : lit)
  })
  if (t >= HW_WHOLE && t < 54) sparkles(out, t, a.seed, g.cx, g.cy, w + 4, h, lit, 4)
}

// A heart of size s at x, y, flattened by squash, with a solid rim and a cross
// hatched middle like an ink stamp
function inkHeart(out, x, y, s, squash, c, rim, solid) {
  const inside = (px, py) => {
    const u = (px - x) / s
    const v = -(py - y) / (s * squash) + 0.1
    return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0
  }
  for (let py = Math.floor(y - s * 1.5); py <= Math.ceil(y + s * 1.5); py++) {
    for (let px = Math.floor(x - s * 1.4); px <= Math.ceil(x + s * 1.4); px++) {
      if (!inside(px, py)) continue
      const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1)
      if (edge) dot(out, px, py, rim)
      else if (solid || (px + py) % 2 === 0) dot(out, px, py, c)
    }
  }
}

const HS_CROUCH = 4
const HS_LAND = 12
const HS_LEAVE = 18
const HS_HOME = 30

// Hop over to the target and press a big heart stamp onto it with a thump, leaving
// an inked heart that flickers away while the mon bounces home
function heartstamp(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const { x: tx, y: ty } = g.target
  const dist = clamp(Math.round(g.reach - foeHalf(g) - 2), 2, 10)
  if (t < HS_CROUCH) out.sy = 1 - 0.08 * easeOut(phase(t, 0, HS_CROUCH))
  else if (t < HS_LAND) {
    const f = phase(t, HS_CROUCH, HS_LAND)
    out.dx = Math.round(dist * easeInOut(f)) * g.side
    out.dy = -Math.round(hop(f, 5))
    out.sy = 1.05
  } else if (t < HS_LEAVE) {
    out.dx = dist * g.side
    if (t < HS_LAND + 2) {
      out.sy = 0.9
      out.sx = 1.06
    }
    out.shade = tint(c, 0.2)
  } else {
    const f = phase(t, HS_LEAVE, HS_HOME)
    out.dx = Math.round(dist * (1 - easeInOut(f))) * g.side
    out.dy = -Math.round(hop(f, 3))
  }

  const s = clamp(g.foe ? foeHalf(g) : 4, 3.5, 5.5)
  if (t === HS_LAND - 1) inkHeart(out, tx, ty - 1, s * 1.3, 1, lit, c, false)
  else if (t >= HS_LAND && t < HS_LAND + 2) inkHeart(out, tx, ty, s * 1.15, 0.7, hi, deep, true)
  else if (t >= HS_LAND + 2 && t < 28 && (t < 22 || t % 2)) inkHeart(out, tx, ty - 1, s, 1, c, deep, false)
  if (t >= HS_LAND && t < HS_LAND + 4) {
    const r0 = s * 1.4 + 1
    const r1 = r0 + 1 + (t - HS_LAND)
    for (const ang of [-2.4, -0.7, 0.7, 2.4]) {
      line(out, tx + Math.cos(ang) * r0, ty + Math.sin(ang) * r0, tx + Math.cos(ang) * r1, ty + Math.sin(ang) * r1, t < HS_LAND + 2 ? WHITE : lit)
    }
    if (t < HS_LAND + 2) out.shake = [0, 1]
  }
  emit(t, { count: 2, gap: 4, start: HS_LAND + 3, life: 10 }, (i, age, f) => {
    if (f > 0.7 && t % 2) return
    const x = tx + (i ? 3 : -3) + Math.sin(age * 0.6) * 0.8
    stamp(out, x - 1, ty - s - 2 - age * 0.6, ['p.p', 'ppp', '.p.'], { p: i ? c : hi })
  })
}

// A crescent of radius r centered on x, y, its bow facing `angle`
function crescent(out, x, y, r, angle, spread, c, core) {
  ring(out, x, y, r + 1, dark(c, 0.45), angle, spread)
  ring(out, x, y, r, c, angle, spread)
  ring(out, x, y, r - 1, core, angle, spread * 0.8)
}

const PC_THROW = 8
const PC_CUT = 18

// Draw a glowing crescent blade out of the head, swing it loose to spin across to the
// target, and slice a bright cut that splits open and fizzles
function psychocut(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const { h } = sizeOf(g)
  const { x: tx, y: ty } = g.target
  if (t < PC_THROW) {
    out.dy = -1
    out.skew = lean(g, -g.side * 1.5 * phase(t, 0, 4))
  } else if (t < PC_THROW + 3) out.skew = lean(g, g.side * 3)
  else if (t < PC_THROW + 8) out.skew = lean(g, g.side * 3 * (1 - phase(t, PC_THROW + 3, PC_THROW + 8)))
  if (t < PC_CUT) out.shade = glow(c, 0.25)

  const by = g.top + Math.round(h * 0.25)
  const bx = g.mouth.x + g.side * 2
  const face = g.side > 0 ? 0 : Math.PI
  if (t >= 1 && t < PC_THROW) crescent(out, bx, by, 3, face - g.side * 0.5, 0.3 + phase(t, 1, 6) * 0.9, c, WHITE)
  else if (t >= PC_THROW && t < PC_CUT) {
    const f = easeIn(phase(t, PC_THROW, PC_CUT))
    const x = lerp(bx, tx, f)
    const y = lerp(by, ty, f)
    for (let k = 1; k <= 3; k++) {
      const p = easeIn(phase(t - k, PC_THROW, PC_CUT))
      dotted(out, lerp(bx, tx, p), lerp(by, ty, p), k < 2 ? lit : c)
    }
    crescent(out, x, y, 3, face + g.side * (t - PC_THROW) * 1.3, 1.2, c, WHITE)
  }

  // The slash runs corner to corner across the target, then its two edges part
  const half = clamp(g.foe ? foeHalf(g) + 2 : 5, 4, 8)
  const x0 = tx - g.side * half
  const y0 = ty - half
  const x1 = tx + g.side * half
  const y1 = ty + half
  if (t >= PC_CUT && t < PC_CUT + 3) {
    const f = phase(t, PC_CUT, PC_CUT + 2)
    line(out, x0, y0 - 1, lerp(x0, x1, f), lerp(y0, y1, f) - 1, hi)
    line(out, x0, y0, lerp(x0, x1, f), lerp(y0, y1, f), WHITE)
    out.shake = [g.side * (t % 2 ? -1 : 2), 0]
  } else if (t >= PC_CUT + 3 && t < PC_CUT + 14) {
    const f = phase(t, PC_CUT + 3, PC_CUT + 14)
    const sep = 1 + f * 2
    const paint = f > 0.5 ? dotted : dot
    line(out, x0 + sep * g.side, y0 - sep, x1 + sep * g.side, y1 - sep, f < 0.3 ? WHITE : c, paint)
    line(out, x0 - sep * g.side, y0 + sep, x1 - sep * g.side, y1 + sep, f < 0.3 ? hi : lit, paint)
    if (t % 2) {
      plus(out, x0, y0, c, WHITE)
      plus(out, x1, y1, c, WHITE)
    }
  }
}

const SP_FIRE = 22

// Gather a ring of colored orbs, one per stored boost, circling the body faster and
// tighter, then fire them in a stream that pounds the target with a growing burst
function storedpower(out, t, a, g, c) {
  const { w } = sizeOf(g)
  const { x: tx, y: ty } = g.target
  const n = 3 + Math.floor(rnd(a.seed, 0, 7) * 3)
  const end = SP_FIRE + n * 2 + 6
  const stored = Math.min(n, Math.max(0, Math.floor((t - 2) / 3) + 1))
  const live = phase(t, 0, 4) * (1 - phase(t, end, end + 6))
  if (live > 0) out.shade = glow(c, (0.08 + 0.05 * Math.min(stored, n)) * live)
  if (t >= 4 && t < SP_FIRE) out.sy = 1 - 0.04 * phase(t, 4, SP_FIRE)

  const tight = easeIn(phase(t, 14, SP_FIRE))
  const rx = w / 2 + 3 - tight * 2
  const turn = t * (0.3 + tight * 0.25)
  for (let k = 0; k < n; k++) {
    const born = 2 + k * 3
    const launch = SP_FIRE + k * 2
    const hue = BOOSTS[k % BOOSTS.length]
    if (t < born) continue
    if (t < launch) {
      const ang = turn + (k / n) * TAU
      const x = g.cx + Math.cos(ang) * rx
      const y = g.cy + Math.sin(ang) * 2.5
      if (t - born < 2) spark(out, x, y, 2, hue)
      else if (Math.sin(ang) >= 0) bead(out, x, y, hue)
      else {
        back(out, x, y, hue)
        back(out, x + 1, y, dark(hue, 0.4))
      }
      continue
    }
    if (t === launch) out.dx = g.side
    const f = phase(t, launch, launch + 6)
    if (f >= 1) {
      if (t < launch + 8) burst(out, tx, ty, 2 + (t - launch - 6), hue)
      continue
    }
    const sx = g.mouth.x
    const sy = g.mouth.y + (k - (n - 1) / 2)
    const x = lerp(sx, tx, easeIn(f))
    const y = lerp(sy, ty, f)
    for (let d = 1; d <= 3; d++) dot(out, x - g.side * d * 1.5, y, d < 2 ? light(hue, 0.4) : dark(hue, 0.3))
    bead(out, x, y, hue)
  }
  if (t >= end && t < end + 4) {
    burst(out, tx, ty, [3, n + 3, n + 2, n][t - end], c)
    out.shake = [t % 2 ? 1 : -1, t % 2]
  }
  if (t >= end + 2 && t < end + 8) ring(out, tx, ty, 2 + (t - end) * 1.3, t % 2 ? WHITE : c, 0, Math.PI, dotted)
}

const LP_FLARE = 14
const LP_RAYS = 18
const LP_FADE = 30
const LP_END = 36
const GOLD = 0xb88a20

// Draw light in from all around into a pale orb that flares blinding white, then
// fan out a sheaf of gleaming rays that washes over the target in a cross shaped gleam
function lusterpurge(out, t, a, g, c) {
  const [hi] = ramp(c)
  const { y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const ox = g.ahead(3)
  if (t < LP_FLARE) {
    out.skew = lean(g, -g.side * phase(t, 0, LP_FLARE))
    out.shade = glow(WHITE, 0.3 * phase(t, 0, LP_FLARE))
  } else if (t < LP_RAYS) out.shade = tint(WHITE, 0.55)
  else if (t < LP_END) {
    out.dx = t < LP_RAYS + 4 ? -g.side : 0
    out.shade = glow(c, 0.3 * (1 - phase(t, LP_FADE, LP_END)))
  }

  if (t < LP_FLARE) {
    emit(t, { count: 12, gap: 1, start: 0, life: 6 }, (i, age, f) => {
      const ang = rnd(a.seed, i) * TAU
      const r0 = 10 * (1 - easeIn(f))
      const r1 = Math.max(1, r0 - 3)
      line(out, ox + Math.cos(ang) * r0, my + Math.sin(ang) * r0 * 0.7, ox + Math.cos(ang) * r1, my + Math.sin(ang) * r1 * 0.7, f < 0.5 ? hi : WHITE)
    })
    const r = 0.8 + 2.2 * phase(t, 0, LP_FLARE)
    disc(out, ox, my, r + 0.8, GOLD)
    ball(out, ox, my, r, c)
  } else if (t < LP_RAYS) {
    burst(out, ox, my, 4 + (t - LP_FLARE) * 1.5, c)
    disc(out, ox, my, 2.5, WHITE)
  }

  if (t >= LP_RAYS && t < LP_END) {
    const grow = easeOut(phase(t, LP_RAYS, LP_RAYS + 5))
    const paint = t >= LP_FADE ? dotted : dot
    const len = Math.abs(tx - ox) + 4
    for (let d = 0; d <= len * grow; d++) {
      const x = ox + g.side * d
      const y = lerp(my, ty, d / len)
      const half = lerp(0.5, 5, d / len)
      for (let k = -Math.ceil(half); k <= Math.ceil(half); k++) {
        if (Math.abs(k) >= half - 0.3) paint(out, x, y + k, GOLD)
        else if (k === 0) paint(out, x, y, WHITE)
        else if ((d - t * 2 + Math.abs(k) * 3 + 50) % 5 < 2) paint(out, x, y + k, Math.abs(k) < 2 ? WHITE : hi)
      }
    }
    disc(out, ox, my, 1.5, WHITE)
  }
  if (t >= LP_RAYS + 4 && t < LP_END + 4) {
    const s = 3 + (t % 4 < 2 ? 2 : 0) - Math.round(3 * phase(t, LP_FADE, LP_END + 4))
    for (const d of [-1, 1]) {
      line(out, tx - s - 1, ty + d, tx + s + 1, ty + d, GOLD)
      line(out, tx + d, ty - s - 1, tx + d, ty + s + 1, GOLD)
    }
    spark(out, tx, ty, Math.max(1, s), hi)
  }
  if (t >= LP_RAYS && t < LP_RAYS + 3) out.shake = [g.side * (t % 2 ? 1 : -1), 0]
  if (t >= LP_END && t < 48) sparkles(out, t, a.seed, tx, ty, 14, 10, hi, 5)
}

const MB_BLOW = 10
const MB_POP = 32

// Puff up a ball of downy mist and blow it out to bob slowly across, shedding wisps,
// then it bursts over the target into a soft cloud that drifts up and thins away
function mistball(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const { y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const sx = g.ahead(3)
  if (t >= 2 && t < MB_BLOW) out.sy = 1 + 0.05 * phase(t, 2, MB_BLOW)
  else if (t >= MB_BLOW && t < MB_BLOW + 4) {
    out.dx = g.side
    out.skew = lean(g, g.side * 2)
  }
  const pathAt = (f) => [lerp(sx, tx, easeInOut(f)), lerp(my, ty, f) + Math.sin(f * TAU * 1.5) * 2]

  if (t < MB_BLOW) puff(out, sx, my, 1 + 2.2 * phase(t, 0, MB_BLOW), c, a.seed + (t >> 1))
  else if (t < MB_POP) {
    const f = phase(t, MB_BLOW, MB_POP)
    emit(t, { count: 10, gap: 2, start: MB_BLOW, life: 8 }, (i, age, wf) => {
      const [wx, wy] = pathAt(phase(t - age, MB_BLOW, MB_POP))
      const paint = wf > 0.4 ? dotted : dot
      disc(out, wx - g.side * 2, wy - age * 0.2, 1.4 * (1 - wf) + 0.5, wf < 0.4 ? lit : c, paint)
    })
    const [x, y] = pathAt(f)
    puff(out, x, y, 3.2, c, a.seed + (t >> 1))
    const ang = t * 0.7 * g.side
    dot(out, x + Math.cos(ang) * 1.5, y + Math.sin(ang) * 1.5, WHITE)
  }
  if (t >= MB_POP && t < MB_POP + 3) {
    disc(out, tx, ty, 2 + (t - MB_POP) * 2, t === MB_POP ? WHITE : hi, dotted)
    out.shake = [0, t === MB_POP ? 1 : 0]
  }
  emit(t, { count: 6, gap: 0.5, start: MB_POP, life: 14 }, (i, age, f) => {
    const ang = (i / 6) * TAU + 0.4
    const d = 2 + easeOut(f) * 5
    const x = tx + Math.cos(ang) * d
    const y = ty + Math.sin(ang) * d * 0.6 - age * 0.35
    const r = 1.5 + easeOut(f) * 2.2
    if (f < 0.55) puff(out, x, y, r, c, a.seed + i)
    else disc(out, x, y, r * 0.8, f < 0.75 ? lit : c, (o, px, py, cc) => (px + py + t) % 3 === 0 && dot(o, px, py, cc))
  })
  emit(t, { count: 8, gap: 1, start: MB_POP + 2, life: 10 }, (i, age) => {
    const x = tx + (rnd(a.seed, i, 6) - 0.5) * 14 + Math.sin(age * 0.5 + i) * 1.2
    dot(out, x, ty - 4 + age * 0.5, i % 2 ? WHITE : hi)
  })
}

const PB_SQUEEZE = 20
const PB_FIRE = 26
const PB_BOOM = 34
const PB_SAG = 40

// Shudder while a storm of colored sparks spirals into a swelling orb, crush it down
// to a white hot point, hurl it with a rainbow trail and blow the target apart, then
// sag from the strain
function psychoboost(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const { h } = sizeOf(g)
  const { y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const ox = g.ahead(4)
  const R = clamp(h / 3, 3, 6)
  if (t < PB_FIRE) {
    out.dx = t >= 6 && t % 2 ? g.side : 0
    out.shade = glow(c, 0.2 + 0.2 * Math.abs(Math.sin(t * (0.3 + t * 0.02))))
    if (t >= PB_SQUEEZE) out.sy = 0.95
  } else if (t < PB_BOOM) {
    out.dx = -g.side * Math.round(2 * (1 - phase(t, PB_FIRE, PB_BOOM)))
    out.skew = lean(g, -g.side * 2 * (1 - phase(t, PB_FIRE, PB_BOOM)))
  } else if (t >= PB_SAG) {
    const sag = Math.sin(Math.PI * phase(t, PB_SAG, 57))
    out.sy = 1 - 0.06 * sag
    out.sx = 1 + 0.03 * sag
    if (sag > 0.05) out.shade = (x, y, col) => mix(col, deep, 0.25 * sag)
  }

  if (t < PB_SQUEEZE) {
    emit(t, { count: 26, gap: 0.6, start: 0, life: 8 }, (i, age, f) => {
      const ang = rnd(a.seed, i) * TAU + f * 3 * g.side
      const r = 11 * (1 - easeIn(f)) + R
      dot(out, ox + Math.cos(ang) * r, my + Math.sin(ang) * r * 0.7, f > 0.7 ? WHITE : hsl((i / 26 + t * 0.02) % 1, 0.9, 0.62))
    })
  }
  if (t < PB_FIRE) {
    const r = t < PB_SQUEEZE ? lerp(1, R, easeOut(phase(t, 2, PB_SQUEEZE))) : lerp(R, 1.5, easeIn(phase(t, PB_SQUEEZE, PB_FIRE)))
    ring(out, ox, my, r + 1, hsl((t * 0.07) % 1, 0.9, 0.55))
    if (t < PB_SQUEEZE) ball(out, ox, my, r, c)
    else disc(out, ox, my, r, (t >> 1) % 2 ? WHITE : hi)
  } else if (t < PB_BOOM) {
    const f = easeIn(phase(t, PB_FIRE, PB_BOOM))
    const x = lerp(ox, tx, f)
    const y = lerp(my, ty, f)
    for (let k = 1; k <= 8; k++) {
      const col = hsl((k * 0.12 + t * 0.05) % 1, 0.9, 0.6)
      dot(out, x - g.side * k, y - 1, col)
      dot(out, x - g.side * k, y, col)
      dot(out, x - g.side * k, y + 1, dark(col, 0.3))
    }
    disc(out, x, y, 2.3, c)
    disc(out, x, y, 1.4, WHITE)
  }
  const clip = (o, x, y, col) => x >= 0 && x < g.columns && y >= 0 && y <= g.ground && dot(o, x, y, col)
  if (t >= PB_BOOM && t < PB_BOOM + 2) disc(out, tx, ty, 4 + (t - PB_BOOM) * 2, WHITE, clip)
  emit(t, { count: 4, gap: 2, start: PB_BOOM, life: 12 }, (i, age, f) => {
    const col = hsl((i * 0.22 + 0.85) % 1, 0.9, f < 0.4 ? 0.75 : 0.6)
    ring(out, tx, ty, 3 + age * 1.8, col, 0, Math.PI, f > 0.6 ? (o, x, y, cc) => (Math.round(x) + Math.round(y)) % 2 && clip(o, x, y, cc) : clip)
  })
  if (t >= PB_BOOM + 1 && t < PB_BOOM + 7) {
    const len = 4 + (t - PB_BOOM) * 2
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * TAU + 0.13
      const r0 = len * 0.4
      line(out, tx + Math.cos(ang) * r0, ty + Math.sin(ang) * r0, tx + Math.cos(ang) * len, ty + Math.sin(ang) * len, k % 2 ? hi : WHITE, clip)
    }
  }
  if (t >= PB_BOOM && t < PB_BOOM + 6) out.shake = [t % 2 ? 2 : -2, t % 2 ? 1 : -1]
}

export const PSYCHIC = {
  futuresight: { ticks: 56, color: 0xc070ff, draw: futuresight },
  psywave: { ticks: 44, color: 0xff7ae0, draw: psywave },
  calmmind: { ticks: 48, color: 0xa890ff, pose: { view: 'front' }, draw: calmmind },
  mirrorcoat: { ticks: 44, color: 0xffa8e8, draw: mirrorcoat },
  extrasensory: { ticks: 44, color: 0xff58c8, draw: extrasensory },
  zenheadbutt: { ticks: 34, color: 0x9a7aff, draw: zenheadbutt },
  cosmicpower: { ticks: 52, color: 0x8a9aff, pose: { view: 'front' }, draw: cosmicpower },
  psyshock: { ticks: 40, color: 0xff70d0, draw: psyshock },
  synchronoise: { ticks: 48, color: 0x8aa0ff, draw: synchronoise },
  telekinesis: { ticks: 44, color: 0xffa0f0, draw: telekinesis },
  gravity: { ticks: 48, color: 0x8a6aff, pose: { view: 'front' }, draw: gravity },
  healingwish: { ticks: 56, color: 0xffa8dc, pose: { view: 'front' }, draw: healingwish },
  heartstamp: { ticks: 34, color: 0xff5a9a, draw: heartstamp },
  psychocut: { ticks: 36, color: 0xe05aff, draw: psychocut },
  storedpower: { ticks: 48, color: 0xff7ad0, draw: storedpower },
  lusterpurge: { ticks: 52, color: 0xfff0a8, draw: lusterpurge },
  mistball: { ticks: 48, color: 0xffa8d0, draw: mistball },
  psychoboost: { ticks: 60, color: 0xff5ab4, draw: psychoboost },
}
