/**
 * driver-wallet.js — iCab Driver Wallet & Earnings Logic (Verification Sync)
 */

var walletCache = {
  balance: 0,
  transactions: [],
  total_earnings: 0,
  is_frozen: false,
  has_pin: false,
};

var authAmount = 0;
var authMethod = "upi";
var authType = "add"; // "add" or "withdraw"

var paymentCredentials = {
  upi: { id: "icabdriver@upi", pin: "000000" },
  card: { name: "Icab Driver", number: "1234567812345678", cvv: "123" },
};

// PIN Workflow State
var pinWorkflowStep = "set"; 
var tempNewPin = "";
var pendingAction = null;
var lastVerifiedPin = "";

// ─── Init ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  var userId = localStorage.getItem("icab_user_id");
  var role = localStorage.getItem("icab_user_role");

  if (!userId || role !== "driver") {
    window.location.href = "index.html";
    return;
  }

  loadDriverWalletFromAPI();
});

// ─── Load Driver Wallet from API ─────────────────────────────
function loadDriverWalletFromAPI() {
  apiCall("/driver/wallet/", "GET")
    .then(function (response) {
      walletCache.balance = parseFloat(response.balance || 0);
      walletCache.transactions = response.transactions || [];
      walletCache.is_frozen = response.is_frozen || false;
      walletCache.has_pin = response.has_pin || false;

      renderBalance();
      renderTransactions(walletCache.transactions);
      loadFreezeState();
      loadPinStatus();

      return apiCall("/driver/stats/", "GET");
    })
    .then(function (stats) {
      walletCache.total_earnings = parseFloat(stats.total_earnings || 0);
      document.getElementById("totalLifetimeEarnings").textContent =
        walletCache.total_earnings.toFixed(2);
      document.getElementById("totalRidesCount").textContent =
        stats.total_rides || 0;

      renderEarningsChart(walletCache.transactions);
    })
    .catch(function (error) {
      console.error("Error loading driver wallet:", error);
      showToast("Failed to load earnings data.", "error");
    });
}

// ─── Render Balance ───────────────────────────────────────
function renderBalance() {
  var el = document.getElementById("walletBalance");
  if (el) el.textContent = walletCache.balance.toFixed(2);
}

// ─── Add Money UI Helpers ──────────────────────────────────
function setAmount(amt) {
  var input = document.getElementById("addAmount");
  if (input) input.value = amt;
}

function updatePills(method) {
  ["upi", "card"].forEach(function (m) {
    var pill = document.getElementById("pill-" + m);
    if (pill) {
      if (m === method) pill.classList.add("selected");
      else pill.classList.remove("selected");
    }
  });
}

// ─── Add Money ──────────────────────────────────
function addMoney() {
  if (walletCache.is_frozen) {
    showToast("Wallet is frozen. Unfreeze it first.", "error");
    return;
  }

  var amountInput = document.getElementById("addAmount");
  var amount = parseFloat(amountInput.value);

  if (!amount || amount <= 0) {
    showToast("Please enter a valid amount.", "error");
    return;
  }

  var method = "upi";
  var radios = document.getElementsByName("payMethod");
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked) {
      method = radios[i].value;
      break;
    }
  }

  openPaymentAuthModal(amount, method, "add");
}

// ─── Withdrawal Workflow ────────────────────────────────────
function initiateWithdraw() {
  if (walletCache.is_frozen) {
    showToast("Wallet is frozen. Unfreeze it first.", "error");
    return;
  }
  if (!walletCache.has_pin) {
    showToast("Please set a Transaction PIN first.", "info");
    openPinModal();
    return;
  }
  if (walletCache.balance < 100) {
    showToast("Minimum withdrawal amount is ₹100.00", "error");
    return;
  }
  document.getElementById("withdrawAmountModal").classList.remove("hidden");
}

function closeWithdrawAmountModal() {
  document.getElementById("withdrawAmountModal").classList.add("hidden");
}

