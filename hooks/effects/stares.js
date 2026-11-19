// Normal status moves aimed at the foe: stares, taunts, and body language

import {
  BLACK, WHITE, back, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, lean, lerp, light, line, luma, mix, phase,
  plus, puff, ramp, ring, rimGlow, rnd, shownAt, skewAt, spark, sparkles, stamp, tint,
} from './draw.js'

const TAU = Math.PI * 2
const NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const UP = ['..a..', '.aaa.', 'aaaaa', '.aaa.', '.aaa.']
const DOWN = [...UP].reverse()
const QUESTION = ['.qq.', 'q..q', '...q', '..q.', '....', '..q.']
const BANG = ['qq', 'qq', 'qq', '..', 'qq']
const MINI_HEART = ['hh.hh', 'hhhhh', '.hhh.', '..h..']
const TINY_HEART = ['h.h', 'hhh', '.h.']
const HEART = ['.hh.hh.', 'hhhhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...']
const Z_SMALL = ['zzzz', '..z.', '.z..', 'zzzz']
const Z_BIG = ['zzzzz', '...z.', '..z..', '.z...', 'zzzzz']

// Every other pixel, for things breaking up as they fade
const dotted = (out, x, y, c) => (Math.round(x) + Math.round(y)) % 2 && dot(out, x, y, c)

// How far the beat is through [from, to) and then back out of [back, end)
const hold = (t, from, to, back, end, ease = easeOut) => ease(phase(t, from, to)) * (1 - easeInOut(phase(t, back, end)))

// Roughly where the eye shows: a quarter of the way down, just inside the front edge
function eyeOf(g, out) {
  const y = g.top + Math.round((g.bottom - g.top + 1) * 0.25)
  return shownAt(g, out, g.frontAt(y) - g.side * 2, y)
}

// Half the foe's width, or a guess at a foe's size when there is none
const foeHalf = (g) => (g.foe ? Math.max(2, (g.foe.right - g.foe.left) / 2) : 3)

// Just above the target's head
function headOf(g) {
  const top = g.foe ? g.foe.top : g.target.y - 4
  return { x: g.target.x, y: Math.max(3, top - 2) }
}

// Pixel art centered on x, y with a one pixel outline so it reads on any background
function outlined(out, x, y, art, pal, edge, paint = dot) {
  const ox = Math.round(x - (art[0].length - 1) / 2)
  const oy = Math.round(y - (art.length - 1) / 2)
  const rim = {}
  for (const k of Object.keys(pal)) rim[k] = edge
  for (const [dx, dy] of NEAR) stamp(out, ox + dx, oy + dy, art, rim, false, paint)
  stamp(out, ox, oy, art, pal, false, paint)
}

// A filled ellipse
function oval(out, x, y, rx, ry, c, paint = dot) {
  for (let py = Math.floor(y - ry); py <= Math.ceil(y + ry); py++) {
    for (let px = Math.floor(x - rx); px <= Math.ceil(x + rx); px++) {
      if (((px - x) / Math.max(0.5, rx)) ** 2 + ((py - y) / Math.max(0.5, ry)) ** 2 <= 1.05) paint(out, px, py, c)
    }
  }
}

// An ellipse outline, sampled about once per pixel
function ellipse(out, x, y, rx, ry, c, turn = 0, paint = dot) {
  const steps = Math.max(8, Math.ceil((rx + ry) * 3))
  for (let k = 0; k < steps; k++) {
    const ang = turn + (k / steps) * TAU
    paint(out, x + rx * Math.cos(ang), y + ry * Math.sin(ang), c)
  }
}

const LEER_GLINT = 6
const LEER_SHOT = 10
const LEER_HIT = 15

// Narrow the eyes, flash a glint, then fire two thin glare lines that set the target
// shivering as its guard drops
function leer(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const squint = hold(t, 0, LEER_GLINT, 24, 32)
  out.sy = 1 - 0.06 * squint
  out.skew = lean(g, g.side * 2 * squint)
  if (t >= LEER_SHOT && t < LEER_SHOT + 6) out.dx = g.side
  const eye = eyeOf(g, out)
  const { x: tx, y: ty } = g.target
  if (t >= LEER_GLINT && t < LEER_SHOT + 2) spark(out, eye.x, eye.y, t === LEER_GLINT + 1 ? 3 : 2, c)
  if (t >= LEER_SHOT && t < 24) {
    const f = easeOut(phase(t, LEER_SHOT, LEER_HIT))
    const paint = t >= 20 ? dotted : dot
    for (const d of [-1, 1]) {
      const y0 = eye.y + (d < 0 ? -1 : 0)
      const ex = lerp(eye.x, tx, f)
      const ey = lerp(y0, ty + d * 2, f)
      line(out, eye.x + g.side, y0 + 1, ex, ey + 1, deep, paint)
      line(out, eye.x + g.side, y0, ex, ey, t < LEER_SHOT + 2 ? WHITE : lit, paint)
      if (f < 1) dot(out, ex, ey, WHITE)
    }
  }

  // The target shivers and a down arrow sinks beside it
  if (t >= LEER_HIT && t < 32) {
    const w = foeHalf(g) + 2
    const jig = t % 2 ? 1 : 0
    for (const s of [-1, 1]) {
      for (let k = 0; k < 5; k++) dot(out, tx + s * (w + ((k + jig) % 2)), ty - 2 + k, k % 2 ? c : lit)
    }
    const age = t - LEER_HIT
    if (age < 14 && !(age > 10 && t % 2)) {
      const hx = clamp(tx + g.side * (w + 3), 3, g.columns - 4)
      outlined(out, hx, headOf(g).y + age * 0.35, DOWN, { a: c }, deep)
    }
  }
}

// A looming shadow face: angry slanted eyes and a jagged grin, r pixels wide
function shadowFace(out, x, y, r, c, fading) {
  const fill = dark(c, 0.65)
  const eyeC = 0xffe23a
  const pupil = 0xd01818
  const mouth = 0x2a0610
  for (let py = Math.floor(y - r * 0.9); py <= Math.ceil(y + r * 0.9); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const u = (px - x) / r
      const v = (py - y) / (r * 0.9)
      const d = u * u + v * v
      if (d > 1.05) continue
      let col = d > 0.72 ? c : fill
      // e is the distance from the eye's middle, negative toward the nose, so the
      // inner corners sit lower and the eyes scowl
      const e = Math.abs(u) - 0.42
      const top = -0.26 - 0.66 * e
      if (Math.abs(e) < 0.25 && v > top && v < 0.04) col = Math.abs(e) < 0.09 && v > top + 0.14 ? pupil : eyeC
      if (Math.abs(u) < 0.55 && v > 0.28 && v < 0.66) {
        const tooth = 1 - Math.abs((((u + 0.55) * 6) % 1) * 2 - 1)
        col = v < 0.28 + 0.2 * tooth || v > 0.66 - 0.2 * (1 - tooth) ? WHITE : mouth
      }
      if (col === fill && (fading || r < 3)) dotted(out, px, py, col)
      else if (fading && (px + py + 1) % 2) continue
      else dot(out, px, py, col)
    }
  }
}

const SCARY_RISE = 8
const SCARY_FULL = 18
const SCARY_LUNGE = 24
const SCARY_HIT = 29

// Rear up and darken while a huge shadow face swells between the mon and the target,
// then lunges at it with a jolt
function scaryface(out, t, a, g, c) {
  const rear = hold(t, 0, SCARY_RISE, 32, 40)
  out.sy = 1 + 0.08 * rear
  out.sx = 1 - 0.03 * rear
  out.skew = lean(g, -g.side * 2 * rear)
  if (rear > 0.05) out.shade = tint(dark(c, 0.5), 0.35 * rear)
  if (t >= SCARY_LUNGE && t < SCARY_HIT) out.dx = g.side
  const { x: tx, y: ty } = g.target
  const R = clamp(Math.min(g.ground * 0.32, g.reach * 0.5), 4, 9)
  if (t >= SCARY_RISE && t < 38) {
    const grow = easeOut(phase(t, SCARY_RISE, SCARY_FULL))
    const lunge = easeIn(phase(t, SCARY_LUNGE, SCARY_HIT))
    const r = lerp(1.5, R, grow) * (1 + 0.25 * lunge) + (t >= SCARY_FULL && t < SCARY_LUNGE && t % 4 < 2 ? 0.5 : 0)
    const start = g.mouth.x + g.side * Math.max(g.reach * 0.45, r + 1)
    const x = clamp(lerp(start, tx, lunge), r, g.columns - 1 - r)
    const y = clamp(ty - 2, r * 0.9, g.ground - r * 0.9)
    shadowFace(out, x, y, r, c, t >= SCARY_HIT + 3)
  }
  if (t >= SCARY_HIT && t < SCARY_HIT + 4) out.shake = [g.side * (t % 2 ? 2 : -1), t === SCARY_HIT ? 1 : 0]
  emit(t, { count: 6, gap: 0, start: SCARY_HIT, life: 8 }, (i, age, f) => {
    const ang = (i / 6) * TAU + 0.4
    const d = foeHalf(g) + 1 + age * 0.8
    if (f > 0.6 && t % 2) return
    line(out, tx + Math.cos(ang) * d, ty + Math.sin(ang) * d * 0.7, tx + Math.cos(ang) * (d + 2), ty + Math.sin(ang) * (d + 2) * 0.7, light(c, 0.4))
  })
}

