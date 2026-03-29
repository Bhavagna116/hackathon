# Alert System Not Working - Diagnostic Checklist

## Issue #1: 401 Unauthorized Error ⚠️ **CRITICAL**

### The Problem
You clicked "ALERT" on the dashboard without being logged in first.

### The Reason
The backend requires authentication. When you're not logged in, the backend rejects the request with **401 Unauthorized**.

### The Solution
**BEFORE clicking ALERT, you MUST log into the dashboard.**

**How to log in:**
1. Go to dashboard: http://localhost:5173
2. Look for "Login" button/page
3. Enter credentials (need admin or officer account)
4. After successful login, THEN click ALERT

---

## Issue #2: Firebase Not Configured ⚠️ **MAJOR**

### The Problem
You're not sure if Firebase is set up for push notifications.

### Why This Matters
There are TWO ways alerts reach the officer app:
1. **Socket.io (Real-time)** - Instantly if app is open
2. **Firebase FCM** - Push notification if app is closed

Without Firebase configured, officers only get alerts if the app is ALREADY OPEN.

### What You Need to Provide
Firebase requires:
- [ ] Firebase Project ID
- [ ] Google Services JSON file (Android)
- [ ] GoogleService-Info.plist (iOS)
- [ ] FCM Server Key
- [ ] Firebase authentication configured in Flutter

**Do you have Firebase set up?** If not, I can help you set it up.

---

## Issue #3: Socket Alert Delivery Flow

Even if you were logged in, there's still a chance the alert doesn't reach Flutter if:

### Check Point 1: Officer Has "FREE" Status
- [ ] On dashboard, officer should be **GREEN marker** (free)
- [ ] If RED or YELLOW, click on them and check status
- [ ] Database: `db.officer_tracking.findOne()` should show `availability_status: "free"`

### Check Point 2: Officer Has Location
- [ ] Officer location must be saved in database
- [ ] Database: `db.officer_tracking.findOne()` should have `last_latitude` and `last_longitude`
- [ ] If missing, the alert won't be dispatched

### Check Point 3: Alert Booth Is Near Officer
- [ ] The booth coordinates must be somewhat near officer's location (within search radius ~100km)
- [ ] If too far, backend won't assign the officer

### Check Point 4: Flutter App Connected to Socket
- [ ] Flutter app must be connected to socket server
- [ ] Check Flutter logs: Should see "Socket connected"
- [ ] If you don't see this, socket URL is wrong

### Check Point 5: Officer Joined Socket Room
- [ ] After socket connects, officer must join their room
- [ ] Check logs: Should see "User [officer_id] joined their private room"
- [ ] If missing, alert can't be delivered to that room

---

## Required Setup Checklist

### Backend Setup
- [ ] MongoDB connected and working ✅ (you confirmed)
- [ ] Backend running on port 8000 ✅
- [ ] Backend has .env file with SOCKET_SERVER_URL
- [ ] Officer account created and logged in

### Socket Server Setup
- [ ] Socket server running on port 3000 ✅
- [ ] Can receive HTTP POST to /dispatch-alert
- [ ] Can emit socket messages to officers

### Dashboard Setup
- [ ] Dashboard running on port 5173 ✅
- [ ] **Dashboard is LOGGED IN** ❌ **YOU SKIPPED THIS!**
- [ ] Officer visible on map as green marker
- [ ] Can click ALERT without errors

### Flutter Setup
- [ ] Flutter app installed and running ✅
- [ ] Officer logged in
- [ ] Location permission granted
- [ ] Location being sent to backend ✅
- [ ] Socket.io connected ❓ **NEED TO VERIFY**
- [ ] Firebase configured (optional but recommended)

### Database Setup
- [ ] Officer exists in `officers_auth` collection ✅
- [ ] Officer has unique_id, username, email
- [ ] Officer tracking exists in `officer_tracking` collection
- [ ] Officer has `availability_status: "free"` and location

---

## Why 401 Error Happened

```
Your Request Flow:
Dashboard (NOT LOGGED IN)
    ↓
POST /incidents/create
    ↓
Backend checks: "Is this user authenticated?"
    ↓
NO AUTH TOKEN FOUND
    ↓
Backend: "401 Unauthorized - Get lost!"
    ↓
Request REJECTED before reaching alert logic
```

**The fix:** Just log in first!

---

## What We Need From You

