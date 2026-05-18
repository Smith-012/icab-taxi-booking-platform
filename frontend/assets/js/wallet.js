/**
 * wallet.js — iCab Wallet Page Logic
 * API-integrated version with fallback to localStorage
 */

var pinWorkflowStep = "set"; // 'verify' | 'set' | 'confirm'
var tempNewPin = "";
var pendingAction = null;
var walletCache = {
  balance: 0,
  transactions: [],
  has_pin: false,
  is_frozen: false,
};

var authAmount = 0;
var authMethod = "upi";

var paymentCredentials = {
  upi: { id: "icabuser@upi", pin: "123456" },
  card: { name: "Icab User", number: "1234567812345678", cvv: "786" },
};

var lastVerifiedPin = "";
var tempNewPin = "";
var pinWorkflowStep = "set";
var pendingAction = null;

var authAmount = 0;
var authMethod = "upi";
var authType = "add"; // "add" or "withdraw"

// ─── Init ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  var userId = localStorage.getItem("icab_user_id");
  if (!userId) {
    window.location.href = "index.html";
    return;
  }

  initWallet();
  loadWalletFromAPI();

  // Method pill click handling
  document.querySelectorAll(".method-pill").forEach(function (pill) {
    pill.addEventListener("click", function () {
      document.querySelectorAll(".method-pill").forEach(function (p) {
        p.classList.remove("selected");
      });
      pill.classList.add("selected");
    });
  });
});

// ─── Load Wallet from API ─────────────────────────────────
function loadWalletFromAPI() {
  // GET /api/wallet/ - Get wallet balance and info
  apiCall("/wallet/", "GET")
    .then(function (response) {
      walletCache.balance = parseFloat(response.balance || 0);
      walletCache.has_pin = response.has_pin || false;
      walletCache.is_frozen = response.is_frozen || false;

      renderBalance();
      loadFreezeState();
      loadPinStatus();

      // GET /api/wallet/transactions/ - Get transaction history
      return apiCall("/wallet/transactions/", "GET");
    })
    .then(function (response) {
      var rawTxns = Array.isArray(response)
        ? response
        : response.transactions || [];

      // Convert API fields to frontend format
      walletCache.transactions = mapApiTransactions(rawTxns);

      renderTransactions(walletCache.transactions);
      updateSpendingStats(walletCache.transactions);
      renderChart(walletCache.transactions);
      return true;
    })
    .catch(function (error) {
      console.error("Error loading wallet from API:", error);
      loadWalletFromLocalStorage();
    });
}

// ─── Fallback to localStorage ─────────────────────────────
function loadWalletFromLocalStorage() {
  renderBalance();
  renderTransactions();
  updateSpendingStats();
  renderChart();
  loadFreezeState();
  loadPinStatus();
}

// ─── Init wallet if new user ──────────────────────────────
function initWallet() {
  if (!localStorage.getItem("icab_wallet_balance")) {
    localStorage.setItem("icab_wallet_balance", "0");
  }
  if (!localStorage.getItem("icab_wallet_transactions")) {
    localStorage.setItem("icab_wallet_transactions", "[]");
  }
}

// ─── Render Balance ───────────────────────────────────────
function renderBalance() {
  var bal =
    walletCache.balance ||
    parseFloat(localStorage.getItem("icab_wallet_balance") || "0");
  var el = document.getElementById("walletBalance");
  if (el) el.textContent = bal.toFixed(2);
}

// ─── Set Amount from Quick Buttons ────────────────────────
function setAmount(val) {
  var input = document.getElementById("addAmount");
  if (input) input.value = val;
}

