/**
 * auth.js — Handles login, register, logout using localStorage
 * (No backend required — all data stored in browser)
 */

// Shared ride type labels used across history, dashboards, and details.
var RIDE_TYPES = {
  standard: "🚕 Standard",
  premium: "🚘 Premium",
  auto: "🛺 Auto Rickshaw",
  bike: "🏍️ Bike Courier",
};

// ─── Helper: get all users from storage ──────────────────
function getUsers() {
  return JSON.parse(localStorage.getItem("icab_users") || "[]");
}

function saveUsers(users) {
  localStorage.setItem("icab_users", JSON.stringify(users));
}

// ─── Format Validators ────────────────────────────────────
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function isValidPhone(phone) {
  const re = /^[0-9]{10}$/;
  return re.test(String(phone));
}

function validateAndFormatName(input) {
  /**
   * Real-time name validation and auto-conversion:
   * - Only alphabets allowed (no spaces within a single field)
   * - Max 10 characters per field
   * - Auto-convert: first letter uppercase, rest lowercase
   */
  let value = input.value;

  // Remove non-alphabetic characters
  value = value.replace(/[^a-zA-Z]/g, "");

  // Enforce max 10 characters
  value = value.substring(0, 10);

  // Auto-convert: first letter uppercase, rest lowercase
  if (value.length > 0) {
    value = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  input.value = value;

  // Update visual feedback
  const isValid = /^[a-zA-Z]*$/.test(value) && value.length <= 10;

  // Determine which error element to update
  let errorId = "firstNameError";
  if (input.id === "registerSurname") errorId = "surnameError";
  if (input.id === "driverFirstName") errorId = "driverFirstNameError";
  if (input.id === "driverSurname") errorId = "driverSurnameError";

  const errorEl = document.getElementById(errorId);
  if (errorEl) {
    if (isValid || value.length === 0) {
      errorEl.classList.add("hidden");
      input.classList.remove("ring-2", "ring-red-500", "border-red-500");
      if (value.length > 0) {
        input.classList.add("ring-2", "ring-green-500", "border-green-500");
      }
    } else {
      errorEl.classList.remove("hidden");
      input.classList.add("ring-2", "ring-red-500", "border-red-500");
      input.classList.remove("ring-green-500", "border-green-500");
    }
  }
}

function getPasswordStrength(pwd) {
  let score = 0;
  if (pwd.length >= 8 && pwd.length <= 20) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;
  return score;
}

function updatePasswordUI(inputId, barId, labelId, critIds) {
  const input = document.getElementById(inputId);
  const bar = document.getElementById(barId);
  const label = document.getElementById(labelId);
  if (!input || !bar || !label) return;

  input.addEventListener("input", () => {
    const pwd = input.value;
    const score = getPasswordStrength(pwd);

    // Update Criteria Checklist
    const checks = {
      len: pwd.length >= 8 && pwd.length <= 20,
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      num: /[0-9]/.test(pwd),
      spec: /[^a-zA-Z0-9]/.test(pwd),
    };

    for (const [key, met] of Object.entries(checks)) {
      const el = document.getElementById(critIds[key]);
      if (el) {
        el.innerHTML = met
          ? "✅ " + el.innerText.substring(2)
          : "❌ " + el.innerText.substring(2);
        el.className = met
          ? "flex items-center gap-1 text-green-500 font-medium"
          : "flex items-center gap-1 text-gray-400";
      }
    }

    // Update Meter & Label
    let color = "#e5e7eb"; // gray-200
    let width = "0%";
    let text = "None";
    let borderColor = "";

    if (score > 0) {
      if (score <= 2) {
        color = "#ef4444"; // red-500
        width = score * 20 + "%";
        text = "Weak";
        borderColor = "ring-red-500 border-red-500";
      } else if (score <= 4) {
        color = "#f59e0b"; // amber-500
        width = score * 20 + "%";
        text = "Moderate";
        borderColor = "ring-amber-500 border-amber-500";
      } else {
        color = "#10b981"; // emerald-500
        width = "100%";
        text = "Strong";
        borderColor = "ring-emerald-500 border-emerald-500";
      }
    }

    bar.style.width = width;
    bar.style.backgroundColor = color;
    label.innerText = text;
    label.style.color = color;

    // Update border on focus
    input.onfocus = () => {
      if (borderColor) {
        input.classList.add("ring-2");
        const classes = borderColor.split(" ");
        input.classList.remove("focus:ring-yellow-400");
        input.classList.add(...classes);
      } else {
        input.classList.remove(
          "ring-2",
          "ring-red-500",
          "border-red-500",
          "ring-amber-500",
          "border-amber-500",
          "ring-emerald-500",
          "border-emerald-500",
        );
        input.classList.add("focus:ring-yellow-400");
      }
    };

    // Immediate border update if currently focused
    if (document.activeElement === input) {
      input.classList.remove(
        "ring-red-500",
        "border-red-500",
        "ring-amber-500",
        "border-amber-500",
        "ring-emerald-500",
        "border-emerald-500",
      );
      if (borderColor) {
        input.classList.add("ring-2");
        const classes = borderColor.split(" ");
        input.classList.remove("focus:ring-yellow-400");
        input.classList.add(...classes);
      } else {
        input.classList.remove("ring-2");
        input.classList.add("focus:ring-yellow-400");
      }
    }
  });
}

function updateConfirmPasswordUI(pwdId, confirmId, errorId) {
  const pwdInput = document.getElementById(pwdId);
  const confirmInput = document.getElementById(confirmId);
  const errorMsg = document.getElementById(errorId);
  if (!pwdInput || !confirmInput || !errorMsg) return;

  const checkMatch = () => {
    const val = confirmInput.value.trim();
    const mainVal = pwdInput.value.trim();

    if (!val) {
      errorMsg.classList.add("hidden");
      confirmInput.classList.remove(
        "ring-2",
        "ring-red-500",
        "border-red-500",
        "ring-green-500",
        "border-green-500",
      );
      return;
    }

    if (val !== mainVal) {
      errorMsg.classList.remove("hidden");
      confirmInput.classList.add("ring-2", "ring-red-500", "border-red-500");
      confirmInput.classList.remove(
        "focus:ring-yellow-400",
        "ring-green-500",
        "border-green-500",
      );
    } else {
      errorMsg.classList.add("hidden");
      confirmInput.classList.add(
        "ring-2",
        "ring-green-500",
        "border-green-500",
      );
      confirmInput.classList.remove(
        "focus:ring-yellow-400",
        "ring-red-500",
        "border-red-500",
      );
    }
  };

  confirmInput.addEventListener("input", checkMatch);
  pwdInput.addEventListener("input", () => {
    if (confirmInput.value.trim()) checkMatch();
  });

  confirmInput.addEventListener("focus", checkMatch);
  confirmInput.addEventListener("blur", () => {
    if (!confirmInput.value.trim()) {
      confirmInput.classList.remove(
        "ring-2",
        "ring-red-500",
        "border-red-500",
        "ring-green-500",
        "border-green-500",
      );
    }
  });
}

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  // Strength Listeners
  updatePasswordUI("registerPassword", "regStrengthBar", "regStrengthLabel", {
    len: "reg-crit-len",
    upper: "reg-crit-upper",
    lower: "reg-crit-lower",
    num: "reg-crit-num",
    spec: "reg-crit-spec",
  });
  updatePasswordUI("driverPassword", "drvStrengthBar", "drvStrengthLabel", {
    len: "drv-crit-len",
    upper: "drv-crit-upper",
    lower: "drv-crit-lower",
    num: "drv-crit-num",
    spec: "drv-crit-spec",
  });
  updatePasswordUI("newPassword", "forStrengthBar", "forStrengthLabel", {
    len: "for-crit-len",
    upper: "for-crit-upper",
    lower: "for-crit-lower",
    num: "for-crit-num",
    spec: "for-crit-spec",
  });

  // Confirm Match Listeners
  updateConfirmPasswordUI(
    "registerPassword",
    "registerConfirmPassword",
    "regConfirmMsg",
  );
  updateConfirmPasswordUI(
    "driverPassword",
    "driverConfirmPassword",
    "drvConfirmMsg",
  );
  updateConfirmPasswordUI("newPassword", "confirmNewPassword", "forConfirmMsg");

  // Name Field Real-time Validation & Auto-conversion (User Registration)
  const registerFirstNameInput = document.getElementById("registerFirstName");
  if (registerFirstNameInput) {
    registerFirstNameInput.addEventListener("input", function () {
      validateAndFormatName(this);
    });
  }

  const registerSurnameInput = document.getElementById("registerSurname");
  if (registerSurnameInput) {
    registerSurnameInput.addEventListener("input", function () {
      validateAndFormatName(this);
    });
  }

  // Name Field Real-time Validation & Auto-conversion (Driver Registration)
  const driverFirstNameInput = document.getElementById("driverFirstName");
  if (driverFirstNameInput) {
    driverFirstNameInput.addEventListener("input", function () {
      validateAndFormatName(this);
    });
  }

  const driverSurnameInput = document.getElementById("driverSurname");
  if (driverSurnameInput) {
    driverSurnameInput.addEventListener("input", function () {
      validateAndFormatName(this);
    });
  }
});

