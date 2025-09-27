import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const handler = NextAuth({
  providers: [Google({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider && token.sub) token.uid = `${account.provider}:${token.sub}`;
      delete (token as any).email; delete (token as any).name; delete (token as any).picture;
      return token;
    },
    async session({ session, token }) {
      (session as any).uid = (token as any).uid;
      if (session.user) { delete (session.user as any).email; delete (session.user as any).name; delete (session.user as any).image; }
      return session;
    },
  },
});
export { handler as GET, handler as POST };
