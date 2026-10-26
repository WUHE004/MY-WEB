import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { upsertSalesSummary } from "@/app/api/sales-summary/route";
import { upsertReturnsSummary } from "@/app/api/returns-summary/route";
import { logOp } from "@/lib/operation-log";

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

// 入库清单字段映射（photo字段存放文件名，最终URL由photoFilter匹配提供）
const INBOUND_COLUMNS = [
  "sale_id", "manufacturer", "photo", "name",
  "size_80", "size_90", "size_95", "size_100", "size_105", "size_110",
  "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180",
  "cost_price", "shelf_no", "season", "style_category", "notes", "inbound_date",
];

const INBOUND_NUMBER_COLUMNS = [
  "size_80", "size_90", "size_95", "size_100", "size_105", "size_110",
  "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180",
  "cost_price",
];

// 售出清单字段映射（photo/product_name/cost_price从入库表查找，registrant自动填入）
const SALES_COLUMNS = [
  "sale_id", "size", "quantity",
  "sell_price", "notes",
  "order_time", "tracking_number",
];

const SALES_NUMBER_COLUMNS = [
  "size", "quantity", "sell_price",
];

// 退货清单字段映射（registrant自动填入）
const RETURNS_COLUMNS = [
  "sale_id", "size", "quantity", "return_price", "remarks", "return_time",
];

const RETURNS_NUMBER_COLUMNS = [
  "size", "quantity", "return_price",
];

const TABLES: Record<string, string> = {
  inbound: "inbound_records",
  sales: "sales_records",
  returns: "return_records",
};

