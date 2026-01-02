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
    },

    // ============================================
    // 競合AI行動予測システム
    // ============================================

    /**
     * 競合会社の行動を予測
     */
    predictCompetitorActions: function() {
        const competitors = gameState.companies.slice(1);  // プレイヤー以外
        const predictions = [];

        competitors.forEach((comp, idx) => {
            const strategy = comp.strategy || 'balanced';
            const mfgCap = this.getCompetitorMfgCapacity(comp);
            const salesCap = this.getCompetitorSalesCapacity(comp);

            // 戦略別の行動パターン予測
            const prediction = {
                name: comp.name,
                strategy,
                equity: comp.equity,
                researchChips: comp.chips?.research || 0,
                likelyActions: [],
                bidAggression: 0.5  // 0-1の入札積極性
            };

            // 研究チップ数から入札戦略を予測
            if (prediction.researchChips >= 3) {
                prediction.bidAggression = 0.8;
                prediction.likelyActions.push('高価格市場狙い');
            } else if (prediction.researchChips >= 2) {
                prediction.bidAggression = 0.6;
                prediction.likelyActions.push('名古屋28円狙い');
            } else {
                prediction.bidAggression = 0.4;
                prediction.likelyActions.push('大阪24円確保');
            }

            // 製造・販売能力から行動予測
            if (comp.products > 0 && salesCap > 0) {
                prediction.likelyActions.push(`販売${Math.min(comp.products, salesCap)}個`);
            } else if (comp.wip > 0 || comp.materials > 0) {
                prediction.likelyActions.push('製造');
            } else if (comp.cash >= 30) {
                prediction.likelyActions.push('材料購入');
            }

            // 自己資本から目標を推測
            if (comp.equity >= 400) {
                prediction.goal = '450達成圏内 - 安全プレイ';
            } else if (comp.equity >= 300) {
                prediction.goal = '税金発生中 - 積極投資';
            } else {
                prediction.goal = '300到達目標 - バランス';
            }

            predictions.push(prediction);
        });

        return predictions;
    },

    getCompetitorMfgCapacity: function(comp) {
        let cap = 0;
        (comp.machines || []).forEach(m => {
            if (m.type === 'small') cap += m.attachments > 0 ? 2 : 1;
            else cap += 4;
        });
        cap += Math.min(comp.chips?.education || 0, 1);
        return Math.min(cap, comp.workers || 1);
    },

    getCompetitorSalesCapacity: function(comp) {
        const salesmen = comp.salesmen || 1;
        if (salesmen === 0) return 0;
        const base = salesmen * 2;
        const adBonus = Math.min(comp.chips?.advertising || 0, salesmen * 2) * 2;
        return base + adBonus + Math.min(comp.chips?.education || 0, 1);
    },

    /**
     * 競合分析レポートを表示
     */
    showCompetitorReport: function() {
        const predictions = this.predictCompetitorActions();

        console.log('\n' + '═'.repeat(70));
        console.log('【競合AI行動予測レポート】');
        console.log('═'.repeat(70));

        predictions.forEach(pred => {
            console.log(`\n【${pred.name}】 戦略: ${pred.strategy}`);
            console.log(`  自己資本: ¥${pred.equity} | 研究チップ: ${pred.researchChips}枚`);
            console.log(`  入札積極性: ${(pred.bidAggression * 100).toFixed(0)}%`);
            console.log(`  予測目標: ${pred.goal}`);
            console.log(`  予測行動: ${pred.likelyActions.join(' → ')}`);
        });

        console.log('\n' + '═'.repeat(70) + '\n');
    },

    // ============================================
    // 長期投資計画最適化
    // ============================================

    /**
     * 期別の最適投資計画を計算
     */
    calculateOptimalInvestmentPlan: function() {
        const company = gameState.companies[0];
        const period = gameState.currentPeriod;
        const periodsRemaining = 5 - period + 1;

        console.log('\n' + '═'.repeat(70));
        console.log('【長期投資計画最適化】');
        console.log('═'.repeat(70));

        const plan = {
            periods: [],
            totalInvestment: 0,
            expectedFinalEquity: company.equity
        };

        // 期別に投資計画を計算
        for (let p = period; p <= 5; p++) {
            const periodPlan = this.planPeriodInvestment(company, p, periodsRemaining - (p - period));
            plan.periods.push(periodPlan);
            plan.totalInvestment += periodPlan.investment;
        }

        // 結果表示
        console.log('\n期別投資計画:');
        console.log('─'.repeat(60));
        plan.periods.forEach(pp => {
            console.log(`\n${pp.period}期:`);
            console.log(`  投資総額: ¥${pp.investment}`);
            pp.recommendations.forEach(rec => {
                console.log(`  ・${rec.item}: ¥${rec.cost} (ROI: ${rec.roi.toFixed(0)}%)`);
            });
            console.log(`  期末目標G: ¥${pp.targetG}`);
        });

        console.log('\n' + '─'.repeat(60));
        console.log(`総投資額: ¥${plan.totalInvestment}`);
        console.log('═'.repeat(70) + '\n');

        return plan;
    },

    planPeriodInvestment: function(company, period, periodsAfter) {
        const recommendations = [];
        let investment = 0;

        const chipCost = period === 2 ? 20 : 40;
        const salesCycles = Math.floor({ 2: 20, 3: 30, 4: 34, 5: 35 }[period] / 4);

        // 研究チップROI計算
        const currentResearch = company.chips?.research || 0;
        if (currentResearch < 3) {
            const priceIncrease = 2;  // 1枚あたり+2円
            const roi = (priceIncrease * salesCycles * periodsAfter * 2) / chipCost * 100;
            if (roi > 100) {
                recommendations.push({
                    item: '研究チップ',
                    cost: chipCost,
                    roi,
                    priority: 1
                });
                investment += chipCost;
            }
        }

        // 教育チップROI（1枚まで）
        if ((company.chips?.education || 0) < 1 && period <= 3) {
            const benefitPerCycle = 13;  // 製造+1、販売+1のMQ増加
            const roi = (benefitPerCycle * salesCycles * periodsAfter) / chipCost * 100;
            if (roi > 80) {
                recommendations.push({
                    item: '教育チップ',
                    cost: chipCost,
                    roi,
                    priority: 2
                });
                investment += chipCost;
            }
        }

        // アタッチメントROI
        const hasAttachment = company.machines?.some(m => m.attachments > 0);
        if (!hasAttachment && period <= 3) {
            const benefitPerCycle = 15;  // 製造能力+1のMQ増加
            const roi = (benefitPerCycle * salesCycles * periodsAfter) / 30 * 100;
            if (roi > 100) {
                recommendations.push({
                    item: 'アタッチメント',
                    cost: 30,
                    roi,
                    priority: 3
                });
                investment += 30;
            }
        }

        // 広告チップROI
        if ((company.chips?.advertising || 0) < 2 && (company.salesmen || 1) >= 2) {
            const benefitPerCycle = 26;  // 販売+4のMQ増加
            const roi = (benefitPerCycle * salesCycles * periodsAfter) / chipCost * 100;
            if (roi > 80) {
                recommendations.push({
                    item: '広告チップ',
                    cost: chipCost,
                    roi,
                    priority: 4
                });
                investment += chipCost;
            }
        }

        // 優先度順にソート
        recommendations.sort((a, b) => a.priority - b.priority);

        // 目標G計算
        const targetG = period === 2 ? -20 : period === 3 ? 50 : period === 4 ? 60 : 70;

        return {
            period,
            recommendations,
            investment,
            targetG
        };
    },

    // ============================================
    // ゲーム内AIへの統合インターフェース
    // ============================================

    /**
     * ゲーム内AIが呼び出す最適行動取得関数
     * @param {number} companyIndex - 会社インデックス
     * @returns {Object} 推奨行動
     */
    getOptimalActionForAI: function(companyIndex) {
        const company = gameState.companies[companyIndex];
        const riskProb = this.calculateRiskProbabilities();
        const exhausted = this.getExhaustedRisks();

        // 出尽くしたリスクを考慮した戦略調整
        let strategy = {
            prioritizeSafety: true,
            aggressiveBid: false,
            investHeavily: false
        };

        // 不良在庫が出尽くしていれば在庫を多めに持てる
        if (exhausted.includes('badInventory')) {
            strategy.allowHighInventory = true;
        }

        // 火災・盗難が出尽くしていれば倉庫不要
        if (exhausted.includes('fire') && exhausted.includes('theft')) {
            strategy.skipWarehouse = true;
        }

        // 市場閉鎖が多く残っていれば分散販売
        if (riskProb.marketClosureProb > 0.15) {
            strategy.diversifyMarkets = true;
        }

        // 簡易シミュレーションで最適行動を決定
        const possibleActions = this.enumeratePossibleActions(company, gameState.currentPeriod, {});
        let bestAction = possibleActions[0];
        let bestScore = -Infinity;

        possibleActions.forEach(action => {
            const score = this.quickEvaluateAction(company, action, riskProb, strategy);
            if (score > bestScore) {
                bestScore = score;
                bestAction = action;
            }
        });

        return {
            action: bestAction,
            score: bestScore,
            riskAdjusted: true,
            exhaustedRisks: exhausted
        };
    },

    /**
     * 行動の簡易評価（高速版）
     */
    quickEvaluateAction: function(company, action, riskProb, strategy) {
        let score = 0;
        const period = gameState.currentPeriod;

        switch (action.type) {
            case 'SELL':
                const price = 24 + (company.chips?.research || 0) * 2;
                const mq = (price - 10) * action.qty;
                score = mq * 1.5;  // 販売は高評価
                break;

            case 'PRODUCE':
                score = 30;  // 製造は中評価
                break;

            case 'BUY_MATERIALS':
                score = 20 - action.qty * 2;  // 材料購入は低評価（現金流出）
                break;

            case 'BUY_CHIP':
                if (action.chipType === 'research' && (company.chips?.research || 0) < 2) {
                    score = 50;  // 研究2枚目までは高評価
                } else if (action.chipType === 'education' && (company.chips?.education || 0) < 1) {
                    score = 40;
                } else {
                    score = 20;
                }
                break;

            case 'BUY_NEXT_CHIP':
                score = 35;  // 翌期チップは中〜高評価
                break;

            case 'BUY_ATTACHMENT':
                score = period <= 3 ? 45 : 10;
                break;

            case 'HIRE_WORKER':
            case 'HIRE_SALESMAN':
                score = period <= 3 ? 35 : 5;
                break;

            case 'WAIT':
                score = -10;  // 待機は低評価
                break;
        }

        // リスク調整
        if (riskProb.laborAccidentProb > 0.05 && action.type === 'PRODUCE') {
            score -= 5;  // 労災リスクがある場合は製造を少し下げる
        }

        if (riskProb.bankruptcyProb > 0.05 && action.type === 'SELL') {
            score -= 3;  // 得意先倒産リスクがある場合は販売を少し下げる
        }

        return score;
    },

    /**
     * 完全な最適解探索（遅いが正確）
     */
    findTrueOptimal: function(options = {}) {
        console.log('\n⏳ 完全最適解探索中... (5000回シミュレーション)');
        const originalCount = this.SIMULATION_COUNT;
        this.SIMULATION_COUNT = 5000;

        const result = this.findOptimalAction(options);

        this.SIMULATION_COUNT = originalCount;
        return result;
    },

    // ============================================
    // MCTS（モンテカルロ木探索）実装
    // ============================================

    MCTS: {
        // UCB1の探索パラメータ
        EXPLORATION_CONSTANT: 1.414,
        // 最大イテレーション
        MAX_ITERATIONS: 2000,
        // シミュレーション深さ（残り行数）
        MAX_DEPTH: 50,

        /**
         * MCTSノードクラス
         */
        createNode: function(state, action, parent) {
            return {
                state: state,
                action: action,
                parent: parent,
                children: [],
                visits: 0,
                totalReward: 0,
                untriedActions: null,
                isTerminal: false
            };
        },

        /**
         * UCB1スコア計算
         */
        ucb1: function(node, parentVisits) {
            if (node.visits === 0) return Infinity;
            const exploitation = node.totalReward / node.visits;
            const exploration = this.EXPLORATION_CONSTANT * Math.sqrt(Math.log(parentVisits) / node.visits);
            return exploitation + exploration;
        },

        /**
         * 選択フェーズ：最も有望なノードを選択
         */
        select: function(node) {
            while (node.children.length > 0) {
                // 未展開の行動があればそちらを優先
                if (node.untriedActions && node.untriedActions.length > 0) {
                    return node;
                }
                // UCB1で最良の子を選択
                let bestChild = null;
                let bestScore = -Infinity;
                node.children.forEach(child => {
                    const score = this.ucb1(child, node.visits);
                    if (score > bestScore) {
                        bestScore = score;
                        bestChild = child;
                    }
                });
                if (!bestChild) break;
                node = bestChild;
            }
            return node;
        },

        /**
         * 展開フェーズ：新しい子ノードを追加
         */
        expand: function(node, optimizer) {
            if (!node.untriedActions) {
                const company = node.state.company;
                const period = node.state.period;
                node.untriedActions = optimizer.enumeratePossibleActions(company, period, {
                    closedMarkets: node.state.closedMarkets || []
                });
            }

            if (node.untriedActions.length === 0) {
                return node;
            }

            // ランダムに行動を選択
            const actionIdx = Math.floor(Math.random() * node.untriedActions.length);
            const action = node.untriedActions.splice(actionIdx, 1)[0];

            // 新しい状態を作成
            const newState = this.applyActionToState(node.state, action, optimizer);
            const childNode = this.createNode(newState, action, node);

            // 終端判定
            if (newState.period > 5 || newState.currentRow > newState.maxRows) {
                childNode.isTerminal = true;
            }

            node.children.push(childNode);
            return childNode;
        },

        /**
         * 状態に行動を適用
         */
        applyActionToState: function(state, action, optimizer) {
            const newState = JSON.parse(JSON.stringify(state));
            const company = newState.company;

            optimizer.applyAction(company, action, newState.period, {
                closedMarkets: newState.closedMarkets || []
            });

            // 行進行
            newState.currentRow++;
            if (newState.currentRow > newState.maxRows) {
                // 期末処理
                newState.period++;
                newState.currentRow = 1;
                if (newState.period <= 5) {
                    newState.maxRows = { 2: 20, 3: 30, 4: 34, 5: 35 }[newState.period];
                    // 決算シミュレーション（簡易）
                    this.simulateSettlement(company, newState.period - 1);
                }
            }

            return newState;
        },

        /**
         * 簡易決算シミュレーション
         */
        simulateSettlement: function(company, period) {
            // MQ計算
            const sales = company.totalSales || 0;
            const VQ = (company.initialMaterials - company.materials) * 10;
            const MQ = sales - VQ;

            // F計算
            const baseSalary = { 2: 22, 3: 24, 4: 26, 5: 28 }[period] || 22;
            const workers = company.workers || 1;
            const salesmen = company.salesmen || 1;
            const machines = company.machines?.length || 1;
            const F = (machines + workers + salesmen) * baseSalary * 1.5 +
                     ((company.chips?.research || 0) + (company.chips?.education || 0) +
                      (company.chips?.advertising || 0)) * 20 +
                     (period === 2 ? 10 : 20);

            // G計算
            const G = MQ - F;

            // 税金
            const tax = company.equity > 300 && G > 0 ? Math.round(G * 0.5) : 0;

            company.equity += G - tax;
            company.totalSales = 0;
            company.initialMaterials = company.materials;

            // 翌期チップ移行
            company.chips = company.nextPeriodChips || { research: 0, education: 0, advertising: 0 };
            company.nextPeriodChips = { research: 0, education: 0, advertising: 0 };
        },

        /**
         * シミュレーションフェーズ（ロールアウト）
         */
        simulate: function(node, optimizer) {
            let state = JSON.parse(JSON.stringify(node.state));
            let depth = 0;

            while (state.period <= 5 && depth < this.MAX_DEPTH) {
                // ランダムな行動を選択
                const actions = optimizer.enumeratePossibleActions(state.company, state.period, {
                    closedMarkets: state.closedMarkets || []
                });

                if (actions.length === 0) break;

                const action = actions[Math.floor(Math.random() * actions.length)];
                state = this.applyActionToState(state, action, optimizer);
                depth++;
            }

            // 最終自己資本を報酬として返す
            return this.evaluateState(state);
        },

        /**
         * 状態評価（報酬計算）
         */
        evaluateState: function(state) {
            const equity = state.company.equity;
            // 450を基準に正規化（0-1の範囲）
            const normalized = Math.max(0, Math.min(1, (equity - 200) / 300));
            // 450達成ボーナス
            const bonus = equity >= 450 ? 0.2 : 0;
            return normalized + bonus;
        },

        /**
         * バックプロパゲーション
         */
        backpropagate: function(node, reward) {
            while (node !== null) {
                node.visits++;
                node.totalReward += reward;
                node = node.parent;
            }
        },

        /**
         * MCTS実行
         */
        run: function(initialState, optimizer, iterations = null) {
            iterations = iterations || this.MAX_ITERATIONS;
            const root = this.createNode(initialState, null, null);

            console.log(`\n🌲 MCTS探索開始（${iterations}イテレーション）`);
            const startTime = Date.now();

            for (let i = 0; i < iterations; i++) {
                // 1. 選択
                let node = this.select(root);

                // 2. 展開
                if (!node.isTerminal) {
                    node = this.expand(node, optimizer);
                }

                // 3. シミュレーション
                const reward = this.simulate(node, optimizer);

                // 4. バックプロパゲーション
                this.backpropagate(node, reward);

                // 進捗表示
                if ((i + 1) % 500 === 0) {
                    console.log(`  ${i + 1}/${iterations} イテレーション完了`);
                }
            }

            const elapsed = Date.now() - startTime;
            console.log(`✓ MCTS完了: ${elapsed}ms`);

            // 最良の子ノードを返す（訪問回数が最大のもの）
            let bestChild = null;
            let mostVisits = -1;
            root.children.forEach(child => {
                if (child.visits > mostVisits) {
                    mostVisits = child.visits;
                    bestChild = child;
                }
            });

            // 結果を整形
            const results = root.children.map(child => ({
                action: child.action,
                visits: child.visits,
                avgReward: child.totalReward / child.visits,
                winRate: child.totalReward / child.visits
            })).sort((a, b) => b.visits - a.visits);

            return {
                bestAction: bestChild ? bestChild.action : null,
                results: results,
                totalIterations: iterations,
                elapsed: elapsed
            };
        }
    },

    /**
     * MCTSを使用した最適行動探索
     */
    findOptimalWithMCTS: function(options = {}) {
        const company = gameState.companies[0];
        const period = gameState.currentPeriod;
        const currentRow = company.currentRow || 1;
        const maxRows = { 2: 20, 3: 30, 4: 34, 5: 35 }[period] || 20;

        console.log('\n' + '═'.repeat(70));
        console.log('【MCTS（モンテカルロ木探索）最適化】');
        console.log('═'.repeat(70));
        console.log(`現在: ${period}期 ${currentRow}行目`);

        // 初期状態を作成
        const initialState = {
            company: JSON.parse(JSON.stringify(company)),
            period: period,
            currentRow: currentRow,
            maxRows: maxRows,
            closedMarkets: options.closedMarkets || [],
            diceRoll: options.diceRoll || null
        };

        initialState.company.initialMaterials = initialState.company.materials;

        // MCTS実行
        const iterations = options.iterations || this.MCTS.MAX_ITERATIONS;
        const result = this.MCTS.run(initialState, this, iterations);

        // 結果表示
        console.log('\n【探索結果】');
        console.log('─'.repeat(60));
        console.log('行動                    │ 訪問回数 │ 平均報酬 │ 勝率');
        console.log('────────────────────────┼──────────┼──────────┼──────');

        result.results.slice(0, 5).forEach(r => {
            const actionName = this.formatActionName(r.action).padEnd(22);
            console.log(`${actionName} │ ${String(r.visits).padStart(8)} │ ${r.avgReward.toFixed(3).padStart(8)} │ ${(r.winRate * 100).toFixed(1)}%`);
        });

        if (result.bestAction) {
            console.log('\n★ MCTS推奨: ' + this.formatActionName(result.bestAction));
        }
        console.log('═'.repeat(70) + '\n');

        return result;
    },

    // ============================================
    // ハイブリッド探索（MCTS + モンテカルロ）
    // ============================================

    /**
     * 状況に応じて最適なアルゴリズムを選択
     */
    findBestAction: function(options = {}) {
        const company = gameState.companies[0];
        const period = gameState.currentPeriod;
        const currentRow = company.currentRow || 1;

        // 残り行数に応じてアルゴリズムを選択
        const maxRows = { 2: 20, 3: 30, 4: 34, 5: 35 }[period] || 20;
        const remainingRows = maxRows - currentRow;

        console.log('\n' + '╔'.repeat(1) + '═'.repeat(68) + '╗'.repeat(1));
        console.log('║ 【ハイブリッドAI最適化エンジン】                                  ║');
        console.log('╚' + '═'.repeat(68) + '╝');

        let result;

        if (remainingRows <= 10) {
            // 残り行数が少ない場合はMCTSで精密探索
            console.log('📊 選択アルゴリズム: MCTS（残り行数少・精密探索）');
            result = this.findOptimalWithMCTS({
                ...options,
                iterations: 3000  // より多くの探索
            });
            result.algorithm = 'MCTS';
        } else if (period <= 3) {
            // 序盤〜中盤は通常のモンテカルロ
            console.log('📊 選択アルゴリズム: モンテカルロシミュレーション（中盤）');
            result = this.findOptimalAction(options);
            result.algorithm = 'MonteCarlo';
        } else {
            // 終盤はMCTSと組み合わせ
            console.log('📊 選択アルゴリズム: MCTS + モンテカルロ（終盤ハイブリッド）');

            // 両方実行して比較
            const mcResult = this.findOptimalAction(options);
            const mctsResult = this.findOptimalWithMCTS({
                ...options,
                iterations: 1500
            });

            // より信頼性の高い方を採用
            if (mctsResult.results[0]?.visits > 500 &&
                mctsResult.results[0]?.winRate > mcResult.recommended?.successRate) {
                result = mctsResult;
                result.algorithm = 'MCTS';
            } else {
                result = mcResult;
                result.algorithm = 'MonteCarlo';
            }
        }

        return result;
    },

    // ============================================
    // 完全ゲームシミュレーション
    // ============================================

    /**
     * 1期から5期まで完全にシミュレート
     */
    simulateFullGame: function(strategy = 'optimal', options = {}) {
        console.log('\n' + '═'.repeat(70));
        console.log('【完全ゲームシミュレーション】');
        console.log('═'.repeat(70));
        console.log(`戦略: ${strategy}`);
        console.log(`閉鎖市場: ${(options.closedMarkets || []).join(', ') || 'なし'}`);

        // 初期状態
        const company = {
            name: 'シミュレーション',
            cash: 100,
            equity: 300,
            materials: 3,
            wip: 3,
            products: 3,
            workers: 1,
            salesmen: 1,
            machines: [{ type: 'small', attachments: 0 }],
            chips: { research: 0, education: 0, advertising: 0 },
            nextPeriodChips: { research: 0, education: 0, advertising: 0 }
        };

        const history = [];

        // 2期から5期までシミュレート
        for (let period = 2; period <= 5; period++) {
            const maxRows = { 2: 20, 3: 30, 4: 34, 5: 35 }[period];
            const periodStart = { cash: company.cash, equity: company.equity };

            console.log(`\n【${period}期】開始: 現金¥${company.cash}, 自己資本¥${company.equity}`);

            // 期内の行動をシミュレート
            for (let row = 1; row <= maxRows; row++) {
                const state = {
                    company: JSON.parse(JSON.stringify(company)),
                    period,
                    currentRow: row,
                    maxRows,
                    closedMarkets: options.closedMarkets || []
                };

                // 行動決定
                let action;
                if (strategy === 'optimal') {
                    const possibleActions = this.enumeratePossibleActions(company, period, {
                        closedMarkets: options.closedMarkets || []
                    });
                    action = this.selectBestActionSimple(company, possibleActions, period);
                } else {
                    action = { type: 'WAIT' };
                }

                // 行動適用
                this.applyAction(company, action, period, {
                    closedMarkets: options.closedMarkets || []
                });
            }

            // 期末決算
            this.MCTS.simulateSettlement(company, period);

            const G = company.equity - periodStart.equity;
            console.log(`  期末G: ¥${G >= 0 ? '+' : ''}${G}`);
            console.log(`  自己資本: ¥${company.equity}`);

            history.push({
                period,
                G,
                equity: company.equity,
                chips: { ...company.chips }
            });
        }

        console.log('\n' + '─'.repeat(70));
        console.log(`【最終結果】自己資本: ¥${company.equity}`);
        console.log(`450達成: ${company.equity >= 450 ? '○ 成功' : '× 失敗'}`);
        console.log('═'.repeat(70) + '\n');

        return {
            finalEquity: company.equity,
            success: company.equity >= 450,
            history
        };
    },

    /**
     * シンプルな行動選択（シミュレーション用）
     */
    selectBestActionSimple: function(company, actions, period) {
        // 優先度順に行動を選択
        // 1. 販売可能なら販売
        const sellAction = actions.find(a => a.type === 'SELL');
        if (sellAction && company.products > 0) {
            return sellAction;
        }

        // 2. 製造可能なら製造
        const produceAction = actions.find(a => a.type === 'PRODUCE');
        if (produceAction && (company.wip > 0 || company.materials > 0)) {
            return produceAction;
        }

        // 3. 材料購入
        const buyMaterials = actions.find(a => a.type === 'BUY_MATERIALS');
        if (buyMaterials && company.cash >= 30) {
            return buyMaterials;
        }

        // 4. 研究チップ購入（2枚まで）
        if (period <= 3 && (company.chips?.research || 0) < 2) {
            const buyChip = actions.find(a => a.type === 'BUY_CHIP' && a.chipType === 'research');
            if (buyChip) return buyChip;
        }

        // 5. 待機
        return { type: 'WAIT' };
    }
};

