# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将点冰童装库存管理系统的 UI 从硬核 Neubrutalism 风格升级为温柔粉嫩风

**Architecture:** 通过更新全局 CSS 变量和组件样式，统一所有页面的视觉语言。每个组件独立更新，最后更新页面。遵循 DRY 原则，在 globals.css 中定义设计系统变量。

**Tech Stack:** Next.js, Tailwind CSS, React, Framer Motion

## Global Constraints

设计系统必须遵循以下规范（来源：spec 文档）：

| 属性 | 值 |
|------|-----|
| 主色 | `#FF8FAB` (柔粉) |
| 主色悬停 | `#FF7096` |
| 强调蓝 | `#60A5FA` |
| 成功绿 | `#4ADE80` |
| 边框色 | `#4B5563` (深灰) |
| 背景色 | `#FFFBFC` (微粉白) |
| 卡片背景 | `#FFF5F7` (淡粉) |
| 圆角(卡片/按钮) | 16px |
| 圆角(大) | 20px |
| 边框宽度 | 2px |
| 阴影 | `4px 4px 12px rgba(0,0,0,0.08)` |

---

## File Structure

```
src/app/globals.css              ← 全局样式和 CSS 变量
src/components/ui/button.tsx     ← 按钮组件
src/components/ui/card.tsx      ← 卡片组件
src/components/ui/input.tsx     ← 输入框组件
src/components/page-wrapper.tsx  ← 页面包装器
src/app/page.tsx                ← 首页
src/app/operations/photo-gen/page.tsx   ← 照片生成页
src/app/operations/video-gen/page.tsx   ← 视频生成页
src/app/products/page.tsx        ← 商品页
src/app/login/page.tsx           ← 登录页
```

---

## Task 1: 更新 globals.css 全局样式

**Files:**
- Modify: `src/app/globals.css:1-248`

**Interfaces:**
- Produces: 全局 CSS 变量 `.neo-*` 类

- [ ] **Step 1: 更新 CSS 变量**

替换文件开头的 CSS 变量：

```css
:root {
  --background: #FFFBFC;  /* 改: 微粉白 */
  --foreground: #1F2937;  /* 改: 深灰标题色 */
  --pink: #FF8FAB;         /* 改: 柔粉 #FF8FAB */
  --blue: #60A5FA;         /* 改: 柔和蓝 */
  --yellow: #FBBF24;       /* 改: 暖黄 */
  --purple: #7B61FF;
  --green: #4ADE80;        /* 改: 柔和绿 */
  --orange: #FF9500;
  --card-bg: #FFF5F7;      /* 改: 淡粉背景 */
}
```

- [ ] **Step 2: 更新边框和阴影类**

替换 `.neo-border` 和 `.neo-shadow` 相关类：

```css
/* 边框改为 2px 深灰 */
.neo-border {
  border: 2px solid #4B5563;
}

/* 柔和阴影替代硬边阴影 */
.neo-shadow {
  box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.08);
}

.neo-shadow-sm {
  box-shadow: 3px 3px 8px rgba(0, 0, 0, 0.06);
}

.neo-shadow-hover:hover {
  box-shadow: 6px 6px 16px rgba(0, 0, 0, 0.1);
  transform: translate(-2px, -2px);
}
```

- [ ] **Step 3: 更新卡片样式**

替换 `.neo-card` 类：

```css
.neo-card {
  border: 2px solid #4B5563;    /* 改: 2px 深灰 */
  border-radius: 16px;           /* 改: 16px */
  box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.08);  /* 柔和阴影 */
  background: #FFF5F7;           /* 改: 淡粉背景 */
  transition: all 0.2s ease;
}

.neo-card:hover {
  box-shadow: 6px 6px 16px rgba(0, 0, 0, 0.1);
  transform: translate(-2px, -2px) scale(1.01);
}
```

- [ ] **Step 4: 更新按钮样式**

替换 `.neo-btn` 相关类：

