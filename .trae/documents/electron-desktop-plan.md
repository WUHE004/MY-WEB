# 点冰童装 Desktop EXE 实施计划

## 摘要

将现有 Next.js 全栈应用打包为 Windows 桌面 EXE 程序。采用 **Electron + 内嵌 Next.js 生产服务器** 方案：Electron 作为桌面壳，内部启动 Next.js 生产服务（`next start`），所有 API 路由本地执行，直接连接 Supabase 云端数据库。网页版（Vercel）不受任何影响。

## 架构对比

```
网页版:                         桌面版:
浏览器 → Vercel(Next.js)       Electron窗口 → 本地Next.js服务器
              ↓                                    ↓
         Supabase 云数据库 ← ← ← ← ← ← ← ←  Supabase 云数据库
```

- 网页版和桌面版**共享同一套代码、同一个数据库**
- 桌面版 API 路由在本地执行，不经过 Vercel
- 两者互不影响，独立运行

## 核心决策

| 决策项 | 选择 | 原因 |
|--------|------|------|
| 桌面框架 | Electron 33.x | 最成熟、生态最好、直接复用 Next.js |
| 服务器模式 | `next start` 生产模式 | 先 build 再 start，性能最优 |
| 打包工具 | electron-builder | 支持 NSIS 安装包、自动更新 |
| 环境变量 | 构建时硬编码到 `.env` | 简化部署，无需用户配置 |
| 数据库 | 继续使用 Supabase 云端 | 无需自建数据库 |

## 不影响网页版

- 所有改动都在**新增文件**中，不修改现有代码
- `package.json` 只新增 scripts 和 devDependencies，不影响现有依赖
- Next.js 构建配置不变
- Vercel 部署流程不变
- 网页版和桌面版可以同时使用

## 新增文件清单

### 1. `electron/main.ts` — Electron 主进程

核心逻辑：
- 启动时执行 `next start -p 3000`（先 `next build` 生成 `.next` 目录）
- 等待服务器就绪后创建 BrowserWindow
- 窗口标题"点冰童装"，图标使用 `public/images/girl.png`
- 隐藏默认菜单栏，设置最小窗口尺寸 1024x768
- 关闭窗口时优雅终止 Next.js 服务器

```ts
// 关键流程
1. 启动 Next.js 服务器 (child_process.spawn)
2. 轮询 http://localhost:3000 直到响应 200
3. 创建 BrowserWindow 加载 http://localhost:3000
4. 窗口关闭 → 杀掉 Next.js 进程 → app.quit()
```

### 2. `electron/preload.ts` — 预加载脚本

- 桥接 Electron API 到渲染进程（如需要原生功能时使用）
- 初始版本可为空壳，仅暴露版本号

### 3. `electron-builder.yml` — 打包配置

```yaml
appId: com.dianbing.inventory-hub
productName: 点冰童装
directories:
  output: dist-electron
win:
  target:
    - target: nsis
      arch: [x64]
  icon: public/images/girl.png
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerIcon: public/images/girl.png
  uninstallerIcon: public/images/girl.png
files:
  - .next/**/*
  - public/**/*
  - node_modules/**/*
  - package.json
  - next.config.ts
  - .env
extraResources:
  - from: electron/
    to: electron/
```

### 4. `tsconfig.electron.json` — Electron TypeScript 配置

独立的 tsconfig，编译 `electron/` 目录到 `dist-electron/`。

### 5. `.env` — 环境变量（需检查）

需要确保以下环境变量在打包时存在（已存在于 `.env.local`，需确认或创建 `.env`）：

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
KUAIDI100_KEY=vtDfzzVa5576
KUAIDI100_CUSTOMER=968543BD83C69056550EB82707F984F7
```

> 注意：`.env` 文件会被打包进 EXE，需确保不泄露到公开仓库。已在 `.gitignore` 中排除。

## 修改文件清单

### 1. `package.json` — 新增脚本和依赖

新增 scripts：
```json
{
  "electron:dev": "next build && electron .",
  "electron:build": "next build && electron-builder",
  "electron:start": "electron ."
}
```

新增 devDependencies：
```json
{
  "electron": "^33.0.0",
  "electron-builder": "^25.0.0",
  "concurrently": "^9.0.0"
}
```

修改 `main` 字段指向 Electron 入口：
```json
"main": "dist-electron/main.js"
```

### 2. `.gitignore` — 新增排除项

```
dist-electron/
*.exe
*.blockmap
```

## 实施步骤

1. **安装依赖** — `npm install --save-dev electron electron-builder concurrently`
2. **创建 Electron 主进程** — `electron/main.ts` + `electron/preload.ts`
3. **创建 tsconfig.electron.json** — 编译 Electron 代码
4. **创建 electron-builder.yml** — 打包配置
5. **修改 package.json** — 添加 scripts、main 字段、devDependencies
6. **检查环境变量** — 确保 `.env` 文件包含所有必要变量
7. **本地测试** — `npm run electron:dev` 验证桌面窗口正常启动
8. **构建 EXE** — `npm run electron:build` 生成安装包
9. **验证 EXE** — 安装并测试所有功能

## 已知限制

1. **必须联网** — 数据库在 Supabase 云端，断网无法使用
2. **首次启动较慢** — Next.js 生产服务器需要几秒初始化
3. **EXE 体积较大** — 约 150-200MB（含 Node.js + Next.js + node_modules）
4. **不支持自动更新** — 初期版本需手动下载新 EXE 更新
5. **仅支持 Windows** — 当前配置仅打包 Win x64，Mac 需额外配置

## 验证步骤

1. 运行 `npm run electron:dev`，确认桌面窗口打开并显示首页
2. 测试登录、商品浏览、下单、订单查询等核心功能
3. 运行 `npm run electron:build`，安装生成的 EXE
4. 在另一台电脑上安装测试，确认功能正常
5. 确认网页版 (Vercel) 功能不受影响