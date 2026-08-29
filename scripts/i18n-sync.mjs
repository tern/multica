#!/usr/bin/env node

/**
 * Multica zh-Hant (Traditional Chinese) Synchronization Script
 *
 * Pulls upstream locales (en, zh-Hans) from upstream/main (or provided directory/ref),
 * compares with current zh-Hant namespaces, detects added/modified/deleted keys,
 * and updates zh-Hant adhering strictly to apps/docs/content/docs/developers/conventions.zh.mdx.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const CONVENTIONS_MDX_PATH = path.join(
  REPO_ROOT,
  'apps/docs/content/docs/developers/conventions.zh.mdx'
);
const LOCALES_DIR = path.join(REPO_ROOT, 'packages/views/locales');
const HANT_DIR = path.join(LOCALES_DIR, 'zh-Hant');

/**
 * Extract authoritative glossary rules from conventions.zh.mdx
 */
export function loadGlossaryFromMdx(mdxPath = CONVENTIONS_MDX_PATH) {
  if (!fs.existsSync(mdxPath)) {
    return [];
  }
  const content = fs.readFileSync(mdxPath, 'utf8');
  const rules = [];

  // Match table rows: | Entity | en | zh-Hans | zh-Hant |
  const lines = content.split('\n');
  let inHantSection = false;

  for (const line of lines) {
    if (line.includes('繁體中文（zh-Hant）在地化規範')) {
      inHantSection = true;
      continue;
    }
    if (inHantSection && line.startsWith('### ')) {
      inHantSection = false;
      break;
    }
    if (inHantSection && line.startsWith('|')) {
      const parts = line
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean);
      // Expected parts: [Concept, en, zh-Hans, zh-Hant]
      if (parts.length >= 4 && parts[0] !== '實體 / 概念' && !parts[0].includes('---')) {
        const hans = parts[2];
        let hant = parts[3].replace(/\*\*/g, '').trim();
        if (hant.includes('/')) {
          hant = hant.split('/')[0].trim();
        }
        if (hans && hant && hans !== hant) {
          rules.push({
            pattern: new RegExp(hans, 'g'),
            replacement: hant,
          });
        }
      }
    }
  }

  // Common additional localized software terminology
  const defaultFallbacks = [
    { pattern: /賬戶/g, replacement: '帳號' },
    { pattern: /账户/g, replacement: '帳號' },
    { pattern: /用戶/g, replacement: '使用者' },
    { pattern: /運行時/g, replacement: '執行環境' },
    { pattern: /代碼庫/g, replacement: '程式庫' },
    { pattern: /代碼/g, replacement: '程式碼' },
    { pattern: /終端/g, replacement: '終端機' },
    { pattern: /終端機機/g, replacement: '終端機' },
    { pattern: /登錄/g, replacement: '登入' },
    { pattern: /登出/g, replacement: '登出' },
    { pattern: /項目/g, replacement: '專案' },
    { pattern: /默認/g, replacement: '預設' },
    { pattern: /設置/g, replacement: '設定' },
    { pattern: /支持/g, replacement: '支援' },
    { pattern: /保存/g, replacement: '儲存' },
    { pattern: /快捷鍵/g, replacement: '快速鍵' },
    { pattern: /插件/g, replacement: '外掛' },
    { pattern: /智能體/g, replacement: '代理人' },
    { pattern: /點擊/g, replacement: '點選' },
    { pattern: /反饋/g, replacement: '意見回饋' },
    { pattern: /數據庫/g, replacement: '資料庫' },
    { pattern: /數據/g, replacement: '資料' },
    { pattern: /網絡/g, replacement: '網路' },
    { pattern: /內存/g, replacement: '記憶體' },
    { pattern: /緩存/g, replacement: '快取' },
    { pattern: /計劃/g, replacement: '計畫' },
    { pattern: /簡體中文/g, replacement: '簡體中文' },
    { pattern: /繁體中文/g, replacement: '繁體中文' },
  ];

  for (const fallback of defaultFallbacks) {
    if (!rules.some((r) => r.replacement === fallback.replacement)) {
      rules.push(fallback);
    }
  }

  return rules;
}

const converter = OpenCC.Converter({ from: 'cn', to: 'twp' });

/**
 * Translate a single string using OpenCC + conventions glossary
 */
export function translateText(str, glossary = [], customConverter = converter) {
  if (typeof str !== 'string') return str;
  let res = customConverter(str);
  for (const rule of glossary) {
    res = res.replace(rule.pattern, rule.replacement);
  }
  return res;
}

/**
 * Synchronize a single namespace object
 * - upstreamEn: Canonical English structure
 * - upstreamHans: Simplified Chinese counterpart
 * - currentHant: Current Traditional Chinese translation
 * - prevEn: Baseline English structure before update (optional)
 */
