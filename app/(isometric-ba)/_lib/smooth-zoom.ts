import type * as Leaflet from 'leaflet'

import {
  ZOOM_STIFFNESS,
  clamp,
  magneticZoom,
  springStep,
  stepZoom,
  wheelFeel,
  wheelZoomDelta,
  type ZoomFeel,
} from './zoom'

/**
 * Leaflet internals the engine relies on, modelled on Leaflet's own pinch zoom (Map.TouchZoom.js).
 * Re-check these when upgrading Leaflet.
 *
 * - `_move` repositions the map without the tile reset that `setView` does.
 * - `_limitCenter` keeps the view inside maxBounds each frame, so nothing jumps when zooming ends.
 * - `_animatingZoom` is set while Leaflet runs its own animated zoom (e.g. at the end of a touch
 *   pinch); the engine waits for it instead of fighting it.
 *
 * Event contract, in order: `zoomstart` + `movestart`, then per frame `_move(..., {pinch: true})`
 * which fires `zoom` + `move` while tile layers keep their current levels, then a plain `zoom`
 * (tile layers load the final level and prune the rest), `zoomend`, and `moveend`.
 */
type MapInternals = {
  _animatingZoom?: boolean
  _move(center: Leaflet.LatLng, zoom: number, data?: { pinch?: boolean }): void
  _limitCenter(
    center: Leaflet.LatLng,
    zoom: number,
    bounds: Leaflet.LatLngBounds | undefined
  ): Leaflet.LatLng
}

/** Desktop Safari reports trackpad pinches as non-standard gesture events instead of ctrl+wheel. */
type SafariGestureEvent = MouseEvent & { scale: number }

export type SmoothZoom = {
  /** Zoom to the next whole level in `direction`, around `point` (defaults to the centre). */
  step(direction: 1 | -1, point?: Leaflet.Point): void
  /** Halt any zoom in progress, e.g. before a fly-to or when a drag starts. */
  stop(): void
  destroy(): void
}

// The spring counts as settled once what is left is far below one screen pixel.
const SETTLE_ZOOM = 5e-4
const SETTLE_VELOCITY = 5e-3
// Gap after the last wheel or gesture event that counts as the gesture ending.
const GESTURE_END_MS = 140
// Cap the frame time so a tab returning from the background doesn't jump.
const MAX_FRAME_S = 1 / 20

