import { isAlerted } from './bubble.js'
import { FLINCH_TICKS, HOP_TICKS, SHAKE_TICKS, SLEEP_AFTER_MS, TICK_MS } from './constants.js'
import { isHome } from './layout.js'
import { S } from './state.js'

// What the shown mon is doing or going through right now

export const isHopping = () => S.tick - S.hopStart < HOP_TICKS
export const isPetted = () => S.tick < S.petUntil
export const isFlinching = () => S.tick - S.flinchStart < FLINCH_TICKS
// Put to bed with /pokemon sleep, saved with the mon's meters so it stays asleep across sessions.
export const isTuckedIn = () => S.stats[S.mon]?.asleep === true
// Five quiet minutes make it drowsy, in this session only
export const isDrowsy = () => (S.tick - S.lastActive) * TICK_MS >= SLEEP_AFTER_MS
// Tucked in or drowsy, it walks home first and falls asleep once it gets there
export const isAsleep = () => !S.working && (isTuckedIn() || isDrowsy()) && isHome() && !isDown()

// A mon that ran away keeps its record, marked ranAway, and a dead one keeps only its
// dead mark, so the species stays locked until a new one is caught. A fainted one keeps
// fainted until it's healed, with healing set while it's at the Pokémon Center.
export const isDead = (name) => Boolean(S.stats[name]?.dead)
export const hasRunAway = (name) => Boolean(S.stats[name]?.ranAway) && !isDead(name)
export const isGone = (name) => isDead(name) || hasRunAway(name)
export const isFainted = (name) => Boolean(S.stats[name]?.fainted) && !isGone(name)
export const isHealing = (name) => isFainted(name) && typeof S.stats[name].healing?.until === 'number'
// The shown mon is fainted or gone, so it stays still and nothing it does runs
export const isDown = () => isFainted(S.mon) || isGone(S.mon)

export function markActive() {
  S.lastActive = S.tick
}

// The flinch shows unless a move plays or the mon is calling you over
export const isWincing = () => isFlinching() && !S.attack && !isAlerted()
export const isShaking = () => isWincing() && S.tick - S.flinchStart < SHAKE_TICKS

export const isBackingUp = () => S.attack !== null && S.attack.backing === true

// A due evolution waits until the mon is idle, awake, not calling you over, done with
// any move or berry, and rid of any wild mon
export const isFree = () => !S.working && !S.attack && !S.food && !S.wild && !isAsleep() && !isAlerted() && !isDown()
