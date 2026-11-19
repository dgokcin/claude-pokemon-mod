// Flying moves

import {
  WHITE, back, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, lerp, light, line, mix, phase, plus,
  puff, ring, rnd, spark, sparkles, stamp, tremble,
} from './draw.js'

const TAU = Math.PI * 2

// Wind from the move's color: white, pale, a mid blue and a deep blue edge that holds up
// on a light terminal
const winds = (c) => [WHITE, mix(c, 0xa8d8f8, 0.35), mix(c, 0x5a96d2, 0.65), mix(c, 0x2a5690, 0.85)]

const DUST = [0xe6d2a2, 0xc0a070, 0x86683e]
const LEAF = [0xa6e06e, 0x4fae4a, 0x2d6e2e]
const STORM = [0x9aa2ae, 0x747c8a, 0x50566a]
const TWIG = [0xd0a060, 0x9a6a34, 0x5e3c1c]

// A lean of px pixels at the crown, none at the feet
function lean(g, px, dy = 0) {
  if (!px) return null
  const h = Math.max(1, g.bottom - g.top)
  return (y) => px * clamp((g.bottom + dy - y) / h, 0, 1)
}

// The height of a hop f of the way through it, peaking at h pixels
const hop = (f, h) => 4 * h * f * (1 - f)

// A point along the curve from p0 to p2 that bows toward p1
function bez(p0, p1, p2, u) {
  const v = 1 - u
  return [v * v * p0[0] + 2 * v * u * p1[0] + u * u * p2[0], v * v * p0[1] + 2 * v * u * p1[1] + u * u * p2[1]]
}

// A sharp cut from one point to another, white in its middle and deep at the tips,
// drawn out to `head` of its length
function cut(out, x0, y0, x1, y1, tones, head = 1) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)))
  const nx = -(y1 - y0) / n
  const ny = (x1 - x0) / n
  for (let k = 0; k <= n * head; k++) {
    const f = k / n
    const mid = Math.sin(Math.PI * f)
    const x = lerp(x0, x1, f)
    const y = lerp(y0, y1, f)
    dot(out, x, y, mid > 0.55 ? tones[0] : mid > 0.25 ? tones[1] : tones[2])
    if (mid > 0.3) dot(out, x + nx, y + ny, tones[mid > 0.7 ? 1 : 2])
    if (mid > 0.65) dot(out, x - nx, y - ny, tones[3])
  }
}

// A feather `len` pixels long tilted by `tilt`: a deep quill with pale vanes
function feather(out, x, y, tilt, len, tones, paint = dot) {
  const ux = Math.cos(tilt)
  const uy = Math.sin(tilt)
  for (let k = 0; k < len; k++) {
    const px = x + ux * (k - len / 2)
    const py = y + uy * (k - len / 2)
    paint(out, px, py, k === 0 ? tones[3] : tones[2])
    if (k > 0 && k < len - 1) paint(out, px - uy, py + ux, k % 2 ? tones[0] : tones[1])
    if (len > 5 && k > 1 && k < len - 1) paint(out, px + uy, py - ux, tones[1])
  }
}

// The air just outside the sprite's outline
function edgeOf(g) {
  const pts = []
  for (let y = g.top - 1; y <= g.bottom; y++) {
    for (let x = g.left - 1; x <= g.right + 1; x++) {
      if (g.solid(x, y)) continue
      if (g.solid(x - 1, y) || g.solid(x + 1, y) || g.solid(x, y - 1) || g.solid(x, y + 1)) pts.push([x, y])
    }
  }
  return pts
}

const SLASH_FLAPS = [7, 15, 23]
const SLASH_FLIGHT = 4

// A tall crescent of air bowing toward `side`, white on its leading edge
function blade(out, x, y, h, side, tones) {
  for (let k = -h; k <= h; k++) {
    const u = Math.abs(k / h)
    const px = x + side * 2.5 * (1 - u * u)
    dot(out, px, y + k, tones[u > 0.7 ? 1 : 0])
    if (u < 0.85) dot(out, px - side, y + k, tones[1])
    if (u < 0.55) dot(out, px - side * 2, y + k, tones[2])
    if (u < 0.3) dot(out, px - side * 3, y + k, tones[3])
  }
}

// Beat the wings three times, each beat flinging a tall crescent of air that slices
// the target with a long diagonal cut, crossing the last
function airslash(out, t, a, g, c) {
  const tones = winds(c)
  const faded = [tones[1], tones[2], tones[3], tones[3]]
  const side = g.side
  const h = clamp(Math.round((g.bottom - g.top) * 0.3), 3, 6)
  const beat = SLASH_FLAPS.find((s) => t >= s - 3 && t < s + 2)
  if (beat !== undefined) {
    const up = t < beat
    out.dx = up ? -side : side
    out.dy = up ? -1 : 0
    out.sy = up ? 1.06 : 0.95
    out.skew = lean(g, up ? -side * 2 : side * 2, out.dy)
  } else if (t >= 1 && t < SLASH_FLAPS[0] - 3) out.sy = 0.96

  const fromX = g.mouth.x + side * 2
  SLASH_FLAPS.forEach((fire, k) => {
    const age = t - fire
    const ty = g.target.y + [-2, 1, -1][k]
    if (age >= 0 && age < SLASH_FLIGHT) {
      const f = (age + 1) / SLASH_FLIGHT
      const x = lerp(fromX, g.target.x - side * 2, easeIn(f))
      const y = lerp(g.mouth.y, ty, f)
      for (const oy of [1 - h, 0, h - 1]) {
        const tail = 3 + age * 3
        for (let d = 2; d < tail; d++) if (d % 3 !== 1) dot(out, x - side * d, y + oy, d < tail / 2 ? tones[1] : tones[2])
      }
      blade(out, x, y, h, side, tones)
    }
    // The cut grows across the target in two ticks, then dims
    const hit = age - SLASH_FLIGHT
    if (hit >= 0 && hit < 5) {
      const r = h + 1
      const s = k % 2 ? -1 : 1
      cut(out, g.target.x - side * r, ty - s * r, g.target.x + side * r, ty + s * r, hit < 2 ? tones : faded, phase(hit, -1, 1))
      if (hit === 0) {
        disc(out, g.target.x, ty, 1.5, WHITE)
        out.shake = [side, k === 2 ? 1 : 0]
      }
    }
    // Wisps of the broken blade curl away above and below
    emit(hit, { count: 4, gap: 0, life: 7 }, (i, life, f) => {
      const up = i % 2 ? 1 : -1
      const ang = life * 0.6 + i
      const x = g.target.x + side * (life * 0.9 + Math.cos(ang))
      const y = ty + up * (2 + life * 0.7) + Math.sin(ang)
      dot(out, x, y, f < 0.5 ? tones[1] : tones[2])
    })
  })
}

const MIRROR_UP = 7
const MIRROR_COPY = 14
const MIRROR_BREAK = 30

