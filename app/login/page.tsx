import { redirect } from "next/navigation";
import FormAcao from "@/components/FormAcao";
import { q1 } from "@/lib/db";
import { entrar } from "../actions";

export default async function Login() {
  const n = await q1<{ n: number }>("select count(*)::int n from usuarios");
  if (!n || n.n === 0) redirect("/setup");
  return (
    <div className="login-wrap">
      <div className="card login">
        <div className="marca" style={{ marginBottom: 18 }}><i style={{ width: 26, height: 26, borderRadius: 7, background: "var(--brand)", display: "inline-block" }} /> <b>RPRDV Amazonas</b></div>
        <h1>Entrar</h1>
        <p className="sub">Receita diária de venda das usinas do Amazonas</p>
        <FormAcao acao={entrar} botao="Entrar">
          <div className="campo"><label>E-mail</label><input name="email" type="email" required autoFocus /></div>
          <div className="campo"><label>Senha</label><input name="senha" type="password" required /></div>
        </FormAcao>
        <p className="muted" style={{ marginTop: 16 }}>Esqueceu a senha? Peça ao administrador do portal para gerar uma nova.</p>
      </div>
    </div>
  );
}
