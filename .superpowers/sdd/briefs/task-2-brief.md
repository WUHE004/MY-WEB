# Task 2: 更新按钮组件

## Overview

验证按钮组件与新的全局样式兼容性。按钮组件使用全局 CSS 类，Task 1 已更新样式。

## Files to Modify

- `src/components/ui/button.tsx`

## Global Constraints

| 属性 | 值 |
|------|-----|
| 圆角 | 16px |
| 边框宽度 | 2px |
| 边框色 | `#4B5563` |

## Step-by-Step Instructions

### Step 1: 检查组件兼容性

Read `src/components/ui/button.tsx` - 按钮组件已使用全局 CSS 类 `.neo-btn-*`，Task 1 已更新样式，此任务只需确认无需额外修改。

### Step 2: 验证构建

```bash
npm run build
```

Expected: 构建成功

### Step 3: 提交

```bash
git add src/components/ui/button.tsx
git commit -m "refactor: 按钮组件验证兼容性"
```

## Report Contract

完成后，写入报告到 `.superpowers/sdd/reports/task-2-report.md`，包含：
1. 检查结果
2. 构建验证结果

然后返回状态：`DONE` 或 `DONE_WITH_CONCERNS` 或 `BLOCKED`
