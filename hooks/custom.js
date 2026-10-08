// Mons fetched with /pokemon new, from any generation jakobhoeg/vscode-pokemon has.
// The GIFs come through GitHub's contents API as base64, since $.http.fetch hands back
// text, and are decoded here the way scripts/build-frames.mjs decodes the bundled ones.
// Each mon is saved in the store under 'custom:<mon>', so it outlives plugin updates.
// Every fetch goes through the get passed in, (url, init) => $.http.fetch(url, init).

const REPO = 'https://api.github.com/repos/jakobhoeg/vscode-pokemon/contents/media'
const GENS = [1, 2, 3, 4, 5]
const VARIANTS = ['default', 'shiny']
const ANIMS = ['idle', 'walk']
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'claude-pokemon' }

export const CUSTOM_PREFIX = 'custom:'

// Moves with animations, picked by the mon's types since later moves have none
const TYPE_MOVES = {
  normal: ['Tackle', 'Quick Attack', 'Headbutt', 'Growl'],
  fire: ['Ember', 'Flamethrower', 'Fire Spin'],
  water: ['Water Gun', 'Bubble Beam', 'Hydro Pump'],
  grass: ['Vine Whip', 'Razor Leaf', 'Absorb'],
  electric: ['Thunder Shock', 'Thunderbolt', 'Thunder Wave'],
  ice: ['Ice Beam', 'Aurora Beam', 'Blizzard'],
  fighting: ['Karate Chop', 'Low Kick', 'Double Kick'],
  poison: ['Poison Sting', 'Acid', 'Sludge'],
  ground: ['Sand Attack', 'Dig', 'Earthquake'],
  flying: ['Gust', 'Wing Attack', 'Peck'],
  psychic: ['Confusion', 'Psybeam', 'Psychic'],
  bug: ['String Shot', 'Leech Life', 'Pin Missile'],
  rock: ['Rock Throw', 'Rock Slide', 'Harden'],
  ghost: ['Lick', 'Night Shade', 'Confuse Ray'],
  dragon: ['Dragon Rage', 'Outrage', 'Agility'],
  dark: ['Bite', 'Fury Swipes', 'Screech'],
  steel: ['Harden', 'Slash', 'Take Down'],
  fairy: ['Sing', 'Double Slap', 'Swift'],
}

// Two moves of the first type, one of the second, and Tackle to round out four
export function movesForTypes(types) {
  const [first, second] = types.filter((t) => TYPE_MOVES[t])
  const picked = [...(TYPE_MOVES[first] ?? []).slice(0, 2), ...(TYPE_MOVES[second] ?? []).slice(0, 1), 'Tackle']
  return [...new Set(picked)].slice(0, 4)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function fromBase64(text) {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63)
    out[o++] = n >> 16
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255
    if (i + 3 < clean.length) out[o++] = n & 255
  }
  return out.subarray(0, o)
}

// GIF LZW, least significant bit first, into count palette indices
function lzw(minSize, data, count) {
  const clear = 1 << minSize
  const eoi = clear + 1
  const prefix = new Int32Array(4096)
  const suffix = new Uint8Array(4096)
  const stack = new Uint8Array(4097)
  for (let i = 0; i < clear; i++) suffix[i] = i
  const out = new Uint8Array(count)
  let o = 0
  let size = minSize + 1
  let next = eoi + 1
  let prev = -1
  let first = 0
  let cur = 0
  let bits = 0
  for (const byte of data) {
    cur |= byte << bits
    bits += 8
    while (bits >= size) {
      const code = cur & ((1 << size) - 1)
      cur >>>= size
      bits -= size
      if (code === clear) {
        size = minSize + 1
        next = eoi + 1
        prev = -1
        continue
      }
      if (code === eoi) return out
      if (prev === -1) {
        if (o < count) out[o++] = suffix[code]
        prev = code
        first = code
        continue
      }
      let sp = 0
      let c = code
      if (code >= next) {
        stack[sp++] = first
        c = prev
      }
      while (c > eoi) {
        stack[sp++] = suffix[c]
        c = prefix[c]
      }
      first = suffix[c]
      stack[sp++] = first
      while (sp > 0 && o < count) out[o++] = stack[--sp]
      if (next < 4096) {
        prefix[next] = prev
        suffix[next] = first
        next++
        if (next === 1 << size && size < 12) size++
      }
      prev = code
    }
  }
  return out
}