// Raise a mirror beside the mon that shows it flipped. A glint runs over the glass, the
// two bob as one while light pours from the reflection into the mon, then the glass shatters
function mirrormove(out, t, a, g, c) {
  const tones = winds(c)
  const side = g.side
  const pw = clamp(g.right - g.left + 3, 7, 18)
  let pl = side > 0 ? g.right + 3 : g.left - 2 - pw
  pl = clamp(pl, 0, g.columns - pw)
  const pr = pl + pw - 1
  const top = Math.max(0, g.top - 2)
  const bottom = g.ground
  const grow = easeOut(phase(t, 1, MIRROR_UP))
  const shown = Math.round(lerp(bottom, top, grow))
  const whole = t < MIRROR_BREAK

  const bob = t >= MIRROR_COPY && t < MIRROR_COPY + 8 ? -Math.round(hop(phase(t, MIRROR_COPY, MIRROR_COPY + 8), 2)) : 0
  out.dy = bob
  if (whole && grow > 0) {
    const glass = mix(c, 0x24344e, 0.72)
    const sheen = mix(c, 0x6080a8, 0.5)
    for (let y = shown + 1; y < bottom; y++) {
      for (let x = pl + 1; x < pr; x++) back(out, x, y, (x - y + t) % 9 < 2 ? sheen : glass)
    }
    const frame = mix(c, 0x9098b0, 0.5)
    for (let y = shown; y <= bottom; y++) {
      dot(out, pl, y, y === shown ? WHITE : frame)
      dot(out, pr, y, y === shown ? WHITE : dark(frame, 0.35))
    }
    for (let x = pl + 1; x < pr; x++) dot(out, x, shown, x % 2 ? frame : light(frame, 0.4))
    const dx = Math.round((pl + pr) / 2 - (g.left + g.right) / 2)
    if (t >= MIRROR_UP - 2) {
      const inside = (x, y) => x > pl && x < pr && y > shown && y < bottom
      out.ghosts = [{ dx, dy: bob, flip: true, shade: (col, x, y) => (inside(x, y) ? mix(col, tones[1], 0.35) : null) }]
    }
    // A glint sweeps down the glass
    const sweep = t - MIRROR_UP - 2
    if (sweep >= 0 && sweep < 8) {
      for (let k = 0; k < 4; k++) {
        const y = top + sweep * 3 + k
        const x = pl + 1 + k + sweep
        if (x < pr && y < bottom) dot(out, x, y, k < 2 ? WHITE : tones[1])
      }
    }
  }

  // Light pours out of the reflection into the mon
  emit(t, { count: 9, gap: 1.2, start: MIRROR_COPY + 3, life: 6 }, (i, age, f) => {
    const y0 = lerp(g.top + 2, g.bottom - 2, rnd(a.seed, i))
    const x = lerp((pl + pr) / 2, g.cx, easeIn(f))
    const y = lerp(y0, g.cy, f) + bob
    plus(out, x, y, tones[2], tones[f < 0.5 ? 0 : 1])
  })
  if (t >= MIRROR_COPY + 6 && t < MIRROR_BREAK) {
    const f = 0.15 + 0.15 * Math.sin(t * 1.1)
    out.shade = (x, y, col) => mix(col, tones[1], f)
  }

  // The glass flashes and breaks into shards that tumble to the ground
  const crack = t - MIRROR_BREAK
  if (crack === 0) {
    for (let y = top; y <= bottom; y++) for (let x = pl; x <= pr; x++) if ((x + y) % 2 === 0) dot(out, x, y, WHITE)
    out.shake = [side, 0]
  }
  emit(crack, { count: 12, gap: 0, life: 10 }, (i, age, f) => {
    const x0 = lerp(pl + 1, pr - 1, rnd(a.seed, i, 3))
    const y0 = lerp(top + 1, bottom - 2, rnd(a.seed, i, 4))
    const vx = (rnd(a.seed, i, 5) - 0.5) * 1.4
    const y = y0 + age * 0.3 + age * age * 0.12
    if (y > g.ground) return
    const x = x0 + vx * age
    const ang = age * 0.9 + i
    const col = f < 0.5 && (i + age) % 3 === 0 ? WHITE : tones[(i % 2) + 1]
    dot(out, x, y, col)
    dot(out, x + Math.round(Math.cos(ang)), y + Math.round(Math.sin(ang)), tones[3])
  })
}

// Wind ribbons stream past from behind the mon and on ahead, leaves riding them, while
// it leans into the wind and speed chevrons flash beside it
function tailwind(out, t, a, g, c) {
  const tones = winds(c)
  const side = g.side
  const blow = easeOut(phase(t, 4, 14)) * (1 - easeInOut(phase(t, 34, 42)))
  if (blow > 0) out.skew = lean(g, side * (1.5 + 0.8 * Math.sin(t * 1.3)) * blow)
  out.sy = 1 - 0.03 * blow
  const start = side > 0 ? -4 : g.columns + 3
  emit(t, { count: 14, gap: 1.8, start: 2, life: 15 }, (i, age) => {
    const y = 2 + rnd(a.seed, i) * (g.ground - 4)
    const head = start + side * age * (2.6 + rnd(a.seed, i, 1) * 1.2)
    const len = 6 + Math.floor(rnd(a.seed, i, 2) * 7)
    const wave = rnd(a.seed, i, 3) * TAU
    const paint = i % 3 === 0 ? back : dot
    for (let d = 0; d <= len; d++) {
      if (d > len * 0.7 && d % 2) continue
      const x = head - side * d
      const yy = y + Math.sin(x * 0.35 + wave + t * 0.3) * 1.2
      paint(out, x, yy, tones[d < 1 ? 0 : d < len * 0.4 ? 1 : d < len * 0.8 ? 2 : 3])
    }
    if (i % 4 === 1 && age > 3) ring(out, head - side * 3, y - 2, 1.5, tones[2])
  })
  emit(t, { count: 4, gap: 6, start: 6, life: 14 }, (i, age) => {
    const x = start + side * age * 3
    const y = g.bottom - 3 - rnd(a.seed, i, 6) * (g.bottom - g.top) + Math.sin(age * 0.8 + i) * 2
    const flat = (age + i) % 4 < 2
    dot(out, x, y, LEAF[0])
    dot(out, x - side, flat ? y : y + 1, LEAF[1])
    dot(out, x - side * 2, y, LEAF[2])
  })
  // Speed chevrons flash beside the mon, pointing the way the wind blows
  if (t >= 24 && t < 38 && (t >> 1) % 2 === 0) {
    const x = (side > 0 ? g.right : g.left) + side * 3
    const y = g.cy
    for (let k = 0; k < 2; k++) {
      const cx = x + side * k * 3
      line(out, cx, y - 2, cx + side * 2, y, k ? tones[1] : tones[2])
      line(out, cx + side * 2, y, cx, y + 2, k ? tones[1] : tones[2])
    }
  }
}

const BOUNCE_HOP = 4
const BOUNCE_UP = 12
const BOUNCE_LAND = 26
const BOUNCE_BACK = 29
const BOUNCE_HOME = 39
const BOUNCE_END = 45

// How far forward and how high the mon is at tick t
function bouncePath(t, far, high) {
  if (t < BOUNCE_HOP) return [0, 0]
  if (t < BOUNCE_UP - 2) return [0, hop(phase(t, BOUNCE_HOP, BOUNCE_UP - 2), 4)]
  if (t < BOUNCE_UP) return [0, 0]
  if (t <= BOUNCE_LAND) {
    const f = phase(t, BOUNCE_UP, BOUNCE_LAND)
    return [far * f, hop(f, high)]
  }
  if (t < BOUNCE_BACK) return [far, 0]
  if (t < BOUNCE_HOME) {
    const f = phase(t, BOUNCE_BACK, BOUNCE_HOME)
    return [far * (1 - f), hop(f, 5)]
  }
  if (t < BOUNCE_END) return [0, hop(phase(t, BOUNCE_HOME, BOUNCE_END), 1.5)]
  return [0, 0]
}

// Two springy curves either side of the feet, for a squash that's about to spring
function boing(out, g, dx, tones) {
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const x = (s < 0 ? g.left : g.right) + dx + s * (1 + k * 2)
      ring(out, x - s * 2, g.bottom - 2, 2.5, tones[k + 1], s < 0 ? Math.PI : 0, 0.9)
    }
  }
}

