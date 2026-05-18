var dpCropper = null;

// ── Load Profile from API ───────────────────────────────
document.addEventListener("DOMContentLoaded", async function () {
  var userId = localStorage.getItem("icab_user_id");
  var role = localStorage.getItem("icab_user_role");
  if (!userId || role !== "driver") {
    window.location.href = "index.html";
    return;
  }

  try {
    // Fetch live profile from API
    var me = await apiCall("/driver/profile/", "GET");
    if (!me) return;

    // Photo
    updateDpAvatar(me.name, me.avatar_url);

    // Display header
    dp("driverProfileName", me.name || "—");
    dp("driverProfileEmail", me.email || "—");
    dp("driverProfileDisplayPhone", me.phone ? "+91 " + me.phone : "—");
    dp("driverProfileRating", parseFloat(me.rating || 0).toFixed(1));

    // Stats (from profile/backend)
    dp("driverProfileTotalRides", me.total_rides || 0);
    if (me.created_at) {
      dp(
        "driverProfileJoined",
        new Date(me.created_at).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      );
    }

    // Editable form fields
    val("dpFirst", me.first_name || "");
    val("dpLast", me.last_name || "");
    val("dpEmail", me.email || "");
    val("dpPhone", me.phone || "");
    val("dpDob", me.date_of_birth || "");

    // Set Gender Radio
    if (me.gender) {
      var gInput = document.querySelector(
        'input[name="gender"][value="' + me.gender + '"]',
      );
      if (gInput) gInput.checked = true;
    }

    val("dpVehicle", me.vehicle_model || "");
    val("dpPlate", me.vehicle_plate || "");
    val("dpLicense", me.license_no || "");

    // Set vehicle type dropdown
    var vtSelect = document.getElementById("dpVehicleType");
    if (vtSelect && me.vehicle_type) vtSelect.value = me.vehicle_type;

    // Set DOB max and min dates (18+ requirement)
    var dobInput = document.getElementById("dpDob");
    if (dobInput) {
      var today = new Date();
      var eighteenYearsAgo = new Date(
        today.getFullYear() - 18,
        today.getMonth(),
        today.getDate(),
      );
      var year = eighteenYearsAgo.getFullYear();
      var month = String(eighteenYearsAgo.getMonth() + 1).padStart(2, "0");
      var day = String(eighteenYearsAgo.getDate()).padStart(2, "0");
      dobInput.max = year + "-" + month + "-" + day;
      dobInput.min = "1950-01-01"; // Reasonable minimum for a driver
    }

    // Calculate completion on load
    setTimeout(calcDpCompletion, 100);
  } catch (err) {
    console.error("Error loading profile:", err);
    showToast("Could not load profile from server.", "error");
  }
});

function dp(id, v) {
  var e = document.getElementById(id);
  if (e) e.textContent = v;
}
function val(id, v) {
  var e = document.getElementById(id);
  if (e) e.value = v;
}

