#!/usr/bin/env node

// Renders a party at work frame by frame into a PNG contact sheet: a subagent's ball per
// mon dropping and opening, the mons stepping out beside the lead as the strip widens,
// their bubbles following their own agents' thinking and tools, a failed call's flinch,
// a stroll, then each agent finishing, its mon hopping and going back into its ball, and
// the strip shrinking back. It drives the real band renderer in hooks/register.js with
// the stand-in host in stub-host.mjs.
//
// node scripts/preview-party.mjs <lead> <mon>... [options]
//   --columns <n>   the band's width in columns (default 80)
//   --agents <n>    subagents to run (default one per mon)
//   --wild <foe>    call a wild mon in once the party is out
//   --every <n>     keep every nth frame (default 6)
//   --scale <n>     screen pixels per sprite pixel (default 3)
//   --size <s>      small or large (default large)
//   --light         paint on a light terminal background
//   --out <file>    PNG to write (default /tmp/<lead>-party-<columns>.png)

import { parseArgs } from 'node:util'
import { SPRITES } from '../hooks/frames.js'
import { contactSheet, stubHost } from './stub-host.mjs'

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    columns: { type: 'string', default: '80' },
    agents: { type: 'string' },
    wild: { type: 'string' },
    every: { type: 'string', default: '6' },
    scale: { type: 'string', default: '3' },
    size: { type: 'string', default: 'large' },
    light: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
})
const [lead, ...mons] = positionals
if (!SPRITES[lead] || mons.length === 0 || !mons.every((name) => SPRITES[name]) || (opts.wild && !SPRITES[opts.wild])) {
  console.error('usage: node scripts/preview-party.mjs <lead> <mon>... [--columns n] [--agents n] [--wild foe] [--every n] [--scale n] [--size small|large] [--light] [--out file]')
  process.exit(1)
}

const EVERY = Number(opts.every)
const columns = Number(opts.columns)
// The mons in the box, the first named the highest level, so each comes out in turn
const stats = Object.fromEntries(mons.map((name, i) => [name, { xp: (30 - i) ** 3 }]))
const agents = []
const host = await stubHost({ saved: { mon: lead, wander: false, size: opts.size, stats, debug: true }, light: opts.light, bodyColumns: columns, agents })

const played = []
let age = 0
const playFor = async (ticks, until = () => false) => {
  for (let k = 0; k < ticks && !until(); k++) {
    age += 1
    await host.tick()
    played.push({ cells: host.screen.cells, columns: host.screen.columns, age })
  }
}

// A turn.step stream the sheet feeds a chunk at a time, through the band's hook
async function stepOf(agentId) {
  const queue = []
  let wake = null
  const source = (async function* () {
    while (true) {
      while (queue.length === 0) await new Promise((resolve) => (wake = resolve))
      const chunk = queue.shift()
      if (chunk === null) return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
      yield chunk
    }
  })()
  const hooked = await host.fire('turn.step', { turnId: 't', index: 0, model: 'claude-haiku-4-5', messageCount: 1, agentId }, () => source)
  return async (chunk) => {
    queue.push(chunk)
    wake?.()
    await hooked.next()
  }
}

// A tool call that runs until settled, answered as failed or not
function callOf(agentId, tool, id) {
  let settle = null
  const answer = new Promise((resolve) => (settle = resolve))
  const call = host.fire('tool.call', { tool, agentId, tool_use_id: id }, answer)
  return async (failed) => {
    settle(failed ? { isError: true, text: 'exit 1' } : { isError: false, text: 'ok' })
    await call
  }
}

const count = Number(opts.agents ?? mons.length)
const ids = Array.from({ length: count }, (_, k) => 'agent-' + k)
for (const id of ids) {
  agents.push({ id, description: 'Task ' + id.slice(6), status: 'running' })
  await host.fire('agent.spawn', {}, { agentId: id })
}
// The balls drop and open, and the mons that fit step out
await playFor(90)
console.log(await host.command('party'))

// The first agent thinks while the second runs a shell command
const think = await stepOf(ids[0])
await think({ kind: 'thinking', index: 0, text: 'Hmm' })
const shell = ids[1] ? callOf(ids[1], 'Bash', 'bash-1') : null
await playFor(40)
// Then the first writes and edits a file, and the second's command fails
await think({ kind: 'text', index: 1, text: 'Editing' })
await think({ kind: 'stop', stopReason: 'tool_use', usage: null })
await think(null)
const edit = callOf(ids[0], 'Edit', 'edit-1')
await shell?.(true)
await playFor(40)
await edit(false)

if (opts.wild) {
  console.log(await host.command('wild ' + opts.wild))
  await playFor(300, () => host.toasts.some((text) => text.includes('appeared')))
  await playFor(40)
} else {
  // A stroll, each mon on its own
  await playFor(240)
}

// Each agent finishes in turn, its mon hopping and going back in before its ball pops
for (const id of ids) {
  await host.fire('turn.complete', { agentId: id, isAborted: false, reason: 'answer' }, {})
  agents.find((agent) => agent.id === id).status = 'completed'
  await playFor(40)
}
const wide = host.screen.columns
await playFor(60, () => host.screen.columns < wide)
await playFor(4)
console.log(host.toasts.join('\n'))

const frames = played.filter((f, i) => i % EVERY === 0 || i === played.length - 1)
const out = opts.out ?? '/tmp/' + lead + '-party-' + columns + '.png'
const { rows, columns: widest } = contactSheet(frames, { out, scale: Number(opts.scale), light: opts.light, perRow: columns > 100 ? 3 : 5 })
console.log(out + ': ' + frames.length + ' frames, up to ' + widest + ' columns and ' + rows + ' rows')
