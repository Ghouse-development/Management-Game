/**
 * MG 詳細戦略分析
 * 上位戦略の行動追跡と収益分析
 */

const GAME_RULES = {
    WIP_CAPACITY: 10,
    MATERIAL_BASE: 10,
    PRODUCT_BASE: 10,
    CHIP_COST: 20,
    INSURANCE_COST: 5,
    PROCESSING_COST: 1,
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    RISK_PROBABILITY: 0.10,
    RISK_AVG_LOSS: 5,
    SIMULATION_RUNS: 100,
    // 仕入れ価格シナリオ
    MATERIAL_COST_NORMAL: { min: 11, max: 13, avg: 12 },
    MATERIAL_COST_CHEAP: { min: 10, max: 12, avg: 11 },  // 安い市場狙い
    MATERIAL_COST: null,
    // シナリオA: 現実的（現在）
    SELL_PRICES_A: {
        WITH_RESEARCH_2: { avg: 29, best: 31, worst: 27, winRate: 0.95 },
        WITH_RESEARCH_1: { avg: 27, best: 29, worst: 25, winRate: 0.80 },
        NO_RESEARCH: { avg: 24, best: 25, worst: 22, winRate: 0.50 }
    },
    // シナリオB: 楽観的（高価格市場狙い）
    SELL_PRICES_B: {
        WITH_RESEARCH_2: { avg: 30, best: 32, worst: 28, winRate: 0.95 },
        WITH_RESEARCH_1: { avg: 28, best: 30, worst: 26, winRate: 0.85 },
        NO_RESEARCH: { avg: 25, best: 26, worst: 24, winRate: 0.60 }
    },
    // シナリオC: 超楽観（プレミアム市場）
    SELL_PRICES_C: {
        WITH_RESEARCH_2: { avg: 31, best: 33, worst: 29, winRate: 0.92 },
        WITH_RESEARCH_1: { avg: 29, best: 31, worst: 27, winRate: 0.80 },
        NO_RESEARCH: { avg: 26, best: 27, worst: 25, winRate: 0.55 }
    },
    // 使用するシナリオ
    SELL_PRICES: null
};

// 最適戦略F2b
const OPTIMAL_STRATEGY = {
    period2: { nextResearch: 2, salesman: 0, machine: 0 },
    period3: { research: 0, salesman: 0, machine: 0 },
    period4: { research: 0, salesman: 0, machine: 0 },
    period5: { research: 0, salesman: 0, machine: 0 }
};

function calcMfgCapacity(state) {
    if (state.workers === 0) return 0;
    return (state.machinesSmall || 0) + (state.machinesLarge || 0) * 4 + (state.chips?.computer || 0);
}

function calcSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2;
}

