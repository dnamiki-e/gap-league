import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import AppShell from "@/components/AppShell"
import SectionNav from "@/components/SectionNav"
import { calculateScore } from "@/lib/scoring"
import { getScoringConfig } from "@/lib/site-config"
import RankRaceChart, { type RaceUser } from "@/components/RankRaceChart"
import { pageClass, statsNav } from "@/lib/ui"
import {
  canShowRankings,
  getVisibilityStatus,
  getEndgameRemaining,
} from "@/lib/season-visibility"

interface PageProps {
  searchParams: Promise<{ seasonId?: string }>
}

// Line chart colors per user (cycling)
const LINE_COLORS = [
  "#38bdf8", "#a78bfa", "#4ade80", "#fbbf24", "#f87171",
  "#818cf8", "#34d399", "#fb923c", "#e879f9", "#38bdf8",
]

export default async function TimelinePage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const scoring = await getScoringConfig()
  const { seasonId: seasonIdParam } = await searchParams

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

  // 順位表示ゲート（現在の standings で判定。timeline 用にも同じルールで隠す）
  const currentStandings = await prisma.standing.findMany({
    where: { seasonId: selectedSeason.id },
    select: { played: true },
  })
  const showRankings = canShowRankings(selectedSeason, currentStandings)
  const visibility = getVisibilityStatus(selectedSeason, currentStandings)

  // Get snapshots
  const snapshots = await prisma.standingSnapshot.findMany({
    where: { seasonId: selectedSeason.id },
    orderBy: [{ matchday: "asc" }, { actualRank: "asc" }],
  })

  // Get all predictions
  const predictions = await prisma.prediction.findMany({
    where: { seasonId: selectedSeason.id },
    include: {
      user: { select: { id: true, displayName: true, email: true, image: true } },
      details: true,
    },
  })

  // Group snapshots by matchday
  const matchdayMap = new Map<number, Map<string, number>>()
  for (const snap of snapshots) {
    if (!matchdayMap.has(snap.matchday)) matchdayMap.set(snap.matchday, new Map())
    matchdayMap.get(snap.matchday)!.set(snap.teamId, snap.actualRank)
  }

  const matchdays = [...matchdayMap.keys()].sort((a, b) => a - b)

  // Calculate per-matchday scores and ranks
  type TimelineEntry = { matchday: number; score: number; rank: number }
  type UserTimeline = {
    userId: string
    displayName: string | null
    email: string | null
    image: string | null
    timeline: TimelineEntry[]
    isCurrentUser: boolean
    colorIndex: number
  }

  const userTimelines: UserTimeline[] = predictions.map((pred, idx) => {
    const timeline: TimelineEntry[] = []

    for (const matchday of matchdays) {
      const standingMap = matchdayMap.get(matchday)!
      const scoreDetails = pred.details
        .map(d => {
          const actualRank = standingMap.get(d.teamId)
          return actualRank !== undefined ? { predictedRank: d.predictedRank, actualRank } : null
        })
        .filter((d): d is { predictedRank: number; actualRank: number } => d !== null)

      if (scoreDetails.length > 0) {
        timeline.push({ matchday, score: calculateScore(scoreDetails, scoring), rank: 0 })
      }
    }

    return {
      userId: pred.userId,
      displayName: pred.user.displayName,
      email: pred.user.email,
      image: pred.user.image,
      timeline,
      isCurrentUser: pred.userId === session.user!.id,
      colorIndex: idx % LINE_COLORS.length,
    }
  })

  // Fill ranks per matchday
  for (const matchday of matchdays) {
    const scores = userTimelines
      .map(u => ({ userId: u.userId, score: u.timeline.find(t => t.matchday === matchday)?.score ?? null }))
      .filter(s => s.score !== null) as { userId: string; score: number }[]

    scores.sort((a, b) => a.score - b.score)
    scores.forEach((s, rank) => {
      const user = userTimelines.find(u => u.userId === s.userId)
      const entry = user?.timeline.find(t => t.matchday === matchday)
      if (entry) entry.rank = rank + 1
    })
  }

  const totalUsers = userTimelines.length
  const hasData = matchdays.length > 0

  // アニメーション用に matchdays と同じ並びの順位/スコア配列へ整列する
  const raceUsers: RaceUser[] = userTimelines.map((u) => {
    const byMd = new Map(u.timeline.map((t) => [t.matchday, t]))
    return {
      userId: u.userId,
      label: u.displayName ?? u.email ?? "?",
      isCurrentUser: u.isCurrentUser,
      color: u.isCurrentUser ? "#a78bfa" : LINE_COLORS[u.colorIndex],
      ranks: matchdays.map((md) => {
        const r = byMd.get(md)?.rank
        return r && r > 0 ? r : null
      }),
      scores: matchdays.map((md) => byMd.get(md)?.score ?? null),
    }
  })

  return (
    <AppShell title="分析">
      <div className={pageClass("wide", "space-y-6")}>
        {/* Header */}
        <div className="space-y-4">
        {/* セクション内のビュー切替（第2階層）。
            タブを押した指の下でボタンが動かないよう、見出しより上の固定位置に置く。
            見出しの行数がタブによって変わると、その分だけタブが上下にズレてしまう。 */}
          <SectionNav items={statsNav(selectedSeason.id)} />
          <div>
            <h1 className="text-2xl font-bold text-[#f1f5f9]">分析</h1>
            <p className="text-[#94a3b8] text-sm mt-1">
              {selectedSeason.name} — 節ごとの順位推移
            </p>
            <p className="text-[#94a3b8]/70 text-xs mt-1">
              各節のスナップショットから作っています。
            </p>
          </div>
        </div>

        {/* Season selector */}
        {seasons.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {seasons.map(s => (
              <Link key={s.id} href={`/stats/timeline?seasonId=${s.id}`}
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

        {!showRankings ? (
          <div className="bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-2xl p-8 text-center space-y-3">
            <p className="text-5xl">🤫</p>
            <p className="text-[#a78bfa] font-bold">
              {visibility === "pre-deadline" ? "予想受付中" : `終盤モード（残り${getEndgameRemaining(selectedSeason?.leagueCode ?? "")}節以下）`}
            </p>
            <p className="text-[#94a3b8] text-sm">
              {visibility === "pre-deadline"
                ? "予想受付中です。締切を過ぎると節別変動チャートが表示されます。"
                : "ネタバレ防止のため、節別変動チャートは非公開です。最終節終了後、管理者が結果を開示すると一斉公開されます。"}
            </p>
          </div>
        ) : !hasData ? (
          <div className="bg-[#1a1f2e] rounded-2xl p-10 border border-white/10 text-center space-y-3">
            <p className="text-4xl">&#128202;</p>
            <p className="text-[#f1f5f9] font-semibold">データがまだありません</p>
            <p className="text-[#94a3b8] text-sm">
              管理者がデータ同期を実行するたびに節ごとのスナップショットが保存されます。
              <br />複数回同期すると順位変動チャートが表示されます。
            </p>
          </div>
        ) : (
          <>
            {/* アニメーション付き順位変動チャート（折れ線＋順位リスト連動） */}
            <RankRaceChart matchdays={matchdays} users={raceUsers} totalUsers={totalUsers} />

            {/* Per-matchday ranking table */}
            <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider">節別スコア一覧</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#94a3b8] border-b border-white/10">
                      <th className="px-4 py-3 text-left sticky left-0 bg-[#1a1f2e] z-10">ユーザー</th>
                      {matchdays.map(md => (
                        <th key={md} className="px-3 py-3 text-center whitespace-nowrap">{md}節</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {userTimelines
                      .sort((a, b) => {
                        const aLast = a.timeline[a.timeline.length - 1]?.rank ?? 999
                        const bLast = b.timeline[b.timeline.length - 1]?.rank ?? 999
                        return aLast - bLast
                      })
                      .map(user => {
                        const color = user.isCurrentUser ? "#a78bfa" : LINE_COLORS[user.colorIndex]
                        return (
                          <tr
                            key={user.userId}
                            className={`border-b border-white/5 ${user.isCurrentUser ? "bg-[#a78bfa]/5" : ""}`}
                          >
                            <td className="px-4 py-3 sticky left-0 bg-[#1a1f2e] z-10">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                <span className={`font-medium truncate max-w-[100px] ${user.isCurrentUser ? "text-[#a78bfa]" : "text-[#f1f5f9]"}`}>
                                  {user.displayName ?? user.email}
                                </span>
                              </div>
                            </td>
                            {matchdays.map(md => {
                              const entry = user.timeline.find(t => t.matchday === md)
                              return (
                                <td key={md} className="px-3 py-3 text-center">
                                  {entry && entry.rank > 0 ? (
                                    <div>
                                      <p className={`font-bold tabular ${entry.rank === 1 ? "text-yellow-400" : entry.rank <= 3 ? "text-[#38bdf8]" : "text-[#94a3b8]"}`}>
                                        {entry.rank}位
                                      </p>
                                      <p className="text-[#94a3b8]/60 tabular">{entry.score}pt</p>
                                    </div>
                                  ) : (
                                    <span className="text-[#94a3b8]/20">-</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
