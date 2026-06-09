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
 * The PD "editor" write set — mirrors the backend `PD_WRITE_ROLES`
 * (`nowi-erp-api/src/modules/auth/roles.constants.ts`). Every authoring +
 * office editor that may create/edit PD data (styles, variants, channels,
 * inspections, categories, fabrics, colours) plus the cross-cutting
 * `operator`, i.e. everyone except the read-only `viewer`.
 *
 * Use this for FE write-gates so a button is never shown to a role the BE
 * will 403 — and, crucially, never hidden from one the BE now allows.
 * Keep in lock-step with the BE constant.
 *
 * Deliberately EXCLUDES approve / withdraw-post-approval — those stay on
 * their own narrow arrays (`APPROVER_ROLES`, `POST_APPROVAL_PARK`).
 */
export const PD_WRITE_ROLES: readonly UserRole[] = [
  'admin',
  'sampling_editor',
  'sampling_lead',
  'pattern_master_w',
  'pattern_master_m',
  'china_import_approver',
  'data_admin',
  'pd_lead',
  'operator',
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
