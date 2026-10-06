import { BASE_FORM, evolutionsOf, preEvolutionOf, startLevel } from './evolutions.js'

// The gen 1 Pokédex and how often each mon turns up in the wild. DEX lists the 151
// sprite keys in national dex order. A female sprite counts as its base form's entry.

export const DEX = [
  'bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard', 'squirtle', 'wartortle', 'blastoise', 'caterpie',
  'metapod', 'butterfree', 'weedle', 'kakuna', 'beedrill', 'pidgey', 'pidgeotto', 'pidgeot', 'rattata', 'raticate',
  'spearow', 'fearow', 'ekans', 'arbok', 'pikachu', 'raichu', 'sandshrew', 'sandslash', 'nidoran_female', 'nidorina',
  'nidoqueen', 'nidoran_male', 'nidorino', 'nidoking', 'clefairy', 'clefable', 'vulpix', 'ninetales', 'jigglypuff', 'wigglytuff',
  'zubat', 'golbat', 'oddish', 'gloom', 'vileplume', 'paras', 'parasect', 'venonat', 'venomoth', 'diglett',
  'dugtrio', 'meowth', 'persian', 'psyduck', 'golduck', 'mankey', 'primeape', 'growlithe', 'arcanine', 'poliwag',
  'poliwhirl', 'poliwrath', 'abra', 'kadabra', 'alakazam', 'machop', 'machoke', 'machamp', 'bellsprout', 'weepinbell',
  'victreebel', 'tentacool', 'tentacruel', 'geodude', 'graveler', 'golem', 'ponyta', 'rapidash', 'slowpoke', 'slowbro',
  'magnemite', 'magneton', 'farfetchd', 'doduo', 'dodrio', 'seel', 'dewgong', 'grimer', 'muk', 'shellder',
  'cloyster', 'gastly', 'haunter', 'gengar', 'onix', 'drowzee', 'hypno', 'krabby', 'kingler', 'voltorb',
  'electrode', 'exeggcute', 'exeggutor', 'cubone', 'marowak', 'hitmonlee', 'hitmonchan', 'lickitung', 'koffing', 'weezing',
  'rhyhorn', 'rhydon', 'chansey', 'tangela', 'kangaskhan', 'horsea', 'seadra', 'goldeen', 'seaking', 'staryu',
  'starmie', 'mrmime', 'scyther', 'jynx', 'electabuzz', 'magmar', 'pinsir', 'tauros', 'magikarp', 'gyarados',
  'lapras', 'ditto', 'eevee', 'vaporeon', 'jolteon', 'flareon', 'porygon', 'omanyte', 'omastar', 'kabuto',
  'kabutops', 'aerodactyl', 'snorlax', 'articuno', 'zapdos', 'moltres', 'dratini', 'dragonair', 'dragonite', 'mewtwo',
  'mew',
]

export const dexKey = (mon) => BASE_FORM[mon] ?? mon

export const dexNumber = (mon) => DEX.indexOf(dexKey(mon)) + 1

export const LEGENDARY = ['articuno', 'zapdos', 'moltres', 'mewtwo', 'mew']

// Rare mons and everything they evolve into
export const RARE = [
  'lapras', 'snorlax', 'eevee', 'dratini', 'omanyte', 'kabuto', 'aerodactyl', 'chansey', 'tauros', 'kangaskhan',
  'scyther', 'pinsir', 'porygon', 'ditto', 'hitmonlee', 'hitmonchan',
]

// weight is how often a tier turns up, hits how many attacks wear one out, and catch
// the best odds of a ball holding it
export const TIERS = {
  common: { weight: 60, hits: 3, catch: 0.9 },
  uncommon: { weight: 25, hits: 5, catch: 0.75 },
  rare: { weight: 6, hits: 7, catch: 0.55 },
  legendary: { weight: 1, hits: 10, catch: 0.35 },
}

const STAGE_TIERS = ['common', 'uncommon', 'rare']
const SHINY_ODDS = 1 / 128
const FEMALE_FORM = Object.fromEntries(Object.entries(BASE_FORM).map(([female, base]) => [base, female]))

// Outside the short lists, a family's base form is common and each evolution a tier
// rarer. A mon with no family is uncommon.
export function tierOf(mon) {
  const key = dexKey(mon)
  if (LEGENDARY.includes(key)) return 'legendary'
  let base = key
  let stage = 0
  for (let parent = preEvolutionOf(base); parent; parent = preEvolutionOf(base)) {
    base = parent
    stage++
  }
  if (RARE.includes(base)) return 'rare'
  if (stage === 0 && evolutionsOf(base).length === 0) return 'uncommon'
  return STAGE_TIERS[stage]
}

const BY_TIER = Object.fromEntries(Object.keys(TIERS).map((tier) => [tier, DEX.filter((mon) => tierOf(mon) === tier)]))

// A tier by weight, then a mon from it. random() returns a number in [0, 1).
export function pickWild(random) {
  const total = Object.values(TIERS).reduce((sum, { weight }) => sum + weight, 0)
  let roll = random() * total
  const tier = Object.keys(TIERS).find((name) => (roll -= TIERS[name].weight) < 0) ?? 'common'
  const pool = BY_TIER[tier]
  const key = pool[Math.floor(random() * pool.length)]
  const mon = FEMALE_FORM[key] && random() < 0.5 ? FEMALE_FORM[key] : key
  const variant = random() < SHINY_ODDS ? 'shiny' : 'default'
  return { mon, variant, key, tier, level: startLevel(mon) }
}

// Two marks of one mon as one: the earliest time for each of seen and caught, and shiny
// if either has it
export function mergedDexEntry(old, patch) {
  const entry = old && typeof old === 'object' ? { ...old } : {}
  for (const key of ['seen', 'caught']) {
    const times = [entry[key], patch[key]].filter((t) => typeof t === 'number')
    if (times.length > 0) entry[key] = Math.min(...times)
  }
  if (entry.shiny || patch.shiny) entry.shiny = true
  return entry
}

export const isCaught = (entry) => typeof entry?.caught === 'number'
