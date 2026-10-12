import { HEAD_PIXELS, HEAD_ROWS } from './constants.js'
import { closedEyes, eyesOf, keptEyesOf, pupilsOf } from './eyes.js'
import { DIZZY_ROOM, faintedPalette, faintedRows } from './faint.js'
import { SPRITES } from './frames.js'
import { MOVES } from './moves.js'
import { S } from './state.js'
import { zoomedPixel } from './zoom.js'

// Every mon's sprite sheets, measured once into the tables the band lays out by, and the
// frames it draws a mon asleep, fainted, or resized in

// Every mon that can be shown: the bundled ones, then any fetched with /pokemon new
export const MONS = []
export const VARIANTS = ['default', 'shiny']

// Palette letter to 0xRRGGBB, per mon and variant
export const COLORS = {}
const spriteRows = (name) => Math.ceil(SPRITES[name].height / 2)

// The empty pixel rows under the feet in a frame, and the fewest across an animation's frames
export const gapOf = (rows) => rows.length - 1 - rows.findLastIndex((row) => /[^.]/.test(row))
export const gapUnder = (anim) => Math.min(...anim.map(({ rows }) => gapOf(rows)))
// How far to lower the walk frames so the feet stand where the idle frames' do,
// per mon and variant. Some sheets leave more empty rows under a walking mon.
export const WALK_DROP = {}
// The empty columns right of a mon, the fewest across its idle frames and its walk frames
// facing either way, per variant, so no frame steps closer to the meters than home allows.
// Many sheets draw the mon right up to the frame's edge.
export const RIGHT_GAP = {}
// The rightmost head column of a mon walking right, across its walk frames, per variant
export const WALK_HEAD_RIGHT = {}

// Measure a mon's sprite into the tables above, and list it unless it's a resized foe.
// Fetched mons join here too.
export function addSprite(name, sprite, listed = true) {
  SPRITES[name] = sprite
  if (listed && !MONS.includes(name)) MONS.push(name)
  const perVariant = (fn) => Object.fromEntries(VARIANTS.map((v) => [v, fn(sprite.variants[v])]))
  COLORS[name] = perVariant(({ palette }) =>
    Object.fromEntries(palette.map((hex, i) => [String.fromCharCode(97 + i), parseInt(hex.slice(1), 16)])),
  )
  WALK_DROP[name] = perVariant(({ walk, idle }) => gapUnder(walk) - gapUnder(idle))
  RIGHT_GAP[name] = perVariant(({ idle, walk }) => {
    const rights = [...idle, ...walk].flatMap(({ rows }) => rows.map((row) => row.search(/[^.]\.*$/)))
    // Facing left, a walk frame is mirrored, so its empty columns on the left end up on the right
    const lefts = walk.flatMap(({ rows }) => rows.map((row) => row.search(/[^.]/)).filter((left) => left >= 0))
    return Math.min(sprite.width - 1 - Math.max(...rights), ...lefts)
  })
  WALK_HEAD_RIGHT[name] = perVariant(({ walk }) =>
    Math.max(...walk.flatMap(({ rows }) => rows.slice(0, HEAD_PIXELS).map((row) => row.search(/[^.]\.*$/)))),
  )
}
for (const name of Object.keys(SPRITES)) addSprite(name, SPRITES[name])

// Along one axis of size pixels resized to count, the pixels that full-size pixels lo up
// to hi land on: blocks voted down to one when shrinking, copies spread out when growing
function resizedSpan(lo, hi, size, count) {
  if (count >= size) return [Math.ceil((lo * count) / size - 0.5), Math.ceil(((hi + 1) * count) / size - 0.5) - 1]
  const cell = (v) => {
    let t = 0
    while (t + 1 < count && Math.ceil(((t + 1) * size) / count) <= v) t++
    return t
  }
  return [cell(lo), cell(hi)]
}

// A mon's sprite resized to height pixels, the same scale both ways. A shrinking one takes
// the band's votes, eyes kept, and a growing one copies each pixel into a block. Each frame
// carries its pupils, moved with it, as eyes.js has no boxes for it.
export function resizedSprite(name, height) {
  const sprite = SPRITES[name]
  const scale = height / sprite.height
  const width = Math.max(1, Math.round(sprite.width * scale))
  const at = (v, size, count) => (count >= size ? Math.floor(((v + 0.5) * count) / size) : resizedSpan(v, v, size, count)[0])
  const variants = {}
  for (const v of VARIANTS) {
    const sheet = sprite.variants[v]
    const colors = COLORS[name][v]
    const letters = new Map(Object.entries(colors).map(([l, c]) => [c, l]))
    const resize = (view) =>
      sheet[view].map((frame, index) => {
        const source = frame.rows
        const pupils = pupilsOf(source, sheet.palette, keptEyesOf(name, v, view, index))
        const colorAt = (x, y) => colors[source[y]?.[x]] ?? null
        const kept = pupils.map(([x, y, box, skin, inked]) => [x, y, colorAt(x, y), box && [...box, colors[skin], [...inked].map((l) => colors[l])]])
        const shrunk = scale < 1 && zoomedPixel(colorAt, { columns: sprite.width, pixels: sprite.height, scale, pupils: kept })
        const pixel = shrunk
          ? (x, y) => letters.get(shrunk(x, y)) ?? '.'
          : (x, y) => source[Math.floor(((y + 0.5) * sprite.height) / height)]?.[Math.floor(((x + 0.5) * sprite.width) / width)] ?? '.'
        const rows = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => pixel(x, y)).join(''))
        const moved = pupils.map(([x, y, box, skin, inked]) => {
          const point = [at(x, sprite.width, width), at(y, sprite.height, height)]
          if (!box) return point
          const [left, right] = resizedSpan(box[0], box[0] + box[2] - 1, sprite.width, width)
          const [top, bottom] = resizedSpan(box[1], box[1] + box[3] - 1, sprite.height, height)
          return [...point, [left, top, right - left + 1, bottom - top + 1], skin, inked]
        })
        return { ...frame, rows, pupils: moved }
      })
    variants[v] = { ...sheet, idle: resize('idle'), walk: resize('walk') }
  }
  return { ...sprite, width, height, variants }
}

