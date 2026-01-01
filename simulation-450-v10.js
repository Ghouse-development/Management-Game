/**
 * MG ¥450達成シミュレーション v10
 * 正確なルール実装：入札価格=記帳価格、チップ返却ルール
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    MACHINE: { small: { cost: 100, capacity: 1 }, large: { cost: 200, capacity: 4 } },
    HIRE: 5,
    // 市場情報（仕入価格、販売上限、容量）
    MARKETS: [
        { name: 'sendai', buyPrice: 10, maxSellPrice: 40, capacity: 3 },
        { name: 'sapporo', buyPrice: 11, maxSellPrice: 36, capacity: 4 },
        { name: 'fukuoka', buyPrice: 12, maxSellPrice: 32, capacity: 6 },
        { name: 'nagoya', buyPrice: 13, maxSellPrice: 28, capacity: 9 },
        { name: 'osaka', buyPrice: 14, maxSellPrice: 24, capacity: 13 },
        { name: 'tokyo', buyPrice: 15, maxSellPrice: 20, capacity: 20 }
    ]
};

function getMfgCapacity(state) {
    if (state.workers === 0) return 0;
    return state.machinesSmall + state.machinesLarge * 4 + 1 + Math.min(state.education || 0, 1);
}

function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    return state.salesmen * 2 + Math.min(state.education || 0, 1);
}

// 価格競争力を計算
function getPriceCompetitiveness(researchChips, isParent) {
    return researchChips * 2 + (isParent ? 2 : 0);
}

// 入札シミュレーション：実際の販売価格を決定
// 入札で勝つためにはコール価格（プライスカード-競争力）が低い必要がある
function simulateBid(market, researchChips, isParent) {
    const competitiveness = getPriceCompetitiveness(researchChips, isParent);

    // 他社の平均競争力（0-6程度）
    const otherCompetitiveness = Math.floor(Math.random() * 7);

    // 入札価格（プライスカード）を決定
    // 競争力が高いほど高い価格で入札できる
    // 最低でもコストをカバーする価格（15円=東京価格）

    // 自社が狙う入札価格
    let targetBidPrice;
    if (competitiveness > otherCompetitiveness + 2) {
        // 圧倒的優位：市場上限価格で入札可能
        targetBidPrice = market.maxSellPrice;
    } else if (competitiveness > otherCompetitiveness) {
        // 優位：上限より2-4円低い価格で勝てる
        targetBidPrice = market.maxSellPrice - Math.floor(Math.random() * 3);
    } else if (competitiveness === otherCompetitiveness) {
        // 同等：50%の確率で勝つ、勝っても4-6円低い
        if (Math.random() < 0.5) {
            targetBidPrice = market.maxSellPrice - 4 - Math.floor(Math.random() * 3);
        } else {
            return null; // 負け
        }
    } else {
        // 劣位：30%の確率でしか勝てない、勝っても低価格
        if (Math.random() < 0.3) {
            targetBidPrice = market.maxSellPrice - 6 - Math.floor(Math.random() * 4);
        } else {
            return null; // 負け
        }
    }

    // 最低価格は15円（赤字にならない範囲）
    return Math.max(15, targetBidPrice);
}

// 利用可能な市場を取得（閉鎖市場を除く）
function getAvailableMarkets(period, diceRoll) {
    const allMarkets = [...RULES.MARKETS];

    if (period === 2) {
        // 2期は全市場開放
        return allMarkets;
    } else {
        // 3期以降: サイコロで閉鎖
        if (diceRoll >= 4) {
            // 仙台・札幌閉鎖
            return allMarkets.filter(m => m.name !== 'sendai' && m.name !== 'sapporo');
        } else {
            // 仙台のみ閉鎖
            return allMarkets.filter(m => m.name !== 'sendai');
        }
    }
}

function calculateF(state, period, diceRoll) {
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const halfWage = Math.round(wageUnit / 2);

    let F = 0;
    // 人件費: (機械+W+S)×単価 + 期中最大人員×半額単価
    F += (state.machinesSmall + state.machinesLarge) * wageUnit;
    F += state.workers * wageUnit;
    F += state.salesmen * wageUnit;
    F += state.maxPersonnel * halfWage;

    // 減価償却
    F += state.machinesSmall * (period === 2 ? 10 : 20);
    F += state.machinesLarge * (period === 2 ? 20 : 40);

    // PC + 保険
    F += RULES.CHIP.pc + RULES.CHIP.insurance;

    // 戦略チップ費用
    if (period === 2) {
        // 2期: 購入枚数 - 繰越枚数 = 消費枚数
        // 繰越枚数 = min(max(0, 期末所持 - 1), 3)
        const chipsConsumed = (state.chipsPurchasedNormal || 0) - (state.chipsCarriedOver || 0);
        F += Math.max(0, chipsConsumed) * RULES.CHIP.normal;
    } else {
        // 3期以降: 繰越チップ × 20円 + 特急チップ × 40円
        F += (state.chipsCarriedOver || 0) * RULES.CHIP.normal;
        F += (state.chipsBoughtExpress || 0) * RULES.CHIP.express;
    }

    return F;
}

function simulatePeriod(state, period, strategy, diceRoll) {
    const maxRows = RULES.MAX_ROWS[period];
    let row = 1;

    const startInv = state.materials * RULES.INVENTORY.material +
                     state.wip * RULES.INVENTORY.wip +
                     state.products * RULES.INVENTORY.product;

    // PC + 保険購入
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    const periodStrategy = strategy[`period${period}`] || {};
    state.chipsPurchasedNormal = 0;
    state.chipsBoughtExpress = 0;
    state.maxPersonnel = state.workers + state.salesmen;

    // 3期以降: 繰越チップ適用
    if (period >= 3) {
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.chipsCarriedOver = state.research + state.education;
        state.nextResearch = 0;
        state.nextEducation = 0;

        // 特急チップ購入
        const expressResearch = periodStrategy.expressResearch || 0;
        for (let i = 0; i < expressResearch && state.cash >= RULES.CHIP.express; i++) {
            state.research++;
            state.cash -= RULES.CHIP.express;
            state.chipsBoughtExpress++;
            row++;
        }
    } else {
        state.research = 0;
        state.education = 0;
        state.chipsCarriedOver = 0;
    }

    // 採用
    const hireQty = periodStrategy.salesman || 0;
    for (let i = 0; i < hireQty && state.cash >= RULES.HIRE; i++) {
        state.salesmen++;
        state.cash -= RULES.HIRE;
        row++;
    }
    state.maxPersonnel = Math.max(state.maxPersonnel, state.workers + state.salesmen);

    // 機械売却
    if (periodStrategy.sellSmallMachine && state.machinesSmall > 0) {
        state.machinesSmall--;
        state.cash += 56;
        row++;
    }

    // 大型機械購入
    if (periodStrategy.largeMachine && state.cash >= RULES.MACHINE.large.cost) {
        state.machinesLarge++;
        state.cash -= RULES.MACHINE.large.cost;
        row++;
    }

    let totalSales = 0;
    let totalMaterialCost = 0;
    let productsSold = 0;

    const markets = getAvailableMarkets(period, diceRoll);
    const marketSold = {};
    markets.forEach(m => marketSold[m.name] = 0);

    // 2期: チップ購入
    if (period === 2) {
        const targetResearch = periodStrategy.research || 0;
        const targetEducation = periodStrategy.education || 0;

        // 1枚ずつ購入
        while (state.research < targetResearch && state.cash >= RULES.CHIP.normal && row <= maxRows - 2) {
            state.research++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
        }
        while (state.education < targetEducation && state.cash >= RULES.CHIP.normal && row <= maxRows - 2) {
            state.education++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
        }
    }

    // 生産・販売サイクル
    while (row <= maxRows - 2) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);

        // リスクカード（10%で¥10損失）
        if (Math.random() < 0.10) {
            state.cash -= 10;
            row++;
            continue;
        }

        // 販売（入札シミュレーション）
        if (state.products > 0 && sc > 0) {
            let sold = false;
            for (const market of markets) {
                const remaining = market.capacity - (marketSold[market.name] || 0);
                if (remaining > 0) {
                    // 入札シミュレーション
                    const bidPrice = simulateBid(market, state.research, true);
                    if (bidPrice !== null) {
                        const sellQty = Math.min(state.products, sc, remaining);
                        state.products -= sellQty;
                        // 記帳価格 = 入札価格（プライスカード）
                        state.cash += sellQty * bidPrice;
                        totalSales += sellQty * bidPrice;
                        productsSold += sellQty;
                        marketSold[market.name] += sellQty;
                        sold = true;
                        break;
                    }
                }
            }
            if (sold) { row++; continue; }

            // 全市場で負けた場合、東京で確実に売る（上限20円）
            if (state.products > 0) {
                const sellQty = Math.min(state.products, sc);
                state.products -= sellQty;
                state.cash += sellQty * 20; // 東京は入札なし、上限20円
                totalSales += sellQty * 20;
                productsSold += sellQty;
                row++;
                continue;
            }
        }

        // 完成
        if (state.wip > 0 && mc > 0 && state.products < 10 && state.cash >= 1) {
            const qty = Math.min(state.wip, mc, 10 - state.products);
            state.wip -= qty;
            state.products += qty;
            state.cash -= qty;
            row++;
            continue;
        }

        // 投入
        if (state.materials > 0 && mc > 0 && state.wip < 10 && state.cash >= 1) {
            const qty = Math.min(state.materials, mc, 10 - state.wip);
            state.materials -= qty;
            state.wip += qty;
            state.cash -= qty;
            row++;
            continue;
        }

        // 仕入れ（最安市場から：仙台¥10）
        if (state.materials < 10 && state.cash >= 10) {
            const qty = Math.min(mc, 10 - state.materials, Math.floor(state.cash / 10));
            if (qty > 0) {
                state.materials += qty;
                state.cash -= qty * 10;
                totalMaterialCost += qty * 10;
                row++;
                continue;
            }
        }

        // 翌期チップ購入
        if (period >= 2) {
            const targetNextResearch = periodStrategy.nextResearch || 0;
            if (state.nextResearch < targetNextResearch && state.cash >= RULES.CHIP.normal) {
                state.nextResearch++;
                state.cash -= RULES.CHIP.normal;
                state.chipsPurchasedNormal++;
                row++;
                continue;
            }
        }

        row++;
    }

    // 2期末: 翌期繰越チップ購入
    if (period === 2) {
        const target2NextResearch = periodStrategy.nextResearch || 0;
        while (state.nextResearch < target2NextResearch && state.cash >= RULES.CHIP.normal && row <= maxRows - 1) {
            state.nextResearch++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
        }
    }

    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

    // 2期末: チップ繰越計算（1枚返却、最大3枚まで）
    if (period === 2) {
        const totalResearch = state.research + state.nextResearch;
        const totalEducation = state.education;
        state.chipsCarriedOver = Math.min(Math.max(0, totalResearch - 1), 3) +
                                  Math.min(Math.max(0, totalEducation - 1), 3);
    }

    const VQ = totalMaterialCost + productsSold * 2 + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;
    const F = calculateF(state, period, diceRoll);
    const G = MQ - F;

    let tax = 0;
    if (state.equity <= 300 && state.equity + G > 300) {
        tax = Math.floor((state.equity + G - 300) * 0.5);
    } else if (state.equity > 300 && G > 0) {
        tax = Math.floor(G * 0.5);
    }

    state.equity += G - tax;

    // 給料支払い
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const halfWage = Math.round(wageUnit / 2);
    const salary = (state.machinesSmall + state.machinesLarge + state.workers + state.salesmen) * wageUnit +
                   state.maxPersonnel * halfWage;
    state.cash -= salary;

    // チップ返却処理
    if (period === 2) {
        // 2期末: 1枚返却、残り最大3枚繰越
        const totalR = state.research + state.nextResearch;
        const totalE = state.education;
        state.nextResearch = Math.min(Math.max(0, totalR - 1), 3);
        state.nextEducation = Math.min(Math.max(0, totalE - 1), 3);
        state.research = 0;
        state.education = 0;
    } else {
        // 3期以降: 全チップ没収、次期予約のみ残る
        state.research = 0;
        state.education = 0;
    }

    return { PQ, VQ, MQ, F, G, tax, productsSold, equity: state.equity, cash: state.cash,
             research: state.research, nextResearch: state.nextResearch, diceRoll };
}

// 戦略定義
const STRATEGIES = {
    // 研究重視（競争力最大化）
    'RESEARCH_MAX': {
        period2: { research: 3, nextResearch: 3 },
        period3: { salesman: 1, expressResearch: 1, nextResearch: 2 },
        period4: { expressResearch: 1, nextResearch: 2 },
        period5: { expressResearch: 1 }
    },
    // バランス型
    'BALANCED': {
        period2: { research: 2, nextResearch: 2 },
        period3: { salesman: 1, nextResearch: 2 },
        period4: { nextResearch: 2 },
        period5: {}
    },
    // 最小投資（効率重視）
    'MINIMAL': {
        period2: { research: 1, nextResearch: 1 },
        period3: { nextResearch: 1 },
        period4: { nextResearch: 1 },
        period5: {}
    },
    // 教育込み
    'WITH_EDUCATION': {
        period2: { research: 2, education: 1, nextResearch: 2 },
        period3: { salesman: 1, nextResearch: 2 },
        period4: { nextResearch: 2 },
        period5: {}
    },
    // 大型機械投資
    'MACHINE': {
        period2: { research: 2, nextResearch: 2 },
        period3: { sellSmallMachine: 1, largeMachine: 1, salesman: 1, nextResearch: 2 },
        period4: { salesman: 1, nextResearch: 2 },
        period5: {}
    },
    // 積極営業
    'SALES_HEAVY': {
        period2: { research: 2, nextResearch: 2 },
        period3: { salesman: 2, nextResearch: 2 },
        period4: { salesman: 1, nextResearch: 2 },
        period5: {}
    },
    // 無投資
    'ZERO_CHIP': {
        period2: {},
        period3: {},
        period4: {},
        period5: {}
    },
    // 翌期のみ
    'NEXT_ONLY': {
        period2: { nextResearch: 2 },
        period3: { nextResearch: 2 },
        period4: { nextResearch: 2 },
        period5: {}
    }
};

function runSimulation(strategyName, runs = 1000) {
    const strategy = STRATEGIES[strategyName];
    const results = [];

    for (let i = 0; i < runs; i++) {
        let state = {
            cash: 112, equity: 283,
            workers: 1, salesmen: 1,
            machinesSmall: 1, machinesLarge: 0,
            materials: 1, wip: 2, products: 1,
            research: 0, education: 0,
            nextResearch: 0, nextEducation: 0,
            maxPersonnel: 2,
            chipsPurchasedNormal: 0,
            chipsBoughtExpress: 0,
            chipsCarriedOver: 0
        };

        let periodResults = [];
        for (let period = 2; period <= 5; period++) {
            const diceRoll = period >= 3 ? Math.floor(Math.random() * 6) + 1 : 0;
            const result = simulatePeriod(state, period, strategy, diceRoll);
            periodResults.push({ period, ...result });
        }

        results.push({ finalEquity: state.equity, success: state.equity >= 450, periods: periodResults });
    }

    return results;
}

function analyzeResults(results, strategyName) {
    const equities = results.map(r => r.finalEquity);
    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
    const max = Math.max(...equities);
    const min = Math.min(...equities);
    const successRate = (results.filter(r => r.success).length / results.length * 100).toFixed(1);

    console.log(`\n=== ${strategyName} ===`);
    console.log(`平均: ¥${avg}, 最高: ¥${max}, 最低: ¥${min}, 達成率: ${successRate}%`);

    const successCases = results.filter(r => r.success);
    if (successCases.length > 0) {
        const example = successCases[0];
        console.log('成功例:');
        example.periods.forEach(p => {
            console.log(`  ${p.period}期: 売${p.productsSold}個 PQ¥${p.PQ} MQ¥${p.MQ} F¥${p.F} G¥${p.G} → ¥${p.equity}`);
        });
    } else {
        const example = results[0];
        console.log('例:');
        example.periods.forEach(p => {
            console.log(`  ${p.period}期: 売${p.productsSold}個 PQ¥${p.PQ} MQ¥${p.MQ} F¥${p.F} G¥${p.G} → ¥${p.equity}`);
        });
    }

    return { strategyName, avg, max, min, successRate: parseFloat(successRate) };
}

console.log('MG ¥450シミュレーション v10（入札価格=記帳価格）\n' + '='.repeat(60));

const allResults = {};
for (const name of Object.keys(STRATEGIES)) {
    allResults[name] = analyzeResults(runSimulation(name, 1000), name);
}

console.log('\n' + '='.repeat(60));
console.log('ランキング:');
Object.values(allResults).sort((a, b) => b.successRate - a.successRate).forEach((r, i) => {
    console.log(`${i + 1}. ${r.strategyName}: 達成率${r.successRate}%, 平均¥${r.avg}`);
});

// 成功パターンをまとめ
console.log('\n' + '='.repeat(60));
console.log('★成功戦略まとめ★');
const successPatterns = Object.entries(allResults)
    .filter(([_, r]) => r.successRate > 0)
    .sort((a, b) => b[1].successRate - a[1].successRate);

successPatterns.forEach(([name, r]) => {
    console.log(`\n【${name}】達成率: ${r.successRate}%, 平均: ¥${r.avg}, 最高: ¥${r.max}`);
    for (const [period, actions] of Object.entries(STRATEGIES[name])) {
        if (Object.keys(actions).length > 0) {
            console.log(`  ${period}: ${JSON.stringify(actions)}`);
        }
    }
});
