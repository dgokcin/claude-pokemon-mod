import { FLASH } from './party.js'

// The party mons out of subagents' Poké Balls. Each running subagent gets a mon from the
// box, and once its ball has landed and the band has room, the ball opens in a flash and
// the mon hops out beside the lead. It strolls about the crew's columns, keeping off the
// other mons out and their bubbles, shows its agent's thinking and tools, hops along with
// the lead and when a wild mon passes behind it, hops when its agent finishes, then goes
// back into the ball in a red flash, and the ball pops. A mon that loses its room goes
// back the same way and waits in its ball. A crew is a plain array of members, oldest
// first; every function returns a new crew or member and leaves its input alone.

// The most mons out at once, one per ball slot before the +n label
export const CREW_SIZE = 5
// The columns kept clear right of each mon's body, between it and the next mon or the lead
export const CREW_GAP = 3
const FLASH_BEAT = 3
const RELEASE_TICKS = FLASH_BEAT * FLASH.length
const HOP_TICKS = 6
const RED_TICKS = 12
const RECALL_TICKS = RED_TICKS + FLASH_BEAT * FLASH.length
const REST_TICKS = [60, 160]
// Balls open this far apart, so mons come out one after the other
const STAGGER_TICKS = 8
// A cheer ripples along the crew this far apart
const CHEER_STEP = 2

// A member for agent id, with pick = { mon, variant } from the box
const newMember = (id, { mon, variant }) => ({
  id,
  mon,
  variant,
  x: 0,
  facing: 'right',
  target: null,
  restUntil: 0,
  outAt: null,
  backAt: null,
  endAt: null,
  done: false,
  flinchAt: null,
  hopAt: null,
  startledBy: null,
  thinking: false,
  tools: [],
})

// Give agent id the first of mons no member has yet. variantOf says which colors it shows in.
export function joinCrew(crew, id, mons, variantOf) {
  if (crew.some((m) => m.id === id)) return crew
  const free = mons.find((name) => !crew.some((m) => m.mon === name))
  return free ? [...crew, newMember(id, { mon: free, variant: variantOf(free) })] : crew
}

const updated = (crew, id, fn) => crew.map((m) => (m.id === id ? fn(m) : m))

export const crewThinking = (crew, id, thinking) => updated(crew, id, (m) => (m.thinking === thinking ? m : { ...m, thinking }))

export const crewToolStarts = (crew, id, call, name) => updated(crew, id, (m) => ({ ...m, tools: [...m.tools, { call, name }] }))

// A call ending, and the flinch it starts when it failed
export const crewToolEnds = (crew, id, call, failed, tick) =>
  updated(crew, id, (m) => ({ ...m, tools: m.tools.filter((t) => t.call !== call), flinchAt: failed ? tick : m.flinchAt }))

// The agent finished: its mon hops, then goes back into its ball
export const endedCrew = (crew, id, tick) =>
  updated(crew, id, (m) => (m.endAt !== null ? m : { ...m, endAt: tick, thinking: false, tools: [] }))

// The tool its agent started last and still runs, or null
export const crewTool = (m) => m.tools.at(-1)?.name ?? null

// Where a member is at: in its 'ball', on its way out in a 'release' flash, 'out', giving
// its finishing 'hop', turning red on its way back in a 'recall', gone in its 'flash',
// and back 'in' its ball
export function crewPhase(m, tick) {
  if (m.outAt === null) return 'ball'
  if (m.backAt !== null) {
    const t = tick - m.backAt
    return t < RED_TICKS ? 'recall' : t < RECALL_TICKS ? 'flash' : 'in'
  }
  if (tick - m.outAt < RELEASE_TICKS) return 'release'
  return m.endAt !== null ? 'hop' : 'out'
}

// Standing on the stage
export const isOut = (m, tick) => ['release', 'out', 'hop', 'recall'].includes(crewPhase(m, tick))

// Drawn on the stage: standing, or gone in the flash where it stood
export const isShown = (m, tick) => isOut(m, tick) || crewPhase(m, tick) === 'flash'

