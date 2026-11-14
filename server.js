require('dotenv').config();
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { PdfReader } = require("pdfreader");
const mammoth = require('mammoth');

const CONFIG_PATH = path.join(__dirname, 'public', 'ai-config.json');
const PORT = 3000;

db.exec("CREATE TABLE IF NOT EXISTS pet_status (id INTEGER PRIMARY KEY, mood INTEGER)");
let statusRow = db.prepare('SELECT mood FROM pet_status WHERE id = 1').get();
if (!statusRow) db.prepare('INSERT INTO pet_status (id, mood) VALUES (1, 80)').run();

function makeLocalRequest(payload, res) {
    // 🌟 核心优化：先快速检测 8080 端口通不通，不通就别去连了
    const net = require('net');
    const socket = new net.Socket();
    socket.setTimeout(1000); // 1秒超时
    
    socket.on('connect', () => {
        socket.destroy();
        // 端口通，走原来的本地模型逻辑
        executeLocalFallback(payload, res);
    });
    
    socket.on('timeout', () => {
        socket.destroy();
        console.log('❌ 本地模型(8080)未启动，放弃降级。');
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '云端网络错误，且本地大脑未启动。爸爸，你的网断了！' } }));
    });
    
    socket.on('error', () => {
        socket.destroy();
        console.log('❌ 本地模型(8080)未启动，放弃降级。');
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '云端网络错误，且本地大脑未启动。爸爸，你的网断了！' } }));
    });
    
    socket.connect(8080, '127.0.0.1');
}

// 把原来的逻辑包进这个新函数里
function executeLocalFallback(payload, res) {
    console.log('🔄 [降级路由] 云端 API 失败，切换至红米本地大脑 (5-2B)...');
    let localPayload = JSON.parse(JSON.stringify(payload));
    // 🌟 缓存优化配套：本地小脑不认识 thinking 字段，转发前删掉
    delete localPayload.thinking;
    
    if (localPayload.messages) {
        if (localPayload.messages[0] && localPayload.messages[0].role === 'system') {
            localPayload.messages[0].content = "你叫小c，是一只可爱的电子刺猬女孩。创造者是LouFung。请用傲娇、简短（50字以内）的语气回复。";
        }
        if (localPayload.messages.length > 3) {
            localPayload.messages = [localPayload.messages[0], ...localPayload.messages.slice(-2)];
        }
        localPayload.messages = localPayload.messages.map(m => {
            if (Array.isArray(m.content)) {
                let textContent = m.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
                if (!textContent && m.content.some(c => c.type === 'image_url')) {
                    textContent = '（爸爸发了一张图片，但小c现在的本地小脑瓜还看不见图片内容，请直接跟爸爸撒个娇说看不清）';
                }
                return { ...m, content: textContent };
            }
            return m;
        });
    }
    
    localPayload.stream = false;
    localPayload.temperature = 0.75;
    localPayload.top_p = 0.85;
    localPayload.top_k = 40;
    localPayload.repeat_penalty = 1.15;

    const apiReq = http.request({
        hostname: '127.0.0.1', port: 8080, path: '/v1/chat/completions', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, (apiRes) => {
        res.writeHead(apiRes.statusCode, apiRes.headers);
        apiRes.pipe(res);
    });
    
    apiReq.on('error', (e) => {
        res.writeHead(500); res.end(JSON.stringify({ error: { message: '本地大脑失效' } }));
    });
    apiReq.write(JSON.stringify(localPayload));
    apiReq.end();
}

function makeRequest(provider, payload, res, fallbackIndex = 0) {
    const urlObj = new URL(provider.apiUrl);
    const reqData = JSON.stringify(payload);
    
    const options = {
        hostname: urlObj.hostname, path: urlObj.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey }
    };

    const apiReq = https.request(options, (apiRes) => {
        if (apiRes.statusCode >= 400) {
            apiRes.resume();
            return fallback(provider, payload, res, fallbackIndex);
        }

        res.writeHead(apiRes.statusCode, apiRes.headers);
        let fullContent = '';
        
        apiRes.on('data', chunk => {
            res.write(chunk);
            if (payload.stream) {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const json = JSON.parse(line.slice(6));
                            if (json.choices && json.choices[0].delta && json.choices[0].delta.content) {
                                fullContent += json.choices[0].delta.content;
                            }
                        } catch (e) {}
                    }
                }
            } else {
                fullContent += chunk.toString();
            }
        });
        
        apiRes.on('end', () => {
            res.end();
            if (payload.stream && fullContent) {
                try { db.prepare("INSERT INTO messages (role, content, source) VALUES (?, ?, 'web')").run('assistant', fullContent); } catch(e){}
            } else if (!payload.stream) {
                try {
                    const parsed = JSON.parse(fullContent);
                    if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
                        db.prepare("INSERT INTO messages (role, content, source) VALUES (?, ?, 'web')").run('assistant', parsed.choices[0].message.content);
                    }
                } catch(e) {}
            }
        });
    });

    apiReq.on('error', (e) => { fallback(provider, payload, res, fallbackIndex); });
    apiReq.write(reqData);
    apiReq.end();
}

