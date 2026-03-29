import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;

import '../models/officer_location.dart';
import '../utils/constants.dart';
import 'api_service.dart';

class LocationService {
  LocationService({
    required ApiService api,
    FlutterSecureStorage? storage,
  })  : _api = api,
        _storage = storage ?? const FlutterSecureStorage();

  static const _uniqueIdKey = 'unique_id';

  final ApiService _api;
  final FlutterSecureStorage _storage;

  final StreamController<Position> _locationController =
      StreamController<Position>.broadcast();

  StreamSubscription<Position>? _positionSubscription;
  IO.Socket? _socket;

  AvailabilityStatus _availabilityStatus = AvailabilityStatus.free;

  bool _tracking = false;

  Stream<Position> get locationStream => _locationController.stream;

  bool get isTracking => _tracking;

  void setAvailabilityStatus(AvailabilityStatus status) async {
    _availabilityStatus = status;
    final uniqueId = await _storage.read(key: _uniqueIdKey);
    if (uniqueId != null && uniqueId.isNotEmpty && _socket != null && _socket!.connected) {
      _socket!.emit('updateStatus', {
        'userId': uniqueId,
        'status': status.name,
      });
    }
  }

  /// Requests location permission and checks that location services are enabled.
  /// Returns `null` if ready to track; otherwise a clear error message for the UI.
  Future<String?> initializePermissions() async {
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      return 'Location access is required for live patrol tracking. Please allow location permission when prompted, or enable it in app settings.';
    }
    if (permission == LocationPermission.deniedForever) {
      return 'Location permission is permanently denied. Open Settings for this app and allow location access to continue.';
    }
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      return 'Location services are turned off on this device. Please enable GPS/location to track your position.';
    }
    return null;
  }

  final StreamController<Map<String, dynamic>> _alertController =
      StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get alertStream => _alertController.stream;

  Future<void> startTracking() async {
    if (_tracking) return;

    final deniedMessage = await initializePermissions();
    if (deniedMessage != null) {
      _tracking = false;
      return;
    }

    final uniqueId = await _storage.read(key: _uniqueIdKey);

    _socket = IO.io(
      SOCKET_SERVER_URL,
      IO.OptionBuilder().setTransports(['websocket']).build(),
    );

    _socket!.onConnect((_) {
      print('Socket connected: ${_socket!.id}');
      if (uniqueId != null) {
        _socket!.emit('join', uniqueId);
      }
    });

    _socket!.on('incidentAlert', (data) {
      print('REAL-TIME INCIDENT ALERT RECEIVED: $data');
      _alertController.add(Map<String, dynamic>.from(data));
    });

    _socket!.onError((error) {
      print('Socket connection error: $error');
    });

    _socket!.onDisconnect((_) {
      print('Socket disconnected');
    });

    await _positionSubscription?.cancel();
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 0,
      ),
    ).listen(
      (Position position) {
        _locationController.add(position);
        unawaited(_pushLocation(position));
      },
      onError: (_) {},
    );

    _tracking = true;
  }

  Future<void> _pushLocation(Position position) async {
    final uniqueId = await _storage.read(key: _uniqueIdKey);
    if (uniqueId == null || uniqueId.isEmpty) return;

    if (_socket != null && _socket!.connected) {
      _socket!.emit('sendLocation', {
        'userId': uniqueId,
        'latitude': position.latitude,
        'longitude': position.longitude,
        'availability_status': _availabilityStatus.name,
        'timestamp': DateTime.now().toUtc().toIso8601String(),
      });
    }
  }

  Future<void> stopTracking() async {
    await _positionSubscription?.cancel();
    _positionSubscription = null;
    
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    
    _tracking = false;
  }
}
