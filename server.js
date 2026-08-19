const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

// ========== 简易数据库（JSON 文件持久化） ==========
const DB_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_FILE = path.join(DB_DIR, 'db.json');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let db = {
  users: [],        // {id, username, phone, password(hash), nickname, avatar, bio, createdAt}
  videos: [],       // {id, userId, title, url, cover, likes, createdAt}
  likes: [],        // {id, userId, videoId}
  favorites: [],    // {id, userId, videoId}
  comments: [],     // {id, userId, videoId, content, createdAt}
  follows: [],      // {id, followerId, followingId}
  messages: [],     // {id, fromId, toId, content, createdAt, read}
  notifications: [],// {id, userId, type, fromId, content, createdAt, read}
  lives: [],        // {id, userId, title, status, createdAt}
};
if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
}
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

// 初始化演示数据
if (db.users.length === 0) {
  const demoId = 1;
  db.users.push({
    id: demoId, username: 'demo', phone: '13800138000',
    password: crypto.createHash('sha256').update('123456').digest('hex'),
    nickname: '短视频达人', avatar: '', bio: '欢迎来到我的频道！', createdAt: Date.now()
  });
  // 示例视频
  const sampleVideos = [
    { title: '美丽的城市夜景', url: 'https://www.w3schools.com/html/mov_bbb.mp4', cover: '' },
    { title: '可爱的小猫日常', url: 'https://www.w3schools.com/html/movie.mp4', cover: '' },
    { title: '美食制作教程', url: 'https://www.w3schools.com/html/mov_bbb.mp4', cover: '' },
    { title: '旅行风景合集', url: 'https://www.w3schools.com/html/movie.mp4', cover: '' },
    { title: '舞蹈挑战', url: 'https://www.w3schools.com/html/mov_bbb.mp4', cover: '' },
  ];
  sampleVideos.forEach((v, i) => {
    db.videos.push({ id: i + 1, userId: demoId, title: v.title, url: v.url, cover: v.cover, likes: Math.floor(Math.random()*200), createdAt: Date.now() - i*86400000 });
  });
  saveDB();
}

// ========== 工具函数 ==========
function hashPwd(p) { return crypto.createHash('sha256').update(p).digest('hex'); }
function genId() { return crypto.randomBytes(8).toString('hex'); }
function now() { return Date.now(); }
function getMime(ext) {
  const m = { '.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.mp4':'video/mp4','.webp':'image/webp','.ico':'image/x-icon' };
  return m[ext.toLowerCase()] || 'application/octet-stream';
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function authUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.replace('Bearer ', '');
  if (!token) return null;
  const u = db.users.find(x => x.id === Number(token));
  return u || null;
}

