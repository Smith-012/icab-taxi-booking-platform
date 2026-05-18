/**
 * main.js — UI interactions: theme, modals, sidebar, navigation
 */

// ─── Theme ───────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  html.classList.toggle("dark");
  localStorage.setItem(
    "icab_theme",
    html.classList.contains("dark") ? "dark" : "light",
  );
}

// ─── Toggle Theme from Dropdown (keeps menu open) ────────
function toggleThemeInDropdown(e) {
  if (e) e.stopPropagation();
  toggleTheme();
  updateHeaderAuth();
}

// ─── Close Menu Helper ────────────────────────────────────
function closeMenu() {
  const menu = document.getElementById("icabDropdown");
  if (menu) menu.classList.remove("show");
}

// ─── Menu Actions (close menu before executing) ──────────
function openLoginFromMenu() {
  closeMenu();
  openLogin();
}

function openRegisterFromMenu() {
  closeMenu();
  openRegister();
}

function openDriverRegisterFromMenu() {
  closeMenu();
  openDriverRegister();
}

function logoutUserFromMenu() {
  closeMenu();
  logoutUser();
}

function navigateFromMenu(url) {
  closeMenu();
  window.location.href = url;
}

// ─── Navigate to Admin Tab ────────────────────────────────
function navigateToAdminTab(url, tabName) {
  closeMenu();
  localStorage.setItem("adminActiveTab", tabName);

  if (window.location.pathname.endsWith(url)) {
    if (typeof switchTabWithoutEvent === "function") {
      switchTabWithoutEvent(tabName);
    } else if (typeof switchTab === "function") {
      switchTab(tabName);
    } else {
      window.location.href = url;
    }
  } else {
    window.location.href = url;
  }
}

// ─── Dropdown Menu ─────────────────────────────────────────
function toggleDropdown(e) {
  if (e) e.stopPropagation();
  var menu = document.getElementById("icabDropdown");
  var notif = document.getElementById("notifDropdown");
  if (!menu) return;
  // close notif if open
  if (notif) notif.classList.remove("show");
  // toggle menu
  menu.classList.toggle("show");
}

function toggleNotifications(e) {
  if (e) e.stopPropagation();
  var menu = document.getElementById("icabDropdown");
  var notif = document.getElementById("notifDropdown");
  if (!notif) return;
  // close menu if open
  if (menu) menu.classList.remove("show");
  // toggle notif
  notif.classList.toggle("show");
}

// Close dropdowns when clicking outside — safe null checks
window.addEventListener("click", function (e) {
  var menu = document.getElementById("icabDropdown");
  var menuBtn = document.getElementById("dropdownBtn");
  var notif = document.getElementById("notifDropdown");
  var bellBtn = document.getElementById("notifBellBtn");

  // Close menu if click is outside both the dropdown AND its button
  if (menu && menu.classList.contains("show")) {
    if (!menu.contains(e.target) && !(menuBtn && menuBtn.contains(e.target))) {
      menu.classList.remove("show");
    }
  }

  // Close notif tray if click is outside both the tray AND its button
  if (notif && notif.classList.contains("show")) {
    if (!notif.contains(e.target) && !(bellBtn && bellBtn.contains(e.target))) {
      notif.classList.remove("show");
    }
  }
});

// ─── Go to Appropriate Dashboard ──────────────────────────
function goToRoleDashboard() {
  var role = localStorage.getItem("icab_user_role");
  if (role === "admin") {
    window.location.href = "admin.html";
  } else if (role === "driver") {
    window.location.href = "driver.html";
  } else {
    window.location.href = "dashboard.html";
  }
}

// ─── Navigate Home ───────────────────────────────────────
function goHome() {
  const dropdown = document.getElementById("icabDropdown");
  if (dropdown) dropdown.classList.remove("show");
  window.location.href = "index.html";
}

