# Deploy King Kong vs Godzilla to Netlify

This folder is configured for Netlify's Vite build. The Netlify build command is `npm run build`, and the published folder is `dist`.

## Before deploying

1. Install Node.js 20 or newer.
2. Run `npm install` and then `npm run build` locally. Fix any build errors before publishing.
3. For a local-only test, no Supabase variables are required; the game supports local demo mode.
4. For Supabase authentication, open Netlify → your site → **Site configuration** → **Environment variables** and add:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon/public key
   Never put a Supabase service-role key in a browser app.

## Option A — deploy from GitHub (recommended)

1. Push this project folder to a GitHub repository.
2. Sign in at https://app.netlify.com and choose **Add new site** → **Import an existing project**.
3. Select the repository and use these settings (also configured in `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node version: `20`
4. Add the two Supabase environment variables above if you want authentication.
5. Click **Deploy**. If environment variables are added later, trigger a new deploy.

## Option B — deploy by uploading the build output

1. On your computer, open a terminal in this project folder.
2. Run `npm install`.
3. Run `npm run build`.
4. In Netlify, open **Add new site** → **Deploy manually** and upload the generated `dist` folder. (For ongoing updates and environment-variable-driven builds, GitHub deployment is easier.)

## Supabase settings for the deployed site

After Netlify provides your site URL, open Supabase → **Authentication** → **URL Configuration**. Set the Site URL to your Netlify URL and add the Netlify URL to the allowed Redirect URLs. Include your custom domain too if you connect one.

## Important scope note

This package preserves the existing game. The board rules and local hot-seat demo can be tested without Supabase. The existing README says the separate-player online room/friend/realtime UI is not yet fully wired end-to-end, so a successful Netlify deployment does not by itself mean online multiplayer is production-ready. Test authentication, room creation, invites, and moves with two separate browsers before announcing multiplayer support.
