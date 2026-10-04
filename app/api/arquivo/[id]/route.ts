import { NextRequest, NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { lerArquivo } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "Sessão expirada" }, { status: 401 });
  const { id } = await ctx.params;
  const e = await q1<{ usina_id: number; arquivo_nome: string; arquivo_url: string }>(
    "select usina_id, arquivo_nome, arquivo_url from envios where id = $1",
    [Number(id)],
  );
  if (!e) return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  if (s.papel === "usina" && s.usina_id !== e.usina_id) return NextResponse.json({ erro: "Sem acesso" }, { status: 403 });
  const dados = await lerArquivo(e.arquivo_url);
  return new NextResponse(new Uint8Array(dados), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(e.arquivo_nome)}`,
    },
  });
}
