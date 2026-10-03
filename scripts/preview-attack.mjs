#!/usr/bin/env node

// Renders a move frame by frame into a PNG contact sheet, so attacks can be
// tuned without a terminal. It drives the real band renderer in hooks/register.js
// with a stand-in host, then paints each blit the way the half blocks look.
//
// node scripts/preview-attack.mjs <mon> <move> [options]
//   --at <column>   where the mon stands first (default: home at the right edge)
//   --every <n>     keep every nth frame (default 1)
//   --from <tick>   first tick to keep (default 1)
//   --to <tick>     last tick to keep (default: a few ticks past the end)
//   --scale <n>     screen pixels per sprite pixel (default 4)
//   --seed <n>      random seed (default 1)
//   --shiny         use the shiny variant
//   --light         paint on a light terminal background
//   --out <file>    PNG to write (default /tmp/<mon>-<move>.png)

import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { prepareAttack } from '../hooks/attacks.js'
import { movesOf } from '../hooks/moves.js'
import { SPRITES } from '../hooks/frames.js'

Uint8Array.prototype.toBase64 ??= function () {
  return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString('base64')
}

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    at: { type: 'string' },
    every: { type: 'string', default: '1' },
    from: { type: 'string', default: '1' },
    to: { type: 'string' },
    scale: { type: 'string', default: '4' },
    seed: { type: 'string', default: '1' },
    shiny: { type: 'boolean', default: false },
    light: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
})
const [mon, ...words] = positionals
const moveName = words.join(' ')
if (!SPRITES[mon] || !moveName) {
  console.error('usage: node scripts/preview-attack.mjs <mon> <move> [--at n] [--every n] [--from n] [--to n] [--scale n] [--seed n] [--shiny] [--light] [--out file]')
  process.exit(1)
}

const STRIP = 40
const MOVE_TICKS = 3
const SCALE = Number(opts.scale)
const EVERY = Number(opts.every)
const BACKGROUND = opts.light ? 0xf4f4f4 : 0x1c1c22
const GAP = 6
const PER_ROW = 6
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

// A stand-in host: hooks by event, a store, a clock driven by hand, and every blit
const hooks = {}
const store = new Map([['mon', mon], ['variant', opts.shiny ? 'shiny' : 'default'], ['wander', opts.at !== undefined]])
const blits = []
let tickFn = null

const $ = {
  command: { register: async () => {} },
  store: { get: async (k) => store.get(k), set: async (k, v) => void store.set(k, v) },
  clock: { now: async () => 0, every: (ms, fn) => void (tickFn = fn) },
  ui: {
    invalidate: () => {},
    blit: async (args) => void blits.push(args.cells),
    resolve: () => ({ Box: (props) => ({ props }), Raster: (props) => ({ props }), Text: (props) => ({ props }) }),
  },
}

function matches(matcher, e) {
  return !matcher || Object.entries(matcher).every(([k, v]) => e[k] === v)
}

async function fire(event, e) {
  const hook = (hooks[event] ?? []).find((h) => matches(h.matcher, e))
  return hook ? hook.fn($, e, async () => undefined) : undefined
}

Math.random = seeded(Number(opts.seed))
const { register } = await import('../hooks/register.js')
register((event, matcher, fn) => {
  if (typeof matcher === 'function') [fn, matcher] = [matcher, null]
  ;(hooks[event] ??= []).push({ matcher, fn })
})

await fire('session.start', {})
await fire('ui.render', {
  component: 'AbovePrompt',
  surface: 'terminal',
  requestId: 'band',
  props: { isWorking: false, hasSurvey: false, bodyColumns: 120 },
})

// Stroll to the asked column: the next wander target comes from Math.random
const home = STRIP - SPRITES[mon].width
if (opts.at !== undefined) {
  const at = Math.max(0, Math.min(home, Number(opts.at)))
  const random = Math.random
  Math.random = () => (at + 0.5) / (home + 1)
  for (let k = 0; k < (home - at + 2) * MOVE_TICKS; k++) tickFn()
  Math.random = random
}

