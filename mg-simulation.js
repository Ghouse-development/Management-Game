/**
 * MG (Management Game) 統一シミュレーションエンジン
 *
 * !! 重要 !!
 * このファイルは全ルール（73項目）を100%遵守するための仕組みを持つ
 * シミュレーション実行前に自動でルール検証を行い、
 * 1つでも未実装・不整合があれば実行を拒否する
 *
 * 使用方法:
 *   node mg-simulation.js          # 1回実行
 *   node mg-simulation.js 100      # 100回実行
 *   node mg-simulation.js --skip-verify  # 検証スキップ（非推奨）
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ============================================
// ルール検証システム（強制実行）
// ============================================
class RuleEnforcer {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.checklistPath = path.join(__dirname, 'rules', 'rules-checklist.json');
        this.testPath = path.join(__dirname, 'tests', 'rule-tests.js');
        this.enginePath = path.join(__dirname, 'js', 'simulation-engine.js');
        // 注: ルール定義は enginePath のみ（Single Source of Truth）
    }

    /**
     * 全ての検証を実行
     * @returns {boolean} 全て成功したらtrue
     */
    enforceAll() {
        console.log('');
        console.log('========================================');
        console.log('  MG ルール強制検証システム');
        console.log('  (1つでも失敗するとシミュレーション不可)');
        console.log('========================================');
        console.log('');

        const checks = [
            { name: '1. 必須ファイル存在確認', fn: () => this.checkRequiredFiles() },
            { name: '2. チェックリスト100%確認', fn: () => this.verifyChecklist() },
            { name: '3. ルール定義整合性確認', fn: () => this.verifyRuleConsistency() },
            { name: '4. ルールテスト実行', fn: () => this.runRuleTests() },
        ];

        let allPassed = true;

        for (const check of checks) {
            process.stdout.write(`${check.name}... `);
            try {
                const result = check.fn();
                if (result) {
                    console.log('OK');
                } else {
                    console.log('NG');
                    allPassed = false;
                }
            } catch (e) {
                console.log(`NG (${e.message})`);
                this.errors.push(`${check.name}: ${e.message}`);
                allPassed = false;
            }
        }

        console.log('');

        if (!allPassed) {
            console.log('========================================');
            console.log('  !! 検証失敗 - シミュレーション実行不可 !!');
            console.log('========================================');
            console.log('');
            console.log('エラー内容:');
            this.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
            console.log('');
            console.log('修正してから再実行してください。');
            return false;
        }

        console.log('========================================');
        console.log('  全検証パス - シミュレーション実行可能');
        console.log('========================================');
        console.log('');

        return true;
    }

    /**
     * 必須ファイルの存在確認
     */
    checkRequiredFiles() {
        const requiredFiles = [
            { path: this.checklistPath, name: 'rules-checklist.json (チェックリスト)' },
            { path: this.testPath, name: 'rule-tests.js (テスト)' },
            { path: this.enginePath, name: 'simulation-engine.js (唯一のルール定義)' }
        ];

        for (const file of requiredFiles) {
            if (!fs.existsSync(file.path)) {
                this.errors.push(`必須ファイル不在: ${file.name}`);
                return false;
            }
        }

        return true;
    }

    /**
     * チェックリストが100%実装済みか確認
     */
    verifyChecklist() {
        try {
            const checklist = JSON.parse(fs.readFileSync(this.checklistPath, 'utf8'));
            let total = 0;
            let implemented = 0;
            const notImplemented = [];

            for (const [categoryId, category] of Object.entries(checklist.categories)) {
                for (const rule of category.rules) {
                    total++;
                    if (rule.implemented) {
                        implemented++;
                    } else {
                        notImplemented.push(`${rule.id}: ${rule.rule}`);
                    }
                }
            }

            if (notImplemented.length > 0) {
                this.errors.push(`未実装ルール ${notImplemented.length}件: ${notImplemented.slice(0, 3).join(', ')}${notImplemented.length > 3 ? '...' : ''}`);
                return false;
            }

            return true;
        } catch (e) {
            this.errors.push(`チェックリスト読み込み失敗: ${e.message}`);
            return false;
        }
    }

    /**
     * ルール定義の整合性確認
     * ルール定義は js/simulation-engine.js のみ（Single Source of Truth）
     * チェックリストとテストで検証する
     */
    verifyRuleConsistency() {
        try {
            const engine = require(this.enginePath);

            // 唯一のルール定義が存在することを確認
            if (!engine.RULES) {
                this.errors.push('ルール定義(RULES)が存在しない');
                return false;
            }

            // 主要定数の存在確認
            const requiredRules = [
                { path: 'PARENT.BONUS', name: '親ボーナス' },
                { path: 'MAX_ROWS', name: '期別行数' },
                { path: 'VICTORY.TARGET_EQUITY', name: '目標自己資本' },
                { path: 'TARGET_PRICES', name: '研究チップ別価格' },
                { path: 'LOAN.LONG_TERM_RATE', name: '長期金利' },
                { path: 'LOAN.SHORT_TERM_RATE', name: '短期金利' },
                { path: 'MARKETS', name: '市場情報' },
                { path: 'CAPACITY', name: '在庫容量' }
            ];

            for (const rule of requiredRules) {
                const parts = rule.path.split('.');
                let obj = engine.RULES;
                for (const part of parts) {
                    obj = obj?.[part];
                }
                if (obj === undefined) {
                    this.errors.push(`ルール未定義: ${rule.name} (${rule.path})`);
                    return false;
                }
            }

            return true;
        } catch (e) {
            this.errors.push(`ルール整合性確認失敗: ${e.message}`);
            return false;
        }
    }

    /**
     * ルールテストを実行
     */
    runRuleTests() {
        try {
            // テストを同期的に実行
            const result = spawnSync('node', [this.testPath], {
                cwd: __dirname,
                encoding: 'utf8',
                timeout: 60000
            });

            if (result.status !== 0) {
                // テスト失敗の詳細を抽出
                const output = result.stdout || '';
                const failMatch = output.match(/(\d+)件失敗/);
                if (failMatch) {
                    this.errors.push(`ルールテスト失敗: ${failMatch[1]}件のテストが不合格`);
                } else {
                    this.errors.push(`ルールテスト実行エラー`);
                }
                return false;
            }

            return true;
        } catch (e) {
            this.errors.push(`テスト実行失敗: ${e.message}`);
            return false;
        }
    }
}

