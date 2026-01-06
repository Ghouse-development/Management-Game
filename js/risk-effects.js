/**
 * MG (Management Game) - リスクカード特殊効果関数
 *
 * 特別サービス、仕入れ交渉、縁故採用、各社共通購入など
 */

// ============================================
// 特別サービス（リスクカード19-20）
// ============================================

function showSpecialServiceModal() {
    const content = `
        <div class="form-group">
            <label class="form-label">特別サービスを選択してください:</label>
            <div style="margin: 10px 0;">
                <button class="action-btn primary" onclick="executeMaterialPurchase()" style="width: 100%; margin: 5px 0;">
                    材料購入（1個¥10で5個まで）
                </button>
                <button class="action-btn secondary" onclick="executeAdPurchase()" style="width: 100%; margin: 5px 0;">
                    広告チップ購入（1枚¥20で2枚まで）
                </button>
            </div>
        </div>
    `;

    showModal('特別サービス', content);
}

function executeMaterialPurchase() {
    const company = gameState.companies[0];
    const canBuy = [0, 1, 2, 3, 4, 5].map(i => company.cash >= i * 10);

    const content = `
        <div style="text-align: center; margin-bottom: 15px;">
            <p style="font-size: 14px; color: #4b5563; margin: 5px 0;">特別価格：1個10円（最大5個まで）</p>
            <p style="font-size: 14px; color: #059669; font-weight: bold;">現金: ¥${company.cash} ｜ 材料: ${company.materials}個</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <div onclick="confirmMaterialPurchase(0)" class="qty-card" style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); border: 2px solid #9ca3af; border-radius: 10px; padding: 15px; text-align: center; cursor: pointer; color: white;">
                <div style="font-size: 24px; font-weight: bold;">0</div>
                <div style="font-size: 11px; opacity: 0.8;">購入しない</div>
            </div>
            <div onclick="${canBuy[1] ? 'confirmMaterialPurchase(1)' : ''}" class="qty-card" style="background: ${canBuy[1] ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : '#374151'}; border: 2px solid ${canBuy[1] ? '#4ade80' : '#4b5563'}; border-radius: 10px; padding: 15px; text-align: center; cursor: ${canBuy[1] ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy[1] ? '1' : '0.5'};">
                <div style="font-size: 24px; font-weight: bold;">1</div>
                <div style="font-size: 11px; opacity: 0.8;">¥10</div>
            </div>
            <div onclick="${canBuy[2] ? 'confirmMaterialPurchase(2)' : ''}" class="qty-card" style="background: ${canBuy[2] ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : '#374151'}; border: 2px solid ${canBuy[2] ? '#4ade80' : '#4b5563'}; border-radius: 10px; padding: 15px; text-align: center; cursor: ${canBuy[2] ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy[2] ? '1' : '0.5'};">
                <div style="font-size: 24px; font-weight: bold;">2</div>
                <div style="font-size: 11px; opacity: 0.8;">¥20</div>
            </div>
            <div onclick="${canBuy[3] ? 'confirmMaterialPurchase(3)' : ''}" class="qty-card" style="background: ${canBuy[3] ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : '#374151'}; border: 2px solid ${canBuy[3] ? '#4ade80' : '#4b5563'}; border-radius: 10px; padding: 15px; text-align: center; cursor: ${canBuy[3] ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy[3] ? '1' : '0.5'};">
                <div style="font-size: 24px; font-weight: bold;">3</div>
                <div style="font-size: 11px; opacity: 0.8;">¥30</div>
            </div>
            <div onclick="${canBuy[4] ? 'confirmMaterialPurchase(4)' : ''}" class="qty-card" style="background: ${canBuy[4] ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : '#374151'}; border: 2px solid ${canBuy[4] ? '#4ade80' : '#4b5563'}; border-radius: 10px; padding: 15px; text-align: center; cursor: ${canBuy[4] ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy[4] ? '1' : '0.5'};">
                <div style="font-size: 24px; font-weight: bold;">4</div>
                <div style="font-size: 11px; opacity: 0.8;">¥40</div>
            </div>
            <div onclick="${canBuy[5] ? 'confirmMaterialPurchase(5)' : ''}" class="qty-card" style="background: ${canBuy[5] ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : '#374151'}; border: 2px solid ${canBuy[5] ? '#4ade80' : '#4b5563'}; border-radius: 10px; padding: 15px; text-align: center; cursor: ${canBuy[5] ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy[5] ? '1' : '0.5'};">
                <div style="font-size: 24px; font-weight: bold;">5</div>
                <div style="font-size: 11px; opacity: 0.8;">¥50</div>
            </div>
        </div>
    `;

    showModal('🛒 材料購入', content);
}

