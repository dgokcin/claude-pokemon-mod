import { BUBBLE_SPAN } from './art.js'
import { HEAD_ROWS, STRIP_COLUMNS } from './constants.js'
import { SPRITES } from './frames.js'
import { CENTER_ROWS, centerSpan } from './joy.js'
import { addSprite, dizzyRows, idleBox, resizedSprite, RIGHT_GAP, rowsOf, WALK_HEAD_RIGHT } from './sprites.js'
import { S } from './state.js'
import { isFainted, isHealing } from './status.js'
import { crewWanted } from './team.js'
import { battleColumns, foeSpotX, foeX, isOnStage } from './wild.js'
import { SIZES, zoomFor } from './zoom.js'

// Where the band's parts go: its rows, columns, and scale, the strip, the mon's home at
// its right edge, and the foe's spot

// The foe as drawn. In a small band it stands as tall on screen as it would as the mon on
// show, so a big foe makes the band taller rather than shrinking to the home mon. Only a
// half block band, whose scale goes by the mon, resizes it. Each size is resized once and
// kept under its own name, unlisted. A foe too tall for the room the home mon leaves in a
// short band, as on desktop, shrinks to fit it rather than shrinking the home mon with it.
function foeAs(name) {
  const own = SPRITES[name].height
  const shown = SIZES[S.size] >= 1 ? own : Math.max(1, Math.round((own * bandScale(rowsOf(name))) / bandScale()))
  const height = Math.max(1, Math.min(shown, 2 * (foeRoom() - HEAD_ROWS)))
  if (height === own) return name
  const sized = name + '@' + height
  if (!SPRITES[sized]) addSprite(sized, resizedSprite(name, height), false)
  return sized
}
export const foeName = () => foeAs(S.wild.mon)

// While a mon evolves or transforms, the band is tall enough for both shapes, while it
// heals, for the Pokémon Center, and while it's fainted, for the stars over its head
const homeRows = () => {
  if (isHealing(S.mon)) return Math.max(rowsOf(S.mon), CENTER_ROWS)
  if (isFainted(S.mon)) return Math.max(rowsOf(S.mon), dizzyRows(S.mon))
  if (S.evolving) return Math.max(rowsOf(S.evolving.from), rowsOf(S.evolving.into))
  if (S.attack?.move.effect === 'transform') return Math.max(rowsOf(S.mon), rowsOf(S.attack.swap))
  return rowsOf(S.mon)
}
// A foe on stage makes the band tall enough for it too, and so does a party mon out
const crewRows = () => Math.max(0, ...S.crew.filter((m) => m.outAt !== null).map((m) => rowsOf(m.mon)))
export const bandRows = () => Math.max(isOnStage(S.wild) ? Math.max(homeRows(), rowsOf(foeName())) : homeRows(), crewRows())
// The band's size on screen, shrunk to fit a short pane, or null when only the badge fits
// A terminal known to lack Images draws the small band in half blocks, where a mon at
// half size loses too much to read. It shrinks no shorter than a full-size Diglett. The
// scale goes by the home mon, so a foe never shrinks it.
const HALF_BLOCK_MIN_ROWS = rowsOf('diglett')
const bandScale = (rows = homeRows()) => {
  const scale = SIZES[S.size]
  if (scale >= 1 || !S.noImages || S.bandSurface !== 'terminal') return scale
  return Math.min(1, Math.max(scale, HALF_BLOCK_MIN_ROWS / rows))
}
export const bandZoom = () => zoomFor({ columns: sceneColumns(), rows: bandRows(), maxRows: S.maxRows, size: bandScale() })
// The scene rows a foe can take without the band shrinking past the home mon's own fit
export const foeRoom = () => {
  const home = zoomFor({ columns: 1, rows: homeRows(), maxRows: S.maxRows, size: bandScale() })
  return home ? Math.floor(S.maxRows / home.scale + 1e-9) : Infinity
}
// The strip and the panel, in the strip's own columns, and the whole scene with the margin
export const stripColumns = () => S.columns + S.panel
export const sceneColumns = () => S.margin + S.columns + S.panel
// The rows the level and meters take at the bottom of the panel
const panelRows = () => (S.needsOn ? 3 : 1)

// The fewest empty columns on screen between a mon at home and the level and meters beside
// it. A small band shows the scene at its scale, so the gap takes more of its columns.
const HOME_GAP = 3
const homeGap = () => Math.ceil(HOME_GAP / bandScale() - 1e-9)
// The columns a mon's frame adds right of its body to keep the gap, past what it leaves empty
export const gapRightOf = (name) => Math.max(0, homeGap() - RIGHT_GAP[name][S.variant])
// The right edge of the strip, where the sprite idles, kept the gap clear of the meters
// whatever empty space the sprite's frame leaves on its right
export const homeXOf = (name) => Math.max(0, S.columns - SPRITES[name].width - gapRightOf(name))
export const homeX = () => homeXOf(S.mon)
export const isHome = () => S.x >= homeX()
// The lead keeps to the strip right of the party mons' columns
export const leadFloor = () => Math.min(S.crewWidth, homeX())

