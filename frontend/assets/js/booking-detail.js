/**
 * booking-detail.js — Booking Detail page logic for iCab
 * Reads ride ID from URL ?id=XXXXX and loads from localStorage
 */

var currentRide = null;
var selectedRating = 0;
var POLL_INTERVAL = 5000; // 5 seconds
var ridePollingInterval = null;

// iCab only supports Car Taxi service
var RIDE_TYPE_LABEL = "🚕 Car Taxi";

var STATUS_STEPS = {
  pending: 0,
  accepted: 1,
  in_progress: 2,
  completed: 3,
  cancelled: -1,
};

// ─── Init ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  var userId = localStorage.getItem("icab_user_id");
  if (!userId) {
    window.location.href = "index.html";
    return;
  }

  var params = new URLSearchParams(window.location.search);
  var rideId = params.get("id");

  if (!rideId) {
    showNotFound();
    return;
  }

  // Try to load from API first
  apiCall("/rides/" + rideId + "/", "GET")
    .then(function (ride) {
      currentRide = ride;
      // Cache locally
      var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");
      var idx = rides.findIndex(function (r) {
        return String(r.id) === String(rideId);
      });
      if (idx !== -1) {
        rides[idx] = ride;
      } else {
        rides.unshift(ride);
      }
      localStorage.setItem("icab_rides", JSON.stringify(rides));

      renderBookingFromAPI(ride);
      initializeMap(ride);
      // Start real-time polling for status updates
      startRidePolling(rideId);
    })
    .catch(function (err) {
      // Fallback to localStorage
      var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");
      var ride = rides.find(function (r) {
        return String(r.id) === String(rideId);
      });

      if (!ride) {
        showNotFound();
        return;
      }

      currentRide = ride;
      renderBooking(ride);
      initializeMap(ride);
    });
});

// ─── Initialize Map and Tracking ──────────────────────────
function initializeMap(ride) {
  var trackingCard = document.getElementById("trackingMapCard");
  var activeStatuses = ["pending", "accepted", "in_progress"];
  if (activeStatuses.indexOf(ride.status) !== -1) {
    if (trackingCard) trackingCard.style.display = "";
    // Wait for Leaflet to be ready
    setTimeout(function () {
      initTrackingMap(ride);
    }, 400);
  } else {
    // Completed / Cancelled — hide live map card
    if (trackingCard) trackingCard.style.display = "none";
  }

  // ── Status Steps init ──
  if (typeof updateStatusSteps === "function") {
    updateStatusSteps(ride.status);
  }

  // ── Driver Live Card ──
  populateDriverLiveCard(ride);
}

