import ExcelJS from "exceljs";
import { consolidar, LinhaConsolidada } from "./consolidar";
import { lerConfigEmail } from "./db";
import { MESES, partes } from "./datas";
import { leiturasMes, usinasAtivas } from "./servico";
import { colunasEmail } from "./email";

export async function montarConsolidado(dataRef: string, modo: "acumulado" | "dia" = "acumulado") {
  const { ano, mes, dia } = partes(dataRef);
  const [usinas, leituras] = await Promise.all([usinasAtivas(), leiturasMes(ano, mes)]);
  return consolidar(usinas, leituras, dia, modo);
}

/** Gera o equivalente ao arquivo "0. ... GERAL AMAZONAS": aba Total (acumulado) + uma aba por dia */
export async function excelConsolidado(dataRef: string): Promise<{ nome: string; dados: Buffer }> {
  const { ano, mes, dia } = partes(dataRef);
  const [usinas, leituras, cfg] = await Promise.all([usinasAtivas(), leiturasMes(ano, mes), lerConfigEmail()]);
  const wb = new ExcelJS.Workbook();
  const cols = colunasEmail(cfg.heat_rate_rotulo);

  const aba = (nome: string, linhas: LinhaConsolidada[], rotuloDia: string, comHR: boolean) => {
    const ws = wb.addWorksheet(nome);
    const cab = ["Usina", "Dia", ...cols.filter((c) => comHR || c.unid !== "").map((c) => `${c.titulo} ${c.unid}`.trim())];
    const hr = ws.addRow(cab);
    hr.height = 48;
    hr.eachCell((c, i) => {
      const cor = i <= 2 ? "92D050" : cols[i - 3]?.cor.replace("#", "") ?? "92D050";
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + cor } };
      c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
      c.font = { size: 9 };
    });
    for (const l of linhas) {
      const v = [
        l.nome, l.tipo === "total" ? "" : rotuloDia,
        l.inflex_mwh, l.disp_mw, l.prog_mwh, l.prog_mw, l.verif_mwh, l.verif_mw, l.flex_mwh, l.pv, l.pf, l.receita,
        l.desp, l.ger_pdpw,
      ];
      if (comHR) v.push(l.heat_rate_texto ?? "");
      const row = ws.addRow(v.map((x) => (x === null ? "" : x)));
      if (l.tipo === "total") row.eachCell((c) => { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } }; });
      row.getCell(1).font = { bold: true };
    }
    ws.getColumn(1).width = 18;
    ws.getColumn(2).width = 11;
    for (let c = 3; c <= cab.length; c++) {
      ws.getColumn(c).width = 15;
      ws.getColumn(c).numFmt = c === 13 || c === 14 ? "0.00%" : "#,##0.00";
    }
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  };

  const mesTxt = `${MESES[mes - 1].slice(0, 3).toLowerCase()}-${String(ano).slice(2)}`;
  aba("Total", consolidar(usinas, leituras, dia, "acumulado"), mesTxt, true);
  for (let d = 1; d <= dia; d++) {
    aba(String(d), consolidar(usinas, leituras, d, "dia"), `${String(d).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`, false);
  }
  const dados = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    nome: `0. Relatório Preliminar de Receita Diária de Venda (RPRDV) - GERAL AMAZONAS - ${MESES[mes - 1]}.xlsx`,
    dados,
  };
}
