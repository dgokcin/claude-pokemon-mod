import { rnd } from './effects/draw.js'

// Claude's running subagents as a party of Poké Balls along the left of the strip.
// A ball drops in when a subagent starts, rocks now and then while it runs, and
// pops open in a burst of light when it stops. The balls to its right then slide
// over to close the gap. Past six, the sixth slot shows +n for the rest.
// A party is a plain array of balls, oldest first. Every function returns a new
// party or new stamps and leaves its input alone.

const FALL_TICKS = 2
const BOUNCE_TICKS = [2, 4]
const SETTLE_TICKS = 10
const WOBBLE_TICKS = 40
const WOBBLE = [-1, -1, -1, 0, 1, 1, 1]
const OPEN_TICKS = 3
const POP_TICKS = 16
const FADE_TICKS = 4
const SLIDE_TICKS = 2
const EXPIRE_TICKS = 3 * 60 * 60 * 20

export const PARTY_SIZE = 6

const BALL_SIZE = 5
const SLOT_STEP = 6
const LEFT = 1
const MAX_EXTRA = 9
const SPARKS = 9

// Frames are 7 pixels wide, drawn a pixel left of the slot so a ball can lean and
// spill light. A 5x5 ball: K outline, R red top with an h shine, G dark band,
// B light button, W white bottom with a g shade under the button.
const BALL = ['..KKK..', '.KhRRK.', '.GGBGG.', '.KWgWK.', '..KKK..']
// Rocking left and right: the band tips and the top two rows lean a pixel that way
const LEANS = [
  ['.KKK...', 'KhRRG..', '.KGBGK.', '.GWgWK.', '..KKK..'],
  BALL,
  ['...KKK.', '..GhRRK', '.KGBGK.', '.KWgWG.', '..KKK..'],
]
// Popping: the lid lifts off the bottom half and light spills out of the gap
const OPEN = [
  ['..KKK..', '.KhRRK.', 'rwwwwwr', '.GGBGG.', '.KWgWK.', '..KKK..'],
  ['..KKK..', '.KhRRK.', 'r.www.r', 'rwwwwwr', '.GGBGG.', '.KWgWK.', '..KKK..'],
]
// Then a flash where the ball was, big and then small
const FLASH = [
  ['...r...', '..rwr..', '.rwwwr.', 'rwwwwwr', '.rwwwr.', '..rwr..', '...r...'],
  ['.......', '...r...', '..rwr..', '.rwwwr.', '..rwr..', '...r...', '.......'],
]
const BALL_COLORS = { K: 0x000000, R: 0xe03030, h: 0xff9090, G: 0x4a4a56, B: 0xffffff, W: 0xf0f0f4, g: 0xa0a0ac }
const LIGHT_COLORS = { ...BALL_COLORS, w: 0xffffff, r: 0xff8080 }
const LABEL_COLOR = 0x9a9ab0

// The +n label: a plus beside a digit, 5 pixels tall like a ball
const PLUS = ['...', '.n.', 'nnn', '.n.', '...']
const DIGITS = {
  2: ['nnn', '..n', 'nnn', 'n..', 'nnn'],
  3: ['nnn', '..n', 'nnn', '..n', 'nnn'],
  4: ['n.n', 'n.n', 'nnn', '..n', '..n'],
  5: ['nnn', 'n..', 'nnn', '..n', 'nnn'],
  6: ['nnn', 'n..', 'nnn', 'n.n', 'nnn'],
  7: ['nnn', '..n', '..n', '..n', '..n'],
  8: ['nnn', 'n.n', 'nnn', 'n.n', 'nnn'],
  9: ['nnn', 'n.n', 'nnn', '..n', 'nnn'],
}

const stamp = (x, y, rows, colors) => ({ x, y, rows, colors })

// A stable number per subagent, so each ball keeps its own beat and sparks
function hashOf(id) {
  let h = 0x811c9dc5
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return h >>> 0
}

