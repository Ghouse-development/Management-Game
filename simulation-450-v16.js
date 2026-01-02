/**
 * MG シミュレーション v16
 * 6社競争モデル - 調整版
 *
 * v15からの修正:
 * - 販売価格計算の見直し（研究チップ効果を正しく反映）
 * - リスクカード発生率を実際のゲームに合わせる（行ごとではなくターンごと）
 * - 生産サイクルの効率化
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    HIRE: 5,
    PLAYERS: 6,
    MATERIAL_PRICE: 13  // 6社競争平均
};

// 製造能力（正確版）
function getMfgCapacity(state) {
    if (state.workers === 0) return 0;
    let machineCapacity = state.machinesSmall + state.machinesLarge * 4;
    let capacity = machineCapacity + (state.pc || 0) + Math.min(state.education || 0, 1);
    return Math.min(capacity, state.workers + machineCapacity);
}

// 販売能力（正確版）
function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    const base = state.salesmen * 2;
    const effectiveAds = Math.min(state.advertising || 0, state.salesmen * 2);
    return base + effectiveAds * 2 + Math.min(state.education || 0, 1);
}

/**
 * 6社競争での販売価格
 * 研究チップ2枚で名古屋(28円)が現実的
 * ユーザー情報: R2で27-28円、R0で23-24円
 */
function getAchievablePrice(researchChips, period, diceRoll) {
    const researchBonus = researchChips * 2;

    // ユーザーからの情報に基づく現実的な価格
    // R0: 23-24円, R2: 27-28円
    let basePrice;
    if (researchChips >= 3) {
        basePrice = 30 + Math.floor(Math.random() * 3);  // 30-32円
    } else if (researchChips >= 2) {
        basePrice = 27 + Math.floor(Math.random() * 2);  // 27-28円
    } else if (researchChips >= 1) {
        basePrice = 25 + Math.floor(Math.random() * 2);  // 25-26円
    } else {
        basePrice = 23 + Math.floor(Math.random() * 2);  // 23-24円
    }

    // 2期は高め（競争少ない）
    if (period === 2) {
        basePrice += 2;
    }

    // 運要素（±2円）
    const luck = Math.floor(Math.random() * 5) - 2;
    return Math.max(20, basePrice + luck);
}

/**
 * F計算
 */
function calculateF(state, period, diceRoll, extraFCost) {
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const halfWage = Math.round(wageUnit / 2);

    let F = 0;

    // 人件費
    F += (state.machinesSmall + state.machinesLarge) * wageUnit;
    F += state.workers * wageUnit;
    F += state.salesmen * wageUnit;
    F += state.maxPersonnel * halfWage;

    // 減価償却
    F += state.machinesSmall * (period === 2 ? 10 : 20);
    F += state.machinesLarge * (period === 2 ? 20 : 40);

    // PC・保険
    F += RULES.CHIP.pc + RULES.CHIP.insurance;

    // チップ費用
    if (period === 2) {
        const consumed = Math.max(0, (state.chipsPurchasedNormal || 0) - (state.chipsToCarryOver || 0));
        F += consumed * RULES.CHIP.normal;
    } else {
        F += (state.chipsCarriedOver || 0) * RULES.CHIP.normal;
        F += (state.chipsBoughtExpress || 0) * RULES.CHIP.express;
    }

    // 金利
    F += Math.round((state.loans || 0) * 0.10);

    // 追加F（リスクカード）
    F += extraFCost || 0;

    return F;
}

/**
 * リスクカード効果（簡略化）
 * 実際のゲームでは1ターンに1枚引く
 */
function applyRiskEffect(state, period) {
    const roll = Math.random() * 64;
    let effect = { fCost: 0, specialLoss: 0, skipTurn: false, benefitSale: 0 };

    if (roll < 6) {
        effect.fCost = 5;  // クレーム、縁故等
    } else if (roll < 10) {
        effect.fCost = 10;  // PCトラブル等
    } else if (roll < 12 && period >= 3) {
        state.cash = Math.max(0, state.cash - 30);
        effect.specialLoss = 30;  // 得意先倒産
    } else if (roll < 14 && state.wip > 0) {
        state.wip--;
        effect.specialLoss = 14;  // 製造ミス
    } else if (roll < 16) {
        const loss = state.materials;
        effect.specialLoss = (state.insurance > 0) ? loss * 5 : loss * 13;
        if (state.insurance > 0) state.cash += loss * 8;
        state.materials = 0;  // 火災
    } else if (roll < 18) {
        const stolen = Math.min(2, state.products);
        effect.specialLoss = (state.insurance > 0) ? stolen * 5 : stolen * 15;
        if (state.insurance > 0) state.cash += stolen * 10;
        state.products -= stolen;  // 盗難
    } else if (roll < 22) {
        effect.skipTurn = true;  // ストライキ等
    } else if (roll < 36) {
        effect.benefitSale = 32;  // ベネフィットカード
    }
    // 残りは効果なし

    return effect;
}

