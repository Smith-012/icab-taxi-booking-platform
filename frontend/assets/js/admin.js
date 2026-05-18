/**
 * admin.js — Admin panel logic: rides, users, and drivers management
 * API-integrated version with fallback to localStorage
 */

var currentAdminTab = "rides";
var adminDataCache = { stats: {}, users: [], rides: [], drivers: [] };

document.addEventListener("DOMContentLoaded", function () {
  // Check if user is admin
  var userRole = localStorage.getItem("icab_user_role");
  var userEmail = localStorage.getItem("icab_user_email");

  if (userRole !== "admin") {
    // Redirect to login if not admin
    window.location.href = "index.html";
    return;
  }

  // Admin is authenticated, load data
  setTimeout(loadAdminDataFromAPI, 500);
});

// ─── Load All Data from API ───────────────────────────────
function loadAdminDataFromAPI() {
  Promise.all([
    loadAdminStats(),
    loadAdminUsers(),
    loadAdminRides(),
    loadAdminDrivers(),
  ])
    .then(function () {
      renderAdminDashboard();
    })
    .catch(function (error) {
      console.error("Error loading admin data:", error);
      // Fallback to localStorage
      loadAdminDataFromLocalStorage();
    });
}

// GET /api/admin/stats/
function loadAdminStats() {
  return apiCall("/admin/stats/", "GET")
    .then(function (response) {
      adminDataCache.stats = response;
      return response;
    })
    .catch(function (error) {
      console.error("Failed to load admin stats:", error);
      return null;
    });
}

// GET /api/admin/users/
function loadAdminUsers() {
  return apiCall("/admin/users/", "GET")
    .then(function (response) {
      adminDataCache.users = Array.isArray(response) ? response : [];
      return response;
    })
    .catch(function (error) {
      console.error("Failed to load admin users:", error);
      return [];
    });
}

// GET /api/admin/rides/
function loadAdminRides() {
  return apiCall("/admin/rides/", "GET")
    .then(function (response) {
      adminDataCache.rides = Array.isArray(response) ? response : [];
      return response;
    })
    .catch(function (error) {
      console.error("Failed to load admin rides:", error);
      return [];
    });
}

// GET /api/admin/drivers/
function loadAdminDrivers() {
  return apiCall("/admin/drivers/", "GET")
    .then(function (response) {
      adminDataCache.drivers = Array.isArray(response) ? response : [];
      return response;
    })
    .catch(function (error) {
      console.error("Failed to load admin drivers:", error);
      return [];
    });
}

// ─── Render Dashboard from Cache ───────────────────────────
function renderAdminDashboard() {
  var stats = adminDataCache.stats;
  setText("adminTotalUsers", stats.total_users || 0);
  setText("adminTotalDrivers", stats.total_drivers || 0);
  setText("adminTotalRides", stats.total_rides || 0);
  setText("adminPendingRides", stats.total_rides - stats.completed_rides || 0);
  setText(
    "adminTotalRevenue",
    "₹ " + parseFloat(stats.total_revenue || 0).toFixed(2),
  );

  renderAdminRides(adminDataCache.rides);
  renderAdminUsers(adminDataCache.users);
  renderAdminDrivers(adminDataCache.drivers);
}

// ─── Fallback to localStorage ─────────────────────────────
function loadAdminDataFromLocalStorage() {
  var users = JSON.parse(localStorage.getItem("icab_users") || "[]");
  var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");
  var drivers = users.filter(function (u) {
    return u.role === "driver";
  });
  var regularUsers = users.filter(function (u) {
    return u.role !== "driver";
  });

  setText("adminTotalUsers", regularUsers.length);
  setText("adminTotalDrivers", drivers.length);
  setText("adminTotalRides", rides.length);
  setText(
    "adminPendingRides",
    rides.filter(function (r) {
      return r.status === "pending";
    }).length,
  );
  setText(
    "adminTotalRevenue",
    "₹ " +
      rides
        .filter(function (r) {
          return r.status === "completed";
        })
        .reduce(function (s, r) {
          return s + parseFloat(r.fare || 0);
        }, 0)
        .toFixed(2),
  );

  renderAdminRides(rides);
  renderAdminUsers(regularUsers);
  renderAdminDrivers(drivers);
}

