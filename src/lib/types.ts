/**
 * 核心数据库表类型定义
 * 替代 Record<string, any>[]，提供类型安全
 */

// 尺码列表
export const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180] as const;
export type Size = (typeof ALL_SIZES)[number];

// 尺码字段映射类型（size_80, size_90, ...）
type SizeFields = { [K in `size_${Size}`]: number };

// 入库记录
export interface InboundRecord extends Partial<SizeFields> {
  id: string;
  sale_id: string;
  name: string;
  manufacturer: string;
  cost_price: number;
  sell_price: number;
  total_stock: number;
  photo: string;
  shelf_no: string;
  inbound_date: string;
  created_at: string;
  updated_at: string;
}

// 售出记录
export interface SalesRecord {
  id: string;
  sale_id: string;
  product_name: string;
  size: number;
  quantity: number;
  sell_price: number;
  cost_price: number;
  profit: number;
  total_profit: number;
  photo: string;
  manufacturer: string;
  shelf_no: string;
  tracking_number: string;
  order_time: string;
  registration_date: string;
  notes: string;
  registrant: string;
  member_id: string;
  member_name: string;
  created_at: string;
}

// 退货记录
export interface ReturnRecord {
  id: string;
  sale_id: string;
  name: string;
  size: number;
  quantity: number;
  member_id: string;
  member_name: string;
  return_time: string;
  created_at: string;
}

// 会员
export interface Member {
  id: string;
  name: string;
  phone: string;
  password: string;
  role: "admin" | "operator" | "customer";
  is_online: boolean;
  last_online: string;
  address: string;
  recipient: string;
  recipient_phone: string;
  douyin: string;
  created_at: string;
}

// 售卖汇总
export interface SalesSummary extends Partial<SizeFields> {
  id: string;
  sale_id: string;
  name: string;
  photo: string;
  shelf_no: string;
  manufacturer: string;
  cost_price: number;
  sell_price: number;
  total_sold: number;
  total_revenue: number;
  sell_price_info: Record<string, unknown>;
  sales_count: number;
  updated_at: string;
  created_at: string;
}

// 退货汇总
export interface ReturnsSummary extends Partial<SizeFields> {
  id: string;
  sale_id: string;
  name: string;
  photo: string;
  shelf_no: string;
  manufacturer: string;
  cost_price: number;
  total_returned: number;
  total_return_amount: number;
  return_price_info: Record<string, unknown>;
  return_count: number;
  updated_at: string;
  created_at: string;
}

// 日统计
export interface SalesDailyStats {
  id: string;
  date: string;
  total_amount: number;
  total_quantity: number;
  total_profit: number;
  shipping_fee: number;
  platform_fee: number;
  created_at: string;
}

export interface ReturnsDailyStats {
  id: string;
  date: string;
  total_returned: number;
  created_at: string;
}

// 网页订单
export interface WebOrder {
  id: string;
  member_id: string;
  customer: string;
  address: string;
  recipient: string;
  recipient_phone: string;
  sale_id: string;
  size: number;
  quantity: number;
  sell_price: number;
  total_price: number;
  tracking_number: string;
  order_time: string;
  status: string;
  created_at: string;
}

// API 统一响应格式
export interface ApiResponse<T = unknown> {
  success?: boolean;
  error?: string;
  code?: string;
  data?: T;
  message?: string;
}

// 尺码字段名（如 "size_80"）
export type SizeFieldName = `size_${Size}`;
