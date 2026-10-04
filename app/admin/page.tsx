import FormAcao from "@/components/FormAcao";
import { exigirSessao } from "@/lib/auth";
import { lerConfigEmail, q } from "@/lib/db";
import { emailConfigurado } from "@/lib/email";
import { todasUsinas } from "@/lib/servico";
import { alternarUsuario, novaUsina, resetarSenha, salvarConfigEmail, salvarUsina, salvarUsuario } from "../actions";

const PAPEL: Record<string, string> = { admin: "Administrador", gerente: "Gerente", usina: "Usina" };

export default async function Admin() {
  const s = await exigirSessao(["admin", "gerente"], { pagina: true });
  const admin = s.papel === "admin";
  const [usinas, cfg] = await Promise.all([todasUsinas(), lerConfigEmail()]);
  const usuarios = admin
    ? await q<any>(
        `select u.id, u.nome, u.email, u.papel, u.ativo, u.trocar_senha, s.nome usina
           from usuarios u left join usinas s on s.id = u.usina_id order by u.ativo desc, u.papel, s.ordem nulls first, u.nome`,
      )
    : [];

  return (
    <main>
      <h1>Administração</h1>
      <p className="sub">{admin ? "Usuários, usinas e configuração do e-mail." : "Usinas e configuração do e-mail."}</p>

      {admin && (
        <div className="grid2">
          <div className="card">
            <h2>Novo usuário</h2>
            <FormAcao acao={salvarUsuario} botao="Criar usuário" resetar>
              <div className="campo"><label>Nome</label><input name="nome" required /></div>
              <div className="campo"><label>E-mail</label><input name="email" type="email" required /></div>
              <div className="linha">
                <div className="campo">
                  <label>Perfil</label>
                  <select name="papel" defaultValue="usina">
                    <option value="usina">Usina (envia o arquivo da sua usina)</option>
                    <option value="gerente">Gerente (confere e envia ao Diretor)</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="campo">
                  <label>Usina (só para perfil Usina)</label>
                  <select name="usina_id" defaultValue="">
                    <option value="">—</option>
                    {usinas.filter((u) => u.ativo).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
              </div>
              <p className="muted">O portal gera uma senha temporária. A pessoa troca no primeiro acesso.</p>
            </FormAcao>
          </div>
          <div className="card">
            <h2>Gerar nova senha</h2>
            <FormAcao acao={resetarSenha} botao="Gerar senha temporária">
              <div className="campo">
                <label>Usuário</label>
                <select name="id" required>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome} ({u.email})</option>)}
                </select>
              </div>
            </FormAcao>
          </div>
        </div>
      )}

      {admin && (
        <div className="card">
          <h2>Usuários ({usuarios.length})</h2>
          <table className="dados">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Usina</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} style={{ opacity: u.ativo ? 1 : 0.5 }}>
                  <td>{u.nome}</td><td>{u.email}</td><td>{PAPEL[u.papel]}</td><td>{u.usina ?? "—"}</td>
                  <td>{!u.ativo ? <span className="pill cinza">inativo</span> : u.trocar_senha ? <span className="pill amarelo">aguardando 1º acesso</span> : <span className="pill verde">ativo</span>}</td>
                  <td>{u.id !== s.id && <form action={alternarUsuario}><input type="hidden" name="id" value={u.id} /><button className="btn sec peq">{u.ativo ? "Desativar" : "Reativar"}</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>E-mail ao Diretor</h2>
        {!emailConfigurado() && (
          <div className="aviso alerta">
            O envio automático ainda não está ligado. Falta cadastrar <span className="mono">RESEND_API_KEY</span> e <span className="mono">EMAIL_FROM</span> nas variáveis do projeto na Vercel.
          </div>
        )}
        <FormAcao acao={salvarConfigEmail} botao="Salvar configuração">
          <div className="linha">
            <div className="campo"><label>Para (separe por ;)</label><input name="para" defaultValue={cfg.para} placeholder="diretor@empresa.com.br" /></div>
            <div className="campo"><label>Cc (separe por ;)</label><input name="cc" defaultValue={cfg.cc} /></div>
          </div>
          <div className="linha">
            <div className="campo"><label>Nome do remetente</label><input name="remetente_nome" defaultValue={cfg.remetente_nome} /></div>
            <div className="campo"><label>Saudação (1ª linha do e-mail)</label><input name="saudacao" defaultValue={cfg.saudacao} /></div>
          </div>
          <div className="linha">
            <div className="campo"><label>Título da coluna de heat rate</label><input name="heat_rate_rotulo" defaultValue={cfg.heat_rate_rotulo} /></div>
            <div className="campo" style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 22 }}>
              <input type="checkbox" name="anexar_arquivos" defaultChecked={cfg.anexar_arquivos} style={{ width: "auto" }} id="anx" />
              <label htmlFor="anx" style={{ margin: 0 }}>Anexar o Excel consolidado e os arquivos das usinas</label>
            </div>
          </div>
        </FormAcao>
      </div>

      <div className="card">
        <h2>Usinas</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          <b>Tipo completa</b>: todas as colunas no e-mail. <b>Tipo simples</b>: só geração verificada e receita. A <b>chave do arquivo</b> é o trecho
          que precisa aparecer no nome do Excel (sem acento), usado pra conferir se o arquivo é da usina certa. O heat rate é o texto que aparece na última coluna; atualize todo mês.
        </p>
        <table className="dados">
          <thead><tr><th style={{ width: 60 }}>Ordem</th><th>Nome</th><th>Tipo</th><th>Heat rate (texto)</th><th>Chave do arquivo</th><th>Ativa</th><th></th></tr></thead>
          <tbody>
            {usinas.map((u) => (
              <tr key={u.id}>
                <td colSpan={7} style={{ padding: 0 }}>
                  <form action={salvarUsina} style={{ display: "grid", gridTemplateColumns: "60px 1.4fr 1fr 1.2fr 1.2fr 60px 90px", gap: 8, padding: "6px 10px", alignItems: "center" }}>
                    <input type="hidden" name="id" value={u.id} />
                    <input name="ordem" type="number" defaultValue={u.ordem} />
                    <input name="nome" defaultValue={u.nome} />
                    <select name="tipo" defaultValue={u.tipo}><option value="completa">completa</option><option value="simples">simples</option></select>
                    <input name="heat_rate_texto" defaultValue={u.heat_rate_texto ?? ""} />
                    <input name="chave_arquivo" defaultValue={u.chave_arquivo ?? ""} />
                    <input type="checkbox" name="ativo" defaultChecked={u.ativo} style={{ width: "auto" }} />
                    <button className="btn sec peq">Salvar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {admin && (
          <form action={novaUsina} className="linha" style={{ marginTop: 14 }}>
            <div><label>Nova usina</label><input name="nome" placeholder="UTE …" required /></div>
            <div><label>Tipo</label><select name="tipo"><option value="completa">completa</option><option value="simples">simples</option></select></div>
            <div><label>Chave do arquivo</label><input name="chave_arquivo" placeholder="ex.: NOVA UTE" /></div>
            <div style={{ flex: 0 }}><button className="btn sec">Adicionar</button></div>
          </form>
        )}
      </div>
    </main>
  );
}
