enum AvailabilityStatus {
  free,
  busy,
  assigned,
}

class OfficerLocation {
  OfficerLocation({
    required this.uniqueId,
    required this.latitude,
    required this.longitude,
    required this.timestamp,
    required this.availabilityStatus,
  });

  final String uniqueId;
  final double latitude;
  final double longitude;
  final DateTime timestamp;
  final AvailabilityStatus availabilityStatus;

  Map<String, dynamic> toJson() => {
        'unique_id': uniqueId,
        'latitude': latitude,
        'longitude': longitude,
        'timestamp': timestamp.toIso8601String(),
        'availability_status': availabilityStatus.name,
      };
}
