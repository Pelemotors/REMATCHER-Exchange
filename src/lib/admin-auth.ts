import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordFailedLogin,
} from "@/lib/rate-limit";

const isProd = process.env.NODE_ENV === "production";

/**
 * Separate System Admin NextAuth instance.
 * Cookie and basePath are distinct from dealer auth (`@/lib/auth`).
 */
export const {
  handlers,
  signIn,
  signOut,
  auth: uncachedAdminAuth,
} = NextAuth({
  trustHost: true,
  basePath: "/api/admin/auth",
  providers: [
    Credentials({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).trim().toLowerCase();
        if (await isLoginBlocked(email)) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            accountStatus: true,
            passwordHash: true,
            emailVerifiedAt: true,
          },
        });

        if (!user) {
          await recordFailedLogin(email);
          return null;
        }

        // Platform ADMIN only — dealer OWNER / DEALER_USER never pass
        if (user.role !== "ADMIN") {
          await recordFailedLogin(email);
          return null;
        }

        if (user.accountStatus !== "ACTIVE") {
          await recordFailedLogin(email);
          return null;
        }

        if (!user.passwordHash) {
          await recordFailedLogin(email);
          return null;
        }

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) {
          await recordFailedLogin(email);
          return null;
        }

        await clearLoginFailures(email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          dealerId: null,
          dealerName: null,
          verificationStatus: null,
          emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = (user as { role?: string }).role;
        token.dealerId = null;
        token.dealerName = null;
        token.verificationStatus = null;
        token.emailVerifiedAt = (
          user as { emailVerifiedAt?: string | null }
        ).emailVerifiedAt;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.dealerId = null;
        session.user.dealerName = null;
        session.user.verificationStatus = null;
        session.user.emailVerifiedAt = token.emailVerifiedAt as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/admin",
  },
  session: {
    strategy: "jwt",
    /** Shorter than dealer (30d) — 8 hours */
    maxAge: 8 * 60 * 60,
  },
  cookies: {
    sessionToken: {
      name: isProd ? "__Secure-admin-session-token" : "admin-session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
    csrfToken: {
      name: isProd ? "__Host-admin.csrf-token" : "admin.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
    callbackUrl: {
      name: isProd ? "__Secure-admin.callback-url" : "admin.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
  },
});

/** Per-request dedup when layout + page both resolve admin session */
export const adminAuth = cache(uncachedAdminAuth);
