import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { WPS_CLIENT_ID, WPS_CLIENT_SECRET } = process.env;
  
  if (!WPS_CLIENT_ID || !WPS_CLIENT_SECRET) {
    return NextResponse.json({ error: "WPS Client ID或Secret未配置" }, { status: 500 });
  }
  
  try {
    const body = await request.json();
    const { code, redirectUri } = body;
    
    if (!code || !redirectUri) {
      return NextResponse.json({ error: "缺少code或redirectUri参数" }, { status: 400 });
    }
    
    const tokenUrl = "https://openapi.wps.cn/oauth/token";
    
    const formData = new URLSearchParams();
    formData.append("grant_type", "authorization_code");
    formData.append("client_id", WPS_CLIENT_ID);
    formData.append("client_secret", WPS_CLIENT_SECRET);
    formData.append("code", code);
    formData.append("redirect_uri", redirectUri);
    
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
      return NextResponse.json({ error: data.error_description || "获取Token失败" }, { status: response.status });
    }
  } catch (error) {
    console.error("Error fetching WPS token:", error);
    return NextResponse.json({ error: "请求失败" }, { status: 500 });
  }
}
