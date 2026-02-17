
import { execSync, spawnSync } from 'child_process';
import chalk from 'chalk';

export interface DoctorCheck {
    tool: string;
    description: string;
    installed: boolean;
    path?: string;
    installCmd: string;
    category: 'json' | 'markdown' | 'diff' | 'core';
}

const TOOLS = [
    { tool: 'jq', desc: 'JSON filtering and processing', cat: 'json', cmd: 'brew install jq' },
    { tool: 'jless', desc: 'Interactive JSON viewer', cat: 'json', cmd: 'brew install jless' },
    { tool: 'fx', desc: 'Interactive JSON viewer (Node)', cat: 'json', cmd: 'npm install -g fx' },
    { tool: 'glow', desc: 'Markdown renderer', cat: 'markdown', cmd: 'brew install glow' },
    { tool: 'bat', desc: 'Syntax highlighting cat', cat: 'markdown', cmd: 'brew install bat' },
    { tool: 'delta', desc: 'Better diff tool', cat: 'diff', cmd: 'brew install git-delta' },
    { tool: 'lstr', desc: 'JSON tree viewer', cat: 'json', cmd: 'brew install lstr' },
    // { tool: 'playwright', desc: 'Headless browser', cat: 'core', cmd: 'npx playwright install' } // Handled internally mostly
];

export class DoctorService {
    static checkAll(): DoctorCheck[] {
        return TOOLS.map(t => {
            try {
                const path = execSync(`command -v ${t.tool}`, { stdio: 'pipe' }).toString().trim();
                return {
                    tool: t.tool,
                    description: t.desc,
                    installed: true,
                    path,
                    installCmd: t.cmd,
                    category: t.cat as any
                };
            } catch (e) {
                return {
                    tool: t.tool,
                    description: t.desc,
                    installed: false,
                    installCmd: t.cmd,
                    category: t.cat as any
                };
            }
        });
    }

    static async installMissing(checks: DoctorCheck[]): Promise<void> {
        const missing = checks.filter(c => !c.installed);
        if (missing.length === 0) {
            console.log(chalk.green('Everything is already installed!'));
            return;
        }

        console.log(chalk.yellow(`Attempting to install ${missing.length} missing tools...`));

        for (const check of missing) {
            console.log(chalk.cyan(`> Installing ${check.tool}...`));
            try {
                // Determine installer: brew or npm
                const cmdParts = check.installCmd.split(' ');
                const bin = cmdParts[0];
                const args = cmdParts.slice(1);

                const proc = spawnSync(bin, args, { stdio: 'inherit' });
                if (proc.status === 0) {
                    console.log(chalk.green(`[+] Installed ${check.tool}`));
                } else {
                    console.log(chalk.red(`[!] Failed to install ${check.tool}`));
                }
            } catch (e: any) {
                console.log(chalk.red(`[!] Error installing ${check.tool}: ${e.message}`));
            }
        }
    }
}
