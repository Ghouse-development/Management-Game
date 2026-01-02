/**
 * MG シミュレーション v15
 * 6社競争モデル + 正確なルール実装
 *
 * 修正点:
 * - PCチップ製造+1
 * - アタッチメント+1
 * - 広告チップ販売+2
 * - 材料価格: 6社競争で平均13円
 * - 配当: 初回20%、以降10%
 * - 特別損失: リスクカード効果
 * - 3期以降チップ全没収ルール
 */

const RULES = {
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },
    CHIP: { normal: 20, express: 40, pc: 20, insurance: 5 },
    INVENTORY: { material: 13, wip: 14, product: 15 },
    HIRE: 5,
    PLAYERS: 6,
    // 6社競争での現実的な材料価格（平均13円）
    MATERIAL_PRICE: 13,
    // 市場（販売上限価格）
    MARKETS: {
        sendai: { price: 40, stock: 3 },
        sapporo: { price: 36, stock: 4 },
        fukuoka: { price: 32, stock: 6 },
        nagoya: { price: 28, stock: 9 },
        osaka: { price: 24, stock: 13 },
        tokyo: { price: 20, stock: 20 }
    }
};

// リスクカード効果（64枚中の分布）
const RISK_EFFECTS = {
    fCost5: { count: 6, probability: 6/64 },      // クレーム、縁故、退職、機械故障
    fCost10: { count: 4, probability: 4/64 },     // PCトラブル、設計トラブル
    cashLoss30: { count: 2, probability: 2/64 },  // 得意先倒産（2期免除）
    wipLoss: { count: 2, probability: 2/64 },     // 製造ミス（仕掛1個=14円）
    materialLoss: { count: 2, probability: 2/64 }, // 倉庫火災
    productLoss: { count: 2, probability: 2/64 }, // 盗難（製品2個）
    chipReturn: { count: 7, probability: 7/64 },  // 研究3、広告2、教育2
    skipTurn: { count: 4, probability: 4/64 },    // ストライキ、長期紛争、社長病気
    benefit32: { count: 14, probability: 14/64 }, // 研究成功6、教育成功2、広告成功3、独占販売3
    noEffect: { count: 21, probability: 21/64 }   // その他
};

/**
 * 製造能力計算（正確版）
 * - 小型機械: 1 (アタッチメント付き: 2)
 * - 大型機械: 4
 * - PCチップ: +1
 * - 教育チップ: +1 (max 1)
 * - ワーカー数で制限
 */
function getMfgCapacity(state) {
    if (state.workers === 0) return 0;

    let machineCapacity = state.machinesSmall + state.machinesLarge * 4;
    if (state.attachment) machineCapacity += 1;  // アタッチメント+1

    let capacity = machineCapacity;
    capacity += state.pc || 0;  // PCチップ+1
    capacity += Math.min(state.education || 0, 1);  // 教育+1 (max 1)

    return Math.min(capacity, state.workers + machineCapacity);
}

/**
 * 販売能力計算（正確版）
 * - セールスマン: ×2
 * - 広告チップ: +2/枚 (max セールス×2枚)
 * - 教育チップ: +1 (max 1)
 */
function getSalesCapacity(state) {
    if (state.salesmen === 0) return 0;

    const base = state.salesmen * 2;
    const effectiveAds = Math.min(state.advertising || 0, state.salesmen * 2);
    const adBonus = effectiveAds * 2;
    const eduBonus = Math.min(state.education || 0, 1);

    return base + adBonus + eduBonus;
}

/**
 * 6社競争での販売価格計算
 * 研究チップで競争力アップ、ただし市場在庫制限あり
 */
