export const OWNER_ROLE = 'owner';
export const ADMIN_ROLE = 'admin';

/** Roles are stored comma-separated, e.g. "admin,member". */
export function hasRole(roles: string, role: string): boolean {
  return roles.split(',').includes(role);
}

export function isOwnerOrAdmin(roles: string): boolean {
  return hasRole(roles, OWNER_ROLE) || hasRole(roles, ADMIN_ROLE);
}

export const MEMBER_ROLE = 'member';

export type OrganizationRole = 'owner' | 'admin' | 'member';

/** The highest organization role of a comma-separated role string. */
export function highestRole(roles: string): OrganizationRole {
  if (hasRole(roles, OWNER_ROLE)) return OWNER_ROLE;
  if (hasRole(roles, ADMIN_ROLE)) return ADMIN_ROLE;
  return MEMBER_ROLE;
}
