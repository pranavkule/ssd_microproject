import type { ReactNode } from 'react'

/**
 * Minimal Markdown renderer for lab content. Supports the subset used in
 * `public/content`: headings, paragraphs, bold/italic/code, unordered and
 * ordered lists, blockquotes and simple tables. Avoids pulling in a dependency
 * and renders through React so it stays XSS-safe.
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'hr' }

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ kind: 'hr' })
      i++
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() })
      i++
      continue
    }
    if (line.startsWith('> ')) {
      const parts: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        parts.push(lines[i].slice(2))
        i++
      }
      blocks.push({ kind: 'quote', text: parts.join(' ') })
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push({ kind: 'list', ordered: false, items })
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocks.push({ kind: 'list', ordered: true, items })
      continue
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
      const header = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]))
        i++
      }
      blocks.push({ kind: 'table', header, rows })
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !/^(\s*[-*]\s+|\s*\d+\.\s+|#{1,6}\s|>\s|\|)/.test(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push({ kind: 'paragraph', text: para.join(' ') })
  }
  return blocks
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

/** Inline formatting: **bold**, *italic*, `code`. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  let idx = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${idx++}`
    if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) nodes.push(<code key={key} className="rounded bg-app-100 px-1 py-0.5 font-mono text-[0.9em] dark:bg-app-800">{token.slice(1, -1)}</code>)
    else nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source)
  return (
    <div className="space-y-3 text-sm leading-relaxed text-app-700 dark:text-app-200">
      {blocks.map((b, bi) => {
        switch (b.kind) {
          case 'heading': {
            const sizes = ['text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-xs']
            return (
              <h2 key={bi} className={`mt-4 font-semibold text-app-900 first:mt-0 dark:text-app-50 ${sizes[b.level - 1]}`}>
                {inline(b.text, `h${bi}`)}
              </h2>
            )
          }
          case 'paragraph':
            return <p key={bi}>{inline(b.text, `p${bi}`)}</p>
          case 'list':
            return b.ordered ? (
              <ol key={bi} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, ii) => (
                  <li key={ii}>{inline(it, `oli${bi}-${ii}`)}</li>
                ))}
              </ol>
            ) : (
              <ul key={bi} className="list-disc space-y-1 pl-5">
                {b.items.map((it, ii) => (
                  <li key={ii}>{inline(it, `uli${bi}-${ii}`)}</li>
                ))}
              </ul>
            )
          case 'quote':
            return (
              <blockquote key={bi} className="border-l-4 border-accent-300 pl-3 text-app-600 italic dark:border-accent-700 dark:text-app-300">
                {inline(b.text, `q${bi}`)}
              </blockquote>
            )
          case 'table':
            return (
              <div key={bi} className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-app-200 dark:border-app-700">
                      {b.header.map((h, hi) => (
                        <th key={hi} className="px-2 py-1.5 font-semibold text-app-700 dark:text-app-200">
                          {inline(h, `th${bi}-${hi}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-app-100 dark:border-app-800">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-2 py-1.5 text-app-600 dark:text-app-300">
                            {inline(cell, `td${bi}-${ri}-${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'hr':
            return <hr key={bi} className="border-app-200 dark:border-app-700" />
        }
      })}
    </div>
  )
}
