/**
 * Isometric tile rasterizer (worker thread).
 *
 * Coordinates:
 *   x, y   local metres (east, north) around ORIGIN
 *   u, v   metres rotated by the street-grid angle (u → NE avenue axis, v → NW)
 *   d, s   d = u − v, s = u + v (screen-aligned ground axes)
 *   X, Y   screen: X = d·a, Y = −s·a/2 − z·b
 *
 * Along any screen ray, a larger z is closer to the camera, so z doubles as the depth key.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import sharp from 'sharp'
import { LINE_CLASSES, POLY_CLASSES, TREE_KINDS } from './classes.mts'
import { lonLatToLocal } from './geo.mts'
import { readPack } from './pack.mts'

type Params = {
  theta: number
  a: number
  b: number
  ss: number
  tile: number
  X0: number
  Y0: number
  nx: number
  ny: number
  maxH: number
  cacheDir: string
  pngDir: string
  fade: { desaturate: number; start: number; end: number }
  dist: { data: Float32Array; x0: number; y0: number; cell: number; w: number; h: number }
  laBoca: number[][]
  obelisco: { x: number; y: number }
}

const P = workerData.params as Params
const SS = P.ss
const A = P.a * SS
const B = P.b * SS
const T = P.tile * SS
const M = 2
const S = T + 2 * M
const SQRT2 = Math.SQRT2
const COS = Math.cos(P.theta)
const SIN = Math.sin(P.theta)

// ---------------------------------------------------------------- colours

const rgb = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16)
  return (255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)
}
const R = (c: number) => c & 255
const G = (c: number) => (c >> 8) & 255
const Bl = (c: number) => (c >> 16) & 255
const pack = (r: number, g: number, b: number): number =>
  ((255 << 24) |
    ((b < 0 ? 0 : b > 255 ? 255 : b) << 16) |
    ((g < 0 ? 0 : g > 255 ? 255 : g) << 8) |
    (r < 0 ? 0 : r > 255 ? 255 : r)) >>>
  0
const shade = (c: number, f: number) => pack((R(c) * f) | 0, (G(c) * f) | 0, (Bl(c) * f) | 0)
const mix = (c1: number, c2: number, t: number) =>
  pack(
    (R(c1) + (R(c2) - R(c1)) * t) | 0,
    (G(c1) + (G(c2) - G(c1)) * t) | 0,
    (Bl(c1) + (Bl(c2) - Bl(c1)) * t) | 0
  )

const hash2 = (x: number, y: number): number => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}
const hash3 = (x: number, y: number, z: number) => hash2(hash2(x, y), z)
const rand = (h: number) => (h & 0xffff) / 0xffff

const LAND = rgb('#d3ccbb')
const SIDEWALK = rgb('#c4beb1')
const CURB = rgb('#b3ad9f')
const MARKING = rgb('#ece6cf')
const MARKING_Y = rgb('#e3c35a')

const POLY_COLOR: Record<string, number> = {
  industrial: rgb('#c9c1b3'),
  park: rgb('#94b46b'),
  cemetery: rgb('#a8b190'),
  forest: rgb('#77a05a'),
  wetland: rgb('#8fa77c'),
  sand: rgb('#e0d1a2'),
  pitch: rgb('#72a85b'),
  track: rgb('#c0704f'),
  plaza: rgb('#d8cfb8'),
  parking: rgb('#a9a69e'),
  aeroway: rgb('#bdbbb2'),
  water: rgb('#6d9fb6'),
  pool: rgb('#7fcbdc'),
  river: rgb('#7f9ea6'),
}
const POLY_COLOR_BY_INDEX = POLY_CLASSES.map((c) => POLY_COLOR[c] ?? LAND)
const POLY_INDEX = Object.fromEntries(POLY_CLASSES.map((c, i) => [c, i])) as Record<string, number>

const LINE_INDEX = Object.fromEntries(LINE_CLASSES.map((c, i) => [c, i])) as Record<string, number>
const ROAD_COLOR: Record<string, number> = {
  motorway: rgb('#6e6e72'),
  trunk: rgb('#737377'),
  primary: rgb('#76767a'),
  secondary: rgb('#7b7b7f'),
  tertiary: rgb('#808084'),
  residential: rgb('#86868a'),
  service: rgb('#8e8e90'),
  runway: rgb('#6a6a6e'),
}
const ROAD_ORDER = [
  'service',
  'residential',
  'tertiary',
  'secondary',
  'primary',
  'trunk',
  'motorway',
].map((c) => LINE_INDEX[c])
const MAJOR = new Set(['primary', 'trunk', 'motorway', 'secondary'].map((c) => LINE_INDEX[c]))
const WATER_LINES = new Set(['stream', 'canal', 'river'].map((c) => LINE_INDEX[c]))
const ROADS = new Set(ROAD_ORDER)

const ROOFS = ['#d6d0c2', '#cdc6b6', '#c2bbac', '#ddd8cb', '#b7b0a2', '#c9c3b9', '#a8a39a'].map(rgb)
const ROOF_TILE = rgb('#b4654a')
const ROOF_TAR = rgb('#8f8b85')
const FACADES = [
  '#e7dec8',
  '#dacdb2',
  '#cbc1ae',
  '#bdb7ab',
  '#ece7dc',
  '#d8c9a8',
  '#c58d6b',
  '#b9b2a6',
  '#e3d2b4',
  '#a9a59d',
].map(rgb)
const WINDOW = rgb('#55606b')
const GLASS = rgb('#7a98aa')
const GLASS_DARK = rgb('#58758a')
const BOCA = ['#c4574a', '#3f7fae', '#dcb64e', '#5b9a64', '#d0844a', '#7b6aa6', '#e4dccb'].map(rgb)
const BOCA_ROOF = [rgb('#9e9a90'), rgb('#b9442f'), rgb('#3f7f9f')]

const TREE_COLOR: Record<string, number> = {
  broadleaf: rgb('#5f8f3e'),
  evergreen: rgb('#4a7a3c'),
  conifer: rgb('#3b6140'),
  palm: rgb('#78a043'),
  jacaranda: rgb('#9474cf'),
  tipa: rgb('#a3b84c'),
  plane: rgb('#6f9b46'),
  pink: rgb('#dd86ad'),
}
const TREE_COLORS = TREE_KINDS.map((k) => TREE_COLOR[k])
const TRUNK = rgb('#6a4f3b')

// Light: from the west/upper-left, high sun.
const L = (() => {
  const v = [-0.55, 0.25, 0.8]
  const n = Math.hypot(v[0], v[1], v[2])
  return v.map((x) => x / n)
})()
const lambert = (nu: number, nv: number, nz: number) => {
  const dot = nu * L[0] + nv * L[1] + nz * L[2]
  return (0.6 + 0.4 * Math.max(0, dot)) / (0.6 + 0.4 * L[2])
}

// ---------------------------------------------------------------- data

const toU = (x: number, y: number) => x * COS + y * SIN
const toV = (x: number, y: number) => -x * SIN + y * COS

function projectPoints(pts: Float32Array) {
  const n = pts.length >> 1
  const D = new Float32Array(n)
  const Sx = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const u = toU(pts[2 * i], pts[2 * i + 1])
    const v = toV(pts[2 * i], pts[2 * i + 1])
    D[i] = u - v
    Sx[i] = u + v
  }
  return { D, S: Sx }
}

const NT = P.nx * P.ny
/** Bins items into tiles by their global max-zoom pixel bbox (CSR layout). */
function binItems(n: number, bbox: (i: number, out: Float64Array) => boolean) {
  const boxes = new Int32Array(n * 4)
  const ok = new Uint8Array(n)
  const tmp = new Float64Array(4)
  const counts = new Uint32Array(NT + 1)
  const pad = 2
  for (let i = 0; i < n; i++) {
    if (!bbox(i, tmp)) continue
    const tx0 = Math.max(0, Math.floor((tmp[0] - pad) / P.tile))
    const ty0 = Math.max(0, Math.floor((tmp[1] - pad) / P.tile))
    const tx1 = Math.min(P.nx - 1, Math.floor((tmp[2] + pad) / P.tile))
    const ty1 = Math.min(P.ny - 1, Math.floor((tmp[3] + pad) / P.tile))
    if (tx0 > tx1 || ty0 > ty1) continue
    ok[i] = 1
    boxes[4 * i] = tx0
    boxes[4 * i + 1] = ty0
    boxes[4 * i + 2] = tx1
    boxes[4 * i + 3] = ty1
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) counts[ty * P.nx + tx + 1]++
  }
  for (let t = 0; t < NT; t++) counts[t + 1] += counts[t]
  const items = new Uint32Array(counts[NT])
  const fill = counts.slice(0, NT)
  for (let i = 0; i < n; i++) {
    if (!ok[i]) continue
    for (let ty = boxes[4 * i + 1]; ty <= boxes[4 * i + 3]; ty++)
      for (let tx = boxes[4 * i]; tx <= boxes[4 * i + 2]; tx++) items[fill[ty * P.nx + tx]++] = i
  }
  return { start: counts, items }
}

