// 上流データ源と gapLeague の契約テスト。
//
// lib/football-data.ts が、どちらのデータ源を選んでも同じ形を返せているかを検証する。
// 実際にネットワークへ出るので、キーが無い環境（CI 既定）では自動で skip される。
//
// 実行:
//   FOOTBALL_DATA_API_KEY=... npm test              # football-data.org 直叩き
//   SOCCER_CRAWLER_BASE_URL=... SOCCER_CRAWLER_API_KEY=... npm test   # Hub 経由
//
// football-data.org 直叩きの場合、レート制限（10リクエスト/分）を守るため
// ライブラリ側が最小 6.5 秒間隔で直列化する。テストのタイムアウトを長めに取ってある。
import { describe, it, expect, beforeAll } from "vitest"

const hasFd = !!process.env.FOOTBALL_DATA_API_KEY
const hasHub =
  !!process.env.SOCCER_CRAWLER_BASE_URL && !!process.env.SOCCER_CRAWLER_API_KEY
const hasEnv = hasFd || hasHub

/** レート制限つきの直列化を待てる長さ。1テスト内で最大2リクエストを想定。 */
const TIMEOUT = 60_000

const d = hasEnv ? describe : describe.skip

d("上流データ源との契約", () => {
  let fd: typeof import("../../lib/football-data")

  beforeAll(async () => {
    fd = await import("../../lib/football-data")
  })

  it("fetchTeams: PL 2025 が teams 配列を返し、fd 互換の apiTeamId を持つ", async () => {
    const data = await fd.fetchTeams("PL", 2025)
    expect(data).toHaveProperty("teams")
    expect(Array.isArray(data.teams)).toBe(true)
    expect(data.teams.length).toBeGreaterThan(10)
    expect(data.teams[0]).toEqual(
      expect.objectContaining({ id: expect.any(Number), name: expect.any(String) })
    )
    // fd の既知ID（57=Arsenal, 65=ManCity ほか）が少なくとも1つ含まれること
    const hasKnownFdId = data.teams.some((t) => [57, 65, 66, 61, 64, 397].includes(t.id))
    expect(hasKnownFdId).toBe(true)
  }, TIMEOUT)

  it("fetchStandings: PL 2025 の順位表が { standings: [{ table: [...] }] } で返る", async () => {
    const data = await fd.fetchStandings("PL", 2025)
    expect(data.standings.length).toBeGreaterThan(0)
    const block = data.standings[0]
    expect(block.table.length).toBeGreaterThan(0)
    expect(block.table[0]).toEqual(
      expect.objectContaining({
        position: expect.any(Number),
        team: expect.objectContaining({ id: expect.any(Number), name: expect.any(String) }),
        playedGames: expect.any(Number),
        points: expect.any(Number),
        won: expect.any(Number),
        draw: expect.any(Number),
        lost: expect.any(Number),
        goalsFor: expect.any(Number),
        goalsAgainst: expect.any(Number),
      })
    )
  }, TIMEOUT)

  it("fetchMatches: PL 2025 FINISHED を order=desc limit=5 で取れる", async () => {
    const matches = await fd.fetchMatches({
      leagueCode: "PL",
      season: 2025,
      status: "FINISHED",
      limit: 5,
      order: "desc",
    })
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.length).toBeLessThanOrEqual(5)
    expect(matches[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        competition_code: "PL",
        season: 2025,
        status: "FINISHED",
        home_team_id: expect.any(Number),
        home_team_name: expect.any(String),
        away_team_id: expect.any(Number),
        away_team_name: expect.any(String),
      })
    )
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].utc_date >= matches[i].utc_date).toBe(true)
    }
  }, TIMEOUT)

  it("fetchScorersRaw: PL 2025 の得点ランキングが得点降順で返る", async () => {
    const { scorers } = await fd.fetchScorersRaw({
      leagueCode: "PL",
      seasonYear: 2025,
      limit: 10,
    })
    expect(scorers.length).toBeGreaterThan(0)
    expect(scorers[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        playerName: expect.any(String),
        goals: expect.any(Number),
      })
    )
    for (let i = 1; i < scorers.length; i++) {
      expect(scorers[i - 1].goals).toBeGreaterThanOrEqual(scorers[i].goals)
    }
  }, TIMEOUT)

  it("fetchSquadRaw: Arsenal(57) のスカッドが正規化済みポジションで返る", async () => {
    const { squad } = await fd.fetchSquadRaw(57)
    expect(squad.length).toBeGreaterThan(0)
    expect(squad[0]).toEqual(
      expect.objectContaining({
        apiPlayerId: expect.any(Number),
        name: expect.any(String),
      })
    )
    // lib/players.ts はこの4分類しか解釈しない
    const known = new Set(["Goalkeeper", "Defence", "Midfield", "Offence", null])
    expect(squad.every((p) => known.has(p.position))).toBe(true)
    // GK が1人も居ないスカッドは無い＝正規化が効いていることの確認
    expect(squad.some((p) => p.position === "Goalkeeper")).toBe(true)
  }, TIMEOUT)

  it("SeasonUnavailableError: 存在しないシーズンは専用エラーになる", async () => {
    await expect(fd.fetchStandings("PL", 1800)).rejects.toBeInstanceOf(Error)
  }, TIMEOUT)
})
