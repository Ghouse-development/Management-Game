/**
 * AI最適化エンジン テスト・検証スクリプト v2
 * 正確なMGルールに基づくシミュレーション
 */

// ============================================
// 正確なゲーム定数
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

    // 目標
    TARGET_EQUITY: 450,

    // 期別行数
    ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },

    // 基本給（期別）
    SALARY: { 2: 22, 3: 24, 4: 26, 5: 28 },

    // 在庫評価額
    INVENTORY_VALUE: {
        material: 13,
        wip: 14,
        product: 15
    },

    // 製造コスト
    PRODUCTION_COST: {
        input: 1,       // 投入（材料→仕掛）1円/個
        completion: 1   // 完成（仕掛→製品）1円/個
    },

    // 減価償却
    DEPRECIATION: {
        small: { 2: 10, 3: 20, 4: 20, 5: 20 },
        smallWithAttachment: { 2: 13, 3: 26, 4: 26, 5: 26 }
    },

    // チップコスト
    CHIP_COST: {
        normal: 20,   // 通常・繰越
        express: 40   // 特急
    },

    // 税率
    TAX_THRESHOLD: 300,
    TAX_RATE: 0.5
};

// 市場データ（仕入れ価格・販売価格）
// 研究チップ1枚につき+4円の価格ボーナス
const MARKETS = [
    { name: '仙台',   buyPrice: 10, sellPrice: 40, stock: 3  },
    { name: '札幌',   buyPrice: 11, sellPrice: 36, stock: 4  },
    { name: '福岡',   buyPrice: 12, sellPrice: 32, stock: 6  },
    { name: '名古屋', buyPrice: 13, sellPrice: 28, stock: 9  },
    { name: '大阪',   buyPrice: 14, sellPrice: 24, stock: 13 },
    { name: '東京',   buyPrice: 15, sellPrice: 20, stock: 20 },
    { name: '海外',   buyPrice: 16, sellPrice: 16, stock: 99 }
];

// 研究チップによる価格ボーナス
const RESEARCH_PRICE_BONUS = 4; // 1枚あたり+4円

// ============================================
// 会社クラス（正確版）
// ============================================
class Company {
    constructor() {
        this.reset();
    }

    reset() {
        this.cash = MG.INITIAL.cash;
        this.equity = MG.INITIAL.equity;
        this.materials = MG.INITIAL.materials;
        this.wip = MG.INITIAL.wip;
        this.products = MG.INITIAL.products;
        this.workers = MG.INITIAL.workers;
        this.salesmen = MG.INITIAL.salesmen;
        this.machines = [{ type: 'small', attachments: 0 }];
        this.chips = { research: 0, education: 0, advertising: 0 };
        this.nextPeriodChips = { research: 0, education: 0, advertising: 0 };
        this.carriedOverChips = { research: 0, education: 0, advertising: 0 };

        // 期中追跡
        this.periodSales = 0;        // PQ
        this.periodVQ = 0;           // VQ（材料費+完成賃金）
        this.materialCostTotal = 0;  // 材料仕入れ総額
        this.producedCount = 0;      // 製造完成数
    }

    clone() {
        const c = new Company();
        c.cash = this.cash;
        c.equity = this.equity;
        c.materials = this.materials;
        c.wip = this.wip;
        c.products = this.products;
        c.workers = this.workers;
        c.salesmen = this.salesmen;
        c.machines = JSON.parse(JSON.stringify(this.machines));
        c.chips = { ...this.chips };
        c.nextPeriodChips = { ...this.nextPeriodChips };
        c.carriedOverChips = { ...this.carriedOverChips };
        c.periodSales = this.periodSales;
        c.periodVQ = this.periodVQ;
        c.materialCostTotal = this.materialCostTotal;
        c.producedCount = this.producedCount;
        return c;
    }

    getMfgCapacity() {
        let cap = 0;
        this.machines.forEach(m => {
            if (m.type === 'small') cap += m.attachments > 0 ? 2 : 1;
            else cap += 4;
        });
        // 教育チップ1枚で+1
        cap += Math.min(this.chips.education, 1);
        return Math.min(cap, this.workers);
    }

    getSalesCapacity() {
        if (this.salesmen === 0) return 0;
        const base = this.salesmen * 2;
        // 広告チップ1枚につき+2（セールスマン×2枚まで）
        const adBonus = Math.min(this.chips.advertising, this.salesmen * 2) * 2;
        // 教育チップで+1
        const eduBonus = Math.min(this.chips.education, 1);
        return base + adBonus + eduBonus;
    }

