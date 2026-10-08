import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import PublicMSPCopilot from '../../../components/PublicMSPCopilot';
const mode=new URLSearchParams(location.search).get('mode');
function Fixture(){const [symbol,setSymbol]=useState('AAPL');return <main className="min-h-screen bg-slate-900 p-8 text-white"><h1>Copilot fixture — synthetic data</h1><button onClick={()=>setSymbol('MSFT')}>Change symbol</button><PublicMSPCopilot usage={{enabled:true,plan:mode==='free'?'free':'pro',resetsAt:'2026-10-09T04:00:00Z',quotas:[{kind:'ai',remaining:mode==='exhausted'?0:20}]}} pagePath="/tools/golden-egg" symbol={symbol} assetType="equity" timeframe="daily" expiry="2026-10-09" evidenceToken={'core-'+symbol}/></main>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
