import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import AppShell from "@/components/AppShell"
import { LeagueHeader } from "@/components/LeagueHeader"
import LeagueSeasonPills from "@/components/LeagueSeasonPills"
import { pageClass } from "@/lib/ui"
import { getLeagueSeasons, pickSeason } from "@/lib/seasons"
import { fetchScorers, type Scorer } from "@/lib/league-data"

interface PageProps {
  searchParams: Promise<{ seasonId?: string }>
}

export default async function LeagueScorersPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const { seasonId: seasonIdParam } = await searchParams
  const seasons = await getLeagueSeasons()
  const selectedSeason = pickSeason(seasons, seasonIdParam)

  let scorers: Scorer[] = []
  let loadError: string | null = null
  if (selectedSeason) {
    try {
      const res = await fetchScorers({
        leagueCode: selectedSeason.leagueCode,
        seasonYear: selectedSeason.seasonYear,
        limit: 50,
      })
      scorers = res.scorers
    } catch {
      loadError = "得点ランキングを取得できませんでした。時間をおいて再度お試しください。"
    }
  }

  return (
    <AppShell title="リーグ">
      <div className={pageClass("wide", "space-y-6")}>
        <LeagueHeader leagueCode={selectedSeason?.leagueCode} />
        <LeagueSeasonPills seasons={seasons} selectedId={selectedSeason?.id} basePath="/league" />

        <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 p-6 space-y-4">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h2 className="text-lg font-bold text-[#f1f5f9]">得点ランキング</h2>
            <span className="text-sm text-[#94a3b8]">{selectedSeason?.name ?? ""}</span>
          </div>

          {loadError ? (
            <p className="py-10 text-center text-[#94a3b8] text-sm">{loadError}</p>
          ) : scorers.length === 0 ? (
            <p className="py-10 text-center text-[#94a3b8] text-sm">
              このシーズンの得点データはまだありません
            </p>
          ) : (
            <>
              {/* 広い表はこのコンテナの中だけで横スクロールさせる（ui-layout-rules R6） */}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-[#94a3b8] border-b border-white/10">
                      <th className="pb-2 pr-3 text-right w-10 whitespace-nowrap">#</th>
                      <th className="pb-2 px-3 text-left min-w-[150px]">選手</th>
                      <th className="pb-2 px-3 text-left min-w-[130px]">チーム</th>
                      <th className="pb-2 px-3 text-right whitespace-nowrap">得点</th>
                      <th className="pb-2 px-3 text-right whitespace-nowrap">アシスト</th>
                      <th className="pb-2 px-3 text-right whitespace-nowrap">PK</th>
                      <th className="pb-2 pl-3 text-right whitespace-nowrap">試合</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorers.map((s) => (
                      <tr key={`${s.playerId ?? s.playerName}-${s.rank}`} className="border-b border-white/5">
                        <td className="py-2.5 pr-3 text-right tabular-nums text-[#94a3b8]">{s.rank}</td>
                        <td className="py-2.5 px-3 text-[#f1f5f9] font-medium">{s.playerName}</td>
                        <td className="py-2.5 px-3 text-[#94a3b8] whitespace-nowrap">
                          {s.teamShortName ?? s.teamName}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-[#f1f5f9] font-bold">{s.goals}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-[#94a3b8]">
                          {s.assists ?? "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-[#94a3b8]">
                          {s.penalties ?? "—"}
                        </td>
                        <td className="py-2.5 pl-3 text-right tabular-nums text-[#94a3b8]">
                          {s.matchesPlayed ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* 「—」を 0 と読ませないための注記。提供元でアシスト・PKは欠損が多い。 */}
              <p className="text-xs text-[#94a3b8]/80">
                得点順。「—」は提供元にデータが無いという意味で、0 ではありません。
              </p>
            </>
          )}
        </div>
      </div>
    </AppShell>
  )
}
