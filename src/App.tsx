import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/auth';
import { AppToaster, ToastProvider } from './components/ui/toast';
import ProtectedRoute from './components/ProtectedRouteV2';
// import PlaceholderSection from './components/PlaceholderSection'; // TODO: re-enable when commented stub routes return
import Onboarding from './components/Onboarding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { hideSplash } from './native/capacitor-init';
import { markChunkLoadSucceeded } from './lib/chunk-reload';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { useAuth } from './context/auth';
import { hasAnyRole, CATALOGUER_WRITE_ROLES } from './lib/userRoles';
import type { UserRole } from './api/types';

const AdminShell = lazy(() => import('./components/layout/AdminShell'));
const Home = lazy(() => import('./pages/Home'));
const Locator = lazy(() => import('./pages/admin/Locator'));
const SkuDetail = lazy(() => import('./pages/admin/SkuDetail'));
const Dispatches = lazy(() => import('./pages/admin/Dispatches'));
const DispatchDetail = lazy(() => import('./pages/admin/DispatchDetail'));
const Warehouses = lazy(() => import('./pages/admin/Warehouses'));
const StitchingHome = lazy(() => import('./pages/stitching/StitchingHome'));
const StitchingReceiveLot = lazy(
  () => import('./pages/stitching/StitchingReceiveLot'),
);
const StitchingWorkedOnDetail = lazy(
  () => import('./pages/stitching/StitchingWorkedOnDetail'),
);
const ReceiveFromKotty = lazy(
  () => import('./pages/stitching/ReceiveFromKotty'),
);
const FinishingHome = lazy(() => import('./pages/finishing/FinishingHome'));
const FinishingReceiveLot = lazy(
  () => import('./pages/finishing/FinishingReceiveLot'),
);
const FinishingWorkedOnDetail = lazy(
  () => import('./pages/finishing/FinishingWorkedOnDetail'),
);
const FloorHome = lazy(() => import('./pages/floor/FloorHome'));
const FloorEditLot = lazy(() => import('./pages/floor/FloorEditLot'));
const FloorLotDetail = lazy(() => import('./pages/floor/FloorLotDetail'));
const DataHome = lazy(() => import('./pages/data/DataHome'));
const UsersPage = lazy(() => import('./pages/admin/Users'));
const EditRequestsPage = lazy(() => import('./pages/admin/EditRequests'));
const DispatchPrint = lazy(() => import('./pages/dispatches/DispatchPrint'));
const CadPreviewPage = lazy(() => import('./pages/cad/CadPreviewPage'));
const StylesRegistry = lazy(() => import('./pages/styles/StylesRegistry'));
const ChinaImportRegistry = lazy(
  () => import('./pages/china-import/ChinaImportRegistry'),
);
const NewIntake = lazy(() => import('./pages/styles/NewIntake'));
const StyleWorkspace = lazy(() => import('./pages/styles/StyleWorkspace'));
const FabricLibrary = lazy(() => import('./pages/fabric-library/FabricLibrary'));
const ReceiveFabricChallan = lazy(
  () => import('./pages/fabric-library/ReceiveFabricChallan'),
);

