import { NextRequest, NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/auth";
import { excelConsolidado } from "@/lib/relatorio";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await sessaoAtual();
  if (!s || !["admin", "gerente"].includes(s.papel)) return NextResponse.json({ erro: "Sem acesso" }, { status: 403 });
  const data = req.nextUrl.searchParams.get("data") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ erro: "Data inválida" }, { status: 400 });
  const { nome, dados } = await excelConsolidado(data);
  return new NextResponse(new Uint8Array(dados), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
    },
  });
}