    // アクセス可能な最高価格市場
    getBestSellPrice() {
        const research = this.chips.research;
        for (const m of MARKETS) {
            if (research >= m.researchRequired && m.sellPrice > 16) {
                return m.sellPrice;
            }
        }
        return 20; // 東京
    }

    // 最安仕入れ市場（簡易：研究チップでアクセス可能な最安）
    getBestBuyPrice() {
        // 簡易化：名古屋（13円）を標準とする
        return 13;
    }
}

// ============================================
// シミュレーター（正確版）
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

        // 給与計算
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
            // 2期は全て20円
            chipCost = (c.chips.research + c.chips.education + c.chips.advertising) * MG.CHIP_COST.normal;
        } else {
            // 繰越分は20円
            const carried = c.carriedOverChips;
            chipCost += (carried.research + carried.education + carried.advertising) * MG.CHIP_COST.normal;
            // 特急分は40円
            const express = {
                research: Math.max(0, c.chips.research - carried.research),
                education: Math.max(0, c.chips.education - carried.education),
                advertising: Math.max(0, c.chips.advertising - carried.advertising)
            };
            chipCost += (express.research + express.education + express.advertising) * MG.CHIP_COST.express;
            // 次期予約分は20円
            chipCost += (c.nextPeriodChips.research + c.nextPeriodChips.education + c.nextPeriodChips.advertising) * MG.CHIP_COST.normal;
        }

        return {
            salary,
            depreciation,
            chipCost,
            total: salary + depreciation + chipCost
        };
    }

    // 行動実行
    execute(action) {
        const c = this.company;

        switch (action.type) {
            case 'BUY_MATERIALS': {
                const qty = action.qty || 1;
                const price = action.price || 13; // デフォルト名古屋価格
                const cost = qty * price;
                if (c.cash >= cost) {
                    c.materials += qty;
                    c.cash -= cost;
                    c.materialCostTotal += cost;
                    return { success: true, cost };
                }
                return { success: false };
            }

            case 'PRODUCE': {
                const mfgCap = c.getMfgCapacity();
                if (mfgCap > 0 && (c.wip > 0 || c.materials > 0)) {
                    // 完成（仕掛→製品）
                    const complete = Math.min(c.wip, mfgCap);
                    // 投入（材料→仕掛）
                    const start = Math.min(c.materials, mfgCap);

                    c.products += complete;
                    c.wip = c.wip - complete + start;
                    c.materials -= start;

                    // 製造コスト
                    // 投入: 1円/個、完成: 1円/個
                    const inputCost = start * MG.PRODUCTION_COST.input;
                    const completionCost = complete * MG.PRODUCTION_COST.completion;
                    c.cash -= (inputCost + completionCost);

                    // VQ追跡
                    // V = 材料費 + 投入1円 + 完成1円 = 材料費 + 2円
                    const avgMaterialCost = c.materialCostTotal > 0
                        ? c.materialCostTotal / Math.max(1, c.producedCount + start)
                        : 13;
                    // 完成品のVQを計上
                    c.periodVQ += complete * (avgMaterialCost + 2);
                    c.producedCount += complete;

                    return { success: true, completed: complete, started: start, cost: inputCost + completionCost };
                }
                return { success: false };
            }

            case 'SELL': {
                const salesCap = c.getSalesCapacity();
                const qty = Math.min(action.qty || 1, c.products, salesCap);
                if (qty > 0) {
                    const price = action.price || c.getBestSellPrice();
                    const revenue = qty * price;
                    c.products -= qty;
                    c.cash += revenue;
                    c.periodSales += revenue;
                    return { success: true, qty, price, revenue };
                }
                return { success: false };
            }

            case 'BUY_CHIP': {
                const cost = this.period === 2 ? MG.CHIP_COST.normal : MG.CHIP_COST.express;
                if (c.cash >= cost) {
                    c.chips[action.chipType]++;
                    c.cash -= cost;
                    return { success: true, cost };
                }
                return { success: false };
            }

            case 'BUY_NEXT_CHIP': {
                if (this.period >= 2 && c.cash >= MG.CHIP_COST.normal) {
                    c.nextPeriodChips[action.chipType]++;
                    c.cash -= MG.CHIP_COST.normal;
                    return { success: true };
                }
                return { success: false };
            }

            case 'BUY_ATTACHMENT': {
                const machine = c.machines.find(m => m.type === 'small' && m.attachments === 0);
                if (machine && c.cash >= 30) {
                    machine.attachments = 1;
                    c.cash -= 30;
                    return { success: true };
                }
                return { success: false };
            }

            case 'HIRE_WORKER': {
                if (c.cash >= 5) {
                    c.workers++;
                    c.cash -= 5;
                    return { success: true };
                }
                return { success: false };
            }

            case 'HIRE_SALESMAN': {
                if (c.cash >= 5) {
                    c.salesmen++;
                    c.cash -= 5;
                    return { success: true };
                }
                return { success: false };
            }

            case 'WAIT':
                return { success: true };
        }
        return { success: false };
    }

    // 決算処理
    settlement() {
        const c = this.company;
        const period = this.period;

        const PQ = c.periodSales;
        const VQ = Math.round(c.periodVQ);
        const MQ = PQ - VQ;

        const fDetail = this.calculateF(c, period);
        const F = fDetail.total;
        const G = MQ - F;

        // 税金
        let tax = 0;
        if (c.equity > MG.TAX_THRESHOLD && G > 0) {
            tax = Math.round(G * MG.TAX_RATE);
        }

        const netG = G - tax;
        c.equity += netG;

        // ログ記録
        this.log.push({
            period,
            PQ, VQ, MQ, F, G, tax, netG,
            fDetail,
            equity: c.equity,
            cash: c.cash
        });

        // リセット
        c.periodSales = 0;
        c.periodVQ = 0;
        c.materialCostTotal = 0;
        c.producedCount = 0;

        // チップ繰越
        c.carriedOverChips = { ...c.nextPeriodChips };
        c.chips = { ...c.nextPeriodChips };
        c.nextPeriodChips = { research: 0, education: 0, advertising: 0 };

        return { PQ, VQ, MQ, F, G, tax, netG, equity: c.equity };
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
            success: this.company.equity >= MG.TARGET_EQUITY,
            log: this.log
        };
    }
}

