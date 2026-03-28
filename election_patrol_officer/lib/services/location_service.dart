import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';

import '../models/officer_location.dart';
import 'api_service.dart';

class LocationService {
  LocationService({
    required ApiService api,
    FlutterSecureStorage? storage,
  })  : _api = api,
        _storage = storage ?? const FlutterSecureStorage();

  static const _officerIdKey = 'officer_id';

  final ApiService _api;
  final FlutterSecureStorage _storage;

  final StreamController<Position> _locationController =
      StreamController<Position>.broadcast();

  StreamSubscription<Position>? _positionSubscription;

  AvailabilityStatus _availabilityStatus = AvailabilityStatus.free;

  bool _tracking = false;

  Stream<Position> get locationStream => _locationController.stream;

  bool get isTracking => _tracking;

  void setAvailabilityStatus(AvailabilityStatus status) {
    _availabilityStatus = status;
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

    await _positionSubscription?.cancel();
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 3,
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
    final officerId = await _storage.read(key: _officerIdKey);
    if (officerId == null || officerId.isEmpty) return;

    final payload = OfficerLocation(
      officerId: officerId,
      latitude: position.latitude,
      longitude: position.longitude,
      timestamp: DateTime.now().toUtc(),
      availabilityStatus: _availabilityStatus,
    );

    try {
      await _api.updateLocation(payload);
    } catch (_) {
      // Non-fatal; next movement will send again.
    }
  }

  Future<void> stopTracking() async {
    await _positionSubscription?.cancel();
    _positionSubscription = null;
    _tracking = false;
  }
}
