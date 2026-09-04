import { Fragment } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import AppShell from "@/components/AppShell"
import TeamCrest from "@/components/TeamCrest"
import { calculateScore } from "@/lib/scoring"
import { getScoringConfig } from "@/lib/site-config"
import { pageClass } from "@/lib/ui"
import {
  canShowRankings,
  canShowPredictions,
  getVisibilityStatus,
  ENDGAME_REMAINING_MATCHDAYS,
} from "@/lib/season-visibility"

interface PageProps {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ seasonId?: string }>
}

function getDiffColor(diff: number): string {
  if (diff === 0) return "text-[#4ade80]"
  if (diff <= 2) return "text-[#38bdf8]"
  if (diff <= 5) return "text-[#fbbf24]"
  if (diff <= 10) return "text-orange-400"
  return "text-[#f87171]"
}

function getPointsColor(points: number): string {
  if (points < 0) return "text-[#4ade80]"
  if (points <= 2) return "text-[#38bdf8]"
  if (points <= 5) return "text-[#fbbf24]"
  if (points <= 10) return "text-orange-400"
  return "text-[#f87171]"
}

export default async function UserPredictionPage({ params, searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const scoring = await getScoringConfig()
  const { userId } = await params
  const { seasonId: seasonIdParam } = await searchParams

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      email: true,
      image: true,
      favoriteClub: { select: { name: true, crestUrl: true } },
    },
  })

  if (!targetUser) notFound()

  const seasons = await prisma.season.findMany({
    where: { isActive: true },
    orderBy: { seasonYear: "desc" },
  })

  const selectedSeason = seasonIdParam
    ? seasons.find((s) => s.id === seasonIdParam)
    : seasons[0]

  const prediction = selectedSeason
    ? await prisma.prediction.findUnique({
        where: {
          userId_seasonId: { userId, seasonId: selectedSeason.id },
        },
        include: {
          details: {
            include: { team: true },
            orderBy: { predictedRank: "asc" },
          },
        },
      })
    : null

  const standings = selectedSeason
    ? await prisma.standing.findMany({
        where: { seasonId: selectedSeason.id },
        include: { team: true },
        orderBy: { actualRank: "asc" },
      })
    : []

  const standingMap = new Map(standings.map((s) => [s.teamId, s]))

  type TeamRow = {
    teamId: string
    teamName: string
    tla: string | null
    crestUrl: string | null
    predictedRank: number
    actualRank: number | null
    diff: number | null
    points: number | null
    comment: string | null
  }

  const teamRows: TeamRow[] = prediction
    ? prediction.details.map((d) => {
        const standing = standingMap.get(d.teamId)
        const actualRank = standing?.actualRank ?? null
        const diff = actualRank !== null ? Math.abs(d.predictedRank - actualRank) : null
        const points =
          diff !== null ? (diff === 0 ? scoring.exactMatch : diff * scoring.diffMultiplier) : null
        return {
          teamId: d.teamId,
          teamName: d.team.name,
          tla: d.team.tla,
          crestUrl: d.team.crestUrl,
          predictedRank: d.predictedRank,
          actualRank,
          diff,
          points,
          comment: d.comment ?? null,
        }
      })
    : []

  // ここは順位予想のスコアだけ。得点予想は別ランキングなので混ぜない。
  const totalPoints =
    teamRows.length > 0 && teamRows.every((r) => r.points !== null)
      ? calculateScore(
          teamRows.map((r) => ({
            predictedRank: r.predictedRank,
            actualRank: r.actualRank!,
          })),
          scoring
        )
      : null

  const isOwnProfile = session.user.id === userId

  // 順位・スコア表示ゲート
  // 確定済みシーズンの予想はアーカイブから辿るため、戻り先もアーカイブに合わせる
  const seasonQuery = selectedSeason ? `?seasonId=${selectedSeason.id}` : ""
  const backHref = selectedSeason?.isLocked ? `/ranking/archive${seasonQuery}` : "/ranking"
  const backLabel = selectedSeason?.isLocked ? "アーカイブ" : "ランキング"

  const showRankings = canShowRankings(selectedSeason ?? null, standings)
  const visibility = getVisibilityStatus(selectedSeason ?? null, standings)
  const hideScores = !showRankings
  // 他人の予想（predictedRank・コメント）を表示してよいか。自分自身の予想は常に見える。
  const canShowOthersPredictions =
    isOwnProfile || canShowPredictions(selectedSeason ?? null, standings)

  return (
    <AppShell title="予想詳細">
      <div className={pageClass()}>
        {/* 詳細 → 親への戻り。確定済みシーズンを見ているならアーカイブ側が親。 */}
        <div className="mb-6">
          <Link href={backHref} className="text-sm text-[#38bdf8] hover:underline">← {backLabel}</Link>
        </div>

        {/* User header */}
        <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10 mb-6">
          <div className="flex items-center gap-4">
            {targetUser.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={targetUser.image}
                alt={targetUser.displayName ?? ""}
                className="w-14 h-14 rounded-full border-2 border-white/20"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#38bdf8]/20 flex items-center justify-center text-xl font-bold text-[#38bdf8]">
                {(targetUser.displayName ?? targetUser.email ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[#f1f5f9]">
                  {targetUser.displayName ?? targetUser.email}
                </h1>
                {isOwnProfile && (
                  <span className="text-xs text-[#38bdf8] bg-[#38bdf8]/10 border border-[#38bdf8]/30 px-2 py-0.5 rounded-full">
                    あなた
                  </span>
                )}
              </div>
              {targetUser.favoriteClub && (
                <div className="flex items-center gap-2 mt-1">
                  <TeamCrest
                    crestUrl={targetUser.favoriteClub.crestUrl}
                    teamName={targetUser.favoriteClub.name}
                    size={18}
                  />
                  <span className="text-[#94a3b8] text-sm">{targetUser.favoriteClub.name}</span>
                </div>
              )}
            </div>
            {!hideScores && totalPoints !== null && (
              <div className="ml-auto text-center">
                <p className="text-xs text-[#94a3b8] mb-1">順位予想スコア</p>
                <p className={`text-3xl font-black tabular ${totalPoints <= 0 ? "text-[#4ade80]" : "text-[#f1f5f9]"}`}>
                  {totalPoints}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Season selector */}
        {seasons.length > 1 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-sm text-[#94a3b8]">シーズン:</span>
            <div className="flex gap-2 flex-wrap">
              {seasons.map((s) => (
                <Link
                  key={s.id}
                  href={`/ranking/${userId}?seasonId=${s.id}`}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedSeason?.id === s.id
                      ? "bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30"
                      : "bg-white/5 text-[#94a3b8] hover:bg-white/10 border border-white/10"
                  }`}
                >
                  {s.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 自分の予想を見ている場合のみ、スコア非表示バナーを出す（予想内容自体は常に表示） */}
        {isOwnProfile && hideScores && (
          <div className="mb-4 p-4 bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-2xl">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🤫</span>
              <div>
                <p className="text-[#a78bfa] font-bold text-sm">
                  {visibility === "pre-deadline" ? "予想受付中" : `終盤モード（残り${ENDGAME_REMAINING_MATCHDAYS}節以下）`}
                </p>
                <p className="text-[#94a3b8] text-xs mt-1">
                  {visibility === "pre-deadline"
                    ? "予想受付中です。締切を過ぎるとスコアが計算されます。"
                    : "ネタバレ防止のため、差分・ポイント・スコアは非表示にしています。予想内容と実際の順位のみ表示。"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 他人の予想を見ていて、まだ公開条件を満たしていない場合はロック表示にする */}
        {selectedSeason && !isOwnProfile && !canShowOthersPredictions ? (
          <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 p-12 text-center">
            <p className="text-4xl mb-4">🔒</p>
            <p className="text-[#f1f5f9] font-semibold mb-2">
              {visibility === "endgame-hidden" ? "ネタバレ防止のため非公開です" : "予想は非公開です"}
            </p>
            <p className="text-[#94a3b8] text-sm max-w-md mx-auto">
              {visibility === "endgame-hidden"
                ? "ネタバレ防止のため、この人の予想内容も非表示にしています。最終節終了後、管理者が結果を開示すると一斉公開されます。"
                : `予想受付中です。締切（${new Date(selectedSeason.predictionDeadline).toLocaleString("ja-JP")}）を過ぎると他の人の予想が見られるようになります。`}
            </p>
          </div>
        ) : (
        /* Prediction table */
        <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 overflow-hidden">
          {prediction && teamRows.length > 0 ? (
            <>
              <div className="p-4 border-b border-white/10">
                <p className="text-xs text-[#94a3b8]">
                  ポイント: 完全一致 -2点、差分あり +差分点
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[#94a3b8] text-xs uppercase tracking-wider border-b border-white/10">
                      <th className="px-4 py-3">チーム</th>
                      <th className="px-4 py-3 text-center">予想</th>
                      <th className="px-4 py-3 text-center">実際</th>
                      {!hideScores && <th className="px-4 py-3 text-center">差分</th>}
                      {!hideScores && <th className="px-4 py-3 text-right">ポイント</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {teamRows.map((row) => (
                      <Fragment key={row.teamId}>
                        <tr
                          className="border-b border-white/5 hover:bg-white/3 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <TeamCrest
                                crestUrl={row.crestUrl}
                                teamName={row.teamName}
                                size={24}
                              />
                              <span className="text-[#f1f5f9] font-medium">{row.teamName}</span>
                              {row.tla && (
                                <span className="text-[#94a3b8]/60 text-xs hidden sm:inline">{row.tla}</span>
                              )}
                              {row.comment && (
                                <span className="text-xs text-[#4ade80] hidden md:inline" title={row.comment}>💬</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-[#f1f5f9] tabular">
                              {row.predictedRank}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {row.actualRank !== null ? (
                              <span className="font-bold text-[#f1f5f9] tabular">
                                {row.actualRank}
                              </span>
                            ) : (
                              <span className="text-[#94a3b8]/50">-</span>
                            )}
                          </td>
                          {!hideScores && (
                            <td className="px-4 py-3 text-center">
                              {row.diff !== null ? (
                                <span className={`font-bold tabular ${getDiffColor(row.diff)}`}>
                                  {row.diff === 0 ? "✓" : `+${row.diff}`}
                                </span>
                              ) : (
                                <span className="text-[#94a3b8]/50">-</span>
                              )}
                            </td>
                          )}
                          {!hideScores && (
                            <td className="px-4 py-3 text-right">
                              {row.points !== null ? (
                                <span className={`font-bold tabular ${getPointsColor(row.points)}`}>
                                  {row.points > 0 ? `+${row.points}` : row.points}
                                </span>
                              ) : (
                                <span className="text-[#94a3b8]/50">-</span>
                              )}
                            </td>
                          )}
                        </tr>
                        {/* Comment row */}
                        {row.comment && (
                          <tr key={`${row.teamId}-comment`} className="border-b border-white/5">
                            <td colSpan={hideScores ? 3 : 5} className="px-4 pb-3 pt-0">
                              <p className="text-xs text-[#94a3b8] bg-white/3 rounded-lg px-3 py-2 border border-white/10 ml-8">
                                💬 {row.comment}
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                  {!hideScores && totalPoints !== null && (
                    <tfoot>
                      <tr className="border-t-2 border-white/10 bg-white/3">
                        <td colSpan={4} className="px-4 py-3 text-right font-semibold text-[#94a3b8]">
                          合計
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-lg font-black tabular ${totalPoints <= 0 ? "text-[#4ade80]" : "text-[#f1f5f9]"}`}>
                            {totalPoints}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          ) : (
            <div className="p-12 text-center">
              <p className="text-4xl mb-4">📋</p>
              <p className="text-[#94a3b8]">
                {selectedSeason
                  ? `${selectedSeason.name} の予想はまだありません`
                  : "シーズンがありません"}
              </p>
            </div>
          )}
        </div>
        )}
      </div>
    </AppShell>
  )
}
