/**
 * MG 包括的シミュレーション
 * 様々な戦略パターンを100回以上テスト
 *
 * テスト項目:
 * - 研究/教育/広告チップの組み合わせ
 * - 機械投資（小型/大型）
 * - 人員採用（ワーカー/セールス）
 * - 借入の有無とタイミング
 * - 入札価格戦略
 * - 倉庫購入の有無
 */

// ============================================
// ゲームルール定数（実際のゲームと同じ）
// ============================================
const RULES = {
    // 市場価格（実際の上限）
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

    // コスト
    CHIP_COST: 20,
    EXPRESS_CHIP_COST: 40,
    INSURANCE_COST: 5,
    PROCESSING_COST: 1,  // 投入・完成各1円
    HIRING_COST: 20,
    WAREHOUSE_COST: 20,

    // 機械
    SMALL_MACHINE: { cost: 100, capacity: 1, depreciation: 10 },
    LARGE_MACHINE: { cost: 200, capacity: 4, depreciation: 20 },

    // 人件費（期別）
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },

    // 容量
    WIP_CAPACITY: 10,
    MATERIAL_BASE: 10,
    PRODUCT_BASE: 10,
    WAREHOUSE_BONUS: 12,

    // 金利
    LONG_TERM_RATE: 0.10,
    SHORT_TERM_RATE: 0.20,

    // リスク確率
    RISK_PROBABILITY: 0.20,  // 75枚中15枚

    // 目標
    TARGET_EQUITY: 450
};

