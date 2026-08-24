import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

/** True when Google OAuth env vars are present (no secrets invented). */
export const isGoogleAuthConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  trustHost: true,
  providers: isGoogleAuthConfigured
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        }),
      ]
    : [],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, trigger, session }) {
      if (trigger === 'update' && session) {
        const incoming = session as {
          tastes?: string;
          tastesSetAt?: string;
          user?: { tastes?: string; tastesSetAt?: string };
        };
        const tastes =
          typeof incoming.tastes === 'string'
            ? incoming.tastes
            : typeof incoming.user?.tastes === 'string'
              ? incoming.user.tastes
              : undefined;
        if (typeof tastes === 'string') {
          token.tastes = tastes;
          token.tastesSetAt =
            incoming.tastesSetAt ??
            incoming.user?.tastesSetAt ??
            new Date().toISOString();
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.tastes =
          typeof token.tastes === 'string' ? token.tastes : '';
        session.user.tastesSetAt =
          typeof token.tastesSetAt === 'string' ? token.tastesSetAt : undefined;
      }
      return session;
    },
  },
});
