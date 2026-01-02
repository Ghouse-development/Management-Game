/**
 * AI最適化エンジン テスト v4
 * コードから検証した正確なMGルールに基づくシミュレーション
 */

// ============================================
// 正確なゲーム定数（コード検証済み）
// ============================================
const MG = {
    // 初期状態（2期開始時、期首処理後）
    INITIAL: {
        cash: 112,
        equity: 283,
        materials: 1,
        wip: 2,
        products: 1,
        workers: 1,
        salesmen: 1,
        currentRow: 2  // 期首処理で1行使用済み
    },

    TARGET: 450,

    // 期別行数
    ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },

    // 基本給（期別）
    SALARY: { 2: 22, 3: 24, 4: 26, 5: 28 },

    // サイコロによる賃金倍率（3期以降）
    WAGE_MULTIPLIER: { 1: 1.1, 2: 1.1, 3: 1.1, 4: 1.2, 5: 1.2, 6: 1.2 },

    // 大阪上限価格（サイコロ別）
    OSAKA_PRICE: { 1: 21, 2: 22, 3: 23, 4: 24, 5: 25, 6: 26 },

    // 在庫評価額
    INVENTORY: { material: 13, wip: 14, product: 15 },

    // 製造コスト
    PRODUCTION_COST: 1,  // 投入1円、完成1円

    // チップコスト
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },

    // 研究チップ価格ボーナス
    RESEARCH_BONUS: 2,  // 1枚あたり+2円

    // 減価償却
    DEPRECIATION: {
        small: { 2: 10, 3: 20, 4: 20, 5: 20 },
        smallWithAttachment: { 2: 13, 3: 26, 4: 26, 5: 26 },
        large: { 2: 20, 3: 40, 4: 40, 5: 40 }
    },

    // 税金・配当
    TAX_THRESHOLD: 300,
    FIRST_EXCEED_TAX_RATE: 0.5,      // 初回超過時: 超過分の50%
    FIRST_EXCEED_DIVIDEND_RATE: 0.2, // 初回超過時: 超過分の20%
    NORMAL_TAX_RATE: 0.5,            // 通常: Gの50%
    NORMAL_DIVIDEND_RATE: 0.1        // 通常: Gの10%
};

// 市場データ
const MARKETS = [
    { name: '仙台',   buyPrice: 10, sellPrice: 40 },
    { name: '札幌',   buyPrice: 11, sellPrice: 36 },
    { name: '福岡',   buyPrice: 12, sellPrice: 32 },
    { name: '名古屋', buyPrice: 13, sellPrice: 28 },
    { name: '大阪',   buyPrice: 14, sellPrice: 24 },
    { name: '東京',   buyPrice: 15, sellPrice: 20 },
    { name: '海外',   buyPrice: 16, sellPrice: 16 }
];

// ============================================
// 会社クラス
// ============================================
class Company {
    constructor() {
        this.reset();
    }

    reset() {
        Object.assign(this, {
            cash: MG.INITIAL.cash,
            equity: MG.INITIAL.equity,
            materials: MG.INITIAL.materials,
            wip: MG.INITIAL.wip,
            products: MG.INITIAL.products,
            workers: MG.INITIAL.workers,
            salesmen: MG.INITIAL.salesmen,
            maxPersonnel: MG.INITIAL.workers + MG.INITIAL.salesmen,
            machines: [{ type: 'small', attachments: 0 }],
            chips: { research: 0, education: 0, advertising: 0 },
            nextPeriodChips: { research: 0, education: 0, advertising: 0 },
            carriedOverChips: { research: 0, education: 0, advertising: 0 },
            hasExceeded300: false,

            // 期中トラッキング
            periodStartInventory: { materials: 0, wip: 0, products: 0 },
            totalMaterialCost: 0,
            totalProductionCost: 0,
            totalSales: 0,
            chipsPurchased: { research: 0, education: 0, advertising: 0 }
        });
    }

    clone() {
        const c = new Company();
        Object.assign(c, JSON.parse(JSON.stringify(this)));
        return c;
    }

    getMfgCapacity() {
        let cap = 0;
        this.machines.forEach(m => {
            if (m.type === 'small') cap += m.attachments > 0 ? 2 : 1;
            else cap += 4;
        });
        cap += Math.min(this.chips.education, 1);
        return Math.min(cap, this.workers);
    }

