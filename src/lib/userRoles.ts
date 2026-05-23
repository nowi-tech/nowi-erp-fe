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
