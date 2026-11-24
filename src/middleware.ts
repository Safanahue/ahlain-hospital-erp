import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge runtime: only the cookie/JWT check runs here. Role checks happen
// server-side in page guards (requirePageUser) and API guards (requireApiUser).
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|forgot-password|uploads|.*\\..*).*)",
  ],
};
