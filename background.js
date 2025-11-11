// background.js
// main orchestrator for the extension
const REGISTRATION_URL = "https://myplan.uw.edu/plan/"; // adjust if needed

const activeTabs = new Map();
let listenersRegistered = false;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "kickoff") {
    // Start Registration workflow: Navigate through MyPlan → Register.UW
    chrome.tabs.create({ url: REGISTRATION_URL }, (tab) => {
      if (!tab || typeof tab.id !== "number") {
        console.error("UW Registration Helper: failed to open MyPlan tab.");
        return;
      }

      activeTabs.set(tab.id, { 
        stage: "myplan",
        mode: "registration"
      });
      ensureTabListeners();
    });
  } else if (message.type === "addClasses") {
    // Add Classes workflow: Open MyPlan course search and add classes
    const COURSE_SEARCH_URL = "https://myplan.uw.edu/course/#/courses?states=N4Igwg9grgTgzgUwMoIIYwMYAsQC4TAA6IAZhDALYAiqALqsbkSBqhQA5RyPGJ20AbBMQA0xAJZwUGWuIgA7FOmyNaMKAjEhJASXlw1UGeSWYsjEqgGItARw0wAnkjXj5Acx4gA5GCQBRb1FiABNUR248ZgBGCysbYgAmOOtNYgBmFISQABYstJAAVnytADZ8gF8tA3Raf3kQgBVxCgRI3ABtAAYRAE5SroBdLTcMASgQhAA5BQB5dgRFBBk5fVV1AtHxyYAlNtcZBBDpWQV2w035MYm";
    
    chrome.tabs.create({ url: COURSE_SEARCH_URL }, (tab) => {
      if (!tab || typeof tab.id !== "number") {
        console.error("UW Registration Helper: failed to open MyPlan course search.");
        return;
      }

      activeTabs.set(tab.id, { 
        stage: "courseSearch",
        mode: "addClasses",
        classes: message.classes || []
      });
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

  if (state.mode === "registration") {
    // Start Registration workflow
    if (state.stage === "myplan" && url.hostname === "myplan.uw.edu") {
      injectAutomation(tabId);
      state.stage = "registerPending";
    } else if (state.stage === "registerPending" && url.hostname === "register.uw.edu") {
      injectAutomation(tabId);
      activeTabs.delete(tabId);
      cleanupListenersIfIdle();
    }
  } else if (state.mode === "addClasses") {
    // Add Classes workflow
    if (state.stage === "courseSearch" && url.hostname === "myplan.uw.edu") {
      injectClassSearchAutomation(tabId, state.classes);
      activeTabs.delete(tabId);
      cleanupListenersIfIdle();
    }
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
  const state = activeTabs.get(tabId);
  
  // Inject the content script for registration workflow
  chrome.scripting
    .executeScript({
      target: { tabId },
      files: ["content.js"]
    })
    .catch((error) => {
      console.error("UW Registration Helper: failed to inject automation", error);
    });
}

function injectClassSearchAutomation(tabId, classes) {
  // Inject classes and trigger "Add Classes" mode
  chrome.scripting
    .executeScript({
      target: { tabId },
      func: (classList) => {
        window.UW_REGISTRATION_CLASSES = classList;
        window.UW_ADD_CLASSES_MODE = true;
      },
      args: [classes]
    })
    .then(() => {
      return chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
    })
    .catch((error) => {
      console.error("UW Registration Helper: failed to inject class search automation", error);
    });
}
