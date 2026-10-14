import {
  ALERT_ICON, BIG_Z, BUBBLE_ICONS, BUBBLE_TAIL_ROW, bubbleSpan, FULL_BUBBLE, SMALL_STAR, SMALL_TOOL_ICONS, SMALL_Z, stamp, STAR,
  SWEAT, TOOL_ICONS, TOOL_KINDS,
} from './art.js'
import { DRIP_TICKS, TICK_MS } from './constants.js'
import { stripColumns } from './layout.js'
import { NEEDY_BELOW, statNow, STATS } from './meters.js'
import { S } from './state.js'
import { isAsleep, isDown, isPetted, markActive } from './status.js'

// What shows by the mon's head: the thought bubble and its icon, the "!" that calls you
// over, the Zs while it sleeps, and a sweat drop when a tool call fails

const ZZZ_EVERY_MS = 1100
const ZZZ_LIFE_MS = 2200
// The gap between a new Z and the side of the body, and how far out it drifts from there, in pixels
const ZZZ_GAP = 0
const ZZZ_DRIFT = 4
const IDLE_ALERT_MS = 2 * 60 * 1000

// The thinking dots: one to three grey pixels, growing in turn
export function dotsIcon() {
  const dots = 1 + (Math.floor((S.tick * TICK_MS) / 400) % 3)
  const row = ['d', '.', 'd', '.', 'd'].map((ch, i) => (i / 2 < dots ? ch : '.')).join('')
  return { rows: ['.....', '.....', row, '.....'], small: [row], colors: { d: S.ink.dots } }
}

// A skill is in use: a Skill call runs in some agent, or a skill was typed as /name
const skillInUse = () => S.runningSkills.size > 0 || S.tick < S.discUntil

export const toolKind = (name) => Object.keys(TOOL_KINDS).find((k) => TOOL_KINDS[k].includes(name)) ?? 'wrench'

// The kind of the main loop's most recently started tool that is still running. A skill
// in use anywhere, in the main loop or a subagent, shows as a TM disc instead.
const leadToolKind = () => (skillInUse() ? 'disc' : toolKind([...S.runningTools.values()].pop()))

// A tool kind's icon in the bubble
export function toolIcon(kind) {
  const colors = {
    p: S.ink.pencil, e: 0xe06888, t: 0xb88048, g: 0x767688,
    l: S.ink.lens, h: 0xb07040,
    s: S.ink.shell,
    r: 0xee4444, k: 0x60606c, w: 0xc0c0cc, b: S.ink.ball,
    c: S.ink.disc, d: S.ink.discShade, n: 0xf6f6fc,
    m: S.ink.wrench,
  }
  return { rows: TOOL_ICONS[kind], small: SMALL_TOOL_ICONS[kind], colors }
}

// What the bubble beside the head shows, if anything
export function bubbleIcon() {
  if (S.attack || isDown()) return null
  if (isAlerted()) return ALERT_ICON
  if (S.tick < S.yumUntil) return { rows: STAR, small: SMALL_STAR, colors: { s: S.ink.star } }
  if (skillInUse()) return toolIcon(leadToolKind())
  if (S.working && S.runningTools.size > 0) return toolIcon(leadToolKind())
  if (S.working && S.thinking) return dotsIcon()
  const need = S.needsOn && needNow()
  return need ? BUBBLE_ICONS[need] : null
}

// The mon calls you over while a dialog waits on a call to one of alertTools,
// or until a notification's alert runs out at alertUntil
export const isAlerted = () => S.alertTools.size > 0 || S.tick < S.alertUntil

// Wake up, stand still facing you, and show the "!" until a call to the tool
// resolves or the ticks run out, or until you answer first
export function raiseAlert({ tool, ticks }) {
  markActive()
  if (tool !== undefined) S.alertTools.add(tool)
  if (ticks !== undefined) S.alertUntil = Math.max(S.alertUntil, S.tick + ticks)
}

// Typing, sending, any /pokemon command, or the end of Claude's turn answers the "!",
// and the idle "!" waiting to show
export function clearAlert() {
  S.alertTools.clear()
  S.alertUntil = 0
  S.idleAlertAt = null
}

