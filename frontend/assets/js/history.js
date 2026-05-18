/**
 * history.js — Ride History page logic for iCab
 */

var PAGE_SIZE = 8;
var currentPage = 1;
var filteredRides = [];
var selectedRide = null;

// iCab only supports Car Taxi
var RIDE_TYPE_LABEL = "🚕 Car Taxi";

var MOCK_DRIVERS = [
  {
    name: "Rajan Kumar",
    rating: 4.8,
    vehicle: "Swift Dzire",
    plate: "MH 12 AB 3456",
  },
  {
    name: "Suresh Yadav",
    rating: 4.6,
    vehicle: "Honda Amaze",
    plate: "MH 04 CD 7890",
  },
  {
    name: "Ankit Sharma",
    rating: 4.9,
    vehicle: "Wagon R",
    plate: "DL 01 EF 2345",
  },
  {
    name: "Priya Nair",
    rating: 5.0,
    vehicle: "Hyundai i20",
    plate: "KA 05 GH 6789",
  },
  {
    name: "Deepak Verma",
    rating: 4.7,
    vehicle: "Tata Tigor",
    plate: "UP 32 JK 1122",
  },
];

// ─── Init ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  var userId = localStorage.getItem("icab_user_id");
  if (!userId) {
    window.location.href = "index.html";
    return;
  }

  loadRidesFromAPI();
});

// ─── Seed demo rides so page isn't empty ─────────────────
function seedDemoRides() {
  var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");
  var userId = localStorage.getItem("icab_user_id");

  // Only seed if this user has no rides at all
  var mine = rides.filter(function (r) {
    return r.userId == userId;
  });
  if (mine.length > 0) return;

  var demos = [
    {
      pickup: "Gandhi Nagar, Mumbai",
      dropoff: "Bandra Station, Mumbai",
      status: "completed",
      fare: 145,
      type: "standard",
    },
    {
      pickup: "Andheri West, Mumbai",
      dropoff: "Powai IT Park, Mumbai",
      status: "completed",
      fare: 210,
      type: "premium",
    },
    {
      pickup: "Dadar, Mumbai",
      dropoff: "CSMT Station, Mumbai",
      status: "cancelled",
      fare: 90,
      type: "auto",
    },
    {
      pickup: "Malad, Mumbai",
      dropoff: "Juhu Beach, Mumbai",
      status: "completed",
      fare: 175,
      type: "standard",
    },
    {
      pickup: "Borivali, Mumbai",
      dropoff: "Goregaon, Mumbai",
      status: "pending",
      fare: 80,
      type: "bike",
    },
  ];

  var now = Date.now();
  demos.forEach(function (d, i) {
    var driver = MOCK_DRIVERS[i % MOCK_DRIVERS.length];
    rides.push({
      id: now + i,
      userId: userId,
      pickup: d.pickup,
      dropoff: d.dropoff,
      status: d.status,
      fare: d.fare,
      type: d.type || "standard",
      date: new Date(now - i * 86400000 * 2).toISOString(),
      driverName: driver.name,
      driverRating: driver.rating,
      driverVehicle: driver.vehicle,
      driverPlate: driver.plate,
      distance: (2 + Math.random() * 10).toFixed(1),
      duration: Math.floor(10 + Math.random() * 30),
    });
  });
  localStorage.setItem("icab_rides", JSON.stringify(rides));
}

// ─── Load rides from API and cache locally ─────────────────
async function loadRidesFromAPI() {
  try {
    var result = await apiCall("/rides/", "GET");
    var rides = Array.isArray(result) ? result : [];

    // Cache locally
    localStorage.setItem("icab_rides", JSON.stringify(rides));

    updateStats();
    applyFilters();
  } catch (err) {
    console.error("Error loading rides from API:", err);
    showToast("Could not load ride history. Check your connection.", "error");
    // Fallback to localStorage
    updateStats();
    applyFilters();
  }
}

// ─── Stats ────────────────────────────────────────────────
function updateStats() {
  var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");

  var completed = rides.filter(function (r) {
    return r.status === "completed";
  });
  var totalFare = completed.reduce(function (s, r) {
    return s + parseFloat(r.fare || 0);
  }, 0);
  var avg = completed.length ? (totalFare / completed.length).toFixed(2) : 0;

  setText("statTotal", rides.length);
  setText("statSpent", totalFare.toFixed(2));
  setText("statCompleted", completed.length);
  setText("statAvg", avg);
}

