/**
 * MG 戦略パターン比較テスト
 * 100回×複数パターンでシミュレーション
 */

const GAME_RULES = {
    WIP_CAPACITY: 10,
    MATERIAL_BASE: 10,
    PRODUCT_BASE: 10,
    WAREHOUSE_BONUS: 12,
    CHIP_COST: 20,
    INSURANCE_COST: 5,
    PROCESSING_COST: 1,
    WAREHOUSE_COST: 20,
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    RISK_PROBABILITY: 0.10,
    RISK_AVG_LOSS: 5,
    SIMULATION_RUNS: 200,
    REALISTIC_MATERIAL_COST: { min: 11, max: 13, avg: 12 },
    SELL_PRICES_PERIOD2: {
        WITH_RESEARCH_2: { avg: 30, best: 32, worst: 28, winRate: 0.95 },
        WITH_RESEARCH_1: { avg: 28, best: 30, worst: 26, winRate: 0.90 },
        NO_RESEARCH: { avg: 27, best: 28, worst: 25, winRate: 0.85 }
    },
    SELL_PRICES_PERIOD3PLUS: {
        WITH_RESEARCH_2: { avg: 29, best: 30, worst: 28, winRate: 0.95 },
        WITH_RESEARCH_1: { avg: 27, best: 28, worst: 26, winRate: 0.75 },
        NO_RESEARCH: { avg: 24, best: 24, worst: 22, winRate: 0.45 }
    }
};