// ─── Add Money ────────────────────────────────────────────
function addMoney() {
  // Check if wallet is frozen
  if (walletCache.is_frozen) {
    showToast("Wallet is frozen. Unfreeze first.", "error");
    return;
  }

  var amount = parseFloat(document.getElementById("addAmount").value);
  if (!amount || amount <= 0) {
    showToast("Please enter a valid amount.", "error");
    return;
  }

  var method = document.querySelector('input[name="payMethod"]:checked');
  var methodVal = method ? method.value : "upi";

  openPaymentAuthModal(amount, methodVal);
}

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
      <div class="space-y-3">
        <label class="block text-xs font-bold text-zinc-500 uppercase">UPI ID</label>
        <input id="auth_upi_id" type="text" maxlength="25" autocomplete="off" placeholder="username@upi" class="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-yellow-400 font-bold transition">
        
        <label class="block text-xs font-bold text-zinc-500 uppercase">UPI PIN</label>
        <div class="relative">
          <input id="auth_upi_pin" type="password" maxlength="6" autocomplete="off" oninput="this.value = this.value.replace(/[^0-9]/g, '')" placeholder="6-digit PIN" class="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-yellow-400 font-bold tracking-[0.5em] text-center transition pr-12">
          <button onclick="toggleAuthVisibility('auth_upi_pin', 'eye_upi')" class="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-yellow-500 transition">
            <span id="eye_upi">👁️</span>
          </button>
        </div>
      </div>
    `;
  } else if (method === "card") {
    title.textContent = "Authorize Card";
    icon.textContent = "💳";
    html = `
      <div class="space-y-3">
        <label class="block text-xs font-bold text-zinc-500 uppercase">Cardholder Name</label>
        <input id="auth_card_name" type="text" autocomplete="off" oninput="formatAuthCase(this, 25)" placeholder="FULL NAME" class="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-yellow-400 font-bold transition">
        
        <label class="block text-xs font-bold text-zinc-500 uppercase">Card Number</label>
        <input id="auth_card_number" type="text" autocomplete="off" oninput="formatAuthCard(this)" placeholder="1234 5678 1234 5678" class="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-yellow-400 font-bold transition">
        
        <label class="block text-xs font-bold text-zinc-500 uppercase">CVV</label>
        <div class="relative">
          <input id="auth_card_cvv" type="password" maxlength="3" autocomplete="off" oninput="this.value = this.value.replace(/[^0-9]/g, '')" placeholder="3-digit CVV" class="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-yellow-400 font-bold text-center transition pr-12">
          <button onclick="toggleAuthVisibility('auth_card_cvv', 'eye_cvv')" class="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-yellow-500 transition">
            <span id="eye_cvv">👁️</span>
          </button>
        </div>
      </div>
    `;
  }

  content.innerHTML = html;
}

function closePaymentAuthModal() {
  document.getElementById("paymentVerifyModal").classList.add("hidden");
}

function submitPaymentAuth() {
  var err = document.getElementById("authError");
  var isValid = false;

  if (authMethod === "upi") {
    var id = document.getElementById("auth_upi_id").value;
    var pin = document.getElementById("auth_upi_pin").value;
    if (id === paymentCredentials.upi.id && pin === paymentCredentials.upi.pin)
      isValid = true;
  } else if (authMethod === "card") {
    var name = document.getElementById("auth_card_name").value;
    // Strip spaces for card number verification
    var num = document
      .getElementById("auth_card_number")
      .value.replace(/\s/g, "");
    var cvv = document.getElementById("auth_card_cvv").value;
    if (
      name === paymentCredentials.card.name &&
      num === paymentCredentials.card.number &&
      cvv === paymentCredentials.card.cvv
    )
      isValid = true;
  }

  if (isValid) {
    closePaymentAuthModal();
    if (authType === "withdraw") {
      processWithdrawMoney(authAmount);
    } else {
      processAddMoney(authAmount);
    }
  } else {
    err.textContent =
      "Verification Failed. Information does not match bank records.";
    err.classList.remove("hidden");
  }
}

// ─── Verification Helpers ──────────────────────────────────
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
  // Only digits
  var val = el.value.replace(/\D/g, "");
  // Limit to 16 digits
  val = val.substring(0, 16);
  // Add space every 4 digits
  var parts = val.match(/.{1,4}/g);
  el.value = parts ? parts.join(" ") : val;
}

function formatAuthCase(el, limit) {
  // Allow only letters and spaces
  el.value = el.value.replace(/[^a-zA-Z\s]/g, "");
  el.value = el.value.toUpperCase().substring(0, limit);
}

function processAddMoney(amount) {
  var method = document.querySelector('input[name="payMethod"]:checked');
  var methodVal = method ? method.value : "upi";

  // Check if PIN is set — prompt for verify if adding money
  if (walletCache.has_pin) {
    pinWorkflowStep = "verify";
    pendingAction = function () {
      executeAddMoney(amount, methodVal);
    };
    document.getElementById("pinModalTitle").textContent = "Enter Wallet PIN";
    document.getElementById("pinModalDesc").textContent =
      "Authorize transfer using your transaction PIN.";
    openPinModal();
    return;
  }

  executeAddMoney(amount, methodVal);
}

function executeAddMoney(amount, methodVal) {
  // POST /api/wallet/add-money/
  apiCall("/wallet/add-money/", "POST", {
    amount: amount,
    transaction_method: methodVal,
  })
    .then(function (response) {
      walletCache.balance = parseFloat(response.balance || 0);

      // Reset
      document.getElementById("addAmount").value = "";

      renderBalance();
      loadWalletFromAPI(); // Reload to get updated transactions
      showToast("₹" + amount.toFixed(2) + " added to wallet!", "success");
    })
    .catch(function (error) {
      console.error("Error adding money:", error);
      showToast("Failed to add money. Please try again.", "error");
    });
}

// ─── Withdrawal Flow ──────────────────────────────────────
function initiateWithdraw() {
  if (walletCache.is_frozen) {
    showToast("Wallet is frozen. Unfreeze to withdraw.", "error");
    return;
  }
  if (!walletCache.has_pin && !localStorage.getItem("icab_wallet_pin")) {
    showToast("Set a Transaction PIN first.", "error");
    return;
  }
  document.getElementById("withdrawAmountModal").classList.remove("hidden");
  document.getElementById("withdrawAmountInput").value = "";
  document.getElementById("withdrawAmountError").classList.add("hidden");
  document.getElementById("withdrawAmountInput").focus();
}

function closeWithdrawAmountModal() {
  document.getElementById("withdrawAmountModal").classList.add("hidden");
}

function submitWithdrawAmount() {
  var amount = parseFloat(document.getElementById("withdrawAmountInput").value);
  var err = document.getElementById("withdrawAmountError");

  if (isNaN(amount) || amount <= 0) {
    err.textContent = "Please enter a valid amount.";
    err.classList.remove("hidden");
    return;
  }

  if (amount > walletCache.balance) {
    err.textContent = "Insufficient balance.";
    err.classList.remove("hidden");
    return;
  }

  err.classList.add("hidden");
  closeWithdrawAmountModal();
  // Withdrawals use UPI as the standard method
  openPaymentAuthModal(amount, "upi", "withdraw");
}

function processWithdrawMoney(amount) {
  // Always verify PIN for withdrawals
  if (walletCache.has_pin) {
    pinWorkflowStep = "verify";
    pendingAction = function () {
      executeWithdrawMoney(amount);
    };
    document.getElementById("pinModalTitle").textContent =
      "Authorize Withdrawal";
    document.getElementById("pinModalDesc").textContent =
      "Confirm this ₹" + amount.toFixed(2) + " withdrawal using your PIN.";
    openPinModal();
  } else {
    // Should not happen due to UI locks, but fallback
    executeWithdrawMoney(amount);
  }
}

function executeWithdrawMoney(amount) {
  apiCall("/wallet/withdraw/", "POST", {
    amount: amount,
    transaction_method: "upi",
  })
    .then(function (response) {
      walletCache.balance = parseFloat(response.balance || 0);
      renderBalance();
      loadWalletFromAPI();
      showToast(
        "₹" + amount.toFixed(2) + " withdrawn successfully!",
        "success",
      );
    })
    .catch(function (error) {
      console.error("Withdraw error:", error);
      var msg = error && error.error ? error.error : "Withdrawal failed.";
      showToast(msg, "error");
    });
}

function processAddMoneyLocalStorage(amount, methodVal) {
  var bal = parseFloat(localStorage.getItem("icab_wallet_balance") || "0");
  localStorage.setItem("icab_wallet_balance", (bal + amount).toFixed(2));

  // Save transaction
  var newTxn = {
    type: "credit",
    amount: amount,
    method: methodVal,
    label: "Money Added via " + methodVal.toUpperCase(),
    icon: "💳",
  };
  addTransaction(newTxn);

  // Sync to cache for immediate UI update
  walletCache.transactions.unshift(newTxn);

  // Reset
  document.getElementById("addAmount").value = "";

  renderBalance();
  renderTransactions(walletCache.transactions);
  updateSpendingStats(walletCache.transactions);
  renderChart(walletCache.transactions);
  showToast("₹" + amount.toFixed(2) + " added to wallet!", "success");
}

function mapApiTransactions(apiTxns) {
  if (!Array.isArray(apiTxns)) return [];
  return apiTxns.map(function (t) {
    return {
      id: t.id,
      type: t.txn_type || (t.amount > 0 ? "credit" : "debit"),
      amount: Math.abs(parseFloat(t.amount)),
      label: t.description || "Wallet Transaction",
      date: t.created_at || new Date().toISOString(),
      method:
        t.description && t.description.toLowerCase().includes("upi")
          ? "UPI"
          : "Wallet",
      icon: t.txn_type === "credit" ? "💳" : "🚕",
    };
  });
}

// ─── Transaction helpers ──────────────────────────────────
function addTransaction(txn) {
  var txns = JSON.parse(
    localStorage.getItem("icab_wallet_transactions") || "[]",
  );
  txn.id = Date.now();
  txn.date = new Date().toISOString();
  txns.unshift(txn);
  localStorage.setItem("icab_wallet_transactions", JSON.stringify(txns));
}

function renderTransactions(txns) {
  var filter = (document.getElementById("txnFilter") || {}).value || "all";

  // Use passed txns or fallback to cache
  if (!txns) {
    txns =
      walletCache.transactions && walletCache.transactions.length > 0
        ? walletCache.transactions
        : JSON.parse(localStorage.getItem("icab_wallet_transactions") || "[]");
  }

  if (filter !== "all") {
    txns = txns.filter(function (t) {
      return t.type === filter;
    });
  }

  var el = document.getElementById("transactionList");
  if (!el) return;

  if (txns.length === 0) {
    el.innerHTML =
      '<p class="text-center py-10 text-zinc-400">No transactions found.</p>';
    return;
  }

  var html = "";
  txns.forEach(function (t) {
    var isCredit = t.type === "credit";
    var amtClass = isCredit ? "txn-amount-credit" : "txn-amount-debit";
    var rowClass = isCredit ? "txn-credit" : "txn-debit";
    var sign = isCredit ? "+" : "-";
    var dateStr = new Date(t.date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    html += '<div class="txn-row ' + rowClass + '">';
    html += '<div class="txn-icon">' + (t.icon || "💳") + "</div>";
    html +=
      '<div class="flex-1 min-w-0"><p class="font-semibold text-sm truncate">' +
      t.label +
      '</p><p class="text-xs text-zinc-400 mt-0.5">' +
      dateStr +
      " · " +
      (t.method || "") +
      "</p></div>";
    html += '<div class="flex items-center gap-3 flex-shrink-0">';
    html +=
      '<span class="' +
      amtClass +
      ' text-sm">' +
      sign +
      "₹" +
      parseFloat(t.amount).toFixed(2) +
      "</span>";
    html +=
      '<button onclick="downloadInvoice(' +
      t.id +
      ')" class="text-zinc-400 hover:text-yellow-500 transition text-lg" title="Download Invoice">🧾</button>';
    html += "</div></div>";
  });
  el.innerHTML = html;
}

// ─── Invoice Download ─────────────────────────────────────
function downloadInvoice(id) {
  var txns = JSON.parse(
    localStorage.getItem("icab_wallet_transactions") || "[]",
  );
  var txn = txns.find(function (t) {
    return t.id === id;
  });
  if (!txn) return;

  var name = localStorage.getItem("icab_user_name") || "Customer";
  var email = localStorage.getItem("icab_user_email") || "—";
  var date = new Date(txn.date).toLocaleString("en-IN");

  var bodyEl = document.getElementById("invoiceBody");
  bodyEl.innerHTML = [
    '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">',
    '<tr><td style="padding:8px 0;color:#71717a;">Invoice No.</td><td style="text-align:right;font-weight:700;">#INV-' +
      txn.id +
      "</td></tr>",
    '<tr><td style="padding:8px 0;color:#71717a;">Date</td><td style="text-align:right;">' +
      date +
      "</td></tr>",
    '<tr><td style="padding:8px 0;color:#71717a;">Customer</td><td style="text-align:right;">' +
      name +
      "</td></tr>",
    '<tr><td style="padding:8px 0;color:#71717a;">Email</td><td style="text-align:right;">' +
      email +
      "</td></tr>",
    '<tr><td style="padding:8px 0;color:#71717a;">Type</td><td style="text-align:right;text-transform:capitalize;">' +
      txn.type +
      "</td></tr>",
    '<tr><td style="padding:8px 0;color:#71717a;">Method</td><td style="text-align:right;text-transform:uppercase;">' +
      txn.method +
      "</td></tr>",
    '<tr style="border-top:2px solid #e4e4e7;"><td style="padding:12px 0;font-weight:900;font-size:1rem;">Amount</td><td style="text-align:right;font-weight:900;font-size:1.2rem;color:#16a34a;">₹' +
      parseFloat(txn.amount).toFixed(2) +
      "</td></tr>",
    "</table>",
  ].join("");

  var printArea = document.getElementById("invoicePrintArea");
  printArea.classList.remove("hidden");
  window.print();
  printArea.classList.add("hidden");
}

// ─── Spending Stats + Chart ───────────────────────────────
function updateSpendingStats(txns) {
  if (!txns) {
    txns = JSON.parse(localStorage.getItem("icab_wallet_transactions") || "[]");
  }
  var now = new Date();
  var thisMonth = now.getMonth();
  var thisYear = now.getFullYear();

  var monthSpend = 0,
    totalSpend = 0,
    totalAdd = 0;
  txns.forEach(function (t) {
    if (t.type === "debit") {
      totalSpend += parseFloat(t.amount);
      var d = new Date(t.date);
      if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) {
        monthSpend += parseFloat(t.amount);
      }
    }
    if (t.type === "credit") totalAdd += parseFloat(t.amount);
  });

  var mEl = document.getElementById("thisMonthSpend");
  var tEl = document.getElementById("totalSpend");
  var aEl = document.getElementById("totalAdded");
  if (mEl) mEl.textContent = monthSpend.toFixed(2);
  if (tEl) tEl.textContent = totalSpend.toFixed(2);
  if (aEl) aEl.textContent = totalAdd.toFixed(2);
}

var chartInstance = null;
function renderChart(txns) {
  if (!txns) {
    txns = JSON.parse(localStorage.getItem("icab_wallet_transactions") || "[]");
  }

  var period = parseInt(
    (document.getElementById("chartPeriod") || {}).value || "6",
  );
  var labels = [],
    data = [],
    dataAdd = [];
  var now = new Date();

  for (var i = period - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var label = d.toLocaleString("default", {
      month: "short",
      year: "2-digit",
    });
    var spend = 0,
      add = 0;
    txns.forEach(function (t) {
      var td = new Date(t.date);
      if (
        td.getMonth() === d.getMonth() &&
        td.getFullYear() === d.getFullYear()
      ) {
        if (t.type === "debit") spend += parseFloat(t.amount);
        if (t.type === "credit") add += parseFloat(t.amount);
      }
    });
    labels.push(label);
    data.push(spend);
    dataAdd.push(add);
  }

  var canvas = document.getElementById("spendingChart");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var isDark = document.documentElement.classList.contains("dark");
  var gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Money Added",
          data: dataAdd,
          backgroundColor: "rgba(34,197,94,0.7)",
          borderRadius: 8,
          barPercentage: 0.5,
        },
        {
          label: "Ride Spend",
          data: data,
          backgroundColor: "rgba(234,179,8,0.8)",
          borderRadius: 8,
          barPercentage: 0.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: isDark ? "#a1a1aa" : "#71717a" },
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: isDark ? "#a1a1aa" : "#71717a",
            callback: function (v) {
              return "₹" + v;
            },
          },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: {
          labels: { color: isDark ? "#e4e4e7" : "#3f3f46", boxRadius: 6 },
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + ": ₹" + ctx.parsed.y;
            },
          },
        },
      },
    },
  });
}

// ─── Transaction PIN ──────────────────────────────────────
function openPinModal() {
  clearPinInputs();
  lastVerifiedPin = "";
  var errEl = document.getElementById("pinError");
  if (errEl) errEl.classList.add("hidden");
  document.getElementById("pinModal").classList.remove("hidden");

  var hasPin = !!localStorage.getItem("icab_wallet_pin") || walletCache.has_pin;

  if (hasPin && pinWorkflowStep !== "verify") {
    // If we're changing PIN, start at verify
    pinWorkflowStep = "verify";
    document.getElementById("pinModalTitle").textContent = "Verify Current PIN";
    document.getElementById("pinModalDesc").textContent =
      "Enter your existing 4-digit PIN to continue.";
  } else if (!hasPin) {
    pinWorkflowStep = "set";
    document.getElementById("pinModalTitle").textContent = "Set New PIN";
    document.getElementById("pinModalDesc").textContent =
      "Choose a new 4-digit security PIN.";
  }

  document.getElementById("digit1").focus();
}

function closePinModal() {
  document.getElementById("pinModal").classList.add("hidden");
  pinWorkflowStep = "set";
  tempNewPin = "";
  pendingAction = null;
  var errEl = document.getElementById("pinError");
  if (errEl) errEl.classList.add("hidden");
  clearPinInputs();
}

function clearPinInputs() {
  ["digit1", "digit2", "digit3", "digit4"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function handlePinInput(current, nextId) {
  // Digits only validation
  current.value = current.value.replace(/[^0-9]/g, "");

  if (current.value.length >= 1 && nextId) {
    document.getElementById(nextId).focus();
  }
}

function submitPin() {
  var pin = ["digit1", "digit2", "digit3", "digit4"]
    .map(function (id) {
      return document.getElementById(id).value;
    })
    .join("");
  var errEl = document.getElementById("pinError");

  if (pin.length < 4) {
    errEl.textContent = "Please enter all 4 digits.";
    errEl.classList.remove("hidden");
    return;
  }

  if (pinWorkflowStep === "verify") {
    // Verify against API or localStorage
    apiCall("/wallet/verify-pin/", "POST", { pin: pin })
      .then(function () {
        // Success -> Move to Step 2: Set New PIN
        lastVerifiedPin = pin;
        pinWorkflowStep = "set";
        clearPinInputs();
        errEl.classList.add("hidden");
        document.getElementById("pinModalTitle").textContent = "Enter New PIN";
        document.getElementById("pinModalDesc").textContent =
          "Now, enter your new 4-digit security PIN.";
        document.getElementById("digit1").focus();
        if (pendingAction) {
          var action = pendingAction;
          closePinModal();
          action();
        }
      })
      .catch(function () {
        // Fallback for demo/localStorage
        var saved = localStorage.getItem("icab_wallet_pin");
        if (pin === saved) {
          lastVerifiedPin = pin;
          pinWorkflowStep = "set";
          clearPinInputs();
          errEl.classList.add("hidden");
          document.getElementById("pinModalTitle").textContent =
            "Enter New PIN";
          document.getElementById("pinModalDesc").textContent =
            "Now, enter your new 4-digit security PIN.";
          document.getElementById("digit1").focus();
          if (pendingAction) {
            var action = pendingAction;
            closePinModal();
            action();
          }
        } else {
          clearPinInputs();
          errEl.textContent = "Incorrect Transaction PIN. Try again.";
          errEl.classList.remove("hidden");
          document.getElementById("digit1").focus();
        }
      });
  } else if (pinWorkflowStep === "set") {
    // Check if new PIN is same as old
    if (pin === lastVerifiedPin) {
      errEl.textContent = "New PIN cannot be same as Current PIN.";
      errEl.classList.remove("hidden");
      clearPinInputs();
      document.getElementById("digit1").focus();
      return;
    }
    errEl.classList.add("hidden");
    // Stage 1 of setting: Store and ask for confirmation
    tempNewPin = pin;
    pinWorkflowStep = "confirm";
    clearPinInputs();
    document.getElementById("pinModalTitle").textContent = "Confirm New PIN";
    document.getElementById("pinModalDesc").textContent =
      "Re-enter your new PIN to confirm.";
    document.getElementById("digit1").focus();
  } else if (pinWorkflowStep === "confirm") {
    // Stage 2: Compare and Save
    if (pin !== tempNewPin) {
      errEl.textContent = "PINs do not match. Start over.";
      errEl.classList.remove("hidden");
      pinWorkflowStep = "set";
      clearPinInputs();
      document.getElementById("pinModalTitle").textContent = "Enter New PIN";
      document.getElementById("digit1").focus();
      return;
    }

    // Save via API
    apiCall("/wallet/set-pin/", "POST", { pin: pin })
      .then(function () {
        localStorage.setItem("icab_wallet_pin", pin); // Fallback sync
        closePinModal();
        loadPinStatus();
        showToast("Transaction PIN updated successfully!", "success");
      })
      .catch(function () {
        // Fallback
        localStorage.setItem("icab_wallet_pin", pin);
        closePinModal();
        loadPinStatus();
        showToast("Transaction PIN set locally.", "success");
      });
  }
}

function loadPinStatus() {
  var hasPin = !!localStorage.getItem("icab_wallet_pin") || walletCache.has_pin;
  var btn = document.getElementById("setPinBtn");
  var msg = document.getElementById("pinStatusMsg");
  var badge = document.getElementById("pinBadge");

  if (hasPin) {
    if (btn) btn.textContent = "🔑 Change Transaction PIN";
    if (msg) msg.textContent = "✅ PIN is set. Transactions are PIN-protected.";
    if (badge) {
      badge.className = "kyc-verified";
      badge.textContent = "✅ PIN Set";
    }
    // Enable Withdraw
    var withdrawBtn = document.getElementById("withdrawBtn");
    if (withdrawBtn) {
      withdrawBtn.classList.remove("cursor-not-allowed", "text-zinc-400");
      withdrawBtn.classList.add("text-zinc-100");
      withdrawBtn.title = "Withdraw funds to bank account";
    }
  } else {
    if (btn) btn.textContent = "Set Transaction PIN";
    if (msg)
      msg.textContent =
        "Set a 4-digit PIN to authorize payments and add funds.";
    if (badge) {
      badge.className = "kyc-pending";
      badge.textContent = "⚠ PIN Not Set";
    }
    // Disable Withdraw
    var withdrawBtn = document.getElementById("withdrawBtn");
    if (withdrawBtn) {
      withdrawBtn.classList.add("cursor-not-allowed", "text-zinc-400");
      withdrawBtn.classList.remove("text-zinc-100");
      withdrawBtn.title = "Available after Transaction PIN Set";
    }
  }
}

// ─── Freeze Wallet ────────────────────────────────────────
function toggleFreeze() {
  var hasPin = !!localStorage.getItem("icab_wallet_pin") || walletCache.has_pin;

  if (!hasPin) {
    showToast("Please set a Transaction PIN first to secure your wallet.", "info");
    openPinModal();
    return;
  }

  // Ask for PIN before toggling freeze
  pendingAction = realToggleFreeze;
  openPinModal();
}

function realToggleFreeze() {
  // Optimistic UI: Toggle state locally first for instant feel
  var frozen =
    walletCache.is_frozen !== undefined
      ? walletCache.is_frozen
      : localStorage.getItem("icab_wallet_frozen") === "true";

  var newState = !frozen;
  walletCache.is_frozen = newState;
  loadFreezeState();

  // Call backend to sync
  apiCall("/wallet/freeze/", "POST")
    .then(function (response) {
      // Sync with official response
      walletCache.is_frozen = response.is_frozen;
      localStorage.setItem("icab_wallet_frozen", response.is_frozen);
      loadFreezeState();

      var stateMsg = response.is_frozen ? "Wallet frozen!" : "Wallet unfrozen!";
      showToast(stateMsg, response.is_frozen ? "info" : "success");
    })
    .catch(function (error) {
      console.error("Error toggling freeze:", error);
      // Revert on failure
      walletCache.is_frozen = frozen;
      localStorage.setItem("icab_wallet_frozen", frozen);
      loadFreezeState();
      showToast("Sync failed. Wallet state reverted.", "error");
    });
}

function loadFreezeState() {
  var frozen =
    walletCache.is_frozen !== undefined
      ? walletCache.is_frozen
      : localStorage.getItem("icab_wallet_frozen") === "true";

  var overlay = document.getElementById("frozenOverlay");
  var btn = document.getElementById("freezeBtn");
  if (overlay) {
    if (frozen) {
      overlay.classList.add("active");
      overlay.classList.remove("hidden");
    } else {
      overlay.classList.remove("active");
      // Delay hidden slightly to allow fade out
      setTimeout(() => {
        if (!walletCache.is_frozen) overlay.classList.add("hidden");
      }, 300);
    }
  }
  if (btn) btn.textContent = frozen ? "🔓 Unfreeze Wallet" : "❄️ Freeze Wallet";
}
