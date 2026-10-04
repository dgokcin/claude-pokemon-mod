import { attackFrame, attackPose, prepareAttack } from './attacks.js'
import { evolutionsOf, levelEvolutionOf, startLevel } from './evolutions.js'
import { SPRITES } from './frames.js'
import { MAX_LEVEL, careOf, levelAt, turnXp, xpAt } from './levels.js'
import { movesOf } from './moves.js'
import { displayName } from './names.js'
import { joinParty, leaveParty, partyStamps, prunedParty } from './party.js'
import { zoomFor, zoomedAt, zoomedPixel } from './zoom.js'

// One pixel Pokémon lives in a strip at the right of the band above the prompt.
// While Claude works it paces, with a thought bubble while Claude thinks. It
// hops when a turn ends, then wanders while idle (or stays at the right edge,
// after /pokemon wander) and falls asleep after five quiet minutes.
// /pokemon pet makes pixel hearts float up, and /pokemon feed drops a random pixel
// berry for it to walk over and eat. Food and happiness drain over real time,
// shown as pink ●●●○○ and ❤❤❤♡♡ at the right edge, so it needs both now and then.
// /pokemon attack plays one of its moves, with the animations in attacks.js.
// While a tool runs, the bubble shows it, and when Claude waits on you the mon stops
// and shows a "!". Each running subagent is a Poké Ball along the left of the strip.
// Answered turns earn XP, and the mon evolves at the levels from the games.
// The mon, hearts, berries, bubbles, balls, and Zs are pixels in one Raster, two per cell.

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
// Colors the band draws straight on the terminal background, one set per theme
const INKS = {
  dark: {
    bubble: 0xf0f0f0, dots: 0x9a9ab0, z: 0xe8e8ff, star: 0xffd54f, silhouette: 0xf8f8ff,
    pencil: 0xffc83d, lens: 0x6cc4ff, shell: 0x5fe08a, ball: 0xeeeef6, wrench: 0xb8b8c8, party: 0xb4b4c8,
  },
  light: {
    bubble: 0x4a4a58, dots: 0x70708a, z: 0x5a5aa8, star: 0xe0a000, silhouette: 0x2e2e3a,
    pencil: 0xe08a00, lens: 0x2a7ad0, shell: 0x1f9a4a, ball: 0xa8a8b4, wrench: 0x6a6a80, party: 0x5c5c74,
  },
}
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
const runningTools = new Map()
let toolCalls = 0
const alertTools = new Set()
let alertUntil = 0
let idleAlertAt = null
let party = []
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
let needsOn = true
let evolving = null
let evolveDue = null
let joyHopAt = null
let ink = INKS.dark
let sentCells = null
let maxRows = Infinity

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
// While a mon evolves, the band is tall enough for both shapes
const bandRows = () => (evolving ? Math.max(rowsOf(evolving.from), rowsOf(evolving.into)) : rowsOf(mon))
// The band's size on screen, shrunk to fit a short pane, or null when only the badge fits
const bandZoom = () => zoomFor({ columns, rows: bandRows(), maxRows })

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
  if (attack || isAlerted()) return false
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
const BUBBLE_ICONS = {
  food: { rows: ['.rgr.', 'rrrrr', '.rrr.', '..r..'], colors: { r: 0xd84040, g: 0x6ab04c } },
  happiness: { rows: ['pp.pp', 'ppppp', '.ppp.', '..p..'], colors: { p: 0xff6fa8 } },
}
const STAR = ['..s..', 'sssss', '.sss.', '.s.s.']
const SMALL_Z = ['zzz', '.z.', 'zzz']
const BIG_Z = ['zzzz', '..z.', '.z..', 'zzzz']
// The "!" of a trainer who spots you, shown while Claude waits on you
const ALERT_ICON = { rows: ['..a..', '..a..', '.....', '..a..'], colors: { a: 0xff3d3d } }
// What the bubble shows while a tool runs: a pencil (p body, e eraser, t wood, g lead),
// a magnifier (l rim, h handle), a shell prompt (s), a Poké Ball (r top, k band,
// w button, b bottom), or a wrench (m) for every other tool, MCP tools included
const TOOL_ICONS = {
  pencil: ['...pe', '..pp.', '.pp..', 'gt...'],
  lens: ['.ll..', 'l..l.', '.llh.', '....h'],
  shell: ['s....', '.s...', 's....', '..sss'],
  ball: ['.rrr.', 'rrrrr', 'kkwkk', '.bbb.'],
  wrench: ['..m.m', '..mmm', '.m...', 'm....'],
}
const TOOL_KINDS = {
  pencil: ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'],
  lens: ['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'ToolSearch', 'LSP'],
  shell: ['Bash', 'PowerShell', 'Monitor', 'BashOutput', 'KillShell'],
  ball: ['Agent', 'Task', 'SendMessage', 'Workflow'],
}
// Tools that ask you something, and notifications that wait on you
const QUESTION_TOOLS = ['AskUserQuestion', 'ExitPlanMode']
const ALERT_NOTIFICATIONS = ['permission_prompt', 'worker_permission_prompt', 'agent_needs_input', 'elicitation_dialog']
// A minute after a turn with no word from you, the "!" shows for two
const IDLE_WAIT_MS = 60 * 1000
const IDLE_ALERT_MS = 2 * 60 * 1000

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
  return { rows: ['.....', '.....', row, '.....'], colors: { d: ink.dots } }
}

