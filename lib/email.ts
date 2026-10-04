import type { LinhaConsolidada } from "./consolidar";
import { ConfigEmail } from "./db";
import { ddmm, fmtNum, fmtPct, MESES, partes } from "./datas";

const COR = {
  verde: "#92D050",
  laranja: "#FFC000",
  azul: "#45B0E1",
  rosa: "#F2CEEF",
  pessego: "#F8CBAD",
  salmao: "#F4B084",
  cinza: "#D9D9D9",
  amarelo: "#FFFF00",
};

type Col = { titulo: string; unid: string; cor: string; v: (l: LinhaConsolidada) => string };

export function colunasEmail(rotuloHR: string): Col[] {
  return [
    { titulo: "Inflexibilidade informada ao ONS", unid: "(MWh)", cor: COR.verde, v: (l) => fmtNum(l.inflex_mwh) },
    { titulo: "Disponibilidade informada ao ONS", unid: "(MW/hora)", cor: COR.verde, v: (l) => fmtNum(l.disp_mw) },
    { titulo: "Geração Programada", unid: "(MWh)", cor: COR.verde, v: (l) => fmtNum(l.prog_mwh) },
    { titulo: "Geração Programada", unid: "(MW/hora)", cor: COR.verde, v: (l) => fmtNum(l.prog_mw) },
    { titulo: "Geração Total Verificada", unid: "(MWh)", cor: COR.laranja, v: (l) => fmtNum(l.verif_mwh) },
    { titulo: "Geração Total Verificada", unid: "(MW/hora)", cor: COR.laranja, v: (l) => fmtNum(l.verif_mw) },
    { titulo: "Geração Flexível", unid: "(MWh)", cor: COR.laranja, v: (l) => fmtNum(l.flex_mwh) },
    { titulo: "Parcela Variável", unid: "(R$)", cor: COR.laranja, v: (l) => fmtNum(l.pv) },
    { titulo: "Parcela Fixa", unid: "(R$)", cor: COR.laranja, v: (l) => fmtNum(l.pf) },
    { titulo: "Receita", unid: "(R$)", cor: COR.azul, v: (l) => fmtNum(l.receita) },
    { titulo: "Percentual de Despacho - verificado/disponível", unid: "(%)", cor: COR.rosa, v: (l) => fmtPct(l.desp) },
    { titulo: "Geração Bruta realizada / PDPW", unid: "(%)", cor: COR.pessego, v: (l) => fmtPct(l.ger_pdpw) },
    { titulo: rotuloHR, unid: "", cor: COR.salmao, v: (l) => l.heat_rate_texto ?? "" },
  ];
}

export function assuntoEmail(dataRef: string) {
  const { ano, mes } = partes(dataRef);
  return `Totalização da receita diária de venda de energia de ${MESES[mes - 1]} ${ano}`;
}

export function tabelaHtml(linhas: LinhaConsolidada[], dataRef: string, cfg: ConfigEmail) {
  const { ano, mes } = partes(dataRef);
  const mesTxt = `${MESES[mes - 1].slice(0, 3).toLowerCase()}-${String(ano).slice(2)}`;
  const cols = colunasEmail(cfg.heat_rate_rotulo);
  const td = "border:1px solid #7f7f7f;padding:2px 6px;font-family:Calibri,Arial,sans-serif;font-size:11pt;";
  const th = td + "font-weight:normal;font-size:9pt;text-align:center;vertical-align:middle;";
  let h = `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;">`;
  h += `<tr><th style="${th}background:${COR.verde};min-width:110px">Usina</th><th style="${th}background:${COR.verde}">Dia</th>`;
  for (const c of cols) h += `<th style="${th}background:${c.cor};width:95px">${c.titulo}<br>${c.unid}</th>`;
  h += `</tr>`;
  for (const l of linhas) {
    const total = l.tipo === "total";
    const bgNome = total ? COR.amarelo : COR.cinza;
    h += `<tr>`;
    h += `<td style="${td}background:${bgNome};font-weight:bold;text-align:center;white-space:nowrap">${l.nome}</td>`;
    h += `<td style="${td}background:${bgNome};text-align:center;white-space:nowrap">${total ? "" : mesTxt}</td>`;
    for (const c of cols) {
      let bg = total ? COR.amarelo : c.cor === COR.azul ? COR.azul : c.cor === COR.rosa ? COR.rosa : c.cor === COR.pessego ? COR.pessego : c.cor === COR.salmao ? COR.salmao : "#FFFFFF";
      if (total && c.cor === COR.salmao) bg = "#FFFFFF";
      const negrito = c.titulo === "Receita" || total ? "font-weight:bold;" : "";
      h += `<td style="${td}background:${bg};text-align:right;white-space:nowrap;${negrito}">${c.v(l)}</td>`;
    }
    h += `</tr>`;
  }
  h += `</table>`;
  return h;
}

export function corpoEmail(linhas: LinhaConsolidada[], dataRef: string, cfg: ConfigEmail, comAnexos: boolean) {
  const p = "font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 4px 0;";
  return `<div>
<p style="${p}">${escapar(cfg.saudacao)}</p>
<p style="${p}">Segue o total das receitas das usinas do Amazonas até ontem (${ddmm(dataRef)}).</p>
${comAnexos ? `<p style="${p}">Segue ainda em anexo os RPRDV de cada usina.</p>` : ""}
<br>
${tabelaHtml(linhas, dataRef, cfg)}
</div>`;
}

export function escapar(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export const listaEmails = (s: string) =>
  s.split(/[;,\s]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));

export async function enviarResend(opts: {
  para: string[];
  cc: string[];
  assunto: string;
  html: string;
  anexos: { filename: string; content: string }[];
  remetenteNome: string;
}): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM; // ex.: rprdv@seudominio.com.br (domínio validado no Resend)
  if (!key || !from) return { ok: false, erro: "Envio de e-mail não configurado (RESEND_API_KEY / EMAIL_FROM)." };
  let r: Response;
  try {
    r = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${opts.remetenteNome} <${from}>`,
      to: opts.para,
      cc: opts.cc.length ? opts.cc : undefined,
      subject: opts.assunto,
      html: opts.html,
      attachments: opts.anexos.length ? opts.anexos : undefined,
    }),
    });
  } catch (e: any) {
    return { ok: false, erro: "Não foi possível conectar ao serviço de e-mail: " + (e?.cause?.code || e?.message || "erro de rede") };
  }
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, erro: j?.message || `Resend respondeu ${r.status}` };
  return { ok: true, id: j.id };
}

export const emailConfigurado = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
