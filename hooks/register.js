import { attackFrame, attackPose, prepareAttack } from './attacks.js'
import { evolutionsOf, levelEvolutionOf, startLevel } from './evolutions.js'
import { closedEyes, eyesOf } from './eyes.js'
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
// berry for it to walk over and eat. Food and happiness drain over time, slower while Claude Code is closed,
// shown as ●●●○○ and ♥♥♥♡♡ at the right edge, so it needs both now and then.
// /pokemon emoji swaps the meters' icons for 🍓 and 💗.
// /pokemon sleep tucks it in, so both meters drain slower until Claude starts working.
// /pokemon attack plays one of its moves, with the animations in attacks.js.
// While a tool runs, the bubble shows it, with a TM disc for a skill from any agent, and
// when Claude waits on you the mon stops and shows a "!". Each running subagent is a Poké Ball along the left of the strip.
// A main-loop tool call that fails makes it flinch, with a sweat drop by its head.
// Answered turns earn XP, and the mon evolves at the levels from the games.
// Each open session shows its own mon, starting with the one last picked anywhere. XP,
// meters, nickname, and sleep belong to the mon, so sessions showing the same mon share them.
// The mon, hearts, berries, bubbles, balls, and Zs are pixels in one Raster, two per cell.
// The desktop app has no Raster, so there the same pixels are one Svg.

