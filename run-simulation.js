#!/usr/bin/env node
/**
 * MG シミュレーション実行スクリプト
 *
 * 使用方法:
 *   node run-simulation.js              # 基本シミュレーション
 *   node run-simulation.js --optimize   # 遺伝的アルゴリズムで最適化
 *   node run-simulation.js --evaluate   # 全戦略評価
 *   node run-simulation.js --runs 100   # 100回シミュレーション
 */

// モジュール読み込み
const MGSimulation = require('./js/simulation-engine.js');
const ActionEvaluator = require('./js/action-evaluator.js');
const StrategyOptimizer = require('./js/strategy-optimizer.js');

// コマンドライン引数解析
const args = process.argv.slice(2);
const options = {
    optimize: args.includes('--optimize'),
    evaluate: args.includes('--evaluate'),
    runs: 10,
    verbose: args.includes('--verbose')
};

const runsIndex = args.indexOf('--runs');
if (runsIndex !== -1 && args[runsIndex + 1]) {
    options.runs = parseInt(args[runsIndex + 1]);
}

console.log('========================================');
console.log('  MG シミュレーションエンジン v1.0');
console.log('========================================\n');

// ============================================
// 基本シミュレーション
// ============================================
function runBasicSimulation() {
    console.log(`基本シミュレーション実行中 (${options.runs}回)...\n`);

    const { allResults, stats } = MGSimulation.runMultipleSimulations(options.runs);

    console.log('=== 統計結果 ===');
    console.log(`実行回数: ${stats.totalRuns}`);
    console.log(`目標達成率: ${stats.targetReachRate}%`);
    console.log(`平均勝者自己資本: ¥${stats.averageWinnerEquity}`);
    console.log('\n成績分布:');
    Object.entries(stats.equityDistribution).forEach(([grade, count]) => {
        const bar = '█'.repeat(Math.round(count / stats.totalRuns * 30));
        console.log(`  ${grade}: ${bar} (${count}回)`);
    });

    // 最良結果の詳細
    const bestResult = allResults.reduce((best, r) =>
        r.winner.equity > best.winner.equity ? r : best
    );

    console.log('\n=== 最良ゲーム結果 ===');
    console.log(`勝者: ${bestResult.winner.name}`);
    console.log(`自己資本: ¥${bestResult.winner.equity}`);
    console.log(`総売上: ¥${bestResult.winner.totalSales}`);
    console.log(`総販売数: ${bestResult.winner.totalSoldQuantity}個`);
    console.log(`総F: ¥${bestResult.winner.totalF}`);

    // 評価
    const evaluation = MGSimulation.evaluateResults(bestResult);
    console.log('\n=== 評価 ===');
    console.log(`目標達成者: ${evaluation.summary.targetReached}/${evaluation.summary.totalCompanies}社`);
    console.log(`平均自己資本: ¥${evaluation.summary.averageEquity}`);

    if (evaluation.insights.length > 0) {
        console.log('\nインサイト:');
        evaluation.insights.forEach(i => console.log(`  - ${i}`));
    }

    return allResults;
}

