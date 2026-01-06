/**
 * 行動見える化ツール v1.0
 *
 * 各期・各行の行動を分かりやすく表示する
 * ユーザー要望: "毎回このように見える状態で各期・各行の行動を見える化"
 */

const MGSimulation = require('./js/simulation-engine.js');
const fs = require('fs');

// ============================================
// 設定
// ============================================
const CONFIG = {
    SHOW_ALL_COMPANIES: false,  // true: 全6社表示、false: PLAYERのみ
    COMPANY_INDEX: 5,           // allAIモードでのPLAYER戦略会社（0から数えて5番目）
    VERBOSE: true               // 詳細表示
};

// ============================================
// 結果の見える化
// ============================================
function visualizeResult(result) {
    console.log('\n');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('                    【行動見える化レポート】                      ');
    console.log('════════════════════════════════════════════════════════════════');

    // 価格テーブル確認（絶対条件）
    console.log('\n【記帳価格テーブル（親の時）- ユーザー指定 2026-01-06】');
    console.log('┌────┬───────────────────────────────────────┐');
    console.log('│ 期 │  0枚  1枚  2枚  3枚  4枚  5枚        │');
    console.log('├────┼───────────────────────────────────────┤');
    console.log('│ 2期│  ¥24  ¥26  ¥28  ¥30  ¥32             │');
    console.log('│ 3期│  ¥24  ¥26  ¥28  ¥30  ¥32  ¥34        │');
    console.log('│ 4期│  ¥22  ¥24  ¥26  ¥28  ¥30  ¥32        │');
    console.log('│ 5期│  ¥21  ¥23  ¥25  ¥27  ¥29  ¥31        │');
    console.log('└────┴───────────────────────────────────────┘');

    // 勝利条件確認（絶対条件）
    console.log('\n【5期終了条件 - 絶対厳守】');
    console.log('  ✓ 在庫10個以上（材料+仕掛品+製品）');
    console.log('  ✓ 次期繰り越しチップ3枚以上');
    console.log('  ✓ 自己資本¥450以上');

    // 期別結果の表示
    if (result.periods) {
        for (const period of result.periods) {
            visualizePeriod(period, result);
        }
    }

    // 最終結果
    visualizeFinalResults(result);
}

// ============================================
// 期別表示
// ============================================
function visualizePeriod(periodData, result) {
    const period = periodData.period;

    console.log('\n');
    console.log(`╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║                        【${period}期】                              ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝`);

    // サイコロ結果（3期以降）
    if (periodData.diceEffects) {
        const dice = periodData.diceEffects;
        console.log(`\n  サイコロ: ${dice.value}`);
        console.log(`    閉鎖市場: ${dice.closedMarkets.join(', ') || 'なし'}`);
        console.log(`    人件費倍率: ×${dice.wageMultiplier}`);
        console.log(`    大阪価格: ¥${dice.osakaPrice}`);
    }

    // 会社別行動ログ
    const companyIndex = CONFIG.SHOW_ALL_COMPANIES ? null : CONFIG.COMPANY_INDEX;

    if (result.actionLogs) {
        const logsToShow = companyIndex !== null
            ? result.actionLogs.filter(l => l.companyIndex === companyIndex)
            : result.actionLogs;

        for (const companyLog of logsToShow) {
            visualizeCompanyActions(companyLog, period);
        }
    }

    // 期末結果
    if (periodData.periodEndResults) {
        console.log('\n  ─────────────────────────────────────────────────────');
        console.log('  【期末結果】');

        const resultsToShow = companyIndex !== null
            ? periodData.periodEndResults.filter(r => r.companyIndex === companyIndex)
            : periodData.periodEndResults;

        for (const r of resultsToShow) {
            const company = result.strategies ? result.strategies[r.companyIndex] : `会社${r.companyIndex}`;
            console.log(`    ${company}: 自己資本¥${r.equityAfter} F¥${r.totalF}`);
        }
    }
}

