import type * as Leaflet from 'leaflet'

import { tileZoomFor } from './zoom'

/** Private GridLayer methods overridden below. Re-check these when upgrading Leaflet. */
type GridLayerInternals = {
  _setView(center: Leaflet.LatLng, zoom: number, noPrune?: boolean, noUpdate?: boolean): void
  _clampZoom(zoom: number): number
}

/**
 * Tile layer that skips network requests for tiles the render never produced (river, outside the
 * city), and picks tile levels so pixel art is only ever scaled up, never down (see tileLodBias).
 */
export function createSparseTileLayer(L: typeof Leaflet, tileSet: Set<string>, lodBias: number) {
  const base = L.TileLayer.prototype as unknown as GridLayerInternals
  return class SparseTileLayer extends L.TileLayer {
    // Leaflet rounds the zoom before calling _clampZoom, but the tile level must be
    // floor(zoom + bias), so the exact zoom is stashed for the duration of _setView.
    private viewZoom: number | undefined

    createTile(coords: Leaflet.Coords, done: Leaflet.DoneCallback): HTMLElement {
      if (!tileSet.has(`${coords.z}/${coords.x}/${coords.y}`)) {
        const empty = document.createElement('div')
        window.setTimeout(() => done(undefined, empty), 0)
        return empty
      }
      return super.createTile(coords, done)
    }

    _setView(center: Leaflet.LatLng, zoom: number, noPrune?: boolean, noUpdate?: boolean) {
      this.viewZoom = zoom
      try {
        base._setView.call(this, center, zoom, noPrune, noUpdate)
      } finally {
        this.viewZoom = undefined
      }
    }

    // Outside _setView (e.g. _update, redraw) Leaflet passes the exact map zoom.
    _clampZoom(zoom: number): number {
      return base._clampZoom.call(this, tileZoomFor(this.viewZoom ?? zoom, lodBias))
    }
  }
}
