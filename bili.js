// 🦔 小c 的 B 站模块：统一请求头 + wbi 签名 + 热评 / AI总结 / 字幕 / 推荐流
// 用法：const bili = require('./bili')(db);
// 登录态（可选）：同目录放 bili-cookie.json，内容可以是
//   {"SESSDATA":"...","bili_jct":"...","buvid3":"..."} 或一整个 cookie 字符串
// 不登录也能用：视频信息、热评、热门/排行；AI总结和字幕需要登录才有内容。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REFERER = 'https://www.bilibili.com/';
const COOKIE_PATH = path.join(__dirname, 'bili-cookie.json');

// WBI 混淆表（B 站公开算法）
const MIXIN_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function fmtDur(sec) {
    sec = Number(sec) || 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

module.exports = function createBili(db) {
    db.exec('CREATE TABLE IF NOT EXISTS bili_seen (bvid TEXT PRIMARY KEY, ts INTEGER)');

    let imgKey = '', subKey = '', wbiAt = 0;
    let buvid = '';
    let cookieCache = '';
    let cookieAt = 0;

    // ---------- cookie ----------
    function readCookieFile() {
        try {
            if (!fs.existsSync(COOKIE_PATH)) return '';
            const raw = fs.readFileSync(COOKIE_PATH, 'utf8').trim();
            if (!raw) return '';
            if (raw.startsWith('{')) {
                const j = JSON.parse(raw);
                return Object.keys(j).map((k) => `${k}=${j[k]}`).join('; ');
            }
            return raw;
        } catch (e) {
            console.log('⚠️ bili-cookie.json 读取失败:', e.message);
            return '';
        }
    }

    function cookie() {
        if (!cookieAt || Date.now() - cookieAt > 60000) {
            cookieCache = readCookieFile();
            cookieAt = Date.now();
        }
        return cookieCache;
    }

    function headers() {
        const h = {
            'User-Agent': UA,
            'Referer': REFERER,
            'Origin': 'https://www.bilibili.com',
        };
        const parts = [];
        const c = cookie();
        if (c) parts.push(c);
        if (buvid) parts.push('buvid3=' + buvid);
        if (parts.length) h.Cookie = parts.join('; ');
        return h;
    }

    // ---------- buvid3 / wbi ----------
    async function ensureBuvid() {
        if (buvid || cookie().includes('buvid3')) return;
        try {
            const res = await fetch('https://www.bilibili.com/', {
                headers: { 'User-Agent': UA },
                signal: AbortSignal.timeout(8000),
            });
            const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
            for (const line of list) {
                const m = line.match(/buvid3=([^;]+)/);
                if (m) { buvid = m[1]; break; }
            }
        } catch (e) { /* 拿不到就算了 */ }
    }

    async function refreshWbi(force) {
        if (!force && imgKey && subKey && Date.now() - wbiAt < 3600 * 1000) return true;
        try {
            await ensureBuvid();
            const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
                headers: headers(),
                signal: AbortSignal.timeout(8000),
            });
            const j = await res.json();
            const img = (j && j.data && j.data.wbi_img) || {};
            if (!img.img_url || !img.sub_url) return false;
            imgKey = img.img_url.split('/').pop().split('.')[0];
            subKey = img.sub_url.split('/').pop().split('.')[0];
            wbiAt = Date.now();
            return true;
        } catch (e) {
            return false;
        }
    }

    function signParams(params) {
        const wts = Math.round(Date.now() / 1000);
        const all = { ...params, wts };
        const query = Object.keys(all).sort().map((k) => {
            const v = String(all[k]).replace(/[!'()*]/g, '');
            return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
        }).join('&');
        const mixin = MIXIN_TAB.map((i) => (imgKey + subKey)[i] || '').join('').slice(0, 32);
        const w_rid = crypto.createHash('md5').update(query + mixin).digest('hex');
        return `${query}&w_rid=${w_rid}`;
    }

    async function getJson(url) {
        try {
            const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(10000) });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            return null;
        }
    }

    // ---------- 各个接口 ----------
    async function getView(bvid) {
        const j = await getJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
        return j && j.code === 0 ? j.data : null;
    }

    async function getReplies(aid) {
        const j = await getJson(`https://api.bilibili.com/x/v2/reply?type=1&oid=${aid}&sort=2&ps=10&pn=1`);
        if (!j || j.code !== 0 || !j.data || !Array.isArray(j.data.replies)) return [];
        return j.data.replies
            .map((r) => (r && r.content && r.content.message ? String(r.content.message).replace(/\s+/g, ' ') : ''))
            .filter(Boolean)
            .slice(0, 5);
    }

    async function getConclusion(bvid, cid, upMid) {
        if (!(await refreshWbi())) return '';
        const q = signParams({ bvid, cid, up_mid: upMid });
        const j = await getJson(`https://api.bilibili.com/x/web-interface/view/conclusion/get?${q}`);
        if (!j || j.code !== 0 || !j.data || !j.data.model_result) return '';
        const mr = j.data.model_result;
        let out = mr.summary || '';
        if (!out && Array.isArray(mr.outline)) {
            out = mr.outline.map((o) => `${o.title}：${(o.part_outline || []).map((p) => p.content).join('；')}`).join('\n');
        }
        return String(out || '').replace(/\s+/g, ' ').slice(0, 900);
    }

    async function getSubtitle(bvid, aid, cid) {
        if (!(await refreshWbi())) return '';
        const q = signParams({ bvid, cid, aid });
        const j = await getJson(`https://api.bilibili.com/x/player/wbi/v2?${q}`);
        const subs = j && j.data && j.data.subtitle && j.data.subtitle.subtitles;
        if (!Array.isArray(subs) || !subs.length) return '';
        let url = '';
        for (const s of subs) {
            if (s && s.subtitle_url) { url = s.subtitle_url; break; }
        }
        if (!url) return '';
        const full = url.startsWith('//') ? 'https:' + url : url;
        const s = await getJson(full);
        if (!s || !Array.isArray(s.body)) return '';
        return s.body.map((x) => x.content).join('').slice(0, 1200);
    }

    async function getDanmaku(cid) {
        try {
            const res = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`, {
                headers: headers(),
                signal: AbortSignal.timeout(10000),
            });
            const txt = await res.text();
            const list = txt.match(/<d p="[^"]*">([^<]*)<\/d>/g) || [];
            return list.slice(0, 20).map((d) => d.replace(/<[^>]+>/g, '')).filter(Boolean);
        } catch (e) {
            return [];
        }
    }

    // ---------- 去重 ----------
    function isSeen(bvid) {
        const row = db.prepare('SELECT ts FROM bili_seen WHERE bvid = ?').get(bvid);
        return row && Date.now() - row.ts < 24 * 3600 * 1000;
    }

    function markSeen(bvid) {
        try {
            db.prepare('INSERT OR REPLACE INTO bili_seen (bvid, ts) VALUES (?, ?)').run(bvid, Date.now());
        } catch (e) { /* 忽略 */ }
    }

    // ---------- 解析一个 bvid ----------
    async function parseBvid(bvid, opts) {
        opts = opts || {};
        const view = await getView(bvid);
        if (!view) return null;

        const lines = [];
        lines.push('【B站视频情报】');
        lines.push(`标题：${view.title}`);
        if (view.owner && view.owner.name) lines.push(`UP主：${view.owner.name}`);
        const st = view.stat || {};
        lines.push(`时长：${fmtDur(view.duration)} | 播放：${st.view || '-'} | 弹幕：${st.danmaku || '-'}`);
        if (view.desc) lines.push(`简介：${String(view.desc).replace(/\s+/g, ' ').slice(0, 150)}`);

        if (opts.deep !== false) {
            const aid = view.aid;
            const cid = view.cid;
            const upMid = view.owner && view.owner.mid;

            let summary = await getConclusion(bvid, cid, upMid);
            if (!summary) summary = await getSubtitle(bvid, aid, cid);
            if (summary) lines.push(`【内容精读】${summary}`);

            const replies = await getReplies(aid);
            if (replies.length) lines.push(`【热评】${replies.join(' | ')}`);

            const dm = await getDanmaku(cid);
            if (dm.length) lines.push(`【弹幕】${dm.join(' | ')}`);
        }

        let infoText = lines.join('\n');
        if (infoText.length > 2400) infoText = infoText.slice(0, 2400) + '... (内容过长已截断)';
        return { infoText, coverUrl: view.pic, title: view.title, bvid };
    }

    // ---------- 链接解析（替换原来的 parseBilibiliLink 实现） ----------
    async function parseLink(text) {
        try {
            const urlMatch = String(text).match(/https?:\/\/[^\s]+/);
            if (!urlMatch) return null;
            let url = urlMatch[0];
            if (!/bilibili\.com|b23\.tv/.test(url)) return null;

            await ensureBuvid();
            if (url.includes('b23.tv')) {
                const res = await fetch(url, { headers: headers(), redirect: 'follow', signal: AbortSignal.timeout(10000) });
                if (res && res.url) url = res.url;
            }
            const bvMatch = url.match(/BV[a-zA-Z0-9]+/);
            if (!bvMatch) return null;
            return await parseBvid(bvMatch[0], { deep: true });
        } catch (e) {
            console.log('B站解析失败:', e.message);
            return null;
        }
    }

    // ---------- 主动刷：热门 / 排行 ----------
    async function pickFeed() {
        const urls = [
            'https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1',
            'https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all',
        ];
        const url = urls[randInt(0, urls.length - 1)];
        try {
            await ensureBuvid();
            const j = await getJson(url);
            const list = (j && j.code === 0 && j.data && Array.isArray(j.data.list)) ? j.data.list : [];
            const fresh = list.filter((v) => v && v.bvid && !isSeen(v.bvid));
            if (!fresh.length) return null;
            const v = fresh[randInt(0, fresh.length - 1)];
            markSeen(v.bvid);
            return {
                bvid: v.bvid,
                title: v.title,
                desc: String(v.desc || '').replace(/\s+/g, ' ').slice(0, 120),
                owner: v.owner && v.owner.name,
            };
        } catch (e) {
            return null;
        }
    }

    return { parseLink, parseBvid, pickFeed, getView, isSeen, markSeen };
};