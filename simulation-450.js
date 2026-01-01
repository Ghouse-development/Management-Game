/**
 * MG ¥450達成シミュレーション
 * 正確なルールに基づく戦略検証
 */

// ============================================
// 定数（正確なルール）
// ============================================
const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    MACHINE: { small: { cost: 100, capacity: 1, sell: 56 }, large: { cost: 200, capacity: 4 } },
    WAREHOUSE: 20,
    HIRE: 5
};

// ============================================
// F（固定費）計算
// ============================================
function calculateF(state, period, diceRoll) {
    let F = 0;

    // 人件費
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) {
        wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    }
    const halfWage = Math.round(wageUnit / 2);
    const machineCount = state.machinesSmall + state.machinesLarge;
    const personnelCount = state.workers + state.salesmen;

    F += machineCount * wageUnit;
    F += state.workers * wageUnit;
    F += state.salesmen * wageUnit;
    F += personnelCount * halfWage;

    // 減価償却
    F += state.machinesSmall * (period === 2 ? 10 : 20);
    F += state.machinesLarge * (period === 2 ? 20 : 40);

    // チップ
    F += RULES.CHIP.pc + RULES.CHIP.insurance;  // PC + 保険

    if (period === 2) {
        // 2期: 消費枚数 × ¥20（簡易計算）
        const totalChips = (state.research || 0) + (state.education || 0);
        const carryOver = Math.max(0, totalChips - 1);  // 1枚返却
        F += Math.min(carryOver, 3) * 0;  // 繰越分はFに含まない
        F += Math.max(0, totalChips - Math.min(carryOver, 3)) * RULES.CHIP.normal;
    } else {
        F += (state.chipsCarriedOver || 0) * RULES.CHIP.normal;
        F += (state.expressChips || 0) * RULES.CHIP.express;
    }

    // 倉庫
    F += (state.warehouses || 0) * RULES.WAREHOUSE;

    return F;
}

// ============================================
// 能力計算
// ============================================
function getMfgCapacity(state) {
    if (state.workers === 0) return 0;
    const machineCapacity = state.machinesSmall + state.machinesLarge * 4;
    return machineCapacity + 1 + Math.min(state.education || 0, 1);  // +1 for PC
}

function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2 + Math.min(state.education || 0, 1);
}

