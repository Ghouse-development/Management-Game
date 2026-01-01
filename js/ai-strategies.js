/**
 * MG (Management Game) - AI戦略関数
 *
 * AI性格別の戦略実行、入札処理、共通アクション関数を定義
 * 依存: constants.js, state.js, game.js, ai-brain.js
 */

// ============================================
// 🎯 450達成のための正確な戦略計算
// ============================================
/**
 * 【正確な初期値・行数】
 * - 初期自己資本: 283円
 * - 目標自己資本: 450円
 * - 必要増加額: 167円
 * - 税率50%: 税引前G ≈ 320円必要（自己資本増加率50%）
 *
 * 【正確な行数（MAX_ROWS_BY_PERIOD）】
 * - 2期: 20行（期首処理で1行使用→実質19行）
 * - 3期: 30行
 * - 4期: 34行
 * - 5期: 35行
 *
 * 【初期在庫状態】
 * - 材料: 1個、仕掛品: 2個、製品: 1個
 * - 製造能力: 1（小型機械1台）
 * - 販売能力: 2（セールスマン1人×2）
 *
 * 【3ターンサイクルの効率化】
 * - 買う→生産→売るで3ターン（完成・投入同時実行で効率化）
 * - パイプライン維持: 材料・仕掛品両方を保持すると1生産で2工程進む
 */

// リスクカード確率（75枚中15枚 = 20%）
const RISK_CARD_PROBABILITY = 15 / 75;
const EFFECTIVE_ROW_MULTIPLIER = 1 - RISK_CARD_PROBABILITY;

// 正確な期別戦略目標
const PERIOD_STRATEGY_TARGETS = {
    2: {
        rows: 20,                    // 正確な行数
        effectiveRows: Math.floor(19 * EFFECTIVE_ROW_MULTIPLIER),  // 15行
        cycles: 5,                   // 15行 ÷ 3 = 5サイクル
        investRows: 3,               // チップ投資用
        gTarget: 20,                 // 投資期でも+20目標（300超過を狙う）
        fBudget: 70,                 // 固定費予算
        mqRequired: 90,              // G20 + F70 = MQ90
        salesPerCycle: 1,
        priceTarget: 14,             // 東京20円 - 原価(13+1)6 = MQ14
        investPriority: ['research', 'education'],
        riskBuffer: 25,
        description: '投資期：研究2枚+教育1枚、5サイクル',
        actionPlan: {
            buyMaterials: 5,
            produce: 5,
            sell: 5,
            riskCards: 4,
            invest: 3,
            total: 20
        },
        investmentPlan: {
            education: 1,
            research: 2,
            advertising: 0,
            worker: 0,
            machine: 0
        }
    },
    3: {
        rows: 30,                    // 正確な行数
        effectiveRows: Math.floor(30 * EFFECTIVE_ROW_MULTIPLIER),  // 24行
        cycles: 8,                   // 24行 ÷ 3 = 8サイクル
        investRows: 3,
        gTarget: 50,                 // 成長期目標
        fBudget: 90,
        mqRequired: 140,             // G50 + F90 = MQ140（自己資本+25）
        salesPerCycle: 2,
        priceTarget: 12,
        investPriority: ['research', 'advertising'],
        riskBuffer: 30,
        description: '成長期：研究追加、広告、8サイクル',
        actionPlan: {
            buyMaterials: 8,
            produce: 8,
            sell: 8,
            riskCards: 6,
            invest: 2,
            total: 30
        },
        investmentPlan: {
            education: 0,
            research: 1,
            advertising: 1,
            worker: 0,
            machine: 0
        }
    },
    4: {
        rows: 34,                    // 正確な行数
        effectiveRows: Math.floor(34 * EFFECTIVE_ROW_MULTIPLIER),  // 27行
        cycles: 9,                   // 27行 ÷ 3 = 9サイクル
        investRows: 2,
        gTarget: 100,                // 回収期目標
        fBudget: 100,
        mqRequired: 200,             // G100 + F100 = MQ200（自己資本+50）
        salesPerCycle: 2,
        priceTarget: 10,
        investPriority: ['research', 'nextPeriodChips'],
        riskBuffer: 35,
        description: '回収期：9サイクル、次期チップ購入',
        actionPlan: {
            buyMaterials: 9,
            produce: 9,
            sell: 9,
            riskCards: 7,
            invest: 2,
            total: 34
        },
        investmentPlan: {
            education: 0,
            research: 0,
            advertising: 0,
            nextPeriodChips: 2,      // 5期用チップ予約
            worker: 0,
            machine: 0
        }
    },
    5: {
        rows: 35,                    // 正確な行数
        effectiveRows: Math.floor(35 * EFFECTIVE_ROW_MULTIPLIER),  // 28行
        cycles: 9,                   // 28行 ÷ 3 ≈ 9サイクル
        investRows: 1,
        gTarget: 160,                // 最大利益期目標
        fBudget: 110,
        mqRequired: 270,             // G160 + F110 = MQ270（自己資本+80）
        salesPerCycle: 3,
        priceTarget: 10,
        investPriority: ['sellAll', 'inventory10'],
        riskBuffer: 25,
        description: '最大利益期：9サイクル、在庫10個確保',
        actionPlan: {
            buyMaterials: 9,
            produce: 9,
            sell: 9,
            riskCards: 7,
            invest: 1,               // 次期チップ使用
            total: 35
        },
        investmentPlan: {
            education: 0,
            research: 0,
            advertising: 0,
            keepInventory: 10,       // 期末在庫10個以上
            nextPeriodChips: 3,      // 次期チップ3枚以上
            worker: 0,
            machine: 0
        }
    }
};

/**
 * 累積G目標（450達成のための期別目標）
 *
 * 【正確な税制】
 * - 自己資本300以下: 税・配当なし（G = 自己資本増加）
 * - 300超過時（初回）: 超過分×50%税 → 自己資本 = G - 超過分×50%
 * - 300超過後: 利益×50%税 → 自己資本 = G × 50%
 * ※配当は現金支払いであり、自己資本からは控除されない
 *
 * 【正確な計算】
 * - 初期自己資本: 283円
 * - 目標自己資本: 450円
 * - 300到達に必要: 17円（非課税）
 * - 300超過後は50%保持（税金のみ控除）
 *
 * 期別G目標:
 * - 2期: G = 20（300超過し、301.5に）
 * - 3期: G = 50（+25で326.5に）
 * - 4期: G = 100（+50で376.5に）
 * - 5期: G = 160（+80で456.5に）
 * 合計: 330円
 */
const CUMULATIVE_G_TARGETS = {
    2: { periodG: 20, cumulativeG: 20, equityTarget: 302 },   // 300超過、税1.5
    3: { periodG: 50, cumulativeG: 70, equityTarget: 327 },   // 50%保持
    4: { periodG: 100, cumulativeG: 170, equityTarget: 377 }, // 50%保持
    5: { periodG: 160, cumulativeG: 330, equityTarget: 457 }  // 50%保持
};

/**
 * 現在期の戦略計画を取得
 */
function getStrategicPlan(company, period) {
    const target = PERIOD_STRATEGY_TARGETS[period] || PERIOD_STRATEGY_TARGETS[2];
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);
    const currentRow = company.currentRow || 1;
    const rowsRemaining = gameState.maxRows - currentRow;
    const cyclesRemaining = Math.floor(rowsRemaining / 3);

    // 現在の能力で達成可能なMQを計算
    const effectiveSales = Math.min(mfgCapacity, salesCapacity);
    const priceComp = getPriceCompetitiveness(company, gameState.companies.indexOf(company));
    const estimatedMQPerUnit = 20 + priceComp - 10;  // 売価20 + 価格競争力 - 原価10
    const potentialMQPerCycle = effectiveSales * estimatedMQPerUnit;
    const potentialTotalMQ = potentialMQPerCycle * cyclesRemaining;

    // 目標達成度を評価
    const achievability = potentialTotalMQ / target.mqRequired;
    const needsMoreCapacity = achievability < 0.8;
    const needsMorePriceComp = estimatedMQPerUnit < target.priceTarget;

    // 推奨行動を決定
    let recommendedAction = 'CYCLE';  // デフォルト：MQサイクル継続
    let actionReason = '';

    if (rowsRemaining <= 3) {
        // 期末処理：5期のみ超過分売却、2-4期は次期に繋げる
        if (period === 5) {
            recommendedAction = 'SELL_EXCESS';
            actionReason = '5期最終：在庫10個超過分を売却';
        } else {
            recommendedAction = 'PRODUCE_CARRY';
            actionReason = '期末：次期に繋げるため生産継続';
        }
    } else if (needsMoreCapacity && target.investPriority.includes('machine')) {
        recommendedAction = 'INVEST_MACHINE';
        actionReason = `製造能力不足（${mfgCapacity}→目標${target.salesPerCycle}）`;
    } else if (needsMorePriceComp && company.chips.research < 4) {
        recommendedAction = 'INVEST_RESEARCH';
        actionReason = `価格競争力不足（MQ${estimatedMQPerUnit}→目標${target.priceTarget}）`;
    } else if (mfgCapacity < salesCapacity && !company.chips.education) {
        recommendedAction = 'INVEST_EDUCATION';
        actionReason = '製造能力が販売能力より低い';
    }

    return {
        period,
        target,
        currentState: {
            row: currentRow,
            rowsRemaining,
            cyclesRemaining,
            mfgCapacity,
            salesCapacity,
            priceCompetitiveness: priceComp
        },
        projection: {
            potentialMQPerCycle,
            potentialTotalMQ,
            targetMQ: target.mqRequired,
            achievability: Math.round(achievability * 100),
            estimatedG: potentialTotalMQ - target.fBudget
        },
        recommendation: {
            action: recommendedAction,
            reason: actionReason,
            needsMoreCapacity,
            needsMorePriceComp
        }
    };
}

/**
 * 3ターンサイクルの最適化判断
 * 材料購入→生産→販売のサイクルで最大MQを得るための判断
 */
function optimizeCycleAction(company, plan) {
    const { currentState, recommendation } = plan;
    const period = gameState.currentPeriod;

    // サイクル状態を判断
    // 製品あり → 販売フェーズ
    // 仕掛品あり → 完成フェーズ
    // 材料あり → 投入フェーズ
    // なにもなし → 仕入れフェーズ

    const hasProducts = company.products > 0;
    const hasWIP = company.wip > 0;
    const hasMaterials = company.materials > 0;
    const hasInventory = hasProducts || hasWIP || hasMaterials;

    // 期末間近は次期に繋げる戦略
    // ※5期のみ在庫10個超過分を売却、2-4期は売らない
    if (currentState.rowsRemaining <= 5) {
        const totalInventory = company.products + company.wip + company.materials;
        if (period === 5 && company.products > 10) {
            // 5期のみ：在庫10個超過分を売却
            return {
                phase: 'SELL',
                priority: 'HIGH',
                reason: '5期最終：在庫10個超過分を売却',
                qty: Math.min(currentState.salesCapacity, company.products - 10)
            };
        } else if (period !== 5 && (hasWIP || hasMaterials)) {
            // 2-4期：生産して次期に繋げる
            return {
                phase: 'PRODUCE',
                priority: 'HIGH',
                reason: '期末継続：次期のため生産',
                qty: currentState.mfgCapacity
            };
        }
    }

    // ============================================
    // 最適サイクル判断（材料・仕掛品0を避ける）
    // ============================================
    // 重要: 材料と仕掛品が両方0になると、生産に2行必要になり非効率
    // 理想: 常に材料 or 仕掛品のどちらかを保持

    // パターン1: 製品あり → 販売（ただし在庫パイプラインを考慮）
    if (hasProducts && currentState.salesCapacity > 0) {
        // 販売後に材料・仕掛品が0になる場合、先に仕入れを検討
        const wouldBreakPipeline = !hasMaterials && !hasWIP;
        if (wouldBreakPipeline && company.cash > 50) {
            // パイプライン維持のため先に仕入れ
            return {
                phase: 'BUY',
                priority: 'HIGH',
                reason: 'パイプライン維持：先に材料仕入れ',
                qty: currentState.mfgCapacity
            };
        }
        return {
            phase: 'SELL',
            priority: 'HIGH',
            reason: 'サイクル完了：製品販売',
            qty: Math.min(currentState.salesCapacity, company.products)
        };
    }

    // パターン2: 材料 AND 仕掛品あり → 生産（同時に完成・投入）
    if (hasMaterials && hasWIP && currentState.mfgCapacity > 0) {
        return {
            phase: 'PRODUCE',
            priority: 'CRITICAL',
            reason: '最適生産：完成＋投入同時実行',
            qty: currentState.mfgCapacity
        };
    }

    // パターン3: 仕掛品のみ（材料なし）→ 先に材料購入！
    // 重要: 仕掛品だけで生産すると、完成後に材料0・仕掛品0になり
    //       次回は2行かかる（材料購入→投入のみ→完成のみ）
    //       先に材料を買えば、次の生産で完成＋投入が同時にできる
    if (hasWIP && !hasMaterials && currentState.mfgCapacity > 0) {
        const periodEndCost = calculatePeriodPayment(company);
        const safetyMargin = periodEndCost + 30;
        if (company.cash > safetyMargin + 15) {
            return {
                phase: 'BUY',
                priority: 'CRITICAL',
                reason: 'パイプライン維持：仕掛品完成前に材料購入',
                qty: currentState.mfgCapacity
            };
        }
        // 現金不足の場合は仕方なく生産（パイプライン切れるが致し方なし）
        return {
            phase: 'PRODUCE',
            priority: 'HIGH',
            reason: '現金不足：仕掛品完成（パイプライン注意）',
            qty: currentState.mfgCapacity
        };
    }

    // パターン4: 材料のみ（仕掛品なし）→ 生産（投入のみ）
    if (hasMaterials && !hasWIP && currentState.mfgCapacity > 0) {
        return {
            phase: 'PRODUCE',
            priority: 'HIGH',
            reason: 'サイクル：材料投入',
            qty: currentState.mfgCapacity
        };
    }

    // パターン5: 在庫なし → 材料仕入れ
    if (!hasInventory) {
        // 投資判断（行数に余裕がある場合のみ）
        if (recommendation.action.startsWith('INVEST') && currentState.rowsRemaining > 6) {
            return {
                phase: 'INVEST',
                priority: 'MEDIUM',
                reason: recommendation.reason,
                type: recommendation.action
            };
        }

        // 材料仕入れ
        return {
            phase: 'BUY',
            priority: 'HIGH',
            reason: 'サイクル開始：材料仕入れ',
            qty: currentState.mfgCapacity
        };
    }

    return {
        phase: 'WAIT',
        priority: 'LOW',
        reason: '状態異常：判断不能'
    };
}

/**
 * 期別G達成度評価
 */
function evaluatePeriodPerformance(company, period) {
    const target = PERIOD_STRATEGY_TARGETS[period];
    if (!target) return null;

    // 実際のGを計算（簡易版）
    const mq = company.periodMQ || 0;
    const f = calculateFixedCost(company);
    const estimatedG = mq - f;

    const score = Math.min(100, Math.round((estimatedG / target.gTarget) * 100));
    const grade = score >= 100 ? 'S' : score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';

    return {
        period,
        targetG: target.gTarget,
        estimatedG,
        score,
        grade,
        analysis: {
            mqAchieved: mq,
            mqTarget: target.mqRequired,
            fActual: f,
            fBudget: target.fBudget
        }
    };
}

// ============================================
// 🎯 戦略評価・改善エンジン（120点目標）
// ============================================
/**
 * 戦略の総合評価（0-120点）
 *
 * 評価項目:
 * 1. MQ効率（40点）: 1サイクルあたりのMQ
 * 2. 投資効率（30点）: チップ投資のROI
 * 3. リスク管理（20点）: 現金管理、保険
 * 4. 行動効率（30点）: 無駄な行動の削減
 *
 * 合計120点満点（100点=標準、120点=完璧）
 */
function evaluateStrategyScore(company, period) {
    const target = PERIOD_STRATEGY_TARGETS[period];
    if (!target) return { total: 0, breakdown: {} };

    const companyIndex = gameState.companies.indexOf(company);
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);
    const priceComp = getPriceCompetitiveness(company, companyIndex);
    const effectiveSales = Math.min(mfgCapacity, salesCapacity);

    // ============================================
    // 1. MQ効率（40点）- サイクル完遂率と価格競争力
    // ============================================
    const mqPerUnit = 20 + priceComp - 10;  // 売価20 + 価格競争力 - 原価10
    const mqPerCycle = effectiveSales * mqPerUnit;
    const targetMQPerCycle = target.mqRequired / target.cycles;

    // サブスコア: MQ/サイクル達成度（20点）
    const mqAchievementRate = Math.min(1.5, mqPerCycle / targetMQPerCycle);
    const mqAchievementScore = Math.round(mqAchievementRate * 20);

    // サブスコア: 価格競争力（10点）- 研究チップ効果
    const researchChips = company.chips.research || 0;
    const targetResearch = period <= 2 ? 1 : period === 3 ? 2 : 3;  // 期別目標
    const researchScore = Math.min(10, Math.round((researchChips / targetResearch) * 10));

    // サブスコア: 能力バランス（10点）- 製造=販売が理想
    const capacityDiff = Math.abs(mfgCapacity - salesCapacity);
    const balanceScore = Math.max(0, 10 - capacityDiff * 3);

    const mqEfficiency = Math.min(40, mqAchievementScore + researchScore + balanceScore);

    // ============================================
    // 2. 投資効率（30点）- タイミングと累積効果
    // ============================================
    // サブスコア: 教育チップ（早期投資ボーナス）（10点）
    const hasEducation = (company.chips.education || 0) > 0;
    const educationScore = hasEducation ? (period === 2 ? 10 : period === 3 ? 8 : 6) : 0;

    // サブスコア: 研究チップ累積効果（12点）
    // 研究チップは1枚で+2価格、期を重ねるほど累積MQに寄与
    const researchCumulativeValue = researchChips * 2 * (6 - period);  // 残り期数で乗算
    const maxResearchValue = 12;  // 3枚×2×3期=18だが上限12
    const researchInvestScore = Math.min(12, Math.round((researchCumulativeValue / 18) * 12));

    // サブスコア: 広告チップ効率（8点）
    const adChips = company.chips.advertising || 0;
    const effectiveAds = Math.min(adChips, company.salesmen);  // セールスマン数以上は無駄
    const adUtilization = company.salesmen > 0 ? effectiveAds / company.salesmen : 0;
    const adScore = Math.min(8, Math.round(adUtilization * 8));

    const investEfficiency = Math.min(30, educationScore + researchInvestScore + adScore);

    // ============================================
    // 3. リスク管理（20点）- 現金・借入・保険
    // ============================================
    // サブスコア: 現金安全率（8点）
    const periodEndCost = calculatePeriodPayment(company);
    const safetyRatio = company.cash / (periodEndCost + 30);
    const cashSafetyScore = Math.min(8, Math.round(safetyRatio * 4));

    // サブスコア: 借入回避（7点）
    const hasLoans = company.loans > 0 || company.shortLoans > 0;
    const loanPenalty = hasLoans ?
        (company.shortLoans > 0 ? 7 : 3) : 0;  // 短期借入はより大きなペナルティ
    const loanAvoidScore = 7 - loanPenalty;

    // サブスコア: 保険（5点）
    const hasInsurance = (company.chips.insurance || 0) > 0;
    const insuranceScore = hasInsurance ? 5 : 0;

    const riskScore = Math.max(0, cashSafetyScore + loanAvoidScore + insuranceScore);

    // ============================================
    // 4. 行動効率（30点）- サイクル実行とG目標進捗
    // ============================================
    // サブスコア: 在庫フロー効率（10点）
    // 理想：材料→仕掛品→製品の流れがスムーズ（滞留なし）
    const inventoryFlow = company.materials + company.wip * 0.5;  // 仕掛品は半カウント
    const productReady = company.products;
    const flowScore = productReady > 0 ?
        Math.min(10, 5 + Math.min(5, productReady)) :
        Math.max(0, 10 - inventoryFlow);  // 製品0でも在庫少なければOK

    // サブスコア: G目標進捗（12点）
    const currentMQ = company.periodMQ || 0;
    const currentF = calculateFixedCost(company);
    const currentG = currentMQ - currentF;
    const gProgress = target.gTarget > 0 ? currentG / target.gTarget : 1;
    const gProgressScore = Math.min(12, Math.round(Math.max(0, gProgress) * 12));

    // サブスコア: 行動密度（8点）- 無駄な行動がないか
    const rowsUsed = company.rowsUsed || 0;
    const actualSales = company.periodSalesCount || 0;
    const expectedSalesPerRow = 0.25;  // 4行に1回販売が理想
    const salesDensity = rowsUsed > 0 ? actualSales / (rowsUsed * expectedSalesPerRow) : 1;
    const densityScore = Math.min(8, Math.round(Math.min(1.5, salesDensity) * 5.3));

    const actionEfficiency = Math.min(30, flowScore + gProgressScore + densityScore);

    // ============================================
    // 合計スコアと評価
    // ============================================
    const total = mqEfficiency + investEfficiency + riskScore + actionEfficiency;

    // 120点達成条件を詳細に判定
    const weaknesses = {
        mqEfficiency: mqEfficiency < 32,         // 40点中32点未満
        investEfficiency: investEfficiency < 24, // 30点中24点未満
        riskManagement: riskScore < 16,          // 20点中16点未満
        actionEfficiency: actionEfficiency < 24  // 30点中24点未満
    };

    return {
        total,
        grade: total >= 115 ? 'S+' : total >= 105 ? 'S' : total >= 95 ? 'A' : total >= 85 ? 'B' : total >= 75 ? 'C' : 'D',
        breakdown: {
            mqEfficiency: {
                score: mqEfficiency,
                max: 40,
                detail: `MQ達成${mqAchievementScore}/20 + 研究${researchScore}/10 + バランス${balanceScore}/10`,
                subScores: { achievement: mqAchievementScore, research: researchScore, balance: balanceScore }
            },
            investEfficiency: {
                score: investEfficiency,
                max: 30,
                detail: `教育${educationScore}/10 + 研究累積${researchInvestScore}/12 + 広告${adScore}/8`,
                subScores: { education: educationScore, research: researchInvestScore, advertising: adScore }
            },
            riskManagement: {
                score: riskScore,
                max: 20,
                detail: `現金${cashSafetyScore}/8 + 借入回避${loanAvoidScore}/7 + 保険${insuranceScore}/5`,
                subScores: { cash: cashSafetyScore, loan: loanAvoidScore, insurance: insuranceScore }
            },
            actionEfficiency: {
                score: actionEfficiency,
                max: 30,
                detail: `フロー${flowScore}/10 + G進捗${gProgressScore}/12 + 密度${densityScore}/8`,
                subScores: { flow: flowScore, gProgress: gProgressScore, density: densityScore }
            }
        },
        improvements: generateImprovements(company, period, weaknesses),
        weaknesses
    };
}

/**
 * 改善提案を生成（120点達成のための具体的アクション）
 */