function getAchievablePrice(researchChips, period, diceRoll, competitors) {
    const myPower = researchChips * 2 + (Math.random() < 0.167 ? 2 : 0); // 親ボーナス1/6

    // 競合の平均研究チップ（2期:1枚、3期以降:1.5枚）
    const avgCompetitorChips = period === 2 ? 1 : 1.5;
    const competitorPower = avgCompetitorChips * 2;

    const advantage = myPower - competitorPower;

    // 3期以降の大阪上限
    let osakaMax = 24;
    if (period >= 3) {
        osakaMax = 20 + diceRoll;  // サイコロ1-6で21-26円
    }

    // 利用可能な市場と価格
    let availablePrices;
    if (period === 2) {
        availablePrices = [40, 36, 32, 28, 24];
    } else {
        if (diceRoll >= 4) {
            availablePrices = [32, 28, osakaMax, 20];
        } else {
            availablePrices = [36, 32, 28, osakaMax, 20];
        }
    }

    // 競争力に基づく価格決定
    const rand = Math.random();
    let priceIndex;

    if (advantage >= 4) {
        priceIndex = rand < 0.60 ? 0 : (rand < 0.85 ? 1 : 2);
    } else if (advantage >= 2) {
        priceIndex = rand < 0.40 ? 0 : (rand < 0.70 ? 1 : (rand < 0.90 ? 2 : 3));
    } else if (advantage >= 0) {
        priceIndex = rand < 0.20 ? 0 : (rand < 0.50 ? 1 : (rand < 0.80 ? 2 : 3));
    } else if (advantage >= -2) {
        priceIndex = rand < 0.10 ? 0 : (rand < 0.30 ? 1 : (rand < 0.60 ? 2 : 3));
    } else {
        priceIndex = rand < 0.05 ? 1 : (rand < 0.30 ? 2 : (rand < 0.70 ? 3 : 4));
    }

    return availablePrices[Math.min(priceIndex, availablePrices.length - 1)];
}

/**
 * リスクカード効果をシミュレート
 */
function applyRiskEffect(state, period) {
    const roll = Math.random();
    let effect = { fCost: 0, specialLoss: 0, skipTurn: false, benefitSale: 0 };

    let cumulative = 0;

    // F加算系
    cumulative += RISK_EFFECTS.fCost5.probability;
    if (roll < cumulative) {
        effect.fCost = 5;
        return effect;
    }

    cumulative += RISK_EFFECTS.fCost10.probability;
    if (roll < cumulative) {
        effect.fCost = 10;
        return effect;
    }

    // 得意先倒産（2期免除）
    cumulative += RISK_EFFECTS.cashLoss30.probability;
    if (roll < cumulative) {
        if (period >= 3) {
            state.cash = Math.max(0, state.cash - 30);
            effect.specialLoss = 30;
        }
        return effect;
    }

    // 製造ミス
    cumulative += RISK_EFFECTS.wipLoss.probability;
    if (roll < cumulative) {
        if (state.wip > 0) {
            state.wip--;
            effect.specialLoss = 14;
        }
        return effect;
    }

    // 倉庫火災
    cumulative += RISK_EFFECTS.materialLoss.probability;
    if (roll < cumulative) {
        const loss = state.materials;
        if (state.insurance > 0) {
            state.cash += loss * 8;  // 保険金
            effect.specialLoss = loss * 5;  // 13-8=5円/個
        } else {
            effect.specialLoss = loss * 13;
        }
        state.materials = 0;
        return effect;
    }

    // 盗難
    cumulative += RISK_EFFECTS.productLoss.probability;
    if (roll < cumulative) {
        const stolen = Math.min(2, state.products);
        if (state.insurance > 0) {
            state.cash += stolen * 10;  // 保険金
            effect.specialLoss = stolen * 5;  // 15-10=5円/個
        } else {
            effect.specialLoss = stolen * 15;
        }
        state.products -= stolen;
        return effect;
    }

    // チップ返却
    cumulative += RISK_EFFECTS.chipReturn.probability;
    if (roll < cumulative) {
        // ランダムでチップ返却（研究3/7、広告2/7、教育2/7）
        const chipRoll = Math.random();
        if (chipRoll < 3/7 && state.research > 0) state.research--;
        else if (chipRoll < 5/7 && state.advertising > 0) state.advertising--;
        else if (state.education > 0) state.education--;
        return effect;
    }

    // ターンスキップ
    cumulative += RISK_EFFECTS.skipTurn.probability;
    if (roll < cumulative) {
        effect.skipTurn = true;
        return effect;
    }

    // ベネフィット（32円販売）
    cumulative += RISK_EFFECTS.benefit32.probability;
    if (roll < cumulative) {
        effect.benefitSale = 32;
        return effect;
    }

    return effect;  // 効果なし
}

