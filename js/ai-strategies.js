/**
 * MG (Management Game) - AI戦略関数
 *
 * AI性格別の戦略実行、入札処理、共通アクション関数を定義
 * 依存: constants.js, state.js, game.js, ai-brain.js
 */

// ============================================
// AI「何もしない」行動（行は消費しない - お金の動きがないため）
// ============================================
function aiDoNothing(company, reason = '') {
    const companyIndex = gameState.companies.indexOf(company);
    // 行は消費しない（お金の動きがある時だけ行を消費）
    const detail = reason || '行動条件なし';
    logAction(companyIndex, '待機', detail, 0, false);  // rowUsed = false
    showAIActionModal(company, '待機', '⏳', detail);
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
        safetyMultiplier: strategyParams.safetyMultiplier || 1.0
    };

    const safetyMargin = Math.floor(periodEndCost * params.safetyMultiplier) + 20;
    const safeInvestment = Math.max(0, company.cash - safetyMargin);

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

    // === 3. 2期：チップ投資最優先（MQ基盤構築） ===
    if (period === 2) {
        // 教育チップ：製造+1、販売+1 → MQへの寄与最大
        if (company.chips.education < params.targetEducationChips && safeInvestment >= 20) {
            return {
                action: 'BUY_CHIP',
                params: { chipType: 'education', cost: 20 },
                reason: `教育チップ${company.chips.education + 1}枚目（MQ基盤）`
            };
        }

        // 研究チップ：価格競争力+2 → 入札勝利確率UP
        if (company.chips.research < params.targetResearchChips && safeInvestment >= 20) {
            return {
                action: 'BUY_CHIP',
                params: { chipType: 'research', cost: 20 },
                reason: `研究チップ${company.chips.research + 1}枚目（価格競争力）`
            };
        }

        // 広告チップ：販売能力+2/セールスマン
        if (company.chips.advertising < params.targetAdvertisingChips &&
            company.salesmen >= 1 && safeInvestment >= 20) {
            return {
                action: 'BUY_CHIP',
                params: { chipType: 'advertising', cost: 20 },
                reason: `広告チップ${company.chips.advertising + 1}枚目（販売強化）`
            };
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

    const cashSafety = company.cash - periodEndCost;
    const isCashTight = cashSafety < 50;

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
// AI性格別の戦略実行（AIBrain統合版 + 強化AI機能）
// ============================================
function executeAIStrategyByType(company, mfgCapacity, salesCapacity, analysis) {
    const companyIndex = gameState.companies.indexOf(company);
    const period = gameState.currentPeriod;

    // === 動的戦略調整: 現在のゲーム状況に応じてパラメータ調整 ===
    const dynamicAdj = AIBrain.dynamicStrategyAdjustment(company, companyIndex);
    console.log(`[動的調整] ${company.name}: ${dynamicAdj.reasoning}`);

    // === 複数ターン先読み: シナリオ比較で最適方針を決定 ===
    const futureSim = AIBrain.simulateFutureTurns(company, companyIndex, 3);
    console.log(`[先読み] ${company.name}: ${futureSim.reasoning}`);

    // === 期待値ベース最適行動選択 ===
    const evDecision = AIBrain.selectOptimalAction(company, companyIndex);
    if (evDecision.recommended && evDecision.recommended.ev.expectedValue > 10) {
        console.log(`[期待値] ${company.name}: ${evDecision.recommended.action.type} EV=${evDecision.recommended.ev.expectedValue.toFixed(0)}`);
    }

    // === G最大化マスター戦略を最優先で実行 ===
    const strategyParams = STRATEGY_PARAMS[company.strategy] || STRATEGY_PARAMS.balanced;

    // 動的調整を反映
    const adjustedParams = {
        ...strategyParams,
        aggressiveness: Math.min(1, strategyParams.aggressiveness + (dynamicAdj.aggressiveness - 0.5) * 0.5),
        safetyMultiplier: strategyParams.safetyMultiplier * (1 + (0.5 - dynamicAdj.riskTolerance) * 0.3)
    };

    const gMaxAction = getGMaximizingAction(company, companyIndex, adjustedParams);

    if (gMaxAction && gMaxAction.action !== 'WAIT') {
        console.log(`[G最大化] ${company.name}: ${gMaxAction.action} - ${gMaxAction.reason}`);
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
                if (company.cash >= chipCost + 50) {
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
        const canAfford = Math.floor((company.cash - periodEndCost - 20) / cheapest.buyPrice);
        const buyQty = Math.min(canStore, cheapest.currentStock, canAfford, mfgCapacity * 2);

        if (buyQty >= 2 && company.cash > periodEndCost + 30) {
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
            if (company.cash >= chipCost + periodEndCost + 30) {
                company.cash -= chipCost;
                company.chips.research = (company.chips.research || 0) + 1;
                incrementRow(companyIndex);
                showAIActionModal(company, 'チップ購入', '🔬', '研究チップ（成功カード6枚に備える）');
                return;
            }
        }

        if (riskRecommendation.action === 'BUY_INSURANCE' && !company.chips.insurance) {
            const insuranceCost = 10;
            if (company.cash >= insuranceCost + periodEndCost + 20) {
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

    // 倉庫購入
    if (analysis.needsWarehouse && company.warehouses < 2 && company.cash >= 50 + analysis.periodEndCost && analysis.rowsRemaining >= 20) {
        const warehouseCost = 50;
        company.cash -= warehouseCost;
        company.warehouses++;
        if (company.warehouses === 1) {
            company.warehouseLocation = analysis.warehouseLocation;
        }
        incrementRow(companyIndex);
        const protection = company.warehouseLocation === 'materials' ? '火災保護' : '盗難保護';
        showAIActionModal(company, '倉庫購入', '🏪', `倉庫購入（在庫+5、${protection}）`);
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
    const companyRow = company.currentRow || 1;
    const maxRow = Math.max(...gameState.companies.map(c => c.currentRow || 1));
    const canDistribute = companyRow < maxRow;

    const availableMarkets = gameState.markets.filter(m => m.currentStock > 0 && !m.closed)
        .sort((a, b) => a.buyPrice - b.buyPrice);

    if (availableMarkets.length > 0) {
        if (canDistribute) {
            let simulatedTotal = 0;
            let simulatedCash = company.cash;
            let purchases = [];

            for (const market of availableMarkets) {
                if (simulatedTotal >= actualTargetQty) break;
                const maxAffordable = Math.floor(simulatedCash / market.buyPrice);
                const buyQty = Math.min(actualTargetQty - simulatedTotal, market.currentStock, maxAffordable);

                if (buyQty > 0) {
                    simulatedCash -= market.buyPrice * buyQty;
                    simulatedTotal += buyQty;
                    purchases.push({ market, qty: buyQty, cost: market.buyPrice * buyQty });
                }
            }

            if (simulatedTotal >= 2) {
                let totalCost = 0;
                let purchaseDetails = [];

                for (const p of purchases) {
                    company.cash -= p.cost;
                    company.materials += p.qty;
                    company.totalMaterialCost += p.cost;
                    p.market.currentStock -= p.qty;
                    totalCost += p.cost;
                    purchaseDetails.push(`${p.market.name}:${p.qty}`);
                }

                incrementRow(gameState.companies.indexOf(company));
                showAIActionModal(company, '材料仕入', '📦', purchaseDetails.join('、'), [
                    { label: '購入数', value: `${simulatedTotal}個` },
                    { label: '支払', value: `¥${totalCost}` }
                ]);
                return;
            }
        }

        const market = availableMarkets[0];
        const buyQty = Math.min(actualTargetQty, market.currentStock, Math.floor(company.cash / market.buyPrice));

        if (buyQty >= 1) {
            const cost = market.buyPrice * buyQty;
            company.cash -= cost;
            company.materials += buyQty;
            company.totalMaterialCost += cost;
            market.currentStock -= buyQty;

            incrementRow(gameState.companies.indexOf(company));
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
                    ${aiCompany.name}: 表示¥${aiDisplayPrice} → コール¥${aiCallPrice}
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