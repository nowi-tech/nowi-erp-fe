import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/auth';
import { ToastProvider } from './components/ui/toast';
import ProtectedRoute from './components/ProtectedRouteV2';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
const StitchingHome = lazy(() => import('./pages/stitching/StitchingHome'));
const StitchingReceiveLot = lazy(
  () => import('./pages/stitching/StitchingReceiveLot'),
);
const FinishingHome = lazy(() => import('./pages/finishing/FinishingHome'));
const FinishingReceiveLot = lazy(
  () => import('./pages/finishing/FinishingReceiveLot'),
);
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
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/*"
              element={
                <ProtectedRoute allowedRoles={['admin', 'viewer']}>
                  <S>
                    <AdminHome />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/stitching"
              element={
                <ProtectedRoute allowedRoles={['stitching_master', 'admin', 'viewer']}>
                  <S>
                    <StitchingHome />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/stitching/lot/:lotId"
              element={
                <ProtectedRoute allowedRoles={['stitching_master', 'admin']}>
                  <S>
                    <StitchingReceiveLot />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finishing"
              element={
                <ProtectedRoute allowedRoles={['finishing_master', 'admin', 'viewer']}>
                  <S>
                    <FinishingHome />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finishing/lot/:lotId"
              element={
                <ProtectedRoute allowedRoles={['finishing_master', 'admin']}>
                  <S>
                    <FinishingReceiveLot />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/data"
              element={
                <ProtectedRoute allowedRoles={['data_manager', 'admin', 'viewer']}>
                  <S>
                    <DataHome />
                  </S>
                </ProtectedRoute>
              }
            />

            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
