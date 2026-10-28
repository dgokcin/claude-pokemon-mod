import { INKS } from './art.js'
import { prepareAttack } from './attacks.js'
import { drawScene, inkFor } from './band.js'
import { clearAlert, isAlerted, raiseAlert } from './bubble.js'
import {
  attackCommand, battleWait, careReply, evolvingReply, moveKey, movesText, nicknameCommand, releaseCommand, waitsForCare,
  waitsForEvolution,
} from './commands.js'
import { IMAGE_WAIT_TICKS, TICK_MS } from './constants.js'
import { CREW_SIZE, crewThinking, crewToolEnds, crewToolStarts, isOut, joinCrew } from './crew.js'
import { CUSTOM_PREFIX, fetchMon, monsOfGen } from './custom.js'
import { dexKey, isCaught, mergedDexEntry, pickWild, tierOf } from './dex.js'
import { catchCommand, foeMoves, runawayFoe, wildMoves, wildName } from './encounter.js'
import { evolutionsOf, startLevel } from './evolutions.js'
import { SPRITES } from './frames.js'
import { bandRows, bandZoom, battleFits, clampX, homeX, isHome, stripTarget, wildAt } from './layout.js'
import { careOf, turnXp, xpAt } from './levels.js'
import { bumpStat, filledIcons, iconsFor, isFull, isHappiest, park, STAT_ICONS, statNow, STATS, unpark } from './meters.js'
import { feed, flinch, pet, startAttack, step } from './motion.js'
import { displayName } from './names.js'
import {
  applyImageMode, cellsNow, drawsHearts, drawsImage, drawsImages, heartsImage, IMAGE_MODES, imageNow, svgNow,
} from './paint.js'
import { joinParty } from './party.js'
import {
  conditionOf, downReply, fullNameOf, goneLine, HEAL_MS, healingReply, levelOf, nameOf, readyToEvolve, revivedMeters,
  settleHeal, xpOf,
} from './records.js'
import { addCustom, MONS, VARIANTS } from './sprites.js'
import { S } from './state.js'
import {
  hasRunAway, isAsleep, isDead, isDown, isFainted, isFlinching, isFree, isGone, isHealing, isPetted, isTuckedIn, markActive,
} from './status.js'
import { assignedTo, canWork, crewVariant, endAgent, partyMons, stepCrewMons, typesOf } from './team.js'
import { andList, boxText, dexText, evolutionText, HELP, helpText, orList, statsText } from './texts.js'
import {
  chargedWild, damageOf, faintedWild, fleeingWild, foeX, isHere, isOnStage, isWeak, newWild, STRIKE_GAP_MS, STRIKE_JITTER_MS,
  stepWild, strikingWild, WEAK_MS, WILD_STAY_MS, WILD_TURNS,
} from './wild.js'
import { SIZES } from './zoom.js'

// One pixel Pokémon lives in a strip at the right of the band above the prompt.
// While Claude works it paces, with a thought bubble while Claude thinks. It
// hops when a turn ends, then wanders while idle (or stays at the right edge,
// after /pokemon wander) and falls asleep after five quiet minutes.
// /pokemon pet makes pixel hearts float up, and /pokemon feed drops a random pixel
// berry for it to walk over and eat. Food and happiness drain over time, slower while Claude Code is closed,
// shown as ●●●○○ and ♥♥♥♡♡ at the right edge, so it needs both now and then.
// /pokemon emoji swaps the meters' icons for 🍓 and 💗.
// /pokemon sleep tucks it in, so both meters drain slower until Claude starts working.
// /pokemon attack plays one of its moves, with the animations in attacks.js.
// While a tool runs, the bubble shows it, with a TM disc for a skill from any agent, and
// when Claude waits on you the mon stops and shows a "!". Each running subagent is a Poké Ball along the left of the strip,
// and while the band has room a mon from your box steps out of it and works beside yours, as in crew.js.
// A main-loop tool call that fails makes it flinch, with a sweat drop by its head.
// Answered turns earn XP, and the mon evolves at the levels from the games.
// Now and then a wild mon walks in from the left, and the strip widens to fit both.
// Each open session shows its own mon, starting with the one last picked anywhere. XP,
// meters, nickname, and sleep belong to the mon, so sessions showing the same mon share them.
// Left with empty meters for hours it faints until /pokemon revive heals it, and left fainted it runs away.
// With /pokemon nuzlocke on, a mon that faints is gone for good.
// The mon, hearts, berries, bubbles, balls, and Zs are pixels in one Raster, two per cell.
// The desktop app has no Raster, so there the same pixels are one Svg.
//
// Every function handed $ lives in this file, since the engine follows $ only into
// functions declared in the hooks module itself. The rest of the band is in the modules
// imported above, sharing its state through S in state.js.

// How long the TM disc stays up after a skill is typed as /name
const DISC_TICKS = 60
// /pokemon pane moves the scene from the band into a pane, docked beside the transcript in
// the fullscreen layout so Claude's replies keep the rest of the screen. It's drawn there
// once the surface places it; until then the band goes on drawing it.
const PANE_ID = 'pokemon'
// The turn.step chunks that start or end a subagent's thinking
const THOUGHT_KINDS = new Set(['thinking', 'text', 'tool', 'stop'])
// Tools that ask you something, and notifications that wait on you
const QUESTION_TOOLS = ['AskUserQuestion', 'ExitPlanMode']
const ALERT_NOTIFICATIONS = ['permission_prompt', 'worker_permission_prompt', 'agent_needs_input', 'elicitation_dialog']
// A minute after a turn with no word from you, the "!" shows for two
const IDLE_WAIT_MS = 60 * 1000
// What core tells the model when you turn a call down at its dialog or interrupt it.
// Nothing else marks a refusal there, so the wording is the one sign.
const REFUSED = /The user doesn't want to (proceed with this tool use|take this action)|\[Request interrupted by user/

// Hold the disc when a command that ran is a skill, by its source in the command list
async function markSkillCommand($, command) {
  const found = (await $.command.list()).find((c) => c.name === command)
  if (found && found.source !== 'builtin') S.discUntil = S.tick + DISC_TICKS
}

// What a fainted mon can't do, and what a mon that's gone can't do either
const DOWN_WAITS = ['pet', 'feed', 'attack', 'catch', 'evolve', 'sleep']
const GONE_WAITS = [...DOWN_WAITS, ...VARIANTS, 'nickname']

// Play the evolve effect with the evolved mon swapped in, in a band grown to fit both
function startEvolution($, into) {
  $.ui.toast('What? ' + nameOf(S.mon) + ' is evolving!')
  startAttack({ effect: 'evolve', color: S.ink.silhouette })
  S.attack.swap = into
  S.evolving = { from: S.mon, into }
  S.evolveDue = null
  $.ui.invalidate('ui.render')
}

// Start a due evolution once the mon is free, and finish one whose effect is over
function stepEvolution($) {
  if (S.evolving && !S.attack) finishEvolution($)
  else if (S.evolveDue && isFree()) startEvolution($, S.evolveDue)
}

// The evolved mon takes over the record as last saved, so XP earned elsewhere comes along.
// 'evolved' tells another session showing the old mon that it evolved rather than being released.
async function moveRecord($, from, into) {
  await freshen($, [from])
  S.stats[into] = { ...S.stats[from], xp: xpOf(from) }
  delete S.stats[from]
  await saveStats($, [from, into])
  const evolved = (await $.store.get('evolved')) ?? {}
  await $.store.set('evolved', { ...evolved, [from]: into })
}

// The mon becomes the evolved one. Its record moves along, so level, XP, and meters carry over.
function finishEvolution($) {
  const { from, into } = S.evolving
  const wasHome = isHome()
  S.evolving = null
  S.mon = into
  if (wasHome) S.x = homeX()
  clampX()
  const name = nameOf(from)
  saveMon($).catch((err) => logOnce($, err))
  moveRecord($, from, into).catch((err) => logOnce($, err))
  $.ui.toast('Congratulations! Your ' + name + ' evolved into ' + displayName(into) + '!')
  $.ui.invalidate('ui.render')
}

// Call off an evolution under way or due. The mon stays as it is.
function stopEvolution($) {
  const name = nameOf(S.mon)
  if (!S.evolving && !S.evolveDue) return { text: name + ' isn\'t evolving.' }
  if (S.evolving) S.attack = null
  S.evolving = null
  S.evolveDue = null
  $.ui.invalidate('ui.render')
  return { text: 'Huh? ' + name + ' stopped evolving!' }
}

// A stone, a trade, or a level the mon has reached starts its evolution now. Several
// ways and none named get a list.
function evolveCommand($, wanted) {
  const name = nameOf(S.mon)
  const entries = evolutionsOf(S.mon)
  if (entries.length === 0) return { text: name + ' doesn\'t evolve.' }
  if (S.attack || S.food) return { text: name + ' is busy right now.' }
  const picked = wanted ? entries.filter((entry) => moveKey(entry.into) === moveKey(wanted)) : entries
  if (picked.length !== 1) {
    const example = entries[Math.floor(Math.random() * entries.length)].into
    return { text: name + ' can become ' + orList(entries.map(evolutionText)) + '. Try /pokemon evolve ' + example + '.' }
  }
  const [entry] = picked
  const level = levelOf(S.mon)
  if (entry.level && level < entry.level) {
    return { text: name + ' evolves into ' + displayName(entry.into) + ' at Lv. ' + entry.level + '. It\'s Lv. ' + level + '.' }
  }
  startEvolution($, entry.into)
  if (entry.item) return { text: 'You use a ' + entry.item + ' on ' + name + '.' }
  if (entry.trade) return { text: 'You trade ' + name + ' to a friend, and they trade it right back.' }
  return { text: 'You let ' + name + ' evolve.' }
}

// Send the foe off, with a toast unless quiet. One still calling just doesn't come, and
// a fainted one blinks away where it lies.
function fleeWild($, quiet = false) {
  if (S.wild?.phase === 'fainted') return
  const shown = isOnStage(S.wild) && S.wild.phase !== 'fleeing'
  if (shown && !quiet) $.ui.toast('Wild ' + displayName(S.wild.mon) + ' fled!')
  S.wild = fleeingWild(S.wild, wildAt())
}

// Mark a mon in the Pokédex as last saved by any session, so two sessions marking at once
// lose a mark at worst
async function markDex($, key, patch) {
  const saved = await $.store.get('dex')
  const dex = saved && typeof saved === 'object' ? { ...saved } : {}
  dex[key] = mergedDexEntry(dex[key], patch)
  await $.store.set('dex', dex)
}

// Mark the foe owned when its species is caught in the Pokédex, so a ball shows beside its HP bar
async function markOwned($, seed) {
  const dex = await $.store.get('dex')
  if (S.wild?.seed === seed && dex && typeof dex === 'object' && isCaught(dex[S.wild.key])) S.wild = { ...S.wild, owned: true }
}