```css
.neo-btn {
  border: 2px solid #4B5563;    /* 改: 2px 深灰 */
  border-radius: 16px;           /* 改: 16px */
  box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.08);  /* 柔和阴影 */
  font-weight: 700;
  transition: all 0.15s ease;
  cursor: pointer;
}

.neo-btn:hover {
  box-shadow: 6px 6px 16px rgba(0, 0, 0, 0.1);
  transform: translate(-2px, -2px);
}

.neo-btn:active {
  box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.06);
  transform: translate(2px, 2px);
}

/* 粉色按钮使用渐变 */
.neo-btn-pink {
  background: linear-gradient(135deg, #FF8FAB 0%, #FF7096 100%);
  color: white;
  border: 2px solid #4B5563;
}
```

- [ ] **Step 5: 更新输入框样式**

替换 `.neo-input` 类：

```css
.neo-input {
  border: 2px solid #4B5563;    /* 改: 2px 深灰 */
  border-radius: 16px;           /* 改: 16px */
  padding: 12px 16px;
  font-weight: 600;
  outline: none;
  transition: all 0.2s ease;
  background: #FFF5F7;           /* 改: 淡粉背景 */
}

.neo-input:focus {
  border-color: #FF8FAB;         /* 聚焦时粉色边框 */
  box-shadow: 0 0 0 3px rgba(255, 143, 171, 0.2);  /* 柔和粉色光晕 */
}
```

- [ ] **Step 6: 更新 highlight 类**

替换高亮标签类：

```css
.highlight-pink {
  background: linear-gradient(135deg, #FF8FAB 0%, #FF7096 100%);
  color: white;
  padding: 2px 12px;
  border-radius: 9999px;  /* pill 形状 */
}

.highlight-blue {
  background: linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%);
  color: white;
  padding: 2px 12px;
  border-radius: 9999px;
}

.highlight-green {
  background: linear-gradient(135deg, #4ADE80 0%, #22C55E 100%);
  color: white;
  padding: 2px 12px;
  border-radius: 9999px;
}
```

- [ ] **Step 7: 更新 Toast 样式**

替换 Toast 样式中的边框：

```css
/* Toast 边框更新 */
.toast-enter {
  ...
  border: 2px solid #4B5563;
  box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.08);
}
```

- [ ] **Step 8: 运行验证**

```bash
npm run build
```

Expected: 构建成功，TypeScript 无错误

- [ ] **Step 9: 提交**

```bash
git add src/app/globals.css
git commit -m "refactor: 更新全局样式为温柔粉嫩风"
```

---

## Task 2: 更新按钮组件

**Files:**
- Modify: `src/components/ui/button.tsx:1-38`

**Interfaces:**
- Consumes: 全局 CSS 变量 (已由 Task 1 更新)

- [ ] **Step 1: 检查按钮组件是否需要更新**

按钮组件依赖全局 CSS 类 `.neo-btn-*`，Task 1 已更新全局样式，此任务只需确认组件无需额外修改。

```typescript
// src/components/ui/button.tsx
// 检查是否需要添加渐变支持或新的 variant
```

- [ ] **Step 2: 运行验证**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add src/components/ui/button.tsx
git commit -m "refactor: 按钮组件验证兼容性"
```

---

## Task 3: 更新卡片组件

**Files:**
- Modify: `src/components/ui/card.tsx:1-79`

**Interfaces:**
- Consumes: 全局 CSS 变量 (已由 Task 1 更新)

- [ ] **Step 1: 更新卡片组件样式**

卡片组件已使用 `.neo-card` 类，Task 1 已更新样式。检查是否需要更新：

```typescript
// src/components/ui/card.tsx
// Card 组件使用 neo-card 类，已由 Task 1 更新
// 可选：添加渐变背景 variant
```

- [ ] **Step 2: 运行验证**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add src/components/ui/card.tsx
git commit -m "refactor: 卡片组件验证兼容性"
```

---

