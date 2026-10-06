// Attack animations for /pokemon attack. Each effect is a pure function of the
// attack, its age in ticks, and where the mon stands. It paints pixels over and
// under the sprite, and can move, squash, turn, recolor, or hide the sprite itself.
// The effects live in effects/, one file per family, on the helpers in effects/draw.js.
//
// Coordinates are strip pixels: x is a column, y a half row from the top.
// `side` is 1 when the attack goes right and -1 when it goes left.

import { BASIC } from './effects/basic.js'
import { BEAMS } from './effects/beams.js'
import { CHARGES } from './effects/charge.js'
import { EARTH } from './effects/earth.js'
import { ELECTRIC } from './effects/electric.js'
import { EVOLVE } from './effects/evolve.js'
import { FIRE } from './effects/fire.js'
import { GUARD } from './effects/guard.js'
import { MIND } from './effects/mind.js'
import { NATURE } from './effects/nature.js'
import { POISON } from './effects/poison.js'
import { SELF } from './effects/self.js'
import { SKY } from './effects/sky.js'
import { SOUND } from './effects/sound.js'
import { SPECIAL } from './effects/special.js'
import { STRIKES } from './effects/strikes.js'
import { WATER } from './effects/water.js'
import { WEAPONS } from './effects/weapons.js'
import { clamp } from './effects/draw.js'

const EFFECTS = {
  ...BASIC, ...BEAMS, ...CHARGES, ...EARTH, ...ELECTRIC, ...EVOLVE, ...FIRE, ...GUARD, ...MIND,
  ...NATURE, ...POISON, ...SELF, ...SKY, ...SOUND, ...SPECIAL, ...STRIKES, ...WATER, ...WEAPONS,
}

const FALLBACK = 'impact'
const MOUTH = 0.35
const POSE = { view: 'side', stride: false, swap: false, asleep: false }

export const effectOf = (id) => (EFFECTS[id] ? id : FALLBACK)

// The parts of an attack its move decides: the effect and its options, how long it
// plays, and where it leaves the mon (toX, or null to stay put)
export function prepareAttack(move, { side, seed, x, home }) {
  const effect = effectOf(move.effect)
  const spec = EFFECTS[effect]
  const attack = {
    effect,
    color: move.color ?? null,
    from: move.from ?? null,
    mouth: move.mouth ?? MOUTH,
    power: move.power ?? spec.power ?? 1,
    ticks: spec.ticks,
    side,
    seed,
  }
  attack.toX = spec.lands ? clamp(Math.round(spec.lands(attack, x, home)), 0, home) : null
  return attack
}

// How the sprite stands this tick, needed before it is drawn: side on or facing out,
// striding, swapped for another mon, or asleep
export function attackPose(attack, t) {
  const pose = EFFECTS[attack.effect].pose
  return { ...POSE, ...(typeof pose === 'function' ? pose(t, attack) : pose) }
}

// Whether a move plays side on toward a target, staying where it stands. Only those
// can hit a foe in front of the mon.
export function aimsAhead(move) {
  const effect = effectOf(move.effect)
  if (EFFECTS[effect].lands || effect === 'transform') return false
  return attackPose(prepareAttack(move, { side: 'left', seed: 0, x: 0, home: 0 }), 0).view === 'side'
}

// The attack's drawing this tick, described in effects/draw.js
export function attackFrame(attack, t, g) {
  const out = {
    dots: [], under: [], chars: [], ghosts: [], hidden: false,
    dx: 0, dy: 0, sx: 1, sy: 1, flipX: false, flipY: false, skew: null, shade: null, shake: [0, 0],
  }
  const spec = EFFECTS[attack.effect]
  spec.draw(out, t, attack, aim(g, attack), attack.color ?? spec.color)
  return out
}

// Where the attack starts and lands. frontAt(y) is just in front of the sprite on row y.
// The mouth is the front a third of the way down, which is the face for nearly every
// side-on mon. A move can set its own `mouth` height for a mon whose face sits lower.
// With a foe's box in g.foe, the move aims at the middle of the foe.
function aim(g, a) {
  const cx = Math.round((g.left + g.right) / 2)
  const cy = Math.round((g.top + g.bottom) / 2)
  const frontAt = (y) => {
    let x = g.side > 0 ? g.right : g.left
    while (x !== cx && !g.solid(x, y)) x -= g.side
    return x + g.side
  }
  const my = g.top + Math.round((g.bottom - g.top + 1) * a.mouth)
  const mouth = { x: frontAt(my), y: my }
  const ground = g.pixels - 1
  const ahead = (d) => mouth.x + g.side * d
  let reach = g.side > 0 ? g.columns - 1 - mouth.x : mouth.x
  let target = { x: ahead(clamp(reach - 4, 3, 13)), y: clamp(ground - 7, mouth.y, ground - 3) }
  if (g.foe) {
    target = { x: Math.round((g.foe.left + g.foe.right) / 2), y: Math.round((g.foe.top + g.foe.bottom) / 2) }
    reach = Math.abs(target.x - mouth.x)
  }
  const geo = { ...g, cx, cy, frontAt, mouth, ground, reach, ahead, target }
  if (a.from === 'top') geo.crown = crownOf(geo)
  return geo
}

// The middle of the sprite's topmost row of pixels, like the tip of a bulb
function crownOf(g) {
  let left = g.right
  let right = g.left
  for (let x = g.left; x <= g.right; x++) {
    if (!g.solid(x, g.top)) continue
    left = Math.min(left, x)
    right = Math.max(right, x)
  }
  return { x: Math.round((left + right) / 2), y: g.top }
}
