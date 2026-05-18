/**
 * profile.js — Profile page logic
 * API-integrated version: Loads & saves profile data from/to backend
 */

var REQUIRED_FIELDS = ["pfFirstName", "pfLastName", "pfEmail", "pfPhone"];
var ALL_FIELDS = [
  "pfFirstName",
  "pfLastName",
  "pfEmail",
  "pfPhone",
  "pfDob",
  "pfHome",
  "pfWork",
];

var profileCache = {}; // Cache for API profile data
var emergencyContactsCache = []; // Cache for emergency contacts from API
var pendingEmergencyChanges = {
  // Track local changes not yet saved
  toAdd: [], // New contacts to add
  toUpdate: {}, // Contacts to update (id -> {name, phone})
};

// ─── Load profile on page ready ──────────────────────────
// ─── Unsaved Changes Tracking ──────────────────────────
var hasUnsavedChanges = false;
var pendingNavigation = null;

function markProfileDirty() {
  hasUnsavedChanges = true;
}

function markProfileClean() {
  hasUnsavedChanges = false;
}

document.addEventListener("DOMContentLoaded", function () {
  // Redirect to home if not logged in
  var userId = localStorage.getItem("icab_user_id");
  if (!userId) {
    window.location.href = "index.html";
    return;
  }

  loadProfileFromAPI();
  loadEmergencyContacts();

  // Add change listeners to all form fields to detect unsaved changes
  var allInputs = document.querySelectorAll(
    "input[type='text'], input[type='email'], input[type='tel'], input[type='date'], input[type='radio'], input[type='checkbox'], select, textarea",
  );
  allInputs.forEach(function (input) {
    input.addEventListener("change", markProfileDirty);
    input.addEventListener("input", markProfileDirty);
  });

  // ─── Override navigateFromMenu to check for unsaved changes ───
  var originalNavigateFromMenu = window.navigateFromMenu;
  window.navigateFromMenu = function (url) {
    if (hasUnsavedChanges) {
      console.log(
        "Unsaved changes on profile - intercepting navigation to: " + url,
      );
      showUnsavedChangesPopup(url);
      return;
    }
    // If no unsaved changes, proceed with original navigation
    if (typeof originalNavigateFromMenu === "function") {
      originalNavigateFromMenu(url);
    } else {
      window.location.href = url;
    }
  };

  // ─── Also prevent direct navigation via links and sidebar items ───
  document.addEventListener(
    "click",
    function (e) {
      if (!hasUnsavedChanges) return;

      // Check for regular links
      var link = e.target.closest("a[href]");
      if (link) {
        var href = link.getAttribute("href");
        if (
          href &&
          !href.startsWith("#") &&
          !href.startsWith("javascript:") &&
          !href.startsWith("http")
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          console.log("Unsaved changes detected - intercepting link: " + href);
          showUnsavedChangesPopup(href);
          return false;
        }
      }

      // Check for sidebar items
      var sidebarItem = e.target.closest(".sidebar-item");
      if (sidebarItem) {
        var url = sidebarItem.getAttribute("data-href");
        if (url) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          console.log(
            "Unsaved changes detected - intercepting sidebar: " + url,
          );
          showUnsavedChangesPopup(url);
          return false;
        }
      }
    },
    true,
  );

  // Set DOB max and min dates
  var dobInput = document.getElementById("pfDob");
  if (dobInput) {
    var today = new Date();

    // Max: 18 years ago
    var eighteenYearsAgo = new Date(
      today.getFullYear() - 18,
      today.getMonth(),
      today.getDate(),
    );
    var year = eighteenYearsAgo.getFullYear();
    var month = String(eighteenYearsAgo.getMonth() + 1).padStart(2, "0");
    var day = String(eighteenYearsAgo.getDate()).padStart(2, "0");
    dobInput.max = year + "-" + month + "-" + day;

    // Min: 1971-01-01 (already set in HTML, but this ensures it)
    dobInput.min = "1971-01-01";
  }
});

// ─── Load Profile from API ──────────────────────────────
function loadProfileFromAPI() {
  // GET /api/auth/me/
  apiCall("/auth/me/", "GET")
    .then(function (response) {
      profileCache = response;
      localStorage.setItem("icab_user_name", response.name || "");
      localStorage.setItem("icab_user_email", response.email || "");

      // Load avatar from API if it exists
      if (response.avatar_url) {
        localStorage.setItem("icab_user_photo", response.avatar_url);
      }

      // Load profile completion percentage from API (source of truth)
      if (response.profile_completion_percentage !== undefined) {
        localStorage.setItem(
          "icab_profile_pct",
          response.profile_completion_percentage,
        );
      }

      renderProfile();
      loadProfileStats();
      updateCompletion();
      markProfileClean();
    })
    .catch(function (error) {
      console.error("Failed to load profile from API:", error);
      // Fallback to localStorage
      loadProfileFromLocalStorage();
    });
}

function loadProfileFromLocalStorage() {
  var profile = getSavedProfile();
  profileCache = profile;

  if (!profile.pfFirstName || !profile.pfLastName) {
    var fullName = localStorage.getItem("icab_user_name") || "";
    var parts = fullName.split(" ");
    if (!profile.pfFirstName) profile.pfFirstName = parts[0] || "";
    if (!profile.pfLastName)
      profile.pfLastName = parts.slice(1).join(" ") || "";
  }

  if (!profile.pfEmail)
    profile.pfEmail = localStorage.getItem("icab_user_email") || "";

  renderProfile();
  updateCompletion();
  // NOTE: No longer calling recalculateProfileCompletion() here.
  // The API response provides the authoritative profile_completion_percentage,
  // which is already saved to localStorage by loadProfileFromAPI().
}

// ─── Render profile into form ────────────────────────────
function renderProfile() {
  var profile = profileCache;

  // Map API response fields to form field IDs
  var fieldMapping = {
    pfFirstName: "first_name",
    pfLastName: "last_name",
    pfEmail: "email",
    pfPhone: "phone",
    pfHome: "home_address",
    pfWork: "work_address",
    pfDob: "date_of_birth",
  };

  // Fill text inputs from both profileCache (API) and localStorage (form data)
  ALL_FIELDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;

    // First check mapped API fields
    var apiField = fieldMapping[id];
    if (apiField && profile[apiField]) {
      el.value = profile[apiField];
    }
    // Then check localStorage form data
    else if (profile[id]) {
      el.value = profile[id];
    }
  });

  // Radio: Gender
  if (profile.gender) {
    var radio = document.querySelector(
      'input[name="gender"][value="' + profile.gender + '"]',
    );
    if (radio) radio.checked = true;
  }

  // Update display card
  updateDisplayCard(profile);

  // Render emergency contacts
  renderEmergencyContacts();

  updateCompletion();
}

