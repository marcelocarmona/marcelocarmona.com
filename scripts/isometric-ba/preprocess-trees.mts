/**
 * Street trees (arbolado lineal) + park trees (arbolado en espacios verdes) from
 * BA Data, reduced to position, height and a visual species class.
 *
 * Output: .cache/isometric-ba/trees.pack
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { CACHE_DIR } from './config.mts'
import { lonLatToLocal } from './geo.mts'
import { writePack } from './pack.mts'
import { TREE_KINDS } from './classes.mts'

/** Visual classes, indexed by `kind` in trees.pack. */

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

function kindOf(scientific: string, foliage = ''): number {
  const s = scientific.toLowerCase()
  if (s.startsWith('jacaranda')) return 4
  if (s.startsWith('tipuana')) return 5
  if (s.startsWith('platanus')) return 6
  if (
    s.startsWith('handroanthus') ||
    s.startsWith('tabebuia') ||
    s.startsWith('erythrina') ||
    s.startsWith('ceiba')
  ) {
    return 7
  }
  if (
    foliage === 'Palmera' ||
    /^(washingtonia|phoenix|syagrus|butia|trachycarpus|livistona|arecastrum|archontophoenix|chamaerops)/.test(
      s
    )
  ) {
    return 3
  }
  if (
    foliage.includes('Conífero') ||
    /^(pinus|cupressus|araucaria|cedrus|casuarina|thuja|juniperus|taxodium)/.test(s)
  ) {
    return 2
  }
  if (
    foliage.includes('Perenne') ||
    /^(ficus|ligustrum|magnolia|eucalyptus|schinus|citrus|grevillea|lophostemon|brachychiton|olea|laurus)/.test(
      s
    )
  ) {
    return 1
  }
  return 0
}

const xs: number[] = []
const ys: number[] = []
const hs: number[] = []
const kinds: number[] = []

async function readCsv(file: string, onRow: (cols: string[], idx: Record<string, number>) => void) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })
  let idx: Record<string, number> | null = null
  for await (const line of rl) {
    if (!line) continue
    const cols = parseCsvLine(line)
    if (!idx) {
      idx = Object.fromEntries(cols.map((c, i) => [c.trim(), i]))
      continue
    }
    onRow(cols, idx)
  }
}

function push(lon: number, lat: number, h: number, kind: number) {
  if (
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    lon > -58 ||
    lon < -59 ||
    lat > -34 ||
    lat < -35
  )
    return
  const [x, y] = lonLatToLocal(lon, lat)
  xs.push(x)
  ys.push(y)
  // Missing or absurd heights get a typical street-tree height.
  hs.push(Number.isFinite(h) && h >= 1.5 && h <= 45 ? h : 8)
  kinds.push(kind)
}

await readCsv(path.join(CACHE_DIR, 'arbolado-lineal.csv'), (c, i) => {
  push(
    Number(c[i.long]),
    Number(c[i.lat]),
    Number(c[i.altura_arbol]),
    kindOf(c[i.nombre_cientifico] ?? '')
  )
})
const street = xs.length
await readCsv(path.join(CACHE_DIR, 'arbolado-verdes.csv'), (c, i) => {
  push(
    Number(c[i.long]),
    Number(c[i.lat]),
    Number(c[i.altura_tot]),
    kindOf(c[i.nombre_cie] ?? '', c[i.tipo_folla] ?? '')
  )
})

writePack(path.join(CACHE_DIR, 'trees.pack'), {
  x: Float32Array.from(xs),
  y: Float32Array.from(ys),
  h: Float32Array.from(hs),
  kind: Uint8Array.from(kinds),
})
const counts = TREE_KINDS.map((k, n) => `${k} ${kinds.filter((v) => v === n).length}`)
console.log(`trees: ${street} street + ${xs.length - street} park; ${counts.join(', ')}`)
