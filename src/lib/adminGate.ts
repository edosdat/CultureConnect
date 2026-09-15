/**
 * Admin namespace gate. Session email only — same lock as the home counter.
 * Never a query param. Covers every `/admin/*` page via `app/admin/layout.tsx`.
 * Route handlers under `/admin` must call this too (layouts do not wrap them).
 */
import 'server-only';
import { auth } from '@/auth';
import { showHomeEventsCounter } from '@/lib/homeEventsCounter';

export async function isAdminSession(): Promise<boolean> {
  const session = await auth();
  return showHomeEventsCounter(session?.user?.email);
}
