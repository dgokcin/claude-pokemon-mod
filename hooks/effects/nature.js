// Grass and bug moves

import {
  WHITE, back, ball, burst, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, glow, lerp, light,
  hsl, line, luma, mix, phase, plus, puff, ring, rnd, spark, sparkles, stamp, tint, tremble,
} from './draw.js'

const pt = (x, y) => ({ x, y })
const VINE_LEAVES = [0.3, 0.52, 0.74]

// A unit vector at an angle. Angle 0 points at the target and negative angles point up.
const toward = (angle, side) => pt(Math.cos(angle) * side, Math.sin(angle))

// A point along the curve from p to q that bows toward k
function bend(p, k, q, u) {
  const v = 1 - u
  return pt(v * v * p.x + 2 * v * u * k.x + u * u * q.x, v * v * p.y + 2 * v * u * k.y + u * u * q.y)
}

// A point along the cubic curve through four control points
function cubic([p0, p1, p2, p3], u) {
  const v = 1 - u
  const [a, b, c, d] = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u]
  return pt(a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.y + b * p1.y + c * p2.y + d * p3.y)
}

// Points about half a pixel apart along a curve of roughly `length` pixels
function sample(curve, length) {
  const n = Math.max(2, Math.ceil(length * 2))
  return Array.from({ length: n + 1 }, (_, k) => curve(k / n))
}

// A thick leafy vine from root to tip, with a lit edge, a green core and a dark rind.
// It thins toward a bright tip and has leaves on alternate sides.
function vine(out, path, c, paint = dot) {
  const lit = light(c, 0.45)
  const rind = dark(c, 0.55)
  const leaf = mix(c, 0xc8f060, 0.55)
  const n = path.length - 1
  const across = path.map((p, k) => {
    const q = path[Math.min(n, k + 1)]
    const o = path[Math.max(0, k - 1)]
    return Math.abs(q.x - o.x) >= Math.abs(q.y - o.y) ? [0, 1] : [1, 0]
  })
  const thick = (k) => k < n * 0.75
  path.forEach((p, k) => paint(out, p.x + across[k][0], p.y + across[k][1], rind))
  path.forEach((p, k) => thick(k) && paint(out, p.x - across[k][0], p.y - across[k][1], lit))
  path.forEach((p, k) => paint(out, p.x, p.y, k > n - 2 ? light(c, 0.7) : thick(k) ? c : lit))
  if (n < 12) return
  VINE_LEAVES.forEach((u, j) => {
    const k = Math.round(u * n)
    const p = path[k]
    const q = path[Math.min(n, k + 3)]
    const s = j % 2 ? 1 : -1
    const ax = across[k][0] * s
    const ay = across[k][1] * s
    const tx = Math.sign(Math.round(q.x - p.x))
    const ty = Math.sign(Math.round(q.y - p.y))
    const reach = thick(k) ? 2 : 1
    paint(out, p.x + ax * reach, p.y + ay * reach, leaf)
    paint(out, p.x + ax * reach + tx, p.y + ay * reach + ty, leaf)
    paint(out, p.x + ax * (reach + 1) + tx, p.y + ay * (reach + 1) + ty, light(leaf, 0.35))
    paint(out, p.x + ax * (reach + 1) + tx * 2, p.y + ay * (reach + 1) + ty * 2, dark(leaf, 0.3))
  })
}

// A lean of `px` pixels at the top of the body, fading to nothing at its feet, for out.skew
function lean(g, px, dy = 0) {
  if (!px) return null
  const height = Math.max(1, g.bottom - g.top)
  return (y) => px * Math.min(1, Math.max(0, (g.bottom + dy - y) / height))
}

// How far row y of the sprite is moved sideways this frame
const shiftAt = (out, y) => out.dx + (out.skew ? Math.round(out.skew(y)) : 0)

// A glow hugging the sprite's outline, drawn behind it so only the rim shows
function halo(out, g, c, dx = 0, dy = 0) {
  for (let y = g.top - 1; y <= g.bottom + 1; y++) {
    for (let x = g.left - 1; x <= g.right + 1; x++) {
      if (g.solid(x, y)) continue
      if (g.solid(x - 1, y) || g.solid(x + 1, y) || g.solid(x, y - 1) || g.solid(x, y + 1)) back(out, x + dx, y + dy, c)
    }
  }
}

// A lit ball with a white glint, for seeds, orbs and motes
function orb(out, x, y, r, c, paint = dot) {
  if (r < 1) {
    plus(out, x, y, c, light(c, 0.6), paint)
    return
  }
  ball(out, x, y, r, c, paint)
  paint(out, x - Math.floor(r / 2), y - Math.floor(r / 2), WHITE)
}

const VINE_LASHES = [
  { sprout: 1, swing: 7, hit: 13, root: [1, 1], cock: [-6, -5], raise: [1, -7], aim: -2, big: false },
  { sprout: 13, swing: 21, hit: 27, root: [-1, 2], cock: [-8, -3], raise: [-1, -8], aim: 2, big: true },
]
const VINE_RECOIL = 3
const VINE_PULL = 5
const VINE_UP = -Math.PI / 2 - 0.6
const VINE_DOWN = 1.1

// Where a lash's tip is and which way it points as it sprouts, coils back, swings over
// onto the target, bounces off the crack, and pulls back in
function lashTip(t, lash, root, hit, side, top) {
  const gone = lash.hit + VINE_RECOIL + VINE_PULL
  if (t < lash.sprout || t >= gone) return null
  const [cx, cy] = top ? lash.cock : lash.raise
  const cock = pt(root.x + side * cx, Math.max(0, root.y + cy))
  if (t < lash.swing) {
    const f = easeOut(phase(t, lash.sprout, lash.swing - 1))
    const quiver = t >= lash.swing - 2 ? tremble(t) * 0.6 : 0
    return { tip: pt(lerp(root.x, cock.x, f) + quiver, lerp(root.y, cock.y, f)), angle: VINE_UP - f * 0.5 }
  }
  if (t <= lash.hit) {
    const s = phase(t, lash.swing, lash.hit) ** 1.7
    const over = pt(lerp(cock.x, hit.x, 0.4), Math.max(0, Math.min(cock.y, hit.y) - 5))
    return { tip: bend(cock, over, hit, s), angle: lerp(VINE_UP - 0.5, VINE_DOWN, s) }
  }
  const age = t - lash.hit
  const wob = Math.exp(-age * 0.45) * Math.sin(age * 1.6)
  const rest = pt(hit.x - side * wob * 2, hit.y - wob * 3.5)
  const f = easeInOut(phase(t, lash.hit + VINE_RECOIL, gone))
  return { tip: pt(lerp(rest.x, root.x, f), lerp(rest.y, root.y, f)), angle: lerp(VINE_DOWN + wob * 0.6, VINE_UP, f) }
}

// The vine's path from root to tip. It rises out of the root, arcs over, and comes into
// the tip along the way the tip points.
function lashPath(root, tip, angle, rise, side) {
  const len = Math.hypot(tip.x - root.x, tip.y - root.y)
  const lift = toward(rise, side)
  const end = toward(angle, side)
  const p1 = pt(root.x + lift.x * len * 0.45, Math.max(0, root.y + lift.y * len * 0.45))
  const p2 = pt(tip.x - end.x * len * 0.45, Math.max(0, tip.y - end.y * len * 0.45))
  return sample((u) => cubic([root, p1, p2, tip], u), len * 1.4)
}

// The crack of a whip, with a white starburst, a flash ring, and torn leaves tumbling off
function snap(out, age, x, y, c, big, seed) {
  if (age < 0 || age >= 12) return
  if (age === 0) {
    burst(out, x, y, big ? 5 : 4, light(c, 0.6))
    plus(out, x, y, WHITE)
  } else if (age === 1) {
    burst(out, x, y, big ? 7 : 5, light(c, 0.3))
    ring(out, x, y, big ? 3 : 2, WHITE)
  } else if (age < 4) spark(out, x, y, big ? 5 - age : 4 - age, light(c, 0.4))
  emit(age, { count: big ? 5 : 3, gap: 0, life: 12 }, (i, life) => {
    const angle = -Math.PI / 2 + (rnd(seed, i) - 0.5) * 2.8
    const speed = 0.6 + rnd(seed, i, 1) * 0.6
    const lx = x + Math.cos(angle) * speed * life + Math.sin(life * 0.8 + i) * 0.6
    const ly = y + Math.sin(angle) * speed * life + 0.06 * life * life
    const flat = (life + i) % 4 < 2
    const leaf = mix(c, 0xc8f060, 0.55)
    dot(out, lx, ly, leaf)
    dot(out, lx + (flat ? 1 : 0), ly + (flat ? 0 : 1), dark(leaf, 0.35))
  })
}

// Two leafy vines rise out of the mon (or out of its bulb), coil back, and lash over in
// turn, each cracking on the target with a white snap, the second one harder
function vinewhip(out, t, a, g, c) {
  const side = g.side
  const top = a.from === 'top' && g.crown
  const winding = VINE_LASHES.some(({ swing }) => t >= swing - 3 && t < swing)
  const throwing = VINE_LASHES.some(({ swing, hit }) => t >= swing + 2 && t <= hit)
  if (winding) {
    out.dx = -side
    out.skew = lean(g, -side)
  } else if (throwing) {
    out.dx = side
    out.skew = lean(g, side * 2)
  }
  if (top && winding) out.sy = 0.94
  const base = top ? pt(g.crown.x, g.crown.y + 1) : pt(g.mouth.x - side * 2, g.mouth.y)
  // The first lash draws last so it stays in front
  for (const lash of [...VINE_LASHES].reverse()) {
    const rootY = base.y + lash.root[1]
    const root = pt(base.x + shiftAt(out, rootY) + (top ? side * lash.root[0] : 0), rootY)
    const hit = pt(g.target.x, g.target.y + lash.aim)
    const state = lashTip(t, lash, root, hit, side, top)
    if (state) {
      // A faint ghost of the vine a tick ago blurs the fast part of the swing
      if (t > lash.swing + 2 && t <= lash.hit) {
        const prev = lashTip(t - 1, lash, root, hit, side, top)
        for (const p of lashPath(root, prev.tip, prev.angle, top ? -1.3 : -0.5, side)) dot(out, p.x, p.y, mix(c, 0x9fb8a0, 0.5))
      }
      vine(out, lashPath(root, state.tip, state.angle, top ? -1.3 : -0.5, side), c)
    }
    snap(out, t - lash.hit, hit.x, hit.y, c, lash.big, a.seed + lash.hit)
    if (t === lash.hit) out.shake = [side, lash.big ? 1 : 0]
    if (t === lash.hit + 1 && lash.big) out.shake = [-side, 0]
  }
}

const LEAF_FIRST = 5
const LEAF_COUNT = 9
const LEAF_GAP = 2
const LEAF_FLIGHT = 5
const LEAF_AIM = [-3, 3, -1, 4, -4, 1, -2, 2, 0]

// A leaf blade spinning in four frames, outlined so it reads against green mons
const BLADES = [
  ['.kkkkk.', 'kwllmdk', '.kkkkk.'],
  ['kk...', 'kwlk.', '.klmk', '..kdk', '...kk'],
  ['.k.', 'kwk', 'klk', 'kmk', 'kdk', '.k.'],
  ['...kk', '.klwk', 'kmlk.', 'kdk..', 'kk...'],
]

function blade(out, x, y, frame, c, side, paint = dot) {
  const art = BLADES[((Math.floor(frame) % 4) + 4) % 4]
  const palette = { k: dark(c, 0.62), l: light(c, 0.35), m: c, d: dark(c, 0.25), w: WHITE }
  stamp(out, x - (art[0].length - 1) / 2, y - (art.length - 1) / 2, art, palette, side < 0, paint)
}

// Where leaf i flies, out of the mouth on a curve that bows up or down into the target
function leafPath(i, g, a) {
  const from = pt(g.mouth.x, g.mouth.y + (i % 3) - 1)
  const to = pt(g.target.x + g.side * (rnd(a.seed, i, 3) - 0.5) * 3, g.target.y + LEAF_AIM[i % LEAF_AIM.length])
  const lift = (i % 2 ? 1 : -1) * (2 + rnd(a.seed, i, 5) * 2.5)
  const mid = pt((from.x + to.x) / 2, (from.y + to.y) / 2 + lift)
  return (f) => bend(from, mid, to, f)
}

// The mon crouches, then flicks out a volley of spinning leaf blades on curving paths
// that slice into the target, each cut flashing white as the leaf tumbles away
function razorleaf(out, t, a, g, c) {
  const side = g.side
  const launch = (t - LEAF_FIRST) % LEAF_GAP
  const volley = t >= LEAF_FIRST && t < LEAF_FIRST + LEAF_COUNT * LEAF_GAP
  if (t >= 1 && t < LEAF_FIRST) {
    out.dx = -side
    out.sy = 0.93
    out.sx = 1.04
    out.skew = lean(g, -side)
  } else if (volley && launch === 0) {
    out.dx = side
    out.skew = lean(g, side)
  }
  if (t >= 2 && t < LEAF_FIRST) plus(out, g.mouth.x - side, g.mouth.y, light(c, 0.3), t === LEAF_FIRST - 1 ? WHITE : c)
  if (volley && launch === 0) plus(out, g.mouth.x + shiftAt(out, g.mouth.y), g.mouth.y, light(c, 0.5), WHITE)

  emit(t, { count: LEAF_COUNT, gap: LEAF_GAP, start: LEAF_FIRST, life: LEAF_FLIGHT + 14 }, (i, age) => {
    const path = leafPath(i, g, a)
    if (age < LEAF_FLIGHT) {
      const f = age / LEAF_FLIGHT
      const p = path(f)
      const trail = path(Math.max(0, f - 0.3))
      dot(out, trail.x, trail.y, dark(c, 0.1))
      blade(out, p.x, p.y, age + i, c, side)
      return
    }
    const hit = path(1)
    const cut = age - LEAF_FLIGHT
    const dir = i % 2 ? 1 : -1
    if (cut === 0) {
      line(out, hit.x - 3 + 1, hit.y - 3 * dir, hit.x + 3 + 1, hit.y + 3 * dir, light(c, 0.5))
      line(out, hit.x - 3, hit.y - 3 * dir, hit.x + 3, hit.y + 3 * dir, WHITE)
      if (i >= LEAF_COUNT - 3) out.shake = [side, 0]
    } else if (cut === 1) line(out, hit.x - 2, hit.y - 2 * dir, hit.x + 2, hit.y + 2 * dir, light(c, 0.55))
    // What is left of the leaf tumbles down
    if (cut >= 1) {
      const x = hit.x - side * cut * 0.3 + Math.sin(cut * 0.7 + i) * 1.5
      const y = hit.y + cut * 0.4 + 0.02 * cut * cut
      const flat = (cut + i) % 4 < 2
      if (y < g.ground) {
        dot(out, x, y, light(c, 0.25))
        dot(out, x + (flat ? 1 : 0), y + (flat ? 0 : 1), dark(c, 0.2))
      }
    }
  })
}

const PETAL_COUNT = 12
const DANCE_END = 26
const PETAL_FLIGHT = 6
const PETAL_BURST = 44
const PETAL_TICKS = 56

const PETALS = [
  ['LP', 'PD'],
  ['LPP'],
  ['.L', 'PD', 'D.'],
  ['PL', 'D.'],
]

// A tumbling petal with a pale tip, a pink body and a deep pink edge
function petal(out, x, y, frame, c, paint = dot) {
  const palette = { L: light(c, 0.6), P: c, D: mix(c, 0xc0306a, 0.55) }
  stamp(out, x - 1, y - 1, PETALS[Math.floor(Math.abs(frame)) % PETALS.length], palette, false, paint)
}

const RING_SPIN = 0.4
const RING_FAST = 0.9

// How far the petal ring has turned by tick t. It spins faster once the dance ends.
const ringTurn = (t) => (t < DANCE_END ? t * RING_SPIN : DANCE_END * RING_SPIN + (t - DANCE_END) * RING_FAST)

// Petal i's angle on the ring
function petalAngle(i, t) {
  return ringTurn(t) + (i * Math.PI * 2) / PETAL_COUNT
}

