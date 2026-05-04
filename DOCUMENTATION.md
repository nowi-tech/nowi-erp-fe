# NOWI ERP — Frontend Documentation

React 19 SPA built with Vite that consumes the NOWI ERP backend. For the system-wide overview (domain, end-to-end flow), see `../DOCUMENTATION.md`.

## 1. Stack

- React 19 + React DOM 19 (`StrictMode`)
- Vite 7 (`@vitejs/plugin-react`)
- React Router 7 (`react-router-dom`) — `BrowserRouter`
- Tailwind CSS 4 via `@tailwindcss/postcss` + `autoprefixer`
- Axios 1.x for HTTP
- ESLint 9 (flat config) with `react-hooks` and `react-refresh` plugins

No state library, no test runner, no TypeScript. Auth state lives in a tiny `AuthContext`; everything else is plain `useState` / `useEffect` per page.

## 2. Layout

```
index.html                              Vite entry — favicon, title "Production Tracking"
vite.config.js                          plugins: [react()]
vercel.json                             { "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
tailwind.config.js                      content: index.html + src/**/*.{js,ts,jsx,tsx}
postcss.config.js                       @tailwindcss/postcss + autoprefixer
eslint.config.js                        flat config; ignores dist/; no-unused-vars w/ caps-allowed pattern
.env.example                            VITE_API_URL=http://localhost:3001
src/
  main.jsx                              ReactDOM.createRoot → <App />
  App.jsx                               BrowserRouter + AuthProvider + all <Route>s
  index.css                             @import "tailwindcss";
  api/client.js                         Axios instance + namespaced API helpers
  context/AuthContext.jsx               useAuth() hook + AuthProvider
  components/
    Navbar.jsx                          Sticky top nav, role-based links, logout, user avatar
    ProtectedRoute.jsx                  Loading / unauthenticated / wrong-role guards
  pages/
    Login.jsx
    Dashboard.jsx                       Role-based redirect router
    cutting/
      CuttingDashboard.jsx              Search + paginated lot list
      CreateLot.jsx                     Multi-section form (lot details, sizes, rolls)
      ViewLot.jsx                       Lot detail + challan PDF + stage tracking
    stage/
      StageDashboard.jsx                Search lot, stage history timeline, "my recent receipts"
      ReceiveLot.jsx                    Receive form with progressive caps + receipt-challan modal
    operator/
      OperatorDashboard.jsx             Search by lot/SKU, summary stats, Excel download
      UserManagement.jsx                CRUD users
      SkuConfig.jsx                     Tabs: Brands / Genders / Categories
      SkuLinks.jsx                      SKU URL manager + Excel bulk upload
```

## 3. Auth (`context/AuthContext.jsx`)

`AuthProvider`:

