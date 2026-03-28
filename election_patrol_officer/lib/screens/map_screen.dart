import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../models/incident_alert.dart';
import '../models/polling_station.dart';
import '../services/api_service.dart';

/// Great-circle distance between two WGS84 points in kilometers (Haversine).
double haversineKm(double lat1, double lon1, double lat2, double lon2) {
  const double earthRadiusKm = 6371.0;
  double toRad(double deg) => deg * math.pi / 180.0;
  final dLat = toRad(lat2 - lat1);
  final dLon = toRad(lon2 - lon1);
  final sinDLat = math.sin(dLat / 2);
  final sinDLon = math.sin(dLon / 2);
  final a = sinDLat * sinDLat +
      math.cos(toRad(lat1)) * math.cos(toRad(lat2)) * sinDLon * sinDLon;
  final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  return earthRadiusKm * c;
}

class MapScreen extends StatefulWidget {
  const MapScreen({
    super.key,
    required this.api,
    this.incident,
  });

  final ApiService api;
  final IncidentAlert? incident;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> with SingleTickerProviderStateMixin {
  static const Color _navy = Color(0xFF0A2342);

  GoogleMapController? _mapController;
  StreamSubscription<Position>? _posSub;

  double? _officerLat;
  double? _officerLng;
  bool _followOfficer = true;
  bool _programmaticCamera = false;
  List<PollingStation> _stations = <PollingStation>[];
  PollingStation? _nearestStation;
  double? _nearestKm;

  late final AnimationController _pulseController;
  late final Animation<double> _pulseRadius;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
    _pulseRadius = Tween<double>(begin: 45, end: 140).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    _pulseRadius.addListener(() {
      if (widget.incident != null && mounted) setState(() {});
    });
    unawaited(_bootstrap());
  }

