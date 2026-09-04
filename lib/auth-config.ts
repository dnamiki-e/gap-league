import { prisma } from "@/lib/prisma"
import { decryptSecret, encryptSecret } from "@/lib/secret-box"
import {
  parseAuthMode,
  parseBooleanFlag,
  type AuthMode,
} from "@/lib/auth-policy"

/**
 * 認証設定の解決。
 *
 * 値の出どころは DB（SiteConfig）が優先、未設定（null / 空文字）なら環境変数。
 * この向きにしてあるのは、配布先が env だけで起動できるようにしつつ、
 * 管理画面から env を上書きできるようにするため。
 * 逆向き（env 優先）にすると、管理画面で保存しても効かない設定ができてしまう。
 *
 * DB 側の既定値をあえて置いていないのも同じ理由。既定値を入れると、
 * 既存環境がマイグレーション直後に「password のみ」へ切り替わって
 * Google しか持たない管理者がログインできなくなる。
 */

const SINGLETON_ID = "singleton"

export interface AuthConfig {
  mode: AuthMode
  /** 自己登録（ゲスト登録）を許可するか */
  allowSignup: boolean
  googleClientId: string
  googleClientSecret: string
  /** Google ログインを許可するメールドメイン。空文字 = 制限なし */
  allowedEmailDomain: string
  /** どこから来た値かの内訳（管理画面の表示用。秘密そのものは含めない） */
  source: {
    mode: "db" | "env"
    allowSignup: "db" | "env"
    googleClientId: "db" | "env" | "unset"
    googleClientSecret: "db" | "env" | "unset"
    allowedEmailDomain: "db" | "env"
  }
}

/** 管理画面から書き換えられる項目。undefined は「変更しない」 */
export interface AuthConfigPatch {
  mode?: AuthMode
  allowSignup?: boolean
  googleClientId?: string
  /** 空文字は「DB の保存値を消して env に戻す」 */
  googleClientSecret?: string
  allowedEmailDomain?: string
}

// プロセス内キャッシュ（単一プロセス運用を想定）。更新時に破棄する。
let cache: AuthConfig | null = null

function envMode(): AuthMode {
  return parseAuthMode(process.env.NEXT_PUBLIC_AUTH_MODE)
}

function nonEmpty(v: string | null | undefined): string | null {
  const t = (v ?? "").trim()
  return t === "" ? null : t
}

/**
 * 環境変数だけから組んだ設定。
 *
 * DB を待てない同期の文脈（lib/auth.ts の静的 authOptions）で使う。
 * そちらの providers は getServerSession のセッション復元には関与しないため、
 * env の内容で十分。実際のログイン処理は getAuthOptions() 側の DB 設定で動く。
 */
export function getEnvAuthConfig(): AuthConfig {
  const clientId = nonEmpty(process.env.GOOGLE_CLIENT_ID)
  const clientSecret = nonEmpty(process.env.GOOGLE_CLIENT_SECRET)
  return {
    mode: envMode(),
    allowSignup: parseBooleanFlag(process.env.NEXT_PUBLIC_ALLOW_SIGNUP, false),
    googleClientId: clientId ?? "",
    googleClientSecret: clientSecret ?? "",
    allowedEmailDomain: (process.env.ALLOWED_EMAIL_DOMAIN ?? "").trim().toLowerCase(),
    source: {
      mode: "env",
      allowSignup: "env",
      googleClientId: clientId ? "env" : "unset",
      googleClientSecret: clientSecret ? "env" : "unset",
      allowedEmailDomain: "env",
    },
  }
}

