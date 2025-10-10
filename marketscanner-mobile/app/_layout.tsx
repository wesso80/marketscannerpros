import { Stack } from "expo-router";
import { useEffect } from "react";
import { initIAP } from "@/src/lib/iap";

export default function Root() {
  useEffect(() => { initIAP(); }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}
