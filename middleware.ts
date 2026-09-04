import { withAuth } from "next-auth/middleware"

// Next.js middleware は basePath を自動で付与するため、ここでは付与しない。
export default withAuth({
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: ({ token }) => !!token,
  },
})

export const config = {
  matcher: [
    "/home/:path*",
    "/predict/:path*",
    "/ranking/:path*",
    "/admin/:path*",
    "/profile/:path*",
    "/results",
    "/results/:path*",
    "/stats",
    "/stats/:path*",
  ],
}
