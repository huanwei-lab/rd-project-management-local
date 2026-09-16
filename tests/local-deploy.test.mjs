import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/local-server.mjs';

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
    const users = await fetch(`${baseUrl}/api/users`);
    assert.equal(users.status, 200);
    const usersData = await users.json();
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: usersData.users[0].email })
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
    const users = await fetch(`${baseUrl}/api/users`);
    const usersData = await users.json();
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: usersData.users[0].email })
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
    const users = await fetch(`${baseUrl}/api/users`);
    const usersData = await users.json();
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: usersData.users[0].email })
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
