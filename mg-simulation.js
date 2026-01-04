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
        // シミュレーションでは6社ともAI
        const result = this.engine.runSimulation({ allAI: true });
        const evaluation = this.engine.evaluateResults(result);

        console.log('【結果】');
        console.log('');
        evaluation.rankings.forEach(r => {
            const marker = r.rank === 1 ? ' <-- 優勝' : '';
            const target = r.reachedTarget ? ' (目標達成!)' : '';
            console.log(`  ${r.rank}位: ${r.name.padEnd(12)} ¥${r.equity}${target}${marker}`);
        });
        console.log('');

        // 優勝者の行動明細表を表示
        this.showActionStatement(result, evaluation.rankings[0].companyIndex);

        return { result, evaluation };
    }

    /**
     * 行動明細表を表示
     * 優勝者の各期・各行の行動を詳細に記録した表
     */
    showActionStatement(result, companyIndex) {
        const actionLog = result.actionLogs.find(l => l.companyIndex === companyIndex);
        if (!actionLog) return;

        const company = result.finalEquities.find(e => e.companyIndex === companyIndex);

        // 期別に分類
        const periodActions = { 2: [], 3: [], 4: [], 5: [] };
        const periodStats = {
            2: { sales: 0, soldQty: 0, f: 0, specialLoss: 0, endEquity: 0, periodStartActions: [] },
            3: { sales: 0, soldQty: 0, f: 0, specialLoss: 0, endEquity: 0, periodStartActions: [] },
            4: { sales: 0, soldQty: 0, f: 0, specialLoss: 0, endEquity: 0, periodStartActions: [] },
            5: { sales: 0, soldQty: 0, f: 0, specialLoss: 0, endEquity: 0, periodStartActions: [] }
        };

        // アクションを期別に分類し、統計を計算
        actionLog.log.forEach(action => {
            const period = action.period || 2;
            if (!periodActions[period]) return;

            periodActions[period].push(action);

            // 売上を集計
            if (action.action === '販売' && action.isIncome) {
                periodStats[period].sales += action.amount;
                // 販売数を抽出（例: "仙台に¥26×2個" → 2）
                const match = action.detail.match(/×(\d+)個/);
                if (match) {
                    periodStats[period].soldQty += parseInt(match[1]);
                }
            }

            // 期首処理を記録（type === '期首' の場合のみ）
            // ルール⑨: チップ購入は期首ではなく意思決定フェーズで行われる
            if (action.type === '期首') {
                periodStats[period].periodStartActions.push(action);
            }
        });

        // ===== 全期間サマリーテーブル =====
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('● 行動明細表');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log(`  最良ケース（${company.strategy || company.name}）`);
        console.log('');
        console.log('  | 期  | 売上   | 販売数 | F合計 | 特別損失 | 期末自己資本 |');
        console.log('  |-----|--------|--------|-------|----------|--------------|');

        // 期別サマリー行（データは期末処理から取得）
        for (const period of [2, 3, 4, 5]) {
            const periodEnd = periodActions[period].find(a => a.action === '期末処理');
            const stats = periodStats[period];

            // 期末処理から情報を抽出
            let fTotal = 0;
            let specialLoss = 0;
            if (periodEnd) {
                // 人件費と減価償却を抽出
                const personnelMatch = periodEnd.detail.match(/人件費(\d+)/);
                const depMatch = periodEnd.detail.match(/減価償却(\d+)/);
                if (personnelMatch) fTotal += parseInt(personnelMatch[1]);
                if (depMatch) fTotal += parseInt(depMatch[1]);
            }

            console.log(`  | ${period}期 | ¥${String(stats.sales).padStart(4)} | ${String(stats.soldQty).padStart(4)}個 | ¥${String(fTotal).padStart(3)} | ¥${String(specialLoss).padStart(6)} | ¥${String(company.equity).padStart(10)} |`);
        }
        console.log('');

        // ===== 各期の詳細 =====
        for (const period of [2, 3, 4, 5]) {
            const actions = periodActions[period];
            if (actions.length === 0) continue;

            const maxRows = { 2: 20, 3: 30, 4: 34, 5: 35 };

            console.log('---');
            console.log(`${period}期（全${maxRows[period]}行）`);
            console.log('');

            // 期首処理
            const periodStartActions = periodStats[period].periodStartActions;
            if (periodStartActions.length > 0) {
                console.log('  期首処理');
                console.log('');
                periodStartActions.forEach(a => {
                    console.log(`  - ${a.action}: ${a.detail}`);
                });
                console.log('');
            }

            // テーブルヘッダー
            console.log('  | 行  | 種別     | 行動                                    | 結果                       |');
            console.log('  |-----|----------|-----------------------------------------|----------------------------|');

            // 各行を出力
            let rowNum = 1;
            actions.forEach((a) => {
                // 期末処理は別扱い
                if (a.action === '期末処理') return;

                const type = (a.type || '意思決定').padEnd(8);

                // 行動の整形
                let actionText = '';
                if (a.action === 'リスクカード') {
                    actionText = a.detail;
                } else if (a.action === '販売失敗') {
                    actionText = `販売失敗(入札負け): ${a.detail.replace('入札に負け: ', '')}`;
                } else if (a.action === '販売' && a.isIncome) {
                    actionText = `販売成功: ${a.detail} = +¥${a.amount}`;
                } else if (a.action === '完成・投入') {
                    actionText = `生産: ${a.detail} = -¥${a.amount}`;
                } else if (a.action === '材料購入') {
                    actionText = `材料購入: ${a.detail} = -¥${a.amount}`;
                } else if (a.isIncome) {
                    actionText = `${a.action} = +¥${a.amount}`;
                } else if (a.amount > 0) {
                    actionText = `${a.action} = -¥${a.amount}`;
                } else {
                    actionText = a.detail || a.action;
                }
                actionText = actionText.substring(0, 39).padEnd(39);

                // 結果状態
                const state = a.state || { cash: 0, materials: 0, wip: 0, products: 0 };
                const resultText = `現金¥${String(state.cash).padStart(4)} 材料${state.materials} 仕掛${state.wip} 製品${state.products}`;

                console.log(`  | ${String(rowNum).padStart(3)} | ${type} | ${actionText} | ${resultText} |`);
                rowNum++;
            });

            console.log('');

            // F明細
            const periodEnd = actions.find(a => a.action === '期末処理');
            if (periodEnd) {
                console.log(`  ${period}期 F明細`);
                console.log('');
                console.log('  | 項目                        | 金額 |');
                console.log('  |-----------------------------|------|');

                // 期末処理の詳細から情報を抽出して表示
                const detail = periodEnd.detail;
                const personnelMatch = detail.match(/人件費(\d+)\(([^)]+)\)/);
                const depMatch = detail.match(/減価償却(\d+)/);
                const taxMatch = detail.match(/税(\d+)/);

                if (personnelMatch) {
                    console.log(`  | 人件費                      | ¥${personnelMatch[1].padStart(3)} |`);
                }
                if (depMatch) {
                    console.log(`  | 減価償却                    | ¥${depMatch[1].padStart(3)} |`);
                }

                let fTotal = 0;
                if (personnelMatch) fTotal += parseInt(personnelMatch[1]);
                if (depMatch) fTotal += parseInt(depMatch[1]);
                console.log(`  | F合計                       | ¥${String(fTotal).padStart(3)} |`);
                console.log('');
            }

            // 特別損失
            console.log(`  ${period}期 特別損失`);
            console.log('');
            const specialLossActions = actions.filter(a =>
                a.detail && (a.detail.includes('特別損失') || a.detail.includes('売却損'))
            );
            if (specialLossActions.length > 0) {
                console.log('  | 項目                              | 金額 |');
                console.log('  |-----------------------------------|------|');
                specialLossActions.forEach(a => {
                    console.log(`  | ${a.detail.padEnd(33)} | ¥${String(a.amount).padStart(3)} |`);
                });
            } else {
                console.log('  なし');
            }
            console.log('');
        }

        // ===== 全期間サマリー =====
        console.log('---');
        console.log('全期間サマリー');
        console.log('');
        console.log('  | 期   | 売上   | 販売数 | F合計  | 特別損失 | 期末自己資本 |');
        console.log('  |------|--------|--------|--------|----------|--------------|');

        let totalSales = 0;
        let totalSoldQty = 0;

        for (const period of [2, 3, 4, 5]) {
            const stats = periodStats[period];
            totalSales += stats.sales;
            totalSoldQty += stats.soldQty;

            const periodEnd = periodActions[period].find(a => a.action === '期末処理');
            let fTotal = 0;
            if (periodEnd) {
                const personnelMatch = periodEnd.detail.match(/人件費(\d+)/);
                const depMatch = periodEnd.detail.match(/減価償却(\d+)/);
                if (personnelMatch) fTotal += parseInt(personnelMatch[1]);
                if (depMatch) fTotal += parseInt(depMatch[1]);
            }

            console.log(`  | ${period}期  | ¥${String(stats.sales).padStart(4)} | ${String(stats.soldQty).padStart(4)}個 | ¥${String(fTotal).padStart(4)} | ¥${String(0).padStart(6)} | ¥${String(company.equity).padStart(10)} |`);
        }

        console.log(`  | 合計 | ¥${String(totalSales).padStart(4)} | ${String(totalSoldQty).padStart(4)}個 | -      | -        | -            |`);
        console.log('');
    }

    runMultiple(count) {
        // シミュレーションでは6社ともAI
        const { allResults, stats, bestResult } = this.engine.runMultipleSimulations(count, { allAI: true });

        console.log('');
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

        // 戦略別勝率（stats.strategyStatsから）
        if (stats.strategyStats) {
            console.log('  勝利回数:');
            const sorted = Object.entries(stats.strategyStats)
                .map(([strategy, s]) => ({ strategy, wins: s.wins }))
                .sort((a, b) => b.wins - a.wins);
            sorted.forEach(({ strategy, wins }) => {
                const pct = (wins / count * 100).toFixed(1);
                // 戦略名を日本語に変換
                const nameMap = {
                    'RESEARCH_FOCUSED': '研究商事',
                    'SALES_FOCUSED': '販売産業',
                    'LOW_CHIP': '堅実工業',
                    'BALANCED': 'バランス物産',
                    'AGGRESSIVE': '積極製作所',
                    'PLAYER': 'プレイヤー型'
                };
                const name = nameMap[strategy] || strategy;
                console.log(`    ${name}: ${wins}回 (${pct}%)`);
            });
            console.log('');
        }

        // 最優秀パターン（最高自己資本）の行動明細を表示
        console.log('========================================');
        console.log(`【最優秀パターン】勝者: ${bestResult.winner.name} 自己資本: ¥${bestResult.winner.equity}`);
        console.log('========================================');

        this.showActionStatement(bestResult, bestResult.winner.companyIndex);

        // 学習データを保存
        this.saveLearnedStrategies(stats, bestResult);

        return { allResults, stats };
    }

    /**
     * シミュレーション結果から学習し、戦略を保存
     * @param {Object} stats - 統計情報（strategyStatsを含む）
     * @param {Object} bestResult - 最優秀パターン
     */
    saveLearnedStrategies(stats, bestResult) {
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

        // 統計を更新（実行回数分を追加）
        learned.totalSimulations += stats.totalRuns;
        learned.lastUpdated = new Date().toISOString();

        // 戦略統計を更新（stats.strategyStatsから）
        if (stats.strategyStats) {
            for (const [strategy, s] of Object.entries(stats.strategyStats)) {
                if (!learned.strategyStats[strategy]) {
                    learned.strategyStats[strategy] = {
                        totalGames: 0,
                        totalWins: 0,
                        winRate: 0,
                        avgEquity: 0,
                        maxEquity: 0
                    };
                }

                const ls = learned.strategyStats[strategy];
                const oldGames = ls.totalGames;
                ls.totalGames += s.games;
                ls.totalWins += s.wins;
                ls.winRate = Math.round((ls.totalWins / ls.totalGames) * 1000) / 10;
                // 平均自己資本の加重平均
                const newAvgEquity = Math.round(s.totalEquity / s.games);
                ls.avgEquity = Math.round((ls.avgEquity * oldGames + newAvgEquity * s.games) / ls.totalGames);
                ls.maxEquity = Math.max(ls.maxEquity, s.maxEquity);
            }
        }

        // 最高自己資本のパターンを記録
        if (bestResult && bestResult.winner.equity > 0) {
            learned.bestPatterns.push({
                equity: bestResult.winner.equity,
                strategy: bestResult.winner.strategy || 'PLAYER',
                name: bestResult.winner.name,
                date: new Date().toISOString().split('T')[0]
            });
            learned.bestPatterns.sort((a, b) => b.equity - a.equity);
            learned.bestPatterns = learned.bestPatterns.slice(0, 10);
        }

        // インサイトを生成（全戦略を含む）
        const winRates = Object.entries(learned.strategyStats)
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
