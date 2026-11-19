import { ITEM_ART, stamp } from './art.js'
import { rnd } from './effects/draw.js'
import { evolutionsOf } from './evolutions.js'

// The item bag, kept as plain data: { [item key]: count }. Knocked out wild mons drop
// items, item and trade evolutions use them up, and Rare Candy raises a level. Every
// function returns a new bag and leaves its input alone.

export const ITEMS = [
  { key: 'firestone', name: 'Fire Stone' },
  { key: 'waterstone', name: 'Water Stone' },
  { key: 'thunderstone', name: 'Thunder Stone' },
  { key: 'leafstone', name: 'Leaf Stone' },
  { key: 'moonstone', name: 'Moon Stone' },
  { key: 'sunstone', name: 'Sun Stone' },
  { key: 'shinystone', name: 'Shiny Stone' },
  { key: 'duskstone', name: 'Dusk Stone' },
  { key: 'dawnstone', name: 'Dawn Stone' },
  { key: 'icestone', name: 'Ice Stone' },
  { key: 'ovalstone', name: 'Oval Stone' },
  { key: 'kingsrock', name: "King's Rock" },
  { key: 'metalcoat', name: 'Metal Coat' },
  { key: 'dragonscale', name: 'Dragon Scale' },
  { key: 'upgrade', name: 'Up-Grade' },
  { key: 'dubiousdisc', name: 'Dubious Disc' },
  { key: 'protector', name: 'Protector' },
  { key: 'electirizer', name: 'Electirizer' },
  { key: 'magmarizer', name: 'Magmarizer' },
  { key: 'reapercloth', name: 'Reaper Cloth' },
  { key: 'razorclaw', name: 'Razor Claw' },
  { key: 'razorfang', name: 'Razor Fang' },
  { key: 'deepseatooth', name: 'Deep Sea Tooth' },
  { key: 'deepseascale', name: 'Deep Sea Scale' },
  { key: 'prismscale', name: 'Prism Scale' },
  { key: 'linkcable', name: 'Link Cable' },
  { key: 'rarecandy', name: 'Rare Candy' },
]
export const STONES = ['firestone', 'waterstone', 'thunderstone', 'leafstone', 'moonstone', 'sunstone', 'shinystone', 'duskstone', 'dawnstone', 'icestone']
export const RARE_CANDY = 'rarecandy'
export const LINK_CABLE = 'linkcable'

// A knockout drops an item one time in 5. A drop is Rare Candy one time in 15, a Link
// Cable one in 12 of the rest, and otherwise one of the foe's own items: the stone for its
// type, or an item its family evolves with or that fits it. A foe with none drops nothing
// in its place.
const DROP_ODDS = 1 / 5
const CANDY_ODDS = 1 / 15
const CABLE_ODDS = 1 / 12
// A main turn of two minutes or more turns up Rare Candy one time in 10
export const LONG_TURN_CANDY_ODDS = 1 / 10
const DROP_SALT = 0x17e5

