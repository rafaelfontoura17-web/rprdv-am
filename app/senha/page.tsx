import FormAcao from "@/components/FormAcao";
import { exigirSessao } from "@/lib/auth";
import { trocarSenha } from "../actions";

export default async function Senha() {
  const s = await exigirSessao();
  return (
    <main>
      <div className="card" style={{ maxWidth: 440 }}>
        <h1>Trocar senha</h1>
        <p className="sub">{s.trocar_senha ? "Por segurança, defina uma senha nova antes de continuar." : "Defina uma nova senha de acesso."}</p>
        <FormAcao acao={trocarSenha} botao="Salvar nova senha">
          <div className="campo"><label>Senha atual (ou a temporária)</label><input name="atual" type="password" required /></div>
          <div className="campo"><label>Nova senha (mín. 8 caracteres)</label><input name="nova" type="password" minLength={8} required /></div>
          <div className="campo"><label>Confirme a nova senha</label><input name="conf" type="password" minLength={8} required /></div>
        </FormAcao>
      </div>
    </main>
  );
}
