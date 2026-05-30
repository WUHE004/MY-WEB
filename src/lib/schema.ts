import { getDb, saveDb } from "./db";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  platform TEXT NOT NULL DEFAULT '淘宝',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  followers INTEGER NOT NULL DEFAULT 0,
  posts INTEGER NOT NULL DEFAULT 0,
  engagement REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  avatar TEXT NOT NULL DEFAULT '',
  growth REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  short_url TEXT NOT NULL,
  platform TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monthly_revenue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  revenue REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS category_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS platform_revenue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  revenue REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0
);
`;

const SEED_PRODUCTS = [
  { id: "1", name: "无线蓝牙耳机 Pro", sku: "SKU-001", category: "数码电子", price: 299, stock: 156, status: "active", platform: "淘宝" },
  { id: "2", name: "智能手表 Series 8", sku: "SKU-002", category: "数码电子", price: 1999, stock: 89, status: "active", platform: "京东" },
  { id: "3", name: "便携充电宝 20000mAh", sku: "SKU-003", category: "数码电子", price: 129, stock: 234, status: "active", platform: "拼多多" },
  { id: "4", name: "机械键盘 RGB", sku: "SKU-004", category: "电脑配件", price: 459, stock: 67, status: "low", platform: "淘宝" },
  { id: "5", name: "降噪耳机 XM5", sku: "SKU-005", category: "数码电子", price: 2499, stock: 45, status: "low", platform: "京东" },
  { id: "6", name: "USB-C 扩展坞", sku: "SKU-006", category: "电脑配件", price: 199, stock: 0, status: "out", platform: "抖音" },
  { id: "7", name: "手机支架 360°旋转", sku: "SKU-007", category: "手机配件", price: 39, stock: 500, status: "active", platform: "小红书" },
  { id: "8", name: "Type-C 快充线", sku: "SKU-008", category: "手机配件", price: 29, stock: 320, status: "active", platform: "拼多多" },
];

const SEED_ACCOUNTS = [
  { id: "1", name: "数码好物推荐", platform: "小红书", handle: "@digital_best", followers: 45200, posts: 156, engagement: 8.5, status: "active", avatar: "bg-[#FF6B7A]", growth: 12.3 },
  { id: "2", name: "科技测评室", platform: "抖音", handle: "@tech_review", followers: 128000, posts: 89, engagement: 6.2, status: "active", avatar: "bg-[#171717]", growth: 25.6 },
  { id: "3", name: "好物分享君", platform: "淘宝直播", handle: "@haowu_share", followers: 23000, posts: 234, engagement: 4.8, status: "warning", avatar: "bg-[#FFC93C]", growth: -2.1 },
  { id: "4", name: "极客数码", platform: "B站", handle: "@geek_digital", followers: 67000, posts: 67, engagement: 10.2, status: "active", avatar: "bg-[#4A90E2]", growth: 18.9 },
  { id: "5", name: "每日好货", platform: "微博", handle: "@daily_goods", followers: 15600, posts: 456, engagement: 3.5, status: "active", avatar: "bg-[#7B61FF]", growth: 5.4 },
];

const SEED_LINKS = [
  { id: "1", name: "夏季促销-蓝牙耳机", url: "https://item.taobao.com/item.htm?id=123456", short_url: "https://kucun.gg/a1b2c3", platform: "淘宝", clicks: 3420, conversions: 156, status: "active" },
  { id: "2", name: "新品首发-智能手表", url: "https://item.jd.com/123456.html", short_url: "https://kucun.gg/d4e5f6", platform: "京东", clicks: 2156, conversions: 89, status: "active" },
  { id: "3", name: "限时秒杀-充电宝", url: "https://mobile.yangkeduo.com/goods.html?goods_id=123", short_url: "https://kucun.gg/g7h8i9", platform: "拼多多", clicks: 5678, conversions: 234, status: "active" },
  { id: "4", name: "直播专享-键盘", url: "https://www.douyin.com/", short_url: "https://kucun.gg/j0k1l2", platform: "抖音", clicks: 1890, conversions: 67, status: "paused" },
  { id: "5", name: "种草笔记-手机支架", url: "https://www.xiaohongshu.com/", short_url: "https://kucun.gg/m3n4o5", platform: "小红书", clicks: 1234, conversions: 45, status: "active" },
];

const SEED_MONTHLY = [
  { month: "1月", revenue: 32000, cost: 24000 },
  { month: "2月", revenue: 35000, cost: 26000 },
  { month: "3月", revenue: 38000, cost: 27000 },
  { month: "4月", revenue: 42000, cost: 30000 },
  { month: "5月", revenue: 40000, cost: 28000 },
  { month: "6月", revenue: 48320, cost: 32000 },
];

const SEED_TRANSACTIONS = [
  { id: "TRX-001", type: "income", amount: 2990, description: "蓝牙耳机 Pro x10", date: "2024-06-15", platform: "淘宝" },
  { id: "TRX-002", type: "expense", amount: 1500, description: "采购成本-充电宝", date: "2024-06-14", platform: "拼多多" },
  { id: "TRX-003", type: "income", amount: 5997, description: "智能手表 x3", date: "2024-06-14", platform: "京东" },
  { id: "TRX-004", type: "expense", amount: 800, description: "物流费用", date: "2024-06-13", platform: "-" },
  { id: "TRX-005", type: "income", amount: 1290, description: "充电宝 x10", date: "2024-06-13", platform: "拼多多" },
  { id: "TRX-006", type: "expense", amount: 2000, description: "广告投放-抖音", date: "2024-06-12", platform: "抖音" },
  { id: "TRX-007", type: "income", amount: 918, description: "手机支架 x23", date: "2024-06-12", platform: "小红书" },
  { id: "TRX-008", type: "expense", amount: 500, description: "包装材料", date: "2024-06-11", platform: "-" },
];

const SEED_CATEGORY = [
  { name: "数码电子", value: 45, color: "#FF6B7A" },
  { name: "电脑配件", value: 25, color: "#4A90E2" },
  { name: "手机配件", value: 20, color: "#FFC93C" },
  { name: "其他", value: 10, color: "#7B61FF" },
];

const SEED_PLATFORM_REVENUE = [
  { name: "淘宝", revenue: 18000, cost: 12000 },
  { name: "京东", revenue: 12000, cost: 8000 },
  { name: "拼多多", revenue: 8000, cost: 5000 },
  { name: "抖音", revenue: 6000, cost: 4000 },
  { name: "小红书", revenue: 4320, cost: 3000 },
];

export async function initDatabase(): Promise<void> {
  const db = await getDb();
  db.exec(SCHEMA_SQL);

  const count = db.exec("SELECT COUNT(*) as c FROM products")[0]?.values[0]?.[0] as number | undefined;
  if (count && count > 0) return;

  const insertProduct = db.prepare(
    "INSERT INTO products (id, name, sku, category, price, stock, status, platform) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertAccount = db.prepare(
    "INSERT INTO accounts (id, name, platform, handle, followers, posts, engagement, status, avatar, growth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertLink = db.prepare(
    "INSERT OR REPLACE INTO links (id, name, url, short_url, platform, clicks, conversions, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertMonthly = db.prepare(
    "INSERT INTO monthly_revenue (month, revenue, cost) VALUES (?, ?, ?)"
  );
  const insertTransaction = db.prepare(
    "INSERT OR REPLACE INTO transactions (id, type, amount, description, date, platform) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertCategory = db.prepare(
    "INSERT INTO category_data (name, value, color) VALUES (?, ?, ?)"
  );
  const insertPlatform = db.prepare(
    "INSERT INTO platform_revenue (name, revenue, cost) VALUES (?, ?, ?)"
  );

  for (const p of SEED_PRODUCTS) {
    insertProduct.run([p.id, p.name, p.sku, p.category, p.price, p.stock, p.status, p.platform]);
  }
  for (const a of SEED_ACCOUNTS) {
    insertAccount.run([a.id, a.name, a.platform, a.handle, a.followers, a.posts, a.engagement, a.status, a.avatar, a.growth]);
  }
  for (const l of SEED_LINKS) {
    insertLink.run([l.id, l.name, l.url, l.short_url, l.platform, l.clicks, l.conversions, l.status]);
  }
  for (const m of SEED_MONTHLY) {
    insertMonthly.run([m.month, m.revenue, m.cost]);
  }
  for (const t of SEED_TRANSACTIONS) {
    insertTransaction.run([t.id, t.type, t.amount, t.description, t.date, t.platform]);
  }
  for (const c of SEED_CATEGORY) {
    insertCategory.run([c.name, c.value, c.color]);
  }
  for (const pr of SEED_PLATFORM_REVENUE) {
    insertPlatform.run([pr.name, pr.revenue, pr.cost]);
  }

  saveDb();
}