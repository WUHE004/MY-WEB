/**
 * 环境变量校验
 * 在服务端模块加载时校验必需的环境变量，缺失时抛出明确错误
 */

type EnvVar = {
  key: string;
  required: boolean;
  description: string;
};

// 所有项目使用的环境变量清单
const ENV_VARS: EnvVar[] = [
  // 必需 - Supabase
  { key: "NEXT_PUBLIC_SUPABASE_URL", required: true, description: "Supabase 项目 URL" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", required: true, description: "Supabase 服务端密钥" },
  // 必需 - JWT 鉴权
  { key: "JWT_SECRET", required: false, description: "JWT 签名密钥（缺省时回退到 SUPABASE_SERVICE_ROLE_KEY）" },
  // 可选 - 快递查询
  { key: "KUAIDI100_KEY", required: false, description: "快递100 授权Key" },
  { key: "KUAIDI100_CUSTOMER", required: false, description: "快递100 客户身份标识" },
  // 可选 - 企业微信告警
  { key: "WECHAT_WEBHOOK_URL", required: false, description: "企业微信机器人 Webhook URL" },
  // 可选 - AI 图片生成
  { key: "AGNES_API_KEY", required: false, description: "Agnes AI 平台 API Key" },
  { key: "DOUBAO_API_KEY", required: false, description: "豆包 API Key" },
  { key: "DASHSCOPE_API_KEY", required: false, description: "通义千问 DashScope API Key" },
  // 可选 - 阿里云短信
  { key: "ALIYUN_SMS_ACCESS_KEY_ID", required: false, description: "阿里云短信 AccessKeyId" },
  { key: "ALIYUN_SMS_ACCESS_KEY_SECRET", required: false, description: "阿里云短信 AccessKeySecret" },
];

let validated = false;

function validateEnv() {
  if (validated) return;
  validated = true;

  const missing: string[] = [];
  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.key];
    if (envVar.required && !value) {
      missing.push(`${envVar.key} (${envVar.description})`);
    }
  }

  if (missing.length > 0) {
    console.warn(
      `[env] 缺少环境变量:\n${missing.map((m) => `  - ${m}`).join("\n")}\n` +
        "请在 Vercel 项目设置中配置。"
    );
  }
}

// 仅在服务端运行时校验（构建时跳过，避免预渲染输出噪音）
if (typeof window === "undefined" && process.env.NEXT_PHASE !== "phase-production-build") {
  validateEnv();
}

export { validateEnv };
