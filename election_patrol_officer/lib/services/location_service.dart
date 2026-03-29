import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;

import '../models/officer_location.dart';
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

  Future<void> startTracking() async {
    if (_tracking) return;

    final deniedMessage = await initializePermissions();
    if (deniedMessage != null) {
      _tracking = false;
      return;
    }

    _socket = IO.io(
      'http://192.168.0.147:3000',
      IO.OptionBuilder().setTransports(['websocket']).build(),
    );

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