// Move the visit on a tick. Asleep or fainted, the home mon can't fight, so the foe leaves.
function stepWildPhase($) {
  if (!S.wild) return
  if (!['fleeing', 'fainted'].includes(S.wild.phase) && (isTuckedIn() || isAsleep() || isDown())) return fleeWild($)
  const result = stepWild(S.wild, { tick: S.tick, atHome: isHome() && !S.attack, at: wildAt(), stayTicks: WILD_STAY_MS / TICK_MS })
  if (result.event === 'timeout') fleeWild($)
  else S.wild = result.wild
  if (result.event === 'arrived') {
    S.wild = { ...S.wild, nextStrikeAt: S.tick + strikeGap() }
    const yours = S.wild.runaway ? ' It looks a lot like ' + (S.stats[S.wild.mon]?.nickname ?? 'your ' + displayName(S.wild.mon)) + '.' : ''
    $.ui.toast('A ' + wildName() + ' (Lv. ' + S.wild.level + ') appeared!' + yours)
    markOwned($, S.wild.seed).catch((err) => logOnce($, err))
    markDex($, S.wild.key, { seen: S.nowMs }).catch((err) => logOnce($, err))
    if (S.wild.runaway) metRunaway($, S.wild.mon).catch((err) => logOnce($, err))
  } else if (result.event === 'caught') {
    caughtFoe($, S.wild).catch((err) => logOnce($, err))
  } else if (result.event === 'brokefree') {
    $.ui.toast(BROKE_FREE[S.wild.throw.shakes])
  }
  if (S.wild?.phase === 'battle') stepBattle($)
}

// What breaks free says, by how many times the ball rocked first
const BROKE_FREE = ['Oh no! It broke free!', 'Aww! It appeared to be caught!', 'Aww! It appeared to be caught!', 'Argh! So close!']

// Mark the catch in the Pokédex, and put the species in the box at its first level with
// fresh meters, parked unless it's the mon on show. A species already there stays as it is,
// unless it ran away, when its record comes back, or died, when a fresh one takes its place.
async function caughtFoe($, caught) {
  const species = caught.mon
  const name = displayName(species)
  S.nowMs = await $.clock.now()
  await markDex($, caught.key, { caught: S.nowMs, ...(caught.variant === 'shiny' ? { shiny: true } : {}) })
  await freshen($, [species])
  if (hasRunAway(species)) {
    const { ranAway, fainted, healing, starving, ...record } = S.stats[species]
    S.stats[species] = { ...record, ...revivedMeters(), ...(species === S.mon ? {} : { parked: true }) }
    await saveRecords($, [species])
    $.ui.toast('Gotcha! ' + nameOf(species) + ' came back to you.')
    $.ui.invalidate('ui.render')
    return
  }
  if (isDead(species)) delete S.stats[species]
  if (S.stats[species]) {
    $.ui.toast('Gotcha! ' + name + ' was caught! ' + name + ' is already in your box, so it\'s marked in your Pokédex.')
    return
  }
  S.stats[species] = { xp: xpAt(startLevel(species)), caught: true, ...(species === S.mon ? {} : { parked: true }) }
  await saveRecords($, [species])
  $.ui.toast('Gotcha! ' + name + ' was caught! It joined your box.')
}

// The desktop app stops the running turn when you send it a message, and a foe only
// fights mid-turn, so the desktop band attacks and throws the ball from buttons instead.
// They can't be disabled, so while the mon is evolving, busy or down they draw dim and a
// press only says why, as /pokemon catch and attack would.
function battleButtons($, { Box, Button }) {
  if (S.wild?.phase !== 'battle') return []
  const press = (act) => {
    const reply = battleWait() ?? act()
    markActive()
    $.ui.toast(reply.text)
    $.ui.invalidate('ui.render')
  }
  const dimColor = battleWait() !== null
  return [
    Box({
      flexDirection: 'row',
      gap: 1,
      children: [
        Button({ key: 'catch', label: 'Catch', variant: 'primary', dimColor, onPress: () => press(catchCommand) }),
        Button({ key: 'attack', label: 'Attack', dimColor, onPress: () => press(() => attackCommand('')) }),
      ],
    }),
  ]
}

const strikeGap = () => Math.round((STRIKE_GAP_MS + Math.random() * STRIKE_JITTER_MS) / TICK_MS)
const STRIKE_DELAY_TICKS = 2000 / TICK_MS

// Land a move on the foe 60% of the way through it, and spend banked work on the next
// move once the mon is free, awake, at home, and its last move is long enough ago. The
// mon holds off a weak foe, so only /pokemon attack knocks it out.
function stepBattle($) {
  if (S.attack?.atFoe && !S.attack.landed && !S.attack.backing && S.tick >= S.attack.start + Math.round(S.attack.ticks * 0.6)) {
    S.attack.landed = true
    hitFoe($)
    if (S.wild.phase !== 'battle') return
  }
  strikeBack($)
  const ready = !S.wild.strike && !S.attack && !S.food && !S.evolving && !isAlerted() && !isFlinching() && !isAsleep() && S.x === homeX()
  if (!ready || isWeak(S.wild) || S.wild.charge === 0 || S.tick < S.wild.nextAttackAt) return
  const moves = foeMoves()
  const move = moves[Math.floor(Math.random() * moves.length)]
  S.wild = { ...S.wild, charge: S.wild.charge - 1 }
  startAttack(move, { foe: true })
  $.ui.toast(nameOf(S.mon) + ' used ' + move.name + '!')
}

// Now and then the foe plays one of its own moves at the free mon. It lands 60% of the
// way through, and only makes the mon flinch and puts its next move off, so a fight
// never touches the mon's meters.
function strikeBack($) {
  const { strike } = S.wild
  if (strike && !strike.landed && S.tick >= strike.start + Math.round(strike.attack.ticks * 0.6)) {
    S.wild = { ...S.wild, strike: { ...strike, landed: true }, nextAttackAt: Math.max(S.wild.nextAttackAt, S.tick + STRIKE_DELAY_TICKS) }
    flinch()
  }
  if (strike && S.tick >= strike.start + strike.attack.ticks) S.wild = { ...S.wild, strike: null }
  const free = !S.wild.strike && !S.attack && !S.food && !S.evolving && !isAsleep() && S.x === homeX()
  if (!free || S.tick < S.wild.nextStrikeAt) return
  const moves = wildMoves()
  const move = moves[Math.floor(Math.random() * moves.length)]
  const seed = Math.floor(Math.random() * 0x7fffffff)
  const attack = prepareAttack(move, { side: 'right', seed, x: foeX(S.wild, wildAt()), home: homeX() })
  S.wild = strikingWild(S.wild, move, attack, S.tick, S.tick + strikeGap())
  $.ui.toast('Wild ' + displayName(S.wild.mon) + ' used ' + move.name + '!')
}

// A hit resets the foe's wait for a fight. Weak, it waits WEAK_MS for a ball, and at 0 HP
// it faints.
function hitFoe($) {
  const name = displayName(S.wild.mon)
  const hp = Math.max(0, Math.round(S.wild.hp - damageOf(S.wild, S.attack.power, Math.random())))
  if (hp === 0) {
    S.wild = faintedWild(S.wild, S.tick)
    $.ui.toast('Wild ' + name + ' fainted! It can\'t be caught now.')
    return
  }
  const weak = isWeak({ ...S.wild, hp })
  const stay = (weak ? WEAK_MS : WILD_STAY_MS) / TICK_MS
  if (weak && !isWeak(S.wild)) $.ui.toast('Wild ' + name + ' is weak! Throw a ball with /pokemon catch. Another hit could knock it out.')
  S.wild = { ...S.wild, hp, hitAt: S.tick, leaveAt: S.tick + stay }
}

const SPAWN_CHECK_TICKS = (30 * 1000) / TICK_MS
const FIRST_WILD_MS = 5 * 60 * 1000
const WILD_EVERY_MS = [20 * 60 * 1000, 40 * 60 * 1000]

// Every session shares one gate in the store, wildAt = { at, by }, so encounters come
// every 20 to 40 minutes of work however many sessions run. A session finding it due
// claims it with its token and checks on its next call that no other session's claim
// landed over its own before the mon shows up.
async function maybeSpawn($) {
  if (S.tick - S.lastSpawnCheck < SPAWN_CHECK_TICKS) return
  S.lastSpawnCheck = S.tick
  const pick = S.claimedPick
  S.claimedPick = null
  if (!S.turnRunning || S.wild || isTuckedIn() || isAsleep() || isDown()) return
  const now = await $.clock.now()
  const gate = await $.store.get('wildAt')
  if (pick) {
    if (gate?.by === S.sessionToken && !S.wild && !isDown() && battleFits(pick.mon, pick.variant)) S.wild = newWild(pick, Math.floor(Math.random() * 0x7fffffff))
    return
  }
  if (typeof gate?.at !== 'number') return $.store.set('wildAt', { at: now + FIRST_WILD_MS, by: S.sessionToken })
  if (now < gate.at) return
  const next = (await runawayPick($, now)) ?? pickWild(Math.random)
  if (!battleFits(next.mon, next.variant)) return
  const wait = WILD_EVERY_MS[0] + Math.random() * (WILD_EVERY_MS[1] - WILD_EVERY_MS[0])
  await $.store.set('wildAt', { at: now + Math.round(wait), by: S.sessionToken })
  S.claimedPick = next
}

const RUNAWAY_BACK_MS = 30 * 60 * 1000
const RUNAWAY_ODDS = 0.25

// The first encounter at least RUNAWAY_BACK_MS after a mon ran away is that mon, and after
// that it's one in RUNAWAY_ODDS until it's caught. Null for a wild mon as usual.
async function runawayPick($, now) {
  const saved = await $.store.get('stats')
  if (!saved || typeof saved !== 'object') return null
  const back = Object.keys(saved).filter((name) => MONS.includes(name) && saved[name]?.ranAway && !saved[name].dead && now - saved[name].ranAway.at >= RUNAWAY_BACK_MS)
  if (back.length === 0) return null
  await freshen($, back)
  const unmet = back.find((name) => hasRunAway(name) && !S.stats[name].ranAway.met)
  if (unmet) return runawayFoe(unmet)
  const met = back.filter(hasRunAway)
  return met.length > 0 && Math.random() < RUNAWAY_ODDS ? runawayFoe(met[Math.floor(Math.random() * met.length)]) : null
}

// Once a mon that ran away has shown up, it's met, and later encounters are it only by chance
async function metRunaway($, name) {
  await freshen($, [name])
  if (!hasRunAway(name) || S.stats[name].ranAway.met) return
  S.stats[name] = { ...S.stats[name], ranAway: { ...S.stats[name].ranAway, met: true } }
  await saveRecords($, [name])
}

