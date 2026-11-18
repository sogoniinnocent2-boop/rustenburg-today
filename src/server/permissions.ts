import { all, get, run } from "./db";
import { AppError } from "./errors";
import { PERMISSIONS, ROLES } from "./access";

export function hasPermission(userId: string, key: string): boolean {
  const rows = all<{ name: string; permission_key: string | null }>(
    `SELECT r.name as name, p.permission_key as permission_key
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = ?`,
    userId,
  );
  if (rows.some((row) => row.name === "administrator")) return true;
  return rows.some((row) => row.permission_key === key);
}

export function requirePermission(userId: string, key: string): void {
  if (!hasPermission(userId, key)) throw new AppError(403, "You do not have permission to do that");
}

export function syncAccessCatalog(): void {
  for (const [key, description] of PERMISSIONS) {
    const existing = get<{ id: string }>("SELECT id FROM permissions WHERE permission_key = ?", key);
    if (!existing) {
      run("INSERT INTO permissions (id, permission_key, description) VALUES (?, ?, ?)", crypto.randomUUID(), key, description);
    }
  }
  for (const [name, role] of Object.entries(ROLES)) {
    let roleId = get<{ id: string }>("SELECT id FROM roles WHERE name = ?", name)?.id;
    if (!roleId) {
      roleId = crypto.randomUUID();
      run(
        "INSERT INTO roles (id, name, description, self_serve) VALUES (?, ?, ?, ?)",
        roleId,
        name,
        role.description,
        role.selfServe ? 1 : 0,
      );
    } else {
      run("UPDATE roles SET description = ?, self_serve = ? WHERE id = ?", role.description, role.selfServe ? 1 : 0, roleId);
    }
    run("DELETE FROM role_permissions WHERE role_id = ?", roleId);
    for (const key of role.permissions) {
      const permission = get<{ id: string }>("SELECT id FROM permissions WHERE permission_key = ?", key);
      if (permission) run("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)", roleId, permission.id);
    }
  }
}

export function roleIdByName(name: string): string {
  const row = get<{ id: string }>("SELECT id FROM roles WHERE name = ?", name);
  if (!row) throw new AppError(500, `Missing role ${name}`);
  return row.id;
}

export function grantRole(userId: string, roleName: string): void {
  const id = roleIdByName(roleName);
  run("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)", userId, id);
}

export function userRoleNames(userId: string): string[] {
  return all<{ name: string }>(
    `SELECT r.name as name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.name`,
    userId,
  ).map((row) => row.name);
}
