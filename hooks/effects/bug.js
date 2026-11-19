// Bug moves

import {
  WHITE, back, burst, clamp, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, glow, keys, lean, lerp, light, line, mix,
  phase, plus, ramp, ring, rnd, spark, sparkles, tint, tremble,
} from './draw.js'

const TAU = Math.PI * 2
const STRIPE = 0x2a2010
const WING = 0xc8dcec

// How far a dash can go toward the target, stopping `margin` pixels short of it
const travel = (g, most, margin = 3) => clamp(Math.abs(g.target.x - g.mouth.x) - margin, 2, most)

// Keeps a shape reaching `half` pixels either side of x inside the strip
const fit = (g, x, half) => clamp(x, half, g.columns - 1 - half)

// Half the height an effect at the target can take without leaving the strip
const halfSpan = (g) => clamp(Math.round((g.ground - 3) * 0.4), 4, 7)

// Leans the sprite px pixels toward the target at its top while its feet stay put
function leanAhead(g, px) {
  if (Math.abs(px) < 0.5) return null
  const span = Math.max(1, g.bottom - g.top)
  return (y) => g.side * px * clamp((g.bottom - y) / span, 0, 1)
}

// Every other pixel, for things breaking up as they fade
const dotted = (out, x, y, c) => (Math.round(x) + Math.round(y)) % 2 && dot(out, x, y, c)

// A crescent swept along a circle around cx, cy from angle a0 to a1, drawn facing
// right and mirrored by side, thickest in its middle. Only the first `upto` shows.
function crescent(out, g, cx, cy, r, a0, a1, width, tones, upto = 1, paint = dot) {
  const steps = Math.max(6, Math.ceil(Math.abs(a1 - a0) * r * 1.6))
  const n = Math.round(steps * upto)
  for (let k = 0; k <= n; k++) {
    const s = k / steps
    const ang = lerp(a0, a1, s)
    const thick = Math.max(0.6, width * Math.sin(Math.PI * s))
    for (let d = 0; d <= thick; d += 0.7) {
      const tone = tones[Math.min(tones.length - 1, Math.floor((d / (thick + 0.01)) * tones.length))]
      paint(out, cx + g.side * Math.cos(ang) * (r - d), cy + Math.sin(ang) * (r - d), tone)
    }
  }
}

// A straight blade from x0, y0 to x1, y1 that swells to `width` in the middle, its
// lit edge in the first tones. Only the first `upto` of its length shows.
function blade(out, x0, y0, x1, y1, width, tones, upto = 1) {
  const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0))
  const ux = (x1 - x0) / len
  const uy = (y1 - y0) / len
  const steps = Math.ceil(len * 1.5)
  for (let k = 0; k <= Math.round(steps * upto); k++) {
    const s = k / steps
    const w = Math.max(0.4, width * Math.sin(Math.PI * s))
    for (let d = -w; d <= w; d += 0.6) {
      const tone = tones[Math.min(tones.length - 1, Math.floor(((d + w) / (2 * w + 0.01)) * tones.length))]
      dot(out, x0 + ux * len * s - uy * d, y0 + uy * len * s + ux * d, tone)
    }
  }
}

// A bee two pixels long, its wing flickering above it
function bee(out, x, y, t, i, c, way = 1, paint = dot) {
  paint(out, x, y, c)
  paint(out, x - way, y, STRIPE)
  paint(out, x + ((t + i) % 2 ? 0 : -way), y - 1, (t + i) % 2 ? WHITE : WING)
}

// A tiny mark that tells a stat went up: a chevron with a dark rim
function chevron(out, x, y, c) {
  for (const [dx, dy] of [[-2, 1], [-1, 0], [0, -1], [1, 0], [2, 1]]) {
    dot(out, x + dx, y + dy + 1, dark(c, 0.5))
    dot(out, x + dx, y + dy, dy < 0 ? WHITE : c)
  }
}

const CUTS = [7, 15, 23]

// Three quick scythe cuts that grow each time: a small sweep down, a bigger one up,
// then a huge glowing crescent that bursts into green sparks
function furycutter(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const span = halfSpan(g)
  const tx = fit(g, g.target.x, span + 2)
  const ty = g.target.y
  out.dx = Math.round(g.side * keys(t, [[0, 0], [4, -1], [7, 1, easeIn], [10, 0], [12, -1], [15, 2, easeIn], [18, 0], [20, -1], [23, 3, easeIn], [27, 3], [32, 0]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [4, -1], [7, 2, easeIn], [10, 0], [12, -1], [15, 2, easeIn], [18, 0], [20, -2], [23, 3, easeIn], [27, 2], [32, 0]]))

  CUTS.forEach((at, k) => {
    const u = t - at
    // The sickle glints on the mon's front just before each cut
    if (u >= -3 && u < 0) spark(out, g.mouth.x + out.dx, g.mouth.y + 1, u === -2 ? 2 : 1, k === 2 ? hi : c)
    if (u < 0 || u > 9) return
    const r = span * [0.8, 1.1, 1.45][k] + 1.5
    const way = k === 1 ? -1 : 1
    const sweep = k === 2 ? 1.5 : 1.25
    const tones = u < 2 ? [WHITE, hi, c] : u < 5 ? [hi, c, deep] : [c, deep]
    crescent(out, g, tx - g.side * r * 0.45, ty, r, -way * sweep, way * sweep, 1.8 + k * 0.9, tones, phase(u, 0, 2), u < 7 ? dot : dotted)
    if (u === 0) out.shake = [g.side * (k === 2 ? 2 : 1), k === 2 ? 1 : 0]
    if (u < 3) burst(out, tx, ty, [2, 3, 2][u] + k, u === 0 ? WHITE : lit)
  })

  // The last cut sheds sparks
  emit(t, { count: 10, gap: 0, start: CUTS[2] + 1, life: 9 }, (i, age, f) => {
    const ang = (i / 10) * TAU + rnd(a.seed, i) * 0.5
    const v = 0.9 + rnd(a.seed, i, 1) * 0.8
    const x = tx + Math.cos(ang) * v * age
    const y = ty + Math.sin(ang) * v * age * 0.8 + age * age * 0.04
    if (f < 0.4) plus(out, x, y, c, WHITE)
    else dot(out, x, y, f < 0.7 ? lit : deep)
  })
}

const BITE_LUNGE = 5
const BITE_SNAPS = [9, 13, 17]
const BITE_BACK = 21
const BITE_CHEW = 25

// How wide the mandibles gape at tick t: opening as they arrive, shut on each snap
function gape(t) {
  let open = phase(t, BITE_LUNGE + 1, BITE_SNAPS[0] - 1)
  for (const s of BITE_SNAPS) {
    const u = t - s
    if (u >= 0 && u < 1) open = 0
    else if (u >= 1) open = Math.min(1, (u - 1) / 2.5)
  }
  return open
}

