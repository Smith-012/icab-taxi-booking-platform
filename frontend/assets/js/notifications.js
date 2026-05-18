/**
 * notifications.js — Standardized notification logic for iCab
 * API-integrated version with fallback to localStorage
 * Handles both the Dropdown Tray and the Notifications Page
 */

// Helper to escape HTML and prevent XSS
function escapeHTML(str) {
  var p = document.createElement("p");
  p.textContent = str;
  return p.innerHTML;
}

var NOTIF_KEY = "icab_notifications"; // base key — actual key is per user
var notificationsCache = []; // Cache for API notifications

// Returns notifications key for current logged-in user
function getNotifKey() {
  var uid = localStorage.getItem("icab_user_id") || "guest";
  return NOTIF_KEY + "_" + uid;
}

// ─── Default Notifications — Rider ────────────────────────
var DEFAULT_NOTIFS = [
  {
    id: "n1",
    type: "ride",
    title: "Ride Completed!",
    desc: "Your trip from Bandra to Juhu was successful. Hope you enjoyed the ride!",
    time: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    read: false,
    icon: "🚕",
    color:
      "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400",
  },
  {
    id: "n2",
    type: "wallet",
    title: "Payment Deducted",
    desc: "₹150.00 was deducted from your wallet for your last ride.",
    time: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    read: true,
    icon: "💳",
    color:
      "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
  },
  {
    id: "n3",
    type: "promo",
    title: "Special Offer! 🎁",
    desc: "Get 20% OFF on your next 3 rides. Use code ICAB20.",
    time: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    read: false,
    icon: "🎁",
    color:
      "bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
  },
  {
    id: "n4",
    type: "system",
    title: "Profile Incomplete",
    desc: "Complete your home address for faster bookings next time.",
    time: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    read: true,
    icon: "👤",
    color: "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  },
];

// ─── Default Notifications — Driver ───────────────────────
var DEFAULT_DRIVER_NOTIFS = [
  {
    id: "dn1",
    type: "ride",
    title: "New Ride Request!",
    desc: "A rider from Andheri West needs a pickup to Bandra. Go online to accept ride requests.",
    time: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    read: false,
    icon: "🚕",
    color:
      "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400",
  },
  {
    id: "dn2",
    type: "wallet",
    title: "Earnings Credited",
    desc: "₹220.00 has been credited to your driver wallet for completing 2 rides today.",
    time: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    read: false,
    icon: "💰",
    color:
      "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
  },
  {
    id: "dn3",
    type: "system",
    title: "Weekly Summary",
    desc: "You completed 12 rides this week and earned ₹1,840. Great work! Keep it up 🎉",
    time: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    read: true,
    icon: "📊",
    color: "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  },
  {
    id: "dn4",
    type: "system",
    title: "Rating Update",
    desc: "Your driver rating is 4.8 ⭐ — Excellent! A satisfied rider left you a 5-star review.",
    time: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    read: true,
    icon: "⭐",
    color:
      "bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
  },
];

// ─── Default Notifications — Admin ────────────────────────
var DEFAULT_ADMIN_NOTIFS = [
  {
    id: "an1",
    type: "system",
    title: "New Driver Registered",
    desc: "A new driver has completed registration and is pending verification.",
    time: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    read: false,
    icon: "🚗",
    color: "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  },
  {
    id: "an2",
    type: "system",
    title: "Report Generated",
    desc: "Monthly ride & revenue report for February 2026 is ready to view.",
    time: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    read: false,
    icon: "📋",
    color:
      "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400",
  },
  {
    id: "an3",
    type: "system",
    title: "User Flagged",
    desc: "A rider account was flagged for suspicious activity. Please review from the Users panel.",
    time: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    read: true,
    icon: "⚠️",
    color: "bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  },
  {
    id: "an4",
    type: "system",
    title: "System Healthy",
    desc: "All services are running normally. Database: OK, API: OK, Storage: OK.",
    time: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    read: true,
    icon: "✅",
    color:
      "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
  },
];

// ─── Initialize Notifications ─────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  // Only load notifications if user is logged in
  var token = localStorage.getItem("icab_access");
  var userId = localStorage.getItem("icab_user_id");

  if (token && userId) {
    loadNotificationsFromAPI();
  }

  // If on the notifications page, render the list after loading
  if (document.getElementById("fullNotifList")) {
    setTimeout(function () {
      renderNotifPage("all");
    }, 500);
  }
});

// ─── Load Notifications from API ───────────────────────────
function loadNotificationsFromAPI() {
  // GET /api/notifications/
  apiCall("/notifications/", "GET")
    .then(function (response) {
      // Map API response to local format
      notificationsCache = Array.isArray(response)
        ? response
        : response.notifications || [];

      // Convert API fields to local format and sanitize
      notificationsCache = notificationsCache.map(function (n) {
        return {
          id: n.id,
          type: n.notif_type || n.type || "system",
          title: escapeHTML(n.title || ""),
          desc: escapeHTML(n.message || n.desc || ""),
          time: n.created_at || new Date().toISOString(),
          read: n.is_read || false,
          icon: getNotifIcon(n.notif_type || n.type),
          color: getNotifColor(n.notif_type || n.type),
        };
      });

      // SECURITY: Cap storage to 30 most recent to prevent QuotaExceeded errors
      if (notificationsCache.length > 30) {
        notificationsCache = notificationsCache.slice(0, 30);
      }

      // Save to localStorage cache
      localStorage.setItem(getNotifKey(), JSON.stringify(notificationsCache));

      updateNotifUI();
    })
    .catch(function (error) {
      console.error("Failed to load notifications from API:", error);
      loadNotificationsFromLocalStorage();
    });
}

// ─── Fallback to localStorage ─────────────────────────────
function loadNotificationsFromLocalStorage() {
  var key = getNotifKey();
  var stored = localStorage.getItem(key);
  var role = localStorage.getItem("icab_user_role");
  var alreadySeeded = localStorage.getItem(key + "_seeded");

  var needsSeed =
    !stored || (!alreadySeeded && JSON.parse(stored || "[]").length === 0);

  if (needsSeed) {
    if (role === "user") {
      localStorage.setItem(key, JSON.stringify(DEFAULT_NOTIFS));
    } else if (role === "driver") {
      localStorage.setItem(key, JSON.stringify(DEFAULT_DRIVER_NOTIFS));
    } else if (role === "admin") {
      localStorage.setItem(key, JSON.stringify(DEFAULT_ADMIN_NOTIFS));
    } else {
      localStorage.setItem(key, JSON.stringify([]));
    }
    localStorage.setItem(key + "_seeded", "1");
  }

  notificationsCache = getNotifs();
  updateNotifUI();
}

// ─── Notification Icons & Colors ──────────────────────────
function getNotifIcon(type) {
  var icons = {
    ride: "🚕",
    wallet: "💳",
    payment: "💰",
    promo: "🎁",
    system: "📢",
  };
  return icons[type] || "📢";
}

function getNotifColor(type) {
  var colors = {
    ride: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400",
    wallet:
      "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
    payment:
      "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
    promo:
      "bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
    system: "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  };
  return colors[type] || colors.system;
}

// ─── Create Welcome Back Notification ─────────────────────
function createWelcomeNotification(userName) {
  var userId = localStorage.getItem("icab_user_id");
  var userRole = localStorage.getItem("icab_user_role");
  var roleEmoji =
    userRole === "driver" ? "🚗" : userRole === "admin" ? "🛠️" : "🏠";
  var roleLabel =
    userRole === "driver" ? "Driver" : userRole === "admin" ? "Admin" : "Rider";

  // Get all notifications to check if welcome notification exists
  apiCall("/notifications/", "GET")
    .then(function (response) {
      var notifs = Array.isArray(response)
        ? response
        : response.notifications || [];

      // Find existing welcome notification
      var welcomeNotif = notifs.find(function (n) {
        return n.title && n.title.indexOf("Welcome back") !== -1;
      });

      if (welcomeNotif) {
        // Notification exists - check if it's read or unread
        if (welcomeNotif.is_read) {
          // It's marked as read, mark it as unread to show as "new"
          apiCall("/notifications/" + welcomeNotif.id + "/read/", "POST", {
            is_read: false,
          })
            .then(function () {
              console.log("Welcome notification marked as unread");
              loadNotificationsFromAPI();
            })
            .catch(function (error) {
              console.error(
                "Failed to mark welcome notification as unread:",
                error,
              );
            });
        } else {
          // Already unread, just reload to show it
          console.log("Welcome notification already exists and is unread");
          loadNotificationsFromAPI();
        }
      } else {
        // Notification doesn't exist, create new one
        apiCall("/notifications/", "POST", {
          title: "Welcome back, " + userName + "!",
          message:
            "You're logged in as " +
            roleEmoji +
            " " +
            roleLabel +
            ". Ready to go!",
          notif_type: "system",
        })
          .then(function (response) {
            console.log("Welcome notification created");
            loadNotificationsFromAPI();
          })
          .catch(function (error) {
            console.error("Failed to create welcome notification:", error);
          });
      }
    })
    .catch(function (error) {
      console.error("Failed to check for existing notifications:", error);
    });
}

// ─── Core Logic ───────────────────────────────────────────
function getNotifs() {
  try {
    var raw = JSON.parse(localStorage.getItem(getNotifKey()) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function saveNotifs(arr) {
  localStorage.setItem(getNotifKey(), JSON.stringify(arr));
  updateNotifUI();
}

function updateNotifUI() {
  var notifs = getNotifs();
  var unreadCount = notifs.filter((n) => !n.read).length;

  // Update badge
  var badge = document.getElementById("notifCount");
  if (badge) {
    if (unreadCount > 0) {
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  // Update dropdown tray
  var tray = document.getElementById("notifTray");
  var clearBtn = document.getElementById("trayClearBtn");
  var markBtn = document.getElementById("trayMarkReadBtn");

  if (tray) {
    if (notifs.length === 0) {
      tray.innerHTML =
        '<div class="p-8 text-center text-zinc-400 text-sm">No new notifications</div>';

      // Disable header buttons
      if (clearBtn) {
        clearBtn.style.opacity = "0.3";
        clearBtn.style.pointerEvents = "none";
      }
      if (markBtn) {
        markBtn.style.opacity = "0.3";
        markBtn.style.pointerEvents = "none";
      }
    } else {
      // Enable header buttons
      if (clearBtn) {
        clearBtn.style.opacity = "1";
        clearBtn.style.pointerEvents = "auto";
      }
      if (markBtn) {
        markBtn.style.opacity = "1";
        markBtn.style.pointerEvents = "auto";
      }

      // Show last 5
      var html = notifs
        .slice(0, 5)
        .map(
          (n) => `
        <div onclick="readNotif('${n.id}')" class="notif-item ${!n.read ? "unread" : ""}">
          <div class="notif-icon ${n.color}">${n.icon}</div>
          <div class="notif-content">
            <div class="notif-title">
              <span>${n.title}</span>
              ${!n.read ? '<span class="notif-dot"></span>' : ""}
            </div>
            <p class="notif-desc line-clamp-2">${n.desc}</p>
            <span class="notif-time">${formatTime(n.time)}</span>
          </div>
        </div>
      `,
        )
        .join("");
      tray.innerHTML = html;
    }
  }
}

// ─── Page Handlers ────────────────────────────────────────
function renderNotifPage(filter) {
  var container = document.getElementById("fullNotifList");
  var emptyState = document.getElementById("emptyNotif");
  if (!container) return;

  var notifs = getNotifs();
  if (filter !== "all") {
    notifs = notifs.filter((n) => n.type === filter);
  }

  if (notifs.length === 0) {
    container.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }

  container.classList.remove("hidden");
  emptyState.classList.add("hidden");

  var html = notifs
    .map(
      (n) => `
    <div class="relative flex items-start gap-4 p-5 rounded-2xl border transition-all duration-300 ${!n.read ? "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-md hover:-translate-y-1" : "bg-zinc-50/50 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-800/50 opacity-80 hover:opacity-100"}">
      <!-- Icon -->
      <div class="w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center text-2xl ${n.color}">
        ${n.icon}
      </div>
      
      <!-- Content -->
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 class="text-base font-bold text-zinc-900 dark:text-white">
              ${n.title}
            </h3>
            <p class="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              ${n.desc}
            </p>
          </div>
          <div class="flex-shrink-0 text-xs text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap pt-1">
            ${formatDate(n.time)}
          </div>
        </div>
        
        <!-- Actions & Buttons -->
        <div class="flex items-center justify-between gap-4 mt-4">
          <div class="flex gap-4">
            ${renderActions(n)}
          </div>
          <div class="flex gap-1">
            <button onclick="readNotif('${n.id}')" title="${n.read ? "Read" : "Mark as read"}" class="p-2 rounded-xl transition-all duration-200 ${n.read ? "text-green-500 bg-green-50 dark:bg-green-900/10" : "text-zinc-300 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/10"}">
              ${n.read ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clip-rule="evenodd"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>'}
            </button>
            <button onclick="deleteNotif(event, '${n.id}')" title="Delete" class="p-2 text-zinc-300 hover:text-red-500 transition-all duration-200 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  container.innerHTML = html;
}

function renderActions(notif) {
  var actions = "";

  if (notif.type === "ride") {
    actions += `<button class="text-xs font-bold text-yellow-600 dark:text-yellow-500 hover:text-yellow-700 dark:hover:text-yellow-400 transition">📜 View Details</button>
    <button class="text-xs font-bold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition">⭐ Rate Driver</button>`;
  } else if (notif.type === "wallet" || notif.type === "payment") {
    actions += `<button class="text-xs font-bold text-green-600 dark:text-green-500 hover:text-green-700 dark:hover:text-green-400 transition">💳 View Balance</button>`;
  } else if (notif.type === "promo") {
    actions += `<button class="text-xs font-bold text-purple-600 dark:text-purple-500 hover:text-purple-700 dark:hover:text-purple-400 transition">🎁 View Offer</button>`;
  } else if (notif.type === "system") {
    actions += `<button class="text-xs font-bold text-blue-600 dark:text-blue-500 hover:text-blue-700 dark:hover:text-blue-400 transition">⚙️ Settings</button>`;
  }

  return actions;
}

// ─── Actions ──────────────────────────────────────────────
// Dropdowns managed in main.js to avoid conflicts

function markAllRead() {
  // POST /api/notifications/mark-read/ - Mark all notifications as read
  apiCall("/notifications/mark-read/", "POST", {})
    .then(function (response) {
      // Update local cache
      notificationsCache.forEach(function (n) {
        n.read = true;
      });
      saveNotifs(notificationsCache);
      if (document.getElementById("fullNotifList")) {
        renderNotifPage(
          document
            .querySelector(".notif-filter-btn.active")
            .id.replace("filter-", ""),
        );
      }
      showToast("All marked as read!", "success");
    })
    .catch(function (error) {
      console.error("Failed to mark all as read:", error);
      // Fallback to localStorage
      var notifs = getNotifs();
      notifs.forEach(function (n) {
        n.read = true;
      });
      saveNotifs(notifs);
      showToast("All marked as read!", "success");
    });
}

function clearAllNotifications() {
  showConfirm({
    title: "Clear all?",
    message:
      "This will permanently remove all notifications from your history.",
    confirmText: "Clear All",
    type: "danger",
    onConfirm: function () {
      // DELETE /api/notifications/clear/
      apiCall("/notifications/clear/", "DELETE", {})
        .then(function (response) {
          notificationsCache = [];
          saveNotifs([]);
          if (document.getElementById("fullNotifList")) {
            renderNotifPage("all");
          }
          showToast("Notification history cleared.", "info");
        })
        .catch(function (error) {
          console.error("Failed to clear notifications:", error);
          // Fallback to localStorage
          saveNotifs([]);
          if (document.getElementById("fullNotifList")) {
            renderNotifPage("all");
          }
          showToast("Notification history cleared.", "info");
        });
    },
  });
}

function readNotif(id) {
  // POST /api/notifications/{id}/read/
  apiCall("/notifications/" + id + "/read/", "POST", {})
    .then(function (response) {
      // Update local cache
      var n = notificationsCache.find(function (item) {
        return item.id == id;
      });
      if (n) {
        n.read = true;
      }
      saveNotifs(notificationsCache);
      if (document.getElementById("fullNotifList")) {
        renderNotifPage(
          document
            .querySelector(".notif-filter-btn.active")
            .id.replace("filter-", ""),
        );
      }
    })
    .catch(function (error) {
      console.error("Failed to mark notification as read:", error);
      // Fallback to localStorage
      var notifs = getNotifs();
      var n = notifs.find(function (item) {
        return item.id == id;
      });
      if (n) {
        n.read = true;
        saveNotifs(notifs);
        if (document.getElementById("fullNotifList")) {
          renderNotifPage(
            document
              .querySelector(".notif-filter-btn.active")
              .id.replace("filter-", ""),
          );
        }
      }
    });
}

function deleteNotif(e, id) {
  e.stopPropagation();

  // Show confirmation dialog
  if (typeof showConfirm === "function") {
    showConfirm({
      title: "Delete notification?",
      message: "This notification will be permanently removed.",
      confirmText: "Delete",
      type: "danger",
      onConfirm: function () {
        // Delete from API first
        apiCall("/notifications/" + id + "/", "DELETE", {})
          .then(function (response) {
            console.log("Notification deleted from API");
            // Also delete from local cache
            var notifs = getNotifs();
            notifs = notifs.filter(function (n) {
              return n.id != id;
            });
            saveNotifs(notifs);
            notificationsCache = notifs;
            if (document.getElementById("fullNotifList")) {
              renderNotifPage(
                document
                  .querySelector(".notif-filter-btn.active")
                  .id.replace("filter-", ""),
              );
            }
            showToast("Notification deleted.", "success");
          })
          .catch(function (error) {
            console.error("Failed to delete notification from API:", error);
            // Fallback: still delete from localStorage
            var notifs = getNotifs();
            notifs = notifs.filter(function (n) {
              return n.id != id;
            });
            saveNotifs(notifs);
            notificationsCache = notifs;
            if (document.getElementById("fullNotifList")) {
              renderNotifPage(
                document
                  .querySelector(".notif-filter-btn.active")
                  .id.replace("filter-", ""),
              );
            }
            showToast("Notification deleted.", "success");
          });
      },
    });
  } else {
    // Fallback if showConfirm is not available
    var notifs = getNotifs();
    notifs = notifs.filter(function (n) {
      return n.id != id;
    });
    saveNotifs(notifs);
    notificationsCache = notifs;
    if (document.getElementById("fullNotifList")) {
      renderNotifPage(
        document
          .querySelector(".notif-filter-btn.active")
          .id.replace("filter-", ""),
      );
    }
  }
}

function filterNotifs(type) {
  // UI Select
  document
    .querySelectorAll(".notif-filter-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById("filter-" + type).classList.add("active");

  renderNotifPage(type);
}

// ─── Helpers ──────────────────────────────────────────────
function formatTime(iso) {
  var date = new Date(iso);
  var now = new Date();
  var diff = (now - date) / 1000;

  if (diff < 60) return "Just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return date.toLocaleDateString();
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Dropdown outside-click managed in main.js
