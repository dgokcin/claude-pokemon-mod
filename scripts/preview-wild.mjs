#!/usr/bin/env node

// Renders a wild encounter frame by frame into a PNG contact sheet: the foe walking in
// from the left, the home mon attacking it as tool calls bank work, and the foe fleeing
// after /pokemon run. With --move, only that move plays at the foe. It drives the real
// band renderer in hooks/register.js with the stand-in host in stub-host.mjs.
//
// node scripts/preview-wild.mjs <mon> <foe> [options]
//   --move <name>   play just this move at the foe once it arrives
//   --tools <n>     tool calls that bank a move each, two at most (default 2)
//   --throw <how>   throw a ball: 'fail' at full HP, or 'catch' once tool calls wear the foe out
//   --every <n>     keep every nth frame (default 4)
//   --balls <n>     subagents running, drawn as Poké Balls (default 0)
//   --scale <n>     screen pixels per sprite pixel (default 4)
//   --shiny         the foe is shiny
//   --light         paint on a light terminal background
//   --out <file>    PNG to write (default /tmp/<mon>-vs-<foe>.png)

import { parseArgs } from 'node:util'
import { SPRITES } from '../hooks/frames.js'
import { contactSheet, stubHost } from './stub-host.mjs'

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    move: { type: 'string' },
    tools: { type: 'string', default: '2' },
    throw: { type: 'string' },
    every: { type: 'string', default: '4' },
    balls: { type: 'string', default: '0' },
    scale: { type: 'string', default: '4' },
    shiny: { type: 'boolean', default: false },
    light: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
})
const [mon, foe] = positionals
if (!SPRITES[mon] || !SPRITES[foe]) {
  console.error('usage: node scripts/preview-wild.mjs <mon> <foe> [--move name] [--tools n] [--throw fail|catch] [--every n] [--balls n] [--scale n] [--shiny] [--light] [--out file]')
  process.exit(1)
}

const BATTLE_TICKS = 20
// Each banked move waits up to 8 s for the last one
const ATTACK_TICKS = 170
const LIMIT_TICKS = 2000
const EVERY = Number(opts.every)

const host = await stubHost({ saved: { mon, wander: false, debug: true }, light: opts.light })
for (let k = 0; k < Number(opts.balls); k++) await host.fire('agent.spawn', {}, { agentId: 'agent-' + k })
console.log(await host.command('wild ' + foe + (opts.shiny ? ' shiny' : '')))

const played = []
let age = 0
const play = async (until) => {
  for (let k = 0; k < LIMIT_TICKS && !until(); k++) {
    age += 1
    await host.tick()
    played.push({ cells: host.screen.cells, columns: host.screen.columns, age })
  }
}
const playFor = async (ticks) => {
  const end = age + ticks
  await play(() => age >= end)
}

// Walk in, fight, then flee until the strip shrinks back. A lone move is the whole sheet.
await play(() => host.toasts.length > 0)
if (opts.move) {
  played.length = 0
  console.log(await host.command('attack ' + opts.move))
  await playFor(BATTLE_TICKS * 4)
} else if (opts.throw) {
  const worn = () => host.toasts.some((text) => text.includes('worn out'))
  for (let k = 0; k < 8 && opts.throw === 'catch' && !worn(); k++) {
    await host.fire('tool.call', { tool: 'Read' }, {})
    await playFor(ATTACK_TICKS)
  }
  played.length = 0
  console.log(await host.command('catch'))
  const wide = host.screen.columns
  const settled = () => host.toasts.some((text) => /Gotcha|broke free|appeared to be|So close/.test(text))
  await play(settled)
  await playFor(opts.throw === 'catch' ? 30 : 12)
  if (opts.throw === 'catch') await play(() => host.screen.columns < wide)
} else {
  const tools = Number(opts.tools)
  for (let k = 0; k < tools; k++) await host.fire('tool.call', { tool: 'Read' }, {})
  await playFor(BATTLE_TICKS + ATTACK_TICKS * Math.min(tools, 2))
  console.log(await host.command('run'))
  const wide = host.screen.columns
  await play(() => host.screen.columns < wide)
}
console.log(host.toasts.join('\n'))

const frames = played.filter((f, i) => i % EVERY === 0 || i === played.length - 1)
const moveKey = (name) => name.toLowerCase().replace(/[\s\-_'.]/g, '')
const suffix = opts.move ? '-' + moveKey(opts.move) : opts.throw ? '-' + opts.throw : ''
const out = opts.out ?? '/tmp/' + mon + '-vs-' + foe + suffix + '.png'
const { rows, columns } = contactSheet(frames, { out, scale: Number(opts.scale), light: opts.light, perRow: 6 })
console.log(out + ': ' + frames.length + ' frames, up to ' + columns + ' columns and ' + rows + ' rows')
