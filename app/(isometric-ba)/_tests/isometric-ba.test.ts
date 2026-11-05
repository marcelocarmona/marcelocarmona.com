import { describe, expect, it } from 'vitest'

import {
  buildHash,
  buildTileSet,
  findPlaceBySlug,
  labelOpacity,
  latLngToPx,
  parseHash,
  pickRandomPlace,
  placeZoom,
  pxToLatLng,
  searchPlaces,
  slugify,
  type Place,
} from '../_lib/viewer'

const places: Place[] = [
  { name: 'Obelisco', kind: 'landmark', x: 100, y: 200, desc: 'Avenida 9 de Julio' },
  { name: 'Palermo', kind: 'barrio', x: 10, y: 20 },
  { name: 'Avenida Corrientes', kind: 'street', x: 50, y: 60, len: 8000 },
  { name: 'Corrientes Angosta', kind: 'street', x: 51, y: 61, len: 400 },
  { name: 'Teatro Colón', kind: 'landmark', x: 70, y: 80 },
  { name: 'La Boca', kind: 'barrio', x: 1, y: 2 },
  { name: 'Calle La Boca', kind: 'street', x: 3, y: 4, len: 100 },
  { name: 'Constitución', kind: 'barrio', x: 5, y: 6 },
]

describe('isometric buenos aires projection', () => {
  it('round-trips pixel coordinates through Leaflet CRS.Simple lat/lng', () => {
    const [lat, lng] = pxToLatLng(12_800, 6_400, 6)
    expect(lat).toBe(-100)
    expect(lng).toBe(200)
    expect(latLngToPx(lat, lng, 6)).toEqual([12_800, 6_400])
  })

  it('indexes sparse tiles by z/x/y', () => {
    const set = buildTileSet({ '6': { '3': [4, 5] }, '0': { '0': [0] } })
    expect(set.has('6/3/4')).toBe(true)
    expect(set.has('6/3/5')).toBe(true)
    expect(set.has('0/0/0')).toBe(true)
    expect(set.has('6/4/4')).toBe(false)
  })
})

describe('isometric buenos aires search', () => {
  it('ignores accents and case', () => {
    expect(searchPlaces(places, 'colon')[0]?.name).toBe('Teatro Colón')
    expect(searchPlaces(places, 'CONSTITUCION')[0]?.name).toBe('Constitución')
  })

  it('matches streets without their Avenida prefix and prefers longer streets', () => {
    const results = searchPlaces(places, 'corrientes')
    expect(results.map((p) => p.name)).toEqual(['Corrientes Angosta', 'Avenida Corrientes'])
    expect(searchPlaces(places, 'corr').map((p) => p.name)[0]).toBe('Corrientes Angosta')
  })

  it('ranks barrios above streets with the same name', () => {
    expect(searchPlaces(places, 'la boca').map((p) => p.kind)).toEqual(['barrio', 'street'])
  })

  it('returns nothing for an empty query and respects the limit', () => {
    expect(searchPlaces(places, '   ')).toEqual([])
    expect(searchPlaces(places, 'a', 2)).toHaveLength(2)
  })
})

describe('isometric buenos aires share links', () => {
  it('slugifies names for place hashes', () => {
    expect(slugify('Teatro Colón')).toBe('teatro-colon')
    expect(buildHash({ place: 'Plaza de Mayo' })).toBe('#place=plaza-de-mayo')
  })

  it('parses place and view hashes', () => {
    expect(parseHash('#place=teatro-colon')).toEqual({ place: 'teatro-colon' })
    expect(parseHash('#x=10&y=20&z=5.25')).toEqual({ x: 10, y: 20, z: 5.25 })
    expect(parseHash('#x=10&y=oops&z=5')).toBeNull()
    expect(parseHash('')).toBeNull()
  })

  it('rounds view hashes so links stay short', () => {
    expect(buildHash({ x: 10.6, y: 20.2, z: 5.12345 })).toBe('#x=11&y=20&z=5.12')
  })

  it('resolves a slug to a place, preferring non-street places', () => {
    expect(findPlaceBySlug(places, 'teatro-colon')?.name).toBe('Teatro Colón')
    expect(findPlaceBySlug(places, 'la-boca')?.kind).toBe('barrio')
    expect(findPlaceBySlug(places, 'nowhere')).toBeUndefined()
  })
})

describe('isometric buenos aires labels and places', () => {
  it('fades barrios out and landmarks and streets in as you zoom', () => {
    const max = 6
    expect(labelOpacity('barrio', 3, max)).toBe(1)
    expect(labelOpacity('barrio', 6, max)).toBe(0)
    expect(labelOpacity('landmark', 3, max)).toBe(0)
    expect(labelOpacity('landmark', 5, max)).toBe(1)
    expect(labelOpacity('street', 5, max)).toBe(0)
    expect(labelOpacity('street', 6, max)).toBe(1)
    expect(labelOpacity('street', 5.625, max)).toBeCloseTo(0.5)
  })

  it('never picks a street as a random place', () => {
    for (let i = 0; i < 20; i++) {
      const place = pickRandomPlace(places, () => i / 20)
      expect(place?.kind).not.toBe('street')
    }
    expect(pickRandomPlace([])).toBeUndefined()
  })

  it('chooses a zoom level per kind of place', () => {
    expect(placeZoom('barrio', 6)).toBe(4)
    expect(placeZoom('street', 6)).toBe(5)
    expect(placeZoom('landmark', 6)).toBe(6)
  })
})
