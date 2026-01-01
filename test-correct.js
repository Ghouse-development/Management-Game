/**
 * MG 正確なルールに基づくシミュレーション
 * constants.jsのルールを完全に反映
 */

// ============================================
// 正式なゲームルール（constants.jsから）
// ============================================
const RULES = {
    // 行数
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },

    // 基本給料
    BASE_SALARY: { 2: 22, 3: 24, 4: 26, 5: 28 },

    // 3期以降の給料倍率（サイコロ1-3=1.1、4-6=1.2）
    WAGE_MULTIPLIER: { low: 1.1, high: 1.2 },

    // チップコスト
    CHIP_COST: {
        normal: 20,     // 翌期チップ
        express: 40,    // 特急チップ
        computer: 20,
        insurance: 5
    },

    // 減価償却
    DEPRECIATION: {
        small: { period2: 10, period3plus: 20 },
        large: { period2: 20, period3plus: 40 }
    },

    // 借入金利
    INTEREST: {
        long: 0.10,
        short: 0.20
    },

    // 市場（仕入れ価格）
    MARKETS: {
        sendai: 10, sapporo: 11, fukuoka: 12,
        nagoya: 13, osaka: 14, tokyo: 15, overseas: 16
    },

    // リスクカード確率（64枚中）
    RISK_CARDS: {
        researchSuccess: { count: 6, prob: 6/64 },   // 研究開発成功: 32円販売
        researchFail: { count: 3, prob: 3/64 },      // 研究開発失敗: チップ返却
        educationSuccess: { count: 2, prob: 2/64 },  // 教育成功: 32円販売
        advertisingSuccess: { count: 3, prob: 3/64 },// 広告成功: 独占販売
        consumerMovement: { count: 2, prob: 2/64 },  // 消費者運動: 販売不可
        bankruptcy: { count: 2, prob: 2/64 },        // 得意先倒産: -30円
        strike: { count: 2, prob: 2/64 },            // ストライキ: 1回休み
        longStrike: { count: 2, prob: 2/64 },        // 長期紛争: 2回休み
        otherCost: { count: 14, prob: 14/64 },       // その他コスト系
        otherBenefit: { count: 5, prob: 5/64 },      // その他ベネフィット
        noEffect: { count: 23, prob: 23/64 }         // 効果なし/軽微
    },

    // 生産コスト
    PRODUCTION_COST: 1,

    // 税金
    TAX_THRESHOLD: 300,
    TAX_RATE: 0.5
};

// ============================================
// 初期状態（2期開始時）
// ============================================
function getInitialState() {
    return {
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
        chips: {
            research: 0,
            education: 0,
            advertising: 0,
            computer: 1,
            insurance: 1
        },
        nextPeriodChips: { research: 0 },
        shortLoans: 0,
        longLoans: 0,
        hasExceeded300: false
    };
}

// ============================================
// 能力計算
// ============================================
function calcMfgCapacity(state) {
    if (state.workers === 0) return 0;
    const machineCapacity = state.machinesSmall + state.machinesLarge * 4;
    return machineCapacity + (state.chips.computer || 0);
}

function calcSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2;
}

// ============================================
// 戦略定義
// ============================================
const STRATEGIES = {
    // 2期翌期チップ2枚（F2b）- 最強候補
    'F2b': {
        period2: { nextResearch: 2 },
        period3: {},
        period4: {},
        period5: {}
    },
    // 3期特急2枚（F）
    'F_express': {
        period2: {},
        period3: { expressResearch: 2 },
        period4: {},
        period5: {}
    },
    // 最小投資（何もしない）
    'MIN': {
        period2: {},
        period3: {},
        period4: {},
        period5: {}
    },
    // 2期翌期2枚 + 5期セールス
    'F2b+5S': {
        period2: { nextResearch: 2 },
        period3: {},
        period4: {},
        period5: { salesman: 1 }
    },
    // 2期翌期3枚
    'F2b_3': {
        period2: { nextResearch: 3 },
        period3: {},
        period4: {},
        period5: {}
    },
    // 2期翌期1枚 + 3期翌期1枚
    'F2b_1+F3b_1': {
        period2: { nextResearch: 1 },
        period3: { nextResearch: 1 },
        period4: {},
        period5: {}
    },
    // 2期翌期2枚 + 3期特急1枚
    'F2b+3exp': {
        period2: { nextResearch: 2 },
        period3: { expressResearch: 1 },
        period4: {},
        period5: {}
    },
    // 3期翌期2枚
    'F3b': {
        period2: {},
        period3: { nextResearch: 2 },
        period4: {},
        period5: {}
    }
};

