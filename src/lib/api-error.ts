import { NextResponse } from "next/server";

/**
 * 统一 API 错误处理工具
 * 提供一致的错误响应格式和错误码
 */

// 错误码枚举
export const ErrorCode = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// HTTP 状态码映射
const STATUS_MAP: Record<ErrorCodeType, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

/**
 * 创建统一格式的错误响应
 */
export function apiError(
  message: string,
  code: ErrorCodeType = ErrorCode.INTERNAL_ERROR,
  status?: number
): NextResponse {
  const httpStatus = status ?? STATUS_MAP[code];
  return NextResponse.json(
    { success: false, error: message, code },
    { status: httpStatus }
  );
}

/**
 * 创建统一格式的成功响应
 */
export function apiSuccess<T>(data: T, message?: string): NextResponse {
  const body: Record<string, unknown> = { success: true, data };
  if (message) body.message = message;
  return NextResponse.json(body);
}

/**
 * 安全执行异步函数，捕获异常并返回统一错误响应
 */
export async function withErrorHandler<T>(
  fn: () => Promise<T>,
  errorMessage = "操作失败"
): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[API Error] ${errorMessage}:`, msg);
    return apiError(`${errorMessage}: ${msg}`, ErrorCode.INTERNAL_ERROR);
  }
}
