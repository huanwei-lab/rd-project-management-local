import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = process.env.DB_PATH
  ? path.resolve(rootDir, process.env.DB_PATH)
  : path.join(rootDir, 'db', 'local-projects.sqlite');

const backupDir = process.env.BACKUP_DIR
  ? path.resolve(rootDir, process.env.BACKUP_DIR)
  : path.join(rootDir, 'db', 'backups');

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function keepLatestBackups(directory, keepCount) {
  const files = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.sqlite'))
    .sort((a, b) => b.localeCompare(a));

  for (const fileName of files.slice(keepCount)) {
    fs.unlinkSync(path.join(directory, fileName));
  }
}

function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`Database file not found: ${dbPath}`);
    process.exit(1);
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `local-projects_${timestamp()}.sqlite`);
  fs.copyFileSync(dbPath, target);

  const keep = Number.parseInt(process.env.BACKUP_KEEP || '20', 10);
  if (Number.isFinite(keep) && keep > 0) {
    keepLatestBackups(backupDir, keep);
  }

  console.log(`Backup created: ${target}`);
}

main();