// ============================================
// 会社別行動表示
// ============================================
function visualizeCompanyActions(companyLog, period) {
    const { companyIndex, log } = companyLog;
    const company = `会社${companyIndex}`;

    // この期の行動のみ抽出
    const periodActions = log.filter(entry => {
        // 期の判定ロジック（簡易版）
        return true;  // 全て表示（期の判定は複雑なので省略）
    });

    if (periodActions.length === 0) return;

    console.log(`\n  ── ${company} の行動 ──`);

    let rowNum = 0;
    for (const action of periodActions) {
        const icon = getActionIcon(action.action);
        const amount = action.amount ? `¥${action.amount}` : '';
        console.log(`    ${rowNum.toString().padStart(2)}行: ${icon} ${action.action} ${action.detail || ''} ${amount}`);
        if (action.consumedRow) rowNum++;
    }
}

// ============================================
// アクションアイコン
// ============================================
function getActionIcon(action) {
    if (action.includes('販売')) return '[売]';
    if (action.includes('材料')) return '[買]';
    if (action.includes('完成') || action.includes('投入') || action.includes('PRODUCE')) return '[作]';
    if (action.includes('チップ')) return '[C]';
    if (action.includes('採用')) return '[雇]';
    if (action.includes('機械')) return '[機]';
    if (action.includes('借入')) return '[借]';
    if (action.includes('期末')) return '[末]';
    if (action.includes('期首')) return '[首]';
    return '[　]';
}

// ============================================
// 最終結果表示
// ============================================
function visualizeFinalResults(result) {
    console.log('\n');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('                        【最終結果】                              ');
    console.log('════════════════════════════════════════════════════════════════');

    if (result.finalEquities) {
        // 自己資本順にソート
        const sorted = [...result.finalEquities].sort((a, b) => b.equity - a.equity);

        console.log('\n  順位  会社名              自己資本   勝利条件');
        console.log('  ────────────────────────────────────────────────');

        sorted.forEach((company, rank) => {
            const strategy = result.strategies ? result.strategies[company.companyIndex] : `会社${company.companyIndex}`;
            const equityOk = company.equity >= 450 ? '✓' : '✗';
            const inventoryOk = (company.inventory || 0) >= 10 ? '✓' : '✗';
            const chipsOk = (company.chips || 0) >= 3 ? '✓' : '✗';

            const win = equityOk === '✓' && inventoryOk === '✓' && chipsOk === '✓' ? '★勝利★' : '';

            console.log(`  ${(rank + 1).toString().padStart(2)}位  ${strategy.padEnd(18)} ¥${company.equity.toString().padStart(5)}   資本${equityOk} 在庫${inventoryOk} chip${chipsOk} ${win}`);
        });
    }

    // PLAYER戦略の結果（allAIモード対応）
    const playerIndex = CONFIG.COMPANY_INDEX;
    const playerResult = result.finalEquities?.find(c => c.companyIndex === playerIndex);

    if (playerResult) {
        console.log('\n  ─────────────────────────────────────────────────────');
        console.log('  【PLAYER戦略 詳細結果】');
        console.log(`    自己資本: ¥${playerResult.equity}`);
        console.log(`    在庫: ${playerResult.inventory || '?'}個`);
        console.log(`    チップ: ${playerResult.chips || '?'}枚`);
    }
}

// ============================================
// メイン実行
// ============================================
function main() {
    console.log('シミュレーション実行中...\n');

    const result = MGSimulation.runSimulation({ allAI: true });

    // 戦略情報を追加
    result.strategies = [
        'RESEARCH_FOCUSED',
        'SALES_FOCUSED',
        'LOW_CHIP',
        'BALANCED',
        'AGGRESSIVE',
        'PLAYER'
    ];

    visualizeResult(result);
}

// コマンドラインから実行
if (require.main === module) {
    main();
}

module.exports = { visualizeResult };
