import os from 'node:os';
import { createServer } from '../server/local-server.mjs';

function getLocalIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const list of Object.values(interfaces)) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) {
        addresses.push(item.address);
      }
    }
  }

  return [...new Set(addresses)];
}

async function main() {
  const { server, close } = await createServer({ host: '0.0.0.0', port: 0 });
  const port = server.address().port;
  const addresses = getLocalIpv4Addresses();

  if (!addresses.length) {
    console.log('No external IPv4 address found. Check network connection.');
    await close();
    process.exit(1);
  }

  console.log(`Server started on 0.0.0.0:${port}`);
  console.log('Testing health endpoint from local machine using LAN IPs...');

  let failed = 0;
  for (const address of addresses) {
    const url = `http://${address}:${port}/api/health`;
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      const body = await response.json();
      if (!response.ok || body.ok !== true) {
        failed += 1;
        console.log(`[FAIL] ${url} -> status=${response.status}`);
        continue;
      }
      console.log(`[OK]   ${url}`);
    } catch (error) {
      failed += 1;
      console.log(`[FAIL] ${url} -> ${error.message}`);
    }
  }

  await close();

  if (failed > 0) {
    console.log('Some LAN checks failed. If other computers cannot connect, check Windows Firewall inbound rule for node.exe or port 3000.');
    process.exit(1);
  }

  console.log('LAN diagnostic passed on this machine. Other computers on the same subnet should be able to connect when firewall allows inbound traffic.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