const WHIP_TURN = 3
const WHIP_BACK = 29

// Turn around and wag the tail at the target, swish arcs flicking off the rear while
// question marks bob over the target's head
function tailwhip(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const turned = t >= WHIP_TURN && t < WHIP_BACK
  out.flipX = turned
  const wag = Math.sin(((t - WHIP_TURN) * TAU) / 6) * (1 - phase(t, WHIP_BACK - 5, WHIP_BACK))
  if (turned) {
    out.skew = lean(g, -wag * 2.5)
    out.dy = t % 6 < 3 ? 0 : -1
  } else if (t < WHIP_TURN) out.dx = -g.side * (t > 0 ? 1 : 0)
  if (turned && t < WHIP_BACK - 3) {
    const ty0 = g.top + Math.round((g.bottom - g.top) * 0.55)
    const bx = (g.side > 0 ? g.right : g.left) + g.side + skewAt(out, ty0)
    const up = wag > 0 ? 1 : -1
    const base = g.side > 0 ? 0 : Math.PI
    const ang = base - up * 0.75 * g.side
    const r = clamp((g.bottom - g.top) * 0.3, 3, 6)
    ring(out, bx - g.side * 2, ty0, r + 1, deep, ang, 0.8)
    ring(out, bx - g.side * 2, ty0, r, Math.abs(wag) > 0.7 ? WHITE : hi, ang, 0.75)
    ring(out, bx - g.side * 2, ty0, r - 1, lit, ang, 0.5)
    for (let k = 0; k < 3; k++) dot(out, bx + g.side * (r - 1 + k), ty0 - up * (r + k * 0.5), k ? c : lit)
  }
  if (t >= 10 && t < 34 && !(t > 30 && t % 2)) {
    const head = headOf(g)
    const s = wag > 0 ? 1 : -1
    outlined(out, head.x + s * 2, head.y - 2 + (t % 6 < 3 ? 0 : 1), QUESTION, { q: lit }, deep)
  }
}

const SWAG_SPOT = 2
const SWAG_PUFF = 8
const SWAG_STRUT = 12
const SWAG_TAUNT = 30

// A spotlight snaps on and the mon puffs its chest and struts in place, then the
// target flushes red as its anger rises
function swagger(out, t, a, g, c) {
  const warm = 0xfff2b8
  const edge = 0xc0a050
  const on = t >= SWAG_SPOT && t < 40 && !(t < SWAG_SPOT + 3 && t % 2) && !(t > 36 && t % 2)
  if (on) {
    const half = (g.right - g.left) / 2 + 3
    for (let y = 0; y <= g.ground; y++) {
      const w = lerp(1, half, y / g.ground)
      back(out, g.cx - w, y, edge)
      back(out, g.cx + w, y, edge)
      for (let x = Math.ceil(g.cx - w + 1); x <= g.cx + w - 1; x++) if ((x + y + (t >> 1)) % 3 === 0) back(out, x, y, warm)
    }
    for (let x = Math.round(g.cx - half); x <= g.cx + half; x++) back(out, x, g.ground, warm)
  }
  const puffed = hold(t, SWAG_PUFF, SWAG_PUFF + 4, 34, 40)
  out.sx = 1 + 0.1 * puffed
  out.sy = 1 + 0.06 * puffed
  out.skew = lean(g, -g.side * 1.5 * puffed)
  if (t >= SWAG_STRUT && t < SWAG_TAUNT) out.dy = t % 8 < 4 ? -1 : 0
  if (t >= SWAG_STRUT && t < SWAG_TAUNT && t % 4 < 3) {
    const cy = Math.max(3, g.top - 1)
    const n = t % 8 < 4 ? 2 : 3
    for (const [ux, uy] of [[0, -1], [-0.8, -0.6], [0.8, -0.6]]) {
      line(out, g.cx + ux * 2, cy + uy * 1, g.cx + ux * (2 + n), cy + uy * (1 + n), t % 8 < 4 ? WHITE : c)
    }
  }

  // The target fumes: red arrows rise beside it and a dizzy swirl spins over it
  const angry = mix(c, 0xff2020, 0.6)
  emit(t, { count: 4, gap: 3, start: SWAG_TAUNT, life: 9 }, (i, age, f) => {
    if (f > 0.7 && t % 2) return
    const s = i % 2 ? 1 : -1
    outlined(out, g.target.x + s * (foeHalf(g) + 2), g.target.y + 2 - age * 0.8, UP, { a: angry }, dark(angry, 0.5))
  })
  if (t >= SWAG_TAUNT + 2 && t < 44) {
    const head = headOf(g)
    for (let k = 0; k < 10; k++) {
      const ang = t * 0.5 + k * 0.6
      const r = 0.5 + k * 0.3
      dot(out, head.x + Math.cos(ang) * r * 1.4, head.y + Math.sin(ang) * r * 0.7, k < 4 ? WHITE : angry)
    }
  }
}

const DISABLE_RING = 8
const DISABLE_SLASH = 14
const DISABLE_SLAM = 17
const DISABLE_BREAK = 30

// Point at the target and stare while a no-entry sign forms over it, the slash
// slamming down with a jolt
function disable(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const point = hold(t, 2, 8, 26, 34)
  out.skew = lean(g, g.side * 2 * point)
  if (t >= DISABLE_SLAM && t < DISABLE_SLAM + 2) out.dx = g.side
  const eye = eyeOf(g, out)
  if (t >= 5 && t < 10) spark(out, eye.x, eye.y, t === 6 ? 2 : 1, c)
  const { x: tx, y: ty } = g.target
  const R = clamp(Math.round(g.ground * 0.22), 4, 7)
  if (t < DISABLE_RING || t >= 38) return
  const paint = t >= DISABLE_BREAK ? dotted : dot
  const r = R * easeOut(phase(t, DISABLE_RING, DISABLE_SLASH)) + (t >= DISABLE_SLAM && t < DISABLE_SLAM + 2 ? 1 : 0)
  if (r < 1) return
  const flash = t < DISABLE_RING + 2 || (t >= DISABLE_SLAM && t < DISABLE_SLAM + 2)
  ring(out, tx, ty, r + 1, deep, 0, Math.PI, paint)
  ring(out, tx, ty, r, flash ? WHITE : c, 0, Math.PI, paint)
  if (r > 2) ring(out, tx, ty, r - 1, flash ? hi : c, 0, Math.PI, paint)
  if (t >= DISABLE_SLASH) {
    const f = easeIn(phase(t, DISABLE_SLASH, DISABLE_SLAM))
    const k = (r - 0.5) * 0.7
    // The slash runs from the far top corner down toward the mon's side
    const x0 = tx + g.side * k
    const y0 = ty - k
    const x1 = lerp(x0, tx - g.side * k, f)
    const y1 = lerp(y0, ty + k, f)
    line(out, x0, y0 + 1, x1, y1 + 1, deep, paint)
    line(out, x0, y0, x1, y1, flash ? WHITE : c, paint)
    line(out, x0 - g.side, y0, x1 - g.side, y1, hi, paint)
  }
  if (t >= DISABLE_SLAM && t < DISABLE_SLAM + 3) out.shake = [t === DISABLE_SLAM ? g.side : -g.side, 0]
  if (t >= DISABLE_BREAK) {
    emit(t, { count: 8, gap: 0, start: DISABLE_BREAK, life: 8 }, (i, age) => {
      const ang = (i / 8) * TAU
      dot(out, tx + Math.cos(ang) * (R + age * 0.7), ty + Math.sin(ang) * (R + age * 0.7), i % 2 ? c : deep)
    })
  }
}

const ENCORE_CLAPS = [5, 11, 17, 23]
const ENCORE_LOOP = 18

