import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import volcanoLogo from "../Volcano Logo resized.png";
import gridIcon from "../Grid_Icon.png";
import trophyIcon from "../Trophy_Icon.png";
import friendsIcon from "../Friends_Icon.png";
import volcaneSVG from "../Volcano_SVG.svg";
import footerVolcanoGif from "../Final Volcano.gif";
import pariHeadshot from "../Pari_Headshot.jpg";
import joyceHeadshot from "../Joyce_Headshot.jpg";
import hadiyaHeadshot from "../Hadiya_Headshot.jpg";
import colinHeadshot from "../Colin_Headshot.jpg";

const STORAGE_KEYS = {
  user: "bingo-battles.user"
};

const BACKEND_ORIGIN = (import.meta.env.VITE_BACKEND_ORIGIN || "").trim();
const OAUTH_BACKEND_ORIGIN = BACKEND_ORIGIN || "http://localhost:5000";
const API_ORIGIN = OAUTH_BACKEND_ORIGIN;
const APP_BASE = import.meta.env.BASE_URL || "/";
const APP_BASE_PREFIX = APP_BASE.endsWith("/") ? APP_BASE.slice(0, -1) : APP_BASE;
const FIXED_GOAL_COUNT = 25;
const FREE_SPACE_INDEX = 12;
const FREE_SPACE_TEXT = "FREE SPACE";
const CREATE_STEPS = ["Board Name", "Game Type", "Add Goals", "Customize"];
const GAME_TYPE_OPTIONS = [
  {
    id: "five-in-a-row",
    title: "5-in-a-Row",
    description: "Complete any row, column, or diagonal to win."
  },
  {
    id: "blackout",
    title: "Blackout",
    description: "Complete all 25 tiles for the ultimate challenge."
  }
];
const BOARD_COLOR_OPTIONS = ["#c10b3c", "#ee8207", "#87082a", "#342020", "#7f5af0", "#e2459a", "#1fb37f", "#22a8c1"];
const TILE_SHAPE_OPTIONS = [
  { id: "rounded", label: "Rounded" },
  { id: "square", label: "Square" },
  { id: "circle", label: "Circle" }
];

function createDraftGoals() {
  return Array.from({ length: FIXED_GOAL_COUNT }, (_, index) =>
    index === FREE_SPACE_INDEX ? FREE_SPACE_TEXT : ""
  );
}

function createDefaultGoal(index, completed = false) {
  return {
    id: crypto.randomUUID(),
    text: index === FREE_SPACE_INDEX ? FREE_SPACE_TEXT : `Goal ${index + 1}`,
    completed
  };
}

function normalizeBoard(rawBoard) {
  if (!rawBoard || typeof rawBoard !== "object") {
    return null;
  }

  const legacyCompleted = Number.isFinite(rawBoard.completed) ? Math.max(0, rawBoard.completed) : 0;
  const rawGoals = Array.isArray(rawBoard.goals) ? rawBoard.goals : [];

  const normalizedGoals = Array.from({ length: FIXED_GOAL_COUNT }, (_, index) => {
    const rawGoal = rawGoals[index];
    if (!rawGoal || typeof rawGoal !== "object") {
      return createDefaultGoal(index, index < legacyCompleted);
    }

    const text = index === FREE_SPACE_INDEX
      ? FREE_SPACE_TEXT
      : (typeof rawGoal.text === "string" && rawGoal.text.trim() ? rawGoal.text.trim() : `Goal ${index + 1}`);
    return {
      id: rawGoal.id || crypto.randomUUID(),
      text,
      completed: Boolean(rawGoal.completed)
    };
  });

  const completed = normalizedGoals.filter((goal) => goal.completed).length;

  return {
    id: rawBoard.id || crypto.randomUUID(),
    title: typeof rawBoard.title === "string" && rawBoard.title.trim() ? rawBoard.title.trim() : "Untitled Board",
    total: FIXED_GOAL_COUNT,
    completed,
    goals: normalizedGoals,
    gameType: rawBoard.gameType || "five-in-a-row",
    boardColor: rawBoard.boardColor || "#c10b3c",
    tileShape: rawBoard.tileShape || "rounded"
  };
}

function toUsername(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const separatorIndex = trimmed.indexOf("@");
  return separatorIndex > 0 ? trimmed.slice(0, separatorIndex) : trimmed;
}

function resolveDisplayName(name, email) {
  const preferredName = typeof name === "string" ? name.trim() : "";
  const candidate = preferredName || email;
  const username = toUsername(candidate);
  return username || "Player";
}

function normalizeUser(rawUser) {
  if (!rawUser || typeof rawUser !== "object") {
    return null;
  }

  const id = rawUser.id || rawUser.email || rawUser.name;
  if (!id) {
    return null;
  }

  return {
    id,
    name: resolveDisplayName(rawUser.name, rawUser.email),
    email: rawUser.email || null,
    provider: rawUser.provider || null
  };
}

