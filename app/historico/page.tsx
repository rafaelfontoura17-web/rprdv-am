import { exigirSessao } from "@/lib/auth";
import { q } from "@/lib/db";
import { ddmmaaaa, MESES, ontemManaus, partes } from "@/lib/datas";

export default async function Historico({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const s = await exigirSessao(undefined, { pagina: true });
  const sp = await searchParams;
  const padrao = ontemManaus().slice(0, 7);
  const mesRef = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : padrao;
  const { ano, mes } = partes(mesRef + "-01");
  const usinaFiltro = s.papel === "usina" ? s.usina_id : null;

  const envios = await q<any>(
    `select e.id, e.enviado_em, e.arquivo_nome, e.dias_preenchidos, e.avisos, s.nome usina, u.nome por
       from envios e join usinas s on s.id = e.usina_id left join usuarios u on u.id = e.enviado_por
      where e.ano = $1 and e.mes = $2 and ($3::int is null or e.usina_id = $3)
      order by e.enviado_em desc`,
    [ano, mes, usinaFiltro],
  );
  const consol = s.papel === "usina" ? [] : await q<any>(
    `select c.id, c.data_ref::text data_ref, c.enviado_em, c.status, c.detalhe, c.para, u.nome por
       from consolidacoes c left join usuarios u on u.id = c.enviado_por
      where extract(year from c.data_ref) = $1 and extract(month from c.data_ref) = $2
      order by c.enviado_em desc`,
    [ano, mes],
  );
  const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Manaus" });

  return (
    <main>
      <div className="linha" style={{ alignItems: "center", marginBottom: 18 }}>
        <div style={{ flex: 3 }}>
          <h1>Histórico de {MESES[mes - 1].toLowerCase()}/{ano}</h1>
          <p className="sub" style={{ margin: 0 }}>Todos os arquivos recebidos ficam guardados e podem ser baixados.</p>
        </div>
        <form className="dir" style={{ flex: 1 }}>
          <input type="month" name="mes" defaultValue={mesRef} style={{ maxWidth: 180 }} />
          <button className="btn sec">Ver</button>
        </form>
      </div>

      {consol.length > 0 && (
        <div className="card">
          <h2>E-mails enviados ao Diretor</h2>
          <table className="dados">
            <thead><tr><th>Quando</th><th>Dia de referência</th><th>Por</th><th>Para</th><th>Situação</th></tr></thead>
            <tbody>
              {consol.map((c) => (
                <tr key={c.id}>
                  <td>{fmt(c.enviado_em)}</td><td>{ddmmaaaa(c.data_ref)}</td><td>{c.por}</td><td>{c.para}</td>
                  <td>{c.status === "enviado" ? <span className="pill verde">enviado</span> : <span className="pill vermelho" title={c.detalhe}>falhou</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Arquivos recebidos ({envios.length})</h2>
        {envios.length === 0 ? <p className="muted">Nenhum arquivo neste mês.</p> : (
          <table className="dados">
            <thead><tr><th>Quando</th><th>Usina</th><th>Dias</th><th>Alertas</th><th>Por</th><th>Arquivo</th></tr></thead>
            <tbody>
              {envios.map((e) => {
                const al = (e.avisos as any[]).filter((a) => a.nivel !== "info");
                return (
                  <tr key={e.id}>
                    <td>{fmt(e.enviado_em)}</td>
                    <td>{e.usina}</td>
                    <td>{e.dias_preenchidos.length ? `1 a ${Math.max(...e.dias_preenchidos)}` : "—"}</td>
                    <td title={al.map((a) => a.msg).join("\n")}>{al.length ? <span className="pill amarelo">{al.length}</span> : <span className="pill cinza">0</span>}</td>
                    <td>{e.por}</td>
                    <td><a href={`/api/arquivo/${e.id}`}>{e.arquivo_nome}</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
