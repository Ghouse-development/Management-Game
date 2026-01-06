const MGSimulation = require('./js/simulation-engine.js');

// デバッグモード有効
MGSimulation.debugMode = true;

// 1回実行
const result = MGSimulation.runSimulation({ allAI: true });

// PLAYERのactionLogを取得
const playerLogs = result.actionLogs.find(a => a.companyIndex === 0);
if (playerLogs && playerLogs.log) {
    console.log('\n=== PLAYERの全行動ログ ===\n');

    // 期別にグループ化
    let currentPeriod = 2;
    playerLogs.log.forEach((entry, idx) => {
        // 期の変更を検出
        if (entry.action && entry.action.includes('期首') && entry.detail && entry.detail.includes('サイコロ')) {
            const match = entry.detail.match(/サイコロ(\d)/);
            if (match) {
                currentPeriod = parseInt(match[1]);
                console.log(`\n--- ${currentPeriod}期 ---`);
            }
        }
        console.log(`  [${idx}] ${entry.action}: ${entry.detail || ''} ${entry.amount ? `(¥${entry.amount})` : ''}`);
    });
}

// 2期終了時の状態
const period2 = result.periods.find(p => p.period === 2);
const p2Data = period2?.periodEndResults?.find(c => c.companyIndex === 0);
console.log('\n=== 2期終了時（PLAYER）===');
console.log(`  自己資本: ¥${p2Data?.equityAfter}`);
console.log(`  チップF: ¥${p2Data?.chipCost}`);
console.log(`  人件費: ¥${p2Data?.wage}`);
console.log(`  減価償却: ¥${p2Data?.depreciation}`);

// 3期終了時の状態
const period3 = result.periods.find(p => p.period === 3);
const p3Data = period3?.periodEndResults?.find(c => c.companyIndex === 0);
console.log('\n=== 3期終了時（PLAYER）===');
console.log(`  自己資本: ¥${p3Data?.equityAfter}`);
console.log(`  F合計: ¥${p3Data?.totalF}`);
console.log(`  人件費: ¥${p3Data?.wage} (W:${p3Data?.wageWorker}, M:${p3Data?.wageMachine}, S:${p3Data?.wageSalesman}, Max:${p3Data?.wageMaxPersonnel})`);
console.log(`  減価償却: ¥${p3Data?.depreciation}`);
console.log(`  チップF: ¥${p3Data?.chipCost}`);

// 最終結果
const finalPlayer = result.finalResults?.find(c => c.companyIndex === 0);
console.log(`\n=== 最終結果 ===`);
console.log(`  5期末自己資本: ¥${finalPlayer?.finalEquity}`);
console.log(`  順位: ${finalPlayer?.rank}位`);

// 会社別最終結果
console.log('\n=== 全社最終結果 ===');
result.finalResults?.sort((a, b) => b.finalEquity - a.finalEquity).forEach((c, i) => {
    console.log(`  ${i+1}位: ¥${c.finalEquity} (${c.strategyType})`);
});
