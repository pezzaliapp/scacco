/* ═══════════════ Scacco — app.js ═══════════════
   Modalità: locale (2 giocatori), IA (3 livelli), online (PeerJS)
   Motore regole: chess.js · IA: minimax + alfa-beta + tabelle posizionali */

"use strict";

/* ───────── stato ───────── */
const S = {
  mode: null,            // 'local' | 'ai' | 'online'
  game: null,            // istanza Chess
  myColor: 'w',          // colore del giocatore locale (ai/online)
  aiLevel: 1,
  flipped: false,
  selected: null,
  legalTargets: [],
  thinking: false,
  over: false,
  // online
  peer: null, conn: null, isHost: false, roomCode: null,
};

const FILES = ['a','b','c','d','e','f','g','h'];
const $ = id => document.getElementById(id);
const PIECE_NAME = {p:'pedone', n:'cavallo', b:'alfiere', r:'torre', q:'donna', k:'re'};

/* ───────── navigazione schermate ───────── */
function show(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}
document.querySelectorAll('[data-go]').forEach(b =>
  b.addEventListener('click', () => {
    const dest = b.dataset.go;
    if (dest === 'local') startLocal();
    else show(dest);
  })
);

/* ───────── toast ───────── */
let toastT;
function toast(msg, ms = 2400){
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => t.hidden = true, ms);
}

/* ───────── suoni (WebAudio, nessun file) ───────── */
let AC;
function beep(freq, dur = .08, type = 'sine', gain = .12){
  try{
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, AC.currentTime + dur);
    o.connect(g).connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  }catch(e){}
}
const sndMove    = () => beep(420, .06, 'triangle');
const sndCapture = () => { beep(300,.07,'square',.1); setTimeout(()=>beep(220,.08,'square',.08),40); };
const sndCheck   = () => beep(660,.14,'sawtooth',.08);
const sndEnd     = () => { beep(523,.12); setTimeout(()=>beep(659,.12),130); setTimeout(()=>beep(784,.2),260); };

/* ───────── scacchiera: costruzione ───────── */
function buildSquares(){
  const wrap = $('squares');
  wrap.innerHTML = '';
  for (let r = 0; r < 8; r++){
    for (let f = 0; f < 8; f++){
      const sq = document.createElement('div');
      const file = S.flipped ? 7 - f : f;
      const rank = S.flipped ? r + 1 : 8 - r;
      sq.className = 'sq ' + (((file + rank) % 2) ? 'l' : 'd');
      sq.dataset.sq = FILES[file] + rank;
      sq.addEventListener('pointerdown', onSquareTap);
      wrap.appendChild(sq);
    }
  }
  $('coord-files').innerHTML = (S.flipped ? [...FILES].reverse() : FILES).map(f=>`<span>${f}</span>`).join('');
  const ranks = S.flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
  $('coord-ranks').innerHTML = ranks.map(r=>`<span>${r}</span>`).join('');
}

function sqPos(square){
  let f = FILES.indexOf(square[0]);
  let r = parseInt(square[1]);
  let x = S.flipped ? 7 - f : f;
  let y = S.flipped ? r - 1 : 8 - r;
  return {x: x * 100, y: y * 100};
}

