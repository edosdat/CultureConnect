import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const ALLOWED = new Set(["cine.jpg", "theatre.jpg", "musique.jpg"]);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ file: string }> },
) {
  const { file } = await ctx.params;
  if (!ALLOWED.has(file)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const buf = await readFile(join(process.cwd(), "public", "mail", file));
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
