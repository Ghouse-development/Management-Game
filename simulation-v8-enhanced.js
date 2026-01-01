/**
 * MG 拡張シミュレーション v8
 *
 * 改善点:
 * - より現実的な入札勝率
 * - 資金管理の最適化
 * - 多様な借入戦略
 * - 人間的な意思決定シミュレーション
 */

// ============================================
// ゲームルール定数
// ============================================
const GAME_RULES = {
    // 容量制限
    WIP_CAPACITY: 10,
    MATERIAL_BASE: 10,
    PRODUCT_BASE: 10,
    WAREHOUSE_BONUS: 12,

    // 機械
    MACHINE: {
        SMALL: { cost: 100, capacity: 1, depreciation: 10, sellPrice: 60 },
        LARGE: { cost: 200, capacity: 4, depreciation: 20, sellPrice: 130 }
    },

    // コスト
    HIRING_COST: 20,
    CHIP_COST: 20,
    INSURANCE_COST: 5,
    WAREHOUSE_COST: 20,
    PROCESSING_COST: 1,

    // 人件費
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },

    // 市場
    MARKETS: {
        SENDAI: { buy: 10, sell: 40 },
        SAPPORO: { buy: 11, sell: 36 },
        FUKUOKA: { buy: 12, sell: 32 },
        NAGOYA: { buy: 13, sell: 28 },
        OSAKA: { buy: 14, sell: 24 },
        TOKYO: { buy: 15, sell: 20 }
    },

    // 行数
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },

    // 借入（1円単位、3期以降）
    LONG_TERM_RATE: 0.10,
    SHORT_TERM_RATE: 0.20,
    getLoanMultiplier: (period, equity) => (period >= 4 && equity > 300) ? 1.0 : 0.5,

    // リスク確率
    RISK_PROBABILITY: 0.06,

    // 目標
    TARGET_EQUITY: 450,

    // 入札勝率（より現実的な設定）
    // 6社が6市場に分散するため、研究チップが多いほど有利
    BID_WIN_RATES: {
        0: { price: 24, winRate: 0.55, market: '大阪' },
        1: { price: 24, winRate: 0.60, market: '大阪' },
        2: { price: 28, winRate: 0.70, market: '名古屋' },
        3: { price: 28, winRate: 0.78, market: '名古屋' },
        4: { price: 32, winRate: 0.82, market: '福岡' },
        5: { price: 36, winRate: 0.88, market: '札幌' }
    }
};

