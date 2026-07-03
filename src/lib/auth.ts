import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * 密码哈希与验证（基于 Node 内置 scrypt，安全性等同 bcrypt，无需额外依赖）
 * 存储格式: "scrypt$<saltHex>$<hashHex>"
 */

const KEY_LEN = 64;
const SALT_LEN = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, saltHex, hashHex] = stored.split("$");
    if (algo !== "scrypt" || !saltHex || !hashHex) {
      // 兼容旧明文密码：存储值不含 $ 分隔符视为明文（用于平滑迁移）
      // 注意：明文比对用 timingSafeEqual 防止时序攻击
      if (!stored.includes("$")) {
        return password.length === stored.length && timingSafeEqual(
          Buffer.from(password),
          Buffer.from(stored)
        );
      }
      return false;
    }
    const salt = Buffer.from(saltHex, "hex");
    const storedHash = Buffer.from(hashHex, "hex");
    const hash = scryptSync(password, salt, KEY_LEN);
    return hash.length === storedHash.length && timingSafeEqual(hash, storedHash);
  } catch {
    return false;
  }
}

/**
 * JWT 签发与验证（HS256，基于 Node 内置 crypto，无需 jsonwebtoken 依赖）
 * Payload 结构: { sub, role, phone, iat, exp }
 */

const JWT_TTL = 7 * 24 * 60 * 60; // 7 天（秒）

function getJwtSecret(): string {
  // 复用 Supabase service role key 作为签名密钥（已存在环境变量，无需新增）
  // 如需独立密钥可配置 JWT_SECRET 环境变量
  return process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-only-insecure-secret";
}

function base64UrlEncode(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

export interface JwtPayload {
  sub: string;       // member id
  role: string;      // admin / operator / customer
  phone: string;
  iat: number;       // 签发时间（秒）
  exp: number;       // 过期时间（秒）
}

export function signJwt(payload: Pick<JwtPayload, "sub" | "role" | "phone">): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + JWT_TTL,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = createHmac("sha256", getJwtSecret()).update(signingInput).digest();
  const sigB64 = base64UrlEncode(signature);
  return `${signingInput}.${sigB64}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = createHmac("sha256", getJwtSecret()).update(signingInput).digest();
    const actualSig = base64UrlDecode(sigB64);
    if (expectedSig.length !== actualSig.length) return null;
    if (!timingSafeEqual(expectedSig, actualSig)) return null;
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf-8")) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * 从请求中提取并验证 JWT，返回 payload 或 null
 * 兼容 Authorization: Bearer <token> 和 cookie 两种方式
 */
export function extractUser(request: Request): JwtPayload | null {
  // 1. 优先从 Authorization header 读取
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return verifyJwt(token);
  }
  // 2. 从 cookie 读取
  const cookieHeader = request.headers.get("cookie") || "";
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)member_token=([^;]+)/);
  if (tokenMatch) {
    return verifyJwt(tokenMatch[1]);
  }
  return null;
}
