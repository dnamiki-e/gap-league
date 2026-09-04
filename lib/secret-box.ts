import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"

/**
 * DB に置く必要のある機密値（OAuth クライアントシークレット等）の暗号化。
 *
 * 鍵は NEXTAUTH_SECRET から導出する。専用の鍵を増やすと、配布先で
 * 「設定すべき環境変数」が1つ増えるだけで安全性は上がらないため。
 * NEXTAUTH_SECRET を変えると復号できなくなる（＝未設定として扱われ、
 * 管理画面で入れ直しになる）。この挙動は .env.example に書いてある。
 *
 * 形式: v1:<iv(base64)>:<authTag(base64)>:<ciphertext(base64)>
 */

const FORMAT = "v1"
const ALGO = "aes-256-gcm"
// 鍵導出のソルト。秘密ではないので固定でよい（鍵の素は NEXTAUTH_SECRET）
const SALT = "gapleague/secret-box/v1"

function deriveKey(): Buffer | null {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) return null
  return scryptSync(secret, SALT, 32)
}

/** 暗号化する。鍵が無ければ null（呼び出し側で「保存できない」と扱う）。 */
export function encryptSecret(plain: string): string | null {
  const key = deriveKey()
  if (!key) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [
    FORMAT,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ct.toString("base64"),
  ].join(":")
}

/**
 * 復号する。鍵違い・形式違い・改変はすべて null を返す。
 * 例外を投げないのは、復号できない値のせいでログイン画面ごと落とさないため。
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null
  const parts = stored.split(":")
  if (parts.length !== 4 || parts[0] !== FORMAT) return null
  const key = deriveKey()
  if (!key) return null
  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(parts[1], "base64"))
    decipher.setAuthTag(Buffer.from(parts[2], "base64"))
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    return null
  }
}

/** 画面表示用のマスク。末尾4文字だけ残す（値が入っているかの確認用）。 */
export function maskSecret(plain: string): string {
  if (plain.length <= 4) return "•".repeat(plain.length)
  return `${"•".repeat(Math.min(plain.length - 4, 20))}${plain.slice(-4)}`
}