// The strip edge behind a mon aiming at side, where it backs up to before the move
export const edgeBehind = (side) => (side === 'left' ? homeX() : leadFloor())

// The home mon's columns from its opaque left edge to the strip's right
const homeSpan = () => SPRITES[S.mon].width + gapRightOf(S.mon) - idleBox(S.mon, S.variant).left

// The strip columns a battle with this foe takes, beside the home mon at the strip's right
const battleNeeds = (foe, foeVariant) => battleColumns(homeSpan(), idleBox(foe, foeVariant))

// The strip columns a heal takes, with the Pokémon Center in place of the home mon
const healNeeds = () => centerSpan()

// The scene columns left of the panel in a band bodyColumns wide. The small band shows
// the scene at its scale, so each band column holds more than one of the scene's.
export function sceneRoom(bodyColumns) {
  const small = smallZoom()
  return (small ? Math.floor(bodyColumns / small.scale) : bodyColumns) - S.panel
}

export const battleFits = (foe, foeVariant) => battleNeeds(foeAs(foe), foeVariant) <= sceneRoom(S.lastBodyColumns)

// The lead's strip in room scene columns, grown on the left while a foe is on stage or
// the mon heals at the Pokémon Center
export function baseStrip(room) {
  const strip = Math.max(SPRITES[S.mon].width, Math.min(STRIP_COLUMNS, room))
  if (isOnStage(S.wild)) return Math.max(strip, Math.min(battleNeeds(foeName(), S.wild.variant), room))
  return isHealing(S.mon) ? Math.max(strip, Math.min(healNeeds(), room)) : strip
}

// The strip's width in a band bodyColumns wide. While a party mon is out, or one is due
// out and fits, it takes all the room the band has, the lead's strip and any foe's first.
export function stripTarget(bodyColumns) {
  const room = sceneRoom(bodyColumns)
  const base = baseStrip(room)
  const crewing = S.crew.some((m) => m.outAt !== null) || crewWanted(room - base).length > 0
  return crewing ? Math.max(base, room) : base
}

// The foe's spot facing the home mon, and the column just out of sight past the scene's left edge
export const wildAt = () => ({
  spot: foeSpotX(homeX() + idleBox(S.mon, S.variant).left, idleBox(foeName(), S.wild.variant)),
  offLeft: -S.margin - SPRITES[foeName()].width,
})

// The foe's opaque box in strip pixels, as it stands in battle
export function foeBox(rows) {
  const foe = foeName()
  const box = idleBox(foe, S.wild.variant)
  const left = foeX(S.wild, wildAt())
  const top = rows * 2 - SPRITES[foe].height
  return { left: left + box.left, right: left + box.right, top: top + box.top, bottom: top + box.bottom }
}

export function foeMiddle(rows) {
  const box = foeBox(rows)
  return { x: Math.round((box.left + box.right) / 2), y: Math.round((box.top + box.bottom) / 2) }
}

// The cells left blank under the level and meters, which are drawn over them
export const underPanel = (cx, cy, zoom) => cx >= (isSmall() ? zoom.columns - Math.round(S.panel * zoom.scale) : S.margin + S.columns) && cy >= zoom.rows - panelRows()

// The small band is the full-size scene drawn into a smaller box: an Image in the
// terminal, scaled by the terminal so no pixel is lost, and an Svg on the desktop. In
// half blocks, it takes the zoom's votes as a shrunk band does.
export const isSmall = () => bandScale() < 1

// The small band's zoom while it shows at its own size, laid out as a full-size scene.
// Null otherwise, as when a short pane shrinks it further, which lays it out like a
// shrunk large band so it's never the wider of the two.
export function smallZoom() {
  const zoom = isSmall() ? bandZoom() : null
  return zoom?.scale === bandScale() ? zoom : null
}

// Where a mon pacing right while Claude works turns back: before its bubble, which leads
// on the right, would run past the panel, or at home if it never would
export const workTurnX = () => Math.max(leadFloor(), Math.min(homeX(), stripColumns() - BUBBLE_SPAN - 1 - WALK_HEAD_RIGHT[S.mon][S.variant]))

// Keep the sprite inside the strip, right of any party mons
export function clampX() {
  S.x = Math.max(leadFloor(), Math.min(homeX(), S.x))
}
