import { useEffect, useState } from 'react'
import { loadTabJson } from '../content/loader'
import { EmptyState } from '../components/ui'
import { BookOpen } from 'lucide-react'

interface ReferencesDoc {
  title: string
  groups: { heading: string; items: { title: string; detail: string }[] }[]
}

export function ReferencesPanel() {
  const [doc, setDoc] = useState<ReferencesDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await loadTabJson<ReferencesDoc>('references')
        if (!cancelled) setDoc(d)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <EmptyState icon={<BookOpen size={30} />} title="Could not load references" hint={error} />
  if (!doc) return null

  return (
    <div className="thin-scroll h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-app-900 dark:text-app-50">{doc.title}</h1>
          <p className="text-xs text-app-500 dark:text-app-400">Background material for this case study.</p>
        </div>
        {doc.groups.map((g) => (
          <section key={g.heading}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-accent-600 dark:text-accent-400">{g.heading}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.items.map((it) => (
                <li key={it.title} className="rounded-lg border border-app-200 bg-white p-3 dark:border-app-700 dark:bg-app-800">
                  <div className="text-sm font-medium text-app-800 dark:text-app-100">{it.title}</div>
                  <div className="mt-0.5 text-xs text-app-500 dark:text-app-400">{it.detail}</div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
