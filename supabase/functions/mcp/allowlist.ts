// Read allowlist for the Claude connector. Every tool selects NAMED columns from NAMED tables, so
// what Claude can see is decided here, in code, not by trusting the model or the query it writes.
//
// Privacy rule: a leaked phone number, e-mail address, signature stroke or chat line reaches a
// third-party model and cannot be recalled. So the list is an allowlist (a column is absent until
// someone adds it on purpose) and DENIED_COLUMN is a second, independent net that a test runs
// over every entry. Signer and receiver NAMES are fine; the signature images never are.
//
// Deno-safe on purpose: no imports. PermArea is copied from src/lib/perms.ts; keep it in step.

export type PermArea =
  | 'dashboard' | 'logbook' | 'calendar' | 'search' | 'projects' | 'export'
  | 'defects' | 'form_builder' | 'coops_manage' | 'alert_rules' | 'gantt' | 'control_center'
  | 'safety' | 'handover' | 'traffic_light' | 'deliveries' | 'claude'

/** `area` is the permission area whose RLS select policy gates the table; null = any org member. */
export const READ: Record<string, { area: PermArea | null; columns: string[] }> = {
  // People: display name and role only. No email, no avatar, no auth data.
  profiles: { area: null, columns: ['id', 'name', 'role'] },

  // Projects
  projects: {
    area: null,
    columns: [
      'id', 'name', 'active', 'created_at', 'location', 'budget', 'pmo', 'start_date', 'end_date',
      'staff', 'notes', 'priority', 'contract_due_date', 'project_type',
    ],
  },
  project_assignments: { area: null, columns: ['project_id', 'user_id', 'is_manager'] },
  project_contractors: {
    area: null,
    columns: ['id', 'project_id', 'name', 'agreed_workers', 'critical', 'active', 'created_at'],
  },
  project_priorities: { area: null, columns: ['user_id', 'project_id', 'priority'] },

  // Diary (entry_photos is deliberately absent: photos are counted via the entries embed)
  // MANDATORY: `values` holds diary form answers, including phone-typed fields. Every row's
  // values must go through scrubEntryValues() before it leaves the function.
  entries: {
    area: 'logbook',
    columns: ['id', 'project_id', 'created_by', 'work_date', 'created_at', 'last_sent_at', 'values'],
  },
  field_definitions: {
    area: null,
    columns: ['id', 'key', 'label_he', 'label_en', 'type', 'required', 'options', 'sort_order', 'active'],
  },
  work_tasks: {
    area: null,
    columns: [
      'id', 'title', 'notes', 'project_id', 'due_date', 'status', 'created_by', 'created_at',
      'done_at', 'source', 'axis', 'closed_by',
    ],
  },

  // Issues and defects
  // area null: RLS (0067) also admits can_edit('deliveries') holders and the issue owner, so an
  // up-front area check would deny someone the app lets in. RLS decides.
  issues: {
    area: null,
    columns: [
      'id', 'project_id', 'seq', 'entry_id', 'opened_on', 'description', 'owner_kind', 'due_date',
      'blocking', 'wbs_template_id', 'systemic', 'closed_on', 'closure_note', 'created_by', 'created_at',
    ],
  },
  coops: {
    area: 'defects',
    columns: [
      'id', 'project_id', 'name', 'coop_type', 'farm_coop_count', 'equipment_supplier', 'has_heating',
      'has_cooling_pads', 'has_tunnel_shutter', 'execution_manager', 'field_supervisor', 'opened_on',
      'created_by', 'created_at',
    ],
  },
  coop_defects: {
    area: 'defects',
    columns: [
      'id', 'coop_id', 'seq', 'gate', 'item_no', 'description', 'severity', 'assignee', 'due_date',
      'status', 'closed_on', 'closure_note', 'created_at',
    ],
  },
  defect_item_overrides: {
    area: null,
    columns: ['gate', 'item_no', 'text', 'active', 'is_custom', 'updated_at'],
  },
  coop_checklist_items: {
    area: 'defects',
    columns: ['coop_id', 'gate', 'item_no', 'status', 'severity', 'note', 'external_by', 'auto_na_reason', 'updated_at'],
  },
  // Signer names and signed_at only: the *_signature_path columns are stroke images.
  coop_concessions: {
    area: 'defects',
    columns: ['id', 'coop_id', 'gate', 'defect_id', 'reason', 'manager_name', 'supervisor_name', 'signed_at'],
  },
  coop_responsibilities: {
    area: 'defects',
    columns: ['coop_id', 'domain_key', 'responsible', 'external_who', 'notes'],
  },

  // Safety. `workers` (id numbers + signature strokes) and `instructor_signature` are left out.
  safety_forms: {
    area: 'safety',
    columns: [
      'id', 'project_id', 'training_date', 'topics', 'instructor_name', 'instructor_qualification',
      'created_by', 'created_at', 'updated_at',
    ],
  },
  safety_topics: { area: null, columns: ['id', 'label', 'sort_order', 'active', 'created_at'] },

  // Schedules. gantt_charts.source_path (a storage path) is left out.
  gantt_charts: {
    area: 'gantt',
    columns: [
      'id', 'project_id', 'name', 'source_file', 'status_date', 'span_start', 'span_finish',
      'imported_by', 'imported_at', 'updated_at', 'active',
    ],
  },
  gantt_tasks: {
    area: 'gantt',
    columns: [
      'id', 'chart_id', 'ext_uid', 'parent_ext_uid', 'sort_order', 'depth', 'wbs', 'name', 'start_ts',
      'finish_ts', 'base_start_ts', 'base_finish_ts', 'duration_days', 'pct', 'milestone', 'is_summary',
      'critical', 'notes', 'resources', 'updated_at', 'alert_on_overrun',
    ],
  },
  gantt_links: {
    area: 'gantt',
    columns: ['id', 'chart_id', 'pred_ext_uid', 'succ_ext_uid', 'kind', 'lag_days'],
  },
  wbs_templates: {
    area: null,
    columns: ['id', 'project_type', 'sort_order', 'name_he', 'name_en', 'critical', 'active'],
  },
  wbs_gantt_aliases: { area: null, columns: ['template_id', 'alias'] },

  // Supplies. gate_items / gate_approval_notices are not here: RLS on them has no policy, so a
  // user-scoped client reads nothing from them.
  project_deliveries: {
    area: null,
    columns: [
      'id', 'project_id', 'item', 'wbs_template_id', 'need_date', 'status', 'eta', 'notes',
      'updated_at', 'updated_by',
    ],
  },

  // Traffic light. snapshots.payload embeds owner_email, and settings.extra_report_emails is a
  // recipient list, so neither is selected.
  traffic_light_snapshots: { area: 'traffic_light', columns: ['id', 'taken_at'] },
  traffic_light_settings: {
    area: null,
    columns: [
      'id', 'time_amber_days', 'time_red_days', 'lookahead_days', 'supply_red_window_days',
      'supply_eta_margin_days', 'crew_green_pct', 'crew_red_pct', 'crew_window_days', 'issue_open_days',
      'issue_block_resolve_days', 'gray_missing_workdays', 'gray_gantt_days', 'updated_at',
      'client_window_days',
    ],
  },
  customer_commitments: {
    area: 'traffic_light',
    columns: [
      'id', 'project_id', 'item', 'kind', 'due_date', 'status', 'confirmation_ref', 'blocking',
      'notice_sent_on', 'notice_ref', 'notes', 'created_at', 'updated_at', 'updated_by',
    ],
  },

  // Handover: signed state is signed_at + receiver_name; receiver_signature is never selected.
  handover_forms: {
    area: 'handover',
    columns: [
      'id', 'project_id', 'handover_date', 'client_name', 'site_location', 'project_nature', 'attendees',
      'systems', 'notes', 'receiver_name', 'receiver_role', 'signed_at', 'created_by', 'created_at',
      'updated_at', 'extra_fields',
    ],
  },
  handover_systems: {
    area: null,
    columns: ['id', 'label', 'sort_order', 'active', 'created_at', 'builtin'],
  },
  handover_extra_fields: {
    area: null,
    columns: ['id', 'label', 'sort_order', 'active', 'builtin', 'created_at'],
  },
}

