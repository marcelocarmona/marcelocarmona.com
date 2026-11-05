/**
 * Renders the isometric Buenos Aires map into tiles.
 *
 *   node scripts/isometric-ba/render.mts                       full render + pyramid + meta
 *   node scripts/isometric-ba/render.mts --center=-58.3816,-34.6037 --radius=2 --preview=obelisco
 *   node scripts/isometric-ba/render.mts --pyramid             rebuild pyramid/meta from existing PNGs
 *   --quality=70                                               WebP quality (default 80; npm script uses 70)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import sharp, { type OverlayOptions } from 'sharp'
import {
  CACHE_DIR,
  FADE,
  GRID_ANGLE_DEG,
  HEIGHT_SCALE,
  MAX_BUILDING_H,
  OUT_DIR,
  PNG_DIR,
  PX_PER_M,
  SUPERSAMPLE,
  TILE_DIR,
  TILE_SIZE,
} from './config.mts'
import { lonLatToLocal } from './geo.mts'
import { LANDMARKS } from './landmarks.mts'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? 'true']
  })
) as Record<string, string>

type Extra = {
  caba: number[][]
  barrios: { name: string; x: number; y: number; area: number; rings: number[][] }[]
  streets: { name: string; x: number; y: number; length: number }[]
}

const extra = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'osm-extra.json'), 'utf8')) as Extra

const theta = (GRID_ANGLE_DEG * Math.PI) / 180
const COS = Math.cos(theta)
const SIN = Math.sin(theta)
const a = PX_PER_M
const b = Math.sqrt(1.5) * a * HEIGHT_SCALE
const toDS = (x: number, y: number) => {
  const u = x * COS + y * SIN
  const v = -x * SIN + y * COS
  return [u - v, u + v] as const
}

// Extent: city boundary plus the fade margin.
const margin = (FADE.end + 50) * Math.SQRT2
let dmin = Infinity
let dmax = -Infinity
let smin = Infinity
let smax = -Infinity
let xmin = Infinity
let xmax = -Infinity
let ymin = Infinity
let ymax = -Infinity
for (const ring of extra.caba) {
  for (let i = 0; i < ring.length; i += 2) {
    const [d, s] = toDS(ring[i], ring[i + 1])
    dmin = Math.min(dmin, d)
    dmax = Math.max(dmax, d)
    smin = Math.min(smin, s)
    smax = Math.max(smax, s)
    xmin = Math.min(xmin, ring[i])
    xmax = Math.max(xmax, ring[i])
    ymin = Math.min(ymin, ring[i + 1])
    ymax = Math.max(ymax, ring[i + 1])
  }
}
const X0 = Math.floor((dmin - margin) * a)
const Y0 = Math.floor(-(smax + margin) * a * 0.5 - MAX_BUILDING_H * b)
const width = Math.ceil((dmax + margin) * a) - X0
const height = Math.ceil(-(smin - margin) * a * 0.5) - Y0
const nx = Math.ceil(width / TILE_SIZE)
const ny = Math.ceil(height / TILE_SIZE)
const maxZoom = Math.ceil(Math.log2(Math.max(nx, ny)))

/** World (local metres, height) → global max-zoom pixel. */
const toPx = (x: number, y: number, z = 0) => {
  const [d, s] = toDS(x, y)
  return [d * a - X0, -s * a * 0.5 - z * b - Y0] as const
}

// Distance (m) from the CABA boundary, 0 inside.
function distanceGrid() {
  const cell = 20
  const pad = FADE.end + 600
  const x0 = Math.floor(xmin - pad)
  const y0 = Math.floor(ymin - pad)
  const w = Math.ceil((xmax + pad - x0) / cell) + 1
  const h = Math.ceil((ymax + pad - y0) / cell) + 1
  const data = new Float32Array(w * h).fill(1e9)
  for (let j = 0; j < h; j++) {
    const y = y0 + j * cell
    const xs: number[] = []
    for (const r of extra.caba) {
      for (let i = 0, k = r.length - 2; i < r.length; k = i, i += 2) {
        const ya = r[i + 1]
        const yb = r[k + 1]
        if (ya > y !== yb > y) xs.push(r[i] + ((y - ya) * (r[k] - r[i])) / (yb - ya))
      }
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / cell))
      const i1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / cell))
      for (let i = i0; i <= i1; i++) data[j * w + i] = 0
    }
  }
  const dg = cell * Math.SQRT2
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i
      let v = data[k]
      if (i > 0) v = Math.min(v, data[k - 1] + cell)
      if (j > 0) {
        v = Math.min(v, data[k - w] + cell)
        if (i > 0) v = Math.min(v, data[k - w - 1] + dg)
        if (i < w - 1) v = Math.min(v, data[k - w + 1] + dg)
      }
      data[k] = v
    }
  for (let j = h - 1; j >= 0; j--)
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i
      let v = data[k]
      if (i < w - 1) v = Math.min(v, data[k + 1] + cell)
      if (j < h - 1) {
        v = Math.min(v, data[k + w] + cell)
        if (i < w - 1) v = Math.min(v, data[k + w + 1] + dg)
        if (i > 0) v = Math.min(v, data[k + w - 1] + dg)
      }
      data[k] = v
    }
  return { data, x0, y0, cell, w, h }
}

