import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ReactElement } from 'react'
import { Shell } from './components/Shell'
import { useAuth } from './auth'
import Login from './screens/Login'
import Logbook from './screens/Logbook'
import EntryForm from './screens/EntryForm'
import EntryDetail from './screens/EntryDetail'
import Search from './screens/Search'
import Lists from './screens/Lists'
import Projects from './screens/admin/Projects'
import FormBuilder from './screens/admin/FormBuilder'
import Users from './screens/admin/Users'

function RequireAuth({ children }: { children: ReactElement }) {
  const { user } = useAuth()
  const loc = useLocation()
  return user ? children : <Navigate to="/login" replace state={{ from: loc }} />
}
function RequireAdmin({ children }: { children: ReactElement }) {
  const { isAdmin } = useAuth()
  return isAdmin ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Logbook />} />
        <Route path="new" element={<EntryForm />} />
        <Route path="entry/:id" element={<EntryDetail />} />
        <Route path="search" element={<Search />} />
        <Route path="lists" element={<Lists />} />
        <Route path="admin/projects" element={<RequireAdmin><Projects /></RequireAdmin>} />
        <Route path="admin/fields" element={<RequireAdmin><FormBuilder /></RequireAdmin>} />
        <Route path="admin/users" element={<RequireAdmin><Users /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
