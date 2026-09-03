import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync('supabase/migrations/0065_traffic_light_fn.sql', 'utf8')

describe('0065 traffic_light()', () => {
  it('guards the RPC with can_view(traffic_light) and exposes it to authenticated only', () => {
    expect(SQL).toMatch(/can_view\('traffic_light'\)/)
    expect(SQL).toContain("grant execute on function traffic_light(uuid) to authenticated")
    expect(SQL).toContain('revoke all on function traffic_light(uuid) from public')
  })
  it('keeps the helpers and the weekly job away from browser callers', () => {
    for (const fn of ['tl_project(projects, traffic_light_settings, date)', 'tl_time(projects, traffic_light_settings, date)',
      'tl_supply(projects, traffic_light_settings, date)', 'tl_crew(projects, traffic_light_settings, date)',
      'tl_issues(projects, traffic_light_settings, date)', 'tl_gray(projects, traffic_light_settings, date)', 'traffic_light_weekly()']) {
      expect(SQL, fn).toContain(`revoke execute on function ${fn} from anon, authenticated`)
    }
  })
  it('schedules the Sunday job once', () => {
    expect(SQL).toContain("cron.schedule('traffic-light-weekly', '0 4 * * 0'")
    expect(SQL).toContain("where not exists (select 1 from cron.job where jobname = 'traffic-light-weekly')")
  })
  it('normalizes names the same way as normName()', () => {
    expect(SQL).toMatch(/regexp_replace\(.*'\[׳״''"\]'.*'g'\)/)
  })
})
