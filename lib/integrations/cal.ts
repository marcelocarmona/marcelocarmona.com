const CAL_SCRIPT_SRC = 'https://app.cal.com/embed/embed.js'
const CAL_ORIGIN = 'https://cal.com'
const CAL_INIT_ACTION = 'init'

type CalApi = {
  (...args: any[]): void
  loaded?: boolean
  ns?: Record<string, CalApi>
  q: Array<IArguments | any[]>
}

interface MountCalInlineOptions {
  calLink: string
  elementOrSelector: string | HTMLElement
  layout?: string
  theme?: string
  hideEventTypeDetails?: boolean
  onReady?: () => void
  onBookingSuccess?: () => void
}

export function normalizeCalLink(calUrl?: string | null): string {
  if (!calUrl) {
    return ''
  }

  try {
    const parsedUrl = new URL(calUrl)
    return parsedUrl.pathname.replace(/^\/+|\/+$/g, '')
  } catch {
    return calUrl.replace(/^https?:\/\/(www\.)?cal\.com\//i, '').replace(/^\/+|\/+$/g, '')
  }
}

function ensureCalLoader(): CalApi | null {
  if (typeof window === 'undefined') {
    return null
  }

  if (typeof window.Cal === 'function') {
    return window.Cal
  }

  ;((C: Window, A: string, L: string) => {
    const queuePush = (api: CalApi, args: IArguments | any[]) => {
      api.q.push(args)
    }

    const d = C.document
    C.Cal =
      C.Cal ||
      function (this: unknown) {
        const cal = C.Cal as CalApi
        const args = arguments

        if (!cal.loaded) {
          cal.ns = {}
          cal.q = cal.q || []

          const scriptElement = d.createElement('script')
          scriptElement.src = A
          scriptElement.async = true
          d.head.appendChild(scriptElement)
          cal.loaded = true
        }

        if (args[0] === L) {
          const api: CalApi = function () {
            queuePush(api, arguments)
          } as CalApi
          const namespace = args[1]
          api.q = api.q || []

          if (typeof namespace === 'string') {
            cal.ns = cal.ns || {}
            cal.ns[namespace] = cal.ns[namespace] || api
            queuePush(cal.ns[namespace], args)
            queuePush(cal, ['initNamespace', namespace])
          } else {
            queuePush(cal, args)
          }
          return
        }

        queuePush(cal, args)
      }
  })(window, CAL_SCRIPT_SRC, CAL_INIT_ACTION)

  return window.Cal
}

let calEmbedPromise: Promise<CalApi> | null = null

// Resolves once embed.js has run. Calls made after that execute immediately instead of
// being queued, so callers can check the DOM is still there before mounting.
export function loadCalEmbed(): Promise<CalApi> {
  const Cal = ensureCalLoader()
  if (!Cal) {
    return Promise.reject(new Error('Cal embed loader unavailable'))
  }

  if ((Cal as CalApi & { instance?: unknown }).instance) {
    return Promise.resolve(Cal)
  }

  if (!calEmbedPromise) {
    calEmbedPromise = new Promise<CalApi>((resolve, reject) => {
      Cal.q = Cal.q || []
      Cal.ns = Cal.ns || {}

      const script = document.createElement('script')
      script.src = CAL_SCRIPT_SRC
      script.async = true
      script.addEventListener('load', () => resolve(Cal), { once: true })
      script.addEventListener(
        'error',
        () => {
          calEmbedPromise = null
          script.remove()
          Cal.loaded = false
          reject(new Error('Cal embed script failed to load'))
        },
        { once: true }
      )
      // Stops the queue stub from injecting a second copy of embed.js.
      Cal.loaded = true
      document.head.appendChild(script)
    })
  }

  return calEmbedPromise
}

export function mountCalInline({
  calLink,
  elementOrSelector,
  layout = 'month_view',
  theme = 'auto',
  hideEventTypeDetails = false,
  onReady,
  onBookingSuccess,
}: MountCalInlineOptions): CalApi {
  const Cal = ensureCalLoader()
  if (!Cal || typeof Cal !== 'function') {
    throw new Error('Cal embed loader unavailable')
  }

  Cal('init', { origin: CAL_ORIGIN })
  Cal('inline', {
    calLink,
    elementOrSelector,
    config: {
      layout,
    },
  })
  Cal('ui', {
    hideEventTypeDetails,
    layout,
    theme,
  })

  if (typeof onReady === 'function') {
    Cal('on', {
      action: 'bookerReady',
      callback: onReady,
    })
  }

  if (typeof onBookingSuccess === 'function') {
    Cal('on', {
      action: 'bookingSuccessfulV2',
      callback: onBookingSuccess,
    })
  }

  return Cal
}