// ─── Apply Filters + Sort ─────────────────────────────────
function applyFilters() {
  currentPage = 1;
  var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");

  var search = (getVal("searchInput") || "").toLowerCase();
  var status = getVal("statusFilter") || "all";
  var sort = getVal("sortOrder") || "newest";
  var dateFrom = getVal("dateFrom");
  var dateTo = getVal("dateTo");

  // Filter
  rides = rides.filter(function (r) {
    var matchSearch =
      !search ||
      (r.pickup || "").toLowerCase().includes(search) ||
      (r.dropoff || "").toLowerCase().includes(search);
    var matchStatus = status === "all" || r.status === status;
    var matchFrom =
      !dateFrom || new Date(r.created_at || r.date) >= new Date(dateFrom);
    var matchTo =
      !dateTo ||
      new Date(r.created_at || r.date) <= new Date(dateTo + "T23:59:59");
    return matchSearch && matchStatus && matchFrom && matchTo;
  });

  // Sort
  rides.sort(function (a, b) {
    var dateA = new Date(a.created_at || a.date);
    var dateB = new Date(b.created_at || b.date);
    if (sort === "newest") return dateB - dateA;
    if (sort === "oldest") return dateA - dateB;
    if (sort === "highest") return parseFloat(b.fare) - parseFloat(a.fare);
    if (sort === "lowest") return parseFloat(a.fare) - parseFloat(b.fare);
    return 0;
  });

  filteredRides = rides;

  var countEl = document.getElementById("resultCount");
  if (countEl)
    countEl.textContent =
      rides.length + " ride" + (rides.length !== 1 ? "s" : "") + " found";

  renderRides();
}

// ─── Render Ride Cards ────────────────────────────────────
function renderRides() {
  var el = document.getElementById("rideList");
  var lmWrap = document.getElementById("loadMoreWrap");
  if (!el) return;

  var visible = filteredRides.slice(0, currentPage * PAGE_SIZE);

  if (filteredRides.length === 0) {
    el.innerHTML =
      '<div class="empty-state"><div class="empty-icon">🗺️</div><h3 class="text-xl font-bold mb-2">No rides found</h3><p class="text-zinc-400 text-sm">Try adjusting your filters or <a href="dashboard.html" class="text-yellow-500 hover:underline">book a new ride</a>.</p></div>';
    if (lmWrap) lmWrap.classList.add("hidden");
    return;
  }

  el.innerHTML = visible.map(renderRideCard).join("");
  if (lmWrap) {
    if (visible.length < filteredRides.length) {
      lmWrap.classList.remove("hidden");
    } else {
      lmWrap.classList.add("hidden");
    }
  }
}

