/**
 * AI最適化エンジン テスト・検証スクリプト
 * Node.jsで実行可能なスタンドアロン版
 */

// ============================================
// ゲーム定数（実ゲームから抽出）
// ============================================
const MG_CONSTANTS = {
    INITIAL_EQUITY: 300,
    TARGET_EQUITY: 450,
    PERIODS: [2, 3, 4, 5],
    ROWS_BY_PERIOD: { 2: 20, 3: 30, 4: 34, 5: 35 },
    BASE_SALARY: { 2: 22, 3: 24, 4: 26, 5: 28 },
    MATERIAL_COST: 10,
    CHIP_COST_NORMAL: 20,
    CHIP_COST_URGENT: 40,
    DEPRECIATION_SMALL: { 2: 10, 3: 20, 4: 20, 5: 20 },
    TAX_THRESHOLD: 300,
    TAX_RATE: 0.5
};

// 市場価格
const MARKETS = {
    '大阪': { basePrice: 20, minBid: 16, capacity: 99 },
    '名古屋': { basePrice: 24, minBid: 20, researchRequired: 1 },
    '福岡': { basePrice: 28, minBid: 24, researchRequired: 2 },
    '広島': { basePrice: 32, minBid: 28, researchRequired: 3 },
    '仙台': { basePrice: 36, minBid: 32, researchRequired: 4 },
    '札幌': { basePrice: 40, minBid: 36, researchRequired: 5 },
    '東京': { basePrice: 44, minBid: 40, researchRequired: 6 }
};

// ============================================
// 会社状態クラス
// ============================================
class Company {
    constructor(name = 'テスト会社') {
        this.name = name;
        this.cash = 100;
        this.equity = 300;
        this.materials = 3;
        this.wip = 0;
        this.products = 3;
        this.workers = 1;
        this.salesmen = 1;
        this.machines = [{ type: 'small', attachments: 0 }];
        this.chips = { research: 0, education: 0, advertising: 0 };
        this.nextPeriodChips = { research: 0, education: 0, advertising: 0 };
        this.carriedOverChips = { research: 0, education: 0, advertising: 0 };
        this.totalSales = 0;
        this.totalVQ = 0;
    }

    clone() {
        const c = new Company(this.name);
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
        c.totalSales = this.totalSales;
        c.totalVQ = this.totalVQ;
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

    getMaxPrice() {
        return 20 + this.chips.research * 4;
    }
}

// ============================================
// ゲームシミュレーター
// ============================================
class GameSimulator {
    constructor() {
        this.company = new Company();
        this.period = 2;
        this.row = 1;
        this.log = [];
    }

    reset() {
        this.company = new Company();
        this.period = 2;
        this.row = 1;
        this.log = [];
    }

    // F計算（正確版）
    calculateF(company, period) {
        const baseSalary = MG_CONSTANTS.BASE_SALARY[period];
        const halfSalary = Math.round(baseSalary / 2);

        const machineCount = company.machines.length;
        const machineSalary = machineCount * baseSalary;
        const workerSalary = company.workers * baseSalary;
        const salesmanSalary = company.salesmen * baseSalary;
        const personnelBonus = (company.workers + company.salesmen) * halfSalary;
        const totalSalary = machineSalary + workerSalary + salesmanSalary + personnelBonus;

        // 減価償却
        let depreciation = 0;
        company.machines.forEach(m => {
            if (m.type === 'small') {
                depreciation += m.attachments > 0
                    ? (period === 2 ? 13 : 26)
                    : (period === 2 ? 10 : 20);
            } else {
                depreciation += period === 2 ? 20 : 40;
            }
        });

        // チップコスト
        let chipCost = 0;
        if (period === 2) {
            chipCost = (company.chips.research + company.chips.education + company.chips.advertising) * 20;
        } else {
            // 繰越20円 + 特急40円
            const carried = company.carriedOverChips;
            chipCost += (carried.research + carried.education + carried.advertising) * 20;
            const urgent = {
                research: Math.max(0, company.chips.research - carried.research),
                education: Math.max(0, company.chips.education - carried.education),
                advertising: Math.max(0, company.chips.advertising - carried.advertising)
            };
            chipCost += (urgent.research + urgent.education + urgent.advertising) * 40;
            chipCost += (company.nextPeriodChips.research + company.nextPeriodChips.education + company.nextPeriodChips.advertising) * 20;
        }

        return totalSalary + depreciation + chipCost;
    }

