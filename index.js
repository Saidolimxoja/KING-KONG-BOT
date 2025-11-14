// bot/index.js - GODZILLA OPTIMIZED 🦖🔥
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import readline from 'readline';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);
dotenv.config();

// ========== КОНФИГ ==========
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_ID = parseInt(process.env.API_ID);
const API_HASH = process.env.API_HASH;
const SESSION_STRING = process.env.SESSION_STRING || '';
const CHANNEL_ID = process.env.CHANNEL_ID;
const YOUR_USERNAME = '@king_kong_uz_bot'; // 👈 ТВОЙ ЮЗЕРНЕЙМ
const DOWNLOADS_DIR = './downloads';
const CACHE_FILE = './cache/cache.json';
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';
const USERADMIN = process.env.USERADMIN || '@KINGOLIMXOJA'; // 👈 ТВОЙ ЮЗЕРНЕЙМ
// ========== ИНИЦИАЛИЗАЦИЯ ==========
const bot = new Bot(BOT_TOKEN);
const videoDataCache = new Map(); // Хранит ВСЕ данные видео (не удаляется!)
const memoryCache = new Map();
let localCache = new Map();

// ========== MTPROTO ==========
const stringSession = new StringSession(SESSION_STRING);
const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
});

await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });

// ========== READLINE ==========
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function question(query) {
    return new Promise((resolve) => rl.question(query, resolve));
}

// ========== ОЧЕРЕДЬ ==========
class DownloadQueue {
    constructor(maxParallel = 3) {
        this.queue = [];
        this.active = 0;
        this.maxParallel = maxParallel;
    }

    async add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.process();
        });
    }

    async process() {
        while (this.queue.length > 0 && this.active < this.maxParallel) {
            const { task, resolve, reject } = this.queue.shift();
            this.active++;

            console.log(
                `⚙️ Обработка (активно: ${this.active}/${this.maxParallel}, очередь: ${this.queue.length})`
            );

            task()
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    this.active--;
                    this.process();
                });
        }
    }

    getStatus() {
        return {
            active: this.active,
            queued: this.queue.length,
            total: this.active + this.queue.length,
        };
    }
}

const downloadQueue = new DownloadQueue(3);

// ========== КЭШ ==========
async function loadCache() {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        localCache = new Map(Object.entries(parsed));
        console.log(`💾 Кэш: ${localCache.size} записей`);
    } catch {
        console.log('💾 Новый кэш');
        await saveCache();
    }
}

async function saveCache() {
    try {
        const obj = Object.fromEntries(localCache);
        await fs.writeFile(CACHE_FILE, JSON.stringify(obj, null, 2));
    } catch (err) {
        console.error('❌ Ошибка кэша:', err);
    }
}

function generateCacheKey(url, formatId, resolution) {
    return crypto
        .createHash('md5')
        .update(`${url}|${formatId}|${resolution}`)
        .digest('hex');
}

// ========== УТИЛИТЫ ==========
function sanitizeFilename(filename) {
    return filename
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 200);
}

function formatFileSize(bytes) {
    if (!bytes) return '? MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(1)} MB`;
}

