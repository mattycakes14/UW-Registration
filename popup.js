// executes the kickoff message to background.js
document.getElementById("start").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "kickoff" });
  });