    // 行動を実行
    executeAction(action) {
        const c = this.company;

        switch (action.type) {
            case 'BUY_MATERIALS':
                const qty = action.qty || 1;
                if (c.cash >= qty * 10) {
                    c.materials += qty;
                    c.cash -= qty * 10;
                    return true;
                }
                return false;

            case 'PRODUCE':
                const mfgCap = c.getMfgCapacity();
                if (mfgCap > 0 && (c.wip > 0 || c.materials > 0)) {
                    const complete = Math.min(c.wip, mfgCap);
                    const start = Math.min(c.materials, mfgCap);
                    c.products += complete;
                    c.wip = c.wip - complete + start;
                    c.materials -= start;
                    c.cash -= complete; // 完成賃金
                    c.totalVQ += complete * 10;
                    return true;
                }
                return false;

            case 'SELL':
                const salesCap = c.getSalesCapacity();
                const sellQty = Math.min(action.qty || 1, c.products, salesCap);
                if (sellQty > 0) {
                    const price = action.price || (20 + c.chips.research * 4);
                    const revenue = sellQty * price;
                    c.products -= sellQty;
                    c.cash += revenue;
                    c.totalSales += revenue;
                    return true;
                }
                return false;

            case 'BUY_CHIP':
                const chipCost = this.period === 2 ? 20 : 40;
                if (c.cash >= chipCost) {
                    c.chips[action.chipType]++;
                    c.cash -= chipCost;
                    return true;
                }
                return false;

            case 'BUY_NEXT_CHIP':
                if (this.period >= 2 && c.cash >= 20) {
                    c.nextPeriodChips[action.chipType]++;
                    c.cash -= 20;
                    return true;
                }
                return false;

            case 'BUY_ATTACHMENT':
                const machine = c.machines.find(m => m.type === 'small' && m.attachments === 0);
                if (machine && c.cash >= 30) {
                    machine.attachments = 1;
                    c.cash -= 30;
                    return true;
                }
                return false;

            case 'HIRE_WORKER':
                if (c.cash >= 5) {
                    c.workers++;
                    c.cash -= 5;
                    return true;
                }
                return false;

            case 'HIRE_SALESMAN':
                if (c.cash >= 5) {
                    c.salesmen++;
                    c.cash -= 5;
                    return true;
                }
                return false;

            case 'WAIT':
                return true;
        }
        return false;
    }

    // 決算処理
    processSettlement() {
        const c = this.company;
        const period = this.period;

        // MQ計算
        const PQ = c.totalSales;
        const VQ = c.totalVQ;
        const MQ = PQ - VQ;

        // F計算
        const F = this.calculateF(c, period);

        // G計算
        const G = MQ - F;

        // 税金
        let tax = 0;
        if (c.equity > MG_CONSTANTS.TAX_THRESHOLD && G > 0) {
            tax = Math.round(G * MG_CONSTANTS.TAX_RATE);
        }

        // 自己資本更新
        const netG = G - tax;
        c.equity += netG;

        // リセット
        c.totalSales = 0;
        c.totalVQ = 0;

        // チップ繰越
        c.carriedOverChips = { ...c.nextPeriodChips };
        c.chips = { ...c.nextPeriodChips };
        c.nextPeriodChips = { research: 0, education: 0, advertising: 0 };

        this.log.push({
            period,
            PQ, VQ, MQ, F, G, tax, netG,
            equity: c.equity
        });

        return { PQ, VQ, MQ, F, G, tax, netG };
    }

    // 1期間シミュレート
    simulatePeriod(strategy) {
        const maxRows = MG_CONSTANTS.ROWS_BY_PERIOD[this.period];

        for (this.row = 1; this.row <= maxRows; this.row++) {
            const action = strategy(this.company, this.period, this.row);
            this.executeAction(action);
        }

        return this.processSettlement();
    }