## Task 4: 更新输入框组件

**Files:**
- Modify: `src/components/ui/input.tsx:1-24`

**Interfaces:**
- Consumes: 全局 CSS 变量 (已由 Task 1 更新)

- [ ] **Step 1: 更新输入框组件样式**

输入框组件已使用 `.neo-input` 类，Task 1 已更新样式。

- [ ] **Step 2: 运行验证**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add src/components/ui/input.tsx
git commit -m "refactor: 输入框组件验证兼容性"
```

---

## Task 5: 更新页面包装器

**Files:**
- Modify: `src/components/page-wrapper.tsx:1-78`

**Interfaces:**
- Consumes: 全局 CSS 变量 (已由 Task 1 更新)

- [ ] **Step 1: 更新页面包装器间距**

检查并更新 page-wrapper 的间距：

```typescript
// 当前: className="px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 lg:py-8"
// 保持当前间距，或微调为更宽松的间距
```

- [ ] **Step 2: 更新 Toast 样式**

检查 Toast 样式是否需要更新边框：

```typescript
// 第 69 行的 Toast 样式
// 当前: border-[3px] border-gray-900
// 改为: border-2 border-[#4B5563]
```

- [ ] **Step 3: 运行验证**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add src/components/page-wrapper.tsx
git commit -m "refactor: 页面包装器间距调整"
```

---

## Task 6: 更新首页

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: 全局 CSS 变量、组件 (已更新)

- [ ] **Step 1: 为统计卡片添加渐变背景**

在统计卡片的外层 div 添加渐变背景：

```typescript
// 统计卡片外层添加渐变背景
<div className="bg-gradient-to-br from-[#FFF5F7] to-[#FFF0F3] rounded-2xl p-6">
  {/* 卡片内容 */}
</div>
```

- [ ] **Step 2: 更新快捷操作按钮样式**

确保快捷操作按钮使用粉色渐变：

```typescript
// 主按钮添加渐变类
<button className="neo-btn neo-btn-pink ...">
// 或直接使用渐变
className="bg-gradient-to-br from-[#FF8FAB] to-[#FF7096] text-white ..."
```

