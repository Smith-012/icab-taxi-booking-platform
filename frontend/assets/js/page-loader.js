/**
 * page-loader.js  ·  iCab Front-Facing Taxi Loader
 * Only used on index.html (landing page).
 * Shows for exactly 3 seconds on every load / refresh.
 */

(function () {
  var MIN_MS = 3000;
  var startTime = Date.now();

  /* ── 0. Check if loader already shown this session ───── */
  var sessionKey = "icabLoaderShown";
  if (sessionStorage.getItem(sessionKey)) {
    // Already shown, just ensure we don't block content
    document.documentElement.classList.remove("icab-loading");
    return;
  }

  /* ── 1. Immediately hide body content (no flash) ─────── */
  document.documentElement.classList.add("icab-loading");

  var blockStyle = document.createElement("style");
  blockStyle.id = "icab-block-style";
  blockStyle.textContent =
    "html.icab-loading body>*:not(#icab-page-loader){visibility:hidden;pointer-events:none}" +
    "#icab-page-loader{position:fixed;inset:0;background:linear-gradient(160deg,#080b14 0%,#0f172a 55%,#0d1b35 100%);z-index:9999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;transition:opacity .55s ease,visibility .55s ease}" +
    "#icab-page-loader.loader-hiding{opacity:0;visibility:hidden}";
  document.head.appendChild(blockStyle);

  /* ── 2. Inject animation CSS ─────────────────────────── */
  var cssLink = document.createElement("link");
  cssLink.rel = "stylesheet";
  cssLink.href = "assets/css/page-loader.css";
  document.head.appendChild(cssLink);

  /* ── 3. Build loader markup ─────────────────────────── */
  function buildLoader() {
    /* Rain drops */
    var rainHTML = "";
    for (var i = 0; i < 34; i++) {
      var lft = Math.random() * 100;
      var del = Math.random() * 2;
      var dur = 0.5 + Math.random() * 0.7;
      rainHTML +=
        '<div class="rain-drop" style="left:' +
        lft.toFixed(1) +
        "%;animation-duration:" +
        dur.toFixed(2) +
        "s;animation-delay:" +
        del.toFixed(2) +
        's"></div>';
    }

    var el = document.createElement("div");
    el.id = "icab-page-loader";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "Loading iCab");

    el.innerHTML = [
      /* ── Rain layer ──────────────────────────────────── */
      '<div class="loader-rain">' + rainHTML + "</div>",

      /* ── Front-facing Taxi SVG ───────────────────────── */
      '<div class="loader-taxi-wrap">',
      '<svg class="loader-taxi-svg" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">',
      /* Ground Shadow */
      '<ellipse cx="200" cy="280" rx="140" ry="10" fill="rgba(0,0,0,0.3)"/>',

      /* Tires */
      '<rect x="65" y="230" width="45" height="40" rx="8" fill="#1a1a1a"/>',
      '<rect x="290" y="230" width="45" height="40" rx="8" fill="#1a1a1a"/>',

      /* Main Lower Body */
      '<path d="M40,160 Q40,140 60,140 L340,140 Q360,140 360,160 L360,240 Q360,250 350,250 L50,250 Q40,250 40,240 Z" fill="#facc15"/>',

      /* Hood Line */
      '<path d="M60,140 Q200,130 340,140" stroke="#ca8a04" stroke-width="1.5" fill="none"/>',

      /* Upper Cabin */
      '<path d="M85,140 L110,65 Q115,50 140,48 L260,48 Q285,50 290,65 L315,140 Z" fill="#facc15"/>',

      /* Windshield */
      '<path d="M100,135 L125,70 Q130,58 145,58 L255,58 Q270,58 275,70 L300,135 Z" fill="#e0f2fe" opacity="0.9"/>',
      /* Reflection */
      '<path d="M115,130 L135,75 Q140,65 155,65 L200,65 L200,130 Z" fill="rgba(255,255,255,0.2)"/>',

      /* Front Grille */
      '<rect x="130" y="170" width="140" height="45" rx="12" fill="#1f2937" stroke="#374151" stroke-width="2"/>',
      '<path d="M140,185 L260,185 M140,200 L260,200" stroke="#374151" stroke-width="1"/>',
      /* Grille Logo */
      '<circle cx="200" cy="192" r="8" fill="#e5e7eb"/>',

      /* Headlights */
      '<path d="M55,160 Q75,150 105,160 L105,200 Q75,210 55,200 Z" fill="#ffffff" stroke="#9ca3af" stroke-width="1"/>',
      '<circle cx="80" cy="180" r="10" fill="#fef9c3"/>',
      '<path d="M345,160 Q325,150 295,160 L295,200 Q325,210 345,200 Z" fill="#ffffff" stroke="#9ca3af" stroke-width="1"/>',
      '<circle cx="320" cy="180" r="10" fill="#fef9c3"/>',

      /* Lower Fog Lights / Vents */
      '<path d="M50,225 L110,225 L105,240 L55,240 Z" fill="#111827"/>',
      '<path d="M350,225 L290,225 L295,240 L345,240 Z" fill="#111827"/>',
      '<circle cx="65" cy="232" r="4" fill="#fef9c3" opacity="0.8"/>',
      '<circle cx="335" cy="232" r="4" fill="#fef9c3" opacity="0.8"/>',

      /* Side Mirrors */
      '<path d="M85,100 Q65,100 65,115 L65,120 Q65,130 85,130 Z" fill="#facc15" stroke="#ca8a04" stroke-width="1"/>',
      '<path d="M315,100 Q335,100 335,115 L335,120 Q335,130 315,130 Z" fill="#facc15" stroke="#ca8a04" stroke-width="1"/>',

      /* TAXI Sign */
      '<rect x="160" y="25" width="80" height="25" rx="5" fill="#facc15" stroke="#ca8a04" stroke-width="2"/>',
      '<text x="200" y="42" text-anchor="middle" font-size="12" font-weight="900" fill="#422006" font-family="Arial, sans-serif">TAXI</text>',

      /* License Plate */
      '<rect x="160" y="225" width="80" height="18" rx="2" fill="#fff" stroke="#9ca3af" stroke-width="1"/>',
      '<text x="200" y="238" text-anchor="middle" font-size="8" fill="#1f2937" font-weight="bold">ICAB 2026</text>',

      /* Wipers (Vipers) - Unified Sweep to Left */
      '<g class="wipers-group">',
      /* Left Wiper */
      '<line x1="140" y1="130" x2="190" y2="130" class="wiper-arm-left" stroke="#1f2937" stroke-width="3" stroke-linecap="round"/>',
      /* Right Wiper */
      '<line x1="260" y1="130" x2="210" y2="130" class="wiper-arm-right" stroke="#1f2937" stroke-width="3" stroke-linecap="round"/>',
      "</g>",

      "</svg>",
      "</div>",

      /* ── Brand ───────────────────────────────────────── */
      '<div class="loader-brand">',
      '<div class="loader-brand-title"><span class="i-yellow">i</span><span class="cab-white">Cab</span></div>',
      '<div class="loader-brand-sub">Your Ride, Your Way</div>',
      "</div>",

      /* ── Progress bar ─────────────────────────────────── */
      '<div class="loader-bar-wrap">',
      '<div class="loader-bar-inner" id="icab-loader-bar"></div>',
      "</div>",

      /* ── Status text ──────────────────────────────────── */
      '<div class="loader-text" id="icab-loader-text">Starting engine...</div>',
    ].join("");

    return el;
  }

  /* ── 4. Insert loader, start timers ─────────────────── */
  function initLoader() {
    var loader = buildLoader();
    document.body.insertBefore(loader, document.body.firstChild);

    /* Start progress bar fill */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var bar = document.getElementById("icab-loader-bar");
        if (bar) bar.style.width = "100%";
      });
    });

    /* Cycle messages */
    var messages = [
      "Starting engine...",
      "Warming up the taxi...",
      "Cleaning the windshield...",
      "Almost there...",
      "Ready to roll! 🚕",
    ];
    var msgIdx = 0;
    var msgEl = document.getElementById("icab-loader-text");
    var msgTimer = setInterval(function () {
      msgIdx++;
      if (msgIdx < messages.length && msgEl) {
        msgEl.textContent = messages[msgIdx];
      } else {
        clearInterval(msgTimer);
      }
    }, 600);

    /* Set flag so it doesn't show again this session */
    sessionStorage.setItem(sessionKey, "true");

    /* Hide exactly 3 s from script start */
    var elapsed = Date.now() - startTime;
    var remain = Math.max(0, MIN_MS - elapsed);

    setTimeout(function () {
      clearInterval(msgTimer);
      if (msgEl) msgEl.textContent = "Ready to roll! 🚕";

      setTimeout(function () {
        loader.classList.add("loader-hiding");
        setTimeout(function () {
          document.documentElement.classList.remove("icab-loading");
          document.body.classList.remove("icab-page-hidden");
          document.body.classList.add("page-transition-active");

          // Fix modal positioning after animation
          setTimeout(function () {
            document.body.classList.remove("page-transition-active");
          }, 700);

          if (loader.parentNode) loader.parentNode.removeChild(loader);
          var bs = document.getElementById("icab-block-style");
          if (bs && bs.parentNode) bs.parentNode.removeChild(bs);
        }, 600);
      }, 250);
    }, remain);
  }

  if (document.body) {
    initLoader();
  } else {
    document.addEventListener("DOMContentLoaded", initLoader);
  }
})();
