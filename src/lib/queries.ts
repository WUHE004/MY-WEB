import { getDbSync, scheduleSave } from "./db";
import type { SqlValue } from "sql.js";

function rowToObject<T>(columns: string[], values: SqlValue[]): T {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = values[i];
  });
  return obj as T;
}

function queryAll<T>(sql: string, params: SqlValue[] = []): T[] {
  const db = getDbSync();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row as unknown as T);
  }
  stmt.free();
  return results;
}

function queryOne<T>(sql: string, params: SqlValue[] = []): T | null {
  const db = getDbSync();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result: T | null = null;
  if (stmt.step()) {
    result = stmt.getAsObject() as unknown as T;
  }
  stmt.free();
  return result;
}

function exec(sql: string, params: SqlValue[] = []): void {
  const db = getDbSync();
  db.run(sql, params);
  scheduleSave();
}

function execReturnId(sql: string, params: SqlValue[] = []): number {
  const db = getDbSync();
  db.run(sql, params);
  const lastId = db.exec("SELECT last_insert_rowid() as id");
  return Number(lastId[0]?.values[0]?.[0] ?? 0);
}

// ── Products ──────────────────────────────────────────────

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  status: string;
  platform: string;
  created_at: string;
  updated_at: string;
}

export function getProducts(): ProductRow[] {
  return queryAll<ProductRow>("SELECT * FROM products ORDER BY created_at DESC");
}

export function getProductById(id: string): ProductRow | null {
  return queryOne<ProductRow>("SELECT * FROM products WHERE id = ?", [id]);
}

export function createProduct(product: Omit<ProductRow, "created_at" | "updated_at">): void {
  exec(
    "INSERT INTO products (id, name, sku, category, price, stock, status, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    [product.id, product.name, product.sku, product.category, product.price, product.stock, product.status, product.platform]
  );
}

