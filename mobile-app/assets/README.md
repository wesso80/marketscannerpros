# App Assets

Replace these placeholder files with your actual app icons and splash screens before submitting to stores.

## Required Assets

### icon.png
- Size: 1024x1024px
- Format: PNG
- Transparency: No
- Purpose: iOS App Icon, Android launcher icon base

### adaptive-icon.png
- Size: 1024x1024px
- Format: PNG
- Transparency: Optional
- Purpose: Android adaptive icon foreground
- Note: Design should fit within safe area (66% of canvas)

### splash.png
- Size: 1284x2778px (iPhone 14 Pro Max resolution)
- Format: PNG
- Transparency: Optional
- Purpose: Splash screen shown while app loads

### favicon.png
- Size: 48x48px
- Format: PNG
- Purpose: Web version favicon

## Design Guidelines

### Icon Design
- **Simple & Recognizable**: Should be clear at small sizes
- **No Text**: Avoid small text (won't be readable)
- **Consistent Branding**: Match your web app colors/logo
- **Safe Area**: Keep important elements centered (avoid edges)

### Suggested Icon Concept
For Market Scanner Pro, consider:
- Stock chart/candlestick icon
- Magnifying glass over chart
- Upward trending arrow
- Radar/scanner visualization
- Colors: Blue/green (finance/growth)

### Splash Screen Design
- **Simple**: Just logo + app name + background
- **Fast**: Shows while web content loads
- **Branded**: Matches overall app theme

## Tools for Creating Icons

### Online Tools (Free)
- **Canva**: https://canva.com (easy templates)
- **Figma**: https://figma.com (professional design)
- **IconKitchen**: https://icon.kitchen/ (Android adaptive icons)

### Professional Services
- **Fiverr**: $5-50 for app icon design
- **99designs**: Contest-based logo/icon design
- **Upwork**: Hire a designer

### AI Generation
- **DALL-E / Midjourney**: Generate icon concepts
- **Canva AI**: Auto-generate from text prompt

## Quick Placeholder Generation

If you need placeholders RIGHT NOW:

1. **Use Initials**: Large "MSP" letters on colored background
2. **Use Emoji**: 📊📈💹 on solid color
3. **Gradient**: Simple blue-to-green gradient
4. **Screenshot**: Crop your web app logo

### Example using ImageMagick:
```bash
# Create simple icon with text
convert -size 1024x1024 xc:#0066cc \
  -font Arial -pointsize 300 -fill white \
  -gravity center -annotate +0+0 'MSP' \
  icon.png
```

## Validation

Before submitting:
- ✓ Icon is 1024x1024px exactly
- ✓ No transparency on icon.png (iOS requirement)
- ✓ Clear and recognizable at small sizes
- ✓ Follows platform guidelines
- ✓ Doesn't violate trademarks
- ✓ High quality (not pixelated)

## Platform Guidelines

- **Apple**: https://developer.apple.com/design/human-interface-guidelines/app-icons
- **Android**: https://developer.android.com/guide/practices/ui_guidelines/icon_design_adaptive
