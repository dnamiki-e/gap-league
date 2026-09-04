"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { apiUrl, appPath } from "@/lib/api"
import { LEAGUE_GROUPS } from "@/lib/league-teams"
import { useSiteName } from "@/components/providers/SiteNameProvider"

type Status = "loading" | "invalid" | "ready" | "submitting"

export default function InvitePage() {
  const params = useParams()
  const siteName = useSiteName()
  const token = Array.isArray(params.token) ? params.token[0] : (params.token ?? "")

  const [status, setStatus] = useState<Status>("loading")
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [favoriteClubId, setFavoriteClubId] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    async function validate() {
      try {
        const res = await fetch(apiUrl(`/api/invite/${token}`))
        if (!res.ok) {
          setStatus("invalid")
          return
        }
        const data = await res.json()
        setEmail(data.email ?? "")
        setDisplayName(data.nickname ?? "")
        setStatus("ready")
      } catch {
        setStatus("invalid")
      }
    }
    validate()
  }, [token])

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

    setStatus("submitting")
    try {
      const res = await fetch(apiUrl(`/api/invite/${token}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          displayName: displayName.trim(),
          favoriteClubId: favoriteClubId || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "登録に失敗しました")
        setStatus("ready")
        return
      }
      // 設定したパスワードでそのままログイン
      await signIn("credentials", {
        email,
        password,
        callbackUrl: appPath("/home"),
      })
    } catch {
      setError("登録に失敗しました")
      setStatus("ready")
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--accent-cyan)] rounded-2xl mb-4 text-3xl text-[var(--background)]">
            ⚽
          </div>
          <h1 className="text-3xl font-black tracking-tight">{siteName}</h1>
          <p className="mt-2 text-[var(--text-muted)]">アカウント登録</p>
        </div>

        <div className="bg-[var(--surface)] rounded-2xl p-8 shadow-2xl border border-[var(--border)]">
          {status === "loading" && (
            <p className="text-center text-[var(--text-muted)] py-8">確認中...</p>
          )}

          {status === "invalid" && (
            <div className="text-center py-6 space-y-3">
              <p className="text-4xl">⚠️</p>
              <h2 className="text-lg font-semibold">招待リンクが無効です</h2>
              <p className="text-sm text-[var(--text-muted)]">
                この招待リンクは期限切れか、すでに使用されています。
                <br />
                管理者に再発行を依頼してください。
              </p>
            </div>
          )}

          {(status === "ready" || status === "submitting") && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-[var(--text-muted)] text-center mb-2">
                <span className="text-[var(--foreground)] font-medium">{email}</span>
                <br />
                パスワードを設定して登録を完了してください。
              </p>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  ニックネーム <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  maxLength={50}
                  placeholder="ランキングに表示される名前"
                  className="w-full bg-white/5 border border-[var(--border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  パスワード <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="8文字以上"
                  className="w-full bg-white/5 border border-[var(--border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  パスワード（確認） <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full bg-white/5 border border-[var(--border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  推しクラブ <span className="text-[var(--text-muted)] text-xs">(任意・後で変更可)</span>
                </label>
                <select
                  value={favoriteClubId}
                  onChange={(e) => setFavoriteClubId(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/50 transition-colors appearance-none"
                >
                  <option value="">選択しない</option>
                  {LEAGUE_GROUPS.map((group) => (
                    <optgroup key={group.code} label={group.name}>
                      {group.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {error && (
                <div className="p-3 bg-red-900/40 border border-red-700 rounded-xl text-sm text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full bg-[var(--accent-cyan)] hover:bg-[rgba(14,165,233,0.8)] disabled:opacity-50 text-[var(--background)] font-bold py-3 rounded-xl transition-colors"
              >
                {status === "submitting" ? "登録中..." : "登録してはじめる"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
