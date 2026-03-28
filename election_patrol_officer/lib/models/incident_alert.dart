enum IncidentSeverity {
  low,
  medium,
  high,
}

class IncidentAlert {
  IncidentAlert({
    required this.incidentId,
    required this.incidentType,
    required this.latitude,
    required this.longitude,
    required this.severity,
    required this.timestamp,
    required this.message,
  });

  final String incidentId;
  final String incidentType;
  final double latitude;
  final double longitude;
  final IncidentSeverity severity;
  final DateTime timestamp;
  final String message;

  factory IncidentAlert.fromJson(Map<String, dynamic> json) {
    double parseDouble(dynamic v) {
      if (v == null) return 0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0;
    }

    final rawSeverity = (json['severity'] ?? json['incident_severity'])?.toString() ?? 'low';
    IncidentSeverity severity;
    switch (rawSeverity.toLowerCase()) {
      case 'high':
        severity = IncidentSeverity.high;
        break;
      case 'medium':
        severity = IncidentSeverity.medium;
        break;
      default:
        severity = IncidentSeverity.low;
    }

    final tsRaw = json['timestamp']?.toString();
    final parsed = tsRaw != null ? DateTime.tryParse(tsRaw) : null;

    return IncidentAlert(
      incidentId: (json['incident_id'] ?? json['incidentId'])?.toString() ?? '',
      incidentType: (json['incident_type'] ?? json['incidentType'] ?? 'Incident')?.toString() ?? 'Incident',
      latitude: parseDouble(json['latitude'] ?? json['lat']),
      longitude: parseDouble(json['longitude'] ?? json['lng']),
      severity: severity,
      timestamp: parsed?.toUtc() ?? DateTime.now().toUtc(),
      message: json['message']?.toString() ?? '',
    );
  }
}
