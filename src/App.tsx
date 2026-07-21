import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ReactElement } from 'react'
import { Shell } from './components/Shell'
import { Loader } from './components/Loader'
import { useAuth } from './auth'
import Login from './screens/Login'
import SetPassword from './screens/SetPassword'
import Logbook from './screens/Logbook'
import Calendar from './screens/Calendar'
import EntryForm from './screens/EntryForm'
import EntryDetail from './screens/EntryDetail'
import Search from './screens/Search'
import Account from './screens/Account'
import ReportView from './screens/ReportView'
import Dashboard from './screens/Dashboard'
import ExportView from './screens/ExportView'
import Projects from './screens/admin/Projects'
import FormBuilder from './screens/admin/FormBuilder'
import Users from './screens/admin/Users'
import ModeSelect from './screens/ModeSelect'
import Coops from './screens/defects/Coops'
import CoopView from './screens/defects/CoopView'
import CoopReport from './screens/defects/CoopReport'
import DefectFormBuilder from './screens/admin/DefectFormBuilder'
import DefectSearch from './screens/defects/DefectSearch'
import QCDashboard from './screens/defects/QCDashboard'
import Tasks from './screens/Tasks'
import Messages from './screens/Messages'
import AlertRules from './screens/AlertRules'
import { usePerms } from './lib/usePerms'
import type { PermArea } from './lib/perms'
import { getMode } from './defects/mode'

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
/** Index: first visit → mode chooser; defects mode → its home; work mode → logbook. */
function Home() {
  const mode = getMode()
  if (!mode) return <Navigate to="/mode" replace />
  if (mode === 'defects') return <Navigate to="/defects" replace />
  return <Logbook />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/report/:id" element={<RequireAuth><ReportView /></RequireAuth>} />
      <Route path="/mode" element={<RequireAuth><ModeSelect /></RequireAuth>} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="defects" element={<RequirePerm area="defects"><Coops /></RequirePerm>} />
        <Route path="defects/search" element={<RequirePerm area="defects"><DefectSearch /></RequirePerm>} />
        <Route path="defects/dashboard" element={<RequirePerm area="dashboard"><QCDashboard /></RequirePerm>} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="defects/coop/:id" element={<RequirePerm area="defects"><CoopView /></RequirePerm>} />
        <Route path="defects/coop/:id/report" element={<RequirePerm area="defects"><CoopReport /></RequirePerm>} />
        <Route path="dashboard" element={<RequirePerm area="dashboard"><Dashboard /></RequirePerm>} />
        <Route path="calendar" element={<RequirePerm area="calendar"><Calendar /></RequirePerm>} />
        <Route path="new" element={<RequirePerm area="logbook" edit><EntryForm /></RequirePerm>} />
        <Route path="edit/:id" element={<RequirePerm area="logbook" edit><EntryForm /></RequirePerm>} />
        <Route path="entry/:id" element={<RequirePerm area="logbook"><EntryDetail /></RequirePerm>} />
        <Route path="search" element={<RequirePerm area="search"><Search /></RequirePerm>} />
        <Route path="account" element={<Account />} />
        <Route path="messages" element={<Messages />} />
        <Route path="alert-rules" element={<RequirePerm area="alert_rules"><AlertRules /></RequirePerm>} />
        <Route path="projects" element={<RequirePerm area="projects"><Projects /></RequirePerm>} />
        <Route path="export" element={<RequirePerm area="export"><ExportView /></RequirePerm>} />
        <Route path="admin/fields" element={<RequirePerm area="form_builder" edit><FormBuilder /></RequirePerm>} />
        <Route path="admin/defect-items" element={<RequirePerm area="form_builder" edit><DefectFormBuilder /></RequirePerm>} />
        <Route path="admin/users" element={<RequireAdmin><Users /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
