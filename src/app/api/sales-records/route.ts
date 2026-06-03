import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("sales_records")
    .select("*")
    .order("registration_date", { ascending: false });

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

      const row = {
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

      const { data, error } = await supabase
        .from("sales_records")
        .insert(row)
        .select()
        .single();

      if (error) {
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