/**
 * MG 包括的シミュレーション v7
 *
 * 全ての要素をテスト:
 * - 借入（1円単位、様々な金額）
 * - 採用・解雇
 * - 機械売買
 * - 戦略チップ購入
 * - 翌期チップ
 * - 倉庫購入・移動
 * - 配置転換
 * - 材料仕入れ（価格選択）
 * - リスクカード対応
 * - 借入返済
 * - 6社競争環境
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
    REALLOCATION_COST: 5,

    // 人件費基準
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },

    // 市場価格
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

    // 借入
    LONG_TERM_RATE: 0.10,
    SHORT_TERM_RATE: 0.20,
    // 借入限度: 自己資本 × 倍率（1円単位）
    // 4期以降 かつ 自己資本300超: 1.0（100%）
    // それ以外: 0.5（50%）
    getLoanMultiplier: (period, equity) => (period >= 4 && equity > 300) ? 1.0 : 0.5,

    // リスク確率
    RISK_PROBABILITY: 0.08,
    RISK_TYPES: [
        { name: 'f_card', prob: 0.15, effect: 'F行追加' },
        { name: 'cash_loss', prob: 0.10, effect: '現金-30' },
        { name: 'research_loss', prob: 0.05, effect: '研究-1' },
        { name: 'wip_loss', prob: 0.05, effect: '仕掛品-1' },
        { name: 'product_loss', prob: 0.05, effect: '製品-1' },
        { name: 'material_loss', prob: 0.05, effect: '材料-1' },
        { name: 'nothing', prob: 0.55, effect: '影響なし' }
    ],

    // 目標
    TARGET_EQUITY: 450,

    // 入札勝率（6社競争）
    BID_WIN_RATES: {
        0: { price: 24, winRate: 0.45, market: '大阪' },
        1: { price: 24, winRate: 0.55, market: '大阪' },
        2: { price: 28, winRate: 0.65, market: '名古屋' },
        3: { price: 28, winRate: 0.75, market: '名古屋' },
        4: { price: 32, winRate: 0.80, market: '福岡' },
        5: { price: 36, winRate: 0.85, market: '札幌' }
    }
};

// ============================================
// 戦略定義
// ============================================
const STRATEGIES = [
    // === 基本戦略 ===
    { name: 'ZERO', chips: {r:0, e:0, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: false, desc: '何もしない' },

    // === 研究重視 ===
    { name: 'R1', chips: {r:1, e:0, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: false },
    { name: 'R2', chips: {r:2, e:0, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: false },
    { name: 'R3', chips: {r:3, e:0, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: false },
    { name: 'R4', chips: {r:4, e:0, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: false },

    // === 教育重視 ===
    { name: 'E1', chips: {r:0, e:1, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: false },
    { name: 'E2', chips: {r:0, e:2, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: false },

    // === R2E1系（最強コア）===
    { name: 'R2E1', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: false },
    { name: 'R2E1_B30', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 30, sm: false, warehouse: false },
    { name: 'R2E1_B50', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 50, sm: false, warehouse: false },
    { name: 'R2E1_B80', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 80, sm: false, warehouse: false },
    { name: 'R2E1_B100', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 100, sm: false, warehouse: false },
    { name: 'R2E1_NR', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 0, sm: false, warehouse: false },
    { name: 'R2E1_NR_B30', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 30, sm: false, warehouse: false },
    { name: 'R2E1_NR_B50', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 50, sm: false, warehouse: false },
    { name: 'R2E1_NR_B80', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 80, sm: false, warehouse: false },
    { name: 'R2E1_NR_B100', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 100, sm: false, warehouse: false },
    { name: 'R2E1_SM', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 0, sm: true, warehouse: false },
    { name: 'R2E1_SM_B50', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 50, sm: true, warehouse: false },
    { name: 'R2E1_NR_SM', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 0, sm: true, warehouse: false },
    { name: 'R2E1_NR_SM_B50', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 50, sm: true, warehouse: false },
    { name: 'R2E1_WH', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: true },
    { name: 'R2E1_NR_WH', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 0, sm: false, warehouse: true },

    // === R3E1系 ===
    { name: 'R3E1', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: false },
    { name: 'R3E1_B30', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 30, sm: false, warehouse: false },
    { name: 'R3E1_B50', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 50, sm: false, warehouse: false },
    { name: 'R3E1_B80', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 80, sm: false, warehouse: false },
    { name: 'R3E1_SM', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 0, sm: true, warehouse: false },
    { name: 'R3E1_SM_B50', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 50, sm: true, warehouse: false },

    // === R2E2系 ===
    { name: 'R2E2', chips: {r:2, e:2, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: false },
    { name: 'R2E2_B50', chips: {r:2, e:2, a:0}, nextR: 0, borrow: 50, sm: false, warehouse: false },

    // === FULL系（研究+教育+機械+借入）===
    { name: 'FULL_R2_B50', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 50, sm: true, warehouse: false },
    { name: 'FULL_R2_B100', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 100, sm: true, warehouse: false },
    { name: 'FULL_R3_B50', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 50, sm: true, warehouse: false },
    { name: 'FULL_R3_B100', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 100, sm: true, warehouse: false },

    // === 広告戦略 ===
    { name: 'R2E1A1', chips: {r:2, e:1, a:1}, nextR: 0, borrow: 0, sm: false, warehouse: false },
    { name: 'R2E1A1_B50', chips: {r:2, e:1, a:1}, nextR: 0, borrow: 50, sm: false, warehouse: false },

    // === 借入最適化（動的借入）===
    { name: 'R2E1_DYNAMIC', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 'dynamic', sm: false, warehouse: false },
    { name: 'R2E1_SM_DYNAMIC', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 'dynamic', sm: true, warehouse: false },

    // === 攻撃的戦略（機械売却→研究） ===
    { name: 'SELL_SM_R3E1', chips: {r:3, e:1, a:0}, nextR: 0, borrow: 0, sm: false, warehouse: false, sellSmallMachine: true },

    // === 追加採用戦略 ===
    { name: 'R2E1_HIRE', chips: {r:2, e:1, a:0}, nextR: 0, borrow: 50, sm: false, warehouse: false, hireWorker: true },
    { name: 'R2E1_NR_HIRE', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 50, sm: false, warehouse: false, hireWorker: true },

    // === 倉庫活用戦略 ===
    { name: 'R2E1_NR_WH_B50', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 50, sm: false, warehouse: true },

    // === 早期借入返済戦略 ===
    { name: 'R2E1_B50_REPAY', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 50, sm: false, warehouse: false, earlyRepay: true },

    // === 配置転換戦略 ===
    { name: 'R2E1_REALLOC', chips: {r:2, e:1, a:0}, nextR: 1, borrow: 50, sm: false, warehouse: false, reallocation: true },
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
    const adBonus = (state.chips?.advertising || 0);
    return base + eduBonus + adBonus;
}

function calcMaterialCapacity(state) {
    const base = GAME_RULES.MATERIAL_BASE;
    const whBonus = (state.warehouseMaterial || 0) * GAME_RULES.WAREHOUSE_BONUS;
    return base + whBonus;
}

function calcProductCapacity(state) {
    const base = GAME_RULES.PRODUCT_BASE;
    const whBonus = (state.warehouseProduct || 0) * GAME_RULES.WAREHOUSE_BONUS;
    return base + whBonus;
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
    let cumProb = 0;

    for (const risk of GAME_RULES.RISK_TYPES) {
        cumProb += risk.prob;
        if (r < cumProb) {
            switch (risk.name) {
                case 'f_card':
                    state.fCards = (state.fCards || 0) + 1;
                    break;
                case 'cash_loss':
                    if (period > 2) state.cash = Math.max(0, state.cash - 30);
                    break;
                case 'research_loss':
                    if (state.chips.research > 0) state.chips.research--;
                    break;
                case 'wip_loss':
                    if (state.wip > 0) state.wip--;
                    break;
                case 'product_loss':
                    if (state.products > 0) state.products--;
                    break;
                case 'material_loss':
                    if (state.materials > 0) state.materials--;
                    break;
            }
            state.lastRisk = risk.name;
            return risk.name;
        }
    }
    return 'nothing';
}

// ============================================
// 入札シミュレーション（6社競争）
// ============================================
function simulateBid(state, qty) {
    const research = Math.min(state.chips.research || 0, 5);
    const bidInfo = GAME_RULES.BID_WIN_RATES[research];

    // 6社競争での勝率調整
    // 他社も研究チップを持っている可能性を考慮
    const baseWinRate = bidInfo.winRate;

    // 入札数が多いほど部分的に勝つ可能性
    const roll = Math.random();
    if (roll < baseWinRate) {
        // 全部勝ち
        return { won: true, qty: qty, price: bidInfo.price, revenue: qty * bidInfo.price };
    } else if (roll < baseWinRate + 0.15) {
        // 部分的に勝ち（半分）
        const partialQty = Math.ceil(qty / 2);
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

    // 人件費（ランダム変動）
    const wageMulti = period >= 3 ? (0.9 + Math.random() * 0.3) : 1.0;
    const wage = Math.round(GAME_RULES.WAGE_BASE[period] * wageMulti);

    // ============================================
    // 期首処理
    // ============================================

    // 翌期チップ適用
    if (state.nextPeriodChips) {
        state.chips.research = (state.chips.research || 0) + (state.nextPeriodChips.research || 0);
        state.chips.education = (state.chips.education || 0) + (state.nextPeriodChips.education || 0);
        state.nextPeriodChips = { research: 0, education: 0 };
    }

    // === 借入（3期以降）===
    if (period >= 3 && strategy.borrow !== 'dynamic') {
        const targetBorrow = strategy.borrow || 0;
        if (targetBorrow > 0 && state.loans < targetBorrow) {
            const maxLoan = calcMaxLoan(period, state.equity);
            const borrowAmount = Math.min(targetBorrow - state.loans, maxLoan - state.loans);
            if (borrowAmount > 0) {
                state.loans += borrowAmount;
                state.cash += borrowAmount - Math.floor(borrowAmount * GAME_RULES.LONG_TERM_RATE);
                row++;
            }
        }
    } else if (period >= 3 && strategy.borrow === 'dynamic') {
        // 動的借入：現金が少ない時に最適額を借りる
        if (state.cash < 80) {
            const maxLoan = calcMaxLoan(period, state.equity);
            const needAmount = Math.min(100 - state.cash, maxLoan - state.loans);
            if (needAmount > 0) {
                state.loans += needAmount;
                state.cash += needAmount - Math.floor(needAmount * GAME_RULES.LONG_TERM_RATE);
                row++;
            }
        }
    }

    // === PC・保険 ===
    state.chips.computer = 1;
    state.chips.insurance = 1;
    state.cash -= GAME_RULES.CHIP_COST + GAME_RULES.INSURANCE_COST;
    row++;

    // === 2期：戦略チップ購入 ===
    if (period === 2) {
        // 研究チップ
        for (let i = 0; i < (strategy.chips.r || 0) && state.cash >= GAME_RULES.CHIP_COST; i++) {
            state.chips.research = (state.chips.research || 0) + 1;
            state.cash -= GAME_RULES.CHIP_COST;
            row++;
        }
        // 教育チップ
        for (let i = 0; i < (strategy.chips.e || 0) && state.cash >= GAME_RULES.CHIP_COST; i++) {
            state.chips.education = (state.chips.education || 0) + 1;
            state.cash -= GAME_RULES.CHIP_COST;
            row++;
        }
        // 広告チップ
        for (let i = 0; i < (strategy.chips.a || 0) && state.cash >= GAME_RULES.CHIP_COST; i++) {
            state.chips.advertising = (state.chips.advertising || 0) + 1;
            state.cash -= GAME_RULES.CHIP_COST;
            row++;
        }
        // 翌期チップ
        for (let i = 0; i < (strategy.nextR || 0) && state.cash >= GAME_RULES.CHIP_COST; i++) {
            state.nextPeriodChips = state.nextPeriodChips || {};
            state.nextPeriodChips.research = (state.nextPeriodChips.research || 0) + 1;
            state.cash -= GAME_RULES.CHIP_COST;
            row++;
        }
    }

    // === 3期：機械投資・採用 ===
    if (period === 3) {
        // 機械売却（攻撃的戦略）
        if (strategy.sellSmallMachine && state.machinesSmall > 0 && state.workers > 0) {
            state.machinesSmall--;
            state.workers--; // 機械と一緒にワーカーも減らす
            state.cash += GAME_RULES.MACHINE.SMALL.sellPrice;
            row++;
        }

        // 小型機械追加
        if (strategy.sm && state.cash >= GAME_RULES.MACHINE.SMALL.cost + GAME_RULES.HIRING_COST) {
            state.machinesSmall++;
            state.cash -= GAME_RULES.MACHINE.SMALL.cost;
            state.workers++;
            state.cash -= GAME_RULES.HIRING_COST;
            row++;
        }

        // 追加採用
        if (strategy.hireWorker && state.cash >= GAME_RULES.HIRING_COST) {
            state.workers++;
            state.cash -= GAME_RULES.HIRING_COST;
            row++;
        }

        // 倉庫購入
        if (strategy.warehouse && state.cash >= GAME_RULES.WAREHOUSE_COST) {
            state.warehouseMaterial = 1;
            state.cash -= GAME_RULES.WAREHOUSE_COST;
            row++;
        }
    }

    // === 配置転換（販売員不足時） ===
    if (strategy.reallocation && period >= 3) {
        const sc = calcSalesCapacity(state);
        const mc = calcMfgCapacity(state);
        if (sc < mc && state.workers > 1 && state.cash >= GAME_RULES.REALLOCATION_COST) {
            state.workers--;
            state.salesmen++;
            state.cash -= GAME_RULES.REALLOCATION_COST;
            row++;
        }
    }

    // ============================================
    // メインループ
    // ============================================
    const mc = calcMfgCapacity(state);
    const sc = calcSalesCapacity(state);
    const matCap = calcMaterialCapacity(state);
    const prodCap = calcProductCapacity(state);

    while (row < maxRows) {
        // リスクカード
        if (Math.random() < GAME_RULES.RISK_PROBABILITY) {
            applyRisk(state, period);
            row++;
            continue;
        }

        // === 販売 ===
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

        // === 完成 ===
        if (state.wip > 0 && mc > 0) {
            const qty = Math.min(state.wip, mc, prodCap - state.products);
            if (qty > 0) {
                state.wip -= qty;
                state.products += qty;
                state.cash -= qty * GAME_RULES.PROCESSING_COST;
                procCost += qty * GAME_RULES.PROCESSING_COST;

                // 同時投入
                const inpQty = Math.min(state.materials, mc, GAME_RULES.WIP_CAPACITY - state.wip);
                if (inpQty > 0) {
                    state.materials -= inpQty;
                    state.wip += inpQty;
                    state.cash -= inpQty * GAME_RULES.PROCESSING_COST;
                    procCost += inpQty * GAME_RULES.PROCESSING_COST;
                }
            }
            row++;
            continue;
        }

        // === 投入 ===
        if (state.materials > 0 && state.wip < GAME_RULES.WIP_CAPACITY && mc > 0) {
            const qty = Math.min(state.materials, mc, GAME_RULES.WIP_CAPACITY - state.wip);
            if (qty > 0) {
                state.materials -= qty;
                state.wip += qty;
                state.cash -= qty * GAME_RULES.PROCESSING_COST;
                procCost += qty * GAME_RULES.PROCESSING_COST;
            }
            row++;
            continue;
        }

        // === 仕入れ ===
        const space = matCap - state.materials;
        if (space > 0 && state.cash >= 10) {
            // 安い市場を選択（東京¥15 > 大阪¥14 > 名古屋¥13 > 福岡¥12 > 札幌¥11 > 仙台¥10）
            const prices = [10, 11, 12, 13, 14, 15];
            const winProbs = [0.15, 0.20, 0.25, 0.25, 0.30, 0.35]; // 安いほど競争が激しい

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

    // ============================================
    // 期末計算
    // ============================================
    const machCount = (state.machinesSmall || 0) + (state.machinesLarge || 0);
    const persCount = (state.workers || 0) + (state.salesmen || 0);
    const machCost = machCount * wage;
    const persCost = persCount * wage;
    const deprec = (state.machinesSmall || 0) * 10 + (state.machinesLarge || 0) * 20;
    const chipCost = ((state.chips.research || 0) + (state.chips.education || 0) + (state.chips.advertising || 0) + 1) * 20 + 5;

    const fixedCost = machCost + persCost + deprec + chipCost;
    const MQ = sales - matCost - procCost;
    const opProfit = MQ - fixedCost;
    const interest = Math.floor((state.loans || 0) * GAME_RULES.LONG_TERM_RATE);
    const preTax = opProfit - interest;

    // 法人税（300超過分に50%）
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

    // 早期借入返済
    if (strategy.earlyRepay && period === 4 && state.loans > 0 && state.cash > state.loans + 50) {
        const repayAmount = Math.min(state.loans, state.cash - 50);
        state.cash -= repayAmount;
        state.loans -= repayAmount;
    }

    state.cash -= fixedCost + tax;

    // 資金ショート時の短期借入
    if (state.cash < 0) {
        const loan = Math.ceil(-state.cash / 40) * 50;
        state.shortLoans = (state.shortLoans || 0) + loan;
        state.cash += loan * 0.8;
    }

    state.equity = newEq - tax;
    state.salesThisPeriod = sales;
    state.profitThisPeriod = preTax - tax;

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
        warehouseMaterial: 0,
        warehouseProduct: 0,
        chips: { research: 0, education: 0, advertising: 0, computer: 0, insurance: 0 },
        nextPeriodChips: { research: 0, education: 0 },
        hasExceeded300: false,
        fCards: 0
    };

    const history = [];

    for (let period = 2; period <= 5; period++) {
        state = simulatePeriod(state, period, strategy);
        history.push({
            period,
            equity: state.equity,
            cash: state.cash,
            sales: state.salesThisPeriod || 0,
            profit: state.profitThisPeriod || 0
        });
    }

    return {
        success: state.equity >= GAME_RULES.TARGET_EQUITY,
        finalEquity: state.equity,
        finalCash: state.cash,
        history,
        loans: state.loans,
        shortLoans: state.shortLoans
    };
}

// ============================================
// メインシミュレーション実行
// ============================================
function runSimulations(runs = 1000) {
    console.log(`\n=== MG包括的シミュレーション v7 ===`);
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

    // 成功率でソート
    results.sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));

    // 結果表示
    console.log('=== 成功率ランキング TOP 15 ===\n');
    console.log('順位 | 戦略名                    | 成功率  | 平均自己資本 | 最高 | 最低 | 破産率');
    console.log('-'.repeat(85));

    for (let i = 0; i < Math.min(15, results.length); i++) {
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

    console.log('\n=== 失敗戦略 ワースト 10 ===\n');
    const worst = results.slice(-10).reverse();
    for (const r of worst) {
        console.log(`${r.name.padEnd(25)} | 成功率: ${r.successRate}% | 平均: ¥${r.avgEquity}`);
    }

    // 勝ち戦略と負け戦略を分類
    const winningStrategies = results.filter(r => parseFloat(r.successRate) >= 70);
    const losingStrategies = results.filter(r => parseFloat(r.successRate) < 20);

    console.log('\n=== 勝ち戦略（成功率70%以上）===');
    for (const w of winningStrategies) {
        const s = w.strategy;
        console.log(`${w.name}: ${w.successRate}% - R${s.chips.r}E${s.chips.e}${s.chips.a ? 'A'+s.chips.a : ''} ${s.nextR ? 'NR'+s.nextR : ''} ${s.borrow ? 'B'+s.borrow : ''} ${s.sm ? 'SM' : ''} ${s.warehouse ? 'WH' : ''}`);
    }

    console.log('\n=== 負け戦略（成功率20%未満）===');
    for (const l of losingStrategies) {
        console.log(`${l.name}: ${l.successRate}% - 避けるべき`);
    }

    return { results, winningStrategies, losingStrategies };
}

// 実行
const { results, winningStrategies, losingStrategies } = runSimulations(1000);

// 結果をエクスポート
console.log('\n=== 結果サマリー ===');
console.log(`勝ち戦略数: ${winningStrategies.length}`);
console.log(`負け戦略数: ${losingStrategies.length}`);

if (winningStrategies.length > 0) {
    console.log(`\n最強戦略: ${winningStrategies[0].name} (${winningStrategies[0].successRate}%)`);
}