// ─── Load Profile Stats from API ────────────────────────
function loadProfileStats() {
  // Load ride count from GET /api/rides/
  apiCall("/rides/", "GET")
    .then(function (response) {
      var rides = Array.isArray(response) ? response : [];
      var totalRidesEl = document.getElementById("statTotalRides");
      if (totalRidesEl) totalRidesEl.textContent = rides.length;
    })
    .catch(function (error) {
      console.error("Failed to load ride stats:", error);
      // Fallback to localStorage
      var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");
      var totalRidesEl = document.getElementById("statTotalRides");
      if (totalRidesEl) totalRidesEl.textContent = rides.length;
    });

  // Joined date from user profile
  var joinedEl = document.getElementById("statJoined");
  if (joinedEl) {
    var createdAt = profileCache.created_at || new Date().toISOString();
    joinedEl.textContent = new Date(createdAt).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
}

// ─── Update display card (avatar + name + email) ─────────
function updateDisplayCard(profile) {
  // Map API fields to display (prefer profileCache API data)
  var firstName = profile.first_name || profile.pfFirstName || "";
  var lastName = profile.last_name || profile.pfLastName || "";
  var name =
    firstName && lastName
      ? firstName + " " + lastName
      : firstName ||
        lastName ||
        profile.name ||
        profile.pfName ||
        localStorage.getItem("icab_user_name") ||
        "?";
  var email =
    profile.email ||
    profile.pfEmail ||
    localStorage.getItem("icab_user_email") ||
    "";
  var phone = profile.phone || profile.pfPhone || "";
  var photo = localStorage.getItem("icab_user_photo") || "";

  var avatarEl = document.getElementById("profileAvatar");
  var nameEl = document.getElementById("profileDisplayName");
  var emailEl = document.getElementById("profileDisplayEmail");
  var phoneEl = document.getElementById("profileDisplayPhone");
  var removeBtn = document.getElementById("removePhotoBtn");

  if (avatarEl) {
    if (photo) {
      // Show uploaded photo
      avatarEl.innerHTML =
        '<img src="' +
        photo +
        '" alt="Profile" style="width:100%;height:100%;object-fit:cover;" />';
      avatarEl.style.background = "none";
      // Only show remove link if we are in Edit Mode
      if (removeBtn) {
        if (isEditMode) removeBtn.classList.remove("hidden");
        else removeBtn.classList.add("hidden");
      }
    } else {
      // Show initials fallback
      avatarEl.innerHTML = name.charAt(0).toUpperCase();
      avatarEl.style.background = "";
      if (removeBtn) removeBtn.classList.add("hidden");
    }
  }

  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = email;
  if (phoneEl) phoneEl.textContent = phone ? "+91 " + phone : "";

  // Update header avatar too if it exists
  var headerAvatar = document.getElementById("headerAvatarImg");
  if (headerAvatar) {
    if (photo) {
      headerAvatar.src = photo;
      headerAvatar.classList.remove("hidden");
    } else {
      headerAvatar.classList.add("hidden");
    }
  }
}

// ─── Photo Upload & Cropping ──────────────────────────────
var cropper = null;

function handlePhotoUpload(event) {
  var file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Please select an image file.", "error");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showToast("Photo must be under 5MB.", "error");
    return;
  }

  var reader = new FileReader();
  reader.onload = function (e) {
    var modal = document.getElementById("cropModal");
    var image = document.getElementById("cropImage");
    if (!modal || !image) return;

    image.src = e.target.result;
    modal.classList.remove("hidden");

    if (cropper) cropper.destroy();

    cropper = new Cropper(image, {
      aspectRatio: 1,
      viewMode: 2,
      dragMode: "move",
      background: false,
      autoCropArea: 1,
      responsive: true,
    });
  };
  reader.readAsDataURL(file);
}

function closeCropModal() {
  var modal = document.getElementById("cropModal");
  if (modal) modal.classList.add("hidden");
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  // Reset input so same file can be selected again
  var input = document.getElementById("photoInput");
  if (input) input.value = "";
}

function applyCrop() {
  if (!cropper) return;

  var canvas = cropper.getCroppedCanvas({
    width: 400,
    height: 400,
  });

  var croppedDataUrl = canvas.toDataURL("image/jpeg", 0.9);
  localStorage.setItem("icab_user_photo", croppedDataUrl);

  var profile = getSavedProfile();
  updateDisplayCard(profile);
  updateCompletion();
  showToast("Profile photo updated!", "success");
  closeCropModal();
}

// ─── Remove Photo ─────────────────────────────────────────
function removePhoto() {
  localStorage.removeItem("icab_user_photo");
  var profile = getSavedProfile();
  updateDisplayCard(profile);
  updateCompletion();
  showToast("Profile photo removed.", "info");

  // Reset file input
  var input = document.getElementById("photoInput");
  if (input) input.value = "";
}

// Remove pending contact before saving
function removePendingContact(tempId) {
  pendingEmergencyChanges.toAdd = pendingEmergencyChanges.toAdd.filter(
    function (c) {
      return c.tempId !== tempId;
    },
  );
  showToast("✓ Contact removed", "info");
  renderEmergencyContacts();
  updateCompletion();
}