function runDetailedSimulation(strategy, verbose = false) {
    let state = {
        period: 2,
        cash: 112,
        equity: 283,
        workers: 1,
        salesmen: 1,
        machinesSmall: 1,
        machinesLarge: 0,
        materials: 1,
        wip: 2,
        products: 1,
        warehouses: 0,
        chips: { research: 0, computer: 1, insurance: 1 },
        nextPeriodChips: { research: 0 },
        shortLoans: 0,
        hasExceeded300: false
    };

    let totalStats = {
        productsSold: 0,
        totalSales: 0,
        totalMaterialCost: 0,
        totalF: 0,
        totalG: 0,
        totalTax: 0,
        rowsUsed: 0
    };

    let periodDetails = [];

    for (let period = 2; period <= 5; period++) {
        const maxRows = GAME_RULES.MAX_ROWS[period];
        const usableRows = maxRows - 2;
        let row = 1;
        const wage = GAME_RULES.WAGE_BASE[period];

        const periodKey = `period${period}`;
        const strat = strategy[periodKey] || {};

        state.newResearchChips = 0;

        // 翌期チップ購入
        if (strat.nextResearch) {
            state.nextPeriodChips.research = strat.nextResearch;
            row += strat.nextResearch;
        }

        // 繰越チップ適用
        if (state.nextPeriodChips.research > 0) {
            state.chips.research += state.nextPeriodChips.research;
            state.nextPeriodChips.research = 0;
        }

        // 研究チップ購入
        if (strat.research) {
            const need = strat.research - (state.chips.research || 0);
            if (need > 0) {
                state.chips.research = (state.chips.research || 0) + need;
                state.newResearchChips = need;
                row += need;
            }
        }

        // 生産・販売ループ
        let periodSales = 0;
        let periodMaterialCost = 0;
        let periodProcessingCost = 0;
        let periodProductsSold = 0;
        let periodRowsUsed = 0;

        while (row <= usableRows) {
            const mc = calcMfgCapacity(state);
            const sc = calcSalesCapacity(state);

            // リスク
            if (Math.random() < GAME_RULES.RISK_PROBABILITY) {
                state.cash -= Math.floor(Math.random() * GAME_RULES.RISK_AVG_LOSS * 2);
                row++;
                continue;
            }

            // 販売
            if (state.products > 0 && sc > 0) {
                const sellQty = Math.min(state.products, sc);
                const researchChips = state.chips.research || 0;
                const priceConfig = researchChips >= 2 ? GAME_RULES.SELL_PRICES.WITH_RESEARCH_2 :
                                   researchChips === 1 ? GAME_RULES.SELL_PRICES.WITH_RESEARCH_1 :
                                   GAME_RULES.SELL_PRICES.NO_RESEARCH;

                if (Math.random() < priceConfig.winRate) {
                    const rand = Math.random();
                    const sellPrice = rand < 0.25 ? priceConfig.best : rand < 0.75 ? priceConfig.avg : priceConfig.worst;
                    const revenue = sellQty * sellPrice;
                    state.products -= sellQty;
                    state.cash += revenue;
                    periodSales += revenue;
                    periodProductsSold += sellQty;
                }
                row++;
                periodRowsUsed++;
                continue;
            }

            // 完成
            if (state.wip > 0 && mc > 0) {
                const completeQty = Math.min(state.wip, mc, GAME_RULES.PRODUCT_BASE - state.products);
                if (completeQty > 0) {
                    state.wip -= completeQty;
                    state.products += completeQty;
                    state.cash -= completeQty * GAME_RULES.PROCESSING_COST;
                    periodProcessingCost += completeQty * GAME_RULES.PROCESSING_COST;

                    const inputQty = Math.min(state.materials, mc - completeQty, GAME_RULES.WIP_CAPACITY - state.wip);
                    if (inputQty > 0) {
                        state.materials -= inputQty;
                        state.wip += inputQty;
                        state.cash -= inputQty * GAME_RULES.PROCESSING_COST;
                        periodProcessingCost += inputQty * GAME_RULES.PROCESSING_COST;
                    }
                    row++;
                    periodRowsUsed++;
                    continue;
                }
            }

            // 投入
            if (state.materials > 0 && mc > 0 && state.wip < GAME_RULES.WIP_CAPACITY) {
                const inputQty = Math.min(state.materials, mc, GAME_RULES.WIP_CAPACITY - state.wip);
                if (inputQty > 0) {
                    state.materials -= inputQty;
                    state.wip += inputQty;
                    state.cash -= inputQty * GAME_RULES.PROCESSING_COST;
                    periodProcessingCost += inputQty * GAME_RULES.PROCESSING_COST;
                    row++;
                    periodRowsUsed++;
                    continue;
                }
            }

            // 仕入れ
            const spaceAvailable = GAME_RULES.MATERIAL_BASE - state.materials;
            const matCost = GAME_RULES.MATERIAL_COST || GAME_RULES.MATERIAL_COST_NORMAL;
            if (spaceAvailable > 0 && state.cash >= matCost.avg) {
                const matUnitCost = matCost.min +
                    Math.floor(Math.random() * (matCost.max - matCost.min + 1));
                const qty = Math.min(spaceAvailable, Math.floor(state.cash / matUnitCost));
                if (qty > 0) {
                    state.materials += qty;
                    state.cash -= qty * matUnitCost;
                    periodMaterialCost += qty * matUnitCost;
                    row++;
                    periodRowsUsed++;
                    continue;
                }
            }

            row++;
        }

        // 期末処理
        const machineCount = state.machinesSmall + (state.machinesLarge || 0);
        const personnelCount = state.workers + state.salesmen;
        const halfWage = Math.round(wage / 2);
        const salaryCost = machineCount * wage + state.workers * wage + state.salesmen * wage + personnelCount * halfWage;

        const newResearchChips = state.newResearchChips || 0;
        const carriedOverResearch = Math.max(0, (state.chips.research || 0) - newResearchChips);
        const nextPeriodResearch = state.nextPeriodChips?.research || 0;

        const chipCost = newResearchChips * 30 + carriedOverResearch * GAME_RULES.CHIP_COST +
                        nextPeriodResearch * GAME_RULES.CHIP_COST +
                        (state.chips.computer || 0) * GAME_RULES.CHIP_COST +
                        (state.chips.insurance || 0) * GAME_RULES.INSURANCE_COST;

        const depreciation = period === 2
            ? state.machinesSmall * 10 + (state.machinesLarge || 0) * 20
            : state.machinesSmall * 20 + (state.machinesLarge || 0) * 40;

        const fixedCost = salaryCost + chipCost + depreciation;
        const grossProfit = periodSales - periodMaterialCost - periodProcessingCost;
        const preTaxProfit = grossProfit - fixedCost;

        const newEquity = state.equity + preTaxProfit;
        let tax = 0;

        if (newEquity > 300) {
            if (!state.hasExceeded300) {
                tax = Math.round((newEquity - 300) * 0.5);
                state.hasExceeded300 = true;
            } else if (preTaxProfit > 0) {
                tax = Math.round(preTaxProfit * 0.5);
            }
        }

        state.cash -= fixedCost + tax;
        if (state.cash < 0) {
            const loanAmount = Math.ceil(-state.cash / 0.8 / 50) * 50;
            state.shortLoans += loanAmount;
            state.cash += loanAmount * 0.8;
        }

        state.equity = newEquity - tax;

        // 期別詳細記録
        periodDetails.push({
            period,
            productsSold: periodProductsSold,
            sales: periodSales,
            avgPrice: periodProductsSold > 0 ? Math.round(periodSales / periodProductsSold) : 0,
            materialCost: periodMaterialCost,
            G: grossProfit,
            F: fixedCost,
            tax,
            equity: state.equity,
            rowsUsed: periodRowsUsed
        });

        totalStats.productsSold += periodProductsSold;
        totalStats.totalSales += periodSales;
        totalStats.totalMaterialCost += periodMaterialCost;
        totalStats.totalF += fixedCost;
        totalStats.totalG += grossProfit;
        totalStats.totalTax += tax;
        totalStats.rowsUsed += periodRowsUsed;
    }

    return { equity: state.equity, details: periodDetails, stats: totalStats };
}

