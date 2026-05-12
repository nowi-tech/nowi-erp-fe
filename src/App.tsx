import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/auth';
import { AppToaster, ToastProvider } from './components/ui/toast';
import ProtectedRoute from './components/ProtectedRouteV2';
// import PlaceholderSection from './components/PlaceholderSection'; // TODO: re-enable when commented stub routes return
import PwaInstallPrompt from './components/PwaInstallPrompt';
import Onboarding from './components/Onboarding';

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
const ReceiveFromKotty = lazy(
  () => import('./pages/stitching/ReceiveFromKotty'),
);
const FinishingHome = lazy(() => import('./pages/finishing/FinishingHome'));
const FinishingReceiveLot = lazy(
  () => import('./pages/finishing/FinishingReceiveLot'),
);
const DataHome = lazy(() => import('./pages/data/DataHome'));
const UsersPage = lazy(() => import('./pages/admin/Users'));

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

// function AdminPlaceholder({ titleKey }: { titleKey: string }) {
//   const { t } = useTranslation();
//   return <PlaceholderSection title={t(titleKey)} />;
// }

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppToaster />
        <PwaInstallPrompt />
        <Onboarding />
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
                <ProtectedRoute allowedRoles={['admin', 'viewer', 'data_manager']}>
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
                path="users"
                element={
                  <S>
                    <UsersPage />
                  </S>
                }
              />
              {/* TODO: build — admin Vendors, SKUs and Settings pages.
                  Routes intentionally hidden so the menu doesn't surface stubs.
                  Master-data CRUD lives under /data for the data_manager role.
              <Route
                path="vendors"
                element={<AdminPlaceholder titleKey="admin.placeholder.vendors" />}
              />
              <Route
                path="skus"
                element={<AdminPlaceholder titleKey="admin.placeholder.skus" />}
              />
              <Route
                path="settings"
                element={<AdminPlaceholder titleKey="admin.placeholder.settings" />}
              />
              */}
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
              path="/stitching/receive"
              element={
                <ProtectedRoute allowedRoles={['stitching_master', 'admin']}>
                  <S>
                    <ReceiveFromKotty />
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
                    <AdminShell />
                  </S>
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={
                  <S>
                    <DataHome />
                  </S>
                }
              />
            </Route>

            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
