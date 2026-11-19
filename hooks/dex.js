import { BABIES, BASE_FORM, evolutionsOf, preEvolutionOf, startLevel } from './evolutions.js'
import { SHINYLESS } from './frames.js'

// The Pokédex through gen 5 and how often each mon turns up in the wild. NATIONAL lists
// the sprite keys in national dex order, with null for a species vscode-pokemon has no
// sprite for, and DEX the ones it has. A form or female sprite counts as its species' entry.

const NATIONAL = [
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
  'mew', 'chikorita', 'bayleef', 'meganium', 'cyndaquil', 'quilava', 'typhlosion', 'totodile', 'croconaw', 'feraligatr',
  'sentret', 'furret', 'hoothoot', 'noctowl', 'ledyba', 'ledian', 'spinarak', 'ariados', 'crobat', 'chinchou',
  'lanturn', 'pichu', 'cleffa', 'igglybuff', 'togepi', 'togetic', 'natu', 'xatu', 'mareep', 'flaaffy',
  'ampharos', 'bellossom', 'marill', 'azumarill', 'sudowoodo', 'politoed', 'hoppip', 'skiploom', 'jumpluff', 'aipom',
  'sunkern', 'sunflora', 'yanma', 'wooper', 'quagsire', 'espeon', 'umbreon', 'murkrow', 'slowking', 'misdreavus',
  'unown_a', 'wobbuffet_female', 'girafarig', 'pineco', 'forretress', 'dunsparce', 'gligar', 'steelix', 'snubbull', 'granbull',
  'qwilfish', 'scizor', 'shuckle', 'heracross_female', 'sneasel', 'teddiursa', 'ursaring', 'slugma', 'magcargo', 'swinub',
  'piloswine', 'corsola', 'remoraid', 'octillery', 'delibird', 'mantine', 'skarmory', 'houndour', 'houndoom', 'kingdra',
  'phanpy', 'donphan', 'porygon2', 'stantler', 'smeargle', 'tyrogue', 'hitmontop', 'smoochum', 'elekid', 'magby',
  'miltank', 'blissey', 'raikou', 'entei', 'suicune', 'larvitar', 'pupitar', 'tyranitar', 'lugia', 'hooh',
  'celebi', 'treecko', 'grovyle', 'sceptile', 'torchic', 'combusken', 'blaziken', 'mudkip', 'marshtomp', 'swampert',
  'poochyena', 'mightyena', 'zigzagoon', 'linoone', 'wurmple', 'silcoon', 'beautifly', 'cascoon', 'dustox', 'lotad',
  'lombre', 'ludicolo', 'seedot', 'nuzleaf', 'shiftry', 'taillow', 'swellow', 'wingull', 'pelipper', 'ralts',
  'kirlia', 'gardevoir', 'surskit', 'masquerain', 'shroomish', 'breloom', 'slakoth', 'vigoroth', 'slaking', 'nincada',
  'ninjask', 'shedinja', 'whismur', 'loudred', 'exploud', 'makuhita', 'hariyama', 'azurill', 'nosepass', 'skitty',
  'delcatty', 'sableye', 'mawile', 'aron', 'lairon', 'aggron', 'meditite', 'medicham', 'electrike', 'manectric',
  'plusle', 'minun', 'volbeat', 'illumise', 'roselia', 'gulpin', 'swalot', 'carvanha', 'sharpedo', 'wailmer',
  'wailord', 'numel', 'camerupt', 'torkoal', 'spoink', 'grumpig', 'spinda', 'trapinch', 'vibrava', 'flygon',
  'cacnea', 'cacturne', 'swablu', 'altaria', 'zangoose', 'seviper', 'lunatone', 'solrock', 'barboach', 'whiscash',
  'corphish', 'crawdaunt', 'baltoy', 'claydol', 'lileep', 'cradily', 'anorith', 'armaldo', 'feebas', 'milotic',
  'castform', 'kecleon', 'shuppet', 'banette', 'duskull', 'dusclops', 'tropius', 'chimecho', 'absol', 'wynaut',
  'snorunt', 'glalie', 'spheal', 'sealeo', 'walrein', 'clamperl', 'huntail', 'gorebyss', 'relicanth', 'luvdisc',
  'bagon', 'shelgon', 'salamence', 'beldum', 'metang', 'metagross', 'regirock', 'regice', 'registeel', 'latias',
  'latios', 'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys', 'turtwig', 'grotle', 'torterra', 'chimchar',
  'monferno', 'infernape', 'piplup', 'prinplup', 'empoleon', 'starly', 'staravia', 'staraptor', 'bidoof', 'bibarel',
  'kricketot', 'kricketune', 'shinx', 'luxio', 'luxray', 'budew', 'roserade', 'cranidos', 'rampardos', 'shieldon',
  'bastiodon', 'burmy_plant', 'wormadam_plant', 'mothim', 'combee_female', 'vespiquen', 'pachirisu', 'buizel', 'floatzel', 'cherubi',
  'cherrim', 'shellos_east', 'gastrodon_east', 'ambipom', 'drifloon', 'drifblim', 'buneary', 'lopunny', 'mismagius', 'honchkrow',
  'glameow', 'purugly', 'chingling', 'stunky', 'skuntank', 'bronzor', 'bronzong', 'bonsly', 'mimejr', 'happiny',
  'chatot', 'spiritomb', 'gible', 'gabite', 'garchomp', 'munchlax', 'riolu', 'lucario', 'hippopotas_female', 'hippowdon_female',
  'skorupi', 'drapion', 'croagunk', 'toxicroak', 'carnivine', 'finneon', 'lumineon', 'mantyke', 'snover', 'abomasnow',
  'weavile', 'magnezone', 'lickilicky', 'rhyperior', 'tangrowth', 'electivire', 'magmortar', 'togekiss', 'yanmega', 'leafeon',
  'glaceon', 'gliscor', 'mamoswine', 'porygonz', 'gallade', 'probopass', 'dusknoir', 'froslass', 'rotom', 'uxie',
  'mesprit', 'azelf', 'dialga', 'palkia', 'heatran', 'regigigas', 'giratina', 'cresselia', 'phione', 'manaphy',
  'darkrai', 'shaymin', 'arceus', 'victini', null, null, null, null, null, null,
  null, null, null, 'patrat', 'watchog', null, 'herdier', null, null, 'liepard',
  'pansage', null, 'pansear', null, 'panpour', null, 'munna', 'musharna', 'pidove', null,
  null, null, 'zebstrika', null, 'boldore', null, 'woobat', null, 'drilbur', null,
  'audino', null, 'gurdurr', null, 'tympole', null, null, 'throh', 'sawk', null,
  null, 'leavanny', null, null, 'scolipede', 'cottonee', null, 'petilil', null, 'basculin_blue_striped',
  null, 'krokorok', 'krookodile', null, null, 'maractus', null, 'crustle', 'scraggy', null,
  'sigilyph', null, null, 'tirtouga', null, null, null, null, 'garbodor', 'zorua',
  null, 'minccino', null, null, 'gothorita', null, null, 'duosion', null, 'ducklett',
  null, null, 'vanillish', null, 'deerling_autumn', null, 'emolga', 'karrablast', null, null,
  null, null, null, 'alomomola', null, 'galvantula', null, null, null, 'klang',
  null, null, null, null, 'elgyem', null, 'litwick', null, null, 'axew',
  null, null, 'cubchoo', null, null, 'shelmet', null, 'stunfisk', 'mienfoo', null,
  'druddigon', 'golett', null, 'pawniard', null, 'bouffalant', null, 'braviary', null, 'mandibuzz',
  'heatmor', 'durant', null, null, null, null, null, 'cobalion', 'terrakion', 'virizion',
  null, null, null, null, null, null, 'keldeo', 'meloetta', null,
]
export const DEX = NATIONAL.filter(Boolean)

