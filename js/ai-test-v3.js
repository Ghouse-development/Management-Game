/**
 * AI最適化エンジン テスト v3
 * 正確なMGルールに基づく（ソースコード検証済み）
 */

// ============================================
// 正確なゲーム定数（game.js/constants.jsから抽出）
// ============================================
const MG = {
    // 初期状態（2期開始時）
    INITIAL: {
        cash: 112,
        equity: 283,
        materials: 1,
        wip: 2,
        products: 1,
        workers: 1,
        salesmen: 1
    },

    TARGET: 450,

    ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    SALARY: { 2: 22, 3: 24, 4: 26, 5: 28 },

    // 在庫評価額
    INVENTORY: { material: 13, wip: 14, product: 15 },

    // 製造コスト（投入1円 + 完成1円）
    PRODUCTION: { input: 1, completion: 1 },

    // チップコスト
    CHIP: { normal: 20, express: 40 },

    // 研究チップ価格ボーナス（1枚あたり+2円）
    RESEARCH_BONUS: 2,

    // 減価償却
    DEPRECIATION: {
        small: { 2: 10, 3: 20, 4: 20, 5: 20 },
        smallWithAttachment: { 2: 13, 3: 26, 4: 26, 5: 26 }
    },

    TAX_THRESHOLD: 300,
    TAX_RATE: 0.5
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
            machines: [{ type: 'small', attachments: 0 }],
            chips: { research: 0, education: 0, advertising: 0 },
            nextPeriodChips: { research: 0, education: 0, advertising: 0 },
            carriedOverChips: { research: 0, education: 0, advertising: 0 },
            // 期中追跡
            periodPQ: 0,
            periodVQ: 0,
            materialBuyCost: 0,
            materialBuyQty: 0
        });
    }

    clone() {
        const c = new Company();
        Object.assign(c, JSON.parse(JSON.stringify(this)));
        return c;
    }

    // 製造能力
    getMfgCapacity() {
        let cap = 0;
        this.machines.forEach(m => {
            if (m.type === 'small') cap += m.attachments > 0 ? 2 : 1;
            else cap += 4;
        });
        cap += Math.min(this.chips.education, 1);
        return Math.min(cap, this.workers);
    }

    // 販売能力
    getSalesCapacity() {
        if (this.salesmen === 0) return 0;
        const base = this.salesmen * 2;
        const adBonus = Math.min(this.chips.advertising, this.salesmen * 2) * 2;
        const eduBonus = Math.min(this.chips.education, 1);
        return base + adBonus + eduBonus;
    }

    // 価格競争力（研究チップ×2円）
    getPriceBonus() {
        return this.chips.research * MG.RESEARCH_BONUS;
    }

    // 売れる最高価格（東京20円 + 研究ボーナス）
    getMaxSellPrice() {
        return 20 + this.getPriceBonus();
    }

    // 平均仕入れ原価
    getAvgMaterialCost() {
        if (this.materialBuyQty === 0) return 13; // デフォルト名古屋価格
        return this.materialBuyCost / this.materialBuyQty;
    }
}

// ============================================
// シミュレーター
// ============================================
class Simulator {
    constructor() {
        this.company = new Company();
        this.period = 2;
        this.row = 1;
        this.log = [];
    }

    reset() {
        this.company.reset();
        this.period = 2;
        this.row = 1;
        this.log = [];
    }