/**
 * F（固定費）計算
 */
function calculateF(state, period, diceRoll, extraFCost) {
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const halfWage = Math.round(wageUnit / 2);

    let F = 0;

    // 人件費
    F += (state.machinesSmall + state.machinesLarge) * wageUnit;
    F += state.workers * wageUnit;
    F += state.salesmen * wageUnit;
    F += state.maxPersonnel * halfWage;

    // 減価償却
    if (state.attachment) {
        F += period === 2 ? 13 : 26;  // アタッチメント付き
        F += (state.machinesSmall - 1) * (period === 2 ? 10 : 20);
    } else {
        F += state.machinesSmall * (period === 2 ? 10 : 20);
    }
    F += state.machinesLarge * (period === 2 ? 20 : 40);

    // PC・保険
    F += RULES.CHIP.pc + RULES.CHIP.insurance;

    // チップ費用
    if (period === 2) {
        // 2期: 購入分から繰越分を引いた額
        const consumed = Math.max(0, (state.chipsPurchasedNormal || 0) - (state.chipsToCarryOver || 0));
        F += consumed * RULES.CHIP.normal;
    } else {
        // 3期以降: 繰越分20円 + 特急分40円
        F += (state.chipsCarriedOver || 0) * RULES.CHIP.normal;
        F += (state.chipsBoughtExpress || 0) * RULES.CHIP.express;
    }

    // 金利
    F += Math.round((state.loans || 0) * 0.10);
    F += Math.round((state.shortLoans || 0) * 0.08);  // 短期は期中で既に20%払済、残り8%

    // リスクカードによる追加F
    F += extraFCost || 0;

    return F;
}

/**
 * 1期間シミュレーション
 */
