import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/adminGate';
import { readFeedbackImageForAdmin } from '@/lib/feedbackStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};

/** GET /api/admin/feedback/:id/image — admin session only. Anyone else → 404. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminSession())) {
    return new NextResponse(null, { status: 404, headers: PRIVATE });
  }
  const { id } = await params;
  try {
    const image = await readFeedbackImageForAdmin(id);
    if (!image) return new NextResponse(null, { status: 404, headers: PRIVATE });
    return new NextResponse(Buffer.from(image.bytes), {
      status: 200,
      headers: {
        ...PRIVATE,
        'Content-Type': image.mime,
        'Content-Disposition': 'inline',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404, headers: PRIVATE });
  }
}
