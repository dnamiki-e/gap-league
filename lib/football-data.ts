// リーグの実データ（チーム / 順位表 / 試合 / 得点ランキング / スカッド）を取る層。
//
// データ源は2つあり、環境変数で決まる。分岐はこのファイルの中だけに閉じてあり、
// 呼び出し側（season-sync / league-data / players / app/api/*）はどちらが選ばれても
// 同じ型を受け取る。
//
//   1. football-data.org 直叩き … 既定。FOOTBALL_DATA_API_KEY だけで動く
//   2. Hub API 経由            … SOCCER_CRAWLER_BASE_URL + SOCCER_CRAWLER_API_KEY が
//                                両方あるときだけ。複数アプリで fd のレート枠を
//                                共有したい運用向け
//
// レート制限:
//   football-data.org の無料プランは 10 リクエスト/分。直叩き経路では
//   このファイルの中で直列化して最小間隔を空ける（fdFetch）。加えて呼び出し側でも
//   キャッシュを被せること（lib/ttl-cache.ts / next の revalidate）。
//   Hub 経由の場合は Hub 側がレート枠を管理する。

const FD_BASE = "https://api.football-data.org/v4"
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY || ""

const HUB_BASE =
  process.env.SOCCER_CRAWLER_BASE_URL?.replace(/\/$/, "") || ""
const HUB_KEY = process.env.SOCCER_CRAWLER_API_KEY || ""

/** Hub の設定が揃っているときだけ Hub を使う。既定は football-data.org 直叩き。 */
export function isHubMode(): boolean {
  return Boolean(HUB_BASE && HUB_KEY)
}

/** 現在のデータ源（設定画面・起動時ログ・エラーメッセージ用） */
export function dataSourceName(): "hub" | "football-data.org" {
  return isHubMode() ? "hub" : "football-data.org"
}

export class SeasonUnavailableError extends Error {
  constructor(leagueCode: string, seasonYear: number) {
    super(`${leagueCode} ${seasonYear}シーズンのデータはまだ公開されていません`)
    this.name = "SeasonUnavailableError"
  }
}

/** データ源の設定そのものが無いときに投げる。運用者向けの文言にする。 */
export class DataSourceNotConfiguredError extends Error {
  constructor() {
    super(
      "データ取得先が未設定です。.env に FOOTBALL_DATA_API_KEY " +
        "（または SOCCER_CRAWLER_BASE_URL と SOCCER_CRAWLER_API_KEY の両方）を設定してください。"
    )
    this.name = "DataSourceNotConfiguredError"
  }
}

/** 上流が「そのシーズンは無い」と答えたことを内部で運ぶための印 */
const NOT_FOUND = "__UPSTREAM_404__"

function isNotFound(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith(NOT_FOUND)
}

// ───────── football-data.org 直叩き ─────────

/**
 * 無料プランの 10 リクエスト/分に収めるため、直列化して最小間隔を空ける。
 *
 * cron の同期は「有効シーズン数 × 2リクエスト（teams + standings）」を
 * 一気に投げる。5リーグ運用だと 10 リクエストになり、待ちを入れないと必ず 429 に当たる。
 * Promise を数珠つなぎにして、次のリクエストは前のリクエストから
 * FD_MIN_INTERVAL_MS 経過するまで走らせない。
 */
const FD_MIN_INTERVAL_MS = 6_500
let fdQueue: Promise<unknown> = Promise.resolve()
let fdLastAt = 0

