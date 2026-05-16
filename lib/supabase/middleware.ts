import { type NextRequest, NextResponse } from "next/server";

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.endsWith("-auth-token"));
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute =
    pathname.startsWith("/app") || pathname.startsWith("/dashboard") || pathname.startsWith("/ledger");
  const isAuthenticated = hasSupabaseAuthCookie(request);

  if (!isAuthenticated && isProtectedRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthenticated && pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next({ request });
}