// ─── Email Validation for Registration ─────────────────────────────────────────────
var registerEmailCheckTimeout = null;
var registerPhoneCheckTimeout = null;
var driverPhoneCheckTimeout = null;

async function validateRegisterEmail() {
  var email = document.getElementById("registerEmail").value.trim();
  var errorEl = document.getElementById("registerEmailError");

  if (!email) {
    errorEl.classList.add("hidden");
    return;
  }

  try {
    var response = await apiCall(
      "/auth/check-email/?email=" + encodeURIComponent(email) + "&role=user",
      "GET",
    );

    if (response.exists) {
      errorEl.classList.remove("hidden");
    } else {
      errorEl.classList.add("hidden");
    }
  } catch (error) {
    errorEl.classList.add("hidden");
  }
}

async function validateDriverEmail() {
  var email = document.getElementById("driverEmail").value.trim();
  var errorEl = document.getElementById("driverEmailError");

  if (!email) {
    errorEl.classList.add("hidden");
    return;
  }

  try {
    var response = await apiCall(
      "/auth/check-email/?email=" + encodeURIComponent(email) + "&role=driver",
      "GET",
    );

    if (response.exists) {
      errorEl.classList.remove("hidden");
    } else {
      errorEl.classList.add("hidden");
    }
  } catch (error) {
    errorEl.classList.add("hidden");
  }
}

async function validateRegisterPhone() {
  var phone = document.getElementById("registerPhone").value.trim();
  var errorEl = document.getElementById("registerPhoneError");

  if (!phone) {
    errorEl.classList.add("hidden");
    return;
  }

  try {
    var response = await apiCall(
      "/auth/check-phone/?phone=" + encodeURIComponent(phone) + "&role=user",
      "GET",
    );

    if (response.exists) {
      errorEl.classList.remove("hidden");
    } else {
      errorEl.classList.add("hidden");
    }
  } catch (error) {
    errorEl.classList.add("hidden");
  }
}

async function validateDriverPhone() {
  var phone = document.getElementById("driverPhone").value.trim();
  var errorEl = document.getElementById("driverPhoneError");

  if (!phone) {
    errorEl.classList.add("hidden");
    return;
  }

  try {
    var response = await apiCall(
      "/auth/check-phone/?phone=" + encodeURIComponent(phone) + "&role=driver",
      "GET",
    );

    if (response.exists) {
      errorEl.classList.remove("hidden");
    } else {
      errorEl.classList.add("hidden");
    }
  } catch (error) {
    errorEl.classList.add("hidden");
  }
}

// Attach email validation listeners
document.addEventListener("DOMContentLoaded", function () {
  var registerEmailInput = document.getElementById("registerEmail");
  if (registerEmailInput) {
    registerEmailInput.addEventListener("input", function () {
      clearTimeout(registerEmailCheckTimeout);
      registerEmailCheckTimeout = setTimeout(validateRegisterEmail, 500);
    });
  }

  var driverEmailInput = document.getElementById("driverEmail");
  if (driverEmailInput) {
    driverEmailInput.addEventListener("input", function () {
      clearTimeout(registerEmailCheckTimeout);
      registerEmailCheckTimeout = setTimeout(validateDriverEmail, 500);
    });
  }

  var registerPhoneInput = document.getElementById("registerPhone");
  if (registerPhoneInput) {
    registerPhoneInput.addEventListener("input", function () {
      clearTimeout(registerPhoneCheckTimeout);
      registerPhoneCheckTimeout = setTimeout(validateRegisterPhone, 500);
    });
  }

  var driverPhoneInput = document.getElementById("driverPhone");
  if (driverPhoneInput) {
    driverPhoneInput.addEventListener("input", function () {
      clearTimeout(driverPhoneCheckTimeout);
      driverPhoneCheckTimeout = setTimeout(validateDriverPhone, 500);
    });
  }
});

