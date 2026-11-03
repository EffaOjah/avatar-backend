import { PERMISSIONS, ROLE_PERMISSIONS, PermissionKey } from '../admin.permissions';

describe('Admin Permissions & RBAC Matrix', () => {
  it('should define all required permission keys', () => {
    expect(PERMISSIONS).toBeDefined();
    expect(PERMISSIONS['users:read']).toBeDefined();
    expect(PERMISSIONS['users:manage']).toBeDefined();
    expect(PERMISSIONS['users:delete']).toBeDefined();
    expect(PERMISSIONS['businesses:read']).toBeDefined();
    expect(PERMISSIONS['businesses:approve']).toBeDefined();
    expect(PERMISSIONS['riders:read']).toBeDefined();
    expect(PERMISSIONS['riders:approve']).toBeDefined();
    expect(PERMISSIONS['orders:read']).toBeDefined();
    expect(PERMISSIONS['orders:manage']).toBeDefined();
    expect(PERMISSIONS['orders:override']).toBeDefined();
    expect(PERMISSIONS['settings:read']).toBeDefined();
    expect(PERMISSIONS['settings:write']).toBeDefined();
    expect(PERMISSIONS['admins:manage']).toBeDefined();
    expect(PERMISSIONS['audit:read']).toBeDefined();
  });

  it('SUPER_ADMIN should have 100% of the permissions defined in the catalogue', () => {
    const superAdminPerms = ROLE_PERMISSIONS['SUPER_ADMIN'];
    const allCatalogueKeys = Object.keys(PERMISSIONS) as PermissionKey[];

    expect(superAdminPerms).toBeDefined();
    expect(superAdminPerms.length).toBe(allCatalogueKeys.length);

    allCatalogueKeys.forEach((key) => {
      expect(superAdminPerms).toContain(key);
    });
  });

  it('non-Super Admin roles should have restricted subsets of permissions', () => {
    const opsPerms = ROLE_PERMISSIONS['OPS_ADMIN'];
    const financePerms = ROLE_PERMISSIONS['FINANCE_ADMIN'];
    const supportPerms = ROLE_PERMISSIONS['SUPPORT_ADMIN'];
    const moderationPerms = ROLE_PERMISSIONS['MODERATION_ADMIN'];

    // None of the non-SA roles should be allowed to manage other admins or write platform settings
    expect(opsPerms).not.toContain('admins:manage');
    expect(opsPerms).not.toContain('settings:write');
    expect(opsPerms).not.toContain('orders:override');

    expect(financePerms).not.toContain('admins:manage');
    expect(financePerms).not.toContain('settings:write');
    expect(financePerms).not.toContain('users:delete');

    expect(supportPerms).not.toContain('admins:manage');
    expect(supportPerms).not.toContain('settings:write');
    expect(supportPerms).not.toContain('users:delete');

    expect(moderationPerms).not.toContain('admins:manage');
    expect(moderationPerms).not.toContain('settings:write');
    expect(moderationPerms).not.toContain('orders:manage');
  });

  it('should return undefined or empty for invalid roles', () => {
    expect(ROLE_PERMISSIONS['INVALID_ROLE']).toBeUndefined();
  });
});

