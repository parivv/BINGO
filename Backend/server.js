const express = require("express");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");

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
const PORT = process.env.PORT || 8000;
const FIXED_GOAL_COUNT = 25;
const FREE_SPACE_INDEX = 12;
const FREE_SPACE_TEXT = "FREE SPACE";
const MAX_AI_SUGGESTIONS = FIXED_GOAL_COUNT - 1;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const ALLOWED_GAME_TYPES = new Set(["five-in-a-row", "blackout"]);
const ALLOWED_TILE_SHAPES = new Set(["rounded", "square", "circle"]);
const DEFAULT_DEPLOYED_ORIGIN = "https://parivv.github.io";

function normalizeHexColor(value) {
  if (typeof value !== "string") {
    return "#c10b3c";
  }

  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : "#c10b3c";
}
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const FRONTEND_REDIRECT =
  process.env.FRONTEND_REDIRECT || `${FRONTEND_ORIGIN}/dashboard`;
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function parseBoolean(value, fallback = false) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function toOrigin(value) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).origin;
  } catch (_error) {
    return "";
  }
}

function getRequestOrigin(req) {
  const headerOrigin = req.get("origin");
  if (headerOrigin) {
    return headerOrigin;
  }

  const referer = req.get("referer");
  return toOrigin(referer);
}

const FRONTEND_ORIGIN_BASE = toOrigin(FRONTEND_ORIGIN) || FRONTEND_ORIGIN;
const FRONTEND_ORIGINS = [
  FRONTEND_ORIGIN_BASE,
  DEFAULT_DEPLOYED_ORIGIN,
  ...String(process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((origin) => toOrigin(origin.trim()) || origin.trim())
    .filter(Boolean)
];
const ALLOWED_FRONTEND_ORIGINS = new Set(FRONTEND_ORIGINS);

const SESSION_COOKIE_SECURE = parseBoolean(process.env.SESSION_COOKIE_SECURE, process.env.NODE_ENV === "production");
const SESSION_COOKIE_SAME_SITE = process.env.SESSION_COOKIE_SAMESITE
  ? process.env.SESSION_COOKIE_SAMESITE.trim().toLowerCase()
  : (SESSION_COOKIE_SECURE ? "none" : "lax");

if (SESSION_COOKIE_SECURE) {
  // Required for secure cookies behind proxies like Render/Heroku.
  app.set("trust proxy", 1);
}

function isAllowedFrontendRedirect(redirectUrl) {
  if (!redirectUrl) {
    return false;
  }

  try {
    const parsed = new URL(redirectUrl);
    const origin = parsed.origin;
    return ALLOWED_FRONTEND_ORIGINS.has(origin) || LOCAL_ORIGIN_PATTERN.test(origin);
  } catch (_error) {
    return false;
  }
}

function resolveOAuthRedirect(req) {
  const requestedRedirect = typeof req.query.redirect === "string" ? req.query.redirect : "";
  if (isAllowedFrontendRedirect(requestedRedirect)) {
    return requestedRedirect;
  }

  const reqOrigin = getRequestOrigin(req);
  if (LOCAL_ORIGIN_PATTERN.test(reqOrigin)) {
    return `${reqOrigin}/dashboard`;
  }

  return FRONTEND_REDIRECT;
}
const HAS_GOOGLE_OAUTH =
  Boolean(process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET) &&
  Boolean(process.env.GOOGLE_REDIRECT_URI);

if (!HAS_GOOGLE_OAUTH) {
  console.warn(
    "Google OAuth env vars are missing. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in Backend/.env"
  );
}

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests and local dev ports by default.
      if (!origin || ALLOWED_FRONTEND_ORIGINS.has(origin) || LOCAL_ORIGIN_PATTERN.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "replace-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: SESSION_COOKIE_SECURE,
      sameSite: SESSION_COOKIE_SAME_SITE,
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

    req.session.oauthRedirect = resolveOAuthRedirect(req);
    console.log('OAuth redirect set to:', req.session.oauthRedirect);

    return next();
  },
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "consent select_account",
    max_age: 0,
  })
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
    const redirectTarget = isAllowedFrontendRedirect(req.session.oauthRedirect)
      ? req.session.oauthRedirect
      : FRONTEND_REDIRECT;

    delete req.session.oauthRedirect;
    res.redirect(redirectTarget);
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

