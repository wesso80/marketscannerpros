import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
const h=NextAuth({session:{strategy:"jwt"},providers:[Credentials({name:"Access Code",
credentials:{code:{label:"Access code",type:"password"}},async authorize(c){return c?.code===process.env.ACCESS_CODE?{id:"member"}:null;}})],callbacks:{async jwt({token,user}){if(user?.id)token.sub=user.id;return token;},async session({session,token}){(session as any).user={id:token.sub as string};return session;}},pages:{signIn:"/signin"}});
export{h as GET,h as POST};