// ─── Generic Navigation Handler (checks for unsaved profile changes) ──
function handleNavigation(url) {
  // Close sidebar on mobile
  var sidebar = document.getElementById("sidebar");
  if (sidebar && window.innerWidth < 768) {
    sidebar.style.marginLeft = "-256px";
  }

  // Check if profile page has marked unsaved changes
  if (typeof hasUnsavedChanges !== "undefined" && hasUnsavedChanges) {
    // Show unsaved changes popup if function exists
    if (typeof showUnsavedChangesPopup === "function") {
      showUnsavedChangesPopup(url);
      return false;
    }
  }

  // Navigate normally if no unsaved changes
  window.location.href = url;
}

// ─── Book a Ride (Role-Aware) ─────────────────────────────
function handleBookRideClick() {
  var userId = localStorage.getItem("icab_user_id");
  var role = localStorage.getItem("icab_user_role");

  if (!userId) {
    // Guest → open login
    openLogin();
    return;
  }

  if (role === "driver") {
    showToast(
      "You're logged in as a Driver. Switch to a rider account to book rides.",
      "info",
    );
    setTimeout(function () {
      window.location.href = "driver.html";
    }, 2000);
    return;
  }

  if (role === "admin") {
    window.location.href = "admin.html";
    return;
  }

  // Rider → go to dashboard booking section
  window.location.href = "dashboard.html#book";
}

// ─── Login Modal ─────────────────────────────────────────
function openLogin() {
  const modal = document.getElementById("loginModal");
  const box = document.getElementById("loginBox");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  setTimeout(() => {
    modal.classList.remove("opacity-0");
    box.classList.remove("scale-95");
    box.classList.add("scale-100");
  }, 10);
}

function closeLogin() {
  const modal = document.getElementById("loginModal");
  const box = document.getElementById("loginBox");
  modal.classList.add("opacity-0");
  box.classList.remove("scale-100");
  box.classList.add("scale-95");
  setTimeout(() => {
    modal.classList.remove("flex");
    modal.classList.add("hidden");
  }, 300);
}

// ─── Register Modal ───────────────────────────────────────
function openRegister() {
  const modal = document.getElementById("registerModal");
  const box = document.getElementById("registerBox");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  setTimeout(() => {
    modal.classList.remove("opacity-0");
    box.classList.remove("scale-95");
    box.classList.add("scale-100");
  }, 10);
}

function closeRegister() {
  console.error("closeRegister() called! Stack trace:", new Error().stack);
  const modal = document.getElementById("registerModal");
  const box = document.getElementById("registerBox");
  modal.classList.add("opacity-0");
  box.classList.remove("scale-100");
  box.classList.add("scale-95");
  setTimeout(() => {
    modal.classList.remove("flex");
    modal.classList.add("hidden");
  }, 300);
}

// ─── Switch Between Modals ────────────────────────────────
function switchToRegister() {
  closeLogin();
  setTimeout(() => openRegister(), 320);
}

function switchToLogin() {
  closeRegister();
  setTimeout(() => openLogin(), 320);
}

// ─── Driver Register Modal ────────────────────────────────
function openDriverRegister() {
  closeLogin();
  var modal = document.getElementById("driverRegModal");
  var box = document.getElementById("driverRegBox");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  setTimeout(function () {
    modal.classList.remove("opacity-0");
    if (box) {
      box.classList.remove("scale-95");
      box.classList.add("scale-100");
    }
  }, 10);
}

function closeDriverRegister() {
  var modal = document.getElementById("driverRegModal");
  var box = document.getElementById("driverRegBox");
  if (!modal) return;
  modal.classList.add("opacity-0");
  if (box) {
    box.classList.remove("scale-100");
    box.classList.add("scale-95");
  }
  setTimeout(function () {
    modal.classList.remove("flex");
    modal.classList.add("hidden");
  }, 300);
}

function showTab(tab) {
  if (tab === "login") {
    closeDriverRegister();
    setTimeout(function () {
      openLogin();
    }, 300);
  }
}

// ─── Password Show/Hide Toggle ────────────────────────────
function togglePwd(inputId, btnId) {
  var input = document.getElementById(inputId);
  var btn = document.getElementById(btnId);
  if (!input) return;
  var isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  if (btn) btn.textContent = isHidden ? "🙈" : "👁️";
}

