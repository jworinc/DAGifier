import { spawn } from 'child_process';
import chalk from 'chalk';
import { ThreadItem } from './threads';
import readline from 'readline';

export class BrowserTui {
    static async select(items: ThreadItem[]): Promise<ThreadItem | null> {
        // Try FZF first
        try {
            return await this.fzfSelect(items);
        } catch (e) {
            // Fallback to simple list
            return await this.simpleSelect(items);
        }
    }

    private static fzfSelect(items: ThreadItem[]): Promise<ThreadItem | null> {
        return new Promise((resolve, reject) => {
            // Format for FZF: "ID  Date  Project  Title"
            // We use a delimiter to parse back
            const input = items.map(i => {
                const icon = i.type === 'task' ? '☑' : '📝';
                const grade = i.grade !== 'ungraded' ? `[${i.grade}]` : '   ';
                return `${i.id}\t${i.date}\t${i.project.padEnd(6)}\t${grade}\t${icon} ${i.title}`;
            }).join('\n');

            const fzf = spawn('fzf', [
                '--height=80%',
                '--layout=reverse',
                '--border=rounded',
                '--delimiter=\\t',
                '--with-nth=1,2,3,4,5',
                '--header=Select a thread (Enter to view)'
            ], {
                stdio: ['pipe', 'pipe', process.stderr]
            });

            let selection = '';

            fzf.stdout.on('data', (data) => {
                selection += data.toString();
            });

            fzf.stdin.write(input);
            fzf.stdin.end();

            fzf.on('error', (err) => {
                reject(err);
            });

            fzf.on('close', (code) => {
                if (code !== 0 || !selection.trim()) {
                    resolve(null);
                    return;
                }
                const id = selection.split('\t')[0];
                const item = items.find(i => i.id === id);
                resolve(item || null);
            });
        });
    }

    private static async simpleSelect(items: ThreadItem[]): Promise<ThreadItem | null> {
        console.log(chalk.bold.cyan('\n--- Select Thread ---'));
        items.slice(0, 20).forEach((item, idx) => {
            const icon = item.type === 'task' ? '☑' : '📝';
            console.log(`${chalk.yellow(idx + 1)}. ${chalk.blue(item.id)} ${chalk.dim(item.date)} ${icon} ${item.title}`);
        });
        if (items.length > 20) console.log(chalk.dim(`... and ${items.length - 20} more`));

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        return new Promise((resolve) => {
            rl.question('\nEnter number or ID: ', (ans) => {
                rl.close();
                const num = parseInt(ans);
                if (!isNaN(num) && num > 0 && num <= items.length) {
                    resolve(items[num - 1]);
                } else {
                    const byId = items.find(i => i.id === ans.trim());
                    resolve(byId || null);
                }
            });
        });
    }
}
