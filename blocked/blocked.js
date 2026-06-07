"use strict";

const params = new URLSearchParams(location.search);
const domain = params.get("domain");
const reason = params.get("reason");

if (domain) {
  document.getElementById("blocked-site").textContent = domain;
}

if (reason === "limit") {
  document.getElementById("blocked-reason").textContent =
    "You have reached today's time limit. Access returns tomorrow.";
}

document.getElementById("go-back").addEventListener("click", () => history.back());
document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

