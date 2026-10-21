import { useEffect } from 'react'
import { useApp } from './state/store'
import { readShareUrl, clearShareParam } from './persistence/shareUrl'
import { CaseStudyProvider } from './content/CaseStudyProvider'
import { LabShell, HomeLanding } from './labs/LabShell'
import { LAB } from './theme/design-tokens'
import { segments, useRoute } from './router/router'

function isLabRoute(path: string): boolean {
  const parts = segments(path)
  if (parts[0] !== 'labs') return false
  // /labs and /labs/ssd* both render the lab (SSD is the only lab for now).
  return true
}

export default function App() {
  const theme = useApp((s) => s.theme)
  const route = useRoute()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    const shared = readShareUrl()
    if (shared) {
      useApp.getState().setArchitecture(shared, { resetHistory: true })
      useApp.getState().setToast({ kind: 'success', message: `Loaded shared scenario "${shared.name}".` })
      clearShareParam()
    }
  }, [])

  useEffect(() => {
    document.title = `${LAB.shortLabel} Lab · System Design Studio`
  }, [])

  return (
    <CaseStudyProvider>
      <div className="h-full overflow-hidden">
        {isLabRoute(route) ? <LabShell /> : <HomeLanding />}
      </div>
    </CaseStudyProvider>
  )
}
