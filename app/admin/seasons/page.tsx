"use client"

import { useState, useEffect, useCallback } from "react"
import { apiUrl } from "@/lib/api"
import { LEAGUE_GROUPS } from "@/lib/league-teams"
import { getTotalMatchdays, getEndgameRemaining } from "@/lib/season-visibility"

interface Season {
  id: string
  leagueCode: string
  seasonYear: number
  name: string
  predictionDeadline: string
  isLocked: boolean
  isActive: boolean
  resultsRevealed: boolean
  minPlayed: number
  maxPlayed: number
  standingsCount: number
  _count: { predictions: number; seasonTeams: number }
}

interface SyncResult {
  teamsUpserted: number
  standingsUpserted: number
  scoresRecalculated: number
  warnings: string[]
  errors: string[]
}

export default function AdminSeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({})
  const [error, setError] = useState("")

  const [editingDeadline, setEditingDeadline] = useState<string | null>(null)
  const [deadlineValue, setDeadlineValue] = useState("")
  const [savingDeadline, setSavingDeadline] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState({
    leagueCode: "PL",
    seasonYear: new Date().getFullYear(),
    name: "",
    predictionDeadline: "",
  })

  const loadSeasons = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/admin/seasons"))
      if (!res.ok) throw new Error("シーズンの取得に失敗しました")
      const data = await res.json()
      setSeasons(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSeasons()
  }, [loadSeasons])

  async function createSeason(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError("")

    try {
      const res = await fetch(apiUrl("/api/admin/seasons"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          predictionDeadline: new Date(formData.predictionDeadline).toISOString(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "シーズンの作成に失敗しました")
      }

      setShowForm(false)
      setFormData({
        leagueCode: "PL",
        seasonYear: new Date().getFullYear(),
        name: "",
        predictionDeadline: "",
      })
      await loadSeasons()
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setCreating(false)
    }
  }

  async function toggleLock(seasonId: string, isLocked: boolean) {
    if (!isLocked) {
      const confirmed = window.confirm("シーズンを確定します。この操作は取り消せません。続行しますか？")
      if (!confirmed) return
    }
    try {
      const res = await fetch(apiUrl(`/api/admin/seasons/${seasonId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLocked: !isLocked }),
      })
      if (!res.ok) throw new Error("更新に失敗しました")
      await loadSeasons()
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラー")
    }
  }

  async function toggleReveal(season: Season) {
    if (!season.resultsRevealed) {
      // 開示する場合：厳重な確認
      const confirmed = window.confirm(
        `本当に「${season.name}」の結果を開示します。\n\n` +
        `全ユーザーの順位・スコアが一斉に公開され、ネタバレ状態になります。\n` +
        `この操作は取り消し可能ですが、一度公開した情報を「見なかったこと」にはできません。\n\n` +
        `本当によろしいですか？`,
      )
      if (!confirmed) return
    } else {
      const confirmed = window.confirm(
        `「${season.name}」の結果開示を取り消して非公開に戻します。\n続行しますか？`,
      )
      if (!confirmed) return
    }
    try {
      const res = await fetch(apiUrl(`/api/admin/seasons/${season.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultsRevealed: !season.resultsRevealed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "更新に失敗しました")
      }
      await loadSeasons()
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラー")
    }
  }

  async function toggleActive(seasonId: string, isActive: boolean) {
    try {
      const res = await fetch(apiUrl(`/api/admin/seasons/${seasonId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      })
      if (!res.ok) throw new Error("更新に失敗しました")
      await loadSeasons()
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラー")
    }
  }

  function startEditDeadline(season: Season) {
    const d = new Date(season.predictionDeadline)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setDeadlineValue(local)
    setEditingDeadline(season.id)
  }

  async function saveDeadline(seasonId: string) {
    setSavingDeadline(true)
    try {
      const res = await fetch(apiUrl(`/api/admin/seasons/${seasonId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionDeadline: new Date(deadlineValue).toISOString() }),
      })
      if (!res.ok) throw new Error("更新に失敗しました")
      setEditingDeadline(null)
      await loadSeasons()
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラー")
    } finally {
      setSavingDeadline(false)
    }
  }

  async function syncSeason(seasonId: string) {
    setSyncing(seasonId)
    setSyncResults((prev) => {
      const copy = { ...prev }
      delete copy[seasonId]
      return copy
    })

    try {
      const res = await fetch(apiUrl("/api/admin/sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId }),
      })
      if (!res.ok) throw new Error("同期に失敗しました")
      const result = await res.json()
      setSyncResults((prev) => ({ ...prev, [seasonId]: result }))
      await loadSeasons()
    } catch (err) {
      setError(err instanceof Error ? err.message : "同期エラー")
    } finally {
      setSyncing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[#94a3b8]">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">シーズン管理</h1>
          <p className="text-[#94a3b8] mt-1 text-sm">シーズンの作成と管理</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-[#38bdf8] hover:bg-[#38bdf8]/80 text-[#0f1117] font-semibold rounded-xl transition-colors text-sm"
        >
          + 新シーズン作成
        </button>
      </div>

      {error && (
        <div className="p-4 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl text-sm text-[#f87171]">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-[#38bdf8]/30">
          <h2 className="text-lg font-semibold text-[#f1f5f9] mb-4">新シーズン作成</h2>
          <form onSubmit={createSeason} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1">リーグ</label>
                <select
                  value={formData.leagueCode}
                  onChange={(e) => setFormData({ ...formData, leagueCode: e.target.value })}
                  className="w-full bg-[#1a1f2e] border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 focus:border-[#38bdf8]/50 appearance-none"
                  required
                >
                  {LEAGUE_GROUPS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}（{l.code}）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1">シーズン年</label>
                <input
                  type="number"
                  value={formData.seasonYear}
                  onChange={(e) => setFormData({ ...formData, seasonYear: parseInt(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 focus:border-[#38bdf8]/50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1">シーズン名</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例: 2024/25"
                  className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 focus:border-[#38bdf8]/50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1">予想締切日時</label>
                <input
                  type="datetime-local"
                  value={formData.predictionDeadline}
                  onChange={(e) => setFormData({ ...formData, predictionDeadline: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 focus:border-[#38bdf8]/50"
                  required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2.5 bg-[#38bdf8] hover:bg-[#38bdf8]/80 disabled:bg-white/10 disabled:text-[#94a3b8] text-[#0f1117] font-semibold rounded-xl transition-colors text-sm"
              >
                {creating ? "作成中..." : "作成"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-[#94a3b8] font-semibold rounded-xl transition-colors text-sm border border-white/10"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Seasons list */}
      <div className="space-y-4">
        {seasons.length === 0 ? (
          <div className="bg-[#1a1f2e] rounded-2xl p-8 border border-white/10 text-center text-[#94a3b8]">
            シーズンがありません
          </div>
        ) : (
          seasons.map((season) => (
            <div
              key={season.id}
              className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10 space-y-4"
            >
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-[#f1f5f9]">{season.name}</h2>
                    {season.isLocked && (
                      <span className="text-xs bg-[#a78bfa]/10 text-[#a78bfa] border border-[#a78bfa]/30 px-2 py-0.5 rounded-full">
                        確定済み
                      </span>
                    )}
                    {!season.isActive && (
                      <span className="text-xs bg-white/5 text-[#94a3b8] border border-white/10 px-2 py-0.5 rounded-full">
                        非表示
                      </span>
                    )}
                    {season.isActive && !season.isLocked && (
                      <span className="text-xs bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/30 px-2 py-0.5 rounded-full">
                        受付中
                      </span>
                    )}
                    {season.resultsRevealed && (
                      <span className="text-xs bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/30 px-2 py-0.5 rounded-full">
                        結果開示済み
                      </span>
                    )}
                    {(() => {
                      const total = getTotalMatchdays(season.leagueCode)
                      const remaining = Math.max(0, total - season.maxPlayed)
                      if (season.standingsCount === 0) return null
                      if (season.maxPlayed === 0) return null
                      if (season.isLocked || season.resultsRevealed) return null
                      if (remaining <= getEndgameRemaining(season.leagueCode)) {
                        return (
                          <span className="text-xs bg-[#a78bfa]/10 text-[#a78bfa] border border-[#a78bfa]/30 px-2 py-0.5 rounded-full">
                            🤫 終盤モード（残り{remaining}節）
                          </span>
                        )
                      }
                      return null
                    })()}
                  </div>
                  <p className="text-sm text-[#94a3b8] mt-1">
                    {season.leagueCode} · {season.seasonYear}年 ·
                    チーム: {season._count.seasonTeams} ·
                    予想: {season._count.predictions}
                    {season.maxPlayed > 0 && (
                      <> · 進行: {season.minPlayed}〜{season.maxPlayed}節 / {getTotalMatchdays(season.leagueCode)}節</>
                    )}
                  </p>
                  <div className="mt-1">
                    {editingDeadline === season.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="datetime-local"
                          value={deadlineValue}
                          onChange={(e) => setDeadlineValue(e.target.value)}
                          className="bg-white/5 border border-[#38bdf8]/50 text-[#f1f5f9] text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#38bdf8]"
                        />
                        <button
                          onClick={() => saveDeadline(season.id)}
                          disabled={savingDeadline}
                          className="px-2 py-1 bg-[#38bdf8] hover:bg-[#38bdf8]/80 disabled:bg-white/10 text-[#0f1117] text-xs rounded-lg transition-colors font-semibold"
                        >
                          {savingDeadline ? "保存中..." : "保存"}
                        </button>
                        <button
                          onClick={() => setEditingDeadline(null)}
                          className="px-2 py-1 bg-white/5 hover:bg-white/10 text-[#94a3b8] text-xs rounded-lg transition-colors border border-white/10"
                        >
                          キャンセル
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditDeadline(season)}
                        className="flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-[#f1f5f9] transition-colors group"
                      >
                        <span>締切: {new Date(season.predictionDeadline).toLocaleString("ja-JP")}</span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => syncSeason(season.id)}
                    disabled={syncing === season.id}
                    className="px-3 py-1.5 text-sm bg-[#4ade80]/10 hover:bg-[#4ade80]/20 disabled:bg-white/5 disabled:text-[#94a3b8] text-[#4ade80] border border-[#4ade80]/30 rounded-lg transition-colors"
                  >
                    {syncing === season.id ? "同期中..." : "データ同期"}
                  </button>
                  {(() => {
                    const total = getTotalMatchdays(season.leagueCode)
                    const canReveal =
                      season.standingsCount > 0 && season.minPlayed >= total
                    if (season.resultsRevealed) {
                      return (
                        <button
                          onClick={() => toggleReveal(season)}
                          className="px-3 py-1.5 text-sm bg-[#fbbf24]/10 hover:bg-[#fbbf24]/20 text-[#fbbf24] border border-[#fbbf24]/30 rounded-lg transition-colors"
                        >
                          開示を取り消す
                        </button>
                      )
                    }
                    return (
                      <button
                        onClick={() => toggleReveal(season)}
                        disabled={!canReveal}
                        title={
                          canReveal
                            ? "全チームが最終節を終えました。結果を一斉開示できます。"
                            : `最終節完了後に押せます（現在 min=${season.minPlayed} / 総節=${total}）`
                        }
                        className="px-3 py-1.5 text-sm bg-[#a78bfa]/10 hover:bg-[#a78bfa]/20 disabled:bg-white/5 disabled:text-[#94a3b8] disabled:cursor-not-allowed text-[#a78bfa] border border-[#a78bfa]/30 disabled:border-white/10 rounded-lg transition-colors"
                      >
                        🎉 結果を開示する
                      </button>
                    )
                  })()}
                  <button
                    onClick={() => toggleLock(season.id, season.isLocked)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors border ${
                      season.isLocked
                        ? "bg-[#fbbf24]/10 hover:bg-[#fbbf24]/20 text-[#fbbf24] border-[#fbbf24]/30"
                        : "bg-[#f87171]/10 hover:bg-[#f87171]/20 text-[#f87171] border-[#f87171]/30"
                    }`}
                  >
                    {season.isLocked ? "ロック解除" : "シーズン確定"}
                  </button>
                  <button
                    onClick={() => toggleActive(season.id, season.isActive)}
                    className="px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 text-[#94a3b8] border border-white/10 rounded-lg transition-colors"
                  >
                    {season.isActive ? "非表示にする" : "表示する"}
                  </button>
                </div>
              </div>

              {syncResults[season.id] && (
                <div
                  className={`p-3 rounded-xl text-sm ${
                    syncResults[season.id].errors.length > 0
                      ? "bg-[#f87171]/10 border border-[#f87171]/30 text-[#f87171]"
                      : syncResults[season.id].warnings?.length > 0
                      ? "bg-[#fbbf24]/10 border border-[#fbbf24]/30 text-[#fbbf24]"
                      : "bg-[#4ade80]/10 border border-[#4ade80]/30 text-[#4ade80]"
                  }`}
                >
                  <p className="font-medium mb-1">同期結果</p>
                  <p>チーム更新: {syncResults[season.id].teamsUpserted}</p>
                  <p>順位更新: {syncResults[season.id].standingsUpserted}</p>
                  <p>スコア再計算: {syncResults[season.id].scoresRecalculated}</p>
                  {syncResults[season.id].warnings?.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium">注意:</p>
                      {syncResults[season.id].warnings.map((w, i) => (
                        <p key={i} className="text-xs">{w}</p>
                      ))}
                    </div>
                  )}
                  {syncResults[season.id].errors.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium">エラー:</p>
                      {syncResults[season.id].errors.map((err, i) => (
                        <p key={i} className="text-xs">{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
