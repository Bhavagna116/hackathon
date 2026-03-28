import 'package:flutter/material.dart';

import '../models/incident_alert.dart';
import '../services/api_service.dart';
import 'map_screen.dart';

class AlertScreen extends StatelessWidget {
  const AlertScreen({
    super.key,
    required this.alert,
    required this.api,
  });

  final IncidentAlert alert;
  final ApiService api;

  static const Color _navy = Color(0xFF0A2342);

  Color _severityColor(IncidentSeverity s) {
    switch (s) {
      case IncidentSeverity.high:
        return Colors.red.shade700;
      case IncidentSeverity.medium:
        return Colors.orange.shade800;
      case IncidentSeverity.low:
        return Colors.green.shade800;
    }
  }

  String _severityLabel(IncidentSeverity s) {
    switch (s) {
      case IncidentSeverity.high:
        return 'HIGH';
      case IncidentSeverity.medium:
        return 'MEDIUM';
      case IncidentSeverity.low:
        return 'LOW';
    }
  }

  Future<void> _responding(BuildContext context) async {
    try {
      await api.updateStatus('assigned');
      await api.respondToIncident(alert.incidentId);
      if (!context.mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (BuildContext _) => MapScreen(api: api, incident: alert),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;
      final msg = e is Exception ? e.toString().replaceFirst('Exception: ', '') : '$e';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: Colors.red.shade800),
      );
    }
  }

  Future<void> _cannotRespond(BuildContext context) async {
    try {
      await api.updateStatus('busy');
      if (!context.mounted) return;
      Navigator.of(context).pop();
    } catch (e) {
      if (!context.mounted) return;
      final msg = e is Exception ? e.toString().replaceFirst('Exception: ', '') : '$e';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: Colors.red.shade800),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final sevColor = _severityColor(alert.severity);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text('Incident alert'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Incident type',
                style: TextStyle(color: _navy.withOpacity(0.75), fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              Text(
                alert.incidentType,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: _navy,
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 20),
              Text(
                'Severity',
                style: TextStyle(color: _navy.withOpacity(0.75), fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: sevColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: sevColor.withOpacity(0.5)),
                ),
                child: Text(
                  _severityLabel(alert.severity),
                  style: TextStyle(
                    color: sevColor,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Location',
                style: TextStyle(color: _navy.withOpacity(0.75), fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              SelectableText(
                '${alert.latitude.toStringAsFixed(6)}, ${alert.longitude.toStringAsFixed(6)}',
                style: TextStyle(color: _navy, fontSize: 16),
              ),
              const SizedBox(height: 20),
              Text(
                'Timestamp',
                style: TextStyle(color: _navy.withOpacity(0.75), fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              Text(
                alert.timestamp.toLocal().toIso8601String(),
                style: TextStyle(color: _navy.withOpacity(0.9)),
              ),
              const SizedBox(height: 20),
              Text(
                'Message',
                style: TextStyle(color: _navy.withOpacity(0.75), fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              Text(
                alert.message.isNotEmpty ? alert.message : '—',
                style: TextStyle(color: _navy.withOpacity(0.9)),
              ),
              const Spacer(),
              FilledButton(
                onPressed: () => _responding(context),
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.green.shade800,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: const Text("I'm Responding"),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => _cannotRespond(context),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _navy,
                  side: BorderSide(color: _navy.withOpacity(0.8)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: const Text('Cannot Respond'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

