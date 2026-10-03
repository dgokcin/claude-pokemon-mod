import { attackFrame, attackPose, prepareAttack } from './attacks.js'
import { SPRITES } from './frames.js'
import { movesOf } from './moves.js'
import { displayName } from './names.js'

// One pixel Pokémon lives in a strip at the right of the band above the prompt.
// While Claude works it paces, with a thought bubble while Claude thinks. It
// hops when a turn ends, then wanders while idle (or stays at the right edge,
// after /pokemon wander) and falls asleep after five quiet minutes.
// /pokemon pet makes pixel hearts float up, and /pokemon feed drops a random pixel
// berry for it to walk over and eat. Food and happiness drain over real time,
// shown as pink ●●●○○ and ❤❤❤♡♡ at the right edge, so it needs both now and then.
// /pokemon attack plays one of its moves, with the animations in attacks.js.
// The mon, hearts, berries, bubbles, and Zs are pixels in one Raster, two per cell.

const TICK_MS = 50
const MOVE_TICKS = 3
const HOP_TICKS = 12
const SLEEP_AFTER_MS = 5 * 60 * 1000
const REST_TICKS = [60, 160]
const STRIP_COLUMNS = 40
const HEAD_ROWS = 1
const HEAD_PIXELS = 8
const DEFAULT_COLOR = 0x01000000
const HEART_COLORS = [0xff4f8b, 0xff9ec4]
const HEART_COUNT = 7
const HEART_GAP_TICKS = 7
const HEART_RISE_TICKS = 3
// Pixel hearts, big and small in turn: p body, h highlight
const HEARTS = [['pp.pp', 'phppp', '.ppp.', '..p..'], ['p.p', 'ppp', '.p.']]
const HEART_SHINE = 0xffe0ec
const PET_TICKS = 60
const FALL_TICKS = 2
const EAT_TICKS = 30
const YUM_TICKS = 30
// A 4x4 pixel berry: k leaf, b rim, B body, h highlight. Each kind recolors it.
const BERRY = ['.kk.', 'bBBb', 'bBhb', '.bb.']
const BERRY_SIZE = 4
const LEAF_COLOR = 0x3a7a2a
const BERRIES = [
  { name: 'oran berry', emoji: '🫐', colors: { k: LEAF_COLOR, b: 0x2c3f9e, B: 0x4a63d8, h: 0x9fb4ff } },
  { name: 'pecha berry', emoji: '🍑', colors: { k: LEAF_COLOR, b: 0xc2477a, B: 0xf48fb1, h: 0xffd1e3 } },
  { name: 'razz berry', emoji: '🍓', colors: { k: LEAF_COLOR, b: 0x8e1240, B: 0xd81b60, h: 0xff7aa8 } },
  { name: 'sitrus berry', emoji: '🍋', colors: { k: LEAF_COLOR, b: 0xc9a400, B: 0xfdd835, h: 0xfff59d } },
]
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20
const MONS = Object.keys(SPRITES)
const VARIANTS = ['default', 'shiny']

let mon = MONS.includes('abra') ? 'abra' : MONS[0]
let variant = 'default'
let wander = true
let working = false
let thinking = false
let bandId = null
let columns = STRIP_COLUMNS
let tick = 0
let x = STRIP_COLUMNS
let facing = 'left'
let lastActive = 0
let hopStart = -HOP_TICKS
let wanderTarget = null
let restUntil = 0
let petUntil = 0
let hearts = []
let food = null
let yumUntil = 0
let attack = null
let nowMs = 0
let stats = {}

// Palette letter to 0xRRGGBB, per mon and variant
const COLORS = Object.fromEntries(
  MONS.map((name) => [
    name,
    Object.fromEntries(
      VARIANTS.map((v) => [
        v,
        Object.fromEntries(
          SPRITES[name].variants[v].palette.map((hex, i) => [String.fromCharCode(97 + i), parseInt(hex.slice(1), 16)]),
        ),
      ]),
    ),
  ]),
)

const spriteRows = (name) => Math.ceil(SPRITES[name].height / 2)
const rowsOf = (name) => HEAD_ROWS + spriteRows(name)

