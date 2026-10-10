import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import AppShell from "@/components/AppShell"
import { LeagueHeader } from "@/components/LeagueHeader"
import LeagueSeasonPills from "@/components/LeagueSeasonPills"
import SectionNav from "@/components/SectionNav"
import TeamCrest from "@/components/TeamCrest"
import { pageClass, leagueNav } from "@/lib/ui"
import { getLeagueSeasons, pickSeason } from "@/lib/seasons"
import { prisma } from "@/lib/prisma"
import {
  addDaysKey,
  formatDayLabel,
  formatKickoff,
  groupByDay,
  jstDayKey,
  kickoffDisplay,
  matchState,
  matchesOnDay,
  pickNextRound,
} from "@/lib/fixtures"

interface PageProps {
  searchParams: Promise<{ seasonId?: string }>
}

type FixtureRow = Awaited<ReturnType<typeof loadMatches>>[number]

function loadMatches(seasonId: string) {
  return prisma.match.findMany({
    where: { seasonId },
    orderBy: { utcDate: "asc" },
    include: {
      homeTeam: { select: { name: true, shortName: true, crestUrl: true } },
      awayTeam: { select: { name: true, shortName: true, crestUrl: true } },
    },
  })
}

/**
 * 1試合。ホームを上、アウェイを下に縦積みにして、スコアは各チームの右に置く。
 * 横一列（ホーム vs アウェイ）にすると 320px でチーム名が1文字まで潰れる。
 */
function MatchRow({ match, now }: { match: FixtureRow; now: Date }) {
  const state = matchState(match, now)
  const kickoff = kickoffDisplay(match)
  const showScore = (state === "finished" || state === "live") && match.scoreHomeFt != null && match.scoreAwayFt != null

  const side = (team: FixtureRow["homeTeam"], score: number | null) => (
    <div className="flex items-center gap-2 min-w-0">
      <TeamCrest crestUrl={team.crestUrl} teamName={team.name} size={20} />
      <span className="flex-1 min-w-0 truncate text-sm text-[#f1f5f9] font-medium">{team.shortName ?? team.name}</span>
      {showScore && <span className="w-6 shrink-0 text-right text-sm tabular-nums font-bold text-[#f1f5f9]">{score}</span>}
    </div>
  )

  return (
    <li className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-b-0">
      <span className="w-12 shrink-0 text-sm tabular-nums text-[#f1f5f9] font-semibold">
        {kickoff.kind === "time" ? kickoff.text : <span className="text-xs font-normal text-[#94a3b8]">時間未定</span>}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        {side(match.homeTeam, match.scoreHomeFt)}
        {side(match.awayTeam, match.scoreAwayFt)}
      </div>
      {/* 状態は色だけで伝えない（R5）。文言を必ず添える */}
      <span className="w-14 shrink-0 text-right text-xs text-[#94a3b8]">
        {state === "live" && <span className="text-[#4ade80] font-semibold">試合中</span>}
        {state === "finished" && "終了"}
        {state === "started" && "開始済み"}
      </span>
    </li>
  )
}

/** 日付は見出し（カードのキャプション）が持っているときは出さない */
function DayBlock({ dayKey, matches, now, showDay = true }: { dayKey: string; matches: FixtureRow[]; now: Date; showDay?: boolean }) {
  return (
    <div>
      {showDay && <h3 className="text-xs font-semibold text-[#94a3b8] mb-1">{formatDayLabel(dayKey)}</h3>}
      <ul>
        {matches.map((m) => (
          <MatchRow key={m.id} match={m} now={now} />
        ))}
      </ul>
    </div>
  )
}

function Card({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#1a1f2e] rounded-2xl border border-white/10 p-4 sm:p-6 space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold text-[#f1f5f9]">{title}</h2>
        {caption && <span className="text-sm text-[#94a3b8]">{caption}</span>}
      </div>
      {children}
    </section>
  )
}

export default async function LeagueFixturesPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const { seasonId: seasonIdParam } = await searchParams
  const seasons = await getLeagueSeasons()
  const selectedSeason = pickSeason(seasons, seasonIdParam)
  const matches = selectedSeason ? await loadMatches(selectedSeason.id) : []

  const now = new Date()
  const todayKey = jstDayKey(now)
  const tomorrowKey = addDaysKey(todayKey, 1)
  const today = matchesOnDay(matches, todayKey)
  const tomorrow = matchesOnDay(matches, tomorrowKey)
  const nextRound = pickNextRound(matches, now)

  // 次節のうち、今日・明日として上に出している日は重ねて出さない
  const nextDays = nextRound
    ? groupByDay(nextRound.matches).filter((d) => d.dayKey !== todayKey && d.dayKey !== tomorrowKey)
    : []
  const nextOverlaps = nextRound ? nextRound.matches.some((m) => [todayKey, tomorrowKey].includes(jstDayKey(m.utcDate))) : false
  const nextFirst = nextRound?.matches[0]
  const nextLast = nextRound?.matches[nextRound.matches.length - 1]

  return (
    <AppShell title="リーグ">
      <div className={pageClass("wide", "space-y-6")}>
        {/* セクション内のビュー切替（第2階層）。見出しより上の固定位置に置く */}
        <SectionNav items={leagueNav(selectedSeason?.id)} />
        <LeagueHeader leagueCode={selectedSeason?.leagueCode} />
        <LeagueSeasonPills seasons={seasons} selectedId={selectedSeason?.id} basePath="/league/fixtures" />

        {matches.length === 0 ? (
          <Card title="日程">
            <p className="py-10 text-center text-[#94a3b8] text-sm">
              このシーズンの日程はまだ取り込まれていません。管理者のデータ同期後に表示されます。
            </p>
          </Card>
        ) : (
          <>
            <Card title="今日" caption={formatDayLabel(todayKey)}>
              {today.length === 0 ? (
                <p className="py-4 text-sm text-[#94a3b8]">今日の試合はありません</p>
              ) : (
                <DayBlock dayKey={todayKey} matches={today} now={now} showDay={false} />
              )}
            </Card>

            <Card title="明日" caption={formatDayLabel(tomorrowKey)}>
              {tomorrow.length === 0 ? (
                <p className="py-4 text-sm text-[#94a3b8]">明日の試合はありません</p>
              ) : (
                <DayBlock dayKey={tomorrowKey} matches={tomorrow} now={now} showDay={false} />
              )}
            </Card>

            <Card
              title="次節"
              caption={
                nextRound && nextFirst && nextLast
                  ? `${nextRound.label}　${formatDayLabel(jstDayKey(nextFirst.utcDate))}〜${formatDayLabel(jstDayKey(nextLast.utcDate))}`
                  : undefined
              }
            >
              {!nextRound ? (
                <p className="py-4 text-sm text-[#94a3b8]">このシーズンの残りの日程はありません</p>
              ) : (
                <div className="space-y-4">
                  {nextOverlaps && (
                    <p className="text-xs text-[#94a3b8]">今日・明日の試合は上に表示しています。</p>
                  )}
                  {nextDays.map((d) => (
                    <DayBlock key={d.dayKey} dayKey={d.dayKey} matches={d.matches} now={now} />
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        <p className="text-xs text-[#94a3b8]/80">
          時刻は日本時間（{formatKickoff(now)} 現在）。日程と結果は数時間おきに同期するため、試合直後は結果が反映されるまで「開始済み」と表示されます。
        </p>
      </div>
    </AppShell>
  )
}
