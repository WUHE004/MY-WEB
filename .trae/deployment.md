# 部署配置记录

> 此文件用于 Trae IDE 持久化记忆本项目的部署方式，换模型也不会丢失。

## 项目信息
- 项目名称: inventory-hub
- 本地路径: `d:\MY WORK\dianbigntest\inventory-hub`
- 框架: Next.js 16 (Turbopack)
- 运行时: Node.js

## 部署方式
- 平台: Vercel
- CLI 工具: `npx vercel` (已安装在 devDependencies)
- Vercel 团队: `wuhe-s-projects`
- Vercel 项目名: `inventory-hub`
- 生产地址: https://dianbing.top

## 部署命令

```bash
# 在 inventory-hub 目录下执行：
cd "d:\MY WORK\dianbigntest\inventory-hub"
npx vercel --prod --yes
```

## 构建验证

部署前可先本地验证构建：

```bash
cd "d:\MY WORK\dianbigntest\inventory-hub"
npx next build
```

## 环境变量

Vercel 上已配置的环境变量（通过 `vercel link` 自动同步）：
- `DOUBAO_API_KEY` — 豆包 Seedream API
- `DOUBAO_ENDPOINT_ID` — 豆包 Endpoint ID
- `DASHSCOPE_API_KEY` — 阿里云百炼 DashScope
- `WECHAT_WEBHOOK_URL` — 企业微信 Webhook
- Supabase 相关变量

环境变量由 Vercel 平台管理，执行 `vercel link` 后会自动下载到 `.env.local`。

## Vercel 配置

`vercel.json` 包含：
- Cron Jobs: 每月1号凌晨3点清理销售/退货记录
- 部分 API 路由 maxDuration 设为 60s