// ============================================
// シミュレーション実行
// ============================================
class SimulationManager {
    constructor() {
        this.engine = null;
    }

    loadEngine() {
        const enginePath = path.join(__dirname, 'js', 'simulation-engine.js');
        this.engine = require(enginePath);
    }

    run(count = 1) {
        if (!this.engine) {
            this.loadEngine();
        }

        console.log(`シミュレーション実行: ${count}回`);
        console.log('');

        if (count === 1) {
            return this.runSingle();
        } else {
            return this.runMultiple(count);
        }
    }

    runSingle() {
        const result = this.engine.runSimulation({ autoPlayer: true });
        const evaluation = this.engine.evaluateResults(result);

        console.log('【結果】');
        console.log('');
        evaluation.rankings.forEach(r => {
            const marker = r.rank === 1 ? ' <-- 優勝' : '';
            const target = r.reachedTarget ? ' (目標達成!)' : '';
            console.log(`  ${r.rank}位: ${r.name.padEnd(12)} ¥${r.equity}${target}${marker}`);
        });
        console.log('');

        // 優勝者の行動明細を表示
        this.showActionDetails(result, evaluation.rankings[0].companyIndex);

        return { result, evaluation };
    }

    /**
     * 行動明細を表示
     */
    showActionDetails(result, companyIndex) {
        const actionLog = result.actionLogs.find(l => l.companyIndex === companyIndex);
        if (!actionLog) return;

        const company = result.finalEquities.find(e => e.companyIndex === companyIndex);
        console.log('========================================');
        console.log(`【${company.name}の行動明細】`);
        console.log('========================================');

        // 期別に分類
        const periodActions = { 2: [], 3: [], 4: [], 5: [] };
        let currentPeriod = 2;

        actionLog.log.forEach(action => {
            if (action.action === '期末処理') {
                currentPeriod++;
            }
            if (periodActions[Math.min(currentPeriod, 5)]) {
                periodActions[Math.min(currentPeriod, 5)].push(action);
            }
        });

        for (const period of [2, 3, 4, 5]) {
            const actions = periodActions[period];
            if (actions.length === 0) continue;

            console.log(`\n【${period}期】`);
            console.log('-'.repeat(40));

            actions.forEach((a, i) => {
                const sign = a.isIncome ? '+' : '-';
                const amount = a.amount > 0 ? ` ${sign}¥${a.amount}` : '';
                console.log(`  ${String(i + 1).padStart(2)}. ${a.action}: ${a.detail}${amount}`);
            });
        }
        console.log('');
    }

