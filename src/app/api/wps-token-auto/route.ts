import { NextResponse } from "next/server";

export async function POST() {
  const { WPS_CLIENT_ID, WPS_CLIENT_SECRET } = process.env;
  
  if (!WPS_CLIENT_ID || !WPS_CLIENT_SECRET) {
    return NextResponse.json({ error: "WPS Client ID或Secret未配置" }, { status: 500 });
  }
  
  try {
    const tokenUrl = "https://openapi.wps.cn/oauth/token";
    
    const formData = new URLSearchParams();
    formData.append("grant_type", "client_credentials");
    formData.append("client_id", WPS_CLIENT_ID);
    formData.append("client_secret", WPS_CLIENT_SECRET);
    
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });
    
    const data = await response.json();
    
    if (response.ok) {
      return NextResponse.json(data);
    } else {
      console.error("WPS Token Error:", data);
      return NextResponse.json({ 
        error: data.error_description || data.error || "获取Token失败，请检查权限是否已开通" 
      }, { status: response.status });
    }
  } catch (error) {
    console.error("Error fetching WPS token:", error);
    return NextResponse.json({ error: "请求失败，请重试" }, { status: 500 });
  }
}
