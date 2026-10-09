import { luma } from './effects/draw.js'

// Shrinks the band when the host gives it fewer rows than it needs. The scene still
// renders at full size, then each zoomed pixel takes a vote over the block of
// full-size pixels it covers, so the mon, its bubble, and the effects shrink together.

// A band zoomed below this many rows is too small to read
export const MIN_ZOOM_ROWS = 4

// Stops floating error from flooring a whole number to the one below
const EPSILON = 1e-9

// The scale each /pokemon size draws the band at. A half keeps every block 2x2, so the
// votes stay even across the mon.
export const SIZES = { small: 0.5, medium: 1 }

// The band at the chosen size when it fits or the room is unknown. A band that doesn't
// fit shrinks to the room, and null means the room is too short even for that.
export function zoomFor({ columns, rows, maxRows, size = 1 }) {
  const wanted = Math.ceil(rows * size - EPSILON)
  if (!Number.isFinite(maxRows) || wanted <= maxRows) {
    if (size >= 1) return { scale: 1, columns, rows }
    return { scale: size, columns: Math.max(1, Math.round(columns * size)), rows: wanted }
  }
  const room = Math.floor(maxRows)
  if (room < MIN_ZOOM_ROWS) return null
  const scale = room / rows
  return { scale, columns: Math.max(1, Math.round(columns * scale)), rows: room }
}

// Along one axis, zoomed pixel t covers full-size pixels edges[t] up to edges[t + 1]
function edgesOf(size, count) {
  const edges = new Int32Array(count + 1)
  for (let t = 0; t <= count; t++) edges[t] = Math.ceil((t * size) / count)
  return edges
}

// A tied vote goes to the color at the middle of the block, as nearest-neighbor
// scaling would pick, so a shape keeps its lines instead of breaking into speckles.
// Failing that it goes to the darker color: outlines and eyes are a sprite's darkest
// pixels and the first detail a vote loses.
const beats = (a, b) => luma(a) < luma(b) || (luma(a) === luma(b) && a < b)

// The zoomed pixel whose block holds full-size pixel value, along an axis cut at edges
function cellOf(edges, value) {
  let t = 0
  while (t + 2 < edges.length && edges[t + 1] <= value) t++
  return t
}

// The zoomed scene, a color or null per zoomed pixel. Each one takes the most common
// opaque color of its block, or stays see-through when fewer than half are opaque.
// A block under half opaque still counts when its opaque pixels reach across it, side
// to side or top to bottom, so 1 px strokes like the bubble's frame, the Zs, and bolts
// survive the shrink. pupils lists full-size pixels as [x, y, color, eye], one per eye.
// The zoomed pixel holding one takes its color while the pupil still shows, whatever the
// vote, so a shrunk mon keeps its eyes. eye, unless null, is the box around the pupil as
// [x, y, width, height, skin, colors]: its pixels in those colors vote as the skin, so the
// rest of the eye doesn't spill into the next zoomed pixel on one eye and not the other.
export function zoomedPixel(pixelAt, { columns, pixels, scale, pupils = [] }) {
  if (scale >= 1) return pixelAt
  const width = Math.max(1, Math.round(columns * scale))
  const height = Math.max(1, Math.round(pixels * scale))
  const xs = edgesOf(columns, width)
  const ys = edgesOf(pixels, height)
  const area = Math.ceil(columns / width) * Math.ceil(pixels / height)
  const colors = new Int32Array(area)
  const votes = new Int32Array(area)
  const eyes = new Map()
  for (const pupil of pupils) {
    const [x, y] = pupil
    if (x < 0 || x >= columns || y < 0 || y >= pixels) continue
    const key = cellOf(xs, x) + ',' + cellOf(ys, y)
    eyes.set(key, [...(eyes.get(key) ?? []), pupil])
  }
  const boxes = pupils.map(([, , , eye]) => eye).filter(Boolean)
  const source =
    boxes.length === 0
      ? pixelAt
      : (x, y) => {
          const c = pixelAt(x, y)
          for (const [bx, by, w, h, skin, inked] of boxes) {
            if (x >= bx && x < bx + w && y >= by && y < by + h && inked.includes(c)) return skin
          }
          return c
        }
  const voted = (tx, ty) => {
    const [x0, x1, y0, y1] = [xs[tx], xs[tx + 1] - 1, ys[ty], ys[ty + 1] - 1]
    let kinds = 0
    let opaque = 0
    let [left, right, top, bottom] = [x1, x0, y1, y0]
    for (let py = y0; py <= y1; py++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = source(cx, py)
        if (c === null) continue
        opaque++
        left = Math.min(left, cx)
        right = Math.max(right, cx)
        top = Math.min(top, py)
        bottom = Math.max(bottom, py)
        let k = 0
        while (k < kinds && colors[k] !== c) k++
        if (k === kinds) {
          colors[kinds++] = c
          votes[k] = 0
        }
        votes[k]++
      }
    }
    const across = (x1 > x0 && left === x0 && right === x1) || (y1 > y0 && top === y0 && bottom === y1)
    if (opaque * 2 < (x1 - x0 + 1) * (y1 - y0 + 1) && !across) return null
    const middle = source((x0 + x1 + 1) >> 1, (y0 + y1 + 1) >> 1)
    let best = 0
    for (let k = 1; k < kinds; k++) {
      if (votes[k] < votes[best]) continue
      if (votes[k] > votes[best] || (colors[best] !== middle && (colors[k] === middle || beats(colors[k], colors[best])))) best = k
    }
    return colors[best]
  }
  return (tx, ty) => {
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return null
    const c = voted(tx, ty)
    const kept = eyes.size > 0 ? eyes.get(tx + ',' + ty) : undefined
    if (!kept || kept.some(([, , pupil]) => pupil === c)) return c
    for (const [x, y, pupil] of kept) if (pixelAt(x, y) === pupil) return pupil
    return c
  }
}

// Maps a full-size cell or pixel coordinate to the zoomed pixel whose block holds it
export const zoomedAt = (value, scale) => (scale >= 1 ? value : Math.floor(value * scale + EPSILON))