// Save all pending emergency contact changes to API
function saveEmergencyContactChanges() {
  var promises = [];

  // Update contacts (deletes happen immediately, not staged)
  Object.keys(pendingEmergencyChanges.toUpdate).forEach(function (contactId) {
    var data = pendingEmergencyChanges.toUpdate[contactId];
    var updatePromise = apiCall(
      "/auth/emergency-contacts/" + contactId + "/",
      "PUT",
      {
        name: data.name,
        phone: data.phone,
      },
    ).catch(function (error) {
      console.error("Failed to update contact " + contactId, error);
      return Promise.resolve();
    });
    promises.push(updatePromise);
  });

  // Add new contacts
  pendingEmergencyChanges.toAdd.forEach(function (contact) {
    var addPromise = apiCall("/auth/emergency-contacts/", "POST", {
      name: contact.name,
      phone: contact.phone,
    }).catch(function (error) {
      console.error("Failed to add contact", error);
      return Promise.resolve();
    });
    promises.push(addPromise);
  });

  // Wait for all emergency contact operations to complete
  if (promises.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(promises).then(function () {
    // Clear pending changes BEFORE reloading
    pendingEmergencyChanges = { toAdd: [], toUpdate: {} };

    // Reload emergency contacts from API
    return new Promise(function (resolve) {
      loadEmergencyContacts();
      // Small delay to ensure cache is updated and rendered
      setTimeout(resolve, 800);
    });
  });
}

// ── Edit Mode Toggle ──────────────────────────────────
var isEditMode = false;

function toggleEditMode() {
  isEditMode = !isEditMode;
  const btn = document.getElementById("toggleEditBtn");
  const icon = document.getElementById("btnIcon");
  const text = document.getElementById("btnText");
  const avatarLabel = document.getElementById("avatarUploadLabel");
  const removePhotoBtn = document.getElementById("removePhotoBtn");

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
    // Show remove btn if photo exists
    const avatarEl = document.getElementById("profileAvatar");
    if (avatarEl && avatarEl.querySelector("img") && removePhotoBtn) {
      removePhotoBtn.classList.remove("hidden");
    }
  } else {
    // Actually save changes
    saveAllProfile();
  }
}

function enableFields(enabled) {
  const fields = [
    "pfFirstName",
    "pfLastName",
    "pfEmail",
    "pfPhone",
    "pfDob",
    "pfHome",
    "pfWork",
    "newContactName",
    "newContactPhone",
  ];

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

  // Update emergency contact buttons
  const addContactBtn = document.getElementById("addContactBtn");
  const clearContactBtn = document.getElementById("clearContactBtn");
  if (addContactBtn) {
    addContactBtn.disabled = !enabled;
    if (enabled) {
      addContactBtn.classList.remove("cursor-not-allowed", "opacity-50");
    } else {
      addContactBtn.classList.add("cursor-not-allowed", "opacity-50");
    }
  }
  if (clearContactBtn) {
    clearContactBtn.disabled = !enabled;
    if (enabled) {
      clearContactBtn.classList.remove("cursor-not-allowed", "opacity-50");
    } else {
      clearContactBtn.classList.add("cursor-not-allowed", "opacity-50");
    }
  }

  // Refresh existing contacts to show/hide edit/delete buttons
  renderEmergencyContacts();
}

function resetEditBtn() {
  isEditMode = false;
  const btn = document.getElementById("toggleEditBtn");
  const icon = document.getElementById("btnIcon");
  const text = document.getElementById("btnText");
  const avatarLabel = document.getElementById("avatarUploadLabel");
  const removePhotoBtn = document.getElementById("removePhotoBtn");

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

// ─── Save all profile ─────────────────────────────────────
function saveAllProfile() {
  var profile = {};

  ALL_FIELDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) profile[id] = el.value.trim();
  });

  // Gender radio
  var genderEl = document.querySelector('input[name="gender"]:checked');
  if (genderEl) profile.gender = genderEl.value;

  // Validate required fields
  var missing = [];
  if (!profile.pfFirstName) missing.push("First Name");
  if (!profile.pfLastName) missing.push("Last Name");
  if (!profile.pfEmail) missing.push("Email");
  if (!profile.pfPhone) missing.push("Phone Number");
  if (!profile.pfDob) missing.push("Date of Birth");
  if (!profile.pfHome) missing.push("Home Address");
  if (!profile.pfWork) missing.push("Work Address");
  if (!profile.gender) missing.push("Gender");

  if (missing.length > 0) {
    showToast("Please fill in: " + missing.join(", "), "error");
    return;
  }

  // Validate first name
  if (!validateFirstNameFormat(profile.pfFirstName)) {
    showToast("First name can only contain alphabets (A-Z, a-z).", "error");
    return;
  }

  // Validate last name
  if (!validateLastNameFormat(profile.pfLastName)) {
    showToast("Last name can only contain alphabets (A-Z, a-z).", "error");
    return;
  }

  // Validate email
  if (!validateEmailFormat(profile.pfEmail)) {
    showToast("Please enter a valid email address.", "error");
    return;
  }

  // Validate phone
  if (!validatePhoneFormat(profile.pfPhone)) {
    showToast("Phone number must be exactly 10 digits.", "error");
    return;
  }

  // Validate age (18+)
  var dob = new Date(profile.pfDob);
  var today = new Date();
  var age = today.getFullYear() - dob.getFullYear();
  var monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  if (age < 18) {
    showToast("You must be 18 years or older to use this service.", "error");
    return;
  }

  // Combine first and last names for display
  var fullName = profile.pfFirstName + " " + profile.pfLastName;

  // Get the photo from localStorage
  var photoDataUrl = localStorage.getItem("icab_user_photo");

  if (photoDataUrl && !photoDataUrl.startsWith("http")) {
    // Convert data URL to Blob before sending
    fetch(photoDataUrl)
      .then(function (res) {
        return res.blob();
      })
      .then(function (blob) {
        // Create FormData with all profile fields
        var formData = new FormData();
        formData.append("first_name", profile.pfFirstName);
        formData.append("last_name", profile.pfLastName);
        formData.append("name", fullName);
        formData.append("email", profile.pfEmail);
        formData.append("phone", profile.pfPhone);
        formData.append("home_address", profile.pfHome);
        formData.append("work_address", profile.pfWork);
        formData.append("date_of_birth", profile.pfDob);
        formData.append("gender", profile.gender);
        formData.append("avatar", blob, "profile.jpg");

        sendProfileUpdateWithAvatar(formData, profile, fullName);
      })
      .catch(function () {
        // If conversion fails, send without avatar
        var formData = new FormData();
        formData.append("first_name", profile.pfFirstName);
        formData.append("last_name", profile.pfLastName);
        formData.append("name", fullName);
        formData.append("email", profile.pfEmail);
        formData.append("phone", profile.pfPhone);
        formData.append("home_address", profile.pfHome);
        formData.append("work_address", profile.pfWork);
        formData.append("date_of_birth", profile.pfDob);
        formData.append("gender", profile.gender);
        formData.append("avatar", ""); // EXPLICIT REMOVAL
        sendProfileUpdateWithAvatar(formData, profile, fullName);
      });
  } else {
    // No local photo to convert, use apiCall directly with FormData
    var formData = new FormData();
    formData.append("first_name", profile.pfFirstName);
    formData.append("last_name", profile.pfLastName);
    formData.append("name", fullName);
    formData.append("email", profile.pfEmail);
    formData.append("phone", profile.pfPhone);
    formData.append("home_address", profile.pfHome);
    formData.append("work_address", profile.pfWork);
    formData.append("date_of_birth", profile.pfDob);
    formData.append("gender", profile.gender);

    if (photoDataUrl) {
      if (photoDataUrl.startsWith("http")) {
        // Already a URL (from database), append it as avatar field
        formData.append("avatar", photoDataUrl);
      }
      // If it's a dataURL, it was already handled by the fetch().then() above
    } else {
      // EXPLICIT: Tell backend to remove the avatar
      formData.append("avatar", "");
    }

    sendProfileUpdateWithAvatar(formData, profile, fullName);
  }
}