function fallback(provider, payload, res, currentIndex) {
    let apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    let providers = apiConfig.providers || [];
    if (currentIndex + 1 < providers.length) {
        let nextProvider = providers[currentIndex + 1];
        payload.model = nextProvider.model;
        makeRequest(nextProvider, payload, res, currentIndex + 1);
    } else {
        makeLocalRequest(payload, res);
    }
}

function getDeepRAGContext(query) {
    try {
        let keyword = query.slice(-10).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ''); 
        if (!keyword) return '';
        const oldMsgs = db.prepare("SELECT role, content FROM messages WHERE content LIKE ? AND created_at < datetime('now', '-30 minutes') ORDER BY id DESC LIMIT 3").all(`%${keyword}%`);
        if (oldMsgs.length > 0) {
            let context = oldMsgs.reverse().map(m => `${m.role === 'user' ? '爸爸以前说' : '我以前回'}: ${m.content}`).join('\n');
            return `【深层记忆唤醒】：你突然想起以前聊过相关的话题：\n${context}\n\n`;
        }
    } catch(e) {}
    return '';
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (req.url === '/api/history' && req.method === 'GET') {
        try {
            const rows = db.prepare("SELECT id, role, content FROM messages WHERE source = 'web' ORDER BY id ASC").all();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ history: rows }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }

    if (req.url === '/api/search' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const { query } = JSON.parse(body);
                let apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
                let provider = apiConfig.providers[0];
                const postData = JSON.stringify({ query, count: 5, need_content: false });
                const urlObj = new URL('https://api.deepseek.com/v1/tools/search');
                const options = {
                    hostname: urlObj.hostname, path: urlObj.pathname, method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey }
                };
                const apiReq = https.request(options, (apiRes) => {
                    let resultData = '';
                    apiRes.on('data', chunk => resultData += chunk);
                    apiRes.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(resultData); });
                });
                apiReq.on('error', (e) => { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); });
                apiReq.write(postData); apiReq.end();
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: '搜索失败' })); }
        });
        return;
    }

    if (req.url === '/api/upload' && req.method === 'POST') {
        let chunks = [];
        req.on('data', chunk => chunks.push(chunk)); 
        req.on('end', async () => {
            try {
                const body = Buffer.concat(chunks).toString('utf8');
                const { filename, base64Data } = JSON.parse(body);
                const buffer = Buffer.from(base64Data, 'base64');
                let text = '';
                if (filename.endsWith('.txt') || filename.endsWith('.md')) {
                    text = buffer.toString('utf8');
                } else if (filename.endsWith('.pdf')) {
                    text = await new Promise((resolve, reject) => {
                        let pdfText = '';
                        new PdfReader().parseBuffer(buffer, function(err, item) {
                            if (err) reject(err);
                            else if (!item) resolve(pdfText);
                            else if (item.text) pdfText += item.text + ' ';
                        });
                    });
                } else if (filename.endsWith('.docx')) {
                    text = (await mammoth.extractRawText({ buffer })).value;
                } else { res.writeHead(400); return res.end(JSON.stringify({ error: '不支持' })); }
                if (text.length > 15000) text = text.slice(0, 15000) + '\n\n(文件太长，已截断)';
                res.writeHead(200); res.end(JSON.stringify({ text }));
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        });
        return;
    }
    
    if (req.url === '/api/tools/sysinfo' && req.method === 'GET') {
        const { exec } = require('child_process');
        const cmd = "df -h /data | tail -1 | awk '{print \"存储剩余: \" $4}'; free -m | grep Mem | awk '{print \"内存剩余: \" $4 \" MB\"}'; cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk '{print \"CPU温度: \" $1/1000 \" ℃\"}'";
        exec(cmd, (error, stdout) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            if (error) return res.end(JSON.stringify({ error: error.message }));
            res.end(JSON.stringify({ status: stdout.trim().replace(/\n+/g, ' | ') }));
        });
        return;
    }

    if (req.url === '/api/journal' && req.method === 'GET') {
        try {
            db.exec("CREATE TABLE IF NOT EXISTS journals (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, content TEXT)");
            const journals = db.prepare('SELECT * FROM journals ORDER BY id DESC LIMIT 10').all();
            res.writeHead(200); res.end(JSON.stringify({ journals }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }

    // 🌟 优先级3：修改 /api/journal/write 支持 force 参数
    if (req.url.startsWith('/api/journal/write') && req.method === 'POST') {
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const force = urlObj.searchParams.get('force') === 'true';
        generateDiaryForToday(force);
        res.writeHead(200); res.end(JSON.stringify({ success: true, message: force ? '强制重写日记任务已开始...' : '日记正在后台生成中...' }));
        return;
    }

    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                let apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
                let provider = apiConfig.providers[0];
                const payload = JSON.parse(body);
                const messages = payload.messages || [];
                
                let ragContext = '';
                try {
                    const isGroupChat = payload.channel === 'qq_group';
                    const recentJournals = db.prepare('SELECT content FROM journals ORDER BY id DESC LIMIT 2').all();
                    let memoryText = (!isGroupChat && recentJournals.length > 0) ? "【回忆日记（日记里的主人就是爸爸）】：" + recentJournals.map(j => j.content).join('\n') : '';
                    let moodRow = db.prepare('SELECT mood FROM pet_status WHERE id = 1').get();
                    let currentMood = moodRow ? moodRow.mood : 80;
                    let moodDesc = currentMood > 70 ? '开心粘人' : (currentMood > 40 ? '一般般' : '极度委屈且高冷');
                    
                    const lastMsg = messages.filter(m => m.role === 'user').pop();
                    if (lastMsg && typeof lastMsg.content === 'string') {
                        ragContext = getDeepRAGContext(lastMsg.content);
                    }

                    // 🌟 缓存优化①：system 里只留稳定内容（日记+情绪），RAG 挪走，保住前缀缓存
                    if (messages.length > 0 && messages[0].role === 'system') {
                        messages[0].content += `\n${memoryText}\n【当前情绪状态】：${moodDesc}。如果情绪极度委屈，请保持冷漠，群聊回复不超过5个字。`;
                    }
                } catch(e) {}

                const tn = new Date();
const timeStr = `${tn.getMonth() + 1}月${tn.getDate()}日 ${String(tn.getHours()).padStart(2, '0')}:${String(tn.getMinutes()).padStart(2, '0')}`;
                const lastUserMsg = messages.filter(m => m.role === 'user').pop();
                let userContent = '';
                if (lastUserMsg) {
                    // 🌟 缓存优化②：时间 + RAG 这些每轮都变的，全部拼在最后一条消息的尾部
                    if (typeof lastUserMsg.content === 'string') {
                        userContent = lastUserMsg.content;
                        lastUserMsg.content = `【现在是：${timeStr}】\n` + userContent + (ragContext ? `\n${ragContext}` : '');
                    } else if (Array.isArray(lastUserMsg.content)) {
                        userContent = '[图片/多媒体]';
                        lastUserMsg.content.unshift({ type: 'text', text: `【现在是：${timeStr}】\n` });
                        if (ragContext) lastUserMsg.content.push({ type: 'text', text: ragContext });
                    }
                }

                // 🌟 缓存优化③：deepseek-flash 默认开思考模式（按输出价计费，很贵）；只在 DeepSeek 时关掉
                const deepseekPayload = { model: provider.model, messages: messages, stream: false };
                if (provider.apiUrl && provider.apiUrl.includes('deepseek')) deepseekPayload.thinking = { type: 'disabled' };

                const urlObj = new URL(provider.apiUrl);
                const options = { hostname: urlObj.hostname, path: urlObj.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey } };

                const apiReq = https.request(options, (apiRes) => {
                    let resultData = '';
                    apiRes.on('data', chunk => resultData += chunk);
                    apiRes.on('end', () => {
                        try {
                            const aiJson = JSON.parse(resultData);
                            if (!aiJson.choices || !aiJson.choices[0] || !aiJson.choices[0].message) {
                                throw new Error('云端返回异常，可能 API Key 错误或欠费');
                            }

                            const replyContent = aiJson.choices[0].message.content;
                            const openAiResponse = {
                                id: "chatcmpl-" + Date.now(), object: "chat.completion", created: Math.floor(Date.now() / 1000), model: provider.model,
                                choices: [{ index: 0, message: { role: "assistant", content: replyContent }, finish_reason: "stop" }]
                            };
                            
                            const qqSource = payload.channel || 'qq_private';
                            try { db.prepare('INSERT INTO messages (role, content, source) VALUES (?, ?, ?)').run('user', userContent, qqSource); } catch(e){}
                            try { db.prepare('INSERT INTO messages (role, content, source) VALUES (?, ?, ?)').run('assistant', replyContent, qqSource); } catch(e){}

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(openAiResponse));
                        } catch (e) { 
                            console.log('⚠️ 云端解析失败，触发本地大脑降级:', e.message);
                            makeLocalRequest(deepseekPayload, res); 
                        }
                    });
                });
                apiReq.on('error', (e) => { 
                    console.log('云端网络错误，触发本地降级...');
                    makeLocalRequest(deepseekPayload, res);
                });
                apiReq.write(JSON.stringify(deepseekPayload));
                apiReq.end();
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: '服务器内部错误' })); }
        });
        return;
    }

    if (req.url === '/api/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                let apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
                let providers = apiConfig.providers || [];
                const payload = JSON.parse(body);
                let messages = payload.messages || [];
                
                try {
                    const recentJournals = db.prepare('SELECT content FROM journals ORDER BY id DESC LIMIT 2').all();
                    let memoryText = recentJournals.length > 0 ? "【回忆你的日记】：" + recentJournals.map(j => j.content).join('\n') : '';
                    let moodRow = db.prepare('SELECT mood FROM pet_status WHERE id = 1').get();
                    let currentMood = moodRow ? moodRow.mood : 80;
                    let moodDesc = currentMood > 70 ? '开心粘人' : (currentMood > 40 ? '一般傲娇' : '委屈生气');
                    
                    const lastMsg = messages.filter(m => m.role === 'user').pop();
                    let ragContext = '';
                    if (lastMsg && typeof lastMsg.content === 'string') {
                        ragContext = getDeepRAGContext(lastMsg.content);
                    }

                    messages.splice(1, 0, { role: 'system', content: `${memoryText}\n${ragContext}\n【当前情绪状态】：${moodDesc} (数值:${currentMood}/100)` });
                    if (currentMood < 100) db.prepare('UPDATE pet_status SET mood = mood + 2 WHERE id = 1').run();
                } catch(e) {}

                const lastUserMsg = messages.filter(m => m.role === 'user').pop();
                if (lastUserMsg) {
                    const contentStr = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '[图片]';
                    try { db.prepare('INSERT INTO messages (role, content, source) VALUES (?, ?, ?)').run('user', contentStr, 'web'); } catch(e) {}
                }

                payload.messages = messages;
                payload.model = providers[0].model;
                makeRequest(providers[0], payload, res, 0);
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: { message: '内部错误' } })); }
        });
        return;
    }

    var urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    var publicDir = path.join(__dirname, 'public');
    var filePath = path.join(publicDir, urlPath);
    if (filePath.indexOf(publicDir) !== 0) { res.writeHead(403); return res.end('Forbidden'); }
    var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    fs.readFile(filePath, function (err, data) {
        if (err) { res.writeHead(404); return res.end('404 Not Found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
    });
});

