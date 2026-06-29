# Work Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bilingual (He/En) PWA work diary where a team logs daily site reports with photos, tags each to an admin-managed project, emails entries to saved lists/individuals, and searches all entries.

**Architecture:** Single React + TypeScript PWA (Vite) talking to one Supabase backend (Postgres, Auth, Storage, Edge Functions). The entry form is rendered dynamically from `field_definitions` rows; entries store field values in a JSONB column. Email is sent server-side by a Supabase Edge Function via Resend.

**Tech Stack:** React 18, TypeScript, Vite, `@supabase/supabase-js`, `react-i18next`, `react-router-dom`, `vite-plugin-pwa`, Vitest + React Testing Library, Supabase CLI (local migrations + Edge Functions), Resend.

## Global Constraints

- **Language:** Bilingual He/En with runtime toggle; `<html dir>` = `rtl` for He, `ltr` for En. Every user-facing label has He + En text.
- **Roles:** `member` and `admin`. Admin-only: projects CRUD, field_definitions CRUD. Enforced in UI **and** Postgres RLS.
- **Shared data:** All authenticated users read all entries/photos/projects/lists/field_definitions.
- **Online only:** No offline/sync code.
- **Required per entry:** a project (FK) + all `required` fields + at least 1 photo.
- **Email body:** inline HTML, project name at top, bilingual field labels, photos embedded inline. No PDF.
- **Secrets:** Resend API key + service-role key live only in the Edge Function env, never in client bundle. Client uses anon key from `.env` (`VITE_` prefix).
- **Branding:** Company is **Agrotop** ("Agriculture Turnkey Projects"). Logo file lives at `src/assets/agrotop-logo.png`. Shown in the app header, on the Login screen, and at the top of every email body (above the project name). Theme color green `#3aaa35` (logo green), accent black. Email logo is embedded via a public asset URL or inline.
- **Test runner:** `npx vitest run` for unit/component; commit after every green task.

---

## File Structure

```
WorkDiary/
  .env.example                      # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
  index.html
  vite.config.ts                    # Vite + PWA + vitest config
  src/
    main.tsx                        # app bootstrap, router, i18n, auth provider
    App.tsx                         # routes + layout shell
    lib/supabase.ts                 # supabase client singleton
    lib/types.ts                    # shared TS types (Project, FieldDef, Entry, ...)
    i18n/index.ts                   # i18next init
    i18n/he.json, i18n/en.json      # translations
    i18n/LanguageToggle.tsx         # He/En switch + dir handling
    auth/AuthProvider.tsx           # session + role context
    auth/useAuth.ts                 # hook
    auth/Login.tsx                  # login screen
    auth/RequireAuth.tsx, RequireAdmin.tsx
    features/projects/
      api.ts                        # CRUD calls
      ProjectsAdmin.tsx             # screen 9
    features/fields/
      api.ts
      FormBuilder.tsx               # screen 8
      fieldValidation.ts            # validate values vs definitions
    features/entries/
      api.ts
      DynamicForm.tsx               # renders inputs from field defs + project picker
      EntryForm.tsx                 # new/edit screen 2
      EntriesList.tsx               # screen 3
      EntryDetail.tsx               # screen 4
      PhotoUpload.tsx               # multi-photo upload to Storage
    features/dist/
      api.ts
      DistributionLists.tsx         # screen 7
      SendDialog.tsx                # screen 5
    features/search/
      api.ts                        # query builder
      Search.tsx                    # screen 6
  supabase/
    migrations/0001_init.sql        # tables + RLS + indexes
    migrations/0002_seed.sql        # seed field_definitions + weather options
    functions/send-email/index.ts   # Edge Function
  src/test/setup.ts                 # RTL + vitest setup
```

---

## Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/test/setup.ts`, `.env.example`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: a running Vite app, `npx vitest run` working, `App` component rendering a shell.

- [ ] **Step 1: Scaffold and install**

```bash
cd "C:/APPS/WorkDiary"
npm create vite@latest . -- --template react-ts   # accept overwrite of empty dir
npm install @supabase/supabase-js react-router-dom react-i18next i18next
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom vite-plugin-pwa
```

- [ ] **Step 2: Configure Vite + Vitest**

`vite.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Work Diary',
        short_name: 'Diary',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3aaa35',
        icons: [{ src: '/agrotop-logo.png', sizes: '512x512', type: 'image/png' }],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom'
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 3: Write failing test**

`src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('renders app shell heading', () => {
  render(<App />)
  expect(screen.getByRole('banner')).toBeInTheDocument()
})
```

- [ ] **Step 4: Run, verify fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL (no `<header>` / banner).

- [ ] **Step 5: Minimal App**

`src/App.tsx`:

```tsx
export default function App() {
  return (
    <div>
      <header>Work Diary</header>
    </div>
  )
}
```

- [ ] **Step 6: Run, verify pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite React TS PWA with vitest"
```

---

## Task 2: Database schema, RLS, indexes

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Test: `supabase/migrations/0001_init.test.sql` (psql assertions) — or manual verification block below.

**Interfaces:**
- Produces tables: `profiles(id, role)`, `projects(id,name,active,created_at)`, `field_definitions(id,key,label_he,label_en,type,required,options,sort_order,active)`, `entries(id,project_id,created_by,work_date,created_at,last_sent_at,values)`, `entry_photos(id,entry_id,storage_path,uploaded_at)`, `distribution_lists(id,name,owner,created_at)`, `list_recipients(id,list_id,email,display_name)`.

> Note: `entries.work_date` is a real `date` column (mirrored from `values->>'work_date'` on write by the client) so date-range search is index-friendly. All other field values live in `values` jsonb.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0001_init.sql`:

```sql
-- roles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin'))
);

create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- projects
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- form template
create table field_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_he text not null,
  label_en text not null,
  type text not null check (type in ('text','long_text','number','date','phone','select','photo')),
  required boolean not null default false,
  options jsonb not null default '[]',
  sort_order int not null default 0,
  active boolean not null default true
);

-- entries
create table entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  created_by uuid not null references auth.users(id),
  work_date date,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  values jsonb not null default '{}'
);
create index entries_values_gin on entries using gin (values);
create index entries_work_date on entries (work_date);
create index entries_project on entries (project_id);

create table entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

-- distribution
create table distribution_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table list_recipients (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references distribution_lists(id) on delete cascade,
  email text not null,
  display_name text
);

-- RLS
alter table profiles enable row level security;
alter table projects enable row level security;
alter table field_definitions enable row level security;
alter table entries enable row level security;
alter table entry_photos enable row level security;
alter table distribution_lists enable row level security;
alter table list_recipients enable row level security;

create policy read_own_profile on profiles for select using (id = auth.uid());

create policy read_projects on projects for select using (auth.role() = 'authenticated');
create policy write_projects on projects for all using (is_admin()) with check (is_admin());

create policy read_fields on field_definitions for select using (auth.role() = 'authenticated');
create policy write_fields on field_definitions for all using (is_admin()) with check (is_admin());

create policy read_entries on entries for select using (auth.role() = 'authenticated');
create policy write_entries on entries for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy read_photos on entry_photos for select using (auth.role() = 'authenticated');
create policy write_photos on entry_photos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy rw_lists on distribution_lists for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy rw_recipients on list_recipients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- auto-create profile on signup
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into profiles(id, role) values (new.id, 'member') on conflict do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
```

- [ ] **Step 2: Apply locally and verify**

Run:
```bash
supabase start
supabase db reset           # applies migrations
```
Expected: no errors; `supabase db diff` shows clean.

- [ ] **Step 3: Create the photos storage bucket**

Run (SQL or dashboard):
```sql
insert into storage.buckets (id, name, public) values ('photos','photos', false)
  on conflict do nothing;