- On mount, reads `token` + `user` from `localStorage`. If both exist:
  1. Hydrates `user` from storage immediately (so the UI doesn't flash the login page).
  2. Calls `GET /api/auth/me`. On success, replaces `user` with the server's view; on failure, clears storage.
- `login(username, password)` → `POST /api/auth/login`, stores `token` and `user`, sets state.
- `logout()` clears storage and state.
- Exposes `{ user, login, logout, loading, isAuthenticated }`.
- `useAuth()` throws if used outside the provider.

## 4. API Client (`api/client.js`)

A single Axios instance with two interceptors:

- **Request:** attaches `Authorization: Bearer <token>` from `localStorage`.
- **Response:** on 401, wipes `token` + `user` from `localStorage` and `window.location.href = '/login'`. (Hard navigation — bypasses React Router.)

Base URL = `import.meta.env.VITE_API_URL || 'http://localhost:3001'`.

Namespaced helpers exported from this file:

| Namespace        | Methods                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `authAPI`        | `login`, `me`, `logout`                                                                        |
| `usersAPI`       | `list`, `create`, `update`, `delete`                                                          |
| `stagesAPI`      | `list`, `create`, `update`                                                                    |
| `lotsAPI`        | `list`, `create`, `get`, `getRemaining`, `generateNumber`, `downloadChallan` (responseType blob) |
| `skuConfigAPI`   | `getBrands`/`createBrand`/`updateBrand`/`deleteBrand`, same trio for genders + categories, `getSkus`, `getSizes` |
| `fabricTypesAPI` | `list`, `create`                                                                              |
| `receiptsAPI`    | `getAvailable`, `create`, `getForLot`, `getHistory`, `downloadChallan` (blob)                 |
| `reportsAPI`     | `getLot`, `getSku`, `getStage`, `getSummary`, `download` (blob)                               |
| `skuLinksAPI`    | `list`, `getSkus`, `create`, `bulkUpload` (FormData), `downloadTemplate` (blob), `update`, `delete` |

PDF/Excel downloads use `responseType: 'blob'` and the consuming page builds an `<a href={URL.createObjectURL(blob)}>` click.

## 5. Routing (`App.jsx`)

| Path                                    | Allowed roles                          | Component             |
| --------------------------------------- | -------------------------------------- | --------------------- |
| `/login`                                | public                                 | `Login`               |
| `/dashboard`                            | any auth                               | `Dashboard`           |
| `/cutting`                              | `cutting_master`, `operator`           | `CuttingDashboard`    |
| `/cutting/create`                       | `cutting_master`                       | `CreateLot`           |
| `/cutting/lot/:lotNo`                   | `cutting_master`, `operator`           | `ViewLot`             |
| `/stage/:stageName`                     | any auth                               | `StageDashboard`      |
| `/stage/:stageName/receive/:lotNo`      | any auth                               | `ReceiveLot`          |
| `/operator`                             | `operator`                             | `OperatorDashboard`   |
| `/operator/users`                       | `operator`                             | `UserManagement`      |
| `/operator/sku-config`                  | `operator`                             | `SkuConfig`           |
| `/operator/sku-links`                   | `operator`                             | `SkuLinks`            |
| `/`, `*`                                | —                                      | redirect to `/dashboard` |

`Dashboard.jsx` exists solely to redirect by role:

```js
operator         → /operator
cutting_master   → /cutting
stitching_master → /stage/stitching
finishing        → /stage/finishing
warehouse        → /stage/dispatch
```

`ProtectedRoute` shows a centered spinner while the auth context is rehydrating, redirects to `/login` if unauthenticated, and to `/dashboard` if `allowedRoles` is set and the user's role isn't in the list.

## 6. Pages

### 6.1 Login (`pages/Login.jsx`)

- Standard form, posts to `authAPI.login`, navigates to `/dashboard` on success.
- Renders backend error messages (`err.response?.data?.error`) inline.

### 6.2 Dashboard (`pages/Dashboard.jsx`)

- Reads `user.role` and `<Navigate>`s to the correct landing page (see table above). Renders nothing else.

### 6.3 Cutting

#### `CuttingDashboard.jsx`

- Lists lots via `lotsAPI.list({ search })`.
- Search by lot number or SKU (server-side `LIKE`).
- Shows size badges + total pieces; each row links to `/cutting/lot/:lot_no`.
- "Create New Lot" CTA → `/cutting/create`.

#### `CreateLot.jsx`

- On mount, fetches in parallel: next lot number (`lotsAPI.generateNumber`), brands, genders, categories, sizes.
- **SKU builder**: 3 dropdowns (brand/gender/category by `code`) + free-text code field → preview = `${BRAND}-${GENDER}${CATEGORY}_${CODE}`.
- **Fabric type** field with debounced (200 ms) autocomplete from `fabricTypesAPI.list(query)` and click-outside-to-close.
- **Sizes**: comma-separated input parsed against `availableSizes`. Unknown labels are surfaced as an inline error. Each accepted size becomes a row with a `pattern_count` input.
- **Rolls**: a flexible list (≥1 row, can add/remove). Per-row `weight_used = full_weight - remaining_weight` is computed for display.
- **Live calculation** banner shows `patterns × layers = pieces`. Submit is disabled until pieces > 0.
- Submit calls `lotsAPI.create({ lot_no, sku, fabric_type, table_length, remarks, sizes, rolls })` then navigates back to `/cutting`.

#### `ViewLot.jsx`

- Fetches via `lotsAPI.get(lotNo)` → `{ lot, stages }`.
- Renders lot details, sizes, rolls, and a stage-progress list using `lot.stages` summaries.
- "Download Challan" button → `lotsAPI.downloadChallan(lotNo)` (blob → object URL → click `<a>`).

### 6.4 Stage

#### `StageDashboard.jsx`

- Resolves the stage by `stageName` URL param against `stagesAPI.list()` (because the backend uses numeric `stage_id` but URLs use the human name).
- Loads the current user's recent receipts (`receiptsAPI.getHistory({ limit: 20 })`) and filters to this stage; groups by `lot_no`.
- Searches for a lot via the input box → fetches `lotsAPI.get`, then `lotsAPI.getRemaining(lot_no, stage.id)`.
- Renders:
  - Lot details + "Receive Items" CTA → `/stage/:stageName/receive/:lotNo`.
  - Stage-history timeline grouped by user.
  - "Available to Receive at <stage>" table with `original / available / received / remaining` per size.

Stage icons: `stitching → 🧵`, `finishing → ✨`, `dispatch → 📦`. Hardcoded.

#### `ReceiveLot.jsx`

- Fetches stage, lot, and remaining quantities in parallel.
- Renders an editable table per size with the cap = `remaining`. Sizes with `available=0` render as "Waiting"; sizes with `remaining=0` render as "Complete".
- Submit posts to `receiptsAPI.create({ lot_no, stage_id, sizes, remarks })`. Filters out empty/zero sizes before posting.
- On success, opens a modal offering an immediate **receipt-challan PDF download** using `receiptsAPI.downloadChallan(lotNo, stageId, timestamp)`.

### 6.5 Operator

#### `OperatorDashboard.jsx`

- Loads summary stats (`reportsAPI.getSummary`).
- Two search forms: by lot number (`lotsAPI.get`) or by SKU (`reportsAPI.getSku`).
- Stage progress badges with hover tooltips showing percentages.
- "Download Excel Report" → `reportsAPI.download` (blob).
- Top-right: links to `/operator/sku-config`, `/operator/sku-links`, `/operator/users`.
- Custom helpers in this file: `Tooltip`, `LinkBadge` (renders SKU links from the lot tracking response), `StageIndicator`.

#### `UserManagement.jsx`

- CRUD over `usersAPI`. New users default to `cutting_master`. Cannot deactivate yourself (server enforces; UI just shows the user list).

#### `SkuConfig.jsx`

- Tabs for Brands / Genders / Categories. Same form/list shape for all three; uses the corresponding namespace methods on `skuConfigAPI`.

#### `SkuLinks.jsx`

- Manage external links per SKU. Uses `skuLinksAPI` for single + bulk.
- "Download Template" produces the XLSX bulk-import template (server-generated).
- "Bulk Upload" sends a multipart form to `/api/sku-links/bulk` and shows the `inserted / skipped / errors` summary returned by the server.

## 7. Components

### `Navbar.jsx`

- Sticky top bar.
- Logo links to `/dashboard`.
- Role-based desktop link list: operator → Dashboard / Users / Cutting; cutting_master → Dashboard / New Lot; everyone else → no nav links.
- Active-link highlight is by exact `location.pathname` match.
- User avatar (first initial), name + role badge, logout button.

### `ProtectedRoute.jsx`

```jsx
<ProtectedRoute allowedRoles={['operator']}>
  <UserManagement />
</ProtectedRoute>
```

- Loading → spinner.
- Not authenticated → `<Navigate to="/login" replace />`.
- `allowedRoles` set & user's role not in it → `<Navigate to="/dashboard" replace />`.

## 8. Setup

```bash
npm install
cp .env.example .env       # set VITE_API_URL if backend isn't on :3001
npm run dev                # vite — http://localhost:5173
npm run build
npm run lint
npm run preview
```

ESLint config (`eslint.config.js`):

- `no-unused-vars` with `varsIgnorePattern: '^[A-Z_]'` — uppercase identifiers (e.g. constants, components) won't trigger the rule.
- React hooks + react-refresh recommended rules.

## 9. Deployment (Vercel)

`vercel.json` is one rule: rewrite every path to `/` so the SPA can handle routing.

Required environment variable in the Vercel project: `VITE_API_URL` pointing at the backend (Cloud Run URL, etc.).

## 10. Conventions / Gotchas

- **No global error boundary** — page errors come from `try/catch` around API calls and surface in inline alerts.
- **localStorage is the source of truth for the JWT.** Reading/writing happens in `AuthContext` and the Axios interceptors.
- **Hard reload on 401** — the response interceptor uses `window.location.href = '/login'` instead of `useNavigate`. This wipes any in-memory state, which is intentional.
- **Stage names are hardcoded** in three places: `Dashboard.jsx` (role → URL), `StageDashboard.jsx`/`ReceiveLot.jsx` (`stageIcons` map), and the backend's `stages` table seed. If the backend stages are renamed via the API, the FE will not pick up the change automatically (the icon map falls back to 📋).
- **Sizes input parser** is case-insensitive (uppercases the user input) but stores the canonical label from the lookup. Accepts comma-separated values, supports Enter to commit.
- **Pattern × layers calc** runs entirely client-side as the user edits the form; the server re-derives the same number on submit.
- **Tailwind v4** — config is mostly empty; styling uses utility classes directly. Custom colors come from Tailwind's default palette.
- **No TypeScript** — all files are `.jsx` / `.js`. The `@types/react*` packages are present for editor IntelliSense only.
