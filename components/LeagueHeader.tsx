/**
 * リーグ・セクションの見出し。
 * ビューが得点ランキング1つだけになったのでサブナビは持たない
 * （日程・順位表・移籍・ニュースは football-info にある）。
 */
export function LeagueHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#f1f5f9]">リーグ</h1>
      <p className="text-[#94a3b8] text-xs mt-0.5">プレミアリーグの得点ランキング</p>
    </div>
  )
}
