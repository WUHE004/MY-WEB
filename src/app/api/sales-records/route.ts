import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { upsertSalesSummary } from "@/app/api/sales-summary/route";

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
    // 模糊匹配编号, 限制返回500条防止响应过大
    const { data, error } = await supabase
      .from("sales_records")
      .select("*")
      .ilike("sale_id", `%${search}%`)
      .order("registration_date", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
      // 短输入(≤5位)按后缀模糊匹配面单号，长输入精确匹配
      if (trackingNumber.length <= 5) {
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
          continue;
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      inserted.push(data);

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

      return NextResponse.json({ message: "已减少", delta, currentTotal, newTotal: newQty });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}