const gx = (d: number) => d * P.a - P.X0
const gy = (s: number, z: number) => -s * P.a * 0.5 - z * P.b - P.Y0

// Buildings
const tej = readPack(path.join(P.cacheDir, 'tejido.pack')).arrays as {
  heights: Float32Array
  ringStart: Uint32Array
  ptStart: Uint32Array
  pts: Float32Array
}
const bP = projectPoints(tej.pts)
const nBuildings = tej.heights.length
const bH = new Float32Array(nBuildings)
for (let i = 0; i < nBuildings; i++) bH[i] = Math.min(tej.heights[i], P.maxH)
const buildingBins = binItems(nBuildings, (i, o) => {
  const p0 = tej.ptStart[tej.ringStart[i]]
  const p1 = tej.ptStart[tej.ringStart[i] + 1]
  let dmin = Infinity
  let dmax = -Infinity
  let smin = Infinity
  let smax = -Infinity
  for (let p = p0; p < p1; p++) {
    const d = bP.D[p]
    const s = bP.S[p]
    if (d < dmin) dmin = d
    if (d > dmax) dmax = d
    if (s < smin) smin = s
    if (s > smax) smax = s
  }
  o[0] = gx(dmin)
  o[2] = gx(dmax)
  o[1] = gy(smax, bH[i] + 3)
  o[3] = gy(smin, 0)
  return true
})

// OSM polygons and lines
const osm = readPack(path.join(P.cacheDir, 'osm.pack')).arrays as {
  polyClass: Uint8Array
  polyRingStart: Uint32Array
  ringPtStart: Uint32Array
  polyPts: Float32Array
  lineClass: Uint8Array
  lineWidth: Float32Array
  lineLayer: Uint8Array
  linePtStart: Uint32Array
  linePts: Float32Array
}
const pP = projectPoints(osm.polyPts)
const nPolys = osm.polyClass.length
const polyBins = binItems(nPolys, (i, o) => {
  const p0 = osm.ringPtStart[osm.polyRingStart[i]]
  const p1 = osm.ringPtStart[osm.polyRingStart[i + 1]]
  let dmin = Infinity
  let dmax = -Infinity
  let smin = Infinity
  let smax = -Infinity
  for (let p = p0; p < p1; p++) {
    const d = pP.D[p]
    const s = pP.S[p]
    if (d < dmin) dmin = d
    if (d > dmax) dmax = d
    if (s < smin) smin = s
    if (s > smax) smax = s
  }
  o[0] = gx(dmin)
  o[2] = gx(dmax)
  o[1] = gy(smax, 0)
  o[3] = gy(smin, 0)
  return true
})

const lP = projectPoints(osm.linePts)
const nLines = osm.lineClass.length
const nLinePts = osm.linePts.length >> 1
// Segment i goes from point i to i+1 (valid when i+1 < linePtStart[line+1]).
const segLine = new Int32Array(nLinePts).fill(-1)
const segCum = new Float32Array(nLinePts)
for (let l = 0; l < nLines; l++) {
  let cum = 0
  for (let p = osm.linePtStart[l]; p < osm.linePtStart[l + 1] - 1; p++) {
    segLine[p] = l
    segCum[p] = cum
    cum += Math.hypot(
      osm.linePts[2 * p + 2] - osm.linePts[2 * p],
      osm.linePts[2 * p + 3] - osm.linePts[2 * p + 1]
    )
  }
}
const CYCLE = LINE_INDEX.cycleway
const bridgeZ = (l: number) =>
  osm.lineLayer[l] > 0 ? osm.lineLayer[l] * (osm.lineClass[l] === LINE_INDEX.footway ? 5 : 7) : 0
