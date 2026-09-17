import http from 'node:http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const scrypt = promisify(crypto.scrypt);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const defaultDbPath = path.join(rootDir, 'db', 'local-projects.sqlite');
const defaultHtmlPath = path.join(rootDir, 'app.html');
const corsHeaders = {
  'access-control-allow-origin': process.env.ALLOWED_ORIGINS || '*',
  'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, X-Requested-With',
  'access-control-max-age': '86400',
  'access-control-allow-credentials': 'true',
  vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
  // ISO 27001 Security Headers
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-xss-protection': '1; mode=block',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
  'pragma': 'no-cache',
  'expires': '0'
};

const sessionCookieName = 'rd_local_session';
const sessionDurationSeconds = 60 * 60 * 8;
const allowedRoles = new Set(['admin', 'pm', 'pe', 'ce', 'me', 'sme', 'qe', 'viewer']);
const defaultAdminPassword = process.env.LOCAL_ADMIN_PASSWORD || 'Admin@2026Secure';

// ISO 27001 Advanced Compliance Policies
const ADVANCED_COMPLIANCE = {
  // A.9.2.2 - Account Lockout Policy
  accountLockout: {
    maxAttempts: 5,              // 最多5次失敗嘗試
    lockoutDurationMinutes: 15,  // 鎖定15分鐘
    resetAfterMinutes: 1440      // 24小時後重置計數
  },
  // A.9.4.3 - Password Expiration Policy
  passwordExpiration: {
    expirationDays: 90,         // 90天過期
    warningDays: 14,            // 提前14天警告
    minDaysBeforeReuse: 5,      // 5天內不能重複使用
    historyCount: 5             // 保留最近5個密碼
  },
  // A.12.4.1 - Session Monitoring
  sessionMonitoring: {
    inactivityTimeoutMinutes: 30,  // 30分鐘無活動自動登出
    maxConcurrentSessions: 3,      // 每個用戶最多3個併發會話
    trackUserAgent: true           // 追蹤瀏覽器/裝置資訊
  },
  // Security Event Detection
  securityEvents: {
    enableAnomalyDetection: true,
    failedLoginThreshold: 3,       // 3次失敗在30分鐘內視為異常
    administratorOnlyAlert: true   // 管理員修改需要警告
  }
};

// Organization password policy: 10+ characters with letters and numbers
function validatePassword(password, email) {
  if (!password) return { valid: false, error: '密碼不能為空' };
  if (password.length < 10) return { valid: false, error: '密碼至少需要 10 個字符' };
  // Must contain letters (any case) and numbers
  if (!/[A-Za-z]/.test(password)) return { valid: false, error: '密碼必須包含字母' };
  if (!/\d/.test(password)) return { valid: false, error: '密碼必須包含數字' };
  // Prevent using email/username in password
  if (email && password.toLowerCase().includes(email.split('@')[0].toLowerCase())) {
    return { valid: false, error: '密碼不能包含帳號名稱' };
  }
  return { valid: true };
}

function addCorsHeaders(headers = {}) {
  return { ...corsHeaders, ...headers };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }
});

function validState(value) {
  return Boolean(
    value &&
      Array.isArray(value.projects) &&
      value.projects.length > 0 &&
      value.projects.every(
        (project) =>
          project &&
          typeof project.id === 'string' &&
          typeof project.name === 'string' &&
          project.members &&
          Array.isArray(project.tasks)
      )
  );
}

function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  return Buffer.concat([salt, key]).toString('hex');
}

