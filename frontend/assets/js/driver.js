/**
 * driver.js — Driver Dashboard logic for iCab
 * Handles: pending ride polling, accept/start/complete, cancel, cash confirm, stats
 */

var isOnline = false;
var pendingPollingInterval = null;
var activeRidePollingInterval = null;
var activeRide = null;
var currentDriver = null;
var POLL_INTERVAL = 5000; // 5 seconds
var isToggling = false; // Guard for concurrency
var isUpdatingUI = false; // Guard for programmatic UI changes (prevents recursion)

// ─── Init ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  var userId = localStorage.getItem("icab_user_id");
  var role = localStorage.getItem("icab_user_role");
  if (!userId || role !== "driver") {
    window.location.href = "index.html";
    return;
  }

  loadDriverProfileFromAPI().then(() => {
    if (typeof showProfileWarning === "function") showProfileWarning();
  });
});

// ─── Load Driver Profile from API ───────────────────────
async function loadDriverProfileFromAPI() {
  try {
    var profileResult = await apiCall("/driver/profile/", "GET");
    var statsResult = await apiCall("/driver/stats/", "GET");

    currentDriver = profileResult;

    // Sync profile percentage to localStorage for menu & banner
    if (profileResult.profile_completion_percentage !== undefined) {
      localStorage.setItem(
        "icab_profile_pct",
        profileResult.profile_completion_percentage,
      );
    }

    // Render UI with API data
    renderDriverProfileFromAPI(profileResult);
    renderStatsFromAPI(statsResult);

    // Load today's rides
    loadTodayRidesFromAPI();
    renderWeeklyChart();

    // Check if already online
    isOnline = profileResult.is_online === true;
    if (isOnline) {
      isUpdatingUI = true;
      setOnlineStateFromAPI(true);
      isUpdatingUI = false;
      // Check for active ride first, then start polling
      checkForActiveRide();
    }
  } catch (err) {
    console.error("Error loading driver profile:", err);
    showToast("Could not load profile. Check your connection.", "error");
  }
}

// ─── Render Driver Profile from API ─────────────────────
function renderDriverProfileFromAPI(profile) {
  var initials = (profile.name || "?").charAt(0).toUpperCase();
  setText("driverAvatarDisplay", initials);
  setText("driverNameDisplay", profile.name || "—");
  setText("driverRatingDisplay", profile.rating || "0.0");
  setText("driverRatingDisplay2", profile.rating || "0.0");
  var vehicleLabel =
    (profile.vehicle_type || "sedan").toUpperCase() +
    (profile.vehicle_model ? " • " + profile.vehicle_model : "");
  setText("driverVehicleDisplay", vehicleLabel);
  setText("vehicleDisplay", vehicleLabel);
  setText("plateDisplay", profile.vehicle_plate || "—");
  setText("licenseDisplay", profile.license_no || "—");
  setText("phoneDisplay", profile.phone || "—");
}

// ─── Render Stats from API ────────────────────────────────
function renderStatsFromAPI(stats) {
  setText("todayEarnings", parseFloat(stats.today_earnings || 0).toFixed(2));
  setText("todayRides", stats.today_rides || 0);
  setText("totalEarnings", parseFloat(stats.total_earnings || 0).toFixed(2));
  setText("totalRidesCount", stats.total_rides || 0);
  setText("walletBalance", parseFloat(stats.wallet_balance || 0).toFixed(2));
}

// ─── Stats (legacy fallback) ───────────────────────────────
function loadStats() {
  // Replaced by loadDriverProfileFromAPI
}

// ─── Today's Rides List (API) ──────────────────────────────
async function loadTodayRidesFromAPI() {
  try {
    var result = await apiCall("/rides/", "GET");
    var rides = Array.isArray(result) ? result : [];

    // Filter for today's completed rides only
    var today = new Date().toDateString();
    var todayRides = rides.filter(function (r) {
      return (
        new Date(r.completed_at || r.created_at).toDateString() === today &&
        r.status === "completed"
      );
    });

    renderTodayRidesList(todayRides);
  } catch (err) {
    console.error("Error loading today's rides:", err);
    renderTodayRidesList([]);
  }
}