const lineHalf = (l: number) => {
  const c = LINE_CLASSES[osm.lineClass[l]]
  const w = osm.lineWidth[l]
  return (
    (ROADS.has(osm.lineClass[l]) && osm.lineLayer[l] === 0
      ? w + 3.2
      : c === 'rail'
        ? Math.max(w, 4)
        : w) / 2
  )
}
const segBins = binItems(nLinePts, (p, o) => {
  const l = segLine[p]
  if (l < 0 || osm.lineClass[l] === CYCLE) return false
  const r = lineHalf(l) * SQRT2
  const z = bridgeZ(l)
  o[0] = gx(Math.min(lP.D[p], lP.D[p + 1]) - r)
  o[2] = gx(Math.max(lP.D[p], lP.D[p + 1]) + r)
  o[1] = gy(Math.max(lP.S[p], lP.S[p + 1]) + r, z)
  o[3] = gy(Math.min(lP.S[p], lP.S[p + 1]) - r, 0)
  return true
})

// Trees
const trees = readPack(path.join(P.cacheDir, 'trees.pack')).arrays as {
  x: Float32Array
  y: Float32Array
  h: Float32Array
  kind: Uint8Array
}
const nTrees = trees.x.length
const PALM = TREE_KINDS.indexOf('palm')
const CONIFER = TREE_KINDS.indexOf('conifer')
const treeGeom = new Float32Array(nTrees * 6) // Cd, Cs, r, rz, cz, trunkTop
for (let i = 0; i < nTrees; i++) {
  const u = toU(trees.x[i], trees.y[i])
  const v = toV(trees.x[i], trees.y[i])
  const h = Math.max(3, Math.min(trees.h[i] || 8, 30))
  const k = trees.kind[i]
  const jitter = 0.85 + 0.3 * rand(hash2(i, 7))
  let r: number
  let rz: number
  let cz: number
  let top: number
  if (k === PALM) {
    r = 2.2 * jitter
    rz = 1.1
    cz = Math.max(h, 6)
    top = cz
  } else if (k === CONIFER) {
    r = Math.max(1.3, Math.min(h * 0.2, 3.5)) * jitter
    rz = Math.min(r * 2, h * 0.45)
    cz = h - rz
    top = cz - rz * 0.6
  } else {
    r = Math.max(1.6, Math.min(h * 0.32, 6.5)) * jitter
    rz = r * 0.85
    cz = Math.max(h - rz, rz + 1.2)
    top = cz - rz * 0.4
  }
  treeGeom.set([u - v, u + v, r, rz, cz, top], i * 6)
}
const treeBins = binItems(nTrees, (i, o) => {
  const [Cd, Cs, r, rz, cz] = treeGeom.subarray(i * 6, i * 6 + 5)
  const rr = r * SQRT2
  o[0] = gx(Cd - rr)
  o[2] = gx(Cd + rr)
  o[1] = gy(Cs + rr, cz + rz)
  o[3] = gy(Cs - rr, 0)
  return true
})

// La Boca (bright tin houses)
const bocaRings = P.laBoca.map((r) => {
  const out = new Float32Array(r.length)
  for (let i = 0; i < r.length; i += 2) {
    out[i] = toU(r[i], r[i + 1]) - toV(r[i], r[i + 1])
    out[i + 1] = toU(r[i], r[i + 1]) + toV(r[i], r[i + 1])
  }
  return out
})
const CAMINITO = (() => {
  const [x, y] = lonLatToLocal(-58.36276, -34.63471)
  return [toU(x, y) - toV(x, y), toU(x, y) + toV(x, y)] as const
})()
/** Share of small La Boca houses painted in tin-house colours, densest around Caminito. */
const bocaChance = (d: number, s: number) => {
  // (d, s) are √2-scaled ground axes
  const m = Math.hypot(d - CAMINITO[0], s - CAMINITO[1]) / Math.SQRT2
  return m < 300 ? 0.85 : Math.max(0.12, 0.85 - ((m - 300) / 700) * 0.73)
}
const inRings = (rings: Float32Array[], d: number, s: number) => {
  let inside = false
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const yi = r[i + 1]
      const yj = r[j + 1]
      if (yi > s !== yj > s && d < ((r[j] - r[i]) * (s - yi)) / (yj - yi) + r[i]) inside = !inside
    }
  }
  return inside
}

// ---------------------------------------------------------------- per-tile buffers

const col = new Uint32Array(S * S)
const dep = new Float32Array(S * S)
const ids = new Int32Array(S * S)
const mark = new Uint8Array(S * S)
let OX = 0
let OY = 0
let faceId = 0

const sx = (d: number) => d * A - OX
const sy = (s: number, z: number) => -s * A * 0.5 - z * B - OY
const dAt = (px: number) => (px + 0.5 + OX) / A
const sAt = (py: number, z: number) => (-2 * (py + 0.5 + OY + z * B)) / A

// Scanline polygon fill with an active edge table. Rings come as screen-space x/y arrays.
const EMAX = 1 << 16
let eX = new Float64Array(EMAX)
let eDX = new Float64Array(EMAX)
let eY0 = new Int32Array(EMAX)
let eY1 = new Int32Array(EMAX)
let eOrd = new Int32Array(EMAX)
const active: number[] = []
const xs: number[] = []

function ensureEdges(n: number) {
  if (n <= eX.length) return
  const m = 1 << Math.ceil(Math.log2(n))
  eX = new Float64Array(m)
  eDX = new Float64Array(m)
  eY0 = new Int32Array(m)
  eY1 = new Int32Array(m)
  eOrd = new Int32Array(m)
}

