import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import {
  clientAddress,
  recordLoginAttempt,
  type LoginFailureReason,
} from "@/modules/auth/login-events";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);
        const ipAddress = clientAddress(request?.headers);
        const userAgent = request?.headers?.get("user-agent") ?? null;

        async function record(
          email: string,
          success: boolean,
          reason?: LoginFailureReason,
          userId?: string | null,
        ) {
          try {
            await recordLoginAttempt({
              email,
              userId: userId ?? null,
              success,
              reason,
              ipAddress,
              userAgent,
            });
          } catch (error) {
            // Sign-in must still work if audit logging fails.
            console.error("[auth] could not record login attempt:", error);
          }
        }

        if (!parsed.success) {
          const attempted =
            typeof credentials?.email === "string" ? credentials.email : "unknown";
          await record(attempted, false, "BAD_INPUT");
          return null;
        }

        const email = parsed.data.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });

        // Deactivated or unknown users cannot sign in.
        if (!user) {
          await record(email, false, "UNKNOWN_USER");
          return null;
        }
        if (!user.active) {
          await record(email, false, "INACTIVE", user.id);
          return null;
        }

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) {
          await record(email, false, "BAD_CREDENTIALS", user.id);
          return null;
        }

        await record(email, true, undefined, user.id);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
});
