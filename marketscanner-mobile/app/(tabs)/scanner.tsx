import { useState } from "react";
import { View, Text, TextInput, Pressable, FlatList } from "react-native";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";

async function fetchQuote(symbol:string){
  const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`);
  const j = await r.json(); return j.quoteResponse.result?.[0];
}

function ScannerInner(){
  const [q,setQ] = useState("AAPL,MSFT,TSLA,BTC-USD,ETH-USD");
  const symbols = q.split(",").map(s=>s.trim()).filter(Boolean);
  const { data, isFetching, refetch } = useQuery({
    queryKey:["scan", symbols],
    queryFn: () => Promise.all(symbols.map(fetchQuote))
  });
  return (
    <View style={{flex:1,padding:12,gap:8}}>
      <TextInput value={q} onChangeText={setQ} placeholder="Comma separated symbols"
        style={{borderWidth:1,borderRadius:8,padding:10}} />
      <Pressable onPress={()=>refetch()} style={{borderWidth:1,borderRadius:8,padding:10}}>
        <Text>{isFetching ? "Scanning..." : "Run Scan"}</Text>
      </Pressable>
      <FlatList data={(data||[]).filter(Boolean)} keyExtractor={(it:any)=>it.symbol}
        renderItem={({item}:any)=>(
          <View style={{padding:10,borderBottomWidth:1}}>
            <Text>{item.symbol} • {item.shortName}</Text>
            <Text>Price: {item.regularMarketPrice}  Δ {(item.regularMarketChangePercent||0).toFixed(2)}%</Text>
          </View>
        )}/>
    </View>
  );
}

const qc = new QueryClient();
export default function Scanner(){ return <QueryClientProvider client={qc}><ScannerInner/></QueryClientProvider>; }
