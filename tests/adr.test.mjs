import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  slugify, nextNumber, formatId, create, parseFrontMatter, readDecisions, AdrError,
} from '../scripts/lib/adr.mjs';

const CLI = fileURLToPath(new URL('../scripts/adr.mjs', import.meta.url));
const temporary = [];
const emptyProject = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporary.push(root);
  return root;
};
after(() => temporary.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const decisions = (root) => fs.readdirSync(path.join(root, 'docs', 'decisions')).sort();
const writeAdr = (root, name, text) => {
  const dir = path.join(root, 'docs', 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), text);
};

const INPUT = {
  title: 'Memory lives in the target repository',
  reason: 'The plugin folder is copied to a cache on install; memory must be versioned.',
  protected_files: ['docs/decisions/**', '*.sql', './src\\app.js'],
  rejected_alternatives: ['.projectmind/: a second register # next to CLAUDE.md'],
  context: 'Context.',
  decision: 'Decision.',
};
// The same input with the pre-v2 key names, still accepted.
const LEGACY_INPUT = {
  titre: INPUT.title,
  raison: INPUT.reason,
  fichiers_proteges: INPUT.protected_files,
  alternatives_rejetees: INPUT.rejected_alternatives,
  contexte: INPUT.context,
  decision: INPUT.decision,
};
// What readDecisions returns for INPUT, whatever the file format.
const READ = {
  file: 'docs/decisions/ADR-001-memory-lives-in-the-target-repository.md',
  id: 'ADR-001',
  title: INPUT.title,
  date: '2026-10-05',
  protected_files: ['docs/decisions/**', '*.sql', 'src/app.js'],
  reason: INPUT.reason,
  rejected_alternatives: INPUT.rejected_alternatives,
  errors: [],
};

test('slugify: accents, punctuation, ligatures', () => {
  assert.equal(slugify('La mémoire vit dans le dépôt cible'), 'la-memoire-vit-dans-le-depot-cible');
  assert.equal(slugify("L'œuvre : Ça marche !"), 'l-oeuvre-ca-marche');
  assert.equal(slugify('!!!'), 'decision');
});

test('slugify: a long title is cut between two words', () => {
  const slug = slugify('Les hooks sont écrits en Node et non en shell parce que jq est absent du poste Windows');
  assert.ok(slug.length <= 60, slug);
  assert.equal(slug, 'les-hooks-sont-ecrits-en-node-et-non-en-shell-parce-que-jq');
});

test('nextNumber: follows the highest number and ignores other files', () => {
  assert.equal(nextNumber([]), 1);
  assert.equal(nextNumber(['ADR-001-a.md', 'ADR-003-b.md', 'README.md', 'ADR-x.md', 'adr-002-c.txt']), 4);
  assert.equal(formatId(4), 'ADR-004');
  assert.equal(formatId(1000), 'ADR-1000');
});

test('create: ADR-001 then ADR-002, and a dry run writes nothing', () => {
  const root = emptyProject();
  assert.equal(create(root, INPUT).file, READ.file);
  assert.equal(create(root, { ...INPUT, title: 'Hooks in Node' }).id, 'ADR-002');
  const dry = create(root, { ...INPUT, title: 'Third' }, { dryRun: true });
  assert.equal(dry.id, 'ADR-003');
  assert.deepEqual(decisions(root), ['ADR-001-memory-lives-in-the-target-repository.md', 'ADR-002-hooks-in-node.md']);
});

test('create: a gap in the sequence is not reused', () => {
  const root = emptyProject();
  writeAdr(root, 'ADR-007-old.md', '');
  assert.equal(create(root, INPUT).id, 'ADR-008');
});

test('create then readDecisions: fields come back intact', () => {
  const root = emptyProject();
  create(root, INPUT, { date: '2026-10-05' });
  assert.deepEqual(readDecisions(root), [{ ...READ, status: 'accepted' }]);
});