// The right edge of the strip, where the sprite idles
const homeX = () => columns - SPRITES[mon].width
const isHome = () => x >= homeX()

const isHopping = () => tick - hopStart < HOP_TICKS
const isPetted = () => tick < petUntil
const isAsleep = () => !working && (tick - lastActive) * TICK_MS >= SLEEP_AFTER_MS

// Where the sprite stands to eat: right beside the berry
function foodTarget() {
  const width = SPRITES[mon].width
  return food.x > x ? food.x - width : food.x + BERRY_SIZE
}

// Where the idle sprite is headed. Pacing while working is handled in step().
function idleTarget() {
  if (food) return food.eatStart === null ? foodTarget() : x
  if (isAsleep() || isHopping() || isPetted()) return x
  if (!wander) return homeX()
  return wanderTarget ?? x
}

function isWalking() {
  if (attack) return false
  return food ? idleTarget() !== x : working || idleTarget() !== x
}

function markActive() {
  lastActive = tick
}

// The frame showing after elapsed milliseconds, looping over each frame's own duration
function frameAt(anim, elapsed) {
  const total = anim.reduce((sum, f) => sum + f.ms, 0)
  let t = elapsed % total
  for (const f of anim) {
    if (t < f.ms) return f.rows
    t -= f.ms
  }
  return anim[0].rows
}

// Pixel art stamps: rows of letters, each letter a color, '.' transparent
const BUBBLE = ['.WWWWWWW.', 'W.......W', 'W.......W', 'W.......W', 'W.......W', 'W.......W', 'W.......W', '.WWWWWWW.']
const BUBBLE_WIDTH = BUBBLE[0].length
const BUBBLE_TAIL_ROW = 2
const WHITE = 0xf0f0f0
const BUBBLE_ICONS = {
  food: { rows: ['.rgr.', 'rrrrr', '.rrr.', '..r..'], colors: { r: 0xd84040, g: 0x6ab04c } },
  happiness: { rows: ['pp.pp', 'ppppp', '.ppp.', '..p..'], colors: { p: 0xff6fa8 } },
  yum: { rows: ['..s..', 'sssss', '.sss.', '.s.s.'], colors: { s: 0xffd54f } },
}
const DOT_COLOR = 0x9a9ab0
const SMALL_Z = ['zzz', '.z.', 'zzz']
const BIG_Z = ['zzzz', '..z.', '.z..', 'zzzz']
const Z_COLOR = 0xe8e8ff

const stamp = (x, y, rows, colors) => ({ x, y, rows, colors })

// A stamp's color at a strip column and pixel row, or null
function stampPixel(s, cx, py) {
  const row = s.rows[py - s.y]
  if (!row) return null
  const ch = row[cx - s.x]
  return ch === undefined ? null : (s.colors[ch] ?? null)
}

// The thinking dots: one to three grey pixels, growing in turn
function dotsIcon() {
  const dots = 1 + (Math.floor((tick * TICK_MS) / 400) % 3)
  const row = ['d', '.', 'd', '.', 'd'].map((ch, i) => (i / 2 < dots ? ch : '.')).join('')
  return { rows: ['.....', '.....', row, '.....'], colors: { d: DOT_COLOR } }
}

// What the bubble beside the head shows, if anything
function bubbleIcon() {
  if (attack) return null
  if (tick < yumUntil) return BUBBLE_ICONS.yum
  if (working && thinking) return dotsIcon()
  const need = needNow()
  return need ? BUBBLE_ICONS[need] : null
}

// A framed thought bubble beside the head, on the left when there's room,
// with a single pixel of tail between it and the head
function bubbleStamps(icon, head) {
  const span = BUBBLE_WIDTH + 3
  const onLeft = head[0] - span >= 0
  const left = onLeft ? head[0] - span : head[1] + 4
  const tail = onLeft ? head[0] - 2 : head[1] + 2
  return [
    stamp(left, 0, BUBBLE, { W: WHITE }),
    stamp(tail, BUBBLE_TAIL_ROW, ['w'], { w: WHITE }),
    stamp(left + 2, 2, icon.rows, icon.colors),
  ]
}