// The tick petal i reaches the front of the ring after the dance and flies off
function petalLeaves(i, side) {
  const front = side > 0 ? 0 : Math.PI
  const left = (((front - petalAngle(i, DANCE_END)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  return DANCE_END + left / RING_FAST
}

// Where petal i rides the ring around the dancing mon
function petalOrbit(i, t, g) {
  const angle = petalAngle(i, t)
  const grow = easeOut(phase(t, 0, 8))
  return {
    x: g.cx + Math.cos(angle) * ((g.right - g.left) / 2 + 3) * grow,
    y: lerp(g.top, g.bottom, 0.55) + Math.sin(angle) * 2.5 - Math.sin(t * 0.6) * 0.8,
    front: Math.sin(angle) > 0,
  }
}

// The mon twirls back and forth and bobs inside a spinning ring of pink petals, which
// peel off the front one by one into a ribbon that whirls round the target and bursts
function petaldance(out, t, a, g, c) {
  const side = g.side
  if (t < DANCE_END) {
    const beat = t % 5
    const turn = Math.floor(t / 5)
    out.flipX = turn % 2 === 1
    out.dy = [0, -2, -2, -1, 0][beat]
    out.dx = turn % 2 ? side : 0
    // Sway one way and back on each beat, and blur the last facing on each turn
    out.skew = lean(g, Math.round(Math.sin((beat / 5) * Math.PI) * 2) * (turn % 2 ? 1 : -1), out.dy)
    if (beat === 0 && turn > 0) {
      const was = (turn - 1) % 2 === 1
      out.ghosts = [{ dx: was ? side : 0, dy: -1, flip: was, shade: (col) => mix(col, light(c, 0.3), 0.6) }]
    }
    if (beat === 4) {
      out.sy = 0.92
      out.sx = 1.06
    }
  } else if (t < DANCE_END + 6) {
    out.dx = side
    out.skew = lean(g, t < DANCE_END + 3 ? side * 2 : side)
  }
  const eye = pt(g.target.x, g.target.y - 1)

  for (let i = 0; i < PETAL_COUNT; i++) {
    const leave = petalLeaves(i, side)
    if (t < leave) {
      const o = petalOrbit(i, t, g)
      petal(out, o.x, o.y, (t >> 1) + i, o.front ? c : dark(c, 0.35), o.front ? dot : back)
      continue
    }
    const age = t - leave
    if (age < PETAL_FLIGHT) {
      const start = petalOrbit(i, leave, g)
      const f = age / PETAL_FLIGHT
      const p = pt(lerp(start.x, eye.x - side * 3, f), lerp(start.y, eye.y, f) + Math.sin(f * Math.PI * 2 + i) * 2)
      petal(out, p.x, p.y, age + i, c)
      continue
    }
    // Spin round the target, tightening, until the vortex bursts
    const spin = age - PETAL_FLIGHT
    const angle = Math.PI + spin * 0.75 + i * 0.9
    if (t < PETAL_BURST) {
      const r = lerp(5, 2.5, phase(spin, 0, 12))
      const front = Math.sin(angle) > 0
      petal(out, eye.x + Math.cos(angle) * r * side, eye.y + Math.sin(angle) * r * 0.7, t + i, front ? light(c, 0.15) : dark(c, 0.2))
      continue
    }
    const blown = t - PETAL_BURST
    const out0 = rnd(a.seed, i, 2) * Math.PI * 2
    const speed = 0.8 + rnd(a.seed, i, 3) * 0.7
    const x = eye.x + Math.cos(out0) * (2 + blown * speed) + Math.sin(blown * 0.6 + i) * 0.8
    const y = eye.y + Math.sin(out0) * (2 + blown * speed) * 0.6 + blown * blown * 0.05
    if (y < g.ground && rnd(a.seed, i, 4) > phase(t, PETAL_TICKS - 8, PETAL_TICKS - 1)) petal(out, x, y, (blown >> 1) + i, light(c, 0.1))
  }
  const burstAge = t - PETAL_BURST
  if (burstAge >= 0 && burstAge < 5) {
    if (burstAge === 0) disc(out, eye.x, eye.y, 2.5, WHITE)
    burst(out, eye.x, eye.y, 3 + burstAge * 1.5, burstAge < 2 ? light(c, 0.5) : c)
    if (burstAge < 2) out.shake = [burstAge ? -side : side, 0]
  }
}

const SEED_THROW = 6
const SEED_LAND = 15
const SEED_GRIP = 20
const SEED_SIPHON = 23
const SEED_WITHER = 42
const SEED_MOTES = 10
const SEED_GAP = 1.3
const SEED_LIFE = 9
const SEED_COLORS = { h: 0xf2d79a, m: 0xc08a48, d: 0x7a4e24, g: 0x8fd85a }
const SEED_FRAMES = [
  ['.g.', '.h.', 'hmd', 'mmd', '.d.'],
  ['..g.', '.hm.', 'hmmd', '.dd.'],
]
const LEECH_RED = 0xff4a5a

// Two tendrils twisting up out of the seed in a helix round the target. One call draws
// the far side of the turns in shadow, the other the near side in light.
function cage(out, base, height, radius, turn, c, near) {
  const lit = light(c, 0.35)
  const rind = dark(c, 0.45)
  const far = dark(c, 0.55)
  const leaf = mix(c, 0xc8f060, 0.5)
  for (let j = 0; j < 2; j++) {
    const steps = Math.ceil(height * 2)
    for (let k = 0; k <= steps; k++) {
      const climb = k / 2
      const angle = climb * 0.55 + turn + j * Math.PI
      const front = Math.cos(angle) > 0
      if (front !== near) continue
      const narrow = 1 - 0.3 * (climb / Math.max(1, height))
      const x = base.x + Math.sin(angle) * radius * narrow
      const y = base.y - climb
      if (k > steps - 2) {
        dot(out, x, y, front ? light(c, 0.7) : far)
        continue
      }
      dot(out, x + 1, y, front ? rind : far)
      dot(out, x, y, front ? (Math.sin(angle) < 0 ? lit : c) : mix(far, c, 0.25))
      if (front && k % 9 === 5) {
        const s = Math.sin(angle) < 0 ? -1 : 1
        dot(out, x + s * 2, y, leaf)
        dot(out, x + s * 3, y - 1, light(leaf, 0.3))
      }
    }
  }
}

// A seed lobbed in an arc sprouts tendrils that twist up round the target and squeeze,
// then red and green life flows back into the mon, which glows
function leechseed(out, t, a, g, c) {
  const side = g.side
  if (t >= 2 && t < SEED_THROW) {
    out.sy = 0.93
    out.sx = 1.04
    out.dx = -side
    out.skew = lean(g, -side)
  } else if (t >= SEED_THROW && t < SEED_THROW + 2) {
    out.dy = -1
    out.dx = side
    out.skew = lean(g, side * 2, -1)
  }
  const from = pt(g.mouth.x + shiftAt(out, g.mouth.y + out.dy), g.mouth.y)
  const plant = pt(g.target.x, g.ground - 1)
  const heart = pt(g.target.x, Math.min(g.target.y, g.ground - 5))

  if (t >= 3 && t < SEED_THROW) stamp(out, from.x - 1, from.y - 2, SEED_FRAMES[0], SEED_COLORS)
  if (t >= SEED_THROW && t < SEED_LAND) {
    const f = phase(t, SEED_THROW, SEED_LAND)
    const top = pt((from.x + plant.x) / 2, Math.max(1, Math.min(from.y, plant.y) - 7))
    const p = bend(from, top, plant, f)
    const q = bend(from, top, plant, Math.max(0, f - 0.12))
    dot(out, q.x, q.y, light(c, 0.3))
    stamp(out, p.x - 1, p.y - 2, SEED_FRAMES[Math.floor(t / 2) % 2], SEED_COLORS, side < 0)
  }
  const land = t - SEED_LAND
  if (land >= 0 && land < 5) {
    // A puff of dirt as the seed digs in
    for (let k = -3; k <= 3; k++) {
      const h = (3 - Math.abs(k)) * (land < 2 ? land + 1 : 4 - land) * 0.5
      if (h > 0) dot(out, plant.x + k * (1 + land * 0.3), plant.y - h, k % 2 ? SEED_COLORS.m : SEED_COLORS.d)
    }
    if (land < 2) plus(out, plant.x, plant.y - 1, light(c, 0.3), WHITE)
    if (land === 0) out.shake = [0, 1]
  }

  // The cage grows, squeezes in pulses while the drain runs, then withers
  if (t >= SEED_LAND + 1 && t < SEED_WITHER + 6) {
    const grow = easeOut(phase(t, SEED_LAND + 1, SEED_GRIP + 2))
    const wither = phase(t, SEED_WITHER, SEED_WITHER + 6)
    const squeeze = t >= SEED_GRIP && t < SEED_WITHER && (t - SEED_GRIP) % 4 < 2 ? 0.6 : 0
    const height = (plant.y - heart.y + 4) * grow * (1 - wither * 0.5)
    const radius = lerp(1.5, 4.5, grow) - squeeze - wither
    const col = mix(c, 0x8a7a3a, wither)
    cage(out, pt(plant.x, plant.y), height, radius, t * 0.12, col, false)
    if (t >= SEED_GRIP && t < SEED_WITHER) {
      const pulse = (t - SEED_GRIP) % 4 < 2
      plus(out, heart.x, heart.y, pulse ? LEECH_RED : dark(LEECH_RED, 0.3), pulse ? WHITE : light(LEECH_RED, 0.4))
    }
    cage(out, pt(plant.x, plant.y), height, radius, t * 0.12, col, true)
    dot(out, plant.x, plant.y, SEED_COLORS.d)
  }

  // Red and green motes flow back along arcing streams into the mon
  const home = pt(g.cx + out.dx, g.cy + out.dy)
  let glow = 0
  emit(t, { count: SEED_MOTES, gap: SEED_GAP, start: SEED_SIPHON, life: SEED_LIFE }, (i, age, f) => {
    const lift = (i % 2 ? -1 : 1) * (3 + (i % 3) * 2)
    const mid = pt((heart.x + home.x) / 2, (heart.y + home.y) / 2 + lift)
    const p = bend(heart, mid, home, easeIn(f))
    const col = i % 3 === 1 ? light(c, 0.2) : LEECH_RED
    const tail = bend(heart, mid, home, easeIn(Math.max(0, f - 0.12)))
    dot(out, tail.x, tail.y, dark(col, 0.3))
    plus(out, p.x, p.y, col, WHITE)
    if (age === SEED_LIFE - 1) glow = 1
  })
  const lastIn = SEED_SIPHON + (SEED_MOTES - 1) * SEED_GAP + SEED_LIFE
  if (t >= SEED_SIPHON + SEED_LIFE - 1 && t < lastIn + 4) {
    const fade = 1 - phase(t, lastIn, lastIn + 4)
    out.shade = tint(light(c, 0.6), (t % 4 < 2 ? 0.22 : 0.1) * fade + glow * 0.1)
    if (fade > 0.3) halo(out, g, t % 4 < 2 || glow ? light(c, 0.4) : c, out.dx, out.dy)
  }
  if (t >= lastIn - 2 && t < lastIn + 6) {
    for (let k = 0; k < 3; k++) {
      const x = g.left + rnd(a.seed, k, t >> 1) * (g.right - g.left)
      const y = g.top + rnd(a.seed, k + 5, t >> 1) * (g.bottom - g.top)
      if ((t + k) % 3) spark(out, x, y, 1, light(c, 0.4))
    }
  }
}

const DRAIN_FIRST = 6
const DRAIN_LIFE = 11

// A glowing blob of life on the target, a dithered halo round a bright core
function aura(out, x, y, r, c, t) {
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const d = Math.hypot(px - x, py - y) / r
      if (d > 1 || (d > 0.6 && (px + py + t) % 2)) continue
      dot(out, px, py, d < 0.35 ? light(c, 0.75) : d < 0.6 ? light(c, 0.3) : dark(c, 0.3))
    }
  }
}

// The mon leans back and pulls glowing orbs out of a blob of life on the target. They
// race along curving streams into it, and each lands with a flash of light.
function drain(out, t, a, g, c) {
  const side = g.side
  const big = a.power >= 2
  const count = big ? 14 : 8
  const gap = big ? 1.5 : 2.5
  const streams = big ? 3 : 2
  const lastIn = DRAIN_FIRST + (count - 1) * gap + DRAIN_LIFE
  const pulling = t >= 3 && t < lastIn
  if (pulling) {
    out.dx = -side + (t % 4 === 0 ? side : 0)
    out.skew = lean(g, -side)
  }
  const from = pt(g.target.x, g.target.y - 1)
  const home = pt(g.cx + out.dx, g.cy)

  // The blob shrinks as it is drained
  const left = 1 - phase(t, DRAIN_FIRST, lastIn)
  if (t >= 1 && left > 0) aura(out, from.x, from.y, (big ? 4.5 : 3.5) * easeOut(phase(t, 1, 5)) * (0.4 + 0.6 * left), c, t)

  // The streams flow toward the mon in moving dashes while orbs ride them
  const path = (k, u) => {
    const lift = big ? (k - 1) * 6 : k ? 4 : -4
    return bend(from, pt((from.x + home.x) / 2, (from.y + home.y) / 2 + lift), home, u)
  }
  if (t >= DRAIN_FIRST && t < lastIn) {
    for (let k = 0; k < streams; k++) {
      for (let u = (t * 0.04) % 0.12; u < 1; u += 0.12) {
        const p = path(k, u)
        dot(out, p.x, p.y, dark(c, 0.45))
      }
    }
  }
  let flash = 0
  emit(t, { count, gap, start: DRAIN_FIRST, life: DRAIN_LIFE + 2 }, (i, age) => {
    if (age >= DRAIN_LIFE) {
      flash = Math.max(flash, age - DRAIN_LIFE < 1 ? 1 : 0.35)
      return
    }
    const k = i % streams
    const at = (u) => path(k, easeIn(u))
    const f = age / DRAIN_LIFE
    for (let j = 3; j >= 1; j--) {
      const p = at(Math.max(0, f - j * 0.06))
      dot(out, p.x, p.y, j === 3 ? dark(c, 0.3) : j === 2 ? c : light(c, 0.4))
    }
    const p = at(f)
    orb(out, p.x, p.y, age < 1 ? 0.5 : big ? 1.5 : 0.9, c)
  })
  if (flash > 0) {
    out.shade = tint(light(c, 0.6), flash * (big ? 0.16 : 0.13))
    halo(out, g, flash >= 1 ? light(c, 0.45) : c, out.dx)
  }

  // A last glow and sparkles as the life settles in
  const after = t - lastIn
  if (after >= 0 && after < 8) {
    if (after < 4 && !flash) {
      out.shade = tint(light(c, 0.6), 0.2 * (1 - after / 4))
      if (after < 3) halo(out, g, after ? c : light(c, 0.45), out.dx)
    }
    for (let k = 0; k < (big ? 5 : 3); k++) {
      if ((t + k) % 3 === 0) continue
      const x = g.left + rnd(a.seed, k, t >> 1) * (g.right - g.left) + out.dx
      const y = g.top + rnd(a.seed, k + 9, t >> 1) * (g.bottom - g.top) - after * 0.3
      spark(out, x, y, (t + k) % 3 === 1 ? 1 : 0, light(c, 0.3))
    }
  }
}

const LEECH_WIND = 4
const LEECH_BITE = 8
const LEECH_BACK = 15
const LEECH_SIP = LEECH_BITE + 4
const LEECH_MOTES = 10
const LEECH_GAP = 1.6
const LEECH_LIFE = 11
const FANGS = ['rrrrr', 'ws.ws', 'ws.ws', 'w..w.']

// How far forward the lunge has carried the mon at tick t
function leechDash(t, far) {
  if (t < LEECH_WIND) return t < 1 ? 0 : -1
  if (t < LEECH_BITE) return Math.round(lerp(-1, far, (t - LEECH_WIND + 1) / (LEECH_BITE - LEECH_WIND)))
  if (t < LEECH_BITE + 2) return far
  return Math.round(far * (1 - easeOut(phase(t, LEECH_BITE + 2, LEECH_BACK))))
}

// A quick lunge and a bite with snapping fangs, then red life drips back from the
// wound in a wavering stream into the mon, which flushes red with each sip
function leechlife(out, t, a, g, c) {
  const side = g.side
  const far = Math.max(2, Math.min(g.reach - 4, 6))
  const dash = leechDash(t, far)
  out.dx = side * dash
  if (t >= LEECH_WIND && t < LEECH_BITE) {
    out.ghosts = [1, 2].map((k) => ghost(side * leechDash(t - k, far), 0, light(c, 0.2 + 0.2 * k), 0.4 + 0.2 * k))
  }
  if (t >= 1 && t < LEECH_WIND) out.skew = lean(g, -side)
  else if (t >= LEECH_WIND && t < LEECH_BITE + 2) out.skew = lean(g, side * 2)
  if (t >= LEECH_BITE && t < LEECH_BITE + 2) {
    out.sx = 0.9
    out.sy = 1.06
  }
  if (t >= LEECH_BITE + 2 && t < LEECH_BACK) out.dy = -Math.round(Math.sin(phase(t, LEECH_BITE + 2, LEECH_BACK) * Math.PI))
  const bite = pt(g.mouth.x + side * (far + 2), g.mouth.y + 1)

  // The jaws snap shut over the bite, then a red flash bursts
  const jaw = t - (LEECH_BITE - 3)
  if (jaw >= 0 && jaw < 6) {
    const gape = [5, 3, 1, 0, 0, 1][jaw]
    const palette = { w: WHITE, s: 0xc8c8d8, r: dark(c, 0.3) }
    stamp(out, bite.x - 2, bite.y - gape - 4, FANGS, palette)
    stamp(out, bite.x - 2, bite.y + gape + 1, [...FANGS].reverse(), palette)
  }
  const hit = t - LEECH_BITE
  if (hit >= 0 && hit < 5) {
    if (hit < 2) disc(out, bite.x, bite.y, 1.5 - hit * 0.5, WHITE)
    burst(out, bite.x, bite.y, hit < 2 ? 3 + hit : 5 - hit, hit < 1 ? light(c, 0.5) : c)
    if (hit === 0) out.shake = [side, 0]
  }

  // Drops of life wind back from the wound to the mon's middle
  const home = pt(g.cx + out.dx, g.cy + out.dy)
  let sip = 0
  emit(t, { count: LEECH_MOTES, gap: LEECH_GAP, start: LEECH_SIP, life: LEECH_LIFE + 2 }, (i, age, f) => {
    if (age >= LEECH_LIFE) {
      sip = Math.max(sip, age - LEECH_LIFE < 1 ? 1 : 0.4)
      return
    }
    const u = easeIn(age / LEECH_LIFE)
    const x = lerp(bite.x, home.x, u)
    const y = lerp(bite.y, home.y, u) + Math.sin(u * Math.PI * 2 + i * 0.9) * 2.5 * (1 - u)
    dot(out, x - side, y, dark(c, 0.4))
    orb(out, x, y, i % 3 === 2 ? 0.5 : 0.9, i % 3 === 2 ? light(c, 0.3) : c)
  })
  const lastIn = LEECH_SIP + (LEECH_MOTES - 1) * LEECH_GAP + LEECH_LIFE
  if (t >= LEECH_SIP + LEECH_LIFE && t < Math.min(lastIn + 6, a.ticks - 1)) {
    const fade = 1 - phase(t, lastIn, lastIn + 6)
    out.shade = tint(c, (0.1 + 0.15 * sip) * fade)
    if (fade > 0.3) halo(out, g, sip >= 1 ? light(c, 0.35) : dark(c, 0.15), out.dx, out.dy)
  }
  // A few bright drops rise off the mon as it recovers
  if (t >= lastIn - 4 && t < a.ticks - 1) {
    const age = t - (lastIn - 4)
    for (let k = 0; k < 3; k++) {
      const x = g.cx + out.dx + (rnd(a.seed, k, 3) - 0.5) * (g.right - g.left)
      const y = g.top + 2 + rnd(a.seed, k, 4) * 4 - age * 0.5
      if ((age + k) % 4 !== 3) plus(out, x, y, c, light(c, 0.6))
    }
  }
}

const DUST_COUNT = 60
const DUST_PUFF = 7
const DUST_DRIFT = [13, 30]
const DUST_SETTLE = 29

// Where a mote of dust is. It puffs out of the source and slows, rides the cloud to the
// target, then sinks and spreads over it, jittering in the air.
function dustAt(i, t, a, src, dest, g, up) {
  const born = DUST_PUFF + rnd(a.seed, i, 1) * 4
  const age = t - born
  if (age < 0) return null
  const angle = (up ? -Math.PI / 2 + 0.5 : -0.3) + (rnd(a.seed, i, 2) - 0.5) * (up ? 2.8 : 2.2)
  const speed = 0.6 + rnd(a.seed, i, 3) * 1.6
  const puffed = (1 - Math.exp(-age * 0.35)) / 0.35
  const ox = Math.cos(angle) * g.side * speed * puffed
  const oy = Math.sin(angle) * speed * puffed * (up ? 0.5 : 0.8)
  const carry = easeInOut(phase(t, DUST_DRIFT[0] + rnd(a.seed, i, 4) * 3, DUST_DRIFT[1]))
  const widen = 1 + carry * 0.7
  const sink = Math.max(0, t - DUST_SETTLE - rnd(a.seed, i, 5) * 4)
  const x = lerp(src.x, dest.x, carry) + ox * widen + Math.sin(t * 0.4 + i * 1.7) * 0.8 + sink * (rnd(a.seed, i, 6) - 0.5) * 0.4
  const y = lerp(src.y, dest.y, carry) + oy * widen + Math.cos(t * 0.33 + i * 2.3) * 0.6 + sink * (0.15 + rnd(a.seed, i, 7) * 0.2)
  return pt(x, Math.min(g.ground, y))
}

// The mon shudders and a cloud of fine spores puffs out of it (or out of its bulb),
// drifts over to the target and sinks over it in a shimmering, twinkling haze
function powder(out, t, a, g, c) {
  const side = g.side
  const top = a.from === 'top' && g.crown
  if (t >= 1 && t < DUST_PUFF - 1) out.skew = lean(g, tremble(t) * 2)
  if (t === DUST_PUFF - 1) {
    out.sy = 0.9
    out.sx = 1.06
  } else if (t === DUST_PUFF || t === DUST_PUFF + 1) {
    out.sy = 1.05
    out.sx = 0.97
  }
  const src = top ? pt(g.crown.x, g.crown.y + 1) : pt(g.mouth.x, g.mouth.y)
  const dest = pt(g.target.x - side, g.target.y - 2)
  const tones = [light(c, 0.5), light(c, 0.2), c, dark(c, 0.3)]

  // The first soft poof out of the source
  const poof = t - DUST_PUFF
  if (poof >= 0 && poof < 4) {
    const r = 1 + poof
    puff(out, src.x + side * poof * 0.8, src.y - (top ? poof * 0.4 : 0), r, light(c, 0.2 + poof * 0.1), a.seed + poof)
  }

  const motes = []
  for (let i = 0; i < DUST_COUNT; i++) {
    if (t > a.ticks - 12 && rnd(a.seed, i, 8) < phase(t, a.ticks - 12, a.ticks - 1)) continue
    const p = dustAt(i, t, a, src, dest, g, top)
    if (!p) continue
    motes.push(p)
    // Each mote shimmers between two neighboring tones
    const tone = Math.floor(rnd(a.seed, i, 9) * 3) + ((t + i * 3) % 7 < 2 ? 1 : 0)
    const paint = rnd(a.seed, i, 10) < 0.3 && t < DUST_DRIFT[0] + 3 ? back : dot
    paint(out, p.x, p.y, tones[tone])
  }

  // Twinkles on motes of the settling haze
  if (t >= DUST_SETTLE - 6 && t < a.ticks - 5) {
    for (let k = 0; k < 3; k++) {
      const beat = Math.floor((t + k * 2) / 4)
      const p = motes[Math.floor(rnd(a.seed, k, beat) * motes.length)]
      if (!p) continue
      if ((t + k * 2) % 4 === 1) spark(out, p.x, p.y, 1, light(c, 0.4))
      else if ((t + k * 2) % 4 === 2) dot(out, p.x, p.y, WHITE)
    }
  }
}

const SILK_FIRE = 5
const SILK_FAN = [[1, -7], [3, -3], [3, 2], [1, 6]]
const SILK_WRAP = 12
const SILK_DONE = 24
const SILK_SNAP = 31
const SILK_GREY = 0x8a8aa0

// A silk thread from p to q that sags in the middle, a white core over a grey shadow,
// drawn up to a fraction of its length
function thread(out, p, q, sag, c, upTo = 1) {
  const mid = pt((p.x + q.x) / 2, (p.y + q.y) / 2 + sag)
  const len = Math.hypot(q.x - p.x, q.y - p.y)
  const path = sample((u) => bend(p, mid, q, u * upTo), len * upTo)
  path.forEach((s) => dot(out, s.x, s.y + 1, dark(SILK_GREY, 0.1)))
  path.forEach((s) => dot(out, s.x, s.y, c))
}

// The cocoon round the target, a pale oval with a grey rim and a lit top, wound with
// diagonal silk bands that slide while it is wrapped
function cocoon(out, x, y, size, wind, c) {
  const rx = 1.5 + 2 * size
  const ry = 2 + 3 * size
  const inside = (px, py) => (px / (rx + 0.3)) ** 2 + (py / (ry + 0.3)) ** 2 <= 1
  for (let py = -Math.ceil(ry); py <= Math.ceil(ry); py++) {
    for (let px = -Math.ceil(rx); px <= Math.ceil(rx); px++) {
      if (!inside(px, py)) continue
      const rim = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1)
      const band = (((py * 2 + px + Math.floor(wind)) % 4) + 4) % 4 === 0
      const col = rim ? SILK_GREY : band ? mix(c, SILK_GREY, 0.45) : px + py < -1 ? WHITE : mix(c, 0xd8d8e4, 0.5)
      dot(out, x + px, y + py, col)
    }
  }
}