function generateImprovements(company, period, weaknesses) {
    const improvements = [];
    const mfgCap = getManufacturingCapacity(company);
    const salesCap = getSalesCapacity(company);
    const target = PERIOD_STRATEGY_TARGETS[period];

    // ============================================
    // MQ効率の改善提案
    // ============================================
    if (weaknesses.mqEfficiency) {
        const researchChips = company.chips.research || 0;
        const targetResearch = period <= 2 ? 1 : period === 3 ? 2 : 3;

        // 研究チップ不足
        if (researchChips < targetResearch) {
            const needed = targetResearch - researchChips;
            const useExpress = period >= 3;
            improvements.push({
                priority: 'CRITICAL',
                action: useExpress ? `研究チップ${needed}枚特急購入` : `研究チップ${needed}枚購入`,
                reason: `価格競争力不足: 現${researchChips}→目標${targetResearch}枚`,
                expectedGain: needed * 2 * target.cycles,  // 1枚で1サイクルあたり+2 MQ
                costBenefit: `投資${needed * (useExpress ? 40 : 20)}円 → MQ+${needed * 2 * target.cycles}`
            });
        }

        // 製造能力不足
        if (mfgCap < salesCap) {
            if (company.machines.some(m => m.type === 'small' && m.attachments === 0)) {
                improvements.push({
                    priority: 'HIGH',
                    action: 'アタッチメント購入',
                    reason: `製造能力不足: ${mfgCap} < 販売${salesCap}`,
                    expectedGain: (salesCap - mfgCap) * 10 * target.cycles,
                    costBenefit: '投資30円 → 製造能力+1'
                });
            } else {
                improvements.push({
                    priority: 'MEDIUM',
                    action: 'ワーカー追加採用',
                    reason: `製造能力不足: ${mfgCap} < 販売${salesCap}`,
                    costBenefit: '採用30円 + 給与で製造能力向上'
                });
            }
        }

        // 販売能力不足
        if (salesCap < mfgCap) {
            improvements.push({
                priority: 'HIGH',
                action: company.salesmen < 2 ? 'セールスマン採用' : '広告チップ購入',
                reason: `販売能力不足: ${salesCap} < 製造${mfgCap}`,
                costBenefit: company.salesmen < 2 ? '採用30円' : '投資20円 → 販売能力+2'
            });
        }
    }

    // ============================================
    // 投資効率の改善提案
    // ============================================
    if (weaknesses.investEfficiency) {
        // 教育チップ（早期投資が重要）
        if (!(company.chips.education || 0) && period <= 3) {
            improvements.push({
                priority: period === 2 ? 'CRITICAL' : 'HIGH',
                action: period >= 3 ? '教育チップ特急購入' : '教育チップ次期繰越購入',
                reason: '製造+1、販売+1の効果（早期投資推奨）',
                expectedGain: 2 * 10 * (6 - period),  // 残り期数で累積効果
                costBenefit: `投資${period >= 3 ? 40 : 20}円 → 能力+2、累積効果大`
            });
        }

        // 広告チップ効率
        const adChips = company.chips.advertising || 0;
        if (adChips < company.salesmen && company.salesmen > 0) {
            const needed = company.salesmen - adChips;
            improvements.push({
                priority: 'MEDIUM',
                action: `広告チップ${needed}枚追加`,
                reason: `広告効率改善: ${adChips}/${company.salesmen}（セールスマン当たり1枚）`,
                costBenefit: `投資${needed * 20}円 → 販売能力+${needed * 2}`
            });
        }
    }

    // ============================================
    // リスク管理の改善提案
    // ============================================
    if (weaknesses.riskManagement) {
        const periodEndCost = calculatePeriodPayment(company);

        // 現金不足
        if (company.cash < periodEndCost + 50) {
            improvements.push({
                priority: 'CRITICAL',
                action: '現金確保（販売優先）',
                reason: `期末支払い危険: 現金${company.cash} < 必要${periodEndCost + 50}`,
                costBenefit: '製品があれば即売却推奨'
            });
        }

        // 短期借入がある
        if (company.shortLoans > 0) {
            improvements.push({
                priority: 'CRITICAL',
                action: '短期借入返済',
                reason: `短期借入${company.shortLoans}円: 金利8%で損失大`,
                costBenefit: `返済で年間${Math.floor(company.shortLoans * 0.08)}円節約`
            });
        }

        // 保険チップ
        if (!(company.chips.insurance || 0)) {
            improvements.push({
                priority: 'LOW',
                action: '保険チップ購入',
                reason: 'リスクカード対策（火災・盗難）',
                costBenefit: '投資5円 → 期待損失回避約20円'
            });
        }
    }

    // ============================================
    // 行動効率の改善提案
    // ============================================
    if (weaknesses.actionEfficiency) {
        // 在庫滞留
        if (company.materials > mfgCap * 2) {
            improvements.push({
                priority: 'HIGH',
                action: '材料消化（生産優先）',
                reason: `材料滞留: ${company.materials}個 > 2サイクル分${mfgCap * 2}`,
                costBenefit: '材料→製品でMQ実現'
            });
        }

        if (company.wip > mfgCap) {
            improvements.push({
                priority: 'HIGH',
                action: '仕掛品完成（製品化）',
                reason: `仕掛品滞留: ${company.wip}個`,
                costBenefit: '完成→販売でMQ実現'
            });
        }

        // G目標進捗が低い
        const currentMQ = company.periodMQ || 0;
        const currentF = calculateFixedCost(company);
        const currentG = currentMQ - currentF;
        if (currentG < target.gTarget * 0.5) {
            improvements.push({
                priority: 'CRITICAL',
                action: '販売サイクル加速',
                reason: `G進捗遅れ: ${currentG} < 目標${target.gTarget}の50%`,
                costBenefit: 'サイクル完遂でMQ確保'
            });
        }
    }

    // 優先度でソート
    const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
    improvements.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return improvements;
}

/**
 * 戦略評価ログ出力
 */
function logStrategyEvaluation(company, period) {
    const evaluation = evaluateStrategyScore(company, period);
    console.log(`\n========== 戦略評価: ${company.name} (${period}期) ==========`);
    console.log(`総合スコア: ${evaluation.total}/120点 (${evaluation.grade})`);
    console.log(`\n内訳:`);
    Object.entries(evaluation.breakdown).forEach(([key, val]) => {
        console.log(`  ${key}: ${val.score}/${val.max}点 - ${val.detail}`);
    });
    if (evaluation.improvements.length > 0) {
        console.log(`\n改善提案:`);
        evaluation.improvements.forEach(imp => {
            console.log(`  [${imp.priority}] ${imp.action}: ${imp.reason}`);
            if (imp.costBenefit) console.log(`    効果: ${imp.costBenefit}`);
        });
    }

    // 120点達成状況
    const targetScore = 120;
    const gap = targetScore - evaluation.total;
    if (gap > 0) {
        console.log(`\n【120点まであと${gap}点】`);
        const biggestWeakness = Object.entries(evaluation.breakdown)
            .map(([k, v]) => ({ key: k, gap: v.max - v.score }))
            .sort((a, b) => b.gap - a.gap)[0];
        console.log(`  最大改善余地: ${biggestWeakness.key} (+${biggestWeakness.gap}点可能)`);
    } else {
        console.log(`\n🏆 120点達成！完璧な戦略です！`);
    }
    console.log(`================================================\n`);

    return evaluation;
}

/**
 * 改善提案を実行可能なアクションに変換
 * @returns {Object|null} 実行すべきアクション、または null
 */
function applyImprovementAction(company, period) {
    const evaluation = evaluateStrategyScore(company, period);
    const companyIndex = gameState.companies.indexOf(company);
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);

    // CRITICALまたはHIGH優先度の改善のみ即時適用
    const urgentImprovements = evaluation.improvements.filter(
        imp => imp.priority === 'CRITICAL' || imp.priority === 'HIGH'
    );

    if (urgentImprovements.length === 0) return null;

    const improvement = urgentImprovements[0];
    console.log(`[自己改善] ${company.name}: ${improvement.action} を適用`);

    // 改善内容をアクションに変換
    const action = improvement.action.toLowerCase();

    // 現金確保（販売優先）
    if (action.includes('現金確保') || action.includes('販売サイクル')) {
        if (company.products > 0 && salesCapacity > 0) {
            return {
                type: 'SELL',
                qty: Math.min(salesCapacity, company.products),
                priceMultiplier: 0.75,
                reason: `改善: ${improvement.reason}`
            };
        }
        if ((company.wip > 0 || company.materials > 0) && mfgCapacity > 0) {
            return {
                type: 'PRODUCE',
                reason: `改善: 販売準備のため生産`
            };
        }
    }

    // 研究チップ購入
    if (action.includes('研究チップ')) {
        const isExpress = action.includes('特急');
        const cost = isExpress ? 40 : 20;
        if (aiCanAffordSafely(company, cost)) {
            return {
                type: 'BUY_CHIP',
                chipType: 'research',
                cost: cost,
                express: isExpress,
                reason: `改善: ${improvement.reason}`
            };
        }
    }

    // 教育チップ購入
    if (action.includes('教育チップ')) {
        const isExpress = action.includes('特急');
        const cost = isExpress ? 40 : 20;
        if (aiCanAffordSafely(company, cost)) {
            return {
                type: 'BUY_CHIP',
                chipType: 'education',
                cost: cost,
                express: isExpress,
                reason: `改善: ${improvement.reason}`
            };
        }
    }

    // 広告チップ購入
    if (action.includes('広告チップ')) {
        if (aiCanAffordSafely(company, 20)) {
            return {
                type: 'BUY_CHIP',
                chipType: 'advertising',
                cost: 20,
                reason: `改善: ${improvement.reason}`
            };
        }
    }

    // アタッチメント購入
    if (action.includes('アタッチメント')) {
        if (aiCanAffordSafely(company, 30)) {
            return {
                type: 'BUY_ATTACHMENT',
                cost: 30,
                reason: `改善: ${improvement.reason}`
            };
        }
    }

    // 材料消化・仕掛品完成
    if (action.includes('材料消化') || action.includes('仕掛品完成') || action.includes('生産優先')) {
        if ((company.wip > 0 || company.materials > 0) && mfgCapacity > 0) {
            return {
                type: 'PRODUCE',
                reason: `改善: ${improvement.reason}`
            };
        }
    }

    // セールスマン採用
    if (action.includes('セールスマン')) {
        if (aiCanAffordSafely(company, 30) && company.salesmen < (company.maxPersonnel || 2)) {
            return {
                type: 'HIRE_SALESMAN',
                cost: 30,
                reason: `改善: ${improvement.reason}`
            };
        }
    }

    // ワーカー採用
    if (action.includes('ワーカー')) {
        if (aiCanAffordSafely(company, 30) && company.workers < (company.maxPersonnel || 2)) {
            return {
                type: 'HIRE_WORKER',
                cost: 30,
                reason: `改善: ${improvement.reason}`
            };
        }
    }

    // 短期借入返済
    if (action.includes('短期借入返済')) {
        if (company.shortLoans > 0 && company.cash >= company.shortLoans) {
            return {
                type: 'REPAY_SHORT_LOAN',
                amount: company.shortLoans,
                reason: `改善: ${improvement.reason}`
            };
        }
    }

    // 保険チップ
    if (action.includes('保険')) {
        if (aiCanAffordSafely(company, 5)) {
            return {
                type: 'BUY_CHIP',
                chipType: 'insurance',
                cost: 5,
                reason: `改善: ${improvement.reason}`
            };
        }
    }

    return null;
}

/**
 * 120点達成状態を追跡・報告
 */
function trackScoreProgress(company, period) {
    if (!company.scoreHistory) {
        company.scoreHistory = [];
    }

    const evaluation = evaluateStrategyScore(company, period);
    company.scoreHistory.push({
        period: period,
        row: company.currentRow || 1,
        score: evaluation.total,
        breakdown: {
            mq: evaluation.breakdown.mqEfficiency.score,
            invest: evaluation.breakdown.investEfficiency.score,
            risk: evaluation.breakdown.riskManagement.score,
            action: evaluation.breakdown.actionEfficiency.score
        }
    });

    // スコアの推移を分析
    if (company.scoreHistory.length >= 2) {
        const prev = company.scoreHistory[company.scoreHistory.length - 2];
        const curr = company.scoreHistory[company.scoreHistory.length - 1];
        const delta = curr.score - prev.score;

        if (delta > 0) {
            console.log(`📈 [スコア上昇] ${company.name}: ${prev.score}→${curr.score} (+${delta})`);
        } else if (delta < 0) {
            console.log(`📉 [スコア下落] ${company.name}: ${prev.score}→${curr.score} (${delta})`);
            // 下落要因を特定
            const factors = [];
            if (curr.breakdown.mq < prev.breakdown.mq) factors.push(`MQ-${prev.breakdown.mq - curr.breakdown.mq}`);
            if (curr.breakdown.invest < prev.breakdown.invest) factors.push(`投資-${prev.breakdown.invest - curr.breakdown.invest}`);
            if (curr.breakdown.risk < prev.breakdown.risk) factors.push(`リスク-${prev.breakdown.risk - curr.breakdown.risk}`);
            if (curr.breakdown.action < prev.breakdown.action) factors.push(`行動-${prev.breakdown.action - curr.breakdown.action}`);
            if (factors.length > 0) {
                console.log(`    下落要因: ${factors.join(', ')}`);
            }
        }
    }

    return evaluation;
}

// ============================================
// 🔍 競合観察・動的適応エンジン
// ============================================
/**
 * 競合他社の状況を分析し、自社戦略を動的に調整
 */
function analyzeCompetitors(company, companyIndex) {
    const rivals = gameState.companies.filter((c, i) => i !== companyIndex);

    // ライバルの研究チップ数（入札価格に直結）
    const rivalResearch = rivals.map(c => ({
        name: c.name,
        research: c.chips.research || 0,
        priceComp: getPriceCompetitiveness(c, gameState.companies.indexOf(c))
    })).sort((a, b) => b.priceComp - a.priceComp);

    const myPriceComp = getPriceCompetitiveness(company, companyIndex);
    const topRivalPriceComp = rivalResearch[0]?.priceComp || 0;
    const avgRivalPriceComp = rivalResearch.reduce((sum, r) => sum + r.priceComp, 0) / rivalResearch.length;

    // ライバルの在庫状況
    const rivalInventory = rivals.map(c => ({
        name: c.name,
        products: c.products,
        wip: c.wip,
        materials: c.materials,
        total: c.products + c.wip + c.materials
    }));
    const avgRivalProducts = rivalInventory.reduce((sum, r) => sum + r.products, 0) / rivalInventory.length;

    // ライバルの資金状況
    const rivalCash = rivals.map(c => c.cash);
    const avgRivalCash = rivalCash.reduce((sum, c) => sum + c, 0) / rivalCash.length;

    // ライバルの自己資本
    const rivalEquity = rivals.map(c => ({ name: c.name, equity: c.equity }))
        .sort((a, b) => b.equity - a.equity);
    const topRivalEquity = rivalEquity[0]?.equity || 300;
    const myEquity = company.equity;
    const equityGap = topRivalEquity - myEquity;

    return {
        priceAnalysis: {
            myPriceComp,
            topRivalPriceComp,
            avgRivalPriceComp,
            isBehind: myPriceComp < topRivalPriceComp - 2,
            isLeading: myPriceComp > topRivalPriceComp + 2,
            recommendation: myPriceComp < avgRivalPriceComp ? '研究チップ追加を検討' : '価格競争力は十分'
        },
        inventoryAnalysis: {
            myProducts: company.products,
            avgRivalProducts,
            rivalsHaveProducts: avgRivalProducts > 1,
            recommendation: avgRivalProducts > company.products ? '販売ペースを上げる' : '在庫は適正'
        },
        cashAnalysis: {
            myCash: company.cash,
            avgRivalCash,
            isRich: company.cash > avgRivalCash * 1.2,
            isPoor: company.cash < avgRivalCash * 0.8,
            recommendation: company.cash < avgRivalCash ? '現金確保を優先' : '投資余力あり'
        },
        equityAnalysis: {
            myEquity,
            topRivalEquity,
            equityGap,
            isLeading: equityGap <= 0,
            isBehind: equityGap > 30,
            recommendation: equityGap > 30 ? '挽回のため積極投資' : '現状維持で勝利可能'
        }
    };
}

/**
 * 行別の推奨行動を計算（何行目に何をすべきか）
 */
function getRowBasedActionPlan(company, period) {
    const target = PERIOD_STRATEGY_TARGETS[period];
    if (!target) return [];

    const currentRow = company.currentRow || 1;
    const maxRows = gameState.maxRows;
    const rowsRemaining = maxRows - currentRow;

    // 行動計画を生成
    const actionPlan = [];
    const plan = target.actionPlan;

    // サイクル数からスケジュールを逆算
    // 期末から逆算して行動を配置
    let row = currentRow;

    // フェーズ1: 序盤（投資フェーズ）- 最初の1-3行
    if (row <= 3) {
        if (plan.invest > 0 && target.investmentPlan.education > 0 && !company.chips.education) {
            actionPlan.push({ row, action: 'BUY_CHIP', type: 'education', reason: '序盤投資：教育チップ' });
            row++;
        }
        if (row <= 3 && plan.invest > 0 && target.investmentPlan.research > 0 && company.chips.research < 3) {
            actionPlan.push({ row, action: 'BUY_CHIP', type: 'research', reason: '序盤投資：研究チップ' });
            row++;
        }
    }

    // フェーズ2: 中盤（サイクル実行）
    const cycleStartRow = row;
    const cycleEndRow = maxRows - 5;  // 期末5行前まで

    for (let cycle = 0; cycle < plan.sell && row < cycleEndRow; cycle++) {
        // 材料購入 → 生産 → 販売の3行1セット
        actionPlan.push({ row: row++, action: 'BUY_MATERIALS', reason: `サイクル${cycle + 1}: 材料購入` });
        if (row < cycleEndRow) {
            actionPlan.push({ row: row++, action: 'PRODUCE', reason: `サイクル${cycle + 1}: 生産` });
        }
        if (row < cycleEndRow) {
            actionPlan.push({ row: row++, action: 'SELL', reason: `サイクル${cycle + 1}: 販売` });
        }
    }

    // フェーズ3: 終盤（次期に繋げる）- 期末5行
    // ※2-4期は次期に繋げるため生産継続、5期のみ10個超過分を売却
    const isFinalPeriod = period === 5;
    for (let i = 0; i < 5 && row <= maxRows; i++) {
        if (company.products > 0 || company.wip > 0 || company.materials > 0) {
            if (isFinalPeriod) {
                actionPlan.push({ row: row++, action: 'SELL_OR_PRODUCE', reason: '5期最終：在庫10個超過分売却' });
            } else {
                actionPlan.push({ row: row++, action: 'PRODUCE', reason: '期末継続：次期に繋げる' });
            }
        }
    }

    return actionPlan;
}

/**
 * 動的行動決定（競合観察＋行別計画を統合）
 */
function getDynamicAction(company, companyIndex) {
    const period = gameState.currentPeriod;
    const currentRow = company.currentRow || 1;
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);

    // 競合分析
    const competitors = analyzeCompetitors(company, companyIndex);

    // 行別計画
    const rowPlan = getRowBasedActionPlan(company, period);
    const currentRowPlan = rowPlan.find(p => p.row === currentRow);

    console.log(`[動的戦略] ${company.name} ${period}期${currentRow}行目`);
    console.log(`  競合分析: 価格差${competitors.priceAnalysis.myPriceComp - competitors.priceAnalysis.avgRivalPriceComp}、自己資本差${-competitors.equityAnalysis.equityGap}`);
    console.log(`  計画行動: ${currentRowPlan?.action || 'なし'} - ${currentRowPlan?.reason || ''}`);

    // 動的調整ルール
    let action = currentRowPlan?.action || 'CYCLE';
    let reason = currentRowPlan?.reason || '';

    // ルール1: 価格競争力が大幅に負けている場合、研究チップを優先
    if (competitors.priceAnalysis.isBehind && company.chips.research < 4 && company.cash > 60) {
        action = 'BUY_CHIP';
        reason = `競合対策: 価格競争力が${competitors.priceAnalysis.topRivalPriceComp - competitors.priceAnalysis.myPriceComp}点負け`;
    }

    // ルール2: 自己資本で大幅に負けている場合、リスクを取って投資
    if (competitors.equityAnalysis.isBehind && competitors.equityAnalysis.equityGap > 50) {
        if (company.products > 0) {
            action = 'SELL';
            reason = `挽回戦略: 自己資本${competitors.equityAnalysis.equityGap}円負け→積極販売`;
        } else if (company.materials + company.wip > 0) {
            action = 'PRODUCE';
            reason = `挽回戦略: 自己資本${competitors.equityAnalysis.equityGap}円負け→急いで生産`;
        }
    }

    // ルール3: ライバルが製品を大量に持っている場合、入札競争に備える
    if (competitors.inventoryAnalysis.rivalsHaveProducts && company.chips.research < 3) {
        action = 'BUY_CHIP';
        reason = '入札対策: ライバルが製品保有→価格競争力強化';
    }

    // ルール4: 期末間近は「次期に繋げる」戦略
    // ※在庫処分は間違い！次期開始時に在庫があると有利
    const rowsRemaining = gameState.maxRows - currentRow;
    if (rowsRemaining <= 5) {
        const totalInventory = company.materials + company.wip + company.products;

        if (period === 5) {
            // 5期のみ：在庫10個以上キープ、超過分売却
            if (company.products > 10 && salesCapacity > 0) {
                action = 'SELL';
                reason = '5期最終: 在庫10個超過分を売却';
            } else if (totalInventory < 10 && (company.wip > 0 || company.materials > 0)) {
                action = 'PRODUCE';
                reason = '5期最終: 在庫10個確保のため生産';
            }
        } else {
            // 2-4期：在庫を積み上げて次期に繋げる
            if ((company.wip > 0 || company.materials > 0) && mfgCapacity > 0) {
                action = 'PRODUCE';
                reason = '期末継続: 次期のため在庫積み上げ';
            }
            // 製品のみの場合は売らない（現金不足時のみ例外）
        }
    }

    return {
        action,
        reason,
        competitors,
        rowPlan: currentRowPlan
    };
}

// ============================================
// 🛡️ 短期借入回避ヘルパー（全AI購入処理で使用）
// ============================================
function aiCanAffordSafely(company, cost) {
    const periodEndCost = calculatePeriodPayment(company);
    const riskCardBuffer = (company.chips.insurance || 0) > 0 ? 15 : 40;
    const safetyBuffer = 70;  // 安全マージン
    const totalRequired = periodEndCost + riskCardBuffer + safetyBuffer;

    // 購入後に期末支払いを賄えるか
    const cashAfterPurchase = company.cash - cost;
    const canAfford = cashAfterPurchase >= totalRequired;

    if (!canAfford) {
        console.log(`[AI安全] ${company.name}: ¥${cost}の支出は危険（残り¥${cashAfterPurchase} < 必要¥${totalRequired}）→ 見送り`);
    }

    return canAfford;
}

// ============================================
// 改善アクション実行ヘルパー関数
// ============================================

/**
 * チップ購入実行（改善アクション用）
 */
function executeChipPurchase(company, companyIndex, chipType, cost, isExpress = false) {
    const period = gameState.currentPeriod;

    // 2期は通常購入、3期以降は特急購入
    const actualCost = (period >= 3 && !isExpress) ? cost : (isExpress ? 40 : 20);

    if (!aiCanAffordSafely(company, actualCost)) {
        console.log(`[チップ購入失敗] ${company.name}: 資金不足で${chipType}購入見送り`);
        return false;
    }

    // チップ上限チェック
    const maxChips = chipType === 'insurance' ? 1 : (chipType === 'computer' ? 2 : 5);
    if ((company.chips[chipType] || 0) >= maxChips) {
        console.log(`[チップ購入失敗] ${company.name}: ${chipType}チップ上限達成`);
        return false;
    }

    company.cash -= actualCost;

    if (period >= 3 && isExpress) {
        // 特急購入
        company.chips[chipType] = (company.chips[chipType] || 0) + 1;
        company.expressChipsPurchased[chipType] = (company.expressChipsPurchased[chipType] || 0) + 1;
    } else if (period === 2) {
        // 2期は今期使用
        company.chips[chipType] = (company.chips[chipType] || 0) + 1;
        company.chipsPurchasedThisPeriod[chipType] = (company.chipsPurchasedThisPeriod[chipType] || 0) + 1;
    } else {
        // 3期以降の次期繰越
        company.nextPeriodChips[chipType] = (company.nextPeriodChips[chipType] || 0) + 1;
    }

    const icons = { research: '🔬', education: '📚', advertising: '📢', insurance: '🛡️', computer: '💻' };
    incrementRow(companyIndex);
    showAIActionModal(company, `チップ購入${isExpress ? '(特急)' : ''}`, icons[chipType] || '🎯', `${chipType}チップ購入（改善）`);

    console.log(`[チップ購入成功] ${company.name}: ${chipType} (¥${actualCost})`);
    return true;
}

/**
 * アタッチメント購入実行
 */
function executeAttachmentPurchase(company, companyIndex) {
    const attachmentCost = 30;

    if (!aiCanAffordSafely(company, attachmentCost)) {
        console.log(`[アタッチメント購入失敗] ${company.name}: 資金不足`);
        return false;
    }

    // 小型機械でアタッチメントがないものを探す
    const machine = company.machines.find(m => m.type === 'small' && m.attachments === 0);
    if (!machine) {
        console.log(`[アタッチメント購入失敗] ${company.name}: 装着可能な機械なし`);
        return false;
    }

    company.cash -= attachmentCost;
    machine.attachments = 1;

    incrementRow(companyIndex);
    showAIActionModal(company, 'アタッチメント購入', '🔧', '製造能力+1（改善）');

    console.log(`[アタッチメント購入成功] ${company.name}`);
    return true;
}

/**
 * セールスマン採用実行
 */
function executeSalesmanHire(company, companyIndex) {
    const hireCost = 30;

    if (!aiCanAffordSafely(company, hireCost)) {
        console.log(`[採用失敗] ${company.name}: 資金不足でセールスマン採用見送り`);
        return false;
    }

    // 採用上限チェック
    if (company.salesmen >= (company.maxPersonnel || 2)) {
        console.log(`[採用失敗] ${company.name}: セールスマン採用上限`);
        return false;
    }

    company.cash -= hireCost;
    company.salesmen++;

    incrementRow(companyIndex);
    showAIActionModal(company, '人員採用', '👔', 'セールスマン採用（改善）');

    console.log(`[採用成功] ${company.name}: セールスマン（計${company.salesmen}名）`);
    return true;
}

/**
 * ワーカー採用実行
 */
function executeWorkerHire(company, companyIndex) {
    const hireCost = 30;

    if (!aiCanAffordSafely(company, hireCost)) {
        console.log(`[採用失敗] ${company.name}: 資金不足でワーカー採用見送り`);
        return false;
    }

    // 採用上限チェック
    if (company.workers >= (company.maxPersonnel || 2)) {
        console.log(`[採用失敗] ${company.name}: ワーカー採用上限`);
        return false;
    }

    company.cash -= hireCost;
    company.workers++;

    incrementRow(companyIndex);
    showAIActionModal(company, '人員採用', '👷', 'ワーカー採用（改善）');

    console.log(`[採用成功] ${company.name}: ワーカー（計${company.workers}名）`);
    return true;
}

