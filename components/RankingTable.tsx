"use client"

import Link from "next/link"
import TeamCrest from "@/components/TeamCrest"

interface RankingEntry {
  rank: number
  userId: string
  displayName: string | null
  email: string | null
  image: string | null
  favoriteClub: { name: string; crestUrl: string | null } | null
  totalPoints: number | null
  hasPrediction: boolean
}

interface RankingTableProps {
  entries: RankingEntry[]
  currentUserId?: string
  limit?: number
}

function getPointsColor(points: number | null): string {
  if (points === null) return "text-slate-400"
  if (points <= 0) return "text-green-400"
  if (points <= 10) return "text-green-300"
  if (points <= 20) return "text-yellow-300"
  if (points <= 40) return "text-orange-400"
  return "text-red-400"
}

export default function RankingTable({
  entries,
  currentUserId,
  limit,
}: RankingTableProps) {
  const displayEntries = limit ? entries.slice(0, limit) : entries

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-700">
            <th className="pb-2 pr-4 w-10">#</th>
            <th className="pb-2 pr-4">ユーザー</th>
            <th className="pb-2 pr-4 w-16 text-center">推しクラブ</th>
            <th className="pb-2 text-right">ポイント</th>
          </tr>
        </thead>
        <tbody>
          {displayEntries.map((entry) => (
            <tr
              key={entry.userId}
              className={`border-b border-slate-800 hover:bg-slate-800/50 transition-colors ${
                entry.userId === currentUserId ? "bg-blue-900/20" : ""
              }`}
            >
              <td className="py-3 pr-4">
                <span
                  className={`font-bold ${
                    entry.rank === 1
                      ? "text-yellow-400"
                      : entry.rank === 2
                        ? "text-slate-300"
                        : entry.rank === 3
                          ? "text-amber-600"
                          : "text-slate-400"
                  }`}
                >
                  {entry.rank}
                </span>
              </td>
              <td className="py-3 pr-4">
                <Link
                  href={`/ranking/${entry.userId}`}
                  className="flex items-center gap-2 hover:text-blue-400 transition-colors"
                >
                  {entry.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.image}
                      alt={entry.displayName ?? ""}
                      className="w-6 h-6 rounded-full"
                    />
                  )}
                  <span className="text-slate-200">
                    {entry.displayName ?? entry.email ?? "Anonymous"}
                  </span>
                  {entry.userId === currentUserId && (
                    <span className="text-xs text-blue-400 bg-blue-900/40 px-1 rounded">
                      あなた
                    </span>
                  )}
                </Link>
              </td>
              <td className="py-3 pr-4 text-center">
                {entry.favoriteClub ? (
                  <div className="flex justify-center">
                    <TeamCrest
                      crestUrl={entry.favoriteClub.crestUrl}
                      teamName={entry.favoriteClub.name}
                      size={24}
                    />
                  </div>
                ) : (
                  <span className="text-slate-600">-</span>
                )}
              </td>
              <td className="py-3 text-right">
                {entry.hasPrediction ? (
                  <span className={`font-bold tabular-nums ${getPointsColor(entry.totalPoints)}`}>
                    {entry.totalPoints !== null ? entry.totalPoints : "-"}
                  </span>
                ) : (
                  <span className="text-slate-600 text-xs">未予想</span>
                )}
              </td>
            </tr>
          ))}
          {displayEntries.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-slate-500">
                まだ予想がありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