// ─── Render Today's Rides ───────────────────────────────────
function renderTodayRidesList(rides) {
  var el = document.getElementById("todayRidesList");
  if (!el) return;

  if (rides.length === 0) {
    el.innerHTML =
      '<p class="text-center py-8 text-zinc-400 text-sm">No rides completed today yet.</p>';
    return;
  }

  el.innerHTML = rides
    .map(function (r) {
      return (
        '<div class="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">' +
        '<div><p class="font-semibold text-sm truncate max-w-[180px]">' +
        r.pickup +
        " → " +
        r.dropoff +
        "</p>" +
        '<p class="text-xs text-zinc-400">' +
        new Date(r.completed_at || r.created_at).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }) +
        " • " +
        (r.payment_method || "wallet") +
        "</p></div>" +
        '<span class="font-black text-green-500">+₹' +
        parseFloat(r.fare).toFixed(2) +
        "</span></div>"
      );
    })
    .join("");
}

// ─── Today's Rides List (legacy) ──────────────────────────
function loadTodayRides() {
  // Replaced by loadTodayRidesFromAPI - kept for fallback
}

// ─── Online Toggle ─────────────────────────────────────────
async function toggleOnline() {
  if (isToggling) return; // Prevent double clicks
  if (isUpdatingUI) return; // Prevent loop when UI is updated programmatically

  isToggling = true;
  try {
    var result = await apiCall("/driver/toggle-online/", "POST", {});
    isOnline = result.is_online;

    if (isOnline) {
      startPendingRidesPolling();
      showToast(result.message || "You are now Online!", "success");
    } else {
      stopDriverPolling();
      if (typeof window.stopAllPolling === "function") window.stopAllPolling();
      showToast(result.message || "You are now Offline.", "info");
    }

    isUpdatingUI = true; // Block recursion before updating UI
    setOnlineStateFromAPI(isOnline);
    isUpdatingUI = false;
  } catch (err) {
    console.error("Error toggling online status:", err);

    // Revert toggle UI to current state since API failed
    setOnlineStateFromAPI(isOnline);

    var errMsg = "Error updating status.";
    if (err.data && err.data.error) {
      errMsg = err.data.error;
    } else if (err.status === 404) {
      errMsg = "Update service not found (404).";
    } else if (err.status === 401 || err.status === 403) {
      errMsg = "Session expired or access denied.";
    } else if (err.message) {
      errMsg = err.message;
      if (err.stack && err.message.includes("Maximum call stack")) {
        // Put the first few lines of the stack trace in the message
        var stackLines = err.stack.split("\n").slice(0, 3).join(" | ");
        errMsg += " -> " + stackLines;
      }
    }
    showToast(errMsg, "error");
    console.error("Full Toggle Error Object:", err);
  } finally {
    isToggling = false;
  }
}

// ─── Set Online State UI ────────────────────────────────────
function setOnlineStateFromAPI(online) {
  var wrap = document.getElementById("onlineToggleWrap");
  var dot = document.getElementById("statusDot");
  var text = document.getElementById("onlineStatusText");
  var sub = document.getElementById("onlineStatusSub");
  var toggle = document.getElementById("onlineToggle");
  var placeholder = document.getElementById("offlinePlaceholder");

  if (online) {
    wrap.classList.add("online");
    dot.classList.add("online");
    text.textContent = "You are Online";
    sub.textContent = "Waiting for ride requests...";
    if (toggle) toggle.checked = true;
    if (placeholder) placeholder.classList.add("hidden");
  } else {
    wrap.classList.remove("online");
    dot.classList.remove("online");
    text.textContent = "You are Offline";
    sub.textContent = "Toggle to start receiving ride requests";
    if (toggle) toggle.checked = false;
    if (placeholder) placeholder.classList.remove("hidden");
    // Hide request and active sections
    var reqSection = document.getElementById("rideRequestSection");
    if (reqSection) reqSection.classList.add("hidden");
    var activeSection = document.getElementById("activeRideSection");
    if (activeSection) activeSection.classList.add("hidden");
  }
  updatePlaceholderUI();
}

