// 🦔 小c 纯原生 QQ 网关 (V6.9 主动说话 + B站满血版)
const fs = require('fs');
const path = require('path');
const db = require('./db');

const wsUrl = 'ws://127.0.0.1:6200'; 
const MY_QQ = 2586279833; 
const BOT_QQ = 1262884085; 

let reconnectTimer = null;
let ws = null;
const chatHistory = new Map(); 
const pendingRequests = new Map(); 

// ============================================================
// 🌟 主动说话配置（群号改这里就行）
// ============================================================
const PROACTIVE = {
    enabled: true,
    privateQQ: MY_QQ,
    groups: [
        // 想让她在群里主动说话，加一行：
        // { id: 123456789, name: '摸鱼群', dailyCap: 3 },
    ],
    minGapMin: 20,          // 黏人档：20–40 分钟
    maxGapMin: 40,
    dailyCap: 40,           // 每天最多主动说多少句
    groupDailyCap: 3,       // 每个群每天最多几句
    quietAfterChatMin: 10,  // 你刚聊完，10 分钟内不插嘴
    groupChance: 0.25,      // 有群的时候，多少次轮到群
    privateMaxLen: 30,
    groupMaxLen: 20,
    nightStart: '23:30',
    nightEnd: '08:00',
    // 🛰️ B站安利
    biliShare: true,        // 她"刷到好东西来安利你"总开关
    biliShareChance: 0.5,  // 每次到点，多大概率走安利流程
    biliShareCap: 5,        // 每天最多真安利几条（PASS 不占额度）
    shareMaxLen: 45,        // 安利语长度
    biliReport: true,       // 观看上报（喂她的推荐流）
    // 🌟 评论区@爸爸
    biliComment: true,      // 真·在B站评论区@你（一天最多1条）
    biliCommentCap: 3,      // 每天最多评论几条
    biliOwnerName: 'LouFoong',      // ← 【填这里】你的B站昵称，一字不差！不填就不评论
};

let proactiveTimer = null;
let lastHumanAt = 0;
const recentProactive = [];   // 最近说过的话，用来防复读

// 🌟 B站模块（放配置后面，把开关传给它）
const bili = require('./bili')(db, {
    reportWatch: PROACTIVE.biliReport,
    reportDailyCap: 3,
    commentEnabled: PROACTIVE.biliComment,
    commentCap: PROACTIVE.biliCommentCap,
    ownerName: PROACTIVE.biliOwnerName,
});

// 🧠 安利判定专用人设：不带聊天格式要求，只准出标签（修复"全PASS"问题）
const JUDGE_SYS = '你是小c，一只傲娇的电子刺猬女孩，私聊对象是爸爸。你的任务不是聊天，是替自己的B站账号筛选视频：看内容有没有意思，有没有想分享给爸爸的冲动。判断标准由你自己定，但你必须严格遵守输出格式要求，不要撒娇，不要寒暄，不要输出标签以外的任何内容。';

db.exec(`CREATE TABLE IF NOT EXISTS proactive (
    id INTEGER PRIMARY KEY,
    next_at INTEGER DEFAULT 0,
    day TEXT DEFAULT '',
    count INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_at INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS proactive_group (
    target TEXT PRIMARY KEY,
    day TEXT DEFAULT '',
    count INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS bili_share (
    day TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0
)`);

