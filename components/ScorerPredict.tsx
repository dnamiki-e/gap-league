"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { apiUrl } from "@/lib/api"

const MAX_PICKS = 3

interface PlayerOption {
  id: string
  name: string
  position: string | null
  teamName?: string
}

interface Pick {
  playerId: string
  playerName: string
  teamName: string | null
  position: string | null
  /** どのクラブの一覧から選んだか。表示はこれを優先する */
  pickedTeamId: string | null
}

interface Props {
  seasonId: string
  teams: Array<{ id: string; name: string }>
  isLocked: boolean
  /** 得点予想の締切。順位予想より後ろに置ける */
  deadline?: Date | null
}

function positionLabel(position: string | null): string {
  switch (position) {
    case "Goalkeeper": return "GK"
    case "Defence": return "DF"
    case "Midfield": return "MF"
    case "Offence": return "FW"
    default: return "—"
  }
}

/**
 * 得点予想。選手を最大3人選ぶ。指名した3人の合計得点が多いほど上位。
 * 順位予想とは別のランキングで、スコアは合算しない。
 * 得点数そのものは予想しない（ピタリ賞なし）。
 *
 * 保存は順位予想とは別の口（/api/predictions/scorers）。
 * 順位予想のオートセーブは details を総入れ替えするため、同じ口にすると
 * 順位を触るたびにここの内容が消える。
 */