// Two Zs drifting up beside a sleeping head: a small one, then a big one above it
function sleepStamps(head) {
  const phase = Math.floor((tick * TICK_MS) / 700) % 3
  const onLeft = head[0] - 9 >= 0
  const small = stamp(onLeft ? head[0] - 4 : head[1] + 2, 4, SMALL_Z, { z: Z_COLOR })
  const big = stamp(onLeft ? head[0] - 8 : head[1] + 5, 0, BIG_Z, { z: Z_COLOR })
  return phase === 0 ? [small] : [small, big]
}

// Stop to enjoy it, hop, and send a stream of hearts up around the sprite
function pet() {
  markActive()
  petUntil = tick + PET_TICKS
  hopStart = tick
  const width = SPRITES[mon].width
  const lowest = rowsOf(mon) * 2 - 6
  for (let k = 0; k < HEART_COUNT; k++) {
    hearts.push({
      x: x - 2 + Math.floor(Math.random() * (width + 2)),
      y: lowest - Math.floor(Math.random() * 6),
      born: tick + k * HEART_GAP_TICKS,
      rows: HEARTS[k % HEARTS.length],
      colors: { p: HEART_COLORS[k % HEART_COLORS.length], h: HEART_SHINE },
    })
  }
}

// Drop a random berry a few columns away, on whichever side has room, for the sprite to walk to
function feed() {
  markActive()
  const width = SPRITES[mon].width
  const gap = 3 + Math.floor(Math.random() * 6)
  const right = x + width + gap
  const fx = right + BERRY_SIZE <= columns ? right : Math.max(0, x - gap - BERRY_SIZE)
  const berry = BERRIES[Math.floor(Math.random() * BERRIES.length)]
  food = { x: fx, born: tick, eatStart: null, berry }
  wanderTarget = null
  return berry
}

// The berry's top pixel row: falling a pixel every few ticks until it rests on the ground
function foodTop() {
  const ground = rowsOf(mon) * 2 - BERRY_SIZE
  return Math.min(ground, -BERRY_SIZE + Math.floor((tick - food.born) / FALL_TICKS))
}

// The berry's color at a strip column and pixel row, or null. Bites take
// a column at a time from the side the sprite eats from.
function foodPixel(cx, py) {
  if (!food) return null
  const fx = cx - food.x
  const fy = py - foodTop()
  if (fx < 0 || fx >= BERRY_SIZE || fy < 0 || fy >= BERRY_SIZE) return null
  if (food.eatStart !== null) {
    const bites = Math.floor(((tick - food.eatStart) / EAT_TICKS) * BERRY_SIZE)
    const fromLeft = food.x > x
    if (fromLeft ? fx < bites : fx >= BERRY_SIZE - bites) return null
  }
  return food.berry.colors[BERRY[fy][fx]] ?? null
}

// Walk to the berry once it lands, eat it, then hop with a "yum!"
function stepFood() {
  markActive()
  const landed = foodTop() === rowsOf(mon) * 2 - BERRY_SIZE
  if (food.eatStart !== null) {
    if (tick - food.eatStart < EAT_TICKS) return
    food = null
    yumUntil = tick + YUM_TICKS
    hopStart = tick
    return
  }
  if (!landed || tick % MOVE_TICKS !== 0) return
  const target = foodTarget()
  if (target === x) {
    food.eatStart = tick
    return
  }
  facing = target < x ? 'left' : 'right'
  x += facing === 'left' ? -1 : 1
  clampX()
}

// Each heart where it is now: rising a pixel every few ticks with a slight sway
function heartStamps() {
  const out = []
  for (const heart of hearts) {
    const age = tick - heart.born
    if (age < 0) continue
    const sway = Math.floor(age / (HEART_RISE_TICKS * 3)) % 2
    out.push(stamp(heart.x + sway, heart.y - Math.floor(age / HEART_RISE_TICKS), heart.rows, heart.colors))
  }
  return out
}