// Hop and clap with sparks and confetti, cheering for more, while a looping repeat
// arrow spins over the target
function encore(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const fx = g.mouth.x + g.side * 2
  const fy = g.mouth.y + 2
  for (const clap of ENCORE_CLAPS) {
    const age = t - clap
    if (age >= 0 && age < 2) {
      out.sy = 0.94
      out.sx = 1.04
    } else if (age >= 2 && age < 5) out.dy = -1
    if (age >= 0 && age < 3) burst(out, fx, fy, [2, 3, 2][age], age ? c : hi)
  }
  if (t >= ENCORE_CLAPS[0] && t < 28) out.skew = lean(g, (t % 12 < 6 ? 1 : -1) * g.side)
  emit(t, { count: 14, gap: 1.4, start: 6, life: 12 }, (i, age, f) => {
    if (f > 0.75 && t % 2) return
    const x = g.cx + (rnd(a.seed, i) - 0.5) * (g.right - g.left + 6) + Math.sin(age * 0.6 + i) * 1
    const y = Math.max(1, g.top + 2 - age * 0.9 - rnd(a.seed, i, 1) * 3)
    const col = [hi, c, lit, light(c, 0.85)][i % 4]
    if (i % 3 === 0) plus(out, x, y, col, WHITE)
    else {
      dot(out, x, y, col)
      dot(out, x + 1, y, dark(col, 0.3))
    }
  })

  // A circle of arrow chasing its own tail, pulsing on each clap
  if (t >= ENCORE_LOOP && t < 44 && !(t > 40 && t % 2)) {
    const head = headOf(g)
    const x = head.x
    const y = Math.max(5, head.y - 2)
    const r = 3.5 + (t % 6 < 2 ? 0.5 : 0)
    const spin = t * 0.4 * g.side
    const mid = spin + 0.8 * Math.PI
    ring(out, x, y, r + 1, deep, mid, 0.8 * Math.PI)
    ring(out, x, y, r, t < ENCORE_LOOP + 2 ? WHITE : c, mid, 0.8 * Math.PI)
    const end = spin + 1.6 * Math.PI
    const px = x + Math.cos(end) * r
    const py = y + Math.sin(end) * r
    const tx = -Math.sin(end) * g.side
    const ty = Math.cos(end) * g.side
    plus(out, px, py, hi, WHITE)
    dot(out, px - tx * 1.5 + Math.cos(end) * 1.5, py - ty * 1.5 + Math.sin(end) * 1.5, deep)
    dot(out, px - tx * 1.5 - Math.cos(end) * 1.5, py - ty * 1.5 - Math.sin(end) * 1.5, deep)
  }
}

const SNIFF_START = 6
const SNIFF_END = 30
const SNIFF_FOUND = 31

// Drop the nose and sniff in short pulls while wavy scent trails creep from the target
// to the nose, then an exclamation pops up when the trail is found
function odorsleuth(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const low = hold(t, 0, 6, SNIFF_END, SNIFF_END + 6)
  out.skew = lean(g, g.side * 2.5 * low)
  out.dy = Math.round(low)
  if (t >= SNIFF_START && t < SNIFF_END && t % 4 === 0) out.sy = 0.97
  if (t >= SNIFF_FOUND && t < SNIFF_FOUND + 4) out.dy = -1
  const nose = shownAt(g, out, g.mouth.x - g.side, g.mouth.y + 1)
  const { x: tx, y: ty } = g.target
  if (t >= SNIFF_START && t < SNIFF_END) {
    for (let i = 0; i < 3; i++) {
      const y0 = ty - 2 + (i - 1) * 3
      for (let k = 0; k < 12; k++) {
        const s = ((t - SNIFF_START) * 0.04 + k * 0.03 + i * 0.31) % 1
        // Trails thin out as they leave the target and as the nose takes them in
        if (s < 0.05 || s > 0.95) continue
        const x = lerp(tx, nose.x + g.side, s)
        const y = lerp(y0, nose.y, s) + Math.sin(s * TAU * 1.5 + i * 2 - t * 0.35) * 1.5 * (1 - s)
        dot(out, x, y + 1, deep)
        dot(out, x, y, k === 11 ? hi : k % 3 === 0 ? lit : c)
      }
    }
    if (t % 4 < 2) {
      dot(out, nose.x + g.side, nose.y, WHITE)
      dot(out, nose.x + g.side * 2, nose.y - 1, lit)
    }
  }
  if (t >= SNIFF_FOUND && t < 41 && !(t > 38 && t % 2)) {
    const pop = t < SNIFF_FOUND + 2 ? -1 : 0
    outlined(out, shownAt(g, out, g.cx, g.top).x + g.side * 2, Math.max(3, g.top - 3) + pop, BANG, { q: 0xfff2a0 }, 0x5a2a00)
    sparkles(out, t, a.seed, tx, ty, foeHalf(g) * 2 + 4, 10, lit, 5)
  }
}

// A magnifying glass: a lens ring with a glint and a handle trailing back toward the user
function magnifier(out, x, y, r, side, c, paint = dot) {
  const [hi, , , deep] = ramp(c)
  const hx = x - side * (r + 0.5) * 0.7
  const hy = y + (r + 0.5) * 0.7
  line(out, hx, hy + 1, hx - side * 3, hy + 4, 0x40220e, paint)
  line(out, hx, hy, hx - side * 3, hy + 3, 0xa06a3a, paint)
  ring(out, x, y, r + 1, deep, 0, Math.PI, paint)
  ring(out, x, y, r, c, 0, Math.PI, paint)
  for (let py = Math.ceil(y - r + 1); py < y + r - 1; py++) {
    for (let px = Math.ceil(x - r + 1); px < x + r - 1; px++) if ((px + py) % 3 === 0) paint(out, px, py, light(c, 0.8))
  }
  paint(out, x - r * 0.4, y - r * 0.4, WHITE)
  paint(out, x - r * 0.4 + 1, y - r * 0.4, hi)
}

const LENS_FLY = 6
const LENS_ARRIVE = 15
const LENS_SEE = 24
const LENS_GONE = 34

// The eye shines and a magnifying glass flies out to hover over the target, scanning
// side to side until it flashes as it sees through it
function foresight(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const focus = hold(t, 0, 4, 30, 36)
  out.skew = lean(g, g.side * 1.5 * focus)
  out.sy = 1 - 0.03 * focus
  const eye = eyeOf(g, out)
  if (t >= 2 && t < LENS_FLY + 2) spark(out, eye.x, eye.y, t === 3 ? 3 : 2, c)
  if (t < LENS_FLY || t >= LENS_GONE + 4) return
  const { x: tx, y: ty } = g.target
  const f = easeInOut(phase(t, LENS_FLY, LENS_ARRIVE))
  const scan = t >= LENS_ARRIVE ? Math.sin((t - LENS_ARRIVE) * 0.45) * 2 : 0
  const x = lerp(eye.x + g.side * 2, tx, f) + scan
  const y = lerp(eye.y, ty - 1, f) - Math.sin(f * Math.PI) * 3
  const r = lerp(1.5, 3.5, f) + (t >= LENS_SEE && t < LENS_SEE + 2 ? 1 : 0)
  if (t >= LENS_FLY && t < LENS_ARRIVE) {
    for (let k = 1; k < 4; k++) {
      const p = easeInOut(phase(t - k, LENS_FLY, LENS_ARRIVE))
      dot(out, lerp(eye.x + g.side * 2, tx, p), lerp(eye.y, ty - 1, p) - Math.sin(p * Math.PI) * 3, k === 1 ? lit : c)
    }
  }
  magnifier(out, x, y, r, g.side, c, t >= LENS_GONE ? dotted : dot)
  const age = t - LENS_SEE
  if (age >= 0 && age < 6) {
    ring(out, x, y, r + 2 + age, age < 2 ? WHITE : hi, 0, Math.PI, age < 3 ? dot : dotted)
    if (age < 2) burst(out, x - r * 0.4, y - r * 0.4, 2, hi)
  }
}

const SCENT_START = 4
const SCENT_PUFFS = 8
const SCENT_GAP = 3
const SCENT_LIFE = 16

// Sway gently while soft pink puffs of scent rise off the body and drift over to
// swirl around the target
function sweetscent(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const live = phase(t, 0, 4) * (1 - phase(t, 36, 44))
  const sway = Math.sin((t * TAU) / 14) * live
  if (live > 0) out.skew = lean(g, sway * 2)
  const { x: tx, y: ty } = g.target
  emit(t, { count: SCENT_PUFFS, gap: SCENT_GAP, start: SCENT_START, life: SCENT_LIFE }, (i, age, f) => {
    const sx = g.cx + (rnd(a.seed, i) - 0.5) * (g.right - g.left) * 0.6
    const sy = g.top + 2
    const x = lerp(sx, tx + (rnd(a.seed, i, 1) - 0.5) * 6, easeInOut(f))
    const y = clamp(lerp(sy, ty - 1, f) - Math.sin(f * Math.PI) * 4 + Math.sin(f * TAU * 2 + i) * 1, 2, g.ground - 2)
    const r = lerp(1.2, 2.2, Math.sin(f * Math.PI))
    if (f > 0.85 && t % 2) return
    puff(out, x, y, r, i % 2 ? c : lit, a.seed + i)
    if (i % 3 === 0 && f > 0.3) dot(out, x + 2, y - 2, WHITE)
  })

  // Curls of perfume wind around the target as the scent gathers there
  if (t >= 22 && t < 44 && !(t > 40 && t % 2)) {
    const w = foeHalf(g) + 2
    for (let s = 0; s < 2; s++) {
      const turn = t * 0.3 + s * Math.PI
      for (let k = 0; k < 7; k++) {
        const ang = turn + k * 0.25
        dot(out, tx + Math.cos(ang) * w, ty + Math.sin(ang) * w * 0.55, k === 6 ? WHITE : k > 3 ? hi : c)
      }
    }
    sparkles(out, t, a.seed, tx, ty - 1, w * 2, 10, lit, 4)
  }
}

const YAWN_OPEN = 4
const YAWN_WIDE = 12
const YAWN_BLOW = 14
const YAWN_POP = 34

