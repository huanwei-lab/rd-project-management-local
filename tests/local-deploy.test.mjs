import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/local-server.mjs';

async function loginAs(baseUrl, email) {
  const login = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Admin@2026Secure' })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie;
}

test('local deployment server exposes session and state endpoints', async () => {
  const { server, close } = await createServer({
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:'
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const session = await fetch(`${baseUrl}/api/session`);
    assert.equal(session.status, 401);
    const anonymousWrite = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projects: [{ id: 'unauthorized', name: 'Unauthorized', members: {}, tasks: [] }] })
    });
    assert.equal(anonymousWrite.status, 401);
    const users = await fetch(`${baseUrl}/api/login/options`);
    assert.equal(users.status, 200);
    const usersData = await users.json();
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: usersData.users[0].email, password: 'Admin@2026Secure' })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.ok(cookie);

    const authedSession = await fetch(`${baseUrl}/api/session`, {
      headers: { cookie }
    });
    assert.equal(authedSession.status, 200);
    const sessionData = await authedSession.json();
    assert.equal(sessionData.user.accessRole, 'admin');

    const state = await fetch(`${baseUrl}/api/state`, {
      headers: { cookie }
    });
    assert.equal(state.status, 200);
    const stateData = await state.json();
    assert.ok(stateData.empty === true || Array.isArray(stateData.state?.projects));
  } finally {
    await close();
  }
});

test('local deployment server handles browser preflight requests for LAN usage', async () => {
  const { server, close } = await createServer({
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:'
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const preflight = await fetch(`${baseUrl}/api/state`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://192.168.1.20:3000',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type'
      }
    });

    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
    assert.match(preflight.headers.get('access-control-allow-methods') || '', /PUT/i);
  } finally {
    await close();
  }
});

test('local deployment server includes CORS headers on validation errors', async () => {
  const { server, close } = await createServer({
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:'
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const users = await fetch(`${baseUrl}/api/login/options`);
    const usersData = await users.json();
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: usersData.users[0].email, password: 'Admin@2026Secure' })
    });
    const cookie = login.headers.get('set-cookie');

    const invalidUpdate = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        Origin: 'http://192.168.1.20:3000',
        cookie
      },
      body: JSON.stringify({ projects: [] })
    });

    assert.equal(invalidUpdate.status, 400);
    assert.equal(invalidUpdate.headers.get('access-control-allow-origin'), '*');
  } finally {
    await close();
  }
});

test('local deployment server supports logout and blocks state access after logout', async () => {
  const { server, close } = await createServer({
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:'
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const users = await fetch(`${baseUrl}/api/login/options`);
    const usersData = await users.json();
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: usersData.users[0].email, password: 'Admin@2026Secure' })
    });
    const cookie = login.headers.get('set-cookie');

    const logout = await fetch(`${baseUrl}/api/logout`, {
      method: 'POST',
      headers: { cookie }
    });
    assert.equal(logout.status, 200);
    const clearedCookie = logout.headers.get('set-cookie');
    assert.match(clearedCookie || '', /Max-Age=0/);

    const state = await fetch(`${baseUrl}/api/state`);
    assert.equal(state.status, 401);
  } finally {
    await close();
  }
});

test('local deployment server supports admin user CRUD and audit logs', async () => {
  const { server, close } = await createServer({
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:'
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const loginOptions = await fetch(`${baseUrl}/api/login/options`);
    const optionsData = await loginOptions.json();
    const adminEmail = optionsData.users[0].email;
    const adminCookie = await loginAs(baseUrl, adminEmail);

    const createUser = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie
      },
      body: JSON.stringify({
        email: 'viewer@localhost',
        displayName: 'Viewer One',
        accessRole: 'viewer'
      })
    });
    assert.equal(createUser.status, 201);

    const updateUser = await fetch(`${baseUrl}/api/users/viewer%40localhost`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie
      },
      body: JSON.stringify({ displayName: 'Viewer Two', accessRole: 'ce' })
    });
    assert.equal(updateUser.status, 200);

    const users = await fetch(`${baseUrl}/api/users`, {
      headers: { cookie: adminCookie }
    });
    assert.equal(users.status, 200);
    const usersData = await users.json();
    assert.ok(usersData.users.some((user) => user.email === 'viewer@localhost' && user.accessRole === 'ce'));

    const logs = await fetch(`${baseUrl}/api/audit?limit=20`, {
      headers: { cookie: adminCookie }
    });
    assert.equal(logs.status, 200);
    const logsData = await logs.json();
    assert.ok(logsData.logs.some((log) => String(log.action).startsWith('create_user:viewer@localhost')));
    assert.ok(logsData.logs.some((log) => String(log.action).startsWith('update_user:viewer@localhost')));

    const deleteUser = await fetch(`${baseUrl}/api/users/viewer%40localhost`, {
      method: 'DELETE',
      headers: { cookie: adminCookie }
    });
    assert.equal(deleteUser.status, 200);
  } finally {
    await close();
  }
});

