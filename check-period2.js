const MGSimulation = require('./js/simulation-engine.js');

// 1回実行してPLAYERの詳細を確認
const result = MGSimulation.runSimulation({ allAI: true });

// actionLogsの構造を確認
console.log('=== actionLogs構造確認 ===');
if (result.actionLogs.length > 0) {
    console.log('サンプル:', JSON.stringify(result.actionLogs[0], null, 2));
}
console.log(`総ログ数: ${result.actionLogs.length}`);

// 2期のPLAYER行動を確認（異なるフィールド名を試す）
console.log('\n=== PLAYERの2期行動ログ ===\n');
const p2Actions = result.actionLogs.filter(log =>
    log.period === 2 && (log.companyIndex === 0 || log.company === 0 || log.companyName?.includes('プレイヤー'))
);
console.log(`2期PLAYERログ数: ${p2Actions.length}`);
p2Actions.slice(0, 20).forEach(a => {
    console.log(`  ${a.action || a.type}: ${a.detail || a.description || JSON.stringify(a).slice(0, 100)}`);
});

// 2期結果
const period2 = result.periods.find(p => p.period === 2);
const p2Data = period2?.periodEndResults?.find(c => c.companyIndex === 0);
console.log(`\n2期終了: 自己資本¥${p2Data?.equityAfter}, F=¥${p2Data?.totalF}, チップF=¥${p2Data?.chipCost}`);

// 3期のPLAYER行動を確認
console.log('\n=== PLAYERの3期行動ログ ===\n');
const p3Actions = result.actionLogs.filter(log => log.period === 3 && log.companyIndex === 0);
p3Actions.forEach(a => {
    console.log(`  ${a.action}: ${a.detail || JSON.stringify(a)}`);
});

// 3期結果
const period3 = result.periods.find(p => p.period === 3);
const p3Data = period3?.periodEndResults?.find(c => c.companyIndex === 0);
console.log(`\n3期終了: 自己資本¥${p3Data?.equityAfter}, F=¥${p3Data?.totalF}`);
console.log(`  人件費: ¥${p3Data?.wage}, 減価償却: ¥${p3Data?.depreciation}, チップF: ¥${p3Data?.chipCost}`);
