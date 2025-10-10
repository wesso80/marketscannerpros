import { Tabs } from "expo-router";
export default function Layout() {
  return (
    <Tabs screenOptions={{ headerShown:false }}>
      <Tabs.Screen name="scanner" options={{ title:"Scanner" }} />
      <Tabs.Screen name="portfolio" options={{ title:"Portfolio" }} />
      <Tabs.Screen name="journal"  options={{ title:"Trade Journal" }} />
      <Tabs.Screen name="settings" options={{ title:"Settings" }} />
    </Tabs>
  );
}