// Start one of the mon's moves, aimed the way it walks, or toward the roomier side
// when it stands still. The move takes over the body, so a hop in progress stops.
function startAttack(move) {
  markActive()
  wanderTarget = null
  hopStart = -HOP_TICKS
  const room = columns - SPRITES[mon].width - x
  const side = isWalking() ? facing : x >= room ? 'left' : 'right'
  const seed = Math.floor(Math.random() * 0x7fffffff)
  const others = MONS.filter((name) => name !== mon)
  const fitting = others.filter((name) => spriteRows(name) <= spriteRows(mon))
  const pool = fitting.length > 0 ? fitting : others
  attack = {
    ...prepareAttack(move, { side, seed, x, home: homeX() }),
    start: tick,
    swap: pool[Math.floor(Math.random() * pool.length)],
  }
}

// Hold still while the attack plays, then land wherever it left the mon
function stepAttack() {
  markActive()
  if (tick - attack.start < attack.ticks) return
  if (attack.toX !== null) x = attack.toX
  facing = attack.side
  attack = null
  clampX()
}

// The first and last opaque pixel columns and rows of a frame, cached per frame
const boxes = new WeakMap()
function boxOf(rows, colors) {
  let box = boxes.get(rows)
  if (box) return box
  box = { left: Infinity, right: -1, top: Infinity, bottom: -1 }
  rows.forEach((row, py) => {
    for (let px = 0; px < row.length; px++) {
      if (colors[row[px]] === undefined) continue
      box.left = Math.min(box.left, px)
      box.right = Math.max(box.right, px)
      box.top = Math.min(box.top, py)
      box.bottom = Math.max(box.bottom, py)
    }
  })
  if (box.right < 0) box = { left: 0, right: rows[0].length - 1, top: 0, bottom: rows.length - 1 }
  boxes.set(rows, box)
  return box
}

// The strip columns the top of the sprite covers, so a bubble can sit right beside it
function headColumns(pixel, width, x) {
  let left = width
  let right = -1
  for (let py = 0; py < HEAD_PIXELS; py++) {
    for (let px = 0; px < width; px++) {
      if (pixel(px, py) === null) continue
      left = Math.min(left, px)
      right = Math.max(right, px)
    }
  }
  return right < 0 ? [x, x + width - 1] : [x + left, x + right]
}

// What the idle mon is asking for, if anything. With both low it takes turns.
function needNow() {
  if (working || food || attack || isPetted() || isAsleep() || tick < yumUntil) return null
  const needs = Object.keys(STATS).filter((key) => statNow(mon, key) < NEEDY_BELOW)
  if (needs.length === 0) return null
  return needs[Math.floor((tick * TICK_MS) / 3000) % needs.length]
}

const NO_POSE = { view: 'front', stride: false, swap: false, asleep: false }
const NO_EFFECT = {
  dots: [], under: [], chars: [], ghosts: [], hidden: false,
  dx: 0, dy: 0, sx: 1, sy: 1, flipX: false, flipY: false, skew: null, shade: null, shake: [0, 0],
}
const STRIDE_TICKS = 2

// The most common color of a frame, leaving out dark outlines and shading, cached per frame
const bodies = new WeakMap()
function bodyOf(rows, colors) {
  if (bodies.has(rows)) return bodies.get(rows)
  const counts = new Map()
  for (const row of rows) {
    for (const ch of row) if (colors[ch] !== undefined) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  let body = 0xffffff
  let most = 0
  for (const [ch, n] of counts) {
    const c = colors[ch]
    const luma = 0.3 * (c >> 16) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255)
    if (luma >= 72 && n > most) [body, most] = [c, n]
  }
  bodies.set(rows, body)
  return body
}

// Where the sprite stands in strip pixels, for aiming an attack
function attackGeometry(sprite, frame, colors, flip, at, top, rows, pixel) {
  const box = boxOf(frame, colors)
  return {
    x: at,
    left: at + (flip ? sprite.width - 1 - box.right : box.left),
    right: at + (flip ? sprite.width - 1 - box.left : box.right),
    top: top + box.top,
    bottom: top + box.bottom,
    columns,
    pixels: rows * 2,
    side: attack.side === 'left' ? -1 : 1,
    body: bodyOf(frame, colors),
    solid: (cx, py) => pixel(cx - at, py - top) !== null,
  }
}

