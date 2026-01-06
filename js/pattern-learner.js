/**
 * 成功パターン学習システム v1.0
 *
 * 機能:
 * 1. シミュレーション結果から成功パターンを抽出
 * 2. 状態ごとの最適行動を記録
 * 3. 学習したパターンをPLAYER戦略に適用
 *
 * 設計原則:
 * - 全てのルールはフラグ/定数で管理
 * - 判断は全てコードで自動化
 * - 人間の頭脳を使わずに計算
 */

const fs = require('fs');
const path = require('path');

const PatternLearner = (function() {
    'use strict';

    // ============================================
    // 定数・フラグ（システム化）
    // ============================================
    const CONFIG = {
        DATA_PATH: path.join(__dirname, '..', 'data', 'learned-patterns.json'),
        SUCCESS_THRESHOLD: 0,        // 成功とみなす最低自己資本
        TOP_PATTERNS_COUNT: 100,     // 保存する上位パターン数
        MIN_SAMPLES_FOR_LEARNING: 10, // 学習に必要な最低サンプル数
        PATTERN_WEIGHT_DECAY: 0.99,   // 古いパターンの重み減衰
    };

    // ============================================
    // 状態エンコーダー（フラグベース）
    // ============================================
    const StateFlags = {
        // 現金レベル
        CASH_LOW: 100,
        CASH_MID: 200,

        // 製品レベル
        PRODUCTS_MIN: 2,

        // 研究チップレベル
        RESEARCH_HIGH: 3,

        /**
         * 会社の状態をフラグベースでエンコード
         */
        encode(company, gameState) {
            const period = gameState.period;
            const maxRows = { 2: 20, 3: 30, 4: 34, 5: 35 };
            const progress = company.currentRow / maxRows[period];

            // フラグベースの状態計算
            const flags = {
                period: period,
                phase: progress < 0.33 ? 'E' : (progress < 0.66 ? 'M' : 'L'),
                cashLevel: company.cash < this.CASH_LOW ? 'L' :
                          (company.cash < this.CASH_MID ? 'M' : 'H'),
                hasProducts: company.products >= this.PRODUCTS_MIN,
                canProduce: company.materials > 0 || company.wip > 0,
                hasResearch: (company.chips?.research || 0) >= this.RESEARCH_HIGH,
            };

            // 状態キー生成
            return `${flags.period}${flags.phase}_${flags.cashLevel}_` +
                   `${flags.hasProducts ? 'Y' : 'N'}${flags.canProduce ? 'Y' : 'N'}_` +
                   `${flags.hasResearch ? 'H' : 'L'}`;
        }
    };

    // ============================================
    // パターン記録システム
    // ============================================
    const PatternStore = {
        data: null,

        /**
         * データファイルを読み込み
         */
        load() {
            try {
                const content = fs.readFileSync(CONFIG.DATA_PATH, 'utf8');
                this.data = JSON.parse(content);
            } catch (e) {
                this.data = this.createEmpty();
            }
            return this.data;
        },

        /**
         * 空のデータ構造を作成
         */
        createEmpty() {
            return {
                version: '1.0',
                lastUpdated: new Date().toISOString(),
                totalSimulations: 0,
                successCount: 0,
                stateActionValues: {},    // 状態→行動→価値
                successPatterns: [],       // 成功したゲームの行動パターン
                periodStats: {             // 期別統計
                    2: { avgEquity: 0, bestEquity: -Infinity, samples: 0 },
                    3: { avgEquity: 0, bestEquity: -Infinity, samples: 0 },
                    4: { avgEquity: 0, bestEquity: -Infinity, samples: 0 },
                    5: { avgEquity: 0, bestEquity: -Infinity, samples: 0 },
                }
            };
        },

        /**
         * データを保存
         */
        save() {
            this.data.lastUpdated = new Date().toISOString();
            fs.writeFileSync(CONFIG.DATA_PATH, JSON.stringify(this.data, null, 2));
        },

        /**
         * 状態-行動の価値を更新
         */
        updateStateAction(stateKey, actionType, reward) {
            if (!this.data.stateActionValues[stateKey]) {
                this.data.stateActionValues[stateKey] = {};
            }
            if (!this.data.stateActionValues[stateKey][actionType]) {
                this.data.stateActionValues[stateKey][actionType] = {
                    totalReward: 0,
                    count: 0,
                    avgReward: 0
                };
            }

            const entry = this.data.stateActionValues[stateKey][actionType];
            entry.totalReward += reward;
            entry.count++;
            entry.avgReward = entry.totalReward / entry.count;
        },

        /**
         * 状態での最適行動を取得
         */
        getBestAction(stateKey) {
            const actions = this.data.stateActionValues[stateKey];
            if (!actions) return null;

            let bestAction = null;
            let bestValue = -Infinity;

            for (const [actionType, data] of Object.entries(actions)) {
                if (data.count >= CONFIG.MIN_SAMPLES_FOR_LEARNING &&
                    data.avgReward > bestValue) {
                    bestValue = data.avgReward;
                    bestAction = actionType;
                }
            }

            return bestAction;
        }
    };

    // ============================================
    // 学習エンジン
    // ============================================
    const LearningEngine = {
        /**
         * シミュレーション結果から学習
         */
        learnFromResult(result) {
            PatternStore.load();

            // ★★★ PLAYER戦略を使用している会社を特定 ★★★
            // allAIモード: company 5 = "プレイヤー型" (PLAYER戦略)
            // 通常モード: company 0 = プレイヤー (PLAYER戦略)
            const playerCompanyIndex = result.strategies?.findIndex(s => s === 'PLAYER') ?? 0;

            // PLAYERの結果を取得
            const playerFinal = result.finalEquities?.find(c => c.companyIndex === playerCompanyIndex);
            if (!playerFinal) return;

            const finalEquity = playerFinal.equity;
            PatternStore.data.totalSimulations++;

            // 成功判定
            const isSuccess = finalEquity >= CONFIG.SUCCESS_THRESHOLD;
            if (isSuccess) {
                PatternStore.data.successCount++;
            }

            // 行動ログから学習
            const playerLogs = result.actionLogs?.find(a => a.companyIndex === playerCompanyIndex);
            if (playerLogs && playerLogs.log) {
                this.learnFromActions(playerLogs.log, finalEquity, result);
            }

            // 成功パターンを保存
            if (isSuccess && playerLogs) {
                this.saveSuccessPattern(playerLogs.log, finalEquity, result);
            }

            PatternStore.save();
        },

        /**
         * 行動ログから状態-行動価値を学習
         */
        learnFromActions(actionLog, finalEquity, result) {
            // 期別に行動を分類
            const periodActions = { 2: [], 3: [], 4: [], 5: [] };
            let currentPeriod = 2;

            for (const entry of actionLog) {
                // 期の変更を検出
                if (entry.action === '期首' && entry.detail) {
                    const match = entry.detail.match(/サイコロ(\d)/);
                    if (match) {
                        currentPeriod = Math.min(5, currentPeriod + 1);
                    }
                }

                if (currentPeriod >= 2 && currentPeriod <= 5) {
                    periodActions[currentPeriod].push(entry);
                }
            }

            // 期末の自己資本を取得
            const periodEquities = {};
            for (const period of result.periods || []) {
                const playerPeriod = period.periodEndResults?.find(c => c.companyIndex === 0);
                if (playerPeriod) {
                    periodEquities[period.period] = playerPeriod.equityAfter;
                }
            }

            // 各期の行動に報酬を割り当て
            for (const [period, actions] of Object.entries(periodActions)) {
                const periodNum = parseInt(period);
                const equity = periodEquities[periodNum] || 0;

                // 期別統計を更新
                const stats = PatternStore.data.periodStats[periodNum];
                if (stats) {
                    stats.samples++;
                    stats.avgEquity = ((stats.avgEquity * (stats.samples - 1)) + equity) / stats.samples;
                    if (equity > stats.bestEquity) {
                        stats.bestEquity = equity;
                    }
                }

                // 行動ごとの価値を更新
                for (const action of actions) {
                    if (action.action && !action.action.includes('リスクカード')) {
                        const actionType = this.normalizeActionType(action.action);
                        const stateKey = `P${periodNum}_${actionType}`;
                        const reward = equity;
                        PatternStore.updateStateAction(stateKey, actionType, reward);
                    }
                }
            }
        },

        /**
         * 行動タイプを正規化
         */
        normalizeActionType(action) {
            if (action.includes('チップ購入')) return 'BUY_CHIP';
            if (action.includes('材料購入')) return 'BUY_MATERIALS';
            if (action.includes('販売')) return 'SELL';
            if (action.includes('完成') || action.includes('投入')) return 'PRODUCE';
            if (action.includes('採用')) return 'HIRE';
            if (action.includes('機械購入')) return 'BUY_MACHINE';
            if (action.includes('機械売却')) return 'SELL_MACHINE';
            if (action.includes('様子見')) return 'DO_NOTHING';
            return 'OTHER';
        },

        /**
         * 成功パターンを保存
         */
        saveSuccessPattern(actionLog, finalEquity, result) {
            const pattern = {
                date: new Date().toISOString(),
                equity: finalEquity,
                actions: actionLog.map(a => ({
                    action: a.action,
                    detail: a.detail,
                    amount: a.amount
                })),
                periodEquities: {}
            };

            for (const period of result.periods || []) {
                const playerPeriod = period.periodEndResults?.find(c => c.companyIndex === 0);
                if (playerPeriod) {
                    pattern.periodEquities[period.period] = playerPeriod.equityAfter;
                }
            }

            PatternStore.data.successPatterns.push(pattern);
            PatternStore.data.successPatterns.sort((a, b) => b.equity - a.equity);
            PatternStore.data.successPatterns =
                PatternStore.data.successPatterns.slice(0, CONFIG.TOP_PATTERNS_COUNT);
        }
    };

    // ============================================
    // 行動推薦システム
    // ============================================
    const ActionRecommender = {
        /**
         * 状態に基づいて推薦行動を取得
         */
        getRecommendedAction(company, gameState) {
            PatternStore.load();

            const stateKey = StateFlags.encode(company, gameState);
            const bestAction = PatternStore.getBestAction(stateKey);

            if (bestAction) {
                return {
                    actionType: bestAction,
                    confidence: this.getConfidence(stateKey, bestAction)
                };
            }

            return null;
        },

        /**
         * 行動の信頼度を計算
         */
        getConfidence(stateKey, actionType) {
            const actions = PatternStore.data.stateActionValues[stateKey];
            if (!actions || !actions[actionType]) return 0;

            const data = actions[actionType];
            // サンプル数と平均報酬に基づく信頼度
            const sampleConfidence = Math.min(1, data.count / 100);
            const rewardConfidence = data.avgReward > 0 ? 1 : 0.5;

            return sampleConfidence * rewardConfidence;
        }
    };

    // ============================================
    // 統計レポート
    // ============================================
    const Reporter = {
        /**
         * 学習統計を表示
         */
        printStats() {
            PatternStore.load();
            const data = PatternStore.data;

            console.log('\n========================================');
            console.log('【成功パターン学習統計】');
            console.log('========================================');
            console.log(`  総シミュレーション: ${data.totalSimulations}回`);
            console.log(`  成功回数: ${data.successCount}回`);
            console.log(`  成功率: ${(data.successCount / data.totalSimulations * 100).toFixed(1)}%`);

            console.log('\n【期別統計】');
            for (const [period, stats] of Object.entries(data.periodStats)) {
                if (stats.samples > 0) {
                    console.log(`  ${period}期: 平均¥${Math.round(stats.avgEquity)}, ` +
                               `最高¥${stats.bestEquity}, サンプル${stats.samples}`);
                }
            }

            console.log('\n【学習済み状態数】');
            console.log(`  ${Object.keys(data.stateActionValues).length}状態`);

            console.log('\n【上位成功パターン】');
            data.successPatterns.slice(0, 5).forEach((p, i) => {
                console.log(`  ${i+1}位: ¥${p.equity} (${p.date.split('T')[0]})`);
            });
        }
    };

    // ============================================
    // 公開API
    // ============================================
    return {
        CONFIG,
        StateFlags,
        PatternStore,
        LearningEngine,
        ActionRecommender,
        Reporter,

        // 便利メソッド
        learn: (result) => LearningEngine.learnFromResult(result),
        recommend: (company, gameState) => ActionRecommender.getRecommendedAction(company, gameState),
        stats: () => Reporter.printStats(),
        load: () => PatternStore.load(),
        save: () => PatternStore.save()
    };
})();

module.exports = PatternLearner;