function scanFill(
  X: Float64Array,
  Y: Float64Array,
  ringEnds: number[],
  span: (py: number, x0: number, x1: number) => void
) {
  ensureEdges(X.length)
  let ne = 0
  let start = 0
  for (const end of ringEnds) {
    for (let i = start; i < end; i++) {
      const j = i + 1 < end ? i + 1 : start
      let x1 = X[i]
      let y1 = Y[i]
      let x2 = X[j]
      let y2 = Y[j]
      if (y1 === y2) continue
      if (y1 > y2) {
        ;[x1, x2] = [x2, x1]
        ;[y1, y2] = [y2, y1]
      }
      let r0 = Math.ceil(y1 - 0.5)
      let r1 = Math.ceil(y2 - 0.5) - 1
      if (r1 < 0 || r0 > S - 1) continue
      const dx = (x2 - x1) / (y2 - y1)
      if (r0 < 0) r0 = 0
      if (r1 > S - 1) r1 = S - 1
      if (r0 > r1) continue
      eX[ne] = x1 + (r0 + 0.5 - y1) * dx
      eDX[ne] = dx
      eY0[ne] = r0
      eY1[ne] = r1
      eOrd[ne] = ne
      ne++
    }
    start = end
  }
  if (ne < 2) return
  const ord = eOrd.subarray(0, ne).sort((p, q) => eY0[p] - eY0[q])
  active.length = 0
  let next = 0
  let row = eY0[ord[0]]
  while (next < ne || active.length) {
    if (!active.length) row = Math.max(row, eY0[ord[next]])
    while (next < ne && eY0[ord[next]] <= row) active.push(ord[next++])
    xs.length = 0
    for (let k = active.length - 1; k >= 0; k--) {
      const e = active[k]
      if (eY1[e] < row) {
        active[k] = active[active.length - 1]
        active.pop()
        continue
      }
      xs.push(eX[e] + (row - eY0[e]) * eDX[e])
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      let x0 = Math.ceil(xs[k] - 0.5)
      let x1 = Math.ceil(xs[k + 1] - 0.5) - 1
      if (x0 < 0) x0 = 0
      if (x1 > S - 1) x1 = S - 1
      if (x0 <= x1) span(row, x0, x1)
    }
    row++
    if (row > S - 1) break
  }
}

let bufX = new Float64Array(4096)
let bufY = new Float64Array(4096)
function ensureBuf(n: number) {
  if (n <= bufX.length) return
  bufX = new Float64Array(n * 2)
  bufY = new Float64Array(n * 2)
}

// ---------------------------------------------------------------- ground

function groundColor(cls: number, base: number, px: number, py: number): number {
  const wx = px + OX
  const wy = py + OY
  const name = POLY_CLASSES[cls]
  if (
    name === 'park' ||
    name === 'forest' ||
    name === 'pitch' ||
    name === 'wetland' ||
    name === 'cemetery'
  ) {
    const h = hash2(wx >> 1, wy >> 1)
    let f = 0.95 + 0.1 * rand(h)
    if (name === 'pitch' && (Math.floor((wx + 2 * wy) / (6 * SS)) & 1) === 0) f *= 1.05
    if ((h >>> 20) % 37 === 0) f *= 0.88
    return shade(base, f)
  }
  if (name === 'river' || name === 'water') {
    const h = hash2(wx >> 2, wy >> 1)
    if ((h >>> 16) % 211 === 0) return mix(base, rgb('#e8e6d8'), 0.5)
    return shade(base, 0.98 + 0.04 * rand(h))
  }
  if (name === 'plaza') return shade(base, (((wx >> 2) + (wy >> 1)) & 3) === 0 ? 0.97 : 1)
  return shade(base, 0.985 + 0.03 * rand(hash2(wx >> 1, wy >> 1)))
}

function drawGround(tile: number) {
  const list: number[] = []
  for (let k = polyBins.start[tile]; k < polyBins.start[tile + 1]; k++) list.push(polyBins.items[k])
  list.sort((p, q) => osm.polyClass[p] - osm.polyClass[q] || p - q)
  for (const i of list) {
    const r0 = osm.polyRingStart[i]
    const r1 = osm.polyRingStart[i + 1]
    const p0 = osm.ringPtStart[r0]
    const p1 = osm.ringPtStart[r1]
    ensureBuf(p1 - p0)
    const ends: number[] = []
    for (let r = r0; r < r1; r++) ends.push(osm.ringPtStart[r + 1] - p0)
    for (let p = p0; p < p1; p++) {
      bufX[p - p0] = sx(pP.D[p])
      bufY[p - p0] = sy(pP.S[p], 0)
    }
    const cls = osm.polyClass[i]
    const base = POLY_COLOR_BY_INDEX[cls]
    scanFill(bufX.subarray(0, p1 - p0), bufY.subarray(0, p1 - p0), ends, (py, x0, x1) => {
      const row = py * S
      for (let px = x0; px <= x1; px++) col[row + px] = groundColor(cls, base, px, py)
    })
  }
}

// ---------------------------------------------------------------- capsules (roads, rails, bridges)

/**
 * Pixels of the plane z within half-width hw (metres) of segment p→p+1.
 * Calls fn(i, along, across) with metres along the segment and signed offset.
 */
function capsule(
  p: number,
  hw: number,
  z: number,
  fn: (i: number, along: number, across: number) => void
) {
  const d1 = lP.D[p]
  const s1 = lP.S[p]
  const d2 = lP.D[p + 1]
  const s2 = lP.S[p + 1]
  const Rr = hw * SQRT2
  const ld = d2 - d1
  const ls = s2 - s1
  const len = Math.hypot(ld, ls)
  const ex = len > 1e-9 ? ld / len : 1
  const es = len > 1e-9 ? ls / len : 0
  let pyA = Math.floor(sy(Math.max(s1, s2) + Rr, z) - 0.5)
  let pyB = Math.ceil(sy(Math.min(s1, s2) - Rr, z) - 0.5)
  if (pyA < 0) pyA = 0
  if (pyB > S - 1) pyB = S - 1
  for (let py = pyA; py <= pyB; py++) {
    const s = sAt(py, z)
    let lo = Infinity
    let hi = -Infinity
    for (const [cd, cs] of [
      [d1, s1],
      [d2, s2],
    ]) {
      const ds = s - cs
      if (Math.abs(ds) <= Rr) {
        const h = Math.sqrt(Rr * Rr - ds * ds)
        if (cd - h < lo) lo = cd - h
        if (cd + h > hi) hi = cd + h
      }
    }
    // Strip: along t = ex·(d−d1) + es·(s−s1) ∈ [0,len]; across = −es·(d−d1) + ex·(s−s1) ∈ [−R,R]
    {
      let a0 = -Infinity
      let a1 = Infinity
      const c1 = es * (s - s1)
      if (Math.abs(ex) > 1e-9) {
        const t0 = (0 - c1) / ex + d1
        const t1 = (len - c1) / ex + d1
        a0 = Math.min(t0, t1)
        a1 = Math.max(t0, t1)
      } else if (c1 < 0 || c1 > len) a1 = -Infinity
      const c2 = ex * (s - s1)
      if (Math.abs(es) > 1e-9) {
        const q0 = (c2 - Rr) / es + d1
        const q1 = (c2 + Rr) / es + d1
        a0 = Math.max(a0, Math.min(q0, q1))
        a1 = Math.min(a1, Math.max(q0, q1))
      } else if (Math.abs(c2) > Rr) a1 = -Infinity
      if (a0 <= a1) {
        if (a0 < lo) lo = a0
        if (a1 > hi) hi = a1
      }
    }
    if (lo > hi) continue
    let x0 = Math.ceil(sx(lo) - 0.5)
    let x1 = Math.ceil(sx(hi) - 0.5) - 1
    if (x0 < 0) x0 = 0
    if (x1 > S - 1) x1 = S - 1
    const row = py * S
    for (let px = x0; px <= x1; px++) {
      const dd = dAt(px) - d1
      const ss = s - s1
      fn(row + px, (ex * dd + es * ss) / SQRT2, (-es * dd + ex * ss) / SQRT2)
    }
  }
}

