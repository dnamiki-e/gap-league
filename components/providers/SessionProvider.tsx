"use client"

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import type { Session } from "next-auth"

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

export default function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode
  session?: Session | null
}) {
  return (
    <NextAuthSessionProvider session={session} basePath={`${BASE_PATH}/api/auth`}>
      {children}
    </NextAuthSessionProvider>
  )
}