// Lunge in and chomp three times with hooked mandibles, crumbs flying, then hop back
// and chew the morsel down
function bugbite(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const edge = dark(c, 0.6)
  const far = travel(g, 12, 4)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [BITE_LUNGE - 1, -1], [BITE_LUNGE + 3, far, easeIn], [BITE_BACK, far], [BITE_BACK + 4, 0, easeOut]]))
  for (const s of BITE_SNAPS) {
    if (t === s) out.shake = [g.side, 1]
    if (t === s || t === s + 1) out.dx += g.side
  }
  if (t >= BITE_CHEW && t < BITE_CHEW + 6) {
    out.sy = t % 2 ? 0.93 : 1
    out.sx = t % 2 ? 1.05 : 1
  }

  const tx = g.target.x
  const bx = g.mouth.x + out.dx
  const by = g.mouth.y + 1
  if (t > BITE_LUNGE && t < BITE_BACK + 2) {
    const open = gape(t)
    const len = clamp(Math.abs(tx - bx) + 2, 4, 9)
    for (const sgn of [-1, 1]) {
      const steps = len * 2
      for (let k = 0; k <= steps; k++) {
        const s = k / steps
        const x = bx + g.side * len * s
        const y = by + sgn * ((1 - s) + s * (open * 2.5 - 0.5) + Math.sin(Math.PI * s) * (1 + open * 1.5))
        dot(out, x, y + sgn, edge)
        if (s < 0.6) dot(out, x, y + sgn * 2, edge)
        if (s < 0.6) dot(out, x, y + sgn, deep)
        dot(out, x, y, s > 0.8 ? WHITE : sgn < 0 ? hi : lit)
      }
    }
  }

  // Bits torn off at each snap, tossed back and up
  for (const s of BITE_SNAPS) {
    emit(t, { count: 4, gap: 0, start: s, life: 10 }, (i, age) => {
      const vx = -g.side * (0.4 + rnd(a.seed, i, s) * 0.8)
      const vy = -1 - rnd(a.seed, i, s + 9) * 0.8
      const x = tx + vx * age
      const y = g.target.y + vy * age + 0.18 * age * age
      if (y > g.ground) return
      dot(out, x, y, i % 2 ? lit : c)
      if (i % 2) dot(out, x + 1, y, deep)
    })
    const u = t - s
    if (u >= 0 && u < 2) burst(out, tx, g.target.y, u ? 2 : 3, u ? c : WHITE)
  }
  // Gulped down, a little glow of strength
  if (t >= BITE_CHEW + 5 && t < BITE_CHEW + 9) {
    out.shade = glow(light(c, 0.4), 0.3)
    sparkles(out, t, a.seed, g.mouth.x, g.mouth.y - 1, 6, 5, c, 3)
  }
}

const BUZZ_GO = 6
const BUZZ_STOP = 32

// Rings of sound, dashed and wobbling, that circle out from the body
function buzzRing(out, g, x, y, r, t, col) {
  const steps = Math.ceil(r * TAU * 1.2)
  for (let k = 0; k < steps; k++) {
    if ((Math.floor(k / 2) + t) % 3 === 0) continue
    const ang = (k / steps) * TAU
    const rr = r + Math.sin(ang * 10 + t * 2) * 0.6
    const py = y + Math.sin(ang) * rr * 0.7
    if (py < 0 || py > g.ground) continue
    back(out, x + Math.cos(ang) * rr, py, col)
  }
}

// Wings blur into a buzz that rattles the body while warbling rings of sound pour off
// it and jitter the target
function bugbuzz(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  const loud = t >= BUZZ_GO && t < BUZZ_STOP
  const rise = easeOut(phase(t, 0, BUZZ_GO)) * (1 - easeInOut(phase(t, BUZZ_STOP, BUZZ_STOP + 6)))
  out.dy = -Math.round(rise)
  if (loud) {
    out.dx = tremble(t)
    out.dy -= t % 2
    if (t % 4 < 2) out.shade = tint(hi, 0.18)
    out.shake = [t % 2 ? 1 : 0, 0]
  }
  emit(t, { count: 9, gap: 3, start: BUZZ_GO, life: 12 }, (i, age, f) => {
    if (f > 0.8 && t % 2) return
    buzzRing(out, g, g.cx, g.cy, 3 + (g.right - g.left) / 2 + age * 2.2, t + i, f < 0.3 ? WHITE : f < 0.6 ? hi : f < 0.85 ? c : deep)
  })
  // Zigzags buzzing at the target
  const tx = g.target.x
  const ty = g.target.y
  if (t >= BUZZ_GO + 6 && t < BUZZ_STOP + 4) {
    for (let k = 0; k < 3; k++) {
      const x = tx + (rnd(a.seed, k, t >> 1) - 0.5) * 10
      const y = ty + (rnd(a.seed, k, (t >> 1) + 30) - 0.5) * 8
      for (let s = 0; s < 4; s++) dot(out, x + s * g.side, y + (s % 2 ? -1 : 1), s % 2 ? hi : deep)
    }
  }
}

const UT_CROUCH = 4
const UT_HIT = 9
const UT_HOME = 25

// Where the mon is at tick t: a straight dash in, then a high U back to its spot
function uturnAt(t, far, high) {
  if (t < UT_CROUCH) return [-Math.round(phase(t, 0, UT_CROUCH - 1)), 0]
  if (t < UT_HIT) return [Math.round(lerp(-1, far, easeIn(phase(t, UT_CROUCH, UT_HIT)))), 0]
  if (t < UT_HOME) {
    const turn = easeInOut(phase(t, UT_HIT, UT_HOME)) * Math.PI
    return [Math.round((far / 2) * (1 + Math.cos(turn))), -Math.round(high * Math.sin(turn))]
  }
  return [0, 0]
}

// Crouch, dart straight into the target, and with the hit swing up and around in a
// U, turned away, to land back home
function uturn(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const far = travel(g, 14, 2)
  const high = clamp(g.top + 3, 4, 7)
  const [dx, dy] = uturnAt(t, far, high)
  out.dx = g.side * dx
  out.dy = dy
  if (t < UT_CROUCH) {
    out.sy = 0.92
    out.sx = 1.06
  }
  out.flipX = t > UT_HIT && t < UT_HOME - 2
  const land = t - UT_HOME
  if (land >= 0 && land < 3) {
    out.sy = [0.86, 0.93, 1][land]
    out.sx = [1.1, 1.05, 1][land]
  }
  if (t >= UT_CROUCH + 2 && t <= UT_HIT) out.ghosts = [ghost(g.side * uturnAt(t - 1, far, high)[0], 0, lit, 0.6)]
  // A ribbon traced along the path behind the mon
  for (let lag = 1; lag <= 16; lag++) {
    const at = t - lag * 0.5
    if (at < UT_CROUCH || at >= UT_HOME) continue
    const [px, py] = uturnAt(at, far, high)
    const x = g.cx + g.side * px
    const y = g.bottom - 2 + py
    const col = lag < 5 ? WHITE : lag < 11 ? hi : c
    back(out, x, y - 1, col)
    back(out, x, y, lag < 11 ? lit : c)
    back(out, x, y + 1, lag < 11 ? c : deep)
  }
  const hit = t - UT_HIT
  if (hit === 0) out.shake = [g.side * 2, 1]
  if (hit === 1) out.shake = [-g.side, 0]
  if (hit >= 0 && hit < 4) burst(out, g.target.x, g.target.y, [5, 4, 3, 2][hit], hit < 2 ? WHITE : c)
  if (hit >= 2 && hit < 8) ring(out, g.target.x, g.target.y, hit, hit < 5 ? lit : deep)
}