function roadPixel(
  cls: number,
  base: number,
  hw: number,
  cum: number,
  i: number,
  along: number,
  across: number
) {
  const name = LINE_CLASSES[cls]
  const t = cum + along
  const aa = Math.abs(across)
  if (name === 'pedestrian') {
    const h = hash2(Math.floor(t * 2), Math.floor(across * 2))
    return shade(rgb('#cdbfa3'), 0.95 + 0.08 * rand(h))
  }
  if (name === 'footway') return shade(rgb('#d2c5a5'), 0.97 + 0.04 * rand(hash2(i, 3)))
  if (name === 'rail') {
    if (Math.abs(aa - 0.72) < 0.14) return rgb('#5d5c5e')
    if (aa < 1.25 && t % 0.9 < 0.32) return rgb('#6e5a48')
    return shade(rgb('#9a9083'), 0.93 + 0.1 * rand(hash2(i, 5)))
  }
  if (WATER_LINES.has(cls)) return POLY_COLOR.water
  if (name === 'runway') {
    if (aa < 0.5 && t % 60 < 30) return MARKING
    return base
  }
  if (aa > hw - 0.25 && hw > 2.5) return shade(base, 0.9)
  if (MAJOR.has(cls) && hw >= 4) {
    if (aa < 0.22 && (name === 'motorway' || name === 'trunk' ? true : t % 8 < 4.5))
      return name === 'motorway' || name === 'trunk' ? MARKING_Y : MARKING
    if (hw >= 7 && Math.abs(aa - hw / 2) < 0.18 && t % 9 < 3) return MARKING
  }
  return shade(base, 0.98 + 0.03 * rand(hash2(i, 9)))
}

function segsOf(tile: number) {
  const out: number[] = []
  for (let k = segBins.start[tile]; k < segBins.start[tile + 1]; k++) out.push(segBins.items[k])
  return out
}

function drawLines(tile: number) {
  const segs = segsOf(tile)
  const ground = segs.filter((p) => osm.lineLayer[segLine[p]] === 0)
  const paint = (p: number) => {
    const l = segLine[p]
    const cls = osm.lineClass[l]
    const hw = osm.lineWidth[l] / 2
    const base = ROAD_COLOR[LINE_CLASSES[cls]] ?? LAND
    const cum = segCum[p]
    capsule(p, hw, 0, (i, al, ac) => {
      col[i] = roadPixel(cls, base, hw, cum, i, al, ac)
    })
  }
  // 1. water lines, runways, rails, paths
  for (const p of ground) {
    const c = osm.lineClass[segLine[p]]
    if (WATER_LINES.has(c) || c === LINE_INDEX.runway) paint(p)
  }
  for (const p of ground) {
    const c = osm.lineClass[segLine[p]]
    if (c === LINE_INDEX.footway || c === LINE_INDEX.pedestrian) paint(p)
  }
  // 2. sidewalks
  for (const p of ground) {
    const l = segLine[p]
    if (!ROADS.has(osm.lineClass[l]) || osm.lineClass[l] === LINE_INDEX.runway) continue
    const hw = osm.lineWidth[l] / 2 + 1.6
    capsule(p, hw, 0, (i, _al, ac) => {
      col[i] = Math.abs(ac) > hw - 0.3 ? CURB : shade(SIDEWALK, 0.97 + 0.05 * rand(hash2(i, 1)))
    })
  }
  for (const p of ground) if (osm.lineClass[segLine[p]] === LINE_INDEX.rail) paint(p)
  // 3. roads, minor first
  for (const c of ROAD_ORDER) for (const p of ground) if (osm.lineClass[segLine[p]] === c) paint(p)
}

function drawBridges(tile: number) {
  const segs = segsOf(tile).filter((p) => osm.lineLayer[segLine[p]] > 0)
  segs.sort((p, q) => osm.lineLayer[segLine[p]] - osm.lineLayer[segLine[q]])
  const step = 1 / B
  for (const p of segs) {
    const l = segLine[p]
    const cls = osm.lineClass[l]
    const name = LINE_CLASSES[cls]
    const zTop = bridgeZ(l)
    const isRoad = ROADS.has(cls)
    const hw = osm.lineWidth[l] / 2 + (isRoad ? 0.8 : 0.3)
    const thick = name === 'footway' ? 0.8 : 1.4
    const base = ROAD_COLOR[name] ?? LAND
    const id = ++faceId
    const sideId = ++faceId
    const cum = segCum[p]
    for (let z = zTop - thick; z < zTop - step * 0.5; z += step) {
      capsule(p, hw, z, (i, _al, ac) => {
        if (z >= dep[i]) {
          dep[i] = z
          ids[i] = sideId
          col[i] = shade(rgb('#a29e96'), ac < 0 ? 0.92 : 0.78)
        }
      })
    }
    capsule(p, hw, zTop, (i, al, ac) => {
      if (zTop >= dep[i]) {
        dep[i] = zTop
        ids[i] = id
        col[i] =
          Math.abs(ac) > hw - 0.5
            ? rgb('#bdb8ae')
            : roadPixel(cls, base, hw - (isRoad ? 0.8 : 0.3), cum, i, al, ac)
      }
    })
    // Pillars every ~28 m under road bridges
    if (name !== 'footway') {
      const len = Math.hypot(lP.D[p + 1] - lP.D[p], lP.S[p + 1] - lP.S[p]) / SQRT2
      for (let t = (28 - (cum % 28)) % 28; t < len; t += 28) {
        const f = t / len
        const d = lP.D[p] + (lP.D[p + 1] - lP.D[p]) * f
        const s = lP.S[p] + (lP.S[p + 1] - lP.S[p]) * f
        column(d, s, 0, zTop - thick, 0.9, rgb('#9d988f'), ++faceId)
      }
    }
  }
}