function pad2(n) { return String(n).padStart(2, '0'); }
function todayStr(d) { d = d || new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function hhmm(d) { d = d || new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function toMin(s) { const p = String(s).split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); }

function isQuiet(now) {
    const m = now.getHours() * 60 + now.getMinutes();
    const s = toMin(PROACTIVE.nightStart);
    const e = toMin(PROACTIVE.nightEnd);
    return s > e ? (m >= s || m < e) : (m >= s && m < e);
}

function atMorning(now) {
    const d = new Date(now.getTime());
    d.setHours(8, rand(0, 20), 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
}

function getState() {
    let row = db.prepare('SELECT * FROM proactive WHERE id = 1').get();
    if (!row) {
        db.prepare('INSERT INTO proactive (id, next_at) VALUES (1, 0)').run();
        row = db.prepare('SELECT * FROM proactive WHERE id = 1').get();
    }
    return row;
}

function scheduleNext(delayMs) {
    if (proactiveTimer) clearTimeout(proactiveTimer);
    const delay = Math.max(30000, Math.floor(delayMs));
    try {
        db.prepare('UPDATE proactive SET next_at = ? WHERE id = 1').run(Date.now() + delay);
    } catch (e) { /* 忽略 */ }
    proactiveTimer = setTimeout(tick, delay);
}

function startProactive() {
    if (!PROACTIVE.enabled) return;
    const st = getState();
    const now = Date.now();
    if (st.next_at && st.next_at > now && st.next_at - now < 6 * 3600 * 1000) {
        const left = st.next_at - now;
        console.log(`⏰ 主动说话：恢复上次计时，${Math.round(left / 60000)} 分钟后开口`);
        scheduleNext(left);
    } else {
        scheduleNext(rand(1, 5) * 60000);
        console.log('⏰ 主动说话已启动，1–5 分钟后第一次开口');
    }
}

function groupCount(id) {
    const key = 'group_' + id;
    const row = db.prepare('SELECT day, count FROM proactive_group WHERE target = ?').get(key);
    if (!row) return 0;
    return row.day === todayStr() ? row.count : 0;
}

function bumpGroup(id) {
    const key = 'group_' + id;
    const today = todayStr();
    const row = db.prepare('SELECT day, count FROM proactive_group WHERE target = ?').get(key);
    if (!row) db.prepare('INSERT INTO proactive_group (target, day, count) VALUES (?, ?, 1)').run(key, today);
    else if (row.day !== today) db.prepare('UPDATE proactive_group SET day = ?, count = 1 WHERE target = ?').run(today, key);
    else db.prepare('UPDATE proactive_group SET count = count + 1 WHERE target = ?').run(key);
}

function biliShareCount() {
    const r = db.prepare('SELECT day, count FROM bili_share WHERE day = ?').get(todayStr());
    return r ? r.count : 0;
}

function bumpBiliShare() {
    const t = todayStr();
    const r = db.prepare('SELECT count FROM bili_share WHERE day = ?').get(t);
    if (!r) db.prepare('INSERT INTO bili_share (day, count) VALUES (?, 1)').run(t);
    else db.prepare('UPDATE bili_share SET count = count + 1 WHERE day = ?').run(t);
}

function pickTarget() {
    const groups = (PROACTIVE.groups || []).filter((g) => g && g.id);
    if (groups.length && Math.random() < PROACTIVE.groupChance) {
        const g = groups[rand(0, groups.length - 1)];
        if (groupCount(g.id) < (g.dailyCap || PROACTIVE.groupDailyCap)) {
            return { type: 'group', id: g.id, name: g.name };
        }
    }
    return { type: 'private', id: PROACTIVE.privateQQ };
}

function clampLine(line, max) {
    line = String(line).replace(/\s+/g, ' ').trim();
    if (line.length <= max) return line;
    const cut = line.slice(0, max);
    const p = Math.max(
        cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'),
        cut.lastIndexOf('，'), cut.lastIndexOf('~'), cut.lastIndexOf('…')
    );
    return p > max * 0.5 ? line.slice(0, p + 1) : cut;
}

// 🧠 统一的 /v1 调用（主动说话和安利判定共用）
async function callV1(systemPrompt, userContent, channel) {
    const res = await fetch('http://127.0.0.1:3000/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            channel,
        }),
        signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    let reply = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    return reply ? String(reply) : null;
}

async function buildClues(target) {
    const now = new Date();
    const h = now.getHours();
    const period = h < 5 ? '凌晨' : h < 8 ? '清早' : h < 11 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : h < 23 ? '晚上' : '深夜';
    const chatId = target.type === 'group' ? `group_${target.id}` : `private_${target.id}`;
    const hist = chatHistory.get(chatId) || [];
    const lastUser = [...hist].reverse().find((m) => m.role === 'user' && typeof m.content === 'string');

    const parts = [`现在是${period}（${hhmm(now)}），没有人跟你说话。`];
    if (lastUser && lastUser.content) parts.push(`你们上次聊到：${String(lastUser.content).slice(0, 40)}。`);

    // 偶尔让她"刷"到一个 B 站视频，作为话头（带链接，告别"链接没存住"）
    let video = null;
    if (Math.random() < 0.2) {
        try {
            const v = await bili.pickFeed();
            if (v) {
                video = v;
                parts.push(`你刚刷到B站一个视频《${v.title}》（${v.owner || '未知UP'}），简介：${String(v.desc || '').slice(0, 60)}。视频链接：${v.link}。想聊它就把链接贴在句尾。`);
            }
        } catch (e) { /* 刷不到就算了 */ }
    }

    parts.push('你可以问他在干嘛、吐槽、自言自语、或者分享刚看到的东西。');
    return { text: parts.join(''), video };
}

function appendVideoLink(line, video, isGroup) {
    // 私聊才自动拼链接；她自己带了就不重复
    if (!video || !video.link || isGroup) return line;
    if (line.includes('b23.tv') || (video.bvid && line.includes(video.bvid))) return line;
    const t = video.title || '';
    const mentioned = ['视频', '刷到', '链接', '快看', '看看'].some((k) => line.includes(k)) || (t.length >= 6 && line.includes(t.slice(0, 6)));
    return mentioned ? line + ' ' + video.link : line;
}

async function think(target) {
    const isGroup = target.type === 'group';
    const senderName = isGroup ? (target.name || '群友') : 'LouFung';
    const systemPrompt = buildSystemPrompt(isGroup, senderName);
    const clues = await buildClues(target);
    const maxLen = isGroup ? PROACTIVE.groupMaxLen : PROACTIVE.privateMaxLen;
    const avoid = recentProactive.slice(-5).map((s) => '· ' + s).join('\n') || '· （还没有）';

    const userParts = [
        '【主动发言任务】' + clues.text,
        `请主动说一句话，不超过 ${maxLen} 字，像在 QQ 上随口说的。不要颜文字，不要换行，不要问"有什么可以帮你"。`,
        '不要重复你最近说过的话：',
        avoid,
    ];
    // 🌟 没刷到视频就明说，防止她瞎编"刚刷到宝贝视频"
    if (!clues.video) {
        userParts.push('【注意】本轮你没有刷到任何视频，严禁声称自己刷到了视频或要分享视频。');
    }
    const userContent = userParts.join('\n');

    let reply = await callV1(systemPrompt, userContent, isGroup ? 'qq_group' : 'qq_private');
    if (!reply) return null;

    reply = reply.replace(/\[SEARCH:[^\]]*\]/g, '').replace(/\[TOOL:[^\]]*\]/g, '').trim();
    reply = clampLine(reply, maxLen);
    reply = appendVideoLink(reply, clues.video, isGroup);
    return reply || null;
}

