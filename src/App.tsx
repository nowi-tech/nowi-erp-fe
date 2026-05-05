import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider as LegacyAuthProvider } from './context/AuthContext';
import { AuthProvider } from './context/auth';
import ProtectedRouteV2 from './components/ProtectedRouteV2';
import LegacyProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Legacy pages (.jsx) — kept buildable via allowJs; do not modify.
import CuttingDashboard from './pages/cutting/CuttingDashboard';
import CreateLot from './pages/cutting/CreateLot';
import ViewLot from './pages/cutting/ViewLot';
import StageDashboard from './pages/stage/StageDashboard';
import ReceiveLot from './pages/stage/ReceiveLot';
import OperatorDashboard from './pages/operator/OperatorDashboard';
import UserManagement from './pages/operator/UserManagement';
import SkuConfig from './pages/operator/SkuConfig';
import SkuLinks from './pages/operator/SkuLinks';

const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
const StitchingHome = lazy(() => import('./pages/stitching/StitchingHome'));
const FinishingHome = lazy(() => import('./pages/finishing/FinishingHome'));
const DataHome = lazy(() => import('./pages/data/DataHome'));

function PageSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse h-4 w-32 rounded bg-[var(--color-muted)]" />
    </div>
  );
}

function S({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

function App() {
  return (
    <AuthProvider>
      <LegacyAuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <ProtectedRouteV2>
                  <Dashboard />
                </ProtectedRouteV2>
              }
            />

            {/* New role-based routes */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRouteV2 allowedRoles={['admin', 'viewer']}>
                  <S>
                    <AdminHome />
                  </S>
                </ProtectedRouteV2>
              }
            />
            <Route
              path="/stitching"
              element={
                <ProtectedRouteV2 allowedRoles={['stitching_master', 'admin', 'viewer']}>
                  <S>
                    <StitchingHome />
                  </S>
                </ProtectedRouteV2>
              }
            />
            <Route
              path="/finishing"
              element={
                <ProtectedRouteV2 allowedRoles={['finishing_master', 'admin', 'viewer']}>
                  <S>
                    <FinishingHome />
                  </S>
                </ProtectedRouteV2>
              }
            />
            <Route
              path="/data"
              element={
                <ProtectedRouteV2 allowedRoles={['data_manager', 'admin', 'viewer']}>
                  <S>
                    <DataHome />
                  </S>
                </ProtectedRouteV2>
              }
            />

            {/* Legacy routes — kept until replacements ship */}
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route
              path="/cutting"
              element={
                <LegacyProtectedRoute allowedRoles={['cutting_master', 'operator']}>
                  <CuttingDashboard />
                </LegacyProtectedRoute>
              }
            />
            <Route
              path="/cutting/create"
              element={
                <LegacyProtectedRoute allowedRoles={['cutting_master']}>
                  <CreateLot />
                </LegacyProtectedRoute>
              }
            />
            <Route
              path="/cutting/lot/:lotNo"
              element={
                <LegacyProtectedRoute allowedRoles={['cutting_master', 'operator']}>
                  <ViewLot />
                </LegacyProtectedRoute>
              }
            />
            <Route
              path="/stage/:stageName"
              element={
                <LegacyProtectedRoute>
                  <StageDashboard />
                </LegacyProtectedRoute>
              }
            />
            <Route
              path="/stage/:stageName/receive/:lotNo"
              element={
                <LegacyProtectedRoute>
                  <ReceiveLot />
                </LegacyProtectedRoute>
              }
            />
            <Route
              path="/operator"
              element={
                <LegacyProtectedRoute allowedRoles={['operator']}>
                  <OperatorDashboard />
                </LegacyProtectedRoute>
              }
            />
            <Route
              path="/operator/users"
              element={
                <LegacyProtectedRoute allowedRoles={['operator']}>
                  <UserManagement />
                </LegacyProtectedRoute>
              }
            />
            <Route
              path="/operator/sku-config"
              element={
                <LegacyProtectedRoute allowedRoles={['operator']}>
                  <SkuConfig />
                </LegacyProtectedRoute>
              }
            />
            <Route
              path="/operator/sku-links"
              element={
                <LegacyProtectedRoute allowedRoles={['operator']}>
                  <SkuLinks />
                </LegacyProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </LegacyAuthProvider>
    </AuthProvider>
  );
}

export default App;
