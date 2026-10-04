import { q, q1 } from "./db";
import type { Leitura, Usina } from "./consolidar";
import type { ResultadoLeitura } from "./parser";
import { ddmm, diasNoMes, fmtNum, isoDe, MESES, ontemManaus, partes, semAcento } from "./datas";

export type UsinaDB = Usina & { chave_arquivo: string | null; ativo: boolean };
export type Aviso = { nivel: "erro" | "alerta" | "info"; msg: string };

export async function usinasAtivas(): Promise<UsinaDB[]> {
  return q<UsinaDB>("select * from usinas where ativo order by ordem, id");
}

export async function todasUsinas(): Promise<UsinaDB[]> {
  return q<UsinaDB>("select * from usinas order by ordem, id");
}

export async function leiturasMes(ano: number, mes: number): Promise<Leitura[]> {
  const ini = isoDe(ano, mes, 1);
  const fim = isoDe(ano, mes, diasNoMes(ano, mes));
  const rows = await q<any>(
    `select usina_id, extract(day from data)::int as dia, inflex_mwh, disp_mw, prog_mwh, prog_mw,
            verif_mwh, verif_mw, flex_mwh, pv, pf, receita
       from leituras where data between $1 and $2`,
    [ini, fim],
  );
  return rows;
}

export type StatusUsina = {
  usina: UsinaDB;
  ultimoEnvio: { id: number; enviado_em: string; arquivo_nome: string; enviado_por_nome: string | null; avisos: Aviso[]; dias_preenchidos: number[] } | null;
  temDia: boolean;
};

export async function statusDoDia(dataRef: string): Promise<StatusUsina[]> {
  const { ano, mes } = partes(dataRef);
  const usinas = await usinasAtivas();
  const envios = await q<any>(
    `select distinct on (e.usina_id) e.id, e.usina_id, e.enviado_em, e.arquivo_nome, e.avisos, e.dias_preenchidos, u.nome as enviado_por_nome
       from envios e left join usuarios u on u.id = e.enviado_por
      where e.ano = $1 and e.mes = $2
      order by e.usina_id, e.enviado_em desc`,
    [ano, mes],
  );
  const comDia = await q<{ usina_id: number }>(
    "select usina_id from leituras where data = $1 and (coalesce(verif_mwh,0) <> 0 or coalesce(receita,0) <> 0)",
    [dataRef],
  );
  const set = new Set(comDia.map((r) => r.usina_id));
  return usinas.map((u) => ({
    usina: u,
    ultimoEnvio: envios.find((e) => e.usina_id === u.id) ?? null,
    temDia: set.has(u.id),
  }));
}

