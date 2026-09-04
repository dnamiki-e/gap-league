import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { fetchMatches } from "@/lib/football-data"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const leagueCode = searchParams.get("leagueCode") ?? "PL"
  const season = searchParams.get("season") ? Number(searchParams.get("season")) : 2024
  const status = searchParams.get("status") ?? undefined
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50
  const order = (searchParams.get("order") as "asc" | "desc") ?? "desc"

  try {
    const matches = await fetchMatches({ leagueCode, season, status, limit, order })
    return NextResponse.json({ matches })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