// The icon of the main loop's most recently started tool that is still running
function toolIcon() {
  const name = [...runningTools.values()].pop()
  const kind = Object.keys(TOOL_KINDS).find((k) => TOOL_KINDS[k].includes(name)) ?? 'wrench'
  const colors = {
    p: ink.pencil, e: 0xf27a98, t: 0xd09860, g: 0x767688,
    l: ink.lens, h: 0xb07040,
    s: ink.shell,
    r: 0xee4444, k: 0x60606c, w: 0xfafafc, b: ink.ball,
    m: ink.wrench,
  }
  return { rows: TOOL_ICONS[kind], colors }
}

// What the bubble beside the head shows, if anything
function bubbleIcon() {
  if (attack) return null
  if (isAlerted()) return ALERT_ICON
  if (tick < yumUntil) return { rows: STAR, colors: { s: ink.star } }
  if (working && runningTools.size > 0) return toolIcon()
  if (working && thinking) return dotsIcon()
  const need = needsOn && needNow()
  return need ? BUBBLE_ICONS[need] : null
}

// The mon calls you over while a dialog waits on a call to one of alertTools,
// or until a notification's alert runs out at alertUntil
const isAlerted = () => alertTools.size > 0 || tick < alertUntil

// Wake up, stand still facing you, and show the "!" until a call to the tool
// resolves or the ticks run out, or until you answer first
function raiseAlert({ tool, ticks }) {
  markActive()
  if (tool !== undefined) alertTools.add(tool)
  if (ticks !== undefined) alertUntil = Math.max(alertUntil, tick + ticks)
}

// Typing, sending, any /pokemon command, or the end of Claude's turn answers the "!",
// and the idle "!" waiting to show
function clearAlert() {
  alertTools.clear()
  alertUntil = 0
  idleAlertAt = null
}

// Raise the idle "!" once its minute is up, unless a turn is running by then
function stepIdleAlert() {
  if (idleAlertAt === null || tick < idleAlertAt) return
  idleAlertAt = null
  if (!working) raiseAlert({ ticks: IDLE_ALERT_MS / TICK_MS })
}

// A framed thought bubble beside the head, on the left when there's room,
// with a single pixel of tail between it and the head
function bubbleStamps(icon, head) {
  const span = BUBBLE_WIDTH + 3
  const onLeft = head[0] - span >= 0
  const left = onLeft ? head[0] - span : head[1] + 4
  const tail = onLeft ? head[0] - 2 : head[1] + 2
  return [
    stamp(left, 0, BUBBLE, { W: ink.bubble }),
    stamp(tail, BUBBLE_TAIL_ROW, ['w'], { w: ink.bubble }),
    stamp(left + 2, 2, icon.rows, icon.colors),
  ]
}

// Two Zs drifting up beside a sleeping head: a small one, then a big one above it
function sleepStamps(head) {
  const phase = Math.floor((tick * TICK_MS) / 700) % 3
  const onLeft = head[0] - 9 >= 0
  const small = stamp(onLeft ? head[0] - 4 : head[1] + 2, 4, SMALL_Z, { z: ink.z })
  const big = stamp(onLeft ? head[0] - 8 : head[1] + 5, 0, BIG_Z, { z: ink.z })
  return phase === 0 ? [small] : [small, big]
}

