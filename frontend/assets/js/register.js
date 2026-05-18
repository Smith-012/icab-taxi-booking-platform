/**
 * register.js — Driver Registration: Car Model Autocomplete
 * Shows suggestions only when user types ≥2 chars.
 */

// ─── Indian Car Database ──────────────────────────────────────
var ICAB_CAR_DB = [
  // Maruti Suzuki
  { m: "Maruti Alto K10", cat: "Hatchback" },
  { m: "Maruti Alto 800", cat: "Hatchback" },
  { m: "Maruti WagonR", cat: "Hatchback" },
  { m: "Maruti Swift", cat: "Hatchback" },
  { m: "Maruti Celerio", cat: "Hatchback" },
  { m: "Maruti Ignis", cat: "Hatchback" },
  { m: "Maruti Baleno", cat: "Hatchback" },
  { m: "Maruti Dzire", cat: "Sedan" },
  { m: "Maruti Ciaz", cat: "Sedan" },
  { m: "Maruti Ertiga", cat: "SUV / MUV" },
  { m: "Maruti XL6", cat: "SUV / MUV" },
  { m: "Maruti Brezza", cat: "SUV" },
  { m: "Maruti Grand Vitara", cat: "SUV" },
  // Hyundai
  { m: "Hyundai i10", cat: "Hatchback" },
  { m: "Hyundai Grand i10", cat: "Hatchback" },
  { m: "Hyundai i20", cat: "Hatchback" },
  { m: "Hyundai Aura", cat: "Sedan" },
  { m: "Hyundai Verna", cat: "Sedan" },
  { m: "Hyundai Creta", cat: "SUV" },
  { m: "Hyundai Venue", cat: "SUV" },
  { m: "Hyundai Alcazar", cat: "SUV" },
  { m: "Hyundai Tucson", cat: "SUV" },
  // Tata
  { m: "Tata Nano", cat: "Hatchback" },
  { m: "Tata Tiago", cat: "Hatchback" },
  { m: "Tata Altroz", cat: "Hatchback" },
  { m: "Tata Tigor", cat: "Sedan" },
  { m: "Tata Nexon", cat: "SUV" },
  { m: "Tata Harrier", cat: "SUV" },
  { m: "Tata Safari", cat: "SUV / MUV" },
  { m: "Tata Punch", cat: "SUV" },
  // Honda
  { m: "Honda Brio", cat: "Hatchback" },
  { m: "Honda Jazz", cat: "Hatchback" },
  { m: "Honda Amaze", cat: "Sedan" },
  { m: "Honda City", cat: "Sedan" },
  { m: "Honda Elevate", cat: "SUV" },
  { m: "Honda WR-V", cat: "SUV" },
  // Toyota
  { m: "Toyota Etios", cat: "Sedan" },
  { m: "Toyota Corolla", cat: "Sedan" },
  { m: "Toyota Innova", cat: "SUV / MUV" },
  { m: "Toyota Innova Crysta", cat: "SUV / MUV" },
  { m: "Toyota Fortuner", cat: "SUV" },
  { m: "Toyota Glanza", cat: "Hatchback" },
  { m: "Toyota Urban Cruiser", cat: "SUV" },
  // Kia
  { m: "Kia Seltos", cat: "SUV" },
  { m: "Kia Carens", cat: "SUV / MUV" },
  { m: "Kia Sonet", cat: "SUV" },
  // Mahindra
  { m: "Mahindra Bolero", cat: "SUV / MUV" },
  { m: "Mahindra Scorpio", cat: "SUV" },
  { m: "Mahindra Scorpio N", cat: "SUV" },
  { m: "Mahindra XUV300", cat: "SUV" },
  { m: "Mahindra XUV400", cat: "SUV" },
  { m: "Mahindra XUV700", cat: "SUV" },
  { m: "Mahindra Thar", cat: "SUV" },
  // Renault
  { m: "Renault Kwid", cat: "Hatchback" },
  { m: "Renault Kiger", cat: "SUV" },
  { m: "Renault Triber", cat: "SUV / MUV" },
  // Nissan
  { m: "Nissan Magnite", cat: "SUV" },
  // Volkswagen
  { m: "Volkswagen Polo", cat: "Hatchback" },
  { m: "Volkswagen Vento", cat: "Sedan" },
  { m: "Volkswagen Virtus", cat: "Sedan" },
  { m: "Volkswagen Taigun", cat: "SUV" },
  // Skoda
  { m: "Skoda Slavia", cat: "Sedan" },
  { m: "Skoda Kushaq", cat: "SUV" },
  // MG
  { m: "MG Hector", cat: "SUV" },
  { m: "MG Astor", cat: "SUV" },
  { m: "MG ZS EV", cat: "SUV" },
];