export function syncNamespace({
  upstreamEn,
  upstreamHans,
  currentHant,
  prevEn = null,
  glossary = [],
  customConverter = converter,
}) {
  if (upstreamEn === null || typeof upstreamEn !== 'object') {
    // String or primitive value
    const sourceHasChanged = prevEn !== null && prevEn !== upstreamEn;
    if (currentHant !== undefined && !sourceHasChanged) {
      return currentHant;
    }
    // Generate fresh translation from upstreamHans or upstreamEn
    if (typeof upstreamHans === 'string') {
      return translateText(upstreamHans, glossary, customConverter);
    }
    return upstreamEn;
  }

  if (Array.isArray(upstreamEn)) {
    return upstreamEn.map((item, idx) => {
      const hansItem = Array.isArray(upstreamHans) ? upstreamHans[idx] : undefined;
      const hantItem = Array.isArray(currentHant) ? currentHant[idx] : undefined;
      const pItem = Array.isArray(prevEn) ? prevEn[idx] : undefined;
      return syncNamespace({
        upstreamEn: item,
        upstreamHans: hansItem,
        currentHant: hantItem,
        prevEn: pItem,
        glossary,
        customConverter,
      });
    });
  }

  const result = {};
  // Upstream canonical keys define the target shape.
  // Any keys removed from upstreamEn are automatically excluded (deleted).
  for (const key of Object.keys(upstreamEn)) {
    // Dead plural-key guard: zh-Hant only has 'other' plural category.
    // Omit dead _one keys when a corresponding _other key is present.
    if (key.endsWith('_one')) {
      const otherKey = key.slice(0, -4) + '_other';
      if (upstreamEn[otherKey] !== undefined) {
        continue;
      }
    }

    const enVal = upstreamEn[key];
    const hansVal = upstreamHans ? upstreamHans[key] : undefined;
    const hantVal = currentHant ? currentHant[key] : undefined;
    const prevVal = prevEn ? prevEn[key] : null;

    result[key] = syncNamespace({
      upstreamEn: enVal,
      upstreamHans: hansVal,
      currentHant: hantVal,
      prevEn: prevVal,
      glossary,
      customConverter,
    });
  }

  return result;
}

/**
 * Main synchronization runner
 */
export function runSync(options = {}) {
  const glossary = loadGlossaryFromMdx(options.conventionsMdxPath || CONVENTIONS_MDX_PATH);
  const hantDir = options.hantDir || HANT_DIR;

  let upstreamEnDir = options.upstreamEnDir;
  let upstreamHansDir = options.upstreamHansDir;
  let prevEnDir = options.prevEnDir || path.join(LOCALES_DIR, 'en');

  // Extract from upstream git ref if specified
  let cleanupTemp = null;
  if (options.upstreamRef) {
    const tempDir = path.join(REPO_ROOT, '.upstream_locales_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    execSync(`git archive ${options.upstreamRef} packages/views/locales | tar -x -C ${tempDir}`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });
    upstreamEnDir = path.join(tempDir, 'packages/views/locales/en');
    upstreamHansDir = path.join(tempDir, 'packages/views/locales/zh-Hans');
    cleanupTemp = () => fs.rmSync(tempDir, { recursive: true, force: true });
  } else {
    upstreamEnDir = upstreamEnDir || path.join(LOCALES_DIR, 'en');
    upstreamHansDir = upstreamHansDir || path.join(LOCALES_DIR, 'zh-Hans');
  }

  if (!fs.existsSync(hantDir)) {
    fs.mkdirSync(hantDir, { recursive: true });
  }

  const enFiles = fs.readdirSync(upstreamEnDir).filter((f) => f.endsWith('.json'));
  let modifiedCount = 0;
  const changes = [];

  try {
    for (const file of enFiles) {
      const enFile = path.join(upstreamEnDir, file);
      const hansFile = path.join(upstreamHansDir, file);
      const hantFile = path.join(hantDir, file);
      const prevFile = prevEnDir ? path.join(prevEnDir, file) : null;

      const upstreamEn = JSON.parse(fs.readFileSync(enFile, 'utf8'));
      const upstreamHans = fs.existsSync(hansFile)
        ? JSON.parse(fs.readFileSync(hansFile, 'utf8'))
        : {};
      const currentHant = fs.existsSync(hantFile)
        ? JSON.parse(fs.readFileSync(hantFile, 'utf8'))
        : {};
      const prevEn = prevFile && fs.existsSync(prevFile)
        ? JSON.parse(fs.readFileSync(prevFile, 'utf8'))
        : null;

      const synced = syncNamespace({
        upstreamEn,
        upstreamHans,
        currentHant,
        prevEn,
        glossary,
      });

      const oldJson = fs.existsSync(hantFile) ? fs.readFileSync(hantFile, 'utf8') : '';
      const newJson = JSON.stringify(synced, null, 2) + '\n';

      if (oldJson !== newJson) {
        if (!options.dryRun) {
          fs.writeFileSync(hantFile, newJson, 'utf8');
        }
        modifiedCount++;
        changes.push(file);
      }
    }
  } finally {
    if (cleanupTemp) cleanupTemp();
  }

  console.log(`[i18n-sync] Completed. ${modifiedCount} file(s) updated.`);
  if (changes.length > 0) {
    console.log(`[i18n-sync] Modified files: ${changes.join(', ')}`);
  }
  return { modifiedCount, changes };
}

// Execute if run directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--upstream-ref') options.upstreamRef = args[++i];
    if (args[i] === '--upstream-dir') {
      options.upstreamEnDir = path.join(args[++i], 'en');
      options.upstreamHansDir = path.join(args[i], 'zh-Hans');
    }
    if (args[i] === '--dry-run') options.dryRun = true;
  }
  runSync(options);
}