// The attack's pixels as one color per strip pixel, -1 where it draws nothing
function overlayOf(dots, rows) {
  if (dots.length === 0) return null
  const pixels = rows * 2
  const overlay = new Int32Array(columns * pixels).fill(-1)
  for (let k = 0; k < dots.length; k += 3) {
    const cx = dots[k]
    const py = dots[k + 1]
    if (cx >= 0 && cx < columns && py >= 0 && py < pixels) overlay[py * columns + cx] = dots[k + 2]
  }
  return overlay
}

// The sprite as the effect left it: moved to left, top, each row slid by skew, then
// scaled around the middle of its feet, turned upside down, and recolored. A color
// per strip pixel, or null.
function bodyPixel(effect, pixel, box, width, mirrored, left, top) {
  const scaled = effect.sx !== 1 || effect.sy !== 1
  const sx = Math.max(0.01, effect.sx)
  const sy = Math.max(0.01, effect.sy)
  const ax = mirrored ? width - (box.left + box.right + 1) / 2 : (box.left + box.right + 1) / 2
  const ay = box.bottom + 1
  return (cx, py) => {
    let px = cx - left - (effect.skew ? Math.round(effect.skew(py)) : 0)
    let qy = py - top
    if (scaled) {
      px = Math.floor(ax + (px + 0.5 - ax) / sx)
      qy = Math.floor(ay + (qy + 0.5 - ay) / sy)
    }
    if (effect.flipY) qy = box.top + box.bottom - qy
    const c = pixel(px, qy)
    return c === null || !effect.shade ? c : effect.shade(cx, py, c)
  }
}

// The effect's afterimages, a color per strip pixel or null. A flipped ghost mirrors
// within the sprite's opaque box, so at dx 0 it covers the body.
function ghostPixel(ghosts, pixel, box, width, flip, baseX, baseTop) {
  const span = flip ? 2 * width - 2 - box.left - box.right : box.left + box.right
  return (cx, py) => {
    for (const g of ghosts) {
      const px = cx - baseX - g.dx
      const c = pixel(g.flip ? span - px : px, py - baseTop - g.dy)
      const k = c === null || !g.shade ? c : g.shade(c, cx, py)
      if (k !== null) return k
    }
    return null
  }
}

