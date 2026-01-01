/**
 * MG ¥450達成シミュレーション v4
 * デバッグ強化・F計算修正
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    MACHINE: { small: { cost: 100, capacity: 1, sell: 56 }, large: { cost: 200, capacity: 4 } },
    HIRE: 5,
    MATERIAL_COST: 12
};

function getMfgCapacity(state) {
    if (state.workers === 0) return 0;
    return state.machinesSmall + state.machinesLarge * 4 + 1 + Math.min(state.education || 0, 1);
}

function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2 + Math.min(state.education || 0, 1);
}

function calculateF(state, period, diceRoll) {
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const halfWage = Math.round(wageUnit / 2);

    // 人件費
    let wages = (state.machinesSmall + state.machinesLarge) * wageUnit;
    wages += state.workers * wageUnit;
    wages += state.salesmen * wageUnit;
    wages += (state.workers + state.salesmen) * halfWage;

    // 減価償却
    const depreciation = state.machinesSmall * (period === 2 ? 10 : 20) +
                         state.machinesLarge * (period === 2 ? 20 : 40);

    // チップ費（PC+保険は必須、消費チップは別途）
    const chipCost = RULES.CHIP.pc + RULES.CHIP.insurance +
                     (state.chipsBoughtNormal || 0) * RULES.CHIP.normal +
                     (state.chipsBoughtExpress || 0) * RULES.CHIP.express;

    return wages + depreciation + chipCost;
}

function simulatePeriod(state, period, strategy, diceRoll, debug = false) {
    const maxRows = RULES.MAX_ROWS[period];
    let row = 1;

    const startInv = state.materials * RULES.INVENTORY.material +
                     state.wip * RULES.INVENTORY.wip +
                     state.products * RULES.INVENTORY.product;

    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    const periodStrategy = strategy[`period${period}`] || {};

    state.chipsBoughtNormal = 0;
    state.chipsBoughtExpress = 0;

    // 3期以降: 繰越チップ適用（F計算からは除外、前期で既にF計上済み）
    if (period >= 3) {
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.nextResearch = 0;
        state.nextEducation = 0;

        // 特急チップ（今期Fに計上）
        const expressQty = periodStrategy.expressResearch || 0;
        for (let i = 0; i < expressQty && state.cash >= RULES.CHIP.express; i++) {
            state.research++;
            state.cash -= RULES.CHIP.express;
            state.chipsBoughtExpress++;
            row++;
        }
    } else {
        state.research = 0;
        state.education = 0;
    }

    // 2期のチップ目標
    let targetResearch = period === 2 ? (periodStrategy.research || 0) : 0;
    let targetEducation = period === 2 ? (periodStrategy.education || 0) : 0;
    let targetNextResearch = periodStrategy.nextResearch || 0;
    let targetNextEducation = periodStrategy.nextEducation || 0;

    // 採用
    const hireQty = periodStrategy.salesman || 0;
    for (let i = 0; i < hireQty && state.cash >= RULES.HIRE; i++) {
        state.salesmen++;
        state.cash -= RULES.HIRE;
        row++;
    }

    // 機械売却
    if (periodStrategy.sellSmallMachine && state.machinesSmall > 0) {
        state.machinesSmall--;
        state.cash += RULES.MACHINE.small.sell;
        row++;
    }

    // 大型機械購入
    if (periodStrategy.largeMachine && state.cash >= RULES.MACHINE.large.cost) {
        state.machinesLarge++;
        state.cash -= RULES.MACHINE.large.cost;
        row++;
    }

    let totalSales = 0;
    let totalMaterialCost = 0;
    let productsSold = 0;

    while (row <= maxRows - 2) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);

        if (Math.random() < 0.10) {
            state.cash -= 10;
            row++;
            continue;
        }

        // 2期: 研究チップ購入（優先）
        if (period === 2 && state.research < targetResearch && state.cash >= RULES.CHIP.normal) {
            state.research++;
            state.cash -= RULES.CHIP.normal;
            state.chipsBoughtNormal++;
            row++;
            continue;
        }

        // 2期: 教育チップ購入
        if (period === 2 && state.education < targetEducation && state.cash >= RULES.CHIP.normal) {
            state.education++;
            state.cash -= RULES.CHIP.normal;
            state.chipsBoughtNormal++;
            row++;
            continue;
        }

        // 販売
        if (state.products > 0 && sc > 0) {
            const sellQty = Math.min(state.products, sc);
            let price = state.research >= 4 ? 30 : (state.research >= 2 ? 28 : 25);
            if (period >= 3 && diceRoll >= 4) price = Math.min(price, 32);

            state.products -= sellQty;
            state.cash += sellQty * price;
            totalSales += sellQty * price;
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

        // 仕入れ
        if (state.materials < 10 && state.cash >= RULES.MATERIAL_COST) {
            const qty = Math.min(mc, 10 - state.materials, Math.floor(state.cash / RULES.MATERIAL_COST));
            if (qty > 0) {
                state.materials += qty;
                state.cash -= qty * RULES.MATERIAL_COST;
                totalMaterialCost += qty * RULES.MATERIAL_COST;
                row++;
                continue;
            }
        }

        // 3期以降: 翌期繰越チップ
        if (period >= 3 && state.nextResearch < targetNextResearch && state.cash >= RULES.CHIP.normal) {
            state.nextResearch++;
            state.cash -= RULES.CHIP.normal;
            state.chipsBoughtNormal++;
            row++;
            continue;
        }

        if (period >= 3 && state.nextEducation < targetNextEducation && state.cash >= RULES.CHIP.normal) {
            state.nextEducation++;
            state.cash -= RULES.CHIP.normal;
            state.chipsBoughtNormal++;
            row++;
            continue;
        }

        row++;
    }

    // 2期で翌期チップを買う（期末近く）
    if (period === 2) {
        const target2NextResearch = periodStrategy.nextResearch || 0;
        while (state.nextResearch < target2NextResearch && state.cash >= RULES.CHIP.normal && row <= maxRows - 1) {
            state.nextResearch++;
            state.cash -= RULES.CHIP.normal;
            state.chipsBoughtNormal++;
            row++;
        }
    }

    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

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
                   (state.workers + state.salesmen) * halfWage;
    state.cash -= salary;

    return { PQ, VQ, MQ, F, G, tax, productsSold, equity: state.equity, cash: state.cash,
             research: state.research, nextResearch: state.nextResearch };
}

// より積極的な戦略
const STRATEGIES = {
    // 2期でチップを買いすぎない、生産重視
    'PRODUCTION_FOCUS': {
        period2: { research: 2, education: 0, nextResearch: 2 },
        period3: { salesman: 1, nextResearch: 2 },
        period4: { nextResearch: 2 },
        period5: {}
    },
    // 研究で高価格狙い
    'HIGH_PRICE': {
        period2: { research: 3, education: 1, nextResearch: 2 },
        period3: { salesman: 1, nextResearch: 3 },
        period4: { nextResearch: 2 },
        period5: {}
    },
    // 最小投資で堅実
    'MINIMAL_SAFE': {
        period2: { research: 2, education: 0, nextResearch: 1 },
        period3: { nextResearch: 1 },
        period4: { nextResearch: 1 },
        period5: {}
    },
    // 大型機械投資
    'MACHINE_INVEST': {
        period2: { research: 2, education: 0, nextResearch: 1 },
        period3: { sellSmallMachine: 1, largeMachine: 1, nextResearch: 2 },
        period4: { salesman: 1, nextResearch: 2 },
        period5: {}
    }
};

function runSimulation(strategyName, runs = 200) {
    const strategy = STRATEGIES[strategyName];
    const results = [];

    for (let i = 0; i < runs; i++) {
        let state = {
            cash: 112, equity: 283,
            workers: 1, salesmen: 1,
            machinesSmall: 1, machinesLarge: 0,
            materials: 1, wip: 2, products: 1,
            research: 0, education: 0,
            nextResearch: 0, nextEducation: 0
        };

        let periodResults = [];
        for (let period = 2; period <= 5; period++) {
            const diceRoll = period >= 3 ? Math.floor(Math.random() * 6) + 1 : 0;
            const result = simulatePeriod(state, period, strategy, diceRoll);
            periodResults.push({ period, ...result, diceRoll });
        }

        results.push({ finalEquity: state.equity, success: state.equity >= 450, periods: periodResults });
    }

    return results;
}

function analyzeResults(results, strategyName) {
    const equities = results.map(r => r.finalEquity);
    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
    const max = Math.max(...equities);
    const min = Math.min(...equities);
    const successRate = Math.round(results.filter(r => r.success).length / results.length * 100);

    console.log(`\n=== ${strategyName} ===`);
    console.log(`平均: ¥${avg}, 最高: ¥${max}, 最低: ¥${min}, 達成率: ${successRate}%`);

    const example = results[0];
    console.log('期別詳細:');
    example.periods.forEach(p => {
        console.log(`  ${p.period}期: 売${p.productsSold}個 研${p.research}枚→翌${p.nextResearch}枚 PQ¥${p.PQ} VQ¥${p.VQ} MQ¥${p.MQ} F¥${p.F} G¥${p.G} 現金¥${p.cash}`);
    });

    return { strategyName, avg, max, min, successRate };
}

console.log('MG ¥450シミュレーション v4\n' + '='.repeat(60));

const allResults = {};
for (const name of Object.keys(STRATEGIES)) {
    allResults[name] = analyzeResults(runSimulation(name, 200), name);
}

console.log('\n' + '='.repeat(60));
console.log('ランキング:');
Object.values(allResults).sort((a, b) => b.avg - a.avg).forEach((r, i) => {
    console.log(`${i + 1}. ${r.strategyName}: 達成率${r.successRate}%, 平均¥${r.avg}`);
});

// 成功ケースを探す
console.log('\n' + '='.repeat(60));
console.log('成功ケース分析:');
for (const [name, result] of Object.entries(allResults)) {
    if (result.max >= 400) {
        console.log(`${name}: 最高¥${result.max}達成`);
    }
}
