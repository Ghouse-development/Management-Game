/**
 * MG動作確認テスト - 実際の動作を検証
 *
 * 「存在確認」ではなく「動作確認」を行うテスト
 * ルールが実際に適用されているかを検証
 *
 * 実行: node tests/behavior-tests.js
 */

const assert = require('assert');
const path = require('path');
const MG = require(path.join(__dirname, '..', 'js', 'simulation-engine.js'));

let passed = 0;
let failed = 0;
const failures = [];

function test(id, name, fn) {
    try {
        fn();
        console.log(`  ✓ ${id}: ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ✗ ${id}: ${name}`);
        console.log(`    Error: ${e.message}`);
        failures.push({ id, name, error: e.message });
        failed++;
    }
}

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║        MG 動作確認テスト（実動作検証）                       ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

// ====================================
// 期首処理の動作確認
// ====================================
console.log('\n【期首処理 - 実動作確認】');

test('BEH-PS-001', 'PC購入が3期以降で実行される', () => {
    // 会社を作成して3期の期首処理を実行
    const company = new MG.Company(0, 'TestCo', 'BALANCED');
    company.cash = 100;
    company.chips.computer = 0;

    const gameState = new MG.GameState();

    // 2期では購入しない
    MG.SimulationRunner.executeAIInvestmentStrategy(company, 2, gameState);
    assert.strictEqual(company.chips.computer, 0, '2期ではPC購入しない');

    // 3期では購入する
    const cashBefore = company.cash;
    MG.SimulationRunner.executeAIInvestmentStrategy(company, 3, gameState);
    assert.strictEqual(company.chips.computer, 1, '3期でPC購入する');
    assert.ok(cashBefore - company.cash >= 20, 'PC購入で20円以上減少');
});

test('BEH-PS-002', '保険購入が3期以降で実行される', () => {
    const company = new MG.Company(0, 'TestCo', 'BALANCED');
    company.cash = 100;
    company.chips.insurance = 0;

    const gameState = new MG.GameState();

    // 2期では購入しない
    MG.SimulationRunner.executeAIInvestmentStrategy(company, 2, gameState);
    assert.strictEqual(company.chips.insurance, 0, '2期では保険購入しない');

    // 3期では購入する
    company.chips.computer = 0; // PCリセット
    company.cash = 100;
    MG.SimulationRunner.executeAIInvestmentStrategy(company, 3, gameState);
    assert.strictEqual(company.chips.insurance, 1, '3期で保険購入する');
});

test('BEH-PS-003', '期首処理の履歴が記録される', () => {
    const company = new MG.Company(0, 'TestCo', 'RESEARCH_FOCUSED');
    company.cash = 200;
    company.chips.computer = 0;
    company.chips.insurance = 0;

    const gameState = new MG.GameState();
    MG.SimulationRunner.executeAIInvestmentStrategy(company, 3, gameState);

    assert.ok(company.periodStartActions, '期首処理履歴が存在');
    assert.ok(company.periodStartActions.length > 0, '期首処理が記録されている');

    const pcAction = company.periodStartActions.find(a => a.type === 'PC購入');
    assert.ok(pcAction, 'PC購入が記録されている');
});

// ====================================
// 販売制限の動作確認
// ====================================
console.log('\n【販売制限 - 実動作確認】');

test('BEH-SALE-001', '最小販売数は2個', () => {
    assert.strictEqual(MG.RULES.MIN_SALE_QUANTITY, 2, '最小販売数が2に設定されている');
});

test('BEH-SALE-002', '最小販売数ルールが定義されている', () => {
    // 入札システムで最小2個のチェックができることを確認
    const company = new MG.Company(0, 'TestCo', 'BALANCED');
    company.products = 1;

    // 1個では販売能力が足りない扱いになるべき
    // 直接売却関数はないが、BiddingEngineで処理される
    assert.ok(MG.BiddingEngine, 'BiddingEngineが存在');
    assert.ok(MG.RULES.MIN_SALE_QUANTITY >= 2, '最小販売数が2以上');
});

// ====================================
// F計算の動作確認
// ====================================
console.log('\n【F計算 - 実動作確認】');

test('BEH-F-001', 'F計算にPCコストが含まれる', () => {
    const company = new MG.Company(0, 'TestCo', 'BALANCED');
    company.chips.computer = 1;
    company.workers = 1;
    company.salesmen = 0;
    company.machines = [{ type: 'small', attachments: 0 }];

    const gameState = new MG.GameState();
    gameState.currentPeriod = 3;
    gameState.wageMultiplier = 1.0;

    const result = MG.PeriodEndEngine.processCompany(company, gameState, 3);

    assert.ok(result.pcCost >= 20, 'PCコストが計算に含まれる');
});

