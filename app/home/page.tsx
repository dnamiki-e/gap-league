import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import AppShell from "@/components/AppShell"
import { calculateScore } from "@/lib/scoring"
import { getScorerDeadline } from "@/lib/season-visibility"
import { getScoringConfig } from "@/lib/site-config"
import { pageClass } from "@/lib/ui"
import {
  canShowRankings,
  getVisibilityStatus,
  getRemainingMatchdays,
  ENDGAME_REMAINING_MATCHDAYS,
} from "@/lib/season-visibility"

function formatDeadline(date: Date): string {
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  if (diff < 0) return "締切済み"
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `残り ${days} 日 ${hours} 時間`
  if (hours > 0) return `残り ${hours} 時間`
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  return `残り ${minutes} 分`
}

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")
  if (!session.user.profileSetup) redirect("/profile")

  const scoring = await getScoringConfig()

  const activeSeason = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { seasonYear: "desc" },
  })

  const myPrediction = activeSeason
    ? await prisma.prediction.findUnique({
        where: { userId_seasonId: { userId: session.user.id, seasonId: activeSeason.id } },
        include: { details: true },
      })
    : null

  // 得点予想を入れたかどうか。導線の判定なので DB の指名件数で見る
  // （上流の得点データに依存させない）。
  const myScorerPickCount = activeSeason
    ? await prisma.predictionScorer.count({
        where: { prediction: { userId: session.user.id, seasonId: activeSeason.id } },
      })
    : 0

  let rankingEntries: Array<{
    rank: number
    userId: string
    displayName: string | null
    email: string | null
    image: string | null
    totalPoints: number | null
  }> = []

  if (activeSeason) {
    const predictions = await prisma.prediction.findMany({
      where: { seasonId: activeSeason.id },
      include: {
        user: { select: { id: true, displayName: true, email: true, image: true } },
        details: true,
      },
    })
    const standings = await prisma.standing.findMany({ where: { seasonId: activeSeason.id } })
    const standingMap = new Map(standings.map((s) => [s.teamId, s.actualRank]))

    const entries = predictions.map((pred) => {
      let totalPoints: number | null = null
      if (standings.length > 0) {
        const scoreDetails = pred.details
          .map((d) => {
            const ar = standingMap.get(d.teamId)
            return ar !== undefined ? { predictedRank: d.predictedRank, actualRank: ar } : null
          })
          .filter((d): d is { predictedRank: number; actualRank: number } => d !== null)
        if (scoreDetails.length > 0) {
          totalPoints = calculateScore(scoreDetails, scoring)
        }
      }
      return { userId: pred.user.id, displayName: pred.user.displayName, email: pred.user.email, image: pred.user.image, totalPoints }
    })

    entries.sort((a, b) => {
      if (a.totalPoints === null && b.totalPoints === null) return 0
      if (a.totalPoints === null) return 1
      if (b.totalPoints === null) return -1
      return a.totalPoints - b.totalPoints
    })

    rankingEntries = entries.map((e, i) => ({ ...e, rank: i + 1 }))
  }

  const deadline = activeSeason ? new Date(activeSeason.predictionDeadline) : null
  const deadlineStr = deadline ? formatDeadline(deadline) : null
  const isPastDeadline = deadline ? deadline < new Date() : false
  // 得点予想は順位予想より後ろの締切を持てる。順位が締切済みでも
  // まだ入力できることが分かるよう別に出す。
  const scorerDeadline = activeSeason ? getScorerDeadline(activeSeason) : null
  const isPastScorerDeadline = scorerDeadline ? scorerDeadline < new Date() : false
  const showScorerDeadline =
    scorerDeadline !== null &&
    !isPastScorerDeadline &&
    (deadline === null || scorerDeadline.getTime() !== deadline.getTime())
  const canPredict = activeSeason && !activeSeason.isLocked && !isPastDeadline
  // 順位予想が締切済みでも、得点予想の締切までは入力できる。
  // ここを順位締切だけで塞ぐと、締切の分離が画面上で無意味になる。
  const canPredictScorer = !!activeSeason && !activeSeason.isLocked && !isPastScorerDeadline

  // 順位・スコア表示の可否（開幕前 / 終盤ネタバレ防止 / 開示済み / 確定済みで分岐）
  const standingsForVisibility = activeSeason
    ? await prisma.standing.findMany({
        where: { seasonId: activeSeason.id },
        select: { played: true },
      })
    : []
  const showRankings = canShowRankings(activeSeason, standingsForVisibility)
  const visibility = getVisibilityStatus(activeSeason, standingsForVisibility)
  const remainingMatchdays = activeSeason
    ? getRemainingMatchdays(standingsForVisibility, activeSeason.leagueCode)
    : 0

  const myRank = rankingEntries.find((e) => e.userId === session.user!.id)
  const top3 = rankingEntries.slice(0, 3)

  const getSeasonStatus = () => {
    if (!activeSeason) return null
    if (activeSeason.isLocked) return { label: "確定", color: "text-[#a78bfa] border-[#a78bfa]/30 bg-[#a78bfa]/10" }
    if (isPastDeadline) return { label: "シーズン中", color: "text-[#38bdf8] border-[#38bdf8]/30 bg-[#38bdf8]/10" }
    return { label: "予想受付中", color: "text-[#4ade80] border-[#4ade80]/30 bg-[#4ade80]/10" }
  }
  const status = getSeasonStatus()

  return (
    <AppShell title="ホーム">
      <div className={pageClass("wide", "space-y-6")}>
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">
            こんにちは、{session.user.displayName ?? session.user.name}さん
          </h1>
          <p className="text-[#94a3b8] mt-1 text-sm">最終順位を予想して仲間と競おう</p>
        </div>

        {activeSeason ? (
          <>
            {/* Season card */}
            <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <p className="text-xs font-medium text-[#38bdf8] uppercase tracking-wider mb-1">現在のシーズン</p>
                  <h2 className="text-xl font-bold text-[#f1f5f9]">{activeSeason.name}</h2>
                  {status && (
                    <span className={`inline-flex items-center gap-1.5 mt-2 text-xs border px-2.5 py-1 rounded-full ${status.color}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      {status.label}
                    </span>
                  )}
                </div>
                <div className="text-right space-y-2">
                  {!isPastDeadline && deadlineStr && (
                    <div>
                      <p className="text-xs text-[#94a3b8] mb-1">順位予想の締切</p>
                      <p className="text-sm font-semibold text-[#fbbf24]">{deadlineStr}</p>
                    </div>
                  )}
                  {showScorerDeadline && (
                    <div>
                      <p className="text-xs text-[#94a3b8] mb-1">得点予想の締切</p>
                      <p className="text-sm font-semibold text-[#38bdf8]">
                        {formatDeadline(scorerDeadline)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 狭い幅で横並びにするとラベルが単語の途中で折り返すため縦積みにする */}
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                {canPredict ? (
                  <Link
                    href="/predict"
                    className="flex-1 text-center whitespace-nowrap bg-[#38bdf8] hover:bg-[#38bdf8]/80 text-[#0f1117] font-bold py-3 px-6 rounded-xl transition-colors"
                  >
                    {myPrediction ? "予想を編集する" : "予想を入力する"}
                  </Link>
                ) : canPredictScorer ? (
                  <Link
                    href="/predict"
                    className="flex-1 text-center whitespace-nowrap bg-[#38bdf8] hover:bg-[#38bdf8]/80 text-[#0f1117] font-bold py-3 px-6 rounded-xl transition-colors"
                  >
                    {myScorerPickCount > 0 ? "得点予想を編集する" : "得点予想を入力する"}
                  </Link>
                ) : (
                  <div className="flex-1 text-center whitespace-nowrap bg-white/5 text-[#94a3b8] font-semibold py-3 px-6 rounded-xl border border-white/10">
                    予想受付終了
                  </div>
                )}
                <Link
                  href="/ranking"
                  className="flex-1 text-center whitespace-nowrap bg-white/5 hover:bg-white/10 text-[#f1f5f9] font-semibold py-3 px-6 rounded-xl transition-colors border border-white/10"
                >
                  ランキングを見る
                </Link>
              </div>
            </div>

            {/* 得点予想が未入力の人への案内。順位予想が締まった後もここだけは開いている */}
            {canPredictScorer && myScorerPickCount === 0 && (
              <div className="bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded-2xl p-5">
                <div className="flex items-start gap-3 flex-wrap">
                  <span className="text-3xl">⚽</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[#38bdf8] font-bold">得点予想がまだ未入力です</p>
                    <p className="text-[#94a3b8] text-sm mt-1">
                      点を取りそうな選手を3人選びます。指名した3人の合計得点で競う、順位予想とは別のランキングです。
                      {scorerDeadline && `締切は ${scorerDeadline.toLocaleString("ja-JP")}。`}
                    </p>
                    <Link
                      href="/predict"
                      className="inline-block mt-3 bg-[#38bdf8] hover:bg-[#38bdf8]/80 text-[#0f1117] font-bold py-2 px-4 rounded-xl text-sm transition-colors"
                    >
                      得点予想を入力する
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* 終盤モード：ネタバレ防止バナー */}
            {visibility === "endgame-hidden" && (
              <div className="bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🤫</span>
                  <div>
                    <p className="text-[#a78bfa] font-bold text-sm">終盤モード（残り{remainingMatchdays}節）</p>
                    <p className="text-[#94a3b8] text-xs mt-1">
                      残り{ENDGAME_REMAINING_MATCHDAYS}節以下になったため、順位・スコアは全員非公開です。
                      最終節終了後、管理者が開示ボタンを押すと一斉に結果が発表されます。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 結果開示：参加者が気づけるようにホーム最上部で知らせる */}
            {visibility === "revealed" && (
              <div className="bg-[#4ade80]/10 border border-[#4ade80]/30 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🎉</span>
                  <div>
                    <p className="text-[#4ade80] font-bold text-sm">結果が発表されました</p>
                    <p className="text-[#94a3b8] text-xs mt-1">
                      {activeSeason.name} の最終結果が開示されました。全員の順位とスコアが見られます。
                    </p>
                    <Link href="/ranking" className="inline-block mt-2 text-xs text-[#38bdf8] hover:underline">
                      ランキングを見る →
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {visibility === "pre-deadline" && (
              <div className="bg-[#38bdf8]/5 border border-[#38bdf8]/20 rounded-2xl p-4">
                <p className="text-[#38bdf8] text-sm">予想受付中です。締切を過ぎると他の人の順位・スコアが表示されます。</p>
              </div>
            )}

            {/* My status */}
            <div className="bg-[#1a1f2e] rounded-2xl p-5 border border-white/10">
              <h3 className="text-sm font-semibold text-[#f1f5f9] mb-3">あなたの予想</h3>
              {myPrediction ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#4ade80] rounded-full"></span>
                    <span className="text-[#4ade80] text-sm font-medium">予想入力済み ({myPrediction.details.length}チーム)</span>
                  </div>
                  {showRankings && myRank && myRank.totalPoints !== null && (
                    <div className="text-right">
                      <p className="text-xs text-[#94a3b8]">現在 {myRank.rank}位</p>
                      <p className="text-lg font-black text-[#38bdf8] tabular">{myRank.totalPoints}pt</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#fbbf24] rounded-full"></span>
                  <span className="text-[#fbbf24] text-sm font-medium">未入力</span>
                  {canPredict && (
                    <Link href="/predict" className="text-sm text-[#38bdf8] ml-2 hover:underline">
                      今すぐ入力 →
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Top 3 podium — 開幕前・終盤モードでは非表示 */}
            {showRankings && top3.length > 0 && top3[0].totalPoints !== null && (
              <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-semibold text-[#f1f5f9]">現在のトップ3</h3>
                  <Link href="/ranking" className="text-xs text-[#38bdf8] hover:underline">全て見る →</Link>
                </div>
                <div className="flex gap-3 justify-center items-end">
                  {[1, 0, 2].map((idx) => {
                    const entry = top3[idx]
                    if (!entry) return null
                    const isFirst = idx === 0
                    const medal = ["🥇", "🥈", "🥉"][idx]
                    return (
                      <div
                        key={entry.userId}
                        className={`flex-1 max-w-[120px] flex flex-col items-center gap-2 p-3 rounded-xl border ${
                          isFirst
                            ? "border-yellow-500/40 bg-yellow-500/5 pb-5"
                            : idx === 1
                              ? "border-slate-400/30 bg-slate-400/5"
                              : "border-amber-700/30 bg-amber-700/5"
                        } ${entry.userId === session.user!.id ? "ring-2 ring-[#a78bfa]/50" : ""}`}
                      >
                        <span className="text-2xl">{medal}</span>
                        {entry.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={entry.image} alt="" className="w-10 h-10 rounded-full border-2 border-white/20" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#38bdf8]/20 flex items-center justify-center text-[#38bdf8] font-bold">
                            {(entry.displayName ?? "?").charAt(0)}
                          </div>
                        )}
                        <p className="text-xs text-[#f1f5f9] font-medium text-center truncate w-full">
                          {entry.displayName ?? entry.email ?? ""}
                          {entry.userId === session.user!.id && " (あなた)"}
                        </p>
                        <p className="text-sm font-black text-[#38bdf8] tabular">{entry.totalPoints}pt</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-[#1a1f2e] rounded-2xl p-10 border border-white/10 text-center">
            <p className="text-4xl mb-4">⚽</p>
            <h2 className="text-lg font-semibold text-[#f1f5f9] mb-2">現在有効なシーズンがありません</h2>
            <p className="text-[#94a3b8] text-sm">管理者がシーズンを作成するまでお待ちください。</p>
          </div>
        )}

        {/* Rules */}
        <div className="bg-[#1a1f2e]/50 rounded-2xl p-5 border border-white/5">
          <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">スコアルール</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              { label: "完全一致", value: "-2pt", color: "text-[#4ade80]" },
              { label: "1〜2位ずれ", value: "+1〜2pt", color: "text-[#38bdf8]" },
              { label: "3〜5位ずれ", value: "+3〜5pt", color: "text-[#fbbf24]" },
              { label: "6位以上ずれ", value: "+6pt〜", color: "text-[#f87171]" },
            ].map((rule) => (
              <div key={rule.label} className="bg-white/3 rounded-xl p-3 border border-white/5 text-center">
                <p className={`font-bold tabular ${rule.color}`}>{rule.value}</p>
                <p className="text-[#94a3b8] text-xs mt-1">{rule.label}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AppShell>
  )
}