    runMultiple(count) {
        const { allResults, stats } = this.engine.runMultipleSimulations(count, { autoPlayer: true });

        console.log('【統計結果】');
        console.log('');
        console.log(`  実行回数: ${stats.totalRuns}回`);
        console.log(`  目標達成率: ${stats.targetReachRate}%`);
        console.log(`  平均勝者自己資本: ¥${stats.averageWinnerEquity}`);
        console.log('');
        console.log('  グレード分布:');
        for (const [grade, cnt] of Object.entries(stats.equityDistribution)) {
            if (cnt > 0) {
                const bar = '*'.repeat(Math.ceil(cnt / 5));
                console.log(`    ${grade}: ${cnt}回 ${bar}`);
            }
        }
        console.log('');

        // 勝者分析
        const winnerCounts = {};
        allResults.forEach(r => {
            const name = r.winner.name;
            winnerCounts[name] = (winnerCounts[name] || 0) + 1;
        });

        console.log('  勝利回数:');
        const sorted = Object.entries(winnerCounts).sort((a, b) => b[1] - a[1]);
        sorted.forEach(([name, wins]) => {
            const pct = (wins / count * 100).toFixed(1);
            console.log(`    ${name}: ${wins}回 (${pct}%)`);
        });
        console.log('');

        // 最優秀パターン（最高自己資本）の行動明細を表示
        let bestResult = allResults[0];
        let bestEquity = allResults[0].winner.equity;
        allResults.forEach(r => {
            if (r.winner.equity > bestEquity) {
                bestEquity = r.winner.equity;
                bestResult = r;
            }
        });

        console.log('========================================');
        console.log(`【最優秀パターン】勝者: ${bestResult.winner.name} 自己資本: ¥${bestResult.winner.equity}`);
        console.log('========================================');

        this.showActionDetails(bestResult, bestResult.winner.companyIndex);

        // 学習データを保存
        this.saveLearnedStrategies(allResults, stats);

        return { allResults, stats };
    }

