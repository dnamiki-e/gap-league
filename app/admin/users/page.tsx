"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import TeamCrest from "@/components/TeamCrest"
import { apiUrl } from "@/lib/api"
import { useAuthPolicy } from "@/lib/use-auth-policy"

interface Score {
  totalPoints: number
  season: { name: string }
}

interface User {
  id: string
  name: string | null
  email: string | null
  image: string | null
  displayName: string | null
  isAdmin: boolean
  isActive: boolean
  profileSetup: boolean
  createdAt: string
  favoriteClub: {
    name: string
    crestUrl: string | null
    tla: string | null
  } | null
  scores: Score[]
  _count: { predictions: number }
}


/**
 * ON/OFF トグル。
 * OFF 時の溝が淡いままだと白いつまみが溶けるため（実測コントラスト比 1.15:1）、
 * つまみに濃い枠線を付けて境界を 3:1 以上にし、高さも 24px に上げる。
 */
function Toggle({
  on,
  onColor,
  onClick,
  disabled,
  title,
  label,
}: {
  on: boolean
  onColor: string
  onClick: () => void
  disabled?: boolean
  title: string
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-11 h-6 shrink-0 rounded-full border transition-colors ${
        on
          ? `${onColor} border-transparent`
          : "bg-[#94a3b8]/30 border-[#94a3b8]/50 hover:bg-[#94a3b8]/45"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`block w-4 h-4 rounded-full bg-white mx-auto transition-transform border ${
          on ? "border-transparent" : "border-[#475569]"
        }`}
        style={{ transform: on ? "translateX(10px)" : "translateX(-10px)" }}
      />
    </button>
  )
}

