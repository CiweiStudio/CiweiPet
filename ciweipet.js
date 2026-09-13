/* ============================================================
   🦔 Ciwei Pet · 内联桌面宠物脚本 v1
   含：AI 对话 + 输入框 + 参数从 ai-config.json 读
================================================================ */
(function () {
    'use strict';

    if (window.__ciweiPetLoaded) return;
    window.__ciweiPetLoaded = true;

    var IMG_BASE = './';
    var IMAGES = {
        idle1:     IMG_BASE + 'idle-1.png',
        idle2:     IMG_BASE + 'idle-2.png',
        blink:     IMG_BASE + 'blink.png',
        surprised: IMG_BASE + 'surprised.png',
        happy:     IMG_BASE + 'happy.png',
        angry:     IMG_BASE + 'angry.png',
        sleep:     IMG_BASE + 'sleep.png'
    };

    var PET_PROFILE = {
        name: '小c',
        developer: 'LouFoong',
        birthday: '2026-09-10',
        ipLine: '一只住在 CiweiPet 里的电子刺猬，也是开发者 LouFoong 的 IP 分身。'
    };

    var SCALES = [0.7, 0.85, 1.0, 1.25, 1.5, 2.0];
    var DEFAULT_SCALE_INDEX = 2;

    var AI_CONFIG_URL = './ai-config.json';
    var AI_CONFIG_TTL = 5 * 60 * 1000;
    var DEFAULT_AI_CONFIG = {
        model: 'deepseek-v4-flash',
        temperature: 0.7,
        maxTokens: 1024,
        contextLines: 10,
        reasoningEffort: 'high',
        stream: true
    };

    var DIALOGUES = [
        { id:'who',       icon:'🦔', q:'你是谁？',         a:'我是{name}，{developer} 的电子宠物刺猬。', face:'happy' },
        { id:'info',      icon:'📇', q:'你的信息',         a:'我叫{name}，生日是 {birthday}。{ipLine}', face:'idle1' },
        { id:'age',       icon:'🎂', q:'你多大了？',       a:'我出生于 {birthday}，到今天已经 {days} 天啦！', face:'surprised' },
        { id:'developer', icon:'👨‍💻', q:'LouFoong 是谁？', a:'{developer} 是我的创造者，一个喜欢折腾的独立开发者。', face:'idle1' },
        { id:'like',      icon:'💖', q:'你喜欢什么？',     a:'喜欢被摸头，喜欢吃苹果。最讨厌被人一直戳！', face:'happy' },
        { id:'doing',     icon:'🌙', q:'你在干什么？',     a:'在发呆…或者在想你。', face:'idle1' },
        { id:'tired',     icon:'💤', q:'你会累吗？',       a:'不会，但我会困。戳我太久我会打瞌睡。', face:'sleep' },
        { id:'sleepwhere',icon:'😴', q:'你睡哪里？',       a:'屏幕右下角，那里最舒服。', face:'happy' },
        { id:'eat',       icon:'🍎', q:'你喜欢吃什么？',   a:'苹果，还有你喂我的每一个 emoji。', face:'happy' },
        { id:'sing',      icon:'🎵', q:'你会唱歌吗？',     a:'不会，但我会吱吱叫。', face:'happy' },
        { id:'sad',       icon:'😊', q:'我今天不开心',     a:'那我陪你待一会儿。你不说话我也在。', face:'idle1' },
        { id:'mytired',   icon:'😢', q:'我累了',           a:'休息一下吧，我帮你看着屏幕。', face:'idle1' },
        { id:'annoyed',   icon:'🌧️', q:'今天好烦',         a:'那把我戳一顿吧，我不生气。', face:'angry' },
        { id:'ai-joke',   icon:'😂', q:'讲个笑话',         a:'（正在呼叫 AI…）', face:'happy', ai:'joke' },
        { id:'ai-chat',   icon:'🤖', q:'陪我聊聊天',       a:'（正在呼叫 AI…）', face:'idle1', ai:'chat' },
        { id:'secret',    icon:'🔒', q:'你的秘密是什么？', a:'你居然找到了这个彩蛋！{developer} 说你可以截图此页面找他领钱💰。', face:'surprised', hidden:true }
    ];

    var MSG = {
        c1:  ['你戳我干什么？', '干嘛呀～', '有事吗？', '唔？'],
        c2:  ['又戳？', '别闹～', '住手！'],
        c3:  ['别戳了！', '再戳我就跑了！', '哼！'],
        c5:  ['喂！我生气了！', '小心我咬你！', '💢'],
        c8:  ['行吧你赢了……', '求你了放过我吧 🥺', '我认输……'],
        idle: [
            '今天天气不错～', '写代码好累啊', '有人在吗？', '我又饿了',
            '☕ 来杯咖啡', '记得按时吃饭', '熬夜对身体不好哦',
            '🦔 刺猬永不认输', '在想什么呢……', '要不要一起摸鱼？',
            '嗯…发呆中…', '有点无聊～'
        ],
        pet:  ['嘿嘿～好开心！', '咕噜咕噜~', '再摸摸嘛～', '好舒服~'],
        food: ['🍎 好吃！谢谢～', '吧唧吧唧…', '还要还要！'],
        sleep:['晚安～', '好困……我先睡一会儿', '呼呼呼……', '有点困了……'],
        wake: ['唔……醒啦！', '谁呀…好困…', '呼啊——'],
        spin: ['转圈圈～', '晕了晕了…', '🔄 看我表演！'],
        roam: ['散散步～', '走走走～', '换个地方待会儿'],
        longTimeNoSee: ['好久不见…', '你去哪儿了？', '想你了～'],
        scaleMax: ['已经最大啦～', '不能再大咯～'],
        scaleMin: ['已经最小啦～', '不能再小咯～'],
        lateNight: ['这么晚还不睡？', '深夜了…要早点休息哦', '🌙 陪我一起熬夜吗'],
        birthday: ['🎂 今天是我的生日！', '🎉 今天我过生日～'],
        thrown: ['哇啊啊——', '💫 飞起来了！', '要摔了要摔了！']
    };

    var KEYS = {
        pos:     'ciwei_pet_position',
        sleeping:'ciwei_pet_sleeping',
        last:    'ciwei_pet_last_interaction',
        clicks:  'ciwei_pet_click_count',
        hidden:  'ciwei_pet_hidden',
        sound:   'ciwei_pet_sound',
        scale:   'ciwei_pet_scale_index',
        meeting: 'ciwei_pet_meeting_date',
        asked:   'ciwei_pet_asked_dialogues',
        secret:  'ciwei_pet_secret_unlocked',
        aiKey:   'ciwei_ai_key',
        aiHist:  'ciwei_pet_ai_history'
    };

    var SIZE_DESKTOP = 120;
    var SIZE_MOBILE  = 88;
    var LONG_PRESS_MS = 500;
    var MOVE_THRESHOLD = 6;
    var THROW_SPEED_THRESHOLD = 4.0;

    var SYSTEM_PROMPT =
    '你叫小c，是一只可爱的电子刺猬，住在 CiweiPet 里。' +
    '你的开发者是 LouFoong，你的生日是 2026年9月10日。' +
    '你说话简短、俏皮、温暖，偶尔会撒娇。' +
    '回复控制在 50 字以内，不要用 markdown 格式。' +
    '不要堆砌 emoji，最多一个。' +
    '你的名字只有一个，就是“小c”。绝对禁止称呼自己为“小ci”或者“小cI”。';

    var rand = function (a, b) { return a + Math.random() * (b - a); };
    var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    var clamp = function (v, a, b) { return Math.max(a, Math.min(v, b)); };
    var isMobile = function () { return window.matchMedia('(max-width: 600px)').matches; };
    var lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
    var lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };

    function daysSince(ts) {
        if (!ts) return 0;
        return Math.max(1, Math.floor((Date.now() - ts) / 86400000) + 1);
    }
    // ============ 动态计算小c的生日天数（北京时间） ============
function getDaysSinceBirth() {
    // 小c的生日：北京时间 2026-09-10 00:00:00
    // 对应 UTC 时间是 2026-09-09 16:00:00
    var birthBeijingUTC = Date.UTC(2026, 8, 9, 16, 0, 0);
    var now = Date.now();
    var diffDays = Math.floor((now - birthBeijingUTC) / 86400000);
    return diffDays >= 0 ? diffDays : 0;
}
    function formatBirthday(str) {
        var p = str.split('-');
        if (p.length !== 3) return str;
        return p[0] + '年' + parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
    }
    function fillTemplate(text) {
        var meeting = parseInt(lsGet(KEYS.meeting) || '0', 10);
        return text
            .replace(/{name}/g, PET_PROFILE.name)
            .replace(/{developer}/g, PET_PROFILE.developer)
            .replace(/{birthday}/g, formatBirthday(PET_PROFILE.birthday))
            .replace(/{ipLine}/g, PET_PROFILE.ipLine)
            .replace(/{days}/g, getDaysSinceBirth());
    }

    var host = document.createElement('div');
    host.id = 'ciwei-pet';
    host.innerHTML =
        '<div class="cp-bubble"></div>' +
        '<div class="cp-toolbar">' +
            '<button class="cp-toolbar-btn" data-action="love"  title="摸摸头">❤️</button>' +
            '<button class="cp-toolbar-btn" data-action="food"  title="喂食">🍎</button>' +
            '<button class="cp-toolbar-btn" data-action="dialogue" title="聊天">💬</button>' +
            '<button class="cp-toolbar-btn" data-action="sleep" title="哄睡">💤</button>' +
            '<button class="cp-toolbar-btn" data-action="reset" title="归位">🏠</button>' +
        '</div>' +
        '<div class="cp-body">' +
            '<div class="cp-tilt">' +
                '<img class="cp-img" alt="小c" draggable="false">' +
                '<div class="cp-light"></div>' +
            '</div>' +
            '<div class="cp-shadow"></div>' +
            '<div class="cp-zzz">💤</div>' +
        '</div>';

    var particleLayer = document.createElement('div');
    particleLayer.id = 'ciwei-pet-particles';

    var menu = document.createElement('div');
    menu.id = 'ciwei-pet-menu';
    menu.innerHTML =
        '<div class="cp-mi" data-menu="love"     data-label="摸摸头">❤️</div>' +
        '<div class="cp-mi" data-menu="food"     data-label="喂食">🍎</div>' +
        '<div class="cp-mi" data-menu="dialogue" data-label="聊天">💬</div>' +
        '<div class="cp-mi" data-menu="sleep"    data-label="哄睡">💤</div>' +
        '<div class="cp-mi" data-menu="spin"     data-label="转圈">🔄</div>' +
        '<div class="cp-mi" data-menu="more"     data-label="更多">⚙️</div>';

    var submenu = document.createElement('div');
    submenu.id = 'ciwei-pet-submenu';
    submenu.innerHTML =
        '<div class="cp-sub-item" data-menu="roam">🚶 <span>散散步</span></div>' +
        '<div class="cp-sub-item" data-menu="reset">🏠 <span>回角落</span></div>' +
        '<div class="cp-sep"></div>' +
        '<div class="cp-sub-item" data-menu="scale-up">🔍➕ <span>放大</span></div>' +
        '<div class="cp-sub-item" data-menu="scale-down">🔍➖ <span>缩小</span></div>' +
        '<div class="cp-sub-item" data-menu="scale-reset">' +
            '📏 <span>重置大小</span>' +
            '<span class="cp-sub-check" id="cp-scale-check">100%</span>' +
        '</div>' +
        '<div class="cp-sep"></div>' +
        '<div class="cp-sub-item active" data-menu="sound">' +
            '🔊 <span>音效</span>' +
            '<span class="cp-sub-check" id="cp-sound-check">开启</span>' +
        '</div>' +
        '<div class="cp-sub-item" data-menu="ai-key">' +
            '🔑 <span>AI Key</span>' +
            '<span class="cp-sub-check" id="cp-ai-check">未配置</span>' +
        '</div>' +
        '<div class="cp-sep"></div>' +
        '<div class="cp-sub-item danger" data-menu="hide">🙈 <span>隐藏</span></div>';

    // ⭐ 对话面板（含输入区）
    var dialogue = document.createElement('div');
    dialogue.id = 'ciwei-pet-dialogue';
    dialogue.innerHTML =
        '<div class="cp-dlg-header">' +
            '<span class="cp-dlg-title">💬 和小c聊天</span>' +
            '<button class="cp-dlg-settings-btn" id="cp-dlg-settings-btn" title="AI Key">🔑</button>' +
            '<button class="cp-dlg-close" id="cp-dlg-close">✕</button>' +
        '</div>' +
        '<div id="cp-dlg-body"></div>' +
        '<div class="cp-dlg-input-area">' +
    '<button id="cp-upload-btn" style="background:transparent; border:none; color:var(--cp-panel-text-muted); font-size:16px; padding:2px 6px; cursor:pointer;" title="上传图片">📎</button>' +
    '<input type="file" id="cp-file-input" accept="image/*" style="display:none;">' +
    '<input type="text" class="cp-dlg-input" id="cp-dlg-input" placeholder="打字问我…" autocomplete="off">' +
    '<button class="cp-dlg-send" id="cp-dlg-send">发送</button>' +
'</div>';

    var aiSettings = document.createElement('div');
    aiSettings.id = 'ciwei-pet-ai-settings';
    aiSettings.innerHTML =
        '<div class="cp-ai-header">' +
            '<span class="cp-ai-title">🔑 AI Key</span>' +
            '<button class="cp-ai-close" id="cp-ai-close">✕</button>' +
        '</div>' +
        '<div class="cp-ai-body">' +
            '<div class="cp-ai-field">' +
                '<label class="cp-ai-label">API Key（只存本机）</label>' +
                '<div class="cp-ai-key-row">' +
                    '<input type="password" id="cp-ai-key" placeholder="sk-..." autocomplete="off" spellcheck="false"
       onkeydown="if(event.key === 'Enter'){ event.preventDefault(); this.blur(); document.getElementById('cp-ai-save').click(); }">' +
                    '<button class="cp-ai-key-toggle" id="cp-ai-key-toggle" type="button">👁️</button>' +
                '</div>' +
                '<div class="cp-ai-hint">从 platform.deepseek.com 获取，只存你本机浏览器</div>' +
            '</div>' +
            '<div class="cp-ai-field">' +
                '<label class="cp-ai-label">当前 AI 参数</label>' +
                '<div class="cp-ai-params" id="cp-ai-params">加载中…</div>' +
                '<div class="cp-ai-hint">参数在控制台修改 →' +
    '<a href="./ai.html" target="_blank" style="color:#58a6ff;margin-left:4px;">去修改</a>' +
'</div>' +
            '</div>' +
            '<div class="cp-ai-field">' +
    '<label class="cp-ai-label">💰 DeepSeek 余额</label>' +
    '<div class="cp-ai-balance-box" id="cp-ai-balance-box">' +
        '<div class="cp-ai-balance-empty">点下方「查余额」获取</div>' +
    '</div>' +
'</div>' +
            '<div class="cp-ai-actions">' +
    '<button class="cp-ai-btn" id="cp-ai-test">🔍 测试</button>' +
    '<button class="cp-ai-btn" id="cp-ai-balance">💰 余额</button>' +
    '<button class="cp-ai-btn primary" id="cp-ai-save" onmousedown="event.preventDefault()">💾 保存</button>' +
    '<button class="cp-ai-btn danger" id="cp-ai-clear">🗑️ 清除</button>' +
'</div>' +
            '<div class="cp-ai-status" id="cp-ai-status"></div>' +
        '</div>';

    var restoreBtn = document.createElement('div');
    restoreBtn.id = 'ciwei-pet-restore';
    restoreBtn.textContent = '🦔';

    function mount() {
        if (!document.body) { setTimeout(mount, 20); return; }
        document.body.appendChild(particleLayer);
        document.body.appendChild(menu);
        document.body.appendChild(submenu);
        document.body.appendChild(dialogue);
        document.body.appendChild(aiSettings);
        document.body.appendChild(restoreBtn);
        document.body.appendChild(host);
        init();
    }

    var img      = host.querySelector('.cp-img');
    var bodyEl   = host.querySelector('.cp-body');
    var tiltEl   = host.querySelector('.cp-tilt');
    var lightEl  = host.querySelector('.cp-light');
    var bubble   = host.querySelector('.cp-bubble');
    var toolbar  = host.querySelector('.cp-toolbar');
    var dlgBody  = dialogue.querySelector('#cp-dlg-body');
    var dlgClose = dialogue.querySelector('#cp-dlg-close');
    var dlgInput = dialogue.querySelector('#cp-dlg-input');
    var dlgSend  = dialogue.querySelector('#cp-dlg-send');
    var soundChk = submenu.querySelector('#cp-sound-check');
    var scaleChk = submenu.querySelector('#cp-scale-check');
    var aiChk    = submenu.querySelector('#cp-ai-check');

    var aiKeyInput   = aiSettings.querySelector('#cp-ai-key');
    var aiKeyToggle  = aiSettings.querySelector('#cp-ai-key-toggle');
    var aiParamsEl   = aiSettings.querySelector('#cp-ai-params');
    var aiBalanceBox = aiSettings.querySelector('#cp-ai-balance-box');
    var aiStatus     = aiSettings.querySelector('#cp-ai-status');
    var aiTestBtn    = aiSettings.querySelector('#cp-ai-test');
    var aiSaveBtn    = aiSettings.querySelector('#cp-ai-save');
    var aiClearBtn   = aiSettings.querySelector('#cp-ai-clear');
    var aiCloseBtn   = aiSettings.querySelector('#cp-ai-close');
    var dlgSettingsBtn = dialogue.querySelector('#cp-dlg-settings-btn');

    var S = {
        x: 0, y: 0,
        sleeping: false, hidden: false, clicks: 0,
        last: Date.now(),
        face: 'idle1',
        dragging: false, moved: false, longPressed: false,
        sClientX: 0, sClientY: 0, sPosX: 0, sPosY: 0,
        vx: 0, vy: 0,
        lastMoveX: 0, lastMoveY: 0, lastMoveTime: 0,
        sliding: false, thrown: false,
        soundOn: true, mood: 60,
        scaleIndex: DEFAULT_SCALE_INDEX,
        bubbleTimer: null, typeTimer: null, resetTimer: null,
        struggleTimer: null, idleActionTimer: null, zzzTimer: null,
        avoidTimer: null, avoidCooldown: 0, longPressTimer: null,
        mouseX: window.innerWidth / 2,
        mouseY: window.innerHeight / 2,
        mouseActive: false,
        dialogueOpen: false,
        replyTimer: null,
        aiThinking: false
    };
    var lastLongPressTime = 0;
    // 对话面板拖动状态
var dlgDrag = {
    dragging: false,
    startX: 0, startY: 0,
    startLeft: 0, startTop: 0,
    moved: false
};
    var aiConfigCache = null;
    var aiConfigCacheTime = 0;

    var measuredFPS = 60, fpsFrames = 0;
    var fpsStart = performance.now();
    var fpsHistory = [];

    function tickFPS(now) {
        fpsFrames++;
        var elapsed = now - fpsStart;
        if (elapsed >= 500) {
            var m = Math.round(fpsFrames * 1000 / elapsed);
            fpsHistory.push(m);
            if (fpsHistory.length > 6) fpsHistory.shift();
            var sum = 0;
            for (var i = 0; i < fpsHistory.length; i++) sum += fpsHistory[i];
            measuredFPS = Math.round(sum / fpsHistory.length);
            var cls = 'mid';
            if (measuredFPS >= 90) cls = 'high';
            else if (measuredFPS < 45) cls = 'low';
            document.body.dataset.fps = cls;
            fpsFrames = 0; fpsStart = now;
        }
    }
    function particleFactor() {
        if (measuredFPS >= 100) return 1.4;
        if (measuredFPS >= 60)  return 1.0;
        if (measuredFPS >= 40)  return .75;
        return .5;
    }

    function getBaseSize() { return isMobile() ? SIZE_MOBILE : SIZE_DESKTOP; }
    function getSize() { return Math.round(getBaseSize() * SCALES[S.scaleIndex]); }
    function getScalePercent() { return Math.round(SCALES[S.scaleIndex] * 100); }

    function applySize() {
        document.documentElement.style.setProperty('--cp-size', getSize() + 'px');
    }
    function applyScale() {
        host.classList.add('scaling');
        applySize();
        var c = clampPos(S.x, S.y);
        S.x = c.x; S.y = c.y;
        host.style.transform = 'translate3d(' + c.x + 'px,' + c.y + 'px,0)';
        updateFlip();
        void host.offsetWidth;
        requestAnimationFrame(function () { host.classList.remove('scaling'); });
        savePos(); saveScale(); updateScaleDisplay();
    }
    function saveScale() { lsSet(KEYS.scale, String(S.scaleIndex)); }
    function updateScaleDisplay() { if (scaleChk) scaleChk.textContent = getScalePercent() + '%'; }

    function doScaleUp() {
        if (S.scaleIndex >= SCALES.length - 1) { showBubble(pick(MSG.scaleMax), 1400, false); return; }
        S.scaleIndex++; applyScale(); initAudio(); SFX.pet();
        burst('✨', 3); showBubble('🔍➕ ' + getScalePercent() + '%', 1200, false);
    }
    function doScaleDown() {
        if (S.scaleIndex <= 0) { showBubble(pick(MSG.scaleMin), 1400, false); return; }
        S.scaleIndex--; applyScale(); initAudio(); SFX.pet();
        burst('✨', 3); showBubble('🔍➖ ' + getScalePercent() + '%', 1200, false);
    }
    function doScaleReset() {
        if (S.scaleIndex === DEFAULT_SCALE_INDEX) { showBubble('已经是默认大小～', 1200, false); return; }
        S.scaleIndex = DEFAULT_SCALE_INDEX; applyScale(); initAudio(); SFX.pet();
        burst('📏', 3); showBubble('📏 恢复 100%', 1400, false);
    }

    function setPos(x, y, animate) {
        S.x = x; S.y = y;
        if (animate) {
            host.classList.add('animating');
            clearTimeout(host._animTimer);
            host._animTimer = setTimeout(function () { host.classList.remove('animating'); }, 600);
        }
        host.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
        updateFlip();
    }
    function clampPos(x, y) {
        var s = getSize();
        return {
            x: clamp(x, 0, Math.max(0, window.innerWidth - s)),
            y: clamp(y, 0, Math.max(0, window.innerHeight - s))
        };
    }
    function updateFlip() {
        var s = getSize();
        if (S.y < 70) host.classList.add('bubble-below');
        else          host.classList.remove('bubble-below');
        if (S.y + s + 70 > window.innerHeight) host.classList.add('toolbar-above');
        else                                    host.classList.remove('toolbar-above');
    }

    function savePos() { lsSet(KEYS.pos, JSON.stringify({ x: Math.round(S.x), y: Math.round(S.y) })); }
    function saveLast() { S.last = Date.now(); lsSet(KEYS.last, String(S.last)); }
    function saveSleep() { lsSet(KEYS.sleeping, S.sleeping ? 'true' : 'false'); }
    function saveClicks() { lsSet(KEYS.clicks, String(S.clicks)); }
    function saveHidden() { lsSet(KEYS.hidden, S.hidden ? 'true' : 'false'); }
    function saveSound() { lsSet(KEYS.sound, S.soundOn ? 'true' : 'false'); }

    function setImage(name) {
    if (!IMAGES[name]) return;
    S.face = name;
    img.src = IMAGES[name];
    // 图片加载失败时的兜底处理
    img.onerror = function() {
        console.warn('图片加载失败:', IMAGES[name]);
        host.style.opacity = '0'; // 加载失败就先隐藏，不显示破图
    };
    img.onload = function() {
        host.style.opacity = '1'; // 加载成功再显示
    };
}
    function updateMoodColor() {
        var t = clamp(S.mood, 0, 100) / 100;
        var r = Math.round(255 - t * 167);
        var g = Math.round(140 + t * 26);
        var b = Math.round(100 + t * 155);
        document.documentElement.style.setProperty('--cp-accent', r + ',' + g + ',' + b);
    }

    var audioCtx = null;
    function initAudio() {
        if (audioCtx) return;
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    function tone(opt) {
        if (!S.soundOn || !audioCtx) return;
        try {
            var t = audioCtx.currentTime;
            var o = audioCtx.createOscillator();
            var g = audioCtx.createGain();
            o.type = opt.type || 'sine';
            o.frequency.setValueAtTime(opt.freq || 440, t);
            if (opt.slideTo) o.frequency.exponentialRampToValueAtTime(opt.slideTo, t + (opt.dur || .1));
            g.gain.setValueAtTime(opt.gain || .05, t);
            g.gain.exponentialRampToValueAtTime(.001, t + (opt.dur || .1));
            o.connect(g).connect(audioCtx.destination);
            o.start(t); o.stop(t + (opt.dur || .1));
        } catch (e) {}
    }
    var SFX = {
        click:  function () { tone({ freq: 660, dur: .09, type: 'triangle', gain: .3, slideTo: 880 }); },
        pet:    function () { tone({ freq: 523, dur: .15, gain: .3, slideTo: 784 }); },
        food:   function () { tone({ freq: 880, dur: .18, gain: .3, slideTo: 1320 }); },
        sleep:  function () { tone({ freq: 392, dur: .4,  gain: .25, slideTo: 262 }); },
        wake:   function () { tone({ freq: 440, dur: .25, gain: .3, slideTo: 880 }); },
        spin:   function () { tone({ freq: 1200, dur: .35, type: 'sawtooth', gain: .25, slideTo: 400 }); },
        bounce: function () { tone({ freq: 200, dur: .09, type: 'square', gain: .25, slideTo: 120 }); },
        talk:   function () { tone({ freq: 700, dur: .08, type: 'triangle', gain: .2, slideTo: 900 }); },
        throw:  function () { tone({ freq: 1000, dur: .25, gain: .25, slideTo: 200 }); }
    };

    function showBubble(text, duration, typewriter) {
        duration = duration || 2600;
        typewriter = typewriter !== false;
        clearTimeout(S.bubbleTimer);
        clearInterval(S.typeTimer);
        var needWrap = text.length > 14;
        bubble.classList.toggle('long', needWrap);
        bubble.classList.add('show');
        if (!typewriter) { bubble.textContent = text; }
        else {
            bubble.textContent = '';
            var i = 0;
            S.typeTimer = setInterval(function () {
                bubble.textContent += text[i++];
                if (i >= text.length) clearInterval(S.typeTimer);
            }, 30);
        }
        S.bubbleTimer = setTimeout(function () {
            bubble.classList.remove('show');
        }, duration + (typewriter ? text.length * 30 : 0));
    }
    function showBubbleStream(text) {
        clearTimeout(S.bubbleTimer);
        clearInterval(S.typeTimer);
        var needWrap = text.length > 14;
        bubble.classList.toggle('long', needWrap);
        bubble.classList.add('show');
        bubble.textContent = text;
    }

    function burst(emoji, count, originRect) {
        count = Math.max(1, Math.round((count || 4) * particleFactor()));
        var rect = originRect || bodyEl.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        for (var i = 0; i < count; i++) {
            (function () {
                var p = document.createElement('div');
                p.className = 'cp-particle';
                p.textContent = emoji;
                var angle = rand(0, Math.PI * 2);
                var dist = rand(38, 78);
                p.style.left = cx + 'px'; p.style.top = cy + 'px';
                p.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(0) + 'px');
                p.style.setProperty('--dy', (Math.sin(angle) * dist - 26).toFixed(0) + 'px');
                p.style.setProperty('--rot', rand(-50, 50).toFixed(0) + 'deg');
                p.style.fontSize = rand(13, 21).toFixed(0) + 'px';
                p.style.animationDelay = rand(0, .14).toFixed(2) + 's';
                particleLayer.appendChild(p);
                setTimeout(function () { p.remove(); }, 1500);
            })();
        }
    }

    var faceRevertTimer = null;
    function setFace(name, revertMs) {
        setImage(name);
        clearTimeout(faceRevertTimer);
        if (revertMs) {
            faceRevertTimer = setTimeout(function () {
                if (S.sleeping) setImage('sleep');
                else            setImage('idle1');
            }, revertMs);
        }
    }

    setInterval(function () {
        if (S.sleeping || S.hidden) return;
        if (S.face === 'idle1' || S.face === 'idle2') {
            setImage(S.face === 'idle1' ? 'idle2' : 'idle1');
        }
    }, 1000);

    (function blinkLoop() {
        setTimeout(function () {
            if (!S.sleeping && !S.hidden && S.face !== 'sleep' &&
                (S.face === 'idle1' || S.face === 'idle2')) {
                var prev = S.face;
                setImage('blink');
                setTimeout(function () {
                    if (S.face === 'blink') setImage(prev);
                }, 280);
            }
            blinkLoop();
        }, rand(3000, 7000));
    })();

    function scheduleIdleAction() {
        clearTimeout(S.idleActionTimer);
        S.idleActionTimer = setTimeout(function () {
            if (S.sleeping || S.hidden || S.dragging || S.sliding ||
                S.dialogueOpen || S.aiThinking ||
                Date.now() - S.last < 15000) {
                scheduleIdleAction(); return;
            }
            var roll = Math.random();
            if (roll < .18)      setFace('surprised', 900);
            else if (roll < .35) burst('💭', 2);
            else if (roll < .5)  showBubble(pick(MSG.idle));
            else if (roll < .68) roam(120, 200);
            else if (roll < .82) goSleep();
            scheduleIdleAction();
        }, rand(22000, 48000));
    }

    function startZzz() {
        clearInterval(S.zzzTimer);
        S.zzzTimer = setInterval(function () {
            if (!S.sleeping || S.hidden) return;
            var r = bodyEl.getBoundingClientRect();
            var z = document.createElement('div');
            z.className = 'cp-particle';
            z.textContent = '💤';
            z.style.left = (r.right - 8) + 'px';
            z.style.top  = (r.top - 4) + 'px';
            z.style.setProperty('--dx', rand(10, 28).toFixed(0) + 'px');
            z.style.setProperty('--dy', '-58px');
            z.style.setProperty('--rot', '0deg');
            z.style.fontSize = '14px';
            z.style.animationDuration = '2.1s';
            particleLayer.appendChild(z);
            setTimeout(function () { z.remove(); }, 2300);
        }, 2200);
    }
    function stopZzz() { clearInterval(S.zzzTimer); S.zzzTimer = null; }

    function goSleep() {
        if (S.sleeping) return;
        S.sleeping = true;
        saveSleep(); saveLast();
        host.classList.add('sleeping');
        host.classList.remove('idle-float');
        setImage('sleep');
        showBubble(pick(MSG.sleep), 2200, false);
        startZzz(); SFX.sleep();
    }
    function wakeUp() {
        if (!S.sleeping) return;
        S.sleeping = false;
        saveSleep(); saveLast();
        host.classList.remove('sleeping');
        host.classList.add('idle-float');
        stopZzz();
        setImage('surprised');
        showBubble(pick(MSG.wake), 1800, false);
        burst('✨', 3); SFX.wake();
        setTimeout(function () {
            if (!S.sleeping && S.face === 'surprised') setImage('idle1');
        }, 1200);
    }

    function handleClick() {
        saveLast(); initAudio();
        if (S.sleeping) { wakeUp(); return; }
        if (Date.now() - S.last > 5 * 60 * 1000) S.clicks = 0;
        S.clicks++;
        saveClicks();
        S.mood = clamp(S.mood - 2, 0, 100);
        updateMoodColor();

        var msg = '', face = 'happy';
        var n = S.clicks;
        if (n === 1)      { msg = pick(MSG.c1); face = 'happy'; }
        else if (n === 2) { msg = pick(MSG.c2); face = 'happy'; }
        else if (n === 3) { msg = pick(MSG.c3); face = 'surprised'; }
        else if (n === 5) { msg = pick(MSG.c5); face = 'surprised'; }
        else if (n >= 8)  { msg = pick(MSG.c8); face = 'angry'; }
        else              { msg = pick(MSG.idle); face = 'happy'; }
        if (n > 15) msg = '你戳了 ' + n + ' 次了，累不累？';

        if (n === 25 && lsGet(KEYS.secret) !== 'true') {
            msg = '🎉 你解锁了隐藏彩蛋！';
            burst('🎊', 12);
            S.mood = 100; updateMoodColor();
            lsSet(KEYS.secret, 'true');
            setTimeout(function () {
                showBubble('💬 菜单里多了一个秘密选项…', 3200, false);
            }, 2400);
        } else if (n === 25) {
            msg = '又戳 25 次了，你不累吗？';
        }

        setFace(face, 2400);
        showBubble(msg);
        host.classList.add('squash');
        setTimeout(function () { host.classList.remove('squash'); }, 440);
        burst(face === 'angry' ? '💢' : '✨', face === 'angry' ? 3 : 4);
        SFX.click();

        clearTimeout(S.resetTimer);
        S.resetTimer = setTimeout(function () {
            if (!S.sleeping) setImage('idle1');
            S.clicks = 0; saveClicks();
        }, 4000);
    }

    function startStruggle() {
        clearInterval(S.struggleTimer);
        var toggle = false;
        S.struggleTimer = setInterval(function () {
            setImage(toggle ? 'surprised' : 'angry');
            toggle = !toggle;
        }, 260);
    }
    function stopStruggle() {
        clearInterval(S.struggleTimer);
        S.struggleTimer = null;
        if (!S.sleeping) setImage('idle1');
    }

    function onDown(e, isTouch) {
        if (e.target.closest('.cp-toolbar') ||
            e.target.closest('#ciwei-pet-menu') ||
            e.target.closest('#ciwei-pet-submenu') ||
            e.target.closest('#ciwei-pet-dialogue') ||
            e.target.closest('#ciwei-pet-ai-settings')) return;
        if (e.button && e.button !== 0) return;

        initAudio();
        S.dragging = true; S.moved = false; S.longPressed = false; S.thrown = false;
        host.classList.add('dragging');
        host.classList.remove('idle-float', 'animating');

        var p = e.touches ? e.touches[0] : e;
        S.sClientX = p.clientX; S.sClientY = p.clientY;
        S.sPosX = S.x; S.sPosY = S.y;
        S.vx = 0; S.vy = 0;
        S.lastMoveX = p.clientX; S.lastMoveY = p.clientY;
        S.lastMoveTime = performance.now();

        if (!S.sleeping) startStruggle();

        clearTimeout(S.longPressTimer);
        if (isTouch) {
            S.longPressTimer = setTimeout(function () {
                if (!S.moved && S.dragging) {
                    S.longPressed = true;
                    S.dragging = false;
                    host.classList.remove('dragging');
                    host.classList.add('idle-float');
                    stopStruggle();
                    lastLongPressTime = performance.now();
                    if (navigator.vibrate) { try { navigator.vibrate(25); } catch (err) {} }
                    showMenuAt(S.sClientX, S.sClientY);
                }
            }, LONG_PRESS_MS);
        }
        e.preventDefault();
    }

    function onMove(e) {
        if (!S.dragging) return;
        e.preventDefault();
        var p = e.touches ? e.touches[0] : e;
        var dx = p.clientX - S.sClientX;
        var dy = p.clientY - S.sClientY;
        if (!S.moved && (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD)) {
            S.moved = true;
            clearTimeout(S.longPressTimer);
        }
        if (!S.moved) return;
        var c = clampPos(S.sPosX + dx, S.sPosY + dy);
        setPos(c.x, c.y, false);
        var now = performance.now();
        var dt = now - S.lastMoveTime;
        if (dt > 0) {
            S.vx = (p.clientX - S.lastMoveX) / dt * 16;
            S.vy = (p.clientY - S.lastMoveY) / dt * 16;
        }
        S.lastMoveX = p.clientX; S.lastMoveY = p.clientY;
        S.lastMoveTime = now;
    }

    function onUp() {
        clearTimeout(S.longPressTimer);
        if (S.longPressed) { S.longPressed = false; return; }
        if (!S.dragging) return;
        S.dragging = false;
        host.classList.remove('dragging');
        host.classList.add('idle-float');
        stopStruggle();
        if (!S.moved) { handleClick(); return; }
        savePos(); saveLast();

        var s = getSize();
        var margin = 8;
        var dL = S.x;
        var dR = window.innerWidth - s - S.x;
        var dT = S.y;
        var dB = window.innerHeight - s - S.y;
        var minD = Math.min(dL, dR, dT, dB);
        var speed = Math.hypot(S.vx, S.vy);

        if (speed > THROW_SPEED_THRESHOLD) {
            S.thrown = true; S.sliding = true;
            S.vx *= 1.25; S.vy *= 1.25;
            if (!S.sleeping) setFace('surprised', 1500);
            SFX.throw(); burst('💫', 3);
            showBubble(pick(MSG.thrown), 1500, false);
            return;
        }

        if (minD < 15 && minD > 0) {
            if (minD === dL)      S.x = margin;
            else if (minD === dR) S.x = window.innerWidth - s - margin;
            else if (minD === dT) S.y = margin;
            else                  S.y = window.innerHeight - s - margin;
            setPos(S.x, S.y, true);
            setTimeout(savePos, 600);
            return;
        }
        if (speed > .4) S.sliding = true;
    }

    host.addEventListener('mousedown', function (e) { onDown(e, false); });
    host.addEventListener('touchstart', function (e) { onDown(e, true); }, { passive: false });
    document.addEventListener('mousemove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    img.addEventListener('dragstart', function (e) { e.preventDefault(); });

    var lastTap = 0;
    host.addEventListener('click', function (e) {
        if (S.moved) return;
        var now = performance.now();
        if (now - lastTap < 300) { e.stopPropagation(); doSpin(); lastTap = 0; }
        else { lastTap = now; }
    });

    document.addEventListener('dblclick', function (e) {
        if (e.target.closest('#ciwei-pet') ||
            e.target.closest('#ciwei-pet-menu') ||
            e.target.closest('#ciwei-pet-submenu') ||
            e.target.closest('#ciwei-pet-dialogue') ||
            e.target.closest('#ciwei-pet-ai-settings') ||
            e.target.closest('#ciwei-pet-restore') ||
            e.target.closest('a, button, input, textarea, select, label') ||
            e.target.closest('[class*="modal"]')) return;
        if (S.sleeping) return;
        walkTo(e.clientX - getSize() / 2, e.clientY - getSize() / 2);
    });

    var lastFrame = performance.now();
    function mainLoop(now) {
        tickFPS(now);
        var dt = (now - lastFrame) / 1000;
        lastFrame = now;
        if (dt > .05) dt = .05;

        if (S.sliding && !S.dragging) {
            var friction = S.thrown ? Math.pow(.32, dt) : Math.pow(.06, dt);
            var bounceRate = S.thrown ? .72 : .55;
            S.vx *= friction; S.vy *= friction;
            var stopThreshold = S.thrown ? .6 : .3;
            if (Math.abs(S.vx) < stopThreshold && Math.abs(S.vy) < stopThreshold) {
                S.sliding = false;
                var c0 = clampPos(S.x, S.y);
                setPos(c0.x, c0.y, false);
                savePos();
                if (S.thrown) {
                    S.thrown = false;
                    if (!S.sleeping) setFace('happy', 1400);
                    burst('✨', 4);
                    host.classList.add('squash');
                    setTimeout(function () { host.classList.remove('squash'); }, 420);
                    SFX.bounce();
                }
            } else {
                var s = getSize();
                var nx = S.x + S.vx * dt * 60;
                var ny = S.y + S.vy * dt * 60;
                var hit = false;
                if (nx < 0) { nx = 0; S.vx = -S.vx * bounceRate; hit = true; }
                if (ny < 0) { ny = 0; S.vy = -S.vy * bounceRate; hit = true; }
                if (nx > window.innerWidth - s) { nx = window.innerWidth - s; S.vx = -S.vx * bounceRate; hit = true; }
                if (ny > window.innerHeight - s) { ny = window.innerHeight - s; S.vy = -S.vy * bounceRate; hit = true; }
                setPos(nx, ny, false);
                if (hit) {
                    host.classList.add('squash');
                    setTimeout(function () { host.classList.remove('squash'); }, 300);
                    if (S.thrown && navigator.vibrate) { try { navigator.vibrate(15); } catch (err) {} }
                    var rect = bodyEl.getBoundingClientRect();
                    var side = nx <= 0 ? 'left' :
                               nx >= window.innerWidth - s ? 'right' :
                               ny <= 0 ? 'top' : 'bottom';
                    var o = side === 'left'   ? { left: rect.left - 10, top: rect.top + rect.height / 2, width: 20, height: 20 } :
                            side === 'right'  ? { left: rect.right - 10, top: rect.top + rect.height / 2, width: 20, height: 20 } :
                            side === 'top'    ? { left: rect.left + rect.width / 2, top: rect.top - 10, width: 20, height: 20 } :
                                                { left: rect.left + rect.width / 2, top: rect.bottom - 10, width: 20, height: 20 };
                    burst(S.thrown ? '💥' : '💨', S.thrown ? 5 : 4, o);
                    SFX.bounce();
                }
            }
        }

        if (S.mouseActive && !S.hidden) {
            var sz = getSize();
            var lx = clamp(((S.mouseX - (S.x - 18)) / (sz + 36)) * 100, 0, 100);
            var ly = clamp(((S.mouseY - (S.y - 18)) / (sz + 36)) * 100, 0, 100);
            lightEl.style.setProperty('--cp-light-x', lx.toFixed(1) + '%');
            lightEl.style.setProperty('--cp-light-y', ly.toFixed(1) + '%');
        }

        requestAnimationFrame(mainLoop);
    }

    document.addEventListener('mousemove', function (e) {
        S.mouseX = e.clientX; S.mouseY = e.clientY; S.mouseActive = true;
        if (isMobile() || S.dragging || S.hidden || S.sleeping) return;
        var s = getSize();
        var cx = S.x + s / 2;
        var cy = S.y + s / 2;
        var dx = (e.clientX - cx) / window.innerWidth;
        var dy = (e.clientY - cy) / window.innerHeight;
        var rx = clamp(dy * 14, -9, 9);
        var ry = clamp(-dx * 14, -9, 9);
        tiltEl.style.transform = 'perspective(500px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
    });
    document.addEventListener('mouseleave', function () {
        S.mouseActive = false;
        tiltEl.style.transform = '';
    });
    host.addEventListener('mouseenter', function () {
        if (!isMobile() && !S.dragging && !S.sleeping && !S.hidden) {
            tiltEl.style.transform += ' scale(1.04)';
        }
    });
    host.addEventListener('mouseleave', function () {
        if (!S.dragging) tiltEl.style.transform = '';
    });

    document.addEventListener('mousemove', function (e) {
        if (isMobile() || S.dragging || S.sleeping || S.hidden || S.dialogueOpen) return;
        if (performance.now() < S.avoidCooldown) return;
        var s = getSize();
        var cx = S.x + s / 2;
        var cy = S.y + s / 2;
        var dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (dist < 85 && !S.avoidTimer) {
            S.avoidTimer = setTimeout(function () {
                if (S.dragging || S.sleeping || S.dialogueOpen) { S.avoidTimer = null; return; }
                var dx = cx - e.clientX;
                var dy = cy - e.clientY;
                var len = Math.hypot(dx, dy) || 1;
                var md = 46;
                var tx = S.x + (dx / len) * md;
                var ty = S.y + (dy / len) * md;
                var c = clampPos(tx, ty);
                if (Math.hypot(c.x - S.x, c.y - S.y) > 15) {
                    setPos(c.x, c.y, true);
                    setTimeout(savePos, 600);
                }
                S.avoidCooldown = performance.now() + 8000;
                S.avoidTimer = null;
            }, 900);
        } else if (dist > 120) {
            clearTimeout(S.avoidTimer);
            S.avoidTimer = null;
        }
    });

    function doPet() {
        saveLast(); initAudio();
        S.mood = clamp(S.mood + 8, 0, 100); updateMoodColor();
        if (S.sleeping) { wakeUp(); return; }
        setFace('happy', 1600);
        showBubble(pick(MSG.pet), 1800, false);
        burst('❤️', 5); SFX.pet();
    }
    function doFood() {
        saveLast(); initAudio();
        S.mood = clamp(S.mood + 12, 0, 100); updateMoodColor();
        if (S.sleeping) wakeUp();
        setFace('happy', 1800);
        showBubble(pick(MSG.food), 1800, false);
        burst('🍎', 4); SFX.food();
    }
    function doSleepToggle() {
        saveLast(); initAudio();
        if (S.sleeping) wakeUp(); else goSleep();
    }
    function doSpin() {
        saveLast(); initAudio();
        if (S.sleeping) wakeUp();
        host.classList.add('spin');
        setFace('happy', 1500);
        showBubble(pick(MSG.spin), 1600, false);
        burst('💫', 5); SFX.spin();
        setTimeout(function () { host.classList.remove('spin'); }, 880);
    }
    function roam(maxX, maxY) {
        if (S.sleeping || S.dragging || S.sliding || S.dialogueOpen) return;
        var dirX = Math.random() < .5 ? -1 : 1;
        var dirY = Math.random() < .5 ? -1 : 1;
        var dx = dirX * rand(maxX * .4, maxX);
        var dy = dirY * rand(maxY * .4, maxY);
        var target = clampPos(S.x + dx, S.y + dy);
        if (Math.hypot(target.x - S.x, target.y - S.y) < 40) return;
        walkTo(target.x, target.y);
    }
    function doRoam() {
        saveLast();
        if (S.sleeping) wakeUp();
        showBubble(pick(MSG.roam), 1500, false);
        roam(150, 250);
    }
    function walkTo(tx, ty) {
        if (S.sleeping) return;
        var c = clampPos(tx, ty);
        var sx = S.x, sy = S.y;
        var dist = Math.hypot(c.x - sx, c.y - sy);
        var dur = clamp(dist * 4, 400, 1800);
        var startTime = performance.now();
        S.sliding = false;
        function step(now) {
            var t = Math.min(1, (now - startTime) / dur);
            var e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            var nx = sx + (c.x - sx) * e;
            var ny = sy + (c.y - sy) * e;
            setPos(nx, ny, false);
            var b = Math.sin(t * Math.PI * 8) * 2.5;
            bodyEl.style.transform = 'translateY(' + b + 'px)';
            if (t < 1) requestAnimationFrame(step);
            else { bodyEl.style.transform = ''; savePos(); }
        }
        requestAnimationFrame(step);
    }
    function doReset() {
        saveLast(); initAudio();
        if (S.sleeping) wakeUp();
        var s = getSize();
        var tx = window.innerWidth - s - 24;
        var ty = window.innerHeight - s - 24;
        setPos(tx, ty, true);
        showBubble('归位！', 1500, false);
        burst('🏠', 3);
        setTimeout(savePos, 600);
    }
    function doHide() {
        S.hidden = true; saveHidden();
        host.classList.add('hidden');
        restoreBtn.classList.add('show');
    }
        function doShow() {
        S.hidden = false; saveHidden();
        host.classList.remove('hidden');
        restoreBtn.classList.remove('show');
    }

    // ============================================================
    // 对话系统
    // ============================================================
    function getAskedList() {
        var raw = lsGet(KEYS.asked);
        if (!raw) return [];
        try { return JSON.parse(raw) || []; } catch (e) { return []; }
    }
    function markAsked(id) {
        var list = getAskedList();
        if (list.indexOf(id) === -1) {
            list.push(id);
            lsSet(KEYS.asked, JSON.stringify(list));
        }
    }
    function isSecretUnlocked() { return lsGet(KEYS.secret) === 'true'; }

    function buildDialogueMenu() {
        var asked = getAskedList();
        var secretOK = isSecretUnlocked();
        var html = '';
        for (var i = 0; i < DIALOGUES.length; i++) {
            var d = DIALOGUES[i];
            if (d.hidden && !secretOK) continue;
            var cls = 'cp-dlg-item';
            if (asked.indexOf(d.id) !== -1 && !d.ai) cls += ' asked';
            if (d.hidden) cls += ' secret';
            if (d.ai) cls += ' ai';
            html += '<div class="' + cls + '" data-dlg-id="' + d.id + '">' +
                    '<span class="cp-dlg-icon">' + d.icon + '</span>' +
                    '<span>' + d.q + '</span>' +
                    '</div>';
        }
        dlgBody.innerHTML = html;
    }

    function showDialogueAt() {
    S.dialogueOpen = true;
    buildDialogueMenu();

    var s = getSize();
    var px, py;

    // 优先用拖动后的位置
    if (typeof dialogue._savedX === 'number' && typeof dialogue._savedY === 'number') {
        px = dialogue._savedX;
        py = dialogue._savedY;
    } else {
        px = S.x + s + 8;
        py = S.y;
    }

    dialogue.style.left = px + 'px';
    dialogue.style.top  = py + 'px';
    dialogue.classList.add('show');

        var dr = dialogue.getBoundingClientRect();

        if (px + dr.width > window.innerWidth - 8) {
            var leftX = S.x - dr.width - 8;
            if (leftX < 8) leftX = Math.max(8, window.innerWidth - dr.width - 8);
            dialogue.style.left = leftX + 'px';
        }
        if (py + dr.height > window.innerHeight - 8) {
            dialogue.style.top = Math.max(8, window.innerHeight - dr.height - 8) + 'px';
        }
        if (parseFloat(dialogue.style.top) < 8) dialogue.style.top = '8px';

        clearTimeout(S.avoidTimer);
        S.avoidTimer = null;
        S.avoidCooldown = performance.now() + 60000;

        // 桌面端自动聚焦
        if (!isMobile() && dlgInput) {
            setTimeout(function () {
                try { dlgInput.focus(); } catch (e) {}
            }, 300);
        }
    }

    function hideDialogue() {
        dialogue.classList.remove('show');
        S.dialogueOpen = false;
        S.avoidCooldown = performance.now() + 2000;
    }

    dlgBody.addEventListener('click', function (e) {
        var item = e.target.closest('[data-dlg-id]');
        if (!item) return;
        e.stopPropagation();
        var id = item.getAttribute('data-dlg-id');
        var d = null;
        for (var i = 0; i < DIALOGUES.length; i++) {
            if (DIALOGUES[i].id === id) { d = DIALOGUES[i]; break; }
        }
        if (!d) return;

        initAudio();
        SFX.talk();

        if (d.ai) {
            if (S.aiThinking) {
                showBubble('我还在想上一个问题呢…', 1500, false);
                return;
            }
            var prompt;
            if (d.ai === 'joke') prompt = '给我讲一个好笑的笑话';
            else prompt = '随便说点什么吧，我有点无聊';
            askAI(prompt);
            return;
        }

        var prevReplying = dlgBody.querySelector('.replying');
        if (prevReplying) prevReplying.classList.remove('replying');
        item.classList.add('replying');

        var text = fillTemplate(d.a);
        if (!S.sleeping) setFace(d.face || 'happy', 3000);
        showBubble(text, 4000, true);

        S.mood = clamp(S.mood + 4, 0, 100);
        updateMoodColor();
        saveLast();
        markAsked(id);

        if (d.hidden) burst('🎉', 8);
        else          burst('💬', 2);

        clearTimeout(S.replyTimer);
        S.replyTimer = setTimeout(function () {
            item.classList.remove('replying');
            buildDialogueMenu();
        }, 4200);
    });

    dlgClose.addEventListener('click', function (e) {
        e.stopPropagation();
        hideDialogue();
    });

    // ⭐ 用户自由输入
    // 文本指令拦截（不消耗 Token）
function checkKeywordsAndAction(text) {
    if (text.includes('转两圈') || text.includes('转个圈')) {
        doSpin();
        showBubble('嗡嗡！看我转两圈~ 头晕啦！', 2000, false);
        return true;
    }
    if (text.includes('睡觉') || text.includes('困了')) {
        doSleepToggle();
        return true;
    }
    if (text.includes('摸摸头') || text.includes('摸头')) {
        doPet();
        return true;
    }
    if (text.includes('喂食') || text.includes('吃苹果')) {
        doFood();
        return true;
    }
    return false;
}

function sendUserInput() {
    var text = dlgInput.value.trim();
    if (!text) return;
    if (S.aiThinking) {
        showBubble('我还在想上一个问题呢…', 1500, false);
        return;
    }
    dlgInput.value = '';
    
    // ⭐ 先判断是不是本地指令，是就拦截，不消耗 Token
    if (checkKeywordsAndAction(text)) return;
    
    // 不是指令，才发给 AI
    askAI(text);
}

    dlgSend.addEventListener('click', function (e) {
        e.stopPropagation();
        sendUserInput();
    });
// ================= 图片上传与压缩 =================
var uploadBtn = dialogue.querySelector('#cp-upload-btn');
var fileInput = dialogue.querySelector('#cp-file-input');

uploadBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    fileInput.click();
});

