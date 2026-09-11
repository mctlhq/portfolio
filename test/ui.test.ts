import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ui } from '../src/i18n/ui.ts';

test('every ui entry has a non-empty en and ru of the same kind', () => {
  for (const [key, value] of Object.entries(ui)) {
    const entry = value as { en: unknown; ru: unknown };
    assert.ok('en' in entry, `${key}.en is missing`);
    assert.ok('ru' in entry, `${key}.ru is missing`);

    const enIsArray = Array.isArray(entry.en);
    const ruIsArray = Array.isArray(entry.ru);
    assert.equal(enIsArray, ruIsArray, `${key}: en and ru must be the same kind (string vs array)`);

    if (enIsArray) {
      const en = entry.en as unknown[];
      const ru = entry.ru as unknown[];
      assert.ok(en.length > 0, `${key}.en is an empty array`);
      assert.ok(ru.length > 0, `${key}.ru is an empty array`);
      assert.equal(en.length, ru.length, `${key}: en and ru arrays have different lengths`);
      for (const item of en) assert.ok(typeof item === 'string' && item.length > 0, `${key}.en has an empty item`);
      for (const item of ru) assert.ok(typeof item === 'string' && item.length > 0, `${key}.ru has an empty item`);
    } else {
      assert.equal(typeof entry.en, 'string', `${key}.en must be a string`);
      assert.equal(typeof entry.ru, 'string', `${key}.ru must be a string`);
      assert.ok((entry.en as string).length > 0, `${key}.en is empty`);
      assert.ok((entry.ru as string).length > 0, `${key}.ru is empty`);
    }
  }
});

test('heroName is a real bilingual pair, and homeTitle stays the single Latin <title> string', () => {
  assert.equal(ui.heroName.en, 'Dmitrii Mashkov');
  assert.equal(ui.heroName.ru, 'Дмитрий Машков');
  assert.notEqual(ui.heroName.en, ui.heroName.ru, 'heroName.en and heroName.ru must not be collapsed to one string');

  assert.equal(ui.homeTitle.en, 'Dmitrii Mashkov');
  assert.equal(ui.homeTitle.ru, 'Dmitrii Mashkov');
  assert.equal(ui.homeTitle.en, ui.homeTitle.ru);
});
