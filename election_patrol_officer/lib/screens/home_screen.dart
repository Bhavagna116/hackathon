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
    await NotificationService.init(api: _api, navigatorKey: widget.navigatorKey);
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
    final previous = _status;
    setState(() => _status = next);
    _location.setAvailabilityStatus(next);
    try {
      await _api.updateStatus(next.name);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _status = previous;
        _location.setAvailabilityStatus(previous);
      });
      final msg = e is Exception ? e.toString().replaceFirst('Exception: ', '') : '$e';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: Colors.red.shade800,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
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
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text('Election Patrol'),
        elevation: 0,
        actions: [
          IconButton(
            tooltip: 'Open map',
            icon: const Icon(Icons.map_outlined),
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
                    const Icon(Icons.notifications_outlined),
                    if (count > 0)
                      Positioned(
                        right: -4,
                        top: -2,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                          decoration: const BoxDecoration(
                            color: Colors.red,
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
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _name,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: _navy,
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                _rank,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: _navy.withOpacity(0.75),
                    ),
              ),
              const SizedBox(height: 24),
              DecoratedBox(
                decoration: BoxDecoration(
                  border: Border.all(color: _navy.withOpacity(0.2)),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Live coordinates',
                        style: TextStyle(
                          color: _navy.withOpacity(0.8),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      SelectableText(
                        coordText,
                        style: const TextStyle(
                          fontSize: 16,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: tracking ? Colors.green.shade600 : Colors.red.shade700,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    tracking ? 'Tracking Active' : 'Tracking Stopped',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: tracking ? Colors.green.shade800 : Colors.red.shade800,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Text(
                'Availability',
                style: TextStyle(
                  color: _navy.withOpacity(0.85),
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<AvailabilityStatus>(
                value: _status,
                decoration: InputDecoration(
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: _navy.withOpacity(0.35)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: _navy, width: 2),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
                items: AvailabilityStatus.values
                    .map(
                      (s) => DropdownMenuItem<AvailabilityStatus>(
                        value: s,
                        child: Text(_statusLabel(s)),
                      ),
                    )
                    .toList(),
                onChanged: (v) => unawaited(_onStatusChanged(v)),
              ),
              const SizedBox(height: 28),
              Text(
                'Recent alerts',
                style: TextStyle(
                  color: _navy.withOpacity(0.85),
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 10),
              ValueListenableBuilder<List<IncidentAlert>>(
                valueListenable: NotificationService.recentAlerts,
                builder: (BuildContext context, List<IncidentAlert> alerts, Widget? _) {
                  if (alerts.isEmpty) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        'No incident alerts yet.',
                        style: TextStyle(color: _navy.withOpacity(0.55)),
                      ),
                    );
                  }
                  return Column(
                    children: alerts
                        .map(
                          (IncidentAlert a) => Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Card(
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                                side: BorderSide(color: _navy.withOpacity(0.15)),
                              ),
                              child: ListTile(
                                title: Text(
                                  a.incidentType,
                                  style: const TextStyle(fontWeight: FontWeight.w600),
                                ),
                                subtitle: Text(
                                  a.message.isNotEmpty ? a.message : a.incidentId,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                trailing: Icon(Icons.chevron_right, color: _navy.withOpacity(0.5)),
                                onTap: () {
                                  Navigator.of(context).push<void>(
                                    MaterialPageRoute<void>(
                                      builder: (BuildContext _) =>
                                          AlertScreen(alert: a, api: _api),
                                    ),
                                  );
                                },
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
              const SizedBox(height: 24),
              SizedBox(
                height: 48,
                child: OutlinedButton(
                  onPressed: _logout,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _navy,
                    side: const BorderSide(color: _navy, width: 1.5),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text(
                    'Logout',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
