import type { User, UserRole } from '@/api/types';

/**
 * Multi-role helpers. The ERP keeps `User.role` as the primary role for
 * back-compat with the original single-role guards, and stacks
 * additional roles via `roleAssignments` (one row per grant). All FE
 * role checks should go through these helpers so a user with a
 * secondary `UserRoleAssignment` is treated identically to a user with
 * that role as primary.
 *
 * Mirrors `nowi-erp-api/src/common/roles/user-roles.ts` — keep both
 * sides in sync if the helper contract changes.
 */

/**
 * Classifies EVERY role as a PD editor (may create/edit PD data: styles,
 * variants, channels, inspections, categories, fabrics, colours) or not.
 *
 * This is a `Record<UserRole, boolean>` on purpose: `UserRole` is generated
 * from the backend (`gen:api`), so when a new role is added there and the
 * types are regenerated, THIS map fails to compile until the new role is
 * consciously classified — closing the gap where the FE write-gates could
 * silently fall out of sync with the BE `PD_WRITE_ROLES`. Keep the `true`
 * entries identical to the backend `PD_WRITE_ROLES`
 * (`nowi-erp-api/src/modules/auth/roles.constants.ts`).
 *
 * `false` = read-only `viewer` + the floor roles (they don't write PD data;
 * floor uploads are handled by the BE storage role set, not this gate).
 */
const IS_PD_WRITER: Record<UserRole, boolean> = {
  admin: true,
  sampling_editor: true,
  sampling_lead: true,
  pattern_master_w: true,
  pattern_master_m: true,
  china_import_approver: true,
  data_admin: true,
  pd_lead: true,
  operator: true,
  // `cataloguer` is NOT a general PD writer — it only creates designs + does
  // cataloguing, gated via CATALOGUER_WRITE_ROLES below, not this set.
  cataloguer: false,
  viewer: false,
  floor_manager: false,
  stitching_master: false,
  finishing_master: false,
  data_manager: false,
};

/**
 * The PD "editor" write set — every role flagged a PD writer above. Use this
 * for FE write-gates so a button is never shown to a role the BE will 403,
 * and never hidden from one the BE allows.
 *
 * Deliberately EXCLUDES approve / withdraw-post-approval — those stay on
 * their own narrow arrays (`APPROVER_ROLES`, `POST_APPROVAL_PARK`).
 */
export const PD_WRITE_ROLES: readonly UserRole[] = (
  Object.keys(IS_PD_WRITER) as UserRole[]
).filter((role) => IS_PD_WRITER[role]);

/**
 * The approver / sign-off set — mirrors the BE `APPROVE_ROLES`
 * (`nowi-erp-api/src/modules/auth/roles.constants.ts`). Leads + masters who
 * may sign off (Approval #1/#2, start-cataloguing). Use this to gate those
 * buttons so a writer/operator never sees a control the BE will 403.
 * (Going live is NOT here — it moved to the cataloguing write set; see
 * {@link CATALOGUER_WRITE_ROLES}.)
 *
 * Deliberately NARROWER than {@link PD_WRITE_ROLES}: `sampling_editor` and
 * `operator` author data but never sign off.
 */
export const APPROVER_ROLES: readonly UserRole[] = [
  'admin',
  'sampling_lead',
  'pattern_master_w',
  'pattern_master_m',
  'china_import_approver',
];

/**
 * Admin-only gate. Used where admin gets a strictly wider capability than the
 * rest of the approver set — e.g. parking a style at any lifecycle stage
 * (non-admin approvers can park only during sampling — draft/in_sampling).
 * Use with `hasAnyRole`.
 */
export const ADMIN_ROLES: readonly UserRole[] = ['admin'];

/**
 * Roles allowed to CREATE a design + do the cataloguing step (EasyEcom
 * checkpoint, marketplace take-offline) — every PD editor plus the narrow
 * `cataloguer`. Mirrors the BE `CATALOGUER_WRITE_ROLES`. Use this for the
 * add-design CTA + the cataloguing write-gates so `cataloguer` sees exactly
 * those controls and nothing else (it's absent from {@link PD_WRITE_ROLES}).
 * Going live is cataloguer work too: listing a channel + marking EasyEcom done
 * (which auto-promotes listings to live) are both gated on THIS set.
 */
export const CATALOGUER_WRITE_ROLES: readonly UserRole[] = [
  ...PD_WRITE_ROLES,
  'cataloguer',
];

type RoleSource = Pick<User, 'role'> & {
  roleAssignments?: Array<{ role: UserRole }>;
};

/** Union of primary role + every UserRoleAssignment.role row. */
export function userAllRoles(user: RoleSource | null | undefined): UserRole[] {
  if (!user) return [];
  const extras = user.roleAssignments?.map((r) => r.role) ?? [];
  // Use a Set to dedupe — primary may also appear as an extra if the
  // BE ever emits both (it shouldn't, but be defensive).
  return Array.from(new Set<UserRole>([user.role, ...extras]));
}

/** True if `user` has the given role (primary OR assignment). */
export function hasRole(
  user: RoleSource | null | undefined,
  role: UserRole,
): boolean {
  if (!user) return false;
  if (user.role === role) return true;
  return user.roleAssignments?.some((r) => r.role === role) ?? false;
}

/** True if `user` has any of the given roles. */
export function hasAnyRole(
  user: RoleSource | null | undefined,
  roles: readonly UserRole[],
): boolean {
  if (!user) return false;
  if (roles.includes(user.role)) return true;
  return user.roleAssignments?.some((r) => roles.includes(r.role)) ?? false;
}