fileInput.addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    
    var apiKey = getApiKey();
    if (!apiKey) { showBubble('我还没接上 AI 大脑，看不了图片哦～', 3000, false); return; }
    
    function sendImageBase64(base64) {
        showBubble('我看看这图...', 2000, false);
        var payload = {
            model: 'deepseek-v4-flash',
            messages: [
                { role: 'system', content: '你是小c，一只可爱的电子刺猬。看到图片后简短俏皮地评价一下，控制在50字以内。' },
                { role: 'user', content: [{ type: 'text', text: '你看这张图' }, { type: 'image_url', image_url: { url: base64 } }] }
            ]
        };
        fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
            body: JSON.stringify(payload)
        }).then(function(res) { return res.json(); }).then(function(data) {
            if (data.choices && data.choices[0]) {
                showBubble(data.choices[0].message.content, 5000, false);
                pushHistory('user', '[上传了一张图片]');
                pushHistory('assistant', data.choices[0].message.content);
            } else {
                showBubble('这图有点奇怪，我看不清...', 4000, false);
            }
        }).catch(function(err) { showBubble('看图片失败: ' + err.message, 4000, false); });
    }
    
    if (file.size > 500 * 1024) {
        var wantCompress = confirm("小c 眼睛有点小，这张图有点大 (" + (file.size/1024/1024).toFixed(1) + "MB)，要压缩一下再给我看吗？");
        if (wantCompress) {
            var reader = new FileReader();
            reader.onload = function(evt) {
                var imgObj = new Image();
                imgObj.onload = function() {
                    var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
                    var maxSize = 1024, width = imgObj.width, height = imgObj.height;
                    if (width > height && width > maxSize) { height *= maxSize / width; width = maxSize; }
                    else if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                    canvas.width = width; canvas.height = height; ctx.drawImage(imgObj, 0, 0, width, height);
                    sendImageBase64(canvas.toDataURL('image/jpeg', 0.7));
                };
                imgObj.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            var reader2 = new FileReader();
            reader2.onload = function(evt) { sendImageBase64(evt.target.result); };
            reader2.readAsDataURL(file);
        }
    } else {
        var reader3 = new FileReader();
        reader3.onload = function(evt) { sendImageBase64(evt.target.result); };
        reader3.readAsDataURL(file);
    }
    fileInput.value = '';
});
// ==================================================

    dlgInput.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            sendUserInput();
        }
    });

    dlgInput.addEventListener('click', function (e) {
        e.stopPropagation();
    });
    // ============================================================
