// ─── Constants (Synchronized with Backend) ─────────────────────
var ICAB_BASE_FARE = 25.0; // Base fare for Sedan
var ICAB_RATE_PER_KM = 10.0; // Rate for Sedan
var ICAB_TAX_PCT = 5.0; // 5% GST
var DRIVER_SPEED_KMH = 30.0; // Estimated speed for ETA calculation
var selectedRideType = "standard";

function getTrafficMultiplier() {
  var now = new Date();
  var hours = now.getHours();
  var minutes = now.getMinutes();
  var t = hours + minutes / 60;

  // Sync with backend Gujarat peak hours
  if (t >= 8.5 && t <= 10.5) return 1.8; // Morning peak
  if (t >= 17.5 && t <= 20.5) return 2.0; // Evening peak
  if (t >= 22 || t <= 6) return 1.0; // Night
  return 1.3; // Day
}

// ─── Map Instances ────────────────────────────────────────────
var bookingMap = null;
var trackingMap = null;

// ─── Markers ─────────────────────────────────────────────────
var pickupMarker = null;
var dropoffMarker = null;
var driverMarker = null;
var routeLayer = null;

// ─── State ───────────────────────────────────────────────────
var pickupLatLng = null;
var dropoffLatLng = null;
var driverLatLng = null;
var driverInterval = null;
var searchTimeout = null;

