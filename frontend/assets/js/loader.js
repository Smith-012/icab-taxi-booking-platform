/**
 * loader.js — Dynamically loads shared and page-specific components
 */
/* Global Favicon Loader */
(function () {
  const favicon = document.createElement("link");
  favicon.rel = "icon";
  favicon.type = "image/png";
  favicon.href = "assets/logos/favicon.png";

  document.head.appendChild(favicon);
})();

function loadComponent(containerId, filePath, callback) {
  fetch(filePath)
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to load " + filePath);
      return res.text();
    })
    .then(function (html) {
      var el = document.getElementById(containerId);
      if (el) {
        el.innerHTML = html;
        if (typeof callback === "function") callback();
      }
    })
    .catch(function (err) {
      console.error("Component load error:", err);
    });
}

// ─── Shared: update header auth button ────────────────────
function updateHeaderAuth() {
  var dropdownContent = document.getElementById("dropdownContent");
  var userEmailDisplay = document.getElementById("headerUserName");
  if (!dropdownContent) return;

  var userId = localStorage.getItem("icab_user_id");
  var userName = localStorage.getItem("icab_user_name");
  var userRole = localStorage.getItem("icab_user_role");
  var isDark = document.documentElement.classList.contains("dark");
  var themeIcon = isDark ? "☀️" : "🌙";
  var themeText = isDark ? "Light Mode" : "Dark Mode";

  if (userEmailDisplay && userName) {
    userEmailDisplay.textContent = "Hi, " + userName;
  }

  var html = "";

  var notifContainer = document.getElementById("notifBellContainer");

  if (userId) {
    if (notifContainer) notifContainer.style.display = "flex";
    // LOGGED IN
    if (userRole === "admin") {
      html +=
        "<button class='dropdown-item' onclick=\"navigateFromMenu('admin.html')\" style='font-weight: bold;'>🛠️ Admin Panel</button>";
      html += "<div class='dropdown-divider'></div>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateToAdminTab('admin.html', 'admins')\">👑 Admins</button>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateToAdminTab('admin.html', 'rides')\">🚗 Rides</button>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateToAdminTab('admin.html', 'users')\">👥 Users</button>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateToAdminTab('admin.html', 'drivers')\">🚕 Drivers</button>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateToAdminTab('admin.html', 'wallets')\">💳 Wallets</button>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateToAdminTab('admin.html', 'notifications')\">🔔 User Notifications</button>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateToAdminTab('admin.html', 'pastusers')\">📜 Past Users</button>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateToAdminTab('admin.html', 'pastdrivers')\">📜 Past Drivers</button>";
      html += "<div class='dropdown-divider'></div>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateToAdminTab('admin.html', 'broadcast')\">📢 Broadcast</button>";
    } else if (userRole === "driver") {
      // DRIVER MENU
      var pct = parseInt(localStorage.getItem("icab_profile_pct") || "0");
      var profileBadge =
        pct < 100
          ? "<span style='font-size:0.7rem;background:#fef08a;color:#713f12;padding:1px 7px;border-radius:999px;margin-left:auto;'>" +
            pct +
            "%</span>"
          : "<span style='font-size:0.7rem;background:#dcfce7;color:#166534;padding:1px 7px;border-radius:999px;margin-left:auto;'>✓</span>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateFromMenu('driver.html')\">🚗 Driver Dashboard</button>";
      html +=
        "<button class='dropdown-item' style='justify-content:space-between;' onclick=\"navigateFromMenu('driver-profile.html')\">👤 My Profile " +
        profileBadge +
        "</button>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateFromMenu('driver-wallet.html')\">💳 Earnings Wallet</button>";
    } else {
      var pct = parseInt(localStorage.getItem("icab_profile_pct") || "0");
      var profileBadge =
        pct < 100
          ? "<span style='font-size:0.7rem;background:#fef08a;color:#713f12;padding:1px 7px;border-radius:999px;margin-left:auto;'>" +
            pct +
            "%</span>"
          : "<span style='font-size:0.7rem;background:#dcfce7;color:#166534;padding:1px 7px;border-radius:999px;margin-left:auto;'>✓</span>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateFromMenu('dashboard.html')\">🏠 Dashboard</button>";
      html +=
        "<button class='dropdown-item' style='justify-content:space-between;' onclick=\"navigateFromMenu('profile.html')\">👤 My Profile " +
        profileBadge +
        "</button>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateFromMenu('wallet.html')\">💳 Wallet</button>";
      html +=
        "<button class='dropdown-item' onclick=\"navigateFromMenu('history.html')\">📜 Ride History</button>";
      // Link to most recent active booking if any
      var allRides = [];
      try {
        var raw = JSON.parse(localStorage.getItem("icab_rides") || "[]");
        allRides = Array.isArray(raw) ? raw : [];
      } catch (e) {
        allRides = [];
      }
      var uid = localStorage.getItem("icab_user_id");
      var activeRide = allRides.find(function (r) {
        return (
          r.userId == uid &&
          (r.status === "pending" ||
            r.status === "in_progress" ||
            r.status === "accepted")
        );
      });
      if (activeRide) {
        html +=
          "<button class='dropdown-item' onclick=\"navigateFromMenu('booking-detail.html?id=" +
          activeRide.id +
          "')\">📋 Current Booking <span style='font-size:0.7rem;background:#fef08a;color:#713f12;padding:1px 7px;border-radius:999px;margin-left:auto;'>Live</span></button>";
      }
    }

    html += "<div class='dropdown-divider'></div>";
    html +=
      "<button class='dropdown-item' onclick='toggleThemeInDropdown(event)'> " +
      themeIcon +
      " " +
      themeText +
      "</button>";
    html += "<div class='dropdown-divider'></div>";
    html +=
      "<button class='dropdown-item text-red-500' onclick='logoutUserFromMenu()'>🚪 Logout</button>";
  } else {
    // GUEST
    if (notifContainer) notifContainer.style.display = "none";
    html +=
      "<button class='dropdown-item' onclick='openLoginFromMenu()'>🔑 Login</button>";
    html +=
      "<button class='dropdown-item' onclick='openRegisterFromMenu()'>📝 Register</button>";
    html += "<div class='dropdown-divider'></div>";
    html +=
      "<button class='dropdown-item' onclick='toggleThemeInDropdown(event)'> " +
      themeIcon +
      " " +
      themeText +
      "</button>";
  }

  dropdownContent.innerHTML = html;
}