// ─── Update Placeholder UI ──────────────────────────────────
function updatePlaceholderUI() {
  var title = document.getElementById("offlineTitle");
  var text = document.getElementById("offlineText");
  var icon = document.getElementById("offlineIcon");
  var btn = document.getElementById("offlineBtn");

  if (!title || !text || !icon || !btn) return;

  if (isOnline) {
    icon.textContent = "🔍";
    title.textContent = "Searching for Rides...";
    text.textContent =
      "Keep this page open. You'll hear a notification when a new ride request arrives.";
    btn.textContent = "Go Offline";
    btn.className =
      "px-8 py-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-400 text-red-600 dark:text-red-400 font-black rounded-2xl transition hover:bg-red-100";
  } else {
    icon.textContent = "😴";
    title.textContent = "You're Offline";
    text.textContent =
      "Go online to start receiving ride requests and earning.";
    btn.textContent = "Go Online";
    btn.className =
      "px-8 py-3 bg-green-500 hover:bg-green-600 text-white font-black rounded-2xl transition";
  }
}

// ═══════════════════════════════════════════════════════════
//   RIDE MANAGEMENT — Polling + Accept/Start/Complete
// ═══════════════════════════════════════════════════════════

// ─── Check For Active Ride ─────────────────────────────────
async function checkForActiveRide() {
  try {
    var rides = await apiCall("/rides/", "GET");
    var active = rides.find(function (r) {
      return r.status === "accepted" || r.status === "in_progress";
    });

    if (active) {
      activeRide = active;
      showActiveRide(active);
    } else {
      // No active ride — start polling for pending rides
      startPendingRidesPolling();
    }
  } catch (e) {
    startPendingRidesPolling();
  }
}

// ─── Start Polling for Pending Rides ────────────────────────
function startPendingRidesPolling() {
  if (pendingPollingInterval) clearInterval(pendingPollingInterval);

  // Immediately fetch once
  fetchPendingRides();

  // Then poll every 5 seconds using safe interval
  pendingPollingInterval = window.safeSetInterval(async function () {
    if (!isOnline || activeRide) return;
    fetchPendingRides();
  }, POLL_INTERVAL);
}

async function fetchPendingRides() {
  try {
    var result = await apiCall("/driver/pending-rides/", "GET");
    var rides = Array.isArray(result) ? result : [];
    renderPendingRideCards(rides);
  } catch (err) {
    console.error("Error fetching pending rides:", err);
  }
}

