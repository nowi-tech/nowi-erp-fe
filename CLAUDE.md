# NOWI ERP Frontend — Project Memory

React 19 + Vite 7 SPA. Tailwind CSS 4 for styles, Axios for HTTP, React Router 7 for routing. **Plain JS** (no TypeScript), no test runner, no global state manager.

For the full reference, see `DOCUMENTATION.md` in this folder and the system-wide `../DOCUMENTATION.md`.

## Layout in one glance

```
index.html                  Vite entry. Title is "Production Tracking".
vite.config.js              plugins: [react()] only — no aliases.
vercel.json                 SPA rewrite to /.
tailwind.config.js          v4 — content scan over index.html + src/**/*.{js,ts,jsx,tsx}
src/
  main.jsx                  StrictMode + <App />
  App.jsx                   BrowserRouter + AuthProvider + every route declared inline
  api/client.js             Single Axios instance + namespaced helpers (authAPI, lotsAPI, ...)
  context/AuthContext.jsx   useAuth() hook; localStorage-backed token + user
  components/
    Navbar.jsx, ProtectedRoute.jsx
  pages/
    Login.jsx, Dashboard.jsx (redirect-only)
    cutting/{CuttingDashboard,CreateLot,ViewLot}.jsx
    stage/{StageDashboard,ReceiveLot}.jsx
    operator/{OperatorDashboard,UserManagement,SkuConfig,SkuLinks}.jsx
```

## Critical conventions

- **Auth lives in `localStorage`.** Keys: `token` (JWT) and `user` (JSON of `{ id, username, name, role }`). Reads/writes happen ONLY in `AuthContext` and the Axios interceptors.
- **Axios 401 = hard reload.** The response interceptor calls `window.location.href = '/login'` (not `useNavigate`) on any 401. This intentionally wipes in-memory state.
- **PDFs/Excels are blobs.** All download helpers in `api/client.js` use `responseType: 'blob'`. Pages turn the blob into an object URL and click a synthetic `<a>`.
- **Blocking guards via `<ProtectedRoute>`.** `loading` → spinner; not authed → `/login`; `allowedRoles` mismatch → `/dashboard`. Don't add per-page role checks; use this component.
- **No TypeScript.** `@types/react*` packages are present for editor IntelliSense only.

## Stage names are hardcoded in 3 places

If a stage is renamed via the API, update:

1. `pages/Dashboard.jsx` — role → URL map (`stitching_master → /stage/stitching`, etc.).
2. `pages/stage/StageDashboard.jsx` — `stageIcons` map (`stitching: '🧵'`, `finishing: '✨'`, `dispatch: '📦'`).
3. `pages/stage/ReceiveLot.jsx` — same `stageIcons` map.

The default fallback icon is 📋, so renames silently lose the emoji. The route `/stage/:stageName` itself works because `StageDashboard` looks up `stageName` against `stagesAPI.list()`.

## Routing summary

| Path                                    | Allowed roles                          |
| --------------------------------------- | -------------------------------------- |
| `/login`                                | public                                 |
| `/dashboard`                            | any auth (redirects by role)           |
| `/cutting`                              | `cutting_master`, `operator`           |
| `/cutting/create`                       | `cutting_master`                       |
| `/cutting/lot/:lotNo`                   | `cutting_master`, `operator`           |
| `/stage/:stageName[/receive/:lotNo]`    | any auth (server enforces stage role)  |
| `/operator[/users\|/sku-config\|/sku-links]` | `operator`                          |
| `/`, `*`                                | redirect to `/dashboard`               |

## Pages that are tricky

- **`pages/cutting/CreateLot.jsx`** — runs `Promise.all` for 5 fetches on mount (lot number preview, brands, genders, categories, sizes). Computes `totalPieces = patterns × layers` live. Sizes input is comma-separated and parsed against the sizes lookup; unknown labels surface as inline errors. Submit must produce `validSizes` (with `pattern_count > 0`) AND `validRolls` (with `roll_no` and `layers > 0`). The backend accepts both pattern-mode and direct-quantity-mode — but the UI only sends pattern-mode.
- **`pages/stage/StageDashboard.jsx`** — resolves the stage by `stageName` URL param against `stagesAPI.list()` because the backend expects a numeric `stage_id`. Two distinct flows: searching for a lot, OR showing "my recent receipts" grouped by lot.
- **`pages/stage/ReceiveLot.jsx`** — quantities are capped via `max={canReceive}` on the inputs, but server still validates. After submit, opens a success modal with a receipt-challan download (uses the `:timestamp` route).
- **`pages/operator/OperatorDashboard.jsx`** — defines local `Tooltip`, `LinkBadge`, `StageIndicator` components.

## Conventions

- **No TypeScript types.** Use `useState` defaults that match the eventual shape (`useState(null)`, `useState([])`, `useState({})`).
- **Errors** come from `err.response?.data?.error || 'fallback'` and render in inline alert boxes. There is **no global error boundary**.
- **Tailwind v4** — utility classes only. There is no `@layer` config or custom theme. Default palette: green for primary, blue for secondary, red for errors/destructive.
- **Forms use uncontrolled-ish patterns**: each field has its own `useState`. Submit handlers gather values and call the API; loading state is a per-handler `useState`.
- **`autoFocus` attributes** are common — preserve them; they matter for the data-entry flow on mobile.

## Env

```
VITE_API_URL=http://localhost:3001    # backend URL
```

In production (Vercel), set this in the project settings. Don't import it anywhere except `api/client.js`.

## Local dev

```bash
npm install
cp .env.example .env
npm run dev      # http://localhost:5173
npm run build    # outputs to dist/
npm run lint
```

ESLint flat config in `eslint.config.js`:

- `no-unused-vars` ignores capitalized identifiers (`varsIgnorePattern: '^[A-Z_]'`).
- `react-hooks` recommended + `react-refresh/only-export-components` (for fast refresh).

## When extending

- New API endpoint → add to `api/client.js` under the existing namespace; if it's a new resource group, create a new namespace export and mirror the existing CRUD shape.
- New page → add a `<Route>` in `App.jsx` wrapped in `<ProtectedRoute allowedRoles={[...]}>` if needed. Add it to the `Navbar` link list if it should be top-level for any role.
- New role → update the constants in `pages/operator/UserManagement.jsx` (`ROLES` array), the `getRoleDisplay` / `getRoleBadgeColor` maps in `Navbar.jsx`, and the role-redirect map in `Dashboard.jsx`. Coordinate with the BE.
- New stage → no FE change required for the route to work, but icons fall back to 📋 unless you update the `stageIcons` map.

## Don't

- Don't reach into `localStorage` directly outside `AuthContext` / Axios interceptors. If you need user info, use `useAuth()`.
- Don't bypass `ProtectedRoute` — duplicating role checks per-page is how things get out of sync.
- Don't break the `responseType: 'blob'` pattern for downloads — pages won't be able to construct the object URL otherwise.
- Don't introduce a state library for one feature. The codebase is intentionally minimal; `useState` + Axios is the pattern.
