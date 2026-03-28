import axiosInstance from "./axiosInstance";

export function getAllOfficers() {
  return axiosInstance.get("/officers/all");
}

export function getNearbyOfficers(lat, lng, radius_km) {
  return axiosInstance.get("/officers/nearby", {
    params: { lat, lng, radius_km },
  });
}