export default function AdminUsersPage() {
  const { data: session } = useSession()
  // 招待リンク発行はメール+パスワードでログインできる構成のときだけ意味がある。
  // 管理画面で切り替えられるので、ビルド時の env ではなく実行時の設定を見る。
  const authPolicy = useAuthPolicy()
  const inviteEnabled = authPolicy?.passwordEnabled ?? false
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [updating, setUpdating] = useState<string | null>(null)

  // ユーザー発行（招待リンク）— password モードのみ
  const [newEmail, setNewEmail] = useState("")
  const [newNickname, setNewNickname] = useState("")
  const [inviting, setInviting] = useState(false)
  const [inviteUrl, setInviteUrl] = useState("")
  const [inviteError, setInviteError] = useState("")
  const [copied, setCopied] = useState(false)

  // ユーザー削除（確認モーダル）
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/admin/users"))
      if (!res.ok) throw new Error("ユーザーの取得に失敗しました")
      const data = await res.json()
      setUsers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers()
  }, [loadUsers])

  async function inviteUser(e: React.FormEvent) {
    e.preventDefault()
    setInviteError("")
    setInviteUrl("")
    setInviting(true)
    try {
      const res = await fetch(apiUrl("/api/admin/users"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          nickname: newNickname.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "招待の発行に失敗しました")
      setInviteUrl(`${window.location.origin}${data.invitePath}`)
      setNewEmail("")
      setNewNickname("")
      setCopied(false)
      await loadUsers()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "エラー")
    } finally {
      setInviting(false)
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // クリップボード非対応環境では手動コピー
    }
  }

  async function toggleAdmin(userId: string, isAdmin: boolean) {
    setUpdating(userId)
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${userId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: !isAdmin }),
      })
      if (!res.ok) throw new Error("更新に失敗しました")
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラー")
    } finally {
      setUpdating(null)
    }
  }

  async function toggleActive(userId: string, isActive: boolean) {
    if (isActive) {
      const confirmed = window.confirm("このユーザーを無効化しますか？セッションが即時失効します。")
      if (!confirmed) return
    }
    setUpdating(userId)
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${userId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      })
      if (!res.ok) throw new Error("更新に失敗しました")
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラー")
    } finally {
      setUpdating(null)
    }
  }

  function openDeleteDialog(user: User) {
    setDeleteTarget(user)
    setDeleteConfirmText("")
    setDeleteError("")
  }

  function closeDeleteDialog() {
    if (deleting) return
    setDeleteTarget(null)
    setDeleteConfirmText("")
    setDeleteError("")
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const hasData = deleteTarget._count.predictions > 0 || deleteTarget.scores.length > 0
    setDeleting(true)
    setDeleteError("")
    try {
      const res = await fetch(
        apiUrl(`/api/admin/users/${deleteTarget.id}${hasData ? "?force=true" : ""}`),
        { method: "DELETE" }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "削除に失敗しました")
      setDeleteTarget(null)
      setDeleteConfirmText("")
      await loadUsers()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setDeleting(false)
    }
  }

  // 予想・スコアを持つユーザーはメールアドレスの一致入力を必須にする
  const deleteHasData =
    !!deleteTarget &&
    (deleteTarget._count.predictions > 0 || deleteTarget.scores.length > 0)
  const deleteConfirmed =
    !deleteHasData || deleteConfirmText.trim() === (deleteTarget?.email ?? "")

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[#94a3b8]">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f1f5f9]">ユーザー管理</h1>
        <p className="text-[#94a3b8] mt-1 text-sm">
          {users.length} ユーザー登録済み
        </p>
      </div>

      {error && (
        <div className="p-4 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl text-sm text-[#f87171]">
          {error}
        </div>
      )}

      {/* ユーザー発行（招待リンク）— password モードのみ */}
      {inviteEnabled && (
        <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#f1f5f9]">参加者を追加</h2>
            <p className="text-[#94a3b8] text-xs mt-0.5">
              発行された招待リンクを参加者に送ると、初回ログイン時にパスワードを設定して参加できます。
            </p>
          </div>
          <form onSubmit={inviteUser} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              placeholder="メールアドレス"
              className="flex-1 bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 transition-colors"
            />
            <input
              type="text"
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              maxLength={50}
              placeholder="ニックネーム（任意）"
              className="flex-1 bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 transition-colors"
            />
            <button
              type="submit"
              disabled={inviting || !newEmail.trim()}
              className="bg-[#38bdf8] hover:bg-[#38bdf8]/80 disabled:opacity-50 text-[#0f1117] font-bold px-5 py-2.5 rounded-xl text-sm whitespace-nowrap transition-colors"
            >
              {inviting ? "発行中..." : "招待リンクを発行"}
            </button>
          </form>

          {inviteError && (
            <div className="p-3 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl text-sm text-[#f87171]">
              {inviteError}
            </div>
          )}

          {inviteUrl && (
            <div className="p-3 bg-[#4ade80]/10 border border-[#4ade80]/30 rounded-xl space-y-2">
              <p className="text-xs text-[#4ade80] font-medium">
                招待リンクを発行しました。コピーして参加者に送ってください（7日間有効）。
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 bg-black/30 border border-white/10 text-[#f1f5f9] rounded-lg px-3 py-2 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={copyInvite}
                  className="bg-white/10 hover:bg-white/20 text-[#f1f5f9] px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors"
                >
                  {copied ? "✓ コピー済" : "コピー"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* スマホ: 8列の表では管理者・アクティブ・削除が初期表示に入らないため、
          1ユーザー=1カードに切り替えて操作をすべて画面内に収める。 */}
      <div className="md:hidden space-y-3">
        {users.map((user) => (
          <div
            key={user.id}
            className={`bg-[#1a1f2e] rounded-2xl border border-white/10 p-4 space-y-3 ${
              !user.isActive ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  className="w-10 h-10 rounded-full border border-white/20 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 shrink-0 rounded-full bg-[#38bdf8]/20 flex items-center justify-center text-sm font-bold text-[#38bdf8]">
                  {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[#f1f5f9] font-medium truncate">
                  {user.displayName ?? user.name ?? "(未設定)"}
                </p>
                <p className="text-[#94a3b8] text-xs truncate">{user.email}</p>
                {!user.profileSetup && (
                  <span className="text-xs text-[#fbbf24]">プロフィール未設定</span>
                )}
              </div>
              {user.id === session?.user?.id ? (
                <span className="text-[#94a3b8]/40 text-xs shrink-0">自分</span>
              ) : (
                <button
                  onClick={() => openDeleteDialog(user)}
                  disabled={updating === user.id}
                  className="shrink-0 text-xs font-semibold text-[#f87171] hover:bg-[#f87171]/10 disabled:opacity-40 px-3 py-2 rounded-lg transition-colors"
                >
                  削除
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#94a3b8]">
              <span className="flex items-center gap-1.5">
                推し:
                {user.favoriteClub ? (
                  <>
                    <TeamCrest
                      crestUrl={user.favoriteClub.crestUrl}
                      teamName={user.favoriteClub.name}
                      size={16}
                    />
                    {user.favoriteClub.tla ?? user.favoriteClub.name}
                  </>
                ) : (
                  "-"
                )}
              </span>
              <span>予想 {user._count.predictions}</span>
              <span>{new Date(user.createdAt).toLocaleDateString("ja-JP")}</span>
            </div>

            {user.scores.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {user.scores.slice(0, 3).map((score, i) => (
                  <span key={i} className="text-xs text-[#94a3b8]">
                    {score.season.name}:{" "}
                    <span className="font-bold text-[#f1f5f9] tabular">{score.totalPoints}</span>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-5 pt-1 border-t border-white/5">
              <label className="flex items-center gap-2 text-xs text-[#94a3b8]">
                管理者
                <Toggle
                  on={user.isAdmin}
                  onColor="bg-[#a78bfa]"
                  onClick={() => toggleAdmin(user.id, user.isAdmin)}
                  disabled={updating === user.id}
                  title={user.isAdmin ? "管理者権限を解除" : "管理者に設定"}
                  label={`${user.displayName ?? user.email ?? "このユーザー"} の管理者権限`}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-[#94a3b8]">
                アクティブ
                <Toggle
                  on={user.isActive}
                  onColor="bg-[#4ade80]"
                  onClick={() => toggleActive(user.id, user.isActive)}
                  disabled={updating === user.id}
                  title={user.isActive ? "無効化" : "有効化"}
                  label={`${user.displayName ?? user.email ?? "このユーザー"} のアクティブ状態`}
                />
              </label>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 py-12 text-center text-[#94a3b8]">
            ユーザーがいません
          </div>
        )}
      </div>

      <div className="hidden md:block bg-[#1a1f2e] rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#94a3b8] text-xs uppercase tracking-wider border-b border-white/10">
                <th className="px-4 py-3">ユーザー</th>
                <th className="px-4 py-3">推しクラブ</th>
                <th className="px-4 py-3 text-center">予想数</th>
                <th className="px-4 py-3">スコア</th>
                <th className="px-4 py-3 text-center">管理者</th>
                <th className="px-4 py-3 text-center">アクティブ</th>
                <th className="px-4 py-3">登録日</th>
                <th className="px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((user) => (
                <tr
                  key={user.id}
                  className={`hover:bg-white/3 transition-colors ${
                    !user.isActive ? "opacity-50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {user.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.image}
                          alt={user.displayName ?? ""}
                          className="w-8 h-8 rounded-full border border-white/20"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#38bdf8]/20 flex items-center justify-center text-sm font-bold text-[#38bdf8]">
                          {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[#f1f5f9] font-medium truncate max-w-[160px]">
                          {user.displayName ?? user.name ?? "(未設定)"}
                        </p>
                        <p className="text-[#94a3b8] text-xs truncate max-w-[160px]">
                          {user.email}
                        </p>
                        {!user.profileSetup && (
                          <span className="text-xs text-[#fbbf24]">プロフィール未設定</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.favoriteClub ? (
                      <div className="flex items-center gap-2">
                        <TeamCrest
                          crestUrl={user.favoriteClub.crestUrl}
                          teamName={user.favoriteClub.name}
                          size={20}
                        />
                        <span className="text-[#94a3b8] text-xs">
                          {user.favoriteClub.tla ?? user.favoriteClub.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[#94a3b8]/30">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-[#f1f5f9] tabular">{user._count.predictions}</span>
                  </td>
                  <td className="px-4 py-3">
                    {user.scores.length > 0 ? (
                      <div className="space-y-0.5">
                        {user.scores.slice(0, 2).map((score, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <span className="text-xs text-[#94a3b8]">{score.season.name}:</span>
                            <span className="text-xs font-bold text-[#f1f5f9] tabular">
                              {score.totalPoints}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[#94a3b8]/30 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle
                      on={user.isAdmin}
                      onColor="bg-[#a78bfa]"
                      onClick={() => toggleAdmin(user.id, user.isAdmin)}
                      disabled={updating === user.id}
                      title={user.isAdmin ? "管理者権限を解除" : "管理者に設定"}
                      label={`${user.displayName ?? user.email ?? "このユーザー"} の管理者権限`}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle
                      on={user.isActive}
                      onColor="bg-[#4ade80]"
                      onClick={() => toggleActive(user.id, user.isActive)}
                      disabled={updating === user.id}
                      title={user.isActive ? "無効化" : "有効化"}
                      label={`${user.displayName ?? user.email ?? "このユーザー"} のアクティブ状態`}
                    />
                  </td>
                  <td className="px-4 py-3 text-[#94a3b8] text-xs">
                    {new Date(user.createdAt).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {user.id === session?.user?.id ? (
                      <span className="text-[#94a3b8]/40 text-xs">自分</span>
                    ) : (
                      <button
                        onClick={() => openDeleteDialog(user)}
                        disabled={updating === user.id}
                        className="text-xs font-semibold text-[#f87171] hover:bg-[#f87171]/10 disabled:opacity-40 px-2.5 py-1.5 rounded-lg transition-colors"
                        title="このユーザーを削除"
                      >
                        削除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="py-12 text-center text-[#94a3b8]">
              ユーザーがいません
            </div>
          )}
        </div>
      </div>

      {/* 削除確認ダイアログ。予想・スコアを持つユーザーはメールアドレスの入力を要求する。 */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-user-title"
          onClick={closeDeleteDialog}
        >
          <div
            className="w-full max-w-md bg-[#1a1f2e] rounded-2xl border border-white/10 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-user-title" className="text-lg font-bold text-[#f1f5f9]">
              ユーザーを削除しますか？
            </h2>

            <div className="mt-4 p-3 bg-black/30 rounded-xl border border-white/5">
              <p className="text-[#f1f5f9] font-medium text-sm">
                {deleteTarget.displayName ?? deleteTarget.name ?? "(未設定)"}
              </p>
              <p className="text-[#94a3b8] text-xs mt-0.5">{deleteTarget.email}</p>
            </div>

            {deleteHasData ? (
              <div className="mt-4 space-y-3">
                <div className="p-3 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl text-sm text-[#f87171]">
                  <p className="font-semibold">この操作は取り消せません。</p>
                  <p className="mt-1 text-xs">
                    予想 {deleteTarget._count.predictions} 件・スコア{" "}
                    {deleteTarget.scores.length} 件も一緒に削除され、ランキングと分析から消えます。
                    残したい場合は「アクティブ」を切って無効化してください。
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="delete-confirm"
                    className="block text-xs font-medium text-[#f1f5f9] mb-1.5"
                  >
                    確認のため <span className="font-mono text-[#fbbf24]">{deleteTarget.email}</span>{" "}
                    と入力してください
                  </label>
                  <input
                    id="delete-confirm"
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    autoComplete="off"
                    className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#f87171]/50 transition-colors"
                  />
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[#94a3b8]">
                このユーザーは予想を登録していないため、影響はありません。
              </p>
            )}

            {deleteError && (
              <div className="mt-4 p-3 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl text-sm text-[#f87171]">
                {deleteError}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={deleting}
                className="flex-1 bg-white/10 hover:bg-white/15 disabled:opacity-50 text-[#f1f5f9] font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting || !deleteConfirmed}
                className="flex-1 bg-[#f87171] hover:bg-[#f87171]/80 disabled:opacity-40 text-[#0f1117] font-bold py-2.5 rounded-xl text-sm transition-colors"
              >
                {deleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
