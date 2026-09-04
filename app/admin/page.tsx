import { prisma } from "@/lib/prisma"
import { getSiteConfig } from "@/lib/site-config"
import Link from "next/link"

export default async function AdminDashboard() {
  const { siteName } = await getSiteConfig()
  const [seasonCount, userCount, predictionCount] = await Promise.all([
    prisma.season.count({ where: { isActive: true } }),
    prisma.user.count(),
    prisma.prediction.count(),
  ])

  const recentSeasons = await prisma.season.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      _count: { select: { predictions: true, seasonTeams: true } },
    },
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#f1f5f9]">管理ダッシュボード</h1>
        <p className="text-[#94a3b8] mt-1">{siteName} 管理画面</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10">
          <p className="text-[#94a3b8] text-sm mb-2">アクティブシーズン</p>
          <p className="text-3xl font-black text-[#f1f5f9]">{seasonCount}</p>
        </div>
        <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10">
          <p className="text-[#94a3b8] text-sm mb-2">登録ユーザー</p>
          <p className="text-3xl font-black text-[#f1f5f9]">{userCount}</p>
        </div>
        <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10">
          <p className="text-[#94a3b8] text-sm mb-2">総予想数</p>
          <p className="text-3xl font-black text-[#f1f5f9]">{predictionCount}</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/seasons"
          className="bg-[#1a1f2e] hover:bg-white/5 rounded-2xl p-6 border border-white/10 transition-colors group"
        >
          <div className="text-2xl mb-3">📅</div>
          <h2 className="text-lg font-semibold text-[#f1f5f9] group-hover:text-[#38bdf8] transition-colors">
            シーズン管理
          </h2>
          <p className="text-[#94a3b8] text-sm mt-1">
            シーズンの作成、締切変更、ロック、データ同期
          </p>
        </Link>
        <Link
          href="/admin/users"
          className="bg-[#1a1f2e] hover:bg-white/5 rounded-2xl p-6 border border-white/10 transition-colors group"
        >
          <div className="text-2xl mb-3">👥</div>
          <h2 className="text-lg font-semibold text-[#f1f5f9] group-hover:text-[#38bdf8] transition-colors">
            ユーザー管理
          </h2>
          <p className="text-[#94a3b8] text-sm mt-1">
            ユーザーの一覧表示、管理者権限の付与
          </p>
        </Link>
        <Link
          href="/admin/settings"
          className="bg-[#1a1f2e] hover:bg-white/5 rounded-2xl p-6 border border-white/10 transition-colors group"
        >
          {/* ⚙️ は左ナビの「管理」で使っているため、設定は 🎛️ にして意味の衝突を避ける */}
          <div className="text-2xl mb-3">🎛️</div>
          <h2 className="text-lg font-semibold text-[#f1f5f9] group-hover:text-[#38bdf8] transition-colors">
            サイト設定
          </h2>
          <p className="text-[#94a3b8] text-sm mt-1">
            サイト名、スコアルール、対応リーグの設定
          </p>
        </Link>
      </div>

      {/* Recent seasons */}
      {recentSeasons.length > 0 && (
        <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="font-semibold text-[#f1f5f9]">シーズン一覧</h2>
          </div>
          <div className="divide-y divide-white/5">
            {recentSeasons.map((season) => (
              <div key={season.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-[#f1f5f9]">{season.name}</p>
                  <p className="text-sm text-[#94a3b8]">
                    {season.leagueCode} · チーム: {season._count.seasonTeams} · 予想: {season._count.predictions}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {season.isLocked && (
                    <span className="text-xs bg-[#a78bfa]/10 text-[#a78bfa] border border-[#a78bfa]/30 px-2 py-0.5 rounded-full">
                      確定
                    </span>
                  )}
                  {season.isActive && !season.isLocked && (
                    <span className="text-xs bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/30 px-2 py-0.5 rounded-full">
                      受付中
                    </span>
                  )}
                  <Link
                    href="/admin/seasons"
                    className="text-sm text-[#38bdf8] hover:underline"
                  >
                    管理 →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