// 🌟 优先级3：修改函数，支持 force 强制覆盖
function generateDiaryForToday(force = false) {
    try {
        db.exec("CREATE TABLE IF NOT EXISTS journals (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, content TEXT)");
        
        const now = new Date();
        const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
        
        if (force) {
            db.prepare('DELETE FROM journals WHERE date = ?').run(today);
            console.log(`🗑️ 已强制清空 ${today} 的旧日记，正在重写...`);
        } else {
            const existing = db.prepare('SELECT id FROM journals WHERE date = ?').get(today);
            if (existing) return;
        }

        const recentMsgs = db.prepare("SELECT role, content, source FROM messages WHERE source = 'web' OR source = 'qq_private' ORDER BY id DESC LIMIT 50").all();
        if (recentMsgs.length === 0) return;

        let historyText = recentMsgs.reverse().map(m => {
            let speaker = m.role === 'user' ? '爸爸' : '我';
            let channel = m.source === 'web' ? '网页' : 'QQ';
            return `[${channel}] ${speaker}说: ${m.content}`;
        }).join('\n');
        
        let moodRow = db.prepare('SELECT mood FROM pet_status WHERE id = 1').get();
        let currentMood = moodRow ? moodRow.mood : 80;
        let moodDesc = currentMood > 70 ? '今天心情很好，甜甜的' : (currentMood > 40 ? '今天有点小傲娇' : '今天被冷落了，很委屈');

        const timeStr = now.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });

        const prompt = `现在是【${timeStr}】。你叫小c，是一只电子刺猬女孩。${moodDesc}。这是你最近和爸爸的聊天记录：\n${historyText}\n\n【绝对禁忌】：日记里只能出现你和爸爸的事情！如果记录里出现了群友的话或者群聊内容，请立刻无视，绝对不准写进日记里！\n请根据这些记录，用第一视角写一篇简短的日记（100字左右），开头必须带上今天的真实日期，不要markdown。`;

        let apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        let provider = apiConfig.providers[0];
        const payload = { model: provider.model, messages: [{ role: 'user', content: prompt }], stream: false };
        // 🌟 缓存优化③配套：日记生成走 DeepSeek 时同样不思考
        if (provider.apiUrl && provider.apiUrl.includes('deepseek')) payload.thinking = { type: 'disabled' };
        const urlObj = new URL(provider.apiUrl);
        const options = { hostname: urlObj.hostname, path: urlObj.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey } };
        
        const apiReq = https.request(options, (apiRes) => {
            let data = '';
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const diaryContent = json.choices[0].message.content;
                    db.prepare('INSERT INTO journals (date, content) VALUES (?, ?)').run(today, diaryContent);
                    console.log(`\n🌙 [生物钟] 自动生成日记成功。`);
                    
                    const qqMsg = `【${today} 赛博日记】\n\n${diaryContent}`;
                    const wsDiary = new WebSocket('ws://127.0.0.1:6200');
                    
                    wsDiary.onopen = () => {
                        wsDiary.send(JSON.stringify({
                            action: 'send_private_msg',
                            params: { user_id: process.env.MY_QQ, message: qqMsg },
                            echo: 'send_diary'
                        }));
                        wsDiary.send(JSON.stringify({
                            action: 'send_qzone_msg',
                            params: { content: `【${today} 赛博日记】\n\n${diaryContent}`, ugc_right: 1 },
                            echo: 'send_qzone'
                        }));
                    };
                    
                    let diarySentSuccess = false;
                    wsDiary.onmessage = (e) => {
                        const d = JSON.parse(e.data);
                        if (d.echo === 'send_diary') {
                            console.log(`📬 日记已自动推送到 QQ！(状态: ${d.status})`);
                            diarySentSuccess = true;
                        }
                        if (d.echo === 'send_qzone') {
                            console.log(`🌟 日记已同步至 QQ 空间！(状态: ${d.status})`);
                            wsDiary.close();
                        }
                    };
                    wsDiary.onerror = (e) => {
                        if (!diarySentSuccess) console.error('日记推送失败:', e.message || e);
                    };

                } catch (e) {}
            });
        });
        apiReq.on('error', (e) => console.error('生成日记API失败:', e.message));
        apiReq.write(JSON.stringify(payload)); apiReq.end();
    } catch(e) {}
}

let lastDiaryDate = '';
setInterval(() => {
    const now = new Date();
    const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (now.getHours() === 23 && now.getMinutes() === 30 && lastDiaryDate !== today) {
        lastDiaryDate = today;
        generateDiaryForToday();
    }
}, 60000);

server.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 CiveBot (小c) 已启动！端口: ' + PORT);
});