function submitWithdrawAmount() {
  var amountInput = document.getElementById("withdrawAmountInput");
  var amount = parseFloat(amountInput.value);
  if (!amount || amount < 100) {
    showToast("Enter amount (minimum ₹100).", "error");
    return;
  }
  if (amount > walletCache.balance) {
    showToast("Insufficient balance.", "error");
    return;
  }

  closeWithdrawAmountModal();
  // Withdrawals only use UPI in this demo
  openPaymentAuthModal(amount, "upi", "withdraw");
}

// ─── Payment Verification Modal ─────────────────────────────
function openPaymentAuthModal(amount, method, type = "add") {
  authAmount = amount;
  authMethod = method;
  authType = type;

  var modal = document.getElementById("paymentVerifyModal");
  var content = document.getElementById("authContent");
  var title = document.getElementById("authModalTitle");
  var icon = document.getElementById("methodIcon");
  var err = document.getElementById("authError");

  err.classList.add("hidden");
  modal.classList.remove("hidden");

  var html = "";
  if (method === "upi") {
    title.textContent = "Authorize UPI";
    icon.textContent = "📱";
    html = `
      <div class="space-y-3 slide-up">
        <label class="block text-xs font-bold text-zinc-500 uppercase">UPI ID</label>
        <input id="auth_upi_id" type="text" maxlength="25" autocomplete="off" placeholder="driver@upi" class="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-blue-400 font-bold transition">
        
        <label class="block text-xs font-bold text-zinc-500 uppercase">UPI PIN</label>
        <div class="relative">
          <input id="auth_upi_pin" type="password" maxlength="6" autocomplete="off" oninput="this.value = this.value.replace(/[^0-9]/g, '')" placeholder="6-digit PIN" class="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-blue-400 font-bold tracking-[0.5em] text-center transition pr-12">
          <button onclick="toggleAuthVisibility('auth_upi_pin', 'eye_upi')" class="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-blue-500 transition">
            <span id="eye_upi">👁️</span>
          </button>
        </div>
      </div>
    `;
  } else if (method === "card") {
    title.textContent = "Authorize Card";
    icon.textContent = "💳";
    html = `
      <div class="space-y-3 slide-up">
        <label class="block text-xs font-bold text-zinc-500 uppercase">Cardholder Name</label>
        <input id="auth_card_name" type="text" autocomplete="off" oninput="formatAuthCase(this, 25)" placeholder="FULL NAME" class="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-blue-400 font-bold transition">
        
        <label class="block text-xs font-bold text-zinc-500 uppercase">Card Number</label>
        <input id="auth_card_number" type="text" autocomplete="off" oninput="formatAuthCard(this)" placeholder="1234 5678 1234 5678" class="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-blue-400 font-bold transition">
        
        <div class="flex gap-3">
          <div class="flex-1">
             <label class="block text-xs font-bold text-zinc-500 uppercase mb-1">Expiry</label>
             <input type="text" maxlength="5" placeholder="MM/YY" class="w-full px-3 py-2 rounded-lg border dark:bg-zinc-800 dark:border-zinc-700 outline-none focus:ring-2 focus:ring-blue-400 font-bold text-center">
          </div>
          <div class="flex-1">
            <label class="block text-xs font-bold text-zinc-500 uppercase mb-1">CVV</label>
            <div class="relative">
              <input id="auth_card_cvv" type="password" maxlength="3" autocomplete="off" oninput="this.value = this.value.replace(/[^0-9]/g, '')" placeholder="CVV" class="w-full px-3 py-2 rounded-lg border dark:bg-zinc-800 dark:border-zinc-700 outline-none focus:ring-2 focus:ring-blue-400 font-bold text-center pr-8">
              <button onclick="toggleAuthVisibility('auth_card_cvv', 'eye_cvv')" class="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-blue-500 transition">
                <span id="eye_cvv" class="text-xs">👁️</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  content.innerHTML = html;
}

function closePaymentAuthModal() {
  document.getElementById("paymentVerifyModal").classList.add("hidden");
}

function toggleAuthVisibility(inputId, iconId) {
  var input = document.getElementById(inputId);
  var icon = document.getElementById(iconId);
  if (input.type === "password") {
    input.type = "text";
    icon.textContent = "🙈";
  } else {
    input.type = "password";
    icon.textContent = "👁️";
  }
}

function formatAuthCard(el) {
  var val = el.value.replace(/\D/g, "").substring(0, 16);
  var parts = val.match(/.{1,4}/g);
  el.value = parts ? parts.join(" ") : val;
}

function formatAuthCase(el, limit) {
  el.value = el.value.replace(/[^a-zA-Z\s]/g, "").toUpperCase().substring(0, limit);
}

function submitPaymentAuth() {
  var err = document.getElementById("authError");
  var isValid = false;

  if (authMethod === "upi") {
    var id = document.getElementById("auth_upi_id").value;
    var pin = document.getElementById("auth_upi_pin").value;
    if (id === paymentCredentials.upi.id && pin === paymentCredentials.upi.pin) isValid = true;
  } else if (authMethod === "card") {
    var name = document.getElementById("auth_card_name").value;
    var num = document.getElementById("auth_card_number").value.replace(/\s/g, "");
    var cvv = document.getElementById("auth_card_cvv").value;
    if (name === paymentCredentials.card.name && num === paymentCredentials.card.number && cvv === paymentCredentials.card.cvv) isValid = true;
  }

  if (isValid) {
    closePaymentAuthModal();
    if (authType === "withdraw") {
      processWithdrawEarnings();
    } else {
      processAddMoney();
    }
  } else {
    err.textContent = "Verification Failed. Information does not match bank records.";
    err.classList.remove("hidden");
  }
}

function processAddMoney() {
  // If PIN is set, verify it first
  if (walletCache.has_pin) {
    pendingAction = function() { executeAddMoney(); };
    openPinModal();
    document.getElementById("pinModalTitle").textContent = "Authorize Top-up";
    document.getElementById("pinModalDesc").textContent = `Confirm ₹${authAmount.toFixed(2)} transfer with your wallet PIN.`;
  } else {
    executeAddMoney();
  }
}

function executeAddMoney() {
  apiCall("/driver/wallet/add/", "POST", {
    amount: authAmount,
    transaction_method: authMethod,
  })
    .then(function (res) {
      showToast(res.message, "success");
      document.getElementById("addAmount").value = "";
      loadDriverWalletFromAPI();
    })
    .catch(function (err) {
      showToast(err.data?.error || "Top-up failed.", "error");
    });
}

function processWithdrawEarnings() {
  // Always verify PIN for withdrawals
  pendingAction = function() { executeWithdrawMoney(); };
  openPinModal();
  document.getElementById("pinModalTitle").textContent = "Authorize Payout";
  document.getElementById("pinModalDesc").textContent = `Confirm ₹${authAmount.toFixed(2)} withdrawal with your wallet PIN.`;
}

function executeWithdrawMoney() {
  apiCall("/driver/wallet/withdraw/", "POST", {
    amount: authAmount,
    transaction_method: "upi",
  })
  .then(function (res) {
    showToast("Withdrawal successful! Funds will arrive shortly.", "success");
    loadDriverWalletFromAPI();
  })
  .catch(function (err) {
    showToast(err.data?.error || "Withdrawal failed.", "error");
  });
}

// ─── Freeze Logic ───────────────────────────────────────────
function toggleFreeze() {
  if (!walletCache.has_pin) {
    showToast("Please set a Transaction PIN first.", "info");
    openPinModal();
    return;
  }

  pendingAction = function() {
      apiCall("/driver/wallet/freeze/", "POST")
      .then(function (res) {
          walletCache.is_frozen = res.is_frozen;
          loadFreezeState();
          showToast(res.message, res.is_frozen ? "info" : "success");
      })
      .catch(function (err) {
          showToast(err.data?.error || "Failed to update wallet state.", "error");
      });
  };
  openPinModal();
  document.getElementById("pinModalTitle").textContent = "Verify Authority";
  document.getElementById("pinModalDesc").textContent = `Enter PIN to ${walletCache.is_frozen ? "unfreeze" : "freeze"} your account.`;
}

function loadFreezeState() {
  var frozen = walletCache.is_frozen;
  var overlays = document.querySelectorAll(".frozen-overlay");
  var btn = document.getElementById("freezeBtn");
  
  overlays.forEach(function(overlay) {
    if (frozen) overlay.classList.remove("hidden");
    else overlay.classList.add("hidden");
  });
  
  if (btn) {
    btn.textContent = frozen ? "🔓 Unfreeze Wallet" : "❄️ Freeze Wallet";
    if (frozen) {
        btn.classList.add("bg-green-500/10", "text-green-500", "border-green-500/20");
        btn.classList.remove("bg-orange-500/10", "text-orange-500", "border-orange-500/20");
    } else {
        btn.classList.remove("bg-green-500/10", "text-green-500", "border-green-500/20");
        btn.classList.add("bg-orange-500/10", "text-orange-500", "border-orange-500/20");
    }
  }
}

// ─── PIN Management ─────────────────────────────────────────
function openPinModal() {
  clearPinInputs();
  var errEl = document.getElementById("pinError");
  if (errEl) errEl.classList.add("hidden");
  document.getElementById("pinModal").classList.remove("hidden");

  if (walletCache.has_pin) {
    pinWorkflowStep = "verify";
    document.getElementById("pinModalTitle").textContent = "Verify PIN";
    document.getElementById("pinModalDesc").textContent = "Enter your 4-digit Transaction PIN to proceed.";
  } else {
    pinWorkflowStep = "set";
    document.getElementById("pinModalTitle").textContent = "Set Transaction PIN";
    document.getElementById("pinModalDesc").textContent = "Create a 4-digit PIN for secure withdrawals.";
  }
  document.getElementById("digit1").focus();
}

function closePinModal() {
  document.getElementById("pinModal").classList.add("hidden");
  pinWorkflowStep = "set";
  tempNewPin = "";
  pendingAction = null;
  clearPinInputs();
}

function clearPinInputs() {
  ["digit1", "digit2", "digit3", "digit4"].forEach(id => {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function handlePinInput(current, nextId) {
  current.value = current.value.replace(/[^0-9]/g, "");
  if (current.value.length >= 1 && nextId) {
    document.getElementById(nextId).focus();
  }
}

function submitPin() {
  var pin = ["digit1", "digit2", "digit3", "digit4"]
    .map(id => document.getElementById(id).value)
    .join("");
  var errEl = document.getElementById("pinError");

  if (pin.length < 4) {
    errEl.textContent = "Please enter all 4 digits.";
    errEl.classList.remove("hidden");
    return;
  }

  if (pinWorkflowStep === "verify") {
    apiCall("/driver/wallet/verify-pin/", "POST", { pin: pin })
      .then(function () {
        lastVerifiedPin = pin;
        if (pendingAction) {
          var action = pendingAction;
          closePinModal(); 
          action();
        } else {
          // If just changing PIN (not an action like freeze/withdraw)
          pinWorkflowStep = "set";
          clearPinInputs();
          document.getElementById("pinModalTitle").textContent = "Enter New PIN";
          document.getElementById("pinModalDesc").textContent = "Enter your new 4-digit Transaction PIN.";
          document.getElementById("digit1").focus();
        }
      })
      .catch(function (err) {
        clearPinInputs();
        errEl.textContent = err.data?.error || "Incorrect PIN. Try again.";
        errEl.classList.remove("hidden");
        document.getElementById("digit1").focus();
      });
  } else if (pinWorkflowStep === "set") {
    tempNewPin = pin;
    pinWorkflowStep = "confirm";
    clearPinInputs();
    document.getElementById("pinModalTitle").textContent = "Confirm New PIN";
    document.getElementById("pinModalDesc").textContent = "Re-enter your new PIN to confirm.";
    document.getElementById("digit1").focus();
  } else if (pinWorkflowStep === "confirm") {
    if (pin !== tempNewPin) {
      errEl.textContent = "PINs do not match. Start over.";
      errEl.classList.remove("hidden");
      pinWorkflowStep = "set";
      clearPinInputs();
      return;
    }

    apiCall("/driver/wallet/set-pin/", "POST", { pin: pin })
      .then(function () {
        walletCache.has_pin = true;
        closePinModal();
        loadPinStatus();
        showToast("Transaction PIN updated successfully!", "success");
      })
      .catch(function (err) {
        showToast(err.data?.error || "Failed to set PIN.", "error");
      });
  }
}

function loadPinStatus() {
  var btn = document.getElementById("setPinBtn");
  var msg = document.getElementById("pinStatusMsg");
  var badge = document.getElementById("pinBadgeStatus");
  var badgeLegacy = document.getElementById("pinBadge");

  if (walletCache.has_pin) {
    if (btn) btn.textContent = "⚙️ Change Transaction PIN";
    if (msg) msg.textContent = "✅ PIN is Set";
    if (badge) {
        badge.className = "kyc-verified";
        badge.textContent = "Verified";
    }
    if (badgeLegacy) {
        badgeLegacy.className = "kyc-verified text-[10px]";
        badgeLegacy.textContent = "✅ PIN PROTECTED";
    }
  } else {
    if (btn) btn.textContent = "🔑 Set Transaction PIN";
    if (msg) msg.textContent = "⚠ PIN Not Set";
    if (badge) {
        badge.className = "kyc-pending";
        badge.textContent = "Not Set";
    }
  }
}

// ─── Render Transactions ─────────────────────────────────────
function renderTransactions(txns) {
  var el = document.getElementById("transactionList");
  if (!el) return;

  if (!txns || txns.length === 0) {
    el.innerHTML = '<p class="text-center py-10 text-zinc-400">No earnings yet.</p>';
    return;
  }

  var html = "";
  txns.forEach(function (t) {
    var isCredit = t.txn_type === "credit";
    var sign = isCredit ? "+" : "-";
    var amtClass = isCredit ? "text-green-500" : "text-red-500";
    var icon = isCredit ? "💰" : "🏦";
    var date = new Date(t.created_at).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });

    html += `
      <div class="flex items-center justify-between p-3 mb-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-lg">
            ${icon}
          </div>
          <div>
            <p class="text-xs font-bold">${t.description}</p>
            <p class="text-[10px] text-zinc-400">${date}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-sm font-black ${amtClass}">${sign}₹${parseFloat(t.amount || 0).toFixed(2)}</p>
        </div>
      </div>
    `;
  });
  el.innerHTML = html;
}

// ─── Earnings Insights Chart ─────────────────────────────────
function renderEarningsChart(txns) {
  var ctx = document.getElementById("earningsChart");
  if (!ctx || !txns) return;

  var labels = [];
  var data = [];
  var now = new Date();

  for (var i = 6; i >= 0; i--) {
    var d = new Date();
    d.setDate(now.getDate() - i);
    labels.push(d.toLocaleDateString("en-IN", { weekday: "short" }));
    
    var dailySum = 0;
    txns.forEach(function(t) {
        var tDate = new Date(t.created_at);
        if (tDate.toDateString() === d.toDateString() && t.txn_type === "credit") {
            dailySum += parseFloat(t.amount);
        }
    });
    data.push(dailySum);
  }

  if (window.myEarningsChart) window.myEarningsChart.destroy();

  window.myEarningsChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Earnings (₹)",
          data: data,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: "#22c55e",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.05)" } },
        x: { grid: { display: false } },
      },
    },
  });
}
