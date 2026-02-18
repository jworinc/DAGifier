import { test, expect } from 'vitest';
import path from 'path';
import { execSync } from 'child_process';

const FIXTURE_PATH = path.join(__dirname, 'fixtures/core8/batch_thread.html');
const TSX = 'npx tsx src/cli.ts';

test('Killer Workflow 1: Structural Diff Signature', () => {
    // 1. Generate JSON output
    const output = execSync(`cat ${FIXTURE_PATH} | ${TSX} - --json`, { encoding: 'utf-8' });
    const json = JSON.parse(output);

    // 2. Verify signature exists
    expect(json.doc.structural_signature).toBeDefined();
    expect(typeof json.doc.structural_signature).toBe('string');
});

test('Killer Workflow 2: Thread Triage (Compact)', () => {
    const output = execSync(`cat ${FIXTURE_PATH} | ${TSX} thread - --compact`, { encoding: 'utf-8' });

    // User1 (Level 0) should be present
    expect(output).toContain('User1');
    // User3 (Level 1) should be present (maxDepth 2 includes 0 and 1)
    expect(output).toContain('User3');

    // Check that we have the thread view structure
    expect(output).toContain('GENERIC THREAD TEST');
});

test('Killer Workflow 3: Forum Monitoring (JSON Filter)', () => {
    const output = execSync(`cat ${FIXTURE_PATH} | ${TSX} thread - --json`, { encoding: 'utf-8' });
    const json = JSON.parse(output);
    const topLevel = json.doc.content.filter((n: any) => n.attributes?.depth === 0 || n.level === 0 || n.type === 'thread-item');
    expect(topLevel.length).toBeGreaterThan(0);
});

test('Killer Workflow 4: Docs Linter (Outline)', () => {
    const output = execSync(`cat ${FIXTURE_PATH} | ${TSX} outline -`, { encoding: 'utf-8' });

    // Should contain headings (Uppercase/styled in default renderer)
    expect(output).toContain('GENERIC THREAD TEST');
    // Should NOT contain body text like "This is a comment"
    expect(output).not.toContain('This is a comment');
});

test('Killer Workflow 5: Clean Research Harvesting', () => {
    const output = execSync(`cat ${FIXTURE_PATH} | ${TSX} read -`, { encoding: 'utf-8' });
    // Expect content
    expect(output).toContain('GENERIC THREAD TEST');
    expect(output).toContain('User1');
    // Clean means no HTML clutter
    expect(output).not.toContain('<div');
});
