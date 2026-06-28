// 阿里云短信服务 SDK
// 需要在环境变量中配置：
// ALIYUN_SMS_ACCESS_KEY_ID
// ALIYUN_SMS_ACCESS_KEY_SECRET
// ALIYUN_SMS_SIGN_NAME (签名名称)
// ALIYUN_SMS_TEMPLATE_CODE (模板CODE)

interface SmsResult {
  success: boolean;
  error?: string;
}

/**
 * 发送短信验证码
 * @param phone 手机号
 * @param code 验证码
 */
export async function sendSmsCode(phone: string, code: string): Promise<SmsResult> {
  // 开发阶段：验证码直接打印到控制台，方便测试
  console.log(`[SMS] 发送验证码到 ${phone}: ${code}`);
  
  // 检查是否配置了阿里云短信服务
  const accessKeyId = process.env.ALIYUN_SMS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET;
  
  // 如果没有配置，返回模拟成功（开发环境）
  if (!accessKeyId || !accessKeySecret) {
    console.log('[SMS] 未配置阿里云短信服务，使用模拟模式');
    return { success: true };
  }
  
  // 实际部署时使用阿里云 SDK
  try {
    // 动态导入阿里云 SDK（避免开发环境报错）
    const Core = await import('@alicloud/pop-core');
    
    const client = new Core.default({
      accessKeyId,
      accessKeySecret,
      endpoint: 'https://dysmsapi.aliyuncs.com',
      apiVersion: '2017-05-25'
    });
    
    const params = {
      PhoneNumbers: phone,
      SignName: process.env.ALIYUN_SMS_SIGN_NAME || '',
      TemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || '',
      TemplateParam: JSON.stringify({ code })
    };
    
    const result = await client.request('SendSms', params, { method: 'POST' }) as { Code: string; Message?: string };

    if (result.Code === 'OK') {
      return { success: true };
    } else {
      return { success: false, error: result.Message || '发送失败' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '短信发送异常';
    console.error('[SMS] 发送失败:', msg);
    return { success: false, error: msg };
  }
}

/**
 * 生成6位随机验证码
 */
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}