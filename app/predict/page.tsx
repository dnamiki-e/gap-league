"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import DragDropPredict from "@/components/DragDropPredict"
import ScorerPredict from "@/components/ScorerPredict"
import ViewTabs from "@/components/ViewTabs"
import AppShell from "@/components/AppShell"
import { apiUrl } from "@/lib/api"
import { LEAGUE_GROUPS } from "@/lib/league-teams"
import { pageClass } from "@/lib/ui"
import { getScorerDeadline } from "@/lib/season-visibility"

interface Season {
  id: string
  leagueCode: string
  seasonYear: number
  name: string
  predictionDeadline: string
  scorerDeadline: string | null
  isLocked: boolean
}

interface Team {
  id: string
  name: string
  shortName: string | null
  tla: string | null
  crestUrl: string | null
}

interface PredictionDetail {
  teamId: string
  predictedRank: number
  comment?: string | null
}

type PredictTab = "table" | "scorer"

const leagueName = (code: string) =>
  LEAGUE_GROUPS.find((l) => l.code === code)?.name ?? code

export default function PredictPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("")
  const [teams, setTeams] = useState<Team[]>([])
  const [prediction, setPrediction] = useState<PredictionDetail[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSeason, setLoadingSeason] = useState(false)
  const [error, setError] = useState("")
  // null = まだ触っていない。既定は締切の状況から決めるため、ここでは固定しない
  const [tab, setTab] = useState<PredictTab | null>(null)

  const season = seasons.find((s) => s.id === selectedSeasonId) ?? null

  // 有効シーズン一覧を取得
  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return }
    if (status !== "authenticated") return
    if (!session?.user?.profileSetup) { router.push("/profile"); return }

    async function loadSeasons() {
      try {
        const res = await fetch(apiUrl("/api/seasons"))
        if (!res.ok) throw new Error("シーズン情報の取得に失敗しました")
        const data: Season[] = await res.json()
        setSeasons(data)
        setSelectedSeasonId((prev) => prev || data[0]?.id || "")
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラーが発生しました")
      } finally {
        setLoading(false)
      }
    }
    loadSeasons()
  }, [status, session, router])

  // 選択シーズンのチーム・予想を取得
  useEffect(() => {
    if (!selectedSeasonId) return
    async function loadSeasonData() {
      setLoadingSeason(true)
      setError("")
      try {
        const [teamsRes, predRes] = await Promise.all([
          fetch(apiUrl(`/api/teams?seasonId=${selectedSeasonId}`)),
          fetch(apiUrl(`/api/predictions?seasonId=${selectedSeasonId}`)),
        ])
        if (!teamsRes.ok) throw new Error("チーム情報の取得に失敗しました")
        setTeams(await teamsRes.json())
        if (predRes.ok) {
          const predData = await predRes.json()
          setPrediction(predData?.details ?? null)
        } else {
          setPrediction(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラーが発生しました")
      } finally {
        setLoadingSeason(false)
      }
    }
    loadSeasonData()
  }, [selectedSeasonId])

  const isPastDeadline = season ? new Date(season.predictionDeadline) < new Date() : false
  const isLocked = season ? season.isLocked || isPastDeadline : false
  // 得点予想は順位予想より後ろの締切を持てる
  const scorerDeadline = season ? getScorerDeadline(season) : null
  const isScorerLocked = season
    ? season.isLocked || (scorerDeadline !== null && scorerDeadline < new Date())
    : false

  // 順位予想が締切済みで得点予想がまだ開いているときは、開いている方を最初に見せる。
  // （順位予想を既定にすると、締切後は閲覧専用の画面に着地してタブを探させることになる）
  const activeTab: PredictTab = tab ?? (isLocked && !isScorerLocked ? "scorer" : "table")
  const tabItems = [
    // 締切は色ではなく文字でも示す
    { key: "table" as const, label: "順位予想", badge: isLocked ? "締切" : undefined },
    { key: "scorer" as const, label: "得点予想", badge: isScorerLocked ? "締切" : undefined },
  ]

  if (status === "loading" || loading) {
    return (
      <AppShell title="予想入力">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-[#94a3b8]">読み込み中...</div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="予想入力">
      <div className={pageClass()}>
        {/* セクション内のビュー切替（第2階層）。他の画面と同じく見出しより上の固定位置に置く。
            タブを押した指の下でボタンが動かないよう、ここより上には何も差し込まない。 */}
        {seasons.length > 0 && (
          <div className="mb-4">
            <ViewTabs
              items={tabItems}
              value={activeTab}
              onChange={setTab}
              ariaLabel="予想の種類"
            />
          </div>
        )}

        <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
          {/* 見出しはセクション名に固定する。ビュー名はタブが持つ。
              タブを押して見出しが変わると別セクションへ移動したように見えるため、
              ビュー固有の説明も各カードの中に置いてある。 */}
          <div>
            <h1 className="text-2xl font-bold text-[#f1f5f9]">予想入力</h1>
          </div>

          {/* シーズン・リーグ選択 */}
          {seasons.length > 0 && (
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1">予想するリーグ・シーズン</label>
              <select
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                className="bg-[#1a1f2e] border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 appearance-none min-w-[240px]"
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {leagueName(s.leagueCode)} — {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl text-sm text-[#f87171]">
            {error}
          </div>
        )}

        {!season ? (
          <div className="bg-[#1a1f2e] rounded-2xl p-10 border border-white/10 text-center">
            <p className="text-4xl mb-4">⚽</p>
            <h2 className="text-lg font-semibold text-[#f1f5f9] mb-2">現在受付中のシーズンがありません</h2>
            <p className="text-[#94a3b8] text-sm">管理者がシーズンを作成するまでお待ちください。</p>
          </div>
        ) : loadingSeason ? (
          <div className="bg-[#1a1f2e] rounded-2xl p-10 border border-white/10 text-center text-[#94a3b8]">
            読み込み中...
          </div>
        ) : teams.length === 0 ? (
          <div className="bg-[#1a1f2e] rounded-2xl p-10 border border-white/10 text-center">
            <p className="text-4xl mb-4">🔄</p>
            <h2 className="text-lg font-semibold text-[#f1f5f9] mb-2">チームデータがありません</h2>
            <p className="text-[#94a3b8] text-sm">管理者がデータを同期するまでお待ちください。</p>
          </div>
        ) : (
          <>
            {/* 両方のパネルは常にマウントしたままにして hidden で出し入れする。
                アンマウントすると、オートセーブのデバウンス待ちだった編集が
                タブを押した瞬間に消えるため。 */}
            <div
              role="tabpanel"
              id="panel-table"
              aria-labelledby="tab-table"
              hidden={activeTab !== "table"}
              className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10"
            >
              <div className="mb-4">
                <h2 className="text-lg font-bold text-[#f1f5f9]">順位予想</h2>
                <p className="text-[#94a3b8] text-sm mt-1">
                  チームを上位から順にドラッグ配置。各チームにコメントを追加できます。
                </p>
              </div>
              {isLocked && (
                <div className="mb-6 p-4 bg-[#fbbf24]/10 border border-[#fbbf24]/30 rounded-xl text-sm text-[#fbbf24]">
                  <strong>予想受付終了</strong> — このシーズンの順位予想の受付は終了しています。現在の予想を閲覧のみできます。
                </div>
              )}
              <DragDropPredict
                key={season.id}
                teams={teams}
                initialPrediction={prediction}
                seasonId={season.id}
                isLocked={isLocked}
              />
            </div>

            {/* 得点予想。順位予想とは別に保存する（あちらのオートセーブに巻き込まれないため） */}
            <div
              role="tabpanel"
              id="panel-scorer"
              aria-labelledby="tab-scorer"
              hidden={activeTab !== "scorer"}
            >
              <ScorerPredict
                key={`scorer-${season.id}`}
                seasonId={season.id}
                teams={teams}
                isLocked={isScorerLocked}
                deadline={scorerDeadline}
              />
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
