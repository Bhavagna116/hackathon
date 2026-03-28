class PollingStation {
  PollingStation({
    required this.stationId,
    required this.stationName,
    required this.latitude,
    required this.longitude,
    required this.assignedArea,
  });

  final String stationId;
  final String stationName;
  final double latitude;
  final double longitude;
  final String assignedArea;

  factory PollingStation.fromJson(Map<String, dynamic> json) {
    double parseD(dynamic v) {
      if (v == null) return 0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0;
    }

    return PollingStation(
      stationId: (json['station_id'] ?? json['stationId'])?.toString() ?? '',
      stationName: (json['station_name'] ?? json['stationName'] ?? json['name'])?.toString() ?? 'Station',
      latitude: parseD(json['latitude'] ?? json['lat']),
      longitude: parseD(json['longitude'] ?? json['lng']),
      assignedArea: (json['assigned_area'] ?? json['assignedArea'])?.toString() ?? '',
    );
  }
}
