// Grass and bug moves

import {
  WHITE, back, ball, burst, dark, disc, dot, easeIn, easeInOut, easeOut, emit, ghost, lerp, light,
  line, mix, phase, plus, puff, ring, rnd, spark, stamp, tint, tremble,
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

export const NATURE = {
  vinewhip: { ticks: 40, color: 0x3fa34d, draw: vinewhip },
  razorleaf: { ticks: 40, color: 0x5cc05c, draw: razorleaf },
  petaldance: { ticks: PETAL_TICKS, color: 0xff8fc8, pose: (t) => ({ stride: t < DANCE_END }), draw: petaldance },
  leechseed: { ticks: 52, color: 0x8fc84a, draw: leechseed },
  drain: { ticks: 46, color: 0x7cff7c, draw: drain },
  leechlife: { ticks: 44, color: 0xff5a6e, draw: leechlife },
  powder: { ticks: 50, color: 0xe8d26a, draw: powder },
  stringshot: { ticks: 40, color: 0xf8f8f8, draw: stringshot },
}
