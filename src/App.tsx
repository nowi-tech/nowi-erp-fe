import { lazy, Suspense, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/auth';
import { ToastProvider } from './components/ui/toast';
import ProtectedRoute from './components/ProtectedRouteV2';
import PlaceholderSection from './components/PlaceholderSection';
import PwaInstallPrompt from './components/PwaInstallPrompt';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

const AdminShell = lazy(() => import('./components/layout/AdminShell'));
const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
const Locator = lazy(() => import('./pages/admin/Locator'));
const SkuDetail = lazy(() => import('./pages/admin/SkuDetail'));
const Dispatches = lazy(() => import('./pages/admin/Dispatches'));
const DispatchDetail = lazy(() => import('./pages/admin/DispatchDetail'));
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

function AdminPlaceholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return <PlaceholderSection title={t(titleKey)} />;
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <PwaInstallPrompt />
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
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin', 'viewer']}>
                  <S>
                    <AdminShell />
                  </S>
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={
                  <S>
                    <AdminHome />
                  </S>
                }
              />
              <Route
                path="locator"
                element={
                  <S>
                    <Locator />
                  </S>
                }
              />
              <Route
                path="locator/sku/:sku"
                element={
                  <S>
                    <SkuDetail />
                  </S>
                }
              />
              <Route
                path="dispatches"
                element={
                  <S>
                    <Dispatches />
                  </S>
                }
              />
              <Route
                path="dispatches/:id"
                element={
                  <S>
                    <DispatchDetail />
                  </S>
                }
              />
              <Route
                path="vendors"
                element={<AdminPlaceholder titleKey="admin.placeholder.vendors" />}
              />
              <Route
                path="skus"
                element={<AdminPlaceholder titleKey="admin.placeholder.skus" />}
              />
              <Route
                path="users"
                element={<AdminPlaceholder titleKey="admin.placeholder.users" />}
              />
              <Route
                path="settings"
                element={<AdminPlaceholder titleKey="admin.placeholder.settings" />}
              />
            </Route>

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
