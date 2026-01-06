// ==============================================
// cost-calculator.js - 統一コスト計算モジュール
// ==============================================

/**
 * 統一コスト計算システム
 * F（固定費）、VQ（変動費）の計算を一箇所に集約
 */
const CostCalculator = {

    // ============================================
    // 賃金単価計算
    // ============================================

    /**
     * 期別の基本賃金単価を取得
     */
    getBaseUnitCost(period) {
        const BASE_SALARY = window.MG_CONSTANTS?.BASE_SALARY_BY_PERIOD || {
            2: 28, 3: 28, 4: 29, 5: 30
        };
        return BASE_SALARY[period] || 28;
    },

    /**
     * サイコロ効果を適用した賃金単価を取得
     */
    getAdjustedUnitCost(period, wageMultiplier = 1.0) {
        const base = this.getBaseUnitCost(period);
        if (period >= 3 && wageMultiplier > 1) {
            return Math.round(base * wageMultiplier);
        }
        return base;
    },

    /**
     * 半額単価を計算（人員ボーナス用）
     */
    getHalfCost(unitCost) {
        return Math.round(unitCost / 2);
    },

    // ============================================
    // 給与計算
    // ============================================

    /**
     * 給与総額を計算
     * @param {Object} company - 会社オブジェクト
     * @param {number} period - 現在の期
     * @param {number} wageMultiplier - 人件費倍率（デフォルト1.0）
     * @returns {Object} 給与内訳と合計
     */
    calculateSalary(company, period, wageMultiplier = 1.0) {
        const unitCost = this.getAdjustedUnitCost(period, wageMultiplier);
        const halfCost = this.getHalfCost(unitCost);

        // 機械台数
        const machineCount = company.machines ? company.machines.length : 1;

        // 各項目の計算
        const machineSalary = machineCount * unitCost;
        const workerSalary = (company.workers || 1) * unitCost;
        const salesmanSalary = (company.salesmen || 1) * unitCost;

        // 期中最大人員ボーナス
        const maxPersonnel = company.maxPersonnel || ((company.workers || 1) + (company.salesmen || 1));
        const personnelBonus = maxPersonnel * halfCost;

        const total = machineSalary + workerSalary + salesmanSalary + personnelBonus;

        return {
            machineSalary,
            workerSalary,
            salesmanSalary,
            personnelBonus,
            total,
            breakdown: {
                unitCost,
                halfCost,
                machineCount,
                workers: company.workers || 1,
                salesmen: company.salesmen || 1,
                maxPersonnel
            }
        };
    },

    // ============================================
    // 減価償却計算
    // ============================================

    /**
     * 減価償却費を計算
     */
    calculateDepreciation(company, period) {
        const DEPRECIATION = window.MG_CONSTANTS?.DEPRECIATION || {
            small: { period2: 10, other: 20 },
            smallWithAttachment: { period2: 13, other: 26 },
            large: { period2: 20, other: 40 }
        };

        const isPeriod2 = period === 2;
        let total = 0;
        const details = [];

        if (company.machines && Array.isArray(company.machines)) {
            company.machines.forEach((machine, index) => {
                let amount = 0;
                let type = '';

                if (machine.type === 'small') {
                    if (machine.attachments > 0) {
                        amount = isPeriod2 ? DEPRECIATION.smallWithAttachment.period2
                                           : DEPRECIATION.smallWithAttachment.other;
                        type = '小型機械（増設付）';
                    } else {
                        amount = isPeriod2 ? DEPRECIATION.small.period2 : DEPRECIATION.small.other;
                        type = '小型機械';
                    }
                } else if (machine.type === 'large') {
                    amount = isPeriod2 ? DEPRECIATION.large.period2 : DEPRECIATION.large.other;
                    type = '大型機械';
                }

                total += amount;
                details.push({ type, amount, index });
            });
        }

        return { total, details };
    },

    // ============================================
    // チップコスト計算
    // ============================================

    /**
     * チップコストを計算
     */
    calculateChipCost(company, period) {
        const CHIP_COSTS = window.MG_CONSTANTS?.CHIP_COSTS || {
            research: 20, education: 20, advertising: 20, express: 40
        };

        const currentChips = company.chips || { research: 0, education: 0, advertising: 0 };
        const carriedOver = company.carriedOverChips || { research: 0, education: 0, advertising: 0 };
        const nextPeriod = company.nextPeriodChips || { research: 0, education: 0, advertising: 0 };

        let total = 0;
        const details = {
            research: 0,
            education: 0,
            advertising: 0,
            researchExpress: 0,
            educationExpress: 0,
            advertisingExpress: 0,
            nextPeriod: 0
        };

        if (period === 2) {
            // 2期: 全て通常購入（¥20）
            details.research = (currentChips.research || 0) * CHIP_COSTS.research;
            details.education = (currentChips.education || 0) * CHIP_COSTS.education;
            details.advertising = (currentChips.advertising || 0) * CHIP_COSTS.advertising;
        } else {
            // 3期以降: 繰越（¥20）+ 特急（¥40）+ 次期予約（¥20）

            // 繰越分
            details.research = (carriedOver.research || 0) * CHIP_COSTS.research;
            details.education = (carriedOver.education || 0) * CHIP_COSTS.education;
            details.advertising = (carriedOver.advertising || 0) * CHIP_COSTS.advertising;

            // 特急分（現在 - 繰越）
            const urgentResearch = Math.max(0, (currentChips.research || 0) - (carriedOver.research || 0));
            const urgentEducation = Math.max(0, (currentChips.education || 0) - (carriedOver.education || 0));
            const urgentAdvertising = Math.max(0, (currentChips.advertising || 0) - (carriedOver.advertising || 0));

            details.researchExpress = urgentResearch * CHIP_COSTS.express;
            details.educationExpress = urgentEducation * CHIP_COSTS.express;
            details.advertisingExpress = urgentAdvertising * CHIP_COSTS.express;

            // 次期予約分
            details.nextPeriod = ((nextPeriod.research || 0) +
                                  (nextPeriod.education || 0) +
                                  (nextPeriod.advertising || 0)) * CHIP_COSTS.research;
        }

        total = details.research + details.education + details.advertising +
                details.researchExpress + details.educationExpress + details.advertisingExpress +
                details.nextPeriod;

        // PC・保険（戦略チップとは別）
        const pcCost = (currentChips.computer || 0) * 20;
        const insuranceCost = (currentChips.insurance || 0) * 5;

        return {
            strategyChips: total,
            pc: pcCost,
            insurance: insuranceCost,
            total: total + pcCost + insuranceCost,
            details
        };
    },

    // ============================================
    // 金利計算
    // ============================================

    /**
     * 金利を計算
     */
    calculateInterest(company) {
        const INTEREST_RATES = window.MG_CONSTANTS?.INTEREST_RATES || {
            longTerm: 0.1,
            shortTerm: 0.2
        };

        const longInterest = Math.round((company.loans || 0) * INTEREST_RATES.longTerm);
        const shortInterest = Math.round((company.shortLoans || 0) * INTEREST_RATES.shortTerm);

        // 期首に支払った金利と新規借入時の金利を追跡している場合はそちらを使用
        const actualPaid = (company.periodStartInterest || 0) + (company.newLoanInterest || 0);

        return {
            long: longInterest,
            short: shortInterest,
            calculated: longInterest + shortInterest,
            actualPaid: actualPaid > 0 ? actualPaid : longInterest + shortInterest,
            total: actualPaid > 0 ? actualPaid : longInterest + shortInterest
        };
    },

    // ============================================
    // 倉庫コスト計算
    // ============================================

    /**
     * 倉庫コストを計算
     */
    calculateWarehouseCost(company) {
        const WAREHOUSE_COST = window.MG_CONSTANTS?.WAREHOUSE_COST || 20;
        const count = company.warehouses || 0;
        return {
            count,
            costPerUnit: WAREHOUSE_COST,
            total: count * WAREHOUSE_COST
        };
    },

    // ============================================
    // その他コスト計算
    // ============================================

    /**
     * その他のFコストを計算
     */
    calculateOtherCosts(company) {
        return {
            additionalF: company.additionalFixedCost || 0,      // リスクカードによる追加F
            extraLabor: company.extraLaborCost || 0             // 緊急採用・縁故採用
        };
    },

    // ============================================
    // F（固定費）総合計算
    // ============================================

    /**
     * F（固定費）を計算
     * @param {Object} company - 会社オブジェクト
     * @param {number} period - 現在の期
     * @param {number} wageMultiplier - 人件費倍率（省略時はgameStateから取得）
     * @returns {Object} F内訳と合計
     */
    calculateF(company, period, wageMultiplier = null) {
        // 人件費倍率を取得
        const multiplier = wageMultiplier !== null ? wageMultiplier :
                          (typeof gameState !== 'undefined' ? gameState.wageMultiplier || 1.0 : 1.0);

        // 各項目を計算
        const salary = this.calculateSalary(company, period, multiplier);
        const depreciation = this.calculateDepreciation(company, period);
        const chips = this.calculateChipCost(company, period);
        const interest = this.calculateInterest(company);
        const warehouse = this.calculateWarehouseCost(company);
        const other = this.calculateOtherCosts(company);

        // 合計
        const total = salary.total +
                     depreciation.total +
                     chips.total +
                     interest.total +
                     warehouse.total +
                     other.additionalF +
                     other.extraLabor;

        return {
            salary: salary.total,
            depreciation: depreciation.total,
            chips: chips.total,
            interest: interest.total,
            warehouse: warehouse.total,
            additionalF: other.additionalF,
            extraLabor: other.extraLabor,
            total,
            breakdown: {
                salary,
                depreciation,
                chips,
                interest,
                warehouse,
                other
            }
        };
    },

    // ============================================
    // VQ（変動費）計算
    // ============================================

    /**
     * VQ（変動費）を計算
     * VQ = 材料費 + 製造費 + (期首在庫評価額 - 期末在庫評価額)
     */
    calculateVQ(company) {
        const materialCost = company.totalMaterialCost || 0;
        const productionCost = company.totalProductionCost || 0;

        // 在庫評価（V=12で計算）
        const V = 12;
        const startInventory = company.periodStartInventory || { materials: 0, wip: 0, products: 0 };
        const endInventory = {
            materials: company.materials || 0,
            wip: company.wip || 0,
            products: company.products || 0
        };

        const startValue = (startInventory.materials + startInventory.wip + startInventory.products) * V;
        const endValue = (endInventory.materials + endInventory.wip + endInventory.products) * V;

        const inventoryAdjustment = startValue - endValue;

        const total = materialCost + productionCost + inventoryAdjustment;

        return {
            materialCost,
            productionCost,
            startValue,
            endValue,
            inventoryAdjustment,
            total,
            breakdown: {
                startInventory,
                endInventory,
                unitValue: V
            }
        };
    },

    // ============================================
    // MQ（限界利益）計算
    // ============================================

    /**
     * MQ（限界利益）を計算
     * MQ = PQ - VQ
     */
    calculateMQ(company) {
        const pq = company.totalSales || 0;
        const vq = this.calculateVQ(company);
        const mq = pq - vq.total;

        return {
            pq,
            vq: vq.total,
            mq,
            breakdown: {
                vqDetails: vq
            }
        };
    },

    // ============================================
    // G（利益）計算
    // ============================================

    /**
     * G（利益）を計算
     * G = MQ - F - 特別損失
     */
    calculateG(company, period, wageMultiplier = null) {
        const mqResult = this.calculateMQ(company);
        const fResult = this.calculateF(company, period, wageMultiplier);
        const specialLoss = company.specialLoss || 0;

        const g = mqResult.mq - fResult.total - specialLoss;

        return {
            pq: mqResult.pq,
            vq: mqResult.vq,
            mq: mqResult.mq,
            f: fResult.total,
            specialLoss,
            g,
            breakdown: {
                mqDetails: mqResult,
                fDetails: fResult
            }
        };
    }
};

// グローバル公開
if (typeof window !== 'undefined') {
    window.CostCalculator = CostCalculator;
}
