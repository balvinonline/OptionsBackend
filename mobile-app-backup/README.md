# Options Trading Desk - Mobile App

A dedicated, high-performance React Native (Expo) mobile application tailored for the Indian Options Trading Desk (`NIFTY`, `BANKNIFTY`, `SENSEX`, `FINNIFTY`, `MIDCPNIFTY`).

---

## Features

1. **Live Market Overview**: Real-time spot price cards, change in points/%, PCR (OI & Vol), ATM strikes, and India VIX.
2. **Algorithmic Signal Triggers**: Real-time Buyer Signals (`BUY CE` / `BUY PE`) with audio chimes and haptic vibrations.
3. **Market Gate**: Live checklist for PCR, OI buildup, absorption, and trap detection.
4. **Mobile Option Chain Matrix**: Touch-friendly strike table with CE/PE OI buildup bars, change in OI, LTP, and ATM highlight.
5. **Intraday Candlestick Charts**: Touch charts with VWAP and EMA 9 overlays and pivot levels.
6. **F&O Scanners & Market News**: Long Buildup, Short Buildup, Short Covering, Long Unwinding, and FII/DII sentiment.
7. **Zero-Friction Backend Integration**: Communicates directly with the existing Python Flask backend at `:5000`.

---

## How to Run on Your Mobile Phone (Android / iPhone)

### Method 1: Instant QR Code via Expo Go (Recommended)

1. Install **Expo Go** from Google Play Store (Android) or Apple App Store (iOS) on your phone.
2. Double click **`Start Options Mobile App.cmd`** in the project root (or run `npx expo start` inside `mobile-app`).
3. Scan the QR code displayed in the terminal using the Expo Go app (or iPhone Camera).
4. The mobile app will load instantly on your phone!

### Connecting to Your Computer's Backend over Wi-Fi

1. Ensure your phone and PC are connected to the same Wi-Fi network.
2. Find your computer's local IP address (run `ipconfig` in CMD, e.g. `192.168.1.15`).
3. In the mobile app login or settings screen, tap the Server icon and set the backend URL to:
   ```
   http://192.168.1.15:5000
   ```
4. Tap **Test Ping** and **Save & Reconnect**.

---

## How to Build Standalone Android APK (.apk)

To build a standalone APK without needing Expo Go:

```bash
cd mobile-app
npx eas-cli build -p android --profile preview
```
