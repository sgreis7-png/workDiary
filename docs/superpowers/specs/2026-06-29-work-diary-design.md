# Work Diary — Design Spec

Date: 2026-06-29
Status: Approved (pending user spec review)

## 1. Purpose

A work diary ("יומן עבודה") for construction/field work managers. A team logs daily
site reports — structured fields plus site photos — from phone or Windows. Each entry can
be emailed to saved distribution lists or individual recipients, and all entries are stored
by date with advanced search.

## 2. Constraints & Decisions

- **Delivery:** PWA (single React web app), installable on phone and Windows. No app stores.
- **Connectivity:** Pure online (site internet assumed reliable). No offline sync.
- **Users:** Team with shared data — every member can see and search all entries. Login required.
- **Roles:** `member` (fill entries, send email, search) and `admin` (everything + edit form template).
- **Language:** Bilingual Hebrew/English with a toggle; full RTL (He) / LTR (En) support.
- **Email:** Recipient gets all fields + photos rendered **inline in the email body** (no PDF).
- **Recipients:** Saved named distribution lists **and** ad-hoc individual addresses, chosen at send time.
- **Custom fields:** The form is a configurable template. **Admin only** can add / edit / remove / reorder fields.
- **Projects:** **Admin only** manages a list of projects. When filling an entry, the user picks the project from a dropdown (required), so every entry is tagged to a project and the team knows which one it is. Entries are filterable/searchable by project.
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions). Email via Resend.

## 3. Architecture

```
[Phone browser]   [Windows browser]
        \             /
       React PWA (one codebase, installable)
       i18n He/En, RTL/LTR
              |  HTTPS
      ┌──────────────────────────┐
      │         Supabase         │
      │  Auth     (team login)   │
      │  Postgres (entries+defs) │
      │  Storage  (photos)       │
      │  Edge Fn  (send-email)   │ ──> Resend (email API)
      └──────────────────────────┘
```

One web app, one shared backend. Both devices use the same Supabase project → always in sync,
single search index. Email is sent server-side by an Edge Function so API keys never reach the client.

### Frontend stack
- React + Vite (PWA via `vite-plugin-pwa`).
- `react-i18next` for He/En; `dir` attribute switches RTL/LTR.
- Supabase JS client for auth, data, storage.

## 4. Data Model (Postgres)

### users
Managed by Supabase Auth (email + password). A `profiles` row stores `role` (`member` | `admin`).

### field_definitions
Defines the form template itself.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| key | text unique | stable machine key used in `entries.values` |
| label_he | text | Hebrew label |
| label_en | text | English label |
| type | text | `text` \| `long_text` \| `number` \| `date` \| `phone` \| `select` \| `photo` |
| required | bool | |
| options | jsonb | choices for `select` (e.g. weather) |
| sort_order | int | display order |
| active | bool | soft-remove without losing historical data |

Seeded from the sample form (see §7).

### projects
Admin-managed list of projects.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text | display name (e.g. בני נצרים) |
| active | bool | soft-hide finished projects from the dropdown |
| created_at | timestamptz | |

### entries
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| project_id | uuid fk→projects | required; chosen from dropdown |
| created_by | uuid fk→users | |
| created_at | timestamptz | |
| last_sent_at | timestamptz null | set when emailed |
| values | jsonb | `{ field_key: value, ... }` for all non-photo fields |

`values` is GIN-indexed for fast search across any field, including custom ones. A generated/index
column on `values->>'work_date'` (or a dedicated `work_date date` column) supports date-range queries efficiently.

### entry_photos
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| entry_id | uuid fk→entries | cascade delete |
| storage_path | text | path in Supabase Storage |
| uploaded_at | timestamptz | |

At least one photo required per entry (enforced in UI; the seed includes a required `photo` field).

### distribution_lists / list_recipients
- `distribution_lists`: `id, name, owner, created_at`
- `list_recipients`: `id, list_id fk, email, display_name`

### Row-Level Security
- All authenticated team members: read all entries, photos, lists, field_definitions, projects.
- Insert/update entries: any member (shared data).
- field_definitions write: admin only.
- projects write: admin only.
- Storage bucket `photos`: authenticated read/write.

## 5. Screens

1. **Login** — Supabase Auth (email/password).
2. **New / Edit entry** — **project dropdown at top (required)**, then form rendered dynamically from
   `field_definitions`; date picker, select inputs, multi-photo upload (camera capture on phone), He/En
   toggle. Validates project + required fields + ≥1 photo.
3. **Entries list** — newest first, shows project name + thumbnail + key fields, tap to open.
4. **Entry detail** — full record + photos; **Send email** and **Edit** actions; shows `last_sent_at`.
5. **Send dialog** — pick saved list(s) and/or type individual addresses → send inline email.
6. **Search** — filter by **project**, date range, filters built from current field definitions + free-text search.
7. **Distribution lists** — create/edit lists and recipients.
8. **Form builder (admin only)** — add/edit/remove/reorder fields; set type, required, He/En labels, select options.
9. **Projects (admin only)** — add/edit/activate/deactivate projects shown in the entry dropdown.

## 6. Key Flows

### Email
Edge Function `send-email` receives `entry_id` + recipient list. It loads the entry + field
definitions + photos, renders an HTML body (project name at top, bilingual labels, photos embedded inline as `cid`/data),
and sends via Resend to all resolved addresses (lists expanded + individuals). On success sets `entries.last_sent_at`.

### Search
Search UI offers a **project filter** plus controls built from `field_definitions`. Query hits Postgres:
filter on `project_id`, date-range on `work_date`, equality/`ILIKE` on selected fields via `values`, and
free-text across text fields. GIN index keeps it fast at thousands of entries.

### Custom fields
Admin edits `field_definitions` in the form builder. Entry form, entry detail, email rendering, and
search controls are all generated from these definitions, so changes propagate everywhere automatically.
`active=false` hides a removed field from new forms while preserving old entries' stored values.

## 7. Seed Field Definitions (from sample form)

| key | label_he | label_en | type | required |
|---|---|---|---|---|
| manager_name | שם מנהל העבודה | Work manager name | text | yes |
| phone | טלפון | Phone | phone | yes |
| work_date | תאריך העבודה | Work date | date | yes |
| site_location | מיקום האתר | Site location | text | yes |
| weather | מזג האוויר | Weather | select | yes |
| daily_content | תוכן יומי - קטע לביצוע | Daily content / section to execute | long_text | yes |
| contractor | שם הקבלן ומספר העובדים | Contractor name & number of workers | text | yes |
| equipment | ציוד בשימוש ולמי שייך | Equipment in use & owner | text | yes |
| site_photos | תמונות מהשטח | Site photos | photo | yes (≥1) |

Weather options (editable): שמש/Sunny, מעונן/Cloudy, גשם/Rain, רוח/Wind, אחר/Other.

## 8. Out of Scope (YAGNI)

- Offline mode / background sync.
- PDF generation.
- Per-user private entries / fine-grained permissions beyond member/admin.
- Push notifications.
- Native app builds.

## 9. Testing

- Unit: dynamic form rendering from definitions, validation (required + ≥1 photo), search query builder.
- Integration: entry create→list→detail→email flow against a Supabase test project.
- RTL/LTR snapshot for both languages.
