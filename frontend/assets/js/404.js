/**
 * 404.js - Logic for the 404 error page animations
 */

document.addEventListener("DOMContentLoaded", function () {
  // Generate random stars
  var container = document.getElementById("starsContainer");
  if (container) {
    for (var i = 0; i < 80; i++) {
      var star = document.createElement("div");
      star.className = "star";
      var size = Math.random() * 2.5 + 0.5;
      star.style.cssText = [
        "width:" + size + "px",
        "height:" + size + "px",
        "top:" + Math.random() * 60 + "%",
        "left:" + Math.random() * 100 + "%",
        "animation-delay:" + Math.random() * 4 + "s",
        "animation-duration:" + (2 + Math.random() * 3) + "s",
      ].join(";");
      container.appendChild(star);
    }
  }
});
