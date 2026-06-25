# Task 6: 更新首页

## Overview

更新首页的统计卡片和快捷操作按钮样式。

## Files to Modify

- `src/app/page.tsx`

## Global Constraints

| 属性 | 值 |
|------|-----|
| 圆角 | 16px |
| 边框宽度 | 2px |
| 边框色 | `#4B5563` |
| 主色 | `#FF8FAB` |
| 卡片背景 | `#FFF5F7` |

## Step-by-Step Instructions

### Step 1: 为统计卡片添加渐变背景

在统计卡片的外层 div 添加渐变背景样式，使用 `bg-gradient-to-br from-[#FFF5F7] to-[#FFF0F3]`

### Step 2: 更新快捷操作按钮

确保快捷操作按钮使用粉色渐变样式

### Step 3: 验证构建

```bash
npm run build
```

Expected: 构建成功

### Step 4: 提交

```bash
git add src/app/page.tsx
git commit -m "feat: 首页UI优化 - 添加渐变背景和统一按钮样式"
```

## Report Contract

完成后，写入报告到 `.superpowers/sdd/reports/task-6-report.md`，包含：
1. 完成的修改
2. 构建验证结果

然后返回状态：`DONE` 或 `DONE_WITH_CONCERNS` 或 `BLOCKED`