function calculateProgressFromBoards(boards) {
  if (!Array.isArray(boards) || boards.length === 0) {
    return 0;
  }

  return Math.round(
    boards.reduce((sum, board) => sum + Math.round((board.completed / board.total) * 100), 0) / boards.length
  );
}

function normalizeGroup(rawGroup) {
  if (!rawGroup || typeof rawGroup !== "object") {
    return null;
  }

  const name = typeof rawGroup.name === "string" ? rawGroup.name.trim() : "";
  const code = typeof rawGroup.code === "string" ? rawGroup.code.trim().toUpperCase() : "";
  const ownerId = rawGroup.ownerId || rawGroup.owner_user_id || "";
  if (!name || !code || !ownerId) {
    return null;
  }

  const memberMap = new Map();
  const rawMembers = Array.isArray(rawGroup.members) ? rawGroup.members : [];
  rawMembers.forEach((member) => {
    if (!member || typeof member !== "object" || !member.id) {
      return;
    }

    const displayName = typeof member.name === "string" && member.name.trim() ? member.name.trim() : "Player";
    memberMap.set(member.id, {
      id: member.id,
      name: displayName,
      assignedBoardId: member.assignedBoardId || member.assigned_board_id || null
    });
  });

  if (!memberMap.has(ownerId)) {
    memberMap.set(ownerId, { id: ownerId, name: "Player", assignedBoardId: null });
  }

  return {
    id: rawGroup.id || crypto.randomUUID(),
    name,
    code,
    ownerId,
    members: [...memberMap.values()]
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_error) {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return payload;
}

async function fetchBoardsApi() {
  const payload = await apiRequest("/api/boards", { method: "GET" });
  const boards = Array.isArray(payload.boards) ? payload.boards : [];
  return boards.map(normalizeBoard).filter(Boolean);
}

async function createBoardApi(title, goals) {
  const payload = await apiRequest("/api/boards", {
    method: "POST",
    body: JSON.stringify({ title, goals })
  });

  return normalizeBoard(payload.board);
}

async function updateBoardApi(board) {
  const payload = await apiRequest(`/api/boards/${board.id}`, {
    method: "PUT",
    body: JSON.stringify({
      title: board.title,
      goals: board.goals
    })
  });

  return normalizeBoard(payload.board);
}

async function fetchGroupsApi() {
  const payload = await apiRequest("/api/groups", { method: "GET" });
  const groups = Array.isArray(payload.groups) ? payload.groups : [];
  return groups.map(normalizeGroup).filter(Boolean);
}

async function createGroupApi(name) {
  const payload = await apiRequest("/api/groups", {
    method: "POST",
    body: JSON.stringify({ name })
  });

  return normalizeGroup(payload.group);
}

async function joinGroupApi(code) {
  const payload = await apiRequest("/api/groups/join", {
    method: "POST",
    body: JSON.stringify({ code })
  });

  return {
    group: normalizeGroup(payload.group),
    alreadyMember: Boolean(payload.alreadyMember),
    joined: Boolean(payload.joined)
  };
}

async function fetchGroupLeaderboardApi(groupId) {
  const payload = await apiRequest(`/api/groups/${groupId}/leaderboard`, { method: "GET" });
  return Array.isArray(payload.entries) ? payload.entries : [];
}

async function assignGroupBoardApi(groupId, boardId) {
  const payload = await apiRequest(`/api/groups/${groupId}/assignment`, {
    method: "PUT",
    body: JSON.stringify({ boardId: boardId || null })
  });

  return payload;
}

function readUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) {
    return null;
  }

  try {
    return normalizeUser(JSON.parse(raw));
  } catch (_error) {
    return null;
  }
}

function AmbientBackground() {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <span className="blob blob-a"></span>
      <span className="blob blob-b"></span>
      <span className="blob blob-c"></span>
    </div>
  );
}

function AppFooter() {
  return (
    <footer className="site-footer">
      <p className="footer-copy">
        <span>
          dorm floor productions
          <span className="tm-symbol">&trade;</span>
        </span>
        <img className="footer-volcano-gif" src={footerVolcanoGif} alt="" aria-hidden="true" />
      </p>
    </footer>
  );
}

