import { test, expect } from 'vitest';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

const FIXTURE_PATH = path.join(__dirname, 'fixtures/core8/batch_thread.html');
const TSX = 'npx tsx src/cli.ts';

test('Core Feature: Markdown Output', () => {
    const output = execSync(`cat ${FIXTURE_PATH} | ${TSX} - --format md`, { encoding: 'utf-8' });
    expect(output).toContain('# Generic Thread Test');
    // Generic extraction improved, finding User1
    expect(output).toContain('**User1**:');
    expect(output).toContain('> User1 This is a comment.');
}, 20000);

test('Core Feature: Section Filtering', () => {
    const tempFixture = path.join(__dirname, 'fixtures/core8/sections.html');
    fs.writeFileSync(tempFixture, `
        <html><body>
            <h1>Main Title</h1>
            <h2>Introduction</h2>
            <p>Intro text.</p>
            <h2>Methods</h2>
            <p>Method text.</p>
            <h2>Results</h2>
            <p>Result text.</p>
        </body></html>
    `);

    const output = execSync(`cat ${tempFixture} | ${TSX} - --section "Methods"`, { encoding: 'utf-8' });
    expect(output).toContain('Methods');
    expect(output).toContain('Method text.');
    expect(output).not.toContain('Introduction');
    expect(output).not.toContain('Results');

    fs.unlinkSync(tempFixture);
});

test('Core Feature: Author Filtering', () => {
    // Extractor finds "User1"
    const outputUser1 = execSync(`cat ${FIXTURE_PATH} | ${TSX} thread - --author "User1"`, { encoding: 'utf-8' });
    expect(outputUser1).toContain('This is a comment');

    // "Ghost" should not exist
    const outputGhost = execSync(`cat ${FIXTURE_PATH} | ${TSX} thread - --author "Ghost"`, { encoding: 'utf-8' });
    // Should be empty or just contain header/footer. 
    // Header contains title.
    expect(outputGhost).toContain('GENERIC THREAD TEST');
    expect(outputGhost).not.toContain('This is a comment'); // Should be filtered out
}, 20000);

test('Core Feature: Stats', () => {
    const output = execSync(`cat ${FIXTURE_PATH} | ${TSX} - --stats`, { encoding: 'utf-8' });
    expect(output).toContain('Document Statistics');
    expect(output).toContain('Blocks:');
    expect(output).toContain('Max Depth:');
    expect(output).toContain('Confidence:');
});

test('Core Feature: Highlighting', () => {
    const output = execSync(`cat ${FIXTURE_PATH} | ${TSX} - --highlight "comment"`, { encoding: 'utf-8' });
    expect(output).toContain('\x1b[31mcomment\x1b[0m');
});

test('Core Feature: ASCII Only', () => {
    const tempFixture = path.join(__dirname, 'fixtures/core8/unicode.html');
    fs.writeFileSync(tempFixture, `<html><body><p>Hello — World ’ “ ” …</p></body></html>`);

    const output = execSync(`cat ${tempFixture} | ${TSX} - --ascii-only`, { encoding: 'utf-8' });
    expect(output).toContain('--'); // — -> --
    expect(output).toContain("'");  // ’ -> '
    expect(output).not.toContain('—');

    fs.unlinkSync(tempFixture);
});

test('Core Feature: Sorting', () => {
    const output = execSync(`cat ${FIXTURE_PATH} | ${TSX} thread - --sort newest`, { encoding: 'utf-8' });

    const pos1 = output.indexOf('User1');
    const pos7 = output.indexOf('User7');

    // User7 should be before User1
    expect(pos7).toBeLessThan(pos1);
});
