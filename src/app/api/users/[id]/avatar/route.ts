import { del, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";

function hasBlobCredentials() {
  return !!(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

async function storeAvatar(
  userId: string,
  file: File,
  oldAvatarUrl: string | null,
): Promise<string> {
  if (hasBlobCredentials()) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const blob = await put(`users/${userId}/avatar.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    if (oldAvatarUrl?.startsWith("https://")) {
      try {
        await del(oldAvatarUrl);
      } catch {
        // Old blob may already be gone
      }
    }

    return blob.url;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTables();
    const user = await resolveSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (user.id !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
    }

    const { rows: existing } = await sql`
      SELECT avatar_url FROM users WHERE id = ${id}
    `;
    if (!existing[0]) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const avatarUrl = await storeAvatar(id, file, existing[0].avatar_url as string | null);

    const { rows } = await sql`
      UPDATE users SET avatar_url = ${avatarUrl}
      WHERE id = ${id}
      RETURNING id, email, name, avatar_url
    `;

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
