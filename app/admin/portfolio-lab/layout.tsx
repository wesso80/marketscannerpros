import Link from 'next/link';
const pages=[['Saved holdings','holdings'],['Paper dashboard',''],['Paper positions','positions'],['Sim orders','orders'],['Closed paper trades','trades'],['Paper journal','journal'],['Performance','performance'],['Analytics','analytics'],['Playbooks','playbooks'],['Risk','risk'],['Reports','reports'],['Edge packets','edge-packets'],['Settings','settings']];
export default function PortfolioLabLayout({children}:{children:React.ReactNode}){
 return <><div className="border-b border-slate-700 bg-slate-950 p-4 text-slate-200"><p className="mb-3 text-sm">Portfolio Lab · Saved holdings and ARCA simulated paper records are separate books.</p><nav aria-label="Portfolio Lab pages" className="flex flex-wrap gap-4 text-sm">{pages.map(([name,path])=><Link className="text-emerald-300 underline" key={name} href={'/admin/portfolio-lab'+(path?'/'+path:'')}>{name}</Link>)}</nav></div>{children}</>;
}
