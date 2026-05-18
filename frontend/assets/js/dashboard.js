/**
 * dashboard.js — Dashboard page specific logic for iCab
 * Contains: ride polling, active ride tracking, payment modals, stats loading
 */

// ── State ─────────────────────────────────────────────────
var activeRideId = null;
var ridePollingInterval = null;
var POLL_INTERVAL = 5000; // 5 seconds

// ─── Close location suggest lists when clicking outside ───────
document.addEventListener("click", function (e) {
  ["pickupSuggest", "dropoffSuggest"].forEach(function (id) {
    var el = document.getElementById(id);
    var inputId = id === "pickupSuggest" ? "pickupInput" : "dropoffInput";
    var inputEl = document.getElementById(inputId);
    // Close if click is outside both the list AND its paired input
    if (el && !el.contains(e.target) && e.target !== inputEl) {
      el.style.display = "none";
      el.innerHTML = "";
    }
  });
});

// ─── Init Leaflet booking map after DOM + Leaflet are ready ───
document.addEventListener("DOMContentLoaded", function () {
  // Small delay to ensure Leaflet CDN script has finished parsing
  setTimeout(function () {
    if (typeof initBookingMap === "function") {
      initBookingMap();
    }
  }, 300);

  // Load dashboard data
  loadDashboardStats();
  checkForActiveRide();
  loadRecentRides();
});

// ── Load Dashboard Stats ──────────────────────────────────────
async function loadDashboardStats() {
  try {
    // Load wallet balance
    var wallet = await apiCall("/wallet/", "GET");
    var balanceEl = document.getElementById("dashWalletBalance");
    if (balanceEl) {
      balanceEl.textContent = "₹ " + parseFloat(wallet.balance).toFixed(2);
    }
  } catch (e) {
    // Silently fail — wallet might not exist
  }

  try {
    // Load ride count
    var rides = await apiCall("/rides/", "GET");
    var completedRides = rides.filter(function (r) {
      return r.status === "completed";
    });
    var totalEl = document.getElementById("totalRides");
    if (totalEl) totalEl.textContent = completedRides.length;
  } catch (e) {
    // Silently fail
  }
}

// ── Check For Active Ride ─────────────────────────────────────
async function checkForActiveRide() {
  try {
    var rides = await apiCall("/rides/", "GET");
    var active = rides.find(function (r) {
      return (
        r.status === "pending" ||
        r.status === "accepted" ||
        r.status === "in_progress"
      );
    });

    if (active) {
      activeRideId = active.id;
      showActiveRideCard(active);
      startRidePolling(active.id);
    }
  } catch (e) {
    // Silently fail
  }
}

// ── Show Active Ride Card ─────────────────────────────────────
function showActiveRideCard(ride) {
  var card = document.getElementById("activeRideCard");
  if (!card) return;

  card.classList.remove("hidden");

  // Ride ID
  var idEl = document.getElementById("activeRideId");
  if (idEl) idEl.textContent = "#" + ride.id;

  // Status badge
  var badgeEl = document.getElementById("activeRideStatusBadge");
  if (badgeEl) {
    var statusLabels = {
      pending: "⏳ Searching for Driver",
      accepted: "🚗 Driver On The Way",
      in_progress: "🛣️ Ride In Progress",
    };
    var statusColors = {
      pending:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
      accepted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      in_progress:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    };
    badgeEl.textContent = statusLabels[ride.status] || ride.status;
    badgeEl.className =
      "px-3 py-1 rounded-full text-xs font-bold " +
      (statusColors[ride.status] || "");
  }

  // Route
  var pickupEl = document.getElementById("activePickup");
  var dropoffEl = document.getElementById("activeDropoff");
  if (pickupEl) pickupEl.textContent = ride.pickup || "—";
  if (dropoffEl) dropoffEl.textContent = ride.dropoff || "—";

  // Fare & payment
  var fareEl = document.getElementById("activeRideFare");
  if (fareEl) fareEl.textContent = "₹" + parseFloat(ride.fare).toFixed(2);
  var payEl = document.getElementById("activePaymentMethod");
  if (payEl) payEl.textContent = ride.payment_method || "wallet";

  // Driver info (show after driver accepts)
  var driverInfo = document.getElementById("activeDriverInfo");
  if (driverInfo) {
    if (
      ride.driver &&
      (ride.status === "accepted" || ride.status === "in_progress")
    ) {
      driverInfo.classList.remove("hidden");
      var nameEl = document.getElementById("activeDriverName");
      var vehicleEl = document.getElementById("activeDriverVehicle");
      var plateEl = document.getElementById("activeDriverPlate");
      if (nameEl) nameEl.textContent = ride.driver_name || "Your Driver";
      if (vehicleEl) vehicleEl.textContent = ride.driver_vehicle || "—";
      if (plateEl) plateEl.textContent = ride.driver_plate || "—";
    } else {
      driverInfo.classList.add("hidden");
    }
  }

  // Cancel button — hide if ride is in_progress
  var cancelBtn = document.getElementById("activeRideCancelBtn");
  if (cancelBtn) {
    if (ride.status === "in_progress") {
      cancelBtn.classList.add("hidden");
    } else {
      cancelBtn.classList.remove("hidden");
    }
  }

  // Update the "Active Ride" stat card
  var activeStatus = document.getElementById("activeRideStatus");
  if (activeStatus) {
    var shortStatus = {
      pending: "Searching...",
      accepted: "Driver Found",
      in_progress: "On The Way",
    };
    activeStatus.textContent = shortStatus[ride.status] || "None";
  }
}