// The wild mons, by Pokédex key, whose type favors each stone. Moon Stone stands in for
// the fairy-like mons that use it. From gen 2 on, a family that evolves with one of the
// stones beyond the first four favors that one, and every other mon its type's stone.
const STONE_FAMILIES = {
  firestone: [
    'charmander', 'charmeleon', 'charizard', 'vulpix', 'ninetales', 'growlithe', 'arcanine', 'ponyta', 'rapidash', 'magmar', 'flareon', 'moltres',
    'cyndaquil', 'quilava', 'typhlosion', 'slugma', 'magcargo', 'houndour', 'houndoom', 'magby', 'entei', 'hooh', 'torchic', 'combusken', 'blaziken',
    'numel', 'camerupt', 'torkoal', 'chimchar', 'monferno', 'infernape', 'magmortar', 'heatran', 'victini', 'pansear', 'heatmor',
  ],
  waterstone: [
    'squirtle', 'wartortle', 'blastoise', 'psyduck', 'golduck', 'poliwag', 'poliwhirl', 'poliwrath', 'tentacool', 'tentacruel', 'slowpoke', 'slowbro',
    'seel', 'dewgong', 'shellder', 'cloyster', 'krabby', 'kingler', 'horsea', 'seadra', 'goldeen', 'seaking', 'staryu', 'starmie', 'magikarp',
    'gyarados', 'lapras', 'vaporeon', 'omanyte', 'omastar', 'kabuto', 'kabutops', 'totodile', 'croconaw', 'feraligatr', 'chinchou', 'lanturn',
    'marill', 'azumarill', 'politoed', 'wooper', 'quagsire', 'slowking', 'qwilfish', 'corsola', 'remoraid', 'octillery', 'mantine', 'kingdra',
    'suicune', 'mudkip', 'marshtomp', 'swampert', 'lotad', 'lombre', 'ludicolo', 'wingull', 'pelipper', 'surskit', 'carvanha', 'sharpedo', 'wailmer',
    'wailord', 'barboach', 'whiscash', 'corphish', 'crawdaunt', 'feebas', 'milotic', 'clamperl', 'huntail', 'gorebyss', 'relicanth', 'luvdisc',
    'kyogre', 'piplup', 'prinplup', 'empoleon', 'bibarel', 'buizel', 'floatzel', 'shellos_east', 'gastrodon_east', 'finneon', 'lumineon', 'mantyke',
    'palkia', 'phione', 'manaphy', 'panpour', 'tympole', 'basculin_blue_striped', 'tirtouga', 'ducklett', 'alomomola', 'keldeo',
  ],
  thunderstone: [
    'pikachu', 'raichu', 'magnemite', 'magneton', 'voltorb', 'electrode', 'electabuzz', 'jolteon', 'zapdos', 'pichu', 'mareep', 'flaaffy', 'ampharos',
    'elekid', 'raikou', 'electrike', 'manectric', 'plusle', 'minun', 'shinx', 'luxio', 'luxray', 'pachirisu', 'magnezone', 'electivire', 'rotom',
    'zebstrika', 'emolga', 'galvantula', 'stunfisk',
  ],
  leafstone: [
    'bulbasaur', 'ivysaur', 'venusaur', 'oddish', 'gloom', 'vileplume', 'paras', 'parasect', 'bellsprout', 'weepinbell', 'victreebel', 'exeggcute',
    'exeggutor', 'tangela', 'chikorita', 'bayleef', 'meganium', 'hoppip', 'skiploom', 'jumpluff', 'celebi', 'treecko', 'grovyle', 'sceptile',
    'seedot', 'nuzleaf', 'shiftry', 'shroomish', 'breloom', 'cacnea', 'cacturne', 'lileep', 'cradily', 'tropius', 'turtwig', 'grotle', 'torterra',
    'wormadam_plant', 'cherubi', 'cherrim', 'carnivine', 'snover', 'abomasnow', 'tangrowth', 'leafeon', 'shaymin', 'pansage', 'leavanny', 'maractus',
    'deerling_autumn', 'virizion',
  ],
  moonstone: [
    'clefairy', 'clefable', 'jigglypuff', 'wigglytuff', 'nidoran_female', 'nidorina', 'nidoqueen', 'nidoran_male', 'nidorino', 'nidoking', 'cleffa',
    'igglybuff', 'skitty', 'delcatty', 'munna', 'musharna',
  ],
  sunstone: [
    'bellossom', 'sunkern', 'sunflora', 'cottonee', 'petilil',
  ],
  shinystone: [
    'togepi', 'togetic', 'roselia', 'budew', 'roserade', 'togekiss', 'minccino',
  ],
  duskstone: [
    'murkrow', 'misdreavus', 'mismagius', 'honchkrow', 'litwick',
  ],
  dawnstone: [
    'ralts', 'kirlia', 'gardevoir', 'snorunt', 'glalie', 'gallade', 'froslass',
  ],
  icestone: [
    'sneasel', 'swinub', 'piloswine', 'delibird', 'smoochum', 'spheal', 'sealeo', 'walrein', 'regice', 'weavile', 'glaceon', 'mamoswine', 'vanillish',
    'cubchoo',
  ],
}

export const stoneOfType = (key) => STONES.find((stone) => STONE_FAMILIES[stone].includes(key)) ?? null

