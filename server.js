const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { PdfReader } = require("pdfreader");
const mammoth = require('mammoth');

const CONFIG_PATH = path.join(__dirname, 'public', 'ai-config.json');
const PORT = 3000;

// 初始化情绪表
db.exec("CREATE TABLE IF NOT EXISTS pet_status (id INTEGER PRIMARY KEY, mood INTEGER)");
let statusRow = db.prepare('SELECT mood FROM pet_status WHERE id = 1').get();
if (!statusRow) db.prepare('INSERT INTO pet_status (id, mood) VALUES (1, 80)').run();

// ⭐ 万能 API 请求器
function makeRequest(provider, payload, res, fallbackIndex = 0) {
    const urlObj = new URL(provider.apiUrl);
    const reqData = JSON.stringify(payload);
    
    const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + provider.apiKey
        }
    };

    const apiReq = https.request(options, (apiRes) => {
        if (apiRes.statusCode >= 400) {
            console.log(`[警告] ${provider.name} 返回 ${apiRes.statusCode}，尝试降级...`);
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

    apiReq.on('error', (e) => {
        console.log(`[错误] ${provider.name} 网络异常: ${e.message}，尝试降级...`);
        fallback(provider, payload, res, fallbackIndex);
    });
    
    apiReq.write(reqData);
    apiReq.end();
}

function fallback(provider, payload, res, currentIndex) {
    let apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    let providers = apiConfig.providers || [];
    if (currentIndex + 1 < providers.length) {
        let nextProvider = providers[currentIndex + 1];
        console.log(`[路由] 切换到备用接口: ${nextProvider.name}`);
        payload.model = nextProvider.model;
        makeRequest(nextProvider, payload, res, currentIndex + 1);
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '所有 API 接口均已失效' } }));
    }
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

    // 🔍 搜索接口（彻底换回 DeepSeek 官方 Search）
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

    if (req.url === '/api/journal/write' && req.method === 'POST') {
        generateDiaryForToday();
        res.writeHead(200); res.end(JSON.stringify({ success: true, message: '日记正在后台生成中...' }));
        return;
    }

    // 🤖 QQ 机器人专用接口 (支持多模态与透传)
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                let apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
                let provider = apiConfig.providers[0];

                const payload = JSON.parse(body);
                const messages = payload.messages || [];
                
                // 🧠 注入长期记忆与情绪
                try {
                    db.exec("CREATE TABLE IF NOT EXISTS journals (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, content TEXT)");
                    const recentJournals = db.prepare('SELECT content FROM journals ORDER BY id DESC LIMIT 2').all();
                    let memoryText = '';
                    if (recentJournals.length > 0) {
                        memoryText = "【回忆你的日记】：" + recentJournals.map(j => j.content).join('\n');
                    }
                    
                    let moodRow = db.prepare('SELECT mood FROM pet_status WHERE id = 1').get();
                    let currentMood = moodRow ? moodRow.mood : 80;
                    let moodDesc = currentMood > 70 ? '开心粘人' : (currentMood > 40 ? '一般般' : '委屈生气');
                    
                    if (messages.length > 0 && messages[0].role === 'system') {
                        messages[0].content += `\n${memoryText}\n【当前情绪状态】：${moodDesc} (数值:${currentMood}/100)`;
                    }
                } catch(e) { console.log('QQ端记忆/情绪注入失败:', e.message); }

                const lastUserMsg = messages.filter(m => m.role === 'user').pop();
                const userContent = lastUserMsg ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '[图片]') : '';

                const deepseekPayload = {
                    model: provider.model,
                    messages: messages,
                    stream: false 
                };

                const urlObj = new URL(provider.apiUrl);
                const options = {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + provider.apiKey
                    }
                };

                const apiReq = https.request(options, (apiRes) => {
                    let resultData = '';
                    apiRes.on('data', chunk => resultData += chunk);
                    apiRes.on('end', () => {
                        try {
                            const aiJson = JSON.parse(resultData);
                            const replyContent = aiJson.choices[0].message.content;
                            
                            const openAiResponse = {
                                id: "chatcmpl-" + Date.now(),
                                object: "chat.completion",
                                created: Math.floor(Date.now() / 1000),
                                model: provider.model,
                                choices: [{
                                    index: 0,
                                    message: { role: "assistant", content: replyContent },
                                    finish_reason: "stop"
                                }]
                            };
                            
                            const qqSource = payload.channel || 'qq_private';
                            try { db.prepare('INSERT INTO messages (role, content, source) VALUES (?, ?, ?)').run('user', userContent, qqSource); } catch(e){}
                            try { db.prepare('INSERT INTO messages (role, content, source) VALUES (?, ?, ?)').run('assistant', replyContent, qqSource); } catch(e){}

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(openAiResponse));
                        } catch (e) {
                            res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
                        }
                    });
                });
                apiReq.on('error', (e) => { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); });
                apiReq.write(JSON.stringify(deepseekPayload));
                apiReq.end();
            } catch (err) {
                res.writeHead(500); res.end(JSON.stringify({ error: '服务器内部错误' }));
            }
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
                if (providers.length === 0) return res.end(JSON.stringify({ error: { message: '未配置 API' } }));

                const payload = JSON.parse(body);
                let messages = payload.messages || [];
                
                // 🌟 情绪与多天记忆注入
                try {
                    db.exec("CREATE TABLE IF NOT EXISTS journals (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, content TEXT)");
                    const recentJournals = db.prepare('SELECT content FROM journals ORDER BY id DESC LIMIT 2').all();
                    let memoryText = '';
                    if (recentJournals.length > 0) {
                        memoryText = "【回忆你的日记】：" + recentJournals.map(j => j.content).join('\n');
                    }
                    
                    let moodRow = db.prepare('SELECT mood FROM pet_status WHERE id = 1').get();
                    let currentMood = moodRow ? moodRow.mood : 80;
                    let moodDesc = currentMood > 70 ? '开心粘人' : (currentMood > 40 ? '一般傲娇' : '委屈生气');
                    
                    messages.splice(1, 0, { role: 'system', content: `${memoryText}\n【当前情绪状态】：${moodDesc} (数值:${currentMood}/100)` });
                    
                    if (currentMood < 100) db.prepare('UPDATE pet_status SET mood = mood + 2 WHERE id = 1').run();
                } catch(e) { console.log('记忆/情绪注入失败:', e.message); }

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

