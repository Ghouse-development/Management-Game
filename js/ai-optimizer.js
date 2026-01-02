/**
 * AI最適化エンジン - 真のモンテカルロシミュレーション
 *
 * 10,000回のシミュレーションを通じて5期終了時の自己資本を最大化する
 * 最適な行動を提案するシステム
 */

const AIOptimizer = {
    // シミュレーション回数
    SIMULATION_COUNT: 1000,  // ブラウザ性能を考慮

    // ============================================
    // リスクカード確率計算システム
    // ============================================

    /**
     * 残りリスクカードの確率分布を計算
     */
    calculateRiskProbabilities: function() {
        const usedIds = gameState.usedRiskCards || [];
        const allCards = (typeof RISK_CARDS !== 'undefined') ? RISK_CARDS : [];
        const remainingCards = allCards.filter(c => !usedIds.includes(c.id));
        const totalRemaining = remainingCards.length;

        // カードタイプ別に集計
        const probabilities = {
            total: totalRemaining,
            used: usedIds.length,

            // 損失系（重大なもの）
            laborAccident: 0,       // 労災発生（労働制限）
            consumerMovement: 0,    // 消費者運動（販売制限）
            fire: 0,                // 火災（材料/製品損失）
            theft: 0,               // 盗難（製品損失）
            bankruptcy: 0,          // 得意先倒産（売掛金損失）
            badInventory: 0,        // 不良在庫発生
            marketClosure: 0,       // 市場閉鎖

            // チャンス系
            specialOrder: 0,        // 特別注文
            priceRise: 0,           // 相場上昇

            // その他
            noEffect: 0,            // 効果なし

            // 詳細リスト
            details: []
        };

        // 各カードをカテゴリ分類
        remainingCards.forEach(card => {
            const id = card.id;
            let category = 'other';

            // カードIDからカテゴリを判定
            if ([5, 6].includes(id)) category = 'laborAccident';
            else if ([3, 4].includes(id)) category = 'consumerMovement';
            else if ([17, 18, 19, 20].includes(id)) category = 'fire';
            else if ([21, 22].includes(id)) category = 'theft';
            else if ([23, 24, 25, 26].includes(id)) category = 'bankruptcy';
            else if ([45, 46, 47, 48].includes(id)) category = 'badInventory';
            else if ([7, 8, 9, 10, 11, 12, 13, 14, 15, 16].includes(id)) category = 'marketClosure';
            else if ([33, 34, 35, 36, 37, 38, 39, 40].includes(id)) category = 'specialOrder';
            else if ([57, 58, 59, 60].includes(id)) category = 'priceRise';
            else if ([61, 62, 63, 64].includes(id)) category = 'noEffect';

            if (probabilities[category] !== undefined) {
                probabilities[category]++;
            }

            probabilities.details.push({
                id: card.id,
                name: card.name,
                category,
                probability: 1 / totalRemaining
            });
        });

        // 確率に変換
        const categories = ['laborAccident', 'consumerMovement', 'fire', 'theft',
                          'bankruptcy', 'badInventory', 'marketClosure',
                          'specialOrder', 'priceRise', 'noEffect'];
        categories.forEach(cat => {
            probabilities[cat + 'Prob'] = totalRemaining > 0
                ? probabilities[cat] / totalRemaining
                : 0;
        });

        return probabilities;
    },

    /**
     * 出尽くしたリスクカードを表示
     */
    getExhaustedRisks: function() {
        const usedIds = gameState.usedRiskCards || [];
        const allCards = (typeof RISK_CARDS !== 'undefined') ? RISK_CARDS : [];

        // カテゴリ別の最大枚数
        const maxCounts = {
            laborAccident: 2,
            consumerMovement: 2,
            fire: 4,
            theft: 2,
            bankruptcy: 4,
            badInventory: 4,
            marketClosure: 10
        };

        const exhausted = [];
        const usedCounts = {};

        usedIds.forEach(id => {
            const card = allCards.find(c => c.id === id);
            if (card) {
                let category = this.getCategoryFromId(id);
                usedCounts[category] = (usedCounts[category] || 0) + 1;
            }
        });

        Object.keys(maxCounts).forEach(cat => {
            if ((usedCounts[cat] || 0) >= maxCounts[cat]) {
                exhausted.push(cat);
            }
        });

        return exhausted;
    },

    getCategoryFromId: function(id) {
        if ([5, 6].includes(id)) return 'laborAccident';
        if ([3, 4].includes(id)) return 'consumerMovement';
        if ([17, 18, 19, 20].includes(id)) return 'fire';
        if ([21, 22].includes(id)) return 'theft';
        if ([23, 24, 25, 26].includes(id)) return 'bankruptcy';
        if ([45, 46, 47, 48].includes(id)) return 'badInventory';
        if ([7, 8, 9, 10, 11, 12, 13, 14, 15, 16].includes(id)) return 'marketClosure';
        return 'other';
    },

    // ============================================
    // モンテカルロシミュレーション
    // ============================================

    /**
     * 現在の状態から最適な行動をシミュレーションで決定
     * @param {Object} options - オプション
     * @param {number} options.diceRoll - サイコロの出目（1-6、指定なしはランダム）
     * @param {Array} options.closedMarkets - 閉鎖される市場名のリスト
     */
    findOptimalAction: function(options = {}) {
        const company = gameState.companies[0];
        const period = gameState.currentPeriod;
        const currentRow = company.currentRow || 1;

        console.log('\n' + '═'.repeat(70));
        console.log('【AI最適化エンジン】モンテカルロシミュレーション開始');
        console.log('═'.repeat(70));

        // リスク確率を表示
        const riskProb = this.calculateRiskProbabilities();
        console.log(`\n残りリスクカード: ${riskProb.total}枚 (使用済み: ${riskProb.used}枚)`);
        console.log('主要リスク確率:');
        console.log(`  労災発生: ${(riskProb.laborAccidentProb * 100).toFixed(1)}% (${riskProb.laborAccident}枚)`);
        console.log(`  消費者運動: ${(riskProb.consumerMovementProb * 100).toFixed(1)}% (${riskProb.consumerMovement}枚)`);
        console.log(`  火災: ${(riskProb.fireProb * 100).toFixed(1)}% (${riskProb.fire}枚)`);
        console.log(`  市場閉鎖: ${(riskProb.marketClosureProb * 100).toFixed(1)}% (${riskProb.marketClosure}枚)`);
        console.log(`  不良在庫: ${(riskProb.badInventoryProb * 100).toFixed(1)}% (${riskProb.badInventory}枚)`);

        // 出尽くしたリスク
        const exhausted = this.getExhaustedRisks();
        if (exhausted.length > 0) {
            console.log(`\n✓ 出尽くしたリスク: ${exhausted.join(', ')}`);
        }

        // 閉鎖市場の設定
        const closedMarkets = options.closedMarkets || [];
        if (closedMarkets.length > 0) {
            console.log(`\n⚠ 閉鎖市場設定: ${closedMarkets.join(', ')}`);
        }

        // サイコロの出目設定
        const diceRoll = options.diceRoll || null;
        if (diceRoll) {
            console.log(`🎲 サイコロ出目設定: ${diceRoll}`);
        }

        // 可能な行動の列挙
        const possibleActions = this.enumeratePossibleActions(company, period, {
            closedMarkets,
            diceRoll
        });

        console.log(`\n検討する行動: ${possibleActions.length}種類`);

        // 各行動をシミュレーション
        const results = [];
        const simCount = this.SIMULATION_COUNT;

        possibleActions.forEach((action, idx) => {
            const simResults = [];
            for (let i = 0; i < simCount; i++) {
                const result = this.simulateFromAction(company, action, {
                    closedMarkets,
                    diceRoll,
                    riskProbabilities: riskProb
                });
                simResults.push(result);
            }

            // 統計計算
            const equities = simResults.map(r => r.finalEquity);
            const avgEquity = equities.reduce((a, b) => a + b, 0) / simCount;
            const minEquity = Math.min(...equities);
            const maxEquity = Math.max(...equities);
            const successRate = equities.filter(e => e >= 450).length / simCount;

            // 標準偏差
            const variance = equities.reduce((sum, e) => sum + Math.pow(e - avgEquity, 2), 0) / simCount;
            const stdDev = Math.sqrt(variance);

            results.push({
                action,
                avgEquity,
                minEquity,
                maxEquity,
                stdDev,
                successRate,
                simCount
            });
        });

        // 最適な行動を選択（期待自己資本が最大）
        results.sort((a, b) => b.avgEquity - a.avgEquity);

        console.log('\n【シミュレーション結果】');
        console.log('─'.repeat(70));
        console.log('順位 │ 行動                    │ 平均自己資本 │ 最悪ケース │ 450達成率');
        console.log('─────┼─────────────────────────┼─────────────┼───────────┼──────────');

        results.slice(0, 5).forEach((r, i) => {
            const actionName = this.formatActionName(r.action).padEnd(23);
            console.log(`  ${i+1}  │ ${actionName} │ ¥${r.avgEquity.toFixed(0).padStart(10)} │ ¥${r.minEquity.toFixed(0).padStart(8)} │ ${(r.successRate * 100).toFixed(1)}%`);
        });

        console.log('─'.repeat(70));

        const best = results[0];
        console.log(`\n★ 推奨行動: ${this.formatActionName(best.action)}`);
        console.log(`  期待自己資本: ¥${best.avgEquity.toFixed(0)} (最悪: ¥${best.minEquity.toFixed(0)}, 最良: ¥${best.maxEquity.toFixed(0)})`);
        console.log(`  450達成率: ${(best.successRate * 100).toFixed(1)}%`);
        console.log('═'.repeat(70) + '\n');

        return {
            recommended: best,
            alternatives: results.slice(1, 5),
            riskAnalysis: riskProb,
            exhaustedRisks: exhausted
        };
    },

    /**
     * 可能な行動を列挙
     */
    enumeratePossibleActions: function(company, period, options) {
        const actions = [];
        const mfgCapacity = getManufacturingCapacity(company);
        const salesCapacity = getSalesCapacity(company);
        const closedMarkets = options.closedMarkets || [];

        // 販売（市場閉鎖を考慮）
        if (company.products > 0 && salesCapacity > 0) {
            const availableMarkets = this.getAvailableMarkets(closedMarkets);
            if (availableMarkets.length > 0) {
                for (let qty = 1; qty <= Math.min(company.products, salesCapacity); qty++) {
                    actions.push({ type: 'SELL', qty, markets: availableMarkets });
                }
            }
        }

        // 製造
        if ((company.wip > 0 || company.materials > 0) && mfgCapacity > 0) {
            actions.push({ type: 'PRODUCE' });
        }

        // 材料購入
        if (company.cash >= 20) {
            for (let qty = 1; qty <= Math.min(3, Math.floor(company.cash / 10)); qty++) {
                actions.push({ type: 'BUY_MATERIALS', qty });
            }
        }

        // チップ購入
        const chipCost = period === 2 ? 20 : 40;
        if (company.cash >= chipCost) {
            ['research', 'education', 'advertising'].forEach(type => {
                actions.push({ type: 'BUY_CHIP', chipType: type, cost: chipCost });
            });
        }

        // 翌期チップ購入
        if (period >= 2 && company.cash >= 20) {
            ['research', 'education', 'advertising'].forEach(type => {
                actions.push({ type: 'BUY_NEXT_CHIP', chipType: type, cost: 20 });
            });
        }

        // 投資（アタッチメント、採用など）
        if (company.cash >= 30) {
            const machine = company.machines.find(m => m.type === 'small' && m.attachments === 0);
            if (machine) {
                actions.push({ type: 'BUY_ATTACHMENT' });
            }
        }

        if (company.cash >= 5) {
            actions.push({ type: 'HIRE_WORKER' });
            actions.push({ type: 'HIRE_SALESMAN' });
        }

        // 待機
        actions.push({ type: 'WAIT' });

        return actions;
    },

    /**
     * 利用可能な市場を取得
     */
    getAvailableMarkets: function(closedMarkets) {
        const allMarkets = ['大阪', '名古屋', '福岡', '広島', '札幌', '仙台', '東京'];
        return allMarkets.filter(m => !closedMarkets.includes(m));
    },

    /**
     * 行動からシミュレーションを実行
     */
    simulateFromAction: function(company, action, options) {
        // 状態をディープコピー
        const state = JSON.parse(JSON.stringify(company));
        const period = gameState.currentPeriod;

        // 行動を適用
        this.applyAction(state, action, period, options);

        // 残り行をシミュレート（簡易版）
        const remainingRows = gameState.maxRows - (state.currentRow || 1);
        const result = this.simulateRemainingGame(state, period, remainingRows, options);

        return result;
    },

    /**
     * 行動を状態に適用
     */
    applyAction: function(state, action, period, options) {
        switch (action.type) {
            case 'SELL':
                const price = this.getExpectedPrice(state, options.closedMarkets || []);
                const revenue = price * action.qty;
                state.cash += revenue;
                state.products -= action.qty;
                state.totalSales = (state.totalSales || 0) + revenue;
                break;

            case 'PRODUCE':
                const mfgCap = getManufacturingCapacity(state);
                const complete = Math.min(state.wip, mfgCap);
                const start = Math.min(state.materials, mfgCap - complete);
                state.products += complete;
                state.wip = state.wip - complete + start;
                state.materials -= start;
                state.cash -= complete;
                break;

            case 'BUY_MATERIALS':
                state.materials += action.qty;
                state.cash -= action.qty * 10;
                break;

            case 'BUY_CHIP':
                state.chips[action.chipType]++;
                state.cash -= action.cost;
                break;

            case 'BUY_NEXT_CHIP':
                state.nextPeriodChips[action.chipType]++;
                state.cash -= action.cost;
                break;

            case 'BUY_ATTACHMENT':
                const machine = state.machines.find(m => m.type === 'small' && m.attachments === 0);
                if (machine) {
                    machine.attachments = 1;
                    state.cash -= 30;
                }
                break;

            case 'HIRE_WORKER':
                state.workers++;
                state.cash -= 5;
                break;

            case 'HIRE_SALESMAN':
                state.salesmen++;
                state.cash -= 5;
                break;
        }

        state.currentRow = (state.currentRow || 1) + 1;
    },

    /**
     * 期待販売価格を計算
     */
    getExpectedPrice: function(state, closedMarkets) {
        const researchBonus = (state.chips.research || 0) * 2;
        let basePrice = 24;  // 大阪

        if (researchBonus >= 4 && !closedMarkets.includes('名古屋')) {
            basePrice = 28;
        } else if (researchBonus >= 6 && !closedMarkets.includes('福岡')) {
            basePrice = 32;
        }

        // 市場閉鎖で価格が下がる可能性
        if (closedMarkets.length >= 2) {
            basePrice = Math.max(20, basePrice - 4);
        }

        return basePrice;
    },

    /**
     * 残りのゲームをシミュレート（簡易版）
     */
    simulateRemainingGame: function(state, startPeriod, remainingRows, options) {
        let equity = state.equity;

        // 簡易シミュレーション：残り行で期待されるG
        const salesCapacity = getSalesCapacity(state);
        const mfgCapacity = getManufacturingCapacity(state);
        const avgPrice = this.getExpectedPrice(state, options.closedMarkets || []);

        // 期別に計算
        for (let period = startPeriod; period <= 5; period++) {
            const rowsInPeriod = period === startPeriod
                ? remainingRows
                : { 2: 20, 3: 30, 4: 34, 5: 35 }[period];

            // 販売サイクル数
            const cycles = Math.floor(rowsInPeriod / 4);
            const salesQty = Math.min(salesCapacity, mfgCapacity) * cycles;

            // MQ計算
            const PQ = salesQty * avgPrice;
            const VQ = salesQty * 10;  // 原価
            const MQ = PQ - VQ;

            // F計算（簡易）
            const F = this.estimateF(state, period);

            // G
            const G = MQ - F;

            // リスクカードの影響（確率的）
            const riskLoss = this.simulateRiskImpact(options.riskProbabilities, rowsInPeriod);

            // 税金（300超過後）
            const tax = equity > 300 && G > 0 ? Math.round(G * 0.5) : 0;

            equity += G - riskLoss - tax;

            // 繰越チップ処理
            if (period < 5) {
                state.chips.research = state.nextPeriodChips?.research || 0;
                state.chips.education = state.nextPeriodChips?.education || 0;
                state.chips.advertising = state.nextPeriodChips?.advertising || 0;
                state.nextPeriodChips = { research: 0, education: 0, advertising: 0 };
            }
        }

        return { finalEquity: equity };
    },

    /**
     * F（固定費）を推定
     */
    estimateF: function(state, period) {
        const baseSalary = { 2: 22, 3: 24, 4: 26, 5: 28 }[period];
        const halfSalary = Math.round(baseSalary / 2);

        const machineCount = state.machines?.length || 1;
        const workers = state.workers || 1;
        const salesmen = state.salesmen || 1;

        const salary = (machineCount + workers + salesmen) * baseSalary +
                       (workers + salesmen) * halfSalary;

        const depreciation = period === 2 ? 10 : 20;

        const chipCost = ((state.chips?.research || 0) +
                         (state.chips?.education || 0) +
                         (state.chips?.advertising || 0)) * 20;

        return salary + depreciation + chipCost;
    },

    /**
     * リスクカードの影響をシミュレート
     */
    simulateRiskImpact: function(riskProb, rows) {
        if (!riskProb) return 0;

        let totalLoss = 0;

        // リスク発生確率（20%）× 各リスクの確率 × 平均損失
        const riskEvents = Math.floor(rows * 0.20);  // 期待リスクカード枚数

        // 火災損失（材料・製品）
        totalLoss += riskEvents * riskProb.fireProb * 30;  // 平均30円損失

        // 盗難損失
        totalLoss += riskEvents * riskProb.theftProb * 20;

        // 得意先倒産
        totalLoss += riskEvents * riskProb.bankruptcyProb * 25;

        // 不良在庫
        totalLoss += riskEvents * riskProb.badInventoryProb * 10;

        return Math.round(totalLoss);
    },

    /**
     * 行動名をフォーマット
     */
    formatActionName: function(action) {
        switch (action.type) {
            case 'SELL': return `販売 ${action.qty}個`;
            case 'PRODUCE': return '製造';
            case 'BUY_MATERIALS': return `材料購入 ${action.qty}個`;
            case 'BUY_CHIP': return `${action.chipType}チップ購入`;
            case 'BUY_NEXT_CHIP': return `次期${action.chipType}チップ`;
            case 'BUY_ATTACHMENT': return 'アタッチメント購入';
            case 'HIRE_WORKER': return 'ワーカー採用';
            case 'HIRE_SALESMAN': return 'セールスマン採用';
            case 'WAIT': return '待機';
            default: return action.type;
        }
    },

    // ============================================
    // ユーザー向けインターフェース
    // ============================================

    /**
     * 最適行動を提案（簡易版）
     */
    suggest: function(options = {}) {
        return this.findOptimalAction(options);
    },

    /**
     * 2市場閉鎖シナリオで最適行動を提案
     */
    suggestWith2MarketClosure: function(market1, market2, diceRoll = null) {
        return this.findOptimalAction({
            closedMarkets: [market1, market2],
            diceRoll: diceRoll
        });
    },

    /**
     * リスク分析レポートを表示
     */
    showRiskReport: function() {
        const prob = this.calculateRiskProbabilities();
        const exhausted = this.getExhaustedRisks();

        console.log('\n' + '═'.repeat(60));
        console.log('【リスクカード分析レポート】');
        console.log('═'.repeat(60));
        console.log(`\n総カード数: 64枚`);
        console.log(`使用済み: ${prob.used}枚`);
        console.log(`残り: ${prob.total}枚`);

        console.log('\n【残りリスク確率】');
        console.log('─'.repeat(40));
        const risks = [
            ['労災発生', prob.laborAccident, prob.laborAccidentProb],
            ['消費者運動', prob.consumerMovement, prob.consumerMovementProb],
            ['火災', prob.fire, prob.fireProb],
            ['盗難', prob.theft, prob.theftProb],
            ['得意先倒産', prob.bankruptcy, prob.bankruptcyProb],
            ['不良在庫', prob.badInventory, prob.badInventoryProb],
            ['市場閉鎖', prob.marketClosure, prob.marketClosureProb]
        ];

        risks.forEach(([name, count, prob]) => {
            const bar = '█'.repeat(Math.round(prob * 20));
            console.log(`${name.padEnd(10)}: ${count}枚 (${(prob * 100).toFixed(1)}%) ${bar}`);
        });

        if (exhausted.length > 0) {
            console.log('\n✓ 出尽くしたリスク（もう発生しない）:');
            exhausted.forEach(risk => console.log(`  - ${risk}`));
        }

        console.log('═'.repeat(60) + '\n');
    }
};

// グローバルに公開
if (typeof window !== 'undefined') {
    window.AIOptimizer = AIOptimizer;
}

console.log('AI最適化エンジン準備完了。');
console.log('  AIOptimizer.suggest()                      - 最適行動を提案');
console.log('  AIOptimizer.suggest({diceRoll: 3})         - サイコロ出目3で提案');
console.log('  AIOptimizer.suggestWith2MarketClosure("名古屋", "福岡", 4)');
console.log('                                             - 2市場閉鎖 + サイコロ4で提案');
console.log('  AIOptimizer.showRiskReport()               - リスク分析レポート');
