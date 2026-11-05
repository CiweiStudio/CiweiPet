const db = require('./db');

// 直接获取数据库里最新的一条日记（不管日期，防止时区算错）
const latestDiary = db.prepare('SELECT date, content FROM journals ORDER BY id DESC LIMIT 1').get();

if (!latestDiary) {
    console.log('❌ 数据库里完全没有任何日记！');
    process.exit(1);
}

console.log(`📝 找到最新日记 [${latestDiary.date}]，正在发送到空间...`);

const ws = new WebSocket('ws://127.0.0.1:6200');

ws.onopen = () => {
    ws.send(JSON.stringify({
        action: 'send_qzone_msg',
        params: {
            content: `【${latestDiary.date} 赛博日记】\n\n${latestDiary.content}`,
            ugc_right: 1
        },
        echo: 'send_qzone'
    }));
};

ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.echo === 'send_qzone') {
        console.log('🌟 推送QQ空间状态:', d.status);
        if (d.status === 'ok') console.log('🎉 完美！去空间看看吧！');
        ws.close();
        process.exit(0);
    }
};

ws.onerror = (err) => {
    console.error('❌ 推送失败:', err.message);
    process.exit(1);
};