// ─── Role-based Page Guard (API-verified) ─────────────────
// Validates auth status with backend before allowing access
var PAGE_ROLE_MAP = {
  "dashboard.html": ["user"],
  "history.html": ["user"],
  "booking-detail.html": ["user"],
  "wallet.html": ["user"],
  "profile.html": ["user"],
  "driver.html": ["driver"],
  "driver-profile.html": ["driver"],
  "driver-wallet.html": ["driver"],
  "admin.html": ["admin"],
  "notifications.html": ["user", "driver", "admin"],
};

function pageRoleGuard() {
  var page = window.location.pathname.split("/").pop() || "index.html";
  var allowed = PAGE_ROLE_MAP[page];

  // Page not in map = public (index, 404) — no guard needed
  if (!allowed) return;

  // Check localStorage first, then sessionStorage
  var userId =
    localStorage.getItem("icab_user_id") ||
    sessionStorage.getItem("icab_user_id");
  var role =
    localStorage.getItem("icab_user_role") ||
    sessionStorage.getItem("icab_user_role");
  var token =
    localStorage.getItem("icab_access") ||
    sessionStorage.getItem("icab_access");

  console.log(
    "[pageRoleGuard] Page: " +
      page +
      ", userId: " +
      userId +
      ", role: " +
      role +
      ", token: " +
      (token ? "YES" : "NO"),
  );

  // Not logged in at all → back to landing
  if (!userId || !token) {
    console.log(
      "[pageRoleGuard] ❌ Not logged in (userId or token missing), redirecting to index.html",
    );
    window.location.href = "index.html";
    return;
  }

  // Safety check: ensure apiCall is loaded before calling it
  if (typeof apiCall !== "function") {
    console.warn(
      "[pageRoleGuard] apiCall not ready yet, deferring auth check...",
    );
    // Defer until scripts are fully loaded
    window.addEventListener("load", function () {
      pageRoleGuard();
    });
    return;
  }

  // Build auth headers manually — do NOT rely on apiCall's forceLogout for /auth/me/
  // because that would cause an infinite logout loop (me fails → forceLogout → logout fails → forceLogout again)
  var headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  fetch(
    (typeof API_BASE_URL !== "undefined" ? API_BASE_URL : "") + "/auth/me/",
    {
      method: "GET",
      headers: headers,
      credentials: "include",
    },
  )
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Auth check failed: " + response.status);
      }
      return response.json();
    })
    .then(function (data) {
      // Token is valid, check role
      var currentRole = data.role || role;
      localStorage.setItem("icab_user_role", currentRole);
      localStorage.setItem("icab_user_name", data.name || "User");
      localStorage.setItem("icab_user_email", data.email || "");

      if (allowed.indexOf(currentRole) === -1) {
        // Role not allowed for this page → redirect
        if (currentRole === "driver") {
          window.location.href = "driver.html";
        } else if (currentRole === "admin") {
          window.location.href = "admin.html";
        } else {
          window.location.href = "dashboard.html";
        }
      }
    })
    .catch(function (error) {
      console.error("[pageRoleGuard] Auth verification failed:", error);
      // Token expired or invalid → clear tokens and redirect (do NOT call logoutUser to avoid loops)
      localStorage.removeItem("icab_access");
      localStorage.removeItem("icab_refresh");
      sessionStorage.removeItem("icab_access");
      sessionStorage.removeItem("icab_refresh");
      window.location.href = "index.html";
    });
}

