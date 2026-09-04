"use client"

import { createContext, useContext } from "react"

/**
 * サイト名をクライアントコンポーネントへ配る。
 *
 * サイト名は管理画面（SiteConfig）で変えられるので、画面に直書きすると
 * 配布先が別の名前にしたときに元の名前が残る。
 * ルートレイアウト（サーバ）で1回読んで、ここから下へ渡す。
 * 公開APIを足して各画面から fetch する形にしないのは、
 * 既定名が一瞬見えてから差し替わるのを避けるため。
 *
 * 既定値は Prisma スキーマの既定値と同じにしてある。プロバイダは
 * ルートレイアウトに必ず入るので、これが出るのはテストなど
 * プロバイダ外で描画したときだけ。
 */
const SiteNameContext = createContext<string>("Gap League")

export function SiteNameProvider({
  siteName,
  children,
}: {
  siteName: string
  children: React.ReactNode
}) {
  return <SiteNameContext.Provider value={siteName}>{children}</SiteNameContext.Provider>
}

export function useSiteName(): string {
  return useContext(SiteNameContext)
}