function fdSchedule<T>(task: () => Promise<T>): Promise<T> {
  const run = fdQueue.then(async () => {
    const wait = FD_MIN_INTERVAL_MS - (Date.now() - fdLastAt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    try {
      return await task()
    } finally {
      fdLastAt = Date.now()
    }
  })
  // 失敗しても後続を止めない（キューは順番だけを担保する）
  fdQueue = run.catch(() => undefined)
  return run
}

async function fdFetch<T>(path: string): Promise<T> {
  if (!FD_KEY) throw new DataSourceNotConfiguredError()

  return fdSchedule(async () => {
    const url = `${FD_BASE}${path}`
    let res = await fetch(url, {
      headers: { "X-Auth-Token": FD_KEY, Accept: "application/json" },
      next: { revalidate: 60 },
    })

    // 429 は 1 回だけ待って再試行する。二度目も 429 なら諦めて呼び出し側へ返す
    // （無限に待つと画面が固まる）。
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? 0)
      const waitMs = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60) * 1000
      await new Promise((r) => setTimeout(r, waitMs))
      res = await fetch(url, {
        headers: { "X-Auth-Token": FD_KEY, Accept: "application/json" },
        cache: "no-store",
      })
    }

    if (res.status === 404) throw new Error(`${NOT_FOUND} ${url}`)
    if (res.status === 403) {
      // 無料プランは対象competition・過去シーズンが制限される。原因が分かる文言にする。
      throw new Error(
        `football-data.org が 403 を返しました（プランの対象外の可能性）: ${path}`
      )
    }
    if (!res.ok) throw new Error(`football-data.org error: HTTP ${res.status} ${path}`)
    return (await res.json()) as T
  })
}

// ───────── Hub API 経由 ─────────

/**
 * Hub API への GET。応答の `data` を返す。
 * レート枠の管理は Hub 側の責務なので、ここでは待ちを入れない。
 */
async function hubFetch<T>(path: string): Promise<T> {
  const url = `${HUB_BASE}${path}`
  const res = await fetch(url, {
    headers: { "X-Api-Key": HUB_KEY, Accept: "application/json" },
    next: { revalidate: 60 },
  })
  if (res.status === 404) throw new Error(`${NOT_FOUND} ${url}`)
  if (!res.ok) throw new Error(`Hub API error: HTTP ${res.status} ${url}`)
  const json = (await res.json()) as { ok: boolean; data: T; meta?: unknown }
  return json.data
}

// ───────── 共通の戻り値型 ─────────

export interface FdTeam {
  /** football-data.org のチームID。Prisma の Team.apiTeamId に入る */
  id: number
  name: string
  shortName: string | null
  tla: string | null
  crest: string | null
}

export interface FdStandingRow {
  position: number
  team: FdTeam
  playedGames: number
  won: number
  draw: number
  lost: number
  points: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  form: string | null
}

export interface MatchResult {
  id: number
  competition_code: string
  season: number
  matchday: number
  /**
   * LEAGUE_STAGE / PLAYOFFS / LAST_16 / QUARTER_FINALS / SEMI_FINALS / FINAL など。
   * リーグ戦は REGULAR_SEASON。締切の解決（キックオフ基準）と
   * ブラケット予想の対戦カード抽出に使う。
   */
  stage: string
  status: string
  utc_date: string
  home_team_id: number
  home_team_name: string
  away_team_id: number
  away_team_name: string
  score_home_ft: number | null
  score_away_ft: number | null
  score_home_ht: number | null
  score_away_ht: number | null
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null
}

export interface RawScorer {
  rank: number
  playerId: number | null
  playerName: string
  country: string | null
  teamId: number | null
  teamName: string
  teamShortName: string | null
  goals: number
  /** アシストは欠損が多い。null は「不明」であって 0 ではない */
  assists: number | null
  penalties: number | null
  matchesPlayed: number | null
}

export interface RawSquadPlayer {
  apiPlayerId: number
  name: string
  /** Goalkeeper / Defence / Midfield / Offence に正規化済み */
  position: string | null
}

// ───────── fetchTeams ─────────

interface HubTeam {
  id: number
  fd_id: number | null
  name: string
  short_name: string | null
  tla: string | null
  crest_url: string | null
}

export async function fetchTeams(
  leagueCode: string,
  seasonYear: number
): Promise<{ teams: FdTeam[] }> {
  const code = encodeURIComponent(leagueCode)
  try {
    if (isHubMode()) {
      const data = await hubFetch<HubTeam[]>(
        `/api/v1/competitions/${code}/teams?season=${seasonYear}`
      )
      return {
        teams: data.map((t) => ({
          // fd_id 優先、無ければ Hub 内部IDをフォールバック
          id: t.fd_id ?? t.id,
          name: t.name,
          shortName: t.short_name,
          tla: t.tla,
          crest: t.crest_url,
        })),
      }
    }

    const data = await fdFetch<{
      teams?: Array<{
        id: number
        name: string
        shortName?: string | null
        tla?: string | null
        crest?: string | null
      }>
    }>(`/competitions/${code}/teams?season=${seasonYear}`)

    return {
      teams: (data.teams ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        shortName: t.shortName ?? null,
        tla: t.tla ?? null,
        crest: t.crest ?? null,
      })),
    }
  } catch (e) {
    if (isNotFound(e)) throw new SeasonUnavailableError(leagueCode, seasonYear)
    throw e
  }
}