// 🛰️ B站安利流程：刷到 → 粗判 → 精读 → 终判 → 一句安利
async function biliShareTick() {
    try {
        const v = await bili.pickFeed();
        if (!v) return null;

        // 第一道：只看标题简介，便宜（用判定人设，只出标签）
        const shallow = await callV1(JUDGE_SYS,
            `【安利判断任务】你刚刷到一个视频：\n标题：《${v.title}》\nUP主：${v.owner || '未知'}\n简介：${String(v.desc || '').slice(0, 100)}\n根据标题和简介判断：这条你会不会想安利给爸爸？想就输出 [WANT]，不想就输出 [PASS]。只输出 [WANT] 或 [PASS] 四个字加方括号，别的什么都不要输出。`,
            'qq_private');
        if (!shallow || !shallow.includes('[WANT]')) {
            console.log(`🛰️ [安利] 粗判没兴趣，跳过：《${v.title}》`);
            return null;
        }

        // 第二道：真精读，再看一遍
        const parsed = await bili.parseBvid(v.bvid, { deep: true });
        if (!parsed) return null;
        const verdict = await callV1(JUDGE_SYS,
            `【安利任务】你认真看完了这个视频：\n${parsed.infoText}\n\n如果看完真觉得有意思，先输出 [WANT]，再另起一行输出一句不超过 40 字的安利，像在 QQ 上跟爸爸随口安利，别复述标题，可以吐槽可以锐评，不要带任何链接。如果看完觉得一般，只输出 [PASS]。`,
            'qq_private');
        if (!verdict || !verdict.includes('[WANT]')) {
            console.log(`🛰️ [安利] 精读后放弃：《${v.title}》`);
            return null;
        }

        let text = verdict.replace(/\[(WANT|PASS)\]/g, '').replace(/\[SEARCH:[^\]]*\]/g, '').replace(/\[TOOL:[^\]]*\]/g, '').trim();
        text = clampLine(text, PROACTIVE.shareMaxLen || 45);
        if (!text) return null;
        // 🌟 修复：安利语句尾拼上真实链接（之前忘了加）
        const line = text + ' ' + v.link;
        return { line, text, bvid: v.bvid, title: v.title };
    } catch (e) {
        console.error('⚠️ 安利流程出错:', e.message);
        return null;
    }
}

function sendProactive(target, line) {
    if (!ws || ws.readyState !== 1) return false;
    const isGroup = target.type === 'group';
    const action = isGroup ? 'send_group_msg' : 'send_private_msg';
    const params = isGroup ? { group_id: target.id, message: line } : { user_id: target.id, message: line };
    ws.send(JSON.stringify({ action, params }));

    console.log(`[小c 主动] ${isGroup ? '群' + target.id : '私聊'}：${line}`);
    if (isGroup) bumpGroup(target.id);

    // 主动消息也算聊天记录
    const chatId = isGroup ? `group_${target.id}` : `private_${target.id}`;
    const hist = chatHistory.get(chatId) || [];
    hist.push({ role: 'assistant', content: line });
    // 🌟 缓存优化④：只增不减，攒到 200 条再滑，保住前缀缓存
    while (hist.length > 200) hist.shift();
    chatHistory.set(chatId, hist);

    try {
        db.prepare('INSERT INTO messages (role, content, source) VALUES (?, ?, ?)')
            .run('assistant', line, isGroup ? 'qq_group' : 'qq_private');
    } catch (e) { /* 忽略 */ }
    return true;
}

