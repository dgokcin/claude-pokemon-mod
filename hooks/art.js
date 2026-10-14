// The band's pixel art, the inks it draws straight on the terminal background, and stamps to place art in the scene

export const HEART_COLORS = [0xff4f8b, 0xff9ec4]
// Pixel hearts, big and small in turn: p body, h highlight
export const HEARTS = [['pp.pp', 'phppp', '.ppp.', '..p..'], ['p.p', 'ppp', '.p.']]
export const HEART_SHINE = 0xffe0ec
// A 4x4 pixel berry: k leaf, b rim, B body, h highlight. Each kind recolors it.
export const BERRY = ['.kk.', 'bBBb', 'bBhb', '.bb.']
export const BERRY_SIZE = 4
const LEAF_COLOR = 0x3a7a2a
export const BERRIES = [
  { name: 'oran berry', emoji: '🫐', colors: { k: LEAF_COLOR, b: 0x2c3f9e, B: 0x4a63d8, h: 0x9fb4ff } },
  { name: 'pecha berry', emoji: '🍑', colors: { k: LEAF_COLOR, b: 0xc2477a, B: 0xf48fb1, h: 0xffd1e3 } },
  { name: 'razz berry', emoji: '🍓', colors: { k: LEAF_COLOR, b: 0x8e1240, B: 0xd81b60, h: 0xff7aa8 } },
  { name: 'sitrus berry', emoji: '🍋', colors: { k: LEAF_COLOR, b: 0xc9a400, B: 0xfdd835, h: 0xfff59d } },
]
// Colors the band draws straight on the terminal background, one set per theme
export const INKS = {
  dark: {
    bubble: 0xf0f0f0, dots: 0x9a9ab0, z: 0xe8e8ff, star: 0xffd54f, silhouette: 0xf8f8ff,
    pencil: 0xffc83d, lens: 0x6cc4ff, shell: 0x5fe08a, ball: 0xeeeef6, disc: 0xd4d4e0, wrench: 0xb8b8c8, party: 0xb4b4c8,
    discShade: 0x8e8ea0, sweat: 0x6ec8ff, sweatShine: 0xe6f7ff, hpEmpty: 0x404048,
  },
  light: {
    bubble: 0x4a4a58, dots: 0x70708a, z: 0x5a5aa8, star: 0xe0a000, silhouette: 0x2e2e3a,
    pencil: 0xe08a00, lens: 0x2a7ad0, shell: 0x1f9a4a, ball: 0xa8a8b4, disc: 0x6e6e88, wrench: 0x6a6a80, party: 0x5c5c74,
    discShade: 0x44445a, sweat: 0x2b8fe0, sweatShine: 0xbfe4ff, hpEmpty: 0xc8c8d0,
  },
}

