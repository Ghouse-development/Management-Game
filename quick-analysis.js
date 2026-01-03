#!/usr/bin/env node
/**
 * MG クイック戦略分析
 *
 * 主要な戦略パターンを迅速に分析
 */

const MGSimulation = require('./js/simulation-engine.js');

console.log('========================================');
console.log('  MG クイック戦略分析');
console.log('========================================\n');

// シンプルな戦略シミュレーター
function simulateStrategy(config, runs = 100) {
    let totalEquity = 0;
    let totalMQ = 0;
    let totalG = 0;
    let targetReached = 0;
    let wins = 0;
    let totalSold = 0;

    for (let i = 0; i < runs; i++) {
        const result = runSingleGame(config);
        totalEquity += result.equity;
        totalMQ += result.mq;
        totalG += result.g;
        totalSold += result.soldQty;
        if (result.equity >= 450) targetReached++;
        if (result.rank === 1) wins++;
    }

    return {
        avgEquity: Math.round(totalEquity / runs),
        avgMQ: Math.round(totalMQ / runs),
        avgG: Math.round(totalG / runs),
        avgSold: Math.round(totalSold / runs),
        targetRate: Math.round((targetReached / runs) * 100),
        winRate: Math.round((wins / runs) * 100)
    };
}

function runSingleGame(config) {
    const gameState = new MGSimulation.GameState();
    gameState.initCompanies();
    const company = gameState.companies[0];

    // 初期設定
    if (config.startWithLarge) {
        // 大型機械でスタート（200円で購入済みと仮定）
        company.machines = [{ type: 'large', attachments: 0 }];
        company.cash -= 100; // 追加投資分
    } else if (config.addAttachment) {
        company.machines[0].attachments = 1;
        company.cash -= 30;
    }

    // 2期～5期をシミュレート
    for (let period = 2; period <= 5; period++) {
        gameState.period = period;

        // 期首: 借入
        if (config.maxLoan) {
            const equity = company.calculateEquity(period);
            const limit = MGSimulation.RULES.getLoanLimit(period, equity);
            const available = limit - company.longTermLoan;
            if (available > 0) {
                MGSimulation.ActionEngine.borrowLongTerm(company, available, period, equity);
            }
        }

        // 3期に大型機械にアップグレード
        if (period === 3 && config.upgradeAt3) {
            // 小型機械を売却
            if (company.machines[0].type === 'small') {
                const bookValue = 80; // 3期開始時の簿価
                const salePrice = Math.floor(bookValue * 0.7);
                company.cash += salePrice;
                company.totalSpecialLoss += bookValue - salePrice;
                company.machines = [];
            }
            // 大型機械を購入
            if (company.cash >= 200) {
                company.cash -= 200;
                company.machines.push({ type: 'large', attachments: 0 });
            }
        }

        // ターン実行
        const maxRows = MGSimulation.RULES.MAX_ROWS[period];
        let row = 1;

        while (row < maxRows) {
            // リスクカード (20%)
            if (Math.random() < 0.20) {
                MGSimulation.SimulationRunner.processRiskCard(company, gameState);
            } else {
                // 行動決定
                const action = decideAction(company, gameState, period, config);
                executeAction(company, action, gameState, config);
            }
            row++;
            company.currentRow = row;

            // 他社も進める
            for (let i = 1; i < gameState.companies.length; i++) {
                const other = gameState.companies[i];
                if (other.currentRow < maxRows) {
                    const otherAction = MGSimulation.AIDecisionEngine.decideAction(other, gameState);
                    MGSimulation.SimulationRunner.executeAction(other, otherAction, gameState);
                    other.currentRow++;
                }
            }
        }

        // 期末処理
        MGSimulation.PeriodEndEngine.process(gameState);
        gameState.companies.forEach(c => c.currentRow = 1);
    }

    // 結果計算
    const equity = company.calculateEquity(5);
    const allEquities = gameState.companies.map(c => c.calculateEquity(5)).sort((a, b) => b - a);
    const rank = allEquities.indexOf(equity) + 1;

    const avgCost = 13; // 平均材料費+加工費
    const mq = company.totalSales - (company.totalSoldQuantity * avgCost);
    const g = mq - company.totalF;

    return {
        equity,
        rank,
        mq,
        g,
        soldQty: company.totalSoldQuantity
    };
}

function decideAction(company, gameState, period, config) {
    // 販売を最優先（製品があれば売る）
    if (company.products > 0) {
        const chips = company.chips.research || 0;
        let price = chips >= 4 ? 32 : (chips >= 2 ? 28 : 24);
        const market = gameState.markets.find(m => m.sellPrice >= price) || gameState.markets[4];
        return {
            type: 'SELL',
            price: Math.min(price, market.sellPrice),
            quantity: Math.min(company.getSalesCapacity(), company.products),
            market
        };
    }

    // 生産（材料か仕掛品があれば）
    const mfgCap = company.getMfgCapacity();
    if ((company.materials > 0 || company.wip > 0) && mfgCap > 0) {
        const m2w = Math.min(company.materials, 10 - company.wip);
        const w2p = Math.min(mfgCap, company.wip + m2w);
        if (w2p > 0 && company.cash >= w2p) {
            return { type: 'PRODUCE', materialToWip: m2w, wipToProduct: w2p };
        }
    }

    // チップ購入（現金に余裕がある時のみ、1ターンに1枚まで）
    const minCashForChip = 80; // 最低80円残して購入
    const targetR = config.researchChips || 0;
    const currentR = (company.chips.research || 0) + (company.nextPeriodChips.research || 0);
    if (currentR < targetR && company.cash >= 40 + minCashForChip) {
        return { type: 'BUY_CHIP', chipType: 'research', isExpress: true };
    }

    const targetE = config.educationChips || 0;
    const currentE = (company.chips.education || 0) + (company.nextPeriodChips.education || 0);
    if (currentE < targetE && company.cash >= 40 + minCashForChip) {
        return { type: 'BUY_CHIP', chipType: 'education', isExpress: true };
    }

    // 材料購入
    const qty = config.materialQty || 4;
    const storage = company.getStorageCapacity() - company.materials - company.products;
    const buyQty = period === 2 ? Math.min(qty, storage) : Math.min(qty, mfgCap, storage);
    const market = gameState.markets.reduce((best, m) => m.buyPrice < best.buyPrice ? m : best);
    const cost = market.buyPrice * buyQty;
    if (buyQty > 0 && company.cash >= cost + 20) {
        return { type: 'BUY_MATERIALS', market, quantity: buyQty };
    }

    return { type: 'DO_NOTHING' };
}