// ============================================
// AI必ず行動する（待機禁止 - 常に最善のアクションを選択）
// ============================================
function aiDoNothing(company, originalReason = '') {
    const companyIndex = gameState.companies.indexOf(company);
    const period = gameState.currentPeriod;
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);
    const periodEndCost = calculatePeriodPayment(company);

    console.log(`[AI強制行動] ${company.name}: 元の理由「${originalReason}」→ 代替行動を探索`);

    // === 優先順位1: 製品があれば売る（確実に収入を得る） ===
    if (company.products > 0 && salesCapacity > 0) {
        console.log(`[AI強制行動] ${company.name}: 製品${company.products}個あり → 販売実行`);
        executeDefaultSale(company, Math.min(salesCapacity, company.products), 0.75);
        return;
    }

    // === 優先順位2: 仕掛品・材料があれば生産（製品を作る） ===
    // パイプライン維持チェック: 仕掛品のみ（材料なし）の場合は先に材料購入
    if (company.wip > 0 && company.materials === 0 && mfgCapacity > 0) {
        // 仕掛品のみで生産すると、次回パイプラインが切れる
        // → 先に材料を買って、次の生産で完成＋投入を同時実行
        const availableMarkets = gameState.markets.filter(m => m.currentStock > 0 && !m.closed);
        if (availableMarkets.length > 0 && company.cash >= 15) {
            console.log(`[AI強制行動] ${company.name}: 仕掛${company.wip}のみ → パイプライン維持で材料先購入`);
            executeDefaultMaterialPurchase(company, mfgCapacity);
            return;
        }
        // 材料購入できない場合のみ仕掛品完成
        console.log(`[AI強制行動] ${company.name}: 材料購入不可 → 仕掛品${company.wip}を完成`);
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    // 材料あり（+仕掛品あれば同時処理）→ 生産
    if (company.materials > 0 && mfgCapacity > 0 && company.workers > 0) {
        const canProduce = Math.min(mfgCapacity, company.materials + company.wip);
        if (canProduce > 0) {
            const produceType = company.wip > 0 ? '完成＋投入' : '投入のみ';
            console.log(`[AI強制行動] ${company.name}: 材料${company.materials}/仕掛${company.wip} → ${produceType}`);
            executeDefaultProduction(company, mfgCapacity);
            return;
        }
    }

    // === 優先順位3: 現金があれば材料仕入れ（サイクル開始） ===
    const materialCapacity = getMaterialCapacity(company);
    const canStoreMaterials = materialCapacity - company.materials;
    if (canStoreMaterials > 0 && company.cash >= 10) {
        const availableMarkets = gameState.markets.filter(m => m.currentStock > 0 && !m.closed);
        if (availableMarkets.length > 0) {
            const cheapest = availableMarkets.sort((a, b) => a.buyPrice - b.buyPrice)[0];
            const affordQty = Math.floor(company.cash / cheapest.buyPrice);
            const buyQty = Math.min(canStoreMaterials, cheapest.currentStock, affordQty, mfgCapacity || 1);
            if (buyQty > 0) {
                console.log(`[AI強制行動] ${company.name}: 材料仕入れ ${buyQty}個 @ ¥${cheapest.buyPrice}`);
                executeDefaultMaterialPurchase(company, buyQty);
                return;
            }
        }
    }

    // === 優先順位4: チップ購入（投資行動） ===
    const chipCost = period === 2 ? 20 : 40;
    if (company.cash >= chipCost + 20) {
        // 研究チップを優先（価格競争力）
        if ((company.chips.research || 0) < 3) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'research', chipCost);
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '🔬', `研究チップ購入（代替行動：${originalReason}）`);
            return;
        }
        // 広告チップ
        if ((company.chips.advertising || 0) < 2) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'advertising', chipCost);
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '📢', `広告チップ購入（代替行動：${originalReason}）`);
            return;
        }
        // 次期チップ（3期以降）
        if (period >= 3) {
            const nextTotal = (company.nextPeriodChips?.research || 0) +
                             (company.nextPeriodChips?.education || 0) +
                             (company.nextPeriodChips?.advertising || 0);
            if (nextTotal < 3) {
                company.cash -= 20;  // 次期チップは20円
                if ((company.nextPeriodChips?.education || 0) < 1) {
                    company.nextPeriodChips.education++;
                    incrementRow(companyIndex);
                    showAIActionModal(company, 'チップ購入(次期)', '📚', `次期用教育チップ（代替行動）`);
                } else {
                    company.nextPeriodChips.research++;
                    incrementRow(companyIndex);
                    showAIActionModal(company, 'チップ購入(次期)', '🔬', `次期用研究チップ（代替行動）`);
                }
                return;
            }
        }
    }

    // === 優先順位5: 人員採用（能力向上） ===
    if (company.cash >= 10) {
        if (company.workers < company.machines.length) {
            company.cash -= 5;
            company.workers++;
            company.maxPersonnel = Math.max(company.maxPersonnel || 2, company.workers + company.salesmen);
            incrementRow(companyIndex);
            showAIActionModal(company, '採用', '👷', `ワーカー採用（製造能力活用のため）`);
            return;
        }
        if (company.salesmen < 2 && salesCapacity < mfgCapacity) {
            company.cash -= 5;
            company.salesmen++;
            company.maxPersonnel = Math.max(company.maxPersonnel || 2, company.workers + company.salesmen);
            incrementRow(companyIndex);
            showAIActionModal(company, '採用', '🧑‍💼', `セールスマン採用（販売能力強化のため）`);
            return;
        }
    }

    // === 優先順位6: 材料を現金化（緊急時） ===
    if (company.materials > 0 && company.cash < periodEndCost) {
        const sellQty = Math.min(company.materials, 3);
        const revenue = sellQty * 8;
        company.materials -= sellQty;
        company.cash += revenue;
        incrementRow(companyIndex);
        logAction(companyIndex, '材料売却', `材料${sellQty}個を¥${revenue}で売却（資金確保）`, revenue, true);
        showAIActionModal(company, '材料売却', '📦', `材料${sellQty}個売却（資金確保：¥${revenue}）`);
        return;
    }

    // === 最終手段: 意図的な様子見（理由を明確に） ===
    // ここに到達するのは本当に行動不能な時のみ
    const statusReport = `現金¥${company.cash}, 材料${company.materials}, 仕掛${company.wip}, 製品${company.products}`;
    const strategicReason = determineStrategicWaitReason(company, originalReason);

    console.log(`[AI様子見] ${company.name}: ${strategicReason} (${statusReport})`);

    // 様子見でも行を消費する（意思決定として記録）
    incrementRow(companyIndex);
    logAction(companyIndex, '戦略的様子見', strategicReason, 0, true);
    showAIActionModal(company, '戦略的様子見', '🎯', strategicReason);
}

// 様子見の戦略的理由を判定
function determineStrategicWaitReason(company, originalReason) {
    const period = gameState.currentPeriod;
    const periodEndCost = calculatePeriodPayment(company);

    if (company.cash < 5) {
        return '資金枯渇：次の収入機会を待機';
    }
    if (company.materials === 0 && company.wip === 0 && company.products === 0) {
        return '在庫ゼロ：市場状況を観察中';
    }
    if (company.cash < periodEndCost * 0.5) {
        return '資金温存：期末支払いに備える';
    }
    if (period === 5 && company.currentRow > 20) {
        return '期末間近：リスク回避のため温存';
    }
    if (originalReason) {
        return `戦略判断：${originalReason}`;
    }
    return '市場分析中：最適なタイミングを計る';
}

// ============================================
// AIチップ購入ヘルパー（F計算用トラッキング付き）
// ============================================
function aiPurchaseChip(company, chipType, cost) {
    company.chips[chipType]++;
    const period = gameState.currentPeriod;
    if (period === 2) {
        company.chipsPurchasedThisPeriod[chipType] = (company.chipsPurchasedThisPeriod[chipType] || 0) + 1;
    } else if (cost === 40) {
        // 3期以降の特急購入
        company.expressChipsPurchased[chipType] = (company.expressChipsPurchased[chipType] || 0) + 1;
    }
    // 次期繰越（20円）はnextPeriodChipsで管理されるため、ここではトラッキング不要
}

// ============================================
// 🎯 G最大化マスター戦略
// G = MQ - F を毎期最大化するための統合戦略エンジン
// ============================================

/**
 * 各会社の最適行動を決定（G最大化の観点から）
 * @param {Object} company - 会社オブジェクト
 * @param {number} companyIndex - 会社インデックス
 * @param {Object} strategyParams - 戦略固有のパラメータ
 * @returns {Object} 最適行動 {action, params, reason}
 */
function getGMaximizingAction(company, companyIndex, strategyParams = {}) {
    const period = gameState.currentPeriod;
    const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);
    const periodEndCost = calculatePeriodPayment(company);
    const totalInventory = company.materials + company.wip + company.products;

    // 戦略パラメータのデフォルト値
    const params = {
        targetResearchChips: strategyParams.targetResearchChips || 3,
        targetEducationChips: strategyParams.targetEducationChips || 2,
        targetAdvertisingChips: strategyParams.targetAdvertisingChips || 1,
        aggressiveness: strategyParams.aggressiveness || 0.5, // 0-1
        safetyMultiplier: strategyParams.safetyMultiplier || 1.2  // 🛡️ 1.0→1.2に増加
    };

    // 🛡️ 強化された安全マージン計算（短期借入を絶対に避ける）
    // リスクカード対応 + 安全バッファ + 期末コストの余裕
    const riskCardBuffer = company.chips.insurance ? 15 : 40;
    const minSafetyBuffer = 60;
    const safetyMargin = Math.floor(periodEndCost * params.safetyMultiplier) + riskCardBuffer + minSafetyBuffer;
    const safeInvestment = Math.max(0, company.cash - safetyMargin);

    // 🛡️ 短期借入が発生しそうな状態か確認
    const willNeedShortTermLoan = company.cash < periodEndCost + 30;
    if (willNeedShortTermLoan && company.products > 0) {
        // 緊急売却モード - 短期借入回避のため製品を売る
        return {
            action: 'EMERGENCY_SELL',
            params: { priceMultiplier: 0.65, aggressive: true, qty: Math.min(company.products, salesCapacity) },
            reason: `⚠️ 短期借入回避: 現金¥${company.cash} < 期末必要¥${periodEndCost + 30}`
        };
    }

    // === 0. 在庫20個制限チェック（不良在庫発生リスク・既出カード考慮） ===
    // リスクカード「不良在庫発生」: 在庫20個超で全超過分没収
    // ただし、不良在庫発生カードが2回とも既出なら制限不要
    const inventoryCheck = (typeof AIBrain !== 'undefined' && AIBrain.checkInventoryRiskWithHistory)
        ? AIBrain.checkInventoryRiskWithHistory(company)
        : { totalInventory, canExceedLimit: false };

    const canExceedInventoryLimit = inventoryCheck.canExceedLimit;

    if (!canExceedInventoryLimit && totalInventory > 20 && company.products > 0) {
        const excessAmount = totalInventory - 20;
        const sellQty = Math.min(company.products, excessAmount, salesCapacity);
        if (sellQty > 0) {
            return {
                action: 'EMERGENCY_SELL',
                params: { priceMultiplier: 0.70, aggressive: true, qty: sellQty },
                reason: `★在庫超過警告★ ${totalInventory}個 → ${excessAmount}個売却必須`
            };
        }
    }
    // 在庫18以上で警告（余裕を持って売却）- ただしカード出尽くしなら不要
    if (!canExceedInventoryLimit && totalInventory >= 18 && company.products > 2 && salesCapacity > 0) {
        const preventiveSellQty = Math.min(company.products - 2, totalInventory - 15, salesCapacity);
        if (preventiveSellQty > 0) {
            return {
                action: 'SELL',
                params: { qty: preventiveSellQty, priceMultiplier: 0.80 },
                reason: `在庫警告: ${totalInventory}個 → 20個超過防止で${preventiveSellQty}個売却`
            };
        }
    }
    // 不良在庫発生が出尽くした場合のログ出力
    if (canExceedInventoryLimit && totalInventory > 20) {
        console.log(`[G最大化] 在庫${totalInventory}個だが、不良在庫発生は既出のため制限なし`);
    }

    // === 1. 緊急モード: 期末支払い不可能 ===
    if (company.cash < periodEndCost && company.products > 0) {
        return {
            action: 'EMERGENCY_SELL',
            params: { priceMultiplier: 0.60, aggressive: true },
            reason: '期末支払い危機：緊急販売'
        };
    }

    // === 2. 5期クリア条件優先 ===
    if (period === 5) {
        const nextChips = (company.nextPeriodChips?.research || 0) +
                          (company.nextPeriodChips?.education || 0) +
                          (company.nextPeriodChips?.advertising || 0);

        // チップ3枚未達
        if (nextChips < 3 && company.cash >= 40 + safetyMargin) {
            const chipOrder = ['education', 'research', 'advertising'];
            for (const chipType of chipOrder) {
                if (company.nextPeriodChips[chipType] < 1) {
                    return {
                        action: 'BUY_NEXT_CHIP',
                        params: { chipType, cost: 40 },
                        reason: `5期目標：次期${chipType}チップ (${nextChips+1}/3)`
                    };
                }
            }
            // 追加購入
            if (company.nextPeriodChips.research < 2) {
                return {
                    action: 'BUY_NEXT_CHIP',
                    params: { chipType: 'research', cost: 40 },
                    reason: `5期目標：次期研究チップ追加 (${nextChips+1}/3)`
                };
            }
        }

        // 在庫10個未達
        if (totalInventory < 10) {
            if (company.materials === 0 && company.wip === 0 && company.products === 0) {
                return { action: 'BUY_MATERIALS', params: { qty: mfgCapacity }, reason: '5期目標：在庫積み上げ' };
            }
            if (company.materials > 0 || company.wip > 0) {
                return { action: 'PRODUCE', params: { qty: mfgCapacity }, reason: '5期目標：製品化' };
            }
            if (company.products > 0 && company.materials === 0 && company.wip === 0) {
                return { action: 'BUY_MATERIALS', params: { qty: mfgCapacity }, reason: '5期目標：追加仕入れ' };
            }
        }

        // 在庫過剰（10以上）なら余剰分のみ売却
        if (totalInventory > 10 && company.products > 0) {
            const excessProducts = Math.min(company.products, totalInventory - 10);
            if (excessProducts > 0) {
                return {
                    action: 'SELL',
                    params: { qty: excessProducts, priceMultiplier: 0.75 },
                    reason: '5期目標：余剰在庫売却'
                };
            }
        }

        // 条件達成済み
        if (totalInventory >= 10 && nextChips >= 3) {
            return { action: 'WAIT', params: {}, reason: '5期クリア条件達成' };
        }
    }

    // === 3. 2期：戦略別に初手を完全分離（多様性確保） ===
    if (period === 2) {
        const strategy = company.strategy || 'balanced';
        console.log(`[2期初手] ${company.name} 戦略=${strategy} 材料=${company.materials} 仕掛=${company.wip} 製品=${company.products}`);

        // 戦略別に完全に分岐（在庫状態に関係なく戦略優先）
        switch (strategy) {
            case 'tech_focused':
                // 技術重視：チップ購入最優先
                if (company.chips.research < 2 && safeInvestment >= 20) {
                    return {
                        action: 'BUY_CHIP',
                        params: { chipType: 'research', cost: 20 },
                        reason: 'tech_focused：研究チップ最優先'
                    };
                }
                if (company.chips.education < 1 && safeInvestment >= 20) {
                    return {
                        action: 'BUY_CHIP',
                        params: { chipType: 'education', cost: 20 },
                        reason: 'tech_focused：教育チップ（能力向上）'
                    };
                }
                // チップ済みなら生産
                if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                    return { action: 'PRODUCE', params: { qty: mfgCapacity }, reason: 'tech_focused：生産へ移行' };
                }
                break;

            case 'aggressive':
                // 攻撃的：販売優先（現金回収→攻めの投資）
                if (company.products > 0 && salesCapacity > 0) {
                    return {
                        action: 'SELL',
                        params: { qty: Math.min(salesCapacity, company.products), priceMultiplier: 0.75 },
                        reason: 'aggressive：販売で現金回収'
                    };
                }
                // 販売不可なら広告チップ
                if (company.chips.advertising < 1 && safeInvestment >= 20) {
                    return {
                        action: 'BUY_CHIP',
                        params: { chipType: 'advertising', cost: 20 },
                        reason: 'aggressive：広告チップで販売力強化'
                    };
                }
                break;

            case 'price_focused':
                // 価格重視：材料仕入れ優先（安価仕入れ→高利益）
                if (company.cash > safetyMargin + 20 && totalInventory < 15) {
                    return {
                        action: 'BUY_MATERIALS',
                        params: { qty: Math.min(mfgCapacity, 3) },
                        reason: 'price_focused：材料仕入れ優先'
                    };
                }
                // 材料あれば生産
                if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                    return { action: 'PRODUCE', params: { qty: mfgCapacity }, reason: 'price_focused：生産' };
                }
                break;

            case 'conservative':
                // 保守的：保険チップ→教育チップ優先
                if (!company.chips.insurance && safeInvestment >= 20) {
                    return {
                        action: 'BUY_CHIP',
                        params: { chipType: 'insurance', cost: 20 },
                        reason: 'conservative：保険チップでリスク軽減'
                    };
                }
                if (company.chips.education < 1 && safeInvestment >= 20) {
                    return {
                        action: 'BUY_CHIP',
                        params: { chipType: 'education', cost: 20 },
                        reason: 'conservative：教育チップで安定成長'
                    };
                }
                // 生産で在庫確保
                if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                    return { action: 'PRODUCE', params: { qty: mfgCapacity }, reason: 'conservative：生産（在庫確保）' };
                }
                break;

            case 'unpredictable':
                // 予測不能：ランダム選択
                const randomActions = ['SELL', 'PRODUCE', 'BUY_CHIP', 'BUY_MATERIALS'];
                const randomChoice = randomActions[Math.floor(Math.random() * randomActions.length)];
                if (randomChoice === 'SELL' && company.products > 0 && salesCapacity > 0) {
                    return { action: 'SELL', params: { qty: 1, priceMultiplier: 0.80 }, reason: 'unpredictable：ランダム販売' };
                }
                if (randomChoice === 'PRODUCE' && (company.materials > 0 || company.wip > 0)) {
                    return { action: 'PRODUCE', params: { qty: mfgCapacity }, reason: 'unpredictable：ランダム生産' };
                }
                if (randomChoice === 'BUY_CHIP' && safeInvestment >= 20) {
                    const chips = ['research', 'education', 'advertising'];
                    const chip = chips[Math.floor(Math.random() * chips.length)];
                    return { action: 'BUY_CHIP', params: { chipType: chip, cost: 20 }, reason: `unpredictable：ランダム${chip}チップ` };
                }
                if (randomChoice === 'BUY_MATERIALS' && company.cash > safetyMargin + 20) {
                    return { action: 'BUY_MATERIALS', params: { qty: 2 }, reason: 'unpredictable：ランダム材料購入' };
                }
                break;

            case 'balanced':
            default:
                // バランス型：MQサイクル（販売→生産→仕入れ）
                if (company.products > 0 && salesCapacity > 0) {
                    return {
                        action: 'SELL',
                        params: { qty: Math.min(salesCapacity, company.products), priceMultiplier: 0.80 },
                        reason: 'balanced：販売（MQサイクル開始）'
                    };
                }
                if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                    return { action: 'PRODUCE', params: { qty: mfgCapacity }, reason: 'balanced：生産' };
                }
                if (company.cash > safetyMargin + 20) {
                    return { action: 'BUY_MATERIALS', params: { qty: mfgCapacity }, reason: 'balanced：材料仕入れ' };
                }
                break;
        }

        // フォールバック：上記に該当しない場合
        if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
            return { action: 'PRODUCE', params: { qty: mfgCapacity }, reason: '2期フォールバック：生産' };
        }
        if (company.cash > safetyMargin + 20) {
            return { action: 'BUY_MATERIALS', params: { qty: mfgCapacity }, reason: '2期フォールバック：材料仕入れ' };
        }
    }

    // === 4. 3-4期：次期チップ購入（4期後半） ===
    if (period >= 3 && period <= 4 && rowsRemaining > 5) {
        const nextChips = (company.nextPeriodChips?.research || 0) +
                          (company.nextPeriodChips?.education || 0) +
                          (company.nextPeriodChips?.advertising || 0);

        // 4期は積極的に次期チップ購入
        if (period === 4 && nextChips < 3 && safeInvestment >= 20) {
            const chipPriority = ['education', 'research', 'advertising'];
            for (const chipType of chipPriority) {
                if (company.nextPeriodChips[chipType] < 1) {
                    return {
                        action: 'BUY_NEXT_CHIP',
                        params: { chipType, cost: 20 },
                        reason: `次期${chipType}チップ先行購入（20円節約）`
                    };
                }
            }
        }
    }

    // === 5. 基本サイクル：販売→生産→仕入（MQサイクル） ===

    // 5-1. 販売（製品があり、販売能力がある）
    if (company.products > 0 && salesCapacity > 0) {
        // 5期は在庫調整優先
        if (period === 5 && totalInventory <= 10) {
            // 在庫10以下なら販売しない
        } else {
            const sellQty = Math.min(salesCapacity, company.products);
            const priceMultiplier = params.aggressiveness > 0.5 ? 0.78 : 0.85;
            return {
                action: 'SELL',
                params: { qty: sellQty, priceMultiplier },
                reason: 'MQサイクル：販売実行'
            };
        }
    }

    // 5-2. 生産（材料/仕掛品があり、製造能力がある）
    if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
        return {
            action: 'PRODUCE',
            params: { qty: mfgCapacity },
            reason: 'MQサイクル：生産実行'
        };
    }

    // 5-3. 材料仕入れ（在庫なし、または次サイクル準備）
    if (company.materials < mfgCapacity) {
        const materialCashReq = totalInventory === 0 ?
            safetyMargin + 10 : safetyMargin + 30;
        if (company.cash > materialCashReq) {
            return {
                action: 'BUY_MATERIALS',
                params: { qty: mfgCapacity },
                reason: 'MQサイクル：材料仕入れ'
            };
        }
    }

    // === 6. 追加投資（余剰資金活用） ===
    if (safeInvestment >= 20 && rowsRemaining > 5) {
        // 2期の追加チップ投資
        if (period === 2) {
            if (company.chips.research < 4) {
                return {
                    action: 'BUY_CHIP',
                    params: { chipType: 'research', cost: 20 },
                    reason: '余剰資金：研究チップ追加'
                };
            }
        }

        // 3期以降の能力バランス調整
        if (period >= 3 && mfgCapacity < salesCapacity && !company.chips.computer) {
            return {
                action: 'BUY_COMPUTER_CHIP',
                params: { cost: 15 },
                reason: '製造能力不足：コンピュータチップ'
            };
        }
    }

    // === 7. 3期以降：機械投資戦略（戦略別に分岐） ===
    if (period >= 3 && rowsRemaining > 4) {
        const smallMachines = company.machines.filter(m => m.type === 'small');
        const largeMachines = company.machines.filter(m => m.type === 'large');
        const attachableMachines = smallMachines.filter(m => m.attachments === 0);
        const machineCapacity = company.machines.reduce((sum, m) => {
            if (m.type === 'large') return sum + 4;
            return sum + (m.attachments > 0 ? 2 : 1);
        }, 0);

        // 戦略別の目標設定
        const strategyMachinePreference = {
            'aggressive': { preferLarge: true, targetCapacity: 5, investThreshold: 50 },
            'tech_focused': { preferLarge: true, targetCapacity: 4, investThreshold: 60 },
            'balanced': { preferLarge: false, targetCapacity: 4, investThreshold: 70 },
            'conservative': { preferLarge: false, targetCapacity: 3, investThreshold: 100 },
            'price_focused': { preferLarge: false, targetCapacity: 3, investThreshold: 80 },
            'unpredictable': { preferLarge: Math.random() > 0.5, targetCapacity: 4, investThreshold: 60 }
        };

        const pref = strategyMachinePreference[company.strategy] || strategyMachinePreference['balanced'];
        const targetMfgCapacity = Math.max(salesCapacity, pref.targetCapacity);
        const needsMoreCapacity = mfgCapacity < targetMfgCapacity;

        // 戦略によって大型機械を優先する会社
        if (pref.preferLarge && smallMachines.length > 0 && largeMachines.length === 0 &&
            company.workers >= 3 && safeInvestment >= pref.investThreshold) {
            const smallMachine = smallMachines[0];
            const bookValue = smallMachine.attachments > 0 ? 40 : 30;
            const salePrice = Math.floor(bookValue * 0.7);
            const netCost = 100 - salePrice;

            if (safeInvestment >= netCost) {
                return {
                    action: 'UPGRADE_TO_LARGE',
                    params: {
                        sellMachineIndex: company.machines.indexOf(smallMachine),
                        salePrice: salePrice,
                        purchaseCost: 100,
                        bookValue: bookValue
                    },
                    reason: `${company.strategy}戦略：大型機械へ投資（製造+3）`
                };
            }
        }

        if (needsMoreCapacity && safeInvestment >= 30) {
            // オプション1：アタッチメント購入（30円、+1能力）
            if (attachableMachines.length > 0) {
                return {
                    action: 'BUY_ATTACHMENT',
                    params: { cost: 30 },
                    reason: `製造能力向上：アタッチメント購入（${mfgCapacity}→${mfgCapacity + 1}）`
                };
            }

            // オプション2：小型機械購入（50円、+1能力、要ワーカー）
            if (safeInvestment >= 50 && company.workers > machineCapacity) {
                return {
                    action: 'BUY_SMALL_MACHINE',
                    params: { cost: 50 },
                    reason: `製造能力向上：小型機械購入（${mfgCapacity}→${mfgCapacity + 1}）`
                };
            }

            // オプション3：大型機械へのアップグレード（売却+購入）
            if (smallMachines.length > 0 && largeMachines.length === 0 &&
                company.workers >= 3 && safeInvestment >= 70) {
                const smallMachine = smallMachines[0];
                const bookValue = smallMachine.attachments > 0 ? 40 : 30;
                const salePrice = Math.floor(bookValue * 0.7);
                const netCost = 100 - salePrice;

                if (safeInvestment >= netCost) {
                    return {
                        action: 'UPGRADE_TO_LARGE',
                        params: {
                            sellMachineIndex: company.machines.indexOf(smallMachine),
                            salePrice: salePrice,
                            purchaseCost: 100,
                            bookValue: bookValue
                        },
                        reason: `設備更新：小型→大型機械（製造+3、長期成長）`
                    };
                }
            }
        }
    }

    return { action: 'WAIT', params: {}, reason: '最適行動なし' };
}