    getSalesCapacity() {
        if (this.salesmen === 0) return 0;
        const base = this.salesmen * 2;
        const adBonus = Math.min(this.chips.advertising, this.salesmen * 2) * 2;
        const eduBonus = Math.min(this.chips.education, 1);
        return base + adBonus + eduBonus;
    }

    getPriceBonus() {
        return this.chips.research * MG.RESEARCH_BONUS;
    }

    getMaxSellPrice() {
        return 20 + this.getPriceBonus();
    }
}

// ============================================
// シミュレーター
// ============================================
class Simulator {
    constructor() {
        this.company = new Company();
        this.period = 2;
        this.row = 2;  // 期首処理で1行使用済み
        this.diceRoll = 3;  // デフォルト
        this.log = [];
    }

    reset() {
        this.company.reset();
        this.period = 2;
        this.row = 2;
        this.log = [];
    }

    // 期首処理
    periodStart() {
        const c = this.company;

        // 期首在庫を記録（VQ計算用）
        c.periodStartInventory = {
            materials: c.materials,
            wip: c.wip,
            products: c.products
        };

        // トラッキングリセット
        c.totalMaterialCost = 0;
        c.totalProductionCost = 0;
        c.totalSales = 0;
        c.chipsPurchased = { research: 0, education: 0, advertising: 0 };
        c.maxPersonnel = c.workers + c.salesmen;

        // 3期以降: 繰越チップ適用
        if (this.period >= 3) {
            c.chips = { ...c.carriedOverChips };
            c.carriedOverChips = { research: 0, education: 0, advertising: 0 };
        }

        // PC・保険は期首に購入済み（初期状態に含む）
        this.row = 2;
    }

    // F計算
    calculateF(c, period) {
        let baseSalary = MG.SALARY[period];
        if (period >= 3) {
            baseSalary = Math.round(baseSalary * MG.WAGE_MULTIPLIER[this.diceRoll]);
        }
        const halfSalary = Math.round(baseSalary / 2);

        // 人件費
        const machineCount = c.machines.length;
        const salary = (machineCount + c.workers + c.salesmen) * baseSalary +
                       c.maxPersonnel * halfSalary;

        // 減価償却
        let depreciation = 0;
        c.machines.forEach(m => {
            if (m.type === 'small') {
                depreciation += m.attachments > 0
                    ? MG.DEPRECIATION.smallWithAttachment[period]
                    : MG.DEPRECIATION.small[period];
            } else {
                depreciation += MG.DEPRECIATION.large[period];
            }
        });

        // PC・保険
        const pcInsurance = MG.CHIP.pc + MG.CHIP.insurance;

        // チップコスト（消費分のみ = 銀行に返却された分）
        let chipCost = 0;
        if (period === 2) {
            // 2期: 消費枚数 = 購入枚数 - 繰越枚数
            // 繰越枚数 = min(期末チップ - 1, 3) ※各種類ごと
            for (const type of ['research', 'education', 'advertising']) {
                const purchased = c.chipsPurchased[type];
                const atEnd = c.chips[type];
                const willCarry = Math.min(Math.max(0, atEnd - 1), 3);
                const consumed = Math.max(0, purchased - willCarry);
                chipCost += consumed * MG.CHIP.normal;
            }
            // 次期予約チップは今期のFには含めない
        } else {
            // 3期以降: 繰越×20円 + 特急×40円
            for (const type of ['research', 'education', 'advertising']) {
                chipCost += c.carriedOverChips[type] * MG.CHIP.normal;
                const express = Math.max(0, c.chips[type] - c.carriedOverChips[type]);
                chipCost += express * MG.CHIP.express;
            }
            // 次期予約
            chipCost += (c.nextPeriodChips.research + c.nextPeriodChips.education + c.nextPeriodChips.advertising) * MG.CHIP.normal;
        }

        return { salary, depreciation, pcInsurance, chipCost, total: salary + depreciation + pcInsurance + chipCost };
    }

    // VQ計算
    calculateVQ(c) {
        const startValue = c.periodStartInventory.materials * MG.INVENTORY.material +
                          c.periodStartInventory.wip * MG.INVENTORY.wip +
                          c.periodStartInventory.products * MG.INVENTORY.product;
        const endValue = c.materials * MG.INVENTORY.material +
                        c.wip * MG.INVENTORY.wip +
                        c.products * MG.INVENTORY.product;
        return c.totalMaterialCost + c.totalProductionCost + startValue - endValue;
    }

