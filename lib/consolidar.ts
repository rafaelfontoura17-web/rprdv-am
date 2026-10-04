// Regras de consolidação: replicam o arquivo "0. ... GERAL AMAZONAS" (aba Total),
// corrigindo a média das colunas MW/hora (o Excel dividia por 31 dias, inclusive os futuros).

export type Usina = {
  id: number;
  nome: string;
  ordem: number;
  tipo: "completa" | "simples"; // simples = só Geração Verificada (MWh) e Receita no e-mail
  heat_rate_texto: string | null;
};

export type Leitura = {
  usina_id: number;
  dia: number; // dia do mês
  inflex_mwh: number | null;
  disp_mw: number | null;
  prog_mwh: number | null;
  prog_mw: number | null;
  verif_mwh: number | null;
  verif_mw: number | null;
  flex_mwh: number | null;
  pv: number | null;
  pf: number | null;
  receita: number | null;
};

export type LinhaConsolidada = {
  usina_id: number | null;
  nome: string;
  tipo: "completa" | "simples" | "total";
  inflex_mwh: number | null;
  disp_mw: number | null;
  prog_mwh: number | null;
  prog_mw: number | null;
  verif_mwh: number | null;
  verif_mw: number | null;
  flex_mwh: number | null;
  pv: number | null;
  pf: number | null;
  receita: number | null;
  desp: number | null; // verificado / disponível
  ger_pdpw: number | null; // geração verificada / programada
  heat_rate_texto: string | null;
  dias_com_dado: number;
};

const soma = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
const media = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? soma(v) / v.length : null;
};
const div = (a: number | null, b: number | null) => (a !== null && b ? a / b : null);

/**
 * modo "acumulado": dias 1..ateDia (é o que vai no e-mail do Diretor)
 * modo "dia": só o dia ateDia
 */
export function consolidar(
  usinas: Usina[],
  leituras: Leitura[],
  ateDia: number,
  modo: "acumulado" | "dia" = "acumulado",
): LinhaConsolidada[] {
  const linhas: LinhaConsolidada[] = [];
  const ordenadas = [...usinas].sort((a, b) => a.ordem - b.ordem);

  for (const u of ordenadas) {
    const ls = leituras.filter(
      (l) => l.usina_id === u.id && (modo === "dia" ? l.dia === ateDia : l.dia >= 1 && l.dia <= ateDia),
    );
    const diasValidos = ls.filter((l) => (l.verif_mwh ?? 0) !== 0 || (l.receita ?? 0) !== 0);
    const completa = u.tipo === "completa";
    const pick = (f: keyof Leitura) => ls.map((l) => l[f] as number | null);
    // médias de MW/hora consideram só os dias com dado
    const pickValid = (f: keyof Leitura) => diasValidos.map((l) => l[f] as number | null);

    const linha: LinhaConsolidada = {
      usina_id: u.id,
      nome: u.nome,
      tipo: u.tipo,
      inflex_mwh: completa ? soma(pick("inflex_mwh")) : null,
      disp_mw: completa ? media(pickValid("disp_mw")) : null,
      prog_mwh: completa ? soma(pick("prog_mwh")) : null,
      prog_mw: completa ? media(pickValid("prog_mw")) : null,
      verif_mwh: soma(pick("verif_mwh")),
      verif_mw: completa ? media(pickValid("verif_mw")) : null,
      flex_mwh: completa ? soma(pick("flex_mwh")) : null,
      pv: completa ? soma(pick("pv")) : null,
      pf: completa ? soma(pick("pf")) : null,
      receita: soma(pick("receita")),
      desp: null,
      ger_pdpw: null,
      heat_rate_texto: u.heat_rate_texto,
      dias_com_dado: diasValidos.length,
    };
    if (completa) {
      linha.desp = div(linha.verif_mw, linha.disp_mw);
      linha.ger_pdpw = div(linha.verif_mwh, linha.prog_mwh);
    }
    linhas.push(linha);
  }

  const comp = linhas.filter((l) => l.tipo === "completa");
  const total: LinhaConsolidada = {
    usina_id: null,
    nome: "Total",
    tipo: "total",
    inflex_mwh: soma(comp.map((l) => l.inflex_mwh)),
    disp_mw: soma(comp.map((l) => l.disp_mw)),
    prog_mwh: soma(comp.map((l) => l.prog_mwh)),
    prog_mw: soma(comp.map((l) => l.prog_mw)),
    verif_mwh: soma(linhas.map((l) => l.verif_mwh)),
    verif_mw: soma(comp.map((l) => l.verif_mw)),
    flex_mwh: soma(comp.map((l) => l.flex_mwh)),
    pv: soma(comp.map((l) => l.pv)),
    pf: soma(comp.map((l) => l.pf)),
    receita: soma(linhas.map((l) => l.receita)),
    desp: null,
    ger_pdpw: null,
    heat_rate_texto: null,
    dias_com_dado: 0,
  };
  total.desp = div(total.verif_mw, total.disp_mw);
  // Geração/PDPW do total: só usinas com programação (no Excel o numerador incluía as pequenas)
  total.ger_pdpw = div(soma(comp.map((l) => l.verif_mwh)), total.prog_mwh);
  linhas.push(total);
  return linhas;
}
