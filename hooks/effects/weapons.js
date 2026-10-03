// Claws, fangs, beaks, pincers, bones, and coils

import {
  WHITE, back, burst, clamp, dark, disc, dot, easeIn, easeOut, emit, ghost, keys, lerp, light, mix, phase, plus, ring,
  rnd, spark, stamp, tint, tremble,
} from './draw.js'

const pixelKey = (x, y) => (x + 512) * 2048 + y + 512

// Paints a shape's pixels [x, y, color, ...] inside a one pixel rim
function rimmed(out, px, rim, paint = dot) {
  const fill = new Map()
  for (let k = 0; k < px.length; k += 3) fill.set(pixelKey(px[k], px[k + 1]), k)
  const edge = new Set()
  for (const k of fill.values()) {
    for (const [nx, ny] of [[px[k] - 1, px[k + 1]], [px[k] + 1, px[k + 1]], [px[k], px[k + 1] - 1], [px[k], px[k + 1] + 1]]) {
      const n = pixelKey(nx, ny)
      if (fill.has(n) || edge.has(n)) continue
      edge.add(n)
      paint(out, nx, ny, rim)
    }
  }
  for (const k of fill.values()) paint(out, px[k], px[k + 1], px[k + 2])
}

const shape = () => ({ dots: [] })

// An angle drawn facing right, turned to face the attack side
const turn = (g, angle) => (g.side > 0 ? angle : Math.PI - angle)

// Width profiles along a stroke, from 0 at its start to 1 at its end
const POINTED = (s) => Math.sqrt(Math.sin(Math.PI * s))
const TAPER = (s) => Math.sqrt(1 - s)
const SWELL = (s) => Math.sqrt(s)
const EVEN = () => 1

// Picks a tone for a pixel d from the middle of a stroke w wide. With lit, the side
// lit points at gets the first tones and the other side the last.
function toneAt(tones, d, w, lit) {
  const k = lit ? (1 - (lit * d) / w) / 2 : Math.abs(d) / w
  return tones[Math.min(tones.length - 1, Math.floor(k * tones.length))]
}

// A stroke from (x0, y0) to (x1, y1), shaped by a width profile and toned from its
// core out. Only the stretch between fractions from and to of its length is drawn.
function stroke(out, x0, y0, x1, y1, width, tones, { from = 0, to = 1, profile = POINTED, lit = 0, paint = dot } = {}) {
  const dx = x1 - x0
  const dy = y1 - y0
  const len2 = Math.max(1e-6, dx * dx + dy * dy)
  const len = Math.sqrt(len2)
  const half = width / 2
  const lo = Math.max(0, from)
  const hi = Math.min(1, to)
  if (hi <= lo) return
  for (let py = Math.floor(Math.min(y0, y1) - half - 1); py <= Math.ceil(Math.max(y0, y1) + half + 1); py++) {
    for (let px = Math.floor(Math.min(x0, x1) - half - 1); px <= Math.ceil(Math.max(x0, x1) + half + 1); px++) {
      const s = ((px - x0) * dx + (py - y0) * dy) / len2
      if (s < lo || s > hi) continue
      const w = half * profile(s) + 0.35
      const d = ((px - x0) * dy - (py - y0) * dx) / len
      if (Math.abs(d) <= w) paint(out, px, py, toneAt(tones, d, w, lit))
    }
  }
}

// The same stroke bent along a circle around (cx, cy), from angle a0 to a1. With lit 1
// the outer edge gets the first tones.
function arc(out, cx, cy, r, a0, a1, width, tones, { from = 0, to = 1, profile = POINTED, lit = 0, paint = dot } = {}) {
  const span = a1 - a0
  const mid = (a0 + a1) / 2
  const half = width / 2
  const box = r + half + 1
  const lo = Math.max(0, from)
  const hi = Math.min(1, to)
  if (hi <= lo) return
  for (let py = Math.floor(cy - box); py <= Math.ceil(cy + box); py++) {
    for (let px = Math.floor(cx - box); px <= Math.ceil(cx + box); px++) {
      let rel = Math.atan2(py - cy, px - cx) - mid
      rel -= Math.round(rel / (2 * Math.PI)) * 2 * Math.PI
      const s = 0.5 + rel / span
      if (s < lo || s > hi) continue
      const w = half * profile(s) + 0.35
      const d = Math.hypot(px - cx, py - cy) - r
      if (Math.abs(d) <= w) paint(out, px, py, toneAt(tones, d, w, lit))
    }
  }
}

const onCircle = (cx, cy, r, angle) => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })

// A filled ellipse, or only its rim when hole is the fraction left empty inside
function oval(out, x, y, rx, ry, c, hole = 0, paint = dot) {
  for (let py = Math.floor(y - ry); py <= Math.ceil(y + ry); py++) {
    for (let px = Math.floor(x - rx); px <= Math.ceil(x + rx); px++) {
      const d = ((px - x) / rx) ** 2 + ((py - y) / ry) ** 2
      if (d <= 1.05 && d >= hole * hole) paint(out, px, py, c)
    }
  }
}

// Half the height an effect at the target can take without leaving the strip
const halfSpan = (g) => clamp(Math.round((g.ground - 3) * 0.4), 4, 6)

// Keeps a shape reaching `half` pixels either side of x inside the strip
const fit = (g, x, half) => clamp(x, half, g.columns - 1 - half)

// Afterimages trailing a dash, one per earlier tick of the dash track
const trail = (g, t, track, color, count = 2) =>
  Array.from({ length: count }, (_, k) => ghost(g.side * Math.round(track(t - k - 1)), 0, color, 0.45 + 0.15 * k))

// Leans the sprite px pixels toward the target at its top while its feet stay put
function leanAhead(g, px) {
  if (Math.abs(px) < 0.5) return null
  const span = Math.max(1, g.bottom - g.top)
  return (y) => g.side * px * clamp((g.bottom - y) / span, 0, 1)
}

// Sparks thrown from (x, y) in a fan around `angle`, falling as they fly
function sparksFrom(out, t, a, x, y, { start, count = 6, life = 10, angle = -Math.PI / 2, spread = 2.4, speed = 1, fall = 0.06, salt = 0 }, colors) {
  emit(t, { count, start, gap: 0, life }, (i, age, f) => {
    const dir = angle + (rnd(a.seed, i, salt) - 0.5) * spread
    const v = speed * (0.7 + rnd(a.seed, i, salt + 1) * 0.8)
    const px = x + Math.cos(dir) * v * age
    const py = y + Math.sin(dir) * v * age + fall * age * age
    dot(out, px, py, colors[Math.min(colors.length - 1, Math.floor(f * colors.length))])
  })
}

const fresh = (c) => [WHITE, WHITE, light(c, 0.3), c, dark(c, 0.45)]
const cooled = (c) => [light(c, 0.45), c, dark(c, 0.3), dark(c, 0.55)]

const SCRATCH_RAKE = 7

