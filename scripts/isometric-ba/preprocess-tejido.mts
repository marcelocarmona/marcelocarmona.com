/**
 * Streams the Buenos Aires "tejido urbano" GeoJSON (one feature per line)
 * into a compact binary pack of building volumes in local metres.
 *
 *   node scripts/isometric-ba/preprocess-tejido.mts
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

import { CACHE_DIR } from './config.mts'
import { lonLatToLocal, ringArea, simplify } from './geo.mts'
import { writePack } from './pack.mts'

const SRC = path.join(CACHE_DIR, 'tejido.geojson')
const OUT = path.join(CACHE_DIR, 'tejido.pack')

type Feature = {
  properties: { altura: number | null; smp?: string }
  geometry: { type: 'MultiPolygon' | 'Polygon'; coordinates: number[][][][] | number[][][] } | null
}

const heights: number[] = []
const ringStart: number[] = [0]
const ptStart: number[] = [0]
const pts: number[] = []
const angleHist = new Float64Array(900)

let parsed = 0
let skipped = 0
let truncated = false

const rl = readline.createInterface({ input: fs.createReadStream(SRC), crlfDelay: Infinity })
for await (const raw of rl) {
  if (!raw.startsWith('{ "type": "Feature"')) continue
  const line = raw.endsWith(',') ? raw.slice(0, -1) : raw
  let f: Feature
  try {
    f = JSON.parse(line) as Feature
  } catch {
    truncated = true
    break
  }
  const g = f.geometry
  if (!g) {
    skipped++
    continue
  }
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][]
  let rings = 0
  for (const poly of polys) {
    poly.forEach((ring, ri) => {
      const flat: number[] = []
      for (const [lon, lat] of ring) {
        const [x, y] = lonLatToLocal(lon, lat)
        flat.push(x, y)
      }
      // drop closing duplicate
      if (
        flat.length >= 4 &&
        flat[0] === flat[flat.length - 2] &&
        flat[1] === flat[flat.length - 1]
      )
        flat.length -= 2
      let s = simplify(flat, 0.2)
      if (s.length < 6) return
      const area = ringArea(s)
      if (Math.abs(area) < 1) return
      // outer rings counter-clockwise, holes clockwise
      if ((ri === 0) !== area > 0) {
        const rev: number[] = []
        for (let i = s.length - 2; i >= 0; i -= 2) rev.push(s[i], s[i + 1])
        s = rev
      }
      for (let i = 0; i < s.length; i += 2) {
        const j = (i + 2) % s.length
        const dx = s[j] - s[i]
        const dy = s[j + 1] - s[i + 1]
        const len = Math.hypot(dx, dy)
        if (len < 2) continue
        let a = (Math.atan2(dy, dx) * 180) / Math.PI
        a = ((a % 90) + 90) % 90
        angleHist[Math.floor(a * 10) % 900] += len
      }
      for (const v of s) pts.push(v)
      ptStart.push(pts.length / 2)
      rings++
    })
  }
  if (!rings) {
    skipped++
    continue
  }
  heights.push(Math.max(2.5, f.properties.altura ?? 3))
  ringStart.push(ptStart.length - 1)
  parsed++
  if (parsed % 200_000 === 0) console.log(`  ${parsed} buildings…`)
}

// dominant grid angle (smoothed over ±1°)
let best = 0
let bestScore = -1
for (let i = 0; i < 900; i++) {
  let s = 0
  for (let k = -10; k <= 10; k++) s += angleHist[(i + k + 900) % 900]
  if (s > bestScore) {
    bestScore = s
    best = i
  }
}

writePack(
  OUT,
  {
    heights: Float32Array.from(heights),
    ringStart: Uint32Array.from(ringStart),
    ptStart: Uint32Array.from(ptStart),
    pts: Float32Array.from(pts),
  },
  { gridAngle: best / 10, truncated }
)
console.log(
  `tejido: ${parsed} buildings, ${ptStart.length - 1} rings, ${pts.length / 2} points, skipped ${skipped}, grid angle ${best / 10}°${truncated ? ' (TRUNCATED SOURCE)' : ''}`
)