    // フルゲームシミュレート
    simulateFullGame(strategy) {
        this.reset();

        for (this.period = 2; this.period <= 5; this.period++) {
            this.simulatePeriod(strategy);
        }

        return {
            finalEquity: this.company.equity,
            success: this.company.equity >= 450,
            log: this.log
        };
    }
}

// ============================================
// 戦略定義
// ============================================

// v8最適戦略
function v8OptimalStrategy(company, period, row) {
    const c = company;

    if (period === 2) {
        // 2期: R2E1 + 次期R1
        if (row === 1 && c.cash >= 20) return { type: 'BUY_CHIP', chipType: 'research' };
        if (row === 2 && c.cash >= 20) return { type: 'BUY_CHIP', chipType: 'research' };
        if (row === 3 && c.cash >= 20) return { type: 'BUY_CHIP', chipType: 'education' };
        if (row === 4 && c.products > 0) return { type: 'SELL', qty: 1, price: 28 };
        if (row === 5 && c.cash >= 20) return { type: 'BUY_NEXT_CHIP', chipType: 'research' };
        if (row <= 8 && c.materials > 0) return { type: 'PRODUCE' };
        if (row <= 12 && c.cash >= 30) return { type: 'BUY_MATERIALS', qty: 3 };
        if (c.wip > 0 || c.materials > 0) return { type: 'PRODUCE' };
        if (c.products > 0) return { type: 'SELL', qty: Math.min(c.products, c.getSalesCapacity()), price: 28 };
    }

    if (period >= 3) {
        // 製造→販売サイクル
        if (c.products > 0 && c.getSalesCapacity() > 0) {
            return { type: 'SELL', qty: Math.min(c.products, c.getSalesCapacity()), price: c.getMaxPrice() };
        }
        if ((c.wip > 0 || c.materials > 0) && c.getMfgCapacity() > 0) {
            return { type: 'PRODUCE' };
        }
        if (c.materials < 3 && c.cash >= 30) {
            return { type: 'BUY_MATERIALS', qty: 3 };
        }
    }

    return { type: 'WAIT' };
}

// ランダム戦略（ベースライン）
function randomStrategy(company, period, row) {
    const actions = [];
    const c = company;

    if (c.products > 0 && c.getSalesCapacity() > 0) {
        actions.push({ type: 'SELL', qty: 1, price: 20 + c.chips.research * 4 });
    }
    if ((c.wip > 0 || c.materials > 0) && c.getMfgCapacity() > 0) {
        actions.push({ type: 'PRODUCE' });
    }
    if (c.cash >= 30) {
        actions.push({ type: 'BUY_MATERIALS', qty: 2 });
    }
    if (c.cash >= 20) {
        actions.push({ type: 'BUY_CHIP', chipType: 'research' });
    }
    actions.push({ type: 'WAIT' });

    return actions[Math.floor(Math.random() * actions.length)];
}

// ============================================
// シミュレーション実行
// ============================================
function runSimulations(strategy, name, count = 1000) {
    const simulator = new GameSimulator();
    const results = [];

    console.log(`\n【${name}】${count}回シミュレーション実行中...`);

    for (let i = 0; i < count; i++) {
        const result = simulator.simulateFullGame(strategy);
        results.push(result.finalEquity);
    }

    // 統計計算
    const avg = results.reduce((a, b) => a + b, 0) / count;
    const min = Math.min(...results);
    const max = Math.max(...results);
    const successRate = results.filter(e => e >= 450).length / count * 100;

    // 標準偏差
    const variance = results.reduce((sum, e) => sum + Math.pow(e - avg, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    console.log('─'.repeat(50));
    console.log(`平均自己資本: ¥${avg.toFixed(1)}`);
    console.log(`最小: ¥${min} | 最大: ¥${max}`);
    console.log(`標準偏差: ${stdDev.toFixed(1)}`);
    console.log(`450達成率: ${successRate.toFixed(1)}%`);
    console.log('─'.repeat(50));

    return { avg, min, max, stdDev, successRate, results };
}

// ============================================
// メイン実行
// ============================================
console.log('═'.repeat(60));
console.log('    MG AI シミュレーションテスト');
console.log('═'.repeat(60));

// v8最適戦略テスト
const v8Result = runSimulations(v8OptimalStrategy, 'v8最適戦略', 1000);

// ランダム戦略テスト（比較用）
const randomResult = runSimulations(randomStrategy, 'ランダム戦略', 1000);

// 比較
console.log('\n【戦略比較】');
console.log('═'.repeat(60));
console.log(`v8最適戦略: 平均¥${v8Result.avg.toFixed(0)}, 450達成率${v8Result.successRate.toFixed(1)}%`);
console.log(`ランダム戦略: 平均¥${randomResult.avg.toFixed(0)}, 450達成率${randomResult.successRate.toFixed(1)}%`);
console.log(`差分: +¥${(v8Result.avg - randomResult.avg).toFixed(0)}, +${(v8Result.successRate - randomResult.successRate).toFixed(1)}pp`);
console.log('═'.repeat(60));

// 詳細ログ出力（1回分）
console.log('\n【v8戦略 詳細ログ（1ゲーム）】');
const detailSim = new GameSimulator();
detailSim.simulateFullGame(v8OptimalStrategy);
console.log('期 │ PQ    │ VQ   │ MQ   │ F    │ G    │ 税   │ 純G  │ 自己資本');
console.log('──┼───────┼──────┼──────┼──────┼──────┼──────┼──────┼─────────');
detailSim.log.forEach(l => {
    console.log(`${l.period}  │ ${String(l.PQ).padStart(5)} │ ${String(l.VQ).padStart(4)} │ ${String(l.MQ).padStart(4)} │ ${String(l.F).padStart(4)} │ ${String(l.G).padStart(4)} │ ${String(l.tax).padStart(4)} │ ${String(l.netG).padStart(4)} │ ${l.equity}`);
});