// The mon rears back and spits a fan of sticky threads that catch the target, then
// reels it into a silk cocoon that struggles until the threads snap
function stringshot(out, t, a, g, c) {
  const side = g.side
  if (t >= 1 && t < SILK_FIRE) {
    out.dx = -side
    out.dy = -1
    out.skew = lean(g, -side, -1)
  } else if (t >= SILK_FIRE && t < SILK_FIRE + SILK_FAN.length + 2) {
    out.dx = (t - SILK_FIRE) % 2 ? 0 : side
    out.skew = lean(g, side)
  } else if (t >= SILK_WRAP && t < SILK_SNAP) {
    // Reeling the cocoon in, the mon heaves back in pulls
    out.dx = t % 6 < 3 ? -side : 0
    out.skew = lean(g, t % 6 < 3 ? -side : 0)
  }
  const from = pt(g.mouth.x + shiftAt(out, g.mouth.y + out.dy), g.mouth.y + out.dy)
  const hold = pt(g.target.x, g.target.y - 1)
  const struggle = t >= SILK_DONE ? Math.round(Math.sin((t - SILK_DONE) * 1.3) * 1.2) : 0
  const core = pt(hold.x + struggle, hold.y)
  const wrap = easeInOut(phase(t, SILK_WRAP, SILK_DONE))

  if (t >= SILK_FIRE && t < SILK_SNAP) {
    SILK_FAN.forEach(([ax, ay], j) => {
      const shot = t - SILK_FIRE - j
      if (shot < 0) return
      const reach = Math.min(1, (shot + 1) / 3)
      const anchor = pt(hold.x + side * ax, hold.y + ay)
      const end = pt(lerp(anchor.x, core.x - side * (2 + Math.abs(ay) * 0.15), wrap), lerp(anchor.y, core.y + ay * 0.4, wrap))
      const sag = t >= SILK_DONE ? 1.5 + (t - SILK_DONE) * 0.3 : 0.5
      thread(out, from, end, sag, c, reach)
      if (reach < 1) {
        const tip = bend(from, pt((from.x + end.x) / 2, (from.y + end.y) / 2 + sag), end, reach)
        plus(out, tip.x, tip.y, mix(c, SILK_GREY, 0.3), WHITE)
      } else if (wrap < 0.3) disc(out, end.x, end.y, 1, WHITE)
    })
  }
  if (t >= SILK_WRAP) {
    const fade = phase(t, a.ticks - 5, a.ticks - 1)
    if (fade < 1) cocoon(out, core.x, core.y, wrap, t < SILK_DONE ? t * 1.5 : SILK_DONE * 1.5, fade > 0 ? mix(c, SILK_GREY, fade) : c)
  }
  // The threads snap in the middle and the loose ends whip away
  const snapAge = t - SILK_SNAP
  if (snapAge >= 0 && snapAge < 6) {
    for (let k = 0; k < 4; k++) {
      const x = lerp(from.x, core.x, 0.3 + k * 0.13) + side * snapAge * (k % 2 ? 0.6 : -0.6)
      const y = lerp(from.y, core.y, 0.3 + k * 0.13) + snapAge * 0.7 + (k - 1.5) * 1.5
      if ((snapAge + k) % 2 === 0) spark(out, x, y, snapAge < 2 ? 1 : 0, mix(c, SILK_GREY, 0.3))
      else dot(out, x, y, mix(c, SILK_GREY, 0.5))
    }
    if (snapAge === 0) out.shake = [side, 0]
  }
}

const TAU = Math.PI * 2
const SUN = 0xffe066
const BARK = 0x7a5230

// A pointed leaf centered on x, y, `len` pixels from its middle to each tip along
// angle and `wid` at its widest. Bigger leaves get a dark rim and a pale midrib.
function leaf(out, x, y, angle, len, wid, c, rim = dark(c, 0.55), paint = dot) {
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const inside = (px, py) => {
    const u = px * ca + py * sa
    const v = -px * sa + py * ca
    return Math.abs(u) <= len && Math.abs(v) <= wid * (1 - (u / len) ** 2) + 0.35
  }
  const r = Math.ceil(len) + 1
  const ox = Math.round(x)
  const oy = Math.round(y)
  for (let py = -r; py <= r; py++) {
    for (let px = -r; px <= r; px++) {
      if (!inside(px, py)) continue
      const edge = len >= 2.5 && (!inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1))
      const v = -px * sa + py * ca
      paint(out, ox + px, oy + py, edge ? rim : Math.abs(v) < 0.5 ? light(c, 0.45) : v < 0 ? light(c, 0.15) : c)
    }
  }
}

// The middle of the sprite's top row, where a sprout or a horn can sit
function crownAt(g) {
  let sum = 0
  let n = 0
  for (let x = g.left; x <= g.right; x++) {
    if (g.solid(x, g.top)) {
      sum += x
      n++
    }
  }
  return pt(n ? Math.round(sum / n) : g.cx, g.top)
}

const GIGA_DIG = 3
const GIGA_LATCH = 14
const GIGA_PULL = 15
const GIGA_FULL = 40
const GIGA_BLOOM = 42
const GIGA_TICKS = 54

// Root k's path: out of the ground in front of the feet, along the soil, and up out of
// the ground into the target, the three roots fanning over it
function gigaRoot(g, k) {
  const side = g.side
  const fan = k - 1
  const foot = pt(g.frontAt(g.bottom) - side * 2, g.ground)
  const end = pt(g.target.x + side * fan * 2, g.target.y + fan * 2)
  const p1 = pt(lerp(foot.x, end.x, 0.4), g.ground - (k % 2))
  const p2 = pt(end.x - side * (3 + fan), g.ground)
  const len = Math.abs(end.x - foot.x) + (g.ground - end.y)
  return sample((u) => cubic([foot, p1, p2, end], u), len)
}

// Three roots burrow under the ground and burst up into the target, then pump its life
// home in bright pulses while rings of it are sucked inward, and the mon swells and blooms
function gigadrain(out, t, a, g, c) {
  const side = g.side
  const rind = dark(c, 0.55)
  const core = dark(c, 0.15)
  const pull = phase(t, GIGA_PULL, GIGA_FULL)
  const draining = t >= GIGA_PULL && t < GIGA_FULL
  if (t >= 1 && t < GIGA_DIG + 2) {
    out.sy = 0.94
    out.sx = 1.04
    if (t === GIGA_DIG) out.shake = [0, 1]
  } else if (draining) {
    const tug = (t - GIGA_PULL) % 5 < 2
    out.dx = tug ? -side : 0
    out.skew = lean(g, -side * (tug ? 2 : 1))
    out.sx = 1 + 0.06 * pull
    out.sy = 1 + 0.06 * pull
  } else if (t >= GIGA_FULL && t < GIGA_TICKS - 1) {
    const swell = 1 - easeInOut(phase(t, GIGA_BLOOM + 2, GIGA_TICKS - 2))
    out.sx = 1 + 0.06 * swell
    out.sy = 1 + 0.06 * swell
  }

  const grow = easeOut(phase(t, GIGA_DIG, GIGA_LATCH)) * (1 - easeIn(phase(t, GIGA_FULL, GIGA_FULL + 8)))
  for (let k = 0; k < 3; k++) {
    const path = gigaRoot(g, k)
    const n = Math.floor((path.length - 1) * grow)
    for (let j = 0; j <= n; j++) dot(out, path[j].x, path[j].y, rind)
    for (let j = 0; j <= n; j++) dot(out, path[j].x, path[j].y - 1, j > n - 2 ? light(c, 0.5) : core)
    // Dirt kicks up where the growing tip runs along the soil
    if (t < GIGA_LATCH && n > 0 && path[n].y >= g.ground - 1 && (t + k) % 2) dot(out, path[n].x + side, g.ground - 2, BARK)
    if (!draining) continue
    // Pulses run back down each root from the target to the mon
    for (let b = 0; b < 3; b++) {
      const u = 1 - ((((t - GIGA_PULL) * 0.07 + b / 3 + k * 0.11) % 1) + 1) % 1
      const p = path[Math.round(u * (path.length - 1))]
      plus(out, p.x, p.y - 1, light(c, 0.3), WHITE)
    }
  }

  // Rings of life collapse into the target as it is drained
  if (draining) {
    const age = (t - GIGA_PULL) % 4
    const r = 6 - age * 1.4
    ring(out, g.target.x, g.target.y, r, age < 2 ? light(c, 0.35) : c)
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU + t * 0.2
      const d = 7 - ((t * 0.9 + i * 1.3) % 7)
      dot(out, g.target.x + Math.cos(ang) * d, g.target.y + Math.sin(ang) * d * 0.8, d < 2 ? WHITE : light(c, 0.2))
    }
    out.shade = tint(light(c, 0.55), 0.1 + 0.18 * pull + ((t - GIGA_PULL) % 5 === 0 ? 0.1 : 0))
  }

  // The swollen mon blooms: a flash, a ring of light, and leaves flung up off it
  const bloom = t - GIGA_BLOOM
  if (bloom >= -2 && bloom < 0) halo(out, g, light(c, 0.3), out.dx)
  if (bloom >= 0 && bloom < 10) {
    if (bloom < 2) out.shade = tint(light(c, 0.7), 0.35 - bloom * 0.12)
    else if (bloom < 6) out.shade = tint(light(c, 0.55), 0.25 * (1 - bloom / 6))
    if (bloom < 3) halo(out, g, bloom ? c : WHITE, out.dx)
    if (bloom < 4) ring(out, g.cx, g.cy, (g.right - g.left) / 2 + bloom, bloom < 2 ? WHITE : light(c, 0.3))
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + (i - 2.5) * 0.45
      const d = 2 + bloom * 1.1
      const x = g.cx + Math.cos(ang) * ((g.right - g.left) / 2 + d)
      const y = g.top + 2 + Math.sin(ang) * d + bloom * bloom * 0.06
      if (y > 0 && (bloom < 7 || (t + i) % 2)) leaf(out, x, y, ang + bloom * 0.4, 1.6, 0.8, light(c, 0.15))
    }
  }
}

const SYN_SUN = 2
const SYN_BEAM = 9
const SYN_FILL = [13, 36]
const SYN_BLOOM = 40
const SYN_TICKS = 54