// ─── Render using API data ────────────────────────────────
function renderBookingFromAPI(r) {
  document.getElementById("bookingContent").classList.remove("hidden");

  // Title row
  setText("rideIdLabel", "#RID-" + String(r.id).slice(-6));
  setText(
    "rideDateLabel",
    new Date(r.created_at).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  // Status badge
  var badge = document.getElementById("statusBadge");
  if (badge) {
    badge.textContent = r.status.replace("_", " ");
    badge.className =
      "status-badge status-" + r.status + " px-4 py-1.5 text-sm";
  }

  // Route
  setText("ridePickup", r.pickup || "—");
  setText("rideDropoff", r.dropoff || "—");
  renderCoordBadge("ridePickupCoords", r.pickup_lat, r.pickup_lng);
  renderCoordBadge("rideDropoffCoords", r.dropoff_lat, r.dropoff_lng);
  setText("rideDistance", r.distance ? r.distance + " km" : "—");
  setText("rideDuration", r.duration ? r.duration + " min" : "—");
  setText("rideType", RIDE_TYPE_LABEL);

  // Timeline
  renderTimeline(r);

  // Driver info
  if (r.driver_name) {
    var dName = r.driver_name || "—";
    var initials = dName
      .split(" ")
      .map(function (n) {
        return n[0];
      })
      .join("")
      .toUpperCase();
    setText("driverAvatar", initials);
    setText("driverName", dName);
    setText("driverRating", "⭐ " + (r.rating || "—"));
    setText("driverVehicle", r.driver_vehicle || "—");
    setText("driverPlate", r.driver_plate || "—");
  } else {
    var driverSection = document.getElementById("driverSection");
    if (driverSection) driverSection.classList.add("hidden");
  }

  // Fare Details
  setText("fareTotalAmount", "₹" + parseFloat(r.fare).toFixed(2));
  setText("driverETA", (r.duration || 30) + " mins");

  // Show payment info
  renderFareFromAPI(r);

  // Show/hide sections based on status
  var cancelBtn = document.getElementById("cancelBtn");
  if (r.status === "pending" || r.status === "accepted") {
    if (cancelBtn) cancelBtn.classList.remove("hidden");
  }

  if (r.status === "completed") {
    if (r.rating) {
      showRated(r);
    } else {
      var ratingSection = document.getElementById("ratingSection");
      if (ratingSection) ratingSection.style.removeProperty("display");
    }
  }
}

// ─── Driver Live Card ─────────────────────────────────────
function populateDriverLiveCard(r) {
  var initEl = document.getElementById("driverLiveInitial");
  var nameEl = document.getElementById("driverLiveName");
  var subEl = document.getElementById("driverLiveSub");
  var plateEl = document.getElementById("driverLivePlate");
  var etaEl = document.getElementById("driverETA");

  var dName = r.driver_name || r.driverName || "Searching...";
  var dVehicle = r.driver_vehicle || r.driverVehicle || "—";
  var dPlate = r.driver_plate || r.driverPlate || "—";

  if (initEl) initEl.textContent = dName.charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = dName;
  if (subEl) subEl.textContent = dVehicle;
  if (plateEl) plateEl.textContent = "🚗 " + dPlate;

  if (etaEl) {
    if (r.status === "completed" || r.status === "cancelled") {
      etaEl.textContent = r.status === "completed" ? "Done ✅" : "Cancelled";
    } else if (r.distance) {
      etaEl.textContent =
        Math.ceil((parseFloat(r.distance) / 30) * 60) + " min";
    } else {
      etaEl.textContent = "—";
    }
  }
}

// ─── Real-time Polling ────────────────────────────────────
function startRidePolling(rideId) {
  if (ridePollingInterval) clearInterval(ridePollingInterval);

  ridePollingInterval = window.safeSetInterval(async function () {
    try {
      var latestRide = await apiCall("/rides/" + rideId + "/", "GET");

      // Only update if status or driver has changed
      if (
        latestRide.status !== currentRide.status ||
        latestRide.driver_id !== (currentRide ? currentRide.driver_id : null)
      ) {
        console.log(
          "Ride update detected: " +
            (currentRide ? currentRide.status : "null") +
            " -> " +
            latestRide.status,
        );
        currentRide = latestRide;

        // Re-render UI
        renderBookingFromAPI(latestRide);
        initializeMap(latestRide);

        // If terminal status reached, stop polling
        if (["completed", "cancelled"].indexOf(latestRide.status) !== -1) {
          stopRidePolling();
        }
      }
    } catch (err) {
      console.error("Polling error:", err);
    }
  }, POLL_INTERVAL);
}

function stopRidePolling() {
  if (ridePollingInterval) {
    clearInterval(ridePollingInterval);
    ridePollingInterval = null;
    console.log("Ride polling stopped.");
  }
}

// ─── Render full booking ───────────────────────────────────
function renderBooking(r) {
  document.getElementById("bookingContent").classList.remove("hidden");

  // Title row
  setText("rideIdLabel", "#RID-" + String(r.id).slice(-6));
  setText(
    "rideDateLabel",
    new Date(r.date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  // Status badge
  var badge = document.getElementById("statusBadge");
  if (badge) {
    badge.textContent = r.status.replace("_", " ");
    badge.className =
      "status-badge status-" + r.status + " px-4 py-1.5 text-sm";
  }

  // Route
  setText("ridePickup", r.pickup || "—");
  setText("rideDropoff", r.dropoff || "—");
  renderCoordBadge("ridePickupCoords", r.pickup_lat, r.pickup_lng);
  renderCoordBadge("rideDropoffCoords", r.dropoff_lat, r.dropoff_lng);
  setText("rideDistance", r.distance ? r.distance + " km" : "—");
  setText("rideDuration", r.duration ? r.duration + " min" : "—");
  setText("rideType", RIDE_TYPE_LABEL);

  // Timeline
  renderTimeline(r);

  // Driver
  if (r.driverName) {
    var initials = r.driverName
      .split(" ")
      .map(function (n) {
        return n[0];
      })
      .join("")
      .toUpperCase();
    setText("driverAvatar", initials);
    setText("driverName", r.driverName);
    setText("driverRating", "⭐ " + (r.driverRating || "—"));
    setText("driverVehicle", r.driverVehicle || "—");
    setText("driverPlate", r.driverPlate || "—");
  } else {
    document.getElementById("driverSection").style.display = "none";
  }

  // Fare breakdown
  renderFare(r);

  // Sections based on status
  var cancelBtn = document.getElementById("cancelBtn");
  if (r.status === "pending" || r.status === "accepted") {
    if (cancelBtn) cancelBtn.classList.remove("hidden");
  }

  if (r.status === "completed") {
    if (r.rating) {
      showRated(r);
    } else {
      document.getElementById("ratingSection").style.removeProperty("display");
    }
  }
}

// ─── Timeline ─────────────────────────────────────────────
function renderTimeline(r) {
  var steps = [
    { key: "booked", label: "Booking Confirmed", icon: "✓" },
    { key: "accepted", label: "Driver Assigned", icon: "🚗" },
    { key: "in_progress", label: "Ride in Progress", icon: "▶" },
    { key: "completed", label: "Ride Completed", icon: "🏁" },
  ];

  var current = STATUS_STEPS[r.status] || 0;
  var html = "";

  if (r.status === "cancelled") {
    // Show cancelled timeline
    var cancelledSteps = [
      { label: "Booking Placed", done: true, icon: "✓" },
      { label: "Ride Cancelled", done: true, icon: "✕", cancel: true },
    ];
    cancelledSteps.forEach(function (s) {
      var cls = s.cancel ? "timeline-step current" : "timeline-step done";
      html += '<div class="' + cls + ' mb-2">';
      html +=
        '<div class="timeline-icon" style="' +
        (s.cancel
          ? "background:#ef4444;border-color:#ef4444;color:white;"
          : "") +
        '">' +
        s.icon +
        "</div>";
      html +=
        '<div class="timeline-content"><p class="timeline-label">' +
        s.label +
        "</p>";
      html +=
        '<p class="timeline-time">' +
        new Date(r.date).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }) +
        "</p></div></div>";
    });
    document.getElementById("rideTimeline").innerHTML = html;
    return;
  }

  steps.forEach(function (s, i) {
    var isDone = i < current || i === 0;
    var isCurrent = i === current && r.status !== "completed";
    if (r.status === "completed") isDone = true;

    var stepCls = isDone
      ? "timeline-step done"
      : isCurrent
        ? "timeline-step current"
        : "timeline-step";
    html += '<div class="' + stepCls + ' mb-2">';
    html += '<div class="timeline-icon">' + (isDone ? "✓" : s.icon) + "</div>";
    html += '<div class="timeline-content">';
    html += '<p class="timeline-label">' + s.label + "</p>";
    if (isDone || isCurrent) {
      var d = new Date(r.date);
      d.setMinutes(d.getMinutes() + i * 7);
      html +=
        '<p class="timeline-time">' +
        d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) +
        "</p>";
    } else {
      html += '<p class="timeline-time text-zinc-400">Pending</p>';
    }
    html += "</div></div>";
  });

  document.getElementById("rideTimeline").innerHTML = html;
}

