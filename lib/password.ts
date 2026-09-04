import bcrypt from "bcryptjs"

const COST = 10

/** パスワードをハッシュ化する。 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST)
}

/** 平文パスワードとハッシュを照合する。 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
