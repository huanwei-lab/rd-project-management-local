# 研發部專案管理系統（本地部署版）

這個專案已經改成可在區域網路內簡單部署的本地版本。它使用 Node.js + 內建 SQLite，讓多台電腦可透過同一台伺服器 IP / 端口存取同一份資料。

## 快速啟動

1. 安裝 Node.js 22 或以上版本
2. 在專案根目錄執行：

```bash
npm install
npm run start
```

3. 在其他電腦開啟：

```text
http://<伺服器電腦IP>:3000
```

例如：

```text
http://192.168.1.50:3000
```

## 一鍵啟動（Windows）

- 雙擊 `start-server.cmd`：直接啟動本地伺服器
- 雙擊 `test-lan.cmd`：檢查 LAN IP 是否可回應服務

啟動後，其他電腦請使用：

```text
http://<伺服器IPv4>:3000
```

## 環境變數

```bash
PORT=3000
HOST=0.0.0.0
DB_PATH=./db/local-projects.sqlite
LOCAL_ADMIN_EMAIL=local-admin@localhost
LOCAL_ADMIN_NAME="Local Admin"
LOCAL_ADMIN_ROLE=admin
```

## 主要功能

- 單一資料來源，所有電腦共用同一份專案資料
- 由本地 SQLite 持久化，不依賴雲端服務
- 提供 `/api/session` 與 `/api/state`，支援前端共用資料同步
- 提供本地登入 / 登出（Cookie Session）
- 後端權限控管（管理者/專案 PM-PE/任務負責人）
- 帳號管理（管理者可新增/修改/刪除帳號）
- 稽核紀錄（登入、登出、資料更新、帳號異動）
- 支援匯出 / 匯入備份 JSON
- 可直接在 LAN 中由多台電腦使用
- 支援 Cloud/Local 雙軌交接流程（Manager/IT）

## 雙軌交接（推薦）

- 交給開發經理（雲端可預覽）
	- `node scripts/make-cloud-manager-bundle.mjs`
	- 產出：`handoff/cloud-manager-bundle/`
- 經理回傳原始碼後套用
	- `node scripts/apply-manager-return.mjs <manager_folder_path>`
	- 會自動備份舊檔到 `.handoff-backups/<timestamp>/`
- IT 打包本地部署版本
	- `node scripts/make-it-local-bundle.mjs`
	- 產出：`handoff/it-local-bundle/`

完整流程請見：`ARCHITECTURE_WORKFLOW.md`

## 登入與登出

- 首次開啟網頁時，若尚未登入，會要求輸入 Email 進行登入
- 右上角有 `登入 / 登出` 按鈕可切換帳號
- 預設管理者帳號來自環境變數 `LOCAL_ADMIN_EMAIL`（未設定時為 `local-admin@localhost`）

## 為什麼看不到之前資料

- 現在資料來源是伺服器端 `db/local-projects.sqlite`，不是瀏覽器本機 localStorage
- 若你換了伺服器電腦、換了 `DB_PATH`，或資料庫檔案是新的，就會看不到舊資料
- 若有先前匯出的 JSON，可用頁面右上角 `匯入備份` 還原

## 常用指令

```bash
npm run start
npm run build
npm run validate
npm test
npm run test:lan
npm run backup:db
npm run handoff:cloud
npm run handoff:cloud:zip
npm run handoff:apply -- <manager_folder_path>
npm run handoff:it
npm run handoff:it:zip
```

## 帳號管理

- 管理者登入後，右上角可見 `帳號管理`
- 可執行 `add / edit / delete / audit`
- 角色可用值：`admin`, `pm`, `pe`, `ce`, `me`, `sme`, `qe`, `viewer`

## 自動資料庫備份

- 執行 `npm run backup:db` 會複製 SQLite 到 `db/backups/`
- 預設保留最近 20 份，可用 `BACKUP_KEEP` 調整
- 可用 `BACKUP_DIR` 指定備份資料夾

範例：

```bash
BACKUP_KEEP=30 BACKUP_DIR=./backup-storage npm run backup:db
```

## 本地部署建議

- 伺服器電腦請固定 IP，並保留 3000 埠號
- 若需要從外網存取，請放在公司內網或透過 VPN、反向代理與 HTTPS
- 建議每次重要變更先複製備份 JSON
- 建議在正式環境中補上帳號權限與 HTTPS 保障

## 各台電腦能連線的必要條件

- 伺服器要啟動並監聽 `0.0.0.0`（本專案預設已是如此）
- 所有電腦需要在同一個內網或可互通的網段
- Windows 防火牆必須允許該埠的連入（預設為 `3000`）

可以先在伺服器上執行：

```bash
npm run test:lan
```

若顯示 `[OK] http://<你的IP>:<port>/api/health`，代表服務已能從 LAN IP 回應。若仍無法從其他電腦開啟，通常是防火牆或網段路由限制。

## 主要檔案

- `app.html`: 前端 UI
- `server/local-server.mjs`: 本地部署伺服器
- `db/local-projects.sqlite`: 本地資料庫（啟動後自動建立）
- `worker/index.js`: Cloudflare Worker 版本，保留作為備用實作