function generateSecurePassword() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const all = letters + digits;
  let pwd = '';
  // Ensure at least one letter and one digit
  pwd += letters[Math.floor(Math.random() * letters.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  // Generate remaining 8 characters
  for (let i = 0; i < 8; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  const buf = Buffer.from(hash, 'hex');
  const salt = buf.slice(0, 16);
  const key = buf.slice(16);
  try {
    const derivedKey = await scrypt(password, salt, 32);
    return crypto.timingSafeEqual(key, derivedKey);
  } catch {
    return false;
  }
}

function initializeDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rd_app_state (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rd_app_state_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      json TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rd_app_users (
      email TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      access_role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rd_app_user_security (
      email TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      password_hash TEXT,
      password_changed_at TEXT,
      password_expires_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (email) REFERENCES rd_app_users(email) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rd_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      action TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rd_app_sessions (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rd_security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      event_type TEXT NOT NULL,
      severity TEXT DEFAULT 'warning',
      description TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const adminEmail = process.env.LOCAL_ADMIN_EMAIL || 'local-admin@localhost';
  const adminDisplayName = process.env.LOCAL_ADMIN_NAME || 'Local Admin';
  const adminRole = process.env.LOCAL_ADMIN_ROLE || 'admin';
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR IGNORE INTO rd_app_users (email, display_name, access_role, created_at) VALUES (?, ?, ?, ?)'
  ).run(adminEmail, adminDisplayName, adminRole, now);
  // Hash default admin password
  const adminHashedPass = hashPasswordSync(defaultAdminPassword);
  db.prepare(
    'INSERT OR REPLACE INTO rd_app_user_security (email, enabled, updated_at, password_hash) VALUES (?, ?, ?, ?)'
  ).run(adminEmail, 1, now, adminHashedPass);

  const extraUsersJson = process.env.LOCAL_USERS_JSON;
  if (extraUsersJson) {
    try {
      const extraUsers = JSON.parse(extraUsersJson);
      if (Array.isArray(extraUsers)) {
        const insertUser = db.prepare(
          'INSERT OR IGNORE INTO rd_app_users (email, display_name, access_role, created_at) VALUES (?, ?, ?, ?)'
        );
        for (const user of extraUsers) {
          const email = user?.email?.trim()?.toLowerCase();
          const displayName = user?.displayName?.trim();
          const accessRole = user?.accessRole?.trim()?.toLowerCase();
          if (!email || !displayName || !allowedRoles.has(accessRole)) {
            continue;
          }
          insertUser.run(email, displayName, accessRole, now);
        }
      }
      const insertSecurity = db.prepare(
        'INSERT OR IGNORE INTO rd_app_user_security (email, enabled, updated_at) VALUES (?, ?, ?)'
      );
      for (const user of extraUsers) {
        const email = user?.email?.trim()?.toLowerCase();
        if (email && allowedRoles.has(user?.accessRole?.trim()?.toLowerCase())) {
          insertSecurity.run(email, 1, now);
        }
      }
    } catch (error) {
      console.warn('Failed to parse LOCAL_USERS_JSON:', error.message);
    }
  }
}

function getDefaultAdminUser() {
  return {
    email: process.env.LOCAL_ADMIN_EMAIL || 'local-admin@localhost',
    displayName: process.env.LOCAL_ADMIN_NAME || 'Local Admin',
    accessRole: process.env.LOCAL_ADMIN_ROLE || 'admin'
  };
}

function parseCookies(request) {
  const cookieHeader = request.headers.cookie || '';
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const index = pair.indexOf('=');
      if (index <= 0) {
        return acc;
      }
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function toSessionUser(row) {
  if (!row) {
    return null;
  }
  return {
    email: row.email,
    displayName: row.display_name,
    accessRole: row.access_role
  };
}

function getUserByEmail(db, email) {
  if (!email) {
    return null;
  }
  const row = db.prepare('SELECT email, display_name, access_role FROM rd_app_users WHERE email=?').get(email);
  return toSessionUser(row);
}

function getSessionUser(request, db) {
  const cookies = parseCookies(request);
  const sessionToken = cookies[sessionCookieName];
  if (!sessionToken) {
    return null;
  }

  const now = new Date().toISOString();
  const row = db.prepare(
    `SELECT u.email, u.display_name, u.access_role, s.expires_at, sec.enabled, sec.locked_until
     FROM rd_app_sessions s
     JOIN rd_app_users u ON u.email = s.email
     LEFT JOIN rd_app_user_security sec ON u.email = sec.email
     WHERE s.token = ?`
  ).get(sessionToken);

  if (!row) {
    return null;
  }

  if (row.expires_at <= now) {
    db.prepare('DELETE FROM rd_app_sessions WHERE token = ?').run(sessionToken);
    return null;
  }

  if (row.enabled === 0) {
    db.prepare('DELETE FROM rd_app_sessions WHERE token = ?').run(sessionToken);
    return null;
  }

  if (row.locked_until && row.locked_until > now) {
    return null;
  }

  return {
    email: row.email,
    displayName: row.display_name,
    accessRole: row.access_role,
    sessionToken
  };
}

function makeSessionCookie(token) {
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionDurationSeconds}`;
}

function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function createSession(db, email, userAgent = null, ipAddress = null) {
  const token = crypto.randomBytes(24).toString('hex');
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000).toISOString();
  db.prepare('INSERT INTO rd_app_sessions (token, email, user_agent, ip_address, created_at, expires_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    token, 
    email, 
    userAgent, 
    ipAddress, 
    createdAt, 
    expiresAt,
    createdAt
  );
  return token;
}

function appendAudit(db, email, action, severity = 'info', details = null) {
  db.prepare('INSERT INTO rd_audit_log (email, action, severity, details, created_at) VALUES (?, ?, ?, ?, ?)').run(
    email || 'anonymous',
    action,
    severity,
    details ? JSON.stringify(details) : null,
    new Date().toISOString()
  );
}

function recordSecurityEvent(db, email, eventType, severity, description, ipAddress, userAgent) {
  db.prepare(
    'INSERT INTO rd_security_events (email, event_type, severity, description, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(email || 'anonymous', eventType, severity, description, ipAddress || null, userAgent || null, new Date().toISOString());
}

function getPasswordExpirationStatus(db, email) {
  const user = db.prepare(
    'SELECT password_changed_at, password_expires_at FROM rd_app_user_security WHERE email = ?'
  ).get(email);
  if (!user || !user.password_changed_at) {
    return { status: 'unknown', daysUntilExpiry: 0, requiresChange: false };
  }
  const expiresAt = user.password_expires_at ? new Date(user.password_expires_at) : null;
  const now = new Date();
  const daysUntilExpiry = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const requiresChange = daysUntilExpiry <= 0;
  const warningLevel = daysUntilExpiry > 0 && daysUntilExpiry <= ADVANCED_COMPLIANCE.passwordExpiration.warningDays;
  return { status: requiresChange ? 'expired' : warningLevel ? 'warning' : 'valid', daysUntilExpiry, requiresChange, warningLevel };
}

function safeParseInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function validateUserPayload(payload, { partial = false } = {}) {
  const email = payload?.email?.trim()?.toLowerCase();
  const displayName = payload?.displayName?.trim();
  const accessRole = normalizeRoles(payload?.accessRole);

  if (!partial || payload?.email !== undefined) {
    if (!email || !email.includes('@')) {
      return { error: 'Email 格式無效' };
    }
  }

  if (!partial || payload?.displayName !== undefined) {
    if (!displayName) {
      return { error: '顯示名稱不可空白' };
    }
  }

  if (!partial || payload?.accessRole !== undefined) {
    if (!accessRole) {
      return { error: '角色無效' };
    }
  }

  return { email, displayName, accessRole };
}

function normalizeRoles(value) {
  if (typeof value !== 'string') return '';
  const roles = [...new Set(value.split(',').map((role) => role.trim().toLowerCase()).filter(Boolean))];
  return roles.length && roles.every((role) => allowedRoles.has(role)) ? roles.join(',') : '';
}

// Checks a comma-separated role list, e.g. "admin,pm,pe".
function userHasRole(user, requiredRole) {
  return normalizeRoles(user?.accessRole).split(',').includes(requiredRole);
}

function canManageProject(project, userDisplayName) {
  return project?.members?.PM === userDisplayName || project?.members?.PE === userDisplayName;
}

function canWriteState(user, currentState, nextState) {
  if (userHasRole(user, 'admin')) {
    return true;
  }

  if (!currentState || !Array.isArray(currentState.projects)) {
    return false;
  }

  const currentProjects = new Map(currentState.projects.map((project) => [project.id, project]));
  const nextProjects = Array.isArray(nextState.projects) ? nextState.projects : [];

  if (currentProjects.size !== nextProjects.length) {
    return false;
  }

  for (const nextProject of nextProjects) {
    const currentProject = currentProjects.get(nextProject.id);
    if (!currentProject) {
      return false;
    }

    if (
      nextProject.name !== currentProject.name ||
      (nextProject.description || '') !== (currentProject.description || '') ||
      (nextProject.group || '') !== (currentProject.group || '') ||
      (nextProject.difficulty || '') !== (currentProject.difficulty || '') ||
      JSON.stringify(nextProject.members || {}) !== JSON.stringify(currentProject.members || {})
    ) {
      return false;
    }

    const nextTasks = Array.isArray(nextProject.tasks) ? nextProject.tasks : [];
    const currentTasks = Array.isArray(currentProject.tasks) ? currentProject.tasks : [];
    if (nextTasks.length !== currentTasks.length) {
      return false;
    }

    const managed = canManageProject(currentProject, user.displayName);
    if (managed) {
      continue;
    }

    const ownRoles = new Set(
      Object.entries(currentProject.members || {})
        .filter(([, person]) => person === user.displayName)
        .map(([role]) => role)
    );

    const currentTaskMap = new Map(currentTasks.map((task) => [task.id, task]));
    for (const nextTask of nextTasks) {
      const currentTask = currentTaskMap.get(nextTask.id);
      if (!currentTask) {
        return false;
      }

      const ownTask = ownRoles.has(currentTask.role);
      if (!ownTask && JSON.stringify(nextTask) !== JSON.stringify(currentTask)) {
        return false;
      }

      if (ownTask) {
        if (nextTask.role !== currentTask.role || nextTask.name !== currentTask.name) {
          return false;
        }
      }
    }
  }

  return true;
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      if (!body.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('資料格式錯誤'));
      }
    });
    request.on('error', reject);
  });
}

export async function createServer({ host = '0.0.0.0', port = 3000, dbPath = defaultDbPath } = {}) {
  const db = new DatabaseSync(dbPath);
  initializeDatabase(db);

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
      const user = getSessionUser(request, db);

      if (url.pathname === '/api/login/options' && request.method === 'GET') {
        const users = db.prepare('SELECT email, display_name AS displayName FROM rd_app_users WHERE COALESCE((SELECT enabled FROM rd_app_user_security WHERE email = rd_app_users.email), 1) = 1 ORDER BY email ASC').all();
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }));
        response.end(JSON.stringify({ users }));
        return;
      }

      if (url.pathname === '/api/role-members' && request.method === 'GET') {
        if (!user) {
          response.writeHead(401, addCorsHeaders({ 'content-type': 'application/json; charset=utf-8' }));
          response.end(JSON.stringify({ error: '請先登入' }));
          return;
        }

        const users = db.prepare(`
          SELECT u.display_name AS displayName, u.access_role AS accessRole
          FROM rd_app_users u
          LEFT JOIN rd_app_user_security sec ON u.email = sec.email
          WHERE COALESCE(sec.enabled, 1) = 1
          ORDER BY u.display_name COLLATE NOCASE ASC, u.email ASC
        `).all();
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }));
        response.end(JSON.stringify({ users }));
        return;
      }

      if (url.pathname === '/api/users' && request.method === 'GET') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }

        const users = db.prepare(`
          SELECT u.email, u.display_name AS displayName, u.access_role AS accessRole, u.created_at AS createdAt,
                 COALESCE(sec.enabled, 1) AS enabled, sec.last_login_at AS lastLoginAt
          FROM rd_app_users u
          LEFT JOIN rd_app_user_security sec ON u.email = sec.email
          ORDER BY u.created_at ASC, u.email ASC
        `).all();
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }));
        response.end(JSON.stringify({ users }));
        return;
      }

      if (url.pathname === '/api/users' && request.method === 'POST') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }

        const payload = await parseJsonBody(request);
        const validated = validateUserPayload(payload);
        if (validated.error) {
          response.writeHead(400, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: validated.error }));
          return;
        }

        // Generate ISO 27001 compliant default password if not provided
        let password = payload?.password;
        if (!password) {
          password = generateSecurePassword();
        }
        const pwdValidation = validatePassword(password, validated.email);
        if (!pwdValidation.valid) {
          response.writeHead(400, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: pwdValidation.error }));
          return;
        }

        const existing = getUserByEmail(db, validated.email);
        if (existing) {
          response.writeHead(409, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '帳號已存在' }));
          return;
        }

        const now = new Date().toISOString();
        const passwordHash = hashPasswordSync(password);
        const passwordExpiresAt = new Date(Date.now() + ADVANCED_COMPLIANCE.passwordExpiration.expirationDays * 24 * 60 * 60 * 1000).toISOString();
        
        db.prepare('INSERT INTO rd_app_users (email, display_name, access_role, created_at) VALUES (?, ?, ?, ?)').run(
          validated.email,
          validated.displayName,
          validated.accessRole,
          now
        );
        db.prepare(
          'INSERT INTO rd_app_user_security (email, enabled, password_hash, password_changed_at, password_expires_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(validated.email, 1, passwordHash, now, passwordExpiresAt, now);
        appendAudit(db, user.email, `create_user:${validated.email}`, 'info', { role: validated.accessRole });
        recordSecurityEvent(db, user.email, 'account_created', 'info', `Created account: ${validated.email}`, null, null);
        
        response.writeHead(201, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8'
        }));
        response.end(JSON.stringify({ ok: true, defaultPassword: password }));
        return;
      }

      if (url.pathname.startsWith('/api/users/') && request.method === 'PATCH') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }

        const targetEmail = decodeURIComponent(url.pathname.slice('/api/users/'.length)).trim().toLowerCase();
        const payload = await parseJsonBody(request);
        const validated = validateUserPayload(payload, { partial: true });
        if (validated.error) {
          response.writeHead(400, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: validated.error }));
          return;
        }

        if (payload?.password) {
          const pwdValidation = validatePassword(payload.password, targetEmail);
          if (!pwdValidation.valid) {
            response.writeHead(400, addCorsHeaders({
              'content-type': 'application/json; charset=utf-8'
            }));
            response.end(JSON.stringify({ error: pwdValidation.error }));
            return;
          }
        }

        const existing = getUserByEmail(db, targetEmail);
        if (!existing) {
          response.writeHead(404, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '找不到此帳號' }));
          return;
        }

        const now = new Date().toISOString();
        const nextRole = validated.accessRole || existing.accessRole;
        // 檢查是否在移除最後一個 admin
        const hadAdminRole = userHasRole(existing, 'admin');
        const willHaveAdminRole = userHasRole({ accessRole: nextRole }, 'admin');
        if (hadAdminRole && !willHaveAdminRole) {
          const adminCount = db.prepare("SELECT COUNT(*) AS n FROM rd_app_users u WHERE u.access_role LIKE '%admin%'").get().n;
          if (adminCount <= 1) {
            response.writeHead(400, addCorsHeaders({
              'content-type': 'application/json; charset=utf-8'
            }));
            response.end(JSON.stringify({ error: '至少要保留一位管理者' }));
            return;
          }
        }

        db.prepare('UPDATE rd_app_users SET display_name=?, access_role=? WHERE email=?').run(
          validated.displayName || existing.displayName,
          nextRole,
          targetEmail
        );
        // Update password if provided
        if (payload?.password) {
          const passwordHash = hashPasswordSync(payload.password);
          const passwordExpiresAt = new Date(Date.now() + ADVANCED_COMPLIANCE.passwordExpiration.expirationDays * 24 * 60 * 60 * 1000).toISOString();
          db.prepare('UPDATE rd_app_user_security SET password_hash=?, password_changed_at=?, password_expires_at=?, updated_at=? WHERE email=?').run(
            passwordHash,
            now,
            passwordExpiresAt,
            now,
            targetEmail
          );
          recordSecurityEvent(db, user.email, 'password_changed', 'info', `Password changed for ${targetEmail}`, null, null);
        }
        if (nextRole !== existing.accessRole) {
          recordSecurityEvent(db, user.email, 'role_changed', 'warning', `Role changed for ${targetEmail}: ${existing.accessRole} → ${nextRole}`, null, null);
        }
        appendAudit(db, user.email, `update_user:${targetEmail}`, 'info', { passwordChanged: !!payload?.password, roleChanged: nextRole !== existing.accessRole });
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8'
        }));
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname.startsWith('/api/users/') && request.method === 'DELETE') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }

        const targetEmail = decodeURIComponent(url.pathname.slice('/api/users/'.length)).trim().toLowerCase();
        const existing = getUserByEmail(db, targetEmail);
        if (!existing) {
          response.writeHead(404, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '找不到此帳號' }));
          return;
        }

        if (userHasRole(existing, 'admin')) {
          const adminCount = db.prepare("SELECT COUNT(*) AS n FROM rd_app_users u WHERE u.access_role LIKE '%admin%'").get().n;
          if (adminCount <= 1) {
            response.writeHead(400, addCorsHeaders({
              'content-type': 'application/json; charset=utf-8'
            }));
            response.end(JSON.stringify({ error: '至少要保留一位管理者' }));
            return;
          }
        }

        db.prepare('DELETE FROM rd_app_users WHERE email=?').run(targetEmail);
        db.prepare('DELETE FROM rd_app_sessions WHERE email=?').run(targetEmail);
        db.prepare('DELETE FROM rd_app_user_security WHERE email=?').run(targetEmail);
        appendAudit(db, user.email, `delete_user:${targetEmail}`, 'warning', { deletedEmail: targetEmail });
        recordSecurityEvent(db, user.email, 'account_deleted', 'warning', `Deleted account: ${targetEmail}`, null, null);
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8'
        }));
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname.startsWith('/api/users/') && url.pathname.endsWith('/force-logout') && request.method === 'POST') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }
        const targetEmail = decodeURIComponent(url.pathname.slice('/api/users/'.length, -'/force-logout'.length)).trim().toLowerCase();
        db.prepare('DELETE FROM rd_app_sessions WHERE email=?').run(targetEmail);
        appendAudit(db, user.email, `force_logout:${targetEmail}`, 'warning', { targetEmail });
        recordSecurityEvent(db, user.email, 'force_logout', 'warning', `Forced logout for ${targetEmail}`, null, null);
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8'
        }));
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname.startsWith('/api/users/') && url.pathname.endsWith('/toggle-enable') && request.method === 'POST') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }
        const targetEmail = decodeURIComponent(url.pathname.slice('/api/users/'.length, -'/toggle-enable'.length)).trim().toLowerCase();
        const existing = getUserByEmail(db, targetEmail);
        if (!existing) {
          response.writeHead(404, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '找不到此帳號' }));
          return;
        }
        const secRow = db.prepare('SELECT enabled FROM rd_app_user_security WHERE email = ?').get(targetEmail);
        const nextEnabled = (secRow?.enabled ?? 1) === 0 ? 1 : 0;
        const now = new Date().toISOString();
        if (secRow) {
          db.prepare('UPDATE rd_app_user_security SET enabled = ?, updated_at = ? WHERE email = ?').run(nextEnabled, now, targetEmail);
        } else {
          db.prepare('INSERT INTO rd_app_user_security (email, enabled, updated_at) VALUES (?, ?, ?)').run(targetEmail, nextEnabled, now);
        }
        if (nextEnabled === 0) {
          db.prepare('DELETE FROM rd_app_sessions WHERE email=?').run(targetEmail);
          recordSecurityEvent(db, user.email, 'account_disabled', 'critical', `Account disabled: ${targetEmail}`, null, null);
        } else {
          recordSecurityEvent(db, user.email, 'account_enabled', 'warning', `Account enabled: ${targetEmail}`, null, null);
        }
        appendAudit(db, user.email, `toggle_enable:${targetEmail}:${nextEnabled ? 'enabled' : 'disabled'}`, 'warning', { targetEmail, action: nextEnabled ? 'enabled' : 'disabled' });
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8'
        }));
        response.end(JSON.stringify({ ok: true, enabled: nextEnabled }));
        return;
      }

      if (url.pathname === '/api/audit' && request.method === 'GET') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }

        const limit = Math.min(Math.max(safeParseInt(url.searchParams.get('limit'), 50), 1), 500);
        const rows = db.prepare('SELECT id, email, action, severity, details, created_at AS createdAt FROM rd_audit_log ORDER BY id DESC LIMIT ?').all(limit);
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }));
        response.end(JSON.stringify({ logs: rows }));
        return;
      }

      if (url.pathname === '/api/login' && request.method === 'POST') {
        const payload = await parseJsonBody(request);
        const email = payload?.email?.trim()?.toLowerCase();
        const password = payload?.password || '';
        const nextUser = getUserByEmail(db, email);
        const now = new Date().toISOString();
        
        if (!nextUser) {
          response.writeHead(401, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '帳號或密碼錯誤' }));
          return;
        }

        // Verify password and check account status
        const secRow = db.prepare('SELECT password_hash, enabled, locked_until, login_attempts, password_expires_at FROM rd_app_user_security WHERE email = ?').get(email);
        const passwordHash = secRow?.password_hash;
        const passwordValid = await verifyPassword(password, passwordHash);
        
        // A.9.2.2 - Account Lockout Policy: Track failed login attempts
        if (!passwordValid) {
          const newAttempts = (secRow?.login_attempts ?? 0) + 1;
          let lockUntil = null;
          let severity = 'info';
          
          if (newAttempts >= ADVANCED_COMPLIANCE.accountLockout.maxAttempts) {
            lockUntil = new Date(Date.now() + ADVANCED_COMPLIANCE.accountLockout.lockoutDurationMinutes * 60 * 1000).toISOString();
            severity = 'critical';
          } else if (newAttempts >= ADVANCED_COMPLIANCE.accountLockout.maxAttempts - 1) {
            severity = 'warning';
          }
          
          db.prepare('UPDATE rd_app_user_security SET login_attempts = ?, locked_until = ? WHERE email = ?').run(newAttempts, lockUntil, email);
          recordSecurityEvent(db, email, 'failed_login', severity, `Failed login attempt ${newAttempts}/${ADVANCED_COMPLIANCE.accountLockout.maxAttempts}`, null, null);
          
          response.writeHead(401, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '帳號或密碼錯誤' }));
          return;
        }

        const enabled = secRow?.enabled ?? 1;
        const lockedUntil = secRow?.locked_until;
        const loginAttempts = secRow?.login_attempts ?? 0;

        if (enabled === 0) {
          recordSecurityEvent(db, email, 'disabled_account_login_attempt', 'warning', 'Attempt to login to disabled account', null, null);
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '此帳號已被禁用' }));
          return;
        }

        if (lockedUntil && lockedUntil > now) {
          recordSecurityEvent(db, email, 'locked_account_login_attempt', 'warning', 'Attempt to login to locked account', null, null);
          response.writeHead(429, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '登入嘗試過多，請稍候' }));
          return;
        }

        // A.9.4.3 - Password Expiration Check
        const pwdExpStatus = getPasswordExpirationStatus(db, email);
        if (pwdExpStatus.requiresChange) {
          recordSecurityEvent(db, email, 'expired_password_login', 'critical', 'Login with expired password', null, null);
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '密碼已過期，需要強制修改', passwordExpired: true }));
          return;
        }

        const token = createSession(db, nextUser.email);
        appendAudit(db, nextUser.email, 'login', 'info', { passwordWarning: pwdExpStatus.warningLevel ? `警告: 密碼將在 ${pwdExpStatus.daysUntilExpiry} 天後過期` : null });
        
        // Ensure security record exists
        const secExists = db.prepare('SELECT 1 FROM rd_app_user_security WHERE email = ?').get(nextUser.email);
        if (secExists) {
          db.prepare(
            `UPDATE rd_app_user_security SET login_attempts = 0, last_login_at = ?, locked_until = NULL 
             WHERE email = ?`
          ).run(now, nextUser.email);
        } else {
          db.prepare(
            `INSERT INTO rd_app_user_security (email, enabled, last_login_at, login_attempts, password_changed_at, password_expires_at, updated_at) 
             VALUES (?, 1, ?, 0, ?, ?, ?)`
          ).run(nextUser.email, now, now, new Date(Date.now() + ADVANCED_COMPLIANCE.passwordExpiration.expirationDays * 24 * 60 * 60 * 1000).toISOString(), now);
        }
        
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': makeSessionCookie(token)
        }));
        response.end(JSON.stringify({ 
          user: nextUser, 
          passwordWarning: pwdExpStatus.warningLevel ? `密碼將在 ${pwdExpStatus.daysUntilExpiry} 天後過期` : null 
        }));
        return;
      }

      if (url.pathname === '/api/logout' && request.method === 'POST') {
        if (user?.sessionToken) {
          db.prepare('DELETE FROM rd_app_sessions WHERE token=?').run(user.sessionToken);
          appendAudit(db, user.email, 'logout');
        }
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': clearSessionCookie()
        }));
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (request.method === 'OPTIONS') {
        response.writeHead(204, addCorsHeaders({
          'content-length': '0'
        }));
        response.end();
        return;
      }

      if (url.pathname === '/api/session') {
        if (!user) {
          response.writeHead(401, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
          }));
          response.end(JSON.stringify({ loggedIn: false, error: '尚未登入' }));
          return;
        }

        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }));
        response.end(JSON.stringify({ user }));
        return;
      }

      if (url.pathname === '/api/state/restore' && request.method === 'POST') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }

        const payload = await parseJsonBody(request);
        const next = payload?.state;
        if (!validState(next)) {
          response.writeHead(400, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '備份檔中的專案資料格式錯誤' }));
          return;
        }

        const currentRow = db.prepare("SELECT json FROM rd_app_state WHERE key='main'").get();
        const now = new Date().toISOString();
        const body = JSON.stringify(next);
        let backupId = null;
        try {
          db.exec('BEGIN IMMEDIATE;');
          if (currentRow) {
            const backup = db.prepare('INSERT INTO rd_app_state_backups (json, source, created_at, created_by) VALUES (?, ?, ?, ?)').run(
              currentRow.json,
              'json_import',
              now,
              user.email
            );
            backupId = Number(backup.lastInsertRowid);
          }
          db.prepare("INSERT INTO rd_app_state (key, json, updated_at, updated_by) VALUES ('main', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at, updated_by=excluded.updated_by").run(body, now, user.email);
          appendAudit(db, user.email, 'restore_state_backup', 'warning', {
            backupId,
            restoredProjects: next.projects.length
          });
          recordSecurityEvent(db, user.email, 'state_restored', 'warning', `Restored ${next.projects.length} projects from JSON backup`, null, null);
          db.exec('COMMIT;');
        } catch (error) {
          try { db.exec('ROLLBACK;'); } catch {}
          throw error;
        }

        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }));
        response.end(JSON.stringify({ ok: true, backupId, updatedAt: now, updatedBy: user.email }));
        return;
      }

      if (url.pathname === '/api/state') {
        if (!user) {
          response.writeHead(401, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
          }));
          response.end(JSON.stringify({ error: '尚未登入' }));
          return;
        }

        if (request.method === 'GET') {
          const row = db.prepare("SELECT json, updated_at AS updatedAt, updated_by AS updatedBy FROM rd_app_state WHERE key='main'").get();
          const payload = row ? { state: JSON.parse(row.json), updatedAt: row.updatedAt, updatedBy: row.updatedBy } : { empty: true, user };
          response.writeHead(200, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
          }));
          response.end(JSON.stringify(payload));
          return;
        }

        if (request.method === 'PUT') {
          const next = await parseJsonBody(request);
          if (!validState(next)) {
            response.writeHead(400, addCorsHeaders({
              'content-type': 'application/json; charset=utf-8'
            }));
            response.end(JSON.stringify({ error: '專案資料格式錯誤' }));
            return;
          }

          const currentRow = db.prepare("SELECT json FROM rd_app_state WHERE key='main'").get();
          const currentState = currentRow ? JSON.parse(currentRow.json) : null;
          if (!canWriteState(user, currentState, next)) {
            response.writeHead(403, addCorsHeaders({
              'content-type': 'application/json; charset=utf-8'
            }));
            response.end(JSON.stringify({ error: '你沒有權限變更這些內容' }));
            return;
          }

          const now = new Date().toISOString();
          const body = JSON.stringify(next);
          db.prepare("INSERT INTO rd_app_state (key, json, updated_at, updated_by) VALUES ('main', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at, updated_by=excluded.updated_by").run(body, now, user.email);
          db.prepare("INSERT INTO rd_audit_log (email, action, created_at) VALUES (?, ?, ?)").run(user.email, 'update_state', now);

          response.writeHead(200, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
          }));
          response.end(JSON.stringify({ ok: true, updatedAt: now, updatedBy: user.email }));
          return;
        }

        response.writeHead(405, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8'
        }));
        response.end(JSON.stringify({ error: '不支援此操作' }));
        return;
      }

      // ===== Advanced Compliance APIs (ISO 27001 A.9.2, A.9.4, A.12.4) =====

      if (url.pathname === '/api/compliance/permission-review' && request.method === 'GET') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }

        try {
          // ISO 27001 A.9.2.3 - Generate Permission Review Report
          const users = db.prepare(`
            SELECT u.email, u.display_name, u.access_role, u.created_at,
                   COALESCE(sec.enabled, 1) AS enabled, 
                   sec.last_login_at,
                   sec.login_attempts,
                   sec.locked_until,
                   sec.password_changed_at,
                   sec.password_expires_at
            FROM rd_app_users u
            LEFT JOIN rd_app_user_security sec ON u.email = sec.email
            ORDER BY u.created_at ASC
          `).all();

          const report = {
            generatedAt: new Date().toISOString(),
            reviewedBy: user.email,
            totalUsers: users.length,
            roleDistribution: {},
            complianceIssues: [],
            users: []
          };

          for (const u of users) {
            const pwdStatus = getPasswordExpirationStatus(db, u.email);
            const issues = [];
            
            if (u.enabled === 0) issues.push('帳號已禁用');
            if (u.locked_until && u.locked_until > new Date().toISOString()) issues.push('帳號已鎖定');
            if (pwdStatus.requiresChange) issues.push('密碼已過期');
            if (pwdStatus.warningLevel) issues.push(`密碼將在 ${pwdStatus.daysUntilExpiry} 天後過期`);
            if ((u.login_attempts || 0) > 2) issues.push(`登入失敗嘗試 ${u.login_attempts} 次`);
            
            if (!report.roleDistribution[u.access_role]) report.roleDistribution[u.access_role] = 0;
            report.roleDistribution[u.access_role]++;
            
            if (issues.length > 0) {
              report.complianceIssues.push({ email: u.email, issues });
            }
            
            report.users.push({
              email: u.email,
              displayName: u.display_name,
              role: u.access_role,
              createdAt: u.created_at,
              enabled: u.enabled === 1,
              lastLogin: u.last_login_at || '未登入',
              loginAttempts: u.login_attempts || 0,
              isLocked: u.locked_until && u.locked_until > new Date().toISOString(),
              passwordStatus: pwdStatus.status,
              passwordDaysUntilExpiry: pwdStatus.daysUntilExpiry,
              issues
            });
          }

          response.writeHead(200, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
          }));
          response.end(JSON.stringify(report));
        } catch (err) {
          console.error('Permission review error:', err);
          response.writeHead(500, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '權限審查報告生成失敗', details: err.message }));
        }
        return;
      }

      if (url.pathname === '/api/compliance/security-events' && request.method === 'GET') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }

        // ISO 27001 A.12.4.1 - Security Event Monitoring
        const limit = Math.min(Math.max(safeParseInt(url.searchParams.get('limit'), 100), 1), 500);
        const severity = url.searchParams.get('severity'); // 'critical', 'warning', 'info'
        
        let query = 'SELECT id, email, event_type, severity, description, ip_address, user_agent, created_at FROM rd_security_events';
        const params = [];
        
        if (severity) {
          query += ' WHERE severity = ?';
          params.push(severity);
        }
        
        query += ' ORDER BY id DESC LIMIT ?';
        params.push(limit);
        
        const events = db.prepare(query).all(...params);

        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }));
        response.end(JSON.stringify({ 
          events,
          totalCount: events.length,
          filteredBySeverity: severity || 'none'
        }));
        return;
      }

      if (url.pathname === '/api/compliance/password-expiration' && request.method === 'GET') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }

        // ISO 27001 A.9.4.3 - Password Expiration Report
        const users = db.prepare(`
          SELECT u.email, u.display_name, sec.password_changed_at, sec.password_expires_at
          FROM rd_app_users u
          LEFT JOIN rd_app_user_security sec ON u.email = sec.email
          WHERE COALESCE(sec.enabled, 1) = 1
        `).all();

        const report = {
          generatedAt: new Date().toISOString(),
          reviewedBy: user.email,
          policy: {
            expirationDays: ADVANCED_COMPLIANCE.passwordExpiration.expirationDays,
            warningDays: ADVANCED_COMPLIANCE.passwordExpiration.warningDays
          },
          passwords: {
            expired: [],
            warning: [],
            valid: []
          }
        };

        for (const u of users) {
          const status = getPasswordExpirationStatus(db, u.email);
          const entry = {
            email: u.email,
            displayName: u.display_name,
            changedAt: u.password_changed_at,
            expiresAt: u.password_expires_at,
            daysUntilExpiry: status.daysUntilExpiry
          };

          if (status.requiresChange) {
            report.passwords.expired.push(entry);
          } else if (status.warningLevel) {
            report.passwords.warning.push(entry);
          } else {
            report.passwords.valid.push(entry);
          }
        }

        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }));
        response.end(JSON.stringify(report));
        return;
      }

      if (url.pathname === '/api/compliance/session-monitoring' && request.method === 'GET') {
        if (!user || !userHasRole(user, 'admin')) {
          response.writeHead(403, addCorsHeaders({
            'content-type': 'application/json; charset=utf-8'
          }));
          response.end(JSON.stringify({ error: '需要管理者權限' }));
          return;
        }

        // ISO 27001 A.12.4.1 - Session Monitoring Report
        const sessions = db.prepare(`
          SELECT s.token, s.email, s.created_at, s.expires_at, s.last_activity_at, s.user_agent, s.ip_address
          FROM rd_app_sessions s
          ORDER BY s.created_at DESC
        `).all();

        const activeSessions = sessions.filter(s => new Date(s.expires_at) > new Date());
        const report = {
          generatedAt: new Date().toISOString(),
          reviewedBy: user.email,
          policy: {
            sessionDuration: `${sessionDurationSeconds / 3600} 小時`,
            maxConcurrentSessions: ADVANCED_COMPLIANCE.sessionMonitoring.maxConcurrentSessions,
            inactivityTimeout: `${ADVANCED_COMPLIANCE.sessionMonitoring.inactivityTimeoutMinutes} 分鐘`
          },
          activeSessions: activeSessions.length,
          sessions: activeSessions.map(s => ({
            email: s.email,
            createdAt: s.created_at,
            expiresAt: s.expires_at,
            lastActivity: s.last_activity_at,
            userAgent: s.user_agent,
            ipAddress: s.ip_address
          })),
          sessionsByUser: {}
        };

        for (const session of activeSessions) {
          if (!report.sessionsByUser[session.email]) {
            report.sessionsByUser[session.email] = 0;
          }
          report.sessionsByUser[session.email]++;
        }

        // Check for concurrent session limit violations
        report.concurrencyViolations = Object.entries(report.sessionsByUser)
          .filter(([, count]) => count > ADVANCED_COMPLIANCE.sessionMonitoring.maxConcurrentSessions)
          .map(([email, count]) => ({ email, sessionCount: count, limitExceeded: count - ADVANCED_COMPLIANCE.sessionMonitoring.maxConcurrentSessions }));

        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }));
        response.end(JSON.stringify(report));
        return;
      }

      if (url.pathname === '/api/health') {
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8'
        }));
        response.end(JSON.stringify({ ok: true, status: 'healthy', port, host }));
        return;
      }

      if (url.pathname === '/' || url.pathname === '/app.html') {
        const html = await readFile(defaultHtmlPath, 'utf8');
        response.writeHead(200, addCorsHeaders({
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        }));
        response.end(html);
        return;
      }

      response.writeHead(404, addCorsHeaders({
        'content-type': 'text/plain; charset=utf-8'
      }));
      response.end('Not found');
    } catch (error) {
      console.error('request failed', error);
      response.writeHead(500, addCorsHeaders({
        'content-type': 'application/json; charset=utf-8'
      }));
      response.end(JSON.stringify({ error: '服務暫時無法使用' }));
    }
  });

  await new Promise((resolve) => server.listen(port, host, resolve));

  return {
    server,
    db,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    })
  };
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const dbPath = process.env.DB_PATH || defaultDbPath;

  const defaultAdmin = getDefaultAdminUser();

  const { server } = await createServer({ host, port, dbPath });
  const address = server.address();
  console.log(`Local project management server running at http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`);
  console.log(`Shared database: ${dbPath}`);
  console.log(`Default login email: ${defaultAdmin.email}`);
}