// ─── Register ─────────────────────────────────────────────
async function registerUser() {
  const firstName = document.getElementById("registerFirstName").value.trim();
  const surname = document.getElementById("registerSurname").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const phoneEl = document.getElementById("registerPhone");
  const phone = phoneEl ? phoneEl.value.trim() : "";
  const password = document.getElementById("registerPassword").value.trim();
  const errorEl = document.getElementById("registerError");
  const successEl = document.getElementById("registerSuccess");

  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  if (!firstName || !surname || !email || !password || (phoneEl && !phone)) {
    errorEl.textContent =
      "Please fill in all fields including First Name and Surname.";
    errorEl.classList.remove("hidden");
    return false;
  }

  // Check if email is already registered
  var emailErrorEl = document.getElementById("registerEmailError");
  if (!emailErrorEl.classList.contains("hidden")) {
    errorEl.textContent =
      "This email is already registered. Please use a different email.";
    errorEl.classList.remove("hidden");
    return false;
  }

  // Check if phone is already registered
  var phoneErrorEl = document.getElementById("registerPhoneError");
  if (!phoneErrorEl.classList.contains("hidden")) {
    errorEl.textContent =
      "This phone is already registered. Please use a different phone.";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (!isValidEmail(email)) {
    errorEl.textContent = "Please enter a valid email address.";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (phoneEl && !isValidPhone(phone)) {
    errorEl.textContent =
      "Please enter exactly 10 digits for your mobile number.";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (getPasswordStrength(password) < 5) {
    errorEl.textContent = "Password does not meet all security criteria.";
    errorEl.classList.remove("hidden");
    return false;
  }

  const confirmEl = document.getElementById("registerConfirmPassword");
  if (confirmEl && confirmEl.value.trim() !== password) {
    errorEl.textContent = "Passwords do not match.";
    errorEl.classList.remove("hidden");
    return false;
  }

  // Validate name fields format
  if (!/^[a-zA-Z]+$/.test(firstName)) {
    errorEl.textContent = "First name can only contain alphabets (A-Z, a-z).";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (!/^[a-zA-Z]+$/.test(surname)) {
    errorEl.textContent = "Surname can only contain alphabets (A-Z, a-z).";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (firstName.length > 10) {
    errorEl.textContent = "First name must be maximum 10 characters.";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (surname.length > 10) {
    errorEl.textContent = "Surname must be maximum 10 characters.";
    errorEl.classList.remove("hidden");
    return false;
  }

  const regBtn = document.getElementById("registerUserBtn");
  const originalBtnText = regBtn.innerHTML;
  regBtn.disabled = true;
  regBtn.innerHTML = '<span class="animate-pulse">Registering...</span>';

  try {
    const res = await apiCall("/auth/register/", "POST", {
      first_name: firstName,
      last_name: surname,
      name: `${firstName} ${surname}`,
      email: email,
      phone: phone,
      password: password,
      confirm_password: password,
      role: "user",
    });

    document.getElementById("registerFirstName").value = "";
    document.getElementById("registerSurname").value = "";
    document.getElementById("registerEmail").value = "";
    document.getElementById("registerPassword").value = "";
    if (phoneEl) phoneEl.value = "";
    if (confirmEl) confirmEl.value = "";

    // Show success message and redirect after 1.5 seconds
    successEl.textContent = "✅ Account created successfully !!";
    successEl.classList.remove("hidden");
    setTimeout(function () {
      closeRegister();
      openLogin();
    }, 1500);
  } catch (error) {
    if (error.data) {
      errorEl.innerHTML = Object.values(error.data).join("<br>");
    } else {
      errorEl.textContent = "Registration failed. Try again.";
    }
    errorEl.classList.remove("hidden");
  } finally {
    regBtn.disabled = false;
    regBtn.innerHTML = originalBtnText;
  }

  return false;
}

// ─── Login ────────────────────────────────────────────────
async function loginUser() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const errorEl = document.getElementById("loginError");

  errorEl.classList.add("hidden");

  if (!email || !password) {
    errorEl.textContent = "Please enter your email and password.";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (!isValidEmail(email)) {
    errorEl.textContent = "Please enter a valid email address.";
    errorEl.classList.remove("hidden");
    return false;
  }

  const loginBtn = document.getElementById("loginBtn");
  const originalBtnText = loginBtn.innerHTML;
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="animate-pulse">Logging in...</span>';

  try {
    const res = await apiCall("/auth/login/", "POST", {
      email: email,
      password: password,
    });

    // Check for multiple accounts (ambiguity)
    if (res.multiple_accounts) {
      showLoginChoice(res.roles, email, password);
      return;
    }

    // Save tokens in MULTIPLE places for maximum compatibility
    // localStorage - primary, persists across sessions
    localStorage.setItem("icab_access", res.access);
    localStorage.setItem("icab_refresh", res.refresh);

    // sessionStorage - backup, persists for current session
    sessionStorage.setItem("icab_access", res.access);
    sessionStorage.setItem("icab_refresh", res.refresh);

    // Cache user locally to preserve UI speed
    localStorage.setItem("icab_user_id", res.user.id);
    localStorage.setItem("icab_user_name", res.user.name);
    localStorage.setItem("icab_user_email", res.user.email);
    localStorage.setItem("icab_user_role", res.user.role);

    // Also store in sessionStorage as backup
    sessionStorage.setItem("icab_user_id", res.user.id);
    sessionStorage.setItem("icab_user_role", res.user.role);

    console.log(
      `[loginUser] ✓ Stored tokens in localStorage AND sessionStorage`,
    );

    // Get profile completion percentage from API response (source of truth)
    if (res.user.profile_completion_percentage !== undefined) {
      localStorage.setItem(
        "icab_profile_pct",
        res.user.profile_completion_percentage,
      );
    }

    // Create or update welcome notification (smart logic: reuse if exists, mark as unread)
    if (typeof createWelcomeNotification === "function") {
      createWelcomeNotification(res.user.name);
    }

    closeLogin();
    showLoginSuccessToast(res.user.name, res.user.role);
  } catch (error) {
    if (error.data) {
      errorEl.innerHTML = Object.values(error.data).join("<br>");
    } else {
      errorEl.textContent = "Invalid email or password.";
    }
    errorEl.classList.remove("hidden");
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = originalBtnText;
  }

  return false;
}

function showLoginChoice(roles, email, password) {
  const loginInputs = document.getElementById("loginInputs");
  const choiceView = document.getElementById("loginChoiceView");
  const choiceList = document.getElementById("loginChoiceList");
  const errorEl = document.getElementById("loginError");

  if (!loginInputs || !choiceView || !choiceList) return;

  // Hide main inputs and error, show choice view
  loginInputs.classList.add("hidden");
  errorEl.classList.add("hidden");
  choiceView.classList.remove("hidden");

  // Clear and populate choice list
  choiceList.innerHTML = "";
  roles.forEach((role) => {
    const btn = document.createElement("button");
    const isDriver = role === "driver";
    const isAdmin = role === "admin";

    const roleLabel = isDriver ? "Driver" : isAdmin ? "Admin" : "Rider";
    const emoji = isDriver ? "🚖" : isAdmin ? "🛠️" : "👤";

    // Theme colors to match SS-1
    const borderColor = isDriver
      ? "border-green-500"
      : isAdmin
        ? "border-blue-500"
        : "border-yellow-500";
    const textColor = isDriver
      ? "text-green-500"
      : isAdmin
        ? "text-blue-500"
        : "text-yellow-500";
    const hoverBg = isDriver
      ? "hover:bg-green-500/5"
      : isAdmin
        ? "hover:bg-blue-500/5"
        : "hover:bg-yellow-500/5";

    btn.className = `flex items-center justify-between w-full p-4 border-2 bg-transparent ${borderColor} ${textColor} ${hoverBg} font-bold rounded-2xl transition duration-200 hover:scale-[1.01] shadow-sm mb-3`;

    btn.innerHTML = `
      <div class="flex items-center gap-4">
        <span class="text-2xl">${emoji}</span>
        <div class="text-left">
          <div class="text-lg font-black">${roleLabel} Account</div>
        </div>
      </div>
      <span class="text-2xl">→</span>
    `;

    btn.onclick = async function () {
      // Disable all buttons in the list during login
      const buttons = choiceList.querySelectorAll("button");
      buttons.forEach((b) => (b.disabled = true));

      // Update specific button to show loading
      btn.innerHTML = `
        <div class="flex items-center gap-4">
          <span class="text-2xl animate-pulse">⏳</span>
          <div class="text-left">
            <div class="text-lg font-black italic">Logging in as ${roleLabel}...</div>
          </div>
        </div>
      `;

      try {
        const res = await apiCall("/auth/login/", "POST", {
          email: email,
          password: password,
          role: role,
        });

        // After successful login with role, proceed as normal
        localStorage.setItem("icab_access", res.access);
        localStorage.setItem("icab_refresh", res.refresh);
        localStorage.setItem("icab_user_id", res.user.id);
        localStorage.setItem("icab_user_name", res.user.name);
        localStorage.setItem("icab_user_email", res.user.email);
        localStorage.setItem("icab_user_role", res.user.role);

        if (res.user.profile_completion_percentage !== undefined) {
          localStorage.setItem(
            "icab_profile_pct",
            res.user.profile_completion_percentage,
          );
        }

        // Create or update welcome notification
        if (typeof createWelcomeNotification === "function") {
          createWelcomeNotification(res.user.name);
        }

        closeLogin();
        showLoginSuccessToast(res.user.name, res.user.role);
      } catch (error) {
        console.error("Login choice error:", error);
        backToLoginInputs();
        const mainErrorEl = document.getElementById("loginError");
        if (mainErrorEl) {
          mainErrorEl.textContent = "Login failed. Please try again.";
          mainErrorEl.classList.remove("hidden");
        }
      }
    };
    choiceList.appendChild(btn);
  });
}

function backToLoginInputs() {
  const loginInputs = document.getElementById("loginInputs");
  const choiceView = document.getElementById("loginChoiceView");
  if (loginInputs && choiceView) {
    choiceView.classList.add("hidden");
    loginInputs.classList.remove("hidden");
  }
}

// ─── Login Success Popup Toast ─────────────────────────────
function showLoginSuccessToast(name, role) {
  var dest =
    role === "driver"
      ? "driver.html"
      : role === "admin"
        ? "admin.html"
        : "dashboard.html";
  var roleLabel =
    role === "driver" ? "Driver" : role === "admin" ? "Admin" : "Rider";
  var emoji = role === "driver" ? "🚗" : role === "admin" ? "🛠️" : "🏠";

  // Build the popup overlay
  var existing = document.getElementById("icab-login-popup");
  if (existing) existing.remove();

  var popup = document.createElement("div");
  popup.id = "icab-login-popup";
  popup.style.cssText = [
    "position:fixed",
    "inset:0",
    "background:rgba(0,0,0,0.55)",
    "backdrop-filter:blur(8px)",
    "z-index:999999",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "opacity:0",
    "transition:opacity 0.4s ease",
  ].join(";");

  popup.innerHTML = [
    '<div id="icab-login-popup-box" style="',
    "background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);",
    "border:1px solid rgba(250,204,21,0.25);",
    "border-radius:28px;",
    "padding:48px 40px 40px;",
    "text-align:center;",
    "max-width:420px;",
    "width:90%;",
    "box-shadow:0 30px 100px rgba(0,0,0,0.6),0 0 0 1px rgba(250,204,21,0.1);",
    "transform:scale(0.85) translateY(30px);",
    "transition:transform 0.5s cubic-bezier(0.34,1.56,0.64,1)",
    '">',
    '<div style="font-size:4rem;margin-bottom:16px;animation:icab-bounce 0.6s 0.2s ease both">🚕</div>',
    '<h2 style="font-size:1.6rem;font-weight:900;color:#fde047;margin:0 0 8px">Welcome back, ' +
      name +
      "! 👋</h2>",
    '<p style="color:#a1a1aa;font-size:0.95rem;margin:0 0 28px">Logged in as <strong style="color:#fbbf24">' +
      roleLabel +
      "</strong> · Redirecting you " +
      emoji +
      "</p>",
    '<div style="',
    "width:100%;",
    "height:6px;",
    "background:rgba(255,255,255,0.1);",
    "border-radius:999px;",
    "overflow:hidden;",
    "margin-bottom:16px",
    '">',
    '<div id="icab-login-bar" style="',
    "width:0%;",
    "height:100%;",
    "background:linear-gradient(90deg,#facc15,#f59e0b);",
    "border-radius:999px;",
    "transition:width 5s linear",
    '"></div>',
    "</div>",
    '<p style="color:#52525b;font-size:0.8rem">Redirecting in 5 seconds...</p>',
    "</div>",
  ].join("");

  document.body.appendChild(popup);

  // Inject keyframe for bounce
  if (!document.getElementById("icab-popup-style")) {
    var s = document.createElement("style");
    s.id = "icab-popup-style";
    s.textContent =
      "@keyframes icab-bounce{0%{transform:scale(0) translateY(20px);opacity:0}60%{transform:scale(1.15) translateY(-8px)}100%{transform:scale(1) translateY(0);opacity:1}}";
    document.head.appendChild(s);
  }

  // Animate In
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      popup.style.opacity = "1";
      var box = document.getElementById("icab-login-popup-box");
      if (box) box.style.transform = "scale(1) translateY(0)";
      // Start progress bar
      var bar = document.getElementById("icab-login-bar");
      if (bar) bar.style.width = "100%";
    });
  });

  // Redirect after progress bar completes (5 seconds for user to see popup)
  setTimeout(function () {
    // Remove popup to prevent overlay interference
    var popup = document.getElementById("icab-login-popup");
    if (popup) popup.style.display = "none";

    // Clean redirect without query params
    window.location.href = dest;
  }, 5000);
}

// ─── Driver Registration ───────────────────────────────────
async function registerDriver() {
  var firstName = document.getElementById("driverFirstName").value.trim();
  var surname = document.getElementById("driverSurname").value.trim();
  var email = document.getElementById("driverEmail").value.trim();
  var phone = document.getElementById("driverPhone").value.trim();
  var password = document.getElementById("driverPassword").value.trim();
  var vehicle = document.getElementById("driverVehicle").value.trim(); // Optional in base model, handled later
  var plate = document.getElementById("driverPlate").value.trim().toUpperCase();
  var license = document
    .getElementById("driverLicense")
    .value.trim()
    .toUpperCase();

  var errorEl = document.getElementById("driverRegError");
  var successEl = document.getElementById("driverRegSuccess");

  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  if (
    !firstName ||
    !surname ||
    !email ||
    !phone ||
    !password ||
    !vehicle ||
    !plate ||
    !license
  ) {
    errorEl.textContent =
      "Please fill in all fields including First Name and Surname.";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (!isValidEmail(email)) {
    errorEl.textContent = "Please enter a valid email address.";
    errorEl.classList.remove("hidden");
    return false;
  }

  // Check if email is already registered as driver
  var emailErrorEl = document.getElementById("driverEmailError");
  if (!emailErrorEl.classList.contains("hidden")) {
    errorEl.textContent =
      "This email is already registered as a driver. Please use a different email.";
    errorEl.classList.remove("hidden");
    return false;
  }

  // Check if phone is already registered as driver
  var phoneErrorEl = document.getElementById("driverPhoneError");
  if (!phoneErrorEl.classList.contains("hidden")) {
    errorEl.textContent =
      "This phone is already registered as a driver. Please use a different phone.";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (!isValidPhone(phone)) {
    errorEl.textContent =
      "Please enter exactly 10 digits for your mobile number.";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (getPasswordStrength(password) < 5) {
    errorEl.textContent = "Password does not meet all security criteria.";
    errorEl.classList.remove("hidden");
    return false;
  }

  var confirmEl = document.getElementById("driverConfirmPassword");
  if (confirmEl && confirmEl.value.trim() !== password) {
    errorEl.textContent = "Passwords do not match.";
    errorEl.classList.remove("hidden");
    return false;
  }

  // Validate name fields format
  if (!/^[a-zA-Z]+$/.test(firstName)) {
    errorEl.textContent = "First name can only contain alphabets (A-Z, a-z).";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (!/^[a-zA-Z]+$/.test(surname)) {
    errorEl.textContent = "Surname can only contain alphabets (A-Z, a-z).";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (firstName.length > 10) {
    errorEl.textContent = "First name must be maximum 10 characters.";
    errorEl.classList.remove("hidden");
    return false;
  }

  if (surname.length > 10) {
    errorEl.textContent = "Surname must be maximum 10 characters.";
    errorEl.classList.remove("hidden");
    return false;
  }

  const drvBtn = document.getElementById("registerDriverBtn");
  const originalBtnText = drvBtn.innerHTML;
  drvBtn.disabled = true;
  drvBtn.innerHTML = '<span class="animate-pulse">Registering...</span>';

  try {
    const res = await apiCall("/auth/register/", "POST", {
      first_name: firstName,
      last_name: surname,
      name: `${firstName} ${surname}`,
      email: email,
      phone: phone,
      password: password,
      confirm_password: password,
      role: "driver",
      vehicle_model: vehicle,
      vehicle_plate: plate,
      license_no: license,
    });

    // In a full implementation, we would also call a driver-specific endpoint
    // to save License and Vehicle info using the new access token.
    // For Day 1, core auth works.

    document.getElementById("driverFirstName").value = "";
    document.getElementById("driverSurname").value = "";
    document.getElementById("driverEmail").value = "";
    document.getElementById("driverPhone").value = "";
    document.getElementById("driverPassword").value = "";
    if (confirmEl) confirmEl.value = "";
    document.getElementById("driverVehicle").value = "";
    document.getElementById("driverPlate").value = "";
    document.getElementById("driverLicense").value = "";

    // Show success message and redirect after 1.5 seconds
    successEl.textContent = "✅ Driver account created successfully !!";
    successEl.classList.remove("hidden");
    setTimeout(function () {
      closeDriverRegister();
      openLogin();
    }, 1500);
  } catch (error) {
    if (error.data) {
      errorEl.innerHTML = Object.values(error.data).join("<br>");
    } else {
      errorEl.textContent = "Registration failed. Try again.";
    }
    errorEl.classList.remove("hidden");
  } finally {
    drvBtn.disabled = false;
    drvBtn.innerHTML = originalBtnText;
  }

  return false;
}

// ─── Logout ───────────────────────────────────────────────
async function logoutUser() {
  try {
    const refresh = localStorage.getItem("icab_refresh");
    if (refresh) {
      await apiCall("/auth/logout/", "POST", { refresh: refresh });
    }
  } catch (e) {
    /* Ignore network errors on logout */
  }

  // Save theme preference before clearing storage (theme is user preference, not user data)
  var savedTheme = localStorage.getItem("icab_theme");

  // Clear all user-related data
  var userId = localStorage.getItem("icab_user_id");
  localStorage.removeItem("icab_access");
  localStorage.removeItem("icab_refresh");
  localStorage.removeItem("icab_user_id");
  localStorage.removeItem("icab_user_name");
  localStorage.removeItem("icab_user_email");
  localStorage.removeItem("icab_user_role");

  // Clear notifications for this user
  if (userId) {
    localStorage.removeItem("icab_notifications_" + userId);
    localStorage.removeItem("icab_notifications_" + userId + "_seeded");
  }

  // Also clear other cached data
  localStorage.removeItem("icab_profile_pct");
  localStorage.removeItem("icab_rides");
  localStorage.removeItem("adminActiveTab");

  // Restore theme preference (it should persist across logins)
  if (savedTheme) {
    localStorage.setItem("icab_theme", savedTheme);
  }

  // Show logout popup before redirect
  showLogoutPopup();
}

// ─── Logout Success Popup ────────────────────────
function showLogoutPopup() {
  // Build the popup overlay
  var existing = document.getElementById("icab-logout-popup");
  if (existing) existing.remove();

  var popup = document.createElement("div");
  popup.id = "icab-logout-popup";
  popup.style.cssText = [
    "position:fixed",
    "inset:0",
    "background:rgba(0,0,0,0.55)",
    "backdrop-filter:blur(8px)",
    "z-index:999999",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "opacity:0",
    "transition:opacity 0.4s ease",
  ].join(";");

  popup.innerHTML = [
    '<div id="icab-logout-popup-box" style="',
    "background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);",
    "border:1px solid rgba(250,204,21,0.25);",
    "border-radius:28px;",
    "padding:48px 40px 40px;",
    "text-align:center;",
    "max-width:420px;",
    "width:90%;",
    "box-shadow:0 30px 100px rgba(0,0,0,0.6),0 0 0 1px rgba(250,204,21,0.1);",
    "transform:scale(0.85) translateY(30px);",
    "transition:transform 0.5s cubic-bezier(0.34,1.56,0.64,1)",
    '">',
    '<div style="font-size:4rem;margin-bottom:16px;animation:icab-bounce 0.6s 0.2s ease both">👋</div>',
    '<h2 style="font-size:1.6rem;font-weight:900;color:#fde047;margin:0 0 8px">You\'re logged out!</h2>',
    '<p style="color:#a1a1aa;font-size:0.95rem;margin:0 0 28px">We\'ve secured your account. See you next time! 🚕</p>',
    '<div style="',
    "width:100%;",
    "height:6px;",
    "background:rgba(255,255,255,0.1);",
    "border-radius:999px;",
    "overflow:hidden;",
    "margin-bottom:16px",
    '">',
    '<div id="icab-logout-bar" style="',
    "width:0%;",
    "height:100%;",
    "background:linear-gradient(90deg,#facc15,#f59e0b);",
    "border-radius:999px;",
    "transition:width 3s linear",
    '"></div>',
    "</div>",
    '<p style="color:#52525b;font-size:0.8rem">Redirecting in 3 seconds...</p>',
    "</div>",
  ].join("");

  document.body.appendChild(popup);

  // Inject keyframe for bounce
  if (!document.getElementById("icab-logout-popup-style")) {
    var s = document.createElement("style");
    s.id = "icab-logout-popup-style";
    s.textContent =
      "@keyframes icab-bounce{0%{transform:scale(0) translateY(20px);opacity:0}60%{transform:scale(1.15) translateY(-8px)}100%{transform:scale(1) translateY(0);opacity:1}}";
    document.head.appendChild(s);
  }

  // Animate In
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      popup.style.opacity = "1";
      var box = document.getElementById("icab-logout-popup-box");
      if (box) box.style.transform = "scale(1) translateY(0)";
      // Start progress bar
      var bar = document.getElementById("icab-logout-bar");
      if (bar) bar.style.width = "100%";
    });
  });

  // Redirect after 3 seconds
  setTimeout(function () {
    window.location.replace("index.html");
  }, 3000);
}

// Global expose to avoid token errors from api wrapper
window.forceLogout = logoutUser;

// ─── Get current logged-in user ───────────────────────────
function getCurrentUser() {
  const id = localStorage.getItem("icab_user_id");
  const name = localStorage.getItem("icab_user_name");
  const email = localStorage.getItem("icab_user_email");
  if (!id) return null;
  return { id: id, name: name, email: email };
}

// ─── Check Auth Status ────────────────────────────────────
async function checkAuthStatus() {
  const token = localStorage.getItem("icab_access");
  if (!token) return false;

  try {
    const res = await apiCall("/auth/me/", "GET");
    // Update local cache
    localStorage.setItem("icab_user_name", res.name);
    localStorage.setItem("icab_user_role", res.role);

    // Update profile completion percentage from API (source of truth)
    if (res.profile_completion_percentage !== undefined) {
      localStorage.setItem(
        "icab_profile_pct",
        res.profile_completion_percentage,
      );
    }

    // Update header with new completion percentage
    if (typeof updateHeaderAuth === "function") {
      updateHeaderAuth();
    }

    return true;
  } catch (error) {
    // apiCall handles 401 by calling forceLogout()
    return false;
  }
}

// Check auth on load for protected pages
document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;
  const protectedPages = [
    "dashboard.html",
    "wallet.html",
    "profile.html",
    "history.html",
    "booking-detail.html",
    "driver.html",
    "driver-profile.html",
    "notifications.html",
  ];

  if (protectedPages.some((page) => path.includes(page))) {
    checkAuthStatus();
  }
});

// ─── Rides (mock data stored in localStorage) ─────────────
function getRides() {
  return JSON.parse(localStorage.getItem("icab_rides") || "[]");
}

function saveRides(rides) {
  localStorage.setItem("icab_rides", JSON.stringify(rides));
}

function estimateFare() {
  const pickup = document.getElementById("pickup").value.trim();
  const dropoff = document.getElementById("dropoff").value.trim();
  const container = document.getElementById("fareEstimateContainer");
  const valueEl = document.getElementById("fareValue");

  if (!container || !valueEl) return;

  if (pickup && dropoff) {
    // Basic mock calculation based on string length
    var base = 50;
    var dist = (pickup.length + dropoff.length) * 5;
    var est = base + dist;

    valueEl.textContent = "₹ " + est.toFixed(2);
    container.classList.remove("hidden");
  } else {
    container.classList.add("hidden");
  }
}

function bookRide() {
  const pickup = document.getElementById("pickup").value.trim();
  const dropoff = document.getElementById("dropoff").value.trim();
  const msgEl = document.getElementById("bookingMsg");
  const pct = parseInt(localStorage.getItem("icab_profile_pct") || "0");

  if (!pickup || !dropoff) {
    msgEl.textContent = "Please enter both pickup and drop-off locations.";
    msgEl.className = "mt-4 p-4 rounded-xl font-bold bg-red-100 text-red-600";
    msgEl.classList.remove("hidden");
    return;
  }

  // Task 4.4 Profile completion guard (Restrict if less than 50%)
  if (pct < 50) {
    showToast(
      "Please complete at least 50% of your profile to book a ride! 👤",
      "error",
    );
    window.location.href = "profile.html";
    return;
  }

  const user = getCurrentUser();
  const rides = getRides();

  // Task 4.5 Use estimated fare
  var base = 50;
  var dist = (pickup.length + dropoff.length) * 5;
  var est = base + dist;

  const newRide = {
    id: Date.now(),
    userId: user ? user.id : null,
    pickup: pickup,
    dropoff: dropoff,
    status: "pending",
    fare: est.toFixed(2),
    createdAt: new Date().toLocaleString(),
  };

  rides.unshift(newRide);
  saveRides(rides);

  msgEl.textContent =
    'Ride booked from "' +
    pickup +
    '" to "' +
    dropoff +
    '"! Finding a driver...';
  msgEl.className = "mt-4 p-4 rounded-xl font-bold bg-green-100 text-green-600";
  msgEl.classList.remove("hidden");

  document.getElementById("pickup").value = "";
  document.getElementById("dropoff").value = "";
  document.getElementById("fareEstimateContainer").classList.add("hidden");

  // Refresh rides table & dashboard cards
  loadRides();

  setTimeout(function () {
    msgEl.classList.add("hidden");
  }, 4000);
}

function showProfileWarning() {
  const warningEl = document.getElementById("profileWarningContainer");
  if (!warningEl) return;

  var pct = parseInt(localStorage.getItem("icab_profile_pct") || "0");
  if (pct < 100) {
    // Dynamic colors based on percentage (matching profile logic)
    var colorClass = "amber";
    if (pct >= 80) colorClass = "green";
    else if (pct < 50) colorClass = "red";

    // Link target based on role
    var role = localStorage.getItem("icab_user_role");
    var profilePage =
      role === "driver" ? "driver-profile.html" : "profile.html";

    warningEl.innerHTML =
      '<div class="p-4 rounded-2xl bg-' +
      colorClass +
      "-100 dark:bg-" +
      colorClass +
      "-950/30 border border-" +
      colorClass +
      "-200 dark:border-" +
      colorClass +
      '-800 flex items-center justify-between">' +
      '<div class="flex items-center gap-3 text-' +
      colorClass +
      "-700 dark:text-" +
      colorClass +
      '-400 font-bold">' +
      "<span>" +
      (pct >= 80 ? "✅" : "⚠️") +
      " Your profile is " +
      pct +
      "% complete!</span>" +
      "</div>" +
      '<a href="' +
      profilePage +
      '" class="text-xs px-3 py-1.5 bg-' +
      colorClass +
      "-600 text-white rounded-lg hover:bg-" +
      colorClass +
      '-700 transition font-bold">Complete Now →</a>' +
      "</div>";
    warningEl.classList.remove("hidden");
  } else {
    warningEl.classList.add("hidden");
  }
}

function loadRides() {
  // Task 4.4 Profile Warning
  showProfileWarning();

  const tableEl = document.getElementById("ridesTable");

  // 1. Total Rides
  if (totalEl) totalEl.textContent = userRides.length;

  // 2. Wallet Balance
  if (walletEl) {
    var bal = parseFloat(localStorage.getItem("icab_wallet_balance") || "0");
    walletEl.textContent = "₹ " + bal.toFixed(2);
  }

  // 3. Active Ride Status
  const activeRide = userRides.find(function (r) {
    return (
      r.userId == userId &&
      (r.status === "pending" ||
        r.status === "accepted" ||
        r.status === "in_progress")
    );
  });

  if (activeEl) {
    if (activeRide) {
      activeEl.innerHTML =
        '<a href="booking-detail.html?id=' +
        activeRide.id +
        '" class="text-yellow-500 hover:underline flex items-center gap-1">Live <span class="animate-pulse">●</span></a>';
    } else {
      activeEl.textContent = "None";
    }
  }

  // 4. Task 4.3 Live Tracking Card
  if (liveEl) {
    if (activeRide && activeRide.status === "in_progress") {
      liveEl.innerHTML =
        '<div class="card p-0 overflow-hidden relative">' +
        '<div class="h-48 bg-gray-200 dark:bg-gray-800 flex items-center justify-center relative overflow-hidden">' +
        "<!-- Mock Map Effect -->" +
        '<div class="absolute inset-0 opacity-20" style="background-image: radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0); background-size: 24px 24px;"></div>' +
        '<span class="relative z-10 text-6xl drop-shadow-lg">🚖</span>' +
        '<div class="absolute top-4 left-4 px-3 py-1 bg-green-500 text-white text-xs font-black rounded-full animate-pulse">LIVE TRACKING</div>' +
        "</div>" +
        '<div class="p-6 flex items-center justify-between">' +
        "<div>" +
        '<h3 class="text-xl font-black text-gray-900 dark:text-white">Headed to ' +
        activeRide.dropoff +
        "</h3>" +
        '<p class="text-sm text-gray-500 font-medium">Driver arrives in 3 mins</p>' +
        "</div>" +
        "<button onclick=\"window.location.href='booking-detail.html?id=" +
        activeRide.id +
        '\'" class="px-6 py-2.5 bg-zinc-900 border border-zinc-500 dark:bg-white dark:text-black text-white font-bold rounded-xl hover:scale-105 transition">View Full Map</button>' +
        "</div>" +
        "</div>";
      liveEl.classList.remove("hidden");
    } else {
      liveEl.classList.add("hidden");
    }
  }

  // 5. Recent Rides Table
  if (userRides.length === 0) {
    tableEl.innerHTML =
      '<p class="text-center py-6 text-gray-400">No rides yet. Book your first ride! 🚕</p>';
    return;
  }

  var rows = userRides
    .slice()
    .sort(function (a, b) {
      return (
        Number(b.createdAt || b.date || b.id || 0) -
        Number(a.createdAt || a.date || a.id || 0)
      );
    })
    .slice(0, 5)
    .map(function (r) {
      var rawDate = r.date || r.createdAt;
      var parsedDate = rawDate ? new Date(Number(rawDate) || rawDate) : null;
      var hasValidDate = parsedDate && !isNaN(parsedDate.getTime());
      var dateLabel = hasValidDate
        ? parsedDate.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Date unavailable";
      var statusLabel = (r.status || "pending").replace("_", " ");
      var fareValue = isNaN(parseFloat(r.fare))
        ? "0.00"
        : parseFloat(r.fare).toFixed(2);

      return (
        '<a href="booking-detail.html?id=' +
        r.id +
        '" class="block rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/70 px-4 py-4 hover:border-yellow-400/60 hover:bg-yellow-50/40 dark:hover:bg-zinc-800 transition">' +
        '<div class="flex items-start justify-between gap-4">' +
        '<div class="min-w-0 flex-1">' +
        '<div class="flex items-center gap-2 text-xs text-zinc-400 mb-2">' +
        "<span>" +
        dateLabel +
        "</span>" +
        '<span class="inline-block h-1 w-1 rounded-full bg-zinc-400"></span>' +
        "<span>#" +
        (r.id || "N/A") +
        "</span>" +
        "</div>" +
        '<p class="text-sm font-bold text-zinc-900 dark:text-white truncate">' +
        (r.pickup || "Pickup unavailable") +
        "</p>" +
        '<p class="text-xs text-zinc-400 mt-1 truncate">to ' +
        (r.dropoff || "Drop-off unavailable") +
        "</p>" +
        "</div>" +
        '<div class="text-right shrink-0">' +
        '<p class="text-lg font-black text-zinc-900 dark:text-white">₹ ' +
        fareValue +
        "</p>" +
        '<span class="status-badge status-' +
        (r.status || "pending") +
        ' mt-2 inline-flex">' +
        statusLabel +
        "</span>" +
        "</div>" +
        "</div>" +
        "</a>"
      );
    })
    .join("");

  tableEl.innerHTML = '<div class="space-y-3">' + rows + "</div>";
}

// ─── Forgot Password Flow ──────────────────────────────────
function openForgotPassword() {
  closeLogin();
  var modal = document.getElementById("forgotPasswordModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    setTimeout(function () {
      modal.classList.remove("opacity-0");
      document.getElementById("forgotPasswordBox").classList.remove("scale-95");
    }, 10);
  }
}

