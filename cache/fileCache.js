// cache/fileCache.js
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const CACHE_FILE = './cache/cache.json';

class FileCache {
  constructor() {
    this.cache = new Map();
    this.initialized = false;
  }

  // Инициализация (загрузка из файла)
  async init() {
    try {
      await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
      
      try {
        const data = await fs.readFile(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        this.cache = new Map(Object.entries(parsed));
        console.log(`📦 Кэш загружен: ${this.cache.size} записей`);
      } catch {
        console.log('📦 Кэш пуст, создаю новый');
        await this.save();
      }
      
      this.initialized = true;
    } catch (err) {
      console.error('❌ Ошибка инициализации кэша:', err);
    }
  }

  // Сохранение в файл
  async save() {
    try {
      const obj = Object.fromEntries(this.cache);
      await fs.writeFile(CACHE_FILE, JSON.stringify(obj, null, 2));
    } catch (err) {
      console.error('❌ Ошибка сохранения кэша:', err);
    }
  }

  // Генерация ключа кэша
  generateKey(url, formatId, resolution) {
    const str = `${url}|${formatId}|${resolution}`;
    return crypto.createHash('md5').update(str).digest('hex');
  }

  // Получить file_id из кэша
  async get(url, formatId, resolution) {
    const key = this.generateKey(url, formatId, resolution);
    const cached = this.cache.get(key);
    
    if (cached) {
      console.log(`✅ Кэш HIT: ${resolution} (${formatId})`);
      return cached;
    }
    
    console.log(`❌ Кэш MISS: ${resolution} (${formatId})`);
    return null;
  }

  // Сохранить file_id в кэш
  async set(url, formatId, resolution, fileId, fileSize) {
    const key = this.generateKey(url, formatId, resolution);
    
    const data = {
      file_id: fileId,
      file_size: fileSize,
      resolution: resolution,
      cached_at: Date.now(),
    };
    
    this.cache.set(key, data);
    await this.save();
    
    console.log(`💾 Кэш сохранён: ${resolution} (${formatId}) → ${fileId}`);
  }

  // Очистить старые записи (старше 30 дней)
  async cleanup() {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 дней
    
    let removed = 0;
    for (const [key, data] of this.cache.entries()) {
      if (now - data.cached_at > maxAge) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      await this.save();
      console.log(`🗑️ Очищено ${removed} старых записей`);
    }
  }

  // Статистика
  getStats() {
    return {
      total: this.cache.size,
      size_mb: (JSON.stringify(Object.fromEntries(this.cache)).length / (1024 * 1024)).toFixed(2),
    };
  }
}

export default new FileCache();