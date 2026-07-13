# Agnes 一键生图质量优化计划

## 摘要

用户反馈 Agnes 一键生图存在三个质量问题：
1. **白底图错误识别衣服特征**（衣服变形）
2. **试穿图把长袖做成短袖**（版型还原差）
3. **模特动作和场景不高级**

用户参考稿定AI的效果，期望：浅灰质感高级棚拍背景、3:4比例、高质量还原。并要求企微发送顺序为：商品信息 → 白底图 → 试穿图。

**用户决策**：模型从 `agnes-image-2.0-flash` 升级到 `agnes-image-2.1-flash`（图生图保持细节），配合提示词优化 + 简化流程解决质量问题。

## 根因分析

### 问题1：白底图错误识别衣服特征
**根因**：当前提示词（[generate/route.ts 第329行](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/photo-gen/generate/route.ts)）用了 `Transform the garment into...`，"transform"一词让模型重新生成衣服而非保留原图，导致变形。

**当前提示词**：
```
Transform the garment into a professionally shot flat-lay product photo. Preserve the exact garment type, colors, patterns, prints, fabric texture, every detail from the photo. Laid flat and smooth, front view, on a pure white background. Clean sharp edges, no model, no shadow, professional product photography.
```

### 问题2：试穿图长袖变短袖
**根因**：
- 试穿图依赖白底图作为输入（[第358行](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/photo-gen/generate/route.ts) `modelImages = flatUrl ? [flatUrl, modelPhotoUrl] : ...`），白底图已变形则误差累积
- 提示词（[第354-356行](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/photo-gen/generate/route.ts)）没有明确强调"保留袖长、领型、版型"
- 硬编码 "child model" 与实际模特可能不符

### 问题3：模特动作和场景不高级
**根因**：步骤3（[callAgnesTextModel 第244行](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/photo-gen/generate/route.ts)）让文本模型生成场景描述，质量不稳定且引入随机性。用户要的是固定的"浅灰质感棚拍背景"，不需要AI生成场景。

### 问题4：发送顺序错误
**根因**：[第702-746行](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/photo-gen/generate/route.ts) 当前顺序为 商品文本→试穿图→白底图，与用户要求的 商品信息→白底图→试穿图 相反。

## 优化方案

### 改动1：简化 callAgnesModel 流程（核心）

**文件**：`src/app/api/photo-gen/generate/route.ts` 第 269-385 行

**当前5步串行**：识别衣服 → 识别模特 → 生成场景 → 生成白底图 → 生成试穿图

**改为2步并行**：生成白底图 ‖ 生成试穿图

去掉步骤1/2/3的原因：
- 步骤1/2的VLM识别结果只用于步骤3的场景描述，而用户要固定浅灰背景，不需要场景描述
- 步骤3的场景描述是"不高级"的来源之一
- 去掉这3步还能节省约6-10秒（3次API调用）

**试穿图输入调整**：当前用 `[flatUrl, modelPhotoUrl]`（白底图+模特图），改为 `[productPhotoUrl, modelPhotoUrl]`（衣服原图+模特图）。原因：避免白底图变形累积到试穿图，衣服原图细节最完整。

**并行实现**：
```ts
const [flatUrl, modelUrl] = await Promise.all([
  generateFlatImage(productPhotoUrl).catch(() => null),
  generateTryOnImage(productPhotoUrl, modelPhotoUrl).catch(() => { throw new Error("试穿图生成失败"); }),
]);
```

白底图失败不阻断试穿图（与当前行为一致，第348-350行），试穿图失败则抛错（因为试穿图是主要产物）。

### 改动2：优化白底图提示词（解决问题1）

**新提示词**（替换第329行）：
```
Remove the background completely and replace it with pure white #FFFFFF. Keep the original garment exactly as-is — same style, same sleeve length, same collar type, same colors, same patterns, same prints, same fabric texture, same proportions, same every single detail. Do NOT alter, redraw, transform, or regenerate the garment in any way. The garment must be a pixel-perfect copy of the original, only the background changes to pure white. Flat-lay front view, no model, no shadow, no mannequin, professional e-commerce product photography, sharp focus.
```

**关键改动**：
- `Transform` → `Remove the background`：明确只做去背景，不重新生成衣服
- 显式列出 "same sleeve length, same collar type"：防止袖长领型变形
- `pixel-perfect copy` + `Do NOT alter, redraw, transform, or regenerate`：强力约束保留原图

### 改动3：优化试穿图提示词（解决问题2、3）

**新提示词**（替换第354-356行）：
```
A premium fashion studio photograph of the model wearing the exact garment from the reference clothing photo. The model's face, facial features, body shape, skin tone, and hairstyle must remain identical to the reference model photo. The garment must be preserved with absolute fidelity — same style, same sleeve length, same collar, same fit, same colors, same patterns, same prints, same fabric texture, same every detail, no alteration whatsoever. Light gray textured seamless studio backdrop (#E8E8E8 tone), premium fashion photography, soft even studio lighting, subtle natural shadow, full body shot, vertical 3:4 composition, elegant confident pose, sharp focus, high-end editorial quality.
```