// ─── Fare Breakdown (API version) ────────────────────────────
function renderFareFromAPI(r) {
  var fare = parseFloat(r.fare || 0);
  var baseFare = Math.round(fare * 0.35);
  var distFare = Math.round(fare * 0.65);
  var total = fare;

  var rows = [
    ["Base Fare", "₹" + baseFare],
    [
      "Distance Charge (" +
        (r.distance ? parseFloat(r.distance).toFixed(1) : "0") +
        " km)",
      "₹" + distFare,
    ],
    ["Vehicle Type", r.vehicle_type || "sedan"],
    ["Payment Method", (r.payment_method || "wallet").toUpperCase()],
    [
      "Payment Status",
      '<span class="font-bold ' +
        (r.payment_status === "paid" ? "text-green-500" : "text-orange-500") +
        '">' +
        (r.payment_status || "pending").toUpperCase() +
        "</span>",
    ],
  ];

  if (r.cancellation_fee > 0) {
    rows.push([
      "Cancellation Fee",
      '<span class="text-red-500">₹' +
        parseFloat(r.cancellation_fee).toFixed(2) +
        "</span>",
    ]);
  }

  var html = rows
    .map(function (row) {
      return (
        '<div class="fare-row"><span class="text-zinc-500 dark:text-zinc-400 text-sm">' +
        row[0] +
        '</span><span class="font-semibold text-sm">' +
        row[1] +
        "</span></div>"
      );
    })
    .join("");

  html +=
    '<div class="fare-row total"><span>Total Paid</span>' +
    '<span class="text-yellow-500 text-lg">₹' +
    total.toFixed(2) +
    "</span></div>";

  // If status is completed and payment is pending (UPI), show pay button
  if (
    r.status === "completed" &&
    r.payment_status === "pending" &&
    r.payment_method === "upi"
  ) {
    html +=
      '<button onclick="payRideUPI(' +
      r.id +
      ", " +
      total +
      ')" ' +
      'class="w-full mt-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-black rounded-xl transition shadow-lg flex items-center justify-center gap-2">' +
      "📱 Pay ₹" +
      total.toFixed(2) +
      " via UPI</button>";
  }

  document.getElementById("fareTable").innerHTML = html;
}

