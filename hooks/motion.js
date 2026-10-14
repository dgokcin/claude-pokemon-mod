import { BERRIES, BERRY, BERRY_SIZE, HEART_COLORS, HEART_SHINE, HEARTS, SMALL_BERRY, stamp } from './art.js'
import { attackPose, prepareAttack } from './attacks.js'
import { isAlerted, stepIdleAlert } from './bubble.js'
import {
  EAT_TICKS, FALL_TICKS, HEART_COUNT, HEART_GAP_TICKS, HEART_RISE_TICKS, HOP_TICKS, MOVE_TICKS, PET_TICKS, REST_TICKS, TICK_MS,
  YUM_TICKS,
} from './constants.js'
import { SPRITES } from './frames.js'
import { bandRows, clampX, edgeBehind, homeX, leadFloor, workTurnX } from './layout.js'
import { FEED_FOOD, FEED_HAPPINESS, NEEDY_BELOW, statNow } from './meters.js'
import { prunedParty } from './party.js'
import { boxOf, COLORS, MONS } from './sprites.js'
import { S } from './state.js'
import {
  isAsleep, isBackingUp, isDown, isDrowsy, isFlinching, isHopping, isPetted, isShaking, isTuckedIn, markActive,
} from './status.js'
import { ATTACK_GAP_MS, ATTACK_JITTER_MS } from './wild.js'

// The mon's moves along the strip each tick: wandering, pacing while Claude works,
// hopping, walking to a berry and eating it, enjoying a pet, flinching, and playing a move

// How far right of the sprite's left edge a berry lies when it sits under the middle of
// the body, which can be off the middle of the frame. An eating mon stands unmirrored.
function berryUnderBody() {
  const box = boxOf(SPRITES[S.mon].variants[S.variant].idle[0].rows, COLORS[S.mon][S.variant])
  return Math.round((box.left + box.right + 1 - BERRY_SIZE) / 2)
}

// Where the sprite stands to eat: with the berry in front of the middle of its body,
// kept inside the strip
function foodTarget() {
  return Math.max(leadFloor(), Math.min(homeX(), S.food.x - berryUnderBody()))
}

// Where the idle sprite is headed. Pacing while working is handled in step().
function idleTarget() {
  if (S.food) return S.food.eatStart === null ? foodTarget() : S.x
  if (isAsleep() || isHopping() || isPetted()) return S.x
  if (S.wild || !S.wander || isTuckedIn() || isDrowsy()) return homeX()
  return S.wanderTarget ?? S.x
}

export function isWalking() {
  if (S.attack || isAlerted() || isFlinching() || isDown()) return false
  return S.food ? idleTarget() !== S.x : (S.working && !S.wild) || idleTarget() !== S.x
}

// A tool call that failed makes the mon wince: it shakes in place, then holds still
// with a sweat drop. Another failure starts it over, and a move or evolution ignores it.
export function flinch() {
  if (S.attack || isDown()) return
  markActive()
  S.flinchStart = S.tick
}

// A pixel to either side in turn while the flinch shakes, kept inside the strip
export function flinchJolt(baseX, width) {
  if (!isShaking()) return 0
  const side = Math.floor((S.tick - S.flinchStart) / 2) % 2 === 0 ? -1 : 1
  return Math.max(-baseX, Math.min(S.columns - width - baseX, side))
}

// Stop to enjoy it, hop, and send a stream of hearts up around the sprite
// Asleep, it stays asleep: the hearts still float up, but it doesn't hop
export function pet() {
  if (!isAsleep()) {
    markActive()
    S.hopStart = S.tick
  }
  S.petUntil = S.tick + PET_TICKS
  const width = SPRITES[S.mon].width
  const lowest = bandRows() * 2 - 6
  for (let k = 0; k < HEART_COUNT; k++) {
    S.hearts.push({
      x: S.x - 2 + Math.floor(Math.random() * (width + 2)),
      y: lowest - Math.floor(Math.random() * 6),
      born: S.tick + k * HEART_GAP_TICKS,
      rows: HEARTS[k % HEARTS.length],
      colors: { p: HEART_COLORS[k % HEART_COLORS.length], h: HEART_SHINE },
    })
  }
}