const TICK_MS = 50
// CSS pixels per sprite pixel on the desktop
const PIXEL_PX = 4
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
const FLINCH_TICKS = 24
// How long the TM disc stays up after a skill is typed as /name
const DISC_TICKS = 60
const SHAKE_TICKS = 12
const DRIP_TICKS = 8
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
    pencil: 0xffc83d, lens: 0x6cc4ff, shell: 0x5fe08a, ball: 0xeeeef6, disc: 0xd4d4e0, wrench: 0xb8b8c8, party: 0xb4b4c8,
    discShade: 0x8e8ea0, sweat: 0x6ec8ff, sweatShine: 0xe6f7ff,
  },
  light: {
    bubble: 0x4a4a58, dots: 0x70708a, z: 0x5a5aa8, star: 0xe0a000, silhouette: 0x2e2e3a,
    pencil: 0xe08a00, lens: 0x2a7ad0, shell: 0x1f9a4a, ball: 0xa8a8b4, disc: 0x6e6e88, wrench: 0x6a6a80, party: 0x5c5c74,
    discShade: 0x44445a, sweat: 0x2b8fe0, sweatShine: 0xbfe4ff,
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
// Whether a model turn of the main agent is running, from the turn events alone. The
// band's isWorking can read true while no turn runs, as when a slash command runs.
let turnRunning = false
let thinking = false
const runningTools = new Map()
// Skill calls in flight from any agent, main loop or subagent, by tool_use_id
const runningSkills = new Set()
// The tick a typed skill's TM disc shows until
let discUntil = 0
let toolCalls = 0
const verdicts = new Map()
let flinchStart = -FLINCH_TICKS
const alertTools = new Set()
let alertUntil = 0
let idleAlertAt = null
let party = []
let bandId = null
// The surface the band is drawn on, terminal or desktop
let bandSurface = 'terminal'
let columns = STRIP_COLUMNS
// The columns behind the level and meters at the strip's right, 0 when they sit beside
// a shrunk band instead. The scene runs on under them, so a bubble, hearts, and Zs
// can float over the meters, but the mon stays in the strip.
let panel = 0
// Empty columns drawn left of the strip, so a bubble always fits on the left of the head.
// They take only band width that's free, and none in a shrunk band.
let margin = 0
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
// Meter gains a berry or a pet has earned, paid once its animation ends
const owed = []
// The pet whose hearts are still floating, while it has a gain to pay
let pettingFills = null
let yumUntil = 0
let attack = null
let drawnRows = null
let nowMs = 0
let stats = {}
let needsOn = true
let emojiOn = false
let autoEvolve = true
let evolving = null
let evolveDue = null
let joyHopAt = null
let sentCells = null
let sentSvg = null
// Counts the distinct frames drawn on the desktop. Each one goes under a new key, since
// the desktop keeps showing an Svg's first frame while its place in the tree holds.
let svgFrame = 0
let maxRows = Infinity
let ink = INKS.dark

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

// The empty pixel rows under the feet in a frame, and the fewest across an animation's frames
const gapOf = (rows) => rows.length - 1 - rows.findLastIndex((row) => /[^.]/.test(row))
const gapUnder = (anim) => Math.min(...anim.map(({ rows }) => gapOf(rows)))
// How far to lower the walk frames so the feet stand where the idle frames' do,
// per mon and variant. Some sheets leave more empty rows under a walking mon.
const WALK_DROP = Object.fromEntries(
  MONS.map((name) => [
    name,
    Object.fromEntries(VARIANTS.map((v) => [v, gapUnder(SPRITES[name].variants[v].walk) - gapUnder(SPRITES[name].variants[v].idle)])),
  ]),
)
// The empty columns right of an idle mon, the fewest across its idle frames, per variant.
// Many sheets draw the idle mon right up to the frame's edge.
const IDLE_RIGHT_GAP = Object.fromEntries(
  MONS.map((name) => [
    name,
    Object.fromEntries(
      VARIANTS.map((v) => {
        const { width, variants } = SPRITES[name]
        const rights = variants[v].idle.flatMap(({ rows }) => rows.map((row) => row.search(/[^.]\.*$/)))
        return [v, width - 1 - Math.max(...rights)]
      }),
    ),
  ]),
)
// The rightmost head column of a mon walking right, across its walk frames, per variant
const WALK_HEAD_RIGHT = Object.fromEntries(
  MONS.map((name) => [
    name,
    Object.fromEntries(
      VARIANTS.map((v) => [
        v,
        Math.max(...SPRITES[name].variants[v].walk.flatMap(({ rows }) => rows.slice(0, HEAD_PIXELS).map((row) => row.search(/[^.]\.*$/)))),
      ]),
    ),
  ]),
)
const rowsOf = (name) => HEAD_ROWS + spriteRows(name)
// While a mon evolves or transforms, the band is tall enough for both shapes
const bandRows = () => {
  if (evolving) return Math.max(rowsOf(evolving.from), rowsOf(evolving.into))
  if (attack?.move.effect === 'transform') return Math.max(rowsOf(mon), rowsOf(attack.swap))
  return rowsOf(mon)
}
// The band's size on screen, shrunk to fit a short pane, or null when only the badge fits
const bandZoom = () => zoomFor({ columns: sceneColumns(), rows: bandRows(), maxRows })
// The strip and the panel, in the strip's own columns, and the whole scene with the margin
const stripColumns = () => columns + panel
const sceneColumns = () => margin + columns + panel
// The rows the level and meters take at the bottom of the panel
const panelRows = () => (needsOn ? 3 : 1)

// The fewest empty columns between a mon at home and the level and meters beside it
const HOME_GAP = 3
// The right edge of the strip, where the sprite idles, kept HOME_GAP columns clear of the
// meters whatever empty space the sprite's frame leaves on its right
const homeXOf = (name) => Math.max(0, columns - SPRITES[name].width - Math.max(0, HOME_GAP - IDLE_RIGHT_GAP[name][variant]))
const homeX = () => homeXOf(mon)
const isHome = () => x >= homeX()

const isHopping = () => tick - hopStart < HOP_TICKS
const isPetted = () => tick < petUntil
const isFlinching = () => tick - flinchStart < FLINCH_TICKS
// Put to bed with /pokemon sleep, saved with the mon's meters so it stays asleep across sessions.
const isTuckedIn = () => stats[mon]?.asleep === true
// Five quiet minutes make it drowsy, in this session only
const isDrowsy = () => (tick - lastActive) * TICK_MS >= SLEEP_AFTER_MS
// Tucked in or drowsy, it walks home first and falls asleep once it gets there
const isAsleep = () => !working && (isTuckedIn() || isDrowsy()) && isHome()

// How far right of the sprite's left edge a berry lies when it sits under the middle of
// the body, which can be off the middle of the frame. An eating mon stands unmirrored.
function berryUnderBody() {
  const box = boxOf(SPRITES[mon].variants[variant].idle[0].rows, COLORS[mon][variant])
  return Math.round((box.left + box.right + 1 - BERRY_SIZE) / 2)
}

// Where the sprite stands to eat: with the berry in front of the middle of its body,
// kept inside the strip
function foodTarget() {
  return Math.max(0, Math.min(homeX(), food.x - berryUnderBody()))
}

// Where the idle sprite is headed. Pacing while working is handled in step().
function idleTarget() {
  if (food) return food.eatStart === null ? foodTarget() : x
  if (isAsleep() || isHopping() || isPetted()) return x
  if (!wander || isTuckedIn() || isDrowsy()) return homeX()
  return wanderTarget ?? x
}

function isWalking() {
  if (attack || isAlerted() || isFlinching()) return false
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
// The thought bubble is an outline with no fill, drawn in the theme's bubble ink
const BUBBLE = ['.OOOOOOO.', 'O.......O', 'O.......O', 'O.......O', 'O.......O', 'O.......O', 'O.......O', '.OOOOOOO.']
const BUBBLE_WIDTH = BUBBLE[0].length
// The columns a bubble and its tail take beside the head
const BUBBLE_SPAN = BUBBLE_WIDTH + 3
const BUBBLE_TAIL_ROW = 2
const BUBBLE_ICONS = {
  food: { rows: ['.rgr.', 'rrrrr', '.rrr.', '..r..'], colors: { r: 0xd84040, g: 0x58a040 } },
  happiness: { rows: ['pp.pp', 'ppppp', '.ppp.', '..p..'], colors: { p: 0xf0609a } },
}
const STAR = ['..s..', 'sssss', '.sss.', '.s.s.']
const SMALL_Z = ['zzz', '.z.', 'zzz']
const BIG_Z = ['zzzz', '..z.', '.z..', 'zzzz']
const ZZZ_EVERY_MS = 1100
const ZZZ_LIFE_MS = 2200
// The gap between a new Z and the side of the body, and how far out it drifts from there, in pixels
const ZZZ_GAP = 0
const ZZZ_DRIFT = 4
// A sweat drop on the head when a tool call fails: d drop, h shine
const SWEAT = ['..d.', '.dd.', 'dhdd', 'dddd', '.dd.']
// The "!" of a trainer who spots you, shown while Claude waits on you
const ALERT_ICON = { rows: ['..a..', '..a..', '.....', '..a..'], colors: { a: 0xff3d3d } }
// What the bubble shows while a tool runs: a pencil (p body, e eraser, t wood, g lead),
// a magnifier (l rim, h handle), a shell prompt (s), a Poké Ball (r top, k band,
// w button, b bottom), a TM disc (c disc, d shade, n shine) for a skill, or a wrench (m) for
// every other tool, MCP tools included
const TOOL_ICONS = {
  pencil: ['...pe', '..pp.', '.pp..', 'gt...'],
  lens: ['.ll..', 'l..l.', '.llh.', '....h'],
  shell: ['s....', '.s...', 's....', '..sss'],
  ball: ['.rrr.', 'rrrrr', 'kkwkk', '.bbb.'],
  disc: ['.ncc.', 'nc.cc', 'ccccd', '.cdd.'],
  wrench: ['..m.m', '..mmm', '.m...', 'm....'],
}
const TOOL_KINDS = {
  pencil: ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'],
  lens: ['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'ToolSearch', 'LSP'],
  shell: ['Bash', 'PowerShell', 'Monitor', 'BashOutput', 'KillShell'],
  ball: ['Agent', 'Task', 'SendMessage', 'Workflow'],
  disc: ['Skill'],
}
// Tools that ask you something, and notifications that wait on you
const QUESTION_TOOLS = ['AskUserQuestion', 'ExitPlanMode']
const ALERT_NOTIFICATIONS = ['permission_prompt', 'worker_permission_prompt', 'agent_needs_input', 'elicitation_dialog']
// A minute after a turn with no word from you, the "!" shows for two
const IDLE_WAIT_MS = 60 * 1000
const IDLE_ALERT_MS = 2 * 60 * 1000
// What core tells the model when you turn a call down at its dialog or interrupt it.
// Nothing else marks a refusal there, so the wording is the one sign.
const REFUSED = /The user doesn't want to (proceed with this tool use|take this action)|\[Request interrupted by user/

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

// A skill is in use: a Skill call runs in some agent, or a skill was typed as /name
const skillInUse = () => runningSkills.size > 0 || tick < discUntil

// Hold the disc when a command that ran is a skill, by its source in the command list
async function markSkillCommand($, command) {
  const found = (await $.command.list()).find((c) => c.name === command)
  if (found && found.source !== 'builtin') discUntil = tick + DISC_TICKS
}

// The icon of the main loop's most recently started tool that is still running. A
// skill in use anywhere, in the main loop or a subagent, shows as a TM disc instead.
function toolIcon() {
  const name = [...runningTools.values()].pop()
  const kind = skillInUse() ? 'disc' : (Object.keys(TOOL_KINDS).find((k) => TOOL_KINDS[k].includes(name)) ?? 'wrench')
  const colors = {
    p: ink.pencil, e: 0xe06888, t: 0xb88048, g: 0x767688,
    l: ink.lens, h: 0xb07040,
    s: ink.shell,
    r: 0xee4444, k: 0x60606c, w: 0xc0c0cc, b: ink.ball,
    c: ink.disc, d: ink.discShade, n: 0xf6f6fc,
    m: ink.wrench,
  }
  return { rows: TOOL_ICONS[kind], colors }
}

// What the bubble beside the head shows, if anything
function bubbleIcon() {
  if (attack) return null
  if (isAlerted()) return ALERT_ICON
  if (tick < yumUntil) return { rows: STAR, colors: { s: ink.star } }
  if (skillInUse()) return toolIcon()
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

// A framed thought bubble beside the head, with a single pixel of tail between it and
// the head. It leads on the side a walking mon heads for, and sits on the left of a
// standing one, unless that side has no room for it.
function bubbleOnLeft(head, side) {
  const fitsLeft = head[0] - BUBBLE_SPAN >= -margin
  const fitsRight = head[1] + BUBBLE_SPAN + 1 <= stripColumns()
  return side === 'left' ? fitsLeft : fitsLeft && !fitsRight
}

function bubbleStamps(icon, head, side) {
  const span = BUBBLE_SPAN
  const onLeft = bubbleOnLeft(head, side)
  const left = onLeft ? head[0] - span : head[1] + 4
  const tail = onLeft ? head[0] - 2 : head[1] + 2
  // The first stamp with a pixel wins, so the icon goes before the bubble
  return [
    stamp(left + 2, 2, icon.rows, icon.colors),
    stamp(left, 0, BUBBLE, { O: ink.bubble }),
    stamp(tail, BUBBLE_TAIL_ROW, ['O'], { O: ink.bubble }),
  ]
}

// Zs rising from just left of the middle of a sleeping body and drifting out and up until
// they float off the top of the band, small and big in turn, a new one every ZZZ_EVERY_MS.
// body is the sprite's drawn pixels in strip columns and pixel rows, so every mon's Zs
// start at the same spot on it whatever its shape. With no room on the left, they start
// from the right edge instead.
function sleepStamps(body) {
  const elapsed = tick * TICK_MS
  const middleY = Math.floor((body.top + body.bottom) / 2)
  const onLeft = body.left - ZZZ_GAP - BIG_Z[0].length - ZZZ_DRIFT >= 0
  const newest = Math.floor(elapsed / ZZZ_EVERY_MS)
  const zs = []
  for (let i = Math.max(0, newest - 2); i <= newest; i++) {
    const p = (elapsed - i * ZZZ_EVERY_MS) / ZZZ_LIFE_MS
    if (p >= 1) continue
    const glyph = i % 2 === 0 ? SMALL_Z : BIG_Z
    const drift = Math.round(p * ZZZ_DRIFT)
    const x = onLeft ? body.left - ZZZ_GAP - glyph[0].length - drift : body.right + 1 + ZZZ_GAP + drift
    const startY = middleY - Math.floor(glyph.length / 2)
    zs.push(stamp(x, startY - Math.round(p * (startY + glyph.length)), glyph, { z: ink.z }))
  }
  return zs
}

// A tool call that failed makes the mon wince: it shakes in place, then holds still
// with a sweat drop. Another failure starts it over, and a move or evolution ignores it.
function flinch() {
  if (attack) return
  markActive()
  flinchStart = tick
}

// The flinch shows unless a move plays or the mon is calling you over
const isWincing = () => isFlinching() && !attack && !isAlerted()
const isShaking = () => isWincing() && tick - flinchStart < SHAKE_TICKS

// A pixel to either side in turn while the flinch shakes, kept inside the strip
function flinchJolt(baseX, width) {
  if (!isShaking()) return 0
  const side = Math.floor((tick - flinchStart) / 2) % 2 === 0 ? -1 : 1
  return Math.max(-baseX, Math.min(columns - width - baseX, side))
}

// The sweat drop sliding down the corner of the head away from the bubble, which leads
// on side when there's room
function sweatStamps(head, y, side) {
  const width = SWEAT[0].length
  const sx = bubbleOnLeft(head, side) ? Math.min(columns - width, head[1] - 1) : Math.max(0, head[0] - 2)
  const drip = Math.floor((tick - flinchStart) / DRIP_TICKS)
  return [stamp(sx, y + drip, SWEAT, { d: ink.sweat, h: ink.sweatShine })]
}

// Stop to enjoy it, hop, and send a stream of hearts up around the sprite
// Asleep, it stays asleep: the hearts still float up, but it doesn't hop
function pet() {
  if (!isAsleep()) {
    markActive()
    hopStart = tick
  }
  petUntil = tick + PET_TICKS
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

// Drop a random berry a few columns away, on whichever side has room, for the sprite to
// walk to. It lands where the sprite can stand over it, not so near an edge that the
// body would leave the strip.
function feed() {
  markActive()
  const width = SPRITES[mon].width
  const gap = 3 + Math.floor(Math.random() * 6)
  const under = berryUnderBody()
  const lowest = Math.max(0, under)
  const highest = Math.min(columns - BERRY_SIZE, homeX() + under)
  const right = x + width + gap
  const fx = Math.max(lowest, Math.min(highest, right <= highest ? right : x - gap - BERRY_SIZE))
  const berry = BERRIES[Math.floor(Math.random() * BERRIES.length)]
  food = { x: fx, born: tick, eatStart: null, berry, fills: null }
  wanderTarget = null
  return berry
}

// The berry's top pixel row: falling a pixel every few ticks until it rests on the ground
function foodTop() {
  const ground = bandRows() * 2 - BERRY_SIZE
  return Math.min(ground, -BERRY_SIZE + Math.floor((tick - food.born) / FALL_TICKS))
}

// The berry's color at a strip column and pixel row, or null. Bites take a column
// at a time from either edge in turn, until the middle is gone too.
function foodPixel(cx, py) {
  if (!food) return null
  const fx = cx - food.x
  const fy = py - foodTop()
  if (fx < 0 || fx >= BERRY_SIZE || fy < 0 || fy >= BERRY_SIZE) return null
  if (food.eatStart !== null) {
    const bites = Math.floor(((tick - food.eatStart) / EAT_TICKS) * BERRY_SIZE)
    if (fx < Math.ceil(bites / 2) || BERRY_SIZE - 1 - fx < Math.floor(bites / 2)) return null
  }
  return food.berry.colors[BERRY[fy][fx]] ?? null
}

// Walk to the berry once it lands, eat it, then hop with a "yum!"
function stepFood() {
  markActive()
  const landed = foodTop() === bandRows() * 2 - BERRY_SIZE
  if (food.eatStart !== null) {
    if (tick - food.eatStart < EAT_TICKS) return
    if (food.fills) owed.push({ name: food.fills, food: FEED_FOOD, happiness: FEED_HAPPINESS })
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
  const aimed = attackPose(prepareAttack(move, { side, seed, x, home: homeX() }), 0).view === 'side'
  attack = { move, side, seed, start: tick, backing: true, swap: others[Math.floor(Math.random() * others.length)] }
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

// Petting, feeding, sleeping, attacking, releasing, and switching mons wait while it evolves
const WAITS_FOR_EVOLUTION = ['pet', 'feed', 'sleep', 'attack', 'release']
// While it eats a berry or enjoys a pet, only the commands that just show something run,
// so nothing changes the record the berry or pet is about to fill
const SHOWS_ONLY = ['', 'list', 'stats', 'box', 'moves']
const waitsForCare = (asked) => (food !== null || isPetted()) && !SHOWS_ONLY.includes(asked.split(' ')[0]) && asked !== 'attack list'
const waitsForEvolution = (asked) => evolving !== null && (MONS.includes(asked) || WAITS_FOR_EVOLUTION.includes(asked.split(' ')[0]))

// Play the evolve effect with the evolved mon swapped in, in a band grown to fit both
function startEvolution($, into) {
  $.ui.toast('What? ' + nameOf(mon) + ' is evolving!')
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

// The evolved mon takes over the record as last saved, so XP earned elsewhere comes along.
// 'evolved' tells another session showing the old mon that it evolved rather than being released.
async function moveRecord($, from, into) {
  await freshen($, [from])
  stats[into] = { ...stats[from], xp: xpOf(from) }
  delete stats[from]
  await saveStats($, [from, into])
  const evolved = (await $.store.get('evolved')) ?? {}
  await $.store.set('evolved', { ...evolved, [from]: into })
}

// The mon becomes the evolved one. Its record moves along, so level, XP, and meters carry over.
function finishEvolution($) {
  const { from, into } = evolving
  const wasHome = isHome()
  evolving = null
  mon = into
  if (wasHome) x = homeX()
  clampX()
  const name = nameOf(from)
  saveMon($).catch((err) => logOnce($, err))
  moveRecord($, from, into).catch((err) => logOnce($, err))
  $.ui.toast('Congratulations! Your ' + name + ' evolved into ' + displayName(into) + '!')
  $.ui.invalidate('ui.render')
}

// Call off an evolution under way or due. The mon stays as it is.
function stopEvolution($) {
  const name = nameOf(mon)
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
  const name = nameOf(mon)
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

// A sleeping mon's frame with its eyes shut, cached per frame
const sleepingFrames = new Map()
function sleepingFrame(shown, view) {
  const sheet = SPRITES[shown].variants[variant]
  const rows = sheet[view][0].rows
  if (!sleepingFrames.has(rows)) sleepingFrames.set(rows, closedEyes(rows, sheet.palette, eyesOf(shown, variant, view, 0)))
  return sleepingFrames.get(rows)
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
  const width = stripColumns()
  const overlay = new Int32Array(width * pixels).fill(-1)
  for (let k = 0; k < dots.length; k += 3) {
    const cx = dots[k]
    const py = dots[k + 1]
    if (cx >= 0 && cx < width && py >= 0 && py < pixels) overlay[py * width + cx] = dots[k + 2]
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

// The current frame, zoomed to the band: a color or null per pixel, two pixel rows per
// cell, and the effects' glyphs by cell
function frameNow() {
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
  if (asleep) frame = sleepingFrame(shown, sideOn ? 'walk' : 'idle')
  else if (attack && sideOn) frame = anim[pose.stride ? Math.floor(age / STRIDE_TICKS) % anim.length : 0].rows
  const colors = COLORS[shown][variant]
  // Facing out, the sprite stays unmirrored like the idle mon, so it doesn't jump when the move ends
  const flip = attack ? sideOn && attack.side === 'left' : walking && facing === 'left'
  const rows = bandRows()
  // A swapped-in mon stands on the same ground and stays inside the strip. An evolving
  // mon at home keeps to the right edge in either shape.
  // A sleeping mon holds one frame, lowered so its feet rest where the idle ones do
  const drop = asleep ? gapOf(frame) - gapUnder(sheet.idle) : sideOn ? WALK_DROP[shown][variant] : 0
  const baseTop = rows * 2 - SPRITES[shown].height + drop
  const baseX = Math.max(0, Math.min(evolving && isHome() ? homeXOf(shown) : x, columns - sprite.width))
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
  const jolt = flinchJolt(baseX, sprite.width)
  const hopUp = !attack && !isShaking() && isHopping() && Math.floor((tick - hopStart) / 3) % 2 === 0
  const top = baseTop + effect.dy - (hopUp ? 2 : 0)
  const left = baseX + effect.dx + jolt
  const mirrored = flip !== effect.flipX
  const box = boxOf(frame, colors)
  const body = bodyPixel(effect, pixelOf(mirrored), box, sprite.width, mirrored, left, top)
  const ghost = ghostPixel(effect.ghosts, pixel, box, sprite.width, flip, baseX, baseTop)
  const head = headColumns(pixel, sprite.width, left)
  const icon = bubbleIcon()
  // The frame's box as drawn, mirrored along with the sprite
  const [boxLeft, boxRight] = flip ? [sprite.width - 1 - box.right, sprite.width - 1 - box.left] : [box.left, box.right]
  const sleeper = { left: left + boxLeft, right: left + boxRight, top: top + box.top, bottom: top + box.bottom }
  const bubbleSide = walking ? facing : 'left'
  const over = [...heartStamps(), ...(isWincing() ? sweatStamps(head, top + box.top, bubbleSide) : []), ...(asleep ? sleepStamps(sleeper) : [])]
  const balls = partyStamps(party, tick, { columns, ground: rows * 2 - 1, label: ink.party })
  const under = [...(icon ? bubbleStamps(icon, head, bubbleSide) : []), ...balls]
  const pixels = rows * 2
  const width = stripColumns()
  const colorAt = (cx, py) => {
    if (py < 0 || py >= pixels) return null
    const i = cx >= 0 && cx < width ? py * width + cx : -1
    if (overlay && i >= 0 && overlay[i] >= 0) return overlay[i]
    for (const s of over) {
      const h = stampPixel(s, cx, py)
      if (h !== null) return h
    }
    // The berry sits in front of the mon, so it stays in sight while it's eaten
    const f = foodPixel(cx, py)
    if (f !== null) return f
    const c = effect.hidden ? null : body(cx, py)
    if (c !== null) return c
    if (effect.ghosts.length > 0) {
      const g = ghost(cx, py)
      if (g !== null) return g
    }
    if (underlay && i >= 0 && underlay[i] >= 0) return underlay[i]
    for (const s of under) {
      const u = stampPixel(s, cx, py)
      if (u !== null) return u
    }
    return null
  }

  // Shake the full-size scene, then shrink it to the band's size on screen. The scene's
  // columns start at the margin's left edge, the strip's at the margin's right.
  const [shakeX, shakeY] = effect.shake
  const scene = sceneColumns()
  const zoom = bandZoom() ?? { scale: 1, columns: scene, rows }
  const shaken = (cx, py) => (cx - shakeX < 0 || cx - shakeX >= scene ? null : colorAt(cx - shakeX - margin, py - shakeY))
  const at = zoomedPixel(shaken, { columns: scene, pixels, scale: zoom.scale })
  const glyphs = new Map()
  for (let k = 0; k < effect.chars.length; k += 4) {
    const gx = zoomedAt(effect.chars[k] + shakeX + margin, zoom.scale)
    glyphs.set(gx + ',' + zoomedAt(effect.chars[k + 1], zoom.scale), [effect.chars[k + 2], effect.chars[k + 3]])
  }
  return { at, glyphs, zoom }
}

// The cells left blank under the level and meters, which are drawn over them
const underPanel = (cx, cy, zoom) => cx >= margin + columns && cy >= zoom.rows - panelRows()

// Pack the current frame into Raster cells, two pixels per cell with half blocks
function cellsNow() {
  const { at, glyphs, zoom } = frameNow()
  const words = new Uint32Array(zoom.columns * zoom.rows * 3)
  for (let cy = 0; cy < zoom.rows; cy++) {
    for (let cx = 0; cx < zoom.columns; cx++) {
      const i = (cy * zoom.columns + cx) * 3
      const upper = at(cx, cy * 2)
      const lower = at(cx, cy * 2 + 1)
      const glyph = glyphs.get(cx + ',' + cy)
      if (underPanel(cx, cy, zoom)) words.set([SPACE, DEFAULT_COLOR, DEFAULT_COLOR], i)
      else if (glyph) words.set([glyph[0], glyph[1], upper ?? lower ?? DEFAULT_COLOR], i)
      // A cell one color top and bottom is a space on that background, which every
      // terminal fills edge to edge. Only a cell split in two needs a half block, whose
      // shape depends on the font and can leave thin seams between rows.
      else if (upper !== null && upper === lower) words.set([SPACE, DEFAULT_COLOR, upper], i)
      else if (upper !== null) words.set([UPPER_HALF, upper, lower ?? DEFAULT_COLOR], i)
      else if (lower !== null) words.set([LOWER_HALF, lower, DEFAULT_COLOR], i)
      else words.set([SPACE, DEFAULT_COLOR, DEFAULT_COLOR], i)
    }
  }
  return new Uint8Array(words.buffer).toBase64()
}

const hexOf = (color) => '#' + color.toString(16).padStart(6, '0')

// Draw the current frame as SVG for the desktop, which has no Raster. Each pixel is a
// unit square, runs of one color in a row merged into one path per color. A glyph
// takes its whole cell, two pixels tall, over the cell's top color or else its bottom.
function svgNow() {
  const { at, glyphs, zoom } = frameNow()
  const width = zoom.columns
  const height = zoom.rows * 2
  const runs = new Map()
  const fill = (color, d) => runs.set(color, (runs.get(color) ?? '') + d)
  const pixelAt = (cx, py) => {
    const cy = py >> 1
    return underPanel(cx, cy, zoom) || glyphs.has(cx + ',' + cy) ? null : at(cx, py)
  }
  for (let py = 0; py < height; py++) {
    for (let cx = 0; cx < width; ) {
      const color = pixelAt(cx, py)
      let end = cx + 1
      while (end < width && pixelAt(end, py) === color) end++
      if (color !== null) fill(color, `M${cx} ${py}h${end - cx}v1h${cx - end}z`)
      cx = end
    }
  }
  let text = ''
  for (const [cell, [code, color]] of glyphs) {
    const [cx, cy] = cell.split(',').map(Number)
    if (cx < 0 || cx >= width || cy < 0 || cy >= zoom.rows) continue
    const under = at(cx, cy * 2) ?? at(cx, cy * 2 + 1)
    if (under !== null) fill(under, `M${cx} ${cy * 2}h1v2h-1z`)
    text += `<text x="${cx + 0.5}" y="${cy * 2 + 1.6}" fill="${hexOf(color)}">&#${code};</text>`
  }
  let paths = ''
  for (const [color, d] of runs) paths += `<path fill="${hexOf(color)}" d="${d}"/>`
  const font = text ? `<g font-family="monospace" font-size="2" text-anchor="middle">${text}</g>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${paths}${font}</svg>`
}

// Where a mon pacing right while Claude works turns back: before its bubble, which leads
// on the right, would run past the panel, or at home if it never would
const workTurnX = () => Math.max(0, Math.min(homeX(), stripColumns() - BUBBLE_SPAN - 1 - WALK_HEAD_RIGHT[mon][variant]))

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
  if (isFlinching()) return
  if (food) return stepFood()
  if (working) markActive()
  planWander()
  hopForJoy()
  if (tick % moveTicks() !== 0) return

  if (working) {
    if (facing === 'left' && x <= 0) facing = 'right'
    else if (facing === 'right' && x >= workTurnX()) facing = 'left'
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

// Each stat drains from full to empty over its hours, per mon. It's stored with a
// timestamp, which slowMeters moves on past most of the time when no session ran
const STATS = {
  food: { hoursToEmpty: 8 },
  happiness: { hoursToEmpty: 12 },
}
// The meters' icons, plain text unless /pokemon emoji turns emoji on. Each text pair is a
// filled and an empty glyph from one Unicode block, drawn one column wide at one size, with
// no emoji presentation. An emoji icon takes two columns: a filled one is drawn two wide from
// the emoji font whatever the terminal's font, and an empty one is followed by a space. Some
// fonts lack ○ or ♡ and borrow a wider glyph, which then spills into the space, not the next icon.
const METER_STYLES = {
  text: {
    columns: 1,
    food: { icon: '●', emptyIcon: '○', color: '#ea697d' },
    happiness: { icon: '♥', emptyIcon: '♡', color: '#ff5f9e' },
  },
  emoji: {
    columns: 2,
    // The empty icons take the color of the emoji they stand in for
    food: { icon: '🍓', emptyIcon: '○', color: '#e0303e' },
    happiness: { icon: '💗', emptyIcon: '♡', color: '#ff7aa8' },
  },
}
const START_STAT = 80
// One icon's worth, so each berry adds exactly one icon
const FEED_FOOD = 20
const FEED_HAPPINESS = 5
const PET_HAPPINESS = 25
const NEEDY_BELOW = 30
const STAT_ICONS = 5
const meterStyle = () => (emojiOn ? METER_STYLES.emoji : METER_STYLES.text)
// The columns a meter takes in the active style
const meterColumns = () => STAT_ICONS * meterStyle().columns
const STAT_REDRAW_TICKS = 1200
const HUNGRY_MOVE_TICKS = 5
const HAPPY_FROM = 80
// How fast each meter drains while tucked in, as a share of its awake rate
const SLEEP_DRAIN = { food: 0.5, happiness: 0.25 }
const JOY_HOP_TICKS = [400, 800]

const clampStat = (v) => Math.max(0, Math.min(100, v))

function statNow(name, key) {
  const saved = stats[name]?.[key]
  if (!saved) return START_STAT
  if (stats[name].parked) return clampStat(saved.value)
  const perMs = (100 / (STATS[key].hoursToEmpty * 3600 * 1000)) * (stats[name]?.asleep ? SLEEP_DRAIN[key] : 1)
  return clampStat(saved.value - perMs * Math.max(0, nowMs - saved.at))
}

function bumpStat(key, amount, name = mon) {
  stats[name] = { ...stats[name], [key]: { value: clampStat(statNow(name, key) + amount), at: nowMs } }
}

// Fill the meters once the berry is eaten or the hearts have floated away, not when
// asked, for the mon that was fed or petted
function stepOwed($) {
  if (pettingFills && !isPetted()) {
    owed.push({ name: pettingFills, happiness: PET_HAPPINESS })
    pettingFills = null
  }
  if (owed.length > 0) payOwed($, owed.splice(0)).catch((err) => logOnce($, err))
}

async function payOwed($, gains) {
  nowMs = await $.clock.now()
  const names = [...new Set(gains.map((g) => g.name))]
  await freshen($, names)
  for (const { name, ...meters } of gains) {
    for (const [key, amount] of Object.entries(meters)) bumpStat(key, amount, name)
  }
  await saveRecords($, names)
  $.ui.invalidate('ui.render')
}

// Only the mons on show drain. Switching away parks a mon's meters where they are, and
// they pick up from there when it's shown again, so a mon left alone for weeks isn't
// starving when it comes back. XP is the shown mon's alone already. A mon parked while
// another session still shows it goes back to draining at that session's next sync.
function park(name) {
  if (!stats[name] || stats[name].parked) return
  const record = { ...stats[name], parked: true }
  for (const key of Object.keys(STATS)) if (record[key]) record[key] = { value: statNow(name, key), at: nowMs }
  stats[name] = record
}

function unpark(name) {
  if (!stats[name]?.parked) return
  const { parked, ...record } = stats[name]
  for (const key of Object.keys(STATS)) if (record[key]) record[key] = { ...record[key], at: nowMs }
  stats[name] = record
}

// Saves both meters as they are now before the drain rate changes, so the slower
// rate only covers the time asleep
async function setAsleep($, asleep) {
  await freshen($, [mon])
  for (const key of Object.keys(STATS)) bumpStat(key, 0)
  stats[mon] = { ...stats[mon], asleep }
  await saveStats($, [mon])
  $.ui.invalidate('ui.render')
}

// Every open session shares the store, so a session saves only the records it changed
// over the stored ones and picks up the others' as it goes. It counts its saves, and the
// ones still being written, so a sync that read the store before one landed doesn't undo it.
let statWrites = 0
let statSaving = 0

async function saveStats($, names) {
  await saveRecords($, names)
}

// Take these mons' records as last saved by any session, right before changing them, so
// a change lands on another session's newest XP and meters rather than on this one's
// copy from the last sync. A record gone from the store was released in another session,
// so it goes here too rather than being saved back. The shown mon is never parked here.
async function freshen($, names) {
  const saved = await $.store.get('stats')
  if (!saved || typeof saved !== 'object') return
  for (const name of names) {
    if (!saved[name]) {
      delete stats[name]
      continue
    }
    const { parked, ...shown } = saved[name]
    stats[name] = name === mon ? shown : saved[name]
  }
}

async function saveRecords($, names) {
  statWrites += 1
  statSaving += 1
  try {
    const saved = await $.store.get('stats')
    const merged = saved && typeof saved === 'object' ? { ...saved } : {}
    const started = names.filter((name) => stats[name] && !merged[name])
    for (const name of names) {
      if (stats[name]) merged[name] = stats[name]
      else delete merged[name]
    }
    stats = merged
    await $.store.set('stats', merged)
    // A mon raised again from scratch no longer points at what it once evolved into
    if (started.length > 0) {
      const evolved = await $.store.get('evolved')
      if (evolved && started.some((name) => name in evolved)) {
        const rest = { ...evolved }
        for (const name of started) delete rest[name]
        await $.store.set('evolved', rest)
      }
    }
  } finally {
    statSaving -= 1
  }
}

// 'mon' is the last one picked in any session, and a new session starts with it. A mon
// picked here is shown as itself, even if it once evolved in another session.
async function saveMon($) {
  await $.store.set('mon', mon)
  const evolved = await $.store.get('evolved')
  if (evolved && mon in evolved) {
    const { [mon]: _, ...rest } = evolved
    await $.store.set('evolved', rest)
  }
}

// Earlier versions kept a mon per session under 'mon:' keys and a busy mark under 'busy:' keys
async function forgetOldKeys($) {
  for (const key of await $.store.keys()) {
    if (key.startsWith('mon:') || key.startsWith('busy:')) await $.store.delete(key)
  }
}

const SYNC_TICKS = 20
// How often the party is checked against the live agents, and how old a ball must be
// before a missing agent pops it, so a fresh spawn the list hasn't caught up with stays
const PARTY_SYNC_TICKS = 40
// An agent still at work, as the agent list reports it
const LIVE_STATUSES = ['pending', 'running', 'waiting']

// Pop the ball of any agent the engine no longer reports at work. A teammate in a pane of
// its own runs no loop here, so its turn never completes in this process, and this is the
// only way its ball ever pops.
async function syncParty($) {
  const open = party.filter((ball) => ball.popStart === null && tick - ball.born >= PARTY_SYNC_TICKS)
  if (open.length === 0) return
  const live = new Set()
  for (const agent of await $.agent.list()) {
    if (!LIVE_STATUSES.includes(agent.status)) continue
    live.add(agent.id)
    if (agent.teammateId) live.add(agent.teammateId)
  }
  for (const ball of open) if (!live.has(ball.id)) party = leaveParty(party, ball.id, tick)
}

// Show the mon this one evolved into in another session, once nothing here is mid-move
function followEvolution($, into, record) {
  if (evolving || attack) return
  const name = nameOf(mon)
  const wasHome = isHome()
  delete stats[mon]
  stats[into] = record
  evolveDue = null
  mon = into
  if (wasHome) x = homeX()
  clampX()
  sentCells = null
  $.ui.toast('Congratulations! Your ' + name + ' evolved into ' + displayName(into) + '!')
  $.ui.invalidate('ui.render')
}

// Take the shown mon's record as another session showing it saved it: fed, petted, earned
// XP, or put to bed. Put to bed elsewhere while Claude works here, it wakes right back up
// in stepWake.
async function syncSessions($) {
  const writes = statWrites
  const saved = await $.store.get('stats')
  const evolved = await $.store.get('evolved')
  // Nothing may await between this check and acting on what was read
  if (statSaving > 0 || writes !== statWrites) return
  // Evolved in another session, the shown mon evolves here too. Released, it starts over.
  if (!saved?.[mon]) {
    const into = evolved?.[mon]
    if (MONS.includes(into) && saved?.[into]) {
      followEvolution($, into, saved[into])
      return
    }
    if (stats[mon] && saved && typeof saved === 'object') {
      delete stats[mon]
      evolveDue = null
      $.ui.invalidate('ui.render')
    }
    return
  }
  // A session that switched away from the shown mon parked it. It's still on show here, so
  // its record goes back unparked and drains on from where the park left it.
  const { parked, ...theirs } = saved[mon]
  if (parked) {
    await freshen($, [mon])
    await saveRecords($, [mon])
  } else if (JSON.stringify(theirs) === JSON.stringify(stats[mon])) {
    return
  } else {
    stats[mon] = theirs
  }
  $.ui.invalidate('ui.render')
}

// A tucked-in mon wakes when Claude starts working, or when it has a berry to eat,
// a move to play, or an evolution to go through
function stepWake($) {
  if (isTuckedIn() && (turnRunning || food || attack || evolving || evolveDue)) setAsleep($, false).catch((err) => logOnce($, err))
}

// Five icons, each worth 20%, rounding up so any food or love left shows at least one.
const filledIcons = (key, name = mon) => Math.ceil(statNow(name, key) / (100 / STAT_ICONS))
// Full when every food icon is filled
const isFull = () => filledIcons('food') === STAT_ICONS
// As happy as can be when every heart is filled
const isHappiest = () => filledIcons('happiness') === STAT_ICONS

function iconsFor(key, name = mon) {
  const style = meterStyle()
  const filled = filledIcons(key, name)
  return style[key].icon.repeat(filled) + (style[key].emptyIcon + ' '.repeat(style.columns - 1)).repeat(STAT_ICONS - filled)
}

// A nickname lives in the mon's record too, so it follows the mon through evolution
const nameOf = (name) => stats[name]?.nickname ?? displayName(name)

// Like "Sparky (Pikachu)", or just "Pikachu" without a nickname
const fullNameOf = (name) => (stats[name]?.nickname ? stats[name].nickname + ' (' + displayName(name) + ')' : displayName(name))

// XP lives in each mon's record. A mon that hasn't earned any starts at its first level.
const xpOf = (name) => stats[name]?.xp ?? xpAt(startLevel(name))
const levelOf = (name) => levelAt(xpOf(name))

// The level line above the meters, at most five columns wide
const levelLine = () => (levelOf(mon) < MAX_LEVEL ? 'Lv ' : 'Lv') + levelOf(mon)

// An answered turn earns XP, scaled by care. A level-up toasts the new level once, and
// an evolution it reaches is due.
async function gainXp($, durationMs) {
  nowMs = await $.clock.now()
  await freshen($, [mon])
  const was = levelOf(mon)
  const care = needsOn ? careOf(statNow(mon, 'food'), statNow(mon, 'happiness')) : 1
  stats[mon] = { ...stats[mon], xp: xpOf(mon) + turnXp({ level: was, durationMs, care }) }
  await saveStats($, [mon])
  const level = levelOf(mon)
  if (level === was) return
  $.ui.toast(nameOf(mon) + ' grew to Lv. ' + level + '!')
  $.ui.invalidate('ui.render')
  const into = readyToEvolve()
  if (!into) return
  if (autoEvolve) evolveDue = into
  else $.ui.toast(nameOf(mon) + ' is ready to evolve into ' + displayName(into) + '! /pokemon evolve lets it.')
}

// The mon its level lets it become, while it isn't evolving already
function readyToEvolve() {
  const evolution = levelEvolutionOf(mon)
  return evolution && levelOf(mon) >= evolution.level && !evolving ? evolution.into : null
}

// Like "Pikachu, Lv. 12, 1820 XP (377 to Lv. 13). Can become Raichu with a Thunder Stone.
// Food 50%, happiness 67%. 12 pets, 5 feeds."
async function statsText($) {
  const level = levelOf(mon)
  const next = level < MAX_LEVEL ? ' (' + (xpAt(level + 1) - xpOf(mon)) + ' to Lv. ' + (level + 1) + ')' : ''
  const evolutions = evolutionsOf(mon)
  const ready = readyToEvolve()
  const becomes = ready
    ? ' Ready to evolve into ' + displayName(ready) + '. /pokemon evolve lets it.'
    : evolutions.length > 0 ? ' Can become ' + orList(evolutions.map(evolutionText)) + '.' : ''
  const meters = needsOn
    ? ' Food ' + Math.round(statNow(mon, 'food')) + '%, happiness ' + Math.round(statNow(mon, 'happiness')) + '%.'
    : ' Needs are off.'
  const pets = Number((await $.store.get('pets')) ?? 0)
  const feeds = Number((await $.store.get('feeds')) ?? 0)
  return fullNameOf(mon) + ', Lv. ' + level + ', ' + xpOf(mon) + ' XP' + next + '.' + becomes + meters + ' ' + pets + ' pets, ' + feeds + ' feeds.'
}

// Every mon with a saved record, highest level first, one a line, like
// "Charizard, Lv. 36 ●●●○○ ♥♥♥♡♡ (active)"
function boxText() {
  const raised = Object.keys(stats).filter((name) => MONS.includes(name) && stats[name] && typeof stats[name] === 'object')
  if (raised.length === 0) return 'Your box is empty. Pet or feed ' + displayName(mon) + ', or finish a turn, to start raising it.'
  raised.sort((a, b) => levelOf(b) - levelOf(a) || displayName(a).localeCompare(displayName(b)) || a.localeCompare(b))
  const lines = raised.map((name) => {
    const meters = needsOn ? ' ' + iconsFor('food', name).trimEnd() + ' ' + iconsFor('happiness', name).trimEnd() : ''
    return fullNameOf(name) + ', Lv. ' + levelOf(name) + meters + (name === mon ? ' (active)' : '')
  })
  const count = raised.length + (raised.length === 1 ? ' mon' : ' mons')
  const alone = raised.length === 1 && raised[0] === mon ? '\nOnly ' + nameOf(mon) + ' so far. /pokemon <mon> picks another.' : ''
  return count + ' in your box:\n' + lines.join('\n') + alone
}

// Drop a mon's record from the box, so it starts over at its first level with fresh
// meters. The active mon stays on screen and starts over in place.
function releaseCommand(wanted) {
  if (!wanted) return { text: 'Name the mon to release, like /pokemon release ' + mon + '. /pokemon box lists yours.' }
  if (!MONS.includes(wanted)) return { text: 'Unknown mon "' + wanted + '". /pokemon box lists yours.' }
  if (!stats[wanted]) return { text: displayName(wanted) + ' isn\'t in your box.' }
  const name = nameOf(wanted)
  delete stats[wanted]
  if (wanted !== mon) return { text: 'You release ' + name + '. Bye-bye, ' + name + '!' }
  evolveDue = null
  return { text: 'You release ' + name + '. Bye-bye, ' + name + '! A fresh ' + displayName(mon) + ' takes its place.' }
}

const NICKNAME_MAX = 12

// Name the active mon. Its species name, as in the games, takes the nickname away.
function nicknameCommand(wanted) {
  const species = displayName(mon)
  const nickname = wanted.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim()
  if (!nickname) {
    const now = stats[mon]?.nickname ? species + ' goes by ' + stats[mon].nickname + '. ' : ''
    return { text: now + 'Name it with /pokemon nickname <name>, up to ' + NICKNAME_MAX + ' characters.' }
  }
  if ([...nickname].length > NICKNAME_MAX) return { text: 'That\'s too long. A nickname fits ' + NICKNAME_MAX + ' characters.' }
  const old = stats[mon]?.nickname
  if (moveKey(nickname) === moveKey(species) || moveKey(nickname) === moveKey(mon)) {
    if (!old) return { text: species + ' has no nickname.' }
    const { nickname: _, ...rest } = stats[mon]
    if (Object.keys(rest).length > 0) stats[mon] = rest
    else delete stats[mon]
    return { text: old + ' is just ' + species + ' again.' }
  }
  stats[mon] = { ...stats[mon], nickname }
  return { text: (old ?? species) + ' is now ' + nickname + '!' }
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

const OPTIONS = ['<mon>', ...VARIANTS, 'wander', 'needs', 'emoji', 'autoevolve', 'pet', 'feed', 'sleep', 'attack', 'moves', 'evolve', 'stop', 'stats', 'box', 'nickname', 'release', 'list']
const PET_LINES = ['loves it', 'wiggles happily', 'leans into your hand', 'does a little hop', 'looks very pleased']

const FALLBACK_MOVES = [{ name: 'Tackle', effect: 'tackle' }]
const moveKey = (name) => name.toLowerCase().replace(/[\s\-_'.]/g, '')

// A mon's moves, like "Pikachu knows Thunderbolt, Quick Attack, Thunder, Agility."
function movesText(name) {
  const known = movesOf(name)
  const moves = known.length > 0 ? known : FALLBACK_MOVES
  return { text: nameOf(name) + ' knows ' + moves.map((m) => m.name).join(', ') + '.' }
}

// Play a random move, or the one named, and announce it. "list" lists the moves instead.
function attackCommand(wanted) {
  const name = nameOf(mon)
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

// The desktop has no Raster to repaint, so a changed frame draws the band again. The
// host draws a plugin's band ten times a second at most.
const DESKTOP_FRAME_TICKS = 2
function redrawSvg($) {
  if (!bandZoom() || svgNow() === sentSvg) return
  $.ui.invalidate('ui.render')
}

// Ticks stop while the machine sleeps, so the meters resync with the real clock
// The meters drain at OFF_DRAIN of their speed while no session runs: Claude Code closed,
// or the laptop off or asleep. Every open session marks the store as seen every BEAT_MS.
// A session that starts long after the last mark, or a running one whose own beat comes
// late because the laptop slept, moves every meter's timestamp on by the rest of that
// time, so only OFF_DRAIN of it counts. This stacks with /pokemon sleep's slower drain.
const OFF_DRAIN = 0.25
const BEAT_MS = 10 * 1000
const BEAT_TICKS = BEAT_MS / TICK_MS
const OFF_AFTER_MS = 60 * 1000
let lastBeat = null

async function slowMeters($, offMs) {
  const skipped = offMs * (1 - OFF_DRAIN)
  await freshen($, Object.keys(stats))
  const draining = Object.keys(stats).filter((name) => !stats[name].parked)
  for (const name of draining) {
    const record = { ...stats[name] }
    for (const key of Object.keys(STATS)) {
      if (record[key]?.at !== undefined) record[key] = { ...record[key], at: record[key].at + skipped }
    }
    stats[name] = record
  }
  await saveRecords($, draining)
}

// At session start, since is the last mark any session left. While running, it's this
// session's own last beat.
async function beat($, since) {
  const now = await $.clock.now()
  nowMs = now
  if (typeof since === 'number' && now - since > OFF_AFTER_MS) await slowMeters($, now - since - BEAT_MS)
  lastBeat = now
  await $.store.set('seenAt', now)
}

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
  // Logging is best effort: a log that fails must not break the hook that hit the error
  try {
    Promise.resolve($.ui.log('pokemon: ' + message, { to: 'debug' })).catch(() => {})
  } catch {}
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
      description: 'Pick the Pokémon above the prompt, pet it, feed it, put it to sleep, make it attack, list its moves, or evolve it',
      argumentHint: '[' + OPTIONS.join('|') + ']',
      immediate: true,
    })
    const savedMon = await $.store.get('mon')
    if (MONS.includes(savedMon)) mon = savedMon
    forgetOldKeys($).catch((err) => logOnce($, err))
    const savedVariant = await $.store.get('variant')
    if (VARIANTS.includes(savedVariant)) variant = savedVariant
    wander = (await $.store.get('wander')) !== false
    needsOn = (await $.store.get('needs')) !== false
    emojiOn = (await $.store.get('emoji')) === true
    autoEvolve = (await $.store.get('autoEvolve')) !== false
    const savedStats = await $.store.get('stats')
    if (savedStats && typeof savedStats === 'object') stats = savedStats
    nowMs = await $.clock.now()
    ink = await themeInk($)
    await beat($, await $.store.get('seenAt')).catch((err) => logOnce($, err))
    // Shown again, a parked mon's meters pick up where they stopped
    if (stats[mon]?.parked) {
      unpark(mon)
      await saveStats($, [mon]).catch((err) => logOnce($, err))
    }
    $.clock.every(TICK_MS, () => {
      try {
        step()
        stepEvolution($)
        stepWake($)
        stepOwed($)
        // The band grows and shrinks back around a Transform
        if (bandRows() !== drawnRows) {
          drawnRows = bandRows()
          $.ui.invalidate('ui.render')
        }
        if (tick % STAT_REDRAW_TICKS === 0) resyncMeters($).catch((err) => logOnce($, err))
        if (tick % SYNC_TICKS === 0) syncSessions($).catch((err) => logOnce($, err))
        if (tick % PARTY_SYNC_TICKS === 0) syncParty($).catch((err) => logOnce($, err))
        if (tick % BEAT_TICKS === 0) beat($, lastBeat).catch((err) => logOnce($, err))
        if (bandId !== null && bandSurface === 'terminal') blitFrame($)
        if (bandId !== null && bandSurface === 'desktop' && tick % DESKTOP_FRAME_TICKS === 0) redrawSvg($)
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
    const asked = e.args.trim().toLowerCase()
    // A pet doesn't wake a sleeping mon, so it doesn't count as activity
    if (asked !== 'pet' || !isAsleep()) markActive()
    clearAlert()
    nowMs = await $.clock.now()
    if (waitsForEvolution(asked)) return { text: nameOf(mon) + ' is evolving! /pokemon stop cancels it.' }
    if (waitsForCare(asked)) return { text: nameOf(mon) + (food ? ' is busy eating.' : ' is enjoying the pets.') + ' Try again in a moment.' }
    if (MONS.includes(asked)) {
      const wasHome = isHome()
      evolveDue = null
      const left = mon
      nowMs = await $.clock.now()
      await freshen($, [left, asked])
      if (asked !== left && (stats[left] || stats[asked])) {
        park(left)
        unpark(asked)
        await saveRecords($, [left, asked])
      }
      mon = asked
      if (wasHome) x = homeX()
      clampX()
      await saveMon($)
    } else if (VARIANTS.includes(asked)) {
      variant = asked
      await $.store.set('variant', variant)
    } else if (asked === 'wander') {
      wander = !wander
      wanderTarget = null
      await $.store.set('wander', wander)
      return { text: nameOf(mon) + (wander ? ' is free to wander.' : ' is heading home.') }
    } else if (asked === 'pet') {
      // A mon as happy as can be, every heart filled, still enjoys it, but it fills no
      // meter and doesn't count as a pet
      const happiest = isHappiest()
      const sleeping = isAsleep()
      pet()
      const line = nameOf(mon) + ' ' + (sleeping ? 'smiles in its sleep' : PET_LINES[Math.floor(Math.random() * PET_LINES.length)]) + ' ♥'
      if (happiest) return { text: line + ' ' + nameOf(mon) + ' is already as happy as can be.' }
      pettingFills = mon
      const pets = Number((await $.store.get('pets')) ?? 0) + 1
      await $.store.set('pets', pets)
      return { text: line }
    } else if (asked === 'feed') {
      // A full mon, every food icon filled, still eats the berry, but it fills no meter
      // and doesn't count as a feed
      const full = isFull()
      const berry = feed()
      const article = /^[aeiou]/.test(berry.name) ? 'an ' : 'a '
      const tossed = 'You toss ' + nameOf(mon) + ' ' + article + berry.name + ' ' + berry.emoji
      if (full) return { text: tossed + '. ' + nameOf(mon) + ' is already full, so it just nibbles it.' }
      // The meters fill once it has eaten the berry
      food.fills = mon
      const feeds = Number((await $.store.get('feeds')) ?? 0) + 1
      await $.store.set('feeds', feeds)
      return { text: tossed }
    } else if (asked === 'sleep') {
      const name = nameOf(mon)
      if (isTuckedIn()) {
        await setAsleep($, false)
        return { text: name + ' wakes up.' }
      }
      if (turnRunning) return { text: name + " can't sleep while Claude is working." }
      await setAsleep($, true)
      return { text: name + ' curls up and falls asleep. Its meters drain slower until Claude starts working.' }
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
      const name = nameOf(mon)
      return { text: needsOn ? 'Needs are on. Keep ' + name + ' fed and happy.' : 'Needs are off. ' + name + ' won\'t get hungry or lonely.' }
    } else if (asked === 'emoji') {
      emojiOn = !emojiOn
      await $.store.set('emoji', emojiOn)
      $.ui.invalidate('ui.render')
      const icons = iconsFor('food').trimEnd() + ' ' + iconsFor('happiness').trimEnd()
      return { text: (emojiOn ? 'The meters show emoji: ' : 'The meters show text icons: ') + icons }
    } else if (asked === 'autoevolve') {
      autoEvolve = !autoEvolve
      await $.store.set('autoEvolve', autoEvolve)
      const name = nameOf(mon)
      if (!autoEvolve) {
        evolveDue = null
        return { text: name + ' waits for /pokemon evolve when it reaches its evolution level.' }
      }
      // Already at its level, it evolves once idle
      evolveDue = readyToEvolve()
      return { text: name + ' evolves on its own once idle at its evolution level.' }
    } else if (asked === 'evolve' || asked.startsWith('evolve ')) {
      return evolveCommand($, asked.slice('evolve'.length).trim())
    } else if (asked === 'stop') {
      return stopEvolution($)
    } else if (asked === 'stats') {
      return { text: await statsText($) }
    } else if (asked === 'box') {
      // List every record as last saved by any session
      const saved = await $.store.get('stats')
      if (saved && typeof saved === 'object') await freshen($, Object.keys(saved))
      return { text: boxText() }
    } else if (asked === 'release' || asked.startsWith('release ')) {
      const wanted = asked.slice('release'.length).trim()
      if (MONS.includes(wanted)) await freshen($, [wanted])
      const result = releaseCommand(wanted)
      if (MONS.includes(wanted)) await saveRecords($, [wanted])
      $.ui.invalidate('ui.render')
      return result
    } else if (asked === 'nickname' || asked.startsWith('nickname ')) {
      await freshen($, [mon])
      const result = nicknameCommand(e.args.trim().slice('nickname'.length))
      await saveRecords($, [mon])
      $.ui.invalidate('ui.render')
      return result
    } else if (asked === 'list') {
      return { text: MONS.length + ' mons: ' + MONS.join(', ') }
    } else if (asked) {
      return { text: 'Unknown option "' + asked + '". Try one of: ' + OPTIONS.join(', ') + '. See /pokemon list for every mon.' }
    } else {
      const mode = (isTuckedIn() ? ', asleep' : '') + (wander ? ', wandering' : '')
      const levels = 'food ' + Math.round(statNow(mon, 'food')) + '%, happiness ' + Math.round(statNow(mon, 'happiness')) + '%'
      const shown = nameOf(mon) + ' Lv. ' + levelOf(mon)
      return { text: 'Showing ' + variant + ' ' + shown + mode + ' (' + (needsOn ? levels : 'needs off') + '). Options: ' + OPTIONS.join(', ') + '.' }
    }
    $.ui.invalidate('ui.render')
    return { text: 'Now showing ' + variant + ' ' + nameOf(mon) + '.' }
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

  on('turn.start', async ($, e, next) => {
    turnRunning = true
    return next(e)
  })

  // The main agent's turn ending answers any "!" and starts the idle minute. The mon
  // hops unless the turn was interrupted, and earns XP when it answered. A subagent's
  // turn ending pops its Poké Ball.
  on('turn.complete', async ($, e, next) => {
    thinking = false
    markActive()
    if (e.agentId) party = leaveParty(party, e.agentId, tick)
    if (!e.agentId) {
      turnRunning = false
      clearAlert()
    }
    if (!e.agentId && !e.isAborted) {
      hopStart = tick
      idleAlertAt = tick + IDLE_WAIT_MS / TICK_MS
    }
    if (!e.agentId && e.reason === 'answer') await gainXp($, e.durationMs ?? 0).catch((err) => logOnce($, err))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const desktop = e.surface === 'desktop'
    if ((e.surface !== 'terminal' && !desktop) || e.props.hasSurvey) {
      bandId = null
      return next(e)
    }
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const wasHome = isHome()
    working = e.props.isWorking
    if (!working) thinking = false
    bandId = e.requestId
    bandSurface = e.surface
    maxRows = e.props.maxRows
    // The panel goes over the scene's right end when the band shows at full size and
    // has room for it, and beside a shrunk band otherwise. The desktop draws text in its
    // own font, so its meters can't line up with the pixels and always sit beside them.
    const panelColumns = meterColumns() + 1
    const fullSize = bandRows() <= maxRows
    panel = !desktop && fullSize && e.props.bodyColumns >= SPRITES[mon].width + panelColumns ? panelColumns : 0
    columns = Math.max(SPRITES[mon].width, Math.min(STRIP_COLUMNS, e.props.bodyColumns - panel))
    margin = fullSize ? Math.max(0, Math.min(BUBBLE_SPAN, e.props.bodyColumns - panel - columns)) : 0
    if (wasHome) x = homeX()
    clampX()

    const meter = (key, lead = '') => Text({ color: meterStyle()[key].color, children: [lead + iconsFor(key)] })
    const level = Text({ dimColor: true, children: [levelLine()] })
    const zoom = bandZoom()
    let corner
    if (zoom) {
      let sprite
      if (desktop) {
        const svg = svgNow()
        if (svg !== sentSvg) svgFrame += 1
        sentSvg = svg
        const image = elements.Svg({ source: svg, alt: nameOf(mon), width: zoom.columns * PIXEL_PX, height: zoom.rows * 2 * PIXEL_PX })
        sprite = Box({ key: 'pokemon-' + svgFrame, children: [image] })
      } else {
        sentCells = cellsNow()
        sprite = elements.Raster({ key: 'pokemon', columns: zoom.columns, rows: zoom.rows, cells: sentCells })
      }
      const meterLines = needsOn ? [level, meter('food'), meter('happiness')] : [level]
      if (panel > 0) {
        const meters = Box({ position: 'absolute', right: 0, bottom: 0, width: panel, paddingLeft: 1, flexDirection: 'column', children: meterLines })
        corner = [Box({ position: 'relative', children: [sprite, meters] })]
      } else {
        const meters = Box({ flexDirection: 'column', justifyContent: 'flex-end', paddingLeft: 1, children: meterLines })
        corner = e.props.bodyColumns >= zoom.columns + panelColumns ? [sprite, meters] : [sprite]
        // The desktop clips the band's right edge, so its meters keep clear of it
        if (desktop) corner = [Box({ flexDirection: 'row', flexShrink: 0, paddingRight: 2, children: corner })]
      }
    } else {
      // Too short even for a shrunk mon: its name, level, and meters on one line, and no blits
      bandId = null
      const name = Text({ children: [nameOf(mon) + ' ' + levelLine()] })
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

  // Show the main loop's running tools in the bubble, and any agent's running skill as
  // a TM disc, and call you over while one asks you something. A call resolving also
  // settles a dialog waiting on its tool.
  // A call that errors or throws makes the mon flinch, unless you interrupted it or
  // it was refused: by the permission check, at its dialog, or by a hook beneath.
  on('tool.call', async ($, e, next) => {
    const name = String(e.tool)
    let id = null
    toolCalls += 1
    const skillId = name === 'Skill' ? (e.tool_use_id ?? toolCalls) : null
    if (skillId !== null) runningSkills.add(skillId)
    if (!e.agentId) {
      id = e.tool_use_id ?? toolCalls
      runningTools.set(id, name)
      if (QUESTION_TOOLS.includes(name)) raiseAlert({ tool: name })
    }
    let failed = true
    try {
      const result = await next(e)
      failed = result?.isError === true && !REFUSED.test(String(result.text ?? ''))
      return result
    } finally {
      if (skillId !== null) runningSkills.delete(skillId)
      if (id !== null) {
        runningTools.delete(id)
        if (failed && !next.signal?.aborted && verdicts.get(id) !== 'deny') flinch()
        verdicts.delete(id)
      }
      alertTools.delete(name)
    }
  })

  // A skill you type as /name runs as a command, with no Skill call, and a forked one
  // also spawns no agent, so the command running is the only sign of it. A command from
  // your own files, a plugin, or an MCP server counts as a skill; Claude Code's built-in
  // commands, and /pokemon itself, don't. The disc shows for a moment.
  on('command.run', async ($, e, next) => {
    if (e.command !== 'pokemon') await markSkillCommand($, e.command).catch((err) => logOnce($, err))
    return next(e)
  })

  // The typings say a skill's prompt expanding raises this, for /name, the Skill tool,
  // and a preload into a subagent. In practice no session raises it yet, so the hooks
  // above carry the disc, and this one is ready for when it does.
  on('skill.prompt', async ($, e, next) => {
    discUntil = tick + DISC_TICKS
    return next(e)
  })

  // Note what the permission check decides for the main loop's calls, so a call it
  // denies isn't taken for a tool failing
  on('tool.check', async ($, e, next) => {
    const result = await next(e)
    if (e.tool_use_id !== undefined && runningTools.has(e.tool_use_id)) verdicts.set(e.tool_use_id, result?.decision)
    return result
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
  // the strip, until its turn ends or the agent list stops reporting it at work
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result?.agentId) party = joinParty(party, result.agentId, tick)
    return result
  })
}
