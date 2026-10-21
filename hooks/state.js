import { INKS } from './art.js'
import { FLINCH_TICKS, HOP_TICKS, IMAGE_WAIT_TICKS, STRIP_COLUMNS } from './constants.js'

// This session's band state, one object every part of the band reads and writes, since a
// module can't reassign a variable it imports
export const S = {
  mon: 'abra',
  variant: 'default',
  wander: true,
  working: false,
  // Whether a model turn of the main agent is running, from the turn events alone. The
  // band's isWorking can read true while no turn runs, as when a slash command runs.
  turnRunning: false,
  thinking: false,
  runningTools: new Map(),
  // Skill calls in flight from any agent, main loop or subagent, by tool_use_id
  runningSkills: new Set(),
  // The tick a typed skill's TM disc shows until
  discUntil: 0,
  toolCalls: 0,
  verdicts: new Map(),
  flinchStart: -FLINCH_TICKS,
  alertTools: new Set(),
  alertUntil: 0,
  idleAlertAt: null,
  party: [],
  // The party mons of running subagents, as in crew.js, and the strip columns at the left
  // they walk in, 0 while none is out
  crew: [],
  crewWidth: 0,
  bandId: null,
  paneOn: false,
  paneShown: false,
  // The surface the band is drawn on, terminal or desktop
  bandSurface: 'terminal',
  columns: STRIP_COLUMNS,
  // The columns behind the level and meters at the strip's right, 0 when they sit beside
  // a band shrunk to fit instead. The scene runs on under them, so a bubble, hearts, and Zs
  // can float over the meters, but the mon stays in the strip.
  panel: 0,
  // Empty columns drawn left of the strip, so a bubble always fits on the left of the head.
  // They take only band width that's free, and none in a band shrunk to fit.
  margin: 0,
  tick: 0,
  x: STRIP_COLUMNS,
  facing: 'left',
  lastActive: 0,
  hopStart: -HOP_TICKS,
  wanderTarget: null,
  restUntil: 0,
  petUntil: 0,
  hearts: [],
  food: null,
  // Meter gains a berry or a pet has earned, paid once its animation ends
  owed: [],
  // The pet whose hearts are still floating, while it has a gain to pay
  pettingFills: null,
  yumUntil: 0,
  attack: null,
  drawnRows: null,
  drawnColumns: null,
  // The band's width as last drawn, for whether a battle fits
  lastBodyColumns: 0,
  // The wild mon visiting this session, as in wild.js
  wild: null,
  // Marks this session's claims on the shared encounter gate
  sessionToken: null,
  lastSpawnCheck: -Infinity,
  // The mon this session claimed the gate for, spawned once the claim proves to have stuck
  claimedPick: null,
  nowMs: 0,
  stats: {},
  needsOn: true,
  emojiOn: false,
  // The band's size from /pokemon size, a key of SIZES
  size: 'large',
  autoEvolve: true,
  // With /pokemon sync on, every open session follows the last mon picked in any of them
  syncOn: false,
  // The saved pick this session last read or wrote, so a sync follows only a newer pick
  seenPick: null,
  // With /pokemon nuzlocke on, a mon that faints is gone for good
  nuzlockeOn: false,
  // With /pokemon trainer on, you pick one starter and show only mons in your box
  trainerOn: true,
  // The party picked with /pokemon party add and remove, in order, or null for the box's
  // highest level mons
  partyPicks: null,
  // The mon each agent type comes out as, set with /pokemon party assign, keyed by the
  // type in lowercase, like { explore: 'abra' }
  partyAgents: {},
  // When each mon was first shown in this session, for the grace before its faint clock runs
  firstShown: new Map(),
  // Set while this session checks the shown mon's faint clock or finishes its heal
  checkingNeglect: false,
  finishingHeal: false,
  evolving: null,
  evolveDue: null,
  joyHopAt: null,
  sentCells: null,
  sentImage: null,
  // Set once a blit swaps the Image's source, so the terminal draws Images and a redraw
  // needn't ask again
  imagesDrawn: false,
  // Set on a terminal that can't show the small band's Image, which gets it in half blocks
  noImages: false,
  // Whether the terminal is one known to draw Images, and /pokemon images, a key of IMAGE_MODES
  knownImages: false,
  imageMode: 'auto',
  // After a terminal draws an Image's alt, the small band is half blocks until this tick.
  // Each deny in a row doubles the wait, since a terminal without kitty graphics never
  // draws one, while one whose graphics aren't ready yet soon does.
  imageRetryAt: null,
  imageWait: IMAGE_WAIT_TICKS[0],
  // Whether the band as last drawn holds the Image, or else Raster cells
  drawnImage: false,
  // The pixel hearts' PNG last sent or drawn, and whether the band as last drawn holds them
  sentHearts: null,
  drawnHearts: false,
  sentSvg: null,
  // Counts the distinct frames drawn on the desktop. Each one goes under a new key, since
  // the desktop keeps showing an Svg's first frame while its place in the tree holds.
  svgFrame: 0,
  maxRows: Infinity,
  ink: INKS.dark,

  // It goes into its ball in a flash, and back from the Pokémon Center its ball bursts open
  // in one where it stands
  releasedAt: null,
}
