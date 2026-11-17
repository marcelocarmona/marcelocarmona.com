import { always, eventually } from '@antithesishq/bombadil'
import { extract } from '@antithesishq/bombadil/browser'

// Non-HTML responses (like the /<post>.md Markdown views) have no <title>.
const isHtml = extract((state) => state.document.contentType === 'text/html')
const title = extract((state) => state.document.title.trim())

// During client-side navigation Next.js removes the old <title> before inserting
// the new one (~10ms with no title), so allow a short gap.
export const hasDocumentTitle = always(
  eventually(() => !isHtml.current || title.current !== '').within(1, 'seconds')
)