function closeForgotPassword() {
  var modal = document.getElementById("forgotPasswordModal");
  if (modal) {
    modal.classList.add("opacity-0");
    document.getElementById("forgotPasswordBox").classList.add("scale-95");
    setTimeout(function () {
      modal.classList.add("hidden");
      modal.style.display = "";
      // Reset forms
      document.getElementById("forgotStep1").classList.remove("hidden");
      document.getElementById("forgotStep2").classList.add("hidden");
      document.getElementById("forgotContact").value = "";
      document.getElementById("forgotOtp").value = "";
      document.getElementById("newPassword").value = "";
      document.getElementById("confirmNewPassword").value = "";
      document.getElementById("forgotOtp").type = "text"; // reset toggles
      document.getElementById("newPassword").type = "password";
      document.getElementById("confirmNewPassword").type = "password";
      if (document.getElementById("eyeNew"))
        document.getElementById("eyeNew").textContent = "👁️";
      if (document.getElementById("eyeConfirmNew"))
        document.getElementById("eyeConfirmNew").textContent = "👁️";
      document.getElementById("forgotError").classList.add("hidden");
      document.getElementById("forgotSuccess").classList.add("hidden");
      document
        .getElementById("passwordDuplicateMessage")
        .classList.add("hidden");
      document
        .getElementById("passwordValidationError")
        .classList.add("hidden");
      // Reset new email/phone inputs
      document.getElementById("forgotEmailInput").value = "";
      document.getElementById("forgotPhoneInput").value = "";
      // Reset button states to default (email active)
      document.getElementById("forgotEmailBtn").className =
        "flex-1 py-2.5 px-3 rounded-xl font-bold text-sm transition duration-200 bg-yellow-400 text-black hover:bg-yellow-500";
      document.getElementById("forgotPhoneBtn").className =
        "flex-1 py-2.5 px-3 rounded-xl font-bold text-sm transition duration-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600";
      document.getElementById("forgotEmailInput").classList.remove("hidden");
      document.getElementById("forgotPhoneInput").classList.add("hidden");
      forgotContactMethod = "email";
    }, 100);
  }
}