const moveKey = (name) => name.toLowerCase().replace(/[\s\-_'.]/g, '')
const move = movesOf(mon).find((m) => moveKey(m.name) === moveKey(moveName))
if (!move) {
  console.error(mon + ' has no move "' + moveName + '". Its moves: ' + movesOf(mon).map((m) => m.name).join(', '))
  process.exit(1)
}

const answer = await fire('command.run', { command: 'pokemon', args: 'attack ' + moveName })
console.log(answer.text)
blits.length = 0
const { ticks } = prepareAttack(move, { side: 'left', seed: 0, x: 0, home: 0 })
for (let k = 0; k < ticks + 6; k++) tickFn()
const last = opts.to === undefined ? Infinity : Number(opts.to)
const frames = blits
  .map((cells, i) => ({ cells, age: i + 1 }))
  .filter((f) => f.age >= Number(opts.from) && f.age <= last)
  .filter((f, i) => i % EVERY === 0)

// Glyphs for the few non-block characters the band draws, on a 5x10 grid
const GLYPHS = {
  0x266a: ['..XX.', '..X.X', '..X..', '..X..', '..X..', '.XX..', 'XXX..', 'XXX..', '.X...', '.....'],
  0x266b: ['.XXXX', '.X..X', '.X..X', '.X..X', '.X..X', 'XX.XX', 'XXXXX', 'XX.XX', '.....', '.....'],
}
const DIAMOND = ['.....', '..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..', '.....', '.....', '.....', '.....']
const DIGITS = ['XXXX.XX.XX.XXXX', '.X.XX..X..X.XXX', 'XXX..XXXXX..XXX', 'XXX..XXXX..XXXX', 'X.XX.XXXX..X..X', 'XXXX..XXX..XXXX', 'XXXX..XXXX.XXXX', 'XXX..X..X..X..X', 'XXXX.XXXXX.XXXX', 'XXXX.XXXX..XXXX']

const rows = Buffer.from(frames[0].cells, 'base64').length / 12 / STRIP
const frameW = STRIP * SCALE
const frameH = rows * 2 * SCALE
const sheetRows = Math.ceil(frames.length / PER_ROW)
const width = PER_ROW * frameW + (PER_ROW + 1) * GAP
const height = sheetRows * frameH + (sheetRows + 1) * GAP
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

const paint = (c) => (c === DEFAULT_COLOR ? BACKGROUND : c)

fill(0, 0, width, height, opts.light ? 0xc8c8c8 : 0x3a3a44)
frames.forEach((f, n) => {
  const ox = GAP + (n % PER_ROW) * (frameW + GAP)
  const oy = GAP + Math.floor(n / PER_ROW) * (frameH + GAP)
  const words32 = new Uint32Array(new Uint8Array(Buffer.from(f.cells, 'base64')).buffer)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < STRIP; cx++) {
      const i = (cy * STRIP + cx) * 3
      const [cp, fg, bg] = [words32[i], words32[i + 1], words32[i + 2]]
      const x = ox + cx * SCALE
      const y = oy + cy * 2 * SCALE
      if (cp === 0x2580) {
        fill(x, y, SCALE, SCALE, paint(fg))
        fill(x, y + SCALE, SCALE, SCALE, paint(bg))
      } else if (cp === 0x2584) {
        fill(x, y, SCALE, SCALE, paint(bg))
        fill(x, y + SCALE, SCALE, SCALE, paint(fg))
      } else {
        fill(x, y, SCALE, 2 * SCALE, paint(bg))
        if (cp === 0x20) continue
        const glyph = GLYPHS[cp] ?? DIAMOND
        for (let py = 0; py < 2 * SCALE; py++) {
          for (let px = 0; px < SCALE; px++) {
            if (glyph[Math.floor((py * 10) / (2 * SCALE))][Math.floor((px * 5) / SCALE)] === 'X') put(x + px, y + py, paint(fg))
          }
        }
      }
    }
  }
  // The frame's age in ticks, in the top left corner
  String(f.age).split('').forEach((d, k) => {
    const bits = DIGITS[Number(d)]
    for (let b = 0; b < 15; b++) if (bits[b] === 'X') fill(ox + 1 + k * 4 * 2 + (b % 3) * 2, oy + 1 + Math.floor(b / 3) * 2, 2, 2, 0x707080)
  })
})

const out = opts.out ?? '/tmp/' + mon + '-' + moveKey(moveName) + '.png'
const raw = out + '.rgba'
writeFileSync(raw, image)
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', width + 'x' + height, '-i', raw, '-frames:v', '1', out])
rmSync(raw)
console.log(out + ': ' + frames.length + ' frames, ' + rows + ' rows')
