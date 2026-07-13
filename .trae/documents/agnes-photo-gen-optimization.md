# Agnes 一键生图优化计划

## 摘要

用户要求查看"照片生成中一键生成调用 agnes 模型生图的逻辑以及提示词"，并找出可优化点。

经调查，一键生成的主链路是 [`src/app/api/photo-gen/generate/route.ts`](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/photo-gen/generate/route.ts) 的 `callAgnesModel` 函数（第 269-385 行），分 5 步串行：识别衣服 → 识别模特 → 生成场景 → 生成白底图 → 生成试穿图。

核心问题（按严重度排序）：
1. **错误被静默吞掉**：任何步骤异常都返回 `null`，用户只看到"生成失败"，无法定位原因
2. **无 503 重试**：Agnes 服务繁忙直接失败，而同目录的 `video/route.ts` 已有完整重试实现
3. **步骤1/2 串行可并行**：识别衣服和识别模特互相独立，浪费一次网络往返
4. **提示词质量问题**：JSON 识别结果用 `Object.values().join()` 平铺丢失字段语义；试穿图硬编码 "child model" 与成人模特冲突
5. **无超时控制**：fetch 无 AbortController，Agnes 卡死时整个请求挂起到 Vercel 函数超时

## 当前状态分析

### 调用链
- 前端按钮 → `handleOneshotGenerate`（[page.tsx 第 274-320 行](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/operations/photo-gen/page.tsx)）→ POST `/api/photo-gen/generate` → `callAgnesModel`（第 269 行）

### Agnes API 参数
| 项 | 值 |
|---|---|
| Base URL | `https://apihub.agnes-ai.com/v1` |
| 视觉模型 | `agnes-vlm-2-flash`（识别衣服/模特） |
| 文本模型 | `agnes-2.0-flash`（场景描述） |
| 图片模型 | `agnes-image-2.0-flash`（白底图/试穿图） |
| 白底图 size | `1024x1024` |
| 试穿图 size | `768x1024` |
| 重试 | **无** |
| 超时 | **无** |

### 现有提示词

**步骤1 - 识别衣服**（第 276 行）：
```
请以JSON格式识别这张图片中的衣服英文关键词：garment_type（如t-shirt, hoodie, dress, polo, shirt, sweatshirt, jacket, romper, vest, skirt set等），main_color（精确颜色），patterns（每个图案的位置+形状+颜色+大小），neckline_sleeves，material，details。只输出JSON，不要额外文字。
```
解析（第 294-299 行）：`Object.values(parsed).join(", ")` — **平铺丢失字段语义**

**步骤2 - 识别模特**（第 312 行）：
```
请用英文描述这个儿童模特的性别、大致年龄、发型发色、肤色、姿势。用一句话概括。
```
**硬编码"儿童模特"**，若模特库有成人模特会矛盾

**步骤3 - 场景描述**（第 246 行）：
```
Based on this clothing: "${garmentDesc}", worn by ${modelDesc}, generate a professional fashion photoshoot scene and outfit suggestion...
```
正常，但 `garmentDesc` 因步骤1解析问题质量受损

**步骤4 - 白底图**（第 329 行）：
```
Transform the garment into a professionally shot flat-lay product photo. Preserve the exact garment type, colors, patterns, prints, fabric texture, every detail from the photo. Laid flat and smooth, front view, on a pure white background. Clean sharp edges, no model, no shadow, professional product photography.
```
合理，无需大改

**步骤5 - 试穿图**（第 354-356 行）：
```
Make the child model wear the exact garment from the flat lay photo. ${sceneDescription}. Preserve the model's face, body shape, and skin tone exactly...
```
**硬编码 "child model"**，应改用 `${modelDesc}`

### 503 重试参考实现
[`video/route.ts` 第 13-14、104-108、129-133 行](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/photo-gen/video/route.ts)：`MAX_RETRIES=5`，`RETRY_DELAY_MS=8000`，HTTP 503 或异常消息含 "503" 时递归重试。

## 优化方案

### 改动 1：步骤1/2 并行化（性能）
**文件**：`src/app/api/photo-gen/generate/route.ts` 第 274-319 行

将"识别衣服"和"识别模特"两个独立的视觉模型调用用 `Promise.all` 并行执行。两者无数据依赖，可节省约 1-2 秒（一次 Agnes 视觉调用往返）。

```ts
// 改前：串行
const garmentDesc = await recognizeGarment(productPhotoUrl);   // 步骤1
const modelDesc = await recognizeModel(modelPhotoUrl);         // 步骤2

// 改后：并行
const [garmentDesc, modelDesc] = await Promise.all([
  recognizeGarment(productPhotoUrl),
  recognizeModel(modelPhotoUrl),
]);
```

实现方式：把步骤1和步骤2各自抽成内部辅助函数，再 `Promise.all`。

### 改动 2：添加 503 重试机制（可靠性）
**文件**：`src/app/api/photo-gen/generate/route.ts`

抽取通用重试包装函数，复用到所有 Agnes fetch 调用。参数对齐 `video/route.ts`：最多 5 次，间隔 8 秒。

但注意：Vercel Serverless 有超时限制（Hobby 10s/Pro 60s），8秒×5次=40秒可能超时。**调整为：最多 3 次重试，间隔 3 秒**（总上限约 9 秒额外开销），平衡可靠性与超时风险。

```ts
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

async function agnesFetchWithRetry(url: string, body: unknown, retries = MAX_RETRIES): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGNES_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (res.status === 503 && retries > 0) {
    console.log(`[Agnes] 503 服务繁忙，${retries - 1} 次重试后重试...`);
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    return agnesFetchWithRetry(url, body, retries - 1);
  }
  return res;
}
```

