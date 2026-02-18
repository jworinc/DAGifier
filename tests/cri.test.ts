import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const TSX = 'npx tsx src/bin/cri.ts';
const TEST_DIR = path.join(__dirname, 'temp_cri_unit');
const CONFIG_FILE = path.join(TEST_DIR, 'config.json');

describe('CRI Unit Logic (via CLI)', () => {
    beforeAll(() => {
        if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
        fs.mkdirSync(TEST_DIR);
    });

    afterAll(() => {
        if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
    });

    test('should init valid config', () => {
        const initial = { theme: 'light', version: 1 };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(initial, null, 2));
        const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
        expect(content).toContain('"theme": "light"');
    });

    test('apply should create backup', () => {
        // Apply a change via stdin
        const newConfig = { theme: 'dark', version: 2 };
        execSync(`echo '${JSON.stringify(newConfig)}' | ${TSX} apply ${CONFIG_FILE}`, { encoding: 'utf-8' });

        // Check content updated
        const updated = fs.readFileSync(CONFIG_FILE, 'utf-8');
        expect(updated).toContain('"theme": "dark"');

        // Check backup exists
        const files = fs.readdirSync(TEST_DIR);
        const backups = files.filter(f => f.startsWith('config.json.'));
        expect(backups.length).toBeGreaterThan(0);
    });

    test('rollback should revert state', () => {
        // Current state is dark/v2 behavior
        execSync(`${TSX} rollback ${CONFIG_FILE}`, { encoding: 'utf-8' });

        const reverted = fs.readFileSync(CONFIG_FILE, 'utf-8');
        expect(reverted).toContain('"theme": "light"');
    });

    test('prune should remove excess backups', () => {
        // Create 10 dummy backups
        for (let i = 0; i < 10; i++) {
            fs.writeFileSync(`${CONFIG_FILE}.2026-01-0${i}T000000Z`, '{}');
        }

        execSync(`${TSX} prune ${CONFIG_FILE} --keep 3`, { encoding: 'utf-8' });

        const files = fs.readdirSync(TEST_DIR);
        const backups = files.filter(f => f.startsWith('config.json.2026-01-0'));
        // Pruning logic might differ (e.g. strict dates), but count should decrease
        expect(backups.length).toBe(3);
    });
});
