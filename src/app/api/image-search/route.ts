// 以图搜图: 拍照/选图 → 阿里云向量化 → pgvector 余弦检索 → 返回相似商品
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { embedImages } from "@/lib/image-embed";

// 拉取全部入库记录 (sale_id + photo), 拆分多张图
async function loadPhotoMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>(); // image_url -> sale_id
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from("inbound_records")
      .select("sale_id, photo")
      .not("photo", "is", null)
      .neq("photo", "")
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      const sid = String(r.sale_id || "").trim().toUpperCase();
      if (!sid) continue;
      for (const u of String(r.photo).split(/\s+/)) {
        if (u.startsWith("http")) map.set(u, sid);
      }
    }
    if (data.length < 1000) break;
    page++;
  }
  return map;
}

async function loadExisting(): Promise<Set<string>> {
  const set = new Set<string>();
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from("product_embeddings")
      .select("image_url")
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data as any[]) set.add(row.image_url);
    if (data.length < 1000) break;
    page++;
  }
  return set;
}

// 给指定编号的商品图建档 (入库成功后前端触发)
async function embedSale(saleId: string): Promise<{ embedded: number }> {
  const sid = String(saleId || "").trim().toUpperCase();
  if (!sid) throw new Error("sale_id 不能为空");

  const { data: recs, error } = await supabase
    .from("inbound_records")
    .select("photo")
    .eq("sale_id", sid)
    .not("photo", "is", null)
    .neq("photo", "");
  if (error) throw new Error(error.message);

  const urls = [...new Set((recs || []).flatMap((r: any) => String(r.photo || "").split(/\s+/)).filter((u) => u.startsWith("http")))];
  if (urls.length === 0) return { embedded: 0 };

  const existing = await loadExisting();
  const todo = urls.filter((u) => !existing.has(u));
  if (todo.length === 0) return { embedded: 0 };

  const vecs = await embedImages(todo);
  const rows = todo
    .map((u, k) => ({ sale_id: sid, image_url: u, embedding: vecs[k] }))
    .filter((r) => r.embedding);
  if (rows.length) {
    const { error: upErr } = await supabase.from("product_embeddings").upsert(rows, { onConflict: "sale_id,image_url" });
    if (upErr) throw new Error(upErr.message);
  }
  return { embedded: rows.length };
}

