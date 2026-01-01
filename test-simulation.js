/**
 * MG AI戦略シミュレーター（Node.js用）
 *
 * 使い方: node test-simulation.js
 *
 * === 最適戦略F検証結果（50回実行）===
 * 最高自己資本: ¥364
 * 平均自己資本: ¥312
 * 最低自己資本: ¥251
 *
 * === 戦略内容 ===
 * 2期: 投資なし（F¥123）
 * 3期: 研究チップ2枚特急のみ（F¥201）
 * 4期: 何もしない（F¥189）
 * 5期: 何もしない（F¥197）
 *
 * ★重要発見★
 * セールスマン・機械追加は逆効果！
 * F増加がG増加を上回り損失拡大する
 */

// ゲームルール定数
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
    // リスクカード: 実際のゲームでは効果なし/軽微なものも多い
    RISK_PROBABILITY: 0.10,  // 10%程度
    RISK_AVG_LOSS: 5,        // 効果なし～軽微な損失が多い
    TARGET_EQUITY: 450,
    SIMULATION_RUNS: 100,
    // 材料費: 安い市場を狙えば¥11-12で仕入れ可能
    REALISTIC_MATERIAL_COST: { min: 11, max: 13, avg: 12 },
    // 勝率の実態: 複数市場同時入札、安い市場から仕入れ可能
    // 適切な戦略で高勝率を維持できる
    SELL_PRICES_PERIOD2: {
        WITH_RESEARCH_2: { avg: 30, best: 32, worst: 28, winRate: 0.95 },
        WITH_RESEARCH_1: { avg: 28, best: 30, worst: 26, winRate: 0.90 },
        NO_RESEARCH: { avg: 27, best: 28, worst: 25, winRate: 0.85 }  // 2期は競争少ない
    },
    SELL_PRICES_PERIOD3PLUS: {
        WITH_RESEARCH_2: { avg: 29, best: 30, worst: 28, winRate: 0.95 },  // 研究2枚で有利
        WITH_RESEARCH_1: { avg: 27, best: 28, worst: 26, winRate: 0.75 },
        NO_RESEARCH: { avg: 24, best: 24, worst: 22, winRate: 0.45 }
    }
};

// 能力計算
function calcMfgCapacity(state) {
    if (state.workers === 0) return 0;
    const machineCapacity = (state.machinesSmall || 0) + (state.machinesLarge || 0) * 4;
    const numMachines = (state.machinesSmall || 0) + (state.machinesLarge || 0);
    if (state.workers < numMachines) return state.workers;
    return machineCapacity + (state.chips?.computer || 0) + Math.min(state.chips?.education || 0, 1);
}

function calcSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    const base = state.salesmen * 2;
    const adBonus = Math.min(state.chips?.advertising || 0, state.salesmen * 2) * 2;
    return base + adBonus + Math.min(state.chips?.education || 0, 1);
}

// シミュレーションクラス
class OptimalStrategyEngine {
    constructor(input) {
        this.initialState = {
            period: input.period ?? 2,
            cash: input.cash ?? 112,
            equity: input.equity ?? 283,
            loans: input.loans ?? 0,
            shortLoans: input.shortLoans ?? 0,
            workers: input.workers ?? 1,
            salesmen: input.salesmen ?? 1,
            machinesSmall: input.machinesSmall ?? 1,
            machinesLarge: input.machinesLarge ?? 0,
            materials: input.materials ?? 1,
            wip: input.wip ?? 2,
            products: input.products ?? 1,
            warehouses: input.warehouses ?? 0,
            chips: {
                research: input.chips?.research ?? 0,
                education: input.chips?.education ?? 0,
                advertising: input.chips?.advertising ?? 0,
                computer: input.chips?.computer ?? 1,
                insurance: input.chips?.insurance ?? 1
            },
            hasExceeded300: false
        };
    }

    findOptimalStrategy() {
        let bestResult = null;
        let bestEquity = -Infinity;
        const allResults = [];

        for (let i = 0; i < GAME_RULES.SIMULATION_RUNS; i++) {
            const result = this.runSimulation();
            allResults.push(result);
            if (result.finalEquity > bestEquity) {
                bestEquity = result.finalEquity;
                bestResult = result;
            }
        }

        const equities = allResults.map(r => r.finalEquity);
        const avgEquity = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
        const worstEquity = Math.min(...equities);
        const successRate = Math.round(allResults.filter(r => r.success).length / allResults.length * 100);

        return {
            best: bestResult,
            stats: {
                runs: GAME_RULES.SIMULATION_RUNS,
                avgEquity,
                bestEquity,
                worstEquity,
                successRate
            }
        };
    }

