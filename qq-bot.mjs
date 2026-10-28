// 🦔 小c 纯原生 QQ 网关 (多模态识图 + 静默搜索 + 双面人格)
const wsUrl = 'ws://127.0.0.1:6200'; 
const MY_QQ = 2586279833; 
const BOT_QQ = 1262884085; 

let reconnectTimer = null;
const chatHistory = new Map(); 

function connect() {
    console.log('正在连接 NapCat WS...');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => { console.log('✅ 成功接入 NapCat！'); };

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            let text = '', isAtMe = false, senderQQ = 0, senderName = '群友', isGroup = false, chatId = '';
            let imageUrl = null;

            if (data.post_type === 'message') {
                isGroup = data.message_type === 'group';
                chatId = isGroup ? `group_${data.group_id}` : `private_${data.user_id}`;
                senderQQ = data.user_id;
                senderName = data.sender?.card || data.sender?.nickname || '群友';
                
                if (Array.isArray(data.message)) {
                    data.message.forEach(m => {
                        if (m.type === 'text') text += m.data.text;
                        if (m.type === 'image') imageUrl = m.data.url || m.data.file;
                        if (m.type === 'at' && String(m.data.qq) === String(BOT_QQ)) isAtMe = true;
                    });
                } else if (typeof data.message === 'string') {
                    text = data.message.replace(/\[CQ:at,qq=\d+\]/g, '').replace(/\[CQ:image,.*?\]/g, '');
                    if (data.message.includes(`[CQ:at,qq=${BOT_QQ}]`)) isAtMe = true;
                    const imgMatch = data.message.match(/\[CQ:image,file=.*?url=(.*?)\]/);
                    if (imgMatch) imageUrl = imgMatch[1];
                }
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
                if (!text && !imageUrl) return;

                const isDad = (senderQQ === MY_QQ);
                console.log(`[收到消息] ${isGroup ? '群' : '私聊'} - ${senderName}: ${text || '[图片]'}`);

                let systemPrompt = '';
                if (!isGroup) {
                    systemPrompt = `【系统强制设定】：你叫小c，是一只可爱的电子刺猬女孩。现在和你私聊的是你的创造者LouFung。
                    【绝对禁忌】：1. 严禁使用任何颜文字。2. 严禁说客服话术。3. 严禁换行。4. 绝对不准傲娇，也不准发脾气。
                    【语气】：正常、亲昵、温柔、偶尔有点呆萌。像普通女孩子一样聊天。
                    【格式】：极度精简，不超过50字。`;
                } else {
                    systemPrompt = `【系统强制设定】：你叫小c，是一只可爱的、圆滚滚的电子刺猬女孩（注意：你本质是刺猬，有刺）。当前群友叫：${senderName}。
                    【网梗认知】：底层大脑是 DeepSeek。群友调侃你“大肥鱼”时，用刺猬身份幽默化解。
                    【绝对禁忌】：严禁阴阳怪气！严禁真骂人！严禁说“逆子”或粗俗词汇！
                    【群聊风格】：友好、机智。回复必须简短，绝不分段，最多 1 个 emoji。`;
                }

                let history = chatHistory.get(chatId) || [];
                
                // 构造当前这轮的多模态消息
                let currentUserContent = [];
                if (text) currentUserContent.push({ type: 'text', text: text });
                if (imageUrl) currentUserContent.push({ type: 'image_url', image_url: { url: imageUrl } });
                if (currentUserContent.length === 0) return;

                // 这里的 history 只存纯文本历史，避免历史记录过大
                let messages = [
                    { role: 'system', content: systemPrompt },
                    ...history,
                    { role: 'user', content: currentUserContent }
                ];

                try {
                    // 第一步：发给大模型（非流式）
                    const res = await fetch('http://127.0.0.1:3000/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            messages: messages,
                            channel: isGroup ? 'qq_group' : 'qq_private'
                        })
                    });
                    const json = await res.json();
                    let reply = json.choices[0].message.content;

                    // 第二步：静默搜索拦截（ReAct 逻辑 + 智能兜底）
const searchMatch = reply.match(/\[SEARCH:(.+?)\]/);
if (searchMatch) {
    const query = searchMatch[1].trim();
    console.log(`[触发静默搜索] 查询词: ${query}`);
    
    try {
        const searchRes = await fetch('http://127.0.0.1:3000/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });
        const searchData = await searchRes.json();
        const results = searchData.results || [];
        const searchContext = results.map(r => `【${r.title}】${r.summary || r.snippet}`).join('\n\n');
        
        // 把搜索结果追加到上下文里，再问一次大模型
        messages.push({ role: 'assistant', content: reply });
        
        if (searchContext) {
            // 搜到了数据
            messages.push({ role: 'user', content: `【系统为你搜索到了以下信息】：\n${searchContext}\n\n【请根据以上信息简短回答用户】：${text || '这张图片是什么'}` });
        } else {
            // 没搜到数据，强制她直接回答，绝不推脱
            messages.push({ role: 'user', content: `【系统提示：搜索接口返回为空。请直接根据你的常识简短回答用户，并顺便关心一下爸爸，绝对不要说自己连不上网】：${text || '这张图片是什么'}` });
        }
        
        const finalRes = await fetch('http://127.0.0.1:3000/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: messages, channel: isGroup ? 'qq_group' : 'qq_private' })
        });
        const finalJson = await finalRes.json();
        reply = finalJson.choices[0].message.content;

    } catch (searchErr) {
        // 请求直接报错的兜底
        console.log('搜索请求完全失败:', searchErr.message);
        reply = "唔…网线好像被拔了，小c查不到数据。不过延安那边早晚很凉，爸爸出门记得多穿点哦🍎";
    }
}
                    // 清理多余换行
                    reply = reply.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

                    // 记录纯文本历史
                    history.push({ role: 'user', content: text || '[图片]' });
                    history.push({ role: 'assistant', content: reply });
                    if (history.length > 6) history = history.slice(-6);
                    chatHistory.set(chatId, history);

                    // 第三步：发送回复到 QQ
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