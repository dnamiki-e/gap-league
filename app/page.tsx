import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function RootPage() {
  const session = await getServerSession(authOptions)

  if (session?.user) {
    if (!session.user.profileSetup) {
      redirect("/profile")
    }
    redirect("/home")
  }

  redirect("/login")
}