// Rear up with a glint on the claw, then lunge and rake three claw marks down
// across the target. They flash white, cool to steel, and crumble into sparks.
function scratch(out, t, a, g, c) {
  out.dx = Math.round(g.side * keys(t, [[0, 0], [4, -2], [6, -2], [8, 2, easeIn], [13, 2], [20, 0]]))
  out.dy = Math.round(keys(t, [[0, 0], [4, -1], [6, -1], [8, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [4, -2], [6, -2], [8, 2, easeIn], [12, 2], [18, 0]]))
  if (t >= 2 && t < 7) spark(out, g.mouth.x + out.dx, g.mouth.y + 2 + out.dy, t < 4 ? 1 : 2, c)
  if (t === SCRATCH_RAKE + 1) out.shake = [g.side, 0]
  if (t === SCRATCH_RAKE + 2) out.shake = [0, 1]
  const hh = halfSpan(g)
  const tx = fit(g, g.target.x, 6)
  const ty = g.target.y
  for (let k = 0; k < 3; k++) {
    const age = t - SCRATCH_RAKE + 1 - k * 0.5
    const fade = phase(age, 6, 15)
    if (age <= 0 || fade >= 1) continue
    const len = k === 1 ? hh + 1 : hh
    const u = (k - 1) * 4.5
    const x0 = tx + g.side * (u - len * 0.45)
    const x1 = tx + g.side * (u + len * 0.45)
    const head = clamp(age / 3, 0, 1)
    stroke(out, x0, ty - len, x1, ty + len, 3 - fade * 1.5, age < 5 ? fresh(c) : cooled(c), { from: easeIn(fade), to: head })
    if (head < 1) plus(out, lerp(x0, x1, head), lerp(ty - len, ty + len, head), light(c, 0.5), WHITE)
    sparksFrom(out, t, a, x1, ty + len, { start: SCRATCH_RAKE + 3, count: 3, life: 9, angle: Math.PI / 2 - g.side * 1.1, spread: 1.4, speed: 0.7, fall: 0.08, salt: k * 7 }, [WHITE, light(c, 0.4), c])
  }
}

const SLASH_HIT = 10

const slashDash = (t) => keys(t, [[0, 0], [6, -3], [8, -3], [SLASH_HIT, 3, easeIn], [17, 3], [25, 0]])

// Crouch low while the claw glints, dash in with afterimages and carve one big
// crescent through the target. It flashes, then thins away in glittering shards.
function slash(out, t, a, g, c) {
  out.dx = Math.round(g.side * slashDash(t))
  out.sy = keys(t, [[0, 1], [6, 0.9], [8, 0.9], [SLASH_HIT, 1.05], [13, 1]])
  out.sx = 2 - out.sy
  out.skew = leanAhead(g, keys(t, [[0, 0], [6, -2], [8, -2], [SLASH_HIT, 3, easeIn], [15, 2], [23, 0]]))
  if (t >= 8 && t < 11) out.ghosts = trail(g, t, slashDash, light(c, 0.4))
  if (t >= 4 && t < 9) spark(out, g.mouth.x + out.dx, g.mouth.y + 2, t < 6 ? 1 : 2, c)
  if (t === SLASH_HIT + 1) out.shake = [g.side * 2, 0]
  if (t === SLASH_HIT + 2) out.shake = [-g.side, 0]
  const r = halfSpan(g) + 4
  const tx = fit(g, g.target.x, 2)
  const cx = tx + g.side * (1 - r)
  const cy = g.target.y - 1
  const a0 = turn(g, -1.25)
  const a1 = turn(g, 1.25)
  const head = phase(t, SLASH_HIT - 1, SLASH_HIT + 2)
  const tail = easeIn(phase(t, SLASH_HIT + 4, SLASH_HIT + 16))
  if (head <= 0 || tail >= 1) return
  const flash = t === SLASH_HIT + 2
  if (flash) arc(out, cx, cy, r + 2.5, a0, a1, 1.5, [light(c, 0.4)])
  // Thin wind lines inside the crescent, chasing its tip and blowing away
  if (t < SLASH_HIT + 5) {
    const gone = phase(t, SLASH_HIT + 1, SLASH_HIT + 5)
    for (const [dr, col] of [[4.2, light(c, 0.4)], [6.5, c]]) {
      arc(out, cx, cy, r - dr, a0, a1, 1.3, [col], { from: Math.max(0, head - 0.6) + gone * 0.9, to: head })
    }
  }
  const tones = flash ? [WHITE, WHITE, WHITE, light(c, 0.4)] : t < SLASH_HIT + 7 ? fresh(c) : cooled(c)
  arc(out, cx, cy, r, a0, a1, 6 - tail * 3.5, tones, { from: tail, to: head, lit: 1 })
  if (head < 1) {
    const tip = onCircle(cx, cy, r, lerp(a0, a1, head))
    spark(out, tip.x, tip.y, 2, light(c, 0.5))
  }
  // Glints twinkling along what is left of the crescent
  for (let i = 0; i < 7; i++) {
    const s = rnd(a.seed, i, 3)
    if (t < SLASH_HIT + 2 || s < tail || (t + i) % 3 === 0) continue
    const p = onCircle(cx, cy, r + 1, lerp(a0, a1, s))
    if ((t + i) % 3 === 1) plus(out, p.x, p.y, light(c, 0.4), WHITE)
    else dot(out, p.x, p.y, WHITE)
  }
  sparksFrom(out, t, a, cx + g.side * r, cy, { start: SLASH_HIT + 2, count: 7, life: 10, angle: turn(g, 0), spread: 2.2, speed: 1, fall: 0.07, salt: 9 }, [WHITE, light(c, 0.4), c])
}

const SWIPES = [6, 13, 20, 27]
const SWIPE_SPOTS = [[-1, -2], [1, 1], [0, -1], [0, 0]]

// Three curved claw marks raked downward around (sx, sy). Tilt -1 slants them away
// from the mon like \, tilt 1 toward it like /.
function claws(out, g, sx, sy, r, tilt, width, tones, from, to) {
  const mid = (tilt * Math.PI) / 4
  const spread = 0.7
  for (let j = -1; j <= 1; j++) {
    const off = j * 3.8 - r * Math.cos(spread)
    const cx = sx + g.side * off * Math.cos(mid)
    const cy = sy + off * Math.sin(mid)
    arc(out, cx, cy, r, turn(g, mid - spread), turn(g, mid + spread), width, tones, { from, to })
  }
}

// Paw after paw in a frenzy. Each swipe rakes three curved claw marks, slanting
// one way then the other, and the last crosses both ways at once with a jolt.
function furyswipes(out, t, a, g, c) {
  const frames = [[0, 0]]
  for (const s of SWIPES) frames.push([s - 2, -1], [s, 2, easeIn])
  frames.push([SWIPES[3] + 9, 0])
  out.dx = Math.round(g.side * keys(t, frames))
  out.dy = SWIPES.some((s) => t === s - 2 || t === s - 1) ? -1 : 0
  out.skew = leanAhead(g, keys(t, frames) * 1.2)
  const last = SWIPES.length - 1
  if (t === SWIPES[last]) out.shake = [g.side * 2, 1]
  if (t === SWIPES[last] + 1) out.shake = [-g.side * 2, 0]
  if (t === SWIPES[last] + 2) out.shake = [g.side, 0]
  const hh = halfSpan(g)
  const tx = fit(g, g.target.x, 8)
  SWIPES.forEach((s, k) => {
    const age = t - s + 2
    const fade = phase(age, 4, 9)
    if (age <= 0 || fade >= 1) return
    const big = k === last
    const r = hh + (big ? 3 : 1)
    const sx = tx + g.side * SWIPE_SPOTS[k][0]
    const sy = g.target.y + SWIPE_SPOTS[k][1]
    const head = clamp(age / 2, 0, 1)
    const tones = age < 3 ? fresh(c) : cooled(c)
    const width = (big ? 3.2 : 2.6) * (1 - fade * 0.5)
    for (const tilt of big ? [-1, 1] : [k % 2 ? 1 : -1]) claws(out, g, sx, sy, r, tilt, width, tones, easeIn(fade), head)
    if (age >= 2 && age < 4) burst(out, sx, sy, big ? 5 : 3, age < 3 ? WHITE : c)
  })
}

const CUT_SLICE = 9
const CUT_SPLIT = 14

const cutDash = (t) => keys(t, [[0, 0], [5, -1], [8, -1], [CUT_SLICE, 4, easeIn], [15, 4], [23, 0]])

// Draw back and hold perfectly still while a glint flashes, then dart through.
// A hairline slice blazes across the target, then splits apart and fades.
function cut(out, t, a, g, c) {
  out.dx = Math.round(g.side * cutDash(t))
  out.dy = Math.round(keys(t, [[0, 0], [5, -1], [8, -1], [CUT_SLICE, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [5, -1.5], [8, -1.5], [CUT_SLICE, 3, easeIn], [14, 2], [22, 0]]))
  if (t >= CUT_SLICE && t < CUT_SLICE + 2) out.ghosts = trail(g, t, cutDash, light(c, 0.5))
  if (t >= 4 && t < 8) spark(out, g.mouth.x + out.dx, g.mouth.y - 1 + out.dy, t === 6 ? 2 : 1, c)
  if (t === CUT_SPLIT) out.shake = [g.side, 1]
  const hh = halfSpan(g)
  const tx = fit(g, g.target.x, 5)
  const ty = g.target.y
  const x0 = tx - g.side * (hh + 4)
  const x1 = tx + g.side * (hh + 4)
  const y0 = ty + hh
  const y1 = ty - hh
  const age = t - CUT_SLICE
  if (age < 0) return
  if (t < CUT_SPLIT) {
    const head = clamp((age + 1) / 2, 0, 1)
    const width = age < 2 ? 1.6 : age < 4 ? 3.8 : 2.8
    stroke(out, x0, y0, x1, y1, width, age < 4 ? fresh(c) : [WHITE, light(c, 0.5), c], { to: head })
    if (age === 2 || age === 3) spark(out, tx, ty, 4 - age, light(c, 0.3))
    return
  }
  // The two edges of the cut drift apart and slide along it, shrinking away
  const f = easeOut(phase(t, CUT_SPLIT, CUT_SPLIT + 12))
  if (f >= 1) return
  const len = Math.hypot(x1 - x0, y1 - y0)
  const ax = (x1 - x0) / len
  const ay = (y1 - y0) / len
  const along = f * 2.5
  const apart = 0.8 + f * 4
  const tones = f < 0.35 ? [WHITE, light(c, 0.4), c] : [light(c, 0.4), c, dark(c, 0.35)]
  for (const sgn of [1, -1]) {
    const ox = sgn * (ay * apart + ax * along)
    const oy = sgn * (-ax * apart + ay * along)
    stroke(out, x0 + ox, y0 + oy, x1 + ox, y1 + oy, 2.6 * (1 - f * 0.5), tones, { from: f * 0.45, to: 1 - f * 0.45 })
  }
  sparksFrom(out, t, a, tx, ty, { start: CUT_SPLIT, count: 6, life: 9, spread: 3.6, speed: 0.9, fall: 0.05 }, [WHITE, light(c, 0.4), c])
}

// A row of pointed teeth as tooth lengths, repeating every four columns
const TEETH = [1, 2, 3, 2]
const GUM = [0xb02a40, 0xe0506a]
const ENAMEL = 0xd2d6e4
const MOUTH_RIM = 0x24161e

// One jaw of a bite over columns cx - half to cx + half. Its teeth point at the
// bite line cy from `open` pixels away; dir -1 is the upper jaw and 1 the lower.
// The two jaws' teeth interlock, and the corners curl in by `curl`.
function jaw(buf, cx, cy, half, dir, open, curl, pal) {
  const lenAt = (u) => {
    const wave = TEETH[(u + 64) % 4]
    return dir < 0 ? wave : 4 - wave
  }
  for (let u = -half; u <= half; u++) {
    const len = lenAt(u)
    const shift = open - Math.round(curl * (u / half) ** 2)
    const root = dir < 0 ? cy - 2 - shift : cy + 1 + shift
    const flank = lenAt(u - 1) > len && lenAt(u + 1) < len
    for (let w = 0; w < len; w++) dot(buf, cx + u, root - dir * w, flank && w < len - 1 ? pal.flank : pal.tooth)
    dot(buf, cx + u, root + dir, pal.gum[0])
    dot(buf, cx + u, root + dir * 2, pal.gum[1])
  }
}

const BITE_SNAP = 12

// Big jaws rise open over the target while the mon draws back, then snap shut with
// a crunch flash and grind before letting go
function bite(out, t, a, g, c) {
  out.dx = Math.round(g.side * keys(t, [[0, 0], [8, -2], [BITE_SNAP - 2, -2], [BITE_SNAP, 2, easeIn], [18, 2], [26, 0]]))
  out.dy = Math.round(keys(t, [[0, 0], [8, -1], [BITE_SNAP - 2, -1], [BITE_SNAP, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [8, -2], [BITE_SNAP - 2, -2], [BITE_SNAP, 2.5, easeIn], [18, 1.5], [26, 0]]))
  if (t === BITE_SNAP) out.shake = [g.side * 2, 1]
  if (t === BITE_SNAP + 1) out.shake = [-g.side, 0]
  if (t === BITE_SNAP + 2) out.shake = [g.side, 0]
  if (t < 2 || t >= 26) return
  const cy = clamp(g.target.y - 2, 7, g.ground - 6)
  const most = clamp(cy - 8, 3, 6)
  const gap = keys(t, [[2, 1], [9, most, easeOut], [BITE_SNAP - 1, most], [BITE_SNAP, 0, easeIn], [19, 0], [23, 3]])
  const open = Math.round(gap)
  const shiver = (t >= 9 && t < BITE_SNAP - 1) || (t >= BITE_SNAP && t < 19) ? tremble(t) : 0
  const cx = fit(g, g.target.x, 8) + shiver
  const dim = phase(t, 21, 26)
  const crunch = t === BITE_SNAP
  const pal = {
    tooth: mix(c, 0x707888, dim * 0.6),
    flank: crunch ? WHITE : mix(ENAMEL, 0x606878, dim * 0.6),
    gum: GUM.map((col) => (crunch ? light(col, 0.5) : mix(col, 0x504048, dim * 0.6))),
  }
  const curl = Math.min(2, gap * 0.4)
  const age = t - BITE_SNAP
  if (age >= 0 && age < 4) burst(out, cx, cy, [10, 9, 7, 5][age], age < 2 ? WHITE : light(c, 0.2))
  const up = shape()
  const down = shape()
  jaw(down, cx, cy, 6, 1, Math.round(open * 0.5), curl * 0.6, pal)
  jaw(up, cx, cy, 7, -1, open, curl, pal)
  rimmed(out, down.dots, mix(MOUTH_RIM, 0x606070, dim))
  rimmed(out, up.dots, mix(MOUTH_RIM, 0x606070, dim))
  sparksFrom(out, t, a, cx, cy, { start: BITE_SNAP + 1, count: 8, life: 9, angle: -Math.PI / 2, spread: 3.4, speed: 1.2, fall: 0.12 }, [WHITE, ENAMEL, 0x9098b0])
}

const FANG_HITS = [11, 19]

const FANG = (s) => (1 - s) ** 0.8

// Two huge fangs hanging from an arched gum, their tips at (cx, y)
function fangs(buf, cx, y, len, pal) {
  const root = y - len
  for (let u = -6; u <= 6; u++) {
    const drop = Math.abs(u) > 4 ? 1 : 0
    dot(buf, cx + u, root - 1 + drop, pal.gum[0])
    if (Math.abs(u) < 6) dot(buf, cx + u, root - 2 + drop, pal.gum[1])
    if (Math.abs(u) < 5) dot(buf, cx + u, root - 3 + drop, pal.gum[1])
  }
  for (const u of [-1, 0, 1]) {
    dot(buf, cx + u, root, u > 0 ? pal.flank : pal.tooth)
    if (u <= 0) dot(buf, cx + u, root + 1, u < 0 ? pal.tooth : pal.flank)
  }
  for (const sgn of [-1, 1]) {
    const x = cx + sgn * 3.5
    stroke(buf, x, root - 0.5, x - sgn * 1.2, y, 5.2, [WHITE, pal.tooth, pal.flank, pal.shade], { profile: FANG, lit: -1 })
  }
}

// Rear up while two huge fangs gleam over the target, then drive them down twice,
// the second bite harder, each crunch blasting out shards
function hyperfang(out, t, a, g, c) {
  const [h1, h2] = FANG_HITS
  out.dx = Math.round(g.side * keys(t, [[0, 0], [7, -2], [h1 - 2, -2], [h1, 2, easeIn], [h1 + 3, 0], [h2 - 2, -1], [h2, 3, easeIn], [h2 + 5, 3], [30, 0]]))
  out.dy = Math.round(keys(t, [[0, 0], [7, -2], [h1 - 2, -2], [h1, 0, easeIn], [h1 + 3, -1], [h2 - 2, -2], [h2, 0, easeIn]]))
  out.sy = keys(t, [[0, 1], [7, 1.06], [h1 - 2, 1.06], [h1, 0.92], [h1 + 3, 1.04], [h2 - 2, 1.06], [h2, 0.9], [h2 + 4, 1]])
  out.skew = leanAhead(g, keys(t, [[0, 0], [7, -2], [h1 - 2, -2], [h1, 2, easeIn], [h1 + 3, 0], [h2 - 2, -2], [h2, 3, easeIn], [h2 + 5, 2], [30, 0]]))
  if (t === h1) out.shake = [g.side, 1]
  if (t === h2) out.shake = [g.side * 2, 1]
  if (t === h2 + 1) out.shake = [-g.side * 2, -1]
  if (t === h2 + 2) out.shake = [g.side, 0]
  if (t < 2 || t >= 30) return
  const tx = fit(g, g.target.x, 6)
  const bottom = Math.min(g.target.y + 2, g.ground - 1)
  const len = clamp(halfSpan(g) + 3, 7, 9)
  const high = Math.max(len + 3, bottom - 5)
  const tip = keys(t, [[2, high - 4], [7, high, easeOut], [h1 - 1, high], [h1, bottom, easeIn], [h1 + 3, bottom - 4, easeOut], [h2 - 1, high - 1], [h2, bottom, easeIn], [h2 + 5, bottom], [29, high - 8, easeIn]])
  const dim = phase(t, 25, 30)
  const pal = {
    tooth: mix(c, 0x707888, dim * 0.6),
    flank: mix(ENAMEL, 0x606878, dim * 0.6),
    shade: mix(0x9aa0b8, 0x505868, dim * 0.6),
    gum: GUM.map((col) => mix(col, 0x504048, dim * 0.6)),
  }
  const buf = shape()
  fangs(buf, tx, Math.round(tip), len, pal)
  rimmed(out, buf.dots, mix(MOUTH_RIM, 0x606070, dim))
  // A glint sliding down each fang while it hangs
  if (t >= 4 && t < h1 - 1) spark(out, tx + (t % 2 ? 3 : -3), Math.round(tip) - len + ((t - 4) % 4) * 2, 1, light(c, 0.3))
  FANG_HITS.forEach((h, k) => {
    const age = t - h
    if (age < 0 || age >= 12) return
    if (age < 4) burst(out, tx, bottom, (k ? 7 : 5) - age, age < 2 ? WHITE : 0xffe36e)
    if (age < 3) for (const sgn of [-1, 1]) stroke(out, tx + sgn * 4, bottom + 1, tx + sgn * (7 + age * 2), bottom + 1 - age, 1.6, [WHITE, 0xffe36e])
    sparksFrom(out, t, a, tx, bottom, { start: h, count: k ? 10 : 6, life: 10, angle: -Math.PI / 2, spread: 2.8, speed: k ? 1.4 : 1.1, fall: 0.13, salt: k * 11 }, [WHITE, 0xffe36e, 0xb0a890])
  })
}

const WATER = [WHITE, 0x9adcff, 0x3a9cff, 0x1f5fc0]
const HAMMER_HANG = 8
const HAMMER_SLAM = 16

// A crab claw in units of its size, pointing along u: an oval palm and two fingers
// tapering to hooked tips around a V that opens toward them
const CLAW_TOP = [[0.2, -0.32], [0.95, -0.66], [1.75, -0.52], [2.1, -0.12]]
const CLAW_LOW = [[0.2, 0.36], [0.9, 0.62], [1.55, 0.48], [1.8, 0.14]]

// Whether (u, v) lies on a polyline whose radius tapers from r0 to r1 along it
function nearPath(u, v, pts, r0, r1) {
  let total = 0
  for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])
  let done = 0
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1]
    const dx = pts[k][0] - ax
    const dy = pts[k][1] - ay
    const len = Math.hypot(dx, dy)
    const s = clamp(((u - ax) * dx + (v - ay) * dy) / (len * len), 0, 1)
    if (Math.hypot(u - ax - dx * s, v - ay - dy * s) <= lerp(r0, r1, (done + s * len) / total)) return true
    done += len
  }
  return false
}

