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
    assert.equal(session.status, 200);
    const sessionData = await session.json();
    assert.equal(sessionData.user.accessRole, 'admin');

    const state = await fetch(`${baseUrl}/api/state`);
    assert.equal(state.status, 200);
    const stateData = await state.json();
    assert.ok(stateData.empty === true || Array.isArray(stateData.state?.projects));
  } finally {
    await close();
  }
});
