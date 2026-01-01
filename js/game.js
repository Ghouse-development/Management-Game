/**
 * MG (Management Game) - ゲームコアロジック
 *
 * gameStateはstate.jsで定義済み
 */

// ============================================
// 会社初期化
// ============================================
function initializeCompanies() {
    const strategies = ['aggressive', 'balanced', 'conservative', 'price_focused', 'tech_focused', 'unpredictable'];
    const shuffledStrategies = strategies.sort(() => Math.random() - 0.5);
    const companyNames = AI_COMPANY_NAMES;

    const companyTypes = [
        {name: 'あなた', type: 'player', strategy: 'player'},
        ...companyNames.map((name, i) => ({
            name: name,
            type: 'ai',
            strategy: shuffledStrategies[i % shuffledStrategies.length]
        }))
    ];

    gameState.companies = companyTypes.map(ct => ({
        name: ct.name,
        type: ct.type,
        strategy: ct.strategy || ct.type,
        cash: INITIAL_COMPANY_STATE.cash,
        equity: INITIAL_COMPANY_STATE.equity,
        loans: 0,
        shortLoans: 0,
        currentRow: INITIAL_COMPANY_STATE.currentRow,
        materials: INITIAL_COMPANY_STATE.materials,
        wip: INITIAL_COMPANY_STATE.wip,
        products: INITIAL_COMPANY_STATE.products,
        workers: INITIAL_COMPANY_STATE.workers,
        salesmen: INITIAL_COMPANY_STATE.salesmen,
        machines: [{type: 'small', attachments: 0}],
        warehouses: 0,
        warehouseLocation: 'materials',
        chips: {...INITIAL_COMPANY_STATE.chips},
        nextPeriodChips: {research: 0, education: 0, advertising: 0},
        carriedOverChips: {research: 0, education: 0, advertising: 0},
        // チップ購入トラッキング（F計算用）
        chipsPurchasedThisPeriod: {research: 0, education: 0, advertising: 0},  // 2期用
        expressChipsPurchased: {research: 0, education: 0, advertising: 0},     // 3期以降特急用
        periodStartInventory: {
            materials: INITIAL_COMPANY_STATE.materials,
            wip: INITIAL_COMPANY_STATE.wip,
            products: INITIAL_COMPANY_STATE.products
        },
        skipTurns: 0,
        rowsUsed: 0,
        decisionCard: null,
        totalSales: 0,
        totalMaterialCost: 0,
        totalProductionCost: 0,
        extraLaborCost: 0,
        retiredWorkers: 0,
        retiredSalesmen: 0,
        maxPersonnel: 2,
        hasExceeded300: false,
        pendingTax: 0,
        pendingDividend: 0,
        aiStrategy: ct.type
    }));
}

// ============================================
// 能力計算
// ============================================
function getManufacturingCapacity(company) {
    let baseMachineCapacity = 0;
    company.machines.forEach(machine => {
        if (machine.type === 'small') {
            baseMachineCapacity += machine.attachments > 0 ? 2 : 1;
        } else if (machine.type === 'large') {
            baseMachineCapacity += 4;
        }
    });

    if (company.workers === 0) return 0;
    if (company.workers < company.machines.length) return company.workers;

    let capacity = baseMachineCapacity + (company.chips.computer || 0);
    capacity += Math.min(company.chips.education || 0, 1);
    return capacity;
}

function getSalesCapacity(company) {
    if (company.salesmen === 0) return 0;

    const baseCapacity = company.salesmen * 2;
    const effectiveAdChips = Math.min(company.chips.advertising || 0, company.salesmen * 2);
    let capacity = baseCapacity + effectiveAdChips * 2;
    capacity += Math.min(company.chips.education || 0, 1);
    return capacity;
}

function getMaterialCapacity(company) {
    const base = INVENTORY_CAPACITY.base;
    const bonus = INVENTORY_CAPACITY.warehouseBonus;
    if (company.warehouses === 0) return base;
    if (company.warehouses === 1) {
        return company.warehouseLocation === 'materials' ? base + bonus : base;
    }
    return base + bonus;
}

function getProductCapacity(company) {
    const base = INVENTORY_CAPACITY.base;
    const bonus = INVENTORY_CAPACITY.warehouseBonus;
    if (company.warehouses === 0) return base;
    if (company.warehouses === 1) {
        return company.warehouseLocation === 'products' ? base + bonus : base;
    }
    return base + bonus;
}

function isMaterialProtectedFromFire(company) {
    if (company.warehouses === 0) return false;
    if (company.warehouses === 1) return company.warehouseLocation === 'materials';
    return true;
}

function isProductProtectedFromTheft(company) {
    if (company.warehouses === 0) return false;
    if (company.warehouses === 1) return company.warehouseLocation === 'products';
    return true;
}

