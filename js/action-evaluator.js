/**
 * MG 行動評価システム v1.0
 *
 * 各行動をスコアリングし、最適手との比較を行う
 */

const ActionEvaluator = (function() {
    'use strict';

    // ============================================
    // 評価基準定数
    // ============================================
    const WEIGHTS = {
        // G = MQ - F を最大化
        MQ_WEIGHT: 1.0,      // MQ（限界利益）の重み
        F_WEIGHT: -1.0,      // F（固定費）の重み（マイナス）

        // ROI計算用
        EXPECTED_M: 13,      // 期待限界利益/個
        EXPECTED_P: 28,      // 期待販売価格
        EXPECTED_V: 15,      // 期待変動費（材料+加工）

        // 時間価値（早期行動にボーナス）
        TIME_VALUE: 0.02,    // 1行あたりの割引率

        // リスク調整
        RISK_AVERSION: 0.1,  // リスク回避係数
    };

    // ============================================
    // 行動タイプ別基準スコア
    // ============================================
    const BASE_SCORES = {
        SELL: {
            base: 100,
            perUnit: 13,      // M × 数量
            winRateBonus: 20, // 高勝率時ボーナス
        },
        BUY_MATERIALS: {
            base: 50,
            perUnit: 10,      // 将来のMQ期待値
            cheapBonus: 5,    // 安価市場ボーナス/円
        },
        PRODUCE: {
            base: 60,
            perUnit: 12,      // 製品化価値
        },
        HIRE: {
            base: 30,
            perPerson: 15,    // 販売能力増加価値
        },
        BUY_CHIP: {
            research: 80,     // 研究開発チップ
            education: 40,    // 教育チップ
            advertising: 30,  // 広告チップ
            expressBonus: 20, // 特急ボーナス
        },
        BUY_MACHINE: {
            small: 60,
            large: 120,       // 大型機械は高価値
            attachment: 40,
        },
        BUY_WAREHOUSE: {
            base: 25,
        },
        DO_NOTHING: {
            base: -10,        // 基本的にペナルティ
            latePeriodBonus: 5, // 期末近くはOK
        }
    };

    // ============================================
    // 状況評価器
    // ============================================
    const SituationAnalyzer = {
        /**
         * 現在の状況を分析
         */
        analyze(company, gameState) {
            const period = gameState.period;
            const maxRows = MGSimulation.RULES.MAX_ROWS[period];
            const rowsRemaining = maxRows - company.currentRow;

            return {
                period,
                rowsRemaining,
                isEarlyPeriod: company.currentRow < maxRows * 0.3,
                isMidPeriod: company.currentRow >= maxRows * 0.3 && company.currentRow < maxRows * 0.7,
                isLatePeriod: company.currentRow >= maxRows * 0.7,

                // 資源状況
                cashRich: company.cash > 150,
                cashPoor: company.cash < 50,
                hasProducts: company.products > 0,
                hasMaterials: company.materials > 0,
                hasWip: company.wip > 0,

                // 能力
                mfgCapacity: company.getMfgCapacity(),
                salesCapacity: company.getSalesCapacity(),
                storageCapacity: company.getStorageCapacity(),

                // チップ
                researchChips: company.chips.research || 0,
                educationChips: company.chips.education || 0,

                // 競争力
                isParent: gameState.isParent(company.index),
                competitiveness: company.getPriceCompetitiveness(gameState.isParent(company.index)),

                // 目標達成度
                currentEquity: company.calculateEquity(period),
                targetEquity: MGSimulation.RULES.TARGET_EQUITY,
                equityGap: MGSimulation.RULES.TARGET_EQUITY - company.calculateEquity(period)
            };
        }
    };

    // ============================================
    // 行動スコアリング
    // ============================================
    const ActionScorer = {
        /**
         * 行動をスコアリング
         */
        score(action, company, gameState) {
            const situation = SituationAnalyzer.analyze(company, gameState);

            let score = 0;
            let breakdown = {};

            switch (action.type) {
                case 'SELL':
                    ({ score, breakdown } = this.scoreSell(action, situation, gameState));
                    break;
                case 'BUY_MATERIALS':
                    ({ score, breakdown } = this.scoreBuyMaterials(action, situation, gameState));
                    break;
                case 'PRODUCE':
                    ({ score, breakdown } = this.scoreProduce(action, situation));
                    break;
                case 'HIRE':
                    ({ score, breakdown } = this.scoreHire(action, situation));
                    break;
                case 'BUY_CHIP':
                    ({ score, breakdown } = this.scoreBuyChip(action, situation));
                    break;
                case 'BUY_LARGE_MACHINE':
                case 'BUY_SMALL_MACHINE':
                    ({ score, breakdown } = this.scoreBuyMachine(action, situation));
                    break;
                case 'BUY_WAREHOUSE':
                    ({ score, breakdown } = this.scoreBuyWarehouse(action, situation));
                    break;
                case 'DO_NOTHING':
                default:
                    ({ score, breakdown } = this.scoreDoNothing(situation));
                    break;
            }

            // 時間価値調整
            const timeAdjustment = 1 - (situation.rowsRemaining * WEIGHTS.TIME_VALUE);
            score *= timeAdjustment;

            return {
                action: action.type,
                score: Math.round(score),
                breakdown,
                situation: {
                    period: situation.period,
                    row: company.currentRow,
                    cash: company.cash
                }
            };
        },

        scoreSell(action, situation, gameState) {
            const base = BASE_SCORES.SELL.base;
            const quantity = action.quantity || 1;
            const price = action.price || WEIGHTS.EXPECTED_P;

            // 限界利益計算
            const m = price - WEIGHTS.EXPECTED_V;
            const mq = m * quantity;

            // 入札勝率推定
            const winRate = this.estimateWinRate(situation, price);

            // 期待値
            const expectedMQ = mq * winRate;

            const score = base + expectedMQ + (winRate > 0.7 ? BASE_SCORES.SELL.winRateBonus : 0);

            return {
                score,
                breakdown: {
                    base,
                    quantity,
                    price,
                    m,
                    mq,
                    winRate: Math.round(winRate * 100) + '%',
                    expectedMQ: Math.round(expectedMQ)
                }
            };
        },

        estimateWinRate(situation, price) {
            // 研究チップと価格に基づく勝率推定
            const chips = situation.researchChips;
            const parentBonus = situation.isParent ? 0.1 : 0;

            // 基本勝率（6社なので約17%から開始）
            let baseRate = 0.17;

            // 研究チップによるボーナス
            baseRate += chips * 0.12;

            // 価格が低いほど有利
            if (price <= 24) baseRate += 0.15;
            else if (price <= 28) baseRate += 0.10;
            else if (price <= 32) baseRate += 0.05;

            // 親ボーナス
            baseRate += parentBonus;

            return Math.min(0.95, baseRate);
        },

        scoreBuyMaterials(action, situation, gameState) {
            const base = BASE_SCORES.BUY_MATERIALS.base;
            const quantity = action.quantity || 1;
            const marketPrice = action.market ? action.market.buyPrice : 12;

            // 将来の期待MQ
            const expectedM = WEIGHTS.EXPECTED_P - marketPrice - MGSimulation.RULES.COST.PROCESSING;
            const expectedMQ = expectedM * quantity;

            // 安価市場ボーナス
            const cheapBonus = (15 - marketPrice) * BASE_SCORES.BUY_MATERIALS.cheapBonus;

            // 在庫過多ペナルティ
            const inventoryPenalty = situation.hasMaterials ? -10 : 0;

            // 期首ボーナス（材料確保は早めが良い）
            const earlyBonus = situation.isEarlyPeriod ? 20 : 0;

            const score = base + expectedMQ + cheapBonus + inventoryPenalty + earlyBonus;

            return {
                score,
                breakdown: {
                    base,
                    quantity,
                    marketPrice,
                    expectedM,
                    expectedMQ: Math.round(expectedMQ),
                    cheapBonus,
                    inventoryPenalty,
                    earlyBonus
                }
            };
        },

        scoreProduce(action, situation) {
            const base = BASE_SCORES.PRODUCE.base;
            const wipToProduct = action.wipToProduct || 1;

            // 製品化による価値
            const productionValue = wipToProduct * BASE_SCORES.PRODUCE.perUnit;

            // 製品がないときはボーナス
            const needProductBonus = !situation.hasProducts ? 30 : 0;

            // 製造能力を使い切るボーナス
            const capacityUseBonus = wipToProduct >= situation.mfgCapacity ? 15 : 0;

            const score = base + productionValue + needProductBonus + capacityUseBonus;

            return {
                score,
                breakdown: {
                    base,
                    wipToProduct,
                    productionValue,
                    needProductBonus,
                    capacityUseBonus
                }
            };
        },

        scoreHire(action, situation) {
            const base = BASE_SCORES.HIRE.base;
            const count = action.count || 1;

            // 販売能力不足時のボーナス
            const salesGap = situation.hasProducts ?
                Math.max(0, situation.hasProducts - situation.salesCapacity) : 0;
            const needBonus = salesGap > 0 ? 40 : 0;

            // 人数あたりの価値
            const perPersonValue = count * BASE_SCORES.HIRE.perPerson;

            // 過剰採用ペナルティ
            const overHirePenalty = (situation.salesCapacity + count > 8) ? -20 : 0;

            const score = base + perPersonValue + needBonus + overHirePenalty;

            return {
                score,
                breakdown: {
                    base,
                    count,
                    salesGap,
                    needBonus,
                    perPersonValue,
                    overHirePenalty
                }
            };
        },

        scoreBuyChip(action, situation) {
            const chipType = action.chipType || 'research';
            const isExpress = action.isExpress || false;

            let base;
            switch (chipType) {
                case 'research':
                    base = BASE_SCORES.BUY_CHIP.research;
                    // 研究チップは3枚まで高価値、それ以上は逓減
                    if (situation.researchChips >= 4) base -= 30;
                    else if (situation.researchChips >= 3) base -= 10;
                    break;
                case 'education':
                    base = BASE_SCORES.BUY_CHIP.education;
                    break;
                case 'advertising':
                    base = BASE_SCORES.BUY_CHIP.advertising;
                    break;
                default:
                    base = 30;
            }

            // 特急ボーナス
            const expressBonus = isExpress ? BASE_SCORES.BUY_CHIP.expressBonus : 0;

            // 期首は次期チップでOK
            const earlyPeriodPenalty = (situation.isEarlyPeriod && isExpress) ? -15 : 0;

            const score = base + expressBonus + earlyPeriodPenalty;

            return {
                score,
                breakdown: {
                    base,
                    chipType,
                    isExpress,
                    expressBonus,
                    earlyPeriodPenalty
                }
            };
        },

        scoreBuyMachine(action, situation) {
            const isLarge = action.type === 'BUY_LARGE_MACHINE';
            const base = isLarge ? BASE_SCORES.BUY_MACHINE.large : BASE_SCORES.BUY_MACHINE.small;

            // 3期の大型機械は高価値
            const period3Bonus = (situation.period === 3 && isLarge) ? 50 : 0;

            // 製造能力不足時のボーナス
            const capacityNeedBonus = situation.mfgCapacity < 4 ? 30 : 0;

            // 資金不足ペナルティ
            const cashPenalty = situation.cashPoor ? -40 : 0;

            const score = base + period3Bonus + capacityNeedBonus + cashPenalty;

            return {
                score,
                breakdown: {
                    base,
                    isLarge,
                    period3Bonus,
                    capacityNeedBonus,
                    cashPenalty
                }
            };
        },

        scoreBuyWarehouse(action, situation) {
            const base = BASE_SCORES.BUY_WAREHOUSE.base;

            // 倉庫が必要かどうか
            const currentStorage = situation.storageCapacity;
            const needWarehouse = currentStorage < 20 ? 20 : 0;

            // 2期は倉庫不要
            const period2Penalty = situation.period === 2 ? -30 : 0;

            const score = base + needWarehouse + period2Penalty;

            return {
                score,
                breakdown: {
                    base,
                    currentStorage,
                    needWarehouse,
                    period2Penalty
                }
            };
        },

        scoreDoNothing(situation) {
            const base = BASE_SCORES.DO_NOTHING.base;

            // 期末近くは許容
            const latePeriodBonus = situation.isLatePeriod ? BASE_SCORES.DO_NOTHING.latePeriodBonus * 3 : 0;

            // 資金豊富なのに何もしないのはペナルティ
            const cashRichPenalty = situation.cashRich ? -20 : 0;

            // 製品があるのに売らないのはペナルティ
            const hasProductPenalty = situation.hasProducts ? -30 : 0;

            const score = base + latePeriodBonus + cashRichPenalty + hasProductPenalty;

            return {
                score,
                breakdown: {
                    base,
                    latePeriodBonus,
                    cashRichPenalty,
                    hasProductPenalty
                }
            };
        }
    };

    // ============================================
    // 行動比較器
    // ============================================
    const ActionComparator = {
        /**
         * 複数の行動を比較してランキング
         */
        rankActions(actions, company, gameState) {
            const scored = actions.map(action =>
                ActionScorer.score(action, company, gameState)
            );

            scored.sort((a, b) => b.score - a.score);

            return scored.map((item, index) => ({
                rank: index + 1,
                ...item,
                isOptimal: index === 0,
                gapFromOptimal: index === 0 ? 0 : scored[0].score - item.score
            }));
        },

        /**
         * 選択された行動を評価
         */
        evaluateChoice(chosenAction, allPossibleActions, company, gameState) {
            const rankings = this.rankActions(allPossibleActions, company, gameState);
            const chosenRanking = rankings.find(r => r.action === chosenAction.type);

            if (!chosenRanking) {
                return {
                    grade: 'F',
                    message: '不明な行動',
                    rankings
                };
            }

            const optimalAction = rankings[0];
            const gap = optimalAction.score - chosenRanking.score;
            const gapPercent = optimalAction.score > 0 ?
                Math.round((gap / optimalAction.score) * 100) : 0;

            let grade, message;

            if (chosenRanking.rank === 1) {
                grade = 'S';
                message = '最適な選択です！';
            } else if (gapPercent <= 10) {
                grade = 'A';
                message = 'ほぼ最適な選択です';
            } else if (gapPercent <= 25) {
                grade = 'B';
                message = '良い選択ですが、より良い選択肢があります';
            } else if (gapPercent <= 50) {
                grade = 'C';
                message = '改善の余地があります';
            } else {
                grade = 'D';
                message = '他の選択肢を検討してください';
            }

            return {
                grade,
                message,
                chosenRank: chosenRanking.rank,
                chosenScore: chosenRanking.score,
                optimalAction: optimalAction.action,
                optimalScore: optimalAction.score,
                gap,
                gapPercent,
                suggestion: optimalAction.action !== chosenAction.type ?
                    `推奨: ${this.getActionName(optimalAction.action)}` : null,
                rankings
            };
        },

        getActionName(actionType) {
            const names = {
                'SELL': '販売',
                'BUY_MATERIALS': '材料購入',
                'PRODUCE': '完成・投入',
                'HIRE': '採用',
                'BUY_CHIP': 'チップ購入',
                'BUY_LARGE_MACHINE': '大型機械購入',
                'BUY_SMALL_MACHINE': '小型機械購入',
                'BUY_WAREHOUSE': '倉庫購入',
                'DO_NOTHING': '何もしない'
            };
            return names[actionType] || actionType;
        }
    };

    // ============================================
    // ゲーム全体評価
    // ============================================
    const GameEvaluator = {
        /**
         * ゲーム終了時の総合評価
         */
        evaluateGame(company, gameState) {
            const finalEquity = company.calculateEquity(5);
            const target = MGSimulation.RULES.TARGET_EQUITY;

            const evaluation = {
                finalEquity,
                targetReached: finalEquity >= target,
                grade: this.getEquityGrade(finalEquity),
                efficiency: this.calculateEfficiency(company),
                strengths: [],
                weaknesses: [],
                recommendations: []
            };

            // 分析
            if (company.totalSoldQuantity > 30) {
                evaluation.strengths.push('販売量が多い');
            } else {
                evaluation.weaknesses.push('販売量が少ない');
                evaluation.recommendations.push('研究開発チップを増やして高価格販売を狙う');
            }

            if (company.totalF < 400) {
                evaluation.strengths.push('固定費が抑えられている');
            } else {
                evaluation.weaknesses.push('固定費が高い');
                evaluation.recommendations.push('不要な採用・投資を控える');
            }

            const avgPrice = company.totalSoldQuantity > 0 ?
                Math.round(company.totalSales / company.totalSoldQuantity) : 0;

            if (avgPrice >= 30) {
                evaluation.strengths.push('高価格販売ができている');
            } else if (avgPrice < 26) {
                evaluation.weaknesses.push('販売価格が低い');
                evaluation.recommendations.push('研究開発チップ投資で価格競争力を上げる');
            }

            return evaluation;
        },

        getEquityGrade(equity) {
            if (equity >= 500) return { grade: 'S', label: '卓越', color: '#ffd700' };
            if (equity >= 450) return { grade: 'A', label: '優秀', color: '#4ade80' };
            if (equity >= 400) return { grade: 'B', label: '良好', color: '#60a5fa' };
            if (equity >= 350) return { grade: 'C', label: '普通', color: '#fbbf24' };
            if (equity >= 300) return { grade: 'D', label: '要改善', color: '#fb923c' };
            return { grade: 'F', label: '不合格', color: '#ef4444' };
        },

        calculateEfficiency(company) {
            // G = MQ - F の効率性
            const mq = company.totalSales - (company.totalSoldQuantity * 12); // V≒12想定
            const f = company.totalF;
            const g = mq - f;

            return {
                mq,
                f,
                g,
                mqPerSale: company.totalSoldQuantity > 0 ?
                    Math.round(mq / company.totalSoldQuantity) : 0,
                fPerRow: Math.round(f / 119) // 全期間の行数概算
            };
        }
    };

    // ============================================
    // 公開API
    // ============================================
    return {
        WEIGHTS,
        BASE_SCORES,
        SituationAnalyzer,
        ActionScorer,
        ActionComparator,
        GameEvaluator,

        // 便利メソッド
        scoreAction: function(action, company, gameState) {
            return ActionScorer.score(action, company, gameState);
        },

        rankActions: function(actions, company, gameState) {
            return ActionComparator.rankActions(actions, company, gameState);
        },

        evaluateChoice: function(chosenAction, allActions, company, gameState) {
            return ActionComparator.evaluateChoice(chosenAction, allActions, company, gameState);
        },

        evaluateGame: function(company, gameState) {
            return GameEvaluator.evaluateGame(company, gameState);
        }
    };
})();

// Node.js/ブラウザ両対応エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActionEvaluator;
}
if (typeof window !== 'undefined') {
    window.ActionEvaluator = ActionEvaluator;
}
