import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackingNumber = searchParams.get("tracking_number");

  let query = supabase
    .from("sales_records")
    .select("*")
    .order("registration_date", { ascending: false });

  if (trackingNumber) {
    query = query.eq("tracking_number", trackingNumber);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
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
        photo: record.photo || "",
        product_name: record.product_name || "",
        size: Number(record.size) || 0,
        quantity: Number(record.quantity) || 0,
        sell_price: Number(record.sell_price) || 0,
        cost_price: Number(record.cost_price) || 0,
        profit,
        total_profit: totalProfit,
        manufacturer: record.manufacturer || "",
        notes: record.notes || "",
        order_time: record.order_time || new Date().toISOString(),
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
    }

    return NextResponse.json(inserted, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}