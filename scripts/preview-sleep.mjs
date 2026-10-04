#!/usr/bin/env node

// Renders mons awake and asleep side by side into a PNG contact sheet, so the closed
// eyes can be checked on every frame. Each mon gets a row per variant: its idle frames
// then its walk frames, each as an awake and an asleep pair. It also lists frames with
// no eyes marked in hooks/eyes.js, and frames whose marked eyes shut to no change.
//
// node scripts/preview-sleep.mjs [mon...] [options]
//   --scale <n>   screen pixels per sprite pixel (default 5)
//   --variant <v> only this variant, default or shiny (default: both)
//   --text        print each frame's rows with column numbers instead of drawing
//   --out <file>  PNG to write (default /tmp/sleep.png)

import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { closedEyes, eyesOf } from '../hooks/eyes.js'
import { SPRITES } from '../hooks/frames.js'

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    scale: { type: 'string', default: '5' },
    variant: { type: 'string' },
    text: { type: 'boolean', default: false },
    out: { type: 'string', default: '/tmp/sleep.png' },
  },
})
const mons = positionals.length > 0 ? positionals : Object.keys(SPRITES)
const unknown = mons.filter((mon) => !SPRITES[mon])
if (unknown.length > 0) {
  console.error('no sprites for ' + unknown.join(', '))
  process.exit(1)
}

const SCALE = Number(opts.scale)
const BACKGROUND = [0x4a, 0x6a, 0x7a]
const PAIR_GAP = 1
const GAP = 4
const VIEWS = ['idle', 'walk']
const variantsOf = (mon) => Object.keys(SPRITES[mon].variants).filter((v) => !opts.variant || v === opts.variant)

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

// Every frame of a mon's variant, awake and asleep
function framesOf(mon, variant) {
  const sheet = SPRITES[mon].variants[variant]
  return VIEWS.flatMap((view) =>
    sheet[view].map(({ rows }, i) => ({
      view,
      i,
      rows,
      boxes: eyesOf(mon, variant, view, i),
      shut: closedEyes(rows, sheet.palette, eyesOf(mon, variant, view, i)),
      palette: sheet.palette,
    })),
  )
}

for (const mon of mons) {
  for (const variant of variantsOf(mon)) {
    for (const f of framesOf(mon, variant)) {
      const where = `${mon} ${variant} ${f.view}${f.i}`
      if (!f.boxes) console.log(where + ': no eyes marked')
      else if (f.boxes.length > 0 && f.shut.every((row, y) => row === f.rows[y])) console.log(where + ': shutting the eyes changed nothing')
    }
  }
}

if (opts.text) {
  for (const mon of mons) {
    const variant = opts.variant ?? 'default'
    const sheet = SPRITES[mon].variants[variant]
    console.log('\n' + mon + ' ' + sheet.palette.map((hex, i) => String.fromCharCode(97 + i) + '=' + hex).join(' '))
    for (const f of framesOf(mon, variant)) {
      console.log(`${f.view}${f.i}`)
      const width = f.rows[0].length
      console.log('    ' + Array.from({ length: width }, (_, x) => (x % 10 === 0 ? String(x / 10) : ' ')).join(''))
      console.log('    ' + Array.from({ length: width }, (_, x) => x % 10).join(''))
      f.rows.forEach((row, y) => console.log(String(y).padStart(3) + ' ' + row + '  ' + f.shut[y]))
    }
  }
  process.exit(0)
}

const lines = mons.flatMap((mon) => variantsOf(mon).map((variant) => ({ mon, variant, frames: framesOf(mon, variant) })))
const cellWidth = (mon) => SPRITES[mon].width * SCALE
const lineWidth = ({ mon, frames }) => frames.length * (2 * cellWidth(mon) + PAIR_GAP + GAP)
const width = Math.max(...lines.map(lineWidth)) + GAP
const height = lines.reduce((h, { mon }) => h + SPRITES[mon].height * SCALE + GAP, GAP)
const image = new Uint8Array(width * height * 4)
for (let k = 0; k < width * height; k++) image.set([...BACKGROUND, 255], k * 4)

function paint(rows, palette, left, top) {
  rows.forEach((row, y) =>
    [...row].forEach((l, x) => {
      if (l === '.') return
      const color = [...rgb(palette[l.charCodeAt(0) - 97]), 255]
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) image.set(color, ((top + y * SCALE + dy) * width + left + x * SCALE + dx) * 4)
      }
    }),
  )
}

let top = GAP
for (const { mon, frames } of lines) {
  let left = GAP
  for (const f of frames) {
    paint(f.rows, f.palette, left, top)
    paint(f.shut, f.palette, left + cellWidth(mon) + PAIR_GAP, top)
    left += 2 * cellWidth(mon) + PAIR_GAP + GAP
  }
  top += SPRITES[mon].height * SCALE + GAP
}

const raw = opts.out + '.rgba'
writeFileSync(raw, image)
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', width + 'x' + height, '-i', raw, '-frames:v', '1', opts.out])
rmSync(raw)
console.log(opts.out + ': ' + lines.map(({ mon, variant }) => mon + (variant === 'default' ? '' : ' ' + variant)).join(', '))
