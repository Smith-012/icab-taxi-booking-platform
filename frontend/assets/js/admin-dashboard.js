/**
 * Comprehensive admin dashboard for managing all system data
 * Shows all tables (Rides, Users, Drivers, Wallets, Notifications) with complete data
 */

// Global data stores for searching
var rawAdminsData = [];
var rawUsersData = [];
var rawDriversData = [];
var rawRidesData = [];
var rawWalletsData = [];
var rawNotificationsData = [];
var rawPastUsersData = [];
var rawPastDriversData = [];
var currentFilters = {};

// ─── Universal Table Core ──────────────────────────────────────────
function renderDataTable(config) {
  const { containerId, data, columns, tabType, emptyMsg } = config;
  const container = document.getElementById(containerId);
  if (!container) return;

  // Filter the data
  const filteredData = data.filter((item, index) => {
    for (const key in currentFilters) {
      const val = currentFilters[key].toLowerCase();
      if (!val) continue;

      let itemVal = "";
      if (key === "sno") {
        itemVal = String(index + 1);
      } else {
        itemVal = item[key] ? String(item[key]).toLowerCase() : "";
      }

      if (!itemVal.includes(val)) return false;
    }
    return true;
  });

  if (data.length === 0) {
    container.innerHTML = `<div class="empty">${emptyMsg || "No data found."}</div>`;
    return;
  }

  let html = '<table class="data-table"><thead>';

  // Header Row 1: Labels
  html += "<tr>";
  columns.forEach((col) => {
    html += `<th>${col.label}</th>`;
  });
  html += "</tr>";

  // Header Row 2: Search Boxess
  html += '<tr class="filter-row">';
  columns.forEach((col) => {
    html += "<th>";
    if (col.search) {
      html += `<input type="text" class="header-search" placeholder="Filter..." value="${currentFilters[col.key] || ""}" oninput="handleUniversalSearch('${col.key}', this.value, '${tabType}')">`;
    }
    html += "</th>";
  });
  html += "</tr></thead><tbody>";

  // Data Rows
  if (filteredData.length === 0) {
    html += `<tr><td colspan="${columns.length}" class="text-center py-12 text-zinc-500 font-medium">No results match your filters.</td></tr>`;
  } else {
    filteredData.forEach((item, index) => {
      html += config.rowRenderer(item, index);
    });
  }

  html += "</tbody></table>";
  container.innerHTML = html;

  // Focus Guard
  const lastKey = Object.keys(currentFilters).pop();
  if (lastKey) {
    const activeInput = container.querySelector(
      `input[oninput*="'${lastKey}'"]`,
    );
    if (activeInput) {
      activeInput.focus();
      const len = activeInput.value.length;
      activeInput.setSelectionRange(len, len);
    }
  }
}

function handleUniversalSearch(key, value, tabType) {
  currentFilters[key] = value;

  const configs = {
    admins: () =>
      renderAdminsTable(applyFilters(rawAdminsData, currentFilters)), // Legacy compatibility if needed
    users: () => refreshUsersTable(),
    drivers: () => refreshDriversTable(),
    rides: () => refreshRidesTable(),
    wallets: () => refreshWalletsTable(),
    notifications: () => refreshNotificationsTable(),
    pastusers: () => refreshPastUsersTable(),
  };

  // Improved reactive rendering
  switch (tabType) {
    case "admins":
      renderAdminsTable(rawAdminsData);
      break;
    case "users":
      renderUsersTable(rawUsersData);
      break;
    case "drivers":
      renderDriversTable(rawDriversData);
      break;
    case "rides":
      renderRidesTable(rawRidesData);
      break;
    case "wallets":
      renderWalletsTable(rawWalletsData);
      break;
    case "notifications":
      renderNotificationsTable(rawNotificationsData);
      break;
    case "pastusers":
      renderPastUsersTable(rawPastUsersData);
      break;
    case "pastdrivers":
      renderPastDriversTable(rawPastDriversData);
      break;
  }
}

