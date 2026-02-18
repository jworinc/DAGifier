import { describe, it, expect, vi } from 'vitest';
import { createProgram } from '../src/cli';
import { Readable } from 'stream';
import path from 'path';

// Mock stdout/stderr
const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

// Mock exit to avoid killing test process
const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`Process exit ${code}`);
});

describe('Unix-First Composability', () => {
    it('should be definable', () => {
        const program = createProgram();
        expect(program).toBeDefined();
    });

    // Hard to test stdin directly in unit test without spawning child process
    // But we can verify programmatic parts if we extracted them more cleanly
});
