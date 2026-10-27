# King Kong vs Godzilla

A cinematic, two-player web adaptation of the traditional Tiger-and-Goat strategy game. Built with React, TypeScript, Supabase, and Vercel.

## Included

- Responsive 5×5 intersection board with orthogonal and specified diagonal paths.
- Four King Kong pieces on the corners; 20 Godzillas begin in reserve.
- Start screen with a Start Battle button; the board appears only after starting, with King Kong on all four corners.
- Godzilla placement phase, then movement phase.
- Fix for deployment validation: Godzilla placements are now included in legal move validation.
- Safe move handling: invalid moves show a notice instead of throwing inside a React state updater.
- Hero artwork uses Vite base-path-aware asset URLs and gracefully hides if the image is unavailable.
- King Kong step movement and single-goat leap capture.
- Turn validation, selection hints, capture count, and victory checks.
- Supabase email/password authentication and permanent player ID profile creation.
- SQL schema for profiles, friends, game rooms, server-validated moves, and realtime room updates.
- Shareable invite links / room codes.
- Local demo mode so the board can be tested before configuring Supabase.

## 1. Run locally

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
npm run dev
```

Without Supabase environment variables, the app opens in **local demo mode**. Two people can test the rules on one device by taking turns. Demo accounts and online matchmaking are not persisted.

## 2. Configure Supabase

1. Create a project at https://supabase.com.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Copy the Project URL and anon/public key into `.env` (never put a service-role key in the browser).
4. Restart `npm run dev`.
5. In Supabase Authentication settings, enable Email provider. For initial testing you may disable email confirmations; enable them for production.
6. Configure the site's Site URL and redirect URLs to include your local dev URL and production Vercel URL.

The SQL creates profiles with permanent player IDs, friendship requests, rooms, room membership, moves, realtime publication, row-level security, and a server-side `make_move` RPC. The client UI in this starter provides authentication and a local board; complete online room creation / friend workflows are represented in the schema and are the next integration layer, not falsely simulated as live multiplayer.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Import the repository into https://vercel.com.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel Project Settings → Environment Variables.
4. Deploy. Re-deploy after changing environment variables.
5. Add the production domain to Supabase Auth redirect URLs.

## Rules implemented

- Godzilla places one reserve piece on any empty intersection, then Kong takes a turn.
- Kong moves one connected step to an empty point or leaps over one adjacent Godzilla to an empty point immediately beyond it.
- Captures remove one Godzilla. Multi-jumps are not allowed.
- Godzillas cannot move until the reserve is empty; then they move one connected step.
- Godzilla wins if no Kong has any legal move. Kong wins after five captures (standard Bagh-Chal threshold; adjust `CAPTURES_TO_WIN` in `src/game/rules.ts` if desired).
- A player cannot pass while a legal move exists.
- The current starter uses a precise graph: horizontal and vertical neighbors, the two corner-to-corner diagonals, and diagonals that form a diamond between the four edge midpoints and the center. Every move follows an actual edge on that graph.

## Important production hardening

Before a public launch, add rate limits / abuse monitoring, email verification, password reset UI, invite expiry, reconnect handling, and automated rule tests. The SQL RPC validates turn ownership and movement on the server; for strict server-authoritative production, port the TypeScript graph rules into the RPC and make the client call only that RPC for all moves.


## Cinematic stability and faction setup update

This update adds an explicit local hot-seat faction assignment panel for Player 1 and Player 2, defensive error handling around Godzilla placement, and responsive styling for the faction cards. The faction picker currently configures the local match UI; it does not yet authenticate faction ownership for separate online players. The Supabase realtime room and server-side move validation still need to be implemented before public multiplayer deployment.
