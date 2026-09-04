"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import TeamCrest from "@/components/TeamCrest"

export interface LeagueTeam {
  id: string
  name: string
  shortName: string
  tla: string
  leagueCode: string
  crestUrl: string | null
  isStatic: boolean
}

export interface LeagueGroup {
  code: string
  name: string
  teams: LeagueTeam[]
}

interface ClubSelectProps {
  groups: LeagueGroup[]
  value: string
  onChange: (id: string) => void
}

// 「選択しない」を含む、キーボード操作用のフラットな選択肢リストを表す内部型
interface FlatOption {
  id: string
  name: string
  crestUrl: string | null
}

export default function ClubSelect({ groups, value, onChange }: ClubSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const baseId = useId()

  // 「選択しない」を先頭に置いたフラットリスト（キーボードのインデックス基準）
  const flat = useMemo<FlatOption[]>(
    () => [
      { id: "", name: "選択しない", crestUrl: null },
      ...groups.flatMap((g) => g.teams.map((t) => ({ id: t.id, name: t.name, crestUrl: t.crestUrl }))),
    ],
    [groups]
  )

  const selected = flat.find((o) => o.id === value) ?? flat[0]

  // 現在の選択肢にアクティブ位置を合わせてから開く
  function openMenu() {
    const idx = flat.findIndex((o) => o.id === value)
    setActiveIndex(idx >= 0 ? idx : 0)
    setOpen(true)
  }

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  // アクティブ項目をビューに収める
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [open, activeIndex])

  function commit(idx: number) {
    const opt = flat[idx]
    if (opt) onChange(opt.id)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        if (!open) {
          openMenu()
        } else {
          setActiveIndex((i) => Math.min(i + 1, flat.length - 1))
        }
        break
      case "ArrowUp":
        e.preventDefault()
        if (!open) {
          openMenu()
        } else {
          setActiveIndex((i) => Math.max(i - 1, 0))
        }
        break
      case "Home":
        if (open) {
          e.preventDefault()
          setActiveIndex(0)
        }
        break
      case "End":
        if (open) {
          e.preventDefault()
          setActiveIndex(flat.length - 1)
        }
        break
      case "Enter":
      case " ":
        e.preventDefault()
        if (open) commit(activeIndex)
        else openMenu()
        break
      case "Escape":
        if (open) {
          e.preventDefault()
          setOpen(false)
        }
        break
      case "Tab":
        if (open) setOpen(false)
        break
    }
  }

  const listboxId = `${baseId}-listbox`
  const activeOptionId = open ? `${baseId}-opt-${activeIndex}` : undefined

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center gap-2 bg-[#1a1f2e] border border-white/10 text-[#f1f5f9] rounded-xl py-3 pl-3 pr-10 text-left focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 focus:border-[#38bdf8]/50 transition-colors relative"
      >
        {selected.id ? (
          <>
            <TeamCrest crestUrl={selected.crestUrl} teamName={selected.name} size={20} />
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-[#94a3b8]">選択しない</span>
        )}
        <svg
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8] transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="推しクラブ"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#1a1f2e] py-1 shadow-xl shadow-black/40"
        >
          {flat.map((opt, idx) => {
            // グループ見出し: このチームが各リーグの先頭なら見出しを挿入
            const groupHead = groups.find((g) => g.teams[0]?.id === opt.id)
            const isActive = idx === activeIndex
            const isSelected = opt.id === value
            return (
              <li key={opt.id || "__none"}>
                {groupHead && (
                  <div className="px-3 pt-2 pb-1 text-xs font-semibold text-[#94a3b8]">
                    {groupHead.name}
                  </div>
                )}
                <div
                  id={`${baseId}-opt-${idx}`}
                  data-index={idx}
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={() => setActiveIndex(idx)}
                  onClick={() => commit(idx)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${
                    isActive ? "bg-white/10" : ""
                  } ${isSelected ? "text-[#38bdf8]" : "text-[#f1f5f9]"}`}
                >
                  {opt.id ? (
                    <TeamCrest crestUrl={opt.crestUrl} teamName={opt.name} size={20} />
                  ) : (
                    <span className="inline-block w-5 h-5" aria-hidden="true" />
                  )}
                  <span className="truncate">{opt.name}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
