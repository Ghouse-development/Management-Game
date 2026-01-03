#!/usr/bin/env node
/**
 * MG 10,000回シミュレーション - 各AI戦略別詳細分析
 *
 * 毎期毎行の行動を記録し、各戦略の最適行動パターンを抽出
 */

const MGSimulation = require('./js/simulation-engine.js');

console.log('========================================');
console.log('  MG 10,000回シミュレーション');
console.log('  6社AI競争（2期〜5期）');
console.log('========================================\n');

const RUNS = 10000;

// 各戦略タイプの結果を格納
const strategyResults = {
    RESEARCH_FOCUSED: { equities: [], wins: [], details: [], bestRun: null, maxEquity: -Infinity },
    SALES_FOCUSED: { equities: [], wins: [], details: [], bestRun: null, maxEquity: -Infinity },
    LOW_CHIP: { equities: [], wins: [], details: [], bestRun: null, maxEquity: -Infinity },
    BALANCED: { equities: [], wins: [], details: [], bestRun: null, maxEquity: -Infinity },
    AGGRESSIVE: { equities: [], wins: [], details: [], bestRun: null, maxEquity: -Infinity },
    PLAYER: { equities: [], wins: [], details: [], bestRun: null, maxEquity: -Infinity }
};

// 戦略タイプ名とインデックスのマッピング
const strategyNames = ['PLAYER', 'RESEARCH_FOCUSED', 'SALES_FOCUSED', 'LOW_CHIP', 'BALANCED', 'AGGRESSIVE'];
const companyNames = ['あなた', '研究商事', '販売産業', '堅実工業', 'バランス物産', '積極製作所'];

console.log('シミュレーション実行中...\n');

for (let run = 0; run < RUNS; run++) {
    if (run % 1000 === 0) {
        process.stdout.write(`  ${run}/${RUNS} 完了\r`);
    }

    const result = runFullGame();

    // 各会社の結果を記録
    for (let i = 0; i < 6; i++) {
        const strategyKey = strategyNames[i];
        const companyResult = result.companies[i];

        strategyResults[strategyKey].equities.push(companyResult.equity);
        strategyResults[strategyKey].wins.push(companyResult.isWinner ? 1 : 0);

        // 最良ケースを記録
        if (companyResult.equity > strategyResults[strategyKey].maxEquity) {
            strategyResults[strategyKey].maxEquity = companyResult.equity;
            strategyResults[strategyKey].bestRun = {
                equity: companyResult.equity,
                log: companyResult.log,
                totalSales: companyResult.totalSales,
                totalSold: companyResult.totalSold,
                periodSummaries: companyResult.periodSummaries
            };
        }
    }
}

console.log(`\n${RUNS}/${RUNS} 完了\n`);

// 統計計算
console.log('========================================');
console.log('  戦略別統計');
console.log('========================================\n');

const stats = {};
for (const [strategy, data] of Object.entries(strategyResults)) {
    const equities = data.equities.sort((a, b) => a - b);
    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / RUNS);
    const median = equities[Math.floor(RUNS / 2)];
    const max = equities[RUNS - 1];
    const min = equities[0];
    const targetReached = equities.filter(e => e >= 450).length;
    const wins = data.wins.reduce((a, b) => a + b, 0);

    stats[strategy] = { avg, median, max, min, targetReached, wins };

    const strategyName = MGSimulation.RULES.AI_STRATEGIES[strategy]?.name || 'プレイヤー';
    console.log(`【${strategyName}】`);
    console.log(`  平均自己資本: ¥${avg}`);
    console.log(`  中央値: ¥${median}`);
    console.log(`  最大: ¥${max} / 最小: ¥${min}`);
    console.log(`  目標達成率: ${Math.round(targetReached / RUNS * 100)}% (${targetReached}/${RUNS})`);
    console.log(`  勝率: ${Math.round(wins / RUNS * 100)}%\n`);
}

// 戦略ランキング
console.log('========================================');
console.log('  戦略ランキング（平均自己資本順）');
console.log('========================================\n');

