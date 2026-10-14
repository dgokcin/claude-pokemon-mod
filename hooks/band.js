import { BUBBLE_SPAN, INKS } from './art.js'
import { PIXEL_PX } from './constants.js'
import { SPRITES } from './frames.js'
import {
  bandRows, bandZoom, baseStrip, clampX, gapRightOf, homeX, isHome, isSmall, leadFloor, sceneRoom, smallZoom, stripTarget,
} from './layout.js'
import { filledIcons, iconsFor, meterColumns, meterStyle, STAT_ICONS } from './meters.js'
import { displayName } from './names.js'
import { cellsNow, drawsHearts, drawsImage, heartsImage, imageNow, svgNow } from './paint.js'
import { conditionOf, goneLine, levelLine, nameOf } from './records.js'
import { S } from './state.js'
import { isGone } from './status.js'
import { isOnStage } from './wild.js'

// The scene laid out in the band or the pane, with the level and meters beside or over it

// Any light theme takes the light ink. Every other theme, or none, takes the dark.
export const inkFor = (theme) => (typeof theme === 'string' && theme.startsWith('light') ? INKS.light : INKS.dark)

// Lays out the scene, the mon with its meters beside or over it, in the room the band
// or the pane gives it, and returns its parts, drawn with the surface's elements, for the
// site to wrap. The desktop draws the site's buttons under the meters.
export function drawScene(elements, e, site) {
  const desktop = e.surface === 'desktop'
  const { Box, Text } = elements
  const wasHome = isHome()
  S.bandId = e.requestId
  S.bandSurface = e.surface
  S.maxRows = site.maxRows
  // The panel goes over the scene's right end when the band shows at full size and
  // has room for it, and beside a shrunk band otherwise. The desktop draws text in its
  // own font, so its meters can't line up with the pixels and always sit beside them.
  // A small band at its own size lays out as a full-size one and shows it at its scale,
  // so its panel and margin take more of the scene's columns per band column.
  const panelColumns = meterColumns() + 1
  const fullSize = !isSmall() && bandRows() <= S.maxRows
  const small = smallZoom()
  // It goes over the scene only when the mon at home still keeps its gap from it.
  const atHome = SPRITES[S.mon].width + gapRightOf(S.mon)
  S.panel = !desktop && fullSize && site.bodyColumns >= atHome + panelColumns ? panelColumns : 0
  if (small && !desktop && site.bodyColumns >= atHome * small.scale + panelColumns) S.panel = Math.ceil(panelColumns / small.scale)
  S.lastBodyColumns = site.bodyColumns
  S.columns = stripTarget(site.bodyColumns)
  S.drawnColumns = S.columns
  // The party mons' columns open up on the strip's left, so the lead keeps its spot on screen
  const hadCrew = S.crewWidth
  S.crewWidth = Math.max(0, S.columns - baseStrip(sceneRoom(site.bodyColumns)))
  S.margin = fullSize ? Math.max(0, Math.min(BUBBLE_SPAN, site.bodyColumns - S.panel - S.columns)) : 0
  if (small) {
    const room = Math.floor((site.bodyColumns - (S.panel > 0 ? 0 : panelColumns)) / small.scale) - S.columns - S.panel - 1
    S.margin = Math.max(0, Math.min(BUBBLE_SPAN, room))
  }
  const shift = S.crewWidth - hadCrew
  if (wasHome) S.x = homeX()
  else S.x += shift
  if (shift !== 0 && S.wanderTarget !== null) S.wanderTarget = Math.max(leadFloor(), Math.min(homeX(), S.wanderTarget + shift))
  if (S.food) S.food.x += shift
  clampX()

  const zoom = bandZoom()
  // Pixel hearts go out with the band's blits, so a band too short for them has none
  S.drawnHearts = Boolean(zoom) && drawsHearts()
  const meter = (key, lead = '') => {
    const text = Text({ color: meterStyle()[key].color, children: [lead + iconsFor(key)] })
    if (key !== 'happiness' || !S.drawnHearts) return text
    const source = heartsImage(filledIcons(key))
    // Until a blit says the terminal draws Images, the next tick asks with one
    S.sentHearts = S.imagesDrawn ? source.png : null
    return elements.Image({ key: 'hearts', source, columns: STAT_ICONS, rows: 1, alt: iconsFor(key) })
  }
  const level = Text({ dimColor: true, children: [levelLine()] })
  let corner
  S.drawnImage = false
  if (isGone(S.mon)) {
    // Ran away or lost with no other mon in the box, the band is just a line saying so
    S.bandId = null
    S.drawnHearts = false
    corner = [Text({ dimColor: true, children: [goneLine(S.mon)] })]
  } else if (zoom) {
    let sprite
    if (desktop) {
      const svg = svgNow()
      if (svg !== S.sentSvg) S.svgFrame += 1
      S.sentSvg = svg
      const alt = isOnStage(S.wild) ? nameOf(S.mon) + ' vs. wild ' + displayName(S.wild.mon) : nameOf(S.mon) + (conditionOf(S.mon) ? ', ' + conditionOf(S.mon) : '')
      const image = elements.Svg({ source: svg, alt, width: zoom.columns * PIXEL_PX, height: zoom.rows * 2 * PIXEL_PX })
      sprite = Box({ key: 'pokemon-' + S.svgFrame, children: [image] })
    } else if (drawsImage()) {
      const source = imageNow(zoom)
      // Until a blit says the terminal draws Images, the next tick asks with one
      S.sentImage = S.imagesDrawn ? source.png : null
      S.drawnImage = true
      sprite = elements.Image({ key: 'pokemon', source, columns: zoom.columns, rows: zoom.rows, alt: ' ' })
    } else {
      S.sentCells = cellsNow()
      sprite = elements.Raster({ key: 'pokemon', columns: zoom.columns, rows: zoom.rows, cells: S.sentCells })
    }
    const meterLines = [...(S.needsOn ? [level, meter('food'), meter('happiness')] : [level]), ...(desktop ? (site.buttons ?? []) : [])]
    if (S.panel > 0) {
      const meters = Box({ position: 'absolute', right: 0, bottom: 0, width: panelColumns, paddingLeft: 1, flexDirection: 'column', children: meterLines })
      corner = [Box({ position: 'relative', children: [sprite, meters] })]
    } else {
      const meters = Box({ flexDirection: 'column', justifyContent: 'flex-end', paddingLeft: 1, children: meterLines })
      corner = site.bodyColumns >= zoom.columns + panelColumns ? [sprite, meters] : [sprite]
      // The desktop clips the band's right edge, so its meters keep clear of it
      if (desktop) corner = [Box({ flexDirection: 'row', flexShrink: 0, paddingRight: 2, children: corner })]
    }
  } else {
    // Too short even for a shrunk mon: its name, level, and meters on one line, and no blits
    S.bandId = null
    const name = Text({ children: [nameOf(S.mon) + ' ' + levelLine() + (conditionOf(S.mon) ? ' ' + conditionOf(S.mon) : '')] })
    const meters = S.needsOn ? [meter('food', ' '), meter('happiness', ' ')] : []
    corner = [Box({ flexDirection: 'row', children: [name, ...meters] })]
  }

  return corner
}