### 1. Firebase Configuration (CRITICAL if you want push notifications)
Do you have:
- [ ] Firebase project created?
- [ ] google-services.json file?
- [ ] GoogleService-Info.plist file?
- [ ] FCM API enabled?

**If NO:** I can guide you through Firebase setup

### 2. Authentication Details
What login credentials exist?
- [ ] Admin account (username/password)
- [ ] Officer account (username/password)
- [ ] Which one were you supposed to use?

**Need:** Username and temporary password for testing

### 3. Logs From Your Test
When you tried to click ALERT, what EXACTLY happened?
- [ ] Any error message on screen?
- [ ] Any console error?
- [ ] What was in backend logs?

**Need:** Copy-paste the exact error message

### 4. Network Configuration
- [ ] What is your PC's IP address? (not 192.168.0.147)
- [ ] Is it a different network now?
- [ ] Are all services using the same IP?

**Need:** Your actual IP address to verify configuration

---

## Proper Test Procedure (What You Should Do)

### Step 1: Dashboard Login
1. Go to http://localhost:5173
2. Look for login/auth screen
3. Enter admin or officer credentials
4. **Wait for successful login**
5. **Verify you see "Logout" button or user name**

### Step 2: Verify Officer Status
1. Look at map on dashboard
2. Find the officer
3. **Officer marker should be GREEN** (not red, not yellow)
4. If not green, click on officer and change status to "Free"

### Step 3: Create Alert Booth
1. Click "+" button
2. Enter test coordinates: 20.5937, 78.9629
3. Click "Pin Booth"
4. Click on booth marker
5. **Read the info window**

### Step 4: Click ALERT
1. In booth info window, find "ALERT" button
2. Click it
3. **Wait 2-3 seconds**
4. **Check dashboard console** (F12) for success message

### Step 5: Monitor Logs
**Open these WHILE testing:**
- Terminal 1 (backend): Watch for "DEBUG: Socket alert dispatched"
- Terminal 2 (socket): Watch for "[HTTP Dispatch]"
- Terminal 4 (Flutter): `flutter logs` watch for "REAL-TIME INCIDENT ALERT RECEIVED"

### Step 6: Check Flutter App
1. Look at Flutter app running on phone
2. **Check if alert appears in Recent Alerts section**
3. Check if emergency banner appears at top

---

## External Requirements Checklist

### Firebase (Optional but Recommended)
- [ ] Do you have a Firebase account?
- [ ] Can you create a Firebase project?
- [ ] Can you download JSON credentials?
- [ ] **If NO to any:** Tell me and I'll help you set it up

### MongoDB (Already Have ✅)
- [ ] Connection string
- [ ] Database name
- [ ] Collections created
- Status: **✅ Working**

### Email Config (For Alerts)
- [ ] Do you want email alerts to officers?
- [ ] Do you have SMTP configured?
- [ ] Default: Can skip this for now

### Network/Firewall
- [ ] Can device reach backend (port 8000)?
- [ ] Can device reach socket server (port 3000)?
- [ ] No firewall blocking?

---

## Next Steps

### Immediate (Do This First)
1. [ ] Get your actual network IP address
2. [ ] Update .env files with correct IP
3. [ ] Stop all services and restart them
4. [ ] **LOG INTO THE DASHBOARD**
5. [ ] Test alert again following "Proper Test Procedure"

### If Alert Still Doesn't Work
1. [ ] Share the exact error messages
2. [ ] Show me the backend logs
3. [ ] Show me Flutter logs with `-i "alert\|socket"`
4. [ ] Tell me what you see on dashboard

### For Push Notifications
1. [ ] Ask if you want Firebase push notifications
2. [ ] If YES: Provide Firebase credentials and I'll set it up
3. [ ] If NO: Just use socket alerts when app is open

---

## Summary

**Main Issue Found:** ❌ You weren't logged into the dashboard (401 error)

**Other Issues to Check:**
- ❓ Firebase not set up (need confirmation)
- ❓ Officer socket not connected (need logs to verify)
- ❓ Wrong network IP (need your actual IP)

**What to Do Now:**
1. Get your actual network IP (not 192.168.0.147)
2. **LOG INTO DASHBOARD FIRST**
3. Test alert again
4. Share logs if it still doesn't work

**What I Need From You:**
1. Your actual network IP address
2. Login credentials for dashboard
3. Firebase account details (or confirmation you don't have it)
4. Error logs from the test attempt
