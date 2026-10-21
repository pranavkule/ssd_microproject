import {
  MonitorSmartphone,
  Gauge,
  Scale,
  Route,
  Boxes,
  Database,
  DatabaseZap,
  ListTodo,
  PanelTop,
  Settings2,
  KeyRound,
} from 'lucide-react'
import type { ComponentType } from '../domain/types'

export const COMPONENT_ICONS: Record<ComponentType, typeof Gauge> = {
  client: MonitorSmartphone,
  rateLimiter: Gauge,
  loadBalancer: Scale,
  gateway: Route,
  service: Boxes,
  database: Database,
  cache: DatabaseZap,
  queue: ListTodo,
  sidecar: PanelTop,
  configStore: Settings2,
  secretManager: KeyRound,
}