function formatDuration(seconds) {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0)
        return `${h}:${m.toString().padStart(2, '0')}:${s
            .toString()
            .padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}

function createProgressBar(percent) {
    const total = 10;
    const filled = Math.round((percent / 100) * total);
    return '█'.repeat(filled) + '░'.repeat(total - filled);
}

// ========== YT-DLP ==========
async function getVideoInfo(url) {
    const { stdout } = await execAsync(
        `${YTDLP_PATH} --dump-json --no-playlist "${url}"`
    );
    return JSON.parse(stdout);
}

async function downloadVideoWithProgress(
    url,
    formatId,
    outputPath,
    isAudio,
    onProgress
) {
    return new Promise((resolve, reject) => {
        console.log(`🚀 Начало загрузки: ${url}`);

        const format = formatId.includes('+')
            ? formatId
            : `${formatId}+bestaudio/best`;
        const outputPathWithoutExt = outputPath.replace(/\.[^.]+$/, '');

        const args = [
            '-f',
            format,
            '-o',
            outputPathWithoutExt + '.%(ext)s',
            '--newline',
            '--restrict-filenames',
        ];

        if (isAudio) {
            args.push(
                '--extract-audio',
                '--audio-format',
                'm4a',
                '--audio-quality',
                '128K'
            );
        } else {
            args.push(
                '--merge-output-format',
                'mp4',
                '--postprocessor-args',
                'ffmpeg:-c:v libx264 -profile:v baseline -level 3.1 -preset fast -crf 23 -maxrate 2500k -bufsize 5000k -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k -ar 44100'
            );
        }

        args.push(url);

        const process = spawn(YTDLP_PATH, args);
        let lastProgress = 0;
        let actualFilePath = null;

        const extractFilePath = (text) => {
            const patterns = [
                /\[ExtractAudio\] Destination: (.+)/,
                /\[Merger\] Merging formats into "(.+)"/,
                /\[ffmpeg\] Destination: (.+)/,
                /\[download\] Destination: (.+)/,
            ];
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) return match[1].trim();
            }
            return null;
        };

        process.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('📤 [stdout]', output.trim());
            const detectedPath = extractFilePath(output);
            if (detectedPath) {
                actualFilePath = detectedPath;
                console.log(`✅ Найден путь: ${actualFilePath}`);
            }

            const match = output.match(/(\d+\.\d+)%/);
            if (match) {
                const progress = parseFloat(match[1]);
                if (progress - lastProgress >= 5 || progress === 100) {
                    onProgress(progress);
                    lastProgress = progress;
                }
            }
        });

        process.stderr.on('data', (data) => {
            const output = data.toString();
            console.log('⚠️ [stderr]', output.trim());
            const detectedPath = extractFilePath(output);
            if (detectedPath) {
                actualFilePath = detectedPath;
                console.log(`⚙️ (stderr) Найден путь: ${actualFilePath}`);
            }
        });

        process.on('close', async (code) => {
            console.log(`🔚 yt-dlp завершился с кодом ${code}`);
            if (code === 0) {
                const finalPath = actualFilePath
                    ? path.resolve(actualFilePath)
                    : path.resolve(
                          outputPathWithoutExt + (isAudio ? '.m4a' : '.mp4')
                      );

                console.log(`📍 Проверка файла: ${finalPath}`);

                const dir = path.dirname(finalPath);
                const baseName = path.basename(finalPath).split('.')[0];

                try {
                    for (let i = 0; i < 100; i++) {
                        try {
                            await fs.access(finalPath);
                            console.log(`✅ Найден файл: ${finalPath}`);
                            return resolve(finalPath);
                        } catch {
                            // Если не найден, ищем похожее имя (игнорируя странные символы)
                            const files = await fs.readdir(dir);
                            const normalized = (s) =>
                                s
                                    .normalize('NFKD')
                                    .replace(/[‘’'`"´]/g, "'") // унификация апострофов
                                    .replace(/[^\w\s\-'().,]/g, ''); // убираем мусор вроде �

                            const targetNorm = normalized(baseName);
                            const similar = files.find((f) =>
                                normalized(f).startsWith(targetNorm)
                            );
                            if (similar) {
                                const full = path.join(dir, similar);
                                console.log(`🧭 Похожее имя найдено: ${full}`);
                                return resolve(full);
                            }
                            await new Promise((r) => setTimeout(r, 100));
                        }
                    }
                    throw new Error();
                } catch {
                    reject(new Error(`❌ Файл не найден: ${finalPath}`));
                }
            } else {
                reject(new Error(`yt-dlp завершился с ошибкой (код ${code})`));
            }
        });
    });
}

// ========== ФОРМАТЫ (БЕЗ 144p/240p) ==========
function getBestFormats(formats) {
    const videoFormats = new Map();
    const audioFormats = [];

    formats.forEach((f) => {
        const hasVideo = f.vcodec && f.vcodec !== 'none';
        const hasAudio = f.acodec && f.acodec !== 'none';
        if (!hasAudio && !hasVideo) return;

        if (!hasVideo && hasAudio) {
            audioFormats.push({
                format_id: f.format_id,
                ext: 'm4a',
                resolution: 'audio',
                filesize: f.filesize || f.filesize_approx || 0,
                quality: 0,
            });
        } else if (hasVideo && f.height) {
            const height = f.height;

            // ❌ ИГНОРИРУЕМ 144p и 240p
            if (height < 360) return;

            const filesize = f.filesize || f.filesize_approx || 0;

            if (
                !videoFormats.has(height) ||
                filesize > (videoFormats.get(height).filesize || 0)
            ) {
                videoFormats.set(height, {
                    format_id: f.format_id,
                    ext: 'mp4',
                    resolution: `${height}p`,
                    filesize: filesize,
                    quality: height,
                    hasAudio: hasAudio,
                });
            }
        }
    });

    const videoList = Array.from(videoFormats.values())
        .sort((a, b) => b.quality - a.quality)
        .slice(0, 7);
    const bestAudio = audioFormats.sort(
        (a, b) => (b.filesize || 0) - (a.filesize || 0)
    )[0];
    const result = [...videoList];
    if (bestAudio) result.push(bestAudio);
    return result;
}

