/**
 * 認証モードと自己登録（ゲスト登録）の可否を判定する純粋ロジック。
 * サーバ／クライアント両方から参照するため、副作用と DB アクセスを持たない。
 */

/**
 * 認証モード:
 *   google   : Google OAuth のみ（ALLOWED_EMAIL_DOMAIN でドメイン制限）
 *   password : メール+パスワードのみ
 *   both     : 両方を並べて出す（Google または ゲスト登録）
 */
export type AuthMode = "google" | "password" | "both"

export function parseAuthMode(raw: string | undefined | null): AuthMode {
  switch ((raw ?? "password").trim().toLowerCase()) {
    case "google":
      return "google"
    case "both":
      return "both"
    default:
      return "password"
  }
}

export function isGoogleEnabled(mode: AuthMode): boolean {
  return mode === "google" || mode === "both"
}

export function isPasswordEnabled(mode: AuthMode): boolean {
  return mode === "password" || mode === "both"
}

/** 環境変数の真偽値パース（"1" / "true" / "yes" / "on" を真とする）。 */
export function parseBooleanFlag(
  raw: string | undefined | null,
  fallback = false
): boolean {
  if (raw == null || raw.trim() === "") return fallback
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase())
}

/** メールアドレスを比較・保存用に正規化する（前後空白除去 + 小文字化）。 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** メールアドレスのドメイン部（小文字）。取得できなければ空文字。 */
export function emailDomain(raw: string): string {
  const at = normalizeEmail(raw).lastIndexOf("@")
  return at < 0 ? "" : normalizeEmail(raw).slice(at + 1)
}

export type SignupPolicy = {
  /** 自己登録機能そのものが有効か */
  allowSignup: boolean
  /** Google ログインが有効か */
  googleEnabled: boolean
  /** Google 側で許可しているメールドメイン（未設定なら空文字） */
  allowedEmailDomain: string
}

/**
 * 自己登録を拒否すべきかを判定する。拒否理由（利用者向け文言）を返し、
 * 受け付けてよい場合は null を返す。
 *
 * 制限ドメインのアドレスを自己登録で押さえられると、後から本人が Google で
 * ログインした際に同一メールのアカウントへ紐付いてしまう（アカウント乗っ取り）。
 * そのため制限ドメイン宛の自己登録は塞ぎ、Google ログインへ誘導する。
 */
export function rejectSignupReason(
  email: string,
  policy: SignupPolicy
): string | null {
  if (!policy.allowSignup) {
    return "現在、新規登録は受け付けていません"
  }
  const domain = policy.allowedEmailDomain.trim().toLowerCase()
  if (policy.googleEnabled && domain && emailDomain(email) === domain) {
    return `@${domain} のアドレスは Google ログインをご利用ください`
  }
  return null
}

/** Google ログインの判定に必要な、既存ユーザーの状態 */
export interface ExistingUserState {
  isActive: boolean
  passwordHash: string | null
  /** 同じユーザーに Google の Account 行が既に紐付いているか */
  hasGoogleAccount: boolean
}

export interface GoogleSignInPolicy {
  /** 許可するメールドメイン。空文字なら制限なし */
  allowedEmailDomain: string
  /**
   * 自己登録を許可しているか。
   * false = 招待制。管理者が先に登録したメールアドレスだけがログインできる。
   */
  allowSignup: boolean
  /**
   * env ADMIN_EMAILS。初期管理者のブートストラップ用に招待制を通す。
   * これが無いと、新規構築時に User 行が1件も無いまま招待制になり、
   * 誰もログインできない（＝招待を出す管理者を作れない）。
   */
  bootstrapAdminEmails: string[]
}

/**
 * Google ログインを拒否すべきかを判定する。拒否理由を返し、通してよければ null。
 *
 * 判定を純粋関数に出しているのは、NextAuth の signIn コールバックの中に
 * 条件を積み上げると、どの経路が塞がっているのかテストで確かめられなくなるため。
 */
export function rejectGoogleSignInReason(
  email: string,
  existing: ExistingUserState | null,
  policy: GoogleSignInPolicy
): string | null {
  const normalized = normalizeEmail(email)
  const domain = policy.allowedEmailDomain.trim().toLowerCase()

  if (domain && emailDomain(normalized) !== domain) {
    return `domain-not-allowed:${domain}`
  }

  // 乗っ取り防止: 同一メールで「パスワード登録済み・Google 未紐付け」の
  // アカウントが既にある場合は自動統合させない。
  // （第三者が他人のアドレスで自己登録し、本人の Google ログインを
  //   自分のパスワード付きアカウントへ引き込むのを防ぐ）
  if (existing?.passwordHash && !existing.hasGoogleAccount) {
    return "password-account-exists"
  }

  // 無効化されたユーザーは Google でも入れない
  // （パスワード側は authorize() で弾いている）
  if (existing && !existing.isActive) {
    return "user-deactivated"
  }

  // 招待制: 管理者が先に登録したアドレスだけ通す。
  // 既存ユーザーが無い＝新規作成になるので、ここで止める。
  if (!policy.allowSignup && existing === null) {
    const bootstrap = policy.bootstrapAdminEmails.map((e) => normalizeEmail(e))
    if (!bootstrap.includes(normalized)) {
      return "invitation-required"
    }
  }

  return null
}
