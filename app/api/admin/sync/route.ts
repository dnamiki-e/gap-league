import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { syncSeasonData } from "@/lib/season-sync"
import { z } from "zod"

const syncSchema = z.object({
  seasonId: z.string(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const parsed = syncSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const { seasonId } = parsed.data

  const season = await prisma.season.findUnique({ where: { id: seasonId } })
  if (!season) {
    return NextResponse.json({ error: "Season not found" }, { status: 404 })
  }

  const summary = await syncSeasonData(season)

  return NextResponse.json(summary)
}
