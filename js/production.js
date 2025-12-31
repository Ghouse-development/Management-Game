/**
 * MG (Management Game) - 製造関連関数
 *
 * 生産モーダル、製造処理、ステッパーUI
 */

// ============================================
// 製造モーダル
// ============================================

// Production modal
function showProductionModal() {
    const company = gameState.companies[0];

    // 労災発生チェック（フラグはターン終了時にリセット）
    if (company.cannotProduce) {
        showToast('労災発生中のため生産できません！\n（材料購入、商品販売・入札、DO NOTHINGは可能）', 'danger', 4000);
        showDecisionCard();
        return;
    }

    const mfgCapacity = getManufacturingCapacity(company);

    const content = `
        <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 15px; text-align: center;">
            <div style="font-weight: bold; color: #92400e;">💰 持ち金: ¥${company.cash}</div>
        </div>
        <div style="background: linear-gradient(180deg, #e0f2fe 0%, #bae6fd 100%); border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 2px solid #0284c7;">
            <div style="text-align: center; margin-bottom: 10px;">
                <span style="font-size: 12px; color: #0369a1;">製造能力</span>
                <span style="font-size: 28px; font-weight: bold; color: #0c4a6e; display: block;">${mfgCapacity}個</span>
            </div>
            <div style="display: flex; justify-content: space-around; text-align: center;">
                <div style="background: #fff; border-radius: 8px; padding: 8px 15px; border: 2px solid #9b59b6;">
                    <div style="font-size: 10px; color: #7c3aed;">材料</div>
                    <div style="font-size: 20px; font-weight: bold; color: #6d28d9;">${company.materials}</div>
                </div>
                <div style="font-size: 24px; color: #0284c7; display: flex; align-items: center;">→</div>
                <div style="background: #fff; border-radius: 8px; padding: 8px 15px; border: 2px dashed #a855f7;">
                    <div style="font-size: 10px; color: #a855f7;">仕掛品</div>
                    <div style="font-size: 20px; font-weight: bold; color: #9333ea;">${company.wip}</div>
                </div>
                <div style="font-size: 24px; color: #0284c7; display: flex; align-items: center;">→</div>
                <div style="background: #fff; border-radius: 8px; padding: 8px 15px; border: 2px solid #6366f1;">
                    <div style="font-size: 10px; color: #4f46e5;">製品</div>
                    <div style="font-size: 20px; font-weight: bold; color: #4338ca;">${company.products}</div>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
            <div style="background: linear-gradient(180deg, #faf5ff 0%, #f3e8ff 100%); border-radius: 10px; padding: 12px; border: 2px solid #9b59b6;">
                <div style="font-size: 12px; font-weight: bold; color: #7c3aed; margin-bottom: 8px; text-align: center;">🔧 材料→仕掛品</div>
                <div style="font-size: 10px; color: #6b7280; text-align: center; margin-bottom: 5px;">（¥1/個）</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button type="button" onclick="adjustProduction('matToWip', -1, ${Math.min(mfgCapacity, company.materials)})" class="stepper-btn" style="width: 40px; height: 40px; border-radius: 50%; border: none; background: #7c3aed; color: white; font-size: 20px; font-weight: bold; cursor: pointer;">−</button>
                    <input type="number" id="matToWip" value="${Math.min(mfgCapacity, company.materials)}" min="0" max="${Math.min(mfgCapacity, company.materials)}" readonly style="width: 60px; height: 40px; border-radius: 8px; border: 2px solid #9b59b6; font-size: 22px; font-weight: bold; text-align: center; background: white; color: #7c3aed;">
                    <button type="button" onclick="adjustProduction('matToWip', 1, ${Math.min(mfgCapacity, company.materials)})" class="stepper-btn" style="width: 40px; height: 40px; border-radius: 50%; border: none; background: #7c3aed; color: white; font-size: 20px; font-weight: bold; cursor: pointer;">+</button>
                </div>
            </div>
            <div style="background: linear-gradient(180deg, #eef2ff 0%, #e0e7ff 100%); border-radius: 10px; padding: 12px; border: 2px solid #6366f1;">
                <div style="font-size: 12px; font-weight: bold; color: #4f46e5; margin-bottom: 8px; text-align: center;">📦 仕掛品→製品</div>
                <div style="font-size: 10px; color: #6b7280; text-align: center; margin-bottom: 5px;">（¥1/個）</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button type="button" onclick="adjustProduction('wipToProd', -1, ${Math.min(mfgCapacity, company.wip)})" class="stepper-btn" style="width: 40px; height: 40px; border-radius: 50%; border: none; background: #4f46e5; color: white; font-size: 20px; font-weight: bold; cursor: pointer;">−</button>
                    <input type="number" id="wipToProd" value="${Math.min(mfgCapacity, company.wip)}" min="0" max="${Math.min(mfgCapacity, company.wip)}" readonly style="width: 60px; height: 40px; border-radius: 8px; border: 2px solid #6366f1; font-size: 22px; font-weight: bold; text-align: center; background: white; color: #4f46e5;">
                    <button type="button" onclick="adjustProduction('wipToProd', 1, ${Math.min(mfgCapacity, company.wip)})" class="stepper-btn" style="width: 40px; height: 40px; border-radius: 50%; border: none; background: #4f46e5; color: white; font-size: 20px; font-weight: bold; cursor: pointer;">+</button>
                </div>
            </div>
        </div>

        <div style="background: #f1f5f9; border-radius: 10px; padding: 12px; text-align: center; margin-bottom: 15px;">
            <span style="font-size: 14px; color: #475569;">生産コスト: </span>
            <span id="totalCost" style="font-size: 24px; font-weight: bold; color: #dc2626;">¥0</span>
        </div>

        <button class="submit-btn" onclick="produce()" style="width: 100%;">
            🏭 生産実行
        </button>
    `;

    showModal('🏭 完成・投入', content);

    // Update cost display
    window.updateProductionCost = () => {
        const matToWip = parseInt(document.getElementById('matToWip').value) || 0;
        const wipToProd = parseInt(document.getElementById('wipToProd').value) || 0;
        const cost = matToWip + wipToProd;
        document.getElementById('totalCost').textContent = `¥${cost}`;
    };

    // Set initial cost display
    window.updateProductionCost();
}

