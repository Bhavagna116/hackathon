import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/officer_location.dart';
import '../models/polling_station.dart';
import '../utils/constants.dart';

class ApiService {
  static const _tokenKey = 'token';

  final Dio _dio;
  final FlutterSecureStorage _storage;
  final void Function()? onUnauthorized;

  ApiService({
    Dio? dio,
    FlutterSecureStorage? storage,
    this.onUnauthorized,
  })  : _storage = storage ?? const FlutterSecureStorage(),
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: BASE_URL,
                connectTimeout: const Duration(seconds: 30),
                receiveTimeout: const Duration(seconds: 30),
                headers: const {'Content-Type': 'application/json'},
              ),
            ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: _tokenKey);
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401) {
            await _storage.deleteAll();
            onUnauthorized?.call();
          }
          handler.next(error);
        },
      ),
    );
  }

  Future<void> registerFcmToken(String fcmToken) async {
    await _dio.post<void>(
      '/officers/fcm-token',
      data: <String, dynamic>{'fcm_token': fcmToken},
    );
  }

  Future<void> respondToIncident(String incidentId) async {
    await _dio.post<void>(
      '/incidents/respond',
      data: <String, dynamic>{'incident_id': incidentId},
    );
  }

  Future<List<PollingStation>> getNearbyStations(double lat, double lng) async {
    final response = await _dio.get<dynamic>(
      '/stations/nearby',
      queryParameters: <String, dynamic>{'lat': lat, 'lng': lng},
    );
    final data = response.data;
    List<dynamic> raw = <dynamic>[];
    if (data is List) {
      raw = data;
    } else if (data is Map) {
      final m = Map<String, dynamic>.from(data);
      if (m['data'] is List) {
        raw = m['data']! as List<dynamic>;
      } else if (m['stations'] is List) {
        raw = m['stations']! as List<dynamic>;
      }
    }
    return raw
        .map((dynamic e) => PollingStation.fromJson(Map<String, dynamic>.from(e as Map)))
        .where((PollingStation s) => s.stationId.isNotEmpty)
        .toList();
  }

  Future<double> getDistanceToStation(String stationId, double lat, double lng) async {
    final response = await _dio.get<dynamic>(
      '/stations/distance',
      queryParameters: <String, dynamic>{
        'station_id': stationId,
        'lat': lat,
        'lng': lng,
      },
    );
    final data = response.data;
    if (data is num) return data.toDouble();
    if (data is Map) {
      final m = Map<String, dynamic>.from(data);
      if (m['distance_km'] is num) return (m['distance_km']! as num).toDouble();
      if (m['distance'] is num) return (m['distance']! as num).toDouble();
      if (m['data'] is Map) {
        final inner = Map<String, dynamic>.from(m['data']! as Map);
        if (inner['distance_km'] is num) return (inner['distance_km']! as num).toDouble();
        if (inner['distance'] is num) return (inner['distance']! as num).toDouble();
      }
    }
    return 0;
  }
}
