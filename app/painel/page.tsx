import { exigirSessao } from "@/lib/auth";
import { lerConfigEmail, q } from "@/lib/db";
import { ddmm, ddmmaaaa, fmtNum, hojeManaus, ontemManaus } from "@/lib/datas";
import { assuntoEmail, corpoEmail, emailConfigurado, listaEmails, tabelaHtml } from "@/lib/email";
import { montarConsolidado } from "@/lib/relatorio";
import { statusDoDia } from "@/lib/servico";
import Acoes from "./Acoes";

export default async function Painel({ searchParams }: { searchParams: Promise<{ data?: string; modo?: string }> }) {
  await exigirSessao(["admin", "gerente"], { pagina: true });
  const sp = await searchParams;
  const dataRef = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? "") ? sp.data! : ontemManaus();
  const modo = sp.modo === "dia" ? "dia" : "acumulado";

  const [status, linhas, linhasAcum, cfg] = await Promise.all([
    statusDoDia(dataRef),
    montarConsolidado(dataRef, modo),
    montarConsolidado(dataRef, "acumulado"),
    lerConfigEmail(),
  ]);
  const envios = await q<any>(
    `select c.enviado_em, c.status, c.detalhe, c.para, u.nome from consolidacoes c left join usuarios u on u.id = c.enviado_por
      where c.data_ref = $1 order by c.enviado_em desc limit 5`,
    [dataRef],
  );

  const recebidas = status.filter((s) => s.temDia).length;
  const total = linhasAcum.find((l) => l.tipo === "total")!;
  const avisos = status.flatMap((s) =>
    (s.ultimoEnvio?.avisos ?? []).map((a) => ({ ...a, usina: s.usina.nome })),
  );
  const htmlEmail = corpoEmail(linhasAcum, dataRef, cfg, cfg.anexar_arquivos);
  const link = (extra: Record<string, string>) => "?" + new URLSearchParams({ data: dataRef, modo, ...extra }).toString();

  return (
    <main>
      <div className="linha" style={{ alignItems: "center", marginBottom: 18 }}>
        <div style={{ flex: 3 }}>
          <h1>Painel do dia {ddmmaaaa(dataRef)}</h1>
          <p className="sub" style={{ margin: 0 }}>
            {recebidas} de {status.length} usinas com o dia preenchido · Receita acumulada no mês: <b>R$ {fmtNum(total.receita)}</b>
          </p>
        </div>
        <form className="dir" style={{ flex: 2 }}>
          <input type="date" name="data" defaultValue={dataRef} max={hojeManaus()} style={{ maxWidth: 170 }} />
          <input type="hidden" name="modo" value={modo} />
          <button className="btn sec">Ver</button>
        </form>
      </div>

      <div className="card">
        <h2>Recebimento das usinas</h2>
        <div className="status-grid">
          {status.map((s) => {
            const cor = s.temDia ? "verde" : s.ultimoEnvio ? "amarelo" : "vermelho";
            const nAlertas = (s.ultimoEnvio?.avisos ?? []).filter((a) => a.nivel !== "info").length;
            return (
              <div key={s.usina.id} className={"st " + cor}>
                <b>{s.usina.nome}</b>
                <span>
                  {s.temDia ? `Dia ${ddmm(dataRef)} recebido` : s.ultimoEnvio ? `Sem o dia ${ddmm(dataRef)}` : "Nada enviado no mês"}
                </span>
                {s.ultimoEnvio && (
                  <span style={{ display: "block" }}>
                    Último envio {new Date(s.ultimoEnvio.enviado_em).toLocaleString("pt-BR", { timeZone: "America/Manaus", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {nAlertas > 0 && <> · <span className="pill amarelo">{nAlertas} alerta{nAlertas > 1 ? "s" : ""}</span></>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="card">
          <h2>Pontos para conferir</h2>
          {avisos.map((a, i) => <div key={i} className={"aviso " + a.nivel}><b>{a.usina}:</b> {a.msg}</div>)}
        </div>
      )}

      <div className="card">
        <div className="linha" style={{ alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>Consolidado</h2>
          <div className="dir">
            <div className="abas">
              <a href={link({ modo: "acumulado" })} className={modo === "acumulado" ? "on" : ""}>Acumulado do mês (e-mail)</a>
              <a href={link({ modo: "dia" })} className={modo === "dia" ? "on" : ""}>Só o dia {ddmm(dataRef)}</a>
            </div>
            <a className="btn sec" href={`/api/consolidado/excel?data=${dataRef}`}>Baixar Excel consolidado</a>
          </div>
        </div>
        <div className="tabela-email" dangerouslySetInnerHTML={{ __html: tabelaHtml(linhas, dataRef, cfg) }} />
      </div>

      <div className="card">
        <h2>Envio ao Diretor</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Assunto: <b>{assuntoEmail(dataRef)}</b><br />
          Para: {listaEmails(cfg.para).join("; ") || <span style={{ color: "var(--err)" }}>não configurado</span>}
          {cfg.cc && <> · Cc: {listaEmails(cfg.cc).join("; ")}</>}
          <br />Anexos: {cfg.anexar_arquivos ? "Excel consolidado + o último arquivo de cada usina" : "nenhum"}
        </p>
        {envios.map((e, i) => (
          <div key={i} className={"aviso " + (e.status === "enviado" ? "ok" : "erro")}>
            {e.status === "enviado" ? "Enviado" : "Falhou"} em {new Date(e.enviado_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" })} por {e.nome}
            {e.status !== "enviado" && <> · {e.detalhe}</>}
          </div>
        ))}
        <Acoes dataRef={dataRef} htmlEmail={htmlEmail} pendentes={status.filter((s) => !s.temDia).map((s) => s.usina.nome)} emailOk={emailConfigurado()} />
      </div>
    </main>
  );
}