function getPriceCompetitiveness(company, companyIndex = null) {
    if (companyIndex === null) {
        companyIndex = gameState.companies.indexOf(company);
    }
    const isParent = (companyIndex === gameState.currentPlayerIndex);
    const parentBonus = isParent ? 2 : 0;
    return (company.chips.research * 2) + parentBonus;
}

// ============================================
// 行動ログ
// ============================================
function logAction(companyIndex, action, details, cashChange = 0, rowUsed = false) {
    const company = gameState.companies[companyIndex];
    const logEntry = {
        companyIndex: companyIndex,
        companyName: company.name,
        action: action,
        details: details,
        cashChange: cashChange,
        rowUsed: rowUsed,
        row: company.currentRow,
        timestamp: Date.now()
    };
    gameState.actionLog.push(logEntry);

    // 会社別の行動履歴にも記録（ビジュアル表示用）
    if (!company.actionHistory) {
        company.actionHistory = [];
    }

    // 行動タイプをマッピング
    const actionTypeMap = {
        '販売': 'SELL', '材料購入': 'BUY_MATERIALS', '材料仕入れ': 'BUY_MATERIALS',
        '生産': 'PRODUCE', '投入': 'PRODUCE', '完成': 'COMPLETE',
        'チップ購入': 'BUY_CHIP', '採用': 'HIRE_WORKER', '人員採用': 'HIRE_WORKER',
        '機械購入': 'BUY_SMALL_MACHINE', 'アタッチメント': 'BUY_ATTACHMENT',
        '何もしない': 'NOTHING', '意思決定カード': 'DECISION_CARD', 'リスクカード': 'RISK_CARD'
    };

    let actionType = 'NOTHING';
    for (const [key, value] of Object.entries(actionTypeMap)) {
        if (action.includes(key)) {
            actionType = value;
            break;
        }
    }

    company.actionHistory.push({
        row: company.currentRow || 1,
        type: actionType,
        name: action,
        detail: details,
        cashChange: cashChange
    });
}

function resetActionLog() {
    gameState.actionLog = [];
}

// ============================================
// コスト計算
// ============================================
function calculateSalaryCost(company, period) {
    let unitCost = BASE_SALARY_BY_PERIOD[period];
    if (period >= 3 && gameState.wageMultiplier > 1) {
        unitCost = Math.round(BASE_SALARY_BY_PERIOD[period] * gameState.wageMultiplier);
    }
    const halfCost = Math.round(unitCost / 2);

    let cost = company.machines.length * unitCost;
    cost += (company.workers + (company.retiredWorkers || 0) * 0.5) * unitCost;
    cost += (company.salesmen + (company.retiredSalesmen || 0) * 0.5) * unitCost;
    cost += (company.maxPersonnel || (company.workers + company.salesmen)) * halfCost;

    return Math.round(cost);
}

function calculateDepreciation(company, period) {
    let cost = 0;
    const isPeriod2 = period === 2;

    company.machines.forEach(machine => {
        if (machine.type === 'small') {
            if (machine.attachments > 0) {
                cost += isPeriod2 ? DEPRECIATION.smallWithAttachment.period2 : DEPRECIATION.smallWithAttachment.period3plus;
            } else {
                cost += isPeriod2 ? DEPRECIATION.small.period2 : DEPRECIATION.small.period3plus;
            }
        } else if (machine.type === 'large') {
            cost += isPeriod2 ? DEPRECIATION.large.period2 : DEPRECIATION.large.period3plus;
        }
    });
    return cost;
}

function calculatePeriodPayment(company, useEndOfPeriod = false) {
    const period = gameState.currentPeriod;
    let payment = 0;

    if (useEndOfPeriod && company.endOfPeriodStats) {
        let unitCost = BASE_SALARY_BY_PERIOD[period] || 22;
        if (period >= 3 && gameState.wageMultiplier > 1) {
            unitCost = Math.round(unitCost * gameState.wageMultiplier);
        }
        const halfCost = Math.round(unitCost / 2);
        payment += company.endOfPeriodStats.machines * unitCost;
        payment += company.endOfPeriodStats.workers * unitCost;
        payment += company.endOfPeriodStats.salesmen * unitCost;
        payment += (company.endOfPeriodStats.workers + company.endOfPeriodStats.salesmen) * halfCost;
    } else {
        payment += calculateSalaryCost(company, period);
    }

    if (company.loans > 0) payment += Math.floor(company.loans * INTEREST_RATES.longTerm);
    if (company.shortLoans > 0) payment += Math.floor(company.shortLoans * INTEREST_RATES.shortTerm);

    return payment;
}