// ─── Render Pending Ride Cards ──────────────────────────────
function renderPendingRideCards(rides) {
  var section = document.getElementById("rideRequestSection");
  var list = document.getElementById("pendingRidesList");
  var placeholder = document.getElementById("offlinePlaceholder");
  if (!section || !list) return;

  if (rides.length === 0) {
    section.classList.add("hidden");
    if (placeholder && !activeRide) {
      updatePlaceholderUI();
      placeholder.classList.remove("hidden");
    }
    return;
  }

  section.classList.remove("hidden");
  if (placeholder) placeholder.classList.add("hidden");

  var html = "";
  rides.forEach(function (ride) {
    var payIcon = { wallet: "💳", upi: "📱", cash: "💵" };
    var scheduledTag = "";
    if (ride.is_return_ride) {
      scheduledTag =
        '<span class="text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full ml-2">🔄 Return</span>';
    }

    html +=
      '<div class="ride-request-card" style="padding: 1rem; margin-bottom: 0;">' +
      '  <div class="flex items-start gap-4">' +
      '    <div class="flex-1">' +
      '      <div class="flex items-center gap-2 mb-3 flex-wrap">' +
      '        <span class="text-xs font-bold bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">' +
      "#" +
      ride.id +
      " • " +
      (ride.ride_type || "Standard") +
      "</span>" +
      '        <span class="text-xs text-zinc-400">' +
      (ride.distance ? parseFloat(ride.distance).toFixed(1) + " km" : "—") +
      " • ~" +
      (ride.duration || "—") +
      " min</span>" +
      scheduledTag +
      "      </div>" +
      '      <div class="space-y-2">' +
      '        <div class="flex items-center gap-2">' +
      '          <span class="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0"></span>' +
      '          <p class="text-sm font-semibold truncate">' +
      (ride.pickup || "—").substring(0, 60) +
      "</p>" +
      "        </div>" +
      '        <div class="flex items-center gap-2">' +
      '          <span class="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0"></span>' +
      '          <p class="text-sm font-semibold truncate">' +
      (ride.dropoff || "—").substring(0, 60) +
      "</p>" +
      "        </div>" +
      "      </div>" +
      '      <div class="flex items-center justify-between mt-3">' +
      '        <p class="text-xl font-black text-yellow-500">₹' +
      parseFloat(ride.fare).toFixed(0) +
      "</p>" +
      '        <span class="text-xs text-zinc-400">' +
      (payIcon[ride.payment_method] || "💳") +
      " " +
      (ride.payment_method || "wallet") +
      " • 🚙 " +
      (ride.vehicle_type || "sedan") +
      " • 👥 " +
      (ride.passengers || 1) +
      "</span>" +
      "      </div>" +
      "    </div>" +
      "  </div>" +
      '  <div class="flex gap-3 mt-4">' +
      '    <button onclick="declineRideById(' +
      ride.id +
      ')" class="flex-1 py-2.5 rounded-2xl border-2 border-red-400 text-red-400 font-black hover:bg-red-50 dark:hover:bg-red-900/20 transition text-sm">✕ Decline</button>' +
      '    <button onclick="acceptRideById(' +
      ride.id +
      ')" class="flex-1 py-2.5 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-black transition shadow-lg text-sm">✓ Accept</button>' +
      "  </div>" +
      "</div>";
  });

  list.innerHTML = html;
}

// ─── Accept Ride ───────────────────────────────────────────
async function acceptRideById(rideId) {
  try {
    var result = await apiCall(
      "/driver/rides/" + rideId + "/accept/",
      "POST",
      {},
    );
    showToast("Ride Accepted! 🚖 Head to the pickup.", "success");

    // Stop polling for pending rides
    if (pendingPollingInterval) clearInterval(pendingPollingInterval);

    activeRide = result.ride;
    showActiveRide(result.ride);

    // Refresh stats
    refreshStats();
  } catch (err) {
    var errMsg =
      err.data && err.data.error ? err.data.error : "Ride no longer available.";
    showToast(errMsg, "error");
    // Refresh pending rides
    fetchPendingRides();
  }
}

// ─── Decline Ride ──────────────────────────────────────────
async function declineRideById(rideId) {
  try {
    await apiCall("/driver/rides/" + rideId + "/decline/", "POST", {});
    showToast("Ride declined.", "info");
    fetchPendingRides();
  } catch (err) {
    // Silently continue
  }
}

// Legacy function names for backward compatibility
function acceptRide() {
  if (activeRide && activeRide.id) acceptRideById(activeRide.id);
}
function declineRide(auto) {
  if (!auto) showToast("Ride declined.", "info");
  fetchPendingRides();
}