// Where the sun hangs: high on the mon's far side, inside the strip
function sunAt(g) {
  const off = (g.right - g.left) / 2 + 5
  const far = Math.round(g.cx - g.side * off)
  const x = far >= 4 && far <= g.columns - 5 ? far : Math.round(g.cx + g.side * off)
  return pt(Math.max(4, Math.min(g.columns - 5, x)), 4)
}

// The outermost solid pixels of row y, or the box edges if the row is empty
function rowEdges(g, y) {
  let lo = g.right
  let hi = g.left
  for (let x = g.left; x <= g.right; x++) {
    if (!g.solid(x, y)) continue
    lo = Math.min(lo, x)
    hi = Math.max(hi, x)
  }
  return lo > hi ? [g.left, g.right] : [lo, hi]
}

// A sun with turning rays, a hot white core and an orange rim
function sun(out, x, y, r, t) {
  if (r <= 0) return
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * TAU + t * 0.12
    const len = k % 2 ? 1.2 : 2.2
    for (let d = r + 1; d <= r + len + 0.5; d++) dot(out, x + Math.cos(ang) * d, y + Math.sin(ang) * d, k % 2 ? 0xffb030 : SUN)
  }
  disc(out, x, y, r, 0xffb030)
  disc(out, x, y, r - 0.8, SUN)
  if (r > 1.5) plus(out, x - 0.5, y - 0.5, light(SUN, 0.6), WHITE)
}

// A sun rises behind the mon and pours shafts of light onto it. The mon basks, stretching
// up as green light fills it from the head down, then it unfurls a pair of fresh leaves.
function synthesis(out, t, a, g, c) {
  const s = sunAt(g)
  const r = 2.6 * easeOut(phase(t, SYN_SUN, SYN_SUN + 6)) * (1 - phase(t, SYN_BLOOM + 4, SYN_TICKS - 3))
  sun(out, s.x, s.y, r, t)
  const bask = phase(t, SYN_FILL[0] - 2, SYN_FILL[0] + 2) * (1 - easeInOut(phase(t, SYN_BLOOM + 2, SYN_TICKS - 3)))
  out.dy = -Math.round(bask)
  out.sy = 1 + 0.04 * bask

  // Shafts of light, their dashes streaming toward the mon, carrying bright motes
  const aims = [pt(g.left + 1, g.top + 2), pt(g.cx, g.top), pt(g.right - 1, g.top + 2)]
  const beams = phase(t, SYN_BEAM - 2, SYN_BEAM) * (1 - phase(t, SYN_BLOOM - 2, SYN_BLOOM + 2))
  if (beams > 0) {
    for (const [k, p] of aims.entries()) {
      const len = Math.hypot(p.x - s.x, p.y - s.y)
      for (let d = r + 3; d < len; d++) {
        if ((((d - t * 0.8 + k) % 4) + 4) % 4 >= 2 || (beams < 1 && d / len > beams)) continue
        dot(out, lerp(s.x, p.x, d / len), lerp(s.y, p.y, d / len), d % 2 ? light(SUN, 0.4) : SUN)
      }
    }
  }
  emit(t, { count: 14, gap: 1.6, start: SYN_BEAM, life: 6 }, (i, age, f) => {
    const p = aims[i % 3]
    plus(out, lerp(s.x, p.x, easeIn(f)), lerp(s.y, p.y, easeIn(f)), SUN, WHITE)
  })

  // The light fills the body from the head down, a bright line leading it
  const fill = lerp(g.top - 1, g.bottom + 2, easeInOut(phase(t, ...SYN_FILL)))
  const settle = 1 - phase(t, SYN_BLOOM + 2, SYN_TICKS - 3)
  if (t >= SYN_FILL[0] && settle > 0) {
    const pulse = 0.08 * Math.sin(t * 0.7)
    const flash = t >= SYN_BLOOM && t < SYN_BLOOM + 2
    out.shade = (x, y, col) => {
      if (luma(col) < 60) return col
      if (flash) return mix(col, light(c, 0.6), 0.5)
      const at = y - out.dy
      if (Math.abs(at - fill) < 1.2) return mix(col, light(SUN, 0.3), 0.7)
      return at < fill ? mix(col, light(c, 0.2), (0.22 + pulse) * settle) : col
    }
  }

  // Fresh leaves unfurl on both shoulders and twinkle
  const bloom = t - SYN_BLOOM
  if (bloom >= 0 && t < SYN_TICKS - 2) {
    const len = 1 + 2 * easeOut(phase(bloom, 0, 5))
    const fade = phase(t, SYN_TICKS - 8, SYN_TICKS - 2)
    const row = g.top + Math.round((g.bottom - g.top) * 0.3)
    const [lo, hi] = rowEdges(g, row)
    for (const d of [-1, 1]) {
      const x = d < 0 ? lo : hi
      const y = row + out.dy - len * 0.6
      if (fade < 0.6 || t % 2) leaf(out, x + d * len * 0.7, y, d < 0 ? -Math.PI + 0.7 : -0.7, len, len * 0.45, c)
    }
    if (bloom < 8) sparkles(out, t, a.seed, g.cx, g.top + 4, g.right - g.left + 6, 8, light(c, 0.3), 4)
  }
}

const ROOT_DIG = 6
const ROOT_SPREAD = [7, 20]
const ROOT_FEED = 20
const ROOT_SPROUT = 34
const ROOT_FADE = 42
const INGRAIN_TICKS = 52
const ROOT_COUNT = 6

// Root k: from under the feet it wanders out along the soil to one side
function rootPath(g, a, k) {
  const dir = k % 2 ? 1 : -1
  const half = (g.right - g.left) / 2
  const x0 = g.cx + dir * half * (0.15 + 0.25 * (k >> 1))
  const len = half * 0.6 + 4 + rnd(a.seed, k, 1) * 5
  return Array.from({ length: Math.ceil(len) + 1 }, (_, s) => {
    const wave = Math.sin(s * 0.8 + k * 1.7) > 0.2 ? 1 : 0
    return pt(x0 + dir * s, g.ground - wave)
  })
}

// The mon digs in its heels and roots spread out through the soil around its feet. Sap
// runs back up them into the mon, and a little sprout pops up on its head.
function ingrain(out, t, a, g, c) {
  const wood = mix(c, BARK, 0.7)
  if (t >= 1 && t < ROOT_DIG) {
    out.sy = 1 - 0.07 * phase(t, 1, ROOT_DIG - 1)
    out.sx = 1 + 0.05 * phase(t, 1, ROOT_DIG - 1)
    out.skew = lean(g, tremble(t))
  } else if (t >= ROOT_DIG && t < ROOT_DIG + 6) {
    out.sy = 1 - 0.07 * (1 - easeOut(phase(t, ROOT_DIG, ROOT_DIG + 6)))
    if (t === ROOT_DIG) out.shake = [0, 1]
  }
  const fade = phase(t, ROOT_FADE, INGRAIN_TICKS - 2)
  const half = (g.right - g.left) / 2
  let fed = 0
  for (let k = 0; k < ROOT_COUNT; k++) {
    const path = rootPath(g, a, k)
    const grow = easeOut(phase(t, ROOT_SPREAD[0] + k, ROOT_SPREAD[1] + k))
    const n = Math.floor((path.length - 1) * grow)
    for (let j = 0; j <= n; j++) {
      if (fade > 0 && rnd(a.seed, k * 40 + j, 2) < fade) continue
      const p = path[j]
      const paint = Math.abs(p.x - g.cx) < half ? back : dot
      paint(out, p.x, p.y, j >= n - 1 ? light(c, 0.2) : wood)
      // Rootlets fork off every few pixels
      if (j % 3 === 2 && j < n - 1) paint(out, p.x, p.y === g.ground ? p.y - 1 : p.y + 1, dark(wood, 0.3))
    }
    if (t < ROOT_FEED || t >= ROOT_SPROUT + 2 || n < 2) continue
    const u = 1 - phase(t, ROOT_FEED + k * 1.5, ROOT_FEED + k * 1.5 + 8)
    if (u <= 0 || u >= 1) {
      if (u <= 0 && t < ROOT_FEED + k * 1.5 + 10) fed = 1
      continue
    }
    const p = path[Math.round(u * n)]
    plus(out, p.x, p.y, light(c, 0.3), WHITE)
  }
  if (fed) {
    out.shade = tint(light(c, 0.5), t % 3 ? 0.1 : 0.2)
    if (t % 3 === 0) halo(out, g, light(c, 0.3))
  }

  // A sprout pushes up out of the crown and opens two leaves
  const crown = crownAt(g)
  const age = t - ROOT_SPROUT
  if (age >= 0 && t < INGRAIN_TICKS - 2) {
    if (age === 0) out.shake = [0, -1]
    if (age >= 0 && age < 3) out.sy = 1.04
    const h = Math.min(3, age + 1)
    const gone = phase(t, INGRAIN_TICKS - 6, INGRAIN_TICKS - 2)
    if (gone < 0.5 || t % 2) {
      for (let k = 1; k <= h; k++) dot(out, crown.x, crown.y - k, dark(c, 0.2))
      const open = easeOut(phase(age, 2, 6))
      if (open > 0) {
        leaf(out, crown.x - 1 - open, crown.y - h, -Math.PI + 0.5, 1 + open, 0.6 + open * 0.4, light(c, 0.2))
        leaf(out, crown.x + 1 + open, crown.y - h - 1, -0.5, 1 + open, 0.6 + open * 0.4, c)
      }
      if (age < 4) spark(out, crown.x, crown.y - h - 1, 1, light(c, 0.4))
    }
  }
}

const SPORE_PUFF = 6
const SPORE_BALLS = 9
const SPORE_GAP = 1.6
const SPORE_FLOAT = 15
const SPORE_SHAKE = 36
const SPORE_TICKS = 50
const COTTON = 0xf2f2ea

// A fluffy cotton ball with a grey shadow rim, so it reads on a light background
function cotton(out, x, y, r, seed, c) {
  disc(out, x + 0.4, y + 0.5, r, dark(c, 0.4))
  puff(out, x, y, r, c, seed)
  dot(out, x - r * 0.4, y - r * 0.4, WHITE)
}

// The mon shakes out big fluffy cotton balls that bob slowly through the air on a breeze
// and stick all over the target, which wobbles under the clinging fluff
function cottonspore(out, t, a, g, c) {
  const side = g.side
  if (t >= 1 && t < SPORE_PUFF) {
    out.skew = lean(g, tremble(t) * 2)
    out.dx = tremble(t, 2) > 0 ? 0 : -side
  } else if (t >= SPORE_PUFF && t < SPORE_PUFF + 3) {
    out.sx = 1.06
    out.sy = 0.93
  }
  const from = pt(g.mouth.x, g.mouth.y)
  const fluff = mix(c, COTTON, 0.6)
  const fade = phase(t, SPORE_TICKS - 9, SPORE_TICKS - 2)
  const jiggle = t >= SPORE_SHAKE && t < SPORE_SHAKE + 5 ? tremble(t) : 0
  emit(t, { count: SPORE_BALLS, gap: SPORE_GAP, start: SPORE_PUFF, life: 100 }, (i, age) => {
    if (fade > 0 && rnd(a.seed, i, 7) < fade) return
    const ang = (i / SPORE_BALLS) * TAU + rnd(a.seed, i, 1)
    const spot = pt(g.target.x + Math.cos(ang) * 3.5, g.target.y + Math.sin(ang) * 3.5)
    const r = 1.8 + rnd(a.seed, i, 2) * 1.2
    if (age < SPORE_FLOAT) {
      const f = age / SPORE_FLOAT
      const x = lerp(from.x, spot.x, easeInOut(f))
      const y = lerp(from.y, spot.y, f) - Math.sin(f * Math.PI) * (3 + rnd(a.seed, i, 3) * 3) + Math.sin(age * 0.6 + i) * 0.8
      cotton(out, x, Math.max(r, y), Math.min(r, 0.8 + age * 0.4), a.seed + i, fluff)
      // A wisp trails behind it
      dot(out, x - side * (r + 1), y + Math.sin(age + i), mix(fluff, 0x9a9aa8, 0.4))
      return
    }
    const stuck = age - SPORE_FLOAT
    const squish = stuck < 2 ? 0.5 : 0
    if (stuck === 0 && i === SPORE_BALLS - 1) out.shake = [side, 0]
    cotton(out, spot.x + jiggle, spot.y + Math.sin(stuck * 0.3 + i) * 0.4, r + squish, a.seed + i, fluff)
  })

  // Loose fibers float around the clump
  if (t >= SPORE_PUFF + SPORE_FLOAT && fade < 1) {
    for (let k = 0; k < 4; k++) {
      const ang = rnd(a.seed, k, 9) * TAU + t * 0.08
      const d = 6 + Math.sin(t * 0.3 + k) * 1.5
      if ((t + k) % 4) dot(out, g.target.x + Math.cos(ang) * d, g.target.y + Math.sin(ang) * d * 0.7, mix(fluff, 0x9a9aa8, 0.5))
    }
  }
}

const MAGIC_RISE = 5
const MAGIC_LEAVES = 5
const MAGIC_HOVER = 13
const MAGIC_GAP = 3
const MAGIC_FLIGHT = 10

// Where magic leaf i hovers in a fan over the mon before it flies
function hoverAt(g, i, t) {
  const ang = -Math.PI / 2 + (i - (MAGIC_LEAVES - 1) / 2) * 0.5 * g.side
  const rx = (g.right - g.left) / 2 + 3
  const ry = (g.bottom - g.top) / 2 + 3
  return pt(g.cx + Math.cos(ang) * rx, Math.max(2, g.cy + Math.sin(ang) * ry) + Math.sin(t * 0.5 + i) * 0.7)
}

// Where leaf i is on its flight: a loop-the-loop out of the fan, then a curve into the target
function magicPath(g, i, f) {
  const from = hoverAt(g, i, MAGIC_HOVER + i * MAGIC_GAP)
  const to = pt(g.target.x, g.target.y + ((i % 3) - 1) * 2)
  const over = pt(lerp(from.x, to.x, 0.5), Math.max(1, Math.min(from.y, to.y) - 5))
  const p = bend(from, over, to, easeIn(f))
  const loop = Math.max(0, 1 - f * 1.6)
  return pt(p.x + Math.sin(f * TAU * 1.5) * 3 * loop * g.side, Math.max(1, p.y - (1 - Math.cos(f * TAU * 1.5)) * 2 * loop))
}

const magicHue = (t, i) => hsl((t * 0.05 + i * 0.2) % 1, 0.9, 0.62)

// The mon glows and conjures a fan of shimmering leaves over its head. One by one they
// loop the loop and home in on the target in rainbow trails, each landing with a twinkle.
function magicalleaf(out, t, a, g, c) {
  const side = g.side
  if (t >= 1 && t < MAGIC_RISE + 2) {
    out.dy = -1
    out.shade = tint(light(c, 0.6), 0.2 + 0.1 * (t % 2))
  }
  for (let i = 0; i < MAGIC_LEAVES; i++) {
    const born = MAGIC_RISE + i
    const launch = MAGIC_HOVER + i * MAGIC_GAP
    const age = t - launch
    if (t === launch) {
      out.dx = side
      out.skew = lean(g, side)
    }
    if (t >= born && t < launch) {
      const grow = phase(t, born, born + 3)
      const p = hoverAt(g, i, t)
      const from = pt(g.cx, g.cy)
      const x = lerp(from.x, p.x, easeOut(grow))
      const y = lerp(from.y, p.y, easeOut(grow))
      leaf(out, x, y, -Math.PI / 2 + Math.sin(t * 0.4 + i) * 0.6, 1.5 + grow * 1.5, 1.3, c, magicHue(t, i))
      if ((t + i) % 3 === 0) dot(out, x + side * 2, y - 2, WHITE)
    } else if (age >= 0 && age < MAGIC_FLIGHT) {
      const f = age / MAGIC_FLIGHT
      for (let j = 5; j >= 1; j--) {
        const q = magicPath(g, i, Math.max(0, f - j * 0.05))
        if ((j + t) % 2 || j < 3) dot(out, q.x, q.y, j < 2 ? WHITE : magicHue(t - j, i))
      }
      const p = magicPath(g, i, f)
      const q = magicPath(g, i, Math.min(1, f + 0.05))
      leaf(out, p.x, p.y, Math.atan2(q.y - p.y, q.x - p.x), 3, 1.3, c, magicHue(t, i))
    } else if (age >= MAGIC_FLIGHT && age < MAGIC_FLIGHT + 5) {
      const hit = magicPath(g, i, 1)
      const k = age - MAGIC_FLIGHT
      spark(out, hit.x, hit.y, [2, 3, 2, 1, 0][k], magicHue(t, i))
      if (k < 2) ring(out, hit.x, hit.y, 2 + k * 1.5, k ? magicHue(t, i + 2) : WHITE)
      if (k === 0) out.shake = [i === MAGIC_LEAVES - 1 ? side : 0, 0]
    }
  }
  const after = t - (MAGIC_HOVER + (MAGIC_LEAVES - 1) * MAGIC_GAP + MAGIC_FLIGHT + 2)
  if (after >= 0 && after < 8) sparkles(out, t, a.seed, g.target.x, g.target.y, 10, 8, magicHue(t, 0), 4)
}

// A screen angle from one measured toward the target, 0 straight at it and negative up
const facing = (angle, side) => (side > 0 ? angle : Math.PI - angle)

