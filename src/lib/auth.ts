import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            memberships: {
              include: { dealer: true },
              take: 1,
            },
          },
        });

        if (!user) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;

        const membership = user.memberships[0];

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          dealerId: membership?.dealerId ?? null,
          dealerName: membership?.dealer.businessName ?? null,
          verificationStatus: membership?.dealer.verificationStatus ?? null,
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
        token.dealerId = (user as { dealerId?: string | null }).dealerId;
        token.dealerName = (user as { dealerName?: string | null }).dealerName;
        token.verificationStatus = (
          user as { verificationStatus?: string | null }
        ).verificationStatus;
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
        session.user.dealerId = token.dealerId as string | null;
        session.user.dealerName = token.dealerName as string | null;
        session.user.verificationStatus = token.verificationStatus as
          | string
          | null;
        session.user.emailVerifiedAt = token.emailVerifiedAt as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
});