function requireAuth(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

app.put("/api/profile/username", requireAuth, async (req, res) => {
  const userId = req.user?.id;
  const nextName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const normalizedNextName = nextName.toLowerCase();

  if (!userId) {
    return res.status(400).json({ error: "Authenticated user id missing." });
  }

  if (!nextName) {
    return res.status(400).json({ error: "Username is required." });
  }

  const { data: existingUser, error: existingErr } = await supabase
    .from("users")
    .select("id")
    .ilike("name", normalizedNextName)
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    return res.status(500).json({ error: existingErr.message });
  }

  if (existingUser && existingUser.id !== userId) {
    return res.status(400).json({ error: "Username already in use" });
  }

  const { data: updatedUser, error: updateErr } = await supabase
    .from("users")
    .update({ name: nextName })
    .eq("id", userId)
    .select("*")
    .single();

  if (updateErr || !updatedUser) {
    return res.status(500).json({ error: updateErr?.message || "Could not update username." });
  }

  const { error: groupMemberErr } = await supabase
    .from("group_members")
    .update({ user_name: nextName })
    .eq("user_id", userId);

  if (groupMemberErr) {
    return res.status(500).json({ error: groupMemberErr.message });
  }

  req.login(updatedUser, (loginErr) => {
    if (loginErr) {
      return res.status(500).json({ error: "Could not refresh session user." });
    }

    return res.json({ user: updatedUser });
  });
});

function generateGroupCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function createUniqueGroupCode() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = generateGroupCode();
    const { data, error } = await supabase
      .from("groups")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;
    if (!data) return code;
  }

  return `${Date.now().toString(36).slice(-6)}`.toUpperCase();
}

// GET groups for current user
app.get("/api/groups", requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(400).json({ error: "Authenticated user id missing." });

  const { data: memberships, error: mErr } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);

  if (mErr) return res.status(500).json({ error: mErr.message });

  const groupIds = (memberships || []).map((m) => m.group_id);
  if (groupIds.length === 0) return res.json({ groups: [] });

  const { data: groups, error: gErr } = await supabase
    .from("groups")
    .select("id, name, code, owner_user_id, created_at")
    .in("id", groupIds);

  if (gErr) return res.status(500).json({ error: gErr.message });

  const { data: members, error: membersErr } = await supabase
    .from("group_members")
    .select("group_id, user_id, user_name, assigned_board_id")
    .in("group_id", groupIds);

  if (membersErr) return res.status(500).json({ error: membersErr.message });

  const withMembers = (groups || []).map((group) => ({
    ...group,
    members: (members || [])
      .filter((member) => member.group_id === group.id)
      .map((member) => ({
        id: member.user_id,
        name: member.user_name,
        assignedBoardId: member.assigned_board_id || null
      }))
  }));

  return res.json({ groups: withMembers });
});