/** A thin vertical column (pillars, trunks) centred at (d, s). */
function column(
  d: number,
  s: number,
  z0: number,
  z1: number,
  width: number,
  c: number,
  id: number
) {
  const xc = sx(d)
  const half = Math.max(0.5, (width * A) / 2)
  let x0 = Math.ceil(xc - half - 0.5)
  let x1 = Math.ceil(xc + half - 0.5) - 1
  if (x1 < x0) x1 = x0
  if (x0 < 0) x0 = 0
  if (x1 > S - 1) x1 = S - 1
  const yb = sy(s, z0)
  const yt = sy(s, z1)
  let y0 = Math.ceil(yt - 0.5)
  let y1 = Math.ceil(yb - 0.5) - 1
  if (y0 < 0) y0 = 0
  if (y1 > S - 1) y1 = S - 1
  for (let px = x0; px <= x1; px++) {
    const f = px === x0 && x1 > x0 ? 1.08 : 0.9
    for (let py = y0; py <= y1; py++) {
      const i = py * S + px
      const z = (sy(s, 0) - (py + 0.5)) / B
      if (z >= dep[i]) {
        dep[i] = z
        ids[i] = id
        col[i] = shade(c, f)
      }
    }
  }
}

// ---------------------------------------------------------------- buildings

type Style = {
  roof: number
  facade: number
  window: number
  glass: boolean
  windows: boolean
  bay: number
  floor: number
  phase: number
  corrugated?: boolean
}

/**
 * Extruded prism. Points D/Sv[p0..p1) split into rings by ends (absolute indices).
 * Outer rings CCW, holes CW (in x,y), so a wall is visible when it runs left→right on screen.
 */
function prism(
  Dv: ArrayLike<number>,
  Sv: ArrayLike<number>,
  p0: number,
  ends: number[],
  z0: number,
  z1: number,
  st: Style
) {
  const n = ends[ends.length - 1] - p0
  ensureBuf(n)
  // Roof
  const roofId = ++faceId
  for (let k = 0; k < n; k++) {
    bufX[k] = sx(Dv[p0 + k])
    bufY[k] = sy(Sv[p0 + k], z1)
  }
  const rel = ends.map((e) => e - p0)
  scanFill(bufX.subarray(0, n), bufY.subarray(0, n), rel, (py, x0, x1) => {
    const row = py * S
    for (let px = x0; px <= x1; px++) {
      const i = row + px
      if (z1 >= dep[i]) {
        dep[i] = z1
        ids[i] = roofId
        if (st.corrugated) col[i] = shade(st.roof, ((px + OX + py + OY) >> 1) & 1 ? 1 : 0.9)
        else col[i] = shade(st.roof, 0.97 + 0.05 * rand(hash2((px + OX) >> 1, (py + OY) >> 1)))
      }
    }
  })
  // Walls
  let start = p0
  for (const end of ends) {
    for (let p = start; p < end; p++) {
      const q = p + 1 < end ? p + 1 : start
      const X1 = sx(Dv[p])
      const X2 = sx(Dv[q])
      if (X2 - X1 < 1e-6) continue
      const s1 = Sv[p]
      const s2 = Sv[q]
      const dd = Dv[q] - Dv[p]
      const ds = s2 - s1
      const du = (ds + dd) / 2
      const dv = (ds - dd) / 2
      const len = Math.hypot(du, dv)
      if (len < 1e-6) continue
      const lit = lambert(dv / len, -du / len, 0)
      const fc = shade(st.facade, lit)
      const wc = shade(st.window, lit)
      const fcEdge = shade(st.facade, lit * 0.94)
      const id = ++faceId
      let x0 = Math.ceil(X1 - 0.5)
      let x1 = Math.ceil(X2 - 0.5) - 1
      if (x0 < 0) x0 = 0
      if (x1 > S - 1) x1 = S - 1
      const height = z1 - z0
      for (let px = x0; px <= x1; px++) {
        const t = (px + 0.5 - X1) / (X2 - X1)
        const s = s1 + t * ds
        const e = t * len
        const yg = -s * A * 0.5 - OY
        let y0 = Math.ceil(yg - z1 * B - 0.5)
        let y1 = Math.ceil(yg - z0 * B - 0.5) - 1
        if (y0 < 0) y0 = 0
        if (y1 > S - 1) y1 = S - 1
        if (y0 > y1) continue
        const eb = (e + st.phase) % st.bay
        const bayWin =
          st.windows &&
          e > 0.6 &&
          e < len - 0.6 &&
          (st.glass ? eb > 0.12 : eb > st.bay * 0.28 && eb < st.bay * 0.78)
        for (let py = y0; py <= y1; py++) {
          const i = py * S + px
          const z = (yg - (py + 0.5)) / B
          if (z < dep[i]) continue
          dep[i] = z
          ids[i] = id
          let c = fc
          if (bayWin && z1 - z > 0.7 && height > 4) {
            const zz = z - z0
            const fz = zz % st.floor
            if (st.glass) {
              if (fz > 0.25) c = wc
            } else if (zz < st.floor ? fz > 0.4 && fz < 2.6 : fz > 0.9 && fz < 2.3) c = wc
          } else if (z1 - z < 0.35) c = fcEdge
          col[i] = c
        }
      }
    }
    start = end
  }
}