// ── Hide Active Ride Card ─────────────────────────────────────
function hideActiveRideCard() {
  var card = document.getElementById("activeRideCard");
  if (card) card.classList.add("hidden");

  var activeStatus = document.getElementById("activeRideStatus");
  if (activeStatus) activeStatus.textContent = "None";

  activeRideId = null;
}

// ── Start Ride Polling ────────────────────────────────────────
function startRidePolling(rideId) {
  // Clear existing interval
  if (ridePollingInterval) clearInterval(ridePollingInterval);

  ridePollingInterval = window.safeSetInterval(async function () {
    try {
      var ride = await apiCall("/rides/" + rideId + "/", "GET");

      if (ride.status === "completed") {
        clearInterval(ridePollingInterval);
        ridePollingInterval = null;
        hideActiveRideCard();
        loadDashboardStats();
        loadRecentRides();

        // Show payment modal based on method
        showPaymentFlow(ride);
        return;
      }

      if (ride.status === "cancelled") {
        clearInterval(ridePollingInterval);
        ridePollingInterval = null;
        hideActiveRideCard();
        loadDashboardStats();
        loadRecentRides();

        var penaltyMsg =
          ride.cancellation_fee > 0
            ? " Cancellation fee: ₹" + ride.cancellation_fee
            : "";
        showToast("Ride cancelled." + penaltyMsg, "info");
        return;
      }

      // Update the card with latest data
      showActiveRideCard(ride);
    } catch (e) {
      // Silently continue polling
    }
  }, POLL_INTERVAL);
}

// ── Cancel Active Ride ────────────────────────────────────────
function cancelActiveRide() {
  if (!activeRideId) return;

  showConfirm({
    icon: "❌",
    title: "Cancel This Ride?",
    message:
      "If a driver has already accepted, a cancellation fee of ₹25 will be charged.",
    confirmText: "Yes, Cancel",
    cancelText: "Keep Ride",
    type: "danger",
    onConfirm: async function () {
      try {
        var result = await apiCall(
          "/rides/" + activeRideId + "/cancel/",
          "POST",
          {},
        );
        var penaltyMsg =
          result.penalty > 0 ? " ₹" + result.penalty + " penalty charged." : "";
        showToast("Ride cancelled." + penaltyMsg, "info");
        clearInterval(ridePollingInterval);
        ridePollingInterval = null;
        hideActiveRideCard();
        loadDashboardStats();
        loadRecentRides();
      } catch (err) {
        showToast("Failed to cancel ride.", "error");
      }
    },
  });
}

// ── Payment Flow After Ride Completion ────────────────────────
function showPaymentFlow(ride) {
  if (ride.payment_status === "paid") {
    // Already paid — just show rating
    showToast("Ride completed! 🎉", "success");
    showRatingModal(ride);
    return;
  }

  if (ride.payment_method === "wallet") {
    showWalletPaymentModal(ride);
  } else if (ride.payment_method === "upi") {
    showUPIPaymentModal(ride);
  } else {
    // Cash — just show success + rating
    showToast(
      "Ride completed! Please pay ₹" + ride.fare + " in cash to the driver.",
      "info",
    );
    showRatingModal(ride);
  }
}

