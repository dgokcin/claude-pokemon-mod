// Closes a sprite's eyes for sleep. The sprites have no sleeping frames, so this finds
// each eye as a small near-white highlight and the dark pupil pixels next to it, paints
// them the skin around them, and draws the bottom row of each eye as a lid in the
// sprite's darkest color, at least two pixels wide so it doesn't read as a pupil.

const EYE_REACH = 2
const MAX_HIGHLIGHT = 2
const MAX_EYE = 8
const HEAD_SHARE = 0.7
const NEAR_WHITE = 0xd0
const DARK = 0x60
const MIN_LID = 2

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b
const isNearWhite = (hex) => channels(hex).every((c) => c > NEAR_WHITE)
const isDark = (hex) => luma(channels(hex)) < DARK
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

// The 4-connected cells around a seed that pass a test, up to a limit
function grow(seed, passes, limit, letterAt) {
  const key = ([x, y]) => x + ',' + y
  const seen = new Map([[key(seed), seed]])
  const queue = [seed]
  while (queue.length > 0) {
    const [x, y] = queue.shift()
    for (const [dx, dy] of SIDES) {
      const cell = [x + dx, y + dy]
      if (seen.has(key(cell)) || !passes(cell, letterAt(cell))) continue
      seen.set(key(cell), cell)
      if (seen.size > limit) return null
      queue.push(cell)
    }
  }
  return [...seen.values()]
}

// Rows of palette letters with the eyes shut, or the same rows when none are found
export function closedEyes(rows, palette) {
  const colorOf = (letter) => (letter && letter !== '.' ? palette[letter.charCodeAt(0) - 97] : null)
  const letterAt = ([x, y]) => rows[y]?.[x]
  const opaque = rows.map((row, y) => (row.replace(/\./g, '') ? y : -1)).filter((y) => y >= 0)
  const top = opaque[0]
  const headEnd = top + (opaque[opaque.length - 1] - top + 1) * HEAD_SHARE
  const grid = rows.map((row) => row.split(''))
  const columns = rows.flatMap((row) => [...row].map((l, x) => (l === '.' ? -1 : x))).filter((x) => x >= 0)
  const middle = (Math.min(...columns) + Math.max(...columns)) / 2
  const darkest = String.fromCharCode(97 + palette.reduce((best, hex, i) => (luma(channels(hex)) < luma(channels(palette[best])) ? i : best), 0))
  const used = new Set()

  for (let y = top; y < headEnd; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const hex = colorOf(rows[y][x])
      if (!hex || !isNearWhite(hex) || used.has(x + ',' + y)) continue
      const highlight = grow([x, y], (_, l) => isNearWhite(colorOf(l) ?? '#000000'), MAX_HIGHLIGHT, letterAt)
      if (!highlight) continue
      const near = ([cx, cy]) => Math.abs(cx - x) <= EYE_REACH && Math.abs(cy - y) <= EYE_REACH
      const eyeish = (cell, l) => {
        const c = colorOf(l)
        return c !== null && near(cell) && (isNearWhite(c) || isDark(c))
      }
      const eye = grow([x, y], eyeish, MAX_EYE, letterAt)
      if (!eye || eye.length < 2 || !eye.some(([cx, cy]) => isDark(colorOf(letterAt([cx, cy]))))) continue
      for (const [cx, cy] of eye) used.add(cx + ',' + cy)

      const inEye = new Set(eye.map(([cx, cy]) => cx + ',' + cy))
      const around = new Map()
      for (const [cx, cy] of eye) {
        for (const [dx, dy] of SIDES) {
          const l = letterAt([cx + dx, cy + dy])
          if (!inEye.has(cx + dx + ',' + (cy + dy)) && colorOf(l)) around.set(l, (around.get(l) ?? 0) + 1)
        }
      }
      if (around.size === 0) continue
      const skin = [...around].sort((a, b) => b[1] - a[1])[0][0]
      const bottom = Math.max(...eye.map(([, cy]) => cy))
      for (const [cx, cy] of eye) grid[cy][cx] = skin
      const lid = eye.filter(([, cy]) => cy === bottom).map(([cx]) => cx)
      const outward = Math.min(...lid) < middle ? -1 : 1
      while (lid.length < MIN_LID) {
        const next = outward < 0 ? Math.min(...lid) - 1 : Math.max(...lid) + 1
        if (!colorOf(letterAt([next, bottom]))) break
        lid.push(next)
      }
      for (const cx of lid) grid[bottom][cx] = darkest
    }
  }
  return grid.map((row) => row.join(''))
}
