/**
 * MG ¥450達成シミュレーション v2
 * 正確なルール・現金フロー管理
 */

// ============================================
// 定数
// ============================================
const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    MACHINE: { small: { cost: 100, capacity: 1, sell: 56 }, large: { cost: 200, capacity: 4 } },
    WAREHOUSE: 20,
    HIRE: 5,
    MATERIAL_COST: 12,
    INPUT_COST: 1,
    COMPLETE_COST: 1
};

// ============================================
// 能力計算
// ============================================
function getMfgCapacity(state) {
    if (state.workers === 0) return 0;
    const machineCapacity = state.machinesSmall + state.machinesLarge * 4;
    return machineCapacity + 1 + Math.min(state.education || 0, 1);
}

function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2 + Math.min(state.education || 0, 1);
}

// ============================================
// F計算（人件費・減価償却・チップ費等）
// ============================================
function calculateF(state, period, diceRoll, chipsBoughtThisPeriod, expressChipsBought) {
    let F = 0;

    // 人件費単価
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) {
        wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    }
    const halfWage = Math.round(wageUnit / 2);

    // 機械台数・人員
    const machineCount = state.machinesSmall + state.machinesLarge;
    const personnelCount = state.workers + state.salesmen;

    // 人件費 = (機械数 + W + S) × 単価 + 定員 × 半額
    F += machineCount * wageUnit;
    F += state.workers * wageUnit;
    F += state.salesmen * wageUnit;
    F += personnelCount * halfWage;

    // 減価償却（2期=ジュニア、3期以降=シニア）
    const depreciationRate = period === 2 ? 1 : 2;
    F += state.machinesSmall * 10 * depreciationRate;
    F += state.machinesLarge * 20 * depreciationRate;

    // PC + 保険
    F += RULES.CHIP.pc + RULES.CHIP.insurance;

    // チップ費（今期消費分）
    F += chipsBoughtThisPeriod * RULES.CHIP.normal;
    F += expressChipsBought * RULES.CHIP.express;

    return F;
}