// Stretch up into a huge yawn and breathe out a lazy bubble that drifts to the target
// and pops into a trail of drowsy Zs
function yawn(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const stretch = hold(t, 0, YAWN_WIDE, YAWN_BLOW, YAWN_BLOW + 8)
  out.sy = 1 + 0.1 * stretch
  out.sx = 1 - 0.04 * stretch
  out.skew = lean(g, -g.side * 2 * stretch)
  const droop = hold(t, YAWN_BLOW + 6, YAWN_BLOW + 12, 38, 46)
  if (droop > 0.5) out.dy = 1
  const open = easeOut(phase(t, YAWN_OPEN, YAWN_WIDE)) * (1 - phase(t, YAWN_BLOW, YAWN_BLOW + 2))
  const m = shownAt(g, out, g.mouth.x - g.side, g.mouth.y + 1)
  if (open > 0.1) {
    const k = clamp((g.bottom - g.top) / 10, 1, 2.2) * open
    oval(out, m.x, m.y, 0.6 + k, 0.5 + k * 1.5, deep)
    oval(out, m.x, m.y, k * 0.7, k * 1.15, 0x2a1428)
  }
  const { x: tx, y: ty } = g.target
  if (t >= YAWN_BLOW && t < YAWN_POP) {
    const f = easeInOut(phase(t, YAWN_BLOW, YAWN_POP))
    const x = lerp(m.x + g.side * 3, tx, f)
    const y = clamp(lerp(m.y - 1, ty - 2, f) + Math.sin(f * TAU) * 1.5, 4, g.ground - 4)
    const r = lerp(1.5, 3.5, phase(t, YAWN_BLOW, YAWN_BLOW + 5)) + (t % 8 < 4 ? 0 : 0.4)
    for (let py = Math.ceil(y - r + 1); py < y + r; py++) {
      for (let px = Math.ceil(x - r + 1); px < x + r; px++) if ((px + py) % 2 && (px - x) ** 2 + (py - y) ** 2 < (r - 1) ** 2) dot(out, px, py, light(c, 0.75))
    }
    ring(out, x, y, r, dark(c, 0.3))
    ring(out, x, y, r - 1, c, -Math.PI / 2, Math.PI / 2)
    dot(out, x - r * 0.45, y - r * 0.45, WHITE)
    dot(out, x - r * 0.45 + 1, y - r * 0.45, hi)
  }
  const pop = t - YAWN_POP
  if (pop >= 0 && pop < 4) ring(out, tx, ty - 2, 4 + pop, pop < 2 ? WHITE : lit, 0, Math.PI, dotted)
  emit(t, { count: 4, gap: 3.5, start: YAWN_POP + 1, life: 11 }, (i, age, f) => {
    if (f > 0.8 && t % 2) return
    const x = tx + g.side * (i % 2 ? 1 : -2) + Math.sin(age * 0.5 + i) * 1.5
    const y = Math.max(3, ty - 3 - age * 0.9)
    outlined(out, x, y, i % 2 ? Z_SMALL : Z_BIG, { z: i % 2 ? lit : WHITE }, deep)
  })
}

const ATTRACT_AIM = 10
const ATTRACT_HIT = 19

// Blush and take aim, then loose a heart tipped arrow that sticks in the target and
// leaves a ring of little hearts circling it
function attract(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const lean0 = hold(t, 2, ATTRACT_AIM, ATTRACT_AIM, ATTRACT_AIM + 4)
  out.skew = lean(g, -g.side * 2 * lean0)
  if (t >= ATTRACT_AIM && t < ATTRACT_AIM + 3) out.dx = g.side
  const blush = hold(t, 2, 6, 10, 16)
  if (blush > 0) out.shade = tint(c, 0.2 * blush)
  const { x: tx, y: ty } = g.target
  const from = g.ahead(1)
  if (t >= ATTRACT_AIM && t < ATTRACT_HIT) {
    const f = phase(t, ATTRACT_AIM, ATTRACT_HIT)
    const tip = lerp(from + g.side * 4, tx - g.side * 2, f)
    const y = lerp(g.mouth.y, ty, f) - Math.sin(f * Math.PI) * 2
    const tail = f < 0.3 ? tip - g.side * 4 : tip - g.side * 9
    line(out, tail, y, tip - g.side * 3, y, 0xc8a070)
    if (f >= 0.3) for (const d of [-1, 1]) line(out, tail, y, tail - g.side * 2, y + d * 2, lit)
    outlined(out, tip, y, HEART, { h: c }, deep)
    dot(out, tip - 1, y - 1, WHITE)
  }
  const age = t - ATTRACT_HIT
  if (age >= 0 && age < 4) burst(out, tx, ty, [3, 5, 4, 2][age], age < 2 ? WHITE : c)
  if (age >= 2 && t < 42 && !(t > 39 && t % 2)) {
    const rx = foeHalf(g) + 3
    for (let i = 0; i < 5; i++) {
      const ang = (t - ATTRACT_HIT) * 0.25 * g.side + (i / 5) * TAU
      const near = Math.sin(ang) > 0
      const x = tx + Math.cos(ang) * rx
      const y = ty + Math.sin(ang) * 3
      if (near) outlined(out, x, y, MINI_HEART, { h: i % 2 ? c : hi }, deep)
      else stamp(out, Math.round(x - 1), Math.round(y - 1), TINY_HEART, { h: lit })
    }
  }
}

// One corner of a bracket: an L of len pixels, its arms pointing in sx, sy
function corner(out, x, y, sx, sy, len, c) {
  line(out, x, y, x + sx * len, y, c)
  line(out, x, y, x, y + sy * len, c)
}

const LOCK_SCAN = 4
const LOCK_SHUT = 14
const LOCK_HOLD = 32

// Crouch and steady while a scan line sweeps out and corner brackets snap shut on the
// target, a crosshair flashing as it locks
function lockon(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const crouch = hold(t, 0, 4, 30, 36)
  out.sy = 1 - 0.05 * crouch
  out.sx = 1 + 0.02 * crouch
  const eye = eyeOf(g, out)
  if (t >= 1 && t < 5) dot(out, eye.x, eye.y, t % 2 ? WHITE : c)
  const { x: tx, y: ty } = g.target
  if (t >= LOCK_SCAN && t < LOCK_SHUT + 2) {
    const steps = Math.max(1, Math.abs(tx - eye.x))
    for (let k = 1; k < steps; k++) {
      if ((k + t) % 3) continue
      dot(out, eye.x + g.side * k, lerp(eye.y, ty, k / steps), (k + t) % 6 ? deep : c)
    }
  }
  if (t < LOCK_SCAN + 2 || t >= LOCK_HOLD + 4) return
  const final = clamp(Math.round(foeHalf(g)) + 1, 3, 6)
  const box = lerp(final + 6, final, easeOut(phase(t, LOCK_SCAN + 2, LOCK_SHUT)))
  const locked = t >= LOCK_SHUT && t < LOCK_SHUT + 3
  const blink = t >= LOCK_HOLD || (t > LOCK_SHUT + 3 && t % 4 === 3)
  if (blink && t % 2) return
  const col = locked ? WHITE : t < LOCK_SHUT ? deep : c
  const len = Math.max(2, Math.round(box * 0.45))
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) corner(out, tx + sx * box, ty + sy * box, -sx, -sy, len, col)
  if (t >= LOCK_SHUT) {
    for (const s of [-1, 1]) {
      line(out, tx + s * 2, ty, tx + s * (final + 2), ty, locked ? hi : c)
      line(out, tx, ty + s * 2, tx, ty + s * (final + 2), locked ? hi : c)
    }
    dot(out, tx, ty, locked ? WHITE : hi)
  }
  if (locked) ring(out, tx, ty, final + 3 + (t - LOCK_SHUT), hi, 0, Math.PI, dotted)
}

// A giant almond eye, open pixels tall at the middle, its slit pupil shifted by look
function giantEye(out, x, y, w, open, look, c) {
  const deep = dark(c, 0.55)
  const iris = Math.max(1, Math.min(open, 3))
  for (let py = Math.floor(y - open - 1); py <= Math.ceil(y + open + 1); py++) {
    for (let px = Math.floor(x - w); px <= Math.ceil(x + w); px++) {
      const u = (px - x) / w
      if (Math.abs(u) > 1) continue
      const lid = open * (1 - u * u)
      const dv = Math.abs(py - y)
      if (dv > lid + 0.5) continue
      let col = 0xf2eaff
      const di = Math.hypot(px - x - look, py - y)
      if (di < iris + 0.3) col = di > iris - 0.7 ? deep : c
      if (Math.abs(px - x - look) < 0.6 && dv < iris) col = BLACK
      if (dv > lid - 0.6) col = deep
      dot(out, px, py, col)
    }
  }
}

const LOOK_OPEN = 8
const LOOK_WIDE = 16
const LOOK_SHUT = 36