const BLADE_GROW = 7
const BLADE_DASH = 11
const BLADE_SWING = 14
const BLADE_HOLD = 19
const BLADE_HOME = 31
const BLADE_UP = -Math.PI / 2 - 0.5
const BLADE_DOWN = 1.0

// How far the dash has carried the mon toward the target
function bladeDash(t, far) {
  if (t < BLADE_GROW) return t >= 2 ? -1 : 0
  if (t < BLADE_DASH) return Math.round(lerp(-1, far, easeIn(phase(t, BLADE_GROW, BLADE_DASH))))
  if (t < BLADE_HOLD) return far
  return Math.round(far * (1 - easeInOut(phase(t, BLADE_HOLD, BLADE_HOME))))
}

// The blade's angle: raised back over the head, then swept down through the target
function bladeAngle(t) {
  if (t < BLADE_DASH) return BLADE_UP
  return lerp(BLADE_UP, BLADE_DOWN, easeOut(phase(t, BLADE_DASH, BLADE_SWING)))
}

// A long glowing leaf grows from the mon's front like a sword. It dashes in, brings the
// blade down in one wide crescent, and the target splits along a bright diagonal cut.
function leafblade(out, t, a, g, c) {
  const side = g.side
  const height = g.bottom - g.top
  const len = Math.max(3, Math.min(6, height * 0.3))
  const far = Math.max(2, Math.min(g.reach - Math.round(len) - 3, 8))
  out.dx = side * bladeDash(t, far)
  if (t >= BLADE_GROW && t < BLADE_DASH) out.ghosts = [1, 2].map((k) => ghost(side * bladeDash(t - k, far), 0, light(c, 0.3), 0.4 + 0.2 * k))
  if (t >= 2 && t < BLADE_DASH) out.skew = lean(g, -side)
  else if (t >= BLADE_DASH && t < BLADE_SWING + 2) out.skew = lean(g, side * 2)
  const handY = g.mouth.y + 2
  const hand = pt(g.frontAt(handY) + out.dx + (out.skew ? Math.round(out.skew(handY)) : 0) - side, handY)
  const shrink = 1 - phase(t, BLADE_HOLD + 2, BLADE_HOME - 2)
  const size = len * easeOut(phase(t, 2, BLADE_GROW)) * shrink

  // The crescent of the swing, fading behind the blade
  if (t >= BLADE_DASH + 1 && t < BLADE_SWING + 4) {
    const fade = phase(t, BLADE_SWING, BLADE_SWING + 4)
    const to = bladeAngle(t)
    for (let ang = BLADE_UP; ang <= to; ang += 0.12) {
      const p = toward(ang, side)
      const r = len * 2
      if (fade > 0 && rnd(a.seed, Math.round(ang * 30), t) < fade) continue
      dot(out, hand.x + p.x * r, hand.y + p.y * r, WHITE)
      dot(out, hand.x + p.x * (r - 1), hand.y + p.y * (r - 1), light(c, 0.4))
      dot(out, hand.x + p.x * (r - 2), hand.y + p.y * (r - 2), dark(c, 0.1))
    }
  }
  if (size > 0.8) {
    const ang = bladeAngle(t)
    const p = toward(ang, side)
    const glint = t >= BLADE_GROW - 1 && t < BLADE_GROW + 1
    leaf(out, hand.x + p.x * size, hand.y + p.y * size, facing(ang, side), size, size * 0.3 + 0.4, glint ? light(c, 0.5) : c)
    if (glint) spark(out, hand.x + p.x * size * 2, hand.y + p.y * size * 2, 2, light(c, 0.4))
  }

  // The cut: a white diagonal that splits into two halves sliding apart
  const cut = t - BLADE_SWING
  const tx = g.target.x
  const ty = g.target.y
  if (cut >= 0 && cut < 9) {
    const spread = cut < 2 ? 0 : (cut - 1) * 0.6
    const fade = cut > 5
    for (const half of [-1, 1]) {
      const ox = side * spread * half * 0.6
      const oy = -spread * half * 0.4
      const x0 = tx - side * (half < 0 ? 4 : 0) + ox
      const y0 = ty - (half < 0 ? 5 : 0) + oy
      const x1 = tx + side * (half < 0 ? 0 : 4) + ox
      const y1 = ty + (half < 0 ? 0 : 5) + oy
      if (fade && cut % 2) continue
      line(out, x0 + side, y0, x1 + side, y1, light(c, 0.3))
      line(out, x0, y0, x1, y1, cut < 3 ? WHITE : light(c, 0.55))
    }
    if (cut === 0) {
      out.shake = [side * 2, 1]
      burst(out, tx, ty, 4, light(c, 0.5))
    } else if (cut === 1) out.shake = [-side, 0]
    // Torn leaf bits fly off the cut
    for (let i = 0; i < 4; i++) {
      const ang = -Math.PI / 2 + (rnd(a.seed, i, 4) - 0.5) * 2.4
      const d = 1 + cut * (0.8 + rnd(a.seed, i, 5) * 0.5)
      if (cut > 0) dot(out, tx + Math.cos(ang) * d, ty + Math.sin(ang) * d + cut * cut * 0.06, i % 2 ? light(c, 0.2) : dark(c, 0.2))
    }
  }
}

const STORM_GATHER = 14
const STORM_RECOIL = 17
const STORM_BLAST = 18
const STORM_END = 40
const STORM_TICKS = 60
const STORM_LEAVES = 64
const STORM_FLY = 7

// Leaf i of the storm, in one of four shades
const stormTone = (c, i) => [light(c, 0.35), c, mix(c, 0xd8e860, 0.45), dark(c, 0.15)][i % 4]

// Leaves spiral in and swirl around the mon as it rises, then it lets loose a roaring river
// of leaves that widens as it pummels the target, bracing against the recoil, and the
// spent leaves flutter down around the target
function leafstorm(out, t, a, g, c) {
  const side = g.side
  const rx = (g.right - g.left) / 2 + 3
  const ry = (g.bottom - g.top) / 2 + 2
  if (t >= 2 && t < STORM_GATHER) {
    const f = phase(t, 2, STORM_GATHER)
    out.dy = -Math.round(f)
    out.sy = 1 + 0.05 * f
    out.shade = tint(light(c, 0.5), 0.12 * f)
  } else if (t >= STORM_GATHER && t < STORM_RECOIL) {
    out.dx = -side
    out.sx = 1.05
    out.sy = 0.94
  } else if (t >= STORM_RECOIL && t < STORM_END) {
    out.dx = -side * (t % 3 === 0 ? 2 : 1)
    out.skew = lean(g, -side * 2)
    out.shake = [t % 2 ? 1 : -1, t % 4 === 0 ? 1 : 0]
  } else if (t >= STORM_END && t < STORM_END + 6) {
    out.dx = -side
    out.skew = lean(g, -side)
  }

  // The gathering swirl, closing in round the mon
  emit(t, { count: 18, gap: 0.6, start: 1, life: (i) => STORM_GATHER + 3 - i * 0.6 }, (i, age, f) => {
    const ang = rnd(a.seed, i, 1) * TAU + age * 0.45
    const r = lerp(2.2, 1, easeIn(f))
    const x = g.cx + Math.cos(ang) * rx * r
    const y = g.cy + Math.sin(ang) * ry * r * 0.8
    const front = Math.sin(ang) > 0
    if (y >= 1 && y < g.ground) leaf(out, x, y, ang + Math.PI / 2, 1.6, 0.8, front ? stormTone(c, i) : dark(c, 0.35), undefined, front ? dot : back)
  })

  // The river of leaves: each flies a wavering path that fans out as it nears the target
  const mouth = pt(g.mouth.x + out.dx + (out.skew ? Math.round(out.skew(g.mouth.y)) : 0), g.mouth.y)
  const dist = Math.abs(g.target.x - mouth.x) + 4
  emit(t, { count: STORM_LEAVES, gap: (STORM_END - STORM_BLAST) / STORM_LEAVES, start: STORM_BLAST, life: STORM_FLY }, (i, age, f) => {
    const lane = (rnd(a.seed, i, 2) - 0.5) * 2
    const x = mouth.x + side * dist * f
    const y = lerp(mouth.y, g.target.y, f) + lane * (1 + f * 6) + Math.sin(f * 7 + i) * 1.2
    if (y < 1 || y > g.ground) return
    leaf(out, x, y, facing(f * 6 + i, side), 1.6, 0.8, stormTone(c, i))
  })
  // Streaks of wind ride the river
  if (t >= STORM_BLAST && t < STORM_END) {
    for (let k = 0; k < 4; k++) {
      const f = ((t * 0.18 + k * 0.27) % 1)
      const x = mouth.x + side * dist * f
      const y = lerp(mouth.y, g.target.y, f) + (k - 1.5) * (2 + f * 4)
      for (let d = 0; d < 4; d++) dot(out, x - side * d, y, d ? light(c, 0.55) : WHITE)
    }
    // The target takes a flurry of hits
    const hx = g.target.x + (rnd(a.seed, t, 6) - 0.5) * 6
    const hy = g.target.y + (rnd(a.seed, t, 7) - 0.5) * 6
    if (t > STORM_BLAST + STORM_FLY - 2) spark(out, hx, hy, t % 2 ? 2 : 1, light(c, 0.4))
  }

  // Spent leaves flutter down and settle away
  emit(t, { count: 14, gap: 0.8, start: STORM_END - 4, life: 18 }, (i, age, f) => {
    const x = g.target.x + (rnd(a.seed, i, 8) - 0.5) * 14 + Math.sin(age * 0.5 + i) * 1.5
    const y = g.target.y - 4 + (rnd(a.seed, i, 9) - 0.5) * 6 + age * 0.55
    if (y < g.ground && (f < 0.7 || (t + i) % 2)) leaf(out, x, y, Math.sin(age * 0.4 + i) * 1.2, 1.5, 0.7, stormTone(c, i))
  })
}

const WHISTLE_LIP = 4
const WHISTLE_PLAY = 9
const WHISTLE_STOP = 40
const WHISTLE_DOZE = 24
const WHISTLE_TICKS = 52
const ZED = ['zzzz', '..z.', '.z..', 'zzzz']

// The mon raises a blade of grass to its lips and sways as it plays. A soft, rolling
// ribbon of melody carries little leaf notes over to the target, which nods off in Zs.
function grasswhistle(out, t, a, g, c) {
  const side = g.side
  const live = phase(t, WHISTLE_LIP, WHISTLE_PLAY) * (1 - phase(t, WHISTLE_STOP, WHISTLE_STOP + 6))
  if (live > 0) {
    out.skew = lean(g, Math.sin(t * 0.35) * 1.5 * live)
    out.dy = -Math.round(Math.max(0, Math.sin(t * 0.35)) * live)
  }
  const lips = pt(g.mouth.x + (out.skew ? Math.round(out.skew(g.mouth.y)) : 0), g.mouth.y + out.dy + 1)
  if (t >= 2 && t < WHISTLE_STOP + 4) {
    const buzz = t >= WHISTLE_PLAY ? tremble(t) * 0.3 : 0
    leaf(out, lips.x + side * 1.5, lips.y + buzz, facing(0.2, side), 2, 0.7, c)
  }

  // The ribbon: a rolling wave drawn up to how far the tune has carried
  const from = lips.x + side * 3
  const to = g.target.x
  const span = Math.abs(to - from)
  const carried = span * easeOut(phase(t, WHISTLE_PLAY, WHISTLE_PLAY + 10))
  const tail = span * easeIn(phase(t, WHISTLE_STOP - 4, WHISTLE_STOP + 4))
  const amp = 1.5 + 1.2 * Math.sin(t * 0.2)
  const waveY = (d) => lerp(lips.y, g.target.y - 2, d / Math.max(1, span)) + Math.sin(d * 0.55 - t * 0.6) * amp * Math.min(1, d / 4)
  for (let d = Math.floor(tail); d <= carried; d++) {
    const x = from + side * d
    const y = waveY(d)
    const band = ((Math.floor(d - t * 0.6) % 6) + 6) % 6
    dot(out, x, y + 1, dark(c, 0.45))
    dot(out, x, y, band < 2 ? WHITE : band < 4 ? light(c, 0.4) : c)
  }
  // Leaf notes ride the wave
  emit(t, { count: 8, gap: 3.5, start: WHISTLE_PLAY + 2, life: 12 }, (i, age, f) => {
    const d = f * span
    if (d > carried || d < tail) return
    const x = from + side * d
    const y = waveY(d) - 3
    leaf(out, x, y, facing(-0.6 + Math.sin(age * 0.6) * 0.4, side), 1.6, 0.8, i % 2 ? light(c, 0.2) : c)
    dot(out, x + side, y + 1, dark(c, 0.4))
    dot(out, x + side, y + 2, dark(c, 0.4))
  })

  // The target dozes: Zs float up from it, growing as they drift
  emit(t, { count: 4, gap: 5, start: WHISTLE_DOZE, life: 14 }, (i, age, f) => {
    if (f > 0.8 && t % 2) return
    const x = g.target.x + side * (1 + age * 0.3) + Math.sin(age * 0.5 + i) * 1.2
    const y = g.target.y - 4 - age * 0.6
    if (y < 1) return
    const col = mix(c, 0x9ad0ff, 0.6)
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stamp(out, x - 2 + ox, y - 2 + oy, ZED, { z: dark(col, 0.6) })
    stamp(out, x - 2, y - 2, ZED, { z: f < 0.3 ? WHITE : col })
  })
}

const AROMA_BLOOM = [3, 14]
const AROMA_WAFT = 12
const AROMA_BREATH = [22, 32]
const AROMA_TICKS = 52
const FLOWER = ['.p.', 'pyp', '.p.']

// Little flowers sprout and open round the mon's feet. Curling ribbons of scent rise off
// them and wind up around it, and it draws a long, calm breath and glows softly.
function aromatherapy(out, t, a, g, c) {
  const width = g.right - g.left
  const count = width > 14 ? 5 : 4
  const wither = phase(t, AROMA_TICKS - 9, AROMA_TICKS - 2)
  const spots = Array.from({ length: count }, (_, k) => {
    const u = count > 1 ? k / (count - 1) : 0.5
    return pt(Math.round(g.left - 3 + u * (width + 6)), g.ground)
  })
  spots.forEach((p, k) => {
    const grow = easeOut(phase(t, AROMA_BLOOM[0] + k * 2, AROMA_BLOOM[0] + k * 2 + 6))
    if (grow <= 0 || (wither > 0 && rnd(a.seed, k, 3) < wither)) return
    const h = Math.round(1 + grow * 2)
    const stem = mix(c, 0x4caa48, 0.75)
    const paint = p.x > g.left + 1 && p.x < g.right - 1 ? back : dot
    for (let d = 1; d < h; d++) paint(out, p.x, p.y - d + 1, stem)
    if (grow < 0.6) paint(out, p.x, p.y - h, light(c, 0.3))
    else stamp(out, p.x - 1, p.y - h - 1, FLOWER, { p: k % 2 ? c : light(c, 0.3), y: SUN }, false, paint)
  })

  // Scent ribbons: a curl of dots rising and swaying off each flower
  emit(t, { count: 16, gap: 1.6, start: AROMA_WAFT, life: 16 }, (i, age, f) => {
    if (t > AROMA_TICKS - 6) return
    const p = spots[i % count]
    const rise = age * 1.1
    for (let j = 0; j < 4; j++) {
      const y = p.y - 4 - rise + j * 1.2
      const x = p.x + Math.sin((rise - j) * 0.45 + i) * 2.2 + (g.cx - p.x) * f * 0.3
      if (y < 1) continue
      const col = j === 0 ? WHITE : j === 1 ? light(c, 0.45) : mix(c, 0xb08ae0, 0.4)
      if (f < 0.75 || (t + j) % 2) dot(out, x, y, col)
    }
  })

  // The breath: a slow swell up and a soft pink glow that ebbs away
  const inhale = easeInOut(phase(t, AROMA_BREATH[0] - 6, AROMA_BREATH[0])) * (1 - easeInOut(phase(t, AROMA_BREATH[1], AROMA_BREATH[1] + 8)))
  out.sy = 1 + 0.05 * inhale
  out.sx = 1 + 0.02 * inhale
  out.dy = -Math.round(inhale)
  const calm = phase(t, AROMA_BREATH[0] - 4, AROMA_BREATH[0]) * (1 - phase(t, AROMA_BREATH[1], AROMA_TICKS - 4))
  if (calm > 0) {
    out.shade = glow(light(c, 0.4), 0.25 * calm + (t % 6 < 3 ? 0.05 : 0))
    if (t >= AROMA_BREATH[0] && t < AROMA_BREATH[1] && t % 4 < 2) halo(out, g, light(c, 0.2), 0, out.dy)
  }
  if (t >= AROMA_BREATH[1] - 2 && t < AROMA_BREATH[1] + 10) sparkles(out, t, a.seed, g.cx, g.top + 2, width + 6, 8, c, 4)
}

const ORB_GATHER = 3
const ORB_FIRE = 15
const ORB_HIT = 25
const ORB_TICKS = 44

// A sphere of green energy with a dark rim, a lit face and two motes spinning round it
function energy(out, x, y, r, t, c) {
  ring(out, x, y, r + 0.6, dark(c, 0.5))
  ball(out, x, y, r, c)
  disc(out, x - r * 0.3, y - r * 0.3, r * 0.35, light(c, 0.6))
  for (let k = 0; k < 2; k++) {
    const ang = t * 0.8 + k * Math.PI
    dot(out, x + Math.cos(ang) * (r + 1.5), y + Math.sin(ang) * (r + 1.5) * 0.6, k ? WHITE : light(c, 0.5))
  }
}