async function renderTiles(list: [number, number][]) {
  const dist = distanceGrid()
  const laBoca = extra.barrios.find((r) => r.name === 'La Boca')?.rings ?? []
  const [ox, oy] = lonLatToLocal(-58.38159, -34.60374)
  const params = {
    theta,
    a,
    b,
    ss: SUPERSAMPLE,
    tile: TILE_SIZE,
    X0,
    Y0,
    nx,
    ny,
    maxH: MAX_BUILDING_H,
    cacheDir: CACHE_DIR,
    pngDir: PNG_DIR,
    fade: FADE,
    dist,
    laBoca,
    obelisco: { x: ox, y: oy },
  }
  const n = Math.min(Number(args.workers) || os.availableParallelism(), list.length)
  const queue = list.slice()
  let done = 0
  let written = 0
  const started = Date.now()
  await Promise.all(
    Array.from(
      { length: n },
      () =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL('./render-worker.mts', import.meta.url), {
            workerData: { params },
          })
          const next = () => {
            const job = queue.shift()
            w.postMessage(job ? { tx: job[0], ty: job[1] } : null)
          }
          w.on('message', (m: { ready?: boolean; ok?: boolean }) => {
            if (!m.ready) {
              done++
              if (m.ok) written++
              if (done % 25 === 0 || done === list.length) {
                const el = (Date.now() - started) / 1000
                process.stdout.write(
                  `\r  ${done}/${list.length} tiles (${written} non-empty) ${el.toFixed(0)}s, eta ${((el / done) * (list.length - done)).toFixed(0)}s   `
                )
              }
            }
            next()
          })
          w.on('error', reject)
          w.on('exit', () => resolve())
        })
    )
  )
  process.stdout.write('\n')
}

async function preview(list: [number, number][], name: string) {
  const txs = list.map((t) => t[0])
  const tys = list.map((t) => t[1])
  const tx0 = Math.min(...txs)
  const ty0 = Math.min(...tys)
  const w = (Math.max(...txs) - tx0 + 1) * TILE_SIZE
  const h = (Math.max(...tys) - ty0 + 1) * TILE_SIZE
  const comps = list
    .map(([tx, ty]) => ({ tx, ty, file: path.join(PNG_DIR, `${tx}_${ty}.png`) }))
    .filter((t) => fs.existsSync(t.file))
    .map((t) => ({ input: t.file, left: (t.tx - tx0) * TILE_SIZE, top: (t.ty - ty0) * TILE_SIZE }))
  const file = path.join(CACHE_DIR, `preview-${name}.png`)
  await sharp({ create: { width: w, height: h, channels: 4, background: '#0d1220' } })
    .composite(comps)
    .png()
    .toFile(file)
  console.log(`preview → ${file}`)
}

async function pyramid() {
  fs.rmSync(TILE_DIR, { recursive: true, force: true })
  const quality = Number(args.quality) || 80
  const have: Record<number, Set<string>> = {}
  have[maxZoom] = new Set()
  // Max zoom: convert PNG → WebP
  const pngs = fs.readdirSync(PNG_DIR).filter((f) => f.endsWith('.png'))
  let bytes = 0
  const conv = async (f: string) => {
    const [tx, ty] = f.replace('.png', '').split('_').map(Number)
    if (tx >= nx || ty >= ny) return
    const dir = path.join(TILE_DIR, String(maxZoom), String(tx))
    fs.mkdirSync(dir, { recursive: true })
    const out = path.join(dir, `${ty}.webp`)
    const info = await sharp(path.join(PNG_DIR, f))
      .webp({ quality, alphaQuality: 70, effort: 5 })
      .toFile(out)
    bytes += info.size
    have[maxZoom].add(`${tx}_${ty}`)
  }
  await pool(pngs, conv, os.availableParallelism())
  console.log(`  z${maxZoom}: ${have[maxZoom].size} tiles, ${(bytes / 1e6).toFixed(1)} MB`)
  // Lower zooms: each tile is the 2×2 children scaled 50%. Keep a raw RGBA cache of the previous level.
  let prevRaw = new Map<string, Buffer>()
  for (const f of pngs) {
    const k = f.replace('.png', '')
    if (have[maxZoom].has(k))
      prevRaw.set(k, await sharp(path.join(PNG_DIR, f)).ensureAlpha().raw().toBuffer())
  }
  for (let z = maxZoom - 1; z >= 0; z--) {
    const keys = new Set<string>()
    for (const k of prevRaw.keys()) {
      const [x, y] = k.split('_').map(Number)
      keys.add(`${x >> 1}_${y >> 1}`)
    }
    const raw = new Map<string, Buffer>()
    let zb = 0
    await pool(
      [...keys],
      async (k) => {
        const [x, y] = k.split('_').map(Number)
        const comps: OverlayOptions[] = []
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const c = prevRaw.get(`${2 * x + dx}_${2 * y + dy}`)
            if (c)
              comps.push({
                input: c,
                raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 4 },
                left: dx * TILE_SIZE,
                top: dy * TILE_SIZE,
              })
          }
        const big = await sharp({
          create: {
            width: 2 * TILE_SIZE,
            height: 2 * TILE_SIZE,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite(comps)
          .raw()
          .toBuffer()
        const small = await sharp(big, {
          raw: { width: 2 * TILE_SIZE, height: 2 * TILE_SIZE, channels: 4 },
        })
          .resize(TILE_SIZE, TILE_SIZE, { kernel: 'lanczos3' })
          .raw()
          .toBuffer()
        raw.set(k, small)
        const dir = path.join(TILE_DIR, String(z), String(x))
        fs.mkdirSync(dir, { recursive: true })
        const info = await sharp(small, {
          raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 4 },
        })
          .webp({ quality, alphaQuality: 70, effort: 5 })
          .toFile(path.join(dir, `${y}.webp`))
        zb += info.size
      },
      os.availableParallelism()
    )
    have[z] = new Set(raw.keys())
    bytes += zb
    console.log(`  z${z}: ${raw.size} tiles, ${(zb / 1e6).toFixed(1)} MB`)
    prevRaw = raw
  }
  console.log(`total ${(bytes / 1e6).toFixed(1)} MB`)
  return have
}

