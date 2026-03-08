import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

const STORAGE_KEYS = {
  user: "bingo-battles.user",
  boards: "bingo-battles.boards"
};

const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_ORIGIN || "http://localhost:5000";

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
    return Array.isArray(parsed) ? parsed : [];
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
        <Link className="brand" to={brandTarget}>Bingo Battles</Link>
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
        <section className="landing-section hero" aria-labelledby="hero-title">
          <p className="eyebrow">Turn intent into action</p>
          <h1 id="hero-title">Transform your goals into an explosive challenge</h1>
          <p className="hero-copy">
            Bingo Battles helps you map your personal goals onto a board, track real progress, and stay motivated with
            friendly competition. Complete squares, raise your percentage, and race your friends on the leaderboard.
          </p>
        </section>

        <section className="landing-section" aria-labelledby="features-title">
          <h2 id="features-title">Features</h2>
          <div className="feature-grid">
            <article className="feature-card">
              <h3>Custom Boards</h3>
              <p>Build a board around your real goals with flexible square counts and categories.</p>
            </article>
            <article className="feature-card">
              <h3>Progress Tracking</h3>
              <p>See completion percentages update as you mark goals complete.</p>
            </article>
            <article className="feature-card">
              <h3>Leaderboard</h3>
              <p>Compare momentum with friends and keep each other motivated.</p>
            </article>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="how-title">
          <h2 id="how-title">How It Works</h2>
          <ol className="how-list">
            <li>Create a custom Bingo board for your personal goals.</li>
            <li>Track progress, mark completed goals, and watch your completion percentage rise.</li>
            <li>Join a group and compare progress on the leaderboard.</li>
          </ol>
        </section>

        <section className="landing-section join-now" aria-labelledby="join-title">
          <h2 id="join-title">Join Now</h2>
          <p>Start your first board and begin tracking your goals today.</p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" type="button" onClick={() => navigate("/signup")}>
              Create Your First Board
            </button>
            <button className="btn btn-ghost btn-lg" type="button" onClick={() => navigate("/login")}>
              I Already Have an Account
            </button>
          </div>
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
      const response = await fetch(`${BACKEND_ORIGIN}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          isSignup
            ? { email: trimmedEmail, username: trimmedUsername, name: trimmedUsername, password }
            : { identifier: trimmedIdentifier, password }
        )
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Authentication failed');
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
    } catch (error) {
      setError("Network error. Please try again.");
    }
  }

  return (
    <>
      <AmbientBackground />
      <header className="topbar app-topbar">
        <Link className="brand" to={brandTarget}>Bingo Battles</Link>
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
              window.location.href = `${BACKEND_ORIGIN}/auth/google`;
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

  function createBoard() {
    const title = window.prompt("Board name:", "My 2026 Goals");
    if (!title || !title.trim()) {
      return;
    }

    const rawTotal = window.prompt("How many goals (squares) should this board have?", "9");
    const parsedTotal = Number.parseInt(rawTotal || "", 10);
    const total = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : 9;

    setBoards((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        total,
        completed: 0
      }
    ]);
  }

  function incrementBoardProgress(boardId) {
    setBoards((previous) =>
      previous.map((board) => {
        if (board.id !== boardId) {
          return board;
        }

        return {
          ...board,
          completed: Math.min(board.total, board.completed + 1)
        };
      })
    );
  }

  async function signOut() {
    try {
      await fetch(`${BACKEND_ORIGIN}/auth/logout`, {
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
          Bingo Battles
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
                <button className="btn btn-primary center-action-btn" type="button" onClick={createBoard}>
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
                    <button className="inline-btn" type="button" onClick={() => incrementBoardProgress(board.id)}>
                      Mark 1 goal complete
                    </button>
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

            <div className="empty-state">
              <h2>Ready for a new challenge?</h2>
              <p>Choose a board name and number of goals, then we will add it to your dashboard.</p>
              <button className="btn btn-primary center-action-btn" type="button" onClick={createBoard}>
                Create a Board
              </button>
            </div>
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
        const response = await fetch(`${BACKEND_ORIGIN}/auth/me`, {
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