/* pezzi: un elemento per casella occupata, animati via transform */
const pieceEls = new Map(); // square -> element
function pieceSVG(type, color){
  return `<svg viewBox="0 0 45 45"><use href="#pc-${type}-${color}"/></svg>`;
}
function placePiece(square, type, color, born = false){
  const el = document.createElement('div');
  el.className = 'piece' + (born ? ' born' : '');
  el.dataset.t = type; el.dataset.c = color;
  el.innerHTML = pieceSVG(type, color);
  const p = sqPos(square);
  el.style.transform = `translate(${p.x}%, ${p.y}%)`;
  $('pieces').appendChild(el);
  pieceEls.set(square, el);
}
function syncBoard(animateFrom = null){
  // ricostruzione completa (usata a inizio partita, undo, flip)
  $('pieces').innerHTML = '';
  pieceEls.clear();
  S.game.board().forEach((row, ri) => row.forEach((pc, fi) => {
    if (pc) placePiece(FILES[fi] + (8 - ri), pc.type, pc.color);
  }));
}
function animateMove(move){
  const from = move.from, to = move.to;
  // cattura (anche en passant)
  let capSq = to;
  if (move.flags.includes('e')) capSq = to[0] + from[1];
  const capEl = pieceEls.get(capSq);
  if (capEl && capEl !== pieceEls.get(from)){
    capEl.classList.add('fade');
    setTimeout(() => capEl.remove(), 180);
    pieceEls.delete(capSq);
  }
  const el = pieceEls.get(from);
  if (el){
    pieceEls.delete(from);
    pieceEls.set(to, el);
    const p = sqPos(to);
    el.style.transform = `translate(${p.x}%, ${p.y}%)`;
    if (move.promotion){
      setTimeout(() => { el.innerHTML = pieceSVG(move.promotion, move.color); el.classList.add('born'); }, 200);
      el.dataset.t = move.promotion;
    }
  }
  // arrocco: muovi anche la torre
  if (move.flags.includes('k') || move.flags.includes('q')){
    const rank = from[1];
    const rFrom = (move.flags.includes('k') ? 'h' : 'a') + rank;
    const rTo   = (move.flags.includes('k') ? 'f' : 'd') + rank;
    const rEl = pieceEls.get(rFrom);
    if (rEl){
      pieceEls.delete(rFrom); pieceEls.set(rTo, rEl);
      const p = sqPos(rTo);
      rEl.style.transform = `translate(${p.x}%, ${p.y}%)`;
    }
  }
}

/* ───────── evidenziazioni ───────── */
function clearMarks(cls){
  document.querySelectorAll('.sq.' + cls).forEach(s => s.classList.remove(cls));
}
function mark(square, cls){
  const el = document.querySelector(`.sq[data-sq="${square}"]`);
  if (el) el.classList.add(cls);
}
function showTargets(list){
  document.querySelectorAll('.sq .dot, .sq .ring').forEach(e => e.remove());
  list.forEach(m => {
    const el = document.querySelector(`.sq[data-sq="${m.to}"]`);
    if (!el) return;
    const d = document.createElement('div');
    d.className = m.flags.includes('c') || m.flags.includes('e') ? 'ring' : 'dot';
    el.appendChild(d);
  });
}
function refreshChecks(){
  clearMarks('chk');
  if (S.game.in_check()){
    const turn = S.game.turn();
    S.game.board().forEach((row, ri) => row.forEach((pc, fi) => {
      if (pc && pc.type === 'k' && pc.color === turn) mark(FILES[fi] + (8 - ri), 'chk');
    }));
  }
}

/* ───────── interazione ───────── */
function myTurn(){
  if (S.over || S.thinking) return false;
  if (S.mode === 'local') return true;
  return S.game.turn() === S.myColor;
}
function onSquareTap(ev){
  if (!myTurn()) return;
  const square = ev.currentTarget.dataset.sq;
  const pc = S.game.get(square);

  if (S.selected){
    const mv = S.legalTargets.find(m => m.to === square);
    if (mv){
      if (mv.promotion){ askPromotion(mv); }
      else doMove({from: mv.from, to: mv.to});
      deselect();
      return;
    }
  }
  if (pc && pc.color === S.game.turn()){
    select(square);
  } else deselect();
}
function select(square){
  deselect();
  S.selected = square;
  S.legalTargets = S.game.moves({square, verbose: true});
  mark(square, 'sel');
  showTargets(S.legalTargets);
  const el = pieceEls.get(square);
  if (el) el.classList.add('lift');
}
function deselect(){
  if (S.selected){
    const el = pieceEls.get(S.selected);
    if (el) el.classList.remove('lift');
  }
  S.selected = null; S.legalTargets = [];
  clearMarks('sel');
  document.querySelectorAll('.sq .dot, .sq .ring').forEach(e => e.remove());
}