// ============================================
// 戦略: 450達成を目指す最適化戦略
// ============================================
function optimalStrategy(c, period, row, sim) {
    const mfgCap = c.getMfgCapacity();
    const salesCap = c.getSalesCapacity();

    // === 2期: 投資重視 ===
    if (period === 2) {
        // 序盤: 研究2枚購入（高価格市場アクセス）
        if (row <= 2 && c.chips.research < 2 && c.cash >= 20) {
            return { type: 'BUY_CHIP', chipType: 'research' };
        }
        // 教育1枚（製造・販売+1）
        if (row === 3 && c.chips.education < 1 && c.cash >= 20) {
            return { type: 'BUY_CHIP', chipType: 'education' };
        }
        // 初期製品を売る（研究2枚で名古屋28円）
        if (row === 4 && c.products > 0 && salesCap > 0) {
            return { type: 'SELL', qty: c.products, price: 28 };
        }
        // 次期研究チップ予約
        if (row === 5 && c.cash >= 20) {
            return { type: 'BUY_NEXT_CHIP', chipType: 'research' };
        }
        // 材料仕入れ
        if (row >= 6 && row <= 8 && c.materials < 3 && c.cash >= 40) {
            return { type: 'BUY_MATERIALS', qty: 3, price: 13 };
        }
        // 製造
        if ((c.wip > 0 || c.materials > 0) && mfgCap > 0) {
            return { type: 'PRODUCE' };
        }
        // 販売
        if (c.products > 0 && salesCap > 0) {
            return { type: 'SELL', qty: Math.min(c.products, salesCap), price: 28 };
        }
    }

    // === 3期以降: 製販サイクル ===
    if (period >= 3) {
        // 製品あれば売る（最高価格）
        if (c.products > 0 && salesCap > 0) {
            const price = c.getBestSellPrice();
            return { type: 'SELL', qty: Math.min(c.products, salesCap), price };
        }
        // 製造
        if ((c.wip > 0 || c.materials > 0) && mfgCap > 0) {
            return { type: 'PRODUCE' };
        }
        // 材料仕入れ
        if (c.materials < 2 && c.cash >= 40) {
            return { type: 'BUY_MATERIALS', qty: 3, price: 13 };
        }
    }

    return { type: 'WAIT' };
}

