import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import AppShell from "@/components/AppShell"
import SectionNav from "@/components/SectionNav"
import ScorerBoard from "@/components/ScorerBoard"
import TeamCrest from "@/components/TeamCrest"
import { calculateScore } from "@/lib/scoring"
import { getScorerBoard } from "@/lib/scorer-total"
import { getScoringConfig } from "@/lib/site-config"
import { pageClass, rankingNav } from "@/lib/ui"
import {
  canShowRankings,
  getVisibilityStatus,
  getRemainingMatchdays,
  hasPassedDeadline,
  ENDGAME_REMAINING_MATCHDAYS,
} from "@/lib/season-visibility"

interface PageProps {
  searchParams: Promise<{ seasonId?: string }>
}

function ScoreBadge({ points }: { points: number | null }) {
  if (points === null) return <span className="text-[#94a3b8] text-xs">-</span>
  const cls =
    points <= -2 ? "bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30"
    : points <= 2 ? "bg-[#38bdf8]/10 text-[#38bdf8] border-[#38bdf8]/30"
    : points <= 10 ? "bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/30"
    : points <= 20 ? "bg-orange-400/10 text-orange-400 border-orange-400/30"
    : "bg-[#f87171]/10 text-[#f87171] border-[#f87171]/30"
  return (
    <span className={`inline-block text-sm font-black tabular px-2 py-0.5 rounded-lg border ${cls}`}>
      {points > 0 ? `+${points}` : points}
    </span>
  )
}