const ranking = Object.entries(stats)
    .sort((a, b) => b[1].avg - a[1].avg);

ranking.forEach(([strategy, s], index) => {
    const name = MGSimulation.RULES.AI_STRATEGIES[strategy]?.name || 'プレイヤー';
    console.log(`${index + 1}位: ${name}`);
    console.log(`    平均¥${s.avg} / 達成率${Math.round(s.targetReached / RUNS * 100)}% / 勝率${Math.round(s.wins / RUNS * 100)}%`);
});

// 各戦略の最良ケース詳細
console.log('\n========================================');
console.log('  各戦略の最良ケース詳細');
console.log('========================================');

for (const [strategy, data] of Object.entries(strategyResults)) {
    if (!data.bestRun) continue;

    const strategyName = MGSimulation.RULES.AI_STRATEGIES[strategy]?.name || 'プレイヤー（デフォルト戦略）';
    console.log(`\n--- ${strategyName} （最大自己資本 ¥${data.maxEquity}）---\n`);

    // 期別サマリー
    if (data.bestRun.periodSummaries) {
        data.bestRun.periodSummaries.forEach(ps => {
            console.log(`【${ps.period}期】`);
            console.log(`  チップ: 研究${ps.chips.research} 教育${ps.chips.education} 広告${ps.chips.advertising}`);
            console.log(`  行動: ${ps.actions.join(', ')}`);
            console.log(`  期末: 現金¥${ps.endCash} 在庫${ps.endInventory}個 自己資本¥${ps.endEquity}`);
        });
    }

    console.log(`\n  総売上: ¥${data.bestRun.totalSales}`);
    console.log(`  総販売数: ${data.bestRun.totalSold}個`);
}

// 結果をJSONファイルに保存
const fs = require('fs');
const outputData = {
    timestamp: new Date().toISOString(),
    runs: RUNS,
    statistics: stats,
    ranking: ranking.map(([s, d]) => ({
        strategy: s,
        name: MGSimulation.RULES.AI_STRATEGIES[s]?.name || 'プレイヤー',
        ...d
    })),
    bestCases: {}
};

for (const [strategy, data] of Object.entries(strategyResults)) {
    if (data.bestRun) {
        outputData.bestCases[strategy] = {
            maxEquity: data.maxEquity,
            periodSummaries: data.bestRun.periodSummaries,
            totalSales: data.bestRun.totalSales,
            totalSold: data.bestRun.totalSold
        };
    }
}

fs.writeFileSync('simulation-results-10k.json', JSON.stringify(outputData, null, 2));
console.log('\n結果を simulation-results-10k.json に保存しました。');

console.log('\n========================================');
console.log('  分析完了');
console.log('========================================');