// Track which contact method is selected
var forgotContactMethod = "email";

function forgotSelectMethod(method) {
  forgotContactMethod = method;
  var emailInput = document.getElementById("forgotEmailInput");
  var phoneInput = document.getElementById("forgotPhoneInput");
  var emailBtn = document.getElementById("forgotEmailBtn");
  var phoneBtn = document.getElementById("forgotPhoneBtn");

  // Clear both inputs
  emailInput.value = "";
  phoneInput.value = "";

  // Clear error messages
  document.getElementById("forgotError").classList.add("hidden");
  document.getElementById("forgotSuccess").classList.add("hidden");

  if (method === "email") {
    // Show email, hide phone
    emailInput.classList.remove("hidden");
    phoneInput.classList.add("hidden");
    // Update button styles
    emailBtn.className =
      "flex-1 py-2.5 px-3 rounded-xl font-bold text-sm transition duration-200 bg-yellow-400 text-black hover:bg-yellow-500";
    phoneBtn.className =
      "flex-1 py-2.5 px-3 rounded-xl font-bold text-sm transition duration-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600";
    emailInput.focus();
  } else if (method === "phone") {
    // Show phone, hide email
    emailInput.classList.add("hidden");
    phoneInput.classList.remove("hidden");
    // Update button styles
    emailBtn.className =
      "flex-1 py-2.5 px-3 rounded-xl font-bold text-sm transition duration-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600";
    phoneBtn.className =
      "flex-1 py-2.5 px-3 rounded-xl font-bold text-sm transition duration-200 bg-yellow-400 text-black hover:bg-yellow-500";
    phoneInput.focus();
  }
}

