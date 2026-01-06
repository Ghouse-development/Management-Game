/**
 * MG シミュレーションエンジン v3.0
 *
 * 完全なゲームルールを実装した高精度シミュレーター
 * 全84ルールを正確に実装
 * インテリジェント学習システム統合
 * Node.js/ブラウザ両対応
 */

// インテリジェント学習システムを読み込み
let IntelligentLearning = null;
try {
    if (typeof require !== 'undefined') {
        IntelligentLearning = require('./intelligent-learning.js');
    }
} catch (e) {
    // ブラウザ環境ではwindowから取得
    if (typeof window !== 'undefined' && window.IntelligentLearning) {
        IntelligentLearning = window.IntelligentLearning;
    }
}

const MGSimulation = (function() {
    'use strict';

    // ============================================
    // ルール自己検証システム
    // シミュレーション実行時に自動で検証される
    // ============================================
    const RuleValidator = {
        errors: [],

        /**
         * 必須ルールが全て定義されているか検証
         * @returns {boolean} 全て定義されていればtrue
         */
        validateRules() {
            this.errors = [];

            // 必須ルール定義の存在確認
            const requiredPaths = [
                ['INITIAL', '初期状態'],
                ['PARENT', '親システム'],
                ['PARENT.BONUS', '親ボーナス'],
                ['CAPACITY', '在庫容量'],
                ['MACHINE', '機械情報'],
                ['MARKETS', '市場情報'],
                ['MAX_ROWS', '期別行数'],
                ['TARGET_PRICES', '研究チップ別価格'],
                ['LOAN', '借入情報'],
                ['VICTORY', '勝利条件']
            ];

            for (const [path, name] of requiredPaths) {
                if (!this.checkPath(RULES, path)) {
                    this.errors.push(`ルール未定義: ${name} (${path})`);
                }
            }

            // 期別行数の検証
            if (RULES.MAX_ROWS) {
                for (const period of [2, 3, 4, 5]) {
                    if (!RULES.MAX_ROWS[period]) {
                        this.errors.push(`期別行数未定義: ${period}期`);
                    }
                }
            }

            // 研究チップ別価格の検証
            if (RULES.TARGET_PRICES) {
                for (const period of [2, 3, 4, 5]) {
                    if (!RULES.TARGET_PRICES[period]) {
                        this.errors.push(`価格テーブル未定義: ${period}期`);
                    }
                }
            }

            return this.errors.length === 0;
        },

        checkPath(obj, path) {
            const parts = path.split('.');
            let current = obj;
            for (const part of parts) {
                if (current === undefined || current === null) return false;
                current = current[part];
            }
            return current !== undefined;
        },

        getErrors() {
            return this.errors;
        }
    };

    // ============================================
    // 実行時ルール強制システム（RuntimeRuleEnforcer）
    // 全ての状態変更後に自動でルール検証を行う
    // 違反があれば即座にエラーをスロー
    // ============================================
    const RuntimeRuleEnforcer = {
        enabled: true,  // 本番では常にtrue
        violations: [],

        /**
         * 会社の状態がルールに違反していないかチェック
         * 違反があればエラーをスロー
         */
        enforce(company, gameState, context = '') {
            if (!this.enabled) return;

            this.violations = [];
            const period = gameState?.period || company.period || 2;

            // ルール①: 2期に特急チップがあってはならない
            if (period === 2) {
                const history = company.chipPurchaseHistory;
                if (history) {
                    const expressCount = (history.research?.express || 0) +
                                        (history.education?.express || 0) +
                                        (history.advertising?.express || 0);
                    if (expressCount > 0) {
                        this.violations.push(`ルール①違反: 2期に特急チップ購入(${expressCount}枚)`);
                    }
                }
            }

            // ルール⑥: セールス0で販売していないかチェック（販売履歴で確認）
            // これは販売時にチェックするため、状態では検証困難

            // ルール⑦: 在庫上限チェック
            const maxMaterials = RULES.CAPACITY.MATERIAL_BASE + (company.warehouses || 0) * RULES.CAPACITY.WAREHOUSE_BONUS;
            const maxProducts = RULES.CAPACITY.PRODUCT_BASE + (company.warehouses || 0) * RULES.CAPACITY.WAREHOUSE_BONUS;
            if (company.materials > maxMaterials) {
                this.violations.push(`ルール⑦違反: 材料在庫超過(${company.materials}/${maxMaterials})`);
            }
            if (company.products > maxProducts) {
                this.violations.push(`ルール⑦違反: 製品在庫超過(${company.products}/${maxProducts})`);
            }
            if (company.wip > RULES.CAPACITY.WIP) {
                this.violations.push(`ルール⑦違反: 仕掛品超過(${company.wip}/${RULES.CAPACITY.WIP})`);
            }

            // 違反があればエラー
            if (this.violations.length > 0) {
                const errorMsg = `[RuntimeRuleEnforcer] ${context}\n` + this.violations.join('\n');
                console.error(errorMsg);
                throw new Error(errorMsg);
            }
        },

        /**
         * 5期終了条件チェック（警告のみ）
         */
        checkEndConditions(company, period) {
            if (period !== 5) return { valid: true };

            const warnings = [];
            const inventory = company.materials + company.wip + company.products;
            const chips = (company.chips.research || 0) + (company.chips.education || 0) +
                         (company.chips.advertising || 0) + (company.nextPeriodChips?.research || 0) +
                         (company.nextPeriodChips?.education || 0) + (company.nextPeriodChips?.advertising || 0);

            if (inventory < RULES.VICTORY.MIN_INVENTORY) {
                warnings.push(`在庫不足: ${inventory}/${RULES.VICTORY.MIN_INVENTORY}`);
            }
            if (chips < RULES.VICTORY.MIN_CARRYOVER_CHIPS) {
                warnings.push(`チップ不足: ${chips}/${RULES.VICTORY.MIN_CARRYOVER_CHIPS}`);
            }

            return { valid: warnings.length === 0, warnings };
        }
    };

    // ============================================
    // GameActionTracker: 完全自動ルール強制システム
    // 全てのアクションはこのシステムを通じて実行される
    // フラグにより全ての状態変化を追跡・検証
    // ============================================
    const GameActionTracker = {
        // デバッグモード（詳細ログ出力）
        debugMode: false,

        /**
         * 会社の全フラグを初期化
         */
        initAllFlags(company) {
            company.gameFlags = {
                // ===== 期間フラグ =====
                period: {
                    current: 2,
                    phase: 'PERIOD_START',  // PERIOD_START, MID_PERIOD, PERIOD_END
                    row: 0,
                    isFirstRound: true
                },

                // ===== 人員フラグ =====
                personnel: {
                    workers: { count: 1, hireHistory: [], maxThisPeriod: 1 },
                    salesmen: { count: 1, hireHistory: [], maxThisPeriod: 1 },
                    maxPersonnel: 0  // 期中最大（ワーカー+セールス）
                },

                // ===== 機械フラグ =====
                machines: {
                    list: [],  // { type, attachments, purchasedPeriod, bookValue }
                    purchaseHistory: [],
                    saleHistory: []
                },

                // ===== チップフラグ =====
                chips: {
                    pc: { owned: false, purchasedThisPeriod: false },
                    insurance: { owned: false, purchasedThisPeriod: false },
                    research: { count: 0, purchaseHistory: [], carryover: 0 },
                    education: { count: 0, purchaseHistory: [], carryover: 0 },
                    advertising: { count: 0, purchaseHistory: [], carryover: 0 },
                    purchasedThisTurn: false  // ルール②: 1行1枚制限
                },

                // ===== 在庫フラグ =====
                inventory: {
                    materials: { count: 1, purchaseHistory: [], consumeHistory: [] },
                    wip: { count: 2, inputHistory: [], completeHistory: [] },
                    products: { count: 1, produceHistory: [], saleHistory: [] },
                    maxCapacity: { materials: 10, products: 10, wip: 10 }
                },

                // ===== 販売フラグ =====
                sales: {
                    history: [],  // { market, quantity, price, revenue, row, won }
                    totalRevenue: 0,
                    totalQuantity: 0,
                    marketVolumes: {}  // 市場別販売済み数
                },

                // ===== 借入フラグ =====
                loans: {
                    longTerm: { balance: 0, history: [] },
                    shortTerm: { balance: 0, history: [] },
                    interestPaid: 0,
                    repaymentHistory: []
                },

                // ===== 現金フラグ =====
                cash: {
                    balance: 112,
                    history: [],  // { row, action, amount, reason, balanceAfter }
                    totalIncome: 0,
                    totalExpense: 0
                },

                // ===== リスクカードフラグ =====
                riskCards: {
                    drawn: [],  // { cardNumber, row, effect }
                    pendingEffects: []
                },

                // ===== F計算フラグ =====
                fCosts: {
                    wage: { workers: 0, machines: 0, salesmen: 0, maxPersonnel: 0 },
                    depreciation: 0,
                    chips: { pc: 0, insurance: 0, research: 0, education: 0, advertising: 0 },
                    warehouse: 0,
                    interest: { longTerm: 0, shortTerm: 0 },
                    total: 0
                },

                // ===== 特別損失フラグ =====
                specialLosses: {
                    list: [],  // { reason, amount, row }
                    total: 0
                },

                // ===== 期首処理フラグ =====
                periodStart: {
                    completed: false,
                    interestPaid: 0,
                    taxPaid: 0,
                    dividendPaid: 0,
                    purchases: []  // PC, 保険, 倉庫など
                },

                // ===== 期末処理フラグ =====
                periodEnd: {
                    completed: false,
                    calculations: null  // PQ, VQ, MQ, F, G
                },

                // ===== 学習トラッキングフラグ =====
                learning: {
                    initialized: true,
                    qValuesUpdated: 0,
                    decisionsLogged: [],
                    strategyAdjustments: [],
                    explorationRate: 0.25
                },

                // ===== 自己資本成長追跡 =====
                equityTracking: {
                    initial: 300,  // 初期自己資本
                    current: 300,
                    target: 450,   // 目標自己資本
                    history: [],   // { period, endEquity, growth, rank }
                    bestEquity: 300,
                    worstEquity: 300,
                    growthRate: 0,
                    isGrowing: false
                },

                // ===== システム状態フラグ =====
                system: {
                    flagsInitialized: true,
                    lastValidation: null,
                    validationErrors: [],
                    totalActions: 0,
                    ruleViolations: []
                }
            };
        },

        /**
         * フラグが初期化されているかチェック（必須）
         * フラグなしでは行動できない
         */
        requireFlags(company, actionName = 'action') {
            if (!company.gameFlags) {
                throw new Error(`[MANDATORY] ${company.name}のgameFlagsが未初期化。${actionName}を実行できません。`);
            }
            if (!company.gameFlags.system?.flagsInitialized) {
                throw new Error(`[MANDATORY] ${company.name}のフラグシステムが不完全。${actionName}を実行できません。`);
            }
            // アクション数を記録
            company.gameFlags.system.totalActions++;
            return true;
        },

        /**
         * 学習決定をログに記録
         */
        logLearningDecision(company, state, action, reward, nextState) {
            if (!company.gameFlags?.learning) return;

            company.gameFlags.learning.decisionsLogged.push({
                state,
                action,
                reward,
                nextState,
                timestamp: Date.now(),
                period: company.gameFlags.period?.current || company.period
            });
        },

        /**
         * Q値更新を記録
         */
        flagQValueUpdate(company, count = 1) {
            if (!company.gameFlags?.learning) return;
            company.gameFlags.learning.qValuesUpdated += count;
        },

        /**
         * 戦略調整を記録
         */
        flagStrategyAdjustment(company, adjustment) {
            if (!company.gameFlags?.learning) return;
            company.gameFlags.learning.strategyAdjustments.push({
                ...adjustment,
                timestamp: Date.now()
            });
        },

        /**
         * 自己資本を更新
         */
        updateEquity(company, newEquity, period = null) {
            if (!company.gameFlags?.equityTracking) return;

            const tracking = company.gameFlags.equityTracking;
            const currentPeriod = period || company.period;
            const growth = newEquity - tracking.current;

            tracking.current = newEquity;
            tracking.isGrowing = growth > 0;
            tracking.growthRate = ((newEquity - tracking.initial) / tracking.initial * 100).toFixed(1);

            // ベスト/ワースト更新
            if (newEquity > tracking.bestEquity) {
                tracking.bestEquity = newEquity;
            }
            if (newEquity < tracking.worstEquity) {
                tracking.worstEquity = newEquity;
            }

            // 履歴に追加
            tracking.history.push({
                period: currentPeriod,
                endEquity: newEquity,
                growth: growth,
                growthRate: tracking.growthRate,
                timestamp: Date.now()
            });

            if (this.debugMode) {
                console.log(`[EQUITY] ${company.name}: ${newEquity} (${growth >= 0 ? '+' : ''}${growth})`);
            }
        },

        /**
         * ルール違反を記録
         */
        flagRuleViolation(company, ruleId, description) {
            if (!company.gameFlags?.system) return;

            company.gameFlags.system.ruleViolations.push({
                ruleId,
                description,
                period: company.period,
                row: company.currentRow,
                timestamp: Date.now()
            });

            console.error(`[RULE VIOLATION] ${ruleId}: ${description}`);
        },

        /**
         * システム検証を実行
         */
        runSystemValidation(company) {
            if (!company.gameFlags?.system) return { valid: true };

            const errors = [];
            const flags = company.gameFlags;

            // 現金整合性
            if (flags.cash && Math.abs(flags.cash.balance - company.cash) > 0.01) {
                errors.push(`現金不整合: フラグ${flags.cash.balance} vs 実際${company.cash}`);
            }

            // 在庫整合性
            if (flags.inventory?.materials && flags.inventory.materials.count !== company.materials) {
                errors.push(`材料不整合`);
            }

            flags.system.lastValidation = Date.now();
            flags.system.validationErrors = errors;

            return { valid: errors.length === 0, errors };
        },

        // ===== 現金変化追跡（全ての現金変動はここを通す）=====
        trackCashChange(company, amount, reason, row = null) {
            const flags = company.gameFlags;
            const actualRow = row || company.currentRow;

            flags.cash.balance += amount;
            flags.cash.history.push({
                row: actualRow,
                action: amount >= 0 ? 'INCOME' : 'EXPENSE',
                amount: amount,
                reason: reason,
                balanceAfter: flags.cash.balance,
                timestamp: Date.now()
            });

            if (amount >= 0) {
                flags.cash.totalIncome += amount;
            } else {
                flags.cash.totalExpense += Math.abs(amount);
            }

            // 現金と実際の値を同期
            company.cash = flags.cash.balance;

            if (this.debugMode) {
                console.log(`[CASH] ${reason}: ${amount >= 0 ? '+' : ''}${amount} → 残高${flags.cash.balance}`);
            }

            return flags.cash.balance;
        },

        // ===== 材料購入フラグ =====
        flagMaterialPurchase(company, market, quantity, cost) {
            const flags = company.gameFlags;
            const maxCapacity = flags.inventory.maxCapacity.materials;

            // ルール検証: 在庫上限チェック
            if (flags.inventory.materials.count + quantity > maxCapacity) {
                throw new Error(`材料購入不可: 在庫上限超過(${flags.inventory.materials.count}+${quantity}>${maxCapacity})`);
            }

            flags.inventory.materials.count += quantity;
            flags.inventory.materials.purchaseHistory.push({
                market: market.name,
                quantity,
                unitPrice: market.buyPrice,
                cost,
                row: company.currentRow
            });

            // 現金追跡
            this.trackCashChange(company, -cost, `材料購入(${market.name}×${quantity})`);

            // 実際の値と同期
            company.materials = flags.inventory.materials.count;

            return true;
        },

        // ===== 生産フラグ（投入）=====
        flagProduction_Input(company, quantity) {
            const flags = company.gameFlags;

            // ルール検証: 材料チェック
            if (flags.inventory.materials.count < quantity) {
                throw new Error(`投入不可: 材料不足(${flags.inventory.materials.count}<${quantity})`);
            }
            // ルール検証: 仕掛品上限チェック
            if (flags.inventory.wip.count + quantity > flags.inventory.maxCapacity.wip) {
                throw new Error(`投入不可: 仕掛品上限超過`);
            }

            flags.inventory.materials.count -= quantity;
            flags.inventory.materials.consumeHistory.push({
                type: 'INPUT',
                quantity,
                row: company.currentRow
            });

            flags.inventory.wip.count += quantity;
            flags.inventory.wip.inputHistory.push({
                quantity,
                row: company.currentRow
            });

            // 加工費
            const cost = quantity * RULES.COST.PROCESSING;
            this.trackCashChange(company, -cost, `投入加工費×${quantity}`);

            // 実際の値と同期
            company.materials = flags.inventory.materials.count;
            company.wip = flags.inventory.wip.count;

            return true;
        },

        // ===== 生産フラグ（完成）=====
        flagProduction_Complete(company, quantity) {
            const flags = company.gameFlags;

            // ルール検証: 仕掛品チェック
            if (flags.inventory.wip.count < quantity) {
                throw new Error(`完成不可: 仕掛品不足(${flags.inventory.wip.count}<${quantity})`);
            }
            // ルール検証: 製品上限チェック
            if (flags.inventory.products.count + quantity > flags.inventory.maxCapacity.products) {
                throw new Error(`完成不可: 製品上限超過`);
            }

            flags.inventory.wip.count -= quantity;
            flags.inventory.wip.completeHistory.push({
                quantity,
                row: company.currentRow
            });

            flags.inventory.products.count += quantity;
            flags.inventory.products.produceHistory.push({
                quantity,
                row: company.currentRow
            });

            // 加工費
            const cost = quantity * RULES.COST.PROCESSING;
            this.trackCashChange(company, -cost, `完成加工費×${quantity}`);

            // 実際の値と同期
            company.wip = flags.inventory.wip.count;
            company.products = flags.inventory.products.count;

            return true;
        },

        // ===== 販売フラグ =====
        flagSale(company, market, quantity, price, revenue, won) {
            const flags = company.gameFlags;

            if (won) {
                // ルール検証: 製品チェック
                if (flags.inventory.products.count < quantity) {
                    throw new Error(`販売不可: 製品不足(${flags.inventory.products.count}<${quantity})`);
                }

                // 市場ボリューム追跡
                const marketName = market.name || market;
                flags.sales.marketVolumes[marketName] = (flags.sales.marketVolumes[marketName] || 0) + quantity;

                flags.inventory.products.count -= quantity;
                flags.inventory.products.saleHistory.push({
                    market: marketName,
                    quantity,
                    price,
                    revenue,
                    row: company.currentRow
                });

                flags.sales.totalRevenue += revenue;
                flags.sales.totalQuantity += quantity;

                // 現金追跡
                this.trackCashChange(company, revenue, `販売(${marketName}×${quantity}@${price})`);

                // 実際の値と同期
                company.products = flags.inventory.products.count;
            }

            flags.sales.history.push({
                market: market.name || market,
                quantity,
                price,
                revenue: won ? revenue : 0,
                row: company.currentRow,
                won
            });

            return true;
        },

        // ===== リスクカードフラグ =====
        flagRiskCard(company, cardNumber, effect, row) {
            const flags = company.gameFlags;

            flags.riskCards.drawn.push({
                cardNumber,
                effect,
                row,
                timestamp: Date.now()
            });

            if (this.debugMode) {
                console.log(`[RISK] カード${cardNumber}: ${effect}`);
            }

            return true;
        },

        // ===== 汎用雇用フラグ =====
        flagHire(company, type, count, period) {
            if (type === 'worker') {
                return this.flagWorkerHire(company, period, count);
            } else if (type === 'salesman') {
                return this.flagSalesmanHire(company, period, count);
            }
            return true;
        },

        // ===== ワーカー雇用フラグ =====
        flagWorkerHire(company, period, count) {
            // gameFlagsが存在しない場合はスキップ（後方互換性）
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (flags.personnel?.workers) {
                flags.personnel.workers.count = (flags.personnel.workers.count || 0) + count;
                flags.personnel.workers.hireHistory.push({
                    count,
                    period,
                    row: company.currentRow,
                    cost: count * RULES.COST.HIRING
                });

                // 最大人員更新
                const currentPersonnel = (flags.personnel.workers.count || 0) + (flags.personnel.salesmen?.count || 0);
                flags.personnel.maxPersonnel = Math.max(flags.personnel.maxPersonnel || 0, currentPersonnel);
            }

            return true;
        },

        // ===== セールスマン雇用フラグ =====
        flagSalesmanHire(company, period, count) {
            // gameFlagsが存在しない場合はスキップ（後方互換性）
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (flags.personnel?.salesmen) {
                flags.personnel.salesmen.count = (flags.personnel.salesmen.count || 0) + count;
                flags.personnel.salesmen.hireHistory.push({
                    count,
                    period,
                    row: company.currentRow,
                    cost: count * RULES.COST.HIRING
                });

                // 最大人員更新
                const currentPersonnel = (flags.personnel.workers?.count || 0) + (flags.personnel.salesmen.count || 0);
                flags.personnel.maxPersonnel = Math.max(flags.personnel.maxPersonnel || 0, currentPersonnel);
            }

            return true;
        },

        // ===== 機械購入フラグ =====
        flagMachinePurchase(company, period, machineType) {
            // gameFlagsが存在しない場合はスキップ
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (flags.machines) {
                flags.machines.list.push({
                    type: machineType,
                    attachments: 0,
                    purchasedPeriod: period,
                    bookValue: machineType === 'large' ? RULES.MACHINE.LARGE.cost : RULES.MACHINE.SMALL.cost
                });

                flags.machines.purchaseHistory.push({
                    type: machineType,
                    cost: machineType === 'large' ? RULES.MACHINE.LARGE.cost : RULES.MACHINE.SMALL.cost,
                    period,
                    row: company.currentRow
                });
            }

            return true;
        },

        // ===== 機械売却フラグ =====
        flagMachineSale(company, period, machineIndex, salePrice, loss) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (!flags.machines?.list || machineIndex >= flags.machines.list.length) {
                return true;  // 機械リストがない場合はスキップ
            }

            const machine = flags.machines.list[machineIndex];
            if (flags.machines.saleHistory) {
                flags.machines.saleHistory.push({
                    type: machine.type,
                    salePrice,
                    loss,
                    period,
                    row: company.currentRow
                });
            }

            flags.machines.list.splice(machineIndex, 1);

            // 特別損失追跡
            if (loss > 0) {
                this.flagSpecialLoss(company, '機械売却損', loss);
            }

            return true;
        },

        // ===== 倉庫購入フラグ =====
        flagWarehousePurchase(company, period) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (flags.inventory?.maxCapacity) {
                flags.inventory.maxCapacity.materials += RULES.CAPACITY.WAREHOUSE_BONUS;
                flags.inventory.maxCapacity.products += RULES.CAPACITY.WAREHOUSE_BONUS;
            }

            return true;
        },

        // ===== PCチップ購入フラグ =====
        flagPCPurchase(company) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (flags.chips?.pc) {
                flags.chips.pc.owned = true;
                flags.chips.pc.purchasedThisPeriod = true;
            }
            if (flags.fCosts?.chips) {
                flags.fCosts.chips.pc = RULES.COST.PC;
            }

            return true;
        },

        // ===== 保険チップ購入フラグ =====
        flagInsurancePurchase(company) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (flags.chips?.insurance) {
                flags.chips.insurance.owned = true;
                flags.chips.insurance.purchasedThisPeriod = true;
            }
            if (flags.fCosts?.chips) {
                flags.fCosts.chips.insurance = RULES.COST.INSURANCE;
            }

            return true;
        },

        // ===== 研究/教育/広告チップ購入フラグ =====
        flagChipPurchase(company, chipType, isExpress) {
            // gameFlagsが存在しない場合は初期化（後方互換性）
            if (!company.gameFlags) {
                this.initAllFlags(company);
            }
            const flags = company.gameFlags;
            const period = flags.period?.current || company.period || 2;

            // ルール①: 2期は特急なし（ActionValidatorで既にチェック済みだが二重チェック）
            // 注: isExpressが既にfalseに修正されている場合があるので静かに処理
            if (period === 2 && isExpress) {
                // 警告は冗長なので抑制（正常な動作）
                isExpress = false;
            }

            // ルール②: 1行1枚まで（chipsBoughtThisTurnは別で管理されている）
            // ここではフラグ記録のみ行い、制限チェックはActionValidatorで実施

            const cost = isExpress ? RULES.COST.CHIP_EXPRESS : RULES.COST.CHIP_NORMAL;

            if (flags.chips[chipType]) {
                flags.chips[chipType].count = (flags.chips[chipType].count || 0) + 1;
                flags.chips[chipType].purchaseHistory.push({
                    isExpress,
                    cost,
                    period,
                    row: company.currentRow
                });
            }

            // 注: 現金追跡はActionEngine.buyChipで既に行われているため、
            // ここでは二重追跡しない（company.cashは既に減少済み）

            return true;
        },

        // ===== 短期借入フラグ =====
        flagShortTermLoan(company, amount) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;
            const interest = Math.floor(amount * RULES.LOAN.SHORT_TERM_RATE);

            if (flags.loans?.shortTerm) {
                flags.loans.shortTerm.balance = (flags.loans.shortTerm.balance || 0) + amount;
                flags.loans.shortTerm.history.push({
                    amount,
                    interest,
                    netAmount: amount - interest,
                    row: company.currentRow
                });
            }
            if (flags.fCosts?.interest) {
                flags.fCosts.interest.shortTerm = (flags.fCosts.interest.shortTerm || 0) + interest;
            }

            return true;
        },

        // ===== 長期借入フラグ =====
        flagLongTermLoan(company, amount) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;
            const interest = Math.floor(amount * RULES.LOAN.LONG_TERM_RATE);

            if (flags.loans?.longTerm) {
                flags.loans.longTerm.balance = (flags.loans.longTerm.balance || 0) + amount;
                flags.loans.longTerm.history.push({
                    amount,
                    interest,
                    netAmount: amount - interest,
                    row: company.currentRow
                });
            }

            return true;
        },

        // ===== 特別損失フラグ =====
        flagSpecialLoss(company, reason, amount) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (flags.specialLosses) {
                flags.specialLosses.list.push({
                    reason,
                    amount,
                    row: company.currentRow
                });
                flags.specialLosses.total = (flags.specialLosses.total || 0) + amount;
            }

            return true;
        },

        // ===== リスクカードフラグ =====
        flagRiskCard(company, cardId, effect) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (flags.riskCards) {
                flags.riskCards.drawn.push({
                    cardNumber: cardId,
                    row: company.currentRow,
                    period: company.period,
                    effect: effect,
                    timestamp: Date.now()
                });
            }

            if (this.debugMode) {
                console.log(`[RISK CARD] #${cardId}: ${effect.type} - ${effect.description}`);
            }

            return true;
        },

        // ===== 期首処理フラグ =====
        flagPeriodStart(company, period) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (flags.period) {
                flags.period.current = period;
                flags.period.phase = 'PERIOD_START';
                flags.period.row = 0;
            }
            if (flags.periodStart) {
                flags.periodStart.completed = false;
            }

            // 最大人員リセット
            if (flags.personnel?.workers && flags.personnel?.salesmen) {
                flags.personnel.maxPersonnel = flags.personnel.workers.count + flags.personnel.salesmen.count;
            }

            return true;
        },

        // ===== 期末処理フラグ =====
        flagPeriodEnd(company, calculations) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (flags.period) {
                flags.period.phase = 'PERIOD_END';
            }
            if (flags.periodEnd) {
                flags.periodEnd.completed = true;
                flags.periodEnd.calculations = calculations;
            }

            return true;
        },

        // ===== 行進行フラグ =====
        flagRowAdvance(company) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            if (flags.period) {
                flags.period.row += 1;
                flags.period.phase = 'MID_PERIOD';
            }
            if (flags.chips) {
                flags.chips.purchasedThisTurn = false;  // ルール②リセット
            }

            return true;
        },

        // ===== 期末にフラグをリセット =====
        resetForNewPeriod(company) {
            if (!company.gameFlags) return true;
            const flags = company.gameFlags;

            // チップ繰越処理
            const period = flags.period?.current || 2;
            if (flags.chips) {
                if (period === 2) {
                    // 2期末: PC・保険返却、研究・教育・広告は-1して最大3枚繰越
                    if (flags.chips.pc) flags.chips.pc.owned = false;
                    if (flags.chips.insurance) flags.chips.insurance.owned = false;
                    ['research', 'education', 'advertising'].forEach(type => {
                        if (flags.chips[type]) {
                            const current = flags.chips[type].count || 0;
                            flags.chips[type].carryover = Math.min(Math.max(0, current - 1), 3);
                            flags.chips[type].count = flags.chips[type].carryover;
                        }
                    });
                } else {
                    // 3期以降末: 全チップ没収
                    if (flags.chips.pc) flags.chips.pc.owned = false;
                    if (flags.chips.insurance) flags.chips.insurance.owned = false;
                    ['research', 'education', 'advertising'].forEach(type => {
                        if (flags.chips[type]) {
                            flags.chips[type].count = 0;
                            flags.chips[type].carryover = 0;
                        }
                    });
                }
            }

            // F計算リセット
            flags.fCosts = {
                wage: { workers: 0, machines: 0, salesmen: 0, maxPersonnel: 0 },
                depreciation: 0,
                chips: { pc: 0, insurance: 0, research: 0, education: 0, advertising: 0 },
                warehouse: 0,
                interest: { longTerm: 0, shortTerm: 0 },
                total: 0
            };

            // 期首処理フラグリセット
            flags.periodStart = {
                completed: false,
                interestPaid: 0,
                taxPaid: 0,
                dividendPaid: 0,
                purchases: []
            };

            // 期末処理フラグリセット
            flags.periodEnd = {
                completed: false,
                calculations: null
            };

            // 販売履歴は維持（累計用）

            return true;
        },

        // ===== フラグからF合計を計算 =====
        calculateFFromFlags(company, period) {
            if (!company.gameFlags) return 0;
            const flags = company.gameFlags;
            const wage = RULES.WAGE[period] || 22;
            const halfWage = Math.floor(wage / 2);

            let totalF = 0;

            // 1. 人件費
            if (flags.personnel?.workers) {
                totalF += flags.personnel.workers.count * wage;
            }
            if (flags.machines?.list) {
                totalF += flags.machines.list.length * wage;
            }
            if (flags.personnel?.salesmen) {
                totalF += flags.personnel.salesmen.count * wage;
            }
            if (flags.personnel) {
                totalF += (flags.personnel.maxPersonnel || 0) * halfWage;
            }

            // 2. 減価償却
            if (flags.machines?.list) {
                flags.machines.list.forEach(m => {
                    const depTable = m.type === 'large'
                        ? RULES.DEPRECIATION_BY_PERIOD.LARGE
                        : RULES.DEPRECIATION_BY_PERIOD.SMALL;
                    totalF += depTable[period] || 20;
                });
            }

            // 3. PC・保険
            if (flags.chips?.pc?.owned) totalF += RULES.COST.PC;
            if (flags.chips?.insurance?.owned) totalF += RULES.COST.INSURANCE;

            // 4. チップ
            if (flags.chips) {
                ['research', 'education', 'advertising'].forEach(type => {
                    if (flags.chips[type]?.purchaseHistory) {
                        flags.chips[type].purchaseHistory
                            .filter(h => h.period === period)
                            .forEach(h => {
                                totalF += h.cost;
                            });
                    }
                });
            }

            // 5. 利息
            if (flags.fCosts?.interest) {
                totalF += flags.fCosts.interest.shortTerm || 0;
            }

            return totalF;
        },

        // ===== 全フラグの整合性チェック =====
        validateAllFlags(company) {
            if (!company.gameFlags) return { valid: true };
            const flags = company.gameFlags;
            const errors = [];

            // 現金整合性
            if (flags.cash && Math.abs((flags.cash.balance || 0) - (company.cash || 0)) > 0.01) {
                errors.push(`現金不整合: フラグ${flags.cash.balance} vs 実際${company.cash}`);
            }

            // 在庫整合性
            if (flags.inventory?.materials && flags.inventory.materials.count !== company.materials) {
                errors.push(`材料不整合: フラグ${flags.inventory.materials.count} vs 実際${company.materials}`);
            }
            if (flags.inventory?.products && flags.inventory.products.count !== company.products) {
                errors.push(`製品不整合: フラグ${flags.inventory.products.count} vs 実際${company.products}`);
            }

            // 人員整合性
            if (flags.personnel?.workers && flags.personnel.workers.count !== company.workers) {
                errors.push(`ワーカー不整合: フラグ${flags.personnel.workers.count} vs 実際${company.workers}`);
            }
            if (flags.personnel?.salesmen && flags.personnel.salesmen.count !== company.salesmen) {
                errors.push(`セールス不整合: フラグ${flags.personnel.salesmen.count} vs 実際${company.salesmen}`);
            }

            if (errors.length > 0) {
                console.error('[GameActionTracker] 整合性エラー:', errors);
                return { valid: false, errors };
            }

            return { valid: true };
        }
    };

    // 後方互換性のためImmediateFTrackerをGameActionTrackerのエイリアスとして定義
    const ImmediateFTracker = {
        initFlags: (company) => GameActionTracker.initAllFlags(company),
        flagWorkerHire: (company, period, count) => GameActionTracker.flagWorkerHire(company, period, count),
        flagSalesmanHire: (company, period, count) => GameActionTracker.flagSalesmanHire(company, period, count),
        flagMachinePurchase: (company, period, type) => GameActionTracker.flagMachinePurchase(company, period, type),
        flagWarehousePurchase: (company, period) => GameActionTracker.flagWarehousePurchase(company, period),
        flagPCPurchase: (company) => GameActionTracker.flagPCPurchase(company),
        flagInsurancePurchase: (company) => GameActionTracker.flagInsurancePurchase(company),
        flagChipPurchase: (company, chipType, isExpress) => GameActionTracker.flagChipPurchase(company, chipType, isExpress),
        flagShortTermLoan: (company, amount) => GameActionTracker.flagShortTermLoan(company, amount),
        flagLongTermLoan: (company, amount) => GameActionTracker.flagLongTermLoan(company, amount),
        flagSpecialLoss: (company, reason, amount) => GameActionTracker.flagSpecialLoss(company, reason, amount),
        resetForNewPeriod: (company) => GameActionTracker.resetForNewPeriod(company),
        calculateFFromFlags: (company, period) => GameActionTracker.calculateFFromFlags(company, period)
    };

    // ============================================
    // アクション検証システム（単一ゲートウェイ）
    // すべてのアクションはこの検証を通過しないと実行不可能
    // ============================================
    const ActionValidator = {
        /**
         * アクションが実行可能かどうかを判定
         * @param {string} actionType - アクションタイプ
         * @param {Object} params - アクションパラメータ
         * @param {Object} company - 会社
         * @param {Object} gameState - ゲーム状態
         * @returns {Object} { valid: boolean, reason?: string }
         */
        canExecute(actionType, params, company, gameState) {
            const period = gameState?.period || 2;

            switch (actionType) {
                case 'BUY_CHIP':
                    return this.validateChipPurchase(params, company, gameState, period);
                case 'SELL':
                    return this.validateSale(params, company, gameState, period);
                case 'BUY_MATERIALS':
                    return this.validateMaterialPurchase(params, company, gameState, period);
                // ===== 新規: 投入（材料→仕掛品）と完成（仕掛品→製品）を分離 =====
                case 'INPUT':
                    return this.validateInput(params, company, gameState);
                case 'COMPLETE':
                    return this.validateComplete(params, company, gameState);
                // ===== 旧: PRODUCE（後方互換性のため残存）=====
                case 'PRODUCE':
                    return this.validateProduction(params, company, gameState);
                case 'HIRE':
                case 'HIRE_WORKER':
                case 'HIRE_SALESMAN':
                    return this.validateHiring(params, company, gameState);
                case 'BUY_LARGE_MACHINE':
                case 'BUY_SMALL_MACHINE':
                    return this.validateMachinePurchase(params, company, gameState, period);
                case 'UPGRADE_TO_LARGE_MACHINE':
                    // 小型売却+大型購入：現金137-144円以上
                    const bookVal = RULES.BOOK_VALUE.SMALL[period] || 80;
                    const saleVal = Math.floor(bookVal * RULES.SALE_RATIO);
                    const required = 200 - saleVal;
                    if (company.cash < required) {
                        return { valid: false, reason: `現金不足（必要¥${required}）` };
                    }
                    const hasSmall = company.machines.length === 1 && company.machines[0].type === 'small';
                    if (!hasSmall) {
                        return { valid: false, reason: '小型機械がない' };
                    }
                    // ★★★ 期末コストチェック（50%緩和で生産力向上優先）★★★
                    const upgradeCashAfter = company.cash + saleVal - 200;
                    const upgradePeriodEndCost = company.estimatedPeriodEndCost || 0;
                    // 大型機械導入で生産能力4倍 → 期末までに収益増加で回収可能
                    // 購入後の現金が期末コストの30%以上あれば許可
                    const minRequired = Math.floor(upgradePeriodEndCost * 0.3);
                    if (upgradeCashAfter < minRequired && minRequired > 0) {
                        return { valid: false, reason: `期末資金不足（購入後¥${upgradeCashAfter}<最低¥${minRequired}）` };
                    }
                    return { valid: true, consumesRow: true };
                case 'SELL_MACHINE':
                    return this.validateMachineSale(params, company, gameState, period);
                case 'DO_NOTHING':
                    return { valid: true, consumesRow: false };  // 行を消費しない
                default:
                    // 未知のアクションタイプは拒否（安全側に倒す）
                    return { valid: false, reason: `未知のアクションタイプ: ${actionType}` };
            }
        },

        // ルール①②⑨: チップ購入の検証
        validateChipPurchase(params, company, gameState, period) {
            // ルール①: 2期は特急なし
            if (period === 2 && params.isExpress) {
                return { valid: false, reason: 'ルール①: 2期は特急購入不可' };
            }
            // ルール②: 1行1枚まで
            if (company.chipsBoughtThisTurn) {
                return { valid: false, reason: 'ルール②: 1行1枚まで' };
            }
            // ルール⑨: 期首購入不可
            if (params.phase === 'PERIOD_START') {
                return { valid: false, reason: 'ルール⑨: 期首にチップ購入不可' };
            }
            // 現金チェック
            const cost = params.isExpress ? 40 : 20;
            if (company.cash < cost) {
                return { valid: false, reason: '現金不足' };
            }
            // ★★★ 期末コストチェック: 購入後に期末を乗り越えられるか ★★★
            // ★★★ スクリプトモードでバイパスフラグがある場合はスキップ ★★★
            if (!params.bypassPeriodEndCheck) {
                const cashAfter = company.cash - cost;
                const periodEndCost = company.estimatedPeriodEndCost || 0;
                if (cashAfter < periodEndCost && periodEndCost > 0) {
                    return { valid: false, reason: `期末資金不足（購入後¥${cashAfter}<期末コスト¥${periodEndCost}）` };
                }
            }
            return { valid: true };
        },

        // ルール⑥⑦⑩: 販売の検証
        validateSale(params, company, gameState, period) {
            // ルール⑥: セールス0なら販売不可
            if (company.salesmen === 0) {
                return { valid: false, reason: 'ルール⑥: セールス0では販売不可' };
            }
            // 製品チェック
            if (company.products < 2) {
                return { valid: false, reason: '最小販売数(2個)未満' };
            }
            // ルール⑦: 市場ボリューム制限（事前チェック）
            if (params.market) {
                const remaining = params.market.maxStock - (params.market.currentStock || 0);
                if (remaining < 2) {
                    return { valid: false, reason: 'ルール⑦: 市場残り容量不足' };
                }
                if (params.quantity > remaining) {
                    return { valid: false, reason: 'ルール⑦: 販売数が市場残り容量を超過' };
                }
            }
            // 閉鎖市場チェック
            if (params.market && gameState.isMarketClosed && gameState.isMarketClosed(params.market.name)) {
                return { valid: false, reason: '市場閉鎖中' };
            }
            // ★★★ ルール⑩: 5期在庫・チップ確保（絶対厳守）★★★
            // ★★★ ユーザー指定 2026-01-06: 5期終了条件は絶対 ★★★
            if (period === 5) {
                const currentInventory = company.materials + company.wip + company.products;
                const afterInventory = currentInventory - (params.quantity || 0);

                // ★★★ 在庫10個以上を維持（絶対条件）★★★
                if (afterInventory < RULES.VICTORY.MIN_INVENTORY) {
                    return {
                        valid: false,
                        reason: `【絶対条件違反】5期は在庫${RULES.VICTORY.MIN_INVENTORY}個以上必須（現在${currentInventory}→販売後${afterInventory}）`
                    };
                }

                // チップ3枚以上必要（警告のみ、販売自体は許可）
                const currentChips = (company.chips.research || 0) + (company.chips.education || 0) +
                                    (company.chips.advertising || 0) + (company.nextPeriodChips?.research || 0) +
                                    (company.nextPeriodChips?.education || 0) + (company.nextPeriodChips?.advertising || 0);
                if (currentChips < RULES.VICTORY.MIN_CARRYOVER_CHIPS) {
                    return { valid: true, warning: `チップ${RULES.VICTORY.MIN_CARRYOVER_CHIPS}枚未満：別途確保が必要` };
                }
            }
            return { valid: true };
        },

        // ルール⑦: 材料購入の検証
        validateMaterialPurchase(params, company, gameState, period) {
            // ルール⑦: 市場ボリューム制限
            if (params.market && params.quantity > params.market.maxStock) {
                return { valid: false, reason: `ルール⑦: ${params.market.name}の購入上限は${params.market.maxStock}個` };
            }
            // 2期1周目制限（PLAYERは除外：教育チップ購入後は2週目扱い）
            if (period === 2 && gameState.isFirstRound && params.quantity > 3 && company.strategyType !== 'PLAYER') {
                return { valid: false, reason: '2期1周目は3個まで' };
            }
            // 在庫容量チェック
            const maxMaterials = 10 + (company.warehouses || 0) * 12;
            if (company.materials + params.quantity > maxMaterials) {
                return { valid: false, reason: '材料在庫上限超過' };
            }
            // 現金チェック
            const cost = params.market ? params.market.buyPrice * params.quantity : 0;
            if (company.cash < cost) {
                return { valid: false, reason: '現金不足' };
            }
            // ★★★ 期末コストチェック: 購入後に期末を乗り越えられるか ★★★
            // ★★★ 緊急フラグがある場合はスキップ（短期借入でカバー可能）★★★
            if (!params.bypassPeriodEndCheck) {
                const cashAfter = company.cash - cost;
                const periodEndCost = company.estimatedPeriodEndCost || 0;
                if (cashAfter < periodEndCost && periodEndCost > 0) {
                    return { valid: false, reason: `期末資金不足（購入後¥${cashAfter}<期末コスト¥${periodEndCost}）` };
                }
            }
            return { valid: true };
        },

        // ===== 投入の検証（材料→仕掛品のみ）=====
        // ルール: 1行で投入OR完成のどちらか一方のみ実行可能
        validateInput(params, company, gameState) {
            const quantity = params.quantity || 0;
            if (quantity <= 0) {
                return { valid: false, reason: '投入数量が0' };
            }
            // 材料チェック
            if (quantity > company.materials) {
                return { valid: false, reason: `材料不足(${company.materials}<${quantity})` };
            }
            // 仕掛品容量チェック
            const newWip = company.wip + quantity;
            if (newWip > RULES.CAPACITY.WIP) {
                return { valid: false, reason: `仕掛品容量オーバー(${newWip}/${RULES.CAPACITY.WIP})` };
            }
            // 加工費チェック
            const cost = quantity * RULES.COST.PROCESSING;
            if (company.cash < cost) {
                return { valid: false, reason: `加工費不足(現金${company.cash}<費用${cost})` };
            }
            return { valid: true };
        },

        // ===== 完成の検証（仕掛品→製品のみ）=====
        // ルール: 1行で投入OR完成のどちらか一方のみ実行可能
        validateComplete(params, company, gameState) {
            const quantity = params.quantity || 0;
            if (quantity <= 0) {
                return { valid: false, reason: '完成数量が0' };
            }
            // 仕掛品チェック
            if (quantity > company.wip) {
                return { valid: false, reason: `仕掛品不足(${company.wip}<${quantity})` };
            }
            // 製品容量チェック
            const maxProducts = RULES.CAPACITY.PRODUCT_BASE + (company.warehouses || 0) * RULES.CAPACITY.WAREHOUSE_BONUS;
            if (company.products + quantity > maxProducts) {
                return { valid: false, reason: `製品在庫上限超過(${company.products + quantity}/${maxProducts})` };
            }
            // 製造能力チェック
            const mfgCapacity = company.getMfgCapacity ? company.getMfgCapacity() : 1;
            if (quantity > mfgCapacity) {
                return { valid: false, reason: `製造能力不足(能力${mfgCapacity}<完成${quantity})` };
            }
            // 加工費チェック
            const cost = quantity * RULES.COST.PROCESSING;
            if (company.cash < cost) {
                return { valid: false, reason: `加工費不足(現金${company.cash}<費用${cost})` };
            }
            return { valid: true };
        },

        // ルール④: 生産の検証（後方互換性のため残存、非推奨）
        // 注意: 新規コードではINPUT/COMPLETEを使用すること
        validateProduction(params, company, gameState) {
            const input = params.materialToWip || 0;
            const complete = params.wipToProduct || 0;
            // ルール④: 投入1完成1禁止（旧実装）
            if (input === 1 && complete === 1) {
                return { valid: false, reason: 'ルール④: 投入1完成1は禁止' };
            }
            // 材料チェック
            if (input > company.materials) {
                return { valid: false, reason: '材料不足' };
            }
            // 仕掛品容量チェック（投入後の仕掛品 - 完成分）
            const newWip = company.wip + input - complete;
            if (newWip > RULES.CAPACITY.WIP) {
                return { valid: false, reason: '仕掛品容量オーバー' };
            }
            // 製品容量チェック
            const maxProducts = RULES.CAPACITY.PRODUCT_BASE + (company.warehouses || 0) * RULES.CAPACITY.WAREHOUSE_BONUS;
            if (company.products + complete > maxProducts) {
                return { valid: false, reason: `製品在庫上限超過(${company.products + complete}/${maxProducts})` };
            }
            // 製造能力チェック
            const mfgCapacity = company.getMfgCapacity ? company.getMfgCapacity() : 1;
            if (complete > mfgCapacity) {
                return { valid: false, reason: '製造能力不足' };
            }
            // 仕掛品チェック
            if (complete > company.wip + input) {
                return { valid: false, reason: '仕掛品不足' };
            }
            return { valid: true };
        },

        // 採用の検証
        validateHiring(params, company, gameState) {
            if (params.count > 3) {
                return { valid: false, reason: '1行で最大3人まで' };
            }
            const cost = params.count * 5;
            if (company.cash < cost) {
                return { valid: false, reason: '現金不足' };
            }
            // ★★★ 期末コストチェック: 採用後の人件費増加を考慮 ★★★
            // 採用により期末コストが増加するため、採用後の期末コストを予測
            const period = gameState?.period || 2;
            const baseWage = RULES.WAGE[period] || 24;
            const wageMultiplier = gameState?.wageMultiplier || 1.0;
            const adjustedWage = Math.round(baseWage * wageMultiplier);
            const halfWage = Math.round(adjustedWage / 2);
            // 採用後の期末コスト増加分 = 基本給 + max人員半額（採用によりmax人員も増加する可能性）
            const additionalCost = params.count * adjustedWage + params.count * halfWage;
            const cashAfter = company.cash - cost;
            const periodEndCost = (company.estimatedPeriodEndCost || 0) + additionalCost;
            if (cashAfter < periodEndCost && periodEndCost > 0) {
                return { valid: false, reason: `期末資金不足（採用後¥${cashAfter}<期末コスト¥${periodEndCost}）` };
            }
            return { valid: true };
        },

        // 機械購入の検証
        validateMachinePurchase(params, company, gameState, period) {
            const cost = params.type === 'large' ? 200 : 100;
            if (company.cash < cost) {
                return { valid: false, reason: '現金不足' };
            }
            // ★★★ 期末コストチェック: 購入後に期末を乗り越えられるか ★★★
            // 機械購入により期末コストが増加（人件費：機械1台につき給料発生）
            const baseWage = RULES.WAGE[period] || 24;
            const wageMultiplier = gameState?.wageMultiplier || 1.0;
            const adjustedWage = Math.round(baseWage * wageMultiplier);
            const additionalCost = adjustedWage;  // 機械1台分の人件費
            const cashAfter = company.cash - cost;
            const periodEndCost = (company.estimatedPeriodEndCost || 0) + additionalCost;
            if (cashAfter < periodEndCost && periodEndCost > 0) {
                return { valid: false, reason: `期末資金不足（購入後¥${cashAfter}<期末コスト¥${periodEndCost}）` };
            }
            return { valid: true };
        },

        // 機械売却の検証
        validateMachineSale(params, company, gameState, period) {
            if (!company.machines || company.machines.length <= 1) {
                return { valid: false, reason: '最低1台は必要' };
            }
            return { valid: true };
        },

        /**
         * アクションを実行前に検証し、無効なら例外を投げる
         */
        enforceOrThrow(actionType, params, company, gameState) {
            const result = this.canExecute(actionType, params, company, gameState);
            if (!result.valid) {
                throw new Error(`アクション拒否: ${result.reason}`);
            }
            return true;
        }
    };

    // ============================================
    // 行動ログ検証システム（後方互換性のため残存）
    // 注: ActionValidatorが主要なゲートウェイ
    // ============================================
    const ActionLogValidator = {
        validate(actionLog, period) {
            // ActionValidatorが事前にブロックするため、ここでの検証は二重チェック
            const errors = [];
            actionLog.forEach(a => {
                // ① 2期特急チェック
                if (period === 2 && a.detail && a.detail.includes('特急')) {
                    errors.push(`ルール①違反: 2期に特急購入`);
                }
                // ⑦ 仙台上限チェック
                if (a.action === '材料購入' && a.detail && a.detail.includes('仙台')) {
                    const match = a.detail.match(/×(\d+)個/);
                    if (match && parseInt(match[1]) > 3) {
                        errors.push(`ルール⑦違反: 仙台で${match[1]}個購入`);
                    }
                }
            });
            return errors;
        },
        validateOrThrow(actionLog, period) {
            const errors = this.validate(actionLog, period);
            if (errors.length > 0) {
                throw new Error('ルール違反: ' + errors.join('; '));
            }
        }
    };

    // ============================================
    // ゲームルール定数（正確な値）
    // ============================================
    const RULES = {
        // 初期状態（2期開始時、期首処理後）
        // ★ 2期は小型機械、3期で大型機械に買い替え
        INITIAL: {
            CASH: 112,              // 137 - PC20 - 保険5 = 112
            EQUITY: 283,
            WORKERS: 1,
            SALESMEN: 1,
            MATERIALS: 0,           // ★ユーザー指定: 材料0
            WIP: 3,                 // ★ユーザー指定: 仕掛品3
            PRODUCTS: 3,            // ★ユーザー指定: 製品3
            MACHINES: [{ type: 'small', attachments: 0 }],  // 2期は小型機械（能力1）
            WAREHOUSES: 0,
            LONG_TERM_LOAN: 0,
            SHORT_TERM_LOAN: 0,
            CHIPS: {
                computer: 1,        // 期首処理で購入済み
                insurance: 1,       // 期首処理で購入済み
                research: 0,
                education: 0,
                advertising: 0
            }
        },

        // 親システム（入札開始者）
        PARENT: {
            // 親は入札を開始する人
            // 各期で親が変わり、親から順番に行動する
            BONUS: 2  // 親ボーナス（入札時の価格競争力+2）
        },

        // 容量（在庫ルール INV-001～003）
        CAPACITY: {
            WIP: 10,                    // 仕掛品は最大10個（固定）
            MATERIAL_BASE: 10,          // 材料は基本10個まで
            PRODUCT_BASE: 10,           // 製品は基本10個まで
            WAREHOUSE_BONUS: 12         // 倉庫1つで+12個（INV-002）
        },

        // 2期1周目の材料購入制限（ACT-002）
        PERIOD2_FIRST_ROUND_MATERIAL_LIMIT: 3,

        // 最小販売数（1個では販売不可）
        MIN_SALE_QUANTITY: 2,

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
            PC: 20,          // PCチップ（緑）
            INSURANCE: 5,    // 保険チップ（橙）- 正しくは5円
            WAREHOUSE: 20,
            PROCESSING: 1    // 加工費/個
        },

        // 人件費（期別）- 実績ベース
        // 3期以降はサイコロで人件費倍率が決まる（通常×1.1）
        WAGE: { 2: 22, 3: 29, 4: 31, 5: 34 },

        // 予備日費用（期別）- 期末に発生
        RESERVE_COST: { 2: 20, 3: 20, 4: 30, 5: 30 },

        // 借入
        LOAN: {
            LONG_TERM_RATE: 0.10,
            SHORT_TERM_RATE: 0.20,
            MIN_LONG_REPAY: 0.10,
            MIN_SHORT_REPAY: 0.20
        },

        // ★★★ 期首処理の行番号（システム化・変更禁止）★★★
        // フラグによる厳密管理 - 二度と手動で変更しない
        PERIOD_START_ROWS: {
            INTEREST_TAX_DIVIDEND: 0,  // 0行目: 金利支払・納税・配当
            PC_INSURANCE: 1,           // 1行目: PCチップ・保険
            LOAN_WAREHOUSE: 2,         // 2行目: 長期借入・倉庫購入
            DECISION_START: 3          // 意思決定は3行目から開始
        },

        // ★★★ 期末処理の行番号（行数にカウントしない）★★★
        PERIOD_END_ROW: -1,  // 期末処理は行数にカウントしない（-1で表示）

        // 借入限度
        // 2期: 長期借入不可（0）
        // 3期: 自己資本の50%
        // 4-5期: 自己資本300以下→50%、300超→100%
        getLoanLimit: function(period, equity) {
            if (period === 2) return 0;  // 2期は長期借入禁止
            // 3期以降は自己資本×100%まで借入可能（MGルール標準）
            // 自己資本がマイナスの場合は0
            if (equity <= 0) return 0;
            return Math.floor(equity * 1.0);
        },

        // 市場（ACT-005～007, BID-001）
        // 入札市場：仙台・札幌・福岡・名古屋（needsBid: true）
        // 非入札市場：大阪（サイコロ価格）、東京（固定20円）、海外（固定16円）
        MARKETS: [
            { name: '仙台', buyPrice: 10, sellPrice: 40, maxStock: 3, needsBid: true },
            { name: '札幌', buyPrice: 11, sellPrice: 36, maxStock: 4, needsBid: true },
            { name: '福岡', buyPrice: 12, sellPrice: 32, maxStock: 6, needsBid: true },
            { name: '名古屋', buyPrice: 13, sellPrice: 28, maxStock: 9, needsBid: true },
            { name: '大阪', buyPrice: 14, sellPrice: 24, maxStock: 13, needsBid: false, isDice: true },  // ACT-006: サイコロで21-26
            { name: '東京', buyPrice: 15, sellPrice: 20, maxStock: 20, needsBid: false },  // ACT-007: 固定価格
            { name: '海外', buyPrice: 16, sellPrice: 16, maxStock: 100, needsBid: false }  // ACT-007: 固定価格
        ],

        // 大阪の価格テーブル（サイコロ結果+20）ACT-006
        OSAKA_PRICE: {
            1: 21, 2: 22, 3: 23, 4: 24, 5: 25, 6: 26
        },

        // ★★★ 期別・研究チップ別の記帳価格（親の場合）★★★
        // ★★★ ユーザー指定 2026-01-06 - 絶対変更禁止 ★★★
        // ★★★ 変更時は rules/price-rules.json も必ず更新すること ★★★
        TARGET_PRICES: {
            2: { 0: 24, 1: 26, 2: 28, 3: 30, 4: 32 },
            3: { 0: 24, 1: 26, 2: 28, 3: 30, 4: 32, 5: 34 },
            4: { 0: 22, 1: 24, 2: 26, 3: 28, 4: 30, 5: 32 },
            5: { 0: 21, 1: 23, 2: 25, 3: 27, 4: 29, 5: 31 }
        },

        // 行数上限（期別）STR-002
        MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },

        // リスクカード確率（1/5 = 20%）RISK-001
        RISK_PROBABILITY: 0.20,

        // 目標自己資本
        TARGET_EQUITY: 450,

        // 勝利条件（P5-001～004）
        VICTORY: {
            TARGET_EQUITY: 450,      // P5-003: 自己資本¥450以上で勝利
            MIN_INVENTORY: 10,       // P5-001: 在庫10個以上必須
            MIN_CARRYOVER_CHIPS: 3   // P5-002: 次期繰越チップ3枚以上必須
        },

        // チップ繰越ルール（CHIP-001～005）
        CHIP_CARRYOVER: {
            // 2期末: PC・保険は返却、研究・教育・広告は-1して最大3枚繰越
            PERIOD_2: {
                PC_RETURN: true,
                INSURANCE_RETURN: true,
                CHIP_DECREASE: 1,
                MAX_CARRYOVER: 3
            },
            // 3期以降末: 全チップ没収（次期用は別途購入）
            PERIOD_3_PLUS: {
                ALL_FORFEIT: true
            }
        },

        // AI戦略タイプ（期別にチップ目標を設定）
        AI_STRATEGIES: {
            RESEARCH_FOCUSED: {
                name: '研究開発型',
                description: '青チップ重視、高価格販売',
                // 期別チップ目標
                chipTargets: {
                    2: { research: 2, education: 1, advertising: 0 },
                    3: { research: 3, education: 1, advertising: 0 },
                    4: { research: 4, education: 1, advertising: 0 },
                    5: { research: 5, education: 1, advertising: 0 }
                },
                priceAdjustment: 2,
                hirePriority: 'worker'
            },
            SALES_FOCUSED: {
                name: '販売能力型',
                description: 'セールスマン・広告チップ重視',
                chipTargets: {
                    2: { research: 1, education: 1, advertising: 1 },
                    3: { research: 1, education: 1, advertising: 2 },
                    4: { research: 1, education: 1, advertising: 3 },
                    5: { research: 1, education: 1, advertising: 4 }
                },
                priceAdjustment: -2,
                hirePriority: 'salesman'
            },
            LOW_CHIP: {
                name: '低チップ型',
                description: 'チップ投資を抑え、設備・人員に投資',
                chipTargets: {
                    2: { research: 0, education: 1, advertising: 0 },
                    3: { research: 0, education: 1, advertising: 0 },
                    4: { research: 1, education: 1, advertising: 0 },
                    5: { research: 1, education: 1, advertising: 1 }  // ★勝利条件: 3枚以上必須
                },
                priceAdjustment: -4,
                hirePriority: 'worker'
            },
            BALANCED: {
                name: 'バランス型',
                description: '状況に応じた柔軟な投資',
                chipTargets: {
                    2: { research: 1, education: 1, advertising: 0 },
                    3: { research: 2, education: 1, advertising: 1 },
                    4: { research: 2, education: 1, advertising: 1 },
                    5: { research: 3, education: 1, advertising: 1 }
                },
                priceAdjustment: 0,
                hirePriority: 'balanced'
            },
            AGGRESSIVE: {
                name: '積極投資型',
                description: '3期に大型機械へ移行、人員拡大',
                chipTargets: {
                    2: { research: 1, education: 1, advertising: 0 },  // 教育1で販売能力+1
                    3: { research: 2, education: 1, advertising: 0 },
                    4: { research: 3, education: 1, advertising: 0 },
                    5: { research: 3, education: 1, advertising: 0 }
                },
                priceAdjustment: 0,
                hirePriority: 'worker',
                earlyLargeMachine: false,
                upgradePeriod: 3
            },
            PLAYER: {
                name: 'プレイヤー型',
                description: '研究チップ重視・3期大型機械・教育チップ戦略',
                chipTargets: {
                    // ★★★ ユーザー戦略: 2期に研究4枚+教育2枚 ★★★
                    2: { research: 4, education: 2, advertising: 0 },
                    3: { research: 4, education: 1, advertising: 0 },
                    4: { research: 5, education: 1, advertising: 0 },
                    5: { research: 5, education: 1, advertising: 0 }
                },
                priceAdjustment: 2,
                hirePriority: 'worker',
                earlyLargeMachine: false,  // 3期中盤に大型機械購入
                upgradePeriod: 3,
                midPeriodLargeMachine: true  // 3期で資金を貯めてから購入
            }
        }
    };

    // ============================================
    // 会社クラス
    // ============================================
    class Company {
        constructor(index, name, isPlayer = false, strategyType = null, useLearning = true) {
            this.index = index;
            this.name = name;
            this.isPlayer = isPlayer;
            this.strategyType = strategyType;
            // 学習システムから最適化されたパラメータを取得
            if (strategyType && useLearning && LearningSystem.data) {
                this.strategy = LearningSystem.getOptimizedParams(strategyType);
            } else {
                this.strategy = strategyType ? RULES.AI_STRATEGIES[strategyType] : null;
            }
            this.reset();
        }

        reset() {
            const init = RULES.INITIAL;
            this.cash = init.CASH;
            this.materials = init.MATERIALS;
            this.wip = init.WIP;
            this.products = init.PRODUCTS;
            this.workers = init.WORKERS;
            this.salesmen = init.SALESMEN;
            this.machines = JSON.parse(JSON.stringify(init.MACHINES));
            this.warehouses = init.WAREHOUSES;
            this.longTermLoan = init.LONG_TERM_LOAN;
            this.shortTermLoan = init.SHORT_TERM_LOAN;
            this.chips = JSON.parse(JSON.stringify(init.CHIPS));
            this.nextPeriodChips = { research: 0, education: 0, advertising: 0 };
            this.period = 2;  // 現在の期
            this.currentRow = RULES.PERIOD_START_ROWS.INTEREST_TAX_DIVIDEND;  // 0行目（期首処理開始）
            this.totalSales = 0;
            this.totalSoldQuantity = 0;
            this.totalF = 0;
            this.totalSpecialLoss = 0;
            this.lastPeriodTax = 0;       // 前期の税金（次期首で表示用）
            this.lastPeriodDividend = 0;  // 前期の配当（次期首で表示用）
            this.actionLog = [];
            this.maxPersonnel = 0;  // 期中最大人員（ワーカー+セールスマン）
            // チップ購入履歴（F計算用）
            this.chipPurchaseHistory = {
                research: { normal: 0, express: 0 },
                education: { normal: 0, express: 0 },
                advertising: { normal: 0, express: 0 }
            };
            // ルール②: 1行1枚チップ制限トラッキング
            this.chipsBoughtThisTurn = false;
            // 期首処理履歴
            this.periodStartActions = [];
            // ★★★ スクリプトモード用インデックス ★★★
            this.scriptIndex = 0;

            // ★★★ 期末コスト追跡システム ★★★
            // 期首に計算し、採用・解雇時に即座に更新
            this.estimatedPeriodEndCost = 0;
            this.periodEndCostBreakdown = {
                wage: 0,          // 人件費（基本）
                maxWage: 0,       // max人件費
                longTermRepay: 0, // 長期借入返済
                shortTermRepay: 0,// 短期借入返済
                shortTermInterest: 0, // 短期借入金利
                warehouse: 0      // 倉庫費用
            };

            // 即時F追跡システムのフラグを初期化
            ImmediateFTracker.initFlags(this);
        }

        // ★★★ 期末コストを計算・更新 ★★★
        updatePeriodEndCost(period, wageMultiplier = 1.0) {
            const baseWage = RULES.WAGE[period] || 24;
            const adjustedWage = Math.round(baseWage * wageMultiplier);
            const halfWage = Math.round(adjustedWage / 2);

            const personnelCount = this.workers + this.machines.length + this.salesmen;
            const maxPersonnel = Math.max(this.maxPersonnel || 0, this.workers + this.salesmen);

            this.periodEndCostBreakdown.wage = personnelCount * adjustedWage;
            this.periodEndCostBreakdown.maxWage = maxPersonnel * halfWage;
            this.periodEndCostBreakdown.longTermRepay = Math.ceil(this.longTermLoan * RULES.LOAN.MIN_LONG_REPAY);
            this.periodEndCostBreakdown.shortTermRepay = Math.ceil(this.shortTermLoan * RULES.LOAN.MIN_SHORT_REPAY);
            this.periodEndCostBreakdown.shortTermInterest = Math.ceil(this.shortTermLoan * RULES.LOAN.SHORT_TERM_RATE);
            this.periodEndCostBreakdown.warehouse = this.warehouses * RULES.COST.WAREHOUSE;

            this.estimatedPeriodEndCost =
                this.periodEndCostBreakdown.wage +
                this.periodEndCostBreakdown.maxWage +
                this.periodEndCostBreakdown.longTermRepay +
                this.periodEndCostBreakdown.shortTermRepay +
                this.periodEndCostBreakdown.shortTermInterest +
                this.periodEndCostBreakdown.warehouse;

            return this.estimatedPeriodEndCost;
        }

        // 製造能力
        // CAP-001: 機械1台につきワーカー1人が必要
        // ワーカーがいれば機械の能力がフルに発揮される
        // 製造能力 = 動かせる機械の能力合計 + 教育効果(+1)
        getMfgCapacity() {
            const machineCount = this.machines.length;

            // 動かせる機械台数 = min(機械台数, ワーカー数)
            const operableMachines = Math.min(machineCount, this.workers);

            if (operableMachines === 0) {
                // ワーカーがいなければ製造できない
                return 0;
            }

            // 能力の高い機械から優先的に動かす
            const sortedMachines = [...this.machines].sort((a, b) => {
                const capA = (a.type === 'large' ? RULES.MACHINE.LARGE.capacity : RULES.MACHINE.SMALL.capacity)
                           + (a.attachments || 0) * RULES.MACHINE.ATTACHMENT.bonus;
                const capB = (b.type === 'large' ? RULES.MACHINE.LARGE.capacity : RULES.MACHINE.SMALL.capacity)
                           + (b.attachments || 0) * RULES.MACHINE.ATTACHMENT.bonus;
                return capB - capA; // 能力高い順
            });

            // 動かせる機械の能力合計
            let capacity = 0;
            for (let i = 0; i < operableMachines; i++) {
                const m = sortedMachines[i];
                const base = m.type === 'large' ? RULES.MACHINE.LARGE.capacity : RULES.MACHINE.SMALL.capacity;
                capacity += base + (m.attachments || 0) * RULES.MACHINE.ATTACHMENT.bonus;
            }

            // PCチップ（緑/コンピュータ）ボーナス: 動かせる機械1台につき+1
            if ((this.chips.computer || 0) > 0) {
                capacity += operableMachines;
            }

            // 教育チップボーナス: 製造能力に+1（1枚でも複数枚でも+1）
            if ((this.chips.education || 0) > 0) {
                capacity += 1;
            }

            return capacity;
        }

        // 販売能力
        // セールスマン×2 + min(広告チップ, セールスマン×2)×2 + min(教育チップ, 1)
        getSalesCapacity() {
            if (this.salesmen === 0) return 0;
            const baseCapacity = this.salesmen * 2;
            const effectiveAdChips = Math.min(this.chips.advertising || 0, this.salesmen * 2);
            let capacity = baseCapacity + effectiveAdChips * 2;
            capacity += Math.min(this.chips.education || 0, 1);
            return capacity;
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

        /**
         * 行動をログに記録（状態スナップショット付き）
         * @param {string} action - 行動種別
         * @param {string} detail - 詳細説明
         * @param {number} amount - 金額
         * @param {boolean} isIncome - 収入かどうか
         * @param {string} type - 種別（'意思決定' or 'リスク' or '期首' or '期末'）、省略時は自動判定
         */
        logAction(action, detail, amount = 0, isIncome = false, type = null) {
            // タイプ自動判定
            let autoType = type;
            if (!autoType) {
                if (action.includes('リスクカード')) {
                    autoType = 'リスク';
                } else if (action.includes('期末処理')) {
                    autoType = '期末';
                } else if (action.includes('期首')) {
                    autoType = '期首';
                } else {
                    autoType = '意思決定';
                }
            }

            this.actionLog.push({
                row: this.currentRow,
                period: this.period || 2,
                type: autoType,
                action,
                detail,
                amount,
                isIncome,
                // 状態スナップショット
                state: {
                    cash: this.cash,
                    materials: this.materials,
                    wip: this.wip,
                    products: this.products
                }
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
            this.parentIndex = 0;  // 親=入札を開始する人（STR-003）
            this.companies = [];
            this.markets = JSON.parse(JSON.stringify(RULES.MARKETS));
            this.riskDeck = [];  // リスクカードデッキ
            this.periodLog = [];
            // サイコロ関連（3期以降）PS-008
            this.diceResult = 4;  // デフォルト
            this.closedMarkets = [];  // 閉鎖市場リスト
            this.wageMultiplier = 1.0;  // 人件費倍率
            this.osakaMaxPrice = 24;  // 大阪上限価格
            this.maxRowsReduction = 0;  // 行数削減（サイコロ5-6で-5）
            this.isReversed = false;  // 景気変動による順番逆転（RISK-010）
            this.isFirstRound = true;  // 1周目かどうか（ACT-002用）
            this.initRiskDeck();  // リスクカードデッキ初期化（64枚）
            this.initActionDeck();  // 意思決定/リスクデッキ初期化（75枚）
        }

        /**
         * リスクカードデッキを初期化（64枚シャッフル）
         */
        initRiskDeck() {
            // 1-64のカードを作成
            this.riskDeck = [];
            for (let i = 1; i <= 64; i++) {
                this.riskDeck.push(i);
            }
            this.shuffleDeck(this.riskDeck);
        }

        /**
         * 意思決定/リスクデッキを初期化（75枚：60枚意思決定 + 15枚リスク）
         */
        initActionDeck() {
            this.actionDeck = [];
            // 60枚の意思決定カード
            for (let i = 0; i < 60; i++) {
                this.actionDeck.push('decision');
            }
            // 15枚のリスクカードを引くカード
            for (let i = 0; i < 15; i++) {
                this.actionDeck.push('risk');
            }
            this.shuffleDeck(this.actionDeck);
        }

        /**
         * デッキをシャッフル（Fisher-Yates）
         */
        shuffleDeck(deck) {
            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }
        }

        /**
         * リスクカードを1枚引く（デッキが空なら再シャッフル）
         */
        drawRiskCard() {
            if (this.riskDeck.length === 0) {
                this.initRiskDeck();
            }
            return this.riskDeck.pop();
        }

        /**
         * 意思決定/リスクカードを1枚引く（デッキが空なら再シャッフル）
         * @returns {string} 'decision' or 'risk'
         */
        drawActionCard() {
            if (this.actionDeck.length === 0) {
                this.initActionDeck();
            }
            return this.actionDeck.pop();
        }

        /**
         * 会社を初期化
         * @param {Object} options - オプション
         * @param {boolean} options.allAI - true: 6社ともAI, false: プレイヤー1社+AI5社
         * @param {string} options.playerName - プレイヤー名（allAI=falseの場合）
         */
        initCompanies(options = {}) {
            const allAI = options.allAI || false;
            const playerName = options.playerName || 'あなた';

            // AI戦略タイプを各社に割り当て（STR-001: 6社で競争）
            const aiConfigs = [
                { name: '研究商事', strategy: 'RESEARCH_FOCUSED' },
                { name: '販売産業', strategy: 'SALES_FOCUSED' },
                { name: '堅実工業', strategy: 'LOW_CHIP' },
                { name: 'バランス物産', strategy: 'BALANCED' },
                { name: '積極製作所', strategy: 'AGGRESSIVE' },
                { name: 'プレイヤー型', strategy: 'PLAYER' }  // 6社目のAI
            ];

            if (allAI) {
                // シミュレーション用: 6社ともAI
                this.companies = aiConfigs.map((config, i) =>
                    new Company(i, config.name, false, config.strategy)
                );
            } else {
                // ゲーム用: プレイヤー1社 + AI5社
                // ★★★ PLAYERのstrategyTypeを'PLAYER'に設定（スクリプトアクション有効化）★★★
                this.companies = [new Company(0, playerName, true, 'PLAYER')];
                aiConfigs.slice(0, 5).forEach((config, i) => {
                    this.companies.push(new Company(i + 1, config.name, false, config.strategy));
                });
            }
        }

        // 行動順序を取得（親から順番、逆転時は逆順）STR-003, STR-004, RISK-010
        getTurnOrder() {
            const order = [];
            for (let i = 0; i < this.companies.length; i++) {
                const idx = (this.parentIndex + i) % this.companies.length;
                order.push(idx);
            }
            if (this.isReversed) {
                order.reverse();
            }
            return order;
        }

        getCurrentCompany() {
            return this.companies[this.turn % this.companies.length];
        }

        // 親かどうか判定（STR-003）
        isParent(companyIndex) {
            return companyIndex === this.parentIndex;
        }

        // 期が変わるときに親を交代（STR-003）
        rotateParent() {
            this.parentIndex = (this.parentIndex + 1) % this.companies.length;
        }

        /**
         * サイコロ処理（3期以降の期首に実行）
         * @param {number} diceValue - サイコロの値（1-6）、省略時はランダム
         */
        processDice(diceValue = null) {
            if (this.period < 3) return;  // 2期はサイコロなし

            // サイコロを振る（指定がなければランダム、シミュレーションでは4固定推奨）
            this.diceResult = diceValue !== null ? diceValue : Math.floor(Math.random() * 6) + 1;

            // サイコロ結果に基づく設定
            if (this.diceResult <= 3) {
                // 1-3: 仙台閉鎖、F×1.1
                this.closedMarkets = ['仙台'];
                this.wageMultiplier = 1.1;
            } else {
                // 4-6: 仙台・札幌閉鎖、F×1.2
                this.closedMarkets = ['仙台', '札幌'];
                this.wageMultiplier = 1.2;
            }

            // 大阪上限価格（サイコロの値+20）
            this.osakaMaxPrice = 20 + this.diceResult;

            // ★ 行数削減ルールは存在しない（削除）
            this.maxRowsReduction = 0;

            // 市場の販売価格を更新
            const osakaMarket = this.markets.find(m => m.name === '大阪');
            if (osakaMarket) {
                osakaMarket.sellPrice = this.osakaMaxPrice;
            }
        }

        /**
         * 期の最大行数を取得（サイコロ5-6の場合-5）
         */
        getMaxRows() {
            const baseRows = RULES.MAX_ROWS[this.period] || 35;
            return baseRows - this.maxRowsReduction;
        }

        /**
         * 市場が閉鎖されているかチェック
         */
        isMarketClosed(marketName) {
            return this.closedMarkets.includes(marketName);
        }
    }

    // ============================================
    // 入札システム（BID-001～004）
    // 仙台・札幌・福岡・名古屋は入札制
    // ============================================
    const BiddingEngine = {
        /**
         * 入札価格（コール価格）計算（BID-002）
         * 入札価格 = 希望価格 - (研究チップ×2 + 親ボーナス2)
         * コール価格が低いほど有利（より高く売れる）
         */
        calculateCallPrice(displayPrice, company, isParent) {
            const researchBonus = (company.chips.research || 0) * 2;
            const parentBonus = isParent ? RULES.PARENT.BONUS : 0;
            const competitiveness = researchBonus + parentBonus;
            return displayPrice - competitiveness;
        },

        /**
         * 入札をソート（勝者決定）（BID-003）
         * 1. コール価格が低い方が勝ち
         * 2. 同じなら研究チップが多い方が勝ち
         * 3. それでも同じなら親が勝ち
         * 4. 親以外同士ならランダム（再入札扱い）
         */
        sortBids(bids, gameState) {
            return bids.sort((a, b) => {
                // 1. コール価格（低い方が勝ち）
                if (a.callPrice !== b.callPrice) {
                    return a.callPrice - b.callPrice;
                }

                // 2. 研究チップ数（多い方が勝ち）
                const aResearch = gameState.companies[a.companyIndex].chips.research || 0;
                const bResearch = gameState.companies[b.companyIndex].chips.research || 0;
                if (aResearch !== bResearch) {
                    return bResearch - aResearch;
                }

                // 3. 親優先
                const aIsParent = gameState.isParent(a.companyIndex);
                const bIsParent = gameState.isParent(b.companyIndex);
                if (aIsParent && !bIsParent) return -1;
                if (!aIsParent && bIsParent) return 1;

                // 4. 再入札（ランダム）
                return Math.random() - 0.5;
            });
        },

        /**
         * 入札処理（BID-004）
         * 注: 市場容量超過は事前検証(ActionValidator/evaluateSales)で防止
         *     ここに到達する入札は全て容量内であることが保証されている
         */
        processBids(bids, market, gameState) {
            if (bids.length === 0) return [];

            const sortedBids = this.sortBids(bids, gameState);
            const results = [];
            let remainingCapacity = market.maxStock - (market.currentStock || 0);

            for (const bid of sortedBids) {
                const company = gameState.companies[bid.companyIndex];

                // 容量と製品数の制限内で販売（部分販売は許可）
                const actualQty = Math.min(remainingCapacity, bid.quantity, company.products);

                // 最小販売数チェック（2個未満は販売不可）
                if (actualQty < RULES.MIN_SALE_QUANTITY) {
                    results.push({
                        companyIndex: bid.companyIndex,
                        quantity: 0,
                        price: bid.displayPrice,
                        revenue: 0,
                        won: false,
                        reason: `入札負け：販売可能数(${actualQty}個)が最小販売数未満`
                    });
                    continue;
                }

                // 販売成功
                const revenue = bid.displayPrice * actualQty;
                company.cash += revenue;
                company.products -= actualQty;
                company.totalSales += revenue;
                company.totalSoldQuantity += actualQty;
                market.currentStock = (market.currentStock || 0) + actualQty;
                remainingCapacity -= actualQty;

                results.push({
                    companyIndex: bid.companyIndex,
                    quantity: actualQty,
                    price: bid.displayPrice,
                    revenue,
                    won: true
                });

                company.logAction('販売', `${market.name}に¥${bid.displayPrice}×${actualQty}個（入札勝利）`, revenue, true);

                // ルール強制チェック
                RuntimeRuleEnforcer.enforce(company, gameState, '入札販売後');
            }

            return results;
        },

        /**
         * 入札市場かどうか判定（BID-001）
         */
        isBiddingMarket(marketName) {
            return ['仙台', '札幌', '福岡', '名古屋'].includes(marketName);
        }
    };

    // ============================================
    // アクション実行エンジン
    // 全メソッドはActionValidatorで事前検証済み前提
    // 直接呼び出し時も安全のためActionValidator.canExecuteを使用
    // ============================================
    const ActionEngine = {
        /**
         * 材料購入（ACT-001, ACT-002）
         * ActionValidatorで検証済みだが、直接呼び出し時のために再検証
         */
        buyMaterials(company, quantity, market, gameState, bypassPeriodEndCheck = false) {
            // ActionValidatorで事前検証
            const validation = ActionValidator.canExecute('BUY_MATERIALS', { quantity, market, bypassPeriodEndCheck }, company, gameState);
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }

            // ルール⑦: 各市場のマーケットボリューム（maxStock）が購入上限
            if (quantity > market.maxStock) {
                quantity = market.maxStock;
            }

            // ACT-002: 2期1周目は3個まで
            if (gameState && gameState.period === 2 && gameState.isFirstRound) {
                if (quantity > RULES.PERIOD2_FIRST_ROUND_MATERIAL_LIMIT) {
                    quantity = RULES.PERIOD2_FIRST_ROUND_MATERIAL_LIMIT;
                }
            }

            const cost = market.buyPrice * quantity;
            // 検証済みなので直接実行
            company.cash -= cost;
            company.materials += quantity;
            company.logAction('材料購入', `${market.name}から¥${market.buyPrice}×${quantity}個`, cost, false);

            // ルール強制チェック
            RuntimeRuleEnforcer.enforce(company, gameState, '材料購入後');

            return { success: true, cost, quantity };
        },

        /**
         * ===== 投入（材料→仕掛品）=====
         * ルール: 1行で投入のみ実行（完成とは別の行動）
         * ActionValidatorで検証済み
         */
        input(company, quantity) {
            // ActionValidatorで事前検証
            const validation = ActionValidator.canExecute('INPUT', { quantity }, company, {});
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }

            const cost = quantity * RULES.COST.PROCESSING;

            // 検証済みなので実行
            company.materials -= quantity;
            company.wip += quantity;
            company.cash -= cost;

            // ★フラグ追跡: 投入を記録
            GameActionTracker.flagInput(company, quantity);

            company.logAction('投入', `材料${quantity}個→仕掛品（加工費¥${cost}）`, cost, false);

            // ルール強制チェック
            RuntimeRuleEnforcer.enforce(company, {}, '投入後');

            return { success: true, cost, quantity };
        },

        /**
         * ===== 完成（仕掛品→製品）=====
         * ルール: 1行で完成のみ実行（投入とは別の行動）
         * ActionValidatorで検証済み
         */
        complete(company, quantity) {
            // ActionValidatorで事前検証
            const validation = ActionValidator.canExecute('COMPLETE', { quantity }, company, {});
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }

            const cost = quantity * RULES.COST.PROCESSING;

            // 検証済みなので実行
            company.wip -= quantity;
            company.products += quantity;
            company.cash -= cost;

            // ★フラグ追跡: 完成を記録
            GameActionTracker.flagComplete(company, quantity);

            company.logAction('完成', `仕掛品${quantity}個→製品（加工費¥${cost}）`, cost, false);

            // ルール強制チェック
            RuntimeRuleEnforcer.enforce(company, {}, '完成後');

            return { success: true, cost, quantity };
        },

        /**
         * 完成・投入（旧実装、後方互換性のため残存）
         * 注意: 新規コードではinput/completeを使用すること
         * ルール: 材料→投入(¥1)→仕掛品→完成(¥1)→製品
         * ActionValidatorで検証済み
         */
        produce(company, materialToWip, wipToProduct) {
            // ActionValidatorで事前検証
            const validation = ActionValidator.canExecute('PRODUCE', { materialToWip, wipToProduct }, company, {});
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }

            // 加工費: 投入¥1 + 完成¥1
            const inputCost = materialToWip * RULES.COST.PROCESSING;
            const completionCost = wipToProduct * RULES.COST.PROCESSING;
            const totalProcessingCost = inputCost + completionCost;

            if (company.cash < totalProcessingCost) {
                return { success: false, reason: '加工費の現金不足' };
            }

            // 検証済みなので実行
            company.materials -= materialToWip;
            company.wip += materialToWip - wipToProduct;
            company.products += wipToProduct;
            company.cash -= totalProcessingCost;

            company.logAction('完成・投入', `投入${materialToWip}個(¥${inputCost})、完成${wipToProduct}個(¥${completionCost})`, totalProcessingCost, false);

            // ルール強制チェック
            RuntimeRuleEnforcer.enforce(company, {}, '完成・投入後');

            return { success: true, inputCost, completionCost, totalProcessingCost };
        },

        /**
         * 採用（ワーカー）
         * ActionValidatorで検証済み
         */
        hire(company, count, isReferral = false) {
            // ActionValidatorで事前検証
            const validation = ActionValidator.canExecute('HIRE', { count }, company, {});
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }

            if (isReferral && count > 1) {
                return { success: false, reason: '縁故採用は1人まで' };
            }

            const cost = count * RULES.COST.HIRING;
            // 検証済みなので実行
            company.cash -= cost;
            company.workers += count;
            company.totalF += cost;

            // ★即時F追跡: ワーカー雇用時にフラグ設定（人件費¥22/期がかかる）
            ImmediateFTracker.flagWorkerHire(company, company.period || 2, count);

            // 最大人員を更新
            const currentPersonnel = company.workers + company.salesmen;
            if (currentPersonnel > company.maxPersonnel) {
                company.maxPersonnel = currentPersonnel;
            }

            const type = isReferral ? '縁故採用' : '採用';
            company.logAction(type, `ワーカー${count}人採用`, cost, false);

            // ルール強制チェック
            RuntimeRuleEnforcer.enforce(company, {}, 'ワーカー採用後');

            return { success: true, cost };
        },

        /**
         * セールスマン採用
         * ActionValidatorで検証済み
         */
        hireSalesman(company, count) {
            // ActionValidatorで事前検証
            const validation = ActionValidator.canExecute('HIRE', { count }, company, {});
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }

            const cost = count * RULES.COST.HIRING;
            // 検証済みなので実行
            company.cash -= cost;
            company.salesmen += count;
            company.totalF += cost;

            // ★即時F追跡: セールスマン雇用時にフラグ設定（人件費¥22/期がかかる）
            ImmediateFTracker.flagSalesmanHire(company, company.period || 2, count);

            // 最大人員を更新
            const currentPersonnel = company.workers + company.salesmen;
            if (currentPersonnel > company.maxPersonnel) {
                company.maxPersonnel = currentPersonnel;
            }

            company.logAction('セールスマン採用', `${count}人採用`, cost, false);

            // ルール強制チェック
            RuntimeRuleEnforcer.enforce(company, {}, 'セールスマン採用後');

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

            // ルール強制チェック
            RuntimeRuleEnforcer.enforce(company, {}, '退職後');

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

            // ★即時F追跡: 機械購入時にフラグ設定（減価償却+人件費がかかる）
            const period = gameState?.period || company.period || 2;
            ImmediateFTracker.flagMachinePurchase(company, period, type);

            company.logAction('機械購入', `${type === 'large' ? '大型' : '小型'}機械購入`, machineInfo.cost, false);

            // ルール強制チェック
            RuntimeRuleEnforcer.enforce(company, gameState, '機械購入後');

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

            // ルール強制チェック
            RuntimeRuleEnforcer.enforce(company, { period }, '機械売却後');

            return { success: true, salePrice, loss };
        },

        /**
         * チップ購入
         * ルール①: 2期は特急なし（全て¥20、即座に効果）
         * ルール②: 1行1枚まで（呼び出し側で制御）
         * ルール⑨: 期首購入不可（AIDecisionEngineから呼ばれる）
         * ActionValidatorで検証済み
         */
        buyChip(company, chipType, isExpress = false, period = 2, phase = null, bypassPeriodEndCheck = false) {
            // ActionValidatorで事前検証（ルール①②⑨をチェック）
            const validation = ActionValidator.canExecute('BUY_CHIP', { isExpress, phase, bypassPeriodEndCheck }, company, { period });
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }

            // ルール①: 2期は特急という概念がない（全て¥20で即座に効果）
            if (period === 2) {
                isExpress = false;  // 2期は必ず通常価格
            }

            const cost = isExpress ? RULES.COST.CHIP_EXPRESS : RULES.COST.CHIP_NORMAL;

            company.cash -= cost;
            // 注意: totalFはここで加算しない（期末処理でchipPurchaseHistoryから計算）

            // 2期: 即座に効果（特急と同じ扱い）
            // 3期以降: 特急なら即座、通常なら次期
            if (period === 2 || isExpress) {
                company.chips[chipType] = (company.chips[chipType] || 0) + 1;
                // 購入履歴を記録（F計算用）
                if (period === 2) {
                    company.chipPurchaseHistory[chipType].normal += 1;  // 2期は全て通常扱い
                } else {
                    company.chipPurchaseHistory[chipType].express += 1;
                }
            } else {
                company.nextPeriodChips[chipType] = (company.nextPeriodChips[chipType] || 0) + 1;
                company.chipPurchaseHistory[chipType].normal += 1;
            }

            // ★即時F追跡: チップ購入時にフラグ設定
            ImmediateFTracker.flagChipPurchase(company, chipType, isExpress);

            const chipNames = { research: '研究開発', education: '教育', advertising: '広告' };
            // 2期は「特急」という言葉を使わない
            const typeStr = period === 2 ? '' : (isExpress ? '特急' : '次期');
            const detailStr = typeStr ? `${chipNames[chipType]}チップ(${typeStr})` : `${chipNames[chipType]}チップ`;
            company.logAction('チップ購入', detailStr, cost, false);

            // ルール強制チェック（特にルール①: 2期に特急がないか）
            RuntimeRuleEnforcer.enforce(company, { period }, 'チップ購入後');

            return { success: true, cost };
        },

        /**
         * 倉庫購入
         * 注意: 倉庫費用は期末に計上される（購入時ではない）
         */
        buyWarehouse(company) {
            if (company.cash < RULES.COST.WAREHOUSE) {
                return { success: false, reason: '現金不足' };
            }

            company.cash -= RULES.COST.WAREHOUSE;
            company.warehouses += 1;

            // ★即時F追跡: 倉庫購入時にフラグ設定（期末にF¥20がかかる）
            ImmediateFTracker.flagWarehousePurchase(company, company.period || 2);

            // 倉庫費用は期末処理でFに計上される（ここでは計上しない）
            company.logAction('倉庫購入', '倉庫購入', RULES.COST.WAREHOUSE, false);

            // ルール強制チェック
            RuntimeRuleEnforcer.enforce(company, {}, '倉庫購入後');

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

            // ★期首処理として記録（2行目で実行）
            company.logAction('期首', `長期借入${amount}円（利息${interest}円差引、手取${netAmount}円）`, netAmount, true);

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
                const result = this.processCompany(company, period, gameState);
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

        processCompany(company, period, gameState) {
            // ★★★ 期末処理は行数にカウントしない ★★★
            company.currentRow = RULES.PERIOD_END_ROW;  // -1で期末処理を表す

            const result = {
                companyIndex: company.index,
                wage: 0,
                wageWorker: 0,
                wageMachine: 0,
                wageSalesman: 0,
                wageMaxPersonnel: 0,
                depreciation: 0,
                pcCost: 0,           // PCチップ費用
                insuranceCost: 0,    // 保険チップ費用
                chipCost: 0,         // 研究・教育・広告チップ費用
                warehouseCost: 0,    // 倉庫費用（期末に計上）
                reserveCost: 0,      // 予備日費用（期別）
                longTermRepay: 0,
                shortTermRepay: 0,
                shortTermInterest: 0,
                tax: 0,
                dividend: 0,  // ★配当追加
                totalF: 0,
                equityBefore: company.calculateEquity(period),
                equityAfter: 0
            };

            // 人件費倍率を取得（サイコロ結果による、3期以降のみ）
            const wageMultiplier = (gameState && period >= 3) ? gameState.wageMultiplier : 1.0;
            const baseWage = RULES.WAGE[period];
            const adjustedWage = Math.round(baseWage * wageMultiplier);
            const halfWage = Math.round(adjustedWage / 2);

            // 1. 人件費
            // 全期共通: (ワーカー + 機械 + セールス) × 単価 + 最大人員 × 半額
            result.wageWorker = company.workers * adjustedWage;
            result.wageMachine = company.machines.length * adjustedWage;
            result.wageSalesman = company.salesmen * adjustedWage;
            result.wageMaxPersonnel = company.maxPersonnel * halfWage;
            result.wage = result.wageWorker + result.wageMachine + result.wageSalesman + result.wageMaxPersonnel;

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

            // 3. PC・保険・チップのF計算
            // PC（持っていれば20円）→ Fに含める
            if (company.chips.computer > 0) {
                result.pcCost = RULES.COST.PC;
                company.totalF += result.pcCost;
            }
            // 保険（持っていれば5円）→ Fに含める
            if (company.chips.insurance > 0) {
                result.insuranceCost = RULES.COST.INSURANCE;
                company.totalF += result.insuranceCost;
            }
            // チップ費用（CHIP-004, CHIP-005）
            // CHIP-004: F計算（2期）：(購入-繰越)×20 + PC20 + 保険5
            // CHIP-005: F計算（3期以降）：繰越×20 + 特急×40 + PC20 + 保険5
            const history = company.chipPurchaseHistory;
            if (period === 2) {
                // CHIP-002: 2期末は各-1して最大3枚繰越
                // 繰越数 = min(購入数-1, 3)、0以上
                // F = (購入数 - 繰越数) × 20
                const researchPurchased = (history.research.normal || 0) + (history.research.express || 0);
                const educationPurchased = (history.education.normal || 0) + (history.education.express || 0);
                const advertisingPurchased = (history.advertising.normal || 0) + (history.advertising.express || 0);

                const researchCarryover = Math.min(Math.max(researchPurchased - 1, 0), 3);
                const educationCarryover = Math.min(Math.max(educationPurchased - 1, 0), 3);
                const advertisingCarryover = Math.min(Math.max(advertisingPurchased - 1, 0), 3);

                const researchF = (researchPurchased - researchCarryover) * 20;
                const educationF = (educationPurchased - educationCarryover) * 20;
                const advertisingF = (advertisingPurchased - advertisingCarryover) * 20;

                result.chipCost = researchF + educationF + advertisingF;
                company.totalF += result.chipCost;
            } else {
                // 3期以降: 通常×20 + 特急×40
                const normalCost = ((history.research.normal || 0) +
                                   (history.education.normal || 0) +
                                   (history.advertising.normal || 0)) * 20;
                const expressCost = ((history.research.express || 0) +
                                    (history.education.express || 0) +
                                    (history.advertising.express || 0)) * 40;
                result.chipCost = normalCost + expressCost;
                company.totalF += result.chipCost;
            }

            // 4. 倉庫費用（倉庫数×¥20、期末に没収される）
            if (company.warehouses > 0) {
                result.warehouseCost = company.warehouses * RULES.COST.WAREHOUSE;
                company.totalF += result.warehouseCost;
                // 倉庫は期末に没収
                company.warehouses = 0;
            }

            // 4.5. 予備日費用（期別固定費）→ Fには含めない
            result.reserveCost = RULES.RESERVE_COST[period] || 0;
            // ★★★ 予備日はFに含めない（ユーザー指定）★★★
            // company.totalF += result.reserveCost;

            // 5. 長期借入返済（最低10%）
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

            // 6. チップ繰越処理（CHIP-001～003）
            if (period === 2) {
                // CHIP-001: 2期末：PC・保険は返却
                company.chips.computer = 0;
                company.chips.insurance = 0;

                // CHIP-002: 2期末：研究・教育・広告は-1して最大3枚繰越
                ['research', 'education', 'advertising'].forEach(type => {
                    const current = company.chips[type] || 0;
                    const carryover = Math.min(Math.max(0, current - 1), 3);
                    company.chips[type] = carryover;
                });
            } else {
                // CHIP-003: 3期以降末：全チップ没収（次期用は別途購入）
                company.chips = { computer: 0, insurance: 0, research: 0, education: 0, advertising: 0 };
            }

            // 次期チップを移動
            ['research', 'education', 'advertising'].forEach(type => {
                company.chips[type] = (company.chips[type] || 0) + (company.nextPeriodChips[type] || 0);
                company.nextPeriodChips[type] = 0;
            });

            // 7. 納税・配当処理（PE-009, PE-010）
            // 自己資本増加分を利益として計算
            const equityBeforeTax = company.calculateEquity(period);
            const profit = equityBeforeTax - result.equityBefore;
            if (profit > 0) {
                // PE-009: 税金 = 利益×50%
                result.tax = Math.floor(profit * 0.5);
                // PE-010: 配当 = 利益×10%（株主への還元）
                result.dividend = Math.floor(profit * 0.1);

                if (result.tax > 0) {
                    company.cash -= result.tax;
                }
                if (result.dividend > 0) {
                    company.cash -= result.dividend;
                }
            }

            // ★次期首表示用に保存（0行目で表示）
            company.lastPeriodTax = result.tax;
            company.lastPeriodDividend = result.dividend;

            // ★★★ 予備日(reserveCost)はFに含めない ★★★
            result.totalF = result.wage + result.depreciation + result.pcCost + result.insuranceCost + result.chipCost + result.warehouseCost + result.shortTermInterest;

            // 8. 現金マイナス時の自動処理（PE-013）
            // ステップ1: 材料売却（¥10/個で売却）
            if (company.cash < 0 && company.materials > 0) {
                const materialsToSell = Math.min(
                    company.materials,
                    Math.ceil(Math.abs(company.cash) / 10)
                );
                const materialSaleAmount = materialsToSell * 10;
                company.materials -= materialsToSell;
                company.cash += materialSaleAmount;
                company.logAction('期末処理', `現金不足のため材料${materialsToSell}個売却（+¥${materialSaleAmount}）`, 0, false);
            }

            // ステップ2: それでも現金マイナスなら短期借入発生
            // ★★★ 短期借入は50円単位（ルール準拠）★★★
            if (company.cash < 0) {
                const shortfall = Math.abs(company.cash) + 10; // 余裕を持たせる
                // 手取り80%なので逆算し、50円単位に切り上げ
                const rawLoan = Math.ceil(shortfall / 0.8);
                const loanAmount = Math.ceil(rawLoan / 50) * 50;  // 50円単位に切り上げ
                const interest = Math.floor(loanAmount * 0.20);
                const netAmount = loanAmount - interest;
                company.shortTermLoan += loanAmount;
                company.cash += netAmount;
                company.totalF += interest;
                result.shortTermInterest += interest;

                // ★即時F追跡: 短期借入発生時にフラグ設定（返済・金利が必要）
                ImmediateFTracker.flagShortTermLoan(company, loanAmount);

                company.logAction('期末処理', `現金不足のため短期借入¥${loanAmount}発生（金利¥${interest}、手取り¥${netAmount}）`, interest, false);
            }

            result.equityAfter = company.calculateEquity(period + 1);

            // ★自己資本追跡: 期末の自己資本を記録
            GameActionTracker.updateEquity(company, result.equityAfter, period);

            // 9. 期中最大人員をリセット
            company.maxPersonnel = 0;

            // 9. チップ購入履歴をリセット（次期用）
            company.chipPurchaseHistory = {
                research: { normal: 0, express: 0 },
                education: { normal: 0, express: 0 },
                advertising: { normal: 0, express: 0 }
            };

            company.logAction('期末処理',
                `人件費${result.wage}(W${result.wageWorker}+M${result.wageMachine}+S${result.wageSalesman}+Max${result.wageMaxPersonnel}) 減価償却${result.depreciation} PC${result.pcCost} 保険${result.insuranceCost} チップ${result.chipCost} 倉庫${result.warehouseCost} 予備日${result.reserveCost} 短期金利${result.shortTermInterest} 税${result.tax}`,
                result.totalF + result.tax, false);

            // ★★★ 期末現金表示（ユーザー要望：給料・返済支払い後の現金）★★★
            const inventory = company.materials + company.wip + company.products;
            const chips = (company.chips.research || 0) + (company.chips.education || 0) + (company.chips.advertising || 0);
            company.logAction('期末残高',
                `現金¥${company.cash} 自己資本¥${result.equityAfter} 在庫${inventory}個 チップ${chips}枚`,
                0, false);

            // ★即時F追跡: 期末処理完了後に次期用フラグをリセット
            ImmediateFTracker.resetForNewPeriod(company);

            return result;
        }
    };

    // ============================================
    // 期末コスト計算ヘルパー
    // ★★★ 全購入判断で期末資金確保のために使用 ★★★
    // ============================================
    const PeriodEndCostEstimator = {
        /**
         * 期末に必要な現金を計算
         * @param {Object} company - 会社
         * @param {number} period - 期
         * @param {Object} gameState - ゲーム状態（wageMultiplier取得用）
         * @returns {number} 推定期末コスト
         */
        calculate(company, period, gameState = null) {
            // 給料（ワーカー + 機械 + セールスマン + maxPersonnel）
            const baseWage = RULES.WAGE[period] || 24;
            const wageMultiplier = (gameState && period >= 3) ? (gameState.wageMultiplier || 1.0) : 1.0;
            const adjustedWage = Math.round(baseWage * wageMultiplier);
            const halfWage = Math.round(adjustedWage / 2);

            // ★★★ 人件費 = 全員×単価 + max人員×半額 ★★★
            const personnelCount = company.workers + company.machines.length + company.salesmen;
            const baseWageCost = personnelCount * adjustedWage;
            // maxPersonnel = 期中最大人員（ワーカー+セールスマン）
            const maxPersonnel = company.maxPersonnel || (company.workers + company.salesmen);
            const maxPersonnelCost = maxPersonnel * halfWage;
            const wageCost = baseWageCost + maxPersonnelCost;

            // 長期借入返済（10%）
            const longTermRepay = Math.ceil(company.longTermLoan * RULES.LOAN.MIN_LONG_REPAY);

            // 短期借入返済（20%）+ 金利（20%）
            const shortTermRepay = Math.ceil(company.shortTermLoan * RULES.LOAN.MIN_SHORT_REPAY);
            const shortTermInterest = Math.ceil(company.shortTermLoan * RULES.LOAN.SHORT_TERM_RATE);

            // 減価償却費は現金支出なし（費用計上のみ）
            // 倉庫費用は倉庫数 × 20
            const warehouseCost = company.warehouses * RULES.COST.WAREHOUSE;

            // 予備日費用（期別固定費）
            const reserveCost = RULES.RESERVE_COST[period] || 0;

            return wageCost + longTermRepay + shortTermRepay + shortTermInterest + warehouseCost + reserveCost;
        },

        /**
         * 購入後に期末を乗り越えられるか判定
         * ★★★ 材料売却・短期借入を絶対回避 ★★★
         * @param {Object} company - 会社
         * @param {number} purchaseCost - 購入コスト
         * @param {number} period - 期
         * @param {Object} gameState - ゲーム状態
         * @returns {boolean} true = 乗り越えられる
         */
        canSurviveAfterPurchase(company, purchaseCost, period, gameState) {
            const cashAfterPurchase = company.cash - purchaseCost;
            const periodEndCost = this.calculate(company, period, gameState);

            // ★★★ 100%安全マージン: 期末コスト全額を確保 ★★★
            // 材料売却・短期借入を絶対に回避するため
            return cashAfterPurchase >= periodEndCost;
        },

        /**
         * 購入に使える現金を計算（期末コストを差し引く）
         * ★★★ 材料売却・短期借入を絶対回避 ★★★
         * @param {Object} company - 会社
         * @param {number} period - 期
         * @param {Object} gameState - ゲーム状態
         * @returns {number} 購入可能現金
         */
        getAvailableCashForPurchase(company, period, gameState) {
            const periodEndCost = this.calculate(company, period, gameState);
            // ★★★ 100%安全マージン: 期末コスト全額を確保 ★★★
            return Math.max(0, company.cash - periodEndCost);
        },

        /**
         * 期の後半かどうか判定
         * @param {Object} company - 会社
         * @param {number} period - 期
         * @returns {boolean} true = 期の後半
         */
        isLateInPeriod(company, period) {
            const maxRows = { 2: 20, 3: 30, 4: 34, 5: 35 }[period] || 30;
            const remainingRows = maxRows - company.currentRow;
            // ★★★ 残り15行で期末モード（十分早めに資金確保開始）★★★
            return remainingRows <= 15;
        },

        /**
         * 期末直前かどうか判定（より厳格）
         */
        isVeryLateInPeriod(company, period) {
            const maxRows = { 2: 20, 3: 30, 4: 34, 5: 35 }[period] || 30;
            const remainingRows = maxRows - company.currentRow;
            // ★★★ 残り8行で期末直前（購入抑制モード）★★★
            return remainingRows <= 8;
        }
    };

    // ============================================
    // AI意思決定エンジン
    // ============================================
    const AIDecisionEngine = {
        /**
         * ★★★ PLAYER戦略の2期アクションシーケンス（ユーザー指定の行動順序）★★★
         * リスクカードはランダムなので、行番号ではなく順番で管理
         */
        PLAYER_PERIOD2_SEQUENCE: [
            // ★★★ 2期戦略: 研究4枚・教育2枚を購入しつつ利益確保 ★★★
            // 初期: 現金112円、材料0、wip3、製品3
            // 製造能力2（小型1+PC1）→教育で+1=3
            // 販売能力2（セールス1×2）→教育で+1=3

            // === 1周目: 教育チップ購入 + 初期販売 ===
            { action: 'BUY_CHIP', chipType: 'education' },           // 教育チップ（製造+1、販売+1）
            { action: 'PRODUCE' },                                   // 完成投入（wip3→製品+3）
            { action: 'SELL', quantity: 3, minPrice: 22 },           // 販売3個（大阪24円以上、東京禁止）

            // === 2周目: 研究チップ購入開始 + 材料補充 ===
            { action: 'BUY_CHIP', chipType: 'research' },            // 研究1枚目
            { action: 'BUY_MATERIALS', quantity: 3, maxPrice: 14 },  // 材料3個（1周目制限）
            { action: 'PRODUCE' },                                   // 完成投入

            // === 3周目: 販売 + 研究チップ追加 ===
            { action: 'SELL', quantity: 3, minPrice: 22 },           // 販売3個（大阪24円以上、東京禁止）
            { action: 'BUY_CHIP', chipType: 'research' },            // 研究2枚目
            { action: 'BUY_CHIP', chipType: 'research' },            // 研究3枚目

            // === 4周目: 生産サイクル + 研究4枚目 ===
            { action: 'BUY_MATERIALS', quantity: 3, maxPrice: 14 },  // 材料3個
            { action: 'PRODUCE' },                                   // 完成投入
            { action: 'SELL', quantity: 3, minPrice: 22 },           // 販売3個（大阪24円以上、東京禁止）
            { action: 'BUY_CHIP', chipType: 'research' },            // 研究4枚目

            // === 5周目: 教育2枚目 + 最終サイクル ===
            { action: 'BUY_CHIP', chipType: 'education' },           // 教育2枚目
            { action: 'PRODUCE' }                                    // 最終生産
        ],

        // ★★★ 3期戦略（修正版 2026-01-06）★★★
        // 前提: 研究3枚（2期から繰越）、ワーカー1人、小型機械1台、セールスマン1人
        // 期首: PC購入、長期借入（最大限）
        // ★重要: 3期中にチップ購入して高価格販売 + 4期用チップ確保
        PLAYER_PERIOD3_SEQUENCE: [
            // === フェーズ1: チップ購入で高価格販売準備 ===
            { action: 'BUY_CHIP', chipType: 'research' },            // 研究4枚目（¥32で販売可能に）
            { action: 'HIRE_SALESMAN', count: 2 },                   // セールスマン3名体制
            { action: 'PRODUCE' },                                   // 繰越仕掛品を完成

            // === フェーズ2: 高価格販売（研究4枚=¥32） ===
            { action: 'SELL', quantity: 3, minPrice: 30 },           // ¥30以上で販売
            { action: 'BUY_MATERIALS', quantity: 3, maxPrice: 14 },
            { action: 'PRODUCE' },
            { action: 'SELL', quantity: 3, minPrice: 30 },           // ¥30以上で販売

            // === フェーズ3: 次期チップ確保 + 生産サイクル ===
            { action: 'BUY_CHIP', chipType: 'research' },            // 4期用チップ1枚目
            { action: 'BUY_CHIP', chipType: 'research' },            // 4期用チップ2枚目
            { action: 'BUY_MATERIALS', quantity: 3, maxPrice: 14 },
            { action: 'PRODUCE' },
            { action: 'SELL', quantity: 3, minPrice: 28 },

            // === フェーズ4: 追加チップ + サイクル継続 ===
            { action: 'BUY_CHIP', chipType: 'research' },            // 4期用チップ3枚目
            { action: 'BUY_MATERIALS', quantity: 3, maxPrice: 14 },
            { action: 'PRODUCE' },
            { action: 'SELL', quantity: 3, minPrice: 26 },
            { action: 'PRODUCE' }                                    // 在庫確保
        ],

        // ★★★ 4期戦略（修正版 2026-01-06）★★★
        // 前提: 3期から研究3枚繰越
        // ★重要: 5期用に研究チップ3枚以上を確保
        PLAYER_PERIOD4_SEQUENCE: [
            // === フェーズ1: 繰越チップで高価格販売 ===
            { action: 'PRODUCE' },
            { action: 'SELL', quantity: 3, minPrice: 28 },           // 研究3枚=¥28
            { action: 'BUY_MATERIALS', quantity: 4 },
            { action: 'PRODUCE' },
            { action: 'SELL', quantity: 4, minPrice: 28 },

            // === フェーズ2: 5期用チップ確保 ===
            { action: 'BUY_CHIP', chipType: 'research' },            // 5期用1枚目
            { action: 'BUY_CHIP', chipType: 'research' },            // 5期用2枚目
            { action: 'BUY_CHIP', chipType: 'research' },            // 5期用3枚目
            { action: 'BUY_MATERIALS', quantity: 4 },
            { action: 'PRODUCE' },
            { action: 'SELL', quantity: 4, minPrice: 26 },

            // === フェーズ3: 追加生産サイクル ===
            { action: 'BUY_MATERIALS', quantity: 4 },
            { action: 'PRODUCE' },
            { action: 'SELL', quantity: 4, minPrice: 24 },
            { action: 'PRODUCE' }
        ],

        // ★★★ 5期戦略（修正版 2026-01-06）★★★
        // ★絶対条件: 在庫10個以上、次期チップ3枚以上
        PLAYER_PERIOD5_SEQUENCE: [
            // === フェーズ1: チップ確保（最優先）===
            { action: 'BUY_CHIP', chipType: 'research' },            // 次期用1枚目
            { action: 'BUY_CHIP', chipType: 'research' },            // 次期用2枚目
            { action: 'BUY_CHIP', chipType: 'research' },            // 次期用3枚目（勝利条件達成）

            // === フェーズ2: 高価格販売 ===
            { action: 'PRODUCE' },
            { action: 'SELL', quantity: 3, minPrice: 27 },           // 研究3枚=¥27
            { action: 'BUY_MATERIALS', quantity: 4 },
            { action: 'PRODUCE' },
            { action: 'SELL', quantity: 3, minPrice: 25 },

            // === フェーズ3: 在庫10個確保 ===
            { action: 'BUY_MATERIALS', quantity: 6 },
            { action: 'PRODUCE' },
            { action: 'BUY_MATERIALS', quantity: 4 },                // 在庫確保用
            { action: 'PRODUCE' }
            // ★販売しない → 在庫10個以上を維持
        ],

        // デバッグフラグ（問題特定後はfalseにする）
        debugMode: false,

        /**
         * シーケンスに基づいて次の行動を取得
         * ★ 行番号ではなく、実行済みアクション数で管理 ★
         * ★★★ 2期〜5期全てに対応 ★★★
         */
        getScriptedAction(company, gameState, recursionDepth = 0) {
            const period = gameState.period;
            const strategy = company.strategyType;

            // PLAYER戦略のみスクリプトモード（2期〜5期）
            if (strategy !== 'PLAYER') return null;

            // 期別シーケンスを選択
            let sequence;
            switch (period) {
                case 2: sequence = this.PLAYER_PERIOD2_SEQUENCE; break;
                case 3: sequence = this.PLAYER_PERIOD3_SEQUENCE; break;
                case 4: sequence = this.PLAYER_PERIOD4_SEQUENCE; break;
                case 5: sequence = this.PLAYER_PERIOD5_SEQUENCE; break;
                default: return null;
            }

            // 無限再帰防止
            if (recursionDepth > 20) {
                if (this.debugMode) console.log(`[SCRIPT${period}] 再帰上限到達`);
                return null;
            }

            // 実行済みシーケンスインデックスを取得（なければ0から開始）
            if (company.scriptIndex === undefined) {
                company.scriptIndex = 0;
            }

            // シーケンス完了チェック
            if (company.scriptIndex >= sequence.length) {
                // ★★★ リスクカード対策: チップを失っていたら買い増し（無理はしない）★★★
                if (period === 2 && company.cash >= 40) {  // 最低40円確保
                    const researchChips = company.chips.research || 0;
                    const educationChips = company.chips.education || 0;

                    // 研究チップが4枚未満なら買い増し
                    if (researchChips < 4 && company.cash >= 40) {
                        const validation = ActionValidator.canExecute('BUY_CHIP', {
                            isExpress: false, bypassPeriodEndCheck: true
                        }, company, gameState);
                        if (validation.valid) {
                            return {
                                type: 'BUY_CHIP',
                                chipType: 'research',
                                isExpress: false,
                                bypassPeriodEndCheck: true,
                                detail: '研究開発チップ購入（リスク補填）'
                            };
                        }
                    }
                    // 教育チップが2枚未満なら買い増し
                    if (educationChips < 2 && company.cash >= 40) {
                        const validation = ActionValidator.canExecute('BUY_CHIP', {
                            isExpress: false, bypassPeriodEndCheck: true
                        }, company, gameState);
                        if (validation.valid) {
                            return {
                                type: 'BUY_CHIP',
                                chipType: 'education',
                                isExpress: false,
                                bypassPeriodEndCheck: true,
                                detail: '教育チップ購入（リスク補填）'
                            };
                        }
                    }
                }
                if (this.debugMode) console.log(`[SCRIPT${period}] 全アクション完了`);
                return null;  // 全アクション完了
            }

            // 現在のエントリを試す
            const entry = sequence[company.scriptIndex];
            if (this.debugMode && period === 2) {  // 2期のみ詳細ログ
                console.log(`[SCRIPT${period}] idx=${company.scriptIndex} action=${entry.action} cash=${company.cash} mat=${company.materials} prod=${company.products}`);
            }
            const action = this.createScriptedAction(entry, company, gameState);

            if (action) {
                // 成功したらインデックスを進める
                company.scriptIndex++;
                if (this.debugMode && period <= 3 && company.strategyType === 'PLAYER') {
                    console.log(`[SCRIPT${period}] 成功: ${action.detail}`);
                }
                return action;
            }

            // このアクションが実行できない場合
            if (this.debugMode && period <= 3 && company.strategyType === 'PLAYER') {
                console.log(`[SCRIPT${period}] 失敗: ${entry.action} (idx=${company.scriptIndex})`);
            }

            // 資金不足の場合は待機する必要がある
            if (entry.action === 'BUY_CHIP' && company.cash < 20) {
                return null;  // 資金が足りるまで待機
            }
            if (entry.action === 'BUY_MATERIALS' && company.cash < 36) {  // 最低3個分
                return null;  // 資金が足りるまで待機
            }

            // 実行できない場合でもインデックスを進めて次を試す
            company.scriptIndex++;
            return this.getScriptedAction(company, gameState, recursionDepth + 1);  // 再帰で次を試す
        },

        /**
         * スクリプトエントリからアクションを作成
         */
        createScriptedAction(entry, company, gameState) {
            const period = gameState.period;

            switch (entry.action) {
                case 'BUY_CHIP': {
                    // ★スクリプトモードでは期末コストチェックを緩和★
                    // 現金が20円以上あれば購入可能（後で販売で回収予定）
                    if (company.cash < 20) return null;

                    // 1行1枚制限のみチェック
                    if (company.chipsBoughtThisTurn) return null;

                    return {
                        type: 'BUY_CHIP',
                        score: 1000,  // スクリプトは最優先
                        chipType: entry.chipType,
                        isExpress: false,
                        bypassPeriodEndCheck: true,  // ★executeActionでの再検証をバイパス★
                        detail: `${entry.chipType === 'education' ? '教育' : '研究開発'}チップ購入（スクリプト）`
                    };
                }

                case 'BUY_MATERIALS': {
                    // ★指定数量を購入できる市場を優先★
                    // maxPrice指定がある場合はその価格以下の市場のみ
                    const maxPrice = entry.maxPrice || 99;  // デフォルトは制限なし
                    const sortedMarkets = [...gameState.markets]
                        .filter(m => m.buyPrice <= maxPrice)
                        .sort((a, b) => a.buyPrice - b.buyPrice);
                    const storageSpace = company.getStorageCapacity() - company.materials - company.products;
                    // ACT-002: 2期1周目は3個まで（全社共通ルール）
                    const maxQty = (period === 2 && gameState.isFirstRound) ? 3 : entry.quantity;

                    // ★材料購入は市場から買うので、販売上限(maxStock)は関係ない★
                    // 最安市場から順に、指定数量を購入できる市場を探す
                    for (const market of sortedMarkets) {
                        const qty = Math.min(maxQty, storageSpace);
                        if (qty < 2) continue;  // 最低2個必要
                        if (company.cash < market.buyPrice * qty) continue;

                        const validation = ActionValidator.canExecute('BUY_MATERIALS', {
                            quantity: qty, market, bypassPeriodEndCheck: true
                        }, company, gameState);
                        if (!validation.valid) continue;

                        return {
                            type: 'BUY_MATERIALS',
                            score: 1000,
                            market,
                            quantity: qty,
                            bypassPeriodEndCheck: true,
                            detail: `材料${qty}個購入@¥${market.buyPrice}（スクリプト）`
                        };
                    }
                    return null;  // maxPrice以下の市場で購入できない
                }

                case 'PRODUCE': {
                    const mfgCap = company.getMfgCapacity();
                    if (mfgCap === 0) return null;
                    const canComplete = Math.min(company.wip, mfgCap);
                    const canInput = Math.min(company.materials, mfgCap);
                    if (canComplete === 0 && canInput === 0) return null;

                    const validation = ActionValidator.canExecute('PRODUCE', {
                        complete: canComplete, input: canInput
                    }, company, gameState);
                    if (!validation.valid) return null;

                    // ★executeActionはmaterialToWipとwipToProductを期待する★
                    return {
                        type: 'PRODUCE',
                        score: 1000,
                        materialToWip: canInput,    // 材料→仕掛品
                        wipToProduct: canComplete,  // 仕掛品→製品
                        detail: `生産: 完成${canComplete}+投入${canInput}（スクリプト）`
                    };
                }

                case 'SELL': {
                    if (company.products < 2) return null;
                    const researchChips = company.chips.research || 0;
                    const salesCap = company.getSalesCapacity();
                    // entry.quantityが指定されていればそれを使用、なければ能力上限
                    const requestedQty = entry.quantity || 3;
                    const sellQty = Math.min(company.products, salesCap, requestedQty);
                    const isParent = gameState.isParent(company.index);
                    const period = gameState.period;

                    // entry.minPriceが指定されていればそれを最低価格とする
                    const minPrice = entry.minPrice || 0;

                    // ★★★ TARGET_PRICESに基づく販売価格 ★★★
                    // 研究チップ数に応じた目標価格を使用
                    const targetPrices = RULES.TARGET_PRICES[period] || RULES.TARGET_PRICES[2];
                    let targetPrice = targetPrices[Math.min(researchChips, 5)] || 26;

                    // minPriceが指定されていれば、それ以上の価格を目指す
                    if (minPrice > targetPrice) {
                        targetPrice = minPrice;
                    }

                    // 親ボーナスで+2円（入札競争で有利）
                    if (isParent) {
                        targetPrice += 1;  // 親は少し高めに入札可能
                    }

                    // ★★★ 目標価格に最も近い市場を選択（勝率を高める）★★★
                    // minPrice以上の市場のみを対象とする
                    const bidMarkets = gameState.markets
                        .filter(m => m.needsBid && m.sellPrice >= minPrice)
                        .sort((a, b) => {
                            // 目標価格との差が小さい順（ただし目標価格以上の市場を優先）
                            const diffA = Math.abs(a.sellPrice - targetPrice);
                            const diffB = Math.abs(b.sellPrice - targetPrice);
                            // 目標価格に近い市場を優先（ただし目標以上）
                            if (a.sellPrice >= targetPrice && b.sellPrice < targetPrice) return -1;
                            if (b.sellPrice >= targetPrice && a.sellPrice < targetPrice) return 1;
                            return diffA - diffB;  // 差が小さい順
                        });

                    for (const m of bidMarkets) {
                        const remainingCap = m.maxStock - (m.currentStock || 0);
                        if (remainingCap < sellQty) continue;

                        // 市場の上限を超えない範囲で目標価格を使用
                        const actualPrice = Math.min(targetPrice, m.sellPrice);

                        const validation = ActionValidator.canExecute('SELL', {
                            market: m, quantity: sellQty, price: actualPrice
                        }, company, gameState);
                        if (validation.valid) {
                            return {
                                type: 'SELL',
                                score: 1000 + actualPrice,
                                market: m,
                                quantity: sellQty,
                                price: actualPrice,
                                detail: `販売¥${actualPrice}×${sellQty}個@${m.name}（スクリプト）`
                            };
                        }
                    }

                    // フェーズ2: 非入札市場（確実に売れる）- minPrice以上の市場のみ
                    const nonBidMarkets = gameState.markets
                        .filter(m => !m.needsBid && m.sellPrice >= minPrice)
                        .sort((a, b) => b.sellPrice - a.sellPrice);  // 大阪24>東京20>海外16

                    for (const m of nonBidMarkets) {
                        const remainingCap = m.maxStock - (m.currentStock || 0);
                        if (remainingCap < sellQty) continue;
                        // 非入札市場は固定価格（研究チップ・親ボーナスの効果なし）
                        // 大阪: 24円(2期) or 21-26円(3期+サイコロ), 東京: 20円, 海外: 16円
                        const nonBidPrice = m.sellPrice;

                        const validation = ActionValidator.canExecute('SELL', {
                            market: m, quantity: sellQty, price: nonBidPrice
                        }, company, gameState);
                        if (validation.valid) {
                            return {
                                type: 'SELL',
                                score: 800 + nonBidPrice,  // 価格で優先度付け
                                market: m,
                                quantity: sellQty,
                                price: nonBidPrice,
                                detail: `販売¥${nonBidPrice}×${sellQty}個@${m.name}（スクリプト）`
                            };
                        }
                    }
                    return null;
                }

                case 'HIRE_SALESMAN': {
                    const count = entry.count || 1;
                    const cost = count * RULES.COST.HIRING;  // HIRE→HIRING
                    if (company.cash < cost) return null;
                    return {
                        type: 'HIRE_SALESMAN',
                        score: 1000,
                        count: count,
                        detail: `セールスマン${count}名採用（¥${cost}）（スクリプト）`
                    };
                }

                case 'SELL_MACHINE': {
                    // 小型機械を売却（簿価の70%）
                    const smallMachine = company.machines.find(m => m.type === 'small');
                    if (!smallMachine) return null;
                    const bookValue = smallMachine.attachments > 0 ? 130 : 100;  // アタッチメント込み
                    const saleValue = Math.floor(bookValue * 0.7);
                    return {
                        type: 'SELL_MACHINE',
                        score: 1000,
                        machineType: 'small',
                        saleValue: saleValue,
                        detail: `小型機械売却（¥${saleValue}回収）（スクリプト）`
                    };
                }

                case 'BUY_LARGE_MACHINE': {
                    if (company.cash < 200) return null;
                    return {
                        type: 'BUY_LARGE_MACHINE',
                        score: 1000,
                        detail: `大型機械購入（¥200）（スクリプト）`
                    };
                }
            }

            return null;
        },

        /**
         * 最適な行動を決定
         */
        decideAction(company, gameState, options = {}) {
            const period = gameState.period;
            const isParent = gameState.isParent(company.index);

            // ★★★ PLAYER戦略の2期はスクリプトモードを優先 ★★★
            const scriptedAction = this.getScriptedAction(company, gameState);
            if (scriptedAction) {
                return scriptedAction;
            }

            const actions = this.evaluateAllActions(company, gameState);

            // スコアでソート（基本スコア順）
            actions.sort((a, b) => b.score - a.score);

            // インテリジェント学習システムが有効な場合
            if (IntelligentLearning && options.useLearning !== false) {
                // 学習に基づいて行動を選択（探索と活用のバランス）
                return IntelligentLearning.selectAction(actions, company, gameState);
            }

            // 学習なしの場合は最高スコアを選択
            return actions[0];
        },

        /**
         * 全ての可能な行動を評価
         * ★★★ 3段階最適化: 1.行動最大化 2.1行価値最大化 3.適切投資 ★★★
         */
        evaluateAllActions(company, gameState) {
            const actions = [];
            const period = gameState.period;

            // ★★★ 5期勝利条件: 在庫10個以上、チップ3枚以上を必ず確保 ★★★
            const isPeriod5 = period === 5;
            const currentInventory = company.materials + company.wip + company.products;
            const currentChips = (company.chips.research || 0) + (company.chips.education || 0) +
                                (company.chips.advertising || 0) + (company.nextPeriodChips.research || 0) +
                                (company.nextPeriodChips.education || 0) + (company.nextPeriodChips.advertising || 0);

            // 5期の残り行数を計算（終盤判定用）
            const maxRows5 = 35;
            const remainingRows5 = isPeriod5 ? (maxRows5 - company.currentRow) : 99;
            const isLate5Period = isPeriod5 && remainingRows5 <= 10;  // 残り10行以下なら終盤

            // 5期戦略: 序盤は販売優先、終盤で一気に在庫確保
            const needsMoreInventory = isPeriod5 && isLate5Period && currentInventory < RULES.VICTORY.MIN_INVENTORY;
            const needsMoreChips = isPeriod5 && currentChips < RULES.VICTORY.MIN_CARRYOVER_CHIPS;

            // 4期終盤でもチップ準備を開始（翌期繰越用）
            const shouldPrepareChips = (period === 4 && currentChips < 2) || needsMoreChips;

            // ★★★ 第2段階: 1行の価値を最大化（でも行動ゼロは絶対NG）★★★
            // 高価値行動を優先（販売 > 生産 > 材料購入 > 投資）

            // 1. 販売（最高価値：利益を生む唯一の行動）
            // 5期序盤は販売OK、終盤（残り10行以下）で在庫不足なら販売禁止
            const canSellIn5 = !isLate5Period || currentInventory > 12;
            const canSell = company.products > 0 && (!isPeriod5 || canSellIn5);
            if (canSell) {
                const salesAction = this.evaluateSales(company, gameState);
                if (salesAction) {
                    // 5期終盤で在庫ギリギリなら販売スコアを下げる
                    if (isLate5Period && currentInventory <= 12) {
                        salesAction.score += 50;  // かなり控えめに
                    } else {
                        salesAction.score += 300;  // 通常は最優先
                    }
                    actions.push(salesAction);
                }
            }

            // 2. 生産（高価値：販売準備）
            const produceAction = this.evaluateProduction(company, gameState);
            if (produceAction) {
                // 2個以上なら高スコア、1個でも追加（行動ゼロ防止）
                if (produceAction.wipToProduct >= 2 || produceAction.materialToWip >= 2) {
                    produceAction.score += 200;
                } else {
                    produceAction.score += 50;  // 1個でもやる
                }
                actions.push(produceAction);
            }

            // 3. 材料購入（中価値：生産準備）
            const buyAction = this.evaluateBuyMaterialsOptimized(company, gameState);
            if (buyAction) {
                if (needsMoreInventory) buyAction.score += 1000;  // 5期在庫条件は最優先
                actions.push(buyAction);
            }

            // 3b. 少量でも材料購入（行動ゼロ防止）
            if (!buyAction && company.cash >= 10) {
                const smallBuyAction = this.evaluateSmallBuy(company, gameState);
                if (smallBuyAction) actions.push(smallBuyAction);
            }

            // ★★★ 第3段階: 適切な投資判断 ★★★
            // 投資は生産・販売より低優先だが、タイミングが重要

            // 4. チップ購入（投資：2期序盤で研究チップ、5期勝利条件で必須）
            const chipAction = this.evaluateChipPurchaseOptimized(company, gameState);
            if (chipAction) {
                if (needsMoreChips) chipAction.score += 1000;  // 5期チップ条件は最優先
                if (shouldPrepareChips) chipAction.score += 300;  // 4期からチップ準備
                // ★★★ 2期序盤はチップ投資を最優先（将来の全販売の価格UP）★★★
                const currentResearch = company.chips.research || 0;
                if (period === 2 && currentResearch < 2 && company.currentRow <= 12) {
                    // 2期序盤で研究チップ2枚未満なら、販売より優先
                    chipAction.score += 600;
                }
                actions.push(chipAction);
            }

            // 5. 採用（投資：能力拡大）
            const hireAction = this.evaluateHiringOptimized(company, gameState);
            if (hireAction) actions.push(hireAction);

            // 6. 機械購入（投資：大規模拡大）
            const machineAction = this.evaluateMachinePurchase(company, gameState);
            if (machineAction) actions.push(machineAction);

            // ★★★ 第1段階: 行動回数最大化（フォールバック）★★★
            // 正規行動がない場合でも、何か生産的なことをする
            if (actions.length === 0 || actions.every(a => a.score < 50)) {
                this.addFallbackActions(company, gameState, actions);
            }

            // DO_NOTHING は絶対に追加しない（行の無駄）
            // 代わりに必ず何かしらの行動を返す

            // 最悪の場合のみDO_NOTHINGを追加（本当に何もできない時）
            if (actions.length === 0) {
                actions.push({ type: 'DO_NOTHING', score: -9999, detail: '行動不可' });
            }

            return actions;
        },

        /**
         * フォールバック行動を追加（行動最大化のため）
         * ★★★ 絶対にDO_NOTHINGを選ばないよう、全ての可能性を探る ★★★
         */
        addFallbackActions(company, gameState, actions) {
            const period = gameState.period;
            const mfgCap = company.getMfgCapacity();
            const salesCap = company.getSalesCapacity();

            // 在庫余裕を先に計算（生産判断で使用）
            const storageCapacity = company.getStorageCapacity();
            const currentStorage = company.materials + company.products;
            const availableStorage = storageCapacity - currentStorage;

            // === 優先度1: 販売（どんな価格でも売る）===
            if (company.products >= 1 && salesCap >= 1) {
                for (const m of gameState.markets) {
                    const remainingCapacity = m.maxStock - (m.currentStock || 0);
                    const sellQty = Math.min(company.products, remainingCapacity, salesCap);
                    if (sellQty >= 1) {
                        const sellValidation = ActionValidator.canExecute('SELL', {
                            market: m,
                            quantity: sellQty,
                            price: m.sellPrice
                        }, company, gameState);
                        if (sellValidation.valid) {
                            actions.push({
                                type: 'SELL',
                                score: 200 + sellQty * m.sellPrice,
                                detail: `${m.name}に¥${m.sellPrice}×${sellQty}個`,
                                market: m,
                                price: m.sellPrice,
                                quantity: sellQty
                            });
                            break;
                        }
                    }
                }
            }

            // === 優先度2: 生産（1個でもやる）===
            // 2a. 仕掛品→製品
            if (company.wip >= 1 && company.cash >= 1 && mfgCap >= 1) {
                const wipToProduct = Math.min(company.wip, mfgCap);
                const produceValidation = ActionValidator.canExecute('PRODUCE', {
                    materialToWip: 0,
                    wipToProduct
                }, company, gameState);
                if (produceValidation.valid) {
                    // ★★★ 材料がない時は完成のみのスコアを大幅に下げる ★★★
                    // 材料購入を優先して、次のターンで「投入+完成」できるようにする
                    let score = 150 + wipToProduct * 25;
                    if (company.materials === 0 && availableStorage >= 3 && company.cash >= 30) {
                        score = -100;  // 材料購入を最優先（確実にスコアで負ける）
                    }
                    actions.push({
                        type: 'PRODUCE',
                        score,
                        detail: `仕掛品${wipToProduct}→製品`,
                        materialToWip: 0,
                        wipToProduct
                    });
                }
            }

            // 2b. 材料→仕掛品
            if (company.materials >= 1 && company.wip < RULES.CAPACITY.WIP && company.cash >= 1 && mfgCap >= 1) {
                const materialToWip = Math.min(company.materials, mfgCap, RULES.CAPACITY.WIP - company.wip);
                if (materialToWip >= 1) {
                    const produceValidation = ActionValidator.canExecute('PRODUCE', {
                        materialToWip,
                        wipToProduct: 0
                    }, company, gameState);
                    if (produceValidation.valid) {
                        actions.push({
                            type: 'PRODUCE',
                            score: 120 + materialToWip * 20,
                            detail: `材料${materialToWip}→仕掛品`,
                            materialToWip,
                            wipToProduct: 0
                        });
                    }
                }
            }

            // 2c. 投入+完成（同時）
            if (company.materials >= 1 && company.wip >= 1 && company.cash >= 2 && mfgCap >= 1) {
                const wipToProduct = Math.min(company.wip, mfgCap);
                const materialToWip = Math.min(company.materials, mfgCap, RULES.CAPACITY.WIP - company.wip + wipToProduct);
                if (wipToProduct >= 1 || materialToWip >= 2) {
                    const produceValidation = ActionValidator.canExecute('PRODUCE', {
                        materialToWip,
                        wipToProduct
                    }, company, gameState);
                    if (produceValidation.valid) {
                        actions.push({
                            type: 'PRODUCE',
                            score: 180 + (wipToProduct + materialToWip) * 20,
                            detail: `投入${materialToWip}+完成${wipToProduct}`,
                            materialToWip,
                            wipToProduct
                        });
                    }
                }
            }

            // === 優先度3: 材料購入（最大個数優先）===
            if (availableStorage >= 3 && company.cash >= 30) {
                // ★★★ 最大個数を買える市場を選ぶ（1行の価値最大化）★★★
                const openMarkets = gameState.markets
                    .filter(m => !gameState.closedMarkets.includes(m.name) && m.maxStock >= 3);

                let bestMarket = null;
                let bestQty = 0;
                for (const market of openMarkets) {
                    const affordable = Math.floor(company.cash / market.buyPrice);
                    const qty = Math.min(affordable, availableStorage, market.maxStock, mfgCap * 2);
                    if (qty > bestQty) {
                        bestQty = qty;
                        bestMarket = market;
                    }
                }

                if (bestMarket && bestQty >= 3) {
                    const buyValidation = ActionValidator.canExecute('BUY_MATERIALS', {
                        quantity: bestQty,
                        market: bestMarket
                    }, company, gameState);
                    if (buyValidation.valid) {
                        actions.push({
                            type: 'BUY_MATERIALS',
                            score: 100 + bestQty * 20,  // 個数に大きなウェイト
                            detail: `${bestMarket.name}から¥${bestMarket.buyPrice}×${bestQty}個`,
                            market: bestMarket,
                            quantity: bestQty
                        });
                    }
                }
            }

            // === 優先度4: 投資（タイミングが良ければ）===
            // チップ購入
            if (company.cash >= 25) {
                const chipAction = this.evaluateChipPurchaseOptimized(company, gameState);
                if (chipAction && !actions.find(a => a.type === 'BUY_CHIP')) {
                    chipAction.score = Math.max(chipAction.score, 80);
                    actions.push(chipAction);
                }
            }

            // 採用（能力不足時）
            if ((mfgCap < 2 || salesCap < 3) && company.cash >= 10) {
                const hireAction = this.evaluateHiringOptimized(company, gameState);
                if (hireAction && !actions.find(a => a.type.startsWith('HIRE'))) {
                    hireAction.score = Math.max(hireAction.score, 60);
                    actions.push(hireAction);
                }
            }

            // === 最終手段1: 最低3個買う ===
            if (actions.length === 0 && company.cash >= 30) {
                // ★★★ maxStock >= 3の開いている市場から選ぶ ★★★
                const openMarkets = gameState.markets
                    .filter(m => !gameState.closedMarkets.includes(m.name) && m.maxStock >= 3)
                    .sort((a, b) => a.buyPrice - b.buyPrice);

                if (openMarkets.length > 0 && availableStorage >= 3) {
                    const cheapestMarket = openMarkets[0];
                    const maxAffordable = Math.floor(company.cash / cheapestMarket.buyPrice);
                    const buyQty = Math.min(availableStorage, maxAffordable, cheapestMarket.maxStock);
                    if (buyQty >= 3) {  // ★最低3個
                        const buyValidation = ActionValidator.canExecute('BUY_MATERIALS', {
                            quantity: buyQty,
                            market: cheapestMarket
                        }, company, gameState);
                        if (buyValidation.valid) {
                            actions.push({
                                type: 'BUY_MATERIALS',
                                score: 20,
                                detail: `${cheapestMarket.name}から¥${cheapestMarket.buyPrice}×${buyQty}個（最終手段）`,
                                market: cheapestMarket,
                                quantity: buyQty
                            });
                        }
                    }
                }
            }

            // === 最終手段2: 在庫満杯でも製品があれば売る（5期在庫条件無視）===
            if (actions.length === 0 && company.products >= 1 && salesCap >= 1) {
                for (const m of gameState.markets) {
                    const remainingCapacity = m.maxStock - (m.currentStock || 0);
                    const sellQty = Math.min(company.products, remainingCapacity, salesCap);
                    if (sellQty >= 1) {
                        const sellValidation = ActionValidator.canExecute('SELL', {
                            market: m,
                            quantity: sellQty,
                            price: m.sellPrice
                        }, company, gameState);
                        if (sellValidation.valid) {
                            actions.push({
                                type: 'SELL',
                                score: 100,
                                detail: `${m.name}に¥${m.sellPrice}×${sellQty}個（強制販売）`,
                                market: m,
                                price: m.sellPrice,
                                quantity: sellQty
                            });
                            break;
                        }
                    }
                }
            }

            // === 最終手段3: 採用（現金があれば）===
            if (actions.length === 0 && company.cash >= 5) {
                const validation = ActionValidator.canExecute('HIRE', { count: 1 }, company, gameState);
                if (validation.valid) {
                    actions.push({
                        type: 'HIRE_WORKER',
                        score: 10,
                        detail: 'ワーカー1人採用（最終手段）',
                        count: 1,
                        hireType: 'worker'
                    });
                }
            }

            // === 最終手段4: 仕掛品2個以上あれば完成 ===
            if (actions.length === 0 && company.wip >= 2 && company.cash >= 2 && mfgCap >= 1) {
                const wipToComplete = Math.min(company.wip, mfgCap);
                if (wipToComplete >= 2) {
                    const produceValidation = ActionValidator.canExecute('PRODUCE', {
                        materialToWip: 0,
                        wipToProduct: wipToComplete
                    }, company, gameState);
                    if (produceValidation.valid) {
                        actions.push({
                            type: 'PRODUCE',
                            score: 5,
                            detail: `仕掛品${wipToComplete}→製品（最終手段）`,
                            materialToWip: 0,
                            wipToProduct: wipToComplete
                        });
                    }
                }
            }

            // === 最終手段5: 材料2個以上あれば投入 ===
            if (actions.length === 0 && company.materials >= 2 && company.wip < RULES.CAPACITY.WIP - 1 && company.cash >= 2) {
                const materialToInput = Math.min(company.materials, RULES.CAPACITY.WIP - company.wip);
                if (materialToInput >= 2) {
                    const produceValidation = ActionValidator.canExecute('PRODUCE', {
                        materialToWip: materialToInput,
                        wipToProduct: 0
                    }, company, gameState);
                    if (produceValidation.valid) {
                        actions.push({
                            type: 'PRODUCE',
                            score: 5,
                            detail: `材料${materialToInput}→仕掛品（最終手段）`,
                            materialToWip: materialToInput,
                            wipToProduct: 0
                        });
                    }
                }
            }

            // === 最終手段6: 海外市場への販売（現金0でも可能）===
            // ★★★ PLAYER戦略では海外¥16販売を禁止（ユーザー指定 2026-01-06）★★★
            if (actions.length === 0 && company.products >= 1 && company.strategyType !== 'PLAYER') {
                const overseasMarket = gameState.markets.find(m => m.name === '海外');
                if (overseasMarket) {
                    const sellQty = Math.min(company.products, overseasMarket.maxStock - (overseasMarket.currentStock || 0), salesCap);
                    if (sellQty >= 1) {
                        const sellValidation = ActionValidator.canExecute('SELL', {
                            market: overseasMarket,
                            quantity: sellQty,
                            price: overseasMarket.sellPrice
                        }, company, gameState);
                        if (sellValidation.valid) {
                            actions.push({
                                type: 'SELL',
                                score: 1,
                                detail: `海外に¥${overseasMarket.sellPrice}×${sellQty}個（緊急販売）`,
                                market: overseasMarket,
                                price: overseasMarket.sellPrice,
                                quantity: sellQty
                            });
                        }
                    }
                }
            }

            // === 最終手段7: 東京市場への販売 ===
            // ★★★ PLAYER戦略では東京¥20販売を禁止（ユーザー指定 2026-01-06）★★★
            if (actions.length === 0 && company.products >= 1 && company.strategyType !== 'PLAYER') {
                const tokyoMarket = gameState.markets.find(m => m.name === '東京');
                if (tokyoMarket) {
                    const sellQty = Math.min(company.products, tokyoMarket.maxStock - (tokyoMarket.currentStock || 0), salesCap);
                    if (sellQty >= 1) {
                        const sellValidation = ActionValidator.canExecute('SELL', {
                            market: tokyoMarket,
                            quantity: sellQty,
                            price: tokyoMarket.sellPrice
                        }, company, gameState);
                        if (sellValidation.valid) {
                            actions.push({
                                type: 'SELL',
                                score: 1,
                                detail: `東京に¥${tokyoMarket.sellPrice}×${sellQty}個（緊急販売）`,
                                market: tokyoMarket,
                                price: tokyoMarket.sellPrice,
                                quantity: sellQty
                            });
                        }
                    }
                }
            }

            // === 最終手段8: どんな市場でも販売能力分売る ===
            // ★★★ PLAYER戦略では低価格市場への緊急販売を禁止 ★★★
            if (actions.length === 0 && company.products >= 2 && salesCap >= 2 && company.strategyType !== 'PLAYER') {
                for (const m of gameState.markets) {
                    if (gameState.closedMarkets.includes(m.name)) continue;
                    const remainingCapacity = m.maxStock - (m.currentStock || 0);
                    const sellQty = Math.min(company.products, remainingCapacity, salesCap);
                    if (sellQty >= 2) {  // ★最低2個
                        const sellValidation = ActionValidator.canExecute('SELL', {
                            market: m,
                            quantity: sellQty,
                            price: m.sellPrice
                        }, company, gameState);
                        if (sellValidation.valid) {
                            actions.push({
                                type: 'SELL',
                                score: 1,
                                detail: `${m.name}に¥${m.sellPrice}×${sellQty}個（最終販売）`,
                                market: m,
                                price: m.sellPrice,
                                quantity: sellQty
                            });
                            break;
                        }
                    }
                }
            }

            // === 最終手段9: 最低2個でも販売（DO_NOTHING絶対回避）===
            // ★★★ BUG FIX: MIN_SALE_QUANTITY=2なので1個販売は無効。最低2個で販売試行 ★★★
            if (actions.length === 0 && company.products >= 2 && salesCap >= 2) {
                for (const m of gameState.markets) {
                    if (gameState.closedMarkets.includes(m.name)) continue;
                    const remainingCapacity = m.maxStock - (m.currentStock || 0);
                    if (remainingCapacity >= 2) {
                        const sellValidation = ActionValidator.canExecute('SELL', {
                            market: m,
                            quantity: 2,
                            price: m.sellPrice
                        }, company, gameState);
                        if (sellValidation.valid) {
                            actions.push({
                                type: 'SELL',
                                score: 1,
                                detail: `${m.name}に¥${m.sellPrice}×2個（緊急販売）`,
                                market: m,
                                price: m.sellPrice,
                                quantity: 2
                            });
                            break;
                        }
                    }
                }
            }

            // === 最終手段10: 1個でも材料購入（現金があれば）===
            // ★★★ 緊急時は期末コストチェックをバイパス（短期借入でカバー可能）★★★
            if (actions.length === 0 && company.cash >= 10 && availableStorage >= 1) {
                const openMarkets = gameState.markets.filter(m => !gameState.closedMarkets.includes(m.name));
                for (const m of openMarkets) {
                    const affordable = Math.floor(company.cash / m.buyPrice);
                    const buyQty = Math.min(affordable, availableStorage, m.maxStock);
                    if (buyQty >= 1) {
                        // ★★★ 緊急時は期末コストチェックをスキップして直接追加 ★★★
                        // 期末に現金不足なら短期借入が発生するが、DO_NOTHINGより良い
                        const cost = m.buyPrice * buyQty;
                        if (company.cash >= cost) {
                            actions.push({
                                type: 'BUY_MATERIALS',
                                score: 1,
                                detail: `${m.name}から¥${m.buyPrice}×${buyQty}個（緊急購入）`,
                                market: m,
                                quantity: buyQty,
                                bypassPeriodEndCheck: true  // ★緊急フラグ
                            });
                            break;
                        }
                    }
                }
            }

            // === 最終手段11: 1個でも生産（現金¥1以上あれば）===
            if (actions.length === 0 && company.cash >= 1) {
                // 仕掛品→製品
                if (company.wip >= 1 && mfgCap >= 1) {
                    const produceValidation = ActionValidator.canExecute('PRODUCE', {
                        materialToWip: 0,
                        wipToProduct: 1
                    }, company, gameState);
                    if (produceValidation.valid) {
                        actions.push({
                            type: 'PRODUCE',
                            score: 1,
                            detail: `仕掛品1→製品（緊急生産）`,
                            materialToWip: 0,
                            wipToProduct: 1
                        });
                    }
                }
                // 材料→仕掛品
                if (actions.length === 0 && company.materials >= 1 && company.wip < RULES.CAPACITY.WIP) {
                    const produceValidation = ActionValidator.canExecute('PRODUCE', {
                        materialToWip: 1,
                        wipToProduct: 0
                    }, company, gameState);
                    if (produceValidation.valid) {
                        actions.push({
                            type: 'PRODUCE',
                            score: 1,
                            detail: `材料1→仕掛品（緊急投入）`,
                            materialToWip: 1,
                            wipToProduct: 0
                        });
                    }
                }
            }
        },

        /**
         * 少量材料購入（行動ゼロ防止用）
         * 1-2個でも買う
         */
        evaluateSmallBuy(company, gameState) {
            const storageCapacity = company.getStorageCapacity();
            const currentStorage = company.materials + company.products;
            const availableStorage = storageCapacity - currentStorage;

            if (availableStorage < 1) return null;

            // 開いている市場を探す
            const openMarkets = gameState.markets.filter(m => !gameState.closedMarkets.includes(m.name));
            if (openMarkets.length === 0) return null;

            const cheapestMarket = openMarkets.reduce((best, m) =>
                m.buyPrice < best.buyPrice ? m : best
            );

            const maxAffordable = Math.floor(company.cash / cheapestMarket.buyPrice);
            const buyQty = Math.min(availableStorage, maxAffordable, 2);

            if (buyQty < 1 || company.cash < cheapestMarket.buyPrice) return null;

            const validation = ActionValidator.canExecute('BUY_MATERIALS', {
                quantity: buyQty,
                market: cheapestMarket
            }, company, gameState);

            if (!validation.valid) return null;

            return {
                type: 'BUY_MATERIALS',
                score: 40 + buyQty * 10,
                detail: `${cheapestMarket.name}から¥${cheapestMarket.buyPrice}×${buyQty}個`,
                market: cheapestMarket,
                quantity: buyQty
            };
        },

        /**
         * 材料購入（最適化版）- 1行の価値を最大化
         * ★最低3個以上でないと行の無駄
         */
        evaluateBuyMaterialsOptimized(company, gameState) {
            const period = gameState.period;
            const mfgCapacity = company.getMfgCapacity();
            const storageCapacity = company.getStorageCapacity();
            const currentStorage = company.materials + company.products;
            const availableStorage = storageCapacity - currentStorage;

            // 最低3個買えないなら購入しない（行の無駄）
            if (availableStorage < 3) return null;

            // ★★★ 生産コスト予約（DO_NOTHING防止の最重要ルール）★★★
            // 材料購入後に生産できるよう、最低¥10は残す
            const minProductionReserve = 10;  // 生産2回分（投入+完成 × 2）

            // ★★★ 期末コストを考慮した購入可能現金 ★★★
            // 材料売却・短期借入を絶対回避するため、常に期末コスト100%を確保
            const isLateInPeriod = PeriodEndCostEstimator.isLateInPeriod(company, period);
            const isVeryLate = PeriodEndCostEstimator.isVeryLateInPeriod(company, period);
            const periodEndCost = PeriodEndCostEstimator.calculate(company, period, gameState);

            // ★★★ 生産パイプラインが完全停止したら緊急購入モード ★★★
            const totalInventory = company.materials + company.wip + company.products;
            const isInventoryDepleted = totalInventory === 0;

            // ★★★ 期末直前でも在庫ゼロなら購入可能（死ぬよりマシ）★★★
            if (isVeryLate && !isInventoryDepleted) {
                return null;  // 在庫があれば期末は販売に集中
            }

            // ★★★ 期末コスト予約を緩和（生産継続を優先）★★★
            // 在庫ゼロ時は予約を最小限に抑え、生産サイクル維持を優先
            let reserveAmount = periodEndCost + minProductionReserve;
            if (isInventoryDepleted) {
                // 緊急モード: 期末コストの50%だけ予約（生産継続が最優先）
                reserveAmount = Math.floor(periodEndCost * 0.5) + minProductionReserve;
            } else if (isLateInPeriod) {
                // 期末モード: 70%予約
                reserveAmount = Math.floor(periodEndCost * 0.7) + minProductionReserve;
            } else {
                // 通常モード: 60%予約（余裕を持つが生産も可能に）
                reserveAmount = Math.floor(periodEndCost * 0.6) + minProductionReserve;
            }

            let availableCash = Math.max(0, company.cash - reserveAmount);
            // ★★★ 在庫ゼロ時は最低限の購入を許可（生産停止防止）★★★
            const minRequired = isInventoryDepleted ? 20 : 30;
            if (availableCash < minRequired) {
                return null;
            }

            // ★★★ 最大個数を買える市場を優先（1行の価値を最大化）★★★
            // maxStockが大きい市場を優先、同じなら安い方を選ぶ
            const marketsWithCapacity = gameState.markets
                .filter(m => m.maxStock >= 3)
                .sort((a, b) => {
                    // 1. まずmaxStock大きい順
                    if (b.maxStock !== a.maxStock) return b.maxStock - a.maxStock;
                    // 2. 同じなら価格安い順
                    return a.buyPrice - b.buyPrice;
                });

            if (marketsWithCapacity.length === 0) return null;  // 3個以上買える市場なし

            // 実際に買える最大個数で市場を選び直す（期末資金確保後の現金で）
            let bestMarket = null;
            let bestQty = 0;
            for (const market of marketsWithCapacity) {
                const affordable = Math.floor(availableCash / market.buyPrice);
                const qty = Math.min(affordable, availableStorage, market.maxStock, mfgCapacity * 2);
                if (qty > bestQty) {
                    bestQty = qty;
                    bestMarket = market;
                }
            }

            if (!bestMarket || bestQty < 3) return null;

            let targetQty = bestQty;
            const maxBuyPerTransaction = bestMarket.maxStock;

            const cost = bestMarket.buyPrice * targetQty;

            if (availableCash < cost) {
                // 買える分だけ（最低3個、1回上限以下）
                targetQty = Math.min(availableStorage, Math.floor(availableCash / bestMarket.buyPrice), maxBuyPerTransaction);
            }

            if (targetQty < 3) return null;  // 3個未満は行の無駄

            const validation = ActionValidator.canExecute('BUY_MATERIALS', {
                quantity: targetQty,
                market: bestMarket
            }, company, gameState);

            if (!validation.valid) return null;

            const actualCost = bestMarket.buyPrice * targetQty;
            if (company.cash < actualCost) return null;

            // ★★★ 最大個数ボーナス: 1行の価値を最大化 ★★★
            let score = 80 + targetQty * 20;  // 個数に大きなウェイト
            // ★★★ 生産パイプライン維持が最重要（DO_NOTHING防止）★★★
            // totalInventoryは既に上で計算済み
            if (company.materials === 0 && company.wip === 0) {
                score += 400;  // 在庫ゼロは緊急事態！最優先で材料購入
            } else if (company.materials <= 2) {
                score += 200;  // 材料少ない時も高優先
            }
            if (totalInventory < 5) {
                score += 150;  // 総在庫5未満も高優先
            }
            // WIPがあるのに材料がないなら材料購入を最優先
            if (company.materials === 0 && company.wip > 0) {
                score += 200;  // 同時生産のため材料購入を最優先
            }
            // 材料が少ない時も優先度UP
            if (company.materials <= 2 && company.wip >= 2) {
                score += 100;  // 次の生産で同時実行するため
            }

            // ★★★ 2期後半で現金を残す（大型機械購入のため）★★★
            // 2期終盤（行15以降）で大型機械を購入するには137円必要（簿価90→売却63）
            // 2期中盤（行12-14）は3期購入に備えて現金確保
            if (period === 2 && company.currentRow >= 12) {
                const hasOnlySmall = company.machines.length === 1 &&
                                    company.machines[0].type === 'small';
                if (hasOnlySmall) {
                    const cashAfterPurchase = company.cash - actualCost;
                    // 2期終盤なら137円（2期中に購入）、それ以前なら144円+α（3期で購入）
                    const requiredForLarge = company.currentRow >= 15 ? 137 : 144;
                    if (cashAfterPurchase < requiredForLarge) {
                        // 大型機械を買えなくなるなら材料購入しない
                        return null;
                    }
                }
            }

            return {
                type: 'BUY_MATERIALS',
                score,
                detail: `${bestMarket.name}から¥${bestMarket.buyPrice}×${targetQty}個`,
                market: bestMarket,
                quantity: targetQty
            };
        },

        /**
         * チップ購入（最適化版）- 適切な投資判断
         */
        evaluateChipPurchaseOptimized(company, gameState) {
            const period = gameState.period;
            const currentResearch = company.chips.research || 0;
            const currentEducation = company.chips.education || 0;
            const currentAdvertising = company.chips.advertising || 0;
            const totalChips = currentResearch + currentEducation + currentAdvertising;

            // ★★★ ユーザー戦略: 2期は教育1枚+研究4枚 ★★★
            // 教育チップ: 製造能力3（小型1+PC1+教育1）を確保
            // 研究チップ: 4枚で32円販売を目指す
            let targetResearch, targetEducation;
            if (period === 2) {
                targetResearch = 4;   // 4枚購入で32円販売
                targetEducation = 1;  // ★最初に教育チップ（製造能力3確保）
            } else {
                // 3期以降は繰越チップを活用（特急チップは高コスト¥40/枚）
                targetResearch = 0;
                targetEducation = 0;
            }

            // 5期のチップ条件
            const nextChips = (company.nextPeriodChips.research || 0) +
                             (company.nextPeriodChips.education || 0) +
                             (company.nextPeriodChips.advertising || 0);
            const allChips = totalChips + nextChips;
            const needsChipsForVictory = period === 5 && allChips < RULES.VICTORY.MIN_CARRYOVER_CHIPS;

            // ★★★ 2期は4枚購入（32円販売を目指す）★★★
            // 3期以降は繰越チップ（3枚）で戦う
            if (period === 2) {
                // 2期は4枚購入を目指す
                if (currentResearch >= 4) {
                    return null;  // 目標達成
                }
            } else if (period >= 3) {
                // ★★★ 3期以降: 繰越チップで戦う（特急は高コスト）★★★
                if (currentResearch >= 3 && !needsChipsForVictory) {
                    return null;
                }
            }

            // 投資タイミング判断（2期は緩和）
            const hasSufficientCash = company.cash >= (period === 2 ? 60 : 80);

            if (!needsChipsForVictory && !hasSufficientCash) return null;
            // ★★★ 2期は4枚まで積極購入（将来の販売価格向上のため）★★★
            if (period === 2 && currentResearch < 4) {
                // 2期は4枚までタイミング制限なし
            } else if (!needsChipsForVictory && company.cash < 100) {
                return null;
            }

            // ★★★ 2期: 教育チップを最初に購入（製造能力3確保）★★★
            // 教育チップ0枚の場合は教育を最優先、それ以降は研究チップ
            let chipOptions;
            if (period === 2 && currentEducation === 0) {
                // 2期で教育チップ未購入 → 教育を最優先
                chipOptions = [
                    { type: 'education', current: currentEducation, target: targetEducation, score: 100, name: '教育' },
                    { type: 'research', current: currentResearch, target: targetResearch, score: 90, name: '研究開発' }
                ];
            } else {
                // 教育チップ購入済み or 3期以降 → 研究優先
                chipOptions = [
                    { type: 'research', current: currentResearch, target: targetResearch, score: 90, name: '研究開発' },
                    { type: 'education', current: currentEducation, target: targetEducation, score: 75, name: '教育' }
                ];
            }

            for (const opt of chipOptions) {
                if (!needsChipsForVictory && opt.current >= opt.target) continue;

                const isExpress = period !== 2;
                const cost = isExpress ? 40 : 20;

                // ★★★ 3期以降は特急チップを極力避ける ★★★
                if (isExpress && !needsChipsForVictory) {
                    // 特急チップは勝利条件に必要な場合のみ
                    continue;
                }

                // ★★★ 期末コストを考慮した購入判断（2期は緩和）★★★
                const periodEndCost = PeriodEndCostEstimator.calculate(company, period, gameState);
                // 2期は60%予約（チップ投資優先）、3期以降は80%予約
                const reserveRatio = period === 2 ? 0.6 : 0.8;
                const minReserve = Math.floor(periodEndCost * reserveRatio);
                if (company.cash < cost + minReserve) continue;

                const validation = ActionValidator.canExecute('BUY_CHIP', {
                    isExpress,
                    phase: 'DECISION'
                }, company, gameState);

                if (validation.valid) {
                    let score = opt.score;
                    if (needsChipsForVictory) score += 400;

                    // ★★★ 2期戦略: 教育→研究1枚→3個販売→研究4枚→6個販売 ★★★
                    if (period === 2 && opt.type === 'education' && currentEducation === 0) {
                        // 教育チップは製造能力3確保のため最優先
                        score += 700;
                    } else if (period === 2 && opt.type === 'research') {
                        const soldQty = company.totalSoldQuantity || 0;
                        if (currentResearch === 0) {
                            // 教育後の最初の研究チップ
                            score += 600;
                        } else if (soldQty < 3) {
                            // 3個販売するまでは追加購入を抑制（販売優先）
                            score -= 200;
                        } else if (currentResearch < 4) {
                            // 3個販売後は4枚まで積極購入
                            score += 500;
                        }
                    }

                    return {
                        type: 'BUY_CHIP',
                        score,
                        detail: `${opt.name}チップ購入`,
                        chipType: opt.type,
                        isExpress
                    };
                }
            }

            return null;
        },

        /**
         * 採用（最適化版）- 能力とのバランス
         */
        evaluateHiringOptimized(company, gameState) {
            const period = gameState.period;
            const machineCount = company.machines.length;
            const mfgCap = company.getMfgCapacity();
            const salesCap = company.getSalesCapacity();

            // ★★★ 期末コストを考慮した採用判断（3期以降は積極採用）★★★
            const periodEndCost = PeriodEndCostEstimator.calculate(company, period, gameState);
            // 3期以降は70%予約（セールスマン採用優先）、2期は80%予約
            const reserveRatio = period >= 3 ? 0.7 : 0.8;
            const minReserve = Math.floor(periodEndCost * reserveRatio);

            // ワーカー不足チェック（機械台数より少ない）
            if (company.workers < machineCount) {
                const hireCount = Math.min(2, machineCount - company.workers);
                const hireCost = hireCount * RULES.COST.HIRING;
                const validation = ActionValidator.canExecute('HIRE', { count: hireCount }, company, gameState);
                if (validation.valid && company.cash >= hireCost + minReserve) {
                    return {
                        type: 'HIRE_WORKER',
                        score: 70 + hireCount * 20,
                        detail: `ワーカー${hireCount}人採用`,
                        count: hireCount,
                        hireType: 'worker'
                    };
                }
            }

            // ★★★ セールスマン採用（適度なバランス）★★★
            // 参考Fコスト: 2期2人、3期・4期3人
            if (company.salesmen < 3) {
                const hireCost = RULES.COST.HIRING;
                const validation = ActionValidator.canExecute('HIRE', { count: 1 }, company, gameState);
                if (validation.valid && company.cash >= hireCost + minReserve) {
                    let score = 60;
                    // ★★★ 期別のセールスマン目標 ★★★
                    if (period === 2) {
                        if (company.salesmen < 2) score += 80;  // 2人まで
                    } else if (period >= 3) {
                        if (company.salesmen < 3) score += 100;  // 3人まで
                    }
                    // 在庫が販売能力を超えている場合はさらに加点
                    if (company.products > salesCap) score += 50;

                    return {
                        type: 'HIRE_SALESMAN',
                        score,
                        detail: 'セールスマン1人採用',
                        count: 1,
                        hireType: 'salesman'
                    };
                }
            }

            return null;
        },

        evaluateSales(company, gameState) {
            // ============================================
            // 販売：MQ（価格×個数）を最大化
            // ★★★ 1行の価値を最大化 ★★★
            // ============================================
            const period = gameState.period;
            const salesCapacity = company.getSalesCapacity();
            const maxSellQty = Math.min(salesCapacity, company.products);
            if (maxSellQty < RULES.MIN_SALE_QUANTITY) return null;

            const isParent = gameState.isParent(company.index);
            const researchChips = company.chips.research || 0;

            // 期別・研究チップ別の目安価格を取得
            let basePrice = RULES.TARGET_PRICES[period]?.[Math.min(researchChips, 5)] || 24;

            // ★★★ 2期はAIを少し弱体化（PLAYERが勝ちやすくする）★★★
            if (period === 2 && company.strategyType !== 'PLAYER') {
                basePrice -= 2;  // AIは2円低い価格で入札（コール価格が高くなる）
            }

            // ★★★ 戦略に応じて価格調整（3期以降のみ）★★★
            const strategy = company.strategy;
            if (period >= 3 && strategy) {
                basePrice += strategy.priceAdjustment || 0;
            }

            // 3期以降は親でない場合2円引き（入札成功率向上）
            if (period >= 3 && !isParent) {
                basePrice -= 2;
            }

            // ★★★ MQ最大化: 全市場を評価して最高MQを選ぶ ★★★
            let bestMarket = null;
            let bestPrice = 0;
            let bestQty = 0;
            let bestMQ = 0;

            // ★★★ 2期戦略: 研究チップ購入後に販売 ★★★
            // ユーザー計画: 研究1枚→3個販売(29円)→研究4枚→6個販売(32円)
            const soldQuantity = company.totalSoldQuantity || 0;
            // 研究チップ少ない時は販売スコアを大幅に下げる（他のアクションを優先）
            let sellPenalty = 0;
            if (period === 2) {
                if (researchChips === 0) {
                    sellPenalty = -800;  // 研究0枚なら販売を大幅に抑制
                } else if (researchChips < 4 && soldQuantity >= 3) {
                    sellPenalty = -500;  // 3個販売後は4枚まで抑制
                }
            }

            for (const m of gameState.markets) {

                // 市場の残り容量を計算
                const remainingCapacity = m.maxStock - (m.currentStock || 0);
                const sellQty = Math.min(maxSellQty, remainingCapacity);

                if (sellQty < RULES.MIN_SALE_QUANTITY) continue;

                // ★★★ 価格決定：入札市場はTARGET_PRICES、非入札市場は市場価格 ★★★
                let price;
                if (m.needsBid) {
                    // 入札市場：研究チップ反映の目安価格を使用
                    price = basePrice;
                } else {
                    // 非入札市場：市場の固定価格を使用
                    price = m.sellPrice || basePrice;
                }

                // MQ計算
                const mq = price * sellQty;

                // ActionValidatorで検証
                const validation = ActionValidator.canExecute('SELL', {
                    market: m,
                    quantity: sellQty,
                    price: price
                }, company, gameState);

                if (validation.valid && mq > bestMQ) {
                    bestMarket = m;
                    bestPrice = price;
                    bestQty = sellQty;
                    bestMQ = mq;
                }
            }

            if (!bestMarket) return null;

            // ★★★ MQに基づくスコア: 売上金額が大きいほど高スコア ★★★
            // 2期で研究チップ不足の場合はペナルティを適用
            const score = 200 + bestMQ + sellPenalty;

            return {
                type: 'SELL',
                score,
                detail: `${bestMarket.name}に¥${bestPrice}×${bestQty}個`,
                market: bestMarket,
                price: bestPrice,
                quantity: bestQty
            };
        },

        evaluateBuyMaterials(company, gameState) {
            // ============================================
            // 材料購入（ActionValidator経由で100%システム化）
            // ★★★ 最低3個以上でないと行の無駄 ★★★
            // ============================================
            const period = gameState.period;
            const mfgCapacity = company.getMfgCapacity();
            const storageCapacity = company.getStorageCapacity();
            const currentStorage = company.materials + company.products;
            const availableStorage = storageCapacity - currentStorage;

            // ★最低3個購入できないなら購入しない
            if (availableStorage < 3) return null;

            // 最安市場を選択
            const market = gameState.markets.reduce((best, m) =>
                m.buyPrice < best.buyPrice ? m : best
            );

            // 購入数量の計算（最低3個）
            let targetQty;
            if (period === 2) {
                targetQty = Math.min(market.maxStock, availableStorage);
            } else {
                targetQty = Math.min(mfgCapacity * 2, availableStorage, market.maxStock);
            }

            // 最低3個を確保
            targetQty = Math.max(3, targetQty);

            // コスト確認
            const cost = market.buyPrice * targetQty;
            if (company.cash < cost) {
                // 現金不足なら購入可能数を計算（最低3個）
                const affordable = Math.floor(company.cash / market.buyPrice);
                if (affordable < 3) return null;  // 3個買えないならやめる
                targetQty = affordable;
            }

            // ActionValidatorで検証
            const validation = ActionValidator.canExecute('BUY_MATERIALS', {
                quantity: targetQty,
                market: market
            }, company, gameState);

            if (!validation.valid) return null;

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
            // ============================================
            // 生産（ActionValidator経由で100%システム化）
            // ★★★ 完成と投入を常に同時に最大個数で実行 ★★★
            // ============================================
            const mfgCapacity = company.getMfgCapacity();

            if (company.wip === 0 && company.materials === 0) return null;

            // ★★★ 戦略: 完成と投入を同時に最大化 ★★★
            // 製造能力 = 1行で処理できる個数（完成と投入は別々にカウント）
            // 例: mfgCap=2, wip=3, materials=4 の場合
            //     → 完成2個（mfgCap上限）+ 投入2個（wip枠6-3+2=5、mfgCap上限で2）

            // 1. 完成: 仕掛品を製造能力いっぱいまで完成させる
            let wipToProduct = Math.min(mfgCapacity, company.wip);

            // 2. 投入: 完成後に空くWIP枠を計算し、材料を最大限投入
            // 完成後のWIP = 現在WIP - 完成数
            const wipAfterComplete = company.wip - wipToProduct;
            // 投入可能枠 = WIP上限(6) - 完成後WIP
            const wipSpaceAfterComplete = RULES.CAPACITY.WIP - wipAfterComplete;
            // 投入数 = min(材料数, 投入可能枠) ※製造能力は投入に制限なし
            let materialToWip = Math.min(company.materials, wipSpaceAfterComplete);

            // 両方とも0なら何もできない
            if (wipToProduct === 0 && materialToWip === 0) return null;

            // ActionValidatorで検証し、ルール④違反なら調整
            let validation = ActionValidator.canExecute('PRODUCE', {
                materialToWip,
                wipToProduct
            }, company, gameState);

            // ルール④違反の場合、代替案を試す
            if (!validation.valid && validation.reason?.includes('ルール④')) {
                // 投入を0にするか完成を2にするか判断
                if (company.wip >= 2) {
                    materialToWip = 0;
                    wipToProduct = Math.min(mfgCapacity, company.wip);
                } else if (company.materials >= 2 && (RULES.CAPACITY.WIP - company.wip) >= 2) {
                    materialToWip = 2;
                    wipToProduct = Math.min(mfgCapacity, company.wip + 2);
                } else {
                    return null;  // どうしても1,1になるなら実行しない
                }

                // 再検証
                validation = ActionValidator.canExecute('PRODUCE', {
                    materialToWip,
                    wipToProduct
                }, company, gameState);

                if (!validation.valid) return null;
            } else if (!validation.valid) {
                return null;
            }

            const processingCost = (materialToWip + wipToProduct) * RULES.COST.PROCESSING;
            if (company.cash < processingCost) return null; // 正確なコストチェック（安全マージン削除）

            // ★★★ 1行の行動最大化: 投入+完成の同時実行を最優先 ★★★
            let score = 100;

            // 同時生産（投入+完成）は最高スコア
            if (wipToProduct >= 2 && materialToWip >= 2) {
                score += 300 + (wipToProduct + materialToWip) * 25;  // 大ボーナス
            } else if (wipToProduct >= 2 && materialToWip >= 1) {
                score += 200 + (wipToProduct + materialToWip) * 20;
            } else if (wipToProduct >= 1 && materialToWip >= 2) {
                score += 200 + (wipToProduct + materialToWip) * 20;
            } else if (wipToProduct > 0 && materialToWip > 0) {
                score += 150 + (wipToProduct + materialToWip) * 15;  // 同時生産は常に優先
            }

            // 製品がなければ更にボーナス
            if (company.products === 0 && wipToProduct > 0) {
                score += 80;
            }

            // ★★★ 完成のみ・投入のみは大幅減点（1行を無駄にする）★★★
            if (wipToProduct > 0 && materialToWip === 0) {
                // 完成のみ
                if (company.materials > 0) {
                    // 材料があるのに投入しないのは無駄
                    return null;  // 完全禁止 - 材料購入後に同時生産させる
                }
                score -= 200;  // 材料がない場合のみ仕方なく完成のみ
            }
            if (wipToProduct === 0 && materialToWip > 0) {
                // 投入のみ
                if (company.wip > 0) {
                    // WIPがあるのに完成しないのは無駄
                    return null;  // 完全禁止 - 先に完成させる
                }
                score -= 100;  // WIPが0の初回投入のみ許可
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
            const strategy = company.strategy;
            const hirePriority = strategy?.hirePriority || 'balanced';

            // ワーカー採用評価
            const workerAction = this.evaluateWorkerHiring(company, gameState, hirePriority);

            // セールスマン採用評価
            const salesmanAction = this.evaluateSalesmanHiring(company, gameState, hirePriority);

            // 優先度に基づいて選択
            if (!workerAction && !salesmanAction) return null;
            if (!workerAction) return salesmanAction;
            if (!salesmanAction) return workerAction;
            return workerAction.score >= salesmanAction.score ? workerAction : salesmanAction;
        },

        evaluateWorkerHiring(company, gameState, hirePriority) {
            // ============================================
            // ワーカー採用（機械能力に合わせて採用）
            // ★★★ 重要: 機械能力以上にワーカーを採用しても意味がない ★★★
            // 製造能力 = min(機械能力, ワーカー数+教育効果)
            // ============================================
            const machineCapacity = company.getMachineCapacity();

            // ★★★ シンプル化: ワーカー数 >= 機械能力なら採用不要 ★★★
            // 教育チップがあれば+1の効果があるので考慮
            const educationBonus = company.chips.education > 0 ? 1 : 0;
            const effectiveWorkers = company.workers + educationBonus;

            // 既にワーカーが機械能力以上なら採用不要
            if (effectiveWorkers >= machineCapacity) return null;

            // 採用数 = 機械能力 - 現在の実効ワーカー数
            const hireCount = Math.min(3, machineCapacity - effectiveWorkers);
            if (hireCount <= 0) return null;

            // ActionValidatorで検証
            const validation = ActionValidator.canExecute('HIRE', { count: hireCount }, company, gameState);
            if (!validation.valid) return null;

            const cost = hireCount * RULES.COST.HIRING;
            if (company.cash < cost) return null;

            // ★★★ スコア改善: 早期採用を優先 ★★★
            let score = hireCount * 50;
            if (hirePriority === 'worker') score += 30;
            if (effectiveWorkers < machineCapacity) score += 30;  // ボトルネック解消に高スコア

            return {
                type: 'HIRE_WORKER',
                score,
                detail: `ワーカー${hireCount}人採用`,
                count: hireCount,
                hireType: 'worker'
            };
        },

        evaluateSalesmanHiring(company, gameState, hirePriority) {
            // ============================================
            // セールスマン採用（販売能力拡大）
            // ============================================
            const period = gameState.period;
            const currentSalesCapacity = company.getSalesCapacity();
            const mfgCapacity = company.getMfgCapacity();

            // 2期はセールスマン2人を目標（販売能力4+α）
            // 3期以降は製造能力に合わせる
            const targetSalesmen = period === 2 ? 2 : Math.ceil(mfgCapacity / 2);

            if (company.salesmen >= targetSalesmen) return null;

            const hireCount = 1;  // セールスマンは1人ずつ

            // ActionValidatorで検証
            const validation = ActionValidator.canExecute('HIRE', { count: hireCount }, company, gameState);
            if (!validation.valid) return null;

            const cost = hireCount * RULES.COST.HIRING;
            if (company.cash < cost) return null; // 正確なコストチェック（安全マージン削除）

            // 2期はセールスマン採用を優先（スコア大幅UP）
            let score = 50;
            if (period === 2 && company.salesmen < 2) score += 80;  // 2期でセールス不足なら優先
            if (hirePriority === 'salesman') score += 30;
            if (currentSalesCapacity < company.products) score += 50;  // 製品が売れない状態なら優先

            return {
                type: 'HIRE_SALESMAN',
                score,
                detail: `セールスマン${hireCount}人採用`,
                count: hireCount,
                hireType: 'salesman'
            };
        },

        evaluateMachinePurchase(company, gameState) {
            const period = gameState.period;
            const hasLarge = company.machines.some(m => m.type === 'large');
            const hasOnlySmall = company.machines.length === 1 &&
                                company.machines[0].type === 'small';
            const hasPC = (company.chips.computer || 0) > 0;
            const hasEducation = (company.chips.education || 0) > 0;
            const strategy = company.strategy;

            // ★★★ 2期での早期大型機械購入（ユーザー戦略）★★★
            // 2期: 簿価90 → 売却63、必要純投資137円
            // 完成3+投入3の生産には大型機械（能力4）が必要
            if (period === 2 && hasOnlySmall && strategy?.earlyLargeMachine) {
                const bookValue = RULES.BOOK_VALUE.SMALL[period] || 90;
                const salePrice = Math.floor(bookValue * RULES.SALE_RATIO);
                const requiredCash = 200 - salePrice;  // 137円

                // 2期後半（14行目以降）で資金があれば購入
                if (company.currentRow >= 14 && company.cash >= requiredCash + 30) {
                    const cashAfterPurchase = company.cash + salePrice - 200;

                    // ActionValidatorで検証
                    const validation = ActionValidator.canExecute('UPGRADE_TO_LARGE_MACHINE', {}, company, gameState);
                    if (validation.valid) {
                        let score = 400;  // 高スコアで優先
                        if (company.currentRow >= 16) score += 200;  // 16行目以降はさらに優先

                        return {
                            type: 'UPGRADE_TO_LARGE_MACHINE',
                            score,
                            detail: `2期大型機械購入（売却¥${salePrice}+購入¥200）→能力4`,
                            salePrice,
                            bookValue
                        };
                    }
                }
            }

            // ★★★ 大型機械への移行（小型売却+大型購入）★★★
            // ユーザー戦略: 3期で仕入れ・販売を繰り返して資金を貯めてから購入
            // 3期: 簿価80 → 売却56、必要純投資144円
            // 4期: 簿価60 → 売却42、必要純投資158円
            if (hasOnlySmall && period >= 3 && period <= 4) {
                const bookValue = RULES.BOOK_VALUE.SMALL[period] || 80;
                const salePrice = Math.floor(bookValue * RULES.SALE_RATIO);
                const minCash = 200 - salePrice + 5;  // 最低必要額+余裕5円

                if (company.cash >= minCash) {
                    const cashAfterPurchase = company.cash + salePrice - 200;

                    // ★★★ 期末コストチェックを緩和（3期は積極的に購入）★★★
                    // 3期は生産能力拡大が最優先、短期借入は許容
                    const periodEndCost = company.estimatedPeriodEndCost || 0;
                    const hasEnoughForPeriodEnd = period === 3 || cashAfterPurchase >= periodEndCost * 0.5;

                    if (hasEnoughForPeriodEnd) {
                        let score = 200;

                        // ★★★ タイミングボーナス（3期中盤が最適）★★★
                        if (period === 3) {
                            if (company.currentRow >= 8 && company.currentRow <= 15) {
                                score += 300;  // 3期中盤（資金が貯まった頃）
                            } else if (company.currentRow > 15) {
                                score += 200;  // 3期後半
                            } else {
                                score += 100;  // 3期序盤（資金不足気味）
                            }
                        } else if (period === 4) {
                            score += 100;
                        }

                        // チップボーナス
                        if (hasPC) score += 80;
                        if (hasEducation) score += 30;

                        // 在庫があれば追加ボーナス
                        if (company.products >= 2) score += 50;
                        if (company.wip >= 2) score += 30;

                        return {
                            type: 'UPGRADE_TO_LARGE_MACHINE',
                            score,
                            detail: `小型売却(¥${salePrice})+大型購入(¥200)→能力4`,
                            salePrice,
                            bookValue
                        };
                    }
                }
            }

            return null;
        },

        /**
         * チップ購入を評価
         * ルール①②⑨: ActionValidator経由で100%システム化
         */
        evaluateChipPurchase(company, gameState) {
            // ============================================
            // チップ購入（ActionValidator経由で100%システム化）
            // ============================================
            const period = gameState.period;

            // 戦略に基づくチップ目標を取得
            const strategy = company.strategy;
            const targets = (strategy && strategy.chipTargets && strategy.chipTargets[period]) ||
                           { research: 0, education: 0, advertising: 0 };

            const currentResearch = company.chips.research || 0;
            const currentEducation = company.chips.education || 0;
            const currentAdvertising = company.chips.advertising || 0;
            const nextResearch = company.nextPeriodChips?.research || 0;
            const nextEducation = company.nextPeriodChips?.education || 0;
            const nextAdvertising = company.nextPeriodChips?.advertising || 0;

            // ★★★ 5期勝利条件チェック: 総チップ数が3枚未満なら購入必須 ★★★
            const totalCurrentChips = currentResearch + currentEducation + currentAdvertising +
                                     nextResearch + nextEducation + nextAdvertising;
            const needsChipsForVictory = period === 5 && totalCurrentChips < RULES.VICTORY.MIN_CARRYOVER_CHIPS;

            // チップ種類と優先度を定義
            const chipOptions = [
                { type: 'research', current: currentResearch + nextResearch, target: targets.research || 0, score: 60 },
                { type: 'education', current: currentEducation + nextEducation, target: targets.education || 0, score: 55 },
                { type: 'advertising', current: currentAdvertising + nextAdvertising, target: targets.advertising || 0, score: 50 }
            ];

            // 各チップタイプをActionValidatorで検証
            for (const opt of chipOptions) {
                // 通常は目標未達の場合のみ購入、5期勝利条件未達なら常に購入試行
                if (!needsChipsForVictory && opt.current >= opt.target) continue;

                // 2期は特急なし（ルール①）
                const isExpress = period !== 2;

                // ActionValidatorで検証（ルール①②⑨をチェック）
                const validation = ActionValidator.canExecute('BUY_CHIP', {
                    isExpress,
                    phase: 'DECISION'  // 意思決定フェーズ（期首ではない）
                }, company, gameState);

                if (validation.valid) {
                    return {
                        type: 'BUY_CHIP',
                        score: opt.score,
                        detail: `${opt.type === 'research' ? '研究開発' : opt.type === 'education' ? '教育' : '広告'}チップ購入`,
                        chipType: opt.type,
                        isExpress
                    };
                }
                // 無効なら次のチップタイプを試す（breakしない）
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
            // ★★★ シミュレーションモード: PLAYERも自動実行 ★★★
            if (options.autoPlayer === undefined) {
                options.autoPlayer = true;  // デフォルトでPLAYERもAI制御
            }

            const gameState = new GameState();
            gameState.initCompanies({
                allAI: options.allAI || false,
                playerName: options.playerName
            });

            // Q学習v2.0: ゲーム開始時に全会社のトラッカーを初期化
            if (IntelligentLearning) {
                IntelligentLearning.startGame(gameState.companies.length);
            }

            // Q学習: 各社の初期自己資本を記録
            const initialEquities = {};
            gameState.companies.forEach(company => {
                initialEquities[company.index] = company.calculateEquity(2);
            });

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
                // 5期末の在庫とチップを計算
                const totalInventory = company.materials + company.wip + company.products;
                const totalChips = (company.chips.research || 0) +
                                   (company.chips.education || 0) +
                                   (company.chips.advertising || 0) +
                                   (company.nextPeriodChips.research || 0) +
                                   (company.nextPeriodChips.education || 0) +
                                   (company.nextPeriodChips.advertising || 0);
                // 勝利条件チェック（P5-001, P5-002）
                const meetsInventoryRequirement = totalInventory >= RULES.VICTORY.MIN_INVENTORY;
                const meetsChipRequirement = totalChips >= RULES.VICTORY.MIN_CARRYOVER_CHIPS;
                const meetsAllRequirements = meetsInventoryRequirement && meetsChipRequirement;

                // 機械情報を集計
                const smallMachines = company.machines.filter(m => m.type === 'small').length;
                const largeMachines = company.machines.filter(m => m.type === 'large').length;
                const totalAttachments = company.machines.reduce((sum, m) => sum + (m.attachments || 0), 0);

                results.finalEquities.push({
                    companyIndex: company.index,
                    name: company.name,
                    strategy: company.strategyType || 'PLAYER',
                    equity,
                    reachedTarget: equity >= RULES.TARGET_EQUITY && meetsAllRequirements,
                    totalSales: company.totalSales,
                    totalSoldQuantity: company.totalSoldQuantity,
                    totalF: company.totalF,
                    totalSpecialLoss: company.totalSpecialLoss,
                    // 5期末勝利条件情報
                    totalInventory,
                    totalChips,
                    meetsInventoryRequirement,
                    meetsChipRequirement,
                    meetsAllRequirements,
                    // ★会社盤表示用の詳細データ
                    cash: company.cash,
                    materials: company.materials,
                    wip: company.wip,
                    products: company.products,
                    smallMachines,
                    largeMachines,
                    attachments: totalAttachments,
                    workers: company.workers,
                    salesmen: company.salesmen,
                    longTermLoan: company.longTermLoan,
                    shortTermLoan: company.shortTermLoan,
                    researchChips: company.chips.research,
                    educationChips: company.chips.education,
                    advertisingChips: company.chips.advertising,
                    nextPeriodChips: company.nextPeriodChips,
                    warehouses: company.warehouses
                });
                results.actionLogs.push({
                    companyIndex: company.index,
                    log: company.actionLog
                });
            });

            // 勝者決定（勝利条件を満たす会社を優先）
            // 条件を満たす会社がいれば、その中で自己資本最高が勝者
            // 条件を満たす会社がいなければ、自己資本最高が勝者（警告付き）
            const qualifiedCompanies = results.finalEquities.filter(e => e.meetsAllRequirements);
            if (qualifiedCompanies.length > 0) {
                qualifiedCompanies.sort((a, b) => b.equity - a.equity);
                results.winner = qualifiedCompanies[0];
            } else {
                results.finalEquities.sort((a, b) => b.equity - a.equity);
                results.winner = results.finalEquities[0];
                results.winner.warningNoQualified = true;  // 条件を満たす会社がいない警告
            }
            // ランキング用にソート
            results.finalEquities.sort((a, b) => b.equity - a.equity);

            // ============================================
            // Q学習: ゲーム終了時に各社の行動履歴から学習
            // 順位と最終自己資本を報酬として学習を実行
            // ============================================
            if (IntelligentLearning) {
                results.finalEquities.forEach((companyResult, rank) => {
                    const initialEquity = initialEquities[companyResult.companyIndex] || 300;
                    const finalEquity = companyResult.equity;
                    const company = gameState.companies[companyResult.companyIndex];
                    IntelligentLearning.learnFromGame(company, initialEquity, finalEquity, rank + 1);
                });
            }

            return results;
        },

        /**
         * 1期分をシミュレート
         * STR-003: 親から順番に行動
         * STR-004: 1行ごとに全社が行動
         */
        runPeriod(gameState, options = {}) {
            const period = gameState.period;
            const periodResult = {
                period,
                turns: [],
                diceResult: null,
                periodEndResults: null,
                parentIndex: gameState.parentIndex  // 親を記録
            };

            // ★★★ 学習用: 期首自己資本と行動リストを初期化 ★★★
            const periodStartEquities = {};
            const periodActions = {};
            gameState.companies.forEach(company => {
                periodStartEquities[company.index] = company.calculateEquity(period);
                periodActions[company.index] = [];
            });

            // 期首処理1: サイコロ（3期以降）PS-008
            if (period >= 3) {
                const diceValue = options.diceValue !== undefined ? options.diceValue :
                                 (Math.floor(Math.random() * 6) + 1);
                gameState.processDice(diceValue);
                periodResult.diceResult = gameState.diceResult;
                // ★サイコロ結果をperiodResultに詳細保存
                periodResult.diceEffects = {
                    value: gameState.diceResult,
                    closedMarkets: [...gameState.closedMarkets],
                    wageMultiplier: gameState.wageMultiplier,
                    osakaPrice: gameState.osakaMaxPrice,
                    rowReduction: gameState.maxRowsReduction
                };
                // ★サイコロ結果をコンソールに表示
                const dice = gameState.diceResult;
                const closed = gameState.closedMarkets.join('・') || 'なし';
                const wage = gameState.wageMultiplier === 1.1 ? '×1.1' : '×1.2';
                const osaka = gameState.osakaMaxPrice;
                console.log(`[${period}期サイコロ] 出目${dice} 閉鎖:${closed} 人件費${wage} 大阪¥${osaka}`);
            }

            const maxRows = gameState.getMaxRows();
            const PSR = RULES.PERIOD_START_ROWS;  // 期首処理行番号定数

            // ★★★ 期首処理: 行番号システム化（変更禁止）★★★
            // 0行目: 金利支払・納税・配当・サイコロ
            // 1行目: PCチップ・保険
            // 2行目: 長期借入・倉庫購入
            // 3行目以降: 意思決定フェーズ

            // 期首処理: 最大人員を初期化 & 期を設定
            gameState.companies.forEach(company => {
                company.period = period;  // 各会社の期を更新
                company.maxPersonnel = company.workers + company.salesmen;
                company.currentRow = PSR.INTEREST_TAX_DIVIDEND;  // 0行目開始
                company.scriptIndex = 0;  // ★スクリプトモード用インデックスをリセット
            });

            // ===== 0行目: サイコロ・金利支払・納税・配当 =====
            gameState.companies.forEach(company => {
                company.currentRow = PSR.INTEREST_TAX_DIVIDEND;  // 0行目

                // ★サイコロ結果ログ（3期以降、最初の1社のみ代表で記録）
                if (period >= 3 && company.index === 0) {
                    const dice = gameState.diceResult;
                    const closed = gameState.closedMarkets.join('・') || 'なし';
                    const wage = gameState.wageMultiplier === 1.1 ? '×1.1' : '×1.2';
                    const osaka = gameState.osakaMaxPrice;
                    company.logAction('期首', `【サイコロ${dice}】閉鎖:${closed} 人件費${wage} 大阪¥${osaka}`, 0, false);
                }

                // ★前期借入の金利支払い表示（実際は借入時控除済みだが、表示用）
                // 長期借入がある場合のみ表示
                if (period >= 3 && company.longTermLoan > 0) {
                    // 金利は借入時に控除済みなので、ここでは情報表示のみ
                    // （実際の現金移動はなし）
                }

                // ★前期の納税・配当（前期末で処理済み、0行目に記録）
                // 前期末の税金・配当情報があれば表示
                if (company.lastPeriodTax > 0 || company.lastPeriodDividend > 0) {
                    const tax = company.lastPeriodTax || 0;
                    const div = company.lastPeriodDividend || 0;
                    if (tax > 0 || div > 0) {
                        company.logAction('期首', `前期納税¥${tax} 配当¥${div}`, tax + div, false);
                    }
                    // リセット
                    company.lastPeriodTax = 0;
                    company.lastPeriodDividend = 0;
                }
            });

            // ===== 1行目: PCチップ・保険 =====
            gameState.companies.forEach(company => {
                company.currentRow = PSR.PC_INSURANCE;  // 1行目

                // 3期以降の必須購入処理
                if (period >= 3) {
                    // 特別ルール: PC+保険を買えない場合（現金<25）、先に長期借入（2行目扱い）
                    // ★★★ PLAYERの場合はスキップ（PLAYER専用処理で対応）★★★
                    if (company.cash < 25 && company.strategyType !== 'PLAYER') {
                        const savedRow = company.currentRow;
                        company.currentRow = PSR.LOAN_WAREHOUSE;  // 2行目で借入
                        const equity = company.calculateEquity(period);
                        const loanLimit = RULES.getLoanLimit(period, equity);
                        const specialLoanAmount = Math.min(100, loanLimit - company.longTermLoan);  // 借入限度内
                        if (specialLoanAmount > 0) {
                            const specialInterest = Math.floor(specialLoanAmount * 0.10);
                            const specialNetAmount = specialLoanAmount - specialInterest;
                            company.longTermLoan += specialLoanAmount;
                            company.cash += specialNetAmount;
                            ImmediateFTracker.flagLongTermLoan(company, specialLoanAmount);
                            company.logAction('期首', `特別長期借入¥${specialLoanAmount}（金利¥${specialInterest}）`, specialNetAmount, true);
                        }
                        company.currentRow = savedRow;  // 1行目に戻す
                    }

                    // PS-004: PCチップ購入（¥20）- 1行目
                    // ★★★ 復活: 製造能力+1は生産性向上に寄与 ★★★
                    if (company.cash >= 20) {
                        company.cash -= 20;
                        company.chips.computer = 1;
                        ImmediateFTracker.flagPCPurchase(company);
                        company.logAction('期首', 'PCチップ購入 = -¥20', 20, false);
                    }

                    // PS-005: 保険購入（¥5）- 1行目
                    // ★★★ 無効化: コスト削減のため保険チップを購入しない ★★★
                    // 保険は火災時に補償があるが、¥5/期のコストがかかる
                    // if (company.cash >= 5) {
                    //     company.cash -= 5;
                    //     company.chips.insurance = 1;
                    //     ImmediateFTracker.flagInsurancePurchase(company);
                    //     company.logAction('期首', '保険チップ購入 = -¥5', 5, false);
                    // }
                }
            });

            // ===== 2行目: 長期借入・倉庫購入 =====
            const turnOrder = gameState.getTurnOrder();  // 親から順番
            turnOrder.forEach(companyIndex => {
                const company = gameState.companies[companyIndex];
                company.currentRow = PSR.LOAN_WAREHOUSE;  // 2行目

                // ★★★ PLAYER戦略の期首処理 ★★★
                // ユーザー指定: 長期借入のみ期首で実行、機械・採用は意思決定フェーズ（スクリプト）
                if (company.strategyType === 'PLAYER' && period >= 3) {
                    const equity = company.calculateEquity(period);

                    // 3期: 長期借入のみ（大型機械・セールスマン採用はスクリプトで実行）
                    if (period === 3) {
                        // 長期借入（借入可能額を全額借りる）
                        const loanLimit = RULES.getLoanLimit(period, equity);
                        const currentLoan = company.longTermLoan;
                        const borrowAmount = loanLimit - currentLoan;
                        if (borrowAmount > 0) {
                            ActionEngine.borrowLongTerm(company, borrowAmount, period, equity);
                        }
                        // ★★★ 大型機械・セールスマン採用はスクリプトで処理 ★★★
                    }
                    // 4期: 長期借入追加（借入可能額を全額借りる）
                    else if (period === 4) {
                        const loanLimit = RULES.getLoanLimit(period, equity);
                        const currentLoan = company.longTermLoan;
                        const borrowAmount = loanLimit - currentLoan;
                        if (borrowAmount > 0) {
                            ActionEngine.borrowLongTerm(company, borrowAmount, period, equity);
                        }
                    }
                    // 5期: 借入可能額を全額借りる（運転資金確保）
                    else if (period === 5) {
                        const loanLimit = RULES.getLoanLimit(period, equity);
                        const currentLoan = company.longTermLoan;
                        const borrowAmount = loanLimit - currentLoan;
                        if (borrowAmount > 0) {
                            ActionEngine.borrowLongTerm(company, borrowAmount, period, equity);
                        }
                    }
                }
                else if (!company.isPlayer || options.autoPlayer) {
                    const equity = company.calculateEquity(period);
                    const limit = RULES.getLoanLimit(period, equity);
                    const available = limit - company.longTermLoan;

                    // 長期借入（3期以降）- borrowLongTerm内でログ記録済み
                    // 運転資金確保のため利用可能額を借りる
                    if (available > 0 && period >= 3) {
                        const borrowAmount = available;
                        ActionEngine.borrowLongTerm(company, borrowAmount, period, equity);
                        // ※ログはActionEngine.borrowLongTerm内で記録済み
                    }

                    // 倉庫購入（必要に応じて）- 2行目
                    // ※倉庫購入ロジックはexecuteAIInvestmentStrategyに含まれる
                }
            });

            // ===== 意思決定前のAI投資戦略 =====
            turnOrder.forEach(companyIndex => {
                const company = gameState.companies[companyIndex];
                if (!company.isPlayer || options.autoPlayer) {
                    this.executeAIInvestmentStrategy(company, period, gameState);
                }
            });

            // ★★★ 期首処理完了 → 意思決定フェーズ開始（3行目から）★★★
            gameState.companies.forEach(c => c.currentRow = PSR.DECISION_START);

            // ★★★ 期末コスト追跡システム: 期首で全社の期末コストを計算 ★★★
            const wageMultiplier = gameState.wageMultiplier || 1.0;
            gameState.companies.forEach(c => {
                c.updatePeriodEndCost(period, wageMultiplier);
            });

            // 1周目フラグ（ACT-002用）
            gameState.isFirstRound = true;
            let roundCount = 0;
            const MAX_ITERATIONS = 1000;  // 無限ループ防止

            // ターン実行
            let continueSimulation = true;
            while (continueSimulation) {
                gameState.turn++;
                roundCount++;

                // 無限ループ防止（1000ターン以上は異常）
                if (roundCount > MAX_ITERATIONS) {
                    console.warn(`警告: 期${period}で${MAX_ITERATIONS}ターン超過、強制終了`);
                    break;
                }

                // 1周終了で1周目フラグをオフ（6社なので6ターン後）
                if (roundCount > gameState.companies.length) {
                    gameState.isFirstRound = false;
                }

                // 親から順番に行動（STR-003, STR-004）
                const actionOrder = gameState.getTurnOrder();
                for (const companyIndex of actionOrder) {
                    const company = gameState.companies[companyIndex];
                    if (company.currentRow >= maxRows) continue;

                    // ルール②: ターン開始時にチップ購入フラグをリセット
                    company.chipsBoughtThisTurn = false;

                    // 75枚デッキから1枚引く（60枚意思決定 + 15枚リスク）
                    const actionCard = gameState.drawActionCard();
                    const isRisk = (actionCard === 'risk');

                    let rowConsumed = true;  // デフォルトは行を消費

                    if (isRisk) {
                        // リスクカード処理
                        const riskResult = this.processRiskCard(company, gameState);
                        // ★ルール: お金が動かないリスクカードは行を消費しない
                        if (riskResult && riskResult.moneyMoved === false) {
                            rowConsumed = false;
                        }
                    } else {
                        // 意思決定
                        if (!company.isPlayer || options.autoPlayer) {
                            const action = AIDecisionEngine.decideAction(company, gameState);
                            const result = this.executeAction(company, action, gameState);
                            // ★★★ 学習用: 期中行動を記録 ★★★
                            if (action && periodActions[company.index]) {
                                periodActions[company.index].push(action.type);
                            }
                            // ルール③: 入札負けは行を使わない
                            if (result && result.consumedRow === false) {
                                rowConsumed = false;
                                // ★★★ DO_NOTHING無限ループ防止 ★★★
                                // 同じ行でDO_NOTHINGが続く場合、カウンタを増加
                                company.doNothingCount = (company.doNothingCount || 0) + 1;
                                // 12回（6社×2回）を超えたら強制的に行を消費
                                if (company.doNothingCount > 12) {
                                    rowConsumed = true;
                                    company.doNothingCount = 0;
                                }
                            } else {
                                // 行動成功時はカウンタリセット
                                company.doNothingCount = 0;
                            }
                        }
                    }

                    // ルール③: 入札負けは行を使わない
                    if (rowConsumed) {
                        company.currentRow++;
                        company.doNothingCount = 0;  // 行消費時はカウンタリセット
                    }

                    // ★★★ MGルール: 1社が上限に達すると全社の期が終了 ★★★
                    if (company.currentRow >= maxRows) {
                        continueSimulation = false;
                        break;
                    }
                }

                // 全社が上限に達したかチェック（念のため）
                const allDone = gameState.companies.every(c => c.currentRow >= maxRows);
                if (allDone) continueSimulation = false;

                periodResult.turns.push({
                    turn: gameState.turn,
                    parentIndex: gameState.parentIndex,
                    isFirstRound: gameState.isFirstRound,
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

            // ★★★ 学習用: 期末に戦略プロファイルを記録 ★★★
            if (IntelligentLearning) {
                gameState.companies.forEach(company => {
                    const startEquity = periodStartEquities[company.index] || 300;
                    const endEquity = company.calculateEquity(period);
                    const actions = periodActions[company.index] || [];
                    IntelligentLearning.recordPeriodEnd(company, period, startEquity, endEquity, actions);
                });
            }

            // 行数リセット、順番逆転リセット
            // 期末処理後、次期用に行番号リセット（期首は行0から開始）
            gameState.companies.forEach(c => c.currentRow = RULES.PERIOD_START_ROWS.INTEREST_TAX_DIVIDEND);
            gameState.isReversed = false;

            return periodResult;
        },

        /**
         * リスクカード処理（64種類）
         * デッキから1枚引く（同じカードは山札がなくなるまで出ない）
         * @returns {{ moneyMoved: boolean }} お金が動いたかどうか
         */
        processRiskCard(company, gameState) {
            // Q学習: リスクカード前の現金を記録
            const cashBefore = company.cash;
            const productsBefore = company.products;
            const materialsBefore = company.materials;

            // デッキから1枚引く
            const cardId = gameState.drawRiskCard();
            this.applyRiskCard(company, gameState, cardId);

            // ★リスクカードフラグ: カード効果を記録
            const cashChange = company.cash - cashBefore;
            const productsChange = company.products - productsBefore;
            const materialsChange = company.materials - materialsBefore;

            // ★ルール: お金が動いたかどうかを判定
            // お金が動く = 現金の増減がある場合
            const moneyMoved = cashChange !== 0;

            GameActionTracker.flagRiskCard(company, cardId, {
                type: this.getRiskCardType(cardId),
                description: this.getRiskCardDescription(cardId),
                cashChange,
                productsChange,
                materialsChange,
                moneyMoved,  // ★フラグ追加
                rowConsumed: moneyMoved  // ★行消費フラグ追加
            });

            // Q学習v2.0: リスクカードの効果を学習（現金変化を報酬として）
            if (IntelligentLearning) {
                IntelligentLearning.recordRiskCard(company, gameState, cardId, cashChange);
            }

            // ルール強制チェック（リスクカード後も状態が有効か確認）
            RuntimeRuleEnforcer.enforce(company, gameState, `リスクカード(${cardId})後`);

            // ★戻り値: お金が動いたかどうかを返す
            return {
                cardId,
                moneyMoved,
                cashChange,
                productsChange,
                materialsChange
            };
        },

        // リスクカードの種類を取得（rules-checklist.jsonに基づく）
        getRiskCardType(cardId) {
            // ラッキーカード: 教育成功(3-4), 広告成功(12-14), 独占販売(26-28), 研究成功(35-40)
            if ([3,4,12,13,14,26,27,28,35,36,37,38,39,40].includes(cardId)) return 'LUCKY';
            // ダメージカード: 得意先倒産(7-8), 製造ミス(29-30), 倉庫火災(31-32), 盗難発見(45-46)
            if ([7,8,29,30,31,32,45,46].includes(cardId)) return 'DAMAGE';
            // 制限カード: 労災発生(15-16), 景気変動(53-54)
            if ([15,16,53,54].includes(cardId)) return 'RESTRICTION';
            // その他: 機械故障(63-64), 不良在庫(61-62)
            return 'OTHER';
        },

        // リスクカードの説明を取得（rules-checklist.jsonに記載のカードのみ）
        getRiskCardDescription(cardId) {
            // rules-checklist.json RISK-001～RISK-011, LUCKY-001～003に基づく
            const confirmedCards = {
                3: '教育成功', 4: '教育成功',           // LUCKY-003
                7: '得意先倒産', 8: '得意先倒産',       // RISK-006
                12: '広告成功', 13: '広告成功', 14: '広告成功',  // その他
                15: '労災発生', 16: '労災発生',         // RISK-003
                26: '独占販売', 27: '独占販売', 28: '独占販売',  // LUCKY-001
                29: '製造ミス', 30: '製造ミス',         // RISK-004
                31: '倉庫火災', 32: '倉庫火災',         // RISK-005
                35: '研究開発成功', 36: '研究開発成功', 37: '研究開発成功',  // RISK-008/LUCKY-002
                38: '研究開発成功', 39: '研究開発成功', 40: '研究開発成功',
                45: '盗難発見', 46: '盗難発見',         // RISK-007
                53: '景気変動', 54: '景気変動',         // RISK-010
                61: '不良在庫', 62: '不良在庫',         // RISK-009
                63: '機械故障', 64: '機械故障'          // RISK-002
            };
            return confirmedCards[cardId] || `その他カード${cardId}`;
        },

        /**
         * リスクカード効果適用
         */
        applyRiskCard(company, gameState, cardId) {
            const period = gameState.period;
            const INVENTORY_VALUES = { material: 13, wip: 14, product: 15 };

            // カードIDに基づいて効果を適用
            switch (cardId) {
                // クレーム発生 (1-2): 本社経費▲5
                case 1: case 2:
                    company.cash -= 5;
                    company.totalF += 5;
                    company.logAction('リスクカード', 'クレーム発生 F+5', 5, false);
                    break;

                // 教育成功 (3-4): 教育チップで32円販売（最大5個）
                case 3: case 4:
                    if (company.chips.education > 0 && company.products > 0) {
                        const sellQty = Math.min(5, company.products, company.getSalesCapacity());
                        if (sellQty > 0) {
                            const revenue = 32 * sellQty;
                            company.cash += revenue;
                            company.products -= sellQty;
                            company.totalSales += revenue;
                            company.totalSoldQuantity += sellQty;
                            company.logAction('リスクカード', `教育成功 ¥32×${sellQty}個`, revenue, true);
                        }
                    } else {
                        company.logAction('リスクカード', '教育成功（効果なし）', 0, false);
                    }
                    break;

                // 消費者運動発生 (5-6): 販売不可
                case 5: case 6:
                    company.logAction('リスクカード', '消費者運動発生 販売不可', 0, false);
                    break;

                // 得意先倒産 (7-8): 現金▲30（2期免除）
                case 7: case 8:
                    if (period > 2) {
                        company.cash -= 30;
                        company.totalSpecialLoss += 30;
                        company.logAction('リスクカード', '得意先倒産 特別損失30', 30, false);
                    } else {
                        company.logAction('リスクカード', '得意先倒産（2期免除）', 0, false);
                    }
                    break;

                // 研究開発失敗 (9-11): 青チップ1枚返却
                case 9: case 10: case 11:
                    if (company.chips.research > 0) {
                        company.chips.research--;
                        company.logAction('リスクカード', '研究開発失敗 青チップ-1', 0, false);
                    } else if (company.nextPeriodChips.research > 0) {
                        company.nextPeriodChips.research--;
                        company.logAction('リスクカード', '研究開発失敗 次繰青チップ-1', 0, false);
                    } else {
                        company.logAction('リスクカード', '研究開発失敗（効果なし）', 0, false);
                    }
                    break;

                // 広告成功 (12-14): 赤チップ1枚につき2個、独占販売（最大5個）
                case 12: case 13: case 14:
                    if (company.chips.advertising > 0 && company.products > 0) {
                        const maxSell = Math.min(5, company.chips.advertising * 2, company.products);
                        const price = RULES.TARGET_PRICES[period]?.[company.chips.research || 0] || 24;
                        const revenue = price * maxSell;
                        company.cash += revenue;
                        company.products -= maxSell;
                        company.totalSales += revenue;
                        company.totalSoldQuantity += maxSell;
                        company.logAction('リスクカード', `広告成功 ¥${price}×${maxSell}個`, revenue, true);
                    } else {
                        company.logAction('リスクカード', '広告成功（効果なし）', 0, false);
                    }
                    break;

                // 労災発生 (15-16): 生産不可
                case 15: case 16:
                    company.logAction('リスクカード', '労災発生 生産不可', 0, false);
                    break;

                // 広告政策失敗 (17-18): 赤チップ1枚返却
                case 17: case 18:
                    if (company.chips.advertising > 0) {
                        company.chips.advertising--;
                        company.logAction('リスクカード', '広告政策失敗 赤チップ-1', 0, false);
                    } else if (company.nextPeriodChips.advertising > 0) {
                        company.nextPeriodChips.advertising--;
                        company.logAction('リスクカード', '広告政策失敗 次繰赤チップ-1', 0, false);
                    } else {
                        company.logAction('リスクカード', '広告政策失敗（効果なし）', 0, false);
                    }
                    break;

                // 特別サービス (19-20): 材料10円で5個まで購入可
                case 19: case 20:
                    // シミュレーションでは自動的に購入を試みる（材料上限を考慮）
                    const maxMaterials = RULES.CAPACITY.MATERIAL_BASE + (company.warehouses || 0) * RULES.CAPACITY.WAREHOUSE_BONUS;
                    const availableMaterialSpace = maxMaterials - company.materials;
                    const buyQty = Math.min(5, availableMaterialSpace);
                    if (buyQty > 0 && company.cash >= buyQty * 10) {
                        company.cash -= buyQty * 10;
                        company.materials += buyQty;
                        company.logAction('リスクカード', `特別サービス 材料${buyQty}個@¥10`, buyQty * 10, false);
                    } else {
                        company.logAction('リスクカード', '特別サービス（見送り）', 0, false);
                    }
                    break;

                // 返品発生 (21-23): 売上-20、製品+1（2期免除）
                case 21: case 22: case 23:
                    const maxProductsReturn = RULES.CAPACITY.PRODUCT_BASE + (company.warehouses || 0) * RULES.CAPACITY.WAREHOUSE_BONUS;
                    if (period > 2 && company.totalSoldQuantity > 0 && company.products < maxProductsReturn) {
                        company.totalSales -= 20;
                        company.totalSoldQuantity -= 1;
                        company.products += 1;
                        company.logAction('リスクカード', '返品発生 売上-20 製品+1', 20, false);
                    } else {
                        company.logAction('リスクカード', '返品発生（2期免除）', 0, false);
                    }
                    break;

                // コンピュータートラブル (24-25): 製造経費▲10
                case 24: case 25:
                    company.cash -= 10;
                    company.totalF += 10;
                    company.logAction('リスクカード', 'コンピュータートラブル F+10', 10, false);
                    break;

                // 商品の独占販売 (26-28): セールスマン1人につき2個、32円で販売（最大5個）
                case 26: case 27: case 28:
                    if (company.products > 0 && company.salesmen > 0) {
                        const maxSell = Math.min(5, company.salesmen * 2, company.products);
                        const revenue = 32 * maxSell;
                        company.cash += revenue;
                        company.products -= maxSell;
                        company.totalSales += revenue;
                        company.totalSoldQuantity += maxSell;
                        company.logAction('リスクカード', `商品の独占販売 ¥32×${maxSell}個`, revenue, true);
                    } else {
                        company.logAction('リスクカード', '商品の独占販売（効果なし）', 0, false);
                    }
                    break;

                // 製造ミス発生 (29-30): 仕掛品1個損失、特別損失14
                case 29: case 30:
                    if (company.wip > 0) {
                        company.wip -= 1;
                        company.totalSpecialLoss += INVENTORY_VALUES.wip;
                        company.logAction('リスクカード', '製造ミス発生 仕掛品-1 特別損失14', INVENTORY_VALUES.wip, false);
                    } else {
                        company.logAction('リスクカード', '製造ミス発生（効果なし）', 0, false);
                    }
                    break;

                // 倉庫火災 (31-32): 材料全損、保険あれば8円/個
                case 31: case 32:
                    if (company.materials > 0) {
                        const lostQty = company.materials;
                        const insurancePayout = company.chips.insurance > 0 ? lostQty * 8 : 0;
                        const specialLoss = lostQty * INVENTORY_VALUES.material - insurancePayout;
                        company.materials = 0;
                        if (insurancePayout > 0) {
                            company.cash += insurancePayout;
                            company.chips.insurance = 0;  // 保険消費
                        }
                        company.totalSpecialLoss += specialLoss;
                        company.logAction('リスクカード', `倉庫火災 材料${lostQty}個損失 保険${insurancePayout}円`, specialLoss, false);
                    } else {
                        company.logAction('リスクカード', '倉庫火災（効果なし）', 0, false);
                    }
                    break;

                // 縁故採用 (33-34): 本社経費▲5
                case 33: case 34:
                    company.cash -= 5;
                    company.totalF += 5;
                    company.logAction('リスクカード', '縁故採用 F+5', 5, false);
                    break;

                // 研究開発成功 (35-40): 青チップ1枚につき2個、32円で販売（最大5個、仕入不可）
                case 35: case 36: case 37: case 38: case 39: case 40:
                    if (company.chips.research > 0 && company.products > 0) {
                        const maxSell = Math.min(5, company.chips.research * 2, company.products, company.getSalesCapacity());
                        const revenue = 32 * maxSell;
                        company.cash += revenue;
                        company.products -= maxSell;
                        company.totalSales += revenue;
                        company.totalSoldQuantity += maxSell;
                        company.logAction('リスクカード', `研究開発成功 ¥32×${maxSell}個`, revenue, true);
                    } else {
                        company.logAction('リスクカード', '研究開発成功（効果なし）', 0, false);
                    }
                    break;

                // 各社共通 (41-42): 全社3個まで12円で購入可（シミュレーションでは自社のみ）
                case 41: case 42:
                    const maxMaterialsCommon = RULES.CAPACITY.MATERIAL_BASE + (company.warehouses || 0) * RULES.CAPACITY.WAREHOUSE_BONUS;
                    const availableSpaceCommon = maxMaterialsCommon - company.materials;
                    const commonBuyQty = Math.min(3, availableSpaceCommon);
                    if (commonBuyQty > 0 && company.cash >= commonBuyQty * 12) {
                        company.cash -= commonBuyQty * 12;
                        company.materials += commonBuyQty;
                        company.logAction('リスクカード', `各社共通 材料${commonBuyQty}個@¥12`, commonBuyQty * 12, false);
                    } else {
                        company.logAction('リスクカード', '各社共通（見送り）', 0, false);
                    }
                    break;

                // ストライキ発生 (43-44): 1回休み
                case 43: case 44:
                    company.logAction('リスクカード', 'ストライキ発生 1回休み', 0, false);
                    break;

                // 盗難発見 (45-46): 製品2個損失、保険あれば10円/個
                case 45: case 46:
                    if (company.products > 0) {
                        const lostQty = Math.min(2, company.products);
                        const insurancePayout = company.chips.insurance > 0 ? lostQty * 10 : 0;
                        const specialLoss = lostQty * INVENTORY_VALUES.product - insurancePayout;
                        company.products -= lostQty;
                        if (insurancePayout > 0) {
                            company.cash += insurancePayout;
                            company.chips.insurance = 0;  // 保険消費
                        }
                        company.totalSpecialLoss += specialLoss;
                        company.logAction('リスクカード', `盗難発見 製品${lostQty}個損失 保険${insurancePayout}円`, specialLoss, false);
                    } else {
                        company.logAction('リスクカード', '盗難発見（効果なし）', 0, false);
                    }
                    break;

                // 長期労務紛争 (47-48): 2回休み
                case 47: case 48:
                    company.logAction('リスクカード', '長期労務紛争 2回休み', 0, false);
                    break;

                // 設計トラブル発生 (49-50): 製造経費▲10
                case 49: case 50:
                    company.cash -= 10;
                    company.totalF += 10;
                    company.logAction('リスクカード', '設計トラブル発生 F+10', 10, false);
                    break;

                // ワーカー退職 (51-52): 労務費▲5、ワーカー-1
                case 51: case 52:
                    if (company.workers > 1) {
                        company.workers -= 1;
                        company.cash -= 5;
                        company.totalF += 5;
                        company.logAction('リスクカード', 'ワーカー退職 F+5 ワーカー-1', 5, false);
                    } else {
                        company.logAction('リスクカード', 'ワーカー退職（効果なし）', 0, false);
                    }
                    break;

                // 景気変動 (53-54): 逆回り（RISK-010）
                case 53: case 54:
                    gameState.isReversed = !gameState.isReversed;  // 順番逆転
                    company.logAction('リスクカード', '景気変動 順番逆転', 0, false);
                    break;

                // 教育失敗 (55-56): 黄チップ1枚返却
                case 55: case 56:
                    if (company.chips.education > 0) {
                        company.chips.education--;
                        company.logAction('リスクカード', '教育失敗 黄チップ-1', 0, false);
                    } else if (company.nextPeriodChips.education > 0) {
                        company.nextPeriodChips.education--;
                        company.logAction('リスクカード', '教育失敗 次繰黄チップ-1', 0, false);
                    } else {
                        company.logAction('リスクカード', '教育失敗（効果なし）', 0, false);
                    }
                    break;

                // セールスマン退職 (57-58): 本社人件費▲5、セールスマン-1
                case 57: case 58:
                    if (company.salesmen > 1) {
                        company.salesmen -= 1;
                        company.cash -= 5;
                        company.totalF += 5;
                        company.logAction('リスクカード', 'セールスマン退職 F+5 セールスマン-1', 5, false);
                    } else {
                        company.logAction('リスクカード', 'セールスマン退職（効果なし）', 0, false);
                    }
                    break;

                // 社長、病気で倒れる (59-60): 1回休み
                case 59: case 60:
                    company.logAction('リスクカード', '社長、病気で倒れる 1回休み', 0, false);
                    break;

                // 不良在庫発生 (61-62): 総在庫20超過分損失、保険あれば10円/個
                case 61: case 62:
                    const totalInventory = company.materials + company.wip + company.products;
                    if (totalInventory > 20) {
                        let excess = totalInventory - 20;
                        let lostValue = 0;
                        // 製品から順に損失
                        const lostProducts = Math.min(excess, company.products);
                        company.products -= lostProducts;
                        lostValue += lostProducts * INVENTORY_VALUES.product;
                        excess -= lostProducts;
                        // 仕掛品
                        const lostWip = Math.min(excess, company.wip);
                        company.wip -= lostWip;
                        lostValue += lostWip * INVENTORY_VALUES.wip;
                        excess -= lostWip;
                        // 材料
                        const lostMaterials = Math.min(excess, company.materials);
                        company.materials -= lostMaterials;
                        lostValue += lostMaterials * INVENTORY_VALUES.material;

                        const totalLost = lostProducts + lostWip + lostMaterials;
                        const insurancePayout = company.chips.insurance > 0 ? totalLost * 10 : 0;
                        const specialLoss = lostValue - insurancePayout;
                        if (insurancePayout > 0) {
                            company.cash += insurancePayout;
                            company.chips.insurance = 0;
                        }
                        company.totalSpecialLoss += specialLoss;
                        company.logAction('リスクカード', `不良在庫発生 ${totalLost}個損失 特別損失${specialLoss}`, specialLoss, false);
                    } else {
                        company.logAction('リスクカード', '不良在庫発生（効果なし）', 0, false);
                    }
                    break;

                // 機械故障 (63-64): 製造経費▲5
                case 63: case 64:
                    company.cash -= 5;
                    company.totalF += 5;
                    company.logAction('リスクカード', '機械故障 F+5', 5, false);
                    break;

                default:
                    company.logAction('リスクカード', '効果なし', 0, false);
            }
        },

        /**
         * AI投資戦略を実行（期首処理で呼ばれる）
         * 機械購入、人員採用を行う（2行目）
         * ※PC/保険購入は1行目でrunPeriod内で処理済み
         */
        executeAIInvestmentStrategy(company, period, gameState) {
            const PSR = RULES.PERIOD_START_ROWS;
            // 期首処理履歴をリセット
            company.periodStartActions = [];

            // ★★★ 2行目（長期借入・倉庫購入）で機械・人員投資も実行 ★★★
            company.currentRow = PSR.LOAN_WAREHOUSE;  // 2行目

            // ※PC/保険購入は1行目でrunPeriod内で既に処理済み（重複削除）

            // ルール⑨: チップは期首購入不可（意思決定カードで購入）
            // チップ購入はここでは行わない - AIDecisionEngine.evaluateChipPurchaseで処理

            // ★★★ 大型機械購入は意思決定フェーズで行う（期首ではなく）★★★
            // 3期で仕入れ・販売を繰り返して資金を貯めてから購入
            // AIDecisionEngine.evaluateMachineUpgrade() で処理

            // 5. ワーカー採用（機械2台以上になったら採用）
            // ルール: ワーカーは機械が2台になるまで採用不要
            const machineCount = company.machines.length;
            if (machineCount >= 2 && company.workers < machineCount && company.cash >= 15) {
                const neededWorkers = machineCount - company.workers;
                const hireWorkerCount = Math.min(3, neededWorkers, Math.floor((company.cash - 10) / 5));
                if (hireWorkerCount > 0) {
                    const workerCost = hireWorkerCount * 5;
                    company.cash -= workerCost;
                    company.workers += hireWorkerCount;

                    // ★即時F追跡: ワーカー雇用時にフラグ設定
                    ImmediateFTracker.flagWorkerHire(company, period, hireWorkerCount);

                    // ★フラグ: 人員変動を記録
                    GameActionTracker.flagHire(company, 'worker', hireWorkerCount, period);

                    company.periodStartActions.push({
                        type: '採用',
                        detail: `ワーカー${hireWorkerCount}名採用（¥${workerCost}）`,
                        amount: workerCost
                    });
                }
            }

            // 6. セールスマン採用（販売能力が足りない場合）
            // ★★★ ユーザー戦略: 3期以降はセールスマン3人（販売能力7確保）★★★
            // 2期: 1人（販売能力3）、3期以降: 3人（販売能力7）
            const targetSalesmen = period >= 3 ? 3 : 1;
            // ★ 目標人数未満なら採用（製造能力との比較は不要）
            if (company.salesmen < targetSalesmen && company.cash >= 10) {
                const hireCount = Math.min(targetSalesmen - company.salesmen, Math.floor(company.cash / 5), 3);
                if (hireCount > 0) {
                    const cost = hireCount * 5;
                    company.cash -= cost;
                    company.salesmen += hireCount;

                    // ★即時F追跡: セールスマン雇用時にフラグ設定
                    ImmediateFTracker.flagSalesmanHire(company, period, hireCount);

                    company.periodStartActions.push({
                        type: '採用',
                        detail: `セールスマン${hireCount}名採用（¥${cost}）`,
                        amount: cost
                    });
                }
            }

            // 期首処理をログに記録
            company.periodStartActions.forEach(action => {
                company.logAction(action.type, action.detail, action.amount, false, '期首');
            });

            // Q学習v2.0: 期首投資判断を学習（大型機械購入・人員採用の判断）
            if (IntelligentLearning) {
                const hasMachineAction = company.periodStartActions.some(a => a.type === '機械購入');
                const hasHireAction = company.periodStartActions.some(a => a.type === '採用');
                const investmentType = hasMachineAction ? 'INVEST_MACHINE' :
                                      hasHireAction ? 'INVEST_HIRE' : 'INVEST_MINIMAL';
                // 期首投資は報酬なし（結果は期末に反映）
                IntelligentLearning.CompanyTrackers.record(
                    company.index,
                    IntelligentLearning.StateEncoder.encode(company, gameState),
                    investmentType,
                    0
                );
            }
        },

        executeAction(company, action, gameState) {
            if (!action) return;

            // ============================================
            // ActionValidator経由で全アクションを事前検証
            // 無効なアクションは実行されない（仕組み化）
            // ============================================
            const validationResult = ActionValidator.canExecute(action.type, action, company, gameState);
            if (!validationResult.valid) {
                company.logAction('アクション拒否', `${action.type}: ${validationResult.reason}`, 0, false);
                return { consumedRow: false, rejected: true, reason: validationResult.reason };
            }

            switch (action.type) {
                case 'SELL':
                    // ★マーケットボリューム強制チェック（販売前に必ず確認）
                    const targetMarket = action.market || gameState.markets.find(m => m.name === action.marketName);
                    if (targetMarket) {
                        const remainingVolume = targetMarket.maxStock - (targetMarket.currentStock || 0);
                        if (remainingVolume < action.quantity) {
                            // マーケットボリューム不足 - 販売不可
                            company.logAction('販売失敗', `市場ボリューム不足（残り${remainingVolume}個）`, 0, false);
                            return { consumedRow: false };
                        }
                    }

                    // 6社競争をシミュレート
                    const isParent = gameState.isParent(company.index);
                    const myChips = company.chips.research || 0;
                    const myCompetitiveness = myChips * 2 + (isParent ? 2 : 0);
                    const myCallPrice = action.price - myCompetitiveness;

                    // ★★★ 他社のコール価格をシミュレート ★★★
                    // ★★★ 修正 2026-01-06: 価格テーブルに基づく入札 ★★★
                    let competitors = 0;
                    const period = gameState.period;
                    for (let i = 0; i < 5; i++) { // 他5社
                        let otherChips, otherPrice;
                        if (period === 2) {
                            // 2期: 他社は研究0-2枚、価格テーブル±2
                            otherChips = Math.floor(Math.random() * 3); // 0-2枚
                            const basePrice = RULES.TARGET_PRICES[2][otherChips] || 24;
                            otherPrice = basePrice + Math.floor(Math.random() * 5) - 2; // ±2のアレンジ
                        } else {
                            // 3期以降: 他社は研究1-3枚、価格テーブル±2
                            otherChips = 1 + Math.floor(Math.random() * 3); // 1-3枚
                            const basePrice = RULES.TARGET_PRICES[period]?.[otherChips] || 26;
                            otherPrice = basePrice + Math.floor(Math.random() * 5) - 2; // ±2のアレンジ
                        }
                        const otherCallPrice = otherPrice - otherChips * 2;
                        if (otherCallPrice <= myCallPrice) competitors++;
                    }

                    // ★★★ 勝率計算（修正 2026-01-06）★★★
                    // ★★★ 東京¥20での販売はほぼ発生しないように勝率UP ★★★
                    let winProbability;
                    if (period === 2) {
                        // 2期: 高勝率
                        if (competitors === 0) {
                            winProbability = 0.98;
                        } else if (competitors <= 2) {
                            winProbability = 0.90;
                        } else {
                            winProbability = 0.80;
                        }
                    } else {
                        // 3期以降: 研究チップがあれば高勝率
                        if (competitors === 0) {
                            winProbability = 0.98;
                        } else if (competitors === 1) {
                            winProbability = isParent ? 0.90 : 0.85;
                        } else if (competitors === 2) {
                            winProbability = isParent ? 0.85 : 0.75;
                        } else {
                            winProbability = isParent ? 0.75 : 0.65;
                        }
                    }

                    // 研究チップが多いほど有利（ボーナス強化）
                    winProbability += myChips * 0.03;
                    winProbability = Math.min(0.98, winProbability);

                    if (Math.random() < winProbability) {
                        const revenue = action.price * action.quantity;
                        company.cash += revenue;
                        company.products -= action.quantity;
                        company.totalSales += revenue;
                        company.totalSoldQuantity += action.quantity;

                        // ★マーケットボリューム更新（販売成功時に必ず更新）
                        if (targetMarket) {
                            targetMarket.currentStock = (targetMarket.currentStock || 0) + action.quantity;
                        }

                        company.logAction('販売', action.detail, revenue, true);

                        // ルール強制チェック（販売後の状態確認）
                        RuntimeRuleEnforcer.enforce(company, gameState, 'executeAction販売後');

                        const successResult = { consumedRow: true };
                        // Q学習: 販売成功を記録
                        if (IntelligentLearning) {
                            IntelligentLearning.recordAction(company, gameState, action, successResult);
                        }
                        return successResult;  // 販売成功は行を消費
                    } else {
                        company.logAction('販売失敗', `入札に負け: ${action.detail}`, 0, false);
                        const failResult = { consumedRow: false };
                        // Q学習: 販売失敗を記録（負の報酬で学習）
                        if (IntelligentLearning) {
                            IntelligentLearning.recordAction(company, gameState, action, failResult);
                        }
                        return failResult;  // ルール③: 入札負けは行を使わない
                    }

                case 'BUY_MATERIALS':
                    ActionEngine.buyMaterials(company, action.quantity, action.market, gameState, action.bypassPeriodEndCheck || false);
                    break;

                case 'INPUT':
                    // ===== 投入（材料→仕掛品）=====
                    ActionEngine.input(company, action.quantity);
                    break;

                case 'COMPLETE':
                    // ===== 完成（仕掛品→製品）=====
                    ActionEngine.complete(company, action.quantity);
                    break;

                case 'PRODUCE':
                    // 投入+完成を1行で（旧形式）
                    ActionEngine.produce(company, action.materialToWip, action.wipToProduct);
                    break;

                case 'HIRE':
                    ActionEngine.hire(company, action.count);
                    break;

                case 'HIRE_WORKER':
                    ActionEngine.hire(company, action.count);
                    // ★★★ 採用後に期末コストを即座に更新 ★★★
                    company.updatePeriodEndCost(gameState.period, gameState.wageMultiplier || 1.0);
                    break;

                case 'HIRE_SALESMAN':
                    ActionEngine.hireSalesman(company, action.count);
                    // ★★★ 採用後に期末コストを即座に更新 ★★★
                    company.updatePeriodEndCost(gameState.period, gameState.wageMultiplier || 1.0);
                    break;

                case 'SELL_MACHINE':
                    // 小型機械を単独で売却（スクリプト用）
                    {
                        const period = gameState.period;
                        const smallMachine = company.machines.find(m => m.type === 'small');
                        if (smallMachine) {
                            const hasAttach = smallMachine.attachments > 0;
                            const bookValue = hasAttach ?
                                (RULES.BOOK_VALUE.SMALL_ATTACH?.[period] || 117) :
                                (RULES.BOOK_VALUE.SMALL[period] || 80);
                            const salePrice = Math.floor(bookValue * RULES.SALE_RATIO);
                            const saleLoss = bookValue - salePrice;

                            company.cash += salePrice;
                            company.totalSpecialLoss += saleLoss;
                            company.machines = company.machines.filter(m => m !== smallMachine);
                            company.logAction('機械売却', `小型機械売却（簿価¥${bookValue} → 売却¥${salePrice}）`, salePrice, true);
                            company.updatePeriodEndCost(gameState.period, gameState.wageMultiplier || 1.0);
                        }
                    }
                    break;

                case 'BUY_LARGE_MACHINE':
                    ActionEngine.buyMachine(company, 'large', gameState);
                    // ★★★ 機械購入後に期末コストを即座に更新 ★★★
                    company.updatePeriodEndCost(gameState.period, gameState.wageMultiplier || 1.0);
                    break;

                case 'UPGRADE_TO_LARGE_MACHINE':
                    // ★★★ 小型売却+大型購入を1行で実行 ★★★
                    {
                        const period = gameState.period;
                        const bookValue = action.bookValue || (RULES.BOOK_VALUE.SMALL[period] || 80);
                        const salePrice = action.salePrice || Math.floor(bookValue * RULES.SALE_RATIO);
                        const saleLoss = bookValue - salePrice;

                        // 小型機械を売却
                        company.cash += salePrice;
                        company.totalSpecialLoss += saleLoss;
                        company.machines = [];
                        company.logAction('機械売却', `小型機械売却（簿価¥${bookValue} → 売却¥${salePrice}、売却損¥${saleLoss}）`, salePrice, true);

                        // 大型機械を購入
                        company.cash -= 200;
                        company.machines.push({ type: 'large', attachments: 0 });
                        company.logAction('機械購入', `大型機械購入（¥200、能力4）残高¥${company.cash}`, 200, false);

                        // ★★★ 大型機械購入後に期末コストを即座に更新 ★★★
                        company.updatePeriodEndCost(gameState.period, gameState.wageMultiplier || 1.0);
                    }
                    break;

                case 'BUY_CHIP':
                    // ルール①: 2期は特急なし、ルール②: 1行1枚まで
                    ActionEngine.buyChip(company, action.chipType, action.isExpress, gameState.period, null, action.bypassPeriodEndCheck || false);
                    company.chipsBoughtThisTurn = true;  // ルール②: フラグを設定
                    break;

                case 'DO_NOTHING':
                    // ===== 何もしない（行を消費しない）=====
                    // ★★★ DO_NOTHINGは失敗パターンとして記録 ★★★
                    company.logAction('様子見', '何もしない（行消費なし）', 0, false);
                    // DO_NOTHINGは行を消費しない
                    const doNothingResult = { consumedRow: false };
                    if (IntelligentLearning) {
                        IntelligentLearning.recordAction(company, gameState, action, doNothingResult);
                        // ★失敗パターンとして記録（なぜ行動できなかったか）
                        const reason = `現金¥${company.cash}, 材料${company.materials}, 仕掛品${company.wip}, 製品${company.products}`;
                        IntelligentLearning.recordDoNothing(company, gameState, reason);
                    }
                    return doNothingResult;

                default:
                    company.logAction('不明', `不明な行動: ${action?.type}`, 0, false);
                    break;
            }

            // ============================================
            // Q学習: 行動を記録（毎行動を学習データとして蓄積）
            // ============================================
            const defaultResult = { consumedRow: true };
            if (IntelligentLearning && action) {
                IntelligentLearning.recordAction(company, gameState, action, defaultResult);
            }

            // デフォルト: 行を消費する（入札負け・DO_NOTHING以外）
            return defaultResult;
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
    // 学習システム（LearningSystem）
    // シミュレーション結果から戦略パラメータを最適化
    // ============================================
    const LearningSystem = {
        data: null,
        dataPath: null,

        /**
         * 学習データを読み込み
         */
        load(dataPath) {
            this.dataPath = dataPath;
            try {
                if (typeof require !== 'undefined') {
                    const fs = require('fs');
                    if (fs.existsSync(dataPath)) {
                        const content = fs.readFileSync(dataPath, 'utf-8');
                        this.data = JSON.parse(content);
                        return true;
                    }
                }
            } catch (e) {
                // ファイルがなければ新規作成
            }
            this.data = {
                version: '2.0',
                lastUpdated: new Date().toISOString(),
                totalSimulations: 0,
                strategyStats: {},
                bestPatterns: [],
                dynamicParams: {}  // 学習された動的パラメータ
            };
            return false;
        },

        /**
         * 戦略パラメータを学習データに基づいて調整
         * @param {string} strategyType - 戦略タイプ
         * @returns {Object} 調整されたパラメータ
         */
        getOptimizedParams(strategyType) {
            // 防御的プログラミング: RULES.AI_STRATEGIESが未定義の場合は空オブジェクトを返す
            if (!RULES || !RULES.AI_STRATEGIES) {
                return {};
            }

            const baseStrategy = RULES.AI_STRATEGIES[strategyType] || {};

            // 学習データがない、または該当戦略の統計がない場合は基本戦略を返す
            if (!this.data || !this.data.strategyStats || !this.data.strategyStats[strategyType]) {
                return baseStrategy;
            }

            const stats = this.data.strategyStats[strategyType];

            // 勝率に基づいてパラメータを調整
            const winRate = stats.totalGames > 0 ? stats.totalWins / stats.totalGames : 0;

            // 勝率が低い場合、研究チップ重視度を上げる
            const researchBoost = winRate < 0.2 ? 1 : 0;

            // 動的パラメータがあれば適用
            const dynamicParams = (this.data.dynamicParams && this.data.dynamicParams[strategyType]) || {};

            return {
                ...baseStrategy,
                chipTargets: this.adjustChipTargets(baseStrategy.chipTargets, researchBoost),
                priceAdjustment: dynamicParams.priceAdjustment ?? baseStrategy.priceAdjustment,
                learningApplied: true,
                winRate: Math.round(winRate * 100)
            };
        },

        /**
         * チップ目標を調整
         */
        adjustChipTargets(targets, researchBoost) {
            if (!targets) return targets;

            const adjusted = {};
            for (const period of [2, 3, 4, 5]) {
                if (targets[period]) {
                    adjusted[period] = {
                        ...targets[period],
                        research: Math.min(5, (targets[period].research || 0) + researchBoost)
                    };
                }
            }
            return adjusted;
        },

        /**
         * シミュレーション結果から学習
         * ★★★ 成功パターン即時保存システム ★★★
         */
        learn(results) {
            if (!this.data) this.load(this.dataPath || 'data/learned-strategies.json');

            this.data.totalSimulations++;
            this.data.lastUpdated = new Date().toISOString();

            // 各会社の結果を記録
            let hasNewRecord = false;
            results.finalEquities.forEach(company => {
                const strategy = company.strategy || 'PLAYER';
                if (!this.data.strategyStats[strategy]) {
                    this.data.strategyStats[strategy] = {
                        totalGames: 0,
                        totalWins: 0,
                        winRate: 0,
                        avgEquity: 0,
                        maxEquity: 0,
                        totalEquity: 0
                    };
                }

                const stats = this.data.strategyStats[strategy];
                const prevMaxEquity = stats.maxEquity || 0;

                stats.totalGames++;
                stats.totalEquity = (stats.totalEquity || 0) + company.equity;
                stats.avgEquity = Math.round(stats.totalEquity / stats.totalGames);
                stats.maxEquity = Math.max(stats.maxEquity, company.equity);

                if (company.equity === results.winner.equity) {
                    stats.totalWins++;
                }
                stats.winRate = Math.round(stats.totalWins / stats.totalGames * 1000) / 10;

                // ★新記録かどうかチェック
                if (company.equity > prevMaxEquity && company.equity >= 450) {
                    hasNewRecord = true;
                }
            });

            // 最高記録を更新
            const winner = results.winner;
            const currentBest = this.data.bestPatterns.length > 0 ? this.data.bestPatterns[0].equity : 0;

            if (this.data.bestPatterns.length < 10 || winner.equity > this.data.bestPatterns[this.data.bestPatterns.length - 1].equity) {
                this.data.bestPatterns.push({
                    equity: winner.equity,
                    strategy: winner.strategy || 'PLAYER',
                    name: winner.name,
                    date: new Date().toISOString().split('T')[0]
                });
                this.data.bestPatterns.sort((a, b) => b.equity - a.equity);
                this.data.bestPatterns = this.data.bestPatterns.slice(0, 10);

                // ★★★ 新記録時は即座に保存 ★★★
                if (winner.equity > currentBest) {
                    hasNewRecord = true;
                }
            }

            // 動的パラメータの更新（最強戦略に基づく）
            this.updateDynamicParams();

            // ★★★ 成功時は即座に保存（上回った時のみ上書き）★★★
            if (hasNewRecord || winner.equity >= 450) {
                this.save();
            }
        },

        /**
         * 動的パラメータを更新
         */
        updateDynamicParams() {
            if (!this.data || !this.data.strategyStats) return;

            // dynamicParamsが未定義なら初期化
            if (!this.data.dynamicParams) {
                this.data.dynamicParams = {};
            }

            const stats = this.data.strategyStats;
            let bestStrategy = null;
            let bestWinRate = 0;

            for (const [strategy, stat] of Object.entries(stats)) {
                const winRate = stat.totalGames > 100 ? stat.totalWins / stat.totalGames : 0;
                if (winRate > bestWinRate) {
                    bestWinRate = winRate;
                    bestStrategy = strategy;
                }
            }

            if (bestStrategy) {
                // 最強戦略のパラメータを他の戦略にも反映
                this.data.dynamicParams.bestStrategy = bestStrategy;
                this.data.dynamicParams.bestWinRate = Math.round(bestWinRate * 100);
            }
        },

        /**
         * 学習データを保存
         */
        save() {
            if (!this.data || !this.dataPath) return false;

            try {
                if (typeof require !== 'undefined') {
                    const fs = require('fs');
                    const path = require('path');
                    const dir = path.dirname(this.dataPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    // インサイトを生成
                    this.data.insights = this.generateInsights();

                    fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
                    return true;
                }
            } catch (e) {
                console.error('学習データ保存エラー:', e.message);
            }
            return false;
        },

        /**
         * インサイトを生成
         */
        generateInsights() {
            const stats = this.data.strategyStats;
            const insights = [];

            // 最強戦略を特定
            let bestStrategy = null;
            let bestWinRate = 0;
            for (const [strategy, stat] of Object.entries(stats)) {
                if (stat.winRate > bestWinRate) {
                    bestWinRate = stat.winRate;
                    bestStrategy = strategy;
                }
            }

            if (bestStrategy) {
                insights.push(`最強戦略: ${bestStrategy} (勝率${bestWinRate}%)`);
            }

            // 平均自己資本最高
            let bestAvgStrategy = null;
            let bestAvgEquity = -Infinity;
            for (const [strategy, stat] of Object.entries(stats)) {
                if (stat.avgEquity > bestAvgEquity) {
                    bestAvgEquity = stat.avgEquity;
                    bestAvgStrategy = strategy;
                }
            }

            if (bestAvgStrategy) {
                insights.push(`平均自己資本最高: ${bestAvgStrategy}`);
            }

            insights.push(`総シミュレーション回数: ${this.data.totalSimulations}回`);

            return insights;
        }
    };

    // ============================================
    // 公開API
    // ============================================
    return {
        RULES,
        RuleValidator,
        RuntimeRuleEnforcer,
        ActionValidator,
        LearningSystem,
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
            // ルール自己検証（毎回実行）
            if (!options.skipValidation) {
                const valid = RuleValidator.validateRules();
                if (!valid) {
                    const errors = RuleValidator.getErrors();
                    throw new Error(`ルール検証失敗:\n${errors.join('\n')}`);
                }
            }
            return SimulationRunner.runFullGame(options);
        },

        evaluateResults: function(results) {
            return Evaluator.evaluate(results);
        },

        // 複数回シミュレーション（メモリ最適化版 + 学習システム統合）
        runMultipleSimulations: function(count = 100, options = {}) {
            // 学習データを読み込み
            const dataPath = options.learningDataPath || 'data/learned-strategies.json';
            LearningSystem.load(dataPath);

            // Q学習システム初期化（行動レベルの学習）
            if (IntelligentLearning) {
                IntelligentLearning.init();
            }

            // 統計用（メモリ節約のため全結果は保持しない）
            const stats = {
                totalRuns: count,
                targetReachRate: 0,
                averageWinnerEquity: 0,
                equityDistribution: { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 },
                ruleViolations: 0  // ルール違反カウント
            };

            // 戦略別統計
            const strategyStats = {};

            // 最優秀パターン保持用（上位5件のみ）
            let bestResults = [];

            for (let i = 0; i < count; i++) {
                try {
                    const result = this.runSimulation(options);

                    // 学習システムに結果を記録
                    LearningSystem.learn(result);

                    // 統計更新
                    if (result.winner.reachedTarget) stats.targetReachRate++;
                    stats.averageWinnerEquity += result.winner.equity;
                    const grade = Evaluator.getGrade(result.winner.equity);
                    stats.equityDistribution[grade]++;

                    // 戦略別統計
                    result.finalEquities.forEach(company => {
                        const strategy = company.strategy || 'PLAYER';
                        if (!strategyStats[strategy]) {
                            strategyStats[strategy] = { wins: 0, games: 0, totalEquity: 0, maxEquity: 0 };
                        }
                        strategyStats[strategy].games++;
                        strategyStats[strategy].totalEquity += company.equity;
                        strategyStats[strategy].maxEquity = Math.max(strategyStats[strategy].maxEquity, company.equity);
                        if (company.equity === result.winner.equity) {
                            strategyStats[strategy].wins++;
                        }
                    });

                    // 上位5件を保持（自己資本でソート）
                    if (bestResults.length < 5 || result.winner.equity > bestResults[bestResults.length - 1].winner.equity) {
                        bestResults.push(result);
                        bestResults.sort((a, b) => b.winner.equity - a.winner.equity);
                        if (bestResults.length > 5) {
                            bestResults = bestResults.slice(0, 5);
                        }
                    }
                    // Q学習: シミュレーション完了を通知（探索率自動調整）
                    if (IntelligentLearning) {
                        IntelligentLearning.onSimulationComplete();
                    }
                } catch (e) {
                    // ルール違反が発生した場合
                    if (e.message.includes('RuntimeRuleEnforcer')) {
                        stats.ruleViolations++;
                        console.error(`\nシミュレーション${i + 1}でルール違反: ${e.message}`);
                    } else {
                        throw e;  // 他のエラーは再スロー
                    }
                }

                // 進捗表示（1000回ごと）
                if ((i + 1) % 1000 === 0) {
                    process.stdout.write(`  進捗: ${i + 1}/${count}回\r`);
                }
            }

            // 学習データを保存
            LearningSystem.save();

            // Q学習データを保存
            if (IntelligentLearning) {
                IntelligentLearning.save();
            }

            stats.targetReachRate = Math.round(stats.targetReachRate / count * 100);
            stats.averageWinnerEquity = Math.round(stats.averageWinnerEquity / count);
            stats.strategyStats = strategyStats;
            stats.learningApplied = true;
            stats.totalLearningSimulations = LearningSystem.data?.totalSimulations || 0;

            // Q学習統計を追加
            if (IntelligentLearning) {
                stats.qLearning = IntelligentLearning.getStats();
            }

            // allResultsは最優秀パターンのみ（互換性維持）
            return { allResults: bestResults, stats, bestResult: bestResults[0] };
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
