/**
 * MG シミュレーション v18 - 大型機械戦略
 *
 * ユーザーフィードバック:
 * - 研究5枚で31-32円販売可能
 * - 5期F≒400円
 * - 大型機械が有利
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    MACHINE: { small: 100, large: 200 },  // 半額50/100で購入
    HIRE: 5,
    MATERIAL_PRICE: 13
};

// 販売価格（研究チップ効果を正確に）
function getPrice(researchChips, period) {
    // R0:23, R1:25, R2:27, R3:29, R4:31, R5:32
    const prices = [23, 25, 27, 29, 31, 32];
    const base = prices[Math.min(researchChips, 5)];
    // 2期は+2（競争少ない）
    return base + (period === 2 ? 2 : 0) + Math.floor(Math.random() * 2);
}

// 製造能力
function getMfgCapacity(state) {
    if (state.workers === 0) return 0;
    const machineCapacity = state.machinesSmall + state.machinesLarge * 4;
    return machineCapacity + (state.pc || 0) + Math.min(state.education || 0, 1);
}

// 販売能力
function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2 + Math.min(state.advertising || 0, state.salesmen * 2) * 2 + Math.min(state.education || 0, 1);
}

// F計算（正確版）
function calculateF(state, period, diceRoll) {
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const halfWage = Math.round(wageUnit / 2);

    let F = 0;
    // 機械費
    F += (state.machinesSmall + state.machinesLarge) * wageUnit;
    // 人件費
    F += state.workers * wageUnit;
    F += state.salesmen * wageUnit;
    F += state.maxPersonnel * halfWage;
    // 減価償却
    F += state.machinesSmall * (period === 2 ? 10 : 20);
    F += state.machinesLarge * (period === 2 ? 20 : 40);
    // PC・保険
    F += RULES.CHIP.pc + RULES.CHIP.insurance;
    // チップ
    if (period === 2) {
        F += (state.chipsPurchasedNormal || 0) * RULES.CHIP.normal;
    } else {
        F += (state.chipsCarriedOver || 0) * RULES.CHIP.normal;
        F += (state.chipsBoughtExpress || 0) * RULES.CHIP.express;
    }
    // 金利
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
    if (debug) console.log(`期首: 現金¥${state.cash}, 自己資本¥${state.equity}, 製造${getMfgCapacity(state)}, 販売${getSalesCapacity(state)}`);

    // PC・保険
    state.pc = 1;
    state.insurance = 1;
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    const periodStrategy = strategy[`period${period}`] || {};
    state.chipsPurchasedNormal = 0;
    state.chipsBoughtExpress = 0;
    state.maxPersonnel = Math.max(state.maxPersonnel, state.workers + state.salesmen);

    // 3期以降: チップ繰越（全没収後、nextから補充）
    if (period >= 3) {
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.chipsCarriedOver = state.research + state.education;
        state.nextResearch = 0;
        state.nextEducation = 0;
        if (debug) console.log(`繰越チップ: 研究${state.research}`);
    }

    // 借入（3期以降）
    if (period >= 3 && periodStrategy.borrow) {
        const maxLoan = Math.floor(state.equity * 0.5);
        const currentLoans = state.loans || 0;
        const loanAmount = Math.min(periodStrategy.borrow, maxLoan - currentLoans);
        if (loanAmount > 0) {
            state.loans = currentLoans + loanAmount;
            const interest = Math.round(loanAmount * 0.1);
            state.cash += loanAmount - interest;
            row++;
            if (debug) console.log(`借入: ¥${loanAmount} (受取¥${loanAmount - interest})`);
        }
    }

    // 大型機械購入（2期のみ、半額100円）
    if (period === 2 && periodStrategy.largeMachine && state.cash >= 100) {
        state.machinesLarge++;
        state.cash -= 100;
        row++;
        if (debug) console.log(`大型機械購入: -¥100`);
    }

    // ワーカー採用
    const hireW = periodStrategy.worker || 0;
    for (let i = 0; i < hireW && state.cash >= RULES.HIRE; i++) {
        state.workers++;
        state.cash -= RULES.HIRE;
        row++;
        if (debug) console.log(`ワーカー採用: -¥5`);
    }
    state.maxPersonnel = Math.max(state.maxPersonnel, state.workers + state.salesmen);

    // セールス採用
    const hireS = periodStrategy.salesman || 0;
    for (let i = 0; i < hireS && state.cash >= RULES.HIRE; i++) {
        state.salesmen++;
        state.cash -= RULES.HIRE;
        row++;
        if (debug) console.log(`セールス採用: -¥5`);
    }
    state.maxPersonnel = Math.max(state.maxPersonnel, state.workers + state.salesmen);

    // 特急チップ（3期以降）
    if (period >= 3) {
        const expressR = periodStrategy.expressResearch || 0;
        for (let i = 0; i < expressR && state.cash >= RULES.CHIP.express; i++) {
            state.research++;
            state.cash -= RULES.CHIP.express;
            state.chipsBoughtExpress++;
            row++;
            if (debug) console.log(`特急研究: -¥40 → 研究${state.research}枚`);
        }
    }

    let totalSales = 0;
    let totalMaterialCost = 0;
    let productsSold = 0;

    // 2期: チップ購入
    if (period === 2) {
        const targetR = periodStrategy.research || 0;
        while (state.research < targetR && state.cash >= RULES.CHIP.normal && row <= maxRows - 4) {
            state.research++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
            if (debug) console.log(`研究購入: -¥20 → 研究${state.research}枚`);
        }
    }

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
            if (debug) console.log(`販売: ${sellQty}個×¥${price} = +¥${sellQty * price}`);
            continue;
        }

        // 完成
        if (state.wip > 0 && mc > 0 && state.products < 10 && state.cash >= 1) {
            const qty = Math.min(state.wip, mc, 10 - state.products);
            state.wip -= qty;
            state.products += qty;
            state.cash -= qty;
            row++;
            if (debug) console.log(`完成: ${qty}個`);
            continue;
        }

        // 投入
        if (state.materials > 0 && mc > 0 && state.wip < 10 && state.cash >= 1) {
            const qty = Math.min(state.materials, mc, 10 - state.wip);
            state.materials -= qty;
            state.wip += qty;
            state.cash -= qty;
            row++;
            if (debug) console.log(`投入: ${qty}個`);
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
                if (debug) console.log(`仕入: ${qty}個 (-¥${qty * RULES.MATERIAL_PRICE})`);
                continue;
            }
        }

        // 次期チップ予約
        const targetNextR = periodStrategy.nextResearch || 0;
        if ((state.nextResearch || 0) < targetNextR && state.cash >= RULES.CHIP.normal && row <= maxRows - 2) {
            state.nextResearch = (state.nextResearch || 0) + 1;
            state.cash -= RULES.CHIP.normal;
            if (period === 2) state.chipsPurchasedNormal++;
            row++;
            if (debug) console.log(`次期研究予約: -¥20`);
            continue;
        }

        row++;
    }

    // 期末計算
    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

    const VQ = totalMaterialCost + productsSold * 2 + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;
    const F = calculateF(state, period, diceRoll);
    const G = MQ - F;

    if (debug) {
        console.log(`【損益】PQ=${PQ}(${productsSold}個), VQ=${VQ}, MQ=${MQ}, F=${F}, G=${G}`);
    }

    // 税金・配当
    let tax = 0, dividend = 0;
    const newEquity = state.equity + G;

    if (newEquity > 300) {
        if (!state.hasExceeded300) {
            const excess = newEquity - 300;
            tax = Math.round(excess * 0.5);
            dividend = Math.round(excess * 0.2);
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

    // 2期末チップ繰越
    if (period === 2) {
        state.nextResearch = Math.min(Math.max(0, state.research + (state.nextResearch || 0) - 1), 3);
        state.nextEducation = Math.min(Math.max(0, state.education - 1), 3);
        if (debug) console.log(`繰越予定: 研究${state.nextResearch}`);
    }
    state.research = 0;
    state.education = 0;

    return { PQ, VQ, MQ, F, G };
}

// 大型機械戦略
const STRATEGIES = {
    // 基本（大型なし）
    'R2_BASE': {
        period2: { research: 2 },
        period3: {},
        period4: {},
        period5: {}
    },

    // 大型機械 + 研究3枚 + ワーカー追加
    'LARGE_R3_W1': {
        period2: { largeMachine: true, worker: 1, research: 3, nextResearch: 2 },
        period3: { nextResearch: 2 },
        period4: { nextResearch: 2 },
        period5: {}
    },

    // 大型機械 + 借入で研究維持
    'LARGE_R3_BORROW': {
        period2: { largeMachine: true, worker: 1, research: 3, nextResearch: 2 },
        period3: { borrow: 50, nextResearch: 2, expressResearch: 1 },
        period4: { borrow: 50, nextResearch: 2, expressResearch: 1 },
        period5: { expressResearch: 2 }
    },

    // 大型機械 + セールス追加 + 高研究
    'LARGE_R3_S1': {
        period2: { largeMachine: true, worker: 1, salesman: 1, research: 2, nextResearch: 2 },
        period3: { nextResearch: 2 },
        period4: { nextResearch: 2 },
        period5: {}
    },

    // 大型機械 + 研究4枚（攻撃的）
    'LARGE_R4': {
        period2: { largeMachine: true, worker: 1, research: 4, nextResearch: 2 },
        period3: { borrow: 80, nextResearch: 2, expressResearch: 1 },
        period4: { borrow: 50, nextResearch: 2, expressResearch: 1 },
        period5: { expressResearch: 2 }
    },

    // 超攻撃的：大型 + 借入 + 研究5枚目標
    'LARGE_R5_AGGRO': {
        period2: { largeMachine: true, worker: 1, research: 3, nextResearch: 3 },
        period3: { borrow: 100, nextResearch: 3, expressResearch: 2 },
        period4: { borrow: 80, nextResearch: 3, expressResearch: 2 },
        period5: { expressResearch: 3 }
    }
};

// 1回のシミュレーションをデバッグ実行
console.log('='.repeat(70));
console.log('MG シミュレーション v18 - 大型機械戦略');
console.log('='.repeat(70));

// LARGE_R4でデバッグ
const testStrategy = 'LARGE_R4';
console.log(`\n【${testStrategy}戦略のデバッグ実行】`);

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
    const diceRoll = period >= 3 ? 3 : 0;
    simulatePeriod(state, period, STRATEGIES[testStrategy], diceRoll, true);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`【最終結果】自己資本: ¥${state.equity}`);
console.log('='.repeat(70));

// 10000回シミュレーション
console.log('\n【10000回シミュレーション結果】');
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
            const diceRoll = period >= 3 ? Math.floor(Math.random() * 6) + 1 : 0;
            simulatePeriod(s, period, strategy, diceRoll, false);
        }
        results.push(s.equity);
    }

    const sorted = [...results].sort((a, b) => b - a);
    const avg = Math.round(results.reduce((a, b) => a + b) / results.length);
    const success = results.filter(e => e >= 450).length;
    const rate = (success / 100).toFixed(2);

    console.log(`${name.padEnd(20)} 達成率${rate.padStart(6)}% 平均¥${avg} P90¥${sorted[1000]} 最高¥${sorted[0]}`);
}