/**
 * 各戦略タイプの最適パラメータ
 *
 * チップ効果:
 * - 教育: 製造+1、販売+1（1枚のみ有効、2枚買うと1枚繰越）
 * - 研究: 価格競争力+2/枚（累積可、最重要）
 * - 広告: 販売+2/枚（セールスマン数まで有効）
 */
const STRATEGY_PARAMS = {
    aggressive: {
        // 攻撃型: 研究チップで入札を制する
        targetResearchChips: 4,      // 価格競争力+8（コール価格-8円）
        targetEducationChips: 1,     // 効果は1枚分のみ（+1製造、+1販売）
        targetAdvertisingChips: 1,   // 販売+2
        aggressiveness: 0.9,
        safetyMultiplier: 0.8
    },
    conservative: {
        // 堅実型: 安全重視、研究は最低限
        targetResearchChips: 2,      // 価格競争力+4
        targetEducationChips: 1,     // 効果は1枚分のみ
        targetAdvertisingChips: 0,
        aggressiveness: 0.3,
        safetyMultiplier: 1.5
    },
    balanced: {
        // バランス型: 均等に投資
        targetResearchChips: 3,      // 価格競争力+6
        targetEducationChips: 1,     // 効果は1枚分のみ
        targetAdvertisingChips: 1,
        aggressiveness: 0.5,
        safetyMultiplier: 1.0
    },
    price_focused: {
        // 販売重視型: 広告で販売量を稼ぐ
        targetResearchChips: 2,      // 価格競争力+4
        targetEducationChips: 1,     // 効果は1枚分のみ
        targetAdvertisingChips: 2,   // 販売+4（セールスマン2人必要）
        aggressiveness: 0.6,
        safetyMultiplier: 0.9
    },
    tech_focused: {
        // 技術特化型: 研究チップ全振り
        targetResearchChips: 5,      // 価格競争力+10（コール価格-10円）
        targetEducationChips: 1,     // 効果は1枚分のみ
        targetAdvertisingChips: 0,
        aggressiveness: 0.7,
        safetyMultiplier: 0.9
    },
    unpredictable: {
        // 予測不能型: ランダム
        targetResearchChips: Math.floor(Math.random() * 4) + 1,
        targetEducationChips: 1,     // 常に1枚（効果は1枚分のみ）
        targetAdvertisingChips: Math.floor(Math.random() * 2),
        aggressiveness: Math.random(),
        safetyMultiplier: 0.8 + Math.random() * 0.4
    }
};

/**
 * G最大化行動を実行
 */
function executeGMaximizingAction(company, companyIndex, action) {
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);

    switch (action.action) {
        case 'EMERGENCY_SELL':
        case 'SELL':
            executeDefaultSale(company, salesCapacity, action.params.priceMultiplier || 0.80);
            return true;

        case 'PRODUCE':
            executeDefaultProduction(company, mfgCapacity);
            return true;

        case 'BUY_MATERIALS':
            executeDefaultMaterialPurchase(company, action.params.qty || mfgCapacity);
            return true;

        case 'BUY_CHIP':
            company.cash -= action.params.cost;
            aiPurchaseChip(company, action.params.chipType, action.params.cost);
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入',
                action.params.chipType === 'research' ? '🔬' :
                action.params.chipType === 'education' ? '📚' : '📢',
                action.reason);
            return true;

        case 'BUY_NEXT_CHIP':
            company.cash -= action.params.cost;
            company.nextPeriodChips[action.params.chipType]++;
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入(次期)',
                action.params.chipType === 'research' ? '🔬' :
                action.params.chipType === 'education' ? '📚' : '📢',
                action.reason);
            return true;

        case 'BUY_COMPUTER_CHIP':
            company.cash -= action.params.cost;
            company.chips.computer = 1;
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '💻', action.reason);
            return true;

        case 'BUY_ATTACHMENT':
            // 小型機械にアタッチメントを追加
            const attachableMachine = company.machines.find(m => m.type === 'small' && m.attachments === 0);
            if (attachableMachine && company.cash >= action.params.cost) {
                company.cash -= action.params.cost;
                attachableMachine.attachments = 1;
                incrementRow(companyIndex);
                showAIActionModal(company, '設備投資', '🔧', action.reason, [
                    { label: '投資額', value: `¥${action.params.cost}` },
                    { label: '効果', value: '製造能力+1' }
                ]);
                return true;
            }
            return false;

        case 'BUY_SMALL_MACHINE':
            // 小型機械を購入
            if (company.cash >= action.params.cost) {
                company.cash -= action.params.cost;
                company.machines.push({ type: 'small', attachments: 0 });
                incrementRow(companyIndex);
                showAIActionModal(company, '設備投資', '🏭', action.reason, [
                    { label: '投資額', value: `¥${action.params.cost}` },
                    { label: '効果', value: '製造能力+1（要ワーカー）' }
                ]);
                return true;
            }
            return false;

        case 'UPGRADE_TO_LARGE':
            // 小型機械を売却して大型機械を購入
            const machineIndex = action.params.sellMachineIndex;
            if (machineIndex >= 0 && machineIndex < company.machines.length) {
                const soldMachine = company.machines[machineIndex];
                const loss = action.params.bookValue - action.params.salePrice;

                // 売却
                company.cash += action.params.salePrice;
                company.machines.splice(machineIndex, 1);
                company.specialLoss = (company.specialLoss || 0) + loss;

                // 購入
                company.cash -= action.params.purchaseCost;
                company.machines.push({ type: 'large', attachments: 0 });

                incrementRow(companyIndex);
                showAIActionModal(company, '設備更新', '🏗️', action.reason, [
                    { label: '売却収入', value: `¥${action.params.salePrice}` },
                    { label: '購入費用', value: `¥${action.params.purchaseCost}` },
                    { label: '特別損失', value: `¥${loss}` }
                ]);
                return true;
            }
            return false;

        case 'WAIT':
            aiDoNothing(company, action.reason);
            return true;

        default:
            return false;
    }
}

// ============================================
// AI期首戦略計画
// ============================================
function planAIPeriodStrategy(company, companyIndex) {
    const period = gameState.currentPeriod;
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);

    // === 1. 競争状況の分析（勝つためには何が必要か） ===
    const rivals = gameState.companies.filter((c, i) => i !== companyIndex);
    const myEquity = company.equity;
    const maxRivalEquity = Math.max(...rivals.map(c => c.equity));
    const avgRivalEquity = rivals.reduce((sum, c) => sum + c.equity, 0) / rivals.length;
    const equityGap = maxRivalEquity - myEquity;
    const isLeading = myEquity >= maxRivalEquity;
    const isBehind = equityGap > 50;

    // ライバルの研究チップ数
    const avgRivalResearch = rivals.reduce((sum, c) => sum + (c.chips.research || 0), 0) / rivals.length;
    const needsMoreResearch = company.chips.research < avgRivalResearch;

    // === 2. 期末必要資金を計算 ===
    const currentSalaryCost = calculateSalaryCost(company, period);
    const loanInterest = Math.floor((company.loans || 0) * INTEREST_RATES.longTerm) +
                         Math.floor((company.shortLoans || 0) * INTEREST_RATES.shortTerm);
    const mustPayAmount = currentSalaryCost + loanInterest;

    // === 3. リスクカード考慮 ===
    const riskBuffer = company.chips.insurance ? 10 : 30;

    // === 4. 採用コストシミュレート ===
    let unitCost = BASE_SALARY_BY_PERIOD[period] || 22;
    if (period >= 3 && gameState.wageMultiplier > 1) {
        unitCost = Math.round(unitCost * gameState.wageMultiplier);
    }
    const additionalCostPerPerson = unitCost * 1.5;

    // === 5. 投資可能額を計算 ===
    const safetyBuffer = 50 + riskBuffer;
    const availableForGrowth = company.cash - mustPayAmount - safetyBuffer;
    const maxAffordableHires = Math.floor(Math.max(0, availableForGrowth) / (additionalCostPerPerson + 5));

    // === 6. 性格別の勝つための戦略を決定 ===
    let winningStrategy = 'maintain';
    let useExpressChip = false;
    let chipPriority = [];
    let investmentPlan = [];

    switch (company.strategy) {
        case 'aggressive':
            if (period <= 3) {
                winningStrategy = 'expand_fast';
                investmentPlan = ['worker', 'salesman', 'machine'];
                chipPriority = ['education', 'research', 'advertising'];
                useExpressChip = isBehind && company.cash > mustPayAmount + 60;
            } else if (period === 4) {
                winningStrategy = isBehind ? 'all_in' : 'maintain_lead';
                useExpressChip = isBehind && equityGap > 50;
                chipPriority = isBehind ? ['research', 'research'] : ['nextPeriod:research', 'nextPeriod:education'];
            } else {
                winningStrategy = 'final_push';
                chipPriority = ['nextPeriod:education', 'nextPeriod:research', 'nextPeriod:advertising'];
            }
            break;

        case 'conservative':
            winningStrategy = 'steady_growth';
            useExpressChip = false;
            if (period === 2) {
                chipPriority = ['insurance', 'education', 'research'];
                investmentPlan = [];
            } else if (period >= 3) {
                chipPriority = ['nextPeriod:education', 'nextPeriod:research'];
                if (period === 5) chipPriority.push('nextPeriod:advertising');
            }
            break;

        case 'tech_focused':
            winningStrategy = 'tech_dominance';
            if (period === 2) {
                chipPriority = ['education', 'research', 'research', 'computer'];
                investmentPlan = ['worker'];
            } else if (period >= 3) {
                chipPriority = needsMoreResearch ?
                    ['research', 'nextPeriod:research'] :
                    ['nextPeriod:education', 'nextPeriod:research'];
                useExpressChip = needsMoreResearch && isBehind;
            }
            break;

        case 'price_focused':
            winningStrategy = 'price_war';
            if (period <= 3) {
                chipPriority = ['research', 'research', 'advertising'];
                investmentPlan = ['salesman', 'salesman'];
                useExpressChip = company.chips.research < avgRivalResearch;
            } else {
                chipPriority = ['research', 'nextPeriod:research', 'nextPeriod:advertising'];
            }
            break;

        case 'balanced':
            if (isLeading) {
                winningStrategy = 'consolidate';
                chipPriority = ['nextPeriod:education', 'nextPeriod:research'];
            } else if (isBehind) {
                winningStrategy = 'catch_up';
                useExpressChip = equityGap > 60 && company.cash > mustPayAmount + 80;
                chipPriority = useExpressChip ? ['research', 'advertising'] : ['nextPeriod:research', 'nextPeriod:education'];
            } else {
                winningStrategy = 'grow';
                chipPriority = period >= 3 ? ['nextPeriod:research', 'education'] : ['education', 'research'];
                investmentPlan = mfgCapacity < salesCapacity ? ['worker'] : ['salesman'];
            }
            if (period === 5) {
                chipPriority = ['nextPeriod:education', 'nextPeriod:research', 'nextPeriod:advertising'];
            }
            break;

        case 'unpredictable':
            const randomStrat = Math.floor(Math.random() * 4);
            winningStrategy = ['gamble', 'conservative', 'all_in', 'balanced'][randomStrat];
            useExpressChip = Math.random() > 0.6;
            chipPriority = ['research', 'education', 'advertising'].sort(() => Math.random() - 0.5);
            if (Math.random() > 0.5) {
                chipPriority = chipPriority.map(c => Math.random() > 0.5 ? 'nextPeriod:' + c : c);
            }
            investmentPlan = Math.random() > 0.5 ? ['worker', 'worker'] : ['salesman', 'machine'];
            break;

        default:
            chipPriority = ['education', 'research'];
    }

    // === 8. 期首選択の実行 ===
    if (!company.chips.computer && company.cash >= 15 + mustPayAmount + safetyBuffer) {
        company.cash -= 15;
        company.chips.computer = 1;
    }

    if (!company.chips.insurance &&
        (company.strategy === 'conservative' || company.strategy === 'balanced') &&
        company.cash >= 10 + mustPayAmount + safetyBuffer) {
        company.cash -= 10;
        company.chips.insurance = 1;
    }

    // === 9. 期の計画を設定 ===
    company.periodPlan = {
        isLeading: isLeading,
        isBehind: isBehind,
        equityGap: equityGap,
        avgRivalResearch: avgRivalResearch,
        winningStrategy: winningStrategy,
        useExpressChip: useExpressChip,
        chipPriority: chipPriority,
        investmentPlan: investmentPlan,
        targetMQ: isBehind ? Math.max(80, salesCapacity * 18) : Math.max(50, salesCapacity * 15),
        targetSales: Math.min(company.products + mfgCapacity, salesCapacity),
        canAffordHiring: maxAffordableHires > 0,
        maxHires: maxAffordableHires,
        mustPayAmount: mustPayAmount,
        riskBuffer: riskBuffer,
        availableForGrowth: availableForGrowth,
        actionsPerPeriod: Math.floor(15 * 0.8),
        plannedActions: []
    };

    const actions = [];
    if (investmentPlan.length > 0) {
        actions.push(`設備投資: ${investmentPlan.join(', ')}`);
    }
    if (chipPriority.length > 0) {
        actions.push(`チップ: ${chipPriority.slice(0, 2).join(', ')}`);
    }
    if (period === 5) {
        actions.push('在庫10個+次期チップ3枚');
    }
    if (useExpressChip) {
        actions.push('特急チップ使用');
    }
    company.periodPlan.plannedActions = actions;

    console.log(`[AI Plan] ${company.name} (${company.strategy}): ` +
                `戦略=${winningStrategy}, トップ差=${equityGap}円, ` +
                `特急=${useExpressChip}, 投資=${investmentPlan.join(',') || 'なし'}, ` +
                `チップ=${chipPriority.slice(0,2).join(',')}`);

    try {
        AIBrain.createPeriodPlan(company, companyIndex);
    } catch (e) {
        console.warn(`[AI] AIBrain計画策定エラー: ${e.message}`);
    }
}

// ============================================
// AI財務分析
// ============================================
function getAIFinancialAnalysis(company) {
    const period = gameState.currentPeriod;
    const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
    const periodsRemaining = 5 - period;

    const periodEndCost = calculatePeriodPayment(company);
    const fixedCost = calculateFixedCost(company);

    const rivals = gameState.companies.filter(c => c !== company);
    const avgRivalEquity = rivals.reduce((sum, c) => sum + c.equity, 0) / rivals.length;
    const maxRivalEquity = Math.max(...rivals.map(c => c.equity));
    const equityRank = gameState.companies.filter(c => c.equity > company.equity).length + 1;

    const salesCapacity = getSalesCapacity(company);
    const potentialSales = Math.min(company.products, salesCapacity);
    const estimatedPQ = potentialSales * 28;
    const estimatedMQ = estimatedPQ - (potentialSales * 15);

    const totalInventory = company.materials + company.wip + company.products;
    const needsMaterials = company.materials < 3;
    const needsProduction = company.wip > 0 || company.materials > company.wip;
    const canSell = company.products > 0 && salesCapacity > 0;

    // 🛡️ 短期借入回避のための強化されたセーフティ計算
    // periodEndCost + リスクカード対応バッファ + 安全マージン
    const riskCardBuffer = company.chips.insurance ? 15 : 40; // 保険なしは大きめのバッファ
    const minSafetyBuffer = 60; // 最低安全マージン
    const totalRequiredCash = periodEndCost + riskCardBuffer + minSafetyBuffer;
    const cashSafety = company.cash - periodEndCost;
    const isCashTight = company.cash < totalRequiredCash; // より厳しい判定

    const loanMultiplier = (period >= 4 && company.equity > 300) ? 1.0 : 0.5;
    const maxLongLoan = Math.round(company.equity * loanMultiplier);
    const availableLoan = Math.max(0, maxLongLoan - company.loans);
    const canBorrow = period >= 3 && availableLoan > 0;

    const mfgCapacity = getManufacturingCapacity(company);
    const researchChipTarget = AIBrain.getResearchChipTarget(company.strategy || 'balanced');
    const researchChipValue = periodsRemaining * 2 * 5;
    const shouldInvestForFuture = periodsRemaining >= 2 && !isCashTight && company.chips.research < researchChipTarget;

    const capacityBalance = mfgCapacity - salesCapacity;
    const needsCapacityBalance = Math.abs(capacityBalance) >= 2;

    const isFinalPeriod = period === 5;
    const nextPeriodChipsTotal = (company.nextPeriodChips?.research || 0) +
                                 (company.nextPeriodChips?.education || 0) +
                                 (company.nextPeriodChips?.advertising || 0);

    const inventoryTarget = 10;
    const chipsTarget = 3;
    const inventoryNeeded = Math.max(0, inventoryTarget - totalInventory);
    const chipsNeeded = Math.max(0, chipsTarget - nextPeriodChipsTotal);
    const period5GoalsMet = totalInventory >= inventoryTarget && nextPeriodChipsTotal >= chipsTarget;

    const isRecoveryPhase = period >= 4 && rowsRemaining < 10;

    let periodGoals = {};
    if (period === 2) {
        periodGoals = {
            priority: 'invest',
            targetResearchChips: 2,
            targetEducationChips: 1,
            shouldBuyMachine: mfgCapacity < salesCapacity,
            shouldHireSalesman: salesCapacity < mfgCapacity + 2,
            minCashReserve: 80,
            reason: 'Pを上げる研究チップとQを上げる教育チップに投資'
        };
    } else if (period === 3) {
        periodGoals = {
            priority: 'grow',
            targetResearchChips: 3,
            targetEducationChips: 1,
            shouldBuyMachine: mfgCapacity < 3 && company.cash > 150,
            shouldHireSalesman: salesCapacity < mfgCapacity,
            minCashReserve: 100,
            reason: 'MQを積み上げて自己資本を増やす'
        };
    } else if (period === 4) {
        periodGoals = {
            priority: 'optimize',
            targetResearchChips: 4,
            targetNextPeriodChips: 2,
            shouldBuyMachine: false,
            minCashReserve: 120,
            reason: '5期に向けて次期チップを購入開始'
        };
    } else if (period === 5) {
        periodGoals = {
            priority: 'final',
            targetInventory: 10,
            targetNextPeriodChips: 3,
            shouldBuyMachine: false,
            minCashReserve: periodEndCost,
            reason: '在庫10個以上＋次期チップ3枚以上を達成'
        };
    }

    const expectedInventory = company.materials + company.wip + company.products +
                              (needsMaterials ? Math.min(3, mfgCapacity) : 0);
    const materialCapacity = getMaterialCapacity(company);
    const productCapacity = getProductCapacity(company);
    const needsWarehouse = (expectedInventory > 5 && company.warehouses === 0) ||
                           (expectedInventory > 10 && company.warehouses === 1);
    const warehouseLocation = company.materials > company.products ? 'materials' : 'products';

    const chipPriority = [];
    const minEduChipsForAnalysis = period === 2 ? 2 : 1;
    if (company.chips.education < minEduChipsForAnalysis) chipPriority.push('education');
    if (company.chips.research < periodGoals.targetResearchChips) chipPriority.push('research');
    if (capacityBalance > 2) chipPriority.push('advertising');
    if (capacityBalance < -2) chipPriority.push('computer');

    return {
        period,
        periodsRemaining,
        rowsRemaining,
        periodEndCost,
        totalRequiredCash,  // 🛡️ 短期借入回避用の必要現金
        riskCardBuffer,     // リスクカード対応バッファ
        fixedCost,
        avgRivalEquity,
        maxRivalEquity,
        equityRank,
        estimatedMQ,
        totalInventory,
        needsMaterials,
        needsProduction,
        canSell,
        cashSafety,
        isCashTight,
        maxLongLoan,
        canBorrow,
        shouldInvestForFuture,
        researchChipValue,
        capacityBalance,
        needsCapacityBalance,
        isFinalPeriod,
        isRecoveryPhase,
        nextPeriodChipsTotal,
        inventoryNeeded,
        chipsNeeded,
        period5GoalsMet,
        periodGoals,
        chipPriority,
        needsWarehouse,
        warehouseLocation,
        expectedInventory,
        materialCapacity,
        productCapacity,
        mfgCapacity,
        salesCapacity,
        shouldSellFirst: canSell && isCashTight && !isFinalPeriod,
        shouldInvest: !isCashTight && rowsRemaining > 10 && !isRecoveryPhase,
        shouldBeAggressive: equityRank > 3 && rowsRemaining > 5 && !isFinalPeriod,
        shouldHireWorker: periodGoals.shouldBuyMachine || (mfgCapacity < salesCapacity && company.workers < company.machines.length),
        shouldHireSalesman: periodGoals.shouldHireSalesman || (salesCapacity < mfgCapacity && company.salesmen < 3),
        shouldImproveCapacity: needsCapacityBalance && rowsRemaining > 10
    };
}

// ============================================
// 2期の初手を性格に応じて決定
// ============================================
function getFirstMoveByStrategy(company, mfgCapacity, salesCapacity) {
    const strategy = company.strategy;
    const cheapMarkets = gameState.markets.filter(m => m.currentStock > 0 && !m.closed && m.buyPrice <= 12);
    const hasCheapMaterials = cheapMarkets.length > 0;
    const normalMarkets = gameState.markets.filter(m => m.currentStock > 0 && !m.closed && m.buyPrice <= 15);
    const hasNormalMaterials = normalMarkets.length > 0;
    const periodEndCost = calculatePeriodPayment(company);

    switch (strategy) {
        case 'aggressive':
            if (Math.random() < 0.7 && company.chips.education === 0 && company.cash > periodEndCost + 30) {
                return { action: 'BUY_CHIP', chipType: 'education' };
            }
            if (company.chips.research === 0 && company.cash > periodEndCost + 40) {
                return { action: 'BUY_CHIP', chipType: 'research' };
            }
            if (hasCheapMaterials && company.cash > periodEndCost + 30) {
                return { action: 'BUY_MATERIALS', qty: 3 };
            }
            return null;

        case 'conservative':
            if (company.chips.education === 0 && company.cash > periodEndCost + 30) {
                return { action: 'BUY_CHIP', chipType: 'education' };
            }
            if (hasCheapMaterials && company.cash > periodEndCost + 30) {
                return { action: 'BUY_MATERIALS', qty: 2 };
            }
            return null;

        case 'price_focused':
            if (hasCheapMaterials) {
                return { action: 'BUY_MATERIALS', qty: 4 };
            }
            if (hasNormalMaterials && company.cash > periodEndCost + 40) {
                return { action: 'BUY_MATERIALS', qty: 3 };
            }
            return null;

        case 'tech_focused':
            if (company.chips.education === 0 && company.cash > periodEndCost + 30) {
                return { action: 'BUY_CHIP', chipType: 'education' };
            }
            if (company.chips.research === 0 && company.cash > periodEndCost + 30) {
                return { action: 'BUY_CHIP', chipType: 'research' };
            }
            return null;

        case 'balanced':
            const rand = Math.random();
            if (rand < 0.8 && company.chips.education === 0 && company.cash > periodEndCost + 30) {
                return { action: 'BUY_CHIP', chipType: 'education' };
            }
            if (company.chips.research === 0 && company.cash > periodEndCost + 30) {
                return { action: 'BUY_CHIP', chipType: 'research' };
            }
            if (hasCheapMaterials && company.cash > periodEndCost + 30) {
                return { action: 'BUY_MATERIALS', qty: 2 };
            }
            return null;

        case 'unpredictable':
            const actions = ['PRODUCE', 'BUY_MATERIALS', 'BUY_CHIP'];
            const randomAction = actions[Math.floor(Math.random() * actions.length)];
            if (randomAction === 'BUY_MATERIALS') {
                if (hasCheapMaterials) {
                    return { action: 'BUY_MATERIALS', qty: Math.floor(Math.random() * 3) + 1 };
                } else if (hasNormalMaterials && company.cash > periodEndCost + 50) {
                    return { action: 'BUY_MATERIALS', qty: Math.floor(Math.random() * 2) + 1 };
                }
            } else if (randomAction === 'BUY_CHIP' && company.cash > periodEndCost + 30) {
                const chipTypes = ['research', 'education', 'advertising'];
                return { action: 'BUY_CHIP', chipType: chipTypes[Math.floor(Math.random() * chipTypes.length)] };
            }
            return null;

        default:
            return null;
    }
}

