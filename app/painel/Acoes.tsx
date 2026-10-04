"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Acoes({ dataRef, htmlEmail, pendentes, emailOk }: {
  dataRef: string; htmlEmail: string; pendentes: string[]; emailOk: boolean;
}) {
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function copiar() {
    try {
      const blob = new Blob([htmlEmail], { type: "text/html" });
      const texto = new Blob([htmlEmail.replace(/<[^>]+>/g, " ")], { type: "text/plain" });
      await navigator.clipboard.write([new ClipboardItem({ "text/html": blob, "text/plain": texto })]);
      setMsg({ tipo: "ok", texto: "E-mail copiado. Cole no corpo de um e-mail novo no Outlook (Ctrl+V)." });
    } catch {
      setMsg({ tipo: "erro", texto: "O navegador bloqueou a cópia. Tente pelo Chrome ou Edge." });
    }
  }

  async function enviar(extra: Record<string, boolean> = {}) {
    setEnviando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/consolidado/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_ref: dataRef, ...extra }),
      });
      const j = await r.json();
      if (r.status === 409 && j.precisaConfirmar === "pendencias") {
        if (confirm(`Ainda faltam ${j.pendentes.length} usina(s) com o dia preenchido:\n\n${j.pendentes.join("\n")}\n\nEnviar mesmo assim?`))
          return enviar({ ...extra, confirmar_pendencias: true });
        return;
      }
      if (r.status === 409 && j.precisaConfirmar === "reenvio") {
        const quando = new Date(j.enviadoEm).toLocaleString("pt-BR", { timeZone: "America/Manaus" });
        if (confirm(`O consolidado deste dia já foi enviado em ${quando} por ${j.por}.\n\nEnviar de novo?`))
          return enviar({ ...extra, confirmar_reenvio: true });
        return;
      }
      if (!r.ok) setMsg({ tipo: "erro", texto: j.erro || "Falha no envio." });
      else setMsg({ tipo: "ok", texto: `E-mail enviado para ${j.para.join(", ")}${j.cc.length ? ` (cc ${j.cc.length})` : ""} com ${j.anexos} anexo(s).` });
      router.refresh();
    } catch {
      setMsg({ tipo: "erro", texto: "Não foi possível falar com o servidor." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {!emailOk && (
        <div className="aviso alerta">
          O envio automático ainda não está configurado (falta a chave do Resend). Por enquanto, use <b>Copiar e-mail</b> e cole no Outlook.
        </div>
      )}
      {msg && <div className={"aviso " + msg.tipo}>{msg.texto}</div>}
      <div className="dir" style={{ marginTop: 10 }}>
        {pendentes.length > 0 && <span className="muted">{pendentes.length} usina(s) pendente(s)</span>}
        <button className="btn sec" onClick={copiar}>Copiar e-mail</button>
        <button className="btn" onClick={() => enviar()} disabled={!emailOk || enviando}>
          {enviando ? "Enviando…" : "Aprovar e enviar ao Diretor"}
        </button>
      </div>
    </>
  );
}
