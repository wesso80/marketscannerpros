import { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "Access Code",
      credentials: {
        accessCode: { label: "Access Code", type: "password" }
      },
      async authorize(credentials) {
        if (credentials?.accessCode === process.env.ACCESS_CODE) {
          return {
            id: "user",
            name: "Authenticated User",
          };
        }
        return null;
      }
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Add uid to session but remove sensitive info from client
      (session as any).uid = token.uid;
      
      // Remove sensitive data from client-side session for privacy
      if (session.user) {
        delete (session.user as any).email;
        delete (session.user as any).name; 
        delete (session.user as any).image;
      }
      
      return session;
    },
  },
  pages: {
    signIn: '/signin',
  },
};