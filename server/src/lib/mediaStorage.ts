import { promises as fs } from "fs";
import path from "path";
import { env } from "../config/env";

const STORAGE_DIR = path.join(process.cwd(), "storage", "media");

// Local-disk stub for media storage. Swap this module for an S3/GCS/Blob
// upload once a cloud provider is chosen - callers only depend on getting a
// URL back, not on how/where the bytes are kept.
export async function storeMediaBuffer(messageId: string, buffer: Buffer, mimeType: string): Promise<string> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const ext = mimeType.split("/")[1]?.split(";")[0] ?? "bin";
  const filename = `${messageId}.${ext}`;
  await fs.writeFile(path.join(STORAGE_DIR, filename), buffer);
  return `${env.appBaseUrl}/media/${filename}`;
}

export async function readMediaBufferByUrl(storageUrl: string): Promise<Buffer> {
  const filename = storageUrl.split("/media/")[1];
  if (!filename) throw new Error("Unbekannte Media-URL");
  return fs.readFile(path.join(STORAGE_DIR, filename));
}