function simulatePeriod(state, period, strategy, diceRoll) {
    const maxRows = RULES.MAX_ROWS[period];
    let row = 1;
    let totalFCost = 0;
    let totalSpecialLoss = 0;

    const startInv = state.materials * RULES.INVENTORY.material +
                     state.wip * RULES.INVENTORY.wip +
                     state.products * RULES.INVENTORY.product;

    // 期首現金不足なら短期借入
    if (state.cash < 30) {
        const needed = Math.ceil((30 - state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8;
    }

    // PC・保険購入
    state.pc = 1;
    state.insurance = 1;
    state.cash -= RULES.CHIP.pc + RULES.CHIP.insurance;
    row++;

    const periodStrategy = strategy[`period${period}`] || {};
    state.chipsPurchasedNormal = 0;
    state.chipsBoughtExpress = 0;
    state.maxPersonnel = state.workers + state.salesmen;

    // 3期以降: 繰越チップを適用（会社盤チップは没収済み）
    if (period >= 3) {
        state.research = state.nextResearch || 0;
        state.education = state.nextEducation || 0;
        state.advertising = state.nextAdvertising || 0;
        state.chipsCarriedOver = state.research + state.education + state.advertising;
        state.nextResearch = 0;
        state.nextEducation = 0;
        state.nextAdvertising = 0;

        // 特急チップ購入
        const expressR = periodStrategy.expressResearch || 0;
        for (let i = 0; i < expressR && state.cash >= RULES.CHIP.express; i++) {
            state.research++;
            state.cash -= RULES.CHIP.express;
            state.chipsBoughtExpress++;
            row++;
        }
    } else {
        state.research = 0;
        state.education = 0;
        state.advertising = 0;
        state.chipsCarriedOver = 0;
    }

    // 借入（3期以降）
    if (period >= 3 && periodStrategy.borrow) {
        const maxLoan = Math.floor(state.equity * 0.5);
        const loanAmount = Math.min(periodStrategy.borrow, maxLoan - (state.loans || 0));
        if (loanAmount > 0) {
            const interest = Math.round(loanAmount * 0.1);
            state.loans = (state.loans || 0) + loanAmount;
            state.cash += loanAmount - interest;
            row++;
        }
    }

    // 採用
    const hireQty = periodStrategy.salesman || 0;
    for (let i = 0; i < hireQty && state.cash >= RULES.HIRE; i++) {
        state.salesmen++;
        state.cash -= RULES.HIRE;
        row++;
    }
    state.maxPersonnel = Math.max(state.maxPersonnel, state.workers + state.salesmen);

    let totalSales = 0;
    let totalMaterialCost = 0;
    let productsSold = 0;

    // 2期: チップ購入
    if (period === 2) {
        const targetR = periodStrategy.research || 0;
        const targetE = periodStrategy.education || 0;
        const targetA = periodStrategy.advertising || 0;

        while (state.research < targetR && state.cash >= RULES.CHIP.normal && row <= maxRows - 3) {
            state.research++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
        }
        while (state.education < targetE && state.cash >= RULES.CHIP.normal && row <= maxRows - 3) {
            state.education++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
        }
        while (state.advertising < targetA && state.cash >= RULES.CHIP.normal && row <= maxRows - 3) {
            state.advertising++;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
        }
    }

    // メインループ
    while (row <= maxRows - 2) {
        const mc = getMfgCapacity(state);
        const sc = getSalesCapacity(state);

        // リスクカード効果（20%の確率）
        if (Math.random() < 0.20) {
            const effect = applyRiskEffect(state, period);
            totalFCost += effect.fCost;
            totalSpecialLoss += effect.specialLoss;
            if (effect.skipTurn) {
                row++;
                continue;
            }
            if (effect.benefitSale > 0 && state.products > 0) {
                const sellQty = Math.min(5, state.products, sc);
                state.products -= sellQty;
                state.cash += sellQty * effect.benefitSale;
                totalSales += sellQty * effect.benefitSale;
                productsSold += sellQty;
                row++;
                continue;
            }
        }

        // 販売
        if (state.products > 0 && sc > 0) {
            const sellQty = Math.min(state.products, sc);
            const price = getAchievablePrice(state.research, period, diceRoll, RULES.PLAYERS);
            state.products -= sellQty;
            state.cash += sellQty * price;
            totalSales += sellQty * price;
            productsSold += sellQty;
            row++;
            continue;
        }

        // 完成
        if (state.wip > 0 && mc > 0 && state.products < 10 && state.cash >= 1) {
            const qty = Math.min(state.wip, mc, 10 - state.products);
            state.wip -= qty;
            state.products += qty;
            state.cash -= qty;  // 完成費1円/個
            row++;
            continue;
        }

        // 投入
        if (state.materials > 0 && mc > 0 && state.wip < 10 && state.cash >= 1) {
            const qty = Math.min(state.materials, mc, 10 - state.wip);
            state.materials -= qty;
            state.wip += qty;
            state.cash -= qty;  // 投入費1円/個
            row++;
            continue;
        }

        // 材料仕入れ（6社競争で平均13円）
        if (state.materials < 10 && state.cash >= RULES.MATERIAL_PRICE) {
            const qty = Math.min(mc, 10 - state.materials, Math.floor(state.cash / RULES.MATERIAL_PRICE));
            if (qty > 0) {
                state.materials += qty;
                state.cash -= qty * RULES.MATERIAL_PRICE;
                totalMaterialCost += qty * RULES.MATERIAL_PRICE;
                row++;
                continue;
            }
        }

        // 次期チップ予約
        const targetNextR = periodStrategy.nextResearch || 0;
        if ((state.nextResearch || 0) < targetNextR && state.cash >= RULES.CHIP.normal) {
            state.nextResearch = (state.nextResearch || 0) + 1;
            state.cash -= RULES.CHIP.normal;
            state.chipsPurchasedNormal++;
            row++;
            continue;
        }

        row++;  // 何もできない場合
    }

    // 期末処理
    const endInv = state.materials * RULES.INVENTORY.material +
                   state.wip * RULES.INVENTORY.wip +
                   state.products * RULES.INVENTORY.product;

    // 2期末のチップ繰越計算
    if (period === 2) {
        const totalR = state.research + (state.nextResearch || 0);
        const totalE = state.education;
        const totalA = state.advertising;
        state.chipsToCarryOver = Math.min(Math.max(0, totalR - 1), 3) +
                                  Math.min(Math.max(0, totalE - 1), 3) +
                                  Math.min(Math.max(0, totalA - 1), 3);
    }

    // 損益計算
    const VQ = totalMaterialCost + productsSold * 2 + startInv - endInv;
    const PQ = totalSales;
    const MQ = PQ - VQ;
    const F = calculateF(state, period, diceRoll, totalFCost);
    const G = MQ - F - totalSpecialLoss;

    // 税金・配当計算
    let tax = 0;
    let dividend = 0;
    const newEquity = state.equity + G;

    if (newEquity > 300) {
        if (!state.hasExceeded300) {
            const excess = newEquity - 300;
            tax = Math.round(excess * 0.5);
            dividend = Math.round(excess * 0.2);  // 初回20%
            state.hasExceeded300 = true;
        } else if (G > 0) {
            tax = Math.round(G * 0.5);
            dividend = Math.round(G * 0.1);  // 以降10%
        }
    }

    state.equity = newEquity - tax;

    // 期末支払い
    let wageUnit = RULES.WAGE_BASE[period];
    if (period >= 3) wageUnit = Math.round(wageUnit * (diceRoll <= 3 ? 1.1 : 1.2));
    const halfWage = Math.round(wageUnit / 2);
    const salary = (state.machinesSmall + state.machinesLarge + state.workers + state.salesmen) * wageUnit +
                   state.maxPersonnel * halfWage;
    state.cash -= salary + dividend;

    // 現金不足なら短期借入
    if (state.cash < 0) {
        const needed = Math.ceil(Math.abs(state.cash) / 0.8 / 50) * 50;
        state.shortLoans = (state.shortLoans || 0) + needed;
        state.cash += needed * 0.8;
    }

    // チップ没収・繰越処理
    if (period === 2) {
        const totalR = state.research + (state.nextResearch || 0);
        const totalE = state.education;
        const totalA = state.advertising;
        state.nextResearch = Math.min(Math.max(0, totalR - 1), 3);
        state.nextEducation = Math.min(Math.max(0, totalE - 1), 3);
        state.nextAdvertising = Math.min(Math.max(0, totalA - 1), 3);
    } else {
        // 3期以降: 会社盤チップ全没収、次期繰越のみ残る
        // nextResearch等は次期に繰り越される
    }
    state.research = 0;
    state.education = 0;
    state.advertising = 0;

    return { PQ, VQ, MQ, F, G, tax, dividend, productsSold, specialLoss: totalSpecialLoss };
}

// 戦略定義
const STRATEGIES = {
    // 基本
    'R0': { period2: {}, period3: {}, period4: {}, period5: {} },
    'R1': { period2: { research: 1 }, period3: {}, period4: {}, period5: {} },
    'R2': { period2: { research: 2 }, period3: {}, period4: {}, period5: {} },
    'R3': { period2: { research: 3 }, period3: {}, period4: {}, period5: {} },

    // 教育込み
    'R1E1': { period2: { research: 1, education: 1 }, period3: {}, period4: {}, period5: {} },
    'R2E1': { period2: { research: 2, education: 1 }, period3: {}, period4: {}, period5: {} },
    'R2E2': { period2: { research: 2, education: 2 }, period3: {}, period4: {}, period5: {} },
    'R0E2': { period2: { education: 2 }, period3: {}, period4: {}, period5: {} },

    // 次期繰越
    'R2E1_N1': { period2: { research: 2, education: 1, nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} },
    'R2E1_N2': { period2: { research: 2, education: 1, nextResearch: 2 }, period3: { nextResearch: 2 }, period4: { nextResearch: 2 }, period5: {} },
    'R1E1_N1': { period2: { research: 1, education: 1, nextResearch: 1 }, period3: { nextResearch: 1 }, period4: { nextResearch: 1 }, period5: {} },

    // 借入戦略
    'R2E1_N1_B50': { period2: { research: 2, education: 1, nextResearch: 1 }, period3: { nextResearch: 1, borrow: 50 }, period4: { nextResearch: 1, borrow: 50 }, period5: {} },
    'R2E1_N1_B100': { period2: { research: 2, education: 1, nextResearch: 1 }, period3: { nextResearch: 1, borrow: 100 }, period4: { nextResearch: 1 }, period5: {} },

    // 広告戦略
    'R2A1': { period2: { research: 2, advertising: 1 }, period3: {}, period4: {}, period5: {} },
    'R1E1A1': { period2: { research: 1, education: 1, advertising: 1 }, period3: {}, period4: {}, period5: {} },
};

function runSimulation(strategyName, runs = 10000) {
    const strategy = STRATEGIES[strategyName];
    if (!strategy) return null;

    const results = [];

    for (let i = 0; i < runs; i++) {
        let state = {
            cash: 112, equity: 283,
            workers: 1, salesmen: 1,
            machinesSmall: 1, machinesLarge: 0,
            attachment: false,
            materials: 1, wip: 2, products: 1,
            research: 0, education: 0, advertising: 0,
            nextResearch: 0, nextEducation: 0, nextAdvertising: 0,
            pc: 0, insurance: 0,
            maxPersonnel: 2,
            loans: 0, shortLoans: 0,
            hasExceeded300: false
        };

        let periodResults = [];

        for (let period = 2; period <= 5; period++) {
            const diceRoll = period >= 3 ? Math.floor(Math.random() * 6) + 1 : 0;
            const result = simulatePeriod(state, period, strategy, diceRoll);
            periodResults.push(result);
        }

        results.push({
            finalEquity: state.equity,
            success: state.equity >= 450,
            periodResults
        });
    }

    return results;
}

function analyzeResults(results, strategyName) {
    const equities = results.map(r => r.finalEquity);
    const sorted = [...equities].sort((a, b) => b - a);
    const avg = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
    const max = Math.max(...equities);
    const min = Math.min(...equities);
    const successRate = (results.filter(r => r.success).length / results.length * 100).toFixed(2);
    const p90 = sorted[Math.floor(results.length * 0.1)];
    const p50 = sorted[Math.floor(results.length * 0.5)];

    return { strategyName, avg, max, min, successRate: parseFloat(successRate), p90, p50 };
}

// 実行
console.log('='.repeat(70));
console.log('MG シミュレーション v15 - 6社競争モデル');
console.log('='.repeat(70));
console.log('修正点: PC+1, アタッチメント+1, 広告+2, 材料13円, 配当, 特別損失, チップ没収');
console.log(`戦略数: ${Object.keys(STRATEGIES).length}, 各10000回シミュレーション\n`);

const allResults = {};
for (const name of Object.keys(STRATEGIES)) {
    const results = runSimulation(name, 10000);
    if (results) {
        allResults[name] = analyzeResults(results, name);
    }
}

// 達成率でソート
const sorted = Object.values(allResults).sort((a, b) => b.successRate - a.successRate);

console.log('【達成率ランキング】');
console.log('-'.repeat(70));
sorted.forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${r.strategyName.padEnd(15)} 達成率${String(r.successRate).padStart(6)}% 平均¥${r.avg} 中央¥${r.p50} 上位10%¥${r.p90} 最高¥${r.max}`);
});

console.log('\n' + '='.repeat(70));
console.log('【分析】');
const best = sorted[0];
console.log(`最高達成率: ${best.successRate}% (${best.strategyName})`);
console.log(`全戦略平均達成率: ${(sorted.reduce((a, b) => a + b.successRate, 0) / sorted.length).toFixed(2)}%`);

if (best.successRate < 10) {
    console.log('\n⚠️ 注意: 6社競争では¥450達成は非常に困難');
    console.log('   現実的な材料価格(13円)と競争により、利益率が大幅に低下');
}
