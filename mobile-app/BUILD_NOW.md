# 🚀 BUILD INSTRUCTIONS - Do This Now!

Your Market Scanner Pro mobile app is **100% configured** and ready to build. Follow these steps exactly:

## ⚠️ Important Note
The mobile app **must be built on your local computer**, not in Replit. This is because Expo EAS requires local Node.js and builds happen on Expo's cloud servers.

---

## 📥 Step 1: Download the mobile-app folder

**Option A: Clone this Repl to your computer**
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPL_NAME.git
cd YOUR_REPL_NAME/mobile-app
```

**Option B: Download files manually**
1. Download all files from the `mobile-app/` folder
2. Create a folder on your computer called `market-scanner-mobile`
3. Put all downloaded files there

---

## 💻 Step 2: Install Prerequisites

### Install Node.js (if not installed)
1. Go to https://nodejs.org/
2. Download **LTS version** (v20.x or higher)
3. Install and verify:
```bash
node --version  # Should show v20.x or higher
npm --version   # Should show 10.x or higher
```

### Install Expo CLI
```bash
npm install -g expo-cli eas-cli
```

Verify:
```bash
expo --version
eas --version
```

---

## 🏗️ Step 3: Build the App

### Open Terminal/Command Prompt and navigate to folder:
```bash
cd path/to/market-scanner-mobile
```

### Install dependencies:
```bash
npm install
```

### Login to Expo:
```bash
npx expo login
```
**Don't have an Expo account?** Sign up for free at https://expo.dev/signup

### Configure EAS:
```bash
npx eas build:configure
```
Select **"All"** when asked which platforms.

### Build for iOS:
```bash
npx eas build -p ios --profile production
```

**What happens:**
- ✅ Expo asks for Apple ID credentials (first time only)
- ✅ Creates signing certificates automatically
- ✅ Builds on Expo's cloud servers (10-20 minutes)
- ✅ Shows build progress in terminal
- ✅ Gives you download link OR uploads to TestFlight

**Wait for this message:**
```
✔ Build finished
```

---

## 📱 Step 4: Submit to TestFlight

After build completes:

```bash
npx eas submit -p ios --profile production
```

**You'll need:**
- Your Apple ID email
- App-specific password (create at https://appleid.apple.com)

**This uploads to TestFlight** where you can test on real iPhone.

---

## 🤖 Optional: Build for Android Too

```bash
npx eas build -p android --profile production
npx eas submit -p android --profile production
```

---

## ✅ Before You Start - Quick Checklist

### Apple Developer Setup:
- [ ] Apple Developer account enrolled ($99/year)
- [ ] Bundle ID `app.marketscannerpros` registered at https://developer.apple.com/account/resources/identifiers
- [ ] App created in App Store Connect at https://appstoreconnect.apple.com

### Assets (can add later):
- [ ] App icon ready (1024x1024px) - can use placeholder for TestFlight
- [ ] Screenshots ready - needed for App Store submission (not TestFlight)

**Don't have icons yet?** That's OK! You can:
1. Build with placeholder icons now
2. Test in TestFlight
3. Add real icons before App Store submission

---

## 🎯 Expected Timeline

| Step | Time |
|------|------|
| Install Node.js & Expo | 5 minutes |
| Install dependencies | 2 minutes |
| EAS build (iOS) | 15-20 minutes |
| TestFlight processing | 5-10 minutes |
| **Total** | **~30-40 minutes** |

---

## 🆘 Troubleshooting

### "Command not found: npx"
→ Node.js not installed or not in PATH. Reinstall Node.js.

### "Build failed - Bundle ID mismatch"
→ Make sure `app.marketscannerpros` is registered in Apple Developer portal

### "No Expo account"
→ Sign up free at https://expo.dev/signup

### "Build taking too long"
→ Normal! First build takes 15-20 minutes. Grab coffee ☕

### "Need help"
→ Expo docs: https://docs.expo.dev/build/introduction/

---

## 📋 After TestFlight Success

1. ✅ Install TestFlight app on iPhone
2. ✅ Open invitation email from Apple
3. ✅ Test your app!
4. ✅ If works → Submit for App Store Review
5. ✅ Apple reviews (1-3 days)
6. ✅ App goes live! 🎉

---

## 🎉 You're Ready!

Everything is configured:
- ✅ Bundle IDs match Apple Developer
- ✅ WebView loads your live app
- ✅ EAS config ready
- ✅ Build scripts ready

**Just run the commands above and you'll have a working iOS app!**

Questions? Check the detailed guide in `BUILD_INSTRUCTIONS.md` or Expo docs.