/** 認証設定を取得する（DB → env の順に解決）。 */
export async function getAuthConfig(): Promise<AuthConfig> {
  if (cache) return cache

  const row = await prisma.siteConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
    select: {
      authMode: true,
      allowSignup: true,
      googleClientId: true,
      googleClientSecretEnc: true,
      allowedEmailDomain: true,
    },
  })

  const dbClientId = nonEmpty(row.googleClientId)
  const dbSecret = decryptSecret(row.googleClientSecretEnc)
  const envClientId = nonEmpty(process.env.GOOGLE_CLIENT_ID)
  const envSecret = nonEmpty(process.env.GOOGLE_CLIENT_SECRET)

  cache = {
    mode: row.authMode ? parseAuthMode(row.authMode) : envMode(),
    allowSignup:
      row.allowSignup ?? parseBooleanFlag(process.env.NEXT_PUBLIC_ALLOW_SIGNUP, false),
    googleClientId: dbClientId ?? envClientId ?? "",
    googleClientSecret: dbSecret ?? envSecret ?? "",
    // 空文字は「制限なし」という明示的な指定なので、null との区別を保つ
    allowedEmailDomain: (
      row.allowedEmailDomain ??
      process.env.ALLOWED_EMAIL_DOMAIN ??
      ""
    )
      .trim()
      .toLowerCase(),
    source: {
      mode: row.authMode ? "db" : "env",
      allowSignup: row.allowSignup !== null ? "db" : "env",
      googleClientId: dbClientId ? "db" : envClientId ? "env" : "unset",
      googleClientSecret: dbSecret ? "db" : envSecret ? "env" : "unset",
      allowedEmailDomain: row.allowedEmailDomain !== null ? "db" : "env",
    },
  }
  return cache
}

/**
 * 認証設定を更新する。
 * googleClientSecret は暗号化して保存し、空文字なら DB の保存値を消す（＝env に戻る）。
 */
export async function updateAuthConfig(patch: AuthConfigPatch): Promise<AuthConfig> {
  const data: {
    authMode?: string
    allowSignup?: boolean
    googleClientId?: string | null
    googleClientSecretEnc?: string | null
    allowedEmailDomain?: string
  } = {}

  if (patch.mode !== undefined) data.authMode = patch.mode
  if (patch.allowSignup !== undefined) data.allowSignup = patch.allowSignup
  if (patch.googleClientId !== undefined) {
    data.googleClientId = nonEmpty(patch.googleClientId)
  }
  if (patch.googleClientSecret !== undefined) {
    const plain = nonEmpty(patch.googleClientSecret)
    if (plain === null) {
      data.googleClientSecretEnc = null
    } else {
      const enc = encryptSecret(plain)
      if (enc === null) {
        throw new Error(
          "NEXTAUTH_SECRET が未設定のため、シークレットを暗号化して保存できません"
        )
      }
      data.googleClientSecretEnc = enc
    }
  }
  if (patch.allowedEmailDomain !== undefined) {
    data.allowedEmailDomain = patch.allowedEmailDomain.trim().toLowerCase()
  }

  await prisma.siteConfig.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  })
  cache = null
  return getAuthConfig()
}

/**
 * Google Cloud Console の「承認済みのリダイレクト URI」に登録する値。
 *
 * NEXTAUTH_URL の書き方が2通り運用されている:
 *   a) サイトのルートまで        例) https://example.com/gap
 *   b) /api/auth まで含める      例) https://example.com/gap/api/auth
 * NextAuth 自身は b) に正規化して扱うので、ここも同じ結果に寄せる。
 * 実測値（/api/auth/providers の callbackUrl）と一致することを確認済み。
 */
export function googleRedirectUri(
  env: { nextAuthUrl?: string; basePath?: string } = {}
): string {
  const raw = (env.nextAuthUrl ?? process.env.NEXTAUTH_URL ?? "").trim().replace(/\/+$/, "")
  if (raw === "") return ""
  const basePath = (env.basePath ?? process.env.NEXT_PUBLIC_BASE_PATH ?? "")
    .trim()
    .replace(/\/+$/, "")

  const SUFFIX = "/api/auth"
  let root = raw
  if (root.endsWith(SUFFIX)) {
    root = root.slice(0, -SUFFIX.length)
  } else if (basePath && !root.endsWith(basePath)) {
    root = `${root}${basePath}`
  }
  return `${root}${SUFFIX}/callback/google`
}

/** テスト・更新後にキャッシュを破棄する。 */
export function invalidateAuthConfigCache(): void {
  cache = null
}
