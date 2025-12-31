/**
 * MG (Management Game) - AI戦略関数
 *
 * AI性格別の戦略実行、入札処理、共通アクション関数を定義
 * 依存: constants.js, state.js, game.js, ai-brain.js
 */

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
// AI性格別の戦略実行（AIBrain統合版）
// ============================================
function executeAIStrategyByType(company, mfgCapacity, salesCapacity, analysis) {
    const companyIndex = gameState.companies.indexOf(company);
    const period = gameState.currentPeriod;

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

        nextTurn();
        return;
    }

    // 4期後半は回収フェーズ
    if (analysis.isRecoveryPhase && company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, salesCapacity, 0.78);
        return;
    }

    // 2期は投資優先
    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 5) {
        if (company.chips.education < 2 && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'education', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（2期攻め投資）');
            return;
        }
        if (company.chips.research < 2 && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'research', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', '研究チップ購入（2期攻め投資）');
            return;
        }
    }

    // 販売優先
    const minSellQty = Math.ceil(salesCapacity * 0.7);
    if (company.products >= minSellQty && salesCapacity > 0) {
        executeDefaultSale(company, Math.min(salesCapacity, company.products), 0.78);
        return;
    }

    // 生産最大化
    if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    // 材料購入
    if (company.cash > safetyMargin + 40 && company.materials < mfgCapacity) {
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

        nextTurn();
        return;
    }

    if (analysis.isRecoveryPhase && company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, salesCapacity, 0.83);
        return;
    }

    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 5) {
        if (!company.chips.insurance && company.cash >= chipCost + safetyMargin) {
            company.cash -= 5;
            company.chips.insurance = 1;
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🛡️', '保険チップ購入（2期リスク対策）');
            return;
        }
        if (company.chips.education < 2 && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'education', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（2期堅実投資）');
            return;
        }
        if (company.chips.research < 2 && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'research', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', '研究チップ購入（2期堅実投資）');
            return;
        }
    }

    const minSellQty = Math.ceil(salesCapacity * 0.7);
    if (company.products >= minSellQty && salesCapacity > 0) {
        executeDefaultSale(company, Math.min(salesCapacity, company.products), 0.85);
        return;
    }

    if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0 && company.products < 4) {
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    if (company.cash > safetyMargin + 40 && company.materials < mfgCapacity) {
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

    nextTurn();
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

        nextTurn();
        return;
    }

    if (analysis.isRecoveryPhase && company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, salesCapacity, 0.78);
        return;
    }

    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 5) {
        if (company.chips.research < 2 && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'research', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', '研究チップ購入（2期価格戦略）');
            return;
        }
        if (company.chips.advertising < 2 && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'advertising', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入（2期販売強化）');
            return;
        }
    }

    const minSellQty = Math.ceil(salesCapacity * 0.7);
    if (company.products >= minSellQty && salesCapacity > 0) {
        executeDefaultSale(company, Math.min(salesCapacity, company.products), 0.78);
        return;
    }

    if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    if (company.cash > safetyMargin + 40 && company.materials < mfgCapacity) {
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

    nextTurn();
}

