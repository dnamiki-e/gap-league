import { Season } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { fetchTeams, fetchStandings, SeasonUnavailableError } from "@/lib/football-data"
import { calculateScore } from "@/lib/scoring"
import { getScoringConfig } from "@/lib/site-config"

export interface SyncSummary {
  seasonId: string
  teamsUpserted: number
  standingsUpserted: number
  snapshotsSaved: number
  scoresRecalculated: number
  warnings: string[]
  errors: string[]
}

export async function syncSeasonData(season: Season): Promise<SyncSummary> {
  const scoring = await getScoringConfig()
  const seasonId = season.id

  const summary: SyncSummary = {
    seasonId,
    teamsUpserted: 0,
    standingsUpserted: 0,
    snapshotsSaved: 0,
    scoresRecalculated: 0,
    warnings: [],
    errors: [],
  }

  // 1. Sync teams
  try {
    const data = await fetchTeams(season.leagueCode, season.seasonYear)
    const apiTeams = data.teams ?? []

    for (const apiTeam of apiTeams) {
      const team = await prisma.team.upsert({
        where: { apiTeamId: apiTeam.id },
        update: {
          name: apiTeam.name,
          shortName: apiTeam.shortName,
          tla: apiTeam.tla,
          crestUrl: apiTeam.crest,
        },
        create: {
          apiTeamId: apiTeam.id,
          name: apiTeam.name,
          shortName: apiTeam.shortName,
          tla: apiTeam.tla,
          crestUrl: apiTeam.crest,
          leagueCode: season.leagueCode,
        },
      })

      await prisma.seasonTeam.upsert({
        where: { seasonId_teamId: { seasonId: season.id, teamId: team.id } },
        update: {},
        create: { seasonId: season.id, teamId: team.id },
      })

      summary.teamsUpserted++
    }
  } catch (err) {
    if (err instanceof SeasonUnavailableError) {
      summary.warnings.push(String(err))
    } else {
      summary.errors.push(`Teams sync failed: ${String(err)}`)
    }
  }

  // 2. Sync standings
  try {
    const data = await fetchStandings(season.leagueCode, season.seasonYear)
    const standingsData = data.standings?.[0]?.table ?? []

    for (const entry of standingsData) {
      const team = await prisma.team.findUnique({
        where: { apiTeamId: entry.team.id },
      })
      if (!team) continue

      await prisma.standing.upsert({
        where: { seasonId_teamId: { seasonId: season.id, teamId: team.id } },
        update: {
          actualRank: entry.position,
          played: entry.playedGames,
          won: entry.won,
          drawn: entry.draw,
          lost: entry.lost,
          points: entry.points,
          goalsFor: entry.goalsFor,
          goalsAgainst: entry.goalsAgainst,
        },
        create: {
          seasonId: season.id,
          teamId: team.id,
          actualRank: entry.position,
          played: entry.playedGames,
          won: entry.won,
          drawn: entry.draw,
          lost: entry.lost,
          points: entry.points,
          goalsFor: entry.goalsFor,
          goalsAgainst: entry.goalsAgainst,
        },
      })

      summary.standingsUpserted++
    }
  } catch (err) {
    if (err instanceof SeasonUnavailableError) {
      // Teams sync already added the warning; skip duplicate
    } else {
      summary.errors.push(`Standings sync failed: ${String(err)}`)
    }
  }

  // 3. Save standing snapshot
  try {
    const latestStandings = await prisma.standing.findMany({
      where: { seasonId },
    })

    // matchday = max played across all teams (PL方式: 各チームの試合数が節数を表す)
    const matchday = latestStandings.reduce((max, s) => Math.max(max, s.played), 0)

    if (matchday > 0) {
      for (const standing of latestStandings) {
        await prisma.standingSnapshot.upsert({
          where: {
            seasonId_teamId_matchday: {
              seasonId,
              teamId: standing.teamId,
              matchday,
            },
          },
          update: {
            actualRank: standing.actualRank,
            played: standing.played,
            points: standing.points,
          },
          create: {
            seasonId,
            teamId: standing.teamId,
            matchday,
            actualRank: standing.actualRank,
            played: standing.played,
            points: standing.points,
          },
        })
      }
      summary.snapshotsSaved = matchday
    }
  } catch (err) {
    summary.errors.push(`Snapshot save failed: ${String(err)}`)
  }

  // 4. Recalculate all scores
  try {
    const standings = await prisma.standing.findMany({ where: { seasonId } })
    const standingMap = new Map(standings.map((s) => [s.teamId, s.actualRank]))

    const predictions = await prisma.prediction.findMany({
      where: { seasonId },
      include: { details: true },
    })

    for (const pred of predictions) {
      const scoreDetails = pred.details
        .map((d) => {
          const actualRank = standingMap.get(d.teamId)
          if (actualRank === undefined) return null
          return { predictedRank: d.predictedRank, actualRank }
        })
        .filter((d): d is { predictedRank: number; actualRank: number } => d !== null)

      if (scoreDetails.length === 0) continue

      const totalPoints = calculateScore(scoreDetails, scoring)

      await prisma.score.upsert({
        where: { userId_seasonId: { userId: pred.userId, seasonId } },
        update: { totalPoints },
        create: { userId: pred.userId, seasonId, totalPoints },
      })

      summary.scoresRecalculated++
    }
  } catch (err) {
    summary.errors.push(`Score recalculation failed: ${String(err)}`)
  }

  return summary
}