// Darken and go still while a giant eye opens over the target and dark rings close
// around it so it can't slip away
function meanlook(out, t, a, g, c) {
  const deep = dark(c, 0.55)
  const stare = hold(t, 2, 8, 36, 44)
  if (stare > 0.05) out.shade = (x, y, col) => (luma(col) < 60 ? col : mix(col, dark(c, 0.6), 0.45 * stare))
  out.sy = 1 + 0.03 * stare
  out.skew = lean(g, g.side * stare)
  const { x: tx, y: ty } = g.target
  const head = headOf(g)
  const w = clamp(Math.round(foeHalf(g) + 3), 6, 10)
  const ey = clamp(head.y - 2, 5, g.ground - 5)
  if (t >= LOOK_OPEN && t < LOOK_SHUT + 6) {
    const open = 3.5 * easeOut(phase(t, LOOK_OPEN, LOOK_WIDE)) * (1 - easeIn(phase(t, LOOK_SHUT, LOOK_SHUT + 5)))
    const blink = t >= 24 && t < 26 ? 0.3 : 1
    const look = Math.round(Math.sin((t - LOOK_WIDE) * 0.25) * 1.5)
    if (open * blink < 0.6) line(out, tx - w, ey, tx + w, ey, deep)
    else giantEye(out, tx, ey, w, open * blink, t >= LOOK_WIDE ? look : 0, c)
  }
  if (t >= LOOK_WIDE && t < LOOK_SHUT + 4) {
    const f = easeOut(phase(t, LOOK_WIDE, LOOK_WIDE + 10))
    for (let k = 0; k < 2; k++) {
      const rx = lerp(foeHalf(g) + 7, foeHalf(g) + 2, f) + k * 1.5
      const turn = t * 0.2 * (k ? -1 : 1)
      const paint = (o, x, y, col) => (Math.floor((Math.atan2(y - ty, x - tx) - turn + 7 * TAU) * 3) % 2 ? dot(o, x, y, col) : null)
      ellipse(out, tx, ty + 1 + k * 2, rx, 2 + k, k ? deep : c, 0, t >= LOOK_SHUT ? dotted : paint)
    }
  }
}

// Pixel art scaled up by a whole factor
const big = (art, k) => art.flatMap((row) => Array(k).fill([...row].map((ch) => ch.repeat(k)).join('')))

const DIGITS = {
  3: ['ddd', '..d', '.dd', '..d', 'ddd'],
  2: ['ddd', '..d', 'ddd', 'd..', 'ddd'],
  1: ['.d.', 'dd.', '.d.', '.d.', 'ddd'],
}
const NOTE = ['..n..', '..nn.', '..n.n', 'nnn..', 'nnn..']
const PERISH_COUNT = [[18, 3], [27, 2], [36, 1]]
const PERISH_END = 46

// Sway through a somber tune whose dark notes drift out, then a countdown ticks down
// over the target from three to one and fades in a dark ripple
function perishsong(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const live = phase(t, 0, 4) * (1 - phase(t, 44, 52))
  if (live > 0) out.skew = lean(g, Math.sin((t * TAU) / 18) * 2.5 * live)
  const { x: tx, y: ty } = g.target
  const m = shownAt(g, out, g.mouth.x, g.mouth.y)
  emit(t, { count: 8, gap: 4, start: 2, life: 14 }, (i, age, f) => {
    if (f > 0.8 && t % 2) return
    const toFoe = i % 2 === 0
    const x = toFoe ? lerp(m.x + g.side * 2, tx, f) : m.x - g.side * (age * 0.4) + Math.sin(age * 0.5) * 1.5
    const y = toFoe ? lerp(m.y - 1, ty - 3, f) + Math.sin(f * TAU) * 2 : Math.max(3, m.y - 2 - age * 0.9)
    outlined(out, x, y, NOTE, { n: dark(c, 0.45) }, lit)
  })
  for (const [from, n] of PERISH_COUNT) {
    const age = t - from
    if (age < 0 || age >= 9) continue
    const art = age < 1 ? DIGITS[n] : big(DIGITS[n], 2)
    const y = clamp(ty - 1, 6, g.ground - 6) + (age === 1 ? -1 : 0)
    outlined(out, tx, y, art, { d: age < 2 ? WHITE : light(c, 0.55) }, dark(c, 0.6), age > 6 && t % 2 ? dotted : dot)
    if (age < 3) ring(out, tx, y, 6 + age * 1.5, age ? c : WHITE, 0, Math.PI, dotted)
    if (age === 1) out.shake = [g.side, 0]
  }
  emit(t, { count: 3, gap: 2, start: PERISH_END, life: 7 }, (i, age) => {
    ellipse(out, tx, ty + 1, 3 + age * 1.6, 1 + age * 0.6, i ? deep : c, 0, dotted)
  })
}

const WINK = ['w...w', '.w.w.']

// Flutter a wink in a coy lean while the body shines, then a ribbon of glitter and
// tiny hearts curls to the target and hearts float up off it
function captivate(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const coy = hold(t, 2, 8, 30, 38)
  out.skew = lean(g, -g.side * 2 * coy)
  if (t >= 10 && t < 13) out.dy = -1
  const shine = hold(t, 4, 8, 18, 24)
  if (shine > 0.05) out.shade = rimGlow(g, out, light(c, 0.5), 0.12 * shine, WHITE, 0.5 * shine)
  const eye = eyeOf(g, out)
  if (t >= 6 && t < 13) {
    stamp(out, eye.x - 2, eye.y, WINK, { w: 0x3a0a28 })
    if (t >= 8) spark(out, eye.x + g.side * 2, eye.y - 2, t === 9 ? 2 : 1, c)
  }
  const { x: tx, y: ty } = g.target
  emit(t, { count: 18, gap: 1, start: 12, life: 10 }, (i, age, f) => {
    const x = lerp(eye.x + g.side * 2, tx, f)
    const y = lerp(eye.y, ty - 1, f) + Math.sin(f * TAU + i * 0.7) * 3
    if (i % 3 === 0) stamp(out, Math.round(x - 1), Math.round(y - 1), TINY_HEART, { h: i % 2 ? c : hi })
    else if (f < 0.7) dot(out, x, y, (t + i) % 3 ? lit : WHITE)
  })
  emit(t, { count: 6, gap: 2, start: 26, life: 12 }, (i, age, f) => {
    if (f > 0.75 && t % 2) return
    const s = i % 2 ? 1 : -1
    const x = tx + s * (foeHalf(g) * 0.6 + rnd(a.seed, i) * 2) + Math.sin(age * 0.6 + i) * 1
    outlined(out, x, Math.max(3, ty - age * 0.9), MINI_HEART, { h: i % 3 ? c : hi }, deep)
  })
}

// A feather: a quill spine of len pixels at angle ang with barbs swelling in the middle
function feather(out, x, y, ang, len, c) {
  const ux = Math.cos(ang)
  const uy = Math.sin(ang)
  const vane = light(c, 0.55)
  for (let k = 0; k <= len; k++) {
    const px = x + ux * k
    const py = y + uy * k
    const w = Math.round(Math.sin((k / len) * Math.PI) * 2.2)
    for (let j = 1; j <= w; j++) {
      dot(out, px - uy * j - ux * j * 0.4, py + ux * j - uy * j * 0.4, j === w ? dark(c, 0.2) : vane)
      dot(out, px + uy * j - ux * j * 0.4, py - ux * j - uy * j * 0.4, j === w ? dark(c, 0.2) : vane)
    }
  }
  line(out, x, y, x + ux * len, y + uy * len, dark(c, 0.45))
}

const TICKLE_FLY = 5
const TICKLE_ON = 12
const TICKLE_OFF = 32

// Reach out and float a feather over to the target that wiggles up and down its side,
// the target quivering with laughter while the mon giggles along
function tickle(out, t, a, g, c) {
  const [, lit, , deep] = ramp(c)
  const reach = hold(t, 2, 8, 30, 36)
  out.dx = Math.round(g.side * 2 * reach)
  out.skew = lean(g, g.side * 1.5 * reach)
  if (t >= TICKLE_ON && t < TICKLE_OFF && t % 4 < 2) out.dy = -1
  const { x: tx, y: ty } = g.target
  const edge = g.foe ? (g.side > 0 ? g.foe.left : g.foe.right) - g.side * 2 : tx - g.side * 3
  const len = clamp(Math.round(g.reach * 0.3), 6, 8)
  const toward = g.side > 0 ? 0 : Math.PI
  if (t >= TICKLE_FLY && t < TICKLE_OFF + 6) {
    const fly = easeOut(phase(t, TICKLE_FLY, TICKLE_ON))
    const busy = t >= TICKLE_ON && t < TICKLE_OFF
    const drift = phase(t, TICKLE_OFF, TICKLE_OFF + 6)
    // The quill sits back from the target so the tip brushes its side
    const x = lerp(g.ahead(2), edge - g.side * len, fly)
    const y = lerp(g.mouth.y, ty, fly) + (busy ? Math.sin(t * 1.3) * 3 : 0) + drift * 4
    const ang = toward + (busy ? Math.sin(t * 0.9) * 0.6 : -0.4 * g.side) - g.side * drift
    if (!(drift > 0.5 && t % 2)) feather(out, x, y, ang, len, c)
  }
  if (t >= TICKLE_ON + 2 && t < TICKLE_OFF + 2) {
    const w = foeHalf(g) + 2
    const jig = t % 2 ? 1 : -1
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) dot(out, tx + s * (w + 1) + (k === 1 ? jig : 0), ty - 4 + k, lit)
      line(out, tx + s * w, ty + 2, tx + s * (w + 2), ty + 1 + (t % 4 < 2 ? 0 : 1), deep)
    }
    const head = headOf(g)
    if (t % 6 < 4) for (const s of [-1, 1]) outlined(out, head.x + s * 2, head.y - 1 - (t % 6 < 2 ? 1 : 0), ['h.h', '.h.'], { h: WHITE }, deep)
  }
}