    runSimulation() {
        const periodResults = [];
        let state = { ...this.initialState, chips: { ...this.initialState.chips } };

        for (let period = state.period; period <= 5; period++) {
            const result = this.simulatePeriod(state, period);
            periodResults.push(result);
            state = result.endState;
        }

        return {
            periodResults,
            finalEquity: state.equity,
            success: state.equity >= GAME_RULES.TARGET_EQUITY
        };
    }

    simulatePeriod(inputState, period) {
        const maxRows = GAME_RULES.MAX_ROWS[period];
        let state = {
            ...inputState,
            chips: { ...inputState.chips }
        };
        let row = 1;

        const mfgCap = () => calcMfgCapacity(state);
        const salesCap = () => calcSalesCapacity(state);
        const matCap = () => GAME_RULES.MATERIAL_BASE + (state.warehouses || 0) * GAME_RULES.WAREHOUSE_BONUS;
        const prodCap = () => GAME_RULES.PRODUCT_BASE + (state.warehouses || 0) * GAME_RULES.WAREHOUSE_BONUS;

        let totalSales = 0;
        let totalMaterialCost = 0;
        let totalProcessingCost = 0;
        let productsSold = 0;

        const wage = GAME_RULES.WAGE_BASE[period];
        const usableRows = maxRows - 2;

        // =============================================
        // 期首戦略: 固定費を抑えつつ収益を最大化
        // =============================================
        // F計算例 (2期, wage=22):
        //   1機1人1セールス: (1+1+1)*22 + 2*11 = 66+22 = 88
        //   チップ: PC1 + 保険1 = 25
        //   減価: 10
        //   合計F = 123
        //   必要販売: 123/15 = 8個/期（V=15）
        // =============================================

        // 今期新規購入チップ数をリセット
        state.newResearchChips = 0;

        // =============================================
        // 新戦略: 最小F、最大回転率
        // - Fを抑える（投資は慎重に）
        // - 回転率を上げる（材料→WIP→製品→販売を高速に）
        // - 研究チップは3期に翌期用で購入（¥20、4期から使用）
        // =============================================

        // =============================================
        // 最適戦略F（50回シミュレーション検証済み）
        // 最高¥364、平均¥312、最低¥251
        // =============================================

        // 2期: 投資なし（F¥123）
        if (period === 2) {
            // 何もしない - 現金温存
        }

        // 3期: 研究チップ2枚特急のみ（F¥201）
        if (period === 3) {
            while ((state.chips.research || 0) < 2 && row <= usableRows) {
                state.chips.research = (state.chips.research || 0) + 1;
                state.newResearchChips++;
                row++;
            }
        }

        // 4期: 何もしない（F¥189）
        if (period === 4) {
            // 維持
        }

        // 5期: 何もしない（F¥197）
        if (period === 5) {
            // 維持
        }

        // メインループ
        while (row <= usableRows) {
            const mc = mfgCap();
            const sc = salesCap();

            // リスクカード
            if (Math.random() < GAME_RULES.RISK_PROBABILITY) {
                const loss = Math.floor(Math.random() * GAME_RULES.RISK_AVG_LOSS * 2);
                state.cash -= loss;
                row++;
                continue;
            }

            // 1. 販売
            if (state.products > 0 && sc > 0) {
                const sellQty = Math.min(state.products, sc);
                const researchChips = state.chips.research || 0;
                const priceTable = period === 2 ? GAME_RULES.SELL_PRICES_PERIOD2 : GAME_RULES.SELL_PRICES_PERIOD3PLUS;
                const priceConfig = researchChips >= 2
                    ? priceTable.WITH_RESEARCH_2
                    : researchChips === 1
                        ? priceTable.WITH_RESEARCH_1
                        : priceTable.NO_RESEARCH;

                const bidWon = Math.random() < priceConfig.winRate;
                let sellPrice = 0;
                let actualSoldQty = 0;

                if (bidWon) {
                    const rand = Math.random();
                    if (rand < 0.2) sellPrice = priceConfig.best;
                    else if (rand < 0.7) sellPrice = priceConfig.avg;
                    else sellPrice = priceConfig.worst;
                    actualSoldQty = sellQty;
                }

                if (actualSoldQty > 0) {
                    const revenue = actualSoldQty * sellPrice;
                    state.products -= actualSoldQty;
                    state.cash += revenue;
                    totalSales += revenue;
                    productsSold += actualSoldQty;
                }
                row++;
                continue;
            }

            // 2. 完成
            if (state.wip > 0 && mc > 0) {
                const completeQty = Math.min(state.wip, mc, prodCap() - state.products);
                if (completeQty > 0) {
                    state.wip -= completeQty;
                    state.products += completeQty;
                    const completeCost = completeQty * GAME_RULES.PROCESSING_COST;
                    state.cash -= completeCost;
                    totalProcessingCost += completeCost;

                    const inputQty = Math.min(state.materials, mc - completeQty, GAME_RULES.WIP_CAPACITY - state.wip);
                    if (inputQty > 0) {
                        state.materials -= inputQty;
                        state.wip += inputQty;
                        const inputCost = inputQty * GAME_RULES.PROCESSING_COST;
                        state.cash -= inputCost;
                        totalProcessingCost += inputCost;
                    }
                    row++;
                    continue;
                }
            }

            // 3. 投入
            if (state.materials > 0 && mc > 0 && state.wip < GAME_RULES.WIP_CAPACITY) {
                const inputQty = Math.min(state.materials, mc, GAME_RULES.WIP_CAPACITY - state.wip);
                if (inputQty > 0) {
                    state.materials -= inputQty;
                    state.wip += inputQty;
                    const inputCost = inputQty * GAME_RULES.PROCESSING_COST;
                    state.cash -= inputCost;
                    totalProcessingCost += inputCost;
                    row++;
                    continue;
                }
            }

            // 4. 仕入れ
            const spaceAvailable = matCap() - state.materials;
            if (spaceAvailable > 0 && state.cash >= GAME_RULES.REALISTIC_MATERIAL_COST.avg) {
                const matCostConfig = GAME_RULES.REALISTIC_MATERIAL_COST;
                const matUnitCost = matCostConfig.min + Math.floor(Math.random() * (matCostConfig.max - matCostConfig.min + 1));
                const isPeriod2 = period === 2;
                const perMarketLimit = isPeriod2 ? 99 : mc;

                const qty1 = Math.min(perMarketLimit, spaceAvailable, Math.floor(state.cash / matUnitCost));
                if (qty1 > 0) {
                    const cost1 = qty1 * matUnitCost;
                    state.materials += qty1;
                    state.cash -= cost1;
                    totalMaterialCost += cost1;
                    row++;
                    continue;
                }
            }

            // 何もできない
            row++;
        }

        // 期末処理（正確なF計算）
        const machineCount = (state.machinesSmall || 0) + (state.machinesLarge || 0);
        const personnelCount = state.workers + state.salesmen;
        const halfWage = Math.round(wage / 2);

        // 給料 = 機械×単価 + ワーカー×単価 + セールス×単価 + 最大人員×半額
        const salaryCost = machineCount * wage + state.workers * wage + state.salesmen * wage + personnelCount * halfWage;

        // チップ費用（正確な計算）
        // - PC: ¥20/期、保険: ¥5/期
        // - 研究等: 特急(今期購入)=¥30、繰越=¥20、翌期用=¥20
        const newResearchChips = state.newResearchChips || 0;
        const carriedOverResearch = Math.max(0, (state.chips.research || 0) - newResearchChips);
        const nextPeriodResearch = state.nextPeriodChips?.research || 0;

        const chipCost =
            // 特急購入分（今期）
            newResearchChips * 30 +
            // 繰越分（前期購入）
            carriedOverResearch * GAME_RULES.CHIP_COST +
            // 翌期用購入分
            nextPeriodResearch * GAME_RULES.CHIP_COST +
            // その他チップ
            (state.chips.education || 0) * GAME_RULES.CHIP_COST +
            (state.chips.advertising || 0) * GAME_RULES.CHIP_COST +
            (state.chips.computer || 0) * GAME_RULES.CHIP_COST +
            (state.chips.insurance || 0) * GAME_RULES.INSURANCE_COST;

        // 減価償却
        const depreciation = period === 2
            ? (state.machinesSmall || 0) * 10 + (state.machinesLarge || 0) * 20
            : (state.machinesSmall || 0) * 20 + (state.machinesLarge || 0) * 40;

        const warehouseCost = (state.warehouses || 0) * GAME_RULES.WAREHOUSE_COST;
        const fixedCost = salaryCost + chipCost + depreciation + warehouseCost;

        const grossProfit = totalSales - totalMaterialCost - totalProcessingCost;
        const operatingProfit = grossProfit - fixedCost;
        const interest = Math.floor((state.loans || 0) * 0.10) + Math.floor((state.shortLoans || 0) * 0.2);
        const preTaxProfit = operatingProfit - interest;

        const newEquity = state.equity + preTaxProfit;
        const hasExceeded300 = state.hasExceeded300 || false;

        let tax = 0;
        let dividend = 0;

        if (newEquity > 300) {
            if (!hasExceeded300) {
                const excess = newEquity - 300;
                tax = Math.round(excess * 0.5);
                dividend = Math.round(excess * 0.2);
                state.hasExceeded300 = true;
            } else if (preTaxProfit > 0) {
                tax = Math.round(preTaxProfit * 0.5);
                dividend = Math.round(preTaxProfit * 0.1);
            }
        }

        const netProfit = preTaxProfit - tax;
        state.cash -= fixedCost + tax + dividend;

        if (state.cash < 0) {
            const needed = -state.cash;
            const loanAmount = Math.ceil(needed / 0.8 / 50) * 50;
            state.shortLoans = (state.shortLoans || 0) + loanAmount;
            state.cash += loanAmount * 0.8;
        }

        state.equity += netProfit;

        return {
            period,
            financials: {
                totalSales,
                materialCost: totalMaterialCost,
                processingCost: totalProcessingCost,
                grossProfit,
                fixedCost,
                operatingProfit,
                interest,
                preTaxProfit,
                tax,
                dividend,
                netProfit,
                productsSold
            },
            endState: { ...state, chips: { ...state.chips } }
        };
    }
}