// Pack the current frame into Raster cells, two pixels per cell with half blocks
function cellsNow() {
  const age = attack ? tick - attack.start : 0
  const pose = attack ? attackPose(attack, age) : NO_POSE
  const shown = pose.swap ? attack.swap : mon
  const sprite = SPRITES[shown]
  const sheet = sprite.variants[variant]
  const walking = isWalking()
  // A move faces its target side on, with the walk frames held still unless it strides
  const sideOn = attack ? pose.view === 'side' : walking
  const anim = sideOn ? sheet.walk : sheet.idle
  const asleep = isAsleep() || pose.asleep
  let frame = frameAt(anim, tick * TICK_MS)
  if (asleep) frame = anim[0].rows
  else if (attack && sideOn) frame = anim[pose.stride ? Math.floor(age / STRIDE_TICKS) % anim.length : 0].rows
  const colors = COLORS[shown][variant]
  // Facing out, the sprite stays unmirrored like the idle mon, so it doesn't jump when the move ends
  const flip = attack ? sideOn && attack.side === 'left' : walking && facing === 'left'
  const rows = rowsOf(mon)
  // A swapped-in mon stands on the same ground and stays inside the strip
  const baseTop = (rows - spriteRows(shown)) * 2
  const baseX = Math.max(0, Math.min(x, columns - sprite.width))
  const pixelOf = (mirror) => (px, py) => {
    if (px < 0 || px >= sprite.width || py < 0) return null
    const row = frame[py]
    if (!row) return null
    return colors[row[mirror ? sprite.width - 1 - px : px]] ?? null
  }
  const pixel = pixelOf(flip)
  const effect = attack ? attackFrame(attack, age, attackGeometry(sprite, frame, colors, flip, baseX, baseTop, rows, pixel)) : NO_EFFECT
  const overlay = overlayOf(effect.dots, rows)
  const underlay = overlayOf(effect.under, rows)
  const hopUp = !attack && isHopping() && Math.floor((tick - hopStart) / 3) % 2 === 0
  const top = baseTop + effect.dy - (hopUp ? 2 : 0)
  const left = baseX + effect.dx
  const mirrored = flip !== effect.flipX
  const box = boxOf(frame, colors)
  const body = bodyPixel(effect, pixelOf(mirrored), box, sprite.width, mirrored, left, top)
  const ghost = ghostPixel(effect.ghosts, pixel, box, sprite.width, flip, baseX, baseTop)
  const head = headColumns(pixel, sprite.width, left)
  const icon = bubbleIcon()
  const floating = new Map()
  const over = heartStamps()
  for (let k = 0; k < effect.chars.length; k += 4) {
    floating.set(effect.chars[k] + ',' + effect.chars[k + 1], [effect.chars[k + 2], effect.chars[k + 3]])
  }
  const under = [...(icon ? bubbleStamps(icon, head) : []), ...(asleep ? sleepStamps(head) : [])]
  const pixels = rows * 2
  const colorAt = (cx, py) => {
    if (py < 0 || py >= pixels) return null
    const i = py * columns + cx
    if (overlay && overlay[i] >= 0) return overlay[i]
    for (const s of over) {
      const h = stampPixel(s, cx, py)
      if (h !== null) return h
    }
    const c = effect.hidden ? null : body(cx, py)
    if (c !== null) return c
    if (effect.ghosts.length > 0) {
      const g = ghost(cx, py)
      if (g !== null) return g
    }
    if (underlay && underlay[i] >= 0) return underlay[i]
    const f = foodPixel(cx, py)
    if (f !== null) return f
    for (const s of under) {
      const u = stampPixel(s, cx, py)
      if (u !== null) return u
    }
    return null
  }

  const [shakeX, shakeY] = effect.shake
  const words = new Uint32Array(columns * rows * 3)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < columns; cx++) {
      const i = (cy * columns + cx) * 3
      const sx = cx - shakeX
      if (sx < 0 || sx >= columns) {
        words.set([SPACE, DEFAULT_COLOR, DEFAULT_COLOR], i)
        continue
      }
      const upper = colorAt(sx, cy * 2 - shakeY)
      const lower = colorAt(sx, cy * 2 + 1 - shakeY)
      const glyph = floating.get(sx + ',' + cy)
      if (glyph) words.set([glyph[0], glyph[1], upper ?? lower ?? DEFAULT_COLOR], i)
      else if (upper !== null) words.set([UPPER_HALF, upper, lower ?? DEFAULT_COLOR], i)
      else if (lower !== null) words.set([LOWER_HALF, lower, DEFAULT_COLOR], i)
      else words.set([SPACE, DEFAULT_COLOR, DEFAULT_COLOR], i)
    }
  }
  return new Uint8Array(words.buffer).toBase64()
}

// Keep the sprite inside the strip
function clampX() {
  x = Math.max(0, Math.min(homeX(), x))
}

// Pick the next spot to stroll to once the rest is over
function planWander() {
  if (!wander || working || wanderTarget !== null || tick < restUntil) return
  wanderTarget = Math.floor(Math.random() * (homeX() + 1))
}

// Advance the clock and move one column every few ticks: pacing while
// working, heading for the idle target otherwise
function step() {
  tick += 1
  nowMs += TICK_MS
  hearts = hearts.filter((heart) => tick - heart.born <= (heart.y + heart.rows.length) * HEART_RISE_TICKS)
  if (attack) return stepAttack()
  if (food) return stepFood()
  if (working) markActive()
  planWander()
  if (tick % MOVE_TICKS !== 0) return

  if (working) {
    if (facing === 'left' && x <= 0) facing = 'right'
    else if (facing === 'right' && isHome()) facing = 'left'
  } else {
    const target = idleTarget()
    if (target === x) {
      if (wanderTarget !== null) {
        wanderTarget = null
        restUntil = tick + REST_TICKS[0] + Math.floor(Math.random() * (REST_TICKS[1] - REST_TICKS[0]))
      }
      return
    }
    facing = target < x ? 'left' : 'right'
  }
  x += facing === 'left' ? -1 : 1
  clampX()
}