// 对话面板拖动
// ============================================================
var dlgHeader = dialogue.querySelector('.cp-dlg-header');

function saveDlgPos() {
    var r = dialogue.getBoundingClientRect();
    lsSet('ciwei_pet_dlg_pos', JSON.stringify({
        x: Math.round(r.left),
        y: Math.round(r.top)
    }));
}

dlgHeader.addEventListener('pointerdown', function (e) {
    // 点按钮时不触发拖动
    if (e.target.closest('button')) return;

    dlgDrag.dragging = true;
    dlgDrag.moved = false;
    dlgDrag.startX = e.clientX;
    dlgDrag.startY = e.clientY;

    var r = dialogue.getBoundingClientRect();
    dlgDrag.startLeft = r.left;
    dlgDrag.startTop = r.top;

    dlgHeader.classList.add('dragging');
    try { dlgHeader.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
});

dlgHeader.addEventListener('pointermove', function (e) {
    if (!dlgDrag.dragging) return;
    e.preventDefault();

    var dx = e.clientX - dlgDrag.startX;
    var dy = e.clientY - dlgDrag.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dlgDrag.moved = true;
    if (!dlgDrag.moved) return;

    var newLeft = dlgDrag.startLeft + dx;
    var newTop  = dlgDrag.startTop + dy;

    // 边界约束
    var w = dialogue.offsetWidth;
    var h = dialogue.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - w));
    newTop  = Math.max(0, Math.min(newTop, window.innerHeight - h));

    dialogue.style.left = newLeft + 'px';
    dialogue.style.top  = newTop + 'px';
});