// Motes of light swirl in and pack into a growing sphere before the mouth. The mon thrusts
// it out, the ball rolls through the air and bursts on the target in rings and shards.
function energyball(out, t, a, g, c) {
  const side = g.side
  const height = g.bottom - g.top
  const big = Math.max(2, Math.min(3.5, height * 0.18))
  if (t >= 1 && t < ORB_FIRE) {
    out.dx = -side
    out.skew = lean(g, -side)
    if (t > ORB_FIRE - 4) out.shade = tint(light(c, 0.5), 0.15)
  } else if (t >= ORB_FIRE && t < ORB_FIRE + 3) {
    out.dx = side
    out.skew = lean(g, side * 2)
  }
  const hold = pt(g.ahead(Math.ceil(big) + 1), g.mouth.y + 1)
  const tx = g.target.x
  const ty = g.target.y

  // Motes spiral in to the forming ball
  emit(t, { count: 16, gap: 0.7, start: ORB_GATHER, life: 6 }, (i, age, f) => {
    const ang = rnd(a.seed, i, 1) * TAU + f * 2
    const d = (big + 6) * (1 - easeIn(f))
    plus(out, hold.x + Math.cos(ang) * d, hold.y + Math.sin(ang) * d * 0.8, f < 0.5 ? c : light(c, 0.4), WHITE)
  })
  if (t >= ORB_GATHER + 2 && t < ORB_FIRE) energy(out, hold.x, hold.y, big * easeOut(phase(t, ORB_GATHER + 2, ORB_FIRE - 2)), t, c)

  if (t >= ORB_FIRE && t < ORB_HIT) {
    const f = phase(t, ORB_FIRE, ORB_HIT)
    const at = (u) => pt(lerp(hold.x, tx, easeIn(u)), lerp(hold.y, ty, u) - Math.sin(u * Math.PI) * 1.5)
    for (let j = 3; j >= 1; j--) {
      const q = at(Math.max(0, f - j * 0.08))
      disc(out, q.x, q.y, big * (1 - j * 0.22), j === 1 ? light(c, 0.2) : dark(c, 0.15 * j))
    }
    const p = at(f)
    energy(out, p.x, p.y, big, t, c)
  }

  // The burst: a white flash, two rings racing out, and shards of energy
  const hit = t - ORB_HIT
  if (hit >= 0 && hit < 12) {
    if (hit < 2) disc(out, tx, ty, big + 1 + hit, hit ? light(c, 0.6) : WHITE)
    if (hit < 7) {
      ring(out, tx, ty, big + 1 + hit * 1.6, hit < 3 ? WHITE : light(c, 0.3))
      if (hit > 1) ring(out, tx, ty, big + hit * 0.9, c)
    }
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU + rnd(a.seed, i, 2) * 0.4
      const d = big + 1 + hit * (1.1 + rnd(a.seed, i, 3) * 0.6)
      const x = tx + Math.cos(ang) * d
      const y = ty + Math.sin(ang) * d * 0.8
      if (hit < 9 || (t + i) % 2) {
        dot(out, x, y, hit < 4 ? light(c, 0.5) : c)
        dot(out, x - Math.cos(ang), y - Math.sin(ang) * 0.8, dark(c, 0.2))
      }
    }
    if (hit === 0) out.shake = [side * 2, 1]
    else if (hit === 1) out.shake = [-side, 0]
  }
}

const WHIP_SPIN = [2, 16]
const WHIP_SLAM = 21
const WHIP_REST = 26
const WHIP_HOME = 34
const WHIP_TICKS = 46

// Where the heavy vine's tip is: whirled round overhead, brought down onto the target,
// left lying there quivering, then hauled back in
function whipTip(t, root, hit, r, side) {
  const hub = pt(root.x - side, Math.max(r * 0.8 + 1, root.y - r - 2))
  const spin = (f) => {
    const ang = -Math.PI / 2 + 0.6 + f * TAU * 1.5
    return pt(hub.x + Math.cos(ang) * r * side, hub.y + Math.sin(ang) * r * 0.8)
  }
  if (t < WHIP_SPIN[0]) return null
  if (t < WHIP_SPIN[1]) return spin(easeIn(phase(t, WHIP_SPIN[0], WHIP_SPIN[1])))
  const cock = spin(1)
  if (t <= WHIP_SLAM) {
    const s = phase(t, WHIP_SPIN[1], WHIP_SLAM) ** 2
    return bend(cock, pt(lerp(cock.x, hit.x, 0.7), 1), hit, s)
  }
  if (t < WHIP_REST) return pt(hit.x, hit.y + (t % 2 ? 0 : -1))
  if (t >= WHIP_HOME) return null
  const f = easeInOut(phase(t, WHIP_REST, WHIP_HOME))
  return pt(lerp(hit.x, root.x, f), lerp(hit.y, root.y, f) - Math.sin(f * Math.PI) * 3)
}

// A thick vine path from root to tip that bows upward
function whipPath(root, tip) {
  const len = Math.hypot(tip.x - root.x, tip.y - root.y)
  const ctrl = pt((root.x + tip.x) / 2, Math.max(0, Math.min(root.y, tip.y) - len * 0.25))
  return sample((u) => bend(root, ctrl, tip, u), len * 1.3)
}

// One huge vine uncoils and whirls round over the mon's head, gathering speed, then
// smashes straight down onto the target, cracking the ground and spraying dirt
function powerwhip(out, t, a, g, c) {
  const side = g.side
  const height = g.bottom - g.top
  const r = Math.max(4, Math.min(7, height * 0.4))
  const top = a.from === 'top' && g.crown
  const spinning = t >= WHIP_SPIN[0] && t < WHIP_SPIN[1]
  if (spinning) out.skew = lean(g, Math.round(Math.sin(easeIn(phase(t, ...WHIP_SPIN)) * TAU * 1.5) * 1.5) * side)
  else if (t >= WHIP_SPIN[1] && t <= WHIP_SLAM) {
    out.dx = side
    out.skew = lean(g, side * 3)
  } else if (t > WHIP_SLAM && t < WHIP_SLAM + 3) {
    out.sy = 0.93
    out.sx = 1.05
  }
  const base = top ? pt(g.crown.x, g.crown.y + 1) : pt(g.mouth.x - side * 2, g.mouth.y)
  const root = pt(base.x + out.dx + (out.skew ? Math.round(out.skew(base.y)) : 0), base.y)
  const hit = pt(g.target.x, Math.min(g.ground - 2, g.target.y + 1))
  const tip = whipTip(t, root, hit, r, side)
  // A swoosh traces where the tip has just been
  if (t > WHIP_SPIN[0] + 2 && t <= WHIP_SLAM) {
    for (let k = 1; k <= 8; k++) {
      const q = whipTip(t - k * 0.3, root, hit, r, side)
      if (q) dot(out, q.x, q.y, k < 3 ? WHITE : k < 6 ? light(c, 0.5) : light(c, 0.2))
    }
  }
  if (tip) {
    if (spinning || (t > WHIP_SPIN[1] && t <= WHIP_SLAM)) {
      const prev = whipTip(t - 1, root, hit, r, side)
      if (prev) for (const p of whipPath(root, prev)) dot(out, p.x, p.y, mix(c, 0x9fb8a0, 0.55))
    }
    const path = whipPath(root, tip)
    vine(out, path.map((p) => pt(p.x, p.y + 1)), dark(c, 0.35))
    vine(out, path, c)
  }

  // The slam: a heavy flash, cracks in the ground, and dirt thrown both ways
  const slam = t - WHIP_SLAM
  if (slam >= 0 && slam < 14) {
    if (slam < 3) burst(out, hit.x, hit.y, [6, 7, 4][slam], slam ? light(c, 0.3) : WHITE)
    if (slam === 0) out.shake = [side * 2, 2]
    else if (slam === 1) out.shake = [-side, 1]
    else if (slam === 2) out.shake = [side, 0]
    if (slam < 10) {
      for (const d of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const x = hit.x + d * (2 + k * 1.5)
          if (k <= slam) dot(out, x, g.ground - (k % 2), dark(BARK, 0.3))
        }
      }
    }
    for (let i = 0; i < 8; i++) {
      const d = i % 2 ? 1 : -1
      const vx = d * (0.5 + rnd(a.seed, i, 1) * 0.9)
      const vy = -(0.9 + rnd(a.seed, i, 2) * 0.9)
      const x = hit.x + d * 2 + vx * slam
      const y = g.ground - 1 + vy * slam + 0.12 * slam * slam
      if (y <= g.ground && slam > 0) dot(out, x, y, i % 3 ? BARK : light(BARK, 0.3))
    }
  }
}

const WORRY_SHOOT = 5
const WORRY_LAND = 13
const WORRY_FRET = [17, 38]
const WORRY_TICKS = 42
const BURR = [
  ['.s.', 'sbs', '.s.'],
  ['s.s', '.b.', 's.s'],
]
const SWEAT = 0x8ad0ff

// The mon flicks a spiky little seed that whirls onto the target's head and sprouts.
// A tangled scribble of worry churns over it while beads of sweat fly off.
function worryseed(out, t, a, g, c) {
  const side = g.side
  if (t >= 1 && t < WORRY_SHOOT) {
    out.dx = -side
    out.skew = lean(g, -side)
  } else if (t >= WORRY_SHOOT && t < WORRY_SHOOT + 2) {
    out.dx = side
    out.skew = lean(g, side * 2)
  }
  const head = pt(g.target.x, Math.max(4, g.target.y - 5))
  const seedCol = { s: dark(c, 0.45), b: mix(c, BARK, 0.6) }
  if (t >= WORRY_SHOOT && t < WORRY_LAND) {
    const f = phase(t, WORRY_SHOOT, WORRY_LAND)
    const from = pt(g.mouth.x + side, g.mouth.y)
    const x = lerp(from.x, head.x, f)
    const y = lerp(from.y, head.y, f) - Math.sin(f * Math.PI) * 4
    dot(out, x - side * 2, y + 1, light(c, 0.3))
    stamp(out, x - 1, y - 1, BURR[t % 2], seedCol)
  }
  const land = t - WORRY_LAND
  if (land >= 0 && t < WORRY_TICKS - 2) {
    if (land < 2) spark(out, head.x, head.y, 2 - land, light(c, 0.4))
    if (land === 0) out.shake = [0, 1]
    const h = Math.min(2, land)
    const gone = t > WORRY_TICKS - 6 && t % 2
    if (!gone) {
      stamp(out, head.x - 1, head.y, BURR[0], seedCol)
      for (let k = 1; k <= h; k++) dot(out, head.x, head.y - k, dark(c, 0.15))
      if (land >= 2) {
        leaf(out, head.x - 1, head.y - h - 1, -Math.PI + 0.6, 1.4, 0.7, c)
        leaf(out, head.x + 1, head.y - h - 1, -0.6, 1.4, 0.7, light(c, 0.2))
      }
    }
  }

  // The worry: a looping scribble that churns above the head
  const fret = phase(t, WORRY_FRET[0], WORRY_FRET[0] + 4) * (1 - phase(t, WORRY_FRET[1] - 3, WORRY_FRET[1]))
  if (fret > 0) {
    const cy = Math.max(4, head.y - 7)
    const ink = mix(0xb09ad8, c, 0.15)
    let prev = null
    for (let k = 0; k <= 48 * fret; k++) {
      const u = k / 48
      const x = head.x + Math.sin(u * TAU * 3 + t * 0.5) * 4.5 * fret + Math.sin(u * 17) * 0.8
      const y = Math.max(1, cy + Math.sin(u * TAU * 2 + t * 0.4) * 2.8 * fret)
      if (prev) line(out, prev.x, prev.y, x, y, k % 6 ? ink : WHITE)
      prev = pt(x, y)
    }
    // Shiver marks on both sides of the target
    if (t % 4 < 2) {
      for (const d of [-1, 1]) {
        const x = g.target.x + d * 6 + (t % 2 ? d : 0)
        line(out, x, g.target.y - 2, x + d, g.target.y, ink)
      }
    }
  }
  emit(t, { count: 6, gap: 3, start: WORRY_FRET[0] + 1, life: 7 }, (i, age) => {
    const d = i % 2 ? 1 : -1
    const x = head.x + d * (3 + age * 0.9)
    const y = head.y - 1 - age * 0.6 + age * age * 0.08
    dot(out, x, y, WHITE)
    dot(out, x, y + 1, SWEAT)
    dot(out, x + d, y + 1, dark(SWEAT, 0.3))
  })
}

const TWISTER_SPIN = [2, 14]
const TWISTER_GO = 14
const TWISTER_ARRIVE = 21
const TWISTER_BREAK = 40
const TWISTER_TICKS = 52
const TWISTER_LEAVES = 20

// The mon twirls on the spot and flings out a whirling column of leaves. It skates over
// the ground onto the target and spins there as a roaring funnel, then flings apart.
function leaftornado(out, t, a, g, c) {
  const side = g.side
  if (t >= TWISTER_SPIN[0] && t < TWISTER_SPIN[1]) {
    out.flipX = Math.floor(t / 3) % 2 === 1
    out.skew = lean(g, (Math.floor(t / 3) % 2 ? 1 : -1) * side)
    out.dy = t % 3 === 1 ? -1 : 0
  } else if (t >= TWISTER_GO && t < TWISTER_GO + 3) {
    out.dx = side
    out.skew = lean(g, side * 2)
  }
  const start = pt(g.ahead(2), g.ground)
  const sway = Math.sin(t * 0.3) * 1.2
  const travel = easeInOut(phase(t, TWISTER_GO, TWISTER_ARRIVE))
  const base = pt(lerp(start.x, g.target.x, travel) + (t >= TWISTER_ARRIVE ? sway : 0), g.ground)
  const full = Math.max(10, Math.min(g.ground - 1, g.ground - g.target.y + 9))
  const grow = t < TWISTER_GO ? easeOut(phase(t, 4, TWISTER_GO)) * 0.45 : lerp(0.45, 1, phase(t, TWISTER_GO, TWISTER_ARRIVE + 2))
  const height = full * grow
  const breaking = phase(t, TWISTER_BREAK, TWISTER_BREAK + 8)
  const radius = (h) => 0.8 + h * 0.45
  if (t >= 4 && t < TWISTER_BREAK) {
    // Wind bands round the funnel, their dashes turning
    for (let k = 1; k <= 4; k++) {
      const h = (height * k) / 4.5
      const r = radius(h)
      for (let j = 0; j < 10; j++) {
        const ang = (j / 10) * TAU + t * 0.7 + k
        if ((j + k) % 3 === 0) continue
        const front = Math.sin(ang) > 0
        dot(out, base.x + Math.cos(ang) * r, base.y - h + Math.sin(ang) * 1.1, front ? (j % 3 === 1 ? WHITE : light(c, 0.55)) : dark(c, 0.35))
      }
    }
    // Dust kicked up round the foot
    for (let k = 0; k < 3; k++) dot(out, base.x + Math.sin(t * 0.9 + k * 2) * 3, g.ground - (k % 2), BARK)
  }
  for (let i = 0; i < TWISTER_LEAVES; i++) {
    const h = rnd(a.seed, i, 1) * height
    const ang = rnd(a.seed, i, 2) * TAU + t * (0.6 + rnd(a.seed, i, 3) * 0.3)
    const r = radius(h)
    let x = base.x + Math.cos(ang) * r
    let y = base.y - h + Math.sin(ang) * 0.7
    if (t < 4 || height < 1) continue
    if (breaking > 0) {
      // Thrown out of the funnel on the way it was turning
      const fly = (t - TWISTER_BREAK) * (0.8 + rnd(a.seed, i, 4) * 0.6)
      x += -Math.sin(ang) * fly * 1.5
      y += fly * 0.3 + 0.04 * fly * fly
      if (y > g.ground || rnd(a.seed, i, 5) < breaking - 0.3) continue
    }
    const front = Math.sin(ang) > 0
    leaf(out, x, y, ang * 2, 1.3, 0.7, front ? stormTone(c, i) : dark(c, 0.3))
  }
  if (t >= TWISTER_ARRIVE && t < TWISTER_BREAK && (t - TWISTER_ARRIVE) % 4 === 0) out.shake = [t % 8 ? side : -side, 0]
}

const NEEDLE_WIND = 6
const NEEDLE_JABS = [9, 16]
const NEEDLE_TICKS = 34

// How far the spiked arm reaches on its jabs, from 0 to 1
function armReach(t) {
  for (const hit of NEEDLE_JABS) {
    if (t >= hit - 3 && t <= hit) return easeIn(phase(t, hit - 3, hit))
    if (t > hit && t < hit + 3) return 1 - phase(t, hit, hit + 3)
  }
  return 0
}

// A thick green arm bristling with white-tipped needles, from the hand to its reach
function spikedArm(out, hand, len, side, c) {
  for (let d = 0; d <= len; d++) {
    const x = hand.x + side * d
    const tip = d >= len - 1
    dot(out, x, hand.y - 1, tip ? light(c, 0.4) : light(c, 0.25))
    dot(out, x, hand.y, tip ? light(c, 0.6) : c)
    dot(out, x, hand.y + 1, dark(c, 0.4))
    if (d % 2 === 1 && d < len - 1) {
      const up = d % 4 === 1 ? -1 : 1
      dot(out, x, hand.y + up * 2, light(c, 0.1))
      dot(out, x - side, hand.y + up * 3, WHITE)
    }
  }
}

