import Purchases from "react-native-purchases";

export async function initIAP(){
  Purchases.configure({
    apiKey: __DEV__ ? "REV_SDK_KEY_SANDBOX" : "REV_SDK_KEY_LIVE"
  });
}
