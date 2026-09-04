import type { Metadata } from "next"
import "./globals.css"
import SessionProvider from "@/components/providers/SessionProvider"
import { SiteNameProvider } from "@/components/providers/SiteNameProvider"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getSiteConfig } from "@/lib/site-config"

export async function generateMetadata(): Promise<Metadata> {
  const name = await getSiteConfig()
    .then((c) => c.siteName)
    .catch(() => "Gap League")
  return {
    title: `${name} — サッカー順位予想`,
    description: "5大リーグの最終順位を予想して、仲間とスコアを競おう。",
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession(authOptions)
  // DB が落ちていてもログイン画面ごと 500 にしないよう、既定名に落とす
  const siteName = await getSiteConfig()
    .then((c) => c.siteName)
    .catch(() => "Gap League")

  return (
    <html lang="ja" className="h-full" data-theme="light">
      <head>
        {/*
          globals.css が "Noto Sans JP" を先頭に指定しているが、実体を配信していなかったため
          OS ごとに別の書体（游ゴシック / ヒラギノ / Noto Sans CJK）で表示されていた。
          Google Fonts は unicode-range で分割配信されるので、必要な字だけが落ちてくる。
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font --
            このルールは pages ディレクトリ向け。App Router のルートレイアウトに置いた
            <link> は全ページに適用されるため、ここでは誤検知。 */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full antialiased">
        <SessionProvider session={session}>
          <SiteNameProvider siteName={siteName}>{children}</SiteNameProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