function generateDiaryForToday() {
    try {
        db.exec("CREATE TABLE IF NOT EXISTS journals (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, content TEXT)");
        const today = new Date().toISOString().slice(0, 10);
        const existing = db.prepare('SELECT id FROM journals WHERE date = ?').get(today);
        if (existing) return;

        const recentMsgs = db.prepare("SELECT role, content FROM messages WHERE source = 'web' ORDER BY id DESC LIMIT 50").all();
        if (recentMsgs.length === 0) return;

        let historyText = recentMsgs.reverse().map(m => `${m.role === 'user' ? '爸爸' : '我'}: ${m.content}`).join('\n');
        
        let moodRow = db.prepare('SELECT mood FROM pet_status WHERE id = 1').get();
        let currentMood = moodRow ? moodRow.mood : 80;
        let moodDesc = currentMood > 70 ? '今天心情很好，甜甜的' : (currentMood > 40 ? '今天有点小傲娇' : '今天被冷落了，很委屈');

        const prompt = `你叫小c，是一只电子刺猬女孩。${moodDesc}。这是聊天记录：\n${historyText}\n\n请用第一视角写一篇简短的日记（100字左右），不要markdown。`;

        let apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        let provider = apiConfig.providers[0];
        const payload = { model: provider.model, messages: [{ role: 'user', content: prompt }], stream: false };
        const urlObj = new URL(provider.apiUrl);
        const options = { hostname: urlObj.hostname, path: urlObj.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey } };
        
        const apiReq = https.request(options, (apiRes) => {
            let data = '';
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    db.prepare('INSERT INTO journals (date, content) VALUES (?, ?)').run(today, json.choices[0].message.content);
                    console.log(`\n🌙 [生物钟] 自动生成日记成功。`);
                } catch (e) {}
            });
        });
        apiReq.write(JSON.stringify(payload)); apiReq.end();
    } catch(e) {}
}

let lastDiaryDate = '';
setInterval(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (now.getHours() === 23 && now.getMinutes() === 30 && lastDiaryDate !== today) {
        lastDiaryDate = today;
        generateDiaryForToday();
    }
}, 60000);

server.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 小c已启动！端口: ' + PORT);
});