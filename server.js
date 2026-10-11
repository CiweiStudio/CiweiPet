const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const CONFIG_PATH = path.join(__dirname, 'public', 'ai-config.json');
let apiConfig = { apiUrl: 'https://api.deepseek.com/chat/completions' };
if (fs.existsSync(CONFIG_PATH)) {
    try { apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) {}
}
const PORT = 3000;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (req.url === '/api/key' && req.method === 'GET') {
        try {
            const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('api_key');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ key: row ? row.value : '' }));
        } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ key: '' }));
        }
    }

    if (req.url === '/api/key' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('api_key', data.key || '');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (req.url === '/api/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body);
                const messages = payload.messages || [];
                const frontendKey = req.headers['authorization']
                    ? req.headers['authorization'].replace('Bearer ', '') : '';
                const finalApiKey = frontendKey || apiConfig.apiKey;

                if (!finalApiKey) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: '未配置 API Key' }));
                }

                const lastUserMsg = messages.filter(m => m.role === 'user').pop();
                if (lastUserMsg) {
                    const contentStr = typeof lastUserMsg.content === 'string'
                        ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);
                    db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run('user', contentStr);
                }

                const data = JSON.stringify({
                    model: payload.model || 'deepseek-chat',
                    messages: messages.map(m => ({ role: m.role, content: m.content })),
                    temperature: payload.temperature || 0.7,
                    max_tokens: payload.max_tokens || 1024,
                    stream: false
                });

                const urlObj = new URL(apiConfig.apiUrl || 'https://api.deepseek.com/chat/completions');
                const options = {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + finalApiKey
                    }
                };

                const apiReq = https.request(options, (apiRes) => {
                    let responseBody = '';
                    apiRes.on('data', chunk => { responseBody += chunk; });
                    apiRes.on('end', () => {
                        try {
                            const parsed = JSON.parse(responseBody);
                            if (parsed.error) {
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                return res.end(JSON.stringify({ error: parsed.error.message }));
                            }
                            const reply = parsed.choices && parsed.choices[0]
                                ? parsed.choices[0].message.content : '（没听清…）';
                            db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run('assistant', reply);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                choices: [{ message: { role: 'assistant', content: reply } }]
                            }));
                        } catch (e) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: '解析失败' }));
                        }
                    });
                });

                apiReq.on('error', (e) => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                });
                apiReq.write(data);
                apiReq.end();
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '服务器内部错误' }));
            }
        });
        return;
    }

    // 静态文件服务（带 MIME 类型）
    var urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    var publicDir = path.join(__dirname, 'public');
    var filePath = path.join(publicDir, urlPath);
    if (filePath.indexOf(publicDir) !== 0) {
        res.writeHead(403); return res.end('Forbidden');
    }
    var MIME = {
        '.html': 'text/html; charset=utf-8',
        '.js':   'application/javascript; charset=utf-8',
        '.css':  'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg':  'image/svg+xml',
        '.ico':  'image/x-icon',
        '.webp': 'image/webp'
    };
    var ext = path.extname(filePath).toLowerCase();
    var ct = MIME[ext] || 'application/octet-stream';
    fs.readFile(filePath, function (err, data) {
        if (err) { res.writeHead(404); return res.end('404 Not Found'); }
        res.writeHead(200, { 'Content-Type': ct });
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 小c已启动！端口: ' + PORT);
});