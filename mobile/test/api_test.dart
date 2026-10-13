import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:site_survey/api.dart';

const _page = {'items': <Object>[], 'page': 1, 'total': 0, 'totalPages': 0};

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status);

void main() {
  setUp(
    () => FlutterSecureStorage.setMockInitialValues({
      'accessToken': 'old-access',
      'refreshToken': 'old-refresh',
    }),
  );

  test('a 401 refreshes once and retries with the new token', () async {
    final seen = <String>[];
    final api = Api(
      client: MockClient((request) async {
        seen.add(
          '${request.method} ${request.url.path} ${request.headers['Authorization']}',
        );
        if (request.url.path.endsWith('/auth/refresh')) {
          expect(jsonDecode(request.body), {'refreshToken': 'old-refresh'});
          return _json({
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
          });
        }
        return request.headers['Authorization'] == 'Bearer new-access'
            ? _json(_page)
            : _json({'detail': 'Unauthorized'}, 401);
      }),
    );
    await api.restore();

    // Two at once must share a single refresh: the API rotates the token.
    await Future.wait([api.listSurveys(), api.listSurveys()]);

    expect(seen.where((s) => s.contains('/auth/refresh')), hasLength(1));
    expect(seen.last, 'GET /v1/site-surveys Bearer new-access');
  });

  test('a refused refresh signs out and says so', () async {
    var signedOut = false;
    final api = Api(
      client: MockClient((_) async => _json({'detail': 'Unauthorized'}, 401)),
    )..onSignedOut = () => signedOut = true;
    await api.restore();

    await expectLater(
      api.listSurveys(),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)),
    );
    expect(signedOut, isTrue);
    expect(await api.restore(), isFalse);
  });

  test('a refresh lost to the network keeps the session', () async {
    var signedOut = false;
    final api = Api(
      client: MockClient(
        (request) async => request.url.path.endsWith('/auth/refresh')
            ? throw http.ClientException('connection reset')
            : _json({'detail': 'Unauthorized'}, 401),
      ),
    )..onSignedOut = () => signedOut = true;
    await api.restore();

    await expectLater(
      api.listSurveys(),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', null)),
    );
    expect(signedOut, isFalse);
    expect(await api.restore(), isTrue);
  });

  test('problemMessage prefers validation messages, then detail', () {
    expect(
      problemMessage(
        jsonEncode({
          'detail': 'Request validation failed',
          'errors': [
            'contactPhone must be a recognisable Ethiopian phone number',
          ],
        }),
      ),
      'contactPhone must be a recognisable Ethiopian phone number',
    );
    expect(
      problemMessage(
        jsonEncode({'detail': 'A survey for Bole Plaza already exists'}),
      ),
      'A survey for Bole Plaza already exists',
    );
    expect(
      problemMessage('<html>Bad gateway</html>'),
      'Something went wrong. Try again.',
    );
  });
}