function confirmMaterialPurchase(buyQty) {
    const company = gameState.companies[0];

    if (buyQty > 0) {
        const cost = buyQty * 10;
        company.cash -= cost;
        company.materials += buyQty;
        company.totalMaterialCost += cost;

        // ★★★ VQ詳細表示用ログ ★★★
        logAction(0, '材料購入', `特別サービス¥10×${buyQty}個`, -cost, true);

        incrementRow(gameState.companies.indexOf(company));
        closeModal();
        alert(`特別サービス：材料${buyQty}個を¥${cost}で購入しました`);
        updateDisplay();
        nextTurn();
    } else {
        closeModal();
        showDecisionCard();
    }
}

function executeAdPurchase() {
    const company = gameState.companies[0];
    const canBuy1 = company.cash >= 20;
    const canBuy2 = company.cash >= 40;

    const content = `
        <div style="text-align: center; margin-bottom: 15px;">
            <p style="font-size: 14px; color: #4b5563; margin: 5px 0;">特別価格：1枚20円（最大2枚まで）</p>
            <p style="font-size: 14px; color: #059669; font-weight: bold;">現金: ¥${company.cash} ｜ 広告: ${company.chips.advertising || 0}枚</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <div onclick="confirmAdPurchase(0)" class="qty-card" style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); border: 2px solid #9ca3af; border-radius: 10px; padding: 20px; text-align: center; cursor: pointer; color: white;">
                <div style="font-size: 24px; font-weight: bold;">0</div>
                <div style="font-size: 11px; opacity: 0.8;">購入しない</div>
            </div>
            <div onclick="${canBuy1 ? 'confirmAdPurchase(1)' : ''}" class="qty-card" style="background: ${canBuy1 ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : '#374151'}; border: 2px solid ${canBuy1 ? '#fbbf24' : '#4b5563'}; border-radius: 10px; padding: 20px; text-align: center; cursor: ${canBuy1 ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy1 ? '1' : '0.5'};">
                <div style="font-size: 24px; font-weight: bold;">1</div>
                <div style="font-size: 11px; opacity: 0.8;">¥20</div>
            </div>
            <div onclick="${canBuy2 ? 'confirmAdPurchase(2)' : ''}" class="qty-card" style="background: ${canBuy2 ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : '#374151'}; border: 2px solid ${canBuy2 ? '#fbbf24' : '#4b5563'}; border-radius: 10px; padding: 20px; text-align: center; cursor: ${canBuy2 ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy2 ? '1' : '0.5'};">
                <div style="font-size: 24px; font-weight: bold;">2</div>
                <div style="font-size: 11px; opacity: 0.8;">¥40</div>
            </div>
        </div>
    `;

    showModal('📢 広告チップ購入', content);
}

function confirmAdPurchase(buyQty) {
    const company = gameState.companies[0];

    if (buyQty > 0) {
        const cost = buyQty * 20;
        company.cash -= cost;
        company.chips.advertising = (company.chips.advertising || 0) + buyQty;
        incrementRow(gameState.companies.indexOf(company));
        closeModal();
        alert(`特別サービス：広告チップ${buyQty}枚を¥${cost}で購入しました`);
        updateDisplay();
        nextTurn();
    } else {
        closeModal();
        showDecisionCard();
    }
}

// ============================================
// 仕入れ交渉システム
// ============================================

