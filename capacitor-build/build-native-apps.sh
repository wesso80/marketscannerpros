#!/bin/bash

echo "🚀 Building Market Scanner Native Apps with Capacitor..."

# Ensure we're in the correct directory
cd "$(dirname "$0")"

# Copy your web app assets to a local build directory
echo "📦 Preparing web assets..."
rm -rf web-build
mkdir -p web-build

# Copy static files from parent directory
cp -r ../static/* web-build/
cp ../app.py web-build/ # For reference

# Create a simple index.html that redirects to your deployed app
cat > web-build/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Market Scanner</title>
    <link rel="manifest" href="/manifest.webmanifest">
    <meta name="theme-color" content="#111111">
    <style>
        body {
            margin: 0;
            padding: 0;
            height: 100vh;
            background: #111111;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .loader {
            text-align: center;
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 3px solid #333;
            border-top: 3px solid #007AFF;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loader">
        <div class="spinner"></div>
        <h2>Loading Market Scanner...</h2>
        <p>Connecting to live data...</p>
    </div>
    
    <script>
        // Replace with your actual deployed URL
        const APP_URL = 'YOUR_DEPLOYED_URL'; // e.g., 'https://your-app.replit.app'
        
        if (APP_URL !== 'YOUR_DEPLOYED_URL') {
            // Redirect to your deployed Streamlit app
            setTimeout(() => {
                window.location.href = APP_URL;
            }, 2000);
        } else {
            document.querySelector('.loader').innerHTML = `
                <h2>⚠️ Configuration Required</h2>
                <p>Please update APP_URL in web-build/index.html</p>
                <p>with your deployed Replit app URL</p>
            `;
        }
    </script>
</body>
</html>
EOF

# Update capacitor config to use web-build directory
sed -i 's|webDir: "../static"|webDir: "web-build"|g' capacitor.config.ts

# Initialize Capacitor (if not already done)
echo "⚡ Initializing Capacitor..."
npx cap init "Market Scanner" "com.yourcompany.marketscanner" --web-dir="web-build"

# Add platforms
echo "📱 Adding iOS and Android platforms..."
npx cap add ios || echo "iOS already added or unavailable"
npx cap add android || echo "Android already added or unavailable"

# Sync web assets to native projects
echo "🔄 Syncing assets..."
npx cap sync

echo "✅ Native apps ready!"
echo ""
echo "📋 Next Steps:"
echo "1. Update web-build/index.html with your deployed app URL"
echo "2. For iOS: Run 'npm run open-ios' (requires Xcode on macOS)"
echo "3. For Android: Run 'npm run open-android' (requires Android Studio)"
echo ""
echo "🚀 App Store Distribution:"
echo "• iOS: Build and distribute through Xcode to App Store"
echo "• Android: Generate signed APK/AAB through Android Studio for Google Play"