# Achour Player

A professional, high-performance IPTV & Media Player with Royal Pro aesthetics, advanced HLS/Video.js streaming, EPG grid, and Capacitor Android support.

## Features
- **Live IPTV & VOD Streaming**: Support for Xtream Codes API, M3U/M3U8 playlists, and local files.
- **Advanced Player Integration**: HLS.js and Video.js playback with hardware acceleration.
- **Electronic Program Guide (EPG)**: Interactive grid for channel schedules.
- **Capacitor Mobile Support**: Ready for Android deployment and APK generation.

---

## 🚀 How to Push to a New GitHub Repository

1. **Initialize Git (if not already initialized):**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Achour Player ready for APK build"
   ```

2. **Create a New Repository on GitHub:**
   - Go to [GitHub](https://github.com) and create a new repository (e.g., `Achourplayer`). Do not initialize with README or license.

3. **Link and Push:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git
   git branch -M main
   git push -u origin main
   ```

---

## 📱 How to Build the Android APK

1. **Install Prerequisites:**
   - [Node.js](https://nodejs.org/) (v18+)
   - [Android Studio](https://developer.android.com/studio) with Android SDK & Gradle.

2. **Build Web Assets:**
   ```bash
   npm install
   npm run build
   ```

3. **Sync with Capacitor:**
   ```bash
   npx cap sync android
   ```

4. **Open in Android Studio & Export APK:**
   ```bash
   npx cap open android
   ```
   - In Android Studio, go to **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
   - Once built, click **Locate** to find your `.apk` file!

---

## License
MIT License
