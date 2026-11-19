// How a mon's key reads in messages: "nidoran_female" is "Nidoran♀", "abra" is "Abra",
// and a gendered sprite like "heracross_male" reads as its species, "Heracross"
const DISPLAY_NAMES = {
  nidoran_female: 'Nidoran♀',
  nidoran_male: 'Nidoran♂',
  mrmime: 'Mr. Mime',
  farfetchd: "Farfetch'd",
  hooh: 'Ho-Oh',
  mimejr: 'Mime Jr.',
  porygonz: 'Porygon-Z',
  unown_exclamation: 'Unown !',
  unown_question: 'Unown ?',
}

// A name with "a" or "an" before it: "a Fire Stone", "an Ice Stone"
export const withArticle = (name) => (/^[AEIOU]/i.test(name) ? 'an ' : 'a ') + name

export function displayName(mon) {
  if (DISPLAY_NAMES[mon]) return DISPLAY_NAMES[mon]
  return mon.replace(/_(fe)?male$/, '').split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}
