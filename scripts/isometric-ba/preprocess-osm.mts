/**
 * Turns the osmium GeoJSON-seq export into compact binary layers (local metres):
 * ground polygons by class, line features by class/width, the river polygon
 * (assembled from natural=coastline), the CABA boundary and its barrios.
 *
 * Input:  .cache/isometric-ba/ba.geojsonseq   (see fetch-data.sh)
 * Output: .cache/isometric-ba/osm.pack, .cache/isometric-ba/osm-extra.json
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { CACHE_DIR, FETCH_BBOX } from './config.mts'
import { lonLatToLocal, ringArea, simplify, pointInRing } from './geo.mts'
import { LINE_CLASSES, POLY_CLASSES, type LineClass, type PolyClass } from './classes.mts'

type Props = Record<string, string | undefined>
type Geometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
type Feature = { properties: Props; geometry: Geometry }

const PAD = 0.01
const inBox = (lon: number, lat: number) =>
  lon > FETCH_BBOX.west - PAD &&
  lon < FETCH_BBOX.east + PAD &&
  lat > FETCH_BBOX.south - PAD &&
  lat < FETCH_BBOX.north + PAD

function polyClass(p: Props): PolyClass | null {
  if (
    p.waterway === 'riverbank' ||
    (p.natural === 'water' && (p.water === 'river' || p.water === 'canal'))
  )
    return 'river'
  if (
    p.natural === 'water' ||
    p.waterway === 'riverbank' ||
    p.landuse === 'reservoir' ||
    p.landuse === 'basin'
  ) {
    return 'water'
  }
  if (p.leisure === 'swimming_pool') return 'pool'
  if (p.aeroway === 'runway' || p.aeroway === 'apron' || p.aeroway === 'taxiway') return 'aeroway'
  if (p.amenity === 'parking' || p.parking === 'surface') return 'parking'
  if (
    p.highway === 'pedestrian' ||
    p['area:highway'] ||
    p.place === 'square' ||
    p.amenity === 'marketplace'
  ) {
    return 'plaza'
  }
  if (p.leisure === 'track') return 'track'
  if (p.leisure === 'pitch' || p.leisure === 'golf_course') return 'pitch'
  if (p.natural === 'beach' || p.natural === 'sand') return 'sand'
  if (p.natural === 'wetland') return 'wetland'
  if (p.natural === 'wood' || p.landuse === 'forest' || p.natural === 'scrub') return 'forest'
  if (p.landuse === 'cemetery' || p.amenity === 'grave_yard') return 'cemetery'
  if (
    p.leisure === 'park' ||
    p.leisure === 'garden' ||
    p.leisure === 'nature_reserve' ||
    p.leisure === 'playground' ||
    p.leisure === 'dog_park' ||
    p.landuse === 'grass' ||
    p.landuse === 'recreation_ground' ||
    p.landuse === 'village_green' ||
    p.landuse === 'meadow' ||
    p.landuse === 'flowerbed' ||
    p.natural === 'grassland'
  ) {
    return 'park'
  }
  if (
    p.landuse === 'industrial' ||
    p.landuse === 'railway' ||
    p.landuse === 'port' ||
    p.landuse === 'brownfield'
  ) {
    return 'industrial'
  }
  return null
}

/** Returns [class, asphalt width in metres] or null. */
function lineClass(p: Props): [LineClass, number] | null {
  if (p.tunnel && p.tunnel !== 'no') return null
  if (p.covered === 'yes' || p.location === 'underground') return null
  const hw = p.highway
  if (hw) {
    if (p.area === 'yes') return null
    switch (hw) {
      case 'motorway':
        return ['motorway', 18]
      case 'trunk':
        return ['trunk', 18]
      case 'primary':
        return ['primary', 17]
      case 'secondary':
        return ['secondary', 13]
      case 'tertiary':
        return ['tertiary', 10]
      case 'motorway_link':
      case 'trunk_link':
      case 'primary_link':
      case 'secondary_link':
      case 'tertiary_link':
        return ['service', 7]
      case 'residential':
      case 'unclassified':
      case 'living_street':
        return ['residential', 7.5]
      case 'service':
        return p.service === 'parking_aisle' || p.service === 'driveway'
          ? ['service', 3.5]
          : ['service', 5]
      case 'pedestrian':
        return ['pedestrian', 6]
      case 'footway':
      case 'path':
      case 'steps':
      case 'track':
      case 'bridleway':
        return ['footway', p.footway === 'sidewalk' ? 2.5 : 2]
      case 'cycleway':
        return ['cycleway', 2.2]
      default:
        return null
    }
  }
  const rw = p.railway
  if (rw === 'rail' || rw === 'light_rail' || rw === 'tram' || rw === 'narrow_gauge') {
    if (p.service === 'yard' || p.service === 'siding' || p.service === 'spur') return ['rail', 3.2]
    return ['rail', 4]
  }
  const ww = p.waterway
  if (ww === 'river') return ['river', 12]
  if (ww === 'canal') return ['canal', 8]
  if (ww === 'stream' || ww === 'drain' || ww === 'ditch') return ['stream', 3]
  if (p.aeroway === 'runway') return ['runway', 40]
  if (p.aeroway === 'taxiway') return ['runway', 18]
  return null
}

