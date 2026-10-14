import { aimsAhead } from './attacks.js'
import { FALLBACK_MOVES } from './commands.js'
import { dexKey, tierOf, TIERS } from './dex.js'
import { bandRows, foeMiddle } from './layout.js'
import { movesOf } from './moves.js'
import { displayName } from './names.js'
import { BALL } from './party.js'
import { levelOf } from './records.js'
import { VARIANTS } from './sprites.js'
import { S } from './state.js'
import { thrownWild } from './wild.js'

// The wild mon on show, kept as data in wild.js, as the home mon faces it: its name, the
// moves that reach it, the ball thrown at it, and a mon that ran away coming back as one

export const wildName = () => (S.wild.variant === 'shiny' ? 'shiny wild ' : 'wild ') + displayName(S.wild.mon)

// Throw a ball at the foe in battle. It falls from the foe's middle to the ground.
export function catchCommand() {
  if (S.wild?.phase !== 'battle' && S.wild?.phase !== 'throw') return { text: 'There\'s no wild Pokémon here.' }
  if (S.attack || S.wild.phase === 'throw') return { text: 'Wait for the move to end.' }
  const rows = bandRows()
  const drop = Math.max(0, rows * 2 - BALL.length - (foeMiddle(rows).y - Math.floor(BALL.length / 2)))
  S.wild = thrownWild(S.wild, S.tick, drop)
  return { text: 'You threw a Poké Ball!' }
}

// The moves that can reach a foe in front of the mon
export function foeMoves() {
  const moves = movesOf(S.mon).filter(aimsAhead)
  return moves.length > 0 ? moves : FALLBACK_MOVES
}

// A mon that ran away turns up again at its own level and variant, a tier harder and
// harder still to hold in a ball
const TIER_ORDER = Object.keys(TIERS)
const RUNAWAY_CATCH = 0.5

export function runawayFoe(name) {
  const tier = TIER_ORDER[Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(tierOf(name)) + 1)]
  const variant = VARIANTS.includes(S.stats[name].ranAway.variant) ? S.stats[name].ranAway.variant : 'default'
  return { mon: name, variant, key: dexKey(name), tier, level: levelOf(name), runaway: true, catchScale: RUNAWAY_CATCH }
}
