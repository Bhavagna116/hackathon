# Alert System Testing - Step-by-Step Execution Guide

## Prerequisites Checklist
- [ ] MongoDB is accessible
- [ ] At least one officer already registered in the system
- [ ] Your development machine on same Wi-Fi or accessible network
- [ ] Ports 8000, 3000, 5173 are available
- [ ] Node.js installed for socket server
- [ ] Python 3.8+ installed for backend
- [ ] Flutter SDK installed for officer app
- [ ] Dashboard dependencies installed (`npm install`)

## Setup Phase

### Step 1: Get Your Network IP
```bash
# On Windows (PowerShell)
ipconfig | findstr "IPv4"

# On Mac/Linux
ifconfig | grep inet

# Expected output: Something like 192.168.0.147 or 10.0.x.x
```
**Save this IP** - you'll need it for all services.

---

## Execution Phase

### Step 2: Start All Services (Open separate terminals for each)

#### Terminal 1: Backend API Server
```bash
cd election_patrol_backend

# Create .env file if not exists
cat > .env << 'EOF'
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/election_patrol?retryWrites=true&w=majority
MONGODB_DB_NAME=election_patrol
SOCKET_SERVER_URL=http://192.168.0.147:3000
EOF

# Replace 192.168.0.147 with your actual IP!

# Start backend
python main.py
```

**Expected output:**
```
MongoDB connected successfully.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

#### Terminal 2: Socket Server
```bash
cd election_patrol_socket_server

# Install dependencies (if needed)
npm install

# Start socket server
node server.js
```

**Expected output:**
```
Connected to MongoDB via Mongoose
Node.js Socket.io Server running on port 3000 (0.0.0.0)
```

---

#### Terminal 3: Dashboard
```bash
cd election_patrol_dashboard

# Create .env file if not exists
cat > .env << 'EOF'
VITE_BASE_URL=http://192.168.0.147:8000
VITE_WS_URL=ws://192.168.0.147:8000
VITE_NODE_SOCKET_URL=http://192.168.0.147:3000
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key
EOF

# Replace IP with your actual IP!

# Start dashboard
npm run dev
```

**Expected output:**
```
  VITE v4.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

---

#### Terminal 4: Flutter Officer App
```bash
cd election_patrol_officer

# For Physical Device on same network:
flutter run \
  --dart-define=BASE_URL=http://192.168.0.147:8000 \
  --dart-define=SOCKET_SERVER_URL=http://192.168.0.147:3000

# For Android Emulator:
flutter run \
  --dart-define=BASE_URL=http://10.0.2.2:8000 \
  --dart-define=SOCKET_SERVER_URL=http://10.0.2.2:3000
```

**Expected output:**
```
✓ Built build/app/outputs/flutter-apk/app-debug.apk
Installing and launching...
Socket connected: xxxxxxxx
```

---

## Testing Phase

### Step 3: Verify Dashboard Connection
Open browser: **http://localhost:5173**

You should see:
- [ ] Map loads with dark theme
- [ ] Control room showing
- [ ] "+" button in top-left

### Step 4: Wait for Officer Connection
In **Flutter logs** (Terminal 4), you should see:
```
Socket connected: xxxxxxxx
User connected to socket
```

In **Backend logs** (Terminal 1), you should see:
```
Location update received
Officer tracking updated
```

### Step 5: Create Alert
On **Dashboard**:
1. [ ] Click "+" button (top-left)
2. [ ] Enter latitude: `20.5937`
3. [ ] Enter longitude: `78.9629`
4. [ ] Click "Pin Booth"
5. [ ] Click on booth marker
6. [ ] Click "ALERT" button

**Dashboard Console** should show:
```
[NodeSocket] Dispatching alert to [officer_id]: {incident_id, ...}
```

### Step 6: Check Backend Logs
**Terminal 1** should show:
```
DEBUG: Socket alert dispatched to [officer_id]
```

### Step 7: Check Socket Server Logs
**Terminal 2** should show:
```
[HTTP Dispatch] Alerting user [officer_id]
User [officer_id] joined their private room
```

### Step 8: Verify Officer Receives Alert
**Flutter logs** (Terminal 4) should show:
```
REAL-TIME INCIDENT ALERT RECEIVED: {incident_id, ...}
```

**Officer App Screen** should show:
- [ ] Red alert banner at top: "ACTIVE EMERGENCY ALERT"
- [ ] Alert appears in "Recent Alerts" below availability status
- [ ] Alert shows incident type and severity

---

## Success Checklist

- [ ] Backend running without errors
- [ ] Socket server running without errors
- [ ] Dashboard loads and shows map
- [ ] Officer app connected and tracking location
- [ ] Dashboard officer marker is GREEN (free status)
- [ ] Can click "ALERT" button
- [ ] Backend logs show "Socket alert dispatched"
- [ ] Socket server logs show "[HTTP Dispatch]"
- [ ] Flutter logs show "REAL-TIME INCIDENT ALERT RECEIVED"
- [ ] Officer app displays alert in Recent Alerts
- [ ] Officer app displays emergency banner
- [ ] Officer marker turns RED on dashboard (assigned)

