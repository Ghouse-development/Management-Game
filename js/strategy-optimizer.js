/**
 * MG 戦略最適化エンジン v1.0
 *
 * モンテカルロシミュレーションで最適戦略を学習
 */

// Node.js環境でMGSimulationを読み込み
let MGSimulation;
if (typeof require !== 'undefined') {
    MGSimulation = require('./simulation-engine.js');
} else if (typeof window !== 'undefined') {
    MGSimulation = window.MGSimulation;
}

const StrategyOptimizer = (function() {
    'use strict';

    // ============================================
    // 戦略パラメータ定義
    // ============================================
    const STRATEGY_PARAMS = {
        // チップ戦略
        CHIP_STRATEGIES: [
            { name: 'R0', research: 0, education: 0, advertising: 0 },
            { name: 'R1', research: 1, education: 0, advertising: 0 },
            { name: 'R2', research: 2, education: 0, advertising: 0 },
            { name: 'R3', research: 3, education: 0, advertising: 0 },
            { name: 'R4', research: 4, education: 0, advertising: 0 },
            { name: 'R2E1', research: 2, education: 1, advertising: 0 },
            { name: 'R3E1', research: 3, education: 1, advertising: 0 },
            { name: 'R2E2', research: 2, education: 2, advertising: 0 },
            { name: 'R3E2', research: 3, education: 2, advertising: 0 },
            { name: 'R4E1', research: 4, education: 1, advertising: 0 },
        ],

        // 借入戦略
        LOAN_STRATEGIES: [
            { name: 'NO_LOAN', amount: 0 },
            { name: 'LOW_LOAN', amount: 50 },
            { name: 'MID_LOAN', amount: 100 },
            { name: 'MAX_LOAN', amount: 141 }, // 283 * 0.5
        ],

        // 機械戦略
        MACHINE_STRATEGIES: [
            { name: 'KEEP_SMALL', upgrade: false, period: 0 },
            { name: 'UPGRADE_P3', upgrade: true, period: 3 },
            { name: 'UPGRADE_P4', upgrade: true, period: 4 },
        ],

        // 販売戦略
        SALES_STRATEGIES: [
            { name: 'AGGRESSIVE', minPrice: 26, targetChips: 2 },
            { name: 'BALANCED', minPrice: 28, targetChips: 3 },
            { name: 'PREMIUM', minPrice: 30, targetChips: 4 },
        ]
    };

    // ============================================
    // 戦略ジェネレータ
    // ============================================
    const StrategyGenerator = {
        /**
         * 全ての戦略組み合わせを生成
         */
        generateAllCombinations() {
            const combinations = [];

            STRATEGY_PARAMS.CHIP_STRATEGIES.forEach(chip => {
                STRATEGY_PARAMS.LOAN_STRATEGIES.forEach(loan => {
                    STRATEGY_PARAMS.MACHINE_STRATEGIES.forEach(machine => {
                        STRATEGY_PARAMS.SALES_STRATEGIES.forEach(sales => {
                            combinations.push({
                                name: `${chip.name}_${loan.name}_${machine.name}_${sales.name}`,
                                chips: chip,
                                loan: loan,
                                machine: machine,
                                sales: sales,
                                results: null
                            });
                        });
                    });
                });
            });

            return combinations;
        },

        /**
         * ランダムに戦略を変異させる
         */
        mutate(strategy) {
            const mutated = JSON.parse(JSON.stringify(strategy));

            const mutationType = Math.floor(Math.random() * 4);

            switch (mutationType) {
                case 0: // チップ変異
                    const chipIdx = Math.floor(Math.random() * STRATEGY_PARAMS.CHIP_STRATEGIES.length);
                    mutated.chips = STRATEGY_PARAMS.CHIP_STRATEGIES[chipIdx];
                    break;
                case 1: // 借入変異
                    const loanIdx = Math.floor(Math.random() * STRATEGY_PARAMS.LOAN_STRATEGIES.length);
                    mutated.loan = STRATEGY_PARAMS.LOAN_STRATEGIES[loanIdx];
                    break;
                case 2: // 機械変異
                    const machineIdx = Math.floor(Math.random() * STRATEGY_PARAMS.MACHINE_STRATEGIES.length);
                    mutated.machine = STRATEGY_PARAMS.MACHINE_STRATEGIES[machineIdx];
                    break;
                case 3: // 販売変異
                    const salesIdx = Math.floor(Math.random() * STRATEGY_PARAMS.SALES_STRATEGIES.length);
                    mutated.sales = STRATEGY_PARAMS.SALES_STRATEGIES[salesIdx];
                    break;
            }

            mutated.name = `${mutated.chips.name}_${mutated.loan.name}_${mutated.machine.name}_${mutated.sales.name}`;
            return mutated;
        },

        /**
         * 2つの戦略を交叉させる
         */
        crossover(strategy1, strategy2) {
            const child = {
                chips: Math.random() < 0.5 ? strategy1.chips : strategy2.chips,
                loan: Math.random() < 0.5 ? strategy1.loan : strategy2.loan,
                machine: Math.random() < 0.5 ? strategy1.machine : strategy2.machine,
                sales: Math.random() < 0.5 ? strategy1.sales : strategy2.sales,
            };

            child.name = `${child.chips.name}_${child.loan.name}_${child.machine.name}_${child.sales.name}`;
            return child;
        }
    };

    // ============================================
    // 戦略ベースAI
    // ============================================
    const StrategyBasedAI = {
        /**
         * 戦略に基づいて行動を決定
         */
        decideAction(company, gameState, strategy) {
            const period = gameState.period;
            const situation = this.analyzeSituation(company, gameState);

            // 優先順位に従って行動を決定
            const actions = [];

            // 1. 販売（製品があれば）
            if (company.products > 0) {
                const salesAction = this.planSales(company, gameState, strategy);
                if (salesAction) actions.push({ priority: 100, action: salesAction });
            }

            // 2. 機械アップグレード（戦略に応じて）
            if (strategy.machine.upgrade && period === strategy.machine.period) {
                const machineAction = this.planMachineUpgrade(company, gameState);
                if (machineAction) actions.push({ priority: 90, action: machineAction });
            }

            // 3. チップ購入（目標枚数に達するまで）
            const chipAction = this.planChipPurchase(company, gameState, strategy);
            if (chipAction) actions.push({ priority: 80, action: chipAction });

            // 4. 生産（材料があれば）
            if (company.materials > 0 || company.wip > 0) {
                const produceAction = this.planProduction(company, gameState);
                if (produceAction) actions.push({ priority: 70, action: produceAction });
            }

            // 5. 材料購入
            const buyAction = this.planMaterialPurchase(company, gameState, strategy);
            if (buyAction) actions.push({ priority: 60, action: buyAction });

            // 6. 採用（必要に応じて）
            const hireAction = this.planHiring(company, gameState, strategy);
            if (hireAction) actions.push({ priority: 50, action: hireAction });

            // 優先順位でソート
            actions.sort((a, b) => b.priority - a.priority);

            // 最高優先の行動を返す（なければDO_NOTHING）
            return actions.length > 0 ? actions[0].action : { type: 'DO_NOTHING' };
        },

        analyzeSituation(company, gameState) {
            return {
                period: gameState.period,
                cash: company.cash,
                products: company.products,
                materials: company.materials,
                wip: company.wip,
                researchChips: company.chips.research || 0,
                educationChips: company.chips.education || 0,
                mfgCapacity: company.getMfgCapacity(),
                salesCapacity: company.getSalesCapacity()
            };
        },

        planSales(company, gameState, strategy) {
            const quantity = Math.min(company.getSalesCapacity(), company.products);
            if (quantity === 0) return null;

            const researchChips = company.chips.research || 0;
            let price;

            // 戦略に基づいた価格設定
            if (researchChips >= strategy.sales.targetChips) {
                price = Math.max(strategy.sales.minPrice, 28 + (researchChips - 2) * 2);
            } else {
                price = strategy.sales.minPrice;
            }

            // 市場の上限価格を超えないように
            const market = gameState.markets.find(m => m.sellPrice >= price) || gameState.markets[4];
            price = Math.min(price, market.sellPrice);

            return {
                type: 'SELL',
                price,
                quantity,
                market
            };
        },

        planMachineUpgrade(company, gameState) {
            // 小型機械を持っているか確認
            const smallMachineIndex = company.machines.findIndex(m => m.type === 'small');
            if (smallMachineIndex === -1) return null;

            // 資金チェック
            if (company.cash < 200 + 50) return null;

            return {
                type: 'BUY_LARGE_MACHINE'
            };
        },

        planChipPurchase(company, gameState, strategy) {
            const currentResearch = company.chips.research || 0;
            const currentEducation = company.chips.education || 0;

            // 研究チップを優先
            if (currentResearch < strategy.chips.research) {
                if (company.cash >= 40 + 30) {
                    return {
                        type: 'BUY_CHIP',
                        chipType: 'research',
                        isExpress: true
                    };
                }
            }

            // 教育チップ
            if (currentEducation < strategy.chips.education) {
                if (company.cash >= 40 + 30) {
                    return {
                        type: 'BUY_CHIP',
                        chipType: 'education',
                        isExpress: true
                    };
                }
            }

            return null;
        },

        planProduction(company, gameState) {
            const mfgCapacity = company.getMfgCapacity();
            const canProduce = Math.min(mfgCapacity, company.wip + company.materials);

            if (canProduce === 0) return null;

            const materialToWip = Math.min(company.materials, 10 - company.wip);
            const wipToProduct = Math.min(mfgCapacity, company.wip + materialToWip);

            if (wipToProduct === 0) return null;

            const processingCost = wipToProduct * 1;
            if (company.cash < processingCost + 20) return null;

            return {
                type: 'PRODUCE',
                materialToWip,
                wipToProduct
            };
        },

        planMaterialPurchase(company, gameState, strategy) {
            const period = gameState.period;
            const mfgCapacity = company.getMfgCapacity();
            const storageCapacity = company.getStorageCapacity();
            const currentStorage = company.materials + company.products;
            const availableStorage = storageCapacity - currentStorage;

            if (availableStorage <= 0) return null;

            // 購入量を決定
            let targetQty;
            if (period === 2) {
                targetQty = Math.min(6, availableStorage);
            } else {
                targetQty = Math.min(mfgCapacity, availableStorage);
            }

            // 最安市場を選択
            const market = gameState.markets.reduce((best, m) =>
                m.buyPrice < best.buyPrice ? m : best
            );

            const cost = market.buyPrice * targetQty;
            if (company.cash < cost + 50) return null;

            return {
                type: 'BUY_MATERIALS',
                market,
                quantity: targetQty
            };
        },

        planHiring(company, gameState, strategy) {
            const salesCapacity = company.getSalesCapacity();
            const products = company.products;

            // 販売能力が製品数より少なければ採用
            if (salesCapacity < products && salesCapacity < 6) {
                const hireCount = Math.min(3, 6 - salesCapacity);
                const cost = hireCount * 5;

                if (company.cash >= cost + 30) {
                    return {
                        type: 'HIRE',
                        count: hireCount
                    };
                }
            }

            return null;
        }
    };

    // ============================================
    // モンテカルロシミュレータ
    // ============================================
    const MonteCarloSimulator = {
        /**
         * 戦略を評価（複数回シミュレーション）
         */
        evaluateStrategy(strategy, runs = 50) {
            const results = {
                strategy: strategy.name,
                runs,
                wins: 0,
                targetReached: 0,
                avgEquity: 0,
                minEquity: Infinity,
                maxEquity: 0,
                equities: []
            };

            for (let i = 0; i < runs; i++) {
                const gameResult = this.runSimulation(strategy);
                const equity = gameResult.equity;

                results.equities.push(equity);
                results.avgEquity += equity;

                if (equity >= 450) results.targetReached++;
                if (equity > results.maxEquity) results.maxEquity = equity;
                if (equity < results.minEquity) results.minEquity = equity;

                if (gameResult.rank === 1) results.wins++;
            }

            results.avgEquity = Math.round(results.avgEquity / runs);
            results.targetReachRate = Math.round((results.targetReached / runs) * 100);
            results.winRate = Math.round((results.wins / runs) * 100);

            return results;
        },

        /**
         * 1回のシミュレーションを実行
         */
        runSimulation(strategy) {
            const gameState = new MGSimulation.GameState();
            gameState.initCompanies();

            // 戦略を適用する会社（インデックス0）
            const targetCompany = gameState.companies[0];

            // 2期～5期をシミュレート
            for (let period = 2; period <= 5; period++) {
                gameState.period = period;

                // 期首処理: 長期借入
                if (strategy.loan.amount > 0) {
                    const equity = targetCompany.calculateEquity(period);
                    const available = MGSimulation.RULES.getLoanLimit(period, equity) - targetCompany.longTermLoan;
                    const borrowAmount = Math.min(strategy.loan.amount, available);
                    if (borrowAmount > 0) {
                        MGSimulation.ActionEngine.borrowLongTerm(targetCompany, borrowAmount, period, equity);
                    }
                }

                // ターン実行
                const maxRows = MGSimulation.RULES.MAX_ROWS[period];
                let row = 1;

                while (row < maxRows) {
                    // ターゲット会社の行動
                    if (targetCompany.currentRow < maxRows) {
                        const isRisk = Math.random() < 0.20;
                        if (!isRisk) {
                            const action = StrategyBasedAI.decideAction(targetCompany, gameState, strategy);
                            this.executeAction(targetCompany, action, gameState);
                        }
                        targetCompany.currentRow++;
                    }

                    // 他社の行動（簡略化）
                    for (let i = 1; i < gameState.companies.length; i++) {
                        const company = gameState.companies[i];
                        if (company.currentRow < maxRows) {
                            const action = MGSimulation.AIDecisionEngine.decideAction(company, gameState);
                            MGSimulation.SimulationRunner.executeAction(company, action, gameState);
                            company.currentRow++;
                        }
                    }

                    row++;
                }

                // 期末処理
                MGSimulation.PeriodEndEngine.process(gameState);
                gameState.companies.forEach(c => c.currentRow = 1);
            }

            // 結果
            const targetEquity = targetCompany.calculateEquity(5);
            const allEquities = gameState.companies.map(c => c.calculateEquity(5));
            allEquities.sort((a, b) => b - a);
            const rank = allEquities.indexOf(targetEquity) + 1;

            return {
                equity: targetEquity,
                rank,
                totalSales: targetCompany.totalSales,
                totalF: targetCompany.totalF
            };
        },

        executeAction(company, action, gameState) {
            if (!action) return;

            switch (action.type) {
                case 'SELL':
                    // 販売（勝率に基づく）
                    const chips = company.chips.research || 0;
                    const winRate = 0.17 + chips * 0.12 + (action.price <= 28 ? 0.1 : 0);
                    if (Math.random() < Math.min(0.9, winRate)) {
                        const revenue = action.price * action.quantity;
                        company.cash += revenue;
                        company.products -= action.quantity;
                        company.totalSales += revenue;
                        company.totalSoldQuantity += action.quantity;
                    }
                    break;

                case 'BUY_MATERIALS':
                    MGSimulation.ActionEngine.buyMaterials(company, action.quantity, action.market, gameState);
                    break;

                case 'PRODUCE':
                    MGSimulation.ActionEngine.produce(company, action.materialToWip, action.wipToProduct);
                    break;

                case 'HIRE':
                    MGSimulation.ActionEngine.hire(company, action.count);
                    break;

                case 'BUY_LARGE_MACHINE':
                    MGSimulation.ActionEngine.buyMachine(company, 'large', gameState);
                    break;

                case 'BUY_CHIP':
                    MGSimulation.ActionEngine.buyChip(company, action.chipType, action.isExpress);
                    break;

                default:
                    break;
            }
        }
    };

    // ============================================
    // 遺伝的アルゴリズム最適化
    // ============================================
    const GeneticOptimizer = {
        /**
         * 遺伝的アルゴリズムで最適戦略を探索
         */
        optimize(options = {}) {
            const {
                populationSize = 20,
                generations = 10,
                eliteCount = 4,
                mutationRate = 0.2,
                runsPerEval = 30
            } = options;

            console.log(`遺伝的アルゴリズム開始: 人口${populationSize}, 世代${generations}`);

            // 初期集団生成
            let population = this.initializePopulation(populationSize);

            // 進化ループ
            for (let gen = 0; gen < generations; gen++) {
                console.log(`世代 ${gen + 1}/${generations}`);

                // 評価
                population.forEach(individual => {
                    if (!individual.fitness) {
                        const results = MonteCarloSimulator.evaluateStrategy(individual, runsPerEval);
                        individual.fitness = results.avgEquity + results.targetReachRate * 2;
                        individual.results = results;
                    }
                });

                // ソート
                population.sort((a, b) => b.fitness - a.fitness);

                console.log(`  最良: ${population[0].name} (適応度: ${population[0].fitness})`);

                // 最終世代なら終了
                if (gen === generations - 1) break;

                // 次世代生成
                const newPopulation = [];

                // エリート保存
                for (let i = 0; i < eliteCount; i++) {
                    newPopulation.push(population[i]);
                }

                // 交叉と変異で残りを生成
                while (newPopulation.length < populationSize) {
                    // トーナメント選択
                    const parent1 = this.tournamentSelect(population);
                    const parent2 = this.tournamentSelect(population);

                    // 交叉
                    let child = StrategyGenerator.crossover(parent1, parent2);

                    // 変異
                    if (Math.random() < mutationRate) {
                        child = StrategyGenerator.mutate(child);
                    }

                    child.fitness = null; // 再評価が必要
                    newPopulation.push(child);
                }

                population = newPopulation;
            }

            // 最良戦略を返す
            return {
                bestStrategy: population[0],
                topStrategies: population.slice(0, 5),
                generations
            };
        },

        initializePopulation(size) {
            const population = [];

            // いくつかの定番戦略を含める
            const presets = [
                { chips: STRATEGY_PARAMS.CHIP_STRATEGIES[5], loan: STRATEGY_PARAMS.LOAN_STRATEGIES[3], machine: STRATEGY_PARAMS.MACHINE_STRATEGIES[1], sales: STRATEGY_PARAMS.SALES_STRATEGIES[1] },
                { chips: STRATEGY_PARAMS.CHIP_STRATEGIES[6], loan: STRATEGY_PARAMS.LOAN_STRATEGIES[2], machine: STRATEGY_PARAMS.MACHINE_STRATEGIES[1], sales: STRATEGY_PARAMS.SALES_STRATEGIES[2] },
            ];

            presets.forEach(p => {
                p.name = `${p.chips.name}_${p.loan.name}_${p.machine.name}_${p.sales.name}`;
                population.push(p);
            });

            // 残りはランダム生成
            while (population.length < size) {
                const random = {
                    chips: STRATEGY_PARAMS.CHIP_STRATEGIES[Math.floor(Math.random() * STRATEGY_PARAMS.CHIP_STRATEGIES.length)],
                    loan: STRATEGY_PARAMS.LOAN_STRATEGIES[Math.floor(Math.random() * STRATEGY_PARAMS.LOAN_STRATEGIES.length)],
                    machine: STRATEGY_PARAMS.MACHINE_STRATEGIES[Math.floor(Math.random() * STRATEGY_PARAMS.MACHINE_STRATEGIES.length)],
                    sales: STRATEGY_PARAMS.SALES_STRATEGIES[Math.floor(Math.random() * STRATEGY_PARAMS.SALES_STRATEGIES.length)]
                };
                random.name = `${random.chips.name}_${random.loan.name}_${random.machine.name}_${random.sales.name}`;
                population.push(random);
            }

            return population;
        },

        tournamentSelect(population, tournamentSize = 3) {
            const tournament = [];
            for (let i = 0; i < tournamentSize; i++) {
                const idx = Math.floor(Math.random() * population.length);
                tournament.push(population[idx]);
            }
            tournament.sort((a, b) => b.fitness - a.fitness);
            return tournament[0];
        }
    };

    // ============================================
    // 戦略知識ベース
    // ============================================
    const StrategyKnowledgeBase = {
        // 学習した最適戦略を保存
        optimalStrategies: [],

        /**
         * 最適戦略を保存
         */
        saveOptimalStrategy(strategy, results) {
            this.optimalStrategies.push({
                strategy,
                results,
                timestamp: Date.now()
            });

            // 上位10個を保持
            this.optimalStrategies.sort((a, b) => b.results.avgEquity - a.results.avgEquity);
            if (this.optimalStrategies.length > 10) {
                this.optimalStrategies = this.optimalStrategies.slice(0, 10);
            }
        },

        /**
         * 状況に最適な戦略を推奨
         */
        recommendStrategy(situation) {
            if (this.optimalStrategies.length === 0) {
                // デフォルト推奨
                return {
                    chips: { name: 'R2E1', research: 2, education: 1, advertising: 0 },
                    loan: { name: 'MAX_LOAN', amount: 141 },
                    machine: { name: 'UPGRADE_P3', upgrade: true, period: 3 },
                    sales: { name: 'BALANCED', minPrice: 28, targetChips: 3 }
                };
            }

            return this.optimalStrategies[0].strategy;
        },

        /**
         * 知識ベースをエクスポート
         */
        export() {
            return JSON.stringify(this.optimalStrategies);
        },

        /**
         * 知識ベースをインポート
         */
        import(data) {
            try {
                this.optimalStrategies = JSON.parse(data);
            } catch (e) {
                console.error('知識ベースのインポートに失敗:', e);
            }
        }
    };

    // ============================================
    // 公開API
    // ============================================
    return {
        STRATEGY_PARAMS,
        StrategyGenerator,
        StrategyBasedAI,
        MonteCarloSimulator,
        GeneticOptimizer,
        StrategyKnowledgeBase,

        // 便利メソッド
        evaluateStrategy: function(strategy, runs = 50) {
            return MonteCarloSimulator.evaluateStrategy(strategy, runs);
        },

        optimizeWithGA: function(options = {}) {
            return GeneticOptimizer.optimize(options);
        },

        getRecommendedStrategy: function(situation) {
            return StrategyKnowledgeBase.recommendStrategy(situation);
        },

        // 全戦略の簡易評価
        evaluateAllStrategies: function(runs = 20) {
            const combinations = StrategyGenerator.generateAllCombinations();
            const results = [];

            console.log(`全${combinations.length}戦略を評価中...`);

            combinations.forEach((combo, i) => {
                if (i % 50 === 0) {
                    console.log(`進捗: ${i}/${combinations.length}`);
                }
                const result = MonteCarloSimulator.evaluateStrategy(combo, runs);
                results.push(result);
            });

            results.sort((a, b) => b.avgEquity - a.avgEquity);

            console.log('\n=== トップ10戦略 ===');
            results.slice(0, 10).forEach((r, i) => {
                console.log(`${i + 1}. ${r.strategy}: 平均${r.avgEquity}円, 目標達成${r.targetReachRate}%`);
            });

            return results;
        }
    };
})();

// Node.js/ブラウザ両対応エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StrategyOptimizer;
}
if (typeof window !== 'undefined') {
    window.StrategyOptimizer = StrategyOptimizer;
}