// ── Profile Completion ──────────────────────────────────
function calcDpCompletion() {
  var textFields = [
    "dpFirst",
    "dpLast",
    "dpEmail",
    "dpPhone",
    "dpDob",
    "dpVehicle",
    "dpPlate",
    "dpLicense",
  ];
  var filled = 0;
  textFields.forEach(function (id) {
    var el = document.getElementById(id);
    if (el && el.value.trim()) filled++;
  });

  // Gender check
  var gender = document.querySelector('input[name="gender"]:checked');
  if (gender) filled++;

  // +1 for photo (Avatar from API or local storage if just uploaded)
  var avatarImg = document.querySelector("#driverProfileAvatar img");
  if (avatarImg) filled++;

  var total = textFields.length + 2; // 8 text + 1 gender + 1 photo = 10
  var pct = Math.round((filled / total) * 100);

  var bar = document.getElementById("dpCompletionBar");
  var pctEl = document.getElementById("dpCompletionPct");
  var msg = document.getElementById("dpCompletionMsg");

  if (bar) bar.style.width = pct + "%";
  if (pctEl) pctEl.textContent = pct + "%";

  if (msg) {
    if (pct === 100) {
      msg.textContent =
        "🎉 Profile complete! You're all set to receive ride requests.";
    } else {
      msg.textContent =
        pct >= 80
          ? "Perfect! Just a few more touches."
          : pct >= 50
            ? "Almost there! Add your remaining details."
            : "Complete your profile to start receiving more ride requests.";
    }

    // Color Logic Parity with User Profile
    if (pctEl) {
      pctEl.classList.remove(
        "text-red-500",
        "text-amber-500",
        "text-green-500",
      );
      if (pct >= 80) pctEl.classList.add("text-green-500");
      else if (pct >= 50) pctEl.classList.add("text-amber-500");
      else pctEl.classList.add("text-red-500");
    }

    if (bar) {
      bar.classList.remove(
        "from-red-400",
        "to-red-600",
        "from-amber-400",
        "to-amber-500",
        "from-green-400",
        "to-green-600",
      );
      if (pct >= 80) bar.classList.add("from-green-400", "to-green-600");
      else if (pct >= 50) bar.classList.add("from-amber-400", "to-amber-500");
      else bar.classList.add("from-red-400", "to-red-600");
    }
  }

  // Sync with header badge
  localStorage.setItem("icab_profile_pct", pct);
  if (typeof updateHeaderAuth === "function") updateHeaderAuth();
  if (typeof showProfileWarning === "function") showProfileWarning();
}

// ── Update Avatar ───────────────────────────────────────
function updateDpAvatar(name, photo) {
  var avatarEl = document.getElementById("driverProfileAvatar");
  var removeBtn = document.getElementById("dpRemovePhotoBtn");
  if (!avatarEl) return;
  if (photo) {
    // Add cache buster if it's already a URL
    var cacheBuster = photo.includes("?") ? "&t=" : "?t=";
    cacheBuster += new Date().getTime();

    avatarEl.innerHTML =
      '<img src="' +
      photo +
      cacheBuster +
      '" alt="Profile" style="width:100%;height:100%;object-fit:cover;" />';
    avatarEl.style.background = "none";
    // Only show remove link if we are in Edit Mode
    if (removeBtn) {
      if (isEditMode) removeBtn.classList.remove("hidden");
      else removeBtn.classList.add("hidden");
    }
  } else {
    avatarEl.innerHTML = (name || "?").charAt(0).toUpperCase();
    avatarEl.style.background = "";
    if (removeBtn) removeBtn.classList.add("hidden");
  }
}

// ── Photo Upload + Cropper ─────────────────────────────
function handleDpPhotoUpload(event) {
  var file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast("Photo must be under 5MB.", "error");
    return;
  }

  var reader = new FileReader();
  reader.onload = function (e) {
    var modal = document.getElementById("dpCropModal");
    var image = document.getElementById("dpCropImage");
    if (!modal || !image) return;
    image.src = e.target.result;
    modal.classList.remove("hidden");
    if (dpCropper) dpCropper.destroy();
    dpCropper = new Cropper(image, { aspectRatio: 1, viewMode: 2 });
  };
  reader.readAsDataURL(file);
}

function closeDpCropModal() {
  document.getElementById("dpCropModal").classList.add("hidden");
  if (dpCropper) {
    dpCropper.destroy();
    dpCropper = null;
  }
}

async function applyDpCrop() {
  if (!dpCropper) return;
  const canvas = dpCropper.getCroppedCanvas({ width: 400, height: 400 });
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

  try {
    const result = await apiCall("/driver/profile/", "PUT", {
      avatar: dataUrl,
    });
    const profile = result.profile || result;
    updateDpAvatar(profile.name, profile.avatar_url);

    // Header Avatar Sync
    const headerImg = document.getElementById("headerAvatarImg");
    if (headerImg && profile.avatar_url) {
      var cb = profile.avatar_url.includes("?") ? "&t=" : "?t=";
      headerImg.src = profile.avatar_url + cb + new Date().getTime();
      headerImg.classList.remove("hidden");
    }

    showToast("Profile photo updated!", "success");
    closeDpCropModal();
    calcDpCompletion();
  } catch (err) {
    showToast("Failed to upload photo.", "error");
  }
}

