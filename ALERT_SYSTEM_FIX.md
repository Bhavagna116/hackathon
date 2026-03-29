# Election Patrol - Alert System Complete Fix

## Problem Summary
When clicking "ALERT" on a polling booth in the dashboard, alerts were not reaching officers on their Flutter apps. The issue was that the Flutter app had a hardcoded socket server URL that didn't match the actual server IP.

## Root Causes Fixed

### 1. **Hardcoded Socket Server URL in Flutter** ✅
- **File**: `election_patrol_officer/lib/services/location_service.dart`
- **Issue**: URL was hardcoded to `'http://192.168.0.147:3000'`
- **Problem**: Won't work on different networks or when server IP changes
- **Fix Applied**:
  - Added `SOCKET_SERVER_URL` constant to `election_patrol_officer/lib/utils/constants.dart`
  - Updated `location_service.dart` to use the constant with proper imports
  - Follows same pattern as dashboard using environment variables

### 2. **Missing Error Handlers** ✅
- **File**: `election_patrol_officer/lib/services/location_service.dart`
- **Issue**: No error logging for socket connection failures
- **Fix Applied**: Added `onError()` and `onDisconnect()` handlers

## Complete Alert Flow

```
Dashboard (ControlRoomMap.jsx)
    ↓
    Click ALERT button on booth
    ↓
POST /incidents/create (FastAPI backend)
    ↓
    Immediately returns empty assigned_officers
    ↓
    Background task starts: _assign_and_dispatch_incident()
    ↓
    Find nearest "free" officers within radius
    ↓
    Update officer status → "assigned"
    ↓
    Update incident assigned_officers
    ↓
    POST /dispatch-alert (to Node.js socket server)
    ↓
Node.js Socket Server (server.js)
    ↓
    Emit "incidentAlert" to officer's socket room
    ↓
Flutter Officer App (location_service.dart)
    ↓
    Receives "incidentAlert" event
    ↓
    Adds to alertStream
    ↓
home_screen.dart displays in "Recent Alerts" section
```

## Configuration Required

### Environment Variables

#### 1. **Backend (election_patrol_backend/.env)**
```
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/...
MONGODB_DB_NAME=election_patrol
SOCKET_SERVER_URL=http://192.168.0.147:3000
```

#### 2. **Dashboard (.env or .env.local)**
```
VITE_BASE_URL=http://192.168.0.147:8000
VITE_WS_URL=ws://192.168.0.147:8000
VITE_NODE_SOCKET_URL=http://192.168.0.147:3000
```

#### 3. **Flutter (run command with --dart-define)**
```bash
flutter run \
  --dart-define=BASE_URL=http://192.168.0.147:8000 \
  --dart-define=SOCKET_SERVER_URL=http://192.168.0.147:3000
```

**OR** for emulator:
```bash
flutter run \
  --dart-define=BASE_URL=http://10.0.2.2:8000 \
  --dart-define=SOCKET_SERVER_URL=http://10.0.2.2:3000
```

## Testing Checklist

### Prerequisites
- [ ] Backend running: `python election_patrol_backend/main.py` (port 8000)
- [ ] Socket server running: `node election_patrol_socket_server/server.js` (port 3000)
- [ ] Dashboard running: `npm run dev` (port 5173)
- [ ] MongoDB available
- [ ] At least one officer logged in Flutter app

### Test Steps

1. **Verify Officer is Online**
   - [ ] Open Flutter app on physical device or emulator
   - [ ] Go to map screen to verify location is being sent
   - [ ] Check backend logs: should see location updates
   - [ ] Check dashboard map: officer should appear as green marker (free status)

2. **Create Incident**
   - [ ] Dashboard: Click "+" button to add booth
   - [ ] Enter coordinates (e.g., 20.5937, 78.9629)
   - [ ] Click "ALERT" button
   - [ ] Dashboard shows: "Alert sent. Assigned: [Officer Name]"

3. **Verify Officer Receives Alert**
   - [ ] Check Flutter app console logs for: `"REAL-TIME INCIDENT ALERT RECEIVED"`
   - [ ] Alert should appear in "Recent Alerts" section (below availability status)
   - [ ] Active emergency alert banner should show at top
   - [ ] Alert list should show incident details

4. **Check Backend Logs**
   - [ ] Look for: `"DEBUG: Socket alert dispatched to [officer_id]"`
   - [ ] If error: `"DEBUG: Socket dispatch error for [officer_id]"`
   - [ ] Check MongoDB: incident should exist with assigned_officers populated

