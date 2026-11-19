// Evolutions follow the games of each mon's own generation, through gen 5, and are keyed
// by sprite key in Pokédex order. Each entry is one thing the mon can become: { into,
// level } on a level-up to at least that level, { into, item } by using an item from the
// bag, or { into, trade: true } by trading it with a Link Cable. A mon that doesn't
// evolve has no entry.
//
// A level-up entry may also need full hearts (happy), a time of day by the local clock
// (time: 'day' or 'night'), a move in its moveset (move), or a mon in the party (mate).
// Friendship evolutions have no level of their own, so they take level 2, any level-up.
// An item used by day or at night, like the Razor Claw, carries time too, and a trade
// holding an item names it in holds and spends it along with the cable. Feebas trades
// holding a Prism Scale, as in gen 5. Magnezone, Probopass, Leafeon, and Glaceon take
// the stones later games gave them.

const FIRST_LEVEL = 5
// The level of an entry that any level-up brings about
export const ANY_LEVEL = 2

// Day runs from 4:00 to 17:59 local time, and night the rest, as in gen 2
const DAY_FROM = 4
const NIGHT_FROM = 18
export const timeOfDay = (ms) => {
  const hour = new Date(ms).getHours()
  return hour >= DAY_FROM && hour < NIGHT_FROM ? 'day' : 'night'
}

// Mons that only hatch from eggs, so the mon each grows into starts as low as one with no family
export const BABIES = [
  'pichu', 'cleffa', 'igglybuff', 'togepi', 'tyrogue', 'smoochum', 'elekid', 'magby', 'azurill', 'wynaut', 'budew', 'chingling', 'bonsly', 'mimejr',
  'happiny', 'munchlax', 'riolu', 'mantyke',
]