export const dexKey = (mon) => BASE_FORM[mon] ?? mon

export const dexNumber = (mon) => NATIONAL.indexOf(dexKey(mon)) + 1

// The last national number in each generation
const GEN_ENDS = [151, 251, 386, 493, 649]

// A mon's generation, or 0 for one outside the Pokédex
export function genOf(mon) {
  const number = dexNumber(mon)
  return number > 0 ? GEN_ENDS.findIndex((end) => number <= end) + 1 : 0
}

export const LEGENDARY = [
  'articuno', 'zapdos', 'moltres', 'mewtwo', 'mew', 'raikou', 'entei', 'suicune', 'lugia', 'hooh', 'celebi', 'regirock', 'regice', 'registeel',
  'latias', 'latios', 'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys', 'uxie', 'mesprit', 'azelf', 'dialga', 'palkia', 'heatran', 'regigigas',
  'giratina', 'cresselia', 'phione', 'manaphy', 'darkrai', 'shaymin', 'arceus', 'victini', 'cobalion', 'terrakion', 'virizion', 'keldeo', 'meloetta',
]

// Rare mons and everything they evolve into
export const RARE = [
  'lapras', 'snorlax', 'eevee', 'dratini', 'omanyte', 'kabuto', 'aerodactyl', 'chansey', 'tauros', 'kangaskhan',
  'scyther', 'pinsir', 'porygon', 'ditto', 'hitmonlee', 'hitmonchan', 'larvitar', 'heracross_female', 'skarmory', 'miltank',
  'togetic', 'bagon', 'beldum', 'feebas', 'absol', 'lileep', 'anorith', 'relicanth', 'gible', 'lucario', 'cranidos', 'shieldon',
  'rotom', 'spiritomb', 'axew', 'tirtouga', 'zorua', 'druddigon',
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
// Each species' other sprites, the forms and genders a wild one may turn up as
const FORMS = {}
for (const [form, base] of Object.entries(BASE_FORM)) (FORMS[base] ??= []).push(form)

// Outside the short lists, a family's base form is common and each evolution a tier
// rarer. A mon with no family is uncommon. A baby takes its grown form's tier, so Pichu
// is as common as Pikachu and Munchlax as rare as Snorlax.
export function tierOf(mon) {
  const key = dexKey(mon)
  if (LEGENDARY.includes(key)) return 'legendary'
  let base = BABIES.includes(key) ? evolutionsOf(key)[0].into : key
  let stage = 0
  for (let parent = preEvolutionOf(base); parent && !BABIES.includes(parent); parent = preEvolutionOf(base)) {
    base = parent
    stage++
  }
  if (RARE.includes(base)) return 'rare'
  if (stage === 0 && evolutionsOf(base).length === 0) return 'uncommon'
  return STAGE_TIERS[stage]
}

const BY_TIER = Object.fromEntries(Object.keys(TIERS).map((tier) => [tier, DEX.filter((mon) => tierOf(mon) === tier)]))

// A tier by weight, a mon from it, then one of its sprites. A mon with no shiny sprite is
// never shiny. random() returns a number in [0, 1).
export function pickWild(random) {
  const total = Object.values(TIERS).reduce((sum, { weight }) => sum + weight, 0)
  let roll = random() * total
  const tier = Object.keys(TIERS).find((name) => (roll -= TIERS[name].weight) < 0) ?? 'common'
  const pool = BY_TIER[tier]
  const key = pool[Math.floor(random() * pool.length)]
  const forms = FORMS[key] ?? []
  const mon = forms.length > 0 ? (forms[Math.floor(random() * (forms.length + 1))] ?? key) : key
  const variant = !SHINYLESS.has(mon) && random() < SHINY_ODDS ? 'shiny' : 'default'
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