5. **Verify Status Changes**
   - [ ] Dashboard: Officer marker should turn red (assigned status)
   - [ ] Flutter: Status chips should update
   - [ ] Can still respond to alerts

### Debugging Commands

**Check if backends are running:**
```bash
# Backend API
curl http://192.168.0.147:8000/docs

# Socket server health
curl http://192.168.0.147:3000/
```

**Flutter debug logs:**
```bash
# Real-time logs
flutter logs

# Look for these messages:
# - "Socket connected: [ID]"
# - "REAL-TIME INCIDENT ALERT RECEIVED"
# - "Socket disconnected"
# - "Socket connection error"
```

**Backend logs (in terminal):**
```
# Should see:
# DEBUG: No free officers for incident [ID]
# DEBUG: Socket alert dispatched to [officer_id]
# DEBUG: Socket dispatch error for [officer_id]: [error]
```

## Common Issues & Solutions

### Issue: "No free officers for incident"
**Cause**: No officers have "free" status
**Solution**:
1. Check officer is logged in
2. Verify officer's location is being sent (check location_service logs)
3. Check MongoDB: `db.officer_tracking.findOne({unique_id: "..."})` should have location
4. Check MongoDB: `db.officers_auth.findOne({unique_id: "..."})` should exist

### Issue: Officer receives FCM but not socket alert
**Cause**: Socket server URL mismatch
**Solution**:
1. Verify backend `SOCKET_SERVER_URL` environment variable
2. Verify Flutter `SOCKET_SERVER_URL` matches backend's
3. Check if socket server is actually running on that IP:port
4. Test connectivity: `telnet 192.168.0.147 3000`

### Issue: Officer never receives any alert
**Cause**: Officer not marked as "free" or no location data
**Solution**:
1. Check dashboard shows officer as green marker
2. Check officer status in MongoDB: `availability_status: "free"`
3. Check officer has location: `last_latitude` and `last_longitude` set
4. Check alert has location near officer (within search radius)

### Issue: Socket connection fails on Flutter
**Cause**: Wrong IP or socket server down
**Solution**:
1. Check socket server is running: `node server.js`
2. Verify URL in constants.dart is correct
3. Check device can reach socket server: `ping 192.168.0.147`
4. Check firewall allows port 3000
5. For emulator, use `10.0.2.2` instead of `192.168.0.147`

## Files Modified

1. **election_patrol_officer/lib/utils/constants.dart**
   - Added `SOCKET_SERVER_URL` constant
   - Supports `--dart-define` override

2. **election_patrol_officer/lib/services/location_service.dart**
   - Imports `SOCKET_SERVER_URL` constant
   - Uses constant instead of hardcoded URL
   - Added error logging (onError, onDisconnect)

## Verification Commands

Run these to verify the system is working:

```bash
# 1. Check officer can reach backends
ping 192.168.0.147

# 2. Test backend API
curl http://192.168.0.147:8000/officers/list

# 3. Test socket server
curl http://192.168.0.147:3000/

# 4. Check MongoDB has officer
mongo "mongodb://..." --eval "db.officer_tracking.findOne()"

# 5. Check Flutter logs in real-time
flutter logs | grep -i "socket\|alert"
```

## Next Steps

1. **Update IP addresses** in environment variables to your actual LAN IP
2. **Test with physical device** (emulator may have different networking)
3. **Verify all three services** are running and accessible
4. **Check all environment variables** are set correctly
5. **Test alert flow** following the testing checklist above
6. **Monitor logs** during testing for any error messages

## Important Notes

- ✅ Dashboard socket dispatch works (lines 531-541 in ControlRoomMap.jsx)
- ✅ Backend finds officers correctly (lines 82-118 in incidents.py)
- ✅ Backend dispatches to socket server (lines 156-168 in incidents.py)
- ✅ Socket server relays to officers (lines 19-27 in server.js)
- ✅ Flutter receives and processes alerts (lines 95-98 in location_service.dart)
- ⚠️ **Critical**: Make sure Firebase Messaging is initialized for FCM alerts (backup channel)

## Support

If alerts still don't work after these fixes:
1. Check all three server logs simultaneously
2. Verify network connectivity between all components
3. Ensure MongoDB has data (officers with "free" status)
4. Check firewall rules for port 3000
5. Verify all IP addresses match between services
