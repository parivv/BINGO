# Bingo Battles

Create personalized Bingo boards with your unique goals and challenges.
See how you stack up against friends and climb to the top.
Join groups, share your boards, and motivate each other to reach goals together.

#Website:
https://parivv.github.io/BINGO


## How to run locally

1. Install dependencies.

```bash
npm run install:all
```

2. Create `Backend/.env` with the required values.

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SESSION_SECRET=any_long_random_string
FRONTEND_ORIGIN=http://localhost:3000
FRONTEND_REDIRECT=http://localhost:3000/dashboard

# Optional for Google OAuth:
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback
PORT=8000
```

Optional: if your frontend should call a different backend URL, create `Frontend/.env`:

```env
VITE_BACKEND_ORIGIN=http://localhost:8000
```

3. Start the backend.

```bash
npm run backend
```

4. In a new terminal, start the frontend.

```bash
npm run start
```

5. Open the website in your browser.

```text
http://localhost:3000
```