// ============================================
// 改善版戦略: 販売回数最大化
// ============================================
function improvedStrategy(c, period, row, sim) {
    const mfgCap = c.getMfgCapacity();
    const salesCap = c.getSalesCapacity();

    // === 2期 ===
    if (period === 2) {
        // R2 + E1投資
        if (row === 1 && c.chips.research < 1 && c.cash >= 20) {
            return { type: 'BUY_CHIP', chipType: 'research' };
        }
        if (row === 2 && c.chips.research < 2 && c.cash >= 20) {
            return { type: 'BUY_CHIP', chipType: 'research' };
        }
        if (row === 3 && c.chips.education < 1 && c.cash >= 20) {
            return { type: 'BUY_CHIP', chipType: 'education' };
        }

        // 初期仕掛品2個を完成させる
        if (row === 4 && c.wip > 0 && mfgCap > 0) {
            return { type: 'PRODUCE' };
        }

        // 製品を売る（3個になっているはず）
        if (row === 5 && c.products > 0 && salesCap > 0) {
            return { type: 'SELL', qty: Math.min(c.products, salesCap), price: 28 };
        }

        // 次期研究チップ
        if (row === 6 && c.cash >= 20) {
            return { type: 'BUY_NEXT_CHIP', chipType: 'research' };
        }

        // 材料仕入れ→製造→販売サイクル
        if (c.materials === 0 && c.wip === 0 && c.products === 0 && c.cash >= 40) {
            return { type: 'BUY_MATERIALS', qty: 3, price: 13 };
        }
        if ((c.wip > 0 || c.materials > 0) && mfgCap > 0) {
            return { type: 'PRODUCE' };
        }
        if (c.products > 0 && salesCap > 0) {
            return { type: 'SELL', qty: Math.min(c.products, salesCap), price: 28 };
        }
    }

    // === 3期以降 ===
    if (period >= 3) {
        // 売れるなら売る
        if (c.products > 0 && salesCap > 0) {
            return { type: 'SELL', qty: Math.min(c.products, salesCap), price: c.getBestSellPrice() };
        }
        // 製造できるなら製造
        if ((c.wip > 0 || c.materials > 0) && mfgCap > 0) {
            return { type: 'PRODUCE' };
        }
        // 材料がなければ仕入れ
        if (c.materials === 0 && c.cash >= 40) {
            return { type: 'BUY_MATERIALS', qty: 3, price: 13 };
        }
    }

    return { type: 'WAIT' };
}

// ============================================
// シミュレーション実行
// ============================================
function runTest(strategy, name, count = 100) {
    const sim = new Simulator();
    const results = [];

    console.log(`\n【${name}】${count}回シミュレーション...`);

    for (let i = 0; i < count; i++) {
        const r = sim.simulateFullGame(strategy);
        results.push(r.finalEquity);
    }

    const avg = results.reduce((a, b) => a + b, 0) / count;
    const min = Math.min(...results);
    const max = Math.max(...results);
    const successRate = results.filter(e => e >= 450).length / count * 100;

    console.log(`  平均: ¥${avg.toFixed(0)} | 最小: ¥${min} | 最大: ¥${max}`);
    console.log(`  450達成率: ${successRate.toFixed(1)}%`);

    return { avg, min, max, successRate };
}

// 詳細ログ
function runDetailed(strategy, name) {
    const sim = new Simulator();
    console.log(`\n【${name} 詳細】`);

    sim.simulateFullGame(strategy);

    console.log('期│ PQ  │ VQ │ MQ │ F   │ G  │ 税 │純G │ 自己資本');
    console.log('─┼─────┼────┼────┼─────┼────┼────┼────┼─────────');
    sim.log.forEach(l => {
        console.log(`${l.period}│${String(l.PQ).padStart(4)} │${String(l.VQ).padStart(3)} │${String(l.MQ).padStart(3)} │${String(l.F).padStart(4)} │${String(l.G).padStart(3)} │${String(l.tax).padStart(3)} │${String(l.netG).padStart(3)} │ ${l.equity}`);
    });

    console.log(`\n最終自己資本: ¥${sim.company.equity}`);
    console.log(`450達成: ${sim.company.equity >= 450 ? '○' : '×'}`);
    console.log(`不足額: ${Math.max(0, 450 - sim.company.equity)}円`);
}

// メイン
console.log('═'.repeat(60));
console.log('   MG AIシミュレーション v2（正確なルール版）');
console.log('═'.repeat(60));
console.log('初期状態: 現金112円, 自己資本283円');
console.log('         材料1個, 仕掛品2個, 製品1個');
console.log('目標: 自己資本450円');
console.log('═'.repeat(60));

runTest(optimalStrategy, '最適戦略', 100);
runTest(improvedStrategy, '改善戦略', 100);

runDetailed(optimalStrategy, '最適戦略');
runDetailed(improvedStrategy, '改善戦略');

// 必要G計算
console.log('\n【450達成に必要な計算】');
console.log('─'.repeat(40));
console.log('必要増加: 450 - 283 = 167円');
console.log('税率50%考慮: 税引前で約+330円のG必要');
console.log('4期間で: 平均82円/期のG必要');