export default function ScorerPredict({ seasonId, teams, isLocked, deadline }: Props) {
  const [picks, setPicks] = useState<(Pick | null)[]>(Array(MAX_PICKS).fill(null))
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const [mode, setMode] = useState<"team" | "search">("team")
  const [teamId, setTeamId] = useState("")
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<PlayerOption[]>([])
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // 既存の予想を読み込む
  useEffect(() => {
    if (!seasonId) return
    let cancelled = false
    fetch(apiUrl(`/api/predictions/scorers?seasonId=${seasonId}`))
      .then((r) => (r.ok ? r.json() : { picks: [] }))
      .then((data) => {
        if (cancelled) return
        const next: (Pick | null)[] = Array(MAX_PICKS).fill(null)
        for (const p of data.picks ?? []) {
          const i = (p.slot ?? 1) - 1
          if (i < 0 || i >= MAX_PICKS) continue
          next[i] = {
            playerId: p.playerId,
            playerName: p.player?.name ?? "不明",
            teamName:
              p.pickedTeam?.shortName ??
              p.pickedTeam?.name ??
              p.player?.team?.shortName ??
              p.player?.team?.name ??
              null,
            position: p.player?.position ?? null,
            pickedTeamId: p.pickedTeamId ?? null,
          }
        }
        setPicks(next)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [seasonId])

  const save = useCallback(
    async (next: (Pick | null)[]) => {
      setSaveStatus("saving")
      setErrorMessage(null)
      try {
        const res = await fetch(apiUrl("/api/predictions/scorers"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seasonId,
            picks: next
              .map((p, i) =>
                p ? { playerId: p.playerId, slot: i + 1, pickedTeamId: p.pickedTeamId ?? undefined } : null
              )
              .filter(
                (p): p is { playerId: string; slot: number; pickedTeamId: string | undefined } =>
                  p !== null
              ),
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setErrorMessage(body.error ?? "保存できませんでした")
          setSaveStatus("error")
          return
        }
        setSaveStatus("saved")
      } catch {
        setErrorMessage("保存できませんでした")
        setSaveStatus("error")
      }
    },
    [seasonId]
  )

  const triggerSave = useCallback(
    (next: (Pick | null)[]) => {
      if (isLocked) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => save(next), 1200)
    },
    [save, isLocked]
  )

  const loadOptions = useCallback(async (params: { teamId?: string; q?: string }) => {
    setLoading(true)
    setOptions([])
    try {
      // seasonId を渡すと、前年の得点上位3人がサーバ側で候補から外れる
      const qs = params.teamId
        ? `teamId=${params.teamId}&seasonId=${seasonId}`
        : `q=${encodeURIComponent(params.q ?? "")}&seasonId=${seasonId}`
      const res = await fetch(apiUrl(`/api/players?${qs}`))
      const data = await res.json()
      setOptions(res.ok ? (data.players ?? []) : [])
    } catch {
      setOptions([])
    } finally {
      setLoading(false)
    }
  }, [seasonId])

  const choosePlayer = (slot: number, p: PlayerOption) => {
    if (picks.some((x, i) => x?.playerId === p.id && i !== slot)) {
      setErrorMessage("その選手は既に選んでいます")
      return
    }
    const next = [...picks]
    // クラブ一覧から選んだときは、そのクラブを正とする。
    // 上流が移籍前後の両クラブに同じ選手を載せることがあり、選手側の所属は当てにならない。
    const browsedTeam = mode === "team" ? teams.find((t) => t.id === teamId) : undefined
    next[slot] = {
      playerId: p.id,
      playerName: p.name,
      teamName: browsedTeam?.name ?? p.teamName ?? null,
      position: p.position,
      pickedTeamId: browsedTeam?.id ?? null,
    }
    setPicks(next)
    setOpenSlot(null)
    setErrorMessage(null)
    triggerSave(next)
  }

  const removePick = (slot: number) => {
    const next = [...picks]
    next[slot] = null
    setPicks(next)
    setOpenSlot(null)
    triggerSave(next)
  }

  return (
    <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 p-5 space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-[#f1f5f9]">得点予想</h2>
        <span className="text-xs text-[#94a3b8]" aria-live="polite">
          {saveStatus === "saving" && "保存中…"}
          {saveStatus === "saved" && "保存しました"}
          {saveStatus === "error" && "保存できませんでした"}
        </span>
      </div>
      <p className="text-[#94a3b8] text-sm">
        今シーズン点を取りそうな選手を3人選びます。
        指名した3人の合計得点が多いほど上位です。得点数そのものは予想しません。
        順位予想とは別のランキングで、順位予想のスコアには影響しません。
        <br />
        <span className="text-[#94a3b8]/80">
          前シーズンの得点上位10人と、ゴールキーパーは選べません。
        </span>
      </p>

      {errorMessage && (
        <p className="text-sm text-[#f87171] bg-[#f87171]/10 border border-[#f87171]/30 rounded-lg px-3 py-2">
          {errorMessage}
        </p>
      )}

      <ul className="space-y-3">
        {picks.map((pick, slot) => (
          <li key={slot} className="border border-white/10 rounded-xl p-3 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="shrink-0 w-6 h-6 rounded-full bg-white/5 text-[#94a3b8] text-xs flex items-center justify-center">
                {slot + 1}
              </span>
              {pick ? (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-[#f1f5f9] font-medium truncate">{pick.playerName}</p>
                    <p className="text-xs text-[#94a3b8] truncate">
                      {positionLabel(pick.position)}
                      {pick.teamName ? ` · ${pick.teamName}` : ""}
                    </p>
                  </div>
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => removePick(slot)}
                      className="shrink-0 min-h-[44px] px-3 rounded-lg border border-white/10 text-sm text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-white/5"
                    >
                      外す
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-[#94a3b8]">選手が未選択です</span>
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenSlot(openSlot === slot ? null : slot)
                        setErrorMessage(null)
                      }}
                      className="shrink-0 min-h-[44px] px-4 rounded-lg bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-sm font-semibold text-[#38bdf8]"
                    >
                      {openSlot === slot ? "閉じる" : "選手を選ぶ"}
                    </button>
                  )}
                </>
              )}
            </div>

            {openSlot === slot && !isLocked && (
              <div className="border-t border-white/10 pt-3 space-y-3">
                <div className="flex gap-1 p-1 rounded-xl bg-[var(--fill)] border border-[var(--border)] w-fit">
                  {(["team", "search"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setMode(m); setOptions([]) }}
                      className={`min-h-[44px] px-3 text-sm rounded-lg ${
                        mode === m
                          ? "bg-[var(--card-surface)] text-[var(--foreground)] font-semibold"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {m === "team" ? "クラブから選ぶ" : "名前で探す"}
                    </button>
                  ))}
                </div>

                {mode === "team" ? (
                  <select
                    value={teamId}
                    onChange={(e) => { setTeamId(e.target.value); if (e.target.value) loadOptions({ teamId: e.target.value }) }}
                    className="w-full min-h-[44px] bg-[#0f1117] border border-white/10 rounded-lg px-3 text-sm text-[#f1f5f9]"
                  >
                    <option value="">クラブを選ぶ</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") loadOptions({ q: query }) }}
                      placeholder="選手名（2文字以上）"
                      className="flex-1 min-w-0 min-h-[44px] bg-[#0f1117] border border-white/10 rounded-lg px-3 text-sm text-[#f1f5f9]"
                    />
                    <button
                      type="button"
                      onClick={() => loadOptions({ q: query })}
                      className="shrink-0 min-h-[44px] px-4 rounded-lg bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-sm font-semibold text-[#38bdf8]"
                    >
                      検索
                    </button>
                  </div>
                )}

                {loading && <p className="text-sm text-[#94a3b8]">読み込み中…</p>}
                {!loading && options.length > 0 && (
                  <ul className="max-h-64 overflow-y-auto border border-white/10 rounded-lg divide-y divide-white/5">
                    {options.map((p) => {
                      const taken = picks.some((x, i) => x?.playerId === p.id && i !== slot)
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            disabled={taken}
                            onClick={() => choosePlayer(slot, p)}
                            className="w-full text-left min-h-[44px] px-3 py-2 flex items-center gap-3 hover:bg-white/5 disabled:opacity-40"
                          >
                            <span className="shrink-0 w-8 text-xs text-[#94a3b8]">{positionLabel(p.position)}</span>
                            <span className="flex-1 min-w-0 truncate text-sm text-[#f1f5f9]">{p.name}</span>
                            {p.teamName && <span className="shrink-0 text-xs text-[#94a3b8] truncate max-w-[120px]">{p.teamName}</span>}
                            {taken && <span className="shrink-0 text-xs text-[#94a3b8]">選択済</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {!loading && mode === "search" && options.length === 0 && query.length >= 2 && (
                  <p className="text-xs text-[#94a3b8]">
                    見つかりません。まだ「クラブから選ぶ」で開いていないクラブの選手は検索に出ません。
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {isLocked ? (
        <p className="text-sm text-[#94a3b8]">得点予想の締切を過ぎているため変更できません。</p>
      ) : (
        deadline && (
          <p className="text-sm text-[#94a3b8]">
            得点予想の締切: {deadline.toLocaleString("ja-JP")}
            <span className="text-[#94a3b8]/70">（順位予想とは別の締切です）</span>
          </p>
        )
      )}
    </div>
  )
}
