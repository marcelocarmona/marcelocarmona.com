import rehypeKatex from 'rehype-katex'
import { describe, expect, it } from 'vitest'

describe('math rendering', () => {
  it('renders inline math through the pinned KaTeX override', () => {
    const tree: any = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: { className: ['language-math', 'math-inline'] },
          children: [{ type: 'text', value: 'E=mc^2' }],
        },
      ],
    }

    rehypeKatex()(tree, {} as any)

    expect(JSON.stringify(tree)).toContain('katex')
    expect(JSON.stringify(tree)).toContain('MathML')
  })
})
