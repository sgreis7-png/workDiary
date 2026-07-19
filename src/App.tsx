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
        <Route path="defects" element={<Coops />} />
        <Route path="defects/coop/:id" element={<CoopView />} />
        <Route path="defects/coop/:id/report" element={<CoopReport />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="new" element={<EntryForm />} />
        <Route path="edit/:id" element={<EntryForm />} />
        <Route path="entry/:id" element={<EntryDetail />} />
        <Route path="search" element={<Search />} />
        <Route path="account" element={<Account />} />
        <Route path="projects" element={<Projects />} />
        <Route path="export" element={<ExportView />} />
        <Route path="admin/fields" element={<RequireAdmin><FormBuilder /></RequireAdmin>} />
        <Route path="admin/defect-items" element={<RequireAdmin><DefectFormBuilder /></RequireAdmin>} />
        <Route path="admin/users" element={<RequireAdmin><Users /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
