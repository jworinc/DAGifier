
import fs from 'fs';
import path from 'path';

// --- Transformation Logic ---

export function prepareDocForLstr(doc: any): any {
    // 1. strip heavy/boring fields from root
    const root: any = {
        title: doc.title,
        url: doc.url,
        meta: doc.meta,
        metadata: doc.metadata,
        // We will transform content below
    };

    // 2. Transform content into a nested tree if possible
    if (Array.isArray(doc.content)) {
        root.content = transformContent(doc.content);
        recursiveAssignLabels(root.content);
    } else {
        root.content = doc.content;
    }

    return root;
}

function transformContent(blocks: any[]): any {
    // If blocks have 'level', we can nest them.
    // If not, we just return them as a list (maybe grouped by type?)

    // Check if we have thread structure
    const hasLevels = blocks.some(b => b.level !== undefined);
    if (!hasLevels) return blocks;

    // Nesting logic
    const root: any[] = [];
    const stack: { level: number, children: any[] }[] = [{ level: -1, children: root }];

    blocks.forEach((block, idx) => {
        const item = { ...block }; // shallow clone
        // Remove level from display if we are visualizing structure? 
        // No, keep it for debug, but maybe rename it specific for lstr ordering?

        let currentLevel = item.level ?? 0;

        // Find parent
        while (stack.length > 1 && stack[stack.length - 1].level >= currentLevel) {
            stack.pop();
        }

        const parent = stack[stack.length - 1];

        // If the item acts as a container (thread-item, heading), it can have children
        // We add a 'children' array to it, and push it to stack
        if (item.type === 'thread-item' || item.type === 'heading') {
            item.children = [];
            parent.children.push(item);
            stack.push({ level: currentLevel, children: item.children });
        } else {
            // Leaf node potentially (text, code, etc)
            // Actually, text often belongs to the previous heading/thread-item.
            // But strict level logic puts it in the current parent's children.
            parent.children.push(item);
        }
    });

    return root;
}

function generateLstrLabel(block: any): string {
    let raw = '';
    if (block.author) raw += `${block.author}_`;
    if (block.type === 'heading') raw += 'H_';

    // Clean text
    const text = block.text || (block.content && block.content[0]?.text) || block.type;
    if (typeof text === 'string') {
        const clean = text.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
        raw += clean.substring(0, 30);
    }

    // Remove trailing underscores
    return raw.replace(/_$/, '') || 'item';
}

function recursiveAssignLabels(nodes: any[]) {
    nodes.forEach(node => {
        node._lstr_label = generateLstrLabel(node);
        if (node.children) {
            recursiveAssignLabels(node.children);
        }
    });
}

// --- Materialization Logic ---

function safeTreeName(key: string): string {
    return key.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

export function materializeJsonForLstr(root: string, value: any) {
    if (Array.isArray(value)) {
        if (value.length === 0) {
            // Empty array? Skip or write empty file. 
            // fs.writeFileSync(path.join(root, '(empty).json'), '[]\n', 'utf-8');
            return;
        }
        value.forEach((child, idx) => {
            let suffix = `[${idx}]`;

            // Generate label
            if (child && typeof child === 'object' && child._lstr_label) {
                suffix = child._lstr_label;
            }

            const label = `${String(idx).padStart(4, '0')}_${suffix}`;

            // DECISION: Directory or File?
            // If child has children (content array), make it a directory.
            if (child && typeof child === 'object' && Array.isArray(child.children) && child.children.length > 0) {
                const dirPath = path.join(root, label);
                fs.mkdirSync(dirPath, { recursive: true });

                // 1. Write metadata to _node.json
                const { children, ...meta } = child;
                fs.writeFileSync(path.join(dirPath, '_node.json'), JSON.stringify(meta, null, 2), 'utf-8');

                // 2. Recurse for children
                // We create a 'replies' or 'children' folder? Or just dump in root?
                // Dumping in root mixes with _node.json. 'replies' is cleaner.
                // Let's use 'replies' folder for the children array
                const repliesPath = path.join(dirPath, 'replies');
                fs.mkdirSync(repliesPath);
                materializeJsonForLstr(repliesPath, children);

            } else {
                // Leaf node: Request "File" mode
                // Just write the whole object to label.json
                const filePath = path.join(root, `${label}.json`);
                fs.writeFileSync(filePath, JSON.stringify(child, null, 2), 'utf-8');
            }
        });
        return;
    }

    if (value && typeof value === 'object') {
        // Root object (PageDoc usually)
        // Bundle scalars into _meta.json
        // Explode arrays (content) into directories

        const scalars: Record<string, any> = {};
        const arrays: Record<string, any[]> = {};

        for (const [key, val] of Object.entries(value)) {
            if (Array.isArray(val)) {
                arrays[key] = val;
            } else {
                scalars[key] = val;
            }
        }

        // Write scalars
        if (Object.keys(scalars).length > 0) {
            fs.writeFileSync(path.join(root, '_info.json'), JSON.stringify(scalars, null, 2), 'utf-8');
        }

        // Write arrays as dirs
        for (const [key, arr] of Object.entries(arrays)) {
            const label = `0000_${safeTreeName(key)}`; // todo: better prefix?
            const dirPath = path.join(root, label);
            fs.mkdirSync(dirPath, { recursive: true });
            materializeJsonForLstr(dirPath, arr);
        }
        return;
    }

    // Scalar fallback
    fs.writeFileSync(path.join(root, '_value.json'), JSON.stringify(value, null, 2) + '\n', 'utf-8');
}
