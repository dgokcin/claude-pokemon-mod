import { BUBBLE_SPAN } from './art.js'
import { FLINCH_TICKS, HOP_TICKS, MOVE_TICKS } from './constants.js'
import { cheerCrew, CREW_SIZE, crewFit, crewLanes, crewPhase, endedCrew, isOut, spanOf, stepCrew } from './crew.js'
import { dexKey } from './dex.js'
import { SPRITES } from './frames.js'
import { bandRows, foeBox, foeRoom } from './layout.js'
import { displayName } from './names.js'
import { ballReady, leaveParty, PARTY_SIZE } from './party.js'
import { levelOf } from './records.js'
import { crewIcon } from './scene.js'
import { idleBox, MONS, rowsOf, VARIANTS } from './sprites.js'
import { S } from './state.js'
import { isFainted, isGone } from './status.js'

// The party mons as this session runs them: which mons in the box can work for a
// subagent, which come out and where they stand, and their walk each tick, kept as data in crew.js

const crewBox = (m) => idleBox(m.mon, m.variant)

// The party mons that may come out, in ball order: a running agent's, its ball in one
// of the first five slots, not the mon on show, and no taller than the band can grow for
function crewHopefuls() {
  const slot = (m) => S.party.findIndex((ball) => ball.id === m.id)
  return S.crew
    .filter((m) => {
      const i = slot(m)
      return m.endAt === null && m.mon !== S.mon && SPRITES[m.mon] && i >= 0 && i < PARTY_SIZE - 1 && S.party[i].popStart === null && rowsOf(m.mon) <= foeRoom()
    })
    .sort((a, b) => slot(a) - slot(b))
}

// The party mons that keep a lane in width columns, in ball order: the ones whose agents
// finished, until they're back in their balls, then as many hopefuls as fit beside them
// at full size
export function crewWanted(width) {
  const slot = (m) => S.party.findIndex((ball) => ball.id === m.id)
  const leaving = S.crew.filter((m) => m.endAt !== null && isOut(m, S.tick))
  const room = width - leaving.reduce((sum, m) => sum + spanOf(crewBox(m)), 0)
  const hopefuls = crewHopefuls()
  return [...leaving, ...hopefuls.slice(0, crewFit(hopefuls, crewBox, room))].sort((a, b) => slot(a) - slot(b))
}

// A subagent finished. Its ball pops now, or once its party mon has hopped and gone back in.
export function endAgent(id) {
  const member = S.crew.find((m) => m.id === id)
  if (member && crewPhase(member, S.tick) !== 'ball') S.crew = endedCrew(S.crew, id, S.tick)
  else S.party = leaveParty(S.party, id, S.tick)
}

// The lead's last hop the party hopped along with
let cheeredAt = -HOP_TICKS

// The party mons out walk, and the ones due out come out, in lanes across the crew's
// columns. They hop along when the lead hops, and jump when a wild mon walks in behind them.
export function stepCrewMons() {
  if (S.crew.length === 0) return
  const ground = bandRows() * 2 - 1
  const rows = bandRows()
  const lanes = S.crewWidth > 0 ? crewLanes(crewWanted(S.crewWidth), crewBox, S.crewWidth) : new Map()
  const ready = (m) => ballReady(S.party, m.id, S.tick, ground)
  const bubbleOf = (m) => (crewIcon(m) ? BUBBLE_SPAN : 0)
  const foe = S.wild?.phase === 'entering' ? { id: S.wild.seed, ...foeBox(rows) } : null
  if (S.hopStart > cheeredAt) {
    cheeredAt = S.hopStart
    S.crew = cheerCrew(S.crew, S.tick)
  }
  const result = stepCrew(S.crew, {
    tick: S.tick, lanes, width: S.crewWidth, ready, boxOf: crewBox, bubbleOf, foe, moveTicks: MOVE_TICKS, flinchTicks: FLINCH_TICKS, rand: Math.random,
  })
  S.crew = result.crew
  for (const id of result.done) S.party = leaveParty(S.party, id, S.tick)
}

// The box's mons beside the one on show that can work for a subagent: none fainted, run
// away, or lost. They're the picked party in its order, or the highest level first.
export const canWork = (name) => name !== S.mon && MONS.includes(name) && S.stats[name] && typeof S.stats[name] === 'object' && !isGone(name) && !isFainted(name)

// A mon assigned to an agent type comes out for that type alone, so it stays out of the
// party the other subagents draw from
const isAssigned = (name) => Object.values(S.partyAgents).includes(name)

export function partyMons() {
  const able = (name) => canWork(name) && !isAssigned(name)
  if (S.partyPicks) return S.partyPicks.filter(able).slice(0, CREW_SIZE)
  return Object.keys(S.stats)
    .filter(able)
    .sort((a, b) => levelOf(b) - levelOf(a) || displayName(a).localeCompare(displayName(b)) || a.localeCompare(b))
    .slice(0, CREW_SIZE)
}

// The mon assigned to an agent type, or undefined
export const assignedTo = (type) => S.partyAgents[String(type ?? '').toLowerCase()]

// The agent types a mon is assigned to, as typed
export const typesOf = (name) => Object.keys(S.partyAgents).filter((type) => S.partyAgents[type] === name)

// A party mon shows in the variant saved with its record, or shiny when it was caught shiny
export function crewVariant(name, dex) {
  const saved = S.stats[name]?.variant
  if (VARIANTS.includes(saved)) return saved
  return S.stats[name]?.caught && dex?.[dexKey(name)]?.shiny ? 'shiny' : 'default'
}