const XS_CROSS = 8
const XS_DASH = 11
const XS_CUT = 12
const XS_FLASH = 15
const XS_SPLIT = 17

// Cross two blades with a glint, dash through, and carve a big X into the target that
// flashes and then breaks apart along its arms
function xscissor(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const span = halfSpan(g)
  const tx = fit(g, g.target.x, span + 1)
  const ty = clamp(g.target.y, span, g.ground - span)
  const far = travel(g, 9)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [XS_CROSS, -2], [XS_DASH, -2], [XS_CUT + 1, far, easeIn], [XS_FLASH + 2, far], [XS_SPLIT + 8, 0, easeOut]]))
  out.skew = leanAhead(g, keys(t, [[0, 0], [XS_CROSS, -2], [XS_DASH, -2], [XS_CUT + 1, 3, easeIn], [XS_SPLIT + 4, 0]]))
  if (t >= XS_DASH && t <= XS_CUT + 2) out.ghosts = [ghost(out.dx - g.side * 3, 0, lit, 0.55)]

  // Blades crossed at the chest during the wind-up
  if (t >= 2 && t < XS_DASH) {
    const x = g.mouth.x + out.dx + g.side
    const y = g.mouth.y + 2
    const s = Math.min(3, 1 + (t - 2) * 0.5)
    line(out, x - g.side * s, y - s, x + g.side * s, y + s, t % 4 < 2 ? lit : c)
    line(out, x - g.side * s, y + s, x + g.side * s, y - s, hi)
    if (t === XS_CROSS || t === XS_CROSS + 1) spark(out, x, y, 2, hi)
  }

  // The two cuts, top back to bottom front and then bottom back to top front
  const tones = t < XS_FLASH ? [WHITE, hi, c, deep] : [hi, c, deep]
  const r = span + 1
  const arms = [[-1, -1, 1, 1], [-1, 1, 1, -1]]
  arms.forEach(([x0, y0, x1, y1], k) => {
    const u = t - XS_CUT - k
    if (u < 0 || t >= XS_SPLIT) return
    blade(out, tx + g.side * x0 * r, ty + y0 * r, tx + g.side * x1 * r, ty + y1 * r, 1.6, tones, phase(u, 0, 1.5))
  })
  const flash = t - XS_FLASH
  if (flash === 0) out.shake = [g.side * 2, 2]
  if (flash === 1) out.shake = [-g.side, -1]
  if (flash >= 0 && flash < 3) burst(out, tx, ty, [5, 6, 4][flash], flash < 2 ? WHITE : c)

  // The four half arms slide apart from the middle and fade
  const split = t - XS_SPLIT
  if (split >= 0 && split < 10) {
    const push = 1 + split * 0.8
    for (const [ux, uy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x0 = tx + g.side * ux * push
      const y0 = ty + uy * push
      const cols = split < 4 ? [hi, c, deep] : [c, deep]
      if (split > 6 && split % 2) continue
      blade(out, x0, y0, x0 + g.side * ux * r * (1 - split * 0.07), y0 + uy * r * (1 - split * 0.07), 1.2, cols)
    }
  }
}

const SW_GUST = 8
const SW_STOP = 32

// Beat the wings and blow a silvery gale of glittering scales that spiral to the
// target and whirl around it
function silverwind(out, t, a, g, c) {
  const silver = [WHITE, light(c, 0.4), c, mix(c, 0x5a6070, 0.6)]
  const edge = mix(c, 0x3a4050, 0.75)
  const flap = (t >> 1) % 2
  const live = t < SW_STOP + 4
  if (live && t >= 1) {
    out.sy = flap ? 1.06 : 0.95
    out.dy = flap ? -1 : 0
    out.ghosts = [ghost(0, flap ? 1 : -1, silver[1], 0.55)]
    if (t >= SW_GUST && !flap) out.dx = -g.side
  }
  if (t >= SW_GUST && t < SW_STOP) out.shade = tint(silver[1], 0.12 + (flap ? 0.1 : 0))
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const dist = Math.max(4, Math.abs(tx - mx))

  // Wind lines curling along the gust
  emit(t, { count: 12, gap: 2, start: SW_GUST, life: 8 }, (i, age, f) => {
    const lane = (rnd(a.seed, i, 3) - 0.5) * 8
    for (let k = 0; k < 5; k++) {
      const p = clamp(f - k * 0.04, 0, 1)
      const x = lerp(mx, tx, p)
      const y = lerp(my, ty, p) + lane * Math.sin(Math.PI * p) + Math.sin(p * 9 + i) * 1.2
      if (y >= 0 && y <= g.ground) dot(out, x, y, k === 0 ? WHITE : k < 3 ? silver[1] : silver[3])
    }
  })
  // Scales spiraling along the gust, then caught in a whirl at the target
  emit(t, { count: 34, gap: 0.7, start: SW_GUST, life: 18 }, (i, age, f) => {
    const travelF = clamp(age / 10, 0, 1)
    const spin = age * 0.9 + i * 1.7
    const r = travelF < 1 ? 2.5 * Math.sin(Math.PI * travelF) + 1 : 2 + (age - 10) * 0.6
    const x = lerp(mx, tx, easeOut(travelF)) + Math.cos(spin) * r * (travelF < 1 ? 0.4 : 1.2)
    const y = lerp(my, ty, travelF) + Math.sin(spin) * r
    if (y < 0 || y > g.ground || dist < 1) return
    if (f > 0.8 && (t + i) % 2) return
    dot(out, x, y + 1, edge)
    dot(out, x, y, (i + t) % 5 === 0 ? WHITE : silver[i % 3])
  })
  if (t >= SW_GUST + 10 && t < SW_STOP + 8) sparkles(out, t, a.seed, tx, ty, 10, 8, silver[3], 4)
}

const HORN_PAW = [3, 8]
const HORN_CHARGE = 13
const HORN_HIT = 18
const HORN_BACK = 26
const HORN_HOME = 38