// A small hop to coil up, then a huge springy bounce in a high arc that comes down on
// the target with a squash, and two smaller bounces home
function bounce(out, t, a, g, c) {
  const tones = winds(c)
  const side = g.side
  const far = clamp(Math.abs(g.target.x - g.mouth.x), 2, 14)
  const high = clamp(g.top + 6, 8, 20)
  const pos = (s) => bouncePath(s, far, high)
  const [fx, fy] = pos(t)
  out.dx = side * Math.round(fx)
  out.dy = -Math.round(fy)
  const squash = (from, [sy, sx]) => {
    out.sy = sy
    out.sx = sx
    boing(out, g, out.dx, tones)
    if (t === from) dust(out, g.cx + out.dx, g.ground, a.seed)
  }
  if (t >= 1 && t < BOUNCE_HOP) squash(-1, [0.9, 1.06])
  else if (t >= BOUNCE_UP - 2 && t < BOUNCE_UP) squash(BOUNCE_UP - 2, [[0.78, 1.16], [0.84, 1.1]][t - BOUNCE_UP + 2])
  else if (t > BOUNCE_UP && t < BOUNCE_LAND) {
    out.sy = 1.12
    out.sx = 0.92
  } else if (t >= BOUNCE_LAND && t < BOUNCE_BACK) {
    out.sy = [0.68, 0.78, 0.9][t - BOUNCE_LAND]
    out.sx = [1.26, 1.16, 1.06][t - BOUNCE_LAND]
  } else if (t >= BOUNCE_HOME && t < BOUNCE_HOME + 2) squash(BOUNCE_HOME, [0.86, 1.08])

  // A dotted trail along the arc behind the feet
  if ((t > BOUNCE_UP && t <= BOUNCE_LAND) || (t > BOUNCE_BACK && t < BOUNCE_HOME)) {
    for (let k = 1; k <= 10; k++) {
      if (k % 3 === 0) continue
      const [px, py] = pos(t - k * 0.5)
      const x = g.cx + side * Math.round(px)
      const y = g.bottom + 1 - Math.round(py)
      dot(out, x, y, k < 4 ? tones[0] : k < 7 ? tones[1] : tones[2])
      if (k < 7) dot(out, x, y + 1, tones[3])
    }
  }

  // The landing flashes, rings out along the ground and kicks up dust
  const hit = t - BOUNCE_LAND
  const hx = g.cx + side * far
  if (hit >= 0 && hit < 4) burst(out, g.target.x, g.target.y - 1, hit < 2 ? 4 + hit : 6 - hit, hit < 2 ? WHITE : tones[1])
  if (hit >= 1 && hit < 7) {
    const rx = 3 + hit * 2.4
    for (let k = 0; k < rx * 4; k++) {
      const ang = (TAU * k) / (rx * 4)
      dot(out, hx + Math.cos(ang) * rx, g.ground - 1 + Math.sin(ang) * (1 + hit * 0.2), tones[hit < 3 ? 1 : hit < 5 ? 2 : 3])
    }
  }
  if (hit === 0) dust(out, hx, g.ground, a.seed + 3)
  const shakes = [[1, 2], [-1, -1], [1, 1]]
  if (hit >= 0 && hit < shakes.length) out.shake = [shakes[hit][0] * side, shakes[hit][1]]
}

// A tuft of dust either side of a spot on the ground
function dust(out, x, y, seed) {
  for (let k = 0; k < 6; k++) {
    const s = k % 2 ? 1 : -1
    const px = x + s * (2 + Math.floor(rnd(seed, k) * 4))
    dot(out, px, y - 1 - (k % 3 === 0 ? 1 : 0), DUST[k % 3])
  }
}

const ACE_LOCK = 7
const ACE_GONE = 9
const ACE_CUT = 11
const ACE_BACK = 15

// A reticle snaps shut on the target, the mon blinks out in a streak and one clean cut
// splits the target, then it flickers back home
function aerialace(out, t, a, g, c) {
  const tones = winds(c)
  const side = g.side
  const { x: tx, y: ty } = g.target
  if (t >= 1 && t < ACE_GONE) {
    out.sy = 1 - 0.08 * phase(t, 1, ACE_GONE)
    out.dx = t >= 5 ? -side : 0
    out.skew = lean(g, -side * phase(t, 3, ACE_GONE) * 2)
  }
  out.hidden = t >= ACE_GONE && t < ACE_BACK
  if (t >= ACE_BACK && t < ACE_BACK + 4) {
    out.hidden = t % 2 === 1
    out.shade = (x, y, col) => mix(col, WHITE, 0.5 - (t - ACE_BACK) * 0.1)
    out.skew = lean(g, side * (ACE_BACK + 4 - t) * 0.5)
  }
  if (t >= 2 && t < ACE_GONE) spark(out, g.mouth.x - side * 2, g.mouth.y - 2, t < 5 ? 1 : 2, tones[2])

  // Four corner brackets close on the target and flash once locked
  if (t >= 2 && t < ACE_CUT + 2) {
    const r = Math.round(lerp(9, 4, easeOut(phase(t, 2, ACE_LOCK))))
    const col = t >= ACE_LOCK && t % 2 ? WHITE : tones[2]
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = tx + sx * r
        const y = ty + sy * r
        line(out, x, y, x - sx * 2, y, col)
        line(out, x, y, x, y - sy * 2, col)
      }
    }
  }
  // A streak from where it stood to the target, as it moves too fast to see
  if (t >= ACE_GONE && t < ACE_CUT + 1) {
    const from = t === ACE_GONE ? g.cx : g.mouth.x
    for (let k = -2; k <= 2; k++) {
      const y = g.cy + k * 2
      for (let x = from; (tx - x) * side > 0; x += side) if (Math.abs(x - tx) > 2 || k === 0) dot(out, x, y, Math.abs(tx - x) < 4 ? WHITE : tones[Math.abs(k) + 1])
    }
  }
  const hit = t - ACE_CUT
  if (hit >= 0 && hit < 8) {
    const r = 7
    const fade = hit < 4 ? tones : [tones[1], tones[2], tones[3], tones[3]]
    cut(out, tx - side * r, ty + r, tx + side * r, ty - r, fade, phase(hit, -1, 1))
    if (hit < 2) disc(out, tx, ty, 2 - hit, WHITE)
    if (hit >= 2 && hit < 6) {
      spark(out, tx + side * r, ty - r, 4 - (hit >> 1), tones[2])
      spark(out, tx - side * r, ty + r, 3 - (hit >> 1), tones[2])
    }
  }
  if (hit === 0) out.shake = [side, 1]
  if (hit === 1) out.shake = [-side, 0]
}

const BRAVE_CHARGE = 12
const BRAVE_HIT = 19
const BRAVE_LAND = 30

// Blue flame from the move's color, white hot to deep navy
const blueFire = (c) => [WHITE, light(c, 0.5), c, mix(c, 0x2050c0, 0.6), mix(c, 0x10206a, 0.8)]

