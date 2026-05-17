import "server-only";
import bcrypt from "bcryptjs";

function isBcryptHash(stored: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(stored);
}

/** 支援明文（種子／開發）與 bcrypt（正式環境曾雜湊的帳號）。 */
export async function verifyUserPassword(
  stored: string,
  plain: string,
): Promise<boolean> {
  if (isBcryptHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  return stored === plain;
}