// ========== АВТОРИЗАЦИЯ ==========
async function initMTProto() {
    console.log('\n🔐 Авторизация MTProto...\n');

    await client.start({
        phoneNumber: async () =>
            (await question('📱 Номер (+998.....): ')).trim(),
        password: async () =>
            (await question('🔒 Пароль 2FA (Enter если нет): ')).trim(),
        phoneCode: async () => (await question('💬 Код из Telegram: ')).trim(),
        onError: (err) => console.error('❌', err.message),
    });

    console.log('\n✅ Успешно!\n📝 Добавь в .env:\n');
    console.log('SESSION_STRING=' + client.session.save() + '\n');
    rl.close();
}

// ========== КОМАНДЫ ==========
async function setupCommands(bot) {
    await bot.api.setMyCommands([
        { command: 'start', description: 'Запуск бота' },
        { command: 'help', description: 'Помощь' },
    ]);

    await bot.api.setMyCommands(
        [
            { command: 'start', description: 'Запуск бота' },
            { command: 'stats', description: 'Статистика (только для админа)' },
        ],
        {
            scope: {
                type: 'chat',
                chat_id: 1456770853, // твой user_id
            },
        }
    );
}

bot.command('start', async (ctx) => {
    await ctx.reply(
        '🦍 *KingKong Bot*\n\n' +
            '⚡ Мгновенная отправка из кэша\n' +
            '📺 Потоковое воспроизведение\n' +
            '💎 Файлы до 2GB\n\n' +
            '📌 Отправь ссылку:',
        { parse_mode: 'Markdown' }
    );
});

bot.command('stats', async (ctx) => {
    if (ctx.from.username !== 'KINGOLIMXOJA') {
        return ctx.reply('🚫 У вас нет доступа к этой команде.');
    }

    const queueStatus = downloadQueue.getStatus();
    await ctx.reply(
        `📊 *Статистика*\n\n` +
            `💾 Кэш: ${localCache.size}\n` +
            `🔄 Активно: ${queueStatus.active}\n` +
            `⏳ Очередь: ${queueStatus.queued}`,
        { parse_mode: 'Markdown' }
    );
});

// В конце, после инициализации
await setupCommands(bot);

bot.command('channelid', async (ctx) => {
    await ctx.reply(`Chat ID: \`${ctx.chat.id}\``, { parse_mode: 'Markdown' });
});

