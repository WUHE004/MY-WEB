# 新功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 或 superpowers:executing-plans 来执行此计划。

**Goal:** 为点冰童装库存管理系统添加短信验证码登录/注册、支付功能、物流管理和用户订单查看功能

**Architecture:** 
- 短信验证：使用阿里云短信服务API
- 支付功能：下单后展示收款码图片（管理员可配置）
- 物流查询：使用快递100 API
- 订单隔离：基于 member_id 的数据过滤

**Tech Stack:** Next.js 16, React, Tailwind CSS, Supabase, 阿里云短信 SDK, 快递100 API

## Global Constraints

- 所有新增UI必须遵循 Neubrutalism 风格（3px黑色边框、12px圆角、硬边阴影）
- 所有页面使用 PageWrapper 组件包裹
- 所有输入框使用 neo-input 类
- 所有按钮使用 neo-btn 类
- 验证码有效期 5 分钟
- 快递100 免费额度 100次/天
- 阿里云短信免费额度约 100条

---

## Part 1: 短信验证码系统

### Task 1: 创建短信验证码相关数据库表

**Files:**
- Create: `src/lib/sms-schema.sql`

**Interfaces:**
- Produces: sms_codes 表

**SQL Schema:**

```sql
-- 短信验证码记录表
CREATE TABLE IF NOT EXISTS sms_codes (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('register', 'login', 'reset_password')),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_codes_phone ON sms_codes(phone);
CREATE INDEX IF NOT EXISTS idx_sms_codes_expires ON sms_codes(expires_at);

-- 更新 members 表，添加 phone 字段（如果不存在）
-- 并将 email 字段改为非必填
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_email_key;
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone TEXT UNIQUE;
ALTER TABLE members ALTER COLUMN email DROP NOT NULL;
```

**Commit:** `feat: 创建短信验证码数据库表`

---

### Task 2: 创建短信发送和验证 API

**Files:**
- Create: `src/app/api/sms/send/route.ts`
- Create: `src/app/api/sms/verify/route.ts`
- Create: `src/lib/aliyun-sms.ts`

**Interfaces:**
- Produces: `/api/sms/send` - 发送验证码
- Produces: `/api/sms/verify` - 验证验证码

**API 1: 发送验证码 (`/api/sms/send`)**

```typescript
// src/app/api/sms/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSmsCode } from "@/lib/aliyun-sms";

export async function POST(request: NextRequest) {
  try {
    const { phone, type } = await request.json();
    
    if (!phone || !/^\d{11}$/.test(phone)) {
      return NextResponse.json({ error: "请输入有效的11位手机号" }, { status: 400 });
    }

    // 检查发送频率限制（1分钟内只能发送1次）
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentCodes } = await supabase
      .from("sms_codes")
      .select("id")
      .eq("phone", phone)
      .gte("created_at", oneMinuteAgo);

    if (recentCodes && recentCodes.length > 0) {
      return NextResponse.json({ error: "验证码发送过于频繁，请稍后再试" }, { status: 400 });
    }

    // 生成6位随机验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 发送短信（阿里云）
    const smsResult = await sendSmsCode(phone, code);
    if (!smsResult.success) {
      return NextResponse.json({ error: smsResult.error || "短信发送失败" }, { status: 500 });
    }

    // 存储验证码记录（有效期5分钟）
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await supabase.from("sms_codes").insert({
      phone,
      code,
      type,
      expires_at: expiresAt,
    });

    return NextResponse.json({ success: true, message: "验证码已发送" });
  } catch (err) {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
```

**API 2: 验证验证码 (`/api/sms/verify`)**

```typescript
// src/app/api/sms/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { phone, code, type } = await request.json();

    if (!phone || !code) {
      return NextResponse.json({ error: "手机号和验证码不能为空" }, { status: 400 });
    }

    // 查找未使用的验证码
    const { data: records, error } = await supabase
      .from("sms_codes")
      .select("*")
      .eq("phone", phone)
      .eq("code", code)
      .eq("type", type)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !records || records.length === 0) {
      return NextResponse.json({ error: "验证码无效或已过期" }, { status: 400 });
    }

    // 标记验证码已使用
    await supabase
      .from("sms_codes")
      .update({ used: true })
      .eq("id", records[0].id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
```

**阿里云短信 SDK (`src/lib/aliyun-sms.ts`)**