// Back off as blue flames wrap the body, then charge in low behind a bow shock, crash
// into the target in a huge blast, and get flung back home by the recoil
function bravebird(out, t, a, g, c) {
  const fire = blueFire(c)
  const side = g.side
  const far = clamp(Math.abs(g.target.x - g.mouth.x) - 1, 3, 14)
  let x = 0
  let lift = 0
  if (t < BRAVE_CHARGE) x = -3 * easeOut(phase(t, 0, 8))
  else if (t < BRAVE_HIT) x = lerp(-3, far, easeIn(phase(t, BRAVE_CHARGE, BRAVE_HIT)))
  else if (t < BRAVE_LAND) {
    const f = phase(t, BRAVE_HIT, BRAVE_LAND)
    x = lerp(far, 0, easeOut(f))
    lift = hop(f, 5)
  }
  out.dx = side * Math.round(x)
  out.dy = -Math.round(lift)
  const heat = easeIn(phase(t, 2, BRAVE_CHARGE)) * (1 - phase(t, BRAVE_HIT, BRAVE_HIT + 6))

  if (t >= 4 && t < BRAVE_CHARGE) {
    out.sy = 1 - 0.1 * phase(t, 4, BRAVE_CHARGE)
    out.sx = 1.04
    out.skew = lean(g, -side * 1.5)
    if (t >= 9) out.dx += tremble(t)
  } else if (t >= BRAVE_CHARGE && t < BRAVE_HIT) {
    out.sy = 0.88
    out.sx = 1.12
    out.skew = lean(g, side * 3)
  } else if (t >= BRAVE_HIT && t < BRAVE_LAND) {
    out.skew = lean(g, -side * 2 * (1 - phase(t, BRAVE_HIT, BRAVE_LAND)), out.dy)
    if ((t - BRAVE_HIT) % 4 < 2) out.shade = (px, py, col) => mix(col, 0xff4a3a, 0.35)
  } else if (t >= BRAVE_LAND && t < BRAVE_LAND + 3) {
    out.sy = [0.84, 0.92, 0.98][t - BRAVE_LAND]
    out.sx = [1.1, 1.04, 1][t - BRAVE_LAND]
  }
  if (heat > 0 && t < BRAVE_HIT) {
    const glow = heat
    out.shade = (px, py, col) => mix(col, fire[1], 0.35 * glow)
  }

  // Flame tongues lick off the outline, up while it gathers and back as it charges
  if (heat > 0.05) {
    const charging = t >= BRAVE_CHARGE && t < BRAVE_HIT
    for (const [ex, ey] of edgeOf(g)) {
      const len = Math.floor(rnd(a.seed, ex * 7 + ey, t >> 1) * (1 + heat * (charging ? 6 : 4)))
      for (let k = 0; k < len; k++) {
        const px = ex + out.dx - (charging ? side * k : 0)
        const py = ey + out.dy - (charging ? Math.round(k * 0.3) : k)
        back(out, px, py, fire[Math.min(4, 1 + Math.floor((k / Math.max(1, len)) * 4))])
      }
    }
  }
  // A bow shock of air folds back from the nose as it charges
  if (t >= BRAVE_CHARGE + 1 && t < BRAVE_HIT) {
    const nose = (side > 0 ? g.right : g.left) + out.dx + side * 2
    for (let k = 0; k < 2; k++) {
      const nx = nose - side * k * 3
      const r = 5 - k
      line(out, nx, g.cy, nx - side * r, g.cy - r, k ? fire[2] : WHITE)
      line(out, nx, g.cy, nx - side * r, g.cy + r, k ? fire[2] : WHITE)
    }
  }

  const hit = t - BRAVE_HIT
  const { x: tx, y: ty } = g.target
  if (hit === 0) disc(out, tx, ty, 5, WHITE)
  if (hit >= 0 && hit < 7) burst(out, tx, ty, hit < 3 ? 6 + hit * 2 : 14 - hit * 2, hit < 2 ? WHITE : fire[hit < 4 ? 2 : 3])
  if (hit >= 1 && hit < 7) ring(out, tx, ty, hit * 2.3, fire[Math.min(4, 1 + (hit >> 1))])
  const shakes = [[2, 2], [-2, -1], [2, 1], [-1, 0], [1, 0]]
  if (hit >= 0 && hit < shakes.length) out.shake = [shakes[hit][0] * side, shakes[hit][1]]
  emit(hit, { count: 12, gap: 0, life: 10 }, (i, age, f) => {
    const ang = rnd(a.seed, i, 2) * TAU
    const speed = 1 + rnd(a.seed, i, 3)
    const px = tx + Math.cos(ang) * speed * age
    const py = ty + Math.sin(ang) * speed * age + 0.08 * age * age
    if (py <= g.ground) plus(out, px, py, fire[f < 0.5 ? 2 : 3], f < 0.4 ? WHITE : fire[1])
  })
  // Stars of hurt pop off the mon as the recoil lands
  const ouch = t - BRAVE_LAND
  if (ouch >= 0 && ouch < 8) {
    const r = 2 + ouch * 0.6
    for (let k = 0; k < 3; k++) {
      const ang = -Math.PI / 2 + (k - 1) * 0.9
      spark(out, g.cx + Math.cos(ang) * (g.right - g.left) * 0.5, g.top - 1 + Math.sin(ang) * r, ouch < 4 ? 1 : 0, fire[3])
    }
  }
}

// The legs of Acrobatics: from tick, to tick, from and to as fractions of the way to
// the target, the hop's height, and whether it flips in the air
const ACRO_LEGS = [
  [3, 11, 0, 0.5, 6, true],
  [11, 17, 0.5, 1, 3, false],
  [25, 35, 1, 0, 9, true],
]
const ACRO_HITS = [17, 19, 21]

function acroPath(t, far) {
  for (const [from, to, x0, x1, h, flip] of ACRO_LEGS) {
    if (t >= from && t < to) {
      const f = phase(t, from, to)
      return [far * lerp(x0, x1, easeInOut(f)), hop(f, h), flip && f > 0.3 && f < 0.7]
    }
  }
  if (t >= ACRO_LEGS[1][1] && t < ACRO_LEGS[2][0]) return [far, 0, false]
  return [0, 0, false]
}

// Somersault forward in a hop, spring in to land three quick strikes, then backflip
// home in a high arc and stick the landing
function acrobatics(out, t, a, g, c) {
  const tones = winds(c)
  const side = g.side
  const far = clamp(Math.abs(g.target.x - g.mouth.x) - 2, 3, 14)
  const [fx, fy, flip] = acroPath(t, far)
  out.dx = side * Math.round(fx)
  out.dy = -Math.round(fy)
  out.flipX = flip
  out.flipY = flip
  if (t >= 1 && t < 3) out.sy = 0.88
  if (t >= ACRO_HITS[0] && t < ACRO_LEGS[2][0]) out.dx += (t - ACRO_HITS[0]) % 2 ? side : 0
  if (t >= 35 && t < 38) out.sy = [0.84, 0.92, 0.98][t - 35]

  // Swoosh trails following the body's middle through the air
  if (fy > 0.5) {
    for (let k = 1; k <= 8; k++) {
      const [px, py] = acroPath(t - k * 0.5, far)
      if (py < 0.5) break
      dot(out, g.cx + side * Math.round(px), g.cy - Math.round(py), tones[k < 3 ? 0 : k < 6 ? 1 : 2])
    }
  }
  ACRO_HITS.forEach((at, k) => {
    const age = t - at
    const x = g.target.x + side * [-1, 2, 0][k]
    const y = g.target.y + [-3, 1, -1][k]
    if (age >= 0 && age < 4) {
      burst(out, x, y, age < 2 ? 3 + age : 5 - age, age < 1 ? WHITE : tones[2])
      if (age === 0) out.shake = [side, k === 2 ? 1 : 0]
    }
  })
  const land = t - 35
  if (land >= 1 && land < 6) spark(out, g.cx, g.top - 2, [1, 2, 3, 2, 1][land - 1], tones[2])
}

const CUTTER_THROW = 8
const CUTTER_FLIGHT = 7
const CUTTER_LANES = [0, -1, 1]

// A spinning two armed blade, each arm hooked with a white tip
function spinner(out, x, y, angle, r, tones) {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle) * 0.7
  for (let d = -r; d <= r; d++) dot(out, x + ux * d, y + uy * d, Math.abs(d) < 1 ? tones[1] : tones[2])
  for (const e of [-1, 1]) {
    const px = x + ux * r * e
    const py = y + uy * r * e
    dot(out, px - uy * e * 1.5, py + ux * e * 1.5, tones[3])
    dot(out, px, py, WHITE)
  }
}

