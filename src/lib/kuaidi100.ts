// 快递100 API 集成
// 需要在环境变量中配置：
// KUAIDI100_KEY
// KUAIDI100_CUSTOMER

interface TrackingInfo {
  time: string;
  location: string;
  message: string;
}

interface TrackingResult {
  success: boolean;
  status: string; // pending, shipped, in_transit, delivered, cancelled
  stateCode: number; // 快递100返回的状态码
  tracks: TrackingInfo[];
  error?: string;
}

// 快递100状态码映射
const STATUS_MAP: Record<number, string> = {
  0: 'in_transit',   // 在途
  1: 'shipped',      // 揽收
  2: 'in_transit',   // 疑难
  3: 'delivered',    // 已签收
  4: 'pending',      // 退签
  5: 'in_transit',   // 派件
  6: 'in_transit',   // 退回
  7: 'in_transit',   // 转投
  10: 'in_transit',  // 待清关
  11: 'in_transit',  // 清关中
  12: 'in_transit',  // 已清关
  13: 'in_transit',  // 清关异常
  14: 'in_transit',  // 拒签
};

/**
 * 查询物流信息
 * @param trackingNumber 快递单号
 */
export async function queryTracking(trackingNumber: string): Promise<TrackingResult> {
  // 开发阶段：返回模拟数据
  console.log(`[Kuaidi100] 查询物流: ${trackingNumber}`);
  
  const key = process.env.KUAIDI100_KEY;
  const customer = process.env.KUAIDI100_CUSTOMER;
  
  // 如果没有配置，返回模拟数据
  if (!key || !customer) {
    console.log('[Kuaidi100] 未配置API，使用模拟模式');
    return {
      success: true,
      status: 'in_transit',
      stateCode: 5,
      tracks: [
        { time: '2026-06-25 10:00', location: '杭州', message: '快件已揽收' },
        { time: '2026-06-25 14:00', location: '杭州转运中心', message: '快件已发出，下一站：北京' },
        { time: '2026-06-26 08:00', location: '北京转运中心', message: '快件已到达' },
      ]
    };
  }
  
  try {
    // 快递100实时查询API
    // 参考：https://www.kuaidi100.com/openapi/api_realtime.shtml
    
    const param = JSON.stringify({
      com: 'auto', // auto表示自动识别快递公司
      num: trackingNumber
    });
    
    const sign = createSign(param, key, customer);
    
    const response = await fetch('https://poll.kuaidi100.com/poll/query.do', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        customer,
        sign,
        param
      })
    });
    
    const result = await response.json();
    
    if (result.status === '200' || result.returnCode === '200') {
      const stateCode = result.state || 0;
      const status = STATUS_MAP[stateCode] || 'in_transit';
      
      return {
        success: true,
        status,
        stateCode,
        tracks: (result.data || []).map((item: any) => ({
          time: item.time || item.ftime || '',
          location: item.location || '',
          message: item.context || ''
        }))
      };
    } else {
      return {
        success: false,
        status: 'pending',
        stateCode: 0,
        tracks: [],
        error: result.message || '查询失败'
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '物流查询异常';
    console.error('[Kuaidi100] 查询失败:', msg);
    return {
      success: false,
      status: 'pending',
      stateCode: 0,
      tracks: [],
      error: msg
    };
  }
}

/**
 * 生成快递100签名
 */
function createSign(param: string, key: string, customer: string): string {
  // 签名 = MD5(param + key + customer)，取32位小写
  const str = param + key + customer;
  // 简化处理：使用 Node.js crypto 模块
  // 实际部署时需要安装 crypto-js 或使用 Node.js 内置 crypto
  return simpleMd5(str);
}

/**
 * 简化MD5实现（开发用）
 * 实际部署时应使用 crypto 模块
 */
function simpleMd5(str: string): string {
  // 这里应该使用真实的 MD5 算法
  // 开发阶段返回模拟签名
  if (typeof window !== 'undefined') {
    // 浏览器环境，无法使用 crypto
    return 'mock_sign_' + str.length;
  }
  
  // Node.js 环境
  try {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
  } catch {
    return 'mock_sign_' + str.length;
  }
}

/**
 * 根据状态码获取状态文本
 */
export function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    'pending': '未发货',
    'shipped': '已发货',
    'in_transit': '运输中',
    'delivered': '已签收',
    'cancelled': '已取消'
  };
  return texts[status] || '未知';
}