// The wild mons that drop each held evolution item: the family that evolves with it, and
// a few more of the kind it fits, like Steel types for the Metal Coat
const HELD_FAMILIES = {
  ovalstone: ['happiny', 'chansey', 'blissey', 'exeggcute', 'audino'],
  kingsrock: ['poliwag', 'poliwhirl', 'poliwrath', 'politoed', 'slowpoke', 'slowbro', 'slowking'],
  metalcoat: [
    'magnemite', 'magneton', 'magnezone', 'onix', 'steelix', 'scyther', 'scizor', 'forretress', 'skarmory', 'mawile', 'aron', 'lairon', 'aggron',
    'beldum', 'metang', 'metagross', 'registeel', 'bronzor', 'bronzong', 'shieldon', 'bastiodon', 'probopass', 'durant', 'pawniard', 'klang',
  ],
  dragonscale: [
    'horsea', 'seadra', 'kingdra', 'dratini', 'dragonair', 'dragonite', 'swablu', 'altaria', 'bagon', 'shelgon', 'salamence', 'gible', 'gabite',
    'garchomp', 'axew', 'druddigon',
  ],
  upgrade: ['porygon', 'porygon2', 'porygonz'],
  dubiousdisc: ['porygon', 'porygon2', 'porygonz'],
  protector: ['rhyhorn', 'rhydon', 'rhyperior'],
  electirizer: ['elekid', 'electabuzz', 'electivire'],
  magmarizer: ['magby', 'magmar', 'magmortar'],
  reapercloth: ['duskull', 'dusclops', 'dusknoir', 'shuppet', 'banette', 'drifloon', 'drifblim'],
  razorclaw: ['sneasel', 'weavile', 'absol', 'zangoose'],
  razorfang: ['gligar', 'gliscor', 'houndour', 'houndoom'],
  deepseatooth: ['clamperl', 'huntail', 'carvanha', 'sharpedo'],
  deepseascale: ['clamperl', 'gorebyss', 'relicanth', 'luvdisc'],
  prismscale: ['feebas', 'milotic'],
}

// Every item a foe may drop besides Rare Candy and a Link Cable
export const dropsOf = (key) => [stoneOfType(key), ...Object.keys(HELD_FAMILIES).filter((item) => HELD_FAMILIES[item].includes(key))].filter(Boolean)

// What a knocked out foe drops, or null for nothing, rolled from its seed so the same foe
// always drops the same
export function dropOf(key, seed) {
  if (rnd(seed, 4, DROP_SALT) >= DROP_ODDS) return null
  if (rnd(seed, 0, DROP_SALT) < CANDY_ODDS) return RARE_CANDY
  if (rnd(seed, 1, DROP_SALT) < CABLE_ODDS) return LINK_CABLE
  const pool = dropsOf(key)
  return pool.length > 0 ? pool[Math.floor(rnd(seed, 2, DROP_SALT) * pool.length)] : null
}

const keyOf = (text) => String(text).toLowerCase().replace(/[\s\-_'.]/g, '')

export const itemName = (key) => ITEMS.find((item) => item.key === key)?.name ?? key

// The item a name means, matched loosely: "Thunder Stone", "thunderstone", "thunder",
// "kings rock", or "candy". Null when it means none, or more than one.
export function findItem(text) {
  const k = keyOf(text)
  if (!k) return null
  const exact = ITEMS.find((item) => item.key === k || item.key === k + 'stone')
  if (exact) return exact.key
  const partial = ITEMS.filter((item) => k.length >= 3 && item.key.includes(k))
  return partial.length === 1 ? partial[0].key : null
}

// The items an evolution entry spends: its item, or a Link Cable for a trade along with
// any item the mon trades holding, or none for a level-up
export function itemsFor(entry) {
  if (entry.item) return [keyOf(entry.item)]
  if (entry.trade) return entry.holds ? [LINK_CABLE, keyOf(entry.holds)] : [LINK_CABLE]
  return []
}

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

// The bag made the first time for a box that had none: one of each item every item or
// trade mon in it needs to evolve, so no mon raised before the bag is left stranded
export function migratedBag(names) {
  let bag = {}
  for (const name of names) {
    const needs = new Set(evolutionsOf(name).flatMap(itemsFor))
    for (const key of needs) bag = addedTo(bag, key)
  }
  return bag
}

// Like "Your bag:\nThunder Stone, 2\nRare Candy, 1", in the items' order
export function bagText(bag) {
  const held = ITEMS.filter((item) => bag[item.key] > 0)
  if (held.length === 0) return 'Your bag is empty. Knock out a wild mon with /pokemon attack, and it may drop an item.'
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