// Every frame composited onto the canvas, as 0xRRGGBB or null where it's transparent
export function decodeGif(bytes) {
  const sig = String.fromCharCode(...bytes.subarray(0, 3))
  if (sig !== 'GIF') throw new Error('not a GIF')
  const u16 = (p) => bytes[p] | (bytes[p + 1] << 8)
  const width = u16(6)
  const height = u16(8)
  const flags = bytes[10]
  let p = 13
  const table = (n) => {
    const colors = []
    for (let i = 0; i < n; i++, p += 3) colors.push((bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2])
    return colors
  }
  const global = flags & 0x80 ? table(2 << (flags & 7)) : []
  const skipBlocks = () => {
    while (bytes[p] !== 0 && p < bytes.length) p += bytes[p] + 1
    p++
  }
  let canvas = new Array(width * height).fill(null)
  let control = { delay: 0, transparent: -1, disposal: 0 }
  const frames = []
  while (p < bytes.length) {
    const block = bytes[p++]
    if (block === 0x3b) break
    if (block === 0x21) {
      const label = bytes[p++]
      if (label === 0xf9) {
        const packed = bytes[p + 1]
        control = { delay: u16(p + 2), transparent: packed & 1 ? bytes[p + 4] : -1, disposal: (packed >> 2) & 7 }
      }
      skipBlocks()
    } else if (block === 0x2c) {
      const [fx, fy, fw, fh] = [u16(p), u16(p + 2), u16(p + 4), u16(p + 6)]
      const packed = bytes[p + 8]
      p += 9
      const colors = packed & 0x80 ? table(2 << (packed & 7)) : global
      const interlaced = (packed & 0x40) !== 0
      const minSize = bytes[p++]
      const chunks = []
      while (bytes[p] !== 0 && p < bytes.length) {
        chunks.push(bytes.subarray(p + 1, p + 1 + bytes[p]))
        p += bytes[p] + 1
      }
      p++
      const data = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
      let at = 0
      for (const c of chunks) {
        data.set(c, at)
        at += c.length
      }
      const indices = lzw(minSize, data, fw * fh)
      const rowOrder = interlaced ? interlacedRows(fh) : [...Array(fh).keys()]
      const before = control.disposal === 3 ? canvas.slice() : null
      rowOrder.forEach((row, k) => {
        const y = fy + row
        if (y >= height) return
        for (let col = 0; col < fw; col++) {
          const x = fx + col
          const index = indices[k * fw + col]
          if (x < width && index !== control.transparent) canvas[y * width + x] = colors[index] ?? null
        }
      })
      frames.push({ ms: control.delay < 2 ? 100 : control.delay * 10, px: canvas.slice() })
      if (control.disposal === 2) {
        for (let y = fy; y < Math.min(fy + fh, height); y++) for (let x = fx; x < Math.min(fx + fw, width); x++) canvas[y * width + x] = null
      } else if (before) {
        canvas = before
      }
      control = { delay: 0, transparent: -1, disposal: 0 }
    } else {
      break
    }
  }
  return { width, height, frames }
}

// The image row each stored row of an interlaced frame lands on
function interlacedRows(h) {
  const rows = []
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < h; y += step) rows.push(y)
  return rows
}

