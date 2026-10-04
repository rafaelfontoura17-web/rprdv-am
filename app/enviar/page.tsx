import { exigirSessao } from "@/lib/auth";
import { q } from "@/lib/db";
import { ddmmaaaa, MESES, ontemManaus, partes } from "@/lib/datas";
import { usinasAtivas } from "@/lib/servico";
import Upload from "./Upload";

export default async function Enviar() {
  const s = await exigirSessao(undefined, { pagina: true });
  const todas = await usinasAtivas();
  const usinas = s.papel === "usina" ? todas.filter((u) => u.id === s.usina_id) : todas;
  const ontem = ontemManaus();
  const { ano, mes } = partes(ontem);

  const recentes = await q<any>(
    `select e.id, e.enviado_em, e.arquivo_nome, e.dias_preenchidos, e.ano, e.mes, s.nome as usina, u.nome as por
       from envios e join usinas s on s.id = e.usina_id left join usuarios u on u.id = e.enviado_por
      where ($1::int is null or e.usina_id = $1)
      order by e.enviado_em desc limit 8`,
    [s.papel === "usina" ? s.usina_id : null],
  );

  return (
    <main>
      <h1>Enviar RPRDV</h1>
      <p className="sub">
        Suba a planilha do mês do jeito que você já preenche hoje. O portal lê a aba <b>RESUMO</b>, confere os dados e
        mostra o que encontrou antes de gravar. Ontem foi <b>{ddmmaaaa(ontem)}</b>.
      </p>
      {usinas.length === 0 ? (
        <div className="aviso alerta">Seu usuário não está vinculado a nenhuma usina ativa. Fale com o administrador.</div>
      ) : (
        <Upload
          usinas={usinas.map((u) => ({ id: u.id, nome: u.nome }))}
          anoPadrao={ano}
          mesPadrao={mes}
          meses={MESES}
        />
      )}
      <div className="card">
        <h2>Últimos envios</h2>
        {recentes.length === 0 ? (
          <p className="muted">Nenhum envio ainda.</p>
        ) : (
          <table className="dados">
            <thead><tr><th>Quando</th><th>Usina</th><th>Mês</th><th>Dias preenchidos</th><th>Por</th><th>Arquivo</th></tr></thead>
            <tbody>
              {recentes.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.enviado_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}</td>
                  <td>{e.usina}</td>
                  <td>{MESES[e.mes - 1].toLowerCase()}/{e.ano}</td>
                  <td>{e.dias_preenchidos.length ? `1 a ${Math.max(...e.dias_preenchidos)}` : "—"}</td>
                  <td>{e.por}</td>
                  <td><a href={`/api/arquivo/${e.id}`}>baixar</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
