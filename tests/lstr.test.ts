
import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { materializeJsonForLstr } from '../src/lstr';

describe('Lstr Materialization', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lstr-test-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should materialize object as bundled _info.json + array dirs', () => {
        const data = { foo: "bar", num: 123, list: ["a"] };
        materializeJsonForLstr(tempDir, data);

        // Scalars should be in _info.json
        const infoFile = path.join(tempDir, '_info.json');
        expect(fs.existsSync(infoFile)).toBe(true);
        const info = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
        expect(info.foo).toBe("bar");
        expect(info.num).toBe(123);

        // Arrays should be dirs
        // Key 'list' -> 0000_list
        const listDirName = fs.readdirSync(tempDir).find(d => d.includes('list'));
        expect(listDirName).toBeDefined();
        if (listDirName) {
            const listPath = path.join(tempDir, listDirName);
            expect(fs.statSync(listPath).isDirectory()).toBe(true);
            const itemFile = path.join(listPath, '0000_[0].json');
            expect(fs.existsSync(itemFile)).toBe(true);
        }
    });

    test('should materialize nested tree nodes (hybrid strategy)', () => {
        const node = {
            _lstr_label: "MyNode",
            type: "item",
            text: "Hello",
            children: [
                { type: "reply", text: "World" }
            ]
        };
        // We wrap it in an array to trigger the array logic which handles the node/leaf decision
        materializeJsonForLstr(tempDir, [node]);

        // Should create a directory for the node because it has children
        const nodeDirName = fs.readdirSync(tempDir).find(d => d.includes('MyNode'));
        expect(nodeDirName).toBeDefined();

        if (nodeDirName) {
            const nodePath = path.join(tempDir, nodeDirName);
            expect(fs.statSync(nodePath).isDirectory()).toBe(true);

            // Check _node.json (bundled scalars)
            const metaFile = path.join(nodePath, '_node.json');
            expect(fs.existsSync(metaFile)).toBe(true);
            const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
            expect(meta.text).toBe("Hello");
            expect(meta.children).toBeUndefined(); // should be stripped

            // Check replies folder
            const repliesPath = path.join(nodePath, 'replies');
            expect(fs.existsSync(repliesPath)).toBe(true);

            // Inside replies, we have one leaf node (file)
            const replies = fs.readdirSync(repliesPath);
            expect(replies.length).toBe(1);
            expect(replies[0]).toMatch(/\.json$/); // It's a file
        }
    });

    test('should materialize scalar value', () => {
        materializeJsonForLstr(tempDir, "hello");
        const valueFile = path.join(tempDir, '_value.json');
        expect(fs.existsSync(valueFile)).toBe(true);
        expect(JSON.parse(fs.readFileSync(valueFile, 'utf-8'))).toBe("hello");
    });

    test('should materialize flat object (bundled)', () => {
        const data = { foo: "bar", num: 123 };
        materializeJsonForLstr(tempDir, data);

        // Should be bundled in _info.json
        const infoFile = path.join(tempDir, '_info.json');
        expect(fs.existsSync(infoFile)).toBe(true);
        const info = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
        expect(info.foo).toBe("bar");
        expect(info.num).toBe(123);
    });

    test('should materialize nested object (bundled unless array)', () => {
        const data = { nested: { inner: "value" } };
        materializeJsonForLstr(tempDir, data);

        // "nested" is an object, not an array. It gets bundled into _info.json of root.
        const infoFile = path.join(tempDir, '_info.json');
        expect(fs.existsSync(infoFile)).toBe(true);
        const info = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
        expect(info.nested).toBeDefined();
        expect(info.nested.inner).toBe("value");

        // Ensure no directory was created for 'nested'
        const dirs = fs.readdirSync(tempDir);
        // We expect _info.json and maybe nothing else
        const nestedDir = dirs.find(d => d.includes('nested'));
        expect(nestedDir).toBeUndefined();
    });

    test('should materialize array', () => {
        const data = ["a", "b"];
        materializeJsonForLstr(tempDir, data);

        const item0 = path.join(tempDir, '0000_[0].json');
        const item1 = path.join(tempDir, '0001_[1].json');

        expect(fs.existsSync(item0)).toBe(true);
        expect(JSON.parse(fs.readFileSync(item0, 'utf-8'))).toBe("a");
        expect(JSON.parse(fs.readFileSync(item1, 'utf-8'))).toBe("b");
    });

    test('should materialize with descriptive names', () => {
        const doc = {
            title: 'Test',
            content: [
                { type: 'thread-item', level: 0, author: 'jdoe', text: 'Hello World' }
            ]
        };
        const treeDoc = prepareDocForLstr(doc);

        // We need to verify that treeDoc has content with _lstr_label
        // But materializeJsonForLstr expects the ROOT object or array. 
        // If we pass treeDoc (which is the root object), it will materialize its keys.
        // treeDoc.content is the array we care about.

        // Let's materialize just the content array to check the filenames
        // Or materialize the whole doc and check inside 'content' dir
        materializeJsonForLstr(tempDir, treeDoc);

        const contentDir = path.join(tempDir, '0004_content'); // Key 'content' is sorted?
        // Wait, keys are sorted alphabetically? 
        // 'content' starts with c. 'title' with t. 'url' with u. 'meta' with m.
        // content is likely 0000 or 0001 depending on other keys.
        // The implementation sorts keys.

        // Actually, let's just find the directory that contains 'content' in its name
        const dirs = fs.readdirSync(tempDir);
        const contentDirName = dirs.find(d => d.includes('content'));
        expect(contentDirName).toBeDefined();

        if (contentDirName) {
            const files = fs.readdirSync(path.join(tempDir, contentDirName));
            const match = files.find(f => f.startsWith('0000_') && f.includes('jdoe'));
            expect(match).toBeDefined();
        }
    });
});

