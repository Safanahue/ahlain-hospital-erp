import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe base Auth.js config (no Prisma, no credentials provider).
 * Used by middleware; the full config lives in src/auth.ts.
 */
export const authConfig = {
  // The ERP runs on a hospital LAN (http://192.168.x.x:3000), so the Host
  // header cannot be one of Auth.js's fixed localhost defaults. Without this,
  // `next start` rejects sign-in with UntrustedHost.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      const isLoginPath = path.startsWith("/login");
      const isForgotPasswordPath = path.startsWith("/forgot-password");
      const isChangePasswordPath = path.startsWith("/change-password");

      if (!isLoggedIn && !isLoginPath && !isForgotPasswordPath) {
        return Response.redirect(new URL("/login", request.nextUrl));
      }
      if (isLoggedIn && isForgotPasswordPath) {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      if (isLoggedIn && isLoginPath) {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      // A temporary password must be replaced before anything else is opened.
      if (isLoggedIn && auth.user?.mustChangePassword && !isChangePasswordPath) {
        return Response.redirect(new URL("/change-password", request.nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword ?? false;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = token.role as never;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
