// Draws a sprite frame fainted. The sprites have no fainted frames, so each eye box from
// EYES is painted the skin around it and crossed with an X in the sprite's darkest color,
// or on a face nearly that dark, in the darkest color light enough to show on it. The rest
// of the frame stays as drawn, and dizzy stars circle over its head.

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b
const hex = (cs) => '#' + cs.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')
// How far an X's brightness sits from the skin's, as for the lids in eyes.js
const DARKER_X = 48
const LIGHTER_X = 40
// How far the fainted palette moves toward gray, and how much it dims
const GRAY = 0.45
const DIM = 0.88
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

function paletteOf(palette) {
  const lumaOf = (letter) => luma(channels(palette[letter.charCodeAt(0) - 97]))
  const letters = palette.map((_, i) => String.fromCharCode(97 + i)).sort((a, b) => lumaOf(a) - lumaOf(b))
  return { lumaOf, letters, darkest: letters[0] }
}

// The skin around an eye box, picked the same way closedEyes picks it
function skinOf(rows, [bx, by, w, h], { lumaOf, darkest }) {
  const inside = (x, y) => x >= bx && x < bx + w && y >= by && y < by + h
  const opaque = (x, y) => (rows[y]?.[x] ?? '.') !== '.'
  const around = new Map()
  for (let y = by; y < by + h; y++) {
    for (let x = bx; x < bx + w; x++) {
      for (const [dx, dy] of SIDES) {
        if (inside(x + dx, y + dy) || !opaque(x + dx, y + dy)) continue
        const l = rows[y + dy][x + dx]
        around.set(l, (around.get(l) ?? 0) + 1)
      }
    }
  }
  if (around.size === 0) return null
  return [...around].sort((a, b) => (a[0] === darkest) - (b[0] === darkest) || b[1] - a[1] || lumaOf(b[0]) - lumaOf(a[0]))[0][0]
}

// The pixels of an X over a box. A box under 3 pixels either way grows to 3 around its
// middle, kept inside the sprite, since a smaller X reads as a dot or a dash.
function crossOf([bx, by, w, h], width, height) {
  const cw = Math.min(Math.max(w, 3), width)
  const ch = Math.min(Math.max(h, 3), height)
  const cx = Math.max(0, Math.min(width - cw, bx - Math.floor((cw - w) / 2)))
  const cy = Math.max(0, Math.min(height - ch, by - Math.floor((ch - h) / 2)))
  const pixels = []
  for (let i = 0; i < ch; i++) {
    const x = ch === 1 ? 0 : Math.round((i * (cw - 1)) / (ch - 1))
    pixels.push([cx + x, cy + i], [cx + cw - 1 - x, cy + i])
  }
  return pixels
}

// Rows of palette letters for the frame fainted, the same width and height as the rows
export function faintedRows(rows, palette, boxes) {
  const height = rows.length
  const width = rows[0]?.length ?? 0
  const grid = rows.map((row) => row.split(''))
  const opaque = (x, y) => (rows[y]?.[x] ?? '.') !== '.'
  if (boxes?.length) {
    const shades = paletteOf(palette)
    const { lumaOf, letters, darkest } = shades
    for (const box of boxes) {
      const [bx, by, w, h] = box
      const skin = skinOf(rows, box, shades)
      if (skin === null) continue
      const shows = lumaOf(skin) - lumaOf(darkest) >= DARKER_X
      const ink = shows ? darkest : (letters.find((l) => lumaOf(l) - lumaOf(skin) >= LIGHTER_X) ?? darkest)
      for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) if (opaque(x, y)) grid[y][x] = skin
      for (const [x, y] of crossOf(box, width, height)) if (opaque(x, y)) grid[y][x] = ink
    }
  }
  return grid.map((row) => row.join(''))
}

// The palette grayed and dimmed for a fainted mon, still close enough to know it by
export function faintedPalette(palette) {
  return palette.map((color) => {
    const cs = channels(color)
    const gray = luma(cs)
    return hex(cs.map((c) => (c + (gray - c) * GRAY) * DIM))
  })
}

// Three stars circle over a fainted mon's head on a flat ellipse, a third of a turn
// apart, one turn every DIZZY_TURN ticks. The ones going round the back are smaller.
// Each star is y yellow with a Y bright heart.
export const DIZZY_STARS = [['.y.', 'yYy', '.y.'], ['y']]
export const DIZZY_COLORS = { y: 0xf8d030, Y: 0xfff4b0 }
export const DIZZY_LIGHT_COLORS = { y: 0xd09000, Y: 0xf8c838 }
const DIZZY_TURN = 40
// The ellipse's middle sits DIZZY_RISE pixels over the head and DIZZY_RY pixels from
// its top and bottom, so the stars reach DIZZY_ROOM pixels over the head
const DIZZY_RISE = 4
const DIZZY_RY = 2
export const DIZZY_ROOM = DIZZY_RISE + DIZZY_RY + (DIZZY_STARS[0].length - 1) / 2

// The stars this tick over the mon's drawn box { left, right, top, bottom } in pixels.
// A small band draws every star as one pixel.
export function dizzyStamps(tick, body, { light = false, small = false } = {}) {
  const colors = light ? DIZZY_LIGHT_COLORS : DIZZY_COLORS
  const cx = (body.left + body.right) / 2
  const rx = Math.max(small ? 2 : 4, Math.round((body.right - body.left) * 0.3))
  const ry = small ? 1 : DIZZY_RY
  const cy = body.top - (small ? 2 : DIZZY_RISE)
  return [0, 1, 2].map((i) => {
    const angle = 2 * Math.PI * ((tick % DIZZY_TURN) / DIZZY_TURN + i / 3)
    const art = small || Math.sin(angle) < 0 ? DIZZY_STARS[1] : DIZZY_STARS[0]
    const half = (art[0].length - 1) / 2
    const x = Math.round(cx + rx * Math.cos(angle)) - half
    const y = Math.round(cy + ry * Math.sin(angle)) - half
    return { x, y: Math.max(0, y), rows: art, colors }
  })
}
