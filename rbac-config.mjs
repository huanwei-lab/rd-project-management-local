// Role-Based Access Control (RBAC) System
// Flexible permission configuration for all roles

const rolePermissions = {
  admin: {
    account: ['create', 'read', 'update', 'delete', 'toggle_enable', 'force_logout', 'view_audit'],
    project: ['create', 'read', 'update', 'delete', 'export', 'import'],
    task: ['create', 'read', 'update', 'delete'],
    state: ['write', 'read'],
    audit: ['view', 'export']
  },
  
  pm: {
    account: ['read'],  // 看得到帳號但無法管理
    project: ['create', 'read', 'update'],  // 可建立新專案
    task: ['create', 'read', 'update'],  // 可建立新任務
    state: ['write', 'read'],  // 可編輯狀態
    audit: []  // 無法檢視稽核
  },
  
  pe: {
    account: ['read'],
    project: ['read', 'update'],  // 只能編輯，不能建立/刪除
    task: ['create', 'read', 'update'],
    state: ['write', 'read'],
    audit: []
  },
  
  ce: {
    account: ['read'],
    project: ['read'],  // 只能檢視
    task: ['read', 'update'],  // 只能編輯自己的任務
    state: ['read'],  // 只能讀取，不能寫入
    audit: []
  },
  
  me: {
    account: ['read'],
    project: ['read'],
    task: ['read', 'update'],
    state: ['read'],
    audit: []
  },
  
  sme: {
    account: ['read'],
    project: ['read'],
    task: ['read', 'update'],
    state: ['read'],
    audit: []
  },
  
  qe: {
    account: ['read'],
    project: ['read'],
    task: ['read', 'update'],
    state: ['read'],
    audit: []
  },
  
  viewer: {
    account: [],  // 無法存取帳號管理
    project: ['read'],  // 只能檢視
    task: ['read'],  // 只能檢視
    state: ['read'],  // 只能檢視
    audit: []
  }
};

// Permission check function
function hasPermission(user, resource, action) {
  if (!user || !user.accessRole) return false;
  
  const permissions = rolePermissions[user.accessRole];
  if (!permissions) return false;
  
  const resourcePermissions = permissions[resource];
  if (!resourcePermissions) return false;
  
  return resourcePermissions.includes(action);
}

// Usage examples:
// hasPermission(user, 'project', 'create') -> true/false
// hasPermission(user, 'task', 'delete') -> true/false
// hasPermission(user, 'account', 'view_audit') -> true/false

// 匯出給伺服器使用
export { rolePermissions, hasPermission };
