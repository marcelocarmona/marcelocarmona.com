import fs from 'node:fs'

type Typed = Float32Array | Float64Array | Uint32Array | Int32Array | Uint16Array | Uint8Array

const CTORS = { Float32Array, Float64Array, Uint32Array, Int32Array, Uint16Array, Uint8Array }
type CtorName = keyof typeof CTORS

/** Writes named typed arrays into one binary file with a JSON header. */
export function writePack(
  file: string,
  arrays: Record<string, Typed>,
  meta: Record<string, unknown> = {}
) {
  const entries: { name: string; type: CtorName; offset: number; length: number }[] = []
  let offset = 0
  for (const [name, arr] of Object.entries(arrays)) {
    offset = Math.ceil(offset / 8) * 8
    entries.push({ name, type: arr.constructor.name as CtorName, offset, length: arr.length })
    offset += arr.byteLength
  }
  const header = Buffer.from(JSON.stringify({ entries, meta }))
  const headerLen = Math.ceil((header.length + 4) / 8) * 8
  const out = Buffer.alloc(headerLen + offset)
  out.writeUInt32LE(header.length, 0)
  header.copy(out, 4)
  for (const e of entries) {
    const arr = arrays[e.name]
    Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).copy(out, headerLen + e.offset)
  }
  fs.writeFileSync(file, out)
}

export type Pack = { arrays: Record<string, Typed>; meta: Record<string, unknown> }

/** Reads a pack, optionally into a SharedArrayBuffer so workers can share it. */
export function readPack(file: string, shared = false): Pack {
  const buf = fs.readFileSync(file)
  const headerLen0 = buf.readUInt32LE(0)
  const { entries, meta } = JSON.parse(buf.subarray(4, 4 + headerLen0).toString()) as {
    entries: { name: string; type: CtorName; offset: number; length: number }[]
    meta: Record<string, unknown>
  }
  const headerLen = Math.ceil((headerLen0 + 4) / 8) * 8
  const body = shared
    ? new SharedArrayBuffer(buf.length - headerLen)
    : new ArrayBuffer(buf.length - headerLen)
  new Uint8Array(body).set(buf.subarray(headerLen))
  const arrays: Record<string, Typed> = {}
  for (const e of entries)
    arrays[e.name] = new CTORS[e.type](body as unknown as ArrayBuffer, e.offset, e.length)
  return { arrays, meta }
}

/** Rebuilds typed-array views over an already shared buffer (for workers). */
export function packFromShared(
  body: SharedArrayBuffer,
  layout: { name: string; type: CtorName; offset: number; length: number }[]
) {
  const arrays: Record<string, Typed> = {}
  for (const e of layout)
    arrays[e.name] = new CTORS[e.type](body as unknown as ArrayBuffer, e.offset, e.length)
  return arrays
}
