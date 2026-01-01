/**
 * MG ¥450達成シミュレーション v13
 * より現実的なモデル：親ボーナスは16%（6人中1人）
 * 他プレイヤーとの競争をシミュレート
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    HIRE: 5,
    PLAYERS: 6
};

function getMfgCapacity(state) {
    if (state.workers === 0) return 0;
    return state.machinesSmall + state.machinesLarge * 4 + 1 + Math.min(state.education || 0, 1);
}

function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2 + Math.min(state.education || 0, 1);
}

// 他プレイヤーの平均チップ数を推定
function getAverageOpponentChips(period) {
    // 2期: 0-2枚、3期以降: 1-3枚
    if (period === 2) return 1;
    return 2;
}

// 入札結果をシミュレート（より現実的）
function getAchievablePrice(researchChips, period, diceRoll, isParent) {
    const parentBonus = isParent ? 2 : 0;
    const myCompetitiveness = researchChips * 2 + parentBonus;

    // 他プレイヤーの競争力（平均チップ数×2、親ボーナスは別の人に16%で付く）
    const avgOpponentChips = getAverageOpponentChips(period);
    const opponentHasParent = !isParent && Math.random() < 0.2; // 親が他にいる確率
    const opponentCompetitiveness = avgOpponentChips * 2 + (opponentHasParent ? 2 : 0);

    // 市場閉鎖を考慮
    let availablePrices;
    if (period === 2) {
        availablePrices = [40, 36, 32, 28];
    } else if (diceRoll >= 4) {
        availablePrices = [32, 28, 24, 20];
    } else {
        availablePrices = [36, 32, 28, 24];
    }

    // 競争力の差で価格を決定
    const diff = myCompetitiveness - opponentCompetitiveness;
    const rand = Math.random();
    let priceIndex;

    if (diff >= 4) {
        // 圧倒的優位
        priceIndex = rand < 0.70 ? 0 : (rand < 0.90 ? 1 : 2);
    } else if (diff >= 2) {
        // 優位
        priceIndex = rand < 0.50 ? 0 : (rand < 0.80 ? 1 : 2);
    } else if (diff >= 0) {
        // 同等またはやや有利
        priceIndex = rand < 0.30 ? 0 : (rand < 0.60 ? 1 : 2);
    } else if (diff >= -2) {
        // やや不利
        priceIndex = rand < 0.15 ? 0 : (rand < 0.40 ? 1 : 2);
    } else {
        // 不利
        priceIndex = rand < 0.05 ? 0 : (rand < 0.25 ? 1 : (rand < 0.60 ? 2 : 3));
    }

    return availablePrices[Math.min(priceIndex, availablePrices.length - 1)];
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

    // 販売回数カウント（親になる確率計算用）
    let salesCount = 0;

    while (row <= maxRows - 2) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);

        if (Math.random() < 0.10) {
            state.cash -= 10;
            row++;
            continue;
        }

        if (state.products > 0 && sc > 0) {
            salesCount++;
            // 6回に1回くらい親になる
            const isParent = Math.random() < (1 / RULES.PLAYERS);
            const sellQty = Math.min(state.products, sc);
            const bidPrice = getAchievablePrice(state.research, period, diceRoll, isParent);
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

    return { PQ, VQ, MQ, F, G, tax, productsSold, equity: state.equity };
}

// 網羅的戦略テスト
const STRATEGIES = {
    'R0': { period2: {}, period3: {}, period4: {}, period5: {} },
    'R1': { period2: { research: 1 }, period3: {}, period4: {}, period5: {} },
    'R2': { period2: { research: 2 }, period3: {}, period4: {}, period5: {} },
    'R3': { period2: { research: 3 }, period3: {}, period4: {}, period5: {} },
    'R4': { period2: { research: 4 }, period3: {}, period4: {}, period5: {} },
    'N1': { period2: { nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} },
    'N2': { period2: { nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'N3': { period2: { nextResearch: 3 }, period3: { nextResearch: 3 }, period4: { nextResearch: 2 }, period5: {} },
    'R2N2': { period2: { research: 2, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R3N2': { period2: { research: 3, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R3N3': { period2: { research: 3, nextResearch: 3 }, period3: { nextResearch: 3 }, period4: { nextResearch: 2 }, period5: {} },
    'R2E1': { period2: { research: 2, education: 1 }, period3: {}, period4: {}, period5: {} },
    'R3E1': { period2: { research: 3, education: 1 }, period3: {}, period4: {}, period5: {} },
    'R2E1N2': { period2: { research: 2, education: 1, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R3E1N2': { period2: { research: 3, education: 1, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R2N2S1': { period2: { research: 2, nextResearch: 2 }, period3: { salesman: 1, nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R3N2S1': { period2: { research: 3, nextResearch: 2 }, period3: { salesman: 1, nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} }
};

function runSimulation(strategyName, runs = 5000) {
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
    const sorted = [...equities].sort((a, b) => b - a);
    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
    const max = Math.max(...equities);
    const min = Math.min(...equities);
    const successRate = (results.filter(r => r.success).length / results.length * 100).toFixed(1);
    const p90 = sorted[Math.floor(results.length * 0.1)];
    const median = sorted[Math.floor(results.length * 0.5)];

    return { strategyName, avg, median, max, min, successRate: parseFloat(successRate), p90, results };
}

console.log('MG ¥450シミュレーション v13（現実的な親ボーナス：16%）\n' + '='.repeat(65));
console.log('5000回シミュレーション/戦略、6人プレイ想定\n');

const allResults = {};
for (const name of Object.keys(STRATEGIES)) {
    allResults[name] = analyzeResults(runSimulation(name, 5000), name);
}

console.log('ランキング（達成率順）:');
console.log('-'.repeat(85));
Object.values(allResults)
    .sort((a, b) => b.successRate - a.successRate)
    .forEach((r, i) => {
        console.log(`${String(i + 1).padStart(2)}. ${r.strategyName.padEnd(12)} 達成率${String(r.successRate).padStart(5)}% 平均¥${String(r.avg).padStart(3)} 中央値¥${String(r.median).padStart(3)} 上位10%¥${String(r.p90).padStart(3)} 最高¥${r.max}`);
    });

// 成功例を表示
console.log('\n' + '='.repeat(65));
const successStrategies = Object.values(allResults).filter(r => r.successRate > 0).sort((a, b) => b.successRate - a.successRate).slice(0, 5);

if (successStrategies.length === 0) {
    console.log('★¥450達成なし - 最高記録戦略★');
    const best = Object.values(allResults).sort((a, b) => b.max - a.max).slice(0, 3);
    best.forEach(r => {
        console.log(`\n【${r.strategyName}】最高¥${r.max}, 平均¥${r.avg}, 上位10%¥${r.p90}`);
        for (const [period, actions] of Object.entries(STRATEGIES[r.strategyName])) {
            if (Object.keys(actions).length > 0) {
                console.log(`  ${period}: ${JSON.stringify(actions)}`);
            }
        }
    });
} else {
    console.log('★成功戦略詳細★');
    successStrategies.forEach(r => {
        console.log(`\n【${r.strategyName}】達成率: ${r.successRate}%, 平均¥${r.avg}, 最高¥${r.max}`);
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