async function removeDpPhoto() {
  try {
    const result = await apiCall("/driver/profile/", "PUT", { avatar: null });
    const profile = result.profile || result;
    updateDpAvatar(profile.name, null);

    // Update LocalStorage to remove photo
    localStorage.removeItem("icab_user_photo");

    const headerImg = document.getElementById("headerAvatarImg");
    if (headerImg) headerImg.classList.add("hidden");
    showToast("Photo removed.", "info");
    calcDpCompletion();
  } catch (err) {
    showToast("Failed to remove photo.", "error");
  }
}

// ── Edit Mode Toggle ──────────────────────────────────
var isEditMode = false;

function toggleEditMode() {
  isEditMode = !isEditMode;
  const btn = document.getElementById("toggleEditBtn");
  const icon = document.getElementById("btnIcon");
  const text = document.getElementById("btnText");
  const avatarLabel = document.getElementById("dpAvatarUploadLabel");
  const removePhotoBtn = document.getElementById("dpRemovePhotoBtn");

  if (isEditMode) {
    // Switch to Save mode
    icon.textContent = "💾";
    text.textContent = "Save Changes";
    btn.classList.replace("bg-yellow-400", "bg-green-500");
    btn.classList.replace("hover:bg-yellow-500", "hover:bg-green-600");
    btn.classList.add("text-white");
    btn.classList.remove("text-black");

    enableFields(true);
    if (avatarLabel) avatarLabel.classList.remove("hidden");
    // Only show remove btn if there's actually a photo
    const avatarEl = document.getElementById("driverProfileAvatar");
    if (avatarEl && avatarEl.querySelector("img") && removePhotoBtn) {
      removePhotoBtn.classList.remove("hidden");
    }
  } else {
    // Actually save changes
    saveDriverProfile();
  }
}

function enableFields(enabled) {
  const fields = ["dpFirst", "dpLast", "dpEmail", "dpPhone", "dpDob"];

  fields.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      if (enabled) {
        el.removeAttribute("readonly");
        el.classList.remove("cursor-not-allowed", "opacity-80");
        el.classList.add("bg-white", "dark:bg-zinc-800");
      } else {
        el.setAttribute("readonly", true);
        el.classList.add("cursor-not-allowed", "opacity-80");
        el.classList.remove("bg-white");
      }
    }
  });

  // Radios
  const radios = document.querySelectorAll('input[name="gender"]');
  radios.forEach((r) => {
    r.disabled = !enabled;
    const label = r.closest(".gender-option");
    if (label) {
      if (enabled) {
        label.classList.remove("cursor-not-allowed", "opacity-60");
      } else {
        label.classList.add("cursor-not-allowed", "opacity-60");
      }
    }
  });
}

function resetEditBtn() {
  isEditMode = false;
  const btn = document.getElementById("toggleEditBtn");
  const icon = document.getElementById("btnIcon");
  const text = document.getElementById("btnText");
  const avatarLabel = document.getElementById("dpAvatarUploadLabel");
  const removePhotoBtn = document.getElementById("dpRemovePhotoBtn");

  icon.textContent = "✏️";
  text.textContent = "Edit Profile";
  btn.classList.replace("bg-green-500", "bg-yellow-400");
  btn.classList.replace("hover:bg-green-600", "hover:bg-yellow-500");
  btn.classList.remove("text-white");
  btn.classList.add("text-black");

  enableFields(false);
  if (avatarLabel) avatarLabel.classList.add("hidden");
  if (removePhotoBtn) removePhotoBtn.classList.add("hidden");
}