// ========== API 路由 ==========
const API = {
  // 注册（手机号）
  async 'POST /api/register'(req, res) {
    const body = JSON.parse(await readBody(req) || '{}');
    const { phone, password, nickname } = body;
    if (!phone || !password) return { code: 400, msg: '手机号和密码必填' };
    if (db.users.find(u => u.phone === phone)) return { code: 400, msg: '该手机号已注册' };
    const u = { id: db.users.length ? Math.max(...db.users.map(x=>x.id))+1 : 1, username: 'u'+phone.slice(-4), phone, password: hashPwd(password), nickname: nickname || '用户'+phone.slice(-4), avatar: '', bio: '', createdAt: now() };
    db.users.push(u); saveDB();
    return { code: 0, msg: '注册成功', data: { id: u.id, nickname: u.nickname } };
  },
  // 登录（手机号）
  async 'POST /api/login'(req, res) {
    const body = JSON.parse(await readBody(req) || '{}');
    const { phone, password } = body;
    const u = db.users.find(x => x.phone === phone && x.password === hashPwd(password));
    if (!u) return { code: 400, msg: '手机号或密码错误' };
    return { code: 0, data: { id: u.id, nickname: u.nickname, avatar: u.avatar } };
  },
  // 第三方登录（模拟）
  async 'POST /api/login/third'(req, res) {
    const body = JSON.parse(await readBody(req) || '{}');
    const { type, openid, nickname } = body; // type: wechat/qq
    if (!openid) return { code: 400, msg: 'openid 缺失' };
    let u = db.users.find(x => x.phone === type+'_'+openid);
    if (!u) {
      u = { id: db.users.length?Math.max(...db.users.map(x=>x.id))+1:1, username: type+openid.slice(-4), phone: type+'_'+openid, password:'', nickname: nickname||(type==='wechat'?'微信用户':'QQ用户'), avatar:'', bio:'', createdAt:now() };
      db.users.push(u); saveDB();
    }
    return { code: 0, data: { id: u.id, nickname: u.nickname, avatar: u.avatar } };
  },
  // 获取当前用户
  async 'GET /api/me'(req, res) {
    const u = authUser(req); if (!u) return { code: 401, msg: '未登录' };
    const { password, ...safe } = u; return { code: 0, data: safe };
  },
  // 更新资料
  async 'POST /api/me'(req, res) {
    const u = authUser(req); if (!u) return { code: 401, msg: '未登录' };
    const body = JSON.parse(await readBody(req) || '{}');
    if (body.nickname !== undefined) u.nickname = body.nickname;
    if (body.avatar !== undefined) u.avatar = body.avatar;
    if (body.bio !== undefined) u.bio = body.bio;
    saveDB(); return { code: 0, msg: '更新成功' };
  },
  // 视频列表
  async 'GET /api/videos'(req, res) {
    const list = [...db.videos].sort((a,b)=>b.createdAt-a.createdAt).map(v=>{
      const author = db.users.find(u=>u.id===v.userId);
      return { ...v, authorNickname: author?author.nickname:'未知', authorAvatar: author?author.avatar:'' };
    });
    return { code: 0, data: list };
  },
  // 发布视频
  async 'POST /api/videos'(req, res) {
    const u = authUser(req); if (!u) return { code: 401, msg: '未登录' };
    const body = JSON.parse(await readBody(req) || '{}');
    if (!body.url) return { code: 400, msg: '视频地址必填' };
    const v = { id: db.videos.length?Math.max(...db.videos.map(x=>x.id))+1:1, userId: u.id, title: body.title||'未命名视频', url: body.url, cover: body.cover||'', likes: 0, createdAt: now() };
    db.videos.push(v); saveDB();
    return { code: 0, msg: '发布成功', data: v };
  },
  // 点赞/取消点赞
  async 'POST /api/videos/:id/like'(req, res, params) {
    const u = authUser(req); if (!u) return { code: 401, msg: '未登录' };
    const id = Number(params.id); const v = db.videos.find(x=>x.id===id);
    if (!v) return { code: 404, msg: '视频不存在' };
    const exist = db.likes.find(l=>l.userId===u.id && l.videoId===id);
    if (exist) { db.likes = db.likes.filter(l=>!(l.userId===u.id&&l.videoId===id)); v.likes = Math.max(0,v.likes-1); }
    else { db.likes.push({id:genId(),userId:u.id,videoId:id}); v.likes++; }
    saveDB(); return { code: 0, liked: !exist, likes: v.likes };
  },
  // 收藏/取消收藏
  async 'POST /api/videos/:id/favorite'(req, res, params) {
    const u = authUser(req); if (!u) return { code: 401, msg: '未登录' };
    const id = Number(params.id);
    const exist = db.favorites.find(l=>l.userId===u.id && l.videoId===id);
    if (exist) { db.favorites = db.favorites.filter(l=>!(l.userId===u.id&&l.videoId===id)); }
    else { db.favorites.push({id:genId(),userId:u.id,videoId:id}); }
    saveDB(); return { code: 0, favorited: !exist };
  },
  // 评论列表
  async 'GET /api/videos/:id/comments'(req, res, params) {
    const id = Number(params.id);
    const list = db.comments.filter(c=>c.videoId===id).sort((a,b)=>b.createdAt-a.createdAt).map(c=>{
      const author = db.users.find(u=>u.id===c.userId);
      return { ...c, nickname: author?author.nickname:'未知', avatar: author?author.avatar:'' };
    });
    return { code: 0, data: list };
  },
  // 发表评论
  async 'POST /api/videos/:id/comments'(req, res, params) {
    const u = authUser(req); if (!u) return { code: 401, msg: '未登录' };
    const id = Number(params.id); const body = JSON.parse(await readBody(req)||'{}');
    if (!body.content) return { code: 400, msg: '评论内容不能为空' };
    const c = { id: genId(), userId: u.id, videoId: id, content: body.content, createdAt: now() };
    db.comments.push(c); saveDB();
    return { code: 0, msg: '评论成功', data: c };
  },
  // 我的收藏
  async 'GET /api/me/favorites'(req, res) {
    const u = authUser(req); if (!u) return { code: 401, msg: '未登录' };
    const list = db.favorites.filter(f=>f.userId===u.id).map(f=>{
      const v = db.videos.find(x=>x.id===f.videoId); if (!v) return null;
      const author = db.users.find(uu=>uu.id===v.userId);
      return { ...v, authorNickname: author?author.nickname:'未知' };
    }).filter(Boolean);
    return { code: 0, data: list };
  },
  // 关注/取关
  async 'POST /api/users/:id/follow'(req, res, params) {
    const me = authUser(req); if (!me) return { code: 401, msg: '未登录' };
    const target = Number(params.id);
    if (target===me.id) return { code: 400, msg: '不能关注自己' };
    const exist = db.follows.find(f=>f.followerId===me.id&&f.followingId===target);
    if (exist) { db.follows = db.follows.filter(f=>!(f.followerId===me.id&&f.followingId===target)); }
    else { db.follows.push({id:genId(),followerId:me.id,followingId:target});
      db.notifications.push({id:genId(),userId:target,type:'follow',fromId:me.id,content:me.nickname+' 关注了你',createdAt:now(),read:false});
    }
    saveDB(); return { code: 0, followed: !exist };
  },
  // 消息列表（与某人）
  async 'GET /api/messages/:userId'(req, res, params) {
    const me = authUser(req); if (!me) return { code: 401, msg: '未登录' };
    const other = Number(params.userId);
    const list = db.messages.filter(m=>(m.fromId===me.id&&m.toId===other)||(m.fromId===other&&m.toId===me.id)).sort((a,b)=>a.createdAt-b.createdAt);
    db.messages.forEach(m=>{ if(m.toId===me.id&&!m.read) m.read=true; }); saveDB();
    return { code: 0, data: list };
  },
  // 发消息
  async 'POST /api/messages'(req, res) {
    const me = authUser(req); if (!me) return { code: 401, msg: '未登录' };
    const body = JSON.parse(await readBody(req)||'{}');
    if (!body.toId || !body.content) return { code: 400, msg: '参数缺失' };
    const m = { id: genId(), fromId: me.id, toId: Number(body.toId), content: body.content, createdAt: now(), read: false };
    db.messages.push(m);
    db.notifications.push({id:genId(),userId:Number(body.toId),type:'message',fromId:me.id,content:me.nickname+': '+body.content.slice(0,30),createdAt:now(),read:false});
    saveDB(); return { code: 0, msg: '发送成功', data: m };
  },
  // 会话列表
  async 'GET /api/conversations'(req, res) {
    const me = authUser(req); if (!me) return { code: 401, msg: '未登录' };
    const map = {};
    db.messages.forEach(m=>{
      if (m.fromId===me.id||m.toId===me.id) {
        const other = m.fromId===me.id?m.toId:m.fromId;
        if (!map[other] || map[other].createdAt<m.createdAt) map[other]={ otherId:other, last: m.content, createdAt: m.createdAt, unread: 0 };
      }
    });
    const list = Object.values(map).map(c=>{
      const u = db.users.find(x=>x.id===c.otherId); return { ...c, nickname: u?u.nickname:'未知', avatar: u?u.avatar:'' };
    }).sort((a,b)=>b.createdAt-a.createdAt);
    return { code: 0, data: list };
  },
  // 通知
  async 'GET /api/notifications'(req, res) {
    const me = authUser(req); if (!me) return { code: 401, msg: '未登录' };
    const list = db.notifications.filter(n=>n.userId===me.id).sort((a,b)=>b.createdAt-a.createdAt).map(n=>{
      const f = db.users.find(u=>u.id===n.fromId); return { ...n, fromNickname: f?f.nickname:'系统' };
    });
    return { code: 0, data: list };
  },
  // 开直播
  async 'POST /api/live'(req, res) {
    const me = authUser(req); if (!me) return { code: 401, msg: '未登录' };
    const body = JSON.parse(await readBody(req)||'{}');
    // 关闭其他进行中的直播
    db.lives.forEach(l=>{ if(l.userId===me.id) l.status='ended'; });
    const room = { id: db.lives.length?Math.max(...db.lives.map(x=>x.id))+1:1, userId: me.id, title: body.title||me.nickname+'的直播间', status:'live', createdAt: now() };
    db.lives.push(room); saveDB();
    return { code: 0, msg: '开播成功', data: room };
  },
  // 直播列表
  async 'GET /api/lives'(req, res) {
    const list = db.lives.filter(l=>l.status==='live').map(l=>{
      const u = db.users.find(x=>x.id===l.userId); return { ...l, nickname: u?u.nickname:'未知', avatar: u?u.avatar:'' };
    });
    return { code: 0, data: list };
  },
  // 结束直播
  async 'POST /api/live/end'(req, res) {
    const me = authUser(req); if (!me) return { code: 401, msg: '未登录' };
    db.lives.forEach(l=>{ if(l.userId===me.id) l.status='ended'; }); saveDB();
    return { code: 0, msg: '已结束直播' };
  },
  // 用户主页
  async 'GET /api/users/:id'(req, res, params) {
    const id = Number(params.id); const u = db.users.find(x=>x.id===id);
    if (!u) return { code: 404, msg: '用户不存在' };
    const { password, ...safe } = u;
    const videos = db.videos.filter(v=>v.userId===id).sort((a,b)=>b.createdAt-a.createdAt);
    const followers = db.follows.filter(f=>f.followingId===id).length;
    const following = db.follows.filter(f=>f.followerId===id).length;
    return { code: 0, data: { ...safe, videos, followers, following } };
  },
  // 用户列表（用于发消息选人）
  async 'GET /api/users'(req, res) {
    const list = db.users.map(u=>({ id:u.id, nickname:u.nickname, avatar:u.avatar }));
    return { code: 0, data: list };
  },
};

