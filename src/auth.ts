import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import {
  hasPersistedTasteState,
  readAccountTaste,
  writeAccountTaste,
} from '@/lib/accountTasteStore';
import {
  hasScorableState,
  parseTasteState,
  type AccountTasteState,
} from '@/lib/signals';

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

function tokenUser(
  token: { sub?: string; email?: string | null },
  user?: { id?: string | null; email?: string | null },
) {
  const email =
    (typeof token.email === 'string' && token.email) ||
    (typeof user?.email === 'string' && user.email) ||
    undefined;
  // Email is the only store key. token.sub / user.id stay for NextAuth, never persisted.
  return { email: email || undefined };
}

function applyTasteStateToToken(
  token: { tastes?: string; tastesSetAt?: string; tasteState?: AccountTasteState },
  state: AccountTasteState,
) {
  token.tasteState = state;
  token.tastes =
    typeof state.tastesText === 'string' ? state.tastesText : token.tastes;
  token.tastesSetAt = state.tastesSetAt ?? token.tastesSetAt;
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
    async jwt({ token, trigger, session, user }) {
      // Identity first so tokenUser() keys the store on this sign-in.
      if (user) {
        if (typeof user.email === 'string' && user.email) token.email = user.email;
        // token.sub may stay for NextAuth; it is never a store key.
        if (typeof user.id === 'string' && user.id) token.sub = user.id;
      }

      if (trigger === 'update' && session) {
        const incoming = session as {
          tastes?: string;
          tastesSetAt?: string;
          tasteState?: AccountTasteState;
          user?: {
            tastes?: string;
            tastesSetAt?: string;
            tasteState?: AccountTasteState;
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
        const toStore = parseTasteState(token.tasteState);
        if (toStore) {
          await writeAccountTaste(tokenUser(token), toStore);
        }
        return token;
      }

      const parsed = parseTasteState(token.tasteState);
      const needHydrate = Boolean(user) || !hasScorableState(parsed);
      if (needHydrate) {
        // token.email / token.sub already set from user above.
        const stored = await readAccountTaste(tokenUser(token, user));
        if (stored) applyTasteStateToToken(token, stored);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.sub === 'string') session.user.id = token.sub;
        let state = token.tasteState;
        if (!hasPersistedTasteState(state)) {
          const stored = await readAccountTaste({
            email:
              typeof token.email === 'string'
                ? token.email
                : session.user.email,
          });
          if (stored) state = stored;
        }
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
