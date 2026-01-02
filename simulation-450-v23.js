/**
 * MG シミュレーション v23
 *
 * 新戦略:
 * - 2期は投資を最小限にして自己資本を維持
 * - 3期で借入上限を活かして大型機械購入
 * - 販売価格は特急チップで確保
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

function simulatePeriod(state, period, strategy, diceRoll, debug = false) {
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

    // 3期以降: チップ繰越
    if (period >= 3) {
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.chipsCarriedOver = state.research + state.education;
        if (debug) console.log(`繰越チップ: 研究${state.research}`);
        state.nextResearch = 0;
        state.nextEducation = 0;
    } else {
        state.research = 0;
        state.education = 0;
    }

    // PC・保険
    state.pc = 1;
    state.insurance = 1;
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    // 借入（大型機械購入前に必要な額を計算）
    const needForLarge = (period >= 3 && periodStrategy.largeMachine && state.machinesLarge === 0) ? 100 : 0;
    const needForHire = ((periodStrategy.worker || 0) + (periodStrategy.salesman || 0)) * RULES.HIRE;
    const needForExpress = (periodStrategy.expressResearch || 0) * RULES.CHIP.express;
    const totalNeed = needForLarge + needForHire + needForExpress + 50; // +50 buffer

    if (periodStrategy.borrow || totalNeed > state.cash) {
        const maxLoan = Math.floor(state.equity * 0.5);
        const available = maxLoan - (state.loans || 0);
        const wantedLoan = periodStrategy.borrow || Math.max(0, totalNeed - state.cash + 20);
        const loanAmount = Math.min(wantedLoan, available);
        if (loanAmount > 0 && state.equity > 0) {
            state.loans = (state.loans || 0) + loanAmount;
            const received = loanAmount - Math.round(loanAmount * 0.1);
            state.cash += received;
            row++;
            if (debug) console.log(`借入: ¥${loanAmount} → 受取¥${received}, 残高¥${state.loans}`);
        }
    }

    // 大型機械購入（3期以降）
    if (period >= 3 && periodStrategy.largeMachine && state.cash >= 100 && state.machinesLarge === 0) {
        state.machinesLarge++;
        state.cash -= 100;
        row++;
        if (debug) console.log(`★大型機械購入: -¥100`);
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

    // 2期: チップ購入（控えめに）
    if (period === 2) {
        const targetR = periodStrategy.research || 0;
        while (state.research < targetR && state.cash >= RULES.CHIP.normal + 20 && row <= maxRows - 4) {
            state.research++;
            state.cash -= RULES.CHIP.normal;
            state.chipsBoughtNormal++;
            row++;
        }
    }

    // 3期以降: 特急チップ購入
    if (period >= 3) {
        const targetExpress = periodStrategy.expressResearch || 0;
        for (let i = 0; i < targetExpress && state.cash >= RULES.CHIP.express + 20 && row <= maxRows - 4; i++) {
            state.research++;
            state.cash -= RULES.CHIP.express;
            state.chipsBoughtExpress++;
            row++;
        }
        if (debug && state.chipsBoughtExpress > 0) console.log(`特急チップ: ${state.chipsBoughtExpress}枚`);
    }

    if (debug) console.log(`能力: 製造${getMfgCapacity(state)}, 販売${getSalesCapacity(state)}, 研究${state.research}枚, 現金¥${state.cash}`);

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
            const qty = Math.min(mc, 10 - state.materials, Math.floor(state.cash / RULES.MATERIAL_PRICE));
            if (qty > 0) {
                state.materials += qty;
                state.cash -= qty * RULES.MATERIAL_PRICE;
                totalMaterialCost += qty * RULES.MATERIAL_PRICE;
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

    // 2期末: 次期繰越計算
    if (period === 2) {
        const totalR = state.research + (state.nextResearch || 0);
        state.nextResearch = Math.min(Math.max(0, totalR - 1), 3);
        state.nextEducation = Math.min(Math.max(0, state.education - 1), 3);
        if (debug) console.log(`2期末繰越: 研究${state.nextResearch}枚`);
    }

    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

    const VQ = totalMaterialCost + productsSold * 2 + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;
    const F = calculateF(state, period, diceRoll);
    const G = MQ - F;

    if (debug) console.log(`【損益】PQ=${PQ}(${productsSold}個×¥${productsSold ? Math.round(PQ/productsSold) : 0}), MQ=${MQ}, F=${F}, G=${G}`);

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
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const salary = (state.machinesSmall + state.machinesLarge + state.workers + state.salesmen) * wageUnit +
                   state.maxPersonnel * Math.round(wageUnit / 2);
    state.cash -= salary + dividend;

    if (debug) console.log(`期末: 自己資本¥${state.equity}`);

    if (state.cash < 0) {
        const needed = Math.ceil(Math.abs(state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8;
        if (debug) console.log(`短期借入: ¥${needed}`);
    }

    state.research = 0;
    state.education = 0;

    return { PQ, MQ, F, G, productsSold };
}

// 戦略生成
const STRATEGIES = {};

// 基本戦略: 2期は投資控えめ、3期で大型機械
for (let r2 = 0; r2 <= 2; r2++) {
    for (let nextR = 0; nextR <= 2; nextR++) {
        for (let exp3 = 0; exp3 <= 2; exp3++) {
            for (let exp4 = 0; exp4 <= 2; exp4++) {
                for (let exp5 = 1; exp5 <= 3; exp5++) {
                    for (let s = 1; s <= 3; s++) {
                        const name = `R${r2}_N${nextR}_L3_E${exp3}${exp4}${exp5}_S${s}`;
                        STRATEGIES[name] = {
                            period2: { research: r2, nextResearch: nextR },
                            period3: { largeMachine: true, worker: 1, salesman: s, expressResearch: exp3, nextResearch: nextR },
                            period4: { expressResearch: exp4, nextResearch: nextR },
                            period5: { expressResearch: exp5 }
                        };
                    }
                }
            }
        }
    }
}

// 2期借入戦略（自己資本維持のため）
STRATEGIES['P2LOAN_L3'] = {
    period2: { borrow: 100, research: 1, nextResearch: 1 },
    period3: { largeMachine: true, worker: 1, salesman: 2, expressResearch: 1, nextResearch: 1 },
    period4: { expressResearch: 1, nextResearch: 1 },
    period5: { expressResearch: 2 }
};

// 無投資戦略
STRATEGIES['MINIMAL'] = {
    period2: { research: 0 },
    period3: { largeMachine: true, worker: 1, salesman: 2 },
    period4: { expressResearch: 1 },
    period5: { expressResearch: 2 }
};

console.log('='.repeat(70));
console.log('MG シミュレーション v23 - 2期投資控えめ・3期大型機械');
console.log('='.repeat(70));
console.log(`戦略数: ${Object.keys(STRATEGIES).length}`);

// デバッグ
const testName = 'MINIMAL';
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

// もう一つデバッグ
console.log('\n' + '='.repeat(70));
const testName2 = 'R1_N1_L3_E112_S2';
console.log(`【${testName2}のデバッグ】`);

state = {
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
    simulatePeriod(state, period, STRATEGIES[testName2], 3, true);
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
        p50: sorted[5000],
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