/** Validações do arquivo antes de gravar */
export async function validar(
  usina: UsinaDB,
  ano: number,
  mes: number,
  nomeArquivo: string,
  r: ResultadoLeitura,
): Promise<Aviso[]> {
  const avisos: Aviso[] = [];
  if (!r.ok) return [{ nivel: "erro", msg: r.erro || "Não foi possível ler o arquivo." }];

  // 1) arquivo da usina certa?
  const nomeNorm = semAcento(nomeArquivo).replace(/[_\-.]+/g, " ");
  const todas = await todasUsinas();
  const chave = (u: UsinaDB) => semAcento(u.chave_arquivo || u.nome.replace(/^UTE\s+/i, ""));
  const bateCerta = nomeNorm.includes(chave(usina));
  const outra = todas.find((u) => u.id !== usina.id && nomeNorm.includes(chave(u)));
  if (!bateCerta && outra) {
    avisos.push({ nivel: "erro", msg: `O nome do arquivo indica ${outra.nome}, mas o envio é para ${usina.nome}. Confira se escolheu o arquivo certo.` });
  } else if (!bateCerta) {
    avisos.push({ nivel: "alerta", msg: `O nome do arquivo não menciona ${usina.nome}. Confira se é o arquivo certo.` });
  }
  if (!semAcento(nomeArquivo).includes(MESES[mes - 1].normalize("NFD").replace(/[̀-ͯ]/g, ""))) {
    avisos.push({ nivel: "alerta", msg: `O nome do arquivo não menciona ${MESES[mes - 1]}.` });
  }

  // 2) mês das datas na aba RESUMO
  const mesAlvo = `${ano}-${String(mes).padStart(2, "0")}`;
  if (r.mesesNasDatas.length && !r.mesesNasDatas.includes(mesAlvo)) {
    const [aa, mm] = r.mesesNasDatas[0].split("-").map(Number);
    avisos.push({
      nivel: "alerta",
      msg: `As datas da aba RESUMO estão em ${MESES[mm - 1].toLowerCase()}/${aa}. Os valores foram lidos pela posição da linha (1ª linha = dia 1), como o consolidado faz hoje. Vale corrigir as datas na planilha.`,
    });
  }

  // 3) dias preenchidos
  const ultimoDiaMes = diasNoMes(ano, mes);
  const dias = r.diasPreenchidos.filter((d) => d <= ultimoDiaMes);
  if (!dias.length) {
    avisos.push({ nivel: "erro", msg: "Nenhum dia preenchido na aba RESUMO (geração e receita estão zeradas)." });
    return avisos;
  }
  const max = Math.max(...dias);
  const faltando = [];
  for (let d = 1; d <= max; d++) if (!dias.includes(d)) faltando.push(d);
  if (faltando.length) avisos.push({ nivel: "alerta", msg: `Dias sem dado no meio do mês: ${faltando.join(", ")}.` });

  const ontem = ontemManaus();
  const o = partes(ontem);
  if (o.ano === ano && o.mes === mes) {
    if (!dias.includes(o.dia)) avisos.push({ nivel: "alerta", msg: `O dia de ontem (${ddmm(ontem)}) não está preenchido.` });
    const futuros = dias.filter((d) => d > o.dia);
    if (futuros.length) avisos.push({ nivel: "alerta", msg: `Há dados em dias que ainda não aconteceram: ${futuros.join(", ")}.` });
  }

  // 4) valores estranhos
  for (const d of r.dias.filter((x) => dias.includes(x.dia))) {
    const negativos = (["verif_mwh", "receita", "pv", "pf", "prog_mwh"] as const).filter((k) => (d[k] ?? 0) < 0);
    if (negativos.length) avisos.push({ nivel: "alerta", msg: `Dia ${d.dia}: valor negativo em ${negativos.join(", ")}.` });
    if (d.desp !== null && d.desp !== undefined && d.desp > 1.2)
      avisos.push({ nivel: "alerta", msg: `Dia ${d.dia}: percentual de despacho de ${fmtNum(d.desp * 100, 1)}%, acima de 120%.` });
  }
  const ult = r.dias.find((x) => x.dia === max)!;
  const anteriores = r.dias.filter((x) => dias.includes(x.dia) && x.dia < max && (x.verif_mwh ?? 0) > 0);
  if (anteriores.length >= 2 && (ult.verif_mwh ?? 0) > 0) {
    const media = anteriores.reduce((a, b) => a + (b.verif_mwh ?? 0), 0) / anteriores.length;
    const desvio = (ult.verif_mwh! - media) / media;
    if (Math.abs(desvio) > 0.4)
      avisos.push({
        nivel: "alerta",
        msg: `Dia ${max}: geração verificada (${fmtNum(ult.verif_mwh)} MWh) está ${desvio > 0 ? "+" : ""}${fmtNum(desvio * 100, 0)}% em relação à média dos dias anteriores (${fmtNum(media)} MWh).`,
      });
  }

  // 5) mudanças em dias já enviados antes
  const antes = await q<any>(
    `select extract(day from data)::int dia, verif_mwh, receita from leituras
      where usina_id = $1 and data between $2 and $3`,
    [usina.id, isoDe(ano, mes, 1), isoDe(ano, mes, ultimoDiaMes)],
  );
  const mudou: string[] = [];
  for (const a of antes) {
    const novo = r.dias.find((x) => x.dia === a.dia);
    if (!novo) continue;
    const dv = Math.abs((novo.verif_mwh ?? 0) - (a.verif_mwh ?? 0));
    const dr = Math.abs((novo.receita ?? 0) - (a.receita ?? 0));
    if (dv > 0.005 || dr > 0.05) mudou.push(`dia ${a.dia} (receita R$ ${fmtNum(a.receita)} → R$ ${fmtNum(novo.receita ?? 0)})`);
  }
  if (mudou.length) avisos.push({ nivel: "info", msg: `Este arquivo altera valores já enviados: ${mudou.join("; ")}.` });

  return avisos;
}