// ─── Load components based on current page ────────────────
document.addEventListener("DOMContentLoaded", function () {
  // ── Role Guard: runs first, blocks unauthorized access ──
  pageRoleGuard();

  // Apply saved theme FIRST (prevents flash)
  if (localStorage.getItem("icab_theme") === "dark") {
    document.documentElement.classList.add("dark");
  }

  var isLanding = document.getElementById("hero-container") !== null;
  var isDashboard = document.getElementById("dashUserName") !== null;

  // ── Shared on ALL pages ──
  const v = new Date().getTime();
  loadComponent(
    "header-container",
    "components/header.html?v=" + v,
    function () {
      updateHeaderAuth();
      if (typeof updateNotifUI === "function") updateNotifUI();
    },
  );
  loadComponent("footer-container", "components/footer.html?v=" + v);

  // ── Landing page only ──
  if (isLanding) {
    loadComponent("hero-container", "components/hero.html");
    loadComponent("features-container", "components/features.html");
  }

  // ── Dashboard page only ──
  if (isDashboard) {
    // Set welcome name
    var name = localStorage.getItem("icab_user_name") || "Rider";
    var nameEl = document.getElementById("dashUserName");
    if (nameEl) nameEl.textContent = name;

    // Fetch fresh profile data from API (which includes profile_completion_percentage)
    // This is the source of truth for profile completion - not localStorage calculations
    if (typeof checkAuthStatus === "function") {
      checkAuthStatus().then(function () {
        updateHeaderAuth();
      });
    }

    // Load rides table (from auth.js) - will use percentage from API via localStorage
    if (typeof loadRides === "function") loadRides();
  }

  // ── Fetch profile completion from API to ensure it's fresh ──
  // ── Listen for profile completion updates (from profile.js) ──
  window.addEventListener("profileCompletionUpdated", function (e) {
    console.log("Profile completion updated to " + e.detail.percentage + "%");
    updateHeaderAuth();
  });
});
