import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { putPublicFile, storageConfigured } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!storageConfigured()) {
    return NextResponse.json({ error: "Image uploads not configured" }, { status: 501 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const maxSize = 4 * 1024 * 1024; // 4 MB
  if (file.size > maxSize) {
    return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 400 });
  }

  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "png";
  const path = `keep/${session.user.id}/${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const { url } = await putPublicFile(path, bytes, file.type);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 502 },
    );
  }
}