// Create group
app.post("/api/groups", requireAuth, async (req, res) => {
  const userId = req.user?.id;
  const userName = req.user?.name || "Player";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!userId) return res.status(400).json({ error: "Authenticated user id missing." });
  if (!name) return res.status(400).json({ error: "Group name is required." });

  try {
    const code = await createUniqueGroupCode();

    const { data: createdGroup, error: groupErr } = await supabase
      .from("groups")
      .insert({
        name,
        code,
        owner_user_id: userId
      })
      .select("id, name, code, owner_user_id, created_at")
      .single();

    if (groupErr) return res.status(500).json({ error: groupErr.message });

    const { error: memberErr } = await supabase
      .from("group_members")
      .insert({
        group_id: createdGroup.id,
        user_id: userId,
        user_name: userName,
        assigned_board_id: null
      });

    if (memberErr) return res.status(500).json({ error: memberErr.message });

    return res.status(201).json({
      group: {
        ...createdGroup,
        members: [{ id: userId, name: userName, assignedBoardId: null }]
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to create group." });
  }
});

// Join by code
app.post("/api/groups/join", requireAuth, async (req, res) => {
  const userId = req.user?.id;
  const userName = req.user?.name || "Player";
  const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";

  if (!userId) return res.status(400).json({ error: "Authenticated user id missing." });
  if (!code) return res.status(400).json({ error: "Group code is required." });

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select("id, name, code, owner_user_id, created_at")
    .eq("code", code)
    .maybeSingle();

  if (groupErr) return res.status(500).json({ error: groupErr.message });
  if (!group) return res.status(404).json({ error: "Group code not found." });

  const { data: existingMembership, error: existingErr } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", group.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (existingMembership) return res.status(200).json({ group, alreadyMember: true });

  const { error: joinErr } = await supabase
    .from("group_members")
    .insert({
      group_id: group.id,
      user_id: userId,
      user_name: userName,
      assigned_board_id: null
    });

  if (joinErr) return res.status(500).json({ error: joinErr.message });

  return res.json({ group, joined: true });
});

app.delete("/api/groups/:groupId", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(400).json({ error: "Authenticated user id missing." });
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, owner_user_id")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) {
    return res.status(500).json({ error: groupError.message });
  }

  if (!group) {
    return res.status(404).json({ error: "Group not found." });
  }

  if (group.owner_user_id !== userId) {
    return res.status(403).json({ error: "Only the group owner can delete this group." });
  }

  const { error: memberDeleteError } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId);

  if (memberDeleteError) {
    return res.status(500).json({ error: memberDeleteError.message });
  }

  const { error: groupDeleteError } = await supabase
    .from("groups")
    .delete()
    .eq("id", groupId);

  if (groupDeleteError) {
    return res.status(500).json({ error: groupDeleteError.message });
  }

  return res.json({ success: true, groupId });
});

app.put("/api/groups/:groupId/assignment", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user?.id;
  const boardId = req.body?.boardId || null;

  if (!userId) {
    return res.status(400).json({ error: "Authenticated user id missing." });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    return res.status(500).json({ error: membershipError.message });
  }

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this group." });
  }

  if (boardId) {
    const { data: board, error: boardError } = await supabase
      .from("boards")
      .select("id")
      .eq("id", boardId)
      .eq("user_id", userId)
      .maybeSingle();

    if (boardError) {
      return res.status(500).json({ error: boardError.message });
    }

    if (!board) {
      return res.status(400).json({ error: "Selected board does not belong to your account." });
    }
  }

  const { error: updateError } = await supabase
    .from("group_members")
    .update({ assigned_board_id: boardId })
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  return res.json({ success: true, assignedBoardId: boardId });
});

// Group leaderboard
app.get("/api/groups/:groupId/leaderboard", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user?.id;
  if (!userId) return res.status(400).json({ error: "Authenticated user id missing." });

  const { data: membership, error: memErr } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memErr) return res.status(500).json({ error: memErr.message });
  if (!membership) return res.status(403).json({ error: "Not a member of this group." });

  const { data: members, error: membersErr } = await supabase
    .from("group_members")
    .select("user_id, user_name, assigned_board_id")
    .eq("group_id", groupId);

  if (membersErr) return res.status(500).json({ error: membersErr.message });

  const assignedBoardIds = (members || [])
    .map((member) => member.assigned_board_id)
    .filter(Boolean);

  const { data: boards, error: boardsErr } = await supabase
    .from("boards")
    .select("id, title, user_id, total, completed")
    .in("id", assignedBoardIds.length > 0 ? assignedBoardIds : ["00000000-0000-0000-0000-000000000000"]);

  if (boardsErr) return res.status(500).json({ error: boardsErr.message });

  const entries = (members || []).map((member) => {
    const assignedBoard = (boards || []).find((board) => board.id === member.assigned_board_id);
    const progress = assignedBoard ? Math.round((assignedBoard.completed / assignedBoard.total) * 100) : 0;

    return {
      id: member.user_id,
      name: member.user_name,
      progress,
      boardCount: assignedBoard ? 1 : 0,
      assignedBoardTitle: assignedBoard ? assignedBoard.title : null,
      isSelf: member.user_id === userId
    };
  }).sort((a, b) => b.progress - a.progress);

  return res.json({ entries });
});