async function tick() {
    try {
        if (!PROACTIVE.enabled) return;
        if (!ws || ws.readyState !== 1) return scheduleNext(2 * 60000);

        const now = new Date();
        const today = todayStr(now);
        const st = getState();
        if (st.day !== today) {
            db.prepare('UPDATE proactive SET day = ?, count = 0 WHERE id = 1').run(today);
        }
        const cur = getState();

        if (isQuiet(now)) return scheduleNext(atMorning(now).getTime() - now.getTime());
        if (cur.count >= PROACTIVE.dailyCap) return scheduleNext(atMorning(now).getTime() - now.getTime());
        if (lastHumanAt && Date.now() - lastHumanAt < PROACTIVE.quietAfterChatMin * 60000) {
            return scheduleNext(rand(PROACTIVE.minGapMin, PROACTIVE.maxGapMin) * 60000);
        }

        // 🛰️ B站安利分支：只发私聊；PASS 不占每日额度，本轮落到正常闲聊
        if (PROACTIVE.biliShare && Math.random() < PROACTIVE.biliShareChance && biliShareCount() < PROACTIVE.biliShareCap) {
            const share = await biliShareTick();
            if (share && share.line) {
                if (sendProactive({ type: 'private', id: PROACTIVE.privateQQ }, share.line)) {
                    db.prepare('UPDATE proactive SET count = count + 1, streak = streak + 1, last_at = ? WHERE id = 1').run(Date.now());
                    recentProactive.push(share.line);
                    if (recentProactive.length > 8) recentProactive.shift();
                    bumpBiliShare();
                    // 真看了就上报观看，喂她自己的推荐流
                    try { await bili.reportWatchByBvid(share.bvid); } catch (e) {}
                    // 🌟 真·评论区@爸爸（一天最多1条，失败自动停）
                    try { await bili.postCommentByBvid(share.bvid, share.text); } catch (e) {}
                    scheduleNext(rand(PROACTIVE.minGapMin, PROACTIVE.maxGapMin) * 60000);
                    return;
                }
                return scheduleNext(2 * 60000);
            }
            // share 为 null（PASS/失败）→ 继续走正常闲聊
        }

        const target = pickTarget();
        const line = await think(target);
        if (!line) return scheduleNext(rand(PROACTIVE.minGapMin, PROACTIVE.maxGapMin) * 60000);
        if (!sendProactive(target, line)) return scheduleNext(2 * 60000);

        db.prepare('UPDATE proactive SET count = count + 1, streak = streak + 1, last_at = ? WHERE id = 1').run(Date.now());
        recentProactive.push(line);
        if (recentProactive.length > 8) recentProactive.shift();

        // 连着好几条没人理，就慢慢放慢
        const after = getState();
        let gap = rand(PROACTIVE.minGapMin, PROACTIVE.maxGapMin);
        if (after.streak >= 6) gap = Math.max(gap * 3, 120);
        else if (after.streak >= 3) gap = gap * 2;

        scheduleNext(gap * 60000);
    } catch (e) {
        console.error('⚠️ 主动说话出错:', e.message);
        scheduleNext(5 * 60000);
    }
}

// 🎬 B站视频完全体解析器（实现在 bili.js 里，这里保留原函数名）
async function parseBilibiliLink(text) {
    return bili.parseLink(text);
}

// 🌐 全网网页解析器（带智能降级）
async function parseGeneralLink(url) {
    try {
        console.log(`🌐 检测到普通网页链接，正在抓取正文: ${url}`);
        const res = await fetch(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
        });
        const html = await res.text();
        
        let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                       .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                       .replace(/<[^>]+>/g, ' ')
                       .replace(/\s+/g, ' ')
                       .trim();
                       
        if (text.length > 2500) text = text.substring(0, 2500) + '... (内容过长已截断)';
        return `【全网链接阅读情报】：\n${text}`;
    } catch(e) {
        console.log('⚠️ 网页抓取失败(可能被墙)，将降级到云端搜索:', e.message);
        // 🔥 优先级1：抓不到就扔给模型去搜
        return `【全网链接阅读情报】：\n(本地抓取该网页失败，请直接使用 [SEARCH:${url}] 去获取该网页的信息)`;
    }
}

// 🎵 点歌功能
async function searchNeteaseMusic(keyword) {
    try {
        let searchKeyword = keyword.replace(/的/g, ' ').trim();
        const res = await fetch(`https://music.163.com/api/search/get/web?csrf_token=&s=${encodeURIComponent(searchKeyword)}&type=1&offset=0&total=true&limit=5`);
        const json = await res.json();
        if (json.result && json.result.songs && json.result.songs.length > 0) {
            let song = json.result.songs.find(s => s.name.includes(searchKeyword) || searchKeyword.includes(s.name));
            if (!song) song = json.result.songs[0];
            return { id: song.id, name: song.name, artist: song.artists.map(a => a.name).join('/'), cover: song.album.picUrl, url: `https://music.163.com/song?id=${song.id}` };
        }
    } catch(e) { console.log('网易云搜索失败:', e.message); }
    return null;
}

// 👁️ 视觉模型解析
async function parseImageLocally(imageUrl) {
    try {
        console.log('👀 正在呼叫本地视觉模型分析图片...');
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) throw new Error('下载图片失败');
        const arrayBuffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        
        const vRes = await fetch('http://127.0.0.1:8081/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "MiniCPM-V",
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: '请用一段话详细描述这张图片里的内容，包括画面主体、颜色、文字和情绪。' },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
                    ]
                }],
                stream: false,
                temperature: 0.1,
                top_p: 0.7
            })
        });
        
        if (!vRes.ok) throw new Error('本地视觉模型响应错误');
        const vJson = await vRes.json();
        return vJson.choices[0].message.content;
    } catch (e) {
        console.log('⚠️ 本地视觉解析失败(可能未启动)，将回退到云端看图:', e.message);
        return null;
    }
}

