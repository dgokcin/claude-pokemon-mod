// Draws a sprite frame fainted. The sprites have no fainted frames, so each eye box from
// EYES is painted the skin around it and crossed with an X in the sprite's darkest color,
// or on a face nearly that dark, in the darkest color light enough to show on it. Then the
// mon slumps: its rows squash to about two thirds of their height, keeping the outline
// rows and the X rows, and it rests on its bottom row with the freed rows left clear.

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b
const hex = (cs) => '#' + cs.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')
// How far an X's brightness sits from the skin's, as for the lids in eyes.js
const DARKER_X = 48
const LIGHTER_X = 40
// Share of the mon's height it keeps when slumped
const SLUMP = 0.65
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
  const keep = new Set()
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
      for (const [x, y] of crossOf(box, width, height)) {
        if (!opaque(x, y)) continue
        grid[y][x] = ink
        keep.add(y)
      }
    }
  }

  const filled = grid.map((row) => row.some((l) => l !== '.'))
  const top = filled.indexOf(true)
  if (top < 0) return grid.map((row) => row.join(''))
  const bottom = filled.lastIndexOf(true)
  keep.add(top).add(bottom)
  const tall = bottom - top + 1
  const target = Math.max(keep.size, Math.round(tall * SLUMP))
  // Drops the free rows spread evenly through the body, so no one part loses them all
  const free = []
  for (let y = top; y <= bottom; y++) if (!keep.has(y)) free.push(y)
  const drop = new Set()
  const dropping = tall - target
  for (let j = 0; j < dropping; j++) drop.add(free[Math.floor(((j + 0.5) * free.length) / dropping)])
  const kept = []
  for (let y = top; y <= bottom; y++) if (!drop.has(y)) kept.push(grid[y])

  const clear = '.'.repeat(width)
  const out = rows.map((_, y) => (y > bottom ? grid[y].join('') : clear))
  kept.forEach((row, i) => (out[bottom - kept.length + 1 + i] = row.join('')))
  return out
}

// The palette grayed and dimmed for a fainted mon, still close enough to know it by
export function faintedPalette(palette) {
  return palette.map((color) => {
    const cs = channels(color)
    const gray = luma(cs)
    return hex(cs.map((c) => (c + (gray - c) * GRAY) * DIM))
  })
}
