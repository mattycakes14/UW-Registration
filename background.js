// background.js
const REGISTRATION_URL = "https://myplan.uw.edu/plan/"; // adjust if needed

const activeTabs = new Map();
let listenersRegistered = false;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "kickoff") {
    chrome.tabs.create({ url: REGISTRATION_URL }, (tab) => {
      if (!tab || typeof tab.id !== "number") {
        console.error("UW Registration Helper: failed to open MyPlan tab.");
        return;
      }

      activeTabs.set(tab.id, { stage: "myplan" });
      ensureTabListeners();
    });
  }
});

function ensureTabListeners() {
  if (listenersRegistered) {
    return;
  }

  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  listenersRegistered = true;
}

function handleTabUpdated(tabId, changeInfo, tab) {
  if (!activeTabs.has(tabId) || changeInfo.status !== "complete" || !tab.url) {
    return;
  }

  let url;
  try {
    url = new URL(tab.url);
  } catch (error) {
    console.warn("UW Registration Helper: unable to parse tab URL", tab.url, error);
    return;
  }

  const state = activeTabs.get(tabId);

  if (state.stage === "myplan" && url.hostname === "myplan.uw.edu") {
    injectAutomation(tabId);
    state.stage = "registerPending";
  } else if (state.stage === "registerPending" && url.hostname === "register.uw.edu") {
    injectAutomation(tabId);
    activeTabs.delete(tabId);
    cleanupListenersIfIdle();
  }
}

function handleTabRemoved(tabId) {
  if (activeTabs.delete(tabId)) {
    cleanupListenersIfIdle();
  }
}

function cleanupListenersIfIdle() {
  if (!listenersRegistered || activeTabs.size > 0) {
    return;
  }

  chrome.tabs.onUpdated.removeListener(handleTabUpdated);
  chrome.tabs.onRemoved.removeListener(handleTabRemoved);
  listenersRegistered = false;
}

function injectAutomation(tabId) {
  chrome.scripting
    .executeScript({
      target: { tabId },
      files: ["content.js"]
    })
    .catch((error) => {
      console.error("UW Registration Helper: failed to inject automation", error);
    });
}
