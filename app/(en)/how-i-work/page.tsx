import HowIWorkPage from '../../_shared/HowIWorkPage'
import { localizedMetadata } from '@/lib/metadata'

export const metadata = localizedMetadata({ kind: 'howIWork', locale: 'en' })

export default function EnglishHowIWorkPage() {
  return <HowIWorkPage locale="en" />
}
