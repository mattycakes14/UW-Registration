// content.js
const HOSTS = {
  myplan: "myplan.uw.edu",
  register: "register.uw.edu"
};

const RESOLVERS = {
  takeMeToRegister() {
    return (
      document.querySelector("a[aria-label='Take me to Register.UW']") ||
      document.querySelector("a[href*='register.uw.edu/register']") ||
      Array.from(document.querySelectorAll("a")).find((anchor) => {
        const label = (anchor.getAttribute("aria-label") || anchor.textContent || "").toLowerCase();
        return label.includes("register.uw");
      }) ||
      null
    );
  },
  winterTerm() {
    return (
      document.querySelector("a[href='#/wi26']") ||
      Array.from(document.querySelectorAll("a")).find((anchor) => {
        const text = (anchor.textContent || "").toLowerCase();
        return text.includes("winter") && text.includes("2026");
      }) ||
      null
    );
  }
};

const RETRY_OPTIONS = {
  attempts: 60,
  delay: 500
};


function runAutomation() {
  if (location.hostname === HOSTS.myplan) {
    // Step 1: Click Winter 2026 term card first
    clickWithRetry(RESOLVERS.winterTerm, (link) => {
      link.click();
      console.log("UW Registration Helper: selected Winter 2026 term.");
      
      // Step 2: After term selection, wait for and click "Take me to Register.UW"
      setTimeout(() => {
        clickWithRetry(RESOLVERS.takeMeToRegister, (registerLink) => {
          if (registerLink.target === "_blank") {
            registerLink.target = "_self";
          }
          registerLink.click();
          console.log("UW Registration Helper: opened Register.UW from MyPlan.");
        });
      }, 1000);
    });
  } else if (location.hostname === HOSTS.register) {
    console.log("UW Registration Helper: arrived at Register.UW page.");
    // Add registration logic here when needed
  } else {
    console.warn("UW Registration Helper: no automation defined for host", location.hostname);
  }
}

function clickWithRetry(resolver, onFound, options = RETRY_OPTIONS) {
  const { attempts = 20, delay = 300 } = options;
  const resolveElement = typeof resolver === "function" ? resolver : () => document.querySelector(resolver);
  let tries = 0;

  const tryClick = () => {
    const element = resolveElement();
    if (element) {
      onFound(element);
      return true;
    }
    return false;
  };

  if (tryClick()) {
    return;
  }

  const intervalId = window.setInterval(() => {
    tries += 1;
    if (tryClick()) {
      window.clearInterval(intervalId);
    } else if (tries >= attempts) {
      window.clearInterval(intervalId);
      console.warn("UW Registration Helper: element not found after retries.");
    }
  }, delay);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  runAutomation();
} else {
  window.addEventListener("DOMContentLoaded", runAutomation, { once: true });
}