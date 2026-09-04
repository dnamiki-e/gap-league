import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import AppShell from "@/components/AppShell"
import SectionNav from "@/components/SectionNav"
import PredictionMatrix from "@/components/PredictionMatrix"
import { pageClass, archiveNav, rankingNav } from "@/lib/ui"
import {
  buildMatrixRows,
  defaultMatrixColor,
  defaultMatrixOrder,
  parseMatrixOrder,
  parseMatrixColor,
} from "@/lib/prediction-matrix"
import { getComparableSeasons, pickSeason } from "@/lib/seasons"
import { calculateScore } from "@/lib/scoring"
import { getScoringConfig } from "@/lib/site-config"
import {
  canShowRankings,
  getVisibilityStatus,
  getRemainingMatchdays,
  getCurrentMatchday,
  getEndgameRemaining,
} from "@/lib/season-visibility"

interface PageProps {
  searchParams: Promise<{ seasonId?: string; order?: string; color?: string }>
}

export default async function ResultsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const scoring = await getScoringConfig()
  const { seasonId: seasonIdParam, order: orderParam, color: colorParam } = await searchParams

  // 確定済み＋締切を過ぎた進行中シーズン（lib/seasons.ts のコメント参照）
  const seasons = await getComparableSeasons()
  const selectedSeason = pickSeason(seasons, seasonIdParam)

  // --- Per-season data ---
  const standings = selectedSeason
    ? await prisma.standing.findMany({
        where: { seasonId: selectedSeason.id },
        include: { team: true },
        orderBy: { actualRank: "asc" },
      })
    : []

  const predictions = selectedSeason
    ? await prisma.prediction.findMany({
        where: { seasonId: selectedSeason.id },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
          details: true,
        },
      })
    : []

  const scoresFromDb = selectedSeason
    ? await prisma.score.findMany({
        where: { seasonId: selectedSeason.id },
        include: { user: { select: { id: true, displayName: true } } },
        orderBy: { totalPoints: "asc" },
      })
    : []

  // Build standing map: teamId -> Standing
  const standingMap = new Map(standings.map((s) => [s.teamId, s]))

  // --- Ranking entries (computed from predictions when standings exist) ---
  type RankingEntry = {
    userId: string
    displayName: string | null
    email: string | null
    totalPoints: number | null
    rank: number
  }

  const rankingEntries: RankingEntry[] = (() => {
    if (!selectedSeason || standings.length === 0) {
      // Fallback to DB scores
      return scoresFromDb.map((s, i) => ({
        userId: s.userId,
        displayName: s.user.displayName,
        email: null,
        totalPoints: s.totalPoints,
        rank: i + 1,
      }))
    }

    const computed = predictions.map((pred) => {
      const scoreDetails = pred.details
        .map((d) => {
          const standing = standingMap.get(d.teamId)
          if (!standing) return null
          return { predictedRank: d.predictedRank, actualRank: standing.actualRank }
        })
        .filter((d): d is { predictedRank: number; actualRank: number } => d !== null)
      const totalPoints =
        scoreDetails.length > 0
          ? calculateScore(scoreDetails, scoring)
          : null
      return {
        userId: pred.user.id,
        displayName: pred.user.displayName,
        email: pred.user.email,
        totalPoints,
      }
    })

    computed.sort((a, b) => {
      if (a.totalPoints === null && b.totalPoints === null) return 0
      if (a.totalPoints === null) return 1
      if (b.totalPoints === null) return -1
      return a.totalPoints - b.totalPoints
    })

    return computed.map((e, i) => ({ ...e, rank: i + 1 }))
  })()

  // Build prediction lookup: userId -> Map<teamId, predictedRank>
  const predictionByUser = new Map<string, Map<string, number>>()
  for (const pred of predictions) {
    const teamMap = new Map<string, number>()
    for (const d of pred.details) {
      teamMap.set(d.teamId, d.predictedRank)
    }
    predictionByUser.set(pred.user.id, teamMap)
  }

  // Users ordered by ranking
  const users = rankingEntries

  // 順位表示ゲート
  const showRankings = canShowRankings(selectedSeason ?? null, standings)
  const visibility = getVisibilityStatus(selectedSeason ?? null, standings)

  // 確定シーズンを見ているならアーカイブ・セクション、進行中ならランキング・セクションの一員。
  // 同じ画面が2つのセクションに属するため、見出しとサブナビを選択シーズンで切り替える。
  const isArchiveView = selectedSeason?.isLocked ?? true
  const remainingMatchdays = selectedSeason
    ? getRemainingMatchdays(standings, selectedSeason.leagueCode)
    : 0
  const currentMatchday = getCurrentMatchday(standings)

  // 色と並びの既定はシーズンの進み具合で決まる。クエリがあればそれが勝つ。
  const fallbackColor = defaultMatrixColor({
    isLocked: selectedSeason?.isLocked ?? false,
    resultsRevealed: selectedSeason?.resultsRevealed ?? false,
    remainingMatchdays,
    hasStandings: standings.length > 0,
    endgameRemaining: getEndgameRemaining(selectedSeason?.leagueCode ?? ""),
  })
  const matrixColor = parseMatrixColor(colorParam, fallbackColor)
  const matrixOrder = parseMatrixOrder(orderParam, defaultMatrixOrder(fallbackColor))

  // 表の行。preds は Map だとクライアントコンポーネントに渡せないので Record に落とす。
  // 並べ替え・塗り分けはクライアント側（PredictionMatrix）で行う。
  const matrixRows = buildMatrixRows(
    standings.map((st) => ({ teamId: st.teamId, actualRank: st.actualRank })),
    users.map((u) => u.userId),
    predictionByUser
  ).map((row) => ({
    teamId: row.teamId,
    actualRank: row.actualRank,
    avg: row.avg,
    spread: row.spread,
    preds: Object.fromEntries(row.preds),
  }))

  const matrixTeams = Object.fromEntries(
    standings.map((st) => [
      st.teamId,
      {
        name: st.team.name,
        shortName: st.team.shortName,
        crestUrl: st.team.crestUrl,
        points: st.points,
      },
    ])
  )

  return (
    <AppShell
      title={isArchiveView ? "アーカイブ" : "現在のランキング"}
      section={isArchiveView ? "archive" : "ranking"}
    >
      <div className={pageClass("wide", "space-y-8")}>
        {/* セクション名は h1、セクション内のビュー名はタブが持つ（管理画面と同じ構成） */}
        <div className="space-y-4">
        {/* セクション内のビュー切替（第2階層）。
            タブを押した指の下でボタンが動かないよう、見出しより上の固定位置に置く。
            見出しの行数がタブによって変わると、その分だけタブが上下にズレてしまう。 */}
          <SectionNav
            items={isArchiveView ? archiveNav(selectedSeason?.id) : rankingNav(selectedSeason?.id)}
          />

          {/* 見出しは「順位表」タブと完全に同一にする（高さが違うとタブが上下にズレる） */}
          <div>
            <h1 className="text-2xl font-bold text-[#f1f5f9]">
              {isArchiveView ? "アーカイブ" : "現在のランキング"}
            </h1>
            <p className="text-[#94a3b8] text-xs mt-0.5">
              {isArchiveView ? "確定したシーズンの最終結果" : "みんなの予想を並べて比べる"}
            </p>
            {selectedSeason && (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[#94a3b8] text-sm">{selectedSeason.name}</p>
                {selectedSeason.isLocked && (
                  <span className="text-xs border border-[#a78bfa]/30 text-[#a78bfa] bg-[#a78bfa]/10 px-2 py-0.5 rounded-full">確定</span>
                )}
              </div>
            )}
          </div>

          {/* Season selector（第3階層: 表示するデータの範囲）。サブナビと見分けるためピル型に揃える。
              1つしか無いときに出さないのは「順位表」側と揃えるため（片方だけ出ると位置がズレる）。 */}
          {seasons.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {seasons.map((s) => (
                <Link
                  key={s.id}
                  href={`/results?seasonId=${s.id}`}
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
        </div>

        {!selectedSeason ? (
          <div className="bg-[#1a1f2e] rounded-2xl p-8 border border-white/10 text-center">
            <p className="text-4xl mb-4">⚽</p>
            <h2 className="text-lg font-semibold text-[#f1f5f9] mb-2">
              シーズンデータがありません
            </h2>
            <p className="text-[#94a3b8] text-sm">
              有効なシーズンが見つかりませんでした。
            </p>
          </div>
        ) : !showRankings ? (
          <div className="bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-2xl p-8 text-center space-y-3">
            <p className="text-5xl">🤫</p>
            <p className="text-[#a78bfa] font-bold text-lg">
              {visibility === "pre-deadline" ? "予想受付中" : `終盤モード（残り${getEndgameRemaining(selectedSeason?.leagueCode ?? "")}節以下）`}
            </p>
            <p className="text-[#94a3b8] text-sm max-w-md mx-auto">
              {visibility === "pre-deadline"
                ? "予想受付中です。締切を過ぎると結果がここに表示されます。"
                : "ネタバレ防止のため、チーム別予想比較は非公開です。最終節終了後、管理者が結果を開示すると一斉公開されます。"}
            </p>
          </div>
        ) : (
          <>
            {/* チーム別予想比較表。並び・色の切替はクライアント側で完結させる
                （クエリ付きリンクだった頃は、押すたびに画面全体が再読み込みされていた） */}
            {standings.length > 0 && (
              <PredictionMatrix
                /* シーズンを変えたら並び・色の既定を取り直す。key が無いと
                   ソフト遷移で同じコンポーネントが再利用され、initial* を読み直さない */
                key={selectedSeason.id}
                rows={matrixRows}
                users={users.map((u) => ({
                  userId: u.userId,
                  displayName: u.displayName,
                  email: u.email,
                }))}
                teams={matrixTeams}
                initialOrder={matrixOrder}
                initialColor={matrixColor}
                isArchiveView={isArchiveView}
                currentMatchday={currentMatchday}
              />
            )}

            {standings.length === 0 && (
              <div className="bg-[#1a1f2e] rounded-2xl p-8 border border-white/10 text-center">
                <p className="text-[#94a3b8] text-sm">
                  このシーズンの順位データがまだ登録されていません。
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
