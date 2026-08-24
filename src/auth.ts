import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

/**
 * Read Google OAuth credentials at runtime.
 * Use bracket access so Next.js does not inline empty values at build time.
 * Accepts Auth.js names + Google Cloud / legacy aliases.
 */
export function googleClientId(): string {
  const env = process.env;
  return (
    env['AUTH_GOOGLE_ID'] ||
    env['GOOGLE_CLIENT_ID'] ||
    env['AUTH_GOOGLE_CLIENT_ID'] ||
    ''
  ).trim();
}

export function googleClientSecret(): string {
  const env = process.env;
  return (
    env['AUTH_GOOGLE_SECRET'] ||
    env['GOOGLE_CLIENT_SECRET'] ||
    env['AUTH_GOOGLE_CLIENT_SECRET'] ||
    ''
  ).trim();
}

/** Per-request / cold-start check — never a baked module const for UI. */
export function isGoogleAuthConfigured(): boolean {
  return Boolean(googleClientId() && googleClientSecret());
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  trustHost: true,
  // Always register Google; credentials resolved when the module loads on the server
  // (Vercel cold start has Production env). Empty id → provider unused / providers API empty.
  providers: [
    Google({
      clientId: googleClientId(),
      clientSecret: googleClientSecret(),
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, trigger, session }) {
      if (trigger === 'update' && session) {
        const incoming = session as {
          tastes?: string;
          tastesSetAt?: string;
          tasteState?: import('@/lib/signals').AccountTasteState;
          user?: {
            tastes?: string;
            tastesSetAt?: string;
            tasteState?: import('@/lib/signals').AccountTasteState;
          };
        };
        const tasteState = incoming.tasteState ?? incoming.user?.tasteState;
        if (tasteState && typeof tasteState === 'object') {
          token.tasteState = tasteState;
          token.tastes =
            typeof tasteState.tastesText === 'string'
              ? tasteState.tastesText
              : token.tastes;
          token.tastesSetAt = tasteState.tastesSetAt ?? token.tastesSetAt;
        } else {
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
            const prev = token.tasteState;
            token.tasteState = {
              signalsRecent: prev?.signalsRecent ?? [],
              profile: prev?.profile ?? { cats: {}, genres: {}, moods: {}, communes: {} },
              tastesText: tastes,
              tastesSetAt: token.tastesSetAt,
            };
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const state = token.tasteState;
        session.user.tasteState = state;
        session.user.tastes =
          (state && typeof state.tastesText === 'string' && state.tastesText) ||
          (typeof token.tastes === 'string' ? token.tastes : '');
        session.user.tastesSetAt =
          (state && state.tastesSetAt) ||
          (typeof token.tastesSetAt === 'string' ? token.tastesSetAt : undefined);
      }
      return session;
    },
  },
});
