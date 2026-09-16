# 角色權限系統 (RBAC) - 完整說明

## 1. 當前系統架構

### 定義的角色（8個）
```
admin      → 系統管理者 (最高權限)
pm         → 專案經理
pe         → 專案工程師
ce         → 主任工程師
me         → 製造工程師
sme        → 樣品製造工程師
qe         → 品質工程師
viewer     → 檢視者 (最低權限)
```

### 權限範疇（4個）
1. **account** - 帳號管理
2. **project** - 專案管理
3. **task** - 任務管理
4. **state** - 狀態同步
5. **audit** - 稽核日誌

---

## 2. 當前功能分配

### Admin (管理者)
```javascript
account: ['create', 'read', 'update', 'delete', 'toggle_enable', 'force_logout', 'view_audit']
project: ['create', 'read', 'update', 'delete', 'export', 'import']
task:    ['create', 'read', 'update', 'delete']
state:   ['write', 'read']
audit:   ['view', 'export']
```
✅ 完全控制系統的所有功能

### PM/PE (經理級)
```javascript
account: ['read']  // 只能看，不能改
project: ['create', 'read', 'update']
task:    ['create', 'read', 'update']
state:   ['write', 'read']
audit:   []
```
✅ 可管理專案和任務，但不能管理帳號

### CE/ME/SME/QE (工程師級)
```javascript
account: ['read']
project: ['read']
task:    ['read', 'update']  // 只能編輯自己的任務
state:   ['read']  // 只能檢視
audit:   []
```
✅ 只能編輯自己分配的任務，無法改變專案結構

### Viewer (檢視者)
```javascript
account: []
project: ['read']
task:    ['read']
state:   ['read']
audit:   []
```
✅ 唯讀權限，無法進行任何編輯

---

## 3. 如何為其他角色賦予新功能？

### 方法 1️⃣ : 修改 rbac-config.mjs

#### 例子：給 PM 添加帳號建立權限

**修改前：**
```javascript
pm: {
  account: ['read'],  // 只能讀取
  // ...
}
```

**修改後：**
```javascript
pm: {
  account: ['read', 'create', 'update'],  // 新增權限
  // ...
}
```

#### 例子：給 Viewer 添加任務建立權限

**修改前：**
```javascript
viewer: {
  account: [],
  project: ['read'],
  task: ['read'],  // 只能檢視
  // ...
}
```

**修改後：**
```javascript
viewer: {
  account: [],
  project: ['read'],
  task: ['read', 'create'],  // 添加建立權限
  // ...
}
```

---

## 4. 實現 RBAC 檢查的 3 個步驟

### 步驟 1: 導入權限系統
```javascript
import { rolePermissions, hasPermission } from './rbac-config.mjs';
```

### 步驟 2: 在 API 端點進行檢查
```javascript
// 例子：檢查是否有權限建立專案
if (url.pathname === '/api/projects' && request.method === 'POST') {
  if (!hasPermission(user, 'project', 'create')) {
    response.writeHead(403, headers);
    response.end(JSON.stringify({ error: '沒有權限建立專案' }));
    return;
  }
  // 執行建立專案邏輯
}
```

### 步驟 3: 在 UI 層面隱藏/顯示功能
```javascript
// app.html 中
function applySharedPermissions(){
  const hasCreateProject = rolePermissions[sharedSession?.accessRole]?.project?.includes('create');
  $('#newProject').style.display = hasCreateProject ? 'inline-block' : 'none';
  
  const hasCreateTask = rolePermissions[sharedSession?.accessRole]?.task?.includes('create');
  $('#newTask').style.display = hasCreateTask ? 'inline-block' : 'none';
}
```

---

## 5. 完整範例：為 CE 添加「建立任務」權限

### Step 1: 編輯 rbac-config.mjs
```javascript
ce: {
  account: ['read'],
  project: ['read'],
  task: ['create', 'read', 'update'],  // ← 新增 'create'
  state: ['read'],
  audit: []
}
```

### Step 2: 在伺服器 API 端點檢查
```javascript
if (url.pathname === '/api/tasks' && request.method === 'POST') {
  if (!hasPermission(user, 'task', 'create')) {
    response.writeHead(403, headers);
    response.end(JSON.stringify({ error: '沒有權限建立任務' }));
    return;
  }
  // 執行建立邏輯
}
```

### Step 3: 在 UI 中顯示按鈕
```javascript
function applySharedPermissions(){
  const can = rolePermissions[sharedSession?.accessRole];
  $('#newTask').style.display = can?.task?.includes('create') ? 'inline-block' : 'none';
}
```

---

## 6. 常見場景和配置

### 場景 A: 「我想讓品質工程師(QE)可以建立檢驗任務」

**修改：**
```javascript
qe: {
  account: ['read'],
  project: ['read'],
  task: ['create', 'read', 'update'],  // ← 添加 'create'
  state: ['read'],
  audit: []
}
```

### 場景 B: 「製造工程師(ME)需要檢視稽核日誌」

