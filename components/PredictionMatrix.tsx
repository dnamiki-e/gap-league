"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import TeamCrest from "@/components/TeamCrest"
import {
  sortMatrixRows,
  devStep,
  MATRIX_ORDERS,
  MATRIX_COLORS,
  MATRIX_ORDER_LABELS,
  MATRIX_COLOR_LABELS,
  type MatrixOrder,
  type MatrixColor,
} from "@/lib/prediction-matrix"

/** 行1件。preds は Map ではなく Record（サーバコンポーネントから渡せる形にする） */
export interface MatrixRowData {
  teamId: string
  actualRank: number
  avg: number | null
  spread: number
  /** userId → 予想順位。予想していない人は持たない */
  preds: Record<string, number>
}

export interface MatrixUser {
  userId: string
  displayName: string | null
  email: string | null
}

export interface MatrixTeamInfo {
  name: string
  shortName: string | null
  crestUrl: string | null
  points: number
}

function getDiffStyle(diff: number): string {
  if (diff === 0) return "bg-green-700/60 text-green-200"
  if (diff <= 3) return "bg-yellow-700/60 text-yellow-200"
  if (diff <= 7) return "bg-orange-700/60 text-orange-200"
  return "bg-red-700/60 text-red-200"
}

function getDiffLabel(diff: number): string {
  if (diff === 0) return "-2"
  return `+${diff}`
}

/**
 * 「みんなとのズレ」のセル。
 *
 * 塗りは薄めにして、文字色は text-[#f1f5f9] に任せる。globals.css の light 上書きが
 * text-[#f1f5f9] を暗色へ差し替えるので、濃い塗り＋白文字にすると light テーマで読めなくなる。
 * クラス名は Tailwind が走査できるようリテラルで持つ（動的な文字列結合では生成されない）。
 */
const DEV_STYLES: Record<number, string> = {
  [-4]: "bg-sky-500/60 text-[#f1f5f9]",
  [-3]: "bg-sky-500/45 text-[#f1f5f9]",
  [-2]: "bg-sky-500/30 text-[#f1f5f9]",
  [-1]: "bg-sky-500/15 text-[#f1f5f9]",
  0: "bg-white/5 text-[#94a3b8]",
  1: "bg-rose-500/15 text-[#f1f5f9]",
  2: "bg-rose-500/30 text-[#f1f5f9]",
  3: "bg-rose-500/45 text-[#f1f5f9]",
  4: "bg-rose-500/60 text-[#f1f5f9]",
}

/** 平均とのズレの表示。符号を出さないと「上位に見た」のか分からない */
function formatDev(predicted: number, avg: number | null): string | null {
  if (avg === null) return null
  const signed = predicted - avg
  if (Math.abs(signed) < 0.05) return "±0"
  return `${signed > 0 ? "+" : "−"}${Math.abs(signed).toFixed(1)}`
}

/**
 * 表の操作（第4階層）。ナビと見分けるためカードの中に置き、小さめの角丸ボタンにする。
 *
 * 狭い画面で「ラベル＋ボタン」を1行に流すと、最後の1個だけが次行に落ちて崩れて見える。
 * これを避けるためラベルを独立した行に上げるが、ボタン自体は中身の幅に留める。
 * 等幅グリッドにすると絞り込みボタンが主要ボタンのように見えて幅を食いすぎる。
 * 高さの 44px は下げない（タップ標的の下限）。
 */
function ChoiceGroup<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  labels: Record<T, string>
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="min-w-0 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2"
    >
      <span className="shrink-0 text-xs text-[#94a3b8]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onChange(o)}
            className={`inline-flex items-center justify-center text-center min-h-11 px-3 rounded-lg text-xs font-medium leading-tight transition-colors ${
              value === o
                ? "bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30"
                : "bg-white/5 text-[#94a3b8] hover:bg-white/10 border border-white/10"
            }`}
          >
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * チーム別予想比較表。
 *
 * 並び・色の切替はページ内の状態で行う（以前はクエリ付きリンクだったため、
 * ボタンを押すたびにサーバ往復＝画面全体の再読み込みになっていた）。
 * 表の元データは変わらないので、並べ替えと塗り分けはブラウザ側で完結する。
 */
