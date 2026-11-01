const db = require('./db');
const now = new Date();
const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const r = db.prepare('SELECT content FROM journals WHERE date=?').get(today);
if (!r) { console.log('❌ 没找到日记'); process.exit(1); }
const ws = new WebSocket('ws://127.0.0.1:6200');
ws.onopen = () => {
    console.log('✅ WebSocket 已连接，正在发送...');
    ws.send(JSON.stringify({ action: 'send_private_msg', params: { user_id: 2586279833, message: '【' + today + ' 赛博日记】\n\n' + r.content }, echo: 'send_diary' }));
};
ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.echo === 'send_diary') {
        console.log('✅ 发送状态:', d.status);
        if(d.status === 'ok') console.log('🎉 完美！去QQ看日记吧！');
        ws.close(); process.exit(0);
    }
};
ws.onerror = () => console.error('❌ WS失败');
