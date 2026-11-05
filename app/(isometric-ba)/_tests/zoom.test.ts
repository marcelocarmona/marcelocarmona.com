import { describe, expect, it } from 'vitest'

import {
  magneticZoom,
  springStep,
  stepZoom,
  tileLodBias,
  tileZoomFor,
  wheelFeel,
  wheelZoomDelta,
} from '../_lib/zoom'

describe('wheelZoomDelta', () => {
  it('zooms in on scroll up and out on scroll down', () => {
    expect(wheelZoomDelta({ deltaY: -100, deltaMode: 0, ctrlKey: false })).toBeGreaterThan(0)
    expect(wheelZoomDelta({ deltaY: 100, deltaMode: 0, ctrlKey: false })).toBeLessThan(0)
  })

  it('treats a mouse wheel notch in pixels or lines about the same', () => {
    const px = wheelZoomDelta({ deltaY: -100, deltaMode: 0, ctrlKey: false })
    const lines = wheelZoomDelta({ deltaY: -3, deltaMode: 1, ctrlKey: false })
    expect(px).toBeCloseTo(0.42, 2)
    expect(Math.abs(lines - px)).toBeLessThan(0.05)
  })

  it('maps a trackpad pinch to the scale Chrome reports', () => {
    // Chrome reports a 2x pinch as a total deltaY of -100 * ln(2).
    const delta = wheelZoomDelta({ deltaY: -100 * Math.LN2, deltaMode: 0, ctrlKey: true })
    expect(delta).toBeCloseTo(1, 6)
  })

  it('caps a single event at one level', () => {
    expect(wheelZoomDelta({ deltaY: -5000, deltaMode: 0, ctrlKey: false })).toBe(1)
    expect(wheelZoomDelta({ deltaY: 30, deltaMode: 2, ctrlKey: false })).toBe(-1)
  })
})

describe('wheelFeel', () => {
  it('tells pinches, mouse wheels and trackpads apart', () => {
    expect(wheelFeel({ deltaY: 2, deltaMode: 0, ctrlKey: true })).toBe('pinch')
    expect(wheelFeel({ deltaY: 100, deltaMode: 0, ctrlKey: false })).toBe('wheel')
    expect(wheelFeel({ deltaY: 3, deltaMode: 1, ctrlKey: false })).toBe('wheel')
    expect(wheelFeel({ deltaY: 6, deltaMode: 0, ctrlKey: false })).toBe('trackpad')
  })
})

describe('springStep', () => {
  it('settles on the target without overshooting', () => {
    let x = 1
    let v = 0
    let min = x
    for (let i = 0; i < 60; i++) {
      ;[x, v] = springStep(x, v, 20, 1 / 60)
      min = Math.min(min, x)
    }
    expect(Math.abs(x)).toBeLessThan(1e-3)
    expect(min).toBeGreaterThanOrEqual(0)
  })

  it('starts from rest, so a button zoom eases in', () => {
    const [x] = springStep(1, 0, 15, 1 / 60)
    expect(x).toBeGreaterThan(0.95)
  })

  it('gives the same result for one long step as for many short ones', () => {
    const [a] = springStep(1, 0, 20, 0.1)
    let x = 1
    let v = 0
    for (let i = 0; i < 10; i++) [x, v] = springStep(x, v, 20, 0.01)
    expect(x).toBeCloseTo(a, 10)
  })
})

describe('stepZoom', () => {
  it('moves to the next whole level', () => {
    expect(stepZoom(4, 1, 2, 7)).toBe(5)
    expect(stepZoom(4.4, 1, 2, 7)).toBe(5)
    expect(stepZoom(4.4, -1, 2, 7)).toBe(4)
    expect(stepZoom(4, -1, 2, 7)).toBe(3)
  })

  it('does not get stuck just below a level', () => {
    expect(stepZoom(4.99, 1, 2, 7)).toBe(6)
    expect(stepZoom(5.01, -1, 2, 7)).toBe(4)
  })

  it('stays within the zoom limits', () => {
    expect(stepZoom(6.5, 1, 2, 7)).toBe(7)
    expect(stepZoom(7, 1, 2, 7)).toBe(7)
    expect(stepZoom(2.4, -1, 2.25, 7)).toBe(2.25)
  })
})

describe('magneticZoom', () => {
  it('settles on a nearby whole level and leaves the rest alone', () => {
    expect(magneticZoom(4.92)).toBe(5)
    expect(magneticZoom(5.1)).toBe(5)
    expect(magneticZoom(4.5)).toBe(4.5)
  })
})

describe('tile level of detail', () => {
  it('never scales tiles below one device pixel per art pixel', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 3]) {
      const bias = tileLodBias(dpr)
      for (let z = 2; z <= 7; z += 0.05) {
        const deviceScale = 2 ** (z - tileZoomFor(z, bias)) * dpr
        expect(deviceScale).toBeGreaterThanOrEqual(0.999)
      }
    }
  })

  it('shows whole levels at 1:1', () => {
    expect(tileZoomFor(5, tileLodBias(1))).toBe(5)
    expect(tileZoomFor(5, tileLodBias(2))).toBe(5)
  })

  it('rounds like Leaflet on retina screens and floors on standard ones', () => {
    expect(tileZoomFor(4.6, tileLodBias(2))).toBe(5)
    expect(tileZoomFor(4.6, tileLodBias(1))).toBe(4)
  })
})
