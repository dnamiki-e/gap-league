import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma } from "@prisma/client"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { resolveFavoriteClubId } from "@/lib/teams"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      displayName: true,
      favoriteClubId: true,
      profileSetup: true,
      email: true,
      name: true,
      image: true,
      passwordHash: true,
    },
  })

  if (!user) return NextResponse.json(null)

  // passwordHash 自体は返さず、設定済みかどうかのフラグだけ返す
  const { passwordHash, ...rest } = user
  return NextResponse.json({ ...rest, hasPassword: !!passwordHash })
}

const profileSchema = z.object({
  displayName: z.string().min(1).max(50),
  favoriteClubId: z.string().optional().nullable(),
})

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = profileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const favoriteClubId = await resolveFavoriteClubId(parsed.data.favoriteClubId)

  try {
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        displayName: parsed.data.displayName,
        favoriteClubId,
        profileSetup: true,
      },
      select: { id: true, displayName: true, favoriteClubId: true, profileSetup: true },
    })

    return NextResponse.json(updated)
  } catch (err) {
    // P2025: セッションが指すUserがDBに存在しない（DBリセット後の古いクッキー等）。
    // 再ログインを促す。
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json(
        { error: "セッションが無効です。再ログインしてください" },
        { status: 401 }
      )
    }
    throw err
  }
}
