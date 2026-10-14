// The band's clock, and the timings and sizes its parts share

export const TICK_MS = 50
// CSS pixels per sprite pixel on the desktop
export const PIXEL_PX = 4
// Image pixels per sprite pixel. The terminal scales the Image to its box, so sending
// each pixel as a block keeps its edges sharp.
export const IMAGE_UP = 4
// How long a terminal that drew an Image's alt gets half blocks before the Image is asked
// for again, from the first wait to the longest
export const IMAGE_WAIT_TICKS = [(2 * 1000) / TICK_MS, (5 * 60 * 1000) / TICK_MS]
export const MOVE_TICKS = 3
export const HOP_TICKS = 12
export const SLEEP_AFTER_MS = 5 * 60 * 1000
export const REST_TICKS = [60, 160]
export const STRIP_COLUMNS = 40
export const HEAD_ROWS = 1
export const HEAD_PIXELS = 8
export const DEFAULT_COLOR = 0x01000000
export const HEART_COUNT = 7
export const HEART_GAP_TICKS = 7
export const HEART_RISE_TICKS = 3
export const PET_TICKS = 60
export const FALL_TICKS = 2
export const EAT_TICKS = 30
export const YUM_TICKS = 30
export const FLINCH_TICKS = 24
export const SHAKE_TICKS = 12
export const DRIP_TICKS = 8
