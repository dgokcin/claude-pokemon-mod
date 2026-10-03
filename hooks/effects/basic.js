// The fallback hit, played by any move whose effect is unknown

import { WHITE, burst, disc, dot, emit, light, phase, rnd } from './draw.js'

// Lean back, lunge, and land a starburst at the target with flying sparks
export function impact(out, t, a, g, c) {
  const hit = 5
  out.dx = t < hit - 1 ? -g.side : t < hit + 6 ? g.side * 2 : Math.round(g.side * 2 * (1 - phase(t, hit + 6, hit + 12)))
  if (t === hit || t === hit + 1) out.shake = [g.side, 0]
  const { x, y } = g.target
  if (t === hit) disc(out, x, y, 3, WHITE)
  const age = t - hit
  if (age >= 0 && age < 12) burst(out, x, y, age < 4 ? 2 + age : Math.max(1, 6 - (age - 4) * 0.7), c)
  emit(t, { count: 8, start: hit, gap: 0, life: 14 }, (i, life) => {
    const angle = rnd(a.seed, i) * Math.PI * 2
    const speed = 0.8 + rnd(a.seed, i, 1) * 0.8
    dot(out, x + Math.cos(angle) * speed * life, y + Math.sin(angle) * speed * life + 0.04 * life * life, life < 6 ? light(c, 0.5) : c)
  })
}

// A stand-in for an effect that isn't drawn yet
export const stub = (color) => ({ ticks: 28, color, draw: impact })

export const BASIC = {
  impact: { ticks: 26, color: 0xffe36e, draw: impact },
}
