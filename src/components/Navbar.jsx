import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleDisplay = (role) => {
    const roles = {
      operator: 'Operator',
      cutting_master: 'Cutting Master',
      stitching_master: 'Stitching Master',
      finishing: 'Finishing',
      warehouse: 'Warehouse'
    };
    return roles[role] || role;
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      operator: 'bg-green-100 text-green-700 border-green-200',
      cutting_master: 'bg-blue-100 text-blue-700 border-blue-200',
      stitching_master: 'bg-blue-100 text-blue-700 border-blue-200',
      finishing: 'bg-red-100 text-red-700 border-red-200',
      warehouse: 'bg-blue-100 text-blue-700 border-blue-200'
    };
    return colors[role] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const navLinks = user?.role === 'operator' ? [
    { path: '/operator', label: 'Dashboard' },
    { path: '/operator/users', label: 'Users' },
    { path: '/cutting', label: 'Cutting' },
  ] : user?.role === 'cutting_master' ? [
    { path: '/cutting', label: 'Dashboard' },
    { path: '/cutting/create', label: 'New Lot' },
  ] : [];

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 bg-green-600">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <span className="text-lg font-bold text-gray-900 tracking-tight">
                NOWI<span className="text-green-600">.</span>ERP
              </span>
            </Link>

            {/* Navigation Links */}
            {navLinks.length > 0 && (
              <div className="hidden md:flex items-center gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      location.pathname === link.path
                        ? 'bg-green-50 text-green-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* User Section */}
          {user && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm bg-blue-600">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-900 leading-tight">{user.name}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${getRoleBadgeColor(user.role)}`}>
                    {getRoleDisplay(user.role)}
                  </span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