**关键改动**：
- 去掉 `${sceneDescription}` 和 `${garmentDesc}`：不再依赖VLM识别结果，用固定的高级背景描述
- `浅灰质感棚拍背景` → `Light gray textured seamless studio backdrop (#E8E8E8 tone)`：参考稿定AI风格
- 显式 `same sleeve length, same collar, same fit`：防止长袖变短袖
- `elegant confident pose` + `high-end editorial quality`：提升姿势和整体质感
- 去掉硬编码 "child model"：用 "the model" 通用表述

### 改动4：修正企微发送顺序（解决用户需求）

**文件**：`src/app/api/photo-gen/generate/route.ts` 第 702-746 行

**当前顺序**：商品文本 → 试穿图 → 白底图

**改为**：商品文本 → 白底图 → 试穿图

实现：将第717-726行（试穿图发送）和第729-746行（白底图发送）调换位置。先发送白底图，再发送试穿图。

### 改动5：503重试 + 错误透传（可靠性，顺带）

**503重试**：抽取 `agnesFetchWithRetry` 函数，最多3次重试，间隔3秒（考虑Vercel超时限制）。

**错误透传**：`callAgnesModel` 不再吞掉错误（当前第381-385行返回null），改为抛出带步骤标识的错误，让POST主函数返回具体原因给前端。

## 文件改动清单

| 文件 | 改动内容 |
|---|---|
| `src/app/api/photo-gen/generate/route.ts` | 改动1-5全部在此文件 |

**仅改动1个文件**，集中在 `callAgnesModel` 函数（第269-385行）和POST主函数的发送逻辑（第702-746行）。

## 详细实现

### callAgnesModel 重写（第269-385行）

```ts
// 503重试包装
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

async function agnesImageFetch(url: string, body: unknown, retries = MAX_RETRIES): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGNES_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (res.status === 503 && retries > 0) {
    console.log(`[Agnes] 503 服务繁忙，${retries} 次重试机会剩余，${RETRY_DELAY_MS}ms 后重试...`);
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    return agnesImageFetch(url, body, retries - 1);
  }
  return res;
}

async function callAgnesModel(productPhotoUrl: string, modelPhotoUrl: string): Promise<{ modelUrl: string | null; flatUrl: string | null; sceneDescription: string }> {
  if (!AGNES_API_KEY) throw new Error("Agnes API Key 未配置");

  // 白底图提示词（强调只换背景不改衣服）
  const flatPrompt = `Remove the background completely and replace it with pure white #FFFFFF. Keep the original garment exactly as-is — same style, same sleeve length, same collar type, same colors, same patterns, same prints, same fabric texture, same proportions, same every single detail. Do NOT alter, redraw, transform, or regenerate the garment in any way. The garment must be a pixel-perfect copy of the original, only the background changes to pure white. Flat-lay front view, no model, no shadow, no mannequin, professional e-commerce product photography, sharp focus.`;

  // 试穿图提示词（浅灰质感棚拍背景，3:4，强调保留版型）
  const tryOnPrompt = `A premium fashion studio photograph of the model wearing the exact garment from the reference clothing photo. The model's face, facial features, body shape, skin tone, and hairstyle must remain identical to the reference model photo. The garment must be preserved with absolute fidelity — same style, same sleeve length, same collar, same fit, same colors, same patterns, same prints, same fabric texture, same every detail, no alteration whatsoever. Light gray textured seamless studio backdrop (#E8E8E8 tone), premium fashion photography, soft even studio lighting, subtle natural shadow, full body shot, vertical 3:4 composition, elegant confident pose, sharp focus, high-end editorial quality.`;

  // 白底图和试穿图并行生成
  console.log("Agnes: 并行生成白底图和试穿图...");

  const flatTask = (async (): Promise<string | null> => {
    try {
      const flatRes = await agnesImageFetch(`${AGNES_BASE}/images/generations`, {
        model: "agnes-image-2.1-flash",
        prompt: flatPrompt,
        size: "1024x1024",
        tags: ["img2img"],
        extra_body: { image: [productPhotoUrl], response_format: "url" },
      });
      const flatData = await flatRes.json();
      if (!flatRes.ok) {
        console.error("Agnes: 白底图生成失败:", flatData);
        return null;
      }
      const url = flatData?.data?.[0]?.url || null;
      console.log("Agnes: 白底图生成成功:", url);
      return url;
    } catch (err) {
      console.error("Agnes: 白底图生成异常:", err);
      return null;
    }
  })();

  const tryOnTask = (async (): Promise<string> => {
    const modelRes = await agnesImageFetch(`${AGNES_BASE}/images/generations`, {
      model: "agnes-image-2.1-flash",
      prompt: tryOnPrompt,
      size: "768x1024",
      tags: ["img2img"],
      extra_body: { image: [productPhotoUrl, modelPhotoUrl], response_format: "url" },
    });
    const modelData = await modelRes.json();
    if (!modelRes.ok) {
      throw new Error(`试穿图生成失败: ${JSON.stringify(modelData)}`);
    }
    const url = modelData?.data?.[0]?.url || null;
    if (!url) throw new Error("试穿图生成失败：未返回图片");
    console.log("Agnes: 试穿图生成成功:", url);
    return url;
  })();

  const [flatUrl, modelUrl] = await Promise.all([flatTask, tryOnTask]);

  return { modelUrl, flatUrl, sceneDescription: "" };
}
```

### 发送顺序修正（第702-746行）

```ts
// 4. 查询商品详情并发送企业微信（先文本，再白底图，再试穿图）
let wechatSent = false;
if (WECHAT_WEBHOOK_URL) {
  try {
    // 1. 先发送商品信息文本
    const [productDetail, salesStats] = await Promise.all([
      getProductDetail(sale_id),
      getSalesStats(sale_id),
    ]);
    const productText = productDetail
      ? buildProductText(productDetail, salesStats)
      : `售卖编号：${sale_id}`;
    await sendTextToWechat(productText);

    // 2. 再发送白底图
    if (flatUrl) {
      try {
        const flatRes = await fetch(flatUrl);
        const flatRawBuffer = Buffer.from(await flatRes.arrayBuffer());
        const flatCompressed = await compressImage(flatRawBuffer);
        const flatBase64 = flatCompressed.toString("base64");
        const flatMd5 = await computeMd5(flatCompressed);
        const flatWechatRes = await fetch(WECHAT_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ msgtype: "image", image: { base64: flatBase64, md5: flatMd5 } }),
        });
        const flatWechatData = await flatWechatRes.json();
        console.log("企业微信发送白底图结果:", flatWechatData);
      } catch (flatErr) {
        console.error("微信发送白底图失败:", flatErr);
      }
    }

    // 3. 最后发送试穿图
    const base64Image = imageBuffer.toString("base64");
    const md5 = await computeMd5(imageBuffer);
    const wechatRes = await fetch(WECHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "image", image: { base64: base64Image, md5 } }),
    });
    const wechatData = await wechatRes.json();
    console.log("企业微信发送试穿图结果:", wechatData);
    wechatSent = wechatData?.errcode === 0;
  } catch (wechatErr) {
    console.error("微信发送失败:", wechatErr);
  }
}
```

### POST主函数错误处理（第693-695行）

```ts
// 改前
if (!generatedUrl) {
  return NextResponse.json({ error: "生成失败，未返回图片" }, { status: 500 });
}

