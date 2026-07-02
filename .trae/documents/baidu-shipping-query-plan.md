# 百度搜索替代快递查询 - 实施计划

## 摘要

将快递100 API 查询替换为：点击"查询物流"按钮后，在新标签页打开百度搜索结果（`https://m.baidu.com/s?word=快递单号`）。简化 my-orders 页面，移除 kuaidi100 相关的状态和 UI 逻辑。保留后端 API 代码不动，方便未来修复快递100后重新启用。

## 决策

- **方案**: 新标签页打开百度搜索（用户已确认）
- **保留快递100代码**: `src/lib/kuaidi100.ts` 和 `src/app/api/shipping/query/route.ts` 不做修改，仅在前端页面中不再调用
- **删除无用状态**: 移除 `shippingLoading`、`shippingInfo` 和相关 UI

## 改动文件

### 1. `src/app/my-orders/page.tsx` — 核心改动

**改动点 A: 移除无用状态变量**

删除第 77 行和第 110 行：
```tsx
// 删除
const [shippingInfo, setShippingInfo] = useState<any>(null);
const [shippingLoading, setShippingLoading] = useState(false);
```

**改动点 B: 替换 `handleQueryShipping` 函数**

将第 112-138 行的 API 调用逻辑替换为：
```tsx
const handleQueryShipping = (trackingNumber: string) => {
  window.open(`https://m.baidu.com/s?word=${encodeURIComponent(trackingNumber)}`, "_blank");
};
```

**改动点 C: 简化物流追踪 UI**

将第 372-407 行的物流追踪区域替换为：

```tsx
{/* 物流查询 */}
{selectedOrder.tracking_number && (
  <div className="neo-card p-4">
    <div className="flex items-center justify-between">
      <h4 className="text-sm font-bold text-gray-700">物流追踪</h4>
      <button
        onClick={() => handleQueryShipping(selectedOrder.tracking_number!)}
        className="neo-btn px-3 py-1 text-xs font-bold bg-[#4A90E2] text-white"
      >
        <ExternalLink className="h-3 w-3 inline mr-1" />
        查询物流
      </button>
    </div>
    <p className="text-xs text-gray-400 mt-2">点击按钮将在新标签页打开百度搜索查询物流信息</p>
  </div>
)}
```

**改动点 D: 关闭弹窗时不再重置 shippingInfo**

第 280 行和第 295 行，移除 `setShippingInfo(null)`：
```tsx
// 第 280 行: 移除 setShippingInfo(null) 调用
onClick={() => {
  setSelectedOrder(null);
  // setShippingInfo(null);  // 删除这行
}}

// 第 293-295 行: 同样移除
onClick={() => {
  setSelectedOrder(null);
  // setShippingInfo(null);  // 删除这行
}}
```

**改动点 E: 移除不再需要的 import**

`ExternalLink` 已经导入，无需额外添加。确认 `ExternalLink` 在 import 中（第 5 行已有）。

### 不改动的文件

- `src/lib/kuaidi100.ts` — 保留，未来修复快递100后可重新启用
- `src/app/api/shipping/query/route.ts` — 保留，同上

## 弊端分析

1. **无法在页面内直接展示结果** — 用户需要切换到新标签页查看，体验不如页面内嵌展示流畅
2. **百度搜索结果不保证稳定** — 百度可能改版、不识别某些快递单号、或展示广告，结果不可控
3. **无法获取结构化数据** — 不能像 API 那样解析物流状态、时间线等结构化信息
4. **依赖第三方平台** — 如果百度调整搜索策略，此方案可能失效

## 优势

1. **零 API 依赖** — 不需要配置任何 Key、不需要付费
2. **实现简单** — 仅涉及前端改动，无需后端支持
3. **100% 可靠** — 不依赖 Vercel Serverless 环境、不依赖第三方 API 稳定性
4. **百度自动识别快递公司** — 用户无需手动选择快递公司

## 验证步骤

1. 本地运行 `npm run dev`，打开我的订单页面
2. 点击某个有快递单号的订单，进入订单详情弹窗
3. 点击"查询物流"按钮，确认在新标签页打开百度搜索
4. 确认百度搜索结果正确显示了快递信息
5. 确认关闭弹窗不会报错（无 shippingInfo 状态残留问题）