let purchaseNegotiationState = {
    cardType: null,
    maxSellQty: 0,
    ownProducts: 0,
    needToBuy: 0,
    purchases: [],
    onComplete: null
};

function getAINegotiationResponse(aiCompany, requestedQty, offeredPrice) {
    const strategy = aiCompany.strategy;
    const hasProducts = aiCompany.products >= requestedQty;

    if (!hasProducts) {
        return { accept: false, counter: null, reason: '在庫不足' };
    }

    let minPrice;
    switch (strategy) {
        case 'aggressive':
            minPrice = 26;
            break;
        case 'balanced':
            minPrice = 24;
            break;
        case 'conservative':
            minPrice = 28;
            break;
        case 'price_focused':
            minPrice = 22;
            break;
        case 'tech_focused':
            minPrice = 25;
            break;
        case 'unpredictable':
            minPrice = 18 + Math.floor(Math.random() * 14);
            break;
        default:
            minPrice = 25;
    }

    if (offeredPrice >= minPrice) {
        return { accept: true, counter: null, reason: null };
    } else {
        const counterPrice = Math.min(31, minPrice + Math.floor(Math.random() * 3));
        return { accept: false, counter: counterPrice, reason: `¥${counterPrice}なら売ります` };
    }
}

function showPurchaseNegotiationModal(cardType, maxSellQty, ownProducts, onComplete) {
    const company = gameState.companies[0];
    const needToBuy = maxSellQty - ownProducts;

    if (needToBuy <= 0) {
        onComplete(0, 0, []);
        return;
    }

    const otherCompanies = gameState.companies.slice(1).filter(c => c.products > 0);

    if (otherCompanies.length === 0) {
        alert('他企業に在庫がないため仕入れできません');
        onComplete(0, 0, []);
        return;
    }

    purchaseNegotiationState = {
        cardType,
        maxSellQty,
        ownProducts,
        needToBuy,
        purchases: [],
        onComplete
    };

    let content = `
        <div class="form-group">
            <p><strong>販売可能数:</strong> ${maxSellQty}個（自社${ownProducts}個 + 仕入れ${needToBuy}個まで）</p>
            <p><strong>仕入れ可能数:</strong> 最大${needToBuy}個</p>
            <hr style="margin: 10px 0;">
            <p><strong>他企業から仕入れ交渉:</strong></p>
            <div id="negotiationList">
    `;

    otherCompanies.forEach((c, idx) => {
        const actualIdx = gameState.companies.indexOf(c);
        content += `
            <div style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px;">
                <strong>${c.name}</strong>（在庫: ${c.products}個）
                <div style="display: flex; gap: 10px; margin-top: 5px; align-items: center;">
                    <label>数量: <input type="number" id="negQty_${actualIdx}" min="0" max="${Math.min(c.products, needToBuy)}" value="0" style="width: 60px;"></label>
                    <label>希望価格: ¥<input type="number" id="negPrice_${actualIdx}" min="15" max="31" value="25" style="width: 60px;"></label>
                    <button class="action-btn secondary" onclick="negotiateWithCompany(${actualIdx})" style="padding: 5px 10px;">交渉</button>
                    <span id="negResult_${actualIdx}" style="font-size: 12px;"></span>
                </div>
            </div>
        `;
    });

    content += `
            </div>
            <div id="purchaseSummary" style="margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 5px;">
                <p>仕入れ合計: <span id="totalPurchased">0</span>個 / 費用: ¥<span id="totalCost">0</span></p>
            </div>
            <div style="margin-top: 15px; display: flex; gap: 10px;">
                <button class="action-btn primary" onclick="completePurchaseNegotiation()">仕入れ完了</button>
                <button class="action-btn secondary" onclick="skipPurchaseNegotiation()">仕入れしない</button>
            </div>
        </div>
    `;

    showModal('仕入れ交渉', content);
}