// Inside its flash, so its body stays out of sight: the first beat coming out, and all
// of the way back in
export function crewHidden(m, tick) {
  const phase = crewPhase(m, tick)
  return phase === 'flash' || (phase === 'release' && tick - m.outAt < FLASH_BEAT)
}

// Its ball lifts the lid while the mon comes out or goes back in
export const ballOpen = (m, tick) => ['release', 'recall', 'flash'].includes(crewPhase(m, tick))

// How far to tint it red on its way back into its ball
export const crewRed = (m, tick) => (crewPhase(m, tick) === 'recall' ? Math.min(1, (tick - m.backAt + 1) / RED_TICKS) : 0)

// The FLASH frame it comes out or goes back in, or null
export function crewFlash(m, tick) {
  const phase = crewPhase(m, tick)
  if (phase === 'release') return FLASH[Math.floor((tick - m.outAt) / FLASH_BEAT)]
  if (phase === 'flash') return FLASH[Math.floor((tick - m.backAt - RED_TICKS) / FLASH_BEAT)]
  return null
}

// The finishing hop starts once it's all the way out
const finishHopAt = (m) => Math.max(m.endAt, m.outAt + RELEASE_TICKS)

// Up for the first half of a hop: its finishing hop, or the short one it started at
// hopAt, stepping out, cheering with the lead, or startled by a passing wild mon
export function crewHopping(m, tick) {
  if (crewPhase(m, tick) === 'hop') return tick - finishHopAt(m) < HOP_TICKS / 2
  return m.hopAt !== null && tick >= m.hopAt && tick - m.hopAt < HOP_TICKS / 2
}

// The mons out hop along with the lead, one after the other from the left
export function cheerCrew(crew, tick) {
  const out = crew.filter((m) => crewPhase(m, tick) === 'out').sort((a, b) => a.x - b.x)
  return crew.map((m) => (out.includes(m) ? { ...m, hopAt: tick + out.indexOf(m) * CHEER_STEP } : m))
}

const flinching = (m, tick, flinchTicks) => m.flinchAt !== null && tick - m.flinchAt < flinchTicks

export const crewWalking = (m, tick, flinchTicks) =>
  crewPhase(m, tick) === 'out' && m.target !== null && m.target !== m.x && !flinching(m, tick, flinchTicks)

// The columns a member's body and the gap after it take, from its idle box
export const spanOf = (box) => box.right - box.left + 1 + CREW_GAP

// How many of members, in order, fit their bodies and gaps in width columns
export function crewFit(members, boxOf, width) {
  let used = 0
  let n = 0
  for (const m of members) {
    used += spanOf(boxOf(m))
    if (used > width) break
    n += 1
  }
  return n
}

// A lane per member across width columns, left to right: its body, its gap, and an even
// share of the columns to spare. Each lane is the range of frame columns, lo to hi, its
// mon may stand at.
export function crewLanes(members, boxOf, width) {
  const spans = members.map((m) => spanOf(boxOf(m)))
  const share = Math.max(0, Math.floor((width - spans.reduce((a, b) => a + b, 0)) / Math.max(1, members.length)))
  let left = 0
  return new Map(
    members.map((m, i) => {
      const box = boxOf(m)
      const lo = left - box.left
      left += spans[i] + share
      return [m.id, { lo, hi: Math.max(lo, left - CREW_GAP - 1 - box.right) }]
    }),
  )
}

const clamp = (v, lane) => Math.max(lane.lo, Math.min(lane.hi, v))
const restFor = (tick, rand) => tick + REST_TICKS[0] + Math.floor(rand() * (REST_TICKS[1] - REST_TICKS[0]))

// The frame columns m may stand at this tick: the crew's width columns, short of the
// bodies of the mons out either side of it, their gaps, and the bubble room each shows
// an icon in on its left, as bubbleOf gives. Mons share the room between them as they
// stroll, so one squeezed by a bubble steps aside. hi falls short of lo when it's pinched.
function roomOf(crew, m, tick, width, boxOf, bubbleOf) {
  const box = boxOf(m)
  let lo = bubbleOf(m) - box.left
  let hi = width - CREW_GAP - 1 - box.right
  for (const o of crew) {
    if (o.id === m.id || !isOut(o, tick)) continue
    const other = boxOf(o)
    if (o.x < m.x) lo = Math.max(lo, o.x + other.right + 1 + CREW_GAP + bubbleOf(m) - box.left)
    else hi = Math.min(hi, o.x + other.left - bubbleOf(o) - CREW_GAP - 1 - box.right)
  }
  return { lo, hi }
}