// ============================================
// AIBrain形式 → GMaxAction形式へのコンバーター
// ============================================
function convertUltimateToGMaxAction(ultimateDecision, company, mfgCapacity, salesCapacity) {
    const actionType = ultimateDecision.action?.type || 'WAIT';
    const quantity = ultimateDecision.action?.quantity;
    const reason = ultimateDecision.reasoning?.longTermPlan ||
                   ultimateDecision.reasoning?.dynamicMode ||
                   `究極AI決定 (信頼度${(ultimateDecision.confidence * 100).toFixed(0)}%)`;

    switch (actionType) {
        case 'SELL':
            return {
                action: 'SELL',
                params: {
                    qty: quantity || Math.min(company.products, salesCapacity),
                    priceMultiplier: 0.80
                },
                reason: reason
            };
        case 'PRODUCE':
        case 'COMPLETE':
            return {
                action: 'PRODUCE',
                params: { qty: quantity || mfgCapacity },
                reason: reason
            };
        case 'BUY_MATERIALS':
            return {
                action: 'BUY_MATERIALS',
                params: { qty: quantity || mfgCapacity },
                reason: reason
            };
        case 'BUY_CHIP':
            return {
                action: 'BUY_CHIP',
                params: {
                    chipType: ultimateDecision.action?.chipType || 'research',
                    cost: gameState.currentPeriod === 2 ? 20 : 40
                },
                reason: reason
            };
        case 'WAIT':
        default:
            return {
                action: 'WAIT',
                params: {},
                reason: reason
            };
    }
}

// ============================================
// AI性格別の戦略実行（超強化AI: 統合意思決定エンジン）
// ============================================
function executeAIStrategyByType(company, mfgCapacity, salesCapacity, analysis) {
    const companyIndex = gameState.companies.indexOf(company);
    const period = gameState.currentPeriod;
    const currentRow = company.currentRow || 1;

    // =========================================================
    // 【最優先】2期初手：戦略別に多様な行動を強制
    // 初期状態: 材料1、仕掛品2、製品1、製造能力1、販売能力2
    // これを最初に評価し、他のロジックより優先する
    // =========================================================
    if (period === 2 && currentRow <= 5) {
        const strategy = company.strategy || 'balanced';
        const safeInvestment = company.cash - 80;
        const hasProducts = company.products > 0;
        const researchChips = company.chips.research || 0;
        const educationChips = company.chips.education || 0;
        const advertisingChips = company.chips.advertising || 0;

        console.log(`[2期初手] ${company.name} 戦略=${strategy} 行=${currentRow} 材料=${company.materials} 仕掛=${company.wip} 製品=${company.products} 現金=${company.cash}`);

        // 2期初手は戦略別に完全分岐（サイクル最適化より優先）
        let forcedAction = null;

        switch (strategy) {
            case 'tech_focused':
                // 技術重視：研究チップ3枚目標→教育チップ1枚→コンピュータ
                // 2期中に研究チップを最大限積み上げて3期以降の価格競争力を確保
                if (researchChips < 3 && safeInvestment >= 20) {
                    forcedAction = { action: 'BUY_CHIP', params: { chipType: 'research', cost: 20 }, reason: `tech_focused: 研究チップ${researchChips+1}枚目（価格+2）` };
                } else if (educationChips < 1 && safeInvestment >= 20) {
                    forcedAction = { action: 'BUY_CHIP', params: { chipType: 'education', cost: 20 }, reason: 'tech_focused: 教育チップ（能力+1）' };
                }
                break;

            case 'aggressive':
                // 攻撃的：広告チップ→即売り→高速サイクル
                // 販売力を上げて早くMQを稼ぐ
                if (advertisingChips < 1 && safeInvestment >= 20) {
                    forcedAction = { action: 'BUY_CHIP', params: { chipType: 'advertising', cost: 20 }, reason: 'aggressive: 広告チップ（販売力+2）' };
                } else if (hasProducts && salesCapacity > 0) {
                    forcedAction = { action: 'SELL', params: { qty: Math.min(salesCapacity, company.products), priceMultiplier: 0.85 }, reason: 'aggressive: 即販売でMQ獲得' };
                } else if (researchChips < 1 && safeInvestment >= 20) {
                    forcedAction = { action: 'BUY_CHIP', params: { chipType: 'research', cost: 20 }, reason: 'aggressive: 研究チップ（入札優位）' };
                }
                break;

            case 'price_focused':
                // 価格重視：研究チップ優先（入札で勝つため）→材料仕入れ
                if (researchChips < 2 && safeInvestment >= 20) {
                    forcedAction = { action: 'BUY_CHIP', params: { chipType: 'research', cost: 20 }, reason: `price_focused: 研究チップ${researchChips+1}枚目（価格優位）` };
                } else if (company.materials <= 1 && safeInvestment >= 30) {
                    forcedAction = { action: 'BUY_MATERIALS', params: { qty: 2 }, reason: 'price_focused: 材料仕入れ（在庫確保）' };
                }
                break;

            case 'conservative':
                // 保守的：教育チップ→研究チップ（安定的な成長）
                // 保険は期首処理で購入済み
                if (educationChips < 1 && safeInvestment >= 20) {
                    forcedAction = { action: 'BUY_CHIP', params: { chipType: 'education', cost: 20 }, reason: 'conservative: 教育チップ（製造販売+1）' };
                } else if (researchChips < 1 && safeInvestment >= 20) {
                    forcedAction = { action: 'BUY_CHIP', params: { chipType: 'research', cost: 20 }, reason: 'conservative: 研究チップ（安定投資）' };
                } else if (hasProducts && salesCapacity > 0) {
                    forcedAction = { action: 'SELL', params: { qty: 1, priceMultiplier: 0.90 }, reason: 'conservative: 慎重に1個販売' };
                }
                break;

            case 'unpredictable':
                // 予測不能：完全ランダム
                const actions = [];
                if (safeInvestment >= 20) {
                    actions.push({ action: 'BUY_CHIP', params: { chipType: ['research', 'education', 'advertising'][Math.floor(Math.random() * 3)], cost: 20 }, reason: 'unpredictable: ランダムチップ' });
                }
                if (hasProducts && salesCapacity > 0) {
                    actions.push({ action: 'SELL', params: { qty: Math.ceil(Math.random() * company.products), priceMultiplier: 0.70 + Math.random() * 0.25 }, reason: 'unpredictable: ランダム販売' });
                }
                if (safeInvestment >= 30) {
                    actions.push({ action: 'BUY_MATERIALS', params: { qty: Math.ceil(Math.random() * 3) }, reason: 'unpredictable: ランダム仕入れ' });
                }
                actions.push({ action: 'PRODUCE', params: {}, reason: 'unpredictable: ランダム生産' });
                if (actions.length > 0) {
                    forcedAction = actions[Math.floor(Math.random() * actions.length)];
                }
                break;

            case 'balanced':
            default:
                // バランス型：製品があれば販売→研究チップ→材料仕入れ
                if (hasProducts && salesCapacity > 0 && currentRow <= 3) {
                    forcedAction = { action: 'SELL', params: { qty: Math.min(salesCapacity, company.products), priceMultiplier: 0.80 }, reason: 'balanced: 製品販売でMQ獲得' };
                } else if (researchChips < 1 && safeInvestment >= 20) {
                    forcedAction = { action: 'BUY_CHIP', params: { chipType: 'research', cost: 20 }, reason: 'balanced: 研究チップ（基礎投資）' };
                } else if (company.materials <= 1 && safeInvestment >= 30) {
                    forcedAction = { action: 'BUY_MATERIALS', params: { qty: 2 }, reason: 'balanced: 材料仕入れ' };
                }
                break;
        }

        if (forcedAction) {
            console.log(`[2期初手実行] ${company.name}: ${forcedAction.action} - ${forcedAction.reason}`);
            if (executeGMaximizingAction(company, companyIndex, forcedAction)) {
                return; // 成功したら終了
            }
            console.log(`[2期初手失敗] ${company.name}: ${forcedAction.action}が実行できなかった`);
        }
        // 強制アクションがない or 失敗した場合は通常ロジックへ
    }

    // === 【動的戦略エンジン】競合観察＋行別計画＋サイクル最適化 ===
    const strategicPlan = getStrategicPlan(company, period);
    const dynamicAction = getDynamicAction(company, companyIndex);
    const cycleAction = optimizeCycleAction(company, strategicPlan);

    // 戦略評価とスコア追跡
    if (currentRow === 1 || currentRow % 5 === 0) {
        logStrategyEvaluation(company, period);
    }
    trackScoreProgress(company, period);

    // === 【自己改善システム】120点達成に向けた自動改善 ===
    const improvementAction = applyImprovementAction(company, period);
    if (improvementAction) {
        console.log(`[自己改善実行] ${company.name}: ${improvementAction.type} - ${improvementAction.reason}`);

        // 改善アクションを実行
        let executed = false;
        switch (improvementAction.type) {
            case 'SELL':
                if (company.products > 0 && salesCapacity > 0) {
                    executeDefaultSale(company, improvementAction.qty || Math.min(salesCapacity, company.products), improvementAction.priceMultiplier || 0.75);
                    executed = true;
                }
                break;
            case 'PRODUCE':
                if ((company.wip > 0 || company.materials > 0) && mfgCapacity > 0) {
                    executeDefaultProduction(company, mfgCapacity);
                    executed = true;
                }
                break;
            case 'BUY_CHIP':
                executed = executeChipPurchase(company, companyIndex, improvementAction.chipType, improvementAction.cost, improvementAction.express);
                break;
            case 'BUY_ATTACHMENT':
                executed = executeAttachmentPurchase(company, companyIndex);
                break;
            case 'HIRE_SALESMAN':
                executed = executeSalesmanHire(company, companyIndex);
                break;
            case 'HIRE_WORKER':
                executed = executeWorkerHire(company, companyIndex);
                break;
        }

        if (executed) {
            return;  // 改善アクションが実行されたら終了
        }
    }

    console.log(`[戦略計画] ${company.name}: 期${period} 残${strategicPlan.currentState.rowsRemaining}行 残${strategicPlan.currentState.cyclesRemaining}サイクル`);
    console.log(`  目標MQ: ${strategicPlan.target.mqRequired} 達成可能性: ${strategicPlan.projection.achievability}%`);
    console.log(`  動的判断: ${dynamicAction.action} - ${dynamicAction.reason}`);
    console.log(`  サイクル判断: ${cycleAction.phase} - ${cycleAction.reason}`);

    // 期末の在庫戦略（重要：次期に繋げる！）
    // ※期末在庫処分は間違い。次期開始時に在庫があると有利
    // ※5期のみ例外：終了時在庫10個以上で良いので、超過分は売却可
    if (strategicPlan.currentState.rowsRemaining <= 5) {
        const totalInventory = company.materials + company.wip + company.products;
        const isFinalPeriod = period === 5;

        if (isFinalPeriod) {
            // 5期終了時：在庫10個以上キープ、超過分のみ売却
            const excessProducts = Math.max(0, company.products - 10);
            if (excessProducts > 0 && salesCapacity > 0) {
                console.log(`[5期最終] ${company.name}: 在庫10個キープ、超過${excessProducts}個を売却`);
                executeDefaultSale(company, Math.min(salesCapacity, excessProducts), 0.75);
                return;
            }
            // 在庫10個未満なら生産して積み上げ
            if (totalInventory < 10 && (company.wip > 0 || company.materials > 0) && mfgCapacity > 0) {
                console.log(`[5期最終] ${company.name}: 在庫${totalInventory}個→10個目標で生産`);
                executeDefaultProduction(company, mfgCapacity);
                return;
            }
        } else {
            // 2-4期：在庫を次期に繋げる（売らない！生産して製品を増やす）
            // ただしパイプライン維持を考慮：
            // - 仕掛品のみ → 完成させず次期に持越し（次期で材料購入+完成投入同時）
            // - 材料あり → 投入実行（次期で仕掛品から開始可能）
            if (company.wip > 0 && company.materials === 0) {
                // 仕掛品のみ: 完成させると次期で2行かかる
                // → 仕掛品のまま持ち越し、次期初手で材料購入してから生産
                console.log(`[期末継続] ${company.name}: 仕掛品${company.wip}個を次期に持越し（パイプライン維持）`);
                // 何もしないで次の行へ進む（強制行動があれば別の行動を選択）
                aiDoNothing(company, '期末パイプライン維持');
                return;
            }
            if (company.materials > 0 && mfgCapacity > 0) {
                // 材料あり → 投入実行
                const action = company.wip > 0 ? '完成＋投入' : '投入のみ';
                console.log(`[期末継続] ${company.name}: ${action}で次期に繋げる（在庫${totalInventory}個）`);
                executeDefaultProduction(company, mfgCapacity);
                return;
            }
            // 製品しかない場合も基本的に売らない（次期初手で売れる）
            // ただし現金が極端に少ない場合のみ売却
            if (company.products > 0 && company.cash < 30) {
                console.log(`[期末緊急] ${company.name}: 現金不足で1個のみ売却`);
                executeDefaultSale(company, 1, 0.70);
                return;
            }
        }
    }

    // サイクル最適化に従って行動（優先度CRITICAL/HIGHの場合）
    if (cycleAction.priority === 'CRITICAL' || cycleAction.priority === 'HIGH') {
        let executed = false;

        switch (cycleAction.phase) {
            case 'SELL':
                if (company.products > 0 && salesCapacity > 0) {
                    executeDefaultSale(company, cycleAction.qty || Math.min(salesCapacity, company.products), 0.80);
                    executed = true;
                }
                break;
            case 'PRODUCE':
                if ((company.wip > 0 || company.materials > 0) && mfgCapacity > 0) {
                    executeDefaultProduction(company, mfgCapacity);
                    executed = true;
                }
                break;
            case 'BUY':
                const safetyMargin = (PERIOD_STRATEGY_TARGETS[period]?.riskBuffer || 20) + 50;
                if (company.cash > safetyMargin + 10) {
                    executeDefaultMaterialPurchase(company, cycleAction.qty || mfgCapacity);
                    executed = true;
                }
                break;
        }

        if (executed) {
            return;
        }
    }

    // 2期初手ロジックは関数冒頭で処理済み

    // === 自己資本450目標戦略 ===
    if (AIBrain.getEquityMaximizingAction) {
        const equityAction = AIBrain.getEquityMaximizingAction(company, companyIndex);
        if (equityAction.confidence >= 0.85) {
            const convertedAction = convertUltimateToGMaxAction(equityAction, company, mfgCapacity, salesCapacity);
            console.log(`[自己資本戦略採用] ${company.name}: ${convertedAction.action} - ${equityAction.reason}`);
            AIBrain.recordAction(companyIndex, convertedAction.action, 'pending');
            if (executeGMaximizingAction(company, companyIndex, convertedAction)) {
                return;
            }
        }
    }

    // === 究極AI: 全機能統合意思決定 ===
    // ゲーム理論 + モンテカルロ + 期待値 + 学習 + リスク + 長期最適化 + Q学習
    const ultimateDecision = AIBrain.makeUltimateDecision(company, companyIndex);
    const actionType = ultimateDecision.action?.type || 'WAIT';
    console.log(`[究極AI] ${company.name}: ${actionType} (信頼度${(ultimateDecision.confidence * 100).toFixed(0)}%)`);
    console.log(`  スコア: Base=${ultimateDecision.components?.base?.toFixed(0) || 0}, Risk=${ultimateDecision.components?.riskAdjusted?.toFixed(0) || 0}, LT=${ultimateDecision.components?.longTerm?.toFixed(0) || 0}, RL=${ultimateDecision.components?.rl?.toFixed(0) || 0}`);
    console.log(`  長期計画: ${ultimateDecision.reasoning?.longTermPlan || 'なし'}`);
    console.log(`  リスク調整: ${ultimateDecision.reasoning?.riskAdjustment || 'N/A'}, Q値: ${ultimateDecision.reasoning?.rlQValue || 'N/A'}`);

    // 相手戦略推定をログ
    for (let i = 1; i < gameState.companies.length; i++) {
        if (i !== companyIndex) {
            const estimated = AIBrain.estimateOpponentStrategy(i);
            const nextAction = AIBrain.predictOpponentNextAction(i);
            console.log(`  [対${gameState.companies[i].name}] 推定戦略:${estimated}, 次の行動:${nextAction.action}(${(nextAction.probability * 100).toFixed(0)}%)`);
        }
    }

    // === 動的戦略調整 ===
    const dynamicAdj = AIBrain.dynamicStrategyAdjustment(company, companyIndex);
    console.log(`[動的調整] ${company.name}: ${dynamicAdj.reasoning}`);

    // === 複数ターン先読み ===
    const futureSim = AIBrain.simulateFutureTurns(company, companyIndex, 3);
    console.log(`[先読み] ${company.name}: ${futureSim.reasoning}`);

    // === リスクカード観察 ===
    if (AIBrain.analyzeDrawnRiskCards) {
        const riskAnalysis = AIBrain.analyzeDrawnRiskCards();
        console.log(`[リスク観察] 既出${riskAnalysis.totalDrawn}枚/残り${riskAnalysis.remainingCards}枚`);

        // 出尽くしカードがあれば表示
        const exhaustedCards = Object.entries(riskAnalysis.cardAnalysis)
            .filter(([name, info]) => info.isExhausted)
            .map(([name]) => name);
        if (exhaustedCards.length > 0) {
            console.log(`  ★出尽くし: ${exhaustedCards.join(', ')}`);
        }

        // 戦略推奨を取得して表示
        const riskRecs = AIBrain.getRiskBasedRecommendations(company);
        for (const rec of riskRecs.recommendations) {
            console.log(`  ★推奨: ${rec.message}`);
        }
    }

    // === 究極AI意思決定を優先使用（信頼度70%以上） ===
    if (ultimateDecision.confidence >= 0.70 && actionType !== 'WAIT') {
        const convertedAction = convertUltimateToGMaxAction(ultimateDecision, company, mfgCapacity, salesCapacity);
        console.log(`[究極AI採用] ${company.name}: ${convertedAction.action} - ${convertedAction.reason}`);
        AIBrain.recordAction(companyIndex, convertedAction.action, 'pending');
        if (executeGMaximizingAction(company, companyIndex, convertedAction)) {
            return;
        }
    }

    // === G最大化マスター戦略（フォールバック） ===
    const strategyParams = STRATEGY_PARAMS[company.strategy] || STRATEGY_PARAMS.balanced;

    // 学習による調整を取得
    const learnedAdj = AIBrain.getLearnedStrategyAdjustment(company, companyIndex);

    // 動的調整 + 学習調整を反映
    const adjustedParams = {
        ...strategyParams,
        aggressiveness: Math.min(1, strategyParams.aggressiveness +
            (dynamicAdj.aggressiveness - 0.5) * 0.5 +
            learnedAdj.aggressivenessBonus),
        safetyMultiplier: strategyParams.safetyMultiplier *
            (1 + (0.5 - dynamicAdj.riskTolerance) * 0.3),
        targetResearchChips: strategyParams.targetResearchChips + learnedAdj.researchChipBonus
    };

    const gMaxAction = getGMaximizingAction(company, companyIndex, adjustedParams);

    if (gMaxAction && gMaxAction.action !== 'WAIT') {
        console.log(`[G最大化] ${company.name}: ${gMaxAction.action} - ${gMaxAction.reason}`);
        // 行動を記録（学習用）
        AIBrain.recordAction(companyIndex, gMaxAction.action, 'pending');
        if (executeGMaximizingAction(company, companyIndex, gMaxAction)) {
            return;
        }
    }

    // === フォールバック：従来ロジック ===
    const periodEndCost = calculatePeriodPayment(company);
    const safetyBuffer = AIBrain.getOptimalSafetyBuffer(company.strategy || 'balanced');
    const minRequiredCash = periodEndCost + safetyBuffer;
    const safeInvestmentAmount = Math.max(0, company.cash - minRequiredCash);
    const canPayPeriodEnd = company.cash >= periodEndCost;

    if (!canPayPeriodEnd && company.products > 0 && salesCapacity > 0) {
        console.log(`[AI危機] ${company.name}: 期末支払い不可能！緊急販売モード`);
        executeDefaultSale(company, salesCapacity, 0.60);
        return;
    }

    const planProgress = AIBrain.checkPlanProgress(company, companyIndex);
    if (planProgress && planProgress.needsAdjustment) {
        console.log(`[AI計画修正] ${company.name}: 計画進捗不良、調整が必要`);
    }

    const brainDecision = AIBrain.decideOptimalAction(company, companyIndex);
    console.log(`[AIBrain] ${company.name}: ${brainDecision.action} - ${brainDecision.reason}`);

    // 2期の初手を性格に応じて多様化
    if (period === 2 && company.currentRow <= 3) {
        const firstMoveAction = getFirstMoveByStrategy(company, mfgCapacity, salesCapacity);
        if (firstMoveAction) {
            console.log(`[AI初手] ${company.name}: ${firstMoveAction.action}`);
            if (firstMoveAction.action === 'BUY_MATERIALS') {
                executeDefaultMaterialPurchase(company, firstMoveAction.qty || mfgCapacity);
                return;
            } else if (firstMoveAction.action === 'BUY_CHIP') {
                const chipCost = 20;
                // 🛡️ 短期借入回避チェック
                if (aiCanAffordSafely(company, chipCost)) {
                    company.cash -= chipCost;
                    company.chips[firstMoveAction.chipType] = (company.chips[firstMoveAction.chipType] || 0) + 1;
                    incrementRow(companyIndex);
                    const icons = {research: '🔬', education: '📚', advertising: '📢'};
                    showAIActionModal(company, 'チップ購入', icons[firstMoveAction.chipType], `${firstMoveAction.chipType}チップ購入（初期投資）`);
                    return;
                }
            }
        }
    }

    // 安い材料があれば貪欲に仕入れる
    const cheapMaterials = gameState.markets.filter(m => m.currentStock > 0 && !m.closed && m.buyPrice <= 12);
    if (cheapMaterials.length > 0 && company.materials < getMaterialCapacity(company)) {
        const cheapest = cheapMaterials.sort((a, b) => a.buyPrice - b.buyPrice)[0];
        const canStore = getMaterialCapacity(company) - company.materials;
        // 🛡️ 短期借入回避を考慮した購入可能数計算
        const riskBuffer = (company.chips.insurance || 0) > 0 ? 15 : 40;
        const safeBuffer = 70;
        const safeSpend = Math.max(0, company.cash - periodEndCost - riskBuffer - safeBuffer);
        const canAfford = Math.floor(safeSpend / cheapest.buyPrice);
        const buyQty = Math.min(canStore, cheapest.currentStock, canAfford, mfgCapacity * 2);

        if (buyQty >= 2 && aiCanAffordSafely(company, buyQty * cheapest.buyPrice)) {
            console.log(`[AI仕入れ] ${company.name}: 安い材料発見！ ${cheapest.name} ¥${cheapest.buyPrice} x ${buyQty}個`);
            executeDefaultMaterialPurchase(company, buyQty);
            return;
        }
    }

    // リスクカード認識に基づく予防行動
    const riskRecommendation = AIBrain.getRecommendedAction(company, companyIndex);
    if (riskRecommendation) {
        console.log(`[AIRisk] ${company.name}: ${riskRecommendation.action} - ${riskRecommendation.reason}`);

        if (riskRecommendation.action === 'SELL_TO_REDUCE_RISK' && company.products > 0 && salesCapacity > 0) {
            const totalInv = company.materials + company.wip + company.products;
            const excessProducts = Math.min(company.products, totalInv - 18);
            if (excessProducts > 0) {
                executeDefaultSale(company, Math.min(salesCapacity, excessProducts), 0.80);
                return;
            }
        }

        if (riskRecommendation.action === 'SELL_FOR_CASH' && company.products > 0 && salesCapacity > 0) {
            executeDefaultSale(company, salesCapacity, 0.82);
            return;
        }

        if (riskRecommendation.action === 'BUY_RESEARCH_FOR_OPPORTUNITY') {
            const chipCost = period === 2 ? 20 : 40;
            // 🛡️ 短期借入回避チェック
            if (aiCanAffordSafely(company, chipCost)) {
                company.cash -= chipCost;
                company.chips.research = (company.chips.research || 0) + 1;
                incrementRow(companyIndex);
                showAIActionModal(company, 'チップ購入', '🔬', '研究チップ（成功カード6枚に備える）');
                return;
            }
        }

        if (riskRecommendation.action === 'BUY_INSURANCE' && !company.chips.insurance) {
            const insuranceCost = 10;
            // 🛡️ 短期借入回避チェック
            if (aiCanAffordSafely(company, insuranceCost)) {
                company.cash -= insuranceCost;
                company.chips.insurance = 1;
                incrementRow(companyIndex);
                showAIActionModal(company, 'チップ購入', '🛡️', '保険チップ（火災・盗難対策）');
                return;
            }
        }
    }

    // 緊急：生存モード
    if (brainDecision.action === 'SURVIVAL') {
        if (company.products > 0 && salesCapacity > 0) {
            executeDefaultSale(company, salesCapacity, 0.65);
            return;
        }
        if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
            executeDefaultProduction(company, mfgCapacity);
            return;
        }
        if (company.cash >= 20 && mfgCapacity > 0) {
            executeDefaultMaterialPurchase(company, mfgCapacity);
            return;
        }
    }

    // 戦略的設備投資：小型→大型機械アップグレード
    if (period <= 3 && company.strategy === 'aggressive') {
        const smallMachineIndex = company.machines.findIndex(m => m.type === 'small');
        const hasLargeMachine = company.machines.some(m => m.type === 'large');
        const cashFlow = AIBrain.forecastCashFlow(company);

        if (smallMachineIndex >= 0 && !hasLargeMachine && company.workers >= 2 && cashFlow.canInvest) {
            const smallMachine = company.machines[smallMachineIndex];
            const bookValue = smallMachine.attachments > 0 ? 40 : 30;
            const salePrice = Math.floor(bookValue * 0.7);
            const upgradeCost = 100 - salePrice;

            if (company.cash >= upgradeCost + cashFlow.safetyBuffer) {
                const loss = bookValue - salePrice;
                company.cash += salePrice;
                company.machines.splice(smallMachineIndex, 1);
                company.specialLoss = (company.specialLoss || 0) + loss;
                company.cash -= 100;
                company.machines.push({type: 'large', attachments: 0});
                incrementRow(companyIndex);
                showAIActionModal(company, '設備アップグレード', '🏭', `小型→大型機械（製造能力+3、長期投資）`);
                return;
            }
        }
    }

    // 戦略的採用：能力バランス調整
    if (period <= 4 && !analysis.isCashTight && analysis.rowsRemaining > 8) {
        const cashFlow = AIBrain.forecastCashFlow(company);
        const hireCost = 5;
        const salaryCost = (BASE_SALARY_BY_PERIOD[period] || 22) * 1.5;

        const machineCapacity = company.machines.reduce((sum, m) => sum + (m.type === 'large' ? 4 : 1), 0);
        if (analysis.shouldHireWorker && company.workers < machineCapacity && company.cash >= hireCost + salaryCost + cashFlow.safetyBuffer) {
            company.cash -= hireCost;
            company.workers++;
            company.maxPersonnel = Math.max(company.maxPersonnel || 2, company.workers + company.salesmen);
            incrementRow(companyIndex);
            showAIActionModal(company, '戦略的採用', '👷', `ワーカー採用（製造能力向上）`);
            return;
        }

        if (analysis.shouldHireSalesman && company.salesmen < 3 && company.cash >= hireCost + salaryCost + cashFlow.safetyBuffer) {
            company.cash -= hireCost;
            company.salesmen++;
            company.maxPersonnel = Math.max(company.maxPersonnel || 2, company.workers + company.salesmen);
            incrementRow(companyIndex);
            showAIActionModal(company, '戦略的採用', '🧑‍💼', `セールスマン採用（販売能力向上）`);
            return;
        }

        if (company.workers < company.machines.length && company.cash >= hireCost + salaryCost + cashFlow.safetyBuffer) {
            company.cash -= hireCost;
            company.workers++;
            company.maxPersonnel = Math.max(company.maxPersonnel || 2, company.workers + company.salesmen);
            incrementRow(companyIndex);
            showAIActionModal(company, '戦略的採用', '👷', `ワーカー採用（製造能力活用）`);
            return;
        }

        if (getSalesCapacity(company) < getManufacturingCapacity(company) - 1 &&
            company.cash >= hireCost + salaryCost + cashFlow.safetyBuffer) {
            company.cash -= hireCost;
            company.salesmen++;
            company.maxPersonnel = Math.max(company.maxPersonnel || 2, company.workers + company.salesmen);
            incrementRow(companyIndex);
            showAIActionModal(company, '戦略的採用', '🧑‍💼', `セールスマン採用（販売能力強化）`);
            return;
        }
    }

    // 倉庫購入（20円、容量+12、F+20）
    if (analysis.needsWarehouse && company.warehouses < 2 && company.cash >= WAREHOUSE_COST + analysis.periodEndCost && analysis.rowsRemaining >= 20) {
        company.cash -= WAREHOUSE_COST;
        company.warehouses++;
        if (company.warehouses === 1) {
            company.warehouseLocation = analysis.warehouseLocation;
        }
        incrementRow(companyIndex);
        const protection = company.warehouseLocation === 'materials' ? '火災保護' : '盗難保護';
        showAIActionModal(company, '倉庫購入', '🏪', `倉庫購入（容量+12、${protection}）`);
        return;
    }

    // 次期チップ投資（3期以降）
    if (period >= 3 && !analysis.isCashTight && analysis.rowsRemaining > 3) {
        const chipCost = 20;
        const nextChips = (company.nextPeriodChips?.research || 0) +
                          (company.nextPeriodChips?.education || 0) +
                          (company.nextPeriodChips?.advertising || 0);

        if (nextChips < 3 && company.cash > analysis.periodEndCost + chipCost + 30) {
            if (company.nextPeriodChips.education < 1) {
                company.cash -= chipCost;
                company.nextPeriodChips.education++;
                incrementRow(companyIndex);
                showAIActionModal(company, 'チップ購入(次期)', '📚', '次期用教育チップ（効率投資）');
                return;
            }
            if (company.nextPeriodChips.research < 2) {
                company.cash -= chipCost;
                company.nextPeriodChips.research++;
                incrementRow(companyIndex);
                showAIActionModal(company, 'チップ購入(次期)', '🔬', '次期用研究チップ（価格競争力）');
                return;
            }
        }
    }

    // 勝ちパターン認識
    const victory = AIBrain.calculatePathToVictory(company, companyIndex);
    const competitors = AIBrain.analyzeCompetitors(company, companyIndex);

    if (competitors.myRank === 1 && victory.equityGap < -20) {
        if (company.products > 0 && salesCapacity > 0 && !analysis.isCashTight) {
            executeDefaultSale(company, salesCapacity, 0.88);
            return;
        }
        if (company.cash > analysis.periodEndCost + 100) {
            if (period >= 3) {
                const nextChips = (company.nextPeriodChips?.research || 0) +
                                  (company.nextPeriodChips?.education || 0) +
                                  (company.nextPeriodChips?.advertising || 0);
                if (nextChips < 3 && company.cash > analysis.periodEndCost + 60) {
                    company.cash -= 20;
                    company.nextPeriodChips.research++;
                    incrementRow(companyIndex);
                    showAIActionModal(company, 'チップ購入(次期)', '🔬', '次期用チップ（リード維持）');
                    return;
                }
            }
        }
    }

    if (victory.needsAggression && competitors.myRank >= 4) {
        console.log(`[AI戦略] ${company.name}: ビハインドのため攻めモード発動`);

        if (period >= 3 && company.cash > analysis.periodEndCost + 60) {
            if (company.chips.research < competitors.averageResearch) {
                const expressROI = AIBrain.shouldUseExpressChip(company, 'research', companyIndex);
                if (expressROI.shouldUse) {
                    const expressCost = 40;
                    company.cash -= expressCost;
                    aiPurchaseChip(company, 'research', expressCost);
                    incrementRow(companyIndex);
                    console.log(`[AI特急] ${company.name}: ${expressROI.reason}`);
                    showAIActionModal(company, '特急チップ', '🔬', `研究チップ特急（ROI:${expressROI.expectedROI}%）`);
                    return;
                } else {
                    console.log(`[AI特急見送り] ${company.name}: ${expressROI.reason} → ${expressROI.alternative || '安売りへ'}`);
                }
            }
        }

        if (company.products > 0 && salesCapacity > 0) {
            executeDefaultSale(company, salesCapacity, 0.78);
            return;
        }

        if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
            executeDefaultProduction(company, mfgCapacity);
            return;
        }

        if (company.materials < mfgCapacity && company.cash > 50) {
            executeDefaultMaterialPurchase(company, mfgCapacity);
            return;
        }
    }

    // 性格別戦略実行
    switch(company.strategy) {
        case 'aggressive':
            executeAggressiveStrategy(company, mfgCapacity, salesCapacity, analysis);
            break;
        case 'conservative':
            executeConservativeStrategy(company, mfgCapacity, salesCapacity, analysis);
            break;
        case 'price_focused':
            executePriceFocusedStrategy(company, mfgCapacity, salesCapacity, analysis);
            break;
        case 'tech_focused':
            executeTechFocusedStrategy(company, mfgCapacity, salesCapacity, analysis);
            break;
        case 'unpredictable':
            executeUnpredictableStrategy(company, mfgCapacity, salesCapacity, analysis);
            break;
        default:
            executeBalancedStrategy(company, mfgCapacity, salesCapacity, analysis);
    }
}

