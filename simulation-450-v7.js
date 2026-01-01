/**
 * MG ¥450達成シミュレーション v7
 * MINIMAL戦略の最適化
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    MACHINE: { small: { cost: 100, capacity: 1, sell56: 56 }, large: { cost: 200, capacity: 4 } },
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

function getAvailableMarkets(period, diceRoll) {
    const markets = [];
    if (period === 2) {
        markets.push({ name: 'sendai', price: 40, capacity: 3 });
        markets.push({ name: 'sapporo', price: 36, capacity: 4 });
        markets.push({ name: 'fukuoka', price: 32, capacity: 6 });
        markets.push({ name: 'nagoya', price: 28, capacity: 9 });
    } else {
        if (diceRoll >= 4) {
            markets.push({ name: 'fukuoka', price: 32, capacity: 6 });
        } else {
            markets.push({ name: 'sapporo', price: 36, capacity: 4 });
            markets.push({ name: 'fukuoka', price: 32, capacity: 6 });
        }
        markets.push({ name: 'nagoya', price: 28, capacity: 9 });
    }
    return markets;
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
    F += (state.chipsBoughtNormal || 0) * RULES.CHIP.normal;
    F += (state.chipsBoughtExpress || 0) * RULES.CHIP.express;
    F += Math.floor((state.loan || 0) * 0.1);

    return F;
}

function simulatePeriod(state, period, strategy, diceRoll) {
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
    state.maxPersonnel = state.workers + state.salesmen;

    if (periodStrategy.loan && periodStrategy.loan > 0) {
        state.loan = (state.loan || 0) + periodStrategy.loan;
        state.cash += periodStrategy.loan;
        row++;
    }

    if (period >= 3) {
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.nextResearch = 0;
        state.nextEducation = 0;

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

    let targetResearch = period === 2 ? (periodStrategy.research || 0) : 0;
    let targetEducation = period === 2 ? (periodStrategy.education || 0) : 0;
    let targetNextResearch = periodStrategy.nextResearch || 0;

    const hireQty = periodStrategy.salesman || 0;
    for (let i = 0; i < hireQty && state.cash >= RULES.HIRE; i++) {
        state.salesmen++;
        state.cash -= RULES.HIRE;
        row++;
    }
    state.maxPersonnel = Math.max(state.maxPersonnel, state.workers + state.salesmen);

    if (periodStrategy.sellSmallMachine && state.machinesSmall > 0) {
        state.machinesSmall--;
        state.cash += 56;
        row++;
    }

    if (periodStrategy.largeMachine && state.cash >= RULES.MACHINE.large.cost) {
        state.machinesLarge++;
        state.cash -= RULES.MACHINE.large.cost;
        row++;
    }

    let totalSales = 0;
    let totalMaterialCost = 0;
    let productsSold = 0;

    const markets = getAvailableMarkets(period, diceRoll);
    const marketSold = {};
    markets.forEach(m => marketSold[m.name] = 0);

    if (period === 2) {
        while (state.research < targetResearch && state.cash >= RULES.CHIP.normal && row <= maxRows - 2) {
            state.research++;
            state.cash -= RULES.CHIP.normal;
            state.chipsBoughtNormal++;
            row++;
        }
        while (state.education < targetEducation && state.cash >= RULES.CHIP.normal && row <= maxRows - 2) {
            state.education++;
            state.cash -= RULES.CHIP.normal;
            state.chipsBoughtNormal++;
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
            let sold = false;
            for (const market of markets) {
                const remaining = market.capacity - (marketSold[market.name] || 0);
                if (remaining > 0) {
                    const sellQty = Math.min(state.products, sc, remaining);
                    state.products -= sellQty;
                    state.cash += sellQty * market.price;
                    totalSales += sellQty * market.price;
                    productsSold += sellQty;
                    marketSold[market.name] += sellQty;
                    sold = true;
                    break;
                }
            }
            if (sold) { row++; continue; }
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

        if (period >= 3 && state.nextResearch < targetNextResearch && state.cash >= RULES.CHIP.normal) {
            state.nextResearch++;
            state.cash -= RULES.CHIP.normal;
            state.chipsBoughtNormal++;
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

    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const halfWage = Math.round(wageUnit / 2);
    const salary = (state.machinesSmall + state.machinesLarge + state.workers + state.salesmen) * wageUnit +
                   state.maxPersonnel * halfWage;
    state.cash -= salary;

    return { PQ, VQ, MQ, F, G, tax, productsSold, equity: state.equity, cash: state.cash,
             research: state.research, nextResearch: state.nextResearch, diceRoll };
}

// 戦略バリエーション
const STRATEGIES = {
    // 完全最小（チップなし）
    'ZERO_CHIP': {
        period2: {},
        period3: {},
        period4: {},
        period5: {}
    },
    // 翌期チップのみ（MINIMAL）
    'MINIMAL': {
        period2: { nextResearch: 1 },
        period3: { nextResearch: 1 },
        period4: { nextResearch: 1 },
        period5: {}
    },
    // 研究1枚+翌期1枚
    'LIGHT_RESEARCH': {
        period2: { research: 1, nextResearch: 1 },
        period3: { nextResearch: 1 },
        period4: { nextResearch: 1 },
        period5: {}
    },
    // セールスマン1人追加
    'ADD_SALESMAN': {
        period2: { nextResearch: 1 },
        period3: { salesman: 1, nextResearch: 1 },
        period4: { nextResearch: 1 },
        period5: {}
    },
    // 3期でセールスマン2人
    'SALES_HEAVY': {
        period2: { nextResearch: 1 },
        period3: { salesman: 2, nextResearch: 1 },
        period4: { nextResearch: 1 },
        period5: {}
    },
    // 大型機械投資
    'LARGE_MACHINE': {
        period2: { nextResearch: 1 },
        period3: { sellSmallMachine: 1, largeMachine: 1, nextResearch: 1 },
        period4: { salesman: 1, nextResearch: 1 },
        period5: {}
    }
};

function runSimulation(strategyName, runs = 1000) {
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
            loan: 0, maxPersonnel: 2
        };

        let periodResults = [];
        for (let period = 2; period <= 5; period++) {
            const diceRoll = period >= 3 ? Math.floor(Math.random() * 6) + 1 : 0;
            const result = simulatePeriod(state, period, strategy, diceRoll);
            periodResults.push({ period, ...result });
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
    const successRate = (results.filter(r => r.success).length / results.length * 100).toFixed(1);

    console.log(`\n=== ${strategyName} ===`);
    console.log(`平均: ¥${avg}, 最高: ¥${max}, 最低: ¥${min}, 達成率: ${successRate}%`);

    // 成功ケースの詳細
    const successCases = results.filter(r => r.success);
    if (successCases.length > 0) {
        const example = successCases[0];
        console.log('成功例:');
        example.periods.forEach(p => {
            console.log(`  ${p.period}期: サイコロ${p.diceRoll || '-'} 売${p.productsSold}個 PQ¥${p.PQ} MQ¥${p.MQ} F¥${p.F} G¥${p.G} → ¥${p.equity}`);
        });
    }

    return { strategyName, avg, max, min, successRate: parseFloat(successRate) };
}

console.log('MG ¥450シミュレーション v7（最適化）\n' + '='.repeat(60));
console.log('1000回シミュレーション実行中...\n');

const allResults = {};
for (const name of Object.keys(STRATEGIES)) {
    allResults[name] = analyzeResults(runSimulation(name, 1000), name);
}

console.log('\n' + '='.repeat(60));
console.log('最終ランキング:');
Object.values(allResults).sort((a, b) => b.successRate - a.successRate).forEach((r, i) => {
    console.log(`${i + 1}. ${r.strategyName}: 達成率${r.successRate}%, 平均¥${r.avg}`);
});

// 成功パターンをファイルに保存
const successPatterns = Object.entries(allResults)
    .filter(([_, r]) => r.successRate > 0)
    .map(([name, r]) => ({
        strategy: name,
        details: STRATEGIES[name],
        successRate: r.successRate,
        avgEquity: r.avg,
        maxEquity: r.max
    }));

console.log('\n' + '='.repeat(60));
console.log('★成功戦略まとめ★');
successPatterns.sort((a, b) => b.successRate - a.successRate).forEach(p => {
    console.log(`\n【${p.strategy}】達成率: ${p.successRate}%, 平均: ¥${p.avgEquity}`);
    for (const [period, actions] of Object.entries(p.details)) {
        if (Object.keys(actions).length > 0) {
            console.log(`  ${period}: ${JSON.stringify(actions)}`);
        }
    }
});
