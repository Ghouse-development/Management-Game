/**
 * MG ¥450達成シミュレーション v9
 * 正確なルール: 記帳価格=市場価格、入札は勝敗判定のみ
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    MACHINE: { small: { cost: 100, capacity: 1 }, large: { cost: 200, capacity: 4 } },
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

// 入札勝率を計算（研究チップで競争力UP）
function canWinBid(researchChips, isParent) {
    // 競争力 = 研究チップ×2 + 親ボーナス2
    const competitiveness = researchChips * 2 + (isParent ? 2 : 0);
    // 競争力が高いほど勝ちやすい
    // 他社の平均競争力を2-4と仮定
    const opponentCompetitiveness = 2 + Math.random() * 4;
    return competitiveness >= opponentCompetitiveness || Math.random() < 0.3; // 30%の運
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

    // 3期以降: 繰越チップ適用
    if (period >= 3) {
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.nextResearch = 0;
        state.nextEducation = 0;
        state.chipsBoughtNormal += state.research + state.education;

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

    // 2期: チップ購入
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

        // 販売（入札で勝てば市場価格で売上計上）
        if (state.products > 0 && sc > 0) {
            let sold = false;
            for (const market of markets) {
                const remaining = market.capacity - (marketSold[market.name] || 0);
                if (remaining > 0) {
                    // 入札で勝てるか判定
                    if (canWinBid(state.research, true)) {
                        const sellQty = Math.min(state.products, sc, remaining);
                        state.products -= sellQty;
                        // 記帳価格 = 市場価格（市場上限）
                        state.cash += sellQty * market.price;
                        totalSales += sellQty * market.price;
                        productsSold += sellQty;
                        marketSold[market.name] += sellQty;
                        sold = true;
                        break;
                    } else {
                        // 負けたら次の市場へ
                        continue;
                    }
                }
            }
            if (sold) { row++; continue; }
            // 全市場で負けたら名古屋で確実に売る
            if (state.products > 0) {
                const sellQty = Math.min(state.products, sc);
                state.products -= sellQty;
                state.cash += sellQty * 28;
                totalSales += sellQty * 28;
                productsSold += sellQty;
                row++;
                continue;
            }
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
            row++;
        }
    }

    // 期末: チップ返却
    if (period === 2) {
        if (state.research > 0) state.research = Math.max(0, state.research - 1);
        if (state.education > 0) state.education = Math.max(0, state.education - 1);
    } else {
        state.research = 0;
        state.education = 0;
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

const STRATEGIES = {
    // 研究重視（入札勝率UP）
    'RESEARCH_HEAVY': {
        period2: { research: 4, nextResearch: 3 },
        period3: { salesman: 1, nextResearch: 3 },
        period4: { nextResearch: 3 },
        period5: {}
    },
    // バランス
    'BALANCED': {
        period2: { research: 3, nextResearch: 2 },
        period3: { salesman: 1, nextResearch: 2 },
        period4: { nextResearch: 2 },
        period5: {}
    },
    // 最小投資
    'MINIMAL': {
        period2: { research: 2, nextResearch: 1 },
        period3: { nextResearch: 1 },
        period4: { nextResearch: 1 },
        period5: {}
    },
    // 教育込み
    'WITH_EDUCATION': {
        period2: { research: 3, education: 1, nextResearch: 2 },
        period3: { salesman: 1, nextResearch: 2 },
        period4: { nextResearch: 2 },
        period5: {}
    },
    // 大型機械
    'MACHINE': {
        period2: { research: 3, nextResearch: 2 },
        period3: { sellSmallMachine: 1, largeMachine: 1, salesman: 1, nextResearch: 2 },
        period4: { salesman: 1, nextResearch: 2 },
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
            maxPersonnel: 2
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

    const successCases = results.filter(r => r.success);
    if (successCases.length > 0) {
        const example = successCases[0];
        console.log('成功例:');
        example.periods.forEach(p => {
            console.log(`  ${p.period}期: 売${p.productsSold}個 PQ¥${p.PQ} MQ¥${p.MQ} F¥${p.F} G¥${p.G} → ¥${p.equity}`);
        });
    } else {
        const example = results[0];
        console.log('例:');
        example.periods.forEach(p => {
            console.log(`  ${p.period}期: 売${p.productsSold}個 PQ¥${p.PQ} MQ¥${p.MQ} F¥${p.F} G¥${p.G} → ¥${p.equity}`);
        });
    }

    return { strategyName, avg, max, min, successRate: parseFloat(successRate) };
}

console.log('MG ¥450シミュレーション v9（記帳価格=市場価格）\n' + '='.repeat(60));

const allResults = {};
for (const name of Object.keys(STRATEGIES)) {
    allResults[name] = analyzeResults(runSimulation(name, 1000), name);
}

console.log('\n' + '='.repeat(60));
console.log('ランキング:');
Object.values(allResults).sort((a, b) => b.successRate - a.successRate).forEach((r, i) => {
    console.log(`${i + 1}. ${r.strategyName}: 達成率${r.successRate}%, 平均¥${r.avg}`);
});