// ============================================
// 戦略定義（拡張）
// ============================================
const STRATEGIES = [
    // === 基本 ===
    { name: 'ZERO', chips: {r:0, e:0, a:0}, nextR: 0, borrow: 0, sm: false },

    // === 研究のみ ===
    { name: 'R1', chips: {r:1, e:0, a:0}, nextR: 0, borrow: 0, sm: false },
    { name: 'R2', chips: {r:2, e:0, a:0}, nextR: 0, borrow: 0, sm: false },
    { name: 'R3', chips: {r:3, e:0, a:0}, nextR: 0, borrow: 0, sm: false },

    // === 教育のみ ===
    { name: 'E1', chips: {r:0, e:1, a:0}, nextR: 0, borrow: 0, sm: false },

    // === R2E1系（最強コア）- 様々な借入額 ===
    { name: 'R2E1', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 0, sm: false },
    { name: 'R2E1_B20', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 20, sm: false },
    { name: 'R2E1_B30', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 30, sm: false },
    { name: 'R2E1_B40', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 40, sm: false },
    { name: 'R2E1_B50', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 50, sm: false },
    { name: 'R2E1_B60', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 60, sm: false },
    { name: 'R2E1_B70', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 70, sm: false },
    { name: 'R2E1_B80', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 80, sm: false },
    { name: 'R2E1_B100', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 100, sm: false },
    { name: 'R2E1_B120', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 120, sm: false },
    { name: 'R2E1_B141', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 141, sm: false }, // 283*0.5=141.5

    // === R2E1+翌期チップ系 ===
    { name: 'R2E1_NR', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 0, sm: false },
    { name: 'R2E1_NR_B20', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 20, sm: false },
    { name: 'R2E1_NR_B30', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 30, sm: false },
    { name: 'R2E1_NR_B40', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 40, sm: false },
    { name: 'R2E1_NR_B50', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 50, sm: false },
    { name: 'R2E1_NR_B60', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 60, sm: false },
    { name: 'R2E1_NR_B70', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 70, sm: false },
    { name: 'R2E1_NR_B80', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 80, sm: false },
    { name: 'R2E1_NR_B100', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 100, sm: false },
    { name: 'R2E1_NR_B120', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 120, sm: false },
    { name: 'R2E1_NR_B141', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 141, sm: false },

    // === R2E1+機械 ===
    { name: 'R2E1_SM', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 0, sm: true },
    { name: 'R2E1_SM_B50', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 50, sm: true },
    { name: 'R2E1_SM_B100', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 100, sm: true },
    { name: 'R2E1_NR_SM', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 0, sm: true },
    { name: 'R2E1_NR_SM_B50', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 50, sm: true },
    { name: 'R2E1_NR_SM_B100', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 100, sm: true },
    { name: 'R2E1_NR_SM_B120', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 120, sm: true },

    // === R3E1系 ===
    { name: 'R3E1', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 0, sm: false },
    { name: 'R3E1_B30', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 30, sm: false },
    { name: 'R3E1_B50', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 50, sm: false },
    { name: 'R3E1_B80', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 80, sm: false },
    { name: 'R3E1_B100', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 100, sm: false },
    { name: 'R3E1_SM', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 0, sm: true },
    { name: 'R3E1_SM_B50', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 50, sm: true },

    // === FULL系 ===
    { name: 'FULL_R2_B50', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 50, sm: true },
    { name: 'FULL_R2_B80', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 80, sm: true },
    { name: 'FULL_R2_B100', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 100, sm: true },
    { name: 'FULL_R2_B120', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 120, sm: true },
    { name: 'FULL_R3_B50', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 50, sm: true },
    { name: 'FULL_R3_B100', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 100, sm: true },

    // === 動的借入 ===
    { name: 'R2E1_DYN', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 'dynamic', sm: false },
    { name: 'R2E1_NR_DYN', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 'dynamic', sm: false },
    { name: 'R2E1_SM_DYN', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 'dynamic', sm: true },
    { name: 'R2E1_NR_SM_DYN', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 'dynamic', sm: true },

    // === 段階的借入（3期と4期で分けて借りる）===
    { name: 'R2E1_NR_B30_B70', chips: {r:2, e:1, a:0}, nextR: 1, borrow: [30, 70], sm: false },
    { name: 'R2E1_NR_B50_B50', chips: {r:2, e:1, a:0}, nextR: 1, borrow: [50, 50], sm: false },
    { name: 'R2E1_NR_B40_B60', chips: {r:2, e:1, a:0}, nextR: 1, borrow: [40, 60], sm: false },
    { name: 'R2E1_NR_SM_B30_B70', chips: {r:2, e:1, a:0}, nextR: 1, borrow: [30, 70], sm: true },

    // === 最大借入（限度額まで借りる）===
    { name: 'R2E1_NR_MAX', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 'max', sm: false },
    { name: 'R2E1_NR_SM_MAX', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 'max', sm: true },
];

// ============================================
// 能力計算
// ============================================
function calcMfgCapacity(state) {
    if (state.workers === 0) return 0;
    const machCap = (state.machinesSmall || 0) + (state.machinesLarge || 0) * 4;
    const numMach = (state.machinesSmall || 0) + (state.machinesLarge || 0);
    if (state.workers < numMach) return state.workers;
    return machCap + (state.chips?.computer || 0) + Math.min(state.chips?.education || 0, state.workers);
}

function calcSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    const base = state.salesmen * 2;
    const eduBonus = Math.min(state.chips?.education || 0, state.salesmen);
    return base + eduBonus;
}

// ============================================
// 借入限度計算
// ============================================
function calcMaxLoan(period, equity) {
    if (period < 3) return 0;
    const multiplier = GAME_RULES.getLoanMultiplier(period, equity);
    return Math.floor(equity * multiplier);
}

// ============================================
// リスクカード処理
// ============================================
function applyRisk(state, period) {
    const r = Math.random();
    if (r < 0.15) {
        state.fCards = (state.fCards || 0) + 1;
    } else if (r < 0.22 && period > 2) {
        state.cash = Math.max(0, state.cash - 30);
    } else if (r < 0.27 && state.chips.research > 0) {
        state.chips.research--;
    } else if (r < 0.32 && state.wip > 0) {
        state.wip--;
    }
}

