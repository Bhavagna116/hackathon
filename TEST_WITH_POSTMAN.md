# Testing Alerts with Postman (Without Dashboard Login)

## Prerequisites
- Postman installed (or use curl in terminal)
- All 3 services running (backend, socket, Flutter app)
- Officer app logged in and tracking location

---

## Step 1: Get Authorization Token

### In Postman:
**Method:** POST
**URL:** `http://YOUR_IP:8000/auth/login`
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "username": "officer_username",
  "password": "officer_password"
}
```

**What You'll Get Back:**
```json
{
  "access_token": "eyJhbGc...",
  "officer": {
    "unique_id": "...",
    "username": "officer_name",
    "email": "..."
  }
}
```

**👉 COPY THE ACCESS_TOKEN VALUE**

---

## Step 2: Create an Incident (This Triggers Alert)

### In Postman:
**Method:** POST
**URL:** `http://YOUR_IP:8000/incidents/create`
**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
Content-Type: application/json
```

Replace `YOUR_ACCESS_TOKEN_HERE` with the token from Step 1!

**Body (JSON):**
```json
{
  "incident_type": "booth_capture",
  "latitude": 20.5937,
  "longitude": 78.9629,
  "severity": "high",
  "reported_by": "Testing"
}
```

**Expected Response:**
```json
{
  "incident_id": "abc123...",
  "incident_type": "booth_capture",
  "latitude": 20.5937,
  "longitude": 78.9629,
  "severity": "high",
  "status": "pending",
  "assigned_officers": [],
  "created_at": "2025-03-29T12:00:00"
}
```

---

## Step 3: Watch the Logs

Open these in separate terminals WHILE you submit the Postman request:

### Terminal 1: Backend
```
# Watch for:
DEBUG: Socket alert dispatched to [officer_id]
```

### Terminal 2: Socket Server
```
# Watch for:
[HTTP Dispatch] Alerting user [officer_id]
Dispatching real-time alert to user [officer_id]
```

### Terminal 3: Flutter Logs
```bash
flutter logs -v | grep -i "socket\|alert\|incident"

# Watch for:
REAL-TIME INCIDENT ALERT RECEIVED: {incident_id: ...}
```

### Terminal 4: Check Flutter App
Look at the officer app screen:
- [ ] Does emergency alert banner appear at top?
- [ ] Does alert appear in "Recent Alerts" section?

---

## Step 4: Success Indicators

### ✅ In Postman
Got 200 response with incident_id

### ✅ In Backend Logs
```
DEBUG: Socket alert dispatched to [officer_id]
```

### ✅ In Socket Logs
```
[HTTP Dispatch] Alerting user [officer_id]
```

### ✅ In Flutter Logs
```
REAL-TIME INCIDENT ALERT RECEIVED: {...}
```

### ✅ On Officer App
- Emergency alert banner visible
- Alert in Recent Alerts list

---

## If It Doesn't Work

### Check 1: 401 Unauthorized in Postman?
- [ ] Did you copy the access_token correctly?
- [ ] Did you include "Bearer " before the token?
- [ ] Try login again to get fresh token

### Check 2: Officer Not Getting Alert?
- [ ] Is Flutter app showing "Socket connected"?
- [ ] Is officer status "free" (green marker)?
- [ ] Does officer have location saved?

### Check 3: Backend Returns Empty assigned_officers?
- [ ] No free officers near that location
- [ ] Officer status is "assigned" or "busy" (not "free")
- [ ] Try changing officer status OR creating alert far from all officers

Run backend logs to see:
```
DEBUG: No free officers for incident [incident_id]
```

---

## Using curl Instead of Postman

If you don't have Postman, use terminal:

### Get Token:
```bash
curl -X POST http://YOUR_IP:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"officer1","password":"password123"}'
```

### Create Incident:
```bash
curl -X POST http://YOUR_IP:8000/incidents/create \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "incident_type": "booth_capture",
    "latitude": 20.5937,
    "longitude": 78.9629,
    "severity": "high",
    "reported_by": "Testing"
  }'
```

---

## What Happens Behind The Scenes

```
1. You POST to /incidents/create with auth token
   ↓
2. Backend validates token ✓
   ↓
3. Backend creates incident in MongoDB ✓
   ↓
4. Backend finds FREE officers near coordinates ✓
   ↓
5. Backend updates officer status to "assigned" ✓
   ↓
6. Backend POSTs to Socket Server: /dispatch-alert ✓
   ↓
7. Socket Server emits "incidentAlert" to officer's socket room ✓
   ↓
8. Flutter receives "incidentAlert" event ✓
   ↓
9. Flutter adds to alert stream ✓
   ↓
10. Officer app displays alert in Recent Alerts ✓
```

---

## Next: After You Test This

Once socket alerts work:
1. Move on to Firebase setup
2. Firebase will add push notifications (alerts even when app closed)

---

## Need Help?

If stuck:
1. Provide your officer username/password
2. Share exact error messages
3. Share backend logs
4. Share Flutter logs

I'll help debug!
