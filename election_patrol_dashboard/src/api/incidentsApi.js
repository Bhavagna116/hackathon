import axiosInstance from "./axiosInstance";

export function createIncident(data) {
  return axiosInstance.post("/incidents/create", data);
}

export function getActiveIncidents() {
  return axiosInstance.get("/incidents/active");
}

export function getAllIncidents() {
  return axiosInstance.get("/incidents/all");
}

export function resolveIncident(incident_id) {
  return axiosInstance.post(`/incidents/resolve/${incident_id}`);
}
