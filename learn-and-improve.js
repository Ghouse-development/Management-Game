/**
 * 自動学習・改善スクリプト v1.0
 *
 * 設計原則（CLAUDE.mdより）:
 * 1. 成功パターンを学習
 * 2. ルールを絶対に守る
 * 3. 全てをシステム化・フラグ化
 * 4. 頭脳を使わずに計算
 */

const MGSimulation = require('./js/simulation-engine.js');
const PatternLearner = require('./js/pattern-learner.js');
const RuleEnforcer = require('./js/rule-enforcer.js');
const fs = require('fs');

// ============================================
// 設定（フラグ化）
// ============================================
const CONFIG = {
    ITERATIONS: parseInt(process.argv[2]) || 100,
    REPORT_INTERVAL: 10,
    QUIET_MODE: true,
    SAVE_INTERVAL: 10,
};

// ============================================
// ログ抑制
// ============================================
if (CONFIG.QUIET_MODE) {
    const originalLog = console.log;
    console.log = function(...args) {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('サイコロ')) return;
        originalLog.apply(console, args);
    };
}

// ============================================
// 統計追跡
// ============================================
const stats = {
    totalRuns: 0,
    wins: 0,
    totalEquity: 0,
    bestEquity: -Infinity,
    bestResult: null,
    equityHistory: [],
    winRateHistory: [],
};

// ============================================
// メイン学習ループ
// ============================================
function runLearningLoop() {
    console.log('========================================');
    console.log('【自動学習・改善システム】');
    console.log(`  設計原則: CLAUDE.mdに記載`);
    console.log(`  反復回数: ${CONFIG.ITERATIONS}回`);
    console.log('========================================\n');

    // 学習データをロード
    PatternLearner.load();

    for (let i = 0; i < CONFIG.ITERATIONS; i++) {
        // シミュレーション実行
        const result = MGSimulation.runSimulation({ allAI: true });

        // 結果から学習
        PatternLearner.learn(result);

        // 統計更新
        updateStats(result);

        // 定期レポート
        if ((i + 1) % CONFIG.REPORT_INTERVAL === 0) {
            printProgress(i + 1);
        }

        // 定期保存
        if ((i + 1) % CONFIG.SAVE_INTERVAL === 0) {
            PatternLearner.save();
        }
    }

    // 最終保存
    PatternLearner.save();

    // 最終レポート
    printFinalReport();
}

// ============================================
// 統計更新
// ============================================
// ★★★ allAIモードでのPLAYER戦略会社インデックス ★★★
// aiConfigs配列: 0=RESEARCH_FOCUSED, 1=SALES_FOCUSED, 2=LOW_CHIP, 3=BALANCED, 4=AGGRESSIVE, 5=PLAYER
const PLAYER_COMPANY_INDEX = 5;

function updateStats(result) {
    stats.totalRuns++;

    // ★★★ PLAYER戦略の会社を正しく追跡 ★★★
    const playerFinal = result.finalEquities?.find(c => c.companyIndex === PLAYER_COMPANY_INDEX);
    if (!playerFinal) return;

    const equity = playerFinal.equity;
    stats.totalEquity += equity;

    if (result.winner === PLAYER_COMPANY_INDEX) {
        stats.wins++;
    }

    if (equity > stats.bestEquity) {
        stats.bestEquity = equity;
        stats.bestResult = result;
    }

    stats.equityHistory.push(equity);
    stats.winRateHistory.push(stats.wins / stats.totalRuns);
}

// ============================================
// 進捗レポート
// ============================================
function printProgress(iteration) {
    const avgEquity = Math.round(stats.totalEquity / stats.totalRuns);
    const winRate = (stats.wins / stats.totalRuns * 100).toFixed(1);

    console.log(`[${iteration}/${CONFIG.ITERATIONS}] ` +
               `勝率: ${winRate}%, 平均: ¥${avgEquity}, 最高: ¥${stats.bestEquity}`);
}

// ============================================
// 最終レポート
// ============================================
function printFinalReport() {
    const avgEquity = Math.round(stats.totalEquity / stats.totalRuns);
    const winRate = (stats.wins / stats.totalRuns * 100).toFixed(1);

    console.log('\n========================================');
    console.log('【最終結果】');
    console.log('========================================');
    console.log(`  総実行回数: ${stats.totalRuns}回`);
    console.log(`  勝率: ${winRate}% (${stats.wins}勝)`);
    console.log(`  平均自己資本: ¥${avgEquity}`);
    console.log(`  最高自己資本: ¥${stats.bestEquity}`);

    // 学習統計
    PatternLearner.stats();

    // 最優秀結果の期別成績
    if (stats.bestResult) {
        console.log('\n【最優秀結果の期別成績】');
        for (const period of stats.bestResult.periods || []) {
            const player = period.periodEndResults?.find(c => c.companyIndex === 0);
            if (player) {
                console.log(`  ${period.period}期: 自己資本¥${player.equityAfter}, F¥${player.totalF}`);
            }
        }
    }

    console.log('\n========================================');
    console.log('【システム検証】');
    console.log('========================================');
    console.log(`  ルール定義: ${Object.keys(RuleEnforcer.RULES).length}カテゴリ`);
    console.log(`  期別行数: ${JSON.stringify(RuleEnforcer.RULES.PERIOD_ROWS)}`);
    console.log(`  勝利条件: 自己資本≧¥${RuleEnforcer.RULES.VICTORY.MIN_EQUITY}`);
}

// ============================================
// 実行
// ============================================
runLearningLoop();
