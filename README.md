# 🎵 Spotify Release Hub

> A powerful desktop tool for managing your Spotify music - Follow artists from playlists and discover new releases instantly!

![Version](https://img.shields.io/badge/version-1.0.0-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Features

### 🎯 **Playlist Artist Follower**
- Analyze any Spotify playlist to find artists you're not following
- View artist profile pictures and track counts
- Bulk follow multiple artists with one click
- Fast parallel processing for large playlists

### 🆕 **New Release Finder**
- Scan all your followed artists for recent releases
- Configurable timeframe (7, 14, or 30 days)
- Preview and select specific tracks before creating playlists
- Play tracks directly in Spotify with one click
- Create custom playlists with selected songs

### 🎨 **Modern Spotify-Style UI**
- Beautiful gradient designs
- Smooth animations and transitions
- Dark theme optimized for music lovers
- Responsive and intuitive interface

### 🔔 **Smart Update Notifications**
- Automatic checks for new GitHub releases when running packaged builds
- In-app banner with release highlights and quick access to download links
- Optional GitHub token support for private repositories or higher rate limits

---

## 📥 Download

### Windows
- **[Download Installer](https://github.com/yourusername/spotify-release-hub/releases/latest/download/Spotify-Release-Hub-1.0.0-x64.exe)** (Recommended)
- **[Download Portable](https://github.com/yourusername/spotify-release-hub/releases/latest/download/Spotify-Release-Hub-1.0.0-Portable.exe)** (No installation required)

### macOS
- **[Download DMG](https://github.com/yourusername/spotify-release-hub/releases/latest/download/Spotify-Release-Hub-1.0.0.dmg)**

### Linux
- **[Download AppImage](https://github.com/yourusername/spotify-release-hub/releases/latest/download/Spotify-Release-Hub-1.0.0.AppImage)**

---

## 🚀 Getting Started

### Installation

#### Windows
1. Download the installer
2. Run `Spotify-Release-Hub-1.0.0-x64.exe`
3. Follow the installation wizard
4. Launch from Start Menu or Desktop shortcut

**Note:** Windows Defender may show a warning for unsigned apps. Click "More info" → "Run anyway"

#### macOS
1. Download the DMG file
2. Open the DMG and drag the app to Applications
3. Launch from Applications folder
4. If you see "App can't be opened" - go to System Preferences → Security & Privacy → Click "Open Anyway"

#### Linux
1. Download the AppImage
2. Make it executable: `chmod +x Spotify-Release-Hub-1.0.0.AppImage`
3. Run: `./Spotify-Release-Hub-1.0.0.AppImage`

### First Time Setup

1. **Launch the app**
2. **Click "Connect to Spotify"**
3. **Log in with your Spotify account** (opens in browser)
4. **Authorize the app**
5. **You're ready to go!** 🎉

---

## 📖 How to Use

### Follow Artists from a Playlist

1. Go to **"Follow from Playlist"** tab
2. Paste any Spotify playlist URL
3. Click **"Analyze Playlist"**
4. Review the list of artists you're not following
5. Select the artists you want to follow
6. Click **"Follow Selected Artists"**

### Discover New Releases

1. Go to **"Find New Releases"** tab
2. Select timeframe (7, 14, or 30 days)
3. Enable **Test Mode** for faster scanning (optional)
4. Click **"Scan for New Releases"**
5. Wait for results (progress shown in real-time)
6. Choose an option:
   - **Create Playlist from All**: Add all releases to a new playlist
   - **Load Tracks for Preview**: Select specific songs

### Preview and Select Tracks

1. After scanning, click **"Load Tracks for Preview & Selection"**
2. Click **▶ Play buttons** to open tracks in Spotify
3. **Select tracks** you want by clicking checkboxes
4. Use **Select All** / **Deselect All** for bulk actions
5. Enter a **playlist name**
6. Click **"Export X Tracks"** to create your custom playlist

---

## 🔧 Requirements

- **Spotify Account** (Free or Premium)
- **Operating System:**
  - Windows 10 or later
  - macOS 10.13 or later
  - Linux (64-bit)
- **Internet Connection** (required for Spotify API)
- **~150 MB** disk space

---

## ❓ FAQ

### Is this app safe?
Yes! This is an open-source project. The app only requests permissions to:
- View your followed artists
- View and modify your playlists
- Follow/unfollow artists

Your Spotify password is **never** stored or accessed by this app.

### Does this work with Spotify Free?
Yes! All features work with both Free and Premium accounts.

### How many artists can I follow at once?
You can follow as many artists as you want! The app processes them in batches to avoid rate limits.

### Why does Windows Defender block the app?
The app is not code-signed (costs $400/year). It's safe - you can click "More info" → "Run anyway". The source code is open for review.

### Can I use this on multiple computers?
Yes! Just download and install on each device. Your Spotify authentication works across all installations.

### Does this app cost money?
No! It's completely **FREE** and open-source.

---

## 🐛 Issues & Support

Found a bug? Have a feature request?

- **[Open an Issue](https://github.com/yourusername/spotify-release-hub/issues)**
- **[View Documentation](https://github.com/yourusername/spotify-release-hub/wiki)**

---

## 🛠️ Building from Source

Want to build the app yourself?

```bash
# Clone the repository
git clone https://github.com/yourusername/spotify-release-hub.git
cd spotify-release-hub

# Install dependencies
npm install

# Copy environment template and add your Spotify credentials
cp .env.example .env
# Get credentials from: https://developer.spotify.com/dashboard
# (Optional) configure GitHub update variables in .env to enable release notifications

# Run in development mode
npm run dev

# Build for production
npm run build

# Create installers
npm run dist:win     # Windows
npm run dist:mac     # macOS
npm run dist:linux   # Linux
```

---

## 📜 License

MIT License - feel free to use, modify, and distribute!

---

## 🙏 Credits

Built with:
- [Electron](https://www.electronjs.org/) - Desktop framework
- [React](https://react.dev/) - UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Vite](https://vitejs.dev/) - Build tool
- [Spotify Web API](https://developer.spotify.com/) - Music data

---

## ⭐ Support the Project

If you find this app useful:
- ⭐ Star the repository
- 🐦 Share on Twitter
- 🐛 Report bugs
- 💡 Suggest features
- 🤝 Contribute code

---

**Made with ❤️ for Spotify power users**