/* promozione */
function askPromotion(mv){
  const row = $('promo-row');
  row.innerHTML = '';
  ['q','r','b','n'].forEach(t => {
    const b = document.createElement('button');
    b.innerHTML = pieceSVG(t, S.game.turn());
    b.onclick = () => {
      $('promo-overlay').hidden = true;
      doMove({from: mv.from, to: mv.to, promotion: t});
    };
    row.appendChild(b);
  });
  $('promo-overlay').hidden = false;
}

/* ───────── esecuzione mossa ───────── */
function doMove(m, remote = false){
  const move = S.game.move(m);
  if (!move) return;
  animateMove(move);
  clearMarks('last');
  mark(move.from, 'last'); mark(move.to, 'last');
  refreshChecks();
  updateTrays(); updateMovesList(); updateStatus();

  if (S.game.in_check() && !S.game.game_over()) sndCheck();
  else if (move.flags.includes('c') || move.flags.includes('e')) sndCapture();
  else sndMove();

  if (S.mode === 'online' && !remote && S.conn){
    S.conn.send({t:'move', from: move.from, to: move.to, promotion: move.promotion});
  }
  if (S.game.game_over()) return endGame();

  if (S.mode === 'ai' && S.game.turn() !== S.myColor){
    S.thinking = true;
    updateStatus();
    setTimeout(aiTurn, 320);
  }
}

/* ───────── fine partita ───────── */
function endGame(){
  S.over = true; S.thinking = false;
  sndEnd();
  let title = 'Patta', sub = '';
  if (S.game.in_checkmate()){
    const winner = S.game.turn() === 'w' ? 'Il Nero' : 'Il Bianco';
    title = 'Scacco matto';
    if (S.mode === 'local') sub = `${winner} vince la partita.`;
    else {
      const iWon = S.game.turn() !== S.myColor;
      title = iWon ? 'Vittoria!' : 'Scacco matto';
      sub = iWon ? 'Hai dato scacco matto. Complimenti.' : 'Il tuo re è caduto. Alla prossima.';
    }
  }
  else if (S.game.in_stalemate()) sub = 'Stallo: nessuna mossa legale.';
  else if (S.game.in_threefold_repetition()) sub = 'Triplice ripetizione di posizione.';
  else if (S.game.insufficient_material()) sub = 'Materiale insufficiente per il matto.';
  else sub = 'Regola delle cinquanta mosse.';
  $('end-title').textContent = title;
  $('end-sub').textContent = sub;
  setTimeout(() => $('end-overlay').hidden = false, 600);
}
function resignedOrLeft(msg){
  S.over = true;
  $('end-title').textContent = 'Partita conclusa';
  $('end-sub').textContent = msg;
  $('end-overlay').hidden = false;
}