async function pool<T>(items: T[], fn: (t: T) => Promise<void>, n: number) {
  let i = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++])
    })
  )
}

function writeMeta(have: Record<number, Set<string>>) {
  const r = (n: number) => Math.round(n)
  const [obx, oby] = lonLatToLocal(-58.38159, -34.60374)
  const [cx, cy] = toPx(obx, oby, 30)
  const meta = {
    tileSize: TILE_SIZE,
    maxZoom,
    width: nx * TILE_SIZE,
    height: ny * TILE_SIZE,
    initial: { x: r(cx), y: r(cy), zoom: maxZoom - 1 },
    tiles: Object.fromEntries(
      Object.entries(have).map(([z, set]) => {
        // Encode as { "x": [y, y, ...] } to keep meta small.
        const cols: Record<string, number[]> = {}
        for (const k of set) {
          const [x, y] = k.split('_')
          ;(cols[x] ??= []).push(Number(y))
        }
        for (const c of Object.values(cols)) c.sort((p, q) => p - q)
        return [z, cols]
      })
    ),
    projection: { gridAngle: GRID_ANGLE_DEG, pxPerM: a, heightScale: HEIGHT_SCALE, X0, Y0 },
  }
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta))

  const places: {
    name: string
    kind: 'barrio' | 'street' | 'landmark'
    x: number
    y: number
    desc?: string
    len?: number
  }[] = []
  for (const bz of extra.barrios) {
    const [x, y] = toPx(bz.x, bz.y)
    places.push({ name: bz.name, kind: 'barrio', x: r(x), y: r(y) })
  }
  for (const l of LANDMARKS) {
    const [lx, ly] = lonLatToLocal(l.lon, l.lat)
    const [x, y] = toPx(lx, ly, l.labelZ ?? 0)
    places.push({ name: l.name, kind: 'landmark', x: r(x), y: r(y), desc: l.desc })
  }
  const streets = new Map<string, { name: string; x: number; y: number; length: number }>()
  for (const st of extra.streets) {
    const prev = streets.get(st.name)
    if (!prev || st.length > prev.length) streets.set(st.name, st)
  }
  for (const st of streets.values()) {
    const [x, y] = toPx(st.x, st.y)
    places.push({ name: st.name, kind: 'street', x: r(x), y: r(y), len: Math.round(st.length) })
  }
  fs.writeFileSync(path.join(OUT_DIR, 'places.json'), JSON.stringify(places))
  console.log(`meta.json + places.json (${places.length} places)`)
}

async function main() {
  console.log(`grid ${nx}×${ny} tiles (${nx * TILE_SIZE}×${ny * TILE_SIZE}px), maxZoom ${maxZoom}`)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  if (args.center) {
    const [lon, lat] = args.center.split(',').map(Number)
    const [x, y] = lonLatToLocal(lon, lat)
    const [px, py] = toPx(x, y, 15)
    const ctx = Math.floor(px / TILE_SIZE)
    const cty = Math.floor(py / TILE_SIZE)
    const rad = Number(args.radius ?? 1)
    const list: [number, number][] = []
    for (let ty = cty - rad; ty <= cty + rad; ty++)
      for (let tx = ctx - rad; tx <= ctx + rad; tx++)
        if (tx >= 0 && ty >= 0 && tx < nx && ty < ny) list.push([tx, ty])
    await renderTiles(list)
    await preview(list, args.preview ?? 'test')
    return
  }
  if (!args.pyramid) {
    fs.rmSync(PNG_DIR, { recursive: true, force: true })
    const list: [number, number][] = []
    for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) list.push([tx, ty])
    await renderTiles(list)
  }
  const have = await pyramid()
  writeMeta(have)
}

await main()
