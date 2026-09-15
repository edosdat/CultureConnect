/**
 * Admin namespace gate. Session email only — same `ADMIN_EMAILS` lock as
 * the home counter and the avatar « Analytics / Admin » menu.
 * Never a query param. Covers every `/admin/*` page via `app/admin/layout.tsx`.
 * Route handlers under `/admin` must call this too (layouts do not wrap them).
 * Anyone else → fail closed (404).
 */
import 'server-only';
import { auth } from '@/auth';
import { showHomeEventsCounter } from '@/lib/homeEventsCounter';

export async function isAdminSession(): Promise<boolean> {
  const session = await auth();
  return showHomeEventsCounter(session?.user?.email);
}