function inClaw(u, v) {
  if (u > 0.42 && Math.abs(v - 0.02) < (u - 0.42) * 0.38) return false
  return (u * u) / 0.72 + (v * v) / 0.5 <= 1 || nearPath(u, v, CLAW_TOP, 0.38, 0.08) || nearPath(u, v, CLAW_LOW, 0.32, 0.08)
}

// A crab claw centred on (x, y), size pixels to the unit, turned `angle` from the
// target direction (positive points it down) and stretched by sx, sy. It is lit
// along its top edge inside a dark rim, or drawn flat in c when rim is null.
function claw(out, g, x, y, size, angle, sx, sy, c, rim) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const box = Math.ceil(2.3 * size * Math.max(sx, sy)) + 1
  const cells = new Set()
  for (let py = -box; py <= box; py++) {
    for (let px = -box; px <= box; px++) {
      const lx = (px * g.side) / sx
      const ly = py / sy
      if (inClaw((lx * cos + ly * sin) / size, (ly * cos - lx * sin) / size)) cells.add(pixelKey(px, py))
    }
  }
  const tones = [light(c, 0.3), c, mix(c, 0xd8401c, 0.35), dark(c, 0.35)]
  const buf = shape()
  for (let py = -box; py <= box; py++) {
    for (let px = -box; px <= box; px++) {
      if (!cells.has(pixelKey(px, py))) continue
      const tone = !cells.has(pixelKey(px, py - 1)) ? 0 : !cells.has(pixelKey(px, py - 2)) ? 1 : cells.has(pixelKey(px, py + 1)) ? 2 : 3
      dot(buf, Math.round(x) + px, Math.round(y) + py, rim === null ? c : tones[tone])
    }
  }
  if (rim !== null) rimmed(out, buf.dots, rim)
  else out.dots.push(...buf.dots)
}

