# RvC Wager Hub

Private wager pool site for Rousey vs Carano — May 16, 2026.
Built with React + TypeScript + Vite + Supabase.

## Quick Start

### 1. Install dependencies
npm install

### 2. Set up environment variables
cp .env.example .env
Open .env and fill in your Supabase URL and anon key from:
Supabase Dashboard → Project Settings → API

### 3. Run the SQL schema
Paste SUPABASE_SCHEMA.sql into Supabase SQL Editor and run it.

### 4. Create your admin account
- Supabase Dashboard → Authentication → Users → Invite user
- Enter goldeneric0807@gmail.com, accept the invite, set your password
- Then run: UPDATE public.profiles SET role = 'admin' WHERE email = 'goldeneric0807@gmail.com';

### 5. Start dev server
npm run dev
Open http://localhost:5173

## Supabase Auth Settings
- DISABLE public email signups (invite-only)
- Set Site URL: http://localhost:5173
- Add Redirect URL: http://localhost:5173/auth/callback

## Project Structure
src/components/  - Nav, Toast, ProtectedRoute, FighterSVG
src/context/     - AuthContext (Supabase auth + profile)
src/lib/         - Supabase client
src/pages/       - Landing, Login, RequestAccess, Dashboard, Admin, AuthCallback
src/types/       - TypeScript database types

## Deploy
npm run build → deploy dist/ to Netlify or Vercel
Add env vars in platform settings.
