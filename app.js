/* ========== MyVideoApp 前端逻辑 ========== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const API = '/api';
let TOKEN = localStorage.getItem('token') || '';
let ME = null;
let currentVideo = null;

// ========== 工具 ==========
function toast(msg, ok=true){
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (ok?'':' err');
  setTimeout(()=>t.className='toast', 2200);
}
function avatarOf(u){ return u?.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (u?.nickname?u.nickname.slice(0,1).toUpperCase():'😊'); }
function timeAgo(t){ const d=Date.now()-t; if(d<60e3)return'刚刚'; if(d<3600e3)return Math.floor(d/60e3)+'分钟前'; if(d<86400e3)return Math.floor(d/3600e3)+'小时前'; return Math.floor(d/86400e3)+'天前'; }
async function api(path, opts={}){
  const res = await fetch(API+path, { ...opts, headers: { 'Content-Type':'application/json', 'Authorization': TOKEN?`Bearer ${TOKEN}`:'', ...(opts.headers||{}) } });
  return res.json();
}
function openModal(id){ $('#'+id).hidden = false; }
function closeModal(el){ el.closest('.modal').hidden = true; }
function bindClose(){ $$('.modal-close, [data-close]').forEach(b=>b.onclick=()=>closeModal(b)); }

// ========== 认证 ==========
async function refreshMe(){
  if(!TOKEN) return ME=null;
  const r = await api('/me');
  if(r.code===0){ ME=r.data; renderNav(); } else { TOKEN=''; localStorage.removeItem('token'); ME=null; renderNav(); }
}
function renderNav(){
  const av = $('#nav-avatar'); av.innerHTML = ME? avatarOf(ME) : '😊';
  $('#nowplaying').hidden = !ME || !currentVideo;
}
function showAuth(tab='login'){
  openModal('modal-auth');
  $$('.auth-tabs .tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  $('#panel-login').hidden = tab!=='login'; $('#panel-register').hidden = tab!=='register';
}
$('#btn-home').onclick = ()=>{ $('#feed').scrollTo({top:0,behavior:'smooth'}); loadVideos(); };
$('#avatar-wrap').onclick = async ()=>{
  if(!ME){ showAuth(); return; }
  openModal('modal-profile'); await loadProfile(ME.id);
};
$('#btn-upload').onclick = ()=>{ if(!ME){showAuth();return;} openModal('modal-upload'); };
$('#btn-live').onclick = ()=>{ openModal('modal-livelist'); loadLives(); };
$('#btn-msg').onclick = async ()=>{ if(!ME){showAuth();return;} openModal('modal-msg'); await loadConversations(); loadUsers(); };
$('#btn-notify').onclick = async ()=>{ if(!ME){showAuth();return;} openModal('modal-notify'); await loadNotifications(); };

// 注册
$('#do-register').onclick = async ()=>{
  const r = await api('/register', { method:'POST', body: JSON.stringify({ phone:$('#reg-phone').value, password:$('#reg-pwd').value, nickname:$('#reg-nick').value }) });
  if(r.code===0){ toast('注册成功，请登录'); showAuth('login'); } else toast(r.msg||'注册失败',false);
};
// 登录
$('#do-login').onclick = async ()=>{
  const r = await api('/login', { method:'POST', body: JSON.stringify({ phone:$('#login-phone').value, password:$('#login-pwd').value }) });
  if(r.code===0){ TOKEN=r.data.id; localStorage.setItem('token',TOKEN); closeModal($('#modal-auth')); await refreshMe(); toast('登录成功'); loadVideos(); } else toast(r.msg||'登录失败',false);
};
// 第三方登录
$('#oauth-wechat').onclick = ()=>doThird('wechat');
$('#oauth-qq').onclick = ()=>doThird('qq');
async function doThird(type){
  const r = await api('/login/third', { method:'POST', body: JSON.stringify({ type, openid:'demo_'+type+'_'+Date.now(), nickname:type==='wechat'?'微信用户':'QQ用户' }) });
  if(r.code===0){ TOKEN=r.data.id; localStorage.setItem('token',TOKEN); closeModal($('#modal-auth')); await refreshMe(); toast(type==='wechat'?'微信登录成功':'QQ登录成功'); loadVideos(); } else toast('登录失败',false);
}
$$('.auth-tabs .tab').forEach(t=>t.onclick=()=>showAuth(t.dataset.tab));

// ========== 发布视频 ==========
$('#do-upload').onclick = async ()=>{
  const r = await api('/videos', { method:'POST', body: JSON.stringify({ title:$('#up-title').value, url:$('#up-url').value, cover:$('#up-cover').value }) });
  if(r.code===0){ toast('发布成功'); closeModal($('#modal-upload')); $('#up-title').value='';$('#up-url').value='';$('#up-cover').value=''; loadVideos(); }
  else toast(r.msg||'发布失败',false);
};

// ========== 视频流 ==========
async function loadVideos(){
  const r = await api('/videos');
  const feed = $('#feed'); feed.innerHTML = '<div class="feed-tip">⬇ 上下滑动刷视频 · 单击 ❤️ 点赞</div>';
  if(!r.data.length){ feed.insertAdjacentHTML('beforeend','<div style="color:var(--muted);text-align:center;margin-top:30vh">暂无视频，去发布一个吧！</div>'); return; }
  r.data.forEach(v=>{
    const card = document.createElement('div'); card.className='video-card';
    card.innerHTML = `
      <video src="${v.url}" loop muted playsinline preload="metadata"></video>
      <div class="video-overlay">
        <div class="video-meta">
          <div class="video-title">${v.title}</div>
          <div class="video-author"><span class="ava">${avatarOf({avatar:v.authorAvatar,nickname:v.authorNickname})}</span> @${v.authorNickname}</div>
        </div>
        <div class="video-actions">
          <div class="vaction"><button data-act="like" title="点赞">❤️</button><span>${v.likes||0}</span></div>
          <div class="vaction"><button data-act="fav" title="收藏">⭐</button><span>收藏</span></div>
          <div class="vaction"><button data-act="comment" title="评论">💬</button><span>评论</span></div>
          <div class="vaction"><button data-act="author" title="作者主页">👤</button></div>
        </div>
      </div>`;
    feed.appendChild(card);
    const videoEl = card.querySelector('video');
    videoEl.addEventListener('error', ()=>{
      // 外链加载失败时用 canvas 动态生成一段可播放视频，保证有画面
      try {
        const c = document.createElement('canvas'); c.width=480; c.height=854;
        const g = c.getContext('2d'); const stream = c.captureStream(15);
        let n=0; const colors=['#7c5cff','#ff5cae','#00d2ff','#2ecc71','#ff8a00'];
        const t = setInterval(()=>{ n++; g.fillStyle=colors[n%colors.length]; g.fillRect(0,0,c.width,c.height); g.fillStyle='#fff'; g.font='bold 38px sans-serif'; g.textAlign='center'; g.fillText(v.title||'MyVideoApp',c.width/2,c.height/2); g.fillText('🎬 示例视频 '+n,c.width/2,c.height/2+50); }, 1000/15);
        const rec = new MediaRecorder(stream); const parts=[];
        rec.ondataavailable=e=>parts.push(e.data);
        rec.onstop=()=>{ const blob=new Blob(parts,{type:'video/webm'}); videoEl.src=URL.createObjectURL(blob); };
        setTimeout(()=>{ rec.stop(); clearInterval(t); }, 2500);
        rec.start();
      } catch(e){}
    });
    videoEl.addEventListener('click', ()=>{ videoEl.muted=!videoEl.muted; });
    card.querySelectorAll('.vaction button').forEach(b=>{
      b.onclick = async (e)=>{
        e.stopPropagation(); if(!ME){showAuth();return;}
        const act = b.dataset.act;
        if(act==='like'){ const res=await api('/videos/'+v.id+'/like',{method:'POST'}); if(res.code===0){ b.classList.toggle('active',res.liked); card.querySelector('.vaction span').textContent=res.likes; toast(res.liked?'已点赞':'已取消'); } }
        if(act==='fav'){ const res=await api('/videos/'+v.id+'/favorite',{method:'POST'}); if(res.code===0){ b.classList.toggle('active',res.favorited); toast(res.favorited?'已收藏':'已取消收藏'); } }
        if(act==='comment'){ openModal('modal-comment'); currentVideo=v; $('#comment-list').innerHTML='<div class="muted" style="color:var(--muted)">加载中...</div>'; loadComments(v.id); }
        if(act==='author'){ openModal('modal-profile'); loadProfile(v.userId); }
      };
    });
  });
  bindVideoObserver();
}
function bindVideoObserver(){
  const cards = $$('.video-card');
  const io = new IntersectionObserver(entries=>{
    entries.forEach(en=>{
      const v = en.target.querySelector('video');
      if(en.isIntersecting){ v.play().catch(()=>{}); currentVideo = cards.indexOf(en.target)>=0? getVideoAt(cards.indexOf(en.target)):null; updateNowPlaying(); }
      else { v.pause(); }
    });
  }, { threshold:0.6 });
  cards.forEach(c=>io.observe(c));
}
function getVideoAt(i){ const cards=$$('.video-card'); if(i>=cards.length)return null; return null; }
function updateNowPlaying(){ /* placeholder */ }