// ============================================
// 期間シミュレーション（行単位で正確に）
// ============================================
function simulatePeriod(state, period, strategy, diceRoll) {
    const maxRows = RULES.MAX_ROWS[period];
    let row = 1;

    // 期首処理（PC＋保険）
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    // 戦略読み込み
    const periodStrategy = strategy[`period${period}`] || {};

    // チップ目標
    let targetResearch = period === 2 ? (periodStrategy.research || 0) : 0;
    let targetEducation = period === 2 ? (periodStrategy.education || 0) : 0;
    let boughtResearch = 0;
    let boughtEducation = 0;

    // 3期以降: 繰越チップ適用
    if (period >= 3) {
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.nextResearch = 0;
        state.nextEducation = 0;

        // 特急チップ
        if (periodStrategy.expressResearch && state.cash >= periodStrategy.expressResearch * RULES.CHIP.express) {
            const qty = periodStrategy.expressResearch;
            state.research += qty;
            state.cash -= qty * RULES.CHIP.express;
            row += qty;
        }
    } else {
        state.research = 0;
        state.education = 0;
    }

    // 次期繰越目標
    let targetNextResearch = periodStrategy.nextResearch || 0;
    let targetNextEducation = periodStrategy.nextEducation || 0;
    let boughtNextResearch = 0;
    let boughtNextEducation = 0;

    // セールスマン追加
    if (periodStrategy.salesman && state.cash >= periodStrategy.salesman * RULES.HIRE) {
        const qty = periodStrategy.salesman;
        state.salesmen += qty;
        state.cash -= qty * RULES.HIRE;
        row += qty;
    }

    // 小型機械売却（3期）
    if (periodStrategy.sellSmallMachine && state.machinesSmall > 0) {
        state.machinesSmall -= 1;
        state.cash += RULES.MACHINE.small.sell;
        row++;
    }

    // 大型機械購入（現金があれば）
    if (periodStrategy.largeMachine && state.cash >= RULES.MACHINE.large.cost) {
        state.machinesLarge += periodStrategy.largeMachine;
        state.cash -= periodStrategy.largeMachine * RULES.MACHINE.large.cost;
        row += periodStrategy.largeMachine;
    }

    // 統計
    let totalSales = 0;
    let totalMaterialCost = 0;
    let totalInputCost = 0;
    let totalCompleteCost = 0;
    let productsSold = 0;
    let chipsBoughtThisPeriod = 0;
    let expressChipsBought = periodStrategy.expressResearch || 0;

    // 行動ループ（残り行数分）
    const reservedRows = 2; // 期末処理用
    while (row <= maxRows - reservedRows) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);

        // リスクカード（10%確率）
        if (Math.random() < 0.10) {
            // 簡易: ¥10損失
            state.cash -= 10;
            row++;
            continue;
        }

        // 優先順位: 販売 > 完成 > 投入 > 仕入れ > チップ購入 > 繰越チップ

        // 販売
        if (state.products > 0 && sc > 0) {
            const sellQty = Math.min(state.products, sc);
            const researchChips = state.research || 0;

            let bidPrice;
            if (researchChips >= 4) bidPrice = 30;
            else if (researchChips >= 2) bidPrice = 28;
            else bidPrice = 25;

            // 3期以降市場閉鎖
            if (period >= 3 && diceRoll >= 4) {
                bidPrice = Math.min(bidPrice, 32); // 福岡上限
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
            if (completeQty > 0 && state.cash >= completeQty * RULES.COMPLETE_COST) {
                state.wip -= completeQty;
                state.products += completeQty;
                state.cash -= completeQty * RULES.COMPLETE_COST;
                totalCompleteCost += completeQty * RULES.COMPLETE_COST;
                row++;
                continue;
            }
        }

        // 投入
        if (state.materials > 0 && mc > 0 && state.wip < 10) {
            const inputQty = Math.min(state.materials, mc, 10 - state.wip);
            if (inputQty > 0 && state.cash >= inputQty * RULES.INPUT_COST) {
                state.materials -= inputQty;
                state.wip += inputQty;
                state.cash -= inputQty * RULES.INPUT_COST;
                totalInputCost += inputQty * RULES.INPUT_COST;
                row++;
                continue;
            }
        }

        // 仕入れ
        const materialSpace = 10 - state.materials;
        if (materialSpace > 0 && state.cash >= RULES.MATERIAL_COST) {
            const buyLimit = mc;
            const buyQty = Math.min(buyLimit, materialSpace, Math.floor(state.cash / RULES.MATERIAL_COST));
            if (buyQty > 0) {
                state.materials += buyQty;
                state.cash -= buyQty * RULES.MATERIAL_COST;
                totalMaterialCost += buyQty * RULES.MATERIAL_COST;
                row++;
                continue;
            }
        }

        // 2期: 研究チップ購入（目標に達していなければ）
        if (period === 2 && boughtResearch < targetResearch && state.cash >= RULES.CHIP.normal) {
            state.research++;
            boughtResearch++;
            state.cash -= RULES.CHIP.normal;
            chipsBoughtThisPeriod++;
            row++;
            continue;
        }

        // 2期: 教育チップ購入
        if (period === 2 && boughtEducation < targetEducation && state.cash >= RULES.CHIP.normal) {
            state.education++;
            boughtEducation++;
            state.cash -= RULES.CHIP.normal;
            chipsBoughtThisPeriod++;
            row++;
            continue;
        }

        // 3期以降: 翌期繰越チップ購入
        if (period >= 3 && boughtNextResearch < targetNextResearch && state.cash >= RULES.CHIP.normal) {
            state.nextResearch++;
            boughtNextResearch++;
            state.cash -= RULES.CHIP.normal;
            chipsBoughtThisPeriod++;
            row++;
            continue;
        }

        if (period >= 3 && boughtNextEducation < targetNextEducation && state.cash >= RULES.CHIP.normal) {
            state.nextEducation++;
            boughtNextEducation++;
            state.cash -= RULES.CHIP.normal;
            chipsBoughtThisPeriod++;
            row++;
            continue;
        }

        // 何もできない
        row++;
    }

    // ============================================
    // 期末決算
    // ============================================

    // 在庫評価（期首）
    const startInv = 1 * RULES.INVENTORY.material + 2 * RULES.INVENTORY.wip + 1 * RULES.INVENTORY.product;
    // 在庫評価（期末）
    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

    // VQ = 材料仕入高 + 投入費 + 完成費 + 期首在庫 - 期末在庫
    const VQ = totalMaterialCost + totalInputCost + totalCompleteCost + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;

    // F計算
    const F = calculateF(state, period, diceRoll, chipsBoughtThisPeriod, expressChipsBought);
    const G = MQ - F;

    // 税金（自己資本が300超過分に50%）
    let tax = 0;
    if (state.equity <= 300 && state.equity + G > 300) {
        tax = Math.floor((state.equity + G - 300) * 0.5);
    } else if (state.equity > 300 && G > 0) {
        tax = Math.floor(G * 0.5);
    }

    // 自己資本更新
    state.equity = state.equity + G - tax;

    // 給料支払い（現金）
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) {
        wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    }
    const halfWage = Math.round(wageUnit / 2);
    const machineCount = state.machinesSmall + state.machinesLarge;
    const personnelCount = state.workers + state.salesmen;
    const salaryTotal = (machineCount + state.workers + state.salesmen) * wageUnit +
                        personnelCount * halfWage;
    state.cash -= salaryTotal;

    return {
        PQ, VQ, MQ, F, G, tax,
        productsSold,
        equity: state.equity,
        cash: state.cash,
        research: state.research,
        education: state.education,
        chipsBought: chipsBoughtThisPeriod
    };
}