// A horn pointing ahead from x, y, len pixels long and ridged, tilted a little up
function horn(out, g, x, y, len, tones, glintAt) {
  for (let k = 0; k <= len; k++) {
    const w = Math.round(1.7 * (1 - k / (len + 1)))
    const cx = x + g.side * k
    const cy = y - k * 0.3
    for (let d = -w; d <= w; d++) {
      const tone = k === glintAt ? WHITE : d === -w ? tones[0] : d === w ? tones[3] : k % 3 === 1 ? tones[2] : tones[1]
      dot(out, cx, cy + d, tone)
    }
  }
}

// Paw the ground twice while a huge ridged horn grows from the head, then charge
// horn first into the target with a crushing blast and shockwaves, and back off
function megahorn(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const tones = [hi, lit, c, deep]
  // Stop where the full grown horn just reaches the target
  const far = travel(g, 12, 10)
  const paw = HORN_PAW.some((p) => t === p || t === p + 1)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [HORN_CHARGE, -2], [HORN_HIT, far, easeIn], [HORN_BACK, far], [HORN_HOME, 0, easeOut]]))
  if (paw) out.dy = -1
  out.skew = leanAhead(g, keys(t, [[0, 0], [HORN_CHARGE - 2, -2], [HORN_HIT, 3, easeIn], [HORN_BACK, 2], [HORN_HOME, 0]]))
  if (t > HORN_HIT && t < HORN_BACK) out.dx += tremble(t)
  if (t >= HORN_CHARGE && t < HORN_HIT) {
    out.ghosts = [ghost(Math.round(g.side * keys(t - 1.5, [[HORN_CHARGE, -2], [HORN_HIT, far, easeIn]])), 0, lit, 0.6)]
  }
  if (t === HORN_HIT) out.shade = tint(WHITE, 0.5)

  // Dust kicked back at each paw
  for (const p of HORN_PAW) {
    emit(t, { count: 5, gap: 0, start: p, life: 8 }, (i, age) => {
      const x = g.cx - g.side * ((g.right - g.left) / 2 + 1 + age * (0.6 + rnd(a.seed, i, p) * 0.6))
      const y = g.ground - 1 - age * 0.6 + age * age * 0.06
      dot(out, x, Math.min(g.ground, y), i % 2 ? 0xc8b28e : 0x9a8668)
    })
  }

  const grow = easeOut(phase(t, 2, HORN_CHARGE)) * (1 - easeIn(phase(t, HORN_BACK + 2, HORN_HOME)))
  const len = Math.round(2 + grow * 6)
  const hx = g.mouth.x + out.dx + (out.skew ? Math.round(out.skew(g.mouth.y - 2)) : 0) - g.side
  const hy = g.mouth.y - 2 + out.dy
  if (grow > 0.05) horn(out, g, hx, hy, len, tones, t >= 9 && t < HORN_CHARGE ? t - 9 + Math.floor(len / 2) : -1)

  // Speed lines through the charge
  if (t >= HORN_CHARGE && t < HORN_HIT + 1) {
    for (let k = 0; k < 4; k++) {
      const y = g.top + 1 + ((k * 5 + t) % Math.max(2, g.bottom - g.top))
      const x = g.cx + out.dx - g.side * (4 + k * 2)
      line(out, x, y, x - g.side * 4, y, k % 2 ? lit : c)
    }
  }
  const hit = t - HORN_HIT
  const tip = [hx + g.side * len, hy - len * 0.3]
  if (hit === 0) out.shake = [g.side * 3, 2]
  if (hit === 1) out.shake = [-g.side * 2, -1]
  if (hit === 2) out.shake = [g.side, 1]
  if (hit >= 0 && hit < 4) burst(out, tip[0], tip[1], [7, 6, 4, 3][hit], hit < 2 ? WHITE : hi)
  for (const lag of [0, 3]) {
    const u = hit - lag
    if (u >= 0 && u < 8) ring(out, tip[0], tip[1], 2 + u * 1.4, u < 3 ? WHITE : u < 5 ? lit : deep, g.side > 0 ? 0 : Math.PI, 1.2, u > 5 ? dotted : dot)
  }
}

const SIGNAL_FIRE = 10
const SIGNAL_STOP = 30

// Antennae blink a code, then a beam of marching bright and dark pulses fires at the
// target, which flickers in a strobing diamond
function signalbeam(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const alt = mix(c, 0x40c0ff, 0.55)
  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  const firing = t >= SIGNAL_FIRE && t < SIGNAL_STOP
  if (t < SIGNAL_FIRE) {
    out.dy = t > 2 ? -1 : 0
    out.skew = leanAhead(g, -phase(t, 0, SIGNAL_FIRE) * 1.5)
  } else if (firing) {
    out.dx = t % 3 === 0 ? -g.side : 0
    out.shade = glow(t % 4 < 2 ? c : alt, 0.2)
  }

  // Two antenna lights above the head, blinking long and short
  if (t >= 1 && t < SIGNAL_STOP) {
    const code = [1, 1, 0, 1, 0, 0, 1, 1, 1, 0][t % 10]
    for (const off of [0, 2]) {
      const x = mx - g.side * (1 + off) + (out.skew ? Math.round(out.skew(g.top)) : 0)
      const y = Math.max(1, g.top - 1 + out.dy)
      if (code || firing) plus(out, x, y, off ? alt : c, WHITE)
      else dot(out, x, y, deep)
    }
  }

  // The beam: three rows of marching segments, the middle row brightest
  const grow = easeOut(phase(t, SIGNAL_FIRE, SIGNAL_FIRE + 4))
  const fade = phase(t, SIGNAL_STOP, SIGNAL_STOP + 5)
  if (grow > 0 && fade < 1) {
    const len = Math.abs(tx - mx)
    for (let k = 0; k <= len * grow; k++) {
      if (fade > 0 && rnd(a.seed, k, t) < fade) continue
      const p = len ? k / len : 0
      const x = mx + g.side * k
      const y = Math.round(lerp(my, ty, p))
      const seg = Math.floor((k - t * 2) / 3) & 1
      dot(out, x, y, seg ? WHITE : hi)
      dot(out, x, y - 1, seg ? c : alt)
      dot(out, x, y + 1, seg ? deep : c)
    }
    // Pulses riding along the beam
    emit(t, { count: 6, gap: 3, start: SIGNAL_FIRE, life: 5 }, (i, age, f) => {
      const x = lerp(mx, tx, f)
      const y = lerp(my, ty, f)
      ring(out, x, y, 2, i % 2 ? alt : lit)
    })
  }
  if (t >= SIGNAL_FIRE + 4 && t < SIGNAL_STOP + 6) {
    const r = 3 + ((t - SIGNAL_FIRE) % 4)
    const col = t % 2 ? c : alt
    for (let k = 0; k < r; k++) {
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) dot(out, tx + sx * k, ty + sy * (r - k), col)
    }
    if (t % 3 === 0) burst(out, tx, ty, 2, WHITE)
  }
}

