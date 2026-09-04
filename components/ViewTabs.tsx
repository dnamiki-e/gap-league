"use client"

import { useEffect, useRef } from "react"
import { segmentedItemClass, segmentedTrackClass } from "@/lib/ui"

export interface ViewTabItem<K extends string> {
  key: K
  label: string
  /** タブの状態を色以外でも伝えるための補助ラベル（「締切」など） */
  badge?: string
}

/**
 * ページ内の状態でビューを切り替える第2階層タブ。
 *
 * ルート遷移で切り替える SectionNav と役割は同じ（セクション内のビュー切替）なので
 * 見た目は lib/ui.ts のクラスを共有する。こちらを使うのは、切替の前後で
 * 入力途中の内容やフェッチ済みデータを保ちたい画面（例: 予想入力）。
 * URL には出ないため、共有・ブックマークしたい切替には SectionNav を使う。
 *
 * リンクではなくボタンなので、ロールは navigation ではなく tablist を名乗る。
 */
export default function ViewTabs<K extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: ViewTabItem<K>[]
  value: K
  onChange: (key: K) => void
  ariaLabel: string
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null)

  // 狭い画面では横スクロールになるため、現在地が画面外に置かれたままにならないよう寄せる
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [value])

  return (
    // 帯を中身の幅に留めるための包み。
    // segmentedTrackClass は display:flex なので、ブロック要素として直接置くと
    // 親の幅いっぱいに伸びて背景だけが横断してしまう。flex の子にすると
    // shrink-to-fit になり、SectionNav と同じ見た目に揃う
    // （狭い画面で縮んで横スクロールできるよう min-w-0 は帯側が持っている）。
    <div className="flex items-center min-w-0">
      <div role="tablist" aria-label={ariaLabel} className={segmentedTrackClass}>
        {items.map((item) => {
          const active = item.key === value
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`tab-${item.key}`}
              aria-selected={active}
              aria-controls={`panel-${item.key}`}
              ref={active ? activeRef : undefined}
              onClick={() => onChange(item.key)}
              className={segmentedItemClass(active)}
            >
              {item.label}
              {item.badge && (
                <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">{item.badge}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