// The hidden debug spawn, /pokemon wild [<mon>] [shiny]. Null when debug is off, so it
// reads as an unknown option. A mon that ran away comes as itself.
async function wildCommand($, rest) {
  if ((await $.store.get('debug')) !== true) return null
  const words = rest.split(/\s+/).filter(Boolean)
  const name = words.find((word) => word !== 'shiny')
  if (name && !MONS.includes(name)) return { text: 'Unknown mon "' + name + '". See /pokemon list for every mon.' }
  if (S.wild) return { text: 'A wild ' + displayName(S.wild.mon) + ' is already here.' }
  if (isTuckedIn()) return { text: nameOf(S.mon) + ' is asleep.' }
  if (isDown()) return downReply()
  if (name) await freshen($, [name])
  const own = name && hasRunAway(name) ? runawayFoe(name) : null
  const pick = own ?? (name ? { mon: name, variant: 'default', key: dexKey(name), tier: tierOf(name), level: startLevel(name) } : pickWild(Math.random))
  if (words.includes('shiny')) pick.variant = 'shiny'
  if (!battleFits(pick.mon, pick.variant)) return { text: 'The band is too narrow for a wild ' + displayName(pick.mon) + '. Widen the pane and try again.' }
  S.wild = newWild(pick, Math.floor(Math.random() * 0x7fffffff))
  S.wanderTarget = null
  return { text: 'A wild ' + displayName(pick.mon) + ' is on its way.' }
}

// The hidden debug faint, /pokemon kill. It faints the shown mon as neglect would, or
// loses it under nuzlocke. Null when debug is off, so it reads as an unknown option.
async function killCommand($) {
  if ((await $.store.get('debug')) !== true) return null
  S.nowMs = await $.clock.now()
  await freshen($, [S.mon])
  if (isDown()) return downReply()
  const name = nameOf(S.mon)
  await (S.nuzlockeOn ? loseMon($, S.mon) : faintMon($))
  return { text: name + (S.nuzlockeOn ? ' fainted for good.' : ' fainted.') }
}

const PET_HAPPINESS = 25
const STAT_REDRAW_TICKS = 1200

// Fill the meters once the berry is eaten or the hearts have floated away, not when
// asked, for the mon that was fed or petted
function stepOwed($) {
  if (S.pettingFills && !isPetted()) {
    S.owed.push({ name: S.pettingFills, happiness: PET_HAPPINESS })
    S.pettingFills = null
  }
  if (S.owed.length > 0) payOwed($, S.owed.splice(0)).catch((err) => logOnce($, err))
}

async function payOwed($, gains) {
  S.nowMs = await $.clock.now()
  const names = [...new Set(gains.map((g) => g.name))]
  await freshen($, names)
  for (const { name, ...meters } of gains) {
    for (const [key, amount] of Object.entries(meters)) bumpStat(key, amount, name)
  }
  await saveRecords($, names)
  $.ui.invalidate('ui.render')
}

// Saves both meters as they are now before the drain rate changes, so the slower
// rate only covers the time asleep
async function setAsleep($, asleep) {
  await freshen($, [S.mon])
  for (const key of Object.keys(STATS)) bumpStat(key, 0)
  S.stats[S.mon] = { ...S.stats[S.mon], asleep }
  await saveStats($, [S.mon])
  $.ui.invalidate('ui.render')
}

// Every open session shares the store, so a session saves only the records it changed
// over the stored ones and picks up the others' as it goes. It counts its saves, and the
// ones still being written, so a sync that read the store before one landed doesn't undo it.
let statWrites = 0
let statSaving = 0

async function saveStats($, names) {
  await saveRecords($, names)
}

// Take these mons' records as last saved by any session, right before changing them, so
// a change lands on another session's newest XP and meters rather than on this one's
// copy from the last sync. A record gone from the store was released in another session,
// so it goes here too rather than being saved back. The shown mon is never parked here.
async function freshen($, names) {
  const saved = await $.store.get('stats')
  if (!saved || typeof saved !== 'object') return
  for (const name of names) {
    if (!saved[name]) {
      delete S.stats[name]
      continue
    }
    const { parked, ...shown } = saved[name]
    S.stats[name] = name === S.mon ? shown : saved[name]
  }
}

async function saveRecords($, names) {
  statWrites += 1
  statSaving += 1
  try {
    const saved = await $.store.get('stats')
    const merged = saved && typeof saved === 'object' ? { ...saved } : {}
    const started = names.filter((name) => S.stats[name] && !merged[name])
    for (const name of names) {
      if (S.stats[name]) merged[name] = S.stats[name]
      else delete merged[name]
    }
    S.stats = merged
    await $.store.set('stats', merged)
    // A mon raised again from scratch no longer points at what it once evolved into
    if (started.length > 0) {
      const evolved = await $.store.get('evolved')
      if (evolved && started.some((name) => name in evolved)) {
        const rest = { ...evolved }
        for (const name of started) delete rest[name]
        await $.store.set('evolved', rest)
      }
    }
  } finally {
    statSaving -= 1
  }
}

// 'mon' is the last one picked in any session, and a new session starts with it. A mon
// picked here is shown as itself, even if it once evolved in another session.
async function saveMon($) {
  S.seenPick = S.mon
  await $.store.set('mon', S.mon)
  const evolved = await $.store.get('evolved')
  if (evolved && S.mon in evolved) {
    const { [S.mon]: _, ...rest } = evolved
    await $.store.set('evolved', rest)
  }
}

// Earlier versions kept a mon per session under 'mon:' keys and a busy mark under 'busy:' keys
async function forgetOldKeys($) {
  for (const key of await $.store.keys()) {
    if (key.startsWith('mon:') || key.startsWith('busy:')) await $.store.delete(key)
  }
}

const SYNC_TICKS = 20
// How often the party is checked against the live agents, and how old a ball must be
// before a missing agent pops it, so a fresh spawn the list hasn't caught up with stays
const PARTY_SYNC_TICKS = 40
// An agent still at work, as the agent list reports it
const LIVE_STATUSES = ['pending', 'running', 'waiting']

// Pop the ball of any agent the engine no longer reports at work. A teammate in a pane of
// its own runs no loop here, so its turn never completes in this process, and this is the
// only way its ball ever pops.
async function syncParty($) {
  const open = S.party.filter((ball) => ball.popStart === null && S.tick - ball.born >= PARTY_SYNC_TICKS)
  if (open.length === 0) return
  const live = new Set()
  for (const agent of await $.agent.list()) {
    if (!LIVE_STATUSES.includes(agent.status)) continue
    live.add(agent.id)
    if (agent.teammateId) live.add(agent.teammateId)
  }
  for (const ball of open) if (!live.has(ball.id)) endAgent(ball.id)
}

async function loadPartyPicks($) {
  const saved = await $.store.get('partyPicks')
  S.partyPicks = Array.isArray(saved) ? saved.filter((name) => MONS.includes(name)) : null
  const agents = await $.store.get('partyAgents')
  S.partyAgents = {}
  if (agents && typeof agents === 'object') {
    for (const [type, name] of Object.entries(agents)) if (MONS.includes(name)) S.partyAgents[type] = name
  }
}

// Give a new subagent the mon assigned to its agent type, or when that one is busy or
// can't work, the next party mon nobody has, from the box as last saved
async function joinCrewFor($, id, type) {
  const saved = await $.store.get('stats')
  if (saved && typeof saved === 'object') await freshen($, Object.keys(saved))
  await loadPartyPicks($)
  const dex = await $.store.get('dex')
  const assigned = assignedTo(type)
  const mons = assigned && canWork(assigned) ? [assigned, ...partyMons()] : partyMons()
  S.crew = joinCrew(S.crew, id, mons, (name) => crewVariant(name, dex))
}

// Show the mon this one evolved into in another session, once nothing here is mid-move
function followEvolution($, into, record) {
  if (S.evolving || S.attack) return
  const name = nameOf(S.mon)
  const wasHome = isHome()
  delete S.stats[S.mon]
  S.stats[into] = record
  S.evolveDue = null
  S.mon = into
  if (wasHome) S.x = homeX()
  clampX()
  S.sentCells = null
  $.ui.toast('Congratulations! Your ' + name + ' evolved into ' + displayName(into) + '!')
  $.ui.invalidate('ui.render')
}

// With sync on, show the mon last picked in another session. A pick that's this mon
// evolving elsewhere is left to followEvolution. Says whether it switched.
async function followPick($) {
  const pick = await $.store.get('mon')
  if (pick === S.seenPick || typeof pick !== 'string') return false
  if (!MONS.includes(pick)) await loadCustom($)
  const evolved = await $.store.get('evolved')
  if (S.evolving || S.attack || evolved?.[S.mon] === pick) return false
  S.seenPick = pick
  if (pick === S.mon || !MONS.includes(pick)) return false
  // A mon gone from the box can't be shown, so this session keeps its own
  await freshen($, [pick])
  if (isGone(pick)) return false
  await switchTo($, pick, { save: false })
  S.sentCells = null
  $.ui.invalidate('ui.render')
  return true
}

// Take the shown mon's record as another session showing it saved it: fed, petted, earned
// XP, or put to bed. Put to bed elsewhere while Claude works here, it wakes right back up
// in stepWake.
async function syncSessions($) {
  S.syncOn = (await $.store.get('sync')) === true
  S.nuzlockeOn = (await $.store.get('nuzlocke')) === true
  S.trainerOn = (await $.store.get('trainer')) !== false
  if (S.syncOn && (await followPick($))) return
  const writes = statWrites
  const saved = await $.store.get('stats')
  const evolved = await $.store.get('evolved')
  // Nothing may await between this check and acting on what was read
  if (statSaving > 0 || writes !== statWrites) return
  // Evolved in another session, the shown mon evolves here too. Released, it starts over.
  if (!saved?.[S.mon]) {
    const into = evolved?.[S.mon]
    if (MONS.includes(into) && saved?.[into]) {
      followEvolution($, into, saved[into])
      return
    }
    if (S.stats[S.mon] && saved && typeof saved === 'object') {
      delete S.stats[S.mon]
      S.evolveDue = null
      $.ui.invalidate('ui.render')
    }
    return
  }
  // Run away or lost in another session, it leaves this band too
  if (!isGone(S.mon) && (saved[S.mon].ranAway || saved[S.mon].dead)) {
    S.stats[S.mon] = saved[S.mon]
    await leaveBand($, { save: false })
    return
  }
  // A session that switched away from the shown mon parked it. It's still on show here, so
  // its record goes back unparked and drains on from where the park left it.
  const { parked, ...theirs } = saved[S.mon]
  if (parked && !isGone(S.mon)) {
    await freshen($, [S.mon])
    await saveRecords($, [S.mon])
  } else if (JSON.stringify(theirs) === JSON.stringify(S.stats[S.mon])) {
    return
  } else {
    const wasFainted = isFainted(S.mon)
    S.stats[S.mon] = theirs
    if (!wasFainted && isFainted(S.mon)) $.ui.toast(nameOf(S.mon) + ' fainted! /pokemon revive takes it to a Pokémon Center.')
  }
  $.ui.invalidate('ui.render')
}