const polys: { cls: number; rings: number[][] }[] = []
const lines: { cls: number; width: number; layer: number; pts: number[] }[] = []
const coast: number[][][] = []
let caba: number[][] = []
const adminAreas: { name: string; level: number; rings: number[][] }[] = []
const streetSegments = new Map<string, number[][]>()

function projectRing(coords: number[][], tol: number): number[] {
  const flat: number[] = []
  for (const [lon, lat] of coords) {
    const [x, y] = lonLatToLocal(lon, lat)
    flat.push(x, y)
  }
  if (flat.length > 2 && flat[0] === flat[flat.length - 2] && flat[1] === flat[flat.length - 1])
    flat.length -= 2
  return tol > 0 ? simplify(flat, tol) : flat
}

function anyInBox(coords: number[][]) {
  for (const c of coords) if (inBox(c[0], c[1])) return true
  return false
}

function polygonsOf(g: Geometry): number[][][][] {
  if (g.type === 'Polygon') return [g.coordinates]
  if (g.type === 'MultiPolygon') return g.coordinates
  return []
}

function linesOf(g: Geometry): number[][][] {
  if (g.type === 'LineString') return [g.coordinates]
  if (g.type === 'MultiLineString') return g.coordinates
  return []
}

async function main() {
  const input = path.join(CACHE_DIR, 'ba.geojsonseq')
  const rl = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity })
  for await (const raw of rl) {
    const line = raw.charCodeAt(0) === 0x1e ? raw.slice(1) : raw
    if (!line) continue
    const f = JSON.parse(line) as Feature
    const p = f.properties
    const g = f.geometry

    if (p.natural === 'coastline') {
      for (const l of linesOf(g)) coast.push(l)
      for (const poly of polygonsOf(g)) coast.push(poly[0])
      continue
    }
    if (p.boundary === 'administrative' && (g.type === 'MultiPolygon' || g.type === 'Polygon')) {
      const level = Number(p.admin_level)
      const rings = polygonsOf(g).flatMap((poly) => poly.map((r) => projectRing(r, 2)))
      if (level === 4 && p.name === 'Ciudad Autónoma de Buenos Aires') caba = rings
      else if (level === 9 && p.name) adminAreas.push({ name: p.name, level, rings })
      continue
    }

    const pc = g.type === 'Polygon' || g.type === 'MultiPolygon' ? polyClass(p) : null
    if (pc) {
      for (const poly of polygonsOf(g)) {
        if (!anyInBox(poly[0])) continue
        const rings = poly.map((r) => projectRing(r, 0.5)).filter((r) => r.length >= 6)
        if (!rings.length || Math.abs(ringArea(rings[0])) < 4) continue
        polys.push({ cls: POLY_CLASSES.indexOf(pc), rings })
      }
      continue
    }

    const lc = lineClass(p)
    if (lc && (g.type === 'LineString' || g.type === 'MultiLineString')) {
      const layer = p.bridge && p.bridge !== 'no' ? Math.max(1, Number(p.layer) || 1) : 0
      for (const l of linesOf(g)) {
        if (!anyInBox(l)) continue
        const pts = projectRing(l, 0.4)
        if (pts.length < 4) continue
        lines.push({ cls: LINE_CLASSES.indexOf(lc[0]), width: lc[1], layer, pts })
        if (
          p.highway &&
          p.name &&
          lc[0] !== 'footway' &&
          lc[0] !== 'cycleway' &&
          lc[0] !== 'service'
        ) {
          const list = streetSegments.get(p.name) ?? []
          list.push(pts)
          streetSegments.set(p.name, list)
        }
      }
    }
  }

  const river = buildRiver()
  if (river) polys.push({ cls: POLY_CLASSES.indexOf('river'), rings: river })

  // Paint order follows the class list (later classes paint over earlier ones).
  polys.sort((a, b) => a.cls - b.cls)
  lines.sort((a, b) => a.layer - b.layer || a.cls - b.cls)

  const polyRingStart: number[] = [0]
  const ringPtStart: number[] = [0]
  const polyPts: number[] = []
  for (const poly of polys) {
    for (const r of poly.rings) {
      for (let i = 0; i < r.length; i++) polyPts.push(r[i])
      ringPtStart.push(polyPts.length / 2)
    }
    polyRingStart.push(ringPtStart.length - 1)
  }
  const linePtStart: number[] = [0]
  const linePts: number[] = []
  for (const l of lines) {
    for (let i = 0; i < l.pts.length; i++) linePts.push(l.pts[i])
    linePtStart.push(linePts.length / 2)
  }

  const { writePack } = await import('./pack.mts')
  writePack(path.join(CACHE_DIR, 'osm.pack'), {
    polyClass: Uint8Array.from(polys.map((p) => p.cls)),
    polyRingStart: Uint32Array.from(polyRingStart),
    ringPtStart: Uint32Array.from(ringPtStart),
    polyPts: Float32Array.from(polyPts),
    lineClass: Uint8Array.from(lines.map((l) => l.cls)),
    lineWidth: Float32Array.from(lines.map((l) => l.width)),
    lineLayer: Uint8Array.from(lines.map((l) => l.layer)),
    linePtStart: Uint32Array.from(linePtStart),
    linePts: Float32Array.from(linePts),
  })

  if (!caba.length) throw new Error('CABA boundary not found in OSM export')
  const cabaOuter = caba
    .filter((r) => ringArea(r) !== 0)
    .sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))
  const inCaba = (x: number, y: number) => cabaOuter.some((r) => pointInRing(x, y, r))

  const barrios = adminAreas
    .map((a) => {
      const outer = [...a.rings].sort(
        (r1, r2) => Math.abs(ringArea(r2)) - Math.abs(ringArea(r1))
      )[0]
      const [cx, cy] = labelPoint(outer)
      return { name: a.name, x: cx, y: cy, area: Math.abs(ringArea(outer)), rings: a.rings }
    })
    .filter((b) => inCaba(b.x, b.y))

  const streets: { name: string; x: number; y: number; length: number }[] = []
  for (const [name, segs] of streetSegments) {
    let total = 0
    let best = segs[0]
    let bestLen = -1
    for (const s of segs) {
      let len = 0
      for (let i = 2; i < s.length; i += 2) len += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1])
      total += len
      if (len > bestLen) {
        bestLen = len
        best = s
      }
    }
    const [x, y] = midpoint(best)
    if (!inCaba(x, y) || total < 80) continue
    streets.push({ name, x, y, length: Math.round(total) })
  }

  fs.writeFileSync(
    path.join(CACHE_DIR, 'osm-extra.json'),
    JSON.stringify({
      caba: cabaOuter.map((r) => r.map((v) => Math.round(v * 10) / 10)),
      barrios: barrios.map((b) => ({
        name: b.name,
        x: Math.round(b.x),
        y: Math.round(b.y),
        area: Math.round(b.area),
        rings: b.rings.map((r) => simplify(r, 4).map((v) => Math.round(v))),
      })),
      streets,
    })
  )

  console.log(
    `polys ${polys.length}, lines ${lines.length}, river ${river ? 'ok' : 'missing'}, barrios ${barrios.length}, streets ${streets.length}`
  )
}