function buildingStyle(i: number, h: number, cd: number, cs: number, area: number): Style {
  const r = hash2(i, 101)
  const glass = h >= 55 && rand(hash2(i, 17)) < 0.75
  if (
    h < 12 &&
    area < 2500 &&
    bocaRings.length &&
    rand(hash2(i, 29)) < bocaChance(cd, cs) &&
    inRings(bocaRings, cd, cs)
  ) {
    return {
      roof: BOCA_ROOF[r % BOCA_ROOF.length],
      facade: BOCA[(r >>> 8) % BOCA.length],
      window: rgb('#3e4a55'),
      glass: false,
      windows: true,
      bay: 3,
      floor: 3,
      phase: 0,
      corrugated: true,
    }
  }
  let roof = ROOFS[r % ROOFS.length]
  if (h < 9 && rand(hash2(i, 5)) < 0.22) roof = ROOF_TILE
  else if (h > 20 && rand(hash2(i, 6)) < 0.15) roof = ROOF_TAR
  if (glass) {
    return {
      roof: rgb('#a7aaa9'),
      facade: rgb('#8ea6b4'),
      window: (r >>> 4) & 1 ? GLASS : GLASS_DARK,
      glass: true,
      windows: true,
      bay: 1.6,
      floor: 3.6,
      phase: 0,
    }
  }
  return {
    roof,
    facade: FACADES[(r >>> 8) % FACADES.length],
    window: shade(WINDOW, 0.9 + 0.2 * rand(hash2(i, 33))),
    glass: false,
    windows: h >= 5,
    bay: 2.4 + 0.8 * rand(hash2(i, 44)),
    floor: 2.9 + 0.3 * rand(hash2(i, 45)),
    phase: 3 * rand(hash2(i, 46)),
  }
}

const tankD = new Float64Array(4)
const tankS = new Float64Array(4)
function box(cd: number, cs: number, half: number, z0: number, z1: number, st: Style) {
  // Square aligned to the u/v axes, CCW in x,y.
  const corners = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ]
  for (let k = 0; k < 4; k++) {
    const [du, dv] = corners[k]
    tankD[k] = cd + du - dv
    tankS[k] = cs + du + dv
  }
  prism(tankD, tankS, 0, [4], z0, z1, st)
}
const TANK: Style = {
  roof: rgb('#9c978e'),
  facade: rgb('#bab4a8'),
  window: 0,
  glass: false,
  windows: false,
  bay: 1,
  floor: 1,
  phase: 0,
}

function drawBuildings(tile: number) {
  for (let k = buildingBins.start[tile]; k < buildingBins.start[tile + 1]; k++) {
    const i = buildingBins.items[k]
    const h = bH[i]
    const r0 = tej.ringStart[i]
    const r1 = tej.ringStart[i + 1]
    const p0 = tej.ptStart[r0]
    const ends: number[] = []
    for (let r = r0; r < r1; r++) ends.push(tej.ptStart[r + 1])
    // centroid/area of outer ring in d,s (area in d,s units is 2× m²)
    let area = 0
    let cd = 0
    let cs = 0
    const e0 = ends[0]
    for (let p = p0, q = e0 - 1; p < e0; q = p, p++) {
      const cr = bP.D[q] * bP.S[p] - bP.D[p] * bP.S[q]
      area += cr
      cd += (bP.D[q] + bP.D[p]) * cr
      cs += (bP.S[q] + bP.S[p]) * cr
    }
    if (Math.abs(area) > 1e-9) {
      cd /= 3 * area
      cs /= 3 * area
    }
    const m2 = Math.abs(area) / 4
    const st = buildingStyle(i, h, cd, cs, m2)
    prism(bP.D, bP.S, p0, ends, 0, h, st)
    if (h > 12 && m2 > 150 && !st.glass) {
      const rr = hash2(i, 77)
      if (rand(rr) < 0.55 && inPolyDS(bP.D, bP.S, p0, e0, cd, cs)) {
        box(cd, cs, 1.3, h, h + 2.2, TANK)
        if (rand(hash2(i, 78)) < 0.4) box(cd + 3.2, cs + 1, 1.1, h, h + 2.8, TANK)
      }
    }
  }
}

function inPolyDS(
  Dv: ArrayLike<number>,
  Sv: ArrayLike<number>,
  p0: number,
  p1: number,
  d: number,
  s: number
) {
  let inside = false
  for (let i = p0, j = p1 - 1; i < p1; j = i, i++) {
    if (Sv[i] > s !== Sv[j] > s && d < ((Dv[j] - Dv[i]) * (s - Sv[i])) / (Sv[j] - Sv[i]) + Dv[i])
      inside = !inside
  }
  return inside
}

// Landmarks not in the footprint data
const obU = toU(P.obelisco.x, P.obelisco.y)
const obV = toV(P.obelisco.x, P.obelisco.y)
const OBELISCO: Style = { ...TANK, roof: rgb('#f1ede3'), facade: rgb('#ebe6da') }
function drawLandmarks() {
  const cd = obU - obV
  const cs = obU + obV
  const levels = 12
  for (let k = 0; k < levels; k++) {
    const z0 = (63.5 * k) / levels
    const z1 = (63.5 * (k + 1)) / levels
    const half = 3.4 - (1.6 * k) / levels
    box(cd, cs, half, z0, z1, OBELISCO)
  }
  box(cd, cs, 1.4, 63.5, 65.5, OBELISCO)
  box(cd, cs, 0.8, 65.5, 67.5, OBELISCO)
}

// ---------------------------------------------------------------- trees