// グローバルに公開
if (typeof window !== 'undefined') {
    window.AIOptimizer = AIOptimizer;
}

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║        AI最適化エンジン v2.0 - MCTS + モンテカルロ統合             ║');
console.log('╠════════════════════════════════════════════════════════════════════╣');
console.log('║ 【基本コマンド】                                                    ║');
console.log('║  AIOptimizer.suggest()                   - 最適行動を提案          ║');
console.log('║  AIOptimizer.suggest({diceRoll: 3})      - サイコロ出目指定        ║');
console.log('║  AIOptimizer.findBestAction()            - ハイブリッド最適化      ║');
console.log('║                                                                    ║');
console.log('║ 【高度な探索】                                                      ║');
console.log('║  AIOptimizer.findOptimalWithMCTS()       - MCTS木探索              ║');
console.log('║  AIOptimizer.findTrueOptimal()           - 5000回シミュレーション  ║');
console.log('║  AIOptimizer.simulateFullGame()          - 完全ゲームシミュレート  ║');
console.log('║                                                                    ║');
console.log('║ 【2市場閉鎖シナリオ】                                               ║');
console.log('║  AIOptimizer.suggestWith2MarketClosure("名古屋", "福岡", 4)        ║');
console.log('║                           - 2市場閉鎖 + サイコロ4で提案            ║');
console.log('║                                                                    ║');
console.log('║ 【分析レポート】                                                    ║');
console.log('║  AIOptimizer.showRiskReport()            - リスクカード分析        ║');
console.log('║  AIOptimizer.showCompetitorReport()      - 競合行動予測            ║');
console.log('║  AIOptimizer.calculateOptimalInvestmentPlan()                      ║');
console.log('║                                          - 長期投資計画            ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