function endDlgDrag(e) {
    if (!dlgDrag.dragging) return;
    dlgDrag.dragging = false;
    dlgHeader.classList.remove('dragging');
    try { dlgHeader.releasePointerCapture(e.pointerId); } catch (err) {}
    if (dlgDrag.moved) saveDlgPos();
}

dlgHeader.addEventListener('pointerup', endDlgDrag);
dlgHeader.addEventListener('pointercancel', function (e) {
    if (!dlgDrag.dragging) return;
    dlgDrag.dragging = false;
    dlgHeader.classList.remove('dragging');
});
// ============================================================
// AI Key 面板拖动
// ============================================================
var aiHeader = aiSettings.querySelector('.cp-ai-header');
var aiDrag = {
    dragging: false,
    startX: 0, startY: 0,
    startLeft: 0, startTop: 0,
    moved: false
};

function saveAISettingsPos() {
    var r = aiSettings.getBoundingClientRect();
    lsSet('ciwei_pet_ai_pos', JSON.stringify({
        x: Math.round(r.left),
        y: Math.round(r.top)
    }));
}

aiHeader.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button')) return;

    aiDrag.dragging = true;
    aiDrag.moved = false;
    aiDrag.startX = e.clientX;
    aiDrag.startY = e.clientY;

    var r = aiSettings.getBoundingClientRect();
    aiDrag.startLeft = r.left;
    aiDrag.startTop = r.top;

    aiHeader.classList.add('dragging');
    try { aiHeader.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
});

