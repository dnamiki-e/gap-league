import type { ScorerBoard as Board } from "@/lib/scorer-total"

/**
 * 得点予想ランキング（誰が誰を指名し、その選手が何点取っているか）。
 * ルールは「指名した3人の合計得点が多いほど上位」。
 * 順位予想とは別のランキングで、スコアは合算しない。
 * 順位表と違い締切前でも表示する — 実得点は現実のデータで、指名も公開する運用。
 */
export default function ScorerBoard({ board, myUserId }: { board: Board; myUserId?: string }) {
  return (
    <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 p-6 space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-[#f1f5f9]">得点予想ランキング</h2>
        <span className="text-xs text-[#94a3b8]">指名した3人の合計得点が多いほど上位</span>
      </div>

      {board.leaders.length > 0 && (
        <div className="bg-[var(--gold-bg)] border border-[var(--gold-border)] rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-2xl">⚽</span>
          <div className="min-w-0">
            <p className="text-xs text-[var(--gold)] font-semibold uppercase tracking-wider">
              現在の得点王
            </p>
            <p className="text-[var(--foreground)] font-bold">
              {board.leaders.map((l) => `${l.name}（${l.teamName}）`).join(" / ")}
              <span className="ml-2 text-[var(--gold)]">{board.leaders[0].goals}点</span>
            </p>
          </div>
        </div>
      )}

      {/* 行が詰まる幅では横スクロールさせる（ui-layout-rules R6） */}
      <div className="overflow-x-auto">
        <table className="min-w-[440px] w-full text-sm border-collapse">
          <thead>
            <tr className="text-[#94a3b8] border-b border-white/10">
              <th className="pb-2 pr-3 text-right w-8 whitespace-nowrap">#</th>
              <th className="pb-2 px-3 text-left min-w-[110px]">ユーザー</th>
              <th className="pb-2 px-3 text-left min-w-[150px]">指名選手</th>
              <th className="pb-2 pl-3 text-right whitespace-nowrap">得点</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row, rank) => {
              const isMe = row.userId === myUserId
              // 未入力の人も行として出す（指名が空だと map が1行も返さないため別扱い）
              if (!row.hasPicks) {
                return (
                  <tr
                    key={row.userId}
                    className={`border-b border-white/5 ${isMe ? "bg-[#38bdf8]/5" : ""}`}
                  >
                    <td className="py-2.5 pr-3 text-right tabular-nums text-[#94a3b8]/40">-</td>
                    <td className="py-2.5 px-3 text-[#94a3b8]">
                      <span className="block truncate">{row.displayName ?? row.email ?? "?"}</span>
                    </td>
                    <td colSpan={2} className="py-2.5 px-3 text-xs text-[#94a3b8]/70">
                      未入力
                    </td>
                  </tr>
                )
              }
              return row.picks.map((pick, i) => {
                return (
                  <tr
                    key={`${row.userId}-${i}`}
                    className={`border-b border-white/5 ${isMe ? "bg-[#38bdf8]/5" : ""}`}
                  >
                    {i === 0 && (
                      <>
                        <td
                          rowSpan={row.picks.length}
                          className="py-2.5 pr-3 align-top text-right tabular-nums text-[#94a3b8]"
                        >
                          {rank + 1}
                        </td>
                        <td
                          rowSpan={row.picks.length}
                          className="py-2.5 px-3 align-top text-[#f1f5f9] font-medium"
                        >
                          <span className="block truncate">{row.displayName ?? row.email ?? "?"}</span>
                          <span className="block text-xs text-[#38bdf8] tabular-nums mt-0.5 font-bold">
                            計 {row.totalGoals}点
                          </span>
                        </td>
                      </>
                    )}
                    <td className="py-2.5 px-3 text-[#f1f5f9]">
                      <span className="block truncate">{pick.playerName}</span>
                      {pick.teamName && (
                        <span className="block text-xs text-[#94a3b8] truncate">{pick.teamName}</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums text-[#f1f5f9] font-semibold">
                      {pick.goals}
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>

      {/* 「0」は本当に0点なのか未取得なのかが紛らわしいので明記する */}
      <p className="text-xs text-[#94a3b8]/80">
        シーズン開始からの得点数です。得点者一覧に出ていない選手は 0 点として扱います。
        <br />
        順位予想とは別のランキングです。順位予想のスコアには影響しません。
      </p>
    </div>
  )
}
