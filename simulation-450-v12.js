/**
 * MG ¥450達成シミュレーション v12
 * 入札価格を上方修正：研究チップの効果を最大化
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    HIRE: 5
};

// 市場価格（高い順）
const MARKET_PRICES = [40, 36, 32, 28, 24, 20];

function getMfgCapacity(state) {
    if (state.workers === 0) return 0;
    return state.machinesSmall + state.machinesLarge * 4 + 1 + Math.min(state.education || 0, 1);
}

function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2 + Math.min(state.education || 0, 1);
}

// 実際の入札結果をシミュレート
// 研究チップが多いほど高価格市場で勝つ確率が上がる
function getAchievablePrice(researchChips, period, diceRoll) {
    const competitiveness = researchChips * 2 + 2; // 親ボーナス常に込み

    // 市場閉鎖を考慮
    let availablePrices;
    if (period === 2) {
        availablePrices = [40, 36, 32, 28]; // 全市場
    } else if (diceRoll >= 4) {
        availablePrices = [32, 28, 24, 20]; // 仙台・札幌閉鎖
    } else {
        availablePrices = [36, 32, 28, 24, 20]; // 仙台のみ閉鎖
    }

    // 競争力に基づいて達成可能な価格を決定
    // 競争力8（研究3+親）で最高価格の80%勝率
    // 競争力4（研究1+親）で第2価格の60%勝率
    // 競争力2（研究0+親）で第3価格の40%勝率

    const rand = Math.random();
    let targetIndex;

    if (competitiveness >= 8) {
        targetIndex = rand < 0.80 ? 0 : (rand < 0.95 ? 1 : 2);
    } else if (competitiveness >= 6) {
        targetIndex = rand < 0.60 ? 0 : (rand < 0.85 ? 1 : 2);
    } else if (competitiveness >= 4) {
        targetIndex = rand < 0.40 ? 0 : (rand < 0.70 ? 1 : 2);
    } else if (competitiveness >= 2) {
        targetIndex = rand < 0.20 ? 0 : (rand < 0.50 ? 1 : 2);
    } else {
        targetIndex = rand < 0.10 ? 1 : 2;
    }

    return availablePrices[Math.min(targetIndex, availablePrices.length - 1)];
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

    if (state.cash < 30) {
        const needed = Math.ceil((30 - state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8;
    }

    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    const periodStrategy = strategy[`period${period}`] || {};
    state.chipsPurchasedNormal = 0;
    state.chipsBoughtExpress = 0;
    state.maxPersonnel = state.workers + state.salesmen;

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

    while (row <= maxRows - 2) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);

        if (Math.random() < 0.10) {
            state.cash -= 10;
            row++;
            continue;
        }

        if (state.products > 0 && sc > 0) {
            const sellQty = Math.min(state.products, sc);
            const bidPrice = getAchievablePrice(state.research, period, diceRoll);
            state.products -= sellQty;
            state.cash += sellQty * bidPrice;
            totalSales += sellQty * bidPrice;
            productsSold += sellQty;
            row++;
            continue;
        }

        if (state.wip > 0 && mc > 0 && state.products < 10 && state.cash >= 1) {
            const qty = Math.min(state.wip, mc, 10 - state.products);
            state.wip -= qty;
            state.products += qty;
            state.cash -= qty;
            row++;
            continue;
        }

        if (state.materials > 0 && mc > 0 && state.wip < 10 && state.cash >= 1) {
            const qty = Math.min(state.materials, mc, 10 - state.wip);
            state.materials -= qty;
            state.wip += qty;
            state.cash -= qty;
            row++;
            continue;
        }

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

    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const halfWage = Math.round(wageUnit / 2);
    const salary = (state.machinesSmall + state.machinesLarge + state.workers + state.salesmen) * wageUnit +
                   state.maxPersonnel * halfWage;
    state.cash -= salary;

    if (state.cash < 0) {
        const needed = Math.ceil(Math.abs(state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8;
    }

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

    return { PQ, VQ, MQ, F, G, tax, productsSold, equity: state.equity, cash: state.cash, diceRoll };
}

// 網羅的戦略テスト
const STRATEGIES = {
    // 基本パターン
    'R0': { period2: {}, period3: {}, period4: {}, period5: {} },
    'R1': { period2: { research: 1 }, period3: {}, period4: {}, period5: {} },
    'R2': { period2: { research: 2 }, period3: {}, period4: {}, period5: {} },
    'R3': { period2: { research: 3 }, period3: {}, period4: {}, period5: {} },

    // 翌期チップ
    'N1': { period2: { nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} },
    'N2': { period2: { nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'N3': { period2: { nextResearch: 3 }, period3: { nextResearch: 3 }, period4: { nextResearch: 2 }, period5: {} },

    // 研究+翌期
    'R2N2': { period2: { research: 2, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R3N2': { period2: { research: 3, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R3N3': { period2: { research: 3, nextResearch: 3 }, period3: { nextResearch: 3 }, period4: { nextResearch: 2 }, period5: {} },

    // 3期セールス増強
    'R2N2S1': { period2: { research: 2, nextResearch: 2 }, period3: { salesman: 1, nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R3N2S1': { period2: { research: 3, nextResearch: 2 }, period3: { salesman: 1, nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R3N3S1': { period2: { research: 3, nextResearch: 3 }, period3: { salesman: 1, nextResearch: 3 }, period4: { nextResearch: 2 }, period5: {} },

    // 特急
    'R2N2E': { period2: { research: 2, nextResearch: 2 }, period3: { expressResearch: 1, nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R3N2E': { period2: { research: 3, nextResearch: 2 }, period3: { expressResearch: 1, nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },

    // 教育込み
    'R2E1': { period2: { research: 2, education: 1 }, period3: {}, period4: {}, period5: {} },
    'R2E1N2': { period2: { research: 2, education: 1, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },

    // 攻撃的
    'R3N3S1_4S1': { period2: { research: 3, nextResearch: 3 }, period3: { salesman: 1, nextResearch: 3 }, period4: { salesman: 1, nextResearch: 2 }, period5: {} },
    'MAX': { period2: { research: 3, nextResearch: 3 }, period3: { salesman: 1, expressResearch: 1, nextResearch: 3 }, period4: { expressResearch: 1, nextResearch: 2 }, period5: { expressResearch: 1 } }
};

function runSimulation(strategyName, runs = 3000) {
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

        let periodDetails = [];
        for (let period = 2; period <= 5; period++) {
            const diceRoll = period >= 3 ? Math.floor(Math.random() * 6) + 1 : 0;
            const result = simulatePeriod(state, period, strategy, diceRoll);
            periodDetails.push(result);
        }

        results.push({ finalEquity: state.equity, success: state.equity >= 450, periods: periodDetails });
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

    return { strategyName, avg, max, min, successRate: parseFloat(successRate), p90, results };
}

console.log('MG ¥450シミュレーション v12（入札価格上方修正）\n' + '='.repeat(60));
console.log('3000回シミュレーション/戦略\n');

const allResults = {};
for (const name of Object.keys(STRATEGIES)) {
    allResults[name] = analyzeResults(runSimulation(name, 3000), name);
}

console.log('ランキング（達成率順）:');
console.log('-'.repeat(75));
Object.values(allResults)
    .sort((a, b) => b.successRate - a.successRate)
    .forEach((r, i) => {
        console.log(`${String(i + 1).padStart(2)}. ${r.strategyName.padEnd(15)} 達成率${String(r.successRate).padStart(6)}% 平均¥${String(r.avg).padStart(3)} 上位10%¥${String(r.p90).padStart(3)} 最高¥${r.max}`);
    });

// 成功例を表示
console.log('\n' + '='.repeat(60));
console.log('★成功戦略の詳細★');
const successStrategies = Object.values(allResults).filter(r => r.successRate > 0).sort((a, b) => b.successRate - a.successRate).slice(0, 5);

if (successStrategies.length === 0) {
    console.log('\n達成率0%：¥450到達なし');
    console.log('最も高い戦略:');
    const best = Object.values(allResults).sort((a, b) => b.max - a.max)[0];
    console.log(`  ${best.strategyName}: 最高¥${best.max}, 平均¥${best.avg}`);
    const example = best.results.find(r => r.finalEquity === best.max);
    if (example) {
        console.log('  最高記録の詳細:');
        example.periods.forEach((p, i) => {
            console.log(`    ${i+2}期: 売${p.productsSold}個 PQ¥${p.PQ} MQ¥${p.MQ} F¥${p.F} G¥${p.G} → ¥${p.equity}`);
        });
    }
} else {
    successStrategies.forEach(r => {
        console.log(`\n【${r.strategyName}】達成率: ${r.successRate}%, 平均: ¥${r.avg}, 最高: ¥${r.max}`);
        for (const [period, actions] of Object.entries(STRATEGIES[r.strategyName])) {
            if (Object.keys(actions).length > 0) {
                console.log(`  ${period}: ${JSON.stringify(actions)}`);
            }
        }
        const successExample = r.results.find(x => x.success);
        if (successExample) {
            console.log('  成功例:');
            successExample.periods.forEach((p, i) => {
                console.log(`    ${i+2}期: 売${p.productsSold}個 PQ¥${p.PQ} MQ¥${p.MQ} F¥${p.F} G¥${p.G} → ¥${p.equity}`);
            });
        }
    });
}
