/**
 * MG シミュレーション v27
 *
 * ユーザーフィードバック反映:
 * - 2期: チップ購入と製造販売を交互に実行
 * - 教育チップ + 研究4枚
 * - 販売で得た現金でチップを追加購入
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    HIRE: 5,
    MATERIAL_PRICE: 13
};

function getPrice(researchChips, period) {
    const prices = [23, 25, 27, 29, 31, 32];
    const base = prices[Math.min(researchChips, 5)];
    const periodBonus = (period === 2) ? 2 : 0;
    const variance = Math.floor(Math.random() * 2);
    return base + periodBonus + variance;
}

function getMfgCapacity(state) {
    if (state.workers === 0) return 0;
    return state.machinesSmall + state.machinesLarge * 4 + (state.pc || 0) + Math.min(state.education || 0, 1);
}

function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2 + Math.min(state.education || 0, 1);
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
    F += (state.chipsCarriedOver || 0) * RULES.CHIP.normal;
    F += (state.chipsBoughtExpress || 0) * RULES.CHIP.express;
    F += (state.chipsBoughtNormal || 0) * RULES.CHIP.normal;
    F += Math.round((state.loans || 0) * 0.10);
    return F;
}

function simulatePeriod2Interleaved(state, strategy, debug = false) {
    const maxRows = 20;
    let row = 1;
    const periodStrategy = strategy.period2 || {};

    const startInv = state.materials * RULES.INVENTORY.material +
                     state.wip * RULES.INVENTORY.wip +
                     state.products * RULES.INVENTORY.product;

    if (debug) console.log(`\n=== 第2期 ===`);
    if (debug) console.log(`期首: 現金¥${state.cash}, 自己資本¥${state.equity}`);

    state.chipsBoughtNormal = 0;
    state.chipsCarriedOver = 0;
    state.chipsBoughtExpress = 0;
    state.research = 0;
    state.education = 0;

    // PC・保険
    state.pc = 1;
    state.insurance = 1;
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    state.maxPersonnel = state.workers + state.salesmen;

    let totalSales = 0;
    let totalMaterialCost = 0;
    let productsSold = 0;

    const targetR = periodStrategy.research || 4;
    const targetE = periodStrategy.education || 0;

    // ユーザーのパターン: チップと製造販売を交互に
    // 1. 教育チップ購入
    while (state.education < targetE && state.cash >= RULES.CHIP.normal && row <= maxRows - 2) {
        state.education++;
        state.cash -= RULES.CHIP.normal;
        state.chipsBoughtNormal++;
        row++;
        if (debug) console.log(`行${row-1}: 教育チップ購入 → 教育${state.education}枚`);
    }

    // メインループ: 仕入れ→製造→販売→チップ購入を繰り返す
    while (row <= maxRows - 1) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);
        let acted = false;

        // 仕入れ（現金があれば大量に）
        if (state.materials < 10 && state.cash >= RULES.MATERIAL_PRICE) {
            const maxBuyQty = Math.min(10 - state.materials, Math.floor(state.cash / RULES.MATERIAL_PRICE));
            if (maxBuyQty > 0) {
                state.materials += maxBuyQty;
                state.cash -= maxBuyQty * RULES.MATERIAL_PRICE;
                totalMaterialCost += maxBuyQty * RULES.MATERIAL_PRICE;
                row++;
                if (debug) console.log(`行${row-1}: 仕入れ${maxBuyQty}個`);
                acted = true;
            }
        }

        // 投入
        if (state.materials > 0 && mc > 0 && state.wip < 10 && state.cash >= 1 && row <= maxRows - 1) {
            const qty = Math.min(state.materials, mc, 10 - state.wip);
            state.materials -= qty;
            state.wip += qty;
            state.cash -= qty;
            row++;
            if (debug) console.log(`行${row-1}: 投入${qty}個`);
            acted = true;
        }

        // 完成
        if (state.wip > 0 && mc > 0 && state.products < 10 && state.cash >= 1 && row <= maxRows - 1) {
            const qty = Math.min(state.wip, mc, 10 - state.products);
            state.wip -= qty;
            state.products += qty;
            state.cash -= qty;
            row++;
            if (debug) console.log(`行${row-1}: 完成${qty}個`);
            acted = true;
        }

        // 研究チップ購入（目標に達してなければ）
        if (state.research < targetR && state.cash >= RULES.CHIP.normal && row <= maxRows - 2) {
            state.research++;
            state.cash -= RULES.CHIP.normal;
            state.chipsBoughtNormal++;
            row++;
            if (debug) console.log(`行${row-1}: 研究チップ購入 → 研究${state.research}枚`);
            acted = true;
        }

        // 販売
        if (state.products > 0 && sc > 0 && row <= maxRows - 1) {
            const sellQty = Math.min(state.products, sc);
            const price = getPrice(state.research, 2);
            state.products -= sellQty;
            state.cash += sellQty * price;
            totalSales += sellQty * price;
            productsSold += sellQty;
            row++;
            if (debug) console.log(`行${row-1}: 販売${sellQty}個×¥${price}`);
            acted = true;
        }

        if (!acted) break;
    }

    // 期末繰越計算
    const totalR = state.research + (state.nextResearch || 0);
    state.nextResearch = Math.min(Math.max(0, totalR - 1), 3);
    state.nextEducation = Math.min(Math.max(0, state.education - 1), 3);
    if (debug) console.log(`2期末繰越: 研究${state.nextResearch}枚, 教育${state.nextEducation}枚`);

    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

    const VQ = totalMaterialCost + productsSold * 2 + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;
    const F = calculateF(state, 2, 0);
    const G = MQ - F;

    if (debug) console.log(`【損益】PQ=${PQ}(${productsSold}個), MQ=${MQ}, F=${F}, G=${G}`);

    let tax = 0, dividend = 0;
    const newEquity = state.equity + G;

    if (newEquity > 300 && !state.hasExceeded300) {
        tax = Math.round((newEquity - 300) * 0.5);
        dividend = Math.round((newEquity - 300) * 0.2);
        state.hasExceeded300 = true;
    }

    state.equity = newEquity - tax;

    const wageUnit = RULES.WAGE_BASE[2];
    const salary = (state.machinesSmall + state.machinesLarge + state.workers + state.salesmen) * wageUnit +
                   state.maxPersonnel * Math.round(wageUnit / 2);
    state.cash -= salary + dividend;

    if (debug) console.log(`期末: 自己資本¥${state.equity}`);

    if (state.cash < 0) {
        const needed = Math.ceil(Math.abs(state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8;
    }

    state.research = 0;
    state.education = 0;

    return { PQ, MQ, F, G, productsSold };
}

function simulatePeriod(state, period, strategy, diceRoll, debug = false) {
    if (period === 2) {
        return simulatePeriod2Interleaved(state, strategy, debug);
    }

    const maxRows = RULES.MAX_ROWS[period];
    let row = 1;

    const startInv = state.materials * RULES.INVENTORY.material +
                     state.wip * RULES.INVENTORY.wip +
                     state.products * RULES.INVENTORY.product;

    if (debug) console.log(`\n=== 第${period}期 ===`);
    if (debug) console.log(`期首: 現金¥${state.cash}, 自己資本¥${state.equity}, 借入¥${state.loans || 0}`);

    const periodStrategy = strategy[`period${period}`] || {};
    state.chipsCarriedOver = 0;
    state.chipsBoughtExpress = 0;
    state.chipsBoughtNormal = 0;

    // チップ繰越
    state.research = state.nextResearch || 0;
    state.education = state.nextEducation || 0;
    state.chipsCarriedOver = state.research + state.education;
    if (debug) console.log(`繰越チップ: 研究${state.research}, 教育${state.education}`);
    state.nextResearch = 0;
    state.nextEducation = 0;

    // PC・保険
    state.pc = 1;
    state.insurance = 1;
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    // 借入
    if (periodStrategy.borrow) {
        const maxLoan = Math.floor(state.equity * 0.5);
        const available = maxLoan - (state.loans || 0);
        const loanAmount = Math.min(periodStrategy.borrow, available);
        if (loanAmount > 0 && state.equity > 0) {
            state.loans = (state.loans || 0) + loanAmount;
            state.cash += loanAmount - Math.round(loanAmount * 0.1);
            row++;
            if (debug) console.log(`借入: ¥${loanAmount}`);
        }
    }

    // 大型機械購入
    if (periodStrategy.largeMachine && state.cash >= 100 && state.machinesLarge === 0) {
        state.machinesLarge++;
        state.cash -= 100;
        row++;
        if (debug) console.log(`★大型機械購入`);
    }

    state.maxPersonnel = Math.max(state.maxPersonnel || 2, state.workers + state.salesmen);

    // 人員採用
    const hireW = periodStrategy.worker || 0;
    for (let i = 0; i < hireW && state.cash >= RULES.HIRE; i++) {
        state.workers++;
        state.cash -= RULES.HIRE;
        row++;
    }

    const hireS = periodStrategy.salesman || 0;
    for (let i = 0; i < hireS && state.cash >= RULES.HIRE; i++) {
        state.salesmen++;
        state.cash -= RULES.HIRE;
        row++;
    }
    state.maxPersonnel = Math.max(state.maxPersonnel, state.workers + state.salesmen);

    // 特急チップ購入
    const targetExpress = periodStrategy.expressResearch || 0;
    for (let i = 0; i < targetExpress && state.cash >= RULES.CHIP.express && row <= maxRows - 4; i++) {
        state.research++;
        state.cash -= RULES.CHIP.express;
        state.chipsBoughtExpress++;
        row++;
    }

    if (debug) console.log(`能力: 製造${getMfgCapacity(state)}, 販売${getSalesCapacity(state)}, 研究${state.research}枚`);

    let totalSales = 0;
    let totalMaterialCost = 0;
    let productsSold = 0;

    // メインループ
    while (row <= maxRows - 1) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);

        // 販売
        if (state.products > 0 && sc > 0) {
            const sellQty = Math.min(state.products, sc);
            const price = getPrice(state.research, period);
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
        if (state.materials < 10 && state.cash >= RULES.MATERIAL_PRICE) {
            const maxBuyQty = Math.min(mc, 10 - state.materials, Math.floor(state.cash / RULES.MATERIAL_PRICE));
            if (maxBuyQty > 0) {
                state.materials += maxBuyQty;
                state.cash -= maxBuyQty * RULES.MATERIAL_PRICE;
                totalMaterialCost += maxBuyQty * RULES.MATERIAL_PRICE;
                row++;
                continue;
            }
        }

        // 次期繰越チップ購入
        if (period <= 4) {
            const targetNextR = periodStrategy.nextResearch || 0;
            if ((state.nextResearch || 0) < targetNextR && state.cash >= RULES.CHIP.normal && row <= maxRows - 2) {
                state.nextResearch = (state.nextResearch || 0) + 1;
                state.cash -= RULES.CHIP.normal;
                state.chipsBoughtNormal++;
                row++;
                continue;
            }
        }

        row++;
    }

    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

    const VQ = totalMaterialCost + productsSold * 2 + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;
    const F = calculateF(state, period, diceRoll);
    const G = MQ - F;

    if (debug) console.log(`【損益】PQ=${PQ}(${productsSold}個), MQ=${MQ}, F=${F}, G=${G}`);

    let tax = 0, dividend = 0;
    const newEquity = state.equity + G;

    if (newEquity > 300) {
        if (!state.hasExceeded300) {
            tax = Math.round((newEquity - 300) * 0.5);
            dividend = Math.round((newEquity - 300) * 0.2);
            state.hasExceeded300 = true;
        } else if (G > 0) {
            tax = Math.round(G * 0.5);
            dividend = Math.round(G * 0.1);
        }
    }

    state.equity = newEquity - tax;

    let wageUnit = RULES.WAGE_BASE[period];
    wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const salary = (state.machinesSmall + state.machinesLarge + state.workers + state.salesmen) * wageUnit +
                   state.maxPersonnel * Math.round(wageUnit / 2);
    state.cash -= salary + dividend;

    if (debug) console.log(`期末: 自己資本¥${state.equity}, 次期繰越R${state.nextResearch || 0}`);

    if (state.cash < 0) {
        const needed = Math.ceil(Math.abs(state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8;
    }

    state.research = 0;
    state.education = 0;

    return { PQ, MQ, F, G, productsSold };
}

// 戦略
const STRATEGIES = {};

// 2期研究4枚 + 教育パターン
for (let edu = 0; edu <= 2; edu++) {
    for (let exp3 = 0; exp3 <= 2; exp3++) {
        for (let exp4 = 0; exp4 <= 2; exp4++) {
            for (let exp5 = 1; exp5 <= 3; exp5++) {
                for (let s = 1; s <= 2; s++) {
                    for (let nextR = 1; nextR <= 2; nextR++) {
                        const name = `R4E${edu}_N${nextR}_L3_E${exp3}${exp4}${exp5}_S${s}`;
                        STRATEGIES[name] = {
                            period2: { research: 4, education: edu },
                            period3: { borrow: 150, largeMachine: true, worker: 1, salesman: s, expressResearch: exp3, nextResearch: nextR },
                            period4: { borrow: 50, expressResearch: exp4, nextResearch: nextR },
                            period5: { expressResearch: exp5 }
                        };
                    }
                }
            }
        }
    }
}

// 2期研究3枚 + 教育パターン
for (let edu = 0; edu <= 2; edu++) {
    for (let exp3 = 0; exp3 <= 2; exp3++) {
        for (let exp4 = 0; exp4 <= 2; exp4++) {
            for (let exp5 = 1; exp5 <= 3; exp5++) {
                for (let s = 1; s <= 2; s++) {
                    for (let nextR = 1; nextR <= 2; nextR++) {
                        const name = `R3E${edu}_N${nextR}_L3_E${exp3}${exp4}${exp5}_S${s}`;
                        STRATEGIES[name] = {
                            period2: { research: 3, education: edu },
                            period3: { borrow: 150, largeMachine: true, worker: 1, salesman: s, expressResearch: exp3, nextResearch: nextR },
                            period4: { borrow: 50, expressResearch: exp4, nextResearch: nextR },
                            period5: { expressResearch: exp5 }
                        };
                    }
                }
            }
        }
    }
}

console.log('='.repeat(70));
console.log('MG シミュレーション v27 - 2期チップ・製販交互パターン');
console.log('='.repeat(70));
console.log(`戦略数: ${Object.keys(STRATEGIES).length}`);

// デバッグ
const testName = 'R4E2_N2_L3_E023_S2';
console.log(`\n【${testName}のデバッグ】`);

let state = {
    cash: 112, equity: 283,
    workers: 1, salesmen: 1,
    machinesSmall: 1, machinesLarge: 0,
    materials: 1, wip: 2, products: 1,
    research: 0, education: 0,
    nextResearch: 0, nextEducation: 0,
    pc: 0, insurance: 0,
    maxPersonnel: 2, loans: 0, shortLoans: 0,
    hasExceeded300: false
};

for (let period = 2; period <= 5; period++) {
    simulatePeriod(state, period, STRATEGIES[testName], 3, true);
}
console.log(`\n【最終】自己資本: ¥${state.equity}`);

// 10000回シミュレーション
console.log('\n' + '='.repeat(70));
console.log('【10000回シミュレーション TOP30】');
console.log('-'.repeat(70));

const results = {};
for (const [name, strategy] of Object.entries(STRATEGIES)) {
    const equities = [];
    for (let i = 0; i < 10000; i++) {
        let s = {
            cash: 112, equity: 283,
            workers: 1, salesmen: 1,
            machinesSmall: 1, machinesLarge: 0,
            materials: 1, wip: 2, products: 1,
            research: 0, education: 0,
            nextResearch: 0, nextEducation: 0,
            pc: 0, insurance: 0,
            maxPersonnel: 2, loans: 0, shortLoans: 0,
            hasExceeded300: false
        };

        for (let period = 2; period <= 5; period++) {
            simulatePeriod(s, period, strategy, Math.floor(Math.random() * 6) + 1, false);
        }
        equities.push(s.equity);
    }

    const sorted = [...equities].sort((a, b) => b - a);
    results[name] = {
        avg: Math.round(equities.reduce((a, b) => a + b) / equities.length),
        max: sorted[0],
        p90: sorted[1000],
        success: equities.filter(e => e >= 450).length
    };
}

const ranking = Object.entries(results)
    .sort((a, b) => b[1].avg - a[1].avg)
    .slice(0, 30);

ranking.forEach(([name, r], i) => {
    const rate = (r.success / 100).toFixed(2);
    console.log(`${String(i + 1).padStart(2)}. ${name.padEnd(25)} 平均¥${String(r.avg).padStart(4)} 達成${rate.padStart(5)}% P90¥${String(r.p90).padStart(4)} 最高¥${r.max}`);
});

console.log('\n【結論】');
const best = ranking[0];
console.log(`最高平均: ${best[0]} (平均¥${best[1].avg}, 達成率${(best[1].success/100).toFixed(2)}%)`);
