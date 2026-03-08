import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import volcanoLogo from "../Volcano Logo resized.png";
import gridIcon from "../Grid_Icon.png";
import trophyIcon from "../Trophy_Icon.png";
import friendsIcon from "../Friends_Icon.png";
import volcaneSVG from "../Volcano_SVG.svg";

const STORAGE_KEYS = {
  user: "bingo-battles.user",
  boards: "bingo-battles.boards"
};

const BACKEND_ORIGIN = (import.meta.env.VITE_BACKEND_ORIGIN || "").trim();
const OAUTH_BACKEND_ORIGIN = BACKEND_ORIGIN || "http://localhost:5000";
const API_ORIGIN = OAUTH_BACKEND_ORIGIN;
const APP_BASE = import.meta.env.BASE_URL || "/";
const APP_BASE_PREFIX = APP_BASE.endsWith("/") ? APP_BASE.slice(0, -1) : APP_BASE;
const FIXED_GOAL_COUNT = 25;
const FREE_SPACE_INDEX = 12;
const FREE_SPACE_TEXT = "FREE SPACE";

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
    goals: normalizedGoals
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

function getBoardsStorageKey(user) {
  const normalized = normalizeUser(user);
  if (!normalized) {
    return null;
  }

  return `${STORAGE_KEYS.boards}:${normalized.id}`;
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

function readBoards(user) {
  const key = getBoardsStorageKey(user);
  if (!key) {
    return [];
  }

  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeBoard).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function writeBoards(user, boards) {
  const key = getBoardsStorageKey(user);
  if (!key) {
    return;
  }

  localStorage.setItem(key, JSON.stringify(boards));
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
      <p>
        dorm floor productions
        <span className="tm-symbol">&trade;</span>
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

        <section className="landing-cta" aria-labelledby="cta-title">
          <h2 id="cta-title">Ready to Erupt?</h2>
          <p>Use Bingo Battles to transform your goals into reality.</p>
          <button className="btn btn-accent btn-lg" type="button" onClick={() => navigate("/signup")}>
            Start Your Battle
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
  const [boards, setBoards] = useState(() => readBoards(user));
  const [draftTitle, setDraftTitle] = useState("My 2026 Goals");
  const [draftGoals, setDraftGoals] = useState(() => createDraftGoals());

  useEffect(() => {
    setBoards(readBoards(user));
  }, [user]);

  useEffect(() => {
    writeBoards(user, boards);
  }, [boards, user]);

  const yourProgress = boards.length
    ? Math.round(
      boards.reduce((sum, board) => sum + Math.round((board.completed / board.total) * 100), 0) / boards.length
    )
    : 0;

  const rankings = useMemo(() => {
    const friends = [
      { name: "Avery", progress: 72 },
      { name: "Kai", progress: 64 },
      { name: "Rin", progress: 49 },
      { name: "Milo", progress: 33 }
    ];

    return [{ name: user.name, progress: yourProgress, isSelf: true }, ...friends].sort(
      (a, b) => b.progress - a.progress
    );
  }, [user.name, yourProgress]);

  function updateDraftGoal(index, value) {
    setDraftGoals((previous) => {
      const next = [...previous];
      next[index] = index === FREE_SPACE_INDEX ? FREE_SPACE_TEXT : value;
      return next;
    });
  }

  function createBoard(event) {
    event.preventDefault();

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

    setBoards((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        total: FIXED_GOAL_COUNT,
        completed: 0,
        goals
      }
    ]);

    setDraftTitle("My 2026 Goals");
    setDraftGoals(createDraftGoals());
    setActiveTab("dashboard");
  }

  function toggleGoal(boardId, goalId) {
    setBoards((previous) =>
      previous.map((board) => {
        if (board.id !== boardId) {
          return board;
        }

        const goals = Array.isArray(board.goals)
          ? board.goals.map((goal) =>
            goal.id === goalId
              ? { ...goal, completed: !goal.completed }
              : goal
          )
          : [];

        return {
          ...board,
          goals,
          completed: goals.filter((goal) => goal.completed).length
        };
      })
    );
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
                  onClick={() => setActiveTab("create")}
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
              <h1 id="createTitle">Create a New Card</h1>
              <p>Build a fresh Bingo board and start tracking your goals today.</p>
            </div>

            <form className="create-board-form" onSubmit={createBoard}>
              <label className="field-label" htmlFor="boardTitleInput">Board Name</label>
              <input
                id="boardTitleInput"
                name="boardTitle"
                className="field-input"
                type="text"
                required
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
              />

              <p className="create-help">Fill in your goals below. Goal 13 is fixed as FREE SPACE.</p>

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

              <button className="btn btn-primary center-action-btn" type="submit">
                Create Board
              </button>
            </form>
          </section>
        )}

        {activeTab === "leaderboard" && (
          <section className="view-panel" aria-labelledby="leaderboardTitle">
            <div className="panel-head">
              <h1 id="leaderboardTitle">Leaderboard</h1>
              <p>Ranked by progress percentage across active boards.</p>
            </div>

            <div className="leaderboard-shell">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((entry, index) => (
                    <tr key={entry.name} className={entry.isSelf ? "self" : ""}>
                      <td>{index + 1}</td>
                      <td>{entry.name}</td>
                      <td>{entry.progress}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          </section>
        )}
      </main>

      <AppFooter />
    </>
  );
}

function DashboardGate({ user, setUser }) {
  const [loading, setLoading] = useState(!user);

  useEffect(() => {
    let isMounted = true;

    async function syncUserFromSession() {
      if (user) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_ORIGIN}/auth/me`, {
          credentials: "include"
        });

        console.log('auth/me status:', response.status);

        if (!response.ok) {
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        const payload = await response.json();
        console.log('auth/me payload:', payload);
        if (!payload?.authenticated || !payload?.user) {
          if (isMounted) {
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
        console.log('syncUserFromSession error:', _error);
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void syncUserFromSession();

    return () => {
      isMounted = false;
    };
  }, [setUser, user]);

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
