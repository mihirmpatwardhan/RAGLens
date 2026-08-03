import { NextRequest, NextResponse, NextFetchEvent } from "next/server";

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  // Add local JWT validation logic here if needed in the future
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