// ───────── fetchStandings ─────────

interface HubStandingRow {
  position: number
  team_id: number
  team_fd_id: number | null
  team_name: string
  team_short_name: string | null
  team_tla: string | null
  team_crest_url: string | null
  played: number | null
  won: number | null
  draw: number | null
  lost: number | null
  points: number | null
  goals_for: number | null
  goals_against: number | null
  goal_difference: number | null
  form: string | null
  stage: string
  type: string
  group_name: string | null
}

export async function fetchStandings(
  leagueCode: string,
  seasonYear: number
): Promise<{
  standings: Array<{
    stage: string
    type: string
    group: string | null
    table: FdStandingRow[]
  }>
}> {
  const code = encodeURIComponent(leagueCode)
  try {
    if (isHubMode()) {
      const data = await hubFetch<HubStandingRow[]>(
        `/api/v1/competitions/${code}/standings?season=${seasonYear}`
      )
      return {
        standings: [
          {
            stage: data[0]?.stage ?? "REGULAR_SEASON",
            type: data[0]?.type ?? "TOTAL",
            group: data[0]?.group_name ?? null,
            table: data.map((r) => ({
              position: r.position,
              team: {
                id: r.team_fd_id ?? r.team_id,
                name: r.team_name,
                shortName: r.team_short_name,
                tla: r.team_tla,
                crest: r.team_crest_url,
              },
              // Hub は null 許容だが Prisma スキーマは非 null 必須なので 0 で埋める
              playedGames: r.played ?? 0,
              won: r.won ?? 0,
              draw: r.draw ?? 0,
              lost: r.lost ?? 0,
              points: r.points ?? 0,
              goalsFor: r.goals_for ?? 0,
              goalsAgainst: r.goals_against ?? 0,
              goalDifference: r.goal_difference ?? 0,
              form: r.form,
            })),
          },
        ],
      }
    }

    const data = await fdFetch<{
      standings?: Array<{
        stage?: string
        type?: string
        group?: string | null
        table?: Array<{
          position: number
          team: {
            id: number
            name: string
            shortName?: string | null
            tla?: string | null
            crest?: string | null
          }
          playedGames?: number | null
          won?: number | null
          draw?: number | null
          lost?: number | null
          points?: number | null
          goalsFor?: number | null
          goalsAgainst?: number | null
          goalDifference?: number | null
          form?: string | null
        }>
      }>
    }>(`/competitions/${code}/standings?season=${seasonYear}`)

    // fd はカップ戦だとグループごとに複数ブロックを返す。リーグ戦は TOTAL 1 ブロック。
    const blocks = (data.standings ?? []).filter(
      (b) => (b.type ?? "TOTAL") === "TOTAL"
    )
    const source = blocks.length > 0 ? blocks : (data.standings ?? [])

    return {
      standings: source.map((b) => ({
        stage: b.stage ?? "REGULAR_SEASON",
        type: b.type ?? "TOTAL",
        group: b.group ?? null,
        table: (b.table ?? []).map((r) => ({
          position: r.position,
          team: {
            id: r.team.id,
            name: r.team.name,
            shortName: r.team.shortName ?? null,
            tla: r.team.tla ?? null,
            crest: r.team.crest ?? null,
          },
          playedGames: r.playedGames ?? 0,
          won: r.won ?? 0,
          draw: r.draw ?? 0,
          lost: r.lost ?? 0,
          points: r.points ?? 0,
          goalsFor: r.goalsFor ?? 0,
          goalsAgainst: r.goalsAgainst ?? 0,
          goalDifference: r.goalDifference ?? 0,
          form: r.form ?? null,
        })),
      })),
    }
  } catch (e) {
    if (isNotFound(e)) throw new SeasonUnavailableError(leagueCode, seasonYear)
    throw e
  }
}

// ───────── fetchMatches ─────────