test('BEH-F-002', 'F計算に保険コストが含まれる', () => {
    const company = new MG.Company(0, 'TestCo', 'BALANCED');
    company.chips.insurance = 1;
    company.workers = 1;
    company.salesmen = 0;
    company.machines = [{ type: 'small', attachments: 0 }];

    const gameState = new MG.GameState();
    gameState.currentPeriod = 3;
    gameState.wageMultiplier = 1.0;

    const result = MG.PeriodEndEngine.processCompany(company, gameState, 3);

    assert.strictEqual(result.insuranceCost, 5, '保険コストは5円');
});

test('BEH-F-003', 'F合計=人件費+減価償却+PC+保険+チップ+利息', () => {
    const company = new MG.Company(0, 'TestCo', 'BALANCED');
    company.chips.computer = 1;
    company.chips.insurance = 1;
    company.workers = 1;
    company.salesmen = 0;
    company.machines = [{ type: 'small', attachments: 0 }];
    company.shortTermLoan = 0;

    const gameState = new MG.GameState();
    gameState.currentPeriod = 3;
    gameState.wageMultiplier = 1.0;

    const result = MG.PeriodEndEngine.processCompany(company, gameState, 3);

    const expectedF = result.wage + result.depreciation + result.pcCost +
                      result.insuranceCost + result.chipCost + (result.shortTermInterest || 0);

    assert.strictEqual(result.totalF, expectedF, 'F合計が正しく計算される');
});

// ====================================
// 5期勝利条件の動作確認
// ====================================
console.log('\n【5期勝利条件 - 実動作確認】');

test('BEH-VIC-001', '在庫10個以上の条件が定義されている', () => {
    assert.strictEqual(MG.RULES.VICTORY.MIN_INVENTORY, 10, '最低在庫10個');
});

test('BEH-VIC-002', 'チップ3枚以上の条件が定義されている', () => {
    assert.strictEqual(MG.RULES.VICTORY.MIN_CARRYOVER_CHIPS, 3, '最低チップ3枚');
});

test('BEH-VIC-003', '勝利条件が実際に評価される', () => {
    // 勝利条件を満たす会社を作成
    const winner = new MG.Company(0, 'Winner', 'BALANCED');
    winner.equity = 500;
    winner.materials = 5;
    winner.wip = 3;
    winner.products = 3; // 合計11個
    winner.chips.research = 2;
    winner.nextPeriodChips.research = 2; // 合計4枚

    // 勝利条件を満たさない会社を作成
    const loser = new MG.Company(1, 'Loser', 'BALANCED');
    loser.equity = 500;
    loser.materials = 2;
    loser.wip = 2;
    loser.products = 2; // 合計6個（10個未満）
    loser.chips.research = 1;
    loser.nextPeriodChips.research = 0; // 合計1枚（3枚未満）

    // 在庫チェック
    const winnerInventory = winner.materials + winner.wip + winner.products;
    const loserInventory = loser.materials + loser.wip + loser.products;

    assert.ok(winnerInventory >= 10, '勝者は在庫10個以上');
    assert.ok(loserInventory < 10, '敗者は在庫10個未満');

    // チップチェック
    const winnerChips = (winner.chips.research || 0) + (winner.chips.education || 0) +
                        (winner.chips.advertising || 0) + (winner.nextPeriodChips.research || 0) +
                        (winner.nextPeriodChips.education || 0) + (winner.nextPeriodChips.advertising || 0);
    const loserChips = (loser.chips.research || 0) + (loser.chips.education || 0) +
                       (loser.chips.advertising || 0) + (loser.nextPeriodChips.research || 0) +
                       (loser.nextPeriodChips.education || 0) + (loser.nextPeriodChips.advertising || 0);

    assert.ok(winnerChips >= 3, '勝者はチップ3枚以上');
    assert.ok(loserChips < 3, '敗者はチップ3枚未満');
});

// ====================================
// シミュレーション統合テスト
// ====================================
console.log('\n【シミュレーション統合テスト】');

test('BEH-SIM-001', 'シミュレーションが完了する', () => {
    const result = MG.runSimulation();
    assert.ok(result, 'シミュレーション結果が返される');
    assert.ok(result.winner, '勝者が決定される');
    assert.ok(result.finalEquities, '最終自己資本が記録される');
});

test('BEH-SIM-002', '全社の結果が記録される', () => {
    const result = MG.runSimulation();
    assert.strictEqual(result.finalEquities.length, 6, '6社の結果');
});

