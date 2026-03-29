import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../utils/constants.dart';

class AuthService {
  static const _keyUniqueId = 'unique_id';
  static const _keyToken = 'token';
  static const _keyName = 'name';
  static const _keyRank = 'rank';

  final Dio _dio;
  final FlutterSecureStorage _storage;

  AuthService({Dio? dio, FlutterSecureStorage? storage})
      : _dio = dio ??
            Dio(
              BaseOptions(
                connectTimeout: const Duration(seconds: 30),
                receiveTimeout: const Duration(seconds: 30),
                headers: const {'Content-Type': 'application/json'},
              ),
            ),
        _storage = storage ?? const FlutterSecureStorage();

  Future<bool> hasStoredToken() async {
    final token = await _storage.read(key: _keyToken);
    return token != null && token.isNotEmpty;
  }

  Future<String?> readStoredName() async => _storage.read(key: _keyName);

  Future<String?> readStoredRank() async => _storage.read(key: _keyRank);

  Future<Map<String, dynamic>> login(String identifier, String password) async {
    try {
      final response = await _dio.post(
        '$BASE_URL/auth/login',
        data: <String, dynamic>{
          'username': identifier,
          'password': password,
        },
      );

      final Map<String, dynamic> root = _parseResponseMap(response.data);
      final Map<String, dynamic> payload = root['data'] is Map
          ? Map<String, dynamic>.from(root['data']! as Map)
          : root;

      final token = (payload['token'] ?? payload['access_token'])?.toString();
      if (token == null || token.isEmpty) {
        throw Exception('Missing token in response');
      }

      final Map<String, dynamic> officerData = payload['officer'] is Map 
          ? Map<String, dynamic>.from(payload['officer'] as Map) 
          : payload;
      
      final id = officerData['unique_id']?.toString() ?? identifier;
      final name = officerData['full_name']?.toString() ?? officerData['name']?.toString() ?? '';
      final rank = officerData['rank']?.toString() ?? '';

      await _storage.write(key: _keyUniqueId, value: id);
      await _storage.write(key: _keyToken, value: token);
      await _storage.write(key: _keyName, value: name);
      await _storage.write(key: _keyRank, value: rank);

      return payload;
    } on DioException catch (e) {
      throw Exception(_messageFromDio(e));
    }
  }

  Map<String, dynamic> _parseResponseMap(dynamic data) {
    if (data is Map<String, dynamic>) {
      return Map<String, dynamic>.from(data);
    }
    if (data is Map) {
      return Map<String, dynamic>.from(data);
    }
    if (data is String) {
      try {
        final decoded = jsonDecode(data);
        if (decoded is Map) {
          return Map<String, dynamic>.from(decoded);
        }
      } on FormatException {
        throw Exception('Invalid response from server');
      }
    }
    throw Exception('Invalid response from server');
  }

  String _messageFromDio(DioException e) {
    final data = e.response?.data;
    if (data is Map) {
      final m = Map<String, dynamic>.from(data);
      if (m['message'] != null) return m['message'].toString();
      if (m['error'] != null) return m['error'].toString();
    }
    if (data is String && data.isNotEmpty) {
      try {
        final decoded = jsonDecode(data);
        if (decoded is Map && decoded['message'] != null) {
          return decoded['message'].toString();
        }
      } catch (_) {
        return data;
      }
    }
    return e.message?.isNotEmpty == true ? e.message! : 'Login failed';
  }

  Future<void> logout() async {
    await _storage.deleteAll();
  }

  Future<void> register({
    required String name,
    required String username,
    required String email,
    required String password,
    required String confirmPassword,
    required String mobileNumber,
  }) async {
    try {
      await _dio.post(
        '$BASE_URL/auth/register',
        data: <String, dynamic>{
          'name': name,
          'username': username,
          'email': email,
          'password': password,
          'confirm_password': confirmPassword,
          'mobile_number': mobileNumber,
        },
      );
    } on DioException catch (e) {
      throw Exception(_messageFromDio(e));
    }
  }

  Future<void> resetPassword(String identifier, String newPassword, String confirmPassword) async {
    try {
      await _dio.post(
        '$BASE_URL/auth/reset-password',
        data: <String, dynamic>{
          'identifier': identifier,
          'new_password': newPassword,
          'confirm_password': confirmPassword,
        },
      );
    } on DioException catch (e) {
      throw Exception(_messageFromDio(e));
    }
  }
}