// Drop a random berry a few columns away, on whichever side has room, for the sprite to
// walk to. It lands where the sprite can stand over it, not so near an edge that the
// body would leave the strip.
export function feed() {
  markActive()
  const width = SPRITES[S.mon].width
  const gap = 3 + Math.floor(Math.random() * 6)
  const under = berryUnderBody()
  const lowest = Math.max(leadFloor(), leadFloor() + under)
  const highest = Math.min(S.columns - BERRY_SIZE, homeX() + under)
  const right = S.x + width + gap
  const fx = Math.max(lowest, Math.min(highest, right <= highest ? right : S.x - gap - BERRY_SIZE))
  const berry = BERRIES[Math.floor(Math.random() * BERRIES.length)]
  S.food = { x: fx, born: S.tick, eatStart: null, berry, fills: null }
  S.wanderTarget = null
  return berry
}

// The berry's top pixel row: falling a pixel every few ticks until it rests on the ground
function foodTop() {
  const ground = bandRows() * 2 - BERRY_SIZE
  return Math.min(ground, -BERRY_SIZE + Math.floor((S.tick - S.food.born) / FALL_TICKS))
}

// Whether column fx of a berry size pixels wide is eaten yet. Bites take a column at a
// time from either edge in turn, until the middle is gone too.
function bitten(fx, size) {
  if (S.food.eatStart === null) return false
  const bites = Math.floor(((S.tick - S.food.eatStart) / EAT_TICKS) * size)
  return fx < Math.ceil(bites / 2) || size - 1 - fx < Math.floor(bites / 2)
}

// The berry's color at a strip column and pixel row, or null
export function foodPixel(cx, py) {
  if (!S.food) return null
  const fx = cx - S.food.x
  const fy = py - foodTop()
  if (fx < 0 || fx >= BERRY_SIZE || fy < 0 || fy >= BERRY_SIZE || bitten(fx, BERRY_SIZE)) return null
  return S.food.berry.colors[BERRY[fy][fx]] ?? null
}

// The berry as a shrunk band draws it, in its own pixels: centred where the full-size one
// is, a scene column offset from the strip's, and falling and bitten as it is
export function smallBerryStamp(scale, offset) {
  const size = SMALL_BERRY.length
  const left = Math.round((offset + S.food.x + BERRY_SIZE / 2) * scale - size / 2)
  const top = Math.round((foodTop() + BERRY_SIZE) * scale) - size
  const rows = SMALL_BERRY.map((row) => [...row].map((ch, fx) => (bitten(fx, size) ? '.' : ch)).join(''))
  return stamp(left, top, rows, S.food.berry.colors)
}

// Walk to the berry once it lands, eat it, then hop with a "yum!"
function stepFood() {
  markActive()
  const landed = foodTop() === bandRows() * 2 - BERRY_SIZE
  if (S.food.eatStart !== null) {
    if (S.tick - S.food.eatStart < EAT_TICKS) return
    if (S.food.fills) S.owed.push({ name: S.food.fills, food: FEED_FOOD, happiness: FEED_HAPPINESS })
    S.food = null
    S.yumUntil = S.tick + YUM_TICKS
    S.hopStart = S.tick
    return
  }
  if (!landed || S.tick % MOVE_TICKS !== 0) return
  const target = foodTarget()
  if (target === S.x) {
    S.food.eatStart = S.tick
    return
  }
  S.facing = target < S.x ? 'left' : 'right'
  S.x += S.facing === 'left' ? -1 : 1
  clampX()
}

// Each heart where it is now: rising a pixel every few ticks with a slight sway
export function heartStamps() {
  const out = []
  for (const heart of S.hearts) {
    const age = S.tick - heart.born
    if (age < 0) continue
    const sway = Math.floor(age / (HEART_RISE_TICKS * 3)) % 2
    out.push(stamp(heart.x + sway, heart.y - Math.floor(age / HEART_RISE_TICKS), heart.rows, heart.colors))
  }
  return out
}