var CAR_CAT_ICONS = {
  Hatchback: "🚗",
  Sedan: "🚕",
  SUV: "🚙",
  "SUV / MUV": "🚙",
};

var CAR_CAT_COLORS = {
  Hatchback: "#22c55e",
  Sedan: "#eab308",
  SUV: "#3b82f6",
  "SUV / MUV": "#8b5cf6",
};

// ─── Filter & render car suggest list ────────────────────────
function filterCarSuggest() {
  var inputEl = document.getElementById("driverVehicle");
  var list = document.getElementById("carSuggestList");
  if (!list || !inputEl) return;

  var query = (inputEl.value || "").trim();

  // Only show when user has typed at least 2 chars
  if (query.length < 2) {
    list.style.display = "none";
    list.innerHTML = "";
    return;
  }

  var q = query.toLowerCase();
  var matches = ICAB_CAR_DB.filter(function (c) {
    return c.m.toLowerCase().indexOf(q) !== -1;
  });

  if (matches.length === 0) {
    list.innerHTML =
      '<li style="padding:12px 16px;font-size:0.82rem;color:#71717a;text-align:center">' +
      '😕 No car found for "<strong>' +
      query +
      '</strong>"</li>';
    list.style.display = "block";
    return;
  }

  // Build rich HTML for each result
  list.innerHTML = matches
    .slice(0, 10)
    .map(function (c) {
      var icon = CAR_CAT_ICONS[c.cat] || "🚗";
      var color = CAR_CAT_COLORS[c.cat] || "#71717a";

      // Highlight the matching part of the model name
      var modelDisplay = c.m.replace(
        new RegExp(
          "(" + query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")",
          "gi",
        ),
        "<mark style='background:#fef08a;color:#713f12;border-radius:2px;padding:0 1px'>$1</mark>",
      );

      return (
        '<li data-model="' +
        c.m.replace(/"/g, "&quot;") +
        '" ' +
        'class="border-b border-gray-100 dark:border-gray-700/50" ' +
        'style="display:flex;align-items:center;gap:12px;padding:10px 14px;' +
        'cursor:pointer;transition:background 0.15s;list-style:none">' +
        // Icon bubble
        '<div class="bg-gray-100 dark:bg-gray-700" style="width:36px;height:36px;border-radius:50%;' +
        "display:flex;align-items:center;justify-content:center;" +
        'font-size:1.1rem;flex-shrink:0">' +
        icon +
        "</div>" +
        // Text block
        '<div style="flex:1;min-width:0;overflow:hidden">' +
        '<div class="text-gray-900 dark:text-gray-100" style="font-size:0.9rem;font-weight:700;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3">' +
        modelDisplay +
        "</div>" +
        '<div style="margin-top:3px">' +
        '<span style="display:inline-block;font-size:0.68rem;font-weight:700;' +
        "color:#fff;background:" +
        color +
        ";border-radius:999px;" +
        'padding:1px 8px;letter-spacing:0.03em">' +
        c.cat +
        "</span>" +
        "</div>" +
        "</div>" +
        // Arrow
        '<span style="font-size:0.75rem;color:#a1a1aa;flex-shrink:0">›</span>' +
        "</li>"
      );
    })
    .join("");

  // Attach click handlers
  var items = list.querySelectorAll("li[data-model]");
  items.forEach(function (li) {
    li.addEventListener("mouseover", function () {
      // Use classes for hover instead of hardcoded styles if possible,
      // but since we are injecting style, let's detect dark mode
      var isDark = document.documentElement.classList.contains("dark");
      li.style.background = isDark ? "rgba(255,255,255,0.05)" : "#fef9c3";
    });
    li.addEventListener("mouseout", function () {
      li.style.background = "";
    });
    li.addEventListener("mousedown", function (e) {
      // use mousedown (fires before blur) so we can fill before list hides
      e.preventDefault();
      selectCar(li.getAttribute("data-model"));
    });
  });

  list.style.display = "block";
}

// ─── Select a Car ─────────────────────────────────────────────
function selectCar(model) {
  var inputEl = document.getElementById("driverVehicle");
  var list = document.getElementById("carSuggestList");
  if (inputEl) inputEl.value = model;
  if (list) {
    list.style.display = "none";
    list.innerHTML = "";
  }
}

// ─── Close on outside click (blur) ────────────────────────────
document.addEventListener("click", function (e) {
  var wrapper = document.getElementById("carSearchWrapper");
  if (wrapper && !wrapper.contains(e.target)) {
    var list = document.getElementById("carSuggestList");
    if (list) {
      list.style.display = "none";
    }
  }
});
