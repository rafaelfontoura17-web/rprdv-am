import { redirect } from "next/navigation";
import FormAcao from "@/components/FormAcao";
import { q1 } from "@/lib/db";
import { configurarAdmin } from "../actions";

export default async function Setup() {
  const n = await q1<{ n: number }>("select count(*)::int n from usuarios");
  if (n && n.n > 0) redirect("/login");
  return (
    <div className="login-wrap">
      <div className="card login">
        <h1>Primeiro acesso</h1>
        <p className="sub">Crie a conta do administrador. Esta tela só aparece uma vez.</p>
        <FormAcao acao={configurarAdmin} botao="Criar administrador">
          <div className="campo"><label>Nome</label><input name="nome" required /></div>
          <div className="campo"><label>E-mail</label><input name="email" type="email" required /></div>
          <div className="campo"><label>Senha (mín. 8 caracteres)</label><input name="senha" type="password" minLength={8} required /></div>
        </FormAcao>
      </div>
    </div>
  );
}