// ─── Sidebar Toggle ───────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.toggle("-ml-64");
}

// Modals close ONLY via the × button or programmatic calls (closeLogin / closeRegister)
// No backdrop click listener — it was causing accidental modal closes

// ─── Custom Toast Notification ────────────────────────────
function showToast(message, type = "success") {
  // Remove any existing toast
  const existing = document.getElementById("icab-toast");
  if (existing) existing.remove();

  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  const icon = icons[type] || icons.success;

  const toast = document.createElement("div");
  toast.id = "icab-toast";
  toast.className = "icab-toast toast-" + type;
  toast.innerHTML =
    '<span class="toast-icon">' + icon + "</span> <span>" + message + "</span>";

  document.body.appendChild(toast);

  // Animate IN
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      toast.classList.add("toast-show");
    });
  });

  // Animate OUT after 3 seconds
  setTimeout(function () {
    toast.classList.remove("toast-show");
    toast.classList.add("toast-hide");
    setTimeout(function () {
      toast.remove();
    }, 400);
  }, 3000);
}

// ─── Custom Confirm Dialog ────────────────────────────────
// Usage: showConfirm({ title, message, icon, type, confirmText, cancelText, onConfirm })
// type: 'danger' | 'warning' | 'primary'
function showConfirm(opts) {
  // Inject HTML once
  if (!document.getElementById("icabConfirmOverlay")) {
    var el = document.createElement("div");
    el.id = "icabConfirmOverlay";
    el.innerHTML =
      '<div id="icabConfirmBox">' +
      '<span id="icabConfirmIcon"></span>' +
      '<p id="icabConfirmTitle"></p>' +
      '<p id="icabConfirmMsg"></p>' +
      '<div id="icabConfirmActions">' +
      '<button class="icab-confirm-cancel" onclick="triggerCancel()"></button>' +
      '<button class="icab-confirm-extra" id="icabConfirmExtraBtn" style="display:none;" onclick="triggerExtra()"></button>' +
      '<button class="icab-confirm-ok" id="icabConfirmOkBtn" onclick="triggerConfirm()"></button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(el);
  }

  // Populate
  var o = opts || {};
  document.getElementById("icabConfirmIcon").textContent = o.icon || "⚠️";
  document.getElementById("icabConfirmTitle").textContent =
    o.title || "Are you sure?";
  document.getElementById("icabConfirmMsg").textContent =
    o.message || "This action cannot be undone.";
  document.querySelector(".icab-confirm-cancel").textContent =
    o.cancelText || "Cancel";
  var okBtn = document.getElementById("icabConfirmOkBtn");
  okBtn.textContent = o.confirmText || "Confirm";
  okBtn.className = "icab-confirm-ok " + (o.type || "warning");

  // Handle extra option (third button)
  var extraBtn = document.getElementById("icabConfirmExtraBtn");
  if (o.extraOption) {
    extraBtn.textContent = o.extraOption.text || "Extra";
    extraBtn.style.display = "block";
    extraBtn.className = "icab-confirm-extra";
    window._icabExtraCallback = o.extraOption.callback || function () {};
  } else {
    extraBtn.style.display = "none";
  }

  // Store callbacks
  window._icabConfirmCallback = o.onConfirm || function () {};
  window._icabCancelCallback = o.onCancel || function () {};

  // Show
  var overlay = document.getElementById("icabConfirmOverlay");
  overlay.classList.add("show");
}

function triggerConfirm() {
  closeConfirm();
  if (typeof window._icabConfirmCallback === "function") {
    window._icabConfirmCallback();
  }
}

function triggerExtra() {
  closeConfirm();
  if (typeof window._icabExtraCallback === "function") {
    window._icabExtraCallback();
  }
}

function triggerCancel() {
  closeConfirm();
  if (typeof window._icabCancelCallback === "function") {
    window._icabCancelCallback();
  }
}

