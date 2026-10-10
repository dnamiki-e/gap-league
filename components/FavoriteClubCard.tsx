import Link from "next/link"
import TeamCrest from "@/components/TeamCrest"
import { leagueName } from "@/lib/leagues"
import {
  addDaysKey,
  formatDayLabel,
  jstDayKey,
  kickoffDisplay,
  matchState,
} from "@/lib/fixtures"
import type { FavoriteClubFixtures } from "@/lib/favorite-club"

/** 「プレミアリーグ（イングランド）」→「プレミアリーグ」 */
function shortLeagueName(code: string): string {
  return leagueName(code).split("（")[0]
}

function dayText(utcDate: Date, now: Date): string {
  const key = jstDayKey(utcDate)
  const today = jstDayKey(now)
  if (key === today) return "今日"
  if (key === addDaysKey(today, 1)) return "明日"
  return formatDayLabel(key)
}

const cardClass = "bg-[#1a1f2e] rounded-2xl p-6 border border-white/10"

/** 推しクラブを設定していない人向け。設定すると何が出るかを先に伝える */
export function FavoriteClubPrompt() {
  return (
    <div className={cardClass}>
      <h3 className="text-sm font-semibold text-[#f1f5f9] mb-1">推しクラブの試合</h3>
      <p className="text-sm text-[#94a3b8]">
        推しクラブを設定すると、次の試合の日時がここに出ます。
        <Link href="/profile" className="ml-2 text-[#38bdf8] hover:underline whitespace-nowrap">
          プロフィールで設定 →
        </Link>
      </p>
    </div>
  )
}

export default function FavoriteClubCard({ data, now }: { data: FavoriteClubFixtures; now: Date }) {
  const { club, fixtures } = data

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <TeamCrest crestUrl={club.crestUrl} teamName={club.name} size={24} />
          <h3 className="text-sm font-semibold text-[#f1f5f9] truncate">
            {club.shortName ?? club.name} の試合
          </h3>
        </div>
        <Link href="/league/fixtures" className="text-xs text-[#38bdf8] hover:underline whitespace-nowrap">
          日程を見る →
        </Link>
      </div>

      {fixtures.length === 0 ? (
        <p className="text-sm text-[#94a3b8]">
          予定されている試合はありません（対応リーグのシーズンが始まっていないか、日程が未取り込みです）
        </p>
      ) : (
        <ul>
          {fixtures.map((f) => {
            const state = matchState(f, now)
            const kickoff = kickoffDisplay(f)
            const hasScore = (state === "finished" || state === "live") && f.scoreFor != null && f.scoreAgainst != null
            return (
              <li key={f.id} className="flex items-center gap-3 py-2.5 border-t border-white/5 first:border-t-0">
                <div className="w-20 shrink-0">
                  <p className="text-sm font-semibold text-[#f1f5f9]">{dayText(f.utcDate, now)}</p>
                  <p className="text-xs tabular-nums text-[#94a3b8]">
                    {kickoff.kind === "time" ? kickoff.text : "時間未定"}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamCrest crestUrl={f.opponent.crestUrl} teamName={f.opponent.name} size={20} />
                    <span className="truncate text-sm text-[#f1f5f9] font-medium">
                      vs {f.opponent.shortName ?? f.opponent.name}
                    </span>
                  </div>
                  <p className="text-xs text-[#94a3b8]">
                    {shortLeagueName(f.leagueCode)}・{f.isHome ? "ホーム" : "アウェイ"}
                  </p>
                </div>
                {/* 状態は色だけで伝えない。文言を添える */}
                <span className="shrink-0 text-right text-xs text-[#94a3b8]">
                  {state === "live" && <span className="text-[#4ade80] font-semibold">試合中</span>}
                  {state === "finished" && (hasScore ? `終了 ${f.scoreFor}-${f.scoreAgainst}` : "終了")}
                  {state === "started" && "開始済み"}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
