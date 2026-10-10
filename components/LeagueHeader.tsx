import { leagueName } from "@/lib/leagues"

/**
 * リーグ・セクションの見出し。
 *
 * 兄弟ビュー（順位表・得点 / 日程）で同一の見出しブロックを使う。
 * ビューごとに説明文を変えると、タブを押した瞬間に見出しの行数が変わって
 * タブの下の部品が動くため、ここにはビュー固有の文言を置かない。
 *
 * 見出しに出すリーグ名は選択中のシーズンから取る。固定にすると、
 * 別のリーグを開いているのにプレミアと表示される。
 */
export function LeagueHeader({ leagueCode }: { leagueCode?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#f1f5f9]">リーグ</h1>
      <p className="text-[#94a3b8] text-xs mt-0.5">
        {leagueCode ? leagueName(leagueCode) : "リーグの実データ"}
      </p>
    </div>
  )
}
