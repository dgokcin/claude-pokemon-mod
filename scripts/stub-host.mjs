// A stand-in host for the preview scripts: hooks by event, a store, a clock driven by
// hand, the theme, toasts, and the frame on screen. It drives the real band renderer in
// hooks/register.js, and contactSheet paints the frames it shows into a PNG the way the
// half blocks look.

import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'

Uint8Array.prototype.toBase64 ??= function () {
  return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString('base64')
}

const DEFAULT_COLOR = 0x01000000

function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The band Raster in a drawn tree
function rasterIn(node) {
  if (node?.props?.key === 'pokemon') return node.props
  for (const child of node?.props?.children ?? []) {
    const raster = rasterIn(child)
    if (raster) return raster
  }
  return null
}

const matches = (matcher, e) => !matcher || Object.entries(matcher).every(([k, v]) => e[k] === v)

// Start a session with the saved store entries. Math.random is seeded before the band
// loads. The band only blits a frame that changed, so a tick with no blit leaves the last
// frame showing, and a tick that asks for a redraw draws the band again, as the host does.
export async function stubHost({ saved = {}, light = false, seed = 1, bodyColumns = 120 } = {}) {
  const hooks = {}
  const store = new Map(Object.entries(saved))
  const screen = { cells: null, columns: 0 }
  const toasts = []
  let tickFn = null
  let invalid = false

  const $ = {
    command: { register: async () => {}, list: async () => [] },
    config: { list: async () => [{ key: 'theme', value: light ? 'light' : 'dark' }] },
    store: {
      get: async (k) => store.get(k),
      set: async (k, v) => void store.set(k, v),
      keys: async () => [...store.keys()],
      delete: async (k) => void store.delete(k),
    },
    clock: { now: async () => 0, every: (ms, fn) => void (tickFn = fn) },
    agent: { list: async () => [] },
    ui: {
      invalidate: () => void (invalid = true),
      toast: (text) => void toasts.push(text),
      log: (text) => console.error(text),
      blit: async (args) => void Object.assign(screen, { cells: args.cells, columns: args.columns }),
      resolve: () => ({ Box: (props) => ({ props }), Raster: (props) => ({ props }), Text: (props) => ({ props }) }),
    },
  }

  // Fire an event at the band, with result as what the hooks beneath it return
  async function fire(event, e, result) {
    const hook = (hooks[event] ?? []).find((h) => matches(h.matcher, e))
    return hook ? hook.fn($, e, async () => result) : result
  }

  async function render() {
    invalid = false
    const raster = rasterIn(await fire('ui.render', {
      component: 'AbovePrompt',
      surface: 'terminal',
      requestId: 'band',
      props: { isWorking: false, hasSurvey: false, bodyColumns, maxRows: 40 },
    }))
    if (raster) Object.assign(screen, { cells: raster.cells, columns: raster.columns })
  }

  async function tick() {
    tickFn()
    if (invalid) await render()
  }

  Math.random = seeded(seed)
  const { register } = await import('../hooks/register.js')
  register((event, matcher, fn) => {
    if (typeof matcher === 'function') [fn, matcher] = [matcher, null]
    ;(hooks[event] ??= []).push({ matcher, fn })
  })
  await fire('session.start', {})
  await render()
  const command = async (args) => (await fire('command.run', { command: 'pokemon', args }))?.text
  return { fire, command, tick, screen, toasts, store }
}

// Glyphs for the few non-block characters the band draws, on a 5x10 grid
const GLYPHS = {
  0x266a: ['..XX.', '..X.X', '..X..', '..X..', '..X..', '.XX..', 'XXX..', 'XXX..', '.X...', '.....'],
  0x266b: ['.XXXX', '.X..X', '.X..X', '.X..X', '.X..X', 'XX.XX', 'XXXXX', 'XX.XX', '.....', '.....'],
}
const DIAMOND = ['.....', '..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..', '.....', '.....', '.....', '.....']
const DIGITS = ['XXXX.XX.XX.XXXX', '.X.XX..X..X.XXX', 'XXX..XXXXX..XXX', 'XXX..XXXX..XXXX', 'X.XX.XXXX..X..X', 'XXXX..XXX..XXXX', 'XXXX..XXXX.XXXX', 'XXX..X..X..X..X', 'XXXX.XXXXX.XXXX', 'XXXX.XXXX..XXXX']