// Check if user is admin on page load
document.addEventListener("DOMContentLoaded", function () {
  var userRole = localStorage.getItem("icab_user_role");
  var userEmail = localStorage.getItem("icab_user_email");

  if (userRole !== "admin") {
    window.location.href = "index.html";
    return;
  }

  // Check if there's a stored tab preference from menu navigation
  var activeTab = localStorage.getItem("adminActiveTab");
  if (activeTab) {
    localStorage.removeItem("adminActiveTab");
    // Switch to the requested tab
    setTimeout(function () {
      switchTabWithoutEvent(activeTab);
    }, 500);
  } else {
    // Load initial tab data (dashboard)
    setTimeout(function () {
      switchTabWithoutEvent("dashboard");
    }, 500);
  }
});

// ─── Tab Switching ───────────────────────────────────────────────
function switchTab(tabName) {
  // Hide all tab contents
  var contents = document.querySelectorAll(".tab-content");
  contents.forEach(function (el) {
    el.classList.remove("active");
  });

  // Remove active class from all buttons
  var buttons = document.querySelectorAll(".tab-nav button");
  buttons.forEach(function (el) {
    el.classList.remove("active");
  });

  // Show selected tab
  var selectedTab = document.getElementById(tabName);
  if (selectedTab) {
    selectedTab.classList.add("active");
  }

  // Set active button
  if (event && event.target) {
    event.target.classList.add("active");
  } else {
    // Find button by name
    buttons.forEach(function (btn) {
      if (
        btn.textContent.includes(
          tabName === "rides"
            ? "Rides"
            : tabName === "users"
              ? "Users"
              : tabName === "drivers"
                ? "Drivers"
                : tabName === "wallets"
                  ? "Wallets"
                  : "Notifications",
        )
      ) {
        btn.classList.add("active");
      }
    });
  }
  // Load data for the selected tab
  switch (tabName) {
    case "dashboard":
      loadDashboardStats();
      break;
    case "admins":
      loadAdminsData();
      break;
    case "rides":
      loadRidesData();
      break;
    case "users":
      loadUsersData();
      break;
    case "drivers":
      loadDriversData();
      break;
    case "wallets":
      loadWalletsData();
      break;
    case "notifications":
      loadNotificationsData();
      break;
    case "broadcast":
      loadBroadcastData();
      break;
    case "pastusers":
      loadPastUsersData();
      break;
    case "pastdrivers":
      loadPastDriversData();
      break;
  }
}

// ─── Tab Switching Without Event (for programmatic navigation) ────
function switchTabWithoutEvent(tabName) {
  var contents = document.querySelectorAll(".tab-content");
  contents.forEach(function (el) {
    el.classList.remove("active");
  });

  var buttons = document.querySelectorAll(".tab-nav button");
  buttons.forEach(function (el) {
    el.classList.remove("active");
  });

  var selectedTab = document.getElementById(tabName);
  if (selectedTab) {
    selectedTab.classList.add("active");
  }

  // Find and activate the corresponding button
  buttons.forEach(function (btn) {
    var btnText = btn.textContent.toLowerCase();
    if (btnText.includes(tabName)) {
      btn.classList.add("active");
    }
  });

  // Load data
  switch (tabName) {
    case "dashboard":
      loadDashboardStats();
      break;
    case "admins":
      loadAdminsData();
      break;
    case "rides":
      loadRidesData();
      break;
    case "users":
      loadUsersData();
      break;
    case "drivers":
      loadDriversData();
      break;
    case "wallets":
      loadWalletsData();
      break;
    case "notifications":
      loadNotificationsData();
      break;
    case "broadcast":
      loadBroadcastData();
      break;
    case "pastusers":
      loadPastUsersData();
      break;
    case "pastdrivers":
      loadPastDriversData();
      break;
  }
}

