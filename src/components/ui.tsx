import type { ReactNode } from 'react'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md'

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  title?: string
  active?: boolean
  className?: string
}

export function Button({ children, onClick, variant = 'secondary', size = 'md', disabled, title, active, className }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors select-none disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
  const sizes = size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-accent-600 text-white hover:bg-accent-700',
    secondary:
      'bg-white text-app-700 border border-app-300 hover:bg-app-50 dark:bg-app-800 dark:text-app-200 dark:border-app-600 dark:hover:bg-app-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-app-600 hover:bg-app-100 dark:text-app-300 dark:hover:bg-app-800',
  }
  const activeCls = active ? 'ring-2 ring-accent-500 bg-accent-50 text-accent-700 dark:bg-app-700 dark:text-accent-100' : ''
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} className={cx(base, sizes, variants[variant], activeCls, className)}>
      {children}
    </button>
  )
}

export function Divider() {
  return <div className="h-5 w-px bg-app-200 dark:bg-app-700" />
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  sub?: string
  tone?: 'neutral' | 'ok' | 'warn' | 'bad'
}) {
  const tones = {
    neutral: 'text-app-900 dark:text-app-50',
    ok: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-red-600 dark:text-red-400',
  }
  return (
    <div className="rounded-lg border border-app-200 bg-white px-3 py-2 dark:border-app-700 dark:bg-app-800">
      <div className="text-[10px] font-medium uppercase tracking-wide text-app-500 dark:text-app-400">{label}</div>
      <div className={cx('mt-0.5 font-mono text-lg font-semibold leading-tight', tones[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-app-400 dark:text-app-500">{sub}</div>}
    </div>
  )
}

export function FieldRow({ label, unit, help, children, error }: { label: string; unit?: string; help?: string; children: ReactNode; error?: string }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-app-700 dark:text-app-300">{label}</span>
        {unit && <span className="font-mono text-[10px] text-app-400">{unit}</span>}
      </div>
      {children}
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : help ? <p className="mt-1 text-[11px] text-app-400">{help}</p> : null}
    </label>
  )
}

export const inputCls =
  'w-full rounded-md border border-app-300 bg-white px-2 py-1.5 text-xs text-app-900 outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 dark:border-app-600 dark:bg-app-900 dark:text-app-100'

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-app-300 dark:text-app-600">{icon}</div>}
      <p className="text-sm font-medium text-app-600 dark:text-app-300">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-app-400">{hint}</p>}
    </div>
  )
}
