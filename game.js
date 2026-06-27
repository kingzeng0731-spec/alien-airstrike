// 这个文件是一个浏览器小游戏的主逻辑。
// 它用 JavaScript 控制 <canvas> 画布：读取玩家输入、更新游戏状态、检测碰撞、再把画面画出来。

// 先从 HTML 页面里找到需要操作的元素。
// document.querySelector("#game") 的意思是：找到 id="game" 的元素。
const canvas = document.querySelector("#game");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.querySelector("#score");
    const timerEl = document.querySelector("#timer");
    const waveNoticeEl = document.querySelector("#waveNotice");
    const overlay = document.querySelector("#overlay");
    const titleEl = document.querySelector("#title");
    const messageEl = document.querySelector("#message");
    const settingsEl = document.querySelector("#settings");
    const startBtn = document.querySelector("#start");
    const muteBtn = document.querySelector("#mute");
    let timeLimitInput = document.querySelector("#timeLimit");
    const initialSettingsHtml = settingsEl.innerHTML;

    // Set 在这里用来保存“当前按住的按键”。
    // 数组分别保存游戏里的各种对象：玩家子弹、敌人、敌人子弹、粒子、星星、掉落道具。
    const keys = new Set();
    const bullets = [];
    const enemies = [];
    const enemyShots = [];
    const sparks = [];
    const stars = [];
    const pickups = [];
    const options = [];

    // 这些变量是整局游戏会变化的状态。
    // running 表示游戏是否正在运行，paused 表示是否暂停。
    // lastTime 用来计算每一帧之间隔了多久。
    let audioContext = null;
    let muted = false;
    let running = false;
    let paused = false;
    let lastTime = 0;
    let spawnTimer = 0;
    let score = 0;
    let wave = 1;
    let shake = 0;
    let timeRemaining = 0;
    let elapsedTime = 0;
    let monsterLevel = 1;
    let bossSpawnedForWave = 0;
    let waveNoticeTimer = 2.4;
    let waveNoticeText = "第 1 波";
    let grazeCooldown = 0;
    let rewardChoices = [];

    const normalWaveDuration = 24;
    const timedWaveDuration = 18;
    const normalBossEveryWaves = 3;
    const timedBossEveryWaves = 2;
    const maxPlayerLives = 6;
    const maxBombs = 3;
    const stats = {
      maxWave: 1,
      kills: 0,
      bossKills: 0,
      grazes: 0,
      bombsUsed: 0,
      cards: []
    };
    const dragControl = {
      active: false,
      pointerId: null,
      targetX: 520,
      targetY: 640,
      startX: 520,
      startY: 640,
      touchStartX: 520,
      touchStartY: 640
    };

    // 玩家在开始界面选择的设置。
    const settings = {
      mode: "energy",
      timed: false,
      timeLimit: 90,
      difficulty: "normal"
    };

    // 三种难度的参数。
    // 例如 hard 会让敌人更快、开火更频繁、玩家生命更少。
    const difficulties = {
      easy: {
        label: "简单",
        lives: 5,
        spawnScale: 1.18,
        enemySpeed: 0.82,
        enemyFire: 0.74,
        enemyHealth: -0.08,
        scoreScale: 0.9
      },
      normal: {
        label: "普通",
        lives: 3,
        spawnScale: 1,
        enemySpeed: 1,
        enemyFire: 1,
        enemyHealth: 0,
        scoreScale: 1
      },
      hard: {
        label: "困难",
        lives: 2,
        spawnScale: 0.78,
        enemySpeed: 1.2,
        enemyFire: 1.35,
        enemyHealth: 0.16,
        scoreScale: 1.22
      }
    };

    // 玩家飞机的数据。
    // x/y 是当前位置，radius 是碰撞半径，cooldown 是开火冷却时间。
    const player = {
      x: 520,
      y: 640,
      radius: 22,
      speed: 410,
      lives: 3,
      maxLives: 3,
      shield: 1,
      bombs: 2,
      cooldown: 0,
      charge: 1,
      fireLevel: 1,
      nextUpgrade: 180,
      lastUpgradeScore: 0,
      invulnerable: 0
    };

    // 根据浏览器窗口大小调整 canvas。
    // 注意 canvas 的“显示大小”和“真实像素大小”不一定一样，所以这里会乘 devicePixelRatio 来避免模糊。
    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * scale));
      canvas.height = Math.max(1, Math.floor(rect.height * scale));
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      resetStars(rect.width, rect.height);
      player.x = clamp(player.x, 34, rect.width - 34);
      player.y = clamp(player.y, 88, rect.height - 34);
    }

    // 初始化背景星星。只在 stars 为空时创建，避免每次窗口变化都重复生成。
    function resetStars(width, height) {
      if (stars.length > 0) return;
      for (let i = 0; i < 120; i += 1) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 1.8 + 0.4,
          speed: Math.random() * 70 + 25,
          alpha: Math.random() * 0.55 + 0.25
        });
      }
    }

    // 把 value 限制在 min 和 max 之间。
    // 比如玩家不能飞出屏幕，就会用这个函数限制坐标。
    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    // 生成 min 到 max 之间的随机小数。
    function rand(min, max) {
      return min + Math.random() * (max - min);
    }

    // 播放一个很短的音效。
    // Web Audio API 的写法看起来复杂，但核心就是：创建振荡器 -> 调整音量 -> 接到扬声器 -> 开始/停止。
    function playTone(freq, duration, type = "sine", gain = 0.05) {
      if (muted) return;
      try {
        audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const vol = audioContext.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        vol.gain.value = gain;
        vol.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
        osc.connect(vol).connect(audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + duration);
      } catch {
        muted = true;
      }
    }

    // 把内部设置转成界面上显示的中文。
    function modeText() {
      return settings.mode === "energy" ? "能量射击" : "自动升级";
    }

    function readTimeLimit() {
      const value = Number(timeLimitInput.value);
      const seconds = Number.isFinite(value) ? Math.round(value) : settings.timeLimit;
      settings.timeLimit = clamp(seconds, 10, 3600);
      timeLimitInput.value = String(settings.timeLimit);
      return settings.timeLimit;
    }

    // 把限时/不限时设置转成界面上显示的中文。
    function timeText() {
      return settings.timed ? `限时 ${settings.timeLimit} 秒` : "不限时";
    }

    function waveDuration() {
      return settings.timed ? timedWaveDuration : normalWaveDuration;
    }

    function bossEveryWaves() {
      return settings.timed ? timedBossEveryWaves : normalBossEveryWaves;
    }

    function resetStats() {
      stats.maxWave = 1;
      stats.kills = 0;
      stats.bossKills = 0;
      stats.grazes = 0;
      stats.bombsUsed = 0;
      stats.cards = [];
    }

    function recordKill(enemy) {
      stats.kills += 1;
      if (enemy.type === "boss") stats.bossKills += 1;
    }

    function rewardDescription(id) {
      if (id === "fire") {
        return settings.mode === "energy"
          ? `火力 ${player.fireLevel} -> ${player.fireLevel + 2}。主炮伤害提升，满能量追加副炮，低能量仍可弱射。`
          : `火力 ${player.fireLevel} -> ${player.fireLevel + 2}。弹幕数量、射速和主弹威力提升。`;
      }
      if (id === "shield") return `生命上限 ${player.maxLives} -> ${Math.min(maxPlayerLives, player.maxLives + 1)}，回复 1 点生命并回满护盾。`;
      if (id === "option") return options.length < 2 ? `僚机 ${options.length} -> ${options.length + 1}，跟随你直射支援。` : "僚机已满，改为回满能量和护盾。";
      if (id === "bomb") return `炸弹 ${player.bombs} -> ${Math.min(maxBombs, player.bombs + 1)}，并清空敌方弹幕。`;
      if (id === "graze") return "立刻回满能量，获得短暂无敌，适合接高压弹幕。";
      return "";
    }

    function settlementText(reason) {
      const cardText = stats.cards.length > 0 ? stats.cards.join("、") : "无";
      const result = reason === "time" ? "时间到" : "任务结束";
      return `${result}。最终分数：${score}。生存 ${formatClock(elapsedTime)}，最大波次 ${stats.maxWave}，击破 ${stats.kills} 架，BOSS ${stats.bossKills} 个，擦弹 ${stats.grazes} 次，使用炸弹 ${stats.bombsUsed} 次。技能卡：${cardText}。${modeText()} / ${timeText()} / ${difficulties[settings.difficulty].label}难度。`;
    }

    // 根据 settings 更新按钮的 aria-pressed 状态，让界面知道哪个选项被选中了。
    function syncSettingButtons() {
      for (const button of document.querySelectorAll("[data-option]")) {
        const option = button.dataset.option;
        const value = option === "timed" ? String(settings.timed) : settings[option];
        button.setAttribute("aria-pressed", String(button.dataset.value === value));
      }
    }

    // 开始一局新游戏：清空旧数据，重置玩家、分数、倒计时，然后启动动画循环。
    function startGame() {
      const difficulty = difficulties[settings.difficulty];
      readTimeLimit();
      score = 0;
      wave = 1;
      monsterLevel = 1;
      bossSpawnedForWave = 0;
      waveNoticeTimer = 2.4;
      waveNoticeText = "第 1 波";
      rewardChoices = [];
      resetStats();
      spawnTimer = 0;
      timeRemaining = settings.timed ? settings.timeLimit : 0;
      elapsedTime = 0;
      bullets.length = 0;
      enemies.length = 0;
      enemyShots.length = 0;
      sparks.length = 0;
      pickups.length = 0;
      options.length = 0;
      player.x = canvas.clientWidth / 2;
      player.y = canvas.clientHeight - 92;
      player.lives = difficulty.lives;
      player.maxLives = difficulty.lives;
      player.shield = 1;
      player.bombs = settings.difficulty === "hard" ? 1 : 2;
      player.cooldown = 0;
      player.charge = 1;
      player.fireLevel = 1;
      player.nextUpgrade = settings.difficulty === "hard" ? 190 : settings.difficulty === "easy" ? 120 : 150;
      player.lastUpgradeScore = 0;
      player.invulnerable = 1.6;
      dragControl.active = false;
      dragControl.targetX = player.x;
      dragControl.targetY = player.y;
      dragControl.startX = player.x;
      dragControl.startY = player.y;
      dragControl.touchStartX = player.x;
      dragControl.touchStartY = player.y;
      running = true;
      paused = false;
      settingsEl.hidden = true;
      overlay.classList.add("hidden");
      lastTime = performance.now();
      updateHud();
      requestAnimationFrame(loop);
    }

    // 游戏结束时显示结算界面。
    // reason 为 "time" 表示倒计时结束，否则一般是玩家生命耗尽。
    function endGame(reason = "lost") {
      running = false;
      titleEl.textContent = reason === "time" ? "时间到" : "任务结束";
      messageEl.textContent = settlementText(reason);
      startBtn.textContent = "重新开始";
      settingsEl.hidden = false;
      overlay.classList.remove("hidden");
    }

    // 暂停/继续游戏。
    function togglePause() {
      if (!running) return;
      if (rewardChoices.length > 0) return;
      paused = !paused;
      titleEl.textContent = paused ? "已暂停" : "星际空袭";
      messageEl.textContent = paused ? "按 P 继续战斗。" : "方向键或 WASD 移动。可选择不限时，或输入自定义限时时间。";
      settingsEl.hidden = paused;
      startBtn.textContent = paused ? "继续" : "开始游戏";
      overlay.classList.toggle("hidden", !paused);
      if (!paused) {
        lastTime = performance.now();
        requestAnimationFrame(loop);
      }
    }

    function bossDefeated(enemy) {
      recordKill(enemy);
      score += enemy.points;
      addPickup(enemy.x, enemy.y, true);
      makeSparks(enemy.x, enemy.y, "#ffcf5b", 64);
      showRewardCards();
    }

    function showRewardCards() {
      rewardChoices = [
        { id: "fire", title: "火力强化", desc: rewardDescription("fire") },
        { id: "shield", title: "护盾核心", desc: rewardDescription("shield") },
        { id: "option", title: "僚机支援", desc: rewardDescription("option") },
        { id: "bomb", title: "炸弹补给", desc: rewardDescription("bomb") },
        { id: "graze", title: "擦弹充能", desc: rewardDescription("graze") }
      ].sort(() => Math.random() - 0.5).slice(0, 3);
      paused = true;
      titleEl.textContent = "选择技能";
      messageEl.textContent = "击破 BOSS，选择一张强化卡继续。";
      settingsEl.hidden = false;
      settingsEl.innerHTML = rewardChoices.map((choice) => `
        <button class="reward-card" data-reward="${choice.id}">
          <span>${choice.title}</span>
          <small>${choice.desc}</small>
        </button>
      `).join("");
      startBtn.textContent = "稍后选择";
      overlay.classList.remove("hidden");
    }

    function applyReward(id) {
      const choice = rewardChoices.find((item) => item.id === id);
      if (id === "fire") {
        player.fireLevel += 2;
        player.nextUpgrade += autoUpgradeStep();
      } else if (id === "shield") {
        player.maxLives = Math.min(maxPlayerLives, player.maxLives + 1);
        player.lives = Math.min(player.maxLives, player.lives + 1);
        player.shield = 1;
      } else if (id === "option") {
        if (options.length < 2) options.push({ side: options.length === 0 ? -1 : 1, x: player.x, y: player.y });
        else player.charge = 1;
      } else if (id === "bomb") {
        player.bombs = Math.min(maxBombs, player.bombs + 1);
        enemyShots.length = 0;
      } else if (id === "graze") {
        player.charge = 1;
        player.invulnerable = Math.max(player.invulnerable, 1.2);
      }
      if (choice) stats.cards.push(choice.title);
      rewardChoices = [];
      settingsEl.innerHTML = initialSettingsHtml;
      bindSettingButtons();
      syncSettingButtons();
      paused = false;
      overlay.classList.add("hidden");
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }

    // 更新左上角分数/时间，以及顶部中间的波次倒计时提示。
    function updateHud() {
      scoreEl.textContent = String(score);
      timerEl.textContent = settings.timed ? `${Math.max(0, Math.ceil(timeRemaining))}s` : formatClock(elapsedTime);
      const nextWaveIn = Math.max(0, wave * waveDuration() - elapsedTime);
      if (waveNoticeTimer > 0) {
        waveNoticeEl.textContent = waveNoticeText;
        waveNoticeEl.classList.remove("hidden");
      } else if (nextWaveIn <= 8) {
        waveNoticeEl.textContent = `第 ${wave + 1} 波马上来 ${Math.ceil(nextWaveIn)}s`;
        waveNoticeEl.classList.remove("hidden");
      } else {
        waveNoticeEl.textContent = `第 ${wave + 1} 波 ${Math.ceil(nextWaveIn)}s`;
        waveNoticeEl.classList.remove("hidden");
      }
    }

    // 把秒数格式化成 分:秒，比如 75 秒变成 1:15。
    function formatClock(seconds) {
      const total = Math.max(0, Math.floor(seconds));
      const minutes = Math.floor(total / 60);
      const rest = String(total % 60).padStart(2, "0");
      return `${minutes}:${rest}`;
    }

    // 自动升级模式下的最高火力等级。
    // 限时模式最多 5 级，不限时模式可以无限成长。
    function autoMaxLevel() {
      return settings.timed ? 6 : Infinity;
    }

    // 自动升级模式下，每升一级需要增加多少分数门槛。
    function autoUpgradeStep() {
      const base = settings.difficulty === "hard" ? 210 : settings.difficulty === "easy" ? 135 : 170;
      const curve = Math.pow(player.fireLevel + 1, 1.95) * 28;
      return Math.round(base + curve);
    }

    // 怪物每 30 秒提升一级。
    // monsterLevel 越高，后面生成的敌人越强。
    function updateMonsterLevel() {
      const nextLevel = 1 + Math.floor(elapsedTime / 30);
      if (nextLevel <= monsterLevel) return;
      monsterLevel = nextLevel;
      makeSparks(canvas.clientWidth / 2, 92, "#ffcf5b", 28);
      playTone(140, 0.18, "sawtooth", 0.05);
    }

    function updateWaveProgress(dt) {
      const nextWave = 1 + Math.floor(elapsedTime / waveDuration());
      if (nextWave <= wave) {
        waveNoticeTimer = Math.max(0, waveNoticeTimer - dt);
        return;
      }

      wave = nextWave;
      stats.maxWave = Math.max(stats.maxWave, wave);
      waveNoticeTimer = 2.8;
      waveNoticeText = wave % bossEveryWaves() === 0 ? `第 ${wave} 波 BOSS` : `第 ${wave} 波`;
      spawnTimer = Math.min(spawnTimer, 0.12);
      makeSparks(canvas.clientWidth / 2, 78, wave % bossEveryWaves() === 0 ? "#ff5d7d" : "#ffcf5b", wave % bossEveryWaves() === 0 ? 46 : 28);
      playTone(wave % bossEveryWaves() === 0 ? 90 : 160, 0.2, "sawtooth", 0.055);
      if (wave % bossEveryWaves() === 0 && bossSpawnedForWave !== wave) {
        spawnBoss(wave);
        bossSpawnedForWave = wave;
      }
    }

    // 敌人距离玩家多远以内才会开火。
    // 怪物等级越高，攻击范围越大，但不会超过屏幕尺寸的一定比例。
    function enemyAttackRange() {
      const screenLimit = Math.max(canvas.clientWidth, canvas.clientHeight) * 1.35;
      return Math.min(screenLimit, 280 + monsterLevel * 85);
    }

    // 敌人一次发射几颗子弹。
    // 波数和怪物等级越高弹幕越密，BOSS 额外加量。
    function enemyShotCount(enemy) {
      const base = 1 + Math.floor((wave - 1) / 2) + Math.floor((monsterLevel - 1) / 3);
      const typeBonus = enemy.type === "boss" ? 4 : enemy.type === "shielder" ? 2 : enemy.type === "summoner" ? 1 : 0;
      return Math.min(enemy.type === "boss" ? 16 : 10, base + typeBonus);
    }

    // 让某个敌人朝玩家方向发射一组子弹。
    function fireEnemyVolley(enemy, difficulty) {
      const count = enemyShotCount(enemy);
      // atan2 可以算出“敌人指向玩家”的角度。
      const baseAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const spread = Math.min(enemy.type === "boss" ? 1.75 : 1.05, 0.13 * (count - 1));
      const speed = (168 + wave * 15 + monsterLevel * 12) * difficulty.enemySpeed;
      for (let i = 0; i < count; i += 1) {
        // middle/offset 让多颗子弹围绕中间方向散开。
        const middle = (count - 1) / 2;
        let angle = baseAngle + (i - middle) * (count === 1 ? 0 : spread / Math.max(1, count - 1));
        if (enemy.type === "boss" && enemy.volleyFlip) {
          angle = -Math.PI / 2 + (i / count) * Math.PI * 2 + performance.now() / 1200;
        } else if (enemy.type === "shielder") {
          angle += Math.sin(performance.now() / 420 + i) * 0.16;
        }
        enemyShots.push({
          x: enemy.x,
          y: enemy.y + enemy.radius * 0.7,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: enemy.type === "boss" ? 7 : 5 + Math.min(4, Math.floor((monsterLevel - 1) / 4))
        });
      }
      enemy.volleyFlip = !enemy.volleyFlip;
      // 防止敌方子弹无限增加，数量太多会卡。
      if (enemyShots.length > 360) enemyShots.splice(0, enemyShots.length - 360);
    }

    function fireEnemyBurst(enemy, count = 8, speed = 150) {
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + rand(-0.08, 0.08);
        enemyShots.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 5
        });
      }
      if (enemyShots.length > 360) enemyShots.splice(0, enemyShots.length - 360);
    }

    // 玩家开火。
    // auto=true 表示自动升级模式里自动射击；false 表示玩家按键射击。
    function shoot(auto = false) {
      if (player.cooldown > 0) return;
      // 能量模式：低能量也能弱射；火力等级会提升主炮伤害、副炮数量和满能量收益。
      if (settings.mode === "energy") {
        const level = player.fireLevel;
        const lowEnergy = player.charge < 0.11;
        const fullEnergy = player.charge > 0.86;
        const strongEnergy = player.charge > 0.62;
        const mainPower = lowEnergy ? 1 : 1 + Math.floor((level - 1) / 3) + (fullEnergy ? 1 : 0);
        const mainRadius = fullEnergy ? 6 : lowEnergy ? 3 : 4 + Math.min(2, Math.floor(level / 5));
        bullets.push({ x: player.x, y: player.y - 28, vx: 0, vy: lowEnergy ? -560 : -720, radius: mainRadius, power: mainPower, pierce: fullEnergy ? 1 : 0 });

        const sidePairs = (strongEnergy ? 1 : 0) + (level >= 4 && player.charge > 0.44 ? 1 : 0) + (level >= 8 && fullEnergy ? 1 : 0);
        for (let pair = 0; pair < sidePairs; pair += 1) {
          const spread = 44 + pair * 34;
          const offset = 15 + pair * 9;
          const sidePower = fullEnergy && pair === 0 ? 2 : 1;
          bullets.push({ x: player.x - offset, y: player.y - 22 + pair * 3, vx: -spread, vy: -660 - pair * 18, radius: 3 + (fullEnergy ? 1 : 0), power: sidePower, pierce: fullEnergy && pair === 0 ? 1 : 0 });
          bullets.push({ x: player.x + offset, y: player.y - 22 + pair * 3, vx: spread, vy: -660 - pair * 18, radius: 3 + (fullEnergy ? 1 : 0), power: sidePower, pierce: fullEnergy && pair === 0 ? 1 : 0 });
        }
      }
      if (options.length > 0 && player.charge > 0.22) {
        for (const option of options) {
          bullets.push({ x: option.x, y: option.y - 12, vx: 0, vy: -620, radius: 3, power: 1 });
        }
      }
      if (settings.mode === "auto") {
        // 自动升级模式：火力等级越高，弹丸越多、散射越宽、威力越强。
        const level = player.fireLevel;
        const pelletCount = Math.min(11, 1 + Math.floor((level - 1) * 0.72));
        const spread = Math.min(0.74, 0.1 + level * 0.026);
        const power = 1 + Math.floor((level - 1) / 11);
        for (let i = 0; i < pelletCount; i += 1) {
          const middle = (pelletCount - 1) / 2;
          const offset = i - middle;
          const ratio = middle === 0 ? 0 : offset / middle;
          const angle = -Math.PI / 2 + ratio * spread;
          const speed = 650 + Math.min(level * 6, 150);
          bullets.push({
            x: player.x + offset * 4,
            y: player.y - 24 + Math.abs(offset) * 1.4,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: level >= 8 && i === Math.round(middle) ? 5 : 3,
            power: i === Math.round(middle) ? power : Math.max(1, power - 1)
          });
        }
        player.cooldown = Math.max(settings.timed ? 0.12 : 0.09, 0.24 - level * 0.007);
      } else {
        // 能量模式每次射击会消耗一点 charge。
        const lowEnergy = player.charge < 0.11;
        player.cooldown = lowEnergy ? 0.24 : Math.max(0.09, 0.14 - Math.min(player.fireLevel, 10) * 0.004);
        player.charge = Math.max(0, player.charge - (lowEnergy ? 0.025 : Math.max(0.052, 0.082 - player.fireLevel * 0.0025)));
      }
      // 同样限制玩家子弹数量，避免对象太多影响性能。
      if (bullets.length > 180) bullets.splice(0, bullets.length - 180);
      playTone(settings.mode === "auto" ? 720 : 640, 0.06, "square", 0.035);
    }

    function useBomb() {
      if (!running || paused || player.bombs <= 0) return;
      player.bombs -= 1;
      stats.bombsUsed += 1;
      player.invulnerable = Math.max(player.invulnerable, 1.8);
      shake = 18;
      enemyShots.length = 0;
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        const enemy = enemies[i];
        const damage = enemy.type === "boss" ? 18 + wave * 2 : 999;
        enemy.hp -= damage;
        enemy.shield = 0;
        makeSparks(enemy.x, enemy.y, "#ffcf5b", enemy.type === "boss" ? 36 : 22);
        if (enemy.hp <= 0) {
          enemies.splice(i, 1);
          if (enemy.type === "boss") {
            bossDefeated(enemy);
          } else {
            recordKill(enemy);
            score += enemy.points;
            addPickup(enemy.x, enemy.y, true);
          }
        }
      }
      makeSparks(player.x, player.y, "#ff8aa6", 70);
      playTone(70, 0.34, "sawtooth", 0.09);
    }

    function makeEnemy(type, x, y, hp, radius, speed, points) {
      const difficulty = difficulties[settings.difficulty];
      return {
        type,
        x,
        y,
        baseX: x,
        targetY: type === "tough" || type === "shielder" || type === "summoner" || type === "support" ? rand(74, 148) : 0,
        diveTimer: type === "bomber" ? rand(0.9, 1.7) : Infinity,
        stealthTimer: type === "stealth" ? rand(0.8, 1.4) : Infinity,
        visible: true,
        radius,
        hp,
        maxHp: hp,
        shield: type === "shielder" || type === "support" ? Math.max(2, Math.floor(wave * 0.55)) : 0,
        maxShield: type === "shielder" || type === "support" ? Math.max(2, Math.floor(wave * 0.55)) : 0,
        speed,
        wobble: rand(0.7, type === "boss" ? 1.2 : 2.6),
        phase: rand(0, Math.PI * 2),
        path: type === "basic" || type === "minion" ? (Math.random() < 0.5 ? "sine" : "sweep") : "hover",
        shotTimer: rand(0.8, type === "boss" ? 1.7 : 2.8) / Math.sqrt(wave * difficulty.enemyFire * (1 + monsterLevel * 0.16)),
        summonTimer: type === "summoner" || type === "boss" ? rand(2.8, 4.8) : Infinity,
        points
      };
    }

    function spawnMinion(x, y, type = "minion") {
      const difficulty = difficulties[settings.difficulty];
      const pressure = 0.72 + Math.min(0.58, (wave - 1) * 0.055 + (monsterLevel - 1) * 0.035);
      const hp = 1 + Math.floor(wave / 6);
      const radius = 13;
      enemies.push(makeEnemy(
        type,
        clamp(x + rand(-42, 42), radius, canvas.clientWidth - radius),
        y,
        hp,
        radius,
        (rand(92, 138) + wave * 6) * difficulty.enemySpeed * pressure,
        Math.round(8 * difficulty.scoreScale * (1 + wave * 0.08))
      ));
    }

    function spawnSquad() {
      const width = canvas.clientWidth;
      const difficulty = difficulties[settings.difficulty];
      const pressure = 0.72 + Math.min(0.58, (wave - 1) * 0.055 + (monsterLevel - 1) * 0.035);
      const count = Math.min(8, 3 + Math.floor((wave + 1) / 3));
      const formation = Math.random() < 0.5 ? "arc" : "vee";
      const baseX = rand(width * 0.18, width * 0.82);
      const hp = 1 + Math.floor(wave / 6);
      for (let i = 0; i < count; i += 1) {
        const middle = (count - 1) / 2;
        const offset = i - middle;
        const x = clamp(baseX + offset * 34, 24, width - 24);
        const y = -36 - Math.abs(offset) * (formation === "arc" ? 12 : 20);
        const enemy = makeEnemy(
          "basic",
          x,
          y,
          hp,
          16,
          (rand(82, 128) + wave * 7) * difficulty.enemySpeed * pressure,
          Math.round(12 * difficulty.scoreScale * (1 + wave * 0.08))
        );
        enemy.path = formation;
        enemy.baseX = x;
        enemies.push(enemy);
      }
    }

    function spawnBoss(bossWave) {
      const difficulty = difficulties[settings.difficulty];
      const width = canvas.clientWidth;
      const threatScale = 1 + (bossWave - 1) * 0.2 + (monsterLevel - 1) * 0.12;
      const hpScale = settings.difficulty === "hard" ? 1.22 : settings.difficulty === "easy" ? 0.86 : 1;
      const hp = Math.round((42 + bossWave * 7 + monsterLevel * 5) * threatScale * hpScale);
      const boss = makeEnemy(
        "boss",
        width / 2,
        -70,
        hp,
        46,
        (42 + bossWave * 2.2) * difficulty.enemySpeed,
        Math.round((360 + bossWave * 70) * difficulty.scoreScale)
      );
      boss.targetY = 88;
      boss.shield = Math.round(6 + bossWave * 1.4);
      boss.maxShield = boss.shield;
      enemies.push(boss);
    }

    // 生成一个新的敌人，从屏幕上方进入。
    function spawnEnemy() {
      const width = canvas.clientWidth;
      const difficulty = difficulties[settings.difficulty];
      const pressure = 0.72 + Math.min(0.58, (wave - 1) * 0.055 + (monsterLevel - 1) * 0.035);
      const squadChance = clamp(0.34 + wave * 0.015, 0.34, 0.52);
      if (Math.random() < squadChance) {
        spawnSquad();
        return;
      }
      // threatScale 随怪物等级上升，用来增强血量、分数等。
      const threatScale = 1 + (wave - 1) * 0.14 + (monsterLevel - 1) * 0.1;
      const eliteRoll = Math.random();
      const shielderChance = clamp(0.02 + wave * 0.012 + difficulty.enemyHealth * 0.18, 0, 0.2);
      const summonerChance = wave >= 4 ? clamp(0.01 + wave * 0.008, 0, 0.16) : 0;
      const bomberChance = wave >= 3 ? clamp(0.04 + wave * 0.006, 0, 0.15) : 0;
      const stealthChance = wave >= 6 ? clamp(0.02 + wave * 0.004, 0, 0.1) : 0;
      const supportChance = wave >= 7 ? clamp(0.015 + wave * 0.004, 0, 0.09) : 0;
      const toughChance = Math.min(0.24 + wave * 0.022 + monsterLevel * 0.016 + difficulty.enemyHealth, 0.82);
      let type = "basic";
      let cursor = 0;
      if (eliteRoll < (cursor += supportChance)) type = "support";
      else if (eliteRoll < (cursor += stealthChance)) type = "stealth";
      else if (eliteRoll < (cursor += bomberChance)) type = "bomber";
      else if (eliteRoll < (cursor += summonerChance)) type = "summoner";
      else if (eliteRoll < (cursor += shielderChance)) type = "shielder";
      else if (eliteRoll < (cursor += toughChance)) type = "tough";

      const bonusHp = Math.floor((wave - 1) / 3) + Math.floor((monsterLevel - 1) / 4);
      const hardBonus = settings.difficulty === "hard" && wave > 3 ? 1 : 0;
      const hpByType = {
        basic: 1 + Math.floor(wave / 6),
        minion: 1,
        tough: 5 + bonusHp + hardBonus,
        shielder: 5 + bonusHp + hardBonus,
        summoner: 7 + bonusHp + hardBonus,
        bomber: 3 + Math.floor(wave / 4),
        stealth: 3 + Math.floor(wave / 4),
        support: 5 + bonusHp
      };
      const radiusByType = {
        basic: 18,
        tough: 24,
        shielder: 25,
        summoner: 27,
        bomber: 20,
        stealth: 21,
        support: 23
      };
      const radius = radiusByType[type];
      const speed = (rand(70, 112) + wave * 6 + monsterLevel * 4) * difficulty.enemySpeed * pressure * (type === "summoner" || type === "support" ? 0.76 : 1);
      const points = Math.round((type === "basic" ? 14 : type === "tough" ? 42 : type === "shielder" ? 52 : type === "bomber" ? 44 : type === "stealth" ? 50 : type === "support" ? 54 : 62) * difficulty.scoreScale * threatScale);
      enemies.push(makeEnemy(type, rand(34, width - 34), -32, hpByType[type], radius, speed, points));
    }

    // 制造爆炸/受击的粒子效果。
    function makeSparks(x, y, color, count = 16) {
      for (let i = 0; i < count; i += 1) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(70, 280);
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.28, 0.72),
          maxLife: 0.72,
          size: rand(1.5, 4.2),
          color
        });
      }
    }

    // 敌人被击毁时，有概率掉落道具。
    // life 加生命，upgrade 升级火力，charge 回满能量。
    function addPickup(x, y, force = false) {
      const chance = settings.mode === "auto" ? 0.2 : 0.16;
      if (!force && Math.random() > chance) return;
      if (force) {
        pickups.push({ x, y, radius: 12, speed: 120, type: Math.random() < 0.5 ? "bomb" : "charge" });
        return;
      }
      const roll = Math.random();
      const type = roll < 0.1 ? "bomb"
        : settings.mode === "auto"
          ? (roll < 0.62 ? "upgrade" : roll < 0.78 ? "charge" : "life")
          : (roll < 0.78 ? "charge" : "life");
      pickups.push({ x, y, radius: 12, speed: 120, type });
    }

    // 每一帧更新游戏状态。
    // dt 是距离上一帧过去的秒数，time 是浏览器传进来的当前时间。
    function update(dt, time) {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const difficulty = difficulties[settings.difficulty];
      // dx/dy 表示玩家当前移动方向。
      // 右/下是 +1，左/上是 -1，没有按就是 0。
      const dx = (keys.has("ArrowRight") || keys.has("d") || keys.has("right") ? 1 : 0)
        - (keys.has("ArrowLeft") || keys.has("a") || keys.has("left") ? 1 : 0);
      const dy = (keys.has("ArrowDown") || keys.has("s") || keys.has("down") ? 1 : 0)
        - (keys.has("ArrowUp") || keys.has("w") || keys.has("up") ? 1 : 0);
      const length = Math.hypot(dx, dy) || 1;

      // 除以 length 是为了让斜着飞时速度不要变快；触屏拖动时飞机跟随手指。
      if (dragControl.active) {
        const follow = Math.min(1, dt * 14);
        player.x += (dragControl.targetX - player.x) * follow;
        player.y += (dragControl.targetY - player.y) * follow;
        player.x = clamp(player.x, 26, width - 26);
        player.y = clamp(player.y, 68, height - 26);
      } else {
        player.x = clamp(player.x + (dx / length) * player.speed * dt, 26, width - 26);
        player.y = clamp(player.y + (dy / length) * player.speed * dt, 68, height - 26);
      }
      player.cooldown = Math.max(0, player.cooldown - dt);
      player.charge = Math.min(1, player.charge + dt * 0.16);
      player.shield = Math.min(1, player.shield + dt * 0.045);
      player.invulnerable = Math.max(0, player.invulnerable - dt);
      grazeCooldown = Math.max(0, grazeCooldown - dt);
      elapsedTime += dt;
      updateMonsterLevel();
      updateWaveProgress(dt);
      // 限时模式：倒计时归零就结束。
      if (settings.timed) {
        timeRemaining -= dt;
        if (timeRemaining <= 0) {
          timeRemaining = 0;
          updateHud();
          endGame("time");
          return;
        }
      }
      // 自动模式自动开火；能量模式按空格或屏幕按钮开火。
      if (settings.mode === "auto") {
        shoot(true);
      } else if (keys.has(" ") || keys.has("fire")) {
        shoot();
      }

      // 根据当前难度、波次、怪物等级决定刷怪间隔。
      spawnTimer -= dt;
      const bossAlive = enemies.some((enemy) => enemy.type === "boss");
      const pressure = Math.min(0.58, (wave - 1) * 0.045 + (monsterLevel - 1) * 0.028);
      const spawnGap = clamp((1.18 - pressure) * difficulty.spawnScale * (bossAlive ? 1.28 : 1), 0.28, 1.22);
      if (spawnTimer <= 0) {
        spawnEnemy();
        spawnTimer = spawnGap;
      }

      if (settings.mode === "auto") upgradeFire(false);

      // 背景星星向下移动，超过底部就从顶部重新出现。
      for (const star of stars) {
        star.y += star.speed * dt * (1 + wave * 0.03);
        if (star.y > height + 4) {
          star.y = -4;
          star.x = Math.random() * width;
        }
      }

      // 更新玩家子弹位置；飞出屏幕后删除。
      for (let i = bullets.length - 1; i >= 0; i -= 1) {
        const bullet = bullets[i];
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        if (bullet.y < -30 || bullet.x < -30 || bullet.x > width + 30) bullets.splice(i, 1);
      }

      // 更新敌方子弹，并检测是否打到玩家。
      for (let i = enemyShots.length - 1; i >= 0; i -= 1) {
        const shot = enemyShots[i];
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        if (shot.y > height - shot.radius * 2 || shot.x < -shot.radius || shot.x > width + shot.radius) {
          enemyShots.splice(i, 1);
          continue;
        }
        const hitbox = { x: player.x, y: player.y - 4, radius: 8 };
        const grazeZone = { x: player.x, y: player.y - 4, radius: 25 };
        if (player.invulnerable <= 0 && circlesTouch(hitbox, shot)) {
          enemyShots.splice(i, 1);
          hurtPlayer();
        } else if (grazeCooldown <= 0 && circlesTouch(grazeZone, shot) && !circlesTouch(hitbox, shot)) {
          grazeCooldown = 0.12;
          stats.grazes += 1;
          score += 2;
          player.charge = Math.min(1, player.charge + 0.015);
          makeSparks(player.x, player.y - 6, "#d7fbff", 3);
        }
      }

      // 更新敌人：移动、开火、出界删除、撞到玩家、被玩家子弹击中。
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        const enemy = enemies[i];
        enemy.phase += enemy.wobble * dt;
        if (enemy.type === "boss") {
          if (enemy.y < enemy.targetY) enemy.y += enemy.speed * dt;
          enemy.x += Math.sin(enemy.phase) * (86 + wave * 5) * dt;
          enemy.y = Math.min(enemy.y, height * 0.32);
        } else if (enemy.type === "tough" || enemy.type === "shielder" || enemy.type === "summoner" || enemy.type === "support") {
          if (enemy.y < enemy.targetY) enemy.y += enemy.speed * dt;
          else enemy.x += Math.sin(enemy.phase) * (56 + wave * 2) * dt;
        } else if (enemy.type === "bomber") {
          enemy.diveTimer -= dt;
          const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
          const diving = enemy.diveTimer <= 0 || Math.hypot(player.x - enemy.x, player.y - enemy.y) < 180;
          enemy.x += (diving ? Math.cos(angle) * enemy.speed * 1.9 : Math.sin(enemy.phase) * 72) * dt;
          enemy.y += enemy.speed * (diving ? 1.7 : 1) * dt;
        } else if (enemy.type === "stealth") {
          enemy.stealthTimer -= dt;
          if (enemy.stealthTimer <= 0) {
            enemy.visible = !enemy.visible;
            enemy.stealthTimer = enemy.visible ? rand(0.9, 1.4) : rand(0.35, 0.65);
            if (enemy.visible) enemy.x = clamp(enemy.x + rand(-86, 86), enemy.radius, width - enemy.radius);
          }
          enemy.y += enemy.speed * dt;
          enemy.x += Math.sin(enemy.phase) * (86 + wave * 3) * dt;
        } else {
          enemy.y += enemy.speed * dt;
          const sway = enemy.path === "vee" ? 46 : enemy.path === "arc" ? 76 : 70;
          enemy.x = enemy.baseX + Math.sin(enemy.phase) * (sway + wave * 2);
          enemy.y += Math.abs(Math.sin(enemy.phase * 0.5)) * 12 * dt;
        }
        enemy.x = clamp(enemy.x, enemy.radius, width - enemy.radius);
        enemy.shotTimer -= dt;
        enemy.summonTimer -= dt;

        if (enemy.type === "support" && enemy.y > 10) {
          for (const ally of enemies) {
            if (ally === enemy || ally.type === "boss") continue;
            if (Math.hypot(ally.x - enemy.x, ally.y - enemy.y) < 120) {
              ally.shield = Math.max(ally.shield, 1.5 + wave * 0.12);
              ally.maxShield = Math.max(ally.maxShield, ally.shield);
            }
          }
        }

        if (enemy.summonTimer <= 0 && enemy.y > 18) {
          const summonCount = enemy.type === "boss" ? 3 : 2;
          for (let s = 0; s < summonCount; s += 1) spawnMinion(enemy.x, enemy.y + enemy.radius * 0.4);
          enemy.summonTimer = rand(enemy.type === "boss" ? 3.0 : 4.4, enemy.type === "boss" ? 4.8 : 6.2) / Math.sqrt(1 + wave * 0.04);
          makeSparks(enemy.x, enemy.y, "#b794ff", 16);
        }

        // 只有敌人在攻击范围内，才会朝玩家开火。
        const distanceToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (enemy.visible !== false && enemy.shotTimer <= 0 && enemy.y > 20 && distanceToPlayer <= enemyAttackRange()) {
          fireEnemyVolley(enemy, difficulty);
          enemy.shotTimer = rand(enemy.type === "boss" ? 0.8 : 1.1, enemy.type === "boss" ? 1.8 : 2.7) / Math.sqrt(wave * difficulty.enemyFire * (1 + monsterLevel * 0.14));
          playTone(180, 0.08, "sawtooth", 0.018);
        }

        if (enemy.type !== "boss" && enemy.y > height - enemy.radius * 0.6) {
          enemies.splice(i, 1);
          continue;
        }

        // 玩家和敌人相撞，玩家受伤；BOSS 不会因为碰撞消失。
        const playerHitbox = { x: player.x, y: player.y - 4, radius: 10 };
        if (enemy.visible !== false && player.invulnerable <= 0 && circlesTouch(playerHitbox, enemy)) {
          if (enemy.type !== "boss") enemies.splice(i, 1);
          makeSparks(enemy.x, enemy.y, "#ff75a0", 24);
          if (enemy.type === "bomber") fireEnemyBurst(enemy, 10, 180);
          hurtPlayer();
          if (enemy.type !== "boss") continue;
        }

        // 倒着遍历数组并 splice 删除，是为了删除元素时不跳过后面的对象。
        for (let j = bullets.length - 1; j >= 0; j -= 1) {
          const bullet = bullets[j];
          if (!circlesTouch(enemy, bullet)) continue;
          if (enemy.visible === false) continue;
          const consumeBullet = (bullet.pierce || 0) <= 0;
          if (consumeBullet) bullets.splice(j, 1);
          else bullet.pierce -= 1;
          if (enemy.shield > 0) {
            enemy.shield = Math.max(0, enemy.shield - bullet.power);
          } else {
            enemy.hp -= bullet.power;
          }
          makeSparks(bullet.x, bullet.y, "#6ff0ff", 6);
          if (enemy.hp <= 0) {
            // 敌人血量归零：加分、可能掉落道具、播放爆炸效果。
            enemies.splice(i, 1);
            if (enemy.type === "boss") {
              bossDefeated(enemy);
            } else {
              recordKill(enemy);
              score += enemy.points;
              if (enemy.type === "bomber") fireEnemyBurst(enemy, 8, 150);
              addPickup(enemy.x, enemy.y);
            }
            makeSparks(enemy.x, enemy.y, enemy.maxHp > 1 ? "#ffcf5b" : "#64f2a4", enemy.maxHp > 1 ? 30 : 18);
            playTone(enemy.maxHp > 1 ? 120 : 260, 0.12, "triangle", 0.055);
          } else {
            playTone(340, 0.05, "triangle", 0.03);
          }
          break;
        }
      }

      // 更新掉落道具的位置，并检测玩家是否捡到。
      for (let i = pickups.length - 1; i >= 0; i -= 1) {
        const pickup = pickups[i];
        pickup.y += pickup.speed * dt;
        pickup.x += Math.sin(time / 260 + pickup.y * 0.02) * 26 * dt;
        if (pickup.y > height + 30) {
          pickups.splice(i, 1);
          continue;
        }
        if (circlesTouch(player, pickup)) {
          pickups.splice(i, 1);
          if (pickup.type === "life") {
            player.maxLives = Math.min(maxPlayerLives, Math.max(player.maxLives, player.lives + 1));
            player.lives = Math.min(player.maxLives, player.lives + 1);
          } else if (pickup.type === "upgrade") {
            upgradeFire(true);
          } else if (pickup.type === "bomb") {
            player.bombs = Math.min(maxBombs, player.bombs + 1);
          } else if (pickup.type === "option") {
            if (options.length < 2) options.push({ side: options.length === 0 ? -1 : 1, x: player.x, y: player.y });
            else player.charge = 1;
          } else {
            player.charge = 1;
            player.shield = 1;
          }
          playTone(880, 0.11, "sine", 0.055);
        }
      }

      for (let i = 0; i < options.length; i += 1) {
        const option = options[i];
        const side = i === 0 ? -1 : 1;
        option.x += (player.x + side * 42 - option.x) * Math.min(1, dt * 9);
        option.y += (player.y + 14 - option.y) * Math.min(1, dt * 9);
      }

      // 更新粒子效果，生命值归零后删除。
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.life -= dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vx *= 0.985;
        spark.vy *= 0.985;
        if (spark.life <= 0) sparks.splice(i, 1);
      }

      // shake 是屏幕震动强度，会随时间慢慢减小。
      shake = Math.max(0, shake - dt * 18);
      updateHud();
    }

    function upgradeFire(force) {
      const maxLevel = autoMaxLevel();
      if (settings.mode !== "auto" || player.fireLevel >= maxLevel) return;
      let upgraded = false;
      if (force) {
        // force=true 表示捡到了升级道具，直接升一级。
        player.fireLevel = Math.min(maxLevel, player.fireLevel + 1);
        player.lastUpgradeScore = score;
        upgraded = true;
      } else {
        // force=false 表示根据分数自动升级。while 可以一次补上多级。
        while (score >= player.nextUpgrade && player.fireLevel < maxLevel) {
          player.fireLevel += 1;
          player.lastUpgradeScore = player.nextUpgrade;
          player.nextUpgrade += autoUpgradeStep();
          upgraded = true;
        }
      }
      if (upgraded) {
        makeSparks(player.x, player.y - 10, "#6ff0ff", 22);
        playTone(980, 0.12, "triangle", 0.06);
      }
    }

    // 玩家受伤：扣生命、短暂无敌、屏幕震动、播放音效。
    function hurtPlayer() {
      if (player.shield > 0.35) {
        player.shield = 0;
      } else {
        player.lives -= 1;
        player.shield = 0;
      }
      player.invulnerable = 1.35;
      shake = 12;
      makeSparks(player.x, player.y, "#ff5d7d", 28);
      playTone(90, 0.2, "sawtooth", 0.075);
      if (player.lives <= 0) endGame();
    }

    // 圆形碰撞检测。
    // 两个圆心的距离小于两个半径之和，就说明碰到了。
    function circlesTouch(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
    }

    // 绘制整帧画面。
    // 游戏里常见的流程是：先 update 更新数据，再 draw 按最新数据画出来。
    function draw() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.clip();

      // 受伤时给整个画布加一点随机偏移，制造震屏效果。
      const shakeX = shake ? rand(-shake, shake) : 0;
      const shakeY = shake ? rand(-shake, shake) : 0;
      ctx.translate(shakeX, shakeY);

      // 画背景渐变。
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, "#071425");
      bg.addColorStop(0.55, "#0a1222");
      bg.addColorStop(1, "#170d22");
      ctx.fillStyle = bg;
      ctx.fillRect(-20, -20, width + 40, height + 40);

      drawStars(width, height);
      drawNebula(width, height);
      for (const pickup of pickups) drawPickup(pickup);
      for (const bullet of bullets) drawBullet(bullet);
      for (const shot of enemyShots) drawEnemyShot(shot);
      for (const enemy of enemies) drawEnemy(enemy);
      for (const option of options) drawOption(option);
      drawPlayer();
      drawPlayerStatusBars();
      drawBossStatus();
      for (const spark of sparks) drawSpark(spark);

      ctx.restore();
    }

    // 画星星和淡淡的网格线。
    function drawStars(width, height) {
      ctx.save();
      for (const star of stars) {
        ctx.globalAlpha = star.alpha;
        ctx.fillStyle = "#d8f4ff";
        ctx.fillRect(star.x, star.y, star.size, star.size * 2.6);
      }
      ctx.globalAlpha = 1;
      const grid = ctx.createLinearGradient(0, 0, width, height);
      grid.addColorStop(0, "rgba(65, 215, 255, 0.05)");
      grid.addColorStop(1, "rgba(255, 93, 125, 0.05)");
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      for (let y = (performance.now() * 0.02) % 44; y < height; y += 44) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 画背景里的发光星云。
    function drawNebula(width, height) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const glowA = ctx.createRadialGradient(width * 0.22, height * 0.22, 0, width * 0.22, height * 0.22, width * 0.42);
      glowA.addColorStop(0, "rgba(65, 215, 255, 0.13)");
      glowA.addColorStop(1, "rgba(65, 215, 255, 0)");
      ctx.fillStyle = glowA;
      ctx.fillRect(0, 0, width, height);
      const glowB = ctx.createRadialGradient(width * 0.78, height * 0.72, 0, width * 0.78, height * 0.72, width * 0.36);
      glowB.addColorStop(0, "rgba(255, 93, 125, 0.11)");
      glowB.addColorStop(1, "rgba(255, 93, 125, 0)");
      ctx.fillStyle = glowB;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // 画玩家飞机。
    // 这里大量使用 canvas path：moveTo/lineTo/arc/ellipse 这些都是“画路径”的命令。
    function drawPlayer() {
      ctx.save();
      ctx.translate(player.x, player.y);
      // 受伤后的无敌时间里，让飞机闪烁。
      if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) ctx.globalAlpha = 0.45;

      // 画尾焰。
      const flame = 18 + Math.sin(performance.now() / 42) * 6;
      const flameGradient = ctx.createLinearGradient(0, 12, 0, 42);
      flameGradient.addColorStop(0, "rgba(111, 240, 255, 0.95)");
      flameGradient.addColorStop(0.55, "rgba(255, 207, 91, 0.85)");
      flameGradient.addColorStop(1, "rgba(255, 93, 125, 0)");
      ctx.fillStyle = flameGradient;
      ctx.beginPath();
      ctx.moveTo(-8, 14);
      ctx.lineTo(0, flame + 28);
      ctx.lineTo(8, 14);
      ctx.closePath();
      ctx.fill();

      // 画机身。
      const body = ctx.createLinearGradient(0, -35, 0, 26);
      body.addColorStop(0, "#f7fbff");
      body.addColorStop(0.48, "#8edcff");
      body.addColorStop(1, "#245f9b");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(18, 22);
      ctx.quadraticCurveTo(0, 14, -18, 22);
      ctx.closePath();
      ctx.fill();

      // 画左右机翼。
      ctx.fillStyle = "#41d7ff";
      ctx.beginPath();
      ctx.moveTo(-16, 3);
      ctx.lineTo(-42, 20);
      ctx.lineTo(-14, 24);
      ctx.closePath();
      ctx.moveTo(16, 3);
      ctx.lineTo(42, 20);
      ctx.lineTo(14, 24);
      ctx.closePath();
      ctx.fill();

      // 画驾驶舱。
      ctx.fillStyle = "#06111f";
      ctx.beginPath();
      ctx.ellipse(0, -13, 8, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // 画外圈护盾光环。
      ctx.strokeStyle = "rgba(111, 240, 255, 0.42)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 30 + Math.sin(performance.now() / 90) * 2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#fff7fb";
      ctx.shadowColor = "#ff8aa6";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, -4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawOption(option) {
      ctx.save();
      ctx.translate(option.x, option.y);
      ctx.shadowColor = "#6ff0ff";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#84f5ff";
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#06111f";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawPlayerStatusBars() {
      const barWidth = 58;
      const barHeight = 4;
      const gap = 3;
      const x = clamp(player.x - barWidth / 2, 8, canvas.clientWidth - barWidth - 8);
      const y = clamp(player.y - 60, 10, canvas.clientHeight - 86);
      const healthRatio = clamp(player.lives / Math.max(1, player.maxLives), 0, 1);
      const shieldRatio = clamp(player.shield, 0, 1);
      const fireProgress = Number.isFinite(player.nextUpgrade)
        ? clamp((score - player.lastUpgradeScore) / Math.max(1, player.nextUpgrade - player.lastUpgradeScore), 0, 1)
        : clamp(player.fireLevel / Math.max(8, player.fireLevel + 3), 0, 1);
      const energyRatio = settings.mode === "energy" ? clamp(player.charge, 0, 1) : fireProgress;

      ctx.save();
      ctx.fillStyle = "rgba(3, 8, 17, 0.58)";
      ctx.strokeStyle = "rgba(238, 245, 255, 0.34)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x - 2, y - 2, barWidth + 4, barHeight * 3 + gap * 2 + 4, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 93, 125, 0.25)";
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.fillStyle = "#ff5d7d";
      ctx.fillRect(x, y, barWidth * healthRatio, barHeight);

      ctx.fillStyle = "rgba(65, 215, 255, 0.22)";
      ctx.fillRect(x, y + barHeight + gap, barWidth, barHeight);
      ctx.fillStyle = "#41d7ff";
      ctx.fillRect(x, y + barHeight + gap, barWidth * shieldRatio, barHeight);

      ctx.fillStyle = "rgba(100, 242, 164, 0.2)";
      ctx.fillRect(x, y + (barHeight + gap) * 2, barWidth, barHeight);
      ctx.fillStyle = settings.mode === "energy" ? "#6ff0ff" : "#64f2a4";
      ctx.fillRect(x, y + (barHeight + gap) * 2, barWidth * energyRatio, barHeight);

      ctx.fillStyle = "#fff7fb";
      ctx.font = "bold 9px system-ui";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`B${player.bombs}`, x + barWidth, y - 3);
      ctx.restore();
    }

    function drawBossStatus() {
      const boss = enemies.find((enemy) => enemy.type === "boss");
      if (!boss) return;
      const width = Math.min(380, canvas.clientWidth - 160);
      if (width < 160) return;
      const x = (canvas.clientWidth - width) / 2;
      const y = 36;
      const shieldRatio = boss.maxShield > 0 ? clamp(boss.shield / boss.maxShield, 0, 1) : 0;
      const phaseCount = 3;
      const phase = Math.min(phaseCount, Math.max(1, phaseCount - Math.floor((boss.hp / boss.maxHp) * phaseCount) + 1));

      ctx.save();
      ctx.fillStyle = "rgba(3, 8, 17, 0.62)";
      ctx.strokeStyle = "rgba(255, 93, 125, 0.44)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, width, 34, 7);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffe8f0";
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`BOSS 侵袭核心  阶段 ${phase}/${phaseCount}`, x + 10, y + 5);

      ctx.fillStyle = "rgba(255, 93, 125, 0.24)";
      ctx.fillRect(x + 10, y + 21, width - 20, 5);
      ctx.fillStyle = "#ff5d7d";
      ctx.fillRect(x + 10, y + 21, (width - 20) * clamp(boss.hp / boss.maxHp, 0, 1), 5);
      if (boss.maxShield > 0) {
        ctx.fillStyle = "rgba(111, 240, 255, 0.22)";
        ctx.fillRect(x + 10, y + 28, width - 20, 3);
        ctx.fillStyle = "#6ff0ff";
        ctx.fillRect(x + 10, y + 28, (width - 20) * shieldRatio, 3);
      }
      ctx.restore();
    }

    // 画敌人。
    function drawEnemy(enemy) {
      ctx.save();
      if (enemy.visible === false) ctx.globalAlpha = 0.22;
      ctx.translate(enemy.x, enemy.y);
      const body = ctx.createLinearGradient(0, -enemy.radius, 0, enemy.radius);
      const isBoss = enemy.type === "boss";
      const hasShield = enemy.shield > 0;
      body.addColorStop(0, isBoss ? "#ffd2e0" : enemy.type === "summoner" ? "#dec6ff" : enemy.type === "bomber" ? "#ffb08a" : enemy.type === "stealth" ? "#c9fff7" : enemy.type === "support" ? "#b9ffc8" : enemy.maxHp > 1 ? "#ffe985" : "#9fffcc");
      body.addColorStop(0.55, isBoss ? "#d94f89" : enemy.type === "summoner" ? "#7a59d8" : enemy.type === "bomber" ? "#ff5d7d" : enemy.type === "stealth" ? "#3fb6a7" : enemy.type === "support" ? "#3fc76a" : enemy.maxHp > 1 ? "#ff7d6b" : "#28c782");
      body.addColorStop(1, isBoss ? "#341023" : "#143428");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 0, enemy.radius * (isBoss ? 1.42 : 1.28), enemy.radius * (isBoss ? 0.84 : 0.72), 0, 0, Math.PI * 2);
      ctx.fill();

      if (hasShield) {
        ctx.strokeStyle = "rgba(183, 148, 255, 0.78)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius * 1.55 + Math.sin(performance.now() / 100) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(238, 245, 255, 0.82)";
      ctx.beginPath();
      ctx.arc(-enemy.radius * 0.38, -enemy.radius * 0.06, enemy.radius * 0.18, 0, Math.PI * 2);
      ctx.arc(enemy.radius * 0.38, -enemy.radius * 0.06, enemy.radius * 0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#06111f";
      ctx.beginPath();
      ctx.arc(-enemy.radius * 0.35, -enemy.radius * 0.06, enemy.radius * 0.08, 0, Math.PI * 2);
      ctx.arc(enemy.radius * 0.35, -enemy.radius * 0.06, enemy.radius * 0.08, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = enemy.hp < enemy.maxHp ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-enemy.radius, enemy.radius * 0.42);
      ctx.quadraticCurveTo(0, enemy.radius * 0.86, enemy.radius, enemy.radius * 0.42);
      ctx.stroke();

      if (enemy.hp < enemy.maxHp || enemy.maxShield > 0) {
        const barWidth = enemy.radius * (isBoss ? 2.5 : 1.9);
        const barY = -enemy.radius - (isBoss ? 16 : 10);
        ctx.fillStyle = "rgba(3, 8, 17, 0.62)";
        ctx.fillRect(-barWidth / 2, barY, barWidth, 4);
        ctx.fillStyle = isBoss ? "#ff5d7d" : "#ffcf5b";
        ctx.fillRect(-barWidth / 2, barY, barWidth * clamp(enemy.hp / enemy.maxHp, 0, 1), 4);
        if (enemy.maxShield > 0) {
          ctx.fillStyle = "#b794ff";
          ctx.fillRect(-barWidth / 2, barY - 6, barWidth * clamp(enemy.shield / enemy.maxShield, 0, 1), 3);
        }
      }
      ctx.restore();
    }

    // 画玩家子弹。
    function drawBullet(bullet) {
      ctx.save();
      ctx.shadowColor = "#6ff0ff";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#d7fbff";
      ctx.beginPath();
      ctx.roundRect(bullet.x - bullet.radius, bullet.y - 14, bullet.radius * 2, 20 + Math.max(0, bullet.power - 1) * 4, bullet.radius);
      ctx.fill();
      ctx.restore();
    }

    // 画敌方子弹。
    function drawEnemyShot(shot) {
      ctx.save();
      ctx.shadowColor = "#ff5d7d";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ff7a98";
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 画掉落道具。不同类型用不同颜色和文字区分。
    function drawPickup(pickup) {
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.rotate(performance.now() / 420);
      ctx.shadowColor = pickup.type === "life" || pickup.type === "bomb" ? "#ff5d7d" : pickup.type === "upgrade" || pickup.type === "option" ? "#64f2a4" : "#41d7ff";
      ctx.shadowBlur = 18;
      ctx.fillStyle = pickup.type === "life" || pickup.type === "bomb" ? "#ff7a98" : pickup.type === "upgrade" || pickup.type === "option" ? "#64f2a4" : "#6ff0ff";
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI * 2 * i) / 8;
        const radius = i % 2 ? 6 : 13;
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#06111f";
      ctx.font = pickup.type === "upgrade" || pickup.type === "option" ? "bold 10px system-ui" : "bold 14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pickup.type === "life" ? "+" : pickup.type === "upgrade" ? "UP" : pickup.type === "bomb" ? "B" : pickup.type === "option" ? "OP" : "E", 0, 0);
      ctx.restore();
    }

    // 画粒子效果。
    function drawSpark(spark) {
      ctx.save();
      ctx.globalAlpha = clamp(spark.life / spark.maxLife, 0, 1);
      ctx.fillStyle = spark.color;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 游戏主循环。
    // requestAnimationFrame 会让浏览器在下一次刷新屏幕前调用 loop。
    function loop(time) {
      if (!running || paused) return;
      // dt 单位是秒；最多按 0.033 秒处理，避免切回页面时一次跳太大。
      const dt = Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;
      update(dt, time);
      draw();
      if (running) requestAnimationFrame(loop);
    }

    // 窗口尺寸变化时，重新调整画布大小。
    window.addEventListener("resize", resizeCanvas);

    // 键盘按下：记录到 keys 里。
    // preventDefault 是为了防止方向键/空格触发页面滚动。
    window.addEventListener("keydown", (event) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "w", "a", "s", "d", "x"].includes(key)) {
        event.preventDefault();
        keys.add(key);
      }
      if (key === "p") togglePause();
      if (key === "x") useBomb();
    });

    // 键盘松开：从 keys 里删除。
    window.addEventListener("keyup", (event) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      keys.delete(key);
    });

    function setDragTargetFromClient(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      dragControl.targetX = clamp(clientX - rect.left, 26, rect.width - 26);
      dragControl.targetY = clamp(clientY - rect.top - 38, 68, rect.height - 26);
    }

    function setDragTarget(event) {
      setDragTargetFromClient(event.clientX, event.clientY);
    }

    function beginDrag(pointerId, clientX, clientY) {
      dragControl.active = true;
      dragControl.pointerId = pointerId;
      dragControl.startX = player.x;
      dragControl.startY = player.y;
      dragControl.touchStartX = clientX;
      dragControl.touchStartY = clientY;
      dragControl.targetX = player.x;
      dragControl.targetY = player.y;
    }

    function updateDragByDelta(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const dx = clientX - dragControl.touchStartX;
      const dy = clientY - dragControl.touchStartY;
      dragControl.targetX = clamp(dragControl.startX + dx, 26, rect.width - 26);
      dragControl.targetY = clamp(dragControl.startY + dy, 68, rect.height - 26);
    }

    function canStartDrag(event) {
      if (!running || paused || !overlay.classList.contains("hidden")) return false;
      return !(event.pointerType === "mouse" && event.button !== 0);
    }

    canvas.addEventListener("pointerdown", (event) => {
      if (!canStartDrag(event)) return;
      event.preventDefault();
      beginDrag(event.pointerId, event.clientX, event.clientY);
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!dragControl.active || dragControl.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateDragByDelta(event.clientX, event.clientY);
    });

    function stopDrag(event) {
      if (dragControl.pointerId !== event.pointerId) return;
      event.preventDefault();
      dragControl.active = false;
      dragControl.pointerId = null;
    }

    canvas.addEventListener("pointerup", stopDrag);
    canvas.addEventListener("pointercancel", stopDrag);

    canvas.addEventListener("mousedown", (event) => {
      if (!canStartDrag(event)) return;
      event.preventDefault();
      beginDrag("mouse", event.clientX, event.clientY);
    });

    window.addEventListener("mousemove", (event) => {
      if (!dragControl.active || dragControl.pointerId !== "mouse") return;
      event.preventDefault();
      updateDragByDelta(event.clientX, event.clientY);
    });

    window.addEventListener("mouseup", (event) => {
      if (dragControl.pointerId !== "mouse") return;
      event.preventDefault();
      dragControl.active = false;
      dragControl.pointerId = null;
    });

    canvas.addEventListener("touchstart", (event) => {
      if (!running || paused || !overlay.classList.contains("hidden")) return;
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      beginDrag(touch.identifier, touch.clientX, touch.clientY);
    }, { passive: false });

    canvas.addEventListener("touchmove", (event) => {
      if (!dragControl.active || typeof dragControl.pointerId !== "number") return;
      const touch = Array.from(event.touches).find((item) => item.identifier === dragControl.pointerId);
      if (!touch) return;
      event.preventDefault();
      updateDragByDelta(touch.clientX, touch.clientY);
    }, { passive: false });

    function stopTouchDrag(event) {
      if (typeof dragControl.pointerId !== "number") return;
      const ended = Array.from(event.changedTouches).some((touch) => touch.identifier === dragControl.pointerId);
      if (!ended) return;
      event.preventDefault();
      dragControl.active = false;
      dragControl.pointerId = null;
    }

    canvas.addEventListener("touchend", stopTouchDrag, { passive: false });
    canvas.addEventListener("touchcancel", stopTouchDrag, { passive: false });

    // 手机/触屏上的虚拟方向按钮。
    // data-hold 里写的是这个按钮代表的动作，比如 left/right/fire。
    for (const button of document.querySelectorAll("[data-hold]")) {
      const value = button.dataset.hold;
      const press = (event) => {
        event.preventDefault();
        keys.add(value);
      };
      const release = (event) => {
        event.preventDefault();
        keys.delete(value);
      };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("pointerleave", release);
    }

    const bombBtn = document.querySelector("[data-action='bomb']");
    if (bombBtn) {
      bombBtn.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        useBomb();
      });
    }

    const pauseBtn = document.querySelector("[data-action='pause']");
    if (pauseBtn) {
      pauseBtn.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        togglePause();
      });
    }

    function bindSettingButtons() {
      timeLimitInput = document.querySelector("#timeLimit");
      for (const button of document.querySelectorAll("[data-option]")) {
        button.addEventListener("click", () => {
          const option = button.dataset.option;
          settings[option] = option === "timed" ? button.dataset.value === "true" : button.dataset.value;
          if (option === "timed" && settings.timed) readTimeLimit();
          syncSettingButtons();
          titleEl.textContent = "星际空袭";
          messageEl.textContent = `已选择：${modeText()} / ${timeText()} / ${difficulties[settings.difficulty].label}难度。限时模式 18 秒一波，每 2 波 BOSS。`;
        });
      }

      timeLimitInput.addEventListener("change", () => {
        readTimeLimit();
        settings.timed = true;
        syncSettingButtons();
        titleEl.textContent = "星际空袭";
        messageEl.textContent = `已选择：${modeText()} / ${timeText()} / ${difficulties[settings.difficulty].label}难度。限时模式 18 秒一波，每 2 波 BOSS。`;
      });
    }

    bindSettingButtons();

    // 开始按钮和音效按钮。
    startBtn.addEventListener("click", () => {
      if (rewardChoices.length > 0) return;
      if (running && paused) {
        togglePause();
      } else {
        startGame();
      }
    });
    settingsEl.addEventListener("click", (event) => {
      const card = event.target.closest("[data-reward]");
      if (!card) return;
      event.preventDefault();
      applyReward(card.dataset.reward);
    });
    muteBtn.addEventListener("click", () => {
      muted = !muted;
      muteBtn.textContent = muted ? "音效：关" : "音效：开";
    });

    // 兼容旧浏览器：如果 canvas 没有 roundRect，就自己补一个简化版本。
    if (!CanvasRenderingContext2D.prototype.roundRect) {
      CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, width, height, radius) {
        const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
        this.beginPath();
        this.moveTo(x + r, y);
        this.arcTo(x + width, y, x + width, y + height, r);
        this.arcTo(x + width, y + height, x, y + height, r);
        this.arcTo(x, y + height, x, y, r);
        this.arcTo(x, y, x + width, y, r);
        this.closePath();
        return this;
      };
    }

    // 页面刚加载时：同步按钮状态、调整画布、先画一帧静态画面。
    syncSettingButtons();
    resizeCanvas();
    draw();
  