// ============================================
// 戦略最適化
// ============================================
function runOptimization() {
    console.log('遺伝的アルゴリズムによる戦略最適化を開始...\n');

    const result = StrategyOptimizer.optimizeWithGA({
        populationSize: 15,
        generations: 8,
        runsPerEval: 25
    });

    console.log('\n========================================');
    console.log('  最適化完了');
    console.log('========================================\n');

    console.log('=== 最良戦略 ===');
    const best = result.bestStrategy;
    console.log(`戦略名: ${best.name}`);
    console.log(`チップ: 研究${best.chips.research} 教育${best.chips.education} 広告${best.chips.advertising}`);
    console.log(`借入: ${best.loan.amount}円`);
    console.log(`機械: ${best.machine.upgrade ? `${best.machine.period}期にアップグレード` : 'アップグレードなし'}`);
    console.log(`販売: 最低価格${best.sales.minPrice}円, 目標チップ${best.sales.targetChips}枚`);

    if (best.results) {
        console.log('\n成績:');
        console.log(`  平均自己資本: ¥${best.results.avgEquity}`);
        console.log(`  目標達成率: ${best.results.targetReachRate}%`);
        console.log(`  勝率: ${best.results.winRate}%`);
        console.log(`  最高: ¥${best.results.maxEquity}`);
        console.log(`  最低: ¥${best.results.minEquity}`);
    }

    console.log('\n=== トップ5戦略 ===');
    result.topStrategies.forEach((s, i) => {
        console.log(`${i + 1}. ${s.name}`);
        if (s.results) {
            console.log(`   平均: ¥${s.results.avgEquity}, 達成率: ${s.results.targetReachRate}%`);
        }
    });

    return result;
}

// ============================================
// 全戦略評価
// ============================================
function runFullEvaluation() {
    console.log('全戦略評価を開始（時間がかかります）...\n');

    const results = StrategyOptimizer.evaluateAllStrategies(15);

    console.log('\n========================================');
    console.log('  評価完了');
    console.log('========================================\n');

    console.log('=== トップ20戦略 ===');
    results.slice(0, 20).forEach((r, i) => {
        console.log(`${(i + 1).toString().padStart(2)}. ${r.strategy.padEnd(40)} 平均¥${r.avgEquity} 達成${r.targetReachRate}%`);
    });

    console.log('\n=== ワースト5戦略 ===');
    results.slice(-5).reverse().forEach((r, i) => {
        console.log(`${i + 1}. ${r.strategy.padEnd(40)} 平均¥${r.avgEquity} 達成${r.targetReachRate}%`);
    });

    return results;
}

// ============================================
// 詳細ゲームログ出力
// ============================================
function runDetailedGame() {
    console.log('詳細ゲームシミュレーション...\n');

    const result = MGSimulation.runSimulation({ autoPlayer: true });

    console.log('=== 期別結果 ===');
    result.periods.forEach((period, i) => {
        console.log(`\n--- ${i + 2}期 ---`);
        console.log(`ターン数: ${period.turns.length}`);

        if (period.periodEndResults) {
            period.periodEndResults.forEach(r => {
                const company = result.finalEquities.find(e => e.companyIndex === r.companyIndex);
                console.log(`  ${company ? company.name : '会社' + r.companyIndex}: 人件費¥${r.wage} 減価償却¥${r.depreciation}`);
            });
        }
    });

    console.log('\n=== 最終順位 ===');
    result.finalEquities.forEach((e, i) => {
        const grade = MGSimulation.Evaluator.getGrade(e.equity);
        const target = e.reachedTarget ? '✓' : '✗';
        console.log(`${i + 1}位 ${e.name}: ¥${e.equity} [${grade}] ${target}`);
    });

    // 行動ログ（勝者のみ）
    if (options.verbose) {
        console.log('\n=== 勝者の行動ログ ===');
        const winnerLog = result.actionLogs.find(l => l.companyIndex === result.winner.companyIndex);
        if (winnerLog) {
            winnerLog.log.slice(0, 20).forEach(action => {
                console.log(`  [行${action.row}] ${action.action}: ${action.detail} (${action.isIncome ? '+' : '-'}¥${action.amount})`);
            });
            if (winnerLog.log.length > 20) {
                console.log(`  ... 他${winnerLog.log.length - 20}件`);
            }
        }
    }

    return result;
}

// ============================================
// メイン実行
// ============================================
console.log('オプション:', JSON.stringify(options, null, 2), '\n');

if (options.optimize) {
    runOptimization();
} else if (options.evaluate) {
    runFullEvaluation();
} else if (options.verbose) {
    runDetailedGame();
} else {
    runBasicSimulation();
}

console.log('\n========================================');
console.log('  シミュレーション完了');
console.log('========================================');
