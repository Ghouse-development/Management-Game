/**
 * MG シミュレーション v6 (Final)
 * - より多くの戦略バリエーション
 * - 詳細な統計分析
 * - 5000回/戦略で精度向上
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    CHIP_COST: 20,
    INSURANCE_COST: 5,
    PROCESSING_COST: 1,
    HIRING_COST: 20,
    WAREHOUSE_COST: 20,
    SMALL_MACHINE: { cost: 100, depreciation: 10 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    WIP_CAPACITY: 10,
    MATERIAL_BASE: 10,
    PRODUCT_BASE: 10,
    LONG_TERM_RATE: 0.10,
    SHORT_TERM_RATE: 0.20,
    RISK_PROBABILITY: 0.08,
    TARGET_EQUITY: 450
};

function getBidWinRate(research, price, period) {
    const isParent = Math.random() < (1/6);
    const competitiveness = research * 2 + (isParent ? 2 : 0);

    let baseRate;
    if (price >= 36) baseRate = 0.85;
    else if (price >= 32) baseRate = 0.80;
    else if (price >= 28) baseRate = 0.70;
    else if (price >= 24) baseRate = 0.60;
    else baseRate = 0.55;

    const researchBonus = research * 0.05;
    const parentBonus = isParent ? 0.10 : 0;
    const periodPenalty = (period - 2) * 0.03;

    return Math.min(0.95, Math.max(0.30, baseRate + researchBonus + parentBonus - periodPenalty));
}

function getRecommendedPrice(research) {
    if (research >= 5) return 36;
    if (research >= 4) return 32;
    if (research >= 2) return 28;
    if (research >= 1) return 24;
    return 24;
}

function getMaterialCost() {
    const r = Math.random();
    if (r < 0.20) return 10;
    if (r < 0.45) return 11;
    if (r < 0.70) return 12;
    if (r < 0.90) return 13;
    return 14;
}

// 完全な戦略セット（40戦略）
const STRATEGIES = [
    // 単一チップ戦略
    { name: 'ZERO', chips: {r:0, e:0} },
    { name: 'E1', chips: {r:0, e:1} },
    { name: 'E2', chips: {r:0, e:2} },
    { name: 'R1', chips: {r:1, e:0} },
    { name: 'R2', chips: {r:2, e:0} },
    { name: 'R3', chips: {r:3, e:0} },
    { name: 'R4', chips: {r:4, e:0} },

    // 研究+教育組み合わせ
    { name: 'R1E1', chips: {r:1, e:1} },
    { name: 'R1E2', chips: {r:1, e:2} },
    { name: 'R2E1', chips: {r:2, e:1} },
    { name: 'R2E2', chips: {r:2, e:2} },
    { name: 'R3E1', chips: {r:3, e:1} },
    { name: 'R3E2', chips: {r:3, e:2} },
    { name: 'R4E1', chips: {r:4, e:1} },

    // 翌期チップ戦略
    { name: 'E1_N1R', chips: {r:0, e:1}, nextR: 1 },
    { name: 'E2_N1R', chips: {r:0, e:2}, nextR: 1 },
    { name: 'R1E1_N1R', chips: {r:1, e:1}, nextR: 1 },
    { name: 'R2E1_N1R', chips: {r:2, e:1}, nextR: 1 },
    { name: 'R2E2_N1R', chips: {r:2, e:2}, nextR: 1 },
    { name: 'R2E1_N2R', chips: {r:2, e:1}, nextR: 2 },

    // 借入戦略
    { name: 'R2E1_B50', chips: {r:2, e:1}, borrow3: 50 },
    { name: 'R2E1_B100', chips: {r:2, e:1}, borrow3: 100 },
    { name: 'R2E2_B50', chips: {r:2, e:2}, borrow3: 50 },
    { name: 'R3E1_B50', chips: {r:3, e:1}, borrow3: 50 },
    { name: 'R3E1_B100', chips: {r:3, e:1}, borrow3: 100 },
    { name: 'E1_B50', chips: {r:0, e:1}, borrow3: 50 },

    // 機械投資戦略
    { name: 'R2E1_SM', chips: {r:2, e:1}, sm3: true },
    { name: 'R2E2_SM', chips: {r:2, e:2}, sm3: true },
    { name: 'R3E1_SM', chips: {r:3, e:1}, sm3: true },
    { name: 'R3E2_SM', chips: {r:3, e:2}, sm3: true },
    { name: 'E1_SM', chips: {r:0, e:1}, sm3: true },

    // 複合戦略
    { name: 'R2E1_SM_B50', chips: {r:2, e:1}, sm3: true, borrow3: 50 },
    { name: 'R2E1_N1R_B50', chips: {r:2, e:1}, nextR: 1, borrow3: 50 },
    { name: 'R3E1_SM_B50', chips: {r:3, e:1}, sm3: true, borrow3: 50 },
    { name: 'R3E2_SM_B50', chips: {r:3, e:2}, sm3: true, borrow3: 50 },
    { name: 'FULL_R2', chips: {r:2, e:1}, sm3: true, borrow3: 100, nextR: 1 },
    { name: 'FULL_R3', chips: {r:3, e:2}, sm3: true, borrow3: 50, nextR: 1 },
    { name: 'FULL_MAX', chips: {r:4, e:1}, sm3: true, borrow3: 100, nextR: 1 },

    // 低コスト戦略
    { name: 'R1E1_B50', chips: {r:1, e:1}, borrow3: 50 },
    { name: 'R0E1_B50', chips: {r:0, e:1}, borrow3: 50 }
];

class Simulator {
    createState(strategy) {
        return {
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
            chips: { research: 0, education: 0, computer: 1, insurance: 1 },
            nextChips: { research: 0 },
            additionalF: 0,
            hasExceeded300: false,
            strategy,
            totalSold: 0,
            totalRevenue: 0
        };
    }

    mfgCap(s) {
        if (s.workers === 0) return 0;
        return s.machinesSmall + s.chips.computer + Math.min(s.chips.education, s.workers);
    }

    salesCap(s) {
        if (s.salesmen === 0) return 0;
        return s.salesmen * 2 + Math.min(s.chips.education, s.salesmen);
    }

    applyRisk(s, period) {
        const r = Math.random();
        if (r < 0.15) {
            s.additionalF += 5 + Math.floor(Math.random() * 10);
        } else if (r < 0.25) {
            if (period > 2) s.cash = Math.max(0, s.cash - 30);
        } else if (r < 0.30) {
            if (s.chips.research > 0) s.chips.research--;
        } else if (r < 0.35) {
            if (s.wip > 0) s.wip--;
        } else if (r < 0.40) {
            const loss = s.materials;
            s.materials = 0;
            if (s.chips.insurance > 0 && loss > 0) s.cash += loss * 8;
        } else if (r < 0.50) {
            if (s.products > 0 && s.chips.education > 0) {
                const qty = Math.min(3, s.products);
                s.products -= qty;
                s.cash += qty * 32;
                s.totalSold += qty;
                s.totalRevenue += qty * 32;
            }
        } else if (r < 0.60) {
            const buyQty = Math.min(3, RULES.MATERIAL_BASE - s.materials, Math.floor(s.cash / 10));
            if (buyQty > 0) {
                s.materials += buyQty;
                s.cash -= buyQty * 10;
            }
        }
    }

    simulatePeriod(s, period) {
        const maxRows = RULES.MAX_ROWS[period];
        let row = 1;
        let sales = 0, matCost = 0, procCost = 0;
        const strat = s.strategy;

        const wageMulti = period >= 3 ? (0.9 + Math.random() * 0.3) : 1.0;
        const wage = Math.round(RULES.WAGE_BASE[period] * wageMulti);

        // 期首借入
        if (period >= 3 && strat.borrow3 && s.loans < strat.borrow3) {
            const amt = Math.min(strat.borrow3 - s.loans, 300 - s.loans);
            if (amt > 0) {
                s.loans += amt;
                s.cash += amt - Math.floor(amt * RULES.LONG_TERM_RATE);
            }
        }

        // PC・保険
        s.chips.computer = 1;
        s.chips.insurance = 1;
        s.cash -= RULES.CHIP_COST + RULES.INSURANCE_COST;
        row++;

        // 2期：チップ購入
        if (period === 2) {
            for (let i = 0; i < (strat.chips.r || 0) && s.cash >= RULES.CHIP_COST; i++) {
                s.chips.research++; s.cash -= RULES.CHIP_COST; row++;
            }
            for (let i = 0; i < (strat.chips.e || 0) && s.cash >= RULES.CHIP_COST; i++) {
                s.chips.education++; s.cash -= RULES.CHIP_COST; row++;
            }
            if (strat.nextR) {
                for (let i = 0; i < strat.nextR && s.cash >= RULES.CHIP_COST; i++) {
                    s.nextChips.research++; s.cash -= RULES.CHIP_COST; row++;
                }
            }
        }

        // 3期：翌期チップ適用 + 機械投資
        if (period === 3) {
            s.chips.research += s.nextChips.research;
            s.nextChips.research = 0;

            if (strat.sm3 && s.cash >= RULES.SMALL_MACHINE.cost + RULES.HIRING_COST) {
                s.machinesSmall++; s.cash -= RULES.SMALL_MACHINE.cost; row++;
                s.workers++; s.cash -= RULES.HIRING_COST; row++;
            }
        }

        const mc = this.mfgCap(s);
        const sc = this.salesCap(s);

        while (row < maxRows) {
            if (Math.random() < RULES.RISK_PROBABILITY) {
                this.applyRisk(s, period);
                row++;
                continue;
            }

            // 販売
            if (s.products > 0 && sc > 0) {
                const sellQty = Math.min(s.products, sc);
                const price = getRecommendedPrice(s.chips.research);
                if (Math.random() < getBidWinRate(s.chips.research, price, period)) {
                    const rev = sellQty * price;
                    s.products -= sellQty;
                    s.cash += rev;
                    sales += rev;
                    s.totalSold += sellQty;
                    s.totalRevenue += rev;
                }
                row++;
                continue;
            }

            // 完成
            if (s.wip > 0 && mc > 0) {
                const qty = Math.min(s.wip, mc, RULES.PRODUCT_BASE - s.products);
                if (qty > 0) {
                    s.wip -= qty;
                    s.products += qty;
                    s.cash -= qty * RULES.PROCESSING_COST;
                    procCost += qty * RULES.PROCESSING_COST;

                    const inpQty = Math.min(s.materials, mc, RULES.WIP_CAPACITY - s.wip);
                    if (inpQty > 0) {
                        s.materials -= inpQty;
                        s.wip += inpQty;
                        s.cash -= inpQty * RULES.PROCESSING_COST;
                        procCost += inpQty * RULES.PROCESSING_COST;
                    }
                }
                row++;
                continue;
            }

            // 投入
            if (s.materials > 0 && s.wip < RULES.WIP_CAPACITY && mc > 0) {
                const qty = Math.min(s.materials, mc, RULES.WIP_CAPACITY - s.wip);
                if (qty > 0) {
                    s.materials -= qty;
                    s.wip += qty;
                    s.cash -= qty * RULES.PROCESSING_COST;
                    procCost += qty * RULES.PROCESSING_COST;
                }
                row++;
                continue;
            }

            // 仕入れ
            const space = RULES.MATERIAL_BASE - s.materials;
            if (space > 0 && s.cash >= 10) {
                const price = getMaterialCost();
                const qty = Math.min(mc * 2, space, Math.floor(s.cash / price));
                if (qty > 0) {
                    s.materials += qty;
                    s.cash -= qty * price;
                    matCost += qty * price;
                }
                row++;
                continue;
            }

            break;
        }

        // 期末計算
        const machCost = (s.machinesSmall + s.machinesLarge) * wage;
        const persCost = (s.workers + s.salesmen) * wage;
        const deprec = s.machinesSmall * RULES.SMALL_MACHINE.depreciation;
        const chipCost = (s.chips.research + s.chips.education + s.chips.computer) * RULES.CHIP_COST
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
                tax = Math.round((newEq - 300) * 0.5);
                div = Math.round((newEq - 300) * 0.2);
                s.hasExceeded300 = true;
            } else if (preTax > 0) {
                tax = Math.round(preTax * 0.5);
                div = Math.round(preTax * 0.1);
            }
        }

        s.cash -= fixedCost + tax + div;

        if (s.cash < 0) {
            const loan = Math.ceil(-s.cash / 0.8 / 50) * 50;
            s.shortLoans += loan;
            s.cash += loan * 0.8;
        }

        s.equity += preTax - tax;
        s.additionalF = 0;
    }

    runGame(strategy) {
        const s = this.createState(strategy);
        for (let p = 2; p <= 5; p++) {
            this.simulatePeriod(s, p);
        }
        return {
            equity: s.equity,
            success: s.equity >= RULES.TARGET_EQUITY,
            totalSold: s.totalSold
        };
    }

    runMultiple(strategy, runs) {
        let successCount = 0, totalEq = 0, maxEq = -9999, totalSold = 0;

        for (let i = 0; i < runs; i++) {
            const r = this.runGame(strategy);
            if (r.success) successCount++;
            totalEq += r.equity;
            maxEq = Math.max(maxEq, r.equity);
            totalSold += r.totalSold;
        }

        return {
            name: strategy.name,
            successRate: (successCount / runs * 100).toFixed(2),
            avgEq: Math.round(totalEq / runs),
            maxEq,
            avgSold: Math.round(totalSold / runs),
            successCount,
            runs
        };
    }

    runAll(runsEach = 5000) {
        console.log('='.repeat(80));
        console.log(`MG シミュレーション v6 (Final) - ${STRATEGIES.length}戦略 × ${runsEach}回 = ${STRATEGIES.length * runsEach}回`);
        console.log('='.repeat(80));

        const all = [];

        for (const strat of STRATEGIES) {
            const r = this.runMultiple(strat, runsEach);
            all.push(r);
            console.log(`${strat.name.padEnd(18)} | ${r.successRate.padStart(6)}% | avg¥${r.avgEq.toString().padStart(4)} | max¥${r.maxEq.toString().padStart(4)} | sold${r.avgSold.toString().padStart(3)}`);
        }

        all.sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));

        console.log('\n' + '='.repeat(80));
        console.log('成功率ランキング TOP 15');
        console.log('='.repeat(80));
        for (let i = 0; i < Math.min(15, all.length); i++) {
            const r = all[i];
            console.log(`${(i+1).toString().padStart(2)}. ${r.name.padEnd(18)} | ${r.successRate.padStart(6)}% | avg¥${r.avgEq} | max¥${r.maxEq}`);
        }

        console.log('\n' + '='.repeat(80));
        console.log('平均自己資本ランキング TOP 10');
        console.log('='.repeat(80));
        const byAvg = [...all].sort((a, b) => b.avgEq - a.avgEq);
        for (let i = 0; i < Math.min(10, byAvg.length); i++) {
            const r = byAvg[i];
            console.log(`${(i+1).toString().padStart(2)}. ${r.name.padEnd(18)} | avg¥${r.avgEq} | ${r.successRate}%`);
        }

        // 戦略カテゴリ分析
        console.log('\n' + '='.repeat(80));
        console.log('戦略カテゴリ分析');
        console.log('='.repeat(80));

        const categories = {
            '教育のみ (E*)': all.filter(r => r.name.match(/^E[12](_|$)/)),
            '研究のみ (R*)': all.filter(r => r.name.match(/^R[1-4]$/)),
            'R2E1系': all.filter(r => r.name.startsWith('R2E1')),
            'R3E1系': all.filter(r => r.name.startsWith('R3E1')),
            'R2E2系': all.filter(r => r.name.startsWith('R2E2')),
            'FULL系': all.filter(r => r.name.startsWith('FULL'))
        };

        for (const [cat, group] of Object.entries(categories)) {
            if (group.length > 0) {
                const avgRate = (group.reduce((a, b) => a + parseFloat(b.successRate), 0) / group.length).toFixed(1);
                const best = group[0];
                console.log(`${cat.padEnd(16)}: 平均成功率 ${avgRate}%, Best: ${best.name} (${best.successRate}%)`);
            }
        }

        return all;
    }
}

// 実行
console.log('実行開始...\n');
const sim = new Simulator();
const results = sim.runAll(5000);

// 最終結論
console.log('\n' + '='.repeat(80));
console.log('最終結論');
console.log('='.repeat(80));

const top3 = results.slice(0, 3);
console.log('\n推奨戦略 TOP 3:\n');
top3.forEach((r, i) => {
    const strat = STRATEGIES.find(s => s.name === r.name);
    console.log(`【${i+1}位】${r.name}`);
    console.log(`   成功率: ${r.successRate}% (${r.successCount}/${r.runs}回)`);
    console.log(`   チップ: 研究${strat.chips.r} 教育${strat.chips.e}`);
    console.log(`   借入: ${strat.borrow3 || 'なし'}, 機械投資: ${strat.sm3 ? 'あり' : 'なし'}, 翌期: ${strat.nextR ? 'R+'+strat.nextR : 'なし'}`);
    console.log(`   平均売上: ${r.avgSold}個, 平均自己資本: ¥${r.avgEq}\n`);
});

console.log('基本戦略の推奨:');
console.log('  2期: 研究チップ2枚 + 教育チップ1枚 (60円)');
console.log('  3期以降: 生産→販売サイクルを維持');
console.log('  入札: 名古屋¥28を目標に');
