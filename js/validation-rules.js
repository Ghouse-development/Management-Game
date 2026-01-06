// ==============================================
// validation-rules.js - 統一バリデーションルール
// ==============================================

/**
 * 統一バリデーションルール
 * 全ての検証ロジックを一箇所に集約
 */
const ValidationRules = {

    // ============================================
    // 定数定義
    // ============================================
    LIMITS: {
        HIRING_PER_TURN: 3,          // 1ターンの採用上限
        MATERIAL_BASE: 10,            // 材料基本容量
        PRODUCT_BASE: 10,             // 製品基本容量
        WIP_MAX: 10,                  // 仕掛品上限
        WAREHOUSE_BONUS: 10,          // 倉庫ボーナス容量
        MAX_CHIPS_CARRYOVER: 3,       // 次期繰越チップ上限（5期）
        MIN_INVENTORY_FOR_WIN: 10,    // 勝利条件在庫数
        TARGET_EQUITY: 450            // 目標自己資本
    },

    // ============================================
    // 採用バリデーション
    // ============================================
    hiring: {
        /**
         * 採用人数が上限内かチェック
         */
        canHire(currentWorkers, currentSalesmen, additionalWorkers, additionalSalesmen) {
            const total = additionalWorkers + additionalSalesmen;
            return total <= ValidationRules.LIMITS.HIRING_PER_TURN;
        },

        /**
         * 採用可能な残り人数を取得
         */
        getRemainingHires(alreadyHired) {
            return Math.max(0, ValidationRules.LIMITS.HIRING_PER_TURN - alreadyHired);
        },

        /**
         * 採用検証（エラーメッセージ付き）
         */
        validate(workerCount, salesmanCount) {
            const total = workerCount + salesmanCount;
            if (total > ValidationRules.LIMITS.HIRING_PER_TURN) {
                return {
                    valid: false,
                    error: `採用人数が上限(${ValidationRules.LIMITS.HIRING_PER_TURN}名)を超えています: ${total}名`
                };
            }
            return { valid: true };
        }
    },

    // ============================================
    // 在庫バリデーション
    // ============================================
    inventory: {
        /**
         * 材料容量を取得
         */
        getMaterialCapacity(company) {
            const base = ValidationRules.LIMITS.MATERIAL_BASE;
            const bonus = ValidationRules.LIMITS.WAREHOUSE_BONUS;
            if (!company.warehouses || company.warehouses === 0) return base;
            if (company.warehouseLocation === 'materials') return base + bonus;
            return base;
        },

        /**
         * 製品容量を取得
         */
        getProductCapacity(company) {
            const base = ValidationRules.LIMITS.PRODUCT_BASE;
            const bonus = ValidationRules.LIMITS.WAREHOUSE_BONUS;
            if (!company.warehouses || company.warehouses === 0) return base;
            if (company.warehouseLocation === 'products') return base + bonus;
            return base;
        },

        /**
         * 材料追加が可能かチェック
         */
        canAddMaterials(company, quantity) {
            const capacity = this.getMaterialCapacity(company);
            const newTotal = (company.materials || 0) + quantity;
            return newTotal <= capacity;
        },

        /**
         * 製品追加が可能かチェック
         */
        canAddProducts(company, quantity) {
            const capacity = this.getProductCapacity(company);
            const newTotal = (company.products || 0) + quantity;
            return newTotal <= capacity;
        },

        /**
         * 仕掛品追加が可能かチェック
         */
        canAddWIP(company, quantity) {
            const newTotal = (company.wip || 0) + quantity;
            return newTotal <= ValidationRules.LIMITS.WIP_MAX;
        },

        /**
         * 在庫検証（エラーメッセージ付き）
         */
        validate(company, type, quantity) {
            switch (type) {
                case 'materials':
                    if (!this.canAddMaterials(company, quantity)) {
                        const cap = this.getMaterialCapacity(company);
                        return {
                            valid: false,
                            error: `材料容量超過: ${company.materials + quantity} > ${cap}`
                        };
                    }
                    break;
                case 'products':
                    if (!this.canAddProducts(company, quantity)) {
                        const cap = this.getProductCapacity(company);
                        return {
                            valid: false,
                            error: `製品容量超過: ${company.products + quantity} > ${cap}`
                        };
                    }
                    break;
                case 'wip':
                    if (!this.canAddWIP(company, quantity)) {
                        return {
                            valid: false,
                            error: `仕掛品容量超過: ${company.wip + quantity} > ${ValidationRules.LIMITS.WIP_MAX}`
                        };
                    }
                    break;
            }
            return { valid: true };
        }
    },

    // ============================================
    // 購入バリデーション
    // ============================================
    purchase: {
        /**
         * 3期以降の材料購入上限（製造能力）を取得
         */
        getMaterialPurchaseLimit(company, period) {
            if (period === 2) return 99;  // 2期は制限なし
            return getManufacturingCapacity(company);
        },

        /**
         * 材料購入が可能かチェック
         */
        canPurchaseMaterials(company, quantity, period) {
            // 製造能力チェック（3期以降）
            const mfgLimit = this.getMaterialPurchaseLimit(company, period);
            if (quantity > mfgLimit) return false;

            // 材料容量チェック
            if (!ValidationRules.inventory.canAddMaterials(company, quantity)) return false;

            return true;
        },

        /**
         * 購入検証（エラーメッセージ付き）
         */
        validate(company, quantity, period) {
            const mfgLimit = this.getMaterialPurchaseLimit(company, period);
            if (quantity > mfgLimit) {
                return {
                    valid: false,
                    error: `製造能力(${mfgLimit})を超える購入はできません`
                };
            }

            const inventoryResult = ValidationRules.inventory.validate(company, 'materials', quantity);
            if (!inventoryResult.valid) {
                return inventoryResult;
            }

            return { valid: true };
        }
    },

    // ============================================
    // 販売バリデーション
    // ============================================
    sales: {
        /**
         * 販売能力を取得
         */
        getSalesCapacity(company) {
            return getSalesCapacity(company);  // game.jsの既存関数を使用
        },

        /**
         * 販売が可能かチェック
         */
        canSell(company, quantity) {
            const capacity = this.getSalesCapacity(company);
            if (quantity > capacity) return false;
            if (quantity > (company.products || 0)) return false;
            if (company.cannotSell) return false;
            return true;
        },

        /**
         * 販売検証（エラーメッセージ付き）
         */
        validate(company, quantity) {
            if (company.cannotSell) {
                return {
                    valid: false,
                    error: '消費者運動発生中のため販売できません'
                };
            }

            const capacity = this.getSalesCapacity(company);
            if (quantity > capacity) {
                return {
                    valid: false,
                    error: `販売能力(${capacity})を超えています`
                };
            }

            if (quantity > (company.products || 0)) {
                return {
                    valid: false,
                    error: `製品在庫(${company.products})が不足しています`
                };
            }

            return { valid: true };
        }
    },

    // ============================================
    // 生産バリデーション
    // ============================================
    production: {
        /**
         * 製造能力を取得
         */
        getManufacturingCapacity(company) {
            return getManufacturingCapacity(company);  // game.jsの既存関数を使用
        },

        /**
         * 生産が可能かチェック
         */
        canProduce(company) {
            if (company.cannotProduce) return false;
            return this.getManufacturingCapacity(company) > 0;
        },

        /**
         * 生産検証（エラーメッセージ付き）
         */
        validate(company, matToWip, wipToProd) {
            if (company.cannotProduce) {
                return {
                    valid: false,
                    error: '労災発生中のため生産できません'
                };
            }

            const capacity = this.getManufacturingCapacity(company);
            if (matToWip > capacity || wipToProd > capacity) {
                return {
                    valid: false,
                    error: `製造能力(${capacity})を超えています`
                };
            }

            if (matToWip > (company.materials || 0)) {
                return {
                    valid: false,
                    error: `材料(${company.materials})が不足しています`
                };
            }

            // 仕掛品容量チェック
            const newWip = (company.wip || 0) + matToWip - wipToProd;
            if (newWip > ValidationRules.LIMITS.WIP_MAX) {
                return {
                    valid: false,
                    error: `仕掛品置場(${ValidationRules.LIMITS.WIP_MAX})を超えます`
                };
            }

            // 製品容量チェック
            const productResult = ValidationRules.inventory.validate(company, 'products', wipToProd);
            if (!productResult.valid) {
                return productResult;
            }

            return { valid: true };
        }
    },

    // ============================================
    // 勝利条件バリデーション
    // ============================================
    victory: {
        /**
         * 勝利条件を満たしているかチェック
         */
        checkVictoryConditions(company, allCompanies) {
            const results = {
                equity: company.equity >= ValidationRules.LIMITS.TARGET_EQUITY,
                inventory: (company.products || 0) >= ValidationRules.LIMITS.MIN_INVENTORY_FOR_WIN,
                chips: (company.chips?.research || 0) + (company.chips?.education || 0) +
                       (company.chips?.advertising || 0) >= ValidationRules.LIMITS.MAX_CHIPS_CARRYOVER,
                isTop: this.isTopEquity(company, allCompanies)
            };

            results.allMet = results.equity && results.inventory && results.chips && results.isTop;
            return results;
        },

        /**
         * 自己資本1位かどうか
         */
        isTopEquity(company, allCompanies) {
            const companyEquity = company.equity || 0;
            return !allCompanies.some(c => (c.equity || 0) > companyEquity);
        }
    }
};

// グローバル公開
if (typeof window !== 'undefined') {
    window.ValidationRules = ValidationRules;
}
