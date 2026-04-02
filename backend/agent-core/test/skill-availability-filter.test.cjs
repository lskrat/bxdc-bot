const test = require('node:test');
const assert = require('node:assert/strict');
const { filterExtensionSkillsByDisabledIds } = require('../dist/tools/java-skills.js');

test('filterExtensionSkillsByDisabledIds: empty or missing ids leaves list unchanged', () => {
  const skills = [{ id: 1, name: 'a', enabled: true, type: 'EXTENSION' }];
  assert.deepEqual(filterExtensionSkillsByDisabledIds(skills, undefined), skills);
  assert.deepEqual(filterExtensionSkillsByDisabledIds(skills, []), skills);
});

test('filterExtensionSkillsByDisabledIds: removes matching string ids', () => {
  const skills = [
    { id: 1, name: 'a', enabled: true, type: 'EXTENSION' },
    { id: 2, name: 'b', enabled: true, type: 'EXTENSION' },
  ];
  const out = filterExtensionSkillsByDisabledIds(skills, ['1', ' 2 ']);
  assert.equal(out.length, 0);
});

test('filterExtensionSkillsByDisabledIds: unknown disable id does not break', () => {
  const skills = [{ id: 99, name: 'x', enabled: true, type: 'EXTENSION' }];
  const out = filterExtensionSkillsByDisabledIds(skills, ['999', '1000']);
  assert.deepEqual(out, skills);
});
