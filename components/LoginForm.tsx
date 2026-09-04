"use client"

import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { resolveCallbackUrl } from "@/lib/api"
import type { AuthMode } from "@/lib/auth-policy"
import { isGoogleEnabled, isPasswordEnabled } from "@/lib/auth-policy"
import GoogleIcon from "@/components/GoogleIcon"
import { useSiteName } from "@/components/providers/SiteNameProvider"

export default function LoginForm({
  mode,
  allowSignup = false,
}: {
  mode: AuthMode
  allowSignup?: boolean
}) {
  const searchParams = useSearchParams()
  const siteName = useSiteName()
  const error = searchParams.get("error")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  const showGoogle = isGoogleEnabled(mode)
  const showPassword = isPasswordEnabled(mode)

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")
    setSubmitting(true)
    try {
      const res = await signIn("credentials", { email, password, redirect: false })
      if (res?.error) {
        setFormError("メールアドレスまたはパスワードが正しくありません")
        return
      }
      window.location.href = resolveCallbackUrl(searchParams.get("callbackUrl"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo and title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--accent-cyan)] rounded-2xl mb-4 text-3xl text-[var(--background)]">
            ⚽
          </div>
          <h1 className="text-4xl font-black text-[var(--foreground)] tracking-tight">
            {siteName}
          </h1>
          <p className="mt-2 text-[var(--text-muted)] text-lg">
            サッカー順位予想サービス
          </p>
        </div>

        {/* Login card */}
        <div className="bg-[var(--surface)] rounded-2xl p-8 shadow-2xl border border-[var(--border)]">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-6 text-center">
            ログイン
          </h2>

          {error && (
            <div className="mb-6 p-4 bg-red-900/40 border border-red-700 rounded-xl text-sm text-red-300 text-center">
              {error === "AccessDenied"
                ? "このアカウントではログインできません。招待を受けたアドレスでない、または管理者が利用を停止した可能性があります。心当たりがない場合は管理者にお問い合わせください。"
                : "ログインエラーが発生しました。再度お試しください。"}
            </div>
          )}

          {showGoogle && (
            <>
              <button
                onClick={() =>
                  signIn("google", {
                    callbackUrl: resolveCallbackUrl(searchParams.get("callbackUrl")),
                  })
                }
                className="w-full flex items-center justify-center gap-3 bg-[var(--accent-cyan)] hover:bg-[rgba(14,165,233,0.8)] text-[var(--background)] font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <GoogleIcon className="w-5 h-5" />
                Googleでログイン
              </button>
              <p className="mt-2 text-xs text-[var(--text-muted)] text-center">
                招待されたGoogleアカウントでログインできます
              </p>
            </>
          )}

          {showGoogle && showPassword && (
            <div className="flex items-center gap-3 my-6">
              <span className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-xs text-[var(--text-muted)]">または</span>
              <span className="flex-1 h-px bg-[var(--border)]" />
            </div>
          )}

          {showPassword && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
                >
                  メールアドレス
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full bg-white/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/50 transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
                >
                  パスワード
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-white/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/50 transition-colors"
                />
              </div>

              {formError && (
                <div className="p-3 bg-red-900/40 border border-red-700 rounded-xl text-sm text-red-300">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !email || !password}
                className="w-full bg-white/10 hover:bg-white/15 disabled:opacity-50 text-[var(--foreground)] font-bold py-3 rounded-xl transition-colors"
              >
                {submitting ? "ログイン中..." : "メールアドレスでログイン"}
              </button>
            </form>
          )}

          {showPassword && (
            <div className="mt-6 pt-5 border-t border-[var(--border)] text-center">
              {allowSignup ? (
                <p className="text-sm text-[var(--text-muted)]">
                  アカウントをお持ちでない方は{" "}
                  <Link
                    href="/register"
                    className="text-[var(--accent-cyan)] font-semibold hover:underline"
                  >
                    ゲスト登録
                  </Link>
                </p>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  アカウントは管理者が発行します。招待リンクから初回パスワードを設定してください。
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
