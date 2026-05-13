import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import type { UserRole } from '@/api/types';

const ROLE_HOMES: Record<UserRole, string> = {
  admin: '/admin',
  floor_manager: '/floor',
  stitching_master: '/stitching',
  finishing_master: '/finishing',
  data_manager: '/data',
  viewer: '/admin',
};

// Legacy roles still present in dev DB → fall through to admin so the user lands somewhere usable.
const LEGACY_ROLES = new Set(['operator', 'cutting_master', 'finishing', 'warehouse']);

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  const role = user.role as string;
  if (role in ROLE_HOMES) {
    return <Navigate to={ROLE_HOMES[role as UserRole]} replace />;
  }
  if (LEGACY_ROLES.has(role)) {
    return <Navigate to="/admin" replace />;
  }
  return <Navigate to="/login" replace />;
}
