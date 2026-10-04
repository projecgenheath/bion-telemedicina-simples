import "server-only";
import { createSupabaseAdminClient } from "./server";

export const BUCKET_DOCUMENTOS = "documentos";
export const BUCKET_AVATARES = "avatares";

/** Garante buckets públicos/privados (idempotente). */
export async function garantirBuckets() {
  const admin = createSupabaseAdminClient();
  const { data: list } = await admin.storage.listBuckets();
  const nomes = new Set((list ?? []).map((b) => b.name));
  if (!nomes.has(BUCKET_DOCUMENTOS)) {
    await admin.storage.createBucket(BUCKET_DOCUMENTOS, {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024,
    });
  }
  if (!nomes.has(BUCKET_AVATARES)) {
    await admin.storage.createBucket(BUCKET_AVATARES, {
      public: true,
      fileSizeLimit: 2 * 1024 * 1024,
    });
  }
}

/**
 * Upload de arquivo clínico (privado). path: `{userId}/{nome}`.
 * Devolve path no bucket (não URL pública).
 */
export async function uploadDocumento(
  userId: string,
  nomeArquivo: string,
  body: Blob | ArrayBuffer | Buffer,
  contentType: string,
): Promise<{ path: string }> {
  const admin = createSupabaseAdminClient();
  const seguro = nomeArquivo.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const path = `${userId}/${Date.now()}-${seguro}`;
  const { error } = await admin.storage.from(BUCKET_DOCUMENTOS).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return { path };
}

/** URL assinada (download temporário). */
export async function urlAssinadaDocumento(path: string, expiresSec = 3600) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(path, expiresSec);
  if (error) throw error;
  return data.signedUrl;
}

/** Remove um arquivo do bucket privado (ex.: comprovante de um pagamento recusado). */
export async function removerDocumento(path: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(BUCKET_DOCUMENTOS).remove([path]);
  if (error) throw error;
}