function executeAction(company, action, gameState, config) {
    if (!action) return;

    switch (action.type) {
        case 'SELL':
            // 入札勝率計算
            const chips = company.chips.research || 0;
            const isParent = gameState.isParent(company.index);
            let winRate = 0.20 + chips * 0.12 + (isParent ? 0.1 : 0);
            if (action.price <= 24) winRate += 0.15;
            else if (action.price <= 28) winRate += 0.10;
            winRate = Math.min(0.85, winRate);

            if (Math.random() < winRate) {
                const revenue = action.price * action.quantity;
                company.cash += revenue;
                company.products -= action.quantity;
                company.totalSales += revenue;
                company.totalSoldQuantity += action.quantity;
            }
            break;

        case 'BUY_CHIP':
            MGSimulation.ActionEngine.buyChip(company, action.chipType, action.isExpress);
            break;

        case 'PRODUCE':
            MGSimulation.ActionEngine.produce(company, action.materialToWip, action.wipToProduct);
            break;

        case 'BUY_MATERIALS':
            MGSimulation.ActionEngine.buyMaterials(company, action.quantity, action.market, gameState);
            break;
    }
}

// ============================================
// 分析実行
// ============================================

console.log('=== 機械構成の影響 ===\n');

const machineConfigs = [
    { name: '小型のみ(能力1)', startWithLarge: false, addAttachment: false, upgradeAt3: false },
    { name: '小型+ｱﾀｯﾁ(能力2)', startWithLarge: false, addAttachment: true, upgradeAt3: false },
    { name: '3期に大型化(能力4)', startWithLarge: false, addAttachment: false, upgradeAt3: true },
    { name: '最初から大型(能力4)', startWithLarge: true, addAttachment: false, upgradeAt3: false },
];

machineConfigs.forEach(config => {
    config.researchChips = 2;
    config.educationChips = 1;
    config.maxLoan = true;
    config.materialQty = 4;

    const result = simulateStrategy(config, 200);
    console.log(`${config.name}: 自己資本¥${result.avgEquity}, G=¥${result.avgG}, MQ=¥${result.avgMQ}, 販売${result.avgSold}個, 達成${result.targetRate}%`);
});

console.log('\n=== 研究チップ枚数の影響（大型機械使用時）===\n');

for (let r = 0; r <= 5; r++) {
    const config = {
        startWithLarge: true,
        researchChips: r,
        educationChips: 1,
        maxLoan: true,
        materialQty: 4
    };
    const result = simulateStrategy(config, 200);
    console.log(`研究${r}枚: 自己資本¥${result.avgEquity}, G=¥${result.avgG}, MQ=¥${result.avgMQ}, 販売${result.avgSold}個, 達成${result.targetRate}%`);
}

console.log('\n=== 教育チップの影響（大型機械+研究3枚）===\n');

for (let e = 0; e <= 3; e++) {
    const config = {
        startWithLarge: true,
        researchChips: 3,
        educationChips: e,
        maxLoan: true,
        materialQty: 4
    };
    const result = simulateStrategy(config, 200);
    console.log(`教育${e}枚: 自己資本¥${result.avgEquity}, G=¥${result.avgG}, 販売${result.avgSold}個, 達成${result.targetRate}%`);
}

console.log('\n=== 借入戦略の影響 ===\n');

const loanConfigs = [
    { name: '借入なし', maxLoan: false },
    { name: '最大借入', maxLoan: true },
];

loanConfigs.forEach(lc => {
    const config = {
        startWithLarge: true,
        researchChips: 3,
        educationChips: 1,
        maxLoan: lc.maxLoan,
        materialQty: 4
    };
    const result = simulateStrategy(config, 200);
    console.log(`${lc.name}: 自己資本¥${result.avgEquity}, G=¥${result.avgG}, 達成${result.targetRate}%`);
});

console.log('\n=== 材料購入量の影響 ===\n');

for (let qty = 1; qty <= 6; qty++) {
    const config = {
        startWithLarge: true,
        researchChips: 3,
        educationChips: 1,
        maxLoan: true,
        materialQty: qty
    };
    const result = simulateStrategy(config, 200);
    console.log(`${qty}個ずつ: 自己資本¥${result.avgEquity}, G=¥${result.avgG}, 販売${result.avgSold}個`);
}

console.log('\n=== 最適戦略の検証（200回×3）===\n');

const optimalConfig = {
    startWithLarge: true,
    researchChips: 4,
    educationChips: 1,
    maxLoan: true,
    materialQty: 4
};

for (let i = 0; i < 3; i++) {
    const result = simulateStrategy(optimalConfig, 200);
    console.log(`試行${i+1}: 自己資本¥${result.avgEquity}, G=¥${result.avgG}, 販売${result.avgSold}個, 達成${result.targetRate}%, 勝率${result.winRate}%`);
}

console.log('\n========================================');
console.log('  分析完了');
console.log('========================================');
