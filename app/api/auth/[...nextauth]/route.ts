import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
const handler=NextAuth({
  session:{strategy:"jwt"},
  providers:[Google({clientId:process.env.GOOGLE_CLIENT_ID!,clientSecret:process.env.GOOGLE_CLIENT_SECRET!,authorization:{params:{prompt:"select_account"}},profile:(p:any)=>({id:p.sub})})],
  callbacks:{
    async jwt({token,user}){if(user?.id)token.sub=user.id;delete (token as any).name;delete (token as any).email;delete (token as any).picture;return token;},
    async session({session,token}){(session as any).user={id:(token as any).sub as string};if((session as any).user){delete (session as any).user.name;delete (session as any).user.email;delete (session as any).user.image;}return session;}
  },
  pages:{signIn:"/signin"}
});
export{handler as GET,handler as POST};