// 滚动加载简版（已在 loadVideos 全量加载）

// ========== 评论 ==========
async function loadComments(vid){
  const r = await api('/videos/'+vid+'/comments');
  const box = $('#comment-list'); box.innerHTML='';
  if(!r.data.length){ box.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">暂无评论</div>'; return; }
  r.data.forEach(c=>{ box.insertAdjacentHTML('beforeend', `<div class="comment-item"><div class="ava">${avatarOf({avatar:c.avatar,nickname:c.nickname})}</div><div class="ci-body"><div class="ci-name">${c.nickname}<span class="ci-time">${timeAgo(c.createdAt)}</span></div><div class="ci-content">${c.content}</div></div></div>`); });
}
$('#comment-send').onclick = async ()=>{
  if(!currentVideo) return;
  const content = $('#comment-input').value.trim(); if(!content) return;
  const r = await api('/videos/'+currentVideo.id+'/comments', { method:'POST', body: JSON.stringify({ content }) });
  if(r.code===0){ $('#comment-input').value=''; loadComments(currentVideo.id); toast('评论成功'); } else toast(r.msg||'失败',false);
};

// ========== 个人主页 ==========
async function loadProfile(uid){
  const r = await api('/users/'+uid);
  if(r.code!==0) return;
  const d = r.data;
  $('#profile-avatar').innerHTML = avatarOf(d);
  $('#profile-nick').textContent = d.nickname; $('#profile-bio').textContent = d.bio||'这个人很懒，什么都没写~';
  $('#profile-followers').textContent = d.followers; $('#profile-following').textContent = d.following;
  $('#edit-nick').value = d.nickname; $('#edit-avatar').value = d.avatar||''; $('#edit-bio').value = d.bio||'';
  const grid = $('#profile-videos'); grid.innerHTML='';
  d.videos.forEach(v=>{ grid.insertAdjacentHTML('beforeend', `<div class="item"><video src="${v.url}" muted loop playsinline></video><div class="tt">${v.title}</div></div>`); });
  grid.querySelectorAll('video').forEach(v=>v.onclick=()=>v.paused?v.play():v.pause());
}
$('#do-save-profile').onclick = async ()=>{
  const r = await api('/me', { method:'POST', body: JSON.stringify({ nickname:$('#edit-nick').value, avatar:$('#edit-avatar').value, bio:$('#edit-bio').value }) });
  if(r.code===0){ toast('资料已更新'); await refreshMe(); } else toast(r.msg||'失败',false);
};

// ========== 直播 ==========
async function loadLives(){
  const r = await api('/lives');
  const box = $('#live-list'); box.innerHTML='';
  if(!r.data.length){ box.innerHTML='<div style="color:var(--muted);grid-column:1/-1;text-align:center;padding:30px">暂无正在直播的房间</div>'; return; }
  r.data.forEach(l=>{ box.insertAdjacentHTML('beforeend', `<div class="live-card" data-id="${l.id}" data-uid="${l.userId}"><span class="lc-tag">LIVE</span><div class="lc-body"><div class="lc-title">${l.title}</div><div class="lc-user"><span class="ava">${avatarOf({avatar:l.avatar,nickname:l.nickname})}</span>${l.nickname}</div></div></div>`); });
  box.querySelectorAll('.live-card').forEach(c=>c.onclick=()=>enterLiveRoom(c.dataset.id, c.dataset.uid));
}
$('#btn-start-live').onclick = ()=>openModal('modal-startlive');
$('#do-start-live').onclick = async ()=>{
  const r = await api('/live', { method:'POST', body: JSON.stringify({ title:$('#startlive-title').value||(ME.nickname+'的直播间') }) });
  if(r.code!==0) return toast(r.msg||'失败',false);
  closeModal($('#modal-startlive')); closeModal($('#modal-livelist'));
  startWebRTCLive(r.data);
};
function startWebRTCLive(room){
  openModal('modal-live'); $('#live-title').textContent = room.title;
  const video = $('#live-video'); video.muted=false;
  navigator.mediaDevices.getUserMedia({ video:true, audio:true }).then(stream=>{
    video.srcObject = stream; video.play().catch(()=>{});
    toast('直播已开始（本地预览）');
    simulateLiveChat();
  }).catch(err=>{ toast('无法访问摄像头：'+err.message,false); });
}
function simulateLiveChat(){
  const box = $('#live-chat'); box.innerHTML='';
  const lines = ['欢迎来到直播间 🎉','支持一下！','画质不错','主播好棒 👍','666','关注了'];
  let i=0; const tick=()=>{ if($('#modal-live').hidden) return; box.insertAdjacentHTML('beforeend',`<div class="lm"><b>游客${Math.floor(Math.random()*900+100)}：</b>${lines[i++%lines.length]}</div>`); box.scrollTop=box.scrollHeight; setTimeout(tick, 2500+Math.random()*3000); };
  tick();
}
$('#live-send').onclick = ()=>{ const v=$('#live-msg').value.trim(); if(!v)return; $('#live-chat').insertAdjacentHTML('beforeend',`<div class="lm"><b style="color:var(--ok)">我：</b>${v}</div>`); $('#live-msg').value=''; $('#live-chat').scrollTop=1e9; };
function enterLiveRoom(id, uid){
  openModal('modal-live'); $('#live-title').textContent='观看直播 #'+id;
  const video = $('#live-video'); video.srcObject=null; video.src='https://www.w3schools.com/html/mov_bbb.mp4'; video.play().catch(()=>{});
  simulateLiveChat();
}

// ========== 消息 ==========
async function loadConversations(){
  const r = await api('/conversations');
  const box = $('#conv-list'); box.innerHTML='';
  r.data.forEach(c=>{ box.insertAdjacentHTML('beforeend', `<div class="conv-item" data-id="${c.otherId}"><div class="ava">${avatarOf({avatar:c.avatar,nickname:c.nickname})}</div><div class="ci-info"><div class="ci-name">${c.nickname}</div><div class="ci-last">${c.last||''}</div></div></div>`); });
  box.querySelectorAll('.conv-item').forEach(c=>c.onclick=()=>openConversation(c.dataset.id, c.querySelector('.ci-name').textContent));
}
async function loadUsers(){
  const r = await api('/users');
  const box = $('#msg-userlist'); box.innerHTML='';
  r.data.filter(u=>u.id!=ME.id).forEach(u=>{ box.insertAdjacentHTML('beforeend', `<div class="user-item" data-id="${u.id}"><div class="ava">${avatarOf(u)}</div><span>${u.nickname}</span></div>`); });
  box.querySelectorAll('.user-item').forEach(c=>c.onclick=()=>openConversation(c.dataset.id, c.querySelector('span').textContent));
}
let activeChatId = null;
async function openConversation(uid, name){
  activeChatId = uid; $('#msg-top').textContent = '与 '+name+' 聊天中';
  $('#msg-compose').hidden=false;
  const r = await api('/messages/'+uid);
  const box = $('#msg-list'); box.innerHTML='';
  r.data.forEach(m=>{ box.insertAdjacentHTML('beforeend', `<div class="msg ${m.fromId==ME.id?'me':'them'}">${m.content}</div>`); });
  box.scrollTop=1e9;
}
$('#msg-send').onclick = async ()=>{
  if(!activeChatId) return;
  const content = $('#msg-input').value.trim(); if(!content) return;
  const r = await api('/messages', { method:'POST', body: JSON.stringify({ toId:Number(activeChatId), content }) });
  if(r.code===0){ $('#msg-input').value=''; openConversation(activeChatId, $('#msg-top').textContent.replace('与 ','').replace(' 聊天中','')); }
};

// ========== 通知 ==========
async function loadNotifications(){
  const r = await api('/notifications');
  const box = $('#notify-list'); box.innerHTML='';
  if(!r.data.length){ box.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">暂无通知</div>'; return; }
  r.data.forEach(n=>{ box.insertAdjacentHTML('beforeend', `<div class="notify-item ${n.read?'':'unread'}"><div class="ni-head"><span>${n.fromNickname}</span><span>${timeAgo(n.createdAt)}</span></div><div class="ni-content">${n.content}</div></div>`); });
}

// ========== NowPlaying 底部栏 ==========
// 用 feed 当前可见卡片同步（简化）
window.setInterval(async ()=>{
  if(!ME) return;
  const r = await api('/notifications');
  if(r.code===0){ const unread = r.data.filter(n=>!n.read).length; $('#notify-badge').hidden=!unread; }
}, 30000);

// ========== 初始化 ==========
bindClose();
// 点击 modal 背景关闭
$$('.modal').forEach(m=>m.onclick=e=>{ if(e.target===m) m.hidden=true; });
(async ()=>{
  await refreshMe();
  await loadVideos();
})();
