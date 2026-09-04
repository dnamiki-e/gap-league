import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import AppShell from "@/components/AppShell"
import SectionNav from "@/components/SectionNav"
import TeamCrest from "@/components/TeamCrest"
import { calculateScore } from "@/lib/scoring"
import { getScoringConfig } from "@/lib/site-config"
import { pageClass, statsNav } from "@/lib/ui"
import {
  canShowRankings,
  getVisibilityStatus,
  ENDGAME_REMAINING_MATCHDAYS,
} from "@/lib/season-visibility"

interface PageProps {
  searchParams: Promise<{ seasonId?: string; userId?: string }>
}

export default async function StatsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const scoring = await getScoringConfig()
  const { seasonId: seasonIdParam, userId: userIdParam } = await searchParams
  const targetUserId = userIdParam ?? session.user.id
  const isOwnProfile = targetUserId === session.user.id

  // Get seasons
  const seasons = await prisma.season.findMany({
    where: { isActive: true },
    orderBy: { seasonYear: "desc" },
  })

  const selectedSeason = seasonIdParam
    ? seasons.find(s => s.id === seasonIdParam)
    : seasons[0]

  if (!selectedSeason) {
    return (
      <AppShell title="分析">
        <div className={pageClass()}>
          <div className="bg-[#1a1f2e] rounded-2xl p-10 border border-white/10 text-center">
            <p className="text-[#94a3b8]">シーズンがありません</p>
          </div>
        </div>
      </AppShell>
    )
  }

  // Get target user info
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, displayName: true, email: true, image: true },
  })

  // Get prediction
  const prediction = await prisma.prediction.findUnique({
    where: { userId_seasonId: { userId: targetUserId, seasonId: selectedSeason.id } },
    include: { details: { include: { team: true } } },
  })

  // Get standings
  const standings = await prisma.standing.findMany({
    where: { seasonId: selectedSeason.id },
  })
  const standingMap = new Map(standings.map(s => [s.teamId, s.actualRank]))
  const hasStandings = standings.length > 0

  // 順位・スコア表示ゲート
  const showRankings = canShowRankings(selectedSeason, standings)
  const visibility = getVisibilityStatus(selectedSeason, standings)

  // Calculate accuracy if has prediction + standings
  type TeamStat = {
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

  let teamStats: TeamStat[] = []
  let accuracyMetrics: {
    exactCount: number; exactRate: number
    within1Rate: number; within2Rate: number; within3Rate: number; within5Rate: number
    avgDiff: number; totalScore: number | null
    top4Hit: number; relegHit: number
  } | null = null

  if (prediction && hasStandings) {
    teamStats = prediction.details.map(d => {
      const actualRank = standingMap.get(d.teamId) ?? null
      const diff = actualRank !== null ? Math.abs(d.predictedRank - actualRank) : null
      const points = diff !== null ? (diff === 0 ? -2 : diff) : null
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
    }).filter(d => d.actualRank !== null)

    const total = teamStats.length
    if (total > 0) {
      const exact = teamStats.filter(d => d.diff === 0).length
      const within1 = teamStats.filter(d => (d.diff ?? 99) <= 1).length
      const within2 = teamStats.filter(d => (d.diff ?? 99) <= 2).length
      const within3 = teamStats.filter(d => (d.diff ?? 99) <= 3).length
      const within5 = teamStats.filter(d => (d.diff ?? 99) <= 5).length
      const avgDiff = teamStats.reduce((s, d) => s + (d.diff ?? 0), 0) / total

      const top4Predicted = new Set(prediction.details.filter(d => d.predictedRank <= 4).map(d => d.teamId))
      const top4Actual = new Set(standings.filter(s => s.actualRank <= 4).map(s => s.teamId))
      const top4Hit = [...top4Predicted].filter(id => top4Actual.has(id)).length

      const relegPredicted = new Set(prediction.details.filter(d => d.predictedRank >= 18).map(d => d.teamId))
      const relegActual = new Set(standings.filter(s => s.actualRank >= 18).map(s => s.teamId))
      const relegHit = [...relegPredicted].filter(id => relegActual.has(id)).length

      const scoreDetails = teamStats
        .filter(d => d.actualRank !== null && d.diff !== null)
        .map(d => ({ predictedRank: d.predictedRank, actualRank: d.actualRank! }))

      accuracyMetrics = {
        exactCount: exact,
        exactRate: (exact / total) * 100,
        within1Rate: (within1 / total) * 100,
        within2Rate: (within2 / total) * 100,
        within3Rate: (within3 / total) * 100,
        within5Rate: (within5 / total) * 100,
        avgDiff: Math.round(avgDiff * 10) / 10,
        totalScore: scoreDetails.length > 0 ? calculateScore(scoreDetails, scoring) : null,
        top4Hit,
        relegHit,
      }
    }
  }

  // Users who submitted predictions for this season (for user picker)
  const predictionUsers = await prisma.prediction.findMany({
    where: { seasonId: selectedSeason.id },
    select: {
      userId: true,
      user: { select: { id: true, displayName: true, email: true, image: true } },
    },
  })

  // Compatibility (only show for own profile)
  type CompatEntry = {
    userId: string
    displayName: string | null
    email: string | null
    image: string | null
    favoriteClub: { name: string; crestUrl: string | null } | null
    compatibilityScore: number
    exactMatches: number
    diffSum: number
  }

  let compatibilities: CompatEntry[] = []

  // 相性診断は他人のpredictedRankを前提にした機能のため、公開ゲートが閉じている間は計算しない
  if (isOwnProfile && showRankings && prediction && prediction.details.length > 0) {
    const allPredictions = await prisma.prediction.findMany({
      where: { seasonId: selectedSeason.id, userId: { not: targetUserId } },
      include: {
        user: { select: { id: true, displayName: true, email: true, image: true, favoriteClub: { select: { name: true, crestUrl: true } } } },
        details: true,
      },
    })

    const myRankMap = new Map(prediction.details.map(d => [d.teamId, d.predictedRank]))
    const MAX_DIFF = 200

    compatibilities = allPredictions
      .map(p => {
        if (p.details.length === 0) return null
        const theirMap = new Map(p.details.map(d => [d.teamId, d.predictedRank]))
        const common = [...myRankMap.keys()].filter(id => theirMap.has(id))
        if (common.length === 0) return null

        const diffSum = common.reduce((sum, id) => sum + Math.abs(myRankMap.get(id)! - theirMap.get(id)!), 0)
        const scaledMax = (common.length / 20) * MAX_DIFF
        const score = Math.max(0, Math.round((1 - diffSum / scaledMax) * 100))
        const exactMatches = common.filter(id => myRankMap.get(id) === theirMap.get(id)).length

        return {
          userId: p.userId,
          displayName: p.user.displayName,
          email: p.user.email,
          image: p.user.image,
          favoriteClub: p.user.favoriteClub,
          compatibilityScore: score,
          exactMatches,
          diffSum,
        }
      })
      .filter((c): c is CompatEntry => c !== null)
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
  }

  const getDiffColor = (diff: number | null) => {
    if (diff === null) return "text-[#94a3b8]"
    if (diff === 0) return "text-[#4ade80]"
    if (diff <= 2) return "text-[#38bdf8]"
    if (diff <= 5) return "text-[#fbbf24]"
    if (diff <= 10) return "text-orange-400"
    return "text-[#f87171]"
  }

  const getCompatColor = (score: number) => {
    if (score >= 80) return "text-[#4ade80]"
    if (score >= 60) return "text-[#38bdf8]"
    if (score >= 40) return "text-[#fbbf24]"
    return "text-[#f87171]"
  }

  return (
    <AppShell title="分析">
      <div className={pageClass("wide", "space-y-6")}>
        {/* Header */}
        <div className="space-y-4">
        {/* セクション内のビュー切替（第2階層）。
            タブを押した指の下でボタンが動かないよう、見出しより上の固定位置に置く。
            見出しの行数がタブによって変わると、その分だけタブが上下にズレてしまう。 */}
          <SectionNav items={statsNav(selectedSeason?.id)} />
          <div>
            <h1 className="text-2xl font-bold text-[#f1f5f9]">分析</h1>
            {/* 表示名の長さで行数が変わると、下のシーズン選択・予想した人が上下に動く。
                誰の分析かは「予想した人」の選択状態でも分かるので、ここは1行に固定する。 */}
            <p className="text-[#94a3b8] text-sm mt-1 line-clamp-1">
              {isOwnProfile ? "あなたの" : `${targetUser?.displayName ?? targetUser?.email ?? ""}の`}
              予想の的中率と分析
            </p>
          </div>
        </div>

        {/* Season selector（第3階層）。「節別変動」タブと同じ位置に置くため、
            「予想した人」より前に出す。タブを切り替えたときにシーズンのピルが
            上下に飛ぶのを防ぐ。 */}
        {seasons.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {seasons.map(s => (
              <Link key={s.id} href={`/stats?seasonId=${s.id}${userIdParam ? `&userId=${userIdParam}` : ""}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedSeason.id === s.id
                    ? "bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30"
                    : "bg-white/5 text-[#94a3b8] hover:bg-white/10 border border-white/10"
                }`}>
                {s.name}
              </Link>
            ))}
          </div>
        )}

        {/* User picker */}
        {predictionUsers.length > 0 && (
          <div className="bg-[#1a1f2e] rounded-2xl p-4 border border-white/10">
            <p className="text-xs text-[#94a3b8] mb-3 font-semibold uppercase tracking-wider">予想した人</p>
            <div className="flex flex-wrap gap-2">
              {predictionUsers.map(({ user }) => {
                const isSelected = user.id === targetUserId
                return (
                  <Link
                    key={user.id}
                    href={`/stats?userId=${user.id}&seasonId=${selectedSeason.id}`}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                      isSelected
                        ? "bg-[#a78bfa]/15 border-[#a78bfa]/50 text-[#a78bfa]"
                        : "bg-white/5 border-white/10 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                    }`}
                  >
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.image} alt="" className="w-5 h-5 rounded-full" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                        {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span>{user.displayName ?? user.email}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {!prediction ? (
          <div className="bg-[#1a1f2e] rounded-2xl p-10 border border-white/10 text-center">
            <p className="text-[#94a3b8]">予想が入力されていません</p>
          </div>
        ) : !hasStandings ? (
          <div className="bg-[#38bdf8]/5 border border-[#38bdf8]/20 rounded-2xl p-6">
            <p className="text-[#38bdf8] text-sm">シーズン開幕後、データ同期すると的中率が表示されます</p>
          </div>
        ) : !showRankings && !isOwnProfile ? (
          <div className="bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <span className="text-3xl">🤫</span>
              <div>
                <p className="text-[#a78bfa] font-bold">
                  {visibility === "pre-deadline" ? "予想受付中" : `終盤モード（残り${ENDGAME_REMAINING_MATCHDAYS}節以下）`}
                </p>
                <p className="text-[#94a3b8] text-sm mt-2">
                  {visibility === "pre-deadline"
                    ? "予想受付中です。締切を過ぎると的中率が計算されます。"
                    : "ネタバレ防止のため、的中率とチーム別の誤差は非表示です。最終節終了後、管理者が結果を開示すると一斉公開されます。"}
                </p>
              </div>
            </div>
          </div>
        ) : accuracyMetrics ? (
          <>
            {/* Accuracy metrics overview */}
            <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10">
              <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-5">的中率サマリー</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-white/3 rounded-xl p-4 border border-white/5 text-center">
                  <p className="text-2xl font-black text-[#4ade80] tabular">{accuracyMetrics.exactCount}</p>
                  <p className="text-xs text-[#94a3b8] mt-1">完全的中</p>
                  <p className="text-xs text-[#4ade80] mt-0.5">{accuracyMetrics.exactRate.toFixed(0)}%</p>
                </div>
                <div className="bg-white/3 rounded-xl p-4 border border-white/5 text-center">
                  <p className="text-2xl font-black text-[#38bdf8] tabular">{accuracyMetrics.within1Rate.toFixed(0)}%</p>
                  <p className="text-xs text-[#94a3b8] mt-1">±1位以内</p>
                </div>
                <div className="bg-white/3 rounded-xl p-4 border border-white/5 text-center">
                  <p className="text-2xl font-black text-[#fbbf24] tabular">{accuracyMetrics.within3Rate.toFixed(0)}%</p>
                  <p className="text-xs text-[#94a3b8] mt-1">±3位以内</p>
                </div>
                <div className="bg-white/3 rounded-xl p-4 border border-white/5 text-center">
                  <p className="text-2xl font-black text-[#f1f5f9] tabular">{accuracyMetrics.avgDiff}</p>
                  <p className="text-xs text-[#94a3b8] mt-1">平均誤差</p>
                </div>
              </div>

              {/* Progress bars */}
              <div className="space-y-3">
                {[
                  { label: "完全的中 (±0)", value: accuracyMetrics.exactRate, color: "#4ade80" },
                  { label: "±1位以内", value: accuracyMetrics.within1Rate, color: "#38bdf8" },
                  { label: "±2位以内", value: accuracyMetrics.within2Rate, color: "#38bdf8" },
                  { label: "±3位以内", value: accuracyMetrics.within3Rate, color: "#fbbf24" },
                  { label: "±5位以内", value: accuracyMetrics.within5Rate, color: "#fbbf24" },
                ].map(bar => (
                  <div key={bar.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#94a3b8]">{bar.label}</span>
                      <span className="font-semibold tabular" style={{ color: bar.color }}>
                        {bar.value.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${bar.value}%`, backgroundColor: bar.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Zone accuracy */}
            <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10">
              <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-4">ゾーン的中率</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "トップ4的中", hit: accuracyMetrics.top4Hit, total: 4, desc: "CL出場圏" },
                  { label: "上位半分的中", hit: Math.round(accuracyMetrics.within3Rate * 10 / 100), total: 10, desc: "1〜10位" },
                  { label: "降格圏的中", hit: accuracyMetrics.relegHit, total: 3, desc: "18〜20位" },
                ].map(zone => (
                  <div key={zone.label} className="bg-white/3 rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-[#94a3b8] mb-2">{zone.desc}</p>
                    <p className="text-lg font-bold text-[#f1f5f9]">{zone.hit}/{zone.total}</p>
                    <p className="text-sm font-semibold text-[#38bdf8]">{zone.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Team-by-team breakdown */}
            <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider">チーム別内訳</h2>
                <p className="text-xs text-[#94a3b8]">予想順で表示</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[#94a3b8] text-xs border-b border-white/10">
                      <th className="px-4 py-3 text-left">チーム</th>
                      <th className="px-4 py-3 text-center">予想</th>
                      <th className="px-4 py-3 text-center">実際</th>
                      <th className="px-4 py-3 text-center">誤差</th>
                      <th className="px-4 py-3 text-center hidden sm:table-cell">コメント</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamStats.sort((a, b) => a.predictedRank - b.predictedRank).map(row => (
                      <tr key={row.teamId} className={`border-b border-white/5 hover:bg-white/3 ${row.diff === 0 ? "bg-[#4ade80]/3" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <TeamCrest crestUrl={row.crestUrl} teamName={row.teamName} size={22} />
                            <span className="text-[#f1f5f9] font-medium text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">
                              {row.tla ?? row.teamName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-bold text-[#94a3b8] tabular">{row.predictedRank}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.actualRank !== null ? (
                            <span className="font-bold text-[#f1f5f9] tabular">{row.actualRank}</span>
                          ) : (
                            <span className="text-[#94a3b8]/30">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold tabular ${getDiffColor(row.diff)}`}>
                            {row.diff === null ? "-" : row.diff === 0 ? "✓" : `±${row.diff}`}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {row.comment ? (
                            <span className="text-xs text-[#94a3b8] italic truncate max-w-[200px] block" title={row.comment}>
                              &quot;{row.comment}&quot;
                            </span>
                          ) : (
                            <span className="text-[#94a3b8]/20 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        {/* Compatibility section (own profile only) */}
        {isOwnProfile && compatibilities.length > 0 && (
          <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10">
            <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-5">予想の相性</h2>

            {/* Most similar and most different */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {[
                { label: "最も近い予想", entry: compatibilities[0], accent: "#4ade80" },
                { label: "最も違う予想", entry: compatibilities[compatibilities.length - 1], accent: "#f87171" },
              ].map(({ label, entry, accent }) => (
                <Link key={entry.userId} href={`/stats?userId=${entry.userId}&seasonId=${selectedSeason.id}`}
                  className="bg-white/3 rounded-xl p-4 border border-white/10 hover:border-white/20 transition-colors">
                  <p className="text-xs text-[#94a3b8] mb-3">{label}</p>
                  <div className="flex items-center gap-3">
                    {entry.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.image} alt="" className="w-10 h-10 rounded-full border border-white/20" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold">
                        {(entry.displayName ?? "?").charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-[#f1f5f9] text-sm">{entry.displayName ?? entry.email}</p>
                      <p className="text-xs text-[#94a3b8]">完全一致: {entry.exactMatches}チーム</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xl font-black tabular" style={{ color: accent }}>
                        {entry.compatibilityScore}%
                      </p>
                      <p className="text-xs text-[#94a3b8]">相性</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Full compatibility list */}
            <div className="space-y-2">
              <p className="text-xs text-[#94a3b8] mb-3">全ユーザーとの相性</p>
              {compatibilities.map(c => (
                <Link key={c.userId} href={`/stats?userId=${c.userId}&seasonId=${selectedSeason.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/2 hover:bg-white/5 transition-colors">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt="" className="w-8 h-8 rounded-full border border-white/20" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-sm">
                      {(c.displayName ?? "?").charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f1f5f9] font-medium truncate">{c.displayName ?? c.email}</p>
                    <p className="text-xs text-[#94a3b8]">完全一致: {c.exactMatches}チーム</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-20 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${c.compatibilityScore}%`,
                        backgroundColor: c.compatibilityScore >= 70 ? "#4ade80" : c.compatibilityScore >= 50 ? "#38bdf8" : "#f87171"
                      }} />
                    </div>
                    <span className={`text-sm font-bold tabular w-10 text-right ${getCompatColor(c.compatibilityScore)}`}>
                      {c.compatibilityScore}%
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