/** Chains coastline ways and closes the open shoreline around the NE (river side). */
function buildRiver(): number[][] | null {
  const key = (c: number[]) => `${c[0].toFixed(7)},${c[1].toFixed(7)}`
  let segs: (number[][] | null)[] = coast.map((c) => c.slice())
  let changed = true
  while (changed) {
    changed = false
    const byStart = new Map<string, number>()
    segs.forEach((s, i) => s && byStart.set(key(s[0]), i))
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]
      if (!s) continue
      const endKey = key(s[s.length - 1])
      const j = byStart.get(endKey)
      if (j !== undefined && j !== i && segs[j]) {
        segs[i] = s.concat(segs[j]!.slice(1))
        segs[j] = null
        byStart.delete(endKey)
        changed = true
      }
    }
    segs = segs.filter(Boolean)
  }
  const chains = segs as number[][][]
  const open = chains
    .filter((s) => key(s[0]) !== key(s[s.length - 1]))
    .sort((a, b) => b.length - a.length)[0]
  if (!open) return null
  // Coastline has land on the left, so the river lies to the right of this chain.
  // It runs SE -> NW past the city; close it through the far NE.
  const start = open[0]
  const end = open[open.length - 1]
  const north = Math.max(end[1], start[1]) + 0.3
  const east = Math.max(end[0], start[0]) + 0.3
  const ring = [...open, [end[0], north], [east, north], [east, start[1]]]
  const rings = [projectRing(ring, 1)]
  for (const s of chains) {
    if (s === open || key(s[0]) !== key(s[s.length - 1])) continue
    if (!anyInBox(s)) continue
    rings.push(projectRing(s, 1))
  }
  return rings
}