interface HubMatch {
  id: number
  fd_id: number | null
  matchday: number | null
  stage: string | null
  group_name: string | null
  status: string
  utc_date: string
  home_team_id: number
  home_team_fd_id: number | null
  home_team_name: string
  away_team_id: number
  away_team_fd_id: number | null
  away_team_name: string
  score_home_ft: number | null
  score_away_ft: number | null
  score_home_ht: number | null
  score_away_ht: number | null
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null
}

export async function fetchMatches(params: {
  leagueCode: string
  season: number
  status?: string
  limit?: number
  order?: "asc" | "desc"
}): Promise<MatchResult[]> {
  const { leagueCode, season, status, limit, order = "desc" } = params
  const code = encodeURIComponent(leagueCode)

  try {
    if (isHubMode()) {
      const qs = new URLSearchParams({ season: String(season) })
      if (status) qs.set("status", status)
      if (limit) qs.set("limit", String(limit))
      qs.set("order", order)

      const data = await hubFetch<HubMatch[]>(
        `/api/v1/competitions/${code}/matches?${qs}`
      )
      return data.map((m) => ({
        id: m.fd_id ?? m.id,
        competition_code: leagueCode,
        season,
        matchday: m.matchday ?? 0,
        stage: m.stage ?? "REGULAR_SEASON",
        status: m.status,
        utc_date: m.utc_date,
        home_team_id: m.home_team_fd_id ?? m.home_team_id,
        home_team_name: m.home_team_name,
        away_team_id: m.away_team_fd_id ?? m.away_team_id,
        away_team_name: m.away_team_name,
        score_home_ft: m.score_home_ft,
        score_away_ft: m.score_away_ft,
        score_home_ht: m.score_home_ht,
        score_away_ht: m.score_away_ht,
        winner: m.winner,
      }))
    }

    // fd は limit / order を持たないので、絞り込みは取得後にこちらで行う。
    const qs = new URLSearchParams({ season: String(season) })
    if (status) qs.set("status", status)

    const data = await fdFetch<{
      matches?: Array<{
        id: number
        utcDate: string
        status: string
        matchday?: number | null
        stage?: string | null
        homeTeam: { id: number; name: string }
        awayTeam: { id: number; name: string }
        score?: {
          winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null
          fullTime?: { home: number | null; away: number | null }
          halfTime?: { home: number | null; away: number | null }
        }
      }>
    }>(`/competitions/${code}/matches?${qs}`)

    const mapped: MatchResult[] = (data.matches ?? []).map((m) => ({
      id: m.id,
      competition_code: leagueCode,
      season,
      matchday: m.matchday ?? 0,
      stage: m.stage ?? "REGULAR_SEASON",
      status: m.status,
      utc_date: m.utcDate,
      home_team_id: m.homeTeam.id,
      home_team_name: m.homeTeam.name,
      away_team_id: m.awayTeam.id,
      away_team_name: m.awayTeam.name,
      score_home_ft: m.score?.fullTime?.home ?? null,
      score_away_ft: m.score?.fullTime?.away ?? null,
      score_home_ht: m.score?.halfTime?.home ?? null,
      score_away_ht: m.score?.halfTime?.away ?? null,
      winner: m.score?.winner ?? null,
    }))

    mapped.sort((a, b) =>
      order === "asc"
        ? a.utc_date.localeCompare(b.utc_date)
        : b.utc_date.localeCompare(a.utc_date)
    )
    return limit ? mapped.slice(0, limit) : mapped
  } catch (e) {
    if (isNotFound(e)) throw new SeasonUnavailableError(leagueCode, season)
    throw e
  }
}

// ───────── fetchScorersRaw ─────────

interface HubScorersResponse {
  league?: { code?: string; name?: string }
  season?: { year?: number; current_matchday?: number }
  scorers?: Array<{
    rank?: number
    player?: { id?: number; name?: string; country?: string }
    team?: { id?: number; name?: string; short_name?: string }
    goals?: number
    assists?: number | null
    penalties?: number | null
    matches_played?: number | null
  }>
  total?: number
}

/**
 * 得点ランキング。キャッシュは呼び出し側（lib/league-data.ts）で被せる。
 * 上流は 1 点以上の全得点者を返すので、一覧に無い選手は 0 点と確定できる。
 */