```typescript
// src/lib/aliyun-sms.ts
// 使用阿里云短信服务发送验证码
// 需要在 Supabase 或环境变量中配置：
// ALIYUN_SMS_ACCESS_KEY_ID
// ALIYUN_SMS_ACCESS_KEY_SECRET
// ALIYUN_SMS_SIGN_NAME (签名名称)
// ALIYUN_SMS_TEMPLATE_CODE (模板CODE)

interface SmsResult {
  success: boolean;
  error?: string;
}

export async function sendSmsCode(phone: string, code: string): Promise<SmsResult> {
  // TODO: 需要用户配置阿里云短信服务
  // 当前返回模拟成功，实际部署时需要接入阿里云 SDK
  
  // 开发阶段：验证码直接打印到控制台
  console.log(`[SMS Mock] 发送验证码到 ${phone}: ${code}`);
  
  // 实际部署时使用阿里云 SDK:
  // const Core = require('@alicloud/pop-core');
  // const client = new Core({
  //   accessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID,
  //   accessKeySecret: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET,
  //   endpoint: 'https://dysmsapi.aliyuncs.com',
  //   apiVersion: '2017-05-25'
  // });
  // 
  // const params = {
  //   PhoneNumbers: phone,
  //   SignName: process.env.ALIYUN_SMS_SIGN_NAME,
  //   TemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE,
  //   TemplateParam: JSON.stringify({ code })
  // };
  // 
  // const result = await client.request('SendSms', params, { method: 'POST' });
  // return { success: result.Code === 'OK' };

  return { success: true };
}
```

**注意:** 需要在 `.env.local` 中添加阿里云短信配置：
```
ALIYUN_SMS_ACCESS_KEY_ID=your_key_id
ALIYUN_SMS_ACCESS_KEY_SECRET=your_key_secret
ALIYUN_SMS_SIGN_NAME=点冰童装
ALIYUN_SMS_TEMPLATE_CODE=SMS_123456789
```

**Commit:** `feat: 创建短信验证码API`

---

### Task 3: 更新登录页面

**Files:**
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `/api/sms/send`, `/api/sms/verify`
- Produces: 短信验证码登录、忘记密码功能

**修改内容:**

1. **添加"手机验证码登录"模式**
   - 新增 mode: "sms_login" 
   - 手机号输入 + 验证码输入 + 发送按钮

2. **添加"忘记密码"功能**
   - 新增 mode: "reset_password"
   - 手机号 + 验证码 + 新密码

3. **更新注册流程**
   - 必须先验证手机号才能注册
   - 添加发送验证码按钮和验证码输入框

**UI 更改（保持 Neubrutalism 风格）:**

```typescript
// 发送验证码按钮样式
<button
  onClick={handleSendCode}
  disabled={sendingCode || countdown > 0}
  className="neo-btn px-4 py-2 text-sm"
>
  {countdown > 0 ? `${countdown}秒后重发` : '发送验证码'}
</button>

// 验证码输入框
<input
  type="text"
  value={smsCode}
  onChange={(e) => setSmsCode(e.target.value)}
  maxLength={6}
  className="neo-input w-full"
  placeholder="请输入6位验证码"
/>
```

**Commit:** `feat: 登录页添加短信验证码登录和忘记密码功能`

---

### Task 4: 更新个人信息页添加改密码功能

**Files:**
- Modify: `src/app/account/page.tsx` 或 `src/app/profile/page.tsx`

**Interfaces:**
- Consumes: `/api/sms/send`, `/api/sms/verify`

**修改内容:**

1. 添加"修改密码"按钮
2. 弹出模态框：
   - 显示当前手机号（不可编辑）
   - 发送验证码按钮
   - 验证码输入框
   - 新密码输入框
   - 确认修改按钮

**Commit:** `feat: 个人信息页添加短信改密码功能`

---

## Part 2: 支付功能（收款码展示）

### Task 5: 扩展 web_orders 表和创建支付页面

**Files:**
- Create: `src/lib/payment-schema.sql`
- Create: `src/app/payment/page.tsx`
- Modify: `src/app/api/web-orders/route.ts`

**SQL Schema:**

```sql
-- 扩展 web_orders 表
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT '';
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS member_id TEXT DEFAULT '';

-- 收款码配置表
CREATE TABLE IF NOT EXISTS payment_qr_codes (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('wechat', 'alipay')),
  image_url TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入默认收款码记录（管理员需上传实际图片）
INSERT INTO payment_qr_codes (type, image_url, description) VALUES
  ('wechat', '', '微信收款码'),
  ('alipay', '', '支付宝收款码')
ON CONFLICT DO NOTHING;
```

**支付页面 (`src/app/payment/page.tsx`):**

```typescript
// 下单成功后跳转到此页面
// 显示：订单信息、收款码图片、支付说明

// 功能：
// 1. 从URL参数获取订单ID
// 2. 显示订单详情（商品、金额、收货信息）
// 3. 显示微信/支付宝收款码图片
// 4. 用户扫码支付后点击"已支付"
// 5. 更新订单状态为"已支付"
```

**修改下单流程:**

```typescript
// src/app/products/page.tsx 中 submitOrder 函数修改
// 下单成功后跳转到支付页面：
window.location.href = `/payment?order_id=${orderId}`;
```