// Whip around in a sideways sweep that flings three spinning blades on fanned out
// curves; they cross into the target, then one wide flat cut sweeps through it
function aircutter(out, t, a, g, c) {
  const tones = winds(c)
  const side = g.side
  if (t >= 1 && t < CUTTER_THROW - 1) {
    const f = easeOut(phase(t, 0, CUTTER_THROW - 2))
    out.skew = lean(g, -side * 5 * f)
    out.dx = -side * Math.round(1 + f)
    out.sy = 1 - 0.06 * f
  } else if (t >= CUTTER_THROW - 1 && t < CUTTER_THROW + 3) {
    out.skew = lean(g, side * (t < CUTTER_THROW + 1 ? 5 : 2))
    out.dx = side
    out.sx = 1.06
  }
  const from = [g.mouth.x + side * 2, g.mouth.y]
  // The sweep leaves a swoosh of air in front
  const swing = t - CUTTER_THROW + 1
  if (swing >= 0 && swing < 4) ring(out, g.mouth.x - side * 2, g.mouth.y, 5, tones[swing < 2 ? 1 : 2], side > 0 ? 0 : Math.PI, 0.6 + swing * 0.25)

  const lastHit = CUTTER_THROW + CUTTER_FLIGHT + 2
  CUTTER_LANES.forEach((l, k) => {
    const start = CUTTER_THROW + k
    const age = t - start
    const to = [g.target.x, g.target.y + l * 3]
    const mid = [lerp(from[0], to[0], 0.5), clamp(g.mouth.y + l * 11, 2, g.ground - 2)]
    if (age >= 0 && age < CUTTER_FLIGHT) {
      const f = (age + 1) / CUTTER_FLIGHT
      for (let s = 1; s <= 6; s++) {
        const [qx, qy] = bez(from, mid, to, Math.max(0, f - s * 0.04))
        dot(out, qx, qy, tones[s < 3 ? 1 : s < 5 ? 2 : 3])
      }
      const [px, py] = bez(from, mid, to, f)
      spinner(out, px, py, t * 1.3 + k, 3, tones)
    }
    const hit = age - CUTTER_FLIGHT
    if (hit >= 0 && hit < 3) {
      cut(out, to[0] - side * 3, to[1] - 2 * l - 1, to[0] + side * 3, to[1] + 1, tones, phase(hit, -1, 1))
      if (hit === 0) out.shake = [side, 0]
    }
  })
  // One wide flat cut across the target, drawn back to front
  const sweep = t - lastHit
  if (sweep >= 0 && sweep < 7) {
    const w = 9
    const head = phase(sweep, 0, 2)
    const fade = sweep < 3 ? tones : [tones[1], tones[2], tones[3], tones[3]]
    for (let k = 0; k <= w * 2 * head; k++) {
      const u = k / (w * 2)
      const x = g.target.x - side * w + side * k
      const y = g.target.y + 1 - Math.sin(Math.PI * u) * 2
      const mid = Math.sin(Math.PI * u)
      dot(out, x, y, fade[mid > 0.6 ? 0 : mid > 0.3 ? 1 : 2])
      if (mid > 0.2) dot(out, x, y - 1, fade[1])
      if (mid > 0.3) dot(out, x, y + 1, fade[2])
      if (mid > 0.6) dot(out, x, y + 2, fade[3])
    }
    if (sweep === 1) {
      disc(out, g.target.x, g.target.y - 1, 2, WHITE)
      out.shake = [side, 1]
    }
  }
}

// Fog density at a strip pixel, smooth value noise on a coarse grid
function fogAt(seed, x, y) {
  const gx = x / 5
  const gy = y / 3
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  const sx = (gx - ix) * (gx - ix) * (3 - 2 * (gx - ix))
  const sy = (gy - iy) * (gy - iy) * (3 - 2 * (gy - iy))
  const n = (i, j) => rnd(seed, i * 131 + j, 77)
  return lerp(lerp(n(ix, iy), n(ix + 1, iy), sx), lerp(n(ix, iy + 1), n(ix + 1, iy + 1), sx), sy)
}

// Two octaves of fog noise, so the bank has big billows with ragged edges
const fogDensity = (seed, x, y) => 0.7 * fogAt(seed, x / 1.4, y / 1.4) + 0.3 * fogAt(seed + 9, x * 1.6, y * 1.6)

const DEFOG_BEATS = [9, 17, 25]

// A fog bank rolls in ahead, then three hard wingbeats send waves of wind that shove
// it away in tatters, leaving clean air that twinkles
function defog(out, t, a, g, c) {
  const tones = winds(c)
  const side = g.side
  const beat = DEFOG_BEATS.find((b) => t >= b - 2 && t < b + 2)
  if (beat !== undefined) {
    const up = t < beat
    out.dy = up ? -2 : 0
    out.sy = up ? 1.08 : 0.92
    out.skew = lean(g, up ? -side : side * 2, out.dy)
  }
  const clear = easeIn(phase(t, DEFOG_BEATS[0], 33))
  const thick = easeOut(phase(t, 0, 7))
  const push = side * 18 * clear
  if (thick > 0 && clear < 1) {
    const edge = g.mouth.x + side
    const thr = 0.85 - 0.45 * thick + 0.5 * clear
    for (let y = 0; y <= g.ground; y++) {
      for (let x = edge; x >= 0 && x < g.columns; x += side) {
        const d = fogDensity(a.seed, x - push + t * 0.2 * side, y) - Math.max(0, 3 - Math.abs(x - edge)) * 0.08
        if (d < thr) continue
        const k = d - thr
        dot(out, x, y, k > 0.18 ? light(STORM[0], 0.35) : k > 0.08 ? STORM[0] : STORM[1])
      }
    }
  }
  // Each beat sends a wave of wind rolling out through the fog
  for (const b of DEFOG_BEATS) {
    const age = t - b
    if (age < 0 || age >= 9) continue
    const x = g.mouth.x + side * (2 + age * 3.5)
    for (let y = 1; y < g.ground; y++) {
      const wx = x + side * Math.sin(y * 0.5 + b) * 1.2
      if ((y + age) % 5 === 0) continue
      dot(out, wx, y, tones[age < 3 ? 0 : age < 6 ? 1 : 2])
      dot(out, wx - side, y, tones[age < 5 ? 2 : 3])
    }
  }
  if (t >= 32 && t < a.ticks - 2) sparkles(out, t, a.seed, g.ahead(Math.min(10, g.reach / 2)), g.cy, Math.min(18, g.reach), g.bottom - g.top, tones[2], 6)
}

const FD_FEATHERS = 12

// Where feather i is at tick t, its tilt, and whether it's behind the mon, or null
function featherAt(t, i, a, g) {
  const born = 4 + i * 1.6
  const age = t - born
  if (age < 0) return null
  const w = (g.right - g.left) / 2 + 2
  const spin = i * 2.1 + Math.min(age, 10) * 0.6
  const sx = g.cx + Math.cos(spin) * w
  const sy = g.bottom - 2 - Math.min(age, 10) * 0.9 * ((g.bottom - g.top) / 10)
  if (age < 10) return [sx, sy, spin + Math.PI / 2, Math.sin(spin) < 0]
  const rest = [g.target.x + ((i % 4) - 1.5) * 4 + (rnd(a.seed, i) - 0.5) * 2, g.target.y - 3 + ((i >> 2) - 1) * 4]
  const fly = phase(age, 10, 18)
  const drift = Math.max(0, age - 18)
  const sway = Math.sin(age * 0.45 + i)
  const x = lerp(sx, rest[0], easeInOut(fly)) + sway * 1.5 * fly
  const y = lerp(sy, rest[1] - 5, easeInOut(fly)) + Math.min(5, drift * 0.35)
  return [x, y, sway * 0.6, false]
}

