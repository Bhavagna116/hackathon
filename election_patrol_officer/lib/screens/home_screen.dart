import 'dart:async';
import 'dart:ui' show FontFeature;

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';

import '../models/incident_alert.dart';
import '../models/officer_location.dart';
import 'alert_screen.dart';
import 'map_screen.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/location_service.dart';
import '../services/notification_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.auth,
    required this.onLoggedOut,
    required this.navigatorKey,
  });

  final AuthService auth;
  final VoidCallback onLoggedOut;
  final GlobalKey<NavigatorState> navigatorKey;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const Color _navy = Color(0xFF0A2342);

  late final ApiService _api;
  late final LocationService _location;
  StreamSubscription<Position>? _posSub;

  String _name = '';
  String _rank = '';
  double? _lat;
  double? _lng;
  AvailabilityStatus _status = AvailabilityStatus.free;

  @override
  void initState() {
    super.initState();
    _api = ApiService(
      storage: const FlutterSecureStorage(),
      onUnauthorized: () => unawaited(_onUnauthorized()),
    );
    _location = LocationService(
      api: _api,
      storage: const FlutterSecureStorage(),
    );
    _location.setAvailabilityStatus(_status);

    _posSub = _location.locationStream.listen((position) {
      if (!mounted) return;
      setState(() {
        _lat = position.latitude;
        _lng = position.longitude;
      });
    });

    _bootstrap();
  }

  Future<void> _onUnauthorized() async {
    await NotificationService.reset();
    if (!mounted) return;
    widget.onLoggedOut();
  }

  Future<void> _bootstrap() async {
    final name = await widget.auth.readStoredName();
    final rank = await widget.auth.readStoredRank();
    if (!mounted) return;
    setState(() {
      _name = (name != null && name.isNotEmpty) ? name : 'Officer';
      _rank = (rank != null && rank.isNotEmpty) ? rank : '—';
    });

    final permMessage = await _location.initializePermissions();
    if (!mounted) return;
    if (permMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(permMessage),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }

    await _location.startTracking();
    if (!mounted) return;
    await NotificationService.init(api: _api, location: _location, navigatorKey: widget.navigatorKey);
    if (mounted) setState(() {});
  }

  Future<void> _logout() async {
    await NotificationService.reset();
    await _location.stopTracking();
    await widget.auth.logout();
    if (!mounted) return;
    widget.onLoggedOut();
  }

  Future<void> _onStatusChanged(AvailabilityStatus? next) async {
    if (next == null) return;
    setState(() => _status = next);
    _location.setAvailabilityStatus(next);
  }

  String _statusLabel(AvailabilityStatus s) {
    switch (s) {
      case AvailabilityStatus.free:
        return 'Free';
      case AvailabilityStatus.busy:
        return 'Busy';
      case AvailabilityStatus.assigned:
        return 'Assigned';
    }
  }

  @override
  void dispose() {
    _posSub?.cancel();
    unawaited(_location.stopTracking());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tracking = _location.isTracking;
    final coordText = _lat != null && _lng != null
        ? '${_lat!.toStringAsFixed(6)}, ${_lng!.toStringAsFixed(6)}'
        : 'Waiting for GPS…';

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text('Election Patrol', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 18)),
        elevation: 0,
        actions: [
          IconButton(
            tooltip: 'Open map',
            icon: const Icon(Icons.map_rounded),
            onPressed: () {
              Navigator.of(context).push<void>(
                MaterialPageRoute<void>(
                  builder: (BuildContext _) => MapScreen(api: _api),
                ),
              );
            },
          ),
          ValueListenableBuilder<int>(
            valueListenable: NotificationService.unreadCount,
            builder: (BuildContext context, int count, Widget? child) {
              return IconButton(
                tooltip: 'Alerts',
                onPressed: NotificationService.markAlertsRead,
                icon: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    const Icon(Icons.notifications_rounded),
                    if (count > 0)
                      Positioned(
                        right: -4,
                        top: -2,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                          decoration: const BoxDecoration(
                            color: Colors.redAccent,
                            shape: BoxShape.circle,
                          ),
                          constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                          child: Text(
                            count > 9 ? '9+' : '$count',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // --- PREMIUM HEADER ---
              Container(
                padding: const EdgeInsets.only(left: 24, right: 24, bottom: 40, top: 20),
                decoration: const BoxDecoration(
                  color: _navy,
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(36),
                    bottomRight: Radius.circular(36),
                  ),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 34,
                      backgroundColor: Colors.white.withOpacity(0.12),
                      child: Text(
                        _name.isNotEmpty ? _name.trim()[0].toUpperCase() : 'O',
                        style: const TextStyle(fontSize: 28, color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(width: 18),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Welcome back,',
                            style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 13, letterSpacing: 0.5),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _name,
                            style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              _rank.toUpperCase(),
                              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.8),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // --- BODY CONTENT ---
              Transform.translate(
                offset: const Offset(0, -20),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    children: [
                      // --- LIVE TRACKING COMMAND CENTER ---
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(24),
                          boxShadow: [
                            BoxShadow(
                              color: _navy.withOpacity(0.06),
                              blurRadius: 20,
                              offset: const Offset(0, 10),
                            ),
                          ],
                        ),
                        child: Column(
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 12,
                                      height: 12,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: tracking ? Colors.greenAccent.shade400 : Colors.redAccent.shade400,
                                        boxShadow: [
                                          BoxShadow(
                                            color: tracking ? Colors.greenAccent.withOpacity(0.5) : Colors.redAccent.withOpacity(0.5),
                                            blurRadius: 8,
                                            spreadRadius: 2,
                                          )
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Text(
                                      tracking ? 'Live Patrol Active' : 'Patrol Offline',
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        color: tracking ? Colors.green.shade800 : Colors.red.shade800,
                                      ),
                                    ),
                                  ],
                                ),
                                Switch.adaptive(
                                  value: tracking,
                                  activeColor: Colors.white,
                                  activeTrackColor: Colors.green.shade500,
                                  inactiveThumbColor: Colors.white,
                                  inactiveTrackColor: Colors.red.shade400,
                                  onChanged: (bool value) async {
                                    if (value) {
                                      final msg = await _location.initializePermissions();
                                      if (msg != null && mounted) {
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          SnackBar(
                                            content: Text(msg),
                                            behavior: SnackBarBehavior.floating,
                                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                          ),
                                        );
                                      } else {
                                        await _location.startTracking();
                                        if (mounted) setState(() {});
                                      }
                                    } else {
                                      await _location.stopTracking();
                                      if (mounted) setState(() {});
                                    }
                                  },
                                ),
                              ],
                            ),
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 12),
                              child: Divider(height: 1),
                            ),
                            Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: tracking ? Colors.green.shade50 : Colors.grey.shade100,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: tracking ? Colors.green.shade200 : Colors.grey.shade300,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.gps_fixed_rounded,
                                    color: tracking ? Colors.green.shade600 : Colors.grey.shade500,
                                  ),
                                  const SizedBox(width: 16),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Current Coordinates',
                                          style: TextStyle(
                                            color: tracking ? Colors.green.shade800 : Colors.grey.shade600,
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        SelectableText(
                                          coordText,
                                          style: TextStyle(
                                            fontSize: 15,
                                            fontFamily: 'Courier',
                                            fontWeight: FontWeight.bold,
                                            letterSpacing: 0.5,
                                            color: tracking ? Colors.green.shade900 : Colors.grey.shade800,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 28),

                      // --- AVAILABILITY STATUS SEGMENTED CONTROL ---
                      Container(
                        alignment: Alignment.centerLeft,
                        padding: const EdgeInsets.only(left: 4),
                        child: Text(
                          'Availability Status',
                          style: TextStyle(
                            color: _navy.withOpacity(0.85),
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(18),
                          boxShadow: [
                            BoxShadow(color: _navy.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4)),
                          ],
                        ),
                        padding: const EdgeInsets.all(8),
                        child: Row(
                          children: [
                            _buildStatusChip(AvailabilityStatus.free, 'Free', Colors.green),
                            const SizedBox(width: 8),
                            _buildStatusChip(AvailabilityStatus.busy, 'Busy', Colors.orange),
                            const SizedBox(width: 8),
                            _buildStatusChip(AvailabilityStatus.assigned, 'Assigned', Colors.blue),
                          ],
                        ),
                      ),
                      const SizedBox(height: 32),

                      // --- RECENT ALERTS ---
                      Container(
                        alignment: Alignment.centerLeft,
                        padding: const EdgeInsets.only(left: 4, right: 4),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Recent Alerts',
                              style: TextStyle(
                                color: _navy.withOpacity(0.85),
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            Icon(Icons.history_rounded, color: _navy.withOpacity(0.4), size: 20),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      ValueListenableBuilder<List<IncidentAlert>>(
                        valueListenable: NotificationService.recentAlerts,
                        builder: (BuildContext context, List<IncidentAlert> alerts, Widget? _) {
                          if (alerts.isEmpty) {
                            return Container(
                              padding: const EdgeInsets.all(24),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: Colors.grey.shade200),
                              ),
                              child: Text(
                                'No incident alerts yet.',
                                style: TextStyle(color: Colors.grey.shade600, fontSize: 15),
                              ),
                            );
                          }
                          return Column(
                            children: alerts.map((IncidentAlert a) {
                              Color sevColor = Colors.green.shade600;
                              if (a.severity == IncidentSeverity.high) sevColor = Colors.red.shade600;
                              if (a.severity == IncidentSeverity.medium) sevColor = Colors.orange.shade600;

                              return Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Container(
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(16),
                                    boxShadow: [
                                      BoxShadow(color: _navy.withOpacity(0.03), blurRadius: 10, offset: const Offset(0, 4)),
                                    ],
                                  ),
                                  clipBehavior: Clip.antiAlias,
                                  child: IntrinsicHeight(
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.stretch,
                                      children: [
                                        Container(width: 6, color: sevColor), // Severity Accent Strip
                                        Expanded(
                                          child: Material(
                                            color: Colors.transparent,
                                            child: InkWell(
                                              onTap: () {
                                                Navigator.of(context).push<void>(
                                                  MaterialPageRoute<void>(
                                                    builder: (BuildContext _) =>
                                                        AlertScreen(alert: a, api: _api, location: _location),
                                                  ),
                                                );
                                              },
                                              child: Padding(
                                                padding: const EdgeInsets.all(16),
                                                child: Row(
                                                  children: [
                                                    Expanded(
                                                      child: Column(
                                                        crossAxisAlignment: CrossAxisAlignment.start,
                                                        children: [
                                                          Text(
                                                            a.incidentType,
                                                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                                          ),
                                                          const SizedBox(height: 4),
                                                          Text(
                                                            a.message.isNotEmpty ? a.message : 'Alert ID: ${a.incidentId.substring(0, 8)}...',
                                                            maxLines: 2,
                                                            overflow: TextOverflow.ellipsis,
                                                            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                                                          ),
                                                        ],
                                                      ),
                                                    ),
                                                    Icon(Icons.arrow_forward_ios_rounded, color: Colors.grey.shade400, size: 16),
                                                  ],
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            }).toList(),
                          );
                        },
                      ),
                      const SizedBox(height: 36),

                      // --- LOGOUT BUTTON ---
                      SizedBox(
                        width: double.infinity,
                        height: 54,
                        child: OutlinedButton(
                          onPressed: _logout,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.red.shade700,
                            side: BorderSide(color: Colors.red.shade300, width: 1.5),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.logout_rounded, size: 20),
                              SizedBox(width: 8),
                              Text(
                                'Secure Logout',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 32),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // Helper inside _HomeScreenState to style the availability chips
  Widget _buildStatusChip(AvailabilityStatus statusValue, String label, MaterialColor baseColor) {
    final isSelected = _status == statusValue;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          unawaited(_onStatusChanged(statusValue));
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeInOut,
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isSelected ? baseColor.shade600 : Colors.grey.shade50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? baseColor.shade700 : Colors.grey.shade300, // Subtle depth
              width: 1,
            ),
            boxShadow: isSelected
                ? [BoxShadow(color: baseColor.withOpacity(0.3), blurRadius: 8, offset: const Offset(0, 4))]
                : [],
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : Colors.grey.shade600,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w600,
                fontSize: 14,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
