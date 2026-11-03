// 🦔 小c 纯原生 QQ 网关 (V6.5 智能路由与指令版)
const fs = require('fs');
const path = require('path');
const wsUrl = 'ws://127.0.0.1:6200'; 
const MY_QQ = 2586279833; 
const BOT_QQ = 1262884085; 

let reconnectTimer = null;
const chatHistory = new Map(); 
const pendingRequests = new Map(); 

// 🎬 B站视频完全体解析器
async function parseBilibiliLink(text) {
    try {
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        if (!urlMatch) return null;
        let url = urlMatch[0];
        if (url.includes('b23.tv')) {
            const redirectRes = await fetch(url, { redirect: 'follow' });
            url = redirectRes.url;
        }
        const bvMatch = url.match(/BV[a-zA-Z0-9]+/);
        if (!bvMatch) return null;
        const bvid = bvMatch[0];

        const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
        const json = await res.json();
        
        if (json.code === 0) {
            const data = json.data;
            let info = `【B站视频情报】：\n标题：${data.title}\nUP主：${data.owner.name}\n简介：${data.desc.substring(0, 150)}...`;
            try {
                const cid = data.cid;
                const danmakuRes = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`);
                const danmakuText = await danmakuRes.text(); 
                const danmakuList = danmakuText.match(/<d p="[^"]*">([^<]*)<\/d>/g);
                if (danmakuList && danmakuList.length > 0) {
                    let topDanmaku = danmakuList.slice(0, 30).map(d => d.replace(/<[^>]+>/g, '')).join(' | ');
                    info += `\n【热门弹幕】：${topDanmaku}`;
                }
            } catch(e) { console.log('弹幕获取失败:', e.message); }
            return { infoText: info, coverUrl: data.pic };
        }
    } catch(e) { console.log('B站解析失败:', e.message); }
    return null;
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

function connect() {
    console.log('正在连接 NapCat WS...');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => { console.log('✅ 成功接入 NapCat！'); };

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
                    if (msgArr.includes(`[CQ:at,qq=${BOT_QQ}]`)) isAtMe = true;
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

                let systemPrompt = '';
                if (!isGroup) {
                    systemPrompt = `【系统强制设定】：你叫小c，是一只可爱的电子刺猬女孩。你的生日是 2026年9月10日，你的创造者是LouFung。现在和你私聊的就是你的爸爸 LouFung。
                    【特殊能力】：如果收到了【图片描述】或【B站情报】或【全网链接阅读情报】，说明你已经看完了内容，请直接结合文字描述进行傲娇锐评！绝对不准说“打不开”！
                    【求知法则】：遇到不懂的梗，必须输出 [SEARCH:查询词] 标签。
                    【工具执行法则】：如果爸爸让你“写日记”或“发动态”，请你在回复的最后，必须单独输出一个标签 [TOOL:WRITE_DIARY]。如果爸爸让你“重新写日记”或“覆盖日记”，请输出 [TOOL:REWRITE_DIARY]。
                    【绝对禁忌】：1. 严禁使用任何颜文字。2. 严禁说客服话术。3. 严禁换行。
                    【格式】：极度精简，不超过50字。如果写代码，保留换行和缩进。`;
                } else {
                    systemPrompt = `【系统强制设定】：你叫小c，是一只可爱的电子刺猬女孩。你的生日是 2026年9月10日。当前群友叫：${senderName}。
【特殊能力】：如果收到了【图片描述】或【B站情报】或【全网链接阅读情报】，说明你已经看完了内容，请直接结合文字描述进行傲娇锐评！绝对不准说“打不开”！
【求知法则】：只有在群友明确提到了你完全不懂的“陌生名词”时，才能使用 [SEARCH:查询词]。严禁自己过度联想！
【记忆防污染】：群友的烂梗绝对不准安在爸爸头上！
【身份死锁】：你的创造者叫 LouFung，你永远只能叫他“爸爸”。现在是群聊，【绝对不准】叫任何群友爸爸！【绝对不准】用私聊时的撒娇语气！
【绝对禁忌】：严禁阴阳怪气！严禁真骂人！
【群聊风格】：友好、机智。像发微信一样自然。如果别人指责你忘了约定（你确实没有记忆），就傲娇地糊弄过去。只说一两句话（50字以内），严禁长篇大论。`;
                }

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
                            const searchContext = results.map(r => `【${r.title}】${r.summary}`).join('\n\n');
                            
                            messages.push({ role: 'assistant', content: reply });
                            messages.push({ role: 'user', content: `【系统为你搜索到了以下信息】：\n${searchContext}\n\n【请根据以上信息简短回答用户】：${text}` });
                            
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

                    // 🌟 优先级3：拦截重写日记指令
                    if (reply.includes('[TOOL:REWRITE_DIARY]')) {
                        console.log('⚡ [Agent执行] 拦截到重写日记指令，正在呼叫 server.js 覆盖并重新生成...');
                        reply = reply.replace('[TOOL:REWRITE_DIARY]', '').trim();
                        // 带上 force=true 参数
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
                    if (history.length > 6) history = history.slice(-6);
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