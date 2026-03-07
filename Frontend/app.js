const STORAGE_KEYS = {
  user: "bingo-battles.user",
  boards: "bingo-battles.boards"
};
const BACKEND_ORIGIN = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", () => {
  initializeLandingPage();
  initializeAuthPage();
  initializeDashboardPage();
});

function initializeLandingPage() {
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const heroLoginBtn = document.getElementById("heroLoginBtn");
  const heroSignupBtn = document.getElementById("heroSignupBtn");

  if (!loginBtn && !signupBtn && !heroLoginBtn && !heroSignupBtn) {
    return;
  }

  const login = () => {
    window.location.href = "auth.html?mode=login";
  };

  const signup = () => {
    window.location.href = "auth.html?mode=signup";
  };

  loginBtn?.addEventListener("click", login);
  heroLoginBtn?.addEventListener("click", login);
  signupBtn?.addEventListener("click", signup);
  heroSignupBtn?.addEventListener("click", signup);
}

function initializeAuthPage() {
  const authForm = document.getElementById("authForm");
  if (!authForm) {
    return;
  }

  const mode = new URLSearchParams(window.location.search).get("mode") === "signup"
    ? "signup"
    : "login";

  const authTitle = document.getElementById("authTitle");
  const authEyebrow = document.getElementById("authEyebrow");
  const authSubtitle = document.getElementById("authSubtitle");
  const authSubmit = document.getElementById("authSubmit");
  const authSwitchText = document.getElementById("authSwitchText");
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");
  const authError = document.getElementById("authError");
  const googleAuthBtn = document.getElementById("googleAuthBtn");

  if (mode === "signup") {
    authEyebrow.textContent = "Create Account";
    authTitle.textContent = "Sign Up";
    authSubtitle.textContent = "Create an account to start your Bingo Battles board.";
    authSubmit.textContent = "Create Account";
    authSwitchText.innerHTML = "Already have an account? <a class=\"text-link\" href=\"auth.html?mode=login\">Log In</a>";
  } else {
    authEyebrow.textContent = "Welcome Back";
    authTitle.textContent = "Log In";
    authSubtitle.textContent = "Sign in to keep tracking your goals.";
    authSubmit.textContent = "Log In";
    authSwitchText.innerHTML = "Need an account? <a class=\"text-link\" href=\"auth.html?mode=signup\">Sign Up</a>";
  }

  forgotPasswordLink.addEventListener("click", (event) => {
    event.preventDefault();
    window.alert("Password reset is coming soon.");
  });

  googleAuthBtn?.addEventListener("click", () => {
    window.location.href = `${BACKEND_ORIGIN}/auth/google`;
  });

  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    authError.hidden = true;

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      authError.textContent = "Username and password are required.";
      authError.hidden = false;
      return;
    }

    if (password.length < 6) {
      authError.textContent = "Password must be at least 6 characters.";
      authError.hidden = false;
      return;
    }

    const user = {
      name: username
    };

    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
    window.location.href = "dashboard.html";
  });
}

