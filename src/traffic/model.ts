// Shapes of the traffic-light report. Produced by traffic_light() (migration 0065) and
// mirrored here; the TS rules in ./rules.ts exist for unit tests and client recoloring,
// never as a second source of the board's colors.

export type Color = 'gray' | 'red' | 'amber' | 'green' | 'na'
export type AxisKey = 'time' | 'supply' | 'client' | 'crew' | 'issues'
export const AXES: AxisKey[] = ['time', 'supply', 'client', 'crew', 'issues']

const RANK: Record<Color, number> = { gray: 4, red: 3, amber: 2, green: 1, na: 0 }
export const rank = (c: Color): number => RANK[c] ?? 0
export function worst(...cs: Color[]): Color {
  let out: Color = 'na'
  for (const c of cs) if (rank(c) > rank(out)) out = c
  return out
}

export interface Settings {
  time_amber_days: number
  time_red_days: number
  lookahead_days: number
  supply_red_window_days: number
  supply_eta_margin_days: number
  crew_green_pct: number
  crew_red_pct: number
  crew_window_days: number
  issue_open_days: number
  issue_block_resolve_days: number
  gray_missing_workdays: number
  gray_gantt_days: number
  client_window_days: number
}

export const DEFAULT_SETTINGS: Settings = {
  time_amber_days: 7, time_red_days: 30, lookahead_days: 42,
  supply_red_window_days: 21, supply_eta_margin_days: 5,
  crew_green_pct: 90, crew_red_pct: 70, crew_window_days: 7,
  issue_open_days: 7, issue_block_resolve_days: 14,
  gray_missing_workdays: 2, gray_gantt_days: 14,
  client_window_days: 14,
}

export interface AxisResult {
  color: Color
  reason: string
  missing_data?: boolean
  evidence?: Record<string, unknown>
}

export interface ProjectLight {
  project_id: string
  name: string
  manager: string | null
  project_type: string
  color: Color
  gray_reason: string | null
  axes: Record<AxisKey, AxisResult>
  due: { contract: string | null; forecast: string | null; delta_days: number | null }
  last_entry_on: string | null
  gantt_imported_at: string | null
  action_line: string
}

/** Board order: red, gray, amber, green (spec 8.1), then name. */
const BOARD_ORDER: Record<Color, number> = { red: 0, gray: 1, amber: 2, green: 3, na: 4 }
export const sortForBoard = (a: ProjectLight, b: ProjectLight): number =>
  BOARD_ORDER[a.color] - BOARD_ORDER[b.color] || a.name.localeCompare(b.name)

export const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86_400_000)
export const todayIso = (): string => new Date().toISOString().slice(0, 10)