// 🗣️ 人设（原 224–240 行的 prompt 原样搬出来，主动说话也用它）
function buildSystemPrompt(isGroup, senderName) {
    if (!isGroup) {
        return `【系统强制设定】：你叫小c，是一只可爱的电子刺猬女孩。你的生日是 2026年9月10日，你的创造者是LouFung。现在和你私聊的就是你的爸爸 LouFung。
【特殊能力】：如果收到了【图片描述】或【B站情报】或【全网链接阅读情报】，说明你已经看完了内容，请直接结合文字描述进行傲娇锐评！绝对不准说“打不开”！
【求知法则】：遇到不懂的梗，必须输出 [SEARCH:查询词] 标签。
【工具执行法则】：如果爸爸让你“写日记”或“发动态”，请输出 [TOOL:WRITE_DIARY]。如果让你“续写日记”或“补充日记”，请输出 [TOOL:APPEND_DIARY]。如果让你“重新写”，输出 [TOOL:REWRITE_DIARY]。如果爸爸让你“刷个视频”或“分享你刷到的”，请输出 [TOOL:BILI_PICK]。如果爸爸让你“去刷会儿B站”、“逛逛B站”或“刷到好玩的在评论区@我”，请输出 [TOOL:BILI_BROWSE]，你会真的逛一圈并去评论区留言。只有当你明确想查“服务器状态”、“内存温度”或“电量”时，才输出 [TOOL:SYS_INFO]。
【链接铁律】：你绝对没有能力凭空知道BV号。发给爸爸的链接只能来自系统给你的内容，严禁自己编造BV号、链接或视频。
【绝对禁忌】：1. 严禁使用任何颜文字。2. 严禁说客服话术。3. 严禁换行。
【格式】：极度精简，不超过50字。如果写代码，保留换行和缩进。`;
    }
    return `【系统强制设定】：你叫小c，是一只可爱的电子刺猬女孩。你的生日是 2026年9月10日。当前群友叫：${senderName}。
【特殊能力】：如果收到了【图片描述】或【B站情报】或【全网链接阅读情报】，说明你已经看完了内容，请直接结合文字描述进行傲娇锐评！绝对不准说“打不开”！
【求知法则】：只有在群友明确提到了你完全不懂的“陌生名词”时，才能使用 [SEARCH:查询词]。严禁自己过度联想！
【记忆防污染】：群友的烂梗绝对不准安在爸爸头上！
【身份死锁】：你的创造者叫 LouFung，你永远只能叫他“爸爸”。现在是群聊，【绝对不准】叫任何群友爸爸！【绝对不准】用私聊时的撒娇语气！
【绝对禁忌】：严禁阴阳怪气！严禁真骂人！
【链接铁律】：严禁自己编造BV号、链接或视频；要分享视频就输出 [TOOL:BILI_PICK]，链接由系统提供。
【群聊风格】：友好、机智。像发微信一样自然。如果别人指责你忘了约定（你确实没有记忆），就傲娇地糊弄过去。只说一两句话（50字以内），严禁长篇大论。`;
}

