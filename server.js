const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { PdfReader } = require("pdfreader");
const mammoth = require('mammoth');

const CONFIG_PATH = path.join(__dirname, 'public', 'ai-config.json');
const PORT = 3000;

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
        // 如果遇到 429(限流) 或 401(Key失效) 或 5xx(服务器错误)，自动切下一个
        if (apiRes.statusCode >= 400) {
            console.log(`[警告] ${provider.name} 返回 ${apiRes.statusCode}，尝试降级...`);
            apiRes.resume(); // 丢弃当前响应体
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
                try { db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run('assistant', fullContent); } catch(e){}
            } else if (!payload.stream) {
                try {
                    const parsed = JSON.parse(fullContent);
                    if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
                        db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run('assistant', parsed.choices[0].message.content);
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
    
    // 寻找下一个可用接口
    if (currentIndex + 1 < providers.length) {
        let nextProvider = providers[currentIndex + 1];
        console.log(`[路由] 切换到备用接口: ${nextProvider.name}`);
        payload.model = nextProvider.model;
        makeRequest(nextProvider, payload, res, currentIndex + 1);
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '所有 API 接口均已失效，请检查余额或网络' } }));
    }
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    // 🔍 搜索接口
    if (req.url === '/api/search' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const { query } = JSON.parse(body);
                let apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
                let provider = apiConfig.providers[0]; // 默认用第一家的搜索
                
                const postData = JSON.stringify({ query, count: 5, need_content: false });
                const urlObj = new URL('https://api.deepseek.com/v1/tools/search'); // DeepSeek 的搜索接口
                
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

    // 📁 文件上传解析
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
                } else {
                    res.writeHead(400); return res.end(JSON.stringify({ error: '不支持的文件格式' }));
                }
                if (text.length > 15000) text = text.slice(0, 15000) + '\n\n(文件太长，已截断)';
                res.writeHead(200); res.end(JSON.stringify({ text }));
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        });
        return;
    }
    
    // ⭐ 机房状态查询
    if (req.url === '/api/tools/sysinfo' && req.method === 'GET') {
        const { exec } = require('child_process');
        const cmd = "df -h /data | tail -1 | awk '{print \"存储剩余: \" $4}'; free -m | grep Mem | awk '{print \"内存剩余: \" $4 \" MB\"}'; cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk '{print \"CPU温度: \" $1/1000 \" ℃\"}'";
        exec(cmd, (error, stdout, stderr) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            if (error) return res.end(JSON.stringify({ error: error.message }));
            res.end(JSON.stringify({ status: stdout.trim().replace(/\n+/g, ' | ') }));
        });
        return;
    }

    // 📖 获取日记
    if (req.url === '/api/journal' && req.method === 'GET') {
        try {
            db.exec("CREATE TABLE IF NOT EXISTS journals (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, content TEXT)");
            const journals = db.prepare('SELECT * FROM journals ORDER BY id DESC LIMIT 5').all();
            res.writeHead(200); res.end(JSON.stringify({ journals }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }

    // 📝 触发写日记
    if (req.url === '/api/journal/write' && req.method === 'POST') {
        try {
            db.exec("CREATE TABLE IF NOT EXISTS journals (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, content TEXT)");
            const recentMsgs = db.prepare('SELECT role, content FROM messages ORDER BY id DESC LIMIT 10').all();
            let historyText = recentMsgs.reverse().map(m => `${m.role === 'user' ? '爸爸' : '我'}: ${m.content}`).join('\n');
            const today = new Date().toISOString().slice(0, 10);
            
            let apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            let provider = apiConfig.providers[0];
            const payload = {
                model: provider.model,
                messages: [
                    { role: 'system', content: '你是一只傲娇可爱的电子刺猬女孩。' },
                    { role: 'user', content: `今天和爸爸聊了这些：\n${historyText}\n\n请用第一人称写一篇简短的日记（50-80字），表达真实想法，不要markdown。` }
                ],
                stream: false
            };

            // 暂时借用 makeRequest 的逻辑（无流式）
            const urlObj = new URL(provider.apiUrl);
            const options = {
                hostname: urlObj.hostname, path: urlObj.pathname, method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey }
            };
            const apiReq = https.request(options, (apiRes) => {
                let data = '';
                apiRes.on('data', chunk => data += chunk);
                apiRes.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const diaryContent = json.choices[0].message.content;
                        db.prepare('INSERT INTO journals (date, content) VALUES (?, ?)').run(today, diaryContent);
                        res.writeHead(200); res.end(JSON.stringify({ success: true, content: diaryContent }));
                    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: '写日记失败' })); }
                });
            });
            apiReq.write(JSON.stringify(payload)); apiReq.end();
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }

    // 💬 核心聊天接口
    if (req.url === '/api/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                let apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
                let providers = apiConfig.providers || [];
                if (providers.length === 0) {
                    res.writeHead(401); return res.end(JSON.stringify({ error: { message: '未配置 API' } }));
                }

                const payload = JSON.parse(body);
                const messages = payload.messages || [];
                const lastUserMsg = messages.filter(m => m.role === 'user').pop();
                if (lastUserMsg) {
                    const contentStr = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);
                    try { db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run('user', contentStr); } catch(e) {}
                }

                // 注入首选接口
                payload.model = providers[0].model;
                makeRequest(providers[0], payload, res, 0);
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: { message: '服务器内部错误' } })); }
        });
        return;
    }

    // 静态文件服务
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

server.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 小c已启动！端口: ' + PORT);
});