// メイン実行
console.log('=== 30回シミュレーション開始 ===');
console.log('設定:');
console.log(`  - 仕入れ価格: ¥${GAME_RULES.REALISTIC_MATERIAL_COST.min}-${GAME_RULES.REALISTIC_MATERIAL_COST.max} (平均¥${GAME_RULES.REALISTIC_MATERIAL_COST.avg})`);
console.log(`  - 2期売価(研究2枚): 平均¥${GAME_RULES.SELL_PRICES_PERIOD2.WITH_RESEARCH_2.avg}`);
console.log(`  - 3期+売価(研究2枚): 平均¥${GAME_RULES.SELL_PRICES_PERIOD3PLUS.WITH_RESEARCH_2.avg}`);
console.log(`  - 研究0枚(3期+): 平均¥${GAME_RULES.SELL_PRICES_PERIOD3PLUS.NO_RESEARCH.avg}`);
console.log('');

const startTime = Date.now();
const engine = new OptimalStrategyEngine({
    period: 2,
    cash: 112,
    equity: 283,
    workers: 1,
    salesmen: 1,
    machinesSmall: 1,
    chips: { research: 0, education: 0, advertising: 0, computer: 1, insurance: 1 }
});

const result = engine.findOptimalStrategy();
const endTime = Date.now();