// ============================================
// A社（攻め商事）：積極的戦略
// ============================================
function executeAggressiveStrategy(company, mfgCapacity, salesCapacity, analysis) {
    const periodEndCost = calculatePeriodPayment(company);
    const safetyMargin = periodEndCost + 10;
    const chipCost = gameState.currentPeriod === 2 ? 20 : 40;
    const companyIndex = gameState.companies.indexOf(company);

    // === 2期序盤：チップ投資を最優先（投資なくして成長なし） ===
    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 10 && company.cash > 50) {
        // 攻撃型: 研究4枚、広告1枚を序盤で確保
        if (company.chips.research < 4) {
            company.cash -= 20;
            aiPurchaseChip(company, 'research', 20);
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '🔬', `研究チップ${(company.chips.research||0)+1}枚目（序盤投資）`);
            return;
        }
        if (company.chips.advertising < 1) {
            company.cash -= 20;
            aiPurchaseChip(company, 'advertising', 20);
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入（序盤投資）');
            return;
        }
    }

    // 5期は在庫10個＋次期チップ3枚を目指す
    if (analysis.isFinalPeriod) {
        const totalInv = company.materials + company.wip + company.products;
        const nextChips = (company.nextPeriodChips?.research || 0) +
                          (company.nextPeriodChips?.education || 0) +
                          (company.nextPeriodChips?.advertising || 0);

        if (nextChips < 3 && company.cash >= chipCost + safetyMargin) {
            if (company.nextPeriodChips.education < 1) {
                company.cash -= chipCost;
                company.nextPeriodChips.education++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '📚', '次期用教育チップ購入');
                return;
            }
            if (company.nextPeriodChips.research < 2) {
                company.cash -= chipCost;
                company.nextPeriodChips.research++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '🔬', '次期用研究チップ購入');
                return;
            }
        }

        if (totalInv < 10) {
            if (company.cash > safetyMargin + 40 && company.materials < mfgCapacity) {
                executeDefaultMaterialPurchase(company, mfgCapacity);
                return;
            }
            if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                executeDefaultProduction(company, mfgCapacity);
                return;
            }
        }

        if (company.products > 0 && salesCapacity > 0 && totalInv > 10) {
            executeDefaultSale(company, Math.min(salesCapacity, totalInv - 10), 0.75);
            return;
        }

        aiDoNothing(company, '在庫調整中');
        return;
    }

    // 4期後半は回収フェーズ
    if (analysis.isRecoveryPhase && company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, salesCapacity, 0.78);
        return;
    }

    // === 2期中盤チップ投資（生産より優先） ===
    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 3 && company.cash > safetyMargin + 20) {
        // 攻撃型: 研究4枚目標（入札で圧倒）、広告1枚
        if (company.chips.research < 4) {
            company.cash -= 20;
            aiPurchaseChip(company, 'research', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', `研究チップ${(company.chips.research||0)+1}枚目（入札支配）`);
            return;
        }
        if (company.chips.advertising < 1) {
            company.cash -= 20;
            aiPurchaseChip(company, 'advertising', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入（販売強化）');
            return;
        }
    }

    // === 基本サイクル: 販売→生産→仕入 ===
    // 販売優先（製品があれば売る）
    if (company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, Math.min(salesCapacity, company.products), 0.78);
        return;
    }

    // 生産最大化（材料/仕掛品があれば生産）
    if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    // 材料購入（在庫ゼロ時は緊急仕入れ）
    const totalInventory = company.materials + company.wip + company.products;
    const materialCashReq = totalInventory === 0 ? safetyMargin + 10 : safetyMargin + 30;
    if (company.materials < mfgCapacity && company.cash > materialCashReq) {
        executeDefaultMaterialPurchase(company, mfgCapacity);
        return;
    }

    // 長期投資
    if (company.cash > safetyMargin + chipCost && analysis.rowsRemaining > 5 && !analysis.isRecoveryPhase) {
        const minEducationChips = gameState.currentPeriod === 2 ? 2 : 1;
        if (company.chips.education < minEducationChips && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'education', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（効率投資）');
            return;
        }

        const maxResearchChips = gameState.currentPeriod === 2 ? 4 : 5;
        if (analysis.shouldInvestForFuture && company.chips.research < maxResearchChips && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'research', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', '研究開発チップ購入（長期投資）');
            return;
        }

        if (gameState.currentPeriod >= 3 && analysis.periodsRemaining >= 2) {
            if (company.nextPeriodChips.education < 1 && company.cash >= chipCost + safetyMargin + 30) {
                company.cash -= chipCost;
                company.nextPeriodChips.education++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '📚', '次期用教育チップ購入');
                return;
            }
            if (company.nextPeriodChips.research < 3 && company.cash >= chipCost + safetyMargin + 30) {
                company.cash -= chipCost;
                company.nextPeriodChips.research++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '🔬', '次期用研究チップ購入');
                return;
            }
        }

        if (analysis.needsCapacityBalance && analysis.capacityBalance > 0) {
            if (company.chips.advertising < 3 && company.cash >= chipCost + safetyMargin) {
                company.cash -= chipCost;
                aiPurchaseChip(company, 'advertising', chipCost);
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入');
                return;
            }
        }
    }

    // 投資戦略へ
    executeDefaultInvestment(company);
}

// ============================================
// C社（堅実産業）：保守的戦略
// ============================================
function executeConservativeStrategy(company, mfgCapacity, salesCapacity, analysis) {
    const periodEndCost = calculatePeriodPayment(company);
    const safetyMargin = periodEndCost + 80;
    const chipCost = gameState.currentPeriod === 2 ? 20 : 40;
    const companyIndex = gameState.companies.indexOf(company);

    // === 2期序盤：チップ投資を最優先（投資なくして成長なし） ===
    // 堅実型でも必要な投資はする（safetyMarginを緩和：現金50円以上あればOK）
    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 10 && company.cash > 50) {
        // 堅実型: 保険→教育2枚→研究1枚（守り重視だが投資は怠らない）
        if (!company.chips.insurance) {
            company.cash -= 5;
            company.chips.insurance = 1;
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '🛡️', '保険チップ購入（序盤でリスク対策）');
            return;
        }
        if (company.chips.education < 2) {
            company.cash -= 20;
            aiPurchaseChip(company, 'education', 20);
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '📚', `教育チップ${(company.chips.education||0)+1}枚目（序盤投資）`);
            return;
        }
        if (company.chips.research < 1) {
            company.cash -= 20;
            aiPurchaseChip(company, 'research', 20);
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '🔬', '研究チップ購入（序盤投資）');
            return;
        }
    }

    if (analysis.isFinalPeriod) {
        const totalInv = company.materials + company.wip + company.products;
        const nextChips = (company.nextPeriodChips?.research || 0) +
                          (company.nextPeriodChips?.education || 0) +
                          (company.nextPeriodChips?.advertising || 0);

        if (nextChips < 3 && company.cash >= chipCost + safetyMargin) {
            if (company.nextPeriodChips.education < 1) {
                company.cash -= chipCost;
                company.nextPeriodChips.education++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '📚', '次期用教育チップ購入');
                return;
            }
            if (company.nextPeriodChips.research < 2) {
                company.cash -= chipCost;
                company.nextPeriodChips.research++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '🔬', '次期用研究チップ購入');
                return;
            }
        }

        if (totalInv < 10) {
            if (company.cash > safetyMargin + 40 && company.materials < mfgCapacity) {
                executeDefaultMaterialPurchase(company, mfgCapacity);
                return;
            }
            if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                executeDefaultProduction(company, mfgCapacity);
                return;
            }
        }

        if (company.products > 0 && salesCapacity > 0 && totalInv > 10) {
            executeDefaultSale(company, Math.min(salesCapacity, totalInv - 10), 0.85);
            return;
        }

        aiDoNothing(company, '積極投資待ち');
        return;
    }

    if (analysis.isRecoveryPhase && company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, salesCapacity, 0.83);
        return;
    }

    // === 2期中盤チップ投資（生産より優先） ===
    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 3 && company.cash > 50) {
        // 堅実型: 保険必須、教育2枚、研究1枚（守り重視）
        if (!company.chips.insurance) {
            company.cash -= 5;
            company.chips.insurance = 1;
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🛡️', '保険チップ購入（リスク回避最優先）');
            return;
        }
        if (company.chips.education < 2) {
            company.cash -= 20;
            aiPurchaseChip(company, 'education', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', `教育チップ${(company.chips.education||0)+1}枚目（採用コスト削減）`);
            return;
        }
        if (company.chips.research < 1) {
            company.cash -= 20;
            aiPurchaseChip(company, 'research', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', '研究チップ購入（最低限の競争力）');
            return;
        }
        // 余裕があれば教育追加（採用コストをさらに下げる）
        if (company.chips.education < 3 && company.cash > safetyMargin + 40) {
            company.cash -= 20;
            aiPurchaseChip(company, 'education', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ3枚目（人件費最適化）');
            return;
        }
    }

    // === 基本サイクル: 販売→生産→仕入 ===
    if (company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, Math.min(salesCapacity, company.products), 0.85);
        return;
    }

    if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    // 材料購入（在庫ゼロ時は緊急仕入れ）
    const totalInventory = company.materials + company.wip + company.products;
    const materialCashReq = totalInventory === 0 ? safetyMargin + 10 : safetyMargin + 30;
    if (company.materials < mfgCapacity && company.cash > materialCashReq) {
        executeDefaultMaterialPurchase(company, mfgCapacity);
        return;
    }

    if (company.cash > safetyMargin + chipCost && analysis.rowsRemaining > 8 && !analysis.isRecoveryPhase) {
        if (!company.chips.insurance && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            company.chips.insurance = 1;
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🛡️', '保険チップ購入（リスク軽減）');
            return;
        }

        const minEduChips = gameState.currentPeriod === 2 ? 2 : 1;
        if (company.chips.education < minEduChips && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'education', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（安定投資）');
            return;
        }

        const minResearchChips = gameState.currentPeriod === 2 ? 2 : 1;
        if (analysis.shouldInvestForFuture && company.chips.research < Math.max(3, minResearchChips) && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'research', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', '研究開発チップ購入（長期投資）');
            return;
        }

        if (gameState.currentPeriod >= 3 && analysis.periodsRemaining >= 2) {
            if (company.nextPeriodChips.education < 1 && company.cash >= chipCost + safetyMargin + 80) {
                company.cash -= chipCost;
                company.nextPeriodChips.education++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '📚', '次期用教育チップ購入');
                return;
            }
            if (company.nextPeriodChips.research < 1 && company.cash >= chipCost + safetyMargin + 80) {
                company.cash -= chipCost;
                company.nextPeriodChips.research++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '🔬', '次期用研究チップ購入');
                return;
            }
        }
    }

    aiDoNothing(company, '技術投資検討中');
}

// ============================================
// D社：価格競争戦略
// ============================================
function executePriceFocusedStrategy(company, mfgCapacity, salesCapacity, analysis) {
    const periodEndCost = calculatePeriodPayment(company);
    const safetyMargin = periodEndCost + 30;
    const chipCost = gameState.currentPeriod === 2 ? 20 : 40;

    if (analysis.isFinalPeriod) {
        const totalInv = company.materials + company.wip + company.products;
        const nextChips = (company.nextPeriodChips?.research || 0) +
                          (company.nextPeriodChips?.education || 0) +
                          (company.nextPeriodChips?.advertising || 0);

        if (nextChips < 3 && company.cash >= chipCost + safetyMargin) {
            if (company.nextPeriodChips.advertising < 2) {
                company.cash -= chipCost;
                company.nextPeriodChips.advertising++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '📢', '次期用広告チップ購入');
                return;
            }
            if (company.nextPeriodChips.education < 1) {
                company.cash -= chipCost;
                company.nextPeriodChips.education++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '📚', '次期用教育チップ購入');
                return;
            }
        }

        if (totalInv < 10) {
            if (company.cash > safetyMargin + 40 && company.materials < mfgCapacity) {
                executeDefaultMaterialPurchase(company, mfgCapacity);
                return;
            }
            if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                executeDefaultProduction(company, mfgCapacity);
                return;
            }
        }

        if (company.products > 0 && salesCapacity > 0 && totalInv > 10) {
            executeDefaultSale(company, Math.min(salesCapacity, totalInv - 10), 0.70);
            return;
        }

        aiDoNothing(company, '安定経営維持');
        return;
    }

    if (analysis.isRecoveryPhase && company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, salesCapacity, 0.78);
        return;
    }

    // === 2期中盤チップ投資（生産より優先） ===
    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 3 && company.cash > 50) {
        // 価格重視型: 広告チップで販売能力+1、教育で採用コスト削減
        if (company.chips.advertising < 2) {
            company.cash -= 20;
            aiPurchaseChip(company, 'advertising', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📢', `広告チップ${(company.chips.advertising||0)+1}枚目（販売強化）`);
            return;
        }
        if (company.chips.education < 1) {
            company.cash -= 20;
            aiPurchaseChip(company, 'education', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（コスト削減）');
            return;
        }
    }

    // === 基本サイクル: 販売→生産→仕入 ===
    if (company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, Math.min(salesCapacity, company.products), 0.78);
        return;
    }

    if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    // 材料購入（在庫ゼロ時は緊急仕入れ）
    const totalInventory = company.materials + company.wip + company.products;
    const materialCashReq = totalInventory === 0 ? safetyMargin + 10 : safetyMargin + 30;
    if (company.materials < mfgCapacity && company.cash > materialCashReq) {
        executeDefaultMaterialPurchase(company, mfgCapacity);
        return;
    }

    if (company.cash > safetyMargin + 50 && analysis.rowsRemaining > 5 && !analysis.isRecoveryPhase) {
        const minEduChips = gameState.currentPeriod === 2 ? 2 : 1;
        if (company.chips.education < minEduChips && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'education', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（量産体制）');
            return;
        }

        const minResearchChips = gameState.currentPeriod === 2 ? 2 : 1;
        if (analysis.shouldInvestForFuture && company.chips.research < Math.max(3, minResearchChips) && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'research', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', '研究開発チップ購入（長期投資）');
            return;
        }

        if (analysis.needsCapacityBalance && analysis.capacityBalance > 0) {
            if (company.chips.advertising < 3 && company.cash >= chipCost + safetyMargin) {
                company.cash -= chipCost;
                aiPurchaseChip(company, 'advertising', chipCost);
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入');
                return;
            }
        }

        if (gameState.currentPeriod >= 3 && analysis.periodsRemaining >= 2) {
            if (company.nextPeriodChips.education < 1 && company.cash >= chipCost + safetyMargin + 40) {
                company.cash -= chipCost;
                company.nextPeriodChips.education++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '📚', '次期用教育チップ購入');
                return;
            }
            if (company.nextPeriodChips.research < 2 && company.cash >= chipCost + safetyMargin + 40) {
                company.cash -= chipCost;
                company.nextPeriodChips.research++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '🔬', '次期用研究チップ購入');
                return;
            }
        }
    }

    aiDoNothing(company, '品質管理中');
}

