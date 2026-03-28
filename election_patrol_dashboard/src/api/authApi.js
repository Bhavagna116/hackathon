import axiosInstance from "./axiosInstance";

export async function login(username, password) {
  const { data } = await axiosInstance.post("/auth/login", {
    username,
    password,
  });
  return {
    access_token: data.access_token,
    officer: data.officer,
  };
}

/**
 * Sign-up: the form only collects name, username, password (+ confirm on the client).
 * The API still stores email / rank / mobile in the database — we derive sensible defaults
 * here so older servers (that require those keys) and the current backend both accept the request.
 */
export async function register(full_name, username, password) {
  const u = String(username).trim();
  const emailLocal = u.replace(/[^a-zA-Z0-9._-]/g, "") || "user";
  await axiosInstance.post("/auth/register", {
    full_name: String(full_name).trim(),
    username: u,
    password,
    email: `${emailLocal}@example.com`,
    rank: "Officer",
    mobile_number: "0000000000",
  });
}

export async function getMe() {
  const { data } = await axiosInstance.get("/auth/me");
  return data;
}