// ============================================
// ステッパー調整関数
// ============================================

// 製造ステッパー調整
function adjustProduction(id, delta, max) {
    const input = document.getElementById(id);
    if (!input) return;
    const current = parseInt(input.value) || 0;
    const newVal = Math.max(0, Math.min(max, current + delta));
    input.value = newVal;
    if (window.updateProductionCost) window.updateProductionCost();
}

// 汎用ステッパー調整
function adjustStepper(id, delta, min, max) {
    const input = document.getElementById(id);
    if (!input) return;
    const current = parseInt(input.value) || 0;
    const newVal = Math.max(min, Math.min(max, current + delta));
    input.value = newVal;
}

// 購入ステッパー調整（コスト表示付き）
function adjustBuyStepper(delta, max, price) {
    const input = document.getElementById('buyQuantity');
    if (!input) return;
    const current = parseInt(input.value) || 0;
    const newVal = Math.max(1, Math.min(max, current + delta));
    input.value = newVal;
    const costDisplay = document.getElementById('buyCostDisplay');
    if (costDisplay) {
        costDisplay.textContent = `合計: ¥${newVal * price}`;
    }
}

// ============================================
// 製造実行
// ============================================

// Production
function produce() {
    const company = gameState.companies[0];
    const matToWip = parseInt(document.getElementById('matToWip')?.value || 0);
    const wipToProd = parseInt(document.getElementById('wipToProd')?.value || 0);

    // Check capacity limits
    const newWip = company.wip + matToWip - wipToProd;
    const newProducts = company.products + wipToProd;

    if (newWip > 10) {
        alert('仕掛品置場の容量不足です。仕掛品は10個までです。');
        return;
    }

    const maxProductCapacity = getProductCapacity(company);
    if (newProducts > maxProductCapacity) {
        if (company.warehouses === 0 || company.warehouseLocation === 'materials') {
            alert(`製品置場に10個以上置くには無災害倉庫が必要です。\n現在: ${company.products}個、生産後: ${newProducts}個`);
        } else {
            alert(`製品置場の容量（${maxProductCapacity}個）を超えます。`);
        }
        return;
    }

    const cost = matToWip + wipToProd;

    // 現金チェック（短期借入で購入は不可）
    if (company.cash < cost) {
        showToast(`現金不足のため生産できません（必要: ¥${cost}、所持: ¥${company.cash}）`, 'error', 4000);
        return;
    }

    company.cash -= cost;
    company.materials -= matToWip;
    company.wip = newWip;
    company.products = newProducts;
    company.totalProductionCost += cost;

    // 行動ログ記録
    const productionDetails = `材${matToWip}→仕掛, 仕掛${wipToProd}→製品`;
    logAction(0, '完成・投入', productionDetails, -cost, true);

    closeModal();
    updateDisplay();
    showToast(`材料${matToWip}個→仕掛品、仕掛品${wipToProd}個→製品を生産しました（¥${cost}）`, 'success', 3500);
    endTurn();
}