// Whether another mon on stage stands where m's body would at frame column x
function blocked(crew, m, x, tick, boxOf) {
  const box = boxOf(m)
  return crew.some((o) => {
    if (o.id === m.id || !isOut(o, tick)) return false
    const other = boxOf(o)
    return x + box.left <= o.x + other.right + CREW_GAP && o.x + other.left <= x + box.right + CREW_GAP
  })
}

// Stroll like the lead idles: a random spot in its room, then a rest of 3 to 8 s. A mon
// outside its room, as when the crew's columns shrink or a neighbor's bubble opens, walks
// straight back into it, and a pinched one stands where it is until room opens.
function strolled(m, room, tick, moveTicks, rand) {
  if (room.hi < room.lo) return m.target === null ? m : { ...m, target: null }
  let target = m.target
  if (m.x < room.lo || m.x > room.hi) target = clamp(m.x, room)
  else if (target !== null) target = clamp(target, room)
  else if (tick >= m.restUntil) target = room.lo + Math.floor(rand() * (room.hi - room.lo + 1))
  if (target === null || tick % moveTicks !== 0) return target === m.target ? m : { ...m, target }
  if (target === m.x) return { ...m, target: null, restUntil: restFor(tick, rand) }
  const facing = target < m.x ? 'left' : 'right'
  return { ...m, target, facing, x: m.x + (facing === 'left' ? -1 : 1) }
}

// A wild mon walking in behind m makes it jump once, the first tick they overlap
function startled(m, foe, tick, boxOf) {
  if (!foe || m.startledBy === foe.id) return m
  const box = boxOf(m)
  if (foe.right < m.x + box.left || foe.left > m.x + box.right) return m
  return { ...m, hopAt: tick, startledBy: foe.id }
}

// One tick of the crew. lanes holds a lane for each member that should be out across
// the crew's width columns, and ready says whether a member's ball has landed so it can
// open. A mon comes out in the middle of its lane, with a hop, once no other mon stands
// there and the last one out has had its moment, then strolls the room it finds, as
// roomOf gives it. foe is the columns of a wild mon walking in, or null. done lists the
// agents whose mons are back in their balls for good, so their balls can pop.
export function stepCrew(crew, { tick, lanes, width = 0, ready, boxOf, bubbleOf = () => 0, foe = null, moveTicks, flinchTicks, rand }) {
  const done = []
  let lastOut = Math.max(-Infinity, ...crew.map((m) => m.outAt ?? -Infinity))
  const next = crew.map((m) => {
    const lane = lanes.get(m.id)
    const phase = crewPhase(m, tick)
    if (phase === 'in') {
      if (m.endAt === null) return { ...m, outAt: null, backAt: null, target: null, hopAt: null }
      if (!m.done) done.push(m.id)
      return m.done ? m : { ...m, done: true }
    }
    if (phase === 'ball') {
      if (!lane || m.endAt !== null || !ready(m) || tick - lastOut < STAGGER_TICKS) return m
      const x = lane.lo + Math.floor((lane.hi - lane.lo) / 2)
      if (blocked(crew, m, x, tick, boxOf)) return m
      lastOut = tick
      return { ...m, x, outAt: tick, hopAt: tick + RELEASE_TICKS, startledBy: null, target: null, restUntil: restFor(tick, rand) }
    }
    if (phase === 'hop') return tick >= finishHopAt(m) + HOP_TICKS ? { ...m, backAt: tick } : m
    if (phase !== 'out') return m
    if (!lane) return { ...m, backAt: tick }
    if (flinching(m, tick, flinchTicks)) return m
    return strolled(startled(m, foe, tick, boxOf), roomOf(crew, m, tick, width, boxOf, bubbleOf), tick, moveTicks, rand)
  })
  return { crew: next, done }
}