function closeConfirm() {
  var overlay = document.getElementById("icabConfirmOverlay");
  if (overlay) overlay.classList.remove("show");
}

// Close on backdrop click
document.addEventListener("click", function (e) {
  var overlay = document.getElementById("icabConfirmOverlay");
  if (overlay && e.target === overlay) closeConfirm();
});

// ─── Global Page Transitions ──────────────────────────────
(function () {
  // 1. Initial State: Hide body to prevent flash
  document.body.classList.add("icab-page-hidden");

  // 2. Trigger Entrance once ready
  function triggerEntrance() {
    // If we have the special landing page loader, it handles revelation
    if (document.getElementById("icab-page-loader")) return;

    document.body.classList.remove("icab-page-hidden");
    document.body.classList.add("page-transition-active");

    // Remove class after animation to fix modal positioning (transform context)
    setTimeout(function () {
      document.body.classList.remove("page-transition-active");
    }, 700);
  }

  window.addEventListener("load", triggerEntrance);
  // Fallback for fast loads
  if (document.readyState === "complete") triggerEntrance();

  // 3. Intercept Clicks for Exit Animation
  document.addEventListener("click", function (e) {
    const link = e.target.closest("a");
    if (
      link &&
      link.href &&
      link.target !== "_blank" &&
      !link.href.includes("#") &&
      !link.href.startsWith("javascript:") &&
      !link.href.startsWith("tel:") &&
      !link.href.startsWith("mailto:") &&
      link.origin === window.location.origin
    ) {
      e.preventDefault();
      const url = link.href;

      // Trigger exit animation
      document.body.classList.add("page-transition-exit");

      // Wait for animation to finish then redirect
      setTimeout(function () {
        window.location.href = url;
      }, 350);
    }
  });
})();

// Helper for programmatic navigation with animation
function navigateTo(url) {
  document.body.classList.add("page-transition-exit");
  setTimeout(function () {
    window.location.href = url;
  }, 350);
}

function goBack() {
  document.body.classList.add("page-transition-exit");
  setTimeout(function () {
    // In live environment, check if there's a previous page in history
    // If user landed on 404 directly (no history), redirect to home
    if (window.history.length > 1) {
      history.back();
    } else {
      // No previous page in history, redirect to home
      window.location.href = "index.html";
    }
  }, 350);
}

// Go to rules page (currently not implemented, will trigger 404)
function goToRules() {
  // Call non-existent API endpoint to trigger 404
  // This will be caught by api.js error handler which redirects to 404.html
  apiCall("/rules/", "GET").catch(function (error) {
    // Error is expected (404), api.js handles the redirect
    console.log("Rules page not available (404)");
  });
}
// ─── Helper: Coordinates & Clipboard ──────────────────────────
function renderCoordBadge(containerId, lat, lng) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!lat || !lng) {
    el.innerHTML = "";
    return;
  }
  var coords = lat + "," + lng;
  el.innerHTML =
    '<div class="coord-badge" onclick="copyToClipboard(\'' +
    coords +
    "', this)\">" +
    "📍 " +
    parseFloat(lat).toFixed(6) +
    ", " +
    parseFloat(lng).toFixed(6) +
    "</div>";
}

function copyToClipboard(text, el) {
  if (!navigator.clipboard) {
    // Fallback for older browsers
    var textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      showCopyFeedback(el);
    } catch (err) {
      showToast("Could not copy text", "error");
    }
    document.body.removeChild(textarea);
    return;
  }

  navigator.clipboard.writeText(text).then(
    function () {
      showCopyFeedback(el);
    },
    function (err) {
      showToast("Could not copy text: " + err, "error");
    },
  );
}

function showCopyFeedback(el) {
  if (el) {
    var original = el.innerHTML;
    el.classList.add("copied");
    el.innerHTML = "✅ Copied!";
    setTimeout(function () {
      el.classList.remove("copied");
      el.innerHTML = original;
    }, 1500);
  } else {
    showToast("Copied to clipboard!", "success");
  }
}