const CHEVRON = ['.c.', 'c.c']
const PSYCH_READ = 4
const PSYCH_FLOW = 10
const PSYCH_FULL = 30

// Stare at the target until it pulses, then draw a stream of chevrons out of it into
// the body, which glows brighter and sends up arrows of its own
function psychup(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const eye = eyeOf(g, out)
  if (t >= 2 && t < 6) spark(out, eye.x, eye.y, t === 3 ? 2 : 1, c)
  const { x: tx, y: ty } = g.target
  emit(t, { count: 3, gap: 2, start: PSYCH_READ, life: 6 }, (i, age) => {
    ring(out, tx, ty, 2 + age * 1.2, age < 2 ? WHITE : c, 0, Math.PI, age > 3 ? dotted : dot)
  })
  emit(t, { count: 14, gap: 1.4, start: PSYCH_FLOW, life: 10 }, (i, age, f) => {
    const s = i % 2 ? 1 : -1
    const x = lerp(tx, g.cx, easeIn(f))
    const y = lerp(ty, g.cy, f) - Math.sin(f * Math.PI) * (3 + s * 2)
    outlined(out, x, y, CHEVRON, { c: f < 0.3 ? WHITE : i % 3 ? c : hi }, deep)
  })
  const glow = hold(t, PSYCH_FLOW + 4, PSYCH_FULL, PSYCH_FULL + 4, PSYCH_FULL + 10)
  if (glow > 0.05) out.shade = rimGlow(g, out, c, 0.25 * glow, t % 4 < 2 ? WHITE : hi, 0.7 * glow)
  out.sy = 1 + 0.05 * glow
  if (t >= PSYCH_FULL && t < PSYCH_FULL + 3) out.dy = -1
  emit(t, { count: 4, gap: 2, start: PSYCH_FULL, life: 8 }, (i, age, f) => {
    if (f > 0.7 && t % 2) return
    const x = g.cx + (i % 2 ? 1 : -1) * ((g.right - g.left) / 2 - 1 - (i >> 1) * 2)
    outlined(out, x, Math.max(3, g.top + 2 - age), UP, { a: i % 2 ? lit : c }, deep)
  })
}

// A thick plank from x0, y0 to x1, y1 with a lit top edge and a dark underside
function plank(out, x0, y0, x1, y1, c, paint = dot) {
  const [, lit, , deep] = ramp(c)
  line(out, x0, y0 + 1, x1, y1 + 1, deep, paint)
  line(out, x0, y0, x1, y1, c, paint)
  line(out, x0, y0 - 1, x1, y1 - 1, lit, paint)
}

const BLOCK_SPREAD = 4
const BLOCK_DROP = 9
const BLOCK_LAND = 15
const BLOCK_FADE = 32

// Plant the feet and spread wide, and a crossed barricade slams down behind the target
// to cut off its escape
function block(out, t, a, g, c) {
  const wide = hold(t, BLOCK_SPREAD, BLOCK_SPREAD + 5, BLOCK_FADE - 2, BLOCK_FADE + 4)
  out.sx = 1 + 0.12 * wide
  out.sy = 1 - 0.05 * wide
  out.dx = Math.round(g.side * wide)
  const H = clamp(Math.round(g.ground * 0.45), 6, 12)
  const W = Math.round(H * 0.45)
  const { x: tx } = g.target
  const behind = g.foe ? (g.side > 0 ? g.foe.right : g.foe.left) + g.side * (W + 2) : tx + g.side * 2
  const bx = clamp(behind, W + 1, g.columns - 2 - W)
  const floor = g.ground - 1
  const by = lerp(-H - 2, floor - H, easeIn(phase(t, BLOCK_DROP, BLOCK_LAND)))
  if (t >= BLOCK_DROP && t < BLOCK_FADE + 6) {
    const paint = t >= BLOCK_FADE && t % 2 ? dotted : dot
    plank(out, bx - W, by, bx + W, by + H, c, paint)
    plank(out, bx + W, by, bx - W, by + H, c, paint)
    plank(out, bx - W - 1, by + H * 0.45, bx + W + 1, by + H * 0.45, light(c, 0.15), paint)
    for (const s of [-1, 1]) dot(out, bx + s * W, by + H * 0.45, 0x404040)
  }
  const age = t - BLOCK_LAND
  if (age >= 0 && age < 3) out.shake = [0, age === 0 ? 2 : age === 1 ? -1 : 0]
  emit(t, { count: 8, gap: 0, start: BLOCK_LAND, life: 8 }, (i, life, f) => {
    const s = i % 2 ? 1 : -1
    const x = bx + s * (W + 1 + life * (0.6 + rnd(a.seed, i) * 0.6))
    dot(out, x, floor - life * 0.4 + life * life * 0.04, f < 0.5 ? 0xc8b28e : 0x9a8668)
  })
  if (t === BLOCK_SPREAD + 5) out.shake = [g.side, 0]
}

const THOUGHT_ASK = 12
const THOUGHT_KNOW = 24
const THOUGHT_END = 36

// A third eye glows on the forehead and links to the target, whose thought bubble
// shows a question that flips to a bright exclamation as its mind is read
function mindreader(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const focus = hold(t, 0, 5, THOUGHT_END - 2, THOUGHT_END + 4)
  out.skew = lean(g, g.side * focus)
  const brow = shownAt(g, out, Math.round(lerp(g.cx, g.frontAt(g.top + 2), 0.5)), g.top + Math.max(1, Math.round((g.bottom - g.top) * 0.12)))
  if (t >= 3 && t < THOUGHT_END) {
    const pulse = t % 6 < 3
    outlined(out, brow.x, brow.y, ['.d.', 'ddd', '.d.'], { d: pulse ? WHITE : hi }, deep)
    if (pulse) ring(out, brow.x, brow.y, 3, c, 0, Math.PI, dotted)
  }
  const head = headOf(g)
  const bx = head.x
  const bY = clamp(head.y - 3, 4, g.ground - 4)
  if (t >= 8 && t < THOUGHT_END - 2) {
    const steps = Math.max(2, Math.round(Math.hypot(bx - brow.x, bY - brow.y)))
    for (let k = 1; k < steps; k++) {
      if ((k + t) % 3) continue
      const f = k / steps
      dot(out, lerp(bx, brow.x, f), lerp(bY, brow.y, f) - Math.sin(f * Math.PI) * 2, (k + t) % 6 ? c : WHITE)
    }
  }
  if (t < THOUGHT_ASK - 4 || t >= THOUGHT_END + 4) return
  const fading = t >= THOUGHT_END
  if (fading && t % 2) return
  const s = -g.side
  dot(out, bx + s * 3, bY + 5, WHITE)
  if (t >= THOUGHT_ASK - 2) ring(out, bx + s * 2, bY + 4, 1, WHITE)
  if (t < THOUGHT_ASK) return
  const pop = t - THOUGHT_KNOW
  const rx = 4 + (pop >= 0 && pop < 2 ? 1 : 0)
  oval(out, bx, bY, rx + 1, 4, deep)
  oval(out, bx, bY, rx, 3, WHITE)
  if (t < THOUGHT_KNOW) outlined(out, bx, bY, ['qq.', '..q', '.q.', '...', '.q.'], { q: deep }, WHITE)
  else outlined(out, bx, bY, ['q', 'q', 'q', '.', 'q'], { q: pop < 2 ? c : 0xd02060 }, WHITE)
  if (pop >= 0 && pop < 3) burst(out, bx, bY, 5 + pop, hi, dotted)
}

const BOW_DOWN = 4
const BOW_HOLD = 14
const BOW_UP = 24
const CARPET_END = 22

