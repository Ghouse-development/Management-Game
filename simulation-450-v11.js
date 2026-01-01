/**
 * MG ¥450達成シミュレーション v11
 * 改善版: 入札ロジック修正、短期借入追加、より多くの戦略テスト
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    HIRE: 5
};

function getMfgCapacity(state) {
    if (state.workers === 0) return 0;
    return state.machinesSmall + state.machinesLarge * 4 + 1 + Math.min(state.education || 0, 1);
}

function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2 + Math.min(state.education || 0, 1);
}

// 入札価格を計算（より現実的に）
// 研究チップが多いほど高価格で売れる確率が上がる
function getBidPrice(marketMaxPrice, researchChips, isParent) {
    const competitiveness = researchChips * 2 + (isParent ? 2 : 0);

    // 競争力に基づいて価格を決定
    // 競争力0: 平均24円、競争力8: 平均36円
    const basePrice = 20 + competitiveness * 2;
    const randomAdjust = Math.floor(Math.random() * 5) - 2; // -2 to +2
    const bidPrice = Math.min(marketMaxPrice, Math.max(16, basePrice + randomAdjust));

    return bidPrice;
}

function calculateF(state, period, diceRoll) {
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const halfWage = Math.round(wageUnit / 2);

    let F = 0;
    F += (state.machinesSmall + state.machinesLarge) * wageUnit;
    F += state.workers * wageUnit;
    F += state.salesmen * wageUnit;
    F += state.maxPersonnel * halfWage;
    F += state.machinesSmall * (period === 2 ? 10 : 20);
    F += state.machinesLarge * (period === 2 ? 20 : 40);
    F += RULES.CHIP.pc + RULES.CHIP.insurance;

    // チップ費用
    if (period === 2) {
        const consumed = Math.max(0, (state.chipsPurchasedNormal || 0) - (state.chipsToCarryOver || 0));
        F += consumed * RULES.CHIP.normal;
    } else {
        F += (state.chipsCarriedOver || 0) * RULES.CHIP.normal;
        F += (state.chipsBoughtExpress || 0) * RULES.CHIP.express;
    }

    return F;
}

function simulatePeriod(state, period, strategy, diceRoll) {
    const maxRows = RULES.MAX_ROWS[period];
    let row = 1;

    const startInv = state.materials * RULES.INVENTORY.material +
                     state.wip * RULES.INVENTORY.wip +
                     state.products * RULES.INVENTORY.product;

    // 短期借入チェック（期首に現金不足なら）
    if (state.cash < 30) {
        const needed = Math.ceil((30 - state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8; // 20%利息控除
    }

    // PC + 保険
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    const periodStrategy = strategy[`period${period}`] || {};
    state.chipsPurchasedNormal = 0;
    state.chipsBoughtExpress = 0;
    state.maxPersonnel = state.workers + state.salesmen;

    // 3期以降: 繰越チップ適用
    if (period >= 3) {
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.chipsCarriedOver = state.research + state.education;
        state.nextResearch = 0;
        state.nextEducation = 0;

        const expressResearch = periodStrategy.expressResearch || 0;
        for (let i = 0; i < expressResearch && state.cash >= RULES.CHIP.express; i++) {
            state.research++;
            state.cash -= RULES.CHIP.express;
            state.chipsBoughtExpress++;
            row++;
        }
    } else {
        state.research = 0;
        state.education = 0;
        state.chipsCarriedOver = 0;
    }

    // 採用
    const hireQty = periodStrategy.salesman || 0;
    for (let i = 0; i < hireQty && state.cash >= RULES.HIRE; i++) {
        state.salesmen++;
        state.cash -= RULES.HIRE;
        row++;
    }
    state.maxPersonnel = Math.max(state.maxPersonnel, state.workers + state.salesmen);

    let totalSales = 0;
    let totalMaterialCost = 0;
    let productsSold = 0;

    // 2期: チップ購入
    if (period === 2) {
        const targetResearch = periodStrategy.research || 0;
        const targetEducation = periodStrategy.education || 0;
        while (state.research < targetResearch && state.cash >= RULES.CHIP.normal && row <= maxRows - 2) {
            state.research++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
        }
        while (state.education < targetEducation && state.cash >= RULES.CHIP.normal && row <= maxRows - 2) {
            state.education++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
        }
    }

    // 生産・販売サイクル
    while (row <= maxRows - 2) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);

        if (Math.random() < 0.10) {
            state.cash -= 10;
            row++;
            continue;
        }

        // 販売
        if (state.products > 0 && sc > 0) {
            const sellQty = Math.min(state.products, sc);
            // 市場上限は福岡32円を基準に（仙台・札幌は閉鎖の可能性あり）
            const marketMax = period === 2 ? 40 : (diceRoll >= 4 ? 32 : 36);
            const bidPrice = getBidPrice(marketMax, state.research, true);

            state.products -= sellQty;
            state.cash += sellQty * bidPrice;
            totalSales += sellQty * bidPrice;
            productsSold += sellQty;
            row++;
            continue;
        }

        // 完成
        if (state.wip > 0 && mc > 0 && state.products < 10 && state.cash >= 1) {
            const qty = Math.min(state.wip, mc, 10 - state.products);
            state.wip -= qty;
            state.products += qty;
            state.cash -= qty;
            row++;
            continue;
        }

        // 投入
        if (state.materials > 0 && mc > 0 && state.wip < 10 && state.cash >= 1) {
            const qty = Math.min(state.materials, mc, 10 - state.wip);
            state.materials -= qty;
            state.wip += qty;
            state.cash -= qty;
            row++;
            continue;
        }

        // 仕入れ（仙台¥10）
        if (state.materials < 10 && state.cash >= 10) {
            const qty = Math.min(mc, 10 - state.materials, Math.floor(state.cash / 10));
            if (qty > 0) {
                state.materials += qty;
                state.cash -= qty * 10;
                totalMaterialCost += qty * 10;
                row++;
                continue;
            }
        }

        // 翌期チップ
        const targetNextResearch = periodStrategy.nextResearch || 0;
        if (state.nextResearch < targetNextResearch && state.cash >= RULES.CHIP.normal) {
            state.nextResearch++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
            continue;
        }

        row++;
    }

    // 2期末: 翌期繰越チップ
    if (period === 2) {
        const target2NextResearch = periodStrategy.nextResearch || 0;
        while (state.nextResearch < target2NextResearch && state.cash >= RULES.CHIP.normal && row <= maxRows - 1) {
            state.nextResearch++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
        }
    }

    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

    // チップ繰越計算（2期末）
    if (period === 2) {
        const totalR = state.research + state.nextResearch;
        const totalE = state.education;
        state.chipsToCarryOver = Math.min(Math.max(0, totalR - 1), 3) + Math.min(Math.max(0, totalE - 1), 3);
    }

    const VQ = totalMaterialCost + productsSold * 2 + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;
    const F = calculateF(state, period, diceRoll);
    const G = MQ - F;

    let tax = 0;
    if (state.equity <= 300 && state.equity + G > 300) {
        tax = Math.floor((state.equity + G - 300) * 0.5);
    } else if (state.equity > 300 && G > 0) {
        tax = Math.floor(G * 0.5);
    }

    state.equity += G - tax;

    // 給料支払い
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const halfWage = Math.round(wageUnit / 2);
    const salary = (state.machinesSmall + state.machinesLarge + state.workers + state.salesmen) * wageUnit +
                   state.maxPersonnel * halfWage;
    state.cash -= salary;

    // 短期借入返済（不足分は借入）
    if (state.cash < 0) {
        const needed = Math.ceil(Math.abs(state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8;
    }

    // チップ返却
    if (period === 2) {
        const totalR = state.research + state.nextResearch;
        const totalE = state.education;
        state.nextResearch = Math.min(Math.max(0, totalR - 1), 3);
        state.nextEducation = Math.min(Math.max(0, totalE - 1), 3);
        state.research = 0;
        state.education = 0;
    } else {
        state.research = 0;
        state.education = 0;
    }

    return { PQ, VQ, MQ, F, G, tax, productsSold, equity: state.equity, cash: state.cash };
}

// 様々な戦略を網羅的にテスト
const STRATEGIES = {
    // 低投資系
    'ZERO': { period2: {}, period3: {}, period4: {}, period5: {} },
    'MIN_R1': { period2: { research: 1 }, period3: {}, period4: {}, period5: {} },
    'MIN_R2': { period2: { research: 2 }, period3: {}, period4: {}, period5: {} },
    'MIN_NEXT1': { period2: { nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} },
    'MIN_NEXT2': { period2: { nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },

    // バランス系
    'BAL_R2N2': { period2: { research: 2, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'BAL_R3N2': { period2: { research: 3, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'BAL_R2N3': { period2: { research: 2, nextResearch: 3 }, period3: { nextResearch: 3 }, period4: { nextResearch: 2 }, period5: {} },

    // セールス増強系
    'SALES_1': { period2: { research: 2 }, period3: { salesman: 1, nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'SALES_2': { period2: { research: 2 }, period3: { salesman: 2, nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'SALES_EARLY': { period2: { research: 2, nextResearch: 2 }, period3: { salesman: 1, nextResearch: 1 }, period4: { salesman: 1, nextResearch: 1 }, period5: {} },

    // 特急購入系
    'EXPRESS_3': { period2: { research: 2, nextResearch: 2 }, period3: { salesman: 1, expressResearch: 1, nextResearch: 2 }, period4: { expressResearch: 1, nextResearch: 2 }, period5: { expressResearch: 1 } },
    'EXPRESS_4': { period2: { research: 2, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { expressResearch: 1, nextResearch: 2 }, period5: { expressResearch: 1 } },

    // 教育込み
    'EDU_1': { period2: { research: 2, education: 1 }, period3: { salesman: 1, nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'EDU_2': { period2: { research: 1, education: 2, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} }
};

function runSimulation(strategyName, runs = 2000) {
    const strategy = STRATEGIES[strategyName];
    const results = [];

    for (let i = 0; i < runs; i++) {
        let state = {
            cash: 112, equity: 283,
            workers: 1, salesmen: 1,
            machinesSmall: 1, machinesLarge: 0,
            materials: 1, wip: 2, products: 1,
            research: 0, education: 0,
            nextResearch: 0, nextEducation: 0,
            maxPersonnel: 2, shortLoans: 0
        };

        for (let period = 2; period <= 5; period++) {
            const diceRoll = period >= 3 ? Math.floor(Math.random() * 6) + 1 : 0;
            simulatePeriod(state, period, strategy, diceRoll);
        }

        results.push({ finalEquity: state.equity, success: state.equity >= 450 });
    }

    return results;
}

function analyzeResults(results, strategyName) {
    const equities = results.map(r => r.finalEquity);
    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
    const max = Math.max(...equities);
    const min = Math.min(...equities);
    const successRate = (results.filter(r => r.success).length / results.length * 100).toFixed(1);
    const p90 = equities.sort((a, b) => b - a)[Math.floor(results.length * 0.1)];

    return { strategyName, avg, max, min, successRate: parseFloat(successRate), p90 };
}

console.log('MG ¥450シミュレーション v11（改善版）\n' + '='.repeat(60));
console.log('2000回シミュレーション/戦略\n');

const allResults = {};
for (const name of Object.keys(STRATEGIES)) {
    allResults[name] = analyzeResults(runSimulation(name, 2000), name);
}

console.log('ランキング（達成率順）:');
console.log('-'.repeat(70));
Object.values(allResults)
    .sort((a, b) => b.successRate - a.successRate)
    .forEach((r, i) => {
        console.log(`${String(i + 1).padStart(2)}. ${r.strategyName.padEnd(15)} 達成率${String(r.successRate).padStart(5)}% 平均¥${r.avg} 上位10%¥${r.p90} 最高¥${r.max}`);
    });

console.log('\n' + '='.repeat(60));
console.log('★トップ5戦略詳細★');
const top5 = Object.values(allResults).sort((a, b) => b.successRate - a.successRate).slice(0, 5);
top5.forEach(r => {
    console.log(`\n【${r.strategyName}】達成率: ${r.successRate}%, 平均: ¥${r.avg}`);
    for (const [period, actions] of Object.entries(STRATEGIES[r.strategyName])) {
        if (Object.keys(actions).length > 0) {
            console.log(`  ${period}: ${JSON.stringify(actions)}`);
        }
    }
});