// Female sprites and other forms take their species' place in the family, so raichu comes
// from pikachu and venusaur_female from ivysaur. A species with no plain sprite counts one
// of its forms as itself, like unown_a.
export const BASE_FORM = {
  pikachu_female: 'pikachu', venusaur_female: 'venusaur', heracross_male: 'heracross_female', meganium_female: 'meganium', pichu_spiky_eared: 'pichu',
  steelix_female: 'steelix', unown_b: 'unown_a', unown_c: 'unown_a', unown_d: 'unown_a', unown_e: 'unown_a', unown_exclamation: 'unown_a',
  unown_f: 'unown_a', unown_g: 'unown_a', unown_h: 'unown_a', unown_i: 'unown_a', unown_j: 'unown_a', unown_k: 'unown_a', unown_l: 'unown_a',
  unown_m: 'unown_a', unown_n: 'unown_a', unown_o: 'unown_a', unown_p: 'unown_a', unown_q: 'unown_a', unown_question: 'unown_a', unown_r: 'unown_a',
  unown_s: 'unown_a', unown_t: 'unown_a', unown_u: 'unown_a', unown_v: 'unown_a', unown_w: 'unown_a', unown_x: 'unown_a', unown_y: 'unown_a',
  unown_z: 'unown_a', wobbuffet_male: 'wobbuffet_female', deoxys_attack: 'deoxys', deoxys_defense: 'deoxys', deoxys_speed: 'deoxys',
  arceus_bug: 'arceus', arceus_dark: 'arceus', arceus_dragon: 'arceus', arceus_electric: 'arceus', arceus_fighting: 'arceus', arceus_fire: 'arceus',
  arceus_flying: 'arceus', arceus_ghost: 'arceus', arceus_grass: 'arceus', arceus_ground: 'arceus', arceus_ice: 'arceus', arceus_poison: 'arceus',
  arceus_psychic: 'arceus', arceus_rock: 'arceus', arceus_steel: 'arceus', arceus_water: 'arceus', burmy_sandy: 'burmy_plant',
  burmy_trash: 'burmy_plant', combee_male: 'combee_female', gabite_female: 'gabite', garchomp_female: 'garchomp', gastrodon_west: 'gastrodon_east',
  gible_female: 'gible', giratina_origin: 'giratina', hippopotas_male: 'hippopotas_female', hippowdon_male: 'hippowdon_female', rotom_fan: 'rotom',
  rotom_frost: 'rotom', rotom_heat: 'rotom', rotom_mow: 'rotom', rotom_wash: 'rotom', shaymin_sky: 'shaymin', shellos_west: 'shellos_east',
  wormadam_sandy: 'wormadam_plant', wormadam_trash: 'wormadam_plant', basculin_red_striped: 'basculin_blue_striped',
  deerling_spring: 'deerling_autumn', deerling_summer: 'deerling_autumn', deerling_winter: 'deerling_autumn',
}

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
  golbat: [{ into: 'crobat', level: 2, happy: true }],
  oddish: [{ into: 'gloom', level: 21 }],
  gloom: [{ into: 'vileplume', item: 'Leaf Stone' }, { into: 'bellossom', item: 'Sun Stone' }],
  paras: [{ into: 'parasect', level: 24 }],
  venonat: [{ into: 'venomoth', level: 31 }],
  diglett: [{ into: 'dugtrio', level: 26 }],
  meowth: [{ into: 'persian', level: 28 }],
  psyduck: [{ into: 'golduck', level: 33 }],
  mankey: [{ into: 'primeape', level: 28 }],
  growlithe: [{ into: 'arcanine', item: 'Fire Stone' }],
  poliwag: [{ into: 'poliwhirl', level: 25 }],
  poliwhirl: [{ into: 'poliwrath', item: 'Water Stone' }, { into: 'politoed', trade: true, holds: "King's Rock" }],
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
  slowpoke: [{ into: 'slowbro', level: 37 }, { into: 'slowking', trade: true, holds: "King's Rock" }],
  magnemite: [{ into: 'magneton', level: 30 }],
  magneton: [{ into: 'magnezone', item: 'Thunder Stone' }],
  doduo: [{ into: 'dodrio', level: 31 }],
  seel: [{ into: 'dewgong', level: 34 }],
  grimer: [{ into: 'muk', level: 38 }],
  shellder: [{ into: 'cloyster', item: 'Water Stone' }],
  gastly: [{ into: 'haunter', level: 25 }],
  haunter: [{ into: 'gengar', trade: true }],
  onix: [{ into: 'steelix', trade: true, holds: 'Metal Coat' }],
  drowzee: [{ into: 'hypno', level: 26 }],
  krabby: [{ into: 'kingler', level: 28 }],
  voltorb: [{ into: 'electrode', level: 30 }],
  exeggcute: [{ into: 'exeggutor', item: 'Leaf Stone' }],
  cubone: [{ into: 'marowak', level: 28 }],
  lickitung: [{ into: 'lickilicky', level: 33, move: 'Rollout' }],
  koffing: [{ into: 'weezing', level: 35 }],
  rhyhorn: [{ into: 'rhydon', level: 42 }],
  rhydon: [{ into: 'rhyperior', trade: true, holds: 'Protector' }],
  chansey: [{ into: 'blissey', level: 2, happy: true }],
  tangela: [{ into: 'tangrowth', level: 33, move: 'Ancient Power' }],
  horsea: [{ into: 'seadra', level: 32 }],
  seadra: [{ into: 'kingdra', trade: true, holds: 'Dragon Scale' }],
  goldeen: [{ into: 'seaking', level: 33 }],
  staryu: [{ into: 'starmie', item: 'Water Stone' }],
  scyther: [{ into: 'scizor', trade: true, holds: 'Metal Coat' }],
  electabuzz: [{ into: 'electivire', trade: true, holds: 'Electirizer' }],
  magmar: [{ into: 'magmortar', trade: true, holds: 'Magmarizer' }],
  magikarp: [{ into: 'gyarados', level: 20 }],
  eevee: [
    { into: 'vaporeon', item: 'Water Stone' },
    { into: 'jolteon', item: 'Thunder Stone' },
    { into: 'flareon', item: 'Fire Stone' },
    { into: 'espeon', level: 2, happy: true, time: 'day' },
    { into: 'umbreon', level: 2, happy: true, time: 'night' },
    { into: 'leafeon', item: 'Leaf Stone' },
    { into: 'glaceon', item: 'Ice Stone' },
  ],
  porygon: [{ into: 'porygon2', trade: true, holds: 'Up-Grade' }],
  omanyte: [{ into: 'omastar', level: 40 }],
  kabuto: [{ into: 'kabutops', level: 40 }],
  dratini: [{ into: 'dragonair', level: 30 }],
  dragonair: [{ into: 'dragonite', level: 55 }],
  chikorita: [{ into: 'bayleef', level: 16 }],
  bayleef: [{ into: 'meganium', level: 32 }],
  cyndaquil: [{ into: 'quilava', level: 14 }],
  quilava: [{ into: 'typhlosion', level: 36 }],
  totodile: [{ into: 'croconaw', level: 18 }],
  croconaw: [{ into: 'feraligatr', level: 30 }],
  sentret: [{ into: 'furret', level: 15 }],
  hoothoot: [{ into: 'noctowl', level: 20 }],
  ledyba: [{ into: 'ledian', level: 18 }],
  spinarak: [{ into: 'ariados', level: 22 }],
  chinchou: [{ into: 'lanturn', level: 27 }],
  pichu: [{ into: 'pikachu', level: 2, happy: true }],
  cleffa: [{ into: 'clefairy', level: 2, happy: true }],
  igglybuff: [{ into: 'jigglypuff', level: 2, happy: true }],
  togepi: [{ into: 'togetic', level: 2, happy: true }],
  togetic: [{ into: 'togekiss', item: 'Shiny Stone' }],
  natu: [{ into: 'xatu', level: 25 }],
  mareep: [{ into: 'flaaffy', level: 15 }],
  flaaffy: [{ into: 'ampharos', level: 30 }],
  marill: [{ into: 'azumarill', level: 18 }],
  hoppip: [{ into: 'skiploom', level: 18 }],
  skiploom: [{ into: 'jumpluff', level: 27 }],
  aipom: [{ into: 'ambipom', level: 32, move: 'Double Hit' }],
  sunkern: [{ into: 'sunflora', item: 'Sun Stone' }],
  yanma: [{ into: 'yanmega', level: 33, move: 'Ancient Power' }],
  wooper: [{ into: 'quagsire', level: 20 }],
  murkrow: [{ into: 'honchkrow', item: 'Dusk Stone' }],
  misdreavus: [{ into: 'mismagius', item: 'Dusk Stone' }],
  pineco: [{ into: 'forretress', level: 31 }],
  gligar: [{ into: 'gliscor', item: 'Razor Fang', time: 'night' }],
  snubbull: [{ into: 'granbull', level: 23 }],
  sneasel: [{ into: 'weavile', item: 'Razor Claw', time: 'night' }],
  teddiursa: [{ into: 'ursaring', level: 30 }],
  slugma: [{ into: 'magcargo', level: 38 }],
  swinub: [{ into: 'piloswine', level: 33 }],
  piloswine: [{ into: 'mamoswine', level: 34, move: 'Ancient Power' }],
  remoraid: [{ into: 'octillery', level: 25 }],
  houndour: [{ into: 'houndoom', level: 24 }],
  phanpy: [{ into: 'donphan', level: 25 }],
  porygon2: [{ into: 'porygonz', trade: true, holds: 'Dubious Disc' }],
  tyrogue: [{ into: 'hitmonlee', level: 20 }, { into: 'hitmonchan', level: 20 }, { into: 'hitmontop', level: 20 }],
  smoochum: [{ into: 'jynx', level: 30 }],
  elekid: [{ into: 'electabuzz', level: 30 }],
  magby: [{ into: 'magmar', level: 30 }],
  larvitar: [{ into: 'pupitar', level: 30 }],
  pupitar: [{ into: 'tyranitar', level: 55 }],
  treecko: [{ into: 'grovyle', level: 16 }],
  grovyle: [{ into: 'sceptile', level: 36 }],
  torchic: [{ into: 'combusken', level: 16 }],
  combusken: [{ into: 'blaziken', level: 36 }],
  mudkip: [{ into: 'marshtomp', level: 16 }],
  marshtomp: [{ into: 'swampert', level: 36 }],
  poochyena: [{ into: 'mightyena', level: 18 }],
  zigzagoon: [{ into: 'linoone', level: 20 }],
  wurmple: [{ into: 'silcoon', level: 7 }, { into: 'cascoon', level: 7 }],
  silcoon: [{ into: 'beautifly', level: 10 }],
  cascoon: [{ into: 'dustox', level: 10 }],
  lotad: [{ into: 'lombre', level: 14 }],
  lombre: [{ into: 'ludicolo', item: 'Water Stone' }],
  seedot: [{ into: 'nuzleaf', level: 14 }],
  nuzleaf: [{ into: 'shiftry', item: 'Leaf Stone' }],
  taillow: [{ into: 'swellow', level: 22 }],
  wingull: [{ into: 'pelipper', level: 25 }],
  ralts: [{ into: 'kirlia', level: 20 }],
  kirlia: [{ into: 'gardevoir', level: 30 }, { into: 'gallade', item: 'Dawn Stone' }],
  surskit: [{ into: 'masquerain', level: 22 }],
  shroomish: [{ into: 'breloom', level: 23 }],
  slakoth: [{ into: 'vigoroth', level: 18 }],
  vigoroth: [{ into: 'slaking', level: 36 }],
  nincada: [{ into: 'ninjask', level: 20 }],
  whismur: [{ into: 'loudred', level: 20 }],
  loudred: [{ into: 'exploud', level: 40 }],
  makuhita: [{ into: 'hariyama', level: 24 }],
  azurill: [{ into: 'marill', level: 2, happy: true }],
  nosepass: [{ into: 'probopass', item: 'Thunder Stone' }],
  skitty: [{ into: 'delcatty', item: 'Moon Stone' }],
  aron: [{ into: 'lairon', level: 32 }],
  lairon: [{ into: 'aggron', level: 42 }],
  meditite: [{ into: 'medicham', level: 37 }],
  electrike: [{ into: 'manectric', level: 26 }],
  roselia: [{ into: 'roserade', item: 'Shiny Stone' }],
  gulpin: [{ into: 'swalot', level: 26 }],
  carvanha: [{ into: 'sharpedo', level: 30 }],
  wailmer: [{ into: 'wailord', level: 40 }],
  numel: [{ into: 'camerupt', level: 33 }],
  spoink: [{ into: 'grumpig', level: 32 }],
  trapinch: [{ into: 'vibrava', level: 35 }],
  vibrava: [{ into: 'flygon', level: 45 }],
  cacnea: [{ into: 'cacturne', level: 32 }],
  swablu: [{ into: 'altaria', level: 35 }],
  barboach: [{ into: 'whiscash', level: 30 }],
  corphish: [{ into: 'crawdaunt', level: 30 }],
  baltoy: [{ into: 'claydol', level: 36 }],
  lileep: [{ into: 'cradily', level: 40 }],
  anorith: [{ into: 'armaldo', level: 40 }],
  feebas: [{ into: 'milotic', trade: true, holds: 'Prism Scale' }],
  shuppet: [{ into: 'banette', level: 37 }],
  duskull: [{ into: 'dusclops', level: 37 }],
  dusclops: [{ into: 'dusknoir', trade: true, holds: 'Reaper Cloth' }],
  wynaut: [{ into: 'wobbuffet_female', level: 15 }],
  snorunt: [{ into: 'glalie', level: 42 }, { into: 'froslass', item: 'Dawn Stone' }],
  spheal: [{ into: 'sealeo', level: 32 }],
  sealeo: [{ into: 'walrein', level: 44 }],
  clamperl: [{ into: 'huntail', trade: true, holds: 'Deep Sea Tooth' }, { into: 'gorebyss', trade: true, holds: 'Deep Sea Scale' }],
  bagon: [{ into: 'shelgon', level: 30 }],
  shelgon: [{ into: 'salamence', level: 50 }],
  beldum: [{ into: 'metang', level: 20 }],
  metang: [{ into: 'metagross', level: 45 }],
  turtwig: [{ into: 'grotle', level: 18 }],
  grotle: [{ into: 'torterra', level: 32 }],
  chimchar: [{ into: 'monferno', level: 14 }],
  monferno: [{ into: 'infernape', level: 36 }],
  piplup: [{ into: 'prinplup', level: 16 }],
  prinplup: [{ into: 'empoleon', level: 36 }],
  starly: [{ into: 'staravia', level: 14 }],
  staravia: [{ into: 'staraptor', level: 34 }],
  bidoof: [{ into: 'bibarel', level: 15 }],
  kricketot: [{ into: 'kricketune', level: 10 }],
  shinx: [{ into: 'luxio', level: 15 }],
  luxio: [{ into: 'luxray', level: 30 }],
  budew: [{ into: 'roselia', level: 2, happy: true, time: 'day' }],
  cranidos: [{ into: 'rampardos', level: 30 }],
  shieldon: [{ into: 'bastiodon', level: 30 }],
  burmy_plant: [{ into: 'wormadam_plant', level: 20 }, { into: 'mothim', level: 20 }],
  burmy_sandy: [{ into: 'wormadam_sandy', level: 20 }, { into: 'mothim', level: 20 }],
  burmy_trash: [{ into: 'wormadam_trash', level: 20 }, { into: 'mothim', level: 20 }],
  combee_female: [{ into: 'vespiquen', level: 21 }],
  buizel: [{ into: 'floatzel', level: 26 }],
  cherubi: [{ into: 'cherrim', level: 25 }],
  shellos_east: [{ into: 'gastrodon_east', level: 30 }],
  shellos_west: [{ into: 'gastrodon_west', level: 30 }],
  drifloon: [{ into: 'drifblim', level: 28 }],
  buneary: [{ into: 'lopunny', level: 2, happy: true }],
  glameow: [{ into: 'purugly', level: 38 }],
  chingling: [{ into: 'chimecho', level: 2, happy: true, time: 'night' }],
  stunky: [{ into: 'skuntank', level: 34 }],
  bronzor: [{ into: 'bronzong', level: 33 }],
  bonsly: [{ into: 'sudowoodo', level: 17, move: 'Mimic' }],
  mimejr: [{ into: 'mrmime', level: 18, move: 'Mimic' }],
  happiny: [{ into: 'chansey', item: 'Oval Stone', time: 'day' }],
  gible: [{ into: 'gabite', level: 24 }],
  gible_female: [{ into: 'gabite_female', level: 24 }],
  gabite: [{ into: 'garchomp', level: 48 }],
  gabite_female: [{ into: 'garchomp_female', level: 48 }],
  munchlax: [{ into: 'snorlax', level: 2, happy: true }],
  riolu: [{ into: 'lucario', level: 2, happy: true, time: 'day' }],
  hippopotas_female: [{ into: 'hippowdon_female', level: 34 }],
  hippopotas_male: [{ into: 'hippowdon_male', level: 34 }],
  skorupi: [{ into: 'drapion', level: 40 }],
  croagunk: [{ into: 'toxicroak', level: 37 }],
  finneon: [{ into: 'lumineon', level: 31 }],
  mantyke: [{ into: 'mantine', level: 2, mate: 'remoraid' }],
  snover: [{ into: 'abomasnow', level: 40 }],
  patrat: [{ into: 'watchog', level: 20 }],
  munna: [{ into: 'musharna', item: 'Moon Stone' }],
  krokorok: [{ into: 'krookodile', level: 40 }],
}