// A tucked-in mon wakes when Claude starts working, or when it has a berry to eat,
// a move to play, or an evolution to go through
function stepWake($) {
  if (isTuckedIn() && (S.turnRunning || S.food || S.attack || S.evolving || S.evolveDue)) setAsleep($, false).catch((err) => logOnce($, err))
}

// An answered turn earns XP, scaled by care. A level-up toasts the new level once, and
// an evolution it reaches is due.
async function gainXp($, durationMs) {
  S.nowMs = await $.clock.now()
  await freshen($, [S.mon])
  if (isDown()) return
  const was = levelOf(S.mon)
  const care = S.needsOn ? careOf(statNow(S.mon, 'food'), statNow(S.mon, 'happiness')) : 1
  S.stats[S.mon] = { ...S.stats[S.mon], xp: xpOf(S.mon) + turnXp({ level: was, durationMs, care }) }
  await saveStats($, [S.mon])
  const level = levelOf(S.mon)
  if (level === was) return
  $.ui.toast(nameOf(S.mon) + ' grew to Lv. ' + level + '!')
  $.ui.invalidate('ui.render')
  const into = readyToEvolve()
  if (!into) return
  if (S.autoEvolve) S.evolveDue = into
  else $.ui.toast(nameOf(S.mon) + ' is ready to evolve into ' + displayName(into) + '! /pokemon evolve lets it.')
}

// The box's mons beside the one on show that come out of subagents' balls, one a line,
// like "Sparky (Pikachu), Lv. 12, working for Count files", with the agent named by its
// description in the agent list
async function partyText($) {
  const saved = await $.store.get('stats')
  if (saved && typeof saved === 'object') await freshen($, Object.keys(saved))
  await loadPartyPicks($)
  const assigned = [...new Set(Object.values(S.partyAgents))].filter(canWork)
  const mons = [...assigned, ...partyMons()]
  if (mons.length === 0 && S.partyPicks) return 'Your party is empty. Add a mon from your box with /pokemon party add <mon>.'
  if (mons.length === 0) return 'Your party is empty. Raise or catch another mon, and it comes out of a subagent\'s Poké Ball to work beside ' + nameOf(S.mon) + '.'
  const agents = await $.agent.list().catch(() => [])
  const described = new Map((Array.isArray(agents) ? agents : []).map((agent) => [agent.id, agent.description || agent.id]))
  const lines = mons.map((name) => {
    const member = S.crew.find((m) => m.mon === name && m.endAt === null)
    const types = typesOf(name)
    const shown = fullNameOf(name) + ', Lv. ' + levelOf(name) + (types.length > 0 ? ', for ' + types.join(' and ') : '')
    if (!member) return shown + ', free'
    const waiting = isOut(member, S.tick) ? '' : ', waiting in its ball for room'
    return shown + ', working for ' + (described.get(member.id) ?? member.id) + waiting
  })
  const count = mons.length + (mons.length === 1 ? ' mon' : ' mons')
  return count + ' in your party, beside ' + nameOf(S.mon) + ':\n' + lines.join('\n')
}

// Add a box mon to the party or take one out. The first change starts from the party as
// it stands, and a mon taken out while it works finishes its subagent first.
async function partyCommand($, verb, wanted) {
  const saved = await $.store.get('stats')
  if (saved && typeof saved === 'object') await freshen($, Object.keys(saved))
  await loadPartyPicks($)
  const example = verb === 'add' ? 'dratini' : (partyMons()[0] ?? 'pikachu')
  if (!wanted) return { text: 'Name the mon, like /pokemon party ' + verb + ' ' + example + '. /pokemon box lists yours.' }
  if (!MONS.includes(wanted)) return { text: 'Unknown mon "' + wanted + '". /pokemon box lists yours.' }
  const picks = S.partyPicks ?? partyMons()
  const name = nameOf(wanted)
  if (verb === 'remove') {
    if (!picks.includes(wanted)) return { text: name + ' isn\'t in your party.' }
    S.partyPicks = picks.filter((pick) => pick !== wanted)
    await $.store.set('partyPicks', S.partyPicks)
    const working = S.crew.some((m) => m.mon === wanted && m.endAt === null)
    return { text: name + ' leaves your party.' + (working ? ' It finishes its subagent\'s work first.' : '') }
  }
  if (wanted === S.mon) return { text: name + ' is the mon on show. Pick another with /pokemon <mon> first.' }
  if (!S.stats[wanted] || isDead(wanted)) return { text: displayName(wanted) + ' isn\'t in your box. Catch one, or pick it with /pokemon ' + wanted + '.' }
  if (isGone(wanted)) return { text: name + ' ran away. Catch it in the wild to bring it back.' }
  if (picks.includes(wanted)) return { text: name + ' is already in your party.' }
  if (picks.length >= CREW_SIZE) return { text: 'Your party is full at ' + CREW_SIZE + '. Take one out with /pokemon party remove <mon> first.' }
  S.partyPicks = [...picks, wanted]
  await $.store.set('partyPicks', S.partyPicks)
  const resting = isFainted(wanted) ? ' It rests until it\'s revived.' : ''
  return { text: name + ' joins your party.' + resting }
}

// Assign a box mon to an agent type, so every subagent of that type comes out as it, or
// take an assignment back. A mon works for one agent type at a time.
async function assignCommand($, verb, words) {
  const saved = await $.store.get('stats')
  if (saved && typeof saved === 'object') await freshen($, Object.keys(saved))
  await loadPartyPicks($)
  if (verb === 'unassign') {
    const type = words.join(' ')
    if (!type) return { text: 'Name the agent type, like /pokemon party unassign explore.' }
    if (!S.partyAgents[type]) return { text: 'No mon is assigned to ' + type + '.' }
    const name = nameOf(S.partyAgents[type])
    delete S.partyAgents[type]
    await $.store.set('partyAgents', S.partyAgents)
    return { text: name + ' no longer comes out for ' + type + '.' }
  }
  if (words.length < 2) return { text: 'Name the agent type and the mon, like /pokemon party assign explore abra.' }
  const wanted = words.at(-1)
  const type = words.slice(0, -1).join(' ')
  if (!MONS.includes(wanted)) return { text: 'Unknown mon "' + wanted + '". /pokemon box lists yours.' }
  const name = nameOf(wanted)
  if (wanted === S.mon) return { text: name + ' is the mon on show. Pick another with /pokemon <mon> first.' }
  if (!S.stats[wanted] || isDead(wanted)) return { text: displayName(wanted) + ' isn\'t in your box. Catch one, or pick it with /pokemon ' + wanted + '.' }
  if (isGone(wanted)) return { text: name + ' ran away. Catch it in the wild to bring it back.' }
  const before = typesOf(wanted).filter((other) => other !== type)
  for (const other of before) delete S.partyAgents[other]
  S.partyAgents[type] = wanted
  await $.store.set('partyAgents', S.partyAgents)
  const moved = before.length > 0 ? ' It no longer comes out for ' + before.join(' or ') + '.' : ''
  const resting = isFainted(wanted) ? ' It rests until it\'s revived.' : ''
  return { text: name + ' comes out for every ' + type + ' subagent.' + moved + resting }
}

const OPTIONS = [...HELP.flatMap(([, rows]) => rows.map(([usage]) => usage.split(' ')[0])), 'help']

const PET_LINES = ['loves it', 'wiggles happily', 'leans into your hand', 'does a little hop', 'looks very pleased']

// Send the frame only when it differs from the last one sent or drawn. A resize can
// remount the band, and the host then refuses frames for the old one, so a refused
// frame asks for a redraw, at most once a second, which draws the band anew.
const REDRAW_AFTER_REFUSAL_TICKS = 20
let refusedAt = -Infinity
function blitFrame($) {
  const zoom = bandZoom()
  if (!zoom) return
  if (S.imageRetryAt !== null && S.tick >= S.imageRetryAt) S.imageRetryAt = null
  // Going between the Image and cells takes a redraw, so the blits wait for it
  if (drawsImage() !== S.drawnImage || drawsHearts() !== S.drawnHearts) return $.ui.invalidate('ui.render')
  if (S.drawnHearts) blitHearts($)
  if (S.drawnImage) return blitImage($, zoom)
  const cells = cellsNow()
  if (cells === S.sentCells) return
  S.sentCells = cells
  $.ui
    .blit({ requestId: S.bandId, key: 'pokemon', columns: zoom.columns, rows: zoom.rows, cells })
    .then((result) => {
      if (!result?.deny) return
      S.sentCells = null
      redrawRefused($, result.deny)
    })
    .catch((err) => logOnce($, err))
}

function redrawRefused($, deny) {
  if (S.tick - refusedAt < REDRAW_AFTER_REFUSAL_TICKS) return
  refusedAt = S.tick
  logOnce($, 'frame refused: ' + deny)
  $.ui.invalidate('ui.render')
}

// Swap the small band's Image to the frame now, when it differs from the last one sent
// or drawn. A terminal that draws the Image's alt gets half blocks for a while.
function blitImage($, zoom) {
  const source = imageNow(zoom)
  if (source.png === S.sentImage) return
  S.sentImage = source.png
  $.ui
    .blit({ requestId: S.bandId, key: 'pokemon', columns: zoom.columns, rows: zoom.rows, source })
    .then((result) => {
      if (!result?.deny) {
        S.imagesDrawn = true
        return
      }
      S.sentImage = null
      deniedImage($, result.deny)
    })
    .catch((err) => logOnce($, err))
}

// Send the pixel hearts as drawn, once per PNG, to learn whether the terminal draws them
function blitHearts($) {
  const source = heartsImage(filledIcons('happiness'))
  if (source.png === S.sentHearts) return
  S.sentHearts = source.png
  $.ui
    .blit({ requestId: S.bandId, key: 'hearts', columns: STAT_ICONS, rows: 1, source })
    .then((result) => {
      if (!result?.deny) {
        S.imagesDrawn = true
        return
      }
      S.sentHearts = null
      deniedImage($, result.deny)
    })
    .catch((err) => logOnce($, err))
}

function deniedImage($, deny) {
  if (!/draws its alt/.test(deny)) return redrawRefused($, deny)
  if (S.imageRetryAt !== null) return
  // A terminal that has drawn Images denies one only for a while, as when its focus
  // resets, so the wait starts over
  if (S.imagesDrawn) S.imageWait = IMAGE_WAIT_TICKS[0]
  S.imagesDrawn = false
  S.imageRetryAt = S.tick + S.imageWait
  S.imageWait = Math.min(IMAGE_WAIT_TICKS[1], S.imageWait * 2)
  logOnce($, 'drawing half blocks and text hearts: ' + deny)
  $.ui.invalidate('ui.render')
}

// The desktop has no Raster to repaint, so a changed frame draws the band again. The
// host draws a plugin's band ten times a second at most.
const DESKTOP_FRAME_TICKS = 2
function redrawSvg($) {
  if (!bandZoom() || svgNow() === S.sentSvg) return
  $.ui.invalidate('ui.render')
}

