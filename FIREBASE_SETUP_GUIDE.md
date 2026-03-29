# Firebase Setup for Push Notifications

## What You Need From Firebase

Firebase requires these files for your Flutter app:

### For Android:
- **google-services.json** ← Most Important

### For iOS:
- **GoogleService-Info.plist** ← Only if supporting iOS

### For Web (Dashboard):
- **Firebase Config Object** (not needed for alerts but for completeness)

---

## Step 1: Find Your Firebase Files

### 🔍 Where to Find google-services.json

In your Firebase Console:
1. Go to https://console.firebase.google.com
2. Select your project
3. Click ⚙️ Settings → Project Settings
4. Go to Your Apps section
5. Find your Android app
6. Click "google-services.json" download button
7. Pick the one that makes sense

**You should see:**
```
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "...",
  "client_email": "...",
  "client_id": "...",
  ...
}
```

### 📱 If you don't see it in Firebase Console:

1. Open Firebase Console
2. Click your project
3. Left menu → Project Settings
4. Tab: "Your Apps"
5. Look for Android app icon (green square)
6. Click to expand
7. Download "google-services.json"

**If Android app isn't listed:**
1. Click "Add App"
2. Select "Android"
3. Download the JSON file

---

## Step 2: Place Files in Flutter Project

### Android:
```
election_patrol_officer/
├── android/
│   ├── app/
│   │   └── google-services.json  ← PUT HERE
│   └── build.gradle
└── lib/
```

**Exact Path:** `election_patrol_officer/android/app/google-services.json`

### iOS (Optional):
```
election_patrol_officer/
├── ios/
│   └── Runner/
│       └── GoogleService-Info.plist  ← PUT HERE
└── android/
```

---

## Step 3: Update Flutter Dependencies

The files should already be in pubspec.yaml, but make sure:

```bash
cd election_patrol_officer
flutter pub get
```

Expected packages (should be installed):
- firebase_core
- firebase_messaging

---

## Step 4: Make Sure Firebase is Initialized

Check that your Flutter code initializes Firebase on startup.

In `lib/main.dart`, make sure Firebase is initialized:

```dart
import 'package:firebase_core/firebase_core.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase
  await Firebase.initializeApp();

  runApp(const MyApp());
}
```

---

## Step 5: Test Firebase Connection

Run your Flutter app:

```bash
flutter clean
flutter pub get
flutter run
```

**Check logs for:**
```
✓ Firebase initialized successfully
I/FirebaseInitProvider: FirebaseApp initialization is starting.
```

---

## Step 6: Verify FCM Token is Registered

The NotificationService should automatically:
1. Request FCM token
2. Send it to backend

**Check logs for:**
```
I/FirebaseMessaging: get token from provider
Registration token obtained. Token is: eM3...
```

Or in NotificationService logs:
```
FCM Token registered successfully
```

---

##Step 7: Test Push Notification

### Option A: Using Firebase Console (Recommended)

1. Go to Firebase Console
2. Left menu → Cloud Messaging
3. Click "Send your first message"
4. Title: "Test"
5. Message: "This is a test"
6. Click "Send test message"
7. Select your app/device
8. Click "Test" button

**You should see notification on phone!**

### Option B: Test With Backend

The backend should automatically send FCM notifications when creating an incident.

---

## Troubleshooting Firebase

### Issue: "No google-services.json"
**Solution:**
```bash
# Check if file exists
ls -la election_patrol_officer/android/app/google-services.json

# If not found, download from Firebase Console again
```

### Issue: Firebase initialization fails
**Fix:** Make sure `main.dart` has:
```dart
await Firebase.initializeApp();
```

### Issue: No FCM token in logs
**Fix:** Check that:
1. google-services.json is in correct location
2. Firebase initialized in main.dart
3. App has internet permission
4. App has notification permission

### Issue: Push notification doesn't appear
**Check:**
1. Is FCM token registered? (check logs)
2. Is notification permission granted on phone?
3. Is app in background or closed?
4. Check notification settings on phone (not silenced?)

---

## How Alert + Firebase Works Together

```
SOCKET ALERT (Real-time when app is OPEN):
Dashboard/Backend sends incident
      ↓
Socket Server receives it
      ↓
Emits to officer's socket room
      ↓
Flutter receives instantly
      ↓
Displays in Recent Alerts

+

FCM PUSH (Notification even when app is CLOSED):
Backend sends incident
      ↓
Backend also sends FCM push notification
      ↓
Firebase Cloud Messaging
      ↓
Officer's phone gets notification
      ↓
Officer taps notification
      ↓
App opens and shows alert details
```

---

## What I Need From You

Share:
1. **google-services.json file** (first 20 lines are OK, don't need private key)
2. **Your Firebase Project ID** (so I can see config)
3. **Error messages** if Firebase setup fails

Or tell me:
- [ ] "I found google-services.json and placed it in android/app/"
- [ ] "I don't have this file and need help"
- [ ] "I have multiple google-services.json files, which one?"

---

## Once Firebase is Set Up

Integration happens automatically:

1. ✅ Google-services.json placed
2. ✅ Firebase initialized in main.dart (already done)
3. ✅ FCM token registered (happens in NotificationService)
4. ✅ Backend sends both socket alerts + FCM

Now officers get:
- Real-time socket alerts when app is open
- Push notifications via FCM when app is closed

---

## Summary

**Firebase adds** → Push notifications even when app is closed

**Socket (already fixed)** → Real-time alerts when app is open

**Together** → Complete alert system ✅

---

## Next Steps

1. **Find google-services.json** in Firebase Console
2. **Place it** in `election_patrol_officer/android/app/`
3. **Run** `flutter clean && flutter pub get && flutter run`
4. **Check logs** for Firebase initialization
5. **Test** with Firebase Console → Send test message
6. **Report back** if any issues

Ready to help debug if you get stuck!
