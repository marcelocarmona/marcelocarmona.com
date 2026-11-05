import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/inter-tight'
import '@fontsource-variable/spline-sans-mono'
import '@/css/app.css'
import './isometric-ba.css'

import { SpeedInsights } from '@vercel/speed-insights/next'

import SeoSchema from '@/components/SeoSchema'
import siteMetadata from '@/data/siteMetadata'
import type { ChildrenProps } from '@/types/next'
import type { Viewport } from 'next'
import Providers from '../providers'

const description =
  'Every building in Buenos Aires drawn as isometric pixel art. Search barrios, landmarks and streets, or jump to a random corner of the city.'

export const metadata = {
  metadataBase: new URL(siteMetadata.siteUrl),
  title: {
    default: 'Isometric Buenos Aires',
    template: `%s - ${siteMetadata.author}`,
  },
  description,
  alternates: {
    canonical: '/isometric-buenos-aires',
  },
  icons: {
    icon: [
      { url: '/static/favicons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/static/favicons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/static/favicons/favicon.ico' },
    ],
    apple: [{ url: '/static/favicons/apple-touch-icon.png', sizes: '76x76' }],
    other: [{ rel: 'mask-icon', url: '/static/favicons/safari-pinned-tab.svg', color: '#111111' }],
  },
  manifest: '/static/favicons/site.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#0d1220',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function IsometricBuenosAiresRootLayout({ children }: ChildrenProps) {
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${siteMetadata.siteUrl}/isometric-buenos-aires#app`,
        url: `${siteMetadata.siteUrl}/isometric-buenos-aires`,
        name: 'Isometric Buenos Aires',
        description,
        applicationCategory: 'Map',
        inLanguage: 'en-US',
        creator: {
          '@id': `${siteMetadata.siteUrl}/#person`,
        },
      },
      {
        '@type': 'Person',
        '@id': `${siteMetadata.siteUrl}/#person`,
        name: siteMetadata.author,
        url: siteMetadata.siteUrl,
      },
    ],
  }

  return (
    <html lang="en" className="h-full bg-[#0d1220]" suppressHydrationWarning>
      <body
        className="h-full overflow-hidden bg-[#0d1220] text-white antialiased selection:bg-sky-300 selection:text-[#0d1220]"
        suppressHydrationWarning
      >
        <SeoSchema data={websiteSchema} />
        <Providers>
          <main className="h-full">{children}</main>
        </Providers>
        {process.env.NODE_ENV === 'production' && siteMetadata.analytics.vercelSpeedInsights && (
          <SpeedInsights />
        )}
      </body>
    </html>
  )
}