/**
 * 1期間シミュレーション
 */
function simulatePeriod(state, period, strategy, diceRoll) {
    const maxRows = RULES.MAX_ROWS[period];
    let row = 1;
    let totalFCost = 0;
    let totalSpecialLoss = 0;

    const startInv = state.materials * RULES.INVENTORY.material +
                     state.wip * RULES.INVENTORY.wip +
                     state.products * RULES.INVENTORY.product;

    // 期首現金不足
    if (state.cash < 30) {
        const needed = Math.ceil((30 - state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8;
    }

    // PC・保険
    state.pc = 1;
    state.insurance = 1;
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    const periodStrategy = strategy[`period${period}`] || {};
    state.chipsPurchasedNormal = 0;
    state.chipsBoughtExpress = 0;
    state.maxPersonnel = state.workers + state.salesmen;

    // 3期以降: チップ繰越
    if (period >= 3) {
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.advertising = state.nextAdvertising || 0;
        state.chipsCarriedOver = state.research + state.education + state.advertising;
        state.nextResearch = 0;
        state.nextEducation = 0;
        state.nextAdvertising = 0;

        // 特急チップ
        const expressR = periodStrategy.expressResearch || 0;
        for (let i = 0; i < expressR && state.cash >= RULES.CHIP.express; i++) {
            state.research++;
            state.cash -= RULES.CHIP.express;
            state.chipsBoughtExpress++;
            row++;
        }
    } else {
        state.research = 0;
        state.education = 0;
        state.advertising = 0;
    }

    // 借入
    if (period >= 3 && periodStrategy.borrow) {
        const maxLoan = Math.floor(state.equity * 0.5);
        const loanAmount = Math.min(periodStrategy.borrow, maxLoan - (state.loans || 0));
        if (loanAmount > 0) {
            state.loans = (state.loans || 0) + loanAmount;
            state.cash += loanAmount - Math.round(loanAmount * 0.1);
            row++;
        }
    }

    // 採用
    const hireS = periodStrategy.salesman || 0;
    const hireW = periodStrategy.worker || 0;
    for (let i = 0; i < hireS && state.cash >= RULES.HIRE; i++) {
        state.salesmen++;
        state.cash -= RULES.HIRE;
        row++;
    }
    for (let i = 0; i < hireW && state.cash >= RULES.HIRE; i++) {
        state.workers++;
        state.cash -= RULES.HIRE;
        row++;
    }
    state.maxPersonnel = Math.max(state.maxPersonnel, state.workers + state.salesmen);

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
        }
        while (state.education < targetE && state.cash >= RULES.CHIP.normal && row <= maxRows - 5) {
            state.education++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
        }
    }

    // メインループ
    while (row <= maxRows - 1) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);

        // リスクカード（各ターン）
        const effect = applyRiskEffect(state, period);
        totalFCost += effect.fCost;
        totalSpecialLoss += effect.specialLoss;

        if (effect.skipTurn) {
            row++;
            continue;
        }

        if (effect.benefitSale > 0 && state.products > 0 && sc > 0) {
            const sellQty = Math.min(5, state.products, sc);
            state.products -= sellQty;
            state.cash += sellQty * effect.benefitSale;
            totalSales += sellQty * effect.benefitSale;
            productsSold += sellQty;
            row++;
            continue;
        }

        // 販売優先
        if (state.products > 0 && sc > 0) {
            const sellQty = Math.min(state.products, sc);
            const price = getAchievablePrice(state.research, period, diceRoll);
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

        // 次期チップ
        const targetNextR = periodStrategy.nextResearch || 0;
        if ((state.nextResearch || 0) < targetNextR && state.cash >= RULES.CHIP.normal) {
            state.nextResearch = (state.nextResearch || 0) + 1;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
            continue;
        }

        row++;
    }

    // 期末
    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

    if (period === 2) {
        const totalR = state.research + (state.nextResearch || 0);
        const totalE = state.education;
        state.chipsToCarryOver = Math.min(Math.max(0, totalR - 1), 3) + Math.min(Math.max(0, totalE - 1), 3);
    }

    const VQ = totalMaterialCost + productsSold * 2 + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;
    const F = calculateF(state, period, diceRoll, totalFCost);
    const G = MQ - F - totalSpecialLoss;

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

    if (state.cash < 0) {
        const needed = Math.ceil(Math.abs(state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8;
    }

    // チップ繰越
    if (period === 2) {
        state.nextResearch = Math.min(Math.max(0, state.research + (state.nextResearch || 0) - 1), 3);
        state.nextEducation = Math.min(Math.max(0, state.education - 1), 3);
    }
    state.research = 0;
    state.education = 0;
    state.advertising = 0;

    return { PQ, VQ, MQ, F, G, tax, dividend, productsSold, specialLoss: totalSpecialLoss };
}

// 戦略
const STRATEGIES = {
    'R0': { period2: {}, period3: {}, period4: {}, period5: {} },
    'R1': { period2: { research: 1 }, period3: {}, period4: {}, period5: {} },
    'R2': { period2: { research: 2 }, period3: {}, period4: {}, period5: {} },
    'R3': { period2: { research: 3 }, period3: {}, period4: {}, period5: {} },
    'R1E1': { period2: { research: 1, education: 1 }, period3: {}, period4: {}, period5: {} },
    'R2E1': { period2: { research: 2, education: 1 }, period3: {}, period4: {}, period5: {} },
    'R2E1_N1': { period2: { research: 2, education: 1, nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} },
    'R2E1_N2': { period2: { research: 2, education: 1, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R2E1_N1_B30': { period2: { research: 2, education: 1, nextResearch: 1 }, period3: { nextResearch: 1, borrow: 30 }, period4: { nextResearch: 1, borrow: 70 }, period5: {} },
    'R2E1_N1_S1': { period2: { research: 2, education: 1, nextResearch: 1, salesman: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} },
    'R2E1_EXP': { period2: { research: 2, education: 1, nextResearch: 1 }, period3: { nextResearch: 1, expressResearch: 1 }, period4: { nextResearch: 1, expressResearch: 1 }, period5: {} },
    'R3_N1': { period2: { research: 3, nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} },
};

function runSimulation(strategyName, runs = 10000) {
    const strategy = STRATEGIES[strategyName];
    if (!strategy) return null;
    const results = [];

    for (let i = 0; i < runs; i++) {
        let state = {
            cash: 112, equity: 283,
            workers: 1, salesmen: 1,
            machinesSmall: 1, machinesLarge: 0,
            materials: 1, wip: 2, products: 1,
            research: 0, education: 0, advertising: 0,
            nextResearch: 0, nextEducation: 0, nextAdvertising: 0,
            pc: 0, insurance: 0,
            maxPersonnel: 2, loans: 0, shortLoans: 0,
            hasExceeded300: false
        };

        for (let period = 2; period <= 5; period++) {
            const diceRoll = period >= 3 ? Math.floor(Math.random() * 6) + 1 : 0;
            simulatePeriod(state, period, strategy, diceRoll);
        }

        results.push({ finalEquity: state.equity, success: state.equity >= 450 });
    }
    return results;
}

function analyzeResults(results, name) {
    const equities = results.map(r => r.finalEquity);
    const sorted = [...equities].sort((a, b) => b - a);
    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
    const successRate = (results.filter(r => r.success).length / results.length * 100).toFixed(2);
    return { name, avg, max: Math.max(...equities), min: Math.min(...equities), successRate: parseFloat(successRate), p90: sorted[Math.floor(results.length * 0.1)], p50: sorted[Math.floor(results.length * 0.5)] };
}

console.log('='.repeat(70));
console.log('MG シミュレーション v16 - 6社競争（調整版）');
console.log('='.repeat(70));
console.log('販売価格: R0=23-24円, R2=27-28円（ユーザー情報に基づく）');
console.log(`戦略数: ${Object.keys(STRATEGIES).length}, 各10000回\n`);

const allResults = {};
for (const name of Object.keys(STRATEGIES)) {
    allResults[name] = analyzeResults(runSimulation(name, 10000), name);
}

const sorted = Object.values(allResults).sort((a, b) => b.successRate - a.successRate || b.avg - a.avg);

console.log('【達成率ランキング】');
console.log('-'.repeat(70));
sorted.forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${r.name.padEnd(15)} 達成率${String(r.successRate).padStart(6)}% 平均¥${r.avg} 中央¥${r.p50} P90¥${r.p90} 最高¥${r.max}`);
});

console.log('\n【結論】');
const best = sorted[0];
console.log(`最高達成率: ${best.successRate}% (${best.name})`);
console.log(`最高平均自己資本: ¥${Math.max(...sorted.map(s => s.avg))}`);

if (best.successRate < 5) {
    console.log('\n⚠️ 6社競争では¥450達成は非常に困難（<5%）');
} else if (best.successRate < 20) {
    console.log('\n⚠️ 6社競争では¥450達成は困難（5-20%）');
} else {
    console.log('\n✓ 最適戦略で¥450達成可能（>20%）');
}