create policy "auth read photos" on storage.objects for select
  using (bucket_id = 'photos' and auth.role() = 'authenticated');
create policy "auth write photos" on storage.objects for insert
  with check (bucket_id = 'photos' and auth.role() = 'authenticated');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: db schema, RLS, indexes, photos bucket"
```

---

## Task 3: Seed field definitions

**Files:**
- Create: `supabase/migrations/0002_seed.sql`

**Interfaces:**
- Produces: 9 seeded rows in `field_definitions` matching the sample form (keys: `manager_name, phone, work_date, site_location, weather, daily_content, contractor, equipment, site_photos`).

- [ ] **Step 1: Write seed migration**

```sql
insert into field_definitions (key,label_he,label_en,type,required,options,sort_order) values
('manager_name','שם מנהל העבודה','Work manager name','text',true,'[]',10),
('phone','טלפון','Phone','phone',true,'[]',20),
('work_date','תאריך העבודה','Work date','date',true,'[]',30),
('site_location','מיקום האתר','Site location','text',true,'[]',40),
('weather','מזג האוויר','Weather','select',true,
  '[{"he":"שמש","en":"Sunny"},{"he":"מעונן","en":"Cloudy"},{"he":"גשם","en":"Rain"},{"he":"רוח","en":"Wind"},{"he":"אחר","en":"Other"}]',50),
('daily_content','תוכן יומי - קטע לביצוע','Daily content / section to execute','long_text',true,'[]',60),
('contractor','שם הקבלן ומספר העובדים','Contractor name & number of workers','text',true,'[]',70),
('equipment','ציוד בשימוש ולמי שייך','Equipment in use & owner','text',true,'[]',80),
('manager_notes','הערות מנהל עבודה','Work manager notes','long_text',false,'[]',85),
('site_photos','תמונות מהשטח','Site photos','photo',true,'[]',90)
on conflict (key) do nothing;
```

- [ ] **Step 2: Apply + verify count**

Run: `supabase db reset` then `psql ... -c "select count(*) from field_definitions;"`
Expected: `9`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_seed.sql
git commit -m "feat: seed sample form field definitions"
```

---

## Task 4: Supabase client + shared types

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/types.ts`, `.env.example`
- Test: `src/lib/types.test.ts`

**Interfaces:**
- Produces: `supabase` client; types `Role`, `Project`, `FieldType`, `FieldDef`, `Entry`, `EntryPhoto`, `DistList`, `Recipient`.

- [ ] **Step 1: Types + client**

`src/lib/types.ts`:

```ts
export type Role = 'member' | 'admin'
export type FieldType = 'text' | 'long_text' | 'number' | 'date' | 'phone' | 'select' | 'photo'
export interface Option { he: string; en: string }
export interface FieldDef {
  id: string; key: string; label_he: string; label_en: string;
  type: FieldType; required: boolean; options: Option[]; sort_order: number; active: boolean
}
export interface Project { id: string; name: string; active: boolean; created_at: string }
export interface Entry {
  id: string; project_id: string; created_by: string; work_date: string | null;
  created_at: string; last_sent_at: string | null; values: Record<string, unknown>
}
export interface EntryPhoto { id: string; entry_id: string; storage_path: string; uploaded_at: string }
export interface Recipient { id: string; list_id: string; email: string; display_name: string | null }
export interface DistList { id: string; name: string; owner: string; created_at: string }
```

`src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const supabase = createClient(url, anon)
```

`.env.example`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 2: Failing test**

`src/lib/types.test.ts`:

```ts
import type { FieldDef } from './types'

test('FieldDef shape compiles and is usable', () => {
  const f: FieldDef = {
    id: '1', key: 'phone', label_he: 'טלפון', label_en: 'Phone',
    type: 'phone', required: true, options: [], sort_order: 1, active: true,
  }
  expect(f.type).toBe('phone')
})
```

- [ ] **Step 3: Run**

Run: `npx vitest run src/lib/types.test.ts`
Expected: PASS (compiles + asserts).

- [ ] **Step 4: Commit**

```bash
git add src/lib .env.example
git commit -m "feat: supabase client and shared types"
```

---

## Task 5: i18n + language/direction toggle

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/he.json`, `src/i18n/en.json`, `src/i18n/LanguageToggle.tsx`
- Test: `src/i18n/LanguageToggle.test.tsx`

**Interfaces:**
- Produces: initialized i18next (`he` default), `LanguageToggle` that on switch sets `i18n.language` and `document.documentElement.dir`.
- Consumes: nothing.

- [ ] **Step 1: i18n init + dir helper**

`src/i18n/index.ts`:

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import he from './he.json'
import en from './en.json'

export function applyDir(lang: string) {
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
  document.documentElement.lang = lang
}

i18n.use(initReactI18next).init({
  resources: { he: { translation: he }, en: { translation: en } },
  lng: 'he',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})
applyDir('he')
export default i18n
```

`src/i18n/he.json` (start small, extend per screen):

```json
{ "app_title": "יומן עבודה", "login": "כניסה", "save": "שמירה", "search": "חיפוש", "project": "פרויקט", "send_email": "שליחת מייל" }
```

`src/i18n/en.json`:

```json
{ "app_title": "Work Diary", "login": "Login", "save": "Save", "search": "Search", "project": "Project", "send_email": "Send email" }
```

- [ ] **Step 2: Failing test**

`src/i18n/LanguageToggle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import './index'
import LanguageToggle from './LanguageToggle'

