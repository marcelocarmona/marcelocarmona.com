import { absoluteUrl, localizedMetadata } from '@/lib/metadata'
import type { Metadata } from 'next'
import IsometricBuenosAires from '../_components/IsometricBuenosAires'

const title = 'Isometric Buenos Aires'
const description =
  'Every building in Buenos Aires drawn as isometric pixel art. Search barrios, landmarks and streets, or jump to a random corner of the city.'

const base = localizedMetadata({
  kind: 'standalone',
  path: '/isometric-buenos-aires',
  title,
  description,
})
const image = {
  url: absoluteUrl('/isometric-buenos-aires/og.jpg'),
  width: 1200,
  height: 630,
  alt: 'Isometric pixel-art view of central Buenos Aires around the Obelisco',
}

// Use the map's own preview image instead of the site-wide banner.
export const metadata: Metadata = {
  ...base,
  openGraph: { ...base.openGraph, images: [image] },
  twitter: { ...base.twitter, images: [image.url] },
}

export default function IsometricBuenosAiresPage() {
  return <IsometricBuenosAires />
}
