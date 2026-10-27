import { useEffect, useMemo, useState } from "react";
import { LogIn, LogOut, Users, Copy, RotateCcw, Zap, Shield, Swords, Link2, CircleHelp } from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { applyMove, allLegalForTurn, coords, EDGES, initialGame, labelPoint, type GameState, type Point, type Side } from "./game/rules";

type UserInfo = { id: string; email?: string; playerId?: string };
const getRoomCode = () => new URLSearchParams(window.location.search).get("room");
const playerIdFromUuid = (id: string) => `KG-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;

export default function App() {
  const [game, setGame] = useState<GameState>(() => initialGame());
  const [hasStarted, setHasStarted] = useState(false);
  const [selected, setSelected] = useState<Point | null>(null);
  const [notice, setNotice] = useState("");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [roomCode] = useState(() => getRoomCode() ?? Math.random().toString(36).slice(2, 8).toUpperCase());
  const [opponentId, setOpponentId] = useState("");
  const [sideChoice, setSideChoice] = useState<Side | "">("");
  const [playerOneFaction, setPlayerOneFaction] = useState<Side>("kong");
  const [factionsLocked, setFactionsLocked] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUser({ id: data.session.user.id, email: data.session.user.email, playerId: playerIdFromUuid(data.session.user.id) });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email, playerId: playerIdFromUuid(session.user.id) } : null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const moves = useMemo(() => allLegalForTurn(game), [game]);
  const selectedMoves = useMemo(() => selected === null ? [] : moves.filter(m => m.from === selected), [moves, selected]);
  const targetSet = new Set(selectedMoves.map(m => m.to));
  const currentSideName = game.turn === "kong" ? "King Kong" : "Godzilla";
  const currentEmoji = game.turn === "kong" ? "🦍" : "🦖";

  async function authenticate() {
    if (!supabase) { setNotice("Add your Supabase URL and anon key to .env to enable real accounts."); return; }
    setAuthBusy(true); setNotice("");
    try {
      const result = authMode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (result.data.user) setUser({ id: result.data.user.id, email: result.data.user.email, playerId: playerIdFromUuid(result.data.user.id) });
      setNotice(authMode === "signup" ? "Account created. Check your email if confirmation is enabled." : "Welcome back.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Authentication failed."); }
    finally { setAuthBusy(false); }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
  }

  function clickPoint(p: Point) {
    if (game.phase === "finished") return;
    if (game.phase === "placing" && game.turn === "godzilla") {
      if (game.board[p] !== null) { setNotice("Choose an empty intersection."); return; }
      try {
        // Apply against the current snapshot before calling setState. Throwing
        // inside a React state updater bypasses this try/catch and can blank the app.
        const nextGame = applyMove(game, { to: p });
        setGame(nextGame);
        setSelected(null);
        setNotice("");
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "That placement is not legal.");
      }
      return;
    }
    if (selected !== null) {
      const candidate = selectedMoves.find(m => m.to === p);
      if (candidate) {
        try {
          const nextGame = applyMove(game, candidate);
          setGame(nextGame);
          setSelected(null);
          setNotice("");
        } catch (e) { setNotice(e instanceof Error ? e.message : "Illegal move."); }
        return;
      }
    }
    if (game.board[p] === game.turn) setSelected(p);
    else setNotice("Select one of your pieces, then choose a highlighted destination.");
  }

  function resetGame() { setGame(initialGame()); setSelected(null); setFactionsLocked(false); setHasStarted(false); setNotice("Ready for a new match. Press Start Battle when you are ready."); }
  async function copyInvite() {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    try { await navigator.clipboard.writeText(url); setNotice("Invite URL copied. Share it with your opponent."); }
    catch { setNotice(`Share this invite URL: ${url}`); }
  }

  const edgeLines = EDGES.map(([a,b]) => {
    const aa = coords(a), bb = coords(b);
    return { x1: 42 + aa.col * 79, y1: 42 + aa.row * 79, x2: 42 + bb.col * 79, y2: 42 + bb.row * 79 };
  });

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark">K<span>×</span>G</span><span><strong>KONG</strong><small>VS GODZILLA</small></span></a>
      <div className="top-actions">
        <span className={`connection ${isSupabaseConfigured ? "online" : ""}`}><i />{isSupabaseConfigured ? "SUPABASE READY" : "LOCAL DEMO"}</span>
        {user ? <button className="icon-button" onClick={signOut} title="Sign out"><LogOut size={17}/></button> : <a className="login-link" href="#account"><LogIn size={16}/> Sign in</a>}
      </div>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span/> A LEGENDARY STRATEGY SHOWDOWN</div>
        <h1>ONE BOARD.<br/><em>TWO TITANS.</em></h1>
        <p>Hunt with instinct. Defend with strategy. Every move changes the fate of the board.</p>
        <div className="hero-tags"><span><Swords size={14}/> 2 PLAYERS</span><span><Zap size={14}/> TACTICAL COMBAT</span><span><Shield size={14}/> CLASSIC RULES</span></div>
      </div>
      <div className="monster-art" aria-label="Cinematic King Kong and Godzilla battle artwork">
        <img className="hero-art-image" src={`${import.meta.env.BASE_URL}monster-duel.png`} alt="King Kong leaping above Godzilla on a glowing strategy grid" onError={e => { e.currentTarget.style.display = "none"; }} />
        <div className="hero-art-vignette"/><div className="art-caption">THE HUNTER <b>×</b> THE DEFENDER</div>
      </div>
    </section>

    <section className="faction-select-panel">
      <div className="faction-select-heading">
        <span className="section-kicker">CHOOSE YOUR TITAN</span>
        <h2>Assign both players</h2>
        <p>For local hot-seat play, choose which faction each player controls. One player commands Kong; the other commands Godzilla.</p>
      </div>
      <div className="faction-select-grid">
        <article className="faction-choice-card kong-choice">
          <div className="faction-portrait kong-portrait" aria-hidden="true">🦍</div>
          <div className="faction-choice-copy"><span>PLAYER ONE</span><h3>King Kong</h3><p>Mobile hunter · Leap captures</p></div>
          <button type="button" className={playerOneFaction === "kong" ? "faction-pick active" : "faction-pick"} onClick={() => { setPlayerOneFaction("kong"); setFactionsLocked(false); }}>Choose Kong</button>
        </article>
        <article className="faction-choice-card godzilla-choice">
          <div className="faction-portrait godzilla-portrait" aria-hidden="true">🦖</div>
          <div className="faction-choice-copy"><span>PLAYER TWO</span><h3>Godzilla</h3><p>Deploy the pack · Outlast the hunter</p></div>
          <button type="button" className={playerOneFaction === "godzilla" ? "faction-pick active" : "faction-pick"} onClick={() => { setPlayerOneFaction("godzilla"); setFactionsLocked(false); }}>Choose Godzilla</button>
        </article>
      </div>
      <div className="faction-assign-footer">
        <span className="assignment-summary">Player 1: <b>{playerOneFaction === "kong" ? "King Kong" : "Godzilla"}</b> <span>·</span> Player 2: <b>{playerOneFaction === "kong" ? "Godzilla" : "King Kong"}</b></span>
        <button type="button" className="primary-button" onClick={() => { setFactionsLocked(true); setNotice("Factions confirmed. Local hot-seat match is ready."); }}>Confirm factions</button>
      </div>
      {factionsLocked && <p className="faction-confirmed" role="status">✓ Factions confirmed for this local match. Pass the device after each turn.</p>}
    </section>

    {!hasStarted && <section className="start-battle-panel">
      <div className="start-battle-copy">
        <span className="section-kicker">READY WHEN YOU ARE</span>
        <h2>Enter the battlefield</h2>
        <p>Start the match to reveal the board. King Kong begins on all four corners; Godzilla deploys first.</p>
      </div>
      <button type="button" className="start-battle-button" onClick={() => { setGame(initialGame()); setSelected(null); setHasStarted(true); setNotice("Battle started. Godzilla places the first piece; King Kong starts at all four corners."); }}><Swords size={19}/> Start Battle</button>
    </section>}

    {hasStarted && <section className="game-layout">
      <div className="board-panel">
        <div className="panel-heading"><div><span className="section-kicker">THE BATTLEFIELD</span><h2>Ancient Grid</h2></div><span className="room-pill">ROOM {roomCode}</span></div>
        <div className={`board-frame ${game.lastMove?.capture !== undefined ? "capture-impact" : game.lastMove ? "move-impact" : ""}`} key={`${game.captures}-${game.lastMove?.to ?? "start"}`}>
          <svg className="board" viewBox="0 0 400 400" role="img" aria-label="5 by 5 game board">
            <defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
            <rect x="5" y="5" width="390" height="390" rx="14" className="board-bg"/>
            {edgeLines.map((l,i)=><line key={i} {...l} className="board-line"/>)}
            {game.board.map((piece,p) => {
              const {row,col}=coords(p), x=42+col*79, y=42+row*79;
              const isSelected = selected===p, isTarget=targetSet.has(p), isLast=game.lastMove?.to===p || game.lastMove?.from===p;
              return <g key={p} onClick={()=>clickPoint(p)} className="point-group" role="button" tabIndex={0} aria-label={`${labelPoint(p)} ${piece ?? "empty"}`} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")clickPoint(p)}}>
                <circle cx={x} cy={y} r="21" className={`point-hit ${isTarget?"target":""} ${isSelected?"selected":""} ${isLast?"last":""}`}/>
                {piece ? <g filter={isSelected?"url(#glow)":undefined}>
                  <circle cx={x} cy={y} r="16" className={`piece ${piece}`}/>
                  <text x={x} y={y+6} textAnchor="middle" className={`piece-emoji ${isLast ? `moving-${piece}` : ""}`}>{piece==="kong"?"🦍":"🦖"}</text>
                </g> : <circle cx={x} cy={y} r={isTarget?7:4} className={`node ${isTarget?"node-target":""}`}/>}
              </g>;
            })}
          </svg>
        </div>
        <div className="board-footer"><span><i className="legend-dot kong-dot"/> King Kong <b>× {game.board.filter(p=>p==="kong").length}</b></span><span><i className="legend-dot godzilla-dot"/> Godzilla <b>× {game.board.filter(p=>p==="godzilla").length}</b></span></div>
      </div>

      <aside className="side-panel">
        <div className="turn-card">
          <div className="turn-top"><span className="section-kicker">CURRENT TURN</span><span className="turn-pulse"/></div>
          <div className="turn-identity"><span className={`avatar ${game.turn}`}>{currentEmoji}</span><div><h3>{game.phase==="finished"?"Match complete":currentSideName}</h3><p>{game.phase==="placing" ? "Deployment phase" : game.phase==="moving" ? "Movement phase" : "Final result"}</p></div></div>
          <p className="turn-message">{game.message}</p>
          {game.winner && <div className="winner-banner">🏆 {game.winner==="kong"?"KING KONG WINS":"GODZILLA WINS"}</div>}
        </div>
        <div className="stats-grid">
          <div className="stat-card"><span>CAPTURES</span><strong>{game.captures}<small> / 5</small></strong><div className="progress"><i style={{width:`${Math.min(100,game.captures/5*100)}%`}}/></div></div>
          <div className="stat-card"><span>IN RESERVE</span><strong>{game.reserve}<small> / 20</small></strong><div className="progress blue"><i style={{width:`${game.reserve/20*100}%`}}/></div></div>
        </div>
        <div className="phase-card"><span className="section-kicker">MATCH PHASES</span><div className={`phase-row ${game.phase==="placing"?"active":""} ${game.phase!=="placing"?"done":""}`}><span>01</span><div><b>Deploy Godzillas</b><small>Place all 20 pieces</small></div>{game.phase!=="placing"&&<span className="phase-check">✓</span>}</div><div className={`phase-row ${game.phase==="moving"?"active":""}`}><span>02</span><div><b>Move & survive</b><small>Outmaneuver the hunter</small></div></div></div>
        <div className="controls-card">
          <span className="section-kicker">MATCH CONTROLS</span>
          <button className="primary-button" onClick={resetGame}><RotateCcw size={16}/> New local match</button>
          <button className="secondary-button" onClick={copyInvite}><Link2 size={16}/> Copy invite link</button>
          <p className="small-note"><CircleHelp size={14}/> Cinematic effects are active in local play. Room links are shareable, but synchronized online matches still need the multiplayer backend.</p>
        </div>
      </aside>
    </section>}

    <section className="lower-grid">
      <div className="info-card">
        <div className="info-icon"><Swords size={19}/></div><div><h3>How to play</h3><p>Godzilla places first. King Kong moves one step or leaps over one Godzilla into an empty point to capture it. Once all 20 are deployed, Godzillas may move one connected step.</p></div>
      </div>
      <div className="info-card account-card" id="account">
        <div className="info-icon"><Users size={19}/></div><div className="account-content"><h3>Player account</h3>
          {user ? <><p className="account-email">{user.email}</p><div className="player-id"><span>{user.playerId}</span><button onClick={()=>navigator.clipboard?.writeText(user.playerId ?? "")} title="Copy player ID"><Copy size={14}/></button></div><p className="small-note">Permanent ID derived from your authenticated account UUID.</p></> :
          <><p>Sign in to claim your player identity and connect with friends.</p>
            <div className="auth-tabs"><button className={authMode==="login"?"active":""} onClick={()=>setAuthMode("login")}>Sign in</button><button className={authMode==="signup"?"active":""} onClick={()=>setAuthMode("signup")}>Create account</button></div>
            <form onSubmit={e=>{e.preventDefault();void authenticate();}} className="auth-form">
              <input type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)} required/>
              <input type="password" placeholder="Password (min. 6 characters)" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required/>
              <button className="primary-button" disabled={authBusy}>{authBusy?"Please wait…":authMode==="login"?"Sign in":"Create account"}</button>
            </form>
          </>}
        </div>
      </div>
      <div className="info-card friends-card">
        <div className="info-icon"><Users size={19}/></div><div><h3>Find your rival</h3><p>Friend requests are planned for online play. Share your permanent player ID when the multiplayer backend is connected.</p><form className="friend-form" onSubmit={e=>{e.preventDefault();setNotice(isSupabaseConfigured?"Friend request UI is scaffolded; connect the friend-request RPC to enable sending.":"Configure Supabase to enable friend requests.");}}><input value={opponentId} onChange={e=>setOpponentId(e.target.value.toUpperCase())} placeholder="KG-XXXXXXXX"/><button type="submit" aria-label="Find friend"><Users size={15}/></button></form></div>
      </div>
    </section>
    {notice && <div className="toast" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    <footer><span>© 2026 KONG × GODZILLA</span><span>STRATEGY IS THE ULTIMATE WEAPON</span></footer>
  </main>;
}
