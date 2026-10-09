export const OWNER_ROLE = 'owner';
export const ADMIN_ROLE = 'admin';

/** Roles are stored comma-separated, e.g. "admin,member". */
export function hasRole(roles: string, role: string): boolean {
  return roles.split(',').includes(role);
}

export function isOwnerOrAdmin(roles: string): boolean {
  return hasRole(roles, OWNER_ROLE) || hasRole(roles, ADMIN_ROLE);
}
