import { NextRequest, NextResponse } from "next/server";

// Só barra quem não tem cookie; a validação completa (assinatura, usuário ativo, papel)
// acontece no servidor em cada página/rota.
const PUBLICAS = ["/login", "/setup", "/_next", "/favicon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("rprdv_sessao")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ erro: "Sessão expirada" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
