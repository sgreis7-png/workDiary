import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ReactElement, Suspense, lazy } from 'react'
import { Shell } from './components/Shell'
import { Loader } from './components/Loader'
import { useAuth } from './auth'
import { usePerms } from './lib/usePerms'
import type { PermArea } from './lib/perms'

// Eager: the two screens a signed-out visitor sees first, and the diary, which the index
// renders directly — putting a spinner in front of any of those would be a step backwards.
import Login from './screens/Login'
import SetPassword from './screens/SetPassword'
import Logbook from './screens/Logbook'

// Everything else loads when it is first visited. A foreman opening the diary on a phone was
// downloading the admin form builder, the Gantt chart and the CSV export before he could read
// an entry.
const Calendar = lazy(() => import('./screens/Calendar'))
const EntryForm = lazy(() => import('./screens/EntryForm'))
const EntryDetail = lazy(() => import('./screens/EntryDetail'))
const Search = lazy(() => import('./screens/Search'))
const Account = lazy(() => import('./screens/Account'))
const ReportView = lazy(() => import('./screens/ReportView'))
const Dashboard = lazy(() => import('./screens/Dashboard'))
const ExportView = lazy(() => import('./screens/ExportView'))
const Projects = lazy(() => import('./screens/admin/Projects'))
const FormBuilder = lazy(() => import('./screens/admin/FormBuilder'))
const Users = lazy(() => import('./screens/admin/Users'))
const Coops = lazy(() => import('./screens/defects/Coops'))
const CoopView = lazy(() => import('./screens/defects/CoopView'))
const CoopReport = lazy(() => import('./screens/defects/CoopReport'))
const DefectFormBuilder = lazy(() => import('./screens/admin/DefectFormBuilder'))
const DefectSearch = lazy(() => import('./screens/defects/DefectSearch'))
const QCDashboard = lazy(() => import('./screens/defects/QCDashboard'))
const Tasks = lazy(() => import('./screens/Tasks'))
const Messages = lazy(() => import('./screens/Messages'))
const AlertRules = lazy(() => import('./screens/AlertRules'))
const DistLists = lazy(() => import('./screens/DistLists'))
const Digest = lazy(() => import('./screens/Digest'))
const Feedback = lazy(() => import('./screens/admin/Feedback'))
const GanttScreen = lazy(() => import('./screens/Gantt'))
const ControlCenter = lazy(() => import('./screens/ControlCenter'))

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Loader full label="טוען…" />
  return user ? children : <Navigate to="/login" replace state={{ from: loc }} />
}
function RequireAdmin({ children }: { children: ReactElement }) {
  const { isAdmin } = useAuth()
  return isAdmin ? children : <Navigate to="/" replace />
}
/** Area gate: `edit` demands edit level; otherwise view is enough. */
function RequirePerm({ area, edit, children }: { area: PermArea; edit?: boolean; children: ReactElement }) {
  const { perm, permsReady } = usePerms()
  const { loading } = useAuth()
  if (loading || !permsReady) return <Loader full label="טוען…" />
  const level = perm(area)
  const ok = edit ? level === 'edit' : level !== 'none'
  return ok ? children : <Navigate to="/" replace />
}
/**
 * Index: the first thing this user is actually allowed to see.
 *
 * This used to be decided by a stored "mode" the user picked on first run, which also
 * hid half the navigation. The sidebar now lists both the diary and the quality module,
 * so the mode only ever chose a landing page — and choosing it from permissions is both
 * more accurate and one less decision to put in front of someone signing in.
 */
function Home() {
  const { perm, permsReady } = usePerms()
  const { loading } = useAuth()
  if (loading || !permsReady) return <Loader full label="טוען…" />
  if (perm('logbook') !== 'none') return <Logbook />
  if (perm('defects') !== 'none') return <Navigate to="/defects" replace />
  if (perm('control_center') !== 'none') return <Navigate to="/control" replace />
  if (perm('dashboard') !== 'none') return <Navigate to="/dashboard" replace />
  return <Navigate to="/tasks" replace />
}

export default function App() {
  return (
    // One boundary around the whole table: a route change swaps the screen, and the same
    // full-page loader the auth and permission gates already use covers the fetch.
    <Suspense fallback={<Loader full label="טוען…" />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/report/:id" element={<RequireAuth><ReportView /></RequireAuth>} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="defects" element={<RequirePerm area="defects"><Coops /></RequirePerm>} />
        <Route path="defects/search" element={<RequirePerm area="defects"><DefectSearch /></RequirePerm>} />
        <Route path="defects/dashboard" element={<RequirePerm area="dashboard"><QCDashboard /></RequirePerm>} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="defects/coop/:id" element={<RequirePerm area="defects"><CoopView /></RequirePerm>} />
        <Route path="defects/coop/:id/report" element={<RequirePerm area="defects"><CoopReport /></RequirePerm>} />
        <Route path="dashboard" element={<RequirePerm area="dashboard"><Dashboard /></RequirePerm>} />
        <Route path="digest" element={<RequirePerm area="dashboard"><Digest /></RequirePerm>} />
        <Route path="calendar" element={<RequirePerm area="calendar"><Calendar /></RequirePerm>} />
        <Route path="new" element={<RequirePerm area="logbook" edit><EntryForm /></RequirePerm>} />
        <Route path="edit/:id" element={<RequirePerm area="logbook" edit><EntryForm /></RequirePerm>} />
        <Route path="entry/:id" element={<RequirePerm area="logbook"><EntryDetail /></RequirePerm>} />
        <Route path="search" element={<RequirePerm area="search"><Search /></RequirePerm>} />
        <Route path="account" element={<Account />} />
        <Route path="messages" element={<Messages />} />
        <Route path="alert-rules" element={<RequirePerm area="alert_rules"><AlertRules /></RequirePerm>} />
        <Route path="lists" element={<DistLists />} />
        <Route path="projects" element={<RequirePerm area="projects"><Projects /></RequirePerm>} />
        <Route path="control" element={<RequirePerm area="control_center"><ControlCenter /></RequirePerm>} />
        <Route path="gantt" element={<RequirePerm area="gantt"><GanttScreen /></RequirePerm>} />
        <Route path="export" element={<RequirePerm area="export"><ExportView /></RequirePerm>} />
        <Route path="admin/fields" element={<RequirePerm area="form_builder" edit><FormBuilder /></RequirePerm>} />
        <Route path="admin/defect-items" element={<RequirePerm area="form_builder" edit><DefectFormBuilder /></RequirePerm>} />
        <Route path="admin/users" element={<RequireAdmin><Users /></RequireAdmin>} />
        <Route path="admin/feedback" element={<RequireAdmin><Feedback /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