// シナリオ別テスト実行
function runScenarioTest(scenarioName, sellPrices) {
    GAME_RULES.SELL_PRICES = sellPrices;

    const results = [];
    for (let i = 0; i < 200; i++) {
        results.push(runDetailedSimulation(OPTIMAL_STRATEGY));
    }

    const equities = results.map(r => r.equity);
    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
    const best = Math.max(...equities);
    const worst = Math.min(...equities);
    const success = equities.filter(e => e >= 450).length;

    console.log(`\n=== シナリオ${scenarioName} ===`);
    console.log(`平均: ¥${avg}, 最高: ¥${best}, 最低: ¥${worst}`);
    console.log(`¥450達成: ${success}回 (${Math.round(success / 200 * 100)}%)`);

    // 最良結果の詳細
    const bestResult = results.find(r => r.equity === best);
    console.log('最良結果:');
    bestResult.details.forEach(d => {
        console.log(`  ${d.period}期: 販売${d.productsSold}個×¥${d.avgPrice}, G¥${d.G}-F¥${d.F}=¥${d.G-d.F}, 税¥${d.tax} → ¥${d.equity}`);
    });

    return { avg, best, worst, successRate: Math.round(success / 200 * 100) };
}

console.log('=== F2b戦略 シナリオ別分析（各200回） ===');

// 通常仕入れ価格でテスト
GAME_RULES.MATERIAL_COST = GAME_RULES.MATERIAL_COST_NORMAL;
console.log('\n### 仕入れ価格: 通常（¥11-13） ###');
const resultsA = runScenarioTest('A (現実的)', GAME_RULES.SELL_PRICES_A);
const resultsB = runScenarioTest('B (楽観的)', GAME_RULES.SELL_PRICES_B);
const resultsC = runScenarioTest('C (超楽観)', GAME_RULES.SELL_PRICES_C);

// 安い仕入れ価格でテスト
GAME_RULES.MATERIAL_COST = GAME_RULES.MATERIAL_COST_CHEAP;
console.log('\n### 仕入れ価格: 安価（¥10-12） ###');
const resultsA2 = runScenarioTest('A (現実的)', GAME_RULES.SELL_PRICES_A);
const resultsB2 = runScenarioTest('B (楽観的)', GAME_RULES.SELL_PRICES_B);
const resultsC2 = runScenarioTest('C (超楽観)', GAME_RULES.SELL_PRICES_C);

console.log('\n=== 最終サマリー ===');
console.log('仕入れ | 販売 | 平均 | 最高 | 成功率');
console.log(`通常 | 現実A | ¥${resultsA.avg} | ¥${resultsA.best} | ${resultsA.successRate}%`);
console.log(`通常 | 楽観B | ¥${resultsB.avg} | ¥${resultsB.best} | ${resultsB.successRate}%`);
console.log(`通常 | 超楽C | ¥${resultsC.avg} | ¥${resultsC.best} | ${resultsC.successRate}%`);
console.log(`安価 | 現実A | ¥${resultsA2.avg} | ¥${resultsA2.best} | ${resultsA2.successRate}%`);
console.log(`安価 | 楽観B | ¥${resultsB2.avg} | ¥${resultsB2.best} | ${resultsB2.successRate}%`);
console.log(`安価 | 超楽C | ¥${resultsC2.avg} | ¥${resultsC2.best} | ${resultsC2.successRate}%`);

console.log('\n★ 結論 ★');
const allResults = [
    { label: '通常+現実A', ...resultsA },
    { label: '通常+楽観B', ...resultsB },
    { label: '通常+超楽C', ...resultsC },
    { label: '安価+現実A', ...resultsA2 },
    { label: '安価+楽観B', ...resultsB2 },
    { label: '安価+超楽C', ...resultsC2 }
];
allResults.sort((a, b) => b.avg - a.avg);
console.log(`最強組み合わせ: ${allResults[0].label} (平均¥${allResults[0].avg}, 成功率${allResults[0].successRate}%)`);