**Commit:** `feat: 创建支付页面（收款码展示）`

---

### Task 6: 创建收款码管理页面

**Files:**
- Create: `src/app/settings/payment/page.tsx`
- Create: `src/app/api/payment-qr/route.ts`

**功能:**

管理员可以：
1. 上传微信收款码图片
2. 上传支付宝收款码图片
3. 图片存储到 Supabase Storage

**Commit:** `feat: 收款码管理页面`

---

## Part 3: 物流管理

### Task 7: 扩展订单表添加物流字段

**Files:**
- Create: `src/lib/shipping-schema.sql`

**SQL Schema:**

```sql
-- 扩展 web_orders 表
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS tracking_number TEXT DEFAULT '';
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'pending';
-- shipping_status: pending, shipped, in_transit, delivered, cancelled

-- 物流追踪记录表
CREATE TABLE IF NOT EXISTS shipping_tracks (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES web_orders(id),
  tracking_number TEXT NOT NULL,
  status TEXT NOT NULL,
  location TEXT DEFAULT '',
  time TEXT DEFAULT '',
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Commit:** `feat: 添加物流相关数据库字段`

---

### Task 8: 创建快递100 API集成

**Files:**
- Create: `src/lib/kuaidi100.ts`
- Create: `src/app/api/shipping/query/route.ts`

**快递100 SDK (`src/lib/kuaidi100.ts`):**

```typescript
// 快递100 API 集成
// 需要配置：KUAIDI100_KEY, KUAIDI100_CUSTOMER

interface TrackingResult {
  success: boolean;
  status: string; // pending, shipped, in_transit, delivered
  tracks: Array<{
    time: string;
    location: string;
    message: string;
  }>;
}

export async function queryTracking(trackingNumber: string): Promise<TrackingResult> {
  // 快递100 API 调用
  // 参考：https://www.kuaidi100.com/openapi/
  
  // 开发阶段返回模拟数据
  return {
    success: true,
    status: 'in_transit',
    tracks: [
      { time: '2026-06-25 10:00', location: '杭州', message: '已揽收' },
      { time: '2026-06-25 14:00', location: '杭州转运中心', message: '已发出' },
    ]
  };
}
```

**物流查询 API (`/api/shipping/query`):**

```typescript
// GET /api/shipping/query?tracking_number=xxx
// 返回物流追踪信息
```

**Commit:** `feat: 创建快递100物流查询API`

---

### Task 9: 创建后台物流管理页面

**Files:**
- Modify: `src/app/products/admin/page.tsx` 或创建独立页面

**功能:**

管理员可以：
1. 查看所有网页订单列表
2. 点击订单查看详情
3. 填写物流单号
4. 自动查询物流状态并显示
5. 手动更新物流状态（未发货/已发货/待签收/已签收）
6. 删除订单 → 库存自动恢复

**UI 设计:**

```
订单列表：
┌─────────────────────────────────────────────────────────┐
│ ID | 顾客 | 商品 | 金额 | 状态 | 物流 | 操作           │
├─────────────────────────────────────────────────────────┤
│ 1  | 张三 | T恤  | ¥89 | 待发货 | - | [发货] [删除]   │
│ 2  | 李四 | 裤子 | ¥128| 已发货 | SF123 | [查看]      │
│ 3  | 王五 | 卫衣 | ¥168| 已签收 | YT456 | [查看]      │
└─────────────────────────────────────────────────────────┘

订单详情弹窗：
┌─────────────────────────────────────────────────────────┐
│ 订单详情                                    [关闭]      │
├─────────────────────────────────────────────────────────┤
│ 商品信息: [图片] T恤 - 100码 - 1件                     │
│ 收货信息: 张三 | 138xxxx | 北京市朝阳区xxx             │
│ 物流单号: [输入框] SF1234567890                        │
│ 物流状态: [下拉选择] 已发货                            │
│ 物流轨迹:                                              │
│   2026-06-25 10:00 杭州 - 已揽收                      │
│   2026-06-25 14:00 杭州转运中心 - 已发出               │
│                                                        │
│ [查询物流] [更新状态]                                  │
└─────────────────────────────────────────────────────────┘
```

**Commit:** `feat: 后台物流管理页面`

---

## Part 4: 用户订单查看

### Task 10: 创建用户订单页面

**Files:**
- Create: `src/app/my-orders/page.tsx`
- Create: `src/app/api/my-orders/route.ts`

**功能:**

顾客可以：
1. 查看自己的订单列表
2. 查看订单详情
3. 查看物流状态

**API (`/api/my-orders`):**

```typescript
// GET /api/my-orders?member_id=xxx
// 只返回该用户的订单，数据隔离
```

**UI 设计:**

```
订单列表：
┌─────────────────────────────────────────────────────────┐
│ 我的订单                                                │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐│
│ │ [图片] T恤 - 100码 x1                               ││
│ │ ¥89 | 已发货                                        ││
│ │ 物流: SF1234567890                                  ││
│ │ [查看详情]                                          ││
│ └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Commit:** `feat: 用户订单查看页面`