// Raise a giant claw high overhead, trembling and dripping, then bring it down on the
// target like a hammer in two ticks. It squashes flat on the ground and throws up a
// big splash that rocks the strip.
function crabhammer(out, t, a, g, c) {
  const s = HAMMER_SLAM
  out.dx = Math.round(g.side * keys(t, [[0, 0], [HAMMER_HANG, -1], [s - 2, -1], [s, 2, easeIn], [s + 6, 2], [32, 0]]))
  out.dy = Math.round(keys(t, [[0, 0], [HAMMER_HANG, -2], [s - 2, -2], [s, 0, easeIn]]))
  out.sy = keys(t, [[0, 1], [HAMMER_HANG, 1.08], [s - 2, 1.1], [s, 0.84, easeIn], [s + 3, 1.05], [s + 6, 1]])
  out.sx = 2 - out.sy
  out.skew = leanAhead(g, keys(t, [[0, 0], [HAMMER_HANG, -2], [s - 2, -3], [s, 2, easeIn], [s + 6, 1], [32, 0]]))
  if (t >= s && t < s + 6) out.shake = [[g.side * 2, 2], [-g.side * 2, -1], [g.side * 2, 1], [-g.side, -1], [g.side, 1], [0, -1]][t - s]
  // As big as the strip and the room in front allow, coming straight down where its
  // fingertips land at the target, and kept clear of the mon when there is room
  const size = clamp(Math.min((g.ground - 2) / 3.6, (g.reach + 2) / 2.5), 3.4, 5.2)
  const tipsAhead = 1.45 * size
  const u = Math.min(g.reach - tipsAhead, Math.max(0.85 * size - 1, Math.abs(g.target.x - g.mouth.x) - tipsAhead))
  const cx = g.mouth.x + g.side * u
  const tipX = cx + g.side * tipsAhead
  const pose = (k) => {
    const squash = k === s ? 0.72 : k === s + 1 ? 0.88 : k === s - 1 ? 1.15 : 1
    const land = g.ground - 1 - 1.47 * size * squash
    const hang = 2 * size
    return {
      angle: keys(k, [[1, -1.2], [HAMMER_HANG, -1.2], [s - 2, -1.4, easeOut], [s, 0.8, easeIn], [s + 6, 0.8], [s + 12, -0.3, easeIn]]),
      y: keys(k, [[1, -2.6 * size], [HAMMER_HANG, hang, easeOut], [s - 2, hang - 2, easeOut], [s, land, easeIn], [s + 2, land - 1, easeOut], [s + 4, land], [s + 6, land], [s + 12, -2.6 * size, easeIn]]),
      sx: k === s ? 1.25 : k === s + 1 ? 1.1 : k === s - 1 ? 0.9 : 1,
      sy: squash,
    }
  }
  if (t >= 1 && t < s + 12) {
    const p = pose(t)
    if (t === s - 1 || t === s) {
      // An afterimage of the falling claw, and streaks rushing up behind it
      const q = pose(t - 1)
      claw(out, g, cx, q.y, size, q.angle, q.sx, q.sy, mix(c, 0x402830, 0.55), null)
      for (let k = -1; k <= 1; k++) {
        const x = cx + g.side * k * size * 0.7
        stroke(out, x, p.y - size, x, p.y - size - 7 + Math.abs(k) * 2, 1.8, [light(c, 0.6), light(c, 0.25), c])
      }
    }
    const held = t >= HAMMER_HANG && t < s - 2 ? tremble(t) : 0
    const dim = phase(t, s + 7, s + 12)
    claw(out, g, cx + held, p.y, size, p.angle, p.sx, p.sy, mix(c, 0x6a5a5a, dim * 0.6), mix(dark(c, 0.78), 0x606070, dim * 0.5))
    if (t >= HAMMER_HANG + 1 && t < HAMMER_HANG + 4) spark(out, cx + g.side * size * 0.5, p.y - size * 1.2, t === HAMMER_HANG + 2 ? 2 : 1, light(c, 0.4))
  }
  // Drips falling off the raised claw
  emit(t, { count: 4, gap: 2, start: HAMMER_HANG - 1, life: 6 }, (i, age) => {
    const x = cx + Math.round((rnd(a.seed, i, 9) - 0.5) * size * 1.4)
    dot(out, x, 2.8 * size + age * age * 0.3, age < 3 ? WATER[1] : WATER[2])
  })
  const age = t - s
  const hitY = g.ground
  if (age >= 0 && age < 3) oval(out, tipX, hitY, [10, 7, 4][age], [3, 2.5, 1.5][age], age < 2 ? WHITE : WATER[1])
  // Droplets thrown up and out by the splash, falling back down
  emit(t, { count: 26, start: s, gap: 0, life: 20 }, (i, life, f) => {
    const dir = i % 2 ? 1 : -1
    const vx = dir * (0.3 + rnd(a.seed, i, 1) * 1.1)
    const vy = -(1.2 + rnd(a.seed, i, 2) * 1.8)
    const x = tipX + dir * (1 + rnd(a.seed, i, 3) * 4) + vx * life
    const y = hitY - 1 + vy * life + 0.17 * life * life
    if (y > g.ground) return
    const col = WATER[Math.min(3, Math.floor(f * 4))]
    dot(out, x, y, col)
    if (f < 0.6) dot(out, x, y + 1, WATER[Math.min(3, Math.floor(f * 4) + 1)])
  })
  // Spouts of water on either side, and foam running along the ground
  if (age >= 0 && age < 9) {
    const rise = age < 3 ? 2 + age * 2 : Math.max(0, 8 - (age - 3) * 1.5)
    for (const sgn of [-1, 1]) {
      const x = tipX + sgn * (6 + age)
      for (let d = 0; d < rise; d++) {
        dot(out, x, g.ground - d, d >= rise - 1 ? WHITE : WATER[d % 3 ? 1 : 2])
        if (d < rise - 2) dot(out, x - sgn, g.ground - d, WATER[2])
      }
      for (let d = 0; d < 4; d++) dot(out, x - sgn * d, g.ground, age < 5 ? WATER[d % 2] : WATER[2])
    }
  }
}