// ── Save Profile ────────────────────────────────────────
async function saveDriverProfile() {
  const first = val_id("dpFirst");
  const last = val_id("dpLast");
  const email = val_id("dpEmail");
  const phone = val_id("dpPhone");
  const dob = val_id("dpDob");
  const gender = document.querySelector('input[name="gender"]:checked')?.value;
  const vehicle = val_id("dpVehicle");
  const plate = val_id("dpPlate");
  const license = val_id("dpLicense");
  const vehicleType =
    document.getElementById("dpVehicleType")?.value || "sedan";

  if (!first || !last || !email || !phone) {
    showToast("Please fill in all required fields.", "error");
    return;
  }

  // DOB Validation 18+
  if (dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    if (age < 18) {
      showToast("You must be at least 18 years old.", "error");
      return;
    }
  }

  try {
    const result = await apiCall("/driver/profile/", "PUT", {
      first_name: first,
      last_name: last,
      email: email,
      phone: phone,
      date_of_birth: dob,
      gender: gender,
      vehicle_type: vehicleType,
      vehicle_model: vehicle,
      vehicle_plate: plate,
      license_no: license,
    });

    const profile = result.profile || result;
    dp("driverProfileName", profile.name);
    dp("driverProfileEmail", profile.email);
    localStorage.setItem("icab_user_name", profile.name);
    localStorage.setItem("icab_user_email", profile.email);

    showToast("Profile saved successfully!", "success");
    resetEditBtn();
    calcDpCompletion();
    if (typeof updateHeaderAuth === "function") updateHeaderAuth();
  } catch (err) {
    showToast(err.message || "Failed to save profile.", "error");
  }
}

function dpValidateFirstName() {
  const input = document.getElementById("dpFirst");
  if (!input) return;
  let filtered = input.value.replace(/[^a-zA-Z]/g, "");
  if (filtered.length > 0) {
    filtered =
      filtered.charAt(0).toUpperCase() + filtered.slice(1).toLowerCase();
  }
  input.value = filtered;
  calcDpCompletion();
}

function dpValidateLastName() {
  const input = document.getElementById("dpLast");
  if (!input) return;
  let filtered = input.value.replace(/[^a-zA-Z]/g, "");
  if (filtered.length > 0) {
    filtered =
      filtered.charAt(0).toUpperCase() + filtered.slice(1).toLowerCase();
  }
  input.value = filtered;
  calcDpCompletion();
}

function dpValidateEmail() {
  const input = document.getElementById("dpEmail");
  if (!input) return;
  const value = input.value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Mark as dirty/clean or show visual feedback if needed
  calcDpCompletion();
}

function val_id(id) {
  const e = document.getElementById(id);
  return e ? e.value.trim() : "";
}

// ─── Change Password ─────────────────────────────────────
function dpValidateCurrentPassword() {
  const input = document.getElementById("dpCurrentPass");
  const msg = document.getElementById("dpCurrentPassMsg");
  if (!input || !msg) return;
  const val = input.value.trim();
  if (!val) {
    msg.textContent = "";
    return;
  }

  apiCall("/auth/verify-password/", "POST", { password: val })
    .then((res) => {
      if (res.valid) {
        msg.textContent = "✓ Password correct";
        msg.className = "text-green-500 text-xs";
      } else {
        msg.textContent = "❌ Incorrect password";
        msg.className = "text-red-500 text-xs";
      }
    })
    .catch(() => {
      msg.textContent = "❌ Verification failed";
      msg.className = "text-red-500 text-xs";
    });
}