export default function PredictionMatrix({
  rows,
  users,
  teams,
  initialOrder,
  initialColor,
  isArchiveView,
  currentMatchday,
}: {
  rows: MatrixRowData[]
  users: MatrixUser[]
  /** teamId → チーム情報 */
  teams: Record<string, MatrixTeamInfo>
  initialOrder: MatrixOrder
  initialColor: MatrixColor
  isArchiveView: boolean
  currentMatchday: number
}) {
  const [order, setOrder] = useState<MatrixOrder>(initialOrder)
  const [color, setColor] = useState<MatrixColor>(initialColor)

  const sortedRows = useMemo(() => sortMatrixRows(rows, order), [rows, order])
  const maxSpread = useMemo(
    () => rows.reduce((m, r) => (r.spread > m ? r.spread : m), 0),
    [rows]
  )

  return (
    <div className="bg-[#1a1f2e] rounded-2xl p-4 sm:p-6 border border-white/10 space-y-4">
      {/* 予想が1件も無いシーズンでは比べる相手がいないので、単なる最終順位として見せる */}
      <h2 className="text-lg font-bold text-[#f1f5f9]">
        {users.length > 0 ? "チーム別予想比較表" : "最終順位"}
      </h2>

      {users.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-x-6">
            <ChoiceGroup
              label="行の並び"
              options={MATRIX_ORDERS}
              labels={MATRIX_ORDER_LABELS}
              value={order}
              onChange={setOrder}
            />
            <ChoiceGroup
              label="セルの色"
              options={MATRIX_COLORS}
              labels={MATRIX_COLOR_LABELS}
              value={color}
              onChange={setColor}
            />
          </div>

          {/* 色の意味。行数が色によって変わるので、操作ボタンより下に置く
              （上に置くと、色を切り替えた瞬間にボタンが上下にズレる） */}
          <p className="text-xs text-[#94a3b8]/60">
            {color === "dev"
              ? "色: 青=みんなより上位に見た / 赤=下位に見た（濃いほど差が大きい）"
              : color === "actual"
                ? `色: 緑=完全一致(-2pt) 黄=差1-3 橙=差4-7 赤=差8+${isArchiveView ? "" : `（第${currentMatchday}節時点）`}`
                : "色なし。数字は予想順位のみ"}
          </p>
        </>
      )}

      {/* 実順位で並べていないときは、実順位の数字を控えめにして
          「いま何で並んでいるか」を取り違えないようにする */}
      <div className="overflow-x-auto">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="text-[#94a3b8] border-b border-white/10">
              <th className="pb-2 pr-2 text-right w-8 whitespace-nowrap">実際</th>
              <th className="pb-2 px-3 text-left min-w-[140px]">チーム</th>
              {users.map((u) => (
                <th key={u.userId} className="pb-2 px-2 text-center whitespace-nowrap max-w-[80px]">
                  <Link
                    href={`/ranking/${u.userId}`}
                    className="text-[#94a3b8] hover:text-[#38bdf8] transition-colors text-xs"
                  >
                    {(u.displayName ?? u.email ?? "?").split("@")[0].substring(0, 8)}
                  </Link>
                </th>
              ))}
              {users.length > 0 && (
                <>
                  <th className="pb-2 px-2 text-center whitespace-nowrap text-xs w-14">平均</th>
                  <th className="pb-2 px-2 text-center whitespace-nowrap text-xs w-20">割れ度</th>
                </>
              )}
              <th className="pb-2 px-2 text-center whitespace-nowrap text-xs w-14">実pt</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const team = teams[row.teamId]
              if (!team) return null
              return (
                <tr
                  key={row.teamId}
                  className="border-b border-white/5 hover:bg-white/3 transition-colors"
                >
                  {/* Actual rank */}
                  <td className="py-2 pr-2 text-right">
                    <span
                      className={`font-bold tabular-nums ${
                        order === "actual" ? "text-[#f1f5f9]" : "text-[#94a3b8]/60"
                      }`}
                    >
                      {row.actualRank}
                    </span>
                  </td>

                  {/* Team crest + name */}
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <TeamCrest
                        crestUrl={team.crestUrl}
                        teamName={team.name}
                        size={20}
                        className="flex-shrink-0"
                      />
                      <span className="text-[#f1f5f9] whitespace-nowrap text-xs">
                        {team.shortName ?? team.name}
                      </span>
                    </div>
                  </td>

                  {/* Each user's predicted rank */}
                  {users.map((u) => {
                    const predicted = row.preds[u.userId]
                    if (predicted === undefined) {
                      return (
                        <td key={u.userId} className="py-2 px-2 text-center">
                          <span className="text-[#94a3b8]/40 text-xs">-</span>
                        </td>
                      )
                    }
                    const diff = Math.abs(predicted - row.actualRank)
                    const style =
                      color === "dev"
                        ? DEV_STYLES[devStep(predicted, row.avg)]
                        : color === "actual"
                          ? getDiffStyle(diff)
                          : "bg-white/5 text-[#f1f5f9]"
                    const sub =
                      color === "dev"
                        ? formatDev(predicted, row.avg)
                        : color === "actual"
                          ? getDiffLabel(diff)
                          : null
                    return (
                      <td key={u.userId} className="py-2 px-2 text-center">
                        <span
                          className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums min-w-[36px] ${style}`}
                          title={`予想: ${predicted}位 / 実順位: ${row.actualRank}位 (差: ${diff})${
                            row.avg !== null ? ` / みんなの平均: ${row.avg.toFixed(1)}位` : ""
                          }`}
                        >
                          {predicted}
                          {sub && <span className="ml-0.5 text-[10px] opacity-80">({sub})</span>}
                        </span>
                      </td>
                    )
                  })}

                  {users.length > 0 && (
                    <>
                      {/* みんなの予想の平均 */}
                      <td className="py-2 px-2 text-center">
                        <span className="text-[#94a3b8] tabular-nums text-xs">
                          {row.avg !== null ? row.avg.toFixed(1) : "-"}
                        </span>
                      </td>
                      {/* 割れ度（最大 − 最小）。バーの長さでも示す */}
                      <td className="py-2 px-2">
                        <div className="flex items-center justify-center gap-1.5">
                          <span
                            className="h-1.5 rounded-full bg-[#38bdf8]/60 flex-shrink-0"
                            style={{
                              width: `${maxSpread > 0 ? Math.max(6, (row.spread / maxSpread) * 32) : 6}px`,
                            }}
                          />
                          <span className="text-[#94a3b8] tabular-nums text-xs w-4 text-right">
                            {row.spread}
                          </span>
                        </div>
                      </td>
                    </>
                  )}

                  {/* Actual points */}
                  <td className="py-2 px-2 text-center">
                    <span className="text-[#94a3b8] tabular-nums text-xs">{team.points}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      {users.length > 0 && color !== "none" && (
        <div className="flex flex-wrap gap-3 pt-2 border-t border-white/10">
          {color === "dev" ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-4 rounded bg-sky-500/60"></span>
                <span className="text-xs text-[#94a3b8]">上位に見た（差が大きい）</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-4 rounded bg-sky-500/15"></span>
                <span className="text-xs text-[#94a3b8]">上位に見た（少し）</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-4 rounded bg-white/5"></span>
                <span className="text-xs text-[#94a3b8]">みんなとほぼ同じ</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-4 rounded bg-rose-500/15"></span>
                <span className="text-xs text-[#94a3b8]">下位に見た（少し）</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-4 rounded bg-rose-500/60"></span>
                <span className="text-xs text-[#94a3b8]">下位に見た（差が大きい）</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-4 rounded bg-green-700/60"></span>
                <span className="text-xs text-[#94a3b8]">完全一致 (-2pt)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-4 rounded bg-yellow-700/60"></span>
                <span className="text-xs text-[#94a3b8]">差 1-3</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-4 rounded bg-orange-700/60"></span>
                <span className="text-xs text-[#94a3b8]">差 4-7</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-4 rounded bg-red-700/60"></span>
                <span className="text-xs text-[#94a3b8]">差 8+</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
