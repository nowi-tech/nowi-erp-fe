import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();

  // Redirect based on role
  const getDashboardForRole = (role) => {
    switch (role) {
      case 'operator':
        return '/operator';
      case 'cutting_master':
        return '/cutting';
      case 'stitching_master':
        return '/stage/stitching';
      case 'finishing':
        return '/stage/finishing';
      case 'warehouse':
        return '/stage/dispatch';
      default:
        return '/login';
    }
  };

  return <Navigate to={getDashboardForRole(user?.role)} replace />;
}
