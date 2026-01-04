/**
 * インテリジェント学習システム v2.0
 *
 * 修正点:
 * 1. 会社ごとに行動履歴を分離（混入バグ修正）
 * 2. 状態空間を簡略化（学習効率向上）
 * 3. 期首・期末・リスクカードの学習対応
 * 4. ゲームセッション管理の明確化
 */

const IntelligentLearning = (function() {
    'use strict';

    // ============================================
    // 状態エンコーダー v2.0
    // 状態空間を大幅に簡略化（約500状態に削減）
    // ============================================
    const StateEncoder = {
        /**
         * 現在の状態をキーに変換（簡略化版）
         * 状態数を削減して学習効率を上げる
         */
        encode(company, gameState) {
            const period = gameState.period;

            // 行の進捗を3段階に簡略化（序盤/中盤/終盤）
            const maxRows = { 2: 20, 3: 30, 4: 34, 5: 35 };
            const progress = company.currentRow / maxRows[period];
            const phase = progress < 0.33 ? 'E' : (progress < 0.66 ? 'M' : 'L');

            // 現金を3段階に簡略化
            const cashLevel = company.cash < 100 ? 'L' : (company.cash < 200 ? 'M' : 'H');

            // 製品の有無（販売可能かどうか）
            const hasProducts = company.products >= 2 ? 'Y' : 'N';

            // 材料+仕掛品の有無（生産可能かどうか）
            const canProduce = (company.materials > 0 || company.wip > 0) ? 'Y' : 'N';

            // 研究チップ（0-2, 3-5）
            const researchLevel = (company.chips.research || 0) >= 3 ? 'H' : 'L';

            // 約 4期 × 3進捗 × 3現金 × 2製品 × 2生産可能 × 2研究 = 288状態
            return `${period}${phase}_${cashLevel}_${hasProducts}${canProduce}_${researchLevel}`;
        },

        /**
         * 詳細状態（デバッグ用）
         */
        encodeDetailed(company, gameState) {
            return {
                period: gameState.period,
                row: company.currentRow,
                cash: company.cash,
                materials: company.materials,
                wip: company.wip,
                products: company.products,
                researchChips: company.chips.research || 0
            };
        }
    };

    // ============================================
    // 行動価値テーブル (Q-Table) v2.0
    // ============================================
    const QTable = {
        data: {},
        learningRate: 0.15,      // 学習率を上げて収束を早める
        discountFactor: 0.95,    // 将来の報酬を重視
        explorationRate: 0.25,   // 探索率
        totalUpdates: 0,
        totalSimulations: 0,     // 累積シミュレーション回数

        getValue(stateKey, actionType) {
            if (!this.data[stateKey]) return 0;
            if (!this.data[stateKey][actionType]) return 0;
            return this.data[stateKey][actionType].value;
        },

        update(stateKey, actionType, reward, nextStateMaxValue = 0) {
            if (!this.data[stateKey]) {
                this.data[stateKey] = {};
            }
            if (!this.data[stateKey][actionType]) {
                this.data[stateKey][actionType] = { value: 0, count: 0 };
            }

            const current = this.data[stateKey][actionType];

            // Q-learning更新式
            const target = reward + this.discountFactor * nextStateMaxValue;
            current.value = current.value + this.learningRate * (target - current.value);
            current.count++;
            this.totalUpdates++;
        },

        getMaxValue(stateKey) {
            if (!this.data[stateKey]) return 0;
            let maxVal = -Infinity;
            for (const actionType of Object.keys(this.data[stateKey])) {
                maxVal = Math.max(maxVal, this.data[stateKey][actionType].value);
            }
            return maxVal === -Infinity ? 0 : maxVal;
        },

        getBestAction(stateKey) {
            if (!this.data[stateKey]) return null;
            let bestAction = null;
            let bestValue = -Infinity;
            for (const [actionType, data] of Object.entries(this.data[stateKey])) {
                if (data.value > bestValue) {
                    bestValue = data.value;
                    bestAction = actionType;
                }
            }
            return bestAction;
        },

        /**
         * シミュレーション完了時に呼び出し、探索率を調整
         * 累積シミュレーション回数に基づいて計算
         */
        onSimulationComplete() {
            this.totalSimulations++;
            // 1000回ごとに探索率を2%下げる（最小5%）
            this.explorationRate = Math.max(0.05, 0.30 - Math.floor(this.totalSimulations / 1000) * 0.02);
        },

        reset() {
            this.data = {};
            this.totalUpdates = 0;
            this.totalSimulations = 0;
        }
    };

    // ============================================
    // 会社別行動履歴トラッカー v2.0
    // 各会社の履歴を分離して管理
    // ============================================
    const CompanyTrackers = {
        // 会社インデックス → エピソード配列
        trackers: {},

        /**
         * ゲーム開始時に全会社のトラッカーを初期化
         */
        initGame(companyCount = 6) {
            this.trackers = {};
            for (let i = 0; i < companyCount; i++) {
                this.trackers[i] = [];
            }
        },

        /**
         * 特定会社の行動を記録
         */
        record(companyIndex, stateKey, actionType, immediateReward) {
            if (!this.trackers[companyIndex]) {
                this.trackers[companyIndex] = [];
            }
            this.trackers[companyIndex].push({
                stateKey,
                actionType,
                immediateReward
            });
        },

        /**
         * 特定会社のゲーム終了時に学習
         */
        learnFromGame(companyIndex, initialEquity, finalEquity, rank) {
            const episodes = this.trackers[companyIndex];
            if (!episodes || episodes.length === 0) return;

            // 報酬計算
            const equityChange = finalEquity - initialEquity;
            const rankBonus = (7 - rank) * 30;  // 1位:180, 6位:30
            const targetBonus = finalEquity >= 450 ? 200 : 0;  // 目標達成ボーナス
            const finalReward = (equityChange + rankBonus + targetBonus) * 0.01;

            // 逆順に報酬を伝播
            let futureReward = finalReward;
            for (let i = episodes.length - 1; i >= 0; i--) {
                const ep = episodes[i];
                const totalReward = ep.immediateReward + futureReward;

                const nextMaxValue = (i < episodes.length - 1)
                    ? QTable.getMaxValue(episodes[i + 1].stateKey)
                    : 0;

                QTable.update(ep.stateKey, ep.actionType, totalReward, nextMaxValue);

                futureReward = QTable.discountFactor * futureReward;
            }

            // この会社のエピソードをクリア
            this.trackers[companyIndex] = [];
        },

        /**
         * 全クリア
         */
        clearAll() {
            this.trackers = {};
        },

        /**
         * 統計情報
         */
        getStats() {
            let totalEpisodes = 0;
            for (const idx in this.trackers) {
                totalEpisodes += this.trackers[idx].length;
            }
            return { totalEpisodes, companyCount: Object.keys(this.trackers).length };
        }
    };

    // ============================================
    // 行動選択エンジン v2.0
    // ============================================
    const ActionSelector = {
        selectAction(actions, company, gameState) {
            if (actions.length === 0) {
                return { type: 'DO_NOTHING', score: 0, detail: '何もしない' };
            }

            const stateKey = StateEncoder.encode(company, gameState);

            // 探索 vs 活用
            if (Math.random() < QTable.explorationRate) {
                // 探索: ランダム選択（ただしスコアで重み付け）
                return this.selectWeightedRandom(actions);
            } else {
                // 活用: Q値に基づいて選択
                return this.selectBestAction(actions, stateKey);
            }
        },

        selectBestAction(actions, stateKey) {
            let bestAction = actions[0];
            let bestValue = -Infinity;

            for (const action of actions) {
                const qValue = QTable.getValue(stateKey, action.type);
                // 基本スコア（ヒューリスティック）+ Q値（学習）
                const totalValue = action.score * 0.5 + qValue * 0.5;

                if (totalValue > bestValue) {
                    bestValue = totalValue;
                    bestAction = action;
                }
            }

            return bestAction;
        },

        selectWeightedRandom(actions) {
            const minScore = Math.min(...actions.map(a => a.score));
            const weights = actions.map(a => Math.max(1, a.score - minScore + 1));
            const totalWeight = weights.reduce((sum, w) => sum + w, 0);

            let random = Math.random() * totalWeight;
            for (let i = 0; i < actions.length; i++) {
                random -= weights[i];
                if (random <= 0) return actions[i];
            }
            return actions[actions.length - 1];
        },

        /**
         * 行動の即時報酬を計算
         */
        calculateReward(company, action, result) {
            if (!action) return 0;

            switch (action.type) {
                case 'SELL':
                    if (result && result.consumedRow !== false) {
                        // 販売成功: 売上額に比例した報酬
                        return (action.price || 0) * (action.quantity || 0) * 0.05;
                    } else {
                        // 入札負け: ペナルティ
                        return -3;
                    }

                case 'BUY_MATERIALS':
                    // 材料購入: 小さな正の報酬（生産につながる）
                    return (action.quantity || 0) * 1;

                case 'PRODUCE':
                    // 生産: 完成品数に比例した報酬
                    return (action.wipToProduct || 0) * 3;

                case 'BUY_CHIP':
                    // チップ購入: 研究チップは高報酬
                    return action.chipType === 'research' ? 8 : 4;

                case 'HIRE_WORKER':
                case 'HIRE_SALESMAN':
                    return (action.count || 0) * 2;

                case 'BUY_LARGE_MACHINE':
                    return 10;

                case 'DO_NOTHING':
                    // 何もしない: 小さなペナルティ（行動を促す）
                    return -1;

                default:
                    return 0;
            }
        }
    };

    // ============================================
    // 永続化 v2.0
    // ============================================
    const Persistence = {
        dataPath: 'data/q-learning-data.json',

        save() {
            try {
                if (typeof require !== 'undefined') {
                    const fs = require('fs');
                    const path = require('path');

                    const dir = path.dirname(this.dataPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    const data = {
                        version: '2.1',
                        lastUpdated: new Date().toISOString(),
                        explorationRate: QTable.explorationRate,
                        totalUpdates: QTable.totalUpdates,
                        totalSimulations: QTable.totalSimulations,
                        stateCount: Object.keys(QTable.data).length,
                        qTable: QTable.data
                    };

                    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
                    return true;
                }
            } catch (e) {
                console.error('Q学習データ保存エラー:', e.message);
            }
            return false;
        },

        load() {
            try {
                if (typeof require !== 'undefined') {
                    const fs = require('fs');
                    if (fs.existsSync(this.dataPath)) {
                        const content = fs.readFileSync(this.dataPath, 'utf-8');
                        const data = JSON.parse(content);

                        // バージョンチェック（v2.0以上のみ対応）
                        if (!data.version || !data.version.startsWith('2.')) {
                            console.log('Q学習データを最新形式にリセット');
                            QTable.reset();
                            return false;
                        }

                        QTable.data = data.qTable || {};
                        QTable.explorationRate = data.explorationRate || 0.25;
                        QTable.totalUpdates = data.totalUpdates || 0;
                        QTable.totalSimulations = data.totalSimulations || 0;
                        return true;
                    }
                }
            } catch (e) {
                console.error('Q学習データ読み込みエラー:', e.message);
            }
            return false;
        },

        getStatistics() {
            const stateCount = Object.keys(QTable.data).length;
            let totalActions = 0;
            let avgValue = 0;
            let bestState = null;
            let bestValue = -Infinity;

            for (const stateKey of Object.keys(QTable.data)) {
                for (const [actionType, data] of Object.entries(QTable.data[stateKey])) {
                    totalActions++;
                    avgValue += data.value;
                    if (data.value > bestValue) {
                        bestValue = data.value;
                        bestState = { state: stateKey, action: actionType, value: data.value };
                    }
                }
            }

            return {
                stateCount,
                totalActions,
                totalUpdates: QTable.totalUpdates,
                avgValue: totalActions > 0 ? (avgValue / totalActions).toFixed(2) : 0,
                explorationRate: QTable.explorationRate,
                bestState
            };
        }
    };

    // ============================================
    // 公開API v2.0
    // ============================================
    return {
        StateEncoder,
        QTable,
        CompanyTrackers,
        ActionSelector,
        Persistence,

        /**
         * 初期化（シミュレーション開始時）
         */
        init() {
            Persistence.load();
        },

        /**
         * ゲーム開始時（6社のトラッカー初期化）
         */
        startGame(companyCount = 6) {
            CompanyTrackers.initGame(companyCount);
        },

        /**
         * 行動を選択
         */
        selectAction(actions, company, gameState) {
            return ActionSelector.selectAction(actions, company, gameState);
        },

        /**
         * 行動を記録（会社ごとに分離）
         */
        recordAction(company, gameState, action, result) {
            if (!action) return;
            const stateKey = StateEncoder.encode(company, gameState);
            const reward = ActionSelector.calculateReward(company, action, result);
            CompanyTrackers.record(company.index, stateKey, action.type, reward);
        },

        /**
         * リスクカード結果を記録
         */
        recordRiskCard(company, gameState, cardEffect, cashChange) {
            const stateKey = StateEncoder.encode(company, gameState);
            const reward = cashChange * 0.02;  // 現金変化に比例した報酬
            CompanyTrackers.record(company.index, stateKey, 'RISK_CARD', reward);
        },

        /**
         * ゲーム終了時に各社の学習を実行
         */
        learnFromGame(company, initialEquity, finalEquity, rank) {
            CompanyTrackers.learnFromGame(company.index, initialEquity, finalEquity, rank);
        },

        /**
         * 保存
         */
        save() {
            return Persistence.save();
        },

        /**
         * シミュレーション完了を通知（探索率を自動調整）
         */
        onSimulationComplete() {
            QTable.onSimulationComplete();
        },

        /**
         * 累積シミュレーション回数を取得
         */
        getTotalSimulations() {
            return QTable.totalSimulations;
        },

        /**
         * 統計情報を取得
         */
        getStats() {
            return Persistence.getStatistics();
        },

        /**
         * 全データリセット
         */
        reset() {
            QTable.reset();
            CompanyTrackers.clearAll();
        }
    };
})();

// Node.js/ブラウザ両対応エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IntelligentLearning;
}
if (typeof window !== 'undefined') {
    window.IntelligentLearning = IntelligentLearning;
}
