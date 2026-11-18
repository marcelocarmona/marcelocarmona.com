import generateRss from '@/lib/generate-rss'
import { getAllFilesFrontMatter } from '@/lib/mdx'
import kebabCase from '@/lib/utils/kebabCase'
import type { TagPageProps } from '@/types/next'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: TagPageProps) {
  const [{ tag }, allPosts] = await Promise.all([
    params,
    getAllFilesFrontMatter('blog', { locale: 'en' }),
  ])
  const posts = allPosts.filter((post) =>
    (post.tags || []).some((postTag) => kebabCase(postTag) === tag)
  )
  const rss = generateRss(posts, `tags/${tag}/feed.xml`)

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  })
}