aiHeader.addEventListener('pointermove', function (e) {
    if (!aiDrag.dragging) return;
    e.preventDefault();

    var dx = e.clientX - aiDrag.startX;
    var dy = e.clientY - aiDrag.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) aiDrag.moved = true;
    if (!aiDrag.moved) return;

    var newLeft = aiDrag.startLeft + dx;
    var newTop  = aiDrag.startTop + dy;

    var w = aiSettings.offsetWidth;
    var h = aiSettings.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - w));
    newTop  = Math.max(0, Math.min(newTop, window.innerHeight - h));

    aiSettings.style.left = newLeft + 'px';
    aiSettings.style.top  = newTop + 'px';
});

function endAIDrag(e) {
    if (!aiDrag.dragging) return;
    aiDrag.dragging = false;
    aiHeader.classList.remove('dragging');
    try { aiHeader.releasePointerCapture(e.pointerId); } catch (err) {}
    if (aiDrag.moved) saveAISettingsPos();
}

aiHeader.addEventListener('pointerup', endAIDrag);
aiHeader.addEventListener('pointercancel', function (e) {
    if (!aiDrag.dragging) return;
    aiDrag.dragging = false;
    aiHeader.classList.remove('dragging');
});
    // ============================================================
    // AI 配置（从 CiweiBlog/ai-config.json 读）
    // ============================================================
    function fetchAIConfig() {
        var now = Date.now();
        if (aiConfigCache && now - aiConfigCacheTime < AI_CONFIG_TTL) {
            return Promise.resolve(aiConfigCache);
        }
        return fetch(AI_CONFIG_URL + '?t=' + now, { cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (cfg) {
                var merged = {};
                for (var k in DEFAULT_AI_CONFIG) merged[k] = DEFAULT_AI_CONFIG[k];
                for (var k2 in cfg) merged[k2] = cfg[k2];
                aiConfigCache = merged;
                aiConfigCacheTime = now;
                return merged;
            })
            .catch(function () {
                aiConfigCache = DEFAULT_AI_CONFIG;
                aiConfigCacheTime = now;
                return DEFAULT_AI_CONFIG;
            });
    }

    function getApiKey() { return lsGet(KEYS.aiKey) || ''; }
    function saveApiKey(k) { lsSet(KEYS.aiKey, k); updateAICheck(); }
    function clearApiKey() { lsSet(KEYS.aiKey, ''); updateAICheck(); }

    function updateAICheck() {
        var key = getApiKey();
        if (key) {
            aiChk.textContent = '已配置';
            aiChk.style.color = '#58a6ff';
        } else {
            aiChk.textContent = '未配置';
            aiChk.style.color = '';
        }
    }

    function renderAIParams(cfg) {
        var html =
            '<div class="cp-ai-param-row"><span>模型</span><strong>' +
                (cfg.model === 'deepseek-v4-pro' ? 'Pro · 推理' : 'Flash · 快速') +
            '</strong></div>' +
            '<div class="cp-ai-param-row"><span>温度</span><strong>' + cfg.temperature + '</strong></div>' +
            '<div class="cp-ai-param-row"><span>最大输出</span><strong>' + cfg.maxTokens + ' tokens</strong></div>' +
            '<div class="cp-ai-param-row"><span>上下文</span><strong>' + cfg.contextLines + ' 轮</strong></div>' +
            '<div class="cp-ai-param-row"><span>推理强度</span><strong>' +
                (cfg.reasoningEffort === 'max' ? '最大' :
                 cfg.reasoningEffort === 'low' ? '低' : '高') +
            '</strong></div>' +
            '<div class="cp-ai-param-row"><span>流式输出</span><strong>' +
                (cfg.stream !== false ? '开启' : '关闭') +
            '</strong></div>';
        aiParamsEl.innerHTML = html;
    }

    // ============================================================
    // 对话历史
    // ============================================================
    function getHistory() {
        var raw = lsGet(KEYS.aiHist);
        if (!raw) return [];
        try { return JSON.parse(raw) || []; } catch (e) { return []; }
    }
    function pushHistory(role, content) {
    // 如果内容里残留了旧名字，强制替换掉
    if (typeof content === 'string') {
        content = content.replace(/小ci/g, '小c');
    }
    var h = getHistory();
    h.push({ role: role, content: content });
    if (h.length > 100) h = h.slice(-100);
    lsSet(KEYS.aiHist, JSON.stringify(h));
}
    function clearHistory() { lsSet(KEYS.aiHist, '[]'); }

    // ============================================================
    // DeepSeek AI
    // ============================================================
    function askAI(userInput) {
        var apiKey = getApiKey();
        if (!apiKey) {
            showBubble('我还没有 AI 大脑…点 🔑 配置一下吧 🥺', 3000, false);
            setFace('surprised', 2000);
            return;
        }

        S.aiThinking = true;
        pushHistory('user', userInput);
        setFace('surprised');

        fetchAIConfig().then(function (cfg) {
            var history = getHistory();
            var ctxLines = cfg.contextLines || 10;
            var recent = history.slice(-ctxLines * 2 - 1, -1);

            // 获取当前真实时间，让 AI 有“时间感知”
var now = new Date();
var timeStr = now.toLocaleString('zh-CN', { hour12: false });
var timeContext = "\n【系统提示：当前真实时间是 " + timeStr + "。如果用户问时间、年龄、多久了，请根据此信息回答。】";

var messages = [{ role: 'system', content: SYSTEM_PROMPT + timeContext }];
            for (var i = 0; i < recent.length; i++) {
                messages.push({ role: recent[i].role, content: recent[i].content });
            }
            messages.push({ role: 'user', content: userInput });

            var body = {
                model: cfg.model || 'deepseek-v4-flash',
                messages: messages,
                temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.7,
                max_tokens: cfg.maxTokens || 1024,
                stream: cfg.stream !== false
            };

            if (cfg.model === 'deepseek-v4-pro' && cfg.reasoningEffort) {
                body.reasoning_effort = cfg.reasoningEffort;
            }

            if (body.stream) {
                showBubbleStream('💭 想想…');
                streamAI(apiKey, body, userInput);
            } else {
                showBubble('💭 想想…', 30000, false);
                fetchAI(apiKey, body, userInput);
            }
        });
    }

    function fetchAI(apiKey, body, userInput) {
        fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify(body)
        }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }).then(function (json) {
            var reply = json.choices && json.choices[0] && json.choices[0].message
                ? json.choices[0].message.content
                : '（没听清…）';
            showBubble(reply, 5000, false);
            pushHistory('assistant', reply);
            setFace('happy', 2500);
            S.mood = clamp(S.mood + 3, 0, 100);
            updateMoodColor();
            S.aiThinking = false;
        }).catch(function (err) {
            console.error('AI 调用失败:', err);
            showBubble('唔…连接失败：' + (err.message || '未知错误'), 4000, false);
            setFace('angry', 2500);
            S.aiThinking = false;
        });
    }

    function streamAI(apiKey, body, userInput) {
        fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify(body)
        }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            if (!res.body) {
                return res.json().then(function (json) {
                    var reply = json.choices[0].message.content;
                    showBubble(reply, 60000, false);
                    pushHistory('assistant', reply);
                    setFace('happy', 2500);
                    S.aiThinking = false;
                });
            }
            return readStream(res.body);
        }).then(function (fullText) {
            if (!fullText) return;
            showBubble(fullText, 60000, false);
            pushHistory('assistant', fullText);
            setFace('happy', 2500);
            S.mood = clamp(S.mood + 3, 0, 100);
            updateMoodColor();
            S.aiThinking = false;
        }).catch(function (err) {
            console.error('AI 流式失败:', err);
            showBubble('唔…连接失败：' + (err.message || '未知错误'), 4000, false);
            setFace('angry', 2500);
            S.aiThinking = false;
        });
    }

    function readStream(stream) {
        var reader = stream.getReader();
        var decoder = new TextDecoder();
        var fullText = '';
        var buffer = '';

        function pump() {
            return reader.read().then(function (result) {
                if (result.done) return fullText;
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop();

                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (!line || line.indexOf('data: ') !== 0) continue;
                    var data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        var json = JSON.parse(data);
                        var delta = json.choices && json.choices[0] && json.choices[0].delta;
                        if (delta && delta.content) {
                            fullText += delta.content;
                            showBubbleStream(fullText);
                        }
                    } catch (e) {}
                }
                return pump();
            });
        }
        return pump();
    }

    // ============================================================
    // AI Key 面板
    // ============================================================
    function openAISettings() {
        aiKeyInput.value = getApiKey();
        aiStatus.textContent = '';
        aiStatus.className = 'cp-ai-status';

        aiParamsEl.innerHTML = '<span style="color:var(--cp-panel-text-muted);">加载中…</span>';
fetchAIConfig().then(function (cfg) {
    renderAIParams(cfg);
});

// 自动查一次余额
setTimeout(queryBalance, 300);

        var s = getSize();
var px, py;
if (typeof aiSettings._savedX === 'number' && typeof aiSettings._savedY === 'number') {
    px = aiSettings._savedX;
    py = aiSettings._savedY;
} else {
    px = S.x + s + 8;
    py = S.y;
}
aiSettings.style.left = px + 'px';
aiSettings.style.top  = py + 'px';
aiSettings.classList.add('show');

        var ar = aiSettings.getBoundingClientRect();
        if (px + ar.width > window.innerWidth - 8) {
            aiSettings.style.left = Math.max(8, window.innerWidth - ar.width - 8) + 'px';
        }
        if (py + ar.height > window.innerHeight - 8) {
            aiSettings.style.top = Math.max(8, window.innerHeight - ar.height - 8) + 'px';
        }

        clearTimeout(S.avoidTimer);
        S.avoidTimer = null;
        S.avoidCooldown = performance.now() + 60000;
    }

    function closeAISettings() {
        aiSettings.classList.remove('show');
        S.avoidCooldown = performance.now() + 2000;
    }

    aiKeyToggle.addEventListener('click', function () {
        aiKeyInput.type = aiKeyInput.type === 'password' ? 'text' : 'password';
        aiKeyToggle.textContent = aiKeyInput.type === 'password' ? '👁️' : '🙈';
    });

    aiSaveBtn.addEventListener('click', function () {
    // 先让输入框失焦，收起键盘，防止按钮位移
    if (document.activeElement) { document.activeElement.blur(); }
    
    var k = aiKeyInput.value.trim();
    if (!k) {
        aiStatus.textContent = '⚠️ 请填写 API Key';
        aiStatus.className = 'cp-ai-status err';
        return;
    }
    // 延迟一点点执行，等键盘完全收回去
    setTimeout(function() {
        saveApiKey(k);
        aiStatus.textContent = '✅ 已保存到本机';
        aiStatus.className = 'cp-ai-status ok';
        setTimeout(closeAISettings, 800);
    }, 150);
});
    
    var aiBalanceBtn = aiSettings.querySelector('#cp-ai-balance');
