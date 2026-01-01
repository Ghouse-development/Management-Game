/**
 * MG シミュレーション v2
 * 改善版：生産・販売サイクルの最適化
 *
 * 改善点:
 * 1. 入札勝率を現実的に調整（親ボーナス考慮）
 * 2. 生産サイクルの効率化（完成→投入→仕入れを1行で）
 * 3. リスクカードの影響を正確に反映
 * 4. より多くの戦略パターン
 */

const RULES = {
    MARKETS: {
        SENDAI: { buy: 10, sell: 40 },
        SAPPORO: { buy: 11, sell: 36 },
        FUKUOKA: { buy: 12, sell: 32 },
        NAGOYA: { buy: 13, sell: 28 },
        OSAKA: { buy: 14, sell: 24 },
        TOKYO: { buy: 15, sell: 20 }
    },
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
    // リスク確率を調整（効果なしカードも多い）
    RISK_PROBABILITY: 0.15,  // 実効的なリスク確率
    TARGET_EQUITY: 450
};

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

    // 研究+教育
    { name: 'R1E1', chips: {r:1, e:1, a:0}, invest: [] },
    { name: 'R2E1', chips: {r:2, e:1, a:0}, invest: [] },
    { name: 'R2E2', chips: {r:2, e:2, a:0}, invest: [] },
    { name: 'R3E1', chips: {r:3, e:1, a:0}, invest: [] },
    { name: 'R3E2', chips: {r:3, e:2, a:0}, invest: [] },

    // 翌期チップ（3期に研究追加）
    { name: 'R2_N1', chips: {r:2, e:0, a:0}, invest: [], nextChips: {r:1, e:0} },
    { name: 'R2_N2', chips: {r:2, e:0, a:0}, invest: [], nextChips: {r:2, e:0} },
    { name: 'R2E1_N1', chips: {r:2, e:1, a:0}, invest: [], nextChips: {r:1, e:0} },
    { name: 'R2E2_N1', chips: {r:2, e:2, a:0}, invest: [], nextChips: {r:1, e:0} },

    // 機械投資（3期から）
    { name: 'R2_SM3', chips: {r:2, e:0, a:0}, invest: ['sm3'] },
    { name: 'R2E1_SM3', chips: {r:2, e:1, a:0}, invest: ['sm3'] },
    { name: 'R2_LM3', chips: {r:2, e:0, a:0}, invest: ['lm3'], borrow3: 100 },

    // 借入戦略（3期から）
    { name: 'R2_B50', chips: {r:2, e:0, a:0}, invest: [], borrow3: 50 },
    { name: 'R2_B100', chips: {r:2, e:0, a:0}, invest: [], borrow3: 100 },
    { name: 'R3_B100', chips: {r:3, e:0, a:0}, invest: [], borrow3: 100 },
    { name: 'R2E1_B50', chips: {r:2, e:1, a:0}, invest: [], borrow3: 50 },
    { name: 'R2E2_B100', chips: {r:2, e:2, a:0}, invest: [], borrow3: 100 },

    // 倉庫戦略
    { name: 'R2_WH', chips: {r:2, e:0, a:0}, invest: ['wh'] },
    { name: 'R2E1_WH', chips: {r:2, e:1, a:0}, invest: ['wh'] },

    // セールス追加
    { name: 'R2_S1', chips: {r:2, e:0, a:0}, invest: ['s1'] },
    { name: 'R3_S1', chips: {r:3, e:0, a:0}, invest: ['s1'] },

    // 複合戦略
    { name: 'FULL1', chips: {r:3, e:2, a:0}, invest: ['sm3'], borrow3: 100, nextChips: {r:1, e:0} },
    { name: 'FULL2', chips: {r:2, e:2, a:0}, invest: ['wh', 's1'], borrow3: 50 },
    { name: 'FULL3', chips: {r:4, e:1, a:0}, invest: [], borrow3: 100, nextChips: {r:1, e:0} }
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
            totalSalesCount: 0
        };
    }

    mfgCap(s) {
        if (s.workers === 0) return 0;
        const machCap = s.machinesSmall + s.machinesLarge * 4;
        const numMach = s.machinesSmall + s.machinesLarge;
        if (s.workers < numMach) return s.workers;
        return machCap + s.chips.computer + Math.min(s.chips.education, 1);
    }

    salesCap(s) {
        if (s.salesmen === 0) return 0;
        const base = s.salesmen * 2;
        const adBonus = Math.min(s.chips.advertising * 2, s.salesmen) * 2;
        return base + adBonus + Math.min(s.chips.education, 1);
    }

    matCap(s) { return RULES.MATERIAL_BASE + s.warehouses * RULES.WAREHOUSE_BONUS; }
    prodCap(s) { return RULES.PRODUCT_BASE + s.warehouses * RULES.WAREHOUSE_BONUS; }

    // 入札価格と勝率（親ボーナス16%考慮）
    getBid(s, period) {
        const r = s.chips.research || 0;
        const isParentChance = 1/6;  // 6人中親になる確率

        // 研究チップ効果：コール価格 = 入札価格 - (研究×2 + 親ボーナス2)
        // 同じ入札価格なら研究チップ多い方が勝つ
        if (r >= 5) {
            return { price: 32, winRate: 0.95 };  // 福岡¥32確保
        } else if (r >= 4) {
            return { price: 30, winRate: 0.90 };
        } else if (r >= 3) {
            return { price: 28, winRate: 0.88 };  // 名古屋¥28
        } else if (r >= 2) {
            return { price: 28, winRate: 0.85 };  // 研究2枚で名古屋勝率高
        } else if (r >= 1) {
            return { price: 26, winRate: 0.70 };
        } else {
            // 研究0枚は大阪¥24が限界、勝率低い
            return { price: 24, winRate: period === 2 ? 0.75 : 0.40 };
        }
    }

    getMaterialCost() {
        const r = Math.random();
        if (r < 0.10) return 10;  // 仙台
        if (r < 0.30) return 11;  // 札幌
        if (r < 0.55) return 12;  // 福岡
        if (r < 0.85) return 13;  // 名古屋
        return 14;  // 大阪
    }

    applyRisk(s, period) {
        // 効果のあるリスクカードの種類（一部は効果なし）
        const effects = [
            () => { s.additionalF += 5; return 'クレーム: F+5'; },
            () => { s.additionalF += 10; return 'PCトラブル: F+10'; },
            () => { s.additionalF += 10; return '設計トラブル: F+10'; },
            () => {
                if (period > 2) { s.cash = Math.max(0, s.cash - 30); return '得意先倒産: 現金-30'; }
                return '得意先倒産（2期免除）';
            },
            () => {
                if (s.chips.research > 0) { s.chips.research--; return '研究失敗: 青チップ-1'; }
                return '研究失敗（チップなし）';
            },
            () => {
                if (s.wip > 0) { s.wip--; return '製造ミス: 仕掛品-1'; }
                return '製造ミス（仕掛品なし）';
            },
            () => {
                const loss = s.materials;
                s.materials = 0;
                if (s.chips.insurance > 0) { s.cash += loss * 8; return `火災: 材料全損（保険金${loss*8}）`; }
                return `火災: 材料${loss}個全損`;
            },
            () => {
                const loss = Math.min(2, s.products);
                s.products -= loss;
                if (s.chips.insurance > 0 && loss > 0) { s.cash += loss * 10; return `盗難: 製品${loss}個損失（保険金${loss*10}）`; }
                return `盗難: 製品${loss}個損失`;
            },
            // ベネフィット
            () => {
                if (s.products > 0 && s.chips.education > 0) {
                    const qty = Math.min(5, s.products, this.salesCap(s));
                    s.products -= qty;
                    s.cash += qty * 32;
                    return `教育成功: ${qty}個×¥32販売`;
                }
                return '教育成功（条件なし）';
            },
            () => {
                if (s.products > 0 && s.chips.research > 0) {
                    const qty = Math.min(Math.min(5, s.chips.research * 2), s.products, this.salesCap(s));
                    s.products -= qty;
                    s.cash += qty * 32;
                    return `研究成功: ${qty}個×¥32販売`;
                }
                return '研究成功（条件なし）';
            },
            () => {
                const buyQty = Math.min(5, this.matCap(s) - s.materials, Math.floor(s.cash / 10));
                if (buyQty > 0) {
                    s.materials += buyQty;
                    s.cash -= buyQty * 10;
                    return `特別サービス: 材料${buyQty}個×¥10購入`;
                }
                return '特別サービス（購入なし）';
            },
            // 効果なし
            () => '消費者運動（効果なし）',
            () => '労災発生（効果なし）',
            () => '景気変動（効果なし）',
            () => '逆回り（効果なし）'
        ];

        return effects[Math.floor(Math.random() * effects.length)]();
    }

    simulatePeriod(s, period) {
        const maxRows = RULES.MAX_ROWS[period];
        let row = 1;
        let sales = 0, matCost = 0, procCost = 0, soldCount = 0;
        const strat = s.strategy;

        // 人件費
        const wageMulti = period >= 3 ? (Math.random() < 0.5 ? 1.1 : 1.2) : 1.0;
        const wage = Math.round(RULES.WAGE_BASE[period] * wageMulti);

        // === 3期以降：借入 ===
        if (period >= 3 && strat.borrow3 && s.loans < strat.borrow3) {
            const amt = Math.min(strat.borrow3 - s.loans, 300 - s.loans);
            if (amt > 0) {
                const int = Math.floor(amt * RULES.LONG_TERM_RATE);
                s.loans += amt;
                s.cash += amt - int;
            }
        }

        // === 期首：PC・保険 ===
        s.chips.computer = 1;
        s.chips.insurance = 1;
        s.cash -= RULES.CHIP_COST + RULES.INSURANCE_COST;
        row++;

        // === 2期：チップ購入 ===
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

            // 倉庫
            if (strat.invest.includes('wh') && s.cash >= RULES.WAREHOUSE_COST) {
                s.warehouses++; s.cash -= RULES.WAREHOUSE_COST; row++;
            }

            // セールス追加
            if (strat.invest.includes('s1') && s.cash >= RULES.HIRING_COST) {
                s.salesmen++; s.cash -= RULES.HIRING_COST; row++;
            }
        }

        // === 3期：翌期チップ適用 + 追加投資 ===
        if (period === 3) {
            // 翌期チップ適用
            if (s.nextPeriodChips.research > 0) {
                s.chips.research += s.nextPeriodChips.research;
                s.nextPeriodChips.research = 0;
            }
            if (s.nextPeriodChips.education > 0) {
                s.chips.education += s.nextPeriodChips.education;
                s.nextPeriodChips.education = 0;
            }

            // 機械投資
            if (strat.invest.includes('sm3') && s.cash >= RULES.SMALL_MACHINE.cost) {
                s.machinesSmall++; s.cash -= RULES.SMALL_MACHINE.cost;
                // ワーカーも必要
                if (s.cash >= RULES.HIRING_COST) {
                    s.workers++; s.cash -= RULES.HIRING_COST; row++;
                }
                row++;
            }
            if (strat.invest.includes('lm3') && s.cash >= RULES.LARGE_MACHINE.cost) {
                s.machinesLarge++; s.cash -= RULES.LARGE_MACHINE.cost;
                if (s.cash >= RULES.HIRING_COST) {
                    s.workers++; s.cash -= RULES.HIRING_COST; row++;
                }
                row++;
            }

            // 翌期チップ購入（次の期に適用）
            if (strat.nextChips) {
                for (let i = 0; i < (strat.nextChips.r || 0) && s.cash >= RULES.CHIP_COST; i++) {
                    s.nextPeriodChips.research++; s.cash -= RULES.CHIP_COST; row++;
                }
            }
        }

        // === 4期：翌期チップ適用 ===
        if (period === 4) {
            if (s.nextPeriodChips.research > 0) {
                s.chips.research += s.nextPeriodChips.research;
                s.nextPeriodChips.research = 0;
            }
        }

        // === メインループ ===
        const usableRows = maxRows - 2;

        while (row <= usableRows) {
            // リスク判定
            if (Math.random() < RULES.RISK_PROBABILITY) {
                this.applyRisk(s, period);
                row++;
                continue;
            }

            const mc = this.mfgCap(s);
            const sc = this.salesCap(s);

            // 1. 販売
            if (s.products > 0 && sc > 0) {
                const sellQty = Math.min(s.products, sc);
                const bid = this.getBid(s, period);
                if (Math.random() < bid.winRate) {
                    const rev = sellQty * bid.price;
                    s.products -= sellQty;
                    s.cash += rev;
                    sales += rev;
                    soldCount += sellQty;
                    s.totalSalesCount += sellQty;
                }
                row++;
                continue;
            }

            // 2. 完成+投入
            if (s.wip > 0 && mc > 0) {
                const compQty = Math.min(s.wip, mc, this.prodCap(s) - s.products);
                if (compQty > 0) {
                    s.wip -= compQty;
                    s.products += compQty;
                    const cost = compQty * RULES.PROCESSING_COST;
                    s.cash -= cost;
                    procCost += cost;

                    // 同時投入
                    const inpQty = Math.min(s.materials, mc - compQty, RULES.WIP_CAPACITY - s.wip);
                    if (inpQty > 0) {
                        s.materials -= inpQty;
                        s.wip += inpQty;
                        const ic = inpQty * RULES.PROCESSING_COST;
                        s.cash -= ic;
                        procCost += ic;
                    }
                }
                row++;
                continue;
            }

            // 3. 投入のみ
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
                const perMkt = period === 2 ? 99 : mc;
                const price = this.getMaterialCost();
                const qty = Math.min(perMkt, space, Math.floor(s.cash / price));
                if (qty > 0) {
                    s.materials += qty;
                    s.cash -= qty * price;
                    matCost += qty * price;
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

        const G = sales - matCost - procCost;
        const opProfit = G - fixedCost;
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
        s.warehouses = 0;
        s.additionalF = 0;

        return { sales, matCost, procCost, G, fixedCost, netProfit, soldCount };
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
            totalSold: s.totalSalesCount
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

    runAll(runsEach = 500) {
        console.log('='.repeat(70));
        console.log(`MG シミュレーション v2 - ${STRATEGIES.length}戦略 × ${runsEach}回 = ${STRATEGIES.length * runsEach}回`);
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
const results = sim.runAll(500);

// 成功戦略の詳細分析
console.log('\n' + '='.repeat(70));
console.log('成功戦略の詳細');
console.log('='.repeat(70));

const successes = results.filter(r => parseFloat(r.successRate) > 0);
if (successes.length === 0) {
    console.log('⚠️ 成功率 > 0% の戦略なし');
    console.log('ゲーム難易度が非常に高いか、シミュレーションの調整が必要');
} else {
    console.log(`成功可能戦略: ${successes.length}/${STRATEGIES.length}`);
    successes.forEach(r => {
        const strat = STRATEGIES.find(s => s.name === r.name);
        console.log(`\n${r.name}: 成功率${r.successRate}%`);
        console.log(`  チップ: R${strat.chips.r} E${strat.chips.e} A${strat.chips.a}`);
        console.log(`  投資: ${strat.invest.join(', ') || 'なし'}`);
        console.log(`  借入: ${strat.borrow3 || 'なし'}`);
        console.log(`  翌期: ${strat.nextChips ? `R${strat.nextChips.r || 0}` : 'なし'}`);
    });
}