async function initializeDashboardPage() {
  const dashboardSection = document.getElementById("dashboardSection");
  if (!dashboardSection) {
    return;
  }

  let user = getUser();
  if (!user) {
    user = await syncUserFromBackendSession();
  }

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const welcomeMessage = document.getElementById("welcomeMessage");
  welcomeMessage.textContent = `Welcome back, ${user.name}!`;

  const navDashboard = document.getElementById("navDashboard");
  const navLeaderboard = document.getElementById("navLeaderboard");
  const leaderboardSection = document.getElementById("leaderboardSection");
  const boardEmptyState = document.getElementById("boardEmptyState");
  const boardGrid = document.getElementById("boardGrid");
  const createFirstBoard = document.getElementById("createFirstBoard");

  const menuToggle = document.getElementById("menuToggle");
  const menuPanel = document.getElementById("menuPanel");
  const createBoardMenu = document.getElementById("createBoardMenu");
  const joinGroupMenu = document.getElementById("joinGroupMenu");
  const signOutMenu = document.getElementById("signOutMenu");

  navDashboard.addEventListener("click", () => {
    navDashboard.classList.add("is-active");
    navLeaderboard.classList.remove("is-active");
    dashboardSection.hidden = false;
    leaderboardSection.hidden = true;
  });

  navLeaderboard.addEventListener("click", () => {
    navLeaderboard.classList.add("is-active");
    navDashboard.classList.remove("is-active");
    dashboardSection.hidden = true;
    leaderboardSection.hidden = false;
    renderLeaderboard();
  });

  menuToggle.addEventListener("click", () => {
    const isOpen = menuPanel.hidden === false;
    menuPanel.hidden = isOpen;
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
  });

  // Close the menu when clicking outside of it.
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (!menuPanel.contains(target) && !menuToggle.contains(target)) {
      menuPanel.hidden = true;
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });

  createBoardMenu.addEventListener("click", () => {
    createBoard();
    renderBoards();
    menuPanel.hidden = true;
  });

  createFirstBoard.addEventListener("click", () => {
    createBoard();
    renderBoards();
  });

  joinGroupMenu.addEventListener("click", () => {
    const groupCode = window.prompt("Enter a group code to join:", "GOALS-2026");
    if (groupCode && groupCode.trim()) {
      window.alert(`Joined group ${groupCode.trim()} successfully.`);
    }
    menuPanel.hidden = true;
  });

  signOutMenu.addEventListener("click", () => {
    void fetch(`${BACKEND_ORIGIN}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
    localStorage.removeItem(STORAGE_KEYS.user);
    window.location.href = "index.html";
  });

  function renderBoards() {
    const boards = getBoards();
    boardGrid.innerHTML = "";

    if (boards.length === 0) {
      boardEmptyState.hidden = false;
      return;
    }

    boardEmptyState.hidden = true;

    boards.forEach((board) => {
      const completionPercent = Math.round((board.completed / board.total) * 100);
      const card = document.createElement("article");
      card.className = "board-card";

      card.innerHTML = `
        <h3>${escapeHtml(board.title)}</h3>
        <div class="progress-row">
          <span>${board.completed} of ${board.total} goals complete</span>
          <strong>${completionPercent}%</strong>
        </div>
        <div class="progress-track" aria-hidden="true">
          <div class="progress-fill" style="width: ${completionPercent}%"></div>
        </div>
      `;

      const updateBtn = document.createElement("button");
      updateBtn.type = "button";
      updateBtn.className = "inline-btn";
      updateBtn.textContent = "Mark 1 goal complete";
      updateBtn.addEventListener("click", () => {
        incrementBoardProgress(board.id);
        renderBoards();
        if (!leaderboardSection.hidden) {
          renderLeaderboard();
        }
      });

      card.appendChild(updateBtn);
      boardGrid.appendChild(card);
    });
  }

  function renderLeaderboard() {
    const leaderboardBody = document.getElementById("leaderboardBody");
    const boards = getBoards();

    const yourProgress = boards.length
      ? Math.round(
        boards.reduce((sum, board) => sum + Math.round((board.completed / board.total) * 100), 0) /
        boards.length
      )
      : 0;

    const friends = [
      { name: "Avery", progress: 72 },
      { name: "Kai", progress: 64 },
      { name: "Rin", progress: 49 },
      { name: "Milo", progress: 33 }
    ];

    const rankings = [
      { name: user.name, progress: yourProgress, isSelf: true },
      ...friends
    ].sort((a, b) => b.progress - a.progress);

    leaderboardBody.innerHTML = "";
    rankings.forEach((entry, index) => {
      const row = document.createElement("tr");
      if (entry.isSelf) {
        row.classList.add("self");
      }

      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${escapeHtml(entry.name)}</td>
        <td>${entry.progress}%</td>
      `;

      leaderboardBody.appendChild(row);
    });
  }

  renderBoards();
  renderLeaderboard();

  function createBoard() {
    const title = window.prompt("Board name:", "My 2026 Goals");
    if (!title || !title.trim()) {
      return;
    }

    const rawTotal = window.prompt("How many goals (squares) should this board have?", "9");
    const parsedTotal = Number.parseInt(rawTotal || "", 10);
    const total = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : 9;

    const boards = getBoards();
    boards.push({
      id: crypto.randomUUID(),
      title: title.trim(),
      total,
      completed: 0
    });

    localStorage.setItem(STORAGE_KEYS.boards, JSON.stringify(boards));
  }

  function incrementBoardProgress(boardId) {
    const boards = getBoards();
    const targetBoard = boards.find((board) => board.id === boardId);
    if (!targetBoard) {
      return;
    }

    targetBoard.completed = Math.min(targetBoard.total, targetBoard.completed + 1);
    localStorage.setItem(STORAGE_KEYS.boards, JSON.stringify(boards));
  }
}

async function syncUserFromBackendSession() {
  try {
    const response = await fetch(`${BACKEND_ORIGIN}/auth/me`, {
      credentials: "include"
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload?.authenticated || !payload?.user) {
      return null;
    }

    const user = {
      name: payload.user.name || payload.user.email || "Player"
    };
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
    return user;
  } catch (_error) {
    return null;
  }
}

function getUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function getBoards() {
  const raw = localStorage.getItem(STORAGE_KEYS.boards);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