function sendProfileUpdateWithAvatar(formData, profile, fullName) {
  // Use apiCall which properly handles FormData with multipart/form-data
  apiCall("/auth/me/", "PUT", formData)
    .then(function (response) {
      // Update cache and localStorage
      profileCache = response.user || response;
      localStorage.setItem("icab_profile", JSON.stringify(profile));
      localStorage.setItem("icab_user_name", fullName);
      localStorage.setItem("icab_user_email", profile.pfEmail);

      // Also save individual fields for recalculateProfileCompletion()
      localStorage.setItem("icab_profile_pfFirstName", profile.pfFirstName);
      localStorage.setItem("icab_profile_pfLastName", profile.pfLastName);
      localStorage.setItem("icab_profile_pfEmail", profile.pfEmail);
      localStorage.setItem("icab_profile_pfPhone", profile.pfPhone);
      localStorage.setItem("icab_profile_pfDob", profile.pfDob);
      localStorage.setItem("icab_profile_pfHome", profile.pfHome);
      localStorage.setItem("icab_profile_pfWork", profile.pfWork);
      localStorage.setItem("icab_profile_gender", profile.gender || "");

      // Load avatar from response if it exists
      if (response.avatar_url) {
        localStorage.setItem("icab_user_photo", response.avatar_url);
      }

      // Get profile completion percentage from API response (source of truth)
      if (response.profile_completion_percentage !== undefined) {
        localStorage.setItem(
          "icab_profile_pct",
          response.profile_completion_percentage,
        );
      }

      updateDisplayCard(profile);
      updateCompletion();
      resetEditBtn();

      if (typeof updateHeaderAuth === "function") updateHeaderAuth();

      // NOW save emergency contact changes
      return saveEmergencyContactChanges();
    })
    .then(function () {
      showToast("Profile and avatar saved successfully !!", "success");
      markProfileClean();
      // Reset pending changes (deletions happen immediately, not staged)
      pendingEmergencyChanges = { toAdd: [], toUpdate: {} };
    })
    .catch(function (error) {
      console.error("Failed to save profile:", error);
      showToast("Error saving profile. Please try again.", "error");
    });
}

// ─── Profile Completion Bar ───────────────────────────────
function updateCompletion() {
  var profile = getSavedProfile();

  // Total: 6 form fields + gender + avatar + emergency contacts = 9 fields (matching backend)
  var total = 9;
  var filled = 0;

  var checkFields = [
    "pfFirstName",
    "pfLastName",
    "pfPhone",
    "pfDob",
    "pfHome",
    "pfWork",
  ];

  checkFields.forEach(function (id) {
    var el = document.getElementById(id);
    var val = el ? el.value.trim() : profile[id] || "";
    if (val) filled++;
  });

  // Count gender (7th field)
  var genderEl = document.querySelector('input[name="gender"]:checked');
  if (genderEl) filled++;

  // Count avatar (8th field) - LIVE CHECK from localStorage or Cache
  var hasLocalAvatar = !!localStorage.getItem("icab_user_photo");
  var hasAPIavatar = !!profileCache.avatar;
  if (hasLocalAvatar || hasAPIavatar) filled++;

  // Count emergency contacts (9th field) - check both cache and pending additions
  var hasContacts =
    (emergencyContactsCache && emergencyContactsCache.length > 0) ||
    (pendingEmergencyChanges && pendingEmergencyChanges.toAdd.length > 0);
  if (hasContacts) filled++;

  // Calculate percentage (floor division matches backend)
  var pct = Math.floor((filled * 100) / total);

  var bar = document.getElementById("completionBar");
  var pctEl = document.getElementById("completionPct");
  var msg = document.getElementById("completionMsg");

  if (bar) {
    bar.style.width = pct + "%";
    // Change bar color based on percentage
    bar.classList.remove(
      "bg-gradient-to-r",
      "from-yellow-400",
      "to-yellow-500",
      "from-orange-400",
      "to-orange-500",
      "from-green-400",
      "to-green-500",
    );
    if (pct >= 80) {
      bar.classList.add("bg-gradient-to-r", "from-green-400", "to-green-500");
    } else if (pct >= 60) {
      bar.classList.add("bg-gradient-to-r", "from-orange-400", "to-orange-500");
    } else {
      bar.classList.add("bg-gradient-to-r", "from-yellow-400", "to-yellow-500");
    }
  }

  if (pctEl) {
    pctEl.textContent = pct + "%";
    pctEl.classList.remove(
      "text-yellow-500",
      "text-orange-500",
      "text-green-500",
    );
    if (pct >= 80) {
      pctEl.classList.add("text-green-500");
    } else if (pct >= 60) {
      pctEl.classList.add("text-orange-500");
    } else {
      pctEl.classList.add("text-yellow-500");
    }
  }

  if (msg) {
    if (pct === 100) {
      msg.textContent =
        "🎉 Profile is complete! You're all set for a smooth ride.";
    } else if (pct >= 80) {
      msg.textContent = "Almost there! Fill in the remaining details.";
    } else if (pct >= 60) {
      msg.textContent = "Good progress! Complete your profile.";
    } else {
      msg.textContent = "Complete your profile to unlock faster bookings.";
    }
  }

  // NOTE: Do NOT save to localStorage here.
  // The API is the source of truth for profile_completion_percentage.
  // It will be updated from the API response after save, not from UI calculations.

  // Update header completion if it exists
  updateHeaderCompletion(pct);
}

// ─── Update Header Completion ─────────────────────────────
function updateHeaderCompletion(pct) {
  // Update profile completion badge in sidebar/header
  var headerPctElement = document.querySelector("[data-profile-completion]");
  if (headerPctElement) {
    headerPctElement.textContent = pct + "%";
  }

  // Also update via custom event so other scripts can listen
  window.dispatchEvent(
    new CustomEvent("profileCompletionUpdated", {
      detail: { percentage: pct },
    }),
  );
}