---

## Troubleshooting

### Issue: "Connection refused" errors

**Check 1: Services Running?**
```bash
# Check backend
curl http://192.168.0.147:8000/docs

# Check socket server
curl http://192.168.0.147:3000/

# Should get responses, not connection refused
```

**Check 2: Firewall?**
```bash
# Windows Defender might be blocking ports
# Open Windows Defender > Firewall > Allow app through firewall
# Add Python, Node.js, Flutter to allowed apps
```

**Check 3: Wrong IP?**
```bash
# Verify IP in all three .env files matches
grep "192.168.0.147" election_patrol_backend/.env
grep "192.168.0.147" election_patrol_dashboard/.env
grep "SOCKET_SERVER_URL" election_patrol_officer/lib/utils/constants.dart
```

---

### Issue: "No free officers for incident"

**Cause:** Officer status is not "free"
- Check dashboard: Officer should be GREEN marker
- Check MongoDB: `db.officer_tracking.findOne()` should have `availability_status: "free"`
- On Flutter app: Make sure "Free" status is selected (not Busy or Assigned)

---

### Issue: Officer never receives alert

**Check Sequence:**
1. Backend logs: See "DEBUG: Socket alert dispatched"?
   - If NO → Backend not finding officers
   - Check officer has location (`last_latitude`, `last_longitude`)
   - Check officer status is "free"

2. Socket server logs: See "[HTTP Dispatch] Alerting user"?
   - If NO → Backend not posting to socket server
   - Check `SOCKET_SERVER_URL` in backend .env
   - Check socket server is actually running

3. Flutter logs: See "REAL-TIME INCIDENT ALERT RECEIVED"?
   - If NO → Officer not connected to socket or wrong room
   - Check Flutter `SOCKET_SERVER_URL` matches backend's
   - Check officer is logged in and tracking

---

### Issue: Socket Server Connection Timeout

**Solution:**
```bash
# Kill all node processes
taskkill /F /IM node.exe  # Windows
killall node              # Mac/Linux

# Restart
node election_patrol_socket_server/server.js
```

---

### Issue: Flutter App Crashes on Launch

**Solution:**
```bash
# Clean flutter build
flutter clean

# Pub get
flutter pub get

# Run again
flutter run --dart-define=BASE_URL=... --dart-define=SOCKET_SERVER_URL=...
```

---

## Monitoring Commands

Keep these running in extra terminals to watch real-time logs:

```bash
# Watch Flutter app logs
flutter logs | grep -i "socket\|alert\|error"

# Watch backend logs (tail the output)
# Just observe the Terminal 1 where you started the backend

# Watch MongoDB (if you have a MongoDB client)
mongo "mongodb://..." --eval "db.officer_tracking.find().pretty()"
```

---

## End-to-End Alert Flow Diagram

```
DASHBOARD                    BACKEND                 SOCKET SERVER           FLUTTER APP
   |                           |                          |                       |
   | Click ALERT button        |                          |                       |
   |----POST /incidents/create--->                        |                       |
   |                           |                          |                       |
   |                    Find FREE officers               |                       |
   |                    (within radius)                   |                       |
   |                           |                          |                       |
   |                    Update officer status             |                       |
   |                    to "assigned"                     |                       |
   |                           |                          |                       |
   | Show success toast        | POST /dispatch-alert----->                       |
   |                           |                          |                       |
   |                           |              emit "incidentAlert" to room------->|
   |                           |                          |                       |
   |                           |                          |  Receive and parse   |
   |                           |                          |  Display in alerts   |
   |                           |                          |  Show emergency banner
   |                           |                          |                      |
   v                           v                          v                       v
```

---

## Success Indicators

### Dashboard Console
```javascript
[NodeSocket] Connected!
[NodeSocket] Dispatching alert to f3a8c9e2-1f94-4a8a-b4c1-2e5d8f7g9h1k
```

### Backend Terminal
```
DEBUG: No free officers for incident (if no officers available)
DEBUG: Socket alert dispatched to f3a8c9e2-1f94-4a8a-b4c1-2e5d8f7g9h1k
```

### Socket Server Terminal
```
[HTTP Dispatch] Alerting user f3a8c9e2-1f94-4a8a-b4c1-2e5d8f7g9h1k
Dispatching real-time alert to user f3a8c9e2-1f94-4a8a-b4c1-2e5d8f7g9h1k
```

### Flutter Logs
```
Socket connected: xxxxxxxx
REAL-TIME INCIDENT ALERT RECEIVED: {incident_id: ..., incident_type: booth_capture, ...}
```

---

## After Successful Test

1. **Stop all services** (Ctrl+C in each terminal)
2. **Commit your test run** (optional)
3. **Document any issues** found
4. **Proceed to deployment** (if tests passed)

---
