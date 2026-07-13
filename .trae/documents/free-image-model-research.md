# 免费/更强图生图模型替代方案调研计划

## 摘要

用户询问有没有类似 Agnes 的免费、能力相同或更高的图像生成模型可替代。经网络调研，关键发现：

**最重要结论**：**Agnes AI 已于 2026年6月1日全系列API永久免费**（文本+图像+视频，无限期、无限量、不绑卡、无功能阉割）。用户当前正在用的 `agnes-image-2.1-flash` **本身就是免费的**，不存在"省Agnes费用"的诉求。真正的价值在于寻找**能力更高**的模型来解决质量问题（模特变成熟、姿势单一等 agnes-flash 的能力上限）。

本计划提供 3 个替代方案对比，并询问用户是否要接入新模型作为可选方案（保留 Agnes 为默认）。

## 当前状态分析

### 项目现有模型集成（[generate/route.ts 第5-19行](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/photo-gen/generate/route.ts)）

| 模型 | 状态 | 免费额度 | 能力评估 |
|---|---|---|---|
| **Agnes** (agnes-image-2.1-flash) | 默认模型，一键生成用 | **永久免费**（2026.6.1起） | flash版，质量中等，长袖易变短袖，模特易变成熟 |
| **豆包 Seedream** | 已集成，2K分辨率 | 无公开免费额度 | 质量较好，中文提示词友好 |
| **Qwen Image Edit Plus** | 已集成 | 约100张 | 图片编辑能力强，但试穿非专长 |
| **AI试衣 Plus (aitryon)** | 已集成 | 约400张 | 专门做试衣，但走异步任务较慢 |
| **自定义模型** | 已集成 | 取决于用户配置 | 灵活扩展点 |

### 现有架构特点
- `ModelType` 类型已支持 5 种模型（第19行）
- POST 主函数根据 `ai_model` 字段路由（第593行）
- 前端模型选择器已有 4 个按钮 + 自定义（[page.tsx 第80行](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/operations/photo-gen/page.tsx)）
- **接入新模型只需**：① 加 ModelType 类型 ② 加调用函数 ③ 加路由分支 ④ 前端加按钮

## 替代方案调研结果

### 方案A：硅基流动 SiliconFlow（强烈推荐）

**平台**：https://cloud.siliconflow.cn

**免费额度**：
- `Kwai-Kolors/Kolors`（快手可图）：**完全免费**，无限制
- `Qwen/Qwen-Image-Edit-2509`（通义万相图像编辑）：有免费额度
- `black-forest-labs/FLUX.1-schnell`：每天40次免费
- `stabilityai/stable-diffusion-3-5-large`：有免费额度

**关键能力对比**：
| 模型 | 图生图 | 多图输入 | 竖版3:4 | 试穿专长 | 质量 |
|---|---|---|---|---|---|
| Kolors | ✅（image字段） | ❌ | ✅ 768x1024 | ❌ | 中上 |
| **Qwen-Image-Edit-2509** | ✅ | ✅✅✅（image+image2+image3 三图） | ✅ 1140x1472 | ✅（多图编辑天然适合试穿） | **高** |
| FLUX.1-schnell | ✅ | ❌ | 需确认 | ❌ | 高（但4步快速版） |

**API格式**（与 Agnes/OpenAI 兼容）：
```
POST https://api.siliconflow.cn/v1/images/generations
Headers: Authorization: Bearer <SILICONFLOW_API_KEY>
Body: {
  "model": "Qwen/Qwen-Image-Edit-2509",
  "prompt": "...",
  "image": "url_or_base64",      // 衣服图
  "image2": "url_or_base64",     // 模特图（关键！多图输入适合试穿）
  "image_size": "1140x1472"      // 3:4竖版
}
```
**响应**：`{ images: [{ url }] }`（URL有效期1小时，需及时下载）

**优势**：
- `Qwen-Image-Edit-2509` 支持3图输入，天然适合"衣服图+模特图→试穿图"场景
- API格式与现有 Agnes 调用几乎一致，接入改动小
- 国内服务，速度快，无墙

### 方案B：HuggingFace Kolors Virtual Try-On（免费但集成复杂）

**平台**：https://huggingface.co/spaces/Kwai-Kolors/Kolors-Virtual-Try-On

**特点**：
- 快手可图团队专门做的**虚拟试衣**模型
- 完全免费，但走 HuggingFace Spaces（Gradio界面），非标准API
- 需用 `@gradio/client` 或 HTTP 调用 Spaces 接口，集成复杂
- 国外服务，速度慢，可能需翻墙

**评估**：试衣效果最专业，但集成成本高，稳定性差（Spaces 可能排队/下线）

### 方案C：保持 Agnes，不接入新模型

**理由**：
- Agnes 已永久免费，无成本问题
- 当前质量问题（模特变成熟、姿势单一）已通过提示词优化部分缓解
- 接入新模型增加维护成本

**风险**：agnes-image-2.1-flash 能力上限有限，若提示词优化仍不满意，需换模型

## 推荐方案：接入硅基流动 Qwen-Image-Edit-2509 作为可选模型

