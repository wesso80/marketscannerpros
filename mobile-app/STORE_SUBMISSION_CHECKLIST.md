# App Store Submission Checklist

## ✅ Pre-Submission Requirements

### Apple App Store

- [ ] **Apple Developer Account** ($99/year enrolled)
- [ ] **App Store Connect app created** with Bundle ID: `com.marketscannerpro.app`
- [ ] **App icons** (1024x1024px PNG, no transparency)
- [ ] **iPhone screenshots** (3+ per device size)
  - [ ] 6.7" iPhone (1290x2796px)
  - [ ] 6.5" iPhone (1242x2688px)
- [ ] **iPad screenshots** (optional but recommended)
  - [ ] 12.9" iPad Pro (2048x2732px)
- [ ] **App metadata filled in**:
  - [ ] App name: "Market Scanner Pro"
  - [ ] Subtitle (30 chars max)
  - [ ] Description
  - [ ] Keywords (100 chars max)
  - [ ] Primary category: Finance
  - [ ] Age rating: 4+
- [ ] **Privacy Policy URL**: https://marketscannerpros.app/privacy
- [ ] **Support URL**: https://marketscannerpros.app/support
- [ ] **EAS credentials configured** in `eas.json`
- [ ] **Test build completed** successfully
- [ ] **App tested** on real iOS device

### Google Play Store

- [ ] **Google Play Developer Account** ($25 one-time enrolled)
- [ ] **Play Console app created** with Package: `com.marketscannerpro.app`
- [ ] **App icon** (512x512px PNG)
- [ ] **Feature graphic** (1024x500px PNG)
- [ ] **Screenshots** (2+ per device type)
  - [ ] Phone screenshots
  - [ ] Tablet screenshots (optional)
- [ ] **Store listing filled in**:
  - [ ] App name: "Market Scanner Pro"
  - [ ] Short description (80 chars)
  - [ ] Full description
  - [ ] Category: Finance
  - [ ] Content rating: Everyone
- [ ] **Privacy Policy URL**: https://marketscannerpros.app/privacy
- [ ] **Service account JSON key** downloaded
- [ ] **Saved as** `google-play-service-account.json` (gitignored)
- [ ] **Test build completed** successfully
- [ ] **App tested** on Android device

## 🔨 Build Commands

### iOS Build
```bash
cd mobile-app
eas build --platform ios --profile production
```

### Android Build
```bash
cd mobile-app
eas build --platform android --profile production
```

## 📤 Submission Commands

### Submit to Apple App Store
```bash
cd mobile-app
eas submit --platform ios --profile production
```

### Submit to Google Play Store
```bash
cd mobile-app
eas submit --platform android --profile production
```

## 🎯 Post-Submission

- [ ] **iOS**: Wait for Apple review (typically 1-3 days)
- [ ] **Android**: App published immediately to Internal Testing track
- [ ] **Promote Android** app from Internal → Production when ready
- [ ] **Monitor reviews** and ratings
- [ ] **Respond to user feedback**
- [ ] **Plan updates** and new features

## 📋 Common Rejection Reasons

### Apple App Store
1. **Broken links** - Ensure your web app URL works perfectly
2. **Missing functionality** - App must provide value beyond just a web wrapper
3. **Privacy policy issues** - Must have a valid privacy policy
4. **Metadata issues** - Screenshots must accurately represent the app
5. **Minimum functionality** - Apple may reject simple web wrappers

**Tip**: Add native features like push notifications, offline support, or native UI elements to increase approval chances.

### Google Play Store
1. **Policy violations** - Review Google Play policies
2. **Content rating issues** - Ensure accurate content rating
3. **Privacy policy missing** - Must be accessible and valid
4. **APK issues** - Ensure APK builds correctly
5. **Metadata issues** - Complete all required fields

## 🚨 Important Notes

1. **Web App Must Work**: Your Streamlit app at `app.marketscannerpros.app` must be fully functional before submitting
2. **HTTPS Required**: App Store requires secure HTTPS connections
3. **Response Time**: App should load quickly (< 3 seconds)
4. **Mobile Optimization**: Web app should be mobile-responsive
5. **Terms of Service**: Consider adding ToS to avoid legal issues
6. **Support Email**: Have a working support email address
7. **Version Numbers**: Keep track of version and build numbers

## 📞 Need Help?

- **Expo EAS Docs**: https://docs.expo.dev/eas/
- **Apple App Store Review**: https://developer.apple.com/app-store/review/guidelines/
- **Google Play Console Help**: https://support.google.com/googleplay/android-developer/
