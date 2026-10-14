import { firebaseConfig } from './firebase-config.js';

const $ = (s) => document.querySelector(s);
const ADMIN_EMAIL = 'ggiyoo@gmail.com';
const demo = location.hostname === 'localhost' && new URLSearchParams(location.search).has('demo'); // 내 컴퓨터에서 시험할 때만
let api = null;

async function makeFirebaseApi() {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [app, fs, au] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'), import(base + 'firebase-auth.js')
  ]);
  const a = app.initializeApp(firebaseConfig);
  const db = fs.getFirestore(a);
  const auth = au.getAuth(a);
  const list = async (status) => {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'posts'), fs.where('status', '==', status)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || null }));
  };
  return {
    listApproved: () => list('approved'),
    listPending: () => list('pending'),
    add: (nickname, message) => fs.addDoc(fs.collection(db, 'posts'), { nickname, message, status: 'pending', createdAt: fs.serverTimestamp() }),
    approve: (id) => fs.updateDoc(fs.doc(db, 'posts', id), { status: 'approved' }),
    remove: (id) => fs.deleteDoc(fs.doc(db, 'posts', id)),
    login: async () => (await au.signInWithPopup(auth, new au.GoogleAuthProvider())).user.email,
    logout: () => au.signOut(auth),
    onAuth: (cb) => au.onAuthStateChanged(auth, (u) => cb(u && u.email))
  };
}

function makeDemoApi() {
  let n = 3, email = null, listeners = [];
  const posts = [
    { id: '1', nickname: '지나가던 사람', message: '바나나 키우기 배너가 너무 귀여워요!', status: 'approved', createdAt: new Date(Date.now() - 864e5) },
    { id: '2', nickname: '젤리팝팬', message: '젤리팝 털실 느낌이 좋아요. 다음 작품도 기대할게요.', status: 'approved', createdAt: new Date() },
    { id: '3', nickname: '새 방문자', message: '검토를 기다리는 글입니다.', status: 'pending', createdAt: new Date() }
  ];
  const wait = () => new Promise((r) => setTimeout(r, 50));
  return {
    listApproved: async () => { await wait(); return posts.filter((p) => p.status === 'approved'); },
    listPending: async () => { await wait(); return posts.filter((p) => p.status === 'pending'); },
    add: async (nickname, message) => { await wait(); posts.push({ id: String(++n), nickname, message, status: 'pending', createdAt: new Date() }); },
    approve: async (id) => { posts.find((p) => p.id === id).status = 'approved'; },
    remove: async (id) => { posts.splice(posts.findIndex((p) => p.id === id), 1); },
    login: async () => { email = ADMIN_EMAIL; listeners.forEach((f) => f(email)); return email; },
    logout: async () => { email = null; listeners.forEach((f) => f(null)); },
    onAuth: (cb) => { listeners.push(cb); cb(email); }
  };
}

const fmt = (d) => (d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '');
const esc = (t) => { const s = document.createElement('span'); s.textContent = t; return s.innerHTML; };

function postCard(p, admin, pending) {
  const el = document.createElement('article');
  el.className = 'bd-post';
  el.dataset.id = p.id;
  const meta = document.createElement('div');
  meta.className = 'bd-meta';
  const name = document.createElement('strong'); name.textContent = p.nickname;
  const date = document.createElement('span'); date.textContent = fmt(p.createdAt);
  meta.append(name, date);
  const msg = document.createElement('p'); msg.textContent = p.message;
  el.append(meta, msg);
  if (admin) {
    const act = document.createElement('div'); act.className = 'bd-actions';
    if (pending) { const ok = document.createElement('button'); ok.type = 'button'; ok.dataset.act = 'approve'; ok.textContent = '승인'; act.append(ok); }
    const del = document.createElement('button'); del.type = 'button'; del.dataset.act = 'remove'; del.className = 'bd-del'; del.textContent = '삭제';
    act.append(del); el.append(act);
  }
  return el;
}

let adminMode = false;
async function render() {
  const list = $('#bd-list'), pendBox = $('#bd-pending');
  try {
    const posts = (await api.listApproved()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    list.replaceChildren(...(posts.length ? posts.map((p) => postCard(p, adminMode, false)) : [Object.assign(document.createElement('p'), { className: 'bd-empty', textContent: '아직 공개된 의견이 없어요. 첫 의견을 남겨 주세요!' })]));
  } catch (e) { list.textContent = '글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'; }
  if (adminMode) {
    try {
      const pend = (await api.listPending()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      $('#bd-pending-title').textContent = `승인 대기 ${pend.length}건`;
      pendBox.replaceChildren(...pend.map((p) => postCard(p, true, true)));
    } catch (e) { pendBox.textContent = '대기 글을 불러오지 못했어요.'; }
  }
}

function setAdminUI(email) {
  const ok = email === ADMIN_EMAIL;
  adminMode = ok;
  $('#bd-admin-panel').hidden = !ok;
  $('#bd-login').hidden = ok;
  $('#bd-logout').hidden = !ok;
  if (email && !ok) { $('#bd-status').textContent = '관리자 계정이 아니에요.'; api.logout(); }
  render();
}

async function boot() {
  const form = $('#bd-form');
  if (!demo && !firebaseConfig) {
    $('#bd-closed').hidden = false; form.hidden = true; $('#bd-list').hidden = true; $('#bd-admin').hidden = true;
    return;
  }
  api = demo ? makeDemoApi() : await makeFirebaseApi();
  const rate = 60000;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('#bd-status');
    if (form.elements.website.value) return; // 스팸 방지용 숨김 칸
    const nickname = form.elements.nickname.value.trim();
    const message = form.elements.message.value.trim();
    if (!nickname || !message) { status.textContent = '닉네임과 내용을 모두 적어 주세요.'; return; }
    let last = 0; try { last = Number(localStorage.getItem('bd-last') || 0); } catch (_) {}
    if (Date.now() - last < rate) { status.textContent = '잠시 후에 다시 남겨 주세요. (1분에 한 번)'; return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; status.textContent = '보내는 중…';
    try {
      await api.add(nickname, message);
      try { localStorage.setItem('bd-last', String(Date.now())); } catch (_) {}
      form.reset(); status.textContent = '고마워요! 확인 후 공개돼요.';
    } catch (err) { status.textContent = '보내지 못했어요. 잠시 후 다시 시도해 주세요.'; }
    btn.disabled = false;
  });
  const counter = () => { $('#bd-count').textContent = `${form.elements.message.value.length} / 500`; };
  form.elements.message.addEventListener('input', counter); counter();
  $('#bd-login').addEventListener('click', async () => { try { await api.login(); } catch (_) { $('#bd-status').textContent = '로그인하지 못했어요.'; } });
  $('#bd-logout').addEventListener('click', () => api.logout());
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.bd-post').dataset.id;
    if (b.dataset.act === 'remove' && !confirm('이 글을 삭제할까요?')) return;
    b.disabled = true;
    try { b.dataset.act === 'approve' ? await api.approve(id) : await api.remove(id); } catch (_) { alert('처리하지 못했어요.'); }
    render();
  });
  api.onAuth(setAdminUI);
}
boot();
