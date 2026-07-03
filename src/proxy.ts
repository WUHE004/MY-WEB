import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJwt } from "@/lib/auth";

/**
 * Next.js 16 Proxy（原 middleware）
 * 用于在请求到达 API 路由前统一校验身份
 *
 * 保护策略：
 * - /api/db-admin/*      仅 admin
 * - /api/sales-records/cleanup, /api/return-records/cleanup, /api/backfill-daily-stats  仅 admin
 * - /api/members/heartbeat  需登录（任意角色）
 * - /api/members PUT/DELETE  仅 admin
 * - /api/sync-summary       仅 admin 或 operator
 *
 * 鉴权方式：Authorization: Bearer <token> 或 cookie member_token
 */

// 需要管理员权限的路径前缀
const ADMIN_PREFIXES = [
  "/api/db-admin",
];

// 需要管理员权限的精确路径（method 不限）
const ADMIN_PATHS = new Set([
  "/api/sales-records/cleanup",
  "/api/return-records/cleanup",
  "/api/backfill-daily-stats",
]);

// 需要管理员权限的路径 + 方法组合
const ADMIN_METHOD_PATHS: Array<{ method: string; path: string }> = [
  { method: "DELETE", path: "/api/members" },
];

// 需要登录（任意角色）的路径
const AUTH_REQUIRED_PATHS = new Set([
  "/api/members/heartbeat",
]);

// 需要登录（任意角色）的路径 + 方法组合
const AUTH_REQUIRED_METHOD_PATHS: Array<{ method: string; path: string }> = [
  // PUT /api/members 允许登录用户更新自己的资料（API 层校验是否为本人或 admin）
  { method: "PUT", path: "/api/members" },
];

// 需要管理员或操作员权限的路径
const OPERATOR_PATHS = new Set([
  "/api/sync-summary",
  "/api/import",
]);

function extractToken(request: NextRequest): string | null {
  // 1. Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  // 2. cookie
  const cookieToken = request.cookies.get("member_token")?.value;
  if (cookieToken) return cookieToken;
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  // 判断是否需要鉴权
  const isAdminPrefix = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  const isAdminPath = ADMIN_PATHS.has(pathname);
  const isAdminMethodPath = ADMIN_METHOD_PATHS.some(
    (m) => m.method === method && m.path === pathname
  );
  const isOperatorPath = OPERATOR_PATHS.has(pathname);
  const isAuthRequired = AUTH_REQUIRED_PATHS.has(pathname);
  const isAuthRequiredMethodPath = AUTH_REQUIRED_METHOD_PATHS.some(
    (m) => m.method === method && m.path === pathname
  );

  const needAdmin = isAdminPrefix || isAdminPath || isAdminMethodPath;
  const needOperator = isOperatorPath;
  const needAuth = isAuthRequired || isAuthRequiredMethodPath || needAdmin || needOperator;

  // 不需要鉴权的路径直接放行
  if (!needAuth) {
    return NextResponse.next();
  }

  // 提取并验证 token
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "未登录，请先登录", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const payload = verifyJwt(token);
  if (!payload) {
    return NextResponse.json(
      { error: "登录已过期，请重新登录", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }

  // 角色校验
  if (needAdmin && payload.role !== "admin") {
    return NextResponse.json(
      { error: "权限不足，需要管理员权限", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  if (needOperator && payload.role !== "admin" && payload.role !== "operator") {
    return NextResponse.json(
      { error: "权限不足，需要管理员或操作员权限", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  // 将用户身份注入请求头，供后续 API 使用
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", payload.sub);
  requestHeaders.set("x-user-role", payload.role);
  requestHeaders.set("x-user-phone", payload.phone);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // 仅对 /api/ 路径生效，排除静态资源
  matcher: ["/api/:path*"],
};
