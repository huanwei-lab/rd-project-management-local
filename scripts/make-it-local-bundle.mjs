import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'handoff', 'it-local-bundle');

const includeFiles = [
  'app.html',
  'server/local-server.mjs',
  'package.json',
  'README.md',
  'start-server.cmd',
  'test-lan.cmd',
  'scripts/lan-diagnostic.mjs',
  'scripts/backup-db.mjs'
];

async function copyRelative(filePath) {
  const src = path.join(rootDir, filePath);
  const dest = path.join(outDir, filePath);
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { force: true, recursive: true });
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const file of includeFiles) {
    await copyRelative(file);
  }

  const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  const manifest = {
    generatedAt: new Date().toISOString(),
    bundleType: 'it-local',
    scripts: packageJson.scripts,
    files: includeFiles
  };

  await writeFile(path.join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  console.log(`IT local bundle created at: ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