// ============================================
// 戦略定義（テストするパターン）
// ============================================
const STRATEGIES = [
    // === 基本戦略 ===
    { name: 'BASE', desc: '何も投資しない', chips: {r:0, e:0, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },

    // === 研究チップ戦略 ===
    { name: 'R1', desc: '研究1枚', chips: {r:1, e:0, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'R2', desc: '研究2枚', chips: {r:2, e:0, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'R3', desc: '研究3枚', chips: {r:3, e:0, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'R4', desc: '研究4枚', chips: {r:4, e:0, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'R5', desc: '研究5枚', chips: {r:5, e:0, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },

    // === 教育チップ戦略 ===
    { name: 'E1', desc: '教育1枚', chips: {r:0, e:1, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'E2', desc: '教育2枚', chips: {r:0, e:2, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'E3', desc: '教育3枚', chips: {r:0, e:3, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },

    // === 研究+教育 複合戦略 ===
    { name: 'R1E1', desc: '研究1+教育1', chips: {r:1, e:1, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'R1E2', desc: '研究1+教育2', chips: {r:1, e:2, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'R2E1', desc: '研究2+教育1', chips: {r:2, e:1, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'R2E2', desc: '研究2+教育2', chips: {r:2, e:2, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'R3E1', desc: '研究3+教育1', chips: {r:3, e:1, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'R3E2', desc: '研究3+教育2', chips: {r:3, e:2, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },

    // === 広告戦略 ===
    { name: 'A1', desc: '広告1枚', chips: {r:0, e:0, a:1}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'A2', desc: '広告2枚', chips: {r:0, e:0, a:2}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'R2A1', desc: '研究2+広告1', chips: {r:2, e:0, a:1}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'R2A2', desc: '研究2+広告2', chips: {r:2, e:0, a:2}, machine: 'none', hire: 'none', borrow: false, warehouse: false },

    // === 機械投資戦略 ===
    { name: 'R2_SM', desc: '研究2+小型機械', chips: {r:2, e:0, a:0}, machine: 'small', hire: 'worker', borrow: false, warehouse: false },
    { name: 'R2_LM', desc: '研究2+大型機械', chips: {r:2, e:0, a:0}, machine: 'large', hire: 'worker', borrow: true, warehouse: false },
    { name: 'E2_SM', desc: '教育2+小型機械', chips: {r:0, e:2, a:0}, machine: 'small', hire: 'worker', borrow: false, warehouse: false },
    { name: 'E2_LM', desc: '教育2+大型機械', chips: {r:0, e:2, a:0}, machine: 'large', hire: 'worker', borrow: true, warehouse: false },

    // === 人員採用戦略 ===
    { name: 'R2_S1', desc: '研究2+セールス1', chips: {r:2, e:0, a:0}, machine: 'none', hire: 'sales', borrow: false, warehouse: false },
    { name: 'R2_S2', desc: '研究2+セールス2', chips: {r:2, e:0, a:0}, machine: 'none', hire: 'sales2', borrow: false, warehouse: false },
    { name: 'R2_W1', desc: '研究2+ワーカー1', chips: {r:2, e:0, a:0}, machine: 'none', hire: 'worker', borrow: false, warehouse: false },
    { name: 'E2_S1', desc: '教育2+セールス1', chips: {r:0, e:2, a:0}, machine: 'none', hire: 'sales', borrow: false, warehouse: false },

    // === 借入戦略 ===
    { name: 'R2_B50', desc: '研究2+借入50', chips: {r:2, e:0, a:0}, machine: 'none', hire: 'none', borrow: 50, warehouse: false },
    { name: 'R2_B100', desc: '研究2+借入100', chips: {r:2, e:0, a:0}, machine: 'none', hire: 'none', borrow: 100, warehouse: false },
    { name: 'R3_B100', desc: '研究3+借入100', chips: {r:3, e:0, a:0}, machine: 'none', hire: 'none', borrow: 100, warehouse: false },
    { name: 'E2_B50', desc: '教育2+借入50', chips: {r:0, e:2, a:0}, machine: 'none', hire: 'none', borrow: 50, warehouse: false },

    // === 倉庫戦略 ===
    { name: 'R2_WH', desc: '研究2+倉庫', chips: {r:2, e:0, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: true },
    { name: 'E2_WH', desc: '教育2+倉庫', chips: {r:0, e:2, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: true },
    { name: 'R2E1_WH', desc: '研究2+教育1+倉庫', chips: {r:2, e:1, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: true },

    // === 複合戦略 ===
    { name: 'R2E2_SM', desc: '研究2+教育2+小型機械', chips: {r:2, e:2, a:0}, machine: 'small', hire: 'worker', borrow: true, warehouse: false },
    { name: 'R2E2_LM', desc: '研究2+教育2+大型機械', chips: {r:2, e:2, a:0}, machine: 'large', hire: 'worker', borrow: true, warehouse: false },
    { name: 'R3E2_B', desc: '研究3+教育2+借入', chips: {r:3, e:2, a:0}, machine: 'none', hire: 'none', borrow: 100, warehouse: false },
    { name: 'R2E2_S1', desc: '研究2+教育2+セールス', chips: {r:2, e:2, a:0}, machine: 'none', hire: 'sales', borrow: false, warehouse: false },
    { name: 'R2E2_WH', desc: '研究2+教育2+倉庫', chips: {r:2, e:2, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: true },

    // === 積極投資戦略 ===
    { name: 'AGG1', desc: '積極: R3E2+小型+借入', chips: {r:3, e:2, a:0}, machine: 'small', hire: 'worker', borrow: 100, warehouse: false },
    { name: 'AGG2', desc: '積極: R4E2+大型+借入', chips: {r:4, e:2, a:0}, machine: 'large', hire: 'worker', borrow: 150, warehouse: false },
    { name: 'AGG3', desc: '積極: R5+大型+借入', chips: {r:5, e:0, a:0}, machine: 'large', hire: 'worker', borrow: 200, warehouse: false },

    // === 保守戦略 ===
    { name: 'CON1', desc: '保守: R1のみ', chips: {r:1, e:0, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'CON2', desc: '保守: E1のみ', chips: {r:0, e:1, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'CON3', desc: '保守: 投資なし', chips: {r:0, e:0, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: false },

    // === バランス戦略 ===
    { name: 'BAL1', desc: 'バランス: R2E1A1', chips: {r:2, e:1, a:1}, machine: 'none', hire: 'none', borrow: false, warehouse: false },
    { name: 'BAL2', desc: 'バランス: R2E2+借入50', chips: {r:2, e:2, a:0}, machine: 'none', hire: 'none', borrow: 50, warehouse: false },
    { name: 'BAL3', desc: 'バランス: R3E1+倉庫', chips: {r:3, e:1, a:0}, machine: 'none', hire: 'none', borrow: false, warehouse: true }
];

// ============================================
// シミュレーションエンジン
// ============================================
class SimulationEngine {
    constructor() {
        this.results = [];
    }

    // 初期状態を作成
    createInitialState(strategy) {
        return {
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
            warehouses: 0,
            chips: {
                research: 0,
                education: 0,
                advertising: 0,
                computer: 1,
                insurance: 1
            },
            nextPeriodChips: { research: 0, education: 0, advertising: 0 },
            additionalF: 0,
            hasExceeded300: false,
            strategy: strategy
        };
    }

    // 製造能力計算
    calcMfgCapacity(state) {
        if (state.workers === 0) return 0;
        const machineCapacity = state.machinesSmall + state.machinesLarge * 4;
        const numMachines = state.machinesSmall + state.machinesLarge;
        if (state.workers < numMachines) return state.workers;
        return machineCapacity + state.chips.computer + Math.min(state.chips.education, 1);
    }

    // 販売能力計算
    calcSalesCapacity(state) {
        if (state.salesmen === 0) return 0;
        const base = state.salesmen * 2;
        const adBonus = Math.min(state.chips.advertising * 2, state.salesmen) * 2;
        return base + adBonus + Math.min(state.chips.education, 1);
    }

    // 材料容量
    calcMatCapacity(state) {
        return RULES.MATERIAL_BASE + state.warehouses * RULES.WAREHOUSE_BONUS;
    }

    // 製品容量
    calcProdCapacity(state) {
        return RULES.PRODUCT_BASE + state.warehouses * RULES.WAREHOUSE_BONUS;
    }

    // 入札価格を決定（研究チップに応じた市場選択）
    getBidPrice(state, period) {
        const research = state.chips.research || 0;

        // 研究チップ数に応じた市場・価格
        // 仙台¥40、札幌¥36、福岡¥32、名古屋¥28、大阪¥24
        if (research >= 5) {
            // 福岡¥32を確実に取れる
            return { price: 32, market: '福岡', winRate: 0.98 };
        } else if (research >= 3) {
            // 名古屋¥28を確実に、福岡も狙える
            return { price: Math.random() < 0.3 ? 32 : 28, market: Math.random() < 0.3 ? '福岡' : '名古屋', winRate: 0.95 };
        } else if (research >= 2) {
            // 名古屋¥28をほぼ確実に取れる
            return { price: 28, market: '名古屋', winRate: 0.92 };
        } else if (research >= 1) {
            // 名古屋か大阪
            return { price: Math.random() < 0.5 ? 28 : 24, market: Math.random() < 0.5 ? '名古屋' : '大阪', winRate: 0.70 };
        } else {
            // 研究なしは大阪¥24が限界
            return { price: 24, market: '大阪', winRate: period === 2 ? 0.80 : 0.45 };
        }
    }

    // 仕入れ価格（現実的な分布）
    getMaterialPrice() {
        const rand = Math.random();
        if (rand < 0.1) return { price: 10, market: '仙台' };
        if (rand < 0.25) return { price: 11, market: '札幌' };
        if (rand < 0.50) return { price: 12, market: '福岡' };
        if (rand < 0.80) return { price: 13, market: '名古屋' };
        return { price: 14, market: '大阪' };
    }

    // リスクカード処理
    applyRiskCard(state, period) {
        const riskTypes = [
            { name: 'クレーム発生', fCost: 5 },
            { name: 'コンピュータートラブル', fCost: 10 },
            { name: '設計トラブル発生', fCost: 10 },
            { name: '得意先倒産', cashLoss: 30, period2Exempt: true },
            { name: '研究開発失敗', returnChip: 'research' },
            { name: '広告政策失敗', returnChip: 'advertising' },
            { name: '製造ミス発生', loseWip: 1 },
            { name: '倉庫火災', loseMaterials: true },
            { name: '盗難発見', loseProducts: 2 },
            { name: 'ワーカー退職', workerRetires: true, fCost: 5 },
            { name: 'ストライキ発生', skipTurns: 1 },
            { name: '返品発生', returnProduct: 1, cashLoss: 20, period2Exempt: true },
            // ベネフィット
            { name: '教育成功', benefit: true, sellPrice: 32 },
            { name: '研究開発成功', benefit: true, sellPrice: 32 },
            { name: '広告成功', benefit: true, sellPrice: 32 },
            { name: '商品の独占販売', benefit: true, sellPrice: 32 },
            { name: '特別サービス', benefit: true, materialPrice: 10 },
            // 特殊
            { name: '消費者運動発生', noEffect: true },
            { name: '労災発生', noEffect: true },
            { name: '景気変動', noEffect: true }
        ];

        const card = riskTypes[Math.floor(Math.random() * riskTypes.length)];
        let effect = { name: card.name, cashChange: 0 };

        // 2期免除
        if (card.period2Exempt && period === 2) {
            return { name: card.name + '（2期免除）', cashChange: 0 };
        }

        if (card.fCost) {
            state.additionalF += card.fCost;
        }
        if (card.cashLoss) {
            state.cash = Math.max(0, state.cash - card.cashLoss);
            effect.cashChange = -card.cashLoss;
        }
        if (card.returnChip && state.chips[card.returnChip] > 0) {
            state.chips[card.returnChip]--;
        }
        if (card.loseWip) {
            const loss = Math.min(card.loseWip, state.wip);
            state.wip -= loss;
        }
        if (card.loseProducts) {
            const loss = Math.min(card.loseProducts, state.products);
            state.products -= loss;
            if (state.chips.insurance > 0) {
                const insurance = loss * 10;
                state.cash += insurance;
                effect.cashChange = insurance;
            }
        }
        if (card.loseMaterials) {
            const loss = state.materials;
            state.materials = 0;
            if (state.chips.insurance > 0) {
                const insurance = loss * 8;
                state.cash += insurance;
                effect.cashChange = insurance;
            }
        }
        if (card.workerRetires && state.workers > 1) {
            state.workers--;
        }
        if (card.returnProduct && state.products > 0) {
            state.products--;
            state.cash = Math.max(0, state.cash - 20);
            effect.cashChange = -20;
        }
        if (card.benefit && card.sellPrice && state.products > 0) {
            const sellQty = Math.min(5, state.products, this.calcSalesCapacity(state));
            if (sellQty > 0) {
                const revenue = sellQty * card.sellPrice;
                state.products -= sellQty;
                state.cash += revenue;
                effect.cashChange = revenue;
            }
        }
        if (card.benefit && card.materialPrice) {
            const buyQty = Math.min(5, this.calcMatCapacity(state) - state.materials, Math.floor(state.cash / card.materialPrice));
            if (buyQty > 0) {
                const cost = buyQty * card.materialPrice;
                state.materials += buyQty;
                state.cash -= cost;
                effect.cashChange = -cost;
            }
        }

        return effect;
    }

    // 1期間シミュレーション
    simulatePeriod(state, period) {
        const maxRows = RULES.MAX_ROWS[period];
        let row = 1;
        let totalSales = 0;
        let totalMaterialCost = 0;
        let totalProcessingCost = 0;
        let productsSold = 0;

        const strategy = state.strategy;

        // 人件費（期ごとのベース × ランダム係数）
        const wageMultiplier = period >= 3 ? (Math.random() < 0.5 ? 1.1 : 1.2) : 1.0;
        const wage = Math.round(RULES.WAGE_BASE[period] * wageMultiplier);

        // === 期首処理 ===

        // 3期以降の借入
        if (period >= 3 && strategy.borrow && state.loans < strategy.borrow) {
            const loanAmount = Math.min(strategy.borrow - state.loans, 300 - state.loans);
            if (loanAmount > 0) {
                const interest = Math.floor(loanAmount * RULES.LONG_TERM_RATE);
                state.loans += loanAmount;
                state.cash += loanAmount - interest;
            }
        }

        // PC・保険購入
        state.chips.computer = 1;
        state.chips.insurance = 1;
        state.cash -= RULES.CHIP_COST + RULES.INSURANCE_COST;
        row++;

        // === 2期：チップ購入（即時適用） ===
        if (period === 2) {
            // 研究チップ
            for (let i = 0; i < strategy.chips.r && state.cash >= RULES.CHIP_COST; i++) {
                state.chips.research++;
                state.cash -= RULES.CHIP_COST;
                row++;
            }
            // 教育チップ
            for (let i = 0; i < strategy.chips.e && state.cash >= RULES.CHIP_COST; i++) {
                state.chips.education++;
                state.cash -= RULES.CHIP_COST;
                row++;
            }
            // 広告チップ
            for (let i = 0; i < strategy.chips.a && state.cash >= RULES.CHIP_COST; i++) {
                state.chips.advertising++;
                state.cash -= RULES.CHIP_COST;
                row++;
            }

            // 機械購入
            if (strategy.machine === 'small' && state.cash >= RULES.SMALL_MACHINE.cost) {
                state.machinesSmall++;
                state.cash -= RULES.SMALL_MACHINE.cost;
                row++;
            } else if (strategy.machine === 'large' && state.cash >= RULES.LARGE_MACHINE.cost) {
                state.machinesLarge++;
                state.cash -= RULES.LARGE_MACHINE.cost;
                row++;
            }

            // 人員採用
            if (strategy.hire === 'worker' && state.cash >= RULES.HIRING_COST) {
                state.workers++;
                state.cash -= RULES.HIRING_COST;
                row++;
            } else if (strategy.hire === 'sales' && state.cash >= RULES.HIRING_COST) {
                state.salesmen++;
                state.cash -= RULES.HIRING_COST;
                row++;
            } else if (strategy.hire === 'sales2' && state.cash >= RULES.HIRING_COST * 2) {
                state.salesmen += 2;
                state.cash -= RULES.HIRING_COST * 2;
                row += 2;
            }

            // 倉庫購入
            if (strategy.warehouse && state.cash >= RULES.WAREHOUSE_COST) {
                state.warehouses++;
                state.cash -= RULES.WAREHOUSE_COST;
                row++;
            }
        }

        // 3期以降：翌期チップ適用
        if (period >= 3) {
            if (state.nextPeriodChips.research > 0) {
                state.chips.research += state.nextPeriodChips.research;
                state.nextPeriodChips.research = 0;
            }
            if (state.nextPeriodChips.education > 0) {
                state.chips.education += state.nextPeriodChips.education;
                state.nextPeriodChips.education = 0;
            }
        }

        // === メインループ（生産・販売サイクル） ===
        const usableRows = maxRows - 2;  // 期末用に2行残す
        const mfgCap = () => this.calcMfgCapacity(state);
        const salesCap = () => this.calcSalesCapacity(state);
        const matCap = () => this.calcMatCapacity(state);
        const prodCap = () => this.calcProdCapacity(state);

        while (row <= usableRows) {
            // リスクカード判定（20%）
            if (Math.random() < RULES.RISK_PROBABILITY) {
                const effect = this.applyRiskCard(state, period);
                row++;
                continue;
            }

            // 1. 販売
            if (state.products > 0 && salesCap() > 0) {
                const sellQty = Math.min(state.products, salesCap());
                const bidInfo = this.getBidPrice(state, period);
                const bidWon = Math.random() < bidInfo.winRate;

                if (bidWon) {
                    const revenue = sellQty * bidInfo.price;
                    state.products -= sellQty;
                    state.cash += revenue;
                    totalSales += revenue;
                    productsSold += sellQty;
                }
                row++;
                continue;
            }

            // 2. 完成（仕掛品 → 製品）
            if (state.wip > 0 && mfgCap() > 0) {
                const completeQty = Math.min(state.wip, mfgCap(), prodCap() - state.products);
                if (completeQty > 0) {
                    state.wip -= completeQty;
                    state.products += completeQty;
                    const cost = completeQty * RULES.PROCESSING_COST;
                    state.cash -= cost;
                    totalProcessingCost += cost;

                    // 同時投入
                    const inputQty = Math.min(state.materials, mfgCap() - completeQty, RULES.WIP_CAPACITY - state.wip);
                    if (inputQty > 0) {
                        state.materials -= inputQty;
                        state.wip += inputQty;
                        const inputCost = inputQty * RULES.PROCESSING_COST;
                        state.cash -= inputCost;
                        totalProcessingCost += inputCost;
                    }
                }
                row++;
                continue;
            }

            // 3. 投入（材料 → 仕掛品）
            if (state.materials > 0 && mfgCap() > 0 && state.wip < RULES.WIP_CAPACITY) {
                const inputQty = Math.min(state.materials, mfgCap(), RULES.WIP_CAPACITY - state.wip);
                if (inputQty > 0) {
                    state.materials -= inputQty;
                    state.wip += inputQty;
                    const cost = inputQty * RULES.PROCESSING_COST;
                    state.cash -= cost;
                    totalProcessingCost += cost;
                }
                row++;
                continue;
            }

            // 4. 仕入れ
            const spaceAvailable = matCap() - state.materials;
            if (spaceAvailable > 0 && state.cash >= 10) {
                const isPeriod2 = period === 2;
                const perMarketLimit = isPeriod2 ? 99 : mfgCap();
                const matInfo = this.getMaterialPrice();
                const qty = Math.min(perMarketLimit, spaceAvailable, Math.floor(state.cash / matInfo.price));

                if (qty > 0) {
                    const cost = qty * matInfo.price;
                    state.materials += qty;
                    state.cash -= cost;
                    totalMaterialCost += cost;
                }
                row++;
                continue;
            }

            // 何もできない場合はループ終了
            break;
        }

        // === 期末処理 ===

        // 固定費計算
        const machineCount = state.machinesSmall + state.machinesLarge;
        const personnelCount = state.workers + state.salesmen;
        const machineCost = machineCount * wage;
        const personnelCost = personnelCount * wage;
        const depreciation = state.machinesSmall * RULES.SMALL_MACHINE.depreciation + state.machinesLarge * RULES.LARGE_MACHINE.depreciation;
        const chipCost = (state.chips.research + state.chips.education + state.chips.advertising + state.chips.computer) * RULES.CHIP_COST
                       + state.chips.insurance * RULES.INSURANCE_COST;
        const warehouseCost = state.warehouses * RULES.WAREHOUSE_COST;
        const additionalF = state.additionalF || 0;

        const fixedCost = machineCost + personnelCost + depreciation + chipCost + warehouseCost + additionalF;

        // G = 売上 - 材料費 - 加工費
        const grossProfit = totalSales - totalMaterialCost - totalProcessingCost;
        const operatingProfit = grossProfit - fixedCost;
        const interest = Math.floor(state.loans * RULES.LONG_TERM_RATE) + Math.floor(state.shortLoans * RULES.SHORT_TERM_RATE);
        const preTaxProfit = operatingProfit - interest;

        // 税金・配当
        const newEquity = state.equity + preTaxProfit;
        let tax = 0;
        let dividend = 0;

        if (newEquity > 300) {
            if (!state.hasExceeded300) {
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

        // 期末支払い
        state.cash -= fixedCost + tax + dividend;

        // 現金不足時は短期借入
        if (state.cash < 0) {
            const needed = -state.cash;
            const loanAmount = Math.ceil(needed / 0.8 / 50) * 50;
            state.shortLoans += loanAmount;
            state.cash += loanAmount * 0.8;
        }

        // 自己資本更新
        state.equity += netProfit;

        // 期末：倉庫リセット、追加F リセット
        state.warehouses = 0;
        state.additionalF = 0;

        return {
            period,
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
            productsSold,
            endEquity: state.equity
        };
    }

    // 1回のゲームシミュレーション
    runGame(strategy) {
        const state = this.createInitialState(strategy);
        const periodResults = [];

        for (let period = 2; period <= 5; period++) {
            const result = this.simulatePeriod(state, period);
            periodResults.push(result);
        }

        return {
            strategy: strategy.name,
            finalEquity: state.equity,
            success: state.equity >= RULES.TARGET_EQUITY,
            periodResults
        };
    }

    // 指定戦略で複数回シミュレーション
    runMultiple(strategy, runs = 100) {
        const results = [];
        for (let i = 0; i < runs; i++) {
            results.push(this.runGame(strategy));
        }

        const equities = results.map(r => r.finalEquity);
        const successCount = results.filter(r => r.success).length;

        return {
            strategy: strategy.name,
            description: strategy.desc,
            runs,
            successRate: (successCount / runs * 100).toFixed(1),
            avgEquity: Math.round(equities.reduce((a, b) => a + b, 0) / runs),
            maxEquity: Math.max(...equities),
            minEquity: Math.min(...equities),
            successCount
        };
    }

    // 全戦略テスト
    runAllStrategies(runsPerStrategy = 100) {
        console.log('='.repeat(60));
        console.log('MG 包括的シミュレーション開始');
        console.log(`戦略数: ${STRATEGIES.length}, 各${runsPerStrategy}回 = ${STRATEGIES.length * runsPerStrategy}回`);
        console.log('='.repeat(60));

        const allResults = [];

        for (const strategy of STRATEGIES) {
            const result = this.runMultiple(strategy, runsPerStrategy);
            allResults.push(result);
            console.log(`${strategy.name.padEnd(12)} | ${result.successRate.padStart(5)}% | avg¥${result.avgEquity} | max¥${result.maxEquity} | ${strategy.desc}`);
        }

        // 成功率でソート
        allResults.sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));

        console.log('\n' + '='.repeat(60));
        console.log('TOP 10 戦略');
        console.log('='.repeat(60));

        for (let i = 0; i < Math.min(10, allResults.length); i++) {
            const r = allResults[i];
            console.log(`${(i+1).toString().padStart(2)}. ${r.strategy.padEnd(12)} | ${r.successRate.padStart(5)}% | avg¥${r.avgEquity} | max¥${r.maxEquity}`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('WORST 5 戦略');
        console.log('='.repeat(60));

        for (let i = allResults.length - 5; i < allResults.length; i++) {
            const r = allResults[i];
            console.log(`${r.strategy.padEnd(12)} | ${r.successRate.padStart(5)}% | avg¥${r.avgEquity} | min¥${r.minEquity}`);
        }

        return allResults;
    }
}

// ============================================
// 実行
// ============================================
const engine = new SimulationEngine();
const results = engine.runAllStrategies(200);  // 各戦略200回 = 10,000回以上

console.log('\n');
console.log('='.repeat(60));
console.log('分析サマリー');
console.log('='.repeat(60));

// 成功率 > 0 の戦略を抽出
const successfulStrategies = results.filter(r => parseFloat(r.successRate) > 0);
console.log(`\n¥450達成可能戦略: ${successfulStrategies.length}/${STRATEGIES.length}`);

if (successfulStrategies.length > 0) {
    console.log('\n成功戦略の共通点:');
    const chips = successfulStrategies.map(r => {
        const s = STRATEGIES.find(s => s.name === r.strategy);
        return s ? s.chips : null;
    }).filter(c => c);

    const avgR = chips.reduce((sum, c) => sum + c.r, 0) / chips.length;
    const avgE = chips.reduce((sum, c) => sum + c.e, 0) / chips.length;
    const avgA = chips.reduce((sum, c) => sum + c.a, 0) / chips.length;

    console.log(`  平均研究チップ: ${avgR.toFixed(1)}枚`);
    console.log(`  平均教育チップ: ${avgE.toFixed(1)}枚`);
    console.log(`  平均広告チップ: ${avgA.toFixed(1)}枚`);
}

// 最高の戦略を詳細表示
if (results.length > 0) {
    const best = results[0];
    const bestStrategy = STRATEGIES.find(s => s.name === best.strategy);
    console.log('\n' + '='.repeat(60));
    console.log('最強戦略の詳細');
    console.log('='.repeat(60));
    console.log(`戦略名: ${best.strategy} - ${best.description}`);
    console.log(`成功率: ${best.successRate}%`);
    console.log(`平均自己資本: ¥${best.avgEquity}`);
    console.log(`最高自己資本: ¥${best.maxEquity}`);
    console.log(`最低自己資本: ¥${best.minEquity}`);
    if (bestStrategy) {
        console.log(`\n投資内容:`);
        console.log(`  研究チップ: ${bestStrategy.chips.r}枚`);
        console.log(`  教育チップ: ${bestStrategy.chips.e}枚`);
        console.log(`  広告チップ: ${bestStrategy.chips.a}枚`);
        console.log(`  機械: ${bestStrategy.machine}`);
        console.log(`  採用: ${bestStrategy.hire}`);
        console.log(`  借入: ${bestStrategy.borrow}`);
        console.log(`  倉庫: ${bestStrategy.warehouse}`);
    }
}
