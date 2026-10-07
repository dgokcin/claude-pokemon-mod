#!/usr/bin/env node

// Renders a move frame by frame into a PNG contact sheet, so attacks can be
// tuned without a terminal. It drives the real band renderer in hooks/register.js
// with the stand-in host in stub-host.mjs.
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

import { parseArgs } from 'node:util'
import { prepareAttack } from '../hooks/attacks.js'
import { SPRITES } from '../hooks/frames.js'
import { movesOf } from '../hooks/moves.js'
import { contactSheet, stubHost } from './stub-host.mjs'

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
const EVERY = Number(opts.every)

const saved = { mon, variant: opts.shiny ? 'shiny' : 'default', wander: opts.at !== undefined }
const host = await stubHost({ saved, light: opts.light, seed: Number(opts.seed) })

// Stroll to the asked column: the next wander target comes from Math.random
const home = STRIP - SPRITES[mon].width
const at = opts.at === undefined ? home : Math.max(0, Math.min(home, Number(opts.at)))
if (opts.at !== undefined) {
  const random = Math.random
  Math.random = () => (at + 0.5) / (home + 1)
  for (let k = 0; k < (home - at + 2) * MOVE_TICKS; k++) await host.tick()
  Math.random = random
}

const moveKey = (name) => name.toLowerCase().replace(/[\s\-_'.]/g, '')
const move = movesOf(mon).find((m) => moveKey(m.name) === moveKey(moveName))
if (!move) {
  console.error(mon + ' has no move "' + moveName + '". Its moves: ' + movesOf(mon).map((m) => m.name).join(', '))
  process.exit(1)
}

console.log(await host.command('attack ' + moveName))
// A move aimed ahead first backs the mon up to the nearer edge, a column a tick
const { ticks } = prepareAttack(move, { side: 'left', seed: 0, x: 0, home: 0 })
const backup = Math.min(at, home - at)
const played = []
for (let age = 1; age <= ticks + backup + 6; age++) {
  await host.tick()
  played.push({ cells: host.screen.cells, columns: host.screen.columns, age })
}
const last = opts.to === undefined ? Infinity : Number(opts.to)
const frames = played
  .filter((f) => f.age >= Number(opts.from) && f.age <= last)
  .filter((f, i) => i % EVERY === 0)

const out = opts.out ?? '/tmp/' + mon + '-' + moveKey(moveName) + '.png'
const { rows } = contactSheet(frames, { out, scale: Number(opts.scale), light: opts.light })
console.log(out + ': ' + frames.length + ' frames, ' + rows + ' rows')
