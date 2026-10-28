import { TICK_MS } from './constants.js'
import { levelEvolutionOf, startLevel } from './evolutions.js'
import { levelAt, MAX_LEVEL, xpAt } from './levels.js'
import { displayName } from './names.js'
import { S } from './state.js'
import { hasRunAway, isDead, isDown, isFainted, isGone, isHealing } from './status.js'

// A mon's record as this session reads it: its name, XP, and level, what its level lets
// it evolve into, and whether it has fainted, is healing, or is gone

// A nickname lives in the mon's record too, so it follows the mon through evolution
export const nameOf = (name) => S.stats[name]?.nickname ?? displayName(name)

// Like "Sparky (Pikachu)", or just "Pikachu" without a nickname
export const fullNameOf = (name) => (S.stats[name]?.nickname ? S.stats[name].nickname + ' (' + displayName(name) + ')' : displayName(name))

// XP lives in each mon's record. A mon that hasn't earned any starts at its first level.
export const xpOf = (name) => S.stats[name]?.xp ?? xpAt(startLevel(name))
export const levelOf = (name) => levelAt(xpOf(name))

// The level line above the meters, at most five columns wide
export const levelLine = () => (levelOf(S.mon) < MAX_LEVEL ? 'Lv ' : 'Lv') + levelOf(S.mon)

// The mon its level lets it become, while it isn't evolving already
export function readyToEvolve() {
  const evolution = levelEvolutionOf(S.mon)
  return evolution && levelOf(S.mon) >= evolution.level && !S.evolving && !isDown() ? evolution.into : null
}

export const HEAL_MS = 5 * 60 * 1000
const REVIVED = { food: 50, happiness: 30 }
// A heal at the Pokémon Center fills the hearts all the way
export const HEALED_HAPPINESS = 100

export const revivedMeters = () => ({ food: { value: REVIVED.food, at: S.nowMs }, happiness: { value: REVIVED.happiness, at: S.nowMs } })

export const conditionOf = (name) => (hasRunAway(name) ? 'ran away' : isHealing(name) ? 'healing' : isFainted(name) ? 'fainted' : null)

export const goneLine = (name) => (isDead(name) ? displayName(name) + ' fainted for good. Rest well.' : nameOf(name) + ' ran away. It may turn up in the wild.')

// What a command the shown mon can't do while it's down says instead
export function downReply() {
  const name = nameOf(S.mon)
  if (isGone(S.mon)) return { text: goneLine(S.mon) + ' /pokemon <mon> picks another.' }
  if (isHealing(S.mon)) {
    const minutes = Math.max(1, Math.ceil((S.stats[S.mon].healing.until - S.nowMs) / 60000))
    return { text: name + ' is resting at the Pokémon Center. It\'s back in ' + minutes + ' min.' }
  }
  return { text: name + ' has fainted. /pokemon revive takes it to a Pokémon Center.' }
}

// The heal in this session's ticks, from its saved times, so a session started midway
// joins it where it's at
export function healTicks() {
  const { from, until } = S.stats[S.mon].healing
  const start = Math.min(from ?? until - HEAL_MS, until)
  return { startTick: S.tick - Math.max(0, Math.round((S.nowMs - start) / TICK_MS)), endTick: S.tick + Math.round((until - S.nowMs) / TICK_MS) }
}

// A heal that's over stands the mon up with half its food, full happiness, and a fresh faint clock
export function settleHeal(name) {
  if (!isHealing(name) || S.nowMs < S.stats[name].healing.until) return false
  const { fainted, healing, starving, ...record } = S.stats[name]
  S.stats[name] = { ...record, ...revivedMeters(), happiness: { value: HEALED_HAPPINESS, at: S.nowMs } }
  return true
}

export const healingReply = () => ({ text: downReply().text + ' Wait for it before switching.' })
