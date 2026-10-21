import { DEX, dexKey, dexNumber, isCaught, tierOf } from './dex.js'
import { evolutionsOf } from './evolutions.js'
import { MAX_LEVEL, xpAt } from './levels.js'
import { iconsFor, statNow } from './meters.js'
import { displayName } from './names.js'
import { conditionOf, downReply, fullNameOf, goneLine, levelOf, nameOf, readyToEvolve, xpOf } from './records.js'
import { MONS } from './sprites.js'
import { S } from './state.js'
import { hasRunAway, isDead, isFainted, isGone } from './status.js'

// The replies that tell you things: stats, the box, the Pokédex, and help

// Joins items as "A", "A or B", or "A, B, or C"
export const orList = (items) => (items.length < 3 ? items.join(' or ') : items.slice(0, -1).join(', ') + ', or ' + items.at(-1))

// How one entry evolves the mon, like "Jolteon with a Thunder Stone"
export function evolutionText(entry) {
  const into = displayName(entry.into)
  if (entry.item) return into + ' with a ' + entry.item
  return entry.trade ? into + ' by trade' : into + ' at Lv. ' + entry.level
}

// Like "Pikachu, Lv. 12, 1820 XP (377 to Lv. 13). Can become Raichu with a Thunder Stone.
// Food 50%, happiness 67%. 12 pets, 5 feeds."
export function statsText(pets, feeds) {
  if (isGone(S.mon)) return goneLine(S.mon) + ' /pokemon <mon> picks another.'
  const level = levelOf(S.mon)
  const next = level < MAX_LEVEL ? ' (' + (xpAt(level + 1) - xpOf(S.mon)) + ' to Lv. ' + (level + 1) + ')' : ''
  const evolutions = evolutionsOf(S.mon)
  const ready = readyToEvolve()
  const becomes = ready
    ? ' Ready to evolve into ' + displayName(ready) + '. /pokemon evolve lets it.'
    : evolutions.length > 0 ? ' Can become ' + orList(evolutions.map(evolutionText)) + '.' : ''
  const meters = S.needsOn
    ? ' Food ' + Math.round(statNow(S.mon, 'food')) + '%, happiness ' + Math.round(statNow(S.mon, 'happiness')) + '%.'
    : ' Needs are off.'
  const state = isFainted(S.mon) ? ' ' + downReply().text : ''
  return fullNameOf(S.mon) + ', Lv. ' + level + ', ' + xpOf(S.mon) + ' XP' + next + '.' + becomes + meters + state + ' ' + pets + ' pets, ' + feeds + ' feeds.'
}

// Every mon with a saved record, one a line, like "Charizard ◓, Lv. 36 ●●●○○ ♥♥♥♡♡ (active)",
// highest level first, where ◓ marks a mon caught in the wild. A record caught since carries
// caught, and one saved before that counts as caught when its species is in the dex.
export function boxText(dex = {}) {
  const raised = Object.keys(S.stats).filter((name) => MONS.includes(name) && S.stats[name] && typeof S.stats[name] === 'object' && !isDead(name))
  if (raised.length === 0) return 'Your box is empty. Pet or feed ' + displayName(S.mon) + ', or finish a turn, to start raising it.'
  const caught = (name) => Boolean(S.stats[name].caught || isCaught(dex[dexKey(name)]))
  raised.sort((a, b) => levelOf(b) - levelOf(a) || displayName(a).localeCompare(displayName(b)) || a.localeCompare(b))
  const lines = raised.map((name) => {
    const meters = S.needsOn && !hasRunAway(name) ? ' ' + iconsFor('food', name).trimEnd() + ' ' + iconsFor('happiness', name).trimEnd() : ''
    const tags = [name === S.mon && !hasRunAway(name) ? 'active' : null, conditionOf(name)].filter(Boolean)
    return fullNameOf(name) + (caught(name) ? ' ◓' : '') + ', Lv. ' + levelOf(name) + meters + (tags.length > 0 ? ' (' + tags.join(', ') + ')' : '')
  })
  const count = raised.length + (raised.length === 1 ? ' mon' : ' mons')
  const alone = raised.length === 1 && raised[0] === S.mon ? '\nOnly ' + nameOf(S.mon) + ' so far. /pokemon <mon> picks another.' : ''
  return count + ' in your box:\n' + lines.join('\n') + alone
}

const dexLabel = (key) => '#' + String(dexNumber(key)).padStart(3, '0') + ' ' + displayName(key)

// † marks a species lost for good until a new one is caught, and a mon that ran away says so
const LOST_MARK = ' †'
function dexMark(key) {
  const own = Object.keys(S.stats).filter((name) => dexKey(name) === key)
  if (own.some(isDead)) return LOST_MARK
  return own.some(hasRunAway) ? ' (ran away)' : ''
}

// The graveyard as saved, a list of { mon, level, nickname?, at }, like
// "Rest well: Spoon (Abra), Lv. 35, on 2026-10-10."
function graveyardText(graveyard) {
  if (!Array.isArray(graveyard) || graveyard.length === 0) return ''
  const lines = graveyard.map((g) => (g.nickname ? g.nickname + ' (' + displayName(g.mon) + ')' : displayName(g.mon)) + ', Lv. ' + g.level + ', on ' + new Date(g.at).toISOString().slice(0, 10))
  return '\nRest well: ' + lines.join('; ') + '.'
}

