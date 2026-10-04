import { NextRequest, NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/auth";
import { lerConfigEmail, q, q1 } from "@/lib/db";
import { assuntoEmail, corpoEmail, enviarResend, listaEmails } from "@/lib/email";
import { excelConsolidado, montarConsolidado } from "@/lib/relatorio";
import { statusDoDia, ultimosArquivos } from "@/lib/servico";
import { lerArquivo } from "@/lib/storage";
import { partes } from "@/lib/datas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const s = await sessaoAtual();
  if (!s || !["admin", "gerente"].includes(s.papel))
    return NextResponse.json({ erro: "Apenas o gerente ou o administrador podem enviar." }, { status: 403 });

  const { data_ref, confirmar_pendencias, confirmar_reenvio } = await req.json();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data_ref ?? "")) return NextResponse.json({ erro: "Data inválida." }, { status: 400 });

  const cfg = await lerConfigEmail();
  const para = listaEmails(cfg.para);
  const cc = listaEmails(cfg.cc);
  if (!para.length) return NextResponse.json({ erro: "Configure o destinatário em Administração → E-mail." }, { status: 400 });

  const status = await statusDoDia(data_ref);
  const pendentes = status.filter((x) => !x.temDia).map((x) => x.usina.nome);
  if (pendentes.length && !confirmar_pendencias)
    return NextResponse.json({ precisaConfirmar: "pendencias", pendentes }, { status: 409 });

  const ja = await q1<{ enviado_em: string; nome: string }>(
    `select c.enviado_em, u.nome from consolidacoes c left join usuarios u on u.id = c.enviado_por
      where c.data_ref = $1 and c.status = 'enviado' order by c.enviado_em desc limit 1`,
    [data_ref],
  );
  if (ja && !confirmar_reenvio)
    return NextResponse.json({ precisaConfirmar: "reenvio", enviadoEm: ja.enviado_em, por: ja.nome }, { status: 409 });

  const linhas = await montarConsolidado(data_ref, "acumulado");
  const anexos: { filename: string; content: string }[] = [];
  if (cfg.anexar_arquivos) {
    const { ano, mes } = partes(data_ref);
    const geral = await excelConsolidado(data_ref);
    anexos.push({ filename: geral.nome, content: geral.dados.toString("base64") });
    for (const a of await ultimosArquivos(ano, mes)) {
      try {
        anexos.push({ filename: a.arquivo_nome, content: (await lerArquivo(a.arquivo_url)).toString("base64") });
      } catch {
        /* segue sem o anexo */
      }
    }
  }
  const assunto = assuntoEmail(data_ref);
  const html = corpoEmail(linhas, data_ref, cfg, anexos.length > 0);
  const r = await enviarResend({ para, cc, assunto, html, anexos, remetenteNome: cfg.remetente_nome });

  await q(
    `insert into consolidacoes(data_ref, enviado_por, para, cc, assunto, html, snapshot, status, detalhe)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      data_ref, s.id, para.join("; "), cc.join("; "), assunto, html,
      JSON.stringify({ linhas, pendentes, anexos: anexos.map((a) => a.filename) }),
      r.ok ? "enviado" : "falhou", r.ok ? r.id : r.erro,
    ],
  );
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });
  return NextResponse.json({ ok: true, para, cc, anexos: anexos.length });
}
