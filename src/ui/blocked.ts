import { requiredElement } from "./shared";

const parameters = new URLSearchParams(location.search);
const domain = parameters.get("domain") ?? "This website";
const reason = parameters.get("reason") ?? "manual";
const explanations: Record<string, string> = {
  "focus-session": "Your manual focus session is active.",
  limit: "Today's active-time budget has been reached.",
  manual: "It is listed in your always-blocked settings.",
  schedule: "Your recurring focus schedule is active.",
};

requiredElement<HTMLElement>("#blocked-site").textContent = domain;
requiredElement<HTMLElement>("#blocked-reason").textContent =
  explanations[reason] ?? explanations.manual ?? "This site is blocked.";

requiredElement<HTMLButtonElement>("#go-back").addEventListener("click", () => {
  if (history.length > 1) {
    history.back();
  } else {
    location.href = "about:blank";
  }
});

requiredElement<HTMLButtonElement>("#open-options").addEventListener(
  "click",
  () => {
    void chrome.runtime.openOptionsPage();
  },
);