---

### Task 11: 在商品页添加订单按钮

**Files:**
- Modify: `src/app/products/page.tsx`

**修改内容:**

1. 在搜索框右侧添加"我的订单"按钮
2. 只有登录用户（customer 或 admin）才能看到
3. 点击跳转到 `/my-orders`

```typescript
// 在搜索框后添加按钮
{isLoggedIn && (
  <Link
    href="/my-orders"
    className="neo-btn neo-btn-primary px-4 py-2 text-xs"
  >
    <Package className="h-4 w-4 mr-1" />
    我的订单
  </Link>
)}
```

**Commit:** `feat: 商品页添加订单查看按钮`

---

## Part 5: 删除订单恢复库存

### Task 12: 实现删除订单恢复库存逻辑

**Files:**
- Modify: `src/app/api/web-orders/route.ts`

**DELETE 逻辑:**

```typescript
// DELETE /api/web-orders?id=xxx
// 1. 获取订单详情
// 2. 删除 web_orders 记录
// 3. 删除对应的 sales_records 记录
// 4. 更新 summary 表库存（自动恢复）
```

**Commit:** `feat: 删除订单恢复库存功能`

---

## File Structure Summary

```
新增文件:
├── src/lib/
│   ├── sms-schema.sql           # 短信验证码表
│   ├── payment-schema.sql       # 支付相关表
│   ├── shipping-schema.sql      # 物流相关表
│   ├── aliyun-sms.ts            # 阿里云短信SDK
│   └── kuaidi100.ts             # 快递100 SDK
├── src/app/api/
│   ├── sms/send/route.ts        # 发送验证码
│   ├── sms/verify/route.ts      # 验证验证码
│   ├── payment-qr/route.ts      # 收款码管理
│   ├── shipping/query/route.ts  # 物流查询
│   └── my-orders/route.ts       # 用户订单API
├── src/app/
│   ├── payment/page.tsx         # 支付页面
│   ├── my-orders/page.tsx       # 用户订单页面
│   └── settings/payment/page.tsx # 收款码管理

修改文件:
├── src/app/login/page.tsx       # 登录页（短信验证）
├── src/app/products/page.tsx    # 商品页（订单按钮）
├── src/app/products/admin/page.tsx # 后台（物流管理）
├── src/app/api/web-orders/route.ts # 下单API（支付状态、删除恢复库存）
├── src/app/account/page.tsx     # 个人信息页（改密码）
```

---

## Verification Steps

1. **短信验证码**
   - 测试发送验证码API
   - 测试验证验证码API
   - 测试注册流程（必须验证手机号）
   - 测试忘记密码流程

2. **支付功能**
   - 测试下单后跳转支付页面
   - 测试收款码显示
   - 测试"已支付"状态更新

3. **物流管理**
   - 测试填写物流单号
   - 测试物流查询API
   - 测试状态更新

4. **订单查看**
   - 测试用户只能看到自己的订单
   - 测试物流信息显示

5. **删除恢复库存**
   - 测试删除订单后库存恢复

---

## 环境配置需求

需要在 `.env.local` 或 Supabase 中配置：

```bash
# 阿里云短信（需要用户申请）
ALIYUN_SMS_ACCESS_KEY_ID=your_key_id
ALIYUN_SMS_ACCESS_KEY_SECRET=your_key_secret
ALIYUN_SMS_SIGN_NAME=点冰童装
ALIYUN_SMS_TEMPLATE_CODE=SMS_xxxxxxx

# 快递100（免费额度100次/天）
KUAIDI100_KEY=your_key
KUAIDI100_CUSTOMER=your_customer_id
```

---

## 执行顺序建议

建议按以下顺序执行：

1. **Phase 1: 数据库表** (Tasks 1, 5, 7) - 先创建所有表结构
2. **Phase 2: API层** (Tasks 2, 6, 8, 10, 12) - 创建所有API
3. **Phase 3: 前端页面** (Tasks 3, 4, 9, 10, 11) - 更新和创建页面
4. **Phase 4: 测试验证** - 完整流程测试

---

## 注意事项

1. **阿里云短信配置**：需要用户自己去阿里云申请短信服务，创建签名和模板
2. **收款码图片**：需要用户上传自己的微信/支付宝收款码图片
3. **快递100配置**：需要用户去快递100官网申请API Key
4. **UI统一**：所有新增组件必须使用 neo-btn、neo-input、neo-card 类