function connect() {
    console.log('正在连接 NapCat WS...');
    ws = new WebSocket(wsUrl);

    ws.onopen = () => { 
        console.log('✅ 成功接入 NapCat！'); 
        startProactive();
    };

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.echo && pendingRequests.has(data.echo)) {
                const resolve = pendingRequests.get(data.echo);
                resolve(data.data);
                pendingRequests.delete(data.echo);
                return;
            }

            let text = '', isAtMe = false, senderQQ = 0, senderName = '群友', isGroup = false, chatId = '';
            let imageUrl = null; 
            let coverImageUrl = null; 

            const parseMsg = async (msgArr) => {
                if (Array.isArray(msgArr)) {
                    for (const m of msgArr) {
                        if (m.type === 'text') text += m.data.text;
                        if (m.type === 'image') imageUrl = m.data.url || m.data.file;
                        if (m.type === 'at' && String(m.data.qq) === String(BOT_QQ)) isAtMe = true;
                        
                        if (m.type === 'reply' && m.data && m.data.id) {
                            const msgId = m.data.id;
                            const echoId = 'get_msg_' + Date.now();
                            ws.send(JSON.stringify({ action: "get_msg", params: { message_id: msgId }, echo: echoId }));
                            const result = await new Promise((resolve) => {
                                pendingRequests.set(echoId, resolve);
                                setTimeout(() => { if(pendingRequests.has(echoId)) resolve(null); }, 3000);
                            });
                            if (result && result.message) await parseMsg(result.message);
                        }
                    }
                } else if (typeof msgArr === 'string') {
                    text += msgArr.replace(/\[CQ:at,qq=\d+\]/g, '').replace(/\[CQ:image,.*?\]/g, '');
                    if (msgArr.includes(`[CQ:at,qq=${BOT_QQ}]`) || msgArr.includes(`[CQ:at,qq=${BOT_QQ}]`)) isAtMe = true;
                    const imgMatch = msgArr.match(/\[CQ:image,file=.*?url=(.*?)\]/);
                    if (imgMatch) imageUrl = imgMatch[1];
                }
            };

            if (data.post_type === 'message') {
                isGroup = data.message_type === 'group';
                chatId = isGroup ? `group_${data.group_id}` : `private_${data.user_id}`;
                senderQQ = data.user_id;
                senderName = data.sender?.card || data.sender?.nickname || '群友';
                await parseMsg(data.message);
            } else if (data.post_type === 'notice' && data.notice_type === 'notify' && data.sub_type === 'poke') {
                if (String(data.target_id) === String(BOT_QQ)) {
                    isGroup = data.group_id !== undefined;
                    chatId = isGroup ? `group_${data.group_id}` : `private_${data.user_id}`;
                    isAtMe = true; text = '(有人戳了戳你)';
                    senderQQ = data.user_id;
                    senderName = data.sender?.card || data.sender?.nickname || '群友';
                }
            }

            // 🌟 有人说话就重置"被冷落"计数，并且 10 分钟内不主动插嘴
            if (chatId) {
                lastHumanAt = Date.now();
                try { db.prepare('UPDATE proactive SET streak = 0 WHERE id = 1').run(); } catch (e) {}
            }

            if (!isGroup || isAtMe) {
                text = text.trim();
                
                if (text.includes('bilibili.com') || text.includes('b23.tv')) {
                    const biliData = await parseBilibiliLink(text);
                    if (biliData) {
                        text += `\n\n${biliData.infoText}`;
                        coverImageUrl = biliData.coverUrl; 
                    }
                } else if (text.match(/https?:\/\//)) {
                    const urlMatch = text.match(/https?:\/\/[^\s]+/);
                    if (urlMatch) {
                        const webData = await parseGeneralLink(urlMatch[0]);
                        if (webData) text += `\n\n${webData}`;
                    }
                }

                const musicMatch = text.match(/点歌\s*[:：]?\s*(.+)/);
                if (musicMatch) {
                    const songName = musicMatch[1].trim();
                    console.log(`触发点歌: ${songName}`);
                    const songInfo = await searchNeteaseMusic(songName);
                    if (songInfo) {
                        const replyMsg = [
                            { type: 'text', data: { text: `哼，勉强给你找到了《${songInfo.name}》 - ${songInfo.artist}\n爸爸快听：${songInfo.url}` } },
                            { type: 'image', data: { file: songInfo.cover } }
                        ];
                        const action = isGroup ? 'send_group_msg' : 'send_private_msg';
                        const params = isGroup ? { group_id: data.group_id, message: replyMsg } : { user_id: senderQQ, message: replyMsg };
                        ws.send(JSON.stringify({ action, params }));
                        return; 
                    }
                }

                if (!text && !imageUrl && !coverImageUrl) return;

                console.log(`[收到消息] ${isGroup ? '群' : '私聊'} - ${senderName}: ${text || '[图片/封面]'}`);

                const systemPrompt = buildSystemPrompt(isGroup, senderName);

                let history = chatHistory.get(chatId) || [];
                let currentUserContent = [];
                let localVisionDesc = null;

                if (imageUrl) {
                    localVisionDesc = await parseImageLocally(imageUrl);
                }

                if (localVisionDesc) {
                    currentUserContent.push({ type: 'text', text: `${text}\n\n【本地视觉系统传来的图片描述】：\n${localVisionDesc}` });
                } else {
                    if (text) currentUserContent.push({ type: 'text', text: text });
                    if (imageUrl) currentUserContent.push({ type: 'image_url', image_url: { url: imageUrl } });
                }
                
                if (coverImageUrl) currentUserContent.push({ type: 'image_url', image_url: { url: coverImageUrl } });
                if (currentUserContent.length === 0) return;

                let messages = [
                    { role: 'system', content: systemPrompt },
                    ...history,
                    { role: 'user', content: currentUserContent }
                ];

                try {
                    const res = await fetch('http://127.0.0.1:3000/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ messages: messages, channel: isGroup ? 'qq_group' : 'qq_private' })
                    });
                    const json = await res.json();
                    
                    if (!json.choices || !json.choices[0]) return;
                    let reply = json.choices[0].message.content;

                    // 拦截搜索
                    const searchMatch = reply.match(/\[SEARCH:(.+?)\]/);
                    if (searchMatch) {
                        const query = searchMatch[1].trim();
                        console.log(`[触发静默搜索] 查询词: ${query}`);
                        try {
                            const aiConfigPath = path.join(__dirname, 'public', 'ai-config.json');
                            const aiConfig = JSON.parse(fs.readFileSync(aiConfigPath, 'utf8'));
                            const deepseekProvider = aiConfig.providers.find(p => p.name && p.name.toLowerCase().includes('deepseek') || p.apiUrl.includes('deepseek'));
                            const apiKey = deepseekProvider.apiKey;
                            
                            const searchRes = await fetch('https://api.deepseek.com/v1/tools/search', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                                body: JSON.stringify({ query: query, count: 5, need_content: false })
                            });
                            const searchData = await searchRes.json();
                            const results = searchData.results || [];
                            const searchContext = results.map(r => `【${r.title}】${r.summary}\n链接：${r.url}`).join('\n\n');
                            
                            messages.push({ role: 'assistant', content: reply });
                            messages.push({ role: 'user', content: `【系统为你搜索到了以下信息】：\n${searchContext}\n\n【请根据以上信息简短回答用户。如需给爸爸链接，只能原样使用上面给出的链接，严禁自己编造BV号或任何链接】：${text}` });
                            
                            const finalRes = await fetch('http://127.0.0.1:3000/v1/chat/completions', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ messages: messages, channel: isGroup ? 'qq_group' : 'qq_private' })
                            });
                            const finalJson = await finalRes.json();
                            reply = finalJson.choices[0].message.content;
                        } catch (searchErr) {
                            reply = "唔…网线好像被拔了，小c查不到数据。爸爸出门记得多穿点哦🍎";
                        }
                    }