// 改后
if (!generatedUrl) {
  return NextResponse.json({ error: errMsg || "生成失败，未返回图片" }, { status: 500 });
}
```

callAgnesModel 抛出的错误在外层 catch（第697行附近）捕获后返回前端。

## 不做的事项（明确排除）

- **不换模型**：用户明确要求继续用 agnes-flash
- **不改前端**：前端已有 `alert("生成失败: " + (err.error || "未知错误"))`，错误透传后自动生效
- **不抽取提示词常量**：改动集中在一个函数内，无需过度抽象
- **不抽取 agnesFetchWithRetry 到 lib/**：当前仅此一处使用，内联即可
- **不动 agnes/route.ts**：微信机器人链路独立，不在本次范围
- **不改白底图尺寸**：1024x1024 正方形适合商品展示，保持不变
- **不改试穿图尺寸**：768x1024 已接近3:4，保持不变

## 验证步骤

1. **类型检查**：`npx tsc --noEmit` 无错误
2. **功能验证**：
   - 在照片生成页面点击一键生成
   - 确认白底图衣服特征与原图一致（袖长、领型、颜色、图案不变形）
   - 确认试穿图模特穿着正确（长袖不会变短袖），浅灰质感背景
   - 确认企微收到3条消息顺序：商品信息 → 白底图 → 试穿图
3. **性能验证**：去掉步骤1/2/3 + 白底图/试穿图并行，整体生成时间应从原来15-20秒降到5-10秒
4. **503重试验证**：Vercel日志中 Agnes 503 时应看到重试日志
5. **错误透传验证**：故意配置错误API Key，前端应显示具体失败原因而非泛化"生成失败"

## 假设与决策

- **假设**：agnes-image-2.1-flash 比当前 2.0-flash 质量更好，配合精确提示词 + img2img 图生图能显著改善细节保留（袖长、版型、颜色不变形）
- **决策**：模型从 agnes-image-2.0-flash 升级到 agnes-image-2.1-flash（用户明确要求）
- **决策**：去掉步骤1/2/3（VLM识别+场景生成），因为用户要固定浅灰背景，不需要AI生成场景；VLM识别结果未直接用于图片生成提示词，去掉不影响
- **决策**：试穿图改用衣服原图+模特图（而非白底图+模特图），避免白底图变形累积误差
- **决策**：503重试3次间隔3秒（而非video路由的5次8秒），因为照片生成是同步请求，总重试时间9秒 vs 40秒，平衡可靠性与Vercel超时
- **决策**：保留 `sceneDescription` 字段返回空字符串，避免改动函数签名影响调用方
- **风险**：agnes-image-2.1-flash 若不存在或不可用，需回退到 2.0-flash；建议执行时先验证模型名可用性