// Ticks stop while the machine sleeps, so the meters resync with the real clock
// The meters drain at OFF_DRAIN of their speed while no session runs: Claude Code closed,
// or the laptop off or asleep. Every open session marks the store as seen every BEAT_MS.
// A session that starts long after the last mark, or a running one whose own beat comes
// late because the laptop slept, moves every meter's timestamp on by the rest of that
// time, so only OFF_DRAIN of it counts. This stacks with /pokemon sleep's slower drain.
const OFF_DRAIN = 0.25
const BEAT_MS = 10 * 1000
const BEAT_TICKS = BEAT_MS / TICK_MS
const OFF_AFTER_MS = 60 * 1000

async function slowMeters($, now, offMs) {
  await freshen($, Object.keys(S.stats))
  // A stamp set during the gap, by another session, only sees the gap after it
  const overlap = (at) => Math.min(offMs, Math.max(0, now - at))
  const draining = Object.keys(S.stats).filter((name) => !S.stats[name].parked)
  for (const name of draining) {
    const record = { ...S.stats[name] }
    for (const key of Object.keys(STATS)) {
      if (record[key]?.at !== undefined) record[key] = { ...record[key], at: record[key].at + overlap(record[key].at) * (1 - OFF_DRAIN) }
    }
    S.stats[name] = record
  }
  // A heal takes open time too, so its end moves on by all of the gap it ran through
  const healing = Object.keys(S.stats).filter((name) => typeof S.stats[name].healing?.until === 'number')
  for (const name of healing) {
    const { from, until } = S.stats[name].healing
    const start = from ?? until - HEAL_MS
    const shift = overlap(start)
    S.stats[name] = { ...S.stats[name], healing: { from: start + shift, until: until + shift } }
  }
  await saveRecords($, [...new Set([...draining, ...healing])])
}

// The gap runs from the last mark any session left, so time another session was open
// never counts as off, whether this one is starting or its own ticks came late
async function beat($) {
  const since = await $.store.get('seenAt')
  const now = await $.clock.now()
  S.nowMs = now
  if (typeof since === 'number' && now - since > OFF_AFTER_MS) await slowMeters($, now, now - since - BEAT_MS)
  await $.store.set('seenAt', now)
}

async function resyncMeters($) {
  S.nowMs = await $.clock.now()
  $.ui.invalidate('ui.render')
}

// A mon faints once food and happiness have both sat empty for FAINT_AFTER_MS of open
// session time, kept in its record as starving = { ms, at }. Each check adds the time since
// the last one by any session, when that's under COUNTED_GAP_MS, so time with every session
// closed or the laptop asleep never counts. A session holds the clock for FAINT_GRACE_MS
// after it first shows the mon. Left fainted for RUNAWAY_AFTER_MS, counted the same way in
// fainted = { ms, at }, it runs away. With needs off, both clocks stop.
const FAINT_AFTER_MS = 3 * 3600 * 1000
const RUNAWAY_AFTER_MS = 24 * 3600 * 1000
const FAINT_GRACE_MS = 10 * 60 * 1000
const COUNTED_GAP_MS = OFF_AFTER_MS

// The mon on show ran away or died, so the band shows the next one in the box: the
// highest level one still standing, else a fainted one. With none, the band is a line of
// text. Returns the mon it shows next, if any.
async function leaveBand($, { save = true } = {}) {
  const gone = S.mon
  const next = Object.keys(S.stats)
    .filter((name) => name !== gone && MONS.includes(name) && S.stats[name] && typeof S.stats[name] === 'object' && !isGone(name))
    .sort((a, b) => isFainted(a) - isFainted(b) || levelOf(b) - levelOf(a) || a.localeCompare(b))[0]
  S.attack = null
  S.food = null
  S.evolving = null
  S.evolveDue = null
  if (S.wild) fleeWild($, true)
  if (next) await switchTo($, next, { save })
  S.sentCells = null
  $.ui.invalidate('ui.render')
  return next ?? null
}

async function faintMon($) {
  const { starving, asleep, ...record } = S.stats[S.mon]
  S.stats[S.mon] = { ...record, food: { value: 0, at: S.nowMs }, happiness: { value: 0, at: S.nowMs }, fainted: { ms: 0, at: S.nowMs } }
  await saveRecords($, [S.mon])
  $.ui.toast(nameOf(S.mon) + ' fainted! /pokemon revive takes it to a Pokémon Center.')
  $.ui.invalidate('ui.render')
}

// The record stays, marked with when it left and the variant it was shown in, for its
// comeback in the wild
async function runAway($) {
  const name = nameOf(S.mon)
  const { fainted, healing, starving, asleep, ...record } = S.stats[S.mon]
  S.stats[S.mon] = { ...record, ranAway: { at: S.nowMs, variant: S.variant } }
  await saveRecords($, [S.mon])
  const next = await leaveBand($)
  $.ui.toast(name + ' ran away! It may turn up in the wild.' + (next ? ' ' + nameOf(next) + ' takes its place.' : ''))
}

// Under nuzlocke a fainted mon is lost. Its record goes for a dead mark that locks the
// species until a new one is caught, and the graveyard keeps who it was.
async function loseMon($, name) {
  const shownName = nameOf(name)
  const grave = { mon: name, level: levelOf(name), at: S.nowMs, ...(S.stats[name]?.nickname ? { nickname: S.stats[name].nickname } : {}) }
  const graveyard = await $.store.get('graveyard')
  await $.store.set('graveyard', [...(Array.isArray(graveyard) ? graveyard : []), grave])
  S.stats[name] = { dead: { at: S.nowMs } }
  await saveRecords($, [name])
  const next = name === S.mon ? await leaveBand($) : null
  $.ui.toast(shownName + ' fainted for good. Rest well.' + (next ? ' ' + nameOf(next) + ' takes its place.' : ''))
}

// With nuzlocke on, every fainted mon in the box is lost, except one already being healed
async function loseFainted($) {
  const saved = await $.store.get('stats')
  if (!saved || typeof saved !== 'object') return
  const names = Object.keys(saved).filter((name) => saved[name]?.fainted && !saved[name].healing && !saved[name].dead && !saved[name].ranAway)
  if (names.length === 0) return
  await freshen($, names)
  for (const name of names) if (isFainted(name) && !isHealing(name)) await loseMon($, name)
}

// Move the shown mon's faint clock or runaway clock on, as often as the beat
async function checkNeglect($) {
  if (S.checkingNeglect) return
  S.checkingNeglect = true
  try {
    S.nowMs = await $.clock.now()
    if (S.nuzlockeOn) await loseFainted($)
    await freshen($, [S.mon])
    const record = S.stats[S.mon]
    if (!S.needsOn || !record || isGone(S.mon) || isHealing(S.mon)) return
    const now = S.nowMs
    const counts = now - (S.firstShown.get(S.mon) ?? now) >= FAINT_GRACE_MS
    const added = (clock) => (counts && clock && now - clock.at <= COUNTED_GAP_MS ? Math.max(0, now - clock.at) : 0)
    if (isFainted(S.mon)) {
      const ms = (record.fainted.ms ?? 0) + added(record.fainted)
      if (ms >= RUNAWAY_AFTER_MS) return await runAway($)
      S.stats[S.mon] = { ...record, fainted: { ms, at: now } }
      return await saveRecords($, [S.mon])
    }
    if (statNow(S.mon, 'food') > 0 || statNow(S.mon, 'happiness') > 0) {
      if (!record.starving) return
      const { starving, ...rest } = record
      S.stats[S.mon] = rest
      return await saveRecords($, [S.mon])
    }
    const ms = (record.starving?.ms ?? 0) + added(record.starving)
    if (ms >= FAINT_AFTER_MS) return await (S.nuzlockeOn ? loseMon($, S.mon) : faintMon($))
    S.stats[S.mon] = { ...record, starving: { ms, at: now } }
    await saveRecords($, [S.mon])
  } finally {
    S.checkingNeglect = false
  }
}

async function finishHeal($) {
  S.finishingHeal = true
  try {
    S.nowMs = await $.clock.now()
    await freshen($, [S.mon])
    const healed = settleHeal(S.mon)
    if (healed) await saveRecords($, [S.mon])
    if (healed || !isFainted(S.mon)) {
      markActive()
      S.hopStart = S.tick
      S.releasedAt = S.tick
      $.ui.toast(nameOf(S.mon) + ' is healed and back on its feet!')
      $.ui.invalidate('ui.render')
    }
  } finally {
    S.finishingHeal = false
  }
}

// Stop whatever the shown mon was doing once it's down, here or in another session
function stepDown($) {
  if (!isDown()) return
  if (isHealing(S.mon) && !S.finishingHeal && S.nowMs >= S.stats[S.mon].healing.until) finishHeal($).catch((err) => logOnce($, err))
  S.attack = null
  S.evolving = null
  S.evolveDue = null
  S.food = null
}

// /pokemon revive [<mon>] takes a fainted mon to a Pokémon Center for HEAL_MS
async function reviveCommand($, wanted) {
  const name = wanted || S.mon
  if (!MONS.includes(name)) return { text: 'Unknown mon "' + wanted + '". /pokemon box lists yours.' }
  await freshen($, [name])
  if (name === S.mon && isDown()) {
    if (isGone(S.mon) || isHealing(S.mon)) return downReply()
  } else if (isDead(name)) {
    return { text: displayName(name) + ' is gone.' }
  } else if (hasRunAway(name)) {
    return { text: goneLine(name) }
  }
  const shown = nameOf(name)
  if (!isFainted(name)) return { text: shown + ' hasn\'t fainted.' }
  if (isHealing(name)) return { text: shown + ' is already at the Pokémon Center.' }
  if (S.nuzlockeOn) return { text: 'Nuzlocke is on, so ' + shown + ' can\'t be revived.' }
  S.stats[name] = { ...S.stats[name], healing: { from: S.nowMs, until: S.nowMs + HEAL_MS } }
  await saveRecords($, [name])
  // It comes back out of its ball at home
  if (name === S.mon) S.x = homeX()
  $.ui.invalidate('ui.render')
  return { text: 'You take ' + shown + ' to a Pokémon Center. It\'ll be back on its feet in ' + HEAL_MS / 60000 + ' minutes.' }
}

// The shown mon is at the Pokémon Center, so it can't be swapped out until it's back
async function stillHealing($) {
  await freshen($, [S.mon])
  return isHealing(S.mon) && S.nowMs < S.stats[S.mon].healing.until
}