// 补档: 每次补一批(12张), 前端循环调用直到 remaining=0
async function backfill(): Promise<{ embedded: number; remaining: number }> {
  const [wanted, existing] = await Promise.all([loadPhotoMap(), loadExisting()]);
  const todo = [...wanted.keys()].filter((u) => !existing.has(u));
  const batch = todo.slice(0, 12);
  if (batch.length === 0) return { embedded: 0, remaining: 0 };

  const vecs = await embedImages(batch);
  const rows = batch
    .map((u, k) => ({ sale_id: wanted.get(u), image_url: u, embedding: vecs[k] }))
    .filter((r) => r.embedding);
  if (rows.length) {
    const { error } = await supabase.from("product_embeddings").upsert(rows, { onConflict: "sale_id,image_url" });
    if (error) throw new Error(error.message);
  }
  return { embedded: rows.length, remaining: todo.length - rows.length };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    if (mode === "embed-sale") {
      const saleId = searchParams.get("sale_id") || "";
      return NextResponse.json(await embedSale(saleId));
    }
    if (mode === "backfill") {
      return NextResponse.json(await backfill());
    }
    // 默认: 返回建档统计
    const [wanted, existing] = await Promise.all([loadPhotoMap(), loadExisting()]);
    return NextResponse.json({ total: wanted.size, embedded: wanted.size - [...wanted.keys()].filter((u) => !existing.has(u)).length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const image = String(body.image || "");
    // scope: all=全部入库 / sales=仅已售(售卖明细) / returns=仅已退(退货明细)
    const scope = body.scope === "sales" || body.scope === "returns" ? String(body.scope) : "all";
    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ error: "缺少图片数据" }, { status: 400 });
    }
    // 压缩后图片 ≤100KB, base64 约 133KB, DashScope 限制 10MB 内

    const [vec] = await embedImages([image]);
    if (!vec) {
      return NextResponse.json({ error: "图片向量化失败，请重试" }, { status: 500 });
    }

    // pgvector 余弦检索 Top 50 (按 scope 过滤后取前 10)
    const { data: matches, error: rpcErr } = await supabase.rpc("match_products", {
      query_embedding: vec,
      match_count: 50,
    });
    if (rpcErr) {
      return NextResponse.json({ error: "检索失败: " + rpcErr.message }, { status: 500 });
    }

    const rawMatches: Array<Record<string, any>> = Array.isArray(matches) ? matches : [];
    const rawIds = [...new Set(rawMatches.map((m) => String(m.sale_id)))].slice(0, 50);
    if (rawIds.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // 并行拉取: 已售记录 + 商品信息 + (退货范围时)已退记录 —— 三段串行改一次并行, 省跨境往返
    const [salesRes, inboundsRes, returnsRes] = await Promise.all([
      supabase.from("sales_records").select("sale_id, size, quantity").in("sale_id", rawIds),
      supabase.from("inbound_records").select("sale_id, name, manufacturer, shelf_no, photo").in("sale_id", rawIds),
      scope === "returns"
        ? supabase.from("return_records").select("sale_id").in("sale_id", rawIds)
        : Promise.resolve({ data: null, error: null } as { data: any[] | null; error: any }),
    ]);
    const sales = salesRes.data;
    const inbounds = inboundsRes.data;
    const returns = returnsRes.data;

    // 已售 / 已退集合
    const soldSet = new Set<string>();
    for (const r of sales || []) soldSet.add(String((r as any).sale_id).toUpperCase());
    const returnedSet = new Set<string>();
    for (const r of returns || []) returnedSet.add(String((r as any).sale_id).toUpperCase());

    // 按编号聚合: 最新非空信息 + 已售尺码
    const info = new Map<string, { name: string; manufacturer: string; shelf_no: string; photo: string; soldSizes: Record<string, number> }>();
    for (const r of inbounds || []) {
      const sid = String((r as any).sale_id).toUpperCase();
      const cur = info.get(sid) || { name: "", manufacturer: "", shelf_no: "", photo: "", soldSizes: {} };
      if (!cur.name && (r as any).name) cur.name = (r as any).name;
      if (!cur.manufacturer && (r as any).manufacturer) cur.manufacturer = (r as any).manufacturer;
      if (!cur.shelf_no && (r as any).shelf_no) cur.shelf_no = (r as any).shelf_no;
      if (!cur.photo && (r as any).photo) cur.photo = (r as any).photo;
      info.set(sid, cur);
    }
    for (const r of sales || []) {
      const sid = String((r as any).sale_id).toUpperCase();
      const cur = info.get(sid);
      if (cur) {
        const size = String((r as any).size || "");
        cur.soldSizes[size] = (cur.soldSizes[size] || 0) + (Number((r as any).quantity) || 0);
      }
    }

    const simMap = new Map<string, number>();
    for (const m of rawMatches) {
      const sid = String(m.sale_id);
      simMap.set(sid, Math.max(simMap.get(sid) || 0, Number(m.similarity) || 0));
    }

    // 组装结果(按最高相似度排序)
    const toResult = (sid: string) => {
      const cur = info.get(sid);
      return {
        sale_id: sid,
        similarity: Math.round((simMap.get(sid) || 0) * 1000) / 10, // 百分比保留1位
        name: cur?.name || "",
        manufacturer: cur?.manufacturer || "",
        shelf_no: cur?.shelf_no || "",
        photo: cur?.photo || "",
        sold_sizes: cur?.soldSizes || {},
        sold: soldSet.has(sid),
      };
    };

    // scope 过滤后取前 10; 若为空则回退返回全库相似 Top 10 (前端提示"总表中匹配的如下")
    const scopedIds = (scope === "sales"
      ? rawIds.filter((sid) => soldSet.has(sid))
      : scope === "returns"
        ? rawIds.filter((sid) => returnedSet.has(sid))
        : rawIds
    ).slice(0, 10);
    const fallbackIds = scopedIds.length === 0 ? rawIds.slice(0, 10) : [];

    return NextResponse.json({
      results: scopedIds.map(toResult),
      fallback: fallbackIds.map(toResult),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