// Stop to enjoy it, hop, and send a stream of hearts up around the sprite
function pet() {
  markActive()
  petUntil = tick + PET_TICKS
  hopStart = tick
  const width = SPRITES[mon].width
  const lowest = bandRows() * 2 - 6
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
  const ground = bandRows() * 2 - BERRY_SIZE
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
  const landed = foodTop() === bandRows() * 2 - BERRY_SIZE
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

// The strip edge behind a mon aiming at side, where it backs up to before the move
const edgeBehind = (side) => (side === 'left' ? homeX() : 0)

const isBackingUp = () => attack !== null && attack.backing === true

// Start one of the mon's moves, aimed at the roomier side. A move aimed ahead first
// backs the mon up to the edge behind it, so it plays with the whole strip ahead, the
// way it was tuned. A move on itself plays where the mon stands. The move takes over
// the body, so a hop in progress stops.
function startAttack(move) {
  markActive()
  clampX()
  wanderTarget = null
  hopStart = -HOP_TICKS
  const side = x >= homeX() - x ? 'left' : 'right'
  const seed = Math.floor(Math.random() * 0x7fffffff)
  const others = MONS.filter((name) => name !== mon)
  const fitting = others.filter((name) => spriteRows(name) <= spriteRows(mon))
  const pool = fitting.length > 0 ? fitting : others
  const aimed = attackPose(prepareAttack(move, { side, seed, x, home: homeX() }), 0).view === 'side'
  attack = { move, side, seed, start: tick, backing: true, swap: pool[Math.floor(Math.random() * pool.length)] }
  if (!aimed || x === edgeBehind(side)) playMove()
}

// Settle the move from where the mon stands now, and start it
function playMove() {
  const { move, side, seed } = attack
  Object.assign(attack, prepareAttack(move, { side, seed, x, home: homeX() }), { start: tick, backing: false })
}

// Back up a pixel a tick and start the move at the edge, hold still while it plays,
// then land wherever it left the mon
function stepAttack() {
  markActive()
  if (isBackingUp()) {
    x += Math.sign(edgeBehind(attack.side) - x)
    if (x === edgeBehind(attack.side)) playMove()
    return
  }
  if (tick - attack.start < attack.ticks) return
  if (attack.toX !== null) x = attack.toX
  facing = attack.side
  attack = null
  clampX()
}

// A due evolution waits until the mon is idle, awake, not calling you over, and done
// with any move or berry
const isFree = () => !working && !attack && !food && !isAsleep() && !isAlerted()

// Petting, feeding, attacking, and switching mons wait while it evolves
const WAITS_FOR_EVOLUTION = ['pet', 'feed', 'attack']
const waitsForEvolution = (asked) => evolving !== null && (MONS.includes(asked) || WAITS_FOR_EVOLUTION.includes(asked.split(' ')[0]))

// Play the evolve effect with the evolved mon swapped in, in a band grown to fit both
function startEvolution($, into) {
  $.ui.toast('What? ' + displayName(mon) + ' is evolving!')
  startAttack({ effect: 'evolve', color: ink.silhouette })
  attack.swap = into
  evolving = { from: mon, into }
  evolveDue = null
  $.ui.invalidate('ui.render')
}

// Start a due evolution once the mon is free, and finish one whose effect is over
function stepEvolution($) {
  if (evolving && !attack) finishEvolution($)
  else if (evolveDue && isFree()) startEvolution($, evolveDue)
}

// The mon becomes the evolved one. Its record moves along, so level, XP, and meters carry over.
function finishEvolution($) {
  const { from, into } = evolving
  const wasHome = isHome()
  evolving = null
  mon = into
  if (wasHome) x = homeX()
  clampX()
  stats[into] = { ...stats[from], xp: xpOf(from) }
  delete stats[from]
  $.store.set('mon', mon).catch((err) => logOnce($, err))
  $.store.set('stats', stats).catch((err) => logOnce($, err))
  $.ui.toast('Congratulations! Your ' + displayName(from) + ' evolved into ' + displayName(into) + '!')
  $.ui.invalidate('ui.render')
}

// Call off an evolution under way or due. The mon stays as it is.
function stopEvolution($) {
  const name = displayName(mon)
  if (!evolving && !evolveDue) return { text: name + ' isn\'t evolving.' }
  if (evolving) attack = null
  evolving = null
  evolveDue = null
  $.ui.invalidate('ui.render')
  return { text: 'Huh? ' + name + ' stopped evolving!' }
}

// Joins items as "A", "A or B", or "A, B, or C"
const orList = (items) => (items.length < 3 ? items.join(' or ') : items.slice(0, -1).join(', ') + ', or ' + items.at(-1))

// How one entry evolves the mon, like "Jolteon with a Thunder Stone"
function evolutionText(entry) {
  const into = displayName(entry.into)
  if (entry.item) return into + ' with a ' + entry.item
  return entry.trade ? into + ' by trade' : into + ' at Lv. ' + entry.level
}

// A stone, a trade, or a level the mon has reached starts its evolution now. Several
// ways and none named get a list.
function evolveCommand($, wanted) {
  const name = displayName(mon)
  const entries = evolutionsOf(mon)
  if (entries.length === 0) return { text: name + ' doesn\'t evolve.' }
  if (attack || food) return { text: name + ' is busy right now.' }
  const picked = wanted ? entries.filter((entry) => moveKey(entry.into) === moveKey(wanted)) : entries
  if (picked.length !== 1) {
    const example = entries[Math.floor(Math.random() * entries.length)].into
    return { text: name + ' can become ' + orList(entries.map(evolutionText)) + '. Try /pokemon evolve ' + example + '.' }
  }
  const [entry] = picked
  const level = levelOf(mon)
  if (entry.level && level < entry.level) {
    return { text: name + ' evolves into ' + displayName(entry.into) + ' at Lv. ' + entry.level + '. It\'s Lv. ' + level + '.' }
  }
  startEvolution($, entry.into)
  if (entry.item) return { text: 'You use a ' + entry.item + ' on ' + name + '.' }
  if (entry.trade) return { text: 'You trade ' + name + ' to a friend, and they trade it right back.' }
  return { text: 'You let ' + name + ' evolve.' }
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
// Backing up for a move: side on and striding, facing the target
const BACKING_POSE = { ...NO_POSE, view: 'side', stride: true }
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
  const playing = attack !== null && !isBackingUp()
  const age = attack ? tick - attack.start : 0
  const pose = playing ? attackPose(attack, age) : attack ? BACKING_POSE : NO_POSE
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
  const rows = bandRows()
  // A swapped-in mon stands on the same ground and stays inside the strip. An evolving
  // mon at home keeps to the right edge in either shape.
  const baseTop = (rows - spriteRows(shown)) * 2
  const baseX = Math.max(0, Math.min(evolving && isHome() ? columns : x, columns - sprite.width))
  const pixelOf = (mirror) => (px, py) => {
    if (px < 0 || px >= sprite.width || py < 0) return null
    const row = frame[py]
    if (!row) return null
    return colors[row[mirror ? sprite.width - 1 - px : px]] ?? null
  }
  const pixel = pixelOf(flip)
  const effect = playing ? attackFrame(attack, age, attackGeometry(sprite, frame, colors, flip, baseX, baseTop, rows, pixel)) : NO_EFFECT
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
  const over = heartStamps()
  const balls = partyStamps(party, tick, { columns, ground: rows * 2 - 1, label: ink.party })
  const under = [...(icon ? bubbleStamps(icon, head) : []), ...(asleep ? sleepStamps(head) : []), ...balls]
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

  // Shake the full-size scene, then shrink it to the band's size on screen
  const [shakeX, shakeY] = effect.shake
  const zoom = bandZoom() ?? { scale: 1, columns, rows }
  const shaken = (cx, py) => (cx - shakeX < 0 || cx - shakeX >= columns ? null : colorAt(cx - shakeX, py - shakeY))
  const at = zoomedPixel(shaken, { columns, pixels, scale: zoom.scale })
  const glyphs = new Map()
  for (let k = 0; k < effect.chars.length; k += 4) {
    const gx = zoomedAt(effect.chars[k] + shakeX, zoom.scale)
    glyphs.set(gx + ',' + zoomedAt(effect.chars[k + 1], zoom.scale), [effect.chars[k + 2], effect.chars[k + 3]])
  }
  const words = new Uint32Array(zoom.columns * zoom.rows * 3)
  for (let cy = 0; cy < zoom.rows; cy++) {
    for (let cx = 0; cx < zoom.columns; cx++) {
      const i = (cy * zoom.columns + cx) * 3
      const upper = at(cx, cy * 2)
      const lower = at(cx, cy * 2 + 1)
      const glyph = glyphs.get(cx + ',' + cy)
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
  party = prunedParty(party, tick)
  stepIdleAlert()
  if (attack) return stepAttack()
  // Calling you over, it stays awake and stands still, even with a berry to eat
  if (isAlerted()) return markActive()
  if (food) return stepFood()
  if (working) markActive()
  planWander()
  hopForJoy()
  if (tick % moveTicks() !== 0) return

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
const HUNGRY_MOVE_TICKS = 5
const HAPPY_FROM = 80
const JOY_HOP_TICKS = [400, 800]

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

// XP lives in each mon's record. A mon that hasn't earned any starts at its first level.
const xpOf = (name) => stats[name]?.xp ?? xpAt(startLevel(name))
const levelOf = (name) => levelAt(xpOf(name))

// The level line above the meters, five columns wide like them
const levelLine = () => (levelOf(mon) < MAX_LEVEL ? 'Lv ' : 'Lv') + levelOf(mon)

// An answered turn earns XP, scaled by care. A level-up toasts the new level once, and
// an evolution it reaches is due.
async function gainXp($, durationMs) {
  nowMs = await $.clock.now()
  const was = levelOf(mon)
  const care = needsOn ? careOf(statNow(mon, 'food'), statNow(mon, 'happiness')) : 1
  stats[mon] = { ...stats[mon], xp: xpOf(mon) + turnXp({ level: was, durationMs, care }) }
  await $.store.set('stats', stats)
  const level = levelOf(mon)
  if (level === was) return
  $.ui.toast(displayName(mon) + ' grew to Lv. ' + level + '!')
  $.ui.invalidate('ui.render')
  const evolution = levelEvolutionOf(mon)
  if (evolution && level >= evolution.level && !evolving) evolveDue = evolution.into
}

// Like "Pikachu, Lv. 12, 1820 XP (377 to Lv. 13). Can become Raichu with a Thunder Stone.
// Food 50%, happiness 67%. 12 pets, 5 feeds."
async function statsText($) {
  const level = levelOf(mon)
  const next = level < MAX_LEVEL ? ' (' + (xpAt(level + 1) - xpOf(mon)) + ' to Lv. ' + (level + 1) + ')' : ''
  const evolutions = evolutionsOf(mon)
  const becomes = evolutions.length > 0 ? ' Can become ' + orList(evolutions.map(evolutionText)) + '.' : ''
  const meters = needsOn
    ? ' Food ' + Math.round(statNow(mon, 'food')) + '%, happiness ' + Math.round(statNow(mon, 'happiness')) + '%.'
    : ' Needs are off.'
  const pets = Number((await $.store.get('pets')) ?? 0)
  const feeds = Number((await $.store.get('feeds')) ?? 0)
  return displayName(mon) + ', Lv. ' + level + ', ' + xpOf(mon) + ' XP' + next + '.' + becomes + meters + ' ' + pets + ' pets, ' + feeds + ' feeds.'
}

// A hungry mon drags its feet, except on its way to a berry
const moveTicks = () => (needsOn && statNow(mon, 'food') < NEEDY_BELOW ? HUNGRY_MOVE_TICKS : MOVE_TICKS)

// A happy mon hops for joy every 20 to 40 seconds while idle and awake
function hopForJoy() {
  if (!needsOn || working || isAsleep() || statNow(mon, 'happiness') < HAPPY_FROM) {
    joyHopAt = null
  } else if (joyHopAt === null) {
    joyHopAt = tick + JOY_HOP_TICKS[0] + Math.floor(Math.random() * (JOY_HOP_TICKS[1] - JOY_HOP_TICKS[0]))
  } else if (tick >= joyHopAt) {
    hopStart = tick
    joyHopAt = null
  }
}

const OPTIONS = ['<mon>', ...VARIANTS, 'wander', 'needs', 'pet', 'feed', 'attack', 'moves', 'evolve', 'stop', 'stats', 'list']
const PET_LINES = ['loves it', 'wiggles happily', 'leans into your hand', 'does a little hop', 'looks very pleased']

const FALLBACK_MOVES = [{ name: 'Tackle', effect: 'tackle' }]
const moveKey = (name) => name.toLowerCase().replace(/[\s\-_'.]/g, '')

// A mon's moves, like "Pikachu knows Thunderbolt, Quick Attack, Thunder, Agility."
function movesText(name) {
  const known = movesOf(name)
  const moves = known.length > 0 ? known : FALLBACK_MOVES
  return { text: displayName(name) + ' knows ' + moves.map((m) => m.name).join(', ') + '.' }
}

// Play a random move, or the one named, and announce it. "list" lists the moves instead.
function attackCommand(wanted) {
  const name = displayName(mon)
  if (wanted === 'list') return movesText(mon)
  if (attack) return { text: name + ' is still attacking.' }
  if (food) return { text: name + ' is busy eating.' }
  const known = movesOf(mon)
  const moves = known.length > 0 ? known : FALLBACK_MOVES
  const move = wanted ? moves.find((m) => moveKey(m.name) === moveKey(wanted)) : moves[Math.floor(Math.random() * moves.length)]
  if (!move) return { text: name + ' doesn\'t know "' + wanted + '". Its moves: ' + moves.map((m) => m.name).join(', ') + '.' }
  startAttack(move)
  return { text: name + ' used ' + move.name + '!' + (move.text ? '\n' + move.text : '') }
}

// Send the frame only when it differs from the last one sent or drawn. A resize can
// remount the band, and the host then refuses frames for the old one, so a refused
// frame asks for a redraw, at most once a second, which draws the band anew.
const REDRAW_AFTER_REFUSAL_TICKS = 20
let refusedAt = -Infinity
function blitFrame($) {
  const zoom = bandZoom()
  if (!zoom) return
  const cells = cellsNow()
  if (cells === sentCells) return
  sentCells = cells
  $.ui
    .blit({ requestId: bandId, key: 'pokemon', columns: zoom.columns, rows: zoom.rows, cells })
    .then((result) => {
      if (!result?.deny) return
      sentCells = null
      if (tick - refusedAt < REDRAW_AFTER_REFUSAL_TICKS) return
      refusedAt = tick
      logOnce($, 'frame refused: ' + result.deny)
      $.ui.invalidate('ui.render')
    })
    .catch((err) => logOnce($, err))
}

// Ticks stop while the machine sleeps, so the meters resync with the real clock
async function resyncMeters($) {
  nowMs = await $.clock.now()
  $.ui.invalidate('ui.render')
}

// A broken frame goes to the debug log, each distinct message once
const logged = new Set()
function logOnce($, err) {
  const message = String(err?.message ?? err)
  if (logged.has(message)) return
  logged.add(message)
  $.ui.log('pokemon: ' + message, { to: 'debug' })
}

// Any light theme takes the light ink. Every other theme, or none, takes the dark.
const inkFor = (theme) => (typeof theme === 'string' && theme.startsWith('light') ? INKS.light : INKS.dark)

async function themeInk($) {
  try {
    const rows = await $.config.list()
    return inkFor(rows.find((row) => row.key === 'theme')?.value)
  } catch {
    return INKS.dark
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pokemon',
      description: 'Pick the Pokémon above the prompt, pet it, feed it, make it attack, list its moves, or evolve it',
      argumentHint: '[' + OPTIONS.join('|') + ']',
      immediate: true,
    })
    const savedMon = await $.store.get('mon')
    if (MONS.includes(savedMon)) mon = savedMon
    const savedVariant = await $.store.get('variant')
    if (VARIANTS.includes(savedVariant)) variant = savedVariant
    wander = (await $.store.get('wander')) !== false
    needsOn = (await $.store.get('needs')) !== false
    const savedStats = await $.store.get('stats')
    if (savedStats && typeof savedStats === 'object') stats = savedStats
    nowMs = await $.clock.now()
    ink = await themeInk($)
    $.clock.every(TICK_MS, () => {
      try {
        step()
        stepEvolution($)
        if (tick % STAT_REDRAW_TICKS === 0) resyncMeters($).catch((err) => logOnce($, err))
        if (bandId !== null) blitFrame($)
      } catch (err) {
        logOnce($, err)
      }
    })
    return next(e)
  })

  // Follow the theme, so the bubble and the Zs stay visible on its background
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (result?.value !== undefined) {
      ink = inkFor(result.value)
      $.ui.invalidate('ui.render')
    }
    return result
  })

  on('command.run', { command: 'pokemon' }, async ($, e) => {
    markActive()
    clearAlert()
    nowMs = await $.clock.now()
    const asked = e.args.trim().toLowerCase()
    if (waitsForEvolution(asked)) return { text: displayName(mon) + ' is evolving! /pokemon stop cancels it.' }
    if (MONS.includes(asked)) {
      const wasHome = isHome()
      evolveDue = null
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
      return { text: displayName(mon) + (wander ? ' is free to wander.' : ' is heading home.') }
    } else if (asked === 'pet') {
      pet()
      bumpStat('happiness', PET_HAPPINESS)
      await $.store.set('stats', stats)
      $.ui.invalidate('ui.render')
      const pets = Number((await $.store.get('pets')) ?? 0) + 1
      await $.store.set('pets', pets)
      const line = PET_LINES[Math.floor(Math.random() * PET_LINES.length)]
      return { text: displayName(mon) + ' ' + line + ' ❤ (pets: ' + pets + ')' }
    } else if (asked === 'feed') {
      if (food) return { text: displayName(mon) + ' is still busy with the last one.' }
      const berry = feed()
      bumpStat('food', FEED_FOOD)
      bumpStat('happiness', FEED_HAPPINESS)
      await $.store.set('stats', stats)
      $.ui.invalidate('ui.render')
      const feeds = Number((await $.store.get('feeds')) ?? 0) + 1
      await $.store.set('feeds', feeds)
      const article = /^[aeiou]/.test(berry.name) ? 'an ' : 'a '
      return { text: 'You toss ' + displayName(mon) + ' ' + article + berry.name + ' ' + berry.emoji + ' (feeds: ' + feeds + ')' }
    } else if (asked === 'attack' || asked.startsWith('attack ')) {
      return attackCommand(asked.slice('attack'.length).trim())
    } else if (asked === 'moves' || asked.startsWith('moves ')) {
      const whose = asked.slice('moves'.length).trim() || mon
      if (!MONS.includes(whose)) return { text: 'Unknown mon "' + whose + '". See /pokemon list for every mon.' }
      return movesText(whose)
    } else if (asked === 'needs') {
      needsOn = !needsOn
      await $.store.set('needs', needsOn)
      $.ui.invalidate('ui.render')
      const name = displayName(mon)
      return { text: needsOn ? 'Needs are on. Keep ' + name + ' fed and happy.' : 'Needs are off. ' + name + ' won\'t get hungry or lonely.' }
    } else if (asked === 'evolve' || asked.startsWith('evolve ')) {
      return evolveCommand($, asked.slice('evolve'.length).trim())
    } else if (asked === 'stop') {
      return stopEvolution($)
    } else if (asked === 'stats') {
      return { text: await statsText($) }
    } else if (asked === 'list') {
      return { text: MONS.length + ' mons: ' + MONS.join(', ') }
    } else if (asked) {
      return { text: 'Unknown option "' + asked + '". Try one of: ' + OPTIONS.join(', ') + '. See /pokemon list for every mon.' }
    } else {
      const mode = wander ? ', wandering' : ''
      const levels = 'food ' + Math.round(statNow(mon, 'food')) + '%, happiness ' + Math.round(statNow(mon, 'happiness')) + '%'
      const shown = displayName(mon) + ' Lv. ' + levelOf(mon)
      return { text: 'Showing ' + variant + ' ' + shown + mode + ' (' + (needsOn ? levels : 'needs off') + '). Options: ' + OPTIONS.join(', ') + '.' }
    }
    $.ui.invalidate('ui.render')
    return { text: 'Now showing ' + variant + ' ' + displayName(mon) + '.' }
  })

  // Typing or sending a prompt wakes the mon up and answers its "!"
  on('prompt.edit', async ($, e, next) => {
    markActive()
    clearAlert()
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    markActive()
    clearAlert()
    return next(e)
  })

  // Read what the turn is doing from the spinner, and draw the spinner as usual
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    thinking = e.props.mode === 'thinking'
    return next(e)
  })

  // The main agent's turn ending answers any "!" and starts the idle minute. The mon
  // hops unless the turn was interrupted, and earns XP when it answered. A subagent's
  // turn ending pops its Poké Ball.
  on('turn.complete', async ($, e, next) => {
    thinking = false
    markActive()
    if (e.agentId) party = leaveParty(party, e.agentId, tick)
    if (!e.agentId) clearAlert()
    if (!e.agentId && !e.isAborted) {
      hopStart = tick
      idleAlertAt = tick + IDLE_WAIT_MS / TICK_MS
    }
    if (!e.agentId && e.reason === 'answer') await gainXp($, e.durationMs ?? 0).catch((err) => logOnce($, err))
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
    maxRows = e.props.maxRows
    columns = Math.max(SPRITES[mon].width, Math.min(STRIP_COLUMNS, e.props.bodyColumns))
    if (wasHome) x = homeX()
    clampX()

    const meter = (key, lead = '') => Text({ color: STATS[key].color, children: [lead + iconsFor(key)] })
    const level = Text({ dimColor: true, children: [levelLine()] })
    const zoom = bandZoom()
    let corner
    if (zoom) {
      sentCells = cellsNow()
      const sprite = Raster({ key: 'pokemon', columns: zoom.columns, rows: zoom.rows, cells: sentCells })
      const meters = Box({
        flexDirection: 'column',
        justifyContent: 'flex-end',
        paddingLeft: 1,
        children: needsOn ? [level, meter('food'), meter('happiness')] : [level],
      })
      corner = e.props.bodyColumns >= zoom.columns + STAT_ICONS + 1 ? [sprite, meters] : [sprite]
    } else {
      // Too short even for a shrunk mon: its name, level, and meters on one line, and no blits
      bandId = null
      const name = Text({ children: [displayName(mon) + ' ' + levelLine()] })
      const meters = needsOn ? [meter('food', ' '), meter('happiness', ' ')] : []
      corner = [Box({ flexDirection: 'row', children: [name, ...meters] })]
    }

    const theirs = await next(e)
    return Box({
      flexDirection: 'row',
      justifyContent: theirs ? 'space-between' : 'flex-end',
      children: theirs ? [Box({ flexGrow: 1, children: [theirs] }), ...corner] : corner,
    })
  })

  // Show the main loop's running tools in the bubble, and call you over while one
  // asks you something. A call resolving also settles a dialog waiting on its tool.
  on('tool.call', async ($, e, next) => {
    const name = String(e.tool)
    let id = null
    if (!e.agentId) {
      toolCalls += 1
      id = e.tool_use_id ?? toolCalls
      runningTools.set(id, name)
      if (QUESTION_TOOLS.includes(name)) raiseAlert({ tool: name })
    }
    try {
      return await next(e)
    } finally {
      if (id !== null) runningTools.delete(id)
      alertTools.delete(name)
    }
  })

  // Call you over while a permission dialog waits, until the call it holds resolves.
  // A hook that decides the request opens no dialog.
  on('classic.PermissionRequest', async ($, e, next) => {
    const result = await next(e)
    if (!result?.decision) raiseAlert({ tool: e.tool_name })
    return result
  })

  // Call you over when Claude needs you. The permission reminder comes 6 s into a
  // dialog PermissionRequest already flagged, so it raises nothing while that alert is up.
  // The idle reminder has its own timer above, since a policy plugin can keep classic
  // events from reaching user plugins.
  on('classic.Notification', async ($, e, next) => {
    const type = e.notification_type
    const reminder = type === 'permission_prompt' && alertTools.size > 0
    if (ALERT_NOTIFICATIONS.includes(type) && !reminder) raiseAlert({ ticks: Infinity })
    return next(e)
  })

  // Each subagent the Agent tool starts is a Poké Ball in the party along the left of
  // the strip, until its turn ends
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result?.agentId) party = joinParty(party, result.agentId, tick)
    return result
  })
}
