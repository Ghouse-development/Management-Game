/**
 * ルール強制システム v1.0
 *
 * 設計原則:
 * 1. 全てのルールはフラグ/定数で定義
 * 2. 判断は全てコードで自動化
 * 3. ルール違反は自動的に検出・修正
 * 4. 人間の頭脳を使わずに計算
 */

const RuleEnforcer = (function() {
    'use strict';

    // ============================================
    // ルール定義（全てフラグ化）
    // ============================================
    const RULES = {
        // ============================================
        // ゲーム構造
        // ============================================
        GAME: {
            COMPANY_COUNT: 6,
            START_PERIOD: 2,
            END_PERIOD: 5,
            PERIODS_COUNT: 4,
            PARENT_BONUS: 2,              // 親ボーナス
        },

        // ============================================
        // 期別行数（絶対に変更不可）
        // ============================================
        PERIOD_ROWS: {
            2: 20,
            3: 30,
            4: 34,
            5: 35,
        },

        // ============================================
        // 初期状態
        // ============================================
        INITIAL: {
            CASH: 112,           // 137 - 25（PCチップ+保険）
            EQUITY: 283,
            WORKERS: 1,
            SALESMEN: 1,
            MATERIALS: 0,
            WIP: 3,
            PRODUCTS: 3,
            MACHINES: [{ type: 'small', capacity: 3, attachments: 0 }],
            CHIPS: {
                research: 0,
                education: 0,
                pc: 1,
                insurance: 1,
            },
        },

        // ============================================
        // コスト定数
        // ============================================
        COST: {
            // 材料・生産
            MATERIAL_INPUT: 1,        // 投入コスト
            PRODUCT_COMPLETION: 1,    // 完成コスト

            // 人件費
            HIRING: 5,                // 採用費
            WORKER_WAGE: 22,          // 2期ワーカー人件費基準
            SALESMAN_WAGE: 22,        // 2期セールスマン人件費基準
            MACHINE_WAGE: 22,         // 2期機械人件費基準
            MAX_PERSONNEL_WAGE: 22,   // 2期最大人員人件費基準

            // チップ
            CHIP_NORMAL: 20,          // 通常チップ
            CHIP_EXPRESS: 40,         // 特急チップ
            CHIP_F_RATE: 20,          // チップF計算: (購入-繰越)×20

            // 機械
            SMALL_MACHINE: 100,
            LARGE_MACHINE: 200,
            ATTACHMENT: 20,

            // その他
            PC_CHIP: 20,
            INSURANCE: 5,
            WAREHOUSE: 10,            // 倉庫10個ごと
            RESERVE_DAY_P2: 20,       // 2期予備日
            RESERVE_DAY_P3_5: 30,     // 3-5期予備日
        },

        // ============================================
        // 機械性能
        // ============================================
        MACHINE: {
            SMALL_CAPACITY: 3,
            LARGE_CAPACITY: 4,
            ATTACHMENT_BONUS: 1,
            MAX_ATTACHMENTS: 2,
            SMALL_DEPRECIATION: 10,
            LARGE_DEPRECIATION: 20,
        },

        // ============================================
        // 倉庫
        // ============================================
        WAREHOUSE: {
            FREE_CAPACITY: 10,        // 無料容量
            UNIT_COST: 10,            // 10個ごとのコスト
        },

        // ============================================
        // 市場
        // ============================================
        MARKET: {
            TOKYO_PRICE: 20,          // 東京固定価格
            OVERSEAS_PRICE: 16,       // 海外固定価格
            OSAKA_BASE: 20,           // 大阪基準価格
        },

        // ============================================
        // サイコロ効果
        // ============================================
        DICE: {
            // 出目1-3: 仙台閉鎖、人件費×1.1、大阪+出目
            // 出目4-6: 仙台・札幌閉鎖、人件費×1.2、大阪+出目
            LOW_ROLL_MAX: 3,
            LOW_WAGE_MULTIPLIER: 1.1,
            HIGH_WAGE_MULTIPLIER: 1.2,
            OSAKA_PRICE_OFFSET: 20,   // 大阪価格 = 20 + 出目
        },

        // ============================================
        // チップ繰越
        // ============================================
        CHIP_CARRYOVER: {
            PERIOD_2_MAX: 3,          // 2期末最大繰越枚数
            PERIOD_2_REDUCTION: 1,    // 2期末各-1
            PERIOD_5_MIN: 3,          // 5期末最低必要枚数
        },

        // ============================================
        // 勝利条件
        // ============================================
        VICTORY: {
            MIN_EQUITY: 450,          // 最低自己資本
            MIN_INVENTORY: 10,        // 最低在庫
            MIN_CHIPS: 3,             // 最低繰越チップ
        },

        // ============================================
        // 借入
        // ============================================
        LOAN: {
            SHORT_TERM_INTEREST_RATE: 0.2,  // 短期金利20%
            LONG_TERM_INTEREST_RATE: 0.1,   // 長期金利10%
            // 長期借入限度額（期×自己資本による）
            getLongTermLimit: function(period, equity) {
                if (period === 2) return 0;
                if (equity >= 350) return 300;
                if (equity >= 310) return 250;
                if (equity >= 280) return 200;
                if (equity >= 260) return 180;
                if (equity >= 240) return 160;
                if (equity >= 220) return 140;
                if (equity >= 200) return 120;
                return 100;
            },
        },
    };

    // ============================================
    // ルール検証フラグ
    // ============================================
    const VALIDATION_FLAGS = {
        CHECK_CASH_BEFORE_ACTION: true,
        CHECK_INVENTORY_LIMITS: true,
        CHECK_CHIP_LIMITS: true,
        CHECK_LOAN_LIMITS: true,
        CHECK_PERIOD_ROWS: true,
        AUTO_FIX_VIOLATIONS: true,
    };

    // ============================================
    // 検証関数群
    // ============================================
    const Validators = {
        /**
         * 現金が足りるか検証
         */
        canAfford(company, amount) {
            if (!VALIDATION_FLAGS.CHECK_CASH_BEFORE_ACTION) return true;
            return company.cash >= amount;
        },

        /**
         * 倉庫容量内か検証
         */
        hasStorageSpace(company, additionalItems) {
            if (!VALIDATION_FLAGS.CHECK_INVENTORY_LIMITS) return true;
            const current = company.materials + company.products;
            const capacity = company.getStorageCapacity?.() || RULES.WAREHOUSE.FREE_CAPACITY;
            return (current + additionalItems) <= capacity;
        },

        /**
         * 期別行数を検証
         */
        validatePeriodRows(period, rows) {
            if (!VALIDATION_FLAGS.CHECK_PERIOD_ROWS) return true;
            const maxRows = RULES.PERIOD_ROWS[period];
            if (!maxRows) return false;
            return rows <= maxRows;
        },

        /**
         * 借入限度額を検証
         */
        validateLoanLimit(period, equity, requestedAmount, currentLoan) {
            if (!VALIDATION_FLAGS.CHECK_LOAN_LIMITS) return true;
            const limit = RULES.LOAN.getLongTermLimit(period, equity);
            return (currentLoan + requestedAmount) <= limit;
        },

        /**
         * アクションの事前検証
         */
        validateAction(actionType, company, gameState, params = {}) {
            const errors = [];

            switch (actionType) {
                case 'BUY_MATERIALS':
                    if (!this.canAfford(company, params.cost)) {
                        errors.push(`現金不足: 必要¥${params.cost}, 所持¥${company.cash}`);
                    }
                    if (!this.hasStorageSpace(company, params.quantity)) {
                        errors.push(`倉庫容量超過`);
                    }
                    break;

                case 'PRODUCE':
                    if (company.materials <= 0 && company.wip <= 0) {
                        errors.push(`生産不可: 材料・仕掛品なし`);
                    }
                    break;

                case 'SELL':
                    if (company.products < params.quantity) {
                        errors.push(`販売不可: 製品${company.products}個しかない`);
                    }
                    break;

                case 'BUY_CHIP':
                    const chipCost = params.express ? RULES.COST.CHIP_EXPRESS : RULES.COST.CHIP_NORMAL;
                    if (!this.canAfford(company, chipCost)) {
                        errors.push(`現金不足: チップ購入`);
                    }
                    break;

                case 'HIRE_SALESMAN':
                case 'HIRE_WORKER':
                    const hireCost = (params.count || 1) * RULES.COST.HIRING;
                    if (!this.canAfford(company, hireCost)) {
                        errors.push(`現金不足: 採用`);
                    }
                    break;
            }

            return {
                valid: errors.length === 0,
                errors: errors
            };
        }
    };

    // ============================================
    // F計算システム（フラグベース）
    // ============================================
    const FCalculator = {
        /**
         * 期末F合計を計算
         */
        calculate(company, period, diceRoll) {
            const f = {};

            // 人件費乗数
            const wageMultiplier = diceRoll <= RULES.DICE.LOW_ROLL_MAX
                ? RULES.DICE.LOW_WAGE_MULTIPLIER
                : RULES.DICE.HIGH_WAGE_MULTIPLIER;

            // 基準人件費（期によって変動）
            const baseWage = Math.round(RULES.COST.WORKER_WAGE * (1 + (period - 2) * 0.1));

            // 人件費計算
            f.workerWage = Math.round(company.workers * baseWage * wageMultiplier);
            f.salesmanWage = Math.round(company.salesmen * baseWage * wageMultiplier);

            // 機械人件費
            f.machineWage = 0;
            for (const machine of company.machines || []) {
                const capacity = machine.type === 'large'
                    ? RULES.MACHINE.LARGE_CAPACITY
                    : RULES.MACHINE.SMALL_CAPACITY;
                f.machineWage += Math.round(capacity * baseWage * wageMultiplier);
            }

            // 最大人員人件費
            const maxPersonnel = Math.max(0, company.workers - 1);
            f.maxPersonnelWage = Math.round(maxPersonnel * baseWage * wageMultiplier);

            f.totalWage = f.workerWage + f.machineWage + f.salesmanWage + f.maxPersonnelWage;

            // 減価償却
            f.depreciation = 0;
            for (const machine of company.machines || []) {
                f.depreciation += machine.type === 'large'
                    ? RULES.MACHINE.LARGE_DEPRECIATION
                    : RULES.MACHINE.SMALL_DEPRECIATION;
            }

            // PCチップ
            f.pcCost = company.chips?.pc ? RULES.COST.PC_CHIP : 0;

            // 保険
            f.insuranceCost = company.chips?.insurance ? RULES.COST.INSURANCE : 0;

            // チップF（2期のみ）
            f.chipCost = 0;
            if (period === 2) {
                const purchased = (company.chipsPurchased?.research || 0) +
                                 (company.chipsPurchased?.education || 0);
                const carryover = Math.min(
                    RULES.CHIP_CARRYOVER.PERIOD_2_MAX,
                    Math.max(0, (company.chips?.research || 0) - 1) +
                    Math.max(0, (company.chips?.education || 0) - 1)
                );
                f.chipCost = (purchased - carryover) * RULES.COST.CHIP_F_RATE;
            }

            // 倉庫費
            const totalInventory = company.materials + company.products;
            const extraInventory = Math.max(0, totalInventory - RULES.WAREHOUSE.FREE_CAPACITY);
            f.warehouseCost = Math.ceil(extraInventory / 10) * RULES.COST.WAREHOUSE;

            // 予備日
            f.reserveCost = period === 2
                ? RULES.COST.RESERVE_DAY_P2
                : RULES.COST.RESERVE_DAY_P3_5;

            // 長期返済
            f.longTermRepay = Math.round(company.longTermLoan * 0.1);

            // 短期返済
            f.shortTermRepay = company.shortTermLoan || 0;
            f.shortTermInterest = Math.round(f.shortTermRepay * RULES.LOAN.SHORT_TERM_INTEREST_RATE);

            // 合計
            f.total = f.totalWage + f.depreciation + f.pcCost + f.insuranceCost +
                     f.chipCost + f.warehouseCost + f.reserveCost +
                     f.longTermRepay + f.shortTermRepay + f.shortTermInterest;

            return f;
        }
    };

    // ============================================
    // 公開API
    // ============================================
    return {
        RULES,
        VALIDATION_FLAGS,
        Validators,
        FCalculator,

        // 便利メソッド
        getPeriodRows: (period) => RULES.PERIOD_ROWS[period],
        getChipCost: (express) => express ? RULES.COST.CHIP_EXPRESS : RULES.COST.CHIP_NORMAL,
        getHireCost: (count) => count * RULES.COST.HIRING,
        getLoanLimit: (period, equity) => RULES.LOAN.getLongTermLimit(period, equity),
        validateAction: (type, company, state, params) =>
            Validators.validateAction(type, company, state, params),
        calculateF: (company, period, dice) => FCalculator.calculate(company, period, dice),
    };
})();

module.exports = RuleEnforcer;
