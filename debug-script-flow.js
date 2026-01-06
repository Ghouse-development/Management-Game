const MGSimulation = require('./js/simulation-engine.js');

// テスト用の単純なシミュレーションを1期分だけ実行
// PLAYERのスクリプト実行をトレース

// AIDecisionEngineのgetScriptedActionを拡張してログ出力
const originalGetScripted = MGSimulation.AIDecisionEngine.getScriptedAction;
MGSimulation.AIDecisionEngine.getScriptedAction = function(company, gameState, recursionDepth = 0) {
    if (company.strategyType === 'PLAYER') {
        const period = gameState.period;
        const scriptIndex = company.scriptIndex || 0;
        console.log(`[getScriptedAction] period=${period}, scriptIndex=${scriptIndex}, cash=${company.cash}, mat=${company.materials}, prod=${company.products}`);
    }
    const result = originalGetScripted.call(this, company, gameState, recursionDepth);
    if (company.strategyType === 'PLAYER') {
        console.log(`[getScriptedAction] => ${result ? result.type + ': ' + result.detail : 'null'}`);
    }
    return result;
};

// createScriptedActionもフック
const originalCreate = MGSimulation.AIDecisionEngine.createScriptedAction;
MGSimulation.AIDecisionEngine.createScriptedAction = function(entry, company, gameState) {
    const result = originalCreate.call(this, entry, company, gameState);
    if (company.strategyType === 'PLAYER') {
        console.log(`  [createScriptedAction] ${entry.action} => ${result ? 'OK' : 'null (failed)'}`);
        if (!result && entry.action === 'BUY_MATERIALS') {
            const maxPrice = entry.maxPrice || 99;
            const markets = gameState.markets.filter(m => m.buyPrice <= maxPrice);
            const storageSpace = company.getStorageCapacity() - company.materials - company.products;
            console.log(`    maxPrice=${maxPrice}, availableMarkets=${markets.length}, storageSpace=${storageSpace}`);
            markets.forEach(m => {
                console.log(`    market ${m.name}: buyPrice=${m.buyPrice}, cash check: ${company.cash} >= ${m.buyPrice * 3} = ${company.cash >= m.buyPrice * 3}`);
            });
        }
    }
    return result;
};

// 実行
console.log('=== Script Flow Debug ===\n');
const result = MGSimulation.runSimulation({ allAI: true });

// 最終結果
console.log('\n=== 結果 ===');
const player = result.finalResults?.find(c => c.companyIndex === 0);
console.log(`PLAYER: 5期末自己資本 ¥${player?.finalEquity}, 順位 ${player?.rank}位`);