import { prepareDocForLstr } from '../src/lstr';

describe('Lstr Tree Transformation', () => {
    test('should nested flat blocks based on level', () => {
        const doc = {
            title: 'Test',
            content: [
                { type: 'heading', level: 1, text: 'H1' },
                { type: 'text', text: 'T1' }, // implicit child of H1? In my logic it becomes child of H1
                { type: 'heading', level: 2, text: 'H2' }
            ]
        };

        // My logic nests based on STRICT level stack.
        // H1 (level 1)
        // T1 (level 0 or undefined). Wait, text usually doesn't have level.
        // If undefined, it defaults to 0. 
        // Stack: [-1]. 
        // H1 (1). Stack: [-1, 1]. Parent -1. Root gets H1.
        // T1 (0). Stack: [-1, 1]. Current 0. Pop 1 (1 >= 0). Stack [-1]. Parent -1. Root gets T1.
        // H2 (2). Stack [-1]. Current 2. Stack [-1, 2]. Root gets H2.

        // This means T1 is NOT nested under H1 if T1 has level 0. 
        // The transformation logic I wrote expects items to have levels to nest them.
        // If I want T1 under H1, T1 needs level > 1.

        // Let's test with explicit levels like a thread
        const threadDoc = {
            title: 'Thread',
            content: [
                { type: 'thread-item', level: 0, text: 'Root' },
                { type: 'thread-item', level: 1, text: 'Reply' },
                { type: 'thread-item', level: 2, text: 'Nested' },
                { type: 'thread-item', level: 0, text: 'Root 2' }
            ]
        };

        const result = prepareDocForLstr(threadDoc);
        const root = result.content;

        expect(root).toHaveLength(2); // Root, Root 2
        expect(root[0].children).toHaveLength(1); // Reply
        expect(root[0].children[0].children).toHaveLength(1); // Nested

        // Verify labels
        expect(root[0]._lstr_label).toContain('Root');
        expect(root[0].children[0]._lstr_label).toContain('Reply');
    });

});
