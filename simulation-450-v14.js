/**
 * MG ¥450達成シミュレーション v14
 * より多くの戦略パターンを網羅的にテスト
 * 教育チップの効果と最適な組み合わせを探索
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

function getAverageOpponentChips(period) {
    if (period === 2) return 1;
    return 2;
}

function getAchievablePrice(researchChips, period, diceRoll, isParent) {
    const parentBonus = isParent ? 2 : 0;
    const myCompetitiveness = researchChips * 2 + parentBonus;
    const avgOpponentChips = getAverageOpponentChips(period);
    const opponentHasParent = !isParent && Math.random() < 0.2;
    const opponentCompetitiveness = avgOpponentChips * 2 + (opponentHasParent ? 2 : 0);

    let availablePrices;
    if (period === 2) {
        availablePrices = [40, 36, 32, 28];
    } else if (diceRoll >= 4) {
        availablePrices = [32, 28, 24, 20];
    } else {
        availablePrices = [36, 32, 28, 24];
    }

    const diff = myCompetitiveness - opponentCompetitiveness;
    const rand = Math.random();
    let priceIndex;

    if (diff >= 4) {
        priceIndex = rand < 0.70 ? 0 : (rand < 0.90 ? 1 : 2);
    } else if (diff >= 2) {
        priceIndex = rand < 0.50 ? 0 : (rand < 0.80 ? 1 : 2);
    } else if (diff >= 0) {
        priceIndex = rand < 0.30 ? 0 : (rand < 0.60 ? 1 : 2);
    } else if (diff >= -2) {
        priceIndex = rand < 0.15 ? 0 : (rand < 0.40 ? 1 : 2);
    } else {
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

    while (row <= maxRows - 2) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);

        if (Math.random() < 0.10) {
            state.cash -= 10;
            row++;
            continue;
        }

        if (state.products > 0 && sc > 0) {
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

// 全パターン生成
const STRATEGIES = {};

// R0-R4の基本パターン
for (let r = 0; r <= 4; r++) {
    const name = `R${r}`;
    STRATEGIES[name] = { period2: r > 0 ? { research: r } : {}, period3: {}, period4: {}, period5: {} };
}

// 教育込み (E1, E2)
for (let r = 0; r <= 3; r++) {
    for (let e = 1; e <= 2; e++) {
        const name = `R${r}E${e}`;
        STRATEGIES[name] = {
            period2: { research: r || undefined, education: e },
            period3: {},
            period4: {},
            period5: {}
        };
        // 空オブジェクト整理
        if (!STRATEGIES[name].period2.research) delete STRATEGIES[name].period2.research;
    }
}

// 翌期チップ込み
for (let r = 0; r <= 3; r++) {
    for (let n = 1; n <= 3; n++) {
        const name = `R${r}N${n}`;
        STRATEGIES[name] = {
            period2: r > 0 ? { research: r, nextResearch: n } : { nextResearch: n },
            period3: { nextResearch: Math.min(n, 2) },
            period4: { nextResearch: Math.min(n, 2) },
            period5: {}
        };
    }
}

// 教育+翌期の最良組み合わせ
STRATEGIES['R1E1N1'] = { period2: { research: 1, education: 1, nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} };
STRATEGIES['R1E1N2'] = { period2: { research: 1, education: 1, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} };
STRATEGIES['R2E1N1'] = { period2: { research: 2, education: 1, nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} };
STRATEGIES['R2E1N2'] = { period2: { research: 2, education: 1, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} };
STRATEGIES['R2E2N1'] = { period2: { research: 2, education: 2, nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} };
STRATEGIES['R0E1N1'] = { period2: { education: 1, nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} };
STRATEGIES['R0E1N2'] = { period2: { education: 1, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} };
STRATEGIES['R0E2N1'] = { period2: { education: 2, nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} };

function runSimulation(strategyName, runs = 10000) {
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
    const sorted = [...equities].sort((a, b) => b - a);
    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
    const max = Math.max(...equities);
    const successRate = (results.filter(r => r.success).length / results.length * 100).toFixed(2);
    const p90 = sorted[Math.floor(results.length * 0.1)];

    return { strategyName, avg, max, successRate: parseFloat(successRate), p90 };
}

console.log('MG ¥450達成シミュレーション v14（網羅的テスト）');
console.log('='.repeat(70));
console.log(`戦略数: ${Object.keys(STRATEGIES).length}, 各10000回シミュレーション\n`);

const allResults = {};
for (const name of Object.keys(STRATEGIES)) {
    allResults[name] = analyzeResults(runSimulation(name, 10000), name);
}

// 達成率でソート
const sorted = Object.values(allResults).sort((a, b) => b.successRate - a.successRate);

console.log('【達成率TOP15】');
console.log('-'.repeat(70));
sorted.slice(0, 15).forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${r.strategyName.padEnd(12)} 達成率${String(r.successRate).padStart(5)}% 平均¥${r.avg} 上位10%¥${r.p90} 最高¥${r.max}`);
});

// 成功戦略の詳細
console.log('\n' + '='.repeat(70));
console.log('★¥450達成可能な戦略（達成率0.1%以上）★\n');

const successStrategies = sorted.filter(r => r.successRate >= 0.1);
if (successStrategies.length === 0) {
    console.log('該当なし - 全戦略で達成率0.1%未満');
} else {
    successStrategies.forEach(r => {
        console.log(`【${r.strategyName}】達成率${r.successRate}%, 平均¥${r.avg}, 最高¥${r.max}`);
        const s = STRATEGIES[r.strategyName];
        for (const [period, actions] of Object.entries(s)) {
            if (Object.keys(actions).length > 0) {
                console.log(`  ${period}: ${JSON.stringify(actions)}`);
            }
        }
        console.log('');
    });
}

// 統計まとめ
console.log('='.repeat(70));
console.log('【統計まとめ】');
console.log(`全戦略の平均達成率: ${(sorted.reduce((a, b) => a + b.successRate, 0) / sorted.length).toFixed(2)}%`);
console.log(`最高達成率: ${sorted[0].successRate}% (${sorted[0].strategyName})`);
console.log(`最高記録: ¥${Math.max(...sorted.map(r => r.max))} (${sorted.find(r => r.max === Math.max(...sorted.map(x => x.max))).strategyName})`);