// ─── UPI Payment Modal Logic ──────────────────────────────
var upiPaymentData = { id: null, amount: 0 };

function payRideUPI(rideId, amount) {
  upiPaymentData = { id: rideId, amount: amount };

  var modal = document.getElementById("upiModal");
  var amountDisplay = document.getElementById("upiModalAmount");
  if (modal && amountDisplay) {
    amountDisplay.textContent = "₹" + amount.toFixed(2);
    modal.classList.add("active");
  }
}

function closeUPIModal() {
  var modal = document.getElementById("upiModal");
  if (modal) {
    modal.classList.remove("active");
  }
  // Clear inputs
  var idInput = document.getElementById("upiIdInput");
  var pinInput = document.getElementById("upiPinInput");
  if (idInput) idInput.value = "";
  if (pinInput) pinInput.value = "";
}

function toggleUPIPinVisibility() {
  var pinInput = document.getElementById("upiPinInput");
  var btn = document.getElementById("pinToggleBtn");
  if (!pinInput || !btn) return;

  if (pinInput.type === "password") {
    pinInput.type = "text";
    btn.textContent = "🙈";
  } else {
    pinInput.type = "password";
    btn.textContent = "👁️";
  }
}

async function confirmUPIPayment() {
  var upiId = document.getElementById("upiIdInput").value.trim();
  var upiPin = document.getElementById("upiPinInput").value.trim();

  if (!upiId) {
    showToast("Please enter your UPI ID.", "error");
    return;
  }
  if (upiPin.length !== 6) {
    showToast("Please enter a valid 6-digit UPI PIN.", "error");
    return;
  }

  try {
    // Show loading state on button
    var btn = document.querySelector(".upi-pay-btn");
    var originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Verifying...";

    await apiCall("/rides/" + upiPaymentData.id + "/pay/upi/", "POST", {
      upi_id: upiId,
      upi_pin: upiPin,
    });

    showToast(
      "UPI Payment Successful! ₹" + upiPaymentData.amount.toFixed(2),
      "success",
    );
    closeUPIModal();

    // Reload to refresh status
    setTimeout(function () {
      location.reload();
    }, 1500);
  } catch (err) {
    var msg =
      err.data && err.data.error
        ? err.data.error
        : "Payment failed. Try again.";
    showToast(msg, "error");

    // Reset button
    var btn = document.querySelector(".upi-pay-btn");
    btn.disabled = false;
    btn.textContent = "Verify & Pay";
  }
}

// ─── Star Rating ───────────────────────────────────────────
function setRating(val) {
  selectedRating = val;
  var stars = document.querySelectorAll(".star-btn");
  stars.forEach(function (s, i) {
    s.classList.toggle("active", i < val);
  });
}

async function submitRating() {
  if (!selectedRating) {
    showToast("Please select a star rating.", "error");
    return;
  }

  try {
    await apiCall("/rides/" + currentRide.id + "/rate/", "POST", {
      rating: selectedRating,
    });
    currentRide.rating = selectedRating;

    document.getElementById("ratingSection").style.display = "none";
    showRated(currentRide);
    showToast("Thanks for your review! ⭐", "success");
  } catch (err) {
    showToast("Failed to submit rating. Try again.", "error");
  }
}

