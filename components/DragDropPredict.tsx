"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import TeamCrest from "@/components/TeamCrest"
import { apiUrl } from "@/lib/api"

interface Team {
  id: string
  name: string
  shortName: string | null
  tla: string | null
  crestUrl: string | null
}

interface DragDropPredictProps {
  teams: Team[]
  initialPrediction: Array<{ teamId: string; predictedRank: number; comment?: string | null }> | null
  seasonId: string
  isLocked: boolean
  onSave?: () => void
}

export default function DragDropPredict({
  teams,
  initialPrediction,
  seasonId,
  isLocked,
  onSave,
}: DragDropPredictProps) {
  // リーグごとにチーム数が異なる（プレミア/ラ・リーガ/セリエA=20, ブンデス/リーグアン=18）
  const size = teams.length
  const [ranked, setRanked] = useState<(Team | null)[]>(() => Array(teams.length).fill(null))
  const [unranked, setUnranked] = useState<Team[]>([])
  const [comments, setComments] = useState<Record<string, string>>({})
  const [commentOpen, setCommentOpen] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle")
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (initialPrediction && initialPrediction.length > 0) {
      const newRanked: (Team | null)[] = Array(size).fill(null)
      const newComments: Record<string, string> = {}
      const newCommentOpen = new Set<string>()

      initialPrediction.forEach(({ teamId, predictedRank, comment }) => {
        const team = teams.find((t) => t.id === teamId)
        if (team && predictedRank >= 1 && predictedRank <= size) {
          newRanked[predictedRank - 1] = team
        }
        if (comment) {
          newComments[teamId] = comment
          newCommentOpen.add(teamId)
        }
      })
      /* eslint-disable react-hooks/set-state-in-effect */
      setRanked(newRanked)
      const placedIds = new Set(initialPrediction.map((d) => d.teamId))
      setUnranked(teams.filter((t) => !placedIds.has(t.id)))
      setComments(newComments)
      setCommentOpen(newCommentOpen)
      /* eslint-enable react-hooks/set-state-in-effect */
    } else {
      setUnranked([...teams])
      setRanked(Array(size).fill(null))
    }
  }, [teams, initialPrediction, size])

  const savePrediction = useCallback(
    async (currentRanked: (Team | null)[], currentComments: Record<string, string>) => {
      const details = currentRanked
        .map((team, idx) =>
          team
            ? {
                teamId: team.id,
                predictedRank: idx + 1,
                comment: currentComments[team.id] || undefined,
              }
            : null
        )
        .filter((d): d is { teamId: string; predictedRank: number; comment: string | undefined } => d !== null)

      if (details.length === 0) return

      setSaving(true)
      try {
        const res = await fetch(apiUrl("/api/predictions"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seasonId, details }),
        })
        if (!res.ok) throw new Error("Save failed")
        setSaveStatus("saved")
        const now = new Date()
        setLastSaved(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`)
        onSave?.()
        setTimeout(() => setSaveStatus("idle"), 3000)
      } catch {
        setSaveStatus("error")
      } finally {
        setSaving(false)
      }
    },
    [seasonId, onSave]
  )

  const triggerAutoSave = useCallback(
    (newRanked: (Team | null)[], currentComments: Record<string, string>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        savePrediction(newRanked, currentComments)
      }, 1500)
    },
    [savePrediction]
  )

  const handleReset = () => {
    setRanked(Array(size).fill(null))
    setUnranked([...teams])
    setComments({})
    setCommentOpen(new Set())
    setSaveStatus("idle")
    setLastSaved(null)
  }

  const toggleComment = (teamId: string) => {
    setCommentOpen((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  const updateComment = (teamId: string, value: string) => {
    const newComments = { ...comments, [teamId]: value }
    setComments(newComments)
    if (!isLocked) triggerAutoSave(ranked, newComments)
  }

  const moveTeam = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= size) return
    const newRanked = [...ranked]
    const temp = newRanked[index]
    newRanked[index] = newRanked[targetIndex]
    newRanked[targetIndex] = temp
    setRanked(newRanked)
    if (!isLocked) triggerAutoSave(newRanked, comments)
  }

  // スマホでは1列レイアウトになり、未配置チームを20枠ぶん上へドラッグする必要がある。
  // タップだけで予想を組めるように、最初の空き枠へ入れる手段を用意する。
  // 保存は moveTeam と同じ triggerAutoSave を通すこと（通さないと画面上だけ動いて保存されない）。
  const placeTeam = (team: Team) => {
    if (isLocked) return
    const firstEmpty = ranked.findIndex((t) => t === null)
    if (firstEmpty === -1) return
    const newRanked = [...ranked]
    newRanked[firstEmpty] = team
    setRanked(newRanked)
    setUnranked(unranked.filter((t) => t.id !== team.id))
    triggerAutoSave(newRanked, comments)
  }

  // 置き間違いを取り消せるように、配置済みを未配置へ戻す手段も置く。
  const unplaceTeam = (index: number) => {
    if (isLocked) return
    const team = ranked[index]
    if (!team) return
    const newRanked = [...ranked]
    newRanked[index] = null
    setRanked(newRanked)
    setUnranked([...unranked, team])
    triggerAutoSave(newRanked, comments)
  }

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const { source, destination } = result

    const newRanked = [...ranked]
    const newUnranked = [...unranked]

    const sourceIsUnranked = source.droppableId === "unranked"
    const destIsUnranked = destination.droppableId === "unranked"
    const sourceSlot = sourceIsUnranked ? null : parseInt(source.droppableId.replace("slot-", ""))
    const destSlot = destIsUnranked ? null : parseInt(destination.droppableId.replace("slot-", ""))

    if (sourceIsUnranked && !destIsUnranked && destSlot !== null) {
      const draggedTeam = newUnranked[source.index]
      const displaced = newRanked[destSlot]
      newRanked[destSlot] = draggedTeam
      newUnranked.splice(source.index, 1)
      if (displaced) newUnranked.push(displaced)
    } else if (!sourceIsUnranked && destIsUnranked && sourceSlot !== null) {
      const draggedTeam = newRanked[sourceSlot]
      if (draggedTeam) {
        newRanked[sourceSlot] = null
        newUnranked.splice(destination.index, 0, draggedTeam)
      }
    } else if (!sourceIsUnranked && !destIsUnranked && sourceSlot !== null && destSlot !== null) {
      const temp = newRanked[sourceSlot]
      newRanked[sourceSlot] = newRanked[destSlot]
      newRanked[destSlot] = temp
    } else if (sourceIsUnranked && destIsUnranked) {
      const [moved] = newUnranked.splice(source.index, 1)
      newUnranked.splice(destination.index, 0, moved)
    }

    setRanked(newRanked)
    setUnranked(newUnranked)

    if (!isLocked) triggerAutoSave(newRanked, comments)
  }

  const placedCount = ranked.filter((t) => t !== null).length

  const getRankColor = (i: number) => {
    if (i === 0) return "text-yellow-400"
    if (i === 1) return "text-slate-300"
    if (i === 2) return "text-amber-600"
    if (i <= 3) return "text-[#38bdf8]"
    if (i <= 5) return "text-[#4ade80]"
    if (i >= 17) return "text-[#f87171]"
    return "text-[#94a3b8]"
  }

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-[#94a3b8]">
          <span className={placedCount === size ? "text-[#4ade80] font-semibold" : "text-[#fbbf24]"}>
            {placedCount}
          </span>
          <span> / {size} チーム配置済み</span>
        </div>
        {!isLocked && (
          <div className="flex items-center gap-3 flex-wrap">
            {saveStatus === "saved" && (
              <span className="text-[#4ade80] text-sm">✓ 保存しました</span>
            )}
            {saveStatus === "error" && (
              <span className="text-[#f87171] text-sm">保存に失敗しました</span>
            )}
            {saveStatus === "idle" && lastSaved && (
              <span className="text-[#94a3b8] text-xs">最終保存: {lastSaved}</span>
            )}
            <button
              onClick={handleReset}
              className="min-h-[44px] px-4 text-sm bg-white/5 hover:bg-white/10 text-[#94a3b8] rounded-lg transition-colors border border-white/10"
            >
              リセット
            </button>
            <button
              onClick={() => savePrediction(ranked, comments)}
              disabled={saving || placedCount === 0}
              className="min-h-[44px] px-5 text-sm bg-[#38bdf8] hover:bg-[#38bdf8]/80 disabled:bg-white/10 disabled:text-[#94a3b8] text-[#0f1117] rounded-lg transition-colors font-semibold"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        )}
        {isLocked && (
          <span className="text-sm text-[#fbbf24] bg-[#fbbf24]/10 border border-[#fbbf24]/20 px-3 py-1 rounded-full">
            予想受付終了（閲覧のみ）
          </span>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Ranked slots */}
          <div>
            <h3 className="text-xs font-semibold text-[#94a3b8] mb-3 uppercase tracking-wider">
              予想順位
            </h3>
            <div className="space-y-1">
              {Array.from({ length: size }, (_, i) => (
                <Droppable key={`slot-${i}`} droppableId={`slot-${i}`}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`rounded-xl border transition-colors ${
                        snapshot.isDraggingOver
                          ? "border-[#38bdf8] bg-[#38bdf8]/10"
                          : ranked[i]
                            ? "border-white/10 bg-white/3"
                            : "border-dashed border-white/10 bg-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2 p-2 min-h-[44px]">
                        <span className={`w-7 text-center text-sm font-bold flex-shrink-0 ${getRankColor(i)}`}>
                          {i + 1}
                        </span>
                        {ranked[i] ? (
                          <Draggable
                            key={ranked[i]!.id}
                            draggableId={`ranked-${ranked[i]!.id}`}
                            index={0}
                            isDragDisabled={isLocked}
                          >
                            {(draggableProvided, draggableSnapshot) => (
                              <div
                                ref={draggableProvided.innerRef}
                                {...draggableProvided.draggableProps}
                                // min-w-0 が無いと flex アイテムがコンテンツ幅より縮まず、
                                // 中のチーム名の truncate が効かないまま行が画面外へはみ出す
                                className={`flex items-center gap-2 flex-1 min-w-0 rounded px-2 py-1 transition-all ${
                                  draggableSnapshot.isDragging
                                    ? "shadow-xl bg-[#1a1f2e] opacity-90"
                                    : isLocked
                                      ? "cursor-default"
                                      : "cursor-grab"
                                }`}
                              >
                                <span
                                  {...draggableProvided.dragHandleProps}
                                  className="text-[#94a3b8] text-xs cursor-grab"
                                  aria-label="ドラッグハンドル"
                                >
                                  ⠿
                                </span>
                                <TeamCrest
                                  crestUrl={ranked[i]!.crestUrl}
                                  teamName={ranked[i]!.name}
                                  size={24}
                                />
                                <span className="text-sm text-[#f1f5f9] font-medium flex-1 truncate">
                                  {ranked[i]!.shortName ?? ranked[i]!.name}
                                </span>
                                {ranked[i]!.tla && (
                                  <span className="text-xs text-[#94a3b8]">{ranked[i]!.tla}</span>
                                )}
                                {/* コメントインジケーター */}
                                {comments[ranked[i]!.id] && (
                                  <span className="text-xs text-[#4ade80]">💬</span>
                                )}
                                {!isLocked && (
                                  <>
                                    {/* 未配置へ戻す（タップ操作で置き間違えた場合の取り消し） */}
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); unplaceTeam(i) }}
                                      className="min-w-[44px] min-h-[44px] px-2 text-xs text-[#94a3b8] hover:text-[#f87171] transition-colors whitespace-nowrap"
                                      aria-label={`${ranked[i]!.name} を未配置に戻す`}
                                      title="未配置に戻す"
                                    >
                                      戻す
                                    </button>
                                    {/* コメントトグルボタン */}
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); toggleComment(ranked[i]!.id) }}
                                      className="min-w-[44px] min-h-[44px] px-2 text-xs text-[#94a3b8] hover:text-[#38bdf8] transition-colors"
                                      aria-label={`${ranked[i]!.name} のコメントを${commentOpen.has(ranked[i]!.id) ? "閉じる" : "追加"}`}
                                    >
                                      {commentOpen.has(ranked[i]!.id) ? "▲" : "✎"}
                                    </button>
                                    {/* 上下移動ボタン */}
                                    {/* 縦積み36px×2だと行が72pxになり、44px基準も満たせない。
                                       横並び44pxにすると基準を満たしつつ行が短くなる。 */}
                                  <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => moveTeam(i, -1)}
                                        disabled={i === 0}
                                        className="w-5 h-5 flex items-center justify-center text-[#94a3b8] hover:text-white disabled:opacity-30 text-xs"
                                        aria-label="上に移動"
                                      >
                                        ▲
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => moveTeam(i, 1)}
                                        disabled={i === size - 1}
                                        className="w-5 h-5 flex items-center justify-center text-[#94a3b8] hover:text-white disabled:opacity-30 text-xs"
                                        aria-label="下に移動"
                                      >
                                        ▼
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ) : (
                          <span className="text-[#94a3b8]/50 text-xs flex-1 pl-1">ここにドロップ</span>
                        )}
                        {provided.placeholder}
                      </div>
                      {/* Comment input */}
                      {ranked[i] && commentOpen.has(ranked[i]!.id) && (
                        <div className="px-3 pb-2">
                          <textarea
                            value={comments[ranked[i]!.id] ?? ""}
                            onChange={(e) => updateComment(ranked[i]!.id, e.target.value)}
                            placeholder={`${ranked[i]!.shortName ?? ranked[i]!.name} をこの順位にした理由…`}
                            maxLength={200}
                            rows={2}
                            readOnly={isLocked}
                            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[#f1f5f9] placeholder-[#94a3b8]/50 resize-none focus:outline-none focus:border-[#38bdf8]/50"
                          />
                          <div className="text-right text-xs text-[#94a3b8]/50 mt-0.5">
                            {(comments[ranked[i]!.id] ?? "").length}/200
                          </div>
                        </div>
                      )}
                      {/* Locked: show comment if exists */}
                      {ranked[i] && isLocked && comments[ranked[i]!.id] && (
                        <div className="px-3 pb-2">
                          <p className="text-xs text-[#94a3b8] bg-white/3 rounded-lg px-3 py-2 border border-white/10">
                            {comments[ranked[i]!.id]}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </div>

          {/* Right: Unranked teams */}
          <div>
            <h3 className="text-xs font-semibold text-[#94a3b8] mb-3">
              <span className="uppercase tracking-wider">未配置 ({unranked.length})</span>
              {!isLocked && (
                <span className="ml-2 normal-case font-normal text-[#94a3b8]/70">
                  ドラッグ、または「追加」で配置
                </span>
              )}
            </h3>
            <Droppable droppableId="unranked">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`min-h-[400px] rounded-xl border-2 border-dashed p-3 transition-colors ${
                    snapshot.isDraggingOver
                      ? "border-[#38bdf8] bg-[#38bdf8]/5"
                      : "border-white/10 bg-white/2"
                  }`}
                >
                  <div className="space-y-1">
                    {unranked.map((team, index) => (
                      <Draggable
                        key={team.id}
                        draggableId={`unranked-${team.id}`}
                        index={index}
                        isDragDisabled={isLocked}
                      >
                        {(draggableProvided, draggableSnapshot) => (
                          <div
                            ref={draggableProvided.innerRef}
                            {...draggableProvided.draggableProps}
                            {...draggableProvided.dragHandleProps}
                            className={`flex items-center gap-2 rounded-xl px-3 py-2 bg-[#1a1f2e] border transition-all ${
                              draggableSnapshot.isDragging
                                ? "shadow-xl opacity-90 border-[#38bdf8]/50"
                                : isLocked
                                  ? "cursor-default border-white/10"
                                  : "cursor-grab hover:border-white/20 hover:bg-white/5 border-white/10"
                            }`}
                          >
                            <TeamCrest crestUrl={team.crestUrl} teamName={team.name} size={28} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[#f1f5f9] font-medium truncate">{team.name}</p>
                            </div>
                            {team.tla && (
                              <span className="text-xs text-[#94a3b8] flex-shrink-0">{team.tla}</span>
                            )}
                            {!isLocked && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); placeTeam(team) }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                disabled={!ranked.some((t) => t === null)}
                                className="flex-shrink-0 min-w-[44px] min-h-[44px] px-3 rounded-lg text-xs font-semibold bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30 hover:bg-[#38bdf8]/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                aria-label={`${team.name} を空いている最上位の枠に追加`}
                                title="空いている最上位の枠に追加"
                              >
                                追加
                              </button>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                  </div>
                  {provided.placeholder}
                  {unranked.length === 0 && (
                    <div className="flex items-center justify-center h-32 text-[#94a3b8]/50 text-sm">
                      ✓ 全チーム配置済み
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </DragDropContext>
    </div>
  )
}