// ========== HTTP 服务器 ==========
const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  const pathname = parsed.pathname;
  // API
  if (pathname.startsWith('/api/')) {
    let handler = null, params = {};
    let key = req.method + ' ' + pathname;
    if (API[key]) { handler = API[key]; }
    else {
      // 带参数的路由
      for (const k of Object.keys(API)) {
        const [m, p] = k.split(' ');
        if (m !== req.method) continue;
        const parts = p.split('/'); const reqParts = pathname.split('/');
        if (parts.length !== reqParts.length) continue;
        let ok = true, pm = {};
        for (let i=0;i<parts.length;i++) { if (parts[i].startsWith(':')) pm[parts[i].slice(1)]=reqParts[i]; else if (parts[i]!==reqParts[i]) { ok=false; break; } }
        if (ok) { handler = API[k]; params = pm; break; }
      }
    }
    if (handler) {
      try { const result = await handler(req, res, params); res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(result)); }
      catch (e) { res.writeHead(500,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({code:500,msg:e.message})); }
    } else { res.writeHead(404,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({code:404,msg:'接口不存在'})); }
    return;
  }
  // 静态文件
  let fp = pathname === '/' ? '/index.html' : pathname;
  const full = path.join(__dirname, 'public', fp);
  if (!full.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': getMime(path.extname(full)) + '; charset=utf-8' });
    res.end(data);
  });
});

const PORT = process.env.PORT || 3000;
if (!process.env.NO_LISTEN) {
server.listen(PORT, () => {
  console.log('========================================');
  console.log('  🎬 MyVideoApp 短视频社交平台');
  console.log('  访问: http://localhost:' + PORT);
  console.log('  演示账号: demo / 123456');
  console.log('========================================');
});
} // end NO_LISTEN
