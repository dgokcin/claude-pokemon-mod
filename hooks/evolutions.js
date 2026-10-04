// The gen 1 evolutions follow the Red and Blue rules and are keyed by sprite key, in
// Pokédex order. Each entry is one thing the mon can become: { into, level } on level-up,
// { into, item } with an evolution stone, or { into, trade: true }. A mon that doesn't
// evolve has no entry.

const FIRST_LEVEL = 5

// Female sprites take their base form's place in the family, so raichu comes from
// pikachu and venusaur_female from ivysaur
const BASE_FORM = { pikachu_female: 'pikachu', venusaur_female: 'venusaur' }

export const EVOLUTIONS = {
  bulbasaur: [{ into: 'ivysaur', level: 16 }],
  ivysaur: [{ into: 'venusaur', level: 32 }],
  charmander: [{ into: 'charmeleon', level: 16 }],
  charmeleon: [{ into: 'charizard', level: 36 }],
  squirtle: [{ into: 'wartortle', level: 16 }],
  wartortle: [{ into: 'blastoise', level: 36 }],
  caterpie: [{ into: 'metapod', level: 7 }],
  metapod: [{ into: 'butterfree', level: 10 }],
  weedle: [{ into: 'kakuna', level: 7 }],
  kakuna: [{ into: 'beedrill', level: 10 }],
  pidgey: [{ into: 'pidgeotto', level: 18 }],
  pidgeotto: [{ into: 'pidgeot', level: 36 }],
  rattata: [{ into: 'raticate', level: 20 }],
  spearow: [{ into: 'fearow', level: 20 }],
  ekans: [{ into: 'arbok', level: 22 }],
  pikachu: [{ into: 'raichu', item: 'Thunder Stone' }],
  pikachu_female: [{ into: 'raichu', item: 'Thunder Stone' }],
  sandshrew: [{ into: 'sandslash', level: 22 }],
  nidoran_female: [{ into: 'nidorina', level: 16 }],
  nidorina: [{ into: 'nidoqueen', item: 'Moon Stone' }],
  nidoran_male: [{ into: 'nidorino', level: 16 }],
  nidorino: [{ into: 'nidoking', item: 'Moon Stone' }],
  clefairy: [{ into: 'clefable', item: 'Moon Stone' }],
  vulpix: [{ into: 'ninetales', item: 'Fire Stone' }],
  jigglypuff: [{ into: 'wigglytuff', item: 'Moon Stone' }],
  zubat: [{ into: 'golbat', level: 22 }],
  oddish: [{ into: 'gloom', level: 21 }],
  gloom: [{ into: 'vileplume', item: 'Leaf Stone' }],
  paras: [{ into: 'parasect', level: 24 }],
  venonat: [{ into: 'venomoth', level: 31 }],
  diglett: [{ into: 'dugtrio', level: 26 }],
  meowth: [{ into: 'persian', level: 28 }],
  psyduck: [{ into: 'golduck', level: 33 }],
  mankey: [{ into: 'primeape', level: 28 }],
  growlithe: [{ into: 'arcanine', item: 'Fire Stone' }],
  poliwag: [{ into: 'poliwhirl', level: 25 }],
  poliwhirl: [{ into: 'poliwrath', item: 'Water Stone' }],
  abra: [{ into: 'kadabra', level: 16 }],
  kadabra: [{ into: 'alakazam', trade: true }],
  machop: [{ into: 'machoke', level: 28 }],
  machoke: [{ into: 'machamp', trade: true }],
  bellsprout: [{ into: 'weepinbell', level: 21 }],
  weepinbell: [{ into: 'victreebel', item: 'Leaf Stone' }],
  tentacool: [{ into: 'tentacruel', level: 30 }],
  geodude: [{ into: 'graveler', level: 25 }],
  graveler: [{ into: 'golem', trade: true }],
  ponyta: [{ into: 'rapidash', level: 40 }],
  slowpoke: [{ into: 'slowbro', level: 37 }],
  magnemite: [{ into: 'magneton', level: 30 }],
  doduo: [{ into: 'dodrio', level: 31 }],
  seel: [{ into: 'dewgong', level: 34 }],
  grimer: [{ into: 'muk', level: 38 }],
  shellder: [{ into: 'cloyster', item: 'Water Stone' }],
  gastly: [{ into: 'haunter', level: 25 }],
  haunter: [{ into: 'gengar', trade: true }],
  drowzee: [{ into: 'hypno', level: 26 }],
  krabby: [{ into: 'kingler', level: 28 }],
  voltorb: [{ into: 'electrode', level: 30 }],
  exeggcute: [{ into: 'exeggutor', item: 'Leaf Stone' }],
  cubone: [{ into: 'marowak', level: 28 }],
  koffing: [{ into: 'weezing', level: 35 }],
  rhyhorn: [{ into: 'rhydon', level: 42 }],
  horsea: [{ into: 'seadra', level: 32 }],
  goldeen: [{ into: 'seaking', level: 33 }],
  staryu: [{ into: 'starmie', item: 'Water Stone' }],
  magikarp: [{ into: 'gyarados', level: 20 }],
  eevee: [
    { into: 'vaporeon', item: 'Water Stone' },
    { into: 'jolteon', item: 'Thunder Stone' },
    { into: 'flareon', item: 'Fire Stone' },
  ],
  omanyte: [{ into: 'omastar', level: 40 }],
  kabuto: [{ into: 'kabutops', level: 40 }],
  dratini: [{ into: 'dragonair', level: 30 }],
  dragonair: [{ into: 'dragonite', level: 55 }],
}

// PARENTS maps each evolved mon to the mon it comes from and the entry that takes it there
const PARENTS = new Map()
for (const [from, entries] of Object.entries(EVOLUTIONS)) {
  if (BASE_FORM[from]) continue
  for (const entry of entries) PARENTS.set(entry.into, { from, entry })
}

const parentOf = (mon) => PARENTS.get(BASE_FORM[mon] ?? mon)

export const evolutionsOf = (mon) => EVOLUTIONS[mon] ?? []

export const levelEvolutionOf = (mon) => evolutionsOf(mon).find((entry) => entry.level) ?? null

export const preEvolutionOf = (mon) => parentOf(mon)?.from ?? null

// A mon reached by level-up starts at that level, one reached by stone or trade starts
// where its pre-evolution does, and any other mon starts at FIRST_LEVEL, the lowest
// levels the games allow
export function startLevel(mon) {
  const parent = parentOf(mon)
  if (!parent) return FIRST_LEVEL
  return parent.entry.level ?? startLevel(parent.from)
}
