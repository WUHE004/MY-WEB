import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("return_records")
    .select("*")
    .order("created_at", { ascending: false });

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
      const row = {
        sale_id: record.sale_id || "",
        size: Number(record.size) || 0,
        quantity: Number(record.quantity) || 0,
        return_price: Number(record.return_price) || 0,
        remarks: record.remarks || "",
        registrant: record.registrant || "",
      };

      const { data, error } = await supabase
        .from("return_records")
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