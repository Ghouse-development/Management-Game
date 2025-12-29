/**
 * MG (Management Game) - 会計ロジック
 *
 * 期首処理: 借入金利支払い + 納税 + 配当支払い
 * 期末処理: 給料支払い + 借入返済（元本）
 *
 * 主要指標:
 * - PQ (売上高) = 販売単価 × 販売数量
 * - VQ (変動費) = 材料購入費 + 製造費 + 在庫評価差額
 * - MQ (限界利益) = PQ - VQ
 * - F (固定費) = 給料 + 減価償却 + チップ費用 + 金利
 * - G (経常利益) = MQ - F
 * - 自己資本 = 前期自己資本 + G - 税金
 */

const AccountingSystem = {
    // 在庫評価単価（定数から参照、フォールバック値を設定）
    INVENTORY_VALUES: {
        material: 13,  // 材料
        wip: 14,       // 仕掛品
        product: 15    // 製品
    },

    /**
     * VQ (変動費) を計算
     * VQ = 材料購入費 + 製造費 + (期首在庫評価額 - 期末在庫評価額)
     *
     * @param {Object} company - 会社オブジェクト
     * @returns {number} VQ (変動費総額)
     */
    calculateVQ: function(company) {
        const values = (typeof INVENTORY_VALUES !== 'undefined') ? INVENTORY_VALUES : this.INVENTORY_VALUES;

        // 材料購入費（期中の合計）
        const materialCost = company.totalMaterialCost || 0;

        // 完成・投入費（期中の合計）
        const productionCost = company.totalProductionCost || 0;

        // 期首在庫評価額
        const startInventoryValue =
            (company.periodStartInventory.materials * values.material) +
            (company.periodStartInventory.wip * values.wip) +
            (company.periodStartInventory.products * values.product);

        // 期末在庫評価額
        const endInventoryValue =
            (company.materials * values.material) +
            (company.wip * values.wip) +
            (company.products * values.product);

        // VQ = 購入費 + 製造費 + (期首在庫 - 期末在庫)
        return materialCost + productionCost + startInventoryValue - endInventoryValue;
    },

    /**
     * 給料コストを計算
     *
     * @param {Object} company - 会社オブジェクト
     * @param {number} period - 期数
     * @param {Object} gameState - ゲーム状態
     * @returns {number} 給料コスト
     */
    calculateSalaryCost: function(company, period, gameState) {
        let cost = 0;

        // 基本単価
        const baseSalary = {2: 22, 3: 24, 4: 26, 5: 28};
        let unitCost = baseSalary[period] || 22;
        let halfCost = Math.round(unitCost / 2);

        // 3期以降はサイコロで単価変動
        if (period >= 3 && gameState && gameState.wageMultiplier > 1) {
            unitCost = Math.round(baseSalary[period] * gameState.wageMultiplier);
            halfCost = Math.round(unitCost / 2);
        }

        // 機械台数 × 単価
        const machineCount = company.machines.length;
        cost += machineCount * unitCost;

        // ワーカー（現在 + 退職者0.5）× 単価
        const effectiveWorkers = company.workers + (company.retiredWorkers || 0) * 0.5;
        cost += effectiveWorkers * unitCost;

        // セールスマン（現在 + 退職者0.5）× 単価
        const effectiveSalesmen = company.salesmen + (company.retiredSalesmen || 0) * 0.5;
        cost += effectiveSalesmen * unitCost;

        // 期中最大人員 × 半額単価
        const maxPersonnel = company.maxPersonnel || (company.workers + company.salesmen);
        cost += maxPersonnel * halfCost;

        return Math.round(cost);
    },

    /**
     * 減価償却費を計算
     *
     * @param {Object} company - 会社オブジェクト
     * @param {number} period - 期数
     * @returns {number} 減価償却費
     */
    calculateDepreciation: function(company, period) {
        let cost = 0;
        const isPeriod2 = period === 2;

        // 減価償却定数（定数ファイルから参照、フォールバック）
        const depreciation = (typeof DEPRECIATION !== 'undefined') ? DEPRECIATION : {
            small: {period2: 10, period3plus: 8},
            smallWithAttachment: {period2: 15, period3plus: 12},
            large: {period2: 20, period3plus: 17}
        };

        company.machines.forEach(machine => {
            if (machine.type === 'small') {
                if (machine.attachments > 0) {
                    cost += isPeriod2 ? depreciation.smallWithAttachment.period2 : depreciation.smallWithAttachment.period3plus;
                } else {
                    cost += isPeriod2 ? depreciation.small.period2 : depreciation.small.period3plus;
                }
            } else if (machine.type === 'large') {
                cost += isPeriod2 ? depreciation.large.period2 : depreciation.large.period3plus;
            }
        });

        return cost;
    },

    /**
     * 固定費 (F) を計算
     *
     * @param {Object} company - 会社オブジェクト
     * @param {number} period - 期数
     * @param {Object} gameState - ゲーム状態
     * @returns {number} 固定費総額
     */
    calculateFixedCost: function(company, period, gameState) {
        let cost = 0;

        // 給料
        cost += this.calculateSalaryCost(company, period, gameState);

        // 借入金利
        const interestRates = (typeof INTEREST_RATES !== 'undefined') ? INTEREST_RATES : {longTerm: 0.1, shortTerm: 0.2};
        cost += Math.round((company.loans || 0) * interestRates.longTerm);
        cost += Math.round((company.shortLoans || 0) * interestRates.shortTerm);

        // チップ費用
        const chipCosts = (typeof CHIP_COSTS !== 'undefined') ? CHIP_COSTS : {computer: 20, insurance: 5, normal: 20, express: 30};
        cost += (company.chips.computer || 0) * chipCosts.computer;
        cost += (company.chips.insurance || 0) * chipCosts.insurance;

        // 戦略チップ費用
        const carriedOver = company.carriedOverChips || {research: 0, education: 0, advertising: 0};

        if (period === 2) {
            if (company.chips.research > 0) cost += chipCosts.normal;
            if (company.chips.education > 0) cost += chipCosts.normal;
            if (company.chips.advertising > 0) cost += chipCosts.normal;
        } else {
            // 繰り越しチップ
            cost += (carriedOver.research || 0) * chipCosts.normal;
            cost += (carriedOver.education || 0) * chipCosts.normal;
            cost += (carriedOver.advertising || 0) * chipCosts.normal;

            // 今期特急購入分
            const urgentResearch = Math.max(0, (company.chips.research || 0) - (carriedOver.research || 0));
            const urgentEducation = Math.max(0, (company.chips.education || 0) - (carriedOver.education || 0));
            const urgentAdvertising = Math.max(0, (company.chips.advertising || 0) - (carriedOver.advertising || 0));
            cost += urgentResearch * chipCosts.express;
            cost += urgentEducation * chipCosts.express;
            cost += urgentAdvertising * chipCosts.express;

            // 次期繰り越し分
            cost += (company.nextPeriodChips?.research || 0) * chipCosts.normal;
            cost += (company.nextPeriodChips?.education || 0) * chipCosts.normal;
            cost += (company.nextPeriodChips?.advertising || 0) * chipCosts.normal;
        }

        // 減価償却費
        cost += this.calculateDepreciation(company, period);

        // 機械故障による追加固定費
        if (company.additionalFixedCost) {
            cost += company.additionalFixedCost;
        }

        // 追加人件費
        cost += company.extraLaborCost || 0;

        return cost;
    },

    /**
     * 経常利益 (G) を計算
     *
     * @param {Object} company - 会社オブジェクト
     * @param {number} period - 期数
     * @param {Object} gameState - ゲーム状態
     * @returns {Object} {pq, vq, mq, f, g}
     */
    calculateProfit: function(company, period, gameState) {
        const pq = company.totalSales || 0;
        const vq = this.calculateVQ(company);
        const mq = pq - vq;
        const f = this.calculateFixedCost(company, period, gameState);
        const specialLoss = company.specialLoss || 0;
        const g = mq - f - specialLoss;

        return {pq, vq, mq, f, g, specialLoss};
    },

    /**
     * 税金と配当を計算
     *
     * @param {number} previousEquity - 前期自己資本
     * @param {number} profit - 経常利益 (G)
     * @param {boolean} hasExceeded300 - 既に300円を超えたことがあるか
     * @returns {Object} {tax, dividend, newEquity}
     */
    calculateTaxAndDividend: function(previousEquity, profit, hasExceeded300) {
        const newEquity = previousEquity + profit;
        let tax = 0;
        let dividend = 0;

        if (newEquity > 300) {
            if (!hasExceeded300) {
                // 初めて300円を超えた場合
                const excess = newEquity - 300;
                tax = Math.round(excess * 0.5);      // 超過分の50%
                dividend = Math.round(excess * 0.2); // 超過分の20%
            } else if (profit > 0) {
                // 既に超えていて利益がある場合
                tax = Math.round(profit * 0.5);      // 利益の50%
                dividend = Math.round(profit * 0.1); // 利益の10%
            }
        }

        return {
            tax: tax,
            dividend: dividend,
            newEquity: newEquity - tax
        };
    },

    /**
     * 期末支払額を計算（給料 + 借入返済）
     *
     * @param {Object} company - 会社オブジェクト
     * @param {number} period - 期数
     * @param {Object} gameState - ゲーム状態
     * @returns {number} 期末支払額
     */
    calculatePeriodEndPayment: function(company, period, gameState) {
        let payment = 0;

        // 給料
        payment += this.calculateSalaryCost(company, period, gameState);

        // 借入返済（最低返済額）
        if (company.loans > 0) {
            payment += Math.ceil(company.loans * 0.1);  // 長期: 最低10%
        }
        if (company.shortLoans > 0) {
            payment += Math.ceil(company.shortLoans * 0.2);  // 短期: 最低20%
        }

        return payment;
    },

    /**
     * 期首支払額を計算（金利 + 納税 + 配当）
     *
     * @param {Object} company - 会社オブジェクト
     * @returns {number} 期首支払額
     */
    calculatePeriodStartPayment: function(company) {
        let payment = 0;

        // 金利支払い
        if (company.loans > 0) {
            payment += Math.floor(company.loans * 0.1);  // 長期金利: 10%
        }
        if (company.shortLoans > 0) {
            payment += Math.floor(company.shortLoans * 0.2);  // 短期金利: 20%
        }

        // 納税・配当（前期決算分）
        payment += company.pendingTax || 0;
        payment += company.pendingDividend || 0;

        return payment;
    }
};

// グローバルに公開
if (typeof window !== 'undefined') {
    window.AccountingSystem = AccountingSystem;
}
