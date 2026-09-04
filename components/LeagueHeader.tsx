import { leagueName } from "@/lib/leagues"

/**
 * リーグ・セクションの見出し。
 * ビューが得点ランキング1つだけになったのでサブナビは持たない
 * （日程・順位表・移籍・ニュースは別サイトへのリンクで済ませる）。
 *
 * 見出しに出すリーグ名は選択中のシーズンから取る。固定にすると、
 * 別のリーグを開いているのにプレミアと表示される。
 */
export function LeagueHeader({ leagueCode }: { leagueCode?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#f1f5f9]">リーグ</h1>
      <p className="text-[#94a3b8] text-xs mt-0.5">
        {leagueCode ? `${leagueName(leagueCode)}の得点ランキング` : "得点ランキング"}
      </p>
    </div>
  )
}