### 为什么推荐
1. **能力更高**：Qwen-Image-Edit-2509 支持3图输入（image=衣服, image2=模特, image3=可选背景参考），比 Agnes 的 img2img 更适合试穿场景
2. **免费可用**：硅基流动有免费额度，注册即送
3. **接入简单**：API格式与现有架构兼容，改动小
4. **国内速度**：硅基流动国内服务，响应快
5. **不破坏现状**：保留 Agnes 为默认，新增"硅基流动"为可选项，用户可对比效果

### 不推荐方案B的理由
- HuggingFace Spaces 非标准API，集成复杂
- 国外服务不稳定，可能排队
- Vercel Serverless 调用 HuggingFace 可能超时

## 拟定改动（如用户确认接入）

### 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/app/api/photo-gen/generate/route.ts` | ① 第5-9行加 `SILICONFLOW_API_KEY` 环境变量<br>② 第19行 ModelType 加 `"siliconflow"`<br>③ 新增 `callSiliconFlowTryOn` 函数（调 Qwen-Image-Edit-2509，image=衣服图, image2=模特图）<br>④ 第593行路由加 `siliconflow` 分支<br>⑤ 第648行加 flat_only 的 siliconflow 白底图生成（用 Kolors 或 Qwen） |
| `src/app/operations/photo-gen/page.tsx` | ① 第80行 aiModel 类型加 `"siliconflow"`<br>② 第83行 FREE_QUOTA 加 `siliconflow: 100`（估算）<br>③ 模型选择器UI加"🎨 硅基流动"按钮 |
| Vercel 环境变量 | 新增 `SILICONFLOW_API_KEY` |

### callSiliconFlowTryOn 函数草案

```ts
const SILICONFLOW_BASE = "https://api.siliconflow.cn/v1";
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || "";

async function callSiliconFlowTryOn(productPhotoUrl: string, modelPhotoUrl: string): Promise<{ modelUrl: string | null; flatUrl: string | null; sceneDescription: string }> {
  if (!SILICONFLOW_API_KEY) throw new Error("硅基流动 API Key 未配置");

  const tryOnPrompt = `A premium fashion studio photograph...（复用现有试穿图提示词，含浅灰背景+姿势随机）`;
  const flatPrompt = `Remove the background...（复用现有白底图提示词）`;

  // 并行：试穿图（Qwen-Image-Edit-2509 三图输入）+ 白底图（Kolors）
  const [modelUrl, flatUrl] = await Promise.all([
    (async () => {
      const res = await fetch(`${SILICONFLOW_BASE}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SILICONFLOW_API_KEY}` },
        body: JSON.stringify({
          model: "Qwen/Qwen-Image-Edit-2509",
          prompt: tryOnPrompt,
          image: productPhotoUrl,    // 衣服图
          image2: modelPhotoUrl,     // 模特图
          image_size: "1140x1472",   // 3:4 竖版
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`硅基流动试穿图失败: ${JSON.stringify(data)}`);
      return data?.images?.[0]?.url || null;
    })().catch((e) => { throw new Error(e.message); }),
    (async () => {
      const res = await fetch(`${SILICONFLOW_BASE}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SILICONFLOW_API_KEY}` },
        body: JSON.stringify({
          model: "Kwai-Kolors/Kolors",
          prompt: flatPrompt,
          image: productPhotoUrl,
          image_size: "1024x1024",
        }),
      });
      const data = await res.json();
      if (!res.ok) { console.error("硅基流动白底图失败:", data); return null; }
      return data?.images?.[0]?.url || null;
    })().catch(() => null),
  ]);

  return { modelUrl, flatUrl, sceneDescription: "" };
}
```

## 决策点（需用户确认）

1. **是否接入硅基流动作为可选模型？**
   - 是：按上述方案接入，用户可在前端切换 Agnes/硅基流动对比效果
   - 否：保持现状，继续优化 Agnes 提示词

2. **如果接入，默认模型用哪个？**
   - 保持 Agnes 默认（推荐，稳妥）
   - 改硅基流动默认（需先验证效果确实更好）

## 假设与决策

- **假设**：用户的核心诉求是"能力更高的免费模型"，而非"省Agnes费用"（因Agnes已免费）
- **假设**：Qwen-Image-Edit-2509 的3图输入能力比 Agnes img2img 更适合试穿场景（待验证）
- **决策**：推荐硅基流动而非HuggingFace，因前者API标准化、国内速度快、集成成本低
- **决策**：不删除现有 Agnes 集成，新增硅基流动为可选项，让用户对比选择
- **风险**：硅基流动免费额度可能有限（Qwen-Image-Edit-2509 具体额度需注册后确认），Kolors 完全免费但无试穿专长
- **风险**：Qwen-Image-Edit-2509 实际试穿效果未经验证，可能不如预期

## 验证步骤（如接入）

1. 注册硅基流动账号，获取 API Key，确认免费额度
2. 先用 curl 测试 Qwen-Image-Edit-2509 的试穿效果（image=衣服, image2=模特）
3. 若效果满意，再接入代码
4. Vercel 配置 `SILICONFLOW_API_KEY` 环境变量
5. 前端切换模型对比 Agnes vs 硅基流动的生成质量
