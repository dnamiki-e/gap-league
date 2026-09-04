import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getSiteConfig, updateSiteConfig } from "@/lib/site-config"
import { z } from "zod"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return NextResponse.json(await getSiteConfig())
}

const schema = z.object({
  siteName: z.string().min(1).max(100).optional(),
  scoreExactMatch: z.number().int().optional(),
  scoreDiffMultiplier: z.number().int().min(1).optional(),
  enabledLeagues: z.array(z.string()).min(1).optional(),
})

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    )
  }

  const updated = await updateSiteConfig(parsed.data)
  return NextResponse.json(updated)
}