const GRIP_SHUT = 11
const GRIP_OPEN = 24
const STEEL = [WHITE, 0xdfe4ee, 0xaab2c6, 0x6a7290]

// A pincer opens like a C around the target, snaps shut from above and below, and
// squeezes, trembling and spitting sparks, before springing open and fading
function vicegrip(out, t, a, g, c) {
  out.dx = Math.round(g.side * keys(t, [[0, 0], [7, -2], [GRIP_SHUT - 1, -2], [GRIP_SHUT, 1, easeIn], [GRIP_OPEN, 1], [30, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [7, -2], [GRIP_SHUT - 1, -2], [GRIP_SHUT, 2, easeIn], [GRIP_OPEN, 1], [30, 0]]))
  const squeezing = t >= GRIP_SHUT && t < GRIP_OPEN
  if (squeezing && t > GRIP_SHUT) out.dx += tremble(t)
  if (t === GRIP_SHUT) out.shake = [0, 1]
  if (t === GRIP_SHUT + 1) out.shake = [g.side, 0]
  if (t < 2 || t >= 31) return
  const r = halfSpan(g) + 1
  const cx = fit(g, g.target.x - g.side, r + 3)
  const cy = Math.min(g.target.y, g.ground - r - 2)
  const open = keys(t, [[2, 0.6], [8, 1.15, easeOut], [GRIP_SHUT - 1, 1.25], [GRIP_SHUT, 0.1, easeIn], [GRIP_OPEN, 0.1], [GRIP_OPEN + 3, 1.2, easeOut]])
  const squeeze = squeezing ? 0.5 + 0.5 * Math.sin((t - GRIP_SHUT) * 0.9) : 0
  const x = cx + (squeezing ? tremble(t) * 0.5 : 0)
  const dim = phase(t, 26, 31)
  const tones = STEEL.map((col) => mix(mix(col, c, 0.3), 0x606878, dim * 0.6))
  const buf = shape()
  // Upper and lower fingers of the C, thick at the hinge and sharp at the tips.
  // Squeezing presses each finger toward the other.
  for (const sgn of [-1, 1]) {
    const fy = cy - sgn * squeeze
    arc(buf, x, fy, r, turn(g, sgn * open), turn(g, sgn * Math.PI), 4.4, tones, { profile: SWELL, lit: 1 })
    for (let k = 0; k < 3; k++) {
      const ang = turn(g, sgn * (open + 0.35 + k * 0.5))
      const p0 = onCircle(x, fy, r - 1.5, ang)
      const p1 = onCircle(x, fy, r - 3.6, ang)
      stroke(buf, p0.x, p0.y, p1.x, p1.y, 2.4, [WHITE, tones[1]], { profile: TAPER })
    }
  }
  // The hinge, with a stub of arm reaching back toward the mon
  stroke(buf, x - g.side * r, cy, x - g.side * (r + 4), cy, 3.4, [tones[0], tones[2], tones[3]], { profile: EVEN, lit: 1 })
  disc(buf, x - g.side * r, cy, 2.2, tones[2])
  dot(buf, x - g.side * r, cy, tones[3])
  rimmed(out, buf.dots, mix(0x262a3a, 0x606070, dim))
  const rr = r - squeeze
  if (!squeezing) return
  const tipX = x + g.side * rr
  if (t % 3 !== 2) spark(out, tipX, cy, t % 2 ? 2 : 1, 0xffe36e)
  sparksFrom(out, t, a, tipX, cy, { start: GRIP_SHUT, count: 14, life: 8, angle: turn(g, 0), spread: 2.4, speed: 1.2, fall: 0.08 }, [WHITE, 0xffe36e, 0xff9a3a])
  // Strain lines flicking off the squeezed pincer
  emit(t, { count: 8, start: GRIP_SHUT + 2, gap: 1.4, life: 4 }, (i, age) => {
    const ang = turn(g, (i % 2 ? -1 : 1) * (0.6 + rnd(a.seed, i, 4) * 1.6))
    const p0 = onCircle(x, cy, rr + 2 + age, ang)
    const p1 = onCircle(x, cy, rr + 4 + age, ang)
    stroke(out, p0.x, p0.y, p1.x, p1.y, 1, [WHITE])
  })
}

const GUILLOTINE_SNAP = 16

// Scissors pivoting at (px, py), blades len long opened `open` radians apart, and
// short handles with finger loops crossing behind. They pass behind the mon.
function blades(out, g, px, py, len, open, tones, rim) {
  const buf = shape()
  const loop = clamp(len * 0.16, 1.5, 2.3)
  for (const sgn of [-1, 1]) {
    const ang = turn(g, sgn * open)
    const ux = Math.cos(ang)
    const uy = Math.sin(ang)
    stroke(buf, px - ux * len * 0.27, py - uy * len * 0.27, px + ux * len, py + uy * len, clamp(len * 0.32, 3.2, 4.6), tones, { profile: (s) => Math.min(1, Math.sqrt((1 - s) * 1.4)), lit: sgn * g.side })
    arc(buf, px - ux * len * 0.43, py - uy * len * 0.43, loop, 0, 2 * Math.PI - 0.01, loop * 0.8, [tones[1], tones[2]], { profile: EVEN })
  }
  disc(buf, px, py, 1.5, tones[2])
  dot(buf, px, py, tones[3])
  rimmed(out, buf.dots, rim, back)
}

// Raise two huge blades that creep open with glints running down their edges, then
// scissor them shut in a blinding flash that rocks the whole strip
function guillotine(out, t, a, g, c) {
  const s = GUILLOTINE_SNAP
  out.dx = Math.round(g.side * keys(t, [[0, 0], [10, -2], [s - 2, -2], [s, 3, easeIn], [s + 8, 3], [34, 0]]))
  out.dy = Math.round(keys(t, [[0, 0], [10, -1], [s - 2, -1], [s, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [10, -2], [s - 2, -2], [s, 3, easeIn], [s + 8, 2], [34, 0]]))
  if (t >= s && t < s + 3) out.shade = tint(WHITE, [0.85, 0.6, 0.3][t - s])
  if (t >= s && t < s + 7) out.shake = [[g.side * 2, 2], [-g.side * 2, -2], [g.side * 2, 1], [-g.side * 2, -1], [g.side, 1], [-g.side, 0], [g.side, 0]][t - s]
  const tones = STEEL.map((col) => mix(col, c, 0.3))
  // Scissors only as long as the room in front, their tips just past the target
  const tipU = Math.min(g.reach - 1, Math.abs(g.target.x - g.mouth.x) + 3)
  const len = clamp((tipU + 3) / 1.6, 7, 15)
  const px = g.mouth.x + g.side * (tipU - len)
  const tx = fit(g, g.target.x, 4)
  const ty = Math.min(g.target.y, g.ground - 4)
  const k = len / 15
  if (t >= 1 && t < s) {
    const open = keys(t, [[1, 0.3], [5, 0.5, easeOut], [s - 2, 0.72], [s, 0, easeIn]])
    blades(out, g, px, ty, len, open, tones, 0x262a3a)
    const run = phase(t, 5, 13)
    if (run > 0 && run < 1) {
      for (const sgn of [-1, 1]) {
        const ang = turn(g, sgn * open)
        spark(out, px + Math.cos(ang) * len * run, ty + Math.sin(ang) * len * run, 2, light(c, 0.3))
      }
    }
  }
  const age = t - s
  if (age < 0) return
  if (age >= 1 && age < 14) {
    const dim = phase(age, 8, 14)
    blades(out, g, px, ty, len, 0, tones.map((col) => mix(col, 0x606878, dim * 0.7)), mix(0x262a3a, 0x606070, dim))
  }
  // The blinding flash with long rays, then a shockwave ring
  if (age < 3) {
    oval(out, tx, ty, Math.max(6, [13, 10, 6][age] * k), Math.max(4, [8, 6, 4][age] * k), mix(c, 0x7088c8, 0.5), 0.8)
    oval(out, tx, ty, Math.max(5, [12, 9, 5][age] * k), Math.max(3, [7, 5, 3][age] * k), age < 2 ? WHITE : light(c, 0.3))
    if (age < 2) {
      stroke(out, tx - 19, ty, tx + 19, ty, 3, [WHITE, light(c, 0.5)], { profile: POINTED })
      stroke(out, tx, ty - 12, tx, ty + 12, 2.4, [WHITE, light(c, 0.5)], { profile: POINTED })
    }
  }
  if (age >= 2 && age < 10) {
    const rx = 5 + age * 2
    const col = age < 5 ? WHITE : age < 8 ? 0xc8cede : 0x8890a8
    const n = Math.ceil(rx * 7)
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2
      dot(out, tx + Math.cos(ang) * rx, ty + Math.sin(ang) * rx * 0.5, col)
      if (age < 7) dot(out, tx + Math.cos(ang) * (rx - 1), ty + Math.sin(ang) * (rx - 1) * 0.5, age < 5 ? light(c, 0.3) : 0x8890a8)
    }
  }
  sparksFrom(out, t, a, tx, ty, { start: s, count: 16, life: 12, angle: -Math.PI / 2, spread: 4, speed: 1.5, fall: 0.1 }, [WHITE, light(c, 0.3), 0x9aa2b8])
}

const PECK_HIT = 7
const STAR = ['...h...', '...h...', 'hhhWhhh', '.yWWWy.', '..yyy..', '.yy.yy.', '.y...y.']
const SMALL_STAR = ['..h..', 'hhWhh', '.yyy.', '.y.y.']

// A star stamped with a dark rim, centered on x, y
function star(out, x, y, art, c) {
  const buf = shape()
  stamp(buf, x - (art[0].length >> 1), y - (art.length >> 1), art, { W: WHITE, h: light(c, 0.45), y: c })
  rimmed(out, buf.dots, dark(c, 0.65))
}

const peckDash = (t) => keys(t, [[0, 0], [4, -1], [PECK_HIT - 2, -1], [PECK_HIT, 3, easeIn], [PECK_HIT + 2, 3], [16, 0]])

// Cock the head back, then jab. A sharp beak of light darts to the target and a
// star pops off it with a jolt.
function peck(out, t, a, g, c) {
  out.dx = Math.round(g.side * peckDash(t))
  out.skew = leanAhead(g, keys(t, [[0, 0], [4, -2], [PECK_HIT - 2, -2], [PECK_HIT, 3, easeIn], [PECK_HIT + 3, 2], [16, 0]]))
  if (t >= PECK_HIT - 1 && t < PECK_HIT + 1) out.ghosts = trail(g, t, peckDash, light(c, 0.4))
  if (t === PECK_HIT) out.shake = [g.side, 0]
  const tx = fit(g, g.target.x, 4)
  const ty = g.target.y
  const mx = g.mouth.x + out.dx
  const my = g.mouth.y + 1
  // A beak of light flies from the mouth to the target, streaks trailing it
  if (t >= PECK_HIT - 2 && t <= PECK_HIT) {
    const fly = phase(t, PECK_HIT - 2, PECK_HIT)
    const hx = lerp(mx + g.side * 3, tx, fly)
    const hy = lerp(my, ty, fly)
    const ahead = (x) => (x - mx) * g.side >= 0
    const wedge = shape()
    stroke(wedge, hx - g.side * 6, hy, hx, hy, 4.4, [WHITE, light(c, 0.4), c, dark(c, 0.25)], { profile: (s) => Math.min(1, 1.6 * (1 - s)) })
    for (let k = 0; k < wedge.dots.length; k += 3) if (ahead(wedge.dots[k])) dot(out, wedge.dots[k], wedge.dots[k + 1], wedge.dots[k + 2])
    for (const k of [-2, 2]) {
      for (let d = 7; d <= 12; d++) {
        const x = hx - g.side * d
        if (ahead(x)) dot(out, x, hy + k, d < 10 ? light(c, 0.5) : c)
      }
    }
  }
  const age = t - PECK_HIT
  if (age < 0 || age >= 12) return
  if (age === 0) disc(out, tx, ty, 3, WHITE)
  if (age >= 1 && age < 3) ring(out, tx, ty, 3 + age * 2, light(c, 0.3))
  if (age >= 1 && age < 6) star(out, tx, ty - (age > 3 ? 1 : 0), STAR, c)
  else if (age >= 6 && age < 9) star(out, tx, ty - 2, SMALL_STAR, c)
  else if (age >= 9) spark(out, tx, ty - 3, 1, c)
  sparksFrom(out, t, a, tx, ty, { start: PECK_HIT, count: 6, life: 8, spread: 3.6, speed: 1, fall: 0.05 }, [WHITE, light(c, 0.4), c])
}

const DRILL_START = 9
const DRILL_END = 29
const DRILL_HITS = 6

const drillDash = (t, far) => keys(t, [[0, 0], [6, -2], [DRILL_START - 1, -2], [DRILL_START + 2, far, easeIn], [DRILL_END, far], [DRILL_END + 7, 0]])

// A cone of spinning light from base (bx, by) toward (tx, ty), len pixels long
function drill(out, t, bx, by, tx, ty, len, half, c) {
  const d = Math.hypot(tx - bx, ty - by) || 1
  const ux = (tx - bx) / d
  const uy = (ty - by) / d
  const bands = [WHITE, light(c, 0.5), light(c, 0.5), dark(c, 0.15), dark(c, 0.3), dark(c, 0.15)]
  const buf = shape()
  const box = len + half + 1
  for (let py = Math.floor(by - box); py <= Math.ceil(by + box); py++) {
    for (let px = Math.floor(bx - box); px <= Math.ceil(bx + box); px++) {
      const along = (px - bx) * ux + (py - by) * uy
      const across = (px - bx) * -uy + (py - by) * ux
      if (along < 0 || along > len) continue
      const w = half * (1 - along / len) + 0.4
      if (Math.abs(across) > w) continue
      // Slanted bands that scroll every tick, so the cone seems to spin
      const band = Math.floor(along * 0.9 + across * 1.3 - t * 2)
      dot(buf, px, py, along > len - 1.5 ? WHITE : bands[((band % 6) + 6) % 6])
    }
  }
  rimmed(out, buf.dots, dark(c, 0.6))
}

// Crouch as a cone of light forms on the beak, then barrel roll forward into the
// target and grind into it, sparks spraying with every turn of the drill
function drillpeck(out, t, a, g, c) {
  const tx = fit(g, g.target.x, 3)
  const ty = g.target.y
  const far = clamp(Math.abs(tx - g.mouth.x) - 7, 0, 7)
  const dash = drillDash(t, far)
  out.dx = Math.round(g.side * dash)
  if (t < DRILL_START) {
    out.sy = keys(t, [[0, 1], [6, 0.9], [DRILL_START - 1, 0.9], [DRILL_START, 1]])
    out.skew = leanAhead(g, keys(t, [[0, 0], [6, -2], [DRILL_START - 1, -2], [DRILL_START, 0]]))
  }
  const rolling = t >= DRILL_START && t < DRILL_END
  if (rolling) {
    const spin = Math.cos((t - DRILL_START) * 0.75)
    out.sy = 0.5 + 0.5 * Math.abs(spin)
    out.flipY = spin < 0
    if (t >= DRILL_START + 3) out.dx += tremble(t)
  }
  if (t >= DRILL_START && t < DRILL_START + 3) out.ghosts = trail(g, t, (k) => drillDash(k, far), light(c, 0.4))
  const grow = keys(t, [[1, 0], [DRILL_START - 1, 1, easeOut], [DRILL_END, 1], [DRILL_END + 5, 0, easeIn]])
  if (grow <= 0.05) return
  const bx = g.mouth.x + out.dx - g.side
  const by = g.mouth.y + 1
  const dist = Math.hypot(tx - bx, ty - by) || 1
  const len = Math.max(3, Math.min(dist, 13) * grow)
  drill(out, t, bx, by, tx, ty, len, 3.5 * grow, c)
  if (!rolling) return
  // Each turn of the drill bites in with a flash at the tip and a jolt
  const turnLen = (DRILL_END - DRILL_START - 2) / DRILL_HITS
  const k = Math.floor((t - DRILL_START - 2) / turnLen)
  const within = t - DRILL_START - 2 - k * turnLen
  const tipX = bx + ((tx - bx) / dist) * len
  const tipY = by + ((ty - by) / dist) * len
  if (k >= 0 && k < DRILL_HITS && within < 1) {
    burst(out, tipX, tipY, 3, WHITE)
    out.shake = [k % 2 ? g.side : -g.side, 0]
  }
  emit(t, { count: 34, start: DRILL_START + 2, gap: 0.55, life: 6 }, (i, age, f) => {
    const ang = turn(g, Math.PI + (rnd(a.seed, i, 5) - 0.5) * 2.8)
    const sp = 1 + rnd(a.seed, i, 6)
    dot(out, tipX + Math.cos(ang) * sp * age, tipY + Math.sin(ang) * sp * age + 0.12 * age * age, f < 0.4 ? WHITE : f < 0.7 ? light(c, 0.3) : c)
  })
}

const JABS = [5, 11, 17, 23, 29]
const JAB_HEIGHTS = [-4, 2, -1, 4, 0]

// A lance of light, pointed at the head, swelling just behind it, trailing thin
const LANCE = (s) => (s < 0.75 ? Math.sqrt(s / 0.75) : (1 - s) / 0.25)

// Stab again and again. Lances of light shoot from the face to the target at
// different heights, each landing with a burst, the last with a jolt.
function furyattack(out, t, a, g, c) {
  const frames = [[0, 0]]
  for (const j of JABS) frames.push([j - 2, -1], [j, 2, easeIn])
  frames.push([JABS[JABS.length - 1] + 6, 0])
  out.dx = Math.round(g.side * keys(t, frames))
  out.skew = leanAhead(g, keys(t, frames) * 1.2)
  const last = JABS.length - 1
  if (JABS.includes(t)) out.shake = [t === JABS[last] ? g.side * 2 : g.side, 0]
  const tx = fit(g, g.target.x, 4)
  const hh = halfSpan(g)
  JABS.forEach((j, k) => {
    const age = t - j + 1
    if (age < 0 || age >= 9) return
    const big = k === last
    const hy = clamp(g.target.y + Math.round((JAB_HEIGHTS[k] * hh) / 5), 2, g.ground - 2)
    const hx = tx + g.side * (k % 2)
    const mx = g.mouth.x + out.dx
    const my = g.mouth.y + 1
    if (age < 3) {
      const head = clamp((age + 1) / 2, 0, 1)
      const tail = Math.max(0, head - 0.6)
      const x0 = lerp(mx, hx, tail)
      const y0 = lerp(my, hy, tail)
      const x1 = lerp(mx, hx, head)
      const y1 = lerp(my, hy, head)
      stroke(out, x0, y0, x1, y1, big ? 4.6 : 3.6, [WHITE, light(c, 0.4), c, dark(c, 0.3)], { profile: LANCE })
    }
    if (age >= 1 && age < 5) burst(out, hx, hy, (big ? 7 : 5) - age, age < 3 ? WHITE : c)
    if (age === 1) disc(out, hx, hy, big ? 2 : 1, WHITE)
    if (age >= 5 && age < 7) spark(out, hx, hy, 1, c)
  })
}

const BONE_RIM = 0x5a4430

// A bone from (x, y) toward `angle` for len pixels, knobbed at both ends
function bone(out, x, y, angle, len, c, paint = dot) {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const buf = shape()
  const shadow = mix(c, 0x8a7458, 0.5)
  stroke(buf, x + ux, y + uy, x + ux * (len - 1), y + uy * (len - 1), 2, [WHITE, c, shadow], { profile: EVEN, lit: 1 })
  for (const end of [0.8, len - 0.8]) {
    for (const sgn of [-1, 1]) {
      const kx = x + ux * end - uy * sgn * 1.4
      const ky = y + uy * end + ux * sgn * 1.4
      disc(buf, kx, ky, 1.1, sgn < 0 ? c : shadow)
      dot(buf, kx, ky, sgn < 0 ? WHITE : c)
    }
  }
  rimmed(out, buf.dots, BONE_RIM, paint)
}

const CLUB_HIT = 12

// The angle of the club at tick t, before it settles after the hit
const clubSwing = (t, strike) => keys(t, [[0, -1.5], [CLUB_HIT - 3, -2.1], [CLUB_HIT, strike, easeIn], [CLUB_HIT + 5, strike], [CLUB_HIT + 10, -1.4]])

// Hoist a bone club behind the head, then swing it in a whistling arc and bring it
// down on the target with a bonk
function boneclub(out, t, a, g, c) {
  out.dx = Math.round(g.side * keys(t, [[0, 0], [8, -2], [CLUB_HIT - 3, -2], [CLUB_HIT, 3, easeIn], [CLUB_HIT + 5, 3], [26, 0]]))
  out.dy = Math.round(keys(t, [[0, 0], [8, -1], [CLUB_HIT - 3, -1], [CLUB_HIT, 0, easeIn]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [8, -2], [CLUB_HIT - 3, -2], [CLUB_HIT, 3, easeIn], [CLUB_HIT + 5, 2], [26, 0]]))
  if (t === CLUB_HIT) out.shake = [g.side * 2, 1]
  if (t === CLUB_HIT + 1) out.shake = [-g.side, -1]
  if (t === CLUB_HIT + 2) out.shake = [g.side, 0]
  const hx = g.mouth.x + out.dx - g.side * 2
  const hy = g.mouth.y + 2 + out.dy
  // Aim so the head of the bone lands on the target from where the swing ends
  const sx = g.mouth.x + g.side
  const sy = g.mouth.y + 2
  const tx = fit(g, g.target.x, 3)
  const ty = g.target.y
  const len = clamp(Math.hypot(tx - sx, ty - sy), 8, 12)
  const strike = clamp(Math.atan2(ty - sy, Math.abs(tx - sx)), 0.5, 1.1)
  const settle = t > CLUB_HIT && t < CLUB_HIT + 5 ? Math.sin((t - CLUB_HIT) * 2) * 0.12 : 0
  const angle = clubSwing(t, strike) - settle
  const dim = phase(t, CLUB_HIT + 7, CLUB_HIT + 11)
  if (t >= 1 && t < CLUB_HIT + 11) {
    if (t >= CLUB_HIT - 2 && t <= CLUB_HIT) {
      const prev = clubSwing(t - 1.5, strike)
      arc(out, hx, hy, len - 1, turn(g, prev), turn(g, angle), 3.4, [WHITE, light(c, 0.2), mix(c, 0x8a7458, 0.5)], { profile: SWELL })
    }
    // Held behind the head the bone passes behind the body
    const behind = Math.cos(angle) < -0.2
    bone(out, hx, hy, turn(g, angle), len, mix(c, 0x6a5a48, dim * 0.6), behind ? back : dot)
  }
  const age = t - CLUB_HIT
  const head = onCircle(sx, sy, len, turn(g, strike))
  if (age >= 0 && age < 5) burst(out, head.x, head.y, [6, 5, 4, 3, 2][age], age < 2 ? WHITE : 0xffe36e)
  // Little stars reeling off the bonk
  emit(t, { count: 3, start: CLUB_HIT + 1, gap: 0, life: 10 }, (i, age) => {
    const ang = -Math.PI / 2 + (i - 1) * 0.9
    const x = head.x + Math.cos(ang) * (2 + age * 0.7)
    const y = head.y + Math.sin(ang) * (2 + age * 0.7) + age * age * 0.03
    if (age < 7) plus(out, x, y, 0xffe36e, WHITE)
    else dot(out, x, y, 0xffe36e)
  })
}

const BOOMERANG_THROW = 7
const BOOMERANG_CATCH = 35

// Wind up and hurl a spinning bone. It loops out low, cracks into the target, then
// curves back high over the top and lands in the mon's grip.
function bonemerang(out, t, a, g, c) {
  const throwT = BOOMERANG_THROW
  const catchT = BOOMERANG_CATCH
  out.dx = Math.round(g.side * keys(t, [[0, 0], [5, -2], [throwT, 2, easeIn], [throwT + 4, 0], [catchT - 1, 0], [catchT, -2, easeOut], [catchT + 6, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [5, -2], [throwT, 3, easeIn], [throwT + 5, 0], [catchT - 1, 0], [catchT, -2, easeOut], [catchT + 6, 0]]))
  const hx = g.mouth.x - g.side
  const hy = g.mouth.y + 2
  const tx = fit(g, g.target.x, 4)
  const ty = g.target.y
  const len = 9
  const midX = (hx + tx) / 2
  const midY = (hy + ty) / 2
  const rx = Math.abs(tx - hx) / 2
  const ry = clamp(2 + rx * 0.5, 3, 7)
  // Out along the bottom of a loop, then back along its top, slowing at the far end
  const at = (tick) => {
    const f = phase(tick, throwT, catchT)
    const q = f < 0.5 ? 0.5 * easeOut(f * 2) : 0.5 + 0.5 * easeIn((f - 0.5) * 2)
    const ang = Math.PI * (1 - 2 * q)
    return { x: midX + g.side * rx * Math.cos(ang), y: midY + ry * Math.sin(ang) }
  }
  if (t < throwT) {
    const ang = keys(t, [[0, -1.6], [throwT - 1, -2.7], [throwT, -1.2, easeIn]])
    bone(out, hx + out.dx, hy, turn(g, ang), len, c, Math.cos(ang) < -0.2 ? back : dot)
    return
  }
  if (t >= catchT) {
    if (t < catchT + 3) spark(out, hx + out.dx, hy, 3 - (t - catchT), light(c, 0.3))
    return
  }
  // A fading streak along the path just flown, then the spinning bone itself
  for (let k = 4; k >= 1; k--) {
    if (t - k < throwT) continue
    const p = at(t - k)
    dot(out, p.x, p.y, k < 3 ? light(c, 0.2) : mix(c, 0x707080, 0.5))
  }
  const p = at(t)
  const spin = t * 1.1
  bone(out, p.x - (Math.cos(spin) * len) / 2, p.y - (Math.sin(spin) * len) / 2, spin, len, c)
  const hit = Math.round(lerp(throwT, catchT, 0.5))
  const age = t - hit
  if (age >= 0 && age < 5) burst(out, tx + g.side, ty, [6, 5, 4, 3, 2][age], age < 2 ? WHITE : 0xffe36e)
  if (age === 0) out.shake = [g.side * 2, 1]
  if (age === 1) out.shake = [-g.side, 0]
  sparksFrom(out, t, a, tx + g.side, ty, { start: hit, count: 8, life: 10, spread: 3.4, speed: 1.1, fall: 0.1 }, [WHITE, 0xffe36e, c])
}

const WRAP_REACH = 10
const WRAP_SQUEEZE = 18
const WRAP_LET_GO = 31

// Thick tubes along paths of points [x, y], lit from above with a darker band every few
function tube(out, paths, r, body, paint = dot) {
  const hi = light(body, 0.4)
  const lit = light(body, 0.18)
  const shadow = dark(body, 0.3)
  const buf = shape()
  for (const pts of paths) {
    pts.forEach(([x, y], i) => {
      const band = i % 4 === 0
      for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
        for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
          if ((px - x) ** 2 + (py - y) ** 2 > r * r + 0.5) continue
          const v = (py - y) / r
          dot(buf, px, py, band ? (v < -0.3 ? lit : v < 0.4 ? body : shadow) : v < -0.4 ? hi : v < 0.1 ? lit : v < 0.6 ? body : shadow)
        }
      }
    })
  }
  rimmed(out, buf.dots, dark(body, 0.6), paint)
}