    /**
     * シミュレーション結果から学習し、戦略を保存
     */
    saveLearnedStrategies(allResults, stats) {
        const learnedPath = path.join(__dirname, 'data', 'learned-strategies.json');

        // 既存の学習データを読み込み
        let learned = {
            version: '1.0',
            lastUpdated: new Date().toISOString(),
            totalSimulations: 0,
            strategyStats: {},
            bestPatterns: [],
            insights: []
        };

        if (fs.existsSync(learnedPath)) {
            try {
                learned = JSON.parse(fs.readFileSync(learnedPath, 'utf8'));
            } catch (e) {
                // 読み込み失敗時は新規作成
            }
        }

        // 統計を更新
        learned.totalSimulations += allResults.length;
        learned.lastUpdated = new Date().toISOString();

        // 戦略別の勝率を計算
        const strategyWins = {};
        const strategyEquities = {};
        const strategyGames = {};

        allResults.forEach(result => {
            result.finalEquities.forEach((company, idx) => {
                const strategy = company.strategy || 'PLAYER';
                strategyGames[strategy] = (strategyGames[strategy] || 0) + 1;
                strategyEquities[strategy] = strategyEquities[strategy] || [];
                strategyEquities[strategy].push(company.equity);

                if (company.equity === result.winner.equity) {
                    strategyWins[strategy] = (strategyWins[strategy] || 0) + 1;
                }
            });
        });

        // 戦略統計を更新
        for (const strategy of Object.keys(strategyGames)) {
            const wins = strategyWins[strategy] || 0;
            const games = strategyGames[strategy];
            const equities = strategyEquities[strategy];
            const avgEquity = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
            const maxEquity = Math.max(...equities);

            if (!learned.strategyStats[strategy]) {
                learned.strategyStats[strategy] = {
                    totalGames: 0,
                    totalWins: 0,
                    winRate: 0,
                    avgEquity: 0,
                    maxEquity: 0
                };
            }

            const s = learned.strategyStats[strategy];
            s.totalGames += games;
            s.totalWins += wins;
            s.winRate = Math.round((s.totalWins / s.totalGames) * 1000) / 10;
            s.avgEquity = Math.round((s.avgEquity * (s.totalGames - games) + avgEquity * games) / s.totalGames);
            s.maxEquity = Math.max(s.maxEquity, maxEquity);
        }

        // 最高自己資本のパターンを記録（上位5つ）
        const bestResult = allResults.reduce((best, r) =>
            r.winner.equity > best.winner.equity ? r : best
        );

        if (bestResult.winner.equity > 0) {
            learned.bestPatterns.push({
                equity: bestResult.winner.equity,
                strategy: bestResult.winner.strategy || 'PLAYER',
                name: bestResult.winner.name,
                date: new Date().toISOString().split('T')[0]
            });
            learned.bestPatterns.sort((a, b) => b.equity - a.equity);
            learned.bestPatterns = learned.bestPatterns.slice(0, 10);
        }

        // インサイトを生成
        const winRates = Object.entries(learned.strategyStats)
            .filter(([k]) => k !== 'PLAYER')
            .sort((a, b) => b[1].winRate - a[1].winRate);

        if (winRates.length > 0) {
            learned.insights = [
                `最強戦略: ${winRates[0][0]} (勝率${winRates[0][1].winRate}%)`,
                `平均自己資本最高: ${winRates.sort((a, b) => b[1].avgEquity - a[1].avgEquity)[0][0]}`,
                `総シミュレーション回数: ${learned.totalSimulations}回`
            ];
        }

        // 保存
        fs.writeFileSync(learnedPath, JSON.stringify(learned, null, 2));

        console.log('');
        console.log('========================================');
        console.log('【AI学習結果】');
        console.log('========================================');
        console.log(`  累計シミュレーション: ${learned.totalSimulations}回`);
        console.log('');
        console.log('  戦略別勝率:');
        Object.entries(learned.strategyStats)
            .filter(([k]) => k !== 'PLAYER')
            .sort((a, b) => b[1].winRate - a[1].winRate)
            .forEach(([name, s]) => {
                console.log(`    ${name}: ${s.winRate}% (平均¥${s.avgEquity}, 最高¥${s.maxEquity})`);
            });
        console.log('');
        console.log(`  学習データ保存: data/learned-strategies.json`);
    }
}

// ============================================
// メイン実行
// ============================================
function main() {
    const args = process.argv.slice(2);
    const skipVerify = args.includes('--skip-verify');
    const countArg = args.find(a => !a.startsWith('--'));
    const count = countArg ? parseInt(countArg, 10) : 1;

    if (isNaN(count) || count < 1) {
        console.error('エラー: 実行回数は1以上の整数を指定してください');
        process.exit(1);
    }

    // ルール強制検証（スキップ非推奨）
    if (!skipVerify) {
        const enforcer = new RuleEnforcer();
        const passed = enforcer.enforceAll();

        if (!passed) {
            console.log('');
            console.log('ヒント: 検証をスキップするには --skip-verify オプションを使用');
            console.log('       (ルール違反の可能性があるため非推奨)');
            console.log('');
            process.exit(1);
        }
    } else {
        console.log('');
        console.log('!! 警告: ルール検証をスキップしています !!');
        console.log('!! ルール違反のシミュレーション結果になる可能性があります !!');
        console.log('');
    }

    // シミュレーション実行
    const manager = new SimulationManager();
    manager.run(count);
}

// 実行
main();
