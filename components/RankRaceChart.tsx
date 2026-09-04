"use client"

import { useEffect, useRef, useState } from "react"

export interface RaceUser {
  userId: string
  label: string
  isCurrentUser: boolean
  color: string
  // matchdays と同じ長さ。その節に順位が無ければ null
  ranks: (number | null)[]
  scores: (number | null)[]
}

interface RankRaceChartProps {
  matchdays: number[]
  users: RaceUser[]
  totalUsers: number
}

const STEP_MS = 1100 // 1節あたりの再生間隔
const TRANS = "700ms" // スライド/移動のトランジション

export default function RankRaceChart({ matchdays, users, totalUsers }: RankRaceChartProps) {
  const last = matchdays.length - 1
  // 初期表示は最新節。開いた人がまず見たいのは「今の順位」で、
  // 第1節から始めるとランキング画面と違う順位が出て混乱する。
  const [index, setIndex] = useState(Math.max(last, 0))
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // 再生制御
  useEffect(() => {
    if (!playing) return
    timer.current = setInterval(() => {
      setIndex((i) => {
        if (i >= last) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, STEP_MS)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [playing, last])

  const togglePlay = () => {
    if (index >= last) setIndex(0) // 末尾なら頭出しして再生
    setPlaying((p) => !p)
  }

  // --- SVG 折れ線チャート ---
  const CHART_W = 800
  const ROW_H = 26
  const PAD = { top: 16, right: 16, bottom: 32, left: 30 }
  const plotW = CHART_W - PAD.left - PAD.right
  const plotH = Math.max(totalUsers - 1, 1) * ROW_H
  const CHART_H = plotH + PAD.top + PAD.bottom

  const xAt = (i: number) =>
    matchdays.length === 1 ? PAD.left + plotW / 2 : PAD.left + (i / last) * plotW
  const yAt = (rank: number) => PAD.top + ((rank - 1) / Math.max(totalUsers - 1, 1)) * plotH

  // index までの折れ線パス（順次伸びる）
  const pathUpTo = (u: RaceUser) => {
    const pts: string[] = []
    for (let i = 0; i <= index; i++) {
      const r = u.ranks[i]
      if (r == null) continue
      pts.push(`${pts.length === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(r).toFixed(1)}`)
    }
    return pts.join(" ")
  }

  const currentMd = matchdays[index]

  // 現在の節での順位順に並べたリーダーボード
  const board = users
    .map((u) => ({ u, rank: u.ranks[index], score: u.scores[index] }))
    .filter((e): e is { u: RaceUser; rank: number; score: number } => e.rank != null)
    .sort((a, b) => a.rank - b.rank)

  return (
    <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10 space-y-5">
      {/* コントロール */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={togglePlay}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#38bdf8] hover:bg-[#38bdf8]/80 text-[#0f1117] text-lg transition-colors"
          aria-label={playing ? "一時停止" : "再生"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          onClick={() => { setPlaying(false); setIndex(0) }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-[#94a3b8] transition-colors"
          aria-label="最初から"
        >
          ⟲
        </button>
        <input
          type="range"
          min={0}
          max={last}
          value={index}
          onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)) }}
          className="flex-1 min-w-[140px] accent-[#38bdf8]"
          aria-label="節を選択"
        />
        <span className="text-sm font-bold text-[#f1f5f9] tabular-nums whitespace-nowrap">
          第{currentMd}節
        </span>
      </div>

      {/* 折れ線チャート */}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 380 }}>
          {/* 順位グリッド */}
          {Array.from({ length: totalUsers }, (_, i) => i + 1).map((rank) => (
            <g key={rank}>
              <line x1={PAD.left} y1={yAt(rank)} x2={PAD.left + plotW} y2={yAt(rank)}
                stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              <text x={PAD.left - 6} y={yAt(rank) + 3} fill="#94a3b8" fontSize={9} textAnchor="end">{rank}</text>
            </g>
          ))}
          {/* 節ラベル */}
          {matchdays.map((md, i) => (
            <text key={md} x={xAt(i)} y={CHART_H - PAD.bottom + 16}
              fill={i === index ? "#f1f5f9" : "#94a3b8"} fontSize={9} textAnchor="middle"
              fontWeight={i === index ? 700 : 400}>
              {md}
            </text>
          ))}
          {/* プレイヘッド */}
          <line x1={xAt(index)} y1={PAD.top - 6} x2={xAt(index)} y2={PAD.top + plotH}
            stroke="#38bdf8" strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
            style={{ transition: `x1 ${TRANS}, x2 ${TRANS}` }} />

          {/* 各ユーザーの軌跡＋移動ヘッド */}
          {users.map((u) => {
            const path = pathUpTo(u)
            const r = u.ranks[index]
            return (
              <g key={u.userId}>
                {path && (
                  <path d={path} fill="none" stroke={u.color}
                    strokeWidth={u.isCurrentUser ? 3 : 1.5}
                    opacity={u.isCurrentUser ? 1 : 0.55}
                    strokeLinecap="round" strokeLinejoin="round" />
                )}
                {r != null && (
                  <g style={{ transition: `transform ${TRANS}` }}
                     transform={`translate(${xAt(index).toFixed(1)}, ${yAt(r).toFixed(1)})`}>
                    <circle r={u.isCurrentUser ? 6 : 4} fill={u.color}
                      opacity={u.isCurrentUser ? 1 : 0.8}>
                      <title>{u.label}: 第{currentMd}節 {r}位 ({u.scores[index]}pt)</title>
                    </circle>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* 順位リスト（行が入れ替わる） */}
      <div>
        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
          第{currentMd}節 時点の順位
        </h3>
        <div className="relative" style={{ height: board.length * (ROW_H + 8) }}>
          {board.map((e) => (
            <div
              key={e.u.userId}
              className={`absolute left-0 right-0 flex items-center gap-3 rounded-xl px-3 border ${
                e.u.isCurrentUser
                  ? "bg-[#a78bfa]/10 border-[#a78bfa]/30"
                  : "bg-white/3 border-white/5"
              }`}
              style={{
                top: (e.rank - 1) * (ROW_H + 8),
                height: ROW_H,
                transition: `top ${TRANS}`,
              }}
            >
              <span
                className={`w-6 text-center font-black tabular-nums text-sm ${
                  e.rank === 1 ? "text-yellow-400" : e.rank === 2 ? "text-slate-300" : e.rank === 3 ? "text-amber-600" : "text-[#94a3b8]"
                }`}
              >
                {e.rank}
              </span>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.u.color }} />
              <span className={`flex-1 truncate text-sm ${e.u.isCurrentUser ? "text-[#a78bfa] font-semibold" : "text-[#f1f5f9]"}`}>
                {e.u.label}{e.u.isCurrentUser && " ★"}
              </span>
              <span className="text-xs text-[#94a3b8] tabular-nums">{e.score}pt</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
