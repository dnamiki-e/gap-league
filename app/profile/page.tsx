"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import ClubSelect, { type LeagueGroup } from "@/components/ClubSelect"
import AppShell from "@/components/AppShell"
import Link from "next/link"
import { apiUrl } from "@/lib/api"
import { pageClass } from "@/lib/ui"
import { useAuthPolicy } from "@/lib/use-auth-policy"
import { useSiteName } from "@/components/providers/SiteNameProvider"

export default function ProfilePage() {
  // メール+パスワードでのログインが有効な構成か（google 専用構成ではパスワードを持つ意味がない）。
  // 管理画面で切り替えられるので、ビルド時の env ではなく実行時の設定を見る。
  const authPolicy = useAuthPolicy()
  const siteName = useSiteName()
  const passwordAuthEnabled = authPolicy?.passwordEnabled ?? false
  const { data: session, update: updateSession } = useSession()
  const router = useRouter()
  const [displayName, setDisplayName] = useState("")
  const [favoriteClubId, setFavoriteClubId] = useState<string>("")
  const [leagueGroups, setLeagueGroups] = useState<LeagueGroup[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  // パスワード変更／初回設定。hasPassword は DB の passwordHash 有無を反映する。
  const [hasPassword, setHasPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState("")

  // Sync profile fields from session (only when session changes)
  const sessionDisplayName = session?.user?.displayName ?? session?.user?.name ?? ""
  const sessionFavoriteClubId = session?.user?.favoriteClubId ?? ""
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (sessionDisplayName) setDisplayName(sessionDisplayName)
    setFavoriteClubId(sessionFavoriteClubId)
    /* eslint-enable react-hooks/set-state-in-effect */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]) // only re-sync when user identity changes

  useEffect(() => {
    async function loadLeagueGroups() {
      try {
        const res = await fetch(apiUrl("/api/teams/favorites"))
        if (!res.ok) return
        setLeagueGroups(await res.json())
      } catch {
        // ignore
      }
    }
    async function loadProfileMeta() {
      try {
        const res = await fetch(apiUrl("/api/user/profile"))
        if (!res.ok) return
        const data = await res.json()
        setHasPassword(Boolean(data?.hasPassword))
      } catch {
        // ignore
      }
    }
    loadLeagueGroups()
    loadProfileMeta()
  }, [])

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPwError("")
    setPwSaved(false)

    if (newPassword.length < 8) {
      setPwError("パスワードは8文字以上にしてください")
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError("パスワードが一致しません")
      return
    }

    setPwSaving(true)
    try {
      const res = await fetch(apiUrl("/api/user/password"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          hasPassword ? { currentPassword, newPassword } : { newPassword }
        ),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          data.error ??
            (hasPassword
              ? "パスワードの変更に失敗しました"
              : "パスワードの設定に失敗しました")
        )
      }
      setPwSaved(true)
      setHasPassword(true)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setPwSaving(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaving(true)
    setSaved(false)

    try {
      const res = await fetch(apiUrl("/api/user/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          favoriteClubId: favoriteClubId || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "プロフィールの保存に失敗しました")
      }

      await updateSession()
      setSaved(true)
      setTimeout(() => {
        router.push("/home")
      }, 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setSaving(false)
    }
  }

  const isSetup = !session?.user?.profileSetup

  return (
    <AppShell title="プロフィール">
      <div className={pageClass("form")}>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#f1f5f9]">プロフィール設定</h1>
          {isSetup && (
            <p className="text-[#94a3b8] mt-1 text-sm">
              {siteName} へようこそ！まずプロフィールを設定してください。
            </p>
          )}
        </div>

        {/* Current user info */}
        {session?.user && (
          <div className="bg-[#1a1f2e] rounded-2xl p-5 border border-white/10 mb-6 flex items-center gap-4">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt=""
                className="w-14 h-14 rounded-full border-2 border-white/20"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#38bdf8]/20 flex items-center justify-center text-[#38bdf8] font-bold text-xl">
                {(session.user.displayName ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-[#f1f5f9] font-semibold">{session.user.displayName ?? session.user.name ?? "(未設定)"}</p>
              <p className="text-[#94a3b8] text-sm">{session.user.email}</p>
            </div>
          </div>
        )}

        <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#f1f5f9] mb-2">
                表示名 <span className="text-[#f87171]">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例: 田中太郎"
                required
                maxLength={50}
                className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 focus:border-[#38bdf8]/50 placeholder-[#94a3b8]/50 transition-colors"
              />
              <p className="mt-1 text-xs text-[#94a3b8]">ランキングに表示される名前です</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#f1f5f9] mb-2">
                推しクラブ
              </label>
              <ClubSelect
                groups={leagueGroups}
                value={favoriteClubId}
                onChange={setFavoriteClubId}
              />
              <p className="mt-1 text-xs text-[#94a3b8]">ランキングに応援クラブのエンブレムが表示されます</p>
            </div>

            {error && (
              <div className="p-3 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl text-sm text-[#f87171]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !displayName.trim()}
              className="w-full bg-[#38bdf8] hover:bg-[#38bdf8]/80 disabled:bg-white/10 disabled:text-[#94a3b8] text-[#0f1117] font-bold py-3 rounded-xl transition-colors"
            >
              {saving ? "保存中..." : saved ? "✓ 保存しました" : "プロフィールを保存"}
            </button>
          </form>
        </div>

        {/* Password change / 初回設定 */}
        {passwordAuthEnabled && (
          <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10 mt-6">
            <h2 className="text-base font-bold text-[#f1f5f9] mb-1">
              {hasPassword ? "パスワード変更" : "パスワードを設定"}
            </h2>
            <p className="text-xs text-[#94a3b8] mb-4">
              {hasPassword
                ? "メールアドレスとパスワードでログインする際に使います"
                : "設定すると、Google を使わずメールアドレスとパスワードでもログインできます"}
            </p>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              {hasPassword && (
                <div>
                  <label className="block text-sm font-medium text-[#f1f5f9] mb-1.5">
                    現在のパスワード
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 transition-colors"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1.5">
                  {hasPassword ? "新しいパスワード" : "パスワード"}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="8文字以上"
                  className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1.5">
                  {hasPassword ? "新しいパスワード（確認）" : "パスワード（確認）"}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 transition-colors"
                />
              </div>

              {pwError && (
                <div className="p-3 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl text-sm text-[#f87171]">
                  {pwError}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  pwSaving || !newPassword || (hasPassword && !currentPassword)
                }
                className="w-full bg-white/10 hover:bg-white/15 disabled:opacity-50 text-[#f1f5f9] font-semibold py-3 rounded-xl transition-colors"
              >
                {pwSaving
                  ? "保存中..."
                  : pwSaved
                    ? "✓ 保存しました"
                    : hasPassword
                      ? "パスワードを変更"
                      : "パスワードを設定"}
              </button>
            </form>
          </div>
        )}

        {/* Admin link */}
        {session?.user?.isAdmin && (
          <div className="mt-6">
            <Link
              href="/admin"
              className="block bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-2xl p-5 hover:bg-[#a78bfa]/15 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#a78bfa]">管理画面</p>
                  <p className="text-xs text-[#94a3b8] mt-0.5">シーズン管理・ユーザー管理</p>
                </div>
                <span className="text-[#a78bfa] text-xs bg-[#a78bfa]/10 px-2 py-1 rounded-full font-semibold">Admin →</span>
              </div>
            </Link>
          </div>
        )}

        {/* Sign out */}
        <div className="mt-4 text-center">
          <Link
            href="/api/auth/signout"
            className="text-sm text-[#94a3b8] hover:text-[#f87171] transition-colors"
          >
            サインアウト
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