test('a multi-role admin can open account management APIs', async () => {
  const { server, close } = await createServer({ host: '127.0.0.1', port: 0, dbPath: ':memory:' });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const adminCookie = await loginAs(baseUrl, 'local-admin@localhost');
    const createUser = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        email: 'eric.wang@kuentong.com',
        displayName: 'Eric',
        accessRole: 'admin,pm',
        password: 'Welcome2026'
      })
    });
    assert.equal(createUser.status, 201);

    const ericLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'eric.wang@kuentong.com', password: 'Welcome2026' })
    });
    assert.equal(ericLogin.status, 200);
    const users = await fetch(`${baseUrl}/api/users`, { headers: { cookie: ericLogin.headers.get('set-cookie') } });
    assert.equal(users.status, 200);

    const roleMembers = await fetch(`${baseUrl}/api/role-members`, { headers: { cookie: ericLogin.headers.get('set-cookie') } });
    assert.equal(roleMembers.status, 200);
    const roleMembersData = await roleMembers.json();
    assert.deepEqual(roleMembersData.users, [{ displayName: 'Eric', accessRole: 'admin,pm' }, { displayName: 'Local Admin', accessRole: 'admin' }]);
  } finally {
    await close();
  }
});

test('admin backup restore replaces shared state and snapshots the prior state', async () => {
  const { server, close } = await createServer({ host: '127.0.0.1', port: 0, dbPath: ':memory:' });
  const project = (id, name) => ({
    id,
    name,
    description: '',
    members: { PM: 'Local Admin' },
    tasks: []
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const cookie = await loginAs(baseUrl, 'local-admin@localhost');
    const initialState = { projects: [project('before', 'Before restore')] };
    const seed = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(initialState)
    });
    assert.equal(seed.status, 200);

    const restoredState = { projects: [project('after', 'Restored project')] };
    const restore = await fetch(`${baseUrl}/api/state/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ state: restoredState })
    });
    assert.equal(restore.status, 200);
    const restoreData = await restore.json();
    assert.equal(typeof restoreData.backupId, 'number');

    const current = await fetch(`${baseUrl}/api/state`, { headers: { cookie } });
    assert.deepEqual((await current.json()).state, restoredState);
  } finally {
    await close();
  }
});

test('local deployment server enforces server-side write authorization', async () => {
  const { server, close } = await createServer({
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:'
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const loginOptions = await fetch(`${baseUrl}/api/login/options`);
    const optionsData = await loginOptions.json();
    const adminEmail = optionsData.users[0].email;
    const adminCookie = await loginAs(baseUrl, adminEmail);

    const createUser = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie
      },
      body: JSON.stringify({
        email: 'viewer@localhost',
        displayName: 'Viewer User',
        accessRole: 'viewer',
        password: 'SharedPass2026'
      })
    });
    assert.equal(createUser.status, 201);

    const seedState = {
      projects: [
        {
          id: 'p1',
          name: 'Alpha',
          description: 'seed',
          members: {
            PM: 'PM A',
            PE: 'PE A',
            CE: 'Viewer User',
            ME: 'ME A',
            SME: 'SME A',
            QE: 'QE A'
          },
          tasks: [
            { id: 't1', name: 'Task 1', role: 'CE', status: 'todo', due: '', start: '' },
            { id: 't2', name: 'Task 2', role: 'PM', status: 'todo', due: '', start: '' }
          ]
        }
      ]
    };

    const seed = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie
      },
      body: JSON.stringify(seedState)
    });
    assert.equal(seed.status, 200);

    const viewerLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'viewer@localhost', password: 'SharedPass2026' })
    });
    assert.equal(viewerLogin.status, 200);
    const viewerCookie = viewerLogin.headers.get('set-cookie');
    const illegalChange = JSON.parse(JSON.stringify(seedState));
    illegalChange.projects[0].name = 'Hacked Name';

    const forbidden = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: viewerCookie
      },
      body: JSON.stringify(illegalChange)
    });
    assert.equal(forbidden.status, 403);

    const legalTaskUpdate = JSON.parse(JSON.stringify(seedState));
    legalTaskUpdate.projects[0].tasks[0].status = 'doing';
    const allowed = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: viewerCookie
      },
      body: JSON.stringify(legalTaskUpdate)
    });
    assert.equal(allowed.status, 200);
  } finally {
    await close();
  }
});
