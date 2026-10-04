"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Aviso = { nivel: "erro" | "alerta" | "info"; msg: string };
type Resp = {
  ok: boolean;
  gravado: boolean;
  erro?: string;
  avisos?: Aviso[];
  preview?: { dia: number; verif_mwh: number | null; receita: number | null; desp: number | null; prog_mwh: number | null }[];
};

const n2 = (v: number | null | undefined) =>
  v === null || v === undefined ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Upload({ usinas, anoPadrao, mesPadrao, meses }: {
  usinas: { id: number; nome: string }[]; anoPadrao: number; mesPadrao: number; meses: string[];
}) {
  const [usinaId, setUsinaId] = useState(usinas.length === 1 ? usinas[0].id : 0);
  const [ano, setAno] = useState(anoPadrao);
  const [mes, setMes] = useState(mesPadrao);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resp, setResp] = useState<Resp | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function chamar(f: File, confirmar: boolean) {
    if (!usinaId) { setResp({ ok: false, gravado: false, erro: "Escolha a usina." }); return; }
    setCarregando(true);
    const fd = new FormData();
    fd.append("arquivo", f);
    fd.append("usina_id", String(usinaId));
    fd.append("ano", String(ano));
    fd.append("mes", String(mes));
    if (confirmar) fd.append("confirmar", "1");
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await r.json();
      setResp(r.ok ? j : { ok: false, gravado: false, erro: j.erro || "Falha no envio." });
      if (r.ok && j.gravado) router.refresh();
    } catch {
      setResp({ ok: false, gravado: false, erro: "Não foi possível falar com o servidor. Tente de novo." });
    } finally {
      setCarregando(false);
    }
  }

  function escolher(f: File | undefined | null) {
    if (!f) return;
    setArquivo(f);
    setResp(null);
    chamar(f, false);
  }

  const temErro = resp?.avisos?.some((a) => a.nivel === "erro");

  return (
    <div className="card">
      <div className="linha" style={{ marginBottom: 16 }}>
        <div>
          <label>Usina</label>
          <select value={usinaId} onChange={(e) => { setUsinaId(Number(e.target.value)); setResp(null); setArquivo(null); }} disabled={usinas.length === 1}>
            {usinas.length > 1 && <option value={0}>Selecione…</option>}
            {usinas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div>
          <label>Mês de referência</label>
          <select value={mes} onChange={(e) => { setMes(Number(e.target.value)); setResp(null); }}>
            {meses.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div style={{ maxWidth: 140 }}>
          <label>Ano</label>
          <input type="number" value={ano} onChange={(e) => { setAno(Number(e.target.value)); setResp(null); }} />
        </div>
      </div>

      <div
        className={"drop" + (arrastando ? " on" : "")}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0]); }}
      >
        {arquivo ? <><b>{arquivo.name}</b><br /><span className="muted">clique para trocar o arquivo</span></> : <>Arraste o arquivo .xlsx aqui ou <b>clique para escolher</b></>}
        <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {carregando && <p className="muted">Lendo o arquivo…</p>}

      {resp?.erro && <div className="aviso erro">{resp.erro}</div>}

      {resp && !resp.erro && (
        <div style={{ marginTop: 16 }}>
          {resp.gravado && <div className="aviso ok"><b>Envio gravado.</b> Obrigado! O gerente já vê os dados no painel.</div>}
          {(resp.avisos ?? []).map((a, i) => <div key={i} className={"aviso " + a.nivel}>{a.msg}</div>)}
          {!resp.gravado && !temErro && (resp.avisos ?? []).length === 0 && <div className="aviso ok">Nenhum problema encontrado.</div>}

          {(resp.preview ?? []).length > 0 && (
            <>
              <h2 style={{ marginTop: 16 }}>O que o portal leu da aba RESUMO</h2>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                <table className="dados">
                  <thead><tr><th>Dia</th><th style={{ textAlign: "right" }}>Geração programada (MWh)</th><th style={{ textAlign: "right" }}>Geração verificada (MWh)</th><th style={{ textAlign: "right" }}>Receita (R$)</th><th style={{ textAlign: "right" }}>Despacho</th></tr></thead>
                  <tbody>
                    {resp.preview!.map((d) => (
                      <tr key={d.dia}>
                        <td>{String(d.dia).padStart(2, "0")}/{String(mes).padStart(2, "0")}</td>
                        <td className="num">{n2(d.prog_mwh)}</td>
                        <td className="num">{n2(d.verif_mwh)}</td>
                        <td className="num">{n2(d.receita)}</td>
                        <td className="num">{d.desp !== null && d.desp !== undefined ? n2(d.desp * 100) + "%" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!resp.gravado && arquivo && (
            <div className="dir" style={{ marginTop: 16 }}>
              {temErro ? (
                <span className="muted">Corrija os erros acima e envie o arquivo de novo.</span>
              ) : (
                <>
                  {(resp.avisos ?? []).some((a) => a.nivel === "alerta") && <span className="muted">Há alertas. Se estiver tudo certo, pode confirmar.</span>}
                  <button className="btn" disabled={carregando} onClick={() => chamar(arquivo, true)}>Confirmar envio</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