/** A point well inside a ring: the widest horizontal span through the vertical middle bands. */
function labelPoint(ring: number[]): [number, number] {
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 1; i < ring.length; i += 2) {
    minY = Math.min(minY, ring[i])
    maxY = Math.max(maxY, ring[i])
  }
  let best: [number, number] = [ring[0], ring[1]]
  let bestW = -1
  for (let k = 1; k < 20; k++) {
    const y = minY + ((maxY - minY) * k) / 20
    const xs: number[] = []
    const n = ring.length / 2
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = ring[i * 2 + 1]
      const yj = ring[j * 2 + 1]
      if (yi > y !== yj > y)
        xs.push(ring[i * 2] + ((y - yi) * (ring[j * 2] - ring[i * 2])) / (yj - yi))
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      // Favour central bands so labels don't hug the edges.
      const w = (xs[i + 1] - xs[i]) * (1 - Math.abs(k - 10) / 14)
      if (w > bestW) {
        bestW = w
        best = [(xs[i] + xs[i + 1]) / 2, y]
      }
    }
  }
  return best
}

function midpoint(pts: number[]): [number, number] {
  let total = 0
  for (let i = 2; i < pts.length; i += 2)
    total += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])
  let acc = 0
  for (let i = 2; i < pts.length; i += 2) {
    const d = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])
    if (acc + d >= total / 2) {
      const t = d ? (total / 2 - acc) / d : 0
      return [pts[i - 2] + (pts[i] - pts[i - 2]) * t, pts[i - 1] + (pts[i + 1] - pts[i - 1]) * t]
    }
    acc += d
  }
  return [pts[0], pts[1]]
}

await main()