// Each stat drains from full to empty over its hours, per mon, and keeps
// draining while Claude Code is closed because it's stored with a timestamp
const STATS = {
  food: { hoursToEmpty: 8, icon: '●', emptyIcon: '○', color: '#ea697d' },
  happiness: { hoursToEmpty: 12, icon: '❤', emptyIcon: '♡', color: '#ff5f9e' },
}
const START_STAT = 80
const FEED_FOOD = 35
const FEED_HAPPINESS = 5
const PET_HAPPINESS = 25
const NEEDY_BELOW = 30
const STAT_ICONS = 5
const STAT_REDRAW_TICKS = 1200

const clampStat = (v) => Math.max(0, Math.min(100, v))

function statNow(name, key) {
  const saved = stats[name]?.[key]
  if (!saved) return START_STAT
  const perMs = 100 / (STATS[key].hoursToEmpty * 3600 * 1000)
  return clampStat(saved.value - perMs * (nowMs - saved.at))
}

function bumpStat(key, amount) {
  stats[mon] = { ...stats[mon], [key]: { value: clampStat(statNow(mon, key) + amount), at: nowMs } }
}

// Five icons, each worth 20%, rounding up so any food or love left shows at least one.
function iconsFor(key) {
  const filled = Math.ceil(statNow(mon, key) / (100 / STAT_ICONS))
  return STATS[key].icon.repeat(filled) + STATS[key].emptyIcon.repeat(STAT_ICONS - filled)
}

const OPTIONS = ['<mon>', ...VARIANTS, 'wander', 'pet', 'feed', 'attack', 'list']
const PET_LINES = ['loves it', 'wiggles happily', 'leans into your hand', 'does a little hop', 'looks very pleased']