// Rear back, shoot out a thick coil that loops around the target, squeeze it hard
// twice, then let go and reel the coil back in
function wrap(out, t, a, g, c) {
  const body = c ?? g.body
  out.dx = Math.round(g.side * keys(t, [[0, 0], [4, -2], [6, -2], [9, 1, easeIn], [WRAP_LET_GO, 1], [WRAP_LET_GO + 8, 0]]))
  out.sy = keys(t, [[0, 1], [4, 0.92], [6, 0.92], [9, 1.03], [11, 1]])
  out.skew = leanAhead(g, keys(t, [[0, 0], [4, -2], [6, -2], [9, 2, easeIn], [13, 1], [WRAP_LET_GO, 1], [WRAP_LET_GO + 8, 0]]))
  const squeezing = t >= WRAP_SQUEEZE && t < WRAP_LET_GO
  if (squeezing) out.dx += tremble(t, 2)
  const pulse = squeezing ? Math.max(0, Math.sin(((t - WRAP_SQUEEZE) / (WRAP_LET_GO - WRAP_SQUEEZE)) * Math.PI * 4 - 0.5)) : 0
  if (squeezing && pulse > 0.9) out.shake = [0, 1]
  if (t < 5 || t >= 42) return
  const r = g.pixels >= 26 ? 2 : 1.5
  const hh = halfSpan(g)
  const loosen = keys(t, [[WRAP_LET_GO, 0], [WRAP_LET_GO + 5, 1, easeOut]])
  const rx = 5 - pulse * 1.6 + loosen * 3
  const ry = 2.2
  const tx = fit(g, g.target.x, 8)
  const gapY = Math.max(4, Math.round(hh * 0.8)) - pulse * 1.2
  const ty = Math.min(g.target.y, g.ground - gapY - 3)
  const mx = g.mouth.x + out.dx - g.side * 2
  const my = g.mouth.y + 2
  const ex = tx - g.side * rx
  const ey = ty - gapY
  // The coil reaches out to the target, then reels back in after letting go
  const reach = keys(t, [[5, 0], [WRAP_REACH, 1, easeOut], [WRAP_LET_GO + 3, 1], [41, 0, easeIn]])
  const pts = []
  const n = Math.ceil(Math.hypot(ex - mx, ey - my) * 1.4)
  for (let i = 0; i <= n * reach; i++) {
    const s = i / n
    const wave = Math.sin(s * Math.PI) * Math.sin(s * 9 - t * 0.9) * 1.4
    pts.push([lerp(mx, ex, s), lerp(my, ey, s) + wave])
  }
  if (t >= WRAP_LET_GO + 5 || t < WRAP_REACH) {
    tube(out, [pts], r, body)
    return
  }
  // Loops wind on one by one; the far half of each passes behind, the near half in front
  const loops = []
  for (let k = 0; k < 3; k++) {
    const grow = phase(t, WRAP_REACH + k * 2, WRAP_REACH + k * 2 + 3)
    if (grow <= 0) continue
    const cy = ty - gapY + k * gapY
    const behind = []
    const front = []
    const steps = Math.ceil(rx * 7)
    for (let i = 0; i <= steps * grow; i++) {
      const ang = Math.PI + (i / steps) * Math.PI * 2
      const wob = squeezing ? tremble(t + k) * 0.4 : 0
      const p = [tx + g.side * rx * Math.cos(ang) + wob, cy + ry * Math.sin(ang)]
      if (Math.sin(ang) < 0) behind.push(p)
      else front.push(p)
    }
    loops.push({ behind, front })
  }
  tube(out, loops.map((loop) => loop.behind), r - 0.3, dark(body, 0.25))
  tube(out, [pts], r, body)
  tube(out, loops.map((loop) => loop.front), r, body)
  if (squeezing && pulse > 0.5) {
    for (const sgn of [-1, 1]) spark(out, tx + sgn * (rx + 3), ty - gapY - 1 + (t % 2), pulse > 0.85 ? 2 : 1, WHITE)
  }
}

export const WEAPONS = {
  scratch: { ticks: 28, color: 0xb8c8e8, draw: scratch },
  slash: { ticks: 32, color: 0xb8c8e8, draw: slash },
  furyswipes: { ticks: 40, color: 0xb8c8e8, draw: furyswipes },
  cut: { ticks: 30, color: 0xb8c8e8, draw: cut },
  bite: { ticks: 32, color: 0xffffff, draw: bite },
  hyperfang: { ticks: 34, color: 0xffffff, draw: hyperfang },
  crabhammer: { ticks: 40, color: 0xff6a3a, draw: crabhammer },
  vicegrip: { ticks: 34, color: 0xffffff, draw: vicegrip },
  guillotine: { ticks: 40, color: 0xffffff, draw: guillotine },
  peck: { ticks: 26, color: 0xffe36e, draw: peck },
  drillpeck: { ticks: 40, color: 0xffe36e, draw: drillpeck },
  furyattack: { ticks: 36, color: 0xffe36e, draw: furyattack },
  boneclub: { ticks: 32, color: 0xf0ead8, draw: boneclub },
  bonemerang: { ticks: 48, color: 0xf0ead8, draw: bonemerang },
  wrap: { ticks: 44, color: null, draw: wrap },
}
