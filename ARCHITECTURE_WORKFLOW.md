# Dual-Track Architecture And Handoff Workflow

## Feasibility
Your idea is feasible and is a good practical model for your team:
- Cloud track: development manager uses cloud-hosted preview + ChatGPT iteration.
- Local track: IT deploys stable local/LAN runtime for internal operations.

The key to success is to keep one source of truth for UI and API contract.
In this repo, `app.html` is shared by both tracks, so drift risk is reduced.

## Track Split

### Cloud Track (Manager)
- Runtime target: `worker/index.js` + cloud DB.
- Main editable files:
  - `app.html`
  - `worker/index.js`
  - `db/schema.ts` (if schema changes)
- Validate cloud artifact:
  - `node scripts/build.mjs`
  - `node scripts/validate-artifact.mjs`

### Local Track (IT)
- Runtime target: `server/local-server.mjs` + SQLite.
- Main files:
  - `app.html`
  - `server/local-server.mjs`
  - scripts for LAN diagnostics and backup.

## End-to-End Handoff Commands

### 1) Export cloud bundle to manager
- `node scripts/make-cloud-manager-bundle.mjs`
- Optional zip on Windows: `npm run handoff:cloud:zip`

Output:
- `handoff/cloud-manager-bundle/`
- optional `handoff/cloud-manager-bundle.zip`

### 2) Manager edits and verifies online
Manager works inside the cloud bundle and validates cloud preview.

### 3) Apply manager return into this repo
- Unzip manager return to a folder
- Run:
  - `node scripts/apply-manager-return.mjs <manager_folder_path>`

Behavior:
- Replaces target files in this repo.
- Creates backup snapshot in `.handoff-backups/<timestamp>/`.

### 4) IT validation and local deployment
- `node --test tests/*.test.mjs`
- `node scripts/lan-diagnostic.mjs`
- `node scripts/backup-db.mjs`
- Start service: `node server/local-server.mjs` or `start-server.cmd`

### 5) Build IT deploy bundle (optional)
- `node scripts/make-it-local-bundle.mjs`
- Optional zip on Windows: `npm run handoff:it:zip`

## Why This Is Better
- Clear role boundary: manager owns cloud iteration, IT owns local operations.
- Controlled merge point: manager return is applied by script with backups.
- Repeatable: every cycle uses same commands and artifacts.
- Lower risk: local deploy is always tested after manager return.
