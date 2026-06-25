# Task 5: 更新页面包装器

## Overview

更新页面包装器组件，包括间距调整和 Toast 样式更新。

## Files to Modify

- `src/components/page-wrapper.tsx`

## Global Constraints

| 属性 | 值 |
|------|-----|
| 边框宽度 | 2px |
| 边框色 | `#4B5563` |

## Step-by-Step Instructions

### Step 1: 更新 Toast 样式

Read `src/components/page-wrapper.tsx`

找到 Toast 的样式（大约第 69 行），将 `border-[3px] border-gray-900` 改为 `border-2 border-[#4B5563]`

### Step 2: 验证构建

```bash
npm run build
```

Expected: 构建成功

### Step 3: 提交

```bash
git add src/components/page-wrapper.tsx
git commit -m "refactor: 页面包装器边框更新"
```

## Report Contract

完成后，写入报告到 `.superpowers/sdd/reports/task-5-report.md`，包含：
1. 完成的修改
2. 构建验证结果

然后返回状态：`DONE` 或 `DONE_WITH_CONCERNS` 或 `BLOCKED`