export function updateProduct(id: string, product: Partial<ProductRow>): void {
  const fields: string[] = [];
  const values: SqlValue[] = [];
  for (const [key, val] of Object.entries(product)) {
    if (key === "id" || key === "created_at") continue;
    fields.push(`${key} = ?`);
    values.push(val);
  }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  exec(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`, values);
}

export function deleteProduct(id: string): void {
  exec("DELETE FROM products WHERE id = ?", [id]);
}

// ── Accounts ──────────────────────────────────────────────

export interface AccountRow {
  id: string;
  name: string;
  platform: string;
  handle: string;
  followers: number;
  posts: number;
  engagement: number;
  status: string;
  avatar: string;
  growth: number;
  created_at: string;
  updated_at: string;
}

export function getAccounts(): AccountRow[] {
  return queryAll<AccountRow>("SELECT * FROM accounts ORDER BY created_at DESC");
}

export function createAccount(account: Omit<AccountRow, "created_at" | "updated_at">): void {
  exec(
    "INSERT INTO accounts (id, name, platform, handle, followers, posts, engagement, status, avatar, growth, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    [account.id, account.name, account.platform, account.handle, account.followers, account.posts, account.engagement, account.status, account.avatar, account.growth]
  );
}

export function updateAccount(id: string, account: Partial<AccountRow>): void {
  const fields: string[] = [];
  const values: SqlValue[] = [];
  for (const [key, val] of Object.entries(account)) {
    if (key === "id" || key === "created_at") continue;
    fields.push(`${key} = ?`);
    values.push(val);
  }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  exec(`UPDATE accounts SET ${fields.join(", ")} WHERE id = ?`, values);
}

export function deleteAccount(id: string): void {
  exec("DELETE FROM accounts WHERE id = ?", [id]);
}

// ── Links ─────────────────────────────────────────────────

export interface LinkRow {
  id: string;
  name: string;
  url: string;
  short_url: string;
  platform: string;
  clicks: number;
  conversions: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export function getLinks(): LinkRow[] {
  return queryAll<LinkRow>("SELECT * FROM links ORDER BY created_at DESC");
}

export function createLink(link: Omit<LinkRow, "created_at" | "updated_at">): void {
  exec(
    "INSERT INTO links (id, name, url, short_url, platform, clicks, conversions, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    [link.id, link.name, link.url, link.short_url, link.platform, link.clicks, link.conversions, link.status]
  );
}

export function updateLink(id: string, link: Partial<LinkRow>): void {
  const fields: string[] = [];
  const values: SqlValue[] = [];
  for (const [key, val] of Object.entries(link)) {
    if (key === "id" || key === "created_at") continue;
    fields.push(`${key} = ?`);
    values.push(val);
  }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  exec(`UPDATE links SET ${fields.join(", ")} WHERE id = ?`, values);
}

export function deleteLink(id: string): void {
  exec("DELETE FROM links WHERE id = ?", [id]);
}

// ── Monthly Revenue ───────────────────────────────────────

export interface MonthlyRevenueRow {
  id: number;
  month: string;
  revenue: number;
  cost: number;
}

export function getMonthlyRevenue(): (MonthlyRevenueRow & { profit: number })[] {
  const rows = queryAll<MonthlyRevenueRow>("SELECT * FROM monthly_revenue ORDER BY id");
  return rows.map((r) => ({ ...r, profit: r.revenue - r.cost }));
}

// ── Transactions ──────────────────────────────────────────

export interface TransactionRow {
  id: string;
  type: string;
  amount: number;
  description: string;
  date: string;
  platform: string;
  created_at: string;
}

export function getTransactions(): TransactionRow[] {
  return queryAll<TransactionRow>("SELECT * FROM transactions ORDER BY date DESC");
}

// ── Category Data ─────────────────────────────────────────

export interface CategoryRow {
  id: number;
  name: string;
  value: number;
  color: string;
}

export function getCategoryData(): CategoryRow[] {
  return queryAll<CategoryRow>("SELECT * FROM category_data ORDER BY id");
}

// ── Platform Revenue ──────────────────────────────────────

export interface PlatformRevenueRow {
  id: number;
  name: string;
  revenue: number;
  cost: number;
}

export function getPlatformRevenue(): PlatformRevenueRow[] {
  return queryAll<PlatformRevenueRow>("SELECT * FROM platform_revenue ORDER BY id");
}

// ── Stats ─────────────────────────────────────────────────

export interface Stats {
  totalProducts: number;
  activeLinks: number;
  monthlyRevenue: number;
  operatingAccounts: number;
  todayRevenue: number;
}

export function getStats(): Stats {
  const db = getDbSync();
  const totalProducts = (db.exec("SELECT COUNT(*) as c FROM products")[0]?.values[0]?.[0] as number) ?? 0;
  const activeLinks = (db.exec("SELECT COUNT(*) as c FROM links WHERE status = 'active'")[0]?.values[0]?.[0] as number) ?? 0;
  const totalRevenue = (db.exec("SELECT SUM(revenue) as c FROM monthly_revenue")[0]?.values[0]?.[0] as number) ?? 0;
  const operatingAccounts = (db.exec("SELECT COUNT(*) as c FROM accounts WHERE status = 'active'")[0]?.values[0]?.[0] as number) ?? 0;
  const todayRevenue = 48320;

  return { totalProducts, activeLinks, monthlyRevenue: totalRevenue, operatingAccounts, todayRevenue };
}

// ── Dashboard Data (compatible with existing /api/wps-data format) ──

export function getDashboardData() {
  const stats = getStats();
  const salesData = getMonthlyRevenue().map((r) => ({
    name: r.month,
    revenue: r.revenue,
    cost: r.cost,
    profit: r.profit,
  }));
  const topProducts = getProducts().map((p) => ({
    name: p.name,
    sales: p.stock,
    trend: p.status === "active" ? ("up" as const) : ("down" as const),
  }));

  return {
    stats,
    salesData,
    topProducts,
  };
}