test('toggling to English sets dir=ltr', async () => {
  render(<LanguageToggle />)
  await userEvent.click(screen.getByRole('button', { name: /english/i }))
  expect(document.documentElement.dir).toBe('ltr')
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run src/i18n/LanguageToggle.test.tsx`
Expected: FAIL (component missing).

- [ ] **Step 4: Implement toggle**

`src/i18n/LanguageToggle.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import i18n, { applyDir } from './index'

export default function LanguageToggle() {
  const { i18n: inst } = useTranslation()
  const set = (lang: string) => { inst.changeLanguage(lang); applyDir(lang) }
  return (
    <div>
      <button onClick={() => set('he')}>עברית</button>
      <button onClick={() => set('en')}>English</button>
    </div>
  )
}
void i18n
```

- [ ] **Step 5: Run, verify pass** — `npx vitest run src/i18n/LanguageToggle.test.tsx` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/i18n
git commit -m "feat: i18n He/En with RTL/LTR toggle"
```

---

## Task 6: Auth — provider, login, route guards

**Files:**
- Create: `src/auth/AuthProvider.tsx`, `src/auth/useAuth.ts`, `src/auth/Login.tsx`, `src/auth/RequireAuth.tsx`, `src/auth/RequireAdmin.tsx`
- Test: `src/auth/Login.test.tsx`

**Interfaces:**
- Produces: `useAuth(): { session, role, loading, signIn(email,pw), signOut() }`; `<RequireAuth>` and `<RequireAdmin>` wrappers redirecting to `/login`.
- Consumes: `supabase` (Task 4).

- [ ] **Step 1: Provider + hook**

`src/auth/AuthProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Role } from '../lib/types'

interface Ctx { session: Session | null; role: Role | null; loading: boolean
  signIn: (e: string, p: string) => Promise<{ error: string | null }>; signOut: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null as unknown as Ctx)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setRole(null); return }
    supabase.from('profiles').select('role').eq('id', session.user.id).single()
      .then(({ data }) => setRole((data?.role as Role) ?? 'member'))
  }, [session])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }
  const signOut = async () => { await supabase.auth.signOut() }

  return <AuthCtx.Provider value={{ session, role, loading, signIn, signOut }}>{children}</AuthCtx.Provider>
}
```

`src/auth/useAuth.ts`:

```ts
export { useAuth } from './AuthProvider'
```

- [ ] **Step 2: Failing login test (mock supabase)**

`src/auth/Login.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const signIn = vi.fn().mockResolvedValue({ error: null })
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ signIn }) }))
import Login from './Login'

test('submitting calls signIn with credentials', async () => {
  render(<Login />)
  await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
  await userEvent.type(screen.getByLabelText(/password/i), 'pw')
  await userEvent.click(screen.getByRole('button', { name: /login|כניסה/i }))
  expect(signIn).toHaveBeenCalledWith('a@b.com', 'pw')
})
```

- [ ] **Step 3: Run, verify fail** — `npx vitest run src/auth/Login.test.tsx` → FAIL.

- [ ] **Step 4: Implement Login + guards**

`src/auth/Login.tsx`:

```tsx
import { useState } from 'react'
import { useAuth } from './AuthProvider'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await signIn(email, pw)
    if (error) setErr(error)
  }
  return (
    <form onSubmit={submit}>
      <label>Email<input aria-label="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input aria-label="password" type="password" value={pw} onChange={e => setPw(e.target.value)} /></label>
      <button type="submit">Login</button>
      {err && <p role="alert">{err}</p>}
    </form>
  )
}
```

`src/auth/RequireAuth.tsx`:

```tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'
export default function RequireAuth({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth()
  if (loading) return <p>…</p>
  return session ? children : <Navigate to="/login" replace />
}
```

`src/auth/RequireAdmin.tsx`:

```tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'
export default function RequireAdmin({ children }: { children: JSX.Element }) {
  const { role, loading } = useAuth()
  if (loading) return <p>…</p>
  return role === 'admin' ? children : <Navigate to="/" replace />
}
```

- [ ] **Step 5: Run, verify pass** — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth
git commit -m "feat: auth provider, login, route guards"
```

---

## Task 7: Projects admin (CRUD)

**Files:**
- Create: `src/features/projects/api.ts`, `src/features/projects/ProjectsAdmin.tsx`
- Test: `src/features/projects/api.test.ts`

**Interfaces:**
- Produces: `listProjects(activeOnly?: boolean): Promise<Project[]>`, `createProject(name): Promise<Project>`, `setProjectActive(id, active): Promise<void>`, `renameProject(id, name): Promise<void>`.
- Consumes: `supabase`, `Project`.

- [ ] **Step 1: API module**

`src/features/projects/api.ts`:

```ts
import { supabase } from '../../lib/supabase'
import type { Project } from '../../lib/types'

export async function listProjects(activeOnly = false): Promise<Project[]> {
  let q = supabase.from('projects').select('*').order('name')
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return data as Project[]
}
export async function createProject(name: string): Promise<Project> {
  const { data, error } = await supabase.from('projects').insert({ name }).select().single()
  if (error) throw error
  return data as Project
}
export async function setProjectActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('projects').update({ active }).eq('id', id)
  if (error) throw error
}
export async function renameProject(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('projects').update({ name }).eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Failing test (mock supabase chain)**

`src/features/projects/api.test.ts`:

```ts
import { vi } from 'vitest'
const single = vi.fn().mockResolvedValue({ data: { id: '1', name: 'בני נצרים', active: true, created_at: '' }, error: null })
const select = vi.fn(() => ({ single }))
const insert = vi.fn(() => ({ select }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ insert }) } }))
import { createProject } from './api'

test('createProject inserts name and returns row', async () => {
  const p = await createProject('בני נצרים')
  expect(insert).toHaveBeenCalledWith({ name: 'בני נצרים' })
  expect(p.name).toBe('בני נצרים')
})
```

- [ ] **Step 3: Run, verify fail then pass**

Run: `npx vitest run src/features/projects/api.test.ts`
Expected: PASS after api.ts present (write test first, confirm FAIL by temporarily renaming export, then PASS).

- [ ] **Step 4: Admin screen**

`src/features/projects/ProjectsAdmin.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { listProjects, createProject, setProjectActive } from './api'
import type { Project } from '../../lib/types'

export default function ProjectsAdmin() {
  const [items, setItems] = useState<Project[]>([])
  const [name, setName] = useState('')
  const load = () => listProjects().then(setItems)
  useEffect(() => { load() }, [])
  const add = async () => { if (!name.trim()) return; await createProject(name.trim()); setName(''); load() }
  return (
    <section>
      <h2>Projects</h2>
      <input aria-label="new project" value={name} onChange={e => setName(e.target.value)} />
      <button onClick={add}>Add</button>
      <ul>
        {items.map(p => (
          <li key={p.id}>
            {p.name} {p.active ? '' : '(inactive)'}
            <button onClick={() => setProjectActive(p.id, !p.active).then(load)}>
              {p.active ? 'Deactivate' : 'Activate'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/features/projects
git commit -m "feat: projects admin CRUD"
```

---

## Task 8: Field definitions API + Form Builder (admin)

**Files:**
- Create: `src/features/fields/api.ts`, `src/features/fields/FormBuilder.tsx`, `src/features/fields/fieldValidation.ts`
- Test: `src/features/fields/fieldValidation.test.ts`

**Interfaces:**
- Produces:
  - `listFields(activeOnly?): Promise<FieldDef[]>` (ordered by `sort_order`)
  - `upsertField(f: Partial<FieldDef>): Promise<FieldDef>`, `deactivateField(id): Promise<void>`, `reorderFields(ids: string[]): Promise<void>`
  - `validateValues(defs: FieldDef[], values: Record<string, unknown>, photoCount: number): string[]` — returns array of missing-field keys; includes `'__photos__'` when a required photo field has 0 photos.
- Consumes: `supabase`, `FieldDef`.

- [ ] **Step 1: Validation (pure) — failing test**

`src/features/fields/fieldValidation.test.ts`:

```ts
import { validateValues } from './fieldValidation'
import type { FieldDef } from '../../lib/types'

const defs: FieldDef[] = [
  { id: '1', key: 'manager_name', label_he: '', label_en: '', type: 'text', required: true, options: [], sort_order: 1, active: true },
  { id: '2', key: 'site_photos', label_he: '', label_en: '', type: 'photo', required: true, options: [], sort_order: 2, active: true },
]

test('flags missing required text and missing photos', () => {
  const errs = validateValues(defs, { manager_name: '' }, 0)
  expect(errs).toContain('manager_name')
  expect(errs).toContain('__photos__')
})
test('passes when filled and 1 photo', () => {
  expect(validateValues(defs, { manager_name: 'פבל' }, 1)).toEqual([])
})
```

- [ ] **Step 2: Run, verify fail** — FAIL (no module).

- [ ] **Step 3: Implement validation + api**

`src/features/fields/fieldValidation.ts`:

```ts
import type { FieldDef } from '../../lib/types'

export function validateValues(defs: FieldDef[], values: Record<string, unknown>, photoCount: number): string[] {
  const errs: string[] = []
  for (const d of defs) {
    if (!d.required || !d.active) continue
    if (d.type === 'photo') { if (photoCount < 1) errs.push('__photos__'); continue }
    const v = values[d.key]
    if (v === undefined || v === null || String(v).trim() === '') errs.push(d.key)
  }
  return errs
}
```

`src/features/fields/api.ts`:

```ts
import { supabase } from '../../lib/supabase'
import type { FieldDef } from '../../lib/types'

export async function listFields(activeOnly = false): Promise<FieldDef[]> {
  let q = supabase.from('field_definitions').select('*').order('sort_order')
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return data as FieldDef[]
}
export async function upsertField(f: Partial<FieldDef>): Promise<FieldDef> {
  const { data, error } = await supabase.from('field_definitions').upsert(f).select().single()
  if (error) throw error
  return data as FieldDef
}
export async function deactivateField(id: string): Promise<void> {
  const { error } = await supabase.from('field_definitions').update({ active: false }).eq('id', id)
  if (error) throw error
}
export async function reorderFields(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id, i) =>
    supabase.from('field_definitions').update({ sort_order: (i + 1) * 10 }).eq('id', id)))
}
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Form Builder screen**

`src/features/fields/FormBuilder.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { listFields, upsertField, deactivateField } from './api'
import type { FieldDef, FieldType } from '../../lib/types'

const TYPES: FieldType[] = ['text','long_text','number','date','phone','select','photo']

export default function FormBuilder() {
  const [fields, setFields] = useState<FieldDef[]>([])
  const [draft, setDraft] = useState({ key: '', label_he: '', label_en: '', type: 'text' as FieldType, required: false })
  const load = () => listFields().then(setFields)
  useEffect(() => { load() }, [])
  const add = async () => {
    if (!draft.key.trim()) return
    await upsertField({ ...draft, options: [], sort_order: (fields.length + 1) * 10, active: true })
    setDraft({ key: '', label_he: '', label_en: '', type: 'text', required: false }); load()
  }
  return (
    <section>
      <h2>Form Builder</h2>
      <input aria-label="key" placeholder="key" value={draft.key} onChange={e => setDraft({ ...draft, key: e.target.value })} />
      <input aria-label="label_he" placeholder="תווית" value={draft.label_he} onChange={e => setDraft({ ...draft, label_he: e.target.value })} />
      <input aria-label="label_en" placeholder="label" value={draft.label_en} onChange={e => setDraft({ ...draft, label_en: e.target.value })} />
      <select aria-label="type" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as FieldType })}>
        {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <label><input type="checkbox" checked={draft.required} onChange={e => setDraft({ ...draft, required: e.target.checked })} /> required</label>
      <button onClick={add}>Add field</button>
      <ul>
        {fields.map(f => (
          <li key={f.id}>{f.sort_order}. {f.label_en} ({f.type}){f.required ? ' *' : ''}{f.active ? '' : ' [removed]'}
            <button onClick={() => deactivateField(f.id).then(load)}>Remove</button></li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/fields
git commit -m "feat: field definitions api, validation, form builder"
```

---

## Task 9: Photo upload to Storage

**Files:**
- Create: `src/features/entries/PhotoUpload.tsx`
- Test: `src/features/entries/PhotoUpload.test.tsx`

**Interfaces:**
- Produces: `<PhotoUpload value={string[]} onChange={(paths)=>void} />` — uploads each chosen file to `photos/<uuid>` bucket and reports storage paths. On phone, file input uses `capture="environment"`.
- Consumes: `supabase` storage.

- [ ] **Step 1: Failing test (mock upload)**

`src/features/entries/PhotoUpload.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
const upload = vi.fn().mockResolvedValue({ data: { path: 'photos/x.jpg' }, error: null })
vi.mock('../../lib/supabase', () => ({ supabase: { storage: { from: () => ({ upload }) } } }))
import PhotoUpload from './PhotoUpload'

test('uploading a file calls onChange with returned path', async () => {
  const onChange = vi.fn()
  render(<PhotoUpload value={[]} onChange={onChange} />)
  const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' })
  await userEvent.upload(screen.getByLabelText(/add photo/i), file)
  expect(upload).toHaveBeenCalled()
  expect(onChange).toHaveBeenCalledWith(['photos/x.jpg'])
})
```

- [ ] **Step 2: Run, verify fail** — FAIL.

- [ ] **Step 3: Implement**

`src/features/entries/PhotoUpload.tsx`:

```tsx
import { supabase } from '../../lib/supabase'

export default function PhotoUpload({ value, onChange }: { value: string[]; onChange: (p: string[]) => void }) {
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const paths: string[] = [...value]
    for (const f of files) {
      const name = `${crypto.randomUUID()}-${f.name}`
      const { data, error } = await supabase.storage.from('photos').upload(name, f)
      if (error) throw error
      paths.push(data.path)
    }
    onChange(paths)
  }
  return (
    <div>
      <label>Add photo
        <input aria-label="add photo" type="file" accept="image/*" capture="environment" multiple onChange={handle} />
      </label>
      <p>{value.length} photo(s)</p>
    </div>
  )
}
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/entries/PhotoUpload.tsx
git commit -m "feat: photo upload to storage"
```

---

## Task 10: Entries API

**Files:**
- Create: `src/features/entries/api.ts`
- Test: `src/features/entries/api.test.ts`

**Interfaces:**
- Produces:
  - `createEntry(input: { project_id: string; values: Record<string, unknown>; photoPaths: string[] }): Promise<Entry>` — inserts entry (mirrors `values.work_date` into `work_date` column), then inserts `entry_photos` rows.
  - `listEntries(): Promise<(Entry & { project_name: string; photo_count: number })[]>`
  - `getEntry(id): Promise<{ entry: Entry; photos: EntryPhoto[]; project_name: string }>`
  - `updateEntry(id, values, project_id): Promise<void>`
  - `photoUrl(path: string): Promise<string>` (signed URL)
- Consumes: `supabase`, `Entry`, `EntryPhoto`.

- [ ] **Step 1: Failing test**

`src/features/entries/api.test.ts`:

```ts
import { vi } from 'vitest'
const photoInsert = vi.fn().mockResolvedValue({ error: null })
const entrySingle = vi.fn().mockResolvedValue({ data: { id: 'e1', project_id: 'p1', values: { work_date: '2026-06-29' } }, error: null })
const entrySelect = vi.fn(() => ({ single: entrySingle }))
const entryInsert = vi.fn(() => ({ select: entrySelect }))
vi.mock('../../lib/supabase', () => ({
  supabase: { from: (t: string) => t === 'entries' ? { insert: entryInsert } : { insert: photoInsert } },
}))
import { createEntry } from './api'

test('createEntry mirrors work_date and saves photos', async () => {
  await createEntry({ project_id: 'p1', values: { work_date: '2026-06-29' }, photoPaths: ['photos/a.jpg'] })
  expect(entryInsert).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'p1', work_date: '2026-06-29' }))
  expect(photoInsert).toHaveBeenCalledWith([{ entry_id: 'e1', storage_path: 'photos/a.jpg' }])
})
```

- [ ] **Step 2: Run, verify fail** — FAIL.

- [ ] **Step 3: Implement**

`src/features/entries/api.ts`:

```ts
import { supabase } from '../../lib/supabase'
import type { Entry, EntryPhoto } from '../../lib/types'

export async function createEntry(input: { project_id: string; values: Record<string, unknown>; photoPaths: string[] }): Promise<Entry> {
  const work_date = (input.values['work_date'] as string) || null
  const { data, error } = await supabase.from('entries')
    .insert({ project_id: input.project_id, values: input.values, work_date }).select().single()
  if (error) throw error
  const entry = data as Entry
  if (input.photoPaths.length) {
    const { error: pe } = await supabase.from('entry_photos')
      .insert(input.photoPaths.map(p => ({ entry_id: entry.id, storage_path: p })))
    if (pe) throw pe
  }
  return entry
}

export async function listEntries() {
  const { data, error } = await supabase.from('entries')
    .select('*, projects(name), entry_photos(count)').order('work_date', { ascending: false })
  if (error) throw error
  return (data as any[]).map(r => ({ ...r, project_name: r.projects?.name ?? '', photo_count: r.entry_photos?.[0]?.count ?? 0 }))
}

export async function getEntry(id: string) {
  const { data, error } = await supabase.from('entries').select('*, projects(name)').eq('id', id).single()
  if (error) throw error
  const { data: photos } = await supabase.from('entry_photos').select('*').eq('entry_id', id)
  return { entry: data as Entry, photos: (photos ?? []) as EntryPhoto[], project_name: (data as any).projects?.name ?? '' }
}

export async function updateEntry(id: string, values: Record<string, unknown>, project_id: string): Promise<void> {
  const work_date = (values['work_date'] as string) || null
  const { error } = await supabase.from('entries').update({ values, project_id, work_date }).eq('id', id)
  if (error) throw error
}

export async function photoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('photos').createSignedUrl(path.replace(/^photos\//, ''), 3600)
  if (error) throw error
  return data.signedUrl
}
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/entries/api.ts
git commit -m "feat: entries api (create/list/get/update/signed url)"
```

---

## Task 11: Dynamic entry form (screen 2)

**Files:**
- Create: `src/features/entries/DynamicForm.tsx`, `src/features/entries/EntryForm.tsx`
- Test: `src/features/entries/DynamicForm.test.tsx`

**Interfaces:**
- Produces: `<DynamicForm defs project values photos onChange onPhotos />` rendering one input per active field by type, plus required project `<select>`; `EntryForm` wires load → validate → `createEntry`/`updateEntry`.
- Consumes: `FieldDef`, `Project`, `validateValues`, entries/projects/fields api, `PhotoUpload`.

- [ ] **Step 1: Failing test**

`src/features/entries/DynamicForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import DynamicForm from './DynamicForm'
import type { FieldDef, Project } from '../../lib/types'

const defs: FieldDef[] = [
  { id: '1', key: 'manager_name', label_he: 'שם מנהל העבודה', label_en: 'Work manager name', type: 'text', required: true, options: [], sort_order: 1, active: true },
  { id: '2', key: 'weather', label_he: 'מזג', label_en: 'Weather', type: 'select', required: true, options: [{ he: 'שמש', en: 'Sunny' }], sort_order: 2, active: true },
]
const projects: Project[] = [{ id: 'p1', name: 'בני נצרים', active: true, created_at: '' }]

test('renders project picker, a text input and a select with options', () => {
  render(<DynamicForm defs={defs} projects={projects} project="" values={{}} photos={[]} lang="en"
    onChange={() => {}} onProject={() => {}} onPhotos={() => {}} />)
  expect(screen.getByLabelText(/project/i)).toBeInTheDocument()
  expect(screen.getByLabelText('Work manager name')).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Sunny' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, verify fail** — FAIL.

- [ ] **Step 3: Implement DynamicForm**

`src/features/entries/DynamicForm.tsx`:

```tsx
import type { FieldDef, Project } from '../../lib/types'
import PhotoUpload from './PhotoUpload'

interface Props {
  defs: FieldDef[]; projects: Project[]; project: string; values: Record<string, unknown>; photos: string[]; lang: string
  onChange: (key: string, v: unknown) => void; onProject: (id: string) => void; onPhotos: (p: string[]) => void
}

export default function DynamicForm({ defs, projects, project, values, photos, lang, onChange, onProject, onPhotos }: Props) {
  const label = (f: FieldDef) => (lang === 'he' ? f.label_he : f.label_en)
  return (
    <div>
      <label>Project
        <select aria-label="project" value={project} onChange={e => onProject(e.target.value)}>
          <option value="">—</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {defs.filter(f => f.active).map(f => {
        const v = (values[f.key] ?? '') as string
        if (f.type === 'photo') return <PhotoUpload key={f.id} value={photos} onChange={onPhotos} />
        if (f.type === 'long_text') return <label key={f.id}>{label(f)}<textarea aria-label={label(f)} value={v} onChange={e => onChange(f.key, e.target.value)} /></label>
        if (f.type === 'select') return (
          <label key={f.id}>{label(f)}
            <select aria-label={label(f)} value={v} onChange={e => onChange(f.key, e.target.value)}>
              <option value="">—</option>
              {f.options.map((o, i) => <option key={i} value={lang === 'he' ? o.he : o.en}>{lang === 'he' ? o.he : o.en}</option>)}
            </select>
          </label>
        )
        const inputType = f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : f.type === 'phone' ? 'tel' : 'text'
        return <label key={f.id}>{label(f)}<input aria-label={label(f)} type={inputType} value={v} onChange={e => onChange(f.key, e.target.value)} /></label>
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Implement EntryForm wiring**

`src/features/entries/EntryForm.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DynamicForm from './DynamicForm'
import { listFields } from '../fields/api'
import { validateValues } from '../fields/fieldValidation'
import { listProjects } from '../projects/api'
import { createEntry, getEntry, updateEntry } from './api'
import type { FieldDef, Project } from '../../lib/types'

export default function EntryForm() {
  const { id } = useParams(); const nav = useNavigate(); const { i18n } = useTranslation()
  const [defs, setDefs] = useState<FieldDef[]>([]); const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState(''); const [values, setValues] = useState<Record<string, unknown>>({})
  const [photos, setPhotos] = useState<string[]>([]); const [errs, setErrs] = useState<string[]>([])

  useEffect(() => {
    listFields(true).then(setDefs); listProjects(true).then(setProjects)
    if (id) getEntry(id).then(({ entry }) => { setProject(entry.project_id); setValues(entry.values) })
  }, [id])

  const save = async () => {
    const e = validateValues(defs, values, photos.length)
    if (!project) e.push('__project__')
    setErrs(e); if (e.length) return
    if (id) await updateEntry(id, values, project)
    else await createEntry({ project_id: project, values, photoPaths: photos })
    nav('/')
  }

  return (
    <section>
      <h2>{id ? 'Edit' : 'New'} entry</h2>
      <DynamicForm defs={defs} projects={projects} project={project} values={values} photos={photos} lang={i18n.language}
        onChange={(k, v) => setValues(s => ({ ...s, [k]: v }))} onProject={setProject} onPhotos={setPhotos} />
      {errs.length > 0 && <p role="alert">Missing: {errs.join(', ')}</p>}
      <button onClick={save}>Save</button>
    </section>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/DynamicForm.tsx src/features/entries/EntryForm.tsx
git commit -m "feat: dynamic entry form with project picker and validation"
```

---

## Task 12: Entries list + detail (screens 3, 4)

**Files:**
- Create: `src/features/entries/EntriesList.tsx`, `src/features/entries/EntryDetail.tsx`
- Test: `src/features/entries/EntriesList.test.tsx`

**Interfaces:**
- Produces: list rendering project name + work_date per entry with link to detail; detail rendering fields (bilingual labels), photos (signed URLs), Edit + Send buttons, `last_sent_at`.
- Consumes: entries api, fields api.

- [ ] **Step 1: Failing test (mock api)**

`src/features/entries/EntriesList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
vi.mock('./api', () => ({ listEntries: () => Promise.resolve([
  { id: 'e1', project_name: 'בני נצרים', work_date: '2026-06-29', values: {}, photo_count: 2 },
]) }))
import EntriesList from './EntriesList'

test('shows entry with project name and date', async () => {
  render(<MemoryRouter><EntriesList /></MemoryRouter>)
  expect(await screen.findByText(/בני נצרים/)).toBeInTheDocument()
  expect(screen.getByText(/2026-06-29/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, verify fail** — FAIL.

- [ ] **Step 3: Implement list + detail**

`src/features/entries/EntriesList.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listEntries } from './api'

export default function EntriesList() {
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { listEntries().then(setRows) }, [])
  return (
    <section>
      <h2>Entries</h2>
      <Link to="/new">+ New</Link>
      <ul>
        {rows.map(r => (
          <li key={r.id}><Link to={`/entry/${r.id}`}>{r.project_name} — {r.work_date} ({r.photo_count} 📷)</Link></li>
        ))}
      </ul>
    </section>
  )
}
```

`src/features/entries/EntryDetail.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getEntry, photoUrl } from './api'
import { listFields } from '../fields/api'
import type { FieldDef, EntryPhoto } from '../../lib/types'

export default function EntryDetail() {
  const { id } = useParams(); const { i18n } = useTranslation()
  const [data, setData] = useState<any>(null); const [defs, setDefs] = useState<FieldDef[]>([]); const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    listFields().then(setDefs)
    if (id) getEntry(id).then(async d => {
      setData(d)
      setUrls(await Promise.all((d.photos as EntryPhoto[]).map(p => photoUrl(p.storage_path))))
    })
  }, [id])
  if (!data) return <p>…</p>
  const label = (f: FieldDef) => (i18n.language === 'he' ? f.label_he : f.label_en)
  return (
    <section>
      <h2>{data.project_name}</h2>
      <dl>{defs.filter(f => f.type !== 'photo').map(f => (
        <div key={f.id}><dt>{label(f)}</dt><dd>{String(data.entry.values[f.key] ?? '')}</dd></div>
      ))}</dl>
      <div>{urls.map((u, i) => <img key={i} src={u} alt="" width={160} />)}</div>
      {data.entry.last_sent_at && <p>Last sent: {data.entry.last_sent_at}</p>}
      <Link to={`/entry/${id}/edit`}>Edit</Link>
      <Link to={`/entry/${id}/send`}>Send email</Link>
    </section>
  )
}
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/entries/EntriesList.tsx src/features/entries/EntryDetail.tsx
git commit -m "feat: entries list and detail screens"
```

---

## Task 13: Distribution lists + recipients (screen 7)

**Files:**
- Create: `src/features/dist/api.ts`, `src/features/dist/DistributionLists.tsx`
- Test: `src/features/dist/api.test.ts`

**Interfaces:**
- Produces: `listLists(): Promise<(DistList & { recipients: Recipient[] })[]>`, `createList(name): Promise<DistList>`, `addRecipient(listId, email, name?): Promise<void>`, `removeRecipient(id): Promise<void>`, `resolveRecipients(listIds: string[], individuals: string[]): Promise<string[]>` (dedup emails).
- Consumes: `supabase`, `DistList`, `Recipient`.

- [ ] **Step 1: Failing test for resolveRecipients dedup**

`src/features/dist/api.test.ts`:

```ts
import { vi } from 'vitest'
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ in: () =>
  Promise.resolve({ data: [{ email: 'a@x.com' }, { email: 'b@x.com' }], error: null }) }) }) } }))
import { resolveRecipients } from './api'

test('merges list emails with individuals and dedups', async () => {
  const out = await resolveRecipients(['l1'], ['b@x.com', 'c@x.com'])
  expect(out.sort()).toEqual(['a@x.com', 'b@x.com', 'c@x.com'])
})
```

- [ ] **Step 2: Run, verify fail** — FAIL.

- [ ] **Step 3: Implement api**

`src/features/dist/api.ts`:

```ts
import { supabase } from '../../lib/supabase'
import type { DistList, Recipient } from '../../lib/types'

export async function listLists() {
  const { data, error } = await supabase.from('distribution_lists').select('*, list_recipients(*)').order('name')
  if (error) throw error
  return (data as any[]).map(l => ({ ...l, recipients: l.list_recipients ?? [] })) as (DistList & { recipients: Recipient[] })[]
}
export async function createList(name: string): Promise<DistList> {
  const { data, error } = await supabase.from('distribution_lists').insert({ name }).select().single()
  if (error) throw error
  return data as DistList
}
export async function addRecipient(list_id: string, email: string, display_name?: string): Promise<void> {
  const { error } = await supabase.from('list_recipients').insert({ list_id, email, display_name: display_name ?? null })
  if (error) throw error
}
export async function removeRecipient(id: string): Promise<void> {
  const { error } = await supabase.from('list_recipients').delete().eq('id', id)
  if (error) throw error
}
export async function resolveRecipients(listIds: string[], individuals: string[]): Promise<string[]> {
  let emails = [...individuals]
  if (listIds.length) {
    const { data, error } = await supabase.from('list_recipients').select('email').in('list_id', listIds)
    if (error) throw error
    emails = emails.concat((data as any[]).map(r => r.email))
  }
  return Array.from(new Set(emails.map(e => e.trim()).filter(Boolean)))
}
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Implement DistributionLists screen**

`src/features/dist/DistributionLists.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { listLists, createList, addRecipient, removeRecipient } from './api'

export default function DistributionLists() {
  const [lists, setLists] = useState<any[]>([]); const [name, setName] = useState('')
  const load = () => listLists().then(setLists)
  useEffect(() => { load() }, [])
  return (
    <section>
      <h2>Distribution lists</h2>
      <input aria-label="list name" value={name} onChange={e => setName(e.target.value)} />
      <button onClick={async () => { if (name.trim()) { await createList(name.trim()); setName(''); load() } }}>Add list</button>
      {lists.map(l => (
        <div key={l.id}>
          <h3>{l.name}</h3>
          <ul>{l.recipients.map((r: any) => (
            <li key={r.id}>{r.email}<button onClick={() => removeRecipient(r.id).then(load)}>x</button></li>
          ))}</ul>
          <AddRecipient listId={l.id} onAdd={load} />
        </div>
      ))}
    </section>
  )
}

function AddRecipient({ listId, onAdd }: { listId: string; onAdd: () => void }) {
  const [email, setEmail] = useState('')
  return (
    <div>
      <input aria-label="recipient email" value={email} onChange={e => setEmail(e.target.value)} />
      <button onClick={async () => { if (email.trim()) { await addRecipient(listId, email.trim()); setEmail(''); onAdd() } }}>Add</button>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/dist/api.ts src/features/dist/DistributionLists.tsx
git commit -m "feat: distribution lists and recipient resolution"
```

---

## Task 14: Search (screen 6)

**Files:**
- Create: `src/features/search/api.ts`, `src/features/search/Search.tsx`
- Test: `src/features/search/api.test.ts`

**Interfaces:**
- Produces: `searchEntries(f: { projectId?: string; from?: string; to?: string; text?: string; field?: { key: string; value: string } }): Promise<any[]>` — builds a Postgres query: `project_id` eq, `work_date` gte/lte, `values->>key ilike` for a chosen field, and free-text via `or(ilike on key columns)`.
- Consumes: `supabase`.

- [ ] **Step 1: Failing test**

`src/features/search/api.test.ts`:

```ts
import { vi } from 'vitest'
const calls: any = {}
const builder: any = {
  eq: vi.fn(() => builder), gte: vi.fn(() => builder), lte: vi.fn(() => builder),
  ilike: vi.fn(() => builder), order: vi.fn(() => Promise.resolve({ data: [], error: null })),
}
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => builder }) } }))
import { searchEntries } from './api'

test('applies project, date range and field filters', async () => {
  await searchEntries({ projectId: 'p1', from: '2026-06-01', to: '2026-06-30', field: { key: 'site_location', value: 'נצרים' } })
  expect(builder.eq).toHaveBeenCalledWith('project_id', 'p1')
  expect(builder.gte).toHaveBeenCalledWith('work_date', '2026-06-01')
  expect(builder.lte).toHaveBeenCalledWith('work_date', '2026-06-30')
  expect(builder.ilike).toHaveBeenCalledWith('values->>site_location', '%נצרים%')
})
```

- [ ] **Step 2: Run, verify fail** — FAIL.

- [ ] **Step 3: Implement search api**

`src/features/search/api.ts`:

```ts
import { supabase } from '../../lib/supabase'

export interface SearchFilters {
  projectId?: string; from?: string; to?: string; text?: string; field?: { key: string; value: string }
}

export async function searchEntries(f: SearchFilters) {
  let q: any = supabase.from('entries').select('*, projects(name)')
  if (f.projectId) q = q.eq('project_id', f.projectId)
  if (f.from) q = q.gte('work_date', f.from)
  if (f.to) q = q.lte('work_date', f.to)
  if (f.field?.value) q = q.ilike(`values->>${f.field.key}`, `%${f.field.value}%`)
  if (f.text) q = q.ilike('values->>daily_content', `%${f.text}%`)
  const { data, error } = await q.order('work_date', { ascending: false })
  if (error) throw error
  return (data as any[]).map(r => ({ ...r, project_name: r.projects?.name ?? '' }))
}
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Implement Search screen**

`src/features/search/Search.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchEntries } from './api'
import { listProjects } from '../projects/api'
import { listFields } from '../fields/api'
import type { Project, FieldDef } from '../../lib/types'

export default function Search() {
  const [projects, setProjects] = useState<Project[]>([]); const [defs, setDefs] = useState<FieldDef[]>([])
  const [projectId, setProjectId] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [fieldKey, setFieldKey] = useState(''); const [fieldVal, setFieldVal] = useState(''); const [text, setText] = useState('')
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { listProjects().then(setProjects); listFields(true).then(setDefs) }, [])
  const run = () => searchEntries({ projectId: projectId || undefined, from: from || undefined, to: to || undefined,
    text: text || undefined, field: fieldKey && fieldVal ? { key: fieldKey, value: fieldVal } : undefined }).then(setRows)
  return (
    <section>
      <h2>Search</h2>
      <select aria-label="filter project" value={projectId} onChange={e => setProjectId(e.target.value)}>
        <option value="">All projects</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input aria-label="from" type="date" value={from} onChange={e => setFrom(e.target.value)} />
      <input aria-label="to" type="date" value={to} onChange={e => setTo(e.target.value)} />
      <select aria-label="field" value={fieldKey} onChange={e => setFieldKey(e.target.value)}>
        <option value="">— field —</option>{defs.map(d => <option key={d.id} value={d.key}>{d.label_en}</option>)}
      </select>
      <input aria-label="field value" value={fieldVal} onChange={e => setFieldVal(e.target.value)} />
      <input aria-label="free text" placeholder="content…" value={text} onChange={e => setText(e.target.value)} />
      <button onClick={run}>Search</button>
      <ul>{rows.map(r => <li key={r.id}><Link to={`/entry/${r.id}`}>{r.project_name} — {r.work_date}</Link></li>)}</ul>
    </section>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/search
git commit -m "feat: advanced search by project, date, field, text"
```

---

## Task 15: Email rendering + Edge Function + Send dialog (screens 5)

**Files:**
- Create: `supabase/functions/send-email/index.ts`, `supabase/functions/send-email/render.ts`, `src/features/dist/SendDialog.tsx`
- Test: `supabase/functions/send-email/render.test.ts`

**Interfaces:**
- Produces:
  - `renderEmailHtml(input: { projectName: string; fields: { label: string; value: string }[]; photoUrls: string[] }): string` (pure) — project name at top, table of labels/values, inline `<img>` per photo.
  - Edge Function `send-email`: receives `{ entry_id, lang, listIds, individuals }`, resolves recipients, builds signed photo URLs, renders HTML, sends via Resend, updates `entries.last_sent_at`.
  - `SendDialog`: pick lists + type individuals → POST to the function via `supabase.functions.invoke`.
- Consumes: dist api, entries api.

- [ ] **Step 1: Failing test for renderer (pure, runs in vitest)**

`supabase/functions/send-email/render.test.ts`:

```ts
import { renderEmailHtml } from './render'

test('renders project at top, fields and photos', () => {
  const html = renderEmailHtml({
    projectName: 'בני נצרים',
    fields: [{ label: 'Work manager name', value: 'פבל איסחיזוב' }],
    photoUrls: ['https://x/y.jpg'],
  })
  expect(html).toContain('בני נצרים')
  expect(html).toContain('Work manager name')
  expect(html).toContain('פבל איסחיזוב')
  expect(html).toContain('<img')
  expect(html).toContain('https://x/y.jpg')
})
```

> Add `supabase/functions/**` to the vitest `include`, or place render.ts so vitest picks it up (default include covers `**/*.test.ts`).

- [ ] **Step 2: Run, verify fail** — FAIL.

- [ ] **Step 3: Implement pure renderer**

`supabase/functions/send-email/render.ts`:

```ts
export function renderEmailHtml(input: {
  projectName: string; fields: { label: string; value: string }[]; photoUrls: string[]; logoUrl?: string
}): string {
  const logo = input.logoUrl ? `<img src="${input.logoUrl}" alt="Agrotop" style="max-width:200px;margin-bottom:8px" />` : ''
  const rows = input.fields.map(f => `<tr><td style="font-weight:bold;padding:4px">${f.label}</td><td style="padding:4px">${f.value}</td></tr>`).join('')
  const imgs = input.photoUrls.map(u => `<img src="${u}" style="max-width:480px;margin:6px 0" />`).join('')
  return `<div dir="auto">${logo}<h2>${input.projectName}</h2><table>${rows}</table><div>${imgs}</div></div>`
}
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Implement Edge Function**

`supabase/functions/send-email/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmailHtml } from './render.ts'

Deno.serve(async (req) => {
  const { entry_id, lang, listIds, individuals } = await req.json()
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: entry } = await admin.from('entries').select('*, projects(name)').eq('id', entry_id).single()
  const { data: defs } = await admin.from('field_definitions').select('*').order('sort_order')
  const { data: photos } = await admin.from('entry_photos').select('storage_path').eq('entry_id', entry_id)

  const fields = (defs ?? []).filter((d: any) => d.type !== 'photo').map((d: any) => ({
    label: lang === 'he' ? d.label_he : d.label_en, value: String(entry.values[d.key] ?? ''),
  }))
  const photoUrls: string[] = []
  for (const p of photos ?? []) {
    const { data } = await admin.storage.from('photos').createSignedUrl(p.storage_path.replace(/^photos\//, ''), 3600)
    if (data) photoUrls.push(data.signedUrl)
  }

  // resolve recipients
  let emails = [...(individuals ?? [])]
  if (listIds?.length) {
    const { data: recs } = await admin.from('list_recipients').select('email').in('list_id', listIds)
    emails = emails.concat((recs ?? []).map((r: any) => r.email))
  }
  emails = Array.from(new Set(emails.map((e: string) => e.trim()).filter(Boolean)))

  const html = renderEmailHtml({ projectName: entry.projects?.name ?? '', fields, photoUrls, logoUrl: Deno.env.get('MAIL_LOGO_URL') })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), to: emails, subject: `Work Diary — ${entry.projects?.name ?? ''}`, html }),
  })
  if (!res.ok) return new Response(await res.text(), { status: 500 })

  await admin.from('entries').update({ last_sent_at: new Date().toISOString() }).eq('id', entry_id)
  return new Response(JSON.stringify({ ok: true, sent: emails.length }), { headers: { 'Content-Type': 'application/json' } })
})
```

- [ ] **Step 6: Deploy + set secrets**

```bash
supabase functions deploy send-email
supabase secrets set RESEND_API_KEY=... MAIL_FROM="diary@yourdomain.com"
```

- [ ] **Step 7: Implement SendDialog**

`src/features/dist/SendDialog.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listLists } from './api'
import { supabase } from '../../lib/supabase'