app.get("/api/groups/:groupId/members/:memberId/boards", requireAuth, async (req, res) => {
  const { groupId, memberId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(400).json({ error: "Authenticated user id missing." });
  }

  const { data: requesterMembership, error: requesterMembershipError } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (requesterMembershipError) {
    return res.status(500).json({ error: requesterMembershipError.message });
  }

  if (!requesterMembership) {
    return res.status(403).json({ error: "Not a member of this group." });
  }

  const { data: targetMembership, error: targetMembershipError } = await supabase
    .from("group_members")
    .select("id, assigned_board_id")
    .eq("group_id", groupId)
    .eq("user_id", memberId)
    .maybeSingle();

  if (targetMembershipError) {
    return res.status(500).json({ error: targetMembershipError.message });
  }

  if (!targetMembership) {
    return res.status(404).json({ error: "User is not a member of this group." });
  }

  if (!targetMembership.assigned_board_id) {
    return res.json({ boards: [] });
  }

  const { data: assignedBoard, error: boardsError } = await supabase
    .from("boards")
    .select("id, title, total, completed, goals, game_type, board_color, shape, created_at, updated_at")
    .eq("id", targetMembership.assigned_board_id)
    .eq("user_id", memberId)
    .maybeSingle();

  if (boardsError) {
    return res.status(500).json({ error: boardsError.message });
  }

  return res.json({ boards: assignedBoard ? [assignedBoard] : [] });
});

function normalizeGoals(rawGoals) {
  const source = Array.isArray(rawGoals) ? rawGoals : [];

  return Array.from({ length: FIXED_GOAL_COUNT }, (_, index) => {
    const rawGoal = source[index];
    const defaultText = index === FREE_SPACE_INDEX ? FREE_SPACE_TEXT : `Goal ${index + 1}`;

    if (!rawGoal || typeof rawGoal !== "object") {
      return {
        id: randomUUID(),
        text: defaultText,
        completed: index === FREE_SPACE_INDEX,
        tallyTarget: null,
        tallyProgress: 0
      };
    }

    const text =
      index === FREE_SPACE_INDEX
        ? FREE_SPACE_TEXT
        : typeof rawGoal.text === "string" && rawGoal.text.trim()
          ? rawGoal.text.trim()
          : defaultText;

    const rawTarget = Number.parseInt(rawGoal.tallyTarget ?? rawGoal.tally_target ?? "", 10);
    const tallyTarget = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : null;

    const rawProgress = Number.parseInt(rawGoal.tallyProgress ?? rawGoal.tally_progress ?? "", 10);
    const tallyProgress = Number.isFinite(rawProgress) && rawProgress > 0
      ? (tallyTarget ? Math.min(rawProgress, tallyTarget) : rawProgress)
      : 0;

    return {
      id: rawGoal.id || randomUUID(),
      text,
      completed: index === FREE_SPACE_INDEX
        ? true
        : tallyTarget
          ? tallyProgress >= tallyTarget
          : Boolean(rawGoal.completed),
      tallyTarget,
      tallyProgress: tallyTarget ? tallyProgress : 0
    };
  });
}

function normalizeBoardPayload(body) {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return { error: "Board title is required." };
  }

  const goals = normalizeGoals(body?.goals);
  const completed = goals.filter((goal, index) => index !== FREE_SPACE_INDEX && goal.completed).length;
  const gameType = ALLOWED_GAME_TYPES.has(body?.gameType) ? body.gameType : "five-in-a-row";
  const tileShape = ALLOWED_TILE_SHAPES.has(body?.tileShape) ? body.tileShape : "rounded";
  const boardColor = normalizeHexColor(body?.boardColor);

  return {
    data: {
      title,
      goals,
      total: FIXED_GOAL_COUNT,
      completed,
      game_type: gameType,
      board_color: boardColor,
      shape: tileShape
    }
  };
}

