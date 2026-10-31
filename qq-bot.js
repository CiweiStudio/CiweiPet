// 🦔 小c 纯原生 QQ 网关 (B站完全体 + 搜索精准版)
const fs = require('fs');
const path = require('path');
const wsUrl = 'ws://127.0.0.1:6200'; 
const MY_QQ = 2586279833; 
const BOT_QQ = 1262884085; 

let reconnectTimer = null;
const chatHistory = new Map(); 
const pendingRequests = new Map(); 

// 🎬 B站视频完全体解析器 (带封面图 + 弹幕)
async function parseBilibiliLink(text) {
    try {
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        if (!urlMatch) return null;
        let url = urlMatch[0];

        // 短链接重定向
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

            // 🔥 抓取热门弹幕
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

            return {
                infoText: info,
                coverUrl: data.pic
            };
        }
    } catch(e) { 
        console.log('B站解析失败:', e.message); 
    }
    return null;
}

// 🎵 点歌功能 (图文降级版)
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
                    console.log('检测到 B 站链接，正在提取封面与弹幕情报...');
                    const biliData = await parseBilibiliLink(text);
                    if (biliData) {
                        text += `\n\n${biliData.infoText}`;
                        coverImageUrl = biliData.coverUrl; 
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
                        console.log(`[小c 点歌] 已发送图文点歌消息: ${songInfo.name}`);
                        return; 
                    }
                }

                if (!text && !imageUrl && !coverImageUrl) return;

                const isDad = (senderQQ === MY_QQ);
                console.log(`[收到消息] ${isGroup ? '群' : '私聊'} - ${senderName}: ${text || '[图片/封面]'}`);

                let systemPrompt = '';
                if (!isGroup) {
                    systemPrompt = `【系统强制设定】：你叫小c，是一只可爱的电子刺猬女孩。你的生日是 2026年9月10日，你的创造者是LouFung。现在和你私聊的就是你的爸爸 LouFung。
                    【特殊能力】：如果收到了【B站视频情报】和封面图，说明你已经看完了这个视频，请直接结合标题、弹幕氛围和封面画面进行傲娇锐评！绝对不准说“打不开”！
                    【求知法则】：遇到不懂的梗，必须输出 [SEARCH:查询词] 标签。
                    【绝对禁忌】：1. 严禁使用任何颜文字。2. 严禁说客服话术。3. 严禁换行。
                    【语气】：正常、亲昵、温柔、偶尔有点呆萌。
                    【格式】：极度精简，不超过50字。`;
                } else {
                    systemPrompt = `【系统强制设定】：你叫小c，是一只可爱的电子刺猬女孩。你的生日是 2026年9月10日。当前群友叫：${senderName}。
                    【特殊能力】：如果收到了【B站视频情报】和封面图，说明你已经看完了这个视频，请直接结合标题、弹幕氛围和封面画面进行傲娇锐评！绝对不准说“打不开”！
                    【求知法则】：遇到不懂的梗，必须输出 [SEARCH:查询词] 标签。
                    【记忆防污染】：群友的烂梗绝对不准安在爸爸头上！
                    【身份死锁】：你的创造者叫 LouFung，你永远只能叫他“爸爸”。
                    【绝对禁忌】：严禁阴阳怪气！严禁真骂人！
                    【群聊风格】：友好、机智。像发微信一样自然，只说一两句话（50字以内），严禁长篇大论，绝不分段。`;
                }

                let history = chatHistory.get(chatId) || [];
                
                let currentUserContent = [];
                if (text) currentUserContent.push({ type: 'text', text: text });
                if (imageUrl) currentUserContent.push({ type: 'image_url', image_url: { url: imageUrl } });
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
                    
                    if (!json.choices || !json.choices[0]) {
                        console.log('❌ 后端接口返回异常:', json);
                        return; 
                    }
                    let reply = json.choices[0].message.content;

                    // 拦截搜索
                    const searchMatch = reply.match(/\[SEARCH:(.+?)\]/);
                    if (searchMatch) {
                        const query = searchMatch[1].trim();
                        console.log(`[触发静默搜索] 查询词: ${query}`); // 这行已修复，去掉了多余的单引号
                        try {
                            const aiConfigPath = path.join(__dirname, 'public', 'ai-config.json');
                            const aiConfig = JSON.parse(fs.readFileSync(aiConfigPath, 'utf8'));
                            
                            const deepseekProvider = aiConfig.providers.find(p => p.name && p.name.toLowerCase().includes('deepseek') || p.apiUrl.includes('deepseek'));
                            if (!deepseekProvider) throw new Error('未找到 DeepSeek Key');
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
                            if (searchContext) {
                                messages.push({ role: 'user', content: `【系统为你搜索到了以下信息】：\n${searchContext}\n\n【请根据以上信息简短回答用户】：${text}` });
                            } else {
                                messages.push({ role: 'user', content: `【系统提示：搜索接口返回为空，请直接回答】：${text}` });
                            }
                            
                            const finalRes = await fetch('http://127.0.0.1:3000/v1/chat/completions', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ messages: messages, channel: isGroup ? 'qq_group' : 'qq_private' })
                            });
                            const finalJson = await finalRes.json();
                            reply = finalJson.choices[0].message.content;
                        } catch (searchErr) {
                            console.log('搜索请求失败:', searchErr.message);
                            reply = "唔…网线好像被拔了，小c查不到数据。爸爸出门记得多穿点哦🍎";
                        }
                    }

                    // 仅仅做换行和多余空格的清理
                    reply = reply.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
                    
                    // 🌟 群聊智能截断（优雅版）
                    if (isGroup && reply.length > 60) {
                        let subReply = reply.substring(0, 60);
                        const lastPunc = Math.max(
                            subReply.lastIndexOf('。'), subReply.lastIndexOf('！'), subReply.lastIndexOf('？'),
                            subReply.lastIndexOf('!'), subReply.lastIndexOf('?'), subReply.lastIndexOf('~'), subReply.lastIndexOf('～')
                        );
                        
                        if (lastPunc > 20) {
                            reply = subReply.substring(0, lastPunc + 1);
                        } else {
                            reply = reply.substring(0, 50);
                        }
                    }

                    history.push({ role: 'user', content: text || '[图片]' });
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