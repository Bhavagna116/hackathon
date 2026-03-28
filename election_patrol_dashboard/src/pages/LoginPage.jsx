import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Shield } from "lucide-react";

import * as authApi from "../api/authApi";
import { useAuthStore } from "../store/authStore";

const pageStyle = {
  minHeight: "100vh",
  height: "100%",
  maxHeight: "100vh",
  overflowY: "auto",
  background: "#0a1628",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.25rem",
  boxSizing: "border-box",
};

const cardStyle = {
  width: "100%",
  maxWidth: "26rem",
  background: "#fff",
  borderRadius: "12px",
  boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35)",
  padding: "2rem 1.75rem",
  boxSizing: "border-box",
};

const titleStyle = {
  margin: "0.5rem 0 0",
  fontSize: "clamp(1.35rem, 4vw, 1.6rem)",
  fontWeight: 700,
  color: "#0a1628",
  textAlign: "center",
};

const subtitleStyle = {
  margin: "0.35rem 0 0",
  fontSize: "0.9rem",
  color: "#5c6578",
  textAlign: "center",
};

const labelStyle = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#0a1628",
  marginBottom: "0.35rem",
};

const inputStyle = {
  width: "100%",
  padding: "0.65rem 0.75rem",
  fontSize: "1rem",
  borderRadius: "8px",
  border: "1px solid #c5cad6",
  boxSizing: "border-box",
};

const buttonStyle = {
  width: "100%",
  marginTop: "0.25rem",
  padding: "0.75rem 1rem",
  fontSize: "1rem",
  fontWeight: 600,
  color: "#fff",
  background: "#0a1628",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
};

const errorStyle = {
  marginTop: "0.85rem",
  fontSize: "0.875rem",
  color: "#c62828",
  textAlign: "center",
};

const toggleWrapStyle = {
  marginTop: "1rem",
  textAlign: "center",
  fontSize: "0.9rem",
  color: "#5c6578",
};

const linkButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  marginLeft: "0.35rem",
  color: "#0a4d8c",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
};

const iconBtnStyle = {
  position: "absolute",
  right: "0.35rem",
  top: "50%",
  transform: "translateY(-50%)",
  padding: "0.35rem",
  border: "none",
  background: "transparent",
  borderRadius: "6px",
  cursor: "pointer",
  color: "#5c6578",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function PasswordField({
  id,
  label,
  name,
  value,
  onChange,
  autoComplete,
  disabled,
  visible,
  onToggleVisible,
}) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          style={{ ...inputStyle, paddingRight: "2.75rem" }}
          disabled={disabled}
          required
        />
        <button
          type="button"
          style={iconBtnStyle}
          onClick={onToggleVisible}
          disabled={disabled}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);

  const [mode, setMode] = useState("signin");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  function parseError(err) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => d.msg || d).join(", ");
    }
    return mode === "signup"
      ? "Could not create account. Try a different username."
      : "Login failed. Check your credentials.";
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { access_token, officer } = await authApi.login(username, password);
      localStorage.setItem("patrol_token", access_token);
      login(officer, access_token);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError("");
    const name = fullName.trim();
    if (!name) {
      setError("Please enter your name.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await authApi.register(name, username.trim(), password);
      const { access_token, officer } = await authApi.login(username.trim(), password);
      localStorage.setItem("patrol_token", access_token);
      login(officer, access_token);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.35rem",
            marginBottom: "1.5rem",
          }}
        >
          <Shield size={40} strokeWidth={1.75} color="#0a1628" aria-hidden />
          <h1 style={titleStyle}>Election Patrol</h1>
          <p style={subtitleStyle}>Control Room Access</p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "1.25rem",
            padding: "0.25rem",
            background: "#eef1f6",
            borderRadius: "10px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError("");
            }}
            disabled={loading}
            style={{
              flex: 1,
              padding: "0.55rem 0.75rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              border: "none",
              borderRadius: "8px",
              cursor: loading ? "wait" : "pointer",
              background: !isSignup ? "#fff" : "transparent",
              color: "#0a1628",
              boxShadow: !isSignup ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            disabled={loading}
            style={{
              flex: 1,
              padding: "0.55rem 0.75rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              border: "none",
              borderRadius: "8px",
              cursor: loading ? "wait" : "pointer",
              background: isSignup ? "#fff" : "transparent",
              color: "#0a1628",
              boxShadow: isSignup ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Sign up
          </button>
        </div>

        {!isSignup ? (
          <form onSubmit={handleSignIn} noValidate>
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="patrol-username" style={labelStyle}>
                Username
              </label>
              <input
                id="patrol-username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
                disabled={loading}
                required
              />
            </div>
            <PasswordField
              id="patrol-password"
              label="Password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
              visible={showPassword}
              onToggleVisible={() => setShowPassword((v) => !v)}
            />
            <button
              type="submit"
              style={{
                ...buttonStyle,
                opacity: loading ? 0.85 : 1,
                cursor: loading ? "wait" : "pointer",
              }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2
                    size={20}
                    aria-hidden
                    style={{ animation: "patrol-spin 0.8s linear infinite" }}
                  />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignUp} noValidate>
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="patrol-fullname" style={labelStyle}>
                Name
              </label>
              <input
                id="patrol-fullname"
                name="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={inputStyle}
                disabled={loading}
                required
              />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="patrol-reg-username" style={labelStyle}>
                Username
              </label>
              <input
                id="patrol-reg-username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
                disabled={loading}
                required
              />
            </div>
            <PasswordField
              id="patrol-reg-password"
              label="Password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              disabled={loading}
              visible={showPassword}
              onToggleVisible={() => setShowPassword((v) => !v)}
            />
            <PasswordField
              id="patrol-confirm-password"
              label="Confirm password"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={loading}
              visible={showConfirmPassword}
              onToggleVisible={() => setShowConfirmPassword((v) => !v)}
            />
            <button
              type="submit"
              style={{
                ...buttonStyle,
                opacity: loading ? 0.85 : 1,
                cursor: loading ? "wait" : "pointer",
              }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2
                    size={20}
                    aria-hidden
                    style={{ animation: "patrol-spin 0.8s linear infinite" }}
                  />
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>
        )}

        {error ? <p style={errorStyle}>{error}</p> : null}

        <p style={toggleWrapStyle}>
          {isSignup ? "Already have an account?" : "New to the control room?"}
          <button
            type="button"
            style={linkButtonStyle}
            onClick={() => {
              setMode(isSignup ? "signin" : "signup");
              setError("");
              if (!isSignup) setConfirmPassword("");
            }}
            disabled={loading}
          >
            {isSignup ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>
      <style>{`
        @keyframes patrol-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
