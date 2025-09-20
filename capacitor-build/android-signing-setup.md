# 🔐 Android App Signing Setup

## Generate Release Keystore
```bash
# Create keystore for release signing
keytool -genkey -v -keystore market-scanner-release.keystore -alias market-scanner -keyalg RSA -keysize 2048 -validity 10000

# Follow prompts to set passwords and details
```

## Configure Gradle Signing
✅ **Already configured in build.gradle!** 

Just create `android/gradle.properties` (copy from gradle.properties.example):

```properties
MARKET_SCANNER_KEYSTORE_PATH=market-scanner-release.keystore
MARKET_SCANNER_KEYSTORE_PASSWORD=your_keystore_password
MARKET_SCANNER_KEY_ALIAS=market-scanner
MARKET_SCANNER_KEY_PASSWORD=your_key_password
```

**Security Note**: Never commit gradle.properties to git! Add it to .gitignore.

## Build Signed APK/AAB
```bash
cd android
./gradlew assembleRelease    # Signed APK
./gradlew bundleRelease      # Signed AAB for Play Store
```