// PARENTS maps each evolved mon to the mon it comes from and the entry that takes it there
const PARENTS = new Map()
for (const [from, entries] of Object.entries(EVOLUTIONS)) {
  if (BASE_FORM[from]) continue
  for (const entry of entries) PARENTS.set(entry.into, { from, entry })
}

const parentOf = (mon) => PARENTS.get(BASE_FORM[mon] ?? mon)

export const evolutionsOf = (mon) => EVOLUTIONS[mon] ?? []

export const isPlainLevel = (entry) => Boolean(entry.level && !entry.happy && !entry.time && !entry.move && !entry.mate)

// The level-up evolution that needs nothing but the level
export const levelEvolutionOf = (mon) => evolutionsOf(mon).find(isPlainLevel) ?? null

// What an entry needs beyond its level, item, or trade that the mon lacks: any of happy,
// time, move, and mate. has is { happy, time, moves, party }, with moves and party as names.
export function unmetOf(entry, has) {
  const unmet = []
  if (entry.happy && !has.happy) unmet.push('happy')
  if (entry.time && entry.time !== has.time) unmet.push('time')
  if (entry.move && !has.moves?.includes(entry.move)) unmet.push('move')
  if (entry.mate && !has.party?.includes(entry.mate)) unmet.push('mate')
  return unmet
}

// The evolution a level-up to has.level brings about, plain or with all it needs
export const levelUpEvolutionOf = (mon, has) => evolutionsOf(mon).find((entry) => entry.level && has.level >= entry.level && unmetOf(entry, has).length === 0) ?? null

export const preEvolutionOf = (mon) => parentOf(mon)?.from ?? null

// A mon reached by level-up starts at that level, but never below its pre-evolution, so
// one reached by friendship, stone, or trade starts where its pre-evolution does. Any
// other mon, or one grown from a baby, starts at FIRST_LEVEL, the lowest levels the
// games allow.
export function startLevel(mon) {
  const parent = parentOf(mon)
  if (!parent || BABIES.includes(parent.from)) return FIRST_LEVEL
  return Math.max(parent.entry.level ?? 0, startLevel(parent.from))
}