// ── Wallet Payment Modal ──────────────────────────────────────
function showWalletPaymentModal(ride) {
  var modalHTML =
    '<div id="walletPayModal" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">' +
    '  <div class="bg-white dark:bg-zinc-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">' +
    '    <div class="text-center mb-5">' +
    '      <div class="text-4xl mb-3">💳</div>' +
    '      <h3 class="text-xl font-bold dark:text-white">Wallet Payment</h3>' +
    '      <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">Ride #' +
    ride.id +
    "</p>" +
    "    </div>" +
    '    <div class="bg-yellow-50 dark:bg-yellow-900/30 rounded-xl p-4 mb-5 text-center">' +
    '      <p class="text-sm text-yellow-700 dark:text-yellow-300">Amount to Pay</p>' +
    '      <p class="text-3xl font-black text-yellow-600 dark:text-yellow-400">₹' +
    parseFloat(ride.fare).toFixed(2) +
    "</p>" +
    "    </div>" +
    '    <div class="mb-5">' +
    '      <label class="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Enter Wallet PIN</label>' +
    '      <input type="password" id="walletPinInput" maxlength="4" placeholder="4-digit PIN" ' +
    '        class="w-full px-4 py-3 text-center text-2xl tracking-[0.5em] bg-gray-50 dark:bg-zinc-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white font-bold">' +
    "    </div>" +
    '    <div class="flex gap-3">' +
    '      <button onclick="closePaymentModal(\'walletPayModal\')" class="flex-1 px-4 py-3 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl">Cancel</button>' +
    '      <button onclick="submitWalletPayment(' +
    ride.id +
    ')" class="flex-1 px-4 py-3 bg-yellow-400 hover:bg-yellow-500 text-black font-bold rounded-xl">Pay ₹' +
    parseFloat(ride.fare).toFixed(2) +
    "</button>" +
    "    </div>" +
    "  </div>" +
    "</div>";

  document.body.insertAdjacentHTML("beforeend", modalHTML);
  var pinInput = document.getElementById("walletPinInput");
  if (pinInput) pinInput.focus();
}

// ── UPI Payment Modal ─────────────────────────────────────────
function showUPIPaymentModal(ride) {
  var driverUpiId = ride.driver_upi_id || "driver@icab";

  var modalHTML =
    '<div id="upiPayModal" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">' +
    '  <div class="bg-white dark:bg-zinc-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">' +
    '    <div class="text-center mb-5">' +
    '      <div class="text-4xl mb-3">📱</div>' +
    '      <h3 class="text-xl font-bold dark:text-white">UPI Payment</h3>' +
    '      <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">Ride #' +
    ride.id +
    "</p>" +
    "    </div>" +
    '    <div class="bg-yellow-50 dark:bg-yellow-900/30 rounded-xl p-4 mb-4 text-center">' +
    '      <p class="text-sm text-yellow-700 dark:text-yellow-300">Amount to Pay</p>' +
    '      <p class="text-3xl font-black text-yellow-600 dark:text-yellow-400">₹' +
    parseFloat(ride.fare).toFixed(2) +
    "</p>" +
    "    </div>" +
    '    <div class="mb-4">' +
    '      <label class="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Driver UPI ID</label>' +
    '      <input type="text" value="' +
    driverUpiId +
    '" readonly ' +
    '        class="w-full px-4 py-3 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white font-semibold cursor-not-allowed">' +
    "    </div>" +
    '    <div class="mb-5">' +
    '      <label class="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Enter Your UPI PIN</label>' +
    '      <input type="password" id="upiPinInput" maxlength="6" placeholder="6-digit UPI PIN" ' +
    '        class="w-full px-4 py-3 text-center text-2xl tracking-[0.5em] bg-gray-50 dark:bg-zinc-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white font-bold">' +
    "    </div>" +
    '    <div class="flex gap-3">' +
    '      <button onclick="closePaymentModal(\'upiPayModal\')" class="flex-1 px-4 py-3 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl">Cancel</button>' +
    '      <button onclick="submitUPIPayment(' +
    ride.id +
    ')" class="flex-1 px-4 py-3 bg-yellow-400 hover:bg-yellow-500 text-black font-bold rounded-xl">Pay ₹' +
    parseFloat(ride.fare).toFixed(2) +
    "</button>" +
    "    </div>" +
    "  </div>" +
    "</div>";

  document.body.insertAdjacentHTML("beforeend", modalHTML);
  var pinInput = document.getElementById("upiPinInput");
  if (pinInput) pinInput.focus();
}

// ── Submit Wallet Payment ─────────────────────────────────────
async function submitWalletPayment(rideId) {
  var pin = (document.getElementById("walletPinInput") || {}).value || "";
  if (pin.length !== 4) {
    showToast("Please enter your 4-digit wallet PIN.", "error");
    return;
  }

  try {
    var result = await apiCall("/rides/" + rideId + "/pay/wallet/", "POST", {
      pin: pin,
    });
    closePaymentModal("walletPayModal");
    showToast(
      "Payment successful! ₹" +
        parseFloat(result.ride.fare).toFixed(2) +
        " deducted.",
      "success",
    );
    loadDashboardStats(); // Refresh balance

    // Show rating modal
    showRatingModal(result.ride);
  } catch (err) {
    var errMsg =
      err.data && err.data.error ? err.data.error : "Payment failed.";
    showToast(errMsg, "error");
  }
}

