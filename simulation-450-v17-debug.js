/**
 * MG シミュレーション v17 - デバッグ版
 * 1回のシミュレーションを詳細に追跡
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    HIRE: 5,
    MATERIAL_PRICE: 13
};

function getMfgCapacity(state) {
    if (state.workers === 0) return 0;
    return state.machinesSmall + state.machinesLarge * 4 + (state.pc || 0) + Math.min(state.education || 0, 1);
}

function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2 + Math.min(state.advertising || 0, state.salesmen * 2) * 2 + Math.min(state.education || 0, 1);
}

function getPrice(researchChips, period) {
    // R0: 23-24, R2: 27-28
    const base = 23 + researchChips * 2;
    return base + (period === 2 ? 2 : 0);
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

    if (debug) console.log(`\n=== 第${period}期開始 ===`);
    if (debug) console.log(`期首: 現金¥${state.cash}, 自己資本¥${state.equity}`);
    if (debug) console.log(`在庫: 材料${state.materials}, 仕掛${state.wip}, 製品${state.products} (評価¥${startInv})`);

    // PC・保険
    state.pc = 1;
    state.insurance = 1;
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;
    if (debug) console.log(`PC+保険購入: -¥${RULES.CHIP.pc + RULES.CHIP.insurance} → 残金¥${state.cash}`);

    const periodStrategy = strategy[`period${period}`] || {};
    state.chipsPurchasedNormal = 0;
    state.maxPersonnel = state.workers + state.salesmen;

    // 3期以降チップ繰越
    if (period >= 3) {
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.chipsCarriedOver = state.research + state.education;
        state.nextResearch = 0;
        state.nextEducation = 0;
        if (debug) console.log(`繰越チップ: 研究${state.research}, 教育${state.education}`);
    } else {
        state.research = 0;
        state.education = 0;
    }

    let totalSales = 0;
    let totalMaterialCost = 0;
    let productsSold = 0;

    // 2期チップ購入
    if (period === 2) {
        const targetR = periodStrategy.research || 0;
        const targetE = periodStrategy.education || 0;
        while (state.research < targetR && state.cash >= RULES.CHIP.normal && row <= maxRows - 5) {
            state.research++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
            if (debug) console.log(`研究チップ購入: -¥${RULES.CHIP.normal} → 研究${state.research}枚`);
        }
        while (state.education < targetE && state.cash >= RULES.CHIP.normal && row <= maxRows - 5) {
            state.education++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
            if (debug) console.log(`教育チップ購入: -¥${RULES.CHIP.normal} → 教育${state.education}枚`);
        }
    }

    // メインループ（リスクカードなし、シンプルに）
    let cycles = 0;
    while (row <= maxRows - 1 && cycles < 50) {
        cycles++;
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
            if (debug) console.log(`販売: ${sellQty}個×¥${price} = +¥${sellQty * price} → 残金¥${state.cash}`);
            continue;
        }

        // 完成
        if (state.wip > 0 && mc > 0 && state.products < 10 && state.cash >= 1) {
            const qty = Math.min(state.wip, mc, 10 - state.products);
            state.wip -= qty;
            state.products += qty;
            state.cash -= qty;
            row++;
            if (debug) console.log(`完成: 仕掛${qty}→製品${qty} (-¥${qty})`);
            continue;
        }

        // 投入
        if (state.materials > 0 && mc > 0 && state.wip < 10 && state.cash >= 1) {
            const qty = Math.min(state.materials, mc, 10 - state.wip);
            state.materials -= qty;
            state.wip += qty;
            state.cash -= qty;
            row++;
            if (debug) console.log(`投入: 材料${qty}→仕掛${qty} (-¥${qty})`);
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
                if (debug) console.log(`仕入: ${qty}個×¥${RULES.MATERIAL_PRICE} = -¥${qty * RULES.MATERIAL_PRICE}`);
                continue;
            }
        }

        // 次期チップ
        const targetNextR = periodStrategy.nextResearch || 0;
        if ((state.nextResearch || 0) < targetNextR && state.cash >= RULES.CHIP.normal) {
            state.nextResearch = (state.nextResearch || 0) + 1;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
            if (debug) console.log(`次期研究チップ: -¥${RULES.CHIP.normal}`);
            continue;
        }

        break;
    }

    // 期末
    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

    if (period === 2) {
        const totalR = state.research + (state.nextResearch || 0);
        state.chipsToCarryOver = Math.min(Math.max(0, totalR - 1), 3) + Math.min(Math.max(0, state.education - 1), 3);
    }

    const VQ = totalMaterialCost + productsSold * 2 + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;
    const F = calculateF(state, period, diceRoll);
    const G = MQ - F;

    if (debug) {
        console.log(`\n【期末計算】`);
        console.log(`PQ(売上): ¥${PQ} (${productsSold}個販売)`);
        console.log(`VQ(変動費): ¥${VQ} = 材料${totalMaterialCost} + 加工${productsSold * 2} + 期首在庫${startInv} - 期末在庫${endInv}`);
        console.log(`MQ(限界利益): ¥${MQ}`);
        console.log(`F(固定費): ¥${F}`);
        console.log(`G(経常利益): ¥${G}`);
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
    if (debug) console.log(`税金: ¥${tax}, 配当: ¥${dividend}, 新自己資本: ¥${state.equity}`);

    // 期末支払い
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const salary = (state.machinesSmall + state.machinesLarge + state.workers + state.salesmen) * wageUnit +
                   state.maxPersonnel * Math.round(wageUnit / 2);
    state.cash -= salary + dividend;
    if (debug) console.log(`給料支払い: ¥${salary}, 配当支払い: ¥${dividend} → 残金¥${state.cash}`);

    if (state.cash < 0) {
        const needed = Math.ceil(Math.abs(state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8;
        if (debug) console.log(`短期借入: ¥${needed} (受取¥${needed * 0.8}) → 残金¥${state.cash}`);
    }

    // チップ繰越
    if (period === 2) {
        state.nextResearch = Math.min(Math.max(0, state.research + (state.nextResearch || 0) - 1), 3);
        state.nextEducation = Math.min(Math.max(0, state.education - 1), 3);
    }
    state.research = 0;
    state.education = 0;

    return { PQ, VQ, MQ, F, G, tax, dividend };
}

// R2E1_N2戦略（次期繰越でチップ維持）
const strategy = {
    period2: { research: 2, education: 1, nextResearch: 2 },
    period3: { nextResearch: 2 },
    period4: { nextResearch: 2 },
    period5: {}
};

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

console.log('='.repeat(70));
console.log('MG シミュレーション v17 - デバッグ版（R2E1戦略）');
console.log('='.repeat(70));

for (let period = 2; period <= 5; period++) {
    const diceRoll = period >= 3 ? 3 : 0;  // 固定値でテスト
    simulatePeriod(state, period, strategy, diceRoll, true);
}

console.log('\n' + '='.repeat(70));
console.log(`【最終結果】自己資本: ¥${state.equity}`);
console.log('='.repeat(70));
