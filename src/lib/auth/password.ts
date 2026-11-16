import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt with N=2^15, r=8, p=3 (an OWASP-recommended parameter set).
const N = 32768;
const R = 8;
const P = 3;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

export const MIN_PASSWORD_LENGTH = 10;

function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEYLEN,
      { N: n, r, p, maxmem: Math.max(MAXMEM, 128 * n * r * 2) },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) {
    // Spend the same time as a real check so missing accounts are not
    // distinguishable by response time.
    await derive(password, Buffer.alloc(16), N, R, P);
    return false;
  }
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(
    password,
    Buffer.from(salt, "base64url"),
    Number(n),
    Number(r),
    Number(p),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