const slotX = (slot) => LEFT + slot * SLOT_STEP

// Every ball past the fifth shares the sixth slot
const slotOf = (i) => Math.min(i, PARTY_SIZE - 1)

// Where a ball stands: in its slot, or sliding left into it a pixel at a time
function ballX(ball, i, tick) {
  const home = slotX(slotOf(i))
  if (ball.slideFrom === null) return home
  return Math.max(home, ball.slideFrom - Math.floor((tick - ball.slideStart) / SLIDE_TICKS))
}

const landingAge = (ground) => (ground + 1) * FALL_TICKS

// Whether a ball reached the ground, before it popped if it popped
const hasLanded = (ball, tick, ground) => (ball.popStart ?? tick) - ball.born >= landingAge(ground)

// A ball's top pixel row: falling a pixel every FALL_TICKS from above the strip
// like a berry, then bouncing a pixel once it lands
function topAt(age, ground) {
  const rest = ground - BALL_SIZE + 1
  const fall = -BALL_SIZE + Math.floor(age / FALL_TICKS)
  if (fall < rest) return fall
  const since = age - landingAge(ground)
  return since >= BOUNCE_TICKS[0] && since < BOUNCE_TICKS[1] ? rest - 1 : rest
}

// -1 or 1 while a resting ball rocks left or right. Each ball keeps its own beat,
// WOBBLE_TICKS give or take 4, so neighbors drift in and out of step.
function tiltAt(ball, age, ground) {
  const rested = age - landingAge(ground) - SETTLE_TICKS
  if (rested < 0) return 0
  const h = hashOf(ball.id)
  const beat = WOBBLE_TICKS - 4 + (h % 9)
  return WOBBLE[(rested + h) % beat] ?? 0
}

export function joinParty(party, id, tick) {
  if (party.some((ball) => ball.id === id)) return party
  return [...party, { id, born: tick, popStart: null, slideFrom: null, slideStart: 0 }]
}

export function leaveParty(party, id, tick) {
  const i = party.findIndex((ball) => ball.id === id)
  if (i < 0 || party[i].popStart !== null) return party
  return party.map((ball, k) => (k === i ? { ...ball, popStart: tick } : ball))
}

// Pop balls past the cap, drop balls done popping, and slide each ball that moves
// to a lower slot over from where it stands. Returns the same party when nothing changes.
export function prunedParty(party, tick) {
  const expired = (ball) => ball.popStart === null && tick - ball.born >= EXPIRE_TICKS
  const done = (ball) => ball.popStart !== null && tick - ball.popStart >= POP_TICKS
  if (!party.some((ball) => expired(ball) || done(ball))) return party
  const popped = party.map((ball) => (expired(ball) ? { ...ball, popStart: tick } : ball))
  const was = new Map(popped.map((ball, i) => [ball, i]))
  return popped.filter((ball) => !done(ball)).map((ball, i) => {
    const old = was.get(ball)
    return slotOf(old) === slotOf(i) ? ball : { ...ball, slideFrom: ballX(ball, old, tick), slideStart: tick }
  })
}

// Scattered pixels, each [x, y, letter], as one stamp, the first pixel at a spot on top
function scatter(pixels, colors) {
  if (pixels.length === 0) return []
  const xs = pixels.map((p) => p[0])
  const ys = pixels.map((p) => p[1])
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const grid = Array.from({ length: Math.max(...ys) - top + 1 }, () => Array(Math.max(...xs) - left + 1).fill('.'))
  for (const [x, y, ch] of pixels) if (grid[y - top][x - left] === '.') grid[y - top][x - left] = ch
  return [stamp(left, top, grid.map((row) => row.join('')), colors)]
}