// ============================================
// E社：技術重視戦略
// ============================================
function executeTechFocusedStrategy(company, mfgCapacity, salesCapacity, analysis) {
    const periodEndCost = calculatePeriodPayment(company);
    const safetyMargin = periodEndCost + 40;
    const chipCost = gameState.currentPeriod === 2 ? 20 : 40;
    const companyIndex = gameState.companies.indexOf(company);

    // === 2期序盤：チップ投資を最優先（投資なくして成長なし） ===
    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 10 && company.cash > 50) {
        // 技術特化: 研究5枚に全振り（コール価格-10を目指す）
        if (company.chips.research < 5) {
            company.cash -= 20;
            aiPurchaseChip(company, 'research', 20);
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '🔬', `研究チップ${(company.chips.research||0)+1}枚目（技術で圧倒）`);
            return;
        }
    }

    if (analysis.isFinalPeriod) {
        const totalInv = company.materials + company.wip + company.products;
        const nextChips = (company.nextPeriodChips?.research || 0) +
                          (company.nextPeriodChips?.education || 0) +
                          (company.nextPeriodChips?.advertising || 0);

        if (nextChips < 3 && company.cash >= chipCost + safetyMargin) {
            if (company.nextPeriodChips.research < 2) {
                company.cash -= chipCost;
                company.nextPeriodChips.research++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '🔬', '次期用研究チップ購入（技術重視）');
                return;
            }
            if (company.nextPeriodChips.education < 1) {
                company.cash -= chipCost;
                company.nextPeriodChips.education++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '📚', '次期用教育チップ購入（技術重視）');
                return;
            }
        }

        if (totalInv < 10) {
            if (company.cash > safetyMargin + 40 && company.materials < mfgCapacity) {
                executeDefaultMaterialPurchase(company, mfgCapacity);
                return;
            }
            if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                executeDefaultProduction(company, mfgCapacity);
                return;
            }
        }

        if (company.products > 0 && salesCapacity > 0 && totalInv > 10) {
            executeDefaultSale(company, Math.min(salesCapacity, totalInv - 10), 0.80);
            return;
        }

        aiDoNothing(company, '技術開発待ち');
        return;
    }

    if (analysis.isRecoveryPhase && company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, salesCapacity, 0.78);
        return;
    }

    // === 2期中盤チップ投資（生産より優先） ===
    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 5 && company.cash > 50) {
        if (company.chips.research < 5) {
            company.cash -= 20;
            aiPurchaseChip(company, 'research', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', `研究チップ${(company.chips.research||0)+1}枚目（技術投資）`);
            return;
        }
        if (company.chips.education < 2) {
            company.cash -= 20;
            aiPurchaseChip(company, 'education', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（2期技術投資）');
            return;
        }
    }

    // === 基本サイクル: 販売→生産→仕入 ===
    if (company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, Math.min(salesCapacity, company.products), 0.80);
        return;
    }

    if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    // 材料購入（在庫ゼロ時は緊急仕入れ）
    const totalInventory = company.materials + company.wip + company.products;
    const materialCashReq = totalInventory === 0 ? safetyMargin + 10 : safetyMargin + 30;
    if (company.materials < mfgCapacity && company.cash > materialCashReq) {
        executeDefaultMaterialPurchase(company, mfgCapacity);
        return;
    }

    if (company.cash > safetyMargin + chipCost && analysis.rowsRemaining > 5 && !analysis.isRecoveryPhase) {
        const maxResearchChips = gameState.currentPeriod === 2 ? 4 : 5;
        if (analysis.shouldInvestForFuture && company.chips.research < maxResearchChips && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'research', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', '研究開発チップ購入（長期投資）');
            return;
        }

        const maxEducation = gameState.currentPeriod === 2 ? 2 : 1;
        if (company.chips.education < maxEducation && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'education', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（能力+1）');
            return;
        }

        if (!company.chips.computer && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            company.chips.computer = 1;
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '💻', 'コンピュータチップ購入（製造能力+1）');
            return;
        }

        if (gameState.currentPeriod >= 3 && analysis.periodsRemaining >= 2) {
            if (company.nextPeriodChips.education < 1 && company.cash >= chipCost + safetyMargin + 30) {
                company.cash -= chipCost;
                company.nextPeriodChips.education++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '📚', '次期用教育チップ購入');
                return;
            }
            if (company.nextPeriodChips.research < 3 && company.cash >= chipCost + safetyMargin + 30) {
                company.cash -= chipCost;
                company.nextPeriodChips.research++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '🔬', '次期用研究チップ購入');
                return;
            }
        }
    }

    if (company.cash > safetyMargin + 40 && company.materials < mfgCapacity) {
        executeDefaultMaterialPurchase(company, mfgCapacity);
        return;
    }

    executeDefaultInvestment(company);
}

// ============================================
// B社・デフォルト：バランス戦略
// ============================================
function executeBalancedStrategy(company, mfgCapacity, salesCapacity, analysis) {
    const periodEndCost = calculatePeriodPayment(company);
    const safetyMargin = periodEndCost + 35;
    const chipCost = gameState.currentPeriod === 2 ? 20 : 40;
    const companyIndex = gameState.companies.indexOf(company);

    // === 2期序盤：チップ投資を最優先（投資なくして成長なし） ===
    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 10 && company.cash > 50) {
        // バランス型: 研究2枚、教育1枚、広告1枚（均等投資）
        if (company.chips.research < 2) {
            company.cash -= 20;
            aiPurchaseChip(company, 'research', 20);
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '🔬', `研究チップ${(company.chips.research||0)+1}枚目（序盤投資）`);
            return;
        }
        if (company.chips.education < 1) {
            company.cash -= 20;
            aiPurchaseChip(company, 'education', 20);
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（序盤投資）');
            return;
        }
        if (company.chips.advertising < 1) {
            company.cash -= 20;
            aiPurchaseChip(company, 'advertising', 20);
            incrementRow(companyIndex);
            showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入（序盤投資）');
            return;
        }
    }

    if (analysis.isFinalPeriod) {
        const totalInv = company.materials + company.wip + company.products;
        const nextChips = (company.nextPeriodChips?.research || 0) +
                          (company.nextPeriodChips?.education || 0) +
                          (company.nextPeriodChips?.advertising || 0);

        if (nextChips < 3 && company.cash >= chipCost + safetyMargin) {
            if (company.nextPeriodChips.education < 1) {
                company.cash -= chipCost;
                company.nextPeriodChips.education++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '📚', '次期用教育チップ購入');
                return;
            }
            if (company.nextPeriodChips.research < 1) {
                company.cash -= chipCost;
                company.nextPeriodChips.research++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '🔬', '次期用研究チップ購入');
                return;
            }
            if (company.nextPeriodChips.advertising < 1) {
                company.cash -= chipCost;
                company.nextPeriodChips.advertising++;
                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, 'チップ購入(次期)', '📢', '次期用広告チップ購入');
                return;
            }
        }

        if (totalInv < 10) {
            if (company.cash > safetyMargin + 40 && company.materials < mfgCapacity) {
                executeDefaultMaterialPurchase(company, mfgCapacity);
                return;
            }
            if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                executeDefaultProduction(company, mfgCapacity);
                return;
            }
        }

        if (company.products > 0 && salesCapacity > 0 && totalInv > 10) {
            executeDefaultSale(company, Math.min(salesCapacity, totalInv - 10), 0.80);
            return;
        }

        aiDoNothing(company, '販売機会待ち');
        return;
    }

    if (analysis.isRecoveryPhase && company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, salesCapacity, 0.78);
        return;
    }

    // === 2期中盤チップ投資（生産より優先） ===
    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 3 && company.cash > 50) {
        // バランス型: 研究2枚、教育1枚、広告1枚（均等投資）
        if (company.chips.research < 2) {
            company.cash -= 20;
            aiPurchaseChip(company, 'research', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', `研究チップ${(company.chips.research||0)+1}枚目（バランス投資）`);
            return;
        }
        if (company.chips.education < 1) {
            company.cash -= 20;
            aiPurchaseChip(company, 'education', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（バランス投資）');
            return;
        }
        if (company.chips.advertising < 1) {
            company.cash -= 20;
            aiPurchaseChip(company, 'advertising', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入（バランス投資）');
            return;
        }
    }

    // === 基本サイクル: 販売→生産→仕入 ===
    if (company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, Math.min(salesCapacity, company.products), 0.80);
        return;
    }

    if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    // 材料購入（在庫ゼロ時は緊急仕入れ）
    const totalInventory = company.materials + company.wip + company.products;
    const materialCashReq = totalInventory === 0 ? safetyMargin + 10 : safetyMargin + 30;
    if (company.materials < mfgCapacity && company.cash > materialCashReq) {
        executeDefaultMaterialPurchase(company, mfgCapacity);
        return;
    }

    // === 追加チップ投資 ===
    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 3 && company.cash > safetyMargin + 20) {
        if (company.chips.research < 3) {
            company.cash -= 20;
            aiPurchaseChip(company, 'research', 20);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入（バランス投資）');
            return;
        }
    }

    if (company.cash > safetyMargin + chipCost && analysis.rowsRemaining > 6 && !analysis.isRecoveryPhase) {
        const plan = company.periodPlan || {};
        const priority = plan.chipPriority || ['education', 'research'];
        const useExpress = plan.useExpressChip || false;

        for (const target of priority) {
            const isNextPeriod = target.startsWith('nextPeriod:');
            const chipType = isNextPeriod ? target.replace('nextPeriod:', '') : target;

            if (isNextPeriod && gameState.currentPeriod >= 3) {
                if (chipType === 'education' && company.nextPeriodChips.education < 1 && company.cash >= chipCost + safetyMargin) {
                    company.cash -= chipCost;
                    company.nextPeriodChips.education++;
                    incrementRow(gameState.companies.indexOf(company));
                    showAIActionModal(company, 'チップ購入(次期)', '📚', '次期用教育チップ購入（計画通り）');
                    return;
                }
                if (chipType === 'research' && company.nextPeriodChips.research < 3 && company.cash >= chipCost + safetyMargin) {
                    company.cash -= chipCost;
                    company.nextPeriodChips.research++;
                    incrementRow(gameState.companies.indexOf(company));
                    showAIActionModal(company, 'チップ購入(次期)', '🔬', '次期用研究チップ購入（計画通り）');
                    return;
                }
                if (chipType === 'advertising' && company.nextPeriodChips.advertising < 2 && company.cash >= chipCost + safetyMargin) {
                    company.cash -= chipCost;
                    company.nextPeriodChips.advertising++;
                    incrementRow(gameState.companies.indexOf(company));
                    showAIActionModal(company, 'チップ購入(次期)', '📢', '次期用広告チップ購入（計画通り）');
                    return;
                }
            } else if (!isNextPeriod) {
                const expressCost = gameState.currentPeriod >= 3 ? chipCost : chipCost;
                const reason = useExpress && gameState.currentPeriod >= 3 ? '（特急・追い上げ）' : '（計画投資）';
                const minEduChips = gameState.currentPeriod === 2 ? 2 : 1;

                if (chipType === 'education' && company.chips.education < minEduChips && company.cash >= expressCost + safetyMargin) {
                    company.cash -= expressCost;
                    aiPurchaseChip(company, 'education', expressCost);
                    incrementRow(gameState.companies.indexOf(company));
                    showAIActionModal(company, 'チップ購入', '📚', `教育チップ購入${reason}`);
                    return;
                }
                const maxResearchChips = gameState.currentPeriod === 2 ? 4 : 5;
                if (chipType === 'research' && company.chips.research < maxResearchChips && company.cash >= expressCost + safetyMargin) {
                    company.cash -= expressCost;
                    aiPurchaseChip(company, 'research', expressCost);
                    incrementRow(gameState.companies.indexOf(company));
                    showAIActionModal(company, 'チップ購入', '🔬', `研究チップ購入${reason}`);
                    return;
                }
                if (chipType === 'advertising' && company.chips.advertising < 3 && company.cash >= expressCost + safetyMargin) {
                    company.cash -= expressCost;
                    aiPurchaseChip(company, 'advertising', expressCost);
                    incrementRow(gameState.companies.indexOf(company));
                    showAIActionModal(company, 'チップ購入', '📢', `広告チップ購入${reason}`);
                    return;
                }
            }
        }

        if (analysis.needsCapacityBalance && analysis.capacityBalance > 0 && company.chips.advertising < 2) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'advertising', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入（能力バランス）');
            return;
        }
    }

    aiDoNothing(company, '分散投資検討中');
}

// ============================================
// F社：予測不能戦略
// ============================================
function executeUnpredictableStrategy(company, mfgCapacity, salesCapacity, analysis) {
    const periodEndCost = calculatePeriodPayment(company);
    const safetyMargin = periodEndCost + 15;
    const chipCost = gameState.currentPeriod === 2 ? 20 : 40;
    const mood = Math.random();

    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 5 && Math.random() < 0.6) {
        const chipTypes = ['education', 'research', 'advertising'];
        const randomChip = chipTypes[Math.floor(Math.random() * chipTypes.length)];

        if (company.chips[randomChip] < 2 && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, randomChip, chipCost);
            incrementRow(gameState.companies.indexOf(company));
            const icons = {research: '🔬', education: '📚', advertising: '📢'};
            showAIActionModal(company, 'チップ購入', icons[randomChip], `${randomChip}チップ購入（2期気まぐれ投資）`);
            return;
        }
    }

    if (mood > 0.5) {
        const boldAction = Math.floor(Math.random() * 5);

        switch(boldAction) {
            case 0:
                if (company.cash > 30) {
                    executeDefaultMaterialPurchase(company, Math.max(mfgCapacity, 3));
                    return;
                }
                break;
            case 1:
                if (company.products >= 1 && salesCapacity > 0) {
                    const wildPrice = 0.82 + Math.random() * 0.15;
                    executeDefaultSale(company, salesCapacity, wildPrice);
                    return;
                }
                break;
            case 2:
                if (company.cash > chipCost + 10) {
                    const randomChip = ['research', 'advertising', 'education'][Math.floor(Math.random() * 3)];
                    if (company.chips[randomChip] < 3) {
                        company.cash -= chipCost;
                        company.chips[randomChip]++;
                        incrementRow(gameState.companies.indexOf(company));
                        const chipIcons = {research: '🔬', advertising: '📢', education: '📚'};
                        showAIActionModal(company, 'チップ購入', chipIcons[randomChip], `${randomChip}チップを衝動買い！`);
                        return;
                    }
                }
                break;
            case 3:
                if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                    executeDefaultProduction(company, mfgCapacity);
                    return;
                }
                break;
            case 4:
                if (Math.random() > 0.3) {
                    aiDoNothing(company, '様子見中');
                    return;
                }
                break;
        }
    }

    if (analysis.isFinalPeriod) {
        const totalInv = company.materials + company.wip + company.products;
        const nextChips = (company.nextPeriodChips?.research || 0) +
                          (company.nextPeriodChips?.education || 0) +
                          (company.nextPeriodChips?.advertising || 0);
        const randomGoal = Math.random();

        if (randomGoal > 0.6) {
            if (nextChips < 3 && company.cash >= chipCost + 20) {
                const chipType = ['research', 'education', 'advertising'][Math.floor(Math.random() * 3)];
                if (company.nextPeriodChips[chipType] < 2) {
                    company.cash -= chipCost;
                    company.nextPeriodChips[chipType]++;
                    incrementRow(gameState.companies.indexOf(company));
                    const icons = {research: '🔬', education: '📚', advertising: '📢'};
                    showAIActionModal(company, 'チップ購入(次期)', icons[chipType], `次期用${chipType}チップ購入（気まぐれ）`);
                    return;
                }
            }
        }

        if (totalInv < 10 && Math.random() > 0.3) {
            if (company.cash > 40 && company.materials < mfgCapacity) {
                executeDefaultMaterialPurchase(company, mfgCapacity);
                return;
            }
            if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                executeDefaultProduction(company, mfgCapacity);
                return;
            }
        }

        if (company.products > 0 && salesCapacity > 0 && totalInv > 10) {
            const priceBase = 0.75 + Math.random() * 0.20;
            executeDefaultSale(company, Math.min(salesCapacity, totalInv - 10), priceBase);
            return;
        }

        aiDoNothing(company, '気まぐれ待機');
        return;
    }

    const priorities = ['sell', 'produce', 'buy', 'chip'].sort(() => Math.random() - 0.5);

    for (const priority of priorities) {
        switch(priority) {
            case 'sell':
                if (company.products >= 1 && salesCapacity > 0) {
                    const priceBase = 0.85 + Math.random() * 0.10;
                    executeDefaultSale(company, salesCapacity, priceBase);
                    return;
                }
                break;
            case 'produce':
                if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
                    executeDefaultProduction(company, mfgCapacity);
                    return;
                }
                break;
            case 'buy':
                if (company.cash > safetyMargin + 20) {
                    executeDefaultMaterialPurchase(company, mfgCapacity);
                    return;
                }
                break;
            case 'chip':
                if (company.cash > safetyMargin + chipCost && analysis.rowsRemaining > 3) {
                    const chipTypes = ['research', 'advertising', 'education'];
                    const chipType = chipTypes[Math.floor(Math.random() * chipTypes.length)];
                    if (company.chips[chipType] < 3) {
                        company.cash -= chipCost;
                        company.chips[chipType]++;
                        incrementRow(gameState.companies.indexOf(company));
                        const chipIcons = {research: '🔬', advertising: '📢', education: '📚'};
                        showAIActionModal(company, 'チップ購入', chipIcons[chipType], `${chipType}チップ購入`);
                        return;
                    }
                }
                break;
        }
    }

    executeDefaultMaterialPurchase(company, mfgCapacity);
}

// ============================================
// 戦略的価格決定
// ============================================
function calculateStrategicPrice(company, market, basePrice) {
    const companyIndex = gameState.companies.indexOf(company);
    const period = gameState.currentPeriod;

    const salaryCost = calculateSalaryCost(company, period);
    const loanInterest = Math.floor((company.loans || 0) * INTEREST_RATES.longTerm) +
                         Math.floor((company.shortLoans || 0) * INTEREST_RATES.shortTerm);
    const mustPay = salaryCost + loanInterest;
    const rowsRemaining = gameState.maxRows - (company.currentRow || 1);

    const isSurvivalMode = rowsRemaining <= 5 && company.cash < mustPay;
    if (isSurvivalMode) {
        const neededRevenue = mustPay - company.cash;
        const minPriceForSurvival = Math.ceil(neededRevenue / company.products);
        const minProfitablePrice = 25;
        const survivalPrice = Math.max(minProfitablePrice, Math.min(minPriceForSurvival, market.sellPrice * 0.70));
        console.log(`[AI] ${company.name}: 生存モード - 最低価格¥${survivalPrice}で売却（MQ確保）`);
        return survivalPrice / market.sellPrice;
    }

    const rivals = gameState.companies.filter((c, i) => i !== companyIndex && i !== 0);
    const leadingRivals = rivals.filter(r => r.products >= 2 && r.equity > company.equity - 30);
    const shouldBlock = company.strategy === 'aggressive' &&
                        leadingRivals.length > 0 &&
                        company.cash > mustPay + 50;

    if (shouldBlock && Math.random() > 0.5) {
        const blockPrice = Math.max(26, Math.round(market.sellPrice * 0.75));
        console.log(`[AI] ${company.name}: ライバル妨害 - 低価格¥${blockPrice}で先制販売（MQ確保）`);
        return blockPrice / market.sellPrice;
    }

    const hasMargin = company.cash > mustPay + 100;
    if (hasMargin && company.strategy !== 'price_focused') {
        const premiumPrice = Math.min(market.sellPrice, market.sellPrice * (0.85 + Math.random() * 0.10));
        return premiumPrice / market.sellPrice;
    }

    return Math.max(26 / market.sellPrice, basePrice);
}

// ============================================
// 共通関数：販売実行
// 高い価格を狙う。大量販売者は名古屋・大阪など市場容量も考慮
// ============================================
function executeDefaultSale(company, salesCapacity, priceBase) {
    const targetSellQty = salesCapacity;
    const sellQty = Math.min(targetSellQty, company.products);
    const periodEndPayment = calculatePeriodPayment(company);
    const isCriticalCash = company.cash < periodEndPayment * 0.5;
    const minSellQty = isCriticalCash ? 1 : 2;

    if (sellQty >= minSellQty || (isCriticalCash && sellQty >= 1)) {
        const availableMarkets = gameState.markets
            .filter(m => m.currentStock < m.maxStock && !m.closed && (gameState.currentPeriod > 2 || m.name !== '海外'));

        if (availableMarkets.length === 0) {
            if (company.materials > 0 || company.wip > 0) {
                const mfgCapacity = getManufacturingCapacity(company);
                executeDefaultProduction(company, mfgCapacity);
                return;
            }
            const mfgCapacity = getManufacturingCapacity(company);
            executeDefaultMaterialPurchase(company, mfgCapacity);
            return;
        }

        // 市場選択ロジック：高い価格を狙いつつ、大量販売時は容量も考慮
        let selectedMarket = null;
        let selectedQty = 0;
        let bestScore = -Infinity;

        for (const market of availableMarkets) {
            const marketCapacity = market.maxStock - market.currentStock;
            const canSellQty = Math.min(sellQty, marketCapacity);

            if (canSellQty <= 0) continue;

            // スコア計算: 売上額を基本に、高価格市場を優先
            // 大量販売時(5個以上)は容量の大きい市場も検討
            const baseRevenue = market.sellPrice * canSellQty;
            const priceBonus = market.sellPrice * 2; // 高価格市場優先
            const capacityBonus = sellQty >= 5 && canSellQty >= sellQty ? 50 : 0; // 全量販売可能ならボーナス
            const fillBonus = canSellQty >= sellQty * 0.8 ? 30 : 0; // 80%以上販売可能ならボーナス

            const score = baseRevenue + priceBonus + capacityBonus + fillBonus;

            // 同じスコアなら高い価格の市場を優先
            if (score > bestScore || (score === bestScore && market.sellPrice > (selectedMarket?.sellPrice || 0))) {
                bestScore = score;
                selectedMarket = market;
                selectedQty = canSellQty;
            }
        }

        // 大量販売時の特別処理: 複数市場を検討
        if (sellQty >= 5) {
            const highPriceMarkets = availableMarkets
                .filter(m => m.sellPrice >= 28) // 名古屋以上の価格帯
                .sort((a, b) => b.sellPrice - a.sellPrice);

            const largeCapacityMarkets = availableMarkets
                .filter(m => (m.maxStock - m.currentStock) >= sellQty && m.sellPrice >= 20)
                .sort((a, b) => b.sellPrice - a.sellPrice);

            // 全量を1市場で販売できる最高価格の市場があれば、それを選択
            if (largeCapacityMarkets.length > 0) {
                const bestLargeMarket = largeCapacityMarkets[0];
                const highPriceRevenue = selectedMarket ? selectedMarket.sellPrice * selectedQty : 0;
                const largeMarketRevenue = bestLargeMarket.sellPrice * sellQty;

                // 全量販売の売上が高価格市場の部分販売より高ければ、大容量市場を選択
                if (largeMarketRevenue >= highPriceRevenue) {
                    selectedMarket = bestLargeMarket;
                    selectedQty = sellQty;
                    console.log(`[AI販売戦略] ${company.name}: 大量販売のため${selectedMarket.name}(容量${selectedMarket.maxStock})を選択`);
                }
            }
        }

        if (selectedMarket && selectedQty > 0) {
            const strategicPrice = calculateStrategicPrice(company, selectedMarket, priceBase);

            if (!selectedMarket.needsBid) {
                const revenue = selectedMarket.sellPrice * selectedQty;
                company.cash += revenue;
                company.products -= selectedQty;
                company.totalSales += revenue;
                company.totalSoldQuantity = (company.totalSoldQuantity || 0) + selectedQty;
                company.periodSalesCount = (company.periodSalesCount || 0) + 1;  // 販売回数追跡（120点評価用）
                company.periodMQ = (company.periodMQ || 0) + (selectedMarket.sellPrice - 10) * selectedQty;  // MQ追跡
                selectedMarket.currentStock += selectedQty;

                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, '商品販売', '💰', `${selectedMarket.name}に${selectedQty}個販売`, [
                    { label: '販売価格', value: `¥${selectedMarket.sellPrice}/個` },
                    { label: '売上', value: `¥${revenue}`, highlight: true }
                ]);
                return;
            } else {
                startAIBidding(company, selectedMarket, selectedQty, strategicPrice);
                return;
            }
        }
    }

    if (company.materials > 0 || company.wip > 0) {
        const mfgCapacity = getManufacturingCapacity(company);
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    const mfgCapacity = getManufacturingCapacity(company);
    executeDefaultMaterialPurchase(company, mfgCapacity);
}

