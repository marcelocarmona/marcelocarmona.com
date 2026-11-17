import { always } from '@antithesishq/bombadil'
import { extract } from '@antithesishq/bombadil/browser'

const title = extract((state) => state.document.title.trim())

export const hasDocumentTitle = always(() => title.current !== '')