/* ───────── pannelli informativi ───────── */
const VAL = {p:1, n:3, b:3, r:5, q:9};
function updateTrays(){
  const capByWhite = [], capByBlack = [];
  S.game.history({verbose:true}).forEach(m => {
    if (m.captured) (m.color === 'w' ? capByWhite : capByBlack).push(m.captured);
  });
  const order = c => c.sort((a,b) => VAL[a]-VAL[b]);
  const render = (list, color) => order(list).map(t => pieceSVG(t, color)).join('');
  const diff = capByWhite.reduce((s,t)=>s+VAL[t],0) - capByBlack.reduce((s,t)=>s+VAL[t],0);

  const meIsWhite = (S.mode === 'local') ? true : S.myColor === 'w';
  const myCaps  = meIsWhite ? capByWhite : capByBlack;
  const oppCaps = meIsWhite ? capByBlack : capByWhite;
  const myDiff  = meIsWhite ? diff : -diff;
  $('cap-by-me').innerHTML  = render(myCaps,  meIsWhite ? 'b' : 'w') + (myDiff  > 0 ? `<span class="cap-score">+${myDiff}</span>` : '');
  $('cap-by-opp').innerHTML = render(oppCaps, meIsWhite ? 'w' : 'b') + (myDiff  < 0 ? `<span class="cap-score">+${-myDiff}</span>` : '');
}
function updateMovesList(){
  const h = S.game.history();
  const ol = $('moves-list');
  ol.innerHTML = '';
  for (let i = 0; i < h.length; i += 2){
    const li = document.createElement('li');
    li.innerHTML = `<b>${h[i]}</b>&nbsp;&nbsp;${h[i+1] || ''}`;
    ol.appendChild(li);
  }
  ol.scrollTop = ol.scrollHeight;
}
function updateStatus(){
  const st = $('status');
  st.classList.remove('alert');
  if (S.over) { st.textContent = 'Partita conclusa'; return; }
  if (S.thinking){ st.textContent = 'L\u2019avversario riflette…'; return; }
  const turn = S.game.turn();
  const check = S.game.in_check() ? ' · Scacco!' : '';
  if (check) st.classList.add('alert');
  if (S.mode === 'local'){
    st.textContent = (turn === 'w' ? 'Muove il Bianco' : 'Muove il Nero') + check;
  } else {
    st.textContent = (turn === S.myColor ? 'Tocca a te' : 'Turno dell\u2019avversario') + check;
  }
}

