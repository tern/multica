import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadGlossaryFromMdx,
  translateText,
  syncNamespace,
  runSync,
} from './i18n-sync.mjs';

console.log('--- Starting i18n-sync unit and integration tests ---');

// Test 1: loadGlossaryFromMdx extracts expected rules
{
  const glossary = loadGlossaryFromMdx();
  assert(glossary.length > 0, 'Glossary rules should not be empty');
  const projectRule = glossary.find((r) => r.replacement === '專案');
  assert(projectRule, 'Should have replacement rule for 專案 (Project)');
  const defaultRule = glossary.find((r) => r.replacement === '預設');
  assert(defaultRule, 'Should have replacement rule for 預設 (Default)');
  console.log('✓ Test 1: loadGlossaryFromMdx passed');
}

// Test 2: translateText applies OpenCC and glossary substitutions
{
  const glossary = [
    { pattern: /项目/g, replacement: '專案' },
    { pattern: /默认/g, replacement: '預設' },
    { pattern: /保存/g, replacement: '儲存' },
  ];
  const translated = translateText('默认项目已保存', glossary);
  assert.equal(translated, '預設專案已儲存');
  console.log('✓ Test 2: translateText passed');
}

// Test 3: Adding a new key from upstream
{
  const upstreamEn = {
    existing_key: 'Old Title',
    new_key: 'New Setting',
  };
  const upstreamHans = {
    existing_key: '旧标题',
    new_key: '新设置',
  };
  const currentHant = {
    existing_key: '舊標題',
  };
  const prevEn = {
    existing_key: 'Old Title',
  };

  const synced = syncNamespace({
    upstreamEn,
    upstreamHans,
    currentHant,
    prevEn,
  });

  assert.equal(synced.existing_key, '舊標題', 'Existing key should be preserved');
  assert.equal(synced.new_key, '新設定', 'New key should be translated and added');
  console.log('✓ Test 3: Adding new key passed');
}

// Test 4: Modifying an existing key when upstream text changes
{
  const upstreamEn = {
    title: 'Updated Project Settings',
  };
  const upstreamHans = {
    title: '已更新的项目设置',
  };
  const currentHant = {
    title: '舊的專案設定',
  };
  const prevEn = {
    title: 'Project Settings', // English changed from "Project Settings" to "Updated Project Settings"
  };

  const synced = syncNamespace({
    upstreamEn,
    upstreamHans,
    currentHant,
    prevEn,
  });

  assert.equal(synced.title, '已更新的專案設定', 'Modified key should be re-translated');
  console.log('✓ Test 4: Modifying existing key passed');
}

// Test 5: Deleting an obsolete key when upstream removes it
{
  const upstreamEn = {
    active_key: 'Active',
  };
  const upstreamHans = {
    active_key: '活跃',
  };
  const currentHant = {
    active_key: '活躍',
    obsolete_key: '廢棄鍵',
  };
  const prevEn = {
    active_key: 'Active',
    obsolete_key: 'Deprecated',
  };

  const synced = syncNamespace({
    upstreamEn,
    upstreamHans,
    currentHant,
    prevEn,
  });

  assert.equal(synced.active_key, '活躍');
  assert.equal(synced.obsolete_key, undefined, 'Obsolete key should be removed');
  console.log('✓ Test 5: Deleting obsolete key passed');
}

// Test 6: End-to-end sync with upstream import
{
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'multica-i18n-test-'));
  const upstreamEnDir = path.join(tempBase, 'upstream', 'en');
  const upstreamHansDir = path.join(tempBase, 'upstream', 'zh-Hans');
  const hantDir = path.join(tempBase, 'zh-Hant');
  const prevEnDir = path.join(tempBase, 'prev', 'en');

  fs.mkdirSync(upstreamEnDir, { recursive: true });
  fs.mkdirSync(upstreamHansDir, { recursive: true });
  fs.mkdirSync(hantDir, { recursive: true });
  fs.mkdirSync(prevEnDir, { recursive: true });

  fs.writeFileSync(
    path.join(upstreamEnDir, 'test.json'),
    JSON.stringify({ hello: 'World', new_item: 'New Project' })
  );
  fs.writeFileSync(
    path.join(upstreamHansDir, 'test.json'),
    JSON.stringify({ hello: '世界', new_item: '新项目' })
  );
  fs.writeFileSync(
    path.join(prevEnDir, 'test.json'),
    JSON.stringify({ hello: 'World' })
  );
  fs.writeFileSync(
    path.join(hantDir, 'test.json'),
    JSON.stringify({ hello: '世界', deprecated: '舊項目' })
  );

  const result = runSync({
    upstreamEnDir,
    upstreamHansDir,
    prevEnDir,
    hantDir,
  });

  assert.equal(result.modifiedCount, 1);
  const updatedHant = JSON.parse(fs.readFileSync(path.join(hantDir, 'test.json'), 'utf8'));
  assert.equal(updatedHant.hello, '世界');
  assert.equal(updatedHant.new_item, '新專案');
  assert.equal(updatedHant.deprecated, undefined, 'Deprecated key must be deleted');

  fs.rmSync(tempBase, { recursive: true, force: true });
  console.log('✓ Test 6: End-to-end sync with upstream import passed');
}

console.log('All 6 i18n-sync tests passed successfully!');