// ============================================
// 入札シミュレーション
// ============================================
function simulateBid(state, qty) {
    const research = Math.min(state.chips.research || 0, 5);
    const bidInfo = GAME_RULES.BID_WIN_RATES[research];

    const roll = Math.random();
    if (roll < bidInfo.winRate) {
        return { won: true, qty: qty, price: bidInfo.price, revenue: qty * bidInfo.price };
    } else if (roll < bidInfo.winRate + 0.12) {
        const partialQty = Math.max(1, Math.ceil(qty / 2));
        return { won: true, qty: partialQty, price: bidInfo.price, revenue: partialQty * bidInfo.price };
    }
    return { won: false, qty: 0, price: 0, revenue: 0 };
}

// ============================================
// 期シミュレーション
// ============================================
function simulatePeriod(inputState, period, strategy) {
    let state = JSON.parse(JSON.stringify(inputState));
    state.period = period;
    const maxRows = GAME_RULES.MAX_ROWS[period];
    let row = 1;
    let sales = 0, matCost = 0, procCost = 0;

    const wageMulti = period >= 3 ? (0.9 + Math.random() * 0.25) : 1.0;
    const wage = Math.round(GAME_RULES.WAGE_BASE[period] * wageMulti);

    // 翌期チップ適用
    if (state.nextPeriodChips) {
        state.chips.research = (state.chips.research || 0) + (state.nextPeriodChips.research || 0);
        state.chips.education = (state.chips.education || 0) + (state.nextPeriodChips.education || 0);
        state.nextPeriodChips = { research: 0, education: 0 };
    }

    // === 借入処理（3期以降）===
    if (period >= 3) {
        const maxLoan = calcMaxLoan(period, state.equity);
        let targetBorrow = 0;

        if (strategy.borrow === 'dynamic') {
            // 現金が少ない時のみ借りる
            if (state.cash < 60) {
                targetBorrow = Math.min(80, maxLoan);
            }
        } else if (strategy.borrow === 'max') {
            // 限度額まで借りる
            targetBorrow = maxLoan;
        } else if (Array.isArray(strategy.borrow)) {
            // 段階的借入
            if (period === 3) targetBorrow = strategy.borrow[0];
            else if (period === 4) targetBorrow = strategy.borrow[1];
        } else {
            targetBorrow = strategy.borrow || 0;
        }

        if (targetBorrow > 0) {
            const borrowAmount = Math.min(targetBorrow, maxLoan - state.loans);
            if (borrowAmount > 0) {
                state.loans += borrowAmount;
                state.cash += borrowAmount - Math.floor(borrowAmount * GAME_RULES.LONG_TERM_RATE);
                row++;
            }
        }
    }

    // === PC・保険 ===
    state.chips.computer = 1;
    state.chips.insurance = 1;
    state.cash -= GAME_RULES.CHIP_COST + GAME_RULES.INSURANCE_COST;
    row++;

    // === 2期：チップ購入 ===
    if (period === 2) {
        for (let i = 0; i < (strategy.chips.r || 0) && state.cash >= GAME_RULES.CHIP_COST; i++) {
            state.chips.research = (state.chips.research || 0) + 1;
            state.cash -= GAME_RULES.CHIP_COST;
            row++;
        }
        for (let i = 0; i < (strategy.chips.e || 0) && state.cash >= GAME_RULES.CHIP_COST; i++) {
            state.chips.education = (state.chips.education || 0) + 1;
            state.cash -= GAME_RULES.CHIP_COST;
            row++;
        }
        for (let i = 0; i < (strategy.nextR || 0) && state.cash >= GAME_RULES.CHIP_COST; i++) {
            state.nextPeriodChips = state.nextPeriodChips || {};
            state.nextPeriodChips.research = (state.nextPeriodChips.research || 0) + 1;
            state.cash -= GAME_RULES.CHIP_COST;
            row++;
        }
    }

    // === 3期：機械投資 ===
    if (period === 3 && strategy.sm && state.cash >= GAME_RULES.MACHINE.SMALL.cost + GAME_RULES.HIRING_COST) {
        state.machinesSmall++;
        state.cash -= GAME_RULES.MACHINE.SMALL.cost;
        state.workers++;
        state.cash -= GAME_RULES.HIRING_COST;
        row++;
    }

    // === メインループ ===
    const mc = calcMfgCapacity(state);
    const sc = calcSalesCapacity(state);

    while (row < maxRows) {
        if (Math.random() < GAME_RULES.RISK_PROBABILITY) {
            applyRisk(state, period);
            row++;
            continue;
        }

        // 販売優先
        if (state.products > 0 && sc > 0) {
            const sellQty = Math.min(state.products, sc);
            const bidResult = simulateBid(state, sellQty);
            if (bidResult.won) {
                state.products -= bidResult.qty;
                state.cash += bidResult.revenue;
                sales += bidResult.revenue;
            }
            row++;
            continue;
        }

        // 完成
        if (state.wip > 0 && mc > 0) {
            const qty = Math.min(state.wip, mc, GAME_RULES.PRODUCT_BASE - state.products);
            if (qty > 0) {
                state.wip -= qty;
                state.products += qty;
                state.cash -= qty;
                procCost += qty;

                const inpQty = Math.min(state.materials, mc, GAME_RULES.WIP_CAPACITY - state.wip);
                if (inpQty > 0) {
                    state.materials -= inpQty;
                    state.wip += inpQty;
                    state.cash -= inpQty;
                    procCost += inpQty;
                }
            }
            row++;
            continue;
        }

        // 投入
        if (state.materials > 0 && state.wip < GAME_RULES.WIP_CAPACITY && mc > 0) {
            const qty = Math.min(state.materials, mc, GAME_RULES.WIP_CAPACITY - state.wip);
            if (qty > 0) {
                state.materials -= qty;
                state.wip += qty;
                state.cash -= qty;
                procCost += qty;
            }
            row++;
            continue;
        }

        // 仕入れ
        const space = GAME_RULES.MATERIAL_BASE - state.materials;
        if (space > 0 && state.cash >= 10) {
            // 安い市場から順に試行
            const prices = [10, 11, 12, 13, 14, 15];
            const winProbs = [0.20, 0.28, 0.35, 0.40, 0.45, 0.50];

            let bought = false;
            for (let i = 0; i < prices.length && !bought; i++) {
                const price = prices[i];
                if (state.cash >= price && Math.random() < winProbs[i]) {
                    const qty = Math.min(mc * 2, space, Math.floor(state.cash / price));
                    if (qty > 0) {
                        state.materials += qty;
                        state.cash -= qty * price;
                        matCost += qty * price;
                        bought = true;
                    }
                }
            }
            row++;
            continue;
        }

        break;
    }

    // === 期末計算 ===
    const machCount = (state.machinesSmall || 0) + (state.machinesLarge || 0);
    const persCount = (state.workers || 0) + (state.salesmen || 0);
    const machCost = machCount * wage;
    const persCost = persCount * wage;
    const deprec = (state.machinesSmall || 0) * 10 + (state.machinesLarge || 0) * 20;
    const chipCost = ((state.chips.research || 0) + (state.chips.education || 0) + 1) * 20 + 5;

    const fixedCost = machCost + persCost + deprec + chipCost;
    const MQ = sales - matCost - procCost;
    const opProfit = MQ - fixedCost;
    const interest = Math.floor((state.loans || 0) * GAME_RULES.LONG_TERM_RATE);
    const preTax = opProfit - interest;

    let tax = 0;
    const newEq = state.equity + preTax;
    if (newEq > 300) {
        if (!state.hasExceeded300) {
            tax = Math.round((newEq - 300) * 0.5);
            state.hasExceeded300 = true;
        } else if (preTax > 0) {
            tax = Math.round(preTax * 0.5);
        }
    }

    state.cash -= fixedCost + tax;

    if (state.cash < 0) {
        const loan = Math.ceil(-state.cash / 40) * 50;
        state.shortLoans = (state.shortLoans || 0) + loan;
        state.cash += loan * 0.8;
    }

    state.equity = newEq - tax;
    state.salesThisPeriod = sales;

    return state;
}

