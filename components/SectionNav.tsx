"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { segmentedItemClass, segmentedTrackClass } from "@/lib/ui"
import type { SectionNavItem } from "@/lib/ui"

/**
 * セクション内のビュー切替（第2階層）。
 *
 * ナビの役割をはっきり分けるための部品:
 *   左ナビ / ボトムタブ … セクション間の移動（第1階層）
 *   SectionNav        … セクション内のビュー切替（第2階層）← これ
 *   シーズン選択      … 表示するデータの範囲（第3階層）
 *
 * 第3階層のシーズン選択と見分けがつくよう、こちらはセグメンテッドコントロール、
 * あちらは独立したピルという別々の見た目にしてある。
 *
 * href にクエリを載せるのは呼び出し側（サーバコンポーネント）の責務。
 * useSearchParams を使うと Suspense 境界が必要になるため、解決済みの値を渡してもらう。
 */
export default function SectionNav({ items }: { items: SectionNavItem[] }) {
  const pathname = usePathname()
  const activeRef = useRef<HTMLAnchorElement | null>(null)

  // 狭い画面では横スクロールになるため、現在地が画面外に置かれたままにならないよう寄せる
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [pathname])

  const isActive = (item: SectionNavItem) =>
    item.exact
      ? pathname === item.path
      : pathname === item.path || pathname.startsWith(`${item.path}/`)

  return (
    <div className="flex items-center min-w-0">
      <nav
        aria-label="セクション内メニュー"
        className={segmentedTrackClass}
      >
        {items.map((item) => {
          const active = isActive(item)
          return (
            <Link
              key={item.path}
              href={item.href}
              ref={active ? activeRef : undefined}
              aria-current={active ? "page" : undefined}
              className={segmentedItemClass(active)}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