function negotiateWithCompany(companyIndex) {
    const aiCompany = gameState.companies[companyIndex];
    const qtyInput = document.getElementById(`negQty_${companyIndex}`);
    const priceInput = document.getElementById(`negPrice_${companyIndex}`);
    const resultSpan = document.getElementById(`negResult_${companyIndex}`);

    const requestedQty = parseInt(qtyInput.value) || 0;
    const offeredPrice = parseInt(priceInput.value) || 25;

    if (requestedQty <= 0) {
        resultSpan.textContent = '数量を指定してください';
        resultSpan.style.color = 'orange';
        return;
    }

    if (requestedQty > aiCompany.products) {
        resultSpan.textContent = '在庫不足';
        resultSpan.style.color = 'red';
        return;
    }

    purchaseNegotiationState.purchases = purchaseNegotiationState.purchases.filter(
        p => p.companyIndex !== companyIndex
    );

    const currentTotal = purchaseNegotiationState.purchases.reduce((sum, p) => sum + p.qty, 0);
    const remainingNeed = purchaseNegotiationState.needToBuy - currentTotal;

    if (requestedQty > remainingNeed) {
        resultSpan.textContent = `あと${remainingNeed}個まで`;
        resultSpan.style.color = 'orange';
        return;
    }

    const response = getAINegotiationResponse(aiCompany, requestedQty, offeredPrice);

    if (response.accept) {
        purchaseNegotiationState.purchases.push({
            companyIndex,
            qty: requestedQty,
            price: offeredPrice
        });
        resultSpan.textContent = `✓ ${requestedQty}個×¥${offeredPrice}で合意`;
        resultSpan.style.color = 'green';
    } else if (response.counter) {
        resultSpan.textContent = response.reason;
        resultSpan.style.color = 'blue';
        priceInput.value = response.counter;
    } else {
        resultSpan.textContent = response.reason;
        resultSpan.style.color = 'red';
    }

    updatePurchaseSummary();
}

function updatePurchaseSummary() {
    const totalPurchased = purchaseNegotiationState.purchases.reduce((sum, p) => sum + p.qty, 0);
    const totalCost = purchaseNegotiationState.purchases.reduce((sum, p) => sum + (p.qty * p.price), 0);

    const purchasedSpan = document.getElementById('totalPurchased');
    const costSpan = document.getElementById('totalCost');

    if (purchasedSpan) purchasedSpan.textContent = totalPurchased;
    if (costSpan) costSpan.textContent = totalCost;
}

function completePurchaseNegotiation() {
    const company = gameState.companies[0];
    const state = purchaseNegotiationState;

    const totalPurchased = state.purchases.reduce((sum, p) => sum + p.qty, 0);
    const totalCost = state.purchases.reduce((sum, p) => sum + (p.qty * p.price), 0);

    if (totalCost > company.cash) {
        alert(`資金不足です（必要: ¥${totalCost}、現金: ¥${company.cash}）`);
        return;
    }

    company.cash -= totalCost;
    state.purchases.forEach(p => {
        gameState.companies[p.companyIndex].products -= p.qty;
        gameState.companies[p.companyIndex].cash += p.qty * p.price;
    });

    closeModal();

    if (state.onComplete) {
        state.onComplete(totalPurchased, totalCost, state.purchases);
    }
}

function skipPurchaseNegotiation() {
    closeModal();
    if (purchaseNegotiationState.onComplete) {
        purchaseNegotiationState.onComplete(0, 0, []);
    }
}

