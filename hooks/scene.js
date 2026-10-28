import { ALERT_ICON, INKS, OWNED_BALL, OWNED_COLORS, shrunkBubble, SMALL_ZS, SPARKLE, SPARKLES, stamp, stampPixel } from './art.js'
import { attackFrame, attackPose } from './attacks.js'
import { bubbleIcon, bubbleStamps, dotsIcon, sleepStamps, sweatStamps, toolIcon, toolKind } from './bubble.js'
import { FLINCH_TICKS, HEAD_PIXELS, SHAKE_TICKS, TICK_MS } from './constants.js'
import { ballOpen, crewFlash, crewHidden, crewHopping, crewPhase, crewRed, crewTool, crewWalking, isShown } from './crew.js'
import { dizzyStamps } from './faint.js'
import { SPRITES } from './frames.js'
import { atCenter, centerStamps, RECALL_RED, recallFlash, recallTint, sparkleStamps } from './joy.js'
import {
  bandRows, bandZoom, foeBox, foeMiddle, foeName, homeBox, homeXOf, isHome, isSmall, sceneColumns, stripColumns, wildAt,
} from './layout.js'
import { flinchJolt, foodPixel, heartStamps, isWalking, smallBerryStamp } from './motion.js'
import { BALL, BALL_COLORS, FLASH, LEANS, LIGHT_COLORS, OPEN, partyStamps } from './party.js'
import { healTicks } from './records.js'
import {
  bodyOf, boxOf, COLORS, faintedColors, faintedFrame, frameAt, gapOf, gapUnder, headOf, pupilsAt, sleepingFrame, WALK_DROP,
} from './sprites.js'
import { S } from './state.js'
import { isAsleep, isBackingUp, isDown, isHealing, isHopping, isShaking, isWincing } from './status.js'
import { foeBlinks, foeJolt, foeX, HP_BAR, hpBar, isHere, isOnStage, THROW_TICKS, throwStage } from './wild.js'
import { zoomedAt, zoomedPixel } from './zoom.js'

// One frame of the scene put together: the mon as its pose and move leave it, the foe,
// the ball, and every stamp over and under them

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

// Going to the Pokémon Center, the fainted mon turns red on its way into its ball, as in joy.js
const mixed = (c, to, k) => {
  const at = (shift) => Math.round(((c >> shift) & 255) * (1 - k) + ((to >> shift) & 255) * k)
  return (at(16) << 16) | (at(8) << 8) | at(0)
}

const RELEASE_BEAT = 3
function flashStamps(heal, body) {
  const k = S.releasedAt === null ? -1 : Math.floor((S.tick - S.releasedAt) / RELEASE_BEAT)
  return flashAt(heal ? recallFlash(heal, S.tick) : k >= 0 && k < FLASH.length ? FLASH[k] : null, body)
}

// A FLASH frame over the middle of a body, or nothing without one
function flashAt(art, body) {
  if (!art) return []
  const half = Math.floor(art.length / 2)
  const x = Math.round((body.left + body.right) / 2) - half
  const y = Math.round((body.top + body.bottom) / 2) - half
  return [stamp(x, Math.max(0, y), art, LIGHT_COLORS)]
}

const NO_POSE = { view: 'front', stride: false, swap: false, asleep: false }
// Backing up for a move: side on and striding, facing the target
const BACKING_POSE = { ...NO_POSE, view: 'side', stride: true }
const NO_EFFECT = {
  dots: [], under: [], chars: [], ghosts: [], hidden: false,
  dx: 0, dy: 0, sx: 1, sy: 1, flipX: false, flipY: false, skew: null, shade: null, shake: [0, 0],
}
const STRIDE_TICKS = 2