// ============================================
// 戦略定義
// ============================================
const STRATEGIES = {
    // ユーザー戦略（段階的投資）
    'USER_CAREFUL': {
        period2: { research: 3, education: 1 },  // 4枚に抑える
        period3: { salesman: 1, nextResearch: 2 },
        period4: { salesman: 1, nextResearch: 2 },
        period5: {}
    },
    // 積極投資（大型機械）
    'LARGE_MACHINE': {
        period2: { research: 2, education: 1 },
        period3: { salesman: 1, sellSmallMachine: 1, largeMachine: 1, nextResearch: 1 },
        period4: { salesman: 1, nextResearch: 2 },
        period5: {}
    },
    // 研究重視
    'RESEARCH_FOCUS': {
        period2: { research: 4, education: 1 },
        period3: { salesman: 1, nextResearch: 3 },
        period4: { expressResearch: 1, nextResearch: 2 },
        period5: {}
    },
    // 最小投資
    'MINIMAL': {
        period2: { research: 2, education: 1 },
        period3: { salesman: 1, nextResearch: 1 },
        period4: { nextResearch: 1 },
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
            nextEducation: 0
        };

        let periodResults = [];
        for (let period = 2; period <= 5; period++) {
            const diceRoll = period >= 3 ? Math.floor(Math.random() * 6) + 1 : 0;
            const result = simulatePeriod(state, period, strategy, diceRoll);
            periodResults.push({ period, ...result, diceRoll });
        }

        results.push({
            finalEquity: state.equity,
            finalCash: state.cash,
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

    // 詳細例（1件目）
    if (results.length > 0) {
        const example = results[0];
        console.log('\n期別詳細:');
        example.periods.forEach(p => {
            console.log(`  ${p.period}期: 売${p.productsSold}個 PQ¥${p.PQ} MQ¥${p.MQ} F¥${p.F} G¥${p.G} 現金¥${p.cash} → 自己資本¥${p.equity}`);
        });
    }

    return { strategyName, avg, max, min, successRate };
}

// ============================================
// メイン実行
// ============================================
console.log('='.repeat(60));
console.log('MG ¥450達成シミュレーション v2');
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
