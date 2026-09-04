/**
 * 対応リーグの定義。リーグ固有の値はすべてここに集める。
 *
 * 以前は「総節数」「表示名」「管理画面の選択肢」が別々のファイルに散っていて、
 * リーグを1つ足すたびに直し漏れが起きていた。リーグを追加するときは
 * この配列に1行足すだけで済むようにしてある。
 *
 * チームの静的リスト（推しクラブ選択用）だけは lib/league-teams.ts に置く。
 * あちらは「毎年入れ替わる所属クラブ」を持つので性質が違う。
 */

export interface LeagueDef {
  /** football-data.org の競技会コード */
  code: string
  /** 画面に出す名前 */
  name: string
  /**
   * 総節数。全チームがこの数を消化したらシーズン完了とみなし、
   * 管理者が「結果を開示」を押せるようになる。
   */
  totalMatchdays: number
  /**
   * 残り何節から他人の予想・順位を隠すか（ネタバレ防止）。0 なら隠さない。
   * 節数の少ないリーグで大きい値にすると、シーズンのほとんどが隠れてしまう。
   */
  endgameRemaining: number
  /**
   * 順位予想で並べる枠数。null なら参加チーム全部を並べる。
   * CL のリーグフェーズは36チームのうち上位8位（決勝トーナメント直行圏）だけを予想する。
   */
  predictionSlots: number | null
  /** 得点予想（選手3人を指名して合計得点で競う）を行うか */
  hasScorerPrediction: boolean
}

export const LEAGUES: LeagueDef[] = [
  {
    code: "PL",
    name: "プレミアリーグ（イングランド）",
    totalMatchdays: 38,
    endgameRemaining: 5,
    predictionSlots: null,
    hasScorerPrediction: true,
  },
  {
    code: "PD",
    name: "ラ・リーガ（スペイン）",
    totalMatchdays: 38,
    endgameRemaining: 5,
    predictionSlots: null,
    hasScorerPrediction: false,
  },
  {
    code: "SA",
    name: "セリエA（イタリア）",
    totalMatchdays: 38,
    endgameRemaining: 5,
    predictionSlots: null,
    hasScorerPrediction: false,
  },
  {
    code: "BL1",
    name: "ブンデスリーガ（ドイツ）",
    totalMatchdays: 34,
    endgameRemaining: 5,
    predictionSlots: null,
    hasScorerPrediction: false,
  },
  {
    code: "FL1",
    name: "リーグアン（フランス）",
    totalMatchdays: 34,
    endgameRemaining: 5,
    predictionSlots: null,
    hasScorerPrediction: false,
  },
  {
    code: "CL",
    name: "チャンピオンズリーグ（リーグフェーズ）",
    // 36チームによる単一順位表。各チーム8試合。
    totalMatchdays: 8,
    // 8節しかないので 5 にすると3節目から隠れてしまう。最終節だけ隠す。
    endgameRemaining: 1,
    // 上位8位が決勝トーナメント直行。そこだけを予想対象にする。
    predictionSlots: 8,
    hasScorerPrediction: false,
  },
]

const BY_CODE = new Map(LEAGUES.map((l) => [l.code, l]))

/** 未知のコードが来たときの既定（20チームリーグ相当） */
const FALLBACK: LeagueDef = {
  code: "",
  name: "",
  totalMatchdays: 38,
  endgameRemaining: 5,
  predictionSlots: null,
  hasScorerPrediction: false,
}

export function getLeague(code: string): LeagueDef {
  return BY_CODE.get(code) ?? { ...FALLBACK, code, name: code }
}

/** 表示名。未知のコードはコードそのものを返す。 */
export function leagueName(code: string): string {
  return BY_CODE.get(code)?.name ?? code
}

/** 得点予想を行うリーグか */
export function hasScorerPrediction(code: string): boolean {
  return getLeague(code).hasScorerPrediction
}

/**
 * 順位予想で並べる枠数。
 * リーグ定義に指定が無ければ、そのシーズンの参加チーム数をそのまま使う。
 */
export function predictionSlots(code: string, teamCount: number): number {
  const slots = getLeague(code).predictionSlots
  if (slots === null) return teamCount
  // 参加チームが枠数を下回るケース（同期前など）で枠が余らないようにする
  return Math.min(slots, teamCount)
}