export async function gravarEnvio(opts: {
  usina: UsinaDB;
  ano: number;
  mes: number;
  nomeArquivo: string;
  url: string;
  tamanho: number;
  usuarioId: number;
  r: ResultadoLeitura;
  avisos: Aviso[];
}) {
  const { usina, ano, mes, r } = opts;
  const ultimo = diasNoMes(ano, mes);
  const dias = r.diasPreenchidos.filter((d) => d <= ultimo);
  const envio = await q1<{ id: number }>(
    `insert into envios(usina_id, ano, mes, arquivo_nome, arquivo_url, arquivo_tamanho, enviado_por, dias_preenchidos, avisos)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [usina.id, ano, mes, opts.nomeArquivo, opts.url, opts.tamanho, opts.usuarioId, dias, JSON.stringify(opts.avisos)],
  );
  // o arquivo mais recente é a verdade do mês: remove dias que deixaram de estar preenchidos
  await q(
    `delete from leituras where usina_id = $1 and data between $2 and $3 and not (extract(day from data)::int = any($4::int[]))`,
    [usina.id, isoDe(ano, mes, 1), isoDe(ano, mes, ultimo), dias],
  );
  for (const d of r.dias.filter((x) => dias.includes(x.dia))) {
    await q(
      `insert into leituras(usina_id, data, envio_id, inflex_mwh, disp_mw, prog_mwh, prog_mw, verif_mwh, verif_mw,
                            flex_mwh, pv, pf, receita, desp, preco, heat_rate, atualizado_em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
       on conflict (usina_id, data) do update set
         envio_id=excluded.envio_id, inflex_mwh=excluded.inflex_mwh, disp_mw=excluded.disp_mw, prog_mwh=excluded.prog_mwh,
         prog_mw=excluded.prog_mw, verif_mwh=excluded.verif_mwh, verif_mw=excluded.verif_mw, flex_mwh=excluded.flex_mwh,
         pv=excluded.pv, pf=excluded.pf, receita=excluded.receita, desp=excluded.desp, preco=excluded.preco,
         heat_rate=excluded.heat_rate, atualizado_em=now()`,
      [
        usina.id, isoDe(ano, mes, d.dia), envio!.id, d.inflex_mwh, d.disp_mw, d.prog_mwh, d.prog_mw, d.verif_mwh,
        d.verif_mw, d.flex_mwh, d.pv, d.pf, d.receita, d.desp, d.preco, d.heat_rate,
      ],
    );
  }
  return envio!.id;
}

/** Último arquivo enviado por usina no mês (para anexar no e-mail) */
export async function ultimosArquivos(ano: number, mes: number) {
  return q<{ usina_id: number; arquivo_nome: string; arquivo_url: string; ordem: number }>(
    `select * from (
       select distinct on (e.usina_id) e.usina_id, e.arquivo_nome, e.arquivo_url, s.ordem
         from envios e join usinas s on s.id = e.usina_id
        where e.ano = $1 and e.mes = $2 and s.ativo
        order by e.usina_id, e.enviado_em desc) t
     order by ordem`,
    [ano, mes],
  );
}