export default async function RankingPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const scoring = await getScoringConfig()
  const { seasonId: seasonIdParam } = await searchParams

  // 現在ランキングは「進行中（未確定）」シーズンのみ。確定済みはアーカイブへ。
  const seasons = await prisma.season.findMany({
    where: { isActive: true, isLocked: false },
    orderBy: { seasonYear: "desc" },
  })

  const selectedSeason = seasonIdParam
    ? seasons.find((s) => s.id === seasonIdParam)
    : seasons[0]

  type RankingEntry = {
    rank: number
    userId: string
    displayName: string | null
    email: string | null
    image: string | null
    favoriteClub: { name: string; crestUrl: string | null } | null
    totalPoints: number | null
    hasPrediction: boolean
  }

  let rankingEntries: RankingEntry[] = []

  if (selectedSeason) {
    const predictions = await prisma.prediction.findMany({
      where: { seasonId: selectedSeason.id },
      include: {
        user: {
          select: {
            id: true, displayName: true, email: true, image: true,
            favoriteClub: { select: { name: true, crestUrl: true } },
          },
        },
        details: true,
      },
    })

    const standings = await prisma.standing.findMany({ where: { seasonId: selectedSeason.id } })
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
      return {
        userId: pred.user.id,
        displayName: pred.user.displayName,
        email: pred.user.email,
        image: pred.user.image,
        favoriteClub: pred.user.favoriteClub,
        totalPoints,
        hasPrediction: true,
      }
    })

    entries.sort((a, b) => {
      if (a.totalPoints === null && b.totalPoints === null) return 0
      if (a.totalPoints === null) return 1
      if (b.totalPoints === null) return -1
      return a.totalPoints - b.totalPoints
    })

    rankingEntries = entries.map((e, i) => ({ ...e, rank: i + 1 }))
  }

  const myEntry = rankingEntries.find((e) => e.userId === session.user!.id)
  const leader = rankingEntries[0]

  const standingsForVisibility = selectedSeason
    ? await prisma.standing.findMany({
        where: { seasonId: selectedSeason.id },
        select: { played: true },
      })
    : []
  const hasStandings = standingsForVisibility.length > 0
  const showRankings = canShowRankings(selectedSeason ?? null, standingsForVisibility)
  const visibility = getVisibilityStatus(selectedSeason ?? null, standingsForVisibility)
  const remainingMatchdays = selectedSeason
    ? getRemainingMatchdays(standingsForVisibility, selectedSeason.leagueCode)
    : 0

  // 得点予想の一覧。順位表と違い可視制御の外に置く（実得点は現実のデータで、
  // 指名も常時公開する運用）。得点予想が1件も無ければ null が返って非表示になる。
  const scorerBoard = selectedSeason
    ? await getScorerBoard({
        seasonId: selectedSeason.id,
        leagueCode: selectedSeason.leagueCode,
        seasonYear: selectedSeason.seasonYear,
      })
    : null

  // 「予想を比較」は締切後だけ意味がある。締切前に出すと、押した先で
  // /results がこのシーズンを解決できずアーカイブへ飛んでしまう。
  const canCompare = selectedSeason ? hasPassedDeadline(selectedSeason) : false

  return (
    <AppShell title="現在のランキング">
      <div className={pageClass()}>
        {/* セクション内のビュー切替（第2階層）。
            /results 側と同じ位置（見出しより上）に置く。見出しの高さは画面ごとに違うため、
            見出しより下に置くとタブを切り替えた瞬間にタブ自体が上下にズレる。 */}
        <div className="mb-4">
          <SectionNav items={rankingNav(selectedSeason?.id, canCompare)} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#f1f5f9]">現在のランキング</h1>
            {/* スコアの読み方は見出し直下のキャプションに置く（1行のためにカードを1枚使っていた） */}
            {selectedSeason && (
              <>
                <p className="text-[#94a3b8] text-sm mt-1">
                  {selectedSeason.name}
                  {selectedSeason.isLocked && (
                    <span className="ml-2 text-xs border border-[#a78bfa]/30 text-[#a78bfa] bg-[#a78bfa]/10 px-2 py-0.5 rounded-full">確定</span>
                  )}
                </p>
                <p className="text-[#94a3b8]/80 text-xs mt-1">
                  スコアが低いほど上位（完全一致: -2点、ずれた分: +差分点）
                </p>
              </>
            )}
          </div>
        </div>

        {/* Season tabs */}
        {seasons.length > 1 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {seasons.map((s) => (
              <Link
                key={s.id}
                href={`/ranking?seasonId=${s.id}`}
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
        )}

        {!hasStandings && selectedSeason && (
          <div className="mb-6 p-4 bg-[#38bdf8]/5 border border-[#38bdf8]/20 rounded-xl text-sm text-[#38bdf8]">
            シーズン開幕前のため、スコアはまだ計算されていません。締切後にデータ同期するとランキングが表示されます。
          </div>
        )}

        {visibility === "pre-deadline" && hasStandings && (
          <div className="mb-6 p-4 bg-[#38bdf8]/5 border border-[#38bdf8]/20 rounded-xl text-sm text-[#38bdf8]">
            予想受付中です。締切を過ぎるとランキングが表示されます。
          </div>
        )}

        {visibility === "endgame-hidden" && (
          <div className="mb-6 bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <span className="text-3xl">🤫</span>
              <div>
                <p className="text-[#a78bfa] font-bold">終盤モード — 残り{remainingMatchdays}節</p>
                <p className="text-[#94a3b8] text-sm mt-2">
                  残り{ENDGAME_REMAINING_MATCHDAYS}節以下になったため、全員の順位・スコアを非公開にしています。
                  <br />
                  最終節終了後、管理者が結果を開示するボタンを押すと一斉に発表されます。それまでお楽しみに。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* My current position banner */}
        {showRankings && myEntry && myEntry.totalPoints !== null && leader && (
          <div className="mb-6 bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-[#a78bfa] font-semibold uppercase tracking-wider">あなたの現在位置</p>
              <p className="text-2xl font-black text-[#f1f5f9] mt-1">{myEntry.rank}位</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#94a3b8]">現在スコア</p>
              <ScoreBadge points={myEntry.totalPoints} />
            </div>
            {myEntry.rank > 1 && leader.totalPoints !== null && (
              <div className="text-right">
                <p className="text-xs text-[#94a3b8]">首位との差</p>
                <p className="text-sm font-bold text-[#fbbf24]">+{myEntry.totalPoints - leader.totalPoints}pt</p>
              </div>
            )}
          </div>
        )}

        {/* Full ranking table */}
        <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 overflow-hidden">
          {selectedSeason && !showRankings ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-4xl">🔒</p>
              <p className="text-[#f1f5f9] font-semibold">順位は現在非公開です</p>
              <p className="text-[#94a3b8] text-sm max-w-md mx-auto">
                {visibility === "pre-deadline"
                  ? "予想受付中です。締切を過ぎると他の人の順位・スコアが見られるようになります。"
                  : `残り${ENDGAME_REMAINING_MATCHDAYS}節以下のためネタバレ防止中。最終節終了後、管理者が結果を開示すると一斉公開されます。`}
              </p>
            </div>
          ) : selectedSeason ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#94a3b8] text-xs uppercase tracking-wider border-b border-white/10">
                    <th className="px-4 py-3 w-12">#</th>
                    <th className="px-4 py-3">ユーザー</th>
                    <th className="px-4 py-3 w-12 text-center hidden sm:table-cell">クラブ</th>
                    <th className="px-4 py-3 text-right">スコア</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingEntries.map((entry) => {
                    const isMe = entry.userId === session.user!.id
                    const rankStyle =
                      entry.rank === 1 ? "border-l-2 border-yellow-500"
                      : entry.rank === 2 ? "border-l-2 border-slate-400"
                      : entry.rank === 3 ? "border-l-2 border-amber-700"
                      : isMe ? "border-l-2 border-[#a78bfa]"
                      : ""
                    return (
                      <tr
                        key={entry.userId}
                        className={`border-b border-white/5 transition-colors hover:bg-white/3 ${
                          isMe ? "bg-[#a78bfa]/5" : ""
                        } ${rankStyle}`}
                      >
                        <td className="px-4 py-3">
                          <span className={`font-bold tabular ${
                            entry.rank === 1 ? "text-yellow-400"
                            : entry.rank === 2 ? "text-slate-300"
                            : entry.rank === 3 ? "text-amber-600"
                            : "text-[#94a3b8]"
                          }`}>
                            {entry.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {entry.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={entry.image} alt="" className="w-7 h-7 rounded-full border border-white/20" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-[#38bdf8]/20 flex items-center justify-center text-[#38bdf8] font-bold text-xs">
                                {(entry.displayName ?? "?").charAt(0)}
                              </div>
                            )}
                            <span className="text-[#f1f5f9] font-medium">
                              {entry.displayName ?? entry.email ?? "Anonymous"}
                            </span>
                            {isMe && (
                              <span className="text-xs text-[#a78bfa] bg-[#a78bfa]/10 border border-[#a78bfa]/30 px-1.5 py-0.5 rounded-full">
                                あなた
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          {entry.favoriteClub ? (
                            <div className="flex justify-center">
                              <TeamCrest crestUrl={entry.favoriteClub.crestUrl} teamName={entry.favoriteClub.name} size={22} />
                            </div>
                          ) : (
                            <span className="text-[#94a3b8]/30">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.hasPrediction ? (
                            <ScoreBadge points={entry.totalPoints} />
                          ) : (
                            <span className="text-[#94a3b8]/50 text-xs">未予想</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <Link href={`/ranking/${entry.userId}${selectedSeason ? `?seasonId=${selectedSeason.id}` : ""}`}
                            className="text-xs text-[#38bdf8] hover:underline">
                            詳細 →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                  {rankingEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[#94a3b8]">
                        まだ予想がありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-[#94a3b8] space-y-2">
              <p>進行中のシーズンはありません</p>
              <p className="text-sm text-[#94a3b8]/80">確定済みシーズンの結果はナビの「アーカイブ」から見られます</p>
            </div>
          )}
        </div>

        {scorerBoard && (
          <div className="mt-6">
            <ScorerBoard board={scorerBoard} myUserId={session.user.id} />
          </div>
        )}

        {/* My sticky row if not in view */}
        {showRankings && myEntry && myEntry.rank > 10 && myEntry.totalPoints !== null && (
          <div className="sticky bottom-20 md:bottom-8 mt-4">
            <div className="bg-[#a78bfa]/15 border border-[#a78bfa]/40 rounded-xl px-4 py-3 flex items-center justify-between backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span className="text-[#a78bfa] font-bold">{myEntry.rank}位</span>
                <span className="text-[#f1f5f9] text-sm">{myEntry.displayName ?? myEntry.email}</span>
                {/* 「確定」バッジと同じ紫のピルだと意味が混ざる。塗りの中立色で形から区別する。 */}
                <span className="text-xs text-[var(--foreground)] bg-[var(--fill-hover)] px-1.5 py-0.5 rounded-full">あなた</span>
              </div>
              <ScoreBadge points={myEntry.totalPoints} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
