#!/usr/bin/env node

// Checks that the mod's tables agree with each other: every move has an effect, every
// mon has sprites and moves, evolutions name real mons without loops, levels round-trip,
// the generated frames match their mon's size and palette, every frame's eyes are
// marked inside it, and the Pokédex holds every mon once with a known tier.
//
// node scripts/check-data.mjs

import { effectOf } from '../hooks/attacks.js'
import { DEX, LEGENDARY, RARE, TIERS, dexKey, tierOf } from '../hooks/dex.js'
import { EVOLUTIONS } from '../hooks/evolutions.js'
import { EYES, eyesOf } from '../hooks/eyes.js'
import { SPRITES } from '../hooks/frames.js'
import { MAX_LEVEL, levelAt, xpAt } from '../hooks/levels.js'
import { MOVE_FX, MOVES } from '../hooks/moves.js'
import { displayName } from '../hooks/names.js'

const problems = []
const fail = (text) => problems.push(text)
const mons = Object.keys(SPRITES)

for (const [name, fx] of Object.entries(MOVE_FX)) {
  if (effectOf(fx.effect) !== fx.effect) fail(`move ${name} plays unknown effect ${fx.effect}`)
}

for (const [mon, moves] of Object.entries(MOVES)) {
  if (!SPRITES[mon]) fail(`moveset for ${mon}, which has no sprites`)
  for (const entry of moves) {
    const name = typeof entry === 'string' ? entry : entry.name
    if (!MOVE_FX[name]) fail(`${mon} knows ${name}, which has no entry in MOVE_FX`)
  }
}

for (const mon of mons) {
  if (!MOVES[mon]?.length) fail(`${mon} has no moves`)
  if (!displayName(mon)) fail(`${mon} has no display name`)
}

for (const [mon, entries] of Object.entries(EVOLUTIONS)) {
  if (!SPRITES[mon]) fail(`evolutions for ${mon}, which has no sprites`)
  for (const entry of entries) {
    if (!SPRITES[entry.into]) fail(`${mon} evolves into ${entry.into}, which has no sprites`)
    const ways = ['level', 'item', 'trade'].filter((key) => entry[key] !== undefined)
    if (ways.length !== 1) fail(`${mon} into ${entry.into} needs exactly one of level, item, or trade`)
    if (entry.level !== undefined && !(entry.level > 1 && entry.level <= MAX_LEVEL)) fail(`${mon} evolves at level ${entry.level}`)
  }
}

// Following evolutions from any mon must end, or a chain loops back on itself
for (const start of Object.keys(EVOLUTIONS)) {
  const seen = new Set()
  const walk = (mon) => {
    if (seen.has(mon)) return fail(`evolution loop through ${mon}`)
    seen.add(mon)
    for (const entry of EVOLUTIONS[mon] ?? []) walk(entry.into)
    seen.delete(mon)
  }
  walk(start)
}

for (let level = 2; level <= MAX_LEVEL; level++) {
  if (levelAt(xpAt(level)) !== level || levelAt(xpAt(level) - 1) !== level - 1) fail(`levelAt is off at level ${level}`)
}

for (const mon of mons) {
  const { width, height, variants } = SPRITES[mon]
  for (const [variant, sheet] of Object.entries(variants)) {
    const letters = new Set(sheet.palette.map((_, i) => String.fromCharCode(97 + i)))
    for (const anim of ['idle', 'walk']) {
      sheet[anim].forEach((frame, k) => {
        const where = `${mon} ${variant} ${anim} frame ${k}`
        if (frame.rows.length !== height) fail(`${where} has ${frame.rows.length} rows, not ${height}`)
        if (frame.rows.some((row) => row.length !== width)) fail(`${where} has a row that isn't ${width} wide`)
        if (frame.rows.some((row) => [...row].some((ch) => ch !== '.' && !letters.has(ch)))) fail(`${where} uses a color outside its palette`)
        if (!(frame.ms > 0)) fail(`${where} has no duration`)
      })
    }
  }
}

for (const mon of Object.keys(EYES)) if (!SPRITES[mon]) fail(`eyes for ${mon}, which has no sprites`)

for (const mon of mons) {
  if (!EYES[mon]) fail(`${mon} has no eyes marked`)
  const { width, height, variants } = SPRITES[mon]
  for (const [variant, sheet] of Object.entries(variants)) {
    for (const anim of ['idle', 'walk']) {
      const marked = (EYES[mon]?.[variant] ?? EYES[mon])?.[anim]
      if (marked && marked.length !== sheet[anim].length) fail(`${mon} ${variant} ${anim} has eyes for ${marked.length} frames, not ${sheet[anim].length}`)
      sheet[anim].forEach((frame, k) => {
        for (const box of eyesOf(mon, variant, anim, k) ?? []) {
          const [x, y, w, h] = box
          const where = `${mon} ${variant} ${anim} frame ${k} eye ${JSON.stringify(box)}`
          if (box.length !== 4 || !box.every(Number.isInteger)) fail(`${where} isn't [x, y, width, height]`)
          else if (x < 0 || y < 0 || x + w > width || y + h > height) fail(`${where} is outside the ${width}x${height} frame`)
          else if (w < 1 || h < 1) fail(`${where} is empty`)
          else if (![...frame.rows[y + h - 1].slice(x, x + w)].some((ch) => ch !== '.')) fail(`${where} has no lid row on the sprite`)
        }
      })
    }
  }
}

if (DEX.length !== 151) fail(`the Pokédex has ${DEX.length} entries, not 151`)
if (new Set(DEX).size !== DEX.length) fail('the Pokédex lists a mon twice')
for (const mon of DEX) if (!SPRITES[mon]) fail(`Pokédex entry ${mon} has no sprites`)
for (const mon of mons) if (!DEX.includes(dexKey(mon))) fail(`${mon} has no Pokédex entry`)
for (const mon of [...LEGENDARY, ...RARE]) if (!DEX.includes(mon)) fail(`tier list names ${mon}, which isn't in the Pokédex`)
for (const mon of DEX) if (!TIERS[tierOf(mon)]) fail(`${mon} has unknown tier ${tierOf(mon)}`)

if (problems.length > 0) {
  for (const problem of problems) console.error(problem)
  console.error(`${problems.length} problems`)
  process.exit(1)
}
const moves = Object.values(MOVES).flat().length
const tiers = Object.keys(TIERS).map((tier) => `${DEX.filter((mon) => tierOf(mon) === tier).length} ${tier}`).join(', ')
console.log(`${mons.length} mons, ${Object.keys(MOVE_FX).length} moves (${moves} in movesets), ${Object.keys(EVOLUTIONS).length} evolving mons, ${DEX.length} in the Pokédex (${tiers}): all consistent`)