async function nuzlockeCommand($) {
  S.nuzlockeOn = !S.nuzlockeOn
  await $.store.set('nuzlocke', S.nuzlockeOn)
  if (!S.nuzlockeOn) return { text: 'Nuzlocke is off. A mon that faints can be revived again. The ones you lost stay gone.' }
  const saved = await $.store.get('stats')
  if (saved && typeof saved === 'object') await freshen($, Object.keys(saved))
  const doomed = Object.keys(S.stats).filter((name) => MONS.includes(name) && isFainted(name) && !isHealing(name))
  const fate = doomed.length === 1 ? ' has fainted already, so it\'s gone for good in a moment.' : ' have fainted already, so they\'re gone for good in a moment.'
  const warning = doomed.length > 0 ? ' ' + andList(doomed.map(nameOf)) + fate : ''
  return { text: 'Nuzlocke is on. A mon that faints is gone for good, with no revive and no coming back. Keep them fed and happy.' + warning }
}

async function trainerCommand($) {
  S.trainerOn = !S.trainerOn
  await $.store.set('trainer', S.trainerOn)
  if (!S.trainerOn) return { text: 'Trainer mode is off. /pokemon <mon> shows any mon.' }
  const pick = (await boxIsEmpty($)) ? 'Pick your starter, ' + orList(STARTERS.map(displayName)) + ', then catch the rest in the wild.' : 'You can only switch to mons in your box, so catch the rest in the wild.'
  return { text: 'Trainer mode is on. ' + pick + ' Mons fetched with /pokemon new stay free to show.' }
}

// With trainer mode on, only mons in your box can be shown. A box with no mon in it, new
// or with every mon gone, picks one of the starters, so it's never stuck with nothing to
// show or catch with. Mons fetched with /pokemon new are left out of it.
const STARTERS = ['bulbasaur', 'charmander', 'squirtle', 'pikachu']

async function boxIsEmpty($) {
  const saved = await $.store.get('stats')
  if (saved && typeof saved === 'object') await freshen($, Object.keys(saved))
  return !Object.keys(S.stats).some((name) => MONS.includes(name) && !isGone(name))
}

// Why trainer mode keeps asked off the band, or null when it may be shown. The caller has
// freshened asked's record. A starter picked joins the box at its first level.
async function trainerWait($, asked) {
  if (!S.trainerOn || asked === S.mon || S.stats[asked] || (await $.store.get(CUSTOM_PREFIX + asked))) return null
  const off = ', or turn trainer mode off with /pokemon trainer.'
  if (!(await boxIsEmpty($))) return { text: 'Trainer mode is on, so you can only switch to mons in your box. Catch a wild ' + displayName(asked) + ' to raise one' + off }
  if (!STARTERS.includes(asked)) return { text: 'Trainer mode is on, so pick your starter first: ' + orList(STARTERS.map(displayName)) + '. Catch the rest in the wild' + off }
  S.stats[asked] = { xp: xpAt(startLevel(asked)) }
  await saveRecords($, [asked])
  return null
}

// A broken frame goes to the debug log, each distinct message once
const logged = new Set()
function logOnce($, err) {
  const message = String(err?.message ?? err)
  if (logged.has(message)) return
  logged.add(message)
  // Logging is best effort: a log that fails must not break the hook that hit the error
  try {
    Promise.resolve($.ui.log('pokemon: ' + message, { to: 'debug' })).catch(() => {})
  } catch {}
}

async function themeInk($) {
  try {
    const rows = await $.config.list()
    return inkFor(rows.find((row) => row.key === 'theme')?.value)
  } catch {
    return INKS.dark
  }
}


// Show another mon, parking the one that leaves so its meters stop where they are
async function switchTo($, asked, { save = true } = {}) {
  const wasHome = isHome()
  S.evolveDue = null
  const left = S.mon
  S.nowMs = await $.clock.now()
  await freshen($, [left, asked])
  settleHeal(asked)
  if (!S.firstShown.has(asked)) S.firstShown.set(asked, S.nowMs)
  if (asked !== left && (S.stats[left] || S.stats[asked])) {
    park(left)
    unpark(asked)
    await saveRecords($, [left, asked])
  }
  S.mon = asked
  if (wasHome) S.x = homeX()
  clampX()
  if (save) await saveMon($)
}

// Load the mons fetched with /pokemon new, in this session or another, not loaded yet
async function loadCustom($) {
  for (const key of await $.store.keys()) {
    const name = key.slice(CUSTOM_PREFIX.length)
    if (!key.startsWith(CUSTOM_PREFIX) || SPRITES[name]) continue
    const saved = await $.store.get(key)
    if (saved?.sprite) addCustom(name, saved)
  }
}

// /pokemon new <mon> fetches a mon from any generation and shows it. "random" picks one
// from gen 2 to 5 you don't have yet, and "random gen3" or "gen3" one from that generation.
async function newCommand($, wanted) {
  const genAsked = wanted.match(/^(?:random\s*)?gen\s*([1-5])$/)
  const random = wanted === 'random' || genAsked !== null
  let name = random ? '' : wanted.replace(/\s+/g, '_')
  let gen
  const get = (url, init) => $.http.fetch(url, init)
  if (!wanted) return { text: 'Name a mon to fetch, like /pokemon new mudkip, or try /pokemon new random or /pokemon new gen3.' }
  try {
    if (random) {
      gen = genAsked ? Number(genAsked[1]) : 2 + Math.floor(Math.random() * 4)
      const fresh = (await monsOfGen(get, gen)).filter((n) => !SPRITES[n])
      if (fresh.length === 0) return { text: 'You already have every gen ' + gen + ' mon.' }
      name = fresh[Math.floor(Math.random() * fresh.length)]
    } else if (SPRITES[name]) {
      return { text: nameOf(name) + ' is already here. /pokemon ' + name + ' shows it.' }
    } else if (!/^[a-z0-9_.-]+$/.test(name)) {
      return { text: 'Unknown mon "' + wanted + '". Names are like mudkip or mr._mime.' }
    }
    const entry = await fetchMon(get, name, gen)
    await $.store.set(CUSTOM_PREFIX + name, entry)
    addCustom(name, entry)
    await switchTo($, name)
    $.ui.invalidate('ui.render')
    return { text: 'Fetched gen ' + entry.gen + ' ' + nameOf(name) + '. It knows ' + entry.moves.join(', ') + '. Now showing ' + S.variant + ' ' + nameOf(name) + '.' }
  } catch (err) {
    return { text: "Couldn't fetch " + (name || 'a mon') + ': ' + (err?.message ?? String(err)) }
  }
}

// Asks for half the terminal, unless the person sized the dock themselves
async function openPane($, columns) {
  const opened = await $.ui.open({ id: PANE_ID, title: 'Pokémon', ...(columns > 0 ? { columns } : {}) })
  if (!opened.isPlaced) leavePane($)
  return opened
}

// The band draws the scene again, and blits go to it
function leavePane($) {
  if (!S.paneShown) return
  S.paneShown = false
  S.bandId = null
  $.ui.invalidate('ui.render')
}