    // 行動実行
    execute(action) {
        const c = this.company;

        switch (action.type) {
            case 'BUY_MATERIALS': {
                const qty = action.qty || 1;
                const price = action.price || 13;
                const cost = qty * price;
                if (c.cash >= cost) {
                    c.materials += qty;
                    c.cash -= cost;
                    c.totalMaterialCost += cost;
                    return true;
                }
                return false;
            }

            case 'PRODUCE': {
                const mfgCap = c.getMfgCapacity();
                if (mfgCap > 0 && (c.wip > 0 || c.materials > 0)) {
                    const complete = Math.min(c.wip, mfgCap);
                    const start = Math.min(c.materials, mfgCap);

                    c.products += complete;
                    c.wip = c.wip - complete + start;
                    c.materials -= start;

                    const prodCost = (start + complete) * MG.PRODUCTION_COST;
                    c.cash -= prodCost;
                    c.totalProductionCost += prodCost;
                    return true;
                }
                return false;
            }

            case 'SELL': {
                const salesCap = c.getSalesCapacity();
                const qty = Math.min(action.qty || 1, c.products, salesCap);
                if (qty > 0) {
                    const price = action.price || c.getMaxSellPrice();
                    const revenue = qty * price;
                    c.products -= qty;
                    c.cash += revenue;
                    c.totalSales += revenue;
                    return true;
                }
                return false;
            }

            case 'BUY_CHIP': {
                const cost = this.period === 2 ? MG.CHIP.normal : MG.CHIP.express;
                if (c.cash >= cost) {
                    c.chips[action.chipType]++;
                    c.chipsPurchased[action.chipType]++;
                    c.cash -= cost;
                    return true;
                }
                return false;
            }

            case 'BUY_NEXT_CHIP': {
                if (c.cash >= MG.CHIP.normal) {
                    c.nextPeriodChips[action.chipType]++;
                    c.cash -= MG.CHIP.normal;
                    return true;
                }
                return false;
            }

            case 'WAIT':
                return true;
        }
        return false;
    }

    // 決算処理
    settlement() {
        const c = this.company;
        const period = this.period;

        const PQ = c.totalSales;
        const VQ = Math.round(this.calculateVQ(c));
        const MQ = PQ - VQ;

        const fDetail = this.calculateF(c, period);
        const F = fDetail.total;
        const G = MQ - F;

        // 税金・配当
        let tax = 0, dividend = 0;
        const newEquity = c.equity + G;

        if (newEquity > MG.TAX_THRESHOLD) {
            if (!c.hasExceeded300) {
                const excess = newEquity - MG.TAX_THRESHOLD;
                tax = Math.round(excess * MG.FIRST_EXCEED_TAX_RATE);
                dividend = Math.round(excess * MG.FIRST_EXCEED_DIVIDEND_RATE);
                c.hasExceeded300 = true;
            } else if (G > 0) {
                tax = Math.round(G * MG.NORMAL_TAX_RATE);
                dividend = Math.round(G * MG.NORMAL_DIVIDEND_RATE);
            }
        }

        c.equity = newEquity - tax;

        this.log.push({ period, PQ, VQ, MQ, F, G, tax, dividend, equity: c.equity, fDetail });

        // チップ繰越
        const totalChips = c.chips.research + c.chips.education + c.chips.advertising +
                          c.nextPeriodChips.research + c.nextPeriodChips.education + c.nextPeriodChips.advertising;

        // 簡略化: 研究チップ優先で繰越
        const maxCarry = 3;
        let remaining = maxCarry;
        c.carriedOverChips = { research: 0, education: 0, advertising: 0 };

        // 次期予約を優先
        for (const type of ['research', 'education', 'advertising']) {
            const add = Math.min(c.nextPeriodChips[type], remaining);
            c.carriedOverChips[type] = add;
            remaining -= add;
        }
        // 現在チップから追加
        for (const type of ['research', 'education', 'advertising']) {
            const add = Math.min(c.chips[type], remaining);
            c.carriedOverChips[type] += add;
            remaining -= add;
        }

        c.chips = { research: 0, education: 0, advertising: 0 };
        c.nextPeriodChips = { research: 0, education: 0, advertising: 0 };

        return { PQ, VQ, MQ, F, G, tax, dividend };
    }

    // 1期シミュレート
    simulatePeriod(strategy) {
        this.periodStart();
        const maxRows = MG.ROWS[this.period];

        for (this.row = 2; this.row <= maxRows; this.row++) {
            const action = strategy(this.company, this.period, this.row, this);
            this.execute(action);
        }

        return this.settlement();
    }