// The sparks of a popped ball, t ticks after the flash: a fan flying up and out of
// its middle, fast white ones and slow light red ones in turn, with light red tails
// that drop off as they fade
function sparkPixels(ball, t, cx, cy) {
  const seed = hashOf(ball.id)
  const fading = t >= POP_TICKS - OPEN_TICKS - FADE_TICKS
  const heads = []
  const tails = []
  for (let k = 0; k < SPARKS; k++) {
    const angle = Math.PI * (1.1 + (0.8 * (k + 0.2 + 0.6 * rnd(seed, k))) / SPARKS)
    const speed = (k % 2 ? 0.4 : 0.75) + 0.15 * rnd(seed, k, 1)
    const at = (r) => [Math.round(cx + Math.cos(angle) * r), Math.round(cy + Math.sin(angle) * r + 0.01 * t * t)]
    heads.push([...at(2.5 + speed * t), fading || k % 2 ? 'r' : 'w'])
    if (!fading) tails.push([...at(1.3 + speed * t), 'r'])
  }
  return [...heads, ...tails]
}

// The popping ball itself: the lid lifting off, then a flash where the ball was.
// A ball folded into the +n label only flashes.
function lidStamp(age, x, top, folded) {
  if (age < OPEN_TICKS) {
    if (folded) return null
    const open = OPEN[age < OPEN_TICKS - 1 ? 0 : 1]
    return stamp(x - 1, top + BALL_SIZE - open.length, open, LIGHT_COLORS)
  }
  const flash = FLASH[age - OPEN_TICKS]
  return flash ? stamp(x - 1, top - 1, flash, LIGHT_COLORS) : null
}

// The small +n in the sixth slot, standing on the ground like a ball
function labelStamp(n, ground, color) {
  const digit = DIGITS[Math.min(MAX_EXTRA, n)]
  const rows = PLUS.map((row, y) => row + '.' + digit[y])
  return stamp(slotX(PARTY_SIZE - 1), ground - BALL_SIZE + 1, rows, { n: color })
}

// What to draw this tick, the first stamp on top: popping lids and flashes, falling
// balls, resting balls, sparks, then the +n label. Balls past the fifth that have
// landed fold into the label, so a new one falls into the sixth slot and joins it.
export function partyStamps(party, tick, { columns, ground, label = LABEL_COLOR }) {
  const landed = (ball) => hasLanded(ball, tick, ground)
  const crowd = party.slice(PARTY_SIZE - 1)
  const settled = crowd.filter(landed)
  const folded = settled.length > 1
  // Of the balls falling into the sixth slot together, only the lowest shows
  const leader = crowd.find((ball) => ball.popStart === null && !landed(ball))
  const lids = []
  const falling = []
  const resting = []
  const sparks = []
  party.forEach((ball, i) => {
    const x = ballX(ball, i, tick)
    if (x >= columns) return
    const hidden = folded && settled.includes(ball)
    if (ball.popStart !== null) {
      const age = tick - ball.popStart
      if (age >= POP_TICKS) return
      const top = topAt(ball.popStart - ball.born, ground)
      const lid = lidStamp(age, x, top, hidden)
      if (lid) lids.push(lid)
      if (age >= OPEN_TICKS) sparks.push(...sparkPixels(ball, age - OPEN_TICKS, x + 2, top + 2))
      return
    }
    if (hidden || (i >= PARTY_SIZE - 1 && !landed(ball) && ball !== leader)) return
    const age = tick - ball.born
    const tilt = tiltAt(ball, age, ground)
    const s = stamp(x - 1, topAt(age, ground), LEANS[tilt + 1], BALL_COLORS)
    if (landed(ball)) resting.push(s)
    else falling.push(s)
  })
  const inside = ([x, y]) => x >= 0 && x < columns && y >= 0 && y <= ground
  const labels = folded && slotX(PARTY_SIZE - 1) < columns ? [labelStamp(settled.length, ground, label)] : []
  return [...lids, ...falling, ...resting, ...scatter(sparks.filter(inside), LIGHT_COLORS), ...labels]
}