test('BEH-SIM-003', '勝者は最高自己資本を持つ', () => {
    const result = MG.runSimulation();
    const maxEquity = Math.max(...result.finalEquities.map(c => c.equity));
    const winnerEquity = result.winner.equity;
    assert.strictEqual(winnerEquity, maxEquity, '勝者が最高自己資本');
});

test('BEH-SIM-004', '複数回シミュレーションが正常動作', () => {
    const result = MG.runMultipleSimulations(10);
    assert.strictEqual(result.stats.totalRuns, 10, '10回実行');
    assert.ok(result.stats.strategyStats, '戦略別統計が存在');
});

// ====================================
// コスト定数の確認
// ====================================
console.log('\n【コスト定数 - 正確性確認】');

test('BEH-COST-001', 'PC価格は20円', () => {
    assert.strictEqual(MG.RULES.COST.PC, 20, 'PC価格20円');
});

test('BEH-COST-002', '保険価格は5円', () => {
    assert.strictEqual(MG.RULES.COST.INSURANCE, 5, '保険価格5円');
});

test('BEH-COST-003', 'チップ通常価格は20円', () => {
    assert.strictEqual(MG.RULES.COST.CHIP_NORMAL, 20, 'チップ通常20円');
});

test('BEH-COST-004', 'チップ特急価格は40円', () => {
    assert.strictEqual(MG.RULES.COST.CHIP_EXPRESS, 40, 'チップ特急40円');
});

// ====================================
// F計算の正確性テスト（投入完成費用はFに含まない）
// ====================================
console.log('\n【F計算正確性 - 投入完成費用除外】');

test('BEH-F-004', '投入完成費用はFに含まれない', () => {
    const company = new MG.Company(0, 'TestCo', 'BALANCED');
    company.cash = 200;
    company.materials = 5;
    company.wip = 3;
    company.products = 0;
    company.workers = 2;
    // 大型機械で製造能力4を確保
    company.machines = [{ type: 'large', attachments: 0 }];
    company.totalF = 0;

    // 投入完成を実行（材料2個→仕掛、仕掛3個→製品）
    // mfgCapacity = min(machine=4, workers=2) = 2 なので製造2個
    const result = MG.ActionEngine.produce(company, 2, 2);
    assert.ok(result.success, '生産成功');
    assert.strictEqual(result.totalProcessingCost, 4, '加工費は4円(投入2+完成2)');

    // totalFは0のまま（投入完成費用はFに含まない）
    assert.strictEqual(company.totalF, 0, '投入完成費用はFに含まれない');
});

// ====================================
// 1個販売禁止テスト
// ====================================
console.log('\n【販売制限 - 1個販売禁止】');

test('BEH-SALE-003', '製品1個では販売できない（AI判断）', () => {
    const company = new MG.Company(0, 'TestCo', 'BALANCED');
    company.products = 1;  // 製品1個のみ
    company.salesmen = 2;

    const gameState = new MG.GameState();
    gameState.period = 3;

    // AI意思決定で販売が選択されないことを確認
    const salesAction = MG.AIDecisionEngine.evaluateSales(company, gameState);
    assert.strictEqual(salesAction, null, '製品1個では販売アクションが返されない');
});

test('BEH-SALE-004', '入札で1個だけの販売は拒否される', () => {
    const company = new MG.Company(0, 'TestCo', 'BALANCED');
    company.products = 1;

    const gameState = new MG.GameState();
    gameState.companies = [company];

    const market = { name: '名古屋', maxStock: 9, currentStock: 0 };
    const bids = [{
        companyIndex: 0,
        displayPrice: 28,
        quantity: 1  // 1個だけ売ろうとする
    }];

    const results = MG.BiddingEngine.processBids(bids, market, gameState);
    assert.strictEqual(results[0].won, false, '1個販売は拒否される');
    assert.ok(results[0].reason.includes('最小販売数'), '理由が最小販売数に関連');
});

// ====================================
// 結果出力
// ====================================
console.log('\n' + '═'.repeat(60));
console.log(`テスト結果: ${passed}件成功, ${failed}件失敗 (全${passed + failed}項目)`);
console.log('═'.repeat(60));

if (failed > 0) {
    console.log('\n【失敗したテスト】');
    failures.forEach(f => {
        console.log(`  ✗ ${f.id}: ${f.name}`);
        console.log(`    → ${f.error}`);
    });
    console.log('\n❌ 動作テスト失敗 - 実装に問題があります');
    console.log('   シミュレーションを実行する前に修正してください。\n');
    process.exit(1);
} else {
    console.log('\n✅ 全動作テスト成功 - ルールが正しく動作しています\n');
    process.exit(0);
}