  Future<void> _bootstrap() async {
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (!mounted) return;
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Location permission is required for the map.')),
        );
        return;
      }

      final Position pos = await Geolocator.getCurrentPosition();
      if (!mounted) return;
      setState(() {
        _officerLat = pos.latitude;
        _officerLng = pos.longitude;
      });

      try {
        final list = await widget.api.getNearbyStations(pos.latitude, pos.longitude);
        if (!mounted) return;
        setState(() {
          _stations = list;
          _updateNearest();
        });
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not load nearby stations.')),
          );
        }
      }

      _startPositionStream();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to get current location.')),
        );
      }
    }
  }

  void _updateNearest() {
    if (_officerLat == null || _officerLng == null || _stations.isEmpty) {
      _nearestStation = null;
      _nearestKm = null;
      return;
    }
    PollingStation? best;
    double? bestKm;
    for (final PollingStation s in _stations) {
      final double d = haversineKm(_officerLat!, _officerLng!, s.latitude, s.longitude);
      if (bestKm == null || d < bestKm) {
        bestKm = d;
        best = s;
      }
    }
    _nearestStation = best;
    _nearestKm = bestKm;
  }

  Future<void> _runProgrammaticCamera(Future<void> Function() run) async {
    _programmaticCamera = true;
    try {
      await run();
    } finally {
      await Future<void>.delayed(const Duration(milliseconds: 60));
      if (mounted) _programmaticCamera = false;
    }
  }

  void _startPositionStream() {
    _posSub?.cancel();
    _posSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((Position p) async {
      if (!mounted) return;
      setState(() {
        _officerLat = p.latitude;
        _officerLng = p.longitude;
        _updateNearest();
      });
      if (_followOfficer && _mapController != null) {
        await _runProgrammaticCamera(
          () => _mapController!.animateCamera(
            CameraUpdate.newLatLng(LatLng(p.latitude, p.longitude)),
          ),
        );
      }
    });
  }

  void _centerOnMe() {
    if (_officerLat == null || _officerLng == null) return;
    setState(() => _followOfficer = true);
    final GoogleMapController? c = _mapController;
    if (c == null) return;
    unawaited(
      _runProgrammaticCamera(
        () => c.animateCamera(
          CameraUpdate.newLatLngZoom(
            LatLng(_officerLat!, _officerLng!),
            15.0,
          ),
        ),
      ),
    );
  }

  Set<Marker> _buildMarkers() {
    final Set<Marker> markers = <Marker>{};
    if (_officerLat != null && _officerLng != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('officer'),
          position: LatLng(_officerLat!, _officerLng!),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueBlue),
          infoWindow: const InfoWindow(title: 'Officer', snippet: 'Your position'),
          zIndexInt: 2,
        ),
      );
    }

    if (_officerLat != null && _officerLng != null) {
      for (final PollingStation s in _stations) {
        final double km = haversineKm(_officerLat!, _officerLng!, s.latitude, s.longitude);
        markers.add(
          Marker(
            markerId: MarkerId('station_${s.stationId}'),
            position: LatLng(s.latitude, s.longitude),
            icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
            infoWindow: InfoWindow(
              title: s.stationName,
              snippet: '${km.toStringAsFixed(2)} km away',
            ),
            zIndexInt: 1,
          ),
        );
      }
    }

    if (widget.incident != null) {
      final IncidentAlert inc = widget.incident!;
      markers.add(
        Marker(
          markerId: const MarkerId('incident'),
          position: LatLng(inc.latitude, inc.longitude),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
          infoWindow: InfoWindow(title: 'INCIDENT', snippet: inc.incidentType),
          zIndexInt: 3,
        ),
      );
    }

    return markers;
  }

  Set<Circle> _buildCircles() {
    if (widget.incident == null) return <Circle>{};
    return <Circle>{
      Circle(
        circleId: const CircleId('incident_pulse'),
        center: LatLng(widget.incident!.latitude, widget.incident!.longitude),
        radius: _pulseRadius.value,
        fillColor: Colors.orange.withOpacity(0.22),
        strokeColor: Colors.deepOrange,
        strokeWidth: 2,
        zIndex: 1,
      ),
    };
  }

  @override
  void dispose() {
    _posSub?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final LatLng initialTarget = LatLng(
      _officerLat ?? widget.incident?.latitude ?? 20.5937,
      _officerLng ?? widget.incident?.longitude ?? 78.9629,
    );

    final String coordLine = _officerLat != null && _officerLng != null
        ? '${_officerLat!.toStringAsFixed(6)}, ${_officerLng!.toStringAsFixed(6)}'
        : 'Locating…';

    final String nearestName =
        _nearestStation?.stationName ?? (_stations.isEmpty ? 'No stations loaded' : '—');
    final String nearestDist = _nearestKm != null ? '${_nearestKm!.toStringAsFixed(2)} km' : '—';

    return Scaffold(
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text('Patrol map'),
      ),
      body: Column(
        children: [
          if (widget.incident != null)
            Material(
              color: Colors.red.shade800,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    const Icon(Icons.warning_amber_rounded, color: Colors.white),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Active incident: ${widget.incident!.incidentType} '
                        '· ${widget.incident!.severity.name.toUpperCase()}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          Expanded(
            child: Stack(
              children: [
                GoogleMap(
                  initialCameraPosition: CameraPosition(
                    target: initialTarget,
                    zoom: 15.0,
                  ),
                  markers: _buildMarkers(),
                  circles: _buildCircles(),
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                  onMapCreated: (GoogleMapController c) {
                    _mapController = c;
                    if (_officerLat != null && _officerLng != null) {
                      unawaited(
                        _runProgrammaticCamera(
                          () => c.animateCamera(
                            CameraUpdate.newLatLngZoom(
                              LatLng(_officerLat!, _officerLng!),
                              15.0,
                            ),
                          ),
                        ),
                      );
                    }
                  },
                  onCameraMoveStarted: () {
                    if (!_programmaticCamera) {
                      setState(() => _followOfficer = false);
                    }
                  },
                ),
                Positioned(
                  right: 16,
                  bottom: 160,
                  child: Column(
                    children: [
                      FloatingActionButton.small(
                        heroTag: 'zoom_in',
                        backgroundColor: Colors.white,
                        foregroundColor: _navy,
                        onPressed: () {
                          final GoogleMapController? c = _mapController;
                          if (c == null) return;
                          unawaited(
                            _runProgrammaticCamera(() => c.animateCamera(CameraUpdate.zoomIn())),
                          );
                        },
                        child: const Icon(Icons.add),
                      ),
                      const SizedBox(height: 8),
                      FloatingActionButton.small(
                        heroTag: 'zoom_out',
                        backgroundColor: Colors.white,
                        foregroundColor: _navy,
                        onPressed: () {
                          final GoogleMapController? c = _mapController;
                          if (c == null) return;
                          unawaited(
                            _runProgrammaticCamera(() => c.animateCamera(CameraUpdate.zoomOut())),
                          );
                        },
                        child: const Icon(Icons.remove),
                      ),
                      const SizedBox(height: 8),
                      FloatingActionButton.small(
                        heroTag: 'center_me',
                        backgroundColor: _navy,
                        foregroundColor: Colors.white,
                        onPressed: _centerOnMe,
                        child: const Icon(Icons.my_location),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 16,
                  child: Card(
                    elevation: 4,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'Your position',
                            style: TextStyle(
                              color: _navy.withOpacity(0.7),
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            coordLine,
                            style: TextStyle(color: _navy, fontWeight: FontWeight.w600),
                          ),
                          const Divider(height: 20),
                          Text(
                            'Nearest polling station',
                            style: TextStyle(
                              color: _navy.withOpacity(0.7),
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            nearestName,
                            style: TextStyle(color: _navy, fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Distance (Haversine): $nearestDist',
                            style: TextStyle(color: _navy.withOpacity(0.85)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