const WEB_SHOOT = 6
const WEB_HIT = 11
const WEB_SPOKES = 8
const WEB_HOLD = 36

// Shoot one thread at the target, then a round web unfurls there spoke by spoke and
// ring by ring, pinned to the ground, wobbling with dew glints until it falls apart
function spiderweb(out, t, a, g, c) {
  const thread = c
  const shadow = dark(c, 0.55)
  const ring2 = dark(c, 0.25)
  const tx = fit(g, g.target.x, 7)
  const r = clamp(Math.min(g.target.y - 1, g.ground - g.target.y), 4, 7)
  const ty = clamp(g.target.y, r + 1, g.ground - r)
  out.dx = Math.round(g.side * keys(t, [[0, 0], [WEB_SHOOT - 1, -2], [WEB_SHOOT + 1, 1, easeIn], [WEB_SHOOT + 6, 0]]))
  if (t < WEB_SHOOT) out.dy = -1

  const fall = phase(t, WEB_HOLD, a.ticks - 1)
  const paint = fall > 0.4 ? dotted : dot
  const wob = (k) => (t >= WEB_HIT && t < WEB_HOLD ? Math.sin(t * 0.6 + k) * 0.4 : 0)
  // The first thread runs out from the mouth and stays as the tether
  if (t >= WEB_SHOOT && fall < 1) {
    const f = easeOut(phase(t, WEB_SHOOT, WEB_HIT))
    const x1 = lerp(g.mouth.x, tx, f)
    const y1 = lerp(g.mouth.y, ty, f)
    const sag = t >= WEB_HIT ? 1.5 : 0
    const steps = Math.max(2, Math.abs(x1 - g.mouth.x))
    for (let k = 0; k <= steps; k++) {
      const p = k / steps
      const x = lerp(g.mouth.x + out.dx, x1, p)
      const y = lerp(g.mouth.y, y1, p) + sag * Math.sin(Math.PI * p) + fall * p * 4
      if (fall > 0 && rnd(a.seed, k, 70) < fall) continue
      dot(out, x, y + 1, shadow)
      dot(out, x, y, thread)
    }
    if (t < WEB_HIT) plus(out, x1, y1, thread, WHITE)
  }
  if (t < WEB_HIT) return

  const open = easeOut(phase(t, WEB_HIT, WEB_HIT + 6))
  const drop = Math.round(fall * fall * 6)
  const spokeAt = (k, rr) => {
    const ang = (k / WEB_SPOKES) * TAU + 0.2
    return [tx + Math.cos(ang) * rr, ty + drop + Math.sin(ang) * rr * 0.9]
  }
  for (let k = 0; k < WEB_SPOKES; k++) {
    const [x, y] = spokeAt(k, r * open + wob(k))
    line(out, tx, ty + drop, x, y + 1, shadow, paint)
    line(out, tx, ty + drop, x, y, thread, paint)
  }
  // Rings laid in one spoke at a time, outermost first
  const laid = phase(t, WEB_HIT + 4, WEB_HIT + 16) * WEB_SPOKES * 3
  for (let n = 0; n < laid; n++) {
    const ringK = Math.floor(n / WEB_SPOKES)
    const k = n % WEB_SPOKES
    const rr = r * open * (1 - ringK * 0.28)
    const [x0, y0] = spokeAt(k, rr + wob(k))
    const [x1, y1] = spokeAt(k + 1, rr + wob(k + 1))
    line(out, x0, y0, x1, y1, ring2, paint)
  }
  // Anchor lines down to the ground and up out of the strip
  if (fall < 0.5) {
    const [bx, by] = spokeAt(2, r * open)
    line(out, bx, by, bx + 1, g.ground, ring2)
    const [ux, uy] = spokeAt(6, r * open)
    line(out, ux, uy, ux - 1, 0, ring2)
  }
  if (t >= WEB_HIT + 8 && t < WEB_HOLD) {
    const k = (t >> 2) % WEB_SPOKES
    const [x, y] = spokeAt(k, r * 0.6)
    spark(out, x, y, 1, light(c, 0.5))
  }
  if (t === WEB_HIT) out.shake = [g.side, 0]
}

const STRUGGLE_GO = 5
const STRUGGLE_STOP = 26

// Thrash in a tantrum with a scribble of frustration overhead, flinging a spray of
// little buzzing bugs that zigzag at the target and pelt it
function strugglebug(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const live = phase(t, 0, 3) * (1 - phase(t, STRUGGLE_STOP, STRUGGLE_STOP + 6))
  if (live > 0) {
    out.skew = leanAhead(g, Math.sin(t * 1.7) * 2.5 * live)
    out.dy = t % 4 === 0 && live > 0.5 ? -1 : 0
    out.dx = Math.round(tremble(t, 2) * live)
  }

  // A scribble of frustration above the head
  if (t >= 2 && t < STRUGGLE_STOP + 2) {
    const x = g.cx
    const y = Math.max(2, g.top - 2)
    for (let k = 0; k < 6; k++) {
      const ang = k * 2.3 + t * 0.8
      dot(out, x + Math.cos(ang) * 2, y + Math.sin(ang), k % 2 ? deep : dark(c, 0.6))
    }
  }

  const { x: mx, y: my } = g.mouth
  const { x: tx, y: ty } = g.target
  emit(t, { count: 16, gap: 1.3, start: STRUGGLE_GO, life: 9 }, (i, age, f) => {
    const lane = (rnd(a.seed, i, 1) - 0.5) * 7
    const x = lerp(mx, tx + (rnd(a.seed, i, 2) - 0.5) * 4, f)
    const y = lerp(my, ty + lane * 0.6, f) + lane * Math.sin(Math.PI * f) + Math.sin(age * 2.2 + i) * 1.3
    if (y < 0 || y > g.ground) return
    if (f > 0.85) {
      plus(out, x, y, lit, WHITE)
      return
    }
    dot(out, x, y, i % 3 ? c : hi)
    dot(out, x - g.side, y, deep)
    dot(out, x, y - 1, (t + i) % 2 ? WHITE : WING)
  })
  if (t >= STRUGGLE_GO + 8 && t < STRUGGLE_STOP + 6 && t % 3 === 0) out.shake = [g.side, 0]
}

const RAGE_SHAKE = 14
const RAGE_SWIRL = 38

