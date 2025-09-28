import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
const handler = NextAuth({
  session:{strategy:"jwt"},
  providers:[Google({
    clientId:process.env.GOOGLE_CLIENT_ID!,clientSecret:process.env.GOOGLE_CLIENT_SECRET!,
    profile:(p:any)=>({id:p.sub})
  })],
  callbacks:{
    async jwt({token,user}){ if(user?.id) token.sub=user.id; delete (token as any).name; delete (token as any).email; delete (token as any).picture; return token; },
    async session({session,token}){ return {user:{id:token.sub as string},expires:session.expires}; }
  },
  pages:{signIn:"/signin"}
});
export {handler as GET, handler as POST};