// ─── Show Active Ride Card ─────────────────────────────────
function showActiveRide(ride) {
  activeRide = ride;

  // Hide pending list, show active card
  var reqSection = document.getElementById("rideRequestSection");
  var activeSection = document.getElementById("activeRideSection");
  var placeholder = document.getElementById("offlinePlaceholder");

  if (reqSection) reqSection.classList.add("hidden");
  if (activeSection) activeSection.classList.remove("hidden");
  if (placeholder) placeholder.classList.add("hidden");

  // Ride info
  setText("activeRideIdDisplay", "#" + ride.id);
  setText("activePickup", ride.pickup || "—");
  setText("activeDropoff", ride.dropoff || "—");
  setText("activeFare", parseFloat(ride.fare).toFixed(0));
  setText("activeRiderName", ride.rider_name || "Rider");
  setText("activePaymentMethod", ride.payment_method || "wallet");
  setText(
    "activeDistance",
    ride.distance ? parseFloat(ride.distance).toFixed(1) + " km" : "—",
  );

  // Set Coordinates
  renderCoordBadge("activePickupCoords", ride.pickup_lat, ride.pickup_lng);
  renderCoordBadge("activeDropoffCoords", ride.dropoff_lat, ride.dropoff_lng);

  // Status badge
  var badge = document.getElementById("activeRideStatusBadge");
  if (badge) {
    var labels = {
      accepted: "🚗 Heading to Pickup",
      in_progress: "🛣️ Ride In Progress",
      completed: "✅ Completed",
    };
    var colors = {
      accepted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      in_progress:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      completed:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
    };
    badge.textContent = labels[ride.status] || ride.status;
    badge.className =
      "px-3 py-1 rounded-full text-xs font-bold " + (colors[ride.status] || "");
  }

  // Show/hide buttons based on status
  var startBtn = document.getElementById("startRideBtn");
  var completeBtn = document.getElementById("completeRideBtn");
  var cashBtn = document.getElementById("cashConfirmBtn");

  if (ride.status === "accepted") {
    // Show: Cancel + Start Ride
    if (startBtn) startBtn.classList.remove("hidden");
    if (completeBtn) completeBtn.classList.add("hidden");
    if (cashBtn) cashBtn.classList.add("hidden");
  } else if (ride.status === "in_progress") {
    // Show: Complete Ride
    if (startBtn) startBtn.classList.add("hidden");
    if (completeBtn) completeBtn.classList.remove("hidden");
    if (cashBtn) cashBtn.classList.add("hidden");
  } else if (ride.status === "completed") {
    // Show: Cash Received (only for cash payment)
    if (startBtn) startBtn.classList.add("hidden");
    if (completeBtn) completeBtn.classList.add("hidden");
    if (cashBtn) {
      if (ride.payment_method === "cash" && ride.payment_status !== "paid") {
        cashBtn.classList.remove("hidden");
      } else {
        cashBtn.classList.add("hidden");
      }
    }
  }
}

// ─── Start Ride ────────────────────────────────────────────
async function startActiveRide() {
  if (!activeRide) return;

  try {
    var result = await apiCall(
      "/driver/rides/" + activeRide.id + "/start/",
      "POST",
      {},
    );
    showToast("Ride started! Drive safe. 🚗", "success");
    activeRide = result.ride;
    showActiveRide(result.ride);
  } catch (err) {
    var errMsg =
      err.data && err.data.error ? err.data.error : "Could not start ride.";
    showToast(errMsg, "error");
  }
}

