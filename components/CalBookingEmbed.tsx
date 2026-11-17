'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import siteMetadata from '@/data/siteMetadata'
import { logEvent } from '@/components/analytics/GoogleAnalytics'
import Link from '@/components/Link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { loadCalEmbed, mountCalInline, normalizeCalLink } from '@/lib/integrations/cal'

export default function CalBookingEmbed({ calUrl = siteMetadata.calCom }: { calUrl?: string }) {
  const [hasEmbedError, setHasEmbedError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hostedCalUrl = calUrl || siteMetadata.calCom || 'https://cal.com'

  const calLink = useMemo(() => normalizeCalLink(hostedCalUrl), [hostedCalUrl])

  useEffect(() => {
    if (!calLink) {
      return
    }

    let cancelled = false
    setHasEmbedError(false)

    // Mount only after embed.js has loaded; if the user already left the page,
    // there is no container and a queued inline() call would throw inside Cal.
    loadCalEmbed()
      .then(() => {
        const container = containerRef.current
        if (cancelled || !container) {
          return
        }

        mountCalInline({
          calLink,
          elementOrSelector: container,
          layout: 'month_view',
          theme: 'auto',
          onReady: () => {
            logEvent('cal_embed_ready', 'cal.com', calLink)
          },
          onBookingSuccess: () => {
            logEvent('cal_booking_success', 'cal.com', calLink, 1)
          },
        })
        logEvent('cal_embed_loaded', 'cal.com', calLink)
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setHasEmbedError(true)
        logEvent('cal_embed_error', 'cal.com', calLink)
      })

    return () => {
      cancelled = true
    }
  }, [calLink])

  const showFallback = hasEmbedError || !calLink

  return (
    <section className="flex flex-col gap-4">
      <div ref={containerRef} className="w-full overflow-hidden" />

      <p className="text-sm text-muted-foreground">
        Prefer the hosted page?{' '}
        <Link
          href={hostedCalUrl}
          className="text-primary underline-offset-4 hover:underline"
          onClick={() => logEvent('cal_fallback_click', 'cal.com', calLink)}
        >
          Open {hostedCalUrl.replace(/^https?:\/\//, '')}
        </Link>
        .
      </p>

      {showFallback && (
        <Alert>
          <AlertDescription>
            The inline scheduler could not load in this browser. Use the hosted booking link above.
          </AlertDescription>
        </Alert>
      )}
    </section>
  )
}