**修改：**
```javascript
me: {
  account: ['read'],
  project: ['read'],
  task: ['read', 'update'],
  state: ['read'],
  audit: ['view']  // ← 添加 'view'
}
```

### 場景 C: 「給 Viewer 升級為『專案助手』，可以建立任務但只在自己的角色」

**修改：**
```javascript
viewer: {
  account: [],
  project: ['read'],
  task: ['read', 'create', 'update'],  // ← 添加權限
  state: ['read'],
  audit: []
}
```

### 場景 D: 「新增『報告者(reporter)』角色，只能建立問題報告」

**添加新角色：**
```javascript
const rolePermissions = {
  // ... 既有角色 ...
  
  reporter: {  // ← 新角色
    account: [],
    project: ['read'],
    task: ['create'],  // 只能建立，不能編輯
    state: [],
    audit: []
  }
};

// 並更新允許的角色清單
const allowedRoles = new Set([
  'admin', 'pm', 'pe', 'ce', 'me', 'sme', 'qe', 'viewer', 'reporter'  // ← 添加
]);
```

---

## 7. 權限檢查點位置

| 位置 | 檔案 | 功能 |
|------|------|------|
| **伺服器認證** | server/local-server.mjs | POST /api/login |
| **帳號管理** | server/local-server.mjs | /api/users/* |
| **狀態同步** | server/local-server.mjs | PUT /api/state |
| **UI 按鈕** | app.html | applySharedPermissions() |
| **UI 隱藏** | app.html | canManageCurrent() |

---

## 8. 目前「寫死」的地方及如何改進

### ✅ 已經靈活的部分
- ✅ 帳號角色可任意分配
- ✅ 管理者權限完全覆蓋
- ✅ PM/PE 可管理指派的專案

### ⚠️ 半寫死的部分
- ⚠️ CE/ME/SME/QE 只能編輯自己的任務（邏輯寫死）
- ⚠️ Viewer 無法建立任務（邏輯寫死）
- ⚠️ 帳號管理只限 admin（邏輯寫死）

### 改進方案

#### 改進 1: 讓 PM 也能進行帳號管理
```javascript
// 修改 rbac-config.mjs
pm: {
  account: ['create', 'read', 'update'],  // ← 添加帳號建立/編輯
  // ...
}

// 修改 server/local-server.mjs
if (url.pathname === '/api/users' && request.method === 'POST') {
  if (!hasPermission(user, 'account', 'create')) {  // ← 使用 RBAC 而非 role === 'admin'
    response.writeHead(403, headers);
    response.end(JSON.stringify({ error: '沒有權限' }));
    return;
  }
  // ...
}
```

#### 改進 2: 讓 QE 也能建立檢驗任務
```javascript
qe: {
  account: ['read'],
  project: ['read'],
  task: ['create', 'read', 'update'],  // ← 添加
  // ...
}
```

---

## 9. 實施清單

### 短期（立即可做）
- [x] 新增 rbac-config.mjs 權限配置檔
- [ ] 在伺服器導入 RBAC 系統
- [ ] 在 UI 層面使用 RBAC 檢查

### 中期（2-3 個改進）
- [ ] 將所有 API 端點改為使用 hasPermission()
- [ ] 將所有 UI 邏輯改為使用 rolePermissions
- [ ] 添加新角色（如 reporter, auditor）

### 長期（完整改進）
- [ ] 實現細粒度的權限系統（例如：按專案分配角色）
- [ ] 建立角色管理 UI（管理員可自訂角色）
- [ ] 實現動態權限綁定（角色-権限關聯儲存到資料庫）

---

## 10. 權限模板快速參考

### 最小權限（檢視者）
```javascript
{ project: ['read'], task: ['read'] }
```

### 編輯權限（工程師）
```javascript
{ project: ['read'], task: ['read', 'update'] }
```

### 管理權限（經理）
```javascript
{ project: ['create', 'read', 'update'], task: ['create', 'read', 'update'] }
```

### 完全權限（管理員）
```javascript
{
  account: ['create', 'read', 'update', 'delete', 'toggle_enable', 'force_logout', 'view_audit'],
  project: ['create', 'read', 'update', 'delete', 'export', 'import'],
  task: ['create', 'read', 'update', 'delete'],
  state: ['write', 'read'],
  audit: ['view', 'export']
}
```

---

## 總結

| 項目 | 現狀 | 建議 |
|------|------|------|
| 角色數量 | 8 個 | 可擴展到 15+ 個 |
| 權限靈活性 | 部分寫死 | 可完全靈活化 |
| 權限配置 | 分散在程式中 | 集中在 rbac-config.mjs |
| 權限檢查 | 基於 role === 'xxx' | 改為 hasPermission() |
| 新增角色難度 | 困難（需改程式碼） | 簡單（只需改配置） |

**下一步建議：** 整合 rbac-config.mjs 到伺服器中，將所有 API 端點改為使用集中的權限檢查，這樣任何人都可以輕鬆修改權限而無需改程式碼。
