import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sourceDirArg = process.argv[2];
if (!sourceDirArg) {
  console.error('Usage: node scripts/apply-manager-return.mjs <manager_source_folder>');
  process.exit(1);
}

const sourceDir = path.resolve(sourceDirArg);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(rootDir, '.handoff-backups', timestamp);

const mergeTargets = [
  'app.html',
  'worker/index.js',
  'db/schema.ts',
  'scripts/build.mjs',
  'scripts/validate-artifact.mjs',
  'README_SOURCE.md'
];

async function exists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function backupAndReplace(relativePath) {
  const from = path.join(sourceDir, relativePath);
  const to = path.join(rootDir, relativePath);
  const backup = path.join(backupDir, relativePath);

  const incomingExists = await exists(from);
  if (!incomingExists) {
    return { relativePath, changed: false, reason: 'missing in source' };
  }

  await mkdir(path.dirname(backup), { recursive: true });
  await mkdir(path.dirname(to), { recursive: true });
  await cp(to, backup, { force: true });
  await cp(from, to, { force: true });
  return { relativePath, changed: true };
}

async function main() {
  const marker = path.join(sourceDir, 'MANIFEST.json');
  if (!(await exists(marker))) {
    console.warn('Warning: MANIFEST.json not found in source folder. Applying anyway.');
  }

  await rm(backupDir, { recursive: true, force: true });
  await mkdir(backupDir, { recursive: true });

  const results = [];
  for (const relativePath of mergeTargets) {
    results.push(await backupAndReplace(relativePath));
  }

  const applied = results.filter((x) => x.changed).map((x) => x.relativePath);
  const skipped = results.filter((x) => !x.changed);

  const report = {
    appliedAt: new Date().toISOString(),
    sourceDir,
    backupDir,
    applied,
    skipped
  };

  await writeFile(path.join(backupDir, 'apply-report.json'), JSON.stringify(report, null, 2));

  console.log('Manager return applied.');
  console.log(`Backup folder: ${backupDir}`);
  console.log('Applied files:');
  for (const file of applied) {
    console.log(`- ${file}`);
  }

  if (skipped.length > 0) {
    console.log('Skipped files:');
    for (const item of skipped) {
      console.log(`- ${item.relativePath} (${item.reason})`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