const FALLBACK_MOVES = [{ name: 'Tackle', effect: 'tackle' }]
const moveKey = (name) => name.toLowerCase().replace(/[\s\-_'.]/g, '')

// Play a random move, or the one named, and announce it
function attackCommand(wanted) {
  const name = displayName(mon)
  if (attack) return { text: name + ' is still attacking.' }
  if (food) return { text: name + ' is busy eating.' }
  const known = movesOf(mon)
  const moves = known.length > 0 ? known : FALLBACK_MOVES
  const move = wanted ? moves.find((m) => moveKey(m.name) === moveKey(wanted)) : moves[Math.floor(Math.random() * moves.length)]
  if (!move) return { text: name + ' doesn\'t know "' + wanted + '". Its moves: ' + moves.map((m) => m.name).join(', ') + '.' }
  startAttack(move)
  return { text: name + ' used ' + move.name + '!' + (move.text ? '\n' + move.text : '') }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pokemon',
      description: 'Pick the Pokémon above the prompt, switch it to shiny, let it wander, pet it, feed it, or make it attack',
      argumentHint: '[' + OPTIONS.join('|') + ']',
      immediate: true,
    })
    const savedMon = await $.store.get('mon')
    if (MONS.includes(savedMon)) mon = savedMon
    const savedVariant = await $.store.get('variant')
    if (VARIANTS.includes(savedVariant)) variant = savedVariant
    wander = (await $.store.get('wander')) !== false
    const savedStats = await $.store.get('stats')
    if (savedStats && typeof savedStats === 'object') stats = savedStats
    nowMs = await $.clock.now()
    $.clock.every(TICK_MS, () => {
      step()
      if (tick % STAT_REDRAW_TICKS === 0) $.ui.invalidate('ui.render')
      if (bandId !== null) {
        $.ui.blit({ requestId: bandId, key: 'pokemon', columns, rows: rowsOf(mon), cells: cellsNow() })
      }
    })
    return next(e)
  })

  on('command.run', { command: 'pokemon' }, async ($, e) => {
    markActive()
    nowMs = await $.clock.now()
    const asked = e.args.trim().toLowerCase()
    if (MONS.includes(asked)) {
      const wasHome = isHome()
      mon = asked
      if (wasHome) x = homeX()
      clampX()
      await $.store.set('mon', mon)
    } else if (VARIANTS.includes(asked)) {
      variant = asked
      await $.store.set('variant', variant)
    } else if (asked === 'wander') {
      wander = !wander
      wanderTarget = null
      await $.store.set('wander', wander)
      return { text: wander ? mon + ' is free to wander.' : mon + ' is heading home.' }
    } else if (asked === 'pet') {
      pet()
      bumpStat('happiness', PET_HAPPINESS)
      await $.store.set('stats', stats)
      $.ui.invalidate('ui.render')
      const pets = Number((await $.store.get('pets')) ?? 0) + 1
      await $.store.set('pets', pets)
      const line = PET_LINES[Math.floor(Math.random() * PET_LINES.length)]
      return { text: mon + ' ' + line + ' ❤ (pets: ' + pets + ')' }
    } else if (asked === 'feed') {
      if (food) return { text: mon + ' is still busy with the last one.' }
      const berry = feed()
      bumpStat('food', FEED_FOOD)
      bumpStat('happiness', FEED_HAPPINESS)
      await $.store.set('stats', stats)
      $.ui.invalidate('ui.render')
      const feeds = Number((await $.store.get('feeds')) ?? 0) + 1
      await $.store.set('feeds', feeds)
      const article = /^[aeiou]/.test(berry.name) ? 'an ' : 'a '
      return { text: 'You toss ' + mon + ' ' + article + berry.name + ' ' + berry.emoji + ' (feeds: ' + feeds + ')' }
    } else if (asked === 'attack' || asked.startsWith('attack ')) {
      return attackCommand(asked.slice('attack'.length).trim())
    } else if (asked === 'list') {
      return { text: MONS.length + ' mons: ' + MONS.join(', ') }
    } else if (asked) {
      return { text: 'Unknown option "' + asked + '". Try one of: ' + OPTIONS.join(', ') + '. See /pokemon list for every mon.' }
    } else {
      const mode = wander ? ', wandering' : ''
      const levels = 'food ' + Math.round(statNow(mon, 'food')) + '%, happiness ' + Math.round(statNow(mon, 'happiness')) + '%'
      return { text: 'Showing ' + variant + ' ' + mon + mode + ' (' + levels + '). Options: ' + OPTIONS.join(', ') + '.' }
    }
    $.ui.invalidate('ui.render')
    return { text: 'Now showing ' + variant + ' ' + mon + '.' }
  })

  // Typing or sending a prompt wakes the mon up
  on('prompt.edit', async ($, e, next) => {
    markActive()
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    markActive()
    return next(e)
  })

  // Read what the turn is doing from the spinner, and draw the spinner as usual
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    thinking = e.props.mode === 'thinking'
    return next(e)
  })

  // Hop when the main agent's turn ends, unless it was interrupted
  on('turn.complete', async ($, e, next) => {
    thinking = false
    markActive()
    if (!e.agentId && !e.isAborted) hopStart = tick
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) {
      bandId = null
      return next(e)
    }
    const { Box, Raster, Text } = $.ui.resolve(e)
    const wasHome = isHome()
    working = e.props.isWorking
    if (!working) thinking = false
    bandId = e.requestId
    columns = Math.max(SPRITES[mon].width, Math.min(STRIP_COLUMNS, e.props.bodyColumns))
    if (wasHome) x = homeX()
    clampX()

    const sprite = Raster({ key: 'pokemon', columns, rows: rowsOf(mon), cells: cellsNow() })
    const meter = (key) => Text({ color: STATS[key].color, children: [iconsFor(key)] })
    const meters = Box({
      flexDirection: 'column',
      justifyContent: 'flex-end',
      paddingLeft: 1,
      children: [meter('food'), meter('happiness')],
    })
    const corner = e.props.bodyColumns >= columns + STAT_ICONS + 1 ? [sprite, meters] : [sprite]

    const theirs = await next(e)
    return Box({
      flexDirection: 'row',
      justifyContent: theirs ? 'space-between' : 'flex-end',
      children: theirs ? [Box({ flexGrow: 1, children: [theirs] }), ...corner] : corner,
    })
  })
}
