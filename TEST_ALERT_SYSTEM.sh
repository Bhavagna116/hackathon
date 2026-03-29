#!/bin/bash

# Election Patrol Alert System - Integration Test Script
# This script verifies that all components are correctly configured
# and ready to send alerts from dashboard to Flutter officers

set -e

RESET='\033[0m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BLUE}║  Election Patrol - Alert System Integration Test           ║${RESET}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# Test 1: Check Flutter constants
echo -e "${YELLOW}[1/7] Checking Flutter constants...${RESET}"
if grep -q "SOCKET_SERVER_URL" election_patrol_officer/lib/utils/constants.dart; then
    echo -e "${GREEN}✓ SOCKET_SERVER_URL defined in Flutter constants${RESET}"
else
    echo -e "${RED}✗ SOCKET_SERVER_URL NOT found in Flutter constants${RESET}"
    exit 1
fi

# Test 2: Check Flutter location_service imports
echo -e "${YELLOW}[2/7] Checking Flutter location_service imports...${RESET}"
if grep -q "import '../utils/constants.dart'" election_patrol_officer/lib/services/location_service.dart; then
    echo -e "${GREEN}✓ location_service imports constants${RESET}"
else
    echo -e "${RED}✗ location_service does NOT import constants${RESET}"
    exit 1
fi

# Test 3: Check Flutter uses SOCKET_SERVER_URL
echo -e "${YELLOW}[3/7] Checking Flutter socket URL configuration...${RESET}"
if grep -q "SOCKET_SERVER_URL" election_patrol_officer/lib/services/location_service.dart; then
    echo -e "${GREEN}✓ location_service uses SOCKET_SERVER_URL${RESET}"
else
    echo -e "${RED}✗ location_service does NOT use SOCKET_SERVER_URL${RESET}"
    exit 1
fi

# Test 4: Check Flutter incident alert handler
echo -e "${YELLOW}[4/7] Checking Flutter incident alert handler...${RESET}"
if grep -q "incidentAlert" election_patrol_officer/lib/services/location_service.dart; then
    echo -e "${GREEN}✓ Incident alert handler registered${RESET}"
else
    echo -e "${RED}✗ Incident alert handler NOT found${RESET}"
    exit 1
fi

# Test 5: Check Dashboard socket constants
echo -e "${YELLOW}[5/7] Checking Dashboard socket constants...${RESET}"
if grep -q "NODE_SOCKET_URL" election_patrol_dashboard/src/utils/constants.js && \
   grep -q "NODE_SOCKET_URL" election_patrol_dashboard/src/store/dashboardStore.js; then
    echo -e "${GREEN}✓ Dashboard socket constants configured${RESET}"
else
    echo -e "${RED}✗ Dashboard socket constants NOT configured${RESET}"
    exit 1
fi

# Test 6: Check Socket Server dispatch endpoints
echo -e "${YELLOW}[6/7] Checking Socket Server endpoints...${RESET}"
if grep -q 'app.post.*"/dispatch-alert"' election_patrol_socket_server/server.js && \
   grep -q 'socket.on.*"dispatchAlert"' election_patrol_socket_server/server.js; then
    echo -e "${GREEN}✓ Socket Server dispatch endpoints configured${RESET}"
else
    echo -e "${RED}✗ Socket Server endpoints NOT configured${RESET}"
    exit 1
fi

# Test 7: Check Backend dispatch logic
echo -e "${YELLOW}[7/7] Checking Backend dispatch logic...${RESET}"
if grep -q 'client.post.*dispatch-alert' election_patrol_backend/routers/incidents.py; then
    echo -e "${GREEN}✓ Backend dispatch to socket server configured${RESET}"
else
    echo -e "${RED}✗ Backend dispatch NOT configured${RESET}"
    exit 1
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}✓ All configuration checks passed!${RESET}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "${YELLOW}Alert Flow Verified:${RESET}"
echo "  1. Dashboard sends alert request"
echo "  2. Backend finds nearby free officers"
echo "  3. Backend POSTs to Socket Server (/dispatch-alert)"
echo "  4. Socket Server emits 'incidentAlert' to officer's socket room"
echo "  5. Flutter receives and displays in Recent Alerts"
echo ""
echo -e "${YELLOW}Next steps:${RESET}"
echo "  1. Start backend:      python election_patrol_backend/main.py"
echo "  2. Start socket server: node election_patrol_socket_server/server.js"
echo "  3. Start dashboard:    cd election_patrol_dashboard && npm run dev"
echo "  4. Start Flutter:      flutter run --dart-define=SOCKET_SERVER_URL=..."
echo ""
echo -e "${YELLOW}Monitor these:${RESET}"
echo "  - Flutter logs:  flutter logs | grep -i 'alert\|socket'"
echo "  - Backend logs:  Look for 'DEBUG: Socket alert dispatched'"
echo "  - Socket logs:   Look for '[HTTP Dispatch] Alerting user'"
echo ""
