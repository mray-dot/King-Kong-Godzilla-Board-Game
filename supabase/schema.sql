-- King Kong vs Godzilla: Supabase starter schema
-- Run in Supabase SQL Editor. Never expose service_role keys in the browser.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  player_id text unique not null,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.make_player_id()
returns text language sql volatile as $$
  select 'KG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_player_id text;
begin
  loop
    new_player_id := public.make_player_id();
    exit when not exists(select 1 from public.profiles where player_id = new_player_id);
  end loop;
  insert into public.profiles(id, player_id, display_name)
  values(new.id, new_player_id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique(requester, addressee),
  check(requester <> addressee)
);

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_by uuid not null references public.profiles(id),
  status text not null default 'waiting' check(status in ('waiting','active','finished','cancelled')),
  kong_player uuid references public.profiles(id),
  godzilla_player uuid references public.profiles(id),
  turn text not null default 'godzilla' check(turn in ('kong','godzilla')),
  phase text not null default 'placing' check(phase in ('placing','moving','finished')),
  board jsonb not null default '[ "kong", null, null, null, "kong", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "kong", null, null, null, "kong" ]'::jsonb,
  reserve integer not null default 20 check(reserve between 0 and 20),
  captures integer not null default 0 check(captures between 0 and 20),
  winner text check(winner in ('kong','godzilla')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_moves (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id),
  move_number integer not null,
  move jsonb not null,
  created_at timestamptz not null default now(),
  unique(room_id, move_number)
);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.game_rooms enable row level security;
alter table public.game_moves enable row level security;

create policy "profiles readable to authenticated" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "friendship participants can read" on public.friendships for select to authenticated
using (auth.uid() = requester or auth.uid() = addressee);
create policy "users can send friend requests" on public.friendships for insert to authenticated
with check (auth.uid() = requester and requester <> addressee);
create policy "addressee can respond" on public.friendships for update to authenticated
using (auth.uid() = addressee) with check (auth.uid() = addressee);

create policy "room participants can read" on public.game_rooms for select to authenticated
using (auth.uid() = created_by or auth.uid() = kong_player or auth.uid() = godzilla_player);
create policy "authenticated users can create rooms" on public.game_rooms for insert to authenticated
with check (auth.uid() = created_by);
create policy "room participants can read moves" on public.game_moves for select to authenticated
using (exists(select 1 from public.game_rooms r where r.id = room_id and auth.uid() in (r.created_by, r.kong_player, r.godzilla_player)));

-- Join an invite room as the side not already occupied. A production app should add
-- invite expiry and only permit the invited friend / room code holder.
create or replace function public.join_game_room(room_code text)
returns public.game_rooms language plpgsql security definer set search_path = public as $$
declare r public.game_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into r from public.game_rooms where code = upper(room_code) for update;
  if not found then raise exception 'Room not found'; end if;
  if r.status <> 'waiting' and auth.uid() not in (r.kong_player, r.godzilla_player) then raise exception 'Room is not waiting'; end if;
  if auth.uid() = r.created_by then return r; end if;
  if r.kong_player is null and r.godzilla_player is distinct from auth.uid() then
    update public.game_rooms set kong_player = auth.uid(), status = 'active', updated_at = now() where id = r.id returning * into r;
  elsif r.godzilla_player is null and r.kong_player is distinct from auth.uid() then
    update public.game_rooms set godzilla_player = auth.uid(), status = 'active', updated_at = now() where id = r.id returning * into r;
  elsif auth.uid() not in (r.kong_player, r.godzilla_player) then
    raise exception 'Room is full';
  end if;
  return r;
end;
$$;

-- IMPORTANT: This RPC is a transactional starting point. For full production
-- authority, port the exact graph adjacency validation from src/game/rules.ts
-- into this function before opening public matchmaking. It validates participant,
-- turn, placement occupancy, and captures, but does not yet fully validate every
-- graph edge. Do not bypass it with direct client writes.
create or replace function public.make_move(room_id uuid, move_data jsonb)
returns public.game_rooms language plpgsql security definer set search_path = public as $$
declare r public.game_rooms; moving_side text; from_idx integer; to_idx integer; cap_idx integer;
  board_arr jsonb; reserve_left integer; captures_count integer; next_turn text; next_phase text;
begin
  select * into r from public.game_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if auth.uid() not in (r.kong_player, r.godzilla_player) then raise exception 'Not a participant'; end if;
  moving_side := case when auth.uid() = r.kong_player then 'kong' else 'godzilla' end;
  if moving_side <> r.turn then raise exception 'Not your turn'; end if;
  if r.status <> 'active' then raise exception 'Room is not active'; end if;
  to_idx := (move_data->>'to')::integer;
  from_idx := nullif(move_data->>'from','')::integer;
  cap_idx := nullif(move_data->>'capture','')::integer;
  if to_idx < 0 or to_idx > 24 then raise exception 'Invalid destination'; end if;
  board_arr := r.board;
  if board_arr->to_idx <> 'null'::jsonb then raise exception 'Destination occupied'; end if;
  reserve_left := r.reserve; captures_count := r.captures;
  if moving_side = 'godzilla' and r.phase = 'placing' then
    if reserve_left <= 0 or from_idx is not null then raise exception 'Invalid placement'; end if;
    board_arr := jsonb_set(board_arr, array[to_idx::text], '"godzilla"'::jsonb);
    reserve_left := reserve_left - 1;
  else
    if from_idx is null or from_idx < 0 or from_idx > 24 then raise exception 'Invalid source'; end if;
    if board_arr->from_idx <> to_jsonb(moving_side) then raise exception 'Source does not contain your piece'; end if;
    -- NOTE: Validate movement graph adjacency / straight capture in this RPC before production.
    board_arr := jsonb_set(board_arr, array[from_idx::text], 'null'::jsonb);
    board_arr := jsonb_set(board_arr, array[to_idx::text], to_jsonb(moving_side));
    if cap_idx is not null then
      if moving_side <> 'kong' or board_arr->cap_idx <> '"godzilla"'::jsonb then raise exception 'Invalid capture'; end if;
      board_arr := jsonb_set(board_arr, array[cap_idx::text], 'null'::jsonb);
      captures_count := captures_count + 1;
    end if;
  end if;
  next_turn := case when r.turn = 'kong' then 'godzilla' else 'kong' end;
  next_phase := case when reserve_left = 0 then 'moving' else r.phase end;
  update public.game_rooms set board = board_arr, reserve = reserve_left, captures = captures_count,
    turn = next_turn, phase = case when captures_count >= 5 then 'finished' else next_phase end,
    winner = case when captures_count >= 5 then 'kong' else null end, updated_at = now()
  where id = room_id returning * into r;
  insert into public.game_moves(room_id, player_id, move_number, move)
  values(room_id, auth.uid(), coalesce((select max(move_number)+1 from public.game_moves where game_moves.room_id = make_move.room_id),1), move_data);
  return r;
end;
$$;

grant execute on function public.join_game_room(text) to authenticated;
grant execute on function public.make_move(uuid, jsonb) to authenticated;

-- Enable realtime room updates in the Supabase dashboard if not already enabled.
do $$ begin
  alter publication supabase_realtime add table public.game_rooms;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
