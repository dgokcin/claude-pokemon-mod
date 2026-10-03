// Moves on the mon itself: healing, sleep, and odd tricks

import {
  WHITE, back, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, lerp, light, mix, phase, plus, puff, rnd,
  spark, sparkles, stamp, tint, tremble,
} from './draw.js'

// Overshoots a little before settling, for springy pops
const easeBack = (f) => 1 + 2.7 * (f - 1) ** 3 + 1.7 * (f - 1) ** 2

// The height of a hop f of the way through it, peaking at h pixels
const hop = (f, h) => h * 4 * f * (1 - f)

// White, a light tint, the color, and a deep edge mixed toward `deep`
const tonesOf = (c, deep) => [WHITE, light(c, 0.5), c, mix(c, deep, 0.6)]

// Lighten a color as if a light of color `glow` shone on it, keeping its own hue.
// Near black outlines catch less of the light, so the sprite stays crisp.
function screen(col, glow, f) {
  const luma = 0.3 * ((col >> 16) & 255) + 0.59 * ((col >> 8) & 255) + 0.11 * (col & 255)
  const k = f * Math.min(1, luma / 70)
  const ch = (s) => {
    const v = (col >> s) & 255
    return Math.round(v + (255 - v) * (((glow >> s) & 255) / 255) * k)
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// A one pixel outline just outside the sprite's silhouette at its base spot
function aura(out, g, c, paint = back) {
  for (let y = g.top - 1; y <= g.bottom + 1; y++) {
    for (let x = g.left - 1; x <= g.right + 1; x++) {
      if (g.solid(x, y)) continue
      if (g.solid(x - 1, y) || g.solid(x + 1, y) || g.solid(x, y - 1) || g.solid(x, y + 1)) paint(out, x, y, c)
    }
  }
}

// Motes that fly in from a ring around the body, as energy gathering
function gather(out, t, seed, g, from, life, tones, count = 8) {
  const reach = (g.right - g.left) / 2 + 6
  emit(t, { count, gap: 0.6, start: from, life }, (i, age, f) => {
    const angle = (i / count) * Math.PI * 2 + rnd(seed, i, 11)
    const r = reach * (1 - easeIn(f))
    const x = g.cx + Math.cos(angle) * r
    const y = g.cy + Math.sin(angle) * r * 0.7
    if (f < 0.6) plus(out, x, y, tones[2], WHITE)
    else dot(out, x, y, tones[1])
  })
}

const GREEN = 0x16803c
const GREEN_LIGHT = 0x7dff9a
const RECOVER_RINGS = [6, 14, 22]
const RECOVER_CLIMB = 13
const RECOVER_FLASH = 35

// A ring of light around the body. Its near half shows over the sprite and its far half
// behind it, with a glint running around, and it thins out near the top of its climb.
function halo(out, t, seed, cx, cy, rx, ry, tones, f) {
  const steps = Math.max(16, Math.ceil(rx * 8))
  for (let k = 0; k < steps; k++) {
    if (f > 0.75 && rnd(seed, k, t) < (f - 0.75) * 4) continue
    const angle = (k / steps) * Math.PI * 2
    const x = cx + rx * Math.cos(angle)
    const y = cy + ry * Math.sin(angle)
    if (Math.sin(angle) > 0) {
      dot(out, x, y, Math.cos(angle - t * 0.5) > 0.8 ? tones[0] : tones[1])
      dot(out, x, y + 1, tones[3])
    } else {
      back(out, x, y, tones[2])
    }
  }
}

// Green motes gather in, then rings of light climb the body one after another while
// plus sparkles float up and the mon glows and lifts, ending in a bright flash
function recover(out, t, a, g, c) {
  const tones = tonesOf(c, GREEN)
  const glow = phase(t, 0, 6) * (1 - phase(t, RECOVER_FLASH + 2, a.ticks - 2))
  const rx = (g.right - g.left) / 2 + 2
  const bands = []
  for (const birth of RECOVER_RINGS) {
    const f = (t - birth) / RECOVER_CLIMB
    if (f < 0 || f > 1) continue
    const y = lerp(g.bottom, g.top + 1, easeInOut(f))
    bands.push(y)
    halo(out, t, a.seed, g.cx, y, rx * (1 - 0.2 * f), clamp(rx * 0.18, 1.5, 2.5), tones, f)
  }
  const flash = t >= RECOVER_FLASH && t < RECOVER_FLASH + 2
  if (glow > 0) {
    out.shade = (x, y, col) => {
      let f = flash ? 0.65 : glow * (0.3 + 0.1 * Math.sin(t * 0.8))
      for (const by of bands) {
        const d = Math.abs(y - by)
        f = Math.max(f, d < 1.5 ? 0.75 : d < 3.5 ? 0.45 : 0)
      }
      return screen(col, GREEN_LIGHT, f)
    }
  }
  if (t >= 3 && t < RECOVER_FLASH) out.dy = -1
  if (t === RECOVER_FLASH + 1) out.sy = 0.95
  gather(out, t, a.seed, g, 0, 6, tones)
  emit(t, { count: 11, gap: 2.4, start: 6, life: 12 }, (i, age, f) => {
    const x = g.left - 1 + rnd(a.seed, i) * (g.right - g.left + 2) + Math.sin(age * 0.5 + i) * 0.8
    const y = g.bottom - 2 - rnd(a.seed, i, 1) * (g.bottom - g.top) * 0.5 - age * 0.8
    if (f < 0.55) plus(out, x, y, tones[2], WHITE)
    else dot(out, x, y, f < 0.8 ? tones[1] : tones[3])
  })
  const age = t - RECOVER_FLASH
  if (age >= 0 && age < 7) {
    const size = [1, 2, 3, 2, 2, 1, 0][age]
    spark(out, g.left - 2, g.cy, size, tones[2])
    spark(out, g.right + 2, g.cy - 2, size, tones[2])
    if (age > 0) spark(out, g.cx, g.top, size, tones[2])
  }
}

// An egg: o rim, w shell, s shadow, h shine. The crack zigzags through rows 3 and 4.
const EGG = ['..oo..', '.ohwo.', 'ohwwwo', 'owwwwo', 'owwwso', 'owwsso', '.oooo.']
const EGG_SPLIT = 4
const EGG_CRACK = [[0, 3], [1, 4], [2, 3], [3, 4], [4, 3], [5, 4]]
const EGG_COLORS = { o: 0xa0804c, w: 0xfffaf0, s: 0xead6a6, h: WHITE }
const HEARTS = [['pp.pp', 'phppp', '.ppp.', '..p..'], ['p.p', 'php', '.p.']]
const HEART_COLORS = { p: 0xf0306a, h: 0xffc8dc }
const WARM = 0xffd76a
const WARM_LIGHT = 0xfff2d6
const BOIL_POP = 2
const BOIL_CRACK = 9
const BOIL_OPEN = 17
const BOIL_HOP = [38, 45]

// Some rows of the egg art, each row shifted by dx(row), or flipped upside down
function eggRows(out, x, y, from, to, dx = () => 0, flip = false) {
  for (let r = from; r < to; r++) {
    const row = flip ? from + to - 1 - r : r
    stamp(out, x + dx(r), y + r - from, [EGG[row]], EGG_COLORS)
  }
}

// Pull an egg out of the pouch. It wobbles and cracks with light leaking out, then
// bursts in a flash that washes warm light over the mon while hearts float up.
function softboiled(out, t, a, g, c) {
  const ex = g.cx - 3
  const ey = Math.round(g.top + (g.bottom - g.top) * 0.55) - 3
  const ecx = ex + 3
  const ecy = ey + 3
  const age = t - BOIL_OPEN
  if (t < BOIL_POP + 2) out.sy = 0.96
  else if (age >= 0 && age < 4) out.sy = 1.05
  if (t >= BOIL_HOP[0] && t < BOIL_HOP[1]) out.dy = -Math.round(hop(phase(t, ...BOIL_HOP), 3))
  if (t === BOIL_HOP[1]) out.sy = 0.94

  if (t >= BOIL_POP && age < 0) {
    const rise = Math.round(3 * (1 - easeBack(phase(t, BOIL_POP, BOIL_POP + 4))))
    const shaky = t >= 13 ? 1 : 2
    const tilt = t >= 7 ? (Math.floor(t / shaky) % 2 ? 1 : -1) : 0
    eggRows(out, ex, ey + rise, 0, EGG.length, (r) => (r < 3 ? tilt : 0))
    if (t >= BOIL_CRACK) {
      const shown = Math.min(EGG_CRACK.length, 2 + t - BOIL_CRACK)
      for (let k = 0; k < shown; k++) {
        const [cx, cy] = EGG_CRACK[k]
        const leak = t >= 13 ? ((t + k) % 2 ? WARM : WHITE) : 0x6a4a2a
        dot(out, ex + cx + (cy < 3 ? tilt : 0), ey + rise + cy, leak)
      }
      if (t >= 14) sparkles(out, t, a.seed, ecx, ecy - 2, 10, 6, WARM, 3)
    }
    return
  }
  if (age < 0) return

  // The lid tumbles up and away while the bottom half rests, then both blink out
  if (age < 9 && (age < 6 || age % 2 === 0)) {
    const lx = ex + Math.round(age * 0.7)
    const ly = ey - Math.round(age * 1.8 - age * age * 0.12)
    eggRows(out, lx, ly, 0, EGG_SPLIT, () => 0, Math.floor(age / 2) % 2 === 1)
    eggRows(out, ex, ey + EGG_SPLIT, EGG_SPLIT, EGG.length)
  }
  if (age === 0) disc(out, ecx, ecy, 3, WHITE)
  if (age < 7) {
    const len = age < 4 ? 3 + age * 2 : 9 - (age - 4) * 2
    for (let k = -2; k <= 2; k++) {
      const angle = -Math.PI / 2 + k * 0.42
      for (let d = 1; d <= len; d++) {
        dot(out, ecx + Math.cos(angle) * d, ecy + 1 + Math.sin(angle) * d, d < 3 ? WHITE : d < 6 ? c : WARM)
      }
    }
  }

  const wave = age * 2
  const warmth = 0.5 * (1 - phase(t, BOIL_OPEN + 8, BOIL_OPEN + 20))
  if (warmth > 0) {
    out.shade = (x, y, col) => {
      const d = Math.hypot(x - ecx, y - ecy)
      if (Math.abs(d - wave) < 1.5) return screen(col, WHITE, 0.75)
      return d < wave ? screen(col, WARM_LIGHT, warmth) : col
    }
  }
  if (age < 16) sparkles(out, t, a.seed, g.cx, g.cy, g.right - g.left + 8, g.bottom - g.top + 2, WARM, 4)

  // Hearts drift up beside the body, left and right in turn
  emit(t, { count: 6, gap: 2.6, start: BOIL_OPEN + 1, life: 15 }, (i, life, f) => {
    if (f > 0.75 && life % 2) return
    const side = i % 2 ? 1 : -1
    const beside = (side > 0 ? g.right - 1 : g.left - 4) + side * rnd(a.seed, i, 3) * 3
    const x = clamp(beside, 0, g.columns - 5) + (Math.floor(life / 4) % 2)
    const y = ecy + 2 - life * 0.9
    const colors = f > 0.6 ? { p: light(HEART_COLORS.p, 0.3), h: WHITE } : HEART_COLORS
    stamp(out, x, y, HEARTS[Math.floor(i / 2) % 2], colors)
  })
}

const NIGHT = 0x4a5ac8
const REST_DOZE = 12
const REST_WAKE = 66
const REST_BREATH = 18
const REST_JUMP = [69, 76]
// A pixel exclamation mark: w white, k dark edge
const SURPRISE = ['kwk', 'kwk', 'kwk', '.k.', 'kwk']

// Yawn and droop, then sleep with slow breaths, each drawing a soft healing glow
// around the body, then wake with a start and a little jump
function rest(out, t, a, g, c) {
  const tones = tonesOf(c, GREEN)
  if (t < REST_DOZE) {
    const yawn = Math.sin(phase(t, 0, 6) * Math.PI)
    const droop = easeInOut(phase(t, 6, REST_DOZE))
    out.sy = 1 + 0.07 * yawn - 0.06 * droop
    out.sx = 1 - 0.03 * yawn + 0.03 * droop
    if (droop > 0) out.shade = tint(NIGHT, 0.12 * droop)
    return
  }
  if (t < REST_WAKE) {
    // A full breath fills the body back to its own size, so the glow outline fits it
    const breath = (1 - Math.cos(((t - REST_DOZE) / REST_BREATH) * Math.PI * 2)) / 2
    out.sy = 1 - 0.06 * (1 - breath)
    out.sx = 1 + 0.03 * (1 - breath)
    out.shade = (x, y, col) => screen(mix(col, NIGHT, 0.12), GREEN_LIGHT, 0.4 * breath * breath)
    if (breath > 0.6) aura(out, g, breath > 0.85 ? tones[1] : tones[3])
    emit(t, { count: 9, gap: 5, start: REST_DOZE + 2, life: 16 }, (i, age, f) => {
      const x = g.left + 1 + rnd(a.seed, i) * (g.right - g.left - 2) + Math.sin(age * 0.4 + i)
      const y = g.cy + 2 - age * 0.45
      if (f < 0.5) plus(out, x, y, tones[2], WHITE)
      else if (age % 2 === 0 || f < 0.8) dot(out, x, y, f < 0.8 ? tones[1] : tones[3])
    })
    return
  }
  if (t < REST_WAKE + 3) out.shade = tint(NIGHT, 0.12 * (1 - phase(t, REST_WAKE, REST_WAKE + 3)))
  if (t < REST_JUMP[0]) {
    out.sy = 0.9
    out.sx = 1.06
  } else if (t < REST_JUMP[1]) {
    const f = phase(t, ...REST_JUMP)
    out.dy = -Math.round(hop(f, 4))
    out.sy = f < 0.3 ? 1.08 : 1
    out.sx = f < 0.3 ? 0.95 : 1
  } else if (t < REST_JUMP[1] + 2) {
    out.sy = 0.92
    out.sx = 1.05
  }
  if (t < REST_JUMP[1]) {
    const sx = g.side < 0 ? g.left - 5 : g.right + 3
    stamp(out, sx, g.top + 1 + out.dy, SURPRISE, { w: WHITE, k: 0x303048 })
  }
  const age = t - REST_JUMP[0]
  if (age >= 0 && age < 8) {
    const size = [1, 2, 2, 1, 1, 0, 0, 0][age]
    spark(out, g.left - 1, g.top + 4, size, tones[2])
    spark(out, g.right + 1, g.top + 3, size, tones[2])
  }
}

const SPLASH_HOPS = [[3, 13, 4], [15, 25, 5], [27, 37, 4]]
const SPLASH_DRIFT = [0, 3, -2, 0]

// The hop under way at t as [index, f], or the last one finished as [index, 1]
function splashHop(t) {
  let last = [-1, 1]
  SPLASH_HOPS.forEach(([from, to], k) => {
    if (t >= from) last = [k, phase(t, from, to)]
  })
  return last
}

// Water thrown up where the fish lands. A spout at each side shoots up and falls
// back, and droplets fly out in arcs.
function splashWater(out, age, seed, n, left, right, ground, tones) {
  if (age < 0 || age >= 12) return
  const spout = age < 2 ? 3 + age * 2 : Math.max(0, 7 - age)
  for (const [x, dir] of [[left - 1, -1], [right + 1, 1]]) {
    for (let k = 0; k < spout; k++) {
      const top = k === spout - 1
      dot(out, x, ground - k, top ? WHITE : tones[2])
      dot(out, x + dir, ground - k, top ? tones[1] : tones[3])
    }
  }
  emit(age, { count: 14, gap: 0, life: 12 }, (i, life) => {
    const dir = i % 2 ? 1 : -1
    const x0 = dir > 0 ? right + 1 : left - 1
    const vx = dir * (0.3 + rnd(seed, i + n * 20) * 1.1)
    const vy = -(1.2 + rnd(seed, i + n * 20, 1) * 1.6)
    const x = x0 + vx * life
    const y = ground - 2 + vy * life + 0.22 * life * life
    if (y > ground) return
    const big = i % 3 !== 2
    dot(out, x, y, life < 3 ? WHITE : tones[2])
    dot(out, x, y - 1, tones[1])
    if (big) {
      dot(out, x + 1, y, tones[3])
      dot(out, x + 1, y - 1, tones[2])
    }
  })
}

// A shallow puddle under the fish, glinting, its rim darker
function puddle(out, t, cx, half, ground, tones) {
  for (let x = -half; x <= half; x++) {
    const rim = Math.abs(x) >= half - 1
    back(out, cx + x, ground, rim ? tones[3] : tones[2])
    if (!rim) back(out, cx + x, ground - 1, (x + t) % 6 === 0 ? WHITE : tones[1])
  }
}

// How the fish's body moves at t: its offset, squash, facing, and whether it's airborne
function flop(t, g, ticks) {
  const [k, f] = splashHop(t)
  const drift = (n) => g.side * SPLASH_DRIFT[n]
  const still = { dx: 0, dy: 0, sx: 1, sy: 1, flipX: false, flipY: false, air: false }
  if (k < 0) return { ...still, sx: 1.08, sy: 0.86 }
  if (f < 1) {
    const stretch = f < 0.25 || f > 0.75
    return {
      dx: Math.round(lerp(drift(k), drift(k + 1), f)),
      dy: -Math.round(hop(f, SPLASH_HOPS[k][2])),
      sx: stretch ? 0.95 : 1,
      sy: stretch ? 1.07 : 1,
      flipX: k === 0 ? f >= 0.5 : k === 1 && f < 0.5,
      flipY: k === 2 && f >= 0.3 && f < 0.7,
      air: true,
    }
  }
  const since = t - SPLASH_HOPS[k][1]
  const pose = { ...still, dx: drift(k + 1), flipX: k === 0 }
  if (since < 2) return { ...pose, sx: 1.12, sy: 0.8 }
  if (k === SPLASH_HOPS.length - 1 && t < ticks - 1 && since % 4 < 2) return { ...pose, sx: 1.04 }
  return pose
}

// Flop about in three big useless hops, turning around in the air and somersaulting
// on the last, with water splashing up at every landing
function splash(out, t, a, g, c) {
  const tones = tonesOf(c, 0x1f4fa0)
  const { air, ...pose } = flop(t, g, a.ticks)
  Object.assign(out, pose)
  if (air) {
    // A dithered, watery trail of where it just was, while it moves fast
    const trail = [1, 2].map((k) => flop(t - k, g, a.ticks))
    out.ghosts = trail
      .filter((p) => p.air && !p.flipY && !pose.flipY && Math.abs(p.dy - pose.dy) >= 1)
      .map((p, n) => {
        const gap = n ? (x, y) => x % 2 || y % 2 : (x, y) => (x + y) % 2
        return { dx: p.dx, dy: p.dy, flip: p.flipX, shade: (col, x, y) => (gap(x, y) ? null : mix(col, tones[2], 0.6)) }
      })
    if (t % 4 < 2) dot(out, g.cx + pose.dx + (t % 3) - 1, g.bottom + pose.dy + 2, tones[1])
  }
  if (t >= SPLASH_HOPS[0][1] && t < a.ticks - 3) {
    const half = Math.round((g.right - g.left) / 2) + 3 - (t >= a.ticks - 6 ? 3 : 0)
    puddle(out, t, g.cx, half, g.ground, tones)
  }
  SPLASH_HOPS.forEach(([, to], n) => {
    const shift = g.side * SPLASH_DRIFT[n + 1]
    splashWater(out, t - to, a.seed, n, g.left + shift, g.right + shift, g.ground, tones)
  })
}

const TP_NARROW = [6, 13]
const TP_SHOOT = [13, 17]
const TP_BEAM = [20, 24]
const TP_GROW = [24, 31]

// Glow and gather psychic light, narrow into a line of light that shoots up and away,
// then a beam strikes down at the new spot and the mon grows back out of it
function teleport(out, t, a, g, c) {
  const shift = a.toX - g.x
  const tones = tonesOf(c, 0x9a2a90)
  const h = g.bottom - g.top + 1
  const there = t >= TP_BEAM[0]
  const cx = g.cx + (there ? shift : 0)
  if (there) out.dx = shift

  // The body ripples like a heat haze while it gathers power, and as it reforms
  const ripple = t < TP_SHOOT[0] ? 1.2 * phase(t, 1, TP_NARROW[0]) : t >= TP_GROW[0] ? 1.2 * (1 - phase(t, ...TP_GROW)) : 0
  if (ripple > 0) out.skew = (y) => ripple * Math.sin(y * 0.9 + t * 1.5)

  if (t < TP_NARROW[0]) {
    const f = phase(t, 0, TP_NARROW[0])
    out.shade = (x, y, col) => screen(col, t % 2 ? c : WHITE, 0.3 + 0.4 * f)
    aura(out, g, t % 2 ? tones[2] : tones[1])
    gather(out, t, a.seed, g, 0, 6, tones)
  } else if (t < TP_SHOOT[0]) {
    const f = easeIn(phase(t, ...TP_NARROW))
    out.sx = lerp(1, 0.08, f)
    out.sy = lerp(1, 1.3, f)
    out.shade = (x, y, col) => mix(screen(col, WHITE, 0.6), WHITE, 0.3 + 0.7 * f)
  } else if (t < TP_GROW[0]) {
    out.hidden = true
  } else if (t < TP_GROW[1]) {
    const f = phase(t, ...TP_GROW)
    out.sx = lerp(0.08, 1, easeBack(f))
    out.sy = lerp(1.3, 1, easeBack(f))
    out.shade = (x, y, col) => mix(col, WHITE, 0.9 * (1 - easeOut(f)))
  } else if (t < TP_GROW[1] + 2) {
    out.sy = 0.95
    out.sx = 1.04
  }

  // The line of light streaks up off the strip, leaving a ring on the ground
  if (t >= TP_SHOOT[0] && t < TP_SHOOT[1]) {
    const f = easeIn(phase(t, TP_SHOOT[0], TP_SHOOT[1] - 1))
    const foot = lerp(g.bottom, -4, f)
    const head = foot - h * 1.3
    for (let y = Math.max(0, Math.floor(head)); y <= foot; y++) {
      dot(out, g.cx, y, WHITE)
      dot(out, g.cx + 1, y, y > foot - 3 ? tones[1] : WHITE)
      dot(out, g.cx - 1, y, tones[2])
      dot(out, g.cx + 2, y, tones[3])
    }
  }
  const left = t - TP_SHOOT[0]
  if (left >= 0 && left < 6) flatRing(out, g.cx, g.bottom, 2 + left * 1.5, left < 3 ? tones[1] : tones[3])
  if (t >= TP_SHOOT[0] && t < TP_BEAM[0]) sparkles(out, t, a.seed, g.cx, g.cy, 8, h, c, 4)

  // A beam comes down at the new spot, then thins out behind the mon
  if (t >= TP_BEAM[0] - 2 && t < TP_BEAM[0]) sparkles(out, t, a.seed, cx, g.bottom - 1, 6, 2, c, 3)
  if (t >= TP_BEAM[0] && t < TP_GROW[0] + 4) {
    const f = easeIn(phase(t, TP_BEAM[0], TP_BEAM[1]))
    const foot = lerp(0, g.bottom, f)
    const thin = t >= TP_GROW[0] ? t - TP_GROW[0] : 0
    const paint = t >= TP_GROW[0] ? back : dot
    for (let y = 0; y <= foot; y++) {
      paint(out, cx, y, WHITE)
      if (thin < 3) paint(out, cx + 1, y, thin < 2 ? WHITE : tones[1])
      if (thin < 2) paint(out, cx - 1, y, tones[1])
      if (thin < 1) paint(out, cx + 2, y, tones[2])
    }
  }
  const landed = t - TP_BEAM[1]
  if (landed >= 0 && landed < 6) flatRing(out, cx, g.bottom, 6 - landed, landed < 3 ? WHITE : tones[1])
  if (t >= TP_GROW[0] && t < TP_GROW[1] + 2) sparkles(out, t, a.seed + 1, cx, g.cy, g.right - g.left, h, c, 5)
}

// A flat ellipse lying on the ground, for rings around the feet
function flatRing(out, cx, y, r, c, paint = dot) {
  const steps = Math.max(12, Math.ceil(r * 7))
  for (let k = 0; k < steps; k++) {
    const angle = (k / steps) * Math.PI * 2
    paint(out, cx + r * Math.cos(angle), y + r * 0.22 * Math.sin(angle), c)
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16

const TF_MELT = [8, 16]
const TF_FLICKER = [16, 20]
const TF_RISE = [20, 28]
const TF_FILL = [26, 34]
const TF_SHIMMERS = [40, 50]
const TF_DRAIN = [56, 62]
const TF_SINK = [62, 68]
const TF_FLICKER_BACK = [68, 72]
const TF_RETURN = [72, 78]
const BLOB = [1.3, 0.45]

// Whether the other mon shows at t. At each swap the two blobs flicker, taking turns.
function swapped(t) {
  if (t < TF_FLICKER[0] || t >= TF_FLICKER_BACK[1]) return false
  if (t < TF_FLICKER[1] || t >= TF_FLICKER_BACK[0]) return t % 2 === 1
  return true
}

// The shown sprite's shape at t: its scale, how much of it is solid (the rest dithers
// away), and how much shows its own colors rather than goo
function morphAt(t) {
  const [wide, low] = BLOB
  const rising = (f) => ({ sx: lerp(wide, 1, easeBack(f)), sy: lerp(low, 1, easeBack(f)) })
  const sinking = (f) => ({ sx: lerp(1, wide, easeIn(f)), sy: lerp(1, low, easeIn(f)) })
  if (t < TF_MELT[0]) {
    const wob = phase(t, 0, TF_MELT[0]) * 0.12 * Math.sin(t * 1.4)
    return { sx: 1 + wob, sy: 1 - wob, solid: 1, fill: 1 }
  }
  if (t < TF_FLICKER[0]) return { ...sinking(phase(t, ...TF_MELT)), solid: 1, fill: 1 - phase(t, TF_MELT[0], TF_MELT[0] + 6) }
  if (t < TF_RISE[0]) return { sx: wide, sy: low, solid: 0.6, fill: 0 }
  if (t < TF_SINK[0]) {
    const fill = t < TF_DRAIN[0] ? phase(t, ...TF_FILL) : 1 - phase(t, ...TF_DRAIN)
    return { ...rising(phase(t, ...TF_RISE)), solid: 1, fill }
  }
  if (t < TF_FLICKER_BACK[0]) return { ...sinking(phase(t, ...TF_SINK)), solid: 1, fill: 0 }
  if (t < TF_RETURN[0]) return { sx: wide, sy: low, solid: 0.6, fill: 0 }
  return { ...rising(phase(t, ...TF_RETURN)), solid: 1, fill: phase(t, TF_RETURN[0] + 1, TF_RETURN[1]) }
}

// How far the goo sways at t, in pixels at the top of the body
function swayAt(t) {
  if (t < TF_MELT[0]) return 1.5 * phase(t, 0, TF_MELT[0])
  if (t < TF_FLICKER[0]) return 2
  if (t < TF_RISE[0]) return 1
  if (t < TF_RISE[1] + 2) return 2.5 * (1 - phase(t, TF_RISE[0], TF_RISE[1] + 2))
  if (t < TF_SINK[0]) return 0
  if (t < TF_FLICKER_BACK[0]) return 2 * phase(t, ...TF_SINK)
  if (t < TF_RETURN[0]) return 1
  return 2 * (1 - phase(t, ...TF_RETURN))
}

// Wobble and melt into a blob of goo that flickers into the other mon, rise up as it
// while its colors seep in, hold with a shimmer now and then, then melt back and reform
function transform(out, t, a, g, c) {
  const { sx, sy, solid, fill } = morphAt(t)
  out.sx = sx
  out.sy = sy
  const sway = swayAt(t)
  if (sway > 0) {
    // A wave runs up the body, the feet held still and the top swinging most
    const tall = (g.bottom - g.top + 1) * sy
    out.skew = (y) => {
      const up = clamp((g.bottom + 1 - y) / tall, 0, 1)
      return sway * up * Math.sin(t * 1.2 + up * 3)
    }
  }
  const goo = (col) => mix(col, c, 0.78)
  const flash = t === TF_FLICKER[0] || t === TF_FLICKER_BACK[0]
  const sweep = TF_SHIMMERS.filter((s) => t >= s && t < s + 5).map((s) => lerp(g.left - 6, g.right + 6, phase(t, s, s + 4)))[0]
  const edge = (v, b) => v > 0 && v < 1 && Math.abs(b - v) < 0.05
  if (solid === 1 && fill === 1 && sweep === undefined) return
  out.shade = (x, y, col) => {
    const b = bayer(x, y)
    if (b > solid) return null
    if (flash || edge(solid, b) || edge(fill, b)) return WHITE
    if (sweep !== undefined) {
      const d = Math.abs(x - sweep + (y - g.top) * 0.5)
      if (d < 1) return WHITE
      if (d < 2.5) return goo(col)
    }
    return b < fill ? col : goo(col)
  }
  const busy = (t >= TF_MELT[0] && t < TF_FILL[1]) || (t >= TF_DRAIN[0] && t < TF_RETURN[1])
  if (busy) sparkles(out, t, a.seed, g.cx, g.bottom - 4, g.right - g.left + 8, 8, c, 5)
}

const SOOT = 0x3a3030
const BOOM_FUSE = 17
const BOOM_FIRE = 18
const BOOM_BACK = 46

// Fire from white hot to smoke, made from the blast color
const blaze = (c) => [WHITE, 0xfff4b0, 0xffd040, c, mix(c, 0xc02010, 0.6), 0x6a2418]

// A ragged ball of fire that cools from its white core outward and breaks up as it does.
// The noise is in 2x2 blocks, so it reads as billows rather than static.
function fireball(out, t, seed, cx, cy, r, cool, fire) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const n = rnd(seed, (x >> 1) * 97 + (y >> 1), t >> 1)
      const d = Math.hypot(x - cx, y - cy) / r + (n - 0.5) * 0.35
      if (d > 1) continue
      const heat = d * (1 - cool * 0.4) + cool * 0.85
      if (heat >= 1.15 || (cool > 0.4 && n < (cool - 0.4) * 1.1)) continue
      dot(out, x, y, fire[clamp(Math.floor(heat * fire.length), 0, fire.length - 1)])
    }
  }
}

// Flash faster and faster while swelling, then a blinding flash, a shock ring and a
// fireball with debris flying and smoke rolling up, before the mon blinks back
function explosion(out, t, a, g, c) {
  const big = a.power >= 2
  const fire = blaze(c)
  const reach = big ? 14 : 9
  const cx = g.cx
  const cy = g.cy
  if (t < BOOM_FUSE) {
    const f = phase(t, 0, BOOM_FUSE)
    const flash = Math.floor((t * t) / 18) % 2 === 1
    out.sx = 1 + (big ? 0.14 : 0.1) * easeIn(f)
    out.sy = out.sx
    if (t > 8) out.dx = tremble(t)
    // Near the end the rows start to jitter as the energy tears at the body
    const strain = 0.3 * phase(t, 10, BOOM_FUSE)
    if (strain > 0) {
      out.skew = (y) => {
        const n = rnd(a.seed, y, t)
        return n < strain ? -1 : n > 1 - strain ? 1 : 0
      }
    }
    out.shade = (x, y, col) => (flash ? screen(col, WHITE, 0.8) : mix(col, 0xff3020, 0.3 * f))
    if (t > 10) sparkles(out, t, a.seed, cx, cy, g.right - g.left + 6, g.bottom - g.top + 4, fire[1], 4)
    return
  }
  out.hidden = t < BOOM_BACK || (t < BOOM_BACK + 6 && t % 2 === 1)
  if (t >= BOOM_BACK) {
    const soot = 0.55 * (1 - phase(t, BOOM_BACK, a.ticks - 2))
    if (soot > 0) out.shade = tint(SOOT, soot)
    if (t < BOOM_BACK + 8) puff(out, cx + 2, g.top - 1 - (t - BOOM_BACK) * 0.5, 1.5, 0x8a8282, a.seed + t)
    return
  }
  const age = t - BOOM_FIRE
  const shake = Math.round((big ? 2 : 1) * (1 - phase(t, BOOM_FIRE, BOOM_FIRE + 14)))
  if (shake > 0) out.shake = [t % 2 ? shake : -shake, big && t % 3 === 0 ? 1 : 0]
  if (t === BOOM_FUSE) {
    disc(out, cx, cy, reach + 6, WHITE)
    return
  }

  const cool = phase(t, BOOM_FIRE + 4, BOOM_BACK - 4)
  const r = reach * (0.35 + 0.65 * easeOut(phase(t, BOOM_FIRE, BOOM_FIRE + 7)))
  if (cool < 1) fireball(out, t, a.seed, cx, cy - cool * 4, r * (1 - cool * 0.3), cool, fire)
  if (age < 2) disc(out, cx, cy, 2 + age * 2, WHITE)
  if (age < 6) {
    const ring = reach * 0.6 + age * (big ? 3 : 2)
    const col = age < 2 ? WHITE : age < 4 ? fire[1] : fire[3]
    const steps = Math.ceil(ring * 8)
    for (let k = 0; k < steps; k++) {
      if (age >= 4 && k % 3 === 0) continue
      const angle = (k / steps) * Math.PI * 2
      const x = cx + Math.cos(angle) * ring
      const y = cy + Math.sin(angle) * ring * 0.8
      dot(out, x, y, col)
      if (age < 4) dot(out, x - Math.cos(angle), y - Math.sin(angle) * 0.8, fire[2])
    }
  }

  // Smoke billows up from the cooling fireball and drifts apart
  emit(t, { count: big ? 9 : 6, gap: 1.6, start: BOOM_FIRE + 7, life: 18 }, (i, life, f) => {
    const x = cx + (rnd(a.seed, i, 4) - 0.5) * reach * 1.1 + Math.sin(life * 0.3 + i) * 1.5
    const y = cy - reach * 0.1 - life * 0.4 - rnd(a.seed, i, 5) * 3
    const size = (big ? 2.8 : 2) + life * 0.13
    puff(out, x, y, f > 0.8 ? size * 0.7 : size, mix(0x5a5252, 0x9a9292, f), a.seed + i)
  })

  // Debris flies out in chunks and rolls to a stop on the ground
  emit(t, { count: big ? 14 : 8, gap: 0, start: BOOM_FIRE, life: BOOM_BACK - BOOM_FIRE }, (i, life) => {
    const angle = -Math.PI / 2 + (rnd(a.seed, i, 6) - 0.5) * 3
    const speed = (big ? 1.3 : 0.9) + rnd(a.seed, i, 7) * (big ? 1.3 : 0.8)
    let x = cx
    let y = cy
    let vx = Math.cos(angle) * speed
    let vy = Math.sin(angle) * speed
    for (let k = 0; k < life; k++) {
      x += vx
      vy += 0.14
      y += vy
      if (y >= g.ground) {
        y = g.ground
        vy = -vy * 0.3
        vx *= 0.5
      }
    }
    const ember = i % 3 === 0
    const col = ember ? (life < 10 ? fire[2] : life < 18 ? fire[4] : SOOT) : i % 2 ? 0x6a5a50 : 0x8a7a6a
    dot(out, x, y, col)
    dot(out, x + 1, y, ember ? col : dark(col, 0.3))
    if (y < g.ground) dot(out, x, y - 1, ember ? fire[1] : light(col, 0.25))
  })
}

export const SELF = {
  recover: { ticks: 44, color: 0x9cffb0, pose: { view: 'front' }, draw: recover },
  softboiled: { ticks: 48, color: 0xfff2c8, pose: { view: 'front' }, draw: softboiled },
  rest: {
    ticks: 80,
    color: 0x9cffb0,
    pose: (t) => ({ view: 'front', asleep: t >= REST_DOZE && t < REST_WAKE }),
    draw: rest,
  },
  splash: { ticks: 46, color: 0x6fb8ff, draw: splash },
  teleport: {
    ticks: 40,
    color: 0xff9cf0,
    pose: { view: 'front' },
    lands: (a, x, home) => (x + 1 + Math.floor(rnd(a.seed, 99) * home)) % (home + 1),
    draw: teleport,
  },
  transform: { ticks: 80, color: 0xd8b8ff, pose: (t) => ({ view: 'front', swap: swapped(t) }), draw: transform },
  explosion: { ticks: 56, color: 0xff8a2a, draw: explosion },
}