// 戦略パターン定義（24パターン）
const STRATEGIES = {
    // 基本戦略
    'F: 最小投資（研究2枚のみ）': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // 2期バリエーション
    'F2a: 2期翌期チップ1枚': {
        period2: { nextResearch: 1, salesman: 0, machine: 0 },
        period3: { research: 1, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    'F2b: 2期翌期チップ2枚': {
        period2: { nextResearch: 2, salesman: 0, machine: 0 },
        period3: { research: 0, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // ===== F2bベース最適化パターン =====
    'F2b+4S: 2期翌期2枚+4期セールス': {
        period2: { nextResearch: 2, salesman: 0, machine: 0 },
        period3: { research: 0, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 1, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    'F2b+5S: 2期翌期2枚+5期セールス': {
        period2: { nextResearch: 2, salesman: 0, machine: 0 },
        period3: { research: 0, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 1, machine: 0 }
    },
    'F2b+5M: 2期翌期2枚+5期機械': {
        period2: { nextResearch: 2, salesman: 0, machine: 0 },
        period3: { research: 0, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 1 }
    },
    'F2b+3R: 2期翌期2枚+3期追加研究': {
        period2: { nextResearch: 2, salesman: 0, machine: 0 },
        period3: { research: 3, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    'F2b+4R: 2期翌期2枚+4期研究追加': {
        period2: { nextResearch: 2, salesman: 0, machine: 0 },
        period3: { research: 0, salesman: 0, machine: 0 },
        period4: { research: 3, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    'F2b+2S: 2期翌期2枚+2期セールス': {
        period2: { nextResearch: 2, salesman: 1, machine: 0 },
        period3: { research: 0, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // ===== 3期翌期チップパターン =====
    'F3b: 3期翌期チップ2枚': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { nextResearch: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // ===== F2b+F3b組み合わせ =====
    'F2+3b: 2期翌期2枚+3期翌期2枚': {
        period2: { nextResearch: 2, salesman: 0, machine: 0 },
        period3: { nextResearch: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    'F2+3b+5S: 翌期チップ連続+5期セールス': {
        period2: { nextResearch: 2, salesman: 0, machine: 0 },
        period3: { nextResearch: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 1, machine: 0 }
    },
    // ===== 4期翌期チップパターン =====
    'F4b: 4期翌期チップ2枚': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 2, salesman: 0, machine: 0 },
        period4: { nextResearch: 2, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    'FULL翌期: 全期翌期チップ2枚': {
        period2: { nextResearch: 2, salesman: 0, machine: 0 },
        period3: { nextResearch: 2, salesman: 0, machine: 0 },
        period4: { nextResearch: 2, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // ===== F3bベース最適化 =====
    'F3b+5S: 3期翌期2枚+5期セールス': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { nextResearch: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 1, machine: 0 }
    },
    'F3b+4S: 3期翌期2枚+4期セールス': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { nextResearch: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 1, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    'F3b+4R: 3期翌期2枚+4期研究追加': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { nextResearch: 2, salesman: 0, machine: 0 },
        period4: { research: 3, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // ===== 2期研究+3期翌期 ハイブリッド =====
    'HYBRID: 2期研究1枚+3期翌期2枚': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 1, nextResearch: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    'HYBRID2: 3期特急1枚+翌期2枚': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 1, nextResearch: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // 4期バリエーション
    'F4a: 4期セールス1人': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 1, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // 5期バリエーション
    'F5a: 5期セールス1人': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 1, machine: 0 }
    },
    'F5b: 5期機械1台': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 1 }
    },
    // 研究チップなし
    'X: 研究なし（完全最小）': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 0, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // 研究1枚バリエーション
    'E1: 研究1枚のみ': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 1, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // 3期投資バリエーション
    'B3a: 3期セールス追加': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 2, salesman: 1, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    'B3b: 3期機械追加': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 2, salesman: 0, machine: 1 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // 4期投資バリエーション
    'C4a: 4期機械追加': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 1 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    // 複合戦略
    'M1: 3期セールス+5期機械': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 2, salesman: 1, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 1 }
    },
    'M2: 4期セールス+5期セールス': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 1, machine: 0 },
        period5: { research: 0, salesman: 1, machine: 0 }
    },
    // 極端な戦略
    'Z1: 全期何もしない': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 0, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    'Z2: 2期全力投資': {
        period2: { research: 0, salesman: 1, machine: 0 },
        period3: { research: 2, salesman: 0, machine: 0 },
        period4: { research: 0, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 0, machine: 0 }
    },
    'Z3: 遅延投資（5期集中）': {
        period2: { research: 0, salesman: 0, machine: 0 },
        period3: { research: 0, salesman: 0, machine: 0 },
        period4: { research: 2, salesman: 0, machine: 0 },
        period5: { research: 0, salesman: 1, machine: 1 }
    }
};

function calcMfgCapacity(state) {
    if (state.workers === 0) return 0;
    const machineCapacity = (state.machinesSmall || 0) + (state.machinesLarge || 0) * 4;
    const numMachines = (state.machinesSmall || 0) + (state.machinesLarge || 0);
    if (state.workers < numMachines) return state.workers;
    return machineCapacity + (state.chips?.computer || 0);
}

function calcSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2;
}

function runSimulation(strategy) {
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

    for (let period = 2; period <= 5; period++) {
        const maxRows = GAME_RULES.MAX_ROWS[period];
        const usableRows = maxRows - 2;
        let row = 1;
        const wage = GAME_RULES.WAGE_BASE[period];

        // 戦略適用
        const periodKey = `period${period}`;
        const strat = strategy[periodKey] || {};

        state.newResearchChips = 0;

        // 翌期用チップ（2期）
        if (strat.nextResearch) {
            state.nextPeriodChips.research = strat.nextResearch;
            row += strat.nextResearch;
        }

        // 繰越チップを適用
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

        // セールスマン追加
        if (strat.salesman && state.cash >= 5) {
            state.salesmen += strat.salesman;
            state.cash -= strat.salesman * 5;
            row += strat.salesman;
        }

        // 機械追加
        if (strat.machine && state.cash >= 100) {
            state.machinesSmall += strat.machine;
            state.cash -= strat.machine * 100;
            row += strat.machine;
            // ワーカーも追加
            if (state.workers < state.machinesSmall && state.cash >= 5) {
                state.workers += 1;
                state.cash -= 5;
                row++;
            }
        }

        // 生産・販売ループ
        let totalSales = 0;
        let totalMaterialCost = 0;
        let totalProcessingCost = 0;
        let productsSold = 0;

        const mfgCap = () => calcMfgCapacity(state);
        const salesCap = () => calcSalesCapacity(state);
        const matCap = () => GAME_RULES.MATERIAL_BASE;
        const prodCap = () => GAME_RULES.PRODUCT_BASE;

        while (row <= usableRows) {
            const mc = mfgCap();
            const sc = salesCap();

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
                const priceTable = period === 2 ? GAME_RULES.SELL_PRICES_PERIOD2 : GAME_RULES.SELL_PRICES_PERIOD3PLUS;
                const priceConfig = researchChips >= 2 ? priceTable.WITH_RESEARCH_2 :
                                   researchChips === 1 ? priceTable.WITH_RESEARCH_1 : priceTable.NO_RESEARCH;

                if (Math.random() < priceConfig.winRate) {
                    const rand = Math.random();
                    const sellPrice = rand < 0.2 ? priceConfig.best : rand < 0.7 ? priceConfig.avg : priceConfig.worst;
                    const revenue = sellQty * sellPrice;
                    state.products -= sellQty;
                    state.cash += revenue;
                    totalSales += revenue;
                    productsSold += sellQty;
                }
                row++;
                continue;
            }

            // 完成
            if (state.wip > 0 && mc > 0) {
                const completeQty = Math.min(state.wip, mc, prodCap() - state.products);
                if (completeQty > 0) {
                    state.wip -= completeQty;
                    state.products += completeQty;
                    state.cash -= completeQty * GAME_RULES.PROCESSING_COST;
                    totalProcessingCost += completeQty * GAME_RULES.PROCESSING_COST;

                    const inputQty = Math.min(state.materials, mc - completeQty, GAME_RULES.WIP_CAPACITY - state.wip);
                    if (inputQty > 0) {
                        state.materials -= inputQty;
                        state.wip += inputQty;
                        state.cash -= inputQty * GAME_RULES.PROCESSING_COST;
                        totalProcessingCost += inputQty * GAME_RULES.PROCESSING_COST;
                    }
                    row++;
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
                    totalProcessingCost += inputQty * GAME_RULES.PROCESSING_COST;
                    row++;
                    continue;
                }
            }

            // 仕入れ
            const spaceAvailable = matCap() - state.materials;
            if (spaceAvailable > 0 && state.cash >= GAME_RULES.REALISTIC_MATERIAL_COST.avg) {
                const matCostConfig = GAME_RULES.REALISTIC_MATERIAL_COST;
                const matUnitCost = matCostConfig.min + Math.floor(Math.random() * (matCostConfig.max - matCostConfig.min + 1));
                const qty = Math.min(spaceAvailable, Math.floor(state.cash / matUnitCost));
                if (qty > 0) {
                    state.materials += qty;
                    state.cash -= qty * matUnitCost;
                    totalMaterialCost += qty * matUnitCost;
                    row++;
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
        const grossProfit = totalSales - totalMaterialCost - totalProcessingCost;
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
    }

    return state.equity;
}

// メイン実行
console.log('=== 100回×24パターン シミュレーション ===\n');

const results = [];

for (const [name, strategy] of Object.entries(STRATEGIES)) {
    const equities = [];
    for (let i = 0; i < GAME_RULES.SIMULATION_RUNS; i++) {
        equities.push(runSimulation(strategy));
    }

    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
    const best = Math.max(...equities);
    const worst = Math.min(...equities);
    const successRate = Math.round(equities.filter(e => e >= 450).length / equities.length * 100);

    results.push({ name, avg, best, worst, successRate });
}

// ソート（平均で）
results.sort((a, b) => b.avg - a.avg);

console.log('=== 結果ランキング（平均自己資本順）===\n');
console.log('順位 | 戦略 | 平均 | 最高 | 最低 | 成功率');
console.log('-----|------|------|------|------|-------');

results.forEach((r, i) => {
    console.log(`${i + 1}位 | ${r.name} | ¥${r.avg} | ¥${r.best} | ¥${r.worst} | ${r.successRate}%`);
});

console.log('\n=== 最適戦略 ===');
console.log(`${results[0].name}`);
console.log(`平均: ¥${results[0].avg}, 最高: ¥${results[0].best}, 最低: ¥${results[0].worst}`);
