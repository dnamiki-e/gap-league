import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import AppShell from "@/components/AppShell"
import ScorerBoard from "@/components/ScorerBoard"
import SectionNav from "@/components/SectionNav"
import { calculateScore } from "@/lib/scoring"
import { getScorerBoard } from "@/lib/scorer-total"
import { getScoringConfig } from "@/lib/site-config"
import { pageClass, archiveNav } from "@/lib/ui"
import { getArchiveSeasons, pickSeason } from "@/lib/seasons"

interface PageProps {
  searchParams: Promise<{ seasonId?: string }>
}

function ScoreBadge({ points }: { points: number | null }) {
  if (points === null) return <span className="text-[#94a3b8] text-xs">-</span>
  const cls =
    points <= -2 ? "bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30"
    : points <= 10 ? "bg-[#38bdf8]/10 text-[#38bdf8] border-[#38bdf8]/30"
    : "bg-[#f87171]/10 text-[#f87171] border-[#f87171]/30"
  return (
    <span className={`inline-block text-sm font-black tabular px-2 py-0.5 rounded-lg border ${cls}`}>
      {points}pt
    </span>
  )
}

export default async function RankingArchivePage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const scoring = await getScoringConfig()
  const { seasonId: seasonIdParam } = await searchParams

  // アーカイブは「確定済み（ロック済み）」シーズンのみを表示する。
  // 「予想を比較」タブと同じ一覧を使うこと（lib/seasons.ts のコメント参照）。
  const displaySeasons = await getArchiveSeasons()
  const selectedSeason = pickSeason(displaySeasons, seasonIdParam)

  type RankingEntry = {
    rank: number
    userId: string
    displayName: string | null
    email: string | null
    image: string | null
    favoriteClub: { name: string; crestUrl: string | null } | null
    totalPoints: number | null
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
      return { userId: pred.user.id, displayName: pred.user.displayName, email: pred.user.email, image: pred.user.image, favoriteClub: pred.user.favoriteClub, totalPoints }
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

  // 得点予想の一覧。予想が1件も無いシーズンでは null が返って非表示になる。
  const scorerBoard = selectedSeason
    ? await getScorerBoard({
        seasonId: selectedSeason.id,
        leagueCode: selectedSeason.leagueCode,
        seasonYear: selectedSeason.seasonYear,
      })
    : null

  return (
    <AppShell title="アーカイブ">
      <div className={pageClass()}>
        {/* セクション内のビュー切替（第2階層）。
            タブを押した指の下でボタンが動かないよう、見出しより上の固定位置に置く。
            見出しの行数がタブによって変わると、その分だけタブが上下にズレてしまう。 */}
        <div className="mb-4">
          <SectionNav items={archiveNav(selectedSeason?.id)} />
        </div>

        {/* 見出しは2タブで完全に同一にする（高さが揃わないと下のシーズン選択もズレる）。
            余白も「予想を比較」側の space-y-4 に合わせること。 */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-[#f1f5f9]">アーカイブ</h1>
          <p className="text-[#94a3b8] text-xs mt-0.5">確定したシーズンの最終結果</p>
          {selectedSeason && (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[#94a3b8] text-sm">{selectedSeason.name}</p>
              {selectedSeason.isLocked && (
                <span className="text-xs border border-[#a78bfa]/30 text-[#a78bfa] bg-[#a78bfa]/10 px-2 py-0.5 rounded-full">確定</span>
              )}
            </div>
          )}
        </div>

        {/* Season selector */}
        {displaySeasons.length > 1 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {displaySeasons.map((s) => (
              <Link
                key={s.id}
                href={`/ranking/archive?seasonId=${s.id}`}
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

        {displaySeasons.length === 0 ? (
          <div className="bg-[#1a1f2e] rounded-2xl p-10 border border-white/10 text-center">
            <p className="text-[#94a3b8]">確定済みのシーズンがありません</p>
          </div>
        ) : (
          <>
            {/* Full table */}
            <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[#94a3b8] text-xs uppercase tracking-wider border-b border-white/10">
                      <th className="px-4 py-3 w-12">#</th>
                      <th className="px-4 py-3">ユーザー</th>
                      <th className="px-4 py-3 text-right">最終スコア</th>
                      <th className="px-4 py-3 text-right hidden md:table-cell">詳細</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingEntries.map((entry) => {
                      const isMe = entry.userId === session.user!.id
                      return (
                        <tr
                          key={entry.userId}
                          className={`border-b border-white/5 hover:bg-white/3 transition-colors ${isMe ? "bg-[#a78bfa]/5 border-l-2 border-[#a78bfa]" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <span className={`font-bold tabular ${entry.rank === 1 ? "text-yellow-400" : entry.rank === 2 ? "text-slate-300" : entry.rank === 3 ? "text-amber-600" : "text-[#94a3b8]"}`}>
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
                              <span className="text-[#f1f5f9] font-medium">{entry.displayName ?? entry.email ?? "Anonymous"}</span>
                              {isMe && (
                                /* 「あなた」は状態ではなく識別ラベル。「確定」バッジ（紫の枠線ピル）と
                                   同じ形・同じ色だと同じ意味に読まれるため、塗りの中立色で形から区別する。 */
                                <span className="text-xs text-[var(--foreground)] bg-[var(--fill-hover)] px-1.5 py-0.5 rounded-full">あなた</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <ScoreBadge points={entry.totalPoints} />
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
                        <td colSpan={4} className="py-12 text-center text-[#94a3b8]">まだ予想がありません</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {scorerBoard && (
              <div className="mt-6">
                <ScorerBoard board={scorerBoard} myUserId={session.user.id} />
              </div>
            )}

            {/* My rank in this past season */}
            {myEntry && (
              <div className="mt-4 bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#a78bfa] font-semibold">あなたの結果</p>
                  <p className="text-xl font-black text-[#f1f5f9]">{myEntry.rank}位</p>
                </div>
                <ScoreBadge points={myEntry.totalPoints} />
                <Link href={`/ranking/${myEntry.userId}${selectedSeason ? `?seasonId=${selectedSeason.id}` : ""}`}
                  className="text-sm text-[#38bdf8] hover:underline">
                  詳細を見る →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