// Live validate new password against current password
var passwordCheckTimeout = null;

// Show validation errors in real-time
function showValidationErrors() {
  var otp = document.getElementById("forgotOtp").value.trim();
  var newPwd = document.getElementById("newPassword").value.trim();
  var confirmPwd = document.getElementById("confirmNewPassword").value.trim();
  var errorEl = document.getElementById("passwordValidationError");

  var errors = [];

  // Check OTP
  if (!otp) {
    errors.push("❌ OTP is required");
  }

  // Check password fields
  if (!newPwd) {
    errors.push("❌ New password is required");
  } else {
    // Check password strength
    var strength = getPasswordStrength(newPwd);
    if (strength < 5) {
      errors.push("❌ Password does not meet security criteria");
    }
  }

  // Check confirm password
  if (!confirmPwd) {
    errors.push("❌ Confirm password is required");
  } else if (newPwd !== confirmPwd) {
    errors.push("❌ Passwords do not match");
  }

  // Check for duplicate password (if no other errors)
  if (errors.length === 0) {
    var duplicateMsg = document.getElementById("passwordDuplicateMessage");
    if (duplicateMsg && !duplicateMsg.classList.contains("hidden")) {
      errors.push(
        "❌ This password is already in use. Please use a different password.",
      );
    }
  }

  // Display errors or hide error container
  if (errors.length > 0) {
    errorEl.innerHTML = errors.map((err) => `<div>${err}</div>`).join("");
    errorEl.classList.remove("hidden");
  } else {
    errorEl.classList.add("hidden");
  }
}

