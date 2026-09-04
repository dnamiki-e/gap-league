"use client"

import { useEffect, useState } from "react"
import { apiUrl } from "@/lib/api"
import { LEAGUE_GROUPS } from "@/lib/league-teams"

interface SiteConfig {
  siteName: string
  scoreExactMatch: number
  scoreDiffMultiplier: number
  enabledLeagues: string[]
}

export default function AdminSettingsPage() {
  const [config, setConfig] = useState<SiteConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiUrl("/api/admin/site-config"))
        if (!res.ok) throw new Error("設定の取得に失敗しました")
        setConfig(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラー")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function toggleLeague(code: string) {
    if (!config) return
    const set = new Set(config.enabledLeagues)
    if (set.has(code)) set.delete(code)
    else set.add(code)
    setConfig({ ...config, enabledLeagues: [...set] })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!config) return
    setError("")
    setSaved(false)
    if (config.enabledLeagues.length === 0) {
      setError("少なくとも1つのリーグを有効にしてください")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(apiUrl("/api/admin/site-config"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteName: config.siteName,
          scoreExactMatch: config.scoreExactMatch,
          scoreDiffMultiplier: config.scoreDiffMultiplier,
          enabledLeagues: config.enabledLeagues,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "保存に失敗しました")
      }
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラー")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-[#94a3b8] py-20 text-center">読み込み中...</div>
  }
  if (!config) {
    return <div className="text-[#f87171] py-20 text-center">{error || "設定を読み込めませんでした"}</div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[#f1f5f9]">サイト設定</h1>
        <p className="text-[#94a3b8] mt-1 text-sm">サイト名・スコアルール・対応リーグをサイト単位で設定します。</p>
      </div>

      {error && (
        <div className="p-4 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl text-sm text-[#f87171]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* サイト名 */}
        <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10">
          <label className="block text-sm font-medium text-[#f1f5f9] mb-2">サイト名</label>
          <input
            type="text"
            value={config.siteName}
            onChange={(e) => setConfig({ ...config, siteName: e.target.value })}
            maxLength={100}
            required
            className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 transition-colors"
          />
        </div>

        {/* スコアルール */}
        <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10 space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#f1f5f9]">スコアルール</h2>
            <p className="text-[#94a3b8] text-xs mt-0.5">
              合計 = Σ（完全一致なら「完全一致点」／それ以外は「順位差 × 倍率」）。小さいほど上位。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#f1f5f9] mb-2">完全一致点</label>
              <input
                type="number"
                value={config.scoreExactMatch}
                onChange={(e) => setConfig({ ...config, scoreExactMatch: Number(e.target.value) })}
                required
                className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 transition-colors"
              />
              <p className="mt-1 text-xs text-[#94a3b8]">既定: -2（マイナスで加点）</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#f1f5f9] mb-2">順位差の倍率</label>
              <input
                type="number"
                min={1}
                value={config.scoreDiffMultiplier}
                onChange={(e) => setConfig({ ...config, scoreDiffMultiplier: Number(e.target.value) })}
                required
                className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 transition-colors"
              />
              <p className="mt-1 text-xs text-[#94a3b8]">既定: 1</p>
            </div>
          </div>
          <p className="text-xs text-[#fbbf24]">
            ※ 変更後、確定済みスコアに反映するにはシーズン管理から再同期してください。
          </p>
        </div>

        {/* 対応リーグ */}
        <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10 space-y-3">
          <div>
            <h2 className="text-base font-bold text-[#f1f5f9]">対応リーグ</h2>
            <p className="text-[#94a3b8] text-xs mt-0.5">予想対象として選べるリーグ。</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {LEAGUE_GROUPS.map((league) => {
              const checked = config.enabledLeagues.includes(league.code)
              return (
                <label
                  key={league.code}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                    checked
                      ? "bg-[#38bdf8]/10 border-[#38bdf8]/40 text-[#f1f5f9]"
                      : "bg-white/5 border-white/10 text-[#94a3b8] hover:bg-white/10"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLeague(league.code)}
                    className="accent-[#38bdf8]"
                  />
                  <span className="text-sm">{league.name}</span>
                </label>
              )
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-[#38bdf8] hover:bg-[#38bdf8]/80 disabled:opacity-50 text-[#0f1117] font-bold px-6 py-3 rounded-xl transition-colors"
        >
          {saving ? "保存中..." : saved ? "✓ 保存しました" : "設定を保存"}
        </button>
      </form>
    </div>
  )
}