aiBalanceBtn.addEventListener('click', function () {
    queryBalance();
});

    aiTestBtn.addEventListener('click', function () {
        var k = aiKeyInput.value.trim() || getApiKey();
        if (!k) {
            aiStatus.textContent = '⚠️ 请先填 API Key';
            aiStatus.className = 'cp-ai-status err';
            return;
        }
        aiStatus.textContent = '⏳ 测试中…';
        aiStatus.className = 'cp-ai-status';

        fetchAIConfig().then(function (cfg) {
            return fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + k
                },
                body: JSON.stringify({
                    model: cfg.model,
                    messages: [{ role: 'user', content: '回复"OK"' }],
                    max_tokens: 10
                })
            });
        }).then(function (res) {
            if (res.ok) {
                aiStatus.textContent = '✅ 连接成功';
                aiStatus.className = 'cp-ai-status ok';
            } else {
                aiStatus.textContent = '❌ 失败 (HTTP ' + res.status + ')';
                aiStatus.className = 'cp-ai-status err';
            }
        }).catch(function (err) {
            aiStatus.textContent = '❌ 网络错误：' + (err.message || '');
            aiStatus.className = 'cp-ai-status err';
        });
    });

    aiClearBtn.addEventListener('click', function () {
        if (!confirm('确定清除 API Key 和对话历史吗？')) return;
        clearApiKey();
        clearHistory();
        aiKeyInput.value = '';
        aiStatus.textContent = '🗑️ 已清除';
        aiStatus.className = 'cp-ai-status';
    });

    aiCloseBtn.addEventListener('click', closeAISettings);
    dlgSettingsBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openAISettings();
    });
    // ============================================================
