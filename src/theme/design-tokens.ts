/**
 * Single source of truth for site branding, navigation and shared visual tokens.
 *
 * Everything brand-related (product name, tagline, lab labels, nav links, colors
 * and fonts) lives here so the simulator can be embedded in the wider SSD Lab
 * site without scattering strings across components.
 */

export const site = {
  /** Short product name shown in the simulator top bar. */
  productName: 'SSD Lab',
  /** Full site name used in the lab navbar / document title. */
  siteName: 'SSD Lab — System Design Studio',
  /** Simulator sub-title under the product name. */
  productTagline: 'Dynamic L7 Gateway Simulator',
  /** One-line description used for meta tags and the lab header. */
  description:
    'Interactive, browser-based system design labs with a deterministic distributed-systems simulator. Build an architecture, run it, break it and watch it recover.',
  /** Root path of the shared site (relative-safe for iframe + sub-path hosting). */
  basePath: '',
} as const

export interface LabTab {
  id: string
  label: string
  /** Optional short label for narrow viewports. */
  short?: string
}

/** Navbar links for the shared site. */
export const NAV_LINKS: { label: string; href: string }[] = [
  { label: 'Home', href: '#/' },
  { label: 'Labs', href: '#/labs' },
  { label: 'References', href: '#/labs/ssd/references' },
]

/**
 * Tabs inside the SSD lab page. `simulation` is the built-in simulator.
 * `overview` is intentionally not a top-level tab: it lives in the results
 * panel, so the two "Overview" meanings never collide.
 */
export const LAB_TABS: LabTab[] = [
  { id: 'aim', label: 'Aim', short: 'Aim' },
  { id: 'theory', label: 'Theory', short: 'Theory' },
  { id: 'simulation', label: 'Simulation', short: 'Sim' },
  { id: 'tasks', label: 'Tasks', short: 'Tasks' },
  { id: 'quiz', label: 'Quiz', short: 'Quiz' },
  { id: 'references', label: 'References', short: 'Refs' },
]

export const LAB = {
  id: 'ssd',
  label: 'System Design & Scaling',
  shortLabel: 'SSD',
  /** Path prefix for the lab, kept as plain string for the lightweight router. */
  path: '/labs/ssd',
} as const

/**
 * Brand palette + typography tokens. Mirrors the Tailwind theme defined in
 * `src/index.css` (app-* neutral scale + accent-* brand color). Kept here so
 * non-Tailwind surfaces (canvas, site shell, embedded widgets) can read them.
 */
export const tokens = {
  colors: {
    brand: '#2563eb',
    brandSoft: '#eff6ff',
    brandStrong: '#1d4ed8',
    neutral: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
  },
  fonts: {
    sans: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "ui-monospace, 'SFMono-Regular', 'Cascadia Mono', Menlo, Consolas, monospace",
  },
} as const

export type BrandTokens = typeof tokens
