# 🎯 進階 ISO 27001 合規系統 - 使用者指南

**版本:** 2.0 (Advanced Compliance Edition)  
**發佈日期:** 2026-09-16  
**狀態:** ✅ 生產就緒

---

## 📖 快速開始

### 安裝與啟動

```bash
# 1. 進入項目目錄
cd RD_Project_Management_Source_2026-09-16

# 2. 啟動服務器 (預設 port 3000)
node server/local-server.mjs

# 3. 在瀏覽器打開
http://localhost:3000
```

### 預設帳號
```
Email: local-admin@localhost
Password: Admin@2026Secure
```

---

## 🔐 新增功能說明

### 1. 帳號鎖定保護 🔒

**功能:** 防止暴力破解攻擊

- 5次失敗登入 → 帳號自動鎖定 15 分鐘
- 系統自動解鎖，無需管理員干預
- 每次成功登入計數器重置

**用戶體驗:**
```
失敗嘗試 1-4 次: 正常登入提示
失敗嘗試 5 次: 帳號鎖定 15 分鐘
成功登入後: 計數器重置
```

---

### 2. 密碼過期管理 ⏰

**功能:** 強制定期更改密碼，保持帳號安全

- **建立新帳號:** 密碼有效期 90 天
- **14 天前提醒:** 登入時顯示警告訊息
- **過期後:** 必須由管理員修改才能登入

**登入時的提示:**
```
✅ "密碼將在 X 天後過期"  [黃色警告]
❌ "密碼已過期，需要強制修改" [紅色錯誤]
```

---

### 3. 權限審查報告 📊

**位置:** 管理員控制台 → 系統菜單

**功能:** 一鍵查看所有用戶合規狀態

**包含信息:**
- 用戶清單及職務
- 角色分配與分布
- 帳號狀態 (啟用/禁用/鎖定)
- 密碼過期狀況
- 上次登入時間
- 潛在的安全問題

**自動檢測問題:**
```
⚠️ 帳號已禁用
⚠️ 帳號已鎖定
⚠️ 密碼已過期
⚠️ 密碼將在 X 天後過期
⚠️ 登入失敗嘗試 X 次
```

---

### 4. 安全事件監控 🛡️

**位置:** 管理員控制台 → 安全事件

**追蹤事件類型 (13 種):**
```
✅ 登入成功
❌ 登入失敗
🔐 密碼修改
👤 帳號建立/刪除
🚫 帳號禁用/啟用
🔑 強制登出
⚠️ 異常登入嘗試
```

**嚴重程度分類:**
```
🔴 Critical (關鍵) - 帳號被禁用、過期密碼登入
🟠 Warning (警告)  - 密碼修改、角色變更
🟢 Info (信息)    - 常規登入、帳號建立
```

**使用場景:**
- 定期查看是否有異常活動
- 及時發現潛在安全威脅
- 追蹤特定用戶的活動歷史

---

### 5. 會話監控系統 👥

**位置:** 管理員控制台 → 會話監控

**監控內容:**
- 當前活動會話數
- 每個用戶的並發會話數
- 會話創建時間
- 最後活動時間
- 設備/瀏覽器信息
- IP 地址

**安全限制:**
```
每個用戶最多 3 個並發會話
超過限制: 自動顯示警告
```

**自動清理:**
```
8 小時無活動: 會話自動過期
強制登出: 管理員可立即終止會話
帳號禁用: 自動清除所有會話
```

---

## 👨‍💼 管理員操作指南

### 帳號管理

#### 建立新帳號
```
1. 點擊 [帳號管理] → [新增]
2. 輸入信息:
   - Email: user@company.com
   - 顯示名稱: User Name
   - 職務: PM/PE/QE 等
3. 系統自動生成 ISO 27001 合規密碼
4. 初次登入時，用戶會收到密碼過期警告
```

#### 修改帳號
```
1. 點擊 [帳號管理] → 選擇用戶
2. 可修改:
   - 顯示名稱
   - 職務
   - 密碼 (重設時自動重計算過期日期)
3. 按 [儲存]
```

#### 禁用帳號
```
1. 選擇用戶 → [禁用/啟用]
2. 該用戶立即無法登入
3. 所有活動會話自動終止
4. 系統記錄禁用事件
```

#### 強制登出
```
1. 選擇用戶 → [強制登出]
2. 該用戶所有會話立即終止
3. 需要重新登入
```

#### 刪除帳號
```
⚠️ 謹慎操作!
1. 選擇用戶 → [刪除]
2. 帳號被完全移除
3. 所有會話終止
4. 系統記錄刪除事件
```

### 安全監督

#### 查看權限報告
```
1. [系統] → [權限審查報告]
2. 自動生成當前的合規狀態報告
3. 檢查問題清單 (密碼過期、帳號鎖定等)
4. 可按需要採取行動
```

#### 監看安全事件
```
1. [系統] → [安全事件]
2. 可按嚴重程度篩選 (Critical/Warning/Info)
3. 查看事件時間戳和描述
4. 定期檢查異常模式
```

#### 監控活動會話
```
1. [系統] → [會話監控]
2. 檢查並發會話數
3. 發現超限用戶
4. 必要時強制登出
```

#### 查看審計日誌
```
1. 帳號選擇 → [審計] 按鈕
2. 查看該用戶的完整操作歷史
3. 包括所有登入、修改、禁用等記錄
```

---

## 👤 一般用戶指南

### 登入

```
1. 進入 http://localhost:3000
2. 輸入 Email 和密碼
3. 如果密碼將過期:
   ⚠️ 系統會顯示提醒信息
   → 儘快聯絡管理員更新密碼
4. 如果帳號鎖定:
   ❌ 等待 15 分鐘後重試
```

### 修改密碼