// ============================================
// ゲーム実行関数
// ============================================
function runFullGame() {
    const gameState = new MGSimulation.GameState();
    gameState.initCompanies();

    // プレイヤーにもデフォルト戦略を設定
    gameState.companies[0].strategy = MGSimulation.RULES.AI_STRATEGIES.BALANCED;
    gameState.companies[0].strategyType = 'BALANCED';

    const companyLogs = gameState.companies.map(() => []);
    const periodSummaries = gameState.companies.map(() => []);

    for (let period = 2; period <= 5; period++) {
        gameState.period = period;

        // 各会社の期首状態を記録
        gameState.companies.forEach((company, idx) => {
            const summary = {
                period,
                chips: { ...company.chips },
                actions: [],
                startCash: company.cash,
                startInventory: company.materials + company.wip + company.products
            };
            periodSummaries[idx].push(summary);
        });

        // 期首: 借入
        gameState.companies.forEach((company, idx) => {
            const equityBefore = company.calculateEquity(period);
            const limit = MGSimulation.RULES.getLoanLimit(period, equityBefore);
            const available = limit - company.longTermLoan;
            if (available > 0) {
                MGSimulation.ActionEngine.borrowLongTerm(company, available, period, equityBefore);
                companyLogs[idx].push(`${period}期 期首借入: ¥${available}`);
            }
        });

        // 期首: チップ購入（AI判断）
        gameState.companies.forEach((company, idx) => {
            if (!company.isPlayer) {
                const chipAction = MGSimulation.AIDecisionEngine.evaluateChipPurchase(company, gameState);
                if (chipAction) {
                    MGSimulation.SimulationRunner.executeAction(company, chipAction, gameState);
                    const ps = periodSummaries[idx][periodSummaries[idx].length - 1];
                    ps.actions.push(`チップ購入(${chipAction.chipType})`);
                    ps.chips = { ...company.chips };
                }
            }
        });

        // 機械アップグレード判断（戦略のupgradePeriodに従う）
        gameState.companies.forEach((company, idx) => {
            const upgradePeriod = company.strategy?.upgradePeriod || 0;
            if (period === upgradePeriod && company.machines[0]?.type === 'small') {
                // 小型機械売却
                const bookValue = MGSimulation.RULES.BOOK_VALUE.SMALL[period] || 90;
                const salePrice = Math.floor(bookValue * 0.7);
                company.cash += salePrice;
                company.totalSpecialLoss += bookValue - salePrice;
                company.machines = [];
                companyLogs[idx].push(`${period}期 小型機械売却 +¥${salePrice}`);

                const ps = periodSummaries[idx][periodSummaries[idx].length - 1];
                ps.actions.push('小型売却');

                // 大型機械購入
                if (company.cash >= 200) {
                    company.cash -= 200;
                    company.machines.push({ type: 'large', attachments: 0 });
                    companyLogs[idx].push(`${period}期 大型機械購入 -¥200`);
                    ps.actions.push('大型購入');
                }
            }
        });

        // ターン実行
        const maxRows = MGSimulation.RULES.MAX_ROWS[period];

        while (gameState.companies.some(c => c.currentRow < maxRows)) {
            for (const company of gameState.companies) {
                if (company.currentRow >= maxRows) continue;

                const idx = company.index;
                const ps = periodSummaries[idx][periodSummaries[idx].length - 1];

                // リスクカード判定
                if (Math.random() < MGSimulation.RULES.RISK_PROBABILITY) {
                    MGSimulation.SimulationRunner.processRiskCard(company, gameState);
                    ps.actions.push('リスク');
                } else {
                    // 通常行動
                    const action = MGSimulation.AIDecisionEngine.decideAction(company, gameState);
                    if (action && action.type !== 'DO_NOTHING') {
                        MGSimulation.SimulationRunner.executeAction(company, action, gameState);

                        // 行動記録
                        let actionDesc = action.type;
                        if (action.type === 'SELL') {
                            actionDesc = `販売${action.quantity}個@¥${action.price}`;
                        } else if (action.type === 'BUY_MATERIALS') {
                            actionDesc = `材料${action.quantity}個`;
                        } else if (action.type === 'PRODUCE') {
                            actionDesc = '生産';
                        }
                        ps.actions.push(actionDesc);
                    }
                }

                company.currentRow++;
            }
        }

        // 期末処理
        MGSimulation.PeriodEndEngine.process(gameState);

        // 期末状態を記録
        gameState.companies.forEach((company, idx) => {
            const ps = periodSummaries[idx][periodSummaries[idx].length - 1];
            ps.endCash = company.cash;
            ps.endInventory = company.materials + company.wip + company.products;
            ps.endEquity = company.calculateEquity(period);
        });

        // 次期準備
        gameState.companies.forEach(c => c.currentRow = 1);
    }

    // 最終結果
    const finalEquities = gameState.companies.map(c => c.calculateEquity(5));
    const maxEquity = Math.max(...finalEquities);
    const winnerIdx = finalEquities.indexOf(maxEquity);

    return {
        companies: gameState.companies.map((c, idx) => ({
            name: c.name,
            strategy: strategyNames[idx],
            equity: finalEquities[idx],
            isWinner: idx === winnerIdx,
            totalSales: c.totalSales,
            totalSold: c.totalSoldQuantity,
            log: companyLogs[idx],
            periodSummaries: periodSummaries[idx]
        }))
    };
}
