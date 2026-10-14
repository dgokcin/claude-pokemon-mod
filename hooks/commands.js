import { aimsAhead } from './attacks.js'
import { foeMoves } from './encounter.js'
import { startAttack } from './motion.js'
import { movesOf } from './moves.js'
import { displayName } from './names.js'
import { downReply, nameOf } from './records.js'
import { MONS } from './sprites.js'
import { S } from './state.js'
import { isDead, isDown, isPetted } from './status.js'

// The /pokemon options that need nothing from the engine, and which options wait while
// the mon evolves, eats, or enjoys a pet

// Petting, feeding, sleeping, attacking, releasing, and switching mons wait while it evolves
const WAITS_FOR_EVOLUTION = ['pet', 'feed', 'sleep', 'attack', 'release', 'catch', 'new']
// While it eats a berry or enjoys a pet, only the commands that just show something run,
// so nothing changes the record the berry or pet is about to fill
const SHOWS_ONLY = ['', 'list', 'help', 'stats', 'box', 'party', 'moves', 'dex']
export const waitsForCare = (asked) => (S.food !== null || isPetted()) && !SHOWS_ONLY.includes(asked.split(' ')[0]) && asked !== 'attack list'

export const evolvingReply = () => ({ text: nameOf(S.mon) + ' is evolving! /pokemon stop cancels it.' })
export const careReply = () => ({ text: nameOf(S.mon) + (S.food ? ' is busy eating.' : ' is enjoying the pets.') + ' Try again in a moment.' })

// What stops the mon fighting now, as the command's reply, or null when it's free
export function battleWait() {
  if (S.evolving !== null) return evolvingReply()
  if (S.food !== null || isPetted()) return careReply()
  if (isDown()) return downReply()
  return null
}

export const waitsForEvolution = (asked) => S.evolving !== null && (MONS.includes(asked) || WAITS_FOR_EVOLUTION.includes(asked.split(' ')[0]))

// Drop a mon's record from the box, so it starts over at its first level with fresh
// meters. The active mon stays on screen and starts over in place.
export function releaseCommand(wanted) {
  if (!wanted) return { text: 'Name the mon to release, like /pokemon release ' + S.mon + '. /pokemon box lists yours.' }
  if (!MONS.includes(wanted)) return { text: 'Unknown mon "' + wanted + '". /pokemon box lists yours.' }
  if (!S.stats[wanted] || isDead(wanted)) return { text: displayName(wanted) + ' isn\'t in your box.' }
  const name = nameOf(wanted)
  delete S.stats[wanted]
  if (wanted !== S.mon) return { text: 'You release ' + name + '. Bye-bye, ' + name + '!' }
  S.evolveDue = null
  return { text: 'You release ' + name + '. Bye-bye, ' + name + '! A fresh ' + displayName(S.mon) + ' takes its place.' }
}

const NICKNAME_MAX = 12

// Name the active mon. Its species name, as in the games, takes the nickname away.
export function nicknameCommand(wanted) {
  const species = displayName(S.mon)
  const nickname = wanted.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim()
  if (!nickname) {
    const now = S.stats[S.mon]?.nickname ? species + ' goes by ' + S.stats[S.mon].nickname + '. ' : ''
    return { text: now + 'Name it with /pokemon nickname <name>, up to ' + NICKNAME_MAX + ' characters.' }
  }
  if ([...nickname].length > NICKNAME_MAX) return { text: 'That\'s too long. A nickname fits ' + NICKNAME_MAX + ' characters.' }
  const old = S.stats[S.mon]?.nickname
  if (moveKey(nickname) === moveKey(species) || moveKey(nickname) === moveKey(S.mon)) {
    if (!old) return { text: species + ' has no nickname.' }
    const { nickname: _, ...rest } = S.stats[S.mon]
    if (Object.keys(rest).length > 0) S.stats[S.mon] = rest
    else delete S.stats[S.mon]
    return { text: old + ' is just ' + species + ' again.' }
  }
  S.stats[S.mon] = { ...S.stats[S.mon], nickname }
  return { text: (old ?? species) + ' is now ' + nickname + '!' }
}

export const FALLBACK_MOVES = [{ name: 'Tackle', effect: 'tackle' }]
export const moveKey = (name) => name.toLowerCase().replace(/[\s\-_'.]/g, '')

// A mon's moves, like "Pikachu knows Thunderbolt, Quick Attack, Thunder, Agility."
export function movesText(name) {
  const known = movesOf(name)
  const moves = known.length > 0 ? known : FALLBACK_MOVES
  return { text: nameOf(name) + ' knows ' + moves.map((m) => m.name).join(', ') + '.' }
}

// Play a random move, or the one named, and announce it. "list" lists the moves instead.
export function attackCommand(wanted) {
  const name = nameOf(S.mon)
  if (wanted === 'list') return movesText(S.mon)
  if (S.attack) return { text: name + ' is still attacking.' }
  if (S.food) return { text: name + ' is busy eating.' }
  const known = movesOf(S.mon)
  const moves = known.length > 0 ? known : FALLBACK_MOVES
  // Facing a foe, a random move is one that reaches it, and any such move is aimed at it
  const battle = S.wild?.phase === 'battle'
  const pool = battle && !wanted ? foeMoves() : moves
  const move = wanted ? moves.find((m) => moveKey(m.name) === moveKey(wanted)) : pool[Math.floor(Math.random() * pool.length)]
  if (!move) return { text: name + ' doesn\'t know "' + wanted + '". Its moves: ' + moves.map((m) => m.name).join(', ') + '.' }
  startAttack(move, { foe: battle && aimsAhead(move) })
  return { text: name + ' used ' + move.name + '!' + (move.text ? '\n' + move.text : '') }
}
