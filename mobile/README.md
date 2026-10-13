# Shining Star Sales (mobile)

Flutter app for salespeople to fill the site collection form on site. It talks
to the same API as the web admin (`/v1/auth`, `/v1/site-surveys`) and does
nothing else: sign in, list my surveys, view, create, edit, delete.

```text
lib/
  main.dart        app, start on sign-in or list
  theme.dart       colours, type, shared label
  shaft_plan.dart  the shaft drawn to its measurements
  api.dart         HTTP client, token storage, refresh on 401
  survey.dart      Survey model
  screens/         login, list, detail, form
```

## Run

```sh
flutter pub get
flutter run                                              # demo API on Render
flutter run --dart-define=API_URL=http://10.0.2.2:3002/v1  # local API, Android emulator
flutter test
```

`API_URL` defaults to the Render demo. Use `http://localhost:3002/v1` on the
iOS simulator. Release builds should pass the production URL the same way.

Tokens live in the platform's secure storage (Keychain / Keystore). Signing
in here signs the same account out of its other device after the access token
expires; the API keeps one refresh token per user.

Importing the spreadsheet stays on the web admin.