// Where the sprite stands in strip pixels, for aiming an attack
function attackGeometry(sprite, frame, colors, flip, at, top, rows, pixel, side, target) {
  const box = boxOf(frame, colors)
  return {
    x: at,
    left: at + (flip ? sprite.width - 1 - box.right : box.left),
    right: at + (flip ? sprite.width - 1 - box.left : box.right),
    top: top + box.top,
    bottom: top + box.bottom,
    columns: S.columns,
    pixels: rows * 2,
    side: side === 'left' ? -1 : 1,
    body: bodyOf(frame, colors),
    solid: (cx, py) => pixel(cx - at, py - top) !== null,
    foe: target,
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

// The HP bar, a pixel row centred over the standing foe's head with a row of space
// between, so a tail or an arm out to one side doesn't pull it off. It takes a pixel more
// over a head an odd number of pixels wide, so it can sit exactly in the middle. A foe
// whose species is caught has a tiny ball a pixel right of the bar.
function hpStamps(rows) {
  if (S.wild.phase !== 'battle') return []
  const box = foeBox(rows)
  const head = headOf(foeName(), S.wild.variant)
  const at = foeX(S.wild, wildAt())
  const span = head.right - head.left + 1
  const bar = hpBar(S.wild, S.ink.hpEmpty, HP_BAR + ((span - HP_BAR) & 1))
  const left = at + head.left + (span - bar.width) / 2
  const y = Math.max(0, box.top - 2)
  const hp = stamp(left, y, bar.rows, bar.colors)
  if (!S.wild.owned) return [hp]
  return [hp, stamp(left + bar.width + 1, Math.max(0, y - 1), OWNED_BALL, { ...OWNED_COLORS, w: S.ink.ball })]
}

// The foe as a color per strip pixel or null: walk frames on the way in, idle frames in
// battle, and walk frames mirrored on the way out. A hit jolts it and makes it blink, and
// a strike plays one of its moves at the home mon, with the move's drawing on the
// returned pixel as effect. Fainted, it lies in its X-eyed frame.
// A ball that opens on it shades it red and shrinks it into the ball, and it stays
// inside until it breaks out.
function foePixel(rows) {
  if (foeBlinks(S.wild, S.tick)) return () => null
  const held = S.wild.phase === 'throw' ? throwStage(S.wild.throw, S.tick) : null
  if (held && !['arc', 'open'].includes(held.stage) && !(held.stage === 'breakout' && held.t >= THROW_TICKS.open)) return () => null
  const foe = foeName()
  const sprite = SPRITES[foe]
  const sheet = sprite.variants[S.wild.variant]
  const walking = S.wild.phase === 'entering' || S.wild.phase === 'fleeing'
  const fainted = S.wild.phase === 'fainted'
  const strike = S.wild.phase === 'battle' && S.wild.strike && S.tick - S.wild.strike.start < S.wild.strike.attack.ticks ? S.wild.strike : null
  const age = strike ? S.tick - strike.start : 0
  const pose = strike ? attackPose(strike.attack, age) : null
  const sideOn = walking || pose?.view === 'side'
  let frame = frameAt(walking ? sheet.walk : sheet.idle, S.tick * TICK_MS)
  if (fainted) frame = faintedFrame(foe, S.wild.variant)
  else if (pose && sideOn) frame = sheet.walk[pose.stride ? Math.floor(age / STRIDE_TICKS) % sheet.walk.length : 0].rows
  const colors = fainted ? faintedColors(foe, S.wild.variant) : COLORS[foe][S.wild.variant]
  const flip = S.wild.phase === 'fleeing'
  const drop = fainted ? gapOf(frame) - gapUnder(sheet.idle) : sideOn ? WALK_DROP[foe][S.wild.variant] : 0
  const top = rows * 2 - sprite.height + drop
  const left = foeX(S.wild, wildAt()) + foeJolt(S.wild, S.tick)
  const rawOf = (mirror) => (px, qy) => {
    const row = frame[qy]
    if (!row || px < 0 || px >= sprite.width) return null
    return colors[row[mirror ? sprite.width - 1 - px : px]] ?? null
  }
  const raw = rawOf(flip)
  const pixel = (cx, py) => raw(cx - left, py - top)
  if (fainted) return pixel
  if (strike) {
    const effect = attackFrame(strike.attack, age, attackGeometry(sprite, frame, colors, false, left, top, rows, raw, 'right', homeBox(rows)))
    const body = bodyPixel(effect, rawOf(effect.flipX), boxOf(frame, colors), sprite.width, effect.flipX, left + effect.dx, top + effect.dy)
    const drawn = effect.hidden ? () => null : body
    drawn.effect = effect
    return drawn
  }
  if (held?.stage !== 'open') {
    pixel.pupils = pupilsAt(foe, S.wild.variant, walking ? 'walk' : 'idle', frame, { left, top, mirrored: flip })
    return pixel
  }
  const scale = 1 - (held.t + 1) / (THROW_TICKS.open + 1)
  const { x: bx, y: by } = foeMiddle(rows)
  return (cx, py) => {
    const c = pixel(Math.floor(bx + (cx + 0.5 - bx) / scale), Math.floor(by + (py + 0.5 - by) / scale))
    return c === null ? null : reddened(c)
  }
}

// A color pulled most of the way to red, as a ball's beam takes the foe in
const reddened = (c) => (((c >> 16) * 0.3 + 0xff * 0.7) << 16) | (((c >> 8) & 255) * 0.3 + 0x30 * 0.7) << 8 | ((c & 255) * 0.3 + 0x30 * 0.7)

const BALL_HALF = Math.floor(BALL[0].length / 2)
const ARC_PIXELS = 8

// The ball's stamps this tick of a throw: flying in an arc from
// the home mon's head to the foe, opening on it, dropping to the ground with a bounce,
// rocking a shake at a time, then still with sparkles or bursting open in a flash.
// The ball in the air goes over the scene, and on the ground under it.
function throwStamps(rows, from) {
  if (S.wild?.phase !== 'throw') return { over: [], under: [] }
  const { stage, t } = throwStage(S.wild.throw, S.tick)
  const mid = foeMiddle(rows)
  const rest = rows * 2 - BALL.length
  const top = mid.y - Math.floor(BALL.length / 2)
  const at = (y, art, colors = BALL_COLORS) => stamp(mid.x - BALL_HALF, y, art, colors)
  if (stage === 'arc') {
    const u = (t + 1) / THROW_TICKS.arc
    const x = Math.round(from.x + (mid.x - from.x) * u)
    const y = Math.round(from.y + (top - from.y) * u - ARC_PIXELS * 4 * u * (1 - u))
    return { over: [stamp(x - BALL_HALF, Math.max(0, y), BALL, BALL_COLORS)], under: [] }
  }
  if (stage === 'open') {
    const art = OPEN[Math.min(t, OPEN.length - 1)]
    return { over: [at(top - (art.length - BALL.length), art, LIGHT_COLORS)], under: [] }
  }
  if (stage === 'drop') {
    const since = t - S.wild.throw.drop
    const y = since < 0 ? top + t : since >= 1 && since < 3 ? rest - 1 : rest
    return { over: [], under: [at(Math.min(rest, y), BALL)] }
  }
  if (stage === 'wobble') {
    const k = Math.floor((t % THROW_TICKS.shake) / 3)
    return { over: [], under: [at(rest, LEANS[[0, 1, 2, 1][k]])] }
  }
  if (stage === 'caught') {
    const twinkle = t < 12 ? SPARKLES.filter((_, i) => (i + Math.floor(t / 2)) % 2 === 0) : []
    const sparks = twinkle.map(([dx, dy]) => stamp(mid.x - BALL_HALF + dx, rest + dy, ['.s.', 'sws', '.s.'], SPARKLE))
    return { over: sparks, under: [at(rest, BALL)] }
  }
  if (stage === 'breakout') {
    if (t < THROW_TICKS.open) {
      const art = OPEN[Math.min(t, OPEN.length - 1)]
      return { over: [at(rest - (art.length - BALL.length), art, LIGHT_COLORS)], under: [] }
    }
    const flash = FLASH[Math.min(FLASH.length - 1, Math.floor((t - THROW_TICKS.open) / 2))]
    return { over: [at(rest - (flash.length - BALL.length), flash, LIGHT_COLORS)], under: [] }
  }
  return { over: [], under: [] }
}

// What a party mon's bubble shows: its agent's running tool, or dots while it thinks
export function crewIcon(m) {
  if (crewPhase(m, S.tick) !== 'out') return null
  const tool = crewTool(m)
  if (tool !== null) return toolIcon(toolKind(tool))
  return m.thinking ? dotsIcon() : null
}

// Each party mon on stage as drawn this tick, its feet on the ground of a band rows tall:
// its pixels, its frame's pupils, its head and body, where its bubble leads, and its
// stamps in front of the scene, the sweat of a flinch and the flash it comes and goes in.
// Inside the flash its body stays out of sight, so the flash reads as it coming and going.
// Its bubble keeps between its neighbors' heads, the last one's short of limit.
function crewDrawn(rows, limit) {
  const mates = S.crew
    .filter((m) => isShown(m, S.tick))
    .map((m) => {
      const sprite = SPRITES[m.mon]
      const walking = crewWalking(m, S.tick, FLINCH_TICKS)
      const view = walking ? 'walk' : 'idle'
      const frame = frameAt(sprite.variants[m.variant][view], S.tick * TICK_MS)
      const colors = COLORS[m.mon][m.variant]
      const flip = walking && m.facing === 'left'
      const red = crewRed(m, S.tick)
      const hidden = crewHidden(m, S.tick)
      const since = m.flinchAt === null ? Infinity : S.tick - m.flinchAt
      const shaking = since < SHAKE_TICKS ? (Math.floor(since / 2) % 2 === 0 ? -1 : 1) : 0
      const left = m.x + shaking
      const top = rows * 2 - sprite.height + (walking ? WALK_DROP[m.mon][m.variant] : 0) - (crewHopping(m, S.tick) ? 2 : 0)
      const local = (px, py) => {
        const row = frame[py]
        if (!row || px < 0 || px >= sprite.width) return null
        return colors[row[flip ? sprite.width - 1 - px : px]] ?? null
      }
      const pixel = (cx, py) => {
        if (hidden) return null
        const c = local(cx - left, py - top)
        return c === null || red === 0 ? c : mixed(c, RECALL_RED, red * 0.8)
      }
      const box = boxOf(frame, colors)
      const [boxLeft, boxRight] = flip ? [sprite.width - 1 - box.right, sprite.width - 1 - box.left] : [box.left, box.right]
      const body = { left: left + boxLeft, right: left + boxRight, top: top + box.top, bottom: top + box.bottom }
      const head = headColumns(local, sprite.width, left)
      const pupils = red === 0 && !hidden ? pupilsAt(m.mon, m.variant, view, frame, { left, top, mirrored: flip }) : []
      return { m, pixel, pupils, head, body, side: walking ? m.facing : 'left', since, icon: crewIcon(m) }
    })
    .sort((a, b) => a.head[0] - b.head[0])
  return mates.map((mate, i) => {
    const room = [i > 0 ? mates[i - 1].head[1] + 1 : -S.margin, i + 1 < mates.length ? mates[i + 1].head[0] : limit]
    const wincing = mate.since < FLINCH_TICKS && crewPhase(mate.m, S.tick) === 'out'
    const sweat = wincing ? sweatStamps(mate.head, mate.body.top, mate.side, { since: mate.since, room }) : []
    return { ...mate, room, front: [...sweat, ...flashAt(crewFlash(mate.m, S.tick), mate.body)] }
  })
}

// The current frame, zoomed to the band or at full size: a color or null per pixel, two
// pixel rows per cell, and the effects' glyphs by cell
export function frameNow(full = false) {
  const playing = S.attack !== null && !isBackingUp()
  const age = S.attack ? S.tick - S.attack.start : 0
  const pose = playing ? attackPose(S.attack, age) : S.attack ? BACKING_POSE : NO_POSE
  const shown = pose.swap ? S.attack.swap : S.mon
  const sprite = SPRITES[shown]
  const sheet = sprite.variants[S.variant]
  const walking = isWalking()
  // A move faces its target side on, with the walk frames held still unless it strides
  const sideOn = S.attack ? pose.view === 'side' : walking
  const anim = sideOn ? sheet.walk : sheet.idle
  const asleep = isAsleep() || pose.asleep
  // A swapped-in mon stands on the same ground and stays inside the strip. An evolving
  // mon at home keeps to the right edge in either shape.
  const baseX = Math.max(0, Math.min(S.evolving && isHome() ? homeXOf(shown) : S.x, S.columns - sprite.width))
  // A fainted mon lies still in one frame with X eyes, in its fainted palette. Healing,
  // it's in its ball at the Pokémon Center, and once the heal is over it's back on its feet.
  const down = isDown()
  const healing = down && isHealing(S.mon)
  const heal = healing ? healTicks() : null
  const red = healing ? recallTint(heal, S.tick) : 0
  const away = healing && (atCenter(heal, S.tick) || red >= 1)
  const knockedOut = down && !(healing && S.tick >= heal.endTick)
  let frame = frameAt(anim, S.tick * TICK_MS)
  if (knockedOut) frame = faintedFrame(shown)
  else if (asleep) frame = sleepingFrame(shown, sideOn ? 'walk' : 'idle')
  else if (S.attack && sideOn) frame = anim[pose.stride ? Math.floor(age / STRIDE_TICKS) % anim.length : 0].rows
  const colors = knockedOut ? faintedColors(shown) : COLORS[shown][S.variant]
  // Facing out, the sprite stays unmirrored like the idle mon, so it doesn't jump when the move ends
  const flip = S.attack ? sideOn && S.attack.side === 'left' : walking && S.facing === 'left'
  const rows = bandRows()
  // A sleeping mon holds one frame, lowered so its feet rest where the idle ones do
  const drop = asleep || knockedOut ? gapOf(frame) - gapUnder(sheet.idle) : sideOn ? WALK_DROP[shown][S.variant] : 0
  const baseTop = rows * 2 - SPRITES[shown].height + drop
  const box = boxOf(frame, colors)
  const pixelOf = (mirror) => (px, py) => {
    if (px < 0 || px >= sprite.width || py < 0) return null
    const row = frame[py]
    if (!row) return null
    return colors[row[mirror ? sprite.width - 1 - px : px]] ?? null
  }
  const pixel = pixelOf(flip)
  let effect = NO_EFFECT
  if (playing) {
    const target = S.attack.atFoe && isHere(S.wild) ? foeBox(rows) : null
    effect = attackFrame(S.attack, age, attackGeometry(sprite, frame, colors, flip, baseX, baseTop, rows, pixel, S.attack.side, target))
  }
  else if (away) effect = { ...NO_EFFECT, hidden: true }
  else if (red > 0) effect = { ...NO_EFFECT, shade: (cx, py, c) => mixed(c, RECALL_RED, red * 0.8) }
  // With a foe on stage the bubble has no room, so only the "!" shows, over the foe
  const onStage = isOnStage(S.wild)
  const foe = onStage ? foePixel(rows) : null
  const foeEffect = foe?.effect ?? NO_EFFECT
  const overlay = overlayOf([...effect.dots, ...foeEffect.dots], rows)
  const underlay = overlayOf([...effect.under, ...foeEffect.under], rows)
  const jolt = flinchJolt(baseX, sprite.width)
  const hopUp = !S.attack && !down && !isShaking() && isHopping() && Math.floor((S.tick - S.hopStart) / 3) % 2 === 0
  const top = baseTop + effect.dy - (hopUp ? 2 : 0)
  const left = baseX + effect.dx + jolt
  const mirrored = flip !== effect.flipX
  const body = bodyPixel(effect, pixelOf(mirrored), box, sprite.width, mirrored, left, top)
  const ghost = ghostPixel(effect.ghosts, pixel, box, sprite.width, flip, baseX, baseTop)
  const head = headColumns(pixel, sprite.width, left)
  // A party mon's bubble stops short of the foe's columns, or else the lead's head
  const mates = crewDrawn(rows, onStage ? S.crewWidth : head[0] - 1)
  const wanted = bubbleIcon()
  const icon = onStage && wanted !== ALERT_ICON ? null : wanted
  // The frame's box as drawn, mirrored along with the sprite
  const [boxLeft, boxRight] = flip ? [sprite.width - 1 - box.right, sprite.width - 1 - box.left] : [box.left, box.right]
  const sleeper = { left: left + boxLeft, right: left + boxRight, top: top + box.top, bottom: top + box.bottom }
  const bubbleSide = walking ? S.facing : 'left'
  // The Pokémon Center stands on the ground at the right of the mon's columns, clear of the panel
  const center = { ground: rows * 2 - 1, right: S.columns - 1 }
  // Stars circle over a fainted mon until it goes to the Pokémon Center
  const dizzy = knockedOut && !healing
  // A shrunk band draws the bubble, the Zs, and the berry over the shrunk scene in its own
  // pixels, so they stay whole
  const scene = sceneColumns()
  const zoom = (!full && bandZoom()) || { scale: 1, columns: scene, rows }
  const shrunk = zoom.scale < 1
  const bubble = icon && !shrunk ? bubbleStamps(icon, head, bubbleSide) : []
  const mateBubbles = shrunk ? [] : mates.flatMap((m) => (m.icon ? bubbleStamps(m.icon, m.head, m.side, m.room) : []))
  const ball = throwStamps(rows, { x: Math.round((head[0] + head[1]) / 2), y: top + box.top })
  const over = [
    ...ball.over,
    ...(onStage ? [...bubble, ...hpStamps(rows)] : []),
    ...heartStamps(),
    ...(isWincing() ? sweatStamps(head, top + box.top, bubbleSide) : []),
    ...mates.flatMap((m) => m.front),
    ...mateBubbles,
    ...(asleep && !shrunk ? sleepStamps(sleeper) : []),
    ...(dizzy && !shrunk ? dizzyStamps(S.tick, sleeper, { light: S.ink === INKS.light }) : []),
    ...flashStamps(heal, sleeper),
    ...(away && !shrunk ? sparkleStamps(heal, S.tick, center, { light: S.ink === INKS.light }) : []),
    ...(away ? centerStamps(heal, S.tick, center) : []),
  ]
  const still = new Set(S.crew.filter((m) => m.outAt !== null).map((m) => m.id))
  const open = new Set(S.crew.filter((m) => ballOpen(m, S.tick)).map((m) => m.id))
  const balls = partyStamps(S.party, S.tick, { columns: S.columns, ground: rows * 2 - 1, label: S.ink.party, still, open })
  const under = [...ball.under, ...(onStage ? [] : bubble), ...balls]
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
    const f = shrunk ? null : foodPixel(cx, py)
    if (f !== null) return f
    const c = effect.hidden ? null : body(cx, py)
    if (c !== null) return c
    for (const m of mates) {
      const p = m.pixel(cx, py)
      if (p !== null) return p
    }
    const w = foe ? foe(cx, py) : null
    if (w !== null) return w
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
  const [shakeX, shakeY] = playing ? effect.shake : foeEffect.shake
  const shaken = (cx, py) => (cx - shakeX < 0 || cx - shakeX >= scene ? null : colorAt(cx - shakeX - S.margin, py - shakeY))
  // The eyes kept through the shrink: the mon's, unless a move hides or reshapes it, and the foe's
  const reshaped = effect.hidden || effect.sx !== 1 || effect.sy !== 1 || effect.skew || effect.flipY
  // A fainted mon's eyes are Xs, with no pupils to keep
  const own = shrunk && !reshaped && !knockedOut ? pupilsAt(shown, S.variant, sideOn ? 'walk' : 'idle', frame, { left, top, mirrored }) : []
  const pupils = [...own, ...(shrunk ? [...(foe?.pupils ?? []), ...mates.flatMap((m) => m.pupils)] : [])].map(([px, py, c, eye]) => [px + S.margin + shakeX, py + shakeY, c, eye && [eye[0] + S.margin + shakeX, eye[1] + shakeY, ...eye.slice(2)]])
  const zoomed = zoomedPixel(shaken, { columns: scene, pixels, scale: zoom.scale, pupils })
  // The head's zoomed columns, from the first its left column covers to the last its right one does
  const [headLeft, headRight] = head.map((c) => c + S.margin)
  const zoomedHead = [zoomedAt(headLeft, zoom.scale), Math.max(zoomedAt(headRight, zoom.scale), zoomedAt(headRight + 1, zoom.scale) - 1)]
  // It keeps clear of the meters drawn over the small band's right end
  const bubbleRoom = [0, zoom.columns - (isSmall() ? Math.round(S.panel * zoom.scale) : 0)]
  const zoomedBubble = shrunk && icon ? bubbleStamps(icon, zoomedHead, bubbleSide, bubbleRoom, shrunkBubble(icon)) : []
  const zoomedSpan = ([l, r]) => [zoomedAt(l + S.margin, zoom.scale), Math.max(zoomedAt(r + S.margin, zoom.scale), zoomedAt(r + S.margin + 1, zoom.scale) - 1)]
  const zoomedMates = shrunk
    ? mates.flatMap((m) => (m.icon ? bubbleStamps(m.icon, zoomedSpan(m.head), m.side, zoomedSpan(m.room), shrunkBubble(m.icon)) : []))
    : []
  // The Zs and the berry, in front of the shrunk scene as they are at full size
  const zoomedX = (c) => zoomedAt(c + S.margin + shakeX, zoom.scale)
  const zoomedY = (py) => zoomedAt(py + shakeY, zoom.scale)
  const zoomedSleeper = { left: zoomedX(sleeper.left), right: zoomedX(sleeper.right), top: zoomedY(sleeper.top), bottom: zoomedY(sleeper.bottom) }
  const front = shrunk
    ? [
        ...(asleep ? sleepStamps(zoomedSleeper, SMALL_ZS) : []),
        ...(dizzy ? dizzyStamps(S.tick, zoomedSleeper, { light: S.ink === INKS.light, small: true }) : []),
        ...(S.food ? [smallBerryStamp(zoom.scale, S.margin + shakeX)] : []),
      ]
    : []
  const stampsAt = (stamps) => (tx, ty) => {
    for (const s of stamps) {
      const b = stampPixel(s, tx, ty)
      if (b !== null) return b
    }
    return null
  }
  const frontAt = stampsAt(front)
  const sceneAt = front.length === 0 ? zoomed : (tx, ty) => frontAt(tx, ty) ?? zoomed(tx, ty)
  // As at full size, the lead's bubble sits behind the scene, and over it while a foe is
  // on stage, and the party mons' sit over it, where a cramped one can't hide behind a neighbor
  const overAt = stampsAt(onStage ? [...zoomedMates, ...zoomedBubble] : zoomedMates)
  const behindAt = stampsAt(onStage ? [] : zoomedBubble)
  const drawn = zoomedBubble.length + zoomedMates.length === 0 ? sceneAt : (tx, ty) => overAt(tx, ty) ?? sceneAt(tx, ty) ?? behindAt(tx, ty)
  // A small band of an odd number of rows has a half row to spare, left on top so the
  // mon keeps its feet on the band's bottom edge
  const spare = zoom.rows * 2 - Math.round(pixels * zoom.scale)
  const at = spare > 0 ? (tx, ty) => drawn(tx, ty - spare) : drawn
  const glyphs = new Map()
  const chars = [...effect.chars, ...foeEffect.chars]
  for (let k = 0; k < chars.length; k += 4) {
    const gx = zoomedAt(chars[k] + shakeX + S.margin, zoom.scale)
    glyphs.set(gx + ',' + zoomedAt(chars[k + 1], zoom.scale), [chars[k + 2], chars[k + 3]])
  }
  return { at, glyphs, zoom }
}