    // フルゲーム
    simulateFullGame(strategy, diceRolls = {}) {
        this.reset();
        for (this.period = 2; this.period <= 5; this.period++) {
            this.diceRoll = diceRolls[this.period] || 3;
            this.simulatePeriod(strategy);
        }
        return {
            finalEquity: this.company.equity,
            success: this.company.equity >= MG.TARGET,
            log: this.log
        };
    }
}

// ============================================
// 戦略
// ============================================
function strategy450(c, period, row, sim) {
    const mfg = c.getMfgCapacity();
    const sales = c.getSalesCapacity();

    // デバッグ出力（2期のみ）
    if (period === 2 && (row <= 10 || row % 5 === 0)) {
        console.log(`  ${period}期${row}行: 現金${c.cash}, 材料${c.materials}, 仕掛${c.wip}, 製品${c.products}, 製造能力${mfg}, 販売能力${sales}`);
    }

    if (period === 2) {
        // R2 + E1投資
        if (row === 2 && c.chips.research < 1 && c.cash >= 20) {
            return { type: 'BUY_CHIP', chipType: 'research' };
        }
        if (row === 3 && c.chips.research < 2 && c.cash >= 20) {
            return { type: 'BUY_CHIP', chipType: 'research' };
        }
        if (row === 4 && c.chips.education < 1 && c.cash >= 20) {
            return { type: 'BUY_CHIP', chipType: 'education' };
        }
        // 初期仕掛品完成（2個→製品）
        if (row === 5 && c.wip > 0 && mfg > 0) {
            return { type: 'PRODUCE' };
        }
        // 製品を売る（研究2枚 = +4円 → 24円）
        if (row === 6 && c.products > 0 && sales > 0) {
            return { type: 'SELL', qty: c.products, price: 24 };
        }
        // 次期研究チップ予約
        if (row === 7 && c.cash >= 20) {
            return { type: 'BUY_NEXT_CHIP', chipType: 'research' };
        }
    }

    // 製販サイクル
    if (c.products > 0 && sales > 0) {
        return { type: 'SELL', qty: Math.min(c.products, sales), price: c.getMaxSellPrice() };
    }
    if ((c.wip > 0 || c.materials > 0) && mfg > 0) {
        return { type: 'PRODUCE' };
    }
    if (c.materials === 0 && c.cash >= 40) {
        return { type: 'BUY_MATERIALS', qty: 3, price: 13 };
    }

    return { type: 'WAIT' };
}

// ============================================
// 実行
// ============================================
function runDetailed(strategy, name, diceRolls = {}) {
    const sim = new Simulator();
    console.log(`\n【${name}】`);
    console.log('═'.repeat(70));

    sim.simulateFullGame(strategy, diceRolls);

    console.log('期│ PQ  │ VQ │ MQ │ F   │ G   │ 税 │配当│ 自己資本');
    console.log('─┼─────┼────┼────┼─────┼─────┼────┼────┼─────────');
    sim.log.forEach(l => {
        const g = l.G >= 0 ? '+' + String(l.G).padStart(3) : String(l.G).padStart(4);
        console.log(`${l.period}│${String(l.PQ).padStart(4)} │${String(l.VQ).padStart(3)} │${String(l.MQ).padStart(3)} │${String(l.F).padStart(4)} │${g} │${String(l.tax).padStart(3)} │${String(l.dividend).padStart(3)} │ ${l.equity}`);
    });

    const final = sim.company.equity;
    console.log('─'.repeat(70));
    console.log(`最終自己資本: ¥${final}`);
    console.log(`目標450円: ${final >= 450 ? '達成!' : '不足' + (450 - final) + '円'}`);

    return sim;
}

console.log('═'.repeat(70));
console.log('   MG AIシミュレーション v4（コード検証済み正確版）');
console.log('═'.repeat(70));
console.log('【検証済みルール】');
console.log('・初期: 現金112円, 自己資本283円, 材料1/仕掛2/製品1');
console.log('・製造: 投入1円 + 完成1円 = 2円/個');
console.log('・研究チップ: 1枚 = +2円');
console.log('・VQ = 材料費 + 製造費 + (期首在庫 - 期末在庫)');
console.log('・税金: 初回300超過→超過分50%, 以降→G×50%');
console.log('・配当: 初回300超過→超過分20%, 以降→G×10%');
console.log('═'.repeat(70));

runDetailed(strategy450, '450達成戦略（サイコロ3）', { 2: 3, 3: 3, 4: 3, 5: 3 });
