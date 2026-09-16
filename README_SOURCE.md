# 研發部專案管理—原始碼

此套件包含目前網站的完整可維護原始碼。

## 主要檔案

- `app.html`：前端介面與專案管理功能
- `worker/index.js`：後端 API、登入身分與權限控制
- `db/schema.ts`：資料庫結構定義
- `.openai/drizzle/`：共用資料庫建置 SQL
- `scripts/build.mjs`：建置程式
- `scripts/validate-artifact.mjs`：輸出檢查
- `.openai/hosting.json`：目前 Sites 部署設定
- `package.json`：專案指令

## 目前權限邏輯

- 管理者：管理全部專案、人員、任務與備份
- PM／PE：管理自己負責的專案與全部任務
- CE／ME／SME／QE：只能修改自己負責的任務

## 建置

需要 Node.js 22 以上版本。

```bash
npm run build
npm run validate
```

建置結果位於 `dist/`。

## 注意

- 原始碼不含任何登入密碼或存取權杖。
- `.openai/hosting.json` 內的 project_id 只對目前 Sites 專案有效。
- 若要部署至公司內網，需將 `worker/index.js` 的資料庫介面改接公司 SQL Server 或 PostgreSQL，並以 AD／Microsoft Entra ID 或公司 SSO 取代 Sites 登入標頭。
- 上線前請建立正式備份、HTTPS、權限稽核與資料庫還原機制。