// The Pokédex as saved, { [dexKey]: { seen, caught?, shiny? } }, where shiny marks a shiny
// catch. The whole dex is a count, the caught mons in dex order, and the ones only seen.
// One mon is its number, tier, and status.
export function dexText(dex, wanted, graveyard) {
  const entries = DEX.filter((key) => dex[key] && typeof dex[key] === 'object')
  if (wanted) {
    if (!MONS.includes(wanted)) return 'Unknown mon "' + wanted + '". See /pokemon list for every mon.'
    const key = dexKey(wanted)
    if (!DEX.includes(key)) return displayName(wanted) + " isn't in the Pokédex. Only gen 1 mons appear in the wild."
    const entry = entries.includes(key) ? dex[key] : null
    const status = isCaught(entry) ? 'Caught ◓' + (entry.shiny ? ' ✦' : '') + '.' : entry ? 'Seen, not caught yet.' : 'Not seen yet.'
    const mark = dexMark(key)
    const lost = mark === LOST_MARK ? ' Gone for good †. Catch a new one to raise it again.' : mark ? ' Ran away. It may turn up in the wild.' : ''
    return dexLabel(key) + ', ' + tierOf(key) + '. ' + status + lost
  }
  const caught = entries.filter((key) => isCaught(dex[key]))
  const seen = entries.filter((key) => !isCaught(dex[key]))
  const shiny = caught.filter((key) => dex[key].shiny).length
  const head = 'Pokédex: seen ' + entries.length + ', caught ' + caught.length + ' of ' + DEX.length + (shiny ? ' (' + shiny + ' shiny)' : '') + '.'
  const rest = graveyardText(graveyard)
  if (entries.length === 0) return head + ' No wild mons met yet.' + rest
  const lines = caught.map((key) => dexLabel(key) + ' ◓' + (dex[key].shiny ? ' ✦' : '') + dexMark(key))
  if (seen.length > 0) lines.push('Seen: ' + seen.map((key) => displayName(key) + dexMark(key)).join(', '))
  return head + '\n' + lines.join('\n') + rest
}

// Every option with what it does, in groups for /pokemon help. A setting's third field
// reads its current value.
const onOff = (on) => (on ? 'on' : 'off')
export const HELP = [
  ['Pick', [
    ['<mon>', 'Show a mon, like /pokemon charmander'],
    ['default', 'Show its default colors'],
    ['shiny', 'Show its shiny colors'],
    ['new <mon>', 'Fetch a mon from gen 2 to 5, or new random, new gen3'],
    ['list', 'List every mon name'],
  ]],
  ['Care', [
    ['pet', 'Pet it'],
    ['feed', 'Toss it a berry'],
    ['sleep', 'Tuck it in, or wake it'],
    ['revive [mon]', 'Take a fainted mon to a Pokémon Center'],
    ['nickname <name>', 'Nickname it, up to 12 characters'],
  ]],
  ['Battle', [
    ['attack [move]', 'Use a random move, or the one named'],
    ['moves [mon]', 'List its moves, or another mon\'s'],
    ['catch', 'Throw a Poké Ball at the wild mon'],
    ['run', 'Send the wild mon away'],
  ]],
  ['Evolve', [
    ['evolve [mon]', 'Evolve with a stone or a trade, or pick what Eevee becomes'],
    ['stop', 'Cancel an evolution'],
  ]],
  ['Records', [
    ['stats', 'Its level, XP, evolution, and meters'],
    ['box', "Every mon you've raised"],
    ['party', 'The mons that come out for subagents. party add or remove <mon> picks them, party assign <agent> <mon> ties one to an agent type'],
    ['dex [mon]', "The wild mons you've seen and caught"],
    ['release <mon>', 'Release a mon, so it starts over'],
  ]],
  ['Settings', [
    ['wander', 'Wander while idle', () => onOff(S.wander)],
    ['needs', 'Food and happiness', () => onOff(S.needsOn)],
    ['emoji', 'Emoji meters', () => onOff(S.emojiOn)],
    ['size small|large', 'Band size', () => S.size],
    ['images auto|on|off', 'Pixel images or half blocks', () => S.imageMode],
    ['pane', 'Show the mon in a docked pane, not the band', () => onOff(S.paneOn)],
    ['sync', 'Same mon in every open session', () => onOff(S.syncOn)],
    ['autoevolve', 'Evolve on its own at its level', () => onOff(S.autoEvolve)],
    ['nuzlocke', 'A fainted mon is lost for good', () => onOff(S.nuzlockeOn)],
    ['trainer', 'One starter, then only mons you catch', () => onOff(S.trainerOn)],
  ]],
]
// The hidden debug options, at the top of /pokemon help only while debug is on
const DEBUG_HELP = ['Debug', [
  ['wild [mon]', 'Call a wild mon now, or the one named; add shiny for its shiny colors'],
  ['kill', 'Faint the mon now, or lose it under nuzlocke'],
]]

const USAGE_WIDTH = Math.max(...[DEBUG_HELP, ...HELP].flatMap(([, rows]) => rows.map(([usage]) => usage.length))) + 2
// A setting shows its value ahead of what it does, so the values line up in a column
export function helpText(debug) {
  const groups = (debug ? [DEBUG_HELP, ...HELP] : HELP).map(([title, rows]) => title + '\n' + rows.map(([usage, does, value]) => '  ' + usage.padEnd(USAGE_WIDTH) + (value ? value().padEnd(7) : '') + does).join('\n'))
  return 'Usage: /pokemon <option>\n\n' + groups.join('\n\n')
}

// Joins items as "A", "A and B", or "A, B, and C"
export const andList = (items) => (items.length < 3 ? items.join(' and ') : items.slice(0, -1).join(', ') + ', and ' + items.at(-1))