function executeSpecialSaleWithPurchase(cardType, chipType, maxPerChip, salesCapacityRequired) {
    const company = gameState.companies[0];

    let chipCount = 0;
    if (chipType === 'education') chipCount = company.chips.education || 0;
    else if (chipType === 'advertising') chipCount = company.chips.advertising || 0;
    else if (chipType === 'research') chipCount = company.chips.research || 0;
    else if (chipType === 'salesmen') chipCount = company.salesmen || 0;

    if (chipCount <= 0 && chipType !== 'salesmen') {
        return { success: false, reason: 'チップなし' };
    }
    if (chipType === 'salesmen' && chipCount <= 0) {
        return { success: false, reason: 'セールスマンなし' };
    }

    let maxSell = chipCount * maxPerChip;
    maxSell = Math.min(maxSell, 5);

    if (salesCapacityRequired) {
        const salesCapacity = getSalesCapacity(company);
        maxSell = Math.min(maxSell, salesCapacity);
    }

    const ownProducts = company.products;

    if (ownProducts <= 0 && cardType !== 'research') {
        showPurchaseNegotiationModal(cardType, maxSell, ownProducts, (purchasedQty, purchaseCost, purchases) => {
            const totalSell = purchasedQty;
            if (totalSell > 0) {
                const revenue = totalSell * 32;
                company.cash += revenue;
                company.totalSales += revenue;
                company.totalSoldQuantity = (company.totalSoldQuantity || 0) + totalSell;

                // ★★★ PQ詳細表示用ログ ★★★
                const actionName = cardType === 'education' ? '教育成功' : cardType === 'advertising' ? '広告成功' : '独占販売';
                logAction(0, '商品販売', `${actionName}¥32×${totalSell}個`, revenue, true);

                alert(`${cardType === 'education' ? '教育成功' : cardType === 'advertising' ? '広告成功' : '商品の独占販売'}！\n仕入れ${purchasedQty}個（¥${purchaseCost}）→ ${totalSell}個を¥${revenue}で販売\n純利益: ¥${revenue - purchaseCost}`);
                endTurn();
            } else {
                alert('仕入れなし：効果なし');
                nextTurn();
            }
        });
        return { success: true, async: true };
    }

    showPurchaseNegotiationModal(cardType, maxSell, ownProducts, (purchasedQty, purchaseCost, purchases) => {
        const totalSell = ownProducts + purchasedQty;
        const sellFromOwn = Math.min(ownProducts, totalSell);

        if (totalSell > 0) {
            company.products -= sellFromOwn;
            const revenue = totalSell * 32;
            company.cash += revenue;
            company.totalSales += revenue;
            company.totalSoldQuantity = (company.totalSoldQuantity || 0) + totalSell;

            // ★★★ PQ詳細表示用ログ ★★★
            const actionName = cardType === 'education' ? '教育成功' : cardType === 'advertising' ? '広告成功' : '独占販売';
            logAction(0, '商品販売', `${actionName}¥32×${totalSell}個`, revenue, true);

            let message = `${cardType === 'education' ? '教育成功' : cardType === 'advertising' ? '広告成功' : '商品の独占販売'}！\n`;
            message += `自社${sellFromOwn}個`;
            if (purchasedQty > 0) {
                message += ` + 仕入れ${purchasedQty}個（¥${purchaseCost}）`;
            }
            message += `\n合計${totalSell}個を¥${revenue}で販売`;
            if (purchasedQty > 0) {
                message += `\n純利益: ¥${revenue - purchaseCost}`;
            }
            alert(message);
            endTurn();
        } else {
            alert('販売なし：効果なし');
            nextTurn();
        }
    });

    return { success: true, async: true };
}

// ============================================
// 強制行動モーダル
// ============================================

function showForcedActionModal() {
    const content = `
        <div class="form-group">
            <label class="form-label">消費者運動発生：販売禁止のため、以下から選択してください</label>
            <div style="margin: 10px 0;">
                <button class="action-btn primary" onclick="closeModal(); showMaterialPurchaseModal();" style="width: 100%; margin: 5px 0;">
                    材料購入
                </button>
                <button class="action-btn primary" onclick="closeModal(); showProductionModal();" style="width: 100%; margin: 5px 0;">
                    完成・投入
                </button>
                <button class="action-btn secondary" onclick="closeModal(); doNothing();" style="width: 100%; margin: 5px 0;">
                    Do Nothing（1行消費）
                </button>
            </div>
        </div>
    `;

    showModal('消費者運動発生 - 行動選択', content);
}

