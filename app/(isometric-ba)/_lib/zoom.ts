/** Pure zoom math for the smooth zoom engine, kept free of Leaflet and the DOM so it can be tested. */

export type WheelInput = { deltaY: number; deltaMode: number; ctrlKey: boolean }

export type ZoomFeel = 'wheel' | 'trackpad' | 'pinch' | 'step'

/** Spring stiffness per input. Higher follows the input more tightly, lower glides more. */
export const ZOOM_STIFFNESS: Record<ZoomFeel, number> = {
  wheel: 20,
  trackpad: 32,
  pinch: 42,
  step: 15,
}

// Approximate pixel sizes for wheel events reported in lines (Firefox) or pages.
const LINE_PX = 32
const PAGE_PX = 600
// Mouse wheels report about 100px per notch, trackpads a few px per event.
const MOUSE_NOTCH_MIN_PX = 50
const WHEEL_PX_PER_LEVEL = 240
// Chrome reports pinch as ctrl+wheel with scale = exp(-deltaY / 100); this turns it into zoom levels.
const PINCH_LEVELS_PER_PX = 1 / (100 * Math.LN2)
const MAX_LEVELS_PER_EVENT = 1

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Zoom levels to add for one wheel event. Positive zooms in. */
export function wheelZoomDelta({ deltaY, deltaMode, ctrlKey }: WheelInput): number {
  const px = deltaY * (deltaMode === 1 ? LINE_PX : deltaMode === 2 ? PAGE_PX : 1)
  const levels = ctrlKey ? -px * PINCH_LEVELS_PER_PX : -px / WHEEL_PX_PER_LEVEL
  return clamp(levels, -MAX_LEVELS_PER_EVENT, MAX_LEVELS_PER_EVENT)
}

/** Mouse wheels send big discrete notches, trackpads a stream of small deltas, pinches come with ctrl. */
export function wheelFeel({ deltaY, deltaMode, ctrlKey }: WheelInput): ZoomFeel {
  if (ctrlKey) return 'pinch'
  if (deltaMode !== 0 || Math.abs(deltaY) >= MOUSE_NOTCH_MIN_PX) return 'wheel'
  return 'trackpad'
}

/**
 * Advance a critically damped spring by dt seconds. `x` is the offset from the target, `v` its
 * velocity. Uses the closed form, so it is stable for any frame time and never overshoots.
 */
export function springStep(x: number, v: number, omega: number, dt: number): [number, number] {
  const decay = Math.exp(-omega * dt)
  const c = v + omega * x
  return [(x + c * dt) * decay, (v - omega * c * dt) * decay]
}

/** Buttons and keys move to the next whole level, where the pixel art renders 1:1. */
export function stepZoom(from: number, direction: 1 | -1, min: number, max: number): number {
  // Treat a zoom this close to a whole level as on it (spring residue, two-decimal URL hash).
  const eps = 0.02
  const next = direction > 0 ? Math.floor(from + eps) + 1 : Math.ceil(from - eps) - 1
  return clamp(next, min, max)
}

const MAGNETIC_THRESHOLD = 0.12

/** When a wheel gesture ends close to a whole level, settle on it so the pixels stay crisp. */
export function magneticZoom(zoom: number): number {
  const whole = Math.round(zoom)
  return Math.abs(zoom - whole) <= MAGNETIC_THRESHOLD ? whole : zoom
}

/**
 * How far above the current zoom to pick tiles. Leaflet rounds, which shrinks tiles down to 0.71x
 * and makes nearest-neighbour pixel art shimmer. Biasing by log2(dpr), capped at Leaflet's 0.5,
 * keeps every tile at one or more device pixels per art pixel.
 */
export function tileLodBias(devicePixelRatio: number): number {
  return clamp(Math.log2(devicePixelRatio || 1), 0, 0.5)
}

export function tileZoomFor(zoom: number, bias: number): number {
  // The epsilon stops float noise (e.g. 4.9999999) from dropping a whole level.
  return Math.floor(zoom + bias + 1e-6)
}
