/**
 * MG (Management Game) - 会計ロジック
 *
 * ※注意: このファイルのAccountingSystemオブジェクトは現在使用されていません。
 * 実際の計算はjs/game.jsの関数が使用されています。
 * 将来の参照用として残していますが、削除しても問題ありません。
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
    /**
     * VQ (変動費) を計算
     * VQ = 材料購入費 + 製造費 + (期首在庫評価額 - 期末在庫評価額)
     */
    calculateVQ: function(company) {
        const materialCost = company.totalMaterialCost || 0;
        const productionCost = company.totalProductionCost || 0;

        const startInventoryValue =
            (company.periodStartInventory.materials * INVENTORY_VALUES.material) +
            (company.periodStartInventory.wip * INVENTORY_VALUES.wip) +
            (company.periodStartInventory.products * INVENTORY_VALUES.product);

        const endInventoryValue =
            (company.materials * INVENTORY_VALUES.material) +
            (company.wip * INVENTORY_VALUES.wip) +
            (company.products * INVENTORY_VALUES.product);

        return materialCost + productionCost + startInventoryValue - endInventoryValue;
    },

    /**
     * 給料コストを計算
     */
    calculateSalaryCost: function(company, period, gameState) {
        let cost = 0;
        let unitCost = BASE_SALARY_BY_PERIOD[period] || 22;
        let halfCost = Math.round(unitCost / 2);

        // 3期以降はサイコロで単価変動
        if (period >= 3 && gameState && gameState.wageMultiplier > 1) {
            unitCost = Math.round(BASE_SALARY_BY_PERIOD[period] * gameState.wageMultiplier);
            halfCost = Math.round(unitCost / 2);
        }

        // 機械台数 × 単価
        cost += company.machines.length * unitCost;

        // ワーカー（現在 + 退職者0.5）× 単価
        cost += (company.workers + (company.retiredWorkers || 0) * 0.5) * unitCost;

        // セールスマン（現在 + 退職者0.5）× 単価
        cost += (company.salesmen + (company.retiredSalesmen || 0) * 0.5) * unitCost;

        // 期中最大人員 × 半額単価
        const maxPersonnel = company.maxPersonnel || (company.workers + company.salesmen);
        cost += maxPersonnel * halfCost;

        return Math.round(cost);
    },

    /**
     * 減価償却費を計算
     */
    calculateDepreciation: function(company, period) {
        let cost = 0;
        const isPeriod2 = period === 2;

        company.machines.forEach(machine => {
            if (machine.type === 'small') {
                if (machine.attachments > 0) {
                    cost += isPeriod2 ? DEPRECIATION.smallWithAttachment.period2 : DEPRECIATION.smallWithAttachment.period3plus;
                } else {
                    cost += isPeriod2 ? DEPRECIATION.small.period2 : DEPRECIATION.small.period3plus;
                }
            } else if (machine.type === 'large') {
                cost += isPeriod2 ? DEPRECIATION.large.period2 : DEPRECIATION.large.period3plus;
            }
        });

        return cost;
    },

    /**
     * 固定費 (F) を計算
     */
    calculateFixedCost: function(company, period, gameState) {
        let cost = 0;

        // 給料
        cost += this.calculateSalaryCost(company, period, gameState);

        // 借入金利
        cost += Math.round((company.loans || 0) * INTEREST_RATES.longTerm);
        cost += Math.round((company.shortLoans || 0) * INTEREST_RATES.shortTerm);

        // チップ費用
        cost += (company.chips.computer || 0) * CHIP_COSTS.computer;
        cost += (company.chips.insurance || 0) * CHIP_COSTS.insurance;

        // 戦略チップ費用
        const carriedOver = company.carriedOverChips || {research: 0, education: 0, advertising: 0};

        if (period === 2) {
            // 2期は全て繰り越しチップ（各枚数×20円）
            cost += (company.chips.research || 0) * CHIP_COSTS.normal;
            cost += (company.chips.education || 0) * CHIP_COSTS.normal;
            cost += (company.chips.advertising || 0) * CHIP_COSTS.normal;
        } else {
            // 繰り越しチップ
            cost += (carriedOver.research || 0) * CHIP_COSTS.normal;
            cost += (carriedOver.education || 0) * CHIP_COSTS.normal;
            cost += (carriedOver.advertising || 0) * CHIP_COSTS.normal;

            // 今期特急購入分
            const urgentResearch = Math.max(0, (company.chips.research || 0) - (carriedOver.research || 0));
            const urgentEducation = Math.max(0, (company.chips.education || 0) - (carriedOver.education || 0));
            const urgentAdvertising = Math.max(0, (company.chips.advertising || 0) - (carriedOver.advertising || 0));
            cost += urgentResearch * CHIP_COSTS.express;
            cost += urgentEducation * CHIP_COSTS.express;
            cost += urgentAdvertising * CHIP_COSTS.express;

            // 次期繰り越し分
            cost += (company.nextPeriodChips?.research || 0) * CHIP_COSTS.normal;
            cost += (company.nextPeriodChips?.education || 0) * CHIP_COSTS.normal;
            cost += (company.nextPeriodChips?.advertising || 0) * CHIP_COSTS.normal;
        }

        // 減価償却費
        cost += this.calculateDepreciation(company, period);

        // 追加固定費（機械故障など）
        cost += company.additionalFixedCost || 0;
        cost += company.extraLaborCost || 0;

        return cost;
    },

    /**
     * 経常利益 (G) を計算
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
     */
    calculateTaxAndDividend: function(previousEquity, profit, hasExceeded300) {
        const newEquity = previousEquity + profit;
        let tax = 0;
        let dividend = 0;

        if (newEquity > 300) {
            if (!hasExceeded300) {
                const excess = newEquity - 300;
                tax = Math.round(excess * 0.5);
                dividend = Math.round(excess * 0.2);
            } else if (profit > 0) {
                tax = Math.round(profit * 0.5);
                dividend = Math.round(profit * 0.1);
            }
        }

        return { tax, dividend, newEquity: newEquity - tax };
    },

    /**
     * 期末支払額を計算（給料 + 借入返済）
     * 返済額は最低10%（長期）/20%（短期）以上を選択可能
     */
    calculatePeriodEndPayment: function(company, period, gameState) {
        let payment = this.calculateSalaryCost(company, period, gameState);

        // 最低返済額
        if (company.loans > 0) {
            payment += Math.ceil(company.loans * 0.1);
        }
        if (company.shortLoans > 0) {
            payment += Math.ceil(company.shortLoans * 0.2);
        }

        return payment;
    },

    /**
     * 期首支払額を計算（金利 + 納税 + 配当）
     */
    calculatePeriodStartPayment: function(company) {
        let payment = 0;

        if (company.loans > 0) {
            payment += Math.floor(company.loans * INTEREST_RATES.longTerm);
        }
        if (company.shortLoans > 0) {
            payment += Math.floor(company.shortLoans * INTEREST_RATES.shortTerm);
        }

        payment += company.pendingTax || 0;
        payment += company.pendingDividend || 0;

        return payment;
    }
};

if (typeof window !== 'undefined') {
    window.AccountingSystem = AccountingSystem;
}
