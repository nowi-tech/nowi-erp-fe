import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import type { UserRole } from '@/api/types';

// Office roles now land on the unified Home at `/` (the dashboard redesign
// killed the old /admin AdminHome + /styles sampling-home split). Only the
// floor/stage roles keep their dedicated data-entry homes — they're bounced
// off `/` by HomeRoute in App.tsx. See docs/DASHBOARD_REDESIGN.md.
const ROLE_HOMES: Record<UserRole, string> = {
  admin: '/',
  floor_manager: '/floor',
  stitching_master: '/stitching',
  finishing_master: '/finishing',
  viewer: '/',
  // Submit-only role has no dashboard — lands straight on the intake form.
  design_submitter: '/styles/new',
  sampling_editor: '/',
  sampling_lead: '/',
  // Production admin is an office-home role (see OFFICE_HOME_ROLES in App.tsx).
  production_lead: '/',
  // Cataloguer is an office-home role too — lands on the unified Home.
  cataloguer: '/',
};

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  const role = user.role as string;
  if (role in ROLE_HOMES) {
    return <Navigate to={ROLE_HOMES[role as UserRole]} replace />;
  }
  // Unknown / legacy dev-DB roles have no home in the redesigned IA —
  // send them back to login rather than looping through `/admin` → `/`.
  return <Navigate to="/login" replace />;
}