// 时间字段规范化：兼容 "2026/08/20"、"2026-08-24 22:53:45"、ISO 等格式，
// 无法解析时返回 null（由调用方决定兜底策略），避免 Postgres 报
// invalid input syntax for type timestamp 导致整批插入失败
function normalizeTimestamp(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s || s === "0") return null;
  let normalized = s.replace(/[/年月]/g, "-").replace(/日/g, "").replace(" ", "T");
  // 补零: ISO 8601 要求月/日/时/分两位数("2026-10-19T9:39"非法),
  // 平台导出的单数字段(如 "2026/10/19 9:39")不补零会解析失败被当成脏值
  normalized = normalized.replace(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
    (_m, y: string, mo: string, d: string, h?: string, mi?: string, sec?: string) => {
      const p = (v?: string) => (v ? v.padStart(2, "0") : "");
      return `${y}-${p(mo)}-${p(d)}${h != null ? `T${p(h)}:${p(mi ?? "0")}${sec ? ":" + p(sec) : ""}` : ""}`;
    }
  );
  // 无时区后缀的裸时间(如 Excel 里填的 "2026-09-30 18:09")是北京时间,
  // 必须显式 +08:00, 否则 UTC 服务器的 new Date() 会按 UTC 解析导致 +8h 偏差
  const hasTZ = /(?:Z$|[+-]\d{2}:?\d{2}$)/i.test(normalized);
  const d = new Date(hasTZ ? normalized : `${normalized}+08:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const COLUMNS_BY_TYPE: Record<string, string[]> = {
  inbound: INBOUND_COLUMNS,
  sales: SALES_COLUMNS,
  returns: RETURNS_COLUMNS,
};

const NUMBER_COLUMNS_BY_TYPE: Record<string, string[]> = {
  inbound: INBOUND_NUMBER_COLUMNS,
  sales: SALES_NUMBER_COLUMNS,
  returns: RETURNS_NUMBER_COLUMNS,
};

// 同文件防重复导入 + 并发锁(内存态, 重启清空):
// 2026-10-19 事故: 时间格式警告导致整体显示"导入失败", 客户误以为没导成连续导入3次 → 189条重复数据
// ①文件hash: 30分钟内同一份内容(csvContent)重复导入直接拒绝; ②并发锁: 上一次还在处理中时拒绝新请求
const IMPORT_DUP_TTL_MS = 30 * 60_000;
const importHashes = new Map<string, number>(); // hash(csvContent+type) -> 上次导入时间戳
let importing = false;

// FNV-1a 简易文本哈希(仅用于防重比对, 无安全性要求)
function fnvHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// 警告数组: 数据已导入但不完美(如时间格式无法识别已用当前时间代替)。
// 警告不影响 success, 避免客户把"部分警告"误读为"导入失败"而重复导入
let warnings: string[] = [];

export async function POST(request: NextRequest) {
  try {
    if (importing) {
      return NextResponse.json({ error: "上一次导入还在处理中，请稍候几秒再操作，请勿重复点击" }, { status: 409 });
    }
    importing = true;
    try {
      const body = await request.json();
      const { csvContent, columnMap, importType, registrant, photoFilter } = body as {
        csvContent: string;
        columnMap: Record<string, string>;
        importType?: string;
        registrant?: string;
        photoFilter?: Record<string, string>;
      };

      // 同文件防重: 30分钟内同一份文件内容(同类型)已导入过 → 拒绝
      const dupKey = `${importType || "inbound"}:${fnvHash(String(csvContent || ""))}`;
      const lastImportAt = importHashes.get(dupKey);
      if (lastImportAt && Date.now() - lastImportAt < IMPORT_DUP_TTL_MS) {
        const mins = Math.max(1, Math.round((Date.now() - lastImportAt) / 60_000));
        return NextResponse.json(
          { error: `这份文件 ${mins} 分钟前已经导入过了，请勿重复导入。如果确实需要重新导入（例如刚清空过数据），请等 30 分钟后再试或联系管理员` },
          { status: 409 }
        );
      }

      warnings = [];

    const type = importType || "inbound";
    const tableName = TABLES[type] || "inbound_records";
    const DB_COLUMNS = COLUMNS_BY_TYPE[type] || INBOUND_COLUMNS;
    const NUMBER_COLUMNS = NUMBER_COLUMNS_BY_TYPE[type] || INBOUND_NUMBER_COLUMNS;
    const prefix = type + "_"; // e.g. "inbound_", "sales_", "returns_"

    const { headers, rows } = parseCSV(csvContent);
    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV 内容为空" }, { status: 400 });
    }

    const dbColumns: string[] = [];
    const columnIndexes: number[] = [];

    for (const dbCol of DB_COLUMNS) {
      const mapKey = prefix + dbCol;
      const csvCol = columnMap[mapKey];
      if (csvCol) {
        const idx = headers.indexOf(csvCol);
        if (idx >= 0) {
          columnIndexes.push(idx);
          dbColumns.push(dbCol);
        }
      }
    }

    if (dbColumns.length === 0) {
      return NextResponse.json({ error: "未匹配到任何列" }, { status: 400 });
    }

    // 售出模式：预先从入库表查询所有商品的 cost_price
    let inboundCostLookup: Record<string, number> = {};
    if (type === "sales") {
      const saleIds = [...new Set(rows.map((row) => {
        const idx = columnIndexes[dbColumns.indexOf("sale_id")];
        return idx >= 0 ? (row[idx] || "").trim() : "";
      }).filter(Boolean))];

      if (saleIds.length > 0) {
        const batchSize = 200;
        for (let i = 0; i < saleIds.length; i += batchSize) {
          const batch = saleIds.slice(i, i + batchSize);
          const { data: inboundData } = await supabase
            .from("inbound_records")
            .select("sale_id, cost_price")
            .in("sale_id", batch);

          if (inboundData) {
            for (const item of inboundData) {
              const sid = (item.sale_id || "").toUpperCase();
              if (!(sid in inboundCostLookup)) {
                inboundCostLookup[sid] = Number(item.cost_price) || 0;
              }
            }
          }
        }
      }
    }

    let successCount = 0;
    let skipCount = 0;
    const errors: string[] = [];
    const batch: Record<string, unknown>[] = [];
    const affectedSaleIds = new Set<string>();
    const affectedReturnIds = new Set<string>();

    for (let r = 0; r < rows.length; r++) {
      try {
        const row = rows[r];
        const record: Record<string, unknown> = {};

        for (let i = 0; i < dbColumns.length; i++) {
          const dbCol = dbColumns[i];
          const idx = columnIndexes[i];
          const raw = row[idx];

          if (raw !== undefined && raw !== "") {
            if (NUMBER_COLUMNS.includes(dbCol)) {
              const num = parseFloat(raw.replace(/[^0-9.-]/g, ""));
              record[dbCol] = isNaN(num) ? 0 : num;
            } else {
              record[dbCol] = raw;
            }
          }
        }

        // 跳过没有 sale_id 的空行（售出/退货/入库都必须有 sale_id）
        const rawSaleId = String(record.sale_id || "").trim();
        if (!rawSaleId || rawSaleId === "0") {
          skipCount++;
          continue;
        }

        // 入库表：计算 total_stock，自动填入 registrant，匹配照片
        if (type === "inbound") {
          // 确保所有 NOT NULL 字段有默认值
          if (!record.sale_id) record.sale_id = "";
          if (!record.manufacturer) record.manufacturer = "";
          if (!record.photo || record.photo === "0" || String(record.photo).trim() === "0") record.photo = "";
          if (!record.name || record.name === "0" || String(record.name).trim() === "0") record.name = "";
          if (!record.shelf_no) record.shelf_no = "";
          if (!record.season) record.season = "";
          if (!record.style_category) record.style_category = "";
          if (!record.notes) record.notes = "";
          // 入库日期规范化：无法解析的脏值用当前日期兜底并提示行号
          const normalizedInboundDate = normalizeTimestamp(record.inbound_date);
          if (!normalizedInboundDate) {
            if (record.inbound_date !== undefined && String(record.inbound_date).trim() !== "" && record.inbound_date !== "0") {
              warnings.push(`第 ${r + 2} 行入库日期无法识别（"${String(record.inbound_date).trim()}"），已用当前日期代替`);
            }
            record.inbound_date = new Date().toISOString();
          } else {
            record.inbound_date = normalizedInboundDate;
          }
          if (record.cost_price === undefined) record.cost_price = 0;

          // 确保所有尺码字段默认值为 0
          for (const s of [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180]) {
            if (record[`size_${s}`] === undefined) record[`size_${s}`] = 0;
          }

          let totalStock = 0;
          for (const s of [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180]) {
            totalStock += Number(record[`size_${s}`]) || 0;
          }
          record.total_stock = totalStock;

          // 照片匹配：根据 CSV 中 photo 字段的文件名，在 photoFilter 中查找上传后的 URL
          if (photoFilter && record.photo) {
            const csvPhotoName = String(record.photo).trim();
            // 提取文件名（去路径和扩展名），与 photoFilter 的 key 匹配
            const baseName = csvPhotoName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim();
            const matchedUrl = photoFilter[baseName];
            if (matchedUrl) {
              record.photo = matchedUrl;
            }
          }
        }

        // 售出表：从入库表查找 cost_price，自动填入 registrant，计算 profit
        if (type === "sales") {
          const saleId = String(record.sale_id || "").trim().toUpperCase();
          const costPrice = inboundCostLookup[saleId] || 0;
          record.cost_price = costPrice;

          // 确保所有 NOT NULL 字段有默认值
          if (!record.sale_id) record.sale_id = "";
          if (!record.notes) record.notes = "";
          if (!record.tracking_number) record.tracking_number = "";
          if (!record.registrant) record.registrant = registrant || "";
          if (record.size === undefined) record.size = 0;
          if (record.quantity === undefined) record.quantity = 0;
          if (record.sell_price === undefined) record.sell_price = 0;
          if (record.cost_price === undefined) record.cost_price = 0;
          // 下单时间规范化：无法解析的脏值（如 "5"）用当前时间兜底并提示行号
          const normalizedOrderTime = normalizeTimestamp(record.order_time);
          if (!normalizedOrderTime) {
            if (record.order_time !== undefined && String(record.order_time).trim() !== "" && record.order_time !== "0") {
              warnings.push(`第 ${r + 2} 行下单时间无法识别（"${String(record.order_time).trim()}"），已用当前时间代替`);
            }
            record.order_time = new Date().toISOString();
          } else {
            record.order_time = normalizedOrderTime;
          }

          const sellPrice = Number(record.sell_price) || 0;
          const cp = Number(record.cost_price) || 0;
          const quantity = Number(record.quantity) || 0;
          record.profit = sellPrice - cp;
          record.total_profit = (sellPrice - cp) * quantity;
        }

        // 退货表：自动填入 registrant，确保 NOT NULL 字段有默认值
        if (type === "returns") {
          if (!record.sale_id) record.sale_id = "";
          if (!record.registrant) record.registrant = registrant || "";
          if (!record.remarks) record.remarks = "";
          if (record.size === undefined) record.size = 0;
          if (record.quantity === undefined) record.quantity = 0;
          if (record.return_price === undefined) record.return_price = 0;
          // 退货时间规范化：无法解析的脏值用当前时间兜底并提示行号
          const normalizedReturnTime = normalizeTimestamp(record.return_time);
          if (!normalizedReturnTime) {
            if (record.return_time !== undefined && String(record.return_time).trim() !== "" && record.return_time !== "0") {
              warnings.push(`第 ${r + 2} 行退货时间无法识别（"${String(record.return_time).trim()}"），已用当前时间代替`);
            }
            record.return_time = new Date().toISOString();
          } else {
            record.return_time = normalizedReturnTime;
          }
        }

        batch.push(record);

        if (type === "sales") {
          // 强制转为大写保证一致性
          const saleId = String(record.sale_id || "").trim().toUpperCase();
          record.sale_id = saleId;
          affectedSaleIds.add(saleId);
        }
        if (type === "returns") {
          // 强制转为大写保证一致性
          const saleId = String(record.sale_id || "").trim().toUpperCase();
          record.sale_id = saleId;
          affectedReturnIds.add(saleId);
        }

        if (batch.length >= 50) {
          const { error } = await supabase.from(tableName).insert(batch);
          if (error) {
            errors.push(`批量导入错误: ${error.message}`);
          } else {
            successCount += batch.length;
          }
          batch.length = 0;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`第 ${r + 2} 行: ${errorMsg}`);
        skipCount++;
        if (skipCount > 20) break;
      }
    }

    if (batch.length > 0) {
      const { error } = await supabase.from(tableName).insert(batch);
      if (error) {
        errors.push(`批量导入错误: ${error.message}`);
      } else {
        successCount += batch.length;
      }
    }

    // 售出导入后同步更新售卖总表（fire-and-forget，避免 Vercel 超时）
    // 汇总由前端导入完成后单独调用 /api/sync-summary 触发
    if (type === "sales" && successCount > 0) {
      const saleIds = [...affectedSaleIds].filter(Boolean);
      console.log(`[import] 售出导入完成，${saleIds.length} 个 sale_id 待汇总，前端将自动触发同步`);
    }

    // 退货导入后同步更新退货总表（fire-and-forget，避免 Vercel 超时）
    // 汇总由前端导入完成后单独调用 /api/sync-summary 触发
    if (type === "returns" && successCount > 0) {
      const returnIds = [...affectedReturnIds].filter(Boolean);
      console.log(`[import] 退货导入完成，${returnIds.length} 个 sale_id 待汇总，前端将自动触发同步`);
    }

    if (successCount > 0) {
      const typeCn = type === "sales" ? "售卖" : type === "returns" ? "退货" : "入库";
      void logOp(request, {
        action: `import_${type}`, label: `导入${typeCn}数据`, table: tableName,
        target: `导入 ${successCount} 条记录`,
        detail: `共 ${rows.length} 行, 成功 ${successCount} 条${skipCount > 0 ? `, 跳过 ${skipCount} 条` : ""}${warnings.length > 0 ? `, 警告 ${warnings.length} 条` : ""}${errors.length > 0 ? `, 失败 ${errors.length} 条` : ""}`,
      });
      // 成功导入后记录文件hash, 用于30分钟内同文件防重
      importHashes.set(dupKey, Date.now());
    }

    return NextResponse.json({
      success: errors.length === 0,
      total: rows.length,
      actualCount: successCount,
      importType: type,
      warnings: warnings.length > 0 ? warnings.slice(0, 5) : undefined,
      warningCount: warnings.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });
    } finally {
      // 释放并发锁(无论成功失败)
      importing = false;
    }
  } catch (error) {
    importing = false;
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `导入失败: ${errorMsg}` }, { status: 500 });
  }
}