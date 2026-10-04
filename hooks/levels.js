// Levels follow the medium fast curve from the games, where reaching level L takes
// L ** 3 XP in total.

export const MAX_LEVEL = 100

const TURN_XP = 10
const TURN_XP_PER_LEVEL = 2
const LONG_TURN_MS = 2 * 60 * 1000

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export const xpAt = (level) => level ** 3

// The level counts up through whole cubes, so a perfect cube lands exactly on its level
export function levelAt(xp) {
  let level = 1
  while (level < MAX_LEVEL && xpAt(level + 1) <= xp) level++
  return level
}

// Care multiplies XP by 0.5 when both meters (0 to 100) are empty and 1.5 when both are full
export const careOf = (food, happiness) => 0.5 + (food + happiness) / 200

// A turn earns more XP at a higher level and with more care. Its length adds up to
// double the XP, reached at LONG_TURN_MS.
export function turnXp({ level, durationMs, care }) {
  const length = 1 + clamp(durationMs / LONG_TURN_MS, 0, 1)
  return Math.max(1, Math.round((TURN_XP + TURN_XP_PER_LEVEL * level) * length * care))
}