function calculateFixedCost(company) {
    const period = gameState.currentPeriod;
    let cost = calculateSalaryCost(company, period);

    // 金利：期首に支払った金利 + 新規借入時の金利
    // （旧: 残高×利率 → 新: 実際に支払った金利を使用）
    cost += company.periodStartInterest || 0;  // 期首に支払った既存借入の金利
    cost += company.newLoanInterest || 0;      // 期中に新規借入した際の金利

    cost += (company.chips.computer || 0) * CHIP_COSTS.computer;
    cost += (company.chips.insurance || 0) * CHIP_COSTS.insurance;

    const carriedOver = company.carriedOverChips || {research: 0, education: 0, advertising: 0};
    const purchased = company.chipsPurchasedThisPeriod || {research: 0, education: 0, advertising: 0};
    const express = company.expressChipsPurchased || {research: 0, education: 0, advertising: 0};

    if (period === 2) {
        // 2期: 購入枚数 - 繰越枚数 = 今期消費枚数
        // 繰越枚数 = min(期末所持, 3) - 1
        const chipsAtEnd = {
            research: company.chips.research || 0,
            education: company.chips.education || 0,
            advertising: company.chips.advertising || 0
        };
        // 繰越ルール: 1枚を銀行に返却し、残りを繰越（最大3枚）
        // willCarryOver = min(chips - 1, 3)
        const willCarryOver = {
            research: Math.min(Math.max(0, chipsAtEnd.research - 1), 3),
            education: Math.min(Math.max(0, chipsAtEnd.education - 1), 3),
            advertising: Math.min(Math.max(0, chipsAtEnd.advertising - 1), 3)
        };
        // F = (購入枚数 - 繰越枚数) × 20円 = 消費枚数 × 20円
        cost += Math.max(0, (purchased.research || 0) - willCarryOver.research) * CHIP_COSTS.normal;
        cost += Math.max(0, (purchased.education || 0) - willCarryOver.education) * CHIP_COSTS.normal;
        cost += Math.max(0, (purchased.advertising || 0) - willCarryOver.advertising) * CHIP_COSTS.normal;
    } else {
        // 3期以降: 繰越チップ × 20円 + 特急チップ × 40円
        // 次期予約は来期のFなので含めない
        cost += (carriedOver.research || 0) * CHIP_COSTS.normal;
        cost += (carriedOver.education || 0) * CHIP_COSTS.normal;
        cost += (carriedOver.advertising || 0) * CHIP_COSTS.normal;
        cost += (express.research || 0) * CHIP_COSTS.express;
        cost += (express.education || 0) * CHIP_COSTS.express;
        cost += (express.advertising || 0) * CHIP_COSTS.express;
    }

    cost += calculateDepreciation(company, period);
    cost += company.additionalFixedCost || 0;
    cost += company.extraLaborCost || 0;

    // 倉庫費用（1個につき20円）
    cost += (company.warehouses || 0) * WAREHOUSE_COST;

    return cost;
}

function calculateFixedCostTotal(company, period) {
    return calculateFixedCost(company);
}

function calculateVQ(company) {
    const materialCost = company.totalMaterialCost || 0;
    const productionCost = company.totalProductionCost || 0;

    const startValue =
        (company.periodStartInventory.materials * INVENTORY_VALUES.material) +
        (company.periodStartInventory.wip * INVENTORY_VALUES.wip) +
        (company.periodStartInventory.products * INVENTORY_VALUES.product);

    const endValue =
        (company.materials * INVENTORY_VALUES.material) +
        (company.wip * INVENTORY_VALUES.wip) +
        (company.products * INVENTORY_VALUES.product);

    return materialCost + productionCost + startValue - endValue;
}

// ============================================
// カードデッキ
// ============================================
function initializeCardDeck() {
    gameState.cardDeck = [];
    for (let i = 0; i < 60; i++) gameState.cardDeck.push('decision');
    for (let i = 0; i < 15; i++) gameState.cardDeck.push('risk');

    for (let i = gameState.cardDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameState.cardDeck[i], gameState.cardDeck[j]] = [gameState.cardDeck[j], gameState.cardDeck[i]];
    }
    gameState.deckInitialized = true;
}

// ============================================
// ターン・行管理
// ============================================
// incrementRowはindex.htmlに完全版あり（警告+期末処理）

// ============================================
// 市場初期化
// ============================================
function initializeMarkets() {
    gameState.markets = MARKETS.map(m => ({
        ...m,
        currentStock: m.initialStock,
        closed: false
    }));
}

// ============================================
// セーブ・ロード - index.htmlで定義（重複防止）
// ============================================
// saveGame, loadGame, hasSavedGame, deleteSavedGame, restoreGame
// はindex.htmlのscriptセクションで定義されています