// ─── Leaflet custom icons ─────────────────────────────────────
function makeIcon(emoji, size) {
  size = size || 36;
  return L.divIcon({
    className: "",
    html:
      '<div style="font-size:' +
      size +
      'px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4))">' +
      emoji +
      "</div>",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

// ─── Haversine Distance (km) ──────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = ((lat2 - lat1) * Math.PI) / 180;
  var dLng = ((lng2 - lng1) * Math.PI) / 180;
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Fare Calculator ──────────────────────────────────────────
function calcFare(km) {
  // Double km if round-trip is selected
  var actualKm = selectedRideType === "round-trip" ? km * 2 : km;
  var base = ICAB_BASE_FARE + actualKm * ICAB_RATE_PER_KM;
  var tax = base * (ICAB_TAX_PCT / 100);
  return { base: base, tax: tax, total: base + tax, km: actualKm };
}

// ─── Reverse Geocode (coords → address) ───────────────────────
function reverseGeocode(lat, lng, callback) {
  var url =
    "https://nominatim.openstreetmap.org/reverse?format=json&lat=" +
    lat +
    "&lon=" +
    lng +
    "&zoom=16&addressdetails=1";
  fetch(url, { headers: { "Accept-Language": "en" } })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      callback(d.display_name || lat.toFixed(4) + ", " + lng.toFixed(4));
    })
    .catch(function () {
      callback(lat.toFixed(4) + ", " + lng.toFixed(4));
    });
}

// ─── Forward Geocode (address → coords) ──────────────────────
function forwardGeocode(query, callback) {
  var url =
    "https://nominatim.openstreetmap.org/search?format=json&q=" +
    encodeURIComponent(query) +
    "&limit=5";
  fetch(url, { headers: { "Accept-Language": "en" } })
    .then(function (r) {
      return r.json();
    })
    .then(callback)
    .catch(function () {
      callback([]);
    });
}

// ─── Check if coordinates are within Gujarat bounds ────────────
function isWithinGujaratBounds(lat, lng) {
  var gujaratBounds = [
    [20.0553, 68.1428], // Southwest corner (South, West)
    [24.7136, 74.3587], // Northeast corner (North, East)
  ];
  var southWest = gujaratBounds[0];
  var northEast = gujaratBounds[1];

  return (
    lat >= southWest[0] &&
    lat <= northEast[0] &&
    lng >= southWest[1] &&
    lng <= northEast[1]
  );
}

// ─────────────────────────────────────────────────────────────
//  BOOKING MAP (Dashboard)
// ─────────────────────────────────────────────────────────────

function initBookingMap() {
  if (bookingMap) return;

  // Gujarat center and bounds
  var gujaratCenter = [22.2587, 71.1924]; // Gujarat center coordinates
  var gujaratBounds = [
    [20.0553, 68.1428], // Southwest corner (South, West)
    [24.7136, 74.3587], // Northeast corner (North, East)
  ];

  bookingMap = L.map("bookingMap", {
    zoomControl: true,
    maxBounds: gujaratBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 7,
    maxZoom: 19,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(bookingMap);

  // Add visual Gujarat border overlay
  // (Removed to improve appearance - restrictions are still active)

  // Ensure container is properly sized and fit bounds
  setTimeout(function () {
    bookingMap.invalidateSize();
    bookingMap.fitBounds(gujaratBounds, {
      padding: [40, 40],
      maxZoom: 8,
    });
  }, 50);

  // Click on map → set pickup or dropoff (only within Gujarat)
  bookingMap.on("click", function (e) {
    var lat = e.latlng.lat;
    var lng = e.latlng.lng;

    // Check if click is within Gujarat bounds
    if (!isWithinGujaratBounds(lat, lng)) {
      showToast("Please select location within Gujarat area only", "error");
      return;
    }

    if (!pickupLatLng) {
      setPickupOnMap(lat, lng, false);
    } else if (!dropoffLatLng) {
      setDropoffOnMap(lat, lng);
    }
  });
  // NOTE: No auto GPS on init — user must click the button
}

// ─── Get device GPS (called only on button click) ─────────────
function getUserLocation() {
  var gpsBtn = document.getElementById("gpsPickupBtn");

  if (!navigator.geolocation) {
    if (gpsBtn) {
      gpsBtn.textContent = "❌ Not Supported";
      gpsBtn.style.background = "#fee2e2";
      setTimeout(function () {
        gpsBtn.textContent = "📍 Use GPS";
        gpsBtn.style.background = "";
      }, 3000);
    }
    showToast("Geolocation is not supported on this browser.", "error");
    return;
  }

  // Visual: loading state
  if (gpsBtn) {
    gpsBtn.textContent = "⌛ Locating...";
    gpsBtn.disabled = true;
    gpsBtn.style.opacity = "0.7";
  }

  navigator.geolocation.getCurrentPosition(
    // ── Success ──
    function (pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;

      // Check if GPS location is within Gujarat bounds
      if (!isWithinGujaratBounds(lat, lng)) {
        if (gpsBtn) {
          gpsBtn.textContent = "📍 Outside Service Area";
          gpsBtn.style.background = "#fee2e2";
          gpsBtn.disabled = false;
          gpsBtn.style.opacity = "1";
          setTimeout(function () {
            gpsBtn.textContent = "📍 Use GPS";
            gpsBtn.style.background = "";
          }, 3000);
        }
        showToast("❌ Your location is outside Gujarat service area", "error");
        return;
      }

      if (gpsBtn) {
        gpsBtn.textContent = "✅ Located!";
        gpsBtn.style.background = "#dcfce7";
        gpsBtn.style.color = "#166534";
        gpsBtn.disabled = false;
        gpsBtn.style.opacity = "1";
        setTimeout(function () {
          gpsBtn.textContent = "📍 Use GPS";
          gpsBtn.style.background = "";
          gpsBtn.style.color = "";
        }, 3000);
      }
      setPickupOnMap(lat, lng, true);
      showToast("📍 Location found!", "success");
    },
    // ── Error / Denied ──
    function (err) {
      if (gpsBtn) {
        gpsBtn.textContent = "🚫 Denied";
        gpsBtn.style.background = "#fee2e2";
        gpsBtn.style.color = "#991b1b";
        gpsBtn.disabled = false;
        gpsBtn.style.opacity = "1";
        setTimeout(function () {
          gpsBtn.textContent = "📍 Use GPS";
          gpsBtn.style.background = "";
          gpsBtn.style.color = "";
        }, 4000);
      }
      var msg =
        err.code === 1
          ? "Location access denied. Please allow location in browser settings, then try again."
          : "Could not get your location. Please search or tap the map to set pickup.";
      showToast(msg, "error");
    },
    { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 },
  );
}

// Set pickup marker on map + reverse geocode address
function setPickupOnMap(lat, lng, flyTo) {
  pickupLatLng = { lat: lat, lng: lng };

  if (pickupMarker) pickupMarker.remove();
  pickupMarker = L.marker([lat, lng], {
    icon: makeIcon("📍", 36),
    draggable: true,
  })
    .addTo(bookingMap)
    .bindPopup("<b>Pickup</b>")
    .openPopup();

  pickupMarker.on("dragend", function (e) {
    var p = e.target.getLatLng();

    // Check if dragged marker is within Gujarat bounds
    if (!isWithinGujaratBounds(p.lat, p.lng)) {
      // Revert to previous position
      pickupMarker.setLatLng([pickupLatLng.lat, pickupLatLng.lng]);
      showToast("❌ Cannot place pickup outside Gujarat area", "error");
      return;
    }

    pickupLatLng = { lat: p.lat, lng: p.lng };
    reverseGeocode(p.lat, p.lng, function (addr) {
      var el = document.getElementById("pickupInput");
      if (el) el.value = addr;
      updateFareEstimate();
    });
  });

  reverseGeocode(lat, lng, function (addr) {
    var el = document.getElementById("pickupInput");
    if (el) el.value = addr;
    updateFareEstimate();
  });

  if (flyTo === true) bookingMap.flyTo([lat, lng], 15, { duration: 1.4 });
  else bookingMap.setView([lat, lng], 14);
  drawRoute();
}

// Set dropoff marker on map + reverse geocode
function setDropoffOnMap(lat, lng) {
  dropoffLatLng = { lat: lat, lng: lng };

  if (dropoffMarker) dropoffMarker.remove();
  dropoffMarker = L.marker([lat, lng], {
    icon: makeIcon("🏁", 36),
    draggable: true,
  })
    .addTo(bookingMap)
    .bindPopup("<b>Drop-off</b>")
    .openPopup();

  dropoffMarker.on("dragend", function (e) {
    var p = e.target.getLatLng();

    // Check if dragged marker is within Gujarat bounds
    if (!isWithinGujaratBounds(p.lat, p.lng)) {
      // Revert to previous position
      dropoffMarker.setLatLng([dropoffLatLng.lat, dropoffLatLng.lng]);
      showToast("❌ Cannot place drop-off outside Gujarat area", "error");
      return;
    }

    dropoffLatLng = { lat: p.lat, lng: p.lng };
    reverseGeocode(p.lat, p.lng, function (addr) {
      var el = document.getElementById("dropoffInput");
      if (el) el.value = addr;
      updateFareEstimate();
    });
  });

  reverseGeocode(lat, lng, function (addr) {
    var el = document.getElementById("dropoffInput");
    if (el) el.value = addr;
    updateFareEstimate();
  });

  drawRoute();
}

// Draw route line between pickup and dropoff
function drawRoute() {
  if (!pickupLatLng || !dropoffLatLng) return;
  if (routeLayer) {
    bookingMap.removeLayer(routeLayer);
    routeLayer = null;
  }

  var url =
    "https://router.project-osrm.org/route/v1/driving/" +
    pickupLatLng.lng +
    "," +
    pickupLatLng.lat +
    ";" +
    dropoffLatLng.lng +
    "," +
    dropoffLatLng.lat +
    "?overview=full&geometries=geojson";

  fetch(url)
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data.routes && data.routes[0]) {
        var coords = data.routes[0].geometry.coordinates.map(function (c) {
          return [c[1], c[0]];
        });
        routeLayer = L.polyline(coords, {
          color: "#eab308",
          weight: 5,
          opacity: 0.85,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(bookingMap);
        bookingMap.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
        var km = data.routes[0].distance / 1000;
        updateFareEstimateFromKm(km);
      }
    })
    .catch(function () {
      routeLayer = L.polyline(
        [
          [pickupLatLng.lat, pickupLatLng.lng],
          [dropoffLatLng.lat, dropoffLatLng.lng],
        ],
        { color: "#eab308", weight: 4, dashArray: "8, 6" },
      ).addTo(bookingMap);
      bookingMap.fitBounds(
        [
          [pickupLatLng.lat, pickupLatLng.lng],
          [dropoffLatLng.lat, dropoffLatLng.lng],
        ],
        { padding: [40, 40] },
      );
      updateFareEstimate();
    });
}

// Update fare display by calling API
function updateFareEstimate() {
  if (!pickupLatLng || !dropoffLatLng) {
    var container = document.getElementById("fareEstimateContainer");
    var changeContainer = document.getElementById("changeLocationContainer");
    if (container) container.classList.add("hidden");
    if (changeContainer) changeContainer.classList.add("hidden");
    return;
  }

  var vehicleTypeEl = document.getElementById("vehicleType");
  var vehicleType = vehicleTypeEl ? vehicleTypeEl.value : "sedan";

  var payload = {
    pickup_lat: pickupLatLng.lat,
    pickup_lng: pickupLatLng.lng,
    dropoff_lat: dropoffLatLng.lat,
    dropoff_lng: dropoffLatLng.lng,
    ride_type: "standard",
    vehicle_type: vehicleType,
  };

  apiCall("/rides/estimate/", "POST", payload)
    .then(function (result) {
      updateFareEstimateFromResponse(result);
    })
    .catch(function (err) {
      var km = haversineKm(
        pickupLatLng.lat,
        pickupLatLng.lng,
        dropoffLatLng.lat,
        dropoffLatLng.lng,
      );
      updateFareEstimateFromKm(km);
    });
}

function updateFareEstimateFromResponse(response) {
  var container = document.getElementById("fareEstimateContainer");
  var changeContainer = document.getElementById("changeLocationContainer");
  var fareVal = document.getElementById("fareValue");
  var fareKm = document.getElementById("fareKm");
  var fareEta = document.getElementById("fareEta");

  // Apply round-trip multiplier if selected
  var distance =
    selectedRideType === "round-trip"
      ? response.distance * 2
      : response.distance;
  var fare =
    selectedRideType === "round-trip" ? response.fare * 2 : response.fare;
  var duration =
    selectedRideType === "round-trip"
      ? Math.ceil(response.duration * 2 * 0.9)
      : response.duration; // Slightly less as return trip can be faster

  if (container) container.classList.remove("hidden");
  if (changeContainer) changeContainer.classList.remove("hidden");
  if (fareVal) fareVal.textContent = "₹ " + fare.toFixed(2);
  if (fareKm) fareKm.textContent = distance.toFixed(1) + " km";
  if (fareEta) fareEta.textContent = duration + " min";
}

function updateFareEstimateFromKm(km) {
  var f = calcFare(km);
  var container = document.getElementById("fareEstimateContainer");
  var changeContainer = document.getElementById("changeLocationContainer");
  var fareVal = document.getElementById("fareValue");
  var fareKm = document.getElementById("fareKm");
  var fareEta = document.getElementById("fareEta");

  // Calculate time based on actual km with traffic multiplier
  var multiplier = getTrafficMultiplier();
  var timeMinutes = Math.ceil((f.km / DRIVER_SPEED_KMH) * 60 * multiplier);

  if (container) container.classList.remove("hidden");
  if (changeContainer) changeContainer.classList.remove("hidden");
  if (fareVal) fareVal.textContent = "₹ " + f.total.toFixed(2);
  if (fareKm) fareKm.textContent = f.km.toFixed(1) + " km";
  if (fareEta) fareEta.textContent = timeMinutes + " min";
}

// ─── Address Search Autocomplete ──────────────────────────────
// placetype → icon mapping
var PLACE_ICONS = {
  restaurant: "🍽️",
  hospital: "🏥",
  school: "🏫",
  hotel: "🏨",
  airport: "✈️",
  bus_stop: "🚌",
  train_station: "🚉",
  railway_station: "🚉",
  mall: "🛍️",
  shop: "🛒",
  bank: "🏦",
  park: "🌳",
  default: "📌",
};

function getPlaceIcon(result) {
  var type = (result.type || "").toLowerCase();
  var cls = (result.class || "").toLowerCase();
  var name = (result.display_name || "").toLowerCase();

  if (cls === "aeroway" || name.indexOf("airport") !== -1) return "✈️";
  if (cls === "railway" || name.indexOf("station") !== -1) return "🚉";
  if (name.indexOf("hospital") !== -1 || name.indexOf("clinic") !== -1)
    return "🏥";
  if (name.indexOf("hotel") !== -1 || name.indexOf("inn") !== -1) return "🏨";
  if (name.indexOf("school") !== -1 || name.indexOf("college") !== -1)
    return "🏫";
  if (name.indexOf("mall") !== -1 || name.indexOf("market") !== -1) return "🛍️";
  if (name.indexOf("bank") !== -1 || name.indexOf("atm") !== -1) return "🏦";
  if (name.indexOf("park") !== -1 || name.indexOf("garden") !== -1) return "🌳";
  if (cls === "highway" || type === "residential" || type === "road")
    return "🛣️";
  return "📌";
}

function showSuggestList(listId, items) {
  var listEl = document.getElementById(listId);
  if (!listEl) return;

  if (!items || items.length === 0) {
    listEl.style.display = "none";
    listEl.innerHTML = "";
    return;
  }

  var html = "";
  items.forEach(function (r, idx) {
    var icon = getPlaceIcon(r);
    // Split address: first part (name) vs rest (area)
    var parts = r.display_name.split(",");
    var mainName = parts[0].trim();
    var subName = parts.slice(1, 3).join(",").trim();

    html +=
      '<li class="suggest-item" data-idx="' +
      idx +
      '">' +
      '<span class="suggest-icon">' +
      icon +
      "</span>" +
      '<div class="suggest-text">' +
      '<div class="suggest-main">' +
      mainName +
      "</div>" +
      (subName ? '<div class="suggest-sub">' + subName + "</div>" : "") +
      "</div>" +
      "</li>";
  });

  listEl.innerHTML = html;
  listEl.style.display = "block";

  // Attach click handlers
  var lis = listEl.querySelectorAll("li");
  lis.forEach(function (li) {
    li.onclick = function () {
      var idx = parseInt(li.getAttribute("data-idx"));
      var result = items[idx];
      var lat = parseFloat(result.lat);
      var lng = parseFloat(result.lon);
      var inputId = listId === "pickupSuggest" ? "pickupInput" : "dropoffInput";
      var inputEl = document.getElementById(inputId);
      if (inputEl) inputEl.value = result.display_name;
      listEl.style.display = "none";
      listEl.innerHTML = "";
      if (listId === "pickupSuggest") {
        setPickupOnMap(lat, lng, true);
      } else {
        setDropoffOnMap(lat, lng);
      }
    };
  });
}

function onLocationInput(type) {
  clearTimeout(searchTimeout);
  var inputId = type === "pickup" ? "pickupInput" : "dropoffInput";
  var listId = type === "pickup" ? "pickupSuggest" : "dropoffSuggest";
  var query = (document.getElementById(inputId) || {}).value || "";
  var listEl = document.getElementById(listId);

  if (query.length < 2) {
    if (listEl) {
      listEl.style.display = "none";
      listEl.innerHTML = "";
    }
    return;
  }

  // Show loading indicator immediately
  if (listEl) {
    listEl.innerHTML =
      '<li class="suggest-item" style="color:#a1a1aa;font-size:0.8rem">🔍 Searching...</li>';
    listEl.style.display = "block";
  }

  searchTimeout = setTimeout(function () {
    // Always restrict to India (countrycodes=in)
    // For dropoff: add a soft viewbox bias near pickup (bounded=0 means
    // results outside the box are still allowed, just deprioritised)
    var extraParams = "&countrycodes=in";

    if (pickupLatLng && type === "dropoff") {
      var d = 3; // ~3 degree box — roughly 300km radius
      extraParams +=
        "&viewbox=" +
        (pickupLatLng.lng - d) +
        "," +
        (pickupLatLng.lat + d) +
        "," +
        (pickupLatLng.lng + d) +
        "," +
        (pickupLatLng.lat - d) +
        "&bounded=0"; // bounded=0 → bias, not restrict
    }

    var url =
      "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&dedupe=1&q=" +
      encodeURIComponent(query) +
      extraParams;

    fetch(url, { headers: { "Accept-Language": "en" } })
      .then(function (r) {
        return r.json();
      })
      .then(function (results) {
        showSuggestList(listId, results);
      })
      .catch(function () {
        if (listEl) {
          listEl.innerHTML =
            '<li class="suggest-item" style="color:#ef4444;font-size:0.8rem">⚠️ Search failed. Check internet.</li>';
          listEl.style.display = "block";
        }
      });
  }, 350);
}

// ─── Book Ride with Map Coords ────────────────────────────────
async function bookRideFromMap() {
  var pickupInput = (document.getElementById("pickupInput") || {}).value || "";
  var dropoffInput =
    (document.getElementById("dropoffInput") || {}).value || "";
  var msgEl = document.getElementById("bookingMsg");

  if (!pickupInput || !dropoffInput) {
    if (msgEl) {
      msgEl.textContent = "Please set both pickup and drop-off locations.";
      msgEl.className = "p-4 rounded-xl font-bold bg-red-100 text-red-600";
      msgEl.classList.remove("hidden");
    }
    return;
  }

  // ── Global Balance Check ──
  var balanceEl = document.getElementById("dashWalletBalance");
  if (balanceEl) {
    var balText = balanceEl.textContent.replace(/[^\d.-]/g, "");
    var balance = parseFloat(balText || "0");
    if (balance < 0) {
      if (msgEl) {
        msgEl.textContent = "Please adjust wallet balance before booking ride.";
        msgEl.className =
          "p-4 rounded-xl font-bold bg-amber-100 text-amber-700 border border-amber-200";
        msgEl.classList.remove("hidden");
      }
      showToast("Negative wallet balance. Please top up.", "error");
      return;
    }
  }

  try {
    var vehicleType = document.getElementById("vehicleType").value;
    var passengers = document.getElementById("passengers").value;

    // Get payment method
    var paymentRadio = document.querySelector(
      'input[name="paymentMethod"]:checked',
    );
    var paymentMethod = paymentRadio ? paymentRadio.value : "wallet";

    // Get return time for round-trip
    var returnTime = null;
    if (selectedRideType === "round-trip") {
      var returnTimeEl = document.getElementById("returnTime");
      returnTime = returnTimeEl ? returnTimeEl.value : null;
      if (!returnTime) {
        if (msgEl) {
          msgEl.textContent = "Please set a return time for round-trip.";
          msgEl.className = "p-4 rounded-xl font-bold bg-red-100 text-red-600";
          msgEl.classList.remove("hidden");
        }
        return;
      }
    }

    var payload = {
      pickup: pickupInput,
      dropoff: dropoffInput,
      pickup_lat: pickupLatLng ? pickupLatLng.lat : null,
      pickup_lng: pickupLatLng ? pickupLatLng.lng : null,
      dropoff_lat: dropoffLatLng ? dropoffLatLng.lat : null,
      dropoff_lng: dropoffLatLng ? dropoffLatLng.lng : null,
      ride_type: "standard",
      vehicle_type: vehicleType,
      passengers: parseInt(passengers),
      payment_method: paymentMethod,
      trip_type: selectedRideType,
      return_time: returnTime,
    };

    if (msgEl) {
      msgEl.textContent = "🚕 Booking ride...";
      msgEl.className = "p-4 rounded-xl font-bold bg-blue-100 text-blue-600";
      msgEl.classList.remove("hidden");
    }

    var result = await apiCall("/rides/book/", "POST", payload);

    // Cache ride data locally for UI speed
    var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");
    rides.unshift(result.ride);
    localStorage.setItem("icab_rides", JSON.stringify(rides));

    if (msgEl) {
      msgEl.textContent = "✅ Ride booked! Finding your driver...";
      msgEl.className = "p-4 rounded-xl font-bold bg-green-100 text-green-700";
    }

    setTimeout(function () {
      window.location.href = "booking-detail.html?id=" + result.ride.id;
    }, 1500);
  } catch (err) {
    if (msgEl) {
      var errMsg = err.data && err.data.error ? err.data.error : "Try again";
      msgEl.textContent = "Booking failed: " + errMsg;
      msgEl.className = "p-4 rounded-xl font-bold bg-red-100 text-red-600";
      msgEl.classList.remove("hidden");
    }
    showToast("Error booking ride. Please try again.", "error");
  }
}

// ─── Ride Type & Vehicle Selection ───────────────────────────
var selectedRideType = "one-way";

function selectRideType(type) {
  selectedRideType = type;

  var oneWayBtn = document.getElementById("rideTypeOneWay");
  var roundTripBtn = document.getElementById("rideTypeRoundTrip");

  if (type === "one-way") {
    if (oneWayBtn) {
      oneWayBtn.classList.remove(
        "bg-white",
        "border-gray-300",
        "text-gray-700",
        "dark:bg-zinc-900",
        "dark:border-gray-600",
        "dark:text-gray-400",
      );
      oneWayBtn.classList.add(
        "bg-yellow-100",
        "border-yellow-400",
        "text-gray-900",
        "dark:bg-zinc-900",
        "dark:border-yellow-500",
        "dark:text-yellow-300",
      );
    }
    if (roundTripBtn) {
      roundTripBtn.classList.remove(
        "bg-yellow-100",
        "border-yellow-400",
        "text-gray-900",
        "dark:bg-zinc-900",
        "dark:border-yellow-500",
        "dark:text-yellow-300",
      );
      roundTripBtn.classList.add(
        "bg-white",
        "border-gray-300",
        "text-gray-700",
        "dark:bg-zinc-900",
        "dark:border-gray-600",
        "dark:text-gray-400",
      );
    }
  } else {
    if (roundTripBtn) {
      roundTripBtn.classList.remove(
        "bg-white",
        "border-gray-300",
        "text-gray-700",
        "dark:bg-zinc-900",
        "dark:border-gray-600",
        "dark:text-gray-400",
      );
      roundTripBtn.classList.add(
        "bg-yellow-100",
        "border-yellow-400",
        "text-gray-900",
        "dark:bg-zinc-900",
        "dark:border-yellow-500",
        "dark:text-yellow-300",
      );
    }
    if (oneWayBtn) {
      oneWayBtn.classList.remove(
        "bg-yellow-100",
        "border-yellow-400",
        "text-gray-900",
        "dark:bg-zinc-900",
        "dark:border-yellow-500",
        "dark:text-yellow-300",
      );
      oneWayBtn.classList.add(
        "bg-white",
        "border-gray-300",
        "text-gray-700",
        "dark:bg-zinc-900",
        "dark:border-gray-600",
        "dark:text-gray-400",
      );
    }
  }

  // Toggle return time picker
  var returnContainer = document.getElementById("returnTimeContainer");
  if (returnContainer) {
    if (type === "round-trip") {
      returnContainer.classList.remove("hidden");
    } else {
      returnContainer.classList.add("hidden");
    }
  }

  // Recalculate fare when trip type changes
  updateFareEstimate();
}

// ─── Payment Method Selection ─────────────────────────────────
function updatePaymentSelection() {
  var labels = document.querySelectorAll(
    'label:has(input[name="paymentMethod"])',
  );
  labels.forEach(function (label) {
    var radio = label.querySelector('input[type="radio"]');
    if (radio && radio.checked) {
      label.className =
        "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition font-semibold text-sm bg-yellow-100 border-yellow-400 text-gray-900 dark:bg-zinc-900 dark:border-yellow-500 dark:text-yellow-300";
    } else {
      label.className =
        "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition font-semibold text-sm bg-white border-gray-300 text-gray-700 dark:bg-zinc-900 dark:border-gray-600 dark:text-gray-400";
    }
  });
}

function updatePassengerLimit() {
  var vehicleType = document.getElementById("vehicleType").value;
  var passengerSelect = document.getElementById("passengers");

  if (!passengerSelect) return;

  // Clear current options
  passengerSelect.innerHTML = "";

  var maxPassengers = 3; // Default

  switch (vehicleType) {
    case "hatchback":
      maxPassengers = 3;
      break;
    case "sedan":
      maxPassengers = 3;
      break;
    case "suv":
      maxPassengers = 4;
      break;
    case "suv-muv":
      maxPassengers = 5;
      break;
    case "muv":
      maxPassengers = 4;
      break;
  }

  // Add passenger options
  for (var i = 1; i <= maxPassengers; i++) {
    var option = document.createElement("option");
    option.value = i;
    option.textContent = i + (i === 1 ? " Passenger" : " Passengers");
    if (i === 1) option.selected = true;
    passengerSelect.appendChild(option);
  }
}

// ─── Location Modification Functions ──────────────────────────
function clearPickupLocation() {
  pickupLatLng = null;
  if (pickupMarker) pickupMarker.remove();
  var pickupInput = document.getElementById("pickupInput");
  if (pickupInput) pickupInput.value = "";
  updateFareEstimate();
  drawRoute();
  showToast("Tap the map to set new pickup location", "info");
}

function clearDropoffLocation() {
  dropoffLatLng = null;
  if (dropoffMarker) dropoffMarker.remove();
  var dropoffInput = document.getElementById("dropoffInput");
  if (dropoffInput) dropoffInput.value = "";
  updateFareEstimate();
  drawRoute();
  showToast("Tap the map to set new drop-off location", "info");
}

function swapLocations() {
  if (!pickupLatLng || !dropoffLatLng) {
    showToast("Both locations must be set to swap", "error");
    return;
  }

  // Swap coordinates
  var temp = pickupLatLng;
  pickupLatLng = dropoffLatLng;
  dropoffLatLng = temp;

  // Swap input values
  var pickupInput = document.getElementById("pickupInput");
  var dropoffInput = document.getElementById("dropoffInput");
  var tempInput = pickupInput ? pickupInput.value : "";

  if (pickupInput && dropoffInput) {
    pickupInput.value = dropoffInput.value;
    dropoffInput.value = tempInput;
  }

  // Move markers to new positions
  if (pickupMarker) {
    pickupMarker.setLatLng([pickupLatLng.lat, pickupLatLng.lng]);
  }
  if (dropoffMarker) {
    dropoffMarker.setLatLng([dropoffLatLng.lat, dropoffLatLng.lng]);
  }

  // Recalculate and redraw
  updateFareEstimate();
  drawRoute();
  showToast("Locations swapped!", "success");
}

// ─────────────────────────────────────────────────────────────
//  TRACKING MAP (Booking Detail Page)
// ─────────────────────────────────────────────────────────────

function initTrackingMap(ride) {
  if (trackingMap) {
    trackingMap.remove();
    trackingMap = null;
  }
  if (driverInterval) {
    clearInterval(driverInterval);
    driverInterval = null;
  }

  var hasCoords = ride.pickupLat && ride.dropoffLat;
  var center = hasCoords
    ? [ride.pickupLat, ride.pickupLng]
    : [22.2587, 71.1924]; // Gujarat Center

  var gujaratBounds = [
    [20.0553, 68.1428], // Southwest
    [24.7136, 74.3587], // Northeast
  ];

  trackingMap = L.map("trackingMap", {
    zoomControl: true,
    maxBounds: gujaratBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 6,
  }).setView(center, hasCoords ? 13 : 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(trackingMap);

  // Auto-fit bounds on load
  setTimeout(function () {
    if (trackingMap) {
      trackingMap.invalidateSize();
      if (!hasCoords) {
        trackingMap.fitBounds(gujaratBounds);
      }
    }
  }, 100);

  if (!hasCoords) return;

  // Draw pickup & dropoff pins
  L.marker([ride.pickupLat, ride.pickupLng], { icon: makeIcon("📍", 36) })
    .addTo(trackingMap)
    .bindPopup("<b>Your Pickup</b><br>" + ride.pickup);

  L.marker([ride.dropoffLat, ride.dropoffLng], { icon: makeIcon("🏁", 36) })
    .addTo(trackingMap)
    .bindPopup("<b>Drop-off</b><br>" + ride.dropoff);

  // Draw route
  var url =
    "https://router.project-osrm.org/route/v1/driving/" +
    ride.pickupLng +
    "," +
    ride.pickupLat +
    ";" +
    ride.dropoffLng +
    "," +
    ride.dropoffLat +
    "?overview=full&geometries=geojson";

  fetch(url)
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data.routes && data.routes[0]) {
        var coords = data.routes[0].geometry.coordinates.map(function (c) {
          return [c[1], c[0]];
        });
        L.polyline(coords, { color: "#eab308", weight: 5, opacity: 0.8 }).addTo(
          trackingMap,
        );
        trackingMap.fitBounds(L.polyline(coords).getBounds(), {
          padding: [50, 50],
        });
      }
    })
    .catch(function () {
      L.polyline(
        [
          [ride.pickupLat, ride.pickupLng],
          [ride.dropoffLat, ride.dropoffLng],
        ],
        { color: "#eab308", weight: 4, dashArray: "8, 6" },
      ).addTo(trackingMap);
    });

  // Place driver marker
  var dLat = ride.driverLat || ride.pickupLat + (Math.random() - 0.5) * 0.02;
  var dLng = ride.driverLng || ride.pickupLng + (Math.random() - 0.5) * 0.02;
  driverLatLng = { lat: dLat, lng: dLng };
  driverMarker = L.marker([dLat, dLng], { icon: makeIcon("🚖", 38) })
    .addTo(trackingMap)
    .bindPopup("<b>" + ride.driverName + "</b><br>On the way to you...");

  // Start simulated movement if ride is pending/accepted/in_progress
  if (ride.status === "pending" || ride.status === "accepted") {
    startDriverMovement(ride, "pickup");
  } else if (ride.status === "in_progress") {
    startDriverMovement(ride, "dropoff");
  }
}

