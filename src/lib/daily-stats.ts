// 渠道化每日统计共享计算模块
// 抖音(douyin): 正常面单号 + 无面单号(历史遗留, 渠道按抖音算) + 网页下单(tracking_number 为空)
// 多多(duoduo): 面单号为"多多+日期"格式
// 利进口径: total_profit = 毛利(售价-成本) - 当日退货损失(按渠道分摊), 快递费/平台抽点单独存字段
// 快递费: 抖音按面单分档(≤4件 rate1 / ≤7件 rate2 / >7件 rate3, 无面单号不计), 多多按件数×单价
// 平台抽点: 抖音按销售额×比例(无门槛), 多多按销售额×比例(无门槛)

export type Channel = "douyin" | "duoduo";

export interface ChannelRates {
  rate1: number; // 抖音面单 ≤4件 每单快递费
  rate2: number; // 抖音面单 5-7件 每单快递费
  rate3: number; // 抖音面单 >7件 每单快递费
  platformRate: number; // 抖音平台抽点(%)
  ddRate: number; // 多多平台抽点(%)
  ddShip: number; // 多多每件快递费(元)
}

export interface DailyChannelRow {
  date: string;
  channel: Channel;
  total_amount: number;
  total_quantity: number;
  total_profit: number; // 已扣当日退货损失
  return_loss: number; // 当日退货损失额(毛利 = total_profit + return_loss)
  shipping_fee: number;
  platform_fee: number;
}

export interface SalesRowLike {
  sale_id?: unknown;
  sell_price?: unknown;
  quantity?: unknown;
  tracking_number?: unknown;
  registration_date?: unknown;
  order_time?: unknown;
}
export interface InboundRowLike {
  sale_id?: unknown;
  cost_price?: unknown;
}
export interface ReturnRowLike {
  sale_id?: unknown;
  quantity?: unknown;
  return_price?: unknown;
  return_time?: unknown;
  created_at?: unknown;
}

// 时区安全取日期(北京时间): 数据库返回 UTC ISO 字符串, 直接 slice 会差一天
export function toDateStrBJ(v: unknown): string {
  if (!v) return "";
  try {
    return new Date(v as string).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  } catch {
    return String(v).slice(0, 10);
  }
}

// 渠道判定: 面单号含"多多" → 多多; 其余(正常面单/无面单/网页下单) → 抖音
export function channelOfTracking(tn: unknown): Channel {
  return String(tn || "").includes("多多") ? "duoduo" : "douyin";
}

