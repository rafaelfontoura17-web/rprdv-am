"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarSessao, encerrarSessao, exigirSessao } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import crypto from "crypto";

type Estado = { erro?: string; ok?: string; senhaGerada?: string } | undefined;

const limpar = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function entrar(_: Estado, fd: FormData): Promise<Estado> {
  const email = limpar(fd.get("email")).toLowerCase();
  const senha = String(fd.get("senha") ?? "");
  const u = await q1<{ id: number; senha_hash: string; ativo: boolean }>(
    "select id, senha_hash, ativo from usuarios where lower(email) = $1",
    [email],
  );
  if (!u || !u.ativo || !(await bcrypt.compare(senha, u.senha_hash))) return { erro: "E-mail ou senha incorretos." };
  await criarSessao(u.id);
  redirect("/");
}

export async function sair() {
  await encerrarSessao();
  redirect("/login");
}

export async function configurarAdmin(_: Estado, fd: FormData): Promise<Estado> {
  const n = await q1<{ n: number }>("select count(*)::int n from usuarios");
  if (n && n.n > 0) return { erro: "O portal já foi configurado. Faça login." };
  const nome = limpar(fd.get("nome"));
  const email = limpar(fd.get("email")).toLowerCase();
  const senha = String(fd.get("senha") ?? "");
  if (!nome || !email.includes("@")) return { erro: "Preencha nome e e-mail." };
  if (senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };
  const r = await q1<{ id: number }>(
    "insert into usuarios(nome, email, senha_hash, papel, trocar_senha) values ($1,$2,$3,'admin', false) returning id",
    [nome, email, await bcrypt.hash(senha, 10)],
  );
  await criarSessao(r!.id);
  redirect("/admin");
}

export async function trocarSenha(_: Estado, fd: FormData): Promise<Estado> {
  const s = await exigirSessao();
  const atual = String(fd.get("atual") ?? "");
  const nova = String(fd.get("nova") ?? "");
  const conf = String(fd.get("conf") ?? "");
  const u = await q1<{ senha_hash: string }>("select senha_hash from usuarios where id = $1", [s.id]);
  if (!u || !(await bcrypt.compare(atual, u.senha_hash))) return { erro: "Senha atual incorreta." };
  if (nova.length < 8) return { erro: "A nova senha precisa ter pelo menos 8 caracteres." };
  if (nova !== conf) return { erro: "A confirmação não bate com a nova senha." };
  await q("update usuarios set senha_hash = $1, trocar_senha = false where id = $2", [await bcrypt.hash(nova, 10), s.id]);
  redirect("/");
}

function senhaTemporaria() {
  const alfa = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(10), (b) => alfa[b % alfa.length]).join("");
}

export async function salvarUsuario(_: Estado, fd: FormData): Promise<Estado> {
  await exigirSessao(["admin"]);
  const nome = limpar(fd.get("nome"));
  const email = limpar(fd.get("email")).toLowerCase();
  const papel = limpar(fd.get("papel"));
  const usinaId = papel === "usina" ? Number(fd.get("usina_id")) || null : null;
  if (!nome || !email.includes("@")) return { erro: "Preencha nome e e-mail." };
  if (!["admin", "gerente", "usina"].includes(papel)) return { erro: "Perfil inválido." };
  if (papel === "usina" && !usinaId) return { erro: "Escolha a usina desse usuário." };
  const existe = await q1("select 1 from usuarios where lower(email) = $1", [email]);
  if (existe) return { erro: "Já existe um usuário com esse e-mail." };
  const senha = senhaTemporaria();
  await q(
    "insert into usuarios(nome, email, senha_hash, papel, usina_id, trocar_senha) values ($1,$2,$3,$4,$5,true)",
    [nome, email, await bcrypt.hash(senha, 10), papel, usinaId],
  );
  revalidatePath("/admin");
  return { ok: `Usuário ${nome} criado. Passe a senha temporária abaixo; ele vai trocar no primeiro acesso.`, senhaGerada: senha };
}

export async function resetarSenha(_: Estado, fd: FormData): Promise<Estado> {
  await exigirSessao(["admin"]);
  const id = Number(fd.get("id"));
  const senha = senhaTemporaria();
  await q("update usuarios set senha_hash = $1, trocar_senha = true where id = $2", [await bcrypt.hash(senha, 10), id]);
  const u = await q1<{ nome: string }>("select nome from usuarios where id = $1", [id]);
  return { ok: `Nova senha temporária de ${u?.nome}:`, senhaGerada: senha };
}

export async function alternarUsuario(fd: FormData) {
  const s = await exigirSessao(["admin"]);
  const id = Number(fd.get("id"));
  if (id === s.id) return;
  await q("update usuarios set ativo = not ativo where id = $1", [id]);
  revalidatePath("/admin");
}

export async function salvarUsina(fd: FormData) {
  await exigirSessao(["admin", "gerente"]);
  const id = Number(fd.get("id"));
  await q(
    "update usinas set nome=$2, ordem=$3, tipo=$4, heat_rate_texto=$5, chave_arquivo=$6, ativo=$7 where id=$1",
    [
      id, limpar(fd.get("nome")), Number(fd.get("ordem")) || 0,
      limpar(fd.get("tipo")) === "simples" ? "simples" : "completa",
      limpar(fd.get("heat_rate_texto")) || null, limpar(fd.get("chave_arquivo")).toUpperCase() || null,
      fd.get("ativo") === "on",
    ],
  );
  revalidatePath("/admin");
}

export async function novaUsina(fd: FormData) {
  await exigirSessao(["admin"]);
  const nome = limpar(fd.get("nome"));
  if (!nome) return;
  await q(
    "insert into usinas(nome, ordem, tipo, chave_arquivo) values ($1, (select coalesce(max(ordem),0)+1 from usinas), $2, $3) on conflict do nothing",
    [nome, limpar(fd.get("tipo")) === "simples" ? "simples" : "completa", limpar(fd.get("chave_arquivo")).toUpperCase() || null],
  );
  revalidatePath("/admin");
}

export async function salvarConfigEmail(_: Estado, fd: FormData): Promise<Estado> {
  await exigirSessao(["admin", "gerente"]);
  const valor = {
    para: limpar(fd.get("para")),
    cc: limpar(fd.get("cc")),
    remetente_nome: limpar(fd.get("remetente_nome")) || "RPRDV Amazonas",
    saudacao: limpar(fd.get("saudacao")),
    heat_rate_rotulo: limpar(fd.get("heat_rate_rotulo")),
    anexar_arquivos: fd.get("anexar_arquivos") === "on",
  };
  await q(
    "insert into config(chave, valor) values ('email', $1) on conflict (chave) do update set valor = excluded.valor",
    [JSON.stringify(valor)],
  );
  revalidatePath("/admin");
  revalidatePath("/painel");
  return { ok: "Configuração de e-mail salva." };
}