// Move driver icon step by step toward a target
function startDriverMovement(ride, target) {
  if (driverInterval) clearInterval(driverInterval);

  var targetLat = target === "pickup" ? ride.pickupLat : ride.dropoffLat;
  var targetLng = target === "pickup" ? ride.pickupLng : ride.dropoffLng;

  driverInterval = setInterval(function () {
    if (!driverLatLng) {
      clearInterval(driverInterval);
      return;
    }

    var dLat = driverLatLng.lat;
    var dLng = driverLatLng.lng;
    var dist = haversineKm(dLat, dLng, targetLat, targetLng);

    if (dist < 0.05) {
      // Reached target
      clearInterval(driverInterval);
      driverMarker.setLatLng([targetLat, targetLng]);
      driverLatLng = { lat: targetLat, lng: targetLng };

      if (target === "pickup") {
        updateRideStatus(ride.id, "in_progress");
        showToast("🚖 Driver has arrived at pickup!", "success");
        startDriverMovement(ride, "dropoff");
      } else {
        updateRideStatus(ride.id, "completed");
        showToast("✅ Ride completed! Rate your driver.", "success");
        setTimeout(function () {
          location.reload();
        }, 1500);
      }
      return;
    }

    // Move 8% of the way toward target each step
    var step = 0.08;
    var newLat = dLat + (targetLat - dLat) * step;
    var newLng = dLng + (targetLng - dLng) * step;
    driverLatLng = { lat: newLat, lng: newLng };

    if (driverMarker) driverMarker.setLatLng([newLat, newLng]);

    // Update save driver position in localStorage
    saveDriverPosition(ride.id, newLat, newLng);

    // Update ETA display
    var etaMin = Math.ceil((dist / DRIVER_SPEED_KMH) * 60);
    var etaEl = document.getElementById("driverETA");
    if (etaEl) etaEl.textContent = etaMin + " min away";

    // Update status steps
    updateStatusSteps(
      ride.status === "in_progress" ? "in_progress" : "accepted",
    );
  }, 2000); // every 2 seconds
}

