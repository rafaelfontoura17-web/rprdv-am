// Guarda os Excel originais. Em produção usa o Vercel Blob; em desenvolvimento, uma pasta local.
import { put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const LOCAL_DIR = process.env.LOCAL_STORAGE_DIR || "/var/tmp/rprdv-arquivos";

export async function salvarArquivo(nomeOriginal: string, dados: Buffer): Promise<string> {
  const seguro = nomeOriginal.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\- ]+/g, "_");
  const chave = `rprdv/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${seguro}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const r = await put(chave, dados, {
      access: "public", // URL com sufixo aleatório; o portal nunca expõe a URL, só baixa via /api/arquivo
      addRandomSuffix: true,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return r.url;
  }
  const destino = path.join(LOCAL_DIR, chave);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, dados);
  return "local:" + chave;
}

export async function lerArquivo(url: string): Promise<Buffer> {
  if (url.startsWith("local:")) return readFile(path.join(LOCAL_DIR, url.slice(6)));
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("Falha ao baixar arquivo armazenado");
  return Buffer.from(await r.arrayBuffer());
}