    // F計算（正確版）
    calculateF(c, period) {
        const baseSalary = MG.SALARY[period];
        const halfSalary = Math.round(baseSalary / 2);

        // 人件費
        const machineCount = c.machines.length;
        const salary = (machineCount + c.workers + c.salesmen) * baseSalary +
                       (c.workers + c.salesmen) * halfSalary;

        // 減価償却
        let depreciation = 0;
        c.machines.forEach(m => {
            if (m.type === 'small') {
                depreciation += m.attachments > 0
                    ? MG.DEPRECIATION.smallWithAttachment[period]
                    : MG.DEPRECIATION.small[period];
            }
        });

        // チップコスト
        let chipCost = 0;
        if (period === 2) {
            // 2期: 購入チップ全て20円
            chipCost = (c.chips.research + c.chips.education + c.chips.advertising) * MG.CHIP.normal;
        } else {
            // 3期以降: 繰越20円 + 特急40円
            const carried = c.carriedOverChips;
            chipCost += (carried.research + carried.education + carried.advertising) * MG.CHIP.normal;

            const express = {
                research: Math.max(0, c.chips.research - carried.research),
                education: Math.max(0, c.chips.education - carried.education),
                advertising: Math.max(0, c.chips.advertising - carried.advertising)
            };
            chipCost += (express.research + express.education + express.advertising) * MG.CHIP.express;

            // 次期予約
            chipCost += (c.nextPeriodChips.research + c.nextPeriodChips.education + c.nextPeriodChips.advertising) * MG.CHIP.normal;
        }

        return { salary, depreciation, chipCost, total: salary + depreciation + chipCost };
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
                    c.materialBuyCost += cost;
                    c.materialBuyQty += qty;
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

                    // 製造コスト: 投入1円 + 完成1円
                    const prodCost = start * MG.PRODUCTION.input + complete * MG.PRODUCTION.completion;
                    c.cash -= prodCost;

                    // VQ計算: V = 材料費 + 投入1円 + 完成1円
                    const avgMat = c.getAvgMaterialCost();
                    c.periodVQ += complete * (avgMat + 2);

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
                    c.periodPQ += revenue;
                    return true;
                }
                return false;
            }

            case 'BUY_CHIP': {
                const cost = this.period === 2 ? MG.CHIP.normal : MG.CHIP.express;
                if (c.cash >= cost) {
                    c.chips[action.chipType]++;
                    c.cash -= cost;
                    return true;
                }
                return false;
            }

            case 'BUY_NEXT_CHIP': {
                if (this.period >= 2 && c.cash >= MG.CHIP.normal) {
                    c.nextPeriodChips[action.chipType]++;
                    c.cash -= MG.CHIP.normal;
                    return true;
                }
                return false;
            }

            case 'BUY_ATTACHMENT': {
                const machine = c.machines.find(m => m.type === 'small' && m.attachments === 0);
                if (machine && c.cash >= 30) {
                    machine.attachments = 1;
                    c.cash -= 30;
                    return true;
                }
                return false;
            }

            case 'HIRE_WORKER':
                if (c.cash >= 5) { c.workers++; c.cash -= 5; return true; }
                return false;

            case 'HIRE_SALESMAN':
                if (c.cash >= 5) { c.salesmen++; c.cash -= 5; return true; }
                return false;

            case 'WAIT':
                return true;
        }
        return false;
    }

    // 決算処理
    settlement() {
        const c = this.company;
        const period = this.period;

        const PQ = c.periodPQ;
        const VQ = Math.round(c.periodVQ);
        const MQ = PQ - VQ;

        const fDetail = this.calculateF(c, period);
        const F = fDetail.total;
        const G = MQ - F;

        // 税金（自己資本300超 & G > 0の場合50%）
        let tax = 0;
        if (c.equity > MG.TAX_THRESHOLD && G > 0) {
            tax = Math.round(G * MG.TAX_RATE);
        }

        const netG = G - tax;
        c.equity += netG;

        this.log.push({ period, PQ, VQ, MQ, F, G, tax, netG, fDetail, equity: c.equity });

        // リセット
        c.periodPQ = 0;
        c.periodVQ = 0;
        c.materialBuyCost = 0;
        c.materialBuyQty = 0;

        // チップ繰越: min(期末チップ - 1, 3)
        const carryOver = (chips) => Math.min(Math.max(0, chips - 1), 3);
        c.carriedOverChips = {
            research: carryOver(c.chips.research) + c.nextPeriodChips.research,
            education: carryOver(c.chips.education) + c.nextPeriodChips.education,
            advertising: carryOver(c.chips.advertising) + c.nextPeriodChips.advertising
        };
        c.chips = { ...c.carriedOverChips };
        c.nextPeriodChips = { research: 0, education: 0, advertising: 0 };

        return { PQ, VQ, MQ, F, G, tax, netG };
    }

    // 1期シミュレート
    simulatePeriod(strategy) {
        const maxRows = MG.ROWS[this.period];
        for (this.row = 1; this.row <= maxRows; this.row++) {
            const action = strategy(this.company, this.period, this.row, this);
            this.execute(action);
        }
        return this.settlement();
    }

    // フルゲーム
    simulateFullGame(strategy) {
        this.reset();
        for (this.period = 2; this.period <= 5; this.period++) {
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

    if (period === 2) {
        // 2期: R2 + E1投資、次期R1予約
        if (row === 1 && c.chips.research < 1 && c.cash >= 20) {
            return { type: 'BUY_CHIP', chipType: 'research' };
        }
        if (row === 2 && c.chips.research < 2 && c.cash >= 20) {
            return { type: 'BUY_CHIP', chipType: 'research' };
        }
        if (row === 3 && c.chips.education < 1 && c.cash >= 20) {
            return { type: 'BUY_CHIP', chipType: 'education' };
        }
        // 初期仕掛品を完成
        if (row === 4 && c.wip > 0 && mfg > 0) {
            return { type: 'PRODUCE' };
        }
        // 製品を売る（研究2枚 = +4円 → 24円）
        if (row === 5 && c.products > 0 && sales > 0) {
            return { type: 'SELL', qty: c.products, price: 24 };
        }
        // 次期研究チップ予約
        if (row === 6 && c.cash >= 20) {
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
function runDetailed(strategy, name) {
    const sim = new Simulator();
    console.log(`\n【${name}】`);
    console.log('═'.repeat(60));

    sim.simulateFullGame(strategy);

    console.log('期│ PQ  │ VQ │ MQ │ F   │ G  │ 税 │純G │ 自己資本');
    console.log('─┼─────┼────┼────┼─────┼────┼────┼────┼─────────');
    sim.log.forEach(l => {
        const g = l.G >= 0 ? '+' + l.G : l.G;
        console.log(`${l.period}│${String(l.PQ).padStart(4)} │${String(l.VQ).padStart(3)} │${String(l.MQ).padStart(3)} │${String(l.F).padStart(4)} │${g.padStart(3)} │${String(l.tax).padStart(3)} │${String(l.netG).padStart(3)} │ ${l.equity}`);
    });

    const final = sim.company.equity;
    console.log('─'.repeat(60));
    console.log(`最終自己資本: ¥${final}`);
    console.log(`目標450円まで: ${final >= 450 ? '達成!' : '残り' + (450 - final) + '円不足'}`);

    return sim;
}

console.log('═'.repeat(60));
console.log('   MG AIシミュレーション v3（正確ルール版）');
console.log('═'.repeat(60));
console.log('研究チップ: 1枚 = +2円（正確値）');
console.log('V = 材料費 + 投入1円 + 完成1円');
console.log('チップ繰越: min(期末枚数-1, 3)');
console.log('═'.repeat(60));

runDetailed(strategy450, '450達成戦略');

// 計算
console.log('\n【必要条件の再計算】');
console.log('283円 → 450円 = +167円必要');
console.log('税率50%: 税引前で+334円のG必要');
console.log('4期間で: 平均83円/期のG必要');
console.log('');
console.log('MQ = G + F');
console.log('F ≈ 90円（2期）〜130円（5期）として');
console.log('必要MQ ≈ 83 + 110 = 193円/期');
console.log('');
console.log('研究2枚で価格24円、V=15円として M=9円');
console.log('必要販売数 = 193 / 9 ≈ 21個/期');