function showLaborAccidentActionModal() {
    const content = `
        <div class="form-group">
            <div style="background: #fee2e2; border: 2px solid #dc2626; border-radius: 8px; padding: 12px; margin-bottom: 15px; text-align: center;">
                <div style="font-weight: bold; color: #b91c1c;">⚠️ 労災発生中</div>
                <div style="font-size: 12px; color: #7f1d1d; margin-top: 5px;">生産活動はできません</div>
            </div>
            <label class="form-label">以下から行動を選択してください：</label>
            <div style="margin: 10px 0;">
                <button class="action-btn success" onclick="closeModal(); showSaleModal();" style="width: 100%; margin: 5px 0;">
                    💰 商品販売
                </button>
                <button class="action-btn primary" onclick="closeModal(); showMaterialPurchaseModal();" style="width: 100%; margin: 5px 0;">
                    📦 材料購入
                </button>
                <button class="action-btn secondary" onclick="closeModal(); doNothing();" style="width: 100%; margin: 5px 0;">
                    ⏸️ Do Nothing（1行消費）
                </button>
            </div>
        </div>
    `;

    showModal('労災発生 - 行動選択', content);
}

// ============================================
// 縁故採用（リスクカード33-34）
// ============================================

function showHiringChoiceModal() {
    const company = gameState.companies[0];
    const content = `
        <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 15px; text-align: center;">
            <div style="font-weight: bold; color: #92400e;">💰 持ち金: ¥${company.cash}</div>
        </div>
        <p style="text-align: center; margin-bottom: 15px; color: #666; font-size: 14px;">縁故採用：追加する人員を選択（本社経費¥5）</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div onclick="executeHiring('salesman')" style="
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
                border: 3px solid #c44;
                border-radius: 12px;
                padding: 20px 15px;
                text-align: center;
                cursor: pointer;
                color: white;
                transition: transform 0.2s, box-shadow 0.2s;
                box-shadow: 0 4px 12px rgba(238, 90, 90, 0.4);
            " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(238, 90, 90, 0.6)'"
               onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(238, 90, 90, 0.4)'">
                <div style="font-size: 36px; margin-bottom: 8px;">💼</div>
                <div style="font-weight: bold; font-size: 16px;">セールスマン</div>
                <div style="font-size: 12px; margin-top: 5px;">+1名</div>
            </div>
            <div onclick="executeHiring('worker')" style="
                background: linear-gradient(135deg, #f5deb3 0%, #deb887 100%);
                border: 3px solid #a08060;
                border-radius: 12px;
                padding: 20px 15px;
                text-align: center;
                cursor: pointer;
                color: #5d4037;
                transition: transform 0.2s, box-shadow 0.2s;
                box-shadow: 0 4px 12px rgba(160, 128, 96, 0.4);
            " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(160, 128, 96, 0.6)'"
               onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(160, 128, 96, 0.4)'">
                <div style="font-size: 36px; margin-bottom: 8px;">👷</div>
                <div style="font-weight: bold; font-size: 16px;">ワーカー</div>
                <div style="font-size: 12px; margin-top: 5px;">+1名</div>
            </div>
        </div>
        <div style="text-align: center; margin-top: 15px;">
            <button class="cancel-btn" onclick="closeModal(true)" style="padding: 10px 30px;">キャンセル</button>
        </div>
    `;

    showModal('縁故採用', content);
}

function executeHiring(type) {
    const company = gameState.companies[0];
    const cost = 5;

    if (company.cash < cost) {
        showToast(`現金不足のため採用できません（必要: ¥${cost}、所持: ¥${company.cash}）`, 'error', 4000);
        return;
    }

    company.cash -= cost;
    company.extraLaborCost = (company.extraLaborCost || 0) + cost;

    if (type === 'worker') {
        company.workers++;
        logAction(0, '縁故採用', 'ワーカー+1', -cost, true);
        closeModal();
        alert('縁故採用：ワーカーを1名追加しました（¥5）');
    } else if (type === 'salesman') {
        company.salesmen++;
        logAction(0, '縁故採用', 'セールス+1', -cost, true);
        closeModal();
        alert('縁故採用：セールスマンを1名追加しました（¥5）');
    }

    updateDisplay();
    endTurn();
}

// ============================================
// 各社共通購入（リスクカード41-42）- プレイヤーが引いた場合
// ============================================

