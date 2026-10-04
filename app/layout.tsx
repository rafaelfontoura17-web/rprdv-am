import "./globals.css";
import type { Metadata } from "next";
import { sessaoAtual } from "@/lib/auth";
import { sair } from "./actions";

export const metadata: Metadata = { title: "RPRDV Amazonas", description: "Receita diária de venda das usinas do Amazonas" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let s = null;
  try { s = await sessaoAtual(); } catch { s = null; }
  const papel = s?.papel;
  return (
    <html lang="pt-BR">
      <body>
        {s && (
          <header className="topo">
            <div className="in">
              <div className="marca"><i />RPRDV Amazonas</div>
              <nav>
                {(papel === "admin" || papel === "gerente") && <a href="/painel">Painel</a>}
                <a href="/enviar">Enviar arquivo</a>
                <a href="/historico">Histórico</a>
                {(papel === "admin" || papel === "gerente") && <a href="/admin">Administração</a>}
              </nav>
              <div className="user">
                <span>{s.nome}{s.usina_nome ? ` · ${s.usina_nome}` : ""}</span>
                <a href="/senha" style={{ color: "#cfd6e0" }}>Senha</a>
                <form action={sair}><button>Sair</button></form>
              </div>
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
