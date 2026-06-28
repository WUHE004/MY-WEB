# 点冰童装库存管理系统 - 配置教程

## 目录

1. [Supabase 数据库配置](#1-supabase-数据库配置)
2. [阿里云短信服务配置](#2-阿里云短信服务配置)
3. [快递100 API 配置](#3-快递100-api-配置)
4. [Vercel 部署配置](#4-vercel-部署配置)
5. [本地开发环境配置](#5-本地开发环境配置)

---

## 1. Supabase 数据库配置

### 1.1 创建 Supabase 项目

1. 访问 [https://supabase.com](https://supabase.com) 并注册/登录
2. 点击 **New Project** 创建新项目
3. 填写项目信息：
   - Name: `dianbing-inventory` (自定义)
   - Database Password: 设置一个强密码（请记住，后面会用到）
   - Region: 选择离你最近的区域（如 Southeast Asia）
   - Pricing Plan: Free Plan 足够用
4. 等待项目创建完成（约 2 分钟）

### 1.2 执行数据库 Schema

项目创建完成后：

1. 左侧菜单点击 **SQL Editor**
2. 点击 **New query**
3. 依次执行以下 SQL 文件（按顺序）：

**第一步：基础表结构**
- 文件路径：`src/lib/supabase-schema.sql`
- 复制文件内容粘贴到 SQL Editor，点击 **Run**

**第二步：会员表**
- 文件路径：`src/lib/members-schema.sql`
- 复制内容执行

**第三步：网页订单表**
- 文件路径：`src/lib/web-orders-schema.sql`
- 复制内容执行

**第四步：短信验证码表**
- 文件路径：`src/lib/sms-schema.sql`
- 复制内容执行

**第五步：支付相关表**
- 文件路径：`src/lib/payment-schema.sql`
- 复制内容执行

**第六步：物流相关表**
- 文件路径：`src/lib/shipping-schema.sql`
- 复制内容执行

> 💡 **提示**：执行完后可以到 **Table Editor** 查看表是否创建成功

### 1.3 创建 Storage Bucket

1. 左侧菜单点击 **Storage**
2. 点击 **New bucket**
3. 名称填写：`product-photos`
4. 勾选 **Make public**（公开访问，商品图片需要公开）
5. 点击 **Create bucket**

### 1.4 获取 API 配置

在 **Project Settings → API** 页面获取以下信息：

| 配置项 | 说明 | 环境变量名 |
|--------|------|-----------|
| Project URL | 项目URL | `NEXT_PUBLIC_SUPABASE_URL` |
| anon public | 公开密钥 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role | 服务密钥 | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ **注意**：`service_role` 密钥非常重要，不要泄露到前端代码！

---

## 2. 阿里云短信服务配置

### 2.1 注册阿里云账号

1. 访问 [https://www.aliyun.com](https://www.aliyun.com) 注册账号
2. 完成实名认证（个人用户即可）

### 2.2 开通短信服务

1. 搜索"短信服务"进入产品页面
2. 点击 **立即开通**（免费试用有 100 条左右额度）
3. 进入短信服务控制台

### 2.3 创建签名

1. 左侧菜单 **国内消息 → 签名管理**
2. 点击 **添加签名**
3. 填写信息：
   - 签名名称：`点冰童装`（或其他你喜欢的）
   - 签名类型：`验证码`
   - 适用场景：`有自己的网站`
   - 备注：写清楚用途
4. 等待审核（一般 1-2 小时）

### 2.4 创建模板

1. 左侧菜单 **国内消息 → 模板管理**
2. 点击 **添加模板**
3. 填写信息：
   - 模板名称：`注册验证码`
   - 模板类型：`验证码`
   - 模板内容：`您的验证码是${code}，5分钟内有效。请勿泄露给他人。`
4. 等待审核

### 2.5 获取 AccessKey

1. 点击右上角头像 → **AccessKey 管理**
2. 建议创建 **RAM 子用户**（更安全）
3. 创建后保存以下信息：

| 配置项 | 环境变量名 |
|--------|-----------|
| AccessKey ID | `ALIYUN_SMS_ACCESS_KEY_ID` |
| AccessKey Secret | `ALIYUN_SMS_ACCESS_KEY_SECRET` |
| 签名名称 | `ALIYUN_SMS_SIGN_NAME` |
| 模板CODE | `ALIYUN_SMS_TEMPLATE_CODE` |

> 💡 **开发测试**：如果不配置阿里云短信，系统会使用模拟模式，验证码会打印到控制台（开发时方便测试）

---

## 3. 快递100 API 配置

### 3.1 注册快递100账号

1. 访问 [https://www.kuaidi100.com/openapi/](https://www.kuaidi100.com/openapi/)
2. 点击 **免费注册**
3. 完成注册和实名认证

### 3.2 获取 API 密钥

1. 登录后进入 **管理后台**
2. 在 **我的接口** 或 **账户信息** 中找到：

| 配置项 | 环境变量名 | 说明 |
|--------|-----------|------|
| customer | `KUAIDI100_CUSTOMER` | 客户编号 |
| key | `KUAIDI100_KEY` | 授权密钥 |

### 3.3 免费额度

- 快递100实时查询API免费额度：约 100 次/天
- 超出后按次收费（约 0.03 元/次）

> 💡 **开发测试**：不配置快递100时，系统会使用模拟数据，方便测试界面

---

## 4. Vercel 部署配置

### 4.1 导入 GitHub 项目

1. 访问 [https://vercel.com](https://vercel.com) 登录
2. 点击 **Add New → Project**
3. 选择你的 GitHub 仓库
4. 点击 **Import**

### 4.2 配置环境变量

在 **Configure Project → Environment Variables** 中添加：

```
# Supabase 配置（必填）
NEXT_PUBLIC_SUPABASE_URL=你的项目URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon密钥
SUPABASE_SERVICE_ROLE_KEY=你的service_role密钥

# 阿里云短信（可选，不配则用模拟模式）
ALIYUN_SMS_ACCESS_KEY_ID=你的AccessKey ID
ALIYUN_SMS_ACCESS_KEY_SECRET=你的AccessKey Secret
ALIYUN_SMS_SIGN_NAME=点冰童装
ALIYUN_SMS_TEMPLATE_CODE=SMS_xxxxxxx

# 快递100（可选，不配则用模拟数据）
KUAIDI100_KEY=你的key
KUAIDI100_CUSTOMER=你的customer编号
```

### 4.3 部署

1. 确认配置无误后点击 **Deploy**
2. 等待部署完成（约 2-5 分钟）
3. 部署成功后点击 **Visit** 访问网站

### 4.4 自定义域名（可选）

1. 在项目页面点击 **Settings → Domains**
2. 添加你的域名（如 `dianbing.top`）
3. 按照提示在域名服务商处配置 DNS 解析
4. 等待 SSL 证书签发

---

## 5. 本地开发环境配置

### 5.1 安装 Node.js

确保已安装 Node.js 18 或更高版本：

```bash
node --version
```

### 5.2 克隆项目

```bash
git clone 你的仓库地址
cd inventory-hub
```

### 5.3 安装依赖

```bash
npm install
```

### 5.4 配置环境变量

在项目根目录创建 `.env.local` 文件：

```bash
# .env.local
# Supabase 配置（必填）
NEXT_PUBLIC_SUPABASE_URL=你的项目URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon密钥
SUPABASE_SERVICE_ROLE_KEY=你的service_role密钥

# 阿里云短信（可选）
ALIYUN_SMS_ACCESS_KEY_ID=
ALIYUN_SMS_ACCESS_KEY_SECRET=
ALIYUN_SMS_SIGN_NAME=
ALIYUN_SMS_TEMPLATE_CODE=

# 快递100（可选）
KUAIDI100_KEY=
KUAIDI100_CUSTOMER=
```

### 5.5 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000 查看网站

### 5.6 构建生产版本

```bash
npm run build
npm start
```

---

## 常见问题

### Q: 短信发送失败怎么办？

A: 检查以下几点：
1. 阿里云短信签名和模板是否审核通过
2. AccessKey 是否正确
3. 账户是否有余额
4. 查看 Vercel Functions 日志

### Q: 物流查询不显示数据？

A: 
1. 检查 KUAIDI100_KEY 和 KUAIDI100_CUSTOMER 是否正确
2. 可能是免费额度用完了
3. 不配置时会使用模拟数据

### Q: 图片上传失败？

A: 
1. 检查 Supabase Storage bucket 是否创建
2. 确认 bucket 名称是 `product-photos`
3. 检查 bucket 是否设置为 public

### Q: 订单不显示在"我的订单"？

A: 
1. 检查 web_orders 表是否有 member_id 字段
2. 确认登录状态正确
3. 查看浏览器控制台是否有报错

---

## 配置清单

部署前确认以下事项：

- [ ] Supabase 项目创建完成
- [ ] 所有 SQL Schema 已执行
- [ ] Storage bucket 创建（product-photos，公开）
- [ ] 环境变量配置完成
- [ ] 阿里云短信（可选）
- [ ] 快递100 API（可选）
- [ ] Vercel 部署成功
- [ ] 自定义域名配置（可选）