function drawTrees(tile: number) {
  const k2 = (2 * B) / A
  for (let k = treeBins.start[tile]; k < treeBins.start[tile + 1]; k++) {
    const t = treeBins.items[k]
    const g = t * 6
    const Cd = treeGeom[g]
    const Cs = treeGeom[g + 1]
    const r = treeGeom[g + 2]
    const rz = treeGeom[g + 3]
    const cz = treeGeom[g + 4]
    const top = treeGeom[g + 5]
    const kind = trees.kind[t]
    const base = shade(TREE_COLORS[kind], 0.9 + 0.2 * rand(hash2(t, 11)))
    const id = ++faceId
    column(Cd, Cs, 0, top, kind === PALM ? 0.35 : 0.45, TRUNK, id)
    const al = 1 / (2 * r * r)
    const be = 1 / (rz * rz)
    const a2 = al * k2 * k2 + be
    const rr = r * SQRT2
    let x0 = Math.ceil(sx(Cd - rr) - 0.5)
    let x1 = Math.ceil(sx(Cd + rr) - 0.5) - 1
    let y0 = Math.floor(sy(Cs + rr, cz + rz) - 0.5)
    let y1 = Math.ceil(sy(Cs - rr, cz - rz) - 0.5)
    if (x0 < 0) x0 = 0
    if (x1 > S - 1) x1 = S - 1
    if (y0 < 0) y0 = 0
    if (y1 > S - 1) y1 = S - 1
    for (let py = y0; py <= y1; py++) {
      const s0 = sAt(py, 0)
      const sig = s0 - Cs
      const a1 = -2 * al * sig * k2 - 2 * be * cz
      const c0 = al * sig * sig + be * cz * cz - 1
      for (let px = x0; px <= x1; px++) {
        const dd = dAt(px) - Cd
        const a0 = c0 + al * dd * dd
        const disc = a1 * a1 - 4 * a2 * a0
        if (disc < 0) continue
        const z = (-a1 + Math.sqrt(disc)) / (2 * a2)
        const i = py * S + px
        if (z < 0.3 || z < dep[i]) continue
        const sh = sig - k2 * z
        const du = (sh + dd) / 2
        const dv = (sh - dd) / 2
        const dz = z - cz
        let nu = du / (r * r)
        let nv = dv / (r * r)
        let nz = dz / (rz * rz)
        const nl = Math.hypot(nu, nv, nz)
        nu /= nl
        nv /= nl
        nz /= nl
        let f = 0.55 + 0.6 * Math.max(0, nu * L[0] + nv * L[1] + nz * L[2])
        f = Math.round(f * 6) / 6
        const lh = hash3(
          Math.floor((du + 50) * 1.6),
          Math.floor((dv + 50) * 1.6),
          Math.floor(z * 1.6)
        )
        f *= 0.86 + 0.24 * rand(lh)
        dep[i] = z
        ids[i] = id
        col[i] = shade(base, f)
      }
    }
  }
}

// ---------------------------------------------------------------- post

function outlines() {
  mark.fill(0)
  for (let py = 1; py < S - 1; py++) {
    for (let px = 1; px < S - 1; px++) {
      const i = py * S + px
      const id = ids[i]
      if (!id) continue
      const z = dep[i] - 0.3
      if (
        (ids[i - 1] !== id && dep[i - 1] < z) ||
        (ids[i + 1] !== id && dep[i + 1] < z) ||
        (ids[i - S] !== id && dep[i - S] < z) ||
        (ids[i + S] !== id && dep[i + S] < z)
      )
        mark[i] = 1
    }
  }
  for (let i = 0; i < S * S; i++) if (mark[i]) col[i] = shade(col[i], 0.66)
}

/** Building/tree contact shadows on the ground: darken ground pixels just below (in screen) tall stuff. */
function contactShadows() {
  const reach = Math.round(3 * B)
  for (let px = 0; px < S; px++) {
    let lastZ = 0
    let run = 999
    for (let py = 0; py < S; py++) {
      const i = py * S + px
      if (ids[i] && dep[i] > 0.5) {
        lastZ = dep[i]
        run = 0
        continue
      }
      run++
      if (lastZ > 0 && run <= reach && dep[i] < 0.05) {
        col[i] = shade(col[i], 0.84 + (0.16 * run) / reach)
      }
    }
  }
}

const out = new Uint8Array(P.tile * P.tile * 4)
const dist = P.dist
function distAt(x: number, y: number) {
  const fx = (x - dist.x0) / dist.cell
  const fy = (y - dist.y0) / dist.cell
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  if (ix < 0 || iy < 0 || ix >= dist.w - 1 || iy >= dist.h - 1) return 1e9
  const tx = fx - ix
  const ty = fy - iy
  const k = iy * dist.w + ix
  const a = dist.data[k] + (dist.data[k + 1] - dist.data[k]) * tx
  const b = dist.data[k + dist.w] + (dist.data[k + dist.w + 1] - dist.data[k + dist.w]) * tx
  return a + (b - a) * ty
}

function finish(): boolean {
  let any = false
  const F = P.fade
  const T0 = P.tile
  for (let oy = 0; oy < T0; oy++) {
    for (let ox = 0; ox < T0; ox++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy2 = 0; sy2 < SS; sy2++) {
        for (let sx2 = 0; sx2 < SS; sx2++) {
          const px = ox * SS + sx2 + M
          const py = oy * SS + sy2 + M
          const i = py * S + px
          const z = dep[i]
          const d = dAt(px)
          const s = sAt(py, z)
          const u = (s + d) / 2
          const v = (s - d) / 2
          const dm = distAt(u * COS - v * SIN, u * SIN + v * COS)
          let alpha = 1
          if (dm > F.start) alpha = Math.max(0, 1 - (dm - F.start) / (F.end - F.start))
          if (alpha <= 0) continue
          const c = col[i]
          let cr = R(c)
          let cg = G(c)
          let cb = Bl(c)
          if (dm > 0) {
            const k = Math.min(1, dm / F.desaturate) * 0.75
            const l = 0.3 * cr + 0.59 * cg + 0.11 * cb
            cr += (l - cr) * k
            cg += (l - cg) * k
            cb += (l - cb) * k
          }
          r += cr * alpha
          g += cg * alpha
          b += cb * alpha
          a += alpha
        }
      }
      const o = (oy * T0 + ox) * 4
      if (a > 0) {
        any = true
        out[o] = Math.round(r / a)
        out[o + 1] = Math.round(g / a)
        out[o + 2] = Math.round(b / a)
        out[o + 3] = Math.round((255 * a) / (SS * SS))
      } else {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0
      }
    }
  }
  return any
}

async function renderTile(tx: number, ty: number): Promise<boolean> {
  const tile = ty * P.nx + tx
  OX = P.X0 * SS + tx * T - M
  OY = P.Y0 * SS + ty * T - M
  faceId = 0
  col.fill(LAND)
  dep.fill(0)
  ids.fill(0)
  drawGround(tile)
  drawLines(tile)
  drawBridges(tile)
  drawBuildings(tile)
  drawLandmarks()
  drawTrees(tile)
  contactShadows()
  outlines()
  if (!finish()) return false
  await sharp(out, { raw: { width: P.tile, height: P.tile, channels: 4 } })
    .png({ compressionLevel: 3 })
    .toFile(path.join(P.pngDir, `${tx}_${ty}.png`))
  return true
}

fs.mkdirSync(P.pngDir, { recursive: true })
parentPort!.on('message', async (msg: { tx: number; ty: number } | null) => {
  if (!msg) {
    process.exit(0)
  }
  const ok = await renderTile(msg.tx, msg.ty)
  parentPort!.postMessage({ tx: msg.tx, ty: msg.ty, ok })
})
parentPort!.postMessage({ ready: true })