function executeAllCompaniesCommonPurchase() {
    const triggerCompany = gameState.companies[gameState.currentPlayerIndex];
    const player = gameState.companies[0];
    const canBuy1 = player.cash >= 12;
    const canBuy2 = player.cash >= 24;
    const canBuy3 = player.cash >= 36;

    const content = `
        <div class="risk-display" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-color: #a78bfa;">
            <div class="risk-badge">📦 各社共通</div>
            <div class="risk-title">${triggerCompany.name}が引きました</div>
            <div class="risk-description">全社が¥12で3個まで材料を購入できます</div>
        </div>
        <div style="text-align: center; margin: 15px 0; color: #4ade80; font-weight: bold;">
            💰 現金: ¥${player.cash}　　📦 材料: ${player.materials}個
        </div>
        <p style="text-align: center; margin-bottom: 10px; color: #666;">購入する数量をタップしてください</p>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
            <div onclick="selectCommonPurchase(0)" class="qty-card" style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); border: 2px solid #9ca3af; border-radius: 10px; padding: 12px; text-align: center; cursor: pointer; color: white;">
                <div style="font-size: 24px;">🚫</div>
                <div style="font-size: 14px; font-weight: bold;">なし</div>
                <div style="font-size: 11px; color: #d1d5db;">¥0</div>
            </div>
            <div onclick="${canBuy1 ? 'selectCommonPurchase(1)' : ''}" class="qty-card" style="background: ${canBuy1 ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : '#374151'}; border: 2px solid ${canBuy1 ? '#a78bfa' : '#4b5563'}; border-radius: 10px; padding: 12px; text-align: center; cursor: ${canBuy1 ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy1 ? '1' : '0.5'};">
                <div style="font-size: 24px;">📦</div>
                <div style="font-size: 14px; font-weight: bold;">1個</div>
                <div style="font-size: 11px; color: #d1d5db;">¥12</div>
            </div>
            <div onclick="${canBuy2 ? 'selectCommonPurchase(2)' : ''}" class="qty-card" style="background: ${canBuy2 ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : '#374151'}; border: 2px solid ${canBuy2 ? '#a78bfa' : '#4b5563'}; border-radius: 10px; padding: 12px; text-align: center; cursor: ${canBuy2 ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy2 ? '1' : '0.5'};">
                <div style="font-size: 24px;">📦📦</div>
                <div style="font-size: 14px; font-weight: bold;">2個</div>
                <div style="font-size: 11px; color: #d1d5db;">¥24</div>
            </div>
            <div onclick="${canBuy3 ? 'selectCommonPurchase(3)' : ''}" class="qty-card" style="background: ${canBuy3 ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : '#374151'}; border: 2px solid ${canBuy3 ? '#a78bfa' : '#4b5563'}; border-radius: 10px; padding: 12px; text-align: center; cursor: ${canBuy3 ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy3 ? '1' : '0.5'};">
                <div style="font-size: 24px;">📦📦📦</div>
                <div style="font-size: 14px; font-weight: bold;">3個</div>
                <div style="font-size: 11px; color: #d1d5db;">¥36</div>
            </div>
        </div>
    `;

    showModal('各社共通購入', content);
}

function selectCommonPurchase(qty) {
    window.selectedCommonQty = qty;
    processCommonPurchase();
}

