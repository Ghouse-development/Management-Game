/**
 * MG シミュレーション v4
 * 改善点:
 * 1. 販売失敗時に即座に低価格市場へ切り替え
 * 2. 生産サイクルの完全最適化（1行で完成+投入+仕入れ）
 * 3. より多くの戦略バリエーション
 * 4. 入札勝率を現実的に調整
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
    // 75枚中15枚リスク、うち約半分が効果なし = 約10%の実効リスク
    RISK_PROBABILITY: 0.08,
    TARGET_EQUITY: 450
};

// 6人プレイでの入札勝率
// 研究チップが多いほど高価格で勝ちやすい
function getBidResult(research, tryPrice, period) {
    // 価格競争力 = 研究×2 + 親ボーナス(2、16%の確率)
    const isParent = Math.random() < (1/6);
    const competitiveness = research * 2 + (isParent ? 2 : 0);

    // コール価格 = 入札価格 - 競争力
    const callPrice = tryPrice - competitiveness;

    // 競合5人の入札を想定
    // 期が進むと競争が激化
    const avgCompetitor = period === 2 ? 1.5 : period === 3 ? 2.0 : period === 4 ? 2.5 : 3.0;
    const competitorBids = [];
    for (let i = 0; i < 5; i++) {
        // 競合の研究チップ数: 0-4でランダム（期が進むと増える）
        const compResearch = Math.floor(Math.random() * (avgCompetitor + 2));
        const compParent = Math.random() < (1/6);
        const compComp = compResearch * 2 + (compParent ? 2 : 0);
        // 競合の入札価格: 24-32の範囲
        const compBid = 24 + Math.floor(Math.random() * 9);
        competitorBids.push(compBid - compComp);
    }

    // 自分のコール価格が最も低ければ勝ち
    const minCompCall = Math.min(...competitorBids);
    const won = callPrice < minCompCall || (callPrice === minCompCall && Math.random() < 0.5);

    return { won, price: tryPrice };
}

// 戦略に応じた販売価格選択
function getSellingPrice(research, period, productCount) {
    // 製品が多い時は低価格でも売りたい
    const desperation = productCount > 6 ? 1 : productCount > 3 ? 0 : 0;

    if (research >= 4) {
        return [32, 28, 24][desperation] || 24;
    } else if (research >= 3) {
        return [28, 24, 20][desperation] || 20;
    } else if (research >= 2) {
        return [28, 24, 20][desperation] || 20;
    } else if (research >= 1) {
        return [24, 20, 20][desperation] || 20;
    } else {
        // 研究0でも大阪¥24で勝てることはある
        return [24, 20, 20][desperation] || 20;
    }
}

// 拡張戦略セット
const STRATEGIES = [
    // ベースライン
    { name: 'ZERO', chips: {r:0, e:0, a:0}, invest: [] },

    // 教育のみ（前回分析で有効とされた）
    { name: 'E1', chips: {r:0, e:1, a:0}, invest: [] },
    { name: 'E2', chips: {r:0, e:2, a:0}, invest: [] },

    // 研究のみ
    { name: 'R1', chips: {r:1, e:0, a:0}, invest: [] },
    { name: 'R2', chips: {r:2, e:0, a:0}, invest: [] },
    { name: 'R3', chips: {r:3, e:0, a:0}, invest: [] },

    // 研究+教育（メイン戦略群）
    { name: 'R1E1', chips: {r:1, e:1, a:0}, invest: [] },
    { name: 'R1E2', chips: {r:1, e:2, a:0}, invest: [] },
    { name: 'R2E1', chips: {r:2, e:1, a:0}, invest: [] },
    { name: 'R2E2', chips: {r:2, e:2, a:0}, invest: [] },
    { name: 'R3E1', chips: {r:3, e:1, a:0}, invest: [] },
    { name: 'R3E2', chips: {r:3, e:2, a:0}, invest: [] },

    // 翌期チップ戦略
    { name: 'E2_N1', chips: {r:0, e:2, a:0}, invest: [], nextChips: {r:1} },
    { name: 'R2E2_N1', chips: {r:2, e:2, a:0}, invest: [], nextChips: {r:1} },
    { name: 'R2E1_N1', chips: {r:2, e:1, a:0}, invest: [], nextChips: {r:1} },

    // 3期借入戦略
    { name: 'E2_B50', chips: {r:0, e:2, a:0}, invest: [], borrow3: 50 },
    { name: 'R2E1_B50', chips: {r:2, e:1, a:0}, invest: [], borrow3: 50 },
    { name: 'R2E2_B50', chips: {r:2, e:2, a:0}, invest: [], borrow3: 50 },
    { name: 'R2E1_B100', chips: {r:2, e:1, a:0}, invest: [], borrow3: 100 },
    { name: 'R3E1_B50', chips: {r:3, e:1, a:0}, invest: [], borrow3: 50 },

    // 機械投資
    { name: 'R2E1_SM3', chips: {r:2, e:1, a:0}, invest: ['sm3'] },
    { name: 'R2E2_SM3', chips: {r:2, e:2, a:0}, invest: ['sm3'] },
    { name: 'R3E1_SM3', chips: {r:3, e:1, a:0}, invest: ['sm3'] },

    // 複合戦略
    { name: 'FULL1', chips: {r:3, e:2, a:0}, invest: ['sm3'], borrow3: 50, nextChips: {r:1} },
    { name: 'FULL2', chips: {r:2, e:2, a:0}, invest: ['sm3'], borrow3: 100 },
    { name: 'FULL3', chips: {r:2, e:1, a:0}, invest: ['sm3'], borrow3: 50, nextChips: {r:1} },

    // 低投資高効率
    { name: 'R1E1_B50', chips: {r:1, e:1, a:0}, invest: [], borrow3: 50 },
    { name: 'R0E1_B50', chips: {r:0, e:1, a:0}, invest: [], borrow3: 50 }
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
            totalSalesRevenue: 0,
            periodStats: []
        };
    }

    mfgCap(s) {
        if (s.workers === 0) return 0;
        const machCap = s.machinesSmall + s.machinesLarge * 4;
        const numMach = s.machinesSmall + s.machinesLarge;
        if (s.workers < numMach) return s.workers;
        // 機械能力 + PC(1) + 教育(ワーカー数まで)
        return machCap + s.chips.computer + Math.min(s.chips.education, s.workers);
    }

    salesCap(s) {
        if (s.salesmen === 0) return 0;
        const base = s.salesmen * 2;
        // 広告: セールスマン数×2まで
        const adBonus = Math.min(s.chips.advertising * 2, s.salesmen * 2);
        // 教育: セールスマン数まで
        const eduBonus = Math.min(s.chips.education, s.salesmen);
        return base + adBonus + eduBonus;
    }

    matCap(s) { return RULES.MATERIAL_BASE + s.warehouses * RULES.WAREHOUSE_BONUS; }
    prodCap(s) { return RULES.PRODUCT_BASE + s.warehouses * RULES.WAREHOUSE_BONUS; }

    getMaterialCost() {
        const r = Math.random();
        if (r < 0.15) return 10;      // 仙台
        if (r < 0.35) return 11;      // 札幌
        if (r < 0.60) return 12;      // 福岡
        if (r < 0.85) return 13;      // 名古屋
        return 14;                     // 大阪
    }

    applyRisk(s, period) {
        const effects = [
            // ネガティブ（軽め）
            () => { s.additionalF += 5; },
            () => { s.additionalF += 10; },
            () => { if (period > 2) s.cash = Math.max(0, s.cash - 30); },
            () => { if (s.chips.research > 0) s.chips.research--; },
            () => { if (s.wip > 0) s.wip--; },
            () => {
                const loss = s.materials;
                s.materials = 0;
                if (s.chips.insurance > 0 && loss > 0) s.cash += loss * 8;
            },
            () => {
                const loss = Math.min(2, s.products);
                s.products -= loss;
                if (s.chips.insurance > 0 && loss > 0) s.cash += loss * 10;
            },
            // ポジティブ
            () => {
                if (s.products > 0 && s.chips.education > 0) {
                    const qty = Math.min(5, s.products, this.salesCap(s));
                    s.products -= qty;
                    s.cash += qty * 32;
                    s.totalSalesCount += qty;
                    s.totalSalesRevenue += qty * 32;
                }
            },
            () => {
                if (s.products > 0 && s.chips.research > 0) {
                    const qty = Math.min(s.chips.research * 2, s.products, this.salesCap(s));
                    s.products -= qty;
                    s.cash += qty * 32;
                    s.totalSalesCount += qty;
                    s.totalSalesRevenue += qty * 32;
                }
            },
            () => {
                const buyQty = Math.min(5, this.matCap(s) - s.materials, Math.floor(s.cash / 10));
                if (buyQty > 0) {
                    s.materials += buyQty;
                    s.cash -= buyQty * 10;
                }
            },
            // 効果なし
            () => {}, () => {}, () => {}, () => {}, () => {}
        ];
        effects[Math.floor(Math.random() * effects.length)]();
    }

    simulatePeriod(s, period) {
        const maxRows = RULES.MAX_ROWS[period];
        let row = 1;
        let sales = 0, matCost = 0, procCost = 0, soldCount = 0;
        const strat = s.strategy;

        // 人件費
        const wageMulti = period >= 3 ? (0.95 + Math.random() * 0.3) : 1.0;
        const wage = Math.round(RULES.WAGE_BASE[period] * wageMulti);

        // === 期首 ===

        // 3期以降：長期借入
        if (period >= 3 && strat.borrow3 && s.loans < strat.borrow3) {
            const amt = Math.min(strat.borrow3 - s.loans, 300 - s.loans);
            if (amt > 0) {
                const int = Math.floor(amt * RULES.LONG_TERM_RATE);
                s.loans += amt;
                s.cash += amt - int;
            }
        }

        // PC・保険
        s.chips.computer = 1;
        s.chips.insurance = 1;
        s.cash -= RULES.CHIP_COST + RULES.INSURANCE_COST;
        row++;

        // === 2期：初期投資 ===
        if (period === 2) {
            for (let i = 0; i < strat.chips.r && s.cash >= RULES.CHIP_COST; i++) {
                s.chips.research++; s.cash -= RULES.CHIP_COST; row++;
            }
            for (let i = 0; i < strat.chips.e && s.cash >= RULES.CHIP_COST; i++) {
                s.chips.education++; s.cash -= RULES.CHIP_COST; row++;
            }
            for (let i = 0; i < strat.chips.a && s.cash >= RULES.CHIP_COST; i++) {
                s.chips.advertising++; s.cash -= RULES.CHIP_COST; row++;
            }
            // 翌期チップ
            if (strat.nextChips) {
                for (let i = 0; i < (strat.nextChips.r || 0) && s.cash >= RULES.CHIP_COST; i++) {
                    s.nextPeriodChips.research++; s.cash -= RULES.CHIP_COST; row++;
                }
            }
        }

        // === 3期：翌期チップ適用 + 機械投資 ===
        if (period === 3) {
            s.chips.research += s.nextPeriodChips.research;
            s.chips.education += s.nextPeriodChips.education;
            s.nextPeriodChips = { research: 0, education: 0 };

            if (strat.invest.includes('sm3') && s.cash >= RULES.SMALL_MACHINE.cost + RULES.HIRING_COST) {
                s.machinesSmall++; s.cash -= RULES.SMALL_MACHINE.cost; row++;
                s.workers++; s.cash -= RULES.HIRING_COST; row++;
            }
        }

        // === メインループ ===
        const mc = this.mfgCap(s);
        const sc = this.salesCap(s);

        while (row < maxRows) {
            // リスクカード
            if (Math.random() < RULES.RISK_PROBABILITY) {
                this.applyRisk(s, period);
                row++;
                continue;
            }

            // 1. 販売優先
            if (s.products > 0 && sc > 0) {
                const sellQty = Math.min(s.products, sc);
                const tryPrice = getSellingPrice(s.chips.research, period, s.products);
                const result = getBidResult(s.chips.research, tryPrice, period);

                if (result.won) {
                    const rev = sellQty * result.price;
                    s.products -= sellQty;
                    s.cash += rev;
                    sales += rev;
                    soldCount += sellQty;
                    s.totalSalesCount += sellQty;
                    s.totalSalesRevenue += rev;
                }
                row++;
                continue;
            }

            // 2. 完成+投入（1行で両方）
            if (s.wip > 0) {
                const compQty = Math.min(s.wip, mc, this.prodCap(s) - s.products);
                if (compQty > 0) {
                    s.wip -= compQty;
                    s.products += compQty;
                    s.cash -= compQty * RULES.PROCESSING_COST;
                    procCost += compQty * RULES.PROCESSING_COST;
                }

                // 同時投入
                const inpQty = Math.min(s.materials, mc, RULES.WIP_CAPACITY - s.wip);
                if (inpQty > 0) {
                    s.materials -= inpQty;
                    s.wip += inpQty;
                    s.cash -= inpQty * RULES.PROCESSING_COST;
                    procCost += inpQty * RULES.PROCESSING_COST;
                }

                row++;
                continue;
            }

            // 3. 投入のみ
            if (s.materials > 0 && s.wip < RULES.WIP_CAPACITY) {
                const inpQty = Math.min(s.materials, mc, RULES.WIP_CAPACITY - s.wip);
                if (inpQty > 0) {
                    s.materials -= inpQty;
                    s.wip += inpQty;
                    s.cash -= inpQty * RULES.PROCESSING_COST;
                    procCost += inpQty * RULES.PROCESSING_COST;
                }
                row++;
                continue;
            }

            // 4. 仕入れ
            const space = this.matCap(s) - s.materials;
            if (space > 0 && s.cash >= 10) {
                const price = this.getMaterialCost();
                const buyQty = Math.min(mc * 2, space, Math.floor(s.cash / price));
                if (buyQty > 0) {
                    s.materials += buyQty;
                    s.cash -= buyQty * price;
                    matCost += buyQty * price;
                }
                row++;
                continue;
            }

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

        const fixedCost = machCost + persCost + deprec + chipCost + (s.additionalF || 0);

        const MQ = sales - matCost - procCost;
        const opProfit = MQ - fixedCost;
        const interest = Math.floor(s.loans * RULES.LONG_TERM_RATE) + Math.floor(s.shortLoans * RULES.SHORT_TERM_RATE);
        const preTax = opProfit - interest;

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
        s.cash -= fixedCost + tax + div;

        if (s.cash < 0) {
            const need = -s.cash;
            const loan = Math.ceil(need / 0.8 / 50) * 50;
            s.shortLoans += loan;
            s.cash += loan * 0.8;
        }

        s.equity += netProfit;
        s.additionalF = 0;

        s.periodStats.push({ sales, MQ, fixedCost, netProfit, soldCount });
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
            avgPrice: s.totalSalesCount > 0 ? Math.round(s.totalSalesRevenue / s.totalSalesCount) : 0,
            periodStats: s.periodStats
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
        const prices = results.filter(r => r.avgPrice > 0).map(r => r.avgPrice);

        return {
            name: strategy.name,
            runs,
            successRate: (succ / runs * 100).toFixed(2),
            avgEq: Math.round(eqs.reduce((a,b) => a+b, 0) / runs),
            maxEq: Math.max(...eqs),
            minEq: Math.min(...eqs),
            avgSold: Math.round(sold.reduce((a,b) => a+b, 0) / runs),
            avgPrice: prices.length > 0 ? Math.round(prices.reduce((a,b) => a+b, 0) / prices.length) : 0,
            successCount: succ
        };
    }

    runAll(runsEach = 2000) {
        console.log('='.repeat(70));
        console.log(`MG シミュレーション v4 - ${STRATEGIES.length}戦略 × ${runsEach}回 = ${STRATEGIES.length * runsEach}回`);
        console.log('='.repeat(70));

        const all = [];

        for (const strat of STRATEGIES) {
            const r = this.runMultiple(strat, runsEach);
            all.push(r);
            console.log(`${strat.name.padEnd(15)} | ${r.successRate.padStart(6)}% | avg¥${r.avgEq.toString().padStart(4)} | max¥${r.maxEq.toString().padStart(4)} | sold${r.avgSold.toString().padStart(3)} @¥${r.avgPrice}`);
        }

        all.sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));

        console.log('\n' + '='.repeat(70));
        console.log('TOP 15 成功率ランキング');
        console.log('='.repeat(70));
        for (let i = 0; i < Math.min(15, all.length); i++) {
            const r = all[i];
            console.log(`${(i+1).toString().padStart(2)}. ${r.name.padEnd(15)} | ${r.successRate.padStart(6)}% | avg¥${r.avgEq} | max¥${r.maxEq} | sold${r.avgSold}`);
        }

        const byAvg = [...all].sort((a, b) => b.avgEq - a.avgEq);
        console.log('\n' + '='.repeat(70));
        console.log('TOP 10 平均自己資本ランキング');
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
const results = sim.runAll(2000);

// 成功戦略詳細
console.log('\n' + '='.repeat(70));
console.log('成功戦略の詳細分析');
console.log('='.repeat(70));

const successes = results.filter(r => parseFloat(r.successRate) > 0);
if (successes.length === 0) {
    console.log('成功率 > 0% の戦略なし');
} else {
    console.log(`成功可能戦略: ${successes.length}/${STRATEGIES.length}\n`);
    successes.slice(0, 10).forEach(r => {
        const strat = STRATEGIES.find(s => s.name === r.name);
        console.log(`【${r.name}】成功率 ${r.successRate}% (${r.successCount}回/${r.runs}回)`);
        console.log(`  チップ: 研究${strat.chips.r} 教育${strat.chips.e} 広告${strat.chips.a}`);
        console.log(`  投資: ${strat.invest.join(', ') || 'なし'}`);
        console.log(`  借入: ${strat.borrow3 || 'なし'}, 翌期: ${strat.nextChips ? `R+${strat.nextChips.r}` : 'なし'}`);
        console.log(`  平均売上: ${r.avgSold}個 @¥${r.avgPrice}, 平均自己資本: ¥${r.avgEq}\n`);
    });
}

// 統計サマリー
console.log('='.repeat(70));
console.log('戦略パターン分析');
console.log('='.repeat(70));

const patterns = {
    '研究のみ': results.filter(r => r.name.match(/^R[1-4]$/)),
    '教育のみ': results.filter(r => r.name.match(/^E[1-2]$/)),
    '研究+教育': results.filter(r => r.name.match(/^R[1-3]E[1-2]$/)),
    '借入あり': results.filter(r => r.name.includes('B')),
    '機械投資': results.filter(r => r.name.includes('SM'))
};

for (const [name, group] of Object.entries(patterns)) {
    if (group.length > 0) {
        const avgRate = group.reduce((a, b) => a + parseFloat(b.successRate), 0) / group.length;
        const avgEq = Math.round(group.reduce((a, b) => a + b.avgEq, 0) / group.length);
        const best = group.sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate))[0];
        console.log(`${name.padEnd(12)}: 平均成功率 ${avgRate.toFixed(2)}%, 平均資本 ¥${avgEq}, Best: ${best.name}`);
    }
}
