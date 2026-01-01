/**
 * MG シミュレーション v3
 * 改善点:
 * 1. 販売勝率を現実的に調整（研究なしでも売れる）
 * 2. 市場選択の戦略を追加（売れない時は低い市場へ）
 * 3. リスクカード確率を実際のゲームに近づける
 * 4. 生産サイクルの最適化
 */

const RULES = {
    MARKETS: [
        { name: '仙台', buy: 10, sell: 40 },
        { name: '札幌', buy: 11, sell: 36 },
        { name: '福岡', buy: 12, sell: 32 },
        { name: '名古屋', buy: 13, sell: 28 },
        { name: '大阪', buy: 14, sell: 24 },
        { name: '東京', buy: 15, sell: 20 }
    ],
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    CHIP_COST: 20,
    EXPRESS_CHIP_COST: 40,
    INSURANCE_COST: 5,
    PROCESSING_COST: 1,
    HIRING_COST: 20,
    WAREHOUSE_COST: 20,
    SMALL_MACHINE: { cost: 100, capacity: 1, depreciation: 10 },
    LARGE_MACHINE: { cost: 200, capacity: 4, depreciation: 20 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    WIP_CAPACITY: 10,
    MATERIAL_BASE: 10,
    PRODUCT_BASE: 10,
    WAREHOUSE_BONUS: 12,
    LONG_TERM_RATE: 0.10,
    SHORT_TERM_RATE: 0.20,
    // リスクカード: 75枚中15枚がリスク、60枚が意思決定
    // 実効リスク確率 = 15/75 * 有効率(0.5) = 10%
    RISK_PROBABILITY: 0.10,
    TARGET_EQUITY: 450
};

// 6人プレイでの入札勝率テーブル
// 研究チップ数と入札価格による勝率
function getBidWinRate(research, price, period) {
    // コール価格 = 入札価格 - (研究×2 + 親ボーナス2)
    // 親ボーナスは1/6の確率
    const callPrice = price - research * 2;
    const parentBonus = 2;

    // 6人中の競争。研究チップ多い = 有利
    // 期が進むと競争が激しくなる
    const periodFactor = period === 2 ? 1.0 : period === 3 ? 0.95 : period === 4 ? 0.9 : 0.85;

    // 高い市場ほど競争が少ない
    if (price >= 32) {  // 福岡以上
        return Math.min(0.95, 0.70 + research * 0.05) * periodFactor;
    } else if (price >= 28) {  // 名古屋
        return Math.min(0.90, 0.60 + research * 0.08) * periodFactor;
    } else if (price >= 24) {  // 大阪
        return Math.min(0.85, 0.55 + research * 0.10) * periodFactor;
    } else {  // 東京
        return Math.min(0.75, 0.50 + research * 0.08) * periodFactor;
    }
}

// 研究チップ数に応じた推奨入札価格
function getRecommendedBid(research, period, failCount = 0) {
    // 失敗が続いたら低い市場にフォールバック
    const fallback = Math.min(failCount, 3);

    if (research >= 4) {
        const prices = [32, 28, 24, 20];
        return prices[Math.min(fallback, prices.length - 1)];
    } else if (research >= 2) {
        const prices = [28, 24, 20, 20];
        return prices[Math.min(fallback, prices.length - 1)];
    } else if (research >= 1) {
        const prices = [24, 20, 20, 20];
        return prices[Math.min(fallback, prices.length - 1)];
    } else {
        // 研究0でも大阪¥24で勝てることはある
        const prices = [24, 20, 20, 20];
        return prices[Math.min(fallback, prices.length - 1)];
    }
}

// 拡張戦略セット
const STRATEGIES = [
    // シンプル戦略
    { name: 'ZERO', chips: {r:0, e:0, a:0}, invest: [] },
    { name: 'R1', chips: {r:1, e:0, a:0}, invest: [] },
    { name: 'R2', chips: {r:2, e:0, a:0}, invest: [] },
    { name: 'R3', chips: {r:3, e:0, a:0}, invest: [] },
    { name: 'R4', chips: {r:4, e:0, a:0}, invest: [] },
    { name: 'E1', chips: {r:0, e:1, a:0}, invest: [] },
    { name: 'E2', chips: {r:0, e:2, a:0}, invest: [] },

    // 研究+教育（最有力候補）
    { name: 'R1E1', chips: {r:1, e:1, a:0}, invest: [] },
    { name: 'R1E2', chips: {r:1, e:2, a:0}, invest: [] },
    { name: 'R2E1', chips: {r:2, e:1, a:0}, invest: [] },
    { name: 'R2E2', chips: {r:2, e:2, a:0}, invest: [] },
    { name: 'R3E1', chips: {r:3, e:1, a:0}, invest: [] },
    { name: 'R3E2', chips: {r:3, e:2, a:0}, invest: [] },

    // 翌期チップ戦略（2期で翌期チップを購入、3期で適用）
    { name: 'R0E2_N1', chips: {r:0, e:2, a:0}, invest: [], nextChipsP2: {r:1, e:0} },
    { name: 'R1E2_N1', chips: {r:1, e:2, a:0}, invest: [], nextChipsP2: {r:1, e:0} },
    { name: 'R2E2_N1', chips: {r:2, e:2, a:0}, invest: [], nextChipsP2: {r:1, e:0} },
    { name: 'R2E1_N1', chips: {r:2, e:1, a:0}, invest: [], nextChipsP2: {r:1, e:0} },
    { name: 'R2E2_N2', chips: {r:2, e:2, a:0}, invest: [], nextChipsP2: {r:2, e:0} },

    // 借入戦略（3期から長期借入）
    { name: 'R2E1_B50', chips: {r:2, e:1, a:0}, invest: [], borrow3: 50 },
    { name: 'R2E2_B50', chips: {r:2, e:2, a:0}, invest: [], borrow3: 50 },
    { name: 'R2E2_B100', chips: {r:2, e:2, a:0}, invest: [], borrow3: 100 },
    { name: 'R3E1_B50', chips: {r:3, e:1, a:0}, invest: [], borrow3: 50 },

    // 機械投資（3期で小型機械追加）
    { name: 'R2E1_SM3', chips: {r:2, e:1, a:0}, invest: ['sm3'] },
    { name: 'R2E2_SM3', chips: {r:2, e:2, a:0}, invest: ['sm3'] },
    { name: 'R3E1_SM3', chips: {r:3, e:1, a:0}, invest: ['sm3'] },

    // 倉庫戦略
    { name: 'R2E1_WH', chips: {r:2, e:1, a:0}, invest: ['wh'] },
    { name: 'R2E2_WH', chips: {r:2, e:2, a:0}, invest: ['wh'] },

    // 複合戦略
    { name: 'FULL1', chips: {r:3, e:2, a:0}, invest: ['sm3'], borrow3: 50, nextChipsP2: {r:1, e:0} },
    { name: 'FULL2', chips: {r:2, e:2, a:0}, invest: ['sm3'], borrow3: 100, nextChipsP2: {r:1, e:0} },

    // 広告戦略
    { name: 'R2E1A1', chips: {r:2, e:1, a:1}, invest: [] },
    { name: 'R1E1A2', chips: {r:1, e:1, a:2}, invest: [] }
];

class Simulator {
    createState(strategy) {
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
            chips: { research: 0, education: 0, advertising: 0, computer: 1, insurance: 1 },
            nextPeriodChips: { research: 0, education: 0 },
            additionalF: 0,
            hasExceeded300: false,
            strategy,
            totalSalesCount: 0,
            sellFailCount: 0,  // 連続販売失敗カウント
            periodSales: []    // 各期の販売数
        };
    }

    // 製造能力
    mfgCap(s) {
        if (s.workers === 0) return 0;
        const machCap = s.machinesSmall + s.machinesLarge * 4;
        const numMach = s.machinesSmall + s.machinesLarge;
        // ワーカーが機械より少ない場合、ワーカー数が上限
        if (s.workers < numMach) return s.workers;
        // 機械能力 + PC + 教育(1人まで)
        return machCap + s.chips.computer + Math.min(s.chips.education, s.workers);
    }

    // 販売能力
    salesCap(s) {
        if (s.salesmen === 0) return 0;
        const base = s.salesmen * 2;
        // 広告チップ: 各セールスマンに最大2個まで → 各+2
        const adBonus = Math.min(s.chips.advertising * 2, s.salesmen * 2);
        // 教育: セールスマン1人につき1個まで → 各+1
        const eduBonus = Math.min(s.chips.education, s.salesmen);
        return base + adBonus + eduBonus;
    }

    matCap(s) { return RULES.MATERIAL_BASE + s.warehouses * RULES.WAREHOUSE_BONUS; }
    prodCap(s) { return RULES.PRODUCT_BASE + s.warehouses * RULES.WAREHOUSE_BONUS; }

    getMaterialCost() {
        const r = Math.random();
        if (r < 0.15) return 10;      // 仙台 15%
        if (r < 0.35) return 11;      // 札幌 20%
        if (r < 0.60) return 12;      // 福岡 25%
        if (r < 0.85) return 13;      // 名古屋 25%
        return 14;                     // 大阪 15%
    }

    applyRisk(s, period) {
        // 実際のリスクカード効果
        const effects = [
            // ネガティブ
            () => { s.additionalF += 5; return 'クレーム: F+5'; },
            () => { s.additionalF += 10; return 'PCトラブル: F+10'; },
            () => { s.additionalF += 10; return '設計トラブル: F+10'; },
            () => {
                if (period > 2) { s.cash = Math.max(0, s.cash - 30); return '得意先倒産: -30円'; }
                return '得意先倒産(2期免除)';
            },
            () => {
                if (s.chips.research > 0) { s.chips.research--; return '研究失敗: 青-1'; }
                return '研究失敗(効果なし)';
            },
            () => {
                if (s.wip > 0) { s.wip--; return '製造ミス: 仕掛-1'; }
                return '製造ミス(効果なし)';
            },
            () => {
                const loss = s.materials;
                s.materials = 0;
                if (s.chips.insurance > 0 && loss > 0) {
                    s.cash += loss * 8;
                    return `火災: 材料${loss}損(保険+${loss*8})`;
                }
                return loss > 0 ? `火災: 材料${loss}損` : '火災(効果なし)';
            },
            () => {
                const loss = Math.min(2, s.products);
                s.products -= loss;
                if (s.chips.insurance > 0 && loss > 0) {
                    s.cash += loss * 10;
                    return `盗難: 製品${loss}損(保険+${loss*10})`;
                }
                return loss > 0 ? `盗難: 製品${loss}損` : '盗難(効果なし)';
            },

            // ポジティブ
            () => {
                if (s.products > 0 && s.chips.education > 0) {
                    const qty = Math.min(5, s.products, this.salesCap(s));
                    s.products -= qty;
                    s.cash += qty * 32;
                    s.totalSalesCount += qty;
                    return `教育成功: ${qty}個×¥32`;
                }
                return '教育成功(条件なし)';
            },
            () => {
                if (s.products > 0 && s.chips.research > 0) {
                    const qty = Math.min(s.chips.research * 2, s.products, this.salesCap(s));
                    s.products -= qty;
                    s.cash += qty * 32;
                    s.totalSalesCount += qty;
                    return `研究成功: ${qty}個×¥32`;
                }
                return '研究成功(条件なし)';
            },
            () => {
                const buyQty = Math.min(5, this.matCap(s) - s.materials, Math.floor(s.cash / 10));
                if (buyQty > 0) {
                    s.materials += buyQty;
                    s.cash -= buyQty * 10;
                    return `特別仕入: 材料${buyQty}×¥10`;
                }
                return '特別仕入(購入なし)';
            },

            // 効果なし（多め）
            () => '消費者運動(効果なし)',
            () => '労災発生(効果なし)',
            () => '景気変動(効果なし)',
            () => '逆回り(効果なし)',
            () => '情報カード(効果なし)',
            () => '指導(効果なし)'
        ];

        return effects[Math.floor(Math.random() * effects.length)]();
    }

    simulatePeriod(s, period) {
        const maxRows = RULES.MAX_ROWS[period];
        let row = 1;
        let sales = 0, matCost = 0, procCost = 0, soldCount = 0;
        const strat = s.strategy;

        // 人件費（3期以降は変動）
        const wageMulti = period >= 3 ? (0.9 + Math.random() * 0.4) : 1.0;  // 0.9-1.3
        const wage = Math.round(RULES.WAGE_BASE[period] * wageMulti);

        // === 期首処理 ===

        // 3期以降：長期借入
        if (period >= 3 && strat.borrow3 && s.loans < strat.borrow3) {
            const amt = Math.min(strat.borrow3 - s.loans, 300 - s.loans);
            if (amt > 0) {
                const int = Math.floor(amt * RULES.LONG_TERM_RATE);
                s.loans += amt;
                s.cash += amt - int;
            }
        }

        // PC・保険は必須
        s.chips.computer = 1;
        s.chips.insurance = 1;
        s.cash -= RULES.CHIP_COST + RULES.INSURANCE_COST;
        row++;

        // === 2期：初期投資 ===
        if (period === 2) {
            // チップ購入
            for (let i = 0; i < strat.chips.r && s.cash >= RULES.CHIP_COST; i++) {
                s.chips.research++; s.cash -= RULES.CHIP_COST; row++;
            }
            for (let i = 0; i < strat.chips.e && s.cash >= RULES.CHIP_COST; i++) {
                s.chips.education++; s.cash -= RULES.CHIP_COST; row++;
            }
            for (let i = 0; i < strat.chips.a && s.cash >= RULES.CHIP_COST; i++) {
                s.chips.advertising++; s.cash -= RULES.CHIP_COST; row++;
            }

            // 翌期チップ購入（2期購入→3期適用）
            if (strat.nextChipsP2) {
                for (let i = 0; i < (strat.nextChipsP2.r || 0) && s.cash >= RULES.CHIP_COST; i++) {
                    s.nextPeriodChips.research++; s.cash -= RULES.CHIP_COST; row++;
                }
                for (let i = 0; i < (strat.nextChipsP2.e || 0) && s.cash >= RULES.CHIP_COST; i++) {
                    s.nextPeriodChips.education++; s.cash -= RULES.CHIP_COST; row++;
                }
            }

            // 倉庫
            if (strat.invest.includes('wh') && s.cash >= RULES.WAREHOUSE_COST) {
                s.warehouses++; s.cash -= RULES.WAREHOUSE_COST; row++;
            }
        }

        // === 3期：翌期チップ適用 + 追加投資 ===
        if (period === 3) {
            // 翌期チップ適用
            s.chips.research += s.nextPeriodChips.research;
            s.chips.education += s.nextPeriodChips.education;
            s.nextPeriodChips = { research: 0, education: 0 };

            // 機械投資
            if (strat.invest.includes('sm3') && s.cash >= RULES.SMALL_MACHINE.cost + RULES.HIRING_COST) {
                s.machinesSmall++; s.cash -= RULES.SMALL_MACHINE.cost; row++;
                s.workers++; s.cash -= RULES.HIRING_COST; row++;
            }
            if (strat.invest.includes('lm3') && s.cash >= RULES.LARGE_MACHINE.cost + RULES.HIRING_COST) {
                s.machinesLarge++; s.cash -= RULES.LARGE_MACHINE.cost; row++;
                s.workers++; s.cash -= RULES.HIRING_COST; row++;
            }
        }

        // === メインループ ===
        const usableRows = maxRows - 1;  // 期末処理で行を使わない
        let consecutiveFails = 0;

        while (row <= usableRows) {
            // リスクカード判定
            if (Math.random() < RULES.RISK_PROBABILITY) {
                this.applyRisk(s, period);
                row++;
                continue;
            }

            const mc = this.mfgCap(s);
            const sc = this.salesCap(s);

            // 1. 販売を優先
            if (s.products > 0 && sc > 0) {
                const sellQty = Math.min(s.products, sc);
                const bidPrice = getRecommendedBid(s.chips.research, period, consecutiveFails);
                const winRate = getBidWinRate(s.chips.research, bidPrice, period);

                if (Math.random() < winRate) {
                    const rev = sellQty * bidPrice;
                    s.products -= sellQty;
                    s.cash += rev;
                    sales += rev;
                    soldCount += sellQty;
                    s.totalSalesCount += sellQty;
                    consecutiveFails = 0;
                } else {
                    consecutiveFails++;
                }
                row++;
                continue;
            }

            // 2. 完成（仕掛品→製品）
            if (s.wip > 0 && mc > 0) {
                const compQty = Math.min(s.wip, mc, this.prodCap(s) - s.products);
                if (compQty > 0) {
                    s.wip -= compQty;
                    s.products += compQty;
                    const cost = compQty * RULES.PROCESSING_COST;
                    s.cash -= cost;
                    procCost += cost;
                }
                row++;

                // 同時に投入も試みる
                if (s.materials > 0 && s.wip < RULES.WIP_CAPACITY) {
                    const inpQty = Math.min(s.materials, mc, RULES.WIP_CAPACITY - s.wip);
                    if (inpQty > 0) {
                        s.materials -= inpQty;
                        s.wip += inpQty;
                        const ic = inpQty * RULES.PROCESSING_COST;
                        s.cash -= ic;
                        procCost += ic;
                    }
                }
                continue;
            }

            // 3. 投入（材料→仕掛品）
            if (s.materials > 0 && mc > 0 && s.wip < RULES.WIP_CAPACITY) {
                const inpQty = Math.min(s.materials, mc, RULES.WIP_CAPACITY - s.wip);
                if (inpQty > 0) {
                    s.materials -= inpQty;
                    s.wip += inpQty;
                    const cost = inpQty * RULES.PROCESSING_COST;
                    s.cash -= cost;
                    procCost += cost;
                }
                row++;
                continue;
            }

            // 4. 仕入れ
            const space = this.matCap(s) - s.materials;
            if (space > 0 && s.cash >= 10) {
                const buyQty = Math.min(mc, space, Math.floor(s.cash / 14));  // 最悪の仕入れ価格で計算
                if (buyQty > 0) {
                    const price = this.getMaterialCost();
                    const actualQty = Math.min(buyQty, Math.floor(s.cash / price));
                    if (actualQty > 0) {
                        s.materials += actualQty;
                        s.cash -= actualQty * price;
                        matCost += actualQty * price;
                    }
                }
                row++;
                continue;
            }

            // 何もできない
            break;
        }

        // === 期末計算 ===
        const machCount = s.machinesSmall + s.machinesLarge;
        const persCount = s.workers + s.salesmen;
        const machCost = machCount * wage;
        const persCost = persCount * wage;
        const deprec = s.machinesSmall * RULES.SMALL_MACHINE.depreciation + s.machinesLarge * RULES.LARGE_MACHINE.depreciation;
        const chipCost = (s.chips.research + s.chips.education + s.chips.advertising + s.chips.computer) * RULES.CHIP_COST
                       + s.chips.insurance * RULES.INSURANCE_COST;
        const whCost = s.warehouses * RULES.WAREHOUSE_COST;

        const fixedCost = machCost + persCost + deprec + chipCost + whCost + (s.additionalF || 0);

        // MQ = 売上 - 材料費 - 加工費
        const MQ = sales - matCost - procCost;
        const opProfit = MQ - fixedCost;
        const interest = Math.floor(s.loans * RULES.LONG_TERM_RATE) + Math.floor(s.shortLoans * RULES.SHORT_TERM_RATE);
        const preTax = opProfit - interest;

        // 税金・配当
        const newEq = s.equity + preTax;
        let tax = 0, div = 0;

        if (newEq > 300) {
            if (!s.hasExceeded300) {
                const excess = newEq - 300;
                tax = Math.round(excess * 0.5);
                div = Math.round(excess * 0.2);
                s.hasExceeded300 = true;
            } else if (preTax > 0) {
                tax = Math.round(preTax * 0.5);
                div = Math.round(preTax * 0.1);
            }
        }

        const netProfit = preTax - tax;

        // 支払い
        s.cash -= fixedCost + tax + div;

        // 現金不足
        if (s.cash < 0) {
            const need = -s.cash;
            const loan = Math.ceil(need / 0.8 / 50) * 50;
            s.shortLoans += loan;
            s.cash += loan * 0.8;
        }

        s.equity += netProfit;
        s.periodSales.push(soldCount);
        s.additionalF = 0;  // リセット

        return { sales, MQ, fixedCost, netProfit, soldCount };
    }

    runGame(strategy) {
        const s = this.createState(strategy);
        for (let p = 2; p <= 5; p++) {
            this.simulatePeriod(s, p);
        }
        return {
            strategy: strategy.name,
            equity: s.equity,
            success: s.equity >= RULES.TARGET_EQUITY,
            totalSold: s.totalSalesCount,
            periodSales: s.periodSales
        };
    }

    runMultiple(strategy, runs) {
        const results = [];
        for (let i = 0; i < runs; i++) {
            results.push(this.runGame(strategy));
        }

        const eqs = results.map(r => r.equity);
        const succ = results.filter(r => r.success).length;
        const sold = results.map(r => r.totalSold);

        return {
            name: strategy.name,
            runs,
            successRate: (succ / runs * 100).toFixed(2),
            avgEq: Math.round(eqs.reduce((a,b) => a+b, 0) / runs),
            maxEq: Math.max(...eqs),
            minEq: Math.min(...eqs),
            avgSold: Math.round(sold.reduce((a,b) => a+b, 0) / runs),
            successCount: succ
        };
    }

    runAll(runsEach = 1000) {
        console.log('='.repeat(70));
        console.log(`MG シミュレーション v3 - ${STRATEGIES.length}戦略 × ${runsEach}回 = ${STRATEGIES.length * runsEach}回`);
        console.log('='.repeat(70));

        const all = [];

        for (const strat of STRATEGIES) {
            const r = this.runMultiple(strat, runsEach);
            all.push(r);
            console.log(`${strat.name.padEnd(15)} | ${r.successRate.padStart(6)}% | avg¥${r.avgEq.toString().padStart(4)} | max¥${r.maxEq.toString().padStart(4)} | sold${r.avgSold.toString().padStart(3)}`);
        }

        all.sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));

        console.log('\n' + '='.repeat(70));
        console.log('TOP 15 成功率');
        console.log('='.repeat(70));
        for (let i = 0; i < Math.min(15, all.length); i++) {
            const r = all[i];
            console.log(`${(i+1).toString().padStart(2)}. ${r.name.padEnd(15)} | ${r.successRate.padStart(6)}% | avg¥${r.avgEq} | max¥${r.maxEq}`);
        }

        // 平均自己資本でもソート
        const byAvg = [...all].sort((a, b) => b.avgEq - a.avgEq);
        console.log('\n' + '='.repeat(70));
        console.log('TOP 10 平均自己資本');
        console.log('='.repeat(70));
        for (let i = 0; i < Math.min(10, byAvg.length); i++) {
            const r = byAvg[i];
            console.log(`${(i+1).toString().padStart(2)}. ${r.name.padEnd(15)} | avg¥${r.avgEq} | max¥${r.maxEq} | ${r.successRate}%`);
        }

        return all;
    }
}

// 実行
const sim = new Simulator();
const results = sim.runAll(1000);

// 成功戦略の詳細
console.log('\n' + '='.repeat(70));
console.log('成功戦略の詳細');
console.log('='.repeat(70));

const successes = results.filter(r => parseFloat(r.successRate) > 0);
console.log(`成功可能戦略: ${successes.length}/${STRATEGIES.length}`);

successes.forEach(r => {
    const strat = STRATEGIES.find(s => s.name === r.name);
    console.log(`\n${r.name}: 成功率${r.successRate}% (${r.successCount}/${r.runs}回)`);
    console.log(`  チップ: R${strat.chips.r} E${strat.chips.e} A${strat.chips.a}`);
    console.log(`  平均売上: ${r.avgSold}個, 平均自己資本: ¥${r.avgEq}`);
});