// Shake out billows of red powder that swirl around the mon in a ring while it glows
// angrily and chevrons point in at it, drawing every eye
function ragepowder(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const w = (g.right - g.left) / 2
  const h = (g.bottom - g.top) / 2
  if (t >= 2 && t < RAGE_SHAKE) out.dx = tremble(t)
  const pulse = t >= RAGE_SHAKE && t < RAGE_SWIRL && (t - RAGE_SHAKE) % 6 < 3
  if (pulse) {
    out.shade = glow(c, 0.3)
    out.sx = 1.04
    out.sy = 1.04
  }

  // Powder puffing up off the body while it shakes
  emit(t, { count: 30, gap: 0.4, start: 2, life: 12 }, (i, age, f) => {
    const x0 = g.cx + (rnd(a.seed, i, 1) - 0.5) * w * 2
    const vx = (rnd(a.seed, i, 2) - 0.5) * 0.8
    const x = x0 + vx * age
    const y = g.top + 2 + rnd(a.seed, i, 3) * h - age * 0.7
    if (y < 0) return
    dot(out, x, y, f < 0.4 ? hi : f < 0.7 ? c : deep)
  })
  // The powder ring orbiting around the body
  const ring0 = phase(t, RAGE_SHAKE - 4, RAGE_SHAKE + 4) * (1 - phase(t, RAGE_SWIRL, a.ticks - 1))
  if (ring0 > 0) {
    for (let i = 0; i < 26; i++) {
      if (rnd(a.seed, i, 7) > ring0) continue
      const ang = t * 0.28 + (i / 26) * TAU
      const x = g.cx + Math.cos(ang) * (w + 3 + rnd(a.seed, i, 8) * 2)
      const y = g.cy + Math.sin(ang) * (h * 0.6 + 1) - Math.sin(t * 0.2 + i) * 1
      if (y < 0 || y > g.ground) continue
      const paint = Math.sin(ang) < 0 ? back : dot
      paint(out, x, y, i % 3 === 0 ? hi : i % 3 === 1 ? c : deep)
      if (i % 4 === 0) paint(out, x + 1, y, lit)
    }
  }
  // Chevrons pointing in at the mon from both sides
  if (t >= RAGE_SHAKE + 4 && t < RAGE_SWIRL && t % 6 < 4) {
    const gap = 3 + ((t >> 1) % 3)
    for (const way of [-1, 1]) {
      const x = g.cx + way * (w + 5 + gap)
      if (x < 2 || x > g.columns - 3) continue
      for (let k = -2; k <= 2; k++) {
        dot(out, x - way * (2 - Math.abs(k)) + way, g.cy + k, deep)
        dot(out, x - way * (2 - Math.abs(k)), g.cy + k, k === 0 ? WHITE : c)
      }
    }
  }
}

const ROLL_CURL = 6
const ROLL_HIT = 17
const ROLL_BACK = 23
const ROLL_HOME = 34

// Curl into a ball and roll at the target in a blur of turning arcs, ride up over it
// and press it flat, then roll home and uncurl
function steamroller(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const far = travel(g, 14, 1)
  const curl = easeOut(phase(t, 0, ROLL_CURL)) * (1 - easeOut(phase(t, ROLL_HOME, a.ticks - 2)))
  out.sx = 1 + 0.1 * curl
  out.sy = 1 - 0.15 * curl
  const pos = keys(t, [[0, 0], [ROLL_CURL, -1], [ROLL_HIT, far, easeIn], [ROLL_BACK, far], [ROLL_HOME, 0]])
  out.dx = Math.round(g.side * pos)
  const rolling = t >= ROLL_CURL && t < ROLL_HOME
  if (rolling) out.skew = (y) => Math.sin(y * 0.6 + t * 1.4 * g.side) * 1.2
  const press = t - ROLL_HIT
  if (press >= 0 && press < 5) {
    out.dy = -[2, 2, 1, 1, 0][press]
    out.sy = [0.7, 0.75, 0.82, 0.9, 0.95][press]
    out.sx = [1.25, 1.2, 1.12, 1.06, 1.03][press]
  }
  if (press === 0) out.shake = [g.side * 2, 2]
  if (press === 1) out.shake = [0, -1]

  // Arcs turning around the rolling body
  if (rolling) {
    const cx = g.cx + out.dx
    const cy = g.bottom - (g.bottom - g.top) * 0.45
    const r = Math.max(g.right - g.left, g.bottom - g.top) / 2 + 1
    const spin = t * 0.9 * (pos > 0 && t > ROLL_BACK ? -1 : 1)
    for (let k = 0; k < 3; k++) {
      const ang = spin + (k * TAU) / 3
      ring(out, cx, cy, r, k ? lit : WHITE, g.side > 0 ? ang : Math.PI - ang, 0.45, back)
    }
    // Dust churned up behind
    for (let k = 0; k < 3; k++) {
      const x = cx - g.side * (r + k * 2 + (t % 2))
      dot(out, x, g.ground - (k % 2), k ? 0x9a8668 : 0xc8b28e)
    }
  }
  // The target pressed flat: lines spreading along the ground under it
  if (press >= 0 && press < 12) {
    const w = 3 + press * 0.8
    const y = g.ground - 1
    for (let x = -w; x <= w; x++) {
      if (press > 7 && (x + press) % 2) continue
      dot(out, g.target.x + x, y, Math.abs(x) > w - 2 ? deep : press < 3 ? WHITE : hi)
    }
    if (press < 3) burst(out, g.target.x, y - 2, 3 + press, press ? c : WHITE)
  }
}

const DANCE_END = 38

// Sway in a light dance with fluttering afterimages while glittering scales spiral up
// around the body, then three chevrons rise as it glows
function quiverdance(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const live = phase(t, 0, 4) * (1 - phase(t, DANCE_END - 6, DANCE_END))
  const sway = Math.sin((t * TAU) / 12)
  if (live > 0) out.skew = lean(g, sway * 2.5 * live)
  const beat = t < DANCE_END && t % 6 < 2
  out.dy = beat && live > 0.5 ? -1 : 0
  if (beat && t > 3) out.ghosts = [ghost(-2, 0, lit, 0.55), ghost(2, 0, hi, 0.55)]

  const w = (g.right - g.left) / 2 + 3
  const h = g.bottom - g.top + 4
  emit(t, { count: 24, gap: 1.4, start: 2, life: 16 }, (i, age, f) => {
    const ang = i * 1.7 + age * 0.55
    const x = g.cx + Math.cos(ang) * w * (1 - f * 0.25)
    const y = g.bottom + 1 - f * h
    if (y < 0) return
    const paint = Math.sin(ang) < 0 ? back : dot
    const col = [hi, c, lit][i % 3]
    paint(out, x, y, (t + i) % 4 === 0 ? WHITE : col)
    if (f < 0.6) paint(out, x, y + 1, deep)
  })
  const glowF = phase(t, DANCE_END - 4, DANCE_END + 2) * (1 - phase(t, DANCE_END + 4, a.ticks - 1))
  if (glowF > 0) out.shade = glow(hi, 0.4 * glowF)
  emit(t, { count: 3, gap: 2, start: DANCE_END, life: 10 }, (i, age, f) => {
    if (f > 0.7 && t % 2) return
    chevron(out, g.cx + (i - 1) * Math.round(w * 0.8), g.top - 1 - age * 0.6 + 2, [c, hi, lit][i])
  })
}