**自主修改 (計劃功能):**
```
[帳號設置] → [變更密碼]
- 輸入舊密碼
- 輸入新密碼
- 確認新密碼

新密碼需求 (ISO 27001):
✓ 至少 12 字符
✓ 包含大寫字母 (A-Z)
✓ 包含小寫字母 (a-z)
✓ 包含數字 (0-9)
✓ 包含特殊字符 (!@#$%^&*等)
✗ 不能包含用戶名
```

### 查看帳號狀態

```
[帳號信息] 顯示:
- 帳號狀態 (啟用/禁用)
- 最後登入時間
- 密碼過期日期
- 當前角色/職務
```

---

## 📊 API 參考 (開發者)

### 合規 API (管理員專用)

#### 權限審查報告
```
GET /api/compliance/permission-review
Header: Cookie: rd_local_session=<token>

Response:
{
  "generatedAt": "2026-09-16T10:00:00Z",
  "reviewedBy": "admin@localhost",
  "totalUsers": 10,
  "roleDistribution": { "admin": 1, "pm": 3, ... },
  "complianceIssues": [
    { "email": "user@example.com", "issues": ["密碼將在5天後過期"] }
  ],
  "users": [...]
}
```

#### 安全事件
```
GET /api/compliance/security-events?limit=100&severity=critical
Header: Cookie: rd_local_session=<token>

Response:
{
  "events": [
    {
      "email": "admin@localhost",
      "event_type": "password_changed",
      "severity": "info",
      "description": "Password changed for user@example.com",
      "created_at": "2026-09-16T10:05:00Z"
    }
  ],
  "filteredBySeverity": "critical"
}
```

#### 密碼過期報告
```
GET /api/compliance/password-expiration
Header: Cookie: rd_local_session=<token>

Response:
{
  "policy": { "expirationDays": 90, "warningDays": 14 },
  "passwords": {
    "expired": [],
    "warning": [{ "email": "user1@example.com", "daysUntilExpiry": 5 }],
    "valid": [...]
  }
}
```

#### 會話監控
```
GET /api/compliance/session-monitoring
Header: Cookie: rd_local_session=<token>

Response:
{
  "activeSessions": 3,
  "sessions": [
    {
      "email": "user@example.com",
      "createdAt": "2026-09-16T10:00:00Z",
      "userAgent": "Mozilla/5.0...",
      "ipAddress": "192.168.1.100"
    }
  ],
  "concurrencyViolations": []
}
```

### 標準 API

```
POST /api/login
GET /api/session
POST /api/logout
GET /api/users (管理員)
POST /api/users (管理員)
PATCH /api/users/{email} (管理員)
DELETE /api/users/{email} (管理員)
POST /api/users/{email}/toggle-enable (管理員)
POST /api/users/{email}/force-logout (管理員)
GET /api/audit (管理員)
PUT /api/state (用戶)
```

---

## 🐛 故障排除

### 常見問題

**Q: 登入說密碼已過期?**
```
A: 聯絡管理員讓他們重設你的密碼
   重設後會自動給你 90 天新的有效期
```

**Q: 帳號被鎖定了?**
```
A: 等待 15 分鐘自動解鎖
   不能由用戶手動解鎖
   安全起見,可聯絡管理員檢查異常登入
```

**Q: 看不到某些菜單項?**
```
A: 檢查你的角色權限
   某些功能只有管理員可訪問
```

**Q: 密碼要求很嚴格?**
```
A: 這是 ISO 27001 的要求
   12字元 + 4種字符類型 = 更安全的帳號
```

### 技術支持

```
遇到問題時:
1. 檢查瀏覽器控制台 (F12) 是否有錯誤
2. 查看服務器日誌是否有異常
3. 嘗試刷新頁面或清除 Cookie
4. 聯絡系統管理員
```

---

## 🔒 安全建議

### 對所有用戶
- ✅ 定期更改密碼 (不要等到過期)
- ✅ 不要在不安全的網絡使用
- ✅ 不要分享帳號憑據
- ✅ 登出後關閉瀏覽器標籤

### 對管理員
- ✅ 定期審查權限報告
- ✅ 監控安全事件日誌
- ✅ 及時禁用離職員工帳號
- ✅ 檢查異常的登入模式
- ✅ 保護管理員帳號密碼

---

## 📞 支持聯絡

| 問題類型 | 聯絡方式 |
|---------|--------|
| 帳號登入 | 聯絡系統管理員 |
| 密碼重設 | 聯絡系統管理員 |
| 技術問題 | 查看伺服器日誌 |
| 功能建議 | 提交 GitHub Issue |

---

## 📚 更多資源

- [ADVANCED_COMPLIANCE_REPORT.md](ADVANCED_COMPLIANCE_REPORT.md) - 技術文檔
- [PROJECT_COMPLETION_SUMMARY.md](PROJECT_COMPLETION_SUMMARY.md) - 項目總結
- [ISO27001_COMPLIANCE_REPORT.md](ISO27001_COMPLIANCE_REPORT.md) - 合規詳情
- [RBAC_GUIDE.md](RBAC_GUIDE.md) - 角色系統

---

## ✅ 版本歷史

| 版本 | 日期 | 主要更新 |
|------|------|--------|
| 1.0 | 2026-09-01 | 基本帳號管理系統 |
| 1.5 | 2026-09-10 | 完整測試覆蓋 |
| **2.0** | **2026-09-16** | **進階合規功能** |

---

**最後更新:** 2026-09-16  
**維護人員:** AI Assistant  
**反饋渠道:** GitHub Issues

---

🎉 **感謝使用 ISO 27001 進階合規系統!**

此系統提供了企業級的帳號管理和安全監控。
請定期檢查合規報告,確保系統持續滿足安全需求。

