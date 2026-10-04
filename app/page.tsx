import { redirect } from "next/navigation";
import { exigirSessao } from "@/lib/auth";
import { q1 } from "@/lib/db";

export default async function Inicio() {
  const n = await q1<{ n: number }>("select count(*)::int n from usuarios");
  if (!n || n.n === 0) redirect("/setup");
  const s = await exigirSessao();
  if (s.trocar_senha) redirect("/senha");
  redirect(s.papel === "usina" ? "/enviar" : "/painel");
}
