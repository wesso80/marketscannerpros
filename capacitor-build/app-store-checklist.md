# 📱 App Store Submission Checklist

## Before Building
- [ ] **Unified App Identity**
  - [ ] Bundle ID consistent: `com.marketscanner.pro`
  - [ ] App name consistent: "Market Scanner Pro"
  - [ ] Version numbers match across platforms

## Android - Google Play Store
### Technical Requirements
- [ ] **Signing Configuration**
  - [ ] Release keystore generated
  - [ ] Gradle signingConfigs configured
  - [ ] AAB bundle signed and tested
- [ ] **App Details**
  - [ ] versionCode incremented
  - [ ] versionName updated
  - [ ] targetSdkVersion latest (API 34+)

### Store Listing
- [ ] **Store Assets**
  - [ ] App icon: 512x512px
  - [ ] Screenshots: Phone + Tablet
  - [ ] Feature graphic: 1024x500px
- [ ] **Descriptions**
  - [ ] App description (max 4000 chars)
  - [ ] Short description (max 80 chars)
  - [ ] Release notes
- [ ] **Compliance**
  - [ ] Privacy Policy URL
  - [ ] Data Safety form completed
  - [ ] Content rating questionnaire

## iOS - Apple App Store
### Technical Requirements  
- [ ] **Signing & Certificates**
  - [ ] Apple Developer account active
  - [ ] Distribution certificate valid
  - [ ] Provisioning profile configured
  - [ ] Archive builds successfully
- [ ] **App Configuration**
  - [ ] Bundle ID matches App Store Connect
  - [ ] Build number incremented
  - [ ] iOS deployment target set

### Store Listing
- [ ] **App Store Connect Setup**
  - [ ] App created with correct Bundle ID
  - [ ] App Information completed
  - [ ] Pricing selected
- [ ] **Store Assets**
  - [ ] App icon: 1024x1024px
  - [ ] Screenshots: All required device sizes
  - [ ] App previews (optional)
- [ ] **Metadata**
  - [ ] App name and subtitle
  - [ ] Description and promotional text
  - [ ] Keywords (max 100 chars)
  - [ ] Support URL
  - [ ] Privacy Policy URL ⚠️ **Required**

## Critical Considerations

### WebView App Risks
⚠️ **Apple App Review Guidelines 4.2**:
- Apps must offer more than a website wrapper
- Consider adding native features:
  - [ ] Push notifications
  - [ ] Native file access
  - [ ] Device-specific capabilities
  - [ ] Offline functionality

### Alternative: Progressive Web App (PWA)
Instead of native apps, consider PWA:
- [ ] Web app manifest configured
- [ ] Service worker for offline support  
- [ ] Add to homescreen functionality
- [ ] No app store approval needed

### Production Deployment
- [ ] **Stable Domain**
  - [ ] Custom domain instead of Replit subdomain
  - [ ] SSL certificate valid
  - [ ] High uptime guarantee
- [ ] **Performance**
  - [ ] CDN for static assets
  - [ ] Database optimized for production
  - [ ] Error monitoring setup

## Pre-Submission Testing
- [ ] **Functional Testing**
  - [ ] All features work on mobile
  - [ ] Network connectivity handled gracefully
  - [ ] App doesn't crash on startup
  - [ ] Navigation works properly
- [ ] **Device Testing**
  - [ ] Test on multiple screen sizes
  - [ ] Test on different OS versions
  - [ ] Test with slow/no internet

## After Submission
- [ ] **Monitor Review Status**
  - [ ] Respond to reviewer questions quickly
  - [ ] Fix rejection issues promptly
  - [ ] Update app description if needed
- [ ] **Post-Launch**
  - [ ] Monitor crash reports
  - [ ] Update app for OS changes
  - [ ] Respond to user reviews

## Support Materials
- Privacy Policy template: [privacypolicygenerator.info](https://privacypolicygenerator.info)
- Terms of Service template: [termly.io](https://termly.io)
- App Store Guidelines: [Apple](https://developer.apple.com/app-store/review/guidelines/) | [Google](https://play.google.com/about/developer-content-policy/)