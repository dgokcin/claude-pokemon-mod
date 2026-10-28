import { METER_STYLES } from './art.js'
import { HEAL_MS, HEALED_HAPPINESS } from './records.js'
import { S } from './state.js'
import { isDead, isHealing } from './status.js'

// Food and happiness: how they drain, fill, and park, and the icons that show them

// Each stat drains from full to empty over its hours, per mon. It's stored with a
// timestamp, which slowMeters moves on past most of the time when no session ran
export const STATS = {
  food: { hoursToEmpty: 8 },
  happiness: { hoursToEmpty: 12 },
}
const START_STAT = 80
// One icon's worth, so each berry adds exactly one icon
export const FEED_FOOD = 20
export const FEED_HAPPINESS = 5
export const NEEDY_BELOW = 30
export const STAT_ICONS = 5
export const meterStyle = () => (S.emojiOn ? METER_STYLES.emoji : METER_STYLES.text)
// The columns a meter takes in the active style
export const meterColumns = () => STAT_ICONS * meterStyle().columns

// How fast each meter drains while tucked in, as a share of its awake rate
const SLEEP_DRAIN = { food: 0.5, happiness: 0.25 }

const clampStat = (v) => Math.max(0, Math.min(100, v))

// At the Pokémon Center, happiness fills from where it fainted to full over the heal
function healedHappiness(name, fainted) {
  const { from, until } = S.stats[name].healing
  const start = Math.min(from ?? until - HEAL_MS, until)
  const share = until > start ? Math.max(0, Math.min(1, (S.nowMs - start) / (until - start))) : 1
  return clampStat(fainted + (HEALED_HAPPINESS - fainted) * share)
}

export function statNow(name, key) {
  const saved = S.stats[name]?.[key]
  if (!saved) return START_STAT
  if (key === 'happiness' && isHealing(name)) return healedHappiness(name, saved.value)
  if (S.stats[name].parked) return clampStat(saved.value)
  const perMs = (100 / (STATS[key].hoursToEmpty * 3600 * 1000)) * (S.stats[name]?.asleep ? SLEEP_DRAIN[key] : 1)
  return clampStat(saved.value - perMs * Math.max(0, S.nowMs - saved.at))
}

export function bumpStat(key, amount, name = S.mon) {
  S.stats[name] = { ...S.stats[name], [key]: { value: clampStat(statNow(name, key) + amount), at: S.nowMs } }
}

// Only the mons on show drain. Switching away parks a mon's meters where they are, and
// they pick up from there when it's shown again, so a mon left alone for weeks isn't
// starving when it comes back. XP is the shown mon's alone already. A mon parked while
// another session still shows it goes back to draining at that session's next sync.
export function park(name) {
  if (!S.stats[name] || S.stats[name].parked || isDead(name)) return
  const record = { ...S.stats[name], parked: true }
  for (const key of Object.keys(STATS)) if (record[key]) record[key] = { value: statNow(name, key), at: S.nowMs }
  S.stats[name] = record
}

export function unpark(name) {
  if (!S.stats[name]?.parked) return
  const { parked, ...record } = S.stats[name]
  for (const key of Object.keys(STATS)) if (record[key]) record[key] = { ...record[key], at: S.nowMs }
  S.stats[name] = record
}

// Five icons, each worth 20%, rounding up so any food or love left shows at least one.
export const filledIcons = (key, name = S.mon) => Math.ceil(statNow(name, key) / (100 / STAT_ICONS))
// Full when every food icon is filled
export const isFull = () => filledIcons('food') === STAT_ICONS
// As happy as can be when every heart is filled
export const isHappiest = () => filledIcons('happiness') === STAT_ICONS

export function iconsFor(key, name = S.mon) {
  const style = meterStyle()
  const filled = filledIcons(key, name)
  return style[key].icon.repeat(filled) + (style[key].emptyIcon + ' '.repeat(style.columns - 1)).repeat(STAT_ICONS - filled)
}