async function paneCommand($, presentation) {
  if (S.paneOn) {
    S.paneOn = false
    await $.store.set('pane', false)
    await $.ui.close({ id: PANE_ID })
    leavePane($)
    return { text: nameOf(S.mon) + ' is back above the prompt.' }
  }
  S.paneOn = true
  const columns = Math.floor((presentation?.columns ?? 0) / 2)
  await $.store.set('pane', true)
  await $.store.set('paneColumns', columns)
  const opened = await openPane($, columns)
  if (!opened.isPlaced) return { text: nameOf(S.mon) + "'s pane is open but waits for a wider terminal. /pokemon pane brings it back to the band." }
  if (presentation?.isFullscreen === false) return { text: nameOf(S.mon) + ' moved to a pane above the prompt. It docks beside the transcript in the fullscreen layout. /pokemon pane brings it back to the band.' }
  return { text: nameOf(S.mon) + ' moved to a pane beside the transcript. /pokemon pane brings it back to the band.' }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    S.sessionToken = Math.random().toString(36).slice(2)
    await $.command.register({
      name: 'pokemon',
      description: 'Pick the Pokémon above the prompt, pet it, feed it, put it to sleep, make it attack, list its moves, evolve it, or check your Pokédex',
      argumentHint: '[' + OPTIONS.join('|') + ']',
      immediate: true,
    })
    await loadCustom($).catch((err) => logOnce($, err))
    const savedMon = await $.store.get('mon')
    if (MONS.includes(savedMon)) S.mon = savedMon
    S.seenPick = savedMon ?? null
    S.syncOn = (await $.store.get('sync')) === true
    S.nuzlockeOn = (await $.store.get('nuzlocke')) === true
    S.trainerOn = (await $.store.get('trainer')) !== false
    await loadPartyPicks($)
    forgetOldKeys($).catch((err) => logOnce($, err))
    const savedVariant = await $.store.get('variant')
    if (VARIANTS.includes(savedVariant)) S.variant = savedVariant
    S.wander = (await $.store.get('wander')) !== false
    S.needsOn = (await $.store.get('needs')) !== false
    S.emojiOn = (await $.store.get('emoji')) === true
    const savedSize = await $.store.get('size')
    if (Object.hasOwn(SIZES, savedSize)) S.size = savedSize
    const savedImages = await $.store.get('images')
    if (Object.hasOwn(IMAGE_MODES, savedImages)) S.imageMode = savedImages
    S.autoEvolve = (await $.store.get('autoEvolve')) !== false
    S.paneOn = (await $.store.get('pane')) === true
    S.paneShown = false
    if (S.paneOn) openPane($, await $.store.get('paneColumns')).catch((err) => logOnce($, err))
    const savedStats = await $.store.get('stats')
    if (savedStats && typeof savedStats === 'object') S.stats = savedStats
    S.nowMs = await $.clock.now()
    S.firstShown.set(S.mon, S.nowMs)
    S.ink = await themeInk($)
    // A refused env read leaves the band as it is on any other terminal
    const unread = () => undefined
    S.knownImages = drawsImages({
      program: await $.env.get('TERM_PROGRAM').catch(unread),
      version: await $.env.get('TERM_PROGRAM_VERSION').catch(unread),
      term: await $.env.get('TERM').catch(unread),
      kittyWindow: await $.env.get('KITTY_WINDOW_ID').catch(unread),
    })
    applyImageMode()
    await beat($).catch((err) => logOnce($, err))
    // Shown again, a parked mon's meters pick up where they stopped
    if (S.stats[S.mon]?.parked && !isGone(S.mon)) {
      unpark(S.mon)
      await saveStats($, [S.mon]).catch((err) => logOnce($, err))
    }
    // The mon last picked ran away or was lost, so the session starts with the next one
    if (isGone(S.mon)) await leaveBand($).catch((err) => logOnce($, err))
    await checkNeglect($).catch((err) => logOnce($, err))
    $.clock.every(TICK_MS, () => {
      try {
        stepDown($)
        step()
        stepEvolution($)
        stepWildPhase($)
        stepCrewMons()
        stepWake($)
        stepOwed($)
        // The band grows and shrinks back around a Transform
        if (bandRows() !== S.drawnRows) {
          S.drawnRows = bandRows()
          $.ui.invalidate('ui.render')
        }
        // The strip grows and shrinks back around a wild mon's visit
        if (S.bandId !== null && stripTarget(S.lastBodyColumns) !== S.drawnColumns) {
          S.drawnColumns = stripTarget(S.lastBodyColumns)
          $.ui.invalidate('ui.render')
        }
        if (S.tick % STAT_REDRAW_TICKS === 0) resyncMeters($).catch((err) => logOnce($, err))
        if (S.tick % SYNC_TICKS === 0) syncSessions($).catch((err) => logOnce($, err))
        if (S.tick % PARTY_SYNC_TICKS === 0) syncParty($).catch((err) => logOnce($, err))
        if (S.tick % BEAT_TICKS === 0) beat($).then(() => checkNeglect($)).catch((err) => logOnce($, err))
        if (S.bandId !== null && S.bandSurface === 'terminal') blitFrame($)
        if (S.bandId !== null && S.bandSurface === 'desktop' && S.tick % DESKTOP_FRAME_TICKS === 0) redrawSvg($)
      } catch (err) {
        logOnce($, err)
      }
    })
    return next(e)
  })

  // Follow the theme, so the bubble and the Zs stay visible on its background
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (result?.value !== undefined) {
      S.ink = inkFor(result.value)
      $.ui.invalidate('ui.render')
    }
    return result
  })

  on('command.run', { command: 'pokemon' }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()
    let reply
    // Another session may have fetched a mon since this one started
    await loadCustom($).catch(() => {})
    // A pet doesn't wake a sleeping mon, so it doesn't count as activity
    if (asked !== 'pet' || !isAsleep()) markActive()
    clearAlert()
    S.nowMs = await $.clock.now()
    if (waitsForEvolution(asked)) return evolvingReply()
    if (waitsForCare(asked)) return careReply()
    const verb = asked.split(' ')[0]
    const blocked = DOWN_WAITS.includes(verb) || (isGone(S.mon) && GONE_WAITS.includes(verb))
    if (asked !== 'attack list' && isDown() && blocked) {
      // Healed or caught back in another session since the last sync, it carries on
      await freshen($, [S.mon])
      if (isDown()) return downReply()
    }
    if (MONS.includes(asked)) {
      await freshen($, [asked])
      if (isDead(asked)) return { text: displayName(asked) + ' is gone. Catch a new one in the wild to raise it again.' }
      if (hasRunAway(asked)) return { text: goneLine(asked) }
      if (asked !== S.mon && (await stillHealing($))) return healingReply()
      if ((reply = await trainerWait($, asked))) return reply
      await switchTo($, asked)
    } else if (asked === 'new' || asked.startsWith('new ')) {
      if (await stillHealing($)) return healingReply()
      return newCommand($, asked.slice('new'.length).trim())
    } else if (VARIANTS.includes(asked)) {
      S.variant = asked
      await $.store.set('variant', S.variant)
    } else if (asked === 'wander') {
      S.wander = !S.wander
      S.wanderTarget = null
      await $.store.set('wander', S.wander)
      return { text: nameOf(S.mon) + (S.wander ? ' is free to wander.' : ' is heading home.') }
    } else if (asked === 'pet') {
      // A mon as happy as can be, every heart filled, still enjoys it, but it fills no
      // meter and doesn't count as a pet
      const happiest = isHappiest()
      const sleeping = isAsleep()
      pet()
      const line = nameOf(S.mon) + ' ' + (sleeping ? 'smiles in its sleep' : PET_LINES[Math.floor(Math.random() * PET_LINES.length)]) + ' ♥'
      if (happiest) return { text: line + ' ' + nameOf(S.mon) + ' is already as happy as can be.' }
      S.pettingFills = S.mon
      const pets = Number((await $.store.get('pets')) ?? 0) + 1
      await $.store.set('pets', pets)
      return { text: line }
    } else if (asked === 'feed') {
      if (isHere(S.wild)) return { text: 'Not now, a ' + wildName() + ' is right there!' }
      // A full mon, every food icon filled, still eats the berry, but it fills no meter
      // and doesn't count as a feed
      const full = isFull()
      const berry = feed()
      const article = /^[aeiou]/.test(berry.name) ? 'an ' : 'a '
      const tossed = 'You toss ' + nameOf(S.mon) + ' ' + article + berry.name + ' ' + berry.emoji
      if (full) return { text: tossed + '. ' + nameOf(S.mon) + ' is already full, so it just nibbles it.' }
      // The meters fill once it has eaten the berry
      S.food.fills = S.mon
      const feeds = Number((await $.store.get('feeds')) ?? 0) + 1
      await $.store.set('feeds', feeds)
      return { text: tossed }
    } else if (asked === 'sleep') {
      const name = nameOf(S.mon)
      if (isTuckedIn()) {
        await setAsleep($, false)
        return { text: name + ' wakes up.' }
      }
      if (S.turnRunning) return { text: name + " can't sleep while Claude is working." }
      await setAsleep($, true)
      return { text: name + ' curls up and falls asleep. Its meters drain slower until Claude starts working.' }
    } else if (asked === 'attack' || asked.startsWith('attack ')) {
      return attackCommand(asked.slice('attack'.length).trim())
    } else if (asked === 'catch') {
      return catchCommand()
    } else if (asked === 'run') {
      if (!S.wild || S.wild.phase === 'fleeing') return { text: 'There\'s no wild Pokémon here.' }
      fleeWild($, true)
      return { text: 'Got away safely!' }
    } else if ((asked === 'wild' || asked.startsWith('wild ')) && (reply = await wildCommand($, asked.slice('wild'.length)))) {
      return reply
    } else if (asked === 'kill' && (reply = await killCommand($))) {
      return reply
    } else if (asked === 'moves' || asked.startsWith('moves ')) {
      const whose = asked.slice('moves'.length).trim() || S.mon
      if (!MONS.includes(whose)) return { text: 'Unknown mon "' + whose + '". See /pokemon list for every mon.' }
      return movesText(whose)
    } else if (asked === 'needs') {
      S.needsOn = !S.needsOn
      await $.store.set('needs', S.needsOn)
      $.ui.invalidate('ui.render')
      const name = nameOf(S.mon)
      const still = isFainted(S.mon) ? ' It\'s still fainted, so /pokemon revive takes it to a Pokémon Center.' : ''
      return { text: (S.needsOn ? 'Needs are on. Keep ' + name + ' fed and happy.' : 'Needs are off. ' + name + ' won\'t get hungry or lonely.') + still }
    } else if (asked === 'emoji') {
      S.emojiOn = !S.emojiOn
      await $.store.set('emoji', S.emojiOn)
      $.ui.invalidate('ui.render')
      const icons = iconsFor('food').trimEnd() + ' ' + iconsFor('happiness').trimEnd()
      return { text: (S.emojiOn ? 'The meters show emoji: ' : 'The meters show text icons: ') + icons }
    } else if (asked === 'size' || asked.startsWith('size ')) {
      const wanted = asked.slice('size'.length).trim()
      const sizes = Object.keys(SIZES).join(', ')
      if (!wanted) return { text: 'The band is ' + S.size + '. Sizes: ' + sizes + '.' }
      if (!Object.hasOwn(SIZES, wanted)) return { text: 'Unknown size "' + wanted + '". Try one of: ' + sizes + '.' }
      S.size = wanted
      await $.store.set('size', S.size)
      $.ui.invalidate('ui.render')
      return { text: 'The band is ' + S.size + '.' }
    } else if (asked === 'images' || asked.startsWith('images ')) {
      const wanted = asked.slice('images'.length).trim()
      const modes = Object.keys(IMAGE_MODES).join(', ')
      const drawn = () => (S.noImages ? 'half blocks' : 'images')
      if (!wanted) return { text: 'Images are ' + S.imageMode + ', so the band draws ' + drawn() + '. Modes: ' + modes + '.' }
      if (!Object.hasOwn(IMAGE_MODES, wanted)) return { text: 'Unknown mode "' + wanted + '". Try one of: ' + modes + '.' }
      S.imageMode = wanted
      await $.store.set('images', S.imageMode)
      applyImageMode()
      $.ui.invalidate('ui.render')
      return { text: 'Images are ' + S.imageMode + ', so the band draws ' + drawn() + '.' }
    } else if (asked === 'pane') {
      return paneCommand($, e.presentation)
    } else if (asked === 'sync') {
      S.syncOn = !S.syncOn
      await $.store.set('sync', S.syncOn)
      const name = nameOf(S.mon)
      if (!S.syncOn) return { text: 'Sync is off. Each session keeps the mon picked in it.' }
      // This session's mon becomes the pick the others follow
      await saveMon($)
      return { text: 'Sync is on. Every open session shows ' + name + ', and follows the next mon you pick.' }
    } else if (asked === 'autoevolve') {
      S.autoEvolve = !S.autoEvolve
      await $.store.set('autoEvolve', S.autoEvolve)
      const name = nameOf(S.mon)
      if (!S.autoEvolve) {
        S.evolveDue = null
        return { text: name + ' waits for /pokemon evolve when it reaches its evolution level.' }
      }
      // Already at its level, it evolves once idle
      S.evolveDue = readyToEvolve()
      return { text: name + ' evolves on its own once idle at its evolution level.' }
    } else if (asked === 'revive' || asked.startsWith('revive ')) {
      return reviveCommand($, asked.slice('revive'.length).trim())
    } else if (asked === 'nuzlocke') {
      return nuzlockeCommand($)
    } else if (asked === 'trainer') {
      return trainerCommand($)
    } else if (asked === 'evolve' || asked.startsWith('evolve ')) {
      return evolveCommand($, asked.slice('evolve'.length).trim())
    } else if (asked === 'stop') {
      return stopEvolution($)
    } else if (asked === 'stats') {
      const pets = Number((await $.store.get('pets')) ?? 0)
      const feeds = Number((await $.store.get('feeds')) ?? 0)
      return { text: statsText(pets, feeds) }
    } else if (asked === 'box') {
      // List every record as last saved by any session
      const saved = await $.store.get('stats')
      if (saved && typeof saved === 'object') await freshen($, Object.keys(saved))
      const healed = Object.keys(S.stats).filter((name) => name !== S.mon && settleHeal(name))
      if (healed.length > 0) await saveRecords($, healed)
      const dex = await $.store.get('dex')
      return { text: boxText(dex && typeof dex === 'object' ? dex : {}) }
    } else if (asked === 'party') {
      return { text: await partyText($) }
    } else if (asked.startsWith('party assign') || asked.startsWith('party unassign')) {
      const [, verb, ...rest] = asked.split(/\s+/)
      return assignCommand($, verb, rest)
    } else if (asked.startsWith('party add') || asked.startsWith('party remove')) {
      const [, verb, ...rest] = asked.split(/\s+/)
      return partyCommand($, verb, rest.join(' '))
    } else if (asked === 'dex' || asked.startsWith('dex ')) {
      const saved = await $.store.get('stats')
      if (saved && typeof saved === 'object') await freshen($, Object.keys(saved))
      const dex = await $.store.get('dex')
      return { text: dexText(dex && typeof dex === 'object' ? dex : {}, asked.slice('dex'.length).trim(), await $.store.get('graveyard')) }
    } else if (asked === 'release' || asked.startsWith('release ')) {
      const wanted = asked.slice('release'.length).trim()
      if (MONS.includes(wanted)) await freshen($, [wanted])
      // The shown mon starts over, so a foe it faced leaves
      if (wanted === S.mon && S.stats[wanted] && S.wild) fleeWild($)
      const result = releaseCommand(wanted)
      if (MONS.includes(wanted)) await saveRecords($, [wanted])
      $.ui.invalidate('ui.render')
      return result
    } else if (asked === 'nickname' || asked.startsWith('nickname ')) {
      await freshen($, [S.mon])
      const result = nicknameCommand(e.args.trim().slice('nickname'.length))
      await saveRecords($, [S.mon])
      $.ui.invalidate('ui.render')
      return result
    } else if (asked === 'list') {
      return { text: MONS.length + ' mons: ' + MONS.join(', ') }
    } else if (asked === 'help') {
      return { text: helpText((await $.store.get('debug')) === true) }
    } else if (asked) {
      return { text: 'Unknown option "' + asked + '". Try one of: ' + OPTIONS.join(', ') + '. See /pokemon list for every mon.' }
    } else {
      if (isGone(S.mon)) return { text: goneLine(S.mon) + ' /pokemon <mon> picks another. Options: ' + OPTIONS.join(', ') + '.' }
      const condition = conditionOf(S.mon)
      const mode = (condition ? ', ' + condition : '') + (isTuckedIn() ? ', asleep' : '') + (S.wander ? ', wandering' : '') + (isHere(S.wild) ? ', a ' + wildName() + ' is here' : '')
      const levels = 'food ' + Math.round(statNow(S.mon, 'food')) + '%, happiness ' + Math.round(statNow(S.mon, 'happiness')) + '%'
      const shown = nameOf(S.mon) + ' Lv. ' + levelOf(S.mon)
      return { text: 'Showing ' + S.variant + ' ' + shown + mode + ' (' + (S.needsOn ? levels : 'needs off') + '). Options: ' + OPTIONS.join(', ') + '. /pokemon help says what each does.' }
    }
    $.ui.invalidate('ui.render')
    return { text: 'Now showing ' + S.variant + ' ' + nameOf(S.mon) + '.' }
  })

  // Typing or sending a prompt wakes the mon up and answers its "!"
  on('prompt.edit', async ($, e, next) => {
    markActive()
    clearAlert()
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    markActive()
    clearAlert()
    return next(e)
  })

  // Read what the turn is doing from the spinner, and draw the spinner as usual
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    S.thinking = e.props.mode === 'thinking'
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    S.turnRunning = true
    return next(e)
  })

  // The main agent's turn ending answers any "!" and starts the idle minute. The mon
  // hops unless the turn was interrupted, and earns XP when it answered. A subagent's
  // turn ending sends its party mon back and pops its Poké Ball.
  on('turn.complete', async ($, e, next) => {
    S.thinking = false
    markActive()
    if (e.agentId) endAgent(e.agentId)
    if (!e.agentId) {
      S.turnRunning = false
      clearAlert()
    }
    if (!e.agentId && !e.isAborted) {
      S.hopStart = S.tick
      S.idleAlertAt = S.tick + IDLE_WAIT_MS / TICK_MS
      S.wild = chargedWild(S.wild)
    }
    // A foe left uncaught for WILD_TURNS main turns moves on
    if (!e.agentId && S.wild?.phase === 'battle') {
      S.wild = { ...S.wild, turns: S.wild.turns + 1 }
      if (S.wild.turns >= WILD_TURNS) fleeWild($)
    }
    if (!e.agentId && e.reason === 'answer') await gainXp($, e.durationMs ?? 0).catch((err) => logOnce($, err))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const desktop = e.surface === 'desktop'
    if ((e.surface !== 'terminal' && !desktop) || e.props.hasSurvey) {
      if (!S.paneShown) S.bandId = null
      return next(e)
    }
    if (S.working !== e.props.isWorking) {
      S.working = e.props.isWorking
      // The pane hears of a turn through the band, so it draws again with it
      if (S.paneShown) $.ui.invalidate('ui.render')
    }
    if (!S.working) S.thinking = false
    if (S.paneShown) return next(e)
    const elements = $.ui.resolve(e)
    const corner = drawScene(elements, e, { maxRows: e.props.maxRows, bodyColumns: e.props.bodyColumns, buttons: battleButtons($, elements) })
    const { Box } = $.ui.resolve(e)
    const theirs = await next(e)
    return Box({
      flexDirection: 'row',
      justifyContent: theirs ? 'space-between' : 'flex-end',
      children: theirs ? [Box({ flexGrow: 1, children: [theirs] }), ...corner] : corner,
    })
  })

  // Docked, the pane runs floor to ceiling, so the scene sits at its foot by the prompt
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e)
    const wasShown = S.paneShown
    S.paneShown = true
    // The band stops drawing the scene once the pane does
    if (!wasShown) $.ui.invalidate('ui.render')
    const elements = $.ui.resolve(e)
    const { Box } = elements
    const corner = drawScene(elements, e, { maxRows: e.props.scroll.bodyRows, bodyColumns: e.props.bodyColumns, buttons: battleButtons($, elements) })
    const docked = e.props.placement === 'dock'
    return Box({
      flexDirection: 'column',
      justifyContent: 'flex-end',
      height: docked ? e.props.scroll.bodyRows : undefined,
      children: [Box({ flexDirection: 'row', justifyContent: 'flex-end', children: corner })],
    })
  })

  // Closed by hand, the scene goes back to the band and stays there
  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id !== PANE_ID) return result
    leavePane($)
    if (e.origin === 'person') {
      S.paneOn = false
      await $.store.set('pane', false)
    }
    return result
  })

  // Show the main loop's running tools in the bubble, and any agent's running skill as
  // a TM disc, and call you over while one asks you something. A call resolving also
  // settles a dialog waiting on its tool.
  // A call that errors or throws makes the mon flinch, unless you interrupted it or
  // it was refused: by the permission check, at its dialog, or by a hook beneath.
  on('tool.call', async ($, e, next) => {
    const name = String(e.tool)
    let id = null
    S.toolCalls += 1
    const skillId = name === 'Skill' ? (e.tool_use_id ?? S.toolCalls) : null
    if (skillId !== null) S.runningSkills.add(skillId)
    // A subagent's call shows in its party mon's bubble
    const crewCall = e.agentId && S.crew.some((m) => m.id === e.agentId) ? (e.tool_use_id ?? S.toolCalls) : null
    if (crewCall !== null) S.crew = crewToolStarts(S.crew, e.agentId, crewCall, name)
    if (!e.agentId) {
      await maybeSpawn($).catch((err) => logOnce($, err))
      id = e.tool_use_id ?? S.toolCalls
      S.runningTools.set(id, name)
      if (QUESTION_TOOLS.includes(name)) raiseAlert({ tool: name })
    }
    let failed = true
    try {
      const result = await next(e)
      failed = result?.isError === true && !REFUSED.test(String(result.text ?? ''))
      return result
    } finally {
      S.wild = chargedWild(S.wild)
      if (skillId !== null) S.runningSkills.delete(skillId)
      if (crewCall !== null) {
        S.crew = crewToolEnds(S.crew, e.agentId, crewCall, failed && !next.signal?.aborted && S.verdicts.get(crewCall) !== 'deny', S.tick)
        S.verdicts.delete(crewCall)
      }
      if (id !== null) {
        S.runningTools.delete(id)
        if (failed && !next.signal?.aborted && S.verdicts.get(id) !== 'deny') flinch()
        S.verdicts.delete(id)
      }
      S.alertTools.delete(name)
    }
  })

  // A skill you type as /name runs as a command, with no Skill call, and a forked one
  // also spawns no agent, so the command running is the only sign of it. A command from
  // your own files, a plugin, or an MCP server counts as a skill; Claude Code's built-in
  // commands, and /pokemon itself, don't. The disc shows for a moment.
  on('command.run', async ($, e, next) => {
    if (e.command !== 'pokemon') await markSkillCommand($, e.command).catch((err) => logOnce($, err))
    return next(e)
  })

  // The typings say a skill's prompt expanding raises this, for /name, the Skill tool,
  // and a preload into a subagent. In practice no session raises it yet, so the hooks
  // above carry the disc, and this one is ready for when it does.
  on('skill.prompt', async ($, e, next) => {
    S.discUntil = S.tick + DISC_TICKS
    return next(e)
  })

  // Note what the permission check decides for the main loop's calls, so a call it
  // denies isn't taken for a tool failing
  on('tool.check', async ($, e, next) => {
    const result = await next(e)
    const crewCall = S.crew.some((m) => m.tools.some((t) => t.call === e.tool_use_id))
    if (e.tool_use_id !== undefined && (S.runningTools.has(e.tool_use_id) || crewCall)) S.verdicts.set(e.tool_use_id, result?.decision)
    return result
  })

  // Call you over while a permission dialog waits, until the call it holds resolves.
  // A hook that decides the request opens no dialog.
  on('classic.PermissionRequest', async ($, e, next) => {
    const result = await next(e)
    if (!result?.decision) raiseAlert({ tool: e.tool_name })
    return result
  })

  // Call you over when Claude needs you. The permission reminder comes 6 s into a
  // dialog PermissionRequest already flagged, so it raises nothing while that alert is up.
  // The idle reminder has its own timer above, since a policy plugin can keep classic
  // events from reaching user plugins.
  on('classic.Notification', async ($, e, next) => {
    const type = e.notification_type
    const reminder = type === 'permission_prompt' && S.alertTools.size > 0
    if (ALERT_NOTIFICATIONS.includes(type) && !reminder) raiseAlert({ ticks: Infinity })
    return next(e)
  })

  // Each subagent the Agent tool starts is a Poké Ball in the party along the left of
  // the strip, until its turn ends or the agent list stops reporting it at work, and the
  // next mon from the box waits in it to step out
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result?.agentId) {
      S.party = joinParty(S.party, result.agentId, S.tick)
      await joinCrewFor($, result.agentId, e.subagentType).catch((err) => logOnce($, err))
    }
    return result
  })

  // A subagent's model thinking shows as dots in its party mon's bubble, until it writes,
  // calls a tool, or stops
  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    try {
      while (true) {
        const { value, done } = await stream.next()
        if (done) return value
        if (e.agentId && THOUGHT_KINDS.has(value?.kind)) S.crew = crewThinking(S.crew, e.agentId, value.kind === 'thinking')
        yield value
      }
    } finally {
      if (e.agentId) S.crew = crewThinking(S.crew, e.agentId, false)
    }
  })
}
