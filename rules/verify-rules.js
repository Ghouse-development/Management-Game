/**
 * ルール検証スクリプト
 * シミュレーション実行前に必ず実行し、全ルールが実装済みであることを確認する
 */

const fs = require('fs');
const path = require('path');

const checklistPath = path.join(__dirname, 'rules-checklist.json');

function verifyRules() {
    console.log('=== MGルール実装検証 ===\n');

    const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));

    let totalRules = 0;
    let implemented = 0;
    let notImplemented = [];

    for (const [categoryId, category] of Object.entries(checklist.categories)) {
        console.log(`【${category.name}】`);

        for (const rule of category.rules) {
            totalRules++;
            const status = rule.implemented ? '✅' : '❌';

            if (rule.implemented) {
                implemented++;
            } else {
                notImplemented.push({ id: rule.id, rule: rule.rule, category: category.name });
            }

            console.log(`  ${status} ${rule.id}: ${rule.rule}`);
        }
        console.log('');
    }

    const coverage = ((implemented / totalRules) * 100).toFixed(1);

    console.log('=== 検証結果 ===\n');
    console.log(`実装済み: ${implemented}/${totalRules} (${coverage}%)`);
    console.log(`未実装: ${notImplemented.length}件\n`);

    if (notImplemented.length > 0) {
        console.log('=== 未実装ルール一覧 ===\n');
        for (const item of notImplemented) {
            console.log(`[${item.category}] ${item.id}: ${item.rule}`);
        }
        console.log('\n❌ シミュレーション実行不可：全ルールを実装してください');
        return false;
    }

    console.log('✅ 全ルール実装済み：シミュレーション実行可能');
    return true;
}

// 実行
const allImplemented = verifyRules();
process.exit(allImplemented ? 0 : 1);
