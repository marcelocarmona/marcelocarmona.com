import path from 'node:path'

export const ROOT = process.cwd()
export const CACHE_DIR = path.join(ROOT, '.cache', 'isometric-ba')
export const OUT_DIR = path.join(ROOT, 'public', 'isometric-buenos-aires')
export const TILE_DIR = path.join(OUT_DIR, 'tiles')

/** Bounding box (WGS84) fetched from OSM: CABA plus a small margin. */
export const FETCH_BBOX = { south: -34.712, west: -58.542, north: -34.52, east: -58.32 }

/** Projection origin, roughly the geographic centre of CABA. */
export const ORIGIN = { lat: -34.615, lon: -58.44 }

/** Max-zoom tile edge in pixels. */
export const TILE_SIZE = 512

/** Screen pixels per ground metre (horizontal axis) at max zoom. */
export const PX_PER_M = 1.0

/** Vertical exaggeration applied on top of the 2:1 dimetric projection. */
export const HEIGHT_SCALE = 1.15

/** Internal supersampling factor (each output pixel averages SS×SS samples). */
export const SUPERSAMPLE = 2

/** Building heights above this are treated as data errors and clamped. */
export const MAX_BUILDING_H = 240

/** Fade outside the city limits (metres from the CABA boundary). */
export const FADE = { desaturate: 400, start: 150, end: 1400 }

export const PNG_DIR = path.join(CACHE_DIR, 'tiles-png')

/**
 * Street grid orientation (degrees, local east→north) that is mapped onto the
 * isometric diagonals. Buenos Aires has several grids; this is the Microcentro /
 * San Telmo one, so the historic centre reads as a clean isometric grid.
 */
export const GRID_ANGLE_DEG = 3.2