export function createSmoothZoom(
  map: Leaflet.Map,
  { reducedMotion = false }: { reducedMotion?: boolean } = {}
): SmoothZoom {
  const internals = map as unknown as MapInternals
  const container = map.getContainer()

  let active = false
  let frame = 0
  let lastTime = 0
  let zoom = 0
  let velocity = 0
  let target = 0
  let omega = ZOOM_STIFFNESS.step
  let anchorPoint: Leaflet.Point | null = null
  let anchorLatLng: Leaflet.LatLng | null = null
  let gestureTimer = 0
  let safariGesture = false
  let safariStartZoom = 0

  const currentTarget = () => (active ? target : map.getZoom())

  // Keep the map point under the cursor fixed while zooming. Only re-pick it when the cursor
  // actually moves, so rounding in Leaflet's pixel origin can't make the view creep.
  function setAnchor(point?: Leaflet.Point) {
    const p = point ?? map.getSize().divideBy(2)
    if (active && anchorPoint && anchorLatLng && anchorPoint.distanceTo(p) < 1) return
    anchorPoint = p
    anchorLatLng = map.containerPointToLatLng(p)
  }

  function render() {
    if (!anchorPoint || !anchorLatLng) return
    const half = map.getSize().divideBy(2)
    const centerPx = map.project(anchorLatLng, zoom).subtract(anchorPoint).add(half)
    // Leaflet normalises maxBounds to a LatLngBounds in setMaxBounds.
    const maxBounds = map.options.maxBounds as Leaflet.LatLngBounds | undefined
    const center = internals._limitCenter(map.unproject(centerPx, zoom), zoom, maxBounds)
    // `pinch` tells tile layers to keep the levels they already have until the zoom settles.
    internals._move(center, zoom, { pinch: true })
  }

  function begin(): boolean {
    if (active) return true
    if (internals._animatingZoom) return false
    map.stop()
    active = true
    zoom = map.getZoom()
    target = zoom
    velocity = 0
    map.fire('zoomstart').fire('movestart')
    return true
  }

  function end(settled: boolean) {
    if (!active) return
    cancelAnimationFrame(frame)
    frame = 0
    active = false
    velocity = 0
    // A plain zoom event lets tile layers load the final level and prune the ones they kept.
    map.fire('zoom').fire('zoomend')
    // When interrupted, whatever took over (a drag, a fly-to) fires its own moveend.
    if (settled) map.fire('moveend')
  }

  function tick(now: number) {
    const dt = clamp((now - lastTime) / 1000, 0, MAX_FRAME_S)
    lastTime = now
    const [x, v] = springStep(zoom - target, velocity, omega, dt)
    velocity = v
    if (Math.abs(x) < SETTLE_ZOOM && Math.abs(v) < SETTLE_VELOCITY) {
      zoom = target
      render()
      end(true)
      return
    }
    zoom = target + x
    render()
    frame = requestAnimationFrame(tick)
  }

  function zoomTo(next: number, point?: Leaflet.Point, feel: ZoomFeel = 'step') {
    const goal = clamp(next, map.getMinZoom(), map.getMaxZoom())
    if (!active && Math.abs(goal - map.getZoom()) < 1e-6) return
    if (!begin()) return
    setAnchor(point)
    target = goal
    omega = ZOOM_STIFFNESS[feel]
    if (reducedMotion) {
      zoom = target
      render()
      end(true)
      return
    }
    if (!frame) {
      // Pretend one frame already passed so the first rendered frame moves.
      lastTime = performance.now() - 1000 / 60
      frame = requestAnimationFrame(tick)
    }
  }

  function step(direction: 1 | -1, point?: Leaflet.Point) {
    zoomTo(stepZoom(currentTarget(), direction, map.getMinZoom(), map.getMaxZoom()), point)
  }

  function stop() {
    window.clearTimeout(gestureTimer)
    end(false)
  }

  function settleOnWholeLevel() {
    const from = currentTarget()
    const snapped = magneticZoom(from)
    if (snapped !== from) zoomTo(snapped, anchorPoint ?? undefined, 'step')
  }

  function scheduleSettle() {
    window.clearTimeout(gestureTimer)
    gestureTimer = window.setTimeout(settleOnWholeLevel, GESTURE_END_MS)
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    if (safariGesture) return
    const delta = wheelZoomDelta(e)
    if (!delta) return
    zoomTo(currentTarget() + delta, map.mouseEventToContainerPoint(e), wheelFeel(e))
    scheduleSettle()
  }

  // iPads also fire gesture events, but there Leaflet's touch zoom already handles the pinch.
  const handleSafariGestures = navigator.maxTouchPoints === 0

  function onGestureStart(e: Event) {
    e.preventDefault()
    safariGesture = true
    safariStartZoom = currentTarget()
  }

  function onGestureChange(e: Event) {
    e.preventDefault()
    const g = e as SafariGestureEvent
    if (!g.scale) return
    zoomTo(safariStartZoom + Math.log2(g.scale), map.mouseEventToContainerPoint(g), 'pinch')
  }

  function onGestureEnd(e: Event) {
    e.preventDefault()
    safariGesture = false
    scheduleSettle()
  }

  function onDblClick(e: Leaflet.LeafletMouseEvent) {
    step(e.originalEvent.shiftKey ? -1 : 1, e.containerPoint)
  }

  container.addEventListener('wheel', onWheel, { passive: false })
  container.addEventListener('touchstart', stop, { passive: true })
  if (handleSafariGestures) {
    container.addEventListener('gesturestart', onGestureStart)
    container.addEventListener('gesturechange', onGestureChange)
    container.addEventListener('gestureend', onGestureEnd)
  }
  map.on('dblclick', onDblClick)
  map.on('dragstart', stop)

  return {
    step,
    stop,
    // Not stop(): the map is being torn down, so no zoom or move events should fire.
    destroy() {
      window.clearTimeout(gestureTimer)
      cancelAnimationFrame(frame)
      frame = 0
      active = false
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('touchstart', stop)
      container.removeEventListener('gesturestart', onGestureStart)
      container.removeEventListener('gesturechange', onGestureChange)
      container.removeEventListener('gestureend', onGestureEnd)
      map.off('dblclick', onDblClick)
      map.off('dragstart', stop)
    },
  }
}
