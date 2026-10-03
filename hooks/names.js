// How a mon's key reads in messages: "nidoran_female" is "Nidoran♀", "abra" is "Abra"
const DISPLAY_NAMES = {
  nidoran_female: 'Nidoran♀',
  nidoran_male: 'Nidoran♂',
  mrmime: 'Mr. Mime',
  farfetchd: "Farfetch'd",
  pikachu_female: 'Pikachu',
  venusaur_female: 'Venusaur',
}

export function displayName(mon) {
  return DISPLAY_NAMES[mon] ?? mon.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}
