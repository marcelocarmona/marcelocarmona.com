import HowIWorkPage from '../../../_shared/HowIWorkPage'
import { localizedMetadata } from '@/lib/metadata'

export const metadata = localizedMetadata({ kind: 'howIWork', locale: 'es' })

export default function SpanishHowIWorkPage() {
  return <HowIWorkPage locale="es" />
}