// ============================================
// シミュレーション実行
// ============================================
function runSimulation(strategy) {
    let state = getInitialState();

    for (let period = 2; period <= 5; period++) {
        const maxRows = RULES.MAX_ROWS[period];
        const usableRows = maxRows - 2;  // 期首処理で1行使用
        let row = 1;

        // 給料計算（3期以降はサイコロで倍率決定）
        const baseSalary = RULES.BASE_SALARY[period];
        const wageMultiplier = period >= 3
            ? (Math.random() < 0.5 ? RULES.WAGE_MULTIPLIER.low : RULES.WAGE_MULTIPLIER.high)
            : 1.0;
        const wage = Math.round(baseSalary * wageMultiplier);

        // 戦略適用
        const periodKey = `period${period}`;
        const strat = strategy[periodKey] || {};

        // 翌期チップ適用（前期に購入したもの）
        if (state.nextPeriodChips.research > 0) {
            state.chips.research += state.nextPeriodChips.research;
            state.nextPeriodChips.research = 0;
        }

        // 特急チップ購入
        let newExpressChips = 0;
        if (strat.expressResearch) {
            newExpressChips = strat.expressResearch;
            state.chips.research += newExpressChips;
            row += newExpressChips;
        }

        // 翌期チップ購入
        let newNextChips = 0;
        if (strat.nextResearch) {
            newNextChips = strat.nextResearch;
            state.nextPeriodChips.research = newNextChips;
            row += newNextChips;
        }

        // セールスマン追加
        if (strat.salesman) {
            state.salesmen += strat.salesman;
            state.cash -= strat.salesman * 5;
            row += strat.salesman;
        }

        // 生産・販売ループ
        let totalSales = 0;
        let totalMaterialCost = 0;
        let totalProcessingCost = 0;
        let productsSold = 0;
        let riskCardBonus = 0;

        const mc = () => calcMfgCapacity(state);
        const sc = () => calcSalesCapacity(state);

        while (row <= usableRows) {
            // リスクカード判定（約10%でリスクカード）
            // 64枚中、実際に行動を妨げるのは一部
            if (Math.random() < 0.10) {
                const roll = Math.random();

                // 研究開発成功（6/64 = 9.4%）
                if (roll < RULES.RISK_CARDS.researchSuccess.prob && state.chips.research > 0) {
                    const sellQty = Math.min(state.products, state.chips.research * 2, 5, sc());
                    if (sellQty > 0) {
                        const bonus = sellQty * 32;
                        state.products -= sellQty;
                        state.cash += bonus;
                        riskCardBonus += bonus;
                        productsSold += sellQty;
                    }
                }
                // 得意先倒産（2/64 = 3.1%、2期免除）
                else if (roll < 0.12 && period > 2) {
                    state.cash -= 30;
                }
                // その他軽微なコスト
                else if (roll < 0.25) {
                    state.cash -= Math.floor(Math.random() * 10);
                }

                row++;
                continue;
            }

            // 販売
            if (state.products > 0 && sc() > 0) {
                const sellQty = Math.min(state.products, sc());
                const researchChips = state.chips.research || 0;

                // 入札価格決定（研究チップで優位、高価格市場狙い）
                // 仙台40、札幌36、福岡32、名古屋28が上限
                // 研究チップ2枚で札幌¥34-36狙い（妥当な設定）
                let winRate, avgPrice;
                if (period === 2) {
                    // 2期: 競争少なく研究2枚で¥35-36狙い
                    if (researchChips >= 2) { winRate = 0.92; avgPrice = 35; }
                    else if (researchChips >= 1) { winRate = 0.85; avgPrice = 31; }
                    else { winRate = 0.80; avgPrice = 27; }
                } else {
                    // 3期以降: 研究2枚で¥33-35狙い
                    if (researchChips >= 2) { winRate = 0.82; avgPrice = 34; }
                    else if (researchChips >= 1) { winRate = 0.68; avgPrice = 29; }
                    else { winRate = 0.42; avgPrice = 24; }
                }

                if (Math.random() < winRate) {
                    // 価格のばらつき
                    const priceVariance = Math.floor(Math.random() * 3) - 1;
                    const sellPrice = avgPrice + priceVariance;
                    const revenue = sellQty * sellPrice;

                    state.products -= sellQty;
                    state.cash += revenue;
                    totalSales += revenue;
                    productsSold += sellQty;
                }
                row++;
                continue;
            }

            // 完成（仕掛品→製品）
            if (state.wip > 0 && mc() > 0) {
                const completeQty = Math.min(state.wip, mc(), 10 - state.products);
                if (completeQty > 0) {
                    state.wip -= completeQty;
                    state.products += completeQty;
                    state.cash -= completeQty * RULES.PRODUCTION_COST;
                    totalProcessingCost += completeQty * RULES.PRODUCTION_COST;

                    // 同時投入
                    const inputQty = Math.min(state.materials, mc() - completeQty, 10 - state.wip);
                    if (inputQty > 0) {
                        state.materials -= inputQty;
                        state.wip += inputQty;
                        state.cash -= inputQty * RULES.PRODUCTION_COST;
                        totalProcessingCost += inputQty * RULES.PRODUCTION_COST;
                    }
                    row++;
                    continue;
                }
            }

            // 投入（材料→仕掛品）
            if (state.materials > 0 && mc() > 0 && state.wip < 10) {
                const inputQty = Math.min(state.materials, mc(), 10 - state.wip);
                if (inputQty > 0) {
                    state.materials -= inputQty;
                    state.wip += inputQty;
                    state.cash -= inputQty * RULES.PRODUCTION_COST;
                    totalProcessingCost += inputQty * RULES.PRODUCTION_COST;
                    row++;
                    continue;
                }
            }

            // 仕入れ（安い市場優先：仙台¥10、札幌¥11、福岡¥12）
            const spaceAvailable = 10 - state.materials;
            if (spaceAvailable > 0 && state.cash >= 10) {
                // 市場価格: 10-12が主流（安い市場を狙う）
                const matUnitCost = 10 + Math.floor(Math.random() * 3);
                // 仕入れは製造能力に関係なく可能（mc制限削除）
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

        // ===== 期末処理 =====

        // F（固定費）計算
        const machineCount = state.machinesSmall + state.machinesLarge;
        const personnelCount = state.workers + state.salesmen;
        const halfWage = Math.round(wage / 2);

        // 給料 = 機械×給料 + ワーカー×給料 + セールス×給料 + 人員×ボーナス
        const salaryCost = machineCount * wage + state.workers * wage +
                          state.salesmen * wage + personnelCount * halfWage;

        // チップ維持費
        // 特急チップ: ¥40、翌期チップ: ¥20、繰越チップ: ¥20
        const expressChipCost = newExpressChips * RULES.CHIP_COST.express;
        const nextChipCost = newNextChips * RULES.CHIP_COST.normal;
        const carriedChipCost = Math.max(0, state.chips.research - newExpressChips) * RULES.CHIP_COST.normal;
        const otherChipCost = (state.chips.computer || 0) * RULES.CHIP_COST.computer +
                             (state.chips.insurance || 0) * RULES.CHIP_COST.insurance;
        const chipCost = expressChipCost + nextChipCost + carriedChipCost + otherChipCost;

        // 減価償却
        const depreciation = period === 2
            ? state.machinesSmall * RULES.DEPRECIATION.small.period2 +
              state.machinesLarge * RULES.DEPRECIATION.large.period2
            : state.machinesSmall * RULES.DEPRECIATION.small.period3plus +
              state.machinesLarge * RULES.DEPRECIATION.large.period3plus;

        // 借入金利息
        const longInterest = Math.floor(state.longLoans * RULES.INTEREST.long);
        // 短期借入は借入時に20%差し引き済み

        const fixedCost = salaryCost + chipCost + depreciation;

        // G（粗利）= 売上 - 材料費 - 加工費
        const grossProfit = totalSales + riskCardBonus - totalMaterialCost - totalProcessingCost;

        // 税引前利益
        const preTaxProfit = grossProfit - fixedCost - longInterest;

        // 税金計算
        const newEquity = state.equity + preTaxProfit;
        let tax = 0;

        if (newEquity > RULES.TAX_THRESHOLD) {
            if (!state.hasExceeded300) {
                tax = Math.round((newEquity - RULES.TAX_THRESHOLD) * RULES.TAX_RATE);
                state.hasExceeded300 = true;
            } else if (preTaxProfit > 0) {
                tax = Math.round(preTaxProfit * RULES.TAX_RATE);
            }
        }

        // 現金支払い
        state.cash -= fixedCost + longInterest + tax;

        // 現金不足時は短期借入
        if (state.cash < 0) {
            const loanAmount = Math.ceil(-state.cash / 0.8 / 50) * 50;
            state.shortLoans += loanAmount;
            state.cash += loanAmount * 0.8;  // 20%利息差引
        }

        state.equity = newEquity - tax;
    }

    return state.equity;
}

// ============================================
// メイン実行
// ============================================
console.log('=== 正確なルールでのシミュレーション（各100回） ===\n');

const RUNS = 500;
const results = {};

for (const [name, strategy] of Object.entries(STRATEGIES)) {
    const equities = [];
    for (let i = 0; i < RUNS; i++) {
        equities.push(runSimulation(strategy));
    }

    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
    const best = Math.max(...equities);
    const worst = Math.min(...equities);
    const success = equities.filter(e => e >= 450).length;

    results[name] = { avg, best, worst, success, successRate: Math.round(success / RUNS * 100) };
}

// ソート
const sorted = Object.entries(results).sort((a, b) => b[1].avg - a[1].avg);

console.log('順位 | 戦略 | 平均 | 最高 | 最低 | ¥450達成');
console.log('-----|------|------|------|------|--------');
sorted.forEach(([name, r], i) => {
    console.log(`${i + 1}位 | ${name} | ¥${r.avg} | ¥${r.best} | ¥${r.worst} | ${r.success}回(${r.successRate}%)`);
});

console.log('\n=== 詳細なF計算（2期） ===');
console.log('給料: 機械1×¥22 + ワーカー1×¥22 + セールス1×¥22 + 人員2×¥11 = ¥88');
console.log('チップ: コンピュータ¥20 + 保険¥5 = ¥25');
console.log('減価償却: 小型機械¥10 = ¥10');
console.log('合計F: ¥123');

console.log('\n=== リスクカード効果 ===');
console.log('研究開発成功(6/64=9.4%): 青チップ×2個を¥32で販売（最高5個）');
console.log('→ 研究2枚で毎期約10%の確率で4個×¥32=¥128ボーナス！');

// 詳細分析
console.log('\n=== 1回の詳細シミュレーション ===');
function runDetailedSimulation(strategy) {
    let state = getInitialState();
    let log = [];

    for (let period = 2; period <= 5; period++) {
        const startEquity = state.equity;
        const startCash = state.cash;

        const maxRows = RULES.MAX_ROWS[period];
        const usableRows = maxRows - 2;
        let row = 1;
        let periodSales = 0;
        let periodProducts = 0;
        let periodF = 0;

        const baseSalary = RULES.BASE_SALARY[period];
        const wageMultiplier = period >= 3 ? 1.15 : 1.0;
        const wage = Math.round(baseSalary * wageMultiplier);

        const periodKey = `period${period}`;
        const strat = strategy[periodKey] || {};

        if (state.nextPeriodChips.research > 0) {
            state.chips.research += state.nextPeriodChips.research;
            state.nextPeriodChips.research = 0;
        }

        let newExpressChips = 0;
        if (strat.expressResearch) {
            newExpressChips = strat.expressResearch;
            state.chips.research += newExpressChips;
            row += newExpressChips;
        }

        let newNextChips = 0;
        if (strat.nextResearch) {
            newNextChips = strat.nextResearch;
            state.nextPeriodChips.research = newNextChips;
            row += newNextChips;
        }

        if (strat.salesman) {
            state.salesmen += strat.salesman;
            state.cash -= strat.salesman * 5;
            row += strat.salesman;
        }

        let totalSales = 0;
        let totalMaterialCost = 0;
        let totalProcessingCost = 0;
        let productsSold = 0;

        while (row <= usableRows) {
            // 販売
            if (state.products > 0 && state.salesmen > 0) {
                const sellQty = Math.min(state.products, state.salesmen * 2);
                const researchChips = state.chips.research || 0;

                // 高価格市場狙い（仙台40、札幌36、福岡32）
                let winRate, avgPrice;
                if (period === 2) {
                    // 2期: 競争少なく研究2枚で¥35-36狙い
                    winRate = researchChips >= 2 ? 0.92 : researchChips >= 1 ? 0.85 : 0.80;
                    avgPrice = researchChips >= 2 ? 35 : researchChips >= 1 ? 31 : 27;
                } else {
                    // 3期以降: 研究2枚で¥33-35狙い
                    winRate = researchChips >= 2 ? 0.82 : researchChips >= 1 ? 0.68 : 0.42;
                    avgPrice = researchChips >= 2 ? 34 : researchChips >= 1 ? 29 : 24;
                }

                if (Math.random() < winRate) {
                    const sellPrice = avgPrice + Math.floor(Math.random() * 3) - 1;
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
            const mfgCap = state.machinesSmall + state.machinesLarge * 4 + (state.chips.computer || 0);
            if (state.wip > 0 && mfgCap > 0) {
                const completeQty = Math.min(state.wip, mfgCap, 10 - state.products);
                if (completeQty > 0) {
                    state.wip -= completeQty;
                    state.products += completeQty;
                    state.cash -= completeQty;
                    totalProcessingCost += completeQty;

                    const inputQty = Math.min(state.materials, mfgCap - completeQty, 10 - state.wip);
                    if (inputQty > 0) {
                        state.materials -= inputQty;
                        state.wip += inputQty;
                        state.cash -= inputQty;
                        totalProcessingCost += inputQty;
                    }
                    row++;
                    continue;
                }
            }

            // 投入
            if (state.materials > 0 && mfgCap > 0 && state.wip < 10) {
                const inputQty = Math.min(state.materials, mfgCap, 10 - state.wip);
                if (inputQty > 0) {
                    state.materials -= inputQty;
                    state.wip += inputQty;
                    state.cash -= inputQty;
                    totalProcessingCost += inputQty;
                    row++;
                    continue;
                }
            }

            // 仕入れ
            const spaceAvailable = 10 - state.materials;
            if (spaceAvailable > 0 && state.cash >= 10) {
                const matUnitCost = 11;
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
        const machineCount = state.machinesSmall + state.machinesLarge;
        const personnelCount = state.workers + state.salesmen;
        const halfWage = Math.round(wage / 2);
        const salaryCost = machineCount * wage + state.workers * wage + state.salesmen * wage + personnelCount * halfWage;

        const expressChipCost = newExpressChips * 40;
        const nextChipCost = newNextChips * 20;
        const carriedChipCost = Math.max(0, state.chips.research - newExpressChips) * 20;
        const otherChipCost = (state.chips.computer || 0) * 20 + (state.chips.insurance || 0) * 5;
        const chipCost = expressChipCost + nextChipCost + carriedChipCost + otherChipCost;

        const depreciation = period === 2
            ? state.machinesSmall * 10 + state.machinesLarge * 20
            : state.machinesSmall * 20 + state.machinesLarge * 40;

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

        log.push(`${period}期: 販売${productsSold}個×¥${productsSold > 0 ? Math.round(totalSales/productsSold) : 0}=¥${totalSales}, G¥${grossProfit}, F¥${fixedCost}, 税¥${tax} → 自己資本¥${state.equity}`);
    }

    return { equity: state.equity, log };
}

const detail = runDetailedSimulation(STRATEGIES['F2b']);
detail.log.forEach(l => console.log(l));
console.log(`\n最終自己資本: ¥${detail.equity}`);