// ─── Complete Ride ─────────────────────────────────────────
async function completeActiveRide() {
  if (!activeRide) return;

  showConfirm({
    icon: "✅",
    title: "Complete This Ride?",
    message: "Confirm that you've reached the destination.",
    confirmText: "Yes, Complete",
    cancelText: "Not Yet",
    type: "info",
    onConfirm: async function () {
      try {
        var result = await apiCall(
          "/driver/rides/" + activeRide.id + "/complete/",
          "POST",
          {},
        );
        var fare = parseFloat(result.ride.fare).toFixed(0);
        var msg = "Ride completed! ₹" + fare + " earned! 🎉";
        if (result.ride.payment_status !== "paid") {
          msg =
            "Ride completed! Fare: ₹" +
            fare +
            ". Earnings will update after payment is confirmed.";
        }
        showToast(msg, "success");

        // If cash payment, show cash confirm button
        if (
          result.ride.payment_method === "cash" &&
          result.ride.payment_status !== "paid"
        ) {
          activeRide = result.ride;
          showActiveRide(result.ride);
        } else {
          // Ride fully done — clear active state
          clearActiveRide();
        }

        refreshStats();
        loadTodayRidesFromAPI();
        renderWeeklyChart();
      } catch (err) {
        var errMsg =
          err.data && err.data.error
            ? err.data.error
            : "Could not complete ride.";
        showToast(errMsg, "error");
      }
    },
  });
}

// ─── Driver Cancel Ride ────────────────────────────────────
function driverCancelRide() {
  if (!activeRide) return;

  showConfirm({
    icon: "❌",
    title: "Cancel This Ride?",
    message:
      "A cancellation penalty of ₹25 will be charged and credited to the rider as compensation.",
    confirmText: "Yes, Cancel",
    cancelText: "Keep Ride",
    type: "danger",
    onConfirm: async function () {
      try {
        var result = await apiCall(
          "/driver/rides/" + activeRide.id + "/cancel/",
          "POST",
          { reason: "Driver cancelled" },
        );
        showToast(
          "Ride cancelled. ₹" + result.penalty + " penalty charged.",
          "info",
        );
        clearActiveRide();
        refreshStats();

        // Resume pending rides polling
        if (isOnline) startPendingRidesPolling();
      } catch (err) {
        var errMsg =
          err.data && err.data.error
            ? err.data.error
            : "Could not cancel ride.";
        showToast(errMsg, "error");
      }
    },
  });
}

// ─── Confirm Cash Payment ──────────────────────────────────
async function confirmCashPayment() {
  if (!activeRide) return;

  showConfirm({
    icon: "💵",
    title: "Confirm Cash Received?",
    message:
      "Confirm that you received ₹" +
      parseFloat(activeRide.fare).toFixed(0) +
      " in cash from the rider.",
    confirmText: "Yes, Received",
    cancelText: "Not Yet",
    type: "info",
    onConfirm: async function () {
      try {
        await apiCall(
          "/driver/rides/" + activeRide.id + "/confirm-cash/",
          "POST",
          {},
        );
        showToast("Cash payment confirmed! 💰", "success");
        clearActiveRide();
        refreshStats();
        loadTodayRidesFromAPI();
      } catch (err) {
        var errMsg =
          err.data && err.data.error
            ? err.data.error
            : "Could not confirm payment.";
        showToast(errMsg, "error");
      }
    },
  });
}

// ─── Clear Active Ride ─────────────────────────────────────
function clearActiveRide() {
  activeRide = null;
  var activeSection = document.getElementById("activeRideSection");
  if (activeSection) activeSection.classList.add("hidden");

  // Resume polling if still online
  if (isOnline) {
    startPendingRidesPolling();
  } else {
    var placeholder = document.getElementById("offlinePlaceholder");
    if (placeholder) {
      updatePlaceholderUI();
      placeholder.classList.remove("hidden");
    }
  }
}

// ─── Stop All Polling ──────────────────────────────────────
function stopDriverPolling() {
  // Clear local tracking
  if (pendingPollingInterval) {
    clearInterval(pendingPollingInterval);
    pendingPollingInterval = null;
  }
  if (activeRidePollingInterval) {
    clearInterval(activeRidePollingInterval);
    activeRidePollingInterval = null;
  }
  // Clear global tracked intervals from api.js if available
  if (typeof window.stopAllPolling === "function") {
    // Need to temporarily rename our local reference so we can call the original,
    // but the original is gone, as we overwrote it. It's better to just use clearActiveIntervals
    // that we can define here if needed, or simply let the global one run.
    console.log("[Polling] Local driver polling stopped.");
  }
}

