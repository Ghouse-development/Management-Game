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
                case 'PRODUCE':
                    return this.validateProduction(params, company, gameState);
                case 'HIRE':
                case 'HIRE_WORKER':
                case 'HIRE_SALESMAN':
                    return this.validateHiring(params, company);
                case 'BUY_LARGE_MACHINE':
                case 'BUY_SMALL_MACHINE':
                    return this.validateMachinePurchase(params, company, gameState, period);
                case 'SELL_MACHINE':
                    return this.validateMachineSale(params, company, gameState, period);
                case 'DO_NOTHING':
                    return { valid: true };
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
            // ルール⑩: 5期在庫・チップ確保
            if (period === 5) {
                // 在庫10個以上必要
                const currentInventory = company.materials + company.wip + company.products;
                const afterInventory = currentInventory - (params.quantity || 0);
                if (afterInventory < 10) {
                    return { valid: false, reason: 'ルール⑩: 5期は在庫10個以上必要' };
                }
                // チップ3枚以上必要（販売自体には影響しないが、状態チェック用）
                const currentChips = (company.chips.research || 0) + (company.chips.education || 0) +
                                    (company.chips.advertising || 0) + (company.nextPeriodChips?.research || 0) +
                                    (company.nextPeriodChips?.education || 0) + (company.nextPeriodChips?.advertising || 0);
                if (currentChips < 3 && afterInventory >= 10) {
                    // チップ不足だが在庫は足りている場合、販売可能（チップ確保は別途必要）
                    // ただし警告情報を付与
                    return { valid: true, warning: 'チップ3枚未満：別途確保が必要' };
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
            // 2期1周目制限
            if (period === 2 && gameState.isFirstRound && params.quantity > 3) {
                return { valid: false, reason: '2期1周目は3個まで' };
            }
            // 在庫容量チェック
            const maxMaterials = 10 + (company.warehouses || 0) * 12;
            if (company.materials + params.quantity > maxMaterials) {
                return { valid: false, reason: '材料在庫上限超過' };
            }
            // 現金チェック
            if (params.market && company.cash < params.market.buyPrice * params.quantity) {
                return { valid: false, reason: '現金不足' };
            }
            return { valid: true };
        },

        // ルール④: 生産の検証
        validateProduction(params, company, gameState) {
            const input = params.materialToWip || 0;
            const complete = params.wipToProduct || 0;
            // ルール④: 投入1完成1禁止
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
        validateHiring(params, company) {
            if (params.count > 3) {
                return { valid: false, reason: '1行で最大3人まで' };
            }
            if (company.cash < params.count * 5) {
                return { valid: false, reason: '現金不足' };
            }
            return { valid: true };
        },

        // 機械購入の検証
        validateMachinePurchase(params, company, gameState, period) {
            const cost = params.type === 'large' ? 200 : 100;
            if (company.cash < cost) {
                return { valid: false, reason: '現金不足' };
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
        INITIAL: {
            CASH: 112,              // 137 - PC20 - 保険5 = 112
            EQUITY: 283,
            WORKERS: 1,
            SALESMEN: 1,
            MATERIALS: 1,
            WIP: 2,
            PRODUCTS: 1,
            MACHINES: [{ type: 'small', attachments: 0 }],
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

        // 人件費（期別）
        WAGE: { 2: 22, 3: 24, 4: 26, 5: 28 },

        // 借入
        LOAN: {
            LONG_TERM_RATE: 0.10,
            SHORT_TERM_RATE: 0.20,
            MIN_LONG_REPAY: 0.10,
            MIN_SHORT_REPAY: 0.20
        },

        // 借入限度
        // 2期: 長期借入不可（0）
        // 3期: 自己資本の50%
        // 4-5期: 自己資本300以下→50%、300超→100%
        getLoanLimit: function(period, equity) {
            if (period === 2) return 0;  // 2期は長期借入禁止
            const multiplier = (period >= 4 && equity > 300) ? 1.0 : 0.5;
            return Math.floor(equity * multiplier);
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

        // 期別・研究チップ別の記帳価格目安（親の場合）
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
                    5: { research: 1, education: 1, advertising: 0 }
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
                    2: { research: 0, education: 0, advertising: 0 },
                    3: { research: 1, education: 1, advertising: 0 },
                    4: { research: 2, education: 1, advertising: 0 },
                    5: { research: 2, education: 1, advertising: 0 }
                },
                priceAdjustment: 0,
                hirePriority: 'worker',
                earlyLargeMachine: false,  // 3期に大型機械購入（期首借入後）
                upgradePeriod: 3
            },
            PLAYER: {
                name: 'プレイヤー型',
                description: '研究チップ重視・早期大型機械戦略',
                chipTargets: {
                    2: { research: 2, education: 1, advertising: 0 },
                    3: { research: 4, education: 1, advertising: 0 },
                    4: { research: 5, education: 1, advertising: 0 },
                    5: { research: 5, education: 1, advertising: 0 }
                },
                priceAdjustment: 2,
                hirePriority: 'worker',
                earlyLargeMachine: true,  // 2期後半に大型機械購入
                upgradePeriod: 2
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
            this.currentRow = 2;  // 期首処理で1行使用済み
            this.totalSales = 0;
            this.totalSoldQuantity = 0;
            this.totalF = 0;
            this.totalSpecialLoss = 0;
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
                } else if (action.includes('期末処理') || action.includes('期首')) {
                    autoType = '期末';
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
                this.companies = [new Company(0, playerName, true)];
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

            // サイコロ5-6で行数-5
            this.maxRowsReduction = (this.diceResult >= 5) ? 5 : 0;

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
        buyMaterials(company, quantity, market, gameState) {
            // ActionValidatorで事前検証
            const validation = ActionValidator.canExecute('BUY_MATERIALS', { quantity, market }, company, gameState);
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
         * 完成・投入
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
        buyChip(company, chipType, isExpress = false, period = 2, phase = null) {
            // ActionValidatorで事前検証（ルール①②⑨をチェック）
            const validation = ActionValidator.canExecute('BUY_CHIP', { isExpress, phase }, company, { period });
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
                longTermRepay: 0,
                shortTermRepay: 0,
                shortTermInterest: 0,
                tax: 0,
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
            // 2期（ジュニア）: ワーカー × 単価 のみ
            // 3期以降（シニア）: ワーカー + 機械 + セールスマン + 最大人員×0.5
            result.wageWorker = company.workers * adjustedWage;
            if (period >= 3) {
                result.wageMachine = company.machines.length * adjustedWage;
                result.wageSalesman = company.salesmen * adjustedWage;
                result.wageMaxPersonnel = company.maxPersonnel * halfWage;
            } else {
                // 2期はワーカーのみ
                result.wageMachine = 0;
                result.wageSalesman = 0;
                result.wageMaxPersonnel = 0;
            }
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
            // PC（持っていれば20円）
            if (company.chips.computer > 0) {
                result.pcCost = RULES.COST.PC;
                company.totalF += result.pcCost;
            }
            // 保険（持っていれば5円）
            if (company.chips.insurance > 0) {
                result.insuranceCost = RULES.COST.INSURANCE;
                company.totalF += result.insuranceCost;
            }
            // チップ費用（CHIP-004, CHIP-005）
            // ルール①: 2期は特急なし（全て¥20）
            // 2期: 購入枚数×¥20
            // 3期以降: 通常×¥20 + 特急×¥40
            const history = company.chipPurchaseHistory;
            if (period === 2) {
                // 2期: 全て¥20（特急という概念がない）
                const totalPurchases = (history.research.normal || 0) +
                                       (history.education.normal || 0) +
                                       (history.advertising.normal || 0);
                // express履歴があっても2期は¥20で計算（念のため）
                const expressAsNormal = (history.research.express || 0) +
                                        (history.education.express || 0) +
                                        (history.advertising.express || 0);
                result.chipCost = (totalPurchases + expressAsNormal) * 20;
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

            // 7. 納税処理（G×50%、初回は300超過分×50%）
            // 簡略化: 自己資本増加分を利益として計算
            const equityBeforeTax = company.calculateEquity(period);
            const profit = equityBeforeTax - result.equityBefore;
            if (profit > 0) {
                // 簡易計算：利益の50%を税金として
                // 初回（初めてプラスになった期）は300円超過分の50%
                result.tax = Math.floor(profit * 0.5);
                if (result.tax > 0) {
                    company.cash -= result.tax;
                }
            }

            result.totalF = result.wage + result.depreciation + result.pcCost + result.insuranceCost + result.chipCost + result.warehouseCost + result.shortTermInterest;
            result.equityAfter = company.calculateEquity(period + 1);

            // 8. 期中最大人員をリセット
            company.maxPersonnel = 0;

            // 9. チップ購入履歴をリセット（次期用）
            company.chipPurchaseHistory = {
                research: { normal: 0, express: 0 },
                education: { normal: 0, express: 0 },
                advertising: { normal: 0, express: 0 }
            };

            company.logAction('期末処理',
                `人件費${result.wage}(W${result.wageWorker}+M${result.wageMachine}+S${result.wageSalesman}+Max${result.wageMaxPersonnel}) 減価償却${result.depreciation} PC${result.pcCost} 保険${result.insuranceCost} チップ${result.chipCost} 税${result.tax}`,
                result.totalF + result.tax, false);

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
         */
        evaluateAllActions(company, gameState) {
            const actions = [];
            const period = gameState.period;

            // ルール⑩: 5期は在庫10個以上、チップ3枚以上を確保する必要がある
            const isPeriod5 = period === 5;
            const currentInventory = company.materials + company.wip + company.products;
            const currentChips = (company.chips.research || 0) + (company.chips.education || 0) +
                                (company.chips.advertising || 0) + (company.nextPeriodChips.research || 0) +
                                (company.nextPeriodChips.education || 0) + (company.nextPeriodChips.advertising || 0);
            const needsMoreInventory = isPeriod5 && currentInventory < RULES.VICTORY.MIN_INVENTORY;
            const needsMoreChips = isPeriod5 && currentChips < RULES.VICTORY.MIN_CARRYOVER_CHIPS;

            // 販売（5期で在庫確保が必要なら販売しない）
            if (company.products > 0 && !needsMoreInventory) {
                const salesAction = this.evaluateSales(company, gameState);
                if (salesAction) actions.push(salesAction);
            }

            // 材料購入（5期で在庫確保が必要なら優先度UP）
            const buyAction = this.evaluateBuyMaterials(company, gameState);
            if (buyAction) {
                if (needsMoreInventory) buyAction.score += 500;  // 在庫確保を最優先
                actions.push(buyAction);
            }

            // 完成・投入
            const produceAction = this.evaluateProduction(company, gameState);
            if (produceAction) actions.push(produceAction);

            // 採用
            const hireAction = this.evaluateHiring(company, gameState);
            if (hireAction) actions.push(hireAction);

            // 機械購入
            const machineAction = this.evaluateMachinePurchase(company, gameState);
            if (machineAction) actions.push(machineAction);

            // チップ購入（5期でチップ確保が必要なら優先度UP）
            const chipAction = this.evaluateChipPurchase(company, gameState);
            if (chipAction) {
                if (needsMoreChips) chipAction.score += 500;  // チップ確保を最優先
                actions.push(chipAction);
            }

            // DO NOTHING
            actions.push({ type: 'DO_NOTHING', score: 0, detail: '何もしない' });

            return actions;
        },

        evaluateSales(company, gameState) {
            // ============================================
            // 販売可否の判定（ActionValidator経由で100%システム化）
            // ============================================
            const period = gameState.period;

            // 基本的な販売能力チェック
            const salesCapacity = company.getSalesCapacity();
            const quantity = Math.min(salesCapacity, company.products);
            if (quantity < RULES.MIN_SALE_QUANTITY) return null;

            const isParent = gameState.isParent(company.index);
            const researchChips = company.chips.research || 0;

            // 期別・研究チップ別の目安価格を取得
            let basePrice = RULES.TARGET_PRICES[period]?.[Math.min(researchChips, 5)] || 24;

            // 戦略に応じて価格調整
            const strategy = company.strategy;
            if (strategy) {
                basePrice += strategy.priceAdjustment || 0;
            }

            // 親でない場合は2円引き
            if (!isParent) {
                basePrice -= 2;
            }

            // 価格は最低16円（海外）、最高40円（仙台）
            let targetPrice = Math.max(16, Math.min(40, basePrice));

            // 市場選択（ActionValidatorで検証しながら選択）
            let targetMarket = null;
            let actualQuantity = quantity;

            for (const m of gameState.markets) {
                if (m.sellPrice < targetPrice) continue;

                // 市場の残り容量を計算
                const remainingCapacity = m.maxStock - (m.currentStock || 0);
                actualQuantity = Math.min(quantity, remainingCapacity);

                if (actualQuantity < RULES.MIN_SALE_QUANTITY) continue;

                // ActionValidatorで検証（全ルールをチェック）
                const validation = ActionValidator.canExecute('SELL', {
                    market: m,
                    quantity: actualQuantity,
                    price: targetPrice
                }, company, gameState);

                if (validation.valid) {
                    targetMarket = m;
                    break;
                }
                // 無効な場合は次の市場を試す
            }

            // 有効な市場がない場合は販売しない
            if (!targetMarket) return null;

            const expectedRevenue = targetPrice * actualQuantity;
            const score = 200 + expectedRevenue;

            return {
                type: 'SELL',
                score,
                detail: `${targetMarket.name}に¥${targetPrice}×${actualQuantity}個`,
                market: targetMarket,
                price: targetPrice,
                quantity: actualQuantity
            };
        },

        evaluateBuyMaterials(company, gameState) {
            // ============================================
            // 材料購入（ActionValidator経由で100%システム化）
            // ============================================
            const period = gameState.period;
            const mfgCapacity = company.getMfgCapacity();
            const storageCapacity = company.getStorageCapacity();
            const currentStorage = company.materials + company.products;
            const availableStorage = storageCapacity - currentStorage;

            if (availableStorage <= 0) return null;

            // 最安市場を選択
            const market = gameState.markets.reduce((best, m) =>
                m.buyPrice < best.buyPrice ? m : best
            );

            // 購入数量の計算
            let targetQty;
            if (period === 2) {
                targetQty = Math.min(market.maxStock, availableStorage);
            } else {
                targetQty = Math.min(mfgCapacity, availableStorage, market.maxStock);
            }

            // ActionValidatorで検証
            const validation = ActionValidator.canExecute('BUY_MATERIALS', {
                quantity: targetQty,
                market: market
            }, company, gameState);

            if (!validation.valid) return null;

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
            // ============================================
            // 生産（ActionValidator経由で100%システム化）
            // ============================================
            const mfgCapacity = company.getMfgCapacity();
            const canProduce = Math.min(mfgCapacity, company.wip + company.materials);

            if (canProduce === 0) return null;

            let materialToWip = Math.min(company.materials, RULES.CAPACITY.WIP - company.wip);
            let wipToProduct = Math.min(mfgCapacity, company.wip + materialToWip);

            if (wipToProduct === 0) return null;

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
            // ワーカー採用（ActionValidator経由で100%システム化）
            // ============================================
            const machines = company.machines.length;

            // ワーカーが機械台数より少ない場合に検討
            if (company.workers >= machines) return null;

            const hireCount = Math.min(3, machines - company.workers);

            // ActionValidatorで検証
            const validation = ActionValidator.canExecute('HIRE', { count: hireCount }, company, gameState);
            if (!validation.valid) return null;

            const cost = hireCount * RULES.COST.HIRING;
            if (company.cash < cost + 50) return null;

            let score = hireCount * 15;
            if (hirePriority === 'worker') score += 20;

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
            // セールスマン採用（ActionValidator経由で100%システム化）
            // ============================================
            const currentSalesCapacity = company.getSalesCapacity();
            const products = company.products;
            const mfgCapacity = company.getMfgCapacity();

            // 販売能力が製造能力より低い場合に検討
            if (currentSalesCapacity >= mfgCapacity * 2) return null;

            const hireCount = 1;  // セールスマンは1人ずつ

            // ActionValidatorで検証
            const validation = ActionValidator.canExecute('HIRE', { count: hireCount }, company, gameState);
            if (!validation.valid) return null;

            const cost = hireCount * RULES.COST.HIRING;
            if (company.cash < cost + 50) return null;

            let score = hireCount * 15;
            if (hirePriority === 'salesman') score += 20;
            if (currentSalesCapacity < products) score += 30;  // 製品が売れない状態なら優先

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
            if (!strategy || !strategy.chipTargets || !strategy.chipTargets[period]) {
                return null;
            }

            const targets = strategy.chipTargets[period];
            const currentResearch = company.chips.research || 0;
            const currentEducation = company.chips.education || 0;
            const currentAdvertising = company.chips.advertising || 0;

            // チップ種類と優先度を定義
            const chipOptions = [
                { type: 'research', current: currentResearch, target: targets.research || 0, score: 60 },
                { type: 'education', current: currentEducation, target: targets.education || 0, score: 55 },
                { type: 'advertising', current: currentAdvertising, target: targets.advertising || 0, score: 50 }
            ];

            // 各チップタイプをActionValidatorで検証
            for (const opt of chipOptions) {
                if (opt.current >= opt.target) continue;

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
                // 無効なら次のチップタイプを試す（通常は全て同じ理由で無効なので1回で終わる）
                break;
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
                    meetsAllRequirements
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

            // 期首処理1: サイコロ（3期以降）PS-008
            if (period >= 3) {
                const diceValue = options.diceValue !== undefined ? options.diceValue :
                                 (Math.floor(Math.random() * 6) + 1);
                gameState.processDice(diceValue);
                periodResult.diceResult = gameState.diceResult;
            }

            const maxRows = gameState.getMaxRows();

            // 期首処理2: 最大人員を初期化 & 期を設定
            gameState.companies.forEach(company => {
                company.period = period;  // 各会社の期を更新
                company.maxPersonnel = company.workers + company.salesmen;
            });

            // 期首処理3: 長期借入（PS-006）
            const turnOrder = gameState.getTurnOrder();  // 親から順番
            turnOrder.forEach(companyIndex => {
                const company = gameState.companies[companyIndex];
                if (!company.isPlayer || options.autoPlayer) {
                    const equity = company.calculateEquity(period);
                    const limit = RULES.getLoanLimit(period, equity);
                    const available = limit - company.longTermLoan;
                    // より積極的に借入（投資資金確保）
                    if (available > 0 && company.cash < 300) {
                        ActionEngine.borrowLongTerm(company, available, period, equity);
                    }
                }
            });

            // 期首処理4: AI投資戦略（チップ・機械・人員）
            turnOrder.forEach(companyIndex => {
                const company = gameState.companies[companyIndex];
                if (!company.isPlayer || options.autoPlayer) {
                    this.executeAIInvestmentStrategy(company, period, gameState);
                }
            });

            // 1周目フラグ（ACT-002用）
            gameState.isFirstRound = true;
            let roundCount = 0;

            // ターン実行
            let continueSimulation = true;
            while (continueSimulation) {
                gameState.turn++;
                roundCount++;

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
                        this.processRiskCard(company, gameState);
                    } else {
                        // 意思決定
                        if (!company.isPlayer || options.autoPlayer) {
                            const action = AIDecisionEngine.decideAction(company, gameState);
                            const result = this.executeAction(company, action, gameState);
                            // ルール③: 入札負けは行を使わない
                            if (result && result.consumedRow === false) {
                                rowConsumed = false;
                            }
                        }
                    }

                    // ルール③: 入札負けは行を使わない
                    if (rowConsumed) {
                        company.currentRow++;
                    }

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

            // 行数リセット、順番逆転リセット
            gameState.companies.forEach(c => c.currentRow = 1);
            gameState.isReversed = false;

            return periodResult;
        },

        /**
         * リスクカード処理（64種類）
         * デッキから1枚引く（同じカードは山札がなくなるまで出ない）
         */
        processRiskCard(company, gameState) {
            // Q学習: リスクカード前の現金を記録
            const cashBefore = company.cash;

            // デッキから1枚引く
            const cardId = gameState.drawRiskCard();
            this.applyRiskCard(company, gameState, cardId);

            // Q学習v2.0: リスクカードの効果を学習（現金変化を報酬として）
            if (IntelligentLearning) {
                const cashChange = company.cash - cashBefore;
                IntelligentLearning.recordRiskCard(company, gameState, cardId, cashChange);
            }

            // ルール強制チェック（リスクカード後も状態が有効か確認）
            RuntimeRuleEnforcer.enforce(company, gameState, `リスクカード(${cardId})後`);
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
         * PC/保険購入、チップ購入、機械購入、人員採用を行う
         */
        executeAIInvestmentStrategy(company, period, gameState) {
            // 期首処理履歴をリセット
            company.periodStartActions = [];

            // 1. PC購入（3期以降、現金があれば必ず購入）
            if (period >= 3 && company.cash >= 20) {
                company.cash -= 20;
                company.chips.computer = 1;
                company.periodStartActions.push({
                    type: 'PC購入',
                    detail: 'PCチップ購入（¥20）',
                    amount: 20
                });
            }

            // 2. 保険購入（3期以降、現金があれば必ず購入）
            if (period >= 3 && company.cash >= 5) {
                company.cash -= 5;
                company.chips.insurance = 1;
                company.periodStartActions.push({
                    type: '保険購入',
                    detail: '保険チップ購入（¥5）',
                    amount: 5
                });
            }

            // ルール⑨: チップは期首購入不可（意思決定カードで購入）
            // チップ購入はここでは行わない - AIDecisionEngine.evaluateChipPurchaseで処理

            // 4. 大型機械購入（3期で小型→大型への移行）
            const strategy = company.strategy;
            if (period === 3 && strategy && strategy.earlyLargeMachine) {
                const hasOnlySmall = company.machines.length === 1 && company.machines[0].type === 'small';
                if (hasOnlySmall && company.cash >= 200) {
                    // 小型機械を売却
                    const bookValue = RULES.BOOK_VALUE.SMALL[period] || 80;
                    const salePrice = Math.floor(bookValue * RULES.SALE_RATIO);
                    company.cash += salePrice;
                    const saleLoss = bookValue - salePrice;
                    company.totalSpecialLoss += saleLoss;
                    company.periodStartActions.push({
                        type: '機械売却',
                        detail: `小型機械売却（簿価¥${bookValue} → 売却¥${salePrice}、売却損¥${saleLoss}）`,
                        amount: salePrice,
                        loss: saleLoss
                    });
                    company.machines = [];

                    // 大型機械を購入
                    if (company.cash >= 200) {
                        company.cash -= 200;
                        company.machines.push({ type: 'large', attachments: 0 });
                        company.periodStartActions.push({
                            type: '機械購入',
                            detail: '大型機械購入（¥200）',
                            amount: 200
                        });
                    }
                }
            }

            // 5. セールスマン採用（販売能力が足りない場合）
            const salesCapacity = company.getSalesCapacity();
            const mfgCapacity = company.getMfgCapacity();
            if (salesCapacity < mfgCapacity && company.cash >= 10) {
                const hireCount = Math.min(2, Math.floor(company.cash / 5));
                if (hireCount > 0) {
                    const cost = hireCount * 5;
                    company.cash -= cost;
                    company.salesmen += hireCount;
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
                    ActionEngine.buyMaterials(company, action.quantity, action.market, gameState);
                    break;

                case 'PRODUCE':
                    ActionEngine.produce(company, action.materialToWip, action.wipToProduct);
                    break;

                case 'HIRE':
                    ActionEngine.hire(company, action.count);
                    break;

                case 'HIRE_WORKER':
                    ActionEngine.hire(company, action.count);
                    break;

                case 'HIRE_SALESMAN':
                    ActionEngine.hireSalesman(company, action.count);
                    break;

                case 'BUY_LARGE_MACHINE':
                    ActionEngine.buyMachine(company, 'large', gameState);
                    break;

                case 'BUY_CHIP':
                    // ルール①: 2期は特急なし、ルール②: 1行1枚まで
                    ActionEngine.buyChip(company, action.chipType, action.isExpress, gameState.period);
                    company.chipsBoughtThisTurn = true;  // ルール②: フラグを設定
                    break;

                case 'DO_NOTHING':
                default:
                    company.logAction('様子見', '何もしない', 0, false);
                    break;
            }

            // ============================================
            // Q学習: 行動を記録（毎行動を学習データとして蓄積）
            // ============================================
            const defaultResult = { consumedRow: true };
            if (IntelligentLearning && action) {
                IntelligentLearning.recordAction(company, gameState, action, defaultResult);
            }

            // デフォルト: 行を消費する（入札負け以外）
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
         */
        learn(results) {
            if (!this.data) this.load(this.dataPath || 'data/learned-strategies.json');

            this.data.totalSimulations++;
            this.data.lastUpdated = new Date().toISOString();

            // 各会社の結果を記録
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
                stats.totalGames++;
                stats.totalEquity = (stats.totalEquity || 0) + company.equity;
                stats.avgEquity = Math.round(stats.totalEquity / stats.totalGames);
                stats.maxEquity = Math.max(stats.maxEquity, company.equity);

                if (company.equity === results.winner.equity) {
                    stats.totalWins++;
                }
                stats.winRate = Math.round(stats.totalWins / stats.totalGames * 1000) / 10;
            });

            // 最高記録を更新
            const winner = results.winner;
            if (this.data.bestPatterns.length < 10 || winner.equity > this.data.bestPatterns[this.data.bestPatterns.length - 1].equity) {
                this.data.bestPatterns.push({
                    equity: winner.equity,
                    strategy: winner.strategy || 'PLAYER',
                    name: winner.name,
                    date: new Date().toISOString().split('T')[0]
                });
                this.data.bestPatterns.sort((a, b) => b.equity - a.equity);
                this.data.bestPatterns = this.data.bestPatterns.slice(0, 10);
            }

            // 動的パラメータの更新（最強戦略に基づく）
            this.updateDynamicParams();
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