- [ ] **Step 3: 运行验证**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add src/app/page.tsx
git commit -m "feat: 首页UI优化 - 添加渐变背景和统一按钮样式"
```

---

## Task 7: 更新照片生成页

**Files:**
- Modify: `src/app/operations/photo-gen/page.tsx`

**Interfaces:**
- Consumes: 全局 CSS 变量、组件 (已更新)

- [ ] **Step 1: 更新页面标题**

添加图标到页面标题：

```typescript
// 当前: <h1 className="text-xl font-extrabold text-gray-900">照片生成</h1>
// 改为: <h1><span>📸</span> 照片生成</h1>
```

- [ ] **Step 2: 更新说明卡片**

更新说明卡片的边框颜色：

```typescript
// 当前: border-[3px] border-[#4A90E2]
// 改为: border-2 border-[#4B5563] bg-[#FFF5F7]
```

- [ ] **Step 3: 更新上传区域**

更新上传区域的边框和背景：

```typescript
// 当前: border-dashed border-gray-400
// 改为: border-2 border-dashed border-[#4B5563] bg-[#FFF5F7]
```

- [ ] **Step 4: 运行验证**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 5: 提交**

```bash
git add src/app/operations/photo-gen/page.tsx
git commit -m "feat: 照片生成页UI优化 - 更新卡片和上传区域样式"
```

---

## Task 8: 更新视频生成页

**Files:**
- Modify: `src/app/operations/video-gen/page.tsx`

**Interfaces:**
- Consumes: 全局 CSS 变量、组件 (已更新)

- [ ] **Step 1: 更新页面标题**

添加图标到页面标题：

```typescript
// 当前: <h1><span className="text-[#FF6B7A]">视频生成</span></h1>
// 改为: <h1><span>🎬</span> <span className="text-[#FF8FAB]">视频生成</span></h1>
```

- [ ] **Step 2: 更新说明卡片**

更新说明卡片的边框颜色和背景：

```typescript
// 当前: border-[3px] border-[#4A90E2] bg-[#4A90E2]/10
// 改为: border-2 border-[#4B5563] bg-[#FFF5F7]
```

- [ ] **Step 3: 更新上传区域**

更新上传区域的边框和背景：

```typescript
// 当前: border-dashed border-gray-400
// 改为: border-2 border-dashed border-[#4B5563] bg-[#FFF5F7]
```

- [ ] **Step 4: 更新进度条**

更新进度条颜色：

```typescript
// 当前: bg-[#4A90E2]
// 改为: bg-gradient-to-r from-[#FF8FAB] to-[#FF7096]
```

- [ ] **Step 5: 运行验证**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 6: 提交**

```bash
git add src/app/operations/video-gen/page.tsx
git commit -m "feat: 视频生成页UI优化 - 更新标题和卡片样式"
```

---

## Task 9: 更新商品页

**Files:**
- Modify: `src/app/products/page.tsx`

**Interfaces:**
- Consumes: 全局 CSS 变量、组件 (已更新)

- [ ] **Step 1: 更新筛选标签**

更新筛选标签的选中态：

```typescript
// 当前: border-[3px] border-gray-900
// 改为: border-2 border-[#4B5563] bg-[#FF8FAB] text-white (选中态)
```

- [ ] **Step 2: 更新商品卡片**

确保商品卡片使用新样式：

```typescript
// 确保卡片使用 neo-card 类或等效样式
className="neo-card"
// 或
className="border-2 border-[#4B5563] rounded-2xl shadow-md bg-[#FFF5F7]"
```

- [ ] **Step 3: 更新标签徽章**

更新标签徽章为圆角 pill 形状：

```typescript
// 当前: rounded-lg
// 改为: rounded-full 或添加 highlight-pink 类
```

- [ ] **Step 4: 运行验证**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 5: 提交**

```bash
git add src/app/products/page.tsx
git commit -m "feat: 商品页UI优化 - 更新筛选标签和商品卡片"
```

---

## Task 10: 更新登录页

**Files:**
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: 全局 CSS 变量、组件 (已更新)

- [ ] **Step 1: 更新页面标题**

添加品牌图标：

```typescript
// 添加品牌图标
<div className="text-4xl mb-2">👗</div>
<h1>点冰童装</h1>
```

- [ ] **Step 2: 更新输入框**

确保输入框使用新样式：

```typescript
// 检查是否使用 neo-input 类
<input className="neo-input ..." />
```

- [ ] **Step 3: 更新主按钮**

确保登录按钮使用渐变样式：

```typescript
// 当前: neo-btn neo-btn-primary
// 改为: neo-btn neo-btn-pink 或渐变类
<button className="neo-btn neo-btn-pink w-full py-3">
  登录
</button>
```

- [ ] **Step 4: 运行验证**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 5: 提交**

```bash
git add src/app/login/page.tsx
git commit -m "feat: 登录页UI优化 - 更新标题和按钮样式"
```

---

## Self-Review Checklist

**1. Spec Coverage:**
- [x] 颜色系统更新 - Task 1
- [x] 圆角统一 (16px) - Task 1
- [x] 边框宽度 (2px) - Task 1
- [x] 柔和阴影 - Task 1
- [x] 首页优化 - Task 6
- [x] AI生成页优化 - Task 7, 8
- [x] 商品页优化 - Task 9
- [x] 登录页优化 - Task 10

**2. Placeholder Scan:**
- [ ] 无 "TBD" 或 "TODO"
- [ ] 无空步骤
- [ ] 所有代码块完整

**3. Type Consistency:**
- [ ] 所有 CSS 类名一致
- [ ] 所有颜色值使用 CSS 变量或精确色值
- [ ] 无拼写错误

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/YYYY-MM-DD-ui-redesign-plan.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
