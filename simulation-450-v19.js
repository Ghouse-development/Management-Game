/**
 * MG シミュレーション v19 - 修正版
 *
 * 修正点:
 * - 大型機械購入を最優先
 * - チップ繰越ロジック修正
 * - 行動順序の最適化
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
    return prices[Math.min(researchChips, 5)] + (period === 2 ? 2 : 0) + Math.floor(Math.random() * 2);
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

    if (period === 2) {
        // 2期: 購入したチップ - 繰越分
        const consumed = Math.max(0, (state.chipsPurchasedNormal || 0) - (state.chipsCarriedOver || 0));
        F += consumed * RULES.CHIP.normal;
    } else {
        // 3期以降: 繰越分 + 特急分
        F += (state.chipsCarriedOver || 0) * RULES.CHIP.normal;
        F += (state.chipsBoughtExpress || 0) * RULES.CHIP.express;
    }

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
    if (debug) console.log(`期首: 現金¥${state.cash}, 自己資本¥${state.equity}`);

    const periodStrategy = strategy[`period${period}`] || {};
    state.chipsPurchasedNormal = 0;
    state.chipsBoughtExpress = 0;
    state.chipsCarriedOver = 0;

    // === 3期以降: チップ繰越処理 ===
    if (period >= 3) {
        // 前期末に設定された nextResearch/nextEducation を今期の研究/教育に
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.chipsCarriedOver = state.research + state.education;
        // リセット
        state.nextResearch = 0;
        state.nextEducation = 0;
        if (debug) console.log(`繰越チップ適用: 研究${state.research}, 教育${state.education}`);
    } else {
        state.research = 0;
        state.education = 0;
    }

    // === 2期: 初期製品を先に売る（大型機械資金確保） ===
    if (period === 2 && periodStrategy.largeMachine && state.products > 0) {
        const sellQty = state.products;
        const price = getPrice(0, period);  // チップなしの価格
        state.products = 0;
        state.cash += sellQty * price;
        row++;
        if (debug) console.log(`初期製品販売: ${sellQty}個×¥${price} = +¥${sellQty * price} → 残金¥${state.cash}`);
    }

    // === PC・保険購入 ===
    state.pc = 1;
    state.insurance = 1;
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    // === 2期: 大型機械購入 ===
    if (period === 2 && periodStrategy.largeMachine && state.cash >= 100) {
        state.machinesLarge++;
        state.cash -= 100;
        row++;
        if (debug) console.log(`★大型機械購入: -¥100 → 製造能力${getMfgCapacity(state)}`);
    }

    // === 借入（3期以降） ===
    if (period >= 3 && periodStrategy.borrow) {
        const maxLoan = Math.floor(state.equity * 0.5);
        const available = maxLoan - (state.loans || 0);
        const loanAmount = Math.min(periodStrategy.borrow, available, 300);
        if (loanAmount > 0 && state.equity > 0) {
            state.loans = (state.loans || 0) + loanAmount;
            const interest = Math.round(loanAmount * 0.1);
            state.cash += loanAmount - interest;
            row++;
            if (debug) console.log(`借入: ¥${loanAmount} (受取¥${loanAmount - interest})`);
        }
    }

    // === 人員採用 ===
    state.maxPersonnel = Math.max(state.maxPersonnel || 2, state.workers + state.salesmen);

    const hireW = periodStrategy.worker || 0;
    for (let i = 0; i < hireW && state.cash >= RULES.HIRE; i++) {
        state.workers++;
        state.cash -= RULES.HIRE;
        row++;
        if (debug) console.log(`ワーカー採用`);
    }

    const hireS = periodStrategy.salesman || 0;
    for (let i = 0; i < hireS && state.cash >= RULES.HIRE; i++) {
        state.salesmen++;
        state.cash -= RULES.HIRE;
        row++;
        if (debug) console.log(`セールス採用`);
    }
    state.maxPersonnel = Math.max(state.maxPersonnel, state.workers + state.salesmen);

    // === 特急チップ購入（3期以降） ===
    if (period >= 3) {
        const expressR = periodStrategy.expressResearch || 0;
        for (let i = 0; i < expressR && state.cash >= RULES.CHIP.express; i++) {
            state.research++;
            state.cash -= RULES.CHIP.express;
            state.chipsBoughtExpress++;
            row++;
            if (debug) console.log(`特急研究購入: 研究${state.research}枚`);
        }
    }

    let totalSales = 0;
    let totalMaterialCost = 0;
    let productsSold = 0;

    // === 2期: チップ購入 ===
    if (period === 2) {
        const targetR = periodStrategy.research || 0;
        const targetE = periodStrategy.education || 0;

        while (state.research < targetR && state.cash >= RULES.CHIP.normal && row <= maxRows - 4) {
            state.research++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
            if (debug) console.log(`研究購入: 研究${state.research}枚`);
        }
        while (state.education < targetE && state.cash >= RULES.CHIP.normal && row <= maxRows - 4) {
            state.education++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
        }
    }

    if (debug) console.log(`製造能力${getMfgCapacity(state)}, 販売能力${getSalesCapacity(state)}, 研究${state.research}枚`);

    // === メインループ ===
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

        // 次期チップ予約（期末2行前まで）
        const targetNextR = periodStrategy.nextResearch || 0;
        if ((state.nextResearch || 0) < targetNextR && state.cash >= RULES.CHIP.normal && row <= maxRows - 2) {
            state.nextResearch = (state.nextResearch || 0) + 1;
            state.cash -= RULES.CHIP.normal;
            if (period === 2) state.chipsPurchasedNormal++;
            row++;
            if (debug) console.log(`次期チップ予約: nextResearch=${state.nextResearch}`);
            continue;
        }

        row++;
    }

    // === 期末計算 ===
    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

    // 2期末: チップ繰越計算
    if (period === 2) {
        // 研究: (今期購入 + 次期予約 - 1) を最大3枚まで繰越
        const totalR = state.research + (state.nextResearch || 0);
        state.chipsCarriedOver = Math.min(Math.max(0, totalR - 1), 3);
        // nextResearch に繰越枚数を設定
        state.nextResearch = state.chipsCarriedOver;
        state.nextEducation = Math.min(Math.max(0, state.education - 1), 3);
        if (debug) console.log(`2期末繰越: 研究${state.nextResearch}枚を3期に持ち越し`);
    }

    const VQ = totalMaterialCost + productsSold * 2 + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;
    const F = calculateF(state, period, diceRoll);
    const G = MQ - F;

    if (debug) console.log(`【損益】PQ=${PQ}(${productsSold}個), MQ=${MQ}, F=${F}, G=${G}`);

    // 税金・配当
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

    // 期末支払い
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const salary = (state.machinesSmall + state.machinesLarge + state.workers + state.salesmen) * wageUnit +
                   state.maxPersonnel * Math.round(wageUnit / 2);
    state.cash -= salary + dividend;

    if (debug) console.log(`期末: 給料¥${salary}, 自己資本¥${state.equity}`);

    // 短期借入
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

// 戦略
const STRATEGIES = {
    // ベースライン: 小型 + R2
    'SMALL_R2': {
        period2: { research: 2, nextResearch: 2 },
        period3: { nextResearch: 2 },
        period4: { nextResearch: 2 },
        period5: {}
    },

    // 大型 + 借入で研究5枚目指す
    'LARGE_R5_MAX': {
        period2: { largeMachine: true, worker: 1 },
        period3: { borrow: 150, expressResearch: 3, nextResearch: 3 },
        period4: { borrow: 100, expressResearch: 3, nextResearch: 3 },
        period5: { expressResearch: 3 }
    },

    // 大型 + セールス追加 + 研究維持
    'LARGE_S1_R3': {
        period2: { largeMachine: true, worker: 1, salesman: 1 },
        period3: { borrow: 150, expressResearch: 2, nextResearch: 2 },
        period4: { borrow: 80, expressResearch: 2, nextResearch: 2 },
        period5: { expressResearch: 2 }
    },

    // 大型 + 販売能力重視（S2）
    'LARGE_S2_R2': {
        period2: { largeMachine: true, worker: 1, salesman: 2 },
        period3: { borrow: 150, expressResearch: 2, nextResearch: 2 },
        period4: { borrow: 80, expressResearch: 2, nextResearch: 2 },
        period5: { expressResearch: 2 }
    },

    // 小型のまま + 研究5枚
    'SMALL_R5_B': {
        period2: { research: 4, nextResearch: 3 },
        period3: { borrow: 100, expressResearch: 2, nextResearch: 3 },
        period4: { borrow: 80, expressResearch: 2, nextResearch: 3 },
        period5: { expressResearch: 2 }
    },

    // バランス型: 大型 + R3
    'LARGE_R3_BAL': {
        period2: { largeMachine: true, worker: 1 },
        period3: { borrow: 120, expressResearch: 2, nextResearch: 2 },
        period4: { borrow: 60, expressResearch: 2, nextResearch: 2 },
        period5: { expressResearch: 2 }
    }
};

console.log('='.repeat(70));
console.log('MG シミュレーション v19 - 大型機械戦略（修正版）');
console.log('='.repeat(70));

// デバッグ実行
const testName = 'LARGE_R5_MAX';
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

// 10000回
console.log('\n' + '='.repeat(70));
console.log('【10000回シミュレーション】');
console.log('-'.repeat(70));

for (const [name, strategy] of Object.entries(STRATEGIES)) {
    const results = [];
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
        results.push(s.equity);
    }

    const sorted = [...results].sort((a, b) => b - a);
    const avg = Math.round(results.reduce((a, b) => a + b) / results.length);
    const success = results.filter(e => e >= 450).length;
    const rate = (success / 100).toFixed(2);

    console.log(`${name.padEnd(18)} 達成${rate.padStart(6)}% 平均¥${String(avg).padStart(4)} P90¥${String(sorted[1000]).padStart(4)} 最高¥${sorted[0]}`);
}