// ========== ОБРАБОТКА ССЫЛОК ==========
bot.on('message:text', async (ctx) => {
    const url = ctx.message.text.trim();
    if (!url.startsWith('http')) return;

    const msg = await ctx.reply('🔍 Анализирую...');

    try {
        const info = await getVideoInfo(url);
        const videoId = crypto.randomBytes(8).toString('hex');

        // 🔥 СОХРАНЯЕМ ДАННЫЕ ВИДЕО (НЕ УДАЛЯЕТСЯ!)
        videoDataCache.set(videoId, {
            url,
            title: info.title,
            uploader: info.uploader,
            duration: info.duration,
            view_count: info.view_count,
            like_count: info.like_count,
            upload_date: info.upload_date,
        });

        const formats = getBestFormats(info.formats);
        const keyboard = new InlineKeyboard();

        formats.forEach((f, idx) => {
            const key = `${videoId}|${f.format_id}|${f.resolution}`; // Постоянный ключ!

            const sizeText =
                f.filesize > 0 ? formatFileSize(f.filesize) : '~? MB';
            let label =
                f.resolution === 'audio'
                    ? `🎵 Аудио • ${sizeText}`
                    : `${f.resolution}${f.hasAudio ? '' : ' 🔊'} • ${sizeText}`;

            const buttonText = idx === 0 ? `⭐ ${label}` : label;
            keyboard.text(buttonText, `q|${key}`).row();
        });

        const uploadDate = info.upload_date
            ? `${info.upload_date.slice(6, 8)}.${info.upload_date.slice(
                  4,
                  6
              )}.${info.upload_date.slice(0, 4)}`
            : '—';

        await ctx.api.editMessageText(
            ctx.chat.id,
            msg.message_id,
            `🎬 *${info.title}*\n\n` +
                `👁 ${formatNumber(info.view_count)} • ` +
                `👍 ${formatNumber(info.like_count)}\n` +
                `📥 ${uploadDate} • 🕒 ${formatDuration(info.duration)}\n` +
                `👤 ${info.uploader || '—'}\n\n` +
                `*📌 Выбери качество:*`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (err) {
        console.error('❌ Ошибка:', err);
        await ctx.api.editMessageText(
            ctx.chat.id,
            msg.message_id,
            '❌ Ошибка анализа'
        );
    }
});

// ========== ВЫБОР КАЧЕСТВА ==========
bot.callbackQuery(/^q\|(.+)$/, async (ctx) => {
    const [videoId, formatId, resolution] = ctx.match[1].split('|');

    // 🔥 ДАННЫЕ ВСЕГДА ДОСТУПНЫ!
    const videoData = videoDataCache.get(videoId);

    if (!videoData) {
        return ctx.answerCallbackQuery({
            text: '❌ Видео не найдено, отправь ссылку заново',
        });
    }

    const { url, title, uploader, duration } = videoData;
    const cacheKey = generateCacheKey(url, formatId, resolution);

    // Проверяем кэш
    let cached = memoryCache.get(cacheKey) || localCache.get(cacheKey);

    if (cached) {
        memoryCache.set(cacheKey, cached);
        console.log(`⚡ Кэш HIT: ${resolution}`);
        await ctx.answerCallbackQuery({ text: '⚡ Из кэша!' });

        const isAudio = resolution === 'audio';
        const caption = `✅ ${title}\n\n📥 ${resolution}\n\n📢 ${YOUR_USERNAME}`;

        try {
            if (!isAudio) {
                await ctx.replyWithVideo(cached.file_id, {
                    caption: caption,
                    supports_streaming: true,
                });
            } else {
                await ctx.replyWithAudio(cached.file_id, {
                    caption: caption,
                    title: title,
                    performer: uploader,
                });
            }
            return;
        } catch (err) {
            console.error('❌ file_id невалиден, перекачиваю:', err);
            memoryCache.delete(cacheKey);
            localCache.delete(cacheKey);
            await saveCache();
        }
    }

    // Нет в кэше → скачиваем
    const queueStatus = downloadQueue.getStatus();
    await ctx.answerCallbackQuery({
        text:
            queueStatus.total > 0
                ? `⏳ Очередь: ${queueStatus.total}`
                : '⬇️ Скачиваю...',
    });

    await downloadQueue.add(() =>
        handleDownload(ctx, videoId, formatId, resolution)
    );
});

// ========== СКАЧИВАНИЕ ==========
async function handleDownload(ctx, videoId, formatId, resolution) {
    const videoData = videoDataCache.get(videoId);
    if (!videoData) return;

    const { url, title, uploader, duration } = videoData;
    const cacheKey = generateCacheKey(url, formatId, resolution);
    const progressMsg = await ctx.reply('⬇️ Скачивание...');

    try {
        const sanitizedTitle = sanitizeFilename(title);
        const isAudio = resolution === 'audio';
        const fileExt = isAudio ? 'm4a' : 'mp4';
        const outputPath = path.join(
            DOWNLOADS_DIR,
            `${sanitizedTitle}_${resolution}.${fileExt}`
        );

        const actualFilePath = await downloadVideoWithProgress(
            url,
            formatId,
            outputPath,
            isAudio,
            async (progress) => {
                const bar = createProgressBar(progress);
                try {
                    await ctx.api.editMessageText(
                        ctx.chat.id,
                        progressMsg.message_id,
                        `⬇️ *Скачивание*\n\n${bar} ${progress.toFixed(0)}%`,
                        { parse_mode: 'Markdown' }
                    );
                } catch {}
            }
        );

        const filepath = actualFilePath || outputPath;
        await fs.access(filepath);

        await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            '📤 Загружаю в канал...',
            { parse_mode: 'Markdown' }
        );

        console.log(`📢 Загрузка в канал: ${CHANNEL_ID}`);

        const stats = await fs.stat(filepath);
        const fileSizeMB = stats.size / (1024 * 1024);

        let message, fileId;
        const channelCaption = `${title}\n${resolution} | ${formatId}`;

        if (fileSizeMB <= 50) {
            console.log(`📡 Bot API (${fileSizeMB.toFixed(1)} MB)`);

            if (!isAudio) {
                message = await bot.api.sendVideo(
                    CHANNEL_ID,
                    new InputFile(filepath),
                    {
                        caption: channelCaption,
                        supports_streaming: true,
                    }
                );
                fileId = message.video.file_id;
            } else {
                message = await bot.api.sendAudio(
                    CHANNEL_ID,
                    new InputFile(filepath),
                    {
                        caption: channelCaption,
                        title: title,
                        performer: uploader || 'Unknown',
                        duration: Math.round(duration || 0),
                    }
                );
                fileId = message.audio.file_id;
            }
        } else {
            console.log(`📡 MTProto (${fileSizeMB.toFixed(1)} MB)`);

            let lastProgress = 0;
            message = await client.sendFile(CHANNEL_ID, {
                file: filepath,
                caption: channelCaption,
                forceDocument: false,
                progressCallback: async (uploaded, total) => {
                    const progress = Math.round((uploaded / total) * 100);
                    if (progress - lastProgress >= 10) {
                        lastProgress = progress;
                        const bar = createProgressBar(progress);
                        try {
                            await ctx.api.editMessageText(
                                ctx.chat.id,
                                progressMsg.message_id,
                                `📤 *Загрузка*\n\n${bar} ${progress}%`,
                                { parse_mode: 'Markdown' }
                            );
                        } catch {}
                    }
                },
                attributes: !isAudio
                    ? [
                          new Api.DocumentAttributeVideo({
                              duration: Math.round(duration || 0),
                              w: 1920,
                              h: 1080,
                              supportsStreaming: true,
                          }),
                      ]
                    : [
                          new Api.DocumentAttributeAudio({
                              duration: Math.round(duration || 0),
                              title: title,
                              performer: uploader || 'Unknown',
                          }),
                      ],
            });

            const forwarded = await bot.api.forwardMessage(
                CHANNEL_ID,
                CHANNEL_ID,
                message.id
            );
            fileId =
                forwarded.video?.file_id ||
                forwarded.audio?.file_id ||
                forwarded.document?.file_id;

            try {
                await bot.api.deleteMessage(CHANNEL_ID, forwarded.message_id);
            } catch {}
        }

        console.log(
            `✅ Канал: message_id=${message.message_id}, file_id=${fileId}`
        );

        const cacheData = {
            message_id: message.message_id,
            file_id: fileId,
            file_size: stats.size,
            resolution: resolution,
            cached_at: Date.now(),
        };

        memoryCache.set(cacheKey, cacheData);
        localCache.set(cacheKey, cacheData);
        await saveCache();

        console.log(`💾 Кэш: ${resolution}`);

        const userCaption = `✅ ${title}\n\n📥 ${resolution}\n\n📢 ${YOUR_USERNAME}`;

        if (!isAudio) {
            await ctx.replyWithVideo(fileId, {
                caption: userCaption,
                supports_streaming: true,
            });
        } else {
            await ctx.replyWithAudio(fileId, {
                caption: userCaption,
                title: title,
                performer: uploader,
            });
        }

        await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            `✅ Готово!\n\n📦 ${title}\n📥 ${resolution}`,
            { parse_mode: 'Markdown' }
        );

        await fs.unlink(filepath);
    } catch (err) {
        console.error('❌ Ошибка:', err);
        await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            `❌ Ошибка: ${err.message}`
        );
    }
}