/* ───────── IA: minimax + alfa-beta ───────── */
const PST = { // tabelle posizionali (vista del Bianco, indice 0 = a8)
  p:[0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n:[-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b:[-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r:[0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q:[-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  k:[-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
};
const CVAL = {p:100, n:320, b:330, r:500, q:900, k:20000};

function evaluate(game){
  let score = 0;
  game.board().forEach((row, ri) => row.forEach((pc, fi) => {
    if (!pc) return;
    const idx = ri * 8 + fi;
    const pst = pc.color === 'w' ? PST[pc.type][idx] : PST[pc.type][63 - idx];
    const v = CVAL[pc.type] + pst;
    score += pc.color === 'w' ? v : -v;
  }));
  return score;
}
function orderMoves(moves){
  return moves.sort((a,b) => {
    const sa = (a.captured ? 10 * CVAL[a.captured] - CVAL[a.piece] : 0) + (a.promotion ? 800 : 0);
    const sb = (b.captured ? 10 * CVAL[b.captured] - CVAL[b.piece] : 0) + (b.promotion ? 800 : 0);
    return sb - sa;
  });
}
function minimax(game, depth, alpha, beta, maximizing){
  if (depth === 0) return evaluate(game);
  const moves = orderMoves(game.moves({verbose:true}));
  if (!moves.length){
    if (game.in_check()) return maximizing ? -99999 - depth : 99999 + depth;
    return 0;
  }
  if (maximizing){
    let best = -Infinity;
    for (const m of moves){
      game.move(m);
      best = Math.max(best, minimax(game, depth - 1, alpha, beta, false));
      game.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves){
      game.move(m);
      best = Math.min(best, minimax(game, depth - 1, alpha, beta, true));
      game.undo();
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}
function aiTurn(){
  const game = S.game;
  const moves = orderMoves(game.moves({verbose:true}));
  if (!moves.length) return;
  const aiColor = game.turn();
  const maximizing = aiColor === 'w';
  const depth = S.aiLevel; // 1, 2, 3
  let best = null, bestScore = maximizing ? -Infinity : Infinity;
  const scored = [];

  for (const m of moves){
    game.move(m);
    const sc = minimax(game, depth - 1, -Infinity, Infinity, !maximizing);
    game.undo();
    scored.push({m, sc});
    if (maximizing ? sc > bestScore : sc < bestScore){ bestScore = sc; best = m; }
  }
  // Apprendista: un po' di imprevedibilità tra le mosse decenti
  if (S.aiLevel === 1){
    const tol = 120;
    const pool = scored.filter(x => Math.abs(x.sc - bestScore) <= tol);
    best = pool[Math.floor(Math.random() * pool.length)].m;
  }
  S.thinking = false;
  doMove({from: best.from, to: best.to, promotion: best.promotion || 'q'});
}

/* ───────── avvio partite ───────── */
function freshBoard(){
  S.game = new Chess();
  S.selected = null; S.legalTargets = [];
  S.over = false; S.thinking = false;
  buildSquares(); syncBoard();
  clearMarks('last'); clearMarks('chk');
  updateTrays(); updateMovesList(); updateStatus();
  $('end-overlay').hidden = true;
  $('moves-panel').hidden = true;
}
function startLocal(){
  S.mode = 'local'; S.flipped = false;
  $('opp-name').textContent = 'Nero';
  $('me-name').textContent = 'Bianco';
  $('btn-undo').style.display = '';
  show('game'); freshBoard();
}
function startAI(){
  S.mode = 'ai';
  let c = document.querySelector('#seg-color .on').dataset.color;
  if (c === 'random') c = Math.random() < .5 ? 'w' : 'b';
  S.myColor = c;
  S.flipped = c === 'b';
  S.aiLevel = parseInt(document.querySelector('#seg-level .on').dataset.level);
  const names = {1:'Apprendista', 2:'Stratega', 3:'Maestro'};
  $('opp-name').textContent = names[S.aiLevel];
  $('me-name').textContent = 'Tu';
  $('btn-undo').style.display = '';
  show('game'); freshBoard();
  if (S.myColor === 'b'){ S.thinking = true; updateStatus(); setTimeout(aiTurn, 500); }
}
function startOnline(){
  S.mode = 'online';
  S.myColor = S.isHost ? 'w' : 'b';
  S.flipped = !S.isHost;
  $('opp-name').textContent = 'Avversario';
  $('me-name').textContent = 'Tu';
  $('btn-undo').style.display = 'none';
  show('game'); freshBoard();
  toast(S.isHost ? 'Avversario connesso. Hai il Bianco.' : 'Connesso. Hai il Nero.');
}

/* segmented controls */
document.querySelectorAll('.seg').forEach(seg =>
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  })
);
$('start-ai').addEventListener('click', startAI);

/* ───────── azioni in partita ───────── */
$('btn-flip').addEventListener('click', () => {
  S.flipped = !S.flipped;
  deselect(); buildSquares(); syncBoard();
  const h = S.game.history({verbose:true});
  if (h.length){ const last = h[h.length-1]; mark(last.from,'last'); mark(last.to,'last'); }
  refreshChecks();
});
$('btn-undo').addEventListener('click', () => {
  if (S.mode === 'online') return;
  if (S.thinking || S.over) return;
  S.game.undo();
  if (S.mode === 'ai' && S.game.turn() !== S.myColor) S.game.undo();
  deselect(); buildSquares(); syncBoard();
  clearMarks('last'); refreshChecks();
  updateTrays(); updateMovesList(); updateStatus();
});
$('btn-new').addEventListener('click', () => {
  if (S.mode === 'online'){
    if (S.conn) S.conn.send({t:'rematch'});
    toast('Proposta di rivincita inviata');
    return;
  }
  freshBoard();
  if (S.mode === 'ai' && S.myColor === 'b'){ S.thinking = true; updateStatus(); setTimeout(aiTurn, 500); }
});
$('btn-moves').addEventListener('click', () => $('moves-panel').hidden = false);
$('close-moves').addEventListener('click', () => $('moves-panel').hidden = true);
$('leave-game').addEventListener('click', () => {
  if (S.mode === 'online' && S.conn){ try{ S.conn.send({t:'leave'}); }catch(e){} }
  teardownPeer();
  show('menu');
});
$('end-rematch').addEventListener('click', () => {
  $('end-overlay').hidden = true;
  $('btn-new').click();
});
$('end-menu').addEventListener('click', () => {
  $('end-overlay').hidden = true;
  teardownPeer();
  show('menu');
});
$('promo-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget){ $('promo-overlay').hidden = true; deselect(); }
});

/* ───────── online: PeerJS ───────── */
const PREFIX = 'scacco-it-';
function randomCode(){
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({length:6}, () => A[Math.floor(Math.random()*A.length)]).join('');
}
function teardownPeer(){
  try{ S.conn && S.conn.close(); }catch(e){}
  try{ S.peer && S.peer.destroy(); }catch(e){}
  S.conn = S.peer = null; S.roomCode = null;
  $('host-info').hidden = true;
  $('online-status').textContent = '';
}
function wireConn(conn){
  S.conn = conn;
  conn.on('data', d => {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'move'){
      doMove({from: d.from, to: d.to, promotion: d.promotion}, true);
    } else if (d.t === 'rematch'){
      toast('L\u2019avversario propone la rivincita: nuova partita!');
      freshBoard();
    } else if (d.t === 'leave'){
      resignedOrLeft('L\u2019avversario ha lasciato la partita.');
    }
  });
  conn.on('close', () => { if (!S.over && S.mode === 'online') resignedOrLeft('Connessione persa con l\u2019avversario.'); });
}
$('host-game').addEventListener('click', () => {
  teardownPeer();
  if (typeof Peer === 'undefined'){ toast('Serve la connessione internet per le sfide online.'); return; }
  S.isHost = true;
  S.roomCode = randomCode();
  $('online-status').textContent = 'Creazione partita…';
  const peer = new Peer(PREFIX + S.roomCode);
  S.peer = peer;
  peer.on('open', () => {
    $('online-status').textContent = '';
    $('room-code').textContent = S.roomCode;
    $('host-info').hidden = false;
  });
  peer.on('connection', conn => {
    conn.on('open', () => { wireConn(conn); startOnline(); });
  });
  peer.on('error', err => {
    $('online-status').textContent = 'Errore di rete: riprova tra poco.';
    console.warn(err);
  });
});
function inviteLink(){
  const url = new URL(location.href);
  url.search = '?room=' + S.roomCode;
  return url.toString();
}
$('copy-link').addEventListener('click', async () => {
  try{ await navigator.clipboard.writeText(inviteLink()); toast('Link copiato negli appunti'); }
  catch(e){ toast('Codice: ' + S.roomCode); }
});
$('share-link').addEventListener('click', () => {
  if (navigator.share){
    navigator.share({title:'Scacco — ti sfido!', text:'Giochiamo a scacchi? Apri il link per iniziare.', url: inviteLink()}).catch(()=>{});
  } else $('copy-link').click();
});
function joinRoom(code){
  teardownPeer();
  if (typeof Peer === 'undefined'){ toast('Serve la connessione internet per le sfide online.'); return; }
  code = code.trim().toUpperCase();
  if (code.length !== 6){ toast('Il codice ha 6 caratteri.'); return; }
  S.isHost = false;
  $('online-status').textContent = 'Connessione in corso…';
  const peer = new Peer();
  S.peer = peer;
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code, {reliable: true});
    conn.on('open', () => { $('online-status').textContent = ''; wireConn(conn); startOnline(); });
    conn.on('error', () => $('online-status').textContent = 'Partita non trovata. Controlla il codice.');
    setTimeout(() => {
      if (!S.conn) $('online-status').textContent = 'Partita non trovata. Controlla il codice.';
    }, 8000);
  });
  peer.on('error', () => $('online-status').textContent = 'Partita non trovata o rete assente.');
}
$('join-game').addEventListener('click', () => joinRoom($('join-code').value));
$('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(e.target.value); });

/* link d'invito ?room=XXXXXX */
window.addEventListener('load', () => {
  const room = new URLSearchParams(location.search).get('room');
  if (room){
    show('setup-online');
    $('join-code').value = room.toUpperCase();
    setTimeout(() => joinRoom(room), 400);
    history.replaceState(null, '', location.pathname);
  }
});

/* ───────── service worker (PWA) ───────── */
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