// Bow low and roll out a red carpet along the ground to the target with a sweep of
// the head, then sparkles invite it to go first
function afteryou(out, t, a, g, c) {
  const trim = 0xffd060
  const bow = hold(t, BOW_DOWN, BOW_HOLD, BOW_UP, BOW_UP + 6)
  out.skew = lean(g, g.side * 3 * bow)
  out.sy = 1 - 0.07 * bow
  out.dy = Math.round(bow)
  const { x: tx } = g.target
  const start = g.frontAt(g.bottom - 1)
  const end = tx + g.side * Math.round(foeHalf(g))
  const f = easeOut(phase(t, 8, CARPET_END))
  const fade = t >= 30
  if (t >= 8 && t < 36 && !(fade && t % 2)) {
    const tip = Math.round(lerp(start, end, f))
    for (let x = start; x !== tip + g.side; x += g.side) {
      dot(out, x, g.ground - 1, trim)
      dot(out, x, g.ground, x % 2 ? dark(c, 0.15) : c)
    }
    if (f < 1) {
      disc(out, tip + g.side, g.ground - 1, 1.5, c)
      dot(out, tip + g.side, g.ground - 1, dark(c, 0.45))
      dot(out, tip, g.ground - 2, trim)
    }
  }
  if (t >= CARPET_END && t < 36) sparkles(out, t, a.seed, tx, g.target.y - 2, foeHalf(g) * 2 + 6, 10, trim, 5)
  if (t >= BOW_HOLD && t < BOW_UP && t % 4 < 2) {
    const m = shownAt(g, out, g.mouth.x, g.mouth.y)
    ring(out, m.x, m.y + 2, 3, light(trim, 0.4), g.side > 0 ? 0.6 : Math.PI - 0.6, 0.6)
  }
}

// A health bar w wide centered on x at row y, filled to f
function meter(out, x, y, w, f, c) {
  const x0 = Math.round(x - w / 2)
  const full = Math.round(f * (w - 2))
  for (let k = 0; k < w; k++) {
    dot(out, x0 + k, y - 1, 0x202028)
    dot(out, x0 + k, y + 1, 0x202028)
    const inside = k > 0 && k < w - 1
    dot(out, x0 + k, y, !inside ? 0x202028 : k <= full ? c : 0x585868)
  }
}

const SPLIT_TIE = 6
const SPLIT_FLOW = 14
const SPLIT_EVEN = 30

// Tether to the target with a wavy cord while two health bars over their heads slide
// toward each other until they match, flashing as they even out
function painsplit(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const strain = hold(t, SPLIT_TIE, SPLIT_TIE + 4, SPLIT_EVEN, SPLIT_EVEN + 8)
  out.sy = 1 - 0.04 * strain
  if (t >= SPLIT_FLOW && t < SPLIT_EVEN && t % 4 < 2) out.shade = tint(c, 0.25)
  if (t >= SPLIT_EVEN && t < SPLIT_EVEN + 2) out.shade = tint(WHITE, 0.4)
  if (t >= SPLIT_EVEN && t < SPLIT_EVEN + 3) out.dy = -1
  const { x: tx, y: ty } = g.target
  const m = shownAt(g, out, g.mouth.x, g.cy)
  if (t >= SPLIT_TIE && t < SPLIT_EVEN + 6) {
    const reach = easeOut(phase(t, SPLIT_TIE, SPLIT_TIE + 6))
    const steps = Math.max(2, Math.abs(tx - m.x))
    const shown = Math.round(steps * reach)
    for (let k = 0; k <= shown; k++) {
      const f = k / steps
      const y = lerp(m.y, ty, f) + Math.sin(f * TAU * 2 - t * 0.6) * 1.5
      const flow = (k + t) % 5
      const col = flow === 0 ? WHITE : (k - t) % 5 === 0 ? hi : t >= SPLIT_EVEN ? c : deep
      if (!(t >= SPLIT_EVEN + 3 && k % 2)) dot(out, m.x + g.side * k, y, col)
    }
  }
  if (t >= 4 && t < 42 && !(t > 38 && t % 2)) {
    const even = easeInOut(phase(t, SPLIT_FLOW, SPLIT_EVEN))
    const w = 9
    const mine = lerp(0.25, 0.6, even)
    const theirs = lerp(0.95, 0.6, even)
    const flash = t >= SPLIT_EVEN && t < SPLIT_EVEN + 3
    const barCol = (f) => (flash ? WHITE : f > 0.5 ? 0x4ad86a : f > 0.3 ? 0xf0c040 : 0xe84848)
    meter(out, clamp(g.cx, w / 2, g.columns - 1 - w / 2), Math.max(1, g.top - 3), w, mine, barCol(mine))
    meter(out, clamp(tx, w / 2, g.columns - 1 - w / 2), Math.max(1, headOf(g).y - 1), w, theirs, barCol(theirs))
  }
}

const GLARE_STIFF = 2
const GLARE_FLASH = 9
const GLARE_LOCK = 13

// Go rigid and tall, then the eyes blaze out a wide fan of yellow light that pins the
// target in crackling paralysis
function glare(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const stiff = hold(t, GLARE_STIFF, GLARE_FLASH, 24, 30)
  out.sy = 1 + 0.07 * stiff
  out.sx = 1 - 0.03 * stiff
  if (t >= GLARE_FLASH && t < GLARE_FLASH + 4) out.dx = t % 2 ? g.side : 0
  if (t === GLARE_FLASH) out.shade = tint(c, 0.4)
  const eye = eyeOf(g, out)
  const { x: tx, y: ty } = g.target
  if (t >= GLARE_STIFF + 3 && t < GLARE_FLASH) dot(out, eye.x, eye.y, t % 2 ? c : WHITE)
  const age = t - GLARE_FLASH
  if (age >= 0 && age < 9) {
    if (age < 3) burst(out, eye.x, eye.y, [2, 4, 3][age], c)
    const f = easeOut(phase(t, GLARE_FLASH, GLARE_LOCK))
    const span = foeHalf(g) + 2
    for (let k = -2; k <= 2; k++) {
      if (age > 5 && (k + t) % 2) continue
      const ex = lerp(eye.x, tx, f)
      const ey = lerp(eye.y, ty + k * span * 0.6, f)
      line(out, eye.x + g.side, eye.y, ex, ey, age < 2 ? WHITE : k === 0 ? hi : k % 2 ? c : lit, age > 5 ? dotted : dot)
    }
  }
  if (t >= GLARE_LOCK && t < 32) {
    const w = foeHalf(g) + 2
    for (let i = 0; i < 5; i++) {
      if ((t + i) % 3 === 0) continue
      const ang = rnd(a.seed, i, t >> 1) * TAU
      const x = tx + Math.cos(ang) * w
      const y = ty + Math.sin(ang) * w * 0.8
      const s = rnd(a.seed, i, 7) < 0.5 ? 1 : -1
      line(out, x, y, x + s, y + 1, hi)
      line(out, x + s, y + 1, x, y + 2, c)
      line(out, x, y + 2, x + s, y + 3, deep)
    }
  }
}

const DANCE_START = 4
const DANCE_BEAT = 6
const DANCE_END = 38
const DISCO = [0xff5ad0, 0x5ad0ff, 0x7aff6a]

// Dance to a beat that lights a row of floor tiles one by one out to the target, which
// soon bobs along to the same rhythm
function entrainment(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const dancing = t >= DANCE_START && t < DANCE_END
  const beat = Math.floor((t - DANCE_START) / DANCE_BEAT)
  const inBeat = (t - DANCE_START) % DANCE_BEAT
  if (dancing) {
    const s = beat % 2 ? 1 : -1
    out.skew = lean(g, s * 2.5 * (1 - phase(t, DANCE_END - 4, DANCE_END)))
    out.dy = inBeat < 2 ? -1 : 0
    if (inBeat === 0) out.sy = 0.95
  }
  const { x: tx, y: ty } = g.target
  const start = g.frontAt(g.bottom - 1) + g.side
  const end = tx + g.side * Math.round(foeHalf(g))
  const n = Math.max(2, Math.floor(Math.abs(end - start) / 4))
  if (t >= DANCE_START && t < DANCE_END + 4) {
    for (let k = 0; k <= n; k++) {
      const x = start + g.side * k * 4
      const lit = dancing && beat >= 0 && (beat - k) % 3 === 0 && beat >= k * 0.5
      const col = lit ? DISCO[(beat + k) % 3] : deep
      for (let d = 0; d < 3; d++) {
        dot(out, x + g.side * d, g.ground, col)
        if (lit) dot(out, x + g.side * d, g.ground - 1, inBeat < 2 && d === 1 ? WHITE : light(col, 0.4))
      }
    }
  }

  // The target catches the rhythm a few beats in: motion marks swing with each beat
  if (dancing && beat >= 2) {
    const w = foeHalf(g) + 2
    const s = beat % 2 ? 1 : -1
    const head = headOf(g)
    ring(out, tx + s * w, ty - 1, 4, inBeat < 2 ? WHITE : hi, s > 0 ? 0 : Math.PI, 0.8)
    ring(out, tx + s * (w + 2), ty - 1, 4, c, s > 0 ? 0 : Math.PI, 0.6)
    if (inBeat < 3) plus(out, head.x - s * 3, head.y, c, WHITE)
    ellipse(out, tx, g.ground - 1, w - 1 + (inBeat < 2 ? 1 : 0), 1, c, 0, dotted)
  }
}

const SHAPES = [
  ['sss', 's.s', 'sss'],
  ['.s.', 's.s', '.s.'],
  ['..s..', '.s.s.', 'sssss'],
]
const SIMPLE_CHARGE = 8
const SIMPLE_HIT = 26

