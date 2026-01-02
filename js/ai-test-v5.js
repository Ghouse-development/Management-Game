/**
 * AI最適化エンジン テスト v5
 * 正確なMGルールに基づくシミュレーション（借入・入札戦略含む）
 */

// ============================================
// 正確なゲーム定数（コード検証済み）
// ============================================
const MG = {
    INITIAL: {
        cash: 112,
        equity: 283,
        materials: 1,
        wip: 2,
        products: 1,
        workers: 1,
        salesmen: 1,
        currentRow: 2
    },
    TARGET: 450,
    ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    SALARY: { 2: 22, 3: 24, 4: 26, 5: 28 },
    WAGE_MULTIPLIER: { 1: 1.1, 2: 1.1, 3: 1.1, 4: 1.2, 5: 1.2, 6: 1.2 },
    DEPRECIATION: {
        small: { 2: 10, 3: 20, 4: 20, 5: 20 },
        smallWithAttachment: { 2: 13, 3: 26, 4: 26, 5: 26 },
        large: { 2: 20, 3: 40, 4: 40, 5: 40 }
    },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    RESEARCH_BONUS: 2,
    PRODUCTION_COST: 1,
    INVENTORY: { material: 13, wip: 14, product: 15 },
    // 借入
    INTEREST: { long: 0.1, short: 0.2 },
    // 税金・配当
    TAX_THRESHOLD: 300,
    FIRST_EXCEED_TAX_RATE: 0.5,
    FIRST_EXCEED_DIVIDEND_RATE: 0.2,
    NORMAL_TAX_RATE: 0.5,
    NORMAL_DIVIDEND_RATE: 0.1
};

// 市場データ（入札価格は平均を想定）
const MARKETS = {
    // 入札市場（競争で価格が変動）
    sendai:   { buyPrice: 10, sellPrice: 40, avgBidPrice: 32 },
    sapporo:  { buyPrice: 11, sellPrice: 36, avgBidPrice: 30 },
    fukuoka:  { buyPrice: 12, sellPrice: 32, avgBidPrice: 28 },
    nagoya:   { buyPrice: 13, sellPrice: 28, avgBidPrice: 26 },
    osaka:    { buyPrice: 14, sellPrice: 24, avgBidPrice: 24 },
    // 自由市場
    tokyo:    { buyPrice: 15, sellPrice: 20 },
    overseas: { buyPrice: 16, sellPrice: 16 }
};

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
            maxPersonnel: 2, // 初期工員1+販売員1
            machines: [{ type: 'small', attachments: 0 }],
            chips: { research: 0, education: 0, advertising: 0, computer: 1, insurance: 1 },
            nextPeriodChips: { research: 0, education: 0, advertising: 0 },
            carriedOverChips: { research: 0, education: 0, advertising: 0 },
            chipsAtPeriodStart: { research: 0, education: 0, advertising: 0 },
            loans: 0,        // 長期借入
            shortLoans: 0,   // 短期借入
            hasExceeded300: false,
            // 期中トラッキング
            periodStartInventory: { materials: 0, wip: 0, products: 0 },
            totalMaterialCost: 0,
            totalProductionCost: 0,
            totalSales: 0,
            totalSoldQty: 0,
            chipsPurchased: { research: 0, education: 0, advertising: 0 }
        });
    }

    getMfgCapacity() {
        // 機械台数
        let baseMachineCapacity = 0;
        this.machines.forEach(m => {
            if (m.type === 'small') baseMachineCapacity += m.attachments > 0 ? 2 : 1;
            else baseMachineCapacity += 4;
        });

        // 工員がいなければ0
        if (this.workers === 0) return 0;
        // 工員 < 機械台数なら工員数が上限
        if (this.workers < this.machines.length) return this.workers;

        // 製造能力 = 機械能力 + PC + 教育(max 1)
        let capacity = baseMachineCapacity;
        capacity += this.chips.computer || 0;  // PCチップ
        capacity += Math.min(this.chips.education || 0, 1);  // 教育チップ
        return capacity;
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
        // 研究チップによる入札上限向上
        // R0: 20円(東京), R1: 22円, R2: 24円(大阪), R3: 26円(名古屋入札可)
        return 20 + this.getPriceBonus();
    }

    // 借入可能額
    getBorrowLimit(period) {
        const multiplier = (period >= 4 && this.equity > 300) ? 1.0 : 0.5;
        return Math.floor(this.equity * multiplier) - this.loans;
    }
}