// Paint frames, each { cells, columns, age }, into a PNG at out, perRow to a row, each
// labelled with its age in ticks. Frames of different widths line up on their right edge,
// where the band anchors them.
export function contactSheet(frames, { out, scale = 4, light = false, perRow = 6, gap = 6 }) {
  const background = light ? 0xf4f4f4 : 0x1c1c22
  const sizes = frames.map((f) => ({ columns: f.columns, rows: Buffer.from(f.cells, 'base64').length / 12 / f.columns }))
  const maxColumns = Math.max(...sizes.map((s) => s.columns))
  const maxRows = Math.max(...sizes.map((s) => s.rows))
  const frameW = maxColumns * scale
  const frameH = maxRows * 2 * scale
  const sheetRows = Math.ceil(frames.length / perRow)
  const width = perRow * frameW + (perRow + 1) * gap
  const height = sheetRows * frameH + (sheetRows + 1) * gap
  const image = Buffer.alloc(width * height * 4)

  function put(x, y, color) {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    image[i] = (color >> 16) & 255
    image[i + 1] = (color >> 8) & 255
    image[i + 2] = color & 255
    image[i + 3] = 255
  }

  function fill(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(x + dx, y + dy, color)
  }

  const paint = (c) => (c === DEFAULT_COLOR ? background : c)

  fill(0, 0, width, height, light ? 0xc8c8c8 : 0x3a3a44)
  frames.forEach((f, n) => {
    const { columns, rows } = sizes[n]
    const fx = gap + (n % perRow) * (frameW + gap)
    const fy = gap + Math.floor(n / perRow) * (frameH + gap)
    const ox = fx + (maxColumns - columns) * scale
    const oy = fy + (maxRows - rows) * 2 * scale
    const words = new Uint32Array(new Uint8Array(Buffer.from(f.cells, 'base64')).buffer)
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < columns; cx++) {
        const i = (cy * columns + cx) * 3
        const [cp, fg, bg] = [words[i], words[i + 1], words[i + 2]]
        const x = ox + cx * scale
        const y = oy + cy * 2 * scale
        if (cp === 0x2580) {
          fill(x, y, scale, scale, paint(fg))
          fill(x, y + scale, scale, scale, paint(bg))
        } else if (cp === 0x2584) {
          fill(x, y, scale, scale, paint(bg))
          fill(x, y + scale, scale, scale, paint(fg))
        } else {
          fill(x, y, scale, 2 * scale, paint(bg))
          if (cp === 0x20) continue
          const glyph = GLYPHS[cp] ?? DIAMOND
          for (let py = 0; py < 2 * scale; py++) {
            for (let px = 0; px < scale; px++) {
              if (glyph[Math.floor((py * 10) / (2 * scale))][Math.floor((px * 5) / scale)] === 'X') put(x + px, y + py, paint(fg))
            }
          }
        }
      }
    }
    // The frame's age in ticks, in the top left corner
    String(f.age).split('').forEach((d, k) => {
      const bits = DIGITS[Number(d)]
      for (let b = 0; b < 15; b++) if (bits[b] === 'X') fill(fx + 1 + k * 4 * 2 + (b % 3) * 2, fy + 1 + Math.floor(b / 3) * 2, 2, 2, 0x707080)
    })
  })

  const raw = out + '.rgba'
  writeFileSync(raw, image)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', width + 'x' + height, '-i', raw, '-frames:v', '1', out])
  rmSync(raw)
  return { rows: maxRows, columns: maxColumns }
}
