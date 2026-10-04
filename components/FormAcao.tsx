"use client";
import { useActionState } from "react";

type Estado = { erro?: string; ok?: string; senhaGerada?: string } | undefined;

export default function FormAcao({
  acao,
  children,
  botao,
  resetar = false,
}: {
  acao: (s: Estado, fd: FormData) => Promise<Estado>;
  children: React.ReactNode;
  botao: string;
  resetar?: boolean;
}) {
  const [estado, action, pendente] = useActionState(acao, undefined);
  return (
    <form action={action} key={resetar && estado?.ok ? estado.ok + (estado.senhaGerada ?? "") : undefined}>
      {children}
      {estado?.erro && <div className="aviso erro">{estado.erro}</div>}
      {estado?.ok && (
        <div className="aviso ok">
          {estado.ok}
          {estado.senhaGerada && <> <span className="mono" style={{ fontSize: 16 }}>{estado.senhaGerada}</span></>}
        </div>
      )}
      <button className="btn" disabled={pendente}>{pendente ? "Aguarde…" : botao}</button>
    </form>
  );
}
