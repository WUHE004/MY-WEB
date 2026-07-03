"use client";

/**
 * 带鉴权的 fetch 封装
 * 自动从 localStorage 读取 JWT token 并添加 Authorization header
 * 遇到 401 时清除失效的 token 并跳转登录页
 */
export async function authFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem("member_token");

  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, { ...init, headers });

  // token 失效或未登录，清除本地状态并跳转登录
  if (response.status === 401) {
    localStorage.removeItem("member_token");
    localStorage.removeItem("member_name");
    localStorage.removeItem("member_role");
    localStorage.removeItem("member_phone");
    localStorage.removeItem("member_id");
    document.cookie = "member_token=; path=/; max-age=0";
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  return response;
}
