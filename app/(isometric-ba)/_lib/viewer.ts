export type PlaceKind = 'barrio' | 'landmark' | 'street'

export type Place = {
  name: string
  kind: PlaceKind
  x: number
  y: number
  desc?: string
  len?: number
}

export type TileIndex = Record<string, Record<string, number[]>>

export type Meta = {
  tileSize: number
  maxZoom: number
  width: number
  height: number
  initial: { x: number; y: number; zoom: number }
  tiles: TileIndex
}

export type ViewState = { x: number; y: number; z: number }

export type HashState = { place: string } | ViewState | null

export const DATA_BASE = '/isometric-buenos-aires'

/** Leaflet CRS.Simple maps one unit to one pixel at zoom 0; pixels are stored at maxZoom. */
export function pxToLatLng(x: number, y: number, maxZoom: number): [number, number] {
  const s = 2 ** maxZoom
  return [-y / s, x / s]
}

export function latLngToPx(lat: number, lng: number, maxZoom: number): [number, number] {
  const s = 2 ** maxZoom
  return [lng * s, -lat * s]
}

export function buildTileSet(tiles: TileIndex): Set<string> {
  const set = new Set<string>()
  for (const [z, cols] of Object.entries(tiles)) {
    for (const [x, ys] of Object.entries(cols)) for (const y of ys) set.add(`${z}/${x}/${y}`)
  }
  return set
}

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function slugify(text: string): string {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const KIND_BONUS: Record<PlaceKind, number> = { landmark: 3, barrio: 2, street: 0 }

const STREET_PREFIX = /^(avenida|av\.?|calle|pasaje|boulevard|diagonal)\s+/

function scoreName(name: string, q: string): number {
  if (name === q) return 100
  if (name.startsWith(q)) return 80
  const bare = name.replace(STREET_PREFIX, '')
  if (bare !== name && bare.startsWith(q)) return 70
  const words = name.split(/[\s\-.,()]+/)
  if (words.some((w) => w.startsWith(q))) return 60
  if (name.includes(q)) return 40
  return 0
}

export function searchPlaces(places: Place[], query: string, limit = 8): Place[] {
  const q = normalize(query)
  if (!q) return []
  const scored: { place: Place; score: number }[] = []
  for (const place of places) {
    const base = scoreName(normalize(place.name), q)
    if (base > 0) scored.push({ place, score: base + KIND_BONUS[place.kind] })
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (b.place.len ?? 0) - (a.place.len ?? 0) ||
      a.place.name.localeCompare(b.place.name)
  )
  const seen = new Set<string>()
  const out: Place[] = []
  for (const { place } of scored) {
    const key = `${place.kind}:${normalize(place.name)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(place)
    if (out.length >= limit) break
  }
  return out
}

export function findPlaceBySlug(places: Place[], slug: string): Place | undefined {
  const target = slugify(slug)
  if (!target) return undefined
  const matches = places.filter((p) => slugify(p.name) === target)
  return matches.find((p) => p.kind !== 'street') ?? matches[0]
}

export function parseHash(hash: string): HashState {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const place = params.get('place')
  if (place) return { place }
  if (!params.has('x') || !params.has('y') || !params.has('z')) return null
  const x = Number(params.get('x'))
  const y = Number(params.get('y'))
  const z = Number(params.get('z'))
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null
}

export function buildHash(state: { place: string } | ViewState): string {
  if ('place' in state) return `#place=${encodeURIComponent(slugify(state.place))}`
  return `#x=${Math.round(state.x)}&y=${Math.round(state.y)}&z=${Math.round(state.z * 100) / 100}`
}

/**
 * Labels fade by tier, like the reference map: barrios read from far away,
 * landmarks appear as you get closer, streets only near street level.
 */
export function labelOpacity(kind: PlaceKind, zoom: number, maxZoom: number): number {
  const rel = zoom - maxZoom
  const ramp = (from: number, to: number) => Math.min(1, Math.max(0, (rel - from) / (to - from)))
  if (kind === 'barrio') return 1 - ramp(-1.5, -0.5)
  if (kind === 'landmark') return ramp(-2.5, -1.5)
  return ramp(-0.75, 0)
}

export function pickRandomPlace(
  places: Place[],
  rand: () => number = Math.random
): Place | undefined {
  const pool = places.filter((p) => p.kind !== 'street')
  if (pool.length === 0) return undefined
  return pool[Math.floor(rand() * pool.length) % pool.length]
}

export function placeZoom(kind: PlaceKind, maxZoom: number): number {
  if (kind === 'barrio') return maxZoom - 2
  if (kind === 'street') return maxZoom - 1
  return maxZoom
}

export function kindLabel(kind: PlaceKind): string {
  if (kind === 'barrio') return 'Barrio'
  if (kind === 'street') return 'Street'
  return 'Landmark'
}