function renderRideCard(r) {
  var dateStr = new Date(r.created_at || r.date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  var timeStr = new Date(r.created_at || r.date).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  var typeLabel = RIDE_TYPE_LABEL;

  var statusClass =
    {
      completed: "status-badge status-completed",
      cancelled: "status-badge status-cancelled",
      pending: "status-badge status-pending",
      in_progress: "status-badge status-in_progress",
    }[r.status] || "status-badge status-pending";

  return (
    '<div class="ride-card status-' +
    r.status +
    ' mb-4" onclick="window.location.href=\'booking-detail.html?id=' +
    r.id +
    "'\">" +
    '<div class="flex items-start gap-4">' +
    '<div class="route-line mt-1">' +
    '<div class="route-dot from"></div>' +
    '<div class="route-connector"></div>' +
    '<div class="route-dot to"></div>' +
    "</div>" +
    '<div class="flex-1 min-w-0">' +
    '<div class="flex items-start justify-between gap-3">' +
    '<div class="min-w-0">' +
    '<p class="font-bold text-sm truncate">' +
    r.pickup +
    "</p>" +
    '<p class="text-zinc-400 text-xs mt-3 truncate">' +
    r.dropoff +
    "</p>" +
    "</div>" +
    '<div class="text-right flex-shrink-0">' +
    '<p class="text-lg font-black">₹' +
    parseFloat(r.fare).toFixed(2) +
    "</p>" +
    '<span class="' +
    statusClass +
    '">' +
    r.status.replace("_", " ") +
    "</span>" +
    "</div>" +
    "</div>" +
    '<div class="flex items-center gap-3 mt-4 flex-wrap">' +
    '<span class="text-xs text-zinc-400">📅 ' +
    dateStr +
    " · " +
    timeStr +
    "</span>" +
    '<span class="text-xs text-zinc-400">•</span>' +
    '<span class="text-xs text-zinc-400">' +
    typeLabel +
    "</span>" +
    (r.distance
      ? '\x3cspan class="text-xs text-zinc-400">• 📍 ' +
        parseFloat(r.distance).toFixed(1) +
        " km\x3c/span>"
      : "") +
    (r.duration
      ? '\x3cspan class="text-xs text-zinc-400">• ⏱ ' +
        r.duration +
        " min\x3c/span>"
      : "") +
    (r.payment_method
      ? '\x3cspan class="text-xs text-zinc-400">• 💳 ' +
        r.payment_method +
        "\x3c/span>"
      : "") +
    (r.payment_status && r.status === "completed"
      ? '\x3cspan class="text-xs font-bold ' +
        (r.payment_status === "paid" ? "text-green-500" : "text-orange-500") +
        '">• ' +
        r.payment_status.toUpperCase() +
        "\x3c/span>"
      : "") +
    '\x3cspan class="text-xs font-bold text-yellow-500 ml-auto">View Details →\x3c/span>' +
    "\x3c/div>" +
    "\x3c/div>" +
    "\x3c/div>" +
    "\x3c/div>"
  );
}

function loadMore() {
  currentPage++;
  renderRides();
}

// ─── Ride Detail Modal ────────────────────────────────────
function openDetail(id) {
  var r = filteredRides.find(function (r) {
    return r.id === id;
  });
  if (!r) return;
  selectedRide = r;

  var dateStr = new Date(r.created_at || r.date).toLocaleString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  var typeLabel = RIDE_TYPE_LABEL;
  var statusClass =
    {
      completed: "status-badge status-completed",
      cancelled: "status-badge status-cancelled",
      pending: "status-badge status-pending",
      in_progress: "status-badge status-in_progress",
    }[r.status] || "status-badge status-pending";

  setText("modalRideId", "#RID-" + String(r.id).slice(-6));

  var rows = [
    ["Pickup", r.pickup],
    ["Drop-off", r.dropoff],
    ["Date", dateStr],
    [
      "Status",
      '<span class="' +
        statusClass +
        '">' +
        r.status.replace("_", " ") +
        "</span>",
    ],
    ["Ride Type", typeLabel],
    ["Vehicle", r.vehicle_type || "sedan"],
    ["Passengers", r.passengers || 1],
    ["Distance", r.distance ? parseFloat(r.distance).toFixed(1) + " km" : "—"],
    ["Duration", r.duration ? r.duration + " min" : "—"],
    [
      "Fare",
      '<span class="text-yellow-500 font-black text-base">₹' +
        parseFloat(r.fare).toFixed(2) +
        "</span>",
    ],
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

  if (r.driver_name) {
    rows.push(["Driver", r.driver_name]);
    rows.push([
      "Vehicle",
      (r.driver_vehicle || "—") + " · " + (r.driver_plate || "—"),
    ]);
  }

  if (r.cancelled_by) {
    rows.push(["Cancelled By", r.cancelled_by]);
    if (r.cancellation_fee > 0) {
      rows.push([
        "Cancellation Fee",
        "₹" + parseFloat(r.cancellation_fee).toFixed(2),
      ]);
    }
  }

  var html = rows
    .map(function (row) {
      return (
        '<div class="detail-row"><span class="detail-label">' +
        row[0] +
        '</span><span class="detail-value">' +
        row[1] +
        "</span></div>"
      );
    })
    .join("");

  document.getElementById("modalBody").innerHTML = html;
  document.getElementById("detailModal").classList.remove("hidden");
}

function closeDetail() {
  document.getElementById("detailModal").classList.add("hidden");
  selectedRide = null;
}

function bookSameRide() {
  if (!selectedRide) return;
  sessionStorage.setItem("icab_quick_pickup", selectedRide.pickup);
  sessionStorage.setItem("icab_quick_dropoff", selectedRide.dropoff);
  window.location.href = "dashboard.html";
}

function openFullDetail() {
  if (!selectedRide) return;
  window.location.href = "booking-detail.html?id=" + selectedRide.id;
}

// Close modal on backdrop click
document.addEventListener("click", function (e) {
  var modal = document.getElementById("detailModal");
  if (modal && e.target === modal) closeDetail();
});

// ─── Clear Filters ────────────────────────────────────────
function clearFilters() {
  setVal("searchInput", "");
  setVal("statusFilter", "all");
  setVal("sortOrder", "newest");
  setVal("dateFrom", "");
  setVal("dateTo", "");
  applyFilters();
}

// ─── Export CSV ───────────────────────────────────────────
function exportCSV() {
  if (filteredRides.length === 0) {
    showToast("No rides to export.", "info");
    return;
  }

  var headers = [
    "Ride ID",
    "Date",
    "Pickup",
    "Drop-off",
    "Type",
    "Status",
    "Fare (₹)",
    "Distance (km)",
    "Duration (min)",
    "Driver",
  ];
  var rows = filteredRides.map(function (r) {
    return [
      "#RID-" + String(r.id).slice(-6),
      new Date(r.created_at || r.date).toLocaleDateString("en-IN"),
      '"' + (r.pickup || "").replace(/"/g, '""') + '"',
      '"' + (r.dropoff || "").replace(/"/g, '""') + '"',
      r.vehicle_type || r.type || "sedan",
      r.status,
      parseFloat(r.fare).toFixed(2),
      r.distance || "",
      r.duration || "",
      r.payment_method || "wallet",
      r.payment_status || "pending",
      r.driver_name || r.driverName || "",
    ].join(",");
  });

  var csv = [headers.join(","), ...rows].join("\n");
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download =
    "icab-rides-" + new Date().toISOString().slice(0, 10) + ".csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Ride history exported!", "success");
}

// ─── Helpers ──────────────────────────────────────────────
function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function getVal(id) {
  var el = document.getElementById(id);
  return el ? el.value : "";
}

function setVal(id, val) {
  var el = document.getElementById(id);
  if (el) el.value = val;
}