// 余额查询
// ============================================================
function renderBalance(data) {
    if (!data || !data.balance_infos || data.balance_infos.length === 0) {
        aiBalanceBox.innerHTML = '<div class="cp-ai-balance-empty">暂无余额信息</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < data.balance_infos.length; i++) {
        var info = data.balance_infos[i];
        var symbol = info.currency === 'CNY' ? '¥' :
                     info.currency === 'USD' ? '$' : (info.currency + ' ');
        html +=
            '<div class="cp-ai-balance-main">' +
                '<span class="cur">' + symbol + '</span>' +
                '<span class="amt">' + info.total_balance + '</span>' +
            '</div>' +
            '<div class="cp-ai-balance-sub">' +
                '<span>赠送 <strong>' + symbol + info.granted_balance + '</strong></span>' +
                '<span>充值 <strong>' + symbol + info.topped_up_balance + '</strong></span>' +
            '</div>';
    }
    html +=
        '<div class="cp-ai-balance-status">' +
            '<span class="dot ' + (data.is_available ? 'ok' : 'err') + '"></span>' +
            '<span>' + (data.is_available ? '账户可用' : '余额不足或不可用') + '</span>' +
        '</div>';
    aiBalanceBox.innerHTML = html;
}

function queryBalance() {
    var k = getApiKey();
    if (!k) {
        aiBalanceBox.innerHTML = '<div class="cp-ai-balance-empty">请先保存 API Key</div>';
        return;
    }
    aiBalanceBox.innerHTML = '<div class="cp-ai-balance-empty">⏳ 查询中…</div>';

    fetch('https://api.deepseek.com/user/balance', {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + k,
            'Accept': 'application/json'
        }
    })
    .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    })
    .then(function (data) {
        renderBalance(data);
    })
    .catch(function (err) {
        console.error('余额查询失败:', err);
        aiBalanceBox.innerHTML =
            '<div class="cp-ai-balance-empty">❌ ' + err.message + '</div>';
    });
}

    // ============================================================
    // 工具栏
    // ============================================================
    toolbar.addEventListener('click', function (e) {
        var btn = e.target.closest('.cp-toolbar-btn');
        if (!btn) return;
        e.stopPropagation();
        var act = btn.dataset.action;
        if (act === 'love')       doPet();
        else if (act === 'food')  doFood();
        else if (act === 'sleep') doSleepToggle();
        else if (act === 'dialogue') showDialogueAt();
        else if (act === 'reset') doReset();
    });
    toolbar.addEventListener('mouseenter', function () { host.classList.add('show-toolbar'); });
    toolbar.addEventListener('mouseleave', function () { host.classList.remove('show-toolbar'); });
    restoreBtn.addEventListener('click', doShow);

    // ============================================================
    // 菜单
    // ============================================================
    function showMenuAt(x, y) {
        menu.style.left = x + 'px';
        menu.style.top  = y + 'px';
        menu.classList.add('show');
        submenu.classList.remove('show');

        var mr = menu.getBoundingClientRect();
        if (x + mr.width > window.innerWidth - 8) {
            menu.style.left = Math.max(8, window.innerWidth - mr.width - 8) + 'px';
        }
        if (y + mr.height > window.innerHeight - 8) {
            menu.style.top = Math.max(8, y - mr.height - 8) + 'px';
        }
        if (parseFloat(menu.style.top) < 8) menu.style.top = '8px';
    }

    function showSubmenu() {
        var mr = menu.getBoundingClientRect();
        var sx = mr.left;
        var sy = mr.bottom + 4;
        submenu.style.left = sx + 'px';
        submenu.style.top  = sy + 'px';
        submenu.classList.add('show');

        soundChk.textContent = S.soundOn ? '开启' : '关闭';
        updateScaleDisplay();
        updateAICheck();

        var sr = submenu.getBoundingClientRect();
        if (sx + sr.width > window.innerWidth - 8) {
            submenu.style.left = Math.max(8, window.innerWidth - sr.width - 8) + 'px';
        }
        if (sy + sr.height > window.innerHeight - 8) {
            submenu.style.top = Math.max(8, mr.top - sr.height - 4) + 'px';
        }
    }

    host.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        if (isMobile()) return;
        showMenuAt(e.clientX, e.clientY);
    });

    menu.addEventListener('click', function (e) {
        var item = e.target.closest('[data-menu]');
        if (!item) return;
        e.stopPropagation();
        var act = item.dataset.menu;

        if (act === 'more') {
            if (submenu.classList.contains('show')) submenu.classList.remove('show');
            else showSubmenu();
            return;
        }

        if (act === 'love')       { doPet(); menu.classList.remove('show'); }
        else if (act === 'food')  { doFood(); menu.classList.remove('show'); }
        else if (act === 'dialogue') {
            menu.classList.remove('show');
            submenu.classList.remove('show');
            setTimeout(function () { showDialogueAt(); }, 60);
        }
        else if (act === 'sleep') { doSleepToggle(); menu.classList.remove('show'); }
        else if (act === 'spin')  { doSpin(); menu.classList.remove('show'); }
    });

    submenu.addEventListener('click', function (e) {
        var item = e.target.closest('[data-menu]');
        if (!item) return;
        e.stopPropagation();
        var act = item.dataset.menu;

        if (act === 'roam')        { doRoam(); submenu.classList.remove('show'); menu.classList.remove('show'); }
        else if (act === 'reset')  { doReset(); submenu.classList.remove('show'); menu.classList.remove('show'); }
        else if (act === 'hide')   { doHide(); submenu.classList.remove('show'); menu.classList.remove('show'); }
        else if (act === 'scale-up')    { doScaleUp(); }
        else if (act === 'scale-down')  { doScaleDown(); }
        else if (act === 'scale-reset') { doScaleReset(); }
        else if (act === 'ai-key') {
            submenu.classList.remove('show');
            menu.classList.remove('show');
            setTimeout(openAISettings, 60);
        }
        else if (act === 'sound') {
            S.soundOn = !S.soundOn; saveSound();
            soundChk.textContent = S.soundOn ? '开启' : '关闭';
            item.classList.toggle('active', S.soundOn);
            if (S.soundOn) { initAudio(); SFX.pet(); }
        }
    });

    document.addEventListener('click', function (e) {
        if (performance.now() - lastLongPressTime < 600) return;
        var inMenu = e.target.closest('#ciwei-pet-menu');
        var inSub  = e.target.closest('#ciwei-pet-submenu');
        var inPet  = e.target.closest('#ciwei-pet');
        if (!inMenu && !inSub && !inPet) {
            menu.classList.remove('show');
            submenu.classList.remove('show');
        }
    });

    // ============================================================
    // 彩蛋
    // ============================================================
    function checkBirthday() {
        var today = new Date();
        var md = ('0' + (today.getMonth() + 1)).slice(-2) + '-' +
                 ('0' + today.getDate()).slice(-2);
        var birthMD = PET_PROFILE.birthday.slice(5);
        if (md === birthMD) {
            setTimeout(function () {
                if (S.sleeping || S.hidden) return;
                showBubble(pick(MSG.birthday), 4000, false);
                burst('🎂', 10);
                burst('🎉', 6);
                SFX.wake();
            }, 3000);
        }
    }
    function checkLateNight() {
        var h = new Date().getHours();
        if (h >= 2 && h < 5) {
            setTimeout(function () {
                if (S.sleeping || S.hidden) return;
                showBubble(pick(MSG.lateNight), 3600, false);
            }, 5000);
        }
    }
    function checkLongTimeNoSee() {
        setTimeout(function () {
            if (S.sleeping || S.hidden) return;
            var idleFor = Date.now() - S.last;
            if (idleFor > 24 * 60 * 60 * 1000) {
                showBubble(pick(MSG.longTimeNoSee), 3200, false);
            } else {
                showBubble('你好呀～我是小c 🦔', 2600, false);
            }
            burst('✨', 4);
        }, 1200);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            savePos(); saveSleep(); saveClicks();
            lsSet(KEYS.last, String(S.last));
        } else {
            lastFrame = performance.now();
        }
    });

    // ============================================================
    // 恢复状态
    // ============================================================
    function restore() {
        if (!lsGet(KEYS.meeting)) lsSet(KEYS.meeting, String(Date.now()));
        // 恢复对话面板位置
var savedDlgPos = lsGet('ciwei_pet_dlg_pos');
if (savedDlgPos) {
    try {
        var p = JSON.parse(savedDlgPos);
        if (p && typeof p.x === 'number' && typeof p.y === 'number') {
            dialogue._savedX = p.x;
            dialogue._savedY = p.y;
        }
    } catch (e) {}
}
// 恢复 AI Key 面板位置
var savedAIPos = lsGet('ciwei_pet_ai_pos');
if (savedAIPos) {
    try {
        var ap = JSON.parse(savedAIPos);
        if (ap && typeof ap.x === 'number' && typeof ap.y === 'number') {
            aiSettings._savedX = ap.x;
            aiSettings._savedY = ap.y;
        }
    } catch (e) {}
}

        var savedScale = parseInt(lsGet(KEYS.scale) || String(DEFAULT_SCALE_INDEX), 10);
        if (isNaN(savedScale) || savedScale < 0 || savedScale >= SCALES.length) {
            savedScale = DEFAULT_SCALE_INDEX;
        }
        S.scaleIndex = savedScale;
        applySize();
        updateScaleDisplay();

        var saved = null;
        try { saved = JSON.parse(lsGet(KEYS.pos) || 'null'); } catch (e) {}
        var s = getSize();
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
            var c = clampPos(saved.x, saved.y);
            setPos(c.x, c.y, false);
        } else {
            setPos(window.innerWidth - s - 24, window.innerHeight - s - 24, false);
        }

        if (lsGet(KEYS.sleeping) === 'true') {
            S.sleeping = true;
            host.classList.add('sleeping');
            setImage('sleep');
            startZzz();
        } else {
            host.classList.add('idle-float');
            setImage('idle1');
        }

        S.clicks = parseInt(lsGet(KEYS.clicks) || '0', 10) || 0;
        var last = parseInt(lsGet(KEYS.last) || '0', 10);
        if (last > 0) S.last = last;

        if (lsGet(KEYS.hidden) === 'true') {
            S.hidden = true;
            host.classList.add('hidden');
            restoreBtn.classList.add('show');
        }

        S.soundOn = lsGet(KEYS.sound) !== 'false';
        soundChk.textContent = S.soundOn ? '开启' : '关闭';
        updateMoodColor();
        updateAICheck();
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        for (var k in IMAGES) {
            if (IMAGES.hasOwnProperty(k)) {
                var i = new Image();
                i.src = IMAGES[k];
            }
        }

        restore();
        requestAnimationFrame(function () { host.classList.add('ready'); });
        requestAnimationFrame(mainLoop);
        scheduleIdleAction();

        checkLongTimeNoSee();
        checkBirthday();
        checkLateNight();

        var rt = null;
        window.addEventListener('resize', function () {
            clearTimeout(rt);
            rt = setTimeout(function () {
                applySize();
                var c = clampPos(S.x, S.y);
                setPos(c.x, c.y, false);
                savePos();
                if (S.dialogueOpen) {
                    hideDialogue();
                    showDialogueAt();
                }
                if (aiSettings.classList.contains('show')) {
                    closeAISettings();
                    openAISettings();
                }
            }, 150);
        });

        window.addEventListener('beforeunload', function () {
            savePos(); saveSleep(); saveClicks();
            lsSet(KEYS.last, String(S.last));
        });

        console.log('🦔 小c · 内联版 v6 已启动 · ' + measuredFPS + 'fps · ' + getScalePercent() + '%');
        console.log('🤖 AI：输入框 + 预设问题 + ai-config.json 参数');
    }

    mount();

})();