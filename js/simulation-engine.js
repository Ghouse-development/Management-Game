/**
 * MG シミュレーションエンジン v1.0
 *
 * 完全なゲームルールを実装した高精度シミュレーター
 * Node.js/ブラウザ両対応
 */

const MGSimulation = (function() {
    'use strict';

    // ============================================
    // ゲームルール定数（正確な値）
    // ============================================
    const RULES = {
        // 初期状態
        INITIAL: {
            CASH: 100,
            EQUITY: 283,
            WORKERS: 3,
            MATERIALS: 3,
            WIP: 0,
            PRODUCTS: 0,
            MACHINES: [{ type: 'small', attachments: 0 }],
            WAREHOUSES: 0,
            LONG_TERM_LOAN: 0,
            SHORT_TERM_LOAN: 0
        },

        // 容量
        CAPACITY: {
            WIP: 10,
            MATERIAL_BASE: 10,
            PRODUCT_BASE: 10,
            WAREHOUSE_BONUS: 12
        },

        // 機械
        MACHINE: {
            SMALL: { cost: 100, capacity: 1, depreciation: 10 },  // 小型=製造能力1
            LARGE: { cost: 200, capacity: 4, depreciation: 20 },  // 大型=製造能力4
            ATTACHMENT: { cost: 30, bonus: 1, depreciation: 3 }   // アタッチメント=+1
        },

        // 機械簿価（期首時点の値）
        // 1期に購入→1期末に減価償却→2期開始時点の簿価
        BOOK_VALUE: {
            SMALL: { 2: 90, 3: 80, 4: 60, 5: 40 },       // 1期末90→2期末80→3期末60→4期末40
            LARGE: { 2: 180, 3: 160, 4: 120, 5: 80 },    // 1期末180→2期末160→3期末120→4期末80
            ATTACHMENT: { 2: 27, 3: 24, 4: 18, 5: 12 }   // 1期末27→2期末24→3期末18→4期末12
        },

        // 減価償却費（期別）
        DEPRECIATION_BY_PERIOD: {
            SMALL: { 2: 10, 3: 20, 4: 20, 5: 20 },
            LARGE: { 2: 20, 3: 40, 4: 40, 5: 40 },
            ATTACHMENT: { 2: 3, 3: 6, 4: 6, 5: 6 }
        },

        // 売却価格 = 簿価 × 70%
        SALE_RATIO: 0.7,

        // コスト
        COST: {
            HIRING: 5,
            RETIREMENT: 5,
            REFERRAL: 5,
            CHIP_NORMAL: 20,
            CHIP_EXPRESS: 40,
            INSURANCE: 10,
            WAREHOUSE: 20,
            PROCESSING: 1  // 加工費/個
        },

        // 人件費（期別）
        WAGE: { 2: 22, 3: 24, 4: 26, 5: 28 },

        // 借入
        LOAN: {
            LONG_TERM_RATE: 0.10,
            SHORT_TERM_RATE: 0.20,
            MIN_LONG_REPAY: 0.10,
            MIN_SHORT_REPAY: 0.20
        },

        // 借入限度（自己資本の50%、4期以降で自己資本300超なら100%）
        getLoanLimit: function(period, equity) {
            const multiplier = (period >= 4 && equity > 300) ? 1.0 : 0.5;
            return Math.floor(equity * multiplier);
        },

        // 市場
        MARKETS: [
            { name: '仙台', buyPrice: 10, sellPrice: 40, maxStock: 3 },
            { name: '札幌', buyPrice: 11, sellPrice: 36, maxStock: 3 },
            { name: '福岡', buyPrice: 12, sellPrice: 32, maxStock: 3 },
            { name: '名古屋', buyPrice: 13, sellPrice: 28, maxStock: 3 },
            { name: '大阪', buyPrice: 14, sellPrice: 24, maxStock: 3 },
            { name: '東京', buyPrice: 15, sellPrice: 20, maxStock: 3 }
        ],

        // 行数上限（期別）
        MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },

        // リスクカード確率（15/75 = 20%）
        RISK_PROBABILITY: 0.20,

        // 目標自己資本
        TARGET_EQUITY: 450
    };

    // ============================================
    // 会社クラス
    // ============================================
    class Company {
        constructor(index, name, isPlayer = false) {
            this.index = index;
            this.name = name;
            this.isPlayer = isPlayer;
            this.reset();
        }

        reset() {
            const init = RULES.INITIAL;
            this.cash = init.CASH;
            this.materials = init.MATERIALS;
            this.wip = init.WIP;
            this.products = init.PRODUCTS;
            this.workers = init.WORKERS;
            this.machines = JSON.parse(JSON.stringify(init.MACHINES));
            this.warehouses = init.WAREHOUSES;
            this.longTermLoan = init.LONG_TERM_LOAN;
            this.shortTermLoan = init.SHORT_TERM_LOAN;
            this.chips = { research: 0, education: 0, advertising: 0 };
            this.nextPeriodChips = { research: 0, education: 0, advertising: 0 };
            this.insurance = false;
            this.currentRow = 1;
            this.totalSales = 0;
            this.totalSoldQuantity = 0;
            this.totalF = 0;
            this.totalSpecialLoss = 0;
            this.actionLog = [];
        }

        // 製造能力
        getMfgCapacity() {
            return this.machines.reduce((sum, m) => {
                const base = m.type === 'large' ? RULES.MACHINE.LARGE.capacity : RULES.MACHINE.SMALL.capacity;
                return sum + base + (m.attachments || 0) * RULES.MACHINE.ATTACHMENT.bonus;
            }, 0);
        }

        // 販売能力
        getSalesCapacity() {
            return this.workers + (this.chips.education || 0);
        }

        // 倉庫容量
        getStorageCapacity() {
            return RULES.CAPACITY.MATERIAL_BASE +
                   RULES.CAPACITY.PRODUCT_BASE +
                   this.warehouses * RULES.CAPACITY.WAREHOUSE_BONUS;
        }

        // 価格競争力
        getPriceCompetitiveness(isParent) {
            return (this.chips.research || 0) * 2 + (isParent ? 2 : 0);
        }

        // 自己資本計算
        calculateEquity(period) {
            let assets = this.cash +
                         this.materials * this.getAverageMaterialCost() +
                         this.wip * (this.getAverageMaterialCost() + RULES.COST.PROCESSING) +
                         this.products * (this.getAverageMaterialCost() + RULES.COST.PROCESSING);

            // 機械簿価
            this.machines.forEach(m => {
                const bookValue = RULES.BOOK_VALUE[m.type.toUpperCase()][period] || 0;
                assets += bookValue;
                if (m.attachments > 0) {
                    assets += RULES.BOOK_VALUE.ATTACHMENT[period] * m.attachments;
                }
            });

            // 倉庫
            assets += this.warehouses * RULES.COST.WAREHOUSE;

            // 負債
            const liabilities = this.longTermLoan + this.shortTermLoan;

            return assets - liabilities;
        }

        getAverageMaterialCost() {
            // 簡略化: 平均仕入れ価格を12円と仮定
            return 12;
        }

        logAction(action, detail, amount = 0, isIncome = false) {
            this.actionLog.push({
                row: this.currentRow,
                action,
                detail,
                amount,
                isIncome,
                cash: this.cash
            });
        }
    }

    // ============================================
    // ゲーム状態クラス
    // ============================================
    class GameState {
        constructor() {
            this.reset();
        }

        reset() {
            this.period = 2;
            this.turn = 0;
            this.parentIndex = 0;
            this.companies = [];
            this.markets = JSON.parse(JSON.stringify(RULES.MARKETS));
            this.usedRiskCards = [];
            this.periodLog = [];
        }

        initCompanies(playerName = 'あなた') {
            const aiNames = ['A社', 'B社', 'C社', 'D社', 'E社'];
            this.companies = [new Company(0, playerName, true)];
            aiNames.forEach((name, i) => {
                this.companies.push(new Company(i + 1, name, false));
            });
        }

        getCurrentCompany() {
            return this.companies[this.turn % this.companies.length];
        }

        isParent(companyIndex) {
            return companyIndex === this.parentIndex;
        }

        rotateParent() {
            this.parentIndex = (this.parentIndex + 1) % this.companies.length;
        }
    }

    // ============================================
    // 入札システム
    // ============================================
    const BiddingEngine = {
        /**
         * コール価格計算
         */
        calculateCallPrice(displayPrice, company, isParent) {
            const competitiveness = company.getPriceCompetitiveness(isParent);
            return displayPrice - competitiveness;
        },

        /**
         * 入札をソート（勝者決定）
         * 1. コール価格が低い方が勝ち
         * 2. 同じなら研究チップが多い方が勝ち
         * 3. それでも同じなら親が勝ち
         * 4. 親以外同士ならランダム
         */
        sortBids(bids, gameState) {
            return bids.sort((a, b) => {
                // 1. コール価格
                if (a.callPrice !== b.callPrice) {
                    return a.callPrice - b.callPrice;
                }

                // 2. 研究チップ
                const aResearch = gameState.companies[a.companyIndex].chips.research || 0;
                const bResearch = gameState.companies[b.companyIndex].chips.research || 0;
                if (aResearch !== bResearch) {
                    return bResearch - aResearch;
                }

                // 3. 親
                const aIsParent = gameState.isParent(a.companyIndex);
                const bIsParent = gameState.isParent(b.companyIndex);
                if (aIsParent && !bIsParent) return -1;
                if (!aIsParent && bIsParent) return 1;

                // 4. ランダム
                return Math.random() - 0.5;
            });
        },

        /**
         * 入札処理
         */
        processBids(bids, market, gameState) {
            if (bids.length === 0) return [];

            const sortedBids = this.sortBids(bids, gameState);
            const results = [];
            let remainingCapacity = market.maxStock - market.currentStock;

            for (const bid of sortedBids) {
                if (remainingCapacity <= 0) break;

                const company = gameState.companies[bid.companyIndex];
                const actualQty = Math.min(remainingCapacity, bid.quantity, company.products);

                if (actualQty > 0) {
                    const revenue = bid.displayPrice * actualQty;
                    company.cash += revenue;
                    company.products -= actualQty;
                    company.totalSales += revenue;
                    company.totalSoldQuantity += actualQty;
                    market.currentStock += actualQty;
                    remainingCapacity -= actualQty;

                    results.push({
                        companyIndex: bid.companyIndex,
                        quantity: actualQty,
                        price: bid.displayPrice,
                        revenue,
                        won: true
                    });

                    company.logAction('販売', `${market.name}に¥${bid.displayPrice}×${actualQty}個`, revenue, true);
                }
            }

            return results;
        }
    };

    // ============================================
    // アクション実行エンジン
    // ============================================
    const ActionEngine = {
        /**
         * 材料購入
         */
        buyMaterials(company, quantity, market, gameState) {
            const cost = market.buyPrice * quantity;
            if (company.cash < cost) return { success: false, reason: '現金不足' };

            const maxStorage = company.getStorageCapacity();
            const currentStorage = company.materials + company.products;
            if (currentStorage + quantity > maxStorage) {
                return { success: false, reason: '倉庫容量不足' };
            }

            company.cash -= cost;
            company.materials += quantity;
            company.logAction('材料購入', `${market.name}から¥${market.buyPrice}×${quantity}個`, cost, false);

            return { success: true, cost };
        },

        /**
         * 完成・投入
         */
        produce(company, materialToWip, wipToProduct) {
            // 材料→仕掛品
            if (materialToWip > company.materials) {
                return { success: false, reason: '材料不足' };
            }
            if (company.wip + materialToWip > RULES.CAPACITY.WIP) {
                return { success: false, reason: '仕掛品容量オーバー' };
            }

            // 仕掛品→製品（製造能力チェック）
            const mfgCapacity = company.getMfgCapacity();
            if (wipToProduct > mfgCapacity) {
                return { success: false, reason: '製造能力不足' };
            }
            if (wipToProduct > company.wip + materialToWip) {
                return { success: false, reason: '仕掛品不足' };
            }

            // 加工費
            const processingCost = wipToProduct * RULES.COST.PROCESSING;
            if (company.cash < processingCost) {
                return { success: false, reason: '加工費の現金不足' };
            }

            // 実行
            company.materials -= materialToWip;
            company.wip += materialToWip - wipToProduct;
            company.products += wipToProduct;
            company.cash -= processingCost;
            company.totalF += processingCost;

            company.logAction('完成・投入', `材料${materialToWip}→仕掛品、仕掛品${wipToProduct}→製品`, processingCost, false);

            return { success: true, processingCost };
        },

        /**
         * 採用
         */
        hire(company, count, isReferral = false) {
            if (count > 3 && !isReferral) {
                return { success: false, reason: '1行で最大3人まで' };
            }
            if (isReferral && count > 1) {
                return { success: false, reason: '縁故採用は1人まで' };
            }

            const cost = count * RULES.COST.HIRING;
            if (company.cash < cost) {
                return { success: false, reason: '現金不足' };
            }

            company.cash -= cost;
            company.workers += count;
            company.totalF += cost;

            const type = isReferral ? '縁故採用' : '採用';
            company.logAction(type, `${count}人採用`, cost, false);

            return { success: true, cost };
        },

        /**
         * 退職
         */
        retire(company, count) {
            if (count > company.workers - 1) {
                return { success: false, reason: '最低1人は必要' };
            }

            const cost = count * RULES.COST.RETIREMENT;
            if (company.cash < cost) {
                return { success: false, reason: '退職金不足' };
            }

            company.cash -= cost;
            company.workers -= count;
            company.totalF += cost;
            company.logAction('退職', `${count}人退職`, cost, false);

            return { success: true, cost };
        },

        /**
         * 機械購入
         */
        buyMachine(company, type, gameState) {
            const machineInfo = type === 'large' ? RULES.MACHINE.LARGE : RULES.MACHINE.SMALL;
            if (company.cash < machineInfo.cost) {
                return { success: false, reason: '現金不足' };
            }

            company.cash -= machineInfo.cost;
            company.machines.push({ type, attachments: 0 });
            company.logAction('機械購入', `${type === 'large' ? '大型' : '小型'}機械購入`, machineInfo.cost, false);

            return { success: true, cost: machineInfo.cost };
        },

        /**
         * 機械売却
         */
        sellMachine(company, machineIndex, period) {
            if (machineIndex >= company.machines.length) {
                return { success: false, reason: '機械が存在しない' };
            }
            if (company.machines.length <= 1) {
                return { success: false, reason: '最低1台は必要' };
            }

            const machine = company.machines[machineIndex];
            const bookValue = RULES.BOOK_VALUE[machine.type.toUpperCase()][period];
            const attachmentBook = machine.attachments * RULES.BOOK_VALUE.ATTACHMENT[period];
            const totalBookValue = bookValue + attachmentBook;
            const salePrice = Math.floor(totalBookValue * RULES.SALE_RATIO);
            const loss = totalBookValue - salePrice;

            company.cash += salePrice;
            company.totalSpecialLoss += loss;
            company.machines.splice(machineIndex, 1);

            company.logAction('機械売却', `${machine.type === 'large' ? '大型' : '小型'}機械売却 簿価${totalBookValue}→${salePrice}円`, salePrice, true);

            return { success: true, salePrice, loss };
        },

        /**
         * チップ購入
         */
        buyChip(company, chipType, isExpress = false) {
            const cost = isExpress ? RULES.COST.CHIP_EXPRESS : RULES.COST.CHIP_NORMAL;
            if (company.cash < cost) {
                return { success: false, reason: '現金不足' };
            }

            company.cash -= cost;
            company.totalF += cost;

            if (isExpress) {
                company.chips[chipType] = (company.chips[chipType] || 0) + 1;
            } else {
                company.nextPeriodChips[chipType] = (company.nextPeriodChips[chipType] || 0) + 1;
            }

            const chipNames = { research: '研究開発', education: '教育', advertising: '広告' };
            const typeStr = isExpress ? '特急' : '次期';
            company.logAction('チップ購入', `${chipNames[chipType]}チップ(${typeStr})`, cost, false);

            return { success: true, cost };
        },

        /**
         * 倉庫購入
         */
        buyWarehouse(company) {
            if (company.cash < RULES.COST.WAREHOUSE) {
                return { success: false, reason: '現金不足' };
            }

            company.cash -= RULES.COST.WAREHOUSE;
            company.warehouses += 1;
            company.logAction('倉庫購入', '倉庫購入', RULES.COST.WAREHOUSE, false);

            return { success: true, cost: RULES.COST.WAREHOUSE };
        },

        /**
         * 長期借入（期首のみ）
         */
        borrowLongTerm(company, amount, period, equity) {
            const limit = RULES.getLoanLimit(period, equity);
            const available = limit - company.longTermLoan;

            if (amount > available) {
                return { success: false, reason: `借入限度超過（残り${available}円）` };
            }

            const interest = Math.floor(amount * RULES.LOAN.LONG_TERM_RATE);
            const netAmount = amount - interest;

            company.longTermLoan += amount;
            company.cash += netAmount;
            company.totalF += interest;

            company.logAction('長期借入', `${amount}円借入（利息${interest}円差引）`, netAmount, true);

            return { success: true, amount, interest, netAmount };
        }
    };

    // ============================================
    // 期末処理エンジン
    // ============================================
    const PeriodEndEngine = {
        /**
         * 期末処理を実行
         */
        process(gameState) {
            const period = gameState.period;
            const results = [];

            gameState.companies.forEach(company => {
                const result = this.processCompany(company, period);
                results.push(result);
            });

            // 市場リセット
            gameState.markets.forEach(m => m.currentStock = 0);

            // 親交代
            gameState.rotateParent();

            // 期を進める
            gameState.period++;

            return results;
        },

        processCompany(company, period) {
            const result = {
                companyIndex: company.index,
                wage: 0,
                depreciation: 0,
                insurance: 0,
                longTermRepay: 0,
                shortTermRepay: 0,
                shortTermInterest: 0,
                totalF: 0,
                equityBefore: company.calculateEquity(period),
                equityAfter: 0
            };

            // 1. 人件費
            result.wage = company.workers * RULES.WAGE[period];
            company.cash -= result.wage;
            company.totalF += result.wage;

            // 2. 減価償却（期別に異なる）
            company.machines.forEach(m => {
                if (m.type === 'large') {
                    result.depreciation += RULES.DEPRECIATION_BY_PERIOD.LARGE[period] || 40;
                } else {
                    result.depreciation += RULES.DEPRECIATION_BY_PERIOD.SMALL[period] || 20;
                }
                // アタッチメントの減価償却
                if (m.attachments > 0) {
                    result.depreciation += (RULES.DEPRECIATION_BY_PERIOD.ATTACHMENT[period] || 6) * m.attachments;
                }
            });
            company.totalF += result.depreciation;

            // 3. 保険料
            if (company.insurance) {
                result.insurance = RULES.COST.INSURANCE;
                company.cash -= result.insurance;
                company.totalF += result.insurance;
            }

            // 4. 長期借入返済（最低10%）
            if (company.longTermLoan > 0) {
                result.longTermRepay = Math.ceil(company.longTermLoan * RULES.LOAN.MIN_LONG_REPAY);
                company.cash -= result.longTermRepay;
                company.longTermLoan -= result.longTermRepay;
            }

            // 5. 短期借入返済（最低20%）+ 利息
            if (company.shortTermLoan > 0) {
                result.shortTermRepay = Math.ceil(company.shortTermLoan * RULES.LOAN.MIN_SHORT_REPAY);
                result.shortTermInterest = Math.ceil(company.shortTermLoan * RULES.LOAN.SHORT_TERM_RATE);
                company.cash -= result.shortTermRepay + result.shortTermInterest;
                company.shortTermLoan -= result.shortTermRepay;
                company.totalF += result.shortTermInterest;
            }

            // 6. チップ繰越処理
            if (period === 2) {
                // 2期→3期: 1枚返却、最大3枚繰越
                ['research', 'education', 'advertising'].forEach(type => {
                    if (company.chips[type] > 0) {
                        company.chips[type] = Math.min(company.chips[type] - 1, 3);
                        if (company.chips[type] < 0) company.chips[type] = 0;
                    }
                });
            } else {
                // 3期以降: 会社盤のチップは全てクリア
                company.chips = { research: 0, education: 0, advertising: 0 };
            }

            // 次期チップを移動
            ['research', 'education', 'advertising'].forEach(type => {
                company.chips[type] = (company.chips[type] || 0) + (company.nextPeriodChips[type] || 0);
                company.nextPeriodChips[type] = 0;
            });

            result.totalF = result.wage + result.depreciation + result.insurance + result.shortTermInterest;
            result.equityAfter = company.calculateEquity(period + 1);

            company.logAction('期末処理', `人件費${result.wage} 減価償却${result.depreciation}`, result.totalF, false);

            return result;
        }
    };

    // ============================================
    // AI意思決定エンジン
    // ============================================
    const AIDecisionEngine = {
        /**
         * 最適な行動を決定
         */
        decideAction(company, gameState, options = {}) {
            const period = gameState.period;
            const isParent = gameState.isParent(company.index);
            const actions = this.evaluateAllActions(company, gameState);

            // スコアでソート
            actions.sort((a, b) => b.score - a.score);

            return actions[0];
        },

        /**
         * 全ての可能な行動を評価
         */
        evaluateAllActions(company, gameState) {
            const actions = [];
            const period = gameState.period;

            // 販売
            if (company.products > 0) {
                const salesAction = this.evaluateSales(company, gameState);
                if (salesAction) actions.push(salesAction);
            }

            // 材料購入
            const buyAction = this.evaluateBuyMaterials(company, gameState);
            if (buyAction) actions.push(buyAction);

            // 完成・投入
            const produceAction = this.evaluateProduction(company, gameState);
            if (produceAction) actions.push(produceAction);

            // 採用
            const hireAction = this.evaluateHiring(company, gameState);
            if (hireAction) actions.push(hireAction);

            // 機械購入
            const machineAction = this.evaluateMachinePurchase(company, gameState);
            if (machineAction) actions.push(machineAction);

            // チップ購入
            const chipAction = this.evaluateChipPurchase(company, gameState);
            if (chipAction) actions.push(chipAction);

            // DO NOTHING
            actions.push({ type: 'DO_NOTHING', score: 0, detail: '何もしない' });

            return actions;
        },

        evaluateSales(company, gameState) {
            const salesCapacity = company.getSalesCapacity();
            const quantity = Math.min(salesCapacity, company.products);
            if (quantity === 0) return null;

            // 最適な市場を選択
            const isParent = gameState.isParent(company.index);
            const competitiveness = company.getPriceCompetitiveness(isParent);

            // 研究チップに応じた価格設定
            const researchChips = company.chips.research || 0;
            let targetPrice, targetMarket;

            if (researchChips >= 4) {
                targetPrice = 32;
                targetMarket = gameState.markets.find(m => m.sellPrice >= 32);
            } else if (researchChips >= 2) {
                targetPrice = 28;
                targetMarket = gameState.markets.find(m => m.sellPrice >= 28);
            } else {
                targetPrice = 24;
                targetMarket = gameState.markets.find(m => m.sellPrice >= 24);
            }

            if (!targetMarket) {
                targetMarket = gameState.markets[4]; // 大阪
                targetPrice = 24;
            }

            const expectedRevenue = targetPrice * quantity;
            // 販売は最優先 - 高スコア
            const score = 200 + expectedRevenue;

            return {
                type: 'SELL',
                score,
                detail: `${targetMarket.name}に¥${targetPrice}×${quantity}個`,
                market: targetMarket,
                price: targetPrice,
                quantity
            };
        },

        evaluateBuyMaterials(company, gameState) {
            const period = gameState.period;
            const mfgCapacity = company.getMfgCapacity();
            const storageCapacity = company.getStorageCapacity();
            const currentStorage = company.materials + company.products;
            const availableStorage = storageCapacity - currentStorage;

            if (availableStorage <= 0) return null;

            // 2期は製造能力制限なし
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
            if (company.cash < cost + 50) return null; // 安全マージン

            // 材料がなければ高優先度
            let score = 80 + targetQty * 10;
            if (company.materials === 0 && company.wip === 0 && company.products === 0) {
                score += 100; // 在庫ゼロなら最優先で購入
            }

            return {
                type: 'BUY_MATERIALS',
                score,
                detail: `${market.name}から¥${market.buyPrice}×${targetQty}個`,
                market,
                quantity: targetQty
            };
        },

        evaluateProduction(company, gameState) {
            const mfgCapacity = company.getMfgCapacity();
            const canProduce = Math.min(mfgCapacity, company.wip + company.materials);

            if (canProduce === 0) return null;

            const materialToWip = Math.min(company.materials, RULES.CAPACITY.WIP - company.wip);
            const wipToProduct = Math.min(mfgCapacity, company.wip + materialToWip);

            if (wipToProduct === 0) return null;

            const processingCost = wipToProduct * RULES.COST.PROCESSING;
            if (company.cash < processingCost + 30) return null;

            // スコア: 製品がないときは高優先度
            let score = 100 + wipToProduct * 20;
            if (company.products === 0) {
                score += 50; // 製品がなければ急いで生産
            }

            return {
                type: 'PRODUCE',
                score,
                detail: `材料${materialToWip}→仕掛品、仕掛品${wipToProduct}→製品`,
                materialToWip,
                wipToProduct
            };
        },

        evaluateHiring(company, gameState) {
            const currentSalesCapacity = company.getSalesCapacity();
            const products = company.products;

            // 販売能力が製品数より少なければ採用を検討
            if (currentSalesCapacity >= products + 2) return null;

            const hireCount = Math.min(3, Math.max(1, products - currentSalesCapacity + 1));
            const cost = hireCount * RULES.COST.HIRING;

            if (company.cash < cost + 50) return null;

            // スコア: 追加販売できる製品の期待利益
            const additionalSales = Math.min(hireCount, products);
            const score = additionalSales * 13 - cost; // M=13想定

            return {
                type: 'HIRE',
                score,
                detail: `${hireCount}人採用`,
                count: hireCount
            };
        },

        evaluateMachinePurchase(company, gameState) {
            const period = gameState.period;

            // 3期で大型機械への移行を検討
            if (period === 3 && company.machines.length === 1 && company.machines[0].type === 'small') {
                if (company.cash >= 200 + 50) {
                    return {
                        type: 'BUY_LARGE_MACHINE',
                        score: 100, // 高優先度
                        detail: '大型機械購入（200円）'
                    };
                }
            }

            return null;
        },

        evaluateChipPurchase(company, gameState) {
            const period = gameState.period;
            const researchChips = company.chips.research || 0;

            // 研究開発チップを優先
            if (researchChips < 3 && company.cash >= RULES.COST.CHIP_EXPRESS + 50) {
                const score = (3 - researchChips) * 20;
                return {
                    type: 'BUY_CHIP',
                    score,
                    detail: '研究開発チップ（特急）購入',
                    chipType: 'research',
                    isExpress: true
                };
            }

            return null;
        }
    };

    // ============================================
    // シミュレーション実行エンジン
    // ============================================
    const SimulationRunner = {
        /**
         * 完全なゲームをシミュレート
         */
        runFullGame(options = {}) {
            const gameState = new GameState();
            gameState.initCompanies();

            const results = {
                periods: [],
                finalEquities: [],
                actionLogs: [],
                winner: null
            };

            // 2期～5期をシミュレート
            for (let period = 2; period <= 5; period++) {
                gameState.period = period;
                const periodResult = this.runPeriod(gameState, options);
                results.periods.push(periodResult);
            }

            // 最終結果
            gameState.companies.forEach(company => {
                const equity = company.calculateEquity(5);
                results.finalEquities.push({
                    companyIndex: company.index,
                    name: company.name,
                    equity,
                    reachedTarget: equity >= RULES.TARGET_EQUITY,
                    totalSales: company.totalSales,
                    totalSoldQuantity: company.totalSoldQuantity,
                    totalF: company.totalF,
                    totalSpecialLoss: company.totalSpecialLoss
                });
                results.actionLogs.push({
                    companyIndex: company.index,
                    log: company.actionLog
                });
            });

            // 勝者決定
            results.finalEquities.sort((a, b) => b.equity - a.equity);
            results.winner = results.finalEquities[0];

            return results;
        },

        /**
         * 1期分をシミュレート
         */
        runPeriod(gameState, options = {}) {
            const period = gameState.period;
            const maxRows = RULES.MAX_ROWS[period];
            const periodResult = {
                period,
                turns: [],
                periodEndResults: null
            };

            // 期首処理: 長期借入
            gameState.companies.forEach((company, index) => {
                if (!company.isPlayer || options.autoPlayer) {
                    const equity = company.calculateEquity(period);
                    const limit = RULES.getLoanLimit(period, equity);
                    const available = limit - company.longTermLoan;
                    if (available > 0 && company.cash < 150) {
                        ActionEngine.borrowLongTerm(company, available, period, equity);
                    }
                }
            });

            // ターン実行
            let continueSimulation = true;
            while (continueSimulation) {
                gameState.turn++;

                // 各社のターン
                for (let i = 0; i < gameState.companies.length; i++) {
                    const company = gameState.companies[i];
                    if (company.currentRow >= maxRows) continue;

                    // カードを引く（リスク確率20%）
                    const isRisk = Math.random() < RULES.RISK_PROBABILITY;

                    if (isRisk) {
                        // リスクカード処理（簡略化）
                        this.processRiskCard(company, gameState);
                    } else {
                        // 意思決定
                        if (!company.isPlayer || options.autoPlayer) {
                            const action = AIDecisionEngine.decideAction(company, gameState);
                            this.executeAction(company, action, gameState);
                        }
                    }

                    company.currentRow++;

                    // 行数チェック
                    if (company.currentRow >= maxRows) {
                        continueSimulation = false;
                        break;
                    }
                }

                // 全社が上限に達したかチェック
                const allDone = gameState.companies.every(c => c.currentRow >= maxRows);
                if (allDone) continueSimulation = false;

                periodResult.turns.push({
                    turn: gameState.turn,
                    companyStates: gameState.companies.map(c => ({
                        cash: c.cash,
                        materials: c.materials,
                        wip: c.wip,
                        products: c.products,
                        row: c.currentRow
                    }))
                });
            }

            // 期末処理
            periodResult.periodEndResults = PeriodEndEngine.process(gameState);

            // 行数リセット
            gameState.companies.forEach(c => c.currentRow = 1);

            return periodResult;
        },

        processRiskCard(company, gameState) {
            // 15種類のリスクカード（実際のゲームに基づく）
            const riskCards = [
                { id: 1, name: 'クレーム発生', effect: 'F_COST', value: 5 },
                { id: 2, name: 'クレーム発生', effect: 'F_COST', value: 5 },
                { id: 3, name: '教育成功', effect: 'EDUCATION_SUCCESS', value: 32 },
                { id: 4, name: '教育成功', effect: 'EDUCATION_SUCCESS', value: 32 },
                { id: 5, name: '消費者運動発生', effect: 'NO_SALES', value: 0 },
                { id: 6, name: '消費者運動発生', effect: 'NO_SALES', value: 0 },
                { id: 7, name: '得意先倒産', effect: 'CASH_LOSS', value: 30 },
                { id: 8, name: '得意先倒産', effect: 'CASH_LOSS', value: 30 },
                { id: 9, name: '研究開発失敗', effect: 'LOSE_CHIP', chipType: 'research' },
                { id: 10, name: '研究開発失敗', effect: 'LOSE_CHIP', chipType: 'research' },
                { id: 11, name: '研究開発失敗', effect: 'LOSE_CHIP', chipType: 'research' },
                { id: 12, name: '広告成功', effect: 'AD_SUCCESS', value: 0 },
                { id: 13, name: '広告成功', effect: 'AD_SUCCESS', value: 0 },
                { id: 14, name: '火災発生', effect: 'FIRE', value: 0 },
                { id: 15, name: '労働争議', effect: 'LABOR_DISPUTE', value: 0 }
            ];

            const card = riskCards[Math.floor(Math.random() * riskCards.length)];

            switch (card.effect) {
                case 'F_COST':
                    company.cash -= card.value;
                    company.totalF += card.value;
                    company.logAction('リスクカード', `${card.name} F+${card.value}`, card.value, false);
                    break;

                case 'CASH_LOSS':
                    // 2期は免除
                    if (gameState.period > 2) {
                        company.cash -= card.value;
                        company.totalSpecialLoss += card.value;
                        company.logAction('リスクカード', `${card.name} 特別損失${card.value}`, card.value, false);
                    }
                    break;

                case 'LOSE_CHIP':
                    if (company.chips[card.chipType] > 0) {
                        company.chips[card.chipType]--;
                        company.logAction('リスクカード', `${card.name} ${card.chipType}チップ-1`, 0, false);
                    }
                    break;

                case 'EDUCATION_SUCCESS':
                    // 教育チップがあれば32円で販売可能（最大5個）
                    if (company.chips.education > 0 && company.products > 0) {
                        const sellQty = Math.min(5, company.products, company.getSalesCapacity());
                        if (sellQty > 0) {
                            const revenue = 32 * sellQty;
                            company.cash += revenue;
                            company.products -= sellQty;
                            company.totalSales += revenue;
                            company.totalSoldQuantity += sellQty;
                            company.logAction('リスクカード', `${card.name} ¥32×${sellQty}個販売`, revenue, true);
                        }
                    }
                    break;

                case 'AD_SUCCESS':
                    // 広告チップ1枚につき2個まで独占販売（最大5個）
                    if (company.chips.advertising > 0 && company.products > 0) {
                        const maxSell = Math.min(5, company.chips.advertising * 2, company.products);
                        if (maxSell > 0) {
                            const revenue = 28 * maxSell; // 平均価格想定
                            company.cash += revenue;
                            company.products -= maxSell;
                            company.totalSales += revenue;
                            company.totalSoldQuantity += maxSell;
                            company.logAction('リスクカード', `${card.name} ¥28×${maxSell}個販売`, revenue, true);
                        }
                    }
                    break;

                case 'NO_SALES':
                    // 販売できない（シミュレーションでは次のターンまで効果なし扱い）
                    company.logAction('リスクカード', `${card.name} 販売不可`, 0, false);
                    break;

                case 'FIRE':
                    // 火災: 保険なしなら製品損失
                    if (!company.insurance && company.products > 0) {
                        const loss = Math.min(3, company.products);
                        company.products -= loss;
                        company.logAction('リスクカード', `${card.name} 製品${loss}個損失`, 0, false);
                    }
                    break;

                case 'LABOR_DISPUTE':
                    // 労働争議: 生産停止（シミュレーションでは効果なし扱い）
                    company.logAction('リスクカード', `${card.name}`, 0, false);
                    break;
            }
        },

        executeAction(company, action, gameState) {
            if (!action) return;

            switch (action.type) {
                case 'SELL':
                    // 6社競争をシミュレート
                    const isParent = gameState.isParent(company.index);
                    const myChips = company.chips.research || 0;
                    const myCompetitiveness = myChips * 2 + (isParent ? 2 : 0);
                    const myCallPrice = action.price - myCompetitiveness;

                    // 他社のコール価格をシミュレート（平均2枚の研究チップ想定）
                    let competitors = 0;
                    for (let i = 0; i < 5; i++) { // 他5社
                        const otherChips = Math.floor(Math.random() * 4); // 0-3枚
                        const otherPrice = 24 + Math.floor(Math.random() * 8); // 24-31円
                        const otherCallPrice = otherPrice - otherChips * 2;
                        if (otherCallPrice <= myCallPrice) competitors++;
                    }

                    // 勝率計算：同等以下のコール価格を持つ競争者が少ないほど勝つ
                    // 親は同点で勝つので有利
                    let winProbability;
                    if (competitors === 0) {
                        winProbability = 0.95;
                    } else if (competitors === 1) {
                        winProbability = isParent ? 0.75 : 0.50;
                    } else if (competitors === 2) {
                        winProbability = isParent ? 0.50 : 0.33;
                    } else {
                        winProbability = isParent ? 0.30 : 0.20;
                    }

                    // 研究チップが多いほど有利
                    winProbability += myChips * 0.05;
                    winProbability = Math.min(0.95, winProbability);

                    if (Math.random() < winProbability) {
                        const revenue = action.price * action.quantity;
                        company.cash += revenue;
                        company.products -= action.quantity;
                        company.totalSales += revenue;
                        company.totalSoldQuantity += action.quantity;
                        company.logAction('販売', action.detail, revenue, true);
                    } else {
                        company.logAction('販売失敗', `入札に負け: ${action.detail}`, 0, false);
                    }
                    break;

                case 'BUY_MATERIALS':
                    ActionEngine.buyMaterials(company, action.quantity, action.market, gameState);
                    break;

                case 'PRODUCE':
                    ActionEngine.produce(company, action.materialToWip, action.wipToProduct);
                    break;

                case 'HIRE':
                    ActionEngine.hire(company, action.count);
                    break;

                case 'BUY_LARGE_MACHINE':
                    ActionEngine.buyMachine(company, 'large', gameState);
                    break;

                case 'BUY_CHIP':
                    ActionEngine.buyChip(company, action.chipType, action.isExpress);
                    break;

                case 'DO_NOTHING':
                default:
                    company.logAction('様子見', '何もしない', 0, false);
                    break;
            }
        }
    };

    // ============================================
    // 評価システム
    // ============================================
    const Evaluator = {
        /**
         * シミュレーション結果を評価
         */
        evaluate(results) {
            const evaluation = {
                summary: {},
                rankings: [],
                insights: [],
                recommendations: []
            };

            // サマリー
            evaluation.summary = {
                totalCompanies: results.finalEquities.length,
                targetReached: results.finalEquities.filter(e => e.reachedTarget).length,
                averageEquity: Math.round(
                    results.finalEquities.reduce((sum, e) => sum + e.equity, 0) / results.finalEquities.length
                ),
                winner: results.winner
            };

            // ランキング
            evaluation.rankings = results.finalEquities.map((e, i) => ({
                rank: i + 1,
                ...e,
                grade: this.getGrade(e.equity)
            }));

            // インサイト
            if (evaluation.summary.targetReached === 0) {
                evaluation.insights.push('目標達成者なし - 戦略の見直しが必要');
            }

            // 推奨事項
            results.finalEquities.forEach(e => {
                if (e.equity < 350) {
                    evaluation.recommendations.push({
                        company: e.name,
                        issue: '自己資本不足',
                        suggestion: '研究開発チップ投資と高価格販売の強化'
                    });
                }
            });

            return evaluation;
        },

        getGrade(equity) {
            if (equity >= 500) return 'S';
            if (equity >= 450) return 'A';
            if (equity >= 400) return 'B';
            if (equity >= 350) return 'C';
            if (equity >= 300) return 'D';
            return 'F';
        },

        /**
         * 行動ログを分析
         */
        analyzeActions(actionLogs) {
            const analysis = [];

            actionLogs.forEach(log => {
                const companyAnalysis = {
                    companyIndex: log.companyIndex,
                    totalActions: log.log.length,
                    actionBreakdown: {},
                    efficiency: 0
                };

                log.log.forEach(action => {
                    const type = action.action;
                    companyAnalysis.actionBreakdown[type] = (companyAnalysis.actionBreakdown[type] || 0) + 1;
                });

                analysis.push(companyAnalysis);
            });

            return analysis;
        }
    };

    // ============================================
    // 公開API
    // ============================================
    return {
        RULES,
        Company,
        GameState,
        BiddingEngine,
        ActionEngine,
        PeriodEndEngine,
        AIDecisionEngine,
        SimulationRunner,
        Evaluator,

        // 便利メソッド
        runSimulation: function(options = {}) {
            return SimulationRunner.runFullGame(options);
        },

        evaluateResults: function(results) {
            return Evaluator.evaluate(results);
        },

        // 複数回シミュレーション
        runMultipleSimulations: function(count = 100, options = {}) {
            const allResults = [];
            for (let i = 0; i < count; i++) {
                allResults.push(this.runSimulation(options));
            }

            // 統計
            const stats = {
                totalRuns: count,
                targetReachRate: 0,
                averageWinnerEquity: 0,
                equityDistribution: { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 }
            };

            allResults.forEach(result => {
                if (result.winner.reachedTarget) stats.targetReachRate++;
                stats.averageWinnerEquity += result.winner.equity;
                const grade = Evaluator.getGrade(result.winner.equity);
                stats.equityDistribution[grade]++;
            });

            stats.targetReachRate = Math.round(stats.targetReachRate / count * 100);
            stats.averageWinnerEquity = Math.round(stats.averageWinnerEquity / count);

            return { allResults, stats };
        }
    };
})();

// Node.js/ブラウザ両対応エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MGSimulation;
}
if (typeof window !== 'undefined') {
    window.MGSimulation = MGSimulation;
}