// The mon draws back a cactus-like arm, then jabs it out twice in quick punches. Each one
// lands with a spray of needles, and a few stay stuck in the target.
function needlearm(out, t, a, g, c) {
  const side = g.side
  const reach = armReach(t)
  if (t >= 1 && t < NEEDLE_WIND) {
    out.dx = -side
    out.skew = lean(g, -side * 2)
  } else if (reach > 0) {
    out.dx = Math.round(side * reach * 2)
    out.skew = lean(g, side * 2 * reach)
  } else if (t >= NEEDLE_WIND && t < NEEDLE_JABS[1] + 3) out.dx = -side
  const handY = g.mouth.y + 2
  const hand = pt(g.frontAt(handY) + out.dx - side, handY)
  const full = Math.max(3, Math.abs(g.target.x - hand.x) - 2)
  const len = Math.round(lerp(2, full, reach))
  if (t >= 2 && t < NEEDLE_JABS[1] + 5) spikedArm(out, hand, t < NEEDLE_WIND ? Math.min(2, t - 1) : len, side, c)

  for (const [k, hit] of NEEDLE_JABS.entries()) {
    const age = t - hit
    if (age < 0 || age >= 8) continue
    const at = pt(hand.x + side * (full + 1), hand.y)
    if (age === 0) {
      out.shake = [side * (k + 1), k]
      plus(out, at.x, at.y, light(c, 0.5), WHITE)
    }
    if (age < 3) ring(out, at.x, at.y, 2 + age * (1 + k), age ? light(c, 0.4) : WHITE)
    for (let i = 0; i < 6 + k * 2; i++) {
      const ang = facing((i / (6 + k * 2) - 0.5) * 2.6, side)
      const d = 2 + age * 1.2
      const x = at.x + Math.cos(ang) * d
      const y = at.y + Math.sin(ang) * d
      if (age < 6) line(out, x, y, x + Math.cos(ang), y + Math.sin(ang), (i + age) % 2 ? WHITE : light(c, 0.5))
    }
  }
  // Needles left stuck in the target
  if (t >= NEEDLE_JABS[0] && t < NEEDLE_TICKS - 3) {
    for (let i = 0; i < 4; i++) {
      if (t > NEEDLE_TICKS - 8 && (t + i) % 2) continue
      const x = g.target.x + (rnd(a.seed, i, 1) - 0.5) * 6
      const y = g.target.y + (rnd(a.seed, i, 2) - 0.5) * 6
      dot(out, x, y, WHITE)
      dot(out, x - side, y, light(c, 0.3))
    }
  }
}

const HAMMER_ROOT = 10
const HAMMER_LEAP = 10
const HAMMER_SLAM = 17
const HAMMER_RECOIL = 23
const HAMMER_HOME = 40
const HAMMER_TICKS = 50

// How far forward and up the mon is as it leaps in, slams, and hops back home
function hammerPath(t, far) {
  if (t < HAMMER_LEAP) return pt(t >= 3 ? -1 : 0, -Math.round(easeOut(phase(t, 3, HAMMER_LEAP)) * 2))
  if (t < HAMMER_SLAM) {
    const f = phase(t, HAMMER_LEAP, HAMMER_SLAM)
    return pt(Math.round(lerp(-1, far, easeInOut(f))), -Math.round(2 + Math.sin(f * Math.PI) * 4 - f * 2))
  }
  if (t < HAMMER_RECOIL) return pt(far - (t - HAMMER_SLAM > 1 ? 1 : 0), t === HAMMER_SLAM + 2 ? -1 : 0)
  const f = phase(t, HAMMER_RECOIL, HAMMER_HOME)
  return pt(Math.round((far - 1) * (1 - easeInOut(f))), -Math.round(Math.sin(f * Math.PI) * 2))
}

// The mon's body hardens into grained wood. It rears, leaps in a heavy arc and crashes
// down on the target in a burst of splinters, then reels from the recoil, red-faced.
function woodhammer(out, t, a, g, c) {
  const side = g.side
  const far = Math.max(2, Math.min(g.reach - 4, 9))
  const p = hammerPath(t, far)
  out.dx = side * p.x
  out.dy = p.y
  if (t >= 3 && t < HAMMER_LEAP) out.skew = lean(g, -side * 2, out.dy)
  else if (t >= HAMMER_LEAP && t < HAMMER_SLAM) out.skew = lean(g, side * Math.round(lerp(-2, 4, phase(t, HAMMER_LEAP, HAMMER_SLAM))), out.dy)
  if (t === HAMMER_SLAM || t === HAMMER_SLAM + 1) {
    out.sy = 0.9
    out.sx = 1.08
  }
  if (t >= HAMMER_LEAP && t < HAMMER_SLAM) out.ghosts = [ghost(side * hammerPath(t - 2, far).x, hammerPath(t - 2, far).y, dark(c, 0.2), 0.6)]

  // Wood grain spreads over the body, then fades once the mon is home
  const wood = easeOut(phase(t, 1, HAMMER_ROOT)) * (1 - phase(t, HAMMER_HOME - 4, HAMMER_TICKS - 2))
  const recoil = t >= HAMMER_SLAM + 1 && t < HAMMER_RECOIL + 4
  if (wood > 0) {
    out.shade = (x, y, col) => {
      if (luma(col) < 50) return col
      const grain = ((y + Math.round(Math.sin(x * 0.7) * 1.2)) % 3 + 3) % 3
      const tone = grain === 0 ? dark(c, 0.3) : grain === 1 ? c : light(c, 0.2)
      const k = mix(col, tone, 0.55 * wood)
      return recoil && t % 2 ? mix(k, 0xff4a3a, 0.4) : k
    }
  }

  const hit = pt(g.target.x, Math.min(g.ground - 2, g.target.y))
  const slam = t - HAMMER_SLAM
  if (slam >= 0 && slam < 14) {
    if (slam < 3) burst(out, hit.x, hit.y, [5, 7, 4][slam], slam ? light(c, 0.4) : WHITE)
    if (slam === 0) out.shake = [side * 2, 2]
    else if (slam === 1) out.shake = [-side * 2, 1]
    else if (slam === 2) out.shake = [side, 0]
    // Splinters spin off in all directions and fall
    for (let i = 0; i < 9; i++) {
      const ang = -Math.PI / 2 + (rnd(a.seed, i, 1) - 0.5) * 3
      const speed = 0.9 + rnd(a.seed, i, 2) * 0.9
      const x = hit.x + Math.cos(ang) * speed * slam
      const y = hit.y + Math.sin(ang) * speed * slam + 0.1 * slam * slam
      if (y > g.ground || slam === 0) continue
      const flat = (slam + i) % 3
      const tone = i % 2 ? light(c, 0.25) : dark(c, 0.2)
      dot(out, x, y, tone)
      dot(out, x + (flat === 0 ? 1 : flat === 1 ? 0 : side), y + (flat === 1 ? 1 : 0), dark(tone, 0.3))
    }
  }
  // The recoil stings: little red jolt marks over the mon
  if (recoil) {
    const top = g.top + out.dy
    for (const d of [-1, 1]) {
      const x = g.cx + out.dx + d * ((g.right - g.left) / 2 + 1)
      if (t % 2) line(out, x, top + 1, x + d * 2, top - 1, 0xff4a3a)
      else plus(out, x + d, top, 0xff6a5a, WHITE)
    }
  }
}

const GUARD_WRAP = [3, 16]
const GUARD_SINK = [16, 26]
const GUARD_SHED = 38
const GUARD_TICKS = 50
const GUARD_PUFFS = 12

// Where cotton puff i settles on the mon's outline
function guardSpot(g, i) {
  const ang = (i / GUARD_PUFFS) * TAU - Math.PI / 2
  const rx = (g.right - g.left) / 2 + 1
  const ry = (g.bottom - g.top) / 2 + 1
  return pt(g.cx + Math.cos(ang) * rx, Math.min(g.ground - 1, g.cy + Math.sin(ang) * ry))
}

// Cotton puffs whirl in and pile up around the mon into a thick, soft cushion. It sinks
// into the fluff and bounces softly, glowing white, then the cotton loosens and floats away.
function cottonguard(out, t, a, g, c) {
  const fluff = mix(c, COTTON, 0.6)
  const sink = phase(t, GUARD_SINK[0], GUARD_SINK[1])
  if (t >= GUARD_SINK[0] && t < GUARD_SINK[1] + 6) {
    const bob = Math.sin(sink * Math.PI * 2) * (1 - phase(t, GUARD_SINK[1], GUARD_SINK[1] + 6))
    out.sy = 1 - 0.07 * Math.abs(bob) - 0.03 * (1 - sink)
    out.sx = 1 + 0.05 * Math.abs(bob)
  }
  const snug = phase(t, GUARD_SINK[0], GUARD_SINK[0] + 4) * (1 - phase(t, GUARD_SHED - 2, GUARD_SHED + 4))
  if (snug > 0) out.shade = glow(WHITE, 0.25 * snug)
  if (t >= GUARD_SINK[1] && t < GUARD_SINK[1] + 3) halo(out, g, WHITE)

  for (let i = 0; i < GUARD_PUFFS; i++) {
    const born = GUARD_WRAP[0] + i * ((GUARD_WRAP[1] - GUARD_WRAP[0] - 5) / GUARD_PUFFS)
    const age = t - born
    if (age < 0) continue
    const spot = guardSpot(g, i)
    const r = 1.6 + rnd(a.seed, i, 1) * 1
    const fly = phase(age, 0, 6)
    // Each puff spirals in from far out on its own side
    const ang = (i / GUARD_PUFFS) * TAU + (1 - fly) * 2.5
    const d = (1 - easeOut(fly)) * 10
    let x = spot.x + Math.cos(ang) * d
    let y = spot.y + Math.sin(ang) * d * 0.6
    let size = r * (0.5 + 0.5 * fly)
    if (t >= GUARD_SHED) {
      const drift = t - GUARD_SHED - rnd(a.seed, i, 2) * 3
      if (drift > 0) {
        x += Math.sin(drift * 0.4 + i) * 1.2 + (spot.x - g.cx) * drift * 0.04
        y -= drift * 0.7
        size *= 1 - drift / 12
      }
    } else if (fly >= 1) size += sink > 0 && sink < 1 && (t + i) % 4 < 2 ? 0.4 : 0
    if (size < 0.6 || y < 1) continue
    const paint = Math.sin(((i / GUARD_PUFFS) * TAU) - Math.PI / 2) < -0.2 ? dot : y > g.cy ? dot : back
    if (paint === back) {
      disc(out, x, y, size + 0.5, dark(fluff, 0.4), back)
      puff(out, x, y, size, fluff, a.seed + i, back)
    } else cotton(out, x, y, size, a.seed + i, fluff)
  }
  if (t >= GUARD_SINK[1] && t < GUARD_SHED) sparkles(out, t, a.seed, g.cx, g.cy, g.right - g.left + 6, g.bottom - g.top + 4, light(fluff, 0.2), 3)
}

const BOMB_HOLD = 3
const BOMB_THROW = 9
const BOMB_BLAST = 19
const BOMB_TICKS = 44
const SHELL = 0x8a5a2e
const SMOKE = 0x8a8478

// A big hard seed with a lit face, a dark shell and a green cap
function bigSeed(out, x, y, spin, c) {
  disc(out, x, y, 2.2, dark(SHELL, 0.3))
  disc(out, x - 0.3, y - 0.3, 1.6, SHELL)
  dot(out, x - 1, y - 1, light(SHELL, 0.4))
  const ang = spin
  dot(out, x + Math.cos(ang) * 2, y + Math.sin(ang) * 2, c)
  dot(out, x + Math.cos(ang) * 2.8, y + Math.sin(ang) * 2.8, light(c, 0.3))
}

// The mon hoists a big seed over its head and hurls it hard. It spins across in a low
// arc and goes off on the target in a fiery blast of shrapnel and smoke.
function seedbomb(out, t, a, g, c) {
  const side = g.side
  if (t >= 1 && t < BOMB_THROW) {
    out.dx = -side
    out.dy = t >= BOMB_HOLD ? -1 : 0
    out.skew = lean(g, -side * 2, out.dy)
  } else if (t >= BOMB_THROW && t < BOMB_THROW + 3) {
    out.dx = side
    out.skew = lean(g, side * 3)
  }
  const held = pt(g.cx - side * 1 + out.dx, Math.max(3, g.top - 2 + out.dy))
  const hit = pt(g.target.x, g.target.y)
  if (t >= BOMB_HOLD && t < BOMB_THROW) bigSeed(out, held.x, held.y, t * 0.4, c)
  if (t >= BOMB_THROW && t < BOMB_BLAST) {
    const f = phase(t, BOMB_THROW, BOMB_BLAST)
    const mid = pt((held.x + hit.x) / 2, Math.max(2, Math.min(held.y, hit.y) - 4))
    const p = bend(held, mid, hit, f)
    const q = bend(held, mid, hit, Math.max(0, f - 0.1))
    dot(out, q.x, q.y, light(c, 0.3))
    bigSeed(out, p.x, p.y, t * 1.1 * side, c)
  }
  const age = t - BOMB_BLAST
  if (age >= 0 && age < 22) {
    if (age === 0) disc(out, hit.x, hit.y, 3, WHITE)
    else if (age < 6) {
      const fire = [0xffe066, 0xffa030, mix(c, 0xffa030, 0.4)]
      puff(out, hit.x, hit.y, 2 + age, fire[Math.min(2, age >> 1)], a.seed + age)
      if (age < 4) ring(out, hit.x, hit.y, 3 + age * 1.5, age < 2 ? WHITE : light(c, 0.3))
    }
    if (age === 0) out.shake = [side * 2, 2]
    else if (age === 1) out.shake = [-side * 2, 1]
    else if (age === 2) out.shake = [side, 0]
    // Smoke drifts up off the blast
    if (age >= 4) {
      for (let k = 0; k < 3; k++) {
        const rise = (age - 4) * (0.5 + k * 0.15)
        const r = 1.5 + (age - 4) * 0.15
        if (age < 18 || (t + k) % 2) puff(out, hit.x + (k - 1) * 3 + Math.sin(age * 0.3 + k), hit.y - 2 - rise, r, SMOKE, a.seed + k)
      }
    }
    // Shrapnel: shell bits and seeds thrown out under gravity
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * TAU + rnd(a.seed, i, 1) * 0.5
      const speed = 1 + rnd(a.seed, i, 2) * 0.8
      const x = hit.x + Math.cos(ang) * speed * age
      const y = hit.y + Math.sin(ang) * speed * age * 0.8 + 0.08 * age * age
      if (age > 0 && age < 12 && y <= g.ground) dot(out, x, y, i % 3 === 0 ? c : i % 2 ? SHELL : light(SHELL, 0.3))
    }
  }
}

const BULLET_FIRST = 4
const BULLET_COUNT = 10
const BULLET_GAP = 2
const BULLET_FLY = 4
const BULLET_TICKS = 40

// The mon braces and spits a rapid stream of hard seeds, rocking back with each shot.
// They fly dead straight and pop on the target one after another, casings bouncing off.
function bulletseed(out, t, a, g, c) {
  const side = g.side
  const firing = t >= BULLET_FIRST && t < BULLET_FIRST + BULLET_COUNT * BULLET_GAP
  const shot = firing && (t - BULLET_FIRST) % BULLET_GAP === 0
  if (t >= 1 && t < BULLET_FIRST) {
    out.sy = 0.95
    out.sx = 1.03
  } else if (firing) {
    out.dx = shot ? -side : 0
    out.skew = lean(g, shot ? -side : 0)
  }
  const from = pt(g.mouth.x + out.dx, g.mouth.y)
  if (shot) {
    plus(out, from.x + side, from.y, light(c, 0.5), WHITE)
    dot(out, from.x + side * 2, from.y, light(c, 0.3))
  }
  emit(t, { count: BULLET_COUNT, gap: BULLET_GAP, start: BULLET_FIRST, life: BULLET_FLY + 8 }, (i, age) => {
    const to = pt(g.target.x - side * 2, g.target.y + ((i * 3) % 5) - 2)
    const start = pt(g.mouth.x + side, g.mouth.y)
    if (age < BULLET_FLY) {
      const f = (age + 1) / BULLET_FLY
      const x = lerp(start.x, to.x, f)
      const y = lerp(start.y, to.y, f)
      for (let d = 1; d <= 3; d++) dot(out, x - side * d, lerp(start.y, to.y, Math.max(0, f - d * 0.06)), d === 1 ? light(c, 0.4) : dark(c, 0.2 * d))
      dot(out, x, y, mix(c, SHELL, 0.4))
      dot(out, x + side, y, light(c, 0.3))
      dot(out, x, y + 1, dark(mix(c, SHELL, 0.4), 0.4))
      return
    }
    const pop = age - BULLET_FLY
    if (pop === 0) {
      spark(out, to.x, to.y, 2, light(c, 0.4))
      if (i % 2) out.shake = [side, 0]
    } else if (pop === 1) ring(out, to.x, to.y, 1.5, light(c, 0.3))
    // The split casing bounces back off the target
    const x = to.x - side * pop * 0.7
    const y = to.y - pop * 0.9 + pop * pop * 0.15
    if (pop > 0 && y <= g.ground) {
      dot(out, x, y, SHELL)
      dot(out, x - side, y + (pop % 2), light(SHELL, 0.3))
    }
  })
}

const KNOT_STOMP = 6
const KNOT_RUN = [7, 14]
const KNOT_GROW = [14, 21]
const KNOT_YANK = 24
const KNOT_TICKS = 46

