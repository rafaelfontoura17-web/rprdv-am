// Leitor da aba RESUMO dos arquivos RPRDV.
// Funciona pelos textos do cabeçalho (não por posição fixa de coluna),
// então aceita os 4 layouts atuais: usinas grandes, Tambaqui/Jaraqui (heat rate),
// usinas pequenas (Anamã, Anori, Caapiranga, Codajás) e Manacapuru.
import ExcelJS from "exceljs";

export type Campo =
  | "inflex_mwh"
  | "disp_mw"
  | "prog_mwh"
  | "prog_mw"
  | "verif_mwh"
  | "verif_mw"
  | "flex_mwh"
  | "pv"
  | "pf"
  | "receita"
  | "desp"
  | "preco"
  | "heat_rate";

export const CAMPOS: Campo[] = [
  "inflex_mwh", "disp_mw", "prog_mwh", "prog_mw", "verif_mwh", "verif_mw",
  "flex_mwh", "pv", "pf", "receita", "desp", "preco", "heat_rate",
];

export type LinhaDia = { dia: number; dataPlanilha: string | null } & Partial<Record<Campo, number | null>>;

export type ResultadoLeitura = {
  ok: boolean;
  erro?: string;
  nomeNaPlanilha?: string | null;
  colunas: Partial<Record<Campo, string>>; // campo -> letra da coluna
  dias: LinhaDia[]; // 31 posições (dia 1..31), mesmo vazias
  diasPreenchidos: number[];
  mesesNasDatas: string[]; // "2026-10" etc. encontrados na coluna de data
};

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Ordem importa: a primeira regra que bater define o campo.
function classificar(h: string): Campo | null {
  if (!h) return null;
  if (h.includes("inflexibilidade")) return "inflex_mwh";
  if (h.includes("disponibilidade") && h.includes("mw")) return "disp_mw";
  if (h.includes("programada") && h.includes("mw/hora")) return "prog_mw";
  if (h.includes("programada") && h.includes("mwh")) return "prog_mwh";
  if (h.includes("verificada") && h.includes("mw/hora")) return "verif_mw";
  if (h.includes("verificada") && h.includes("mwh")) return "verif_mwh";
  if (h.includes("ger total dia")) return "verif_mwh";
  if (h.includes("flexivel")) return "flex_mwh";
  if (h.includes("parcela variavel")) return "pv";
  if (h.includes("parcela fixa") && !h.includes("/h")) return "pf";
  if (h.includes("receita")) return "receita";
  if (h.includes("percentual de despacho")) return "desp";
  if (h.includes("valor mwh")) return "preco";
  if (h.includes("mmbtu")) return "heat_rate";
  return null;
}

function valorCelula(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object") {
    if (v instanceof Date) return v;
    const o = v as any;
    if ("result" in o) return o.result instanceof Date ? o.result : o.result;
    if ("error" in o) return null;
    if ("richText" in o) return o.richText.map((t: any) => t.text).join("");
    if ("text" in o) return o.text;
    if ("formula" in o || "sharedFormula" in o) return null; // fórmula sem valor salvo
  }
  return v;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.replace(/\./g, "").replace(",", ".").trim();
    const n = Number(t);
    return t !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
}

function comoData(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === "number" && v > 30000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  return null;
}

const letra = (c: number) => {
  let s = "";
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
};

export async function lerRPRDV(buffer: ArrayBuffer | Buffer): Promise<ResultadoLeitura> {
  const vazio: ResultadoLeitura = { ok: false, colunas: {}, dias: [], diasPreenchidos: [], mesesNasDatas: [] };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as any);
  } catch {
    return { ...vazio, erro: "Não consegui abrir o arquivo. Confira se é um .xlsx válido." };
  }
  const ws = wb.worksheets.find((w) => norm(w.name) === "resumo");
  if (!ws) return { ...vazio, erro: "O arquivo não tem a aba RESUMO." };

  const get = (r: number, c: number) => valorCelula(ws.getRow(r).getCell(c).value);

  // 1) achar a linha de cabeçalho: a que tem "Dia" ou "Data:" nas colunas A/B
  let hr = -1;
  let colData = -1;
  for (let r = 1; r <= 10 && hr < 0; r++) {
    for (let c = 1; c <= 3; c++) {
      const t = norm(get(r, c));
      if (t === "dia" || t === "data:" || t === "data") {
        hr = r;
        colData = c;
        break;
      }
    }
  }
  if (hr < 0) return { ...vazio, erro: "Não encontrei o cabeçalho (coluna 'Dia') na aba RESUMO." };

  // nome da usina às vezes fica na linha acima (usinas pequenas)
  const nomeNaPlanilha = hr > 1 ? (String(get(hr - 1, colData) ?? "").trim() || null) : null;

  // 2) mapear colunas (linha do cabeçalho + subcabeçalho seguinte, até 25 colunas)
  const colunas: Partial<Record<Campo, number>> = {};
  for (const r of [hr, hr + 1]) {
    for (let c = colData + 1; c <= 25; c++) {
      const campo = classificar(norm(get(r, c)));
      if (campo && colunas[campo] === undefined) colunas[campo] = c;
    }
  }
  if (colunas.verif_mwh === undefined || colunas.receita === undefined) {
    return { ...vazio, erro: "Não encontrei as colunas de Geração Verificada e Receita na aba RESUMO." };
  }

  // 3) primeira linha de dados = primeira linha após o cabeçalho com data na coluna de data
  let r0 = -1;
  for (let r = hr + 1; r <= hr + 4; r++) {
    if (comoData(get(r, colData))) { r0 = r; break; }
  }
  if (r0 < 0) return { ...vazio, erro: "Não encontrei as linhas de datas na aba RESUMO." };

  // 4) ler 31 linhas; o dia é a POSIÇÃO da linha (1ª linha = dia 1), como o consolidado faz hoje
  const dias: LinhaDia[] = [];
  const meses = new Set<string>();
  for (let i = 0; i < 31; i++) {
    const r = r0 + i;
    const d = comoData(get(r, colData));
    if (d) meses.add(d.toISOString().slice(0, 7));
    const linha: LinhaDia = { dia: i + 1, dataPlanilha: d ? d.toISOString().slice(0, 10) : null };
    for (const campo of CAMPOS) {
      const c = colunas[campo];
      linha[campo] = c ? num(get(r, c)) : null;
    }
    dias.push(linha);
  }
  const diasPreenchidos = dias
    .filter((d) => (d.verif_mwh ?? 0) !== 0 || (d.receita ?? 0) !== 0)
    .map((d) => d.dia);

  const colunasLetra: Partial<Record<Campo, string>> = {};
  for (const [k, v] of Object.entries(colunas)) colunasLetra[k as Campo] = letra(v as number);

  return {
    ok: true,
    nomeNaPlanilha,
    colunas: colunasLetra,
    dias,
    diasPreenchidos,
    mesesNasDatas: [...meses].sort(),
  };
}
