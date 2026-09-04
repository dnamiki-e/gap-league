import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncSeasonData } from "@/lib/season-sync"

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }

  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // isLocked=true (確定済みアーカイブ) のシーズンは対象外。進行中シーズンのみ自動同期する。
  const seasons = await prisma.season.findMany({
    where: { isActive: true, isLocked: false },
  })

  const results = []
  for (const season of seasons) {
    const summary = await syncSeasonData(season)
    results.push(summary)
  }

  return NextResponse.json({ syncedSeasons: results.length, results })
}