// Raise the idle "!" once its minute is up, unless a turn is running by then
export function stepIdleAlert() {
  if (S.idleAlertAt === null || S.tick < S.idleAlertAt) return
  S.idleAlertAt = null
  if (!S.working) raiseAlert({ ticks: IDLE_ALERT_MS / TICK_MS })
}

// A framed thought bubble beside the head, with a single pixel of tail between it and
// the head. It leads on the side a walking mon heads for, and sits on the left of a
// standing one, unless that side has no room for it. room is the columns it may take,
// the margin and the strip, or a shrunk band's own columns, and look the bubble drawn.
function bubbleOnLeft(head, side, room = [-S.margin, stripColumns()], look = FULL_BUBBLE) {
  const span = bubbleSpan(look)
  const fitsLeft = head[0] - span >= room[0]
  const fitsRight = head[1] + span + 1 <= room[1]
  return side === 'left' ? fitsLeft : fitsLeft && !fitsRight
}

export function bubbleStamps(icon, head, side, room, look = FULL_BUBBLE) {
  const { frame, inset, small } = look
  const onLeft = bubbleOnLeft(head, side, room, look)
  const left = onLeft ? head[0] - bubbleSpan(look) : head[1] + 4
  const tail = onLeft ? head[0] - 2 : head[1] + 2
  // The first stamp with a pixel wins, so the icon goes before the bubble
  return [
    stamp(left + inset[0], inset[1], small ? icon.small : icon.rows, icon.colors),
    stamp(left, 0, frame, { O: S.ink.bubble }),
    stamp(tail, BUBBLE_TAIL_ROW, ['O'], { O: S.ink.bubble }),
  ]
}

// Zs rising from just left of the middle of a sleeping body and drifting out and up until
// they float off the top of the band, small and big in turn, a new one every ZZZ_EVERY_MS.
// body is the sprite's drawn pixels in strip columns and pixel rows, so every mon's Zs
// start at the same spot on it whatever its shape. With no room on the left, they start
// from the right edge instead. look is the Zs drawn, and a shrunk band passes its own.
export function sleepStamps(body, { glyphs, drift: reach } = { glyphs: [SMALL_Z, BIG_Z], drift: ZZZ_DRIFT }) {
  const elapsed = S.tick * TICK_MS
  const middleY = Math.floor((body.top + body.bottom) / 2)
  const onLeft = body.left - ZZZ_GAP - glyphs[1][0].length - reach >= 0
  const newest = Math.floor(elapsed / ZZZ_EVERY_MS)
  const zs = []
  for (let i = Math.max(0, newest - 2); i <= newest; i++) {
    const p = (elapsed - i * ZZZ_EVERY_MS) / ZZZ_LIFE_MS
    if (p >= 1) continue
    const glyph = glyphs[i % 2]
    const drift = Math.round(p * reach)
    const x = onLeft ? body.left - ZZZ_GAP - glyph[0].length - drift : body.right + 1 + ZZZ_GAP + drift
    const startY = middleY - Math.floor(glyph.length / 2)
    zs.push(stamp(x, startY - Math.round(p * (startY + glyph.length)), glyph, { z: S.ink.z }))
  }
  return zs
}

// The sweat drop sliding down the corner of the head away from the bubble, which leads
// on side when there's room, since ticks into the flinch
export function sweatStamps(head, y, side, { since = S.tick - S.flinchStart, room } = {}) {
  const width = SWEAT[0].length
  const sx = bubbleOnLeft(head, side, room) ? Math.min(S.columns - width, head[1] - 1) : Math.max(0, head[0] - 2)
  const drip = Math.floor(since / DRIP_TICKS)
  return [stamp(sx, y + drip, SWEAT, { d: S.ink.sweat, h: S.ink.sweatShine })]
}

// What the idle mon is asking for, if anything. With both low it takes turns.
function needNow() {
  if (S.working || S.food || S.attack || isPetted() || isAsleep() || S.tick < S.yumUntil) return null
  const needs = Object.keys(STATS).filter((key) => statNow(S.mon, key) < NEEDY_BELOW)
  if (needs.length === 0) return null
  return needs[Math.floor((S.tick * TICK_MS) / 3000) % needs.length]
}