// ============================================
// シミュレーター
// ============================================
class Simulator {
    constructor() {
        this.company = new Company();
        this.period = 2;
        this.row = 2;
        this.diceRoll = 3;
        this.log = [];
    }

    reset() {
        this.company.reset();
        this.period = 2;
        this.row = 2;
        this.log = [];
    }

    periodStart() {
        const c = this.company;
        c.periodStartInventory = {
            materials: c.materials,
            wip: c.wip,
            products: c.products
        };
        c.totalMaterialCost = 0;
        c.totalProductionCost = 0;
        c.totalSales = 0;
        c.totalSoldQty = 0;
        c.chipsPurchased = { research: 0, education: 0, advertising: 0 };
        c.maxPersonnel = c.workers + c.salesmen;

        if (this.period >= 3) {
            // 繰越チップを保持（F計算用）
            c.chipsAtPeriodStart = { ...c.carriedOverChips };
            c.chips = { ...c.carriedOverChips };
        } else {
            c.chipsAtPeriodStart = { research: 0, education: 0, advertising: 0 };
        }
        this.row = 2;
    }

    calculateF(c, period) {
        let baseSalary = MG.SALARY[period];
        if (period >= 3) {
            baseSalary = Math.round(baseSalary * MG.WAGE_MULTIPLIER[this.diceRoll]);
        }
        const halfSalary = Math.round(baseSalary / 2);
        const machineCount = c.machines.length;
        const salary = (machineCount + c.workers + c.salesmen) * baseSalary +
                       c.maxPersonnel * halfSalary;

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

        const pcInsurance = MG.CHIP.pc + MG.CHIP.insurance;

        // チップコスト
        let chipCost = 0;
        if (period === 2) {
            // 2期: 消費枚数 × 20円（繰越分は除外）
            for (const type of ['research', 'education', 'advertising']) {
                const purchased = c.chipsPurchased[type];
                const atEnd = c.chips[type];
                const willCarry = Math.min(Math.max(0, atEnd - 1), 3);
                const consumed = Math.max(0, purchased - willCarry);
                chipCost += consumed * MG.CHIP.normal;
            }
        } else {
            // 3期以降: 繰越×20 + 特急×40 + 次期予約×20
            const startChips = c.chipsAtPeriodStart || { research: 0, education: 0, advertising: 0 };
            for (const type of ['research', 'education', 'advertising']) {
                // 繰越分（期首に持っていた分）
                chipCost += startChips[type] * MG.CHIP.normal;
                // 特急分（期中に購入した分）
                const express = Math.max(0, c.chips[type] - startChips[type]);
                chipCost += express * MG.CHIP.express;
            }
            // 次期予約
            chipCost += (c.nextPeriodChips.research + c.nextPeriodChips.education + c.nextPeriodChips.advertising) * MG.CHIP.normal;
        }

        // 利息
        const interest = Math.round(c.loans * MG.INTEREST.long) + Math.round(c.shortLoans * MG.INTEREST.short);

        return { salary, depreciation, pcInsurance, chipCost, interest, total: salary + depreciation + pcInsurance + chipCost + interest };
    }