// ─── Tab Switching ─────────────────────────────────────────
function showAdminTab(tab) {
  currentAdminTab = tab;
  var panels = ["rides", "users", "drivers", "broadcast", "notifications"];
  panels.forEach(function (p) {
    var panel = document.getElementById("panel" + cap(p));
    var btn = document.getElementById("tab" + cap(p));
    if (panel) panel.classList.toggle("hidden", p !== tab);
    if (btn) btn.classList.toggle("active", p === tab);
  });
  if (tab === "notifications") renderAdminNotifications();
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Admin Notifications Tab ───────────────────────────────
function renderAdminNotifications() {
  var container = document.getElementById("adminNotifList");
  if (!container) return;
  var notifs = typeof getNotifs === "function" ? getNotifs() : [];
  if (notifs.length === 0) {
    container.innerHTML =
      '<p class="text-center py-8 text-zinc-400 text-sm">No notifications yet. Broadcasted messages will appear here.</p>';
    return;
  }
  container.innerHTML = notifs
    .map(function (n) {
      return (
        '<div class="flex items-start gap-4 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 mb-3 ' +
        (!n.read
          ? "bg-yellow-50 dark:bg-yellow-900/10"
          : "bg-white dark:bg-zinc-900") +
        '">' +
        '<div class="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 ' +
        n.color +
        '">' +
        n.icon +
        "</div>" +
        '<div class="flex-1">' +
        '<div class="flex justify-between items-start">' +
        '<p class="font-bold ' +
        (!n.read ? "text-zinc-900 dark:text-white" : "text-zinc-500") +
        '">' +
        n.title +
        "</p>" +
        "<button onclick=\"deleteNotif(event,'" +
        n.id +
        '\')" class="text-zinc-300 hover:text-red-500 transition text-xl ml-2 leading-none">&times;</button>' +
        "</div>" +
        '<p class="text-sm text-zinc-400 mt-0.5">' +
        n.desc +
        "</p>" +
        "</div></div>"
      );
    })
    .join("");
}

// ─── Render Rides ─────────────────────────────────────────
function renderAdminRides(rides) {
  var div = document.getElementById("adminRidesTable");
  if (!div) return;
  if (rides.length === 0) {
    div.innerHTML =
      "<p class='py-6 text-center text-zinc-400'>No rides found.</p>";
    return;
  }

  var html =
    '<div class="overflow-x-auto"><table class="w-full text-left text-sm">' +
    '<thead><tr class="border-b dark:border-zinc-700 text-zinc-400 text-xs uppercase">' +
    '<th class="pb-3 pr-4">ID</th><th class="pb-3 pr-4">Route</th>' +
    '<th class="pb-3 pr-4">Status</th><th class="pb-3 pr-4">Fare</th><th class="pb-3">Actions</th>' +
    "</tr></thead><tbody>";

  rides.forEach(function (r) {
    html +=
      '<tr class="border-b dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition">' +
      '<td class="py-3 pr-4 font-mono text-xs text-zinc-400">#' +
      String(r.id).slice(-6) +
      "</td>" +
      '<td class="py-3 pr-4 max-w-[200px]"><p class="truncate font-medium">' +
      (r.pickup || "—") +
      "</p>" +
      '<p class="truncate text-xs text-zinc-400">' +
      (r.dropoff || "—") +
      "</p></td>" +
      '<td class="py-3 pr-4"><span class="status-badge status-' +
      r.status +
      '">' +
      r.status.replace("_", " ") +
      "</span></td>" +
      '<td class="py-3 pr-4 font-bold">₹' +
      parseFloat(r.fare || 0).toFixed(2) +
      "</td>" +
      '<td class="py-3"><div class="flex gap-2">' +
      '<button onclick="updateRideStatus(' +
      r.id +
      ', \'completed\')" class="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-600 rounded-lg hover:bg-green-200 transition font-semibold">✓ Complete</button>' +
      '<button onclick="updateRideStatus(' +
      r.id +
      ', \'cancelled\')" class="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-500 rounded-lg hover:bg-red-200 transition font-semibold">✕ Cancel</button>' +
      "</div></td></tr>";
  });

  html += "</tbody></table></div>";
  div.innerHTML = html;
}

// ─── Render Users ──────────────────────────────────────────
function renderAdminUsers(users) {
  var div = document.getElementById("adminUsersTable");
  if (!div) return;
  if (users.length === 0) {
    div.innerHTML =
      "<p class='py-6 text-center text-zinc-400'>No users registered.</p>";
    return;
  }

  var html =
    '<div class="overflow-x-auto"><table class="w-full text-left text-sm">' +
    '<thead><tr class="border-b dark:border-zinc-700 text-zinc-400 text-xs uppercase">' +
    '<th class="pb-3 pr-4">Name</th><th class="pb-3 pr-4">Email</th>' +
    '<th class="pb-3 pr-4">Status</th><th class="pb-3 pr-4">Joined</th><th class="pb-3">Actions</th>' +
    "</tr></thead><tbody>";

  users.forEach(function (u) {
    var isBlacklisted = u.status === "blacklisted";
    html +=
      '<tr class="border-b dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition">' +
      '<td class="py-3 pr-4 font-bold">' +
      u.name +
      "</td>" +
      '<td class="py-3 pr-4 text-zinc-500">' +
      u.email +
      "</td>" +
      '<td class="py-3 pr-4"><span class="text-xs font-bold px-2 py-0.5 rounded-full ' +
      (isBlacklisted
        ? "bg-red-100 dark:bg-red-900/20 text-red-500"
        : "bg-green-100 dark:bg-green-900/20 text-green-600") +
      '">' +
      (isBlacklisted ? "🚫 Blacklisted" : "✅ Active") +
      "</span></td>" +
      '<td class="py-3 pr-4 text-xs text-zinc-400">' +
      new Date(u.createdAt).toLocaleDateString("en-IN") +
      "</td>" +
      '<td class="py-3"><div class="flex gap-2">' +
      "<button onclick=\"toggleUserStatus('" +
      u.id +
      "', '" +
      u.role +
      '\')" class="text-xs px-2 py-1 ' +
      (isBlacklisted
        ? "bg-green-100 dark:bg-green-900/20 text-green-600 hover:bg-green-200"
        : "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 hover:bg-yellow-200") +
      ' rounded-lg transition font-semibold">' +
      (isBlacklisted ? "✓ Unblock" : "🚫 Blacklist") +
      "</button>" +
      "<button onclick=\"deleteUser('" +
      u.id +
      "', '" +
      u.role +
      '\')" class="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-500 hover:bg-red-200 rounded-lg transition font-semibold">🗑 Delete</button>' +
      "</div></td></tr>";
  });

  html += "</tbody></table></div>";
  div.innerHTML = html;
}

// ─── Render Drivers ────────────────────────────────────────
function renderAdminDrivers(drivers) {
  var div = document.getElementById("adminDriversTable");
  if (!div) return;
  if (drivers.length === 0) {
    div.innerHTML =
      "<div class='text-center py-12'><div class='text-4xl mb-3'>🚗</div><p class='text-zinc-400'>No drivers registered yet.</p><p class='text-xs text-zinc-400 mt-1'>Drivers can register from the login page.</p></div>";
    return;
  }

  var html =
    '<div class="overflow-x-auto"><table class="w-full text-left text-sm">' +
    '<thead><tr class="border-b dark:border-zinc-700 text-zinc-400 text-xs uppercase">' +
    '<th class="pb-3 pr-4">Driver</th><th class="pb-3 pr-4">Vehicle</th>' +
    '<th class="pb-3 pr-4">License / Plate</th><th class="pb-3 pr-4">Rating</th>' +
    '<th class="pb-3 pr-4">Earnings</th><th class="pb-3 pr-4">Status</th><th class="pb-3">Actions</th>' +
    "</tr></thead><tbody>";

  drivers.forEach(function (d) {
    var isBlacklisted = d.status === "blacklisted";
    html +=
      '<tr class="border-b dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition">' +
      '<td class="py-3 pr-4">' +
      '<div class="flex items-center gap-2">' +
      '<div class="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center text-sm font-black text-black">' +
      (d.name || "?").charAt(0).toUpperCase() +
      "</div>" +
      '<div><p class="font-bold">' +
      d.name +
      '</p><p class="text-xs text-zinc-400">' +
      d.email +
      "</p></div>" +
      "</div></td>" +
      '<td class="py-3 pr-4 text-zinc-500">' +
      (d.vehicle || "—") +
      "</td>" +
      '<td class="py-3 pr-4">' +
      '<p class="font-mono font-bold text-xs uppercase bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-500 px-2 py-1 rounded inline-block mb-1 border border-yellow-300 dark:border-yellow-700/50">' +
      (d.plate || "—") +
      '</p><p class="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">' +
      "DL: " +
      (d.license || "—") +
      "</p></td>" +
      '<td class="py-3 pr-4 text-yellow-500 font-bold">⭐ ' +
      (d.rating || "5.0") +
      "</td>" +
      '<td class="py-3 pr-4 font-bold text-green-500">₹' +
      parseFloat(d.earnings || 0).toFixed(2) +
      "</td>" +
      '<td class="py-3 pr-4"><span class="text-xs font-bold px-2 py-0.5 rounded-full ' +
      (isBlacklisted
        ? "bg-red-100 dark:bg-red-900/20 text-red-500"
        : "bg-green-100 dark:bg-green-900/20 text-green-600") +
      '">' +
      (isBlacklisted ? "🚫 Blacklisted" : "✅ Active") +
      "</span></td>" +
      '<td class="py-3"><div class="flex gap-2">' +
      "<button onclick=\"toggleUserStatus('" +
      d.id +
      "', 'driver')\" class=\"text-xs px-2 py-1 " +
      (isBlacklisted
        ? "bg-green-100 dark:bg-green-900/20 text-green-600 hover:bg-green-200"
        : "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 hover:bg-yellow-200") +
      ' rounded-lg transition font-semibold">' +
      (isBlacklisted ? "✓ Unblock" : "🚫 Blacklist") +
      "</button>" +
      "<button onclick=\"deleteUser('" +
      d.id +
      "', 'driver')\" class=\"text-xs px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-500 hover:bg-red-200 rounded-lg transition font-semibold\">🗑 Delete</button>" +
      "</div></td></tr>";
  });

  html += "</tbody></table></div>";
  div.innerHTML = html;
}

// ─── Ride Status Update ────────────────────────────────────
function updateRideStatus(id, newStatus) {
  showToast("Updating ride status...", "info");
  // Note: PUT/PATCH for ride status would need to be added to backend if required
  // For now, fallback to localStorage
  var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");
  rides = rides.map(function (r) {
    return String(r.id) === String(id)
      ? Object.assign({}, r, { status: newStatus })
      : r;
  });
  localStorage.setItem("icab_rides", JSON.stringify(rides));
  loadAdminDataFromAPI();
  showToast("Ride updated to " + newStatus, "info");
}

// ─── Toggle User/Driver Blacklist ──────────────────────────
function toggleUserStatus(id, role) {
  var users = adminDataCache.users;
  var user = users.find(function (u) {
    return String(u.id) === String(id);
  });
  if (!user) return;

  var action = user.status === "deleted" ? "active" : "deleted";
  var label = role === "driver" ? "Driver" : "User";

  showConfirm({
    icon: action === "deleted" ? "🚫" : "✅",
    title:
      action === "deleted"
        ? "Delete this " + label + "?"
        : "Restore this " + label + "?",
    message:
      action === "deleted"
        ? label + " will be removed from the platform."
        : label + " will be restored and can login again.",
    type: action === "deleted" ? "danger" : "primary",
    confirmText: action === "deleted" ? "🚫 Delete" : "✅ Restore",
    cancelText: "Cancel",
    onConfirm: function () {
      // PUT /api/admin/users/{id}/
      apiCall("/admin/users/" + id + "/", "PUT", { status: action })
        .then(function (response) {
          showToast(
            label + (action === "deleted" ? " deleted." : " restored."),
            action === "deleted" ? "error" : "success",
          );
          loadAdminDataFromAPI();
        })
        .catch(function (error) {
          console.error("Failed to update user status:", error);
          showToast("Failed to update " + label.toLowerCase(), "error");
          // Fallback to localStorage
          var users = JSON.parse(localStorage.getItem("icab_users") || "[]");
          users = users.map(function (u) {
            return String(u.id) === String(id)
              ? Object.assign({}, u, { status: action })
              : u;
          });
          localStorage.setItem("icab_users", JSON.stringify(users));
          loadAdminDataFromAPI();
        });
    },
  });
}

// ─── Delete User/Driver ────────────────────────────────────
function deleteUser(id, role) {
  var label = role === "driver" ? "driver" : "user";
  showConfirm({
    icon: "🗑️",
    title: "Delete this " + label + "?",
    message:
      "This will permanently remove all their data. This cannot be undone.",
    type: "danger",
    confirmText: "🗑 Yes, Delete",
    cancelText: "Cancel",
    onConfirm: function () {
      // DELETE /api/admin/users/{id}/
      apiCall("/admin/users/" + id + "/delete/", "DELETE")
        .then(function (response) {
          showToast(cap(label) + " deleted permanently.", "info");
          loadAdminDataFromAPI();
        })
        .catch(function (error) {
          console.error("Failed to delete user:", error);
          showToast("Failed to delete " + label, "error");
          // Fallback to localStorage
          var users = JSON.parse(localStorage.getItem("icab_users") || "[]");
          users = users.filter(function (u) {
            return String(u.id) !== String(id);
          });
          localStorage.setItem("icab_users", JSON.stringify(users));
          loadAdminDataFromAPI();
        });
    },
  });
}

// ─── Helper ───────────────────────────────────────────────
function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Broadcast Logic ──────────────────────────────────────
function sendBroadcast() {
  var title = document.getElementById("bcTitle").value.trim();
  var message = document.getElementById("bcMsg").value.trim();
  var type = document.getElementById("bcType").value;
  var target = document.getElementById("bcTarget").value;

  if (!title || !message) {
    showToast("Please enter title and message.", "error");
    return;
  }

  var notifs = JSON.parse(localStorage.getItem("icab_notifications") || "[]");

  var icons = {
    system: "📢",
    promo: "🎁",
    ride: "🚕",
    wallet: "💳",
  };

  var colors = {
    system: "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
    promo:
      "bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
    ride: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400",
    wallet:
      "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
  };

  var newNotif = {
    id: "bc-" + Date.now(),
    type: type,
    title: title,
    desc: message,
    time: new Date().toISOString(),
    read: false,
    icon: icons[type] || "📢",
    color: colors[type] || colors.system,
    target: target, // In future, backend will use this to filter
  };

  notifs.unshift(newNotif);
  localStorage.setItem("icab_notifications", JSON.stringify(notifs));

  // Reset Form
  document.getElementById("bcTitle").value = "";
  document.getElementById("bcMsg").value = "";

  showToast("Message broadcasted successfully!", "success");

  // If the header notification UI exists, update it
  if (typeof updateNotifUI === "function") updateNotifUI();
}
