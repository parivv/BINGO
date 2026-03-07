import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

const STORAGE_KEYS = {
  user: "bingo-battles.user",
  boards: "bingo-battles.boards"
};

const BACKEND_ORIGIN = "http://localhost:5000";

function readUser() {
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

function readBoards() {
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

function writeBoards(boards) {
  localStorage.setItem(STORAGE_KEYS.boards, JSON.stringify(boards));
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

function LandingPage() {
  const navigate = useNavigate();

  return (
    <>
      <AmbientBackground />
      <header className="topbar landing-topbar">
        <Link className="brand" to="/">Bingo Battles</Link>
        <nav className="auth-links" aria-label="Authentication links">
          <button className="btn btn-outline" type="button" onClick={() => navigate("/auth?mode=login")}>
            Log In
          </button>
          <button className="btn btn-primary" type="button" onClick={() => navigate("/auth?mode=signup")}>
            Sign Up
          </button>
        </nav>
      </header>

      <main className="landing-main">
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">Build Momentum, Not Just Lists</p>
          <h1 id="hero-title">Turn your goals into a BINGO challenge you actually finish.</h1>
          <p className="hero-copy">
            Bingo Battles helps you map your personal goals onto a board, track real progress, and stay motivated with
            friendly competition. Complete squares, raise your percentage, and race your friends on the leaderboard.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" type="button" onClick={() => navigate("/auth?mode=signup")}>
              Start Your First Board
            </button>
            <button className="btn btn-ghost btn-lg" type="button" onClick={() => navigate("/auth?mode=login")}>
              I Already Have an Account
            </button>
          </div>
        </section>

        <section className="usage-panel" aria-labelledby="usage-title">
          <h2 id="usage-title">How It Works</h2>
          <ol>
            <li>Create a board for your fitness, career, school, or life goals.</li>
            <li>Mark completed goals and watch your completion percentage rise.</li>
            <li>Join a group and compare progress on the leaderboard.</li>
          </ol>
          <div className="mini-preview" aria-hidden="true">
            <div className="mini-cell done">Apply to job</div>
            <div className="mini-cell">Read 4 books</div>
            <div className="mini-cell done">Workout 20x</div>
            <div className="mini-cell">Build portfolio</div>
          </div>
        </section>
      </main>
    </>
  );
}

function AuthPage({ setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const mode = useMemo(() => {
    const query = new URLSearchParams(location.search);
    return query.get("mode") === "signup" ? "signup" : "login";
  }, [location.search]);

  const isSignup = mode === "signup";

  function submitAuth(event) {
    event.preventDefault();
    setError("");

    const trimmed = username.trim();
    if (!trimmed || !password) {
      setError("Username and password are required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    const nextUser = { name: trimmed };
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(nextUser));
    setUser(nextUser);
    navigate("/dashboard");
  }

  return (
    <>
      <AmbientBackground />
      <header className="topbar landing-topbar">
        <Link className="brand" to="/">Bingo Battles</Link>
      </header>

      <main className="auth-main">
        <section className="auth-card" aria-labelledby="authTitle">
          <p className="eyebrow">{isSignup ? "Create Account" : "Welcome Back"}</p>
          <h1 id="authTitle">{isSignup ? "Sign Up" : "Log In"}</h1>
          <p className="auth-subtitle">
            {isSignup
              ? "Create an account to start your Bingo Battles board."
              : "Sign in to keep tracking your goals."}
          </p>

          <form className="auth-form" noValidate onSubmit={submitAuth}>
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
            <Link className="text-link" to={isSignup ? "/auth?mode=login" : "/auth?mode=signup"}>
              {isSignup ? "Log In" : "Sign Up"}
            </Link>
          </p>

          <p className="auth-error" role="alert" hidden={!error}>
            {error}
          </p>
        </section>
      </main>
    </>
  );
}

function DashboardPage({ user, setUser }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [boards, setBoards] = useState(() => readBoards());

  useEffect(() => {
    writeBoards(boards);
  }, [boards]);

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
      <header className="topbar app-topbar">
        <Link className="brand" to="/dashboard">Bingo Battles</Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          <button
            className={`nav-link ${activeTab === "dashboard" ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`nav-link ${activeTab === "leaderboard" ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveTab("leaderboard")}
          >
            Leaderboard
          </button>
        </nav>

        <div className="menu-wrap">
          <button
            className="menu-toggle"
            aria-expanded={isMenuOpen ? "true" : "false"}
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
          >
            <span></span>
            <span></span>
            <span></span>
            <span className="sr-only">Open account menu</span>
          </button>

          {isMenuOpen && (
            <div className="menu-panel" role="menu">
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  createBoard();
                  setMenuOpen(false);
                }}
              >
                Create New BINGO Board
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  const groupCode = window.prompt("Enter a group code to join:", "GOALS-2026");
                  if (groupCode && groupCode.trim()) {
                    window.alert(`Joined group ${groupCode.trim()} successfully.`);
                  }
                  setMenuOpen(false);
                }}
              >
                Join a Group
              </button>
              <button role="menuitem" type="button" onClick={signOut}>
                Sign Out
              </button>
            </div>
          )}
        </div>
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
                <p>Create your first BINGO board to start tracking progress.</p>
                <button className="btn btn-primary" type="button" onClick={createBoard}>
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
      </main>
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

        if (!response.ok) {
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        const payload = await response.json();
        if (!payload?.authenticated || !payload?.user) {
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        const sessionUser = {
          name: payload.user.name || payload.user.email || "Player"
        };

        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(sessionUser));
        if (isMounted) {
          setUser(sessionUser);
          setLoading(false);
        }
      } catch (_error) {
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
      </>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <DashboardPage user={user} setUser={setUser} />;
}

export default function App() {
  const [user, setUser] = useState(() => readUser());

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage setUser={setUser} />} />
      <Route path="/dashboard" element={<DashboardGate user={user} setUser={setUser} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
