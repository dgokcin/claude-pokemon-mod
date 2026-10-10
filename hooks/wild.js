import { TIERS } from './dex.js'
import { rnd } from './effects/draw.js'

// A wild mon's visit, kept as plain data. The home mon walks home while the foe is
// calling, then the foe walks in from the scene's left edge, stands facing the home mon
// in battle, and walks back off the way it came when it flees. A thrown ball holds it
// in the throw phase until it's caught or breaks free. A function that moves the visit on
// returns a new wild, or null once it's gone, and leaves its input alone.

const WILD_LEFT = 2
const WILD_GAP = 8
export const WILD_STAY_MS = 4 * 60 * 1000
// How long a worn out foe waits for a ball
export const WORN_OUT_MS = 90 * 1000
// The fewest milliseconds between the home mon's moves at the foe, and the most added at random
export const ATTACK_GAP_MS = 6000
export const ATTACK_JITTER_MS = 2000
// Main turns that may end before an uncaught foe leaves
export const WILD_TURNS = 4
const WALK_TICKS = 2
const MAX_HP = 100
const MAX_CHARGE = 2
// A hit jolts the foe a pixel to either side in turn, and blinks it, in 2-tick phases
const JOLT_TICKS = 12
const BLINK_TICKS = 8
const HP_BAR = 12
const HP_COLORS = [[0.5, 0x48c858], [0.2, 0xe8c030], [0, 0xe04040]]

// How long each stage of a throw takes, in ticks. The drop's length depends on how far
// the ball falls, and wobble takes shake ticks per shake.
export const THROW_TICKS = { arc: 14, open: 3, bounce: 4, shake: 12, caught: 20, breakout: 7 }

export const newWild = (pick, seed) => ({
  ...pick,
  seed,
  throws: 0,
  throw: null,
  phase: 'calling',
  walked: 0,
  x: 0,
  leaveAt: null,
  hp: MAX_HP,
  maxHp: MAX_HP,
  charge: 0,
  nextAttackAt: 0,
  hitAt: null,
  turns: 0,
})

// Work done while the foe is in battle, or held in a ball, banks a move, up to MAX_CHARGE
export const chargedWild = (wild) =>
  wild?.phase === 'battle' || wild?.phase === 'throw' ? { ...wild, charge: Math.min(MAX_CHARGE, wild.charge + 1) } : wild

// A worn out foe is a sure catch. Otherwise the odds grow from 0 at full HP to its tier's best.
// A foe with a catchScale, like a mon that ran away from you, is that much harder to hold.
const catchChance = (wild) => (wild.hp === 0 ? 1 : TIERS[wild.tier].catch * (1 - wild.hp / wild.maxHp)) * (wild.catchScale ?? 1)

// The times the ball rocks before it clicks shut, or before the foe breaks out
const shakesFor = (chance, caught) => (caught ? 3 : Math.min(3, Math.floor(chance * 4)))

// Throw a ball, rolling its outcome up front. drop is how many pixels it falls from the foe to the ground.
export function thrownWild(wild, tick, drop) {
  const throws = wild.throws + 1
  const chance = catchChance(wild)
  const caught = rnd(wild.seed, throws) < chance
  return { ...wild, phase: 'throw', throws, throw: { start: tick, caught, shakes: shakesFor(chance, caught), drop } }
}

// Which stage of the throw plays at tick, and the ticks since it began. Past the last, 'done'.
export function throwStage(thrown, tick) {
  let t = tick - thrown.start
  const stages = [
    ['arc', THROW_TICKS.arc],
    ['open', THROW_TICKS.open],
    ['drop', thrown.drop + THROW_TICKS.bounce],
    ['wobble', THROW_TICKS.shake * thrown.shakes],
    thrown.caught ? ['caught', THROW_TICKS.caught] : ['breakout', THROW_TICKS.breakout],
  ]
  for (const [stage, ticks] of stages) {
    if (t < ticks) return { stage, t }
    t -= ticks
  }
  return { stage: 'done', t }
}

// What a move takes off the foe: a share of its HP by tier, 0.8 to 1.2 of it by roll,
// and half again for a power 2 move
export const damageOf = (wild, power, roll) => (wild.maxHp / TIERS[wild.tier].hits) * (0.8 + 0.4 * roll) * (power >= 2 ? 1.5 : 1)

