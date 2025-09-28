export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/app/:path*", "/account/:path*"],
};
