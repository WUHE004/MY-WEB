import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ping: "pong",
    time: new Date().toISOString(),
    hasKey: !!process.env.KUAIDI100_KEY,
    hasCustomer: !!process.env.KUAIDI100_CUSTOMER,
  });
}