export default function SendDialog() {
  const { id } = useParams(); const nav = useNavigate(); const { i18n } = useTranslation()
  const [lists, setLists] = useState<any[]>([]); const [picked, setPicked] = useState<string[]>([])
  const [individuals, setIndividuals] = useState(''); const [status, setStatus] = useState('')
  useEffect(() => { listLists().then(setLists) }, [])
  const send = async () => {
    setStatus('sending')
    const { error } = await supabase.functions.invoke('send-email', {
      body: { entry_id: id, lang: i18n.language, listIds: picked,
        individuals: individuals.split(',').map(s => s.trim()).filter(Boolean) },
    })
    if (error) { setStatus(error.message); return }
    setStatus('sent'); nav(`/entry/${id}`)
  }
  return (
    <section>
      <h2>Send email</h2>
      {lists.map(l => (
        <label key={l.id}><input type="checkbox" checked={picked.includes(l.id)}
          onChange={e => setPicked(p => e.target.checked ? [...p, l.id] : p.filter(x => x !== l.id))} /> {l.name}</label>
      ))}
      <input aria-label="individual emails" placeholder="a@x.com, b@y.com" value={individuals} onChange={e => setIndividuals(e.target.value)} />
      <button onClick={send}>Send</button>
      <p role="status">{status}</p>
    </section>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/send-email src/features/dist/SendDialog.tsx
git commit -m "feat: email renderer, send-email edge function, send dialog"
```

---

## Task 16: Routing, layout, nav, PWA wiring

**Files:**
- Modify: `src/main.tsx`, `src/App.tsx`
- Test: `src/App.routes.test.tsx`

**Interfaces:**
- Consumes: every screen + `AuthProvider`, `RequireAuth`, `RequireAdmin`, `LanguageToggle`.
- Produces: routes `/login`, `/` (list), `/new`, `/entry/:id`, `/entry/:id/edit`, `/entry/:id/send`, `/search`, `/lists`, `/admin/projects`, `/admin/fields`.

- [ ] **Step 1: Failing route test**

`src/App.routes.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
vi.mock('./auth/AuthProvider', () => ({
  AuthProvider: ({ children }: any) => children,
  useAuth: () => ({ session: { user: { id: 'u1' } }, role: 'admin', loading: false }),
}))
vi.mock('./features/entries/api', () => ({ listEntries: () => Promise.resolve([]) }))
import App from './App'

test('authenticated root shows Entries', async () => {
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
  expect(await screen.findByText(/Entries/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, verify fail** — FAIL.

- [ ] **Step 3: Implement App routes + nav**

`src/App.tsx`:

```tsx
import { Routes, Route, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageToggle from './i18n/LanguageToggle'
import { useAuth } from './auth/AuthProvider'
import RequireAuth from './auth/RequireAuth'
import RequireAdmin from './auth/RequireAdmin'
import Login from './auth/Login'
import EntriesList from './features/entries/EntriesList'
import EntryForm from './features/entries/EntryForm'
import EntryDetail from './features/entries/EntryDetail'
import Search from './features/search/Search'
import DistributionLists from './features/dist/DistributionLists'
import SendDialog from './features/dist/SendDialog'
import ProjectsAdmin from './features/projects/ProjectsAdmin'
import FormBuilder from './features/fields/FormBuilder'

export default function App() {
  const { t } = useTranslation(); const { session, role } = useAuth()
  return (
    <div>
      <header style={{ borderBottom: '2px solid #3aaa35' }}>
        <img src="/agrotop-logo.png" alt="Agrotop" style={{ height: 36, verticalAlign: 'middle' }} />
        {' '}{t('app_title')}
        {session && <nav>
          <Link to="/">{t('search') /* list */}</Link> <Link to="/new">+</Link> <Link to="/search">{t('search')}</Link>
          <Link to="/lists">@</Link>
          {role === 'admin' && <><Link to="/admin/projects">{t('project')}</Link> <Link to="/admin/fields">⚙</Link></>}
        </nav>}
        <LanguageToggle />
      </header>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><EntriesList /></RequireAuth>} />
        <Route path="/new" element={<RequireAuth><EntryForm /></RequireAuth>} />
        <Route path="/entry/:id" element={<RequireAuth><EntryDetail /></RequireAuth>} />
        <Route path="/entry/:id/edit" element={<RequireAuth><EntryForm /></RequireAuth>} />
        <Route path="/entry/:id/send" element={<RequireAuth><SendDialog /></RequireAuth>} />
        <Route path="/search" element={<RequireAuth><Search /></RequireAuth>} />
        <Route path="/lists" element={<RequireAuth><DistributionLists /></RequireAuth>} />
        <Route path="/admin/projects" element={<RequireAdmin><ProjectsAdmin /></RequireAdmin>} />
        <Route path="/admin/fields" element={<RequireAdmin><FormBuilder /></RequireAdmin>} />
      </Routes>
    </div>
  )
}
```

`src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './i18n/index'
import { AuthProvider } from './auth/AuthProvider'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider><App /></AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Update the App.test.tsx from Task 1**

The Task 1 banner test still passes (header present). If it now needs router/auth context, wrap with the same mocks as Step 1. Run full suite: `npx vitest run` → all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/main.tsx src/App.routes.test.tsx
git commit -m "feat: routing, nav, layout, PWA app wiring"
```

---

## Task 17: End-to-end smoke + docs

**Files:**
- Create: `README.md`
- Modify: `.env.example` (already present)

- [ ] **Step 1: Write README**

Document: prerequisites (Node, Supabase CLI, Resend account), `npm install`, **place the Agrotop logo at `public/agrotop-logo.png` and `src/assets/agrotop-logo.png`**, copy `.env.example`→`.env` with project URL + anon key, `supabase start`/`db reset`, create first admin (`update profiles set role='admin' where id=...`), `supabase functions deploy send-email` + secrets (`RESEND_API_KEY`, `MAIL_FROM`, `MAIL_LOGO_URL` → a hosted URL of the logo), `npm run dev`, `npm run build`, install as PWA on phone/Windows.

- [ ] **Step 2: Manual smoke checklist (run against local Supabase)**

1. Sign up a user, promote to admin via SQL.
2. Admin: add project "בני נצרים"; verify it appears in entry dropdown.
3. Create entry: pick project, fill fields, upload 1 photo, Save → appears in list.
4. Open detail → photo renders. Toggle He/En → labels + dir change.
5. Create distribution list + recipient; Send email → recipient receives inline email with photo; `last_sent_at` set.
6. Search by project + date range + content text → entry found.
7. Admin: add a custom field → appears on new entry form + search field list.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: setup and smoke-test guide"
```

---

## Self-Review Notes (coverage vs spec)

- Delivery PWA → Task 1 (vite-plugin-pwa), Task 16. ✓
- Team login + roles → Task 2 (profiles/RLS), Task 6. ✓
- Bilingual He/En + RTL → Task 5, used in forms/detail/email. ✓
- Projects admin + per-entry dropdown + filter → Tasks 7, 11, 14. ✓
- Custom fields admin-only + dynamic form + searchable → Tasks 8, 11, 14. ✓
- Photos ≥1 required → Tasks 9, 8 (validation), 11. ✓
- Inline email w/ photos to lists+individuals → Tasks 13, 15. ✓
- Advanced search (project/date/field/text) → Task 14. ✓
- Shared data → RLS Task 2. ✓
- Secrets server-side only → Task 15 (Edge Function env). ✓
