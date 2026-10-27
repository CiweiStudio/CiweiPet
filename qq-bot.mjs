// 🦔 小c 纯原生 QQ 网关 (已绑定 QQ 号)
const wsUrl = 'ws://127.0.0.1:6200'; 
const MY_QQ = 2586279833; 
const BOT_QQ = 1262884085; 

let reconnectTimer = null;

function connect() {
    console.log('正在连接 NapCat WS...');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('✅ 成功接入 NapCat！小c 灵魂已接管 QQ！');
    };

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.post_type === 'message') {
                const isGroup = data.message_type === 'group';
                let text = '';
                let isAtMe = false;

                if (Array.isArray(data.message)) {
                    data.message.forEach(m => {
                        if (m.type === 'text') text += m.data.text;
                        if (m.type === 'at' && String(m.data.qq) === String(BOT_QQ)) isAtMe = true;
                    });
                } else if (typeof data.message === 'string') {
                    text = data.message.replace(/\[CQ:at,qq=\d+\]/g, '');
                    if (data.message.includes(`[CQ:at,qq=${BOT_QQ}]`)) isAtMe = true;
                }

                if (!isGroup || isAtMe) {
                    text = text.trim();
                    if (!text) return;

                    const senderQQ = data.user_id;
                    const isDad = (senderQQ === MY_QQ);
                    const senderName = data.sender?.card || data.sender?.nickname || '群友';

                    console.log(`[收到消息] ${isGroup ? '群' : '私聊'} - ${senderName}(${senderQQ}): ${text}`);

                    // 极其严厉的格式限制
                    const prompt = `【系统提示：当前对话用户是${isDad ? '创造者LouFung(爸爸)' : '普通群友'}。回复必须是一段连贯的话，绝对禁止换行，最多 50 字。】\n用户说：${text}`;

                    try {
                        const res = await fetch('http://127.0.0.1:3000/v1/chat/completions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
                        });
                        const json = await res.json();
                        let reply = json.choices[0].message.content;

                        // 强行干掉所有换行符
                        reply = reply.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

                        const action = isGroup ? 'send_group_msg' : 'send_private_msg';
                        const params = isGroup ? { group_id: data.group_id, message: reply } : { user_id: senderQQ, message: reply };

                        ws.send(JSON.stringify({ action, params }));
                        console.log(`[小c 回复] ${reply}`);
                    } catch (err) {
                        console.error('❌ 请求小c大脑失败:', err.message);
                    }
                }
            }
        } catch (e) {
            console.error('解析消息出错:', e.message);
        }
    };

    ws.onclose = () => {
        console.log('❌ 与 NapCat 断开连接，5秒后尝试重连...');
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
        console.log('WebSocket 错误: 端口没通，或者被占用');
    };
}

// 启动连接
connect();