function parseJsonArrayFromModelText(text) {
  const asText = typeof text === "string" ? text : "";
  const cleaned = asText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket < 0 || lastBracket <= firstBracket) {
    return null;
  }

  try {
    return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
  } catch (_error) {
    return null;
  }
}

function parseSuggestionLinesFromModelText(text) {
  const rawText = typeof text === "string" ? text : "";
  return rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .map((line) => line.replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function normalizeSuggestionText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 55);
}

app.post("/api/goals/suggest", requireAuth, async (req, res) => {
  if (!geminiClient) {
    return res.status(503).json({
      error: "Gemini is not configured. Set GEMINI_API_KEY in Backend/.env."
    });
  }

  const theme = typeof req.body?.theme === "string" ? req.body.theme.trim() : "personal growth";
  const tone = typeof req.body?.tone === "string" ? req.body.tone.trim() : "practical";
  const difficulty = typeof req.body?.difficulty === "string" ? req.body.difficulty.trim() : "mixed";
  const countInput = Number.parseInt(req.body?.count, 10);
  const count = Number.isFinite(countInput)
    ? Math.max(1, Math.min(MAX_AI_SUGGESTIONS, countInput))
    : MAX_AI_SUGGESTIONS;

  const existingGoals = Array.isArray(req.body?.existingGoals)
    ? req.body.existingGoals
        .map(normalizeSuggestionText)
        .filter(Boolean)
        .slice(0, MAX_AI_SUGGESTIONS)
    : [];

  const safeTheme = theme.slice(0, 80) || "personal growth";
  const safeTone = tone.slice(0, 40) || "practical";
  const safeDifficulty = difficulty.slice(0, 40) || "mixed";

  const prompt = [
    `Generate ${count} unique bingo goal ideas.`,
    `Theme: ${safeTheme}`,
    `Tone: ${safeTone}`,
    `Difficulty: ${safeDifficulty}`,
    `Goals to avoid repeating: ${JSON.stringify(existingGoals)}`,
    "Rules:",
    "- Return ONLY valid JSON array of strings.",
    "- Each goal must be short (max 55 characters).",
    "- Action-oriented and specific.",
    "- Keep content safe and non-harmful."
  ].join("\n");

  try {
    const model = geminiClient.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const rawText = result?.response?.text ? result.response.text() : "";
    const parsed = parseJsonArrayFromModelText(rawText);
    const candidateItems = Array.isArray(parsed)
      ? parsed
      : parseSuggestionLinesFromModelText(rawText);

    if (!Array.isArray(candidateItems) || candidateItems.length === 0) {
      return res.status(502).json({ error: "Gemini response did not include usable suggestions." });
    }

    const existingSet = new Set(existingGoals.map((goal) => goal.toLowerCase()));
    const seen = new Set();
    const suggestions = [];

    for (const item of candidateItems) {
      const text = normalizeSuggestionText(item);
      const lowered = text.toLowerCase();
      if (!text || existingSet.has(lowered) || seen.has(lowered) || text === FREE_SPACE_TEXT) {
        continue;
      }

      seen.add(lowered);
      suggestions.push(text);
      if (suggestions.length >= count) {
        break;
      }
    }

    return res.json({ suggestions });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Failed to generate AI goal suggestions."
    });
  }
});

app.get("/api/boards", requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "Authenticated user id missing." });
  }

  const { data, error } = await supabase
    .from("boards")
    .select("id, title, total, completed, goals, game_type, board_color, shape, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: `Failed to fetch boards: ${error.message}` });
  }

  return res.json({ boards: data || [] });
});

