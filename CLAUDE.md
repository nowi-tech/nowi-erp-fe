# NOWI ERP Frontend — project memory

Vite 7 + **React 19 + TypeScript (strict)** SPA. Tailwind v4 (CSS-first) +
shadcn/Radix primitives, Axios, React Router 7, react-i18next (en + hi). A
**Capacitor** Android shell loads the deployed remote bundle. Deploys to Vercel.

> Full walkthrough: `../docs/FRONTEND.md` (root repo). This file is the
> agent-facing conventions + gotchas only.

## Stack reality (don't trust older notes)

- **TypeScript, not plain JS.** Real entry is `src/main.tsx` + `src/App.tsx`;
  `vite.config.ts` defines the **`@/` → `src/`** alias. `tsc -b` is part of
  `build`; `npm run typecheck` / `lint` (ESLint flat, **single quotes** for TS).
- **No global state manager, no test runner** (still true). State = `useState`
  + Axios + one auth context. `api/types.ts` is generated (`gen:api`).

## Layout

`src/`: `pages/`, `components/{ui,layout,styles,dashboard,floor,fabrics,admin,shared}`,
`api/` (Axios client + one typed module per resource), `context/auth.tsx`,
`lib/` (`userRoles.ts`, `utils.ts` `cn()`), `i18n/`, `native/`, `services/`.

## Critical conventions

- **Auth = opaque OTP sessions (NOT JWT).** `localStorage` holds `token`
  (opaque) + `user` (JSON). Read/write only inside `context/auth.tsx` + the
  Axios interceptors — use `useAuth()` elsewhere.
- **Axios 401 → hard redirect** (`window.location.href = '/login'`) in
  `api/apiClient.ts`; request interceptor attaches the bearer. A network error
  on `/me` must NOT log out (only a real 401 does).
- **Route guards via `ProtectedRouteV2`** with `allowedRoles`; checks use
  `hasAnyRole()` (primary role + `roleAssignments`). Don't add per-page role
  checks.
- **Roles**: `UserRole` (14 values) in `api/types.ts` mirrors the BE enum;
  capability sets live in `lib/userRoles.ts` and must mirror the BE constants.
  **There is no `operator`** — the June 2026 consolidation removed it. `super_admin`
  is the owner's extra role on top of admin (cancels lots already on the floor,
  disables styles on Inventory Health); it is granted by migration/seed and
  never offered in the Users screen.
- **i18n**: `t('a.b.c')` via `useTranslation`. Floor screens keep keys in **both**
  `i18n/{en,hi}.json`. Admin / PD / production screens run on inline English
  `defaultValue` text and skip Hindi. Never hardcode a bare string either way.
- **Downloads** are blobs → object URL → synthetic `<a>` click.
- **Native shell** behaviour (`src/native/`) is in this bundle and only takes
  effect once **deployed to Vercel**, not when the APK is built. APK is a thin
  Capacitor shell (`appId fashion.nowi.erp`) loading `erp.nowi.fashion`; see
  root `CLAUDE.md` "Android APK".

## Don't

- **Never `window.alert/confirm/prompt`** — use `components/ui/confirm-dialog`.
- Don't reach into `localStorage` outside the auth context / Axios interceptors.
- Don't break the blob `responseType` pattern for downloads.
- Don't introduce a state library for one feature — `useState` + Axios is the
  pattern.
- Don't let an editor reformat TS to double quotes — ESLint enforces single.