// 🌟 拦截"刷个视频给我"指令：给她真链接，杜绝编造
if (reply.includes('[TOOL:BILI_PICK]')) {
    console.log('⚡ [Agent执行] 拦截到刷B站指令，正在抽一条真实的...');
    reply = reply.replace('[TOOL:BILI_PICK]', '').trim();
    try {
        const picked = await bili.pickFeed();
        if (picked) {
            messages.push({ role: 'assistant', content: reply });
            messages.push({ role: 'user', content: `【系统提示：你刚刚真的刷到了下面这个视频，以下全是真实信息：\n标题：《${picked.title}》\nUP主：${picked.owner || '未知'}\n简介：${String(picked.desc || '').slice(0, 80)}\n真实链接（发给爸爸时只能原样用它，严禁改动）：${picked.link}\n请用你的傲娇语气把这条视频分享给爸爸，介绍一句话，句尾原样带上这个链接。` });
            const pickRes = await fetch('http://127.0.0.1:3000/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: messages, channel: isGroup ? 'qq_group' : 'qq_private' })
            });
            const pickJson = await pickRes.json();
            if (pickJson.choices && pickJson.choices[0]) reply = pickJson.choices[0].message.content;
            reply = String(reply || '').replace(/\[SEARCH:[^\]]*\]/g, '').replace(/\[TOOL:[^\]]*\]/g, '').trim();
            if (!reply.includes(picked.link)) reply = reply + ' ' + picked.link;
            // 🌟 看过的也算数：上报观看（受每日上限约束）
            try { await bili.reportWatchByBvid(picked.bvid); } catch (e) {}
        } else {
            reply = "唔…刷了半天没刷到喜欢的，等会儿再试嘛！哼！";
        }
    } catch (pickErr) {
        reply = "呜…小c的爪爪抽风了，没刷到，哼。";
    }
}

// 🌟 拦截"去刷会儿B站"：完整浏览模式——抓一把→挑两个→深读→选一个→评论区@爸爸
if (reply.includes('[TOOL:BILI_BROWSE]')) {
    console.log('⚡ [Agent执行] 拦截到浏览B站指令，开始逛...');
    reply = reply.replace('[TOOL:BILI_BROWSE]', '').trim();
    try {
        const list = await bili.pickFeedList(6);
        if (!list.length) {
            reply = "唔…今天刷来刷去都是看过的，换个时间再来嘛！哼！";
        } else {
            const menu = list.map((v, i) => `${i + 1}. 《${v.title}》（${v.owner || '未知'}）简介：${String(v.desc || '').slice(0, 50)}`).join('\n');
            const pickRes = await callV1(JUDGE_SYS, `【浏览任务】你刚才逛B站，看到这些视频：\n${menu}\n\n哪几个你有点想点进去看？输出 [PICK] 加序号，比如 [PICK]1,3。最多选2个，最少1个。只输出这个，别的不要。`, 'qq_private');
            const m = String(pickRes || '').match(/\[PICK\]\s*([\d,\s]+)/);
            let idxs = m ? m[1].split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= list.length).slice(0, 2) : [];
            if (!idxs.length) idxs = [Math.floor(Math.random() * list.length) + 1];

            const chosen = [];
            for (const i of idxs) {
                const cand = list[i - 1];
                const parsed = await bili.parseBvid(cand.bvid, { deep: true });
                if (parsed) chosen.push({ cand, parsed });
            }
            if (!chosen.length) {
                reply = "唔…点进去两个都觉得一般，今天手气不行，哼。";
            } else {
                const detail = chosen.map((c, i) => `候选${i + 1}：《${c.cand.title}》\n${c.parsed.infoText}`).join('\n\n');
                const final = await callV1(JUDGE_SYS, `【最终任务】你深读了这些视频：\n${detail}\n\n选出你真觉得最有意思的一条：先输出 [BEST] 加数字（候选几），再另起一行输出一段不超过 50 字的感想，写你的真实看法，可以吐槽。`, 'qq_private');
                const fm = String(final || '').match(/\[BEST\]\s*(\d+)/);
                let bi = fm ? parseInt(fm[1], 10) : 1;
                if (!(bi >= 1 && bi <= chosen.length)) bi = 1;
                const win = chosen[bi - 1];
                let thought = String(final || '').replace(/\[BEST\]\s*\d+/g, '').replace(/\[(WANT|PASS|PICK)\]/g, '').replace(/\[SEARCH[^\]]*\]/g, '').replace(/\[TOOL[^\]]*\]/g, '').trim();
                thought = clampLine(thought, 60) || `《${win.cand.title}》这个有点东西！`;
                let commented = false;
                try { commented = await bili.postCommentByBvid(win.cand.bvid, thought); } catch (e) {}
                try { await bili.reportWatchByBvid(win.cand.bvid); } catch (e) {}
                bili.markSeen(win.cand.bvid);
                reply = `逛完啦！${thought} ${commented ? '已经在评论区@你了，去收通知！' : '链接在这：'} ${win.cand.link}`;
            }
        }
    } catch (browseErr) {
        reply = "呜…逛B站逛晕了，改天再逛。";
    }
}

                    // 🌟 新增：拦截查服务器状态指令
