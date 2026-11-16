import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { appSecret } from "./env";

function derivedKey(purpose: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", appSecret(), Buffer.alloc(0), `omnireports:${purpose}`, 32),
  );
}

/** URL-safe random token. 32 bytes gives 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are stored hashed so a database leak does not expose live links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** AES-256-GCM. Output: v1.<iv>.<ciphertext>.<tag>, all base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("enc"), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, ct, tag]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, ct, tag] = payload.split(".");
  if (version !== "v1" || !iv || !ct || !tag) {
    throw new Error("Unrecognised ciphertext format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    derivedKey("enc"),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Signs a JSON payload so it can round-trip through the browser untampered. */
export function signPayload(data: unknown): string {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = createHmac("sha256", derivedKey("sign")).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPayload<T>(signed: string): T | null {
  const [body, sig] = signed.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", derivedKey("sign")).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Constant-time comparison for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
