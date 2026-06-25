# Task 1: 更新 globals.css 全局样式

## Overview

这是 UI Redesign 的第一个任务，负责更新全局 CSS 变量和样式类，是所有后续任务的基础。

## Files to Modify

- `src/app/globals.css` (完整文件，248行)

## Global Constraints

必须遵循以下设计系统规范：

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

## Step-by-Step Instructions

### Step 1: 更新 CSS 变量

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

### Step 2: 更新边框和阴影类

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

### Step 3: 更新卡片样式

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

### Step 4: 更新按钮样式

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

### Step 5: 更新输入框样式

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

### Step 6: 更新 highlight 类

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

### Step 7: 更新 Toast 样式

更新 Toast 中的边框样式（大约第69行）：
将 `border-[3px] border-gray-900` 改为 `border-2 border-[#4B5563]`

### Step 8: 验证构建

```bash
npm run build
```

Expected: 构建成功，TypeScript 无错误

### Step 9: 提交

```bash
git add src/app/globals.css
git commit -m "refactor: 更新全局样式为温柔粉嫩风"
```

## Report Contract

完成后，写入报告到 `.superpowers/sdd/reports/task-1-report.md`，包含：
1. 完成的修改摘要
2. 构建验证结果
3. 任何发现或观察

然后返回状态：`DONE` 或 `DONE_WITH_CONCERNS` 或 `BLOCKED`
