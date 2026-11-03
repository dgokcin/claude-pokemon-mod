import { ITEM_ART, stamp } from './art.js'
import { rnd } from './effects/draw.js'
import { evolutionsOf } from './evolutions.js'

// The item bag, kept as plain data: { [item key]: count }. Knocked out wild mons drop
// items, stone and trade evolutions use them up, and Rare Candy raises a level. Every
// function returns a new bag and leaves its input alone.

export const ITEMS = [
  { key: 'firestone', name: 'Fire Stone' },
  { key: 'waterstone', name: 'Water Stone' },
  { key: 'thunderstone', name: 'Thunder Stone' },
  { key: 'leafstone', name: 'Leaf Stone' },
  { key: 'moonstone', name: 'Moon Stone' },
  { key: 'linkcable', name: 'Link Cable' },
  { key: 'rarecandy', name: 'Rare Candy' },
]
export const STONES = ['firestone', 'waterstone', 'thunderstone', 'leafstone', 'moonstone']
export const RARE_CANDY = 'rarecandy'
export const LINK_CABLE = 'linkcable'

// A knockout drops Rare Candy one time in 15, a Link Cable one in 12 of the rest, and
// otherwise a stone. A foe with a stone type drops only its own stone, and any other foe
// drops any stone.
const CANDY_ODDS = 1 / 15
const CABLE_ODDS = 1 / 12
// A main turn of two minutes or more turns up Rare Candy one time in 10
export const LONG_TURN_CANDY_ODDS = 1 / 10
const DROP_SALT = 0x17e5

// The wild mons, by Pokédex key, whose type favors each stone. Moon Stone stands in for
// the fairy-like mons that use it.
const STONE_FAMILIES = {
  firestone: ['charmander', 'charmeleon', 'charizard', 'vulpix', 'ninetales', 'growlithe', 'arcanine', 'ponyta', 'rapidash', 'magmar', 'flareon', 'moltres'],
  waterstone: [
    'squirtle', 'wartortle', 'blastoise', 'psyduck', 'golduck', 'poliwag', 'poliwhirl', 'poliwrath', 'tentacool', 'tentacruel', 'slowpoke', 'slowbro',
    'seel', 'dewgong', 'shellder', 'cloyster', 'krabby', 'kingler', 'horsea', 'seadra', 'goldeen', 'seaking', 'staryu', 'starmie', 'magikarp',
    'gyarados', 'lapras', 'vaporeon', 'omanyte', 'omastar', 'kabuto', 'kabutops',
  ],
  thunderstone: ['pikachu', 'raichu', 'magnemite', 'magneton', 'voltorb', 'electrode', 'electabuzz', 'jolteon', 'zapdos'],
  leafstone: ['bulbasaur', 'ivysaur', 'venusaur', 'oddish', 'gloom', 'vileplume', 'paras', 'parasect', 'bellsprout', 'weepinbell', 'victreebel', 'exeggcute', 'exeggutor', 'tangela'],
  moonstone: ['clefairy', 'clefable', 'jigglypuff', 'wigglytuff', 'nidoran_female', 'nidorina', 'nidoqueen', 'nidoran_male', 'nidorino', 'nidoking'],
}

export const stoneOfType = (key) => STONES.find((stone) => STONE_FAMILIES[stone].includes(key)) ?? null

// What a knocked out foe drops, rolled from its seed so the same foe always drops the same
export function dropOf(key, seed) {
  if (rnd(seed, 0, DROP_SALT) < CANDY_ODDS) return RARE_CANDY
  if (rnd(seed, 1, DROP_SALT) < CABLE_ODDS) return LINK_CABLE
  const typed = stoneOfType(key)
  if (typed) return typed
  return STONES[Math.floor(rnd(seed, 3, DROP_SALT) * STONES.length)]
}

const keyOf = (text) => String(text).toLowerCase().replace(/[\s\-_'.]/g, '')

export const itemName = (key) => ITEMS.find((item) => item.key === key)?.name ?? key

// The item a name means, matched loosely: "Thunder Stone", "thunderstone", "thunder", or
// "candy". Null when it means none, or more than one.
export function findItem(text) {
  const k = keyOf(text)
  if (!k) return null
  const exact = ITEMS.find((item) => item.key === k || item.key === k + 'stone')
  if (exact) return exact.key
  const partial = ITEMS.filter((item) => k.length >= 3 && item.key.includes(k))
  return partial.length === 1 ? partial[0].key : null
}

// The item an evolution entry needs: its stone, a Link Cable for a trade, or null for a level
export const itemFor = (entry) => (entry.item ? keyOf(entry.item) : entry.trade ? LINK_CABLE : null)

// A bag as saved, keeping only known items with whole counts above zero
export function bagOf(saved) {
  const bag = {}
  if (!saved || typeof saved !== 'object') return bag
  for (const { key } of ITEMS) {
    const count = Math.floor(Number(saved[key]))
    if (count > 0) bag[key] = count
  }
  return bag
}

export const addedTo = (bag, key, count = 1) => ({ ...bag, [key]: (bag[key] ?? 0) + count })

// One of an item taken out, its key gone once none is left
export function takenFrom(bag, key) {
  const { [key]: count = 0, ...rest } = bag
  return count > 1 ? { ...rest, [key]: count - 1 } : rest
}

// The bag made the first time for a box that had none: one of each item every stone or
// trade mon in it needs to evolve, so no mon raised before the bag is left stranded
export function migratedBag(names) {
  let bag = {}
  for (const name of names) {
    const needs = new Set(evolutionsOf(name).map(itemFor).filter(Boolean))
    for (const key of needs) bag = addedTo(bag, key)
  }
  return bag
}

// Like "Your bag:\nThunder Stone, 2\nRare Candy, 1", in the items' order
export function bagText(bag) {
  const held = ITEMS.filter((item) => bag[item.key] > 0)
  if (held.length === 0) return 'Your bag is empty. Knock out a wild mon with /pokemon attack, and it drops an item.'
  return 'Your bag:\n' + held.map((item) => item.name + ', ' + bag[item.key]).join('\n')
}

// A drop pops up out of the foe in an arc over POP_TICKS, from its middle, from, to the
// ground at to, and lies there until the foe blinks away
const POP_TICKS = 10
const POP_HEIGHT = 8

export function dropStamps(drop, tick, from, to) {
  const art = ITEM_ART[drop.item]
  const half = Math.floor(art.rows[0].length / 2)
  const land = to.y - art.rows.length + 1
  const u = Math.min(1, (tick - drop.at + 1) / POP_TICKS)
  const x = Math.round(from.x + (to.x - from.x) * u) - half
  const y = Math.round(from.y + (land - from.y) * u - POP_HEIGHT * 4 * u * (1 - u))
  return [stamp(x, Math.max(0, Math.min(land, y)), art.rows, art.colors)]
}