// A curling blade of grass from the ground at x0 that arcs over to cross its twin
function bladeCurve(out, x0, ground, peak, cross, f, c, rim) {
  const top = pt((x0 + cross.x) / 2, ground - peak)
  const path = sample((u) => bend(pt(x0, ground), top, cross, u * f), peak + Math.abs(cross.x - x0))
  path.forEach((p) => dot(out, p.x + 1, p.y, rim))
  path.forEach((p, k) => dot(out, p.x, p.y, k > path.length - 3 ? light(c, 0.5) : c))
}

// The mon stomps and a ripple of grass runs along the ground to the target. Two long
// blades spring up round its feet, tie into a knot and yank tight, tripping it hard.
function grassknot(out, t, a, g, c) {
  const side = g.side
  const rim = dark(c, 0.5)
  if (t >= 1 && t < KNOT_STOMP) {
    out.dy = -Math.round(easeOut(phase(t, 1, 4)) * 2)
    out.skew = lean(g, -side, out.dy)
  } else if (t >= KNOT_STOMP && t < KNOT_STOMP + 2) {
    out.sy = 0.92
    out.sx = 1.05
    if (t === KNOT_STOMP) out.shake = [0, 1]
  }
  const startX = g.ahead(1)
  const tx = g.target.x
  // Tufts of grass pop up in a running line
  if (t >= KNOT_RUN[0] && t < KNOT_YANK + 4) {
    const run = easeIn(phase(t, ...KNOT_RUN))
    const steps = Math.abs(tx - startX)
    for (let d = 0; d <= steps * run; d += 2) {
      const x = startX + side * d
      const age = (run * steps - d) / 2
      const h = age < 1 ? 1 : age < 3 ? 2 : 1
      for (let k = 0; k < h; k++) dot(out, x, g.ground - k, k ? light(c, 0.3) : dark(c, 0.15))
    }
  }
  const knotY = g.ground - 6
  const grow = easeOut(phase(t, ...KNOT_GROW))
  const yank = phase(t, KNOT_YANK, KNOT_YANK + 2)
  if (t >= KNOT_GROW[0] && t < KNOT_TICKS - 4) {
    const fade = phase(t, KNOT_TICKS - 12, KNOT_TICKS - 4)
    if (fade < 0.5 || t % 2) {
      const pull = yank * 3
      const y = knotY + pull
      bladeCurve(out, tx - 5, g.ground, 9 - pull * 2, pt(tx + 2, y), grow, c, rim)
      bladeCurve(out, tx + 5, g.ground, 9 - pull * 2, pt(tx - 2, y), grow, light(c, 0.15), rim)
      // The loop of the knot where the blades cross
      if (grow >= 1) {
        ring(out, tx, y - 1.5, 1.5, light(c, 0.3))
        dot(out, tx, y, WHITE)
      }
    }
  }
  const trip = t - KNOT_YANK - 1
  if (trip >= 0 && trip < 6) {
    if (trip === 0) out.shake = [side, 2]
    else if (trip === 1) out.shake = [0, -1]
    for (const d of [-1, 1]) {
      for (let k = 0; k < 3; k++) dot(out, tx + d * (3 + trip + k), g.ground - 1 - Math.max(0, 2 - trip) + (k % 2), k ? BARK : light(BARK, 0.3))
    }
    if (trip < 3) burst(out, tx, g.ground - 2, 3 + trip, light(c, 0.4))
  }
  // Stars of dizziness circle over the tripped target
  if (t >= KNOT_YANK + 3 && t < KNOT_TICKS - 4) {
    for (let k = 0; k < 3; k++) {
      const ang = t * 0.4 + (k * TAU) / 3
      const x = tx + Math.cos(ang) * 4
      const y = Math.max(1, g.target.y - 6 + Math.sin(ang) * 1.2)
      if ((t + k) % 3) spark(out, x, y, 1, SUN)
      else dot(out, x, y, SUN)
    }
  }
}

const HORN_GLOW = 7
const HORN_HIT = 12
const HORN_SIP = [13, 24]
const HORN_HOME = 34
const HORN_TICKS = 46

// How far forward the charge has carried the mon
function hornDash(t, far) {
  if (t < HORN_GLOW) return t >= 2 ? -1 : 0
  if (t < HORN_HIT) return Math.round(lerp(-1, far, easeIn(phase(t, HORN_GLOW, HORN_HIT))))
  if (t < HORN_SIP[1]) return far
  return Math.round(far * (1 - easeInOut(phase(t, HORN_SIP[1], HORN_HOME))))
}

// A tapered horn of light from base along `ang`, thick at the root and sharp at the tip
function horn(out, base, len, ang, side, c, lit) {
  const d = toward(ang, side)
  for (let k = 0; k <= len; k++) {
    const x = base.x + d.x * k
    const y = base.y + d.y * k
    const tip = k >= len - 1
    dot(out, x, y, tip ? WHITE : lit ? light(c, 0.5) : light(c, 0.2))
    if (k < len * 0.7) dot(out, x, y + 1, dark(c, 0.3))
    if (k < len * 0.35) dot(out, x - d.x, y + 1, dark(c, 0.3))
  }
}

// The mon lowers its head and a horn of green light grows on its brow. It charges, gores
// the target, and life streams back up the horn into it before it springs home.
function hornleech(out, t, a, g, c) {
  const side = g.side
  const height = g.bottom - g.top
  const len = Math.max(3, Math.min(6, height * 0.35))
  const far = Math.max(2, Math.min(g.reach - Math.round(len) - 1, 8))
  out.dx = side * hornDash(t, far)
  if (t >= 2 && t < HORN_GLOW) out.skew = lean(g, -side)
  else if (t >= HORN_GLOW && t < HORN_HIT + 2) out.skew = lean(g, side * 3)
  if (t >= HORN_GLOW && t < HORN_HIT) out.ghosts = [1, 2].map((k) => ghost(side * hornDash(t - k, far), 0, light(c, 0.2), 0.45 + 0.2 * k))
  if (t >= HORN_HIT && t < HORN_HIT + 2) {
    out.sx = 0.93
    out.sy = 1.05
  }
  const browY = g.top + Math.max(1, Math.round(height * 0.2))
  const base = pt(g.frontAt(browY) - side + out.dx + (out.skew ? Math.round(out.skew(browY)) : 0), browY)
  const size = len * easeOut(phase(t, 2, HORN_GLOW)) * (1 - phase(t, HORN_HOME - 2, HORN_HOME + 4))
  const sipping = t >= HORN_SIP[0] && t < HORN_SIP[1]
  if (size >= 1) horn(out, base, Math.round(size), -0.35, side, c, sipping && t % 2 === 0)

  const tipAt = pt(base.x + toward(-0.35, side).x * len, base.y + toward(-0.35, side).y * len)
  const age = t - HORN_HIT
  if (age >= 0 && age < 5) {
    burst(out, tipAt.x, tipAt.y, [4, 5, 3, 2, 1][age], age < 2 ? WHITE : light(c, 0.3))
    if (age === 0) out.shake = [side * 2, 1]
    else if (age === 1) out.shake = [-side, 0]
  }
  // Life runs from the wound up the horn and into the mon
  const heart = pt(g.cx + out.dx, g.cy)
  emit(t, { count: 10, gap: 1, start: HORN_SIP[0], life: 6 }, (i, k, f) => {
    const from = pt(tipAt.x + side * (1 + (i % 3)), tipAt.y + (i % 2 ? 2 : -1))
    const mid = base
    const p = f < 0.5 ? pt(lerp(from.x, mid.x, f * 2), lerp(from.y, mid.y, f * 2)) : pt(lerp(mid.x, heart.x, f * 2 - 1), lerp(mid.y, heart.y, f * 2 - 1))
    plus(out, p.x, p.y, i % 2 ? light(c, 0.3) : c, WHITE)
  })
  const fill = phase(t, HORN_SIP[0] + 4, HORN_SIP[1]) * (1 - phase(t, HORN_SIP[1] + 2, HORN_TICKS - 3))
  if (fill > 0) {
    out.shade = tint(light(c, 0.55), 0.25 * fill + (t % 4 === 0 ? 0.08 : 0))
    if (t % 4 < 2 && t < HORN_HOME) halo(out, g, light(c, 0.3), out.dx)
  }
  if (t >= HORN_HOME - 4 && t < HORN_TICKS - 2) {
    for (let k = 0; k < 4; k++) {
      const x = g.left + rnd(a.seed, k, 6) * (g.right - g.left)
      const y = g.top + 2 + rnd(a.seed, k, 7) * 4 - (t - HORN_HOME + 4) * 0.6
      if ((t + k) % 3 && y > 0) plus(out, x, y, c, light(c, 0.6))
    }
  }
}

const FLARE_GATHER = [2, 16]
const FLARE_BLAST = 17
const FLARE_WAVE = [19, 31]
const FLARE_PILLAR = 31
const FLARE_FADE = 46
const FLARE_TICKS = 64
const FLARE_PETAL = 0xfff0b0

// Light seeds stream into the mon as a ring of petals unfolds behind it. It erupts in a
// blinding flash and a shockwave, a wave of light races along the ground, and a towering
// column of light bursts up under the target, showering seeds of light.
function seedflare(out, t, a, g, c) {
  const side = g.side
  const charge = phase(t, ...FLARE_GATHER)
  const rx = (g.right - g.left) / 2 + 3
  const ry = (g.bottom - g.top) / 2 + 2
  if (t >= 1 && t < FLARE_BLAST) {
    out.sy = 1 - 0.06 * charge
    out.sx = 1 + 0.04 * charge
    out.shade = tint(light(c, 0.6), 0.35 * charge + (t % 3 === 0 ? 0.1 : 0))
    if (t > FLARE_BLAST - 5) out.skew = lean(g, tremble(t))
  } else if (t >= FLARE_BLAST && t < FLARE_BLAST + 3) {
    out.shade = tint(WHITE, 0.8 - (t - FLARE_BLAST) * 0.25)
    out.sy = 1.06
    out.dy = -1
  } else if (t >= FLARE_BLAST + 3 && t < FLARE_BLAST + 9) out.shade = tint(light(c, 0.6), 0.25 * (1 - phase(t, FLARE_BLAST + 3, FLARE_BLAST + 9)))

  // Petals unfold into a turning ring behind the mon
  const open = easeOut(phase(t, FLARE_GATHER[0], FLARE_GATHER[0] + 8)) * (1 - phase(t, FLARE_BLAST, FLARE_BLAST + 4))
  if (open > 0) {
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * TAU + t * 0.08
      const x = g.cx + Math.cos(ang) * rx * open
      const y = g.cy + Math.sin(ang) * ry * open
      if (y > 0 && y < g.ground) leaf(out, x, y, ang, 2.5 * open + 0.5, 1.2, k % 2 ? FLARE_PETAL : light(c, 0.3), dark(c, 0.4), back)
    }
  }
  emit(t, { count: 20, gap: 0.6, start: FLARE_GATHER[0] + 2, life: 6 }, (i, age, f) => {
    const ang = rnd(a.seed, i, 1) * TAU
    const d = (rx + 6) * (1 - easeIn(f))
    plus(out, g.cx + Math.cos(ang) * d, g.cy + Math.sin(ang) * d * 0.7, f < 0.5 ? c : light(c, 0.5), WHITE)
  })

  // The flash and shockwave out of the mon
  const blast = t - FLARE_BLAST
  if (blast >= 0 && blast < 8) {
    if (blast < 2) halo(out, g, WHITE, 0, out.dy)
    ring(out, g.cx, g.cy, rx + blast * 2.5, blast < 3 ? WHITE : light(c, 0.3))
    if (blast > 1) ring(out, g.cx, g.cy, rx + blast * 2.5 - 2, c)
    if (blast < 3) out.shake = [blast % 2 ? -side : side, blast ? 0 : 1]
  }

  // A wave of light runs along the ground, spikes of light leaping up behind its front
  const tx = g.target.x
  const startX = g.ahead(1)
  const span = Math.abs(tx - startX)
  if (t >= FLARE_WAVE[0] && t < FLARE_WAVE[1] + 2) {
    const front = span * easeIn(phase(t, ...FLARE_WAVE))
    for (let d = Math.max(0, front - 8); d <= front; d++) {
      const x = startX + side * d
      const h = Math.max(0, 5 - (front - d) * 0.6) * (0.6 + 0.4 * rnd(a.seed, Math.round(d), t))
      for (let k = 0; k <= h; k++) dot(out, x, g.ground - k, k === Math.floor(h) ? WHITE : k ? light(c, 0.4) : c)
      if (d === Math.floor(front)) plus(out, x, g.ground - 2, light(c, 0.5), WHITE)
    }
  }

  // The pillar of light under the target
  const pillar = t - FLARE_PILLAR
  if (pillar >= 0 && t < FLARE_FADE + 8) {
    const rise = easeOut(phase(pillar, 0, 4))
    const fade = phase(t, FLARE_FADE, FLARE_FADE + 8)
    const half = (pillar < 2 ? 1.5 : 2.5 + Math.sin(t * 0.9) * 0.5) * (1 - fade)
    const topY = lerp(g.ground, 0, rise)
    for (let y = Math.round(topY); y <= g.ground; y++) {
      for (let dx = -Math.ceil(half); dx <= Math.ceil(half); dx++) {
        const edge = Math.abs(dx) >= half - 0.5
        if (fade > 0 && rnd(a.seed, y * 7 + dx, t) < fade) continue
        dot(out, tx + dx, y, edge ? light(c, 0.2) : Math.abs(dx) < half * 0.4 ? WHITE : light(c, 0.6))
      }
    }
    if (pillar === 0) out.shake = [side * 2, 2]
    else if (pillar === 1) out.shake = [-side * 2, 1]
    else if (pillar < 10 && pillar % 2) out.shake = [pillar % 4 === 1 ? 1 : -1, 0]
    // Seeds of light shower out of the column
    emit(t, { count: 16, gap: 0.8, start: FLARE_PILLAR + 1, life: 14 }, (i, age, f) => {
      const d = i % 2 ? 1 : -1
      const x = tx + d * (half + age * (0.4 + rnd(a.seed, i, 3) * 0.6))
      const y = g.ground - 2 - rnd(a.seed, i, 4) * (g.ground - 2) * 0.8 + age * 0.4 + age * age * 0.03
      if (y > g.ground || (f > 0.7 && t % 2)) return
      plus(out, x, y, f < 0.4 ? light(c, 0.4) : c, f < 0.5 ? WHITE : light(c, 0.6))
    })
  }
}

export const NATURE = {
  vinewhip: { ticks: 40, color: 0x3fa34d, draw: vinewhip },
  razorleaf: { ticks: 40, color: 0x5cc05c, draw: razorleaf },
  petaldance: { ticks: PETAL_TICKS, color: 0xff8fc8, pose: (t) => ({ stride: t < DANCE_END }), draw: petaldance },
  leechseed: { ticks: 52, color: 0x8fc84a, draw: leechseed },
  drain: { ticks: 46, color: 0x7cff7c, draw: drain },
  leechlife: { ticks: 44, color: 0xff5a6e, draw: leechlife },
  powder: { ticks: 50, color: 0xe8d26a, draw: powder },
  stringshot: { ticks: 40, color: 0xf8f8f8, draw: stringshot },
  gigadrain: { ticks: GIGA_TICKS, color: 0x5ed85e, draw: gigadrain },
  synthesis: { ticks: SYN_TICKS, color: 0x9ad84a, pose: { view: 'front' }, draw: synthesis },
  ingrain: { ticks: INGRAIN_TICKS, color: 0x7fb24a, pose: { view: 'front' }, draw: ingrain },
  cottonspore: { ticks: SPORE_TICKS, color: COTTON, draw: cottonspore },
  magicalleaf: { ticks: 46, color: 0x7ad85a, draw: magicalleaf },
  leafblade: { ticks: 36, color: 0x4ccf5a, draw: leafblade },
  leafstorm: { ticks: STORM_TICKS, color: 0x58c848, draw: leafstorm },
  grasswhistle: { ticks: WHISTLE_TICKS, color: 0x8ee07a, draw: grasswhistle },
  aromatherapy: { ticks: AROMA_TICKS, color: 0xe89ad8, pose: { view: 'front' }, draw: aromatherapy },
  energyball: { ticks: ORB_TICKS, color: 0x9ee05a, draw: energyball },
  powerwhip: { ticks: WHIP_TICKS, color: 0x2f9a3e, draw: powerwhip },
  worryseed: { ticks: WORRY_TICKS, color: 0x9fc85a, draw: worryseed },
  leaftornado: { ticks: TWISTER_TICKS, color: 0x6ccf4a, draw: leaftornado },
  needlearm: { ticks: NEEDLE_TICKS, color: 0x5aa84a, draw: needlearm },
  woodhammer: { ticks: HAMMER_TICKS, color: 0xa8743a, draw: woodhammer },
  cottonguard: { ticks: GUARD_TICKS, color: COTTON, pose: { view: 'front' }, draw: cottonguard },
  seedbomb: { ticks: BOMB_TICKS, color: 0x8fbf4a, draw: seedbomb },
  bulletseed: { ticks: BULLET_TICKS, color: 0x9ccf4a, draw: bulletseed },
  grassknot: { ticks: KNOT_TICKS, color: 0x5cc05c, draw: grassknot },
  hornleech: { ticks: HORN_TICKS, color: 0x6cd06c, draw: hornleech },
  seedflare: { ticks: FLARE_TICKS, color: 0xa8f070, draw: seedflare },
}