// ─── Format Date Time Helper ─────────────────────────────────────
function formatDateTime(dateString) {
  if (!dateString) return "N/A";
  var date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateDMY(dateString) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

// ─── Status Badge Helper ─────────────────────────────────────────
function getStatusBadge(status) {
  var badgeClass = "badge ";
  if (status === "active" || status === "completed") {
    badgeClass += "badge-active";
  } else if (status === "pending" || status === "in_progress") {
    badgeClass += "badge-pending";
  } else if (status === "suspended" || status === "cancelled") {
    badgeClass += "badge-suspended";
  }
  return '<span class="' + badgeClass + '">' + status.toUpperCase() + "</span>";
}

// ─── DASHBOARD STATS ─────────────────────────────────────────────
function loadDashboardStats() {
  apiCall("/admin/stats/", "GET")
    .then(function (stats) {
      if (stats) {
        var statCards = document.querySelectorAll(
          "#dashboard .grid p.text-3xl.font-bold",
        );
        if (statCards.length >= 5) {
          statCards[0].textContent = stats.total_users || 0;
          statCards[1].textContent = stats.total_drivers || 0;
          statCards[2].textContent = stats.total_rides || 0;
          statCards[3].textContent =
            stats.pending_rides || stats.cancelled_rides || 0;
          statCards[4].textContent = "₹ " + (stats.total_revenue || 0);
        }
      }
    })
    .catch(function (error) {
      console.error("Error loading stats:", error);
    });
}

// ─── ADMINS TABLE ────────────────────────────────────────────────
function loadAdminsData() {
  var container = document.getElementById("adminsContainer");
  var loading = document.getElementById("adminsLoading");

  apiCall("/admin/admins/", "GET")
    .then(function (admins) {
      loading.style.display = "none";
      rawAdminsData = admins || [];
      currentFilters = {};
      renderAdminsTable(rawAdminsData);
    })
    .catch(function (error) {
      loading.style.display = "none";
      container.innerHTML = '<div class="empty">Error loading admins.</div>';
    });
}

function renderAdminsTable(data) {
  renderDataTable({
    containerId: "adminsContainer",
    data: data,
    tabType: "admins",
    emptyMsg: "No admins found.",
    columns: [
      { label: "ID", key: "id", search: true },
      { label: "Name", key: "name", search: true },
      { label: "Email (Login ID)", key: "loginid", search: true },
      { label: "Role", key: "role", search: true },
      { label: "Status", key: "status", search: true },
      { label: "Active", key: "is_active", search: false },
      { label: "Created", key: "created_date", search: false },
      { label: "Updated", key: "updated_date", search: false },
    ],
    rowRenderer: (admin) => `
      <tr>
        <td>#${admin.id}</td>
        <td>${admin.name || "N/A"}</td>
        <td>${admin.loginid || "N/A"}</td>
        <td><span class='badge badge-active'>${(admin.role || "admin").toUpperCase()}</span></td>
        <td>${getStatusBadge(admin.status || "active")}</td>
        <td>${admin.is_active ? "<span class='text-green-500 font-bold'>YES</span>" : "<span class='text-red-500 font-bold'>NO</span>"}</td>
        <td class="whitespace-nowrap">${formatDateTime(admin.created_date)}</td>
        <td class="whitespace-nowrap">${formatDateTime(admin.updated_date)}</td>
      </tr>`,
  });
}

// ─── RIDES TABLE ─────────────────────────────────────────────────
function loadRidesData() {
  var container = document.getElementById("ridesContainer");
  var loading = document.getElementById("ridesLoading");

  apiCall("/admin/rides/", "GET")
    .then(function (rides) {
      loading.style.display = "none";
      rawRidesData = rides || [];
      currentFilters = {};
      renderRidesTable(rawRidesData);
    })
    .catch(function (error) {
      loading.style.display = "none";
      container.innerHTML = '<div class="empty">Error loading rides.</div>';
    });
}

function renderRidesTable(data) {
  renderDataTable({
    containerId: "ridesContainer",
    data: data,
    tabType: "rides",
    emptyMsg: "No rides found.",
    columns: [
      { label: "ID", key: "id", search: true },
      { label: "Rider", key: "rider_name", search: true },
      { label: "Driver", key: "driver_name", search: true },
      { label: "Pickup", key: "pickup", search: true },
      { label: "Dropoff", key: "dropoff", search: true },
      { label: "Status", key: "status", search: true },
      { label: "Fare", key: "fare", search: true },
      { label: "Distance", key: "distance", search: true },
      { label: "Created", key: "created_at", search: false },
    ],
    rowRenderer: (ride) => `
      <tr>
        <td>#${ride.id}</td>
        <td>${ride.rider_name || "N/A"}</td>
        <td>${ride.driver_name || "N/A"}</td>
        <td>${ride.pickup || "N/A"}</td>
        <td>${ride.dropoff || "N/A"}</td>
        <td>${getStatusBadge(ride.status)}</td>
        <td>₹${ride.fare || 0}</td>
        <td>${ride.distance ? `${ride.distance} km` : "N/A"}</td>
        <td>${formatDateTime(ride.created_at)}</td>
      </tr>`,
  });
}

// ─── USERS TABLE ─────────────────────────────────────────────────
function loadUsersData() {
  var container = document.getElementById("usersContainer");
  var loading = document.getElementById("usersLoading");

  apiCall("/admin/users/", "GET")
    .then(function (users) {
      loading.style.display = "none";
      rawUsersData = users || [];
      currentFilters = {};
      renderUsersTable(rawUsersData);
    })
    .catch(function (error) {
      loading.style.display = "none";
      container.innerHTML = '<div class="empty">Error loading users.</div>';
    });
}

function renderUsersTable(data) {
  renderDataTable({
    containerId: "usersContainer",
    data: data,
    tabType: "users",
    emptyMsg: "No users found.",
    columns: [
      { label: "ID", key: "id", search: true },
      { label: "Avatar", key: "avatar", search: false },
      { label: "Email", key: "email", search: true },
      { label: "Full Name", key: "name", search: true },
      { label: "First Name", key: "first_name", search: true },
      { label: "Last Name", key: "last_name", search: true },
      { label: "Phone", key: "phone", search: true },
      { label: "Gender", key: "gender", search: true },
      { label: "Role", key: "role", search: true },
      { label: "DOB", key: "date_of_birth", search: true },
      { label: "Home Address", key: "home_address", search: true },
      { label: "Work Address", key: "work_address", search: true },
      { label: "Status", key: "status", search: true },
      { label: "Active", key: "is_active", search: false },
      { label: "Created", key: "created_at", search: false },
      { label: "Updated", key: "updated_at", search: false },
      { label: "Last Login", key: "last_login", search: false },
    ],
    rowRenderer: (user) => {
      const avatarHtml = user.avatar_url
        ? `<img src="${user.avatar_url}" class="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 mx-auto" alt="Avatar">`
        : `<div class="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 mx-auto">${(user.name || "U").charAt(0).toUpperCase()}</div>`;

      return `
        <tr>
          <td>#${user.id}</td>
          <td>${avatarHtml}</td>
          <td>${user.email || "N/A"}</td>
          <td>${user.name || "N/A"}</td>
          <td>${user.first_name || "N/A"}</td>
          <td>${user.last_name || "N/A"}</td>
          <td>${user.phone || "N/A"}</td>
          <td>${user.gender || "N/A"}</td>
          <td><span class='badge badge-active'>${(user.role || "user").toUpperCase()}</span></td>
          <td>${formatDateDMY(user.date_of_birth)}</td>
          <td title="${user.home_address || ""}"><div class="truncate w-32">${user.home_address || "N/A"}</div></td>
          <td title="${user.work_address || ""}"><div class="truncate w-32">${user.work_address || "N/A"}</div></td>
          <td>${getStatusBadge(user.status || "active")}</td>
          <td>${user.is_active ? "<span class='text-green-500 font-bold'>YES</span>" : "<span class='text-red-500 font-bold'>NO</span>"}</td>
          <td class="whitespace-nowrap">${formatDateTime(user.created_at)}</td>
          <td class="whitespace-nowrap">${formatDateTime(user.updated_at)}</td>
          <td class="whitespace-nowrap">${formatDateTime(user.last_login)}</td>
        </tr>`;
    },
  });
}

// ─── DRIVERS TABLE ───────────────────────────────────────────────
function loadDriversData() {
  var container = document.getElementById("driversContainer");
  var loading = document.getElementById("driversLoading");

  apiCall("/admin/drivers/", "GET")
    .then(function (drivers) {
      loading.style.display = "none";
      rawDriversData = drivers || [];
      currentFilters = {};
      renderDriversTable(rawDriversData);
    })
    .catch(function (error) {
      loading.style.display = "none";
      container.innerHTML = '<div class="empty">Error loading drivers.</div>';
    });
}

function renderDriversTable(data) {
  renderDataTable({
    containerId: "driversContainer",
    data: data,
    tabType: "drivers",
    emptyMsg: "No drivers found.",
    columns: [
      { label: "ID", key: "id", search: true },
      { label: "Avatar", key: "avatar_url", search: false },
      { label: "Email", key: "email", search: true },
      { label: "Full Name", key: "name", search: true },
      { label: "First Name", key: "first_name", search: true },
      { label: "Last Name", key: "last_name", search: true },
      { label: "Phone", key: "phone", search: true },
      { label: "Gender", key: "gender", search: true },
      { label: "DOB", key: "date_of_birth", search: true },
      { label: "Vehicle", key: "vehicle_plate", search: true },
      { label: "License", key: "license_no", search: true },
      { label: "Rating", key: "rating", search: true },
      { label: "Total Rides", key: "total_rides", search: true },
      { label: "Earnings", key: "total_earnings", search: true },
      { label: "Status", key: "status", search: true },
      { label: "Role", key: "role", search: true },
      { label: "Created", key: "created_at", search: false },
      { label: "Updated", key: "updated_at", search: false },
      { label: "Last Login", key: "last_login", search: false },
    ],
    rowRenderer: (driver) => {
      const avatarHtml = driver.avatar_url
        ? `<img src="${driver.avatar_url}" class="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 mx-auto" alt="Avatar">`
        : `<div class="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 mx-auto">${(driver.name || "D").charAt(0).toUpperCase()}</div>`;

      return `
        <tr>
          <td>#${driver.id}</td>
          <td>${avatarHtml}</td>
          <td>${driver.email || "N/A"}</td>
          <td>${driver.name || "N/A"}</td>
          <td>${driver.first_name || "N/A"}</td>
          <td>${driver.last_name || "N/A"}</td>
          <td>${driver.phone || "N/A"}</td>
          <td>${driver.gender || "N/A"}</td>
          <td>${formatDateDMY(driver.date_of_birth)}</td>
          <td>${driver.vehicle_model ? `${driver.vehicle_model} (${driver.vehicle_plate})` : "N/A"}</td>
          <td>${driver.license_no || "N/A"}</td>
          <td>⭐ ${driver.rating || 0}</td>
          <td>${driver.total_rides || 0}</td>
          <td class="font-bold text-green-600">₹ ${driver.total_earnings || 0}</td>
          <td>${getStatusBadge(driver.status || "active")}</td>
          <td><span class='badge badge-active'>${(driver.role || "driver").toUpperCase()}</span></td>
          <td class="whitespace-nowrap">${formatDateTime(driver.created_at)}</td>
          <td class="whitespace-nowrap">${formatDateTime(driver.updated_at)}</td>
          <td class="whitespace-nowrap">${formatDateTime(driver.last_login)}</td>
        </tr>`;
    },
  });
}

// ─── WALLETS TABLE ───────────────────────────────────────────────
function loadWalletsData() {
  var container = document.getElementById("walletsContainer");
  var loading = document.getElementById("walletsLoading");

  apiCall("/admin/wallets/", "GET")
    .then(function (wallets) {
      loading.style.display = "none";
      rawWalletsData = wallets || [];
      currentFilters = {};
      renderWalletsTable(rawWalletsData);
    })
    .catch(function (error) {
      loading.style.display = "none";
      container.innerHTML = '<div class="empty">Error loading wallets.</div>';
    });
}

function renderWalletsTable(data) {
  renderDataTable({
    containerId: "walletsContainer",
    data: data,
    tabType: "wallets",
    emptyMsg: "No wallets found.",
    columns: [
      { label: "ID", key: "id", search: true },
      { label: "User", key: "user_name", search: true },
      { label: "Email", key: "user_email", search: true },
      { label: "Balance", key: "balance", search: true },
      { label: "Status", key: "is_frozen", search: true },
      { label: "Created", key: "created_at", search: false },
    ],
    rowRenderer: (wallet) => {
      const frozenBadge = wallet.is_frozen
        ? '<span class="badge badge-suspended">FROZEN</span>'
        : '<span class="badge badge-active">ACTIVE</span>';

      return `
        <tr>
          <td>#${wallet.id}</td>
          <td>${wallet.user_name || "N/A"}</td>
          <td>${wallet.user_email || "N/A"}</td>
          <td><strong>₹${wallet.balance || 0}</strong></td>
          <td>${frozenBadge}</td>
          <td>${formatDateTime(wallet.created_at)}</td>
        </tr>`;
    },
  });
}

// ─── NOTIFICATIONS TABLE ──────────────────────────────────────────
function loadNotificationsData() {
  var container = document.getElementById("notificationsContainer");
  var loading = document.getElementById("notificationsLoading");

  apiCall("/admin/notifications/", "GET")
    .then(function (notifications) {
      loading.style.display = "none";
      rawNotificationsData = notifications || [];
      currentFilters = {};
      renderNotificationsTable(rawNotificationsData);
    })
    .catch(function (error) {
      loading.style.display = "none";
      container.innerHTML =
        '<div class="empty">Error loading notifications.</div>';
    });
}

function renderNotificationsTable(data) {
  renderDataTable({
    containerId: "notificationsContainer",
    data: data,
    tabType: "notifications",
    emptyMsg: "No notifications found.",
    columns: [
      { label: "ID", key: "id", search: true },
      { label: "User", key: "user_name", search: true },
      { label: "Title", key: "title", search: true },
      { label: "Message", key: "message", search: true },
      { label: "Type", key: "notif_type", search: true },
      { label: "Status", key: "is_read", search: true },
      { label: "Created", key: "created_at", search: false },
    ],
    rowRenderer: (notif) => {
      const readStatus = notif.is_read
        ? '<span class="badge badge-active">READ</span>'
        : '<span class="badge badge-pending">UNREAD</span>';

      return `
        <tr>
          <td>#${notif.id}</td>
          <td>${notif.user_name || "N/A"}</td>
          <td>${notif.title || "N/A"}</td>
          <td><div class="truncate w-48" title="${notif.message}">${notif.message || "N/A"}</div></td>
          <td><span class='badge badge-pending'>${(notif.notif_type || "system").toUpperCase()}</span></td>
          <td>${readStatus}</td>
          <td>${formatDateTime(notif.created_at)}</td>
        </tr>`;
    },
  });
}

// ─── BROADCAST HANDLING ──────────────────────────────────────────
function loadBroadcastData() {
  const form = document.getElementById("broadcastForm");
  if (!form) return;

  // Clear previous listeners if any (though DOM events handle this generally)
  form.onsubmit = handleBroadcastSubmit;
}

function handleBroadcastSubmit(e) {
  e.preventDefault();

  const title = document.getElementById("broadcastTitle").value;
  const message = document.getElementById("broadcastMessage").value;
  const notif_type = document.getElementById("broadcastCategory").value;
  const audience = document.getElementById("broadcastAudience").value;

  const btn = document.getElementById("broadcastBtn");
  const btnText = document.getElementById("btnText");
  const btnLoader = document.getElementById("btnLoader");

  // UI State: Loading
  btn.disabled = true;
  btnText.textContent = "Sending...";
  btnLoader.classList.remove("hidden");

  apiCall("/admin/broadcast/", "POST", {
    title: title,
    message: message,
    notif_type: notif_type,
    audience: audience,
  })
    .then(function (response) {
      // UI State: Success
      btn.disabled = false;
      btnText.textContent = "🚀 Broadcast Message";
      btnLoader.classList.add("hidden");

      if (response && response.success) {
        showToast(
          response.message || "Broadcast sent successfully!",
          "success",
        );
        document.getElementById("broadcastForm").reset();
      } else {
        showToast("Error sending broadcast.", "danger");
      }
    })
    .catch(function (error) {
      // UI State: Error
      btn.disabled = false;
      btnText.textContent = "🚀 Broadcast Message";
      btnLoader.classList.add("hidden");
      showToast("Failed to send broadcast. Please try again.", "danger");
      console.error("Broadcast error:", error);
    });
}

// ─── PAST USERS LOADING ──────────────────────────────────────────
function loadPastUsersData() {
  const container = document.getElementById("pastusersContainer");
  const loading = document.getElementById("pastusersLoading");
  if (!container || !loading) return;

  loading.classList.remove("hidden");
  container.innerHTML = "";

  apiCall("/admin/past-users/", "GET")
    .then(function (data) {
      loading.classList.add("hidden");
      rawPastUsersData = data || [];
      currentFilters = {};
      renderPastUsersTable(rawPastUsersData);
    })
    .catch(function (error) {
      loading.classList.add("hidden");
      container.innerHTML =
        '<div class="empty">Error loading archived users.</div>';
    });
}

function renderPastUsersTable(data) {
  renderDataTable({
    containerId: "pastusersContainer",
    data: data,
    tabType: "pastusers",
    emptyMsg: "No archived users found.",
    columns: [
      { label: "S.No", key: "sno", search: true },
      { label: "Avatar", key: "avatar", search: false },
      { label: "Orig ID", key: "original_id", search: true },
      { label: "First Name", key: "first_name", search: true },
      { label: "Last Name", key: "last_name", search: true },
      { label: "Email", key: "email", search: true },
      { label: "Role", key: "role", search: true },
      { label: "Phone", key: "phone", search: true },
      { label: "Gender", key: "gender", search: true },
      { label: "DOB", key: "date_of_birth", search: true },
      { label: "Home Address", key: "home_address", search: true },
      { label: "Work Address", key: "work_address", search: true },
      { label: "Status", key: "status", search: true },
      { label: "Created At", key: "created_at", search: false },
      { label: "Deleted At", key: "deleted_at", search: false },
    ],
    rowRenderer: (user, index) => {
      const avatarHtml = user.avatar_url
        ? `<img src="${user.avatar_url}" class="w-10 h-10 rounded-full object-cover border-2 border-zinc-200 dark:border-zinc-700 mx-auto" alt="Avatar" onerror="this.src='assets/img/default-avatar.png';">`
        : `<div class="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 mx-auto border-2 border-zinc-300 dark:border-zinc-700">${(user.name || "U").charAt(0).toUpperCase()}</div>`;

      return `
        <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
          <td class="text-center font-medium text-zinc-500">#${index + 1}</td>
          <td>${avatarHtml}</td>
          <td class="font-mono text-xs">#${user.original_id || "N/A"}</td>
          <td class="font-semibold">${user.first_name || "N/A"}</td>
          <td class="font-semibold">${user.last_name || "N/A"}</td>
          <td class="text-zinc-600 dark:text-zinc-400">${user.email || "N/A"}</td>
          <td><span class="badge badge-pending text-[10px]">${(user.role || "user").toUpperCase()}</span></td>
          <td class="whitespace-nowrap">${user.phone || "N/A"}</td>
          <td class="capitalize">${user.gender || "N/A"}</td>
          <td class="whitespace-nowrap text-xs">${formatDateDMY(user.date_of_birth)}</td>
          <td class="max-w-[150px] truncate" title="${user.home_address || ""}">${user.home_address || "N/A"}</td>
          <td class="max-w-[150px] truncate" title="${user.work_address || ""}">${user.work_address || "N/A"}</td>
          <td>${getStatusBadge(user.status || "deleted")}</td>
          <td class="text-xs text-zinc-500">${formatDateTime(user.created_at)}</td>
          <td class="text-xs font-medium text-red-500">${formatDateTime(user.deleted_at)}</td>
        </tr>`;
    },
  });
}

// ─── PAST DRIVERS LOADING ────────────────────────────────────────
function loadPastDriversData() {
  const container = document.getElementById("pastdriversContainer");
  const loading = document.getElementById("pastdriversLoading");
  if (!container || !loading) return;

  loading.classList.remove("hidden");
  container.innerHTML = "";

  apiCall("/admin/past-drivers/", "GET")
    .then(function (data) {
      loading.classList.add("hidden");
      rawPastDriversData = data || [];
      currentFilters = {};
      renderPastDriversTable(rawPastDriversData);
    })
    .catch(function (error) {
      loading.classList.add("hidden");
      container.innerHTML =
        '<div class="empty">Error loading archived drivers.</div>';
    });
}

function renderPastDriversTable(data) {
  renderDataTable({
    containerId: "pastdriversContainer",
    data: data,
    tabType: "pastdrivers",
    emptyMsg: "No archived drivers found.",
    columns: [
      { label: "S.No", key: "sno", search: true },
      { label: "Avatar", key: "avatar", search: false },
      { label: "Orig ID", key: "original_id", search: true },
      { label: "First Name", key: "first_name", search: true },
      { label: "Last Name", key: "last_name", search: true },
      { label: "Email", key: "email", search: true },
      { label: "Phone", key: "phone", search: true },
      { label: "Vehicle", key: "vehicle_model", search: true },
      { label: "Plate", key: "vehicle_plate", search: true },
      { label: "License", key: "license_no", search: true },
      { label: "Rides", key: "total_rides", search: true },
      { label: "Earnings", key: "total_earnings", search: true },
      { label: "Rating", key: "rating", search: true },
      { label: "Deleted At", key: "deleted_at", search: false },
    ],
    rowRenderer: (driver, index) => {
      const avatarHtml = driver.avatar_url
        ? `<img src="${driver.avatar_url}" class="w-10 h-10 rounded-full object-cover border-2 border-zinc-200 dark:border-zinc-700 mx-auto" alt="Avatar" onerror="this.src='assets/img/default-avatar.png';">`
        : `<div class="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 mx-auto border-2 border-zinc-300 dark:border-zinc-700">${(driver.name || "D").charAt(0).toUpperCase()}</div>`;

      return `
        <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
          <td class="text-center font-medium text-zinc-500">#${index + 1}</td>
          <td>${avatarHtml}</td>
          <td class="font-mono text-xs">#${driver.original_id || "N/A"}</td>
          <td class="font-semibold">${driver.first_name || "N/A"}</td>
          <td class="font-semibold">${driver.last_name || "N/A"}</td>
          <td class="text-zinc-600 dark:text-zinc-400">${driver.email || "N/A"}</td>
          <td class="whitespace-nowrap">${driver.phone || "N/A"}</td>
          <td>${driver.vehicle_model || "N/A"}</td>
          <td class="font-mono text-xs uppercase">${driver.vehicle_plate || "N/A"}</td>
          <td class="font-mono text-xs">${driver.license_no || "N/A"}</td>
          <td class="text-center font-bold">${driver.total_rides || 0}</td>
          <td class="text-green-600 font-bold">₹${driver.total_earnings || 0}</td>
          <td>⭐ ${driver.rating || 0}</td>
          <td class="text-xs font-medium text-red-500">${formatDateTime(driver.deleted_at)}</td>
        </tr>`;
    },
  });
}