export const rowsOf = (name) => HEAD_ROWS + spriteRows(name)

// The frame showing after elapsed milliseconds, looping over each frame's own duration
export function frameAt(anim, elapsed) {
  const total = anim.reduce((sum, f) => sum + f.ms, 0)
  let t = elapsed % total
  for (const f of anim) {
    if (t < f.ms) return f.rows
    t -= f.ms
  }
  return anim[0].rows
}

// The first and last opaque pixel columns and rows of a frame, cached per frame
const boxes = new WeakMap()
export function boxOf(rows, colors) {
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

// Where a frame's pupils land in strip pixels, as [x, y, color, eye], for a sprite drawn
// unscaled at left and top, mirrored or not, with eye the box around it as [x, y, width,
// height, skin color, the box's other colors], or null for a line. Each frame's pupils
// are cached.
const framePupils = new WeakMap()
export function pupilsAt(name, shade, view, rows, { left, top, mirrored }) {
  const sheet = SPRITES[name].variants[shade]
  if (!framePupils.has(rows)) {
    const index = Math.max(0, sheet[view].findIndex((f) => f.rows === rows))
    framePupils.set(rows, sheet[view][index].pupils ?? pupilsOf(rows, sheet.palette, keptEyesOf(name, shade, view, index)))
  }
  const { width } = SPRITES[name]
  const colors = COLORS[name][shade]
  return framePupils.get(rows).map(([px, py, box, skin, inked]) => {
    const eye = box && [left + (mirrored ? width - box[0] - box[2] : box[0]), top + box[1], box[2], box[3], colors[skin], [...inked].map((l) => colors[l])]
    return [left + (mirrored ? width - 1 - px : px), top + py, colors[rows[py][px]], eye]
  })
}

// A sleeping mon's frame with its eyes shut, cached per frame
const sleepingFrames = new Map()
export function sleepingFrame(shown, view) {
  const sheet = SPRITES[shown].variants[S.variant]
  const rows = sheet[view][0].rows
  if (!sleepingFrames.has(rows)) sleepingFrames.set(rows, closedEyes(rows, sheet.palette, eyesOf(shown, S.variant, view, 0)))
  return sleepingFrames.get(rows)
}

// A fainted mon's first idle frame with X eyes, cached per frame. Eyes drawn as lines get
// their X too.
const faintedFrames = new Map()
export function faintedFrame(shown) {
  const sheet = SPRITES[shown].variants[S.variant]
  const rows = sheet.idle[0].rows
  if (!faintedFrames.has(rows)) {
    const open = eyesOf(shown, S.variant, 'idle', 0)
    const boxes = open?.length ? open : keptEyesOf(shown, S.variant, 'idle', 0).boxes
    faintedFrames.set(rows, faintedRows(rows, sheet.palette, boxes))
  }
  return faintedFrames.get(rows)
}

// The band rows a fainted mon takes, its feet where the idle ones rest and the stars
// over its head
export function dizzyRows(name) {
  const box = boxOf(faintedFrame(name), faintedColors(name))
  return Math.ceil((DIZZY_ROOM + box.bottom - box.top + 1 + gapUnder(SPRITES[name].variants[S.variant].idle)) / 2)
}

// The fainted palette as letter to 0xRRGGBB, per mon and variant
const FAINTED_COLORS = {}
export function faintedColors(shown) {
  FAINTED_COLORS[shown] ??= {}
  FAINTED_COLORS[shown][S.variant] ??= Object.fromEntries(
    faintedPalette(SPRITES[shown].variants[S.variant].palette).map((hex, i) => [String.fromCharCode(97 + i), parseInt(hex.slice(1), 16)]),
  )
  return FAINTED_COLORS[shown][S.variant]
}

// The most common color of a frame, leaving out dark outlines and shading, cached per frame
const bodies = new WeakMap()
export function bodyOf(rows, colors) {
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

export const idleBox = (name, v) => boxOf(SPRITES[name].variants[v].idle[0].rows, COLORS[name][v])

// A mon's head in its first idle frame, as the columns of its top HEAD_PIXELS opaque rows
const heads = new Map()
export function headOf(name, v) {
  const key = name + ':' + v
  if (heads.has(key)) return heads.get(key)
  const rows = SPRITES[name].variants[v].idle[0].rows
  const colors = COLORS[name][v]
  const { top } = idleBox(name, v)
  const head = { left: Infinity, right: -1 }
  for (const row of rows.slice(top, top + HEAD_PIXELS)) {
    for (let px = 0; px < row.length; px++) {
      if (colors[row[px]] === undefined) continue
      head.left = Math.min(head.left, px)
      head.right = Math.max(head.right, px)
    }
  }
  heads.set(key, head)
  return head
}

export const addCustom = (name, { sprite, moves }) => {
  addSprite(name, sprite)
  MOVES[name] = moves
}
