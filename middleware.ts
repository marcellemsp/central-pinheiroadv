import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROTAS_PUBLICAS = ["/login", "/auth"];

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Supabase ainda não configurado: deixa passar para a página mostrar o aviso.
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publica = ROTAS_PUBLICAS.some((r) => request.nextUrl.pathname.startsWith(r));
  const permitido = process.env.ALLOWED_EMAIL?.toLowerCase();
  const autorizado = !!user && (!permitido || user.email?.toLowerCase() === permitido);

  if (!autorizado && !publica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  // Encerra a sessão depois de um tempo sem abrir a Central (padrão: 7 dias),
  // para o caso de o celular ou o computador ficar com outra pessoa.
  if (autorizado) {
    const dias = Number(process.env.INATIVIDADE_DIAS ?? "7");
    const agora = Date.now();
    const ultimo = Number(request.cookies.get(COOKIE_ULTIMO_ACESSO)?.value ?? "0");
    if (ultimo && dias > 0 && agora - ultimo > dias * 86_400_000) {
      await supabase.auth.signOut();
      const destino = request.nextUrl.clone();
      destino.pathname = "/login";
      destino.search = "?erro=" + encodeURIComponent("Sessão encerrada por inatividade. Entre de novo.");
      const saida = NextResponse.redirect(destino);
      response.cookies.getAll().forEach((c) => saida.cookies.set(c));
      saida.cookies.delete(COOKIE_ULTIMO_ACESSO);
      return saida;
    }
    response.cookies.set(COOKIE_ULTIMO_ACESSO, String(agora), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 400 * 86_400,
    });
  }
  return response;
}

const COOKIE_ULTIMO_ACESSO = "pa_ultimo_acesso";

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|manifest.webmanifest|icons/|api/mcp).*)"],
};
