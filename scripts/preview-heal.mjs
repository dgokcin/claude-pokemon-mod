#!/usr/bin/env node

// Renders a Pokémon Center heal frame by frame into a PNG contact sheet: the fainted mon
// going into its ball, Nurse Joy at her counter while the healing machine flashes, her
// bow, and the mon back out of its ball. It drives the real band renderer in
// hooks/register.js with the stand-in host in stub-host.mjs.
//
// node scripts/preview-heal.mjs [mon] [options]
//   --every <n>   keep every nth frame (default 2)
//   --scale <n>   screen pixels per sprite pixel (default 4)
//   --size <s>    small or large (default large)
//   --light       paint on a light terminal background
//   --out <file>  PNG to write (default /tmp/<mon>-heal.png)

import { parseArgs } from 'node:util'
import { SPRITES } from '../hooks/frames.js'
import { contactSheet, stubHost } from './stub-host.mjs'

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    every: { type: 'string', default: '2' },
    scale: { type: 'string', default: '4' },
    size: { type: 'string', default: 'large' },
    light: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
})
const mon = positionals[0] ?? 'machoke'
if (!SPRITES[mon]) {
  console.error('usage: node scripts/preview-heal.mjs [mon] [--every n] [--scale n] [--size small|large] [--light] [--out file]')
  process.exit(1)
}

// The heal takes five minutes of 50 ms ticks. The sheet keeps its start and its end.
const HEAL_TICKS = 6000
const SHOWN = [
  [0, 70],
  [5950, 6030],
]
const EVERY = Number(opts.every)

const fainted = { food: { value: 0, at: 0 }, happiness: { value: 0, at: 0 }, fainted: { ms: 0, at: 0 } }
const host = await stubHost({ saved: { mon, wander: false, size: opts.size, stats: { [mon]: fainted } }, light: opts.light, ticking: true })
await host.tick()
const played = [{ cells: host.screen.cells, columns: host.screen.columns, age: 0 }]
console.log(await host.command('revive'))
for (let age = 1; age <= HEAL_TICKS + 30; age++) {
  await host.tick()
  const kept = SHOWN.some(([from, to]) => age >= from && age <= to) && age % EVERY === 0
  if (kept) played.push({ cells: host.screen.cells, columns: host.screen.columns, age })
}
console.log(host.toasts.join('\n'))

const out = opts.out ?? '/tmp/' + mon + '-heal.png'
const { rows, columns } = contactSheet(played, { out, scale: Number(opts.scale), light: opts.light, perRow: 8 })
console.log(out + ': ' + played.length + ' frames, up to ' + columns + ' columns and ' + rows + ' rows')
