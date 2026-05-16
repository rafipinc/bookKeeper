import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  // Temporary fail-open middleware to avoid edge runtime crashes.
  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/dashboard/:path*", "/ledger/:path*", "/app/:path*", "/login"],
};