// The decoded sheets, as sheets[variant][anim], into the shape hooks/frames.js holds:
// cropped to the box every frame fits in, each variant with its own palette letters
export function buildSprite(sheets) {
  const { width: size } = sheets.default.idle
  let minX = Infinity
  let minY = Infinity
  let maxX = -1
  let maxY = -1
  for (const v of VARIANTS) {
    for (const a of ANIMS) {
      for (const { px } of sheets[v][a].frames) {
        px.forEach((c, i) => {
          if (c === null) return
          const x = i % size
          const y = Math.floor(i / size)
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        })
      }
    }
  }
  if (maxX < 0) throw new Error('the sprite is empty')
  const out = { width: maxX - minX + 1, height: maxY - minY + 1, variants: {} }
  for (const v of VARIANTS) {
    const palette = []
    const letter = (c) => {
      if (c === null) return '.'
      let i = palette.indexOf(c)
      if (i < 0) i = palette.push(c) - 1
      if (i >= LETTERS.length) throw new Error(`more than ${LETTERS.length} colors`)
      return LETTERS[i]
    }
    const anims = {}
    for (const a of ANIMS) {
      anims[a] = sheets[v][a].frames.map(({ ms, px }) => {
        const rows = []
        for (let y = minY; y <= maxY; y++) {
          let row = ''
          for (let x = minX; x <= maxX; x++) row += letter(px[y * size + x])
          rows.push(row)
        }
        return { ms, rows }
      })
    }
    out.variants[v] = { palette: palette.map((c) => '#' + c.toString(16).padStart(6, '0')), ...anims }
  }
  return out
}

// A failed GitHub request as a line for the person
function githubError(res) {
  if (res.status === 403 || res.status === 429) return "GitHub's hourly limit for anonymous requests is used up. Try again in a while."
  return 'GitHub answered ' + res.status + '.'
}

async function fetchGif(get, gen, name, file) {
  const res = await get(`${REPO}/gen${gen}/${name}/${file}`, { headers: HEADERS })
  if (!res.ok) return { status: res.status, error: githubError(res) }
  const { content } = JSON.parse(res.text)
  return { gif: decodeGif(fromBase64(content)) }
}

// Every mon folder in a generation
export async function monsOfGen(get, gen) {
  const res = await get(`${REPO}/gen${gen}`, { headers: HEADERS })
  if (!res.ok) throw new Error(githubError(res))
  return JSON.parse(res.text).filter((entry) => entry.type === 'dir').map((entry) => entry.name)
}

// The mon's types from PokéAPI, or normal when it doesn't know the name
async function typesOf(get, name) {
  try {
    const res = await get(`https://pokeapi.co/api/v2/pokemon-form/${name.replace(/_/g, '-')}`)
    if (!res.ok) return ['normal']
    return JSON.parse(res.text).types.map((t) => t.type.name)
  } catch {
    return ['normal']
  }
}

// Fetch a mon's four GIFs, from the generation given or the first that has it, and build
// the entry the store keeps: { gen, sprite, moves }. Throws with a line for the person.
export async function fetchMon(get, name, gen) {
  for (const g of gen ? [gen] : GENS) {
    const firstFile = `${VARIANTS[0]}_${ANIMS[0]}_8fps.gif`
    const first = await fetchGif(get, g, name, firstFile)
    if (first.status === 404) continue
    if (first.error) throw new Error(first.error)
    const rest = await Promise.all(
      VARIANTS.flatMap((v) => ANIMS.map((a) => [v, a])).slice(1).map(([v, a]) => fetchGif(get, g, name, `${v}_${a}_8fps.gif`)),
    )
    const failed = rest.find((r) => r.error)
    if (failed) throw new Error(failed.status === 404 ? `${name} is missing some of its GIFs.` : failed.error)
    const gifs = [first, ...rest].map((r) => r.gif)
    const sheets = { default: { idle: gifs[0], walk: gifs[1] }, shiny: { idle: gifs[2], walk: gifs[3] } }
    return { gen: g, sprite: buildSprite(sheets), moves: movesForTypes(await typesOf(get, name)) }
  }
  throw new Error(`No mon named "${name}" in generations ${(gen ? [gen] : GENS).join(', ')}.`)
}
