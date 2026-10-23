const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('./db');

// ⭐ 引入新的 pdfreader 库，绝对兼容 Node 24
const { PdfReader } = require("pdfreader");
const mammoth = require('mammoth');

const CONFIG_PATH = path.join(__dirname, 'public', 'ai-config.json');
const PORT = 3000;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

// 🔍 DeepSeek 官方搜索代理接口
if (req.url === '/api/search' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
        try {
            const { query } = JSON.parse(body);
            let apiConfig = { apiKey: '' };
            if (fs.existsSync(CONFIG_PATH)) {
                try { apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) {}
            }
            if (!apiConfig.apiKey) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: '后台未配置 API Key' }));
            }

            const postData = JSON.stringify({
                query: query,
                count: 5,
                need_content: false // 只取摘要，节省Token
            });

            const options = {
                hostname: 'api.deepseek.com',
                path: '/v1/tools/search',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiConfig.apiKey
                }
            };

            const apiReq = https.request(options, (apiRes) => {
                let resultData = '';
                apiRes.on('data', chunk => { resultData += chunk; });
                apiRes.on('end', () => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(resultData);
                });
            });
            apiReq.on('error', (e) => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            });
            apiReq.write(postData);
            apiReq.end();
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '搜索请求失败' }));
        }
    });
    return;
}

    // 📁 文件上传与解析接口
    if (req.url === '/api/upload' && req.method === 'POST') {
        let chunks = [];
        req.on('data', chunk => { chunks.push(chunk); }); 
        req.on('end', async () => {
            try {
                const body = Buffer.concat(chunks).toString('utf8');
                const { filename, base64Data } = JSON.parse(body);
                const buffer = Buffer.from(base64Data, 'base64');
                let text = '';

                if (filename.endsWith('.txt') || filename.endsWith('.md')) {
                    text = buffer.toString('utf8');
                } else if (filename.endsWith('.pdf')) {
                    // ⭐ 使用 pdfreader 解析 PDF
                    text = await new Promise((resolve, reject) => {
                        let pdfText = '';
                        new PdfReader().parseBuffer(buffer, function(err, item) {
                            if (err) {
                                reject(err);
                            } else if (!item) {
                                resolve(pdfText);
                            } else if (item.text) {
                                pdfText += item.text + ' '; // 把文本拼起来
                            }
                        });
                    });
                } else if (filename.endsWith('.docx')) {
                    const result = await mammoth.extractRawText({ buffer });
                    text = result.value;
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: '目前只支持 txt, md, pdf, docx' }));
                }

                // 限制长度，防止 API 撑爆
                if (text.length > 15000) text = text.slice(0, 15000) + '\n\n(文件太长，已截断)';

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ text: text }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }
    
    // ⭐ 原生专属 MCP：红米机房状态查询
if (req.url === '/api/tools/sysinfo' && req.method === 'GET') {
    const { exec } = require('child_process');
    
    // 用一条命令同时抓取磁盘、内存和温度信息（适配 Termux/Linux）
    const cmd = "df -h /data | tail -1 | awk '{print \"存储剩余: \" $4}'; free -m | grep Mem | awk '{print \"内存剩余: \" $4 \" MB\"}'; cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk '{print \"CPU温度: \" $1/1000 \" ℃\"}'";
    
    exec(cmd, (error, stdout, stderr) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (error) {
            return res.end(JSON.stringify({ error: '传感器读取失败: ' + error.message }));
        }
        // 清理一下多余的空格换行
        const cleanOutput = stdout.trim().replace(/\n+/g, ' | ');
        res.end(JSON.stringify({ status: cleanOutput }));
    });
    return;
}

    if (req.url === '/api/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                // 每次请求都重新读取配置，后台改了立刻生效
                let apiConfig = { apiUrl: 'https://api.deepseek.com/chat/completions', apiKey: '' };
                if (fs.existsSync(CONFIG_PATH)) {
                    try { apiConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) {}
                }

                if (!apiConfig.apiKey) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: { message: '后台未配置 API Key' } }));
                }

                const payload = JSON.parse(body);
                const messages = payload.messages || [];

                const lastUserMsg = messages.filter(m => m.role === 'user').pop();
                if (lastUserMsg) {
                    const contentStr = typeof lastUserMsg.content === 'string'
                        ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);
                    try { db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run('user', contentStr); } catch(e) {}
                }

                const reqData = JSON.stringify(payload);
                const urlObj = new URL(apiConfig.apiUrl || 'https://api.deepseek.com/chat/completions');
                
                const options = {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + apiConfig.apiKey // ⭐ 后端自己带 Key
                    }
                };

                const apiReq = https.request(options, (apiRes) => {
                    res.writeHead(apiRes.statusCode, apiRes.headers);
                    let fullContent = '';
                    
                    apiRes.on('data', chunk => {
                        res.write(chunk);
                        if (payload.stream) {
                            const text = chunk.toString();
                            const lines = text.split('\n');
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
                        if (payload.stream) {
                            if (fullContent) {
                                try { db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run('assistant', fullContent); } catch(e){}
                            }
                        } else {
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
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: e.message } }));
                });
                apiReq.write(reqData);
                apiReq.end();
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: '服务器内部错误' } }));
            }
        });
        return;
    }

    // 静态文件服务
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