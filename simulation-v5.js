/**
 * MG シミュレーション v5
 * 改善点:
 * 1. 入札勝率を実際のゲーム感覚に合わせる
 *    - 6人プレイで複数市場に分散するため、競争は1-2人程度
 *    - 研究チップで高価格市場を狙えば勝率が上がる
 * 2. 生産サイクルを効率化
 * 3. 販売数を増やす（1期に複数回販売可能）
 */

const RULES = {
    MARKETS: [
        { name: '仙台', sell: 40, competitionBase: 0.20 },   // 人気低い
        { name: '札幌', sell: 36, competitionBase: 0.25 },
        { name: '福岡', sell: 32, competitionBase: 0.35 },
        { name: '名古屋', sell: 28, competitionBase: 0.50 },  // 人気高い
        { name: '大阪', sell: 24, competitionBase: 0.60 },    // 最も人気
        { name: '東京', sell: 20, competitionBase: 0.40 }     // 価格安いので中程度
    ],
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    CHIP_COST: 20,
    INSURANCE_COST: 5,
    PROCESSING_COST: 1,
    HIRING_COST: 20,
    WAREHOUSE_COST: 20,
    SMALL_MACHINE: { cost: 100, depreciation: 10 },
    LARGE_MACHINE: { cost: 200, depreciation: 20 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    WIP_CAPACITY: 10,
    MATERIAL_BASE: 10,
    PRODUCT_BASE: 10,
    WAREHOUSE_BONUS: 12,
    LONG_TERM_RATE: 0.10,
    SHORT_TERM_RATE: 0.20,
    RISK_PROBABILITY: 0.08,
    TARGET_EQUITY: 450
};

// 入札勝率計算
// 研究チップが多いほど高価格で勝ちやすい
// 6人プレイで6市場あるので、実際はかなり分散する
function getBidWinRate(research, price, period) {
    // 親ボーナス（1/6の確率で+2）
    const isParent = Math.random() < (1/6);
    const competitiveness = research * 2 + (isParent ? 2 : 0);

    // コール価格 = 入札価格 - 競争力
    const callPrice = price - competitiveness;

    // 基本勝率: 価格が高いほど競争少ない
    let baseRate;
    if (price >= 36) baseRate = 0.85;        // 札幌以上 - ほぼ独占
    else if (price >= 32) baseRate = 0.80;   // 福岡
    else if (price >= 28) baseRate = 0.70;   // 名古屋
    else if (price >= 24) baseRate = 0.60;   // 大阪
    else baseRate = 0.55;                     // 東京

    // 研究チップボーナス: 同じ価格帯での競争優位
    const researchBonus = research * 0.05;

    // 親ボーナス
    const parentBonus = isParent ? 0.10 : 0;

    // 期が進むと競争激化（他プレイヤーも研究チップ増える）
    const periodPenalty = (period - 2) * 0.03;

    const rate = Math.min(0.95, Math.max(0.30, baseRate + researchBonus + parentBonus - periodPenalty));
    return rate;
}

// 研究チップ数に応じた推奨入札価格
function getRecommendedPrice(research, period) {
    // 研究チップが多いほど高い市場を狙える
    if (research >= 5) return 36;  // 札幌
    if (research >= 4) return 32;  // 福岡
    if (research >= 3) return 28;  // 名古屋
    if (research >= 2) return 28;  // 名古屋
    if (research >= 1) return 24;  // 大阪
    return 24;                      // 大阪（研究0）
}

// 材料仕入れ価格
function getMaterialCost() {
    const r = Math.random();
    if (r < 0.20) return 10;      // 仙台 20%
    if (r < 0.45) return 11;      // 札幌 25%
    if (r < 0.70) return 12;      // 福岡 25%
    if (r < 0.90) return 13;      // 名古屋 20%
    return 14;                     // 大阪 10%
}

// 戦略定義
const STRATEGIES = [
    // ベースライン
    { name: 'ZERO', chips: {r:0, e:0, a:0} },

    // 教育のみ（前回分析で最高とされた）
    { name: 'E1', chips: {r:0, e:1, a:0} },
    { name: 'E2', chips: {r:0, e:2, a:0} },

    // 研究のみ
    { name: 'R1', chips: {r:1, e:0, a:0} },
    { name: 'R2', chips: {r:2, e:0, a:0} },
    { name: 'R3', chips: {r:3, e:0, a:0} },

    // 研究+教育
    { name: 'R1E1', chips: {r:1, e:1, a:0} },
    { name: 'R1E2', chips: {r:1, e:2, a:0} },
    { name: 'R2E1', chips: {r:2, e:1, a:0} },
    { name: 'R2E2', chips: {r:2, e:2, a:0} },
    { name: 'R3E1', chips: {r:3, e:1, a:0} },
    { name: 'R3E2', chips: {r:3, e:2, a:0} },

    // 翌期チップ戦略
    { name: 'E2_N1R', chips: {r:0, e:2, a:0}, nextR: 1 },
    { name: 'R2E2_N1R', chips: {r:2, e:2, a:0}, nextR: 1 },
    { name: 'R2E1_N1R', chips: {r:2, e:1, a:0}, nextR: 1 },

    // 3期借入
    { name: 'E2_B50', chips: {r:0, e:2, a:0}, borrow3: 50 },
    { name: 'R2E1_B50', chips: {r:2, e:1, a:0}, borrow3: 50 },
    { name: 'R2E2_B50', chips: {r:2, e:2, a:0}, borrow3: 50 },
    { name: 'R2E1_B100', chips: {r:2, e:1, a:0}, borrow3: 100 },

    // 機械投資
    { name: 'R2E1_SM', chips: {r:2, e:1, a:0}, sm3: true },
    { name: 'R2E2_SM', chips: {r:2, e:2, a:0}, sm3: true },

    // 複合
    { name: 'FULL', chips: {r:3, e:2, a:0}, sm3: true, borrow3: 50, nextR: 1 },

    // 低投資
    { name: 'R1E1_B50', chips: {r:1, e:1, a:0}, borrow3: 50 }
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
            warehouses: 0,
            chips: { research: 0, education: 0, advertising: 0, computer: 1, insurance: 1 },
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
        const machCap = s.machinesSmall + s.machinesLarge * 4;
        return machCap + s.chips.computer + Math.min(s.chips.education, s.workers);
    }

    salesCap(s) {
        if (s.salesmen === 0) return 0;
        return s.salesmen * 2 + Math.min(s.chips.education, s.salesmen);
    }

    matCap(s) { return RULES.MATERIAL_BASE + s.warehouses * RULES.WAREHOUSE_BONUS; }
    prodCap(s) { return RULES.PRODUCT_BASE + s.warehouses * RULES.WAREHOUSE_BONUS; }

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
            // ポジティブ: 特別販売
            if (s.products > 0 && s.chips.education > 0) {
                const qty = Math.min(3, s.products);
                s.products -= qty;
                s.cash += qty * 32;
                s.totalSold += qty;
                s.totalRevenue += qty * 32;
            }
        } else if (r < 0.60) {
            // ポジティブ: 特別仕入れ
            const buyQty = Math.min(3, this.matCap(s) - s.materials, Math.floor(s.cash / 10));
            if (buyQty > 0) {
                s.materials += buyQty;
                s.cash -= buyQty * 10;
            }
        }
        // 残りは効果なし
    }

    simulatePeriod(s, period) {
        const maxRows = RULES.MAX_ROWS[period];
        let row = 1;
        let sales = 0, matCost = 0, procCost = 0, soldCount = 0;
        const strat = s.strategy;

        // 人件費変動
        const wageMulti = period >= 3 ? (0.9 + Math.random() * 0.3) : 1.0;
        const wage = Math.round(RULES.WAGE_BASE[period] * wageMulti);

        // === 期首処理 ===

        // 3期以降借入
        if (period >= 3 && strat.borrow3 && s.loans < strat.borrow3) {
            const amt = Math.min(strat.borrow3 - s.loans, 300 - s.loans);
            if (amt > 0) {
                s.loans += amt;
                s.cash += amt - Math.floor(amt * RULES.LONG_TERM_RATE);
            }
        }

        // PC・保険購入
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
            // 翌期チップ
            if (strat.nextR) {
                for (let i = 0; i < strat.nextR && s.cash >= RULES.CHIP_COST; i++) {
                    s.nextChips.research++; s.cash -= RULES.CHIP_COST; row++;
                }
            }
        }

        // === 3期：翌期チップ適用 + 機械投資 ===
        if (period === 3) {
            s.chips.research += s.nextChips.research;
            s.nextChips.research = 0;

            if (strat.sm3 && s.cash >= RULES.SMALL_MACHINE.cost + RULES.HIRING_COST) {
                s.machinesSmall++; s.cash -= RULES.SMALL_MACHINE.cost; row++;
                s.workers++; s.cash -= RULES.HIRING_COST; row++;
            }
        }

        // === メインループ ===
        const mc = this.mfgCap(s);
        const sc = this.salesCap(s);

        while (row < maxRows) {
            // リスク判定
            if (Math.random() < RULES.RISK_PROBABILITY) {
                this.applyRisk(s, period);
                row++;
                continue;
            }

            // 優先順位: 販売 > 完成 > 投入 > 仕入れ

            // 1. 販売
            if (s.products > 0 && sc > 0) {
                const sellQty = Math.min(s.products, sc);
                const price = getRecommendedPrice(s.chips.research, period);
                const winRate = getBidWinRate(s.chips.research, price, period);

                if (Math.random() < winRate) {
                    const rev = sellQty * price;
                    s.products -= sellQty;
                    s.cash += rev;
                    sales += rev;
                    soldCount += sellQty;
                    s.totalSold += sellQty;
                    s.totalRevenue += rev;
                }
                row++;
                continue;
            }

            // 2. 完成（仕掛品→製品）
            if (s.wip > 0 && mc > 0) {
                const qty = Math.min(s.wip, mc, this.prodCap(s) - s.products);
                if (qty > 0) {
                    s.wip -= qty;
                    s.products += qty;
                    s.cash -= qty * RULES.PROCESSING_COST;
                    procCost += qty * RULES.PROCESSING_COST;

                    // 同時に投入も
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

            // 3. 投入
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

            // 4. 仕入れ
            const space = this.matCap(s) - s.materials;
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

        return { sales, soldCount };
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
            totalSold: s.totalSold,
            avgPrice: s.totalSold > 0 ? Math.round(s.totalRevenue / s.totalSold) : 0
        };
    }

    runMultiple(strategy, runs) {
        let successCount = 0;
        let totalEq = 0, maxEq = -9999, minEq = 9999;
        let totalSold = 0;

        for (let i = 0; i < runs; i++) {
            const r = this.runGame(strategy);
            if (r.success) successCount++;
            totalEq += r.equity;
            maxEq = Math.max(maxEq, r.equity);
            minEq = Math.min(minEq, r.equity);
            totalSold += r.totalSold;
        }

        return {
            name: strategy.name,
            runs,
            successRate: (successCount / runs * 100).toFixed(2),
            avgEq: Math.round(totalEq / runs),
            maxEq,
            minEq,
            avgSold: Math.round(totalSold / runs),
            successCount
        };
    }

    runAll(runsEach = 3000) {
        console.log('='.repeat(70));
        console.log(`MG シミュレーション v5 - ${STRATEGIES.length}戦略 × ${runsEach}回`);
        console.log('='.repeat(70));

        const all = [];

        for (const strat of STRATEGIES) {
            const r = this.runMultiple(strat, runsEach);
            all.push(r);
            console.log(`${strat.name.padEnd(15)} | ${r.successRate.padStart(6)}% | avg¥${r.avgEq.toString().padStart(4)} | max¥${r.maxEq.toString().padStart(4)} | sold${r.avgSold.toString().padStart(3)}`);
        }

        all.sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));

        console.log('\n' + '='.repeat(70));
        console.log('TOP 10 成功率');
        console.log('='.repeat(70));
        for (let i = 0; i < Math.min(10, all.length); i++) {
            const r = all[i];
            console.log(`${(i+1).toString().padStart(2)}. ${r.name.padEnd(15)} | ${r.successRate.padStart(6)}% | avg¥${r.avgEq} | max¥${r.maxEq}`);
        }

        const byAvg = [...all].sort((a, b) => b.avgEq - a.avgEq);
        console.log('\n' + '='.repeat(70));
        console.log('TOP 10 平均自己資本');
        console.log('='.repeat(70));
        for (let i = 0; i < Math.min(10, byAvg.length); i++) {
            const r = byAvg[i];
            console.log(`${(i+1).toString().padStart(2)}. ${r.name.padEnd(15)} | avg¥${r.avgEq} | ${r.successRate}%`);
        }

        return all;
    }
}

// 実行
const sim = new Simulator();
const results = sim.runAll(3000);

// 成功戦略詳細
console.log('\n' + '='.repeat(70));
console.log('成功戦略詳細');
console.log('='.repeat(70));

const successes = results.filter(r => parseFloat(r.successRate) > 0);
if (successes.length > 0) {
    console.log(`成功可能戦略: ${successes.length}/${STRATEGIES.length}\n`);
    successes.forEach(r => {
        const strat = STRATEGIES.find(s => s.name === r.name);
        console.log(`【${r.name}】${r.successRate}% (${r.successCount}回)`);
        console.log(`  R${strat.chips.r} E${strat.chips.e}, 借入:${strat.borrow3||'なし'}, 機械:${strat.sm3?'あり':'なし'}`);
        console.log(`  売上${r.avgSold}個, 平均¥${r.avgEq}\n`);
    });
} else {
    console.log('成功戦略なし');
}
