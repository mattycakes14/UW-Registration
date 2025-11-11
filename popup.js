// State management
let classList = [];
let statusMessages = [];

// Load saved classes and status from storage
chrome.storage.local.get(['classList', 'statusMessages'], (result) => {
  if (result.classList) {
    classList = result.classList;
    renderClassList();
  }
  if (result.statusMessages) {
    statusMessages = result.statusMessages;
    renderStatus();
  }
});

// Listen for status updates from background/content scripts
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "statusUpdate") {
    statusMessages.push(message.status);
    chrome.storage.local.set({ statusMessages });
    renderStatus();
  }
});

// Add class button handler
document.getElementById("add-class").addEventListener("click", () => {
  const input = document.getElementById("class-input");
  const className = input.value.trim();
  
  if (className && !classList.includes(className)) {
    classList.push(className);
    saveClassList();
    renderClassList();
    input.value = "";
  }
});

// Allow Enter key to add class
document.getElementById("class-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    document.getElementById("add-class").click();
  }
});

// Add classes button handler
document.getElementById("add-classes-btn").addEventListener("click", () => {
  if (classList.length === 0) {
    alert("Please add at least one class first.");
    return;
  }
  
  // Clear previous status messages for fresh run
  statusMessages = [];
  chrome.storage.local.set({ statusMessages: [] }, () => {
    chrome.runtime.sendMessage({ 
      type: "addClassesAndRegister",
      classes: classList
    });
  });
});

// Render the class list
function renderClassList() {
  const listContainer = document.getElementById("class-list");
  
  if (classList.length === 0) {
    listContainer.innerHTML = '<p style="color: #666; font-size: 12px; margin: 5px 0;">No classes added yet</p>';
    return;
  }
  
  listContainer.innerHTML = classList.map((className, index) => `
    <div class="input-group">
      <input type="text" value="${className}" readonly />
      <button class="remove-btn" data-index="${index}">Remove</button>
    </div>
  `).join('');
  
  // Add remove button handlers
  listContainer.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      classList.splice(index, 1);
      saveClassList();
      renderClassList();
    });
  });
}

// Save class list to storage
function saveClassList() {
  chrome.storage.local.set({ classList });
}

// Render status messages
function renderStatus() {
  const statusContainer = document.getElementById("status-display");
  
  if (statusMessages.length === 0) {
    statusContainer.innerHTML = '<p style="color: #999; margin: 5px 0;">No status updates yet</p>';
    return;
  }
  
  statusContainer.innerHTML = statusMessages.map(msg => {
    const color = msg.success ? '#28a745' : (msg.error ? '#dc3545' : '#ffc107');
    const icon = msg.success ? '✓' : (msg.error ? '✗' : '⚠');
    return `
      <div style="margin: 4px 0; padding: 4px; background: ${color}22; border-left: 3px solid ${color}; border-radius: 2px;">
        <strong>${icon} ${msg.course}</strong>
        ${msg.section ? `<span style="color: #666;"> (Section ${msg.section})</span>` : ''}
        <br/>
        <small>${msg.message}</small>
      </div>
    `;
  }).join('');
}