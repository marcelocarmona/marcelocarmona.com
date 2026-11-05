import { ORIGIN } from './config.mts'

const M_PER_DEG_LAT = 110_574
const M_PER_DEG_LON = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180)

/** WGS84 -> local metres (x east, y north) around ORIGIN. */
export function lonLatToLocal(lon: number, lat: number): [number, number] {
  return [(lon - ORIGIN.lon) * M_PER_DEG_LON, (lat - ORIGIN.lat) * M_PER_DEG_LAT]
}

export function localToLonLat(x: number, y: number): [number, number] {
  return [x / M_PER_DEG_LON + ORIGIN.lon, y / M_PER_DEG_LAT + ORIGIN.lat]
}

/** Douglas-Peucker simplification of a flat [x0,y0,x1,y1,...] ring/line. */
export function simplify(points: number[], tolerance: number): number[] {
  const n = points.length / 2
  if (n <= 4) return points
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]
  const tol2 = tolerance * tolerance
  while (stack.length) {
    const [a, b] = stack.pop()!
    const ax = points[a * 2]
    const ay = points[a * 2 + 1]
    const dx = points[b * 2] - ax
    const dy = points[b * 2 + 1] - ay
    const len2 = dx * dx + dy * dy
    let maxD = -1
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const px = points[i * 2] - ax
      const py = points[i * 2 + 1] - ay
      let d2: number
      if (len2 === 0) d2 = px * px + py * py
      else {
        const cross = px * dy - py * dx
        d2 = (cross * cross) / len2
      }
      if (d2 > maxD) {
        maxD = d2
        idx = i
      }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i * 2], points[i * 2 + 1])
  return out
}

/** Signed area of a flat closed or open ring (positive = counter-clockwise). */
export function ringArea(points: ArrayLike<number>, start = 0, end = points.length): number {
  let area = 0
  const n = (end - start) / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[start + i * 2]
    const yi = points[start + i * 2 + 1]
    const xj = points[start + j * 2]
    const yj = points[start + j * 2 + 1]
    area += xj * yi - xi * yj
  }
  return area / 2
}

export function pointInRing(
  x: number,
  y: number,
  ring: ArrayLike<number>,
  start = 0,
  end = ring.length
): boolean {
  let inside = false
  const n = (end - start) / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[start + i * 2]
    const yi = ring[start + i * 2 + 1]
    const xj = ring[start + j * 2]
    const yj = ring[start + j * 2 + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Deterministic 32-bit hash for procedural variation. */
export function hash(a: number, b = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
