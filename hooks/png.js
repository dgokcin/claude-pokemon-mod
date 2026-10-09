// Encodes RGBA pixels as a PNG, base64. The runtime has no compression API, so this
// carries its own deflate: LZ77 matches over fixed Huffman codes, which shrinks a
// sprite frame's long runs and repeated rows to a few KB.

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

function crc32(bytes, start, end) {
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// The sums take their remainder once per block, short enough that b can't pass 2^31
function adler32(bytes) {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; ) {
    const end = Math.min(bytes.length, i + 2048)
    for (; i < end; i++) {
      a += bytes[i]
      b += a
    }
    a %= 65521
    b %= 65521
  }
  return ((b << 16) | a) >>> 0
}

// Deflate's length and distance codes: the base value each starts at and its extra bits
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

const WINDOW = 32768
const MAX_MATCH = 258
const MAX_CHAIN = 32

// Match tables shared by every call. Only head needs clearing, since a call reads prev
// only at positions it has inserted.
const HEAD = new Int32Array(65536)
const PREV = new Int32Array(WINDOW)

class Bits {
  constructor(size) {
    this.out = new Uint8Array(size)
    this.pos = 0
    this.acc = 0
    this.count = 0
  }

  // Extra bits and headers go least significant bit first
  put(value, count) {
    this.acc |= value << this.count
    this.count += count
    while (this.count >= 8) {
      this.push(this.acc & 255)
      this.acc >>>= 8
      this.count -= 8
    }
  }

  // Huffman codes go most significant bit first
  code(value, count) {
    let reversed = 0
    for (let k = 0; k < count; k++) reversed |= ((value >> k) & 1) << (count - 1 - k)
    this.put(reversed, count)
  }

  push(byte) {
    if (this.pos === this.out.length) {
      const grown = new Uint8Array(this.out.length * 2)
      grown.set(this.out)
      this.out = grown
    }
    this.out[this.pos++] = byte
  }

  finish() {
    if (this.count > 0) this.push(this.acc & 255)
    return this.out.subarray(0, this.pos)
  }
}

function literal(bits, value) {
  if (value < 144) bits.code(0x30 + value, 8)
  else if (value < 256) bits.code(0x190 + value - 144, 9)
  else if (value < 280) bits.code(value - 256, 7)
  else bits.code(0xc0 + value - 280, 8)
}

function match(bits, length, distance) {
  let l = 0
  while (l < 28 && LENGTH_BASE[l + 1] <= length) l++
  literal(bits, 257 + l)
  bits.put(length - LENGTH_BASE[l], LENGTH_EXTRA[l])
  let d = 0
  while (d < 29 && DIST_BASE[d + 1] <= distance) d++
  bits.code(d, 5)
  bits.put(distance - DIST_BASE[d], DIST_EXTRA[d])
}

// zlib stream of one fixed Huffman block
function deflate(data) {
  const bits = new Bits(1024 + (data.length >> 2))
  bits.push(0x78)
  bits.push(0x01)
  bits.put(1, 1)
  bits.put(1, 2)
  const head = HEAD.fill(-1)
  const prev = PREV
  const hash = (i) => ((data[i] << 16) ^ (data[i + 1] << 8) ^ data[i + 2]) * 2654435761 >>> 16
  const insert = (i) => {
    if (i + 2 >= data.length) return
    const h = hash(i)
    prev[i % WINDOW] = head[h]
    head[h] = i
  }
  let i = 0
  while (i < data.length) {
    let bestLength = 0
    let bestDistance = 0
    if (i + 2 < data.length) {
      const limit = Math.min(MAX_MATCH, data.length - i)
      let candidate = head[hash(i)]
      for (let chain = 0; candidate >= 0 && i - candidate <= WINDOW && chain < MAX_CHAIN; chain++) {
        let length = 0
        while (length < limit && data[candidate + length] === data[i + length]) length++
        if (length > bestLength) {
          bestLength = length
          bestDistance = i - candidate
          if (length === limit) break
        }
        candidate = prev[candidate % WINDOW]
      }
    }
    if (bestLength >= 3) {
      match(bits, bestLength, bestDistance)
      for (let k = 0; k < bestLength; k++) insert(i + k)
      i += bestLength
    } else {
      literal(bits, data[i])
      insert(i)
      i++
    }
  }
  literal(bits, 256)
  const body = bits.finish()
  const sum = adler32(data)
  const out = new Uint8Array(body.length + 4)
  out.set(body)
  out.set([sum >>> 24, (sum >>> 16) & 255, (sum >>> 8) & 255, sum & 255], body.length)
  return out
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let k = 0; k < 4; k++) out[4 + k] = type.charCodeAt(k)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

// A frame of up to 256 colors goes out as palette indices, a quarter of its RGBA bytes
export function encodePng(width, height, rgba) {
  const colors = new Map()
  const indices = new Uint8Array(width * height)
  const words = new Uint32Array(rgba.buffer, rgba.byteOffset, width * height)
  let paletted = true
  // A run of one color looks it up once
  let lastWord = -1
  let index = 0
  for (let p = 0; p < words.length; p++) {
    const word = rgba[p * 4 + 3] === 0 ? 0 : words[p]
    if (word === lastWord) {
      indices[p] = index
      continue
    }
    lastWord = word
    index = colors.get(word)
    if (index === undefined) {
      if (colors.size === 256) {
        paletted = false
        break
      }
      index = colors.size
      colors.set(word, index)
    }
    indices[p] = index
  }
  const channels = paletted ? 1 : 4
  const pixels = paletted ? indices : rgba
  const stride = width * channels
  // Each row is filtered against the one above, so a repeated row is all zeros
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1)
    raw[row] = 2
    for (let x = 0; x < stride; x++) {
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0
      raw[row + 1 + x] = (pixels[y * stride + x] - above) & 255
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, paletted ? 3 : 6, 0, 0, 0], 8)
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header)]
  if (paletted) {
    const palette = new Uint8Array(colors.size * 3)
    const alpha = new Uint8Array(colors.size)
    for (const [word, index] of colors) {
      const bytes = new Uint8Array(new Uint32Array([word]).buffer)
      palette.set(bytes.subarray(0, 3), index * 3)
      alpha[index] = bytes[3]
    }
    parts.push(chunk('PLTE', palette), chunk('tRNS', alpha))
  }
  parts.push(chunk('IDAT', deflate(raw)), chunk('IEND', new Uint8Array(0)))
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out.toBase64()
}