function dpValidateNewPassword() {
  const input = document.getElementById("dpNewPass");
  const msg = document.getElementById("dpNewPassMsg");
  const currentVal = document.getElementById("dpCurrentPass").value.trim();
  if (!input || !msg) return;
  const val = input.value.trim();
  if (!val) {
    msg.textContent = "";
    return;
  }

  if (currentVal && val === currentVal) {
    msg.textContent = "❌ Must be different from old password";
    msg.className = "text-red-500 text-xs";
    return;
  }

  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,20}$/;
  if (!regex.test(val)) {
    if (val.length < 8) msg.textContent = "❌ At least 8 characters";
    else if (val.length > 20) msg.textContent = "❌ Max 20 characters";
    else if (!/[A-Z]/.test(val)) msg.textContent = "❌ Need uppercase";
    else if (!/[a-z]/.test(val)) msg.textContent = "❌ Need lowercase";
    else if (!/\d/.test(val)) msg.textContent = "❌ Need a number";
    else if (!/[^a-zA-Z0-9]/.test(val))
      msg.textContent = "❌ Need special char";
    msg.className = "text-red-500 text-xs";
  } else {
    msg.textContent = "✓ Strong password";
    msg.className = "text-green-500 text-xs";
  }
}

function dpValidateConfirmPassword() {
  const input = document.getElementById("dpConfirmPass");
  const msg = document.getElementById("dpConfirmPassMsg");
  const newPass = document.getElementById("dpNewPass").value.trim();
  if (!input || !msg) return;
  const val = input.value.trim();
  if (!val) {
    msg.textContent = "";
    return;
  }

  if (val !== newPass) {
    msg.textContent = "❌ Passwords do not match";
    msg.className = "text-red-500 text-xs";
  } else {
    msg.textContent = "✓ Passwords match";
    msg.className = "text-green-500 text-xs";
  }
}

async function changeDriverPassword() {
  const current = val_id("dpCurrentPass");
  const newPass = val_id("dpNewPass");
  const confirm = val_id("dpConfirmPass");
  const mainMsg = document.getElementById("dpPassMsg");

  function showMainMsg(text, type) {
    mainMsg.textContent = text;
    mainMsg.classList.remove("hidden");
    mainMsg.className =
      "text-sm font-semibold p-3 rounded-xl mt-2 " +
      (type === "error"
        ? "text-red-500 bg-red-50 dark:bg-red-900/20"
        : "text-green-600 bg-green-50 dark:bg-green-900/20");
  }

  if (!current || !newPass || !confirm) {
    showMainMsg("Fill all fields.", "error");
    return;
  }
  if (newPass === current) {
    showMainMsg("New password must be different.", "error");
    return;
  }

  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,20}$/;
  if (!regex.test(newPass)) {
    showMainMsg("Password doesn't meet requirements.", "error");
    return;
  }
  if (newPass !== confirm) {
    showMainMsg("Passwords do not match.", "error");
    return;
  }

  try {
    await apiCall("/auth/change-password/", "POST", {
      old_password: current,
      new_password: newPass,
    });
    showMainMsg("✅ Password updated successfully!", "success");
    showToast("Password updated!", "success");
    document.getElementById("dpCurrentPass").value = "";
    document.getElementById("dpNewPass").value = "";
    document.getElementById("dpConfirmPass").value = "";
    document.getElementById("dpCurrentPassMsg").textContent = "";
    document.getElementById("dpNewPassMsg").textContent = "";
    document.getElementById("dpConfirmPassMsg").textContent = "";
  } catch (err) {
    showMainMsg("❌ " + (err.message || "Failed to update"), "error");
  }
}

// ── Account Management ──────────────────────────────────
async function deleteDriverAccount() {
  showConfirm({
    icon: "🗑️",
    title: "Close Your Driver Account?",
    message:
      "All your Driver Data including earnings,ratings and profile will be permanently removed. This action cannot be undone.",
    confirmText: "Yes",
    cancelText: "Cancel",
    type: "danger",
    onConfirm: async function () {
      try {
        await apiCall("/auth/me/", "DELETE");
        showToast("Account deleted successfully.", "success");

        // Preserve theme preference
        const savedTheme = localStorage.getItem("icab_theme");
        localStorage.clear();
        if (savedTheme) {
          localStorage.setItem("icab_theme", savedTheme);
        }

        // Wait a bit so user can see the success toast
        setTimeout(() => {
          window.location.href = "index.html";
        }, 1500);
      } catch (err) {
        showToast("Failed to delete account.", "error");
      }
    },
  });
}
