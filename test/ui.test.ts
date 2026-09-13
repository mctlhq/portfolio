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

test('the ten journal-lifecycle ui keys carry their exact EN/RU values character for character', () => {
  const expected: Record<string, { en: string; ru: string }> = {
    cycleColStatus: { en: 'Status', ru: 'Статус' },
    journalStatusLabel: { en: 'Status', ru: 'Статус' },
    statusComplete: { en: 'complete', ru: 'завершён' },
    statusInProgress: { en: 'in progress', ru: 'в работе' },
    statusAbandoned: { en: 'abandoned', ru: 'прерван' },
    colophonTotalComplete: { en: 'complete', ru: 'завершённых' },
    colophonTotalInProgress: { en: 'in progress', ru: 'в работе' },
    colophonTotalAbandoned: { en: 'abandoned', ru: 'прерванных' },
    leadTimeAbandoned: { en: 'not measured: this cycle was abandoned', ru: 'не измерено: этот цикл был прерван' },
    journalAbandonedHeading: { en: 'Why this cycle was abandoned', ru: 'Почему этот цикл был прерван' },
  };
  for (const [key, value] of Object.entries(expected)) {
    const entry = (ui as Record<string, { en: string; ru: string }>)[key];
    assert.ok(entry, `ui.${key} is missing`);
    assert.equal(entry.en, value.en, `ui.${key}.en`);
    assert.equal(entry.ru, value.ru, `ui.${key}.ru`);
  }
});

test('colophonTotalCycles, colophonTotalInterventions and leadTimeMissing are unchanged', () => {
  assert.equal(ui.colophonTotalCycles.en, 'public cycles');
  assert.equal(ui.colophonTotalCycles.ru, 'публичных циклов');
  assert.equal(ui.colophonTotalInterventions.en, 'manual interventions in total');
  assert.equal(ui.colophonTotalInterventions.ru, 'ручных вмешательств всего');
  assert.equal(ui.leadTimeMissing.en, 'not measured: this cycle has no end timestamp yet');
  assert.equal(ui.leadTimeMissing.ru, 'не измерено: у этого цикла ещё нет конечной отметки времени');
});

test('heroName is a real bilingual pair, and homeTitle stays the single Latin <title> string', () => {
  assert.equal(ui.heroName.en, 'Dmitrii Mashkov');
  assert.equal(ui.heroName.ru, 'Дмитрий Машков');
  assert.notEqual(ui.heroName.en, ui.heroName.ru, 'heroName.en and heroName.ru must not be collapsed to one string');

  assert.equal(ui.homeTitle.en, 'Dmitrii Mashkov');
  assert.equal(ui.homeTitle.ru, 'Dmitrii Mashkov');
  assert.equal(ui.homeTitle.en, ui.homeTitle.ru);
});