// ============================================
// E社：技術重視戦略
// ============================================
function executeTechFocusedStrategy(company, mfgCapacity, salesCapacity, analysis) {
    const periodEndCost = calculatePeriodPayment(company);
    const safetyMargin = periodEndCost + 40;
    const chipCost = gameState.currentPeriod === 2 ? 20 : 40;

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

        nextTurn();
        return;
    }

    if (analysis.isRecoveryPhase && company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, salesCapacity, 0.78);
        return;
    }

    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 5) {
        if (company.chips.education < 2 && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'education', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（2期技術投資）');
            return;
        }
        if (company.chips.research < 2 && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'research', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', '研究チップ購入（2期技術投資）');
            return;
        }
    }

    const minSellQty = Math.ceil(salesCapacity * 0.7);
    if (company.products >= minSellQty && salesCapacity > 0) {
        executeDefaultSale(company, Math.min(salesCapacity, company.products), 0.80);
        return;
    }

    if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
        executeDefaultProduction(company, mfgCapacity);
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

        nextTurn();
        return;
    }

    if (analysis.isRecoveryPhase && company.products > 0 && salesCapacity > 0) {
        executeDefaultSale(company, salesCapacity, 0.78);
        return;
    }

    if (gameState.currentPeriod === 2 && analysis.rowsRemaining > 5) {
        if (company.chips.education < 2 && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'education', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（2期投資）');
            return;
        }
        if (company.chips.research < 2 && company.cash >= chipCost + safetyMargin) {
            company.cash -= chipCost;
            aiPurchaseChip(company, 'research', chipCost);
            incrementRow(gameState.companies.indexOf(company));
            showAIActionModal(company, 'チップ購入', '🔬', '研究チップ購入（2期投資）');
            return;
        }
    }

    if (company.products >= 1 && salesCapacity > 0) {
        executeDefaultSale(company, Math.min(salesCapacity, company.products), 0.80);
        return;
    }

    if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
        executeDefaultProduction(company, mfgCapacity);
        return;
    }

    if (company.cash > safetyMargin + 40 && company.materials < mfgCapacity) {
        executeDefaultMaterialPurchase(company, mfgCapacity);
        return;
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

    nextTurn();
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
                    nextTurn();
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

        nextTurn();
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
// ============================================
function executeDefaultSale(company, salesCapacity, priceBase) {
    const targetSellQty = salesCapacity;
    const sellQty = Math.min(targetSellQty, company.products);
    const periodEndPayment = calculatePeriodPayment(company);
    const isCriticalCash = company.cash < periodEndPayment * 0.5;
    const minSellQty = isCriticalCash ? 1 : 2;

    if (sellQty >= minSellQty || (isCriticalCash && sellQty >= 1)) {
        const availableMarkets = gameState.markets
            .filter(m => m.currentStock < m.maxStock && !m.closed && (gameState.currentPeriod > 2 || m.name !== '海外'))
            .sort((a, b) => b.sellPrice - a.sellPrice);

        if (availableMarkets.length > 0) {
            const market = availableMarkets[0];
            const actualQty = Math.min(sellQty, market.maxStock - market.currentStock);
            const strategicPrice = calculateStrategicPrice(company, market, priceBase);

            if (actualQty > 0) {
                if (!market.needsBid) {
                    const revenue = market.sellPrice * actualQty;
                    company.cash += revenue;
                    company.products -= actualQty;
                    company.totalSales += revenue;
                    company.totalSoldQuantity = (company.totalSoldQuantity || 0) + actualQty;
                    market.currentStock += actualQty;

                    incrementRow(gameState.companies.indexOf(company));
                    showAIActionModal(company, '商品販売', '💰', `${market.name}に${actualQty}個販売`, [
                        { label: '販売価格', value: `¥${market.sellPrice}/個` },
                        { label: '売上', value: `¥${revenue}`, highlight: true }
                    ]);
                    return;
                } else {
                    startAIBidding(company, market, actualQty, strategicPrice);
                    return;
                }
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

    nextTurn();
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
        nextTurn();
        return;
    }

    const periodEndCost = calculatePeriodPayment(company);
    let safetyMargin = periodEndCost + 30;

    if (company.strategy === 'aggressive') safetyMargin = periodEndCost + 15;
    if (company.strategy === 'tech_focused') safetyMargin = periodEndCost + 20;
    if (company.strategy === 'conservative') safetyMargin = periodEndCost + 50;

    if (company.cash <= safetyMargin) {
        nextTurn();
        return;
    }

    // 2期は必ずチップ投資
    if (gameState.currentPeriod === 2 && rowsRemaining > 5) {
        const totalCurrentChips = (company.chips.research || 0) +
                                  (company.chips.education || 0) +
                                  (company.chips.advertising || 0);
        if (totalCurrentChips < 2 && company.cash >= 20 + safetyMargin) {
            if (company.chips.education === 0) {
                company.cash -= 20;
                aiPurchaseChip(company, 'education', 20);
                incrementRow(companyIndex);
                showAIActionModal(company, 'チップ購入', '📚', '教育チップ購入（2期必須投資）');
                return;
            }
            if (company.chips.research === 0) {
                company.cash -= 20;
                aiPurchaseChip(company, 'research', 20);
                incrementRow(companyIndex);
                showAIActionModal(company, 'チップ購入', '🔬', '研究チップ購入（2期必須投資）');
                return;
            }
            if (company.chips.advertising === 0) {
                company.cash -= 20;
                aiPurchaseChip(company, 'advertising', 20);
                incrementRow(companyIndex);
                showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入（2期必須投資）');
                return;
            }
        }
        if (totalCurrentChips === 2 && company.cash >= 20 + safetyMargin + 20 && rowsRemaining > 8) {
            if (company.chips.research < 2) {
                company.cash -= 20;
                aiPurchaseChip(company, 'research', 20);
                incrementRow(companyIndex);
                showAIActionModal(company, 'チップ購入', '🔬', '研究チップ追加（繰越2枚確保）');
                return;
            }
        }
    }

    // 研究チップ投資
    const maxResearchChips = gameState.currentPeriod === 2 ? 4 : AIBrain.getResearchChipTarget(company.strategy || 'balanced');
    if (company.chips.research < maxResearchChips && company.cash >= chipCost + safetyMargin) {
        company.cash -= chipCost;
        aiPurchaseChip(company, 'research', chipCost);
        incrementRow(companyIndex);
        showAIActionModal(company, 'チップ購入', '🔬', '研究開発チップ購入（価格競争力+2）');
        return;
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

    if (needMoreSales && company.chips.advertising < 3 && company.cash >= chipCost + safetyMargin) {
        company.cash -= chipCost;
        aiPurchaseChip(company, 'advertising', chipCost);
        incrementRow(companyIndex);
        showAIActionModal(company, 'チップ購入', '📢', '広告チップ購入（販売能力向上）');
        return;
    }

    nextTurn();
}