export const foeJolt = (wild, tick) =>
  wild.hitAt !== null && tick - wild.hitAt < JOLT_TICKS ? (Math.floor((tick - wild.hitAt) / 2) % 2 === 0 ? -1 : 1) : 0

export const foeBlinks = (wild, tick) => wild.hitAt !== null && tick - wild.hitAt < BLINK_TICKS && Math.floor((tick - wild.hitAt) / 2) % 2 === 1

// The HP bar as stamp rows and colors: filled from the left in green, yellow, or red by
// what's left, the rest in empty
export function hpBar(wild, empty) {
  const share = wild.hp / wild.maxHp
  const filled = Math.ceil(share * HP_BAR)
  const color = HP_COLORS.find(([above]) => share > above)?.[1] ?? HP_COLORS[2][1]
  return { rows: ['f'.repeat(filled) + 'e'.repeat(HP_BAR - filled)], colors: { f: color, e: empty }, width: HP_BAR }
}

// Drawn in the scene, from walking in to walking off
export const isOnStage = (wild) => wild !== null && wild.phase !== 'calling'

// Here to fight: walking in, standing, or held in a ball for now
export const isHere = (wild) => wild !== null && ['entering', 'battle', 'throw'].includes(wild.phase)

// The strip columns a battle takes: WILD_LEFT, the foe's body, the gap, and homeSpan, from
// the home mon's body to the strip's right edge. foe is the box of the foe's idle frame.
export const battleColumns = (homeSpan, foe) => WILD_LEFT + foe.right - foe.left + 1 + WILD_GAP + homeSpan

// The strip column of the foe's frame when its body stands WILD_GAP columns left of homeLeft
export const foeSpotX = (homeLeft, foe) => homeLeft - WILD_GAP - foe.right - 1

// Where the foe's frame is now. It enters from just past the scene's left edge, offLeft,
// so it starts out of sight however wide the strip grows meanwhile.
export function foeX(wild, { spot, offLeft }) {
  if (wild.phase === 'entering') return Math.min(spot, offLeft + wild.walked)
  if (wild.phase === 'fleeing') return wild.x
  return spot
}

// Walk off from where it is. One still calling hasn't shown up, so it just goes.
export function fleeingWild(wild, at) {
  if (wild.phase === 'calling') return null
  if (wild.phase === 'fleeing') return wild
  return { ...wild, phase: 'fleeing', x: foeX(wild, at) }
}

// One tick of the visit, with the event it reached: 'arrived' when the foe takes its
// spot, 'timeout' when it leaves for want of a fight, 'caught' when the ball clicks shut,
// 'brokefree' when the foe breaks out, and 'gone' once it's out of sight or in the ball.
// at holds spot and offLeft as foeX takes them, and stayTicks is how long it waits for a fight.
export function stepWild(wild, { tick, atHome, at, stayTicks }) {
  const moves = tick % WALK_TICKS === 0
  if (wild.phase === 'calling') return { wild: atHome ? { ...wild, phase: 'entering', walked: 0 } : wild }
  if (wild.phase === 'entering') {
    if (!moves) return { wild }
    const next = { ...wild, walked: wild.walked + 1 }
    if (at.offLeft + next.walked < at.spot) return { wild: next }
    return { wild: { ...next, phase: 'battle', leaveAt: tick + stayTicks }, event: 'arrived' }
  }
  if (wild.phase === 'battle') {
    if (tick < wild.leaveAt) return { wild }
    return { wild: fleeingWild(wild, at), event: 'timeout' }
  }
  if (wild.phase === 'throw') {
    const { stage } = throwStage(wild.throw, tick)
    if (stage === throwStage(wild.throw, tick - 1).stage) return { wild }
    if (stage === 'caught' || stage === 'breakout') return { wild, event: stage === 'caught' ? 'caught' : 'brokefree' }
    if (stage !== 'done') return { wild }
    if (wild.throw.caught) return { wild: null, event: 'gone' }
    return { wild: { ...wild, phase: 'battle', throw: null, leaveAt: tick + stayTicks } }
  }
  if (!moves) return { wild }
  if (wild.x - 1 <= at.offLeft) return { wild: null, event: 'gone' }
  return { wild: { ...wild, x: wild.x - 1 } }
}