test('create: writes a MADR-compatible ADR, empty optional sections left out', () => {
  const { content } = create(emptyProject(), INPUT, { dryRun: true, date: '2026-10-05' });
  const frontMatter = content.split('\n---\n')[0];
  assert.match(frontMatter, /^---\nid: ADR-001\ntitle: "Memory lives in the target repository"\nstatus: accepted\ndate: 2026-10-05\nprotected_files:\n/);
  assert.match(frontMatter, /\nreason: "/);
  assert.match(frontMatter, /\nrejected_alternatives:\n {2}- "/);
  assert.doesNotMatch(frontMatter, /titre|statut|raison|fichiers_proteges|alternatives_rejetees/);
  assert.deepEqual(content.split('\n').filter((l) => l.startsWith('#')), [
    '# ADR-001 — Memory lives in the target repository',
    '## Context and Problem Statement',
    '## Decision Outcome',
  ]);
  const full = create(emptyProject(), { ...INPUT, options: 'A or B.', consequences: 'Simpler.' }, { dryRun: true }).content;
  assert.deepEqual(full.split('\n').filter((l) => l.startsWith('#')).slice(1), [
    '## Context and Problem Statement',
    '## Considered Options',
    '## Decision Outcome',
    '### Consequences',
  ]);
});

test('create: pre-v2 key names are still accepted, but not the same field twice', () => {
  assert.equal(create(emptyProject(), LEGACY_INPUT, { dryRun: true, date: '2026-10-05' }).content,
    create(emptyProject(), INPUT, { dryRun: true, date: '2026-10-05' }).content);
  assert.throws(() => create(emptyProject(), { ...INPUT, titre: 'Other' }), (e) => {
    assert.deepEqual(e.errors, ['"title" given twice, in English and in French']);
    return true;
  });
});

test('create: refuses incomplete input or a path outside the project, writing nothing', () => {
  const root = emptyProject();
  const refusal = (input) => {
    try {
      create(root, input);
    } catch (e) {
      assert.ok(e instanceof AdrError);
      return e.errors;
    }
    assert.fail('no error thrown');
  };
  assert.deepEqual(refusal({ title: 'No reason' }), [
    '"reason" is required',
    '"context" is required',
    '"decision" is required',
  ]);
  assert.match(refusal({ ...INPUT, protected_files: ['/etc/passwd'] })[0], /outside the project/);
  assert.match(refusal({ ...INPUT, protected_files: ['C:/x'] })[0], /outside the project/);
  assert.match(refusal({ ...INPUT, protected_files: ['src/../../x'] })[0], /outside the project/);
  assert.match(refusal({ ...INPUT, protected_files: 'src/a.js' })[0], /"protected_files" .*list/);
  assert.match(refusal({ ...INPUT, files: ['src/a.js'] })[0], /unknown key: "files"/);
  assert.match(refusal({ ...INPUT, status: 'proposed' })[0], /unknown key: "status"/, 'the status is not an input');
  assert.equal(fs.existsSync(path.join(root, 'docs')), false);
});

test('readDecisions: a pre-v2 ADR, in French, reads like an English one', () => {
  const root = emptyProject();
  writeAdr(root, 'ADR-001-memory-lives-in-the-target-repository.md', [
    '---',
    'id: ADR-001',
    `titre: "${INPUT.title}"`,
    'statut: acceptée',
    'date: 2026-10-05',
    'fichiers_proteges:',
    ...INPUT.protected_files.map((f) => `  - ${JSON.stringify(f)}`),
    `raison: ${JSON.stringify(INPUT.reason)}`,
    'alternatives_rejetees:',
    `  - ${JSON.stringify(INPUT.rejected_alternatives[0])}`,
    '---',
    '',
    '# ADR-001 — Memory lives in the target repository',
    '',
    '## Contexte',
    '',
    'Context.',
  ].join('\r\n'));
  assert.deepEqual(readDecisions(root), [{ ...READ, status: 'acceptée' }]);
});

test('readDecisions: an English and a French name for the same field → English kept, and reported', () => {
  const root = emptyProject();
  writeAdr(root, 'ADR-001-double.md', '---\nid: ADR-001\ntitle: English\ntitre: French\nreason: r\n---\n');
  const [adr] = readDecisions(root);
  assert.equal(adr.title, 'English');
  assert.equal(adr.titre, undefined);
  assert.deepEqual(adr.errors, ['"title" and "titre" are the same field: "title" is kept']);
});

test('readDecisions: keeps a malformed decision and reports the anomaly', () => {
  const root = emptyProject();
  writeAdr(root, 'ADR-002-by-hand.md', '---\nid: ADR-009\nfichiers_proteges: src\\a.js\n---\n');
  writeAdr(root, 'ADR-003-in-english.md', '---\nid: ADR-003\nprotected_files: src\\b.js\n---\n');
  const [french, english] = readDecisions(root);
  assert.deepEqual(french.protected_files, ['src/a.js']);
  assert.deepEqual(french.errors, [
    '"fichiers_proteges" should be a list',
    '"reason" is missing',
    '"id" is ADR-009 but the file name gives ADR-002',
  ]);
  assert.deepEqual(english.protected_files, ['src/b.js']);
  assert.deepEqual(english.errors, ['"protected_files" should be a list', '"reason" is missing']);
});

test('parseFrontMatter: hand-written front matter, CRLF line endings', () => {
  const text = [
    '---',
    'id: ADR-005',
    'title: Title without quotes # comment',
    '# comment line',
    'protected_files:',
    '  - runtime/**',
    "  - 'src/l''app.js'",
    'reason: A reason',
    '  on two lines.',
    'rejected_alternatives: [MongoDB, "SQLite, locally"]',
    'consequences: >',
    '  Folded',
    '  here.',
    'context: |',
    '  line 1',
    '  line 2',
    '---',
    'body',
  ].join('\r\n');
  assert.deepEqual(parseFrontMatter(text), {
    data: {
      id: 'ADR-005',
      title: 'Title without quotes',
      protected_files: ['runtime/**', "src/l'app.js"],
      reason: 'A reason on two lines.',
      rejected_alternatives: ['MongoDB', 'SQLite, locally'],
      consequences: 'Folded here.',
      context: 'line 1\nline 2',
    },
    errors: [],
  });
});

test('parseFrontMatter: unindented dash list and empty list', () => {
  const text = '---\nprotected_files:\n- a.js\n- "b/**"\nrejected_alternatives: []\n---\n';
  assert.deepEqual(parseFrontMatter(text).data, { protected_files: ['a.js', 'b/**'], rejected_alternatives: [] });
});

test('parseFrontMatter: reports missing or unclosed front matter', () => {
  assert.equal(parseFrontMatter('# Title\n').data, null);
  assert.match(parseFrontMatter('---\nid: ADR-001\n').errors[0], /not closed/);
});

const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });

test('CLI: dry run, create, list', () => {
  const root = emptyProject();
  const dry = run(['create', '--dry-run', '--root', root], JSON.stringify(INPUT));
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^Preview, nothing written: docs\/decisions\/ADR-001-/);
  assert.equal(fs.existsSync(path.join(root, 'docs')), false);

  const real = run(['create', '--root', root], JSON.stringify(INPUT));
  assert.equal(real.status, 0, real.stderr);
  assert.equal(real.stdout.trim(), `ADR created: ${READ.file}`);

  const list = run(['list', '--root', root]);
  assert.equal(JSON.parse(list.stdout).length, 1);
});

test('CLI: readable errors with exit code 1, usage with exit code 2', () => {
  const root = emptyProject();
  const json = run(['create', '--root', root], '{ not json');
  assert.equal(json.status, 1);
  assert.match(json.stderr, /invalid JSON/);
  const missing = run(['list', '--root', path.join(root, 'missing')]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /not found/);
  assert.equal(run(['lister']).status, 2, 'the pre-v2 command names are gone');
});
