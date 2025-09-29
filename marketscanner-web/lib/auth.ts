import { NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    Google({ 
      clientId: process.env.GOOGLE_CLIENT_ID!, 
      clientSecret: process.env.GOOGLE_CLIENT_SECRET! 
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Keep essential info for server-side operations but store securely
      if (account?.provider && token.sub) {
        token.uid = `${account.provider}:${token.sub}`;
      }
      
      // Keep email in token for server-side operations (billing, etc.)
      // but remove from client-side session below
      if (profile?.email) {
        token.email = profile.email;
        token.name = profile.name;
      }
      
      return token;
    },
    async session({ session, token }) {
      // Add uid to session but remove sensitive info from client
      (session as any).uid = (token as any).uid;
      
      // Remove sensitive data from client-side session for privacy
      if (session.user) {
        delete (session.user as any).email;
        delete (session.user as any).name; 
        delete (session.user as any).image;
      }
      
      return session;
    },
  },
};