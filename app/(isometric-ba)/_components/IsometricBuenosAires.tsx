'use client'

import Link from 'next/link'
import type * as Leaflet from 'leaflet'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import {
  DATA_BASE,
  buildHash,
  buildTileSet,
  findPlaceBySlug,
  kindLabel,
  labelOpacity,
  latLngToPx,
  parseHash,
  pickRandomPlace,
  placeZoom,
  pxToLatLng,
  searchPlaces,
  type Meta,
  type Place,
  type ViewState,
} from '../_lib/viewer'
import { createSmoothZoom, type SmoothZoom } from '../_lib/smooth-zoom'
import { createSparseTileLayer } from '../_lib/sparse-tile-layer'
import { clamp, tileLodBias } from '../_lib/zoom'

type LeafletModule = typeof Leaflet

type MapApi = {
  L: LeafletModule
  map: Leaflet.Map
  meta: Meta
  zoom: SmoothZoom
  reducedMotion: boolean
}

const STREET_LABEL_MIN_LENGTH = 1200
const STREET_LABEL_LIMIT = 160
const STREET_LABEL_REFRESH_MS = 180
// Native level of the low-res layer drawn under the map, so zooming out never shows empty gaps.
const UNDERLAY_LEVELS_BELOW_MAX = 3
// Allow one level of upscaling past the sharpest tiles.
const OVERZOOM_LEVELS = 1
// Treat the zoom as at a limit within this, so the button disables despite float noise.
const ZOOM_EDGE_TOLERANCE = 0.01

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function Icon({ path, className = 'h-4 w-4' }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

const ICONS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 8.5h.01M15.5 15.5h.01M15.5 8.5h.01M8.5 15.5h.01M12 12h.01',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M18 6 6 18M6 6l12 12',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
}

const btn =
  'pointer-events-auto inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/10 bg-[#141a2b]/85 px-3 text-sm text-white/85 shadow-lg shadow-black/30 backdrop-blur-md transition hover:border-white/25 hover:bg-[#1b2338]/90 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300'