// ─── Change Password ──────────────────────────────────────
function changePassword() {
  var current = document.getElementById("pfCurrentPass").value.trim();
  var newPass = document.getElementById("pfNewPass").value.trim();
  var confirm = document.getElementById("pfConfirmPass").value.trim();
  var msgEl = document.getElementById("passMsg");

  msgEl.classList.remove(
    "hidden",
    "text-green-600",
    "text-red-500",
    "bg-green-50",
    "bg-red-50",
    "dark:bg-green-900/20",
    "dark:bg-red-900/20",
  );

  function showPassMsg(text, type) {
    msgEl.textContent = text;
    msgEl.classList.remove("hidden");
    if (type === "error") {
      msgEl.classList.add("text-red-500", "bg-red-50", "dark:bg-red-900/20");
    } else {
      msgEl.classList.add(
        "text-green-600",
        "bg-green-50",
        "dark:bg-green-900/20",
      );
    }
  }

  if (!current || !newPass || !confirm) {
    showPassMsg("Please fill in all password fields.", "error");
    return;
  }

  // Check if new password is same as current password
  if (newPass === current) {
    showPassMsg(
      "New password must be different from current password.",
      "error",
    );
    return;
  }

  // Validate new password format (same as registration model)
  var passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,20}$/;
  if (!passwordRegex.test(newPass)) {
    showPassMsg(
      "Password must be 8-20 chars with uppercase, lowercase, number, and special character.",
      "error",
    );
    return;
  }

  if (newPass !== confirm) {
    showPassMsg("New passwords do not match.", "error");
    return;
  }

  // POST /api/auth/change-password/ - Change password via API
  apiCall("/auth/change-password/", "POST", {
    old_password: current,
    new_password: newPass,
  })
    .then(function (response) {
      document.getElementById("pfCurrentPass").value = "";
      document.getElementById("pfNewPass").value = "";
      document.getElementById("pfConfirmPass").value = "";
      document.getElementById("currentPassMsg").textContent = "";
      document.getElementById("newPassMsg").textContent = "";
      document.getElementById("confirmPassMsg").textContent = "";
      showPassMsg("✅ Password updated successfully!", "success");
      showToast("Password changed successfully!", "success");
    })
    .catch(function (error) {
      console.error("Failed to change password:", error);
      var errorMsg = error.message || "Failed to change password";
      showPassMsg("❌ " + errorMsg, "error");
    });
}

// ─── Current Password Validation (check against database) ────
function validateCurrentPassword() {
  var input = document.getElementById("pfCurrentPass");
  var msg = document.getElementById("currentPassMsg");

  if (!input || !msg) return;

  var value = input.value.trim();

  if (!value) {
    msg.textContent = "";
    msg.className = "text-gray-500 text-xs";
    return;
  }

  // Live check with API
  apiCall("/auth/verify-password/", "POST", {
    password: value,
  })
    .then(function (response) {
      if (response.valid) {
        msg.textContent = "✓ Password correct";
        msg.className = "text-green-500 text-xs";
      } else {
        msg.textContent = "❌ Incorrect password";
        msg.className = "text-red-500 text-xs";
      }
    })
    .catch(function (error) {
      msg.textContent = "❌ Cannot verify password";
      msg.className = "text-red-500 text-xs";
    });
}

// ─── New Password Validation ───────────────────────────────
function validateNewPassword() {
  var input = document.getElementById("pfNewPass");
  var msg = document.getElementById("newPassMsg");

  if (!input || !msg) return;

  var value = input.value.trim();

  if (!value) {
    msg.textContent = "";
    msg.className = "text-gray-500 text-xs";
    return;
  }

  // Check if new password is same as current password
  var currentPassInput = document.getElementById("pfCurrentPass");
  var currentPass = currentPassInput ? currentPassInput.value.trim() : "";

  if (currentPass && value === currentPass) {
    msg.textContent = "❌ New password must be different from current password";
    msg.className = "text-red-500 text-xs";
    return;
  }

  // Password regex: 8-20 chars with uppercase, lowercase, number, special char
  var passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,20}$/;

  if (!passwordRegex.test(value)) {
    // Provide specific feedback
    if (value.length < 8) {
      msg.textContent = "❌ At least 8 characters";
    } else if (value.length > 20) {
      msg.textContent = "❌ Maximum 20 characters";
    } else if (!/[A-Z]/.test(value)) {
      msg.textContent = "❌ Missing uppercase letter";
    } else if (!/[a-z]/.test(value)) {
      msg.textContent = "❌ Missing lowercase letter";
    } else if (!/\d/.test(value)) {
      msg.textContent = "❌ Missing number";
    } else if (!/[^a-zA-Z0-9]/.test(value)) {
      msg.textContent = "❌ Missing special character";
    }
    msg.className = "text-red-500 text-xs";
  } else {
    msg.textContent = "✓ Strong password";
    msg.className = "text-green-500 text-xs";
  }

  // Auto-validate confirm password if it has value
  var confirmInput = document.getElementById("pfConfirmPass");
  if (confirmInput && confirmInput.value) {
    validateConfirmPassword();
  }
}

// ─── Confirm Password Validation ──────────────────────────
function validateConfirmPassword() {
  var newPassInput = document.getElementById("pfNewPass");
  var confirmInput = document.getElementById("pfConfirmPass");
  var msg = document.getElementById("confirmPassMsg");

  if (!confirmInput || !msg) return;

  var newPass = newPassInput ? newPassInput.value.trim() : "";
  var confirmPass = confirmInput.value.trim();

  if (!confirmPass) {
    msg.textContent = "";
    msg.className = "text-gray-500 text-xs";
    return;
  }

  if (newPass === confirmPass && newPass) {
    msg.textContent = "✓ Passwords match";
    msg.className = "text-green-500 text-xs";
  } else if (newPass !== confirmPass) {
    msg.textContent = "❌ Passwords do not match";
    msg.className = "text-red-500 text-xs";
  } else {
    msg.textContent = "";
    msg.className = "text-gray-500 text-xs";
  }
}

// ─── Helper: get saved profile ────────────────────────────
function getSavedProfile() {
  return JSON.parse(localStorage.getItem("icab_profile") || "{}");
}