// Persist updated driver position
function saveDriverPosition(rideId, lat, lng) {
  var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");
  var idx = rides.findIndex(function (r) {
    return r.id == rideId;
  });
  if (idx !== -1) {
    rides[idx].driverLat = lat;
    rides[idx].driverLng = lng;
    localStorage.setItem("icab_rides", JSON.stringify(rides));
  }
}

// Update ride status in localStorage
function updateRideStatus(rideId, newStatus) {
  var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");
  var idx = rides.findIndex(function (r) {
    return r.id == rideId;
  });
  if (idx !== -1) {
    rides[idx].status = newStatus;
    localStorage.setItem("icab_rides", JSON.stringify(rides));
  }
}

// Update the visual status steps on booking-detail
function updateStatusSteps(currentStatus) {
  var statuses = ["pending", "accepted", "in_progress", "completed"];
  var currentIdx = statuses.indexOf(currentStatus);
  statuses.forEach(function (s, i) {
    var dot = document.getElementById("step-" + s);
    var line = document.getElementById("line-" + i);
    if (dot) {
      dot.classList.remove("active", "done");
      if (i < currentIdx) dot.classList.add("done");
      if (i === currentIdx) dot.classList.add("active");
    }
    if (line) {
      line.classList.toggle("done", i < currentIdx);
    }
  });
}

// ─── Autofill Saved Locations ────────────────────────────────