export default function IsometricBuenosAires() {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const apiRef = useRef<MapApi | null>(null)
  const selectedRef = useRef<Place | null>(null)
  const highlightRef = useRef<Leaflet.Marker | null>(null)

  const [places, setPlaces] = useState<Place[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Place | null>(null)
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [shareOpen, setShareOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [hintVisible, setHintVisible] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState('')
  const [atMinZoom, setAtMinZoom] = useState(false)
  const [atMaxZoom, setAtMaxZoom] = useState(false)
  // Hold off writing the hash until the URL's initial hash has been applied.
  const hashAppliedRef = useRef(false)
  const initialHashRef = useRef<string | null>(null)

  const results = useMemo(() => searchPlaces(places, query, 8), [places, query])
  const showResults = searchFocused && query.trim().length > 0

  const writeHash = useCallback((hash: string) => {
    if (window.location.hash === hash) return
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${hash}`
    )
  }, [])

  const currentView = useCallback((): ViewState | null => {
    const api = apiRef.current
    if (!api) return null
    const c = api.map.getCenter()
    const [x, y] = latLngToPx(c.lat, c.lng, api.meta.maxZoom)
    return { x, y, z: api.map.getZoom() }
  }, [])

  const highlight = useCallback((place: Place | null) => {
    const api = apiRef.current
    if (!api) return
    highlightRef.current?.remove()
    highlightRef.current = null
    if (!place) return
    const { L, map, meta } = api
    highlightRef.current = L.marker(pxToLatLng(place.x, place.y, meta.maxZoom), {
      icon: L.divIcon({
        className: 'iba-focus',
        html: '<span class="iba-focus__ring"></span><span class="iba-focus__dot"></span>',
        iconSize: [0, 0],
      }),
      interactive: false,
      keyboard: false,
      pane: 'ibaFocus',
    }).addTo(map)
  }, [])

  const goToPlace = useCallback(
    (place: Place, { animate = true }: { animate?: boolean } = {}) => {
      const api = apiRef.current
      if (!api) return
      const { map, meta } = api
      selectedRef.current = place
      setSelected(place)
      setShareOpen(false)
      highlight(place)
      api.zoom.stop()
      const target = pxToLatLng(place.x, place.y, meta.maxZoom)
      // Land on a whole level so the pixel art is crisp when the flight ends.
      const zoom = Math.max(
        placeZoom(place.kind, meta.maxZoom),
        Math.min(Math.round(map.getZoom()), meta.maxZoom)
      )
      if (animate && !api.reducedMotion) map.flyTo(target, zoom, { duration: 1.4 })
      else map.setView(target, zoom, { animate: false })
      writeHash(buildHash({ place: place.name }))
    },
    [highlight, writeHash]
  )

  const clearSelection = useCallback(() => {
    if (!selectedRef.current) return
    selectedRef.current = null
    setSelected(null)
    highlight(null)
    const view = currentView()
    if (view) writeHash(buildHash(view))
  }, [currentView, highlight, writeHash])

  const goRandom = useCallback(() => {
    const current = selectedRef.current
    const pool = places.filter((p) => p !== current)
    const place = pickRandomPlace(pool)
    if (place) goToPlace(place)
  }, [goToPlace, places])

  const applyHash = useCallback(
    (hash: string, animate: boolean) => {
      const api = apiRef.current
      if (!api) return false
      const state = parseHash(hash)
      if (!state) return false
      if ('place' in state) {
        const place = findPlaceBySlug(places, state.place)
        if (!place) return false
        goToPlace(place, { animate })
        return true
      }
      if (selectedRef.current) {
        selectedRef.current = null
        setSelected(null)
        highlight(null)
      }
      const z = clamp(state.z, api.map.getMinZoom(), api.map.getMaxZoom())
      api.zoom.stop()
      api.map.setView(pxToLatLng(state.x, state.y, api.meta.maxZoom), z, {
        animate: animate && !api.reducedMotion,
      })
      return true
    },
    [goToPlace, highlight, places]
  )

  // Leaflet handlers are bound once; route them through refs to the latest callbacks.
  const goToPlaceRef = useRef(goToPlace)
  const clearSelectionRef = useRef(clearSelection)
  const writeHashRef = useRef(writeHash)
  useEffect(() => {
    goToPlaceRef.current = goToPlace
    clearSelectionRef.current = clearSelection
    writeHashRef.current = writeHash
  }, [goToPlace, clearSelection, writeHash])

  // Build the map once.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    initialHashRef.current ??= window.location.hash
    let disposed = false
    let map: Leaflet.Map | null = null
    let zoom: SmoothZoom | null = null

    async function init(container: HTMLDivElement) {
      const [L, meta, placeList] = await Promise.all([
        import('leaflet').then((m) => m.default ?? m),
        fetch(`${DATA_BASE}/meta.json`).then((r) => {
          if (!r.ok) throw new Error(`meta.json ${r.status}`)
          return r.json() as Promise<Meta>
        }),
        fetch(`${DATA_BASE}/places.json`).then((r) => {
          if (!r.ok) throw new Error(`places.json ${r.status}`)
          return r.json() as Promise<Place[]>
        }),
      ])
      if (disposed) return

      const { maxZoom, tileSize, width, height } = meta
      const bounds = L.latLngBounds(pxToLatLng(0, height, maxZoom), pxToLatLng(width, 0, maxZoom))
      map = L.map(container, {
        crs: L.CRS.Simple,
        zoomControl: false,
        attributionControl: false,
        // Zoom is continuous; the smooth zoom engine handles wheel, pinch and double-click.
        zoomSnap: 0,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        maxZoom: maxZoom + OVERZOOM_LEVELS,
        maxBounds: bounds.pad(0.2),
        maxBoundsViscosity: 0.9,
      })
      const mapRef = map

      const updateZoomEdges = () => {
        const z = mapRef.getZoom()
        setAtMinZoom(z <= mapRef.getMinZoom() + ZOOM_EDGE_TOLERANCE)
        setAtMaxZoom(z >= mapRef.getMaxZoom() - ZOOM_EDGE_TOLERANCE)
      }
      // Zooming out stops once the whole city fits the screen.
      const updateMinZoom = () => {
        mapRef.setMinZoom(Math.max(0, mapRef.getBoundsZoom(bounds, true)))
        updateZoomEdges()
      }
      updateMinZoom()

      const tileSet = buildTileSet(meta.tiles)
      const SparseTileLayer = createSparseTileLayer(
        L,
        tileSet,
        tileLodBias(window.devicePixelRatio)
      )
      const tileUrl = `${DATA_BASE}/tiles/{z}/{x}/{y}.webp`
      const tileOptions = { tileSize, bounds, noWrap: true }
      new SparseTileLayer(tileUrl, {
        ...tileOptions,
        maxNativeZoom: Math.max(0, maxZoom - UNDERLAY_LEVELS_BELOW_MAX),
        keepBuffer: 1,
        zIndex: 0,
        className: 'iba-underlay',
      }).addTo(map)
      const tiles = new SparseTileLayer(tileUrl, {
        ...tileOptions,
        maxNativeZoom: maxZoom,
        keepBuffer: 3,
        zIndex: 1,
        className: 'iba-tiles',
      })
      tiles.once('load', () => !disposed && setReady(true))
      window.setTimeout(() => !disposed && setReady(true), 6000)
      tiles.addTo(map)

      map.createPane('ibaLabels').style.zIndex = '450'
      map.createPane('ibaFocus').style.zIndex = '440'

      const labelMarker = (place: Place) =>
        L.marker(pxToLatLng(place.x, place.y, maxZoom), {
          icon: L.divIcon({
            className: `iba-label iba-label--${place.kind}`,
            html:
              place.kind === 'landmark'
                ? `<button type="button" class="iba-label__inner"><span class="iba-label__pin"></span><span class="iba-label__text">${escapeHtml(place.name)}</span></button>`
                : `<span class="iba-label__inner"><span class="iba-label__text">${escapeHtml(place.name)}</span></span>`,
            iconSize: [0, 0],
          }),
          pane: 'ibaLabels',
          keyboard: false,
          interactive: place.kind !== 'street',
          title: place.name,
        })

      for (const place of placeList) {
        if (place.kind === 'street') continue
        labelMarker(place)
          .on('click', () => goToPlaceRef.current(place))
          .addTo(map)
      }

      const streets = placeList
        .filter((p) => p.kind === 'street' && (p.len ?? 0) >= STREET_LABEL_MIN_LENGTH)
        .sort((a, b) => (b.len ?? 0) - (a.len ?? 0))
      const streetMarkers = new Map<Place, Leaflet.Marker>()

      const updateLabelOpacity = () => {
        const z = mapRef.getZoom()
        for (const kind of ['barrio', 'landmark', 'street'] as const) {
          const o = labelOpacity(kind, z, maxZoom)
          container.style.setProperty(`--iba-${kind}`, o.toFixed(3))
          // Landmark buttons only take clicks once they are clearly visible.
          if (kind === 'landmark') container.dataset.landmark = o > 0.05 ? 'on' : 'off'
        }
      }
      // Diff the visible street labels so the ones that stay on screen never flicker.
      let streetTimer = 0
      const updateStreets = () => {
        window.clearTimeout(streetTimer)
        streetTimer = 0
        if (disposed) return
        const visible = new Set<Place>()
        if (labelOpacity('street', mapRef.getZoom(), maxZoom) > 0) {
          const view = mapRef.getBounds().pad(0.25)
          for (const s of streets) {
            if (!view.contains(pxToLatLng(s.x, s.y, maxZoom))) continue
            visible.add(s)
            if (visible.size >= STREET_LABEL_LIMIT) break
          }
        }
        for (const [s, marker] of streetMarkers) {
          if (visible.has(s)) continue
          marker.remove()
          streetMarkers.delete(s)
        }
        for (const s of visible) {
          if (!streetMarkers.has(s)) streetMarkers.set(s, labelMarker(s).addTo(mapRef))
        }
      }
      // Refresh street labels during zooms and drags too, so they fade in instead of popping at the end.
      const scheduleStreets = () => {
        if (!streetTimer) streetTimer = window.setTimeout(updateStreets, STREET_LABEL_REFRESH_MS)
      }

      map.on('zoom', () => {
        updateLabelOpacity()
        updateZoomEdges()
      })
      map.on('move', scheduleStreets)
      map.on('resize', updateMinZoom)
      map.on('moveend', () => {
        updateStreets()
        if (hashAppliedRef.current && !selectedRef.current) {
          const c = mapRef.getCenter()
          const [x, y] = latLngToPx(c.lat, c.lng, maxZoom)
          writeHashRef.current(buildHash({ x, y, z: mapRef.getZoom() }))
        }
      })
      map.on('dragstart', () => {
        setHintVisible(false)
        if (selectedRef.current) clearSelectionRef.current()
      })
      map.on('zoomstart', () => setHintVisible(false))

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      zoom = createSmoothZoom(map, { reducedMotion })
      apiRef.current = { L, map, meta, zoom, reducedMotion }
      setPlaces(placeList)

      const init = meta.initial
      // Fires zoom and moveend, which set up the labels and zoom buttons.
      map.setView(pxToLatLng(init.x, init.y, maxZoom), init.zoom, { animate: false })
    }

    init(el).catch((err: unknown) => {
      if (!disposed) setError(err instanceof Error ? err.message : String(err))
    })

    return () => {
      disposed = true
      zoom?.destroy()
      map?.remove()
      apiRef.current = null
    }
  }, [])

  // Apply the URL hash once places are loaded, then follow hash changes.
  useEffect(() => {
    if (places.length === 0) return
    if (!hashAppliedRef.current) {
      applyHash(initialHashRef.current ?? window.location.hash, false)
      hashAppliedRef.current = true
    }
    const onHash = () => applyHash(window.location.hash, true)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [applyHash, places.length])

  useEffect(() => {
    if (!ready) return
    const t = window.setTimeout(() => setHintVisible(false), 9000)
    return () => window.clearTimeout(t)
  }, [ready])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [toast])

  // Global shortcuts: "/" search, "R" random, Esc closes things.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = isTyping(e.target)
      if (e.key === 'Escape') {
        setShareOpen(false)
        setAboutOpen(false)
        if (!typing) clearSelection()
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        setHintVisible(false)
        goRandom()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection, goRandom])

  // "+" / "-" zoom by whole levels. Capture phase, so Leaflet's own keyboard zoom never sees them.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = isTyping(e.target)
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      const direction = e.key === '+' || e.key === '=' ? 1 : e.key === '-' || e.key === '_' ? -1 : 0
      if (!direction) return
      e.preventDefault()
      e.stopPropagation()
      setHintVisible(false)
      apiRef.current?.zoom.step(direction)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const choose = (place: Place) => {
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.blur()
    setHintVisible(false)
    goToPlace(place)
  }

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const place = results[activeIndex] ?? results[0]
      if (place) choose(place)
    } else if (e.key === 'Escape') {
      setQuery('')
      inputRef.current?.blur()
    }
  }

  const openShare = () => {
    const view = currentView()
    const hash = selected ? buildHash({ place: selected.name }) : view ? buildHash(view) : ''
    const url = `${window.location.origin}${window.location.pathname}${hash}`
    setShareUrl(url)
    setAboutOpen(false)
    setShareOpen((open) => !open)
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setToast('Link copied')
    } catch {
      setToast('Could not copy the link')
    }
    setShareOpen(false)
  }

  const nativeShare = async () => {
    try {
      await navigator.share({ title: shareTitle, url: shareUrl })
      setShareOpen(false)
    } catch {
      // The user closed the native sheet.
    }
  }

  const shareTitle = selected
    ? `${selected.name} in Isometric Buenos Aires`
    : 'Isometric Buenos Aires, a pixel-art map of the whole city'
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const zoomBy = (direction: 1 | -1) => apiRef.current?.zoom.step(direction)

  return (
    <div className="iba-root fixed inset-0 overflow-hidden bg-[#0d1220] font-sans text-white">
      <div
        ref={containerRef}
        className="iba-map absolute inset-0"
        role="application"
        aria-label="Isometric pixel-art map of Buenos Aires"
      />

      {/* Loading screen */}
      <div
        className={`pointer-events-none absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-[#0d1220] transition-opacity duration-700 ${
          ready && !error ? 'opacity-0' : 'opacity-100'
        }`}
        aria-hidden={ready && !error}
      >
        <div className="iba-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="mt-6 font-mono text-xs tracking-[0.25em] text-white/60 uppercase">
          {error ? `Could not load the map (${error})` : 'Building Buenos Aires'}
        </p>
      </div>

      {/* Header */}
      <div className="pointer-events-none absolute top-0 left-0 z-[900] flex w-full flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-[#141a2b]/80 px-4 py-2.5 shadow-lg shadow-black/30 backdrop-blur-md">
          <div>
            <h1 className="font-serif text-lg leading-tight text-white sm:text-xl">
              Isometric Buenos Aires
            </h1>
            <p className="text-[11px] text-white/55">
              by{' '}
              <Link href="/" className="underline-offset-2 hover:text-white hover:underline">
                Marcelo Carmona
              </Link>
            </p>
          </div>
        </div>

        {/* Search pill */}
        <div className="pointer-events-auto relative w-full sm:absolute sm:top-4 sm:left-1/2 sm:w-[min(440px,40vw)] sm:-translate-x-1/2">
          <label className="flex h-11 items-center gap-2 rounded-full border border-white/10 bg-[#141a2b]/85 px-4 shadow-lg shadow-black/30 backdrop-blur-md focus-within:border-sky-300/60">
            <Icon path={ICONS.search} className="h-4 w-4 shrink-0 text-white/50" />
            <span className="sr-only">Search places</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              onKeyDown={onSearchKey}
              placeholder="Search barrios, landmarks, streets"
              className="h-full w-full border-0 bg-transparent p-0 text-sm text-white placeholder:text-white/40 focus:ring-0 focus:outline-none"
              role="combobox"
              aria-expanded={showResults}
              aria-controls="iba-search-results"
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="hidden rounded border border-white/15 px-1.5 font-mono text-[10px] text-white/45 sm:inline">
              /
            </kbd>
          </label>
          {showResults && (
            <ul
              id="iba-search-results"
              role="listbox"
              className="absolute top-12 right-0 left-0 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#141a2b]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-md"
            >
              {results.length === 0 && (
                <li className="px-3 py-2.5 text-sm text-white/50">No places match “{query}”</li>
              )}
              {results.map((place, i) => (
                <li
                  key={`${place.kind}-${place.name}`}
                  role="option"
                  aria-selected={i === activeIndex}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(place)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm ${
                      i === activeIndex ? 'bg-white/10 text-white' : 'text-white/80'
                    }`}
                  >
                    <span className="truncate">{place.name}</span>
                    <span className="shrink-0 font-mono text-[10px] tracking-wider text-white/45 uppercase">
                      {kindLabel(place.kind)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div className="pointer-events-none flex gap-2 self-end sm:self-auto">
          <button type="button" className={btn} onClick={goRandom} title="Random place (R)">
            <Icon path={ICONS.dice} />
            <span className="hidden md:inline">Random</span>
          </button>
          <button type="button" className={btn} onClick={openShare} title="Share this view">
            <Icon path={ICONS.share} />
            <span className="hidden md:inline">Share</span>
          </button>
          <button
            type="button"
            className={`${btn} w-10 px-0`}
            onClick={() => {
              setShareOpen(false)
              setAboutOpen((o) => !o)
            }}
            title="About this map"
            aria-label="About this map"
          >
            <Icon path={ICONS.info} />
          </button>
        </div>
      </div>

      {/* Share sheet */}
      {shareOpen && (
        <div className="absolute top-28 right-3 z-[950] w-[min(340px,calc(100vw-24px))] rounded-2xl border border-white/10 bg-[#141a2b]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-md sm:top-16 sm:right-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">Share {selected ? selected.name : 'this view'}</p>
            <button
              type="button"
              onClick={() => setShareOpen(false)}
              className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="Close share sheet"
            >
              <Icon path={ICONS.close} />
            </button>
          </div>
          <div className="mb-3 truncate rounded-lg bg-black/30 px-3 py-2 font-mono text-[11px] text-white/60">
            {shareUrl}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <button type="button" onClick={copyLink} className="iba-share-btn">
              <Icon path={ICONS.link} /> Copy link
            </button>
            {canNativeShare ? (
              <button type="button" onClick={nativeShare} className="iba-share-btn">
                <Icon path={ICONS.share} /> Share…
              </button>
            ) : (
              <a
                className="iba-share-btn"
                target="_blank"
                rel="noreferrer"
                href={`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareUrl)}`}
              >
                Email
              </a>
            )}
            <a
              className="iba-share-btn"
              target="_blank"
              rel="noreferrer"
              href={`https://x.com/intent/post?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`}
            >
              X
            </a>
            <a
              className="iba-share-btn"
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(`${shareTitle} ${shareUrl}`)}`}
            >
              WhatsApp
            </a>
          </div>
        </div>
      )}

      {/* About */}
      {aboutOpen && (
        <div className="absolute top-28 right-3 z-[950] w-[min(380px,calc(100vw-24px))] rounded-2xl border border-white/10 bg-[#141a2b]/95 p-5 text-sm leading-relaxed text-white/75 shadow-2xl shadow-black/50 backdrop-blur-md sm:top-16 sm:right-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-serif text-base text-white">About this map</p>
            <button
              type="button"
              onClick={() => setAboutOpen(false)}
              className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="Close about"
            >
              <Icon path={ICONS.close} />
            </button>
          </div>
          <p>
            Every building in the city of Buenos Aires, drawn as isometric pixel art. Footprints and
            heights come from the city&apos;s open cadastre, streets, parks and water from
            OpenStreetMap, and the trees from the city&apos;s street tree census.
          </p>
          <p className="mt-2">
            A small software rasterizer turns that data into tiles, so there is no AI in the pixels.
            Inspired by{' '}
            <a
              href="https://isometricsf.com/"
              target="_blank"
              rel="noreferrer"
              className="text-sky-300 underline-offset-2 hover:underline"
            >
              isometric.nyc and isometricsf.com
            </a>
            .
          </p>
          <p className="mt-3 font-mono text-[11px] text-white/45">
            / search · R random · drag to pan · scroll or pinch to zoom · +/− zoom · double-click to
            zoom in
          </p>
        </div>
      )}

      {/* Selected place card */}
      {selected && (
        <div className="absolute bottom-10 left-3 z-[900] w-[min(360px,calc(100vw-24px))] rounded-2xl border border-white/10 bg-[#141a2b]/90 p-4 shadow-2xl shadow-black/40 backdrop-blur-md sm:left-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[0.2em] text-sky-300/80 uppercase">
                {kindLabel(selected.kind)}
              </p>
              <h2 className="mt-0.5 truncate font-serif text-xl text-white">{selected.name}</h2>
              {selected.desc && <p className="mt-1 text-sm text-white/65">{selected.desc}</p>}
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <Icon path={ICONS.close} />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={openShare} className="iba-share-btn">
              <Icon path={ICONS.share} /> Share
            </button>
            <button type="button" onClick={goRandom} className="iba-share-btn">
              <Icon path={ICONS.dice} /> Another
            </button>
          </div>
        </div>
      )}

      {/* Hint */}
      <div
        className={`pointer-events-none absolute bottom-10 left-1/2 z-[800] -translate-x-1/2 rounded-full border border-white/10 bg-[#141a2b]/80 px-4 py-2 font-mono text-[11px] whitespace-nowrap text-white/70 backdrop-blur-md transition-opacity duration-700 ${
          hintVisible && ready && !selected ? 'opacity-100' : 'opacity-0'
        }`}
      >
        Drag to explore · scroll or pinch to zoom · <span className="text-white">/</span> search ·{' '}
        <span className="text-white">R</span> random
      </div>

      {/* Zoom */}
      <div className="absolute right-3 bottom-10 z-[900] flex flex-col gap-2 sm:right-4">
        <button
          type="button"
          className={`${btn} w-10 px-0 disabled:cursor-default disabled:opacity-40`}
          onClick={() => zoomBy(1)}
          disabled={atMaxZoom}
          aria-label="Zoom in"
          title="Zoom in (+)"
        >
          <Icon path={ICONS.plus} />
        </button>
        <button
          type="button"
          className={`${btn} w-10 px-0 disabled:cursor-default disabled:opacity-40`}
          onClick={() => zoomBy(-1)}
          disabled={atMinZoom}
          aria-label="Zoom out"
          title="Zoom out (−)"
        >
          <Icon path={ICONS.minus} />
        </button>
      </div>

      {/* Attribution */}
      <div className="absolute right-3 bottom-2 z-[900] max-w-[calc(100vw-24px)] truncate text-right text-[10px] text-white/45 sm:right-4">
        Data ©{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="hover:text-white/80"
        >
          OpenStreetMap contributors
        </a>{' '}
        ·{' '}
        <a
          href="https://data.buenosaires.gob.ar/"
          target="_blank"
          rel="noreferrer"
          className="hover:text-white/80"
        >
          BA Data (GCBA)
        </a>{' '}
        · Rendered by{' '}
        <Link href="/" className="hover:text-white/80">
          Marcelo Carmona
        </Link>
      </div>

      {toast && (
        <div
          role="status"
          className="absolute bottom-24 left-1/2 z-[1100] -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium text-[#0d1220] shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
