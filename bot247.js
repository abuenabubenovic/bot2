const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

// ==================== НАСТРОЙКИ ====================
const CONFIG = {
    host: 'KaboomCraft.aternos.me',
    port: 23722,
    username: 'CoolPlayer303',
    version: '1.21.10',
    auth: 'offline',

    wanderMinDist: 15,
    wanderMaxDist: 60,
    wanderDelay: 2000,
    stuckTimeout: 15000,

    // === ПОДКЛЮЧЕНИЕ ===
    checkTimeoutInterval: 300 * 1000,  // 5 минут вместо 30 секунд
    reconnectDelay: 15000              // переподключение через 15 секунд
};
// ===================================================

let bot = null;
let reconnectTimer = null;

// === СОЗДАНИЕ БОТА ===
function createNewBot() {
    console.log('[*] Создаю бота...');

    bot = mineflayer.createBot({
        host: CONFIG.host,
        port: CONFIG.port,
        username: CONFIG.username,
        version: CONFIG.version,
        auth: CONFIG.auth,
        checkTimeoutInterval: CONFIG.checkTimeoutInterval
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
        defaultMove.canDig = false;
        defaultMove.allow1by1towers = false;
        defaultMove.allowParkour = true;
        defaultMove.allowSprinting = true;
        bot.pathfinder.setMovements(defaultMove);

        startWandering();
    });

    async function startWandering() {
        while (true) {
            // Если бот отключился — выходим из цикла
            if (!bot || !bot.entity) {
                console.log('[!] Бот отключён, выходим из цикла прогулки.');
                return;
            }

            try {
                if (bot.pathfinder.isMoving()) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                const goal = getRandomPoint();
                currentGoal = goal;
                wandering = true;

                const target = goal.position || goal;
                console.log(`[🚶] Иду в точку (${target.x}, ${target.y}, ${target.z})`);

                const timeout = setTimeout(() => {
                    if (wandering) {
                        console.log('[!] Не могу дойти, выбираю новую точку.');
                        try { bot.pathfinder.setGoal(null); } catch (e) {}
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
                try { bot.pathfinder.setGoal(null); } catch (e) {}
                wandering = false;
            }
        }
    });

    bot.on('error', (err) => console.log('[!] Ошибка:', err.message));

    bot.on('kicked', (reason) => {
        console.log(`[!] Бота выкинули. Причина: ${reason}`);
    });

    bot.on('end', (reason) => {
        console.log(`[!] Соединение потеряно. Причина: ${reason || 'неизвестна'}`);
        scheduleReconnect();
    });

    bot.on('resourcePack', () => bot.acceptResourcePack());
}

// === АВТО-ПЕРЕПОДКЛЮЧЕНИЕ ===
function scheduleReconnect() {
    if (reconnectTimer) return;

    console.log(`[*] Переподключение через ${CONFIG.reconnectDelay / 1000} секунд...`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        createNewBot();
    }, CONFIG.reconnectDelay);
}

// === ЗАПУСК ===
createNewBot();

process.on('SIGINT', () => {
    console.log('\n[*] Отключаю бота...');
    if (bot) bot.quit('Бот выключен');
    setTimeout(() => process.exit(0), 1000);
});

console.log('[*] Запуск бота...');