// Start one of the mon's moves, aimed at the roomier side. A move aimed ahead first
// backs the mon up to the edge behind it, so it plays with the whole strip ahead, the
// way it was tuned. A move on itself plays where the mon stands. The move takes over
// the body, so a hop in progress stops. A move at a foe plays from home, facing left at it.
export function startAttack(move, { foe = false } = {}) {
  markActive()
  clampX()
  S.wanderTarget = null
  S.hopStart = -HOP_TICKS
  const side = foe || S.x - leadFloor() >= homeX() - S.x ? 'left' : 'right'
  const seed = Math.floor(Math.random() * 0x7fffffff)
  const others = MONS.filter((name) => name !== S.mon)
  const aimed = attackPose(prepareAttack(move, { side, seed, x: S.x, home: homeX() }), 0).view === 'side'
  S.attack = { move, side, seed, start: S.tick, backing: !foe, swap: others[Math.floor(Math.random() * others.length)], atFoe: foe, landed: false }
  if (foe) S.wild = { ...S.wild, nextAttackAt: S.tick + Math.round((ATTACK_GAP_MS + Math.random() * ATTACK_JITTER_MS) / TICK_MS) }
  if (foe || !aimed || S.x === edgeBehind(side)) playMove()
}

// Settle the move from where the mon stands now, and start it
function playMove() {
  const { move, side, seed } = S.attack
  Object.assign(S.attack, prepareAttack(move, { side, seed, x: S.x, home: homeX() }), { start: S.tick, backing: false })
}

// Back up a pixel a tick and start the move at the edge, hold still while it plays,
// then land wherever it left the mon
function stepAttack() {
  markActive()
  if (isBackingUp()) {
    S.x += Math.sign(edgeBehind(S.attack.side) - S.x)
    if (S.x === edgeBehind(S.attack.side)) playMove()
    return
  }
  if (S.tick - S.attack.start < S.attack.ticks) return
  if (S.attack.toX !== null) S.x = S.attack.toX
  S.facing = S.attack.side
  S.attack = null
  clampX()
}

// Pick the next spot to stroll to once the rest is over
function planWander() {
  if (S.wild || !S.wander || S.working || S.wanderTarget !== null || S.tick < S.restUntil) return
  S.wanderTarget = leadFloor() + Math.floor(Math.random() * (homeX() - leadFloor() + 1))
}

// Advance the clock and move one column every few ticks: pacing while
// working, heading for the idle target otherwise
export function step() {
  S.tick += 1
  S.nowMs += TICK_MS
  S.hearts = S.hearts.filter((heart) => S.tick - heart.born <= (heart.y + heart.rows.length) * HEART_RISE_TICKS)
  S.party = prunedParty(S.party, S.tick)
  // A party mon leaves the crew once its ball has popped
  if (S.crew.length > 0) S.crew = S.crew.filter((m) => S.party.some((ball) => ball.id === m.id))
  stepIdleAlert()
  if (isDown()) return
  if (S.attack) return stepAttack()
  // Calling you over, it stays awake and stands still, even with a berry to eat
  if (isAlerted()) return markActive()
  if (isFlinching()) return
  if (S.food) return stepFood()
  if (S.working) markActive()
  planWander()
  hopForJoy()
  if (S.tick % moveTicks() !== 0) return

  if (S.working && !S.wild) {
    if (S.facing === 'left' && S.x <= leadFloor()) S.facing = 'right'
    else if (S.facing === 'right' && S.x >= workTurnX()) S.facing = 'left'
  } else {
    const target = idleTarget()
    if (target === S.x) {
      if (S.wanderTarget !== null) {
        S.wanderTarget = null
        S.restUntil = S.tick + REST_TICKS[0] + Math.floor(Math.random() * (REST_TICKS[1] - REST_TICKS[0]))
      }
      return
    }
    S.facing = target < S.x ? 'left' : 'right'
  }
  S.x += S.facing === 'left' ? -1 : 1
  clampX()
}

const HUNGRY_MOVE_TICKS = 5
const HAPPY_FROM = 80
const JOY_HOP_TICKS = [400, 800]

// A hungry mon drags its feet, except on its way to a berry
const moveTicks = () => (S.needsOn && statNow(S.mon, 'food') < NEEDY_BELOW ? HUNGRY_MOVE_TICKS : MOVE_TICKS)

// A happy mon hops for joy every 20 to 40 seconds while idle and awake
function hopForJoy() {
  if (!S.needsOn || S.working || isAsleep() || statNow(S.mon, 'happiness') < HAPPY_FROM) {
    S.joyHopAt = null
  } else if (S.joyHopAt === null) {
    S.joyHopAt = S.tick + JOY_HOP_TICKS[0] + Math.floor(Math.random() * (JOY_HOP_TICKS[1] - JOY_HOP_TICKS[0]))
  } else if (S.tick >= S.joyHopAt) {
    S.hopStart = S.tick
    S.joyHopAt = null
  }
}
