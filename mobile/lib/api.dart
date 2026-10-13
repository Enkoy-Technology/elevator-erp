import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'survey.dart';

/// The ERP API. Override per build:
/// `flutter run --dart-define=API_URL=http://10.0.2.2:3002/v1`
const apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://elevator-erp.onrender.com/v1',
);

/// The public demo (or a local API): the sign-in form comes prefilled with
/// the demo salesperson, as the web login does. Never true for production.
final isDemo = RegExp(r'onrender\.com|localhost|10\.0\.2\.2').hasMatch(apiUrl);

/// A failure worth showing the salesperson, already in plain words.
class ApiException implements Exception {
  const ApiException(this.message, {this.status});

  final String message;
  final int? status;

  @override
  String toString() => message;
}

/// The one client the app uses. Keeps the token pair in the platform's
/// secure storage (Keychain / Keystore) and refreshes it once on a 401.
class Api {
  Api({http.Client? client, FlutterSecureStorage? storage})
    : _client = client ?? http.Client(),
      _storage = storage ?? const FlutterSecureStorage();

  final http.Client _client;
  final FlutterSecureStorage _storage;
  String? _accessToken;
  String? _refreshToken;
  Future<bool>? _refreshing;

  /// Called when the session cannot be renewed, so the app can show sign-in.
  void Function()? onSignedOut;

  /// The free Render tier can take most of a minute to wake up.
  static const _timeout = Duration(seconds: 60);

  /// True when a session from an earlier launch is still on the device.
  Future<bool> restore() async {
    _accessToken = await _storage.read(key: 'accessToken');
    _refreshToken = await _storage.read(key: 'refreshToken');
    return _refreshToken != null;
  }

  /// The tenant and email last signed in with, to prefill the sign-in form.
  Future<(String, String)> lastLogin() async => (
    await _storage.read(key: 'tenantSlug') ?? '',
    await _storage.read(key: 'email') ?? '',
  );

  Future<void> login(String tenantSlug, String email, String password) async {
    final tokens = await _send(
      'POST',
      '/auth/login',
      body: {'tenantSlug': tenantSlug, 'email': email, 'password': password},
      authed: false,
    );
    await _saveTokens(tokens as Map<String, dynamic>);
    await _storage.write(key: 'tenantSlug', value: tenantSlug);
    await _storage.write(key: 'email', value: email);
  }

  Future<void> logout() async {
    try {
      await _send('POST', '/auth/logout');
    } on ApiException {
      // Signing out locally still has to work with no connection.
    }
    await _clearTokens();
  }

  /// The signed-in person's full name, for the greeting.
  Future<String> myName() async {
    final me = await _send('GET', '/auth/me') as Map<String, dynamic>;
    return me['fullName'] as String;
  }

  Future<SurveyPage> listSurveys({String search = '', int page = 1}) async {
    final query = Uri(
      queryParameters: {
        'page': '$page',
        'pageSize': '25',
        if (search.isNotEmpty) 'search': search,
      },
    ).query;
    final json = await _send('GET', '/site-surveys?$query');
    return SurveyPage.fromJson(json as Map<String, dynamic>);
  }

  Future<Survey> getSurvey(String id) async => Survey.fromJson(
    await _send('GET', '/site-surveys/$id') as Map<String, dynamic>,
  );

  Future<Survey> createSurvey(Map<String, Object?> fields) async =>
      Survey.fromJson(
        await _send('POST', '/site-surveys', body: fields)
            as Map<String, dynamic>,
      );

  /// PATCH answers with the bare row, without "collected by"; read it back.
  Future<Survey> updateSurvey(String id, Map<String, Object?> fields) async {
    await _send('PATCH', '/site-surveys/$id', body: fields);
    return getSurvey(id);
  }

  Future<void> deleteSurvey(String id) => _send('DELETE', '/site-surveys/$id');

  /// Sends one request and returns the decoded JSON body (null when empty).
  Future<Object?> _send(
    String method,
    String path, {
    Object? body,
    bool authed = true,
    bool retried = false,
  }) async {
    final request = http.Request(method, Uri.parse('$apiUrl$path'))
      ..headers['Accept'] = 'application/json';
    if (authed && _accessToken != null) {
      request.headers['Authorization'] = 'Bearer $_accessToken';
    }
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    final http.Response response;
    try {
      response = await _client
          .send(request)
          .then(http.Response.fromStream)
          .timeout(_timeout);
    } on TimeoutException {
      throw const ApiException(
        'The server took too long to answer. Try again.',
      );
    } on Exception {
      // ClientException, SocketException, HandshakeException: no usable link.
      throw const ApiException(
        'No connection. Check your internet and try again.',
      );
    }

    if (response.statusCode == 401 && authed && !retried) {
      if (await _refreshOnce()) {
        return _send(method, path, body: body, retried: true);
      }
      await _clearTokens();
      onSignedOut?.call();
      throw const ApiException(
        'Your session has ended. Sign in again.',
        status: 401,
      );
    }
    if (response.statusCode >= 400) {
      throw ApiException(
        problemMessage(response.body),
        status: response.statusCode,
      );
    }
    if (response.body.isEmpty) return null;
    try {
      return jsonDecode(response.body);
    } on FormatException {
      // A Wi-Fi login page answering in the API's place.
      throw const ApiException(
        'Unexpected answer from the server. Check your connection.',
      );
    }
  }

  /// Several requests can hit a 401 together; they share one refresh, because
  /// the API rotates the refresh token and a second use of the old one fails.
  Future<bool> _refreshOnce() =>
      _refreshing ??= _refresh().whenComplete(() => _refreshing = null);

  /// False only when the API refuses the refresh token. A network failure
  /// rethrows instead: a dropped link must not sign anyone out mid-survey.
  Future<bool> _refresh() async {
    final token = _refreshToken;
    if (token == null) return false;
    try {
      final tokens = await _send(
        'POST',
        '/auth/refresh',
        body: {'refreshToken': token},
        authed: false,
      );
      await _saveTokens(tokens as Map<String, dynamic>);
      return true;
    } on ApiException catch (e) {
      if (e.status == 400 || e.status == 401) return false;
      rethrow;
    }
  }

  Future<void> _saveTokens(Map<String, dynamic> tokens) async {
    _accessToken = tokens['accessToken'] as String;
    _refreshToken = tokens['refreshToken'] as String;
    await _storage.write(key: 'accessToken', value: _accessToken);
    await _storage.write(key: 'refreshToken', value: _refreshToken);
  }

  Future<void> _clearTokens() async {
    _accessToken = null;
    _refreshToken = null;
    await _storage.delete(key: 'accessToken');
    await _storage.delete(key: 'refreshToken');
  }
}

/// The readable part of the API's RFC 7807 error body: the validation
/// messages when there are any, else `detail`.
String problemMessage(String body) {
  try {
    final json = jsonDecode(body) as Map<String, dynamic>;
    final errors = json['errors'];
    if (errors is List && errors.isNotEmpty) return errors.join('\n');
    if (json['detail'] is String) return json['detail'] as String;
  } on FormatException {
    // Not JSON: a proxy or gateway page.
  }
  return 'Something went wrong. Try again.';
}

/// The app's single client.
final api = Api();