app.post("/api/boards", requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "Authenticated user id missing." });
  }

  const normalized = normalizeBoardPayload(req.body);
  if (normalized.error) {
    return res.status(400).json({ error: normalized.error });
  }

  const { data, error } = await supabase
    .from("boards")
    .insert({
      user_id: userId,
      ...normalized.data
    })
    .select("id, title, total, completed, goals, game_type, board_color, shape, created_at, updated_at")
    .single();

  if (error) {
    return res.status(500).json({ error: `Failed to create board: ${error.message}` });
  }

  return res.status(201).json({ board: data });
});

app.put("/api/boards/:boardId", requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "Authenticated user id missing." });
  }

  const { boardId } = req.params;
  const normalized = normalizeBoardPayload(req.body);
  if (normalized.error) {
    return res.status(400).json({ error: normalized.error });
  }

  const { data, error } = await supabase
    .from("boards")
    .update(normalized.data)
    .eq("id", boardId)
    .eq("user_id", userId)
    .select("id, title, total, completed, goals, game_type, board_color, shape, created_at, updated_at")
    .single();

  if (error) {
    return res.status(500).json({ error: `Failed to update board: ${error.message}` });
  }

  if (!data) {
    return res.status(404).json({ error: "Board not found." });
  }

  return res.json({ board: data });
});

app.delete("/api/boards/:boardId", requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "Authenticated user id missing." });
  }

  const { boardId } = req.params;
  const { error } = await supabase
    .from("boards")
    .delete()
    .eq("id", boardId)
    .eq("user_id", userId);

  if (error) {
    return res.status(500).json({ error: `Failed to delete board: ${error.message}` });
  }

  return res.json({ success: true });
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
  const { email, username, name, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const usernameCandidate = typeof username === 'string' && username.trim() ? username : name;
  const normalizedUsername = typeof usernameCandidate === 'string' ? usernameCandidate.trim().toLowerCase() : '';
  const hasEmailDomain = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  if (!normalizedEmail || !normalizedUsername || !password)
    return res.status(400).json({ error: 'All fields required' });

  if (!hasEmailDomain)
    return res.status(400).json({ error: 'Please enter a valid email with a domain' });

  const { data: existingEmailUser } = await supabase
    .from('users').select('*').eq('email', normalizedEmail).maybeSingle();

  if (existingEmailUser)
    return res.status(400).json({ error: 'Email already in use' });

  const { data: existingUsernameUser } = await supabase
    .from('users').select('*').ilike('name', normalizedUsername).limit(1).maybeSingle();

  if (existingUsernameUser)
    return res.status(400).json({ error: 'Username already in use' });

  const password_hash = await bcrypt.hash(password, 10);

  const { data: newUser, error } = await supabase
    .from('users')
    .insert({ email: normalizedEmail, name: normalizedUsername, password_hash, provider: 'email' })
    .select().single();

  if (error) return res.status(500).json({ error: 'Signup failed' });

  req.login(newUser, (err) => {
    if (err) return res.status(500).json({ error: 'Login after signup failed' });
    res.json({ success: true, user: newUser });
  });
});

// ─── Email Sign In ────────────────────────────────────────────
app.post('/auth/login', async (req, res) => {
  const { identifier, email, username, password } = req.body;
  const identifierCandidate =
    typeof identifier === 'string' && identifier.trim()
      ? identifier
      : typeof email === 'string' && email.trim()
        ? email
        : username;
  const normalizedIdentifier = typeof identifierCandidate === 'string' ? identifierCandidate.trim() : '';
  if (!normalizedIdentifier || !password) {
    return res.status(400).json({ error: 'Username or email and password are required' });
  }

  const lookupByEmail = normalizedIdentifier.includes("@");
  const usernameCandidateNormalized = normalizedIdentifier.toLowerCase();

  let user = null;
  if (lookupByEmail) {
    const { data: emailUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedIdentifier.toLowerCase())
      .maybeSingle();

    user = emailUser || null;
  } else {
    const { data: usernameUser } = await supabase
      .from('users')
      .select('*')
      .ilike('name', usernameCandidateNormalized)
      .limit(1)
      .maybeSingle();

    user = usernameUser || null;
  }

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