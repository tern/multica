#!/usr/bin/env node

/**
 * Multica zh-Hant (Traditional Chinese) Synchronization Script
 * 
 * Compares upstream `packages/views/locales/en/` and `packages/views/locales/zh-Hans/`
 * with `packages/views/locales/zh-Hant/` to detect and translate missing or updated keys.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let OpenCC;
try {
  OpenCC = require('opencc-js');
} catch {
  console.log('opencc-js not found, installing temporarily...');
  execSync('npm install --no-save opencc-js', { stdio: 'inherit' });
  OpenCC = require('opencc-js');
}

const converter = OpenCC.Converter({ from: 'cn', to: 'twp' });

const REPO_ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(REPO_ROOT, 'packages/views/locales');
const EN_DIR = path.join(LOCALES_DIR, 'en');
const ZH_HANS_DIR = path.join(LOCALES_DIR, 'zh-Hans');
const ZH_HANT_DIR = path.join(LOCALES_DIR, 'zh-Hant');

// Glossary adjustments applied after OpenCC twp conversion
const POST_REPLACEMENTS = [
  [/賬戶/g, '帳號'],
  [/账户/g, '帳號'],
  [/用戶/g, '使用者'],
  [/運行時/g, '執行環境'],
  [/運行環境/g, '執行環境'],
  [/代碼庫/g, '程式庫'],
  [/代碼/g, '程式碼'],
  [/終端/g, '終端機'],
  [/終端機機/g, '終端機'],
  [/登錄/g, '登入'],
  [/登出/g, '登出'],
  [/項目/g, '專案'],
  [/默認/g, '預設'],
  [/設置/g, '設定'],
  [/支持/g, '支援'],
  [/保存/g, '儲存'],
  [/快捷鍵/g, '快速鍵'],
  [/插件/g, '外掛'],
  [/智能體/g, '代理人'],
  [/高畫質/g, '高畫質'],
  [/影片/g, '影片'],
  [/視頻/g, '影片'],
  [/音頻/g, '音訊'],
  [/點擊/g, '點選'],
  [/反饋/g, '意見回饋'],
  [/數據庫/g, '資料庫'],
  [/數據/g, '資料'],
  [/網絡/g, '網路'],
  [/內存/g, '記憶體'],
  [/緩存/g, '快取'],
  [/訊息/g, '訊息'],
  [/信息/g, '資訊'],
  [/調度/g, '排程'],
  [/計劃任務/g, '排程任務'],
  [/計劃/g, '計畫'],
  [/簡體中文/g, '簡體中文'],
  [/繁體中文/g, '繁體中文'],
];

function transformText(str) {
  if (typeof str !== 'string') return str;
  let res = converter(str);
  for (const [pattern, replacement] of POST_REPLACEMENTS) {
    res = res.replace(pattern, replacement);
  }
  return res;
}

function syncObject(enObj, hansObj, hantObj) {
  if (enObj === null || typeof enObj !== 'object') {
    if (hantObj !== undefined) return hantObj;
    if (hansObj !== undefined) return transformText(hansObj);
    return enObj;
  }

  if (Array.isArray(enObj)) {
    return enObj.map((item, idx) => {
      const hansItem = Array.isArray(hansObj) ? hansObj[idx] : undefined;
      const hantItem = Array.isArray(hantObj) ? hantObj[idx] : undefined;
      return syncObject(item, hansItem, hantItem);
    });
  }

  const result = {};
  for (const key of Object.keys(enObj)) {
    const hansVal = hansObj ? hansObj[key] : undefined;
    const hantVal = hantObj ? hantObj[key] : undefined;
    result[key] = syncObject(enObj[key], hansVal, hantVal);
  }
  return result;
}

function runSync() {
  const enFiles = fs.readdirSync(EN_DIR).filter(f => f.endsWith('.json'));
  let totalUpdated = 0;

  if (!fs.existsSync(ZH_HANT_DIR)) {
    fs.mkdirSync(ZH_HANT_DIR, { recursive: true });
  }

  for (const file of enFiles) {
    const enPath = path.join(EN_DIR, file);
    const hansPath = path.join(ZH_HANS_DIR, file);
    const hantPath = path.join(ZH_HANT_DIR, file);

    const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const hansData = fs.existsSync(hansPath) ? JSON.parse(fs.readFileSync(hansPath, 'utf8')) : {};
    const hantData = fs.existsSync(hantPath) ? JSON.parse(fs.readFileSync(hantPath, 'utf8')) : {};

    const synced = syncObject(enData, hansData, hantData);
    const oldJson = fs.existsSync(hantPath) ? fs.readFileSync(hantPath, 'utf8') : '';
    const newJson = JSON.stringify(synced, null, 2) + '\n';

    if (oldJson !== newJson) {
      fs.writeFileSync(hantPath, newJson, 'utf8');
      console.log(`[SYNC] Updated ${file}`);
      totalUpdated++;
    }
  }

  console.log(`Synchronization finished: ${totalUpdated} file(s) modified.`);
  return totalUpdated;
}

if (require.main === module) {
  runSync();
}

module.exports = { runSync };
