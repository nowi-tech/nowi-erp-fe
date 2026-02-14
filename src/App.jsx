import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CuttingDashboard from './pages/cutting/CuttingDashboard';
import CreateLot from './pages/cutting/CreateLot';
import ViewLot from './pages/cutting/ViewLot';
import StageDashboard from './pages/stage/StageDashboard';
import ReceiveLot from './pages/stage/ReceiveLot';
import OperatorDashboard from './pages/operator/OperatorDashboard';
import UserManagement from './pages/operator/UserManagement';
import SkuConfig from './pages/operator/SkuConfig';
import SkuLinks from './pages/operator/SkuLinks';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Protected - Dashboard redirect */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />

          {/* Cutting Master Routes */}
          <Route path="/cutting" element={
            <ProtectedRoute allowedRoles={['cutting_master', 'operator']}>
              <CuttingDashboard />
            </ProtectedRoute>
          } />
          <Route path="/cutting/create" element={
            <ProtectedRoute allowedRoles={['cutting_master']}>
              <CreateLot />
            </ProtectedRoute>
          } />
          <Route path="/cutting/lot/:lotNo" element={
            <ProtectedRoute allowedRoles={['cutting_master', 'operator']}>
              <ViewLot />
            </ProtectedRoute>
          } />

          {/* Stage Routes (stitching, finishing, dispatch) */}
          <Route path="/stage/:stageName" element={
            <ProtectedRoute>
              <StageDashboard />
            </ProtectedRoute>
          } />
          <Route path="/stage/:stageName/receive/:lotNo" element={
            <ProtectedRoute>
              <ReceiveLot />
            </ProtectedRoute>
          } />

          {/* Operator Routes */}
          <Route path="/operator" element={
            <ProtectedRoute allowedRoles={['operator']}>
              <OperatorDashboard />
            </ProtectedRoute>
          } />
          <Route path="/operator/users" element={
            <ProtectedRoute allowedRoles={['operator']}>
              <UserManagement />
            </ProtectedRoute>
          } />
          <Route path="/operator/sku-config" element={
            <ProtectedRoute allowedRoles={['operator']}>
              <SkuConfig />
            </ProtectedRoute>
          } />
          <Route path="/operator/sku-links" element={
            <ProtectedRoute allowedRoles={['operator']}>
              <SkuLinks />
            </ProtectedRoute>
          } />

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
