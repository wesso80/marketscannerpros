import { View, Text, Pressable, Alert } from "react-native";
import Purchases from "react-native-purchases";
export default function Settings(){
  return (
    <View style={{padding:16,gap:12}}>
      <Text style={{fontSize:18,fontWeight:"600"}}>Settings</Text>
      <Pressable onPress={async ()=>{
        try{
          const info = await Purchases.getCustomerInfo();
          Alert.alert("Entitlements", JSON.stringify(info.entitlements.active));
        }catch(e:any){ Alert.alert("Purchases", e.message); }
      }} style={{borderWidth:1,borderRadius:8,padding:10}}>
        <Text>Check Subscription Status</Text>
      </Pressable>
      <Pressable onPress={async ()=>{
        try{
          const offerings = await Purchases.getOfferings();
          Alert.alert("Offerings", Object.keys(offerings.all||{}).join(", ")||"none");
        }catch(e:any){ Alert.alert("Offerings", e.message); }
      }} style={{borderWidth:1,borderRadius:8,padding:10}}>
        <Text>Open Paywall (debug)</Text>
      </Pressable>
    </View>
  );
}