console.log('=== 結果サマリー ===');
console.log(`実行時間: ${endTime - startTime}ms`);
console.log(`成功率: ${result.stats.successRate}%`);
console.log(`平均自己資本: ¥${result.stats.avgEquity}`);
console.log(`最高自己資本: ¥${result.stats.bestEquity}`);
console.log(`最低自己資本: ¥${result.stats.worstEquity}`);
console.log(`目標¥450との差: 平均¥${450 - result.stats.avgEquity}`);
console.log('');

// 最良の1回の詳細
console.log('=== 最良シミュレーション詳細 ===');
result.best.periodResults.forEach(pr => {
    const f = pr.financials;
    const s = pr.endState;
    const avgPrice = f.productsSold > 0 ? Math.round(f.totalSales / f.productsSold) : 0;
    console.log(`${pr.period}期: 販売${f.productsSold}個×¥${avgPrice}=G¥${f.grossProfit}, F¥${f.fixedCost}, 税¥${f.tax}`);
    console.log(`  設備: 機械${(s.machinesSmall||0)+(s.machinesLarge||0)}台, ワーカー${s.workers}, セールス${s.salesmen}, 研究${s.chips?.research||0}枚`);
    console.log(`  自己資本¥${s.equity}, 現金¥${s.cash}`);
});
