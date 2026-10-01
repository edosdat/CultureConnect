import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/adminGate';
import { listFeedbackForAdmin } from '@/lib/feedbackStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
};

/** GET /api/admin/feedback — admin session only. Anyone else → 404. */
export async function GET() {
  if (!(await isAdminSession())) {
    return new NextResponse(null, { status: 404, headers: PRIVATE });
  }
  try {
    const notes = await listFeedbackForAdmin();
    return NextResponse.json({ notes }, { headers: PRIVATE });
  } catch {
    return NextResponse.json(
      { error: 'Lecture indisponible' },
      { status: 503, headers: PRIVATE },
    );
  }
}