// ─── Unsaved Changes Popup (Discard or Cancel) ──────────────
function showUnsavedChangesPopup(targetUrl) {
  pendingNavigation = targetUrl;

  showConfirm({
    icon: "⚠️",
    title: "Unsaved Changes",
    message: "You have unsaved changes. Do you want to discard them?",
    type: "warning",
    confirmText: "🗑️ Discard Changes",
    cancelText: "❌ Cancel",
    onConfirm: function () {
      // Discard changes and navigate immediately without saving
      markProfileClean();
      pendingNavigation = null;
      window.location.href = targetUrl;
    },
    onCancel: function () {
      // User chose to cancel - stay on this page
      pendingNavigation = null;
    },
  });
}

// ─── Date of Birth Validation ───────────────────────────
function validateDOB() {
  var dobInput = document.getElementById("pfDob");
  var dobMsg = document.getElementById("dobValidationMsg");

  if (!dobInput || !dobMsg) return;

  var selectedDate = dobInput.value;
  if (!selectedDate) {
    dobMsg.textContent = "";
    dobMsg.className = "text-gray-500 text-xs";
    return;
  }

  var dob = new Date(selectedDate);
  var today = new Date();

  // Check minimum date
  var minDate = new Date("1971-01-01");
  if (dob < minDate) {
    dobMsg.textContent = "❌ Date cannot be before 01-01-1971";
    dobMsg.className = "text-red-500 text-xs";
    dobInput.value = "";
    dobInput.classList.add("border-red-500");
    return;
  }

  // Calculate age
  var age = today.getFullYear() - dob.getFullYear();
  var monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  if (age < 18) {
    dobMsg.textContent = "❌ You must be 18+ years old";
    dobMsg.className = "text-red-500 text-xs";
    dobInput.value = "";
    dobInput.classList.add("border-red-500");
  } else {
    dobMsg.textContent = "✓ Age: " + age + " years";
    dobMsg.className = "text-green-500 text-xs";
    dobInput.classList.remove("border-red-500");
  }
}

// ─── First Name Validation ─────────────────────────────
function validateFirstName() {
  var input = document.getElementById("pfFirstName");

  if (!input) return;

  // Remove any non-alphabetic characters
  var filtered = input.value.replace(/[^a-zA-Z]/g, "");

  // Auto-capitalize first letter
  if (filtered.length > 0) {
    filtered =
      filtered.charAt(0).toUpperCase() + filtered.slice(1).toLowerCase();
  }

  // Update input with filtered value
  input.value = filtered;
  markProfileDirty();
}

// ─── Last Name Validation ──────────────────────────────
function validateLastName() {
  var input = document.getElementById("pfLastName");

  if (!input) return;

  // Remove any non-alphabetic characters
  var filtered = input.value.replace(/[^a-zA-Z]/g, "");

  // Auto-capitalize first letter
  if (filtered.length > 0) {
    filtered =
      filtered.charAt(0).toUpperCase() + filtered.slice(1).toLowerCase();
  }

  // Update input with filtered value
  input.value = filtered;
  markProfileDirty();
}

// ─── Email Validation ──────────────────────────────────
function validateEmail() {
  var input = document.getElementById("pfEmail");

  if (!input) return;

  var value = input.value.trim();

  // Email regex matching registration model: ^[^\s@]+@[^\s@]+\.[^\s@]+$
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Validate format but don't show message - just mark dirty
  if (value) {
    emailRegex.test(value);
  }

  markProfileDirty();
}

// ─── Phone Validation ──────────────────────────────────
function validatePhone() {
  var input = document.getElementById("pfPhone");

  if (!input) return;

  // Remove any non-digit characters
  var filtered = input.value.replace(/\D/g, "");

  // Update input with only digits
  input.value = filtered;
  markProfileDirty();
}

// ─── Format Validation Functions (used in saveAllProfile) ──────────────────────────────
function validateFirstNameFormat(name) {
  return /^[a-zA-Z]+$/.test(name) && name.length <= 10;
}

function validateLastNameFormat(name) {
  return /^[a-zA-Z]+$/.test(name) && name.length <= 10;
}

function validateEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhoneFormat(phone) {
  var digitsOnly = phone.replace(/\D/g, "");
  return digitsOnly.length === 10;
}

// ─── Delete Account ───────────────────────────────────────
function deleteAccount() {
  showConfirm({
    icon: "🗑️",
    title: "Close Your Account?",
    message:
      "All your data including ride history, wallet balance and profile will be permanently removed. This action cannot be undone.",
    type: "danger",
    confirmText: "Yes",
    cancelText: "Cancel",
    onConfirm: function () {
      // DELETE /api/auth/me/ - Delete account via API
      apiCall("/auth/me/", "DELETE", {})
        .then(function (response) {
          showToast("Account deleted. Goodbye! 👋", "info");

          // Clear all local session data
          var keysToRemove = [
            "icab_user_id",
            "icab_user_name",
            "icab_user_email",
            "icab_user_role",
            "icab_user_photo",
            "icab_access",
            "icab_refresh",
            "icab_profile",
            "icab_profile_pct",
          ];
          keysToRemove.forEach(function (key) {
            localStorage.removeItem(key);
          });

          // Redirect to landing page
          setTimeout(function () {
            window.location.href = "index.html";
          }, 1500);
        })
        .catch(function (error) {
          console.error("Failed to delete account:", error);
          // Fallback to localStorage cleanup (soft delete simulation)
          var userId = localStorage.getItem("icab_user_id");
          var users = JSON.parse(localStorage.getItem("icab_users") || "[]");
          users = users.filter(function (u) {
            return String(u.id) !== String(userId);
          });
          localStorage.setItem("icab_users", JSON.stringify(users));

          // Remove all their rides
          var rides = JSON.parse(localStorage.getItem("icab_rides") || "[]");
          rides = rides.filter(function (r) {
            return String(r.userId) !== String(userId);
          });
          localStorage.setItem("icab_rides", JSON.stringify(rides));

          // Clear session
          var keysToRemove = [
            "icab_user_id",
            "icab_user_name",
            "icab_user_email",
            "icab_user_role",
            "icab_user_photo",
            "icab_access",
            "icab_refresh",
            "icab_profile",
            "icab_profile_pct",
          ];
          keysToRemove.forEach(function (key) {
            localStorage.removeItem(key);
          });

          showToast("Account deleted. Goodbye! 👋", "info");
          setTimeout(function () {
            window.location.href = "index.html";
          }, 1500);
        });
    },
  });
}

