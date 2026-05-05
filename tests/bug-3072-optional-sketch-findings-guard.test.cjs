'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'get-shit-done', 'workflows');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('bug #3072: optional sketch/spike findings probes are non-fatal', () => {
  test('all sketch/spike findings SKILL.md ls probes include || true', () => {
    const files = ['ui-phase.md', 'plan-phase.md', 'discuss-phase.md', 'new-project.md'];
    const offenders = [];

    for (const file of files) {
      const content = read(file);
      const lines = content.split('\n');
      for (const line of lines) {
        if (/\.claude\/skills\/(?:sketch|spike)-findings-\*\/SKILL\.md/.test(line) && !/\|\|\s*true/.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }

    assert.deepStrictEqual(offenders, [], `missing non-fatal guard on optional findings probe:\n${offenders.join('\n')}`);
  });
});