function LandingPage({ user }) {
  const navigate = useNavigate();
  const brandTarget = user ? "/dashboard" : "/";

  return (
    <>
      <AmbientBackground />
      <header className="topbar app-topbar">
        <Link className="brand" to={brandTarget}>
          <img className="brand-logo-img" src={volcanoLogo} alt="" aria-hidden="true" />
          <span>Bingo Battles</span>
        </Link>
        <nav className="primary-nav auth-links" aria-label="Authentication links">
          <button className="btn btn-outline" type="button" onClick={() => navigate("/login")}>
            Log In
          </button>
          <button className="btn btn-primary" type="button" onClick={() => navigate("/signup")}>
            Sign Up
          </button>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-hero-copy">
            <h1 id="hero-title">Turn Your Goals Into An Explosive Challenge</h1>
            <p className="hero-copy">
              Create custom Bingo boards with your personal goals, compete with friends, and watch your progress erupt.
            </p>
            <button className="btn btn-accent btn-lg" type="button" onClick={() => navigate("/signup")}>
              Start Your Battle
            </button>
          </div>
          <img className="landing-hero-volcano" src={volcaneSVG} alt="" aria-hidden="true" />
        </section>

        <section className="feature-grid landing-feature-grid" aria-label="Key features">
          <article className="feature-card">
            <img src={gridIcon} alt="" aria-hidden="true" className="feature-icon" />
            <h3>Custom BINGO Boards</h3>
            <p>Create personalized Bingo boards with your unique goals and challenges.</p>
          </article>

          <article className="feature-card">
            <img src={trophyIcon} alt="" aria-hidden="true" className="feature-icon" />
            <h3>Competitive Leaderboard</h3>
            <p>See how you stack up against friends and climb to the top.</p>
          </article>

          <article className="feature-card">
            <img src={friendsIcon} alt="" aria-hidden="true" className="feature-icon" />
            <h3>Battle With Friends</h3>
            <p>Join groups, share your boards, and motivate each other to reach goals together.</p>
          </article>
        </section>

        <section className="landing-team" aria-label="Our Team">
          <h2>Our Team</h2>
          <div className="team-grid">
            <a href="https://www.linkedin.com/in/pari-vyas/" target="_blank" rel="noopener noreferrer" className="team-card">
              <img src={pariHeadshot} alt="Pari Vyas" className="team-headshot" />
              <h3>Pari Vyas</h3>
              <span className="team-role-pill">Backend Developer</span>
            </a>

            <a href="https://www.linkedin.com/in/joyce-maniquis-aa79b531b/" target="_blank" rel="noopener noreferrer" className="team-card">
              <img src={joyceHeadshot} alt="Joyce Maniquis" className="team-headshot" />
              <h3>Joyce Maniquis</h3>
              <span className="team-role-pill">Frontend Developer</span>
            </a>

            <a href="https://www.linkedin.com/in/hadiya-stewart-aab467352/" target="_blank" rel="noopener noreferrer" className="team-card">
              <img src={hadiyaHeadshot} alt="Hadiya Stewart" className="team-headshot" />
              <h3>Hadiya Stewart</h3>
              <span className="team-role-pill">UI Designer</span>
            </a>

            <a href="https://www.linkedin.com/in/colin-mendoza/" target="_blank" rel="noopener noreferrer" className="team-card">
              <img src={colinHeadshot} alt="Colin Mendoza" className="team-headshot" />
              <h3>Colin Mendoza</h3>
              <span className="team-role-pill">UX Designer</span>
            </a>
          </div>
        </section>

        <section className="landing-cta" aria-labelledby="cta-title">
          <h2 id="cta-title">Ready to Erupt?</h2>
          <p>Use Bingo Battles to transform your goals into reality.</p>
          <button className="btn btn-accent btn-lg" type="button" onClick={() => navigate("/signup")}>
            Create Your First Board
          </button>
        </section>
      </main>

      <AppFooter />
    </>
  );
}

