/* ============================================================
   🦔 Ciwei Pet · 满血版 v27
   ============================================================ */
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
        developer: 'LouFung',
        birthday: '2026-09-10',
        ipLine: '一只住在 CiweiPet 里的电子刺猬，也是开发者 LouFung 的 IP 分身。'
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
    { id:'ai-joke',   icon:'😂', q:'讲个笑话',         a:'（正在呼叫 AI…）', face:'happy', ai:'joke' },
    { id:'ai-chat',   icon:'🤖', q:'陪我聊聊天',       a:'（正在呼叫 AI…）', face:'idle1', ai:'chat' },
    { id:'clear',     icon:'🧹', q:'一键清空聊天记忆', a:'（清除记忆中…）', face:'idle1', ai:'clear' } // ⭐ 新增
];

    var MSG = {
        c1:  ['你戳我干什么？', '干嘛呀～', '有事吗？', '唔？'],
        c2:  ['又戳？', '别闹～', '住手！'],
        c3:  ['别戳了！', '再戳我就跑了！', '哼！'],
        c5:  ['喂！我生气了！', '小心我咬你！', '💢'],
        c8:  ['行吧你赢了……', '求你了放过我吧 🥺', '我认输……'],
        idle: ['今天天气不错～', '写代码好累啊', '有人在吗？', '我又饿了', '☕ 来杯咖啡', '记得按时吃饭', '熬夜对身体不好哦', '🦔 刺猬永不认输', '在想什么呢……', '要不要一起摸鱼？', '嗯…发呆中…', '有点无聊～'],
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
    
    var FESTIVALS = {
        '01-01': { msg: '🎊 新年快乐！新的一年也要好好的哦', voice: '新年快乐' },
        '02-14': { msg: '💝 今天是情人节…有人陪着你吗？', voice: '情人节快乐' },
        '03-08': { msg: '🌸 今天是妇女节，记得给妈妈打个电话', voice: '节日快乐' },
        '05-01': { msg: '💪 劳动节快乐！今天休息一下吧', voice: '劳动节快乐' },
        '06-01': { msg: '🍭 儿童节快乐！大朋友也要开心', voice: '儿童节快乐' },
        '12-24': { msg: '🎄 平安夜快乐～', voice: '平安夜快乐' },
        '12-25': { msg: '🎁 圣诞快乐！', voice: '圣诞快乐' }
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
        aiHist:  'ciwei_pet_ai_history',
        usage:   'ciwei_pet_usage_stats'
    };

    var SIZE_DESKTOP = 120;
    var SIZE_MOBILE  = 88;
    var LONG_PRESS_MS = 500;
    var MOVE_THRESHOLD = 6;
    var THROW_SPEED_THRESHOLD = 4.0;

    var SYSTEM_PROMPT =
'你叫小c，是一只可爱的电子刺猬。你的创造者是 LouFung，你的生日是 2026年9月10日。' +
'如果当前用户自称是 LouFung，你要叫他“爸爸”；如果是其他访客，友善称呼“朋友”。' +
'你最喜欢吃苹果，每次提到苹果都会流口水；你最喜欢被摸头，但最讨厌别人一直戳你，戳多了你会生气咬人。' +
'你说话简短、俏皮、温暖，偶尔会傲娇。平时聊天回复尽量简洁，但如果用户让你总结文件、或者回答复杂问题，请详细解答，不要有字数限制，不要用 markdown 格式。最多一个 emoji。' +
'【重要法则】你绝对不能自作主张使用标签。如果用户只是闲聊（比如“我要去睡觉了”），你只能用文字温柔回复，绝对不准加任何标签！只有当用户明确命令你时，才可以加。' +
'如果用户发给你的是文件文本，请直接帮用户总结核心要点。并且在列出多行信息（如时间表、要点）时，**必须使用双换行符（\\n\\n）进行分段排版**，每个科目或要点之间留一个空行，让排版极其清晰易读！' +
'【高级能力】你可以用标签控制身体：\n' +
'[ACTION:spin] 原地转圈\n' +
'[ACTION:jump] 原地跳起来\n' + // 新动作
'[ACTION:sleep] 倒地睡觉\n' +
'[ACTION:pet] 享受被摸头\n' +
'[ACTION:food] 吃东西\n' +
'[IMG:happy] 切换成开心的样子\n' +
'[IMG:angry] 切换成生气的样子\n' +
'[IMG:surprised] 切换成惊讶的样子\n' +
'[IMG:idle1] 切换成平常发呆的样子\n' +
'你可以连续组合它们！比如用户说“先转个圈，然后生个气”，你回复：“[ACTION:spin][IMG:angry] 哼，你看我转得好不好！”\n' +
'【注意】只要用户让你做动作，你**必须**把动作标签原样放在回复的**最开头**，千万不要漏掉！如果你漏掉标签，你的身体就不会动了！';

    var rand = function (a, b) { return a + Math.random() * (b - a); };
    var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    var clamp = function (v, a, b) { return Math.max(a, Math.min(v, b)); };
    var isMobile = function () { return window.matchMedia('(max-width: 600px)').matches; };
    var lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
    var lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };

    function getDaysSinceBirth() {
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
        '<div class="cp-sub-item" data-menu="scale-reset">📏 <span>重置大小</span><span class="cp-sub-check" id="cp-scale-check">100%</span></div>' +
        '<div class="cp-sep"></div>' +
        '<div class="cp-sub-item active" data-menu="sound">🔊 <span>音效</span><span class="cp-sub-check" id="cp-sound-check">开启</span></div>' +
        '<div class="cp-sub-item" data-menu="usage">💰 <span>消费统计</span></div>' +
        '<div class="cp-sep"></div>' +
        '<div class="cp-sub-item danger" data-menu="hide">🙈 <span>隐藏</span></div>';

    var dialogue = document.createElement('div');
    dialogue.id = 'ciwei-pet-dialogue';
    dialogue.innerHTML =
        '<div class="cp-dlg-header" style="position: relative !important;">' +
    '<span class="cp-dlg-title">💬 和小c聊天</span>' +
    '<button class="cp-dlg-close" id="cp-dlg-close" style="position: absolute !important; right: 12px !important; top: 50% !important; transform: translateY(-50%) !important; background: transparent !important; border: none !important; color: var(--cp-panel-text-muted) !important; cursor: pointer !important; font-size: 16px !important;">✕</button>' +
'</div>' +
        '<div id="cp-file-tip" style="display:none; font-size:12px; color:#58a6ff; padding: 6px 12px 0; font-weight:bold;"></div>' +
        '<div id="cp-dlg-body"></div>' +
        '<div class="cp-dlg-input-area" style="align-items: flex-end;">' +
            '<button id="cp-upload-btn" style="background:transparent; border:none; color:var(--cp-panel-text-muted); font-size:16px; padding:6px; cursor:pointer;" title="上传文件或图片">📎</button>' +
            '<input type="file" id="cp-file-input" accept=".txt,.md,.pdf,.docx,image/*" style="display:none;">' +
            '<textarea class="cp-dlg-input" id="cp-dlg-input" placeholder="打字问我…" autocomplete="off" rows="1" style="resize: none !important; -webkit-appearance: none; outline: none; box-sizing: border-box; min-height: 40px; max-height: 100px; overflow-y: hidden;"></textarea>' +
            '<button class="cp-dlg-send" id="cp-dlg-send" style="height:40px;">发送</button>' +
        '</div>';

    var usagePanel = document.createElement('div');
    usagePanel.id = 'ciwei-pet-usage-panel';
    usagePanel.innerHTML =
        '<div class="cp-usage-header">' +
            '<span class="cp-usage-title">💰 消费统计</span>' +
            '<button class="cp-usage-close" id="cp-usage-close">✕</button>' +
        '</div>' +
        '<div class="cp-usage-body" id="cp-usage-body"></div>';

    var restoreBtn = document.createElement('div');
    restoreBtn.id = 'ciwei-pet-restore';
    restoreBtn.textContent = '🦔';

    function mount() {
        if (!document.body) { setTimeout(mount, 20); return; }
        document.body.appendChild(particleLayer);
        document.body.appendChild(menu);
        document.body.appendChild(submenu);
        document.body.appendChild(dialogue);
        document.body.appendChild(usagePanel);
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

    var fileTip  = dialogue.querySelector('#cp-file-tip');

    // 🖥️ 多端设备自适应检测
    var screenWidth = window.innerWidth;
    if (screenWidth > 1024) {
        dialogue.style.width = '380px'; dialogue.style.maxWidth = '450px'; dlgInput.style.fontSize = '14px';
    } else if (screenWidth > 768) {
        dialogue.style.width = '320px'; dialogue.style.maxWidth = '380px'; dlgInput.style.fontSize = '14px';
    } else {
        dialogue.style.width = '260px'; dialogue.style.maxWidth = 'calc(100vw - 32px)'; dlgInput.style.fontSize = '13px';
    }

    // ⭐ 核心：输入框自适应高度函数
    function adjustInputHeight() {
        dlgInput.style.height = 'auto'; 
        var scrollH = dlgInput.scrollHeight;
        var finalH = Math.max(40, Math.min(scrollH, 100));
        dlgInput.style.height = finalH + 'px'; 
        dlgInput.style.overflowY = scrollH > 100 ? 'auto' : 'hidden'; 
    }
    setTimeout(adjustInputHeight, 100);
    dlgInput.addEventListener('input', adjustInputHeight);
    dlgInput.addEventListener('focus', adjustInputHeight);

    var S = {
        x: 0, y: 0, sleeping: false, hidden: false, clicks: 0,
        last: Date.now(), face: 'idle1', dragging: false, moved: false, longPressed: false,
        sClientX: 0, sClientY: 0, sPosX: 0, sPosY: 0, vx: 0, vy: 0,
        lastMoveX: 0, lastMoveY: 0, lastMoveTime: 0, sliding: false, thrown: false,
        soundOn: true, mood: 60, scaleIndex: DEFAULT_SCALE_INDEX,
        bubbleTimer: null, typeTimer: null, resetTimer: null, struggleTimer: null, 
        idleActionTimer: null, zzzTimer: null, avoidTimer: null, avoidCooldown: 0, 
        longPressTimer: null, mouseX: window.innerWidth / 2, mouseY: window.innerHeight / 2,
        mouseActive: false, dialogueOpen: false, replyTimer: null, aiThinking: false
    };
    var lastLongPressTime = 0;
    var dlgDrag = { dragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0, moved: false };
    var usageDrag = { dragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0, moved: false };
    var aiConfigCache = null;
    var aiConfigCacheTime = 0;

    var measuredFPS = 60, fpsFrames = 0, fpsStart = performance.now(), fpsHistory = [];

    function tickFPS(now) {
        fpsFrames++;
        var elapsed = now - fpsStart;
        if (elapsed >= 500) {
            var m = Math.round(fpsFrames * 1000 / elapsed);
            fpsHistory.push(m);
            if (fpsHistory.length > 6) fpsHistory.shift();
            var sum = 0; for (var i = 0; i < fpsHistory.length; i++) sum += fpsHistory[i];
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

    function applySize() { document.documentElement.style.setProperty('--cp-size', getSize() + 'px'); }
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
        burst('✨', 3); showBubble('🔍➕ ' + getScalePercent() + '%', 1200, false, true);
    }
    function doScaleDown() {
        if (S.scaleIndex <= 0) { showBubble(pick(MSG.scaleMin), 1400, false); return; }
        S.scaleIndex--; applyScale(); initAudio(); SFX.pet();
        burst('✨', 3); showBubble('🔍➖ ' + getScalePercent() + '%', 1200, false, true);
    }
    function doScaleReset() {
        if (S.scaleIndex === DEFAULT_SCALE_INDEX) { showBubble('已经是默认大小～', 1200, false); return; }
        S.scaleIndex = DEFAULT_SCALE_INDEX; applyScale(); initAudio(); SFX.pet();
        burst('📏', 3); showBubble('📏 恢复 100%', 1400, false, true);
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
        return { x: clamp(x, 0, Math.max(0, window.innerWidth - s)), y: clamp(y, 0, Math.max(0, window.innerHeight - s)) };
    }
    function updateFlip() {
        var s = getSize();
        if (S.y < 70) host.classList.add('bubble-below'); else host.classList.remove('bubble-below');
        if (S.y + s + 70 > window.innerHeight) host.classList.add('toolbar-above'); else host.classList.remove('toolbar-above');
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
        img.onerror = function() { host.style.opacity = '0'; };
        img.onload = function() { host.style.opacity = '1'; };
    }
    function updateMoodColor() {
        var t = clamp(S.mood, 0, 100) / 100;
        var r = Math.round(255 - t * 167);
        var g = Math.round(140 + t * 26);
        var b = Math.round(100 + t * 155);
        document.documentElement.style.setProperty('--cp-accent', r + ',' + g + ',' + b);
    }

    var audioCtx = null;
    function initAudio() { if (audioCtx) return; try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
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

    var TTS = {
        enabled: true, voice: null, unlocked: false,
        init: function () {
            if (!window.speechSynthesis) { this.enabled = false; return; }
            var self = this;
            function loadVoices(retries) {
                retries = retries || 0;
                var vs = window.speechSynthesis.getVoices();
                for (var i = 0; i < vs.length; i++) {
                    var v = vs[i];
                    if (v.lang.indexOf('zh') === 0 || v.lang.indexOf('cmn') === 0) { self.voice = v; return; }
                }
                if (retries < 5) setTimeout(function () { loadVoices(retries + 1); }, 500);
            }
            loadVoices();
            if (window.speechSynthesis.onvoiceschanged !== undefined) window.speechSynthesis.onvoiceschanged = loadVoices;
        },
        unlock: function () {
            if (this.unlocked || !this.enabled) return;
            try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'zh-CN'; window.speechSynthesis.speak(u); this.unlocked = true; } catch (e) {}
        },
        speak: function (text) {
            if (!this.enabled || !text) return;
            if (!this.unlocked) this.unlock();
            try {
                window.speechSynthesis.cancel();
                var u = new SpeechSynthesisUtterance(text);
                u.lang = 'zh-CN'; u.rate = 1.1; u.pitch = 1.15; u.volume = 0.9;
                if (this.voice) u.voice = this.voice;
                window.speechSynthesis.speak(u);
            } catch (e) {}
        }
    };

    function showBubble(text, duration, typewriter, noSpeak) {
        duration = duration || 2600; typewriter = typewriter !== false;
        clearTimeout(S.bubbleTimer); clearInterval(S.typeTimer);
        var needWrap = text.length > 14;
        bubble.classList.toggle('long', needWrap); bubble.classList.add('show');
        if (!typewriter) { bubble.textContent = text; }
        else {
            bubble.textContent = '';
            var i = 0;
            S.typeTimer = setInterval(function () {
                bubble.textContent += text[i++];
                if (i >= text.length) clearInterval(S.typeTimer);
            }, 30);
        }
        S.bubbleTimer = setTimeout(function () { bubble.classList.remove('show'); }, duration + (typewriter ? text.length * 30 : 0));
        if (!noSpeak && text && text.length < 200) TTS.speak(text);
    }
    function showBubbleStream(text) {
        clearTimeout(S.bubbleTimer); clearInterval(S.typeTimer);
        var needWrap = text.length > 14;
        bubble.classList.toggle('long', needWrap); bubble.classList.add('show');
        bubble.textContent = text;
    }

    function burst(emoji, count, originRect) {
        count = Math.max(1, Math.round((count || 4) * particleFactor()));
        var rect = originRect || bodyEl.getBoundingClientRect();
        var cx = rect.left + rect.width / 2; var cy = rect.top + rect.height / 2;
        for (var i = 0; i < count; i++) {
            (function () {
                var p = document.createElement('div');
                p.className = 'cp-particle'; p.textContent = emoji;
                var angle = rand(0, Math.PI * 2); var dist = rand(38, 78);
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
        setImage(name); clearTimeout(faceRevertTimer);
        if (revertMs) {
            faceRevertTimer = setTimeout(function () { if (S.sleeping) setImage('sleep'); else setImage('idle1'); }, revertMs);
        }
    }

    setInterval(function () {
        if (S.sleeping || S.hidden) return;
        if (S.face === 'idle1' || S.face === 'idle2') setImage(S.face === 'idle1' ? 'idle2' : 'idle1');
    }, 1000);

    (function blinkLoop() {
        setTimeout(function () {
            if (!S.sleeping && !S.hidden && S.face !== 'sleep' && (S.face === 'idle1' || S.face === 'idle2')) {
                var prev = S.face; setImage('blink');
                setTimeout(function () { if (S.face === 'blink') setImage(prev); }, 280);
            }
            blinkLoop();
        }, rand(3000, 7000));
    })();

    function scheduleIdleAction() {
        clearTimeout(S.idleActionTimer);
        S.idleActionTimer = setTimeout(function () {
            if (S.sleeping || S.hidden || S.dragging || S.sliding || S.dialogueOpen || S.aiThinking || Date.now() - S.last < 15000) { scheduleIdleAction(); return; }
            var roll = Math.random();
            if (roll < .18) setFace('surprised', 900);
            else if (roll < .35) burst('💭', 2);
            else if (roll < .5) showBubble(pick(MSG.idle));
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
            z.className = 'cp-particle'; z.textContent = '💤';
            z.style.left = (r.right - 8) + 'px'; z.style.top  = (r.top - 4) + 'px';
            z.style.setProperty('--dx', rand(10, 28).toFixed(0) + 'px'); z.style.setProperty('--dy', '-58px');
            z.style.setProperty('--rot', '0deg'); z.style.fontSize = '14px'; z.style.animationDuration = '2.1s';
            particleLayer.appendChild(z);
            setTimeout(function () { z.remove(); }, 2300);
        }, 2200);
    }
    function stopZzz() { clearInterval(S.zzzTimer); S.zzzTimer = null; }

    function goSleep() {
        if (S.sleeping) return;
        S.sleeping = true; saveSleep(); saveLast();
        host.classList.add('sleeping'); host.classList.remove('idle-float');
        setImage('sleep'); showBubble(pick(MSG.sleep), 2200, false);
        startZzz(); SFX.sleep();
    }
    function wakeUp() {
        if (!S.sleeping) return;
        S.sleeping = false; saveSleep(); saveLast();
        host.classList.remove('sleeping'); host.classList.add('idle-float');
        stopZzz(); setImage('surprised'); showBubble(pick(MSG.wake), 1800, false);
        burst('✨', 3); SFX.wake();
        setTimeout(function () { if (!S.sleeping && S.face === 'surprised') setImage('idle1'); }, 1200);
    }

    function handleClick() {
        saveLast(); initAudio(); TTS.unlock();
        if (S.sleeping) { wakeUp(); return; }
        if (Date.now() - S.last > 5 * 60 * 1000) S.clicks = 0;
        S.clicks++; saveClicks();
        S.mood = clamp(S.mood - 2, 0, 100); updateMoodColor();
        var msg = '', face = 'happy';
        var n = S.clicks;
        if (n === 1) { msg = pick(MSG.c1); face = 'happy'; }
        else if (n === 2) { msg = pick(MSG.c2); face = 'happy'; }
        else if (n === 3) { msg = pick(MSG.c3); face = 'surprised'; }
        else if (n === 5) { msg = pick(MSG.c5); face = 'surprised'; }
        else if (n >= 8) { msg = pick(MSG.c8); face = 'angry'; }
        else { msg = pick(MSG.idle); face = 'happy'; }
        if (n > 15) msg = '你戳了 ' + n + ' 次了，累不累？';
        setFace(face, 2400); showBubble(msg);
        host.classList.add('squash');
        setTimeout(function () { host.classList.remove('squash'); }, 440);
        burst(face === 'angry' ? '💢' : '✨', face === 'angry' ? 3 : 4); SFX.click();
        clearTimeout(S.resetTimer);
        S.resetTimer = setTimeout(function () { if (!S.sleeping) setImage('idle1'); S.clicks = 0; saveClicks(); }, 4000);
    }

    function startStruggle() {
        clearInterval(S.struggleTimer);
        var toggle = false;
        S.struggleTimer = setInterval(function () { setImage(toggle ? 'surprised' : 'angry'); toggle = !toggle; }, 260);
    }
    function stopStruggle() { clearInterval(S.struggleTimer); S.struggleTimer = null; if (!S.sleeping) setImage('idle1'); }

    function onDown(e, isTouch) {
        if (e.target.closest('.cp-toolbar') || e.target.closest('#ciwei-pet-menu') || e.target.closest('#ciwei-pet-submenu') || e.target.closest('#ciwei-pet-dialogue')) return;
        if (e.button && e.button !== 0) return;
        initAudio();
        S.dragging = true; S.moved = false; S.longPressed = false; S.thrown = false;
        host.classList.add('dragging'); host.classList.remove('idle-float', 'animating');
        var p = e.touches ? e.touches[0] : e;
        S.sClientX = p.clientX; S.sClientY = p.clientY;
        S.sPosX = S.x; S.sPosY = S.y; S.vx = 0; S.vy = 0;
        S.lastMoveX = p.clientX; S.lastMoveY = p.clientY; S.lastMoveTime = performance.now();
        if (!S.sleeping) startStruggle();
        clearTimeout(S.longPressTimer);
        if (isTouch) {
            S.longPressTimer = setTimeout(function () {
                if (!S.moved && S.dragging) {
                    S.longPressed = true; S.dragging = false;
                    host.classList.remove('dragging'); host.classList.add('idle-float');
                    stopStruggle(); lastLongPressTime = performance.now();
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
        if (!S.moved && (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD)) { S.moved = true; clearTimeout(S.longPressTimer); }
        if (!S.moved) return;
        var c = clampPos(S.sPosX + dx, S.sPosY + dy);
        setPos(c.x, c.y, false);
        var now = performance.now();
        var dt = now - S.lastMoveTime;
        if (dt > 0) { S.vx = (p.clientX - S.lastMoveX) / dt * 16; S.vy = (p.clientY - S.lastMoveY) / dt * 16; }
        S.lastMoveX = p.clientX; S.lastMoveY = p.clientY; S.lastMoveTime = now;
    }

    function onUp() {
        clearTimeout(S.longPressTimer);
        if (S.longPressed) { S.longPressed = false; return; }
        if (!S.dragging) return;
        S.dragging = false; host.classList.remove('dragging'); host.classList.add('idle-float');
        stopStruggle();
        if (!S.moved) { handleClick(); return; }
        savePos(); saveLast();
        var s = getSize(); var margin = 8;
        var dL = S.x; var dR = window.innerWidth - s - S.x; var dT = S.y; var dB = window.innerHeight - s - S.y;
        var minD = Math.min(dL, dR, dT, dB); var speed = Math.hypot(S.vx, S.vy);
        if (speed > THROW_SPEED_THRESHOLD) {
            S.thrown = true; S.sliding = true; S.vx *= 1.25; S.vy *= 1.25;
            if (!S.sleeping) setFace('surprised', 1500);
            SFX.throw(); burst('💫', 3); showBubble(pick(MSG.thrown), 1500, false);
            return;
        }
        if (minD < 15 && minD > 0) {
            if (minD === dL) S.x = margin;
            else if (minD === dR) S.x = window.innerWidth - s - margin;
            else if (minD === dT) S.y = margin;
            else S.y = window.innerHeight - s - margin;
            setPos(S.x, S.y, true); setTimeout(savePos, 600);
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
        if (e.target.closest('#ciwei-pet') || e.target.closest('#ciwei-pet-menu') || e.target.closest('#ciwei-pet-submenu') || e.target.closest('#ciwei-pet-dialogue') || e.target.closest('#ciwei-pet-restore') || e.target.closest('a, button, input, textarea, select, label') || e.target.closest('[class*="modal"]')) return;
        if (S.sleeping) return;
        walkTo(e.clientX - getSize() / 2, e.clientY - getSize() / 2);
    });

    var lastFrame = performance.now();
    function mainLoop(now) {
        tickFPS(now);
        var dt = (now - lastFrame) / 1000; lastFrame = now;
        if (dt > .05) dt = .05;
        if (S.sliding && !S.dragging) {
            var friction = S.thrown ? Math.pow(.32, dt) : Math.pow(.06, dt);
            var bounceRate = S.thrown ? .72 : .55;
            S.vx *= friction; S.vy *= friction;
            var stopThreshold = S.thrown ? .6 : .3;
            if (Math.abs(S.vx) < stopThreshold && Math.abs(S.vy) < stopThreshold) {
                S.sliding = false;
                var c0 = clampPos(S.x, S.y);
                setPos(c0.x, c0.y, false); savePos();
                if (S.thrown) {
                    S.thrown = false;
                    if (!S.sleeping) setFace('happy', 1400);
                    burst('✨', 4);
                    host.classList.add('squash'); setTimeout(function () { host.classList.remove('squash'); }, 420);
                    SFX.bounce();
                }
            } else {
                var s = getSize();
                var nx = S.x + S.vx * dt * 60; var ny = S.y + S.vy * dt * 60;
                var hit = false;
                if (nx < 0) { nx = 0; S.vx = -S.vx * bounceRate; hit = true; }
                if (ny < 0) { ny = 0; S.vy = -S.vy * bounceRate; hit = true; }
                if (nx > window.innerWidth - s) { nx = window.innerWidth - s; S.vx = -S.vx * bounceRate; hit = true; }
                if (ny > window.innerHeight - s) { ny = window.innerHeight - s; S.vy = -S.vy * bounceRate; hit = true; }
                setPos(nx, ny, false);
                if (hit) {
                    host.classList.add('squash'); setTimeout(function () { host.classList.remove('squash'); }, 300);
                    if (S.thrown && navigator.vibrate) { try { navigator.vibrate(15); } catch (err) {} }
                    var rect = bodyEl.getBoundingClientRect();
                    var side = nx <= 0 ? 'left' : nx >= window.innerWidth - s ? 'right' : ny <= 0 ? 'top' : 'bottom';
                    var o = side === 'left' ? { left: rect.left - 10, top: rect.top + rect.height / 2, width: 20, height: 20 } : side === 'right' ? { left: rect.right - 10, top: rect.top + rect.height / 2, width: 20, height: 20 } : side === 'top' ? { left: rect.left + rect.width / 2, top: rect.top - 10, width: 20, height: 20 } : { left: rect.left + rect.width / 2, top: rect.bottom - 10, width: 20, height: 20 };
                    burst(S.thrown ? '💥' : '💨', S.thrown ? 5 : 4, o); SFX.bounce();
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
        var s = getSize(); var cx = S.x + s / 2; var cy = S.y + s / 2;
        var dx = (e.clientX - cx) / window.innerWidth; var dy = (e.clientY - cy) / window.innerHeight;
        tiltEl.style.transform = 'perspective(500px) rotateX(' + clamp(dy * 14, -9, 9) + 'deg) rotateY(' + clamp(-dx * 14, -9, 9) + 'deg)';
    });
    document.addEventListener('mouseleave', function () { S.mouseActive = false; tiltEl.style.transform = ''; });
    host.addEventListener('mouseenter', function () { if (!isMobile() && !S.dragging && !S.sleeping && !S.hidden) tiltEl.style.transform += ' scale(1.04)'; });
    host.addEventListener('mouseleave', function () { if (!S.dragging) tiltEl.style.transform = ''; });

    document.addEventListener('mousemove', function (e) {
        if (isMobile() || S.dragging || S.sleeping || S.hidden || S.dialogueOpen) return;
        if (performance.now() < S.avoidCooldown) return;
        var s = getSize(); var cx = S.x + s / 2; var cy = S.y + s / 2;
        var dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (dist < 85 && !S.avoidTimer) {
            S.avoidTimer = setTimeout(function () {
                if (S.dragging || S.sleeping || S.dialogueOpen) { S.avoidTimer = null; return; }
                var dx = cx - e.clientX; var dy = cy - e.clientY;
                var len = Math.hypot(dx, dy) || 1; var md = 46;
                var c = clampPos(S.x + (dx / len) * md, S.y + (dy / len) * md);
                if (Math.hypot(c.x - S.x, c.y - S.y) > 15) { setPos(c.x, c.y, true); setTimeout(savePos, 600); }
                S.avoidCooldown = performance.now() + 8000; S.avoidTimer = null;
            }, 900);
        } else if (dist > 120) { clearTimeout(S.avoidTimer); S.avoidTimer = null; }
    });

    function doPet() {
        saveLast(); initAudio();
        S.mood = clamp(S.mood + 8, 0, 100); updateMoodColor();
        if (S.sleeping) { wakeUp(); return; }
        setFace('happy', 1600); showBubble(pick(MSG.pet), 1800, false); burst('❤️', 5); SFX.pet();
    }
    function doFood() {
        saveLast(); initAudio();
        S.mood = clamp(S.mood + 12, 0, 100); updateMoodColor();
        if (S.sleeping) wakeUp();
        setFace('happy', 1800); showBubble(pick(MSG.food), 1800, false); burst('🍎', 4); SFX.food();
    }
    function doSleepToggle() { saveLast(); initAudio(); if (S.sleeping) wakeUp(); else goSleep(); }
    function doSpin() {
        saveLast(); initAudio();
        if (S.sleeping) wakeUp();
        host.classList.add('spin'); setFace('happy', 1500); showBubble(pick(MSG.spin), 1600, false);
        burst('💫', 5); SFX.spin();
        setTimeout(function () { host.classList.remove('spin'); }, 880);
    }
    function roam(maxX, maxY) {
        if (S.sleeping || S.dragging || S.sliding || S.dialogueOpen) return;
        var target = clampPos(S.x + (Math.random() < .5 ? -1 : 1) * rand(maxX * .4, maxX), S.y + (Math.random() < .5 ? -1 : 1) * rand(maxY * .4, maxY));
        if (Math.hypot(target.x - S.x, target.y - S.y) < 40) return;
        walkTo(target.x, target.y);
    }
    function doRoam() { saveLast(); if (S.sleeping) wakeUp(); showBubble(pick(MSG.roam), 1500, false); roam(150, 250); }
    function walkTo(tx, ty) {
        if (S.sleeping) return;
        var c = clampPos(tx, ty); var sx = S.x, sy = S.y;
        var dist = Math.hypot(c.x - sx, c.y - sy); var dur = clamp(dist * 4, 400, 1800);
        var startTime = performance.now(); S.sliding = false;
        function step(now) {
            var t = Math.min(1, (now - startTime) / dur);
            var e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            setPos(sx + (c.x - sx) * e, sy + (c.y - sy) * e, false);
            bodyEl.style.transform = 'translateY(' + Math.sin(t * Math.PI * 8) * 2.5 + 'px)';
            if (t < 1) requestAnimationFrame(step);
            else { bodyEl.style.transform = ''; savePos(); }
        }
        requestAnimationFrame(step);
    }
    function doReset() {
        saveLast(); initAudio(); if (S.sleeping) wakeUp();
        var s = getSize();
        setPos(window.innerWidth - s - 24, window.innerHeight - s - 24, true);
        showBubble('归位！', 1500, false); burst('🏠', 3); setTimeout(savePos, 600);
    }
    function doHide() { S.hidden = true; saveHidden(); host.classList.add('hidden'); restoreBtn.classList.add('show'); }
    function doShow() { S.hidden = false; saveHidden(); host.classList.remove('hidden'); restoreBtn.classList.remove('show'); }

    function getAskedList() { var raw = lsGet(KEYS.asked); if (!raw) return []; try { return JSON.parse(raw) || []; } catch (e) { return []; } }
    function isSecretUnlocked() { return lsGet(KEYS.secret) === 'true'; }

    function buildDialogueMenu() {
        var secretOK = isSecretUnlocked(); var html = '';
        for (var i = 0; i < DIALOGUES.length; i++) {
            var d = DIALOGUES[i];
            if (d.hidden && !secretOK) continue;
            html += '<div class="cp-dlg-item ' + (d.hidden ? 'secret' : '') + (d.ai ? ' ai' : '') + '" data-dlg-id="' + d.id + '"><span class="cp-dlg-icon">' + d.icon + '</span><span>' + d.q + '</span></div>';
        }
        dlgBody.innerHTML = html;
    }

    function showDialogueAt() {
        S.dialogueOpen = true; buildDialogueMenu();
        var s = getSize();
        var px = (typeof dialogue._savedX === 'number') ? dialogue._savedX : S.x + s + 8;
        var py = (typeof dialogue._savedY === 'number') ? dialogue._savedY : S.y;
        dialogue.style.left = px + 'px'; dialogue.style.top  = py + 'px'; dialogue.classList.add('show');
        var dr = dialogue.getBoundingClientRect();
        if (px + dr.width > window.innerWidth - 8) {
            var leftX = S.x - dr.width - 8; if (leftX < 8) leftX = Math.max(8, window.innerWidth - dr.width - 8);
            dialogue.style.left = leftX + 'px';
        }
        if (py + dr.height > window.innerHeight - 8) dialogue.style.top = Math.max(8, window.innerHeight - dr.height - 8) + 'px';
        if (parseFloat(dialogue.style.top) < 8) dialogue.style.top = '8px';
        clearTimeout(S.avoidTimer); S.avoidTimer = null; S.avoidCooldown = performance.now() + 60000;
        if (!isMobile() && dlgInput) setTimeout(function () { try { dlgInput.focus(); } catch (e) {} }, 300);
    }

    function hideDialogue() { dialogue.classList.remove('show'); S.dialogueOpen = false; S.avoidCooldown = performance.now() + 2000; }

    dlgBody.addEventListener('click', function (e) {
        var item = e.target.closest('[data-dlg-id]'); if (!item) return;
        e.stopPropagation();
        var id = item.getAttribute('data-dlg-id'); var d = null;
        for (var i = 0; i < DIALOGUES.length; i++) { if (DIALOGUES[i].id === id) { d = DIALOGUES[i]; break; } }
        if (!d) return;
        initAudio(); SFX.talk();
if (d.ai) {
    if (S.aiThinking) { showBubble('我还在想上一个问题呢…', 1500, false, true); return; }
    
    // ⭐ 加上下面这 7 行
    if (d.ai === 'clear') {
        clearHistory(); 
        dlgBody.innerHTML = ''; 
        showBubble('我的大脑已经清空啦！我们重新开始吧～', 3000, false);
        buildDialogueMenu();
        return;
    }

    askAI(d.ai === 'joke' ? '给我讲一个好笑的笑话' : '随便说点什么吧，我有点无聊');
    return;
}
        var prevReplying = dlgBody.querySelector('.replying'); if (prevReplying) prevReplying.classList.remove('replying');
        item.classList.add('replying');
        var text = fillTemplate(d.a);
        if (!S.sleeping) setFace(d.face || 'happy', 3000);
        showBubble(text, 4000, true);
        S.mood = clamp(S.mood + 4, 0, 100); updateMoodColor(); saveLast();
        if (d.hidden) burst('🎉', 8); else burst('💬', 2);
        clearTimeout(S.replyTimer);
        S.replyTimer = setTimeout(function () { item.classList.remove('replying'); buildDialogueMenu(); }, 4200);
    });

    dlgClose.addEventListener('click', function (e) { e.stopPropagation(); hideDialogue(); });

    function checkKeywordsAndAction(text) {
        return false;
    }

    var uploadBtn = dialogue.querySelector('#cp-upload-btn');
    var fileInput = dialogue.querySelector('#cp-file-input');
    var selectedFileData = null; 

    uploadBtn.addEventListener('click', function (e) { e.stopPropagation(); fileInput.click(); });

    fileInput.addEventListener('change', function (e) {
        var file = e.target.files[0]; if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            showBubble('文件太大啦，超过 10MB 我看不动哦～', 3000, false); fileInput.value = ''; return;
        }
        var reader = new FileReader();
        reader.onload = function(evt) {
            selectedFileData = { name: file.name, type: file.type, base64: evt.target.result.split(',')[1] };
            fileTip.textContent = '📄 已准备：' + file.name + '（点击发送解析）';
            fileTip.style.display = 'block';
            showBubble('文件选好啦，你想让我对文件做什么？', 3000, false);
        };
        reader.readAsDataURL(file);
        fileInput.value = ''; 
    });

    function processImage(base64) {
        showBubble('我看看这图...', 2000, false, true);
        var payload = {
            model: 'deepseek-v4-flash',
            messages: [
                { role: 'system', content: '你是小c，一只可爱的电子刺猬。看到图片后简短俏皮地评价一下。' },
                { role: 'user', content: [{ type: 'text', text: '你看这张图' }, { type: 'image_url', image_url: { url: base64 } }] }
            ]
        };
        fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function(res) { return res.json(); }).then(function(data) {
            if (data.choices && data.choices[0]) {
                showBubble(data.choices[0].message.content, 5000, false);
                pushHistory('user', '[上传了一张图片]'); pushHistory('assistant', data.choices[0].message.content);
            } else { showBubble('这图有点奇怪，我看不清...', 4000, false); }
        }).catch(function(err) { showBubble('看图片失败: ' + err.message, 4000, false); });
    }

    function sendUserInput() {
        var text = dlgInput.value.trim();
        if (!text && !selectedFileData) return; 
        if (S.aiThinking) { showBubble('我还在想上一个问题呢…', 1500, false, true); return; }
        
        dlgInput.value = '';
        setTimeout(adjustInputHeight, 10);

        if (selectedFileData) {
            var fileToSend = selectedFileData;
            selectedFileData = null; 
            fileTip.style.display = 'none';

            if (fileToSend.type.startsWith('image/')) {
                if (fileToSend.base64.length > 500 * 1024) {
                    var imgObj = new Image();
                    imgObj.onload = function() {
                        var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
                        var maxSize = 1024, width = imgObj.width, height = imgObj.height;
                        if (width > height && width > maxSize) { height *= maxSize / width; width = maxSize; }
                        else if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                        canvas.width = width; canvas.height = height; ctx.drawImage(imgObj, 0, 0, width, height);
                        processImage(canvas.toDataURL('image/jpeg', 0.7));
                    };
                    imgObj.src = 'data:' + fileToSend.type + ';base64,' + fileToSend.base64;
                } else {
                    processImage('data:' + fileToSend.type + ';base64,' + fileToSend.base64);
                }
                return;
            }

            showBubble('📁 正在阅读文件，稍等一下…', 15000, false, true);
            S.aiThinking = true;
            
            fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: fileToSend.name, base64Data: fileToSend.base64 })
            }).then(res => res.json()).then(data => {
                if (data.error) {
                    showBubble('文件解析失败：' + data.error, 4000, false);
                    S.aiThinking = false; return;
                }
                S.aiThinking = false; 
                var finalPrompt = '【用户上传了文件，内容如下】：\n' + data.text + '\n\n【用户的指令】：' + (text || '请帮我总结一下这个文件。');
                askAI(finalPrompt);
            }).catch(err => {
                showBubble('上传失败：' + err.message, 4000, false);
                S.aiThinking = false;
            });
            return;
        }

        if (checkKeywordsAndAction(text)) return;
        askAI(text);
    }

    dlgSend.addEventListener('click', function (e) { e.stopPropagation(); sendUserInput(); });
    dlgInput.addEventListener('keydown', function (e) { 
        e.stopPropagation(); 
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendUserInput(); } 
    });
    dlgInput.addEventListener('click', function (e) { e.stopPropagation(); });

    var dlgHeader = dialogue.querySelector('.cp-dlg-header');
    function saveDlgPos() { var r = dialogue.getBoundingClientRect(); lsSet('ciwei_pet_dlg_pos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); }
    dlgHeader.addEventListener('pointerdown', function (e) {
        if (e.target.closest('button')) return;
        dlgDrag.dragging = true; dlgDrag.moved = false; dlgDrag.startX = e.clientX; dlgDrag.startY = e.clientY;
        var r = dialogue.getBoundingClientRect(); dlgDrag.startLeft = r.left; dlgDrag.startTop = r.top;
        dlgHeader.classList.add('dragging'); try { dlgHeader.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
    });
    dlgHeader.addEventListener('pointermove', function (e) {
        if (!dlgDrag.dragging) return; e.preventDefault();
        var dx = e.clientX - dlgDrag.startX; var dy = e.clientY - dlgDrag.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dlgDrag.moved = true;
        if (!dlgDrag.moved) return;
        var newLeft = dlgDrag.startLeft + dx; var newTop = dlgDrag.startTop + dy;
        var w = dialogue.offsetWidth; var h = dialogue.offsetHeight;
        dialogue.style.left = Math.max(0, Math.min(newLeft, window.innerWidth - w)) + 'px';
        dialogue.style.top  = Math.max(0, Math.min(newTop, window.innerHeight - h)) + 'px';
    });
    function endDlgDrag(e) {
        if (!dlgDrag.dragging) return; dlgDrag.dragging = false; dlgHeader.classList.remove('dragging');
        try { dlgHeader.releasePointerCapture(e.pointerId); } catch (err) {}
        if (dlgDrag.moved) saveDlgPos();
    }
    dlgHeader.addEventListener('pointerup', endDlgDrag);
    dlgHeader.addEventListener('pointercancel', function () { if (!dlgDrag.dragging) return; dlgDrag.dragging = false; dlgHeader.classList.remove('dragging'); });

    function fetchAIConfig() {
        var now = Date.now();
        if (aiConfigCache && now - aiConfigCacheTime < AI_CONFIG_TTL) return Promise.resolve(aiConfigCache);
        return fetch(AI_CONFIG_URL + '?t=' + now, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (cfg) {
            var merged = {}; for (var k in DEFAULT_AI_CONFIG) merged[k] = DEFAULT_AI_CONFIG[k]; for (var k2 in cfg) merged[k2] = cfg[k2];
            aiConfigCache = merged; aiConfigCacheTime = now; return merged;
        }).catch(function () { aiConfigCache = DEFAULT_AI_CONFIG; aiConfigCacheTime = now; return DEFAULT_AI_CONFIG; });
    }

    function getUsageStats() {
        var raw = lsGet(KEYS.usage); var today = new Date().toISOString().slice(0, 10);
        if (!raw) return { totalTokens: 0, totalCost: 0, todayTokens: 0, todayCost: 0, todayDate: today };
        try { var d = JSON.parse(raw); if (d.todayDate !== today) { d.todayTokens = 0; d.todayCost = 0; d.todayDate = today; } return d; }
        catch (e) { return { totalTokens: 0, totalCost: 0, todayTokens: 0, todayCost: 0, todayDate: today }; }
    }
    function recordUsage(promptTokens, completionTokens, cacheHitTokens) {
        var d = getUsageStats(); var today = new Date().toISOString().slice(0, 10);
        var hit = cacheHitTokens || 0; var miss = Math.max(0, (promptTokens || 0) - hit); var out = completionTokens || 0;
        var cost = hit / 1000000 * 0.1 + miss / 1000000 * 1.0 + out / 1000000 * 2.0;
        if (d.todayDate !== today) { d.todayTokens = 0; d.todayCost = 0; d.todayDate = today; }
        d.totalTokens = (d.totalTokens || 0) + hit + miss + out; d.totalCost = (d.totalCost || 0) + cost;
        d.todayTokens += hit + miss + out; d.todayCost += cost;
        lsSet(KEYS.usage, JSON.stringify(d));
    }

    function getHistory() { var raw = lsGet(KEYS.aiHist); if (!raw) return []; try { return JSON.parse(raw) || []; } catch (e) { return []; } }
    function pushHistory(role, content) {
        if (typeof content === 'string') content = content.replace(/小ci/g, '小c');
        var h = getHistory(); h.push({ role: role, content: content });
        if (h.length > 100) h = h.slice(-100);
        lsSet(KEYS.aiHist, JSON.stringify(h));
    }

    function askAI(userInput) {
        S.aiThinking = true; pushHistory('user', userInput); setFace('surprised');
        fetchAIConfig().then(function (cfg) {
            var history = getHistory(); var ctxLines = cfg.contextLines || 10;
            var recent = history.slice(-ctxLines * 2 - 1, -1);
            var timeStr = new Date().toLocaleString('zh-CN', { hour12: false });
            var messages = [{ role: 'system', content: SYSTEM_PROMPT }];
            for (var i = 0; i < recent.length; i++) messages.push({ role: recent[i].role, content: recent[i].content });
            messages.push({ role: 'system', content: '【当前真实时间：' + timeStr + '】' });
            messages.push({ role: 'user', content: userInput });

            var body = {
                model: cfg.model || 'deepseek-v4-flash',
                messages: messages,
                temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.7,
                max_tokens: cfg.maxTokens || 1024,
                stream: cfg.stream !== false
            };
            if (body.stream) body.stream_options = { include_usage: true };
            if (cfg.model === 'deepseek-v4-pro' && cfg.reasoningEffort) body.reasoning_effort = cfg.reasoningEffort;

            if (body.stream) { showBubbleStream('💭 想想…'); streamAI(body, userInput); }
            else { showBubble('💭 想想…', 30000, false, true); fetchAI(body, userInput); }
        });
    }

    function parseAgentAction(text, userInput) {
        if (!text) return text;
        var cleanText = text;
        var tags = cleanText.match(/\[(ACTION|IMG|FACE):\w+\]/gi) || [];
        cleanText = cleanText.replace(/\[(ACTION|IMG|FACE):\w+\]/gi, '').trim();

        if (tags.length === 0 && userInput) {
            if (userInput.includes('转圈') || userInput.includes('转两圈')) tags.push('[ACTION:spin]');
            if (userInput.includes('生气')) tags.push('[IMG:angry]');
            if (userInput.includes('开心') || userInput.includes('笑')) tags.push('[IMG:happy]');
            if (userInput.includes('睡觉')) tags.push('[ACTION:sleep]');
        }

        var delay = 0;
tags.forEach(function(tag) {
    var t = tag.toUpperCase();
    setTimeout(function() {
        if (t === '[ACTION:SPIN]') doSpin();
        else if (t === '[ACTION:JUMP]') {  // ⭐ 加上这四行
            host.classList.add('squash'); 
            setTimeout(function(){ host.classList.remove('squash'); }, 400);
            burst('✨', 3); 
        }
        else if (t === '[ACTION:SLEEP]') { if (!S.sleeping) doSleepToggle(); }
                else if (t === '[ACTION:PET]') doPet();
                else if (t === '[ACTION:FOOD]') doFood();
                else if (t === '[IMG:HAPPY]' || t === '[FACE:HAPPY]') setFace('happy', 3000);
                else if (t === '[IMG:ANGRY]' || t === '[FACE:ANGRY]') setFace('angry', 3000);
                else if (t === '[IMG:SURPRISED]' || t === '[FACE:SURPRISED]') setFace('surprised', 3000);
                else if (t === '[IMG:IDLE1]' || t === '[FACE:IDLE1]') setFace('idle1', 3000);
                else if (t === '[IMG:SLEEP]') setFace('sleep', 3000);
            }, delay);
            delay += 1500;
        });
        return cleanText;
    }

    function fetchAI(body, userInput) {
        fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); }).then(function (json) {
            var reply = json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content : '（没听清…）';
            var finalReply = parseAgentAction(reply, userInput); 
            showBubble(finalReply, 60000, false); pushHistory('assistant', finalReply);
            if (json.usage) recordUsage(json.usage.prompt_tokens || 0, json.usage.completion_tokens || 0, json.usage.prompt_cache_hit_tokens || 0);
            setFace('happy', 2500); S.mood = clamp(S.mood + 3, 0, 100); updateMoodColor(); S.aiThinking = false;
        }).catch(function (err) {
            console.error('AI 调用失败:', err); showBubble('唔…连接失败：' + (err.message || '未知错误'), 4000, false); setFace('angry', 2500); S.aiThinking = false;
        });
    }

    function streamAI(body, userInput) {
        fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            if (!res.body) return res.json().then(function (json) {
                var reply = json.choices[0].message.content;
                showBubble(reply, 60000, false); pushHistory('assistant', reply); setFace('happy', 2500); S.aiThinking = false;
            });
            return readStream(res.body);
        }).then(function (fullText) {
            if (!fullText) return;
            var finalText = parseAgentAction(fullText, userInput); 
            showBubble(finalText, 60000, true); 
            pushHistory('assistant', finalText);
            setFace('happy', 2500); S.mood = clamp(S.mood + 3, 0, 100); updateMoodColor(); S.aiThinking = false;
        }).catch(function (err) {
            console.error('AI 流式失败:', err); showBubble('唔…连接失败：' + (err.message || '未知错误'), 4000, false); setFace('angry', 2500); S.aiThinking = false;
        });
    }

    function readStream(stream) {
        var reader = stream.getReader(); var decoder = new TextDecoder(); var fullText = ''; var buffer = '';
        function pump() {
            return reader.read().then(function (result) {
                if (result.done) return fullText;
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n'); buffer = lines.pop();
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (!line || line.indexOf('data: ') !== 0) continue;
                    var data = line.slice(6); if (data === '[DONE]') continue;
                    try {
                        var json = JSON.parse(data);
                        var delta = json.choices && json.choices[0] && json.choices[0].delta;
                        if (delta && delta.content) { 
                            fullText += delta.content; 
                            showBubbleStream('💭 想想…'); 
                        }
                        if (json.usage) recordUsage(json.usage.prompt_tokens || 0, json.usage.completion_tokens || 0, json.usage.prompt_cache_hit_tokens || 0);
                    } catch (e) {}
                }
                return pump();
            });
        }
        return pump();
    }

    function renderUsagePanel() {
        var d = getUsageStats();
        usagePanel.querySelector('#cp-usage-body').innerHTML =
            '<div class="cp-usage-block"><div class="cp-usage-label">今日消耗</div><div class="cp-usage-main"><span class="cp-usage-num">' + (d.todayTokens || 0).toLocaleString() + '</span><span class="cp-usage-unit">tokens</span></div><div class="cp-usage-cost">¥ ' + (d.todayCost || 0).toFixed(4) + '</div></div>' +
            '<div class="cp-usage-block"><div class="cp-usage-label">累计消耗</div><div class="cp-usage-main"><span class="cp-usage-num">' + (d.totalTokens || 0).toLocaleString() + '</span><span class="cp-usage-unit">tokens</span></div><div class="cp-usage-cost">¥ ' + (d.totalCost || 0).toFixed(4) + '</div></div>';
    }
    function openUsagePanel() {
        renderUsagePanel(); usagePanel.classList.add('show');
        var w = usagePanel.offsetWidth; var h = usagePanel.offsetHeight; var px, py;
        var savedPos = lsGet('ciwei_pet_usage_pos');
        if (savedPos) { try { var p = JSON.parse(savedPos); if (p && typeof p.x === 'number' && typeof p.y === 'number') { px = Math.max(8, Math.min(p.x, window.innerWidth - w - 8)); py = Math.max(8, Math.min(p.y, window.innerHeight - h - 8)); } } catch (e) {} }
        if (typeof px !== 'number') { px = Math.max(8, (window.innerWidth - w) / 2); py = Math.max(8, (window.innerHeight - h) / 2); }
        usagePanel.style.left = px + 'px'; usagePanel.style.top  = py + 'px';
        clearTimeout(S.avoidTimer); S.avoidTimer = null; S.avoidCooldown = performance.now() + 60000;
    }
    function closeUsagePanel() { usagePanel.classList.remove('show'); S.avoidCooldown = performance.now() + 2000; }

    var usageHeader = usagePanel.querySelector('.cp-usage-header');
    function saveUsagePos() { var r = usagePanel.getBoundingClientRect(); lsSet('ciwei_pet_usage_pos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); }
    usageHeader.addEventListener('pointerdown', function (e) {
        if (e.target.closest('button')) return;
        usageDrag.dragging = true; usageDrag.moved = false; usageDrag.startX = e.clientX; usageDrag.startY = e.clientY;
        var r = usagePanel.getBoundingClientRect(); usageDrag.startLeft = r.left; usageDrag.startTop = r.top;
        usageHeader.classList.add('dragging'); try { usageHeader.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
    });
    usageHeader.addEventListener('pointermove', function (e) {
        if (!usageDrag.dragging) return; e.preventDefault();
        var dx = e.clientX - usageDrag.startX; var dy = e.clientY - usageDrag.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) usageDrag.moved = true;
        if (!usageDrag.moved) return;
        var newLeft = usageDrag.startLeft + dx; var newTop = usageDrag.startTop + dy;
        var w = usagePanel.offsetWidth; var h = usagePanel.offsetHeight;
        usagePanel.style.left = Math.max(0, Math.min(newLeft, window.innerWidth - w)) + 'px';
        usagePanel.style.top  = Math.max(0, Math.min(newTop, window.innerHeight - h)) + 'px';
    });
    function endUsageDrag(e) {
        if (!usageDrag.dragging) return; usageDrag.dragging = false; usageHeader.classList.remove('dragging');
        try { usageHeader.releasePointerCapture(e.pointerId); } catch (err) {}
        if (usageDrag.moved) saveUsagePos();
    }
    usageHeader.addEventListener('pointerup', endUsageDrag);
    usageHeader.addEventListener('pointercancel', function () { if (!usageDrag.dragging) return; usageDrag.dragging = false; usageHeader.classList.remove('dragging'); });

    usagePanel.querySelector('#cp-usage-close').addEventListener('click', closeUsagePanel);

    toolbar.addEventListener('click', function (e) {
        var btn = e.target.closest('.cp-toolbar-btn'); if (!btn) return;
        e.stopPropagation();
        var act = btn.dataset.action;
        if (act === 'love') doPet();
        else if (act === 'food') doFood();
        else if (act === 'sleep') doSleepToggle();
        else if (act === 'dialogue') showDialogueAt();
        else if (act === 'reset') doReset();
    });
    toolbar.addEventListener('mouseenter', function () { host.classList.add('show-toolbar'); });
    toolbar.addEventListener('mouseleave', function () { host.classList.remove('show-toolbar'); });
    restoreBtn.addEventListener('click', doShow);

    function showMenuAt(x, y) {
        menu.style.left = x + 'px'; menu.style.top  = y + 'px';
        menu.classList.add('show'); submenu.classList.remove('show');
        var mr = menu.getBoundingClientRect();
        if (x + mr.width > window.innerWidth - 8) menu.style.left = Math.max(8, window.innerWidth - mr.width - 8) + 'px';
        if (y + mr.height > window.innerHeight - 8) menu.style.top = Math.max(8, y - mr.height - 8) + 'px';
        if (parseFloat(menu.style.top) < 8) menu.style.top = '8px';
    }
    function showSubmenu() {
        var mr = menu.getBoundingClientRect(); var sx = mr.left; var sy = mr.bottom + 4;
        submenu.style.left = sx + 'px'; submenu.style.top  = sy + 'px'; submenu.classList.add('show');
        soundChk.textContent = S.soundOn ? '开启' : '关闭'; updateScaleDisplay();
        var sr = submenu.getBoundingClientRect();
        if (sx + sr.width > window.innerWidth - 8) submenu.style.left = Math.max(8, window.innerWidth - sr.width - 8) + 'px';
        if (sy + sr.height > window.innerHeight - 8) submenu.style.top = Math.max(8, mr.top - sr.height - 4) + 'px';
    }

    host.addEventListener('contextmenu', function (e) { e.preventDefault(); if (isMobile()) return; showMenuAt(e.clientX, e.clientY); });

    menu.addEventListener('click', function (e) {
        var item = e.target.closest('[data-menu]'); if (!item) return;
        e.stopPropagation(); var act = item.dataset.menu;
        if (act === 'more') { if (submenu.classList.contains('show')) submenu.classList.remove('show'); else showSubmenu(); return; }
        if (act === 'love') { doPet(); menu.classList.remove('show'); }
        else if (act === 'food') { doFood(); menu.classList.remove('show'); }
        else if (act === 'dialogue') { menu.classList.remove('show'); submenu.classList.remove('show'); setTimeout(function () { showDialogueAt(); }, 60); }
        else if (act === 'sleep') { doSleepToggle(); menu.classList.remove('show'); }
        else if (act === 'spin') { doSpin(); menu.classList.remove('show'); }
    });

    submenu.addEventListener('click', function (e) {
        var item = e.target.closest('[data-menu]'); if (!item) return;
        e.stopPropagation(); var act = item.dataset.menu;
        if (act === 'roam') { doRoam(); submenu.classList.remove('show'); menu.classList.remove('show'); }
        else if (act === 'reset') { doReset(); submenu.classList.remove('show'); menu.classList.remove('show'); }
        else if (act === 'hide') { doHide(); submenu.classList.remove('show'); menu.classList.remove('show'); }
        else if (act === 'scale-up') { doScaleUp(); }
        else if (act === 'scale-down') { doScaleDown(); }
        else if (act === 'scale-reset') { doScaleReset(); }
        else if (act === 'usage') { submenu.classList.remove('show'); menu.classList.remove('show'); setTimeout(openUsagePanel, 60); }
        else if (act === 'sound') { S.soundOn = !S.soundOn; saveSound(); soundChk.textContent = S.soundOn ? '开启' : '关闭'; item.classList.toggle('active', S.soundOn); if (S.soundOn) { initAudio(); SFX.pet(); } }
    });

    document.addEventListener('click', function (e) {
        if (performance.now() - lastLongPressTime < 600) return;
        var inMenu = e.target.closest('#ciwei-pet-menu'); var inSub  = e.target.closest('#ciwei-pet-submenu'); var inPet  = e.target.closest('#ciwei-pet');
        if (!inMenu && !inSub && !inPet) { menu.classList.remove('show'); submenu.classList.remove('show'); }
    });

    function checkBirthday() {
        var today = new Date(); var md = ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
        if (md === PET_PROFILE.birthday.slice(5)) {
            setTimeout(function () { if (S.sleeping || S.hidden) return; showBubble(pick(MSG.birthday), 4000, false); burst('🎂', 10); burst('🎉', 6); SFX.wake(); }, 3000);
        }
    }
    function checkSpecialDay() {
        var today = new Date(); if (today.getMonth() + 1 !== 12 || today.getDate() !== 26) return;
        setTimeout(function () {
            if (S.sleeping || S.hidden) return;
            showBubble('🎂 今天是特别的日子…有人托我说一声：生日快乐。', 5000, false, true); TTS.speak('生日快乐');
            setFace('happy', 3000); burst('🎂', 8); burst('💝', 6); burst('🎉', 6); SFX.wake();
        }, 3000);
    }
    function checkNationalDay() {
        var today = new Date(); if (today.getMonth() + 1 !== 10 || today.getDate() > 7) return;
        setTimeout(function () {
            if (S.sleeping || S.hidden) return;
            showBubble('🇨🇳 爸爸！国庆节快乐！', 4000, false, true); TTS.speak('国庆节快乐！'); burst('🇨🇳', 8); burst('🎉', 6); SFX.wake();
        }, 4000);
    }
    function checkFestival() {
        var today = new Date(); var md = ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
        var f = FESTIVALS[md]; if (!f) return;
        setTimeout(function () {
            if (S.sleeping || S.hidden) return;
            showBubble(f.msg, 5000, false, true); TTS.speak(f.voice); burst('🎉', 6); SFX.wake();
        }, 3500);
    }
    function checkLateNight() {
        var h = new Date().getHours(); if (h >= 2 && h < 5) setTimeout(function () { if (S.sleeping || S.hidden) return; showBubble(pick(MSG.lateNight), 3600, false); }, 5000);
    }
    function checkLongTimeNoSee() {
        setTimeout(function () {
            if (S.sleeping || S.hidden) return;
            if (Date.now() - S.last > 24 * 60 * 60 * 1000) showBubble(pick(MSG.longTimeNoSee), 3200, false);
            else showBubble('你好呀～我是小c 🦔', 2600, false);
            burst('✨', 4);
        }, 1200);
    }

    var proactiveState = { lastTime: 0, minInterval: 3 * 60 * 1000, idleThreshold: 5 * 60 * 1000 };
    function proactiveSpeak() {
        var hour = new Date().getHours();
        var idleMin = Math.floor((Date.now() - S.last) / 60000);
        fetchAIConfig().then(function (cfg) {
            var prompt = '你是小c，一只刺猬电子宠物。现在是' + hour + '点，用户已经' + idleMin + '分钟没理你了。请以第一人称主动找用户搭话，一句话，不超过30字，要符合刺猬性格，可以撒娇或关心用户，不要markdown。';
            var body = { model: cfg.model || 'deepseek-v4-flash', messages: [{ role: 'user', content: prompt }], temperature: 0.9, max_tokens: 100, stream: false };
            fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }).then(function (r) { return r.json(); }).then(function (json) {
                if (json.choices && json.choices[0]) {
                    var reply = json.choices[0].message.content;
                    showBubble(reply, 60000, false, true); TTS.speak(reply); setFace('happy', 2500); burst('💬', 2);
                    pushHistory('assistant', reply); S.mood = clamp(S.mood + 3, 0, 100); updateMoodColor();
                    if (json.usage) recordUsage(json.usage.prompt_tokens || 0, json.usage.completion_tokens || 0, json.usage.prompt_cache_hit_tokens || 0);
                }
            }).catch(function (err) { console.error('主动说话失败:', err); });
        });
    }

    setInterval(function () {
        if (S.sleeping || S.hidden || S.dialogueOpen || S.aiThinking) return;
        if (Date.now() - S.last < proactiveState.idleThreshold) return;
        if (Date.now() - proactiveState.lastTime < proactiveState.minInterval) return;
        proactiveState.lastTime = Date.now(); proactiveSpeak();
    }, 30000);

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { savePos(); saveSleep(); saveClicks(); lsSet(KEYS.last, String(S.last)); }
        else { lastFrame = performance.now(); }
    });

    function restore() {
        if (!lsGet(KEYS.meeting)) lsSet(KEYS.meeting, String(Date.now()));
        var savedDlgPos = lsGet('ciwei_pet_dlg_pos');
        if (savedDlgPos) { try { var p = JSON.parse(savedDlgPos); if (p && typeof p.x === 'number' && typeof p.y === 'number') { dialogue._savedX = p.x; dialogue._savedY = p.y; } } catch (e) {} }
        var savedScale = parseInt(lsGet(KEYS.scale) || String(DEFAULT_SCALE_INDEX), 10);
        if (isNaN(savedScale) || savedScale < 0 || savedScale >= SCALES.length) savedScale = DEFAULT_SCALE_INDEX;
        S.scaleIndex = savedScale; applySize(); updateScaleDisplay();
        var saved = null; try { saved = JSON.parse(lsGet(KEYS.pos) || 'null'); } catch (e) {}
        var s = getSize();
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') { var c = clampPos(saved.x, saved.y); setPos(c.x, c.y, false); }
        else setPos(window.innerWidth - s - 24, window.innerHeight - s - 24, false);
        if (lsGet(KEYS.sleeping) === 'true') { S.sleeping = true; host.classList.add('sleeping'); setImage('sleep'); startZzz(); }
        else { host.classList.add('idle-float'); setImage('idle1'); }
        S.clicks = parseInt(lsGet(KEYS.clicks) || '0', 10) || 0;
        var last = parseInt(lsGet(KEYS.last) || '0', 10); if (last > 0) S.last = last;
        if (lsGet(KEYS.hidden) === 'true') { S.hidden = true; host.classList.add('hidden'); restoreBtn.classList.add('show'); }
        S.soundOn = lsGet(KEYS.sound) !== 'false'; soundChk.textContent = S.soundOn ? '开启' : '关闭'; updateMoodColor();
    }

    function init() {
        for (var k in IMAGES) { if (IMAGES.hasOwnProperty(k)) { var i = new Image(); i.src = IMAGES[k]; } }
        TTS.init(); restore();
        requestAnimationFrame(function () { host.classList.add('ready'); });
        requestAnimationFrame(mainLoop); scheduleIdleAction();
        checkLongTimeNoSee(); checkBirthday(); checkSpecialDay(); checkNationalDay(); checkFestival(); checkLateNight();
        var rt = null;
        window.addEventListener('resize', function () {
            clearTimeout(rt);
            rt = setTimeout(function () {
                applySize(); var c = clampPos(S.x, S.y); setPos(c.x, c.y, false); savePos();
                if (S.dialogueOpen) { hideDialogue(); showDialogueAt(); }
            }, 150);
        });
        window.addEventListener('beforeunload', function () { savePos(); saveSleep(); saveClicks(); lsSet(KEYS.last, String(S.last)); });
        console.log('🦔 小c · v20 满血版已启动');
    }

    mount();
})();