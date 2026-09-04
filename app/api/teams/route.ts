import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const seasonId = searchParams.get("seasonId")

  if (!seasonId) {
    return NextResponse.json({ error: "seasonId required" }, { status: 400 })
  }

  const seasonTeams = await prisma.seasonTeam.findMany({
    where: { seasonId },
    include: { team: true },
    orderBy: { team: { name: "asc" } },
  })

  const teams = seasonTeams.map((st) => st.team)
  return NextResponse.json(teams)
}