// ============================================
// 1期シミュレーション
// ============================================
function simulatePeriod(state, period, strategy, diceRoll) {
    const maxRows = RULES.MAX_ROWS[period];
    let row = 1;

    // PC+保険購入
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;

    // 戦略適用
    const periodStrategy = strategy[`period${period}`] || {};

    // 2期チップ購入（即時適用）
    if (period === 2) {
        const researchToBuy = periodStrategy.research || 0;
        const educationToBuy = periodStrategy.education || 0;
        state.research = researchToBuy;
        state.education = educationToBuy;
        state.cash -= (researchToBuy + educationToBuy) * RULES.CHIP.normal;
        row += researchToBuy + educationToBuy;
    } else {
        // 繰越チップ適用
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.chipsCarriedOver = state.nextResearch + state.nextEducation;
        state.nextResearch = 0;
        state.nextEducation = 0;
        state.expressChips = 0;

        // 特急チップ
        if (periodStrategy.expressResearch) {
            state.research += periodStrategy.expressResearch;
            state.cash -= periodStrategy.expressResearch * RULES.CHIP.express;
            state.expressChips += periodStrategy.expressResearch;
            row += periodStrategy.expressResearch;
        }
    }

    // セールスマン追加
    if (periodStrategy.salesman) {
        state.salesmen += periodStrategy.salesman;
        state.cash -= periodStrategy.salesman * RULES.HIRE;
        row += periodStrategy.salesman;
    }

    // 小型機械売却
    if (periodStrategy.sellSmallMachine && state.machinesSmall > 0) {
        state.machinesSmall -= 1;
        state.cash += RULES.MACHINE.small.sell;
        row += 1;
    }

    // 大型機械購入
    if (periodStrategy.largeMachine) {
        state.machinesLarge += periodStrategy.largeMachine;
        state.cash -= periodStrategy.largeMachine * RULES.MACHINE.large.cost;
        row += periodStrategy.largeMachine;
    }

    // 次期繰越チップ
    if (periodStrategy.nextResearch) {
        state.nextResearch = periodStrategy.nextResearch;
        state.cash -= periodStrategy.nextResearch * RULES.CHIP.normal;
        row += periodStrategy.nextResearch;
    }
    if (periodStrategy.nextEducation) {
        state.nextEducation = periodStrategy.nextEducation;
        state.cash -= periodStrategy.nextEducation * RULES.CHIP.normal;
        row += periodStrategy.nextEducation;
    }

    // 生産・販売サイクル
    const usableRows = maxRows - 2;
    let totalSales = 0;
    let totalMaterialCost = 0;
    let productsSold = 0;

    while (row <= usableRows) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);

        // リスクカード
        if (Math.random() < 0.10) {
            state.cash -= 10;
            row++;
            continue;
        }

        // 販売
        if (state.products > 0 && sc > 0) {
            const sellQty = Math.min(state.products, sc);
            const researchChips = state.research || 0;

            let bidPrice;
            if (researchChips >= 4) bidPrice = 30;
            else if (researchChips >= 2) bidPrice = 28;
            else bidPrice = 25;

            // 市場閉鎖考慮（3期以降）
            if (period >= 3 && diceRoll >= 4) {
                bidPrice = Math.min(bidPrice, 32);  // 福岡上限
            }

            const revenue = sellQty * bidPrice;
            state.products -= sellQty;
            state.cash += revenue;
            totalSales += revenue;
            productsSold += sellQty;
            row++;
            continue;
        }

        // 完成
        if (state.wip > 0 && mc > 0) {
            const completeQty = Math.min(state.wip, mc, 10 - state.products);
            if (completeQty > 0) {
                state.wip -= completeQty;
                state.products += completeQty;
                state.cash -= completeQty;
                row++;
                continue;
            }
        }

        // 投入
        if (state.materials > 0 && mc > 0 && state.wip < 10) {
            const inputQty = Math.min(state.materials, mc, 10 - state.wip);
            if (inputQty > 0) {
                state.materials -= inputQty;
                state.wip += inputQty;
                state.cash -= inputQty;
                row++;
                continue;
            }
        }

        // 仕入れ
        const materialSpace = 10 - state.materials;
        if (materialSpace > 0 && state.cash >= 12) {
            const buyLimit = period === 2 ? 10 : mc;
            const buyPrice = 12;
            const buyQty = Math.min(buyLimit, materialSpace, Math.floor(state.cash / buyPrice));
            if (buyQty > 0) {
                state.materials += buyQty;
                state.cash -= buyQty * buyPrice;
                totalMaterialCost += buyQty * buyPrice;
                row++;
                continue;
            }
        }

        row++;
    }

    // 期末処理
    const F = calculateF(state, period, diceRoll);
    const startInv = 1 * 13 + 2 * 14 + 1 * 15;  // 初期在庫
    const endInv = state.materials * 13 + state.wip * 14 + state.products * 15;
    const VQ = totalMaterialCost + productsSold * 2 + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;
    const G = MQ - F;

    // 税金
    let tax = 0;
    if (state.equity <= 300 && state.equity + G > 300) {
        tax = Math.floor((state.equity + G - 300) * 0.5);
    } else if (state.equity > 300 && G > 0) {
        tax = Math.floor(G * 0.5);
    }

    state.equity = state.equity + G - tax;

    // 給料支払い
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const salaryTotal = (state.machinesSmall + state.machinesLarge + state.workers + state.salesmen) * wageUnit +
                        (state.workers + state.salesmen) * Math.round(wageUnit / 2);
    state.cash -= salaryTotal;

    return { PQ, VQ, MQ, F, G, tax, productsSold, equity: state.equity };
}