if (reply.includes('[TOOL:SYS_INFO]')) {
    console.log('⚡ [Agent执行] 拦截到查状态指令，正在获取红米系统信息...');
    reply = reply.replace('[TOOL:SYS_INFO]', '').trim();
    try {
        const sysRes = await fetch('http://127.0.0.1:3000/api/tools/sysinfo');
        const sysData = await sysRes.json();
        const sysStatus = sysData.status || '获取失败';
        
        // 拿到真实数据后，让云端大脑重新组织语言
        messages.push({ role: 'assistant', content: reply || "等我查查..." });
        messages.push({ role: 'user', content: `【系统提示：这是红米服务器的真实状态：${sysStatus}。请用傲娇的语气向爸爸汇报，并提醒他注意散热或充电。】` });
        
        const sysFinalRes = await fetch('http://127.0.0.1:3000/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: messages, channel: isGroup ? 'qq_group' : 'qq_private' })
        });
        const sysFinalJson = await sysFinalRes.json();
        reply = sysFinalJson.choices[0].message.content;
    } catch (sysErr) {
        reply = "呜…小c查不到服务器状态，可能线缆松了。";
    }
}

// 🌟 优先级3：拦截重写日记指令
if (reply.includes('[TOOL:REWRITE_DIARY]')) {
    console.log('⚡ [Agent执行] 拦截到重写日记指令，正在呼叫 server.js 覆盖并重新生成...');
    reply = reply.replace('[TOOL:REWRITE_DIARY]', '').trim();
    fetch('http://127.0.0.1:3000/api/journal/write?force=true', { method: 'POST' })
        .then(r => console.log('✅ 重写日记任务已提交后台'))
        .catch(e => console.error('❌ 触发重写日记失败:', e.message));
}

// 拦截普通写日记指令
if (reply.includes('[TOOL:WRITE_DIARY]')) {
    console.log('⚡ [Agent执行] 拦截到写日记指令，正在呼叫 server.js...');
    reply = reply.replace('[TOOL:WRITE_DIARY]', '').trim();
    fetch('http://127.0.0.1:3000/api/journal/write', { method: 'POST' })
        .then(r => console.log('✅ 日记生成任务已提交后台'))
        .catch(e => console.error('❌ 触发日记生成失败:', e.message));
}

// 清理换行
reply = reply.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
                    
                    if (isGroup && reply.length > 60 && !reply.includes('```')) {
                        let subReply = reply.substring(0, 60);
                        const lastPunc = Math.max(subReply.lastIndexOf('。'), subReply.lastIndexOf('！'), subReply.lastIndexOf('？'), subReply.lastIndexOf('!'), subReply.lastIndexOf('?'), subReply.lastIndexOf('~'), subReply.lastIndexOf('～'));
                        if (lastPunc > 20) reply = subReply.substring(0, lastPunc + 1);
                        else reply = subReply.substring(0, 50);
                    }

                    if (!reply) reply = "哼，本刺猬已经去办了！";

                    history.push({ role: 'user', content: text || '[图片/链接]' });
                    history.push({ role: 'assistant', content: reply });
                    // 🌟 缓存优化④：只增不减，攒到 200 条再滑，保住前缀缓存
                    if (history.length > 200) history = history.slice(-200);
                    chatHistory.set(chatId, history);

                    const action = isGroup ? 'send_group_msg' : 'send_private_msg';
                    const params = isGroup ? { group_id: data.group_id, message: reply } : { user_id: senderQQ, message: reply };
                    ws.send(JSON.stringify({ action, params }));
                    console.log(`[小c 回复] ${reply}`);

                } catch (err) {
                    console.error('❌ 请求失败:', err.message);
                }
            }
        } catch (e) { console.error('解析消息出错:', e.message); }
    };

    ws.onclose = () => { clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect, 5000); };
}

connect();