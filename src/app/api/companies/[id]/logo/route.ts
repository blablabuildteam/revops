import { del, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

function hasBlobCredentials() {
  return !!(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

async function storeLogo(
  companyId: string,
  file: File,
  oldLogoUrl: string | null,
): Promise<string> {
  if (hasBlobCredentials()) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const blob = await put(`companies/${companyId}/logo.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    if (oldLogoUrl?.startsWith("https://")) {
      try {
        await del(oldLogoUrl);
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
    const { id } = await params;

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
      SELECT logo_url FROM companies WHERE id = ${id}
    `;
    if (!existing[0]) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const logoUrl = await storeLogo(id, file, existing[0].logo_url as string | null);

    const { rows } = await sql`
      UPDATE companies SET logo_url = ${logoUrl}, updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
