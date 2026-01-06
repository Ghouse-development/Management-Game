const MGSimulation = require('./js/simulation-engine.js');
const fs = require('fs');

// サイコロログを抑制
const originalLog = console.log;
console.log = function(...args) {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('サイコロ')) return;
    originalLog.apply(console, args);
};

// 100回シミュレーションして最優秀結果を表示
let bestResult = null;
let bestEquity = -Infinity;
const runs = 100;
let winCount = 0;
let totalEquity = 0;

console.log(`${runs}回シミュレーション実行中...`);

for (let i = 0; i < runs; i++) {
    const result = MGSimulation.runSimulation({ allAI: true, quiet: true });

    // PLAYERの最終自己資本を取得（finalEquitiesから）
    const playerFinal = result.finalEquities?.find(c => c.companyIndex === 0);
    if (playerFinal && playerFinal.equity !== undefined) {
        totalEquity += playerFinal.equity;
        if (result.winner === 0) winCount++;

        if (playerFinal.equity > bestEquity) {
            bestEquity = playerFinal.equity;
            bestResult = result;
        }
    }
}

const avgEquity = Math.round(totalEquity / runs);
const winRate = (winCount / runs * 100).toFixed(1);

console.log(`\n========================================`);
console.log(`【統計】${runs}回実行`);
console.log(`  勝率: ${winRate}% (${winCount}勝)`);
console.log(`  平均自己資本: ¥${avgEquity}`);
console.log(`  最高自己資本: ¥${bestEquity}`);
console.log(`========================================\n`);

// 最優秀結果の詳細を表示
if (bestResult) {
    // PLAYERのactionLogを取得
    const playerLogs = bestResult.actionLogs.find(a => a.companyIndex === 0);

    if (playerLogs && playerLogs.log) {
        console.log('=== PLAYERの全行動ログ ===\n');

        let currentPeriod = 2;
        console.log(`--- ${currentPeriod}期 ---`);

        playerLogs.log.forEach((entry, idx) => {
            // 期の変更を検出
            if (entry.action && entry.action.includes('期首') && entry.detail) {
                const match = entry.detail.match(/サイコロ(\d)/);
                if (match) {
                    currentPeriod = parseInt(match[1]) + 2; // サイコロは3期以降
                    console.log(`\n--- ${currentPeriod}期 ---`);
                }
            }

            const amountStr = entry.amount ? ` (¥${entry.amount})` : '';
            console.log(`  [${idx}] ${entry.action}: ${entry.detail || ''}${amountStr}`);
        });
    }

    // 期別結果
    console.log('\n=== 期別結果 ===\n');
    bestResult.periods.forEach(p => {
        const playerPeriod = p.periodEndResults?.find(c => c.companyIndex === 0);
        if (playerPeriod) {
            console.log(`${p.period}期: 自己資本¥${playerPeriod.equityAfter}, F合計¥${playerPeriod.totalF}, 人件費¥${playerPeriod.wage}`);
        }
    });

    // 最終順位（finalEquitiesから構築）
    console.log('\n=== 最終順位 ===\n');
    const rankings = bestResult.finalEquities
        .sort((a, b) => b.equity - a.equity);

    rankings.forEach((c, i) => {
        const mark = c.companyIndex === 0 ? ' ★' : '';
        console.log(`  ${i+1}位: ¥${c.equity} (${c.strategy})${mark}`);
    });

    // 成功パターンを保存
    if (bestEquity > 0) {
        const successPattern = {
            date: new Date().toISOString(),
            equity: bestEquity,
            actions: playerLogs?.log || [],
            periodResults: bestResult.periods.map(p => ({
                period: p.period,
                equity: p.periodEndResults?.find(c => c.companyIndex === 0)?.equityAfter
            }))
        };

        // 既存のパターンを読み込んで追加
        let patterns = [];
        try {
            const existing = fs.readFileSync('./data/success-patterns.json', 'utf8');
            patterns = JSON.parse(existing).patterns || [];
        } catch (e) {}

        patterns.push(successPattern);
        patterns.sort((a, b) => b.equity - a.equity);
        patterns = patterns.slice(0, 10); // 上位10件のみ保持

        fs.writeFileSync('./data/success-patterns.json', JSON.stringify({
            version: '1.0',
            lastUpdated: new Date().toISOString(),
            bestEquity: patterns[0]?.equity || 0,
            patterns: patterns
        }, null, 2));

        console.log(`\n成功パターンを保存しました (¥${bestEquity})`);
    }
}
