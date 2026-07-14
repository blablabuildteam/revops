import { del, put } from "@vercel/blob";

export function hasBlobCredentials() {
  return !!(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

export async function storeFile(path: string, file: File): Promise<string> {
  if (hasBlobCredentials()) {
    const blob = await put(path, file, {
      access: "public",
      addRandomSuffix: true,
    });
    return blob.url;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type || "application/octet-stream"};base64,${buffer.toString("base64")}`;
}

export async function deleteStoredFile(url: string) {
  if (url.startsWith("https://")) {
    try {
      await del(url);
    } catch {
      // File may already be gone
    }
  }
}
