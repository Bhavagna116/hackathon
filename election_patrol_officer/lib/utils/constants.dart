/// Production: Render API. Override for local dev, e.g.:
/// `flutter run --dart-define=BASE_URL=http://10.0.2.2:8000` (emulator)
/// or `http://<PC_LAN_IP>:8000` (physical device on same Wi‑Fi).
const String BASE_URL = String.fromEnvironment(
  'BASE_URL',
  defaultValue: 'http://192.168.0.147:8000',
);