function processCommonPurchase() {
    const playerQty = window.selectedCommonQty || 0;
    let purchaseLog = [];
    let playerPurchased = false;

    if (playerQty > 0) {
        const playerCompany = gameState.companies[0];

        // ★★★ 3期以降は製造能力が購入上限 ★★★
        const mfgCapacity = getManufacturingCapacity(playerCompany);
        const isPeriod2 = gameState.currentPeriod === 2;
        const maxByMfg = isPeriod2 ? 99 : mfgCapacity;

        // ★★★ 材料容量チェック ★★★
        const maxMaterialCapacity = getMaterialCapacity(playerCompany);
        const spaceAvailable = maxMaterialCapacity - playerCompany.materials;

        // 実際に購入できる数量を計算
        const actualPlayerQty = Math.min(playerQty, maxByMfg, spaceAvailable);

        if (actualPlayerQty <= 0) {
            if (spaceAvailable <= 0) {
                purchaseLog.push('あなた: 材料置場が満杯で購入できず');
            } else if (!isPeriod2 && mfgCapacity === 0) {
                purchaseLog.push('あなた: 製造能力がないため購入できず');
            } else {
                purchaseLog.push('あなた: 購入しない');
            }
        } else {
            const cost = actualPlayerQty * 12;

            if (playerCompany.cash >= cost) {
                let purchased = 0;

                for (const market of gameState.markets) {
                    if (purchased >= actualPlayerQty) break;
                    if (market.currentStock > 0) {
                        const qty = Math.min(actualPlayerQty - purchased, market.currentStock);
                        market.currentStock -= qty;
                        purchased += qty;
                    }
                }

                const overseasMarket = gameState.markets.find(m => m.name === '海外');
                if (purchased < actualPlayerQty && overseasMarket) {
                    const qty = actualPlayerQty - purchased;
                    overseasMarket.currentStock = Math.max(0, overseasMarket.currentStock - qty);
                    purchased += qty;
                }

                playerCompany.cash -= cost;
                playerCompany.materials += actualPlayerQty;
                playerCompany.totalMaterialCost += cost;
                playerPurchased = true;

                logAction(0, '各社共通', `¥12×${actualPlayerQty}個購入`, -cost, true);

                let msg = `あなた: ${actualPlayerQty}個購入（¥${cost}）`;
                if (actualPlayerQty < playerQty) {
                    msg += `（上限により${playerQty - actualPlayerQty}個制限）`;
                }
                purchaseLog.push(msg);
            } else {
                purchaseLog.push('あなた: 現金不足で購入できず');
            }
        }
    } else {
        purchaseLog.push('あなた: 購入しない');
    }

    for (let i = 1; i < gameState.companies.length; i++) {
        const company = gameState.companies[i];
        const maxAffordable = Math.min(3, Math.floor(company.cash / 12));

        // ★★★ 3期以降は製造能力が購入上限 ★★★
        const aiMfgCapacity = getManufacturingCapacity(company);
        const isPeriod2 = gameState.currentPeriod === 2;
        const aiMaxByMfg = isPeriod2 ? 99 : aiMfgCapacity;

        // ★★★ 材料容量チェック ★★★
        const aiMaxMaterialCapacity = getMaterialCapacity(company);
        const aiSpaceAvailable = aiMaxMaterialCapacity - company.materials;

        // 実際に購入できる数量を計算
        const aiWantQty = maxAffordable >= 2 ? maxAffordable : 0;
        const aiActualQty = Math.min(aiWantQty, aiMaxByMfg, aiSpaceAvailable);

        if (aiActualQty > 0) {
            let purchased = 0;

            for (const market of gameState.markets) {
                if (purchased >= aiActualQty) break;
                if (market.currentStock > 0) {
                    const qty = Math.min(aiActualQty - purchased, market.currentStock);
                    market.currentStock -= qty;
                    purchased += qty;
                }
            }

            const overseasMarket = gameState.markets.find(m => m.name === '海外');
            if (purchased < aiActualQty && overseasMarket) {
                const qty = aiActualQty - purchased;
                overseasMarket.currentStock = Math.max(0, overseasMarket.currentStock - qty);
                purchased += qty;
            }

            if (purchased > 0) {
                const aiCost = purchased * 12;
                company.cash -= aiCost;
                company.materials += purchased;
                company.totalMaterialCost += aiCost;

                logAction(i, '各社共通', `¥12×${purchased}個購入`, -aiCost, false);

                purchaseLog.push(`${company.name}: ${purchased}個購入（¥${aiCost}）`);
            }
        }
    }

    closeModal();
    updateDisplay();

    if (purchaseLog.length > 0) {
        alert('【各社共通購入結果】\n' + purchaseLog.join('\n'));
    } else {
        alert('どの会社も購入しませんでした');
    }

    if (playerPurchased) {
        endTurn();
    } else {
        nextTurn();
    }
}
