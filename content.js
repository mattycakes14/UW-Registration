// content.js
// handles the automation of the registration process
const HOSTS = {
  myplan: "myplan.uw.edu",
  register: "register.uw.edu"
};

const COURSE_SEARCH_BASE = "https://myplan.uw.edu/course/#/courses";

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
  },
  importFromMyPlan() {
    return (
      document.querySelector("button#import-myplan") ||
      document.querySelector("button[aria-label='Import from MyPlan to add to cart']") ||
      Array.from(document.querySelectorAll("button")).find((btn) => {
        const text = (btn.textContent || "").toLowerCase();
        return text.includes("import") && text.includes("myplan");
      }) ||
      null
    );
  },
  updateSchedule() {
    return (
      document.querySelector("button#submit-registration") ||
      Array.from(document.querySelectorAll("button")).find((btn) => {
        const text = (btn.textContent || "").toLowerCase();
        return text.includes("update") && text.includes("schedule");
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
  const classesToAdd = window.UW_REGISTRATION_CLASSES || [];
  const addClassesMode = window.UW_ADD_CLASSES_MODE || false;
  
  if (location.hostname === HOSTS.myplan && addClassesMode && classesToAdd.length > 0) {
    // Add Classes mode on MyPlan course search
    console.log("UW Registration Helper: Add Classes mode - searching MyPlan courses");
    searchAndClickCourses(classesToAdd);
  } else if (location.hostname === HOSTS.myplan) {
    // Start Registration workflow
    clickWithRetry(RESOLVERS.winterTerm, (link) => {
      link.click();
      console.log("UW Registration Helper: selected Winter 2026 term.");
      
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
    
    const classesToAdd = window.UW_REGISTRATION_CLASSES || [];
    const addClassesMode = window.UW_ADD_CLASSES_MODE || false;
    
    if (addClassesMode && classesToAdd.length > 0) {
      // Add Classes workflow: search for and add specified classes
      console.log(`UW Registration Helper: searching for ${classesToAdd.length} classes:`, classesToAdd);
      searchAndAddClasses(classesToAdd);
    } else {
      // Start Registration workflow: import from MyPlan
      clickWithRetry(RESOLVERS.importFromMyPlan, (importBtn) => {
        importBtn.click();
        console.log("UW Registration Helper: clicked Import from MyPlan.");
        
        setTimeout(() => {
          clickWithRetry(RESOLVERS.updateSchedule, (submitBtn) => {
            submitBtn.click();
            console.log("UW Registration Helper: submitted registration (Update Schedule).");
          });
        }, 2000);
      });
    }
  } else {
    console.warn("UW Registration Helper: no automation defined for host", location.hostname);
  }
}

function searchAndClickCourses(classList) {
  let currentIndex = 0;
  
  function searchNextCourse() {
    if (currentIndex >= classList.length) {
      console.log("UW Registration Helper: finished searching all courses on MyPlan.");
      sendStatusUpdate({ course: "All courses", message: "Finished processing all classes", success: true });
      
      // Signal to background script that we're done adding classes
      chrome.runtime.sendMessage({ type: "classesFinished" });
      return;
    }
    
    const fullInput = classList[currentIndex].trim();
    const {course, lecture, quiz} = parseClassInput(fullInput);
    
    const displayText = `${course}${lecture ? ' ' + lecture : ''}${quiz ? ' ' + quiz : ''}`;
    console.log(`UW Registration Helper: searching for course ${currentIndex + 1}/${classList.length}: ${displayText}`);
    
    // Find the search input on MyPlan course search page
    const searchInput = document.querySelector("input#search-query") || 
                       document.querySelector("input[name='searchQuery']");
    
    if (!searchInput) {
      console.warn("UW Registration Helper: search input not found, retrying...");
      setTimeout(searchNextCourse, 1000);
      return;
    }
    
    // Clear and enter the course name
    searchInput.value = course;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Find and click the Search button
    setTimeout(() => {
      const searchButton = document.querySelector("button[type='submit'].btn.btn-primary");
      
      if (!searchButton) {
        console.warn("UW Registration Helper: search button not found");
        sendStatusUpdate({ course, section: displayText, message: "Search button not found", error: true });
        currentIndex++;
        setTimeout(searchNextCourse, 1000);
        return;
      }
      
      searchButton.click();
      console.log(`UW Registration Helper: clicked search button for ${course}`);
      
      // Wait for search results, then find and click the matching course
      setTimeout(() => {
        const courseLink = findCourseInTable(course);
        
        if (courseLink) {
          courseLink.click();
          console.log(`UW Registration Helper: clicked course link for ${course}`);
          
          // Wait for course detail page to load, then add section
          setTimeout(() => {
            addCourseSection(course, lecture, quiz);
            currentIndex++;
            setTimeout(searchNextCourse, 2000);
          }, 3000);
        } else {
          console.warn(`UW Registration Helper: course not found in table: ${course}`);
          sendStatusUpdate({ course, section: displayText, message: "Course not found in search results", error: true });
          currentIndex++;
          setTimeout(searchNextCourse, 1000);
        }
      }, 2000);
    }, 500);
  }
  
  searchNextCourse();
}

function parseClassInput(input) {
  // Parse input into course, lecture, and quiz/lab section
  // "CSE 373 A AA" -> {course: "CSE 373", lecture: "A", quiz: "AA"}
  // "CSE 373 A" -> {course: "CSE 373", lecture: "A", quiz: null}
  // "CSE 373" -> {course: "CSE 373", lecture: null, quiz: null}
  const parts = input.trim().toUpperCase().split(/\s+/);
  
  if (parts.length >= 4) {
    // Has lecture + quiz: "CSE 373 A AA"
    const quiz = parts[parts.length - 1];
    const lecture = parts[parts.length - 2];
    const course = parts.slice(0, -2).join(' ');
    return { course, lecture, quiz };
  } else if (parts.length === 3) {
    // Has lecture only: "CSE 373 A"
    const lecture = parts[parts.length - 1];
    const course = parts.slice(0, -1).join(' ');
    return { course, lecture, quiz: null };
  } else {
    // Just course: "CSE 373"
    return { course: input.trim().toUpperCase(), lecture: null, quiz: null };
  }
}

function addCourseSection(course, requestedLecture, requestedQuiz) {
  // Find all section rows on course detail page
  const sectionRows = Array.from(document.querySelectorAll("tbody[id^='winter-'] tr")).filter(row => {
    return row.querySelector("td:nth-child(2)");
  });
  
  if (sectionRows.length === 0) {
    console.warn("UW Registration Helper: no sections found");
    sendStatusUpdate({ course, section: null, message: "No sections found on page", error: true });
    window.history.back();
    return;
  }
  
  // Determine if this course has lecture+quiz structure
  const sectionCodes = sectionRows.map(row => {
    const code = row.querySelector("td:nth-child(2) .fw-bold.code");
    return code ? code.textContent.trim().toUpperCase() : "";
  }).filter(Boolean);
  
  const hasQuizSections = detectQuizSections(sectionCodes);
  
  if (hasQuizSections) {
    // Course has lecture + quiz structure (A, AA, AB, B, BA, BB, ...)
    addLectureAndQuiz(course, sectionRows, requestedLecture, requestedQuiz);
  } else {
    // Simple course with only lecture sections (A, B, C, ...)
    addSimpleLecture(course, sectionRows, requestedLecture);
  }
}

function detectQuizSections(sectionCodes) {
  // If we see patterns like "A", "AA", "AB" or "B", "BA", "BB", it has quiz sections
  const hasMultiCharSections = sectionCodes.some(code => code.length > 1);
  const hasSingleCharSections = sectionCodes.some(code => code.length === 1);
  
  return hasMultiCharSections && hasSingleCharSections;
}

function addSimpleLecture(course, sectionRows, requestedLecture) {
  // Simple course: just pick the requested lecture or first available
  let targetRow = null;
  
  if (requestedLecture) {
    targetRow = sectionRows.find(row => {
      const sectionCode = row.querySelector("td:nth-child(2) .fw-bold.code");
      return sectionCode && sectionCode.textContent.trim().toUpperCase() === requestedLecture;
    });
    
    if (!targetRow) {
      sendStatusUpdate({ course, section: requestedLecture, message: `Lecture ${requestedLecture} not found`, error: true });
      window.history.back();
      return;
    }
  } else {
    // Auto-pick first open lecture
    targetRow = sectionRows.find(row => {
      const statusCell = row.querySelector("td:nth-child(7)");
      const statusText = statusCell ? statusCell.textContent.toLowerCase() : "";
      return statusText.includes("open");
    });
    
    if (!targetRow) {
      sendStatusUpdate({ course, section: null, message: "No open lectures available", error: true });
      window.history.back();
      return;
    }
  }
  
  selectSection(course, targetRow, null);
}

function addLectureAndQuiz(course, sectionRows, requestedLecture, requestedQuiz) {
  // First, find the lecture section
  let lectureRow = null;
  let lectureCode = null;
  
  if (requestedLecture) {
    lectureRow = sectionRows.find(row => {
      const sectionCode = row.querySelector("td:nth-child(2) .fw-bold.code");
      const code = sectionCode ? sectionCode.textContent.trim().toUpperCase() : "";
      return code === requestedLecture && code.length === 1; // Single char = lecture
    });
    
    if (!lectureRow) {
      sendStatusUpdate({ course, section: requestedLecture, message: `Lecture ${requestedLecture} not found`, error: true });
      window.history.back();
      return;
    }
    lectureCode = requestedLecture;
  } else {
    // Auto-pick first open lecture
    lectureRow = sectionRows.find(row => {
      const sectionCode = row.querySelector("td:nth-child(2) .fw-bold.code");
      const code = sectionCode ? sectionCode.textContent.trim().toUpperCase() : "";
      const statusCell = row.querySelector("td:nth-child(7)");
      const statusText = statusCell ? statusCell.textContent.toLowerCase() : "";
      return code.length === 1 && statusText.includes("open");
    });
    
    if (!lectureRow) {
      sendStatusUpdate({ course, section: null, message: "No open lectures available", error: true });
      window.history.back();
      return;
    }
    const sectionCode = lectureRow.querySelector("td:nth-child(2) .fw-bold.code");
    lectureCode = sectionCode ? sectionCode.textContent.trim().toUpperCase() : "";
  }
  
  // Now find the quiz/lab section under this lecture
  const quizRows = sectionRows.filter(row => {
    const sectionCode = row.querySelector("td:nth-child(2) .fw-bold.code");
    const code = sectionCode ? sectionCode.textContent.trim().toUpperCase() : "";
    return code.startsWith(lectureCode) && code.length > 1;
  });
  
  if (quizRows.length === 0) {
    // No quiz sections found, just select the lecture
    selectSection(course, lectureRow, null);
    return;
  }
  
  let quizRow = null;
  
  if (requestedQuiz) {
    quizRow = quizRows.find(row => {
      const sectionCode = row.querySelector("td:nth-child(2) .fw-bold.code");
      return sectionCode && sectionCode.textContent.trim().toUpperCase() === requestedQuiz;
    });
    
    if (!quizRow) {
      sendStatusUpdate({ course, section: `${lectureCode} ${requestedQuiz}`, message: `Quiz section ${requestedQuiz} not found under lecture ${lectureCode}`, error: true });
      window.history.back();
      return;
    }
  } else {
    // Auto-pick first open quiz
    quizRow = quizRows.find(row => {
      const statusCell = row.querySelector("td:nth-child(7)");
      const statusText = statusCell ? statusCell.textContent.toLowerCase() : "";
      return statusText.includes("open");
    });
    
    if (!quizRow) {
      sendStatusUpdate({ course, section: lectureCode, message: `No open quiz sections available under lecture ${lectureCode}`, error: true });
      window.history.back();
      return;
    }
  }
  
  // Select both lecture and quiz
  const quizCode = quizRow.querySelector("td:nth-child(2) .fw-bold.code")?.textContent.trim();
  selectSection(course, lectureRow, lectureCode);
  
  setTimeout(() => {
    selectSection(course, quizRow, quizCode);
  }, 500);
}

function selectSection(course, row, sectionCode) {
  // Check if section is open
  const statusCell = row.querySelector("td:nth-child(7)");
  const statusText = statusCell ? statusCell.textContent.toLowerCase() : "";
  const isOpen = statusText.includes("open");
  
  const actualSection = sectionCode || row.querySelector("td:nth-child(2) .fw-bold.code")?.textContent.trim();
  
  if (!isOpen) {
    sendStatusUpdate({ course, section: actualSection, message: `Section ${actualSection} is closed/full`, error: true });
    window.history.back();
    return;
  }
  
  // Click the "Select" button (+ icon)
  const selectButton = row.querySelector("td:last-child button[title*='Select']");
  
  if (!selectButton) {
    sendStatusUpdate({ course, section: actualSection, message: "Select button not found", error: true });
    window.history.back();
    return;
  }
  
  selectButton.click();
  console.log(`UW Registration Helper: clicked Select button for ${course} ${actualSection}`);
  sendStatusUpdate({ course, section: actualSection, message: `Successfully added section ${actualSection}`, success: true });
  
  // Go back to search page after final section
  setTimeout(() => {
    window.history.back();
  }, 1500);
}

function sendStatusUpdate(status) {
  // Send status back to popup via runtime messaging
  chrome.runtime.sendMessage({ type: "statusUpdate", status });
}

function findCourseInTable(searchTerm) {
  // Search term might be "CSE 121", "CSE121", "COMP SCI 400", etc.
  const normalized = searchTerm.replace(/\s+/g, ' ').trim().toUpperCase();
  
  // Find all course links in the table
  const courseLinks = Array.from(document.querySelectorAll("tbody tr th a"));
  
  for (const link of courseLinks) {
    const courseCode = (link.textContent || "").trim().toUpperCase();
    const normalizedCode = courseCode.replace(/\s+/g, ' ');
    
    // Match exact course code or flexible matching
    if (normalizedCode === normalized || 
        courseCode.replace(/\s+/g, '') === searchTerm.replace(/\s+/g, '')) {
      return link;
    }
  }
  
  return null;
}

function searchAndAddClasses(classList) {
  let currentIndex = 0;
  
  function searchNextClass() {
    if (currentIndex >= classList.length) {
      console.log("UW Registration Helper: finished searching all classes.");
      
      // After all searches, submit registration
      setTimeout(() => {
        clickWithRetry(RESOLVERS.updateSchedule, (submitBtn) => {
          submitBtn.click();
          console.log("UW Registration Helper: submitted registration (Update Schedule).");
        });
      }, 2000);
      return;
    }
    
    const className = classList[currentIndex];
    console.log(`UW Registration Helper: searching for class ${currentIndex + 1}/${classList.length}: ${className}`);
    
    // Find the search input
    const searchInput = document.querySelector("input#search-query") || 
                       document.querySelector("input[name='searchQuery']") ||
                       document.querySelector("input[placeholder*='Math']");
    
    if (!searchInput) {
      console.warn("UW Registration Helper: search input not found, retrying...");
      setTimeout(searchNextClass, 1000);
      return;
    }
    
    // Clear and enter the class name
    searchInput.value = className;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Trigger search (press Enter or click search button)
    setTimeout(() => {
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      searchInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
      searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
      
      console.log(`UW Registration Helper: triggered search for ${className}`);
      
      // Wait for results to load, then add the first result
      setTimeout(() => {
        addFirstSearchResult(className);
        currentIndex++;
        setTimeout(searchNextClass, 1500); // Wait before searching next class
      }, 2000);
    }, 500);
  }
  
  searchNextClass();
}

function addFirstSearchResult(className) {
  // Look for "Add" buttons in search results
  const addButtons = Array.from(document.querySelectorAll("button")).filter((btn) => {
    const text = (btn.textContent || "").toLowerCase().trim();
    return text === "add" || text.includes("add to cart");
  });
  
  if (addButtons.length > 0) {
    addButtons[0].click();
    console.log(`UW Registration Helper: added class ${className} to cart.`);
  } else {
    console.warn(`UW Registration Helper: no add button found for ${className}`);
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