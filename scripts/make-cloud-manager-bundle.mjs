import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'handoff', 'cloud-manager-bundle');

const includeFiles = [
  'app.html',
  'worker/index.js',
  'db/schema.ts',
  'scripts/build.mjs',
  'scripts/validate-artifact.mjs',
  'package.json',
  'README_SOURCE.md',
  '.openai/hosting.json'
];

const includeDirs = [
  '.openai/drizzle'
];

const managerGuide = `# Cloud Bundle For Development Manager\n\nThis bundle is for cloud-side edits and online verification.\n\n## What To Modify\n- app.html\n- worker/index.js\n- db/schema.ts (if schema changes are needed)\n\n## Validation\n- node scripts/build.mjs\n- node scripts/validate-artifact.mjs\n\n## Return Package\nAfter cloud verification is done, return source files in this same structure.\nDo not remove files from this bundle; only modify needed files.\n`;

async function copyRelative(fileOrDirPath) {
  const src = path.join(rootDir, fileOrDirPath);
  const dest = path.join(outDir, fileOrDirPath);
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true, force: true });
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const file of includeFiles) {
    await copyRelative(file);
  }

  for (const dir of includeDirs) {
    await copyRelative(dir);
  }

  const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  const manifest = {
    generatedAt: new Date().toISOString(),
    bundleType: 'cloud-manager',
    sourceScripts: packageJson.scripts,
    files: includeFiles,
    directories: includeDirs
  };

  await writeFile(path.join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(outDir, 'MANAGER_GUIDE.md'), managerGuide);

  console.log(`Cloud manager bundle created at: ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
