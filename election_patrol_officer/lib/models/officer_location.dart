enum AvailabilityStatus {
  free,
  busy,
  assigned,
}

class OfficerLocation {
  OfficerLocation({
    required this.officerId,
    required this.latitude,
    required this.longitude,
    required this.timestamp,
    required this.availabilityStatus,
  });

  final String officerId;
  final double latitude;
  final double longitude;
  final DateTime timestamp;
  final AvailabilityStatus availabilityStatus;

  Map<String, dynamic> toJson() => {
        'officer_id': officerId,
        'latitude': latitude,
        'longitude': longitude,
        'timestamp': timestamp.toIso8601String(),
        'availability_status': availabilityStatus.name,
      };
}
