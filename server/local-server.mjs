import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const defaultDbPath = path.join(rootDir, 'db', 'local-projects.sqlite');
const defaultHtmlPath = path.join(rootDir, 'app.html');
const corsHeaders = {
  'access-control-allow-origin': process.env.ALLOWED_ORIGINS || '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, X-Requested-With',
  'access-control-max-age': '86400',
  vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
};

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

function initializeDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rd_app_state (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rd_app_users (
      email TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      access_role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rd_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      action TEXT NOT NULL,
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
}

function getLocalUser() {
  return {
    email: process.env.LOCAL_ADMIN_EMAIL || 'local-admin@localhost',
    displayName: process.env.LOCAL_ADMIN_NAME || 'Local Admin',
    accessRole: process.env.LOCAL_ADMIN_ROLE || 'admin'
  };
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
      const user = getLocalUser();

      if (request.method === 'OPTIONS') {
        response.writeHead(204, addCorsHeaders({
          'content-length': '0'
        }));
        response.end();
        return;
      }

      if (url.pathname === '/api/session') {
        response.writeHead(200, addCorsHeaders({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }));
        response.end(JSON.stringify({ user }));
        return;
      }

      if (url.pathname === '/api/state') {
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

  const { server } = await createServer({ host, port, dbPath });
  const address = server.address();
  console.log(`Local project management server running at http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`);
  console.log(`Shared database: ${dbPath}`);
}