export function computeDailyChannelStats(
  sales: SalesRowLike[],
  inbound: InboundRowLike[],
  returns: ReturnRowLike[],
  rates: ChannelRates
): DailyChannelRow[] {
  // 成本映射: 编号首次出现的正成本价(与 platform-fee API 口径一致)
  const costMap = new Map<string, number>();
  for (const ib of inbound) {
    const sid = String(ib.sale_id || "").toUpperCase();
    const cp = Number(ib.cost_price) || 0;
    if (sid && cp > 0 && !costMap.has(sid)) costMap.set(sid, cp);
  }

  // 平均售价映射: 退货记录没登记退货价时用于估算损失
  const priceSumMap = new Map<string, number>();
  const qtySumMap = new Map<string, number>();
  for (const r of sales) {
    const sid = String(r.sale_id || "").toUpperCase();
    const sp = Number(r.sell_price) || 0;
    const q = Number(r.quantity) || 0;
    if (sid && sp > 0 && q > 0) {
      priceSumMap.set(sid, (priceSumMap.get(sid) || 0) + sp * q);
      qtySumMap.set(sid, (qtySumMap.get(sid) || 0) + q);
    }
  }

  // 渠道维度日聚合
  interface DayAgg {
    total_amount: number;
    total_quantity: number;
    total_profit: number;
    return_loss: number;
    trackingMap: Map<string, number>; // 抖音面单号 → 件数
  }
  const daily = new Map<string, Map<Channel, DayAgg>>();
  const getAgg = (date: string, ch: Channel): DayAgg => {
    let day = daily.get(date);
    if (!day) {
      day = new Map();
      daily.set(date, day);
    }
    let agg = day.get(ch);
    if (!agg) {
      agg = { total_amount: 0, total_quantity: 0, total_profit: 0, return_loss: 0, trackingMap: new Map() };
      day.set(ch, agg);
    }
    return agg;
  };

  // 1. 销售聚合(按登记日期, 无登记日期回退下单时间)
  // 同时记录每个编号每笔销售的(日期, 渠道, 件数), 供退货损失按时点渠道比例分摊:
  // 退货只应分摊给"退货日当天(含)之前"实际卖过的渠道, 避免后期才上多多渠道的款
  // 把早期退货也分摊到多多, 在多多无售卖的月份产生幽灵退货行
  const sidSales = new Map<string, { date: string; ch: Channel; qty: number }[]>();
  const chanQtyAll = new Map<string, { douyin: number; duoduo: number }>(); // 全量渠道比例(兜底用)
  for (const r of sales) {
    const date = toDateStrBJ(r.registration_date) || toDateStrBJ(r.order_time);
    if (!date) continue;
    const ch = channelOfTracking(r.tracking_number);
    const sid = String(r.sale_id || "").toUpperCase();
    const price = Number(r.sell_price) || 0;
    const qty = Number(r.quantity) || 0;
    const cost = sid ? costMap.get(sid) || 0 : 0;
    const agg = getAgg(date, ch);
    agg.total_amount += price * qty;
    agg.total_quantity += qty;
    agg.total_profit += (price - cost) * qty;
    if (ch === "douyin") {
      // 抖音快递费按面单分档, 只统计正常面单号(无面单号的历史数据不计快递费)
      const tn = String(r.tracking_number || "").trim();
      if (tn && tn !== "0" && !tn.includes("多多")) {
        agg.trackingMap.set(tn, (agg.trackingMap.get(tn) || 0) + qty);
      }
    }
    if (sid) {
      let arr = sidSales.get(sid);
      if (!arr) {
        arr = [];
        sidSales.set(sid, arr);
      }
      arr.push({ date, ch, qty });
      const cq = chanQtyAll.get(sid) || { douyin: 0, duoduo: 0 };
      cq[ch] += qty;
      chanQtyAll.set(sid, cq);
    }
  }

  // 2. 退货损失: 扣在退货发生日, 按(退货价或均价-成本)×件数计损失,
  // 编号两渠道都卖过时按"退货日(含)之前"各渠道累计售出件数比例分摊
  // (退货早于该编号所有销售记录时, 回退到全量渠道比例)。
  // 注意: 退货日当天无销售时也创建独立行(total_amount=0, total_quantity=0, total_profit=-loss),
  // 否则退货发生在"没卖货的日子"会漏扣。调用方需保护归档行:
  // upsert 前若表中已有同 (date, channel) 行且本次计算行为 0 销量, 则跳过该行不覆盖。
  for (const r of returns) {
    const date = toDateStrBJ(r.return_time || r.created_at);
    if (!date) continue;
    const sid = String(r.sale_id || "").toUpperCase();
    const qty = Number(r.quantity) || 0;
    if (qty <= 0) continue;
    const rp = Number(r.return_price) || 0;
    const avg = qtySumMap.has(sid) ? (priceSumMap.get(sid) || 0) / qtySumMap.get(sid)! : 0;
    const unitPrice = rp > 0 ? rp : avg;
    const cost = costMap.get(sid) || 0;
    const loss = (unitPrice - cost) * qty;

    // 时点渠道比例: 只统计退货日(含)之前卖出的部分
    let cq: { douyin: number; duoduo: number } | undefined;
    const salesList = sid ? sidSales.get(sid) : undefined;
    if (salesList) {
      let dy = 0;
      let dd = 0;
      for (const s of salesList) {
        if (s.date <= date) {
          if (s.ch === "douyin") dy += s.qty;
          else dd += s.qty;
        }
      }
      if (dy + dd > 0) cq = { douyin: dy, duoduo: dd };
    }
    if (!cq) cq = sid ? chanQtyAll.get(sid) : undefined;

    const ddShare = cq && cq.douyin + cq.duoduo > 0 ? cq.duoduo / (cq.douyin + cq.duoduo) : 0;
    const losses: [Channel, number][] =
      cq && cq.douyin > 0 && cq.duoduo > 0
        ? [["duoduo", loss * ddShare], ["douyin", loss * (1 - ddShare)]]
        : cq && cq.duoduo > 0 && cq.douyin === 0
          ? [["duoduo", loss]]
          : [["douyin", loss]];
    for (const [ch, l] of losses) {
      if (l === 0) continue;
      const agg = getAgg(date, ch);
      agg.total_profit -= l;
      agg.return_loss += l;
    }
  }

  // 3. 快递费 + 平台抽点(均无门槛)
  const rows: DailyChannelRow[] = [];
  for (const [date, day] of daily) {
    for (const [ch, agg] of day) {
      let shippingFee = 0;
      let platformFee = 0;
      if (ch === "douyin") {
        for (const [, qty] of agg.trackingMap) {
          if (qty <= 4) shippingFee += rates.rate1;
          else if (qty <= 7) shippingFee += rates.rate2;
          else shippingFee += rates.rate3;
        }
        platformFee = agg.total_amount * (rates.platformRate / 100);
      } else {
        shippingFee = agg.total_quantity * rates.ddShip;
        platformFee = agg.total_amount * (rates.ddRate / 100);
      }
      rows.push({
        date,
        channel: ch,
        total_amount: agg.total_amount,
        total_quantity: agg.total_quantity,
        total_profit: agg.total_profit,
        return_loss: agg.return_loss,
        shipping_fee: shippingFee,
        platform_fee: platformFee,
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}