/** Tables the connector must never read, whatever a tool asks for. */
export const DENIED_TABLES: string[] = [
  'user_messages', 'message_acks', 'chat_groups', 'chat_group_members', 'notifications',
  'push_subscriptions', 'user_prefill', 'user_prefill_locations', 'registration_codes',
  'allowed_emails', 'user_permissions', 'perm_defaults', 'audit_log', 'rate_events',
  'feedback_reports', 'distribution_lists', 'list_recipients', 'report_mail_log', 'overdue_notices',
  'alert_rules', 'alert_rule_tasks', 'alert_rule_fired', 'coop_signatures',
]

/** Second net: a column whose name matches this is private, whatever the table says. */
export const DENIED_COLUMN = /(^|_)(emails?|phone|signature|storage_path|endpoint|avatar_path)($|_)|^code$/

/** Comma-joined select list for a table. Throws for anything not on the allowlist. */
export function cols(table: string): string {
  if (!Object.prototype.hasOwnProperty.call(READ, table)) {
    throw new Error(`table not readable: ${table}`)
  }
  return READ[table].columns.join(',')
}

/** field_definitions.type values whose answers are private (0001_init.sql:26 allows
 *  text, long_text, number, date, phone, select, photo). */
export const PRIVATE_FIELD_TYPES: string[] = ['phone', 'photo']

/** Drop private answers from an entry's `values`. Unknown keys are kept unless the name is denied. */
export function scrubEntryValues(
  values: Record<string, unknown>,
  typeByKey: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values ?? {})) {
    if (DENIED_COLUMN.test(k)) continue
    if (Object.prototype.hasOwnProperty.call(typeByKey, k) && PRIVATE_FIELD_TYPES.includes(typeByKey[k])) continue
    out[k] = v
  }
  return out
}

/** Recursively remove object keys matching DENIED_COLUMN at any depth (for rpc output). */
export function scrubDeep<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => scrubDeep(x)) as unknown as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (!DENIED_COLUMN.test(k)) out[k] = scrubDeep(x)
    }
    return out as T
  }
  return v
}