// ============================================
// 共通関数：材料購入
// ============================================
function executeDefaultMaterialPurchase(company, targetQty) {
    const mfgCapacity = getManufacturingCapacity(company);
    const materialCapacity = getMaterialCapacity(company);
    const canStore = Math.max(0, materialCapacity - company.materials);
    const maxBuyable = gameState.currentPeriod === 2 ? canStore : Math.min(mfgCapacity, canStore);
    const actualTargetQty = Math.min(targetQty, maxBuyable);
    const companyIndex = gameState.companies.indexOf(company);

    const availableMarkets = gameState.markets.filter(m => m.currentStock > 0 && !m.closed)
        .sort((a, b) => a.buyPrice - b.buyPrice);

    if (availableMarkets.length > 0) {
        // 2市場同時購入を検討（購入目標が2個以上、複数市場が利用可能、行数に余裕）
        // 重要: 2市場から購入する場合は2行使用する
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
        const shouldDistribute = actualTargetQty >= 2 && availableMarkets.length >= 2 && rowsRemaining >= 2;

        if (shouldDistribute) {
            let simulatedTotal = 0;
            let simulatedCash = company.cash;
            let purchases = [];

            for (const market of availableMarkets) {
                if (simulatedTotal >= actualTargetQty) break;
                if (purchases.length >= 2) break; // 最大2市場まで
                const maxAffordable = Math.floor(simulatedCash / market.buyPrice);
                const buyQty = Math.min(actualTargetQty - simulatedTotal, market.currentStock, maxAffordable);

                if (buyQty > 0) {
                    simulatedCash -= market.buyPrice * buyQty;
                    simulatedTotal += buyQty;
                    purchases.push({ market, qty: buyQty, cost: market.buyPrice * buyQty });
                }
            }

            // 2市場から購入する場合は2行使用
            if (purchases.length >= 2 && simulatedTotal >= 2) {
                let totalCost = 0;
                let purchaseDetails = [];

                for (const p of purchases) {
                    company.cash -= p.cost;
                    company.materials += p.qty;
                    company.totalMaterialCost += p.cost;
                    p.market.currentStock -= p.qty;
                    totalCost += p.cost;
                    purchaseDetails.push(`${p.market.name}:${p.qty}個`);
                }

                // 2市場購入 = 2行使用
                incrementRow(companyIndex);
                incrementRow(companyIndex);

                const detailText = `2市場購入（2行使用）: ${purchaseDetails.join('、')}`;
                showAIActionModal(company, '材料仕入（2行）', '📦📦', detailText, [
                    { label: '購入数', value: `${simulatedTotal}個` },
                    { label: '支払', value: `¥${totalCost}` },
                    { label: '使用行数', value: '2行', highlight: true }
                ]);
                console.log(`[2市場購入-2行] ${company.name}: ${purchaseDetails.join(', ')} 合計${simulatedTotal}個 ¥${totalCost}`);
                return;
            }
        }

        // 1市場から購入（1行使用）
        const market = availableMarkets[0];
        const buyQty = Math.min(actualTargetQty, market.currentStock, Math.floor(company.cash / market.buyPrice));

        if (buyQty >= 1) {
            const cost = market.buyPrice * buyQty;
            company.cash -= cost;
            company.materials += buyQty;
            company.totalMaterialCost += cost;
            market.currentStock -= buyQty;

            incrementRow(companyIndex);
            showAIActionModal(company, '材料仕入', '📦', `${market.name}から${buyQty}個購入`, [
                { label: '仕入価格', value: `¥${market.buyPrice}/個` },
                { label: '支払', value: `¥${cost}` }
            ]);
            return;
        }
    }

    if (company.materials > 0 || company.wip > 0) {
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    const chipCost = gameState.currentPeriod === 2 ? 20 : 40;
    const maxResearchChips = gameState.currentPeriod === 2 ? 4 : 5;
    if (company.cash >= chipCost && company.chips.research < maxResearchChips) {
        company.cash -= chipCost;
        aiPurchaseChip(company, 'research', chipCost);
        incrementRow(gameState.companies.indexOf(company));
        showAIActionModal(company, 'チップ購入', '🔬', '研究開発チップ購入');
        return;
    }

    aiDoNothing(company, '材料・資金不足');
}

// ============================================
// 共通関数：パイプライン維持型生産判断
// ============================================
/**
 * パイプラインを維持しながら生産を実行
 *
 * 重要なルール:
 * - 仕掛品のみ（材料なし）で生産すると、完成後に材料0・仕掛品0になる
 * - これは次回2行必要（材料購入→投入のみ→完成のみ）で非効率
 * - 先に材料を買えば、次の生産で完成＋投入が同時にできる
 *
 * @returns {boolean} true = 生産実行済み, false = 生産しなかった
 */
function executeProductionWithPipelineCheck(company, mfgCapacity) {
    // 仕掛品のみ（材料なし）の場合
    if (company.wip > 0 && company.materials === 0) {
        const periodEndCost = calculatePeriodPayment(company);
        const safetyMargin = periodEndCost + 30;

        // 材料を先に購入してパイプライン維持
        const availableMarkets = gameState.markets.filter(m => m.currentStock > 0 && !m.closed);
        if (availableMarkets.length > 0 && company.cash > safetyMargin + 15) {
            console.log(`[パイプライン維持] ${company.name}: 仕掛品${company.wip}のみ → 先に材料購入`);
            executeDefaultMaterialPurchase(company, mfgCapacity);
            return true;
        }

        // 材料購入できない場合は仕方なく生産（パイプライン切れる）
        console.log(`[パイプライン注意] ${company.name}: 材料購入不可 → 仕掛品完成のみ`);
        executeDefaultProduction(company, mfgCapacity);
        return true;
    }

    // 材料あり（+仕掛品もあれば同時処理）→ 通常生産
    if (company.materials > 0) {
        const action = company.wip > 0 ? '完成＋投入同時' : '投入のみ';
        console.log(`[最適生産] ${company.name}: ${action}`);
        executeDefaultProduction(company, mfgCapacity);
        return true;
    }

    // 材料も仕掛品もない
    return false;
}

// ============================================
// 共通関数：生産実行
// ============================================
function executeDefaultProduction(company, maxQty) {
    const produceQty = Math.min(maxQty, company.materials);
    const wipToProduct = Math.min(maxQty, company.wip);
    const cost = produceQty + wipToProduct;

    if (company.cash >= cost && (produceQty > 0 || wipToProduct > 0)) {
        company.cash -= cost;
        company.materials -= produceQty;
        company.wip += produceQty - wipToProduct;
        company.products += wipToProduct;
        company.totalProductionCost += cost;

        let detail = '';
        if (produceQty > 0) detail += `材料→仕掛品: ${produceQty}個`;
        if (wipToProduct > 0) detail += `${produceQty > 0 ? '、' : ''}仕掛品→製品: ${wipToProduct}個`;

        incrementRow(gameState.companies.indexOf(company));
        showAIActionModal(company, '完成・投入', '🏭', detail, [
            { label: '加工費', value: `¥${cost}` }
        ]);
        return;
    }

    const mfgCapacity = getManufacturingCapacity(company);
    executeDefaultMaterialPurchase(company, mfgCapacity);
}

// ============================================
// 共通関数：投資実行
// ============================================
function executeDefaultInvestment(company) {
    const companyIndex = gameState.companies.indexOf(company);
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);
    const chipCost = gameState.currentPeriod === 2 ? 20 : 40;
    const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
    const periodsRemaining = 5 - gameState.currentPeriod;

    if (rowsRemaining < 5) {
        aiDoNothing(company, '期末間近');
        return;
    }

    const periodEndCost = calculatePeriodPayment(company);
    let safetyMargin = periodEndCost + 30;

    if (company.strategy === 'aggressive') safetyMargin = periodEndCost + 15;
    if (company.strategy === 'tech_focused') safetyMargin = periodEndCost + 20;
    if (company.strategy === 'conservative') safetyMargin = periodEndCost + 50;

    if (company.cash <= safetyMargin) {
        aiDoNothing(company, '資金温存');
        return;
    }

    // 2期は積極的にチップ投資（3期への繰り越し用）
    if (gameState.currentPeriod === 2 && rowsRemaining > 3) {
        const totalCurrentChips = (company.chips.research || 0) +
                                  (company.chips.education || 0) +
                                  (company.chips.advertising || 0);
        const chipBudget = company.cash - safetyMargin - 20; // 20円余裕を持つ

        // 目標: 研究2-3枚、教育1枚、広告1枚（計4-5枚を繰り越し）
        if (chipBudget >= 20) {
            // 優先1: 研究チップ（入札競争力）
            if (company.chips.research < 3) {
                company.cash -= 20;
                aiPurchaseChip(company, 'research', 20);
                incrementRow(companyIndex);
                const msg = company.chips.research === 0 ? '研究チップ購入（入札競争力+2）' :
                           `研究チップ${company.chips.research + 1}枚目（3期繰越用）`;
                showAIActionModal(company, 'チップ購入', '🔬', msg);
                return;
            }
            // 優先2: 教育チップ（採用コスト削減）
            if (company.chips.education < 1) {
                company.cash -= 20;
                aiPurchaseChip(company, 'education', 20);
                incrementRow(companyIndex);
                showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（3期繰越用）');
                return;
            }
            // 優先3: 広告チップ（販売能力+1）
            if (company.chips.advertising < 1) {
                company.cash -= 20;
                aiPurchaseChip(company, 'advertising', 20);
                incrementRow(companyIndex);
                showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入（3期繰越用）');
                return;
            }
            // 余裕があれば追加投資
            if (rowsRemaining > 6 && chipBudget >= 40) {
                if (company.chips.research < 4) {
                    company.cash -= 20;
                    aiPurchaseChip(company, 'research', 20);
                    incrementRow(companyIndex);
                    showAIActionModal(company, 'チップ購入', '🔬', `研究チップ${company.chips.research + 1}枚目（追加投資）`);
                    return;
                }
            }
        }
    }

    // 能力バランス調整
    const needMoreMfg = mfgCapacity < salesCapacity && mfgCapacity < 6;
    const needMoreSales = salesCapacity < mfgCapacity && salesCapacity < 6;

    if (needMoreMfg && company.workers < 3 && company.cash >= 5 + safetyMargin) {
        const machineCapacity = company.machines.reduce((sum, m) => {
            if (m.type === 'small') return sum + (m.attachments > 0 ? 2 : 1);
            return sum + 4;
        }, 0) + (company.chips.computer || 0);

        if (company.workers < machineCapacity) {
            company.cash -= 5;
            company.workers++;
            company.extraLaborCost = (company.extraLaborCost || 0) + 5;
            incrementRow(companyIndex);
            showAIActionModal(company, '採用', '👷', 'ワーカー採用（製造能力向上）');
            return;
        }
    }

    if (needMoreSales && company.salesmen < 3 && company.cash >= 5 + safetyMargin) {
        company.cash -= 5;
        company.salesmen++;
        company.extraLaborCost = (company.extraLaborCost || 0) + 5;
        incrementRow(companyIndex);
        showAIActionModal(company, '採用', '💼', 'セールスマン採用（販売能力向上）');
        return;
    }

    // 3期以降の特急チップは「どうしても必要な時」のみ
    if (gameState.currentPeriod >= 3 && company.cash >= 40 + safetyMargin) {
        const expressCost = 40;

        // 研究チップ特急: 研究0枚で入札市場を狙いたい時
        const hasNoResearch = (company.chips.research || 0) === 0;
        const hasProducts = (company.products || 0) >= 2;
        if (hasNoResearch && hasProducts && salesCapacity > 0) {
            company.cash -= expressCost;
            aiPurchaseChip(company, 'research', expressCost);
            incrementRow(companyIndex);
            showAIActionModal(company, '特急チップ', '🔬', '研究チップ特急購入（入札参入必須）');
            return;
        }

        // 広告チップ特急: 製品が余っているのに売れない時
        const productsStuck = (company.products || 0) >= 3 && salesCapacity < company.products;
        if (productsStuck && (company.chips.advertising || 0) === 0) {
            company.cash -= expressCost;
            aiPurchaseChip(company, 'advertising', expressCost);
            incrementRow(companyIndex);
            showAIActionModal(company, '特急チップ', '📢', '広告チップ特急購入（在庫消化必須）');
            return;
        }
    }

    aiDoNothing(company, 'チップ投資見送り');
}

// ============================================
// AI入札開始（AIが親で市場に販売を試みる場合）
// ============================================
function startAIBidding(aiCompany, market, aiQty, strategicPrice) {
    const companyIndex = gameState.companies.indexOf(aiCompany);
    const marketIndex = gameState.markets.indexOf(market);

    // AI入札情報を保存
    const isAIParent = (gameState.currentPlayerIndex === companyIndex);
    const aiCompetitiveness = getPriceCompetitiveness(aiCompany, companyIndex);
    const aiDisplayPrice = Math.min(Math.round(strategicPrice * market.sellPrice), market.sellPrice);
    const aiCallPrice = aiDisplayPrice - aiCompetitiveness;

    gameState.pendingAIBid = {
        company: companyIndex,
        price: aiCallPrice,
        displayPrice: aiDisplayPrice,
        quantity: aiQty,
        market: marketIndex,
        competitiveness: aiCompetitiveness,
        isParent: isAIParent
    };

    // プレイヤーに入札参加を確認
    const playerCompany = gameState.companies[0];
    const playerProducts = playerCompany.products || 0;
    const playerSalesCapacity = getSalesCapacity(playerCompany);
    const canPlayerBid = playerProducts > 0 && playerSalesCapacity > 0 && !playerCompany.cannotSell;

    const content = `
        <div class="bid-display" style="text-align: center;">
            <div style="font-size: 14px; color: #6366f1; margin-bottom: 10px;">📢 ${aiCompany.name}が<strong>${aiQty}個</strong>を入札開始</div>
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); color: white; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
                <div style="font-size: 18px; font-weight: bold;">${market.name}市場</div>
                <div style="font-size: 14px; opacity: 0.9;">基準価格: ¥${market.sellPrice}</div>
                <div style="font-size: 12px; opacity: 0.8; margin-top: 5px;">
                    ${aiCompany.name}が入札中（価格は非公開）
                </div>
            </div>
            ${canPlayerBid ? `
                <div style="background: #e0f2fe; padding: 10px; border-radius: 8px; margin-bottom: 15px;">
                    <div style="font-size: 12px; color: #0369a1;">あなたの状況</div>
                    <div style="font-size: 14px; font-weight: bold;">製品: ${playerProducts}個 / 販売能力: ${playerSalesCapacity}個</div>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="font-size: 12px; color: #374151;">入札数量:</label>
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 5px;">
                        <button onclick="adjustAIBidQty(-1)" style="width: 40px; height: 40px; border-radius: 50%; border: none; background: #6366f1; color: white; font-size: 20px; cursor: pointer;">−</button>
                        <input type="number" id="aiBidQty" value="${Math.min(playerSalesCapacity, playerProducts)}" min="1" max="${Math.min(playerSalesCapacity, playerProducts)}" readonly style="width: 60px; height: 40px; text-align: center; font-size: 18px; border: 2px solid #6366f1; border-radius: 8px;">
                        <button onclick="adjustAIBidQty(1)" style="width: 40px; height: 40px; border-radius: 50%; border: none; background: #6366f1; color: white; font-size: 20px; cursor: pointer;">+</button>
                    </div>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="font-size: 12px; color: #374151;">入札価格 (¥20〜¥${market.sellPrice}):</label>
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 5px;">
                        <button onclick="adjustAIBidPrice(-1)" style="width: 40px; height: 40px; border-radius: 50%; border: none; background: #6366f1; color: white; font-size: 20px; cursor: pointer;">−</button>
                        <input type="number" id="aiBidPrice" value="30" min="20" max="${market.sellPrice}" readonly style="width: 70px; height: 40px; text-align: center; font-size: 18px; border: 2px solid #6366f1; border-radius: 8px;">
                        <button onclick="adjustAIBidPrice(1)" style="width: 40px; height: 40px; border-radius: 50%; border: none; background: #6366f1; color: white; font-size: 20px; cursor: pointer;">+</button>
                    </div>
                </div>
                <button class="submit-btn" onclick="playerJoinAIBid(${marketIndex})" style="width: 100%; margin-bottom: 10px;">入札に参加</button>
            ` : `
                <div style="background: #fef3c7; padding: 10px; border-radius: 8px; margin-bottom: 15px; color: #92400e;">
                    ${!playerProducts ? '製品がないため入札できません' :
                      !playerSalesCapacity ? '販売能力がないため入札できません' :
                      '消費者運動中のため販売できません'}
                </div>
            `}
            <button class="cancel-btn" onclick="skipAIBid()" style="width: 100%;">入札に参加しない</button>
        </div>
    `;

    showModal('入札参加', content);
}

// AI入札の数量調整
function adjustAIBidQty(delta) {
    const input = document.getElementById('aiBidQty');
    if (!input) return;
    const max = parseInt(input.max) || 1;
    const min = parseInt(input.min) || 1;
    const current = parseInt(input.value) || 1;
    input.value = Math.max(min, Math.min(max, current + delta));
}

// AI入札の価格調整
function adjustAIBidPrice(delta) {
    const input = document.getElementById('aiBidPrice');
    if (!input) return;
    const max = parseInt(input.max) || 32;
    const min = parseInt(input.min) || 20;
    const current = parseInt(input.value) || 30;
    input.value = Math.max(min, Math.min(max, current + delta));
}

// プレイヤーがAI入札に参加
function playerJoinAIBid(marketIndex) {
    const market = gameState.markets[marketIndex];
    const playerCompany = gameState.companies[0];
    const playerQty = parseInt(document.getElementById('aiBidQty').value) || 1;
    const playerDisplayPrice = parseInt(document.getElementById('aiBidPrice').value) || market.sellPrice;

    const isPlayerParent = (gameState.currentPlayerIndex === 0);
    const playerCompetitiveness = getPriceCompetitiveness(playerCompany, 0); // プレイヤーは常にindex 0
    const playerCallPrice = playerDisplayPrice - playerCompetitiveness;

    // 全入札を集める
    const allBids = [
        gameState.pendingAIBid,
        {
            company: 0,
            price: playerCallPrice,
            displayPrice: playerDisplayPrice,
            quantity: playerQty,
            competitiveness: playerCompetitiveness,
            isParent: isPlayerParent
        }
    ];

    // 他のAIも入札に参加
    for (let i = 1; i < gameState.companies.length; i++) {
        if (i === gameState.pendingAIBid.company) continue; // 親AIはすでに入札済み
        const otherAI = gameState.companies[i];
        if (otherAI.products > 0 && !otherAI.cannotSell) {
            const otherSalesCapacity = getSalesCapacity(otherAI);
            const otherQty = Math.min(otherSalesCapacity, otherAI.products);
            if (otherQty > 0) {
                const isOtherParent = (gameState.currentPlayerIndex === i);
                const otherCompetitiveness = getPriceCompetitiveness(otherAI, i); // 正しくcompanyIndexを渡す
                // 戦略的価格設定：研究チップが多いほど高い価格で入札（利益最大化）
                const baseRate = 0.85 + Math.random() * 0.10;
                const competitiveBonus = otherCompetitiveness * 0.02; // 競争力1につき+2%
                const strategicRate = Math.min(baseRate + competitiveBonus, 1.0);
                const otherDisplayPrice = Math.max(26, Math.floor(market.sellPrice * strategicRate)); // AIは26円以上
                const otherCallPrice = otherDisplayPrice - otherCompetitiveness;
                allBids.push({
                    company: i,
                    price: otherCallPrice,
                    displayPrice: otherDisplayPrice,
                    quantity: otherQty,
                    competitiveness: otherCompetitiveness,
                    isParent: isOtherParent
                });
            }
        }
    }

    processAIBidResults(marketIndex, allBids);
}

// プレイヤーがAI入札をスキップ
function skipAIBid() {
    const marketIndex = gameState.pendingAIBid?.market;
    if (marketIndex === undefined) {
        closeModal();
        nextTurn();
        return;
    }

    // プレイヤーは不参加、AIのみで入札処理
    const allBids = [gameState.pendingAIBid];

    // 他のAIも入札に参加
    const market = gameState.markets[marketIndex];
    for (let i = 1; i < gameState.companies.length; i++) {
        if (i === gameState.pendingAIBid.company) continue;
        const otherAI = gameState.companies[i];
        if (otherAI.products > 0 && !otherAI.cannotSell) {
            const otherSalesCapacity = getSalesCapacity(otherAI);
            const otherQty = Math.min(otherSalesCapacity, otherAI.products);
            if (otherQty > 0) {
                const isOtherParent = (gameState.currentPlayerIndex === i);
                const otherCompetitiveness = getPriceCompetitiveness(otherAI, i); // 正しくcompanyIndexを渡す
                // 戦略的価格設定：研究チップが多いほど高い価格で入札（利益最大化）
                const baseRate = 0.85 + Math.random() * 0.10;
                const competitiveBonus = otherCompetitiveness * 0.02; // 競争力1につき+2%
                const strategicRate = Math.min(baseRate + competitiveBonus, 1.0);
                const otherDisplayPrice = Math.max(26, Math.floor(market.sellPrice * strategicRate)); // AIは26円以上
                const otherCallPrice = otherDisplayPrice - otherCompetitiveness;
                allBids.push({
                    company: i,
                    price: otherCallPrice,
                    displayPrice: otherDisplayPrice,
                    quantity: otherQty,
                    competitiveness: otherCompetitiveness,
                    isParent: isOtherParent
                });
            }
        }
    }

    processAIBidResults(marketIndex, allBids);
}

// AI入札結果を処理
function processAIBidResults(marketIndex, allBids) {
    const market = gameState.markets[marketIndex];

    // 入札をソート
    BiddingSystem.sortBids(allBids, gameState, gameState.pendingAIBid.company);

    // 親の数量分だけ販売可能
    const parentBid = allBids.find(b => b.company === gameState.pendingAIBid.company);
    const parentQuantity = parentBid ? parentBid.quantity : 3;
    let remainingCapacity = Math.min(parentQuantity, market.maxStock - market.currentStock);
    let salesResults = [];

    for (const bid of allBids) {
        if (remainingCapacity <= 0) break;

        const bidCompany = gameState.companies[bid.company];
        const bidderSalesCapacity = getSalesCapacity(bidCompany);
        const actualQty = Math.min(remainingCapacity, bidCompany.products, bidderSalesCapacity);

        if (actualQty > 0) {
            const salePrice = bid.displayPrice;
            const revenue = salePrice * actualQty;
            bidCompany.cash += revenue;
            bidCompany.products -= actualQty;
            bidCompany.totalSales += revenue;
            bidCompany.totalSoldQuantity = (bidCompany.totalSoldQuantity || 0) + actualQty;
            bidCompany.periodSalesCount = (bidCompany.periodSalesCount || 0) + 1;  // 販売回数追跡（120点評価用）
            bidCompany.periodMQ = (bidCompany.periodMQ || 0) + (salePrice - 10) * actualQty;  // MQ追跡
            market.currentStock += actualQty;
            remainingCapacity -= actualQty;

            bidCompany.currentRow = (bidCompany.currentRow || 1) + 1;
            bidCompany.rowsUsed = (bidCompany.rowsUsed || 0) + 1;

            logAction(bid.company, '商品販売', `${market.name}に¥${salePrice}×${actualQty}個`, revenue, true);

            salesResults.push({
                company: bidCompany,
                quantity: actualQty,
                price: salePrice,
                callPrice: bid.price,
                competitiveness: bid.competitiveness || 0,
                displayPrice: bid.displayPrice
            });

            if (typeof AIBrain !== 'undefined') {
                AIBrain.recordBidResult(salePrice, true, market.name);
            }
        }
    }

    // 結果表示
    let resultHtml = `<div style="text-align: center; margin-bottom: 10px;">
        <div style="font-size: 14px; color: #666;">📍 ${market.name}市場の入札結果</div>
    </div>`;

    // 全入札者の価格を表示（④対応）
    resultHtml += `<div style="background: #f8fafc; padding: 10px; border-radius: 8px; margin-bottom: 12px;">
        <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">📊 入札一覧（コール価格順）</div>`;
    allBids.forEach((bid, idx) => {
        const bidCompany = gameState.companies[bid.company];
        const isPlayer = bid.company === 0;
        const isParent = bid.company === gameState.pendingAIBid?.company;
        const parentMark = isParent ? ' 👑親' : '';
        const soldResult = salesResults.find(r => gameState.companies.indexOf(r.company) === bid.company);
        const soldMark = soldResult ? ` → ${soldResult.quantity}個販売` : ' → 落札なし';
        resultHtml += `
            <div style="display: flex; justify-content: space-between; padding: 4px 8px; border-radius: 4px; ${isPlayer ? 'background: #dbeafe;' : ''}">
                <span style="${isPlayer ? 'color: #1d4ed8; font-weight: bold;' : 'color: #374151;'}">${idx + 1}. ${bidCompany.name}${parentMark}</span>
                <span style="font-size: 12px;">表示¥${bid.displayPrice} → コール¥${bid.price}${soldMark}</span>
            </div>`;
    });
    resultHtml += `</div>`;

    // 落札結果を表示
    salesResults.forEach((result, idx) => {
        const isPlayer = (gameState.companies.indexOf(result.company) === 0);
        const rankStyle = idx === 0 ? 'background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: white;' :
                          'background: #f1f5f9; color: #374151;';
        const rankLabel = idx === 0 ? '🏆 落札' : `${idx + 1}位`;

        resultHtml += `
            <div style="${rankStyle} padding: 12px; border-radius: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="font-weight: bold;">${rankLabel}</span>
                        <span style="${isPlayer ? 'color: #2563eb; font-weight: bold;' : ''}">${result.company.name}</span>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 12px;">表示価格¥${result.displayPrice} → コール¥${result.callPrice}</div>
                        <div style="font-weight: bold;">${result.quantity}個 = ¥${result.price * result.quantity}</div>
                    </div>
                </div>
            </div>
        `;
    });

    if (salesResults.length === 0) {
        resultHtml += '<div style="color: #666; text-align: center; padding: 20px;">販売できる会社がありませんでした</div>';
    }

    resultHtml += '<button class="submit-btn" onclick="closeModal(); updateDisplay(); nextTurn();" style="width: 100%; margin-top: 15px;">OK</button>';

    closeModal();
    gameState.pendingAIBid = null;
    showModal('入札結果', resultHtml);
}