// Hum and swell, then fire a wobbly stream of plain squares, rings, and triangles that
// box the target in a simple frame
function simplebeam(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const charge = easeIn(phase(t, 0, SIMPLE_CHARGE))
  if (t < SIMPLE_CHARGE) {
    out.sx = 1 + 0.06 * charge * (t % 2 ? 1 : 0.5)
    out.sy = 1 + 0.04 * charge
    const m = shownAt(g, out, g.mouth.x, g.mouth.y)
    if (t > 2) stamp(out, m.x + g.side - 1, m.y - 1, SHAPES[t % 3], { s: t % 2 ? WHITE : lit })
  } else if (t < SIMPLE_CHARGE + 3) out.dx = -g.side
  const { x: tx, y: ty } = g.target
  const from = g.ahead(2)
  emit(t, { count: 9, gap: 2, start: SIMPLE_CHARGE, life: 9 }, (i, age, f) => {
    const x = lerp(from, tx, f)
    const y = lerp(g.mouth.y, ty, f) + Math.sin(f * TAU * 1.5 + i) * 1.5
    const col = [lit, c, hi][i % 3]
    outlined(out, x, y, SHAPES[i % 3], { s: f < 0.15 ? WHITE : col }, deep)
  })
  const age = t - SIMPLE_HIT
  if (age >= 0 && age < 12 && !(age > 8 && t % 2)) {
    const w = Math.round(foeHalf(g)) + 2
    const h = g.foe ? Math.round((g.foe.bottom - g.foe.top) / 2) + 1 : 4
    const r = age < 2 ? 2 : 0
    const col = age < 2 ? WHITE : age % 4 < 2 ? c : hi
    const paint = (o, x, y, k) => ((Math.round(x) + Math.round(y)) % 3 ? dot(o, x, y, k) : null)
    line(out, tx - w - r, ty - h - r, tx + w + r, ty - h - r, col, paint)
    line(out, tx - w - r, ty + h + r, tx + w + r, ty + h + r, col, paint)
    line(out, tx - w - r, ty - h - r, tx - w - r, ty + h + r, col, paint)
    line(out, tx + w + r, ty - h - r, tx + w + r, ty + h + r, col, paint)
    if (age >= 2) for (const d of [-1, 1]) line(out, tx - 2, ty + d, tx + 2, ty + d, deep)
  }
}

// A small spiral of dots turning by spin
function swirl(out, x, y, spin, c, hi) {
  for (let k = 0; k < 9; k++) {
    const ang = spin + k * 0.7
    const r = 0.4 + k * 0.28
    dot(out, x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.8, k < 3 ? hi : c)
  }
}

const TEETER_END = 44

// Teeter and totter in a wobbly, stumbling dance while dizzy spirals float off the head
// to the target and stars circle its head
function teeterdance(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const live = phase(t, 0, 4) * (1 - easeInOut(phase(t, TEETER_END, 52)))
  const sway = (Math.sin(t * 0.38) * 3 + Math.sin(t * 0.95) * 1.2) * live
  out.skew = lean(g, sway)
  out.dx = Math.round(Math.sin(t * 0.19) * 1.4 * live)
  out.dy = -Math.round(Math.abs(Math.sin(t * 0.38)) * live)
  if (live > 0.5 && t % 12 === 6) out.shake = [Math.sign(sway) || 1, 0]
  const head = headOf(g)
  const crown = shownAt(g, out, g.cx, g.top)
  emit(t, { count: 6, gap: 4, start: 6, life: 18 }, (i, age, f) => {
    if (f > 0.85 && t % 2) return
    const x = lerp(crown.x, head.x + (i % 2 ? 2 : -2), easeInOut(f))
    const y = clamp(lerp(crown.y - 1, head.y, f) - Math.sin(f * Math.PI) * 4, 2, g.ground)
    swirl(out, x, y, age * 0.6 * (i % 2 ? 1 : -1), i % 2 ? c : lit, WHITE)
  })
  if (t >= 22 && t < 50 && !(t > 46 && t % 2)) {
    for (let i = 0; i < 3; i++) {
      const ang = t * 0.3 + (i / 3) * TAU
      const x = head.x + Math.cos(ang) * 4
      const y = head.y + Math.sin(ang) * 1.5
      if (Math.sin(ang) > 0) plus(out, x, y, hi, WHITE)
      else dot(out, x, y, deep)
    }
  }
}

const FIRST_DASH = 2
const FIRST_SNAP = 6
const FIRST_HOME = 13
const MEDAL_ARRIVE = 14

// Dart forward ahead of the target and snap back in a blur, flinging a first place
// medal that spins over the target
function mefirst(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const D = clamp(Math.round(g.reach / 4), 2, 4)
  const dash = t < FIRST_SNAP ? easeOut(phase(t, FIRST_DASH, FIRST_SNAP)) : 1 - easeInOut(phase(t, FIRST_SNAP + 2, FIRST_HOME))
  out.dx = Math.round(g.side * D * dash)
  if (t >= FIRST_DASH && t < FIRST_SNAP + 2) {
    out.ghosts.push(ghost(out.dx - g.side * 3, 0, light(c, 0.3), 0.7))
    for (let k = 0; k < 3; k++) {
      const y = g.top + 2 + k * Math.max(2, Math.round((g.bottom - g.top) / 3))
      line(out, g.frontAt(y) - g.side * (g.right - g.left + 2), y, g.frontAt(y) - g.side * (g.right - g.left + 5), y, lit)
    }
  }
  const { x: tx } = g.target
  const head = headOf(g)
  if (t < FIRST_SNAP || t >= 34) return
  const f = easeOut(phase(t, FIRST_SNAP, MEDAL_ARRIVE))
  const x = lerp(g.ahead(2), tx, f)
  const y = clamp(lerp(g.mouth.y, head.y - 1, f) - Math.sin(f * Math.PI) * 3, 6, g.ground - 3)
  if (t >= 30 && t % 2) return
  // The medal turns by narrowing its face; the ribbon stays put
  const turn = t >= MEDAL_ARRIVE ? Math.abs(Math.cos((t - MEDAL_ARRIVE) * 0.35)) : 1
  line(out, x - 2, y - 6, x, y - 3, 0x3a7aff)
  line(out, x + 2, y - 6, x, y - 3, 0xe84848)
  line(out, x - 1, y - 6, x, y - 4, 0x6aa0ff)
  oval(out, x, y, 0.4 + 2.6 * turn, 3, deep)
  oval(out, x, y, 0.3 + 1.8 * turn, 2.2, turn > 0.4 ? c : hi)
  if (turn > 0.5) {
    stamp(out, Math.round(x) - 1, Math.round(y) - 2, ['.d', 'dd', '.d', '.d', 'dd'], { d: deep })
    dot(out, x - 1, y - 2, WHITE)
  }
  if (t === MEDAL_ARRIVE || t === MEDAL_ARRIVE + 1) burst(out, x, y, 4, hi, dotted)
  if (t > MEDAL_ARRIVE) sparkles(out, t, a.seed, x, y, 10, 8, lit, 3)
}

export const STARES = {
  leer: { ticks: 34, color: 0xff4a4a, draw: leer },
  scaryface: { ticks: 42, color: 0x9a4ad8, draw: scaryface },
  tailwhip: { ticks: 36, color: 0xffcc66, draw: tailwhip },
  swagger: { ticks: 46, color: 0xff7040, pose: (t) => ({ stride: t >= SWAG_STRUT && t < SWAG_TAUNT }), draw: swagger },
  disable: { ticks: 40, color: 0xff4040, draw: disable },
  encore: { ticks: 46, color: 0xffd84a, draw: encore },
  odorsleuth: { ticks: 42, color: 0xc89a68, draw: odorsleuth },
  foresight: { ticks: 40, color: 0x8ad4ff, draw: foresight },
  sweetscent: { ticks: 46, color: 0xff9ad0, draw: sweetscent },
  yawn: { ticks: 50, color: 0xb8b0ff, draw: yawn },
  attract: { ticks: 44, color: 0xff5a9a, draw: attract },
  lockon: { ticks: 38, color: 0x4aff7a, draw: lockon },
  meanlook: { ticks: 46, color: 0x8a4ab8, draw: meanlook },
  perishsong: { ticks: 56, color: 0x9a7aff, draw: perishsong },
  captivate: { ticks: 44, color: 0xff7ad0, draw: captivate },
  tickle: { ticks: 40, color: 0xffd890, draw: tickle },
  psychup: { ticks: 42, color: 0xff6ae0, draw: psychup },
  block: { ticks: 40, color: 0xb07a48, draw: block },
  mindreader: { ticks: 42, color: 0xb87aff, draw: mindreader },
  afteryou: { ticks: 38, color: 0xd02a3a, draw: afteryou },
  painsplit: { ticks: 44, color: 0xb070ff, draw: painsplit },
  glare: { ticks: 34, color: 0xffe040, draw: glare },
  entrainment: { ticks: 44, color: 0xffa040, draw: entrainment },
  simplebeam: { ticks: 40, color: 0x7ac8ff, draw: simplebeam },
  teeterdance: { ticks: 54, color: 0xffa8e0, draw: teeterdance },
  mefirst: { ticks: 36, color: 0xffcc40, draw: mefirst },
}
