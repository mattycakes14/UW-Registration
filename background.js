// background.js
// main orchestrator for the extension
const REGISTRATION_URL = "https://myplan.uw.edu/plan/"; // adjust if needed

const activeTabs = new Map();
let listenersRegistered = false;

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "addClassesAndRegister") {
    // Combined workflow: Add classes via MyPlan course search, then navigate to Winter 2026 to register
    const COURSE_SEARCH_URL = "https://myplan.uw.edu/course/#/courses?states=N4Igwg9grgTgzgUwMoIIYwMYAsQC4TAA6IAZhDALYAiqALqsbkSBqhQA5RyPGJ20AbBMQA0xAJZwUGWuIgA7FOmyNaMKAjEhJASXlw1UGeSWYsjEqgGItARw0wAnkjXj5Acx4gA5GCQBRb1FiABNUR248ZgBGCysbYgAmOOtNYgBmFISQABYstJAAVnytADZ8gF8tA3Raf3kQgBVxCgRI3ABtAAYRAE5SroBdLTcMASgQhAA5BQB5dgRFBBk5fVV1AtHxyYAlNtcZBBDpWQV2w035MYm";
    
    chrome.tabs.create({ url: COURSE_SEARCH_URL }, (tab) => {
      if (!tab || typeof tab.id !== "number") {
        console.error("UW Registration Helper: failed to open MyPlan course search.");
        return;
      }

      activeTabs.set(tab.id, { 
        stage: "courseSearch",
        mode: "addClassesAndRegister",
        classes: message.classes || []
      });
      ensureTabListeners();
    });
  } else if (message.type === "classesFinished" && sender.tab) {
    // Content script finished adding all classes - navigate to Winter 2026
    const tabId = sender.tab.id;
    const state = activeTabs.get(tabId);
    
    if (state && state.mode === "addClassesAndRegister") {
      console.log("UW Registration Helper: classes finished, navigating to Winter 2026");
      state.stage = "navigateToWinter";
      
      // Navigate to Winter 2026 plan page
      chrome.tabs.update(tabId, { 
        url: "https://myplan.uw.edu/plan/#/wi26?states=N4IgSgpg5glgzgFwE4EMEwPYDsAiEEowA2cIAXCMADogIRIC2AkgCY1k0BMADJwGwBGGgBoaSaPGRpMWJnQZx2AbQC6AXxBqgA"
      });
    }
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

  if (state.mode === "addClassesAndRegister") {
    // Combined workflow: Add classes, then navigate to Winter 2026, then register
    if (state.stage === "courseSearch" && url.hostname === "myplan.uw.edu" && url.pathname.includes("/course/")) {
      // On course search page - inject class search automation
      injectClassSearchAutomation(tabId, state.classes);
      state.stage = "addingClasses";
    } else if (state.stage === "addingClasses" && url.hostname === "myplan.uw.edu" && url.pathname.includes("/course/")) {
      // Still on course search - automation is running, wait for completion signal
      // (We'll navigate after classes are added via content script message)
    } else if (state.stage === "navigateToWinter" && url.hostname === "myplan.uw.edu" && url.hash.includes("/wi26")) {
      // Arrived at Winter 2026 plan page - inject automation to click "Take me to Register.UW"
      injectAutomation(tabId);
      state.stage = "registerPending";
    } else if (state.stage === "registerPending" && url.hostname === "register.uw.edu") {
      // Arrived at Register.UW - inject automation to import from MyPlan and submit
      injectAutomation(tabId);
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