// ============================================
// ゲームシミュレーション
// ============================================
function simulateGame(strategy) {
    let state = {
        period: 2,
        cash: 112,
        equity: 283,
        loans: 0,
        shortLoans: 0,
        workers: 1,
        salesmen: 1,
        machinesSmall: 1,
        machinesLarge: 0,
        materials: 1,
        wip: 2,
        products: 1,
        chips: { research: 0, education: 0, computer: 0, insurance: 0 },
        nextPeriodChips: { research: 0, education: 0 },
        hasExceeded300: false,
        fCards: 0
    };

    for (let period = 2; period <= 5; period++) {
        state = simulatePeriod(state, period, strategy);
    }

    return {
        success: state.equity >= GAME_RULES.TARGET_EQUITY,
        finalEquity: state.equity,
        finalCash: state.cash,
        loans: state.loans,
        shortLoans: state.shortLoans
    };
}

// ============================================
// メイン実行
// ============================================
function runSimulations(runs = 1000) {
    console.log(`\n=== MG拡張シミュレーション v8 ===`);
    console.log(`実行回数: ${runs}回/戦略`);
    console.log(`戦略数: ${STRATEGIES.length}`);
    console.log(`総実行回数: ${runs * STRATEGIES.length}回\n`);

    const results = [];

    for (const strategy of STRATEGIES) {
        let successCount = 0;
        let totalEquity = 0;
        let maxEquity = -9999;
        let minEquity = 9999;
        let bankruptCount = 0;

        for (let i = 0; i < runs; i++) {
            const result = simulateGame(strategy);
            if (result.success) successCount++;
            if (result.shortLoans > 0) bankruptCount++;
            totalEquity += result.finalEquity;
            maxEquity = Math.max(maxEquity, result.finalEquity);
            minEquity = Math.min(minEquity, result.finalEquity);
        }

        results.push({
            name: strategy.name,
            successRate: (successCount / runs * 100).toFixed(2),
            avgEquity: Math.round(totalEquity / runs),
            maxEquity,
            minEquity,
            bankruptRate: (bankruptCount / runs * 100).toFixed(2),
            strategy
        });
    }

    results.sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));

    console.log('=== 成功率ランキング TOP 20 ===\n');
    console.log('順位 | 戦略名                    | 成功率  | 平均資本 | 最高 | 最低 | 破産率');
    console.log('-'.repeat(85));

    for (let i = 0; i < Math.min(20, results.length); i++) {
        const r = results[i];
        console.log(
            `${(i + 1).toString().padStart(2)}   | ` +
            `${r.name.padEnd(25)} | ` +
            `${r.successRate.padStart(6)}% | ` +
            `¥${r.avgEquity.toString().padStart(4)} | ` +
            `¥${r.maxEquity.toString().padStart(4)} | ` +
            `¥${r.minEquity.toString().padStart(4)} | ` +
            `${r.bankruptRate}%`
        );
    }

    // 勝ち戦略と負け戦略
    const winningStrategies = results.filter(r => parseFloat(r.successRate) >= 70);
    const losingStrategies = results.filter(r => parseFloat(r.successRate) < 15);

    console.log('\n=== 勝ち戦略（成功率70%以上）===');
    if (winningStrategies.length === 0) {
        console.log('該当なし（最高: ' + results[0].name + ' ' + results[0].successRate + '%）');
    } else {
        for (const w of winningStrategies) {
            console.log(`${w.name}: ${w.successRate}%`);
        }
    }

    console.log('\n=== 負け戦略（成功率15%未満）===');
    for (const l of losingStrategies) {
        console.log(`${l.name}: ${l.successRate}%`);
    }

    // 借入額別分析
    console.log('\n=== 借入額別分析（R2E1_NR系）===');
    const borrowAnalysis = results.filter(r => r.name.startsWith('R2E1_NR_B') && !r.name.includes('SM'));
    for (const b of borrowAnalysis.slice(0, 10)) {
        console.log(`${b.name}: ${b.successRate}% (平均: ¥${b.avgEquity})`);
    }

    return { results, winningStrategies, losingStrategies };
}

const { results, winningStrategies, losingStrategies } = runSimulations(1000);

// JSON出力
console.log('\n=== JSON出力 ===');
console.log(JSON.stringify({
    top5: results.slice(0, 5).map(r => ({ name: r.name, successRate: r.successRate, avgEquity: r.avgEquity })),
    winning: winningStrategies.map(r => r.name),
    losing: losingStrategies.map(r => r.name)
}, null, 2));