export async function fetchScorersRaw(params: {
  leagueCode: string
  seasonYear: number
  limit?: number
}): Promise<{ scorers: RawScorer[]; currentMatchday: number | null }> {
  const { leagueCode, seasonYear, limit = 50 } = params
  const code = encodeURIComponent(leagueCode)

  if (isHubMode()) {
    const qs = new URLSearchParams({
      league: leagueCode,
      season: String(seasonYear),
      limit: String(limit),
    })
    const data = await hubFetch<HubScorersResponse>(`/api/scorers?${qs}`)
    return {
      scorers: (data.scorers ?? []).map((s, i) => ({
        rank: s.rank ?? i + 1,
        playerId: s.player?.id ?? null,
        playerName: s.player?.name ?? "不明",
        country: s.player?.country ?? null,
        teamId: s.team?.id ?? null,
        teamName: s.team?.name ?? "",
        teamShortName: s.team?.short_name ?? null,
        goals: s.goals ?? 0,
        assists: s.assists ?? null,
        penalties: s.penalties ?? null,
        matchesPlayed: s.matches_played ?? null,
      })),
      currentMatchday: data.season?.current_matchday ?? null,
    }
  }

  const data = await fdFetch<{
    season?: { currentMatchday?: number | null }
    scorers?: Array<{
      player?: { id?: number; name?: string; nationality?: string | null }
      team?: { id?: number; name?: string; shortName?: string | null }
      playedMatches?: number | null
      goals?: number | null
      assists?: number | null
      penalties?: number | null
    }>
  }>(`/competitions/${code}/scorers?season=${seasonYear}&limit=${limit}`)

  return {
    // fd は得点順に並べて返すが rank フィールドは持たないので、並び順から採番する。
    scorers: (data.scorers ?? []).map((s, i) => ({
      rank: i + 1,
      playerId: s.player?.id ?? null,
      playerName: s.player?.name ?? "不明",
      country: s.player?.nationality ?? null,
      teamId: s.team?.id ?? null,
      teamName: s.team?.name ?? "",
      teamShortName: s.team?.shortName ?? null,
      goals: s.goals ?? 0,
      assists: s.assists ?? null,
      penalties: s.penalties ?? null,
      matchesPlayed: s.playedMatches ?? null,
    })),
    currentMatchday: data.season?.currentMatchday ?? null,
  }
}

// ───────── fetchSquadRaw ─────────

interface HubSquadResponse {
  team?: { id?: number; name?: string }
  squad?: Array<{ id?: number; name?: string; position?: string | null }>
}

/**
 * fd の詳細ポジション（Centre-Forward など）を 4 分類へ寄せる。
 *
 * 上流は時期によって粗い分類（Offence）と細かい分類（Centre-Forward）の
 * どちらも返す。lib/players.ts は 4 分類しか知らないので、ここで揃える。
 */
export function normalizePosition(raw: string | null | undefined): string | null {
  if (!raw) return null
  const p = raw.trim()
  if (/goalkeeper|keeper/i.test(p)) return "Goalkeeper"
  if (/back|defence|defender/i.test(p)) return "Defence"
  if (/midfield/i.test(p)) return "Midfield"
  if (/forward|striker|winger|offence|attack/i.test(p)) return "Offence"
  return p
}

/**
 * 指定クラブのスカッド。キャッシュと DB 反映は呼び出し側（lib/players.ts）の責務。
 */
export async function fetchSquadRaw(
  apiTeamId: number
): Promise<{ squad: RawSquadPlayer[] }> {
  if (isHubMode()) {
    const data = await hubFetch<HubSquadResponse>(`/api/squad?team=${apiTeamId}`)
    return {
      squad: (data.squad ?? [])
        .filter((p): p is { id: number; name: string; position?: string | null } =>
          Boolean(p.id && p.name)
        )
        .map((p) => ({
          apiPlayerId: p.id,
          name: p.name,
          position: normalizePosition(p.position),
        })),
    }
  }

  const data = await fdFetch<{
    squad?: Array<{ id?: number; name?: string; position?: string | null }>
  }>(`/teams/${apiTeamId}`)

  return {
    squad: (data.squad ?? [])
      .filter((p): p is { id: number; name: string; position?: string | null } =>
        Boolean(p.id && p.name)
      )
      .map((p) => ({
        apiPlayerId: p.id,
        name: p.name,
        position: normalizePosition(p.position),
      })),
  }
}
