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

            // ★★★ 成功パターンから推奨行動を取得 ★★★
            const successPattern = SuccessPatterns.getBestPattern(stateKey);
            const patternActions = successPattern ? successPattern.actionSequence : [];

            // ★★★ 勝利条件達成パターンを優先的に参照 ★★★
            const victoryPatterns = SuccessPatterns.getVictoryPatterns();
            const victoryActions = victoryPatterns.length > 0
                ? victoryPatterns.flatMap(p => p.actionSequence)
                : [];

            for (const action of actions) {
                const qValue = QTable.getValue(stateKey, action.type);

                // ★★★ 成功パターンに含まれる行動にボーナス ★★★
                let patternBonus = 0;
                if (patternActions.includes(action.type)) {
                    patternBonus = 50 + (successPattern.equityGain > 0 ? 30 : 0);

                    // ★★★ 勝利条件達成パターンからの行動には追加ボーナス ★★★
                    if (successPattern.victoryData) {
                        if (successPattern.victoryData.meetsInventory) patternBonus += 40;
                        if (successPattern.victoryData.meetsChips) patternBonus += 20;
                        if (successPattern.victoryData.isVictory) patternBonus += 100;
                    }
                }

                // ★★★ 勝利達成パターンに頻出する行動にもボーナス ★★★
                const victoryActionCount = victoryActions.filter(a => a === action.type).length;
                const victoryBonus = Math.min(victoryActionCount * 5, 50);

                // 基本スコア（35%）+ Q値（35%）+ パターンボーナス（20%）+ 勝利ボーナス（10%）
                const totalValue = action.score * 0.35 + qValue * 0.35 + patternBonus * 0.2 + victoryBonus * 0.1;

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
    // 失敗パターン記録 v1.0
    // 失敗した行動パターンを永続的に記録して学習
    // ============================================
    const FailurePatterns = {
        dataPath: 'data/failure-patterns.json',
        patterns: [],
        maxPatterns: 1000,  // 最大記録数

        /**
         * 失敗パターンを記録
         * @param {string} stateKey - 状態キー
         * @param {string} actionType - 行動タイプ
         * @param {number} equityLoss - 自己資本減少額
         * @param {string} reason - 失敗理由
         */
        record(stateKey, actionType, equityLoss, reason) {
            this.patterns.push({
                stateKey,
                actionType,
                equityLoss,
                reason,
                timestamp: new Date().toISOString()
            });

            // 上限を超えたら古いパターンを削除
            if (this.patterns.length > this.maxPatterns) {
                this.patterns.shift();
            }

            // 即座に保存
            this.save();
        },

        /**
         * 特定状態での失敗パターンを取得
         */
        getFailures(stateKey) {
            return this.patterns.filter(p => p.stateKey === stateKey);
        },

        /**
         * 特定行動の失敗率を計算
         */
        getFailureRate(stateKey, actionType) {
            const failures = this.patterns.filter(p =>
                p.stateKey === stateKey && p.actionType === actionType
            );
            return failures.length;
        },

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
                        version: '1.0',
                        lastUpdated: new Date().toISOString(),
                        totalFailures: this.patterns.length,
                        patterns: this.patterns
                    };

                    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
                    return true;
                }
            } catch (e) {
                // サイレント
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
                        this.patterns = data.patterns || [];
                        return true;
                    }
                }
            } catch (e) {
                // サイレント
            }
            return false;
        }
    };

    // ============================================
    // 成功パターン記録 v2.0
    // 高収益・勝利条件達成パターンを永続的に記録
    // ============================================
    const SuccessPatterns = {
        dataPath: 'data/success-patterns.json',
        patterns: [],
        maxPatterns: 500,

        /**
         * 成功パターンを記録（勝利条件対応版）
         * @param {string} stateKey - 状態キー
         * @param {Array} actionSequence - 行動シーケンス
         * @param {number} equityGain - 自己資本変化
         * @param {number} rank - 順位
         * @param {Object} victoryData - 勝利条件データ（オプション）
         */
        record(stateKey, actionSequence, equityGain, rank, victoryData = null) {
            // 勝利条件スコアを計算（達成度に応じたボーナス）
            let victoryScore = 0;
            if (victoryData) {
                // 在庫10個達成: +1000
                if (victoryData.inventory >= 10) victoryScore += 1000;
                // チップ3枚達成: +500
                if (victoryData.chips >= 3) victoryScore += 500;
                // 自己資本450達成: +2000
                if (victoryData.equity >= 450) victoryScore += 2000;
                // 1位: +300
                if (rank === 1) victoryScore += 300;
            }

            // 既存の同じパターンがあれば更新
            const existing = this.patterns.find(p =>
                p.stateKey === stateKey && JSON.stringify(p.actionSequence) === JSON.stringify(actionSequence)
            );

            // 総合スコア = 自己資本変化 + 勝利条件スコア
            const totalScore = equityGain + victoryScore;

            if (existing) {
                const existingScore = existing.equityGain + (existing.victoryScore || 0);
                if (totalScore > existingScore) {
                    existing.equityGain = equityGain;
                    existing.rank = rank;
                    existing.victoryScore = victoryScore;
                    existing.victoryData = victoryData;
                    existing.count++;
                    existing.lastUpdated = new Date().toISOString();
                }
            } else {
                this.patterns.push({
                    stateKey,
                    actionSequence,
                    equityGain,
                    rank,
                    victoryScore,
                    victoryData,
                    count: 1,
                    timestamp: new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                });
            }

            // 上限を超えたら低スコアパターンを削除（勝利条件スコア考慮）
            if (this.patterns.length > this.maxPatterns) {
                this.patterns.sort((a, b) => {
                    const scoreA = a.equityGain + (a.victoryScore || 0);
                    const scoreB = b.equityGain + (b.victoryScore || 0);
                    return scoreB - scoreA;
                });
                this.patterns = this.patterns.slice(0, this.maxPatterns);
            }

            this.save();
        },

        /**
         * 状態に対する最良パターンを取得（勝利条件考慮）
         */
        getBestPattern(stateKey) {
            const matching = this.patterns.filter(p => p.stateKey === stateKey);
            if (matching.length === 0) return null;
            // 総合スコアで最良を選択
            return matching.reduce((best, p) => {
                const scoreP = p.equityGain + (p.victoryScore || 0);
                const scoreBest = best.equityGain + (best.victoryScore || 0);
                return scoreP > scoreBest ? p : best;
            });
        },

        /**
         * 勝利条件達成パターンのみを取得
         */
        getVictoryPatterns() {
            return this.patterns.filter(p =>
                p.victoryData &&
                p.victoryData.inventory >= 10 &&
                p.victoryData.chips >= 3
            );
        },

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
                        version: '1.0',
                        lastUpdated: new Date().toISOString(),
                        totalPatterns: this.patterns.length,
                        patterns: this.patterns
                    };

                    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
                    return true;
                }
            } catch (e) {
                // サイレント
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
                        this.patterns = data.patterns || [];
                        return true;
                    }
                }
            } catch (e) {
                // サイレント
            }
            return false;
        }
    };

    // ============================================
    // 期別戦略プロファイル v1.0
    // 期ごとの成功戦略を詳細に記録・分析
    // ============================================
    const StrategyProfiles = {
        dataPath: 'data/strategy-profiles.json',
        profiles: [],
        maxProfiles: 500,

        /**
         * 戦略プロファイルを記録
         * @param {Object} company - 会社オブジェクト
         * @param {number} period - 期
         * @param {number} startEquity - 期首自己資本
         * @param {number} endEquity - 期末自己資本
         * @param {Array} periodActions - 期中の行動リスト
         */
        recordPeriodProfile(company, period, startEquity, endEquity, periodActions) {
            const equityChange = endEquity - startEquity;

            // 行動の集計
            const actionCounts = {};
            periodActions.forEach(a => {
                actionCounts[a] = (actionCounts[a] || 0) + 1;
            });

            const profile = {
                period,
                equityChange,
                startEquity,
                endEquity,
                // 戦略指標
                researchChips: company.chips?.research || 0,
                educationChips: company.chips?.education || 0,
                adChips: company.chips?.ad || 0,
                pcChips: company.chips?.pc || 0,
                workers: company.workers,
                salesmen: company.salesmen,
                hasBigMachine: company.machines?.some(m => m.type === 'large') || false,
                products: company.products,
                materials: company.materials,
                // 行動集計
                sellCount: actionCounts['SELL'] || 0,
                produceCount: actionCounts['PRODUCE'] || 0,
                buyMaterialsCount: actionCounts['BUY_MATERIALS'] || 0,
                buyChipCount: actionCounts['BUY_CHIP'] || 0,
                hireCount: (actionCounts['HIRE_WORKER'] || 0) + (actionCounts['HIRE_SALESMAN'] || 0),
                // タイムスタンプ
                timestamp: new Date().toISOString()
            };

            // 成功プロファイル（自己資本増加）のみ保存
            if (equityChange > 0) {
                this.addProfile(profile);
            }
        },

        addProfile(profile) {
            // 同じ期・同じ戦略特性のプロファイルを検索
            const key = `${profile.period}_${profile.researchChips}_${profile.hasBigMachine}`;
            const existing = this.profiles.find(p =>
                `${p.period}_${p.researchChips}_${p.hasBigMachine}` === key
            );

            if (existing) {
                // より良い結果なら更新
                if (profile.equityChange > existing.equityChange) {
                    Object.assign(existing, profile);
                    existing.count = (existing.count || 1) + 1;
                }
            } else {
                profile.count = 1;
                this.profiles.push(profile);
            }

            // 上限超過時は低収益プロファイルを削除
            if (this.profiles.length > this.maxProfiles) {
                this.profiles.sort((a, b) => b.equityChange - a.equityChange);
                this.profiles = this.profiles.slice(0, this.maxProfiles);
            }
        },

        /**
         * 特定期の推奨戦略を取得
         */
        getRecommendedStrategy(period, currentState) {
            const periodProfiles = this.profiles.filter(p => p.period === period);
            if (periodProfiles.length === 0) return null;

            // 自己資本増加量でソート
            periodProfiles.sort((a, b) => b.equityChange - a.equityChange);

            // 上位3つから推奨を生成
            const top3 = periodProfiles.slice(0, 3);

            return {
                avgResearchChips: Math.round(top3.reduce((s, p) => s + p.researchChips, 0) / top3.length),
                avgSellCount: Math.round(top3.reduce((s, p) => s + p.sellCount, 0) / top3.length),
                avgProduceCount: Math.round(top3.reduce((s, p) => s + p.produceCount, 0) / top3.length),
                shouldUpgradeMachine: top3.filter(p => p.hasBigMachine).length >= 2,
                bestEquityChange: top3[0].equityChange,
                sampleCount: periodProfiles.length
            };
        },

        /**
         * 全期間の戦略サマリーを取得
         */
        getStrategySummary() {
            const summary = {};
            for (let period = 2; period <= 5; period++) {
                summary[period] = this.getRecommendedStrategy(period);
            }
            return summary;
        },

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
                        version: '1.0',
                        lastUpdated: new Date().toISOString(),
                        totalProfiles: this.profiles.length,
                        summary: this.getStrategySummary(),
                        profiles: this.profiles
                    };

                    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
                    return true;
                }
            } catch (e) {
                // サイレント
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
                        this.profiles = data.profiles || [];
                        return true;
                    }
                }
            } catch (e) {
                // サイレント
            }
            return false;
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
        FailurePatterns,
        SuccessPatterns,
        StrategyProfiles,

        /**
         * 初期化（シミュレーション開始時）
         */
        init() {
            Persistence.load();
            FailurePatterns.load();
            SuccessPatterns.load();
            StrategyProfiles.load();
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
         * ★★★ 失敗・成功パターン + 勝利条件も記録 ★★★
         */
        learnFromGame(company, initialEquity, finalEquity, rank) {
            const equityChange = finalEquity - initialEquity;
            const stateKey = StateEncoder.encode(company, { period: 5 });

            // ★★★ 修正: 履歴を先にコピー（learnFromGameでクリアされるため）★★★
            const actionHistory = [...(CompanyTrackers.trackers[company.index] || [])];

            // Q-learning更新
            CompanyTrackers.learnFromGame(company.index, initialEquity, finalEquity, rank);

            // 大きな損失（-200以下）の場合は失敗パターンとして記録
            if (equityChange < -200) {
                const lastActions = actionHistory.slice(-5).map(a => a.actionType);
                FailurePatterns.record(stateKey, lastActions.join(','), Math.abs(equityChange), '大幅な自己資本減少');
            }

            // ★★★ 勝利条件データを収集 ★★★
            const totalInventory = (company.materials || 0) + (company.wip || 0) + (company.products || 0);
            const totalChips = (company.chips?.research || 0) + (company.chips?.education || 0) +
                              (company.chips?.ad || 0) + (company.chips?.pc || 0);
            const victoryData = {
                inventory: totalInventory,
                chips: totalChips,
                equity: finalEquity,
                meetsInventory: totalInventory >= 10,
                meetsChips: totalChips >= 3,
                meetsEquity: finalEquity >= 450,
                isVictory: totalInventory >= 10 && totalChips >= 3 && finalEquity >= 450 && rank === 1
            };

            // ★★★ 成功パターンの記録条件を強化 ★★★
            // 条件1: 上位3位以内
            // 条件2: 自己資本プラス
            // 条件3: 在庫10達成
            // 条件4: チップ3枚達成
            const shouldRecord = rank <= 3 || finalEquity >= 0 ||
                                victoryData.meetsInventory || victoryData.meetsChips;

            if (shouldRecord) {
                const actionSequence = actionHistory.map(a => a.actionType);
                if (actionSequence.length > 0) {
                    SuccessPatterns.record(stateKey, actionSequence, equityChange, rank, victoryData);

                    // ★★★ 勝利条件達成時は特別ログ ★★★
                    if (victoryData.isVictory) {
                        console.log(`[学習] ★★★ 完全勝利パターン記録: ${company.name} - 在庫${totalInventory}個, チップ${totalChips}枚, 自己資本¥${finalEquity}`);
                    } else if (victoryData.meetsInventory && victoryData.meetsChips) {
                        console.log(`[学習] 勝利条件達成パターン記録: ${company.name} - 在庫${totalInventory}個, チップ${totalChips}枚`);
                    }
                }
            }
        },

        /**
         * DO_NOTHING発生時に失敗として記録
         */
        recordDoNothing(company, gameState, reason) {
            const stateKey = StateEncoder.encode(company, gameState);
            FailurePatterns.record(stateKey, 'DO_NOTHING', 0, reason || '行動不能');
        },

        /**
         * 期末に戦略プロファイルを記録
         * @param {Object} company - 会社オブジェクト
         * @param {number} period - 期
         * @param {number} startEquity - 期首自己資本
         * @param {number} endEquity - 期末自己資本
         * @param {Array} periodActions - 期中の行動リスト
         */
        recordPeriodEnd(company, period, startEquity, endEquity, periodActions) {
            StrategyProfiles.recordPeriodProfile(company, period, startEquity, endEquity, periodActions);
        },

        /**
         * 特定期の推奨戦略を取得
         */
        getRecommendedStrategy(period) {
            return StrategyProfiles.getRecommendedStrategy(period);
        },

        /**
         * 全期間の戦略サマリーを取得
         */
        getStrategySummary() {
            return StrategyProfiles.getStrategySummary();
        },

        /**
         * 保存
         */
        save() {
            Persistence.save();
            StrategyProfiles.save();
            return true;
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
         * 勝利条件達成パターンの統計を取得
         */
        getVictoryStats() {
            const victoryPatterns = SuccessPatterns.getVictoryPatterns();
            const allPatterns = SuccessPatterns.patterns;

            // 在庫達成率
            const inventoryAchievers = allPatterns.filter(p =>
                p.victoryData && p.victoryData.meetsInventory
            ).length;

            // チップ達成率
            const chipsAchievers = allPatterns.filter(p =>
                p.victoryData && p.victoryData.meetsChips
            ).length;

            // 完全勝利
            const fullVictory = allPatterns.filter(p =>
                p.victoryData && p.victoryData.isVictory
            ).length;

            return {
                totalPatterns: allPatterns.length,
                victoryPatterns: victoryPatterns.length,
                inventoryAchievers,
                chipsAchievers,
                fullVictory,
                // 最高スコアパターン
                bestPattern: allPatterns.length > 0
                    ? allPatterns.reduce((best, p) => {
                        const scoreP = p.equityGain + (p.victoryScore || 0);
                        const scoreBest = best.equityGain + (best.victoryScore || 0);
                        return scoreP > scoreBest ? p : best;
                    })
                    : null
            };
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
