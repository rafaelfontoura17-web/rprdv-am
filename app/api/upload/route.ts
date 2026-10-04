import { NextRequest, NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/auth";
import { lerRPRDV } from "@/lib/parser";
import { gravarEnvio, todasUsinas, validar } from "@/lib/servico";
import { salvarArquivo } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "Sessão expirada. Entre novamente." }, { status: 401 });

  const form = await req.formData();
  const arquivo = form.get("arquivo");
  const usinaId = Number(form.get("usina_id"));
  const ano = Number(form.get("ano"));
  const mes = Number(form.get("mes"));
  const confirmar = form.get("confirmar") === "1";

  if (!(arquivo instanceof File)) return NextResponse.json({ erro: "Selecione o arquivo." }, { status: 400 });
  if (!arquivo.name.toLowerCase().endsWith(".xlsx"))
    return NextResponse.json({ erro: "O arquivo precisa ser .xlsx." }, { status: 400 });
  if (arquivo.size > 4 * 1024 * 1024) return NextResponse.json({ erro: "Arquivo maior que 4 MB." }, { status: 400 });
  if (!ano || mes < 1 || mes > 12) return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });

  if (s.papel === "usina" && s.usina_id !== usinaId)
    return NextResponse.json({ erro: "Você só pode enviar o arquivo da sua usina." }, { status: 403 });

  const usina = (await todasUsinas()).find((u) => u.id === usinaId && u.ativo);
  if (!usina) return NextResponse.json({ erro: "Usina não encontrada." }, { status: 400 });

  const buf = Buffer.from(await arquivo.arrayBuffer());
  const leitura = await lerRPRDV(buf);
  const avisos = await validar(usina, ano, mes, arquivo.name, leitura);
  const temErro = avisos.some((a) => a.nivel === "erro");

  const preview = leitura.ok
    ? leitura.dias
        .filter((d) => leitura.diasPreenchidos.includes(d.dia))
        .map((d) => ({ dia: d.dia, verif_mwh: d.verif_mwh, receita: d.receita, desp: d.desp, prog_mwh: d.prog_mwh }))
    : [];

  if (!confirmar || temErro) {
    return NextResponse.json({ ok: !temErro, gravado: false, avisos, preview, colunas: leitura.colunas });
  }

  const url = await salvarArquivo(arquivo.name, buf);
  const envioId = await gravarEnvio({
    usina, ano, mes, nomeArquivo: arquivo.name, url, tamanho: arquivo.size, usuarioId: s.id, r: leitura, avisos,
  });
  return NextResponse.json({ ok: true, gravado: true, envioId, avisos, preview });
}