// ─── Refresh Stats ─────────────────────────────────────────
async function refreshStats() {
  try {
    var stats = await apiCall("/driver/stats/", "GET");
    renderStatsFromAPI(stats);
  } catch (e) {
    // Silently fail
  }
}

// Legacy function
function updateActiveRide(step) {
  if (step === "picked_up") startActiveRide();
  else if (step === "completed") completeActiveRide();
}

// Legacy
function loadPendingRides() {
  startPendingRidesPolling();
}
function simulateRideRequest() {}
function acceptRideRequest() {
  if (activeRide) acceptRideById(activeRide.id);
}

// ─── Weekly Chart ──────────────────────────────────────────
function renderWeeklyChart() {
  try {
    // Attempt to load from API
    apiCall("/rides/", "GET").then(function (result) {
      var rides = Array.isArray(result) ? result : [];
      var completed = rides.filter(function (r) {
        return r.status === "completed";
      });

      var days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      var now = new Date();
      var data = days.map(function (_, i) {
        var d = new Date(now);
        d.setDate(d.getDate() - (6 - i));
        var dateStr = d.toDateString();
        return completed
          .filter(function (r) {
            return (
              new Date(r.completed_at || r.created_at).toDateString() ===
              dateStr
            );
          })
          .reduce(function (s, r) {
            return s + parseFloat(r.fare || 0);
          }, 0);
      });

      drawChart(days, data);
    });
  } catch (e) {
    drawChart(
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      [0, 0, 0, 0, 0, 0, 0],
    );
  }
}

function drawChart(days, data) {
  var canvas = document.getElementById("weeklyChart");
  if (!canvas) return;
  var isDark = document.documentElement.classList.contains("dark");

  new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: days,
      datasets: [
        {
          label: "Earnings",
          data: data,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: "#22c55e",
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: isDark ? "#a1a1aa" : "#71717a", font: { size: 11 } },
        },
        y: {
          grid: {
            color: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
          },
          ticks: {
            color: isDark ? "#a1a1aa" : "#71717a",
            callback: function (v) {
              return "₹" + v;
            },
            font: { size: 11 },
          },
          beginAtZero: true,
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

// ─── Helper ────────────────────────────────────────────────
function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── Delete Driver Account ─────────────────────────────────
function deleteDriverAccount() {
  showConfirm({
    icon: "🗑️",
    title: "Close Your Account?",
    message:
      "All your data will be permanently removed. This action cannot be undone.",
    type: "danger",
    confirmText: "Yes",
    cancelText: "Cancel",
    onConfirm: function () {
      var userId = localStorage.getItem("icab_user_id");

      // Remove driver from icab_users list
      var users = JSON.parse(localStorage.getItem("icab_users") || "[]");
      users = users.filter(function (u) {
        return String(u.id) !== String(userId);
      });
      localStorage.setItem("icab_users", JSON.stringify(users));

      // Remove all rides associated with this driver
      var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");
      rides = rides.filter(function (r) {
        return String(r.driverId) !== String(userId);
      });
      localStorage.setItem("icab_rides", JSON.stringify(rides));

      // Clear session & driver-specific keys
      var keysToRemove = [
        "icab_user_id",
        "icab_user_name",
        "icab_user_email",
        "icab_user_role",
        "icab_user_photo",
        "icab_profile",
        "icab_profile_pct",
        "icab_notifications",
        "icab_driver_online_" + userId,
        "icab_driver_earnings_" + userId,
        "icab_driver_stats_" + userId,
        "icab_wallet_balance",
        "icab_wallet_transactions",
        "icab_wallet_pin",
      ];
      keysToRemove.forEach(function (key) {
        localStorage.removeItem(key);
      });

      showToast("Account closed. Goodbye! 👋", "info");

      setTimeout(function () {
        window.location.href = "index.html";
      }, 1500);
    },
  });
}