应用到：步骤1/2/3/4/5 的所有 fetch 调用。

### 改动 3：添加请求超时（可靠性）
**文件**：`src/app/api/photo-gen/generate/route.ts`

为每个 Agnes fetch 添加 AbortController 超时，防止 Agnes 卡死导致整个函数超时。视觉/文本调用 30 秒，图片生成 60 秒。

在 `agnesFetchWithRetry` 内统一加：
```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);
try {
  const res = await fetch(url, { ..., signal: controller.signal });
  return res;
} finally {
  clearTimeout(timeout);
}
```

### 改动 4：错误信息透传（可调试性）
**文件**：`src/app/api/photo-gen/generate/route.ts` 第 269-385 行

当前 `callAgnesModel` 第 381-385 行 catch 吞掉所有异常返回 `null`。改为返回带步骤标识的错误信息。

```ts
// 改前
} catch (err) {
  console.error("Agnes: 生成失败:", err);
  return { modelUrl: null, flatUrl: null, sceneDescription: "" };
}

// 改后：不吞错，让上层 POST 处理器返回具体原因给前端
} catch (err) {
  const step = currentStep; // 用变量记录当前步骤
  const msg = err instanceof Error ? err.message : String(err);
  throw new Error(`[步骤${step}] ${msg}`);
}
```

POST 处理器（第 683-695 行）catch 后把具体错误信息返回前端：
```ts
catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: `生成失败: ${msg}` }, { status: 500 });
}
```

### 改动 5：优化提示词（质量）

**5a. 步骤1 识别衣服 — 保留字段语义**（第 294-299 行）

```ts
// 改前：平铺丢失语义
garmentDesc = Object.values(parsed).filter(...).join(", ");

// 改后：保留字段名
const parts: string[] = [];
if (parsed.garment_type) parts.push(`Type: ${parsed.garment_type}`);
if (parsed.main_color) parts.push(`Color: ${parsed.main_color}`);
if (parsed.patterns) parts.push(`Patterns: ${parsed.patterns}`);
if (parsed.neckline_sleeves) parts.push(`Neckline&Sleeves: ${parsed.neckline_sleeves}`);
if (parsed.material) parts.push(`Material: ${parsed.material}`);
if (parsed.details) parts.push(`Details: ${parsed.details}`);
garmentDesc = parts.join("; ");
```

**5b. 步骤2 识别模特 — 去掉硬编码"儿童"**（第 312 行）

```ts
// 改前
"请用英文描述这个儿童模特的性别、大致年龄、发型发色、肤色、姿势。用一句话概括。"

// 改后
"Describe this model's gender, approximate age, hairstyle and color, skin tone, and pose in English. One sentence summary."
```

**5c. 步骤5 试穿图 — 用 modelDesc 替代硬编码 "child model"**（第 354-356 行）

```ts
// 改前
`Make the child model wear the exact garment...`

// 改后
`Make ${modelDesc} wear the exact garment from the flat lay photo. ${sceneDescription}...`
```

需把 `modelDesc` 作为参数传入步骤5的 prompt 构造（当前 `modelDesc` 在作用域内可见，直接用即可）。

### 不做的事项（明确排除）

- **不抽取白底图提示词常量**：虽然第 329 行和 `agnes/route.ts` 有重复，但跨文件抽取会改变 `agnes/route.ts` 行为，超出本次"一键生成"优化范围
- **不改生成图持久化策略**：当前"不存 Supabase 节省存储"是用户的成本决策，保持不变
- **不重构 agnes/route.ts**：微信机器人链路与一键生成链路独立，且存在模型名不一致等历史问题，单独处理
- **不简化 flat_only 分支**：第 629-634 行 if/else 看似冗余但保留豆包等模型的扩展点，不动

## 文件改动清单

| 文件 | 改动内容 |
|---|---|
| `src/app/api/photo-gen/generate/route.ts` | 改动1-5全部在此文件：并行化步骤1/2、添加 agnesFetchWithRetry 重试+超时、错误信息透传、3处提示词优化 |

**仅改动 1 个文件**，改动集中在 `callAgnesModel` 函数（第 269-385 行）及其调用的 fetch。

## 验证步骤

1. **类型检查**：`npx tsc --noEmit` 无错误
2. **功能验证**：
   - 在照片生成页面点击一键生成，确认白底图和试穿图都能生成
   - 故意触发错误（如配置错误的 AGNES_API_KEY），确认前端能看到具体失败步骤而非泛化的"生成失败"
3. **性能验证**：步骤1/2 并行后，整体生成时间应比之前快约 1-2 秒
4. **503 重试验证**：观察 Vercel 日志，Agnes 返回 503 时应看到重试日志而非直接失败
5. **提示词验证**：步骤1的衣服描述应包含 `Type:` `Color:` 等字段前缀（看 console.log），试穿图描述应使用实际模特描述而非固定 "child model"

## 假设与决策

- **假设**：Agnes 视觉/文本/图片 API 都可能返回 503，因此重试机制统一应用到所有 fetch
- **决策**：重试次数设为 3 次而非 video 路由的 5 次，因为照片生成是同步请求（用户等待中），5 次×8 秒=40 秒会超过 Vercel Pro 60 秒超时；3 次×3 秒=9 秒额外开销更合理
- **决策**：超时设为视觉/文本 30 秒、图片 60 秒，基于 Agnes 各模型典型响应时间
- **决策**：不改动前端 `page.tsx`，因为错误信息透传后前端已有的 `alert("生成失败: " + (err.error || "未知错误"))` 能直接显示具体原因
