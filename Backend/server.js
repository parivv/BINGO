const express = require("express");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const parseLines = (text) => {
    const parsed = {};
    const lines = text.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      parsed[key] = value;
    }

    return parsed;
  };

  const rawBuffer = fs.readFileSync(envPath);
  const utf8Text = rawBuffer.toString("utf8").replace(/^\uFEFF/, "");
  let parsed = parseLines(utf8Text);

  // Some editors on Windows save .env as UTF-16 LE, which can appear as UTF-8 with null bytes.
  const hasNullBytes = utf8Text.includes("\u0000");
  const hasCorruptKeys = Object.keys(parsed).some((key) => key.includes("\u0000"));
  if (Object.keys(parsed).length === 0 || hasNullBytes || hasCorruptKeys) {
    parsed = parseLines(rawBuffer.toString("utf16le").replace(/^\uFEFF/, ""));
  }

  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }
}

loadEnvFile();

const supabase = require("./supabase");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const FRONTEND_REDIRECT =
  process.env.FRONTEND_REDIRECT || `${FRONTEND_ORIGIN}/dashboard`;
const HAS_GOOGLE_OAUTH =
  Boolean(process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET) &&
  Boolean(process.env.GOOGLE_REDIRECT_URI);

if (!HAS_GOOGLE_OAUTH) {
  console.warn(
    "Google OAuth env vars are missing. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in Backend/.env"
  );
}

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "replace-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

if (HAS_GOOGLE_OAUTH) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_REDIRECT_URI,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value || null;
            const { data: existingUser } = await supabase
                .from('users').select('*').eq('email', email).single();
            if (!existingUser) {
                const { data: newUser } = await supabase
                    .from('users').insert({ email, name : profile.displayName, avatar_url: profile.photos?.[0]?.value || null, provider: 'google' }).select().single();
                return done(null, newUser);
            }
            return done(null, existingUser)
        }catch (err) {
            return done(err, null);
        }
    }
    )
  );
}

function oauthNotConfigured(res) {
  return res.status(503).json({
    error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
  });
}

app.get(
  "/auth/google",
  (req, res, next) => {
    if (!HAS_GOOGLE_OAUTH) {
      return oauthNotConfigured(res);
    }
    return next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  (req, res, next) => {
    if (!HAS_GOOGLE_OAUTH) {
      return oauthNotConfigured(res);
    }
    return next();
  },
  passport.authenticate("google", { failureRedirect: `${FRONTEND_ORIGIN}/` }),
  (req, res) => {
    res.redirect(FRONTEND_REDIRECT);
  }
);

app.get("/auth/me", (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ authenticated: false });
  }

  return res.json({ authenticated: true, user: req.user });
});

app.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Backend running" });
});

app.post("/api/contact", (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: "All fields are required" });
  }

  // TODO: save to DB or send email
  res.json({ success: true });
});

// ─── Email Sign Up ────────────────────────────────────────────
app.post('/auth/signup', async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !name || !password)
    return res.status(400).json({ error: 'All fields required' });

  const { data: existingUser } = await supabase
    .from('users').select('*').eq('email', email).single();

  if (existingUser)
    return res.status(400).json({ error: 'Email already in use' });

  const password_hash = await bcrypt.hash(password, 10);

  const { data: newUser, error } = await supabase
    .from('users')
    .insert({ email, name, password_hash, provider: 'email' })
    .select().single();

  if (error) return res.status(500).json({ error: 'Signup failed' });

  req.login(newUser, (err) => {
    if (err) return res.status(500).json({ error: 'Login after signup failed' });
    res.json({ success: true, user: newUser });
  });
});

// ─── Email Sign In ────────────────────────────────────────────
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  const { data: user } = await supabase
    .from('users').select('*').eq('email', email).single();

  if (!user)
    return res.status(400).json({ error: 'User not found' });

  if (user.provider === 'google')
    return res.status(400).json({ error: 'Please sign in with Google' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid)
    return res.status(400).json({ error: 'Wrong password' });

  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: 'Login failed' });
    res.json({ success: true, user });
  });
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});