function showRated(r) {
  var section = document.getElementById("ratedSection");
  var starsEl = document.getElementById("ratedStars");
  var textEl = document.getElementById("ratedText");

  if (!section) return;
  section.style.removeProperty("display");

  var starsHtml = "";
  for (var i = 1; i <= 5; i++) {
    starsHtml +=
      '<span style="font-size:1.4rem;color:' +
      (i <= r.rating ? "#facc15" : "#d4d4d8") +
      '">★</span>';
  }
  if (starsEl) starsEl.innerHTML = starsHtml;
  if (textEl)
    textEl.textContent = r.review ? '"' + r.review + '"' : "No written review.";
}

// ─── Cancel Ride ───────────────────────────────────────────
function cancelRide() {
  var modal = document.getElementById("cancelReasonModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    setTimeout(function () {
      modal.classList.remove("opacity-0");
      document.getElementById("cancelReasonBox").classList.remove("scale-95");
    }, 10);
  }
}

function closeCancelModal() {
  var modal = document.getElementById("cancelReasonModal");
  if (modal) {
    modal.classList.add("opacity-0");
    document.getElementById("cancelReasonBox").classList.add("scale-95");
    setTimeout(function () {
      modal.classList.add("hidden");
      modal.style.display = "";
    }, 300);
  }
}

async function confirmCancelRide() {
  var radios = document.getElementsByName("cancelReason");
  var reason = "No reason provided";
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked) {
      reason = radios[i].value;
      break;
    }
  }

  try {
    var result = await apiCall(
      "/rides/" + currentRide.id + "/cancel/",
      "POST",
      {
        reason: reason,
      },
    );
    currentRide = result.ride;

    var badge = document.getElementById("statusBadge");
    if (badge) {
      badge.textContent = "cancelled";
      badge.className = "status-badge status-cancelled px-4 py-1.5 text-sm";
    }
    var cancelBtn = document.getElementById("cancelBtn");
    if (cancelBtn) cancelBtn.classList.add("hidden");
    renderTimeline(currentRide);

    closeCancelModal();
    var penaltyMsg =
      result.penalty > 0 ? " Cancellation fee: ₹" + result.penalty : "";
    showToast("Ride cancelled." + penaltyMsg, "info");
  } catch (err) {
    closeCancelModal();
    showToast("Failed to cancel ride.", "error");
  }
}

// ─── Book Again ────────────────────────────────────────────
function bookAgain() {
  sessionStorage.setItem("icab_quick_pickup", currentRide.pickup || "");
  sessionStorage.setItem("icab_quick_dropoff", currentRide.dropoff || "");
  window.location.href = "dashboard.html";
}

// ─── Invoice Download ──────────────────────────────────────
function downloadInvoice() {
  var r = currentRide;
  var name = localStorage.getItem("icab_user_name") || "Customer";
  var email = localStorage.getItem("icab_user_email") || "—";
  var date = new Date(r.created_at || r.date).toLocaleString("en-IN");

  document.getElementById("invoiceBody").innerHTML = [
    '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">',
    row2("Invoice No.", "#INV-" + String(r.id).slice(-6)),
    row2("Date", date),
    row2("Customer", name),
    row2("Email", email),
    row2("Pickup", r.pickup || "—"),
    row2("Drop-off", r.dropoff || "—"),
    row2("Status", r.status),
    row2("Vehicle Type", r.vehicle_type || "sedan"),
    row2(
      "Distance",
      r.distance ? parseFloat(r.distance).toFixed(1) + " km" : "—",
    ),
    row2("Duration", r.duration ? r.duration + " min" : "—"),
    row2("Payment Method", (r.payment_method || "wallet").toUpperCase()),
    row2("Payment Status", (r.payment_status || "pending").toUpperCase()),
    '<tr style="border-top:2px solid #e4e4e7;"><td style="padding:12px 0;font-weight:900;font-size:1rem;">Total Fare</td>' +
      '<td style="text-align:right;font-weight:900;font-size:1.2rem;color:#16a34a;">₹' +
      parseFloat(r.fare).toFixed(2) +
      "</td></tr>",
    "</table>",
  ].join("");

  var el = document.getElementById("invoicePrintArea");
  el.classList.remove("hidden");
  window.print();
  el.classList.add("hidden");
}

function row2(label, value) {
  return (
    '<tr><td style="padding:8px 0;color:#71717a;">' +
    label +
    "</td>" +
    '<td style="text-align:right;font-weight:600;">' +
    value +
    "</td></tr>"
  );
}

// ─── Not Found ────────────────────────────────────────────
function showNotFound() {
  document.getElementById("notFound").classList.remove("hidden");
}

// ─── Helper ───────────────────────────────────────────────
function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}