function PageSkeleton() {
  // Inline shimmer — calm, sits inside whatever shell already rendered
  // (AdminShell sidebar, FloorShell header). Replaces the old fullscreen
  // centered pulse-bar that visually competed with the sidebar logo.
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function S({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

// Office roles that land on the unified Home (`/`). Floor roles
// (floor_manager / stitching_master / finishing_master) are excluded —
// they're bounced to their own data-entry homes. Mirrors the Home
// allow-list in docs/DASHBOARD_REDESIGN.md and ROLE_HOMES in Dashboard.tsx.
const OFFICE_HOME_ROLES: UserRole[] = [
  'admin',
  'viewer',
  'data_manager',
  'data_admin',
  'sampling_editor',
  'sampling_lead',
  'pattern_master_w',
  'pattern_master_m',
  'china_import_approver',
  'pd_lead',
  // Operator has no dedicated floor home — land them on the office Home and
  // let the sidebar expose every data-entry destination.
  'operator',
  // Cataloguer lands on the office Home to find its cataloguing queue.
  'cataloguer',
];

/**
 * Index of the `/` AdminShell route. Office roles see the unified Home;
 * floor/stage roles fall through to <Dashboard/>, the role router that
 * redirects them to /floor, /stitching or /finishing. Keeps `/` a single
 * canonical entry point without a redirect loop.
 */
function HomeRoute() {
  const { user } = useAuth();
  if (hasAnyRole(user, OFFICE_HOME_ROLES)) {
    return <Home />;
  }
  return <Dashboard />;
}

// function AdminPlaceholder({ titleKey }: { titleKey: string }) {
//   const { t } = useTranslation();
//   return <PlaceholderSection title={t(titleKey)} />;
// }

function App() {
  // App mounted = React committed + the initial route's chunks resolved
  // far enough to render *something* (even just the Suspense fallback).
  // Hiding the splash here — instead of an arbitrary rAF×2 from main.tsx
  // — guarantees the user sees the app, not a blank frame.
  useEffect(() => {
    markChunkLoadSucceeded();
    void hideSplash();
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <AppToaster />
        <Onboarding />
        <BrowserRouter>
          <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Unified office Home — the single role-aware landing surface.
                Rendered inside the AdminShell chrome (sidebar + header).
                The index decides: office roles see <Home/>; floor roles are
                bounced to their own floor/stage homes by <Dashboard/> (the
                role router), so they never loop on `/`. */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
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
                    <HomeRoute />
                  </S>
                }
              />
            </Route>

            <Route
              path="/dispatches/:id/print"
              element={
                <ProtectedRoute>
                  <S>
                    <DispatchPrint />
                  </S>
                </ProtectedRoute>
              }
            />

            {/* Full-window Pattern/CAD preview. Linked from the inline
                PatternCadPreview file rows on every Style detail page;
                opens in a new tab via target="_blank". */}
            <Route
              path="/cad/preview"
              element={
                <ProtectedRoute>
                  <S>
                    <CadPreviewPage />
                  </S>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin', 'viewer', 'data_manager', 'operator']}>
                  <S>
                    <AdminShell />
                  </S>
                </ProtectedRoute>
              }
            >
              {/* AdminHome is retired — `/admin` now redirects to the
                  unified Home at `/`. The Production page (locator),
                  Dispatches, Users, etc. remain reachable as child routes. */}
              <Route index element={<Navigate to="/" replace />} />
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
                  // User management is admin/viewer/data_manager only — the
                  // /admin parent now admits 'operator' for Production +
                  // Dispatches, so re-gate to keep operator out of Users.
                  <ProtectedRoute allowedRoles={['admin', 'viewer', 'data_manager']}>
                    <S>
                      <UsersPage />
                    </S>
                  </ProtectedRoute>
                }
              />
              <Route
                path="warehouses"
                element={
                  <S>
                    <Warehouses />
                  </S>
                }
              />
              <Route
                path="edit-requests"
                element={
                  // The lot edit-request approval queue is admin-only: BE gates
                  // GET /lots/edit-requests to admin and the sidebar only shows
                  // it to admin, so match that here (the /admin parent now also
                  // admits operator + viewer + data_manager).
                  <ProtectedRoute allowedRoles={['admin']}>
                    <S>
                      <EditRequestsPage />
                    </S>
                  </ProtectedRoute>
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

            {/* Floor manager — receiving + assignment + 24h edit window. */}
            <Route
              path="/floor"
              element={
                <ProtectedRoute allowedRoles={['floor_manager', 'admin', 'operator']}>
                  <S>
                    <FloorHome />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/floor/receive"
              element={
                <ProtectedRoute allowedRoles={['floor_manager', 'admin', 'operator']}>
                  <S>
                    <ReceiveFromKotty />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/floor/lot/:lotId"
              element={
                <ProtectedRoute allowedRoles={['floor_manager', 'admin', 'operator']}>
                  <S>
                    <FloorLotDetail />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/floor/lot/:lotId/edit"
              element={
                <ProtectedRoute allowedRoles={['floor_manager', 'admin', 'operator']}>
                  <S>
                    <FloorEditLot />
                  </S>
                </ProtectedRoute>
              }
            />

            <Route
              path="/stitching"
              element={
                <ProtectedRoute allowedRoles={['stitching_master', 'admin', 'viewer', 'operator']}>
                  <S>
                    <StitchingHome />
                  </S>
                </ProtectedRoute>
              }
            />
            {/* Legacy alias — floor manager owns receive now. Admin
                + floor_manager keep access; stitching_master is blocked. */}
            <Route
              path="/stitching/receive"
              element={
                <ProtectedRoute allowedRoles={['floor_manager', 'admin', 'operator']}>
                  <S>
                    <ReceiveFromKotty />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/stitching/lot/:lotId"
              element={
                <ProtectedRoute allowedRoles={['stitching_master', 'admin', 'operator']}>
                  <S>
                    <StitchingReceiveLot />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/stitching/worked-on/:lotId"
              element={
                <ProtectedRoute allowedRoles={['stitching_master', 'admin', 'viewer', 'operator']}>
                  <S>
                    <StitchingWorkedOnDetail />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finishing"
              element={
                <ProtectedRoute allowedRoles={['finishing_master', 'admin', 'viewer', 'operator']}>
                  <S>
                    <FinishingHome />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finishing/lot/:lotId"
              element={
                <ProtectedRoute allowedRoles={['finishing_master', 'admin', 'operator']}>
                  <S>
                    <FinishingReceiveLot />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finishing/worked-on/:lotId"
              element={
                <ProtectedRoute allowedRoles={['finishing_master', 'admin', 'viewer', 'operator']}>
                  <S>
                    <FinishingWorkedOnDetail />
                  </S>
                </ProtectedRoute>
              }
            />
            <Route
              path="/data"
              element={
                <ProtectedRoute allowedRoles={['data_manager', 'admin', 'viewer', 'operator']}>
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

            {/* Product Development module — Styles + Fabric Library.
                Gating mirrors the BE styles WRITE set + viewer for read.
                BE role guard still enforces the finer-grained checks. */}
            <Route
              path="/styles"
              element={
                <ProtectedRoute
                  allowedRoles={[
                    'admin',
                    'sampling_editor',
                    'sampling_lead',
                    'pattern_master_w',
                    'pattern_master_m',
                    'viewer',
                    // Office roles that reach the Sampling registry via the
                    // Home cards (read-only; BE gates writes). Keeps the
                    // card deep-links from bouncing back to '/'.
                    'china_import_approver',
                    'data_manager',
                    'data_admin',
                    'pd_lead',
                    'operator',
                    // Go-to-market role: reaches the registry, the workspace
                    // (EasyEcom checkpoint + channels), and the intake form.
                    'cataloguer',
                  ]}
                >
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
                    <StylesRegistry />
                  </S>
                }
              />
              <Route
                path="new"
                element={
                  // Intake creates a Style (write). The /styles parent now
                  // admits read-only office roles for the registry
                  // drill-down, so re-gate the create form to the design-create
                  // set (CATALOGUER_WRITE_ROLES = PD writers + cataloguer,
                  // mirrors the BE styles CREATE and the Home "+ Submit design"
                  // CTA) — otherwise a read-only role could open the form by URL
                  // and only hit the 403 on submit.
                  <ProtectedRoute allowedRoles={[...CATALOGUER_WRITE_ROLES]}>
                    <S>
                      <NewIntake />
                    </S>
                  </ProtectedRoute>
                }
              />
              <Route
                path=":styleId"
                element={
                  <S>
                    <StyleWorkspace />
                  </S>
                }
              />
            </Route>

            {/* China Import — its own first-class destination, a simple
                flat registry for NW- prefixed imported styles. */}
            <Route
              path="/china-import"
              element={
                <ProtectedRoute
                  allowedRoles={[
                    'admin',
                    'sampling_editor',
                    'sampling_lead',
                    'pattern_master_w',
                    'pattern_master_m',
                    'china_import_approver',
                    'operator',
                  ]}
                >
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
                    <ChinaImportRegistry />
                  </S>
                }
              />
            </Route>

            <Route
              path="/fabric-library"
              element={
                <ProtectedRoute
                  allowedRoles={[
                    'admin',
                    'sampling_editor',
                    'sampling_lead',
                    'pattern_master_w',
                    'pattern_master_m',
                    'viewer',
                    'operator',
                  ]}
                >
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
                    <FabricLibrary />
                  </S>
                }
              />
              <Route
                path="receive"
                element={
                  <S>
                    <ReceiveFabricChallan />
                  </S>
                }
              />
            </Route>

            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