// Dance in place, twirling around, while a flurry of downy feathers spirals up the body,
// then floats over to the target and drifts down onto it
function featherdance(out, t, a, g, c) {
  const tones = [WHITE, light(c, 0.2), mix(c, 0x9a88c8, 0.55), mix(c, 0x5a4880, 0.8)]
  const live = phase(t, 0, 4) * (1 - phase(t, 40, 46))
  if (live > 0) out.skew = lean(g, Math.sin(t * 0.6) * 2.5 * live)
  out.dy = -Math.round(Math.abs(Math.sin(t * 0.3)) * 2 * live)
  out.flipX = (t >= 14 && t < 19) || (t >= 28 && t < 33)
  const fade = phase(t, a.ticks - 6, a.ticks)
  for (let i = 0; i < FD_FEATHERS; i++) {
    const at = featherAt(t, i, a, g)
    if (!at) continue
    if (fade > 0 && rnd(a.seed, i, 9) < fade) continue
    const [x, y, tilt, behind] = at
    feather(out, x, y, tilt, 5, tones, behind ? back : dot)
  }
}

// Float up and settle down into a nest of twigs that weaves itself under the feet, rest
// there breathing slowly as healing motes rise and a feather drifts down, then stand
function roost(out, t, a, g, c) {
  const tones = [WHITE, light(c, 0.3), c, dark(c, 0.45)]
  const rise = easeOut(phase(t, 0, 6))
  const sink = easeInOut(phase(t, 6, 12))
  out.dy = -Math.round(3 * rise * (1 - sink))
  const rest = phase(t, 12, 14) * (1 - phase(t, 34, 38))
  if (t >= 12 && t < 14) out.sy = 0.86
  else if (rest > 0) out.sy = 1 - 0.07 * rest + 0.02 * Math.sin(t * 0.4)
  if (t >= 36 && t < 40) out.sy = 1.05

  // The nest: a bowl of woven twigs that fills in from the middle out, its back rim
  // behind the body and its front over the feet
  const weave = phase(t, 6, 14)
  const unweave = phase(t, 38, 43)
  const half = Math.round((g.right - g.left) / 2 + 3)
  for (let d = -half; d <= half; d++) {
    if (Math.abs(d) / half > weave || rnd(a.seed, d + 40, 4) < unweave) continue
    const x = g.cx + d
    const wall = Math.abs(d) / half
    const rows = wall > 0.65 ? 4 : 2
    for (let r = 0; r < rows; r++) {
      const y = g.ground - r
      const col = TWIG[(((d * 2 + r * 3) % 3) + 3) % 3]
      if (r < 2) dot(out, x, y, (d + r + 8 * half) % 4 === 0 ? TWIG[2] : col)
      else back(out, x, y, col)
    }
    if ((d + half) % 3 === 0 && wall > 0.3) dot(out, x + Math.sign(d), g.ground - rows, TWIG[0])
  }
  if (rest > 0.5) {
    out.shade = (x, y, col) => mix(col, light(c, 0.4), 0.12 + 0.08 * Math.sin(t * 0.4))
    emit(t, { count: 8, gap: 2.4, start: 14, life: 10 }, (i, age, f) => {
      const x = g.cx + (rnd(a.seed, i, 5) - 0.5) * (g.right - g.left + 4) + Math.sin(age * 0.6 + i)
      const y = g.ground - 2 - age * 1.1
      if (f < 0.6) plus(out, x, y, tones[2], tones[0])
      else dot(out, x, y, tones[3])
    })
  }
  emit(t, { count: 2, gap: 8, start: 16, life: 16 }, (i, age) => {
    const sway = Math.sin(age * 0.5 + i * 2)
    const y = g.top + 2 + age * 0.7
    if (y > g.ground - 2) return
    feather(out, g.cx + (i ? 4 : -4) + sway * 2, y, sway * 0.6, 4, [WHITE, light(TWIG[0], 0.6), TWIG[0], TWIG[2]])
  })
}

const HURRI_FORM = 10
const HURRI_PEAK = 20
const HURRI_FADE = 46

// Storm clouds roll over, rain lashes down, and a huge spiral of wind spins up around
// the target with debris whirling in it, the strip shaking, until it tears apart
function hurricane(out, t, a, g, c) {
  const tones = winds(c)
  const side = g.side
  const { x: tx } = g.target
  const ty = clamp(g.target.y, 6, g.ground - 4)
  const live = easeOut(phase(t, 0, 4)) * (1 - easeInOut(phase(t, HURRI_FADE, a.ticks - 4)))
  const flap = Math.sin(t * 1.1)
  out.dy = -Math.round(live * (1.5 + 1.5 * flap))
  out.skew = lean(g, side * 2 * live, out.dy)
  out.sy = 1 + 0.05 * flap * live

  // Clouds roll in over the top and away again
  const roll = easeOut(phase(t, 0, HURRI_FORM)) * (1 - easeIn(phase(t, HURRI_FADE + 2, a.ticks)))
  if (roll > 0) {
    for (let k = 0; k < 7; k++) {
      const x = tx + (k - 3) * 5 - side * (1 - roll) * 30
      puff(out, x, 2 + (k % 2), 3 + (k % 3) * 0.6, STORM[k % 2], a.seed + k)
    }
  }
  // Rain slants in on the wind
  const raining = t >= 6 && t < HURRI_FADE + 4
  if (raining) {
    for (let i = 0; i < 22; i++) {
      const y = (rnd(a.seed, i, 10) * g.ground + t * 3) % g.ground
      const x = tx + (rnd(a.seed, i, 11) - 0.5) * 30 + side * y * 0.3
      dot(out, x, y, tones[2])
      dot(out, x - side * 0.5, y - 1, tones[1])
    }
  }

  // The spiral: three arms wound tighter in the middle, around a dark eye
  const grow = easeOut(phase(t, HURRI_FORM, HURRI_PEAK))
  const fray = easeIn(phase(t, HURRI_FADE, a.ticks - 2))
  const R = clamp(Math.min(g.reach, 11), 6, 11) * grow * (1 + fray * 0.5)
  if (grow > 0 && fray < 1) {
    const spin = -side * t * 0.45
    for (let arm = 0; arm < 3; arm++) {
      for (let r = 1; r <= R; r += 0.5) {
        if (fray > 0 && rnd(a.seed, arm * 64 + r * 2, t >> 1) < fray) continue
        const ang = spin + (arm * TAU) / 3 + r * 0.5
        const x = tx + Math.cos(ang) * r
        const y = ty + Math.sin(ang) * r * 0.6
        const f = r / Math.max(1, R)
        dot(out, x, y, f < 0.3 ? tones[0] : f < 0.65 ? tones[1] : f < 0.9 ? tones[2] : tones[3])
        if (f > 0.25 && f < 0.8) dot(out, x, y + 1, tones[3])
      }
    }
    if (fray < 0.5) ring(out, tx, ty, 1, tones[3])
    // Debris whirled around the eye
    for (let i = 0; i < 8; i++) {
      const r = 3 + rnd(a.seed, i, 12) * (R - 2)
      const ang = spin * 1.4 + i * 0.8
      const x = tx + Math.cos(ang) * r
      const y = ty + Math.sin(ang) * r * 0.6
      const col = i % 2 ? LEAF[i % 3] : DUST[i % 3]
      if (Math.sin(ang) > 0) dot(out, x, y, col)
      else back(out, x, y, dark(col, 0.2))
    }
  }
  if (t >= HURRI_PEAK && t < HURRI_FADE) out.shake = [(t % 2 ? 1 : -1) * side, t % 6 < 3 ? 0 : 1]
}

const PLUCK_PECKS = [6, 10, 14]
const PLUCK_GRAB = 17
const PLUCK_GULP = 25
const BERRY = ['.g.', 'rrr', 'rwr', '.r.']