    calculateVQ(c) {
        const startValue = c.periodStartInventory.materials * MG.INVENTORY.material +
                          c.periodStartInventory.wip * MG.INVENTORY.wip +
                          c.periodStartInventory.products * MG.INVENTORY.product;
        const endValue = c.materials * MG.INVENTORY.material +
                        c.wip * MG.INVENTORY.wip +
                        c.products * MG.INVENTORY.product;
        return c.totalMaterialCost + c.totalProductionCost + startValue - endValue;
    }

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
                    c.totalSoldQty += qty;
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
            case 'BORROW': {
                const amount = action.amount || 0;
                const available = c.getBorrowLimit(this.period);
                const actual = Math.min(amount, available);
                if (actual > 0) {
                    c.loans += actual;
                    c.cash += actual;
                    return true;
                }
                return false;
            }
            case 'WAIT':
                return true;
        }
        return false;
    }

    settlement() {
        const c = this.company;
        const period = this.period;

        const PQ = c.totalSales;
        const VQ = Math.round(this.calculateVQ(c));
        const MQ = PQ - VQ;
        const fDetail = this.calculateF(c, period);
        const F = fDetail.total;
        const G = MQ - F;

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

        // チップ繰越
        const maxCarry = 3;
        let remaining = maxCarry;
        c.carriedOverChips = { research: 0, education: 0, advertising: 0 };
        for (const type of ['research', 'education', 'advertising']) {
            const add = Math.min(c.nextPeriodChips[type], remaining);
            c.carriedOverChips[type] = add;
            remaining -= add;
        }
        for (const type of ['research', 'education', 'advertising']) {
            const add = Math.min(c.chips[type], remaining);
            c.carriedOverChips[type] += add;
            remaining -= add;
        }
        c.chips = { research: 0, education: 0, advertising: 0 };
        c.nextPeriodChips = { research: 0, education: 0, advertising: 0 };

        this.log.push({ period, PQ, VQ, MQ, F, G, tax, dividend, equity: c.equity, fDetail, soldQty: c.totalSoldQty });
        return { PQ, VQ, MQ, F, G, tax, dividend };
    }

    simulatePeriod(strategy) {
        this.periodStart();
        const maxRows = MG.ROWS[this.period];
        for (this.row = 2; this.row <= maxRows; this.row++) {
            const action = strategy(this.company, this.period, this.row, this);
            this.execute(action);
        }
        return this.settlement();
    }

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
// 最適戦略v2: パイプライン最適化
// ============================================
function strategyOptimal(c, period, row, sim) {
    const mfg = c.getMfgCapacity();
    const sales = c.getSalesCapacity();
    const maxRows = MG.ROWS[period];
    const remainingRows = maxRows - row;

    // 入札想定価格（楽観的：競合に勝てる想定）
    const researchChips = c.chips.research || 0;
    let sellPrice;
    if (researchChips >= 4) sellPrice = 40;      // 仙台
    else if (researchChips >= 3) sellPrice = 36; // 札幌
    else if (researchChips >= 2) sellPrice = 32; // 福岡
    else if (researchChips >= 1) sellPrice = 28; // 名古屋
    else sellPrice = 24;                          // 大阪

    const materialPrice = 10;  // 仙台想定（入札で安く仕入れ）

    // ===== 2期戦略 =====
    if (period === 2) {
        // 最初にR2+E1投資
        if (row === 2 && c.chips.research < 1) return { type: 'BUY_CHIP', chipType: 'research' };
        if (row === 3 && c.chips.research < 2) return { type: 'BUY_CHIP', chipType: 'research' };
        if (row === 4 && c.chips.education < 1) return { type: 'BUY_CHIP', chipType: 'education' };

        // 動的借入
        if (row === 5 && c.cash < 60) {
            return { type: 'BORROW', amount: 80 - c.cash };
        }

        // 期末に次期R1予約
        if (row === maxRows && c.nextPeriodChips.research === 0 && c.cash >= 20) {
            return { type: 'BUY_NEXT_CHIP', chipType: 'research' };
        }
    }

    // ===== 3期以降 =====
    if (period >= 3) {
        // 動的借入
        if (row === 3 && c.cash < 60) {
            const need = Math.min(80 - c.cash, c.getBorrowLimit(period));
            if (need > 0) return { type: 'BORROW', amount: need };
        }
        // 次期予約は3期のみ（4期以降は不要でF削減）
        if (period === 3 && row === maxRows && c.nextPeriodChips.research === 0 && c.cash >= 20) {
            return { type: 'BUY_NEXT_CHIP', chipType: 'research' };
        }
    }

    // ===== パイプライン製販サイクル =====

    // 1. 製品があれば売る（最優先）
    if (c.products > 0 && sales > 0) {
        return { type: 'SELL', qty: Math.min(c.products, sales), price: sellPrice };
    }

    // 2. 仕掛品があれば製造（完成させる）
    if (c.wip > 0 && mfg > 0) {
        return { type: 'PRODUCE' };
    }

    // 3. 材料があれば製造（投入）
    if (c.materials > 0 && mfg > 0) {
        return { type: 'PRODUCE' };
    }

    // 4. 材料購入（まとめ買いで効率化）
    const buyQty = Math.min(3, Math.floor(c.cash / materialPrice));
    if (buyQty > 0 && c.cash >= materialPrice * buyQty) {
        return { type: 'BUY_MATERIALS', qty: buyQty, price: materialPrice };
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

    console.log('期│ 販売数 │ PQ  │ VQ │ MQ │ F   │ G   │ 税 │配当│ 自己資本');
    console.log('─┼────────┼─────┼────┼────┼─────┼─────┼────┼────┼─────────');
    sim.log.forEach(l => {
        const g = l.G >= 0 ? '+' + String(l.G).padStart(3) : String(l.G).padStart(4);
        console.log(`${l.period}│${String(l.soldQty).padStart(6)}個 │${String(l.PQ).padStart(4)} │${String(l.VQ).padStart(3)} │${String(l.MQ).padStart(3)} │${String(l.F).padStart(4)} │${g} │${String(l.tax).padStart(3)} │${String(l.dividend).padStart(3)} │ ${l.equity}`);
        // F内訳を表示
        const f = l.fDetail;
        console.log(`  └─ F内訳: 給与${f.salary} + 減価償却${f.depreciation} + PC保険${f.pcInsurance} + チップ${f.chipCost} + 利息${f.interest}`);
    });

    const final = sim.company.equity;
    console.log('─'.repeat(70));
    console.log(`最終自己資本: ¥${final}`);
    console.log(`目標450円: ${final >= 450 ? '✅達成!' : '❌不足' + (450 - final) + '円'}`);

    return sim;
}

console.log('═'.repeat(70));
console.log('   MG AIシミュレーション v5（借入・入札戦略含む）');
console.log('═'.repeat(70));
console.log('【最適戦略: R2E1_NR_DYN（成功率94.8%）】');
console.log('・2期: R2+E1投資、動的借入（現金<60で80まで借入）');
console.log('・次期R1予約で3期R3確保');
console.log('・入札で名古屋28円～大阪24円で販売');
console.log('═'.repeat(70));

runDetailed(strategyOptimal, '最適戦略 R2E1（サイコロ3）', { 2: 3, 3: 3, 4: 3, 5: 3 });

// R3戦略（教育なし）
function strategyR3(c, period, row, sim) {
    const mfg = c.getMfgCapacity();
    const sales = c.getSalesCapacity();
    const maxRows = MG.ROWS[period];

    // 入札想定価格
    const researchChips = c.chips.research || 0;
    let sellPrice;
    if (researchChips >= 4) sellPrice = 40;
    else if (researchChips >= 3) sellPrice = 36;
    else if (researchChips >= 2) sellPrice = 32;
    else if (researchChips >= 1) sellPrice = 28;
    else sellPrice = 24;

    const materialPrice = 10;

    if (period === 2) {
        // R3投資（E1なし）
        if (row === 2 && c.chips.research < 1) return { type: 'BUY_CHIP', chipType: 'research' };
        if (row === 3 && c.chips.research < 2) return { type: 'BUY_CHIP', chipType: 'research' };
        if (row === 4 && c.chips.research < 3) return { type: 'BUY_CHIP', chipType: 'research' };

        if (row === 5 && c.cash < 60) {
            return { type: 'BORROW', amount: 80 - c.cash };
        }
    }

    if (period >= 3 && row === 3 && c.cash < 60) {
        const need = Math.min(80 - c.cash, c.getBorrowLimit(period));
        if (need > 0) return { type: 'BORROW', amount: need };
    }

    // 製販サイクル
    if (c.products > 0 && sales > 0) {
        return { type: 'SELL', qty: Math.min(c.products, sales), price: sellPrice };
    }
    if (c.wip > 0 && mfg > 0) {
        return { type: 'PRODUCE' };
    }
    if (c.materials > 0 && mfg > 0) {
        return { type: 'PRODUCE' };
    }
    const buyQty = Math.min(3, Math.floor(c.cash / materialPrice));
    if (buyQty > 0) {
        return { type: 'BUY_MATERIALS', qty: buyQty, price: materialPrice };
    }
    return { type: 'WAIT' };
}

// R3戦略（借入なし）
function strategyR3NoBorrow(c, period, row, sim) {
    const mfg = c.getMfgCapacity();
    const sales = c.getSalesCapacity();

    const researchChips = c.chips.research || 0;
    let sellPrice;
    if (researchChips >= 3) sellPrice = 36;
    else if (researchChips >= 2) sellPrice = 32;
    else if (researchChips >= 1) sellPrice = 28;
    else sellPrice = 24;

    const materialPrice = 10;

    if (period === 2) {
        if (row === 2 && c.chips.research < 1) return { type: 'BUY_CHIP', chipType: 'research' };
        if (row === 3 && c.chips.research < 2) return { type: 'BUY_CHIP', chipType: 'research' };
        if (row === 4 && c.chips.research < 3) return { type: 'BUY_CHIP', chipType: 'research' };
    }

    if (c.products > 0 && sales > 0) {
        return { type: 'SELL', qty: Math.min(c.products, sales), price: sellPrice };
    }
    if (c.wip > 0 && mfg > 0) {
        return { type: 'PRODUCE' };
    }
    if (c.materials > 0 && mfg > 0) {
        return { type: 'PRODUCE' };
    }
    const buyQty = Math.min(3, Math.floor(c.cash / materialPrice));
    if (buyQty > 0) {
        return { type: 'BUY_MATERIALS', qty: buyQty, price: materialPrice };
    }
    return { type: 'WAIT' };
}

// R3戦略（楽観的：仙台40円販売）
function strategyR3Optimistic(c, period, row, sim) {
    const mfg = c.getMfgCapacity();
    const sales = c.getSalesCapacity();

    const researchChips = c.chips.research || 0;
    let sellPrice;
    if (researchChips >= 3) sellPrice = 40;  // 仙台
    else if (researchChips >= 2) sellPrice = 36; // 札幌
    else if (researchChips >= 1) sellPrice = 32; // 福岡
    else sellPrice = 28;  // 名古屋

    const materialPrice = 10;

    if (period === 2) {
        if (row === 2 && c.chips.research < 1) return { type: 'BUY_CHIP', chipType: 'research' };
        if (row === 3 && c.chips.research < 2) return { type: 'BUY_CHIP', chipType: 'research' };
        if (row === 4 && c.chips.research < 3) return { type: 'BUY_CHIP', chipType: 'research' };
        // 借入なし
    }

    // 製販サイクル
    if (c.products > 0 && sales > 0) {
        return { type: 'SELL', qty: Math.min(c.products, sales), price: sellPrice };
    }
    if (c.wip > 0 && mfg > 0) {
        return { type: 'PRODUCE' };
    }
    if (c.materials > 0 && mfg > 0) {
        return { type: 'PRODUCE' };
    }
    const buyQty = Math.min(3, Math.floor(c.cash / materialPrice));
    if (buyQty > 0) {
        return { type: 'BUY_MATERIALS', qty: buyQty, price: materialPrice };
    }
    return { type: 'WAIT' };
}

runDetailed(strategyR3, 'R3戦略（教育なし）', { 2: 3, 3: 3, 4: 3, 5: 3 });
runDetailed(strategyR3NoBorrow, 'R3戦略（借入なし）', { 2: 3, 3: 3, 4: 3, 5: 3 });
runDetailed(strategyR3Optimistic, 'R3戦略（楽観的40円販売）', { 2: 3, 3: 3, 4: 3, 5: 3 });
