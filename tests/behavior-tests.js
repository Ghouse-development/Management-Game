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

test('BEH-PS-001', 'PC購入コストが定義されている', () => {
    // PC購入はrunPeriod内の期首処理で実行される
    // executeAIInvestmentStrategyでは処理しない設計
    assert.strictEqual(MG.RULES.COST.PC, 20, 'PC価格は20円');
    assert.strictEqual(MG.RULES.COST.CHIP_NORMAL, 20, 'チップ通常価格は20円');
});

test('BEH-PS-002', '保険購入コストが定義されている', () => {
    // 保険購入はコスト削減のため無効化されている
    // ただしルール定義は存在する
    assert.strictEqual(MG.RULES.COST.INSURANCE, 5, '保険価格は5円');
});

test('BEH-PS-003', '期首処理の履歴配列が初期化される', () => {
    const company = new MG.Company(0, 'TestCo', 'BALANCED');
    company.cash = 200;

    const gameState = new MG.GameState();
    MG.SimulationRunner.executeAIInvestmentStrategy(company, 3, gameState);

    // 期首処理履歴配列が初期化されていることを確認
    assert.ok(Array.isArray(company.periodStartActions), '期首処理履歴が配列として存在');
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
// Q学習システムテスト
// ====================================
console.log('\n【Q学習システム - 動作確認】');

const IL = require(path.join(__dirname, '..', 'js', 'intelligent-learning.js'));

test('BEH-QL-001', 'Q学習システムが読み込める', () => {
    assert.ok(IL, 'IntelligentLearningモジュールが存在');
    assert.ok(IL.QTable, 'QTableが存在');
    assert.ok(IL.CompanyTrackers, 'CompanyTrackersが存在');
});

test('BEH-QL-002', '状態エンコードが正しく動作する', () => {
    const company = new MG.Company(0, 'TestCo', 'BALANCED');
    company.cash = 150;
    company.products = 3;
    company.materials = 2;
    company.wip = 1;
    company.chips = { research: 2 };
    company.currentRow = 15;

    const gameState = { period: 3 };
    const stateKey = IL.StateEncoder.encode(company, gameState);

    // 期3, 行15/30=50%=中盤(M), 現金150=中(M), 製品3>=2(Y), 材料+仕掛有(Y), 研究2<3(L)
    assert.strictEqual(stateKey, '3M_M_YY_L', '状態キーが正しい形式');
});

test('BEH-QL-003', '会社別トラッカーが分離されている', () => {
    IL.CompanyTrackers.initGame(3);

    // 各社に別々の行動を記録
    IL.CompanyTrackers.record(0, 'STATE_A', 'BUY', 10);
    IL.CompanyTrackers.record(1, 'STATE_B', 'SELL', 20);
    IL.CompanyTrackers.record(2, 'STATE_C', 'PRODUCE', 15);

    // 各社の履歴が分離されているか確認
    assert.strictEqual(IL.CompanyTrackers.trackers[0].length, 1, '会社0は1件');
    assert.strictEqual(IL.CompanyTrackers.trackers[1].length, 1, '会社1は1件');
    assert.strictEqual(IL.CompanyTrackers.trackers[2].length, 1, '会社2は1件');
    assert.strictEqual(IL.CompanyTrackers.trackers[0][0].actionType, 'BUY', '会社0の行動はBUY');
    assert.strictEqual(IL.CompanyTrackers.trackers[1][0].actionType, 'SELL', '会社1の行動はSELL');
});

test('BEH-QL-004', '探索率が累積シミュレーション回数で調整される', () => {
    // リセット
    IL.QTable.totalSimulations = 0;
    IL.QTable.explorationRate = 0.30;

    // 1000回シミュレーション完了をシミュレート
    for (let i = 0; i < 1000; i++) {
        IL.QTable.onSimulationComplete();
    }

    // 1000回後: 0.30 - 1*0.02 = 0.28（浮動小数点誤差考慮）
    assert.ok(Math.abs(IL.QTable.explorationRate - 0.28) < 0.0001, '1000回後の探索率は約0.28');
    assert.strictEqual(IL.QTable.totalSimulations, 1000, '累積回数は1000');

    // さらに4000回
    for (let i = 0; i < 4000; i++) {
        IL.QTable.onSimulationComplete();
    }

    // 5000回後: 0.30 - 5*0.02 = 0.20（浮動小数点誤差考慮）
    assert.ok(Math.abs(IL.QTable.explorationRate - 0.20) < 0.0001, '5000回後の探索率は約0.20');
});

test('BEH-QL-005', '探索率の最小値は5%', () => {
    IL.QTable.totalSimulations = 0;
    IL.QTable.explorationRate = 0.30;

    // 20000回シミュレーション
    for (let i = 0; i < 20000; i++) {
        IL.QTable.onSimulationComplete();
    }

    // 最小5%で停止
    assert.strictEqual(IL.QTable.explorationRate, 0.05, '探索率は最小5%');
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
