import { NAV_LINKS, site, LAB } from '../theme/design-tokens'
import { cx } from '../components/ui'
import { Layers, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { navigate } from '../router/router'

export function SiteNavbar({ activeTab }: { activeTab: string }) {
  const [open, setOpen] = useState(false)

  const go = (href: string): void => {
    // NAV_LINKS use hash hrefs like '#/labs/ssd/references'
    if (href.startsWith('#/')) navigate(href.slice(1))
    else navigate(href)
    setOpen(false)
  }

  return (
    <header className="border-b border-app-200 bg-white dark:border-app-800 dark:bg-app-900">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <button type="button" onClick={() => go('#/')} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-600 text-white">
            <Layers size={15} />
          </span>
          <span className="leading-tight text-left">
            <span className="block text-sm font-semibold text-app-900 dark:text-app-50">{site.siteName}</span>
            <span className="block text-[10px] text-app-400">{LAB.label}</span>
          </span>
        </button>

        <nav className="ml-auto hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((l) => {
            const active = isNavLinkActive(l.href, activeTab)
            return (
              <button
                key={l.href}
                type="button"
                onClick={() => go(l.href)}
                className={cx(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'bg-accent-50 text-accent-700 dark:bg-app-800 dark:text-accent-300'
                    : 'text-app-600 hover:bg-app-100 hover:text-app-900 dark:text-app-300 dark:hover:bg-app-800 dark:hover:text-app-50',
                )}
              >
                {l.label}
              </button>
            )
          })}
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-md p-1.5 text-app-500 hover:bg-app-100 dark:hover:bg-app-800 sm:hidden"
          aria-label="Toggle navigation"
        >
          {open ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-app-100 px-4 py-2 sm:hidden dark:border-app-800">
          {NAV_LINKS.map((l) => {
            const active = isNavLinkActive(l.href, activeTab)
            return (
              <button
                key={l.href}
                type="button"
                onClick={() => go(l.href)}
                className={cx(
                  'block w-full rounded-md px-2 py-1.5 text-left text-sm',
                  active ? 'bg-accent-50 font-medium text-accent-700 dark:bg-app-800 dark:text-accent-300' : 'text-app-600 dark:text-app-300',
                )}
              >
                {l.label}
              </button>
            )
          })}
        </nav>
      )}
    </header>
  )
}

/** Highlight the nav item whose destination matches the active lab tab. */
function isNavLinkActive(href: string, activeTab: string): boolean {
  if (href === '#/') return activeTab === 'home'
  if (href === '#/labs') return activeTab === 'labs'
  if (href.startsWith('#/labs/ssd/')) {
    const target = href.split('/').pop()
    return activeTab === target
  }
  return false
}
