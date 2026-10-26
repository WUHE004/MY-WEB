import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { upsertSalesSummary } from "@/app/api/sales-summary/route";
import { logOp } from "@/lib/operation-log";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackingNumber = searchParams.get("tracking_number");
  const saleId = searchParams.get("sale_id");
  // 按编号模糊检索(退货登记等页面的输入联想, 避免全表拉取超 Vercel 响应限制)
  const search = searchParams.get("search");

  // 分页获取所有记录，避免默认1000条限制
  let allData: Record<string, any>[] = [];
  let page = 0;
  const pageSize = 1000;

  if (search) {
    // 1) 模糊匹配编号; 2) 商品名称匹配: 先查 inbound_records.name 拿编号再查售卖记录(退货登记可按名称退货)
    // 限制返回500条防止响应过大
    const [idRes, nameRes] = await Promise.all([
      supabase
        .from("sales_records")
        .select("*")
        .ilike("sale_id", `%${search}%`)
        .order("registration_date", { ascending: false })
        .limit(500),
      supabase
        .from("inbound_records")
        .select("sale_id")
        .ilike("name", `%${search}%`)
        .limit(100),
    ]);

    if (idRes.error) {
      return NextResponse.json({ error: idRes.error.message }, { status: 500 });
    }
    if (nameRes.error) {
      return NextResponse.json({ error: nameRes.error.message }, { status: 500 });
    }

    let data: Record<string, any>[] = idRes.data || [];
    const nameSaleIds = [...new Set((nameRes.data || []).map((p: any) => String(p.sale_id || "").toUpperCase()).filter(Boolean))];
    if (nameSaleIds.length > 0) {
      const { data: byName, error: byNameErr } = await supabase
        .from("sales_records")
        .select("*")
        .in("sale_id", nameSaleIds)
        .order("registration_date", { ascending: false })
        .limit(500);
      if (byNameErr) {
        return NextResponse.json({ error: byNameErr.message }, { status: 500 });
      }
      // 合并去重(编号命中优先, 名称命中补足), 合计仍限500条
      const seen = new Set(data.map((r: Record<string, any>) => r.id));
      for (const r of byName || []) {
        if (!seen.has(r.id)) {
          data.push(r);
          seen.add(r.id);
        }
      }
    }
    data = data.slice(0, 500);

    // 关联产品信息
    if (data && data.length > 0) {
      const saleIds = [...new Set(data.map((r: any) => r.sale_id).filter(Boolean))];
      if (saleIds.length > 0) {
        const { data: products } = await supabase
          .from("inbound_records")
          .select("sale_id, photo, manufacturer, shelf_no, name")
          .in("sale_id", saleIds);
        if (products) {
          const productMap = new Map(products.map((p: any) => [p.sale_id, p]));
          for (const record of data) {
            const product = productMap.get(record.sale_id);
            if (product) {
              record.photo = product.photo || "";
              record.manufacturer = product.manufacturer || "";
              record.shelf_no = product.shelf_no || "";
              record.product_name = product.name || record.product_name || "";
            }
          }
        }
      }
    }
    return NextResponse.json(data);
  }

  if (trackingNumber || saleId) {
    // 有筛选条件时，查询结果后关联产品信息（照片、厂家、货架号）
    let query = supabase
      .from("sales_records")
      .select("*")
      .order("registration_date", { ascending: false });

    if (trackingNumber) {
      // 短输入(≤6位)按后缀模糊匹配面单号，长输入精确匹配
      if (trackingNumber.length <= 6) {
        query = query.ilike("tracking_number", `%${trackingNumber}`);
      } else {
        query = query.eq("tracking_number", trackingNumber);
      }
    }
    if (saleId) {
      query = query.eq("sale_id", saleId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 关联产品信息：照片、厂家、货架号
    if (data && data.length > 0) {
      const saleIds = [...new Set(data.map((r: any) => r.sale_id).filter(Boolean))];
      if (saleIds.length > 0) {
        const { data: products } = await supabase
          .from("inbound_records")
          .select("sale_id, photo, manufacturer, shelf_no, name")
          .in("sale_id", saleIds);
        if (products) {
          const productMap = new Map(products.map((p: any) => [p.sale_id, p]));
          for (const record of data) {
            const product = productMap.get(record.sale_id);
            if (product) {
              record.photo = product.photo || "";
              record.manufacturer = product.manufacturer || "";
              record.shelf_no = product.shelf_no || "";
              record.product_name = product.name || record.product_name || "";
            }
          }
        }
        // 关联备注(inbound_records.notes, 与管理栏总表实时聚合同源, 供打包找货卡片展示; 早期自由文本备注原样透出)
        const { data: inbNotes } = await supabase
          .from("inbound_records")
          .select("sale_id, notes, inbound_date, id")
          .in("sale_id", saleIds)
          .order("inbound_date", { ascending: false })
          .order("id", { ascending: false });
        if (inbNotes) {
          const notesMap = new Map<string, string>();
          for (const n of inbNotes as any[]) {
            const sid = String(n.sale_id || "").toUpperCase();
            if (!sid || notesMap.has(sid)) continue;
            if (String(n.notes || "").trim()) notesMap.set(sid, String(n.notes));
          }
          for (const record of data) {
            record.notes = notesMap.get(String(record.sale_id || "").toUpperCase()) || "";
          }
        }
      }
    }

    return NextResponse.json(data);
  }

  // 无筛选条件时，分页获取全部数据
  while (true) {
    const { data: chunk, error } = await supabase
      .from("sales_records")
      .select("*")
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order("registration_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!chunk || chunk.length === 0) break;
    allData = allData.concat(chunk);
    if (chunk.length < pageSize) break;
    page++;
  }

  // 关联产品信息：照片、厂家、货架号、名称（与有筛选条件分支一致）
  if (allData.length > 0) {
    const saleIds = [...new Set(allData.map((r: any) => r.sale_id).filter(Boolean))];
    if (saleIds.length > 0) {
      const { data: products } = await supabase
        .from("inbound_records")
        .select("sale_id, photo, manufacturer, shelf_no, name")
        .in("sale_id", saleIds);
      if (products) {
        const productMap = new Map(products.map((p: any) => [p.sale_id, p]));
        for (const record of allData) {
          const product = productMap.get(record.sale_id);
          if (product) {
            record.photo = product.photo || "";
            record.manufacturer = product.manufacturer || "";
            record.shelf_no = product.shelf_no || "";
            record.product_name = product.name || record.product_name || "";
          }
        }
      }
    }
  }

  return NextResponse.json(allData);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const records = Array.isArray(body) ? body : [body];

    const inserted = [];
    for (const record of records) {
      const profit = Number(record.sell_price) - Number(record.cost_price);
      const totalProfit = profit * Number(record.quantity);

      const row: Record<string, unknown> = {
        sale_id: record.sale_id || "",
        size: Number(record.size) || 0,
        quantity: Number(record.quantity) || 0,
        sell_price: Number(record.sell_price) || 0,
        cost_price: Number(record.cost_price) || 0,
        profit,
        total_profit: totalProfit,
        notes: record.notes || "",
        order_time: (record.order_time && record.order_time !== "0") ? record.order_time : new Date().toISOString(),
        tracking_number: record.tracking_number || "",
        registrant: record.registrant || "",
      };

      // 尝试包含 shelf_no，如果列不存在则忽略
      if (record.shelf_no !== undefined) {
        row.shelf_no = record.shelf_no || "";
      }

      const { data, error } = await supabase
        .from("sales_records")
        .insert(row)
        .select()
        .single();

      if (error) {
        // 如果是因为 shelf_no 列不存在，则移除后重试
        if (error.message.includes("shelf_no") && row.shelf_no !== undefined) {
          delete row.shelf_no;
          const { data: retryData, error: retryErr } = await supabase
            .from("sales_records")
            .insert(row)
            .select()
            .single();
          if (retryErr) {
            return NextResponse.json({ error: retryErr.message }, { status: 400 });
          }
          inserted.push(retryData);
          void logOp(request, {
            action: "sale_add", label: "售卖登记", table: "sales_records", id: String((retryData as { id?: unknown }).id ?? ""),
            target: `${record.sale_id} · 尺码${record.size}`,
            detail: [{ field: "数量", from: "新增", to: String(record.quantity) }, { field: "售价", from: "新增", to: String(record.sell_price) }],
          });
          continue;
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      inserted.push(data);
      void logOp(request, {
        action: "sale_add", label: "售卖登记", table: "sales_records", id: String((data as { id?: unknown }).id ?? ""),
        target: `${record.sale_id} · 尺码${record.size}`,
        detail: [{ field: "数量", from: "新增", to: String(record.quantity) }, { field: "售价", from: "新增", to: String(record.sell_price) }],
      });

      // 更新售卖总表（同步等待，避免 Serverless 超时导致汇总表未更新）
      await upsertSalesSummary(record.sale_id || "").catch((e) => console.error("upsert sales summary error:", e));
    }

    return NextResponse.json(inserted, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// PUT: 编辑售出记录（按 sale_id + size 修改总数量）
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const { sale_id, size, quantity } = body;

    if (!sale_id || !size) {
      return NextResponse.json({ error: "sale_id 和 size 不能为空" }, { status: 400 });
    }

    const newQty = Number(quantity) || 0;

    // 查询当前该 sale_id + size 的总数量
    const { data: existing, error: fetchErr } = await supabase
      .from("sales_records")
      .select("id, quantity, sell_price, cost_price, tracking_number, order_time, registrant")
      .eq("sale_id", sale_id)
      .eq("size", Number(size))
      .order("registration_date", { ascending: false });

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const currentTotal = (existing || []).reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const delta = newQty - currentTotal;

    if (delta === 0) {
      return NextResponse.json({ message: "无需更新", currentTotal, newTotal: newQty });
    }

    if (delta > 0) {
      // 需要增加：创建一条新记录
      const latest = (existing && existing.length > 0) ? existing[0] : null;
      const newRecord = {
        sale_id,
        size: Number(size),
        quantity: delta,
        sell_price: latest?.sell_price ?? 0,
        cost_price: latest?.cost_price ?? 0,
        tracking_number: "",
        notes: "编辑补录",
        order_time: new Date().toISOString(),
        registrant: "管理员",
        profit: (Number(latest?.sell_price) || 0) - (Number(latest?.cost_price) || 0),
        total_profit: ((Number(latest?.sell_price) || 0) - (Number(latest?.cost_price) || 0)) * delta,
      };

      const { error: insertErr } = await supabase
        .from("sales_records")
        .insert(newRecord);

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }

      // 更新售卖总表（同步等待，避免汇总表数据不一致）
      await upsertSalesSummary(sale_id).catch((e) => console.error("upsert sales summary error:", e));

      void logOp(request, {
        action: "sale_edit", label: "修改售卖记录", table: "sales_records", target: `${sale_id} · 尺码${size}`,
        detail: [{ field: "数量", from: String(currentTotal), to: String(newQty) }],
      });
      return NextResponse.json({ message: "已增加", delta, currentTotal, newTotal: newQty });
    } else {
      // 需要减少：从最新记录开始扣减
      let remaining = Math.abs(delta);
      const sorted = (existing || []).sort((a, b) => (b.id || 0) - (a.id || 0));

      for (const record of sorted) {
        if (remaining <= 0) break;
        const currentQty = Number(record.quantity) || 0;
        const toRemove = Math.min(currentQty, remaining);

        if (toRemove >= currentQty) {
          // 删除整条记录
          await supabase.from("sales_records").delete().eq("id", record.id);
        } else {
          // 减少数量
          const newQuantity = currentQty - toRemove;
          await supabase
            .from("sales_records")
            .update({
              quantity: newQuantity,
              total_profit: ((Number(record.sell_price) || 0) - (Number(record.cost_price) || 0)) * newQuantity,
            })
            .eq("id", record.id);
        }
        remaining -= toRemove;
      }

      // 更新售卖总表（同步等待，避免汇总表数据不一致）
      await upsertSalesSummary(sale_id).catch((e) => console.error("upsert sales summary error:", e));

      void logOp(request, {
        action: "sale_edit", label: "修改售卖记录", table: "sales_records", target: `${sale_id} · 尺码${size}`,
        detail: [{ field: "数量", from: String(currentTotal), to: String(newQty) }],
      });
      return NextResponse.json({ message: "已减少", delta, currentTotal, newTotal: newQty });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE: 面单退货(发货前退货, 不计入退货表)按记录 id 直接删除售卖记录
// 删除后 /api/summary 与打包找货(按 tracking_number 查售卖记录)自动同步生效
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "id 不能为空" }, { status: 400 });
    }

    // 先查记录拿到 sale_id, 删除后刷新汇总表
    const { data: existing, error: fetchErr } = await supabase
      .from("sales_records")
      .select("id, sale_id")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    }

    const { error } = await supabase.from("sales_records").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await upsertSalesSummary(String(existing.sale_id || "")).catch((e) => console.error("upsert sales summary error:", e));

    void logOp(request, { action: "sale_del", label: "删除售卖记录", table: "sales_records", id: String(id), target: `#${id} · ${existing.sale_id}` });
    return NextResponse.json({ message: "已删除", id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}