// Pixel art stamps: rows of letters, each letter a color, '.' transparent
// The thought bubble is an outline with no fill, drawn in the theme's bubble ink
const BUBBLE = ['.OOOOOOO.', 'O.......O', 'O.......O', 'O.......O', 'O.......O', 'O.......O', 'O.......O', '.OOOOOOO.']
const BUBBLE_WIDTH = BUBBLE[0].length
// The columns a bubble and its tail take beside the head
export const BUBBLE_SPAN = BUBBLE_WIDTH + 3
export const BUBBLE_TAIL_ROW = 2
// Each icon has small art too, for a shrunk band's bubble
export const BUBBLE_ICONS = {
  food: { rows: ['.rgr.', 'rrrrr', '.rrr.', '..r..'], small: ['.g.', 'rrr', '.r.'], colors: { r: 0xd84040, g: 0x58a040 } },
  happiness: { rows: ['pp.pp', 'ppppp', '.ppp.', '..p..'], small: ['p.p', 'ppp', '.p.'], colors: { p: 0xf0609a } },
}
export const STAR = ['..s..', 'sssss', '.sss.', '.s.s.']
export const SMALL_STAR = ['.s.', 'sss', 's.s']
export const SMALL_Z = ['zzz', '.z.', 'zzz']
export const BIG_Z = ['zzzz', '..z.', '.z..', 'zzzz']
// A shrunk band draws the bubble, Zs, and berry at its own pixel size, from art made for
// it, instead of shrinking the full-size art down to specks. Its bubble is the full-size
// one's shape a size down, holding the icons' small art with a pixel of room around it.
export const SMALL_ZS = { glyphs: [SMALL_Z, SMALL_Z], drift: 3 }
export const SMALL_BERRY = ['.k.', 'BhB', '.b.']
// The bubble drawn: the full-size one, with the icon's columns and rows in from its corner
export const FULL_BUBBLE = { frame: BUBBLE, inset: [2, 2], small: false }
// A shrunk band's bubble, with the icon's small art in the middle of it
const SMALL_BUBBLE = ['.OOOOO.', 'O.....O', 'O.....O', 'O.....O', 'O.....O', 'O.....O', '.OOOOO.']
export function shrunkBubble(icon) {
  const room = SMALL_BUBBLE.length - 2
  const inset = [1 + Math.floor((room - icon.small[0].length) / 2), 1 + Math.floor((room - icon.small.length) / 2)]
  return { frame: SMALL_BUBBLE, inset, small: true }
}
// The columns a bubble and its tail take beside the head
export const bubbleSpan = (look) => look.frame[0].length + 3
// A sweat drop on the head when a tool call fails: d drop, h shine
export const SWEAT = ['..d.', '.dd.', 'dhdd', 'dddd', '.dd.']
// The "!" of a trainer who spots you, shown while Claude waits on you
export const ALERT_ICON = { rows: ['..a..', '..a..', '.....', '..a..'], small: ['a', 'a', '.', 'a'], colors: { a: 0xff3d3d } }
// What the bubble shows while a tool runs: a pencil (p body, e eraser, t wood, g lead),
// a magnifier (l rim, h handle), a shell prompt (s), a Poké Ball (r top, k band,
// w button, b bottom), a TM disc (c disc, d shade, n shine) for a skill, or a wrench (m) for
// every other tool, MCP tools included
export const TOOL_ICONS = {
  pencil: ['...pe', '..pp.', '.pp..', 'gt...'],
  lens: ['.ll..', 'l..l.', '.llh.', '....h'],
  shell: ['s....', '.s...', 's....', '..sss'],
  ball: ['.rrr.', 'rrrrr', 'kkwkk', '.bbb.'],
  disc: ['.ncc.', 'nc.cc', 'ccccd', '.cdd.'],
  wrench: ['..m.m', '..mmm', '.m...', 'm....'],
}
export const SMALL_TOOL_ICONS = {
  pencil: ['..e', '.p.', 'g..'],
  lens: ['.l.', 'l.l', '.lh'],
  shell: ['s..', '.s.', 's..'],
  ball: ['rrr', 'kwk', 'bbb'],
  disc: ['ncc', 'c.c', 'ccd'],
  wrench: ['m.m', 'mmm', '.m.'],
}
export const TOOL_KINDS = {
  pencil: ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'],
  lens: ['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'ToolSearch', 'LSP'],
  shell: ['Bash', 'PowerShell', 'Monitor', 'BashOutput', 'KillShell'],
  ball: ['Agent', 'Task', 'SendMessage', 'Workflow'],
  disc: ['Skill'],
}

export const stamp = (x, y, rows, colors) => ({ x, y, rows, colors })

// A stamp's color at a strip column and pixel row, or null
export function stampPixel(s, cx, py) {
  const row = s.rows[py - s.y]
  if (!row) return null
  const ch = row[cx - s.x]
  return ch === undefined ? null : (s.colors[ch] ?? null)
}

export const SPARKLE = { s: 0xfff2a0, w: 0xffffff }
export const SPARKLES = [[-2, -2], [8, -1], [-3, 3], [9, 4], [3, -3]]
// The meters' icons, plain text unless /pokemon emoji turns emoji on. Each text pair is a
// filled and an empty glyph from one Unicode block, drawn one column wide at one size, with
// no emoji presentation. An emoji icon takes two columns: a filled one is drawn two wide from
// the emoji font whatever the terminal's font, and an empty one is followed by a space. Some
// fonts lack ○ or ♡ and borrow a wider glyph, which then spills into the space, not the next icon.
export const METER_STYLES = {
  text: {
    columns: 1,
    food: { icon: '●', emptyIcon: '○', color: '#ea697d' },
    happiness: { icon: '♥', emptyIcon: '♡', color: '#ff5f9e' },
  },
  emoji: {
    columns: 2,
    // The empty icons take the color of the emoji they stand in for
    food: { icon: '🍓', emptyIcon: '○', color: '#e0303e' },
    happiness: { icon: '💗', emptyIcon: '♡', color: '#ff7aa8' },
  },
}
// A terminal that draws Images gets the text hearts as pixel hearts instead, since some
// fonts lack ♥ or ♡. Each takes one cell, HEART_CELL pixels wide and twice as tall, and
// sits where a font like Hack draws ● beside it: the cell's full width, about as tall,
// from HEART_TOP down. An empty heart is the full one's rim, two pixels thick.
// A retina cell is about 14 device pixels wide and a non-retina one about 7. The
// terminal scales the PNG to the cell without smoothing, so there it keeps about every
// other pixel. Every feature is at least two pixels wide, and the lobes sit on even
// columns, so what's kept is still a heart with a closed rim.
export const HEART_ICON = [
  '..pppp..pppp..',
  '.ppppp..ppppp.',
  'pppppppppppppp',
  'pppppppppppppp',
  'pppppppppppppp',
  'pppppppppppppp',
  '.pppppppppppp.',
  '..pppppppppp..',
  '...pppppppp...',
  '....pppppp....',
  '.....pppp.....',
  '......pp......',
]
export const HEART_CELL = 14
export const HEART_TOP = 10