// ── Submit UPI Payment ────────────────────────────────────────
async function submitUPIPayment(rideId) {
  var pin = (document.getElementById("upiPinInput") || {}).value || "";
  if (pin.length !== 6) {
    showToast("Please enter your 6-digit UPI PIN.", "error");
    return;
  }

  try {
    var result = await apiCall("/rides/" + rideId + "/pay/upi/", "POST", {
      upi_pin: pin,
    });
    closePaymentModal("upiPayModal");
    showToast("UPI payment successful!", "success");

    // Show rating modal
    showRatingModal(result.ride);
  } catch (err) {
    var errMsg =
      err.data && err.data.error ? err.data.error : "UPI payment failed.";
    showToast(errMsg, "error");
  }
}

// ── Close Payment Modal ───────────────────────────────────────
function closePaymentModal(modalId) {
  var modal = document.getElementById(modalId);
  if (modal) modal.remove();
}

// ── Rating Modal ──────────────────────────────────────────────
function showRatingModal(ride) {
  if (ride.rating) return; // Already rated

  var stars = "";
  for (var i = 1; i <= 5; i++) {
    stars +=
      '<button onclick="submitRating(' +
      ride.id +
      ", " +
      i +
      ')" ' +
      'class="text-4xl hover:scale-125 transition-transform cursor-pointer p-1">' +
      (i <= 3 ? "⭐" : "⭐") +
      "</button>";
  }

  var modalHTML =
    '<div id="ratingModal" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">' +
    '  <div class="bg-white dark:bg-zinc-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">' +
    '    <div class="text-center mb-5">' +
    '      <div class="text-4xl mb-3">🎉</div>' +
    '      <h3 class="text-xl font-bold dark:text-white">Ride Completed!</h3>' +
    '      <p class="text-gray-500 dark:text-gray-400 text-sm mt-2">How was your ride with ' +
    (ride.driver_name || "your driver") +
    "?</p>" +
    "    </div>" +
    '    <div class="flex justify-center gap-1 mb-5">' +
    stars +
    "    </div>" +
    '    <button onclick="closePaymentModal(\'ratingModal\')" class="w-full px-4 py-2 text-sm text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-700 dark:hover:text-gray-200 transition">Skip</button>' +
    "  </div>" +
    "</div>";

  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

// ── Submit Rating ─────────────────────────────────────────────
async function submitRating(rideId, rating) {
  try {
    await apiCall("/rides/" + rideId + "/rate/", "POST", { rating: rating });
    closePaymentModal("ratingModal");
    showToast("Thank you for your " + rating + "★ rating! 🌟", "success");
    loadRecentRides();
  } catch (err) {
    showToast("Failed to submit rating.", "error");
    closePaymentModal("ratingModal");
  }
}

// ── Load Recent Rides ─────────────────────────────────────────
async function loadRecentRides() {
  var container = document.getElementById("ridesTable");
  if (!container) return;

  try {
    var rides = await apiCall("/rides/", "GET");

    if (!rides || rides.length === 0) {
      container.innerHTML =
        '<p class="text-center py-10 opacity-60">No rides yet. Book your first ride above! 🚕</p>';
      return;
    }

    // Show latest 5
    var recent = rides.slice(0, 5);
    var html = '<div class="space-y-3">';

    recent.forEach(function (ride) {
      var statusColors = {
        pending:
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
        accepted:
          "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
        in_progress:
          "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
        completed:
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
        cancelled:
          "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
      };

      var date = new Date(ride.created_at);
      var dateStr = date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      var ratingHtml = "";
      if (ride.status === "completed" && ride.rating) {
        ratingHtml =
          '<span class="text-xs text-yellow-500">' +
          "⭐".repeat(ride.rating) +
          "</span>";
      }

      html +=
        '<a href="booking-detail.html?id=' +
        ride.id +
        '" class="block p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer">' +
        '  <div class="flex items-center justify-between mb-2">' +
        '    <span class="text-sm font-bold text-gray-900 dark:text-white">Ride #' +
        ride.id +
        "</span>" +
        '    <span class="px-2 py-0.5 rounded-full text-xs font-bold ' +
        (statusColors[ride.status] || "") +
        '">' +
        ride.status.replace("_", " ").toUpperCase() +
        "    </span>" +
        "  </div>" +
        '  <div class="text-xs text-gray-600 dark:text-gray-400 space-y-1">' +
        "    <p>📍 " +
        (ride.pickup || "—").substring(0, 50) +
        "</p>" +
        "    <p>🏁 " +
        (ride.dropoff || "—").substring(0, 50) +
        "</p>" +
        "  </div>" +
        '  <div class="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">' +
        "    <span>₹" +
        parseFloat(ride.fare).toFixed(2) +
        " • " +
        (ride.payment_method || "wallet") +
        "</span>" +
        "    <span>" +
        dateStr +
        "</span>" +
        "  </div>" +
        (ratingHtml ? '<div class="mt-1">' + ratingHtml + "</div>" : "") +
        "</a>";
    });

    html += "</div>";
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML =
      '<p class="text-center py-10 opacity-60">Failed to load rides.</p>';
  }
}
