"use client"

import { signIn } from "next-auth/react"
import { useState } from "react"
import Link from "next/link"
import { apiUrl, appPath } from "@/lib/api"

export default function RegisterForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const canSubmit =
    !submitting && name.trim() !== "" && email.trim() !== "" && password !== "" && confirm !== ""

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください")
      return
    }
    if (password !== confirm) {
      setError("パスワードが一致しません")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(apiUrl("/api/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? "登録に失敗しました")
        return
      }

      // 登録したメールアドレスとパスワードでそのままログインする
      const signInRes = await signIn("credentials", {
        email: data.email ?? email.trim(),
        password,
        redirect: false,
      })
      if (signInRes?.error) {
        setError("登録は完了しました。ログイン画面からログインしてください")
        return
      }
      // 推しクラブ設定へ（プロフィール未設定のため /profile へ誘導）
      window.location.href = appPath("/profile")
    } catch {
      setError("通信エラーが発生しました。再度お試しください")
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    "w-full bg-white/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/50 transition-colors"
  const labelClass = "block text-sm font-medium text-[var(--foreground)] mb-1.5"

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--accent-cyan)] rounded-2xl mb-4 text-3xl text-[var(--background)]">
            ⚽
          </div>
          <h1 className="text-3xl font-black tracking-tight">ゲスト登録</h1>
          <p className="mt-2 text-[var(--text-muted)] text-sm">
            メールアドレスとパスワードでアカウントを作成します
          </p>
        </div>

        <div className="bg-[var(--surface)] rounded-2xl p-8 shadow-2xl border border-[var(--border)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reg-name" className={labelClass}>
                お名前 <span className="text-red-400">*</span>
              </label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={50}
                autoComplete="name"
                placeholder="例: 田中太郎"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                ランキングに表示される名前です（あとから変更できます）
              </p>
            </div>

            <div>
              <label htmlFor="reg-email" className={labelClass}>
                メールアドレス <span className="text-red-400">*</span>
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                ログイン時のIDになります
              </p>
            </div>

            <div>
              <label htmlFor="reg-password" className={labelClass}>
                パスワード <span className="text-red-400">*</span>
              </label>
              <input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="8文字以上"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="reg-confirm" className={labelClass}>
                パスワード（確認） <span className="text-red-400">*</span>
              </label>
              <input
                id="reg-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            {error && (
              <div className="p-3 bg-red-900/40 border border-red-700 rounded-xl text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-[var(--accent-cyan)] hover:bg-[rgba(14,165,233,0.8)] disabled:opacity-50 text-[var(--background)] font-bold py-3 rounded-xl transition-colors"
            >
              {submitting ? "登録中..." : "登録してはじめる"}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[var(--border)] text-center">
            <p className="text-sm text-[var(--text-muted)]">
              すでにアカウントをお持ちの方は{" "}
              <Link
                href="/login"
                className="text-[var(--accent-cyan)] font-semibold hover:underline"
              >
                ログイン
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