// ========== ЗАПУСК ==========
(async () => {
    if (!BOT_TOKEN || !API_ID || !API_HASH || !CHANNEL_ID) {
        console.error(
            '❌ Заполни .env (BOT_TOKEN, API_ID, API_HASH, CHANNEL_ID)'
        );
        process.exit(1);
    }

    if (!SESSION_STRING) {
        await initMTProto();
        process.exit(0);
    }

    try {
        await loadCache();
        await client.start({ botAuthToken: BOT_TOKEN });
        console.log('✅ MTProto подключён');

        const chat = await bot.api.getChat(CHANNEL_ID);
        console.log(`📢 Канал: ${chat.title || CHANNEL_ID}`);

        bot.start();
        console.log('\n🦍 KingKong BOT ЗАПУЩЕН!\n');
        console.log('⚡ Гибридный кэш: ВКЛЮЧЁН');
        console.log('📢 Канал: ' + CHANNEL_ID);
        console.log('👤 Юзернейм: ' + YOUR_USERNAME);
        console.log('📺 Форматы: ≥360p (без 144p/240p)');
        console.log('🔄 Очередь: до 3 параллельных\n');

        setInterval(async () => {
            const now = Date.now();
            const maxAge = 30 * 24 * 60 * 60 * 1000;
            let removed = 0;

            for (const [key, data] of localCache.entries()) {
                if (now - data.cached_at > maxAge) {
                    localCache.delete(key);
                    memoryCache.delete(key);
                    removed++;
                }
            }

            if (removed > 0) {
                await saveCache();
                console.log(`🗑️ Очищено ${removed} записей`);
            }
        }, 24 * 60 * 60 * 1000);
    } catch (err) {
        console.error('❌ Ошибка:', err.message);
        process.exit(1);
    }
})();
