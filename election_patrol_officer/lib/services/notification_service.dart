import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:audioplayers/audioplayers.dart';

import '../models/incident_alert.dart';
import '../screens/alert_screen.dart';
import 'api_service.dart';
import 'location_service.dart';

/// Must be a top-level function for [FirebaseMessaging.onBackgroundMessage].
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
}

class NotificationService {
  static ApiService? _api;
  static LocationService? _location;
  static GlobalKey<NavigatorState>? _navigatorKey;
  static final AudioPlayer _player = AudioPlayer();
  static bool _isAlarming = false;

  static final ValueNotifier<List<IncidentAlert>> recentAlerts =
      ValueNotifier<List<IncidentAlert>>(<IncidentAlert>[]);

  static final ValueNotifier<int> unreadCount = ValueNotifier<int>(0);

  static StreamSubscription<RemoteMessage>? _onMessageSub;
  static StreamSubscription<RemoteMessage>? _onOpenedSub;
  static StreamSubscription<String>? _onTokenRefreshSub;

  static Future<String?> getFcmToken() => FirebaseMessaging.instance.getToken();

  static void stopAlarm() {
    if (_isAlarming) {
      _player.stop();
      _isAlarming = false;
    }
  }

  static Future<void> startAlarm() async {
    if (_isAlarming) return;
    _isAlarming = true;
    try {
      await _player.setReleaseMode(ReleaseMode.loop);
      // Play a standard siren/alarm sound from a public URL for zero-setup testing
      // In production, this would be a local asset
      await _player.play(UrlSource('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg'));
    } catch (e) {
      debugPrint("Error playing alarm: $e");
    }
  }

  static void markAlertsRead() {
    unreadCount.value = 0;
    stopAlarm();
  }

  static Future<void> _cancelSubscriptions() async {
    await _onMessageSub?.cancel();
    await _onOpenedSub?.cancel();
    await _onTokenRefreshSub?.cancel();
    _onMessageSub = null;
    _onOpenedSub = null;
    _onTokenRefreshSub = null;
  }

  /// Cancels FCM stream subscriptions and clears API/navigator references (e.g. on logout).
  static Future<void> reset() async {
    await _cancelSubscriptions();
    _api = null;
    _location = null;
    _navigatorKey = null;
    stopAlarm();
    recentAlerts.value = <IncidentAlert>[];
    unreadCount.value = 0;
  }

  static void _recordAlert(IncidentAlert alert) {
    final previous = List<IncidentAlert>.from(recentAlerts.value);
    final deduped =
        previous.where((IncidentAlert e) => e.incidentId != alert.incidentId).toList();
    final next = <IncidentAlert>[alert, ...deduped].take(5).toList();
    recentAlerts.value = List<IncidentAlert>.unmodifiable(next);
    unreadCount.value = unreadCount.value + 1;
  }

  static void handleSocketAlert(Map<String, dynamic> data) {
    debugPrint("Processing socket alert: $data");
    final alert = _tryParseAlert(data);
    if (alert == null) return;
    _recordAlert(alert);
    // Note: We deliberately skip the startAlarm() and _showForegroundDialog() 
    // for socket alerts as requested by the user to avoid noise/modals.
  }

  static IncidentAlert? _tryParseAlert(Map<String, dynamic> data) {
    try {
      final alert = IncidentAlert.fromJson(Map<String, dynamic>.from(data));
      if (alert.incidentId.isEmpty) return null;
      return alert;
    } catch (_) {
      return null;
    }
  }

  static void _navigateToAlert(IncidentAlert alert) {
    stopAlarm();
    final nav = _navigatorKey?.currentState;
    final api = _api;
    final location = _location;
    if (nav == null || api == null || location == null) return;
    nav.push<void>(
      MaterialPageRoute<void>(
        builder: (BuildContext context) => AlertScreen(alert: alert, api: api, location: location),
      ),
    );
  }

  static void _showForegroundDialog(IncidentAlert alert) {
    final ctx = _navigatorKey?.currentContext;
    if (ctx == null || !ctx.mounted) return;
    showDialog<void>(
      context: ctx,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Incident alert'),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  alert.incidentType,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(alert.message.isNotEmpty ? alert.message : 'New incident assigned.'),
                const SizedBox(height: 8),
                Text('Severity: ${alert.severity.name}'),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: const Text('Dismiss'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.of(context).pop();
                _navigateToAlert(alert);
              },
              child: const Text('Open details'),
            ),
          ],
        );
      },
    );
  }

  static Future<void> init({
    required ApiService api,
    required LocationService location,
    required GlobalKey<NavigatorState> navigatorKey,
  }) async {
    await _cancelSubscriptions();
    _api = api;
    _location = location;
    _navigatorKey = navigatorKey;

    await FirebaseMessaging.instance.requestPermission();

    final token = await FirebaseMessaging.instance.getToken();
    if (token != null && token.isNotEmpty) {
      try {
        await api.registerFcmToken(token);
      } catch (_) {
        // Backend may be unavailable during setup; token can be retried later.
      }
    }

    _onTokenRefreshSub = FirebaseMessaging.instance.onTokenRefresh.listen((String newToken) async {
      try {
        await api.registerFcmToken(newToken);
      } catch (_) {}
    });

    _onMessageSub = FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      final alert = _tryParseAlert(Map<String, dynamic>.from(message.data));
      if (alert == null) return;
      _recordAlert(alert);
      if (alert.severity == IncidentSeverity.high) {
        startAlarm();
      }
      _showForegroundDialog(alert);
    });

    _onOpenedSub =
        FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      final alert = _tryParseAlert(Map<String, dynamic>.from(message.data));
      if (alert == null) return;
      _recordAlert(alert);
      _navigateToAlert(alert);
    });

    final RemoteMessage? initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      final alert = _tryParseAlert(Map<String, dynamic>.from(initial.data));
      if (alert != null) {
        _recordAlert(alert);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _navigateToAlert(alert);
        });
      }
    }
  }
}