async function validateForgotPassword() {
  var newPassword = document.getElementById("newPassword").value.trim();
  var duplicateMsg = document.getElementById("passwordDuplicateMessage");

  // If password is empty, hide duplicate check UI
  if (!newPassword) {
    duplicateMsg.classList.add("hidden");
    showValidationErrors();
    return;
  }

  // If no users pending reset, don't check
  if (!pendingResetUsersRaw || pendingResetUsersRaw.length === 0) {
    duplicateMsg.classList.add("hidden");
    showValidationErrors();
    return;
  }

  try {
    // Get the contact info based on method
    var contact = "";
    if (forgotContactMethod === "email") {
      contact = document.getElementById("forgotEmailInput").value.trim();
    } else if (forgotContactMethod === "phone") {
      contact = document.getElementById("forgotPhoneInput").value.trim();
    }

    if (!contact) {
      duplicateMsg.classList.add("hidden");
      showValidationErrors();
      return;
    }

    // Call API to check if password is duplicate for the first user in the list
    var firstUser = pendingResetUsersRaw[0];
    var payload = {
      new_password: newPassword,
      role: firstUser.role,
    };

    if (forgotContactMethod === "email") {
      payload.email = contact;
    } else {
      payload.phone = contact;
    }

    var response = await apiCall("/auth/check-password/", "POST", payload);

    // Update duplicate message visibility but keep it hidden from UI
    // We'll show it in the validation errors instead
    if (response.is_duplicate) {
      duplicateMsg.classList.remove("hidden");
    } else {
      duplicateMsg.classList.add("hidden");
    }
  } catch (error) {
    duplicateMsg.classList.add("hidden");
  }

  showValidationErrors();
}

// Attach live validation to all password fields
document.addEventListener("DOMContentLoaded", function () {
  var newPasswordInput = document.getElementById("newPassword");
  var confirmPasswordInput = document.getElementById("confirmNewPassword");
  var otpInput = document.getElementById("forgotOtp");

  if (newPasswordInput) {
    newPasswordInput.addEventListener("input", function () {
      // Debounce the API check for duplicate (200ms)
      clearTimeout(passwordCheckTimeout);
      passwordCheckTimeout = setTimeout(validateForgotPassword, 200);
      // Immediate error display
      showValidationErrors();
    });
  }

  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener("input", function () {
      showValidationErrors();
    });
  }

  if (otpInput) {
    otpInput.addEventListener("input", function () {
      showValidationErrors();
    });
  }
});

// Memory for the reset flow
var pendingResetUserIds = [];
var pendingResetUsersRaw = [];

