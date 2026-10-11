const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

// ==================== НАСТРОЙКИ ====================
const CONFIG = {
    host: 'KaboomCraft.aternos.me',
    port: 22122,
    username: 'CoolPlayer303',
    version: '1.21.10',
    auth: 'offline',

    wanderMinDist: 15,      // мин. расстояние до случайной точки
    wanderMaxDist: 60,      // макс. расстояние до случайной точки
    wanderDelay: 2000,      // пауза между прогулками (мс)
    stuckTimeout: 15000     // если бот не может дойти за 15 сек — выбрать новую точку
};

// ===================================================

const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,
    auth: CONFIG.auth
});

bot.loadPlugin(pathfinder);

// === ПАТЧ ПРОТИВ GRIMAC ===
bot.on('physicsTick', () => {
    try { bot._client.write('tick_end', {}); } catch (e) {}
});

// === СОСТОЯНИЕ ===
let wandering = false;
let currentGoal = null;

// === ПОИСК СЛУЧАЙНОЙ ТОЧКИ ===
function getRandomPoint() {
    const pos = bot.entity.position;
    const angle = Math.random() * Math.PI * 2;
    const dist = CONFIG.wanderMinDist +
        Math.random() * (CONFIG.wanderMaxDist - CONFIG.wanderMinDist);

    const x = Math.floor(pos.x + Math.cos(angle) * dist);
    const z = Math.floor(pos.z + Math.sin(angle) * dist);
    const y = Math.floor(pos.y);

    return new goals.GoalBlock(x, y, z);
}

// === ГЛАВНАЯ ЛОГИКА ===
bot.once('spawn', () => {
    console.log(`[+] Бот ${CONFIG.username} подключился.`);

    const defaultMove = new Movements(bot);
    defaultMove.canDig = false;           // не ломает блоки
    defaultMove.allow1by1towers = false;  // не строит башни
    defaultMove.allowParkour = true;      // разрешаем прыжки через ямы
    defaultMove.allowSprinting = true;    // разрешаем спринт
    bot.pathfinder.setMovements(defaultMove);

    startWandering();
});

async function startWandering() {
    while (true) {
        try {
            // Если уже куда-то идём — ждём
            if (bot.pathfinder.isMoving()) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            const goal = getRandomPoint();
            currentGoal = goal;
            wandering = true;

            const target = goal.position || goal;
            console.log(`[🚶] Иду в точку (${target.x}, ${target.y}, ${target.z})`);

            // Таймаут на путь
            const timeout = setTimeout(() => {
                if (wandering) {
                    console.log('[!] Не могу дойти, выбираю новую точку.');
                    bot.pathfinder.setGoal(null);
                    wandering = false;
                }
            }, CONFIG.stuckTimeout);

            try {
                await bot.pathfinder.goto(goal);
                clearTimeout(timeout);
                console.log('[✓] Дошёл!');
            } catch (e) {
                clearTimeout(timeout);
                console.log('[!] Путь не найден, выбираю новую точку.');
            }

            wandering = false;
            currentGoal = null;

            // Пауза перед следующей прогулкой
            await new Promise(r => setTimeout(r, CONFIG.wanderDelay));

        } catch (e) {
            console.log('[!] Ошибка в цикле:', e.message);
            wandering = false;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// === СОБЫТИЯ ===
bot.on('path_update', (r) => {
    if (r.status === 'noPath') {
        console.log('[!] Нет пути — выбираю новую точку.');
        if (wandering) {
            bot.pathfinder.setGoal(null);
            wandering = false;
        }
    }
});

bot.on('error', (err) => console.log('[!] Ошибка:', err.message));
bot.on('kicked', (reason) => console.log(`[!] Бота выкинули. Причина: ${reason}`));
bot.on('end', () => console.log('[!] Соединение потеряно.'));
bot.on('resourcePack', () => bot.acceptResourcePack());

process.on('SIGINT', () => {
    console.log('\n[*] Отключаю бота...');
    bot.quit('Бот выключен');
    setTimeout(() => process.exit(0), 1000);
});

console.log('[*] Запуск бота...');