// ─── Emergency Contacts Management ───────────────────────
// Load emergency contacts from API
function loadEmergencyContacts() {
  apiCall("/auth/emergency-contacts/", "GET")
    .then(function (response) {
      console.log("Emergency contacts response:", response);
      // Handle both response formats
      emergencyContactsCache = response.contacts || response || [];
      console.log("Contacts cache after load:", emergencyContactsCache);

      // Save emergency contact count to localStorage for recalculateProfileCompletion()
      localStorage.setItem(
        "icab_emergency_contact_count",
        emergencyContactsCache.length,
      );

      renderEmergencyContacts();
    })
    .catch(function (error) {
      console.error("Failed to load emergency contacts:", error);
      emergencyContactsCache = [];
      localStorage.setItem("icab_emergency_contact_count", "0");
      renderEmergencyContacts();
    });
}

// Render emergency contacts in the form
function renderEmergencyContacts() {
  var container = document.getElementById("emergencyContactsContainer");
  console.log("renderEmergencyContacts called");

  if (!container) {
    console.error("emergencyContactsContainer not found in DOM");
    return;
  }

  container.innerHTML = "";

  // Render API cached contacts
  var displayedCount = 0;

  emergencyContactsCache.forEach(function (contact, index) {
    displayedCount++;
    var contactDiv = document.createElement("div");
    contactDiv.className =
      "border border-gray-300 dark:border-gray-700 rounded-xl p-5 mb-4 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition";
    contactDiv.id = "contact_" + contact.id;

    // Get updated data if editing
    var name = contact.name;
    var phone = contact.phone;
    if (pendingEmergencyChanges.toUpdate[contact.id]) {
      name = pendingEmergencyChanges.toUpdate[contact.id].name;
      phone = pendingEmergencyChanges.toUpdate[contact.id].phone;
    }

    // Strip "+91" prefix for display
    var phoneDigits = phone.replace("+91", "").trim();

    contactDiv.innerHTML = `
      <!-- View Mode -->
      <div id="view_${contact.id}" class="contact-view-mode">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h4 class="font-bold text-lg text-gray-900 dark:text-white">${escapeHtml(name)}</h4>
            <p class="text-gray-600 dark:text-gray-400 text-sm mt-1">+91 ${escapeHtml(phoneDigits)}</p>
          </div>
          <span class="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 px-3 py-1 rounded-full font-semibold whitespace-nowrap ml-4">Contact ${displayedCount}</span>
        </div>
        <div class="flex gap-2 ${isEditMode ? "" : "hidden"}">
          <button type="button" class="btn-primary text-sm px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-semibold rounded-lg transition" onclick="toggleContactEditMode(${contact.id})">
            ✏️ Edit
          </button>
          <button type="button" class="px-3 py-2 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition" onclick="deleteEmergencyContact(${contact.id})">
            🗑️ Delete
          </button>
        </div>
      </div>
      
      <!-- Edit Mode -->
      <div id="edit_${contact.id}" class="contact-edit-mode hidden">
        <div class="space-y-3">
          <div>
            <label class="font-semibold text-sm mb-1 block text-gray-700 dark:text-gray-300">Name (letters & spaces only)</label>
            <input type="text" id="edit_name_${contact.id}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 transition" value="${escapeHtml(name)}" maxlength="25" />
            <small id="edit_name_msg_${contact.id}" class="text-gray-500 dark:text-gray-400 text-xs"></small>
          </div>
          <div>
            <label class="font-semibold text-sm mb-1 block text-gray-700 dark:text-gray-300">Phone (10 digits only)</label>
            <div class="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-zinc-800">
              <span class="px-2 font-semibold text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-zinc-700 border-r border-gray-300 dark:border-gray-600">+91</span>
              <input type="tel" id="edit_phone_${contact.id}" class="flex-1 px-3 py-2 outline-none bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-0" value="${escapeHtml(phoneDigits)}" maxlength="10" />
            </div>
            <small id="edit_phone_msg_${contact.id}" class="text-gray-500 dark:text-gray-400 text-xs"></small>
          </div>
        </div>
        <div class="flex gap-2 mt-4">
          <button type="button" class="btn-primary text-sm px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-semibold rounded-lg transition" onclick="saveEmergencyContact(${contact.id})">
            ✓ Save
          </button>
          <button type="button" class="btn-secondary text-sm px-4 py-2 bg-gray-400 hover:bg-gray-500 dark:bg-gray-600 dark:hover:bg-gray-700 text-white font-semibold rounded-lg transition" onclick="toggleContactEditMode(${contact.id})">
            ✗ Cancel
          </button>
        </div>
      </div>
    `;
    container.appendChild(contactDiv);
  });

  // Render pending additions
  pendingEmergencyChanges.toAdd.forEach(function (contact, index) {
    displayedCount++;
    var contactDiv = document.createElement("div");
    contactDiv.className =
      "border border-amber-300 dark:border-amber-700 rounded-xl p-5 mb-4 bg-amber-50 dark:bg-amber-900/20 shadow-sm hover:shadow-md transition";
    contactDiv.id = "contact_pending_" + contact.tempId;

    var phoneDigits = contact.phone;

    contactDiv.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h4 class="font-bold text-lg text-gray-900 dark:text-white">${escapeHtml(contact.name)}</h4>
            <p class="text-gray-600 dark:text-gray-400 text-sm mt-1">+91 ${escapeHtml(phoneDigits)}</p>
          </div>
          <span class="text-xs bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 px-3 py-1 rounded-full font-semibold whitespace-nowrap ml-4">📝 Pending</span>
        </div>
        <div class="flex gap-2">
          <button type="button" class="px-3 py-2 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition" onclick="removePendingContact(${contact.tempId})">
            🗑️ Remove
          </button>
        </div>
      </div>
    `;
    container.appendChild(contactDiv);
  });

  // Show message if no contacts
  if (displayedCount === 0 && pendingEmergencyChanges.toAdd.length === 0) {
    container.innerHTML =
      '<p class="text-gray-500 dark:text-gray-400 text-sm py-6 text-center">No emergency contacts added yet.</p>';
  }

  // Show/hide add form based on total count (including pending)
  var totalContacts = displayedCount + pendingEmergencyChanges.toAdd.length;
  var addFormContainer = document.getElementById("addContactFormContainer");
  if (addFormContainer) {
    if (totalContacts >= 3) {
      addFormContainer.style.display = "none";
      addFormContainer.style.visibility = "hidden";
      addFormContainer.style.height = "0";
      addFormContainer.style.overflow = "hidden";
      addFormContainer.style.margin = "0";
      addFormContainer.style.padding = "0";
    } else {
      addFormContainer.style.display = "block";
      addFormContainer.style.visibility = "visible";
      addFormContainer.style.height = "auto";
      addFormContainer.style.overflow = "visible";
      addFormContainer.style.margin = "";
      addFormContainer.style.padding = "";
    }
  }
}

// Add new emergency contact field
// Validate contact name (only letters, numbers, spaces, max 25 chars)
function validateContactName() {
  var input = document.getElementById("newContactName");
  var msg = document.getElementById("nameValidationMsg");
  var value = input.value;

  // Remove any invalid characters (anything except letters and spaces)
  value = value.replace(/[^a-zA-Z\s]/g, "");
  input.value = value;

  if (value.length === 0) {
    msg.textContent = "Name is required";
    msg.className = "text-gray-500 text-sm";
  } else if (value.length > 25) {
    msg.textContent = "Name cannot exceed 25 characters";
    msg.className = "text-red-500 text-sm";
  } else {
    msg.textContent = value.length + "/25 characters";
    msg.className = "text-green-500 text-sm";
  }
}

// Validate contact phone (only digits, exactly 10)
function validateContactPhone() {
  var input = document.getElementById("newContactPhone");
  var msg = document.getElementById("phoneValidationMsg");
  var value = input.value;

  // Remove any non-digit characters
  value = value.replace(/\D/g, "");
  input.value = value;

  if (value.length === 0) {
    msg.textContent = "Phone number is required";
    msg.className = "text-gray-500 text-sm";
  } else if (value.length < 10) {
    msg.textContent = value.length + "/10 digits";
    msg.className = "text-yellow-500 text-sm";
  } else if (value.length === 10) {
    msg.textContent = "✓ Valid phone number";
    msg.className = "text-green-500 text-sm";
  }
}

// Submit new contact form - ADD TO LOCAL STAGING, NOT TO API YET
function submitNewContact() {
  var nameInput = document.getElementById("newContactName");
  var phoneInput = document.getElementById("newContactPhone");
  var name = nameInput.value.trim();
  var phone = phoneInput.value.trim();

  // Validate name
  if (!name) {
    showToast("Please enter contact name", "error");
    return;
  }

  if (name.length > 25) {
    showToast("Name cannot exceed 25 characters", "error");
    return;
  }

  if (!name.match(/^[a-zA-Z\s]+$/)) {
    showToast("Name can only contain letters and spaces", "error");
    return;
  }

  // Validate phone
  if (!phone) {
    showToast("Please enter phone number", "error");
    return;
  }

  if (!phone.match(/^\d{10}$/)) {
    showToast("Phone number must be exactly 10 digits", "error");
    return;
  }

  // Add to local staging array (NOT to API yet)
  pendingEmergencyChanges.toAdd.push({
    name: name,
    phone: phone,
    tempId: Date.now(), // Temporary ID for local tracking
  });

  showToast("✓ Contact added (will save with Profile Changes)", "info");
  resetContactForm();
  renderEmergencyContacts();
  updateCompletion();
  markProfileDirty();
}

// Reset contact form
function resetContactForm() {
  document.getElementById("newContactName").value = "";
  document.getElementById("newContactPhone").value = "";
  document.getElementById("nameValidationMsg").textContent = "";
  document.getElementById("phoneValidationMsg").textContent = "";
}

// OLD FUNCTION - Keep for backward compatibility
function addEmergencyContactField() {
  // This is now old and replaced by form-based approach
  // Scroll to form
  var formContainer = document.getElementById("addContactFormContainer");
  if (formContainer) {
    formContainer.scrollIntoView({ behavior: "smooth" });
    document.getElementById("newContactName").focus();
  }
}

// Update emergency contact
// Toggle between view and edit mode for contacts
function toggleContactEditMode(contactId) {
  var viewMode = document.getElementById("view_" + contactId);
  var editMode = document.getElementById("edit_" + contactId);

  if (viewMode && editMode) {
    viewMode.classList.toggle("hidden");
    editMode.classList.toggle("hidden");
  }
}

// Save emergency contact changes - STAGE CHANGES LOCALLY
function saveEmergencyContact(contactId) {
  var nameInput = document.getElementById("edit_name_" + contactId);
  var phoneInput = document.getElementById("edit_phone_" + contactId);
  var name = nameInput.value.trim();
  var phone = phoneInput.value.trim();

  // Validate name
  if (!name) {
    showToast("Please enter contact name", "error");
    return;
  }

  if (name.length > 25) {
    showToast("Name cannot exceed 25 characters", "error");
    return;
  }

  if (!name.match(/^[a-zA-Z\s]+$/)) {
    showToast("Name can only contain letters and spaces", "error");
    return;
  }

  // Validate phone
  if (!phone) {
    showToast("Please enter phone number", "error");
    return;
  }

  if (!phone.match(/^\d{10}$/)) {
    showToast("Phone number must be exactly 10 digits", "error");
    return;
  }

  // Stage changes locally (NOT to API yet)
  pendingEmergencyChanges.toUpdate[contactId] = {
    name: name,
    phone: phone,
  };

  showToast("✓ Changes staged (will save with Profile Changes)", "info");
  toggleContactEditMode(contactId);
  markProfileDirty();
}

// Delete emergency contact - DELETE IMMEDIATELY FROM API
function deleteEmergencyContact(contactId) {
  showConfirm({
    icon: "🗑️",
    title: "Delete Contact?",
    message: "Are you sure you want to delete this emergency contact?",
    confirmText: "✓ Delete",
    cancelText: "Cancel",
    type: "warning",
    onConfirm: function () {
      // Delete immediately from API
      apiCall("/auth/emergency-contacts/" + contactId + "/", "DELETE")
        .then(function (response) {
          showToast("✓ Emergency contact deleted successfully", "success");
          // Remove from pending changes if it was being edited
          if (pendingEmergencyChanges.toUpdate[contactId]) {
            delete pendingEmergencyChanges.toUpdate[contactId];
          }
          // Remove from cache
          emergencyContactsCache = emergencyContactsCache.filter(function (c) {
            return c.id !== contactId;
          });
          renderEmergencyContacts();
          updateCompletion();
          markProfileDirty();
        })
        .catch(function (error) {
          var errorMsg = error.message || "Failed to delete emergency contact";
          showToast("❌ " + errorMsg, "error");
        });
    },
  });
}

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return "";
  var div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