const TAIL_SWELL = 10
const TAIL_FLASH = 30

// The tail end lights up, blinking like a firefly, swells into a pulsing glow with
// turning rays, bursts in a flash, and leaves fireflies drifting up
function tailglow(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const x = g.cx
  const y = g.bottom - Math.round((g.bottom - g.top) * 0.25)
  const blink = t < TAIL_SWELL && t % 4 < 2
  if (blink) disc(out, x, y, 1, hi, back)

  const swell = easeOut(phase(t, TAIL_SWELL, TAIL_FLASH))
  if (t >= TAIL_SWELL && t < TAIL_FLASH + 2) {
    const r = 1 + swell * ((g.right - g.left) / 2 + 2) + (t % 4 < 2 ? 1 : 0)
    disc(out, x, y, r, lit, (o, px, py, col) => (Math.round(px) + Math.round(py) + (t >> 1)) % 2 && back(o, px, py, col))
    ring(out, x, y, r, mix(c, 0xc07800, 0.55), 0, Math.PI, back)
    disc(out, x, y, r * 0.5, hi, back)
    disc(out, x, y, r * 0.3, WHITE, back)
    for (let k = 0; k < 6; k++) {
      const ang = t * 0.15 + (k * TAU) / 6
      const len = r + 2 + (k % 2) * 2
      line(out, x + Math.cos(ang) * r, y + Math.sin(ang) * r, x + Math.cos(ang) * len, y + Math.sin(ang) * len, k % 2 ? c : lit, back)
    }
    out.shade = glow(hi, 0.15 + 0.25 * swell)
    if (t > TAIL_SWELL + 10) out.dy = t % 4 < 2 ? -1 : 0
  }
  const flash = t - TAIL_FLASH
  if (flash >= 0 && flash < 3) {
    out.shade = tint(WHITE, [0.6, 0.4, 0.2][flash])
    burst(out, x, y, [8, 10, 7][flash], flash ? c : WHITE)
  }
  emit(t, { count: 8, gap: 1, start: TAIL_FLASH + 1, life: 12 }, (i, age, f) => {
    const px = g.cx + (rnd(a.seed, i) - 0.5) * (g.right - g.left + 8) + Math.sin(age * 0.5 + i) * 1.5
    const py = y - age * 1.1 - rnd(a.seed, i, 1) * 3
    if (py < 0 || (f > 0.6 && (t + i) % 3 === 0)) return
    plus(out, px, py, deep, (t + i) % 2 ? WHITE : hi)
  })
}

// Where bee i of a swarm hovers in a loose ball around x, y at tick t
function swarmAt(a, i, x, y, t, rx, ry) {
  const ang = t * (0.3 + rnd(a.seed, i, 41) * 0.25) + i * 2.1
  const r = 0.4 + rnd(a.seed, i, 42) * 0.6
  return [x + Math.cos(ang) * rx * r, y + Math.sin(ang * 1.3) * ry * r]
}

const ORDER_BEES = 14
const ATTACK_DIVE = 14
const ATTACK_HOME = 32

// Call a swarm of bees out from behind, hold it overhead, then send it diving at the
// target in waves of stings before the bees fly back
function attackorder(out, t, a, g, c) {
  const [hi, , , deep] = ramp(c)
  out.dy = t >= 2 && t < ATTACK_DIVE ? -1 : 0
  if (t >= ATTACK_DIVE - 2 && t < ATTACK_DIVE + 1) out.dx = -g.side
  else if (t >= ATTACK_DIVE + 1 && t < ATTACK_DIVE + 3) out.dx = g.side
  const hiveX = g.cx - g.side * Math.round((g.right - g.left) / 2)
  const cloudX = g.cx + g.side * 2
  const cloudY = clamp(g.top - 2, 4, g.cy)
  const { x: tx, y: ty } = g.target
  for (let i = 0; i < ORDER_BEES; i++) {
    const out0 = 2 + i * 0.6
    if (t < out0) continue
    const [sx, sy] = swarmAt(a, i, cloudX, cloudY, t, 6, 3)
    const dive = ATTACK_DIVE + (i % 3) * 3
    const strike = dive + 5
    const home = ATTACK_HOME + (i % 4)
    let x = sx
    let y = sy
    let paint = dot
    if (t < out0 + 4) {
      const f = easeOut(phase(t, out0, out0 + 4))
      x = lerp(hiveX, sx, f)
      y = lerp(g.cy, sy, f)
      paint = f < 0.3 ? back : dot
    } else if (t >= dive && t < strike) {
      // A swoop: up and over, then down on the target
      const f = easeIn(phase(t, dive, strike))
      x = lerp(sx, tx + (rnd(a.seed, i, 5) - 0.5) * 6, f)
      y = lerp(sy, ty + (rnd(a.seed, i, 6) - 0.5) * 6, f) - Math.sin(Math.PI * f) * 3
    } else if (t >= strike && t < home) {
      const f = easeInOut(phase(t, strike + 2, home))
      const [hx, hy] = swarmAt(a, i, tx, ty, t, 5, 4)
      x = lerp(hx, hiveX, f)
      y = lerp(hy, g.cy, f) - Math.sin(Math.PI * f) * 4
      paint = f > 0.85 ? back : dot
    } else if (t >= home) continue
    if (y < 0 || y > g.ground) continue
    bee(out, x, y, t, i, i % 4 ? c : hi, g.side, paint)
    if (t >= dive && t < strike) dot(out, x - g.side * 2, y, deep)
    if (t === strike || t === strike + 1) plus(out, x, y, deep, WHITE)
  }
  for (let wave = 0; wave < 3; wave++) {
    const hit = t - (ATTACK_DIVE + wave * 3 + 5)
    if (hit === 0) out.shake = [g.side * (wave === 2 ? 2 : 1), 1]
    if (hit >= 0 && hit < 2) burst(out, tx, ty, 3 + wave, hit ? c : WHITE)
  }
}

const DEFEND_BUILD = 10
const DEFEND_HOLD = 32

