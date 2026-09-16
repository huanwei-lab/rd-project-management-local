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
- 支援匯出 / 匯入備份 JSON
- 可直接在 LAN 中由多台電腦使用

## 常用指令

```bash
npm run start
npm run build
npm run validate
npm test
npm run test:lan
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