// Peck the target three times in quick jabs, then a berry pops out of it and arcs back
// into the mon's mouth for a happy gulp
function pluck(out, t, a, g, c) {
  const tones = winds(c)
  const side = g.side
  const peck = PLUCK_PECKS.find((p) => t >= p - 1 && t < p + 2)
  if (t >= 2 && t < PLUCK_PECKS[0] - 1) {
    out.dx = -side
    out.skew = lean(g, -side * 2)
  } else if (peck !== undefined) {
    out.dx = t === peck - 1 ? -side : side * 2
    out.skew = lean(g, t === peck - 1 ? -side : side * 3)
    out.dy = t === peck ? 1 : 0
  }
  PLUCK_PECKS.forEach((p, k) => {
    const age = t - p
    if (age < 0 || age >= 3) return
    const x = g.target.x - side * 2 + [0, 1, -1][k]
    const y = g.target.y + [-2, 0, -3][k]
    // A little v of impact lines where the beak struck
    for (const s of [-1, 1]) line(out, x - side, y, x - side * (3 + age), y + s * (2 + age), age < 1 ? WHITE : tones[2])
    if (age === 0) {
      plus(out, x, y, tones[1], WHITE)
      out.shake = [side, 0]
    }
  })
  const palette = { r: 0xe03a5a, w: 0xffd0e0, g: 0x3ea040 }
  const mouth = [g.mouth.x + side, g.mouth.y]
  if (t >= PLUCK_GRAB && t < PLUCK_GULP) {
    const f = phase(t, PLUCK_GRAB, PLUCK_GULP)
    const x = lerp(g.target.x, mouth[0], f)
    const y = lerp(g.target.y - 2, mouth[1], f) - hop(f, 7)
    stamp(out, x - 1, y - 2, BERRY, palette)
    if (t === PLUCK_GRAB) burst(out, g.target.x, g.target.y - 2, 3, tones[1])
  }
  const gulp = t - PLUCK_GULP
  if (gulp >= 0 && gulp < 4) {
    out.sy = [1.08, 0.94, 1.03, 1][gulp]
    out.sx = [0.95, 1.05, 1, 1][gulp]
  }
  emit(gulp, { count: 4, gap: 0, life: 6 }, (i, age) => {
    const x = mouth[0] + side * (1 + age * 0.5 * (i % 2 ? 1 : 0.5))
    const y = mouth[1] - 1 + age * 0.6 - (i - 1.5)
    dot(out, x, y, i % 2 ? palette.r : palette.w)
  })
  if (gulp >= 3 && gulp < 9) spark(out, g.cx, g.top - 2 - (gulp >> 1), gulp < 6 ? 2 : 1, 0xe03a5a)
}

const DROP_UP = 6
const DROP_OVER = 14
const DROP_GRAB = 17
const DROP_LIFT = 26
const DROP_LET = 28
const DROP_SLAM = 31
const DROP_HOME = 48

// Where Sky Drop has carried the mon at tick t, forward and up
function dropPath(t, far, over, sky) {
  if (t < DROP_UP) return [0, 0]
  if (t < DROP_OVER) {
    const f = easeInOut(phase(t, DROP_UP, DROP_OVER))
    return [far * f, over * f + Math.sin(f * Math.PI) * 3]
  }
  if (t < DROP_GRAB) return [far, lerp(over, over - 3, phase(t, DROP_OVER, DROP_GRAB))]
  if (t < DROP_LIFT) return [far, lerp(over - 3, sky, easeIn(phase(t, DROP_GRAB, DROP_LIFT)))]
  if (t < DROP_SLAM + 2) return [far, sky]
  const f = easeInOut(phase(t, DROP_SLAM + 2, DROP_HOME))
  return [far * (1 - f), sky * (1 - f) + Math.sin(f * Math.PI) * 2]
}

// Fly over the target, swoop down and grab it in its talons, haul it high into the
// sky, let go so it plummets in a streak and slams into the ground, then glide home
function skydrop(out, t, a, g, c) {
  const tones = winds(c)
  const side = g.side
  const far = clamp(Math.abs(g.target.x - g.cx), 3, 20)
  const over = clamp(g.bottom - g.target.y + 4, 6, 14)
  const sky = clamp(Math.round((g.bottom - g.top) * 0.8) + 4, 10, 18)
  const [fx, fy] = dropPath(t, far, over, sky)
  out.dx = side * Math.round(fx)
  out.dy = -Math.round(fy)
  if (t >= 1 && t < DROP_UP) {
    out.sy = 1 - 0.1 * phase(t, 1, DROP_UP)
    out.sx = 1.05
  }
  const flap = Math.sin(t * 1.2)
  if (t >= DROP_UP && t < DROP_HOME) out.sy = 1 + 0.05 * flap
  if (t >= DROP_SLAM + 2 && t < DROP_HOME) out.skew = lean(g, side * 1.5, out.dy)
  const { x: tx, y: ty } = g.target

  // Talons close on the target, then are hauled up with the mon until they let go
  const grip = t - DROP_GRAB + 1
  if (grip >= 0 && t < DROP_LET) {
    const r = Math.max(3, 6 - grip)
    const lifted = t < DROP_GRAB ? 0 : Math.round(fy - dropPath(DROP_GRAB, far, over, sky)[1])
    const gy = ty - lifted
    for (const s of [-1, 1]) {
      const x = tx + s * r
      line(out, x, gy - 3, x, gy + 1, tones[2])
      line(out, x, gy + 1, x - s * 2, gy + 2, WHITE)
      line(out, x, gy - 3, x - s, gy - 4, tones[3])
    }
    if (lifted > 0) disc(out, tx, gy - 1, 2, dark(STORM[2], 0.3))
    if (grip === 1) out.shake = [0, 1]
  }
  // Wind rushes down past the climbing pair
  if (t >= DROP_GRAB && t < DROP_LIFT) {
    for (let k = 0; k < 4; k++) {
      const x = tx + (k - 1.5) * 4
      const y = g.ground - 2 - ((t * 3 + k * 5) % 10)
      line(out, x, y, x, y + 3, tones[k % 2 ? 1 : 2])
    }
  }
  // The drop: a streak plunging straight down the middle onto the ground
  const fall = t - DROP_LET
  if (fall >= 0 && fall < DROP_SLAM - DROP_LET) {
    const head = lerp(0, g.ground - 1, (fall + 1) / (DROP_SLAM - DROP_LET))
    for (let y = Math.max(0, head - 10); y <= head; y++) {
      for (let x = -2; x <= 2; x++) {
        const tone = Math.abs(x) === 2 ? 3 : head - y < 3 ? 0 : head - y < 6 ? 1 : 2
        if (tone === 3 && (y + x) % 2) continue
        dot(out, tx + x, y, tones[tone])
      }
    }
  }
  const slam = t - DROP_SLAM
  if (slam === 0) disc(out, tx, g.ground - 2, 4, WHITE)
  if (slam >= 0 && slam < 6) burst(out, tx, g.ground - 3, slam < 2 ? 6 + slam : 8 - slam, slam < 2 ? WHITE : tones[1])
  if (slam >= 1 && slam < 8) {
    const rx = 2 + slam * 2.6
    for (let k = 0; k < rx * 4; k++) {
      const ang = (TAU * k) / (rx * 4)
      dot(out, tx + Math.cos(ang) * rx, g.ground - 1 + Math.sin(ang) * (1 + slam * 0.2), tones[slam < 3 ? 1 : slam < 5 ? 2 : 3])
    }
  }
  const shakes = [[0, 2], [1, -2], [-1, 1], [1, -1], [0, 1]]
  if (slam >= 0 && slam < shakes.length) out.shake = [shakes[slam][0] * side, shakes[slam][1]]
  emit(slam, { count: 12, gap: 0, life: 12 }, (i, age, f) => {
    const ang = -Math.PI / 2 + (rnd(a.seed, i, 6) - 0.5) * 2.8
    const speed = 0.9 + rnd(a.seed, i, 7)
    const y = g.ground - 2 + Math.sin(ang) * speed * age + 0.13 * age * age
    if (y > g.ground) return
    const x = tx + Math.cos(ang) * speed * age
    dot(out, x, y, DUST[f < 0.5 ? 0 : 2])
    if (i % 2) dot(out, x + 1, y, DUST[1])
  })
}