function AuthPage({ setUser, mode, user }) {
  const navigate = useNavigate();
  const brandTarget = user ? "/dashboard" : "/";
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const isSignup = mode === "signup";

  async function submitAuth(event) {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const trimmedIdentifier = identifier.trim();

    if (isSignup) {
      if (!trimmedEmail || !trimmedUsername || !password) {
        setError("Email, username, and password are required.");
        return;
      }
    } else if (!trimmedIdentifier || !password) {
      setError("Username or email and password are required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      const endpoint = isSignup ? '/auth/signup' : '/auth/login';

      const response = await fetch(`${API_ORIGIN}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          isSignup
            ? { email: trimmedEmail, username: trimmedUsername, name: trimmedUsername, password }
            : { identifier: trimmedIdentifier, password }
        )
      });

      const responseText = await response.text();
      let data = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (_parseError) {
        data = {};
      }

      if (!response.ok) {
        setError(data.error || `${isSignup ? "Sign up" : "Log in"} failed (${response.status}).`);
        return;
      }

      const nextUser = normalizeUser(data.user);
      if (!nextUser) {
        setError("Invalid user response from server.");
        return;
      }

      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(nextUser));
      setUser(nextUser);
      navigate("/dashboard");
    } catch (_error) {
      const target = API_ORIGIN || "Vite proxy -> http://localhost:5000";
      setError(`Cannot reach backend via ${target}. Make sure backend is running.`);
    }
  }

  return (
    <>
      <AmbientBackground />
      <header className="topbar app-topbar">
        <Link className="brand" to={brandTarget}>
          <img className="brand-logo-img" src={volcanoLogo} alt="" aria-hidden="true" />
          <span>Bingo Battles</span>
        </Link>
        <nav className="primary-nav auth-links" aria-label="Authentication navigation">
          <button className="btn btn-outline" type="button" onClick={() => navigate("/")}>
            About
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => navigate(isSignup ? "/login" : "/signup")}
          >
            {isSignup ? "Log In" : "Sign Up"}
          </button>
        </nav>
      </header>

      <main className="auth-main">
        <section className="auth-card" aria-labelledby="authTitle">
          <p className="eyebrow">{isSignup ? "Create an Account" : "Welcome Back"}</p>
          <h1 id="authTitle">{isSignup ? "Sign Up" : "Log In"}</h1>
          <p className="auth-subtitle">
            {isSignup
              ? "Create an account to start your Bingo Battles board."
              : "Sign in to keep tracking your goals."}
          </p>

          <form className="auth-form" noValidate onSubmit={submitAuth}>
            {isSignup ? (
              <>
                <label className="field-label" htmlFor="emailInput">Email</label>
                <input
                  id="emailInput"
                  name="email"
                  className="field-input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />

                <label className="field-label" htmlFor="usernameInput">Username</label>
                <input
                  id="usernameInput"
                  name="username"
                  className="field-input"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </>
            ) : (
              <>
                <label className="field-label" htmlFor="identifierInput">Username or Email</label>
                <input
                  id="identifierInput"
                  name="identifier"
                  className="field-input"
                  type="text"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
              </>
            )}

            <label className="field-label" htmlFor="passwordInput">Password</label>
            <input
              id="passwordInput"
              name="password"
              className="field-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            <button type="submit" className="btn btn-primary btn-lg auth-submit">
              {isSignup ? "Create Account" : "Log In"}
            </button>
          </form>

          <button
            type="button"
            className="btn btn-outline btn-lg auth-google-btn"
            onClick={() => {
              const redirect = `${window.location.origin}${APP_BASE_PREFIX}/dashboard`;
              window.location.href = `${OAUTH_BACKEND_ORIGIN}/auth/google?redirect=${encodeURIComponent(redirect)}`;
            }}
          >
            Continue with Google
          </button>

          <a
            className="text-link"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              window.alert("Password reset is coming soon.");
            }}
          >
            Forgot password?
          </a>

          <p className="auth-switch">
            {isSignup ? "Already have an account? " : "Need an account? "}
            <Link className="text-link" to={isSignup ? "/login" : "/signup"}>
              {isSignup ? "Log In" : "Sign Up"}
            </Link>
          </p>

          <p className="auth-error" role="alert" hidden={!error}>
            {error}
          </p>
        </section>
      </main>

      <AppFooter />
    </>
  );
}

function DashboardPage({ user, setUser }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [boards, setBoards] = useState([]);
  const [createStep, setCreateStep] = useState(1);
  const [draftTitle, setDraftTitle] = useState("My 2026 Goals");
  const [draftGameType, setDraftGameType] = useState("five-in-a-row");
  const [draftGoals, setDraftGoals] = useState(() => createDraftGoals());
  const [groups, setGroups] = useState([]);
  const [groupLeaderboards, setGroupLeaderboards] = useState([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [groupNotice, setGroupNotice] = useState("");
  const [assignmentDraftByGroup, setAssignmentDraftByGroup] = useState({});
  const [draftBoardColor, setDraftBoardColor] = useState("#c10b3c");
  const [draftTileShape, setDraftTileShape] = useState("rounded");

  useEffect(() => {
    let isMounted = true;

    async function loadBoards() {
      try {
        const apiBoards = await fetchBoardsApi();
        if (isMounted) {
          setBoards(apiBoards);
        }
      } catch (error) {
        if (isMounted) {
          setGroupNotice(error.message || "Could not load boards.");
        }
      }
    }

    void loadBoards();

    return () => {
      isMounted = false;
    };
  }, [user.id]);

  useEffect(() => {
    let isMounted = true;

    async function loadGroups() {
      try {
        const apiGroups = await fetchGroupsApi();
        if (isMounted) {
          setGroups(apiGroups);
        }
      } catch (error) {
        if (isMounted) {
          setGroupNotice(error.message || "Could not load groups.");
        }
      }
    }

    void loadGroups();

    return () => {
      isMounted = false;
    };
  }, [user.id]);

  const yourProgress = calculateProgressFromBoards(boards);

  const userGroups = useMemo(
    () => groups.filter((group) => group.members.some((member) => member.id === user.id)),
    [groups, user.id]
  );

  useEffect(() => {
    const nextDrafts = {};
    userGroups.forEach((group) => {
      const membership = group.members.find((member) => member.id === user.id);
      nextDrafts[group.id] = membership?.assignedBoardId || "";
    });
    setAssignmentDraftByGroup(nextDrafts);
  }, [user.id, userGroups]);

  useEffect(() => {
    let isMounted = true;

    async function loadGroupLeaderboards() {
      if (userGroups.length === 0) {
        setGroupLeaderboards([]);
        return;
      }

      try {
        const allEntries = await Promise.all(
          userGroups.map(async (group) => ({
            id: group.id,
            name: group.name,
            code: group.code,
            entries: await fetchGroupLeaderboardApi(group.id)
          }))
        );

        if (isMounted) {
          setGroupLeaderboards(allEntries);
        }
      } catch (error) {
        if (isMounted) {
          setGroupNotice(error.message || "Could not load group leaderboards.");
        }
      }
    }

    void loadGroupLeaderboards();

    return () => {
      isMounted = false;
    };
  }, [userGroups]);

  function updateDraftGoal(index, value) {
    setDraftGoals((previous) => {
      const next = [...previous];
      next[index] = index === FREE_SPACE_INDEX ? FREE_SPACE_TEXT : value;
      return next;
    });
  }

  function resetCreateDraft() {
    setCreateStep(1);
    setDraftTitle("My 2026 Goals");
    setDraftGameType("five-in-a-row");
    setDraftGoals(createDraftGoals());
    setDraftBoardColor("#c10b3c");
    setDraftTileShape("rounded");
  }

  function goToCreateStep(nextStep) {
    if (nextStep < 1 || nextStep > CREATE_STEPS.length) {
      return;
    }

    if (nextStep > createStep && createStep === 1 && !draftTitle.trim()) {
      window.alert("Please provide a board name before continuing.");
      return;
    }

    setCreateStep(nextStep);
  }

  async function createBoard() {
    const title = draftTitle.trim();
    if (!title) {
      window.alert("Please provide a board name.");
      return;
    }

    const goals = draftGoals.map((goalText, index) => ({
      id: crypto.randomUUID(),
      text: index === FREE_SPACE_INDEX ? FREE_SPACE_TEXT : (goalText.trim() || `Goal ${index + 1}`),
      completed: false
    }));

    try {
      const created = await createBoardApi(title.trim(), goals);
      if (created) {
        setBoards((previous) => [
          {
            ...created,
            gameType: created.gameType || draftGameType,
            boardColor: created.boardColor || draftBoardColor,
            tileShape: created.tileShape || draftTileShape
          },
          ...previous
        ]);
      }
      setGroupNotice("");
    } catch (error) {
      setGroupNotice(error.message || "Could not create board.");
      return;
    }

    resetCreateDraft();
    setActiveTab("dashboard");
  }

  async function createGroup(event) {
    event.preventDefault();
    const name = newGroupName.trim();
    if (!name) {
      setGroupNotice("Please enter a group name.");
      return;
    }

    try {
      const created = await createGroupApi(name);
      if (created) {
        setGroups((previous) => [...previous, created]);
        setGroupNotice(`Created \"${created.name}\". Share code ${created.code} to invite others.`);
      }
      setNewGroupName("");
    } catch (error) {
      setGroupNotice(error.message || "Could not create group.");
    }
  }

  async function joinGroup(event) {
    event.preventDefault();
    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      setGroupNotice("Please enter a group code.");
      return;
    }

    try {
      const joinedPayload = await joinGroupApi(normalizedCode);
      if (joinedPayload.alreadyMember) {
        setGroupNotice("You are already in that group.");
      } else {
        setGroupNotice(`Joined ${joinedPayload.group?.name || "group"}.`);
      }

      const latestGroups = await fetchGroupsApi();
      setGroups(latestGroups);
      setJoinCode("");
    } catch (error) {
      setGroupNotice(error.message || "Could not join group.");
    }
  }

  async function assignBoardToGroup(groupId) {
    const selectedBoardId = assignmentDraftByGroup[groupId] || null;

    try {
      await assignGroupBoardApi(groupId, selectedBoardId);
      const latestGroups = await fetchGroupsApi();
      setGroups(latestGroups);
      setGroupNotice(selectedBoardId ? "Assigned board to group leaderboard." : "Cleared assigned board for this group.");
    } catch (error) {
      setGroupNotice(error.message || "Could not assign board to group.");
    }
  }

  function getBoardTitle(boardId) {
    const matchedBoard = boards.find((board) => board.id === boardId);
    return matchedBoard ? matchedBoard.title : "No board assigned";
  }

  async function toggleGoal(boardId, goalId) {
    const currentBoard = boards.find((board) => board.id === boardId);
    if (!currentBoard) {
      return;
    }

    const goals = Array.isArray(currentBoard.goals)
      ? currentBoard.goals.map((goal) =>
        goal.id === goalId
          ? { ...goal, completed: !goal.completed }
          : goal
      )
      : [];

    const optimisticBoard = {
      ...currentBoard,
      goals,
      completed: goals.filter((goal) => goal.completed).length
    };

    setBoards((previous) => previous.map((board) => (board.id === boardId ? optimisticBoard : board)));

    try {
      const updated = await updateBoardApi(optimisticBoard);
      if (updated) {
        setBoards((previous) => previous.map((board) => (board.id === boardId ? updated : board)));
      }
    } catch (_error) {
      setBoards((previous) => previous.map((board) => (board.id === boardId ? currentBoard : board)));
      setGroupNotice("Could not save goal progress.");
    }
  }

  async function signOut() {
    try {
      await fetch(`${API_ORIGIN}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch (_error) {
      // Ignore network errors during local sign out.
    }

    localStorage.removeItem(STORAGE_KEYS.user);
    setUser(null);
    navigate("/");
  }

  return (
    <>
      <AmbientBackground />
      <header className="topbar app-topbar dashboard-topbar">
        <Link className="brand" to="/dashboard" onClick={() => setActiveTab("dashboard")}>
          <img className="brand-logo-img" src={volcanoLogo} alt="" aria-hidden="true" />
          <span>Bingo Battles</span>
        </Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          <button
            className={`nav-link ${activeTab === "dashboard" ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`nav-link ${activeTab === "create" ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveTab("create")}
          >
            Create
          </button>
          <button
            className={`nav-link ${activeTab === "leaderboard" ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveTab("leaderboard")}
          >
            Leaderboard
          </button>
          <button
            className={`nav-link ${activeTab === "profile" ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveTab("profile")}
          >
            Profile
          </button>
          <button className="nav-link nav-signout" type="button" onClick={signOut}>
            Sign Out
          </button>
        </nav>
      </header>

      <main className="app-main">
        {activeTab === "dashboard" && (
          <section className="view-panel" aria-labelledby="dashboardTitle">
            <div className="panel-head">
              <h1 id="dashboardTitle">Your Dashboard</h1>
              <p>Welcome back, {user.name}!</p>
            </div>

            {boards.length === 0 && (
              <div className="empty-state">
                <h2>No boards yet</h2>
                <p>Create your first Bingo board to start tracking progress.</p>
                <button
                  className="btn btn-accent center-action-btn"
                  type="button"
                  onClick={() => {
                    resetCreateDraft();
                    setActiveTab("create");
                  }}
                >
                  Create a Board
                </button>
              </div>
            )}

            <div className="board-grid" aria-live="polite">
              {boards.map((board) => {
                const completionPercent = Math.round((board.completed / board.total) * 100);
                return (
                  <article className="board-card" key={board.id}>
                    <h3>{board.title}</h3>
                    <div className="progress-row">
                      <span>
                        {board.completed} of {board.total} goals complete
                      </span>
                      <strong>{completionPercent}%</strong>
                    </div>
                    <div className="progress-track" aria-hidden="true">
                      <div className="progress-fill" style={{ width: `${completionPercent}%` }}></div>
                    </div>

                    <div className="bingo-grid" aria-label={`${board.title} goals`}>
                      {board.goals.map((goal, index) => (
                        <button
                          key={goal.id}
                          className={`bingo-cell ${goal.completed ? "is-done" : ""}`}
                          type="button"
                          onClick={() => toggleGoal(board.id, goal.id)}
                        >
                          <span className="bingo-cell-index">{index + 1}</span>
                          <span>{goal.text}</span>
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "create" && (
          <section className="view-panel" aria-labelledby="createTitle">
            <div className="panel-head">
              <h1 id="createTitle">Create a New Board</h1>
              <p>Follow each step to build your board setup.</p>
            </div>

            <div className="create-board-form create-wizard">
              <div className="create-stepbar" aria-label="Create board progress">
                {CREATE_STEPS.map((stepLabel, index) => {
                  const stepNumber = index + 1;
                  const statusClass =
                    stepNumber < createStep ? "is-complete" : stepNumber === createStep ? "is-active" : "";

                  return (
                    <button
                      key={stepLabel}
                      className={`create-step-pill ${statusClass}`}
                      type="button"
                      onClick={() => goToCreateStep(stepNumber)}
                    >
                      <span className="sr-only">Step {stepNumber}: </span>
                      {stepLabel}
                    </button>
                  );
                })}
              </div>

              {createStep === 1 && (
                <div className="create-step-panel">
                  <label className="field-label" htmlFor="boardTitleInput">What is your board name?</label>
                  <input
                    id="boardTitleInput"
                    name="boardTitle"
                    className="field-input"
                    type="text"
                    required
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder="e.g., 2026 Fitness Goals"
                  />
                </div>
              )}

              {createStep === 2 && (
                <div className="create-step-panel">
                  <p className="create-help">Choose how you want to win your bingo game.</p>
                  <div className="game-type-options" role="radiogroup" aria-label="Game type options">
                    {GAME_TYPE_OPTIONS.map((option) => {
                      const isSelected = draftGameType === option.id;
                      return (
                        <button
                          key={option.id}
                          className={`game-type-card ${isSelected ? "is-selected" : ""}`}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setDraftGameType(option.id)}
                        >
                          <strong>{option.title}</strong>
                          <span>{option.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {createStep === 3 && (
                <div className="create-step-panel">
                  <p className="create-help">Add your goals to each tile. Center tile is always FREE SPACE.</p>

                  <div className="create-goal-grid" aria-label="Create board goals">
                    {draftGoals.map((goal, index) => (
                      <div className={`goal-input-cell ${index === FREE_SPACE_INDEX ? "is-free-space" : ""}`} key={`draft-${index}`}>
                        <label className="goal-input-index" htmlFor={`goal-input-${index}`}>
                          {index + 1}
                        </label>
                        <input
                          id={`goal-input-${index}`}
                          className="goal-input"
                          type="text"
                          value={goal}
                          onChange={(event) => updateDraftGoal(index, event.target.value)}
                          placeholder={index === FREE_SPACE_INDEX ? FREE_SPACE_TEXT : `Goal ${index + 1}`}
                          readOnly={index === FREE_SPACE_INDEX}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {createStep === 4 && (
                <div className="create-step-panel">
                  <p className="create-help">Customize your board color and tile shape.</p>

                  <div className="customize-group">
                    <h3>Board Color</h3>
                    <div className="color-options" role="radiogroup" aria-label="Board color options">
                      {BOARD_COLOR_OPTIONS.map((color) => {
                        const isSelected = draftBoardColor === color;
                        return (
                          <button
                            key={color}
                            className={`color-option ${isSelected ? "is-selected" : ""}`}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            aria-label={`Board color ${color}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setDraftBoardColor(color)}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="customize-group">
                    <h3>Tile Shape</h3>
                    <div className="shape-options" role="radiogroup" aria-label="Tile shape options">
                      {TILE_SHAPE_OPTIONS.map((shape) => {
                        const isSelected = draftTileShape === shape.id;
                        return (
                          <button
                            key={shape.id}
                            className={`shape-option ${isSelected ? "is-selected" : ""}`}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => setDraftTileShape(shape.id)}
                          >
                            <span className={`shape-preview shape-${shape.id}`}></span>
                            <span>{shape.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="preview-strip" aria-hidden="true" style={{ borderColor: draftBoardColor }}>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <span key={`preview-${index}`} className={`preview-tile shape-${draftTileShape}`}></span>
                    ))}
                  </div>
                </div>
              )}

              <div className="create-actions">
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => goToCreateStep(createStep - 1)}
                  disabled={createStep === 1}
                >
                  Back
                </button>

                {createStep < CREATE_STEPS.length ? (
                  <button className="btn btn-accent" type="button" onClick={() => goToCreateStep(createStep + 1)}>
                    Continue
                  </button>
                ) : (
                  <button className="btn btn-primary" type="button" onClick={createBoard}>
                    Create Board
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "leaderboard" && (
          <section className="view-panel" aria-labelledby="leaderboardTitle">
            <div className="panel-head">
              <h1 id="leaderboardTitle">Leaderboard</h1>
              <p>Each group is ranked by the single board each member assigns to that group.</p>
            </div>

            {groupLeaderboards.length === 0 && (
              <div className="empty-state">
                <h2>No groups yet</h2>
                <p>Create or join a group in Profile to see group leaderboards.</p>
              </div>
            )}

            <div className="group-leaderboard-list">
              {groupLeaderboards.map((groupBoard) => (
                <article className="leaderboard-shell group-leaderboard" key={groupBoard.id}>
                  <div className="group-leaderboard-head">
                    <h2>{groupBoard.name}</h2>
                    <p>Group code: {groupBoard.code}</p>
                  </div>
                  <table className="leaderboard-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Name</th>
                        <th>Assigned Board</th>
                        <th>Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupBoard.entries.map((entry, index) => (
                        <tr key={`${groupBoard.id}-${entry.id}`} className={entry.isSelf ? "self" : ""}>
                          <td>{index + 1}</td>
                          <td>{entry.name}</td>
                          <td>{entry.assignedBoardTitle || "Not assigned"}</td>
                          <td>{entry.progress}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "profile" && (
          <section className="view-panel" aria-labelledby="profileTitle">
            <div className="panel-head">
              <h1 id="profileTitle">Profile</h1>
              <p>Account and progress overview for {user.name}.</p>
            </div>

            <div className="empty-state">
              <h2>{user.name}</h2>
              <p>Total boards: {boards.length}</p>
              <p>Average progress: {yourProgress}%</p>
            </div>

            <section className="profile-groups" aria-label="Groups">
              <h2>Your Groups</h2>

              <form className="group-form" onSubmit={createGroup}>
                <label className="field-label" htmlFor="newGroupNameInput">Create a Group</label>
                <div className="group-form-row">
                  <input
                    id="newGroupNameInput"
                    className="field-input"
                    type="text"
                    value={newGroupName}
                    onChange={(event) => setNewGroupName(event.target.value)}
                    placeholder="Group name"
                  />
                  <button className="btn btn-primary" type="submit">Create Group</button>
                </div>
              </form>

              <form className="group-form" onSubmit={joinGroup}>
                <label className="field-label" htmlFor="joinGroupCodeInput">Join a Group</label>
                <div className="group-form-row">
                  <input
                    id="joinGroupCodeInput"
                    className="field-input"
                    type="text"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder="Enter group code"
                  />
                  <button className="btn btn-outline" type="submit">Join</button>
                </div>
              </form>

              <p className="group-notice" role="status">{groupNotice}</p>

              {userGroups.length === 0 && (
                <div className="empty-state">
                  <h3>No groups joined</h3>
                  <p>Create a group above or join one with a code.</p>
                </div>
              )}

              <div className="group-list">
                {userGroups.map((group) => (
                  <article className="group-card" key={group.id}>
                    {(() => {
                      const membership = group.members.find((member) => member.id === user.id);
                      const assignedBoardId = membership?.assignedBoardId || "";

                      return (
                        <>
                    <h3>{group.name}</h3>
                    <p>
                      Group code: <strong>{group.code}</strong>
                    </p>
                    <p>Members: {group.members.length}</p>
                    <p>
                      Role: {group.ownerId === user.id ? "Owner" : "Member"}
                    </p>

                    <label className="field-label" htmlFor={`assignment-${group.id}`}>
                      Leaderboard Board
                    </label>
                    <div className="group-form-row">
                      <select
                        id={`assignment-${group.id}`}
                        className="field-input"
                        value={assignmentDraftByGroup[group.id] ?? assignedBoardId}
                        onChange={(event) =>
                          setAssignmentDraftByGroup((previous) => ({
                            ...previous,
                            [group.id]: event.target.value
                          }))
                        }
                      >
                        <option value="">No board assigned</option>
                        {boards.map((board) => (
                          <option key={board.id} value={board.id}>
                            {board.title}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={() => assignBoardToGroup(group.id)}
                        disabled={boards.length === 0}
                      >
                        Save
                      </button>
                    </div>

                    <p>
                      Current assignment: <strong>{getBoardTitle(assignedBoardId)}</strong>
                    </p>
                        </>
                      );
                    })()}
                  </article>
                ))}
              </div>
            </section>
          </section>
        )}
      </main>

      <AppFooter />
    </>
  );
}

function DashboardGate({ user, setUser }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function syncUserFromSession() {
      try {
        const response = await fetch(`${API_ORIGIN}/auth/me`, {
          credentials: "include"
        });

        if (!response.ok) {
          if (isMounted) {
            localStorage.removeItem(STORAGE_KEYS.user);
            setUser(null);
            setLoading(false);
          }
          return;
        }

        const payload = await response.json();
        if (!payload?.authenticated || !payload?.user) {
          if (isMounted) {
            localStorage.removeItem(STORAGE_KEYS.user);
            setUser(null);
            setLoading(false);
          }
          return;
        }

        const sessionUser = normalizeUser(payload.user);
        if (!sessionUser) {
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(sessionUser));
        if (isMounted) {
          setUser(sessionUser);
          setLoading(false);
        }
      } catch (_error) {
        if (isMounted) {
          localStorage.removeItem(STORAGE_KEYS.user);
          setUser(null);
          setLoading(false);
        }
      }
    }

    void syncUserFromSession();

    return () => {
      isMounted = false;
    };
  }, [setUser]);

  if (loading) {
    return (
      <>
        <AmbientBackground />
        <main className="auth-main">
          <section className="auth-card">
            <h1>Loading session...</h1>
          </section>
        </main>
        <AppFooter />
      </>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <DashboardPage user={user} setUser={setUser} />;
}

function AuthLegacyRedirect() {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const mode = query.get("mode") === "signup" ? "signup" : "login";

  return <Navigate to={mode === "signup" ? "/signup" : "/login"} replace />;
}

export default function App() {
  const [user, setUser] = useState(() => readUser());

  return (
    <Routes>
      <Route path="/" element={<LandingPage user={user} />} />
      <Route path="/auth" element={<AuthLegacyRedirect />} />
      <Route path="/login" element={<AuthPage setUser={setUser} mode="login" user={user} />} />
      <Route path="/signup" element={<AuthPage setUser={setUser} mode="signup" user={user} />} />
      <Route path="/dashboard" element={<DashboardGate user={user} setUser={setUser} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
