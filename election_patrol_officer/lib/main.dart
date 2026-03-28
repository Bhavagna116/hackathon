import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'services/auth_service.dart';
import 'services/notification_service.dart';

/// Global navigator for routing from FCM handlers outside the widget tree.
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  await dotenv.load(fileName: ".env");
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  runApp(const ElectionPatrolApp());
}

class ElectionPatrolApp extends StatefulWidget {
  const ElectionPatrolApp({super.key});

  @override
  State<ElectionPatrolApp> createState() => _ElectionPatrolAppState();
}

class _ElectionPatrolAppState extends State<ElectionPatrolApp> {
  final AuthService _auth = AuthService();
  bool _ready = false;
  bool _loggedIn = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final hasToken = await _auth.hasStoredToken();
    if (!mounted) return;
    setState(() {
      _loggedIn = hasToken;
      _ready = true;
    });
  }

  void _onLoggedIn() => setState(() => _loggedIn = true);

  void _onLoggedOut() => setState(() => _loggedIn = false);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: appNavigatorKey,
      title: 'Election Patrol Officer',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0A2342),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: _ready
          ? (_loggedIn
              ? HomeScreen(
                  auth: _auth,
                  onLoggedOut: _onLoggedOut,
                  navigatorKey: appNavigatorKey,
                )
              : LoginScreen(auth: _auth, onLoggedIn: _onLoggedIn))
          : const Scaffold(
              backgroundColor: Colors.white,
              body: Center(
                child: CircularProgressIndicator(color: Color(0xFF0A2342)),
              ),
            ),
    );
  }
}