const BLAST_FIRE = 15
const BLAST_STOP = 33

// Rear back as wind spirals into a spinning ball at the mouth, then fire it as a thick
// beam wrapped in a corkscrew of air that drills into the target in ringing bursts
function aeroblast(out, t, a, g, c) {
  const tones = winds(c)
  const side = g.side
  const { x: mx, y: my } = g.mouth
  const { x: tx } = g.target
  const ty = g.target.y
  const firing = t >= BLAST_FIRE && t < BLAST_STOP
  if (t >= 1 && t < BLAST_FIRE) {
    const f = easeOut(phase(t, 1, BLAST_FIRE - 2))
    out.dx = -side * Math.round(f)
    out.sy = 1 + 0.06 * f
    out.skew = lean(g, -side * 2 * f)
  } else if (firing) {
    out.dx = -side * (t % 2 ? 2 : 1)
    out.skew = lean(g, -side)
    out.shade = (x, y, col) => mix(col, tones[1], 0.2)
  }
  const from = mx + out.dx + (out.skew ? Math.round(out.skew(my)) : 0) + side

  // Wind spirals in and winds up into a ball
  if (t >= 1 && t < BLAST_FIRE + 1) {
    emit(t, { count: 12, gap: 1, start: 1, life: 5 }, (i, age, f) => {
      const ang = i * 2.4 + f * 3
      const d = (1 - f) * 12 + 1
      dot(out, from + side * 2 + Math.cos(ang) * d, my + Math.sin(ang) * d * 0.7, f < 0.5 ? tones[2] : tones[1])
    })
    const r = 1 + 2 * phase(t, 2, BLAST_FIRE)
    ring(out, from + side * 2, my, r, tones[2], t * 0.9, 1.2)
    ring(out, from + side * 2, my, r, tones[1], t * 0.9 + Math.PI, 1.2)
    dot(out, from + side * 2, my, WHITE)
  }
  // The beam with its corkscrew, reaching out over two ticks and thinning from the
  // back as it ends
  if (firing) {
    const reach = phase(t, BLAST_FIRE - 1, BLAST_FIRE + 2)
    const thin = phase(t, BLAST_STOP - 5, BLAST_STOP)
    const len = Math.abs(tx - from)
    for (let d = Math.round(len * thin); d <= len * reach; d++) {
      const x = from + side * d
      const y = Math.round(lerp(my, ty, d / Math.max(1, len)))
      dot(out, x, y, WHITE)
      if (thin < 0.6) {
        dot(out, x, y - 1, tones[1])
        dot(out, x, y + 1, tones[1])
      }
      for (const s of [0, Math.PI]) {
        const w = d * 0.6 - t * 1.4 + s
        const off = Math.sin(w) * 3
        const paint = Math.cos(w) > 0 ? dot : back
        paint(out, x, y + off, Math.cos(w) > 0.5 ? tones[0] : tones[2])
        if (Math.cos(w) > 0) paint(out, x, y + off + 1, tones[3])
      }
    }
  }
  // Ringing bursts at the target
  for (let k = 0; k < 4; k++) {
    const age = t - (BLAST_FIRE + 2 + k * 4)
    if (age < 0 || age >= 6) continue
    ring(out, tx, ty, 2 + age * 1.8, tones[age < 2 ? 0 : age < 4 ? 1 : 2])
    if (age < 2) disc(out, tx, ty, 2 - age * 0.5, WHITE)
    if (age === 0) out.shake = [side, k % 2]
  }
  const end = t - BLAST_STOP
  if (end >= 0 && end < 6) burst(out, tx, ty, end < 2 ? 6 + end : 9 - end, end < 2 ? WHITE : tones[2])
  if (end === 0) out.shake = [side * 2, 1]
}

const CHATTER_BURSTS = [5, 12, 19]
const CHATTER_CHIRP = ['.c...c.', 'c.c.c.c', '...c...']
const CHATTER_BANG = ['w', 'w', 'w', '.', 'w']

// Chatter away with the beak snapping, spitting bursts of squiggly chirps that bounce
// to the target, until it reels with stars circling its head
function chatter(out, t, a, g, c) {
  const side = g.side
  const talking = t >= 3 && t < 28
  if (talking) {
    out.sy = t % 2 ? 1.04 : 0.96
    out.dx = (t >> 1) % 2 ? side : 0
    out.skew = lean(g, side * ((t >> 1) % 2 ? 1.5 : -0.5))
  }
  const shades = [c, mix(c, 0xffd94a, 0.6), mix(c, 0x60c0ff, 0.6)]
  const from = [g.mouth.x + side * 2, g.mouth.y]
  const to = [g.target.x, g.target.y - 2]
  for (const start of CHATTER_BURSTS) {
    emit(t, { count: 3, gap: 2, start, life: 9 }, (i, age, f) => {
      const x = lerp(from[0], to[0], f)
      const y = lerp(from[1], to[1], f) - Math.abs(Math.sin(f * Math.PI * 2 + i)) * 3 + (i - 1) * 4
      const col = shades[i]
      stamp(out, x - 3, y - 1, CHATTER_CHIRP, { c: (t + i) % 2 ? col : light(col, 0.4) }, side < 0)
      dot(out, x - side * 4, y, dark(col, 0.3))
    })
  }
  if (talking && t % 3 === 0) stamp(out, g.mouth.x + side * 2, g.mouth.y - 6, CHATTER_BANG, { w: shades[(t / 3) % 3] })

  // Dizzy stars circle over the target
  if (t >= 22 && t < a.ticks - 2) {
    const rx = 4
    const cy = Math.max(2, g.target.y - 6)
    for (let k = 0; k < 3; k++) {
      const ang = t * 0.5 + (k * TAU) / 3
      const x = g.target.x + Math.cos(ang) * rx
      const y = cy + Math.sin(ang) * 1.5
      if (Math.sin(ang) > 0) plus(out, x, y, shades[k], WHITE)
      else dot(out, x, y, dark(shades[k], 0.2))
    }
  }
}

export const FLYING = {
  airslash: { ticks: 40, color: 0xdff3ff, draw: airslash },
  mirrormove: { ticks: 42, color: 0xd8e8ff, pose: { view: 'front' }, draw: mirrormove },
  tailwind: { ticks: 44, color: 0xdff3ff, pose: { view: 'front' }, draw: tailwind },
  bounce: { ticks: 48, color: 0xdff3ff, draw: bounce },
  aerialace: { ticks: 32, color: 0xe8f4ff, draw: aerialace },
  bravebird: { ticks: 44, color: 0x8ad0ff, draw: bravebird },
  acrobatics: { ticks: 42, color: 0xdff3ff, draw: acrobatics },
  aircutter: { ticks: 36, color: 0xdff3ff, draw: aircutter },
  defog: { ticks: 44, color: 0xdff3ff, draw: defog },
  featherdance: { ticks: 50, color: 0xf2eefc, draw: featherdance },
  roost: { ticks: 46, color: 0xb8f0a0, pose: { view: 'front' }, draw: roost },
  hurricane: { ticks: 60, color: 0xc8e0f0, draw: hurricane },
  pluck: { ticks: 34, color: 0xdff3ff, draw: pluck },
  skydrop: { ticks: 54, color: 0xdff3ff, draw: skydrop },
  aeroblast: { ticks: 44, color: 0xc4ccff, draw: aeroblast },
  chatter: { ticks: 40, color: 0x7ac8f0, draw: chatter },
}