async function sendOtp() {
  // Get contact from appropriate input based on selected method
  var contact = "";
  if (forgotContactMethod === "email") {
    contact = document.getElementById("forgotEmailInput").value.trim();
  } else if (forgotContactMethod === "phone") {
    contact = document.getElementById("forgotPhoneInput").value.trim();
  }

  var errorEl = document.getElementById("forgotError");
  var successEl = document.getElementById("forgotSuccess");

  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  if (!contact) {
    errorEl.textContent =
      forgotContactMethod === "email"
        ? "Please enter your email address."
        : "Please enter your phone number.";
    errorEl.classList.remove("hidden");
    return;
  }

  // Validate based on method
  if (forgotContactMethod === "email" && !isValidEmail(contact)) {
    errorEl.textContent = "Please enter a valid email address.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (forgotContactMethod === "phone" && !isValidPhone(contact)) {
    errorEl.textContent = "Please enter a valid 10-digit mobile number.";
    errorEl.classList.remove("hidden");
    return;
  }

  try {
    // Call API to lookup user
    var queryParam = forgotContactMethod === "email" ? "email" : "phone";
    var response = await apiCall(
      "/auth/lookup-user/?" + queryParam + "=" + encodeURIComponent(contact),
      "GET",
    );

    // Success - user found
    var users = response.users || [];

    // Store the users
    pendingResetUsersRaw = users;
    pendingResetUserIds = users.map(function (u) {
      return u.id;
    });

    successEl.textContent = "OTP Sent to " + contact + ". (Use 123456 to test)";
    successEl.classList.remove("hidden");

    // Populate Dropdown if > 1 account
    var selectBox = document.getElementById("accountTypeSelector");
    var selectEl = document.getElementById("forgotAccountSelect");
    if (selectBox && selectEl) {
      if (users.length > 1) {
        var optionsHtml = "";
        users.forEach(function (u) {
          var label = u.role === "driver" ? "Driver Account" : "Rider Account";
          optionsHtml +=
            '<option value="' +
            u.id +
            '">' +
            label +
            " (" +
            u.name +
            ")</option>";
        });
        optionsHtml += '<option value="all">Both Accounts</option>';
        selectEl.innerHTML = optionsHtml;
        selectBox.classList.remove("hidden");
      } else {
        // Only 1 account, hide dropdown
        selectBox.classList.add("hidden");
      }
    }

    // Transition to Step 2 (faster - after 1 second)
    setTimeout(function () {
      successEl.classList.add("hidden");
      document.getElementById("forgotStep1").classList.add("hidden");
      document.getElementById("forgotStep2").classList.remove("hidden");
      document.getElementById("forgotDesc").textContent =
        "We sent a 6-digit code. Please enter it below.";
    }, 1000);
  } catch (error) {
    // Error - user not found or API error
    var errorMsg =
      (error.data && error.data.error) ||
      "Unable to lookup account. Please try again.";
    errorEl.textContent = errorMsg;
    errorEl.classList.remove("hidden");
  }
}

function backToForgotStep1() {
  document.getElementById("forgotStep2").classList.add("hidden");
  document.getElementById("forgotStep1").classList.remove("hidden");
  document.getElementById("forgotDesc").textContent =
    "Enter your email or phone number to receive an OTP.";
  document.getElementById("forgotError").classList.add("hidden");
  document.getElementById("forgotSuccess").classList.add("hidden");
  pendingResetUserIds = [];
  pendingResetUsersRaw = [];
}

async function verifyOtpAndReset() {
  var otp = document.getElementById("forgotOtp").value.trim();
  var newPwd = document.getElementById("newPassword").value.trim();
  var confirmPwd = document.getElementById("confirmNewPassword").value.trim();
  var errorEl = document.getElementById("forgotError");
  var successEl = document.getElementById("forgotSuccess");

  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  if (!pendingResetUserIds || pendingResetUserIds.length === 0) {
    errorEl.textContent = "Session expired. Please start over.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (otp !== "123456") {
    errorEl.textContent = "Invalid OTP. Please try again.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (getPasswordStrength(newPwd) < 5) {
    errorEl.textContent = "Password does not meet all security criteria.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (newPwd !== confirmPwd) {
    errorEl.textContent = "Passwords do not match.";
    errorEl.classList.remove("hidden");
    return;
  }

  // Get contact info from the input that was used
  var contact = "";
  if (forgotContactMethod === "email") {
    contact = document.getElementById("forgotEmailInput").value.trim();
  } else if (forgotContactMethod === "phone") {
    contact = document.getElementById("forgotPhoneInput").value.trim();
  }

  // Check if dropdown is active and what they selected
  var selectedId = "all";
  var selectBox = document.getElementById("accountTypeSelector");
  var selectEl = document.getElementById("forgotAccountSelect");
  if (selectBox && !selectBox.classList.contains("hidden") && selectEl) {
    selectedId = selectEl.value;
  }

  // Filter users based on selection
  var usersToUpdate = pendingResetUsersRaw;
  if (selectedId !== "all") {
    var selectedIdInt = parseInt(selectedId, 10);
    usersToUpdate = usersToUpdate.filter(function (u) {
      return u.id === selectedIdInt;
    });
  }

  try {
    // Quick validation: Check if password is duplicate before proceeding
    var firstUser = usersToUpdate[0];
    var checkPayload = {
      new_password: newPwd,
      role: firstUser.role,
    };

    if (forgotContactMethod === "email") {
      checkPayload.email = contact;
    } else {
      checkPayload.phone = contact;
    }

    var checkResponse = await apiCall(
      "/auth/check-password/",
      "POST",
      checkPayload,
    );
    if (checkResponse.is_duplicate) {
      errorEl.textContent =
        "Password is already in use. Please use a different password.";
      errorEl.classList.remove("hidden");
      return;
    }

    // Call API to reset password for each selected user
    var successCount = 0;
    var failedCount = 0;

    // Make API calls for each user
    for (var i = 0; i < usersToUpdate.length; i++) {
      var user = usersToUpdate[i];
      var payload = {
        new_password: newPwd,
        role: user.role,
      };

      // Add email or phone based on what was used
      if (forgotContactMethod === "email") {
        payload.email = contact;
      } else {
        payload.phone = contact;
      }

      try {
        await apiCall("/auth/forgot-password/", "POST", payload);
        successCount++;
      } catch (error) {
        failedCount++;
        console.error("Password reset failed for user", user.id, error);
      }
    }

    // Handle results
    if (failedCount > 0 && successCount === 0) {
      errorEl.textContent =
        "Failed to reset password. Please try again or contact support.";
      errorEl.classList.remove("hidden");
      return;
    }

    // Show success message immediately
    if (successCount > 1) {
      successEl.textContent =
        "Password reset successfully for both your Rider & Driver accounts!";
    } else {
      var roleLabel =
        usersToUpdate[0] && usersToUpdate[0].role === "driver"
          ? "Driver"
          : "Rider";
      successEl.textContent =
        "Password reset successfully for your " + roleLabel + " account!";
    }

    successEl.classList.remove("hidden");

    // Clear form fields immediately (don't wait for modal to close)
    document.getElementById("forgotOtp").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmNewPassword").value = "";
    document.getElementById("passwordValidationError").classList.add("hidden");

    // Also update localStorage for consistency
    var users = getUsers();
    users = users.map(function (u) {
      if (
        usersToUpdate.some(function (updated) {
          return updated.id === u.id;
        })
      ) {
        u.password = newPwd;
      }
      return u;
    });
    saveUsers(users);

    // Close modal and show login after 3 seconds (let user see success message)
    setTimeout(function () {
      closeForgotPassword();
      openLogin();
    }, 3000);
  } catch (error) {
    errorEl.textContent = "An error occurred. Please try again.";
    errorEl.classList.remove("hidden");
    console.error("Password reset error:", error);
  }
}