// Bees pour out and settle over the body, laying down a honeycomb shell cell by
// cell that shimmers, then lifts away as the bees scatter
function defendorder(out, t, a, g, c) {
  const [hi, lit] = ramp(c)
  const rim = dark(c, 0.45)
  const w = (g.right - g.left) / 2 + 3
  const h = (g.bottom - g.top) / 2 + 2
  const cy = (g.top + g.bottom) / 2

  // Bees streaming in from both sides to their cells
  for (let i = 0; i < ORDER_BEES; i++) {
    const born = i * 0.6
    const leave = DEFEND_HOLD + (i % 4)
    if (t < born || t > leave + 8) continue
    const way = i % 2 ? 1 : -1
    const ang = t * 0.4 + i * 1.9
    const hx = g.cx + Math.cos(ang) * w
    const hy = cy + Math.sin(ang) * h * 0.9
    const f = easeOut(phase(t, born, born + 7))
    let x = lerp(g.cx + way * (w + 10), hx, f)
    let y = lerp(g.top - 4, hy, f)
    if (t > leave) {
      const u = easeIn(phase(t, leave, leave + 8))
      x = lerp(hx, hx + way * 14, u)
      y = lerp(hy, hy - 10, u)
    }
    if (y < 0 || y > g.ground || x < 0 || x >= g.columns) continue
    bee(out, x, y, t, i, i % 3 ? c : hi, way, Math.sin(ang) < -0.3 && t < leave ? back : dot)
  }

  // Honeycomb cells appear from the middle out
  const build = phase(t, DEFEND_BUILD, DEFEND_BUILD + 10)
  const lift = phase(t, DEFEND_HOLD, DEFEND_HOLD + 8)
  if (build <= 0 || lift >= 1) return
  const shimmer = t >= DEFEND_BUILD + 10 && t < DEFEND_HOLD
  for (let row = -4; row <= 4; row++) {
    for (let col = -5; col <= 5; col++) {
      const x = g.cx + col * 5 + (row % 2 ? 2.5 : 0)
      const y = cy + row * 3 - Math.round(lift * 6)
      const d = Math.hypot((x - g.cx) / w, (y - cy) / h)
      // Only a shell of cells around the rim, so the body shows through
      if (d > 1.05 || d < 0.6 || d > build * 1.1) continue
      if (lift > 0 && rnd(a.seed, row * 13 + col, 4) < lift) continue
      const lit2 = shimmer && (row + col + (t >> 1)) % 6 === 0
      const edge = lit2 ? WHITE : (row + col) % 2 ? c : rim
      // A small hexagon: flat top and bottom, pointed sides
      for (const [px, py] of [[-1, -1], [0, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [0, 1], [1, 1]]) dot(out, x + px, y + py, edge)
      if (lit2) dot(out, x, y, lit)
    }
  }
  if (build > 0.9 && !lift) out.shade = glow(c, 0.15)
}

const HEAL_POUR = 12
const HEAL_GLOW = 30

// Bees ferry golden honey drops in from above and let them fall on the mon, which
// soaks up the sweetness in warm pulses as crosses rise off it
function healorder(out, t, a, g, c) {
  const [hi, lit, , deep] = ramp(c)
  const w = (g.right - g.left) / 2
  const above = Math.max(2, g.top - 3)
  for (let i = 0; i < 8; i++) {
    const way = i % 2 ? 1 : -1
    const born = i * 1.5
    const drop = HEAL_POUR + i * 1.6
    const f = easeOut(phase(t, born, born + 8))
    const hx = g.cx + way * (1 + (i >> 1) * (w / 3.5))
    let x = lerp(g.cx + way * (w + 12), hx, f) + Math.sin(t * 0.7 + i) * 0.8
    let y = lerp(above - 3, above, f) + Math.sin(t * 0.9 + i * 2) * 0.8
    const gone = phase(t, drop + 2, drop + 10)
    if (t < born || gone >= 1) continue
    if (gone > 0) {
      x += way * gone * 14
      y -= gone * 4
    }
    if (y < 0 || x < 0 || x >= g.columns) continue
    bee(out, x, y, t, i, i % 3 ? c : hi, way)
    // The honey drop it carries, then lets fall onto the body
    const fallAge = t - drop
    if (fallAge < 0) {
      dot(out, hx, y + 1, lit)
    } else {
      const dy = y + 1 + fallAge * 0.4 + fallAge * fallAge * 0.2
      if (dy < g.cy) {
        dot(out, hx, dy, hi)
        dot(out, hx, dy + 1, c)
        dot(out, hx + 1, dy + 1, deep)
      } else if (dy < g.cy + 4) {
        plus(out, hx, g.cy, c, WHITE)
      }
    }
  }
  const soak = phase(t, HEAL_POUR + 4, HEAL_GLOW) * (1 - phase(t, HEAL_GLOW + 6, a.ticks - 1))
  if (soak > 0) out.shade = glow(hi, (0.18 + 0.15 * Math.sin(t * 0.8)) * soak + 0.1 * soak)
  if (t >= HEAL_GLOW - 4 && t < HEAL_GLOW + 2) {
    out.sy = 1 + 0.04 * Math.sin(phase(t, HEAL_GLOW - 4, HEAL_GLOW + 2) * Math.PI)
  }
  emit(t, { count: 6, gap: 2, start: HEAL_GLOW - 4, life: 10 }, (i, age, f) => {
    const x = g.cx + (rnd(a.seed, i) - 0.5) * (w * 2 + 4)
    const y = g.cy - age * 1
    if (y < 0 || (f > 0.7 && t % 2)) return
    plus(out, x + 1, y + 1, deep, deep)
    plus(out, x, y, c, WHITE)
  })
}

export const BUG = {
  furycutter: { ticks: 34, color: 0xa8d040, draw: furycutter },
  bugbite: { ticks: 36, color: 0x9ccc3c, draw: bugbite },
  bugbuzz: { ticks: 44, color: 0xc8d848, draw: bugbuzz },
  uturn: { ticks: 32, color: 0x8cc63f, draw: uturn },
  xscissor: { ticks: 34, color: 0xb4dc50, draw: xscissor },
  silverwind: { ticks: 46, color: 0xd4d8e8, draw: silverwind },
  megahorn: { ticks: 44, color: 0xa8c828, draw: megahorn },
  signalbeam: { ticks: 40, color: 0xe070d8, draw: signalbeam },
  spiderweb: { ticks: 46, color: 0xe4e4ec, draw: spiderweb },
  strugglebug: { ticks: 36, color: 0xb4c84a, draw: strugglebug },
  ragepowder: { ticks: 46, color: 0xe8503a, pose: { view: 'front' }, draw: ragepowder },
  steamroller: { ticks: 44, color: 0x98b040, draw: steamroller },
  quiverdance: { ticks: 50, color: 0xe090f0, pose: { view: 'front' }, draw: quiverdance },
  tailglow: { ticks: 46, color: 0xfff07a, pose: { view: 'front' }, draw: tailglow },
  attackorder: { ticks: 44, color: 0xf0c020, draw: attackorder },
  defendorder: { ticks: 46, color: 0xe8b030, pose: { view: 'front' }, draw: defendorder },
  healorder: { ticks: 46, color: 0xf2c040, pose: { view: 'front' }, draw: healorder },
}