// ============================================
// 戦略定義
// ============================================
const STRATEGIES = {
    'USER': {
        period2: { research: 4, education: 2 },
        period3: { salesman: 2, sellSmallMachine: 1, largeMachine: 1, nextResearch: 2 },
        period4: { nextResearch: 5, nextEducation: 1 },
        period5: {}
    },
    'AGGRESSIVE': {
        period2: { research: 3, education: 2 },
        period3: { salesman: 2, largeMachine: 1, nextResearch: 2 },
        period4: { salesman: 1, nextResearch: 3 },
        period5: {}
    },
    'CONSERVATIVE': {
        period2: { research: 2, education: 1 },
        period3: { salesman: 1, nextResearch: 2 },
        period4: { nextResearch: 2 },
        period5: {}
    }
};

// ============================================
// シミュレーション実行
// ============================================
function runSimulation(strategyName, runs = 100) {
    const strategy = STRATEGIES[strategyName];
    const results = [];

    for (let i = 0; i < runs; i++) {
        let state = {
            cash: 112,
            equity: 283,
            workers: 1,
            salesmen: 1,
            machinesSmall: 1,
            machinesLarge: 0,
            materials: 1,
            wip: 2,
            products: 1,
            research: 0,
            education: 0,
            nextResearch: 0,
            nextEducation: 0,
            warehouses: 0,
            chipsCarriedOver: 0,
            expressChips: 0
        };

        let periodResults = [];
        for (let period = 2; period <= 5; period++) {
            const diceRoll = period >= 3 ? Math.floor(Math.random() * 6) + 1 : 0;
            const result = simulatePeriod(state, period, strategy, diceRoll);
            periodResults.push({ period, ...result, diceRoll });
        }

        results.push({
            finalEquity: state.equity,
            success: state.equity >= 450,
            periods: periodResults
        });
    }

    return results;
}

function analyzeResults(results, strategyName) {
    const equities = results.map(r => r.finalEquity).filter(e => !isNaN(e));
    if (equities.length === 0) {
        console.log(`\n=== ${strategyName} ===\nエラー: 有効な結果なし`);
        return { strategyName, avg: 0, max: 0, min: 0, successRate: 0 };
    }

    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
    const max = Math.max(...equities);
    const min = Math.min(...equities);
    const successRate = Math.round(results.filter(r => r.success).length / results.length * 100);

    console.log(`\n=== ${strategyName} ===`);
    console.log(`平均: ¥${avg}, 最高: ¥${max}, 最低: ¥${min}`);
    console.log(`¥450達成率: ${successRate}%`);

    // 詳細例
    if (results.length > 0) {
        const example = results[0];
        console.log('\n期別詳細:');
        example.periods.forEach(p => {
            console.log(`  ${p.period}期: 売${p.productsSold}個 PQ¥${p.PQ} MQ¥${p.MQ} F¥${p.F} G¥${p.G} → ¥${p.equity}`);
        });
    }

    return { strategyName, avg, max, min, successRate };
}

// ============================================
// メイン
// ============================================
console.log('='.repeat(60));
console.log('MG ¥450達成シミュレーション');
console.log('='.repeat(60));

const allResults = {};
for (const name of Object.keys(STRATEGIES)) {
    const results = runSimulation(name, 100);
    allResults[name] = analyzeResults(results, name);
}

console.log('\n' + '='.repeat(60));
console.log('結果サマリー');
console.log('='.repeat(60));

const sorted = Object.values(allResults).sort((a, b) => b.successRate - a.successRate);
sorted.forEach((r, i) => {
    console.log(`${i + 1}. ${r.strategyName}: 達成率${r.successRate}%, 平均¥${r.avg}`);
});
