import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { q1 } from "./db";

export const COOKIE = "rprdv_sessao";

export type Papel = "admin" | "gerente" | "usina";
export type Sessao = {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  usina_id: number | null;
  usina_nome: string | null;
  trocar_senha: boolean;
};

export function segredo() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET não configurado (mínimo 32 caracteres).");
  return new TextEncoder().encode(s);
}

export async function criarSessao(userId: number) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(segredo());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function encerrarSessao() {
  (await cookies()).delete(COOKIE);
}

export async function sessaoAtual(): Promise<Sessao | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, segredo());
    const u = await q1<Sessao & { ativo: boolean }>(
      `select u.id, u.nome, u.email, u.papel, u.usina_id, u.ativo, u.trocar_senha, s.nome as usina_nome
         from usuarios u left join usinas s on s.id = u.usina_id where u.id = $1`,
      [payload.uid],
    );
    if (!u || !u.ativo) return null;
    return u;
  } catch {
    return null;
  }
}

export async function exigirSessao(papeis?: Papel[], opts: { pagina?: boolean } = {}): Promise<Sessao> {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  if (opts.pagina && s.trocar_senha) redirect("/senha");
  if (papeis && !papeis.includes(s.papel)) redirect("/");
  return s;
}
