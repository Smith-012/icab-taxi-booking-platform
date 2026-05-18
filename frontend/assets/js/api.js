/**
 * api.js — Centralized API calls with JWT / Secure Token authentication
 * Standardized to prioritize localStorage for consistent Bearer token handling.
 */

// ─── Polling Management (Low Level) ──────────────────────────
window.activeIntervals = [];

/**
 * Track and start an interval. Use this instead of setInterval
 * for background polling to allow for global cleanup.
 */
window.safeSetInterval = function (fn, ms) {
  const id = setInterval(fn, ms);
  window.activeIntervals.push(id);
  return id;
};

/**
 * Stop all registered background polling tasks.
 */
window.stopAllPolling = function () {
  console.log(
    `[Polling] Clearing ${window.activeIntervals.length} active intervals.`,
  );
  window.activeIntervals.forEach(clearInterval);
  window.activeIntervals = [];
};

// Helper to get auth token from localStorage (primary) or cookies (fallback)
function getAuthToken() {
  // 1. Try localStorage (Standard/Admin/Driver)
  let token = localStorage.getItem("icab_access");
  if (token) return token;

  // 2. Try sessionStorage
  token = sessionStorage.getItem("icab_access");
  if (token) return token;

  // 3. Try cookies (last resort for HttpOnly flows)
  const cookies = document.cookie.split(";");
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "icab_access") {
      return decodeURIComponent(value);
    }
  }

  return null;
}

// Helper to get headers with Auth token
function getAuthHeaders() {
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
  };

  // Always include Bearer token if we have one
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }
  return headers;
}

// Global fetch wrapper
async function apiCall(endpoint, method = "GET", body = null) {
  const options = {
    method: method,
    headers: getAuthHeaders(),
    credentials: "include",
  };

  // Skip Auth header for public/auth endpoints
  if (
    endpoint.includes("/auth/login") ||
    endpoint.includes("/auth/register") ||
    endpoint.includes("/auth/forgot-password") ||
    endpoint.includes("/admin/login")
  ) {
    delete options.headers["Authorization"];
  }

  if (body) {
    if (body instanceof FormData) {
      delete options.headers["Content-Type"];
      options.body = body;
    } else {
      options.body = JSON.stringify(body);
    }
  }

  try {
    console.log(`[API Call] ${method} ${API_BASE_URL + endpoint}`);
    const response = await fetch(API_BASE_URL + endpoint, options);

    // Handle Auth Errors (401/403)
    const isAuthEndpoint =
      endpoint.includes("/auth/login") ||
      endpoint.includes("/auth/register") ||
      endpoint.includes("/auth/me") ||
      endpoint.includes("/auth/logout");

    if (
      (response.status === 401 || response.status === 403) &&
      !isAuthEndpoint
    ) {
      console.warn(
        `[API] Auth Failed (${response.status}) on ${endpoint}. Logging out.`,
      );
      if (
        typeof window.forceLogout === "function" &&
        !window.isLoggingOutInProgress
      ) {
        window.isLoggingOutInProgress = true;
        window.forceLogout();
      }
      // Parse data if possible to preserve backend error message
      let data = {};
      try {
        data = await response.json();
      } catch (e) {}

      throw { status: response.status, data: data };
    }

    // Handle 404
    if (response.status === 404) {
      if (!window.location.pathname.endsWith("404.html")) {
        setTimeout(function () {
          window.location.href = "404.html";
        }, 500);
      }
      throw new Error("Resource Not Found");
    }

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.warn("[API] Failed to parse response as JSON:", parseErr);
      data = { message: text };
    }

    if (!response.ok) {
      throw { status: response.status, data: data };
    }

    return data;
  } catch (error) {
    // Standardize error logging for developers
    if (error.status) {
      console.error(
        `[API Error] ${method} ${endpoint} (Status: ${error.status})`,
        error.data,
      );
    } else {
      console.error(`[API Error] ${method} ${endpoint}`, error);
    }
    throw error;
  }
}
