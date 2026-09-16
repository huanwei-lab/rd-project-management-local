import { spawnSync } from 'node:child_process';
import path from 'node:path';

const sourceArg = process.argv[2];
const zipArg = process.argv[3];

if (!sourceArg || !zipArg) {
  console.error('Usage: node scripts/zip-bundle.mjs <source_dir> <zip_file>');
  process.exit(1);
}

const sourceDir = path.resolve(sourceArg).replace(/\\/g, '\\\\');
const zipFile = path.resolve(zipArg).replace(/\\/g, '\\\\');

const command = [
  `$src = '${sourceDir}'`,
  `$dst = '${zipFile}'`,
  "if (!(Test-Path $src)) { throw 'Source folder not found.' }",
  'if (Test-Path $dst) { Remove-Item $dst -Force }',
  'Compress-Archive -Path (Join-Path $src \"*\") -DestinationPath $dst -Force',
  "Write-Output ('ZIP_CREATED:' + $dst)"
].join('; ');

const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
  stdio: 'pipe',
  encoding: 'utf8'
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}
