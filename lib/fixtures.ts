/**
 * 日程画面（今日・明日・次節）の判定ロジック。副作用と DB アクセスを持たない純粋関数だけを置く。
 *
 * 日付の区切りは日本時間（JST）。プレミアの土曜19:00（UTC）は日本の日曜04:00になるので、
 * 「今日の試合」を UTC や端末のタイムゾーンで切ると、見る人によって答えが変わってしまう。
 * サーバ側の描画でも結果がぶれないよう、Intl ではなく固定オフセットで計算する。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]

/** 開催されない試合。「次節」の開始時刻や「今日の試合」の数え間違いを避けるため、節の判定からは外す */
const NOT_PLAYED = new Set(["POSTPONED", "CANCELLED", "SUSPENDED", "AWARDED"])

const STAGE_LABELS: Record<string, string> = {
  LEAGUE_STAGE: "リーグフェーズ",
  PLAYOFFS: "プレーオフ",
  LAST_16: "ラウンド16",
  QUARTER_FINALS: "準々決勝",
  SEMI_FINALS: "準決勝",
  FINAL: "決勝",
}

export interface FixtureLike {
  stage: string
  matchday: number | null
  status: string
  utcDate: Date
}

/** JST の日付キー（YYYY-MM-DD） */
export function jstDayKey(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 基準日から n 日後の JST 日付キー */
export function addDaysKey(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
}

/** 「10/11（日）」 */
export function formatDayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00Z`)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAYS[d.getUTCDay()]}）`
}

/** JST の「HH:mm」 */
export function formatKickoff(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(11, 16)
}

export function isPlayed(m: Pick<FixtureLike, "status">): boolean {
  return !NOT_PLAYED.has(m.status)
}

/** 節（ラウンド）の識別子。リーグ戦は節番号、節番号を持たない決勝トーナメント等はステージ名 */
export function roundKey(m: Pick<FixtureLike, "stage" | "matchday">): string {
  return m.matchday != null ? `md:${m.matchday}` : `stage:${m.stage}`
}

export function roundLabel(m: Pick<FixtureLike, "stage" | "matchday">): string {
  if (m.matchday != null) return `第${m.matchday}節`
  return STAGE_LABELS[m.stage] ?? m.stage
}

export interface Round<T extends FixtureLike> {
  key: string
  label: string
  matches: T[]
}

/** 指定日（JST）に行われる試合を、キックオフ順で返す。延期の試合は日程が確定していないので出さない */
export function matchesOnDay<T extends FixtureLike>(matches: T[], dayKey: string): T[] {
  return matches
    .filter((m) => isPlayed(m) && jstDayKey(m.utcDate) === dayKey)
    .sort((a, b) => a.utcDate.getTime() - b.utcDate.getTime())
}

/**
 * 次節 = まだ1試合も始まっていない節のうち、最初に始まるもの。
 *
 * 「今日の試合が始まった節」は次節に含めない（それは今節）。
 * 延期された試合は開始時刻の判定から外す。外さないと、延期になった古い節の試合が
 * 先頭に居座って、実際の次節を飛ばしてしまう。
 */
export function pickNextRound<T extends FixtureLike>(matches: T[], now: Date): Round<T> | null {
  const rounds = new Map<string, Round<T>>()
  for (const m of matches) {
    if (!isPlayed(m)) continue
    const key = roundKey(m)
    const r = rounds.get(key) ?? { key, label: roundLabel(m), matches: [] }
    r.matches.push(m)
    rounds.set(key, r)
  }

  let best: { round: Round<T>; first: number } | null = null
  for (const round of rounds.values()) {
    round.matches.sort((a, b) => a.utcDate.getTime() - b.utcDate.getTime())
    const first = round.matches[0].utcDate.getTime()
    if (first <= now.getTime()) continue
    if (!best || first < best.first) best = { round, first }
  }
  return best?.round ?? null
}

/** 試合を JST の日付ごとにまとめる（日付の昇順、日内はキックオフ順） */
export function groupByDay<T extends FixtureLike>(matches: T[]): Array<{ dayKey: string; matches: T[] }> {
  const days = new Map<string, T[]>()
  for (const m of [...matches].sort((a, b) => a.utcDate.getTime() - b.utcDate.getTime())) {
    const key = jstDayKey(m.utcDate)
    days.set(key, [...(days.get(key) ?? []), m])
  }
  return [...days.entries()].map(([dayKey, ms]) => ({ dayKey, matches: ms }))
}

export type KickoffDisplay =
  | { kind: "time"; text: string }
  | { kind: "tbd" }

/**
 * 上流の SCHEDULED は「日付だけ決まっていて時刻が未確定」の意味。
 * 00:00 などの仮の時刻をそのまま出すと、本当の時刻だと誤解されるので出さない。
 */
export function kickoffDisplay(m: Pick<FixtureLike, "status" | "utcDate">): KickoffDisplay {
  if (m.status === "SCHEDULED") return { kind: "tbd" }
  return { kind: "time", text: formatKickoff(m.utcDate) }
}

export type MatchState = "upcoming" | "live" | "finished" | "started"

/**
 * 画面での見せ方の分類。
 *
 * "started" は「キックオフ時刻を過ぎているのに、取り込んだデータがまだ試合前のまま」。
 * 順位・日程は数時間おきの同期で更新されるため、試合直後はこの状態になる。
 * スコアを空欄にして「0-0」や「未開始」に見せると誤解されるので、別の状態として出す。
 */
export function matchState(m: Pick<FixtureLike, "status" | "utcDate">, now: Date): MatchState {
  if (m.status === "FINISHED") return "finished"
  if (m.status === "IN_PLAY" || m.status === "PAUSED") return "live"
  if (m.utcDate.getTime() <= now.getTime